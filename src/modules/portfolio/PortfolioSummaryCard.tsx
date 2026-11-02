import type { ReactNode } from "react";
import { Link } from "react-router";
import { useDashboardToday } from "../../api/dashboard";
import type { PortfolioSummary } from "../../api/types";
import { formatCompactAmount, formatUGX, formatUGXMillions } from "../../lib/format";
import styles from "./Portfolio.module.css";

function SummaryRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className={styles.listRow}>
      <div className={styles.listRowText}>{label}</div>
      <b>{children}</b>
    </div>
  );
}

/** The officer's own portfolio at a glance (Module 2). */
export function PortfolioSummaryCard({ summary }: { summary: PortfolioSummary }) {
  // "Collected today" comes from the same numbers as the Today boxes, so they always agree
  const { data: today } = useDashboardToday();
  const collections = today?.collections;

  return (
    <div className={styles.card}>
      <h3 className={styles.cardTitle}>Portfolio summary</h3>
      <p className={styles.cardSubtitle}>Your loans at a glance</p>
      <SummaryRow label="Outstanding balance">{formatUGXMillions(summary.outstandingBalance)}</SummaryRow>
      <SummaryRow label="Active loans">{summary.activeLoans}</SummaryRow>
      <SummaryRow label="Disbursed this month">
        {formatUGXMillions(summary.disbursedThisMonth.amount)} <span className={styles.mutedText}>· {summary.disbursedThisMonth.count} loans</span>
      </SummaryRow>
      <SummaryRow label="Cleared this month">{summary.clearedThisMonth} loans</SummaryRow>
      <SummaryRow label="Due this week">{formatUGXMillions(summary.dueThisWeek)}</SummaryRow>
      {collections && (
        <SummaryRow label="Collected today">
          {formatUGX(collections.collectedAmount)} <span className={styles.mutedText}>of {formatCompactAmount(collections.expectedAmount)}</span>
        </SummaryRow>
      )}
      <Link to="/loans/active" className={styles.showAll}>
        Show all {summary.activeLoans} active loans →
      </Link>
    </div>
  );
}
