import { useId, useState } from "react";
import { useSearchParams } from "react-router";
import { ApiError } from "../../api/client";
import { useExportReport, useReport } from "../../api/reports";
import type { ReportName } from "../../api/types";
import { useAuth } from "../../auth/AuthContext";
import { Button } from "../../components/ui/Button";
import { Icon } from "../../components/ui/Icon";
import { Pagination } from "../../components/ui/Pagination";
import { useToast } from "../../components/ui/Toast";
import { formatDate, toDateInputValue } from "../../lib/format";
import { ReportChart } from "./ReportChart";
import { formatValue } from "./reportFormat";
import styles from "./Reports.module.css";

const TABLE_PAGE_SIZE = 25;

/** snapshot: as of today; past: looks back over the dates; ahead: looks forward from today */
type When = "snapshot" | "past" | "ahead";

const REPORTS: { name: ReportName; label: string; description: string; when: When; branchOnly?: boolean }[] = [
  { name: "portfolio", label: "Portfolio", description: "What's lent out today, and how much of it is late", when: "snapshot" },
  { name: "aged", label: "Aged loans", description: "Every late loan, and how long it has been late", when: "snapshot" },
  { name: "due", label: "Repayments due", description: "What clients are due to pay in the coming days", when: "ahead" },
  { name: "collections", label: "Collections", description: "What was collected against what was due", when: "past" },
  { name: "disbursements", label: "Disbursements", description: "Loans paid out", when: "past" },
  { name: "cleared", label: "Cleared loans", description: "Loans repaid in full", when: "past" },
  { name: "applications", label: "Applications", description: "Applications started, and where each one stands", when: "past" },
  { name: "officers", label: "Officers", description: "How each loan officer is doing", when: "past", branchOnly: true },
];

type Range = "today" | "week" | "month" | "last-month" | "year" | "custom" | "next-7" | "next-30";
const PAST_RANGES: { value: Range; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "week", label: "This week" },
  { value: "month", label: "This month" },
  { value: "last-month", label: "Last month" },
  { value: "year", label: "This year" },
  { value: "custom", label: "Custom" },
];
const AHEAD_RANGES: { value: Range; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "next-7", label: "Next 7 days" },
  { value: "next-30", label: "Next 30 days" },
];
const addDays = (date: Date, days: number) => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};

/** The dates a range covers (local calendar days; weeks start on Monday) */
function rangeDates(range: Range, from: string | null, to: string | null) {
  const today = new Date();
  const iso = toDateInputValue;
  if (range === "next-7") return { from: iso(today), to: iso(addDays(today, 7)) };
  if (range === "next-30") return { from: iso(today), to: iso(addDays(today, 30)) };
  if (range === "today") return { from: iso(today), to: iso(today) };
  if (range === "week") {
    const monday = new Date(today);
    monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));
    return { from: iso(monday), to: iso(today) };
  }
  if (range === "last-month") return { from: iso(new Date(today.getFullYear(), today.getMonth() - 1, 1)), to: iso(new Date(today.getFullYear(), today.getMonth(), 0)) };
  if (range === "year") return { from: iso(new Date(today.getFullYear(), 0, 1)), to: iso(today) };
  if (range === "custom") return { from: from || iso(new Date(today.getFullYear(), today.getMonth(), 1)), to: to || iso(today) };
  return { from: iso(new Date(today.getFullYear(), today.getMonth(), 1)), to: iso(today) };
}

