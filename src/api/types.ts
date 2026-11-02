// Response shapes of the API, as documented in docs/api-contract.md.
// The mock API and the screens both use these, so a contract change shows up as a type error.
import type { DataScope, Permission } from "../auth/permissions";

/** GET /search?q= */
export interface SearchResult {
  kind: "loan" | "application";
  id: string;
  title: string;
  subtitle: string;
  /** Where the result opens in the app */
  href: string;
}

/** GET /notifications */
export interface NotificationItem {
  id: string;
  title: string;
  detail: string;
  /** Where the notification leads in the app */
  href: string;
  unread: boolean;
}

/** GET /navigation/badges: counts shown next to menu items */
export interface NavigationBadges {
  applications: number;
}

/** GET /portfolio/risk-summary */
export interface RiskSummary {
  /** own = the user's own portfolio; branch = every loan in the branch */
  scope: "own" | "branch";
  par30Percent: number;
  targetPercent: number;
  loansOver30Days: number;
}

/**
 * GET /dashboard/today: the numbers behind the "Today" boxes on the dashboard.
 * Each section is included only when it applies to the signed-in user, so the
 * same endpoint serves every role.
 */
export interface DashboardToday {
  /** Open loans in the user's portfolio (or the branch), with what's still owed */
  activeLoans?: { count: number; outstanding: number; lateCount: number };
  /** Instalments and promises due today in the user's portfolio */
  collections?: { dueCount: number; collectedAmount: number; expectedAmount: number };
  /** Overdue loans the user should follow up */
  /** `withRecoveryCount`: the user's late loans the recovery team has taken over (not on their follow-up list) */
  followUps?: { overdueCount: number; over30DaysCount: number; withRecoveryCount: number };
  /** The user's draft applications missing documents or guarantor consent */
  applicationsToComplete?: { count: number };
  /** Mobile money received but not linked to a loan (Module 4, Phase 2) */
  unmatchedPayments?: { count: number; amount: number };
  /** Officers' requests to undo a recorded payment */
  paymentReversals?: { count: number; amount: number };
  /** Submitted applications not yet approved or rejected */
  awaitingApproval?: { count: number; over48HoursCount: number };
  /** Approved loans whose money hasn't been paid out */
  approvedNotDisbursed?: { count: number; amount: number };
  /** Password resets and unaccepted invites */
  accessRequests?: { count: number };
}

// ---------- Worklist (GET /worklist) ----------

export type WorklistPriority = "do-first" | "do-today" | "routine";

export interface Borrower {
  name: string;
  phone: string;
  area?: string;
}

interface WorklistTaskBase {
  id: string;
  priority: WorklistPriority;
  status: "open" | "done";
  /** What happened, once done, e.g. "Paid UGX 450,000 · MTN MoMo · 10:42" */
  result?: string;
  /** Short log entries, e.g. "No answer · 10:42" */
  notes: string[];
}

interface LoanTaskBase extends WorklistTaskBase {
  loanId: string;
  borrower: Borrower;
  /** UGX due on this task (instalment, promise or arrears) */
  amountDue: number;
  /** UGX paid towards it today */
  amountPaid: number;
  /** Sign of trouble on the loan, e.g. "Broke a promise to pay on 22 Oct" */
  warning?: string;
}

export interface InstalmentDueTask extends LoanTaskBase {
  type: "instalment-due";
}

export interface PromiseDueTask extends LoanTaskBase {
  type: "promise-due";
  /** ISO date the borrower made the promise */
  promiseMadeOn: string;
  daysPastDue: number;
}

export interface OverdueTask extends LoanTaskBase {
  type: "overdue";
  daysPastDue: number;
}

export interface ApplicationIncompleteTask extends WorklistTaskBase {
  type: "application-incomplete";
  applicationId: string;
  borrower: Borrower;
  amountRequested: number;
  purpose: string;
  /** What's stopping it from going to Finance, e.g. "Guarantor consent missing" */
  missingItem: string;
}

/** Module 4 (Phase 2) */
export interface PaymentUnmatchedTask extends WorklistTaskBase {
  type: "payment-unmatched";
  payment: { provider: "MTN MoMo" | "Airtel Money"; phone: string; amount: number; reference: string; receivedAt: string };
}

export interface ReversalRequestTask extends WorklistTaskBase {
  type: "reversal-request";
  loanId: string;
  requestedBy: string;
  /** ISO date-time */
  requestedAt: string;
  amount: number;
  reason: string;
}

export interface AwaitingApprovalTask extends WorklistTaskBase {
  type: "awaiting-approval";
  applicationId: string;
  borrower: Borrower;
  amountRequested: number;
  purpose: string;
  submittedBy: string;
  hoursWaiting: number;
}

export interface AwaitingDisbursementTask extends WorklistTaskBase {
  type: "awaiting-disbursement";
  loanId: string;
  borrower: Borrower;
  amount: number;
  officerName: string;
  /** ISO date Finance approved it */
  approvedOn: string;
}

