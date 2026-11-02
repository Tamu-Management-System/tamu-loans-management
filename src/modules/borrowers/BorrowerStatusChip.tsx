import type { BorrowerApplicationStatus, BorrowerStatus } from "../../api/types";
import styles from "./BorrowerStatusChip.module.css";
import { useSystemSettings } from "../../api/settings";
import { dayCount } from "../../lib/format";

interface BorrowerStatusChipProps {
  status: BorrowerStatus;
  daysPastDue?: number;
  applicationStatus?: BorrowerApplicationStatus;
}

/** Active, "N days late", Cleared or "Application · draft/submitted". */
export function BorrowerStatusChip({ status, daysPastDue = 0, applicationStatus }: BorrowerStatusChipProps) {
  // Red from the "seriously late" day in Loan rules
  const seriouslyLate = useSystemSettings().data?.loanRules.seriouslyLateDays ?? 30;
  switch (status) {
    case "active":
      return <span className={`${styles.chip} ${styles.chipActive}`}>Active</span>;
    case "in-arrears":
      return <span className={`${styles.chip} ${daysPastDue >= seriouslyLate ? styles.chipDanger : styles.chipWarning}`}>{dayCount(daysPastDue)} late</span>;
    case "cleared":
      return <span className={`${styles.chip} ${styles.chipNeutral}`}>Cleared</span>;
    case "applicant":
      return <span className={`${styles.chip} ${styles.chipInfo}`}>Application · {applicationStatus ?? "draft"}</span>;
  }
}
