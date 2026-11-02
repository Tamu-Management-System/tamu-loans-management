import type { ArrearsBreakdown } from "../../api/types";
import { formatUGXMillions } from "../../lib/format";
import styles from "./ArrearsInsightsCard.module.css";

/** Brighter white = older debt, one step per age band. */
const BAND_OPACITY = [0.4, 0.6, 0.8, 1];

/** Share of the portfolio that's current, overdue money split by age, then one row per band. */
export function ArrearsInsightsCard({ arrears }: { arrears: ArrearsBreakdown }) {
  const overdueAmount = arrears.bands.reduce((sum, band) => sum + band.amount, 0);
  const overdueLoans = arrears.bands.reduce((sum, band) => sum + band.loans, 0);
  const currentPercent = (arrears.current.amount / arrears.totalOutstanding) * 100;
  const splitLabel = `Overdue money by age: ${arrears.bands.map((band) => `${band.label} ${Math.round((band.amount / overdueAmount) * 100)}%`).join(", ")}`;

  return (
    <div className={styles.card}>
      <h3 className={styles.title}>
        Arrears
        <br />
        Insights
      </h3>
      <p className={styles.headline}>
        <b>{currentPercent.toFixed(1)}%</b>current
      </p>
      <p className={styles.overdue}>
        {formatUGXMillions(overdueAmount)} overdue across {overdueLoans} loans
      </p>

      <div className={styles.split} role="img" aria-label={splitLabel}>
        {arrears.bands.map((band, index) => (
          <i key={band.label} style={{ flexGrow: band.amount, background: `rgba(255, 255, 255, ${BAND_OPACITY[index]})` }} />
        ))}
      </div>

      <div className={styles.bands}>
        {arrears.bands.map((band, index) => (
          <div key={band.label} className={styles.band}>
            <i style={{ background: `rgba(255, 255, 255, ${BAND_OPACITY[index]})` }} />
            <span>{band.label}</span>
            <span className={styles.bandValue}>
              <b>{formatUGXMillions(band.amount)}</b> <span>· {band.loans} {band.loans === 1 ? "loan" : "loans"}</span>
            </span>
          </div>
        ))}
      </div>

      <div className={styles.collectionRate}>
        <div className={styles.collectionRateLine}>
          <span>Collection rate, last 30 days</span>
          <b>{arrears.collectionRatePercent}%</b>
        </div>
        <span className={styles.meter} role="progressbar" aria-valuenow={arrears.collectionRatePercent} aria-valuemin={0} aria-valuemax={100} aria-label="Collection rate, last 30 days">
          <span style={{ width: `${arrears.collectionRatePercent}%` }} />
        </span>
      </div>
    </div>
  );
}