export interface AccessRequestTask extends WorklistTaskBase {
  type: "access-request";
  user: { name: string; role: string };
  kind: "password-reset" | "invite-pending";
  /** ISO date-time */
  requestedAt: string;
}

export type WorklistTask =
  | InstalmentDueTask
  | PromiseDueTask
  | OverdueTask
  | ApplicationIncompleteTask
  | PaymentUnmatchedTask
  | ReversalRequestTask
  | AwaitingApprovalTask
  | AwaitingDisbursementTask
  | AccessRequestTask;

export type WorklistTaskType = WorklistTask["type"];

/** POST /worklist/{id}/call-outcome */
export type CallOutcome =
  | { outcome: "promised"; promisedDate: string }
  | { outcome: "no-answer" }
  | { outcome: "field-visit" };

/** POST /worklist/{id}/actions */
export type WorklistAction = "approve-reversal" | "reject-reversal" | "remind-finance" | "send-reset-link" | "resend-invite";

// ---------- Loans and payments ----------

/** GET /loans: loans the user can see, for pickers such as Record payment */
export interface LoanSummary {
  id: string;
  borrowerName: string;
  phone: string;
  /** UGX */
  outstandingBalance: number;
  /** UGX still due today, if an instalment or promise is due */
  dueToday: number | null;
}

export type PaymentMethod = "Cash" | "MTN MoMo" | "Airtel Money";

/** POST /payments body */
export interface RecordPaymentRequest {
  loanId: string;
  amount: number;
  method: PaymentMethod;
  reference?: string;
  /** ISO date; omitted = today. How far back is allowed is in Settings → Payments */
  paidOn?: string;
  /** Required (true) when the amount is more than the balance: the person confirmed the borrower really paid extra */
  surplusConfirmed?: boolean;
}

/** POST /payments response */
export interface RecordPaymentResponse {
  paymentId: string;
  loanId: string;
  balanceBefore: number;
  balanceAfter: number;
  /** UGX paid beyond the balance (QA scenario 3); the loan closes and the team is notified */
  surplus: number;
  /** Worklist task this payment counted towards, if any */
  taskId: string | null;
}

// ---------- Portfolio (dashboard "My portfolio" / "Branch portfolio") ----------

export type PortfolioScope = "own" | "branch";

/** GET /portfolio/risk: PAR figures and their trend (arrears engine, Module 3) */
export interface PortfolioRisk {
  scope: PortfolioScope;
  /** ISO date-time the balances were calculated */
  asOf: string;
  loanCount: number;
  par1Percent: number;
  par30Percent: number;
  par90Percent: number;
  targetPercent: number;
  /** UGX in loans more than 30 days late */
  amountOver30Days: number;
  loansOver30Days: number;
  /** PAR30 at the start of each of the last 12 months, oldest first; the last entry is the current month */
  monthly: { month: string; par30Percent: number }[];
  /** Weekly PAR30 over the same 12 months, oldest first; the last point is today */
  weekly: { date: string; par30Percent: number }[];
}

/** GET /portfolio/arrears: outstanding balance by age (Module 3) */
export interface ArrearsBreakdown {
  scope: PortfolioScope;
  /** UGX */
  totalOutstanding: number;
  current: { amount: number; loans: number };
  bands: { label: string; amount: number; loans: number }[];
  collectionRatePercent: number;
}

/** GET /portfolio/early-warnings (Module 3) */
export interface EarlyWarningList {
  items: {
    loanId: string;
    borrowerName: string;
    daysPastDue: number;
    signal: string;
    officerName: string;
    /** The loan's task on the user's worklist today, if any */
    worklistTask: { id: string; status: "open" | "done"; type: WorklistTaskType } | null;
  }[];
  total: number;
}

/** GET /portfolio/summary: the user's own portfolio (loan officers) */
export interface PortfolioSummary {
  outstandingBalance: number;
  activeLoans: number;
  disbursedThisMonth: { amount: number; count: number };
  clearedThisMonth: number;
  dueThisWeek: number;
}

/** GET /activity: audit log preview */
export interface ActivityList {
  items: {
    id: string;
    actor: { name: string; role: string; photoUrl: string | null };
    description: string;
    /** ISO date-time */
    at: string;
  }[];
  total: number;
}

/** GET /team/performance */
export interface OfficerPerformance {
  officerId: string;
  name: string;
  photoUrl: string | null;
  portfolioAmount: number;
  loanCount: number;
  par30Percent: number;
  collectedToday: number;
  expectedToday: number;
}

// ---------- Borrowers ----------

/** active = loan up to date · in-arrears = loan overdue · cleared = all loans repaid · applicant = application only */
/** A borrower's latest application (a rejected one stays only for people who never borrowed) */
export type BorrowerApplicationStatus = "draft" | "submitted" | "approved" | "rejected";

export type BorrowerStatus = "active" | "in-arrears" | "cleared" | "applicant";

