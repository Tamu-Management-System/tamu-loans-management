// In-memory sample data for the mock API. Mirrors the mockup's sample data.
// The real backend replaces all of this; nothing outside src/mocks imports it.
import type { ApplicationTerms } from "../api/types";
import { formatShortDate } from "../lib/format";
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
    name: "Branch supervisor",
    description: "Oversees the branch's loans and the recovery team. Can't approve or pay out.",
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

const { sharon, joel, sarah, peter, ruth } = OFFICER_IDS;

export const loans: MockLoan[] = [
  { id: "TL-1042", borrowerName: "Aisha Namubiru", phone: "0772 418 230", area: "Owino market", officerId: sharon, outstandingBalance: 2_400_000, daysPastDue: 0 },
  { id: "TL-1063", borrowerName: "Brian Tumusiime", phone: "0756 220 481", area: "Kalerwe", officerId: sharon, outstandingBalance: 1_500_000, daysPastDue: 0 },
  { id: "TL-1201", borrowerName: "Prossy Namatovu", phone: "0779 551 230", area: "Bwaise", officerId: sharon, outstandingBalance: 1_100_000, daysPastDue: 0 },
  { id: "TL-0891", borrowerName: "Rebecca Nakiganda", phone: "0758 112 640", area: "Wandegeya", officerId: sharon, outstandingBalance: 900_000, daysPastDue: 3 },
  { id: "TL-0987", borrowerName: "Moses Ssebunya", phone: "0701 552 914", area: "Kawempe", officerId: sharon, outstandingBalance: 1_100_000, daysPastDue: 9 },
  { id: "TL-0799", borrowerName: "Patrick Wasswa", phone: "0772 905 318", area: "Nakulabye", officerId: sharon, outstandingBalance: 1_600_000, daysPastDue: 12 },
  { id: "TL-0812", borrowerName: "Kenneth Mwesige", phone: "0783 240 776", area: "Kisenyi", officerId: sharon, outstandingBalance: 800_000, daysPastDue: 26, arrearsAmount: 520_000 },
  { id: "TL-0743", borrowerName: "Ronald Mukasa", phone: "0704 318 552", area: "Katwe", officerId: sharon, outstandingBalance: 1_900_000, daysPastDue: 38 },
  { id: "TL-0760", borrowerName: "Stella Nakamya", phone: "0757 803 214", area: "Mengo", officerId: sharon, outstandingBalance: 900_000, daysPastDue: 47, arrearsAmount: 860_000 },
  { id: "TL-0702", borrowerName: "Joseph Kiggundu", phone: "0712 446 905", area: "Kasubi", officerId: sharon, outstandingBalance: 700_000, daysPastDue: 71, arrearsAmount: 900_000 },
  { id: "TL-0655", borrowerName: "Margaret Adong", phone: "0789 120 433", area: "Nateete", officerId: sharon, outstandingBalance: 400_000, daysPastDue: 112, arrearsAmount: 500_000 },
  { id: "TL-1105", borrowerName: "Florence Achieng", phone: "0782 300 117", area: "Nakawa", officerId: joel, outstandingBalance: 3_100_000, daysPastDue: 0 },
  { id: "TL-0820", borrowerName: "Esther Akello", phone: "0776 512 098", area: "Nakawa", officerId: joel, outstandingBalance: 3_400_000, daysPastDue: 64 },
  { id: "TL-0901", borrowerName: "Hassan Kizito", phone: "0702 887 341", area: "Kiwatule", officerId: joel, outstandingBalance: 2_200_000, daysPastDue: 18, arrearsAmount: 610_000 },
  { id: "TL-1150", borrowerName: "Harriet Nansubuga", phone: "0774 908 335", area: "Ntinda", officerId: sarah, outstandingBalance: 5_800_000, daysPastDue: 0 },
  { id: "TL-0865", borrowerName: "Juliet Nalwoga", phone: "0774 230 958", area: "Kyebando", officerId: sarah, outstandingBalance: 1_000_000, daysPastDue: 5 },
  { id: "TL-0778", borrowerName: "Robert Kasozi", phone: "0751 409 627", area: "Ntinda", officerId: sarah, outstandingBalance: 2_600_000, daysPastDue: 41 },
  { id: "TL-0838", borrowerName: "Agnes Auma", phone: "0785 671 204", area: "Banda", officerId: peter, outstandingBalance: 1_900_000, daysPastDue: 22 },
  { id: "TL-0911", borrowerName: "Ivan Kato", phone: "0700 318 965", area: "Kireka", officerId: peter, outstandingBalance: 2_400_000, daysPastDue: 14 },
  { id: "TL-0690", borrowerName: "Tom Ochieng", phone: "0778 554 120", area: "Bweyogerere", officerId: peter, outstandingBalance: 2_800_000, daysPastDue: 88 },
  { id: "TL-0954", borrowerName: "Daniel Opio", phone: "0703 664 019", area: "Kireka", officerId: ruth, outstandingBalance: 2_000_000, daysPastDue: 0 },
  { id: "TL-0701", borrowerName: "Samuel Lubega", phone: "0753 908 446", area: "Mukono", officerId: ruth, outstandingBalance: 4_500_000, daysPastDue: 96 },
  { id: "TL-0715", borrowerName: "Mary Nantongo", phone: "0771 206 389", area: "Seeta", officerId: ruth, outstandingBalance: 3_000_000, daysPastDue: 57, arrearsAmount: 1_450_000 },
  { id: "TL-0681", borrowerName: "Faith Atuhaire", phone: "0759 640 113", area: "Namanve", officerId: ruth, outstandingBalance: 1_600_000, daysPastDue: 121 },
];

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
  guarantors?: { fullName: string; nationalId: string; phone: string }[];
  createdAt?: string;
  submittedAt?: string;
  /** Approved or rejected; byId for the approver-can't-disburse rule */
  decided?: { by: string; byId?: string; at: string };
  /** Paid out: the loan it became */
  loanId?: string;
  /** Sent back to the officer as a draft, or rejected for good */
  returned?: { reason: string; note: string | null; by: string; at: string };
}

