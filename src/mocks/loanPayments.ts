// Repayments on each loan: the sample history (from seed.ts, following each borrower's habits) and
// the ones recorded during the demo.
import type { LoanPayment } from "../api/types";

const seeded = new Map<string, LoanPayment[]>();
const recorded = new Map<string, LoanPayment[]>();
let nextPaymentNumber = 1;

/** The sample history for a loan (seed.ts) */
export function seedLoanPayments(loanId: string, payments: LoanPayment[]) {
  seeded.set(loanId, payments);
}

/** A repayment recorded now (Record payment). */
export function recordLoanPayment(loanId: string, payment: Omit<LoanPayment, "id" | "paidAt">, paidAt = new Date().toISOString()) {
  const list = recorded.get(loanId) ?? [];
  list.push({ ...payment, id: `PAY-S${String(nextPaymentNumber++).padStart(4, "0")}`, paidAt });
  recorded.set(loanId, list);
}

/** Every payment on a loan, newest first. (The other arguments are kept for the callers; the history is stored.) */
export function loanPayments(loanId: string, ..._unused: unknown[]): LoanPayment[] {
  void _unused;
  return [...(seeded.get(loanId) ?? []), ...(recorded.get(loanId) ?? [])].sort((a, b) => b.paidAt.localeCompare(a.paidAt));
}
