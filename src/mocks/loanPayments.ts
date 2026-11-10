// Repayments on each loan: the sample history (from seed.ts, following each client's habits) and
// the ones recorded during the demo. A payment's amount can be changed (PATCH /payments/{id}); every change is kept on it.
import type { LoanPayment, PaymentEdit } from "../api/types";

/** What is stored: a payment, when it was entered, and its changes (`canEdit` depends on who asks, so it's added on the way out) */
type StoredPayment = Omit<LoanPayment, "canEdit" | "edits"> & { recordedAt: string; edits: PaymentEdit[] };
type NewPayment = Omit<LoanPayment, "canEdit" | "edits" | "id" | "paidAt">;

const seeded = new Map<string, StoredPayment[]>();
const recorded = new Map<string, StoredPayment[]>();
let nextPaymentNumber = 1;

/** The sample history for a loan (seed.ts) */
export function seedLoanPayments(loanId: string, payments: Omit<LoanPayment, "canEdit" | "edits">[]) {
  seeded.set(
    loanId,
    payments.map((payment) => ({ ...payment, recordedAt: payment.paidAt, edits: [] })),
  );
}

/** A repayment recorded now (Record payment). Returns its ID. */
export function recordLoanPayment(loanId: string, payment: NewPayment, paidAt = new Date().toISOString()) {
  const list = recorded.get(loanId) ?? [];
  const id = `PAY-S${String(nextPaymentNumber++).padStart(4, "0")}`;
  list.push({ ...payment, id, paidAt, recordedAt: new Date().toISOString(), edits: [] });
  recorded.set(loanId, list);
  return id;
}

const stored = (loanId: string) => [...(seeded.get(loanId) ?? []), ...(recorded.get(loanId) ?? [])].sort((a, b) => b.paidAt.localeCompare(a.paidAt));

/** Every payment on a loan, newest first. (The other arguments are kept for the callers; the history is stored.) */
export function loanPayments(loanId: string, ..._unused: unknown[]): (LoanPayment & { recordedAt: string })[] {
  void _unused;
  return stored(loanId).map((payment) => ({ ...payment, edits: payment.edits.map((edit) => ({ ...edit })), canEdit: false }));
}

/** A stored payment and the loan it belongs to, to change it */
export function findStoredPayment(paymentId: string) {
  for (const map of [seeded, recorded])
    for (const [loanId, list] of map) {
      const payment = list.find((item) => item.id === paymentId);
      if (payment) return { loanId, payment, isLatest: stored(loanId)[0]?.id === paymentId };
    }
  return null;
}

/** Changes a payment's amount, keeping what it was. */
export function changePaymentAmount(payment: StoredPayment, edit: PaymentEdit) {
  payment.amount = edit.to;
  payment.edits.push(edit);
}
