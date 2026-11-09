// The PDF a report downloads as: a designed A4 document with the headline figures, the report's charts drawn
// as vector graphics, and the table, repeated across pages with a running header and page numbers.
// Demo only: the real backend produces the real file, and this layout is the reference for it (docs/report-pdf-design.md).
import type { Report, ReportChart, ReportName, ReportValueFormat } from "../api/types";
import { formatCompactAmount } from "../lib/format";
import { formatValue } from "../modules/reports/reportFormat";
import { buildDocument, fit, measure, PAGE_WIDTH, PdfPage, wrap } from "./pdfKit";

export const REPORT_TITLES: Record<ReportName, string> = {
  portfolio: "Portfolio",
  aged: "Aged loans",
  due: "Repayments due",
  collections: "Collections",
  disbursements: "Disbursements",
  cleared: "Cleared loans",
  applications: "Applications",
  officers: "Officer performance",
};

// The app's colours (src/styles/tokens.css), so a downloaded report matches what's on screen
const INK = "#1b2430";
const MUTED = "#5b6470";
const FAINT = "#8a93a0";
const LINE = "#e3e7ed";
const BAND = "#eef1f5";
const PRIMARY = "#2185f6";
const PRIMARY_SOFT = "#e4effe";
const WHITE = "#ffffff";
const CATEGORY = ["#2185f6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4"];
const ORDERED = ["#2185f6", "#f0a35e", "#e5703a", "#c9472b", "#8f2a1c"];

const MARGIN = 40;
const CONTENT = PAGE_WIDTH - MARGIN * 2;
const BOTTOM = 790;
const CARD_PADDING = 14;

export interface ReportPdfInfo {
  businessName: string;
  /** e.g. "Tamu Loans" */
  productName: string;
  exportedBy: string;
  /** ISO date */
  exportedOn: string;
}

const isNumeric = (format: ReportValueFormat) => format !== "text" && format !== "date";
/** Amounts in tables are plain numbers: the column heading says (UGX) */
const cellText = (value: string | number | null | undefined, format: ReportValueFormat) => (format === "ugx" && typeof value === "number" ? value.toLocaleString("en-US") : formatValue(value ?? null, format));
/** A text cell holding several items ("Anna; Brian") shows one per line */
const linesOf = (text: string, format: ReportValueFormat) => (format === "text" ? text.split("; ") : [text]);
const axisValue = (value: number, format: ReportValueFormat) => (format === "percent" ? `${Math.round(value)}%` : format === "ugx" ? (value === 0 ? "0" : formatCompactAmount(value)) : String(Math.round(value)));

/** A round top for the scale: 1, 2, 2.5 or 5 times a power of ten (as on screen) */
function niceMax(value: number) {
  if (value <= 0) return 1;
  const power = 10 ** Math.floor(Math.log10(value));
  return ([1, 2, 2.5, 5, 10].find((step) => step * power >= value) ?? 10) * power;
}

// ---------- Page furniture ----------

/** The accent bar at the top of every page. (There is no running header: whoever downloads a report already knows whose it is.) */
function frame(page: PdfPage) {
  page.box(0, 0, PAGE_WIDTH, 5, { fill: PRIMARY });
}

/** The footer on every page, once the page count is known. */
function footer(page: PdfPage, info: ReportPdfInfo, number: number, count: number) {
  page.line(MARGIN, 808, PAGE_WIDTH - MARGIN, 808);
  page.text(`${info.businessName}  ·  Confidential: contains client information`, MARGIN, 821, { size: 7.5, color: FAINT });
  page.text(`Page ${number} of ${count}`, PAGE_WIDTH - MARGIN, 821, { size: 7.5, color: FAINT, align: "right" });
}

// ---------- Headline figures ----------

