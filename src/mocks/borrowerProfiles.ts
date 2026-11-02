// Profile details for the sample borrowers (next of kin, work, loan terms). Generated once with a
// fixed seed so every borrower always shows the same details.
import type { RepaymentSchedule } from "../api/types";
import { paymentDate } from "../lib/repaymentSchedule";
import { borrowers, type MockBorrower } from "./borrowerDirectory";
import { loans } from "./fixtures";

export interface MockBorrowerDetails {
  /** Shop / premises, as on the payment agreement */
  premises: string;
  // Optional extras, not on Tamu's forms yet
  secondaryPhone: string | null;
  nextOfKin: { name: string; phone: string; relationship: string } | null;
  work: { occupation: string | null; income: { amount: number; period: "daily" | "weekly" | "monthly" } | null };
  /** Terms of the current loan, fixed when it was disbursed */
  loanTerms: {
    product: string;
    /** The loan product (for its late penalty rule); older loans count as the product for their frequency */
    productId?: string;
    principal: number;
    totalRepayable: number;
    repaymentSchedule: RepaymentSchedule;
    disbursedOn: string;
    /** The exact schedule; paidAtStart = repaid before the demo began (for the payment history) */
    schedule?: { firstPaymentOn: string; numberOfPayments: number; instalment: number; paidAtStart?: number };
  } | null;
}

/** Interest on the sample loans made before loan products (the agreement's "18% Administration charge") */
export const INTEREST_RATE = 0.18;

// Gender-neutral, since the sample names are picked at random
const RELATIONSHIPS = ["Spouse", "Sibling", "Parent", "Cousin", "Friend", "Relative"];
const KIN_FIRST_NAMES = ["Grace", "John", "Mary", "Joseph", "Sarah", "David", "Ruth", "Peter", "Prossy", "Robert", "Jane", "Samuel"];
const OCCUPATIONS: { occupation: string; places: string[] }[] = [
  { occupation: "Retail shop", places: ["Kikuubo Lane, Shop 14", "Nakasero Market, Stall 32", "Kawempe trading centre"] },
  { occupation: "Salon", places: ["Wandegeya, Plot 9", "Ntinda shopping centre", "Kireka stage"] },
  { occupation: "Boda boda rider", places: ["Kalerwe stage", "Bwaise stage", "Kasubi stage"] },
  { occupation: "Food vendor", places: ["Owino market, Block C", "Nakawa market", "Katwe junction"] },
  { occupation: "Tailor", places: ["Mengo, Kabaka Anjagala Rd", "Nateete market", "Kisenyi, Shop 3"] },
  { occupation: "Office worker", places: ["Tamu Cleaning Services, Ntinda", "Nakawa industrial area", "Kampala Road"] },
];
const PRODUCTS = ["Business loan", "School fees loan", "Asset loan"];
const PHONE_PREFIXES = ["0772", "0701", "0756", "0782", "0774", "0703"];

