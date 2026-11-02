import { useId, useState } from "react";
import type { ReportChart as Chart, ReportValueFormat } from "../../api/types";
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

/** A trend needs at least two points; a single day is shown as a column instead */
const MIN_TREND_POINTS = 2;

export function ReportChart({ chart }: { chart: Chart }) {
  const empty = chart.points.every((point) => point.value === 0 && !point.target);
  const kind = chart.kind === "trend" && chart.points.length < MIN_TREND_POINTS ? "columns" : chart.kind;
  return (
    <figure className={styles.chartFigure}>
      <figcaption className={styles.chartTitle}>
        {chart.title}
        {kind !== "donut" && chart.targetSeries && (
          <span className={styles.legend}>
            <span>
              <i className={styles.legendLine} />
              {chart.series}
            </span>
            <span>
              <i className={kind === "columns" ? styles.legendTarget : styles.legendDashed} />
              {chart.targetSeries}
            </span>
          </span>
        )}
      </figcaption>
      {empty ? (
        <p className={styles.chartEmpty}>Nothing in these dates.</p>
      ) : kind === "donut" ? (
        <Donut chart={chart} />
      ) : kind === "bars" ? (
        <VerticalBars chart={chart} />
      ) : kind === "trend" ? (
        <Trend chart={chart} />
      ) : (
        <Columns chart={chart} />
      )}
    </figure>
  );
}

const WIDTH = 720;
const HEIGHT = 220;
const LEFT = 44;
const BOTTOM = 24;
const TOP = 8;
const PLOT_WIDTH = WIDTH - LEFT;
const PLOT_HEIGHT = HEIGHT - TOP - BOTTOM;

/** The value scale shared by columns and trends, with gridlines at 0, half and the top */
function useScale(chart: Chart) {
  const max = niceMax(Math.max(...chart.points.map((p) => Math.max(p.value, p.target ?? 0))));
  const y = (value: number) => TOP + PLOT_HEIGHT - (value / max) * PLOT_HEIGHT;
  return { y, ticks: [0, 0.5, 1].map((share) => share * max) };
}

function Gridlines({ chart, y, ticks }: { chart: Chart; y: (value: number) => number; ticks: number[] }) {
  return ticks.map((tick) => (
    <g key={tick}>
      <line x1={LEFT} x2={WIDTH} y1={y(tick)} y2={y(tick)} className={tick === 0 ? styles.axis : styles.grid} />
      <text x={LEFT - 8} y={y(tick)} dy="0.32em" textAnchor="end" className={styles.tickLabel}>
        {axisValue(tick, chart.format)}
      </text>
    </g>
  ));
}

function Tooltip({ chart, index, x }: { chart: Chart; index: number; x: number }) {
  const point = chart.points[index];
  return (
    <div className={styles.tooltip} style={{ left: `${(x / WIDTH) * 100}%` }} role="status">
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
  );
}

const describe = (chart: Chart) => `${chart.title}. ${chart.points.map((p) => `${p.label}: ${formatValue(p.value, chart.format)}`).join(", ")}`;

/** Area line over time, like the dashboard's PAR30 trend; the second series (e.g. expected) is a dashed line. */
function Trend({ chart }: { chart: Chart }) {
  const gradientId = useId();
  const [hover, setHover] = useState<number | null>(null);
  const { y, ticks } = useScale(chart);
  const step = PLOT_WIDTH / (chart.points.length - 1);
  const x = (index: number) => LEFT + step * index;
  const line = (values: number[]) => values.map((value, index) => `${x(index).toFixed(1)},${y(value).toFixed(1)}`).join(" ");
  const main = line(chart.points.map((p) => p.value));
  const hasTarget = chart.targetSeries !== null && chart.points.some((p) => p.target !== null);
  const labelEvery = Math.ceil(chart.points.length / 10);

  return (
    <div className={styles.columnsWrap} onPointerLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className={styles.columns} role="img" aria-label={describe(chart)}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" style={{ stopColor: "var(--color-primary)", stopOpacity: 0.22 }} />
            <stop offset="1" style={{ stopColor: "var(--color-primary)", stopOpacity: 0 }} />
          </linearGradient>
        </defs>
        <Gridlines chart={chart} y={y} ticks={ticks} />
        <polygon points={`${main} ${x(chart.points.length - 1)},${y(0)} ${LEFT},${y(0)}`} fill={`url(#${gradientId})`} />
        {hasTarget && <polyline points={line(chart.points.map((p) => p.target ?? 0))} className={styles.trendTarget} />}
        <polyline points={main} className={styles.trendLine} />
        {chart.points.map((p, index) =>
          index % labelEvery === 0 ? (
            <text key={index} x={x(index)} y={HEIGHT - 6} textAnchor={index === 0 ? "start" : "middle"} className={styles.tickLabel}>
              {p.label}
            </text>
          ) : null,
        )}
        {hover !== null && (
          <g pointerEvents="none">
            <line x1={x(hover)} x2={x(hover)} y1={TOP} y2={TOP + PLOT_HEIGHT} className={styles.crosshair} />
            {hasTarget && <circle cx={x(hover)} cy={y(chart.points[hover].target ?? 0)} r="4" className={styles.trendTargetDot} />}
            <circle cx={x(hover)} cy={y(chart.points[hover].value)} r="5" className={styles.trendDot} />
          </g>
        )}
        {/* Hover targets: one slice of the width per point */}
        {chart.points.map((_, index) => (
          <rect key={index} x={x(index) - step / 2} y={TOP} width={step} height={PLOT_HEIGHT} className={styles.hitArea} onPointerEnter={() => setHover(index)} />
        ))}
      </svg>
      {hover !== null && <Tooltip chart={chart} index={hover} x={x(hover)} />}
    </div>
  );
}

