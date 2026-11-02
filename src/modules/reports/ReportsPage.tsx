import { useId } from "react";
import { useSearchParams } from "react-router";
import { ApiError } from "../../api/client";
import { useExportReport, useReport } from "../../api/reports";
import type { ReportName } from "../../api/types";
import { useAuth } from "../../auth/AuthContext";
import { Button } from "../../components/ui/Button";
import { Icon } from "../../components/ui/Icon";
import { useToast } from "../../components/ui/Toast";
import { formatDate, toDateInputValue } from "../../lib/format";
import { ReportChart } from "./ReportChart";
import { formatValue } from "./reportFormat";
import styles from "./Reports.module.css";

const REPORTS: { name: ReportName; label: string; description: string; branchOnly?: boolean }[] = [
  { name: "portfolio", label: "Portfolio", description: "What's lent out today, and how much of it is late" },
  { name: "collections", label: "Collections", description: "What was collected against what was due" },
  { name: "disbursements", label: "Disbursements", description: "Loans paid out" },
  { name: "officers", label: "Officers", description: "How each loan officer is doing", branchOnly: true },
];

type Range = "today" | "week" | "month" | "last-month" | "year" | "custom";
const RANGES: { value: Range; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "week", label: "This week" },
  { value: "month", label: "This month" },
  { value: "last-month", label: "Last month" },
  { value: "year", label: "This year" },
  { value: "custom", label: "Custom" },
];

/** The dates a range covers (local calendar days; weeks start on Monday) */
function rangeDates(range: Range, from: string | null, to: string | null) {
  const today = new Date();
  const iso = toDateInputValue;
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
  const range: Range = RANGES.some((r) => r.value === rangeParam) ? rangeParam! : "month";
  const dates = rangeDates(range, searchParams.get("from"), searchParams.get("to"));
  const { data: report, isPending, isError, isFetching, refetch } = useReport(active.name, dates.from, dates.to);
  const exportReport = useExportReport();
  const snapshot = active.name === "portfolio";

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
          <button key={item.name} type="button" role="tab" aria-selected={item.name === active.name} onClick={() => update({ report: item.name === reports[0].name ? null : item.name })}>
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
              {RANGES.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={range === option.value}
                  onClick={() => update({ range: option.value === "month" ? null : option.value, ...(option.value === "custom" ? { from: dates.from, to: dates.to } : { from: null, to: null }) })}
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

          <section className={styles.card}>
            <ReportChart chart={report.chart} />
          </section>

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
                    {report.table.rows.slice(0, 200).map((row, index) => (
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
                {report.table.rows.length > 200 && <p className={styles.tableNote}>Showing the first 200 rows. Download the PDF or CSV for all {report.table.rows.length.toLocaleString("en-US")}.</p>}
              </div>
            )}
          </section>
        </div>
      )}
    </>
  );
}
