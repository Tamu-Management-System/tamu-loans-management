import { useState } from "react";
import type { Report, ReportValueFormat } from "../../api/types";
import { formatCompactAmount } from "../../lib/format";
import { formatValue } from "./reportFormat";
import styles from "./Reports.module.css";

/** Short axis labels: "1.2M", "380K", "12%" */
const axisValue = (value: number, format: ReportValueFormat) => (format === "percent" ? `${Math.round(value)}%` : format === "ugx" ? (value === 0 ? "0" : formatCompactAmount(value)) : String(Math.round(value)));

/** A round top for the scale: 1, 2, 2.5 or 5 times a power of ten */
function niceMax(value: number) {
  if (value <= 0) return 1;
  const power = 10 ** Math.floor(Math.log10(value));
  return ([1, 2, 2.5, 5, 10].find((step) => step * power >= value) ?? 10) * power;
}

export function ReportChart({ chart }: { chart: Report["chart"] }) {
  const empty = chart.points.every((point) => point.value === 0 && !point.target);
  return (
    <figure className={styles.chartFigure}>
      <figcaption className={styles.chartTitle}>
        {chart.title}
        {chart.targetSeries && (
          <span className={styles.legend}>
            <span>
              <i className={styles.legendBar} />
              {chart.series}
            </span>
            <span>
              <i className={styles.legendTarget} />
              {chart.targetSeries}
            </span>
          </span>
        )}
      </figcaption>
      {empty ? <p className={styles.chartEmpty}>Nothing in these dates.</p> : chart.kind === "bars" ? <Bars chart={chart} /> : <Columns chart={chart} />}
    </figure>
  );
}

/** One horizontal bar per category, value at the end */
function Bars({ chart }: { chart: Report["chart"] }) {
  const max = chart.format === "percent" ? Math.max(100, ...chart.points.map((p) => p.value)) : Math.max(...chart.points.map((p) => p.value), 1);
  return (
    <ul className={styles.bars}>
      {chart.points.map((point) => (
        <li key={point.label} title={`${point.label}: ${formatValue(point.value, chart.format)}`}>
          <span className={styles.barLabel}>{point.label}</span>
          <span className={styles.barTrack}>
            <span className={styles.bar} style={{ width: `${Math.max(0.5, (point.value / max) * 100)}%` }} />
          </span>
          <span className={styles.barValue}>{formatValue(point.value, chart.format)}</span>
        </li>
      ))}
    </ul>
  );
}

const WIDTH = 720;
const HEIGHT = 220;
const LEFT = 44;
const BOTTOM = 24;
const TOP = 8;

/** One column per day, week or month; an optional target (e.g. expected) as a dark tick across each column */
function Columns({ chart }: { chart: Report["chart"] }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = niceMax(Math.max(...chart.points.map((p) => Math.max(p.value, p.target ?? 0))));
  const plotWidth = WIDTH - LEFT;
  const plotHeight = HEIGHT - TOP - BOTTOM;
  const slot = plotWidth / chart.points.length;
  const barWidth = Math.max(3, Math.min(28, slot * 0.62));
  const y = (value: number) => TOP + plotHeight - (value / max) * plotHeight;
  const ticks = [0, 0.5, 1].map((share) => share * max);
  // Label every column when there's room, otherwise every few
  const labelEvery = Math.ceil(chart.points.length / 12);
  const point = hover !== null ? chart.points[hover] : null;

  return (
    <div className={styles.columnsWrap} onPointerLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className={styles.columns} role="img" aria-label={`${chart.title}. ${chart.points.map((p) => `${p.label}: ${formatValue(p.value, chart.format)}`).join(", ")}`}>
        {ticks.map((tick) => (
          <g key={tick}>
            <line x1={LEFT} x2={WIDTH} y1={y(tick)} y2={y(tick)} className={tick === 0 ? styles.axis : styles.grid} />
            <text x={LEFT - 8} y={y(tick)} dy="0.32em" textAnchor="end" className={styles.tickLabel}>
              {axisValue(tick, chart.format)}
            </text>
          </g>
        ))}
        {chart.points.map((p, index) => {
          const x = LEFT + slot * index + (slot - barWidth) / 2;
          const top = y(p.value);
          const height = TOP + plotHeight - top;
          const radius = Math.min(4, barWidth / 2, height);
          return (
            <g key={index}>
              {/* Rounded top, square base on the axis */}
              {p.value > 0 && (
                <path
                  className={`${styles.column} ${hover === index ? styles.columnHover : ""}`}
                  d={`M${x},${top + height} V${top + radius} Q${x},${top} ${x + radius},${top} H${x + barWidth - radius} Q${x + barWidth},${top} ${x + barWidth},${top + radius} V${top + height} Z`}
                />
              )}
              {p.target !== null && p.target > 0 && <line x1={x - 2} x2={x + barWidth + 2} y1={y(p.target)} y2={y(p.target)} className={styles.target} />}
              {index % labelEvery === 0 && (
                <text x={x + barWidth / 2} y={HEIGHT - 6} textAnchor="middle" className={styles.tickLabel}>
                  {p.label}
                </text>
              )}
              {/* Hover target: the whole slot, taller than the column */}
              <rect x={LEFT + slot * index} y={TOP} width={slot} height={plotHeight} className={styles.hitArea} onPointerEnter={() => setHover(index)} />
            </g>
          );
        })}
      </svg>
      {point && hover !== null && (
        <div className={styles.tooltip} style={{ left: `${((LEFT + slot * hover + slot / 2) / WIDTH) * 100}%` }} role="status">
          <b>{point.label}</b>
          <span>
            {chart.series}: {formatValue(point.value, chart.format)}
          </span>
          {chart.targetSeries && point.target !== null && (
            <span>
              {chart.targetSeries}: {formatValue(point.target, chart.format)}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
