import "./seed"; // the sample data, before anything reads it
// Mock API endpoints. Each handler matches an endpoint in docs/api-contract.md;
// keep the two in step so the contract stays the backend developer's spec.
import { http, HttpResponse, delay } from "msw";
import { formatShortDate, dayCount } from "../lib/format";
import type {
  ActivityList,
  NotificationHistoryPage,
  ArrearsBreakdown,
  BorrowerList,
  BorrowerActivityCategory,
  BorrowerActivityPage,
  BorrowerDetailsUpdate,
  BorrowerDocuments,
  BorrowerListItem,
  BorrowerApplicationStatus,
  ApplicationDetail,
  DisburseRequest,
  DisburseResult,
  LoanToDisburse,
  LoanDetail,
  PaymentList,
  PaymentListItem,
  LoanInstalment,
  LoanList,
  LoanListItem,
  LoanListTab,
  RecoveryReason,
  ReturnFromRecoveryRequest,
  SendToRecoveryRequest,
  ApplicationDraft,
  UpdateApplicationRequest,
  ApplicationList,
  ApplicationListItem,
  ApplicationRejectionReason,
  ApproveApplicationRequest,
  RejectApplicationRequest,
  ApplicationStatus,
  NewApplicationRequest,
  NewApplicationResult,
  DocumentFile,
  BorrowerLoanHistory,
  BorrowerLoanRecord,
  BorrowerProfile,
  NationalIdReveal,
  BorrowerSort,
  BorrowerStatus,
  OfficerOption,
  OnlineApplicationDetails,
  OnlineApplicationForm,
  OnlineFormLink,
  PendingPhoneChange,
  CallOutcome,
  EarlyWarningList,
  OfficerPerformance,
  PortfolioRisk,
  PortfolioSummary,
  DashboardToday,
  LoanSummary,
  NavigationBadges,
  NotificationItem,
  RecordPaymentRequest,
  RecordPaymentResponse,
  RiskSummary,
  SearchResult,
  WorklistAction,
  WorklistTask,
  StaffMember,
  RoleSummary,
  ApplicationTerms,
  LoanProduct,
  SaveLoanProductRequest,
  SettingsSection,
  SystemSettings,
  AuditCategory,
  AuditEvent,
  AuditPage,
  ChangePasswordRequest,
  Report,
  ReportName,
  MyProfile,
  SignedInDevice,
  SupportContacts,
  NewBorrowerDetails,
  InviteStaffRequest,
  PasswordLinkInfo,
  SetPasswordRequest,
  DeactivateStaffRequest,
  SaveRoleRequest,
} from "../api/types";
import { PERMISSIONS, withRequirements, type Permission } from "../auth/permissions";
import { findProduct, loanProducts, pricingOf, productForSchedule, SETTING_LIMITS, systemSettings } from "./systemSettings";
import { findStaff, inviteExpired, nextStaffId, portfolioOf, staff, type MockStaff } from "./staff";
import type { CurrentUser } from "../auth/types";
import {
  activityLog,
  applications,
  currentDemoUser,
  DEMO_PASSWORD,
  loans,
  officers,
  roles,
  setDemoSession,
  signedInDemoUser,
  users,
  type MockUser,
} from "./fixtures";
import { borrowers, borrowerStatus } from "./borrowerDirectory";
import { arrears, earlyWarnings, officerSummary, par30History, riskNow, teamPerformance, type OfficerFilter } from "./portfolioFigures";
import { categoryOf, targetOf } from "./auditLog";
import { notificationHistoryFor } from "./notificationHistory";
import { buildPdf, type PdfLine } from "./samplePdf";
import { formatValue } from "../modules/reports/reportFormat";
import { borrowerDetails, maskNationalId, nextPayment } from "./borrowerProfiles";
import { pastLoans } from "./loanHistory";
import { addApplicationSection, addDocumentVersion, markApplicationPaidOut, applicationGuarantors, updateApplicationForms, applicationVersionFor, createOnlineLinkForApplication, borrowerDocumentsResponse, createOnlineLink, describeSlot, documentFile, findDocument, findSlot, ingestOnlineApplications } from "./borrowerDocuments";
import { createPasswordLink, ensureDemoPasswordLinks, findPasswordLink, markPasswordLinkUsed, passwordLinkProblem, revokePasswordLinks, sendDemoEmail } from "./passwordLinks";
import { assignBorrower, findOnlineApplication, linkProblem, submitOnlineApplication, submittedForNewBorrowers, type StoredImage } from "./onlineApplications";
import { nextBorrowerId } from "./borrowerDirectory";
import { loanPayments, recordLoanPayment } from "./loanPayments";
import { describeLength, describePenalty, feeAmount, INTEREST_LIMITS, FIRST_PAYMENT_WITHIN_DAYS, latePenalty, paymentDate, summariseTerms } from "../lib/repaymentSchedule";
import { borrowerActivityPage, recordBorrowerEvent } from "./borrowerActivity";
import { addFollowUpTask, clockTime, describePayment, findTask, nextPaymentId, openTaskForLoan, rememberForUndo, tasksFor, tasksForUser, ugx, undo } from "./worklistStore";

const API_BASE = "/api";
const MIN_SEARCH_LENGTH = 2;
const MAX_SEARCH_RESULTS = 6;

const hasPermission = (user: MockUser, permission: Permission) => !!roles[user.roleId]?.permissions.includes(permission);

/** Their role sees the whole branch (otherwise only the clients they look after) */
const seesBranch = (user: MockUser) => roles[user.roleId]?.dataScope === "branch";

/** Officers see only their own clients; anyone with loans.view.all sees the whole branch. */
const canSeeRecord = (user: MockUser, officerId: string) => seesBranch(user) || officerId === user.id;

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

/** The real file type from the first bytes (what the backend must check too), or null if not allowed. */
async function sniffDocumentType(file: Blob): Promise<DocumentFile["contentType"] | null> {
  const bytes = new Uint8Array(await file.slice(0, 4).arrayBuffer());
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) return "application/pdf";
  return null;
}

/** "0772418230", "+256 772 418 230" -> "0772 418 230"; null if it isn't a Ugandan mobile number. */
function normalisePhone(input: string): string | null {
  let digits = input.replace(/\D/g, "");
  if (digits.startsWith("256")) digits = `0${digits.slice(3)}`;
  return /^07\d{8}$/.test(digits) ? `${digits.slice(0, 4)} ${digits.slice(4, 7)} ${digits.slice(7)}` : null;
}

const NATIONAL_ID = /^C[MF][A-Z0-9]{12}$/;
// The sample links for the "Set your password" screens (see passwordLinks.ts)
ensureDemoPasswordLinks(systemSettings.security.inviteValidHours);

const PASSWORD_LINK_PROBLEMS = {
  invalid: "This link isn't valid. Check that you opened the whole link, or ask your admin to send a new one.",
  used: "This link has already been used.",
  replaced: "This link was replaced by a newer one.",
  expired: "This link has expired. Ask your admin to send a new one.",
};

const LINK_PROBLEM_MESSAGES = {
  invalid: "This link isn't valid. Check you copied all of it, or ask your loan officer for a new one.",
  used: "This application has already been submitted, so the link no longer works.",
  replaced: "Your loan officer has sent a newer link. Use that one instead.",
  expired: "This link has expired. Ask your loan officer for a new one.",
};

/**
 * Online applications submitted (in any tab) become documents the next time staff look at the
 * client; this records them on the timeline and in the audit log once.
 */
function syncOnlineApplications(borrower: (typeof borrowers)[number]) {
  for (const application of ingestOnlineApplications(borrower)) {
    const signer = application.submission!.details.borrower.fullName;
    recordBorrowerEvent(borrower, "changes", `Completed and signed the loan application for ${application.form.reference} online, with both guarantors`, { name: signer, role: "Client" });
    activityLog.unshift({ id: `act-${Date.now()}-${application.token.slice(0, 6)}`, actor: { name: signer, role: "Client", photoUrl: null }, description: `submitted the online loan application ${application.form.reference}`, at: application.submittedAt! });
    // Complete now: it goes to the approvers
    const app = applications.find((a) => a.id === application.form.reference);
    if (app) {
      app.status = "submitted";
      app.submittedAt = application.submittedAt;
      app.missing = null;
      app.guarantors = application.submission!.details.guarantors;
    }
  }
}

// The seeded applications: when they were started and submitted (relative to now)
applications.forEach((app, index) => {
  app.createdAt ??= new Date(Date.now() - (index + 1) * 26 * 3_600_000).toISOString();
  if (app.status === "submitted") app.submittedAt ??= new Date(Date.now() - (index + 1) * 5 * 3_600_000).toISOString();
});

/** The terms, worked out (seeded applications without terms: 26 weekly payments). */
function termsOf(app: (typeof applications)[number]) {
  const base = app.terms ?? { productId: null, amount: app.amount, repaymentSchedule: "weekly" as const, firstPaymentOn: new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10), numberOfPayments: 26 };
  // Seeded applications made before products: the product for their frequency
  const product = findProduct(base.productId) ?? productForSchedule(base.repaymentSchedule);
  const terms = { ...base, productId: product.id, pricing: base.pricing ?? pricingOf(product) };
  return { ...terms, instalment: summariseTerms(terms).instalment };
}

/**
 * Checks terms against their loan product (Settings → Loan products) and copies its pricing onto
 * them, so a later change to the product doesn't alter this loan. Returns a problem, or null.
 * `keepProductId`: an existing application may keep a product that has since been archived.
 */
function checkTerms(terms: ApplicationTerms | undefined, keepProductId: string | null = null): string | null {
  if (!terms) return "Choose a loan product.";
  const product = findProduct(terms.productId);
  if (!product || (product.status !== "active" && product.id !== keepProductId)) return "Choose a loan product that's on offer.";
  const ugx = (amount: number) => `UGX ${amount.toLocaleString("en-US")}`;
  if (!Number.isInteger(terms.amount) || terms.amount < product.amount.min || terms.amount > product.amount.max)
    return `${product.name}: borrow between ${ugx(product.amount.min)} and ${ugx(product.amount.max)}.`;
  if (terms.repaymentSchedule !== product.repaymentSchedule) return `${product.name} is repaid ${product.repaymentSchedule}.`;
  const today = new Date().toLocaleDateString("en-CA");
  const latest = paymentDate(today, "daily", FIRST_PAYMENT_WITHIN_DAYS[product.repaymentSchedule]);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(terms.firstPaymentOn ?? "") || terms.firstPaymentOn < today || terms.firstPaymentOn > latest)
    return `The first payment must be within ${FIRST_PAYMENT_WITHIN_DAYS[product.repaymentSchedule]} days, from today on.`;
  // The product sets the loan's length
  if (terms.numberOfPayments !== product.numberOfPayments) return `${product.name} runs ${describeLength(product.repaymentSchedule, product.numberOfPayments)}.`;
  terms.pricing = pricingOf(product);
  return null;
}

/** The status the screens use: an open online application is waiting for the client. */
const applicationStatus = (app: (typeof applications)[number]): ApplicationStatus =>
  app.status === "draft" && app.route === "online" && app.missing === "Waiting for the client to complete it online" ? "awaiting-borrower" : app.status;

function applicationListItem(app: (typeof applications)[number]): ApplicationListItem {
  const borrower = app.borrowerId ? borrowers.find((b) => b.id === app.borrowerId) : borrowers.find((b) => b.applicationId === app.id);
  const terms = termsOf(app);
  return {
    id: app.id,
    status: applicationStatus(app),
    route: app.route ?? "paper",
    borrower: { id: borrower?.id ?? null, name: borrower?.name ?? app.borrowerName },
    amount: app.amount,
    terms: { repaymentSchedule: terms.repaymentSchedule, numberOfPayments: terms.numberOfPayments, instalment: terms.instalment },
    missing: app.status === "draft" ? app.missing : null,
    returned: app.returned ?? null,
    officer: { id: app.officerId, name: officers.find((o) => o.id === app.officerId)?.name ?? "" },
    createdAt: app.createdAt!,
    submittedAt: app.submittedAt ?? null,
    decided: app.decided ? { by: app.decided.by, at: app.decided.at } : null,
    loanId: app.loanId ?? null,
  };
}

const REJECTION_REASONS: Record<ApplicationRejectionReason, string> = {
  "signature-missing": "Signature missing",
  "details-mismatch": "Details don't match the forms",
  "document-unclear": "Document unclear or incomplete",
  other: "Other",
  "not-eligible": "Not eligible",
};

/** An application the user may see: officers their own, approvers and branch-wide users all. */
function visibleApplication(user: MockUser, id: string) {
  const app = applications.find((a) => a.id === id);
  if (!app) return undefined;
  const branchWide = seesBranch(user) || hasPermission(user, "applications.approve");
  return branchWide || app.officerId === user.id ? app : undefined;
}

function applicationDetail(app: (typeof applications)[number], user: MockUser): ApplicationDetail {
  const item = applicationListItem(app);
  const borrower = item.borrower.id ? borrowers.find((b) => b.id === item.borrower.id) : undefined;
  const terms = termsOf(app);
  const summary = summariseTerms(terms);
  const sections = borrower ? borrowerDocumentsResponse(borrower).sections : [];
  const own = sections.find((section) => section.id === app.id);
  const identity = sections.find((section) => section.id === "identity");
  const details = borrower ? borrowerDetails.get(borrower.id) : undefined;
  // Two people: whoever created the application can't approve it
  const reason = !hasPermission(user, "applications.approve")
    ? "Waiting for an approver (Finance) to check and approve it."
    : app.status !== "submitted"
      ? null
      : app.officerId === user.id && systemSettings.loanRules.creatorCannotApprove
        ? "You created this application, so someone else must approve it."
        : null;
  return {
    ...item,
    borrowerDetails: borrower && details ? { nationalIdMasked: maskNationalId(borrower.nin), phone: borrower.phone, premises: details.premises, occupation: details.occupation, area: borrower.area } : null,
    guarantors: own?.guarantors ?? [],
    schedule: { firstPaymentOn: terms.firstPaymentOn, lastPaymentOn: summary.lastPaymentOn, interest: summary.interest, totalRepayable: summary.totalRepayable, finalInstalment: summary.finalInstalment },
    documents: {
      signedApplication: own?.slots[0]?.file ?? null,
      idFront: identity?.slots.find((slot) => slot.key === "national-id-front")?.file ?? null,
      idBack: identity?.slots.find((slot) => slot.key === "national-id-back")?.file ?? null,
    },
    decision: { allowed: app.status === "submitted" && !reason, reason },
  };
}

/** A paper draft its officer may edit: their own, still a draft, with a registered client. */
function editableDraft(user: MockUser, id: string) {
  const app = applications.find((a) => a.id === id);
  if (!app || app.officerId !== user.id || !hasPermission(user, "applications.create")) return { error: HttpResponse.json({ message: "That draft wasn't found." }, { status: 404 }) };
  if (app.status !== "draft" || app.route === "online") return { error: HttpResponse.json({ message: "Only paper drafts can be edited here." }, { status: 409 }) };
  const borrower = app.borrowerId ? borrowers.find((b) => b.id === app.borrowerId) : borrowers.find((b) => b.applicationId === app.id);
  if (!borrower) return { error: HttpResponse.json({ message: "That draft wasn't found." }, { status: 404 }) };
  return { app, borrower };
}

/** What a draft still needs, first thing first (null when it can be submitted). */
function draftMissing(app: (typeof applications)[number], borrower: (typeof borrowers)[number]) {
  // The ID copies are in the signed PDF, so there's nothing else to check for
  const signed = borrowerDocumentsResponse(borrower).sections.find((section) => section.id === app.id)?.slots[0]?.file;
  if ((app.guarantors ?? applicationGuarantors(borrower, app.id)).length < 2) return "Guarantor details missing";
  if (!signed) return "Signed application PDF missing";
  return null;
}

const RECOVERY_REASONS: Record<RecoveryReason, string> = {
  "long-overdue": "Long overdue",
  unreachable: "Can't be reached",
  "refuses-to-pay": "Refuses to pay",
  other: "Other",
};

// Sample data: each officer's most overdue loan, if over 60 days late, is already with the recovery team
officers
  .map((officer) => loans.filter((loan) => loan.officerId === officer.id && loan.daysPastDue > 60).sort((a, b) => b.daysPastDue - a.daysPastDue)[0])
  .filter((loan): loan is (typeof loans)[number] => !!loan)
  .forEach((loan, index) => {
    loan.recovery = {
      since: new Date(Date.now() - (3 + index * 2) * 86_400_000).toISOString(),
      by: "Moses Okot",
      byId: "u-moses",
      reason: index === 1 ? RECOVERY_REASONS.unreachable : RECOVERY_REASONS["long-overdue"],
      note: index === 1 ? "Phone off for three weeks; moved from Kawempe." : null,
    };
  });

const recoveryOf = (loan: (typeof loans)[number]) => (loan.recovery ? { since: loan.recovery.since, by: loan.recovery.by, reason: loan.recovery.reason, note: loan.recovery.note } : null);

/** Every loan the user may see, active and cleared, for the Loans lists. */
function loanListItems(user: MockUser): LoanListItem[] {
  const officerName = (id: string) => officers.find((o) => o.id === id)?.name ?? "";
  const items: LoanListItem[] = [];
  for (const loan of loans) {
    if (!canSeeRecord(user, loan.officerId)) continue;
    const borrower = borrowers.find((b) => b.currentLoanId === loan.id);
    const terms = borrower ? borrowerDetails.get(borrower.id)?.loanTerms : null;
    if (!borrower || !terms) continue;
    const paidOff = loan.outstandingBalance <= 0;
    const instalment = paidOff ? null : nextPayment(terms, loan.outstandingBalance);
    items.push({
      id: loan.id,
      borrower: { id: borrower.id, name: borrower.name },
      phone: borrower.phone,
      principal: terms.principal,
      totalRepayable: terms.totalRepayable,
      balance: Math.max(0, loan.outstandingBalance),
      repaymentSchedule: terms.repaymentSchedule,
      disbursedOn: terms.disbursedOn,
      clearedOn: paidOff ? new Date().toISOString().slice(0, 10) : null,
      status: paidOff ? "cleared" : loan.daysPastDue > 0 ? "in-arrears" : "active",
      daysPastDue: paidOff ? 0 : loan.daysPastDue,
      // Late loans recorded without an overdue amount: at least the instalment that was missed
      arrearsAmount: paidOff || loan.daysPastDue <= 0 ? 0 : Math.min(loan.arrearsAmount || (instalment?.amount ?? 0), loan.outstandingBalance),
      mostDaysLate: loan.daysPastDue,
      nextPayment: paidOff ? null : instalment,
      officer: { id: loan.officerId, name: officerName(loan.officerId) },
      recovery: paidOff ? null : recoveryOf(loan),
    });
  }
  for (const past of pastLoans) {
    const borrower = borrowers.find((b) => b.id === past.borrowerId);
    if (!borrower || !canSeeRecord(user, borrower.officerId)) continue;
    const total = past.totalRepayable;
    items.push({
      id: past.id,
      borrower: { id: borrower.id, name: borrower.name },
      phone: borrower.phone,
      principal: past.principal,
      totalRepayable: total,
      balance: 0,
      repaymentSchedule: past.repaymentSchedule,
      disbursedOn: past.disbursedOn,
      clearedOn: past.clearedOn,
      status: "cleared",
      daysPastDue: 0,
      arrearsAmount: 0,
      mostDaysLate: past.mostDaysLate,
      nextPayment: null,
      officer: { id: borrower.officerId, name: officerName(borrower.officerId) },
      recovery: null,
    });
  }
  return items;
}

/** A stored document as the API shows it: never the file itself or how it was signed. */
const publicDocument = (version: ReturnType<typeof applicationVersionFor>): DocumentFile | null =>
  version
    ? { id: version.id, fileName: version.fileName, contentType: version.contentType, sizeBytes: version.sizeBytes, uploadedBy: version.uploadedBy, uploadedAt: version.uploadedAt, version: version.version, method: version.method }
    : null;

/** Payout transaction IDs already recorded: one transaction can't pay out two loans. */
const usedPayoutReferences = new Set<string>();
const PAYOUT_REFERENCE = /^[A-Za-z0-9][A-Za-z0-9.-]{5,29}$/;

/** Whether this user may pay out this approved application now, and if not, why. */
function disbursementCheck(user: MockUser, app: (typeof applications)[number]) {
  if (!hasPermission(user, "loans.disburse")) return { allowed: false, label: "Waiting for Finance", reason: "Finance pays out approved loans." };
  if (app.status !== "approved" || app.loanId) return { allowed: false, label: "Not waiting", reason: "This isn't waiting to be paid out." };
  if (systemSettings.loanRules.approverCannotDisburse && app.decided?.byId === user.id) return { allowed: false, label: "Approved by you", reason: "You approved this loan, so someone else must pay it out." };
  return { allowed: true, label: null, reason: null };
}

const nextLoanId = () => `TL-${Math.max(...loans.map((l) => Number(l.id.slice(3)) || 0)) + 1}`;
const daysBetween = (fromIso: string, toIso: string) => Math.round((new Date(`${toIso.slice(0, 10)}T00:00:00`).getTime() - new Date(`${fromIso.slice(0, 10)}T00:00:00`).getTime()) / 86_400_000);

/** The next application number, e.g. "APP-322". */
const nextApplicationId = () => `APP-${Math.max(...applications.map((a) => Number(a.id.slice(4)))) + 1}`;

/** Registers someone new (from a paper application, or an online one they completed). */
function registerBorrower(person: NewBorrowerDetails, officerId: string) {
  const borrower = {
    id: nextBorrowerId(),
    name: person.fullName,
    phone: person.phone,
    area: person.area,
    nin: person.nationalId,
    officerId,
    registeredOn: new Date().toISOString().slice(0, 10),
    currentLoanId: null,
    applicationId: null,
    clearedLoans: 0,
    addedInSession: true,
  };
  borrowers.push(borrower);
  borrowerDetails.set(borrower.id, {
    premises: person.premises,
    occupation: person.occupation?.trim() ?? "",
    secondaryPhone: person.secondaryPhone ?? null,
    nextOfKin: person.nextOfKin ? { name: person.nextOfKin.name, phone: person.nextOfKin.phone, relationship: "" } : null,
    gender: person.gender ?? null,
    loanTerms: null,
  });
  return borrower as (typeof borrowers)[number];
}

/**
 * Online applications completed by people who weren't clients yet (possibly in another tab):
 * register them in the officer's portfolio, or match an existing client by National ID.
 */
function syncNewBorrowerApplications() {
  for (const entry of submittedForNewBorrowers()) {
    const details = entry.submission!.details;
    const borrower = borrowers.find((b) => b.nin === details.borrower.nationalId) ?? registerBorrower(details.borrower, entry.officerId);
    let app = applications.find((a) => a.id === entry.form.reference);
    if (!app) {
      // Created in a tab that has since been closed: rebuild it from the link
      const { terms } = entry.form;
      let numberOfPayments = 1;
      while (paymentDate(terms.firstPaymentOn, terms.repaymentSchedule, numberOfPayments - 1) < terms.lastPaymentOn && numberOfPayments < 400) numberOfPayments++;
      app = { id: entry.form.reference, borrowerName: details.borrower.fullName, phone: details.borrower.phone, amount: terms.amount, purpose: "", officerId: entry.officerId, status: "draft", missing: null, route: "online", createdAt: entry.createdAt,
        terms: { productId: loanProducts.find((product) => product.name === terms.productName)?.id ?? null, amount: terms.amount, repaymentSchedule: terms.repaymentSchedule, firstPaymentOn: terms.firstPaymentOn, numberOfPayments } };
      applications.push(app);
    }
    Object.assign(app, { borrowerId: borrower.id, borrowerName: details.borrower.fullName, phone: details.borrower.phone, guarantors: details.guarantors });
    borrower.applicationId = app.id;
    assignBorrower(entry.token, borrower.id);
    recordBorrowerEvent(borrower, "changes", `Registered through the online application ${app.id}`, { name: details.borrower.fullName, role: "Client" });
    syncOnlineApplications(borrower);
  }
}

