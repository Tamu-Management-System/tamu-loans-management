import { useEffect, useState, type ReactNode } from "react";
import { Link, useParams } from "react-router";
import { useApplication, useApproveApplication } from "../../api/applications";
import { useAuth } from "../../auth/AuthContext";
import { useDocumentPreview } from "../../api/borrowers";
import { ApiError } from "../../api/client";
import type { ApplicationDetail, DocumentFile } from "../../api/types";
import { Button } from "../../components/ui/Button";
import { Icon } from "../../components/ui/Icon";
import { useToast } from "../../components/ui/Toast";
import { formatLongDate, formatRelativeDay, formatUGX } from "../../lib/format";
import { describeInterest } from "../../lib/repaymentSchedule";
import { describeFile } from "../borrowers/documents/documentFormat";
import { DocumentPreviewDialog } from "../borrowers/documents/DocumentPreviewDialog";
import { RejectApplicationDialog } from "./RejectApplicationDialog";
import styles from "./ApplicationReviewPage.module.css";

const PER = { daily: "daily", weekly: "weekly", monthly: "monthly" } as const;
const STATUS_LABEL = { draft: "Draft", "awaiting-borrower": "Waiting for client", submitted: "Waiting for approval", approved: "Approved", rejected: "Rejected" } as const;

const CHECKS = [
  { key: "signedPdfMatchesDetails", label: "The signed PDF matches the details: client, amount, payments and both guarantors" },
  { key: "idCopyMatchesNin", label: "The National ID copies (in the signed PDF, or the photos) match the names and NINs" },
  { key: "guarantorsSigned", label: "The client and both guarantors signed (agreement and both consents)" },
] as const;
type CheckKey = (typeof CHECKS)[number]["key"];

/**
 * One application (user flow, phases 4 and 5): the details, the signed loan application, and,
 * for approvers, the decision. Approving needs three checks; nobody approves their own application.
 */
