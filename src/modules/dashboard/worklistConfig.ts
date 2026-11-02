import type { WorklistPriority, WorklistTask, WorklistTaskType } from "../../api/types";
import type { WorklistFilter } from "./worklistFilter";

/** Which group (and tab) each kind of task belongs to. */
export const TASK_GROUP: Record<WorklistTaskType, WorklistFilter> = {
  "instalment-due": "collect",
  "promise-due": "collect",
  overdue: "follow-up",
  "application-incomplete": "complete",
  "payment-unmatched": "match",
  "reversal-request": "reversals",
  "awaiting-approval": "approvals",
  "awaiting-disbursement": "disbursement",
  "access-request": "access",
};

export interface WorklistGroup {
  id: WorklistFilter;
  title: string;
  description: string;
  tabLabel: string;
  /** Word after the group's total, e.g. "UGX 1,240,000 expected"; null = no total */
  amountSuffix: string | null;
  /** Phase 2 groups are previewed under a "Coming soon" overlay */
  upcoming?: { feature: string; module: string; previewDescription: string };
}

// Order of the "All" overview, as in the approved design
export const WORKLIST_GROUPS: WorklistGroup[] = [
  {
    id: "match",
    title: "Match payments",
    description: "Money already received. Match it before chasing anyone.",
    tabLabel: "Match",
    amountSuffix: "received",
    upcoming: {
      feature: "Automatic payment matching",
      module: "Module 4 · Mobile Money reconciliation",
      previewDescription: "Mobile money received, matched to loans automatically",
    },
  },
  { id: "collect", title: "Collect today", description: "Promises to pay and installments due today", tabLabel: "Collect", amountSuffix: "expected" },
  { id: "follow-up", title: "Follow up overdue loans", description: "Borrowers behind on payments", tabLabel: "Follow up", amountSuffix: "in arrears" },
  { id: "complete", title: "Complete applications", description: "Drafts missing documents before Finance can approve them", tabLabel: "Complete", amountSuffix: "requested" },
  { id: "reversals", title: "Payment reversals", description: "Officers asking to undo a recorded payment", tabLabel: "Reversals", amountSuffix: "to reverse" },
  { id: "approvals", title: "Waiting for approval", description: "Submitted applications not decided yet", tabLabel: "Approvals", amountSuffix: "requested" },
  { id: "disbursement", title: "Approved, not yet disbursed", description: "Borrowers still waiting for their money", tabLabel: "Disbursement", amountSuffix: "to pay out" },
  { id: "access", title: "Users & access", description: "Requests from your team", tabLabel: "Access", amountSuffix: null },
];

/** Most tasks a group shows in the "All" overview; reaching it adds a "Show all" link. */
export const MAX_ROWS_PER_GROUP = 3;

const PRIORITY_RANK: Record<WorklistPriority, number> = { "do-first": 3, "do-today": 2, routine: 1 };

export const PRIORITY_LABEL: Record<WorklistPriority, string> = { "do-first": "Do first", "do-today": "Do today", routine: "Routine" };

/** UGX still to act on for a task, or null when it has no amount. */
export function taskAmount(task: WorklistTask): number | null {
  switch (task.type) {
    case "instalment-due":
    case "promise-due":
    case "overdue":
      return Math.max(0, task.amountDue - task.amountPaid);
    case "application-incomplete":
    case "awaiting-approval":
      return task.amountRequested;
    case "payment-unmatched":
      return task.payment.amount;
    case "reversal-request":
    case "awaiting-disbursement":
      return task.amount;
    case "access-request":
      return null;
  }
}

/** Most urgent first, then the largest amount. */
export function byUrgency(a: WorklistTask, b: WorklistTask) {
  return PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority] || (taskAmount(b) ?? 0) - (taskAmount(a) ?? 0);
}