/** One row of GET /borrowers. Deliberately has no National ID number (see docs/security.md). */
export interface BorrowerListItem {
  id: string;
  name: string;
  phone: string;
  area: string;
  status: BorrowerStatus;
  currentLoan: { id: string; balance: number; daysPastDue: number } | null;
  application: { id: string; status: BorrowerApplicationStatus } | null;
  officer: { id: string; name: string };
}

/** GET /borrowers */
export interface BorrowerList {
  items: BorrowerListItem[];
  total: number;
  page: number;
  pageSize: number;
  /** Counts per status for the current search and officer filter, for the tabs */
  counts: Record<BorrowerStatus | "all", number>;
}

export type BorrowerSort = "name" | "balance";

/** GET /officers: loan officers, for the officer filter (branch-wide users) */
export interface OfficerOption {
  id: string;
  name: string;
}

export type RepaymentSchedule = "daily" | "weekly" | "monthly";

/** GET /borrowers/{id}: the current loan, with the figures the profile shows */
export interface BorrowerCurrentLoan {
  id: string;
  product: string;
  /** Amount disbursed */
  principal: number;
  /** Principal plus interest (18% for now; later from the loan product) and any other charges */
  totalRepayable: number;
  balance: number;
  /** Payment frequency on the agreement */
  repaymentSchedule: RepaymentSchedule;
  /** ISO date */
  disbursedOn: string;
  /** The next (or oldest missed) instalment; null once the loan is paid off */
  nextPayment: { dueOn: string; amount: number } | null;
  daysPastDue: number;
  /** UGX overdue; 0 when up to date */
  arrearsAmount: number;
  /** With the recovery team */
  recovery: LoanRecovery | null;
}

/**
 * GET /borrowers/{id}. The National ID number only comes masked; the full number is a separate,
 * audit-logged request (POST /borrowers/{id}/national-id).
 */
export interface BorrowerProfile {
  id: string;
  name: string;
  status: BorrowerStatus;
  phone: string;
  secondaryPhone: string | null;
  /** Address: where they live */
  area: string;
  /** Shop / premises / building / arcade, as on the payment agreement */
  premises: string;
  /** e.g. "CM••••••••••KL" */
  nationalIdMasked: string;
  /** ISO date */
  registeredOn: string;
  officer: { id: string; name: string };
  /** Missing on some older records */
  nextOfKin: { name: string; phone: string; relationship: string } | null;
  /** Missing on some older records */
  gender: "female" | "male" | null;
  currentLoan: BorrowerCurrentLoan | null;
  application: { id: string; status: BorrowerApplicationStatus; amount: number; missing: string | null } | null;
  loansCleared: number;
  /** A new mobile money number waiting for a second person's approval; payouts use `phone` until then */
  pendingPhoneChange: PendingPhoneChange | null;
}

export interface PendingPhoneChange {
  id: string;
  newPhone: string;
  requestedBy: { id: string; name: string };
  /** ISO date-time */
  requestedAt: string;
}

/**
 * PATCH /borrowers/{id}: the details staff can update. Name and National ID can't be changed here.
 * A different `phone` isn't applied: it becomes a pending change for someone else to approve.
 */
export interface BorrowerDetailsUpdate {
  phone: string;
  secondaryPhone: string | null;
  area: string;
  premises: string;
  nextOfKin: { name: string; phone: string; relationship: string };
  gender: "female" | "male";
}

export type BorrowerActivityCategory = "money" | "contact" | "changes" | "access";

/** One event on the borrower's timeline (GET /borrowers/{id}/activity) */
export interface BorrowerActivityItem {
  id: string;
  category: BorrowerActivityCategory;
  /** e.g. "Recorded UGX 250,000 on TL-1042 · MTN MoMo" */
  description: string;
  actor: { name: string; role: string };
  /** ISO date-time */
  at: string;
}

export interface BorrowerActivityPage {
  items: BorrowerActivityItem[];
  /** Pass as `before` to load older events; null when there are none */
  nextBefore: string | null;
}

/** POST /borrowers/{id}/national-id */
export interface NationalIdReveal {
  nationalId: string;
  /** How long the screen may show it before masking it again */
  visibleForSeconds: number;
}

/** One loan in a borrower's history (GET /borrowers/{id}/loans) */
export interface BorrowerLoanRecord {
  id: string;
  product: string;
  /** Amount disbursed */
  principal: number;
  /** ISO date */
  disbursedOn: string;
  /** ISO date; null while the loan is being repaid */
  clearedOn: string | null;
  status: "active" | "in-arrears" | "cleared";
  /** Days late right now (open loans) */
  daysPastDue: number;
  /** The most days late the loan ever was; 0 = always on time */
  mostDaysLate: number;
  /** Whether the signed loan application PDF can be downloaded (GET /loans/{id}/application-pdf) */
  applicationPdfAvailable: boolean;
}

/** GET /borrowers/{id}/loans: newest first, with the borrower's track record */
export interface BorrowerLoanHistory {
  items: BorrowerLoanRecord[];
  summary: {
    loansTaken: number;
    totalBorrowed: number;
    cleared: number;
    /** Cleared loans that were never late */
    clearedOnTime: number;
  };
}

