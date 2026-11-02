import { useId, useState } from "react";
import type { PortfolioRisk } from "../../api/types";
import { formatMonth, formatUGXMillions } from "../../lib/format";
import shared from "./Portfolio.module.css";
import styles from "./ParTrendCard.module.css";

const PERIODS = [
  { months: 3, label: "3M" },
  { months: 6, label: "6M" },
  { months: 12, label: "1Y" },
] as const;

const DEFAULT_PERIOD_MONTHS = 6;
const CHART_WIDTH = 300;
const CHART_HEIGHT = 90;
const CHART_PADDING_PERCENT = 0.3;

/** Line chart of weekly PAR30 with the target as a dashed line; the scale zooms to the data. */
function ParChart({ points, targetPercent, label }: { points: number[]; targetPercent: number; label: string }) {
  const gradientId = useId();
  const low = Math.min(...points, targetPercent) - CHART_PADDING_PERCENT;
  const high = Math.max(...points, targetPercent) + CHART_PADDING_PERCENT;
  const x = (index: number) => ((index * CHART_WIDTH) / (points.length - 1)).toFixed(1);
  const y = (value: number) => (CHART_HEIGHT - ((value - low) / (high - low)) * CHART_HEIGHT).toFixed(1);
  const line = points.map((value, index) => `${x(index)},${y(value)}`).join(" ");

  return (
    <div className={styles.chartArea}>
      <svg className={styles.chart} viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`} preserveAspectRatio="none" role="img" aria-label={label}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" style={{ stopColor: "var(--color-primary)", stopOpacity: 0.2 }} />
            <stop offset="1" style={{ stopColor: "var(--color-primary)", stopOpacity: 0 }} />
          </linearGradient>
        </defs>
        <polygon points={`${line} ${CHART_WIDTH},${CHART_HEIGHT} 0,${CHART_HEIGHT}`} fill={`url(#${gradientId})`} />
        <line x1="0" x2={CHART_WIDTH} y1={y(targetPercent)} y2={y(targetPercent)} className={styles.targetLine} vectorEffect="non-scaling-stroke" />
        <polyline points={line} className={styles.trendLine} vectorEffect="non-scaling-stroke" />
      </svg>
    </div>
  );
}

/** PAR30 headline, its trend over 3, 6 or 12 months, and PAR1 / PAR30 / PAR90. */
export function ParTrendCard({ risk }: { risk: PortfolioRisk }) {
  const [periodMonths, setPeriodMonths] = useState<number>(DEFAULT_PERIOD_MONTHS);

  const months = risk.monthly.slice(-periodMonths);
  const periodStart = `${months[0].month}-01`;
  const weekly = risk.weekly.filter((point) => point.date >= periodStart).map((point) => point.par30Percent);
  const change = risk.par30Percent - months[0].par30Percent;
  const aboveTarget = risk.par30Percent > risk.targetPercent;
  const chartLabel = `PAR30 by month: ${months.map((m) => `${formatMonth(m.month)} ${m.par30Percent.toFixed(1)}%`).join(", ")}. Target ${risk.targetPercent}%.`;

  return (
    <div className={shared.card}>
      <div className={styles.top}>
        Portfolio at risk over 30 days (PAR30)
        <div className={styles.periods} role="group" aria-label="Chart period">
          {PERIODS.map((period) => (
            <button key={period.months} type="button" aria-pressed={periodMonths === period.months} onClick={() => setPeriodMonths(period.months)}>
              {period.label}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.headline}>
        <span className={styles.value}>{risk.par30Percent.toFixed(1)}%</span>
        <span className={`${styles.change} ${change > 0 ? styles.changeWorse : styles.changeBetter}`}>
          {change > 0 ? "Up" : "Down"} {Math.abs(change).toFixed(1)} pts since {formatMonth(months[0].month, "long")}
        </span>
      </div>
      <p className={styles.summary}>
        <b className={aboveTarget ? styles.aboveTarget : styles.withinTarget}>
          {aboveTarget ? "Above" : "Within"} the {risk.targetPercent}% target.
        </b>{" "}
        {formatUGXMillions(risk.amountOver30Days)} is in loans more than 30 days late ({risk.loansOver30Days} loans).
      </p>

      <ParChart points={weekly} targetPercent={risk.targetPercent} label={chartLabel} />
      <div className={`${styles.months} ${periodMonths > 6 ? styles.manyMonths : ""}`} aria-hidden="true">
        {months.map((m) => (
          <span key={m.month}>{formatMonth(m.month)}</span>
        ))}
      </div>
      <div className={styles.key}>
        <span><i className={styles.keyTrend} />PAR30</span>
        <span><i className={styles.keyTarget} />{risk.targetPercent}% target</span>
      </div>

      <div className={styles.miniStats}>
        <div>PAR1<b>{risk.par1Percent.toFixed(1)}%</b>Any amount late</div>
        <div>PAR30<b>{risk.par30Percent.toFixed(1)}%</b>Over 30 days</div>
        <div>PAR90<b>{risk.par90Percent.toFixed(1)}%</b>Over 90 days</div>
      </div>
    </div>
  );
}
