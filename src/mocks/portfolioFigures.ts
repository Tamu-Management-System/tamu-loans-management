// Portfolio figures (PAR, arrears, collection rate, early warnings, team performance) worked out
// from the loans themselves, so the dashboard always agrees with the loan lists. The backend must
// calculate them the same way (docs/api-contract.md).
import type { RepaymentSchedule } from "../api/types";
import { paymentDate } from "../lib/repaymentSchedule";
import { borrowerDetails } from "./borrowerProfiles";
import { borrowers } from "./borrowerDirectory";
import { loans, officers } from "./fixtures";
import { pastLoans } from "./loanHistory";
import { loanPayments } from "./loanPayments";
import { dayCount } from "../lib/format";
import { systemSettings } from "./systemSettings";

/** Whose loans: an officer's own, or everyone's */
export type OfficerFilter = (officerId: string) => boolean;

const localDay = (iso: string) => (iso.length === 10 ? iso : new Date(iso).toLocaleDateString("en-CA"));
const today = () => new Date().toLocaleDateString("en-CA");
const daysBetween = (from: string, to: string) => Math.round((new Date(`${to}T00:00:00`).getTime() - new Date(`${from}T00:00:00`).getTime()) / 86_400_000);

interface LedgerLoan {
  id: string;
  officerId: string;
  borrowerName: string;
  disbursedOn: string;
  totalRepayable: number;
  repaymentSchedule: RepaymentSchedule;
  /** Each instalment's due date and amount */
  instalments: { dueOn: string; amount: number }[];
}

const instalmentsOf = (schedule: { firstPaymentOn: string; numberOfPayments: number; instalment: number }, repaymentSchedule: RepaymentSchedule, total: number) =>
  Array.from({ length: schedule.numberOfPayments }, (_, index) => ({
    dueOn: paymentDate(schedule.firstPaymentOn, repaymentSchedule, index),
    amount: index === schedule.numberOfPayments - 1 ? total - schedule.instalment * (schedule.numberOfPayments - 1) : schedule.instalment,
  }));

/** Every loan with a schedule: current ones and those already repaid */
function ledger(): LedgerLoan[] {
  const list: LedgerLoan[] = [];
  const byLoan = new Map(borrowers.filter((b) => b.currentLoanId).map((b) => [b.currentLoanId!, b]));
  const byId = new Map(borrowers.map((b) => [b.id, b]));
  for (const loan of loans) {
    const borrower = byLoan.get(loan.id);
    const terms = borrower ? borrowerDetails.get(borrower.id)?.loanTerms : null;
    if (!terms?.schedule) continue;
    list.push({ id: loan.id, officerId: loan.officerId, borrowerName: loan.borrowerName, disbursedOn: terms.disbursedOn, totalRepayable: terms.totalRepayable, repaymentSchedule: terms.repaymentSchedule, instalments: instalmentsOf(terms.schedule, terms.repaymentSchedule, terms.totalRepayable) });
  }
  for (const past of pastLoans) {
    const borrower = byId.get(past.borrowerId);
    if (!borrower) continue;
    list.push({ id: past.id, officerId: borrower.officerId, borrowerName: borrower.name, disbursedOn: past.disbursedOn, totalRepayable: past.totalRepayable, repaymentSchedule: past.repaymentSchedule, instalments: instalmentsOf(past.schedule, past.repaymentSchedule, past.totalRepayable) });
  }
  return list;
}

/** A loan as it stood at the start of a day: what was owed, and how many days the oldest unpaid instalment was late */
function stateAt(loan: LedgerLoan, date: string) {
  if (loan.disbursedOn >= date) return null;
  const paid = loanPayments(loan.id).filter((p) => localDay(p.paidAt) < date).reduce((sum, p) => sum + p.amount, 0);
  const outstanding = loan.totalRepayable - paid;
  if (outstanding <= 0) return null;
  let covered = paid;
  const oldestUnpaid = loan.instalments.find((instalment) => (covered -= instalment.amount) < 0);
  const daysLate = oldestUnpaid && oldestUnpaid.dueOn < date ? daysBetween(oldestUnpaid.dueOn, date) : 0;
  return { outstanding, daysLate };
}

const percent = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 1000) / 10 : 0);

