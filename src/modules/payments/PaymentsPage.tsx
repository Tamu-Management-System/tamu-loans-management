import { useEffect, useId, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { useOfficers } from "../../api/borrowers";
import { PAYMENTS_PAGE_SIZE, usePaymentList, type PaymentListParams } from "../../api/payments";
import type { PaymentListItem } from "../../api/types";
import { useAuth } from "../../auth/AuthContext";
import { Button } from "../../components/ui/Button";
import { Icon } from "../../components/ui/Icon";
import { Pagination } from "../../components/ui/Pagination";
import { SEARCH_FROM, Select } from "../../components/ui/Select";
import { RANGES, rangeDates, type Range } from "../../lib/dateRange";
import { formatShortDate, formatTime, formatUGX, toDateInputValue } from "../../lib/format";
import { useAnnounce } from "../dashboard/useAnnounce";
import { EditedNote } from "./EditedNote";
import { EditPaymentDialog } from "./EditPaymentDialog";
import { RecordPaymentDialog } from "./RecordPaymentDialog";
import { useLatest } from "../../lib/useLatest";
import styles from "./PaymentsPage.module.css";

const METHODS = ["MTN MoMo", "Airtel Money", "Cash"] as const;
const SEARCH_DEBOUNCE_MS = 300;

/** Range, dates, search, officer, method and page, kept in the address. */
function usePaymentFilters() {
  const [searchParams, setSearchParams] = useSearchParams();
  const rangeParam = searchParams.get("range") as Range | null;
  const range: Range = RANGES.some((r) => r.value === rangeParam) ? rangeParam! : "today";
  const dates = rangeDates(range, searchParams.get("from"), searchParams.get("to"));
  const params: PaymentListParams = {
    ...dates,
    query: searchParams.get("q") ?? "",
    officerId: searchParams.get("officer"),
    method: searchParams.get("method"),
    page: Math.max(1, Number(searchParams.get("page")) || 1),
  };
  const update = (changes: Record<string, string | null>, replace = false) =>
    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current);
        Object.entries(changes).forEach(([key, value]) => (value ? next.set(key, value) : next.delete(key)));
        if (!("page" in changes)) next.delete("page");
        return next;
      },
      { replace },
    );
  return { range, params, update };
}

