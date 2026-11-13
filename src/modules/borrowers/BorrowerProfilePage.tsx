import { useState, type ReactNode } from "react";
import { Link, useLocation, useParams, useSearchParams } from "react-router";
import { ApiError } from "../../api/client";
import { useBorrowerProfile, usePhoneChangeDecision } from "../../api/borrowers";
import { useSystemSettings } from "../../api/settings";
import type { BorrowerCurrentLoan, BorrowerProfile } from "../../api/types";
import { useAuth } from "../../auth/AuthContext";
import { Avatar } from "../../components/ui/Avatar";
import { Button } from "../../components/ui/Button";
import { Icon } from "../../components/ui/Icon";
import { useToast } from "../../components/ui/Toast";
import { dayCount, firstName, formatDate, formatMonthYear, formatRelativeDay, formatUGX } from "../../lib/format";
import { SendTextDialog } from "../arrears/SendTextDialog";
import { useAnnounce } from "../dashboard/useAnnounce";
import { RecordPaymentDialog } from "../payments/RecordPaymentDialog";
import { BorrowerActivityTab } from "./BorrowerActivityTab";
import { BorrowerLoansTab } from "./BorrowerLoansTab";
import { BorrowerDocumentsTab } from "./documents/BorrowerDocumentsTab";
import { BorrowerStatusChip } from "./BorrowerStatusChip";
import { EditBorrowerDialog } from "./EditBorrowerDialog";
import { ReturnFromRecoveryDialog, SendToRecoveryDialog } from "../loans/RecoveryDialogs";
import { NationalIdField } from "./NationalIdField";
import styles from "./BorrowerProfilePage.module.css";

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "loans", label: "Loans" },
  { id: "documents", label: "Documents" },
  { id: "activity", label: "Activity" },
] as const;
type TabId = (typeof TABS)[number]["id"];

const REPAYMENT_SCHEDULE = { daily: "Daily", weekly: "Weekly", monthly: "Monthly" } as const;

/** "0772 418 230" -> "0772418230", for the tel: link */
const dialable = (phone: string) => phone.replace(/[^\d+]/g, "");