/** The current version of an uploaded document */
export interface DocumentFile {
  id: string;
  fileName: string;
  contentType: "image/jpeg" | "image/png" | "application/pdf";
  sizeBytes: number;
  uploadedBy: string;
  /** ISO date-time */
  uploadedAt: string;
  /** 1 for the original; replacing a document adds a version and keeps the old one */
  version: number;
  /** How it was completed: the paper forms signed and scanned, or filled in and signed online */
  method: "scanned" | "online";
}

/** A guarantor as on the loan application (payment agreement + their consent): name, ID number and phone */
export interface Guarantor {
  name: string;
  phone: string;
  nationalIdMasked: string;
  /** How they know the borrower, e.g. "Sister" */
  relationship: string | null;
}

/** A guarantor as entered on an application */
export interface GuarantorDetails {
  fullName: string;
  nationalId: string;
  phone: string;
  relationship: string;
}

/** A new borrower's details (paper route: typed from the signed forms; online: entered by the borrower) */
export interface NewBorrowerDetails {
  fullName: string;
  nationalId: string;
  phone: string;
  secondaryPhone: string | null;
  gender: "female" | "male";
  /** Address: where they live */
  area: string;
  /** Shop / premises / building / arcade, as on the payment agreement */
  premises: string;
  nextOfKin: { name: string; phone: string };
}

/** A document the borrower should (or may) have, uploaded or not */
export interface DocumentSlot {
  /** Identifies the slot for uploads, e.g. "national-id-front" or "TL-1042:application" */
  key: string;
  label: string;
  required: boolean;
  file: DocumentFile | null;
  /** The loan application can also be completed online through a link the officer sends */
  canCompleteOnline: boolean;
  /** An online link that's been created and not used yet */
  onlineRequest: { createdAt: string; expiresAt: string; createdBy: string } | null;
}

/** POST /borrowers/{id}/online-links: a one-time link to complete the loan application online (sent by the officer, e.g. on WhatsApp) */
export interface OnlineFormLink {
  url: string;
  /** ISO date-time */
  expiresAt: string;
}

/**
 * GET /borrowers/{id}/documents: Identity, Work, then each loan or application, newest first. A loan's
 * document is its loan application: the payment agreement and both guarantor consents in one PDF.
 */
export interface BorrowerDocuments {
  sections: {
    id: string;
    title: string;
    subtitle: string;
    /** The two guarantors named on a loan application */
    guarantors?: Guarantor[];
    slots: DocumentSlot[];
  }[];
}

/**
 * GET /public/forms/{token}: the online loan application the officer sent. Only the loan terms,
 * never anyone's personal details, so a link seen by the wrong person reveals nothing.
 */
export interface OnlineApplicationForm {
  reference: string;
  lender: string;
  terms: {
    amount: number;
    repaymentSchedule: RepaymentSchedule;
    productName: string;
    interestRatePercent: number;
    /** "18% of the amount" or "4% a month" */
    interestLabel: string;
    interest: number;
    /** A fee from the product (0 if none), taken from the payout or added to the repayments */
    fee: number;
    feeCollection: "deducted" | "added";
    totalRepayable: number;
    /** ISO dates */
    firstPaymentOn: string;
    lastPaymentOn: string;
    /** Set when the officer chose the number of payments */
    numberOfPayments?: number;
    /** Each payment (the last one may differ slightly) */
    instalment?: number;
  };
  /** ISO date-time; the link also stops working once the form is submitted */
  expiresAt: string;
}

export interface OnlineApplicationPerson {
  fullName: string;
  nationalId: string;
  phone: string;
}

/**
 * POST /public/forms/{token} (multipart): `details` (this, as JSON), `idFront` and `idBack` (photos
 * of the borrower's National ID), `guarantor1IdFront`, `guarantor1IdBack`, `guarantor2IdFront`, `guarantor2IdBack`
 * (the guarantors' IDs), and `borrowerSignature`, `guarantor1Signature`, `guarantor2Signature`.
 */
export interface OnlineApplicationDetails {
  borrower: NewBorrowerDetails;
  guarantors: [GuarantorDetails, GuarantorDetails];
}

/** Loan terms the officer sets on a new application */
export interface ApplicationTerms {
  /** The loan product chosen; its pricing is copied below so later product changes don't alter this loan */
  productId: string | null;
  amount: number;
  repaymentSchedule: RepaymentSchedule;
  /** ISO date */
  firstPaymentOn: string;
  numberOfPayments: number;
  /** Set by the server from the product when the application is saved */
  pricing?: LoanPricing;
}

/** How interest is charged: once on the loan, or for every day, week or month it runs */
export type InterestBasis = "loan" | "day" | "week" | "month";

