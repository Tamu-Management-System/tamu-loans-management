// Each client's timeline: a seeded history (registration, documents, loans, payments, calls) built
// on first use, plus everything done in this session (payments, edits, uploads, ID and document views).
import type { BorrowerActivityCategory, BorrowerActivityItem } from "../api/types";
import type { MockBorrower } from "./borrowerDirectory";
import { borrowerDocumentsResponse } from "./borrowerDocuments";
import { borrowerDetails } from "./borrowerProfiles";
import { loanPayments } from "./loanPayments";
import { applications, loans, officers } from "./fixtures";
import { pastLoans } from "./loanHistory";

type Actor = BorrowerActivityItem["actor"];

const DAY_MS = 86_400_000;
const SESSION_STARTED = Date.now();
const FINANCE: Actor = { name: "Joan Nansubuga", role: "Finance" };
const SYSTEM: Actor = { name: "Tamu Loans", role: "Automatic" };
const ugx = (amount: number) => `UGX ${amount.toLocaleString("en-US")}`;

const timelines = new Map<string, BorrowerActivityItem[]>();
let nextEventNumber = 1;

function seededRandom(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const seedFrom = (text: string) => [...text].reduce((hash, char) => (Math.imul(hash, 31) + char.charCodeAt(0)) | 0, 41);

const event = (category: BorrowerActivityCategory, description: string, actor: Actor, at: number | string): BorrowerActivityItem => ({
  id: `EV-${nextEventNumber++}`,
  category,
  description,
  actor,
  at: typeof at === "number" ? new Date(at).toISOString() : at,
});

function seedTimeline(borrower: MockBorrower): BorrowerActivityItem[] {
  const random = seededRandom(seedFrom(borrower.id));
  const officer: Actor = { name: officers.find((o) => o.id === borrower.officerId)?.name ?? "Loan officer", role: "Loan officer" };
  const dayAt = (isoDate: string, hourFrom = 9, hours = 8) => new Date(`${isoDate}T00:00:00`).getTime() + (hourFrom + random() * hours) * 3_600_000;
  // People registered during the demo get their real events as they happen
  const items: BorrowerActivityItem[] = borrower.addedInSession ? [] : [event("changes", "Registered the client", officer, dayAt(borrower.registeredOn, 9, 2))];

  // Documents uploaded before this session (uploads in the session are recorded as they happen)
  for (const section of borrowerDocumentsResponse(borrower).sections) {
    for (const slot of section.slots) {
      if (slot.file && new Date(slot.file.uploadedAt).getTime() < SESSION_STARTED) {
        const what = `${slot.label}${section.id.includes("-") ? ` for ${section.id}` : ""}`;
        if (slot.file.method === "online") {
          // Completed through the link the officer sent
          items.push(event("changes", `Completed the loan application for ${section.id} online`, { name: slot.file.uploadedBy, role: "Client" }, slot.file.uploadedAt));
        } else {
          items.push(event("changes", `Uploaded ${what}${slot.canCompleteOnline ? " (scanned paper)" : ""}`, { name: slot.file.uploadedBy, role: "Loan officer" }, slot.file.uploadedAt));
        }
      }
    }
  }

  // Each loan, repaid or current: applied, approved, paid out, every payment, calls when it fell behind, repaid
  const loanEvents = (loanId: string, principal: number, disbursedOn: string, payoutBy: string) => {
    const disbursed = dayAt(disbursedOn, 10, 6);
    items.push(event("changes", `Applied for ${loanId} · ${ugx(principal)}`, officer, disbursed - 3 * DAY_MS));
    items.push(event("changes", `Approved ${loanId}`, FINANCE, disbursed - DAY_MS));
    items.push(event("money", `Disbursed ${ugx(principal)} for ${loanId} · MTN MoMo`, { name: payoutBy, role: "Finance" }, disbursed));
    for (const payment of loanPayments(loanId).filter((p) => new Date(p.paidAt).getTime() < SESSION_STARTED))
      items.push(event("money", `Recorded ${ugx(payment.amount)} on ${loanId} · ${payment.method}`, officer, payment.paidAt));
  };

  for (const past of pastLoans.filter((l) => l.borrowerId === borrower.id)) {
    loanEvents(past.id, past.principal, past.disbursedOn, FINANCE.name);
    if (past.mostDaysLate > 3) items.push(event("contact", `Called about ${past.id}: promised to pay`, officer, dayAt(past.clearedOn, 9, 2) - 2 * DAY_MS));
    items.push(event("money", `${past.id} repaid in full and closed`, SYSTEM, dayAt(past.clearedOn, 17, 1)));
  }

  const loan = borrower.currentLoanId ? loans.find((l) => l.id === borrower.currentLoanId) : undefined;
  const terms = borrowerDetails.get(borrower.id)?.loanTerms;
  // Loans paid out in the demo (made from an application) get their real events as they happen
  if (loan && terms && !loan.applicationId) {
    loanEvents(loan.id, terms.principal, terms.disbursedOn, loan.payout?.by ?? FINANCE.name);
    if (loan.daysPastDue > 0) {
      items.push(event("contact", `Called about ${loan.id}: no answer`, officer, Date.now() - Math.min(loan.daysPastDue - 1, 6) * DAY_MS));
      if (loan.daysPastDue > 3) items.push(event("contact", `Called about ${loan.id}: promised to pay`, officer, Date.now() - Math.min(loan.daysPastDue - 2, 3) * DAY_MS));
    }
    if (loan.recovery) items.push(event("changes", `Sent ${loan.id} to recovery: ${loan.recovery.reason}`, { name: loan.recovery.by, role: "Finance" }, loan.recovery.since));
  }

  const application = borrower.applicationId ? applications.find((a) => a.id === borrower.applicationId) : undefined;
  if (application) items.push(event("changes", `Started application ${application.id} · ${ugx(application.amount)}`, officer, dayAt(borrower.registeredOn, 11, 4)));

  return items.filter((item) => new Date(item.at).getTime() <= Date.now());
}

function timelineFor(borrower: MockBorrower) {
  let timeline = timelines.get(borrower.id);
  if (!timeline) {
    timeline = seedTimeline(borrower);
    timelines.set(borrower.id, timeline);
  }
  return timeline;
}

/** Adds something done now to the client's timeline. */
export function recordBorrowerEvent(borrower: MockBorrower, category: BorrowerActivityCategory, description: string, actor: Actor) {
  timelineFor(borrower).push(event(category, description, actor, Date.now()));
}

/** Newest first, optionally one category, in pages (older pages via `before`). */
export function borrowerActivityPage(borrower: MockBorrower, category: BorrowerActivityCategory | null, before: string | null, pageSize: number) {
  const matching = timelineFor(borrower)
    .filter((item) => (!category || item.category === category) && (!before || item.at < before))
    // Newest first; events at the same moment in the order they happened (later one first)
    .sort((a, b) => b.at.localeCompare(a.at) || Number(b.id.slice(3)) - Number(a.id.slice(3)));
  const items = matching.slice(0, pageSize);
  return { items, nextBefore: matching.length > pageSize ? items[items.length - 1].at : null };
}
