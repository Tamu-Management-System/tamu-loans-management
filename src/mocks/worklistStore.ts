// Mutable mock state for the worklist and payments, so the demo behaves like a real
// backend: recording a payment changes the loan balance, the task and the dashboard numbers.
// Today's tasks are worked out from the sample data (seed.ts). Everything resets on page reload.
import "./seed";
import type { PaymentMethod, WorklistTask } from "../api/types";
import { borrowers } from "./borrowerDirectory";
import { borrowerDetails, nextPayment } from "./borrowerProfiles";
import { applications, loans, officers } from "./fixtures";
import { earlyWarnings } from "./portfolioFigures";
import { staff } from "./staff";
import { roles } from "./fixtures";

const ADMIN_ID = "u-martin";
const TODAY = new Date().toLocaleDateString("en-CA");

const borrowerOf = (loanId: string) => {
  const loan = loans.find((l) => l.id === loanId)!;
  return { name: loan.borrowerName, phone: loan.phone, area: loan.area };
};

/** Warning text shared with the Early warnings card, so both say the same thing. */
const warnings = earlyWarnings(() => true);
const signalFor = (loanId: string) => warnings.find((warning) => warning.loanId === loanId)?.signal;

// A getter so every task gets its own notes list (a shared array would leak notes between tasks)
const open = () => ({ status: "open" as const, notes: [] as string[] });
const hoursSince = (iso: string) => Math.round((Date.now() - new Date(iso).getTime()) / 3_600_000);

/** Each officer's work today, from their loans and applications; approvals, payouts and invites for the admin */
function seedTasks(): Record<string, WorklistTask[]> {
  const lists: Record<string, WorklistTask[]> = {};
  for (const officer of officers) {
    const tasks: WorklistTask[] = [];
    const mine = loans.filter((loan) => loan.officerId === officer.id && loan.outstandingBalance > 0);
    // Instalments due today
    for (const loan of mine) {
      if (loan.daysPastDue > 0) continue;
      const borrower = borrowers.find((b) => b.currentLoanId === loan.id);
      const terms = borrower ? borrowerDetails.get(borrower.id)?.loanTerms : null;
      const next = terms ? nextPayment(terms, loan.outstandingBalance) : null;
      if (next?.dueOn === TODAY) tasks.push({ ...open(), id: `task-${loan.id}`, type: "instalment-due", priority: "routine", loanId: loan.id, borrower: borrowerOf(loan.id), amountDue: next.amount, amountPaid: 0 });
    }
    // Late loans to follow up (the recovery team has the long-overdue ones); a couple promised to pay today
    const late = mine.filter((loan) => loan.daysPastDue > 0 && !loan.recovery).sort((a, b) => b.daysPastDue - a.daysPastDue);
    late.forEach((loan, index) => {
      const base = { ...open(), id: `task-${loan.id}`, loanId: loan.id, borrower: borrowerOf(loan.id), amountDue: loan.arrearsAmount ?? 0, amountPaid: 0, daysPastDue: loan.daysPastDue, warning: signalFor(loan.id) };
      if (index % 4 === 1 && loan.daysPastDue <= 30) tasks.push({ ...base, type: "promise-due", priority: "do-first", promiseMadeOn: new Date(Date.now() - (2 + (index % 4)) * 86_400_000).toISOString().slice(0, 10) });
      else tasks.push({ ...base, type: "overdue", priority: loan.daysPastDue > 30 ? "do-first" : "do-today" });
    });
    // Applications they still have to finish
    for (const app of applications) {
      if (app.officerId !== officer.id || app.status !== "draft" || app.route === "online") continue;
      const missingItem = app.returned ? `Sent back: ${app.returned.reason}` : app.missing;
      if (!missingItem) continue;
      tasks.push({ ...open(), id: `task-${app.id}`, type: "application-incomplete", priority: "do-today", applicationId: app.id, borrower: { name: app.borrowerName, phone: app.phone }, amountRequested: app.amount, purpose: "", missingItem });
    }
    lists[officer.id] = tasks;
  }

  const officerName = (id: string) => officers.find((o) => o.id === id)?.name ?? "";
  const admin: WorklistTask[] = [];
  for (const app of applications) {
    if (app.status === "submitted" && app.submittedAt) {
      const hoursWaiting = hoursSince(app.submittedAt);
      admin.push({ ...open(), id: `task-apr-${app.id}`, type: "awaiting-approval", priority: hoursWaiting > 48 ? "do-first" : "routine", applicationId: app.id, borrower: { name: app.borrowerName, phone: app.phone }, amountRequested: app.amount, purpose: "", submittedBy: officerName(app.officerId), hoursWaiting });
    }
    if (app.status === "approved" && !app.loanId && app.decided)
      admin.push({ ...open(), id: `task-dis-${app.id}`, type: "awaiting-disbursement", priority: "do-today", loanId: app.id, borrower: { name: app.borrowerName, phone: app.phone }, amount: app.amount, officerName: officerName(app.officerId), approvedOn: app.decided.at.slice(0, 10) });
  }
  for (const member of staff) {
    if (member.status === "invited" && member.invite)
      admin.push({ ...open(), id: `task-acc-${member.id}`, type: "access-request", priority: "routine", user: { name: member.name, role: roles[member.roleId]?.name ?? "" }, kind: "invite-pending", requestedAt: member.invite.sentAt });
  }
  lists[ADMIN_ID] = admin;
  return lists;
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
