import { useState, type ReactNode } from "react";
import { Link, useParams } from "react-router";
import { useDownloadAgreement } from "../../api/borrowers";
import { useSystemSettings } from "../../api/settings";
import { ApiError } from "../../api/client";
import { useLoan } from "../../api/loans";
import type { LoanDetail, LoanInstalment } from "../../api/types";
import { useAuth } from "../../auth/AuthContext";
import { Button } from "../../components/ui/Button";
import { Icon } from "../../components/ui/Icon";
import { useToast } from "../../components/ui/Toast";
import { formatDate, formatShortDate, formatTime, formatUGX, dayCount } from "../../lib/format";
import { useAnnounce } from "../dashboard/useAnnounce";
import { RecordPaymentDialog } from "../payments/RecordPaymentDialog";
import { ReturnFromRecoveryDialog, SendToRecoveryDialog } from "./RecoveryDialogs";
import styles from "./LoanDetailsPage.module.css";

const FREQUENCY = { daily: "Daily", weekly: "Weekly", monthly: "Monthly" } as const;
const INSTALMENT_STATUS: Record<LoanInstalment["status"], string> = { paid: "Paid", "part-paid": "Part paid", late: "Late", due: "Due today", upcoming: "Upcoming" };

/** One loan (user flow, phases 5–6): what's owed, the repayment schedule, the payments, and where it came from. */
export function LoanDetailsPage() {
  const { loanId = "" } = useParams();
  const { can } = useAuth();
  const { data: loan, isPending, error, refetch } = useLoan(loanId);
  const [dialog, setDialog] = useState<"payment" | "send" | "return" | null>(null);
  const announce = useAnnounce();
  const showToast = useToast();
  const download = useDownloadAgreement();
  // How late is "seriously late", and when recovery is suggested: Settings → Loan rules
  const { data: settings } = useSystemSettings();
  const seriouslyLate = settings?.loanRules.seriouslyLateDays ?? 30;
  const recoveryAfter = settings?.loanRules.recoveryMode === "suggest" ? (settings.loanRules.recoveryAfterDaysLate ?? null) : null;

  const breadcrumb = (
    <nav aria-label="Breadcrumb" className={styles.breadcrumb}>
      <Link to={loan?.status === "cleared" ? "/loans/cleared" : "/loans/active"}>Loans</Link>
      <Icon name="chevronDown" size={14} strokeWidth={2} className={styles.breadcrumbSeparator} />
      <span aria-current="page">{loanId}</span>
    </nav>
  );

  if (error) {
    const notFound = error instanceof ApiError && error.status === 404;
    return (
      <>
        {breadcrumb}
        <div className={styles.card}>
          <p className={styles.message} role="alert">
            {notFound ? (
              "This loan doesn't exist, or isn't in your portfolio."
            ) : (
              <>
                The loan couldn't load.{" "}
                <button type="button" className={styles.linkButton} onClick={() => refetch()}>
                  Try again
                </button>
              </>
            )}
          </p>
        </div>
      </>
    );
  }
  if (isPending) {
    return (
      <>
        {breadcrumb}
        <div className={styles.loading} aria-busy="true" aria-label="Loading the loan" />
      </>
    );
  }

  const open = loan.status !== "cleared";
  const late = loan.daysPastDue > 0;
  const repaidPercent = loan.totalRepayable > 0 ? Math.round((loan.repaid / loan.totalRepayable) * 100) : 0;
  const summary = { id: loan.id, borrowerName: loan.borrower.name, balance: loan.balance, daysPastDue: loan.daysPastDue };
  const downloadPdf = () =>
    download.mutate(loan.id, { onError: (err) => showToast({ message: err instanceof ApiError ? err.message : "The loan application couldn't be downloaded. Try again." }) });

  return (
    <>
      {breadcrumb}
      <div className={styles.header}>
        <div>
          <div className={styles.titleRow}>
            <h1>{loan.id}</h1>
            <StatusChip loan={loan} seriouslyLate={seriouslyLate} />
          </div>
          <p className={styles.meta}>
            <Link to={`/borrowers/${loan.borrower.id}`}>{loan.borrower.name}</Link> · {loan.product} · {loan.officer.name}
          </p>
        </div>
        <div className={styles.actions}>
          {loan.signedApplication && can("documents.download") && (
            <Button variant="secondary" onClick={downloadPdf} disabled={download.isPending}>
              <Icon name="document" size={16} strokeWidth={1.8} />
              Signed application
            </Button>
          )}
          {open && can("recovery.manage") && (loan.recovery || late) && (
            <Button variant="secondary" onClick={() => setDialog(loan.recovery ? "return" : "send")}>
              {loan.recovery ? "Bring back from recovery" : "Send to recovery"}
            </Button>
          )}
          {open && can("payments.record") && <Button onClick={() => setDialog("payment")}>Record payment</Button>}
        </div>
      </div>

      {loan.recovery && (
        <p className={styles.recovery} role="note">
          <b>With the recovery team</b> since {formatDate(loan.recovery.since)}, sent by {loan.recovery.by}: {loan.recovery.reason}.{loan.recovery.note && <> {loan.recovery.note}</>}
        </p>
      )}

      <section className={styles.card} aria-label="Amounts">
        <dl className={styles.figures}>
          <Figure label="Borrowed">{formatUGX(loan.principal)}</Figure>
          <Figure label="Interest">{formatUGX(loan.interest)}</Figure>
          {loan.lateFees.amount > 0 && <Figure label="Late fees">{formatUGX(loan.lateFees.amount)}</Figure>}
          <Figure label="Total to repay">{formatUGX(loan.totalRepayable)}</Figure>
          <Figure label="Repaid">{formatUGX(loan.repaid)}</Figure>
          <Figure label="Balance" strong>
            {formatUGX(loan.balance)}
          </Figure>
        </dl>
        <div className={styles.progress}>
          <div className={styles.progressLabels}>
            <span>
              <b>{repaidPercent}%</b> repaid
            </span>
            <span>{open ? (loan.nextPayment && !late ? `Next: ${formatUGX(loan.nextPayment.amount)} on ${formatDate(loan.nextPayment.dueOn)}` : "") : `Cleared ${loan.clearedOn ? formatDate(loan.clearedOn) : ""}`}</span>
          </div>
          <div className={styles.progressTrack} role="progressbar" aria-label="Repaid so far" aria-valuemin={0} aria-valuemax={100} aria-valuenow={repaidPercent}>
            <span className={styles.progressBar} style={{ width: `${repaidPercent}%` }} />
          </div>
        </div>
        {open && late && loan.nextPayment && (
          <p className={`${styles.alert} ${loan.daysPastDue >= seriouslyLate ? styles.alertDanger : ""}`} role="note">
            <Icon name="warning" size={16} strokeWidth={1.9} />
            <span>
              <b>{dayCount(loan.daysPastDue)} late.</b> {formatUGX(loan.arrearsAmount)} overdue since {formatDate(loan.nextPayment.dueOn)}.
              {loan.lateFees.amount > 0 && <> Late fees so far: {formatUGX(loan.lateFees.amount)}.</>}
              {!loan.recovery && recoveryAfter !== null && loan.daysPastDue >= recoveryAfter && <> It's past the {recoveryAfter}-day mark: ready for recovery.</>}
            </span>
          </p>
        )}
      </section>

      <div className={styles.layout}>
        <section className={styles.card} aria-labelledby="schedule-heading">
          <div className={styles.cardHeader}>
            <h2 id="schedule-heading">Repayment schedule</h2>
            {loan.schedule.length > 0 && (
              <span className={styles.cardMeta}>
                {loan.schedule.length} {FREQUENCY[loan.repaymentSchedule!].toLowerCase()} payments
              </span>
            )}
          </div>
          {loan.schedule.length ? (
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>#</th>
                  <th>DUE</th>
                  <th className={styles.numeric}>AMOUNT</th>
                  <th className={styles.numeric}>PAID</th>
                  <th className={styles.statusHeading}>STATUS</th>
                </tr>
              </thead>
              <tbody>
                {loan.schedule.map((instalment) => (
                  <tr key={instalment.number} className={instalment.status === "late" ? styles.lateRow : ""}>
                    <td className={styles.muted}>{instalment.number}</td>
                    <td>{formatDate(instalment.dueOn)}</td>
                    <td className={styles.numeric}>{formatUGX(instalment.amount)}</td>
                    <td className={styles.numeric}>{instalment.paid > 0 ? formatUGX(instalment.paid) : <span className={styles.muted}>—</span>}</td>
                    <td className={styles.status}>
                      <span className={`${styles.chip} ${styles[`chip_${instalment.status.replace("-", "_")}`]}`}>{INSTALMENT_STATUS[instalment.status]}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className={styles.empty}>
              Repaid in full on {loan.clearedOn ? formatDate(loan.clearedOn) : "—"}
              {loan.mostDaysLate > 0 ? `; it was up to ${loan.mostDaysLate} days late` : ", always on time"}. This loan was repaid before payment schedules were kept in the system.
            </p>
          )}
        </section>

        <div className={styles.column}>
          <section className={styles.card} aria-labelledby="payments-heading">
            <div className={styles.cardHeader}>
              <h2 id="payments-heading">Payments</h2>
              {loan.payments.length > 0 && <span className={styles.cardMeta}>{loan.payments.length}</span>}
            </div>
            {loan.payments.length ? (
              <ol className={styles.payments}>
                {loan.payments.map((payment) => (
                  <li key={payment.id}>
                    <span>
                      <b>{formatUGX(payment.amount)}</b>
                      <span className={styles.muted}>
                        {payment.method}
                        {payment.reference ? ` · ${payment.reference}` : ""}
                      </span>
                    </span>
                    <span className={styles.paymentWhen}>
                      {formatShortDate(payment.paidAt)}, {formatTime(payment.paidAt)}
                      <span className={styles.muted}>{payment.recordedBy}</span>
                    </span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className={styles.empty}>{open ? "No payments yet." : "Payments on older loans aren't in the system."}</p>
            )}
          </section>

          <section className={styles.card} aria-labelledby="details-heading">
            <div className={styles.cardHeader}>
              <h2 id="details-heading">Loan details</h2>
            </div>
            <dl className={styles.details}>
              <Row label="Borrower">
                <Link to={`/borrowers/${loan.borrower.id}`}>{loan.borrower.name}</Link>
                <span className={styles.muted}>{loan.borrower.phone} · mobile money</span>
              </Row>
              {loan.repaymentSchedule && <Row label="Payments">{FREQUENCY[loan.repaymentSchedule]}</Row>}
              <Row label="Paid out">
                {formatDate(loan.disbursedOn)}
                {loan.payout && (
                  <span className={styles.muted}>
                    {loan.payout.method} · {loan.payout.reference} · by {loan.payout.by}
                  </span>
                )}
              </Row>
              {loan.approvedBy && <Row label="Approved by">{loan.approvedBy}</Row>}
              {loan.applicationId && (
                <Row label="Application">
                  <Link to={`/applications/${loan.applicationId}`}>{loan.applicationId}</Link>
                </Row>
              )}
              <Row label="Loan officer">{loan.officer.name}</Row>
            </dl>
          </section>
        </div>
      </div>

      {dialog === "payment" && <RecordPaymentDialog loanId={loan.id} onClose={() => setDialog(null)} onRecorded={announce} />}
      {dialog === "send" && <SendToRecoveryDialog loan={summary} onClose={() => setDialog(null)} />}
      {dialog === "return" && <ReturnFromRecoveryDialog loan={summary} onClose={() => setDialog(null)} />}
    </>
  );
}

function StatusChip({ loan, seriouslyLate }: { loan: LoanDetail; seriouslyLate: number }) {
  if (loan.status === "cleared") return <span className={`${styles.chip} ${styles.chip_paid}`}>Cleared</span>;
  return (
    <>
      {loan.daysPastDue > 0 ? (
        <span className={`${styles.chip} ${loan.daysPastDue >= seriouslyLate ? styles.chip_late : styles.chip_due}`}>{dayCount(loan.daysPastDue)} late</span>
      ) : (
        <span className={`${styles.chip} ${styles.chip_paid}`}>Active</span>
      )}
      {loan.recovery && <span className={`${styles.chip} ${styles.chipRecovery}`}>In recovery</span>}
    </>
  );
}

function Figure({ label, strong = false, children }: { label: string; strong?: boolean; children: ReactNode }) {
  return (
    <div className={strong ? styles.figureStrong : undefined}>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className={styles.row}>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}