async function imageFromForm(form: FormData, field: string, allowPng: boolean, maxBytes: number): Promise<StoredImage | string> {
  const file = form.get(field);
  if (!(file instanceof File) || file.size === 0) return `${field} is missing.`;
  if (file.size > maxBytes) return `${field} is too large.`;
  const type = await sniffDocumentType(file);
  if (type !== "image/jpeg" && !(allowPng && type === "image/png")) return `${field} must be a ${allowPng ? "JPEG or PNG" : "JPEG"} image.`;
  const bitmap = await createImageBitmap(file);
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return { dataUrl: `data:${type};base64,${btoa(binary)}`, width: bitmap.width, height: bitmap.height };
}

/** Mobile money number changes waiting for a second person, by client. */
const pendingPhoneChanges = new Map<string, PendingPhoneChange>();
/** Passwords changed in the demo (everyone else still uses the demo password) */
const passwords = new Map<string, string>();
/** People who chose "Sign out everywhere else" */
const signedOutElsewhere = new Set<string>();
/** Failed sign-ins by email, for the lockout */
const failedSignIns = new Map<string, { failures: number; lockedUntil: number | null }>();
let nextPhoneChangeNumber = 1;

const actorOf = (user: MockUser) => ({ name: user.name, role: roles[user.roleId].name });
const borrowerForLoan = (loanId: string) => borrowers.find((b) => b.currentLoanId === loanId) ?? borrowers.find((b) => pastLoans.some((l) => l.id === loanId && l.borrowerId === b.id));

// ---------- Settings helpers ----------

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const forbidden = (message: string) => HttpResponse.json({ message }, { status: 403 });
const notFound = (message: string) => HttpResponse.json({ message }, { status: 404 });
const conflict = (message: string) => HttpResponse.json({ message }, { status: 409 });
const invalid = (message: string) => HttpResponse.json({ message }, { status: 422 });

const newInvite = () => ({ sentAt: new Date().toISOString(), expiresAt: new Date(Date.now() + systemSettings.security.inviteValidHours * 3_600_000).toISOString() });

function staffMember(member: MockStaff): StaffMember {
  const role = roles[member.roleId];
  return {
    id: member.id,
    name: member.name,
    email: member.email,
    phone: member.phone,
    photoUrl: member.photoUrl,
    role: { id: member.roleId, name: role?.name ?? "Deleted role" },
    branch: member.branch,
    branchId: systemSettings.business.branches.find((market) => market.name === member.branch)?.id ?? "",
    status: member.status,
    lastSignInAt: member.lastSignInAt,
    invite: member.invite && member.status === "invited" ? { ...member.invite, expired: inviteExpired(member) } : null,
    deactivated: member.deactivated,
    portfolio: portfolioOf(member.id),
  };
}

/** Someone who can look after clients: an active account whose role sees their own loans */
const canTakeBorrowers = (member: MockStaff) => member.status === "active" && roles[member.roleId]?.dataScope === "own" && !!roles[member.roleId]?.permissions.includes("loans.view");

/**
 * Changes that would leave nobody able to manage staff or roles (a lockout), checked before
 * a role change, a deactivation or a role edit. Returns the reason, or null if it's fine.
 */
function lockoutProblem(change: { member: MockStaff; roleId: string | null } | { role: { id: string }; permissions: Permission[] }) {
  const permissionsOf = (member: MockStaff): Permission[] => {
    if ("member" in change && member.id === change.member.id) return change.roleId ? roles[change.roleId].permissions : [];
    if ("role" in change && member.roleId === change.role.id) return change.permissions;
    return roles[member.roleId]?.permissions ?? [];
  };
  const active = staff.filter((member) => member.status === "active");
  for (const [permission, what] of [["users.manage", "manage staff"], ["roles.manage", "manage roles"]] as const) {
    const before = active.filter((member) => roles[member.roleId]?.permissions.includes(permission)).length;
    const after = active.filter((member) => permissionsOf(member).includes(permission)).length;
    if (before > 0 && after === 0) return `Nobody active could ${what} after this. Give someone else that permission first.`;
  }
  return null;
}

function roleProblem(body: SaveRoleRequest, roleId: string | null) {
  const name = body.name?.trim() ?? "";
  if (name.length < 3) return "Give the role a name.";
  if (Object.values(roles).some((role) => role.id !== roleId && role.name.toLowerCase() === name.toLowerCase())) return `There's already a role called ${name}.`;
  if (!Array.isArray(body.permissions) || cleanPermissions(body.permissions).length === 0) return "Choose at least one permission.";
  return null;
}

/** Only known permissions, once each */
const cleanPermissions = (permissions: unknown[]) => {
  // Each permission brings what it needs (e.g. approving needs seeing applications)
  const granted = withRequirements(PERMISSIONS.filter((permission) => permissions.includes(permission)));
  return PERMISSIONS.filter((permission) => granted.has(permission));
};

const SECTION_PERMISSIONS: Record<SettingsSection, Permission> = { business: "settings.business", loanRules: "settings.rules", payments: "settings.payments", security: "settings.security", notifications: "settings.notifications" };
const SECTION_NAMES: Record<SettingsSection, string> = { business: "business", loanRules: "loan rule", payments: "payment", security: "security", notifications: "notification" };

const inRange = (value: unknown, [min, max]: readonly [number, number]) => Number.isInteger(value) && (value as number) >= min && (value as number) <= max;

/** What's wrong with new settings for a section, or null */
function settingsProblem(section: SettingsSection, body: unknown): string | null {
  if (!body || typeof body !== "object") return "The settings couldn't be read.";
  const limit = (key: keyof typeof SETTING_LIMITS, label: string, value: unknown) => (inRange(value, SETTING_LIMITS[key]) ? null : `${label} must be between ${SETTING_LIMITS[key][0]} and ${SETTING_LIMITS[key][1]}.`);
  if (section === "business") {
    const b = body as SystemSettings["business"];
    if ((b.name?.trim().length ?? 0) < 3) return "Enter the business name.";
    if ((b.shortName?.trim().length ?? 0) < 2) return "Enter a short name.";
    if (!EMAIL_PATTERN.test(b.email ?? "")) return "Enter a valid email address.";
    if (!(b.phone ?? "").replace(/\D/g, "").match(/^\d{9,12}$/)) return "Enter a valid phone number.";
    if (!Array.isArray(b.payoutAccounts) || b.payoutAccounts.length === 0) return "Add at least one payout account.";
    for (const account of b.payoutAccounts)
      if (!["MTN MoMo", "Airtel Money"].includes(account.method) || !normalisePhone(account.number ?? "") || !account.accountName?.trim()) return "Check the payout accounts: method, number and name.";
    const submitted = Array.isArray(b.branches) ? b.branches : [];
    const names = submitted.map((market) => (typeof market?.name === "string" ? market.name.trim() : ""));
    if (names.length === 0 || names.some((name) => name.length < 2 || name.length > 40)) return "Add at least one market, each with a name.";
    if (new Set(names.map((name) => name.toLowerCase())).size !== names.length) return "Each market needs a different name.";
    const current = systemSettings.business.branches;
    if (submitted.some((market) => market.id !== null && !current.some((existing) => existing.id === market.id))) return "One of those markets no longer exists. Reload the page and try again.";
    // A market can be renamed (its id stays) but not removed while people work in it
    const kept = new Set(submitted.map((market) => market.id));
    const stranded = staff.find((member) => member.status !== "deactivated" && !kept.has(current.find((market) => market.name === member.branch)?.id ?? null));
    if (stranded) return `${stranded.name} works in ${stranded.branch}. Move them to another market before removing it.`;
    return null;
  }
  if (section === "loanRules") {
    const r = body as SystemSettings["loanRules"];
    if (!["suggest", "auto"].includes(r.recoveryMode)) return "Choose how recovery works.";
    if (r.recoveryAfterDaysLate !== null) {
      const problem = limit("recoveryAfterDaysLate", "Days late before recovery", r.recoveryAfterDaysLate);
      if (problem) return problem;
    }
    const order = r.paymentAllocationOrder;
    if (!Array.isArray(order) || order.length !== 4 || new Set(order).size !== 4 || order.some((part) => !["charges", "fees", "interest", "principal"].includes(part))) return "Choose where a payment goes first.";
    return (
      limit("seriouslyLateDays", "Days late shown in red", r.seriouslyLateDays) ??
      limit("par30TargetPercent", "PAR30 target", r.par30TargetPercent) ??
      limit("earlyWarningDays", "Early warning", r.earlyWarningDays) ??
      limit("onlineLinkValidHours", "Online link lifetime", r.onlineLinkValidHours)
    );
  }
  if (section === "payments") {
    const p = body as SystemSettings["payments"];
    if (!Array.isArray(p.repaymentMethods) || p.repaymentMethods.length === 0 || p.repaymentMethods.some((m) => !["Cash", "MTN MoMo", "Airtel Money"].includes(m))) return "Accept at least one way to repay.";
    if (!Array.isArray(p.payoutMethods) || p.payoutMethods.length === 0 || p.payoutMethods.some((m) => !["MTN MoMo", "Airtel Money"].includes(m))) return "Choose at least one way to pay out.";
    if (p.payoutMethods.some((m) => !systemSettings.business.payoutAccounts.some((a) => a.method === m))) return "Add a payout account for each payout method (Business details).";
    return limit("backdateDays", "Days a payment can be back-dated", p.backdateDays);
  }
  if (section === "notifications") {
    const n = body as SystemSettings["notifications"];
    const known = systemSettings.notifications.rules.map((rule) => rule.event);
    if (!Array.isArray(n.rules) || n.rules.length !== known.length || !known.every((event) => n.rules.some((rule) => rule.event === event))) return "Those notification settings couldn't be read.";
    if (n.rules.some((rule) => !Array.isArray(rule.channels) || rule.channels.some((channel) => !["sms", "email"].includes(channel)) || new Set(rule.channels).size !== rule.channels.length)) return "Choose SMS or email for each step.";
    return null;
  }
  const s = body as SystemSettings["security"];
  for (const [key, label] of [
    ["idleTimeoutMinutes", "Sign-out time"],
    ["nationalIdVisibleSeconds", "National ID display time"],
    ["inviteValidHours", "Invite link lifetime"],
    ["maxFailedSignIns", "Failed sign-ins"],
    ["lockoutMinutes", "Lockout time"],
    ["minPasswordLength", "Password length"],
  ] as const) {
    const problem = limit(key, label, s[key]);
    if (problem) return problem;
  }
  return null;
}

/** Open loans and applications on a product (older loans count as the product for their frequency) */
function productInUse(productId: string) {
  const apps = applications.filter((app) => !app.loanId && app.status !== "rejected" && termsOf(app).productId === productId).length;
  const open = loans.filter((loan) => {
    if (loan.outstandingBalance <= 0) return false;
    const terms = borrowerForLoan(loan.id) ? borrowerDetails.get(borrowerForLoan(loan.id)!.id)?.loanTerms : null;
    return terms && (terms.productId ?? productForSchedule(terms.repaymentSchedule).id) === productId;
  }).length;
  return apps + open;
}

function productProblem(body: SaveLoanProductRequest, productId: string | null): string | null {
  const name = body.name?.trim() ?? "";
  if (name.length < 3) return "Give the product a name.";
  if (loanProducts.some((p) => p.id !== productId && p.name.toLowerCase() === name.toLowerCase())) return `There's already a product called ${name}.`;
  if (!["daily", "weekly", "monthly"].includes(body.repaymentSchedule)) return "Choose how often it's repaid.";
  const rate = body.interest?.ratePercent;
  if (!(body.interest?.per in INTEREST_LIMITS) || typeof rate !== "number" || rate < 0 || rate > INTEREST_LIMITS[body.interest.per]) return "Check the interest rate.";
  const { amount } = body;
  if (!Number.isInteger(amount?.min) || !Number.isInteger(amount?.max) || amount.min < 10_000 || amount.max < amount.min || amount.max > 100_000_000) return "Check the amount limits: at least UGX 10,000, and the most can't be below the least.";
  if (!Number.isInteger(body.numberOfPayments) || body.numberOfPayments < 1 || body.numberOfPayments > 365) return "The loan length must be 1 to 365 payments.";
  const fee = body.fee;
  if (!["none", "percent", "fixed"].includes(fee?.type) || !["deducted", "added"].includes(fee?.collection) || fee.value < 0 || (fee.type === "percent" && fee.value > 20) || (fee.type === "fixed" && fee.value >= amount.min))
    return "Check the fee: up to 20%, or a fixed amount below the smallest loan.";
  const penalty = body.penalty;
  if (!["none", "percent", "fixed"].includes(penalty?.type) || !["missed-payment", "day"].includes(penalty?.per) || penalty.value < 0 || (penalty.type === "percent" && penalty.value > 20))
    return "Check the late fee: up to 20% of the overdue amount.";
  if (!Number.isInteger(penalty.graceDays) || penalty.graceDays < 0 || penalty.graceDays > 30) return "Grace days must be 0 to 30.";
  return null;
}

/** Late fees on a loan under its product's rule (older loans: the product for their frequency) */
function lateFeesOf(terms: { productId?: string; repaymentSchedule: LoanProduct["repaymentSchedule"]; principal: number }, schedule: LoanInstalment[], daysLate: number, overdue: number) {
  const product = findProduct(terms.productId) ?? productForSchedule(terms.repaymentSchedule);
  const missedPayments = schedule.filter((instalment) => instalment.status === "late").length || (daysLate > 0 ? 1 : 0);
  return { amount: latePenalty(product.penalty, { overdue, daysLate, missedPayments, principal: terms.principal }), rule: `${product.name}: ${describePenalty(product.penalty)}` };
}

/** The loan's instalments, with what's been repaid applied to them in order */
function scheduleOf(terms: NonNullable<ReturnType<typeof borrowerDetails.get>>["loanTerms"], balance: number, today: string): LoanInstalment[] {
  const schedule: LoanInstalment[] = [];
  if (!terms?.schedule) return schedule;
  let left = terms.totalRepayable - balance;
  for (let index = 0; index < terms.schedule.numberOfPayments; index++) {
    const last = index === terms.schedule.numberOfPayments - 1;
    const amount = last ? terms.totalRepayable - terms.schedule.instalment * (terms.schedule.numberOfPayments - 1) : terms.schedule.instalment;
    const paid = Math.max(0, Math.min(amount, left));
    left -= paid;
    const dueOn = paymentDate(terms.schedule.firstPaymentOn, terms.repaymentSchedule, index);
    const status: LoanInstalment["status"] = paid >= amount ? "paid" : dueOn < today ? "late" : dueOn === today ? "due" : paid > 0 ? "part-paid" : "upcoming";
    schedule.push({ number: index + 1, dueOn, amount, paid, status });
  }
  return schedule;
}

/**
 * What a client owes right now: the loan balance plus any late fees. It is the most one payment can be, so a payment
 * can never go beyond what's demanded (and nobody has to be refunded).
 */
function owedNowOf(loan: (typeof loans)[number]) {
  const balance = Math.max(0, loan.outstandingBalance);
  if (balance === 0 || loan.daysPastDue <= 0) return balance;
  const borrower = borrowerForLoan(loan.id);
  const terms = borrower ? borrowerDetails.get(borrower.id)?.loanTerms : null;
  if (!terms) return balance;
  const today = new Date().toLocaleDateString("en-CA");
  const overdue = Math.min(loan.arrearsAmount || (nextPayment(terms, balance)?.amount ?? 0), balance);
  return balance + lateFeesOf(terms, scheduleOf(terms, balance, today), loan.daysPastDue, overdue).amount;
}

/** Loans a person brought back from recovery: automatic recovery doesn't send them again */
const autoRecoveryExempt = new Set<string>();

/**
 * Settings → Loan rules, "send automatically": loans this late go to the recovery team without a
 * person deciding. The real backend runs this as a daily job; the mock runs it when lists load.
 */
function applyAutoRecovery() {
  const { recoveryMode, recoveryAfterDaysLate: days } = systemSettings.loanRules;
  if (recoveryMode !== "auto" || days === null) return;
  for (const loan of loans) {
    if (loan.recovery || loan.outstandingBalance <= 0 || loan.daysPastDue < days || autoRecoveryExempt.has(loan.id)) continue;
    loan.recovery = { since: new Date().toISOString(), by: "Automatic (Loan rules)", byId: "system", reason: RECOVERY_REASONS["long-overdue"], note: `More than ${days} days late` };
    const borrower = borrowerForLoan(loan.id);
    if (borrower) recordBorrowerEvent(borrower, "changes", `Sent ${loan.id} to recovery automatically: more than ${days} days late`, { name: "Tamu Loans", role: "Automatic rule" });
    activityLog.unshift({ id: `act-${Date.now()}-${loan.id}`, actor: { name: "Tamu Loans", role: "Automatic rule", photoUrl: null }, description: `sent ${loan.id} (${loan.borrowerName}) to recovery: more than ${days} days late`, at: new Date().toISOString() });
  }
}

const AUDIT_PAGE_SIZE = 30;
const AUDIT_CATEGORY_NAMES: Record<AuditCategory, string> = { money: "Money", decisions: "Decisions", access: "Data access", borrowers: "Client changes", admin: "Staff and settings", signin: "Sign-ins" };

const auditEvent = (item: (typeof activityLog)[number]): AuditEvent => ({
  id: item.id,
  at: item.at,
  actor: { id: item.actor.id ?? null, name: item.actor.name, role: item.actor.role, photoUrl: item.actor.photoUrl },
  category: categoryOf(item.description),
  description: item.description,
  target: targetOf(item.description),
  details: item.details ?? null,
});

/** The audit log filtered by dates (from/to, local days), person, type and search, newest first */
function auditMatching(params: URLSearchParams) {
  const from = params.get("from");
  const to = params.get("to");
  const actorId = params.get("actorId");
  const category = params.get("category");
  const query = (params.get("q") ?? "").trim().toLowerCase();
  return activityLog.filter((item) => {
    const day = new Date(item.at).toLocaleDateString("en-CA");
    if (from && day < from) return false;
    if (to && day > to) return false;
    if (actorId && item.actor.id !== actorId) return false;
    if (category && categoryOf(item.description) !== category) return false;
    return !query || `${item.description} ${item.actor.name}`.toLowerCase().includes(query);
  });
}

/** Passwords people pick most, and the demo one: always refused */
const COMMON_PASSWORDS = ["password", "password123", "123456789012", "qwertyuiop12", "tamu2026", "tamuloans123", "kampala12345", "uganda123456"];

/** What's wrong with a new password (Settings → Security sets the length), or null. No character-type rules (NIST SP 800-63B). */
function passwordProblem(password: string, user: MockUser) {
  const { minPasswordLength } = systemSettings.security;
  if (password.length < minPasswordLength) return `Use at least ${minPasswordLength} characters.`;
  if (password.length > 128) return "Use 128 characters or fewer.";
  const lower = password.toLowerCase();
  if (COMMON_PASSWORDS.includes(lower) || /^(.)\1+$/.test(password)) return "That password is too common. Choose another.";
  if (lower.includes(user.email.split("@")[0].toLowerCase()) || user.name.toLowerCase().split(" ").some((part) => part.length > 2 && lower.includes(part))) return "Don't use your name or email in your password.";
  return null;
}

// ---------- Reports ----------

const REPORT_NAMES: ReportName[] = ["portfolio", "aged", "due", "collections", "disbursements", "cleared", "applications", "officers"];
const DAY = 86_400_000;
const localDay = (iso: string) => new Date(iso).toLocaleDateString("en-CA");

/** Groups dates into days (up to a month), weeks (up to four months) or months, with short labels */
function bucketsFor(from: string, to: string) {
  const days = Math.round((new Date(`${to}T00:00:00`).getTime() - new Date(`${from}T00:00:00`).getTime()) / DAY) + 1;
  const unit: "day" | "week" | "month" = days <= 31 ? "day" : days <= 120 ? "week" : "month";
  const keyOf = (day: string) => {
    if (unit === "day") return day;
    if (unit === "month") return day.slice(0, 7);
    const date = new Date(`${day}T00:00:00`);
    date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
    return date.toLocaleDateString("en-CA");
  };
  const keys: string[] = [];
  for (let time = new Date(`${from}T00:00:00`).getTime(); time <= new Date(`${to}T00:00:00`).getTime(); time += DAY) {
    const key = keyOf(new Date(time).toLocaleDateString("en-CA"));
    if (!keys.includes(key)) keys.push(key);
  }
  const labelOf = (key: string) => {
    const date = new Date(`${unit === "month" ? `${key}-01` : key}T00:00:00`);
    const month = date.toLocaleDateString("en-US", { month: "short" });
    return unit === "month" ? month : `${date.getDate()} ${month}`;
  };
  return { unit, keys, keyOf, labelOf };
}

const REPORT_TITLES: Record<ReportName, string> = {
  portfolio: "Portfolio",
  aged: "Aged loans",
  due: "Repayments due",
  collections: "Collections",
  disbursements: "Disbursements",
  cleared: "Cleared loans",
  applications: "Applications",
  officers: "Officer performance",
};
const REPORT_ROWS_PER_PAGE = 48;

