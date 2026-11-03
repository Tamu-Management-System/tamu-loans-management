// Online loan applications sent as links (demo). Kept in localStorage so a link copied in one tab
// still works when it's opened in another tab of the same browser. The token is a plain random string,
// exactly like the real backend's (which stores only a hash of it and looks it up). There is no server
// here to share links between browsers, so a link only opens in the browser that made it.
import type { OnlineApplicationDetails, OnlineApplicationForm } from "../api/types";

const STORAGE_KEY = "tamu-demo-online-applications";

export interface StoredImage {
  /** data: URL of a JPEG or PNG */
  dataUrl: string;
  width: number;
  height: number;
}

export interface OnlineSubmission {
  details: OnlineApplicationDetails;
  idFront: StoredImage;
  idBack: StoredImage;
  /** Each guarantor's National ID (submissions made before this was asked for have none) */
  guarantorIds?: [{ front: StoredImage; back: StoredImage }, { front: StoredImage; back: StoredImage }];
  /** When the three people ticked the consent box (there are no drawn signatures) */
  consentAt: string;
}

export interface MockOnlineApplication {
  token: string;
  /** Empty for someone new: their borrower record is created when they submit */
  borrowerId: string;
  /** The officer who sent it (a new borrower joins their portfolio) */
  officerId: string;
  /** The document it completes, e.g. "APP-311:application" */
  slotKey: string;
  createdBy: string;
  createdAt: string;
  expiresAt: string;
  form: Omit<OnlineApplicationForm, "expiresAt">;
  /** open: waiting; submitted: used (the link no longer works); revoked: replaced by a newer link or a paper upload */
  status: "open" | "submitted" | "revoked";
  submittedAt?: string;
  submission?: OnlineSubmission;
}

function load(): MockOnlineApplication[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]") as MockOnlineApplication[];
  } catch {
    return [];
  }
}

function save(applications: MockOnlineApplication[]) {
  // Photos make submissions large; if storage is full, drop the oldest submissions' files
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(applications));
      return;
    } catch {
      const oldest = applications.find((a) => a.submission);
      if (!oldest) return;
      delete oldest.submission;
    }
  }
}

const isLive = (application: MockOnlineApplication) => application.status === "open" && new Date(application.expiresAt).getTime() > Date.now();

export const findOnlineApplication = (token: string) => load().find((application) => application.token === token);

/** The link waiting to be used for a document, if any. */
export const openOnlineApplicationFor = (borrowerId: string, slotKey: string) => load().find((a) => a.borrowerId === borrowerId && a.slotKey === slotKey && isLive(a));

export const hasOnlineApplicationFor = (borrowerId: string, slotKey: string) => load().some((a) => a.borrowerId === borrowerId && a.slotKey === slotKey);

/** Saves a new link; any open link for the same document stops working. */
export function addOnlineApplication(application: MockOnlineApplication) {
  const applications = load().map((a) => (a.borrowerId === application.borrowerId && a.slotKey === application.slotKey && a.status === "open" ? { ...a, status: "revoked" as const } : a));
  applications.push(application);
  save(applications);
}

/** A paper upload replaces any open link for the document. */
export function revokeOnlineApplications(borrowerId: string, slotKey: string) {
  save(load().map((a) => (a.borrowerId === borrowerId && a.slotKey === slotKey && a.status === "open" ? { ...a, status: "revoked" as const } : a)));
}

/** Marks the link as used: it never works again. */
export function submitOnlineApplication(token: string, submission: OnlineSubmission) {
  const submittedAt = new Date().toISOString();
  save(load().map((a) => (a.token === token ? { ...a, status: "submitted" as const, submittedAt, submission } : a)));
}

/**
 * Borrower records made for new people, per tab: each tab has its own in-memory borrowers, so the
 * link between a submission and the record made for it can't be shared through storage.
 */
const registeredInThisTab = new Map<string, string>();

export const submittedOnlineApplicationsFor = (borrowerId: string) =>
  load().filter((a) => (a.borrowerId === borrowerId || registeredInThisTab.get(a.token) === borrowerId) && a.status === "submitted" && a.submission);

/** Why a link can't be used, or null if it can. */
export function linkProblem(application: MockOnlineApplication | undefined): "invalid" | "used" | "replaced" | "expired" | null {
  if (!application) return "invalid";
  if (application.status === "submitted") return "used";
  if (application.status === "revoked") return "replaced";
  if (new Date(application.expiresAt).getTime() <= Date.now()) return "expired";
  return null;
}

/** Submitted applications from people who weren't borrowers yet (not yet registered in this tab). */
export const submittedForNewBorrowers = () => load().filter((a) => !a.borrowerId && a.status === "submitted" && a.submission && !registeredInThisTab.has(a.token));

/** Links a submitted application to the borrower record made (or found) for it in this tab. */
export function assignBorrower(token: string, borrowerId: string) {
  registeredInThisTab.set(token, borrowerId);
}
