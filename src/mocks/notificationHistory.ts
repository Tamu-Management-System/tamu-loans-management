// The messages each demo user was sent: built from the sample applications, one in-app message per step plus
// SMS / email where Settings → Notifications says so. The real backend stores each message as it sends it.
import type { MessageChannel, NotificationEvent, NotificationMessage } from "../api/types";
import { applications, type MockApplication, type MockUser } from "./fixtures";
import { systemSettings } from "./systemSettings";

const ugx = (amount: number) => `UGX ${amount.toLocaleString("en-US")}`;
const brand = () => systemSettings.business.shortName;

/** Wording of each step, from the recipient's side */
function wording(event: NotificationEvent, app: MockApplication): { title: string; text: string; href: string } {
  const who = `${app.id} for ${app.borrowerName}`;
  const href = event === "approved" ? "/loans/to-disburse" : `/applications/${app.id}`;
  switch (event) {
    case "online-submitted":
      return { title: `${app.borrowerName} filled in the online form`, text: `${app.borrowerName} has filled in the loan application ${app.id}. Open it to check the details.`, href };
    case "submitted":
      return { title: `${who} is waiting for approval`, text: `${who} (${ugx(app.amount)}) is waiting for your approval.`, href };
    case "returned":
      return { title: `${who} was sent back`, text: `${who} was sent back. Reason: ${app.returned?.reason ?? "see the application"}. Please fix it and send it again.`, href };
    case "rejected":
      return { title: `${who} was rejected`, text: `${who} was rejected. Open it to see why.`, href };
    case "approved":
      return { title: `${who} is approved`, text: `${who} (${ugx(app.amount)}) is approved and ready to pay out.`, href };
    case "disbursed":
      return { title: `${who} was paid out`, text: `${who} (${ugx(app.amount)}) has been paid out.`, href };
  }
}

/** A few messages don't reach the phone or inbox, so the page can show it; fixed per message so it doesn't change on refresh */
const failed = (id: string) => [...id].reduce((sum, char) => sum + char.charCodeAt(0), 0) % 9 === 0;

export function notificationHistoryFor(user: MockUser, can: (permission: "applications.approve" | "loans.disburse") => boolean): NotificationMessage[] {
  const rules = systemSettings.notifications.rules;
  const loanRules = systemSettings.loanRules;
  const messages: NotificationMessage[] = [];

  const add = (event: NotificationEvent, app: MockApplication, at: string | undefined) => {
    if (!at) return;
    const rule = rules.find((item) => item.event === event);
    const { title, text, href } = wording(event, app);
    const channels: MessageChannel[] = ["in-app", ...(rule?.channels ?? [])];
    for (const channel of channels) {
      const id = `${event}-${app.id}-${channel}`;
      const message = channel === "sms" ? `${brand()} Loans: ${text}` : text;
      messages.push({ id, event, channel, title, message, at, delivery: channel === "in-app" ? null : failed(id) ? "failed" : "sent", href });
    }
  };

  for (const app of applications) {
    const owner = app.officerId === user.id;
    const approver = can("applications.approve") && !(owner && loanRules.creatorCannotApprove);
    const payer = can("loans.disburse") && !(loanRules.approverCannotDisburse && app.decided?.byId === user.id);
    if (owner && app.route === "online" && app.submittedAt) add("online-submitted", app, app.submittedAt);
    if (approver && app.submittedAt && app.route !== "online") add("submitted", app, app.submittedAt);
    if (owner && app.returned && app.status === "draft") add("returned", app, app.returned.at);
    if (owner && app.status === "rejected") add("rejected", app, app.decided?.at);
    if ((owner || payer) && (app.status === "approved" || app.loanId)) add("approved", app, app.decided?.at);
    if (owner && app.loanId) add("disbursed", app, app.paidOutAt);
  }
  return messages.sort((a, b) => b.at.localeCompare(a.at) || a.id.localeCompare(b.id));
}