/** Payments (user flow, phase 6): every repayment and what was collected. Officers see their own clients; Finance and admins the branch. */
export function PaymentsPage() {
  const { can, seesBranch } = useAuth();
  const searchId = useId();
  const announce = useAnnounce();
  const [editing, setEditing] = useState<PaymentListItem | null>(null);
  const branchWide = seesBranch;
  const { range, params, update } = usePaymentFilters();
  const { data, isPending, isError, isFetching, refetch } = usePaymentList(params);
  const { data: officers = [] } = useOfficers(branchWide);
  const [recording, setRecording] = useState(false);

  // The timer below runs later: it must use the latest update (and so the latest address)

  const latestUpdate = useLatest(update);

  const [searchInput, setSearchInput] = useState(params.query);
  useEffect(() => {
    if (searchInput.trim() === params.query) return;
    const timer = window.setTimeout(() => latestUpdate.current({ q: searchInput.trim() || null }, true), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only react to typing
  }, [searchInput]);

  const totals = data?.totals;
  return (
    <>
      <div className={styles.header}>
        <div>
          <h1>Payments</h1>
          <p className={styles.subtitle}>{branchWide ? "Repayments across the market" : "Repayments from your clients"}</p>
        </div>
        {can("payments.record") && <Button onClick={() => setRecording(true)}>Record payment</Button>}
      </div>

      <div className={styles.card}>
        <div className={styles.toolbar}>
          <div className={styles.ranges} role="group" aria-label="Dates">
            {RANGES.map((option) => (
              <button
                key={option.value}
                type="button"
                aria-pressed={range === option.value}
                onClick={() => update({ range: option.value === "today" ? null : option.value, ...(option.value === "custom" ? { from: params.from, to: params.to } : { from: null, to: null }) })}
              >
                {option.label}
              </button>
            ))}
          </div>
          {range === "custom" && (
            <div className={styles.custom}>
              <label>
                From
                <input type="date" value={params.from} max={params.to} onChange={(event) => update({ from: event.target.value || null })} />
              </label>
              <label>
                To
                <input type="date" value={params.to} min={params.from} max={toDateInputValue(new Date())} onChange={(event) => update({ to: event.target.value || null })} />
              </label>
            </div>
          )}
        </div>

        <div className={styles.filters}>
          <label className={styles.search} htmlFor={searchId}>
            <Icon name="search" size={17} strokeWidth={1.8} />
            <input
              id={searchId}
              type="search"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Search client, loan ID, phone or transaction ID"
              aria-label="Search payments by client, loan ID, phone or transaction ID"
              autoComplete="off"
            />
          </label>
          {branchWide && (
            <Select
              className={styles.select}
              value={params.officerId ?? ""}
              onChange={(officerId) => update({ officer: officerId || null })}
              options={[{ value: "", label: "All officers" }, ...officers.map((officer) => ({ value: officer.id, label: officer.name }))]}
              searchable={officers.length > SEARCH_FROM}
              searchPlaceholder="Search officers"
              aria-label="Loan officer"
            />
          )}
          <Select
            className={styles.select}
            value={params.method ?? ""}
            onChange={(method) => update({ method: method || null })}
            options={[{ value: "", label: "All methods" }, ...METHODS.map((method) => ({ value: method, label: method }))]}
            aria-label="Method"
          />
        </div>

        {totals && (
          <dl className={styles.totals} aria-label="Totals">
            <div>
              <dt>Collected</dt>
              <dd className={styles.collected}>{formatUGX(totals.collected)}</dd>
            </div>
            <div>
              <dt>Payments</dt>
              <dd>{totals.payments.toLocaleString("en-US")}</dd>
            </div>
            {METHODS.map((method) => (
              <div key={method}>
                <dt>{method}</dt>
                <dd>{formatUGX(totals.byMethod[method])}</dd>
              </div>
            ))}
          </dl>
        )}

        {isError ? (
          <p className={styles.message} role="alert">
            Payments couldn't load.{" "}
            <button type="button" className={styles.linkButton} onClick={() => refetch()}>
              Try again
            </button>
          </p>
        ) : isPending ? (
          <div className={styles.loading} aria-busy="true" aria-label="Loading payments" />
        ) : data.items.length === 0 ? (
          <p className={styles.message}>{params.query || params.method || params.officerId ? "No payments match these filters." : "No payments in these dates."}</p>
        ) : (
          <>
            <table className={`${styles.table} ${isFetching ? styles.refreshing : ""}`}>
              <thead>
                <tr>
                  <th>WHEN</th>
                  <th>CLIENT</th>
                  <th>AMOUNT</th>
                  <th>METHOD</th>
                  {/* Officers mostly see payments they recorded themselves */}
                  {branchWide && <th>RECORDED BY</th>}
                  {data.items.some((payment) => payment.canEdit) && <th aria-label="Change"></th>}
                </tr>
              </thead>
              <tbody>
                {data.items.map((payment) => (
                  <tr key={payment.id}>
                    <td className={styles.when}>
                      {formatShortDate(payment.paidAt)}
                      <span className={styles.secondary}>{formatTime(payment.paidAt)}</span>
                    </td>
                    <td>
                      <Link to={`/borrowers/${payment.borrower.id}`} className={styles.strongLink}>
                        {payment.borrower.name}
                      </Link>
                      <Link to={`/loans/${payment.loanId}`} className={styles.secondaryLink}>
                        {payment.loanId}
                      </Link>
                    </td>
                    <td className={styles.amount}>
                      {formatUGX(payment.amount)}
                      <EditedNote payment={payment} />
                    </td>
                    <td className={styles.method}>
                      {payment.method}
                      {payment.reference && <span className={styles.secondary}>{payment.reference}</span>}
                    </td>
                    {branchWide && (
                      <td className={styles.recordedBy}>
                        {payment.recordedBy}
                        {payment.recordedBy !== payment.officer.name && <span className={styles.secondary}>Officer: {payment.officer.name}</span>}
                      </td>
                    )}
                    {data.items.some((item) => item.canEdit) && (
                      <td className={styles.changeCell}>
                        {payment.canEdit && (
                          <button type="button" className={styles.linkButton} onClick={() => setEditing(payment)}>
                            Edit payment
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
            <Pagination page={data.page} pageSize={PAYMENTS_PAGE_SIZE} total={data.total} noun="payments" onPageChange={(page) => update({ page: page > 1 ? String(page) : null })} />
          </>
        )}
      </div>

      {recording && <RecordPaymentDialog onClose={() => setRecording(false)} onRecorded={announce} />}
      {editing && <EditPaymentDialog payment={editing} loanId={editing.loanId} clientName={editing.borrower.name} onClose={() => setEditing(null)} onChanged={(message) => announce(message)} />}
    </>
  );
}
