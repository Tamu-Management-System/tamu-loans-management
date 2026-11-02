// The audit log for the mock API: a month of sample history (sign-ins, payments, approvals, payouts,
// ID and document views), plus everything done in the demo. Fixed seed, so it's the same every time.
import type { AuditCategory } from "../api/types";
import { activityLog, loans, roles, type MockAuditEntry } from "./fixtures";
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
  if (/(role|invite|account|settings|loan product|staff)/.test(d)) return "admin";
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

/** A month of history behind the demo's own entries */
function seedHistory() {
  const active = staff.filter((member) => member.status === "active");
  const officers = active.filter((member) => member.roleId === "loan_officer");
  const finance = active.filter((member) => roles[member.roleId]?.permissions.includes("loans.disburse"));
  const entry = (member: (typeof staff)[number], description: string, hoursAgo: number): MockAuditEntry => ({
    id: `seed-${Math.round(hoursAgo * 1000)}-${member.id}`,
    actor: { id: member.id, name: member.name, role: roles[member.roleId]?.name ?? "", photoUrl: member.photoUrl },
    description,
    at: new Date(Date.now() - hoursAgo * 3_600_000).toISOString(),
  });
  const history: MockAuditEntry[] = [];
  for (let day = 0; day < 30; day++) {
    // Working hours: 8 am to 5 pm
    const at = (hour: number) => day * 24 + (new Date().getHours() - hour) + random() * 0.9;
    for (const member of active) if (day > 0 || random() > 0.4) history.push(entry(member, "signed in", at(8 + random())));
    for (let i = 0; i < 4; i++) {
      const loan = pick(loans);
      const officer = officers.find((o) => o.id === loan.officerId) ?? pick(officers);
      history.push(entry(officer, `recorded ${ugx(Math.round((50_000 + random() * 400_000) / 1000) * 1000)} on ${loan.id}`, at(9 + random() * 7)));
    }
    if (random() > 0.3) history.push(entry(pick(officers), `viewed the National ID of ${pick(loans).borrowerName}`, at(10 + random() * 6)));
    if (random() > 0.5) history.push(entry(pick(finance), `viewed the signed loan application of ${pick(loans).borrowerName}`, at(11 + random() * 5)));
    if (random() > 0.6) history.push(entry(pick(finance), `approved APP-${200 + day} · ${ugx(Math.round(5 + random() * 30) * 100_000)}`, at(12 + random() * 4)));
    if (random() > 0.7) history.push(entry(pick(finance), `disbursed TL-${900 + day} · ${ugx(Math.round(5 + random() * 30) * 100_000)} (MTN MoMo)`, at(13 + random() * 3)));
    if (random() > 0.85) history.push(entry(pick(officers), `failed sign-in (wrong password)`, at(8)));
  }
  // Only before the demo's own entries (the newest is a few hours old)
  const oldest = Math.min(...activityLog.map((item) => new Date(item.at).getTime()));
  activityLog.push(...history.filter((item) => new Date(item.at).getTime() < oldest));
  activityLog.sort((a, b) => b.at.localeCompare(a.at));
}

seedHistory();