/** PAR30 on a given day (or today): the share of what's owed that's in loans over 30 days late */
function par30At(filter: OfficerFilter, date: string, book = ledger()) {
  let outstanding = 0;
  let late = 0;
  for (const loan of book) {
    if (!filter(loan.officerId)) continue;
    const state = stateAt(loan, date);
    if (!state) continue;
    outstanding += state.outstanding;
    if (state.daysLate > 30) late += state.outstanding;
  }
  return percent(late, outstanding);
}

/** The open loans now (with what's been recorded in the demo) */
const openLoans = (filter: OfficerFilter) => loans.filter((loan) => filter(loan.officerId) && loan.outstandingBalance > 0);

export function riskNow(filter: OfficerFilter) {
  const open = openLoans(filter);
  const outstanding = open.reduce((sum, loan) => sum + loan.outstandingBalance, 0);
  const over = (days: number) => open.filter((loan) => loan.daysPastDue > days);
  const amount = (list: typeof open) => list.reduce((sum, loan) => sum + loan.outstandingBalance, 0);
  return {
    loanCount: open.length,
    par1Percent: percent(amount(over(0)), outstanding),
    par30Percent: percent(amount(over(30)), outstanding),
    par90Percent: percent(amount(over(90)), outstanding),
    amountOver30Days: amount(over(30)),
    loansOver30Days: over(30).length,
  };
}

/** PAR30 at the start of each of the last 12 months (the last is today), and every week in between */
export function par30History(filter: OfficerFilter) {
  const book = ledger();
  const now = new Date();
  const monthly = Array.from({ length: 12 }, (_, index) => {
    const first = new Date(now.getFullYear(), now.getMonth() - 11 + index, 1);
    const month = `${first.getFullYear()}-${String(first.getMonth() + 1).padStart(2, "0")}`;
    return { month, par30Percent: index === 11 ? riskNow(filter).par30Percent : par30At(filter, `${month}-01`, book) };
  });
  const weekly: { date: string; par30Percent: number }[] = [];
  for (let date = `${monthly[0].month}-01`; date < today(); date = paymentDate(date, "daily", 7)) weekly.push({ date, par30Percent: par30At(filter, date, book) });
  weekly.push({ date: today(), par30Percent: riskNow(filter).par30Percent });
  return { monthly, weekly };
}

/** What's owed, split into up to date and how late; and the share of what fell due in the last 30 days that was paid */
export function arrears(filter: OfficerFilter) {
  const open = openLoans(filter);
  const band = (low: number, high: number) => open.filter((loan) => loan.daysPastDue >= low && loan.daysPastDue <= high);
  const sum = (list: typeof open) => list.reduce((total, loan) => total + loan.outstandingBalance, 0);
  const current = band(0, 0);
  return {
    totalOutstanding: sum(open),
    current: { amount: sum(current), loans: current.length },
    bands: [
      { label: "1–30 days", list: band(1, 30) },
      { label: "31–60 days", list: band(31, 60) },
      { label: "61–90 days", list: band(61, 90) },
      { label: "90+ days", list: band(91, Infinity) },
    ].map(({ label, list }) => ({ label, amount: sum(list), loans: list.length })),
    collectionRatePercent: collectionRate(filter, 30),
  };
}

/**
 * Of the instalments that fell due in the last `days` days (before today), the share that has been paid.
 * Payments cover each loan's instalments oldest first, so money that only catches up older arrears doesn't
 * count towards this period, and a missed instalment always pulls the rate below 100%.
 */
export function collectionRate(filter: OfficerFilter, days: number) {
  const from = paymentDate(today(), "daily", -days);
  let due = 0;
  let collected = 0;
  for (const loan of ledger()) {
    if (!filter(loan.officerId)) continue;
    let covered = loanPayments(loan.id).filter((p) => localDay(p.paidAt) < today()).reduce((sum, p) => sum + p.amount, 0);
    for (const instalment of loan.instalments) {
      const paid = Math.min(instalment.amount, Math.max(0, covered));
      covered -= instalment.amount;
      if (instalment.dueOn < from || instalment.dueOn >= today()) continue;
      due += instalment.amount;
      collected += paid;
    }
  }
  return percent(collected, due);
}

