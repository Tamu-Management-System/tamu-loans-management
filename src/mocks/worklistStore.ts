// Mutable mock state for the worklist and payments, so the demo behaves like a real
// backend: recording a payment changes the loan balance, the task and the dashboard numbers.
// Everything resets on page reload. Sample data matches the approved mockup.
import type { PaymentMethod, WorklistTask } from "../api/types";
import { earlyWarningSignals, loans, OFFICER_IDS } from "./fixtures";

const ADMIN_ID = "u-martin";

const isoDaysAgo = (days: number, hour = 9, minute = 0) => {
  const date = new Date();
  date.setDate(date.getDate() - days);
  date.setHours(hour, minute, 0, 0);
  return date.toISOString();
};
const isoDate = (daysAgo: number) => isoDaysAgo(daysAgo).slice(0, 10);

const borrowerOf = (loanId: string) => {
  const loan = loans.find((l) => l.id === loanId)!;
  return { name: loan.borrowerName, phone: loan.phone, area: loan.area };
};

// A getter so every task gets its own notes list (a shared array would leak notes between tasks)
/** Warning text shared with the Early warnings card, so both say the same thing. */
const signalFor = (loanId: string) => earlyWarningSignals.find((warning) => warning.loanId === loanId)?.signal;

const open = () => ({ status: "open" as const, notes: [] as string[] });

function seedTasks(): Record<string, WorklistTask[]> {
  return {
    [OFFICER_IDS.sharon]: [
      { ...open(), id: "task-1042", type: "instalment-due", priority: "routine", loanId: "TL-1042", borrower: borrowerOf("TL-1042"), amountDue: 450_000, amountPaid: 0 },
      { ...open(), id: "task-1063", type: "instalment-due", priority: "do-today", loanId: "TL-1063", borrower: borrowerOf("TL-1063"), amountDue: 280_000, amountPaid: 0, warning: signalFor("TL-1063") },
      { ...open(), id: "task-1201", type: "instalment-due", priority: "do-today", loanId: "TL-1201", borrower: borrowerOf("TL-1201"), amountDue: 210_000, amountPaid: 0, warning: signalFor("TL-1201") },
      { ...open(), id: "task-0987", type: "promise-due", priority: "do-first", loanId: "TL-0987", borrower: borrowerOf("TL-0987"), amountDue: 300_000, amountPaid: 0, promiseMadeOn: isoDate(7), daysPastDue: 9 },
      { ...open(), id: "task-0743", type: "overdue", priority: "do-first", loanId: "TL-0743", borrower: borrowerOf("TL-0743"), amountDue: 1_240_000, amountPaid: 0, daysPastDue: 38, warning: signalFor("TL-0743") },
      { ...open(), id: "task-0799", type: "overdue", priority: "do-today", loanId: "TL-0799", borrower: borrowerOf("TL-0799"), amountDue: 450_000, amountPaid: 0, daysPastDue: 12 },
      { ...open(), id: "task-0891", type: "overdue", priority: "do-today", loanId: "TL-0891", borrower: borrowerOf("TL-0891"), amountDue: 180_000, amountPaid: 0, daysPastDue: 3 },
      { ...open(), id: "task-app-311", type: "application-incomplete", priority: "do-today", applicationId: "APP-311", borrower: { name: "Godfrey Byaruhanga", phone: "0772 660 418" }, amountRequested: 2_500_000, purpose: "Business expansion", missingItem: "Guarantor consent missing" },
      { ...open(), id: "task-app-318", type: "application-incomplete", priority: "do-today", applicationId: "APP-318", borrower: { name: "Winnie Nabirye", phone: "0758 309 772" }, amountRequested: 600_000, purpose: "Working capital", missingItem: "National ID copy missing" },
      { ...open(), id: "task-pay-4471", type: "payment-unmatched", priority: "do-today", payment: { provider: "Airtel Money", phone: "0755 401 772", amount: 450_000, reference: "AT261027.4471", receivedAt: isoDaysAgo(0, 9, 2) } },
      { ...open(), id: "task-pay-0815", type: "payment-unmatched", priority: "do-today", payment: { provider: "MTN MoMo", phone: "0779 551 203", amount: 210_000, reference: "MP261027.0815", receivedAt: isoDaysAgo(0, 8, 15) } },
    ],
    [ADMIN_ID]: [
      { ...open(), id: "task-rev-1105", type: "reversal-request", priority: "do-first", loanId: "TL-1105", requestedBy: "Joel Okello", requestedAt: isoDaysAgo(1, 16, 10), amount: 450_000, reason: "recorded on the wrong loan" },
      { ...open(), id: "task-rev-0954", type: "reversal-request", priority: "do-today", loanId: "TL-0954", requestedBy: "Ruth Atim", requestedAt: isoDaysAgo(0, 9, 5), amount: 380_000, reason: "entered twice" },
      { ...open(), id: "task-apr-316", type: "awaiting-approval", priority: "do-first", applicationId: "APP-316", borrower: { name: "Charles Ouma", phone: "0703 118 245" }, amountRequested: 1_500_000, purpose: "Shop stock", submittedBy: "Sarah Kyomuhendo", hoursWaiting: 61 },
      { ...open(), id: "task-apr-314", type: "awaiting-approval", priority: "routine", applicationId: "APP-314", borrower: { name: "Lydia Kemigisha", phone: "0781 554 016" }, amountRequested: 800_000, purpose: "School fees", submittedBy: "Joel Okello", hoursWaiting: 20 },
      { ...open(), id: "task-dis-1214", type: "awaiting-disbursement", priority: "do-first", loanId: "TL-1214", borrower: { name: "Joyce Nabukenya", phone: "0772 118 940" }, amount: 1_200_000, officerName: "Peter Mugisha", approvedOn: isoDate(3) },
      { ...open(), id: "task-dis-1216", type: "awaiting-disbursement", priority: "do-today", loanId: "TL-1216", borrower: { name: "Isaac Waiswa", phone: "0701 664 207" }, amount: 700_000, officerName: "Sharon Nakalema", approvedOn: isoDate(1) },
      { ...open(), id: "task-acc-kigozi", type: "access-request", priority: "do-today", user: { name: "Paul Kigozi", role: "Finance" }, kind: "password-reset", requestedAt: isoDaysAgo(0, 8, 40) },
      { ...open(), id: "task-acc-ainomugisha", type: "access-request", priority: "routine", user: { name: "Esther Ainomugisha", role: "Loan officer" }, kind: "invite-pending", requestedAt: isoDaysAgo(3) },
    ],
  };
}