export function ApplicationReviewPage() {
  const { applicationId = "" } = useParams();
  const { user, can } = useAuth();
  const { data: application, isPending, error, refetch } = useApplication(applicationId);
  const [viewing, setViewing] = useState<{ title: string; document: DocumentFile; isForm: boolean } | null>(null);

  const breadcrumb = (
    <nav aria-label="Breadcrumb" className={styles.breadcrumb}>
      <Link to="/applications">Applications</Link>
      <Icon name="chevronDown" size={14} strokeWidth={2} className={styles.breadcrumbSeparator} />
      <span aria-current="page">{applicationId}</span>
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
              "This application doesn't exist, or isn't one of yours."
            ) : (
              <>
                The application couldn't load.{" "}
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
        <div className={styles.loading} aria-busy="true" aria-label="Loading the application" />
      </>
    );
  }

  const a = application;
  // The officer who owns a paper draft can continue it (or fix it when it was sent back)
  const canContinue = a.status === "draft" && a.route === "paper" && a.officer.id === user.id && can("applications.create");
  const newcomerOnline = !a.borrower.id && a.status === "awaiting-borrower";
  const signed = a.documents.signedApplication;

  return (
    <>
      {breadcrumb}
      <div className={styles.header}>
        <div>
          <div className={styles.titleRow}>
            <h1>{a.id}</h1>
            <span className={`${styles.chip} ${styles[`chip_${a.status.replace("-", "_")}`]}`}>{a.status === "draft" && a.returned ? "Sent back" : STATUS_LABEL[a.status]}</span>
          </div>
          <p className={styles.meta}>
            {newcomerOnline ? "New client" : a.borrower.name} · {a.route === "online" ? "Online" : "Paper forms"} · {a.officer.name} ·{" "}
            {a.submittedAt ? `submitted ${formatRelativeDay(a.submittedAt)}` : `started ${formatRelativeDay(a.createdAt)}`}
          </p>
        </div>
        {canContinue && (
          <Link to={`/applications/${a.id}/edit`} className={styles.primaryLink}>
            {a.returned ? "Fix and resubmit" : "Continue application"}
          </Link>
        )}
      </div>

      <StatusBanner application={a} />

      <div className={styles.layout}>
        <div className={styles.column}>
          <Card title="Client">
            {a.borrowerDetails ? (
              <dl className={styles.details}>
                <Row label="Full name">
                  {a.borrower.id ? <Link to={`/borrowers/${a.borrower.id}`}>{a.borrower.name}</Link> : a.borrower.name}
                  {a.borrower.id && <span className={styles.hint}>{a.borrower.id}</span>}
                </Row>
                <Row label="National ID">{a.borrowerDetails.nationalIdMasked}</Row>
                <Row label="Phone">
                  {a.borrowerDetails.phone}
                  <span className={styles.hint}>Mobile money: the loan is paid here</span>
                </Row>
                <Row label="Email">{a.borrowerDetails.email || "—"}</Row>
                <Row label="Shop / premises">{a.borrowerDetails.premises || "—"}</Row>
                <Row label="Address (Location)">{a.borrowerDetails.area || "—"}</Row>
              </dl>
            ) : (
              <p className={styles.empty}>{newcomerOnline ? "They fill in their own details on the online form." : a.borrower.name}</p>
            )}
          </Card>

          <Card title="Loan">
            <dl className={styles.details}>
              <Row label="Amount">
                <b>{formatUGX(a.amount)}</b>
              </Row>
              <Row label="Interest">{formatUGX(a.schedule.interest)} ({describeInterest(a.pricing)})</Row>
              <Row label="Total to repay">
                <b>{formatUGX(a.schedule.totalRepayable)}</b>
              </Row>
              <Row label="Payments">
                {a.terms.numberOfPayments} {PER[a.terms.repaymentSchedule]} × {formatUGX(a.terms.instalment)}
                {a.schedule.finalInstalment !== a.terms.instalment && <span className={styles.hint}>Last payment {formatUGX(a.schedule.finalInstalment)}</span>}
              </Row>
              <Row label="First payment">{formatLongDate(a.schedule.firstPaymentOn)}</Row>
              <Row label="Last payment">{formatLongDate(a.schedule.lastPaymentOn)}</Row>
            </dl>
          </Card>

          <Card title="Guarantors">
            {a.guarantors.length ? (
              <dl className={styles.details}>
                {a.guarantors.map((guarantor, index) => (
                  <Row key={index} label={`Guarantor ${index + 1}`}>
                    {guarantor.name}
                    <span className={styles.hint}>
                      {guarantor.relationship ? `${guarantor.relationship} · ` : ""}ID {guarantor.nationalIdMasked} · {guarantor.phone}
                    </span>
                  </Row>
                ))}
              </dl>
            ) : (
              <p className={styles.empty}>{a.route === "online" ? "The client fills these in on the online form." : "Not entered yet."}</p>
            )}
          </Card>

          {/* Paper applications: the ID copy is in the signed PDF. Online ones have photos. */}
          {(a.documents.idFront || a.documents.idBack || a.route === "online") && (
            <Card title="National ID photos">
              <div className={styles.idCopies}>
                {(["idFront", "idBack"] as const).map((side) => {
                  const file = a.documents[side];
                  const label = side === "idFront" ? "Front" : "Back";
                  return file ? (
                    <button
                      key={side}
                      type="button"
                      className={styles.idButton}
                      onClick={() => setViewing({ title: `National ID · ${label.toLowerCase()}`, document: file, isForm: false })}
                    >
                      <Icon name="image" size={18} strokeWidth={1.8} />
                      <span>
                        <b>View {label.toLowerCase()}</b>
                        <small>{describeFile(file)}</small>
                      </span>
                    </button>
                  ) : (
                    <span key={side} className={styles.idMissing}>
                      {label}: not uploaded
                    </span>
                  );
                })}
              </div>
            </Card>
          )}
        </div>

        <div className={styles.column}>
          {a.status === "submitted" && <DecisionCard application={a} />}
          <Card
            title="Signed loan application"
            action={
              signed && (
                <button type="button" className={styles.linkButton} onClick={() => setViewing({ title: `Signed loan application · ${a.id}`, document: signed, isForm: true })}>
                  Full screen
                </button>
              )
            }
          >
            {signed ? (
              <>
                <p className={styles.fileMeta}>{describeFile(signed, true)}</p>
                <InlinePdf document={signed} title={`Signed loan application ${a.id}`} />
              </>
            ) : (
              <p className={styles.empty}>{a.status === "awaiting-borrower" ? "It's created when the client submits the online form." : "Not uploaded yet."}</p>
            )}
          </Card>
        </div>
      </div>

      {viewing && <DocumentPreviewDialog title={viewing.title} document={viewing.document} isForm={viewing.isForm} onClose={() => setViewing(null)} />}
    </>
  );
}

