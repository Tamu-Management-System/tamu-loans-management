import { Link } from "react-router";
import type { OfficerPerformance } from "../../api/types";
import { Avatar } from "../../components/ui/Avatar";
import { formatCompactAmount, formatUGXMillions } from "../../lib/format";
import shared from "./Portfolio.module.css";
import styles from "./TeamPerformanceCard.module.css";

/** Most officers the card lists; reaching it adds a "Show all" link to Reports. */
const MAX_OFFICERS = 5;

/** Each officer's portfolio, PAR30 and today's collections, highest PAR30 first (admins). */
export function TeamPerformanceCard({ officers, targetPercent }: { officers: OfficerPerformance[]; targetPercent: number }) {
  return (
    <div className={`${shared.card} ${styles.card}`}>
      <h3 className={shared.cardTitle}>Team performance</h3>
      <p className={shared.cardSubtitle}>Whole market, highest PAR30 first</p>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>OFFICER</th>
            <th className={`${styles.numeric} ${styles.portfolioColumn}`}>PORTFOLIO</th>
            <th className={styles.numeric}>PAR30</th>
            <th className={styles.numeric}>COLLECTED TODAY</th>
          </tr>
        </thead>
        <tbody>
          {officers.slice(0, MAX_OFFICERS).map((officer) => (
            <tr key={officer.officerId}>
              <td>
                <span className={styles.officer}>
                  <Avatar name={officer.name} src={officer.photoUrl} />
                  <span>
                    {officer.name}
                    <span className={styles.portfolioUnderName}>{formatUGXMillions(officer.portfolioAmount)} portfolio</span>
                  </span>
                </span>
              </td>
              <td className={`${styles.numeric} ${styles.portfolioColumn}`}>{formatUGXMillions(officer.portfolioAmount)}</td>
              <td className={`${styles.numeric} ${styles.parCell}`}>
                <span className={`${styles.chip} ${officer.par30Percent > targetPercent ? styles.chipAbove : styles.chipWithin}`}>
                  {officer.par30Percent.toFixed(1)}%
                </span>
              </td>
              <td className={`${styles.numeric} ${styles.collectedCell}`}>
                {formatCompactAmount(officer.collectedToday)} / {formatCompactAmount(officer.expectedToday)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {officers.length >= MAX_OFFICERS && (
        <Link to="/reports" className={shared.showAll}>
          Show all {officers.length} officers in Reports →
        </Link>
      )}
    </div>
  );
}
