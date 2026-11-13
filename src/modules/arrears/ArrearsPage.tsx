import { useState } from "react";
import { Link, useSearchParams } from "react-router";
import { useLoanList } from "../../api/loans";
import { useArrearsBreakdown } from "../../api/portfolio";
import { TEXTS_PAGE_SIZE, useSentTexts } from "../../api/texts";
import type { LoanListItem } from "../../api/types";
import { useAuth } from "../../auth/AuthContext";
import { Button } from "../../components/ui/Button";
import { Pagination } from "../../components/ui/Pagination";
import { LOANS_PAGE_SIZE } from "../../api/loans";
import { dayCount, formatShortDate, formatTime, formatUGX } from "../../lib/format";
import loanStyles from "../loans/LoansPage.module.css";
import { SendTextDialog } from "./SendTextDialog";
import styles from "./ArrearsPage.module.css";

type Tab = "late" | "texts";

/**
 * Arrears & SMS: the loans that are late, how late the money is by age, and the texts sent to clients.
 * Officers see their own clients; Finance and admins the market.
 */
export function ArrearsPage() {
  const { can, seesBranch } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab: Tab = searchParams.get("tab") === "texts" ? "texts" : "late";
  const page = Math.max(1, Number(searchParams.get("page")) || 1);
  const [texting, setTexting] = useState<LoanListItem | null>(null);
  const { data: arrears } = useArrearsBreakdown();
  const loans = useLoanList({ tab: "active", query: "", officerId: null, lateOnly: true, page });
  const texts = useSentTexts(page, tab === "texts");

  const choose = (next: Tab) => setSearchParams(next === "late" ? {} : { tab: next });
  const goToPage = (next: number) => setSearchParams((current) => ({ ...Object.fromEntries(current), page: String(next) }));
  const canText = can("sms.send");

  return (
    <>
      <div className={loanStyles.header}>
        <h1>Arrears &amp; SMS</h1>
        <p className={loanStyles.subtitle}>{seesBranch ? "Late loans across the market, and the texts sent to clients" : "Your late loans, and the texts sent to your clients"}</p>
      </div>

      {arrears && (
        <dl className={styles.bands} aria-label="Overdue money by age">
          {arrears.bands.map((band) => (
            <div key={band.label} className={styles.band}>
              <dt>{band.label}</dt>
              <dd>
                {formatUGX(band.amount)}
                <span>
                  {band.loans} {band.loans === 1 ? "loan" : "loans"}
                </span>
              </dd>
            </div>
          ))}
        </dl>
      )}

      <div className={loanStyles.card}>
        <div className={styles.tabs} role="tablist" aria-label="Arrears and texts">
          <button type="button" role="tab" aria-selected={tab === "late"} onClick={() => choose("late")}>
            Late loans{loans.data ? ` (${loans.data.total})` : ""}
          </button>
          <button type="button" role="tab" aria-selected={tab === "texts"} onClick={() => choose("texts")}>
            Texts sent
          </button>
        </div>

        {tab === "late" ? (
          loans.isPending ? (
            <p className={styles.empty} aria-busy="true">
              Loading…
            </p>
          ) : loans.isError ? (
            <p className={styles.empty}>
              The late loans didn't load. <button type="button" className={loanStyles.linkButton} onClick={() => loans.refetch()}>Try again</button>
            </p>
          ) : loans.data.items.length === 0 ? (
            <p className={styles.empty}>No late loans. Everyone is up to date.</p>
          ) : (
            <>
              <table className={`${loanStyles.table} ${styles.lateTable}`}>
                <thead>
                  <tr>
                    <th>LOAN</th>
                    <th>CLIENT</th>
                    <th className={loanStyles.numeric}>DAYS LATE</th>
                    <th className={loanStyles.numeric}>OVERDUE</th>
                    <th className={loanStyles.numeric}>BALANCE</th>
                    {seesBranch && <th>OFFICER</th>}
                    {canText && <th />}
                  </tr>
                </thead>
                <tbody>
                  {loans.data.items.map((loan) => (
                    <tr key={loan.id}>
                      <td className={`${loanStyles.loan} ${styles.cLoan}`}>
                        <Link to={`/loans/${loan.id}`} className={loanStyles.strongLink}>
                          {loan.id}
                        </Link>
                        {loan.recovery && <span className={loanStyles.secondary}>With recovery</span>}
                      </td>
                      <td className={styles.cClient}>
                        <span className={loanStyles.borrowerName}>{loan.borrower.name}</span>
                        <span className={loanStyles.secondary}>{loan.phone}</span>
                      </td>
                      <td className={`${loanStyles.numeric} ${styles.cDays}`}>{dayCount(loan.daysPastDue)}</td>
                      <td className={`${loanStyles.numeric} ${styles.cOverdue}`}>{formatUGX(loan.arrearsAmount)}</td>
                      <td className={`${loanStyles.numeric} ${styles.cBalance}`}>{formatUGX(loan.balance)}</td>
                      {seesBranch && <td className={loanStyles.officer}>{loan.officer.name}</td>}
                      {canText && (
                        <td className={styles.actions}>
                          <Button variant="secondary" onClick={() => setTexting(loan)}>
                            Send text
                          </Button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
              <Pagination page={loans.data.page} pageSize={LOANS_PAGE_SIZE} total={loans.data.total} noun="loans" onPageChange={goToPage} />
            </>
          )
        ) : texts.isPending ? (
          <p className={styles.empty} aria-busy="true">
            Loading…
          </p>
        ) : texts.isError ? (
          <p className={styles.empty}>
            The texts didn't load. <button type="button" className={loanStyles.linkButton} onClick={() => texts.refetch()}>Try again</button>
          </p>
        ) : texts.data.items.length === 0 ? (
          <p className={styles.empty}>No texts sent yet.</p>
        ) : (
          <>
            <table className={`${loanStyles.table} ${styles.textsTable}`}>
              <thead>
                <tr>
                  <th>SENT</th>
                  <th>CLIENT</th>
                  <th>MESSAGE</th>
                  <th>BY</th>
                </tr>
              </thead>
              <tbody>
                {texts.data.items.map((text) => (
                  <tr key={text.id}>
                    <td className={`${loanStyles.loan} ${styles.tWhen}`}>
                      {formatShortDate(text.at)}
                      <span className={loanStyles.secondary}>{formatTime(text.at)}</span>
                    </td>
                    <td className={styles.tClient}>
                      <Link to={`/loans/${text.loanId}`} className={loanStyles.strongLink}>
                        {text.borrower.name}
                      </Link>
                      <span className={loanStyles.secondary}>
                        {text.loanId} · {text.phone}
                      </span>
                    </td>
                    <td className={`${styles.textMessage} ${styles.tMessage}`}>
                      {text.message}
                      {text.delivery === "failed" && <span className={`${loanStyles.secondary} ${styles.failed}`}>Didn't reach the phone</span>}
                      {text.delivery === "pending" && <span className={loanStyles.secondary}>Sending…</span>}
                    </td>
                    <td className={`${loanStyles.officer} ${styles.tBy}`}>{text.sentBy}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Pagination page={texts.data.page} pageSize={TEXTS_PAGE_SIZE} total={texts.data.total} noun="texts" onPageChange={goToPage} />
          </>
        )}
      </div>

      {texting && <SendTextDialog target={{ loanId: texting.id, clientName: texting.borrower.name, phone: texting.phone, daysLate: texting.daysPastDue, amount: texting.arrearsAmount }} onClose={() => setTexting(null)} />}
    </>
  );
}