function drawFigures(page: PdfPage, figures: Report["figures"], top: number) {
  const gap = 10;
  const width = (CONTENT - gap * (figures.length - 1)) / figures.length;
  const inner = width - 24;
  // One size for every figure, as large as the longest value allows
  const labelOf = (figure: Report["figures"][number]) => `${figure.label}${figure.format === "ugx" ? " (UGX)" : ""}`;
  let size = 16;
  while (size > 9 && figures.some((figure) => measure(cellText(figure.value, figure.format), size, "bold") > inner)) size -= 0.5;
  figures.forEach((figure, index) => {
    const x = MARGIN + index * (width + gap);
    page.box(x, top, width, 74, { fill: WHITE, stroke: LINE, radius: 8 });
    page.text(fit(labelOf(figure).toUpperCase(), inner, 7, "bold"), x + 12, top + 19, { size: 7, font: "bold", color: MUTED });
    page.text(cellText(figure.value, figure.format), x + 12, top + 41, { size, font: "bold" });
    if (figure.note) wrap(figure.note, inner, 7, "regular", 2).forEach((line, lineIndex) => page.text(line, x + 12, top + 55 + lineIndex * 9, { size: 7, color: MUTED }));
  });
  return top + 74;
}

// ---------- Charts ----------

const DONUT_OUTER = 52;
const DONUT_INNER = 33;
const DONUT_LEGEND_TOP = 156;
const LEGEND_STEP = 15;

/** Slices as the screen shows them: more than the palette allows fold into "Other" */
function slicesOf(chart: ReportChart) {
  const colors = chart.ordered ? ORDERED : CATEGORY;
  const points = chart.points.length > colors.length ? [...chart.points.slice(0, colors.length - 1), { label: "Other", value: chart.points.slice(colors.length - 1).reduce((t, p) => t + p.value, 0), target: null }] : chart.points;
  return points.map((point, index) => ({ ...point, color: colors[index] }));
}

const donutHeight = (chart: ReportChart) => DONUT_LEGEND_TOP + (slicesOf(chart).length - 1) * LEGEND_STEP + 16;
const plotHeight = (chart: ReportChart) => (chart.kind === "donut" ? donutHeight(chart) : 214);

function drawDonut(page: PdfPage, chart: ReportChart, x: number, top: number, width: number) {
  const slices = slicesOf(chart);
  const total = slices.reduce((t, s) => t + s.value, 0);
  const cx = x + width / 2;
  const cy = top + 36 + DONUT_OUTER;
  let angle = 0;
  const drawn = slices.filter((s) => s.value > 0);
  for (const slice of drawn) {
    const sweep = (slice.value / total) * Math.PI * 2;
    // One slice fills the ring: stop a hair short of a full turn so the shape has two ends
    page.ringSlice(cx, cy, DONUT_OUTER, DONUT_INNER, angle, angle + Math.min(sweep, Math.PI * 2 - 0.0001), { fill: slice.color, gap: drawn.length > 1 ? WHITE : slice.color });
    angle += sweep;
  }
  const middle = chart.format === "ugx" ? (total === 0 ? "0" : formatCompactAmount(total)) : formatValue(total, chart.format);
  page.text("Total", cx, cy - 3, { size: 7, color: MUTED, align: "center" });
  page.text(middle, cx, cy + 11, { size: middle.length > 6 ? 10.5 : 12.5, font: "bold", align: "center" });

  // The legend: colour, name, value and share
  const left = x + CARD_PADDING;
  const right = x + width - CARD_PADDING;
  slices.forEach((slice, index) => {
    const baseline = top + DONUT_LEGEND_TOP + index * LEGEND_STEP;
    const share = total > 0 ? slice.value / total : 0;
    const percent = `${(share * 100).toFixed(share < 0.1 ? 1 : 0)}%`;
    const value = formatValue(slice.value, chart.format);
    page.box(left, baseline - 7, 8, 8, { fill: slice.color, radius: 2 });
    page.text(percent, right, baseline, { size: 8, color: MUTED, align: "right" });
    page.text(value, right - 34, baseline, { size: 8.5, font: "bold", align: "right" });
    page.text(fit(slice.label, right - 34 - measure(value, 8.5, "bold") - 10 - (left + 14), 8.5), left + 14, baseline, { size: 8.5 });
  });
}

