import { useEffect, useId, useState } from "react";
import { Link, useNavigate } from "react-router";
import { APPLICATIONS_PAGE_SIZE, useApplicationList } from "../../api/applications";
import type { ApplicationListItem, ApplicationStatus } from "../../api/types";
import { useAuth } from "../../auth/AuthContext";
import { Icon } from "../../components/ui/Icon";
import { Pagination } from "../../components/ui/Pagination";
import { formatRelativeDay, formatUGX } from "../../lib/format";
import { useApplicationListParams } from "./useApplicationListParams";
import { useLatest } from "../../lib/useLatest";
import styles from "./ApplicationsPage.module.css";

const SEARCH_DEBOUNCE_MS = 300;

const TABS: { status: ApplicationStatus; label: string; empty: string }[] = [
  { status: "draft", label: "Drafts", empty: "No drafts. Applications saved as drafts, or sent back by an approver, appear here." },
  { status: "awaiting-borrower", label: "Waiting for borrower", empty: "No online applications waiting. Ones sent as a link appear here until the borrower submits." },
  { status: "submitted", label: "Waiting for approval", empty: "Nothing waiting for approval." },
  { status: "approved", label: "Approved", empty: "No approved applications yet." },
  { status: "rejected", label: "Rejected", empty: "No rejected applications." },
];

const PER = { daily: "daily", weekly: "weekly", monthly: "monthly" } as const;

/** What happens next, under the status chip. */
function statusDetail(item: ApplicationListItem) {
  switch (item.status) {
    case "draft":
      return item.returned ? `Sent back: ${item.returned.reason}` : (item.missing ?? "Ready to submit");
    case "awaiting-borrower":
      return `Link sent ${formatRelativeDay(item.createdAt)}`;
    case "submitted":
      return `Submitted ${formatRelativeDay(item.submittedAt ?? item.createdAt)}`;
    case "approved":
      if (item.loanId) return `Paid out as ${item.loanId}`;
      return item.decided ? `By ${item.decided.by}, ${formatRelativeDay(item.decided.at)}` : "";
    case "rejected":
      return item.returned ? `${item.returned.reason} · ${item.returned.by}` : "";
  }
}

function ApplicationStatusChip({ status, returned }: { status: ApplicationStatus; returned: boolean }) {
  const label = { draft: returned ? "Sent back" : "Draft", "awaiting-borrower": "Waiting for borrower", submitted: "Waiting for approval", approved: "Approved", rejected: "Rejected" }[status];
  const tone = { draft: returned ? styles.chipWarning : styles.chipNeutral, "awaiting-borrower": styles.chipInfo, submitted: styles.chipInfo, approved: styles.chipSuccess, rejected: styles.chipDanger }[status];
  return <span className={`${styles.chip} ${tone}`}>{label}</span>;
}

/**
 * Applications (user flow, phase 4): drafts to finish, online applications waiting for the borrower,
 * and submitted ones waiting for approval. Officers see their own; approvers see the branch.
 */