/** Interest and fee terms, from a loan product */
export interface LoanPricing {
  productName: string;
  interestRatePercent: number;
  /** "loan": the rate once on the amount borrowed; "day" / "week" / "month": the rate for every day, week or month the loan runs */
  interestPer: InterestBasis;
  fee: LoanFee;
}

export interface LoanFee {
  type: "none" | "percent" | "fixed";
  /** Percent of the amount, or UGX */
  value: number;
  /** "deducted": taken from the payout; "added": added to what the borrower repays */
  collection: "deducted" | "added";
}

/**
 * POST /applications (multipart): `application` (this, as JSON) and, on the paper route, the files:
 * `signedApplication` (one PDF). The ID copies are in that PDF, so no separate ID photos.
 */
export interface NewApplicationRequest {
  /** An existing borrower, or null for someone new */
  borrowerId: string | null;
  terms: ApplicationTerms;
  /** paper: details typed from the signed forms; online: the borrower fills everything in through a link */
  route: "paper" | "online";
  /** Paper route, new borrower: as on their National ID and the agreement (their ID copy is in the signed PDF) */
  newBorrower?: NewBorrowerDetails;
  /** Paper route */
  guarantors?: GuarantorDetails[];
  /** Paper route: false saves a draft (anything may be missing except who the borrower is) */
  submit: boolean;
}

export interface NewApplicationResult {
  id: string;
  /** null until an online application for a new borrower is completed */
  borrowerId: string | null;
  status: "draft" | "submitted";
  /** Online route: the one-time link for the borrower */
  onlineLink: OnlineFormLink | null;
}

/** draft: being completed by the officer · awaiting-borrower: online link sent · submitted: waiting for approval */
export type ApplicationStatus = "draft" | "awaiting-borrower" | "submitted" | "approved" | "rejected";

/** GET /applications */
export interface ApplicationListItem {
  id: string;
  status: ApplicationStatus;
  route: "paper" | "online";
  /** id is null for someone new who hasn't completed the online form yet */
  borrower: { id: string | null; name: string };
  amount: number;
  terms: { repaymentSchedule: RepaymentSchedule; numberOfPayments: number; instalment: number };
  /** What a draft still needs */
  missing: string | null;
  /** Sent back by an approver: why, so the officer can fix it */
  returned: { reason: string; note: string | null; by: string; at: string } | null;
  officer: { id: string; name: string };
  /** ISO date-times */
  createdAt: string;
  submittedAt: string | null;
  decided: { by: string; at: string } | null;
  /** Paid out: the loan it became */
  loanId: string | null;
}

export interface ApplicationList {
  items: ApplicationListItem[];
  total: number;
  page: number;
  pageSize: number;
  /** For the tabs, respecting the search */
  counts: Record<ApplicationStatus, number>;
}

/** GET /applications/{id}: everything an approver checks */
export interface ApplicationDetail extends ApplicationListItem {
  /** The borrower as registered (null until someone new completes the online form) */
  borrowerDetails: { nationalIdMasked: string; phone: string; premises: string; area: string } | null;
  guarantors: Guarantor[];
  schedule: { firstPaymentOn: string; lastPaymentOn: string; interest: number; totalRepayable: number; finalInstalment: number };
  documents: { signedApplication: DocumentFile | null; idFront: DocumentFile | null; idBack: DocumentFile | null };
  /** Whether the signed-in user may approve or reject it now, and if not, why */
  decision: { allowed: boolean; reason: string | null };
}

/** Why an approver doesn't approve. not-eligible closes the application; the others send it back to the officer. */
export type ApplicationRejectionReason = "signature-missing" | "details-mismatch" | "document-unclear" | "other" | "not-eligible";

/** POST /applications/{id}/approve: the approver confirms they checked these */
export interface ApproveApplicationRequest {
  checks: { signedPdfMatchesDetails: boolean; idCopyMatchesNin: boolean; guarantorsSigned: boolean };
}

/** POST /applications/{id}/reject */
export interface RejectApplicationRequest {
  reason: ApplicationRejectionReason;
  /** Required for "other" and "not-eligible" */
  note: string | null;
}

/**
 * GET /applications/{id}/draft: a paper draft as its officer edits it (only to that officer).
 * Includes the guarantors' full NINs, which they entered and may need to correct; each opening is logged.
 */
export interface ApplicationDraft {
  id: string;
  borrower: { id: string; name: string; phone: string; area: string };
  terms: ApplicationTerms;
  guarantors: GuarantorDetails[];
  signedApplication: DocumentFile | null;
  /** Both sides of the borrower's ID copy are on file */
  idCopyComplete: boolean;
  missing: string | null;
  returned: { reason: string; note: string | null; by: string; at: string } | null;
}

/** PATCH /applications/{id} (multipart): `application` (this, as JSON) and optionally a new `signedApplication` PDF */
export interface UpdateApplicationRequest {
  terms: ApplicationTerms;
  guarantors: GuarantorDetails[];
  /** true submits it for approval (everything must be complete); false saves the draft */
  submit: boolean;
}