const daysAgoIso = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();
/** Terms for a seeded application, first payment one period from now. */
function seededTerms(amount: number, repaymentSchedule: ApplicationTerms["repaymentSchedule"], numberOfPayments: number): ApplicationTerms {
  const first = new Date();
  if (repaymentSchedule === "daily") first.setDate(first.getDate() + 1);
  else if (repaymentSchedule === "weekly") first.setDate(first.getDate() + 7);
  else first.setMonth(first.getMonth() + 1);
  return { productId: null, amount, repaymentSchedule, firstPaymentOn: first.toISOString().slice(0, 10), numberOfPayments };
}

export const applications: MockApplication[] = [
  { id: "APP-311", borrowerName: "Godfrey Byaruhanga", phone: "0772 660 418", amount: 2_500_000, purpose: "Business expansion", officerId: sharon, status: "draft", missing: "Guarantor consent missing" },
  { id: "APP-318", borrowerName: "Winnie Nabirye", phone: "0758 309 772", amount: 600_000, purpose: "Working capital", officerId: sharon, status: "draft", missing: "National ID copy missing" },
  { id: "APP-321", borrowerName: "Dorothy Akiror", phone: "0781 554 016", amount: 900_000, purpose: "School fees", officerId: joel, status: "draft", missing: "Payslip missing" },
  { id: "APP-316", borrowerName: "Charles Ouma", phone: "0703 118 245", amount: 1_500_000, purpose: "Shop stock", officerId: sarah, status: "submitted", missing: null },
  { id: "APP-314", borrowerName: "Lydia Kemigisha", phone: "0781 554 016", amount: 800_000, purpose: "School fees", officerId: joel, status: "submitted", missing: null },

  // More drafts: missing pieces, and one sent back by an approver
  { id: "APP-319", borrowerName: "Faith Namirembe", phone: "0774 812 309", amount: 1_200_000, purpose: "", officerId: sharon, status: "draft", missing: "Signed application PDF missing", createdAt: daysAgoIso(1), terms: seededTerms(1_200_000, "weekly", 20) },
  { id: "APP-320", borrowerName: "Hassan Mugerwa", phone: "0756 430 118", amount: 700_000, purpose: "", officerId: peter, status: "draft", missing: "Guarantor details missing", createdAt: daysAgoIso(2), terms: seededTerms(700_000, "daily", 60) },
  { id: "APP-312", borrowerName: "Juliet Nansamba", phone: "0701 662 905", amount: 1_800_000, purpose: "", officerId: ruth, status: "draft", missing: null, createdAt: daysAgoIso(4), submittedAt: daysAgoIso(3), terms: seededTerms(1_800_000, "monthly", 6),
    returned: { reason: "Signature missing", note: "Guarantor 2 didn't sign the consent page. Get it signed and upload the PDF again.", by: "Moses Okot", at: daysAgoIso(2) } },

  // Online links sent to new people, not completed yet
  { id: "APP-317", borrowerName: "New borrower (online)", phone: "", amount: 1_000_000, purpose: "", officerId: sharon, status: "draft", missing: "Waiting for the borrower to complete it online", route: "online", borrowerId: null, createdAt: daysAgoIso(0.2), terms: seededTerms(1_000_000, "weekly", 12) },
  { id: "APP-315", borrowerName: "New borrower (online)", phone: "", amount: 500_000, purpose: "", officerId: joel, status: "draft", missing: "Waiting for the borrower to complete it online", route: "online", borrowerId: null, createdAt: daysAgoIso(1.5), terms: seededTerms(500_000, "daily", 40) },

  // More waiting for approval
  { id: "APP-310", borrowerName: "Robinah Nalubega", phone: "0782 905 334", amount: 2_000_000, purpose: "", officerId: sharon, status: "submitted", missing: null, createdAt: daysAgoIso(2), submittedAt: daysAgoIso(0.3), terms: seededTerms(2_000_000, "weekly", 24) },
  { id: "APP-308", borrowerName: "Emmanuel Kasujja", phone: "0772 118 640", amount: 3_500_000, purpose: "", officerId: ruth, status: "submitted", missing: null, createdAt: daysAgoIso(3), submittedAt: daysAgoIso(1.2), terms: seededTerms(3_500_000, "monthly", 8) },
  { id: "APP-306", borrowerName: "Sarah Atwine", phone: "0703 447 812", amount: 600_000, purpose: "", officerId: peter, status: "submitted", missing: null, createdAt: daysAgoIso(4), submittedAt: daysAgoIso(2.1), terms: seededTerms(600_000, "daily", 30) },

  // Approved, waiting to be paid out
  { id: "APP-309", borrowerName: "Simon Ochola", phone: "0751 220 917", amount: 800_000, purpose: "", officerId: joel, status: "approved", missing: null, createdAt: daysAgoIso(3), submittedAt: daysAgoIso(1), terms: seededTerms(800_000, "weekly", 16),
    decided: { by: "Moses Okot", byId: "u-moses", at: daysAgoIso(1 / 24) } },
  { id: "APP-307", borrowerName: "Grace Akankwasa", phone: "0774 609 233", amount: 1_500_000, purpose: "", officerId: sharon, status: "approved", missing: null, createdAt: daysAgoIso(4), submittedAt: daysAgoIso(2), terms: seededTerms(1_500_000, "weekly", 20),
    decided: { by: "Joan Nansubuga", byId: "u-joan", at: daysAgoIso(1.1) } },
  { id: "APP-305", borrowerName: "Isaac Waiswa", phone: "0701 885 410", amount: 2_400_000, purpose: "", officerId: sarah, status: "approved", missing: null, createdAt: daysAgoIso(5), submittedAt: daysAgoIso(3), terms: seededTerms(2_400_000, "monthly", 6),
    decided: { by: "Joan Nansubuga", byId: "u-joan", at: daysAgoIso(2.2) } },

  // Rejected for good ("Not eligible")
  { id: "APP-304", borrowerName: "Kenneth Opio", phone: "0758 330 412", amount: 4_000_000, purpose: "", officerId: peter, status: "rejected", missing: null, createdAt: daysAgoIso(6), submittedAt: daysAgoIso(5), terms: seededTerms(4_000_000, "monthly", 10),
    decided: { by: "Moses Okot", at: daysAgoIso(4) }, returned: { reason: "Not eligible", note: "Income doesn't cover the repayments for this amount.", by: "Moses Okot", at: daysAgoIso(4) } },
  { id: "APP-302", borrowerName: "Doreen Asiimwe", phone: "0772 551 078", amount: 1_000_000, purpose: "", officerId: sharon, status: "rejected", missing: null, createdAt: daysAgoIso(8), submittedAt: daysAgoIso(7), terms: seededTerms(1_000_000, "weekly", 12),
    decided: { by: "Moses Okot", at: daysAgoIso(6) }, returned: { reason: "Not eligible", note: "One guarantor is already guaranteeing two other loans.", by: "Moses Okot", at: daysAgoIso(6) } },
];

