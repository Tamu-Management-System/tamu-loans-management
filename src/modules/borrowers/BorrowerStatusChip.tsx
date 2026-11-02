import type { BorrowerApplicationStatus, BorrowerStatus } from "../../api/types";
import styles from "./BorrowerStatusChip.module.css";
import { dayCount } from "../../lib/format";

/** Past this many days late the chip turns red, in line with PAR30. */
const LATE_DAYS_DANGER = 30;

interface BorrowerStatusChipProps {
  status: BorrowerStatus;
  daysPastDue?: number;
  applicationStatus?: BorrowerApplicationStatus;
}

/** Active, "N days late", Cleared or "Application · draft/submitted". */
export function BorrowerStatusChip({ status, daysPastDue = 0, applicationStatus }: BorrowerStatusChipProps) {
  switch (status) {
    case "active":
      return <span className={`${styles.chip} ${styles.chipActive}`}>Active</span>;
    case "in-arrears":
      return <span className={`${styles.chip} ${daysPastDue > LATE_DAYS_DANGER ? styles.chipDanger : styles.chipWarning}`}>{dayCount(daysPastDue)} late</span>;
    case "cleared":
      return <span className={`${styles.chip} ${styles.chipNeutral}`}>Cleared</span>;
    case "applicant":
      return <span className={`${styles.chip} ${styles.chipInfo}`}>Application · {applicationStatus ?? "draft"}</span>;
  }
}