/** Columns for each point (and a second, lighter column for the target) */
function drawBars(page: PdfPage, chart: ReportChart, x: number, top: number, width: number, height: number, legendRow: boolean) {
  const left = x + CARD_PADDING + 30;
  const right = x + width - CARD_PADDING;
  const plotTop = top + (legendRow ? 62 : 50);
  const plotBottom = top + height - 32;
  const withTarget = chart.targetSeries !== null && chart.points.some((p) => p.target !== null);
  const highest = Math.max(...chart.points.map((p) => Math.max(p.value, p.target ?? 0)));
  const max = chart.format === "percent" ? Math.max(100, Math.ceil(highest / 25) * 25) : niceMax(highest);
  const ticks = chart.format === "percent" ? Array.from({ length: max / 25 + 1 }, (_, index) => index * 25) : [0, max / 2, max];
  const y = (value: number) => plotBottom - (value / max) * (plotBottom - plotTop);
  for (const tick of ticks) {
    page.line(left, y(tick), right, y(tick), { color: tick === 0 ? "#c9d0da" : LINE, width: tick === 0 ? 1 : 0.6 });
    page.text(axisValue(tick, chart.format), left - 6, y(tick) + 2.5, { size: 7, color: MUTED, align: "right" });
  }
  const slot = (right - left) / chart.points.length;
  const barWidth = Math.max(8, Math.min(withTarget ? 24 : 44, (slot * (withTarget ? 0.8 : 0.55)) / (withTarget ? 2 : 1)));
  // Names get a little smaller before they would be cut short
  const longestWord = Math.max(...chart.points.flatMap((p) => p.label.split(/\s+/).map((word) => measure(word, 1))));
  const labelSize = Math.max(5.5, Math.min(7, Math.floor(((slot - 3) / longestWord) * 2) / 2));
  const label = (value: number) => (chart.format === "ugx" ? (value === 0 ? "0" : formatCompactAmount(value)) : formatValue(value, chart.format));
  chart.points.forEach((point, index) => {
    const middle = left + slot * index + slot / 2;
    const bars = withTarget ? [{ value: point.value, color: PRIMARY }, { value: point.target ?? 0, color: "#c3d1e3" }] : [{ value: point.value, color: PRIMARY }];
    bars.forEach((bar, barIndex) => {
      const bx = middle - (barWidth * bars.length) / 2 + barIndex * barWidth + (bars.length > 1 && barIndex === 1 ? 1 : 0);
      const by = y(bar.value);
      if (bar.value > 0) page.box(bx, by, barWidth - (bars.length > 1 ? 1 : 0), plotBottom - by, { fill: bar.color });
      page.text(label(bar.value), bx + barWidth / 2, by - 4, { size: withTarget ? 7 : 7.5, font: "bold", color: bar.value > 0 ? INK : FAINT, align: "center" });
    });
    wrap(point.label, slot - 3, labelSize, "regular", 2).forEach((line, lineIndex) => page.text(line, middle, plotBottom + 12 + lineIndex * 9, { size: labelSize, color: MUTED, align: "center" }));
  });
}

/** A line over time with a soft area under it, and an optional dashed second line */
function drawTrend(page: PdfPage, chart: ReportChart, x: number, top: number, width: number, height: number, legendRow: boolean) {
  const left = x + CARD_PADDING + 30;
  const right = x + width - CARD_PADDING - 8;
  const plotTop = top + (legendRow ? 62 : 50);
  const plotBottom = top + height - 32;
  const withTarget = chart.targetSeries !== null && chart.points.some((p) => p.target !== null);
  const max = niceMax(Math.max(...chart.points.map((p) => Math.max(p.value, p.target ?? 0))));
  const y = (value: number) => plotBottom - (value / max) * (plotBottom - plotTop);
  for (const tick of [0, max / 2, max]) {
    page.line(left, y(tick), right, y(tick), { color: tick === 0 ? "#c9d0da" : LINE, width: tick === 0 ? 1 : 0.6 });
    page.text(axisValue(tick, chart.format), left - 6, y(tick) + 2.5, { size: 7, color: MUTED, align: "right" });
  }
  const step = (right - left) / (chart.points.length - 1);
  const px = (index: number) => left + step * index;
  page.polyline(chart.points.map((p, index) => [px(index), y(p.value)]), { color: PRIMARY, width: 1.6, area: { fill: PRIMARY_SOFT, floor: plotBottom } });
  if (withTarget) page.polyline(chart.points.map((p, index) => [px(index), y(p.target ?? 0)]), { color: FAINT, width: 1.2, dash: [3, 2] });
  // Dates along the bottom, spaced so no two touch
  const every = Math.max(1, Math.ceil(chart.points.length / Math.max(2, Math.floor((right - left) / 42))));
  chart.points.forEach((p, index) => {
    if (index % every === 0) page.text(p.label, px(index), plotBottom + 12, { size: 7, color: MUTED, align: "center" });
  });
}

