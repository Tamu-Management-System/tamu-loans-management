import { useEffect, useId, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { useOfficers } from "../../api/borrowers";
import { LOANS_PAGE_SIZE, useLoanList, type LoanListParams } from "../../api/loans";
import type { LoanListItem, LoanListTab } from "../../api/types";
import { useAuth } from "../../auth/AuthContext";
import { Icon } from "../../components/ui/Icon";
import { Pagination } from "../../components/ui/Pagination";
import { SEARCH_FROM, Select } from "../../components/ui/Select";
import { formatDate, formatShortDate, formatUGX } from "../../lib/format";
import { ToDisbursePage } from "./ToDisbursePage";
import { useLatest } from "../../lib/useLatest";
import { useSystemSettings } from "../../api/settings";
import styles from "./LoansPage.module.css";

export type LoansTab = "to-disburse" | LoanListTab;

const TITLES: Record<LoanListTab, string> = {
  active: "Active loans",
  recovery: "In recovery",
  cleared: "Cleared loans",
  all: "All loans",
};
const SEARCH_DEBOUNCE_MS = 300;
const FREQUENCY = {
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
} as const;

/** Search, officer, late-only and page, kept in the address so Back and shared links work. */
function useLoanFilters(tab: LoanListTab) {
  const [searchParams, setSearchParams] = useSearchParams();
  const params: LoanListParams = {
    tab,
    query: searchParams.get("q") ?? "",
    officerId: searchParams.get("officer"),
    lateOnly: (tab === "active" || tab === "all") && searchParams.get("late") === "1",
    page: Math.max(1, Number(searchParams.get("page")) || 1),
  };
  const update = (changes: Partial<Omit<LoanListParams, "tab">>) =>
    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current);
        const set = (key: string, value: string | null | undefined) => (value ? next.set(key, value) : next.delete(key));
        if ("query" in changes) set("q", changes.query?.trim());
        if ("officerId" in changes) set("officer", changes.officerId);
        if ("lateOnly" in changes) set("late", changes.lateOnly ? "1" : null);
        set("page", changes.page && changes.page > 1 ? String(changes.page) : null);
        return next;
      },
      { replace: "query" in changes },
    );
  return { params, update };
}

/**
 * Loans (user flow, phase 5): each link in the Loans menu is its own page (to pay out, being repaid,
 * repaid, all). Officers see their own loans; Finance and admins the branch.
 */
export function LoansPage({ tab }: { tab: LoansTab }) {
  return tab === "to-disburse" ? <ToDisbursePage /> : <LoanListPage tab={tab} />;
}