export function ApplicationsPage() {
  const { can, seesBranch } = useAuth();
  const navigate = useNavigate();
  const searchId = useId();
  const approver = can("applications.approve");
  const branchWide = approver || seesBranch;
  const { params, update } = useApplicationListParams(approver ? "submitted" : "draft");
  const { data, isPending, isError, isFetching, refetch } = useApplicationList(params);

  // The timer below runs later: it must use the latest update (and so the latest address)

  const latestUpdate = useLatest(update);

  const [searchInput, setSearchInput] = useState(params.query);
  useEffect(() => {
    if (searchInput.trim() === params.query) return;
    const timer = window.setTimeout(() => latestUpdate.current({ query: searchInput }), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only react to typing
  }, [searchInput]);

  const tab = TABS.find((t) => t.status === params.status)!;

  return (
    <>
      <div className={styles.header}>
        <div>
          <h1>Applications</h1>
          <p className={styles.subtitle}>{branchWide ? "Every application in the branch" : "Your applications"}</p>
        </div>
        {can("applications.create") && (
          <Link to="/applications/new" className={styles.newApplication}>
            New application
          </Link>
        )}
      </div>

      <div className={styles.card}>
        <label className={styles.search} htmlFor={searchId}>
          <Icon name="search" size={17} strokeWidth={1.8} />
          <input
            id={searchId}
            type="search"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Search application ID, borrower or phone"
            aria-label="Search applications by ID, borrower name or phone"
            autoComplete="off"
          />
        </label>

        <div className={styles.tabs} role="tablist" aria-label="Application status">
          {TABS.map((t) => (
            <button key={t.status} role="tab" aria-selected={params.status === t.status} onClick={() => update({ status: t.status })}>
              {t.label} <span className={styles.tabCount}>{data ? data.counts[t.status] : "–"}</span>
            </button>
          ))}
        </div>

        {isError ? (
          <p className={styles.message} role="alert">
            Applications couldn't load.{" "}
            <button type="button" className={styles.linkButton} onClick={() => refetch()}>
              Try again
            </button>
          </p>
        ) : isPending ? (
          <div className={styles.loading} aria-busy="true" aria-label="Loading applications" />
        ) : data.items.length === 0 ? (
          <p className={styles.message}>
            {params.query ? (
              <>
                No applications match “{params.query}”.{" "}
                <button
                  type="button"
                  className={styles.linkButton}
                  onClick={() => {
                    setSearchInput("");
                    update({ query: "" });
                  }}
                >
                  Clear search
                </button>
              </>
            ) : (
              tab.empty
            )}
          </p>
        ) : (
          <>
            <table className={`${styles.table} ${isFetching ? styles.refreshing : ""}`}>
              <thead>
                <tr>
                  <th>APPLICATION</th>
                  <th>BORROWER</th>
                  <th className={styles.numeric}>AMOUNT</th>
                  <th className={styles.statusHeading}>STATUS</th>
                  {branchWide && <th>OFFICER</th>}
                </tr>
              </thead>
              <tbody>
                {data.items.map((item) => (
                  <tr key={item.id} className={styles.row} onClick={() => navigate(`/applications/${item.id}`)}>
                    <td className={styles.application}>
                      {/* The link gives keyboard and screen-reader access; the whole row is also clickable */}
                      <Link to={`/applications/${item.id}`} className={styles.applicationId} onClick={(event) => event.stopPropagation()}>
                        {item.id}
                      </Link>
                      <span className={styles.secondary}>{item.route === "online" ? "Online" : "Paper forms"}</span>
                    </td>
                    <td className={styles.borrowerCell}>
                      <span className={styles.borrowerName}>{item.borrower.id || item.status !== "awaiting-borrower" ? item.borrower.name : "New borrower"}</span>
                      <span className={styles.secondary}>{item.borrower.id ?? (item.route === "online" && item.status === "awaiting-borrower" ? "Fills in their details online" : "Not registered")}</span>
                    </td>
                    <td className={`${styles.numeric} ${styles.amount}`}>
                      <b>{formatUGX(item.amount)}</b>
                      <span className={styles.secondary}>
                        {item.terms.numberOfPayments} {PER[item.terms.repaymentSchedule]} × {formatUGX(item.terms.instalment)}
                      </span>
                    </td>
                    <td className={styles.status}>
                      <ApplicationStatusChip status={item.status} returned={!!item.returned} />
                      <span className={`${styles.secondary} ${item.status === "draft" && (item.missing || item.returned) ? styles.attention : ""}`}>{statusDetail(item)}</span>
                    </td>
                    {branchWide && <td className={styles.officer}>{item.officer.name}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
            <Pagination page={data.page} pageSize={APPLICATIONS_PAGE_SIZE} total={data.total} noun="applications" onPageChange={(page) => update({ page })} />
          </>
        )}
      </div>
    </>
  );
}