/** GET /loans/to-disburse: approved applications waiting to be paid out */
export interface LoanToDisburse {
  applicationId: string;
  borrower: { id: string; name: string };
  /** The borrower's mobile money number: where the loan is paid */
  payTo: string;
  amount: number;
  /** What's sent to the borrower: the amount, less a product fee taken from the payout */
  payout: number;
  terms: { repaymentSchedule: RepaymentSchedule; numberOfPayments: number; instalment: number; pricing: LoanPricing };
  officer: { id: string; name: string };
  approved: { by: string; at: string };
  /** Days from payout to the first payment (the gap planned at application), to preview the new dates */
  firstPaymentGapDays: number;
  /** Whether the signed-in user may pay it out now; if not, a short label for the list and the full reason */
  disbursement: { allowed: boolean; label: string | null; reason: string | null };
}

/** Mobile money only for now (Tamu pays out by mobile money); cash may come back later */
export type PayoutMethod = "MTN MoMo" | "Airtel Money";

/** POST /applications/{id}/disburse: the payout, sent by hand in the MVP and recorded here */
export interface DisburseRequest {
  method: PayoutMethod;
  /** The mobile money transaction ID */
  reference: string;
  /** Must equal the approved amount */
  amount: number;
  /** ISO date */
  paidOn: string;
}

export interface DisburseResult {
  loanId: string;
  /** The schedule, moved to start from the payout date */
  firstPaymentOn: string;
  lastPaymentOn: string;
}

export type LoanListTab = "active" | "recovery" | "cleared" | "all";

/** A loan handed to the recovery team (manual for now; an automatic day limit comes once Tamu sets it) */
export interface LoanRecovery {
  /** ISO date-time */
  since: string;
  by: string;
  reason: string;
  note: string | null;
}

export type RecoveryReason = "long-overdue" | "unreachable" | "refuses-to-pay" | "other";

/** One loan in the Loans lists (GET /loans/list) */
export interface LoanListItem {
  id: string;
  borrower: { id: string; name: string };
  phone: string;
  /** Amount disbursed */
  principal: number;
  totalRepayable: number;
  balance: number;
  /** null for older loans recorded without it */
  repaymentSchedule: RepaymentSchedule | null;
  /** ISO dates */
  disbursedOn: string;
  clearedOn: string | null;
  status: "active" | "in-arrears" | "cleared";
  daysPastDue: number;
  /** UGX overdue now */
  arrearsAmount: number;
  /** Cleared loans: the most days late it ever was (0 = always on time) */
  mostDaysLate: number;
  nextPayment: { dueOn: string; amount: number } | null;
  officer: { id: string; name: string };
  recovery: LoanRecovery | null;
}

export interface LoanList {
  items: LoanListItem[];
  total: number;
  page: number;
  pageSize: number;
  /** For the tabs (respecting the search, officer and late filters) */
  counts: { toDisburse: number; active: number; recovery: number; cleared: number; all: number };
  /** For the totals strip, over everything matching (not just this page) */
  totals: { loans: number; outstanding: number; late: number; overdue: number; repaid: number };
}

/** POST /loans/{id}/recovery (requires recovery.manage) */
export interface SendToRecoveryRequest {
  reason: RecoveryReason;
  /** Required for "other" */
  note: string | null;
}

/** POST /loans/{id}/recovery/return (requires recovery.manage): back to the loan officer */
export interface ReturnFromRecoveryRequest {
  /** Why, e.g. "Paid the arrears" or "Agreed a payment plan" */
  note: string;
}

/** One instalment on a loan's repayment schedule */
export interface LoanInstalment {
  number: number;
  /** ISO date */
  dueOn: string;
  amount: number;
  paid: number;
  status: "paid" | "part-paid" | "late" | "due" | "upcoming";
}

/** A repayment received on a loan */
export interface LoanPayment {
  id: string;
  /** ISO date-time */
  paidAt: string;
  amount: number;
  method: "MTN MoMo" | "Airtel Money" | "Cash";
  reference: string | null;
  recordedBy: string;
}

/** GET /loans/{id} */
export interface LoanDetail {
  id: string;
  status: "active" | "in-arrears" | "cleared";
  borrower: { id: string; name: string; phone: string };
  officer: { id: string; name: string };
  product: string;
  principal: number;
  interest: number;
  totalRepayable: number;
  /** Late fees so far under the product's rule (shown separately; the backend adds them to what's owed) */
  lateFees: { amount: number; rule: string };
  repaid: number;
  balance: number;
  repaymentSchedule: RepaymentSchedule | null;
  /** ISO dates */
  disbursedOn: string;
  clearedOn: string | null;
  daysPastDue: number;
  arrearsAmount: number;
  mostDaysLate: number;
  nextPayment: { dueOn: string; amount: number } | null;
  recovery: LoanRecovery | null;
  /** Where it came from, when known */
  applicationId: string | null;
  approvedBy: string | null;
  payout: { method: string; reference: string; by: string; paidOn: string } | null;
  /** Empty for older loans recorded before schedules were kept */
  schedule: LoanInstalment[];
  /** Newest first; empty for older loans */
  payments: LoanPayment[];
  signedApplication: DocumentFile | null;
}