function StatusBanner({ application: a }: { application: ApplicationDetail }) {
  if (a.status === "draft" && a.returned) {
    return (
      <p className={`${styles.banner} ${styles.bannerWarning}`} role="note">
        <Icon name="warning" size={17} strokeWidth={1.9} />
        <span>
          <b>
            Sent back by {a.returned.by}, {formatRelativeDay(a.returned.at)}: {a.returned.reason}.
          </b>
          {a.returned.note && <> {a.returned.note}</>}
        </span>
      </p>
    );
  }
  if (a.status === "rejected" && a.returned) {
    return (
      <p className={`${styles.banner} ${styles.bannerDanger}`} role="note">
        <Icon name="warning" size={17} strokeWidth={1.9} />
        <span>
          <b>
            Rejected by {a.returned.by}, {formatRelativeDay(a.returned.at)}: {a.returned.reason}.
          </b>
          {a.returned.note && <> {a.returned.note}</>}
        </span>
      </p>
    );
  }
  if (a.status === "approved" && a.decided) {
    return (
      <p className={`${styles.banner} ${styles.bannerSuccess}`} role="note">
        <Icon name="check" size={17} strokeWidth={2.2} />
        <span>
          <b>
            Approved by {a.decided.by}, {formatRelativeDay(a.decided.at)}.
          </b>{" "}
          Ready to be paid out to {a.borrowerDetails?.phone ?? "the client's mobile money number"}.
        </span>
      </p>
    );
  }
  if (a.status === "awaiting-borrower") {
    return (
      <p className={`${styles.banner} ${styles.bannerInfo}`} role="note">
        <Icon name="link" size={17} strokeWidth={1.9} />
        <span>
          <b>Online link sent {formatRelativeDay(a.createdAt)}.</b> Waiting for the client to fill in the details and sign with both guarantors.
        </span>
      </p>
    );
  }
  if (a.status === "draft") {
    return (
      <p className={`${styles.banner} ${styles.bannerWarning}`} role="note">
        <Icon name="warning" size={17} strokeWidth={1.9} />
        <span>
          <b>Draft{a.missing ? `: ${a.missing}` : ""}.</b> It goes to the approvers once it's complete and submitted.
        </span>
      </p>
    );
  }
  return null;
}

/** Approve (after the three checks) or send back / reject. Only shown while waiting for approval. */
function DecisionCard({ application: a }: { application: ApplicationDetail }) {
  const showToast = useToast();
  const approve = useApproveApplication(a.id);
  const [checks, setChecks] = useState<Record<CheckKey, boolean>>({ signedPdfMatchesDetails: false, idCopyMatchesNin: false, guarantorsSigned: false });
  const [rejecting, setRejecting] = useState(false);
  const allChecked = CHECKS.every((check) => checks[check.key]);

  if (!a.decision.allowed) {
    return (
      <Card title="Decision">
        <p className={styles.empty}>{a.decision.reason ?? "Waiting for an approver."}</p>
      </Card>
    );
  }

  const error = approve.error instanceof ApiError ? approve.error.message : approve.error ? "The approval didn't go through. Try again." : null;
  return (
    <Card title="Decision">
      <p className={styles.decisionIntro}>Check the signed PDF against the details before approving.</p>
      <div className={styles.checks}>
        {CHECKS.map((check) => (
          <label key={check.key} className={styles.check}>
            <input type="checkbox" checked={checks[check.key]} onChange={(event) => setChecks((current) => ({ ...current, [check.key]: event.target.checked }))} />
            <span>{check.label}</span>
          </label>
        ))}
      </div>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      <div className={styles.decisionActions}>
        <Button variant="secondary" onClick={() => setRejecting(true)} disabled={approve.isPending}>
          Send back or reject
        </Button>
        <Button
          // The panel disappears once approved, so confirm from the request itself (mutate's own callbacks wouldn't run)
          onClick={() =>
            approve
              .mutateAsync({ checks })
              .then(() => showToast({ message: `${a.id} approved. It's ready to be paid out.` }))
              .catch(() => undefined /* shown in the panel */)
          }
          disabled={!allChecked || approve.isPending}
          title={allChecked ? undefined : "Tick all three checks first"}
        >
          {approve.isPending ? "Approving…" : `Approve ${formatUGX(a.amount)}`}
        </Button>
      </div>
      {rejecting && <RejectApplicationDialog application={a} onClose={() => setRejecting(false)} />}
    </Card>
  );
}

/** The signed application, shown in the page from memory (blob:), like the document preview. */
function InlinePdf({ document, title }: { document: DocumentFile; title: string }) {
  const preview = useDocumentPreview(document.id);
  const [url, setUrl] = useState<string | null>(null);
  const ok = preview.data?.type === "application/pdf" && document.contentType === "application/pdf";
  useEffect(() => {
    if (!preview.data || !ok) return;
    const objectUrl = URL.createObjectURL(preview.data);
    setUrl(objectUrl);
    return () => {
      URL.revokeObjectURL(objectUrl);
      setUrl(null);
    };
  }, [preview.data, ok]);

  if (preview.isError) return <p className={styles.empty}>The PDF couldn't be opened.</p>;
  if (preview.isPending || (ok && !url)) return <div className={styles.pdfLoading} aria-busy="true" aria-label="Opening the PDF" />;
  if (!ok) return <p className={styles.empty}>This file can't be shown here. Use Full screen to download it.</p>;
  return <iframe className={styles.pdf} src={url!} title={title} />;
}

function Card({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className={styles.card} aria-label={title}>
      <div className={styles.cardHeader}>
        <h2>{title}</h2>
        {action}
      </div>
      {children}
    </section>
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
