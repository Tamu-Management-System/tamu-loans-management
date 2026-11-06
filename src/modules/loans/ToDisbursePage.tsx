import { useState } from "react";
import { Link } from "react-router";
import { useLoansToDisburse } from "../../api/loans";
import type { LoanToDisburse } from "../../api/types";
import { useAuth } from "../../auth/AuthContext";
import { Button } from "../../components/ui/Button";
import { formatRelativeDay, formatUGX } from "../../lib/format";
import { DisburseDialog } from "./DisburseDialog";
import styles from "./ToDisbursePage.module.css";

/**
 * Loans → To disburse (user flow, phase 5): approved applications waiting to be paid out. Finance
 * records each payout; whoever approved a loan can't pay it out (Settings → Loan rules).
 */
export function ToDisbursePage() {
  const { can, seesBranch } = useAuth();
  const { data, isPending, isError, refetch } = useLoansToDisburse();
  const [paying, setPaying] = useState<LoanToDisburse | null>(null);
  const disburser = can("loans.disburse");
  const branchWide = seesBranch;
  const total = data?.reduce((sum, loan) => sum + loan.amount, 0) ?? 0;

  return (
    <>
      <div className={styles.header}>
        <h1>To disburse</h1>
        <p className={styles.subtitle}>
          {data && data.length > 0 ? `${data.length} approved ${data.length === 1 ? "loan" : "loans"} · ${formatUGX(total)} to pay out` : "Approved loans waiting to be paid out"}
        </p>
      </div>

      <div className={styles.card}>
        {isError ? (
          <p className={styles.message} role="alert">
            The loans couldn't load.{" "}
            <button type="button" className={styles.linkButton} onClick={() => refetch()}>
              Try again
            </button>
          </p>
        ) : isPending ? (
          <div className={styles.loading} aria-busy="true" aria-label="Loading loans to disburse" />
        ) : data.length === 0 ? (
          <p className={styles.message}>Nothing to pay out. Loans appear here once their application is approved.</p>
        ) : (
          <>
            {disburser && <p className={styles.note}>Pay out by mobile money first, then record it here with the transaction ID.</p>}
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>APPROVED</th>
                  <th>CLIENT</th>
                  <th className={styles.numeric}>AMOUNT</th>
                  <th className={styles.payToHeading}>PAY TO</th>
                  {branchWide && <th>OFFICER</th>}
                  <th className={styles.actionHeading}>
                    <span className={styles.visuallyHidden}>Payout</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.map((loan) => (
                  <tr key={loan.applicationId}>
                    <td className={styles.application}>
                      <Link to={`/applications/${loan.applicationId}`} className={styles.strongLink}>
                        {loan.applicationId}
                      </Link>
                      <span className={styles.secondary}>
                        By {loan.approved.by}, {formatRelativeDay(loan.approved.at)}
                      </span>
                    </td>
                    <td>
                      {loan.borrower.id ? (
                        <Link to={`/borrowers/${loan.borrower.id}`} className={styles.strongLink}>
                          {loan.borrower.name}
                        </Link>
                      ) : (
                        <b>{loan.borrower.name}</b>
                      )}
                      <span className={styles.secondary}>{loan.borrower.id}</span>
                    </td>
                    <td className={`${styles.numeric} ${styles.amount}`}>
                      <b>{formatUGX(loan.amount)}</b>
                      <span className={styles.secondary}>
                        {loan.terms.numberOfPayments} {loan.terms.repaymentSchedule} × {formatUGX(loan.terms.instalment)}
                      </span>
                    </td>
                    <td className={styles.payTo}>
                      {loan.payTo}
                      <span className={styles.secondary}>Mobile money</span>
                    </td>
                    {branchWide && <td className={styles.officer}>{loan.officer.name}</td>}
                    <td className={styles.action}>
                      {loan.disbursement.allowed ? (
                        <Button size="small" onClick={() => setPaying(loan)} aria-label={`Disburse ${loan.applicationId} to ${loan.borrower.name}`}>
                          Disburse
                        </Button>
                      ) : (
                        <span className={styles.blocked} title={loan.disbursement.reason ?? undefined}>
                          {loan.disbursement.label}
                          <span className={styles.visuallyHidden}>. {loan.disbursement.reason}</span>
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>

      {paying && <DisburseDialog loan={paying} onClose={() => setPaying(null)} />}
    </>
  );
}