/** Client profile (user flow, phase 8): who they are, their current loan and, in the tabs, their history. */
export function BorrowerProfilePage() {
  const { borrowerId = "" } = useParams();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: borrower, isPending, error, refetch } = useBorrowerProfile(borrowerId);

  // Back to the list as the user left it (tab, search, page), when they came from there
  const listSearch = (location.state as { listSearch?: string } | null)?.listSearch ?? "";
  const tab: TabId = TABS.find((t) => t.id === searchParams.get("tab"))?.id ?? "overview";
  const selectTab = (id: TabId) =>
    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current);
        if (id === "overview") next.delete("tab");
        else next.set("tab", id);
        return next;
      },
      { state: location.state }, // keep the way back to the list
    );

  const breadcrumb = (
    <nav aria-label="Breadcrumb" className={styles.breadcrumb}>
      <Link to={`/borrowers${listSearch}`}>Clients</Link>
      <Icon name="chevronDown" size={14} strokeWidth={2} className={styles.breadcrumbSeparator} />
      <span aria-current="page">{borrower?.name ?? borrowerId}</span>
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
              "This client doesn't exist, or isn't in your portfolio."
            ) : (
              <>
                The client's profile couldn't load.{" "}
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
        <div className={styles.loading} aria-busy="true" aria-label="Loading the client's profile" />
      </>
    );
  }

  return (
    <>
      {breadcrumb}
      <ProfileSummary borrower={borrower} />

      <div className={styles.tabs} role="tablist" aria-label="Client profile">
        {TABS.map((t) => (
          <button key={t.id} type="button" role="tab" id={`tab-${t.id}`} aria-selected={tab === t.id} aria-controls="borrower-tab-panel" onClick={() => selectTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      <div role="tabpanel" id="borrower-tab-panel" aria-labelledby={`tab-${tab}`}>
        {tab === "overview" ? (
          <Overview borrower={borrower} />
        ) : tab === "loans" ? (
          <BorrowerLoansTab borrowerId={borrower.id} />
        ) : tab === "documents" ? (
          <BorrowerDocumentsTab borrowerId={borrower.id} />
        ) : (
          <BorrowerActivityTab borrowerId={borrower.id} />
        )}
      </div>
    </>
  );
}

/** Top card: identity, key figures and the actions the user is allowed to take. */
function ProfileSummary({ borrower }: { borrower: BorrowerProfile }) {
  const { can } = useAuth();
  const announce = useAnnounce();
  const showToast = useToast();
  const [recordingPayment, setRecordingPayment] = useState(false);
  const [editing, setEditing] = useState(false);
  const [texting, setTexting] = useState(false);
  const loan = borrower.currentLoan;
  const canText = can("sms.send") && !!loan;
  const brand = useSystemSettings().data?.business.shortName ?? "";
  const oneLoanAtATime = useSystemSettings().data?.loanRules.oneOpenLoanPerBorrower ?? true;
  const canStartNewLoan = can("applications.create") && (!loan || !oneLoanAtATime) && (!borrower.application || borrower.application.status === "rejected");

  return (
    <section className={`${styles.card} ${styles.summary}`} aria-label="Client summary">
      <div className={styles.identity}>
        <Avatar name={borrower.name} size={64} />
        <div>
          <div className={styles.nameRow}>
            <h1>{borrower.name}</h1>
            <BorrowerStatusChip status={borrower.status} daysPastDue={loan?.daysPastDue} applicationStatus={borrower.application?.status} />
          </div>
          <p className={styles.meta}>
            {[borrower.id, borrower.area].filter(Boolean).join(" · ")}
            <span className={styles.metaSince}>
              <span className={styles.metaDot}> · </span>
              Client since {formatMonthYear(borrower.registeredOn)}
            </span>
          </p>
        </div>
      </div>

      <div className={styles.actions}>
        <a className={styles.secondaryAction} href={`tel:${dialable(borrower.phone)}`}>
          <Icon name="phone" size={16} strokeWidth={1.9} />
          Call
        </a>
        {/* Texts go out from here, through the system, and are recorded on the loan; no messaging app opens */}
        <button
          type="button"
          className={styles.secondaryAction}
          onClick={() => setTexting(true)}
          disabled={!canText}
          title={!can("sms.send") ? "You can't send texts" : !loan ? "Texts are sent about a loan, and this client has no open loan" : "Send a text"}
        >
          <Icon name="message" size={16} strokeWidth={1.9} />
          SMS
        </button>
        {can("borrowers.edit") && (
          <button type="button" className={styles.secondaryAction} onClick={() => setEditing(true)}>
            <Icon name="person" size={16} strokeWidth={1.9} />
            Edit details
          </button>
        )}
        {can("payments.record") && loan && (
          <Button className={styles.primaryAction} onClick={() => setRecordingPayment(true)}>
            Record payment
          </Button>
        )}
        {canStartNewLoan && (
          <Link className={`${styles.primaryAction} ${styles.primaryLink}`} to={`/applications/new?borrowerId=${encodeURIComponent(borrower.id)}`}>
            New loan
          </Link>
        )}
      </div>

      <dl className={styles.facts}>
        <Fact label="Phone">
          {borrower.phone}
          {borrower.pendingPhoneChange && <span className={styles.factPending}>Change waiting for approval</span>}
        </Fact>
        <Fact label="Balance">{loan ? formatUGX(loan.balance) : "—"}</Fact>
        <Fact label="Next payment">
          {loan?.nextPayment ? (
            <>
              {formatUGX(loan.nextPayment.amount)}
              <span className={loan.daysPastDue > 0 ? styles.factLate : styles.factSecondary}>
                {loan.daysPastDue > 0 ? `was due ${formatDate(loan.nextPayment.dueOn)}` : `due ${formatDate(loan.nextPayment.dueOn)}`}
              </span>
            </>
          ) : (
            "—"
          )}
        </Fact>
        <Fact label="Loan officer">{borrower.officer.name}</Fact>
      </dl>

      {texting && loan && (
        <SendTextDialog
          target={{
            loanId: loan.id,
            clientName: borrower.name,
            phone: borrower.phone,
            daysLate: loan.daysPastDue,
            amount: loan.nextPayment?.amount ?? 0,
            // Only a late loan gets the reminder wording; otherwise the person writes their own
            initialMessage: loan.daysPastDue > 0 ? undefined : `${brand} Loans: Hello ${firstName(borrower.name)}, `,
          }}
          onClose={() => setTexting(false)}
        />
      )}
      {recordingPayment && loan && <RecordPaymentDialog loanId={loan.id} onClose={() => setRecordingPayment(false)} onRecorded={announce} />}
      {editing && <EditBorrowerDialog borrower={borrower} onClose={() => setEditing(false)} onSaved={(message) => showToast({ message })} />}
    </section>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className={styles.fact}>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function Overview({ borrower }: { borrower: BorrowerProfile }) {
  return (
    <div className={styles.overview}>
      <CurrentLoanCard borrower={borrower} />

      {/* Who they are and where they work in one card; how to reach them (and their next of kin) in the other */}
      <section className={styles.card} aria-labelledby="personal-details">
        <h2 id="personal-details" className={styles.cardTitle}>
          Personal details
        </h2>
        <dl className={styles.details}>
          <Detail label="Full name">{borrower.name}</Detail>
          <Detail label="National ID">
            <NationalIdField borrowerId={borrower.id} masked={borrower.nationalIdMasked} />
          </Detail>
          <Detail label="Gender">{borrower.gender ? (borrower.gender === "female" ? "Female" : "Male") : "—"}</Detail>
          <Detail label="Address (Location)">{borrower.area}</Detail>
          <Detail label="Occupation">{borrower.occupation || "—"}</Detail>
          <Detail label="Shop / premises">{borrower.premises}</Detail>
          <Detail label="Registered">{formatDate(borrower.registeredOn)}</Detail>
        </dl>
      </section>

      <section className={styles.card} aria-labelledby="contact-details">
        <h2 id="contact-details" className={styles.cardTitle}>
          Contact and next of kin
        </h2>
        <dl className={styles.details}>
          <Detail label="Main phone">
            {borrower.phone}
            <span className={styles.fieldHint}>Mobile money</span>
            {borrower.pendingPhoneChange && <PendingPhoneChangeNotice borrower={borrower} />}
          </Detail>
          <Detail label="Other phone">{borrower.secondaryPhone ?? "—"}</Detail>
          <Detail label="Email">{borrower.email ?? "—"}</Detail>
          <Detail label="Next of kin">{borrower.nextOfKin?.name || "—"}</Detail>
          <Detail label="Relationship">{borrower.nextOfKin?.relationship || "—"}</Detail>
          <Detail label="Next of kin's phone">{borrower.nextOfKin?.phone || "—"}</Detail>
        </dl>
      </section>
    </div>
  );
}

/**
 * A new mobile money number waiting for a second person (four-eyes): approvers other than the
 * person who asked can approve or reject it; the person who asked can withdraw it.
 */
function PendingPhoneChangeNotice({ borrower }: { borrower: BorrowerProfile }) {
  const { user, can } = useAuth();
  const showToast = useToast();
  const decide = usePhoneChangeDecision(borrower.id);
  const change = borrower.pendingPhoneChange!;
  const askedByMe = change.requestedBy.id === user.id;
  const canApprove = can("borrowers.phoneApprove") && !askedByMe;

  const act = (decision: "approve" | "reject") =>
    decide.mutate(
      { changeId: change.id, decision },
      {
        onSuccess: () => showToast({ message: decision === "approve" ? `Mobile money number changed to ${change.newPhone}.` : askedByMe ? "Request withdrawn." : "Change rejected." }),
        onError: (error) => showToast({ message: error instanceof ApiError ? error.message : "That didn't work. Try again." }),
      },
    );

  return (
    <span className={styles.pendingChange} role="note">
      <span>
        Change to <b>{change.newPhone}</b> waiting for approval
        <span className={styles.pendingMeta}>
          Asked by {askedByMe ? "you" : change.requestedBy.name}, {formatRelativeDay(change.requestedAt)}. Payouts use the current number until it's approved
          {askedByMe ? " by someone else." : "."}
        </span>
      </span>
      {(canApprove || askedByMe) && (
        <span className={styles.pendingActions}>
          {canApprove && (
            <button type="button" className={styles.pendingApprove} onClick={() => act("approve")} disabled={decide.isPending}>
              Approve
            </button>
          )}
          <button type="button" className={styles.pendingReject} onClick={() => act("reject")} disabled={decide.isPending}>
            {askedByMe ? "Withdraw" : "Reject"}
          </button>
        </span>
      )}
    </span>
  );
}

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className={styles.detail}>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function CurrentLoanCard({ borrower }: { borrower: BorrowerProfile }) {
  const loan = borrower.currentLoan;
  const application = borrower.application;

  if (loan) return <LoanDetails loan={loan} borrowerName={borrower.name} />;

  return (
    <section className={`${styles.card} ${styles.loanCard}`} aria-labelledby="current-loan">
      <h2 id="current-loan" className={styles.cardTitle}>
        {application ? "Application" : "Current loan"}
      </h2>
      {application ? (
        <>
          <p className={styles.emptyText}>
            <Link to={`/applications/${application.id}`} className={styles.loanLink}>
              {application.id}
            </Link>{" "}
            for {formatUGX(application.amount)}, {{ submitted: "waiting for approval", approved: "approved and waiting to be paid out", draft: "still a draft", rejected: "not approved" }[application.status]}.
          </p>
          {application.missing && (
            <p className={`${styles.alert} ${styles.alertSpaced}`} role="note">
              <Icon name="warning" size={16} strokeWidth={1.9} />
              {application.missing}
            </p>
          )}
        </>
      ) : (
        <p className={styles.emptyText}>
          No active loan. {borrower.loansCleared === 1 ? "1 loan" : `${borrower.loansCleared} loans`} repaid in full.
        </p>
      )}
    </section>
  );
}

function LoanDetails({ loan, borrowerName }: { loan: BorrowerCurrentLoan; borrowerName: string }) {
  const { can } = useAuth();
  const [recoveryDialog, setRecoveryDialog] = useState<"send" | "return" | null>(null);
  const canManageRecovery = can("recovery.manage");
  const summary = { id: loan.id, borrowerName, balance: loan.balance, daysPastDue: loan.daysPastDue };
  const repaid = Math.max(0, loan.totalRepayable - loan.balance);
  const repaidPercent = loan.totalRepayable > 0 ? Math.round((repaid / loan.totalRepayable) * 100) : 0;
  const late = loan.daysPastDue > 0;
  const seriouslyLateDays = useSystemSettings().data?.loanRules.seriouslyLateDays;

  return (
    <section className={`${styles.card} ${styles.loanCard}`} aria-labelledby="current-loan">
      <div className={styles.cardHeader}>
        <h2 id="current-loan" className={styles.cardTitle}>
          Current loan
        </h2>
        <Link to={`/loans/${loan.id}`} className={styles.loanLink}>
          {loan.id}
          <Icon name="chevronDown" size={14} strokeWidth={2} className={styles.linkArrow} />
        </Link>
      </div>
      <p className={styles.loanMeta}>
        {loan.product} · {REPAYMENT_SCHEDULE[loan.repaymentSchedule]} repayments · Disbursed {formatDate(loan.disbursedOn)}
      </p>

      <dl className={styles.loanFigures}>
        <Fact label="Borrowed">{formatUGX(loan.principal)}</Fact>
        <Fact label="Total to repay">{formatUGX(loan.totalRepayable)}</Fact>
        <Fact label="Repaid">{formatUGX(repaid)}</Fact>
        <Fact label="Balance">{formatUGX(loan.balance)}</Fact>
      </dl>

      <div className={styles.progress}>
        <div className={styles.progressLabels}>
          <span>
            <b>{repaidPercent}%</b> repaid
          </span>
          <span>{formatUGX(loan.balance)}</span>
        </div>
        <div className={styles.progressTrack} role="progressbar" aria-label="Repaid so far" aria-valuemin={0} aria-valuemax={100} aria-valuenow={repaidPercent}>
          <span className={styles.progressBar} style={{ width: `${repaidPercent}%` }} />
        </div>
      </div>

      {loan.nextPayment &&
        (late ? (
          <p className={`${styles.alert} ${seriouslyLateDays !== undefined && loan.daysPastDue >= seriouslyLateDays ? styles.alertDanger : ""}`} role="note">
            <Icon name="warning" size={16} strokeWidth={1.9} />
            <span>
              <b>{dayCount(loan.daysPastDue)} late.</b> {formatUGX(loan.arrearsAmount)} overdue since {formatDate(loan.nextPayment.dueOn)}.
            </span>
          </p>
        ) : (
          <p className={styles.nextPayment}>
            <Icon name="clock" size={16} strokeWidth={1.9} />
            <span>
              Next payment <b>{formatUGX(loan.nextPayment.amount)}</b> due {formatDate(loan.nextPayment.dueOn)}
            </span>
          </p>
        ))}

      {loan.recovery ? (
        <div className={styles.recovery} role="note">
          <span>
            <b>With the recovery team</b> since {formatDate(loan.recovery.since)}, sent by {loan.recovery.by}: {loan.recovery.reason}.{loan.recovery.note && <> {loan.recovery.note}</>}
          </span>
          {canManageRecovery && (
            <button type="button" className={styles.recoveryButton} onClick={() => setRecoveryDialog("return")}>
              Bring back
            </button>
          )}
        </div>
      ) : (
        late &&
        canManageRecovery && (
          <div className={styles.loanActions}>
            <button type="button" className={styles.recoveryButton} onClick={() => setRecoveryDialog("send")}>
              Send to recovery
            </button>
          </div>
        )
      )}
      {recoveryDialog === "send" && <SendToRecoveryDialog loan={summary} onClose={() => setRecoveryDialog(null)} />}
      {recoveryDialog === "return" && <ReturnFromRecoveryDialog loan={summary} onClose={() => setRecoveryDialog(null)} />}
    </section>
  );
}
