import { ComingSoon } from "../../components/ui/ComingSoon";
import { Icon, type IconName } from "../../components/ui/Icon";
import styles from "./TodaySummary.module.css";

export interface SummaryTileProps {
  label: string;
  icon: IconName;
  value: number;
  detail: string;
  /** 0–1, shown as a progress bar under the detail */
  progress?: number;
  selected: boolean;
  onSelect: () => void;
  /** Set for Phase 2 features: the tile is shown under the "Coming soon" overlay */
  upcoming?: { feature: string; module: string };
}

/** One "Today" box: a count of work, which filters the worklist when selected. */
export function SummaryTile({ label, icon, value, detail, progress, selected, onSelect, upcoming }: SummaryTileProps) {
  const tile = (
    <button className={styles.tile} aria-pressed={selected} onClick={onSelect} disabled={!!upcoming}>
      <span className={styles.tileLabel}>
        {label}
        <span className={styles.tileIcon}>
          <Icon name={icon} size={18} strokeWidth={1.8} />
        </span>
      </span>
      <span className={styles.tileValue}>{value}</span>
      <span className={styles.tileDetail}>{detail}</span>
      {progress !== undefined && (
        <span className={styles.progressTrack} role="progressbar" aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100}>
          <span className={styles.progressFill} style={{ width: `${Math.min(100, progress * 100)}%` }} />
        </span>
      )}
    </button>
  );

  if (!upcoming) return tile;
  return (
    <ComingSoon feature={upcoming.feature} module={upcoming.module} compact className={styles.upcomingTile}>
      {tile}
    </ComingSoon>
  );
}
