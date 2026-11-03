// Sample documents for the borrower profile, following Tamu's real forms (loan-docs/). The officer
// enters the borrower's and guarantors' details as data; the proof is one signed loan application
// per loan: the payment agreement and both guarantor consents merged into one PDF, either signed on
// paper and scanned, or completed online through a link. Plus the borrower's ID copy and an
// optional workplace photo. Built per borrower on first use (fixed seed per borrower) and kept
// in memory, so uploads, replacements and online links show up until the page is reloaded.
import type { BorrowerDocuments, DocumentFile, DocumentSlot, Guarantor, LoanPricing, RepaymentSchedule } from "../api/types";
import type { MockBorrower } from "./borrowerDirectory";
import { borrowerDetails, maskNationalId } from "./borrowerProfiles";
import { formatDate } from "../lib/format";
import { describeInterest, LEGACY_PRICING, paymentDate, summariseTerms } from "../lib/repaymentSchedule";
import { findProduct, pricingOf, systemSettings } from "./systemSettings";
import { applications, loans, officers, type MockApplication } from "./fixtures";
import { pastLoans } from "./loanHistory";
import { addOnlineApplication, hasOnlineApplicationFor, openOnlineApplicationFor, revokeOnlineApplications, submittedOnlineApplicationsFor, type MockOnlineApplication, type OnlineSubmission, type StoredImage } from "./onlineApplications";
import { loanApplicationPdf, nationalIdBack, nationalIdFront, workplacePhoto } from "./sampleDocumentFiles";

export interface MockDocumentVersion extends DocumentFile {
  slotKey: string;
  borrowerId: string;
  /** Uploaded file; sample files are drawn when first opened */
  file?: Blob;
  /** For a loan application completed online: what was filled in and signed */
  submission?: OnlineSubmission;
}

/** What a loan's forms say: the loan they belong to and both guarantors. */
export interface MockLoanForms {
  reference: string;
  amount: number;
  /** ISO date */
  dateBorrowed: string;
  schedule: RepaymentSchedule;
  guarantors: (Guarantor & { nin: string })[];
  /** Set on new applications, where the officer chose the dates */
  firstPaymentOn?: string;
  lastPaymentOn?: string;
  numberOfPayments?: number;
  /** From the loan product (older forms: 18% of the amount) */
  pricing?: LoanPricing;
}

interface MockSlot {
  key: string;
  label: string;
  required: boolean;
  canCompleteOnline: boolean;
  forms?: MockLoanForms;
}

interface MockSection {
  id: string;
  title: string;
  subtitle: string;
  forms?: MockLoanForms;
  slots: MockSlot[];
}

const FIRST_NAMES = ["Grace", "John", "Mary", "Joseph", "Sarah", "David", "Ruth", "Robert", "Jane", "Samuel", "Prossy", "Hassan", "Gloria", "Kenneth"];
const LAST_NAMES = ["Kato", "Okello", "Nakato", "Mugisha", "Auma", "Ssali", "Namusoke", "Tumwine", "Achieng", "Lwanga", "Nankya", "Opolot"];
const PHONE_PREFIXES = ["0772", "0701", "0756", "0782", "0774", "0703"];
const RELATIONSHIPS = ["Sister", "Brother", "Friend", "Workmate", "Neighbour", "Cousin", "Landlord", "Spouse"];
const DAY_MS = 86_400_000;

