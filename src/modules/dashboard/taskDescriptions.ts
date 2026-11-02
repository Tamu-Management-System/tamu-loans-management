// Words shown for each kind of worklist task. Kept apart from the components so
// the row and the "Done today" list describe tasks the same way.
import type { WorklistTask } from "../../api/types";
import { daysSince, formatRelativeDay, formatShortDate, formatTime, formatUGX } from "../../lib/format";

export type ChipTone = "info" | "warning" | "danger";

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

/** Who or what the task is about: name, reference and a detail line. */
export function describeSubject(task: WorklistTask): { name: string; reference: string; detail: string } {
  switch (task.type) {
    case "instalment-due":
    case "promise-due":
    case "overdue":
      return { name: task.borrower.name, reference: task.loanId, detail: [task.borrower.phone, task.borrower.area].filter(Boolean).join(" · ") };
    case "application-incomplete":
      return { name: task.borrower.name, reference: task.applicationId, detail: `${task.purpose} · ${task.borrower.phone}` };
    case "payment-unmatched":
      return { name: `${task.payment.provider} payment`, reference: task.payment.reference, detail: `From ${task.payment.phone} · received ${formatTime(task.payment.receivedAt)}` };
    case "reversal-request":
      return { name: task.requestedBy, reference: task.loanId, detail: `Wants ${formatUGX(task.amount)} reversed · ${task.reason}` };
    case "awaiting-approval":
      return { name: task.borrower.name, reference: task.applicationId, detail: `${task.purpose} · submitted by ${task.submittedBy}` };
    case "awaiting-disbursement": {
      const approved = daysSince(task.approvedOn) === 1 ? "yesterday" : `on ${formatShortDate(task.approvedOn)}`;
      return { name: task.borrower.name, reference: task.loanId, detail: `Approved by Finance ${approved} · ${task.officerName}'s borrower` };
    }
    case "access-request":
      return {
        name: task.user.name,
        reference: task.user.role,
        detail:
          task.kind === "password-reset"
            ? `Asked for a password reset at ${formatTime(task.requestedAt)}`
            : `Invited ${plural(daysSince(task.requestedAt), "day")} ago · hasn't signed in yet`,
      };
  }
}

/** Status chip and the line under it. */
export function describeStatus(task: WorklistTask): { tone: ChipTone; label: string; detail: string } {
  switch (task.type) {
    case "instalment-due":
      return { tone: "info", label: "Due today", detail: "Installment" };
    case "promise-due":
      return { tone: "warning", label: "Promised to pay today", detail: `Promise made ${formatShortDate(task.promiseMadeOn)} · ${task.daysPastDue} days late` };
    case "overdue":
      return { tone: task.daysPastDue > 30 ? "danger" : "warning", label: `${task.daysPastDue} days overdue`, detail: "Arrears to collect" };
    case "application-incomplete":
      return { tone: "warning", label: task.missingItem, detail: "Draft application" };
    case "payment-unmatched":
      return { tone: "warning", label: "Not matched", detail: "Find whose payment this is" };
    case "reversal-request":
      return { tone: task.priority === "do-first" ? "danger" : "warning", label: "Reversal request", detail: `Requested ${formatRelativeDay(task.requestedAt)}` };
    case "awaiting-approval":
      return { tone: task.hoursWaiting > 48 ? "danger" : "info", label: `Waiting ${task.hoursWaiting} hours`, detail: "Finance hasn't decided yet" };
    case "awaiting-disbursement": {
      const days = daysSince(task.approvedOn);
      return { tone: days >= 3 ? "danger" : "warning", label: `Approved ${plural(days, "day")} ago`, detail: "Not yet disbursed" };
    }
    case "access-request":
      return task.kind === "password-reset"
        ? { tone: "info", label: "Password reset", detail: "User request" }
        : { tone: "warning", label: "Invite not accepted", detail: "New user" };
  }
}

/** Label under the amount, if any. */
export function amountLabel(task: WorklistTask): string | null {
  switch (task.type) {
    case "instalment-due":
    case "promise-due":
    case "overdue":
      return task.amountPaid > 0 ? `${formatUGX(task.amountPaid)} paid of ${formatUGX(task.amountDue)}` : null;
    case "application-incomplete":
    case "awaiting-approval":
      return "Requested";
    case "reversal-request":
      return "To reverse";
    case "awaiting-disbursement":
      return "To pay out";
    default:
      return null;
  }
}
