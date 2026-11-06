// The audit log for the mock API: a month of history taken from the sample data (sign-ins, payments,
// approvals, payouts, ID and document views), plus everything done in the demo.
import type { AuditCategory } from "../api/types";
import "./seed";
import { activityLog, applications, loans, roles, type MockAuditEntry } from "./fixtures";
import { borrowers } from "./borrowerDirectory";
import { pastLoans } from "./loanHistory";
import { loanPayments } from "./loanPayments";
import { staff } from "./staff";

let seed = 20261101;
const random = () => {
  seed = (seed * 9301 + 49297) % 233280;
  return seed / 233280;
};
const pick = <T,>(list: T[]) => list[Math.floor(random() * list.length)];
const ugx = (amount: number) => `UGX ${amount.toLocaleString("en-US")}`;

/** What kind of event a description is, for the Type filter */
export function categoryOf(description: string): AuditCategory {
  const d = description.toLowerCase();
  if (/^(signed in|signed out|failed sign-in)/.test(d)) return "signin";
  if (/^(viewed|downloaded|exported|opened draft)/.test(d)) return "access";
  if (/^(recorded|disbursed)/.test(d)) return "money";
  if (/^(approved|rejected|sent .* back|sent .* to recovery|brought .* back)/.test(d) || /recovery/.test(d)) return "decisions";
  if (/(role|invite|account|settings|loan product|staff|market)/.test(d)) return "admin";
  return "borrowers";
}

/** The loan or application an event is about, for a link */
export function targetOf(description: string) {
  const loan = description.match(/\bTL-\d+/)?.[0];
  if (loan) return { label: loan, href: `/loans/${loan}` };
  const app = description.match(/\bAPP-\d+/)?.[0];
  if (app) return { label: app, href: `/applications/${app}` };
  return null;
}

/** A month of history, from what happened in the sample data: payments, payouts, decisions, sign-ins */
function seedHistory() {
  const active = staff.filter((member) => member.status === "active");
  const officerStaff = active.filter((member) => member.roleId === "loan_officer");
  const byName = (name: string) => staff.find((member) => member.name === name);
  const entry = (member: (typeof staff)[number] | undefined, description: string, at: string): MockAuditEntry | null =>
    member ? { id: `seed-${new Date(at).getTime()}-${member.id}-${(entryNumber += 1)}`, actor: { id: member.id, name: member.name, role: roles[member.roleId]?.name ?? "", photoUrl: member.photoUrl }, description, at } : null;
  let entryNumber = 0;
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const atHour = (daysAgo: number, hour: number) => {
    const date = new Date(Date.now() - daysAgo * 86_400_000);
    date.setHours(hour, Math.floor(random() * 60), 0, 0);
    return date.toISOString();
  };
  const history: (MockAuditEntry | null)[] = [];

  // Sign-ins on working days
  for (let daysAgo = 0; daysAgo < 30; daysAgo++)
    for (const member of active) if (random() > 0.15) history.push(entry(member, "signed in", atHour(daysAgo, 7 + Math.floor(random() * 2))));

  // Every repayment recorded, by the client's loan officer
  const allLoans = [...loans.map((loan) => ({ id: loan.id, officerId: loan.officerId })), ...pastLoans.map((past) => ({ id: past.id, officerId: borrowers.find((b) => b.id === past.borrowerId)?.officerId ?? "" }))];
  for (const loan of allLoans) {
    const officer = staff.find((member) => member.id === loan.officerId);
    for (const payment of loanPayments(loan.id)) if (payment.paidAt >= since) history.push(entry(officer, `recorded ${ugx(payment.amount)} on ${loan.id} · ${payment.method}`, payment.paidAt));
  }

  // Payouts and approvals of the loans paid out this month
  for (const loan of loans) {
    if (!loan.payout || loan.payout.paidOn < since.slice(0, 10)) continue;
    const payer = byName(loan.payout.by);
    const approver = byName(loan.payout.by === "Moses Okot" ? "Joan Nansubuga" : "Moses Okot");
    history.push(entry(approver, `approved the application for ${loan.id} (${loan.borrowerName})`, new Date(new Date(`${loan.payout.paidOn}T11:00:00`).getTime() - 86_400_000).toISOString()));
    history.push(entry(payer, `disbursed ${loan.id} · ${loan.payout.method} ${loan.payout.reference}`, new Date(`${loan.payout.paidOn}T14:${String(Math.floor(random() * 60)).padStart(2, "0")}:00`).toISOString()));
    if (loan.recovery && loan.recovery.since >= since) history.push(entry(byName(loan.recovery.by), `sent ${loan.id} (${loan.borrowerName}) to recovery: ${loan.recovery.reason}`, loan.recovery.since));
  }
  for (const loan of loans) if (loan.recovery && loan.recovery.since >= since && (!loan.payout || loan.payout.paidOn < since.slice(0, 10))) history.push(entry(byName(loan.recovery.by), `sent ${loan.id} (${loan.borrowerName}) to recovery: ${loan.recovery.reason}`, loan.recovery.since));

  // Applications: started, submitted, decided
  for (const app of applications) {
    const officer = staff.find((member) => member.id === app.officerId);
    if (app.createdAt) history.push(entry(officer, `started application ${app.id} · ${ugx(app.amount)}`, app.createdAt));
    if (app.submittedAt) history.push(entry(officer, `submitted ${app.id} for approval`, app.submittedAt));
    if (app.decided) history.push(entry(byName(app.decided.by), `${app.status === "rejected" ? "rejected" : "approved"} ${app.id} · ${ugx(app.amount)}`, app.decided.at));
    if (app.returned && app.status !== "rejected") history.push(entry(byName(app.returned.by), `sent ${app.id} back: ${app.returned.reason}`, app.returned.at));
  }

  // Some ID and document views
  for (let daysAgo = 0; daysAgo < 30; daysAgo++) {
    if (random() > 0.4) history.push(entry(pick(officerStaff), `viewed the National ID of ${pick(loans).borrowerName}`, atHour(daysAgo, 10 + Math.floor(random() * 6))));
    if (random() > 0.6) history.push(entry(byName("Moses Okot"), `viewed the signed loan application of ${pick(loans).borrowerName}`, atHour(daysAgo, 11 + Math.floor(random() * 5))));
  }

  const now = Date.now();
  activityLog.push(...history.filter((item): item is MockAuditEntry => !!item && new Date(item.at).getTime() <= now));
  activityLog.sort((a, b) => b.at.localeCompare(a.at));
}

seedHistory();
