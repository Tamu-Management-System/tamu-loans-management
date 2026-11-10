// Each client's profile details and the terms of their current loan. Filled in by the sample
// data generator (seed.ts); people registered in the demo are added as they're created.
import type { RepaymentSchedule } from "../api/types";
import { paymentDate } from "../lib/repaymentSchedule";

export interface MockBorrowerDetails {
  /** Shop / premises, as on the payment agreement */
  premises: string;
  /** What they do for a living; empty when not given */
  occupation: string;
  /** Optional alternative contact */
  secondaryPhone: string | null;
  /** Optional; the client's email address */
  email: string | null;
  nextOfKin: { name: string | null; phone: string | null; relationship: string | null } | null;
  gender: "female" | "male" | null;
  /** Terms of the current loan, fixed when it was paid out */
  loanTerms: {
    product: string;
    productId?: string;
    principal: number;
    totalRepayable: number;
    repaymentSchedule: RepaymentSchedule;
    disbursedOn: string;
    /** The repayment schedule; paidAtStart = repaid before the demo began */
    schedule?: { firstPaymentOn: string; numberOfPayments: number; instalment: number; paidAtStart?: number };
  } | null;
}

export const borrowerDetails = new Map<string, MockBorrowerDetails>();

/** "CM1234567890KL" -> "CM••••••••••KL" */
export const maskNationalId = (nin: string) => `${nin.slice(0, 2)}${"•".repeat(nin.length - 4)}${nin.slice(-2)}`;

/** The next instalment (or the oldest missed one) for a loan, from its schedule. */
export function nextPayment(terms: NonNullable<MockBorrowerDetails["loanTerms"]>, balance: number) {
  if (balance <= 0 || !terms.schedule) return null;
  // The next unpaid instalment after what's been repaid (instalments are paid in order)
  const paidSoFar = terms.totalRepayable - balance;
  const index = Math.min(terms.schedule.numberOfPayments - 1, Math.floor(paidSoFar / terms.schedule.instalment));
  const paidTowardsIt = paidSoFar - index * terms.schedule.instalment;
  const last = index === terms.schedule.numberOfPayments - 1;
  const amount = (last ? terms.totalRepayable - terms.schedule.instalment * index : terms.schedule.instalment) - paidTowardsIt;
  return { dueOn: paymentDate(terms.schedule.firstPaymentOn, terms.repaymentSchedule, index), amount: Math.min(balance, amount) };
}