/** A report as a printable PDF: title, dates, headline figures, then the table (several pages if needed) */
function reportPdf(report: Report, user: MockUser) {
  const day = (iso: string) => formatValue(iso, "date");
  const header: PdfLine[] = [
    { text: `${systemSettings.business.name} · ${REPORT_TITLES[report.name]} report`, size: 15, gap: 0 },
    { text: `${report.name === "portfolio" || report.name === "aged" ? `As of ${day(report.to)}` : `${day(report.from)} to ${day(report.to)}`} · ${report.scope === "branch" ? "Whole market" : `${user.name}'s portfolio`}`, size: 10, gap: 20 },
    { text: `Exported by ${user.name} on ${day(new Date().toLocaleDateString("en-CA"))}`, size: 8, gap: 14 },
    ...report.figures.map((figure, index): PdfLine => ({ text: `${figure.label}: ${formatValue(figure.value, figure.format)}`, size: 11, gap: index === 0 ? 26 : 16 })),
    { text: report.table.title, size: 12, gap: 28 },
  ];
  // Column positions across the page (numbers right-aligned at the end of their column)
  const columns = report.table.columns;
  const width = 595 - 56 * 2;
  const step = width / columns.length;
  const cellsOf = (values: (string | number | null)[], bold = false): PdfLine => ({
    size: 8,
    gap: bold ? 18 : 13,
    cells: columns.map((column, index) => {
      const numeric = !["text", "date"].includes(column.format);
      const value = values[index];
      const text = bold && typeof value === "string" ? value : value === null || value === undefined ? "" : formatValue(value, column.format);
      return { text: text.length > 26 ? `${text.slice(0, 25)}…` : text, x: numeric ? 56 + step * (index + 1) - 6 : 56 + step * index, align: numeric ? "right" : "left" };
    }),
  });
  const headings = cellsOf(columns.map((column) => column.label.toUpperCase()), true);
  const rows = report.table.rows.map((row) => cellsOf(columns.map((column) => row[column.key] ?? null)));
  if (report.table.total) rows.push(cellsOf(columns.map((column) => report.table.total![column.key] ?? null)));
  const pages: PdfLine[][] = [];
  for (let start = 0; start < Math.max(rows.length, 1); start += REPORT_ROWS_PER_PAGE) {
    const chunk = rows.slice(start, start + REPORT_ROWS_PER_PAGE);
    pages.push([...(start === 0 ? header : [{ text: `${REPORT_TITLES[report.name]} report (continued)`, size: 11, gap: 0 }]), headings, ...(chunk.length ? chunk : [{ text: "Nothing in these dates.", size: 9, gap: 16 }])]);
  }
  return buildPdf(pages);
}

/** One of the reports for this user: their own portfolio, or the branch */
function buildReport(user: MockUser, name: string, params: URLSearchParams): { report: Report } | { error: Response } {
  if (!REPORT_NAMES.includes(name as ReportName)) return { error: notFound("That report wasn't found.") };
  if (!hasPermission(user, "reports.view")) return { error: forbidden("You can't view reports.") };
  const branch = seesBranch(user);
  if (name === "officers" && !branch) return { error: forbidden("Officer performance is for market-wide roles.") };
  const today = new Date().toLocaleDateString("en-CA");
  const dateParam = (key: string, fallback: string) => (/^\d{4}-\d{2}-\d{2}$/.test(params.get(key) ?? "") ? params.get(key)! : fallback);
  const to = dateParam("to", today) > today ? today : dateParam("to", today);
  const from = dateParam("from", `${today.slice(0, 7)}-01`) > to ? to : dateParam("from", `${today.slice(0, 7)}-01`);
  const officerName = (id: string) => officers.find((o) => o.id === id)?.name ?? "";

  // The visible current loans with their terms, schedule and product
  const visible = loans.flatMap((loan) => {
    if (!canSeeRecord(user, loan.officerId)) return [];
    const borrower = borrowerForLoan(loan.id);
    const terms = borrower ? borrowerDetails.get(borrower.id)?.loanTerms : null;
    if (!borrower || !terms) return [];
    const product = findProduct(terms.productId) ?? productForSchedule(terms.repaymentSchedule);
    return [{ loan, borrower, terms, product }];
  });
  const open = visible.filter(({ loan }) => loan.outstandingBalance > 0);
  const inRange = (day: string) => day >= from && day <= to;
  const payments = visible.flatMap(({ loan, terms }) => loanPayments(loan.id, terms, officerName(loan.officerId)).map((p) => ({ ...p, officerId: loan.officerId }))).filter((p) => inRange(localDay(p.paidAt)));
  // What was due in the range, from each loan's schedule
  const due = visible.flatMap(({ loan, terms }) => {
    if (!terms.schedule) return [];
    const { firstPaymentOn, numberOfPayments, instalment } = terms.schedule;
    return Array.from({ length: numberOfPayments }, (_, index) => ({ day: paymentDate(firstPaymentOn, terms.repaymentSchedule, index), amount: instalment, officerId: loan.officerId })).filter((d) => inRange(d.day));
  });
  const sum = (list: { amount: number }[]) => list.reduce((total, item) => total + item.amount, 0);
  const rate = (collected: number, expected: number) => (expected > 0 ? Math.round((collected / expected) * 1000) / 10 : 0);
  const par30 = (list: typeof open) => {
    const outstanding = list.reduce((total, { loan }) => total + loan.outstandingBalance, 0);
    const late = list.filter(({ loan }) => loan.daysPastDue > 30).reduce((total, { loan }) => total + loan.outstandingBalance, 0);
    return outstanding > 0 ? Math.round((late / outstanding) * 1000) / 10 : 0;
  };
  const base = { name: name as ReportName, scope: branch ? ("branch" as const) : ("own" as const), from, to };

  if (name === "portfolio") {
    const products = [...new Set(open.map(({ product }) => product.id))].map((id) => {
      const list = open.filter(({ product }) => product.id === id);
      return { product: list[0].product.name, loans: list.length, outstanding: list.reduce((t, { loan }) => t + loan.outstandingBalance, 0), late: list.filter(({ loan }) => loan.daysPastDue > 0).length, par30: par30(list) };
    }).sort((a, b) => b.outstanding - a.outstanding);
    const outstanding = open.reduce((t, { loan }) => t + loan.outstandingBalance, 0);
    return {
      report: {
        ...base,
        from: to,
        figures: [
          { label: "Outstanding", value: outstanding, format: "ugx", note: "Still to be repaid" },
          { label: "Active loans", value: open.length, format: "count", note: null },
          { label: "Late loans", value: open.filter(({ loan }) => loan.daysPastDue > 0).length, format: "count", note: "At least one payment late" },
          { label: "PAR30", value: par30(open), format: "percent", note: "Outstanding on loans over 30 days late" },
        ],
        charts: [
          { title: "Outstanding by loan product", kind: "donut", format: "ugx", series: "Outstanding", targetSeries: null, points: products.map((p) => ({ label: p.product, value: p.outstanding, target: null })) },
          {
            title: "Outstanding by how late",
            kind: "donut",
            format: "ugx",
            series: "Outstanding",
            targetSeries: null,
            ordered: true,
            points: [
              { label: "Up to date", low: 0, high: 0 },
              { label: "1–30 days late", low: 1, high: 30 },
              { label: "31–60 days late", low: 31, high: 60 },
              { label: "61–90 days late", low: 61, high: 90 },
              { label: "Over 90 days late", low: 91, high: Infinity },
            ].map((band) => ({ label: band.label, value: open.filter(({ loan }) => loan.daysPastDue >= band.low && loan.daysPastDue <= band.high).reduce((t, { loan }) => t + loan.outstandingBalance, 0), target: null })),
          },
        ],
        table: {
          title: "By loan product",
          columns: [
            { key: "product", label: "Product", format: "text" },
            { key: "loans", label: "Active loans", format: "count" },
            { key: "outstanding", label: "Outstanding", format: "ugx" },
            { key: "late", label: "Late loans", format: "count" },
            { key: "par30", label: "PAR30", format: "percent" },
          ],
          rows: products,
          total: { product: "Total", loans: open.length, outstanding, late: open.filter(({ loan }) => loan.daysPastDue > 0).length, par30: par30(open) },
        },
      },
    };
  }

  // How late each open loan is, as a snapshot of today (the loans list already knows each loan's days late and overdue amount)
  if (name === "aged") {
    const bands = [
      { label: "Up to date", low: 0, high: 0 },
      { label: "1–30 days", low: 1, high: 30 },
      { label: "31–60 days", low: 31, high: 60 },
      { label: "61–90 days", low: 61, high: 90 },
      { label: "Over 90 days", low: 91, high: Infinity },
    ];
    const live = loanListItems(user).filter((item) => item.status !== "cleared");
    const inBand = (band: (typeof bands)[number]) => live.filter((item) => item.daysPastDue >= band.low && item.daysPastDue <= band.high);
    const late = live.filter((item) => item.daysPastDue > 0).sort((a, b) => b.daysPastDue - a.daysPastDue || b.balance - a.balance);
    const bandOf = (days: number) => bands.find((band) => days >= band.low && days <= band.high)!.label;
    const lateBalance = late.reduce((t, item) => t + item.balance, 0);
    const overdue = late.reduce((t, item) => t + item.arrearsAmount, 0);
    return {
      report: {
        ...base,
        from: to,
        figures: [
          { label: "Late loans", value: late.length, format: "count", note: `Of ${live.length} active loans` },
          { label: "Balance on late loans", value: lateBalance, format: "ugx", note: "Still to be repaid" },
          { label: "Overdue now", value: overdue, format: "ugx", note: "Instalments already due" },
          { label: "Longest late", value: late[0]?.daysPastDue ?? 0, format: "count", note: "Days" },
        ],
        charts: [
          { title: "Balance on late loans, by how late", kind: "bars", format: "ugx", series: "Balance", targetSeries: null, ordered: true, points: bands.slice(1).map((band) => ({ label: band.label, value: inBand(band).reduce((t, item) => t + item.balance, 0), target: null })) },
          { title: "Loans by how late", kind: "donut", format: "count", series: "Loans", targetSeries: null, ordered: true, points: bands.map((band) => ({ label: band.label, value: inBand(band).length, target: null })) },
        ],
        table: {
          title: "Late loans, longest first",
          columns: [
            { key: "loan", label: "Loan", format: "text" },
            { key: "borrower", label: "Client", format: "text" },
            { key: "phone", label: "Phone", format: "text" },
            { key: "age", label: "How late", format: "text" },
            { key: "days", label: "Days late", format: "count" },
            { key: "overdue", label: "Overdue", format: "ugx" },
            { key: "balance", label: "Balance", format: "ugx" },
            ...(branch ? [{ key: "officer", label: "Officer", format: "text" as const }] : []),
          ],
          rows: late.map((item) => ({ loan: item.id, borrower: item.borrower.name, phone: item.phone, age: bandOf(item.daysPastDue), days: item.daysPastDue, overdue: item.arrearsAmount, balance: item.balance, officer: item.officer.name })),
          total: { loan: `${late.length} loans`, borrower: null, phone: null, age: null, days: null, overdue, balance: lateBalance, officer: null },
        },
      },
    };
  }

  // What falls due from today on (the other reports look back)
  if (name === "due") {
    const maxDays = 90;
    const last = paymentDate(today, "daily", maxDays);
    const wanted = dateParam("to", paymentDate(today, "daily", 7));
    const dueTo = wanted < today ? today : wanted > last ? last : wanted;
    const items = open.flatMap(({ loan, borrower, terms, product }) => {
      if (!terms.schedule) return [];
      const { firstPaymentOn, numberOfPayments, instalment } = terms.schedule;
      const paidSoFar = terms.totalRepayable - loan.outstandingBalance;
      const next = Math.min(numberOfPayments - 1, Math.floor(paidSoFar / instalment));
      return Array.from({ length: numberOfPayments - next }, (_, offset) => {
        const index = next + offset;
        const day = paymentDate(firstPaymentOn, terms.repaymentSchedule, index);
        const amount = index === next ? (nextPayment(terms, loan.outstandingBalance)?.amount ?? instalment) : index === numberOfPayments - 1 ? terms.totalRepayable - instalment * index : instalment;
        return { day, loan: loan.id, borrower: borrower.name, phone: borrower.phone, product: product.name, amount: Math.max(0, amount), officerId: loan.officerId, officer: officerName(loan.officerId) };
      }).filter((item) => item.day >= today && item.day <= dueTo);
    });
    items.sort((a, b) => a.day.localeCompare(b.day) || a.borrower.localeCompare(b.borrower));
    const total = sum(items);
    const dueToday = sum(items.filter((item) => item.day === today));
    const dueBuckets = bucketsFor(today, dueTo);
    const splitBy = branch ? "officer" : "product";
    return {
      report: {
        ...base,
        from: today,
        to: dueTo,
        figures: [
          { label: "Due in these dates", value: total, format: "ugx", note: null },
          { label: "Due today", value: dueToday, format: "ugx", note: null },
          { label: "Instalments", value: items.length, format: "count", note: null },
          { label: "Loans", value: new Set(items.map((item) => item.loan)).size, format: "count", note: "With at least one instalment due" },
        ],
        charts: [
          { title: `Due, by ${dueBuckets.unit}`, kind: "trend", format: "ugx", series: "Due", targetSeries: null, points: dueBuckets.keys.map((key) => ({ label: dueBuckets.labelOf(key), value: sum(items.filter((item) => dueBuckets.keyOf(item.day) === key)), target: null })) },
          {
            title: branch ? "Due by loan officer" : "Due by loan product",
            kind: "donut",
            format: "ugx",
            series: "Due",
            targetSeries: null,
            points: [...new Set(items.map((item) => item[splitBy]))].map((label) => ({ label, value: sum(items.filter((item) => item[splitBy] === label)), target: null })).sort((a, b) => b.value - a.value),
          },
        ],
        table: {
          title: "Instalments due",
          columns: [
            { key: "day", label: "Due on", format: "date" },
            { key: "loan", label: "Loan", format: "text" },
            { key: "borrower", label: "Client", format: "text" },
            { key: "phone", label: "Phone", format: "text" },
            { key: "amount", label: "Amount", format: "ugx" },
            ...(branch ? [{ key: "officer", label: "Officer", format: "text" as const }] : []),
          ],
          rows: items,
          total: { day: "Total", loan: `${items.length} instalments`, borrower: null, phone: null, amount: total, officer: null },
        },
      },
    };
  }

  // Loans repaid in full in the dates
  if (name === "cleared") {
    const done = loanListItems(user)
      .filter((item) => item.status === "cleared" && item.clearedOn && inRange(item.clearedOn))
      .sort((a, b) => b.clearedOn!.localeCompare(a.clearedOn!));
    const onTime = done.filter((item) => item.mostDaysLate === 0).length;
    const repaid = done.reduce((t, item) => t + item.totalRepayable, 0);
    const clearedBuckets = bucketsFor(from, to);
    const slice = (low: number, high: number) => done.filter((item) => item.mostDaysLate >= low && item.mostDaysLate <= high).length;
    return {
      report: {
        ...base,
        figures: [
          { label: "Loans cleared", value: done.length, format: "count", note: null },
          { label: "Total repaid", value: repaid, format: "ugx", note: "Principal and interest" },
          { label: "Cleared on time", value: onTime, format: "count", note: "No instalment paid late" },
          { label: "On-time share", value: done.length ? Math.round((onTime / done.length) * 1000) / 10 : 0, format: "percent", note: null },
        ],
        charts: [
          { title: `Loans cleared, by ${clearedBuckets.unit}`, kind: "trend", format: "count", series: "Cleared", targetSeries: null, points: clearedBuckets.keys.map((key) => ({ label: clearedBuckets.labelOf(key), value: done.filter((item) => clearedBuckets.keyOf(item.clearedOn!) === key).length, target: null })) },
          {
            title: "How punctual they were",
            kind: "donut",
            format: "count",
            series: "Loans",
            targetSeries: null,
            ordered: true,
            points: [
              { label: "On time", value: slice(0, 0), target: null },
              { label: "Up to 7 days late", value: slice(1, 7), target: null },
              { label: "8–30 days late", value: slice(8, 30), target: null },
              { label: "Over 30 days late", value: slice(31, Infinity), target: null },
            ],
          },
        ],
        table: {
          title: "Loans cleared",
          columns: [
            { key: "clearedOn", label: "Cleared", format: "date" },
            { key: "loan", label: "Loan", format: "text" },
            { key: "borrower", label: "Client", format: "text" },
            { key: "principal", label: "Lent", format: "ugx" },
            { key: "repaid", label: "Repaid", format: "ugx" },
            { key: "late", label: "Most days late", format: "count" },
            ...(branch ? [{ key: "officer", label: "Officer", format: "text" as const }] : []),
          ],
          rows: done.map((item) => ({ clearedOn: item.clearedOn, loan: item.id, borrower: item.borrower.name, principal: item.principal, repaid: item.totalRepayable, late: item.mostDaysLate, officer: item.officer.name })),
          total: { clearedOn: "Total", loan: `${done.length} loans`, borrower: null, principal: done.reduce((t, item) => t + item.principal, 0), repaid, late: null, officer: null },
        },
      },
    };
  }

  // Applications started in the dates, and where each one stands now
  if (name === "applications") {
    const STAGES = [
      { key: "draft", label: "Being completed", of: (a: ApplicationListItem) => a.status === "draft" || a.status === "awaiting-borrower" },
      { key: "submitted", label: "Waiting for approval", of: (a: ApplicationListItem) => a.status === "submitted" },
      { key: "approved", label: "Approved, not paid out", of: (a: ApplicationListItem) => a.status === "approved" && !a.loanId },
      { key: "paid", label: "Paid out", of: (a: ApplicationListItem) => !!a.loanId },
      { key: "rejected", label: "Rejected", of: (a: ApplicationListItem) => a.status === "rejected" },
    ];
    const list = applications
      .filter((app) => canSeeRecord(user, app.officerId) && app.createdAt && inRange(localDay(app.createdAt)))
      .map(applicationListItem)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const stageOf = (item: ApplicationListItem) => STAGES.find((stage) => stage.of(item))?.label ?? "";
    const decidedIn = list.filter((item) => item.decided && item.submittedAt).map((item) => (new Date(item.decided!.at).getTime() - new Date(item.submittedAt!).getTime()) / DAY);
    const averageDays = decidedIn.length ? Math.round((decidedIn.reduce((t, days) => t + Math.max(0, days), 0) / decidedIn.length) * 10) / 10 : 0;
    const startedBuckets = bucketsFor(from, to);
    const approvedCount = list.filter((item) => item.decided && item.status !== "rejected").length;
    return {
      report: {
        ...base,
        figures: [
          { label: "Applications started", value: list.length, format: "count", note: null },
          { label: "Approved", value: approvedCount, format: "count", note: "Including those paid out" },
          { label: "Rejected", value: list.filter((item) => item.status === "rejected").length, format: "count", note: null },
          { label: "Days to decide", value: averageDays, format: "count", note: "Average, from sent for approval" },
        ],
        charts: [
          { title: `Applications started, by ${startedBuckets.unit}`, kind: "trend", format: "count", series: "Started", targetSeries: null, points: startedBuckets.keys.map((key) => ({ label: startedBuckets.labelOf(key), value: list.filter((item) => startedBuckets.keyOf(localDay(item.createdAt)) === key).length, target: null })) },
          { title: "Where they stand now", kind: "donut", format: "count", series: "Applications", targetSeries: null, points: STAGES.map((stage) => ({ label: stage.label, value: list.filter(stage.of).length, target: null })) },
        ],
        table: {
          title: "Applications",
          columns: [
            { key: "started", label: "Started", format: "date" },
            { key: "id", label: "Application", format: "text" },
            { key: "borrower", label: "Client", format: "text" },
            { key: "amount", label: "Amount", format: "ugx" },
            { key: "stage", label: "Where it stands", format: "text" },
            { key: "days", label: "Days to decide", format: "count" },
            ...(branch ? [{ key: "officer", label: "Officer", format: "text" as const }] : []),
          ],
          rows: list.map((item) => ({
            started: localDay(item.createdAt),
            id: item.id,
            borrower: item.borrower.name,
            amount: item.amount,
            stage: stageOf(item),
            days: item.decided && item.submittedAt ? Math.max(0, Math.round((new Date(item.decided.at).getTime() - new Date(item.submittedAt).getTime()) / DAY)) : null,
            officer: item.officer.name,
          })),
          total: { started: "Total", id: `${list.length} applications`, borrower: null, amount: list.reduce((t, item) => t + item.amount, 0), stage: null, days: null, officer: null },
        },
      },
    };
  }

  const buckets = bucketsFor(from, to);
  if (name === "collections") {
    const collected = sum(payments);
    const expected = sum(due);
    const groups = branch
      ? [...new Set(visible.map(({ loan }) => loan.officerId))].map((id) => ({ key: officerName(id), collected: sum(payments.filter((p) => p.officerId === id)), expected: sum(due.filter((d) => d.officerId === id)), count: payments.filter((p) => p.officerId === id).length }))
      : (["MTN MoMo", "Airtel Money", "Cash"] as const).map((method) => ({ key: method, collected: sum(payments.filter((p) => p.method === method)), expected: null as number | null, count: payments.filter((p) => p.method === method).length }));
    return {
      report: {
        ...base,
        figures: [
          { label: "Collected", value: collected, format: "ugx", note: null },
          { label: "Expected", value: expected, format: "ugx", note: "Instalments due in these dates" },
          { label: "Collection rate", value: rate(collected, expected), format: "percent", note: "Collected ÷ expected" },
          { label: "Payments", value: payments.length, format: "count", note: null },
        ],
        charts: [
          {
          title: `Collected and expected, by ${buckets.unit}`,
          kind: "trend",
          format: "ugx",
          series: "Collected",
          targetSeries: "Expected",
          points: buckets.keys.map((key) => ({
            label: buckets.labelOf(key),
            value: sum(payments.filter((p) => buckets.keyOf(localDay(p.paidAt)) === key)),
            target: sum(due.filter((d) => buckets.keyOf(d.day) === key)),
          })),
          },
          {
            title: "Collected by payment method",
            kind: "donut",
            format: "ugx",
            series: "Collected",
            targetSeries: null,
            points: (["MTN MoMo", "Airtel Money", "Cash"] as const).map((method) => ({ label: method, value: sum(payments.filter((p) => p.method === method)), target: null })),
          },
        ],
        table: branch
          ? {
              title: "By loan officer",
              columns: [
                { key: "officer", label: "Officer", format: "text" },
                { key: "collected", label: "Collected", format: "ugx" },
                { key: "expected", label: "Expected", format: "ugx" },
                { key: "rate", label: "Collection rate", format: "percent" },
                { key: "payments", label: "Payments", format: "count" },
              ],
              rows: groups.sort((a, b) => b.collected - a.collected).map((g) => ({ officer: g.key, collected: g.collected, expected: g.expected, rate: rate(g.collected, g.expected ?? 0), payments: g.count })),
              total: { officer: "Total", collected, expected, rate: rate(collected, expected), payments: payments.length },
            }
          : {
              title: "By method",
              columns: [
                { key: "method", label: "Method", format: "text" },
                { key: "collected", label: "Collected", format: "ugx" },
                { key: "payments", label: "Payments", format: "count" },
              ],
              rows: groups.map((g) => ({ method: g.key, collected: g.collected, payments: g.count })),
              total: { method: "Total", collected, payments: payments.length },
            },
      },
    };
  }

  if (name === "disbursements") {
    const current = visible.filter(({ terms }) => inRange(terms.disbursedOn)).map(({ loan, borrower, terms, product }) => ({ day: terms.disbursedOn, loan: loan.id, borrower: borrower.name, product: product.name, amount: terms.principal, fee: feeAmount(terms.principal, product.fee), officer: officerName(loan.officerId) }));
    const past = pastLoans.flatMap((past) => {
      const borrower = borrowers.find((b) => b.id === past.borrowerId);
      if (!borrower || !canSeeRecord(user, borrower.officerId) || !inRange(past.disbursedOn)) return [];
      return [{ day: past.disbursedOn, loan: past.id, borrower: borrower.name, product: past.product, amount: past.principal, fee: 0, officer: officerName(borrower.officerId) }];
    });
    const all = [...current, ...past].sort((a, b) => b.day.localeCompare(a.day));
    const amount = sum(all);
    return {
      report: {
        ...base,
        figures: [
          { label: "Loans paid out", value: all.length, format: "count", note: null },
          { label: "Amount lent", value: amount, format: "ugx", note: null },
          { label: "Average loan", value: all.length ? Math.round(amount / all.length) : 0, format: "ugx", note: null },
          { label: "Fees", value: all.reduce((t, d) => t + d.fee, 0), format: "ugx", note: "From loan products" },
        ],
        charts: [
          { title: `Amount lent, by ${buckets.unit}`, kind: "trend", format: "ugx", series: "Amount lent", targetSeries: null, points: buckets.keys.map((key) => ({ label: buckets.labelOf(key), value: sum(all.filter((d) => buckets.keyOf(d.day) === key)), target: null })) },
          {
            title: "Amount lent by loan product",
            kind: "donut",
            format: "ugx",
            series: "Amount lent",
            targetSeries: null,
            points: [...new Set(all.map((d) => d.product))].map((product) => ({ label: product, value: sum(all.filter((d) => d.product === product)), target: null })).sort((a, b) => b.value - a.value),
          },
        ],
        table: {
          title: "Loans paid out",
          columns: [
            { key: "day", label: "Paid out", format: "date" },
            { key: "loan", label: "Loan", format: "text" },
            { key: "borrower", label: "Client", format: "text" },
            { key: "product", label: "Product", format: "text" },
            { key: "amount", label: "Amount", format: "ugx" },
            ...(branch ? [{ key: "officer", label: "Officer", format: "text" as const }] : []),
          ],
          rows: all,
          total: { day: "Total", loan: `${all.length} loans`, borrower: null, product: null, amount, officer: null },
        },
      },
    };
  }

  // Officer performance (branch only)
  const rows = officers
    .filter((officer) => findStaff(officer.id)?.status === "active" || visible.some(({ loan }) => loan.officerId === officer.id))
    .map((officer) => {
      const own = open.filter(({ loan }) => loan.officerId === officer.id);
      const collected = sum(payments.filter((p) => p.officerId === officer.id));
      const expected = sum(due.filter((d) => d.officerId === officer.id));
      return {
        officer: officer.name,
        loans: own.length,
        outstanding: own.reduce((t, { loan }) => t + loan.outstandingBalance, 0),
        collected,
        rate: rate(collected, expected),
        late: own.filter(({ loan }) => loan.daysPastDue > 0).length,
        par30: par30(own),
      };
    })
    .filter((row) => row.loans > 0)
    .sort((a, b) => b.rate - a.rate);
  const collected = sum(payments);
  const expected = sum(due);
  return {
    report: {
      ...base,
      figures: [
        { label: "Loan officers", value: rows.length, format: "count", note: null },
        { label: "Team collection rate", value: rate(collected, expected), format: "percent", note: "Collected ÷ expected" },
        { label: "Team PAR30", value: par30(open), format: "percent", note: null },
        { label: "Late loans", value: open.filter(({ loan }) => loan.daysPastDue > 0).length, format: "count", note: null },
      ],
      charts: [
        { title: "Collection rate by officer", kind: "bars", format: "percent", series: "Collection rate", targetSeries: null, points: rows.map((row) => ({ label: row.officer, value: row.rate, target: null })) },
        { title: "Outstanding by officer", kind: "donut", format: "ugx", series: "Outstanding", targetSeries: null, points: [...rows].sort((a, b) => b.outstanding - a.outstanding).map((row) => ({ label: row.officer, value: row.outstanding, target: null })) },
      ],
      table: {
        title: "By loan officer",
        columns: [
          { key: "officer", label: "Officer", format: "text" },
          { key: "loans", label: "Active loans", format: "count" },
          { key: "outstanding", label: "Outstanding", format: "ugx" },
          { key: "collected", label: "Collected", format: "ugx" },
          { key: "rate", label: "Collection rate", format: "percent" },
          { key: "late", label: "Late loans", format: "count" },
          { key: "par30", label: "PAR30", format: "percent" },
        ],
        rows,
        total: null,
      },
    },
  };
}

/** What's missing or wrong in a new client's details (both routes), or null */
function newBorrowerProblem(person: Partial<NewBorrowerDetails> | undefined) {
  if (!person) return "Enter the client's details.";
  if (!["female", "male"].includes(person.gender ?? "")) return "Choose the client's gender.";
  if (person.secondaryPhone && !normalisePhone(person.secondaryPhone)) return "Check the other phone number, or leave it empty.";
  if (!person.area?.trim()) return "Enter the client's address.";
  if (!person.premises?.trim()) return "Enter the client's shop or premises.";
  // Next of kin is optional; a number, if given, must be valid
  if (person.nextOfKin?.phone?.trim() && !normalisePhone(person.nextOfKin.phone)) return "Check the next of kin's phone number, or leave it empty.";
  return null;
}

/** Audit log entry for the signed-in demo user. */
function audit(user: MockUser, description: string, details?: { label: string; value: string }[]) {
  activityLog.unshift({ id: `act-${Date.now()}-${activityLog.length}`, actor: { id: user.id, name: user.name, role: roles[user.roleId]?.name ?? "", photoUrl: user.photoUrl }, description, at: new Date().toISOString(), details });
}

const scopeOf = (user: MockUser) => (seesBranch(user) ? "branch" : "own");
/** The loans a user may see, for the portfolio figures */
const visibleTo = (user: MockUser): OfficerFilter => (officerId) => canSeeRecord(user, officerId);
/** Results of money requests by Idempotency-Key: a repeat of the same key gets the first result back instead of running again */
const idempotentResults = new Map<string, Record<string, unknown>>();
const replayOf = (request: Request) => {
  const key = request.headers.get("Idempotency-Key");
  return key && idempotentResults.has(key) ? HttpResponse.json(idempotentResults.get(key), { status: 200 }) : null;
};
const rememberResult = (request: Request, result: object) => {
  const key = request.headers.get("Idempotency-Key");
  if (key) idempotentResults.set(key, result as Record<string, unknown>);
};

const limitParam = (request: Request, fallback: number) => Number(new URL(request.url).searchParams.get("limit")) || fallback;

/** Balances are calculated each morning at 8:00. */
function balancesAsOf() {
  const date = new Date();
  date.setHours(8, 0, 0, 0);
  return date.toISOString();
}

// Notifications each demo user has read (kept in memory, so a page reload resets it)
const readNotificationIds = new Map<string, Set<string>>();

type NotificationContent = Omit<NotificationItem, "unread">;

function notificationsFor(user: MockUser): NotificationContent[] {
  const items: NotificationContent[] = [];
  const isOfficer = hasPermission(user, "loans.view") && !seesBranch(user);

  if (isOfficer) {
    items.push({ id: "repayments-due", title: "Repayments due today", detail: "Record them as clients pay", href: "/?worklist=collect" });
    items.push({ id: "overdue-follow-up", title: "Overdue loans to follow up", detail: "Call before they fall further behind", href: "/?worklist=follow-up" });
  }
  if (isOfficer && hasPermission(user, "applications.create")) {
    const drafts = applications.filter((app) => app.status === "draft" && app.officerId === user.id).length;
    if (drafts > 0) items.push({ id: "drafts-to-complete", title: `${drafts} applications to complete`, detail: "Add the missing documents", href: "/applications?status=draft" });
  }
  if (isOfficer && hasPermission(user, "applications.create")) {
    const mine = applications.filter((app) => app.officerId === user.id);
    const online = mine.filter((app) => app.status === "submitted" && app.route === "online").length;
    if (online > 0) items.push({ id: "online-forms-in", title: `${online} online ${online === 1 ? "form" : "forms"} filled in`, detail: "Clients finished their application. Check the details", href: "/applications?status=submitted" });
    const sentBack = mine.filter((app) => app.status === "draft" && app.returned).length;
    if (sentBack > 0) items.push({ id: "sent-back", title: `${sentBack} ${sentBack === 1 ? "application" : "applications"} sent back`, detail: "Fix what was asked and send again", href: "/applications?status=draft" });
    const approved = mine.filter((app) => app.status === "approved" && !app.loanId).length;
    if (approved > 0) items.push({ id: "approved-waiting", title: `${approved} approved, waiting to be paid out`, detail: "Waiting for Finance to pay them out", href: "/applications?status=approved" });
  }
  if (hasPermission(user, "loans.disburse")) {
    const toPay = applications.filter((app) => app.status === "approved" && !app.loanId).length;
    if (toPay > 0) items.push({ id: "ready-to-pay-out", title: `${toPay} ${toPay === 1 ? "loan" : "loans"} ready to pay out`, detail: "Approved and waiting for the payout", href: "/loans/to-disburse" });
  }
  if (hasPermission(user, "applications.approve")) {
    const waiting = applications.filter((app) => app.status === "submitted").length;
    items.push({ id: "awaiting-approval", title: `${waiting} applications waiting for approval`, detail: "Approve or reject them", href: "/applications?status=submitted" });
  }
  if (hasPermission(user, "users.manage")) {
    items.push({ id: "access-requests", title: "Access requests", detail: "Password resets and pending invites", href: "/settings/users" });
  }
  return items;
}

export const handlers = [
  // Like the real backend: everything except signing in needs a session
  http.all(`${API_BASE}/*`, ({ request }) => {
    const path = new URL(request.url).pathname;
    // Sign-in, and the online application form (clients have no account; the link's token is the access)
    if (path.startsWith(`${API_BASE}/auth/`) || path.startsWith(`${API_BASE}/public/`)) return;
    if (!signedInDemoUser()) return HttpResponse.json({ message: "Please sign in." }, { status: 401 });
  }),

  // ---------- Recovery (manual for now; the automatic day limit waits for Tamu's rule) ----------

  http.post(`${API_BASE}/loans/:loanId/recovery`, async ({ params, request }) => {
    await delay(300);
    const user = currentDemoUser();
    const loan = loans.find((l) => l.id === params.loanId);
    if (!loan || !canSeeRecord(user, loan.officerId)) return HttpResponse.json({ message: "That loan wasn't found." }, { status: 404 });
    if (!hasPermission(user, "recovery.manage")) return HttpResponse.json({ message: "You can't send loans to recovery." }, { status: 403 });
    if (loan.outstandingBalance <= 0) return HttpResponse.json({ message: "This loan is already repaid." }, { status: 409 });
    if (loan.recovery) return HttpResponse.json({ message: "This loan is already with the recovery team." }, { status: 409 });
    const { reason, note } = (await request.json()) as SendToRecoveryRequest;
    if (!(reason in RECOVERY_REASONS)) return HttpResponse.json({ message: "Choose a reason." }, { status: 422 });
    if (reason === "other" && !note?.trim()) return HttpResponse.json({ message: "Explain why in the note." }, { status: 422 });

    loan.recovery = { since: new Date().toISOString(), by: user.name, byId: user.id, reason: RECOVERY_REASONS[reason], note: note?.trim() || null };
    const borrower = borrowerForLoan(loan.id);
    const detail = `${RECOVERY_REASONS[reason]}${note?.trim() ? ` (${note.trim()})` : ""}`;
    if (borrower) recordBorrowerEvent(borrower, "changes", `Sent ${loan.id} to recovery: ${detail}`, actorOf(user));
    audit(user, `sent ${loan.id} (${loan.borrowerName}) to recovery: ${detail}`);
    return new HttpResponse(null, { status: 204 });
  }),

  http.post(`${API_BASE}/loans/:loanId/recovery/return`, async ({ params, request }) => {
    await delay(300);
    const user = currentDemoUser();
    const loan = loans.find((l) => l.id === params.loanId);
    if (!loan || !canSeeRecord(user, loan.officerId)) return HttpResponse.json({ message: "That loan wasn't found." }, { status: 404 });
    if (!hasPermission(user, "recovery.manage")) return HttpResponse.json({ message: "You can't change recovery." }, { status: 403 });
    if (!loan.recovery) return HttpResponse.json({ message: "This loan isn't with the recovery team." }, { status: 409 });
    const { note } = (await request.json()) as ReturnFromRecoveryRequest;
    if (!note?.trim()) return HttpResponse.json({ message: "Say why it's coming back, e.g. arrears paid or a payment plan agreed." }, { status: 422 });

    loan.recovery = undefined;
    // Brought back by a person: automatic recovery leaves it alone from now on
    autoRecoveryExempt.add(loan.id);
    const borrower = borrowerForLoan(loan.id);
    if (borrower) recordBorrowerEvent(borrower, "changes", `Brought ${loan.id} back from recovery: ${note.trim()}`, actorOf(user));
    audit(user, `brought ${loan.id} (${loan.borrowerName}) back from recovery: ${note.trim()}`);
    return new HttpResponse(null, { status: 204 });
  }),

  // ---------- Payments (user flow, phase 6) ----------

  http.get(`${API_BASE}/payments/list`, async ({ request }) => {
    await delay(250);
    const user = currentDemoUser();
    const params = new URL(request.url).searchParams;
    const from = params.get("from") ?? "0000-00-00";
    const to = params.get("to") ?? "9999-99-99";
    const query = (params.get("q") ?? "").trim().toLowerCase();
    const officerId = seesBranch(user) ? params.get("officerId") : null;
    const method = params.get("method");
    const pageSize = Math.min(100, Number(params.get("pageSize")) || 25);
    const officerName = (id: string) => officers.find((o) => o.id === id)?.name ?? "";

    const all: PaymentListItem[] = [];
    for (const loan of loans) {
      if (!canSeeRecord(user, loan.officerId) || (officerId && loan.officerId !== officerId)) continue;
      const borrower = borrowerForLoan(loan.id);
      const terms = borrower ? borrowerDetails.get(borrower.id)?.loanTerms : null;
      if (!borrower || !terms) continue;
      for (const payment of loanPayments(loan.id, terms, officerName(loan.officerId))) {
        all.push({ ...payment, loanId: loan.id, borrower: { id: borrower.id, name: borrower.name }, officer: { id: loan.officerId, name: officerName(loan.officerId) } });
      }
    }
    const digits = query.replace(/\D/g, "");
    const matching = all
      .filter((p) => p.paidAt.slice(0, 10) >= from && p.paidAt.slice(0, 10) <= to)
      .filter((p) => !method || p.method === method)
      .filter(
        (p) =>
          !query ||
          p.loanId.toLowerCase() === query ||
          p.borrower.name.toLowerCase().includes(query) ||
          (p.reference ?? "").toLowerCase().includes(query) ||
          (digits.length >= 3 && (borrowers.find((b) => b.id === p.borrower.id)?.phone ?? "").replace(/\D/g, "").includes(digits)),
      )
      .sort((a, b) => b.paidAt.localeCompare(a.paidAt));
    const byMethod = { "MTN MoMo": 0, "Airtel Money": 0, Cash: 0 };
    matching.forEach((p) => (byMethod[p.method] += p.amount));
    const pageCount = Math.max(1, Math.ceil(matching.length / pageSize));
    const page = Math.min(Math.max(1, Number(params.get("page")) || 1), pageCount);
    return HttpResponse.json<PaymentList>({
      items: matching.slice((page - 1) * pageSize, page * pageSize),
      total: matching.length,
      page,
      pageSize,
      totals: { collected: matching.reduce((sum, p) => sum + p.amount, 0), payments: matching.length, byMethod },
    });
  }),

  // ---------- Disbursement (user flow, phase 5) ----------

  http.get(`${API_BASE}/loans/list`, async ({ request }) => {
    applyAutoRecovery();
    await delay(200);
    const user = currentDemoUser();
    const params = new URL(request.url).searchParams;
    const tab = (params.get("status") as LoanListTab | null) ?? "active";
    const query = (params.get("q") ?? "").trim().toLowerCase();
    const digits = query.replace(/\D/g, "");
    const officerId = seesBranch(user) ? params.get("officerId") : null;
    const lateOnly = params.get("late") === "true";
    const pageSize = Math.min(100, Number(params.get("pageSize")) || 25);

    const matching = loanListItems(user).filter(
      (item) =>
        (!officerId || item.officer.id === officerId) &&
        (!lateOnly || item.daysPastDue > 0) &&
        (!query || item.id.toLowerCase() === query || item.borrower.name.toLowerCase().includes(query) || (digits.length >= 3 && item.phone.replace(/\D/g, "").includes(digits))),
    );
    const open = matching.filter((item) => item.status !== "cleared");
    const cleared = matching.filter((item) => item.status === "cleared");
    const inRecovery = open.filter((item) => item.recovery);
    const inTab = tab === "active" ? open : tab === "recovery" ? inRecovery : tab === "cleared" ? cleared : matching;

    // Active: late first (oldest missed payment first), then by the next payment; cleared: newest first
    const sorted = [...inTab].sort((a, b) => {
      if (tab === "cleared") return (b.clearedOn ?? "").localeCompare(a.clearedOn ?? "");
      if (tab === "all") return b.disbursedOn.localeCompare(a.disbursedOn);
      if (tab === "recovery") return (b.recovery?.since ?? "").localeCompare(a.recovery?.since ?? "");
      return (a.nextPayment?.dueOn ?? "9999").localeCompare(b.nextPayment?.dueOn ?? "9999");
    });
    const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize));
    const page = Math.min(Math.max(1, Number(params.get("page")) || 1), pageCount);
    const late = inTab.filter((item) => item.daysPastDue > 0);
    const toDisburse = applications.filter((app) => app.status === "approved" && !app.loanId && canSeeRecord(user, app.officerId) && (!officerId || app.officerId === officerId)).length;

    return HttpResponse.json<LoanList>({
      items: sorted.slice((page - 1) * pageSize, page * pageSize),
      total: sorted.length,
      page,
      pageSize,
      counts: { toDisburse, active: open.length, recovery: inRecovery.length, cleared: cleared.length, all: matching.length },
      totals: {
        loans: inTab.length,
        outstanding: inTab.reduce((sum, item) => sum + item.balance, 0),
        late: late.length,
        overdue: late.reduce((sum, item) => sum + item.arrearsAmount, 0),
        repaid: inTab.reduce((sum, item) => sum + (item.totalRepayable - item.balance), 0),
      },
    });
  }),



  http.get(`${API_BASE}/loans/to-disburse`, async () => {
    await delay(200);
    syncNewBorrowerApplications();
    const user = currentDemoUser();
    const items: LoanToDisburse[] = applications
      .filter((app) => app.status === "approved" && !app.loanId && canSeeRecord(user, app.officerId))
      .map((app) => {
        const item = applicationListItem(app);
        const borrower = item.borrower.id ? borrowers.find((b) => b.id === item.borrower.id) : undefined;
        return {
          applicationId: app.id,
          borrower: { id: item.borrower.id ?? "", name: item.borrower.name },
          payTo: borrower?.phone ?? app.phone,
          amount: app.amount,
          payout: summariseTerms(termsOf(app)).payout,
          terms: { ...item.terms, pricing: termsOf(app).pricing },
          officer: item.officer,
          approved: { by: app.decided!.by, at: app.decided!.at },
          firstPaymentGapDays: Math.max(0, daysBetween(app.createdAt ?? new Date().toISOString(), termsOf(app).firstPaymentOn)),
          disbursement: disbursementCheck(user, app),
        };
      })
      .sort((a, b) => a.approved.at.localeCompare(b.approved.at)); // waiting longest first
    return HttpResponse.json(items);
  }),

  http.post(`${API_BASE}/applications/:applicationId/disburse`, async ({ params, request }) => {
    await delay(450);
    const replay = replayOf(request);
    if (replay) return replay;
    const user = currentDemoUser();
    const app = applications.find((a) => a.id === params.applicationId);
    if (!app || !canSeeRecord(user, app.officerId)) return HttpResponse.json({ message: "That application wasn't found." }, { status: 404 });
    const check = disbursementCheck(user, app);
    if (!check.allowed) return HttpResponse.json({ message: check.reason }, { status: app.status === "approved" && !app.loanId ? 403 : 409 });
    const borrower = app.borrowerId ? borrowers.find((b) => b.id === app.borrowerId) : borrowers.find((b) => b.applicationId === app.id);
    if (!borrower) return HttpResponse.json({ message: "The client wasn't found." }, { status: 409 });

    const body = (await request.json()) as DisburseRequest;
    const invalid = (message: string) => HttpResponse.json({ message }, { status: 422 });
    if (!systemSettings.payments.payoutMethods.includes(body.method as "MTN MoMo")) return invalid(`Pay out with ${systemSettings.payments.payoutMethods.join(" or ")}.`);
    if (body.consentConfirmed !== true) return invalid("Confirm the payout first.");
    const fromAccount = systemSettings.business.payoutAccounts.find((account) => account.method === body.method && normalisePhone(account.number) === normalisePhone(body.payoutAccount ?? ""));
    if (!fromAccount) return invalid(`Choose one of Tamu's ${body.method} accounts to pay from.`);
    const reference = body.reference?.trim() ?? "";
    if (!reference) return invalid("Enter the mobile money transaction ID.");
    if (!PAYOUT_REFERENCE.test(reference)) return invalid("Check the transaction ID: 6 to 30 letters, numbers, dots or dashes.");
    if (usedPayoutReferences.has(reference.toUpperCase())) return HttpResponse.json({ message: "This transaction ID has already been recorded for another payout." }, { status: 409 });
    const payout = summariseTerms(termsOf(app)).payout;
    if (body.amount !== payout) return invalid(`The amount paid out must be exactly UGX ${payout.toLocaleString("en-US")}.`);
    const today = paymentDate(new Date().toLocaleDateString("en-CA"), "daily", 0);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(body.paidOn ?? "") || body.paidOn > today || body.paidOn < (app.decided?.at ?? "").slice(0, 10)) return invalid("The payout date must be between the approval and today.");

    // The schedule moves with the payout: the first payment keeps the gap planned at application
    const terms = termsOf(app);
    const gap = Math.max(0, daysBetween(app.createdAt ?? today, terms.firstPaymentOn));
    // Calendar dates (local), like the preview: converting through UTC would move them a day in Uganda
    const firstPaymentOn = paymentDate(body.paidOn, "daily", gap);
    const summary = summariseTerms({ ...terms, firstPaymentOn });
    const product = terms.pricing.productName;

    // Load the client's documents while the application is still attached (its signed PDF moves to the loan)
    borrowerDocumentsResponse(borrower);
    const loanId = nextLoanId();
    loans.push({
      id: loanId,
      borrowerName: borrower.name,
      phone: borrower.phone,
      area: borrower.area,
      officerId: app.officerId,
      outstandingBalance: summary.totalRepayable,
      daysPastDue: 0,
      applicationId: app.id,
      payout: { method: body.method, reference, by: user.name, paidOn: body.paidOn },
    });
    borrower.currentLoanId = loanId;
    borrower.applicationId = null;
    borrowerDetails.get(borrower.id)!.loanTerms = {
      product,
      productId: terms.productId,
      principal: app.amount,
      totalRepayable: summary.totalRepayable,
      repaymentSchedule: terms.repaymentSchedule,
      disbursedOn: body.paidOn,
      schedule: { firstPaymentOn, numberOfPayments: terms.numberOfPayments, instalment: summary.instalment },
    };
    app.loanId = loanId;
    app.paidOutAt = new Date().toISOString();
    usedPayoutReferences.add(reference.toUpperCase());
    markApplicationPaidOut(borrower, app.id, loanId, product);

    const amount = `UGX ${payout.toLocaleString("en-US")}`;
    recordBorrowerEvent(borrower, "money", `Disbursed ${amount} for ${loanId} · ${body.method} (${reference}) to ${borrower.phone}`, actorOf(user));
    audit(user, `disbursed ${loanId} · ${amount} to ${borrower.name} (${body.method} ${reference})`);
    const result: DisburseResult = { loanId, firstPaymentOn, lastPaymentOn: summary.lastPaymentOn };
    rememberResult(request, result);
    return HttpResponse.json<DisburseResult>(result, { status: 201 });
  }),

  // (after /loans/list and /loans/to-disburse, which this pattern would also match)
  http.get(`${API_BASE}/loans/:loanId`, async ({ params }) => {
    applyAutoRecovery();
    await delay(200);
    const user = currentDemoUser();
    const loanId = String(params.loanId);
    const officerName = (id: string) => officers.find((o) => o.id === id)?.name ?? "";
    const today = new Date().toLocaleDateString("en-CA");

    const loan = loans.find((l) => l.id === loanId);
    if (loan) {
      const borrower = borrowerForLoan(loanId);
      const terms = borrower ? borrowerDetails.get(borrower.id)?.loanTerms : null;
      if (!borrower || !terms || !canSeeRecord(user, loan.officerId)) return HttpResponse.json({ message: "That loan wasn't found." }, { status: 404 });
      syncOnlineApplications(borrower);
      const balance = Math.max(0, loan.outstandingBalance);
      const repaid = terms.totalRepayable - balance;
      const schedule = scheduleOf(terms, balance, today);
      const app = loan.applicationId ? applications.find((a) => a.id === loan.applicationId) : undefined;
      const paidOff = balance <= 0;
      return HttpResponse.json<LoanDetail>({
        id: loan.id,
        status: paidOff ? "cleared" : loan.daysPastDue > 0 ? "in-arrears" : "active",
        borrower: { id: borrower.id, name: borrower.name, phone: borrower.phone },
        officer: { id: loan.officerId, name: officerName(loan.officerId) },
        product: terms.product,
        principal: terms.principal,
        interest: terms.totalRepayable - terms.principal,
        totalRepayable: terms.totalRepayable,
        repaid,
        balance,
        repaymentSchedule: terms.repaymentSchedule,
        disbursedOn: terms.disbursedOn,
        clearedOn: paidOff ? today : null,
        daysPastDue: paidOff ? 0 : loan.daysPastDue,
        arrearsAmount: paidOff ? 0 : Math.min(loan.arrearsAmount || (nextPayment(terms, balance)?.amount ?? 0), balance),
        mostDaysLate: loan.daysPastDue,
        nextPayment: paidOff ? null : nextPayment(terms, balance),
        recovery: paidOff ? null : recoveryOf(loan),
        lateFees: lateFeesOf(terms, schedule, paidOff ? 0 : loan.daysPastDue, paidOff ? 0 : Math.min(loan.arrearsAmount || (nextPayment(terms, balance)?.amount ?? 0), balance)),
        applicationId: loan.applicationId ?? null,
        approvedBy: app?.decided?.by ?? null,
        payout: loan.payout ?? null,
        schedule,
        payments: loanPayments(loan.id, terms, officerName(loan.officerId)),
        signedApplication: publicDocument(applicationVersionFor(borrower, loan.id)),
      });
    }

    // A loan repaid in full: its schedule (all paid) and its payments
    const past = pastLoans.find((l) => l.id === loanId);
    const borrower = past && borrowers.find((b) => b.id === past.borrowerId);
    if (!past || !borrower || !canSeeRecord(user, borrower.officerId)) return HttpResponse.json({ message: "That loan wasn't found." }, { status: 404 });
    const total = past.totalRepayable;
    const pastSchedule: LoanInstalment[] = Array.from({ length: past.schedule.numberOfPayments }, (_, index) => {
      const amount = index === past.schedule.numberOfPayments - 1 ? total - past.schedule.instalment * index : past.schedule.instalment;
      return { number: index + 1, dueOn: paymentDate(past.schedule.firstPaymentOn, past.repaymentSchedule, index), amount, paid: amount, status: "paid" as const };
    });
    const version = applicationVersionFor(borrower, past.id);
    return HttpResponse.json<LoanDetail>({
      id: past.id,
      status: "cleared",
      borrower: { id: borrower.id, name: borrower.name, phone: borrower.phone },
      officer: { id: borrower.officerId, name: officerName(borrower.officerId) },
      lateFees: { amount: 0, rule: "" },
      product: past.product,
      principal: past.principal,
      interest: total - past.principal,
      totalRepayable: total,
      repaid: total,
      balance: 0,
      repaymentSchedule: past.repaymentSchedule,
      disbursedOn: past.disbursedOn,
      clearedOn: past.clearedOn,
      daysPastDue: 0,
      arrearsAmount: 0,
      mostDaysLate: past.mostDaysLate,
      nextPayment: null,
      recovery: null,
      applicationId: null,
      approvedBy: null,
      payout: null,
      schedule: pastSchedule,
      payments: loanPayments(past.id),
      signedApplication: publicDocument(version),
    });
  }),

  // ---------- New application (user flow, phase 3) ----------

  http.get(`${API_BASE}/applications`, async ({ request }) => {
    await delay(200);
    syncNewBorrowerApplications();
    const user = currentDemoUser();
    if (!hasPermission(user, "applications.view")) return HttpResponse.json({ message: "You can't see applications." }, { status: 403 });
    const params = new URL(request.url).searchParams;
    const query = (params.get("q") ?? "").trim().toLowerCase();
    const digits = query.replace(/\D/g, "");
    const status = params.get("status") as ApplicationStatus | null;
    const pageSize = Math.min(100, Number(params.get("pageSize")) || 25);

    // Officers see their own; approvers and branch-wide users see every application
    const branchWide = seesBranch(user) || hasPermission(user, "applications.approve");
    const matching = applications
      .filter((app) => branchWide || app.officerId === user.id)
      .map(applicationListItem)
      .filter((item) => {
        if (!query) return true;
        const app = applications.find((a) => a.id === item.id)!;
        return item.id.toLowerCase() === query || item.borrower.name.toLowerCase().includes(query) || (digits.length >= 3 && app.phone.replace(/\D/g, "").includes(digits));
      });
    const counts: ApplicationList["counts"] = { draft: 0, "awaiting-borrower": 0, submitted: 0, approved: 0, rejected: 0 };
    matching.forEach((item) => counts[item.status]++);

    const latest = (item: ApplicationListItem) => item.decided?.at ?? item.returned?.at ?? item.submittedAt ?? item.createdAt;
    const filtered = (status ? matching.filter((item) => item.status === status) : matching).sort((a, b) => latest(b).localeCompare(latest(a)));
    const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
    const page = Math.min(Math.max(1, Number(params.get("page")) || 1), pageCount);
    return HttpResponse.json<ApplicationList>({ items: filtered.slice((page - 1) * pageSize, page * pageSize), total: filtered.length, page, pageSize, counts });
  }),

  http.get(`${API_BASE}/applications/:applicationId`, async ({ params }) => {
    await delay(200);
    syncNewBorrowerApplications();
    const user = currentDemoUser();
    const app = visibleApplication(user, String(params.applicationId));
    if (!app) return HttpResponse.json({ message: "That application wasn't found." }, { status: 404 });
    const borrower = app.borrowerId ? borrowers.find((b) => b.id === app.borrowerId) : borrowers.find((b) => b.applicationId === app.id);
    if (borrower) syncOnlineApplications(borrower);
    return HttpResponse.json<ApplicationDetail>(applicationDetail(app, user));
  }),

  http.get(`${API_BASE}/applications/:applicationId/draft`, async ({ params }) => {
    await delay(200);
    const user = currentDemoUser();
    const found = editableDraft(user, String(params.applicationId));
    if ("error" in found) return found.error;
    const { app, borrower } = found;
    const sections = borrowerDocumentsResponse(borrower).sections;
    const identity = sections.find((section) => section.id === "identity")?.slots ?? [];
    // Full guarantor NINs, for correcting them: logged
    audit(user, `opened draft ${app.id} for editing (guarantor ID numbers shown)`);
    return HttpResponse.json<ApplicationDraft>({
      id: app.id,
      borrower: { id: borrower.id, name: borrower.name, phone: borrower.phone, area: borrower.area },
      terms: termsOf(app),
      guarantors: (app.guarantors ?? applicationGuarantors(borrower, app.id)).map((g) => ({ ...g, relationship: g.relationship ?? "" })),
      signedApplication: sections.find((section) => section.id === app.id)?.slots[0]?.file ?? null,
      idCopyComplete: identity.every((slot) => !!slot.file),
      missing: app.missing,
      returned: app.returned ?? null,
    });
  }),

  http.patch(`${API_BASE}/applications/:applicationId`, async ({ params, request }) => {
    await delay(450);
    const user = currentDemoUser();
    const found = editableDraft(user, String(params.applicationId));
    if ("error" in found) return found.error;
    const { app, borrower } = found;
    const form = await request.formData();
    let body: UpdateApplicationRequest;
    try {
      body = JSON.parse(String(form.get("application"))) as UpdateApplicationRequest;
    } catch {
      return HttpResponse.json({ message: "The application couldn't be read." }, { status: 422 });
    }
    const invalid = (message: string) => HttpResponse.json({ message }, { status: 422 });
    const terms = body.terms;
    const termsProblem = checkTerms(terms, app.terms?.productId ?? null);
    if (termsProblem) return invalid(termsProblem);
    const guarantors = (body.guarantors ?? []).filter((g) => g?.fullName?.trim() && NATIONAL_ID.test(g.nationalId ?? "") && normalisePhone(g.phone ?? ""));
    if (guarantors.some((g) => g.nationalId === borrower.nin) || (guarantors.length === 2 && guarantors[0].nationalId === guarantors[1].nationalId))
      return invalid("The client and the two guarantors must be three different people.");
    const signed = form.get("signedApplication");
    const signedFile = signed instanceof File && signed.size > 0 ? signed : null;
    if (signedFile && (signedFile.size > MAX_UPLOAD_BYTES || (await sniffDocumentType(signedFile)) !== "application/pdf")) return HttpResponse.json({ message: "The signed application must be one PDF, up to 5 MB." }, { status: 415 });

    app.terms = terms;
    app.amount = terms.amount;
    app.guarantors = guarantors.map((g) => ({ fullName: g.fullName.trim().replace(/\s+/g, " "), nationalId: g.nationalId, phone: normalisePhone(g.phone)!, relationship: g.relationship?.trim() ?? "" }));
    if (signedFile) {
      addDocumentVersion({ borrowerId: borrower.id, slotKey: `${app.id}:application`, fileName: "loan-application.pdf", contentType: "application/pdf", sizeBytes: signedFile.size, uploadedBy: user.name, uploadedAt: new Date().toISOString(), method: "scanned", file: new Blob([await signedFile.arrayBuffer()], { type: "application/pdf" }) });
    }
    const missing = draftMissing(app, borrower);
    if (body.submit && missing) {
      app.missing = missing;
      updateApplicationForms(borrower, app);
      return invalid(`Your changes are saved, but it can't be submitted yet: ${missing.toLowerCase()}.`);
    }
    const sentBack = app.returned;
    if (body.submit) {
      app.status = "submitted";
      app.submittedAt = new Date().toISOString();
      app.missing = null;
      app.returned = undefined;
    } else {
      app.missing = missing;
    }
    updateApplicationForms(borrower, app);
    const amount = `UGX ${terms.amount.toLocaleString("en-US")}`;
    recordBorrowerEvent(borrower, "changes", body.submit ? `${sentBack ? "Fixed and resubmitted" : "Submitted"} application ${app.id} · ${amount} for approval${sentBack ? ` (sent back for: ${sentBack.reason})` : ""}` : `Updated draft application ${app.id}`, actorOf(user));
    audit(user, `${body.submit ? (sentBack ? "resubmitted" : "submitted") : "updated"} application ${app.id}`);
    return HttpResponse.json<ApplicationDetail>(applicationDetail(app, user));
  }),

  http.post(`${API_BASE}/applications/:applicationId/approve`, async ({ params, request }) => {
    await delay(350);
    const user = currentDemoUser();
    const app = visibleApplication(user, String(params.applicationId));
    if (!app) return HttpResponse.json({ message: "That application wasn't found." }, { status: 404 });
    const detail = applicationDetail(app, user);
    if (app.status !== "submitted") return HttpResponse.json({ message: "This application isn't waiting for approval any more." }, { status: 409 });
    if (!detail.decision.allowed) return HttpResponse.json({ message: detail.decision.reason }, { status: 403 });
    if (!detail.documents.signedApplication) return HttpResponse.json({ message: "There's no signed application to check." }, { status: 422 });
    const { checks } = (await request.json()) as ApproveApplicationRequest;
    if (!checks?.signedPdfMatchesDetails || !checks.idCopyMatchesNin || !checks.guarantorsSigned) return HttpResponse.json({ message: "Confirm all three checks before approving." }, { status: 422 });

    app.status = "approved";
    app.decided = { by: user.name, byId: user.id, at: new Date().toISOString() };
    const borrower = detail.borrower.id ? borrowers.find((b) => b.id === detail.borrower.id) : undefined;
    const amount = `UGX ${app.amount.toLocaleString("en-US")}`;
    if (borrower) recordBorrowerEvent(borrower, "changes", `Approved application ${app.id} · ${amount} (checked: signed PDF, ID copy, guarantors)`, actorOf(user));
    audit(user, `approved ${app.id} · ${amount}`);
    return HttpResponse.json<ApplicationDetail>(applicationDetail(app, user));
  }),

  http.post(`${API_BASE}/applications/:applicationId/reject`, async ({ params, request }) => {
    await delay(350);
    const user = currentDemoUser();
    const app = visibleApplication(user, String(params.applicationId));
    if (!app) return HttpResponse.json({ message: "That application wasn't found." }, { status: 404 });
    const detail = applicationDetail(app, user);
    if (app.status !== "submitted") return HttpResponse.json({ message: "This application isn't waiting for approval any more." }, { status: 409 });
    if (!detail.decision.allowed) return HttpResponse.json({ message: detail.decision.reason }, { status: 403 });
    const { reason, note } = (await request.json()) as RejectApplicationRequest;
    if (!(reason in REJECTION_REASONS)) return HttpResponse.json({ message: "Choose a reason." }, { status: 422 });
    if ((reason === "other" || reason === "not-eligible") && !note?.trim()) return HttpResponse.json({ message: "Add a note explaining why." }, { status: 422 });

    const at = new Date().toISOString();
    app.returned = { reason: REJECTION_REASONS[reason], note: note?.trim() || null, by: user.name, at };
    const borrower = detail.borrower.id ? borrowers.find((b) => b.id === detail.borrower.id) : undefined;
    if (reason === "not-eligible") {
      // Closed for good; a client with earlier loans goes back to their history, a newcomer stays on record
      app.status = "rejected";
      app.decided = { by: user.name, at };
      if (borrower && borrower.clearedLoans > 0) borrower.applicationId = null;
    } else {
      // Back to the officer to fix and resubmit
      app.status = "draft";
      app.missing = null;
    }
    const verb = reason === "not-eligible" ? "Rejected" : "Sent back";
    if (borrower) recordBorrowerEvent(borrower, "changes", `${verb} application ${app.id}: ${REJECTION_REASONS[reason]}${note?.trim() ? ` (${note.trim()})` : ""}`, actorOf(user));
    audit(user, `${verb.toLowerCase()} ${app.id}: ${REJECTION_REASONS[reason]}`);
    return HttpResponse.json<ApplicationDetail>(applicationDetail(app, user));
  }),

  http.post(`${API_BASE}/applications`, async ({ request }) => {
    await delay(500);
    const user = currentDemoUser();
    if (!hasPermission(user, "applications.create")) return HttpResponse.json({ message: "You can't create applications." }, { status: 403 });
    const form = await request.formData();
    let body: NewApplicationRequest;
    try {
      body = JSON.parse(String(form.get("application"))) as NewApplicationRequest;
    } catch {
      return HttpResponse.json({ message: "The application couldn't be read." }, { status: 422 });
    }
    const invalid = (message: string) => HttpResponse.json({ message }, { status: 422 });

    // Loan terms
    const terms = body.terms;
    const termsProblem = checkTerms(terms);
    if (termsProblem) return invalid(termsProblem);

    // Who it's for
    let borrower = body.borrowerId ? borrowers.find((b) => b.id === body.borrowerId) : undefined;
    if (body.borrowerId && (!borrower || !canSeeRecord(user, borrower.officerId))) return HttpResponse.json({ message: "That client wasn't found." }, { status: 404 });
    if (borrower) {
      const loan = borrower.currentLoanId ? loans.find((l) => l.id === borrower!.currentLoanId) : undefined;
      if (loan && loan.outstandingBalance > 0 && systemSettings.loanRules.oneOpenLoanPerBorrower)
        return HttpResponse.json({ message: `${borrower.name} still has ${loan.id} to repay. A new loan can start once it's cleared.` }, { status: 409 });
      const open = borrower.applicationId ? applications.find((app) => app.id === borrower!.applicationId) : undefined;
      if (open && open.status !== "rejected") return HttpResponse.json({ message: `${borrower.name} already has application ${open.id} in progress.` }, { status: 409 });
    }

    const paper = body.route === "paper";
    const submit = paper && body.submit;
    const person = body.newBorrower;
    if (paper && !borrower) {
      if (!person?.fullName?.trim() || person.fullName.trim().split(/\s+/).length < 2) return invalid("Enter the client's full name, as on their National ID.");
      if (!NATIONAL_ID.test(person.nationalId ?? "")) return invalid("Check the client's National ID number.");
      if (!normalisePhone(person.phone ?? "")) return invalid("Check the client's phone number.");
      if (submit) {
        const problem = newBorrowerProblem(person);
        if (problem) return invalid(problem);
      }
      // Not saying whose: an officer mustn't learn about another officer's clients
      if (borrowers.some((b) => b.nin === person.nationalId)) return HttpResponse.json({ message: "A client with this National ID is already registered. Search for them instead, or ask an admin." }, { status: 409 });
    }
    const guarantors = (paper ? body.guarantors ?? [] : []).filter((g) => g?.fullName?.trim() && NATIONAL_ID.test(g.nationalId ?? "") && normalisePhone(g.phone ?? ""));
    const borrowerNin = borrower?.nin ?? person?.nationalId;
    if (guarantors.some((g) => g.nationalId === borrowerNin) || (guarantors.length === 2 && guarantors[0].nationalId === guarantors[1].nationalId))
      return invalid("The client and the two guarantors must be three different people.");
    if (submit && guarantors.length !== 2) return invalid("Enter both guarantors' details.");

    // Files (paper route)
    const signed = form.get("signedApplication");
    const signedFile = signed instanceof File && signed.size > 0 ? signed : null;
    if (signedFile && (signedFile.size > MAX_UPLOAD_BYTES || (await sniffDocumentType(signedFile)) !== "application/pdf")) return HttpResponse.json({ message: "The signed application must be one PDF, up to 5 MB." }, { status: 415 });
    if (submit && !signedFile) return invalid("Upload the signed application (one PDF).");
    // The ID copies are in the signed PDF: no separate ID photos on the paper route

    // Create it
    const officerId = officers.some((o) => o.id === user.id) ? user.id : (borrower?.officerId ?? officers[0].id);
    if (paper && !borrower && person)
      borrower = registerBorrower(
        {
          ...person,
          fullName: person.fullName.trim().replace(/\s+/g, " "),
          phone: normalisePhone(person.phone)!,
          secondaryPhone: person.secondaryPhone ? normalisePhone(person.secondaryPhone) : null,
          premises: person.premises?.trim() ?? "",
          occupation: person.occupation?.trim() ?? "",
          area: person.area?.trim() ?? "",
          nextOfKin: { name: person.nextOfKin?.name?.trim() || null, phone: normalisePhone(person.nextOfKin?.phone ?? "") },
        },
        officerId,
      );
    const missing = paper
      ? [guarantors.length < 2 && "Guarantor details missing", !signedFile && "Signed application PDF missing"].find(Boolean) || null
      : "Waiting for the client to complete it online";
    const app = {
      id: nextApplicationId(),
      borrowerName: borrower?.name ?? "New client (online)",
      phone: borrower?.phone ?? "",
      amount: terms.amount,
      purpose: "",
      officerId: borrower?.officerId ?? officerId,
      status: (submit ? "submitted" : "draft") as "submitted" | "draft",
      missing: submit ? null : missing,
      borrowerId: borrower?.id ?? null,
      terms,
      route: body.route,
      guarantors: guarantors.map((g) => ({ fullName: g.fullName.trim(), nationalId: g.nationalId, phone: normalisePhone(g.phone)!, relationship: g.relationship?.trim() ?? "" })),
      createdAt: new Date().toISOString(),
      ...(submit ? { submittedAt: new Date().toISOString() } : {}),
    };
    applications.push(app);
    if (borrower) {
      borrower.applicationId = app.id;
      addApplicationSection(borrower, app);
    }

    const actor = actorOf(user);
    const base = { uploadedBy: user.name, uploadedAt: new Date().toISOString(), method: "scanned" as const };
    if (borrower && signedFile) {
      addDocumentVersion({ ...base, borrowerId: borrower.id, slotKey: `${app.id}:application`, fileName: "loan-application.pdf", contentType: "application/pdf", sizeBytes: signedFile.size, file: new Blob([await signedFile.arrayBuffer()], { type: "application/pdf" }) });
    }

    let onlineLink: NewApplicationResult["onlineLink"] = null;
    if (!paper) {
      const link = createOnlineLinkForApplication(app, borrower?.id ?? null, app.officerId, user.name);
      onlineLink = { url: `${location.origin}/forms/${link.token}`, expiresAt: link.expiresAt };
    }
    const amount = `UGX ${terms.amount.toLocaleString("en-US")}`;
    if (borrower) {
      if (borrower.addedInSession && paper) recordBorrowerEvent(borrower, "changes", "Registered the client", actor);
      recordBorrowerEvent(borrower, "changes", `${submit ? "Submitted" : paper ? "Started" : "Sent an online link for"} application ${app.id} · ${amount}${submit ? " for approval (paper forms)" : ""}`, actor);
    }
    audit(user, `${submit ? "submitted" : "started"} application ${app.id} · ${amount}${borrower ? ` for ${borrower.name}` : " (online, new client)"}`);
    return HttpResponse.json<NewApplicationResult>({ id: app.id, borrowerId: borrower?.id ?? null, status: app.status, onlineLink }, { status: 201 });
  }),

  // ---------- Online loan application (public: the link's token is the only access) ----------

  // ----- Set your password (public: the token in the emailed link is the only access) -----
  http.get(`${API_BASE}/public/invites/:token`, async ({ params }) => {
    await delay(300);
    const link = findPasswordLink(String(params.token));
    const problem = passwordLinkProblem(link);
    if (problem) return HttpResponse.json({ message: PASSWORD_LINK_PROBLEMS[problem], reason: problem }, { status: problem === "invalid" ? 404 : 410 });
    return HttpResponse.json<PasswordLinkInfo>(
      { name: link!.name, email: link!.email, purpose: link!.purpose, minPasswordLength: systemSettings.security.minPasswordLength, expiresAt: link!.expiresAt },
      { headers: { "Cache-Control": "no-store" } },
    );
  }),

  http.post(`${API_BASE}/public/invites/:token`, async ({ params, request }) => {
    await delay(500);
    const token = String(params.token);
    const link = findPasswordLink(token);
    const problem = passwordLinkProblem(link);
    if (problem) return HttpResponse.json({ message: PASSWORD_LINK_PROBLEMS[problem], reason: problem }, { status: problem === "invalid" ? 404 : 410 });
    const { password } = (await request.json()) as SetPasswordRequest;
    // The same rules as changing a password; the demo can't tell this person's name and email apart from the link's
    const wrong = passwordProblem(password ?? "", { email: link!.email, name: link!.name } as MockUser);
    if (wrong) return HttpResponse.json({ message: wrong }, { status: 422 });
    markPasswordLinkUsed(token);
    const member = findStaff(link!.staffId);
    if (member?.status === "invited") {
      member.status = "active";
      member.invite = null;
    }
    // The person is the actor: nobody else knows the password, and admins never see it
    audit({ id: link!.staffId, name: link!.name, roleId: member?.roleId ?? "", photoUrl: member?.photoUrl ?? null } as MockUser, link!.purpose === "invite" ? "accepted their invite and set a password for their account" : "reset the password for their account");
    return new HttpResponse(null, { status: 204 });
  }),

  http.get(`${API_BASE}/public/forms/:token`, async ({ params }) => {
    await delay(300);
    const application = findOnlineApplication(String(params.token));
    const problem = linkProblem(application);
    if (problem) return HttpResponse.json({ message: LINK_PROBLEM_MESSAGES[problem], reason: problem }, { status: problem === "invalid" ? 404 : 410 });
    return HttpResponse.json<OnlineApplicationForm>({ ...application!.form, expiresAt: application!.expiresAt }, { headers: { "Cache-Control": "no-store" } });
  }),

  http.post(`${API_BASE}/public/forms/:token`, async ({ params, request }) => {
    await delay(700);
    const token = String(params.token);
    const application = findOnlineApplication(token);
    const problem = linkProblem(application);
    if (problem) return HttpResponse.json({ message: LINK_PROBLEM_MESSAGES[problem], reason: problem }, { status: problem === "invalid" ? 404 : 410 });

    const form = await request.formData();
    let details: OnlineApplicationDetails;
    try {
      details = JSON.parse(String(form.get("details"))) as OnlineApplicationDetails;
    } catch {
      return HttpResponse.json({ message: "The form couldn't be read. Try again." }, { status: 422 });
    }
    // Same checks as the form, never trusting the browser
    const people = [details.borrower, ...(details.guarantors ?? [])];
    if (people.length !== 3) return HttpResponse.json({ message: "Two guarantors are needed." }, { status: 422 });
    for (const person of people) {
      if (!person?.fullName?.trim() || person.fullName.trim().split(/\s+/).length < 2) return HttpResponse.json({ message: "Enter each person's full name, as on their National ID." }, { status: 422 });
      if (!NATIONAL_ID.test(person.nationalId ?? "")) return HttpResponse.json({ message: `Check the National ID number for ${person.fullName}.` }, { status: 422 });
      if (!normalisePhone(person.phone ?? "")) return HttpResponse.json({ message: `Check the phone number for ${person.fullName}.` }, { status: 422 });
    }
    if (new Set(people.map((p) => p.nationalId)).size !== 3) return HttpResponse.json({ message: "The client and the two guarantors must be three different people." }, { status: 422 });
    const borrowerProblem = newBorrowerProblem(details.borrower);
    if (borrowerProblem) return HttpResponse.json({ message: borrowerProblem }, { status: 422 });
    if (details.guarantors.some((g) => !g.relationship?.trim())) return HttpResponse.json({ message: "Say how each guarantor knows you." }, { status: 422 });
    // No drawn signatures: each of the three people must have ticked the consent box
    if (details.consent?.borrower !== true || details.consent?.guarantor1 !== true || details.consent?.guarantor2 !== true) return HttpResponse.json({ message: "All three people need to tick the box to agree." }, { status: 422 });

    const images = {
      idFront: await imageFromForm(form, "idFront", true, MAX_UPLOAD_BYTES),
      idBack: await imageFromForm(form, "idBack", true, MAX_UPLOAD_BYTES),
      g1Front: await imageFromForm(form, "guarantor1IdFront", true, MAX_UPLOAD_BYTES),
      g1Back: await imageFromForm(form, "guarantor1IdBack", true, MAX_UPLOAD_BYTES),
      g2Front: await imageFromForm(form, "guarantor2IdFront", true, MAX_UPLOAD_BYTES),
      g2Back: await imageFromForm(form, "guarantor2IdBack", true, MAX_UPLOAD_BYTES),
    };
    const failed = Object.values(images).find((image) => typeof image === "string");
    if (failed) return HttpResponse.json({ message: "A photo couldn't be read. Take it again and resubmit." }, { status: 422 });
    const image = (value: StoredImage | string) => value as StoredImage;

    const normalised: OnlineApplicationDetails = {
      borrower: {
        ...details.borrower,
        fullName: details.borrower.fullName.trim(),
        phone: normalisePhone(details.borrower.phone)!,
        secondaryPhone: details.borrower.secondaryPhone ? normalisePhone(details.borrower.secondaryPhone) : null,
        premises: details.borrower.premises.trim(),
        occupation: details.borrower.occupation?.trim() ?? "",
        area: details.borrower.area.trim(),
        nextOfKin: { name: details.borrower.nextOfKin?.name?.trim() || null, phone: normalisePhone(details.borrower.nextOfKin?.phone ?? "") },
      },
      guarantors: details.guarantors.map((g) => ({ fullName: g.fullName.trim(), nationalId: g.nationalId, phone: normalisePhone(g.phone)!, relationship: g.relationship.trim() })) as OnlineApplicationDetails["guarantors"],
      consent: { borrower: true, guarantor1: true, guarantor2: true },
    };
    // The link stops working now
    submitOnlineApplication(token, {
      details: normalised,
      idFront: image(images.idFront),
      idBack: image(images.idBack),
      guarantorIds: [
        { front: image(images.g1Front), back: image(images.g1Back) },
        { front: image(images.g2Front), back: image(images.g2Back) },
      ],
      consentAt: new Date().toISOString(),
    });
    const borrower = borrowers.find((b) => b.id === application!.borrowerId);
    if (borrower) syncOnlineApplications(borrower);
    else syncNewBorrowerApplications();
    return HttpResponse.json({ reference: application!.form.reference }, { status: 201 });
  }),

  http.post(`${API_BASE}/auth/login`, async ({ request }) => {
    await delay(400);
    const { email, password } = (await request.json()) as { email: string; password: string };
    const key = email.trim().toLowerCase();
    const user = users.find((u) => u.email.toLowerCase() === key);
    // Lockout after too many failed attempts (Settings → Security)
    const { maxFailedSignIns, lockoutMinutes } = systemSettings.security;
    const attempts = failedSignIns.get(key);
    if (attempts?.lockedUntil && attempts.lockedUntil > Date.now())
      return HttpResponse.json({ message: `Too many failed attempts. Try again in ${Math.ceil((attempts.lockedUntil - Date.now()) / 60_000)} minutes, or ask an admin.` }, { status: 429 });
    if (!user || password !== (passwords.get(user.id) ?? DEMO_PASSWORD)) {
      if (user) audit(user, "failed sign-in (wrong password)");
      const failures = (attempts?.lockedUntil ? 0 : (attempts?.failures ?? 0)) + 1;
      failedSignIns.set(key, { failures, lockedUntil: failures >= maxFailedSignIns ? Date.now() + lockoutMinutes * 60_000 : null });
      return HttpResponse.json({ message: "That email and password don't match. Check them and try again." }, { status: 401 });
    }
    failedSignIns.delete(key);
    audit(user, "signed in");
    if (findStaff(user.id)?.status !== "active")
      return HttpResponse.json({ message: "This account has been switched off. Ask an admin if you need access again." }, { status: 401 });
    setDemoSession(user.id);
    return new HttpResponse(null, { status: 204 });
  }),

  http.post(`${API_BASE}/auth/logout`, async () => {
    await delay(150);
    setDemoSession(null);
    return new HttpResponse(null, { status: 204 });
  }),

  http.get(`${API_BASE}/me`, async () => {
    await delay(150);
    const user = signedInDemoUser();
    // A deactivated account is signed out on its next request
    if (!user || findStaff(user.id)?.status !== "active") return HttpResponse.json({ message: "Please sign in." }, { status: 401 });
    const role = roles[user.roleId];
    const body: CurrentUser = {
      id: user.id,
      name: user.name,
      email: user.email,
      photoUrl: user.photoUrl,
      branch: user.branch,
      role: { id: role.id, name: role.name },
      permissions: role.permissions,
      dataScope: role.dataScope,
    };
    return HttpResponse.json(body);
  }),

  http.get(`${API_BASE}/search`, async ({ request }) => {
    await delay(120);
    const user = currentDemoUser();
    const query = (new URL(request.url).searchParams.get("q") ?? "").trim().toLowerCase();
    if (query.length < MIN_SEARCH_LENGTH) return HttpResponse.json<SearchResult[]>([]);

    const digits = query.replace(/\D/g, "");
    const matches = (name: string, id: string, phone: string) =>
      name.toLowerCase().includes(query) ||
      id.toLowerCase().includes(query) ||
      (digits.length >= 3 && phone.replace(/\D/g, "").includes(digits));

    const loanResults: SearchResult[] = loans
      .filter((loan) => canSeeRecord(user, loan.officerId) && matches(loan.borrowerName, loan.id, loan.phone))
      .map((loan) => ({
        kind: "loan",
        id: loan.id,
        title: loan.borrowerName,
        subtitle: `${loan.id} · ${loan.phone} · ${loan.daysPastDue ? `${dayCount(loan.daysPastDue)} late` : "up to date"}`,
        href: `/loans/${loan.id}`,
      }));
    const applicationResults: SearchResult[] = applications
      .filter((app) => canSeeRecord(user, app.officerId) && matches(app.borrowerName, app.id, app.phone))
      .map((app) => ({
        kind: "application",
        id: app.id,
        title: app.borrowerName,
        subtitle: `${app.id} · application · UGX ${app.amount.toLocaleString("en-US")}`,
        href: `/applications/${app.id}`,
      }));

    return HttpResponse.json([...loanResults, ...applicationResults].slice(0, MAX_SEARCH_RESULTS));
  }),

  http.get(`${API_BASE}/notifications`, async () => {
    await delay(120);
    const user = currentDemoUser();
    const read = readNotificationIds.get(user.id) ?? new Set<string>();
    const body: NotificationItem[] = notificationsFor(user).map((item) => ({ ...item, unread: !read.has(item.id) }));
    return HttpResponse.json(body);
  }),

  http.get(`${API_BASE}/notifications/history`, async ({ request }) => {
    await delay(150);
    const user = currentDemoUser();
    const url = new URL(request.url);
    const channel = url.searchParams.get("channel");
    const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
    const pageSize = 20;
    const all = notificationHistoryFor(user, (permission) => hasPermission(user, permission));
    const shown = channel && ["in-app", "sms", "email"].includes(channel) ? all.filter((message) => message.channel === channel) : all;
    const count = (name: string) => all.filter((message) => message.channel === name).length;
    return HttpResponse.json<NotificationHistoryPage>({
      items: shown.slice((page - 1) * pageSize, page * pageSize),
      total: shown.length,
      page,
      pageSize,
      counts: { all: all.length, "in-app": count("in-app"), sms: count("sms"), email: count("email") },
    });
  }),

  http.post(`${API_BASE}/notifications/mark-read`, () => {
    const user = currentDemoUser();
    readNotificationIds.set(user.id, new Set(notificationsFor(user).map((item) => item.id)));
    return new HttpResponse(null, { status: 204 });
  }),

  http.get(`${API_BASE}/navigation/badges`, async () => {
    await delay(100);
    const user = currentDemoUser();
    // Approvers and admins see what's waiting for approval; officers see their unfinished drafts.
    const applicationsCount =
      hasPermission(user, "applications.approve") || seesBranch(user)
        ? applications.filter((app) => app.status === "submitted").length
        : tasksForUser(user.id, (p) => hasPermission(user, p)).filter((task) => task.type === "application-incomplete" && task.status === "open").length;
    return HttpResponse.json<NavigationBadges>({ applications: applicationsCount });
  }),

  http.get(`${API_BASE}/dashboard/today`, async () => {
    await delay(150);
    const user = currentDemoUser();
    const tasks = tasksForUser(user.id, (p) => hasPermission(user, p));
    const openOf = <T extends WorklistTask["type"]>(type: T) =>
      tasks.filter((task): task is Extract<WorklistTask, { type: T }> => task.type === type && task.status === "open");
    const today: DashboardToday = {};
    // Each box needs a permission, not a particular role, so custom roles get the boxes their permissions allow
    const can = (permission: Permission) => hasPermission(user, permission);
    const ownBook = can("loans.view") && !seesBranch(user);
    if (can("loans.view")) {
      const open = loans.filter((loan) => loan.outstandingBalance > 0 && canSeeRecord(user, loan.officerId));
      today.activeLoans = { count: open.length, outstanding: open.reduce((sum, loan) => sum + loan.outstandingBalance, 0), lateCount: open.filter((loan) => loan.daysPastDue > 0).length };
    }
    // Due to collect: your own clients, or (for people who record payments market-wide) everyone's
    const collectionTasks = ownBook ? tasks : can("payments.record") ? officers.flatMap((officer) => (canSeeRecord(user, officer.id) ? tasksFor(officer.id) : [])) : null;
    if (collectionTasks) {
      const dueToday = collectionTasks.filter((task) => task.type === "instalment-due" || task.type === "promise-due");
      const loanTasks = collectionTasks.filter((task) => "amountPaid" in task);
      today.collections = {
        dueCount: dueToday.filter((task) => task.status === "open").length,
        collectedAmount: loanTasks.reduce((sum, task) => sum + ("amountPaid" in task ? task.amountPaid : 0), 0),
        expectedAmount: dueToday.reduce((sum, task) => sum + ("amountDue" in task ? task.amountDue : 0), 0),
      };
    }
    if (ownBook) {
      const overdue = openOf("overdue");
      const withRecovery = loans.filter((loan) => loan.officerId === user.id && loan.outstandingBalance > 0 && loan.recovery).length;
      today.followUps = { overdueCount: overdue.length, over30DaysCount: overdue.filter((task) => task.daysPastDue > 30).length, withRecoveryCount: withRecovery };
    }
    if (can("applications.create")) today.applicationsToComplete = { count: openOf("application-incomplete").length };
    if (can("applications.approve") || can("users.manage")) {
      const waiting = openOf("awaiting-approval");
      today.awaitingApproval = { count: waiting.length, over48HoursCount: waiting.filter((task) => task.hoursWaiting > 48).length };
    }
    if (can("loans.disburse") || can("users.manage")) {
      const disbursements = openOf("awaiting-disbursement");
      today.approvedNotDisbursed = { count: disbursements.length, amount: disbursements.reduce((sum, task) => sum + task.amount, 0) };
    }
    if (can("users.manage")) today.accessRequests = { count: openOf("access-request").length };
    return HttpResponse.json(today);
  }),

  http.get(`${API_BASE}/worklist`, async () => {
    await delay(150);
    const user = currentDemoUser();
    return HttpResponse.json<WorklistTask[]>(tasksForUser(user.id, (p) => hasPermission(user, p)));
  }),

  http.get(`${API_BASE}/loans`, async () => {
    await delay(120);
    const user = currentDemoUser();
    const body: LoanSummary[] = loans
      .filter((loan) => canSeeRecord(user, loan.officerId) && loan.outstandingBalance > 0)
      .map((loan) => {
        const task = openTaskForLoan(loan.id);
        const dueToday = task && (task.type === "instalment-due" || task.type === "promise-due") ? task.amountDue - task.amountPaid : null;
        return { id: loan.id, borrowerName: loan.borrowerName, phone: loan.phone, outstandingBalance: loan.outstandingBalance, owedNow: owedNowOf(loan), dueToday };
      })
      .sort((a, b) => a.borrowerName.localeCompare(b.borrowerName));
    return HttpResponse.json(body);
  }),

  http.post(`${API_BASE}/payments`, async ({ request }) => {
    await delay(250);
    const replay = replayOf(request);
    if (replay) return replay;
    const user = currentDemoUser();
    const body = (await request.json()) as RecordPaymentRequest;
    const loan = loans.find((l) => l.id === body.loanId);
    if (!loan || !canSeeRecord(user, loan.officerId)) return HttpResponse.json({ message: "That loan wasn't found." }, { status: 404 });
    if (!(body.amount > 0)) return HttpResponse.json({ message: "Enter an amount above zero." }, { status: 422 });
    if (!hasPermission(user, "payments.record")) return HttpResponse.json({ message: "You can't record payments." }, { status: 403 });
    const rules = systemSettings.payments;
    if (!rules.repaymentMethods.includes(body.method)) return HttpResponse.json({ message: `${body.method} isn't accepted for repayments.` }, { status: 422 });
    if (rules.referenceRequired && body.method !== "Cash" && !body.reference?.trim()) return HttpResponse.json({ message: "Enter the mobile money transaction ID." }, { status: 422 });
    if (!Number.isInteger(body.amount)) return HttpResponse.json({ message: "Enter a whole number of shillings." }, { status: 422 });
    // Never more than the client owes: no overpayments, so there's nothing to refund later
    const owedNow = owedNowOf(loan);
    if (body.amount > owedNow) return HttpResponse.json({ message: `That's more than ${loan.borrowerName} owes. The most you can record is UGX ${owedNow.toLocaleString("en-US")}.` }, { status: 422 });
    const todayIso = new Date().toLocaleDateString("en-CA");
    const paidOn = body.paidOn ?? todayIso;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(paidOn) || paidOn > todayIso || paidOn < paymentDate(todayIso, "daily", -rules.backdateDays))
      return HttpResponse.json({ message: rules.backdateDays ? `The payment date must be within the last ${rules.backdateDays} days.` : "Payments are recorded for today only." }, { status: 422 });

    const balanceBefore = loan.outstandingBalance;
    const task = openTaskForLoan(loan.id);
    if (task && "amountPaid" in task) {
      rememberForUndo(task, { loanId: loan.id, balance: balanceBefore });
      task.amountPaid += body.amount;
      const stillDue = task.amountDue - task.amountPaid;
      if (stillDue <= 0) {
        task.status = "done";
        task.result = describePayment(task.amountPaid, body.method, body.reference);
      } else {
        task.notes.push(`Part paid ${ugx(body.amount)} · ${body.method} · ${ugx(stillDue)} still due`);
      }
    }
    loan.outstandingBalance = Math.max(0, balanceBefore - body.amount);
    // A back-dated payment keeps the time it was recorded, on the day it was paid
    const paidAt = paidOn === todayIso ? new Date().toISOString() : new Date(`${paidOn}T${new Date().toTimeString().slice(0, 8)}`).toISOString();
    recordLoanPayment(loan.id, { amount: body.amount, method: body.method, reference: body.reference?.trim() || null, recordedBy: user.name }, paidAt);
    const payer = borrowerForLoan(loan.id);
    if (payer) recordBorrowerEvent(payer, "money", `Recorded ${ugx(body.amount)} on ${loan.id} · ${body.method}`, actorOf(user));

    const response: RecordPaymentResponse = {
      paymentId: nextPaymentId(),
      loanId: loan.id,
      balanceBefore,
      balanceAfter: loan.outstandingBalance,
      taskId: task?.id ?? null,
    };
    rememberResult(request, response);
    return HttpResponse.json(response, { status: 201 });
  }),

  http.post(`${API_BASE}/worklist/:taskId/call-outcome`, async ({ params, request }) => {
    await delay(200);
    const task = findTask(String(params.taskId));
    if (!task || !("loanId" in task) || !("amountDue" in task)) return HttpResponse.json({ message: "That task wasn't found." }, { status: 404 });
    const body = (await request.json()) as CallOutcome;
    rememberForUndo(task);
    const called = borrowerForLoan(task.loanId);
    const outcomeText = body.outcome === "promised" ? "promised to pay" : body.outcome === "no-answer" ? "no answer" : "field visit booked";
    if (called) recordBorrowerEvent(called, "contact", `Called about ${task.loanId}: ${outcomeText}`, actorOf(currentDemoUser()));

    if (body.outcome === "no-answer") task.notes.push(`No answer · ${clockTime()}`);
    if (body.outcome === "field-visit") {
      task.status = "done";
      task.result = "Field visit booked for tomorrow";
    }
    if (body.outcome === "promised") {
      const promisedDate = new Date(`${body.promisedDate}T00:00:00`);
      const promised = `${promisedDate.toLocaleDateString("en-GB", { weekday: "short" })} ${formatShortDate(body.promisedDate)}`;
      task.status = "done";
      task.result = `Promised ${ugx(task.amountDue - task.amountPaid)} by ${promised}`;
    }
    return HttpResponse.json(task);
  }),

  http.post(`${API_BASE}/worklist/:taskId/actions`, async ({ params, request }) => {
    await delay(200);
    const task = findTask(String(params.taskId));
    if (!task) return HttpResponse.json({ message: "That task wasn't found." }, { status: 404 });
    const { action } = (await request.json()) as { action: WorklistAction };
    // Payment reversals aren't in use
    if (action === "approve-reversal" || action === "reject-reversal") return HttpResponse.json({ message: "Payments can't be reversed." }, { status: 403 });
    rememberForUndo(task);

    if (action === "remind-finance") task.notes.push(`Finance reminded · ${clockTime()}`);
    else {
      task.status = "done";
      if (action === "send-reset-link") task.result = "Password reset link sent";
      if (action === "resend-invite") task.result = "Invite resent";
      // The person the request is about gets a fresh link
      const person = "user" in task ? staff.find((member) => member.name === task.user.name) : undefined;
      if (person) sendDemoEmail(createPasswordLink(person, action === "send-reset-link" ? "reset" : "invite", systemSettings.security.inviteValidHours));
    }
    return HttpResponse.json(task);
  }),

  http.post(`${API_BASE}/worklist/:taskId/undo`, async ({ params }) => {
    await delay(200);
    return undo(String(params.taskId))
      ? new HttpResponse(null, { status: 204 })
      : HttpResponse.json({ message: "This can no longer be undone." }, { status: 409 });
  }),

  http.get(`${API_BASE}/portfolio/risk`, async () => {
    await delay(150);
    const user = currentDemoUser();
    const filter = visibleTo(user);
    const { monthly, weekly } = par30History(filter);
    const body: PortfolioRisk = { scope: scopeOf(user), asOf: balancesAsOf(), ...riskNow(filter), targetPercent: systemSettings.loanRules.par30TargetPercent, monthly, weekly };
    return HttpResponse.json(body);
  }),

  http.get(`${API_BASE}/portfolio/arrears`, async () => {
    await delay(150);
    const user = currentDemoUser();
    return HttpResponse.json<ArrearsBreakdown>({ scope: scopeOf(user), ...arrears(visibleTo(user)) });
  }),

  http.get(`${API_BASE}/portfolio/early-warnings`, async ({ request }) => {
    await delay(150);
    const user = currentDemoUser();
    const visible = earlyWarnings(visibleTo(user)).map((warning) => ({ warning, loan: loans.find((l) => l.id === warning.loanId)! }));
    const userTasks = tasksFor(user.id);
    const body: EarlyWarningList = {
      total: visible.length,
      items: visible.slice(0, limitParam(request, 5)).map(({ warning, loan }) => {
        const task = userTasks.find((t) => "loanId" in t && "amountDue" in t && t.loanId === loan.id);
        return {
          loanId: loan.id,
          borrowerName: loan.borrowerName,
          daysPastDue: loan.daysPastDue,
          signal: warning.signal,
          officerName: officers.find((officer) => officer.id === loan.officerId)?.name ?? "",
          worklistTask: task ? { id: task.id, status: task.status, type: task.type } : null,
        };
      }),
    };
    return HttpResponse.json(body);
  }),

  http.get(`${API_BASE}/portfolio/summary`, async () => {
    await delay(120);
    const user = currentDemoUser();
    if (!hasPermission(user, "loans.view") || seesBranch(user)) return HttpResponse.json({ message: "No portfolio for this user." }, { status: 404 });
    return HttpResponse.json<PortfolioSummary>(officerSummary(user.id));
  }),

  http.get(`${API_BASE}/activity`, async ({ request }) => {
    await delay(150);
    if (!hasPermission(currentDemoUser(), "audit.view")) return HttpResponse.json({ message: "You can't view the audit log." }, { status: 403 });
    return HttpResponse.json<ActivityList>({ total: activityLog.length, items: activityLog.slice(0, Math.min(limitParam(request, 5), 5)) });
  }),

  http.get(`${API_BASE}/audit`, async ({ request }) => {
    await delay(200);
    const user = currentDemoUser();
    if (!hasPermission(user, "audit.view")) return forbidden("You can't view the audit log.");
    const params = new URL(request.url).searchParams;
    const matching = auditMatching(params);
    const pageSize = AUDIT_PAGE_SIZE;
    const pageCount = Math.max(1, Math.ceil(matching.length / pageSize));
    const page = Math.min(Math.max(1, Number(params.get("page")) || 1), pageCount);
    const people = [...new Map(activityLog.filter((item) => item.actor.id).map((item) => [item.actor.id!, item.actor.name])).entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
    return HttpResponse.json<AuditPage>({ items: matching.slice((page - 1) * pageSize, page * pageSize).map(auditEvent), total: matching.length, page, pageSize, people });
  }),

  http.get(`${API_BASE}/audit/export`, async ({ request }) => {
    await delay(400);
    const user = currentDemoUser();
    if (!hasPermission(user, "audit.export")) return forbidden("You can't export the audit log.");
    const matching = auditMatching(new URL(request.url).searchParams).map(auditEvent);
    // Quote every cell, and stop spreadsheet formulas (cells starting =, +, - or @)
    const cell = (value: string) => `"${(/^[=+\-@]/.test(value) ? `'${value}` : value).replace(/"/g, '""')}"`;
    const rows = [
      ["When", "Who", "Role", "Type", "What", "Loan or application", "Details"],
      ...matching.map((event) => [event.at, event.actor.name, event.actor.role, AUDIT_CATEGORY_NAMES[event.category], event.description, event.target?.label ?? "", (event.details ?? []).map((d) => `${d.label}: ${d.value}`).join("; ")]),
    ];
    audit(user, `exported the audit log (${matching.length} events)`);
    return new HttpResponse(rows.map((row) => row.map(cell).join(",")).join("\r\n"), {
      headers: { "Content-Type": "text/csv; charset=utf-8", "Cache-Control": "no-store", "Content-Disposition": `attachment; filename="audit-log.csv"` },
    });
  }),

  http.get(`${API_BASE}/team/performance`, async () => {
    await delay(150);
    if (!seesBranch(currentDemoUser())) return HttpResponse.json({ message: "You can't view team performance." }, { status: 403 });
    const body: OfficerPerformance[] = teamPerformance()
      .map((officer) => ({ ...officer, collectedToday: tasksFor(officer.officerId).reduce((sum, task) => sum + ("amountPaid" in task ? task.amountPaid : 0), 0) }))
      .sort((a, b) => b.par30Percent - a.par30Percent);
    return HttpResponse.json(body);
  }),

  http.post(`${API_BASE}/worklist/tasks`, async ({ request }) => {
    await delay(200);
    const user = currentDemoUser();
    const { loanId } = (await request.json()) as { loanId: string };
    const loan = loans.find((l) => l.id === loanId);
    if (!loan || !canSeeRecord(user, loan.officerId)) return HttpResponse.json({ message: "That loan wasn't found." }, { status: 404 });
    if (tasksFor(user.id).some((task) => "loanId" in task && "amountDue" in task && task.loanId === loanId))
      return HttpResponse.json({ message: "This loan is already on today's list." }, { status: 409 });
    const task = addFollowUpTask(user.id, loanId);
    return task ? HttpResponse.json(task, { status: 201 }) : HttpResponse.json({ message: "Only overdue loans can be added." }, { status: 422 });
  }),

  http.get(`${API_BASE}/borrowers`, async ({ request }) => {
    applyAutoRecovery();
    await delay(200);
    syncNewBorrowerApplications();
    const user = currentDemoUser();
    const params = new URL(request.url).searchParams;
    const query = (params.get("q") ?? "").trim().toLowerCase();
    const status = params.get("status") as BorrowerStatus | null;
    // Officers only ever see their own clients, whatever filter they send
    const officerId = seesBranch(user) ? params.get("officerId") : user.id;
    const sort = (params.get("sort") as BorrowerSort | null) ?? "name";
    const descending = params.get("order") === "desc";
    const pageSize = Math.min(100, Number(params.get("pageSize")) || 25);

    const digitsOnly = query.replace(/\D/g, "");
    const toItem = (borrower: (typeof borrowers)[number]): BorrowerListItem => {
      const loan = borrower.currentLoanId ? loans.find((l) => l.id === borrower.currentLoanId) : undefined;
      const app = borrower.applicationId ? applications.find((a) => a.id === borrower.applicationId) : undefined;
      return {
        id: borrower.id,
        name: borrower.name,
        phone: borrower.phone,
        area: borrower.area,
        status: borrowerStatus(borrower),
        currentLoan: loan ? { id: loan.id, balance: loan.outstandingBalance, daysPastDue: loan.daysPastDue } : null,
        application: app ? { id: app.id, status: app.status as BorrowerApplicationStatus } : null,
        officer: { id: borrower.officerId, name: officers.find((o) => o.id === borrower.officerId)?.name ?? "" },
      };
    };

    const matching = borrowers
      .filter((borrower) => canSeeRecord(user, borrower.officerId) && (!officerId || borrower.officerId === officerId))
      .filter((borrower) => {
        if (!query) return true;
        return (
          borrower.name.toLowerCase().includes(query) ||
          (digitsOnly.length >= 3 && borrower.phone.replace(/\D/g, "").includes(digitsOnly)) ||
          // A National ID only matches in full, so nobody can probe ID numbers with partial searches
          borrower.nin.toLowerCase() === query ||
          (!!borrower.currentLoanId && borrower.currentLoanId.toLowerCase() === query) ||
          (!!borrower.applicationId && borrower.applicationId.toLowerCase() === query)
        );
      })
      .map(toItem);

    const counts = { all: matching.length, active: 0, "in-arrears": 0, cleared: 0, applicant: 0 } as BorrowerList["counts"];
    matching.forEach((item) => counts[item.status]++);

    const filtered = status ? matching.filter((item) => item.status === status) : matching;
    filtered.sort((a, b) => {
      const order = sort === "balance" ? (a.currentLoan?.balance ?? -1) - (b.currentLoan?.balance ?? -1) : a.name.localeCompare(b.name);
      return descending ? -order : order;
    });
    const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
    const page = Math.min(Math.max(1, Number(params.get("page")) || 1), pageCount);

    return HttpResponse.json<BorrowerList>({
      items: filtered.slice((page - 1) * pageSize, page * pageSize),
      total: filtered.length,
      page,
      pageSize,
      counts,
    });
  }),

  http.get(`${API_BASE}/borrowers/:borrowerId`, async ({ params }) => {
    applyAutoRecovery();
    await delay(200);
    syncNewBorrowerApplications();
    const user = currentDemoUser();
    const borrower = borrowers.find((b) => b.id === params.borrowerId);
    // Out of scope looks the same as missing, so officers can't confirm who else is a client
    if (!borrower || !canSeeRecord(user, borrower.officerId)) return HttpResponse.json({ message: "That client wasn't found." }, { status: 404 });
    syncOnlineApplications(borrower);

    const details = borrowerDetails.get(borrower.id)!;
    const loan = borrower.currentLoanId ? loans.find((l) => l.id === borrower.currentLoanId) : undefined;
    const app = borrower.applicationId ? applications.find((a) => a.id === borrower.applicationId) : undefined;
    const terms = details.loanTerms;
    const paidOff = !!loan && loan.outstandingBalance <= 0;
    // What's overdue can't be more than what's left to pay; for a late loan that's what is due now
    const overdue = loan ? Math.min(loan.arrearsAmount ?? 0, loan.outstandingBalance) : 0;
    const instalment = loan && terms ? nextPayment(terms, loan.outstandingBalance) : null;

    return HttpResponse.json<BorrowerProfile>({
      id: borrower.id,
      name: borrower.name,
      status: borrowerStatus(borrower),
      phone: borrower.phone,
      secondaryPhone: details.secondaryPhone,
      area: borrower.area,
      premises: details.premises,
      occupation: details.occupation,
      nationalIdMasked: maskNationalId(borrower.nin),
      registeredOn: borrower.registeredOn,
      officer: { id: borrower.officerId, name: officers.find((o) => o.id === borrower.officerId)?.name ?? "" },
      nextOfKin: details.nextOfKin,
      gender: details.gender,
      currentLoan:
        loan && terms && !paidOff
          ? {
              id: loan.id,
              product: terms.product,
              principal: terms.principal,
              totalRepayable: terms.totalRepayable,
              balance: loan.outstandingBalance,
              repaymentSchedule: terms.repaymentSchedule,
              disbursedOn: terms.disbursedOn,
              nextPayment: instalment && loan.daysPastDue > 0 && overdue > 0 ? { ...instalment, amount: overdue } : instalment,
              daysPastDue: loan.daysPastDue,
              arrearsAmount: overdue,
              recovery: recoveryOf(loan),
            }
          : null,
      application: app ? { id: app.id, status: app.status as BorrowerApplicationStatus, amount: app.amount, missing: app.missing } : null,
      loansCleared: borrower.clearedLoans + (paidOff ? 1 : 0),
      pendingPhoneChange: pendingPhoneChanges.get(borrower.id) ?? null,
    });
  }),

  http.get(`${API_BASE}/borrowers/:borrowerId/loans`, async ({ params }) => {
    await delay(200);
    const user = currentDemoUser();
    const borrower = borrowers.find((b) => b.id === params.borrowerId);
    if (!borrower || !canSeeRecord(user, borrower.officerId)) return HttpResponse.json({ message: "That client wasn't found." }, { status: 404 });
    syncOnlineApplications(borrower);

    const items: BorrowerLoanRecord[] = pastLoans
      .filter((loan) => loan.borrowerId === borrower.id)
      .map((loan) => ({ ...loan, status: "cleared", daysPastDue: 0, applicationPdfAvailable: true }));
    const loan = borrower.currentLoanId ? loans.find((l) => l.id === borrower.currentLoanId) : undefined;
    const terms = borrowerDetails.get(borrower.id)?.loanTerms;
    if (loan && terms) {
      const paidOff = loan.outstandingBalance <= 0;
      items.push({
        id: loan.id,
        product: terms.product,
        principal: terms.principal,
        disbursedOn: terms.disbursedOn,
        clearedOn: paidOff ? new Date().toISOString().slice(0, 10) : null,
        status: paidOff ? "cleared" : loan.daysPastDue > 0 ? "in-arrears" : "active",
        daysPastDue: paidOff ? 0 : loan.daysPastDue,
        mostDaysLate: loan.daysPastDue,
        applicationPdfAvailable: true,
      });
    }
    items.sort((a, b) => b.disbursedOn.localeCompare(a.disbursedOn));

    const cleared = items.filter((item) => item.status === "cleared");
    return HttpResponse.json<BorrowerLoanHistory>({
      items,
      summary: {
        loansTaken: items.length,
        totalBorrowed: items.reduce((sum, item) => sum + item.principal, 0),
        cleared: cleared.length,
        clearedOnTime: cleared.filter((item) => item.mostDaysLate === 0).length,
      },
    });
  }),

  http.get(`${API_BASE}/borrowers/:borrowerId/documents`, async ({ params }) => {
    await delay(200);
    const borrower = borrowers.find((b) => b.id === params.borrowerId);
    if (!borrower || !canSeeRecord(currentDemoUser(), borrower.officerId)) return HttpResponse.json({ message: "That client wasn't found." }, { status: 404 });
    syncOnlineApplications(borrower);
    return HttpResponse.json<BorrowerDocuments>(borrowerDocumentsResponse(borrower));
  }),

  http.get(`${API_BASE}/documents/:documentId/file`, async ({ params, request }) => {
    await delay(250);
    const user = currentDemoUser();
    const document = findDocument(String(params.documentId));
    const borrower = document && borrowers.find((b) => b.id === document.borrowerId);
    if (!document || !borrower || !canSeeRecord(user, borrower.officerId)) return HttpResponse.json({ message: "That document wasn't found." }, { status: 404 });
    const wantsDownload = new URL(request.url).searchParams.get("disposition") === "attachment";
    if (!hasPermission(user, wantsDownload ? "documents.download" : "documents.view")) return forbidden(wantsDownload ? "You can't download documents." : "You can't view documents.");

    const slot = findSlot(borrower, document.slotKey);
    const file = await documentFile(document, borrower);

    // Viewing and downloading are both logged: these files hold National IDs
    const download = new URL(request.url).searchParams.get("disposition") === "attachment";
    const what = slot ? describeSlot(slot) : "a document";
    audit(user, `${download ? "downloaded" : "viewed"} ${what} of ${borrower.name}`);
    recordBorrowerEvent(borrower, "access", `${download ? "Downloaded" : "Viewed"} ${what}`, actorOf(user));

    return new HttpResponse(file, {
      headers: {
        "Content-Type": document.contentType,
        "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${document.fileName}"`,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }),

  http.post(`${API_BASE}/borrowers/:borrowerId/online-links`, async ({ params, request }) => {
    await delay(250);
    const user = currentDemoUser();
    const borrower = borrowers.find((b) => b.id === params.borrowerId);
    if (!borrower || !canSeeRecord(user, borrower.officerId)) return HttpResponse.json({ message: "That client wasn't found." }, { status: 404 });
    if (!hasPermission(user, "applications.onlineLink")) return HttpResponse.json({ message: "You can't send forms." }, { status: 403 });
    const { slot: slotKey } = (await request.json()) as { slot: string };
    const slot = findSlot(borrower, slotKey);
    if (!slot?.canCompleteOnline) return HttpResponse.json({ message: "This document can't be completed online." }, { status: 422 });
    if (borrowerDocumentsResponse(borrower).sections.flatMap((section) => section.slots).find((s) => s.key === slotKey)?.file)
      return HttpResponse.json({ message: "This form has already been completed." }, { status: 409 });

    // A new link replaces any earlier one for this form
    const link = createOnlineLink(borrower, slotKey, user.name);
    const what = describeSlot(slot);
    recordBorrowerEvent(borrower, "changes", `Created an online link for ${what}`, actorOf(user));
    audit(user, `created an online link for ${what} (${borrower.name})`);
    return HttpResponse.json<OnlineFormLink>({ url: `${location.origin}/forms/${link.token}`, expiresAt: link.expiresAt }, { status: 201 });
  }),

  http.post(`${API_BASE}/borrowers/:borrowerId/documents`, async ({ params, request }) => {
    await delay(400);
    const user = currentDemoUser();
    const borrower = borrowers.find((b) => b.id === params.borrowerId);
    if (!borrower || !canSeeRecord(user, borrower.officerId)) return HttpResponse.json({ message: "That client wasn't found." }, { status: 404 });
    if (!hasPermission(user, "documents.upload")) return HttpResponse.json({ message: "You can't upload documents." }, { status: 403 });

    const form = await request.formData();
    const slot = findSlot(borrower, String(form.get("slot") ?? ""));
    const file = form.get("file");
    if (!slot) return HttpResponse.json({ message: "That document type doesn't exist for this client." }, { status: 422 });
    if (!(file instanceof File) || file.size === 0) return HttpResponse.json({ message: "Choose a file to upload." }, { status: 422 });
    if (file.size > MAX_UPLOAD_BYTES) return HttpResponse.json({ message: "The file is larger than 5 MB." }, { status: 413 });
    const contentType = await sniffDocumentType(file);
    if (!contentType) return HttpResponse.json({ message: "Only JPEG, PNG or PDF files can be uploaded." }, { status: 415 });
    if (slot.forms && contentType !== "application/pdf") return HttpResponse.json({ message: "Upload the signed forms scanned into one PDF." }, { status: 415 });

    const replacing = !!borrowerDocumentsResponse(borrower).sections.flatMap((section) => section.slots).find((s) => s.key === slot.key)?.file;
    const extension = contentType === "application/pdf" ? "pdf" : contentType === "image/png" ? "png" : "jpg";
    const added = addDocumentVersion({
      slotKey: slot.key,
      borrowerId: borrower.id,
      // Stored under our own name, never the uploaded one
      fileName: `${slot.key.replace(/^[^:]+:/, "")}.${extension}`,
      contentType,
      sizeBytes: file.size,
      uploadedBy: user.name,
      uploadedAt: new Date().toISOString(),
      method: "scanned",
      file: new Blob([await file.arrayBuffer()], { type: contentType }),
    });
    const what = describeSlot(slot);
    audit(user, `${replacing ? "replaced" : "uploaded"} ${what} of ${borrower.name}`);
    recordBorrowerEvent(borrower, "changes", `${replacing ? "Replaced" : "Uploaded"} ${what}${slot.forms ? " (scanned paper)" : ""}`, actorOf(user));
    return HttpResponse.json<DocumentFile>(
      { id: added.id, fileName: added.fileName, contentType: added.contentType, sizeBytes: added.sizeBytes, uploadedBy: added.uploadedBy, uploadedAt: added.uploadedAt, version: added.version, method: added.method },
      { status: 201 },
    );
  }),

  http.get(`${API_BASE}/loans/:loanId/application-pdf`, async ({ params }) => {
    await delay(300);
    const user = currentDemoUser();
    const loanId = String(params.loanId);
    if (!hasPermission(user, "documents.download")) return forbidden("You can't download documents.");
    const borrower = borrowerForLoan(loanId);
    const version = borrower && applicationVersionFor(borrower, loanId);
    if (!borrower || !canSeeRecord(user, borrower.officerId) || !version) return HttpResponse.json({ message: "That loan application wasn't found." }, { status: 404 });

    // It includes National ID numbers, so every download is audit-logged
    recordBorrowerEvent(borrower, "access", `Downloaded the signed loan application for ${loanId}`, actorOf(user));
    audit(user, `downloaded the signed loan application for ${loanId} (${borrower.name})`);
    return new HttpResponse(await documentFile(version, borrower), {
      headers: { "Content-Type": "application/pdf", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "Content-Disposition": `attachment; filename="Loan application ${loanId}.pdf"` },
    });
  }),

  http.get(`${API_BASE}/borrowers/:borrowerId/activity`, async ({ params, request }) => {
    await delay(200);
    const borrower = borrowers.find((b) => b.id === params.borrowerId);
    if (!borrower || !canSeeRecord(currentDemoUser(), borrower.officerId)) return HttpResponse.json({ message: "That client wasn't found." }, { status: 404 });
    syncOnlineApplications(borrower);
    const search = new URL(request.url).searchParams;
    const category = search.get("category") as BorrowerActivityCategory | null;
    return HttpResponse.json<BorrowerActivityPage>(borrowerActivityPage(borrower, category, search.get("before"), 15));
  }),

  http.patch(`${API_BASE}/borrowers/:borrowerId`, async ({ params, request }) => {
    await delay(300);
    const user = currentDemoUser();
    const borrower = borrowers.find((b) => b.id === params.borrowerId);
    if (!borrower || !canSeeRecord(user, borrower.officerId)) return HttpResponse.json({ message: "That client wasn't found." }, { status: 404 });
    if (!hasPermission(user, "borrowers.edit")) return HttpResponse.json({ message: "You can't change client details." }, { status: 403 });

    const body = (await request.json()) as BorrowerDetailsUpdate;
    const phone = normalisePhone(body.phone ?? "");
    const secondaryPhone = body.secondaryPhone?.trim() ? normalisePhone(body.secondaryPhone) : null;
    const kinPhone = body.nextOfKin?.phone?.trim() ? normalisePhone(body.nextOfKin.phone) : null;
    if (!phone) return HttpResponse.json({ message: "The main phone must be a Ugandan mobile number, e.g. 0772 418 230." }, { status: 422 });
    if (body.secondaryPhone?.trim() && !secondaryPhone) return HttpResponse.json({ message: "The other phone must be a Ugandan mobile number." }, { status: 422 });
    if (!body.area?.trim() || !body.premises?.trim()) return HttpResponse.json({ message: "Enter the address and the shop or premises." }, { status: 422 });
    if (!["female", "male"].includes(body.gender)) return HttpResponse.json({ message: "Choose female or male." }, { status: 422 });
    // Next of kin is optional; a number, if given, must be a Ugandan mobile number
    if (body.nextOfKin?.phone?.trim() && !kinPhone) return HttpResponse.json({ message: "The next of kin's phone must be a Ugandan mobile number." }, { status: 422 });

    const details = borrowerDetails.get(borrower.id)!;
    const nextOfKin = { name: body.nextOfKin?.name?.trim() || null, relationship: body.nextOfKin?.relationship?.trim() || null, phone: kinPhone };
    const changed: string[] = [];
    if (secondaryPhone !== details.secondaryPhone) changed.push("other phone");
    if (body.area.trim() !== borrower.area) changed.push("address");
    if (body.gender !== details.gender) changed.push("gender");
    if (body.premises.trim() !== details.premises) changed.push("shop / premises");
    if ((body.occupation ?? "").trim() !== details.occupation) changed.push("occupation");
    if (JSON.stringify(nextOfKin) !== JSON.stringify(details.nextOfKin)) changed.push("next of kin");

    details.secondaryPhone = secondaryPhone;
    borrower.area = body.area.trim();
    details.premises = body.premises.trim();
    details.occupation = (body.occupation ?? "").trim().slice(0, 80);
    details.nextOfKin = nextOfKin;
    details.gender = body.gender;
    const currentLoan = borrower.currentLoanId ? loans.find((l) => l.id === borrower.currentLoanId) : undefined;
    if (currentLoan) currentLoan.area = borrower.area;
    if (changed.length) {
      recordBorrowerEvent(borrower, "changes", `Updated ${changed.join(", ")}`, actorOf(user));
      audit(user, `updated the ${changed.join(", ")} of ${borrower.name}`);
    }

    // The mobile money number only changes after a second person approves it (Settings → Loan rules)
    const pending = pendingPhoneChanges.get(borrower.id);
    if (phone !== borrower.phone && !systemSettings.loanRules.phoneChangeNeedsApproval) {
      const oldPhone = borrower.phone;
      borrower.phone = phone;
      const currentLoan = borrower.currentLoanId ? loans.find((l) => l.id === borrower.currentLoanId) : undefined;
      if (currentLoan) currentLoan.phone = phone;
      pendingPhoneChanges.delete(borrower.id);
      recordBorrowerEvent(borrower, "changes", `Changed the mobile money number to ${phone} (was ${oldPhone})`, actorOf(user));
      audit(user, `changed the mobile money number of ${borrower.name}`);
    } else if (phone !== borrower.phone && phone !== pending?.newPhone) {
      pendingPhoneChanges.set(borrower.id, { id: `PC-${nextPhoneChangeNumber++}`, newPhone: phone, requestedBy: { id: user.id, name: user.name }, requestedAt: new Date().toISOString() });
      recordBorrowerEvent(borrower, "changes", `Asked to change the mobile money number to ${phone} (needs a second person's approval)`, actorOf(user));
      audit(user, `asked to change the mobile money number of ${borrower.name}`);
    }
    return new HttpResponse(null, { status: 204 });
  }),

  http.post(`${API_BASE}/borrowers/:borrowerId/phone-change/:changeId`, async ({ params, request }) => {
    await delay(300);
    const user = currentDemoUser();
    const borrower = borrowers.find((b) => b.id === params.borrowerId);
    if (!borrower || !canSeeRecord(user, borrower.officerId)) return HttpResponse.json({ message: "That client wasn't found." }, { status: 404 });
    const change = pendingPhoneChanges.get(borrower.id);
    if (!change || change.id !== params.changeId) return HttpResponse.json({ message: "This change has already been dealt with." }, { status: 409 });
    const { decision } = (await request.json()) as { decision: "approve" | "reject" };
    const requester = change.requestedBy.id === user.id;

    if (decision === "approve") {
      if (!hasPermission(user, "borrowers.phoneApprove")) return HttpResponse.json({ message: "You don't have permission to approve this change." }, { status: 403 });
      if (requester) return HttpResponse.json({ message: "You asked for this change, so someone else must approve it." }, { status: 403 });
      const oldPhone = borrower.phone;
      borrower.phone = change.newPhone;
      const currentLoan = borrower.currentLoanId ? loans.find((l) => l.id === borrower.currentLoanId) : undefined;
      if (currentLoan) currentLoan.phone = change.newPhone;
      recordBorrowerEvent(borrower, "changes", `Approved the new mobile money number ${change.newPhone} (was ${oldPhone}), asked for by ${change.requestedBy.name}`, actorOf(user));
      audit(user, `approved the new mobile money number for ${borrower.name}`);
    } else {
      // Approvers can reject; the person who asked can withdraw it
      if (!requester && !hasPermission(user, "borrowers.phoneApprove")) return HttpResponse.json({ message: "You don't have permission to reject this change." }, { status: 403 });
      recordBorrowerEvent(borrower, "changes", requester ? `Withdrew the request to change the mobile money number to ${change.newPhone}` : `Rejected the new mobile money number ${change.newPhone}`, actorOf(user));
      audit(user, `${requester ? "withdrew" : "rejected"} a mobile money number change for ${borrower.name}`);
    }
    pendingPhoneChanges.delete(borrower.id);
    return new HttpResponse(null, { status: 204 });
  }),

  http.post(`${API_BASE}/borrowers/:borrowerId/national-id`, async ({ params }) => {
    await delay(250);
    const user = currentDemoUser();
    const borrower = borrowers.find((b) => b.id === params.borrowerId);
    if (!borrower || !canSeeRecord(user, borrower.officerId)) return HttpResponse.json({ message: "That client wasn't found." }, { status: 404 });
    if (!hasPermission(user, "borrowers.nationalId")) return forbidden("You can't see full National ID numbers.");
    // Every reveal goes in the audit log: who, whose ID, when
    recordBorrowerEvent(borrower, "access", "Viewed the National ID number", actorOf(user));
    activityLog.unshift({
      id: `act-${Date.now()}`,
      actor: { name: user.name, role: roles[user.roleId].name, photoUrl: user.photoUrl },
      description: `viewed the National ID of ${borrower.name} (${borrower.id})`,
      at: new Date().toISOString(),
    });
    return HttpResponse.json<NationalIdReveal>({ nationalId: borrower.nin, visibleForSeconds: systemSettings.security.nationalIdVisibleSeconds });
  }),

  // ---------- Reports ----------

  http.get(`${API_BASE}/reports/:name`, async ({ params, request }) => {
    await delay(300);
    const user = currentDemoUser();
    const result = buildReport(user, String(params.name), new URL(request.url).searchParams);
    if ("error" in result) return result.error;
    return HttpResponse.json<Report>(result.report);
  }),

  http.get(`${API_BASE}/reports/:name/export`, async ({ params, request }) => {
    await delay(400);
    const user = currentDemoUser();
    if (!hasPermission(user, "reports.export")) return forbidden("You can't export reports.");
    const result = buildReport(user, String(params.name), new URL(request.url).searchParams);
    if ("error" in result) return result.error;
    const { report } = result;
    const cell = (value: string | number | null) => {
      const text = value === null ? "" : String(value);
      return `"${(/^[=+\-@]/.test(text) ? `'${text}` : text).replace(/"/g, '""')}"`;
    };
    const pdf = new URL(request.url).searchParams.get("format") === "pdf";
    audit(user, `exported the ${report.name} report as ${pdf ? "PDF" : "CSV"} (${report.from} to ${report.to})`);
    if (pdf)
      return new HttpResponse(reportPdf(report, user), {
        headers: { "Content-Type": "application/pdf", "Cache-Control": "no-store", "Content-Disposition": `attachment; filename="${report.name}-report.pdf"` },
      });
    const rows = [report.table.columns.map((c) => c.label), ...[...report.table.rows, ...(report.table.total ? [report.table.total] : [])].map((row) => report.table.columns.map((c) => row[c.key] ?? null))];
    return new HttpResponse(rows.map((row) => row.map(cell).join(",")).join("\r\n"), {
      headers: { "Content-Type": "text/csv; charset=utf-8", "Cache-Control": "no-store", "Content-Disposition": `attachment; filename="${report.name}-report.csv"` },
    });
  }),

  // ---------- My account ----------

  http.get(`${API_BASE}/me/profile`, async () => {
    await delay(150);
    const user = currentDemoUser();
    const member = findStaff(user.id);
    const signIns = activityLog
      .filter((item) => item.actor.id === user.id && /^(signed in|failed sign-in)/.test(item.description))
      .slice(0, 4)
      .map((item, index) => ({ at: item.at, device: index % 3 === 2 ? "Android phone · Kampala" : "Chrome on Windows · Kampala", success: item.description === "signed in" }));
    return HttpResponse.json<MyProfile>({
      id: user.id,
      name: user.name,
      email: user.email,
      phone: member?.phone ?? "",
      photoUrl: user.photoUrl,
      branch: user.branch,
      role: { id: user.roleId, name: roles[user.roleId]?.name ?? "" },
      recentSignIns: signIns,
    });
  }),

  http.patch(`${API_BASE}/me/profile`, async ({ request }) => {
    await delay(300);
    const user = currentDemoUser();
    const member = findStaff(user.id);
    const { phone } = (await request.json()) as { phone: string };
    const normalised = normalisePhone(phone ?? "");
    if (!normalised) return invalid("Enter a Ugandan mobile number, e.g. 0772 123 456.");
    if (member && member.phone !== normalised) {
      audit(user, "changed their own phone number", [{ label: "Phone", value: `${member.phone} → ${normalised}` }]);
      member.phone = normalised;
    }
    return new HttpResponse(null, { status: 204 });
  }),

  http.post(`${API_BASE}/me/photo`, async ({ request }) => {
    await delay(400);
    const user = currentDemoUser();
    const photo = (await request.formData()).get("photo");
    if (!(photo instanceof File) || photo.size === 0) return invalid("Choose a photo.");
    if (photo.size > 2 * 1024 * 1024) return HttpResponse.json({ message: "The photo is larger than 2 MB." }, { status: 413 });
    const type = await sniffDocumentType(photo);
    if (type !== "image/jpeg" && type !== "image/png") return HttpResponse.json({ message: "Use a JPEG or PNG photo." }, { status: 415 });
    // The real backend stores it privately and serves a short-lived link; the demo keeps it in memory
    user.photoUrl = URL.createObjectURL(new Blob([await photo.arrayBuffer()], { type }));
    audit(user, "changed their profile photo");
    return new HttpResponse(null, { status: 204 });
  }),

  http.delete(`${API_BASE}/me/photo`, async () => {
    await delay(250);
    const user = currentDemoUser();
    user.photoUrl = null;
    audit(user, "removed their profile photo");
    return new HttpResponse(null, { status: 204 });
  }),

  http.post(`${API_BASE}/me/password`, async ({ request }) => {
    await delay(500);
    const user = currentDemoUser();
    const { currentPassword, newPassword } = (await request.json()) as ChangePasswordRequest;
    if (currentPassword !== (passwords.get(user.id) ?? DEMO_PASSWORD)) {
      audit(user, "failed sign-in (wrong password when changing it)");
      return HttpResponse.json({ message: "Your current password isn't right." }, { status: 403 });
    }
    const problem = passwordProblem(newPassword ?? "", user);
    if (problem) return invalid(problem);
    if (newPassword === currentPassword) return invalid("Choose a password you haven't used here.");
    passwords.set(user.id, newPassword);
    // A new password signs out every other device
    signedOutElsewhere.add(user.id);
    audit(user, "changed their password (other devices signed out)");
    return new HttpResponse(null, { status: 204 });
  }),

  http.get(`${API_BASE}/me/sessions`, async () => {
    await delay(150);
    const user = currentDemoUser();
    const hoursAgo = (hours: number) => new Date(Date.now() - hours * 3_600_000).toISOString();
    const devices: SignedInDevice[] = [{ id: "this", device: "This browser", location: "Kampala, Uganda", lastActiveAt: new Date().toISOString(), current: true }];
    if (!signedOutElsewhere.has(user.id))
      devices.push(
        { id: "s-phone", device: "Android phone · Chrome", location: "Kampala, Uganda", lastActiveAt: hoursAgo(3), current: false },
        { id: "s-office", device: "Office computer · Edge", location: "Ntinda, Kampala", lastActiveAt: hoursAgo(27), current: false },
      );
    return HttpResponse.json(devices);
  }),

  http.post(`${API_BASE}/me/sessions/sign-out-others`, async () => {
    await delay(300);
    const user = currentDemoUser();
    signedOutElsewhere.add(user.id);
    audit(user, "signed out their other devices");
    return new HttpResponse(null, { status: 204 });
  }),

  http.get(`${API_BASE}/support/contacts`, async () => {
    await delay(120);
    const admins = staff
      .filter((member) => member.status === "active" && roles[member.roleId]?.permissions.includes("users.manage"))
      .map((member) => ({ name: member.name, phone: member.phone, email: member.email }));
    const { name, phone, email } = systemSettings.business;
    return HttpResponse.json<SupportContacts>({
      admins,
      business: { name, phone, email },
      technical: { name: "KadoshDev (technical support)", phones: ["+256 782 835 907"], email: "daniel@kadoshdev.com" },
    });
  }),

  // ---------- Settings: system settings and loan products ----------

  http.get(`${API_BASE}/settings`, async () => {
    await delay(120);
    return HttpResponse.json<SystemSettings>(systemSettings);
  }),

  http.put(`${API_BASE}/settings/:section`, async ({ params, request }) => {
    await delay(300);
    const user = currentDemoUser();
    const section = String(params.section) as SettingsSection;
    const permission = SECTION_PERMISSIONS[section];
    if (!permission) return notFound("Those settings weren't found.");
    if (!hasPermission(user, permission)) return forbidden("You can't change these settings.");
    const body = (await request.json()) as SystemSettings[typeof section];
    const problem = settingsProblem(section, body);
    if (problem) return invalid(problem);
    if (section === "business") {
      // New markets get an id; a renamed market keeps its id, and the people in it follow the new name
      const current = systemSettings.business.branches;
      for (const market of (body as SystemSettings["business"]).branches) {
        market.name = market.name.trim();
        if (market.id === null) market.id = `mkt-${Math.random().toString(36).slice(2, 8)}`;
        const old = current.find((existing) => existing.id === market.id);
        if (old && old.name !== market.name) for (const member of staff) if (member.branch === old.name) member.branch = market.name;
      }
    }
    if (section === "notifications") {
      // An admin chooses the channels; the server owns each step's wording and who gets it
      const sent = (body as SystemSettings["notifications"]).rules;
      const current = systemSettings.notifications.rules;
      const channelsOf = (rule: { channels: string[] }) => (rule.channels.length ? [...rule.channels].sort().join(", ") : "in-app only");
      const changed = current.flatMap((rule) => {
        const channels = sent.find((item) => item.event === rule.event)!.channels;
        const next = { ...rule, channels: (["sms", "email"] as const).filter((channel) => channels.includes(channel)) };
        const differs = channelsOf(next) !== channelsOf(rule);
        const line = { label: rule.title, value: `${channelsOf(rule)} → ${channelsOf(next)}` };
        Object.assign(rule, next);
        return differs ? [line] : [];
      });
      if (changed.length === 0) return HttpResponse.json<SystemSettings>(systemSettings);
      systemSettings.changed.notifications = { at: new Date().toISOString(), by: user.name };
      audit(user, `changed notification settings: ${changed.map((line) => line.label).join(", ")}`, changed);
      return HttpResponse.json<SystemSettings>(systemSettings);
    }
    const before = systemSettings[section] as unknown as Record<string, unknown>;
    const changes = Object.keys(body).filter((key) => JSON.stringify(before[key]) !== JSON.stringify((body as unknown as Record<string, unknown>)[key]));
    if (changes.length === 0) return HttpResponse.json<SystemSettings>(systemSettings);
    Object.assign(systemSettings, { [section]: structuredClone(body) });
    systemSettings.changed[section] = { at: new Date().toISOString(), by: user.name };
    const show = (value: unknown) => (value === null ? "off" : Array.isArray(value) ? value.map((v) => (typeof v === "object" ? ("name" in (v as object) ? String((v as { name: string }).name) : Object.values(v as object).join(" ")) : v)).join(", ") || "none" : typeof value === "boolean" ? (value ? "on" : "off") : String(value));
    audit(
      user,
      `changed ${SECTION_NAMES[section]} settings: ${changes.join(", ")}`,
      changes.map((key) => ({ label: key, value: `${show(before[key])} → ${show((body as unknown as Record<string, unknown>)[key])}` })),
    );
    if (section === "loanRules") applyAutoRecovery();
    return HttpResponse.json<SystemSettings>(systemSettings);
  }),

  http.get(`${API_BASE}/loan-products`, async () => {
    await delay(120);
    return HttpResponse.json<LoanProduct[]>(loanProducts.map((product) => ({ ...product, inUse: productInUse(product.id) })));
  }),

  http.post(`${API_BASE}/loan-products`, async ({ request }) => {
    await delay(300);
    const user = currentDemoUser();
    if (!hasPermission(user, "settings.products")) return forbidden("You can't manage loan products.");
    const body = (await request.json()) as SaveLoanProductRequest;
    const problem = productProblem(body, null);
    if (problem) return invalid(problem);
    const product: LoanProduct = { ...structuredClone(body), name: body.name.trim(), description: body.description.trim(), id: `prod-${Date.now().toString(36)}`, status: "active", inUse: 0, updatedAt: new Date().toISOString(), updatedBy: user.name };
    loanProducts.push(product);
    audit(user, `created the loan product ${product.name}`);
    return HttpResponse.json(product, { status: 201 });
  }),

  http.put(`${API_BASE}/loan-products/:productId`, async ({ params, request }) => {
    await delay(300);
    const user = currentDemoUser();
    if (!hasPermission(user, "settings.products")) return forbidden("You can't manage loan products.");
    const product = findProduct(String(params.productId));
    if (!product) return notFound("That loan product wasn't found.");
    const body = (await request.json()) as SaveLoanProductRequest;
    const problem = productProblem(body, product.id);
    if (problem) return invalid(problem);
    if (body.repaymentSchedule !== product.repaymentSchedule && productInUse(product.id) > 0)
      return conflict("Loans and applications use this product, so how often it's repaid can't change. Create a new product instead.");
    // Existing loans keep the terms they were given; only new applications use the change
    Object.assign(product, structuredClone(body), { name: body.name.trim(), description: body.description.trim(), updatedAt: new Date().toISOString(), updatedBy: user.name });
    audit(user, `changed the loan product ${product.name}`);
    return HttpResponse.json({ ...product, inUse: productInUse(product.id) });
  }),

  http.post(`${API_BASE}/loan-products/:productId/:action`, async ({ params }) => {
    await delay(250);
    const user = currentDemoUser();
    if (!hasPermission(user, "settings.products")) return forbidden("You can't manage loan products.");
    const product = findProduct(String(params.productId));
    const action = String(params.action);
    if (!product || !["archive", "restore"].includes(action)) return notFound("That loan product wasn't found.");
    if (action === "archive" && loanProducts.filter((p) => p.status === "active").length === 1) return conflict("This is the only product on offer. Add another before taking this one off.");
    product.status = action === "archive" ? "archived" : "active";
    product.updatedAt = new Date().toISOString();
    product.updatedBy = user.name;
    audit(user, `${action === "archive" ? "stopped offering" : "started offering again"} the loan product ${product.name}`);
    return HttpResponse.json({ ...product, inUse: productInUse(product.id) });
  }),

  // ---------- Settings: staff and roles ----------

  http.get(`${API_BASE}/staff`, async () => {
    await delay(150);
    if (!hasPermission(currentDemoUser(), "users.manage")) return forbidden("You can't manage staff.");
    const order = { active: 0, invited: 1, deactivated: 2 };
    return HttpResponse.json<StaffMember[]>([...staff].sort((a, b) => order[a.status] - order[b.status] || a.name.localeCompare(b.name)).map(staffMember));
  }),

  http.get(`${API_BASE}/roles`, async () => {
    await delay(120);
    const user = currentDemoUser();
    if (!hasPermission(user, "users.manage") && !hasPermission(user, "roles.manage")) return forbidden("You can't see roles.");
    const all = Object.values(roles);
    return HttpResponse.json<RoleSummary[]>(
      [...all.filter((role) => role.builtIn), ...all.filter((role) => !role.builtIn).sort((a, b) => a.name.localeCompare(b.name))].map((role) => ({
        ...role,
        userCount: staff.filter((member) => member.roleId === role.id && member.status !== "deactivated").length,
      })),
    );
  }),

  http.post(`${API_BASE}/staff/invites`, async ({ request }) => {
    await delay(300);
    const user = currentDemoUser();
    if (!hasPermission(user, "users.manage")) return forbidden("You can't invite staff.");
    const body = (await request.json()) as InviteStaffRequest;
    const name = body.name.trim().replace(/\s+/g, " ");
    const email = body.email.trim().toLowerCase();
    const phone = normalisePhone(body.phone);
    if (name.length < 3) return invalid("Enter their full name.");
    if (!EMAIL_PATTERN.test(email)) return invalid("Enter a valid email address.");
    if (!phone) return invalid("Enter a Ugandan mobile number, e.g. 0772 123 456.");
    if (!roles[body.roleId]) return invalid("Choose a role.");
    const market = systemSettings.business.branches.find((candidate) => candidate.id === body.branchId);
    if (!market) return invalid("Choose a market.");
    const taken = staff.find((member) => member.email.toLowerCase() === email);
    if (taken) return HttpResponse.json({ message: `${taken.name} already uses this email${taken.status === "deactivated" ? " (switched off). Turn their account back on instead" : ""}.` }, { status: 409 });
    const member: MockStaff = {
      id: nextStaffId(),
      name,
      email,
      phone,
      photoUrl: null,
      branch: market.name,
      roleId: body.roleId,
      status: "invited",
      lastSignInAt: null,
      invite: newInvite(),
      deactivated: null,
    };
    staff.push(member);
    sendDemoEmail(createPasswordLink(member, "invite", systemSettings.security.inviteValidHours));
    audit(user, `invited ${name} as ${roles[body.roleId].name} (${market.name})`);
    return HttpResponse.json(staffMember(member), { status: 201 });
  }),

  http.post(`${API_BASE}/staff/:staffId/invite`, async ({ params }) => {
    await delay(250);
    const user = currentDemoUser();
    if (!hasPermission(user, "users.manage")) return forbidden("You can't invite staff.");
    const member = findStaff(String(params.staffId));
    if (!member || member.status !== "invited") return notFound("That invite wasn't found.");
    // A new link; the old one stops working
    member.invite = newInvite();
    sendDemoEmail(createPasswordLink(member, "invite", systemSettings.security.inviteValidHours));
    audit(user, `sent a new invite to ${member.name}`);
    return HttpResponse.json(staffMember(member));
  }),

  http.delete(`${API_BASE}/staff/:staffId/invite`, async ({ params }) => {
    await delay(250);
    const user = currentDemoUser();
    if (!hasPermission(user, "users.manage")) return forbidden("You can't manage staff.");
    const member = findStaff(String(params.staffId));
    if (!member || member.status !== "invited") return notFound("That invite wasn't found.");
    // They never had an account, so nothing else refers to them; the audit log keeps the record
    staff.splice(staff.indexOf(member), 1);
    revokePasswordLinks(member.id);
    audit(user, `cancelled the invite for ${member.name} (${member.email})`);
    return new HttpResponse(null, { status: 204 });
  }),

  http.put(`${API_BASE}/staff/:staffId/role`, async ({ params, request }) => {
    await delay(250);
    const user = currentDemoUser();
    if (!hasPermission(user, "users.manage")) return forbidden("You can't change roles.");
    const member = findStaff(String(params.staffId));
    if (!member || member.status === "deactivated") return notFound("That person wasn't found.");
    if (member.id === user.id) return forbidden("You can't change your own role. Ask another admin.");
    const { roleId } = (await request.json()) as { roleId: string };
    const role = roles[roleId];
    if (!role) return invalid("Choose a role.");
    if (member.roleId === roleId) return HttpResponse.json(staffMember(member));
    const lockout = lockoutProblem({ member, roleId });
    if (lockout) return conflict(lockout);
    if (member.status === "active" && portfolioOf(member.id).borrowers > 0 && !role.permissions.includes("loans.view"))
      return conflict(`${member.name} looks after clients, and ${role.name} can't see loans. Move their clients to another officer first.`);
    const before = roles[member.roleId]?.name ?? "no role";
    member.roleId = roleId;
    audit(user, `changed ${member.name}'s role from ${before} to ${role.name}`, [{ label: "Role", value: `${before} → ${role.name}` }]);
    return HttpResponse.json(staffMember(member));
  }),

  http.put(`${API_BASE}/staff/:staffId/branch`, async ({ params, request }) => {
    await delay(250);
    const user = currentDemoUser();
    if (!hasPermission(user, "users.manage")) return forbidden("You can't change staff details.");
    const member = findStaff(String(params.staffId));
    if (!member || member.status === "deactivated") return notFound("That person wasn't found.");
    const { branchId } = (await request.json()) as { branchId: string };
    const target = systemSettings.business.branches.find((market) => market.id === branchId);
    if (!target) return invalid("Choose a market.");
    const branch = target.name;
    if (member.branch === branch) return HttpResponse.json(staffMember(member));
    const before = member.branch;
    member.branch = branch;
    audit(user, `moved ${member.name} to the ${branch} market (was ${before})`, [{ label: "Market", value: `${before} → ${branch}` }]);
    return HttpResponse.json(staffMember(member));
  }),

  http.post(`${API_BASE}/staff/:staffId/deactivate`, async ({ params, request }) => {
    await delay(350);
    const user = currentDemoUser();
    if (!hasPermission(user, "users.manage")) return forbidden("You can't switch off accounts.");
    const member = findStaff(String(params.staffId));
    if (!member || member.status !== "active") return notFound("That person wasn't found.");
    if (member.id === user.id) return forbidden("You can't switch off your own account. Ask another admin.");
    const body = (await request.json()) as DeactivateStaffRequest;
    if (!body.reason?.trim()) return invalid("Say why the account is being switched off.");
    const lockout = lockoutProblem({ member, roleId: null });
    if (lockout) return conflict(lockout);
    const portfolio = portfolioOf(member.id);
    let movedTo: MockStaff | undefined;
    if (portfolio.borrowers > 0) {
      movedTo = body.reassignTo ? findStaff(body.reassignTo) : undefined;
      if (!movedTo || movedTo.id === member.id || !canTakeBorrowers(movedTo)) return invalid(`Choose who looks after ${member.name}'s ${portfolio.borrowers} clients.`);
      for (const borrower of borrowers) if (borrower.officerId === member.id) borrower.officerId = movedTo.id;
      for (const loan of loans) if (loan.officerId === member.id) loan.officerId = movedTo.id;
      for (const app of applications) if (app.officerId === member.id) app.officerId = movedTo.id;
    }
    member.status = "deactivated";
    member.deactivated = { at: new Date().toISOString(), by: user.name };
    // The real backend also ends all their sessions here
    audit(user, `switched off ${member.name}'s account (${body.reason.trim()})${movedTo ? `; ${portfolio.borrowers} borrowers moved to ${movedTo.name}` : ""}`);
    return HttpResponse.json(staffMember(member));
  }),

  http.post(`${API_BASE}/staff/:staffId/reactivate`, async ({ params }) => {
    await delay(300);
    const user = currentDemoUser();
    if (!hasPermission(user, "users.manage")) return forbidden("You can't manage staff.");
    const member = findStaff(String(params.staffId));
    if (!member || member.status !== "deactivated") return notFound("That person wasn't found.");
    if (!roles[member.roleId]) return conflict("Their old role no longer exists. Invite them again with a new role.");
    // Back as an invite: they set a new password from a fresh link, so an old password never works again
    member.status = "invited";
    member.deactivated = null;
    member.invite = newInvite();
    sendDemoEmail(createPasswordLink(member, "invite", systemSettings.security.inviteValidHours));
    audit(user, `turned ${member.name}'s account back on and sent them an invite`);
    return HttpResponse.json(staffMember(member));
  }),

  http.post(`${API_BASE}/roles`, async ({ request }) => {
    await delay(300);
    const user = currentDemoUser();
    if (!hasPermission(user, "roles.manage")) return forbidden("You can't manage roles.");
    const body = (await request.json()) as SaveRoleRequest;
    const problem = roleProblem(body, null);
    if (problem) return invalid(problem);
    const id = `role-${Date.now().toString(36)}`;
    roles[id] = { id, name: body.name.trim(), description: body.description.trim(), builtIn: false, dataScope: body.dataScope === "own" ? "own" : "branch", permissions: cleanPermissions(body.permissions) };
    if (roles[id].dataScope === "own" && roles[id].permissions.some((p) => p.startsWith("users.") || p.startsWith("roles.") || p.startsWith("settings."))) {
      delete roles[id];
      return invalid("Roles that manage staff, roles or settings must see the whole market.");
    }
    audit(user, `created the role ${roles[id].name}`);
    return HttpResponse.json({ ...roles[id], userCount: 0 }, { status: 201 });
  }),

  http.put(`${API_BASE}/roles/:roleId`, async ({ params, request }) => {
    await delay(300);
    const user = currentDemoUser();
    if (!hasPermission(user, "roles.manage")) return forbidden("You can't manage roles.");
    const role = roles[String(params.roleId)];
    if (!role) return notFound("That role wasn't found.");
    if (role.builtIn) return forbidden("Built-in roles can't be changed. Create a custom role instead.");
    const body = (await request.json()) as SaveRoleRequest;
    const problem = roleProblem(body, role.id);
    if (problem) return invalid(problem);
    const permissions = cleanPermissions(body.permissions);
    if (user.roleId === role.id && (!permissions.includes("roles.manage") || (role.permissions.includes("users.manage") && !permissions.includes("users.manage"))))
      return conflict("This is your own role: removing that would lock you out. Ask another admin to change it.");
    const lockout = lockoutProblem({ role, permissions });
    if (lockout) return conflict(lockout);
    const added = permissions.filter((p) => !role.permissions.includes(p));
    const removed = role.permissions.filter((p) => !permissions.includes(p));
    const dataScope = body.dataScope === "own" ? "own" : "branch";
    if (dataScope === "own" && permissions.some((p) => p.startsWith("users.") || p.startsWith("roles.") || p.startsWith("settings."))) return invalid("Roles that manage staff, roles or settings must see the whole market.");
    Object.assign(role, { name: body.name.trim(), description: body.description.trim(), dataScope, permissions });
    audit(user, `changed the role ${role.name}${added.length ? `; added ${added.join(", ")}` : ""}${removed.length ? `; removed ${removed.join(", ")}` : ""}`);
    return HttpResponse.json({ ...role, userCount: staff.filter((member) => member.roleId === role.id && member.status !== "deactivated").length });
  }),

  http.delete(`${API_BASE}/roles/:roleId`, async ({ params }) => {
    await delay(250);
    const user = currentDemoUser();
    if (!hasPermission(user, "roles.manage")) return forbidden("You can't manage roles.");
    const role = roles[String(params.roleId)];
    if (!role) return notFound("That role wasn't found.");
    if (role.builtIn) return forbidden("Built-in roles can't be deleted.");
    const holders = staff.filter((member) => member.roleId === role.id);
    if (holders.length) return conflict(`${holders.length === 1 ? `${holders[0].name} has` : `${holders.length} people have`} this role${holders.some((m) => m.status === "deactivated") ? " (including switched-off accounts, whose history shows it)" : ""}. Give them another role first.`);
    delete roles[role.id];
    audit(user, `deleted the role ${role.name}`);
    return new HttpResponse(null, { status: 204 });
  }),

  http.get(`${API_BASE}/officers`, async () => {
    await delay(100);
    if (!seesBranch(currentDemoUser())) return HttpResponse.json({ message: "You can't list officers." }, { status: 403 });
    return HttpResponse.json<OfficerOption[]>(officers.map((officer) => ({ id: officer.id, name: officer.name })));
  }),

  http.get(`${API_BASE}/portfolio/risk-summary`, async () => {
    await delay(120);
    const user = currentDemoUser();
    const scope = seesBranch(user) ? "branch" : "own";
    const risk = riskNow(visibleTo(user));
    return HttpResponse.json<RiskSummary>({ scope, par30Percent: risk.par30Percent, loansOver30Days: risk.loansOver30Days, targetPercent: systemSettings.loanRules.par30TargetPercent });
  }),
];
