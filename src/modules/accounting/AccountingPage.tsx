import { Link, useSearchParams } from "react-router";
import { usePayouts } from "../../api/accounting";
import { PAYMENTS_PAGE_SIZE, usePaymentList } from "../../api/payments";
import { useAuth } from "../../auth/AuthContext";
import { Pagination } from "../../components/ui/Pagination";
import { RANGES, rangeDates, type Range } from "../../lib/dateRange";
import { formatShortDate, formatTime, formatUGX, toDateInputValue } from "../../lib/format";
import paymentStyles from "../payments/PaymentsPage.module.css";
import styles from "./AccountingPage.module.css";

type Tab = "receipts" | "payouts";

/**
 * Accounting: the money in (repayments) and out (payouts) for a period, side by side.
 * Officers see their own clients; Finance and admins the market.
 */
export function AccountingPage() {
  const { seesBranch } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const rangeParam = searchParams.get("range") as Range | null;
  const range: Range = RANGES.some((option) => option.value === rangeParam) ? rangeParam! : "month";
  const { from, to } = rangeDates(range, searchParams.get("from"), searchParams.get("to"));
  const tab: Tab = searchParams.get("tab") === "payouts" ? "payouts" : "receipts";
  const page = Math.max(1, Number(searchParams.get("page")) || 1);

  const update = (changes: Record<string, string | null>) =>
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      Object.entries(changes).forEach(([key, value]) => (value ? next.set(key, value) : next.delete(key)));
      if (!("page" in changes)) next.delete("page");
      return next;
    });

  const receipts = usePaymentList({ from, to, query: "", officerId: null, method: null, page });
  const payouts = usePayouts(from, to);
  const moneyIn = receipts.data?.totals.collected;
  const moneyOut = payouts.data?.totals.paidOut;

  return (
    <>
      <div className={paymentStyles.header}>
        <div>
          <h1>Accounting</h1>
          <p className={paymentStyles.subtitle}>{seesBranch ? "Money in and out across the market" : "Money in and out for your clients"}</p>
        </div>
      </div>

      <div className={paymentStyles.card}>
        <div className={paymentStyles.toolbar}>
          <div className={paymentStyles.ranges} role="group" aria-label="Dates">
            {RANGES.map((option) => (
              <button
                key={option.value}
                type="button"
                aria-pressed={range === option.value}
                onClick={() => update({ range: option.value === "month" ? null : option.value, ...(option.value === "custom" ? { from, to } : { from: null, to: null }) })}
              >
                {option.label}
              </button>
            ))}
          </div>
          {range === "custom" && (
            <div className={paymentStyles.custom}>
              <label>
                From
                <input type="date" value={from} max={to} onChange={(event) => update({ from: event.target.value || null })} />
              </label>
              <label>
                To
                <input type="date" value={to} min={from} max={toDateInputValue(new Date())} onChange={(event) => update({ to: event.target.value || null })} />
              </label>
            </div>
          )}
        </div>

        <dl className={paymentStyles.totals} aria-label="Totals">
          <div>
            <dt>Money in</dt>
            <dd>{moneyIn === undefined ? "…" : formatUGX(moneyIn)}</dd>
          </div>
          <div>
            <dt>Money out</dt>
            <dd>{moneyOut === undefined ? "…" : formatUGX(moneyOut)}</dd>
          </div>
          <div>
            <dt>Difference</dt>
            <dd>{moneyIn === undefined || moneyOut === undefined ? "…" : formatUGX(moneyIn - moneyOut)}</dd>
          </div>
          {receipts.data &&
            Object.entries(receipts.data.totals.byMethod).map(([method, amount]) => (
              <div key={method}>
                <dt>{method}</dt>
                <dd>{formatUGX(amount)}</dd>
              </div>
            ))}
        </dl>

        <div className={styles.tabs} role="tablist" aria-label="Money in and out">
          <button type="button" role="tab" aria-selected={tab === "receipts"} onClick={() => update({ tab: null })}>
            Money in{receipts.data ? ` (${receipts.data.total})` : ""}
          </button>
          <button type="button" role="tab" aria-selected={tab === "payouts"} onClick={() => update({ tab: "payouts" })}>
            Money out{payouts.data ? ` (${payouts.data.total})` : ""}
          </button>
        </div>

        {tab === "receipts" ? (
          receipts.isPending ? (
            <p className={styles.empty} aria-busy="true">
              Loading…
            </p>
          ) : receipts.isError ? (
            <p className={styles.empty}>
              The payments didn't load. <button type="button" className={paymentStyles.linkButton} onClick={() => receipts.refetch()}>Try again</button>
            </p>
          ) : receipts.data.items.length === 0 ? (
            <p className={styles.empty}>No repayments in these dates.</p>
          ) : (
            <>
              <table className={paymentStyles.table}>
                <thead>
                  <tr>
                    <th>DATE</th>
                    <th>CLIENT</th>
                    <th>METHOD</th>
                    <th className={styles.numeric}>AMOUNT</th>
                  </tr>
                </thead>
                <tbody>
                  {receipts.data.items.map((payment) => (
                    <tr key={payment.id}>
                      <td>
                        {formatShortDate(payment.paidAt)}
                        <span className={paymentStyles.secondary}>{formatTime(payment.paidAt)}</span>
                      </td>
                      <td>
                        <Link to={`/loans/${payment.loanId}`} className={paymentStyles.strongLink}>
                          {payment.borrower.name}
                        </Link>
                        <span className={paymentStyles.secondary}>{payment.loanId}</span>
                      </td>
                      <td>
                        {payment.method}
                        {payment.reference && <span className={paymentStyles.secondary}>{payment.reference}</span>}
                      </td>
                      <td className={styles.numeric}>{formatUGX(payment.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <Pagination page={receipts.data.page} pageSize={PAYMENTS_PAGE_SIZE} total={receipts.data.total} noun="payments" onPageChange={(next) => update({ page: String(next) })} />
            </>
          )
        ) : payouts.isPending ? (
          <p className={styles.empty} aria-busy="true">
            Loading…
          </p>
        ) : payouts.isError ? (
          <p className={styles.empty}>
            The payouts didn't load. <button type="button" className={paymentStyles.linkButton} onClick={() => payouts.refetch()}>Try again</button>
          </p>
        ) : payouts.data.items.length === 0 ? (
          <p className={styles.empty}>No loans were paid out in these dates.</p>
        ) : (
          <table className={paymentStyles.table}>
            <thead>
              <tr>
                <th>DATE</th>
                <th>CLIENT</th>
                <th>METHOD</th>
                <th>PAID BY</th>
                <th className={styles.numeric}>AMOUNT</th>
              </tr>
            </thead>
            <tbody>
              {payouts.data.items.map((payout) => (
                <tr key={payout.loanId}>
                  <td>{formatShortDate(payout.paidOn)}</td>
                  <td>
                    <Link to={`/loans/${payout.loanId}`} className={paymentStyles.strongLink}>
                      {payout.borrower.name}
                    </Link>
                    <span className={paymentStyles.secondary}>{payout.loanId}</span>
                  </td>
                  <td>
                    {payout.method}
                    <span className={paymentStyles.secondary}>{payout.reference}</span>
                  </td>
                  <td>{payout.by}</td>
                  <td className={styles.numeric}>{formatUGX(payout.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