/** One column per day or week, with an optional target (e.g. expected) as a dark tick; used when there are too few points for a trend */
function Columns({ chart }: { chart: Chart }) {
  const [hover, setHover] = useState<number | null>(null);
  const { y, ticks } = useScale(chart);
  const slot = PLOT_WIDTH / chart.points.length;
  const barWidth = Math.max(3, Math.min(28, slot * 0.62));

  return (
    <div className={styles.columnsWrap} onPointerLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className={styles.columns} role="img" aria-label={describe(chart)}>
        <Gridlines chart={chart} y={y} ticks={ticks} />
        {chart.points.map((p, index) => {
          const x = LEFT + slot * index + (slot - barWidth) / 2;
          const top = y(p.value);
          const height = TOP + PLOT_HEIGHT - top;
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
              <text x={x + barWidth / 2} y={HEIGHT - 6} textAnchor="middle" className={styles.tickLabel}>
                {p.label}
              </text>
              <rect x={LEFT + slot * index} y={TOP} width={slot} height={PLOT_HEIGHT} className={styles.hitArea} onPointerEnter={() => setHover(index)} />
            </g>
          );
        })}
      </svg>
      {hover !== null && <Tooltip chart={chart} index={hover} x={LEFT + slot * hover + slot / 2} />}
    </div>
  );
}

const BARS_HEIGHT = 340;
const BARS_TOP = 26;
const BARS_BOTTOM = 30;

