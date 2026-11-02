const ugx = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

/** "Sep", not "Sept": en-US short month names, used in every date format below */
const shortMonth = (date: Date) => date.toLocaleDateString("en-US", { month: "short" });

/** UGX 1,240,000 */
export const formatUGX = (amount: number) => `UGX ${ugx.format(Math.round(amount))}`;

/** UGX 96.0M (amount given in UGX) */
export const formatUGXMillions = (amount: number) => `UGX ${(amount / 1_000_000).toFixed(1)}M`;

/** "Sharon Nakalema" -> "SN" */
export const initials = (name: string) =>
  name
    .split(" ")
    .filter(Boolean)
    .map((word) => word[0])
    .join("")
    .toUpperCase();

export const firstName = (name: string) => name.split(" ")[0];

/** Good morning / afternoon / evening */
export function greeting(date = new Date()) {
  const hour = date.getHours();
  return hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
}

/** "2026-10-20" or ISO date-time -> "20 Oct" */
export const formatShortDate = (iso: string) => {
  const date = new Date(iso);
  return `${date.getDate()} ${shortMonth(date)}`;
};

/** ISO date-time -> "4:10 PM" */
export const formatTime = (iso: string) => new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

/** Whole days between an ISO date and today (0 = today). */
export function daysSince(iso: string, now = new Date()) {
  const start = new Date(iso);
  start.setHours(0, 0, 0, 0);
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  return Math.round((today.getTime() - start.getTime()) / 86_400_000);
}

/** ISO date-time -> "today, 9:05 AM", "yesterday, 4:10 PM" or "27 Oct" */
export function formatRelativeDay(iso: string) {
  const days = daysSince(iso);
  if (days === 0) return `today, ${formatTime(iso)}`;
  if (days === 1) return `yesterday, ${formatTime(iso)}`;
  return formatShortDate(iso);
}

/** Local calendar date as "YYYY-MM-DD", for date inputs. */
export function toDateInputValue(date: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Compact amount without currency: 1,240,000 -> "1.2M", 380,000 -> "380K" */
export const formatCompactAmount = (amount: number) =>
  amount >= 1_000_000 ? `${(amount / 1_000_000).toFixed(1)}M` : `${Math.round(amount / 1_000)}K`;

/** Activity time: "9:42 AM" today, "Yesterday", then the weekday ("Mon") within a week, else "24 Oct". */
export function formatActivityTime(iso: string) {
  const days = daysSince(iso);
  if (days === 0) return formatTime(iso);
  if (days === 1) return "Yesterday";
  if (days < 7) return new Date(iso).toLocaleDateString("en-GB", { weekday: "short" });
  return formatShortDate(iso);
}

/** "2026-09" -> "Sep" (short) or "September" (long). en-US so September is "Sep", not "Sept". */
export const formatMonth = (yearMonth: string, style: "short" | "long" = "short") =>
  new Date(`${yearMonth}-01T00:00:00`).toLocaleDateString("en-US", { month: style });

/** ISO date -> "12 Jun 2026" */
export const formatDate = (iso: string) => {
  const date = new Date(iso);
  return `${date.getDate()} ${shortMonth(date)} ${date.getFullYear()}`;
};

/** ISO date -> "Jun 2026" */
export const formatMonthYear = (iso: string) => {
  const date = new Date(iso);
  return `${shortMonth(date)} ${date.getFullYear()}`;
};

/** ISO date -> "12 June 2026" (as on Tamu's forms) */
export const formatLongDate = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