function seededRandom(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const random = seededRandom(4042);
const pick = <T,>(items: readonly T[]) => items[Math.floor(random() * items.length)];
const digits = (count: number) => Array.from({ length: count }, () => Math.floor(random() * 10)).join("");
const phone = () => `${pick(PHONE_PREFIXES)} ${digits(3)} ${digits(3)}`;
const roundTo = (amount: number, step: number) => Math.round(amount / step) * step;

function buildDetails(borrower: MockBorrower): MockBorrowerDetails {
  const job = pick(OCCUPATIONS);
  const period = job.occupation === "Office worker" ? "monthly" : pick(["daily", "weekly"] as const);
  const income = period === "daily" ? roundTo(30_000 + random() * 120_000, 5_000) : period === "weekly" ? roundTo(200_000 + random() * 600_000, 10_000) : roundTo(600_000 + random() * 1_400_000, 50_000);

  const loan = borrower.currentLoanId ? loans.find((l) => l.id === borrower.currentLoanId) : undefined;
  let loanTerms: MockBorrowerDetails["loanTerms"] = null;
  if (loan) {
    // The outstanding balance is 25–95% of what was owed at the start
    const totalRepayable = roundTo(loan.outstandingBalance / (0.25 + random() * 0.7), 10_000);
    const principal = roundTo(totalRepayable / (1 + INTEREST_RATE), 10_000);
    const frequency = random();
    const product = pick(PRODUCTS);
    void random(); // (kept so the rest of the sample data stays the same)
    const repaymentSchedule: RepaymentSchedule = frequency < 0.25 ? "daily" : frequency < 0.75 ? "weekly" : "monthly";
    const total = Math.round(principal * (1 + INTEREST_RATE));

    // A real schedule, built around how far the loan has got: the instalments paid so far, then the
    // next (or first missed) one on the date that matches how late it is, then the rest
    const instalment = Math.max(1_000, roundTo(total / { daily: 120, weekly: 26, monthly: 6 }[repaymentSchedule], 1_000));
    const repaid = Math.max(0, total - loan.outstandingBalance);
    const paidInstalments = Math.floor(repaid / instalment);
    const loanNumber = Number(loan.id.replace(/\D/g, ""));
    const today = paymentDate(new Date().toLocaleDateString("en-CA"), "daily", 0);
    const nextDue = loan.daysPastDue > 0 ? paymentDate(today, "daily", -loan.daysPastDue) : paymentDate(today, "daily", 1 + (loanNumber % { daily: 1, weekly: 7, monthly: 28 }[repaymentSchedule]));
    const firstPaymentOn = paymentDate(nextDue, repaymentSchedule, -paidInstalments);
    const disbursedOn = paymentDate(firstPaymentOn, repaymentSchedule, -1);
    // Registered before the loan was paid out
    if (disbursedOn < borrower.registeredOn) borrower.registeredOn = paymentDate(disbursedOn, "daily", -(7 + (loanNumber % 40)));
    loanTerms = {
      product,
      principal,
      totalRepayable: total,
      repaymentSchedule,
      disbursedOn,
      schedule: { firstPaymentOn, numberOfPayments: paidInstalments + Math.max(1, Math.ceil(loan.outstandingBalance / instalment)), instalment, paidAtStart: repaid },
    };
  }

  // The optional extras are missing for some borrowers, as they would be for paper forms
  const hasWorkDetails = random() < 0.7;
  return {
    premises: pick(job.places),
    secondaryPhone: random() < 0.5 ? phone() : null,
    nextOfKin: random() < 0.65 ? { name: `${pick(KIN_FIRST_NAMES)} ${borrower.name.split(" ").at(-1)}`, phone: phone(), relationship: pick(RELATIONSHIPS) } : null,
    work: hasWorkDetails ? { occupation: job.occupation, income: { amount: income, period } } : { occupation: null, income: null },
    loanTerms,
  };
}

export const borrowerDetails = new Map(borrowers.map((borrower) => [borrower.id, buildDetails(borrower)]));

/** "CM1234567890KL" -> "CM••••••••••KL" */
export const maskNationalId = (nin: string) => `${nin.slice(0, 2)}${"•".repeat(nin.length - 4)}${nin.slice(-2)}`;

/** The next instalment (or the oldest missed one) for a loan, from its terms. */
export function nextPayment(terms: NonNullable<MockBorrowerDetails["loanTerms"]>, balance: number, daysPastDue: number, loanNumber: number) {
  if (balance <= 0) return null;
  if (terms.schedule) {
    // The exact schedule: the next unpaid instalment after what's been repaid
    const paidSoFar = terms.totalRepayable - balance;
    const index = Math.min(terms.schedule.numberOfPayments - 1, Math.floor(paidSoFar / terms.schedule.instalment));
    return { dueOn: paymentDate(terms.schedule.firstPaymentOn, terms.repaymentSchedule, index), amount: Math.min(balance, terms.schedule.instalment) };
  }
  const instalments = { daily: 120, weekly: 26, monthly: 6 }[terms.repaymentSchedule];
  const amount = Math.min(balance, roundTo(terms.totalRepayable / instalments, 1_000));
  const daysAhead = { daily: 1, weekly: loanNumber % 7, monthly: loanNumber % 28 }[terms.repaymentSchedule];
  const dueOn = new Date(Date.now() + (daysPastDue > 0 ? -daysPastDue : daysAhead) * 86_400_000).toISOString().slice(0, 10);
  return { dueOn, amount };
}