/** Instalments falling due on a day (or in a range), still to be paid */
export function dueBetween(filter: OfficerFilter, from: string, to: string) {
  let amount = 0;
  const books = new Map(ledger().map((entry) => [entry.id, entry]));
  for (const loan of loans) {
    if (!filter(loan.officerId) || loan.outstandingBalance <= 0) continue;
    const book = books.get(loan.id);
    if (!book) continue;
    let covered = book.totalRepayable - loan.outstandingBalance;
    for (const instalment of book.instalments) {
      const left = Math.max(0, instalment.amount - Math.max(0, covered));
      covered -= instalment.amount;
      if (instalment.dueOn >= from && instalment.dueOn <= to) amount += left;
    }
  }
  return amount;
}

/** Warning signs on late loans, most serious first: worked out from their payments */
export function earlyWarnings(filter: OfficerFilter) {
  const warnings: { loanId: string; signal: string; daysPastDue: number }[] = [];
  for (const loan of openLoans(filter)) {
    // A day or two late isn't a warning sign yet (Loan rules → Early warning)
    if (loan.daysPastDue < systemSettings.loanRules.earlyWarningDays || loan.recovery) continue;
    const payments = loanPayments(loan.id);
    const lastPaid = payments[0] ? localDay(payments[0].paidAt) : null;
    const quiet = lastPaid ? daysBetween(lastPaid, today()) : null;
    let signal: string;
    if (loan.daysPastDue >= 25 && loan.daysPastDue <= 30) signal = `Moves past 30 days late in ${31 - loan.daysPastDue} day${31 - loan.daysPastDue === 1 ? "" : "s"}`;
    else if (quiet === null) signal = "No payment since the loan was paid out";
    else if (quiet >= 14) signal = `No payment for ${quiet} days`;
    else signal = `${dayCount(loan.daysPastDue)} behind; last paid ${quiet === 0 ? "today" : `${quiet} day${quiet === 1 ? "" : "s"} ago`}`;
    warnings.push({ loanId: loan.id, signal, daysPastDue: loan.daysPastDue });
  }
  return warnings.sort((a, b) => b.daysPastDue - a.daysPastDue);
}

/** An officer's own portfolio at a glance */
export function officerSummary(officerId: string) {
  const mine: OfficerFilter = (id) => id === officerId;
  const open = openLoans(mine);
  const monthStart = `${today().slice(0, 7)}-01`;
  const thisMonth = ledger().filter((loan) => loan.officerId === officerId && loan.disbursedOn >= monthStart);
  const weekEnd = paymentDate(today(), "daily", 6);
  return {
    outstandingBalance: open.reduce((sum, loan) => sum + loan.outstandingBalance, 0),
    activeLoans: open.length,
    disbursedThisMonth: { amount: thisMonth.reduce((sum, loan) => sum + principalOf(loan.id), 0), count: thisMonth.length },
    clearedThisMonth: pastLoans.filter((past) => past.clearedOn >= monthStart && borrowers.find((b) => b.id === past.borrowerId)?.officerId === officerId).length,
    cleared: (() => {
      const done = pastLoans.filter((past) => borrowers.find((b) => b.id === past.borrowerId)?.officerId === officerId);
      return { count: done.length, amount: done.reduce((sum, past) => sum + past.totalRepayable, 0) };
    })(),
    dueThisWeek: dueBetween(mine, today(), weekEnd),
  };
}

const principalOf = (loanId: string) => {
  const past = pastLoans.find((p) => p.id === loanId);
  if (past) return past.principal;
  const borrower = borrowers.find((b) => b.currentLoanId === loanId);
  return (borrower && borrowerDetails.get(borrower.id)?.loanTerms?.principal) || 0;
};

/** Each officer: what they look after, how much is late, and what's due today */
export function teamPerformance() {
  return officers.map((officer) => {
    const mine: OfficerFilter = (id) => id === officer.id;
    const risk = riskNow(mine);
    return {
      officerId: officer.id,
      name: officer.name,
      photoUrl: officer.photoUrl,
      portfolioAmount: openLoans(mine).reduce((sum, loan) => sum + loan.outstandingBalance, 0),
      loanCount: risk.loanCount,
      par30Percent: risk.par30Percent,
      expectedToday: dueBetween(mine, today(), today()),
    };
  });
}
