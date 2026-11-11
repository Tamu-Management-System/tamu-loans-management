// The texts a client gets on their own phone: built from the loan's payout, its payments and its next payment.
// The wording is the server's; Settings → Notifications only switches each text on or off and sets the reminder timing.
// The real backend sends and stores each text as it goes out.
import type { ClientMessage, ClientMessageEvent, LoanPayment, RepaymentSchedule } from "../api/types";
import { systemSettings } from "./systemSettings";

const ugx = (amount: number) => `UGX ${amount.toLocaleString("en-US")}`;
const day = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name;
const brand = () => systemSettings.business.shortName;

/** A few texts don't reach the phone; fixed per message so it doesn't change on refresh */
const failed = (id: string) => [...id].reduce((sum, char) => sum + char.charCodeAt(0), 0) % 11 === 0;

const on = (event: ClientMessageEvent) => systemSettings.notifications.clientMessages.rules.find((rule) => rule.event === event)?.enabled ?? false;

/** The date a reminder goes for a payment due on `dueOn`: the Settings number of days before it */
export function reminderDate(dueOn: string, schedule: RepaymentSchedule | null) {
  const days = schedule ? systemSettings.notifications.clientMessages.reminderDaysBefore[schedule] : 0;
  const date = new Date(`${dueOn}T00:00:00`);
  date.setDate(date.getDate() - days);
  return date.toLocaleDateString("en-CA");
}

export function clientMessagesFor(loan: {
  id: string;
  borrowerName: string;
  schedule: RepaymentSchedule | null;
  principal: number;
  payout: { paidOn: string } | null;
  firstPaymentOn: string | null;
  payments: (LoanPayment & { balanceAfter?: number })[];
  balance: number;
  nextPayment: { dueOn: string; amount: number } | null;
}): ClientMessage[] {
  const name = firstName(loan.borrowerName);
  const messages: ClientMessage[] = [];
  const add = (event: ClientMessageEvent, at: string, text: string, scheduled = false) => {
    const id = `${event}-${loan.id}-${at}`;
    messages.push({ id, event, at, message: `${brand()} Loans: ${text}`, delivery: scheduled ? "scheduled" : failed(id) ? "failed" : "sent" });
  };
  if (on("payout") && loan.payout) {
    add("payout", `${loan.payout.paidOn}T09:00:00`, `Hello ${name}, ${ugx(loan.principal)} has been sent to your phone.${loan.firstPaymentOn ? ` Your first payment is due on ${day(loan.firstPaymentOn)}.` : ""}`);
  }
  if (on("payment")) {
    // The balance after each payment: what is left now, plus the payments made after it
    let after = loan.balance;
    for (const payment of loan.payments) {
      add("payment", payment.paidAt, `Hello ${name}, we received ${ugx(payment.amount)} on ${loan.id}. Your balance is ${ugx(Math.max(0, after))}. Thank you.`);
      after += payment.amount;
    }
  }
  if (on("reminder") && loan.nextPayment) {
    const sendOn = reminderDate(loan.nextPayment.dueOn, loan.schedule);
    const message = `Hello ${name}, your payment of ${ugx(loan.nextPayment.amount)} on ${loan.id} is due on ${day(loan.nextPayment.dueOn)}.`;
    add("reminder", `${sendOn}T08:00:00`, message, sendOn >= new Date().toLocaleDateString("en-CA"));
  }
  return messages.sort((a, b) => b.at.localeCompare(a.at) || a.id.localeCompare(b.id));
}