/** PAR30 by scope, matching the mockup's numbers. */
export const riskSummaries = {
  own: { par30Percent: 4.1, loansOver30Days: 4 },
  branch: { par30Percent: 7.0, loansOver30Days: 21 },
} as const;

export const PAR30_TARGET_PERCENT = 5;

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

// ---------- Portfolio figures (from the approved mockup) ----------

/** PAR30 at the start of each of the last 12 months; the last value is today. */
export const par30History = {
  own: [3.8, 3.6, 4.2, 4.0, 3.9, 4.1, 4.4, 4.2, 4.6, 4.3, 4.5, 4.1],
  branch: [4.2, 4.0, 4.5, 4.3, 4.1, 4.4, 4.6, 4.9, 5.3, 5.8, 6.4, 7.0],
};

export const portfolioRiskFigures = {
  own: { loanCount: 41, par1Percent: 8.6, par90Percent: 0.4, amountOver30Days: 3_900_000, loansOver30Days: 4 },
  branch: { loanCount: 186, par1Percent: 10.7, par90Percent: 1.7, amountOver30Days: 29_000_000, loansOver30Days: 21 },
};

export const arrearsFigures = {
  own: {
    totalOutstanding: 96_000_000,
    current: { amount: 87_700_000, loans: 33 },
    bands: [
      { label: "1–30 days", amount: 4_400_000, loans: 4 },
      { label: "31–60 days", amount: 2_800_000, loans: 2 },
      { label: "61–90 days", amount: 700_000, loans: 1 },
      { label: "90+ days", amount: 400_000, loans: 1 },
    ],
    collectionRatePercent: 94.2,
  },
  branch: {
    totalOutstanding: 412_600_000,
    current: { amount: 368_400_000, loans: 151 },
    bands: [
      { label: "1–30 days", amount: 15_200_000, loans: 14 },
      { label: "31–60 days", amount: 12_600_000, loans: 10 },
      { label: "61–90 days", amount: 9_300_000, loans: 6 },
      { label: "90+ days", amount: 7_100_000, loans: 5 },
    ],
    collectionRatePercent: 91.6,
  },
};