function LoanListPage({ tab }: { tab: LoanListTab }) {
  const { seesBranch } = useAuth();
  const navigate = useNavigate();
  const searchId = useId();
  const branchWide = seesBranch;
  const { params, update } = useLoanFilters(tab);
  const { data, isPending, isError, isFetching, refetch } = useLoanList(params);
  const { data: officers = [] } = useOfficers(branchWide);

  // The timer below runs later: it must use the latest update (and so the latest address)

  const latestUpdate = useLatest(update);

  const [searchInput, setSearchInput] = useState(params.query);
  useEffect(() => {
    if (searchInput.trim() === params.query) return;
    const timer = window.setTimeout(() => latestUpdate.current({ query: searchInput }), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only react to typing
  }, [searchInput]);

  return (
    <>
      <div className={styles.header}>
        <h1>{TITLES[tab]}</h1>
        <p className={styles.subtitle}>{tab === "recovery" ? "Loans handed to the recovery team" : branchWide ? "Every loan in the branch" : "Loans in your portfolio"}</p>
      </div>

      <div className={styles.card}>
        <div className={styles.filters}>
          <label className={styles.search} htmlFor={searchId}>
            <Icon name="search" size={17} strokeWidth={1.8} />
            <input
              id={searchId}
              type="search"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Search loan ID, borrower or phone"
              aria-label="Search loans by loan ID, borrower name or phone"
              autoComplete="off"
            />
          </label>
          {branchWide && (
            <Select
              className={styles.select}
              value={params.officerId ?? ""}
              onChange={(officerId) => update({ officerId: officerId || null })}
              options={[{ value: "", label: "All officers" }, ...officers.map((officer) => ({ value: officer.id, label: officer.name }))]}
              searchable={officers.length > SEARCH_FROM}
              searchPlaceholder="Search officers"
              aria-label="Loan officer"
            />
          )}
          {(tab === "active" || tab === "all") && (
            <button
              type="button"
              className={`${styles.toggle} ${params.lateOnly ? styles.toggleOn : ""}`}
              aria-pressed={params.lateOnly}
              onClick={() => update({ lateOnly: !params.lateOnly })}
            >
              Late only
            </button>
          )}
        </div>

        {data && <Totals tab={tab} totals={data.totals} />}

        {isError ? (
          <p className={styles.message} role="alert">
            Loans couldn't load.{" "}
            <button type="button" className={styles.linkButton} onClick={() => refetch()}>
              Try again
            </button>
          </p>
        ) : isPending ? (
          <div className={styles.loading} aria-busy="true" aria-label="Loading loans" />
        ) : data.items.length === 0 ? (
          <p className={styles.message}>
            {params.query || params.officerId || params.lateOnly ? (
              <>
                No loans match these filters.{" "}
                <button
                  type="button"
                  className={styles.linkButton}
                  onClick={() => {
                    setSearchInput("");
                    update({ query: "", officerId: null, lateOnly: false });
                  }}
                >
                  Clear filters
                </button>
              </>
            ) : tab === "recovery" ? (
              "No loans with the recovery team."
            ) : tab === "cleared" ? (
              "No cleared loans yet."
            ) : (
              "No loans yet."
            )}
          </p>
        ) : (
          <>
            <table className={`${styles.table} ${isFetching ? styles.refreshing : ""}`}>
              <thead>
                <tr>
                  <th>LOAN</th>
                  <th>BORROWER</th>
                  <th className={styles.numeric}>BORROWED</th>
                  <th className={styles.numeric}>BALANCE</th>
                  <th className={styles.statusHeading}>{tab === "cleared" ? "REPAYMENT" : tab === "recovery" ? "RECOVERY" : "NEXT PAYMENT"}</th>
                  {branchWide && <th>OFFICER</th>}
                </tr>
              </thead>
              <tbody>
                {data.items.map((loan) => (
                  <tr key={loan.id} className={styles.row} onClick={() => navigate(`/loans/${loan.id}`)}>
                    <td className={styles.loan}>
                      {/* The link gives keyboard and screen-reader access; the whole row is also clickable */}
                      <Link to={`/loans/${loan.id}`} className={styles.strongLink} onClick={(event) => event.stopPropagation()}>
                        {loan.id}
                      </Link>
                      <span className={styles.secondary}>
                        {loan.repaymentSchedule ? `${FREQUENCY[loan.repaymentSchedule]} · ` : ""}
                        from {formatShortDate(loan.disbursedOn)}
                      </span>
                    </td>
                    <td>
                      <span className={styles.borrowerName}>{loan.borrower.name}</span>
                      <span className={styles.secondary}>{loan.borrower.id}</span>
                    </td>
                    <td className={styles.numeric}>{formatUGX(loan.principal)}</td>
                    <td className={`${styles.numeric} ${styles.balance}`}>
                      {loan.status === "cleared" ? <span className={styles.secondary}>Repaid</span> : formatUGX(loan.balance)}
                    </td>
                    <td className={styles.status}>
                      <LoanStatus loan={loan} recoveryList={tab === "recovery"} />
                    </td>
                    {branchWide && <td className={styles.officer}>{loan.officer.name}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
            <Pagination page={data.page} pageSize={LOANS_PAGE_SIZE} total={data.total} noun="loans" onPageChange={(page) => update({ page })} />
          </>
        )}
      </div>
    </>
  );
}

/** Next payment for loans being repaid; how it went for cleared ones. */
function LoanStatus({ loan, recoveryList }: { loan: LoanListItem; recoveryList: boolean }) {
  // How late is "seriously late", and when recovery is suggested: Settings → Loan rules
  const { data: settings } = useSystemSettings();
  const seriouslyLate = settings?.loanRules.seriouslyLateDays ?? 30;
  // Only when recovery is suggested; sent automatically, they're already in recovery
  const recoveryAfter = settings?.loanRules.recoveryMode === "suggest" ? (settings.loanRules.recoveryAfterDaysLate ?? null) : null;
  if (loan.recovery) {
    return (
      <>
        <span className={`${styles.chip} ${styles.chipRecovery}`}>In recovery</span>
        <span className={styles.secondary}>
          {recoveryList ? `Since ${formatShortDate(loan.recovery.since)} · ${loan.recovery.reason}` : `${loan.daysPastDue} days late · ${formatUGX(loan.arrearsAmount)} overdue`}
        </span>
      </>
    );
  }
  if (loan.status === "cleared") {
    return (
      <>
        <span className={`${styles.chip} ${loan.mostDaysLate > 0 ? styles.chipWarning : styles.chipNeutral}`}>
          {loan.mostDaysLate > 0 ? `Was ${loan.mostDaysLate} days late` : "On time"}
        </span>
        <span className={styles.secondary}>Cleared {loan.clearedOn ? formatDate(loan.clearedOn) : ""}</span>
      </>
    );
  }
  if (loan.status === "in-arrears") {
    return (
      <>
        <span className={`${styles.chip} ${loan.daysPastDue >= seriouslyLate ? styles.chipDanger : styles.chipWarning}`}>{loan.daysPastDue} days late</span>
        {recoveryAfter !== null && loan.daysPastDue >= recoveryAfter && <span className={`${styles.chip} ${styles.chipRecovery} ${styles.chipStacked}`}>Ready for recovery</span>}
        <span className={styles.secondary}>{formatUGX(loan.arrearsAmount)} overdue</span>
      </>
    );
  }
  return (
    <>
      <b className={styles.nextAmount}>{loan.nextPayment ? formatUGX(loan.nextPayment.amount) : "—"}</b>
      <span className={styles.secondary}>{loan.nextPayment ? `due ${formatShortDate(loan.nextPayment.dueOn)}` : ""}</span>
    </>
  );
}

function Totals({
  tab,
  totals,
}: {
  tab: LoanListTab;
  totals: {
    loans: number;
    outstanding: number;
    late: number;
    overdue: number;
    repaid: number;
  };
}) {
  const facts: [string, string][] =
    tab === "recovery"
      ? [
          ["In recovery", totals.loans.toLocaleString("en-US")],
          ["Outstanding", formatUGX(totals.outstanding)],
          ["Overdue", formatUGX(totals.overdue)],
        ]
      : tab === "cleared"
      ? [
          ["Loans cleared", totals.loans.toLocaleString("en-US")],
          ["Total repaid", formatUGX(totals.repaid)],
        ]
      : [
          [tab === "all" ? "Loans" : "Active loans", totals.loans.toLocaleString("en-US")],
          ["Outstanding", formatUGX(totals.outstanding)],
          ["Late", totals.late.toLocaleString("en-US")],
          ["Overdue", formatUGX(totals.overdue)],
        ];
  return (
    <dl className={styles.totals} aria-label="Totals">
      {facts.map(([label, value]) => (
        <div key={label} className={label === "Late" || label === "Overdue" ? (totals.late > 0 ? styles.totalAlert : "") : ""}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}
