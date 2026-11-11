import { toDateInputValue } from "./format";

export type Range = "today" | "week" | "month" | "custom";
export const RANGES: { value: Range; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "week", label: "This week" },
  { value: "month", label: "This month" },
  { value: "custom", label: "Custom" },
];

/** The dates a range covers (local calendar days; the week starts on Monday). */
export function rangeDates(range: Range, from: string | null, to: string | null) {
  const today = new Date();
  const todayIso = toDateInputValue(today);
  if (range === "week") {
    const monday = new Date(today);
    monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));
    return { from: toDateInputValue(monday), to: todayIso };
  }
  if (range === "month") return { from: toDateInputValue(new Date(today.getFullYear(), today.getMonth(), 1)), to: todayIso };
  if (range === "custom") return { from: from || todayIso, to: to || todayIso };
  return { from: todayIso, to: todayIso };
}