function drawChart(page: PdfPage, chart: ReportChart, x: number, top: number, width: number, height: number) {
  page.box(x, top, width, height, { fill: WHITE, stroke: LINE, radius: 8 });
  page.text(fit(chart.title, width - CARD_PADDING * 2, 9.5, "bold"), x + CARD_PADDING, top + 22, { size: 9.5, font: "bold" });
  const empty = chart.points.every((p) => p.value === 0 && !p.target);
  const kind = chart.kind === "trend" && chart.points.length < 2 ? "columns" : chart.kind;
  if (empty) {
    page.text("Nothing in these dates.", x + width / 2, top + height / 2, { size: 9, color: MUTED, align: "center" });
    return;
  }
  const legendRow = kind !== "donut" && chart.targetSeries !== null && chart.points.some((p) => p.target !== null);
  if (legendRow) {
    const baseline = top + 40;
    const dashed = kind === "trend";
    page.line(x + CARD_PADDING, baseline - 2.5, x + CARD_PADDING + 14, baseline - 2.5, { color: PRIMARY, width: 2 });
    page.text(chart.series, x + CARD_PADDING + 19, baseline, { size: 7.5, color: MUTED });
    const second = x + CARD_PADDING + 19 + measure(chart.series, 7.5) + 16;
    page.line(second, baseline - 2.5, second + 14, baseline - 2.5, { color: dashed ? FAINT : "#c3d1e3", width: dashed ? 1.2 : 4, dash: dashed ? [3, 2] : undefined });
    page.text(chart.targetSeries ?? "", second + 19, baseline, { size: 7.5, color: MUTED });
  }
  if (kind === "donut") drawDonut(page, chart, x, top, width);
  else if (kind === "trend") drawTrend(page, chart, x, top, width, height, legendRow);
  else drawBars(page, chart, x, top, width, height, legendRow);
}

// ---------- The table ----------

interface TableLayout {
  widths: number[];
  headers: string[][];
  headerHeight: number;
  rowHeight: number;
  size: number;
  /** Space inside a cell, left and right */
  pad: number;
  /** A row is taller when a cell lists several items */
  heightOf: (row: Record<string, string | number | null>) => number;
}

const CELL_PADDING = 7;
/** Wide tables (nine or more columns) use tighter cells so every column keeps its full text */
const paddingFor = (columnCount: number) => (columnCount >= 9 ? 5 : CELL_PADDING);

