import type { LoanPayment } from "../../api/types";
import { formatDate, formatTime, formatUGX } from "../../lib/format";
import styles from "./EditedNote.module.css";

/** "Edited · was UGX 200,000" for a payment whose amount was changed; hover (or focus) for who changed it, when and why. */
export function EditedNote({ payment }: { payment: Pick<LoanPayment, "edits"> }) {
  if (payment.edits.length === 0) return null;
  const details = payment.edits.map((edit) => `Changed from ${formatUGX(edit.from)} to ${formatUGX(edit.to)} by ${edit.by}, ${formatDate(edit.at)} ${formatTime(edit.at)}. Reason: ${edit.reason}`).join("\n");
  return (
    <span className={styles.edited} title={details} tabIndex={0} aria-label={details}>
      Edited · was {formatUGX(payment.edits[0].from)}
    </span>
  );
}