const shortDateDaysAgo = (days: number) =>
  formatShortDate(new Date(Date.now() - days * 86_400_000).toISOString());

/** Early-warning signals by loan, most serious first. Dates are relative to today. */
export const earlyWarningSignals: { loanId: string; signal: string }[] = [
  { loanId: "TL-0743", signal: `Broke a promise to pay on ${shortDateDaysAgo(5)}` },
  { loanId: "TL-0715", signal: "Moves into 61–90 days in 3 days" },
  { loanId: "TL-0760", signal: "No contact logged for 14 days" },
  { loanId: "TL-0901", signal: `Phone unreachable since ${shortDateDaysAgo(7)}` },
  { loanId: "TL-0702", signal: `Guarantor asked to withdraw on ${shortDateDaysAgo(8)}` },
  { loanId: "TL-0812", signal: "Part-paid 3 months in a row" },
  { loanId: "TL-1201", signal: "Shop closed for 2 weeks (field visit note)" },
  { loanId: "TL-1063", signal: "Paid late on 3 of the last 4 installments" },
];

export const portfolioSummaries: Record<string, { outstandingBalance: number; activeLoans: number; disbursedThisMonth: { amount: number; count: number }; clearedThisMonth: number; dueThisWeek: number }> = {
  [OFFICER_IDS.sharon]: { outstandingBalance: 96_000_000, activeLoans: 41, disbursedThisMonth: { amount: 6_400_000, count: 5 }, clearedThisMonth: 3, dueThisWeek: 2_100_000 },
};