/** Column widths that fit the page: numbers keep their size, long text gives way and is shortened with "…" */
function layoutTable(report: Report): TableLayout {
  const { columns, rows, total } = report.table;
  const size = columns.length >= 9 ? 7.5 : rows.length <= 14 ? 9 : 8;
  const pad = paddingFor(columns.length);
  const sample = [...rows.slice(0, 300), ...(total ? [total] : [])];
  const labels = columns.map((column) => `${column.label}${column.format === "ugx" ? " (UGX)" : ""}`.toUpperCase());
  // Every column first gets what its values and its longest heading word need. Spare room then lets headings sit on one line
  // (numbers and dates first), and what is left goes to the text columns. If there isn't enough, text columns give way and are shortened with "…".
  const bodyWidth = columns.map((column) => Math.max(0, ...sample.flatMap((row) => linesOf(cellText(row[column.key], column.format), column.format).map((line) => measure(line, size, "regular")))));
  const longestWord = labels.map((label) => Math.max(...label.split(" ").map((word) => measure(word, 7, "bold"))));
  const tight = columns.map((_, index) => Math.max(bodyWidth[index], longestWord[index], 28) + pad * 2);
  const preferred = columns.map((_, index) => Math.max(tight[index], Math.min(measure(labels[index], 7, "bold"), 92) + pad * 2));
  const widths = [...tight];
  const sum = () => widths.reduce((a, b) => a + b, 0);
  if (sum() <= CONTENT) {
    const wants = preferred.map((width, index) => width - tight[index]);
    const wanted = wants.reduce((a, b) => a + b, 0);
    const share = wanted > 0 ? Math.min(1, (CONTENT - sum()) / wanted) : 0;
    wants.forEach((want, index) => (widths[index] += want * share));
    const spare = CONTENT - sum();
    if (spare > 0.5) {
      const flexible = columns.map((column, index) => (column.format === "text" ? index : -1)).filter((index) => index >= 0);
      const targets = flexible.length ? flexible : columns.map((_, index) => index);
      const weight = targets.reduce((t, index) => t + tight[index], 0);
      targets.forEach((index) => (widths[index] += (spare * tight[index]) / weight));
    }
  } else {
    const least = columns.map((column, index) => Math.min(tight[index], Math.max(column.format === "text" ? Math.min(bodyWidth[index], 56) : bodyWidth[index], longestWord[index], 28) + pad * 2));
    const give = widths.map((width, index) => width - least[index]);
    const room = give.reduce((a, b) => a + b, 0);
    const share = room > 0 ? Math.min(1, (sum() - CONTENT) / room) : 0;
    give.forEach((amount, index) => (widths[index] -= amount * share));
    // Still too wide (many numeric columns): scale everything down evenly
    if (sum() > CONTENT) {
      const scale = CONTENT / sum();
      widths.forEach((_, index) => (widths[index] *= scale));
    }
  }
  const headers = labels.map((label, index) => wrap(label, widths[index] - pad * 2, 7, "bold", 2));
  const headerHeight = headers.some((lines) => lines.length > 1) ? 30 : 22;
  const rowHeight = rows.length <= 14 ? 23 : 17;
  const heightOf = (row: Record<string, string | number | null>) => {
    const lines = Math.max(1, ...columns.map((column) => linesOf(cellText(row[column.key], column.format), column.format).length));
    return rowHeight + (lines - 1) * (size + 2);
  };
  return { widths, headers, headerHeight, rowHeight, size, heightOf, pad };
}

function drawTableHeader(page: PdfPage, report: Report, layout: TableLayout, top: number) {
  page.box(MARGIN, top, CONTENT, layout.headerHeight, { fill: BAND, radius: 4 });
  let x = MARGIN;
  report.table.columns.forEach((column, index) => {
    const lines = layout.headers[index];
    const numeric = isNumeric(column.format);
    const first = top + layout.headerHeight / 2 - ((lines.length - 1) * 8.5) / 2 + 2.5;
    lines.forEach((line, lineIndex) => page.text(line, numeric ? x + layout.widths[index] - layout.pad : x + layout.pad, first + lineIndex * 8.5, { size: 7, font: "bold", color: MUTED, align: numeric ? "right" : "left" }));
    x += layout.widths[index];
  });
  return top + layout.headerHeight;
}

function drawRow(page: PdfPage, report: Report, layout: TableLayout, values: Record<string, string | number | null>, top: number, style: { shaded?: boolean; total?: boolean }) {
  const { size } = layout;
  const rowHeight = style.total ? layout.rowHeight : layout.heightOf(values);
  if (style.total) {
    page.box(MARGIN, top, CONTENT, rowHeight, { fill: BAND, radius: 4 });
    page.line(MARGIN, top, MARGIN + CONTENT, top, { color: "#c9d0da", width: 1 });
  } else if (style.shaded) page.box(MARGIN, top, CONTENT, rowHeight, { fill: "#fafbfc" });
  let x = MARGIN;
  report.table.columns.forEach((column, index) => {
    const numeric = isNumeric(column.format);
    if (values[column.key] !== null && values[column.key] !== undefined && values[column.key] !== "") {
      const lines = linesOf(cellText(values[column.key], style.total && column.format === "date" ? "text" : column.format), column.format);
      // The lines sit together, centred in the row
      const first = top + rowHeight / 2 - ((lines.length - 1) * (size + 2)) / 2 + size * 0.35;
      lines.forEach((line, lineIndex) =>
        page.text(fit(line, layout.widths[index] - layout.pad * 2, size, style.total ? "bold" : "regular"), numeric ? x + layout.widths[index] - layout.pad : x + layout.pad, first + lineIndex * (size + 2), {
          size,
          font: style.total ? "bold" : "regular",
          align: numeric ? "right" : "left",
        }),
      );
    }
    x += layout.widths[index];
  });
  if (!style.total) page.line(MARGIN, top + rowHeight, MARGIN + CONTENT, top + rowHeight, { color: "#eef0f3", width: 0.5 });
  return top + rowHeight;
}