export const worklists = seedTasks();

export const tasksFor = (userId: string): WorklistTask[] => worklists[userId] ?? [];

export function findTask(taskId: string): WorklistTask | undefined {
  return Object.values(worklists).flat().find((task) => task.id === taskId);
}

/** Open loan-related task for a loan, if one is on anyone's worklist today. */
export function openTaskForLoan(loanId: string) {
  return Object.values(worklists)
    .flat()
    .find((task) => task.status === "open" && "loanId" in task && "amountDue" in task && task.loanId === loanId);
}

// ---------- Undo ----------

interface UndoRecord {
  /** Task as it was before the change; null when the change created the task */
  task: WorklistTask | null;
  ownerId?: string;
  /** Loan balance to restore when the undone action was a payment */
  loanBalance?: { loanId: string; balance: number };
}

const undoRecords = new Map<string, UndoRecord>();

/** Remembers a task (and optionally a loan balance) before it changes, so the change can be undone. */
export function rememberForUndo(task: WorklistTask, loanBalance?: UndoRecord["loanBalance"]) {
  undoRecords.set(task.id, { task: structuredClone(task), loanBalance });
}

/** Adds an overdue loan to a user's worklist ("Add to today"). Undo removes it again. */
export function addFollowUpTask(userId: string, loanId: string): WorklistTask | null {
  const loan = loans.find((l) => l.id === loanId);
  if (!loan || loan.daysPastDue === 0) return null;
  const task: WorklistTask = {
    ...open(),
    id: `task-${loanId.toLowerCase()}-${Date.now()}`,
    type: "overdue",
    priority: loan.daysPastDue > 30 ? "do-first" : "do-today",
    loanId,
    borrower: borrowerOf(loanId),
    amountDue: loan.arrearsAmount ?? 0,
    amountPaid: 0,
    daysPastDue: loan.daysPastDue,
    warning: signalFor(loanId),
  };
  (worklists[userId] ??= []).push(task);
  undoRecords.set(task.id, { task: null, ownerId: userId });
  return task;
}

export function undo(taskId: string): boolean {
  const record = undoRecords.get(taskId);
  const current = findTask(taskId);
  if (!record || !current) return false;
  if (record.task === null) {
    // The change created the task: remove it
    const list = worklists[record.ownerId!];
    list.splice(list.indexOf(current), 1);
    undoRecords.delete(taskId);
    return true;
  }
  Object.assign(current, structuredClone(record.task));
  if (!("result" in record.task)) delete current.result;
  if (record.loanBalance) {
    const loan = loans.find((l) => l.id === record.loanBalance!.loanId);
    if (loan) loan.outstandingBalance = record.loanBalance.balance;
  }
  undoRecords.delete(taskId);
  return true;
}

// ---------- Helpers ----------

export const clockTime = () => new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
export const ugx = (amount: number) => `UGX ${Math.round(amount).toLocaleString("en-US")}`;

let paymentSequence = 1000;
export const nextPaymentId = () => `PAY-${++paymentSequence}`;

export function describePayment(amount: number, method: PaymentMethod, reference?: string) {
  return `Paid ${ugx(amount)} · ${method}${reference ? ` · ${reference}` : ""} · ${clockTime()}`;
}
