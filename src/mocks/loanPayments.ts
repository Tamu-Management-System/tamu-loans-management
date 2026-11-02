// Repayments on each loan: the ones before the demo began (generated from the loan's schedule, so the
// history matches what's been repaid) and the ones recorded during the demo.
import type { LoanPayment, RepaymentSchedule } from "../api/types";
import { paymentDate } from "../lib/repaymentSchedule";

const recorded = new Map<string, LoanPayment[]>();
let nextPaymentNumber = 1;
const METHODS: LoanPayment["method"][] = ["MTN MoMo", "MTN MoMo", "Airtel Money", "Cash"];

/** A repayment recorded now (Record payment). */
export function recordLoanPayment(loanId: string, payment: Omit<LoanPayment, "id" | "paidAt">, paidAt = new Date().toISOString()) {
  const list = recorded.get(loanId) ?? [];
  list.push({ ...payment, id: `PAY-S${String(nextPaymentNumber++).padStart(4, "0")}`, paidAt });
  recorded.set(loanId, list);
}

interface ScheduleTerms {
  repaymentSchedule: RepaymentSchedule;
  schedule?: { firstPaymentOn: string; instalment: number; paidAtStart?: number };
}

/** Every payment on a loan, newest first. */
export function loanPayments(loanId: string, terms: ScheduleTerms, recordedBy: string): LoanPayment[] {
  const history: LoanPayment[] = [];
  const schedule = terms.schedule;
  let left = schedule?.paidAtStart ?? 0;
  const seed = Number(loanId.replace(/\D/g, ""));
  // Never in the future: instalments due today were paid this morning, and part-payments towards
  // one not yet due were made over the last few days
  const today = paymentDate(new Date().toLocaleDateString("en-CA"), "daily", 0);
  for (let index = 0; schedule && left > 0; index++) {
    const amount = Math.min(schedule.instalment, left);
    left -= amount;
    const due = paymentDate(schedule.firstPaymentOn, terms.repaymentSchedule, index);
    const dueOn = due <= today ? due : paymentDate(today, "daily", -(1 + ((seed + index) % 5)));
    const hour = dueOn === today ? 7 + ((seed + index) % 3) : 8 + ((seed + index) % 9);
    const method = METHODS[(seed + index) % METHODS.length];
    const stamp = `${dueOn.slice(2, 4)}${dueOn.slice(5, 7)}${dueOn.slice(8, 10)}`;
    const reference = method === "Cash" ? null : `${method === "MTN MoMo" ? "MP" : "AT"}${stamp}.${String((seed * 37 + index * 113) % 10_000).padStart(4, "0")}`;
    history.push({ id: `PAY-${seed}-${index + 1}`, paidAt: `${dueOn}T${String(hour).padStart(2, "0")}:${String((seed * 7 + index * 13) % 60).padStart(2, "0")}:00`, amount, method, reference, recordedBy });
  }
  return [...history, ...(recorded.get(loanId) ?? [])].sort((a, b) => b.paidAt.localeCompare(a.paidAt));
}
