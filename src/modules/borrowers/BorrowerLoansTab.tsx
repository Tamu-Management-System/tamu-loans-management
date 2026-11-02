import { Link, useNavigate } from "react-router";
import { ApiError } from "../../api/client";
import { useBorrowerLoans, useDownloadAgreement } from "../../api/borrowers";
import { useAuth } from "../../auth/AuthContext";
import type { BorrowerLoanRecord } from "../../api/types";
import { Icon } from "../../components/ui/Icon";
import { useToast } from "../../components/ui/Toast";
import { formatDate, formatUGX } from "../../lib/format";
import chipStyles from "./BorrowerStatusChip.module.css";
import styles from "./BorrowerLoansTab.module.css";

/** Past this many days late the chip turns red, in line with PAR30. */
const LATE_DAYS_DANGER = 30;

/** How the loan is being, or was, repaid. */
function RepaymentChip({ loan }: { loan: BorrowerLoanRecord }) {
  if (loan.status === "active") return <span className={`${chipStyles.chip} ${chipStyles.chipActive}`}>Active · on time</span>;
  if (loan.status === "in-arrears") {
    return <span className={`${chipStyles.chip} ${loan.daysPastDue > LATE_DAYS_DANGER ? chipStyles.chipDanger : chipStyles.chipWarning}`}>Active · {loan.daysPastDue} days late</span>;
  }
  return loan.mostDaysLate === 0 ? (
    <span className={`${chipStyles.chip} ${chipStyles.chipNeutral}`}>Cleared · on time</span>
  ) : (
    <span className={`${chipStyles.chip} ${chipStyles.chipWarning}`}>Cleared · was {loan.mostDaysLate} days late</span>
  );
}

/** Every loan the borrower has taken, newest first, each with its signed loan application (user flow, phase 8). */
export function BorrowerLoansTab({ borrowerId }: { borrowerId: string }) {
  const navigate = useNavigate();
  const showToast = useToast();
  const { data, isPending, isError, refetch } = useBorrowerLoans(borrowerId);
  const download = useDownloadAgreement();
  const canDownload = useAuth().can("documents.download");

  const downloadAgreement = (loanId: string) =>
    download.mutate(loanId, {
      onError: (error) => showToast({ message: error instanceof ApiError ? error.message : "The loan application couldn't be downloaded. Try again." }),
    });

  if (isError) {
    return (
      <div className={styles.card}>
        <p className={styles.message} role="alert">
          The loan history couldn't load.{" "}
          <button type="button" className={styles.linkButton} onClick={() => refetch()}>
            Try again
          </button>
        </p>
      </div>
    );
  }
  if (isPending) return <div className={styles.loading} aria-busy="true" aria-label="Loading the loan history" />;

  const { items, summary } = data;
  return (
    <section className={styles.card} aria-labelledby="loan-history">
      <h2 id="loan-history" className={styles.title}>
        Loan history
      </h2>

      {items.length === 0 ? (
        <p className={styles.message}>No loans yet.</p>
      ) : (
        <>
          <dl className={styles.summary}>
            <div>
              <dt>Loans taken</dt>
              <dd>{summary.loansTaken}</dd>
            </div>
            <div>
              <dt>Total borrowed</dt>
              <dd>{formatUGX(summary.totalBorrowed)}</dd>
            </div>
            <div>
              <dt>Repaid on time</dt>
              <dd>{summary.cleared === 0 ? "—" : `${summary.clearedOnTime} of ${summary.cleared} cleared`}</dd>
            </div>
          </dl>

          <table className={styles.table}>
            <thead>
              <tr>
                <th>LOAN</th>
                <th className={styles.numeric}>BORROWED</th>
                <th>DISBURSED</th>
                <th>CLEARED</th>
                <th>REPAYMENT</th>
                <th className={styles.agreementHeading}>APPLICATION</th>
              </tr>
            </thead>
            <tbody>
              {items.map((loan) => {
                const downloading = download.isPending && download.variables === loan.id;
                return (
                  <tr key={loan.id} className={styles.row} onClick={() => navigate(`/loans/${loan.id}`)}>
                    <td className={styles.loan}>
                      {/* The link gives keyboard and screen-reader access; the whole row is also clickable */}
                      <Link to={`/loans/${loan.id}`} className={styles.loanId} onClick={(event) => event.stopPropagation()}>
                        {loan.id}
                      </Link>
                      <span className={styles.secondary}>{loan.product}</span>
                    </td>
                    <td className={`${styles.numeric} ${styles.amount}`}>{formatUGX(loan.principal)}</td>
                    <td className={styles.date}>{formatDate(loan.disbursedOn)}</td>
                    <td className={styles.date}>{loan.clearedOn ? formatDate(loan.clearedOn) : <span className={styles.secondary}>—</span>}</td>
                    <td className={styles.repayment}>
                      <RepaymentChip loan={loan} />
                    </td>
                    <td className={styles.agreement}>
                      {loan.applicationPdfAvailable && canDownload ? (
                        <button
                          type="button"
                          className={styles.downloadButton}
                          onClick={(event) => {
                            event.stopPropagation();
                            downloadAgreement(loan.id);
                          }}
                          disabled={downloading}
                          aria-label={`Download the signed loan application for ${loan.id} (PDF)`}
                        >
                          <Icon name="document" size={16} strokeWidth={1.8} />
                          {downloading ? "Downloading…" : "PDF"}
                        </button>
                      ) : (
                        <span className={styles.secondary}>{loan.applicationPdfAvailable ? "On file" : "Not uploaded yet"}</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className={styles.footnote}>Signed loan applications include National ID numbers. Each download is recorded in the audit log.</p>
        </>
      )}
    </section>
  );
}