// ---------- The document ----------

export function reportPdf(report: Report, info: ReportPdfInfo, scopeText: string) {
  const pages: PdfPage[] = [];
  const title = `${REPORT_TITLES[report.name]} report`;
  const newPage = (continued: boolean) => {
    const page = new PdfPage();
    pages.push(page);
    frame(page);
    if (continued) page.text(`${title}  ·  continued`, MARGIN, 40, { size: 9, font: "bold", color: MUTED });
    return { page, y: continued ? 54 : 0 };
  };

  // Page one: title, headline figures, charts
  let { page } = newPage(false);
  const snapshot = report.name === "portfolio" || report.name === "aged";
  const day = (iso: string) => formatValue(iso, "date");
  const dates = snapshot ? `As of ${day(report.to)}` : report.from === report.to ? day(report.from) : `${day(report.from)} to ${day(report.to)}`;
  page.text(title, MARGIN, 52, { size: 22, font: "bold" });
  page.text(`${dates}  ·  ${scopeText}`, MARGIN, 70, { size: 10.5, color: MUTED });
  let y = drawFigures(page, report.figures, 90) + 14;

  const perRow = report.charts.length === 1 ? 1 : 2;
  for (let start = 0; start < report.charts.length; start += perRow) {
    const row = report.charts.slice(start, start + perRow);
    const height = Math.max(...row.map(plotHeight));
    const width = (CONTENT - 12 * (row.length - 1)) / row.length;
    if (y + height > BOTTOM) ({ page, y } = newPage(true));
    row.forEach((chart, index) => drawChart(page, chart, MARGIN + index * (width + 12), y, width, height));
    y += height + 22;
  }

  // The table
  const layout = layoutTable(report);
  const { rows, total } = report.table;
  const count = `${rows.length.toLocaleString("en-US")} ${rows.length === 1 ? "row" : "rows"}`;
  const needed = 30 + layout.headerHeight + layout.rowHeight * Math.min(3, Math.max(1, rows.length));
  if (y + needed > BOTTOM) ({ page, y } = newPage(true));
  const heading = (top: number) => {
    page.text(report.table.title, MARGIN, top + 12, { size: 12, font: "bold" });
    page.text(count, PAGE_WIDTH - MARGIN, top + 12, { size: 8.5, color: MUTED, align: "right" });
    return top + 22;
  };
  y = drawTableHeader(page, report, layout, heading(y));
  if (rows.length === 0) {
    page.text("Nothing in these dates.", MARGIN + CELL_PADDING, y + 24, { size: 9.5, color: MUTED });
  }
  rows.forEach((row, index) => {
    // Keep the totals row company: the last row never ends up alone on a page with it
    const last = index === rows.length - 1;
    if (y + layout.heightOf(row) + (last && total ? layout.rowHeight : 0) > BOTTOM) {
      ({ page, y } = newPage(true));
      y = drawTableHeader(page, report, layout, y);
    }
    y = drawRow(page, report, layout, row, y, { shaded: index % 2 === 1 });
  });
  if (total && rows.length > 0) drawRow(page, report, layout, total, y + 2, { total: true });

  pages.forEach((item, index) => footer(item, info, index + 1, pages.length));
  return buildDocument(pages, `${info.businessName} - ${title}`);
}
