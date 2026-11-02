import type { ReportValueFormat } from "../../api/types";
import { formatUGX } from "../../lib/format";

/** A report value as shown: "UGX 1,240,000", "7.0%", "1,204", "1 Nov 2026" */
export function formatValue(value: number | string | null, format: ReportValueFormat) {
  if (value === null || value === "") return "—";
  if (typeof value === "string") {
    if (format === "date") {
      const date = new Date(`${value}T00:00:00`);
      return Number.isNaN(date.getTime()) ? value : `${date.getDate()} ${date.toLocaleDateString("en-US", { month: "short" })} ${date.getFullYear()}`;
    }
    return value;
  }
  if (format === "ugx") return formatUGX(value);
  if (format === "percent") return `${value.toFixed(1)}%`;
  return value.toLocaleString("en-US");
}

