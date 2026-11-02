import { Link } from "react-router";
import { ApiError } from "../../api/client";
import { EARLY_WARNINGS_LIMIT, useAddToWorklist } from "../../api/portfolio";
import type { EarlyWarningList } from "../../api/types";
import { Icon } from "../../components/ui/Icon";
import { useToast } from "../../components/ui/Toast";
import { revealWorklistTask } from "../dashboard/revealWorklistTask";
import { TASK_GROUP } from "../dashboard/worklistConfig";
import { useWorklistFilter } from "../dashboard/worklistFilter";
import styles from "./Portfolio.module.css";
import { dayCount } from "../../lib/format";

interface EarlyWarningsCardProps {
  warnings: EarlyWarningList;
  /** Confirmation with Undo, shared with the rest of the dashboard */
  announce: (message: string, undoTaskId?: string | null) => void;
}

/** Borrowers showing signs of trouble before they fall further behind (Module 3). */
export function EarlyWarningsCard({ warnings, announce }: EarlyWarningsCardProps) {
  const addToWorklist = useAddToWorklist();
  const showToast = useToast();
  const { select } = useWorklistFilter();

  const add = (loanId: string, borrowerName: string) =>
    addToWorklist.mutate(loanId, {
      onSuccess: (task) => announce(`${borrowerName} added to today's worklist`, task.id),
      onError: (error) => showToast({ message: error instanceof ApiError ? error.message : "That couldn't be added. Try again." }),
    });

  // Open the task's tab (or "All" for done tasks, which sit in "Done today"), then scroll to it
  const reveal = (task: NonNullable<EarlyWarningList["items"][number]["worklistTask"]>) => {
    select(task.status === "open" ? TASK_GROUP[task.type] : null);
    revealWorklistTask(task.id);
  };

  return (
    <div className={styles.card}>
      <h3 className={styles.cardTitle}>Early warnings</h3>
      <p className={styles.cardSubtitle}>Borrowers showing signs of trouble before they fall further behind</p>

      {warnings.items.length === 0 ? (
        <p className={styles.empty}>No warnings right now.</p>
      ) : (
        <>
          <div className={styles.listHeader} aria-hidden="true">
            <span>BORROWER</span>
            <span>ACTION</span>
          </div>
          {warnings.items.map((item) => (
            <div key={item.loanId} className={styles.listRow}>
              <div className={styles.listRowText}>
                <b>{item.borrowerName}</b>{" "}
                <span className={styles.mutedText}>
                  <span className={styles.noWrap}>{item.loanId}</span> · {item.daysPastDue ? `${dayCount(item.daysPastDue)} late` : "up to date"}
                </span>
                <div className={styles.warningLine}>
                  <Icon name="warning" size={13} strokeWidth={1.8} />
                  <span>{item.signal}</span>
                </div>
              </div>
              {item.worklistTask ? (
                <button type="button" className={styles.listButton} onClick={() => reveal(item.worklistTask!)}>
                  {item.worklistTask.status === "done" ? "Done today ✓" : "In today's list"}
                </button>
              ) : (
                <button type="button" className={styles.listButton} onClick={() => add(item.loanId, item.borrowerName)} disabled={addToWorklist.isPending}>
                  Add to today
                </button>
              )}
            </div>
          ))}
        </>
      )}

      {warnings.total >= EARLY_WARNINGS_LIMIT && (
        <Link to="/arrears" className={styles.showAll}>
          Show all {warnings.total} in Arrears &amp; SMS →
        </Link>
      )}
    </div>
  );
}