/** Same small generator as the other sample data, seeded per borrower */
function seededRandom(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const seedFrom = (text: string) => [...text].reduce((hash, char) => (Math.imul(hash, 31) + char.charCodeAt(0)) | 0, 17);

const sections = new Map<string, MockSection[]>();
const versions: MockDocumentVersion[] = [];
let nextDocumentNumber = 1;

export function addDocumentVersion(version: Omit<MockDocumentVersion, "id" | "version">) {
  const previous = versions.filter((v) => v.borrowerId === version.borrowerId && v.slotKey === version.slotKey);
  const added: MockDocumentVersion = { ...version, id: `DOC-${String(nextDocumentNumber++).padStart(5, "0")}`, version: previous.length + 1 };
  versions.push(added);
  // A paper upload replaces any online link still open for the document
  if (version.method === "scanned") revokeOnlineApplications(version.borrowerId, version.slotKey);
  return added;
}

const currentVersion = (borrowerId: string, slotKey: string) => versions.filter((v) => v.borrowerId === borrowerId && v.slotKey === slotKey).at(-1) ?? null;

export const findDocument = (documentId: string) => versions.find((v) => v.id === documentId);

/** Builds the borrower's sections and sample files the first time they're asked for. */
export function documentSectionsFor(borrower: MockBorrower): MockSection[] {
  const existing = sections.get(borrower.id);
  if (existing) return existing;

  const random = seededRandom(seedFrom(borrower.id));
  const pick = <T,>(items: readonly T[]) => items[Math.floor(random() * items.length)];
  const digits = (count: number) => Array.from({ length: count }, () => Math.floor(random() * 10)).join("");
  const letter = () => String.fromCharCode(65 + Math.floor(random() * 26));
  const officerName = officers.find((o) => o.id === borrower.officerId)?.name ?? "Loan officer";
  const atTime = (isoDate: string, hour: number) => new Date(new Date(`${isoDate}T00:00:00`).getTime() + hour * 3_600_000).toISOString();
  const sizeBytes = () => Math.round(180_000 + random() * 900_000);
  const sample = (slotKey: string, fileName: string, contentType: DocumentFile["contentType"], on: string, method: DocumentFile["method"], by = officerName) =>
    addDocumentVersion({ slotKey, borrowerId: borrower.id, fileName, contentType, sizeBytes: sizeBytes(), uploadedBy: by, uploadedAt: atTime(on, 9 + random() * 8), method });
  const guarantor = (): Guarantor & { nin: string } => {
    const nin = `C${random() < 0.5 ? "M" : "F"}${digits(10)}${letter()}${letter()}`;
    return { name: `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`, phone: `${pick(PHONE_PREFIXES)} ${digits(3)} ${digits(3)}`, nin, nationalIdMasked: maskNationalId(nin), relationship: pick(RELATIONSHIPS) };
  };

  const details = borrowerDetails.get(borrower.id);
  const application = borrower.applicationId ? applications.find((a) => a.id === borrower.applicationId) : undefined;
  const result: MockSection[] = [
    {
      id: "identity",
      title: "Identity",
      subtitle: "Photos of the borrower's National ID, from online applications. On paper applications the ID copy is in the signed PDF.",
      slots: [
        { key: "national-id-front", label: "National ID · front", required: false, canCompleteOnline: false },
        { key: "national-id-back", label: "National ID · back", required: false, canCompleteOnline: false },
      ],
    },
  ];
  // Sample files only for the seeded borrowers; people registered in the demo have only what was uploaded
  if (!borrower.addedInSession) {
    // ID photos only come from the online form; on paper the ID copy is in the signed PDF
    if (application?.route === "online" && application.missing !== "National ID copy missing") {
      sample("national-id-front", "national-id-front.jpg", "image/jpeg", borrower.registeredOn, "scanned");
      sample("national-id-back", "national-id-back.jpg", "image/jpeg", borrower.registeredOn, "scanned");
    }
    random(); // (was the workplace photo; kept so the rest of the sample data stays the same)
  }

  // Each loan or application: the guarantors (entered by the officer) and the signed loan application as proof
  const loanSection = (reference: string, title: string, subtitle: string, forms: Omit<MockLoanForms, "guarantors">, signedOn: string, waitingOnline: boolean, noSignedYet = false, noGuarantors = false, entered?: MockApplication["guarantors"]) => {
    const pair = [guarantor(), guarantor()]; // always drawn, so the rest of the sample data stays the same
    // The guarantors the officer entered on the application, when there is one
    const named = entered?.map((g) => ({ name: g.fullName, phone: g.phone, nin: g.nationalId, nationalIdMasked: maskNationalId(g.nationalId), relationship: g.relationship ?? null }));
    const loanForms: MockLoanForms = { ...forms, guarantors: noGuarantors ? [] : (named ?? pair) };
    const slot: MockSlot = { key: `${reference}:application`, label: "Signed loan application", required: true, canCompleteOnline: true, forms: loanForms };
    if (waitingOnline) {
      // Sent as an online link yesterday; not completed yet (unless that already happened in this demo)
      if (!hasOnlineApplicationFor(borrower.id, slot.key)) {
        const created = Date.now() - DAY_MS;
        addOnlineApplication(newOnlineApplication(borrower.id, borrower.officerId, slot.key, loanForms, officerName, created));
      }
    } else if (!noSignedYet) {
      // Paper (signed, scanned and merged) for most; some borrowers completed it online
      const online = random() < 0.3;
      sample(slot.key, "loan-application.pdf", "application/pdf", signedOn, online ? "online" : "scanned", online ? borrower.name : officerName);
    }
    result.push({ id: reference, title, subtitle, forms: loanForms, slots: [slot] });
  };

  if (application?.route) {
    result.push(applicationSection(application));
  } else if (application) {
    const subtitle = { submitted: "Waiting for approval", approved: "Approved · waiting to be paid out", draft: application.returned ? `Sent back: ${application.returned.reason}` : "Draft", rejected: "Rejected" }[application.status];
    const terms = application.terms;
    loanSection(application.id, `${application.id} · application`, subtitle,
      {
        reference: application.id,
        amount: application.amount,
        dateBorrowed: (application.createdAt ?? new Date().toISOString()).slice(0, 10),
        schedule: terms?.repaymentSchedule ?? "weekly",
        ...(terms ? { firstPaymentOn: terms.firstPaymentOn, lastPaymentOn: summariseTerms(terms).lastPaymentOn, numberOfPayments: terms.numberOfPayments, pricing: terms.pricing } : {}),
      },
      borrower.registeredOn, application.missing === "Guarantor consent missing", ["Signed application PDF missing", "Guarantor details missing"].includes(application.missing ?? "") || !!application.returned,
      application.missing === "Guarantor details missing", application.guarantors);
  }
  const currentLoan = borrower.currentLoanId ? loans.find((l) => l.id === borrower.currentLoanId) : undefined;
  const terms = details?.loanTerms;
  if (currentLoan && terms) {
    const signedOn = new Date(Math.max(new Date(borrower.registeredOn).getTime(), new Date(terms.disbursedOn).getTime() - 2 * DAY_MS)).toISOString().slice(0, 10);
    const product = findProduct(terms.productId);
    loanSection(currentLoan.id, `${currentLoan.id} · ${terms.product}`, currentLoan.outstandingBalance > 0 ? "Current loan" : "Cleared",
      {
        reference: currentLoan.id,
        amount: terms.principal,
        dateBorrowed: terms.disbursedOn,
        schedule: terms.repaymentSchedule,
        ...(terms.schedule ? { firstPaymentOn: terms.schedule.firstPaymentOn, lastPaymentOn: paymentDate(terms.schedule.firstPaymentOn, terms.repaymentSchedule, terms.schedule.numberOfPayments - 1), numberOfPayments: terms.schedule.numberOfPayments } : {}),
        ...(product ? { pricing: pricingOf(product) } : {}),
      }, signedOn, false);
  }
  for (const past of pastLoans.filter((l) => l.borrowerId === borrower.id).reverse()) {
    const pastProduct = findProduct(past.productId);
    loanSection(past.id, `${past.id} · ${past.product}`, `Cleared ${formatDate(past.clearedOn)}`,
      {
        reference: past.id,
        amount: past.principal,
        dateBorrowed: past.disbursedOn,
        schedule: past.repaymentSchedule,
        firstPaymentOn: past.schedule.firstPaymentOn,
        lastPaymentOn: paymentDate(past.schedule.firstPaymentOn, past.repaymentSchedule, past.schedule.numberOfPayments - 1),
        numberOfPayments: past.schedule.numberOfPayments,
        ...(pastProduct ? { pricing: pricingOf(pastProduct) } : {}),
      }, past.disbursedOn, false);
  }

  sections.set(borrower.id, result);
  return result;
}

const publicGuarantor = (g: Guarantor & { nin: string }): Guarantor => ({ name: g.name, phone: g.phone, nationalIdMasked: g.nationalIdMasked, relationship: g.relationship });

/** The borrower's documents as the API returns them (no full NINs, no file contents, no link tokens). */
export function borrowerDocumentsResponse(borrower: MockBorrower): BorrowerDocuments {
  return {
    sections: documentSectionsFor(borrower).map((section) => ({
      id: section.id,
      title: section.title,
      subtitle: section.subtitle,
      ...(section.forms ? { guarantors: section.forms.guarantors.map(publicGuarantor) } : {}),
      slots: section.slots.map((slot): DocumentSlot => {
        const version = currentVersion(borrower.id, slot.key);
        const file: DocumentFile | null = version
          ? { id: version.id, fileName: version.fileName, contentType: version.contentType, sizeBytes: version.sizeBytes, uploadedBy: version.uploadedBy, uploadedAt: version.uploadedAt, version: version.version, method: version.method }
          : null;
        const live = openOnlineApplicationFor(borrower.id, slot.key);
        return {
          key: slot.key,
          label: slot.label,
          required: slot.required,
          file,
          canCompleteOnline: slot.canCompleteOnline,
          onlineRequest: !file && live ? { createdAt: live.createdAt, expiresAt: live.expiresAt, createdBy: live.createdBy } : null,
        };
      }),
    })),
  };
}

/** Finds a slot (for uploads and links). */
export function findSlot(borrower: MockBorrower, slotKey: string) {
  return documentSectionsFor(borrower)
    .flatMap((section) => section.slots)
    .find((slot) => slot.key === slotKey);
}

/** "Signed loan application for TL-1042" or "National ID · front" */
export function describeSlot(slot: MockSlot) {
  return slot.forms ? `${slot.label} for ${slot.forms.reference}` : slot.label;
}

const TERM_DAYS = { daily: 120, weekly: 182, monthly: 182 };
const FIRST_PAYMENT_DAYS = { daily: 1, weekly: 7, monthly: 30 };

/** What the online form shows: the loan terms the officer set, nothing personal. */
function newOnlineApplication(borrowerId: string, officerId: string, slotKey: string, forms: MockLoanForms, createdBy: string, createdAt = Date.now()): MockOnlineApplication {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  // A plain random token, like the real one: it carries no information
  const token = btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const day = (offset: number) => new Date(createdAt + offset * DAY_MS).toISOString().slice(0, 10);
  const pricing = forms.pricing ?? LEGACY_PRICING;
  const firstPaymentOn = forms.firstPaymentOn ?? day(FIRST_PAYMENT_DAYS[forms.schedule]);
  const summary = summariseTerms({ amount: forms.amount, repaymentSchedule: forms.schedule, firstPaymentOn, numberOfPayments: forms.numberOfPayments ?? 1, pricing });
  return {
    token,
    borrowerId,
    officerId,
    slotKey,
    createdBy,
    createdAt: new Date(createdAt).toISOString(),
    expiresAt: new Date(createdAt + systemSettings.loanRules.onlineLinkValidHours * 3_600_000).toISOString(),
    status: "open",
    form: {
      reference: forms.reference,
      lender: systemSettings.business.name,
      terms: {
        amount: forms.amount,
        repaymentSchedule: forms.schedule,
        productName: pricing.productName,
        interestRatePercent: pricing.interestRatePercent,
        interestLabel: describeInterest(pricing),
        interest: summary.interest,
        fee: summary.fee,
        feeCollection: pricing.fee.collection,
        totalRepayable: summary.totalRepayable,
        firstPaymentOn,
        lastPaymentOn: forms.lastPaymentOn ?? day(TERM_DAYS[forms.schedule]),
        ...(forms.numberOfPayments && forms.firstPaymentOn
          ? { numberOfPayments: forms.numberOfPayments, instalment: summary.instalment }
          : {}),
      },
    },
  };
}

/**
 * A new one-time link for completing the loan application online. Any earlier link for the same
 * document stops working; this one stops working once it's submitted, or when it expires (Loan rules → online link lifetime).
 */
export function createOnlineLink(borrower: MockBorrower, slotKey: string, createdBy: string) {
  const slot = findSlot(borrower, slotKey)!;
  const application = newOnlineApplication(borrower.id, borrower.officerId, slotKey, slot.forms!, createdBy);
  addOnlineApplication(application);
  return application;
}

/** The forms of an application made with New application: the officer's terms and the guarantors entered. */
function applicationForms(app: MockApplication): MockLoanForms {
  const terms = app.terms!;
  return {
    reference: app.id,
    amount: terms.amount,
    dateBorrowed: new Date().toISOString().slice(0, 10),
    schedule: terms.repaymentSchedule,
    firstPaymentOn: terms.firstPaymentOn,
    lastPaymentOn: summariseTerms(terms).lastPaymentOn,
    numberOfPayments: terms.numberOfPayments,
    pricing: terms.pricing,
    guarantors: (app.guarantors ?? []).map((g) => ({ name: g.fullName, phone: g.phone, nin: g.nationalId, nationalIdMasked: maskNationalId(g.nationalId), relationship: g.relationship ?? null })),
  };
}

function applicationSection(app: MockApplication): MockSection {
  const forms = applicationForms(app);
  return {
    id: app.id,
    title: `${app.id} · application`,
    subtitle: app.status === "submitted" ? "Waiting for approval" : app.route === "online" ? "Draft · the borrower completes it online" : "Draft",
    forms,
    slots: [{ key: `${app.id}:application`, label: "Signed loan application", required: true, canCompleteOnline: true, forms }],
  };
}

/** Adds a new application's section to a borrower whose documents were already loaded. */
export function addApplicationSection(borrower: MockBorrower, app: MockApplication) {
  const existing = sections.get(borrower.id);
  if (!existing || existing.some((section) => section.id === app.id)) return;
  existing.splice(1, 0, applicationSection(app)); // after Identity, before older loans
}

/** The one-time link for an online application (the borrower may not be registered yet). */
export function createOnlineLinkForApplication(app: MockApplication, borrowerId: string | null, officerId: string, createdBy: string) {
  const application = newOnlineApplication(borrowerId ?? "", officerId, `${app.id}:application`, applicationForms(app), createdBy);
  addOnlineApplication(application);
  return application;
}

const dataUrlBytes = (dataUrl: string) => Uint8Array.from(atob(dataUrl.split(",")[1]), (char) => char.charCodeAt(0));
const dataUrlBlob = (image: StoredImage) => new Blob([dataUrlBytes(image.dataUrl)], { type: image.dataUrl.slice(5, image.dataUrl.indexOf(";")) });
const ingested = new Set<string>();

/**
 * Turns online applications submitted (in any tab) into documents: the signed loan application and
 * the borrower's ID photos. Returns the ones added now, so the caller can record them.
 */
export function ingestOnlineApplications(borrower: MockBorrower) {
  documentSectionsFor(borrower);
  const added: MockOnlineApplication[] = [];
  for (const application of submittedOnlineApplicationsFor(borrower.id)) {
    if (ingested.has(application.token)) continue;
    ingested.add(application.token);
    const submission = application.submission!;
    const signer = submission.details.borrower.fullName;
    const base = { borrowerId: borrower.id, uploadedBy: signer, uploadedAt: application.submittedAt!, method: "online" as const };
    const applicationPdf = addDocumentVersion({ ...base, slotKey: application.slotKey, fileName: "loan-application.pdf", contentType: "application/pdf", sizeBytes: 0, submission });
    void documentFile(applicationPdf, borrower); // builds the PDF now (no waiting involved), so its size is known
    for (const [slotKey, image] of [["national-id-front", submission.idFront], ["national-id-back", submission.idBack]] as const) {
      const file = dataUrlBlob(image);
      addDocumentVersion({ ...base, slotKey, fileName: `${slotKey}.${file.type === "image/png" ? "png" : "jpg"}`, contentType: file.type === "image/png" ? "image/png" : "image/jpeg", sizeBytes: file.size, file });
    }
    // The guarantors are now the ones named on the signed application, with photos of their IDs
    const section = documentSectionsFor(borrower).find((sec) => sec.slots.some((slot) => slot.key === application.slotKey));
    if (section?.forms) {
      section.forms.guarantors = submission.details.guarantors.map((g) => ({ name: g.fullName, phone: g.phone, nin: g.nationalId, nationalIdMasked: maskNationalId(g.nationalId), relationship: g.relationship }));
    }
    const reference = application.slotKey.split(":")[0];
    submission.guarantorIds?.forEach((ids, index) => {
      for (const [side, image] of [["front", ids.front], ["back", ids.back]] as const) {
        const slotKey = `${reference}:guarantor-${index + 1}-id-${side}`;
        if (section && !section.slots.some((slot) => slot.key === slotKey)) section.slots.push({ key: slotKey, label: `Guarantor ${index + 1} · National ID ${side}`, required: false, canCompleteOnline: false });
        const file = dataUrlBlob(image);
        addDocumentVersion({ ...base, slotKey, fileName: `guarantor-${index + 1}-id-${side}.${file.type === "image/png" ? "png" : "jpg"}`, contentType: file.type === "image/png" ? "image/png" : "image/jpeg", sizeBytes: file.size, file });
      }
    });
    added.push(application);
  }
  return added;
}

/** The file for a document version, drawing the sample the first time it's opened. */
export async function documentFile(version: MockDocumentVersion, borrower: MockBorrower): Promise<Blob> {
  if (version.file) return version.file;
  const details = borrowerDetails.get(borrower.id)!;
  const slot = findSlot(borrower, version.slotKey);
  const key = version.slotKey;
  const signedOnline = version.method === "online";
  if (key === "national-id-front") version.file = await nationalIdFront(borrower.name, borrower.nin);
  else if (key === "national-id-back") version.file = await nationalIdBack(borrower.nin);
  else if (key === "workplace-photo") version.file = await workplacePhoto(details.premises, "Shop");
  else if (slot?.forms && version.submission) {
    // Completed online: what the borrower filled in, agreed to by a consent tick from each of the three people
    const { details } = version.submission;
    version.file = loanApplicationPdf({
      borrower: { name: details.borrower.fullName, nin: details.borrower.nationalId, phone: details.borrower.phone, premises: details.borrower.premises },
      forms: { ...slot.forms, guarantors: details.guarantors.map((g) => ({ name: g.fullName, nin: g.nationalId, phone: g.phone, nationalIdMasked: maskNationalId(g.nationalId) })) },
      signedOn: version.uploadedAt,
      signedOnline: true,
    });
    version.sizeBytes = version.file.size;
  } else if (slot?.forms)
    version.file = loanApplicationPdf({ borrower: { name: borrower.name, nin: borrower.nin, phone: borrower.phone, premises: details.premises }, forms: slot.forms, signedOn: version.uploadedAt, signedOnline });
  else version.file = new Blob([], { type: version.contentType });
  return version.file;
}

/** The signed loan application for a loan (the Loans tab's "PDF"). */
export function applicationVersionFor(borrower: MockBorrower, loanId: string) {
  documentSectionsFor(borrower);
  // Loans paid out in the demo keep their documents under the application they came from
  const fromApplication = loans.find((l) => l.id === loanId)?.applicationId;
  return currentVersion(borrower.id, `${fromApplication ?? loanId}:application`);
}

/** Once paid out, the application's section is shown as the loan. */
export function markApplicationPaidOut(borrower: MockBorrower, appId: string, loanId: string, product: string) {
  const section = documentSectionsFor(borrower).find((sec) => sec.id === appId);
  if (!section) return;
  section.title = `${loanId} · ${product}`;
  section.subtitle = `Current loan · from application ${appId}`;
}

/** An application's guarantors as stored (with full NINs), for its officer to edit. */
export function applicationGuarantors(borrower: MockBorrower, appId: string) {
  const forms = documentSectionsFor(borrower).find((section) => section.id === appId)?.forms;
  return (forms?.guarantors ?? []).map((g) => ({ fullName: g.name, nationalId: g.nin, phone: g.phone, relationship: g.relationship ?? "" }));
}

/** After the officer edits a draft: the guarantors and terms shown with its documents. */
export function updateApplicationForms(borrower: MockBorrower, app: MockApplication) {
  const section = documentSectionsFor(borrower).find((sec) => sec.id === app.id);
  if (!section?.forms) return;
  section.forms.guarantors = (app.guarantors ?? []).map((g) => ({ name: g.fullName, phone: g.phone, nin: g.nationalId, nationalIdMasked: maskNationalId(g.nationalId), relationship: g.relationship ?? null }));
  if (app.terms) {
    Object.assign(section.forms, {
      amount: app.terms.amount,
      schedule: app.terms.repaymentSchedule,
      firstPaymentOn: app.terms.firstPaymentOn,
      lastPaymentOn: summariseTerms(app.terms).lastPaymentOn,
      numberOfPayments: app.terms.numberOfPayments,
    });
  }
  section.subtitle = app.status === "submitted" ? "Waiting for approval" : "Draft";
}
