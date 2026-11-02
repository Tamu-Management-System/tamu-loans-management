// Loan terms worked out from what the officer sets and the loan product's pricing, following Tamu's
// payment agreement: interest on the amount borrowed, an optional fee, repaid daily, weekly or monthly
// from the first payment date. The backend must use the same rules (docs/api-contract.md).
import type { InterestBasis, LatePenalty, LoanPricing, RepaymentSchedule } from "../api/types";

/** Older loans, made before loan products: 18% on the amount borrowed, no fee */
export const LEGACY_PRICING: LoanPricing = { productName: "Standard loan", interestRatePercent: 18, interestPer: "loan", fee: { type: "none", value: 0, collection: "added" } };

export interface LoanTermsInput {
  amount: number;
  repaymentSchedule: RepaymentSchedule;
  /** ISO date (YYYY-MM-DD) */
  firstPaymentOn: string;
  numberOfPayments: number;
  pricing?: LoanPricing;
}

export interface LoanTermsSummary {
  interest: number;
  fee: number;
  /** What the borrower receives (the amount, less a fee taken from the payout) */
  payout: number;
  totalRepayable: number;
  /** Each payment except the last, rounded to UGX 100 */
  instalment: number;
  /** The last payment takes the rounding difference */
  finalInstalment: number;
  /** ISO date */
  lastPaymentOn: string;
}

/** The date of payment number `index` (0 = the first payment). */
export function paymentDate(firstPaymentOn: string, schedule: RepaymentSchedule, index: number) {
  const date = new Date(`${firstPaymentOn}T00:00:00`);
  if (schedule === "daily") date.setDate(date.getDate() + index);
  else if (schedule === "weekly") date.setDate(date.getDate() + index * 7);
  else date.setMonth(date.getMonth() + index);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

const DAYS_PER_PAYMENT: Record<RepaymentSchedule, number> = { daily: 1, weekly: 7, monthly: 30 };
const DAYS_PER_PERIOD: Record<Exclude<InterestBasis, "loan">, number> = { day: 1, week: 7, month: 30 };
const SCHEDULE_PERIOD: Record<RepaymentSchedule, Exclude<InterestBasis, "loan">> = { daily: "day", weekly: "week", monthly: "month" };

/** The highest rate each basis allows (the screens and the API use the same limits) */
export const INTEREST_LIMITS: Record<InterestBasis, number> = { loan: 100, day: 5, week: 20, month: 30 };

/**
 * How many times the rate is charged: once for "loan"; otherwise the days, weeks or months the loan runs
 * (e.g. 4.5% a week on a 4-week loan is charged 4 times). When the basis and the schedule differ, the loan's
 * length is counted in days (a month as 30).
 */
export function interestPeriods(repaymentSchedule: RepaymentSchedule, numberOfPayments: number, per: InterestBasis) {
  if (per === "loan") return 1;
  if (SCHEDULE_PERIOD[repaymentSchedule] === per) return numberOfPayments;
  return (numberOfPayments * DAYS_PER_PAYMENT[repaymentSchedule]) / DAYS_PER_PERIOD[per];
}

export function feeAmount(amount: number, fee: LoanPricing["fee"]) {
  if (fee.type === "percent") return Math.round((amount * fee.value) / 100);
  if (fee.type === "fixed") return Math.round(fee.value);
  return 0;
}

export function summariseTerms({ amount, repaymentSchedule, firstPaymentOn, numberOfPayments, pricing = LEGACY_PRICING }: LoanTermsInput): LoanTermsSummary {
  const periods = interestPeriods(repaymentSchedule, numberOfPayments, pricing.interestPer);
  const interest = Math.round((amount * pricing.interestRatePercent * periods) / 100);
  const fee = feeAmount(amount, pricing.fee);
  const totalRepayable = amount + interest + (pricing.fee.collection === "added" ? fee : 0);
  const instalment = Math.floor(totalRepayable / numberOfPayments / 100) * 100;
  return {
    interest,
    fee,
    payout: amount - (pricing.fee.collection === "deducted" ? fee : 0),
    totalRepayable,
    instalment,
    finalInstalment: totalRepayable - instalment * (numberOfPayments - 1),
    lastPaymentOn: paymentDate(firstPaymentOn, repaymentSchedule, numberOfPayments - 1),
  };
}

/** The latest first payment an officer can set: about one period after the application, with some slack */
export const FIRST_PAYMENT_WITHIN_DAYS: Record<RepaymentSchedule, number> = { daily: 7, weekly: 14, monthly: 35 };

/** The default loan length, one month, in payments: 30 daily, 4 weekly or 1 monthly (admins can change it per product) */
export const ONE_MONTH_OF_PAYMENTS: Record<RepaymentSchedule, number> = { daily: 30, weekly: 4, monthly: 1 };

/** "3 months", "12 weeks", "30 days" */
export const describeLength = (schedule: RepaymentSchedule, payments: number) =>
  `${payments} ${schedule === "daily" ? "day" : schedule === "weekly" ? "week" : "month"}${payments === 1 ? "" : "s"}`;

/** "18% of the amount" or "5% a month" */
export const describeInterest = (pricing: Pick<LoanPricing, "interestRatePercent" | "interestPer">) =>
  pricing.interestPer === "loan" ? `${pricing.interestRatePercent}% of the amount` : `${pricing.interestRatePercent}% a ${pricing.interestPer}`;

/**
 * Late fees on an overdue amount under a product's penalty rule. `daysLate` counts from the oldest
 * missed payment; `missedPayments` is how many instalments are overdue.
 */
export function latePenalty(rule: LatePenalty, { overdue, daysLate, missedPayments }: { overdue: number; daysLate: number; missedPayments: number; principal?: number }) {
  if (rule.type === "none" || overdue <= 0 || daysLate <= rule.graceDays) return 0;
  const charge = rule.type === "percent" ? (overdue * rule.value) / 100 : rule.value;
  const times = rule.per === "day" ? daysLate - rule.graceDays : Math.max(1, missedPayments);
  const total = Math.round(charge * times);
  return total;
}

/** One line for a penalty rule, e.g. "2% of the overdue amount a day, after 3 days" */
export function describePenalty(rule: LatePenalty) {
  if (rule.type === "none") return "No late fees";
  const charge = rule.type === "percent" ? `${rule.value}% of the overdue amount` : `UGX ${rule.value.toLocaleString("en-US")}`;
  const per = rule.per === "day" ? " a day" : " for each missed payment";
  const grace = rule.graceDays > 0 ? `, after ${rule.graceDays} day${rule.graceDays === 1 ? "" : "s"}` : "";
  return `${charge}${per}${grace}`;
}
