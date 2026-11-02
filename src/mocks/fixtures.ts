// The people behind the mock API (staff who can sign in, loan officers, roles) and the shapes of
// the sample records. The records themselves are generated in seed.ts from the current rules
// (loan products, one-month loans, the client's data list). The real backend replaces all of this.
import type { ApplicationTerms } from "../api/types";
import { BUILT_IN_ROLES, type Role } from "../auth/permissions";

export interface MockUser {
  id: string;
  name: string;
  email: string;
  photoUrl: string | null;
  branch: string;
  /** A built-in role ("admin", "finance", "loan_officer") or a custom one */
  roleId: string;
}

const unsplashPhoto = (photoId: string) => `https://images.unsplash.com/photo-${photoId}?w=96&h=96&fit=crop&crop=faces&q=70&auto=format`;

export const users: MockUser[] = [
  {
    id: "u-sharon",
    name: "Sharon Nakalema",
    email: "sharon@tamu.example",
    photoUrl: "https://ca.slack-edge.com/T011H66DJCE-U072R9CH6D9-41f786fd5bad-512",
    branch: "Kampala Central",
    roleId: "loan_officer",
  },
  {
    id: "u-martin",
    name: "Martin Ssempa",
    email: "martin@tamu.example",
    photoUrl: unsplashPhoto("1522529599102-193c0d76b5b6"),
    branch: "Kampala Central",
    roleId: "admin",
  },
  {
    id: "u-moses",
    name: "Moses Okot",
    email: "moses@tamu.example",
    photoUrl: unsplashPhoto("1595211877493-41a4e5f236b3"),
    branch: "Kampala Central",
    roleId: "finance",
  },
];

/** Every role, built-in and custom (admins add and change custom ones in Settings). */
export const roles: Record<string, Role> = {
  ...structuredClone(BUILT_IN_ROLES),
  "role-supervisor": {
    id: "role-supervisor",
    name: "Market supervisor",
    description: "Oversees the market's loans and the recovery team. Can't approve or pay out.",
    builtIn: false,
    dataScope: "branch",
    permissions: ["borrowers.view", "documents.view", "applications.view", "loans.view", "payments.view", "payments.record", "recovery.view", "recovery.manage", "reports.view", "reports.export"],
  },
  "role-recovery": {
    id: "role-recovery",
    name: "Recovery agent",
    description: "Follows up loans with the recovery team and records what borrowers pay.",
    builtIn: false,
    dataScope: "branch",
    permissions: ["borrowers.view", "loans.view", "payments.view", "payments.record", "recovery.view", "recovery.manage"],
  },
};

// Loan officers who own portfolios. Only Sharon can sign in to the demo; the others
// exist so branch-wide views (Admin, Finance) have realistic data.
export const OFFICER_IDS = {
  sharon: "u-sharon",
  joel: "u-joel",
  sarah: "u-sarah",
  peter: "u-peter",
  ruth: "u-ruth",
} as const;

export interface MockLoan {
  id: string;
  borrowerName: string;
  phone: string;
  area: string;
  officerId: string;
  /** Outstanding balance in UGX */
  outstandingBalance: number;
  daysPastDue: number;
  /** UGX overdue, for loans behind on payments */
  arrearsAmount?: number;
  /** The application it was paid out from (loans made in the demo) */
  applicationId?: string;
  /** With the recovery team */
  recovery?: { since: string; by: string; byId: string; reason: string; note: string | null };
  /** Loans paid out in the demo: how */
  payout?: { method: string; reference: string; by: string; paidOn: string };
}

/** Current loans (one per borrower at most), filled in by the sample data generator (seed.ts) */
export const loans: MockLoan[] = [];

export type MockApplicationStatus = "draft" | "submitted" | "approved" | "rejected";

export interface MockApplication {
  id: string;
  borrowerName: string;
  phone: string;
  /** Requested amount in UGX */
  amount: number;
  purpose: string;
  officerId: string;
  /** draft = officer still completing it; submitted = waiting for approval */
  status: MockApplicationStatus;
  missing: string | null;
  // Set on applications created in the demo (New application)
  borrowerId?: string | null;
  terms?: ApplicationTerms;
  route?: "paper" | "online";
  guarantors?: { fullName: string; nationalId: string; phone: string; relationship?: string }[];
  createdAt?: string;
  submittedAt?: string;
  /** Approved or rejected; byId for the approver-can't-disburse rule */
  decided?: { by: string; byId?: string; at: string };
  /** Paid out: the loan it became */
  loanId?: string;
  /** Sent back to the officer as a draft, or rejected for good */
  returned?: { reason: string; note: string | null; by: string; at: string };
}

/** Applications, filled in by the sample data generator (seed.ts) */
export const applications: MockApplication[] = [];

/** The PAR30 level the business aims to stay under */

// TEMPORARY demo session: which user the mock API treats as signed in, kept in this
// browser's storage. Sign-in and the demo controls set it; sign-out clears it. The real
// backend uses a session cookie instead.
export const DEMO_USER_KEY = "tamu-demo-user";

/** Every demo account uses this password. */
export const DEMO_PASSWORD = "tamu2026";

export function signedInDemoUser(): MockUser | null {
  try {
    const id = localStorage.getItem(DEMO_USER_KEY);
    return users.find((user) => user.id === id) ?? null;
  } catch {
    return null;
  }
}

export function setDemoSession(userId: string | null) {
  try {
    if (userId) localStorage.setItem(DEMO_USER_KEY, userId);
    else localStorage.removeItem(DEMO_USER_KEY);
  } catch {
    /* storage blocked: the session can't be kept */
  }
}

/** The signed-in user, for endpoints that only run once someone is signed in. */
export function currentDemoUser(): MockUser {
  return signedInDemoUser() ?? users[0];
}

/** A loan officer who looks after a portfolio (their figures are worked out from the loans) */
export interface MockOfficer {
  id: string;
  name: string;
  photoUrl: string | null;
}

export const officers: MockOfficer[] = [
  { id: OFFICER_IDS.sharon, name: "Sharon Nakalema", photoUrl: users[0].photoUrl },
  { id: OFFICER_IDS.joel, name: "Joel Okello", photoUrl: unsplashPhoto("1614023342667-6f060e9d1e04") },
  { id: OFFICER_IDS.sarah, name: "Sarah Kyomuhendo", photoUrl: unsplashPhoto("1527201987695-67c06571957e") },
  { id: OFFICER_IDS.peter, name: "Peter Mugisha", photoUrl: unsplashPhoto("1588178454780-441fa5b99fa5") },
  { id: OFFICER_IDS.ruth, name: "Ruth Atim", photoUrl: unsplashPhoto("1668752741330-8adc5cef7485") },
];

/** One audit log entry. The real backend also stores the IP address and device. */
export interface MockAuditEntry {
  id: string;
  actor: { id?: string | null; name: string; role: string; photoUrl: string | null };
  description: string;
  /** ISO date-time */
  at: string;
  /** Before → after values, for changes to settings, roles and the like */
  details?: { label: string; value: string }[];
}

/** The audit log, newest first: a month of history from the sample data (auditLog.ts), then everything done in the demo */
export const activityLog: MockAuditEntry[] = [];
