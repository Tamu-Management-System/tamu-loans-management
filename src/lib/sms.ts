// How a text is counted. These are limits of the phone network, not business rules.
export const SMS_SEGMENT_LENGTH = 160;
/** Longest text the screen and the API accept (three segments) */
export const SMS_MAX_LENGTH = SMS_SEGMENT_LENGTH * 3;

export const smsSegments = (text: string) => Math.max(1, Math.ceil(text.length / SMS_SEGMENT_LENGTH));

/** The text suggested for a loan with money due (late, or due today); the person can change it before sending. */
export function overdueText(brand: string, clientName: string, loanId: string, daysLate: number, overdue: number) {
  const first = clientName.trim().split(/\s+/)[0] ?? clientName;
  if (daysLate <= 0) return `${brand} Loans: Hello ${first}, your payment of UGX ${overdue.toLocaleString("en-US")} on ${loanId} is due today. Thank you.`;
  return `${brand} Loans: Hello ${first}, your payment on ${loanId} is ${daysLate} day${daysLate === 1 ? "" : "s"} late. UGX ${overdue.toLocaleString("en-US")} is overdue. Please pay today or call us.`;
}