/** One column per category (e.g. each officer), its value on top; taller than a trend so it fills a card beside a donut */
function VerticalBars({ chart }: { chart: Chart }) {
  const [hover, setHover] = useState<number | null>(null);
  const highest = Math.max(...chart.points.map((p) => p.value));
  // Percentages: up to 100%, or the next 25% above when someone is over
  const max = chart.format === "percent" ? Math.max(100, Math.ceil(highest / 25) * 25) : niceMax(highest);
  // Round gridlines: every 25% for percentages (0, 25 … 125), otherwise 0, half and the top
  const ticks = chart.format === "percent" ? Array.from({ length: max / 25 + 1 }, (_, index) => index * 25) : [0, max / 2, max];
  const plotHeight = BARS_HEIGHT - BARS_TOP - BARS_BOTTOM;
  const y = (value: number) => BARS_TOP + plotHeight - (value / max) * plotHeight;
  const slot = PLOT_WIDTH / chart.points.length;
  const barWidth = Math.max(12, Math.min(64, slot * 0.55));

  return (
    <div className={styles.columnsWrap} onPointerLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${WIDTH} ${BARS_HEIGHT}`} className={styles.columns} role="img" aria-label={describe(chart)}>
        <Gridlines chart={chart} y={y} ticks={ticks} />
        {chart.points.map((p, index) => {
          const x = LEFT + slot * index + (slot - barWidth) / 2;
          const top = y(p.value);
          const height = BARS_TOP + plotHeight - top;
          const radius = Math.min(6, barWidth / 2, height);
          return (
            <g key={p.label}>
              {p.value > 0 && (
                <path
                  className={`${styles.column} ${hover === index ? styles.columnHover : ""}`}
                  d={`M${x},${top + height} V${top + radius} Q${x},${top} ${x + radius},${top} H${x + barWidth - radius} Q${x + barWidth},${top} ${x + barWidth},${top + radius} V${top + height} Z`}
                />
              )}
              <text x={x + barWidth / 2} y={top - 8} textAnchor="middle" className={styles.valueLabel}>
                {formatValue(p.value, chart.format)}
              </text>
              <text x={x + barWidth / 2} y={BARS_HEIGHT - 8} textAnchor="middle" className={styles.categoryLabel}>
                {p.label}
              </text>
              <rect x={LEFT + slot * index} y={BARS_TOP} width={slot} height={plotHeight} className={styles.hitArea} onPointerEnter={() => setHover(index)} />
            </g>
          );
        })}
      </svg>
      {hover !== null && <Tooltip chart={chart} index={hover} x={LEFT + slot * hover + slot / 2} />}
    </div>
  );
}

/** Slice colours: categories in a fixed order (checked for colour blindness), or "up to date" then light-to-dark for ordered bands */
const CATEGORY_COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];
const ORDERED_COLORS = ["var(--chart-1)", "var(--chart-late-1)", "var(--chart-late-2)", "var(--chart-late-3)", "var(--chart-late-4)"];
const DONUT_SIZE = 180;
const RING = 26;

/** How a total splits: a ring with the total in the middle and a legend with each share. */
function Donut({ chart }: { chart: Chart }) {
  const [hover, setHover] = useState<number | null>(null);
  const colors = chart.ordered ? ORDERED_COLORS : CATEGORY_COLORS;
  // More slices than colours fold into "Other"
  const points =
    chart.points.length > colors.length
      ? [...chart.points.slice(0, colors.length - 1), { label: "Other", value: chart.points.slice(colors.length - 1).reduce((t, p) => t + p.value, 0), target: null }]
      : chart.points;
  const total = points.reduce((t, p) => t + p.value, 0);
  const radius = (DONUT_SIZE - RING) / 2;
  const circumference = 2 * Math.PI * radius;
  const share = (value: number) => (total > 0 ? value / total : 0);
  const percent = (value: number) => `${(share(value) * 100).toFixed(share(value) < 0.1 ? 1 : 0)}%`;
  const focus = hover !== null ? points[hover] : null;
  const slices = points.filter((p) => p.value > 0).length;
  // A thin surface gap between slices; none when one slice fills the ring
  const gap = slices > 1 ? 2.5 : 0;
  let offset = 0;

  return (
    <div className={styles.donut} onPointerLeave={() => setHover(null)}>
      <div className={styles.donutRing}>
        <svg viewBox={`0 0 ${DONUT_SIZE} ${DONUT_SIZE}`} role="img" aria-label={`${chart.title}. ${points.map((p) => `${p.label}: ${formatValue(p.value, chart.format)} (${percent(p.value)})`).join(", ")}`}>
          <circle cx={DONUT_SIZE / 2} cy={DONUT_SIZE / 2} r={radius} className={styles.donutTrack} strokeWidth={RING} />
          {points.map((p, index) => {
            const length = share(p.value) * circumference;
            const start = offset;
            offset += length;
            if (p.value <= 0) return null;
            return (
              <circle
                key={p.label}
                cx={DONUT_SIZE / 2}
                cy={DONUT_SIZE / 2}
                r={radius}
                fill="none"
                stroke={colors[index]}
                strokeWidth={hover === index ? RING + 6 : RING}
                strokeDasharray={`${Math.max(0, length - gap)} ${circumference}`}
                strokeDashoffset={-start}
                transform={`rotate(-90 ${DONUT_SIZE / 2} ${DONUT_SIZE / 2})`}
                className={`${styles.donutSlice} ${hover !== null && hover !== index ? styles.donutDim : ""}`}
                onPointerEnter={() => setHover(index)}
              />
            );
          })}
        </svg>
        <div className={styles.donutCentre} aria-hidden="true">
          <span>{focus ? focus.label : "Total"}</span>
          <b>{axisValue(focus ? focus.value : total, chart.format)}</b>
          {focus && <span>{percent(focus.value)}</span>}
        </div>
      </div>
      <ul className={styles.donutLegend}>
        {points.map((p, index) => (
          <li key={p.label} className={hover !== null && hover !== index ? styles.donutDim : undefined} onPointerEnter={() => setHover(index)}>
            <i style={{ background: colors[index] }} />
            <span className={styles.donutLabel}>{p.label}</span>
            <span className={styles.donutValue}>{formatValue(p.value, chart.format)}</span>
            <span className={styles.donutShare}>{percent(p.value)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