/** One repayment in the Payments list (GET /payments/list) */
export interface PaymentListItem {
  id: string;
  /** ISO date-time */
  paidAt: string;
  amount: number;
  method: "MTN MoMo" | "Airtel Money" | "Cash";
  reference: string | null;
  recordedBy: string;
  loanId: string;
  borrower: { id: string; name: string };
  officer: { id: string; name: string };
}

export interface PaymentList {
  items: PaymentListItem[];
  total: number;
  page: number;
  pageSize: number;
  /** Over everything matching */
  totals: { collected: number; payments: number; byMethod: Record<"MTN MoMo" | "Airtel Money" | "Cash", number> };
}

// ---------- Settings: staff users and roles ----------

export type StaffStatus = "active" | "invited" | "deactivated";

/** One staff account (GET /staff) */
export interface StaffMember {
  id: string;
  name: string;
  email: string;
  phone: string;
  photoUrl: string | null;
  role: { id: string; name: string };
  /** Their market (the API calls it a branch), e.g. "Mbarara" */
  branch: string;
  status: StaffStatus;
  /** ISO date-time; null if they've never signed in */
  lastSignInAt: string | null;
  /** Invited: when the invite was sent and when its link stops working */
  invite: { sentAt: string; expiresAt: string; expired: boolean } | null;
  /** Deactivated: when and by whom */
  deactivated: { at: string; by: string } | null;
  /** Borrowers this person looks after (they move to someone else before deactivation) */
  portfolio: { borrowers: number; activeLoans: number; openApplications: number };
}

/** A role (GET /roles). Built-in roles can't be changed. */
export interface RoleSummary {
  id: string;
  name: string;
  description: string;
  builtIn: boolean;
  dataScope: DataScope;
  permissions: Permission[];
  /** Active and invited users with this role */
  userCount: number;
}

/** POST /staff/invites */
export interface InviteStaffRequest {
  name: string;
  email: string;
  phone: string;
  roleId: string;
  /** One of the markets in business settings */
  branch: string;
}

/** POST /staff/{id}/deactivate */
export interface DeactivateStaffRequest {
  /** Required when they look after borrowers */
  reassignTo: string | null;
  reason: string;
}

/** POST /roles and PUT /roles/{id} */
export interface SaveRoleRequest {
  name: string;
  description: string;
  dataScope: DataScope;
  permissions: Permission[];
}

// ---------- Settings: loan products ----------

export type LoanProductStatus = "active" | "archived";

/** A loan product (GET /loan-products): the terms an officer picks from on a new application */
export interface LoanProduct {
  id: string;
  name: string;
  description: string;
  status: LoanProductStatus;
  repaymentSchedule: RepaymentSchedule;
  interest: { ratePercent: number; per: InterestBasis };
  /** UGX */
  amount: { min: number; max: number };
  /** How long the loan runs, in payments: e.g. 3 for a three-month monthly loan */
  numberOfPayments: number;
  fee: LoanFee;
  penalty: LatePenalty;
  /** Open loans and applications on this product */
  inUse: number;
  updatedAt: string;
  updatedBy: string;
}

/** Charged when an instalment is late */
export interface LatePenalty {
  type: "none" | "percent" | "fixed";
  /** Percent of the overdue amount, or UGX */
  value: number;
  /** Once for each missed payment, or for every day it stays unpaid */
  per: "missed-payment" | "day";
  /** Days after the due date before anything is charged */
  graceDays: number;
}

/** POST /loan-products and PUT /loan-products/{id} */
export type SaveLoanProductRequest = Omit<LoanProduct, "id" | "status" | "inUse" | "updatedAt" | "updatedBy">;

// ---------- Settings: system settings ----------

export interface PayoutAccount {
  method: "MTN MoMo" | "Airtel Money";
  number: string;
  accountName: string;
}

export interface BusinessSettings {
  /** Legal name, as on agreements */
  name: string;
  /** Short name used in messages and the online form */
  shortName: string;
  address: string;
  phone: string;
  email: string;
  /** Tamu's accounts that loans are paid out from */
  payoutAccounts: PayoutAccount[];
  /** Where Tamu works; staff each belong to one. Tamu calls them markets (the API keeps "branch") */
  branches: string[];
}

export interface LoanRulesSettings {
  /** Whoever approved a loan can't pay it out */
  approverCannotDisburse: boolean;
  /** Whoever started an application can't approve it */
  creatorCannotApprove: boolean;
  /** A new mobile money number needs a second person's approval */
  phoneChangeNeedsApproval: boolean;
  /** A borrower can't get a new loan while one is open */
  oneOpenLoanPerBorrower: boolean;
  /** Days late after which recovery applies (null = off) */
  recoveryAfterDaysLate: number | null;
  /** "suggest": loans that late are marked ready for someone to send; "auto": they're sent to recovery automatically */
  recoveryMode: "suggest" | "auto";
  /** Loans this many days late are shown in red */
  seriouslyLateDays: number;
  /** The PAR30 the business aims to stay under, e.g. 5 (%); dashboards compare against it */
  par30TargetPercent: number;
  /** Late loans show as early warnings from this many days late */
  earlyWarningDays: number;
  /** How long an online application link works before it expires */
  onlineLinkValidHours: number;
}

