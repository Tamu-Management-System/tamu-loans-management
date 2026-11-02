import { Link } from "react-router";
import { ACTIVITY_LIMIT } from "../../api/portfolio";
import type { ActivityList } from "../../api/types";
import { Avatar } from "../../components/ui/Avatar";
import { formatActivityTime } from "../../lib/format";
import styles from "./Portfolio.module.css";

/** What the team did in the system: a preview of the audit log (admins). */
export function RecentActivityCard({ activity }: { activity: ActivityList }) {
  return (
    <div className={styles.card}>
      <h3 className={styles.cardTitle}>Recent activity</h3>
      <p className={styles.cardSubtitle}>What your team did in the system</p>
      {activity.items.length === 0 ? (
        <p className={styles.empty}>No activity yet today.</p>
      ) : (
        activity.items.map((entry) => (
          <div key={entry.id} className={styles.listRow}>
            <Avatar name={entry.actor.name} src={entry.actor.photoUrl} size={30} />
            <div className={styles.listRowText}>
              <div className={styles.singleLine}>
                <b>{entry.actor.name}</b>
              </div>
              <div className={`${styles.secondaryLine} ${styles.singleLine}`} title={entry.description}>
                {entry.description}
              </div>
            </div>
            <time className={`${styles.mutedText} ${styles.noWrap}`} dateTime={entry.at}>
              {formatActivityTime(entry.at)}
            </time>
          </div>
        ))
      )}
      {activity.total >= ACTIVITY_LIMIT && (
        <Link to="/audit-log" className={styles.showAll}>
          Show full audit log →
        </Link>
      )}
    </div>
  );
}