export interface MockOfficer {
  id: string;
  name: string;
  photoUrl: string | null;
  portfolioAmount: number;
  loanCount: number;
  par30Percent: number;
  /** Expected collections today for officers who aren't demo users */
  expectedToday: number;
}

export const officers: MockOfficer[] = [
  { id: OFFICER_IDS.sharon, name: "Sharon Nakalema", photoUrl: users[0].photoUrl, portfolioAmount: 96_000_000, loanCount: 41, par30Percent: 4.1, expectedToday: 1_240_000 },
  { id: OFFICER_IDS.joel, name: "Joel Okello", photoUrl: unsplashPhoto("1614023342667-6f060e9d1e04"), portfolioAmount: 88_400_000, loanCount: 38, par30Percent: 6.2, expectedToday: 620_000 },
  { id: OFFICER_IDS.sarah, name: "Sarah Kyomuhendo", photoUrl: unsplashPhoto("1527201987695-67c06571957e"), portfolioAmount: 79_500_000, loanCount: 36, par30Percent: 5.4, expectedToday: 1_100_000 },
  { id: OFFICER_IDS.peter, name: "Peter Mugisha", photoUrl: unsplashPhoto("1588178454780-441fa5b99fa5"), portfolioAmount: 81_200_000, loanCount: 37, par30Percent: 7.9, expectedToday: 500_000 },
  { id: OFFICER_IDS.ruth, name: "Ruth Atim", photoUrl: unsplashPhoto("1668752741330-8adc5cef7485"), portfolioAmount: 67_500_000, loanCount: 34, par30Percent: 13.2, expectedToday: 380_000 },
];

const hoursAgo = (hours: number) => new Date(Date.now() - hours * 3_600_000).toISOString();

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

/** Recent activity across the branch (audit log), newest first. */
export const activityLog: MockAuditEntry[] = [
  { id: "act-1", actor: { name: "Moses Okot", role: "Finance", photoUrl: users[2].photoUrl }, description: "approved APP-309 · UGX 800,000", at: hoursAgo(1) },
  { id: "act-2", actor: { name: "Peter Mugisha", role: "Loan officer", photoUrl: officers[3].photoUrl }, description: "recorded UGX 300,000 on TL-0911", at: hoursAgo(1.5) },
  { id: "act-3", actor: { name: "Sharon Nakalema", role: "Loan officer", photoUrl: users[0].photoUrl }, description: "registered borrower Winnie Nabirye", at: hoursAgo(2) },
  { id: "act-4", actor: { name: "Joel Okello", role: "Loan officer", photoUrl: officers[1].photoUrl }, description: "viewed the National ID of Esther Akello", at: hoursAgo(26) },
  { id: "act-5", actor: { name: "Martin Ssempa", role: "Admin", photoUrl: users[1].photoUrl }, description: "created the custom role Branch Supervisor", at: hoursAgo(28) },
  { id: "act-6", actor: { name: "Moses Okot", role: "Finance", photoUrl: users[2].photoUrl }, description: "disbursed TL-1209 · UGX 1,500,000", at: hoursAgo(75) },
];