/** Reports: portfolio, collections, disbursements and officer performance, one tab each. Officers see their own portfolio. */
export function ReportsPage() {
  const { can, seesBranch } = useAuth();
  const ids = { from: useId(), to: useId() };
  const showToast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const reports = REPORTS.filter((report) => !report.branchOnly || seesBranch);
  const active = reports.find((report) => report.name === searchParams.get("report")) ?? reports[0];
  const rangeParam = searchParams.get("range") as Range | null;
  const ranges = active.when === "ahead" ? AHEAD_RANGES : PAST_RANGES;
  const defaultRange: Range = active.when === "ahead" ? "next-7" : "month";
  const range: Range = ranges.some((r) => r.value === rangeParam) ? rangeParam! : defaultRange;
  const dates = rangeDates(range, searchParams.get("from"), searchParams.get("to"));
  const { data: report, isPending, isError, isFetching, refetch } = useReport(active.name, dates.from, dates.to);
  const exportReport = useExportReport();
  const snapshot = active.when === "snapshot";
  // The table's page goes back to 1 when the report or dates change
  const tableKey = `${active.name}|${dates.from}|${dates.to}`;
  const [tablePage, setTablePage] = useState({ key: tableKey, page: 1 });
  if (tablePage.key !== tableKey) setTablePage({ key: tableKey, page: 1 });
  const page = tablePage.key === tableKey ? tablePage.page : 1;

  const update = (changes: Record<string, string | null>) =>
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      Object.entries(changes).forEach(([key, value]) => (value ? next.set(key, value) : next.delete(key)));
      return next;
    });

  const download = (format: "pdf" | "csv") =>
    exportReport
      .mutateAsync({ name: active.name, from: dates.from, to: dates.to, format })
      .then(() => showToast({ message: `${active.label} report downloaded (${format.toUpperCase()}).` }))
      .catch((error) => showToast({ message: error instanceof ApiError ? error.message : "The export didn't work. Try again." }));

  return (
    <>
      <div className={styles.header}>
        <div>
          <h1>Reports</h1>
          <p className={styles.subtitle}>{seesBranch ? "The whole market" : "Your portfolio"}</p>
        </div>
        {can("reports.export") && (
          <div className={styles.downloads}>
            <Button variant="secondary" onClick={() => download("pdf")} disabled={exportReport.isPending || !report}>
              <Icon name="upload" size={16} strokeWidth={1.8} className={styles.exportIcon} />
              Download PDF
            </Button>
            <Button variant="secondary" onClick={() => download("csv")} disabled={exportReport.isPending || !report}>
              <Icon name="upload" size={16} strokeWidth={1.8} className={styles.exportIcon} />
              Download CSV
            </Button>
          </div>
        )}
      </div>

      <div className={styles.tabs} role="tablist" aria-label="Reports">
        {reports.map((item) => (
          <button key={item.name} type="button" role="tab" aria-selected={item.name === active.name} onClick={() => update({ report: item.name === reports[0].name ? null : item.name, range: null, from: null, to: null })}>
            {item.label}
          </button>
        ))}
      </div>

      <div className={styles.toolbar}>
        <p className={styles.reportDescription}>{active.description}</p>
        {snapshot ? (
          <p className={styles.asOf}>As of today, {formatDate(new Date().toISOString())}</p>
        ) : (
          <div className={styles.dateControls}>
            <div className={styles.ranges} role="group" aria-label="Dates">
              {ranges.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={range === option.value}
                  onClick={() => update({ range: option.value === defaultRange ? null : option.value, ...(option.value === "custom" ? { from: dates.from, to: dates.to } : { from: null, to: null }) })}
                >
                  {option.label}
                </button>
              ))}
            </div>
            {range === "custom" && (
              <div className={styles.custom}>
                <label htmlFor={ids.from}>From</label>
                <input id={ids.from} type="date" value={dates.from} max={dates.to} onChange={(event) => update({ from: event.target.value || null })} />
                <label htmlFor={ids.to}>To</label>
                <input id={ids.to} type="date" value={dates.to} min={dates.from} max={toDateInputValue(new Date())} onChange={(event) => update({ to: event.target.value || null })} />
              </div>
            )}
          </div>
        )}
      </div>

      {isError ? (
        <div className={styles.card}>
          <p className={styles.message} role="alert">
            The report couldn't load.{" "}
            <button type="button" className={styles.linkButton} onClick={() => refetch()}>
              Try again
            </button>
          </p>
        </div>
      ) : isPending ? (
        <div className={styles.loading} aria-busy="true" aria-label="Loading the report" />
      ) : (
        <div className={`${styles.report} ${isFetching ? styles.refreshing : ""}`} role="tabpanel" aria-label={active.label}>
          <dl className={styles.figures}>
            {report.figures.map((figure) => (
              <div key={figure.label} className={styles.figure}>
                <dt>{figure.label}</dt>
                <dd>{formatValue(figure.value, figure.format)}</dd>
                {figure.note && <span className={styles.figureNote}>{figure.note}</span>}
              </div>
            ))}
          </dl>

          <div className={`${styles.charts} ${report.charts.every((chart) => chart.kind === "donut") ? styles.chartsEven : ""}`}>
            {report.charts.map((chart) => (
              <section key={chart.title} className={styles.card}>
                <ReportChart chart={chart} />
              </section>
            ))}
          </div>

          <section className={styles.card} aria-labelledby="report-table-heading">
            <h2 id="report-table-heading" className={styles.tableTitle}>
              {report.table.title}
              <span>{report.table.rows.length.toLocaleString("en-US")} rows</span>
            </h2>
            {report.table.rows.length === 0 ? (
              <p className={styles.message}>Nothing in these dates.</p>
            ) : (
              <div className={styles.tableScroll}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      {report.table.columns.map((column) => (
                        <th key={column.key} className={column.format === "text" || column.format === "date" ? undefined : styles.numeric}>
                          {column.label.toUpperCase()}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {report.table.rows.slice((page - 1) * TABLE_PAGE_SIZE, page * TABLE_PAGE_SIZE).map((row, index) => (
                      <tr key={index}>
                        {report.table.columns.map((column) => (
                          <td key={column.key} data-label={column.label} className={column.format === "text" || column.format === "date" ? undefined : styles.numeric}>
                            {formatValue(row[column.key] ?? null, column.format)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                  {report.table.total && (
                    <tfoot>
                      <tr>
                        {report.table.columns.map((column) => (
                          <td key={column.key} data-label={column.label} className={column.format === "text" || column.format === "date" ? undefined : styles.numeric}>
                            {report.table.total![column.key] === null || report.table.total![column.key] === undefined ? "" : formatValue(report.table.total![column.key], column.format === "date" ? "text" : column.format)}
                          </td>
                        ))}
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            )}
            {report.table.rows.length > TABLE_PAGE_SIZE && (
              <Pagination page={page} pageSize={TABLE_PAGE_SIZE} total={report.table.rows.length} noun="rows" onPageChange={(next) => setTablePage({ key: tableKey, page: next })} />
            )}
          </section>
        </div>
      )}
    </>
  );
}