export interface PaymentSettings {
  /** Accepted for repayments */
  repaymentMethods: PaymentMethod[];
  /** Used to pay out loans */
  payoutMethods: ("MTN MoMo" | "Airtel Money")[];
  /** A mobile money transaction ID must be entered with each mobile money repayment */
  referenceRequired: boolean;
  /** How many days back a repayment can be dated (0 = today only) */
  backdateDays: number;
  /** Payments bigger than the balance are accepted (the extra is recorded) */
  allowOverpayment: boolean;
  /** The most a payment may go over the balance, as a % of the balance; stops typing mistakes like an extra zero */
  maxOverpaymentPercent: number;
}

export interface SecuritySettings {
  idleTimeoutMinutes: number;
  nationalIdVisibleSeconds: number;
  inviteValidHours: number;
  maxFailedSignIns: number;
  lockoutMinutes: number;
  minPasswordLength: number;
}

/** GET /settings (every signed-in user: the app follows these) */
export interface SystemSettings {
  business: BusinessSettings;
  loanRules: LoanRulesSettings;
  payments: PaymentSettings;
  security: SecuritySettings;
  /** Last change to each section */
  changed: Record<"business" | "loanRules" | "payments" | "security", { at: string; by: string } | null>;
}

export type SettingsSection = keyof Omit<SystemSettings, "changed">;

// ---------- Audit log ----------

export type AuditCategory = "money" | "decisions" | "access" | "borrowers" | "admin" | "signin";

/** One event (GET /audit) */
export interface AuditEvent {
  id: string;
  /** ISO date-time */
  at: string;
  /** Who did it (a person, a borrower on the online form, or an automatic rule) */
  actor: { id: string | null; name: string; role: string; photoUrl: string | null };
  category: AuditCategory;
  description: string;
  /** The loan or application it's about, if any */
  target: { label: string; href: string } | null;
  /** Before → after values, for changes */
  details: { label: string; value: string }[] | null;
}

export interface AuditPage {
  items: AuditEvent[];
  total: number;
  page: number;
  pageSize: number;
  /** Everyone who appears in the log, for the Person filter */
  people: { id: string; name: string }[];
}

// ---------- My account ----------

/** GET /me/profile: the signed-in person's own details */
export interface MyProfile {
  id: string;
  name: string;
  email: string;
  phone: string;
  photoUrl: string | null;
  branch: string;
  role: { id: string; name: string };
  /** The last sign-ins to this account, newest first (including failed attempts) */
  recentSignIns: { at: string; device: string; success: boolean }[];
}

/** POST /me/password */
export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}

/** GET /me/sessions: where this account is signed in */
export interface SignedInDevice {
  id: string;
  device: string;
  location: string;
  /** ISO date-time */
  lastActiveAt: string;
  current: boolean;
}

/** GET /support/contacts: who staff can ask for help */
export interface SupportContacts {
  admins: { name: string; phone: string; email: string }[];
  business: { name: string; phone: string; email: string };
  /** The system's developers, for technical problems */
  technical: { name: string; phones: string[]; email: string };
}

// ---------- Reports ----------

export type ReportName = "portfolio" | "collections" | "disbursements" | "officers";
export type ReportValueFormat = "ugx" | "count" | "percent" | "text" | "date";

export interface ReportChart {
  title: string;
  /** "trend": area line over days, weeks or months; "donut": how a total splits; "bars": one bar per category */
  kind: "trend" | "donut" | "bars";
  format: ReportValueFormat;
  /** Name of the main series, and of the optional second one drawn as a dashed line (e.g. expected) */
  series: string;
  targetSeries: string | null;
  /** Donut slices that run in order (e.g. how late), shaded light to dark after the first */
  ordered?: boolean;
  points: { label: string; value: number; target: number | null }[];
}

/** GET /reports/{name}?from=&to=: one report, the same shape for all four */
export interface Report {
  name: ReportName;
  /** Whose loans: the signed-in officer's, or the branch */
  scope: "own" | "branch";
  /** ISO dates; the Portfolio report is a snapshot as of `to` */
  from: string;
  to: string;
  /** 3–4 headline numbers */
  figures: { label: string; value: number; format: ReportValueFormat; note: string | null }[];
  /** 1–2 charts: usually a trend over time or a comparison, then a donut of how the total splits */
  charts: ReportChart[];
  table: {
    title: string;
    columns: { key: string; label: string; format: ReportValueFormat }[];
    rows: Record<string, string | number | null>[];
    /** A totals row, if the table adds up */
    total: Record<string, string | number | null> | null;
  };
}
