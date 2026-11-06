import { useRef, useState } from "react";
import { useNavigate } from "react-router";
import { ApiError } from "../../api/client";
import type { InstalmentDueTask, OverdueTask, PromiseDueTask, WorklistAction, WorklistTask } from "../../api/types";
import { useUndoTask, useWorklist, useWorklistAction } from "../../api/worklist";
import { useFeatureFlags } from "../../app/featureFlags";
import { ComingSoon } from "../../components/ui/ComingSoon";
import { Icon } from "../../components/ui/Icon";
import { useToast } from "../../components/ui/Toast";
import { formatUGX } from "../../lib/format";
import { LogCallDialog } from "./LogCallDialog";
import { describeSubject } from "./taskDescriptions";
import { byUrgency, MAX_ROWS_PER_GROUP, PRIORITY_LABEL, TASK_GROUP, taskAmount, WORKLIST_GROUPS, type WorklistGroup } from "./worklistConfig";
import { useWorklistFilter } from "./worklistFilter";
import { WorklistRow, type WorklistRowHandlers } from "./WorklistRow";
import styles from "./Worklist.module.css";

type LoanTask = InstalmentDueTask | PromiseDueTask | OverdueTask;
const isLoanTask = (task: WorklistTask): task is LoanTask => task.type === "instalment-due" || task.type === "promise-due" || task.type === "overdue";

const ACTION_MESSAGES: Record<WorklistAction, (name: string, reference: string) => string> = {
  "approve-reversal": (_, reference) => `Reversal approved for ${reference}`,
  "reject-reversal": (_, reference) => `Reversal rejected for ${reference}`,
  "remind-finance": (name) => `Reminder sent to Finance about ${name}`,
  "send-reset-link": (name) => `Reset link sent to ${name}`,
  "resend-invite": (name) => `Invite resent to ${name}`,
};

interface WorklistProps {
  /** Opens the Record payment dialog, for a loan or (without one) for any client */
  onRecordPayment: (loanId?: string) => void;
  /** Shows a confirmation; with a task id it offers Undo */
  announce: (message: string, undoTaskId?: string | null) => void;
}

/** "Today's worklist": today's tasks grouped by type of work, most urgent first. */
export function Worklist({ onRecordPayment, announce }: WorklistProps) {
  const navigate = useNavigate();
  const showToast = useToast();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const { data: tasks, isPending, isError, refetch } = useWorklist();
  const { showUpcomingModules } = useFeatureFlags();
  const { selected, select } = useWorklistFilter();
  const runAction = useWorklistAction();
  const undoTask = useUndoTask();
  const [callTask, setCallTask] = useState<LoanTask | null>(null);

  if (isPending) return <section className={`${styles.card} ${styles.loading}`} aria-busy="true" aria-label="Today's worklist" />;
  if (isError)
    return (
      <section className={styles.card}>
        <p className={styles.loadError} role="alert">
          Today's worklist couldn't load. <button type="button" onClick={() => refetch()}>Try again</button>
        </p>
      </section>
    );
  if (tasks.length === 0) return null;

  // Phase 2 work (payment matching) is only counted when Phase 2 is switched on
  const isLive = (group: WorklistGroup) => !group.upcoming || showUpcomingModules;
  const liveTasks = tasks.filter((task) => isLive(WORKLIST_GROUPS.find((g) => g.id === TASK_GROUP[task.type])!));
  const doneTasks = liveTasks.filter((task) => task.status === "done");
  const openTasks = liveTasks.filter((task) => task.status === "open").sort(byUrgency);
  const presentGroups = WORKLIST_GROUPS.filter((group) => tasks.some((task) => TASK_GROUP[task.type] === group.id));
  // Tabs list upcoming (Phase 2) groups last, as in the design
  const tabGroups = [...presentGroups.filter((group) => !group.upcoming), ...presentGroups.filter((group) => group.upcoming)];
  const activeFilter = presentGroups.some((group) => group.id === selected && isLive(group)) ? selected : null;
  const visibleOpen = activeFilter ? openTasks.filter((task) => TASK_GROUP[task.type] === activeFilter) : openTasks;

  const handlers: WorklistRowHandlers = {
    onRecordPayment: (task) => onRecordPayment("loanId" in task ? task.loanId : undefined),
    onLogCall: (task) => isLoanTask(task) && setCallTask(task),
    onCompleteApplication: (task) => "applicationId" in task && navigate(`/applications/${task.applicationId}`),
    onMatchPayment: () => showToast({ message: "Payment matching comes with Module 4 (Phase 2)" }),
    onSendSms: () => showToast({ message: "SMS reminders come with Module 3 (Phase 2)" }),
    onAction: (task, action) => {
      const subject = describeSubject(task);
      runAction.mutate(
        { taskId: task.id, action },
        {
          onSuccess: () => announce(ACTION_MESSAGES[action](subject.name, subject.reference), task.id),
          onError: (error) => showToast({ message: error instanceof ApiError ? error.message : "That didn't work. Try again." }),
        },
      );
    },
  };

  const showAllOf = (groupId: WorklistGroup["id"]) => {
    select(groupId);
    headingRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const reopen = (task: WorklistTask) =>
    undoTask.mutate(task.id, {
      onSuccess: () => showToast({ message: "Moved back to today's list" }),
      onError: (error) => showToast({ message: error instanceof ApiError ? error.message : "That couldn't be undone." }),
    });

  const groupsInOrder = presentGroups.filter(isLive);
  const previewGroup = presentGroups.find((group) => !isLive(group));

  return (
    <section className={styles.card} aria-labelledby="worklist-heading">
      <div className={styles.header}>
        <div>
          <h3 id="worklist-heading" ref={headingRef} tabIndex={-1}>
            Today's worklist
          </h3>
          <p className={styles.subtitle}>Grouped by type of work, most urgent first in each group.</p>
        </div>
        <div className={styles.progress}>
          {doneTasks.length} of {liveTasks.length} done
          <span className={styles.progressTrack}>
            <span className={styles.progressFill} style={{ width: `${liveTasks.length ? (doneTasks.length / liveTasks.length) * 100 : 0}%` }} />
          </span>
        </div>
      </div>

      <div className={styles.toolbar}>
        <div className={styles.tabs} role="tablist" aria-label="Filter worklist">
          <button role="tab" aria-selected={!activeFilter} onClick={() => select(null)}>
            All <span className={styles.tabCount}>{openTasks.length}</span>
          </button>
          {tabGroups.map((group) =>
            isLive(group) ? (
              <button key={group.id} role="tab" aria-selected={activeFilter === group.id} onClick={() => select(group.id)}>
                {group.tabLabel}{" "}
                <span className={styles.tabCount}>{openTasks.filter((task) => TASK_GROUP[task.type] === group.id).length}</span>
              </button>
            ) : (
              <button key={group.id} role="tab" aria-selected={false} disabled title="Coming in Phase 2">
                {group.tabLabel} <span className={`${styles.tabCount} ${styles.tabCountUpcoming}`}>Soon</span>
              </button>
            ),
          )}
        </div>
        <div className={styles.legend} aria-label="Priority key">
          <span><i className={styles.legendDoFirst} />{PRIORITY_LABEL["do-first"]}</span>
          <span><i className={styles.legendDoToday} />{PRIORITY_LABEL["do-today"]}</span>
          <span><i className={styles.legendRoutine} />{PRIORITY_LABEL.routine}</span>
        </div>
      </div>

      {visibleOpen.length === 0 && !(!activeFilter && previewGroup) ? (
        <p className={styles.empty}>Nothing left here. Nice work.</p>
      ) : activeFilter ? (
        <div className={styles.flatList}>
          {visibleOpen.map((task) => (
            <WorklistRow key={task.id} task={task} handlers={handlers} />
          ))}
        </div>
      ) : (
        <div>
          {groupsInOrder.map((group) => {
            const groupTasks = visibleOpen.filter((task) => TASK_GROUP[task.type] === group.id);
            if (groupTasks.length === 0) return null;
            return <WorklistGroupSection key={group.id} group={group} tasks={groupTasks} handlers={handlers} onShowAll={() => showAllOf(group.id)} />;
          })}
          {previewGroup && (
            <UpcomingGroupPreview group={previewGroup} tasks={tasks.filter((task) => TASK_GROUP[task.type] === previewGroup.id && task.status === "open")} handlers={handlers} />
          )}
        </div>
      )}

      {doneTasks.length > 0 && (
        <details className={styles.done}>
          <summary>Done today ({doneTasks.length})</summary>
          {doneTasks.map((task) => {
            const subject = describeSubject(task);
            return (
              <div key={task.id} id={`done-task-${task.id}`} className={styles.doneRow}>
                <span className={styles.doneTick}>
                  <Icon name="check" size={14} strokeWidth={2.4} />
                </span>
                <div className={styles.doneText}>
                  <b>{subject.name}</b> <span className={styles.reference}>{subject.reference}</span>
                  <div className={styles.secondaryText}>{task.result}</div>
                </div>
                <button type="button" className={styles.undoButton} onClick={() => reopen(task)} disabled={undoTask.isPending}>
                  Undo
                </button>
              </div>
            );
          })}
        </details>
      )}

      {callTask && (
        <LogCallDialog
          task={callTask}
          onClose={() => setCallTask(null)}
          onPayingNow={() => {
            const loanId = callTask.loanId;
            setCallTask(null);
            onRecordPayment(loanId);
          }}
          onLogged={(message, taskId) => announce(message, taskId)}
        />
      )}
    </section>
  );
}

function WorklistGroupSection({ group, tasks, handlers, onShowAll }: { group: WorklistGroup; tasks: WorklistTask[]; handlers: WorklistRowHandlers; onShowAll: () => void }) {
  const urgent = tasks.filter((task) => task.priority === "do-first").length;
  const total = tasks.reduce((sum, task) => sum + (taskAmount(task) ?? 0), 0);

  return (
    <div className={styles.group}>
      <div className={styles.groupHeader}>
        <div>
          <h4>{group.title}</h4>
          <p className={styles.secondaryText}>{group.description}</p>
        </div>
        <div className={styles.groupStats}>
          {urgent > 0 && <span className={`${styles.chip} ${styles["chip-danger"]}`}>{urgent} to do first</span>}
          <span className={styles.groupTotal}>
            {tasks.length} {tasks.length === 1 ? "task" : "tasks"}
            {group.amountSuffix && ` · ${formatUGX(total)} ${group.amountSuffix}`}
          </span>
        </div>
      </div>
      {tasks.slice(0, MAX_ROWS_PER_GROUP).map((task) => (
        <WorklistRow key={task.id} task={task} handlers={handlers} />
      ))}
      {tasks.length >= MAX_ROWS_PER_GROUP && (
        <button type="button" className={styles.showAll} onClick={onShowAll}>
          Show all {tasks.length} in {group.tabLabel} →
        </button>
      )}
    </div>
  );
}

/** Phase 2 group shown blurred at the end of the list, under a "Coming soon" overlay. */
function UpcomingGroupPreview({ group, tasks, handlers }: { group: WorklistGroup; tasks: WorklistTask[]; handlers: WorklistRowHandlers }) {
  if (!group.upcoming || tasks.length === 0) return null;
  const PREVIEW_ROWS = 2;
  return (
    <ComingSoon feature={group.upcoming.feature} className={`${styles.group} ${styles.upcomingGroup}`}>
      <div className={styles.groupHeader}>
        <div>
          <h4>{group.title}</h4>
          <p className={styles.secondaryText}>{group.upcoming.previewDescription}</p>
        </div>
      </div>
      {tasks.slice(0, PREVIEW_ROWS).map((task) => (
        <WorklistRow key={task.id} task={task} handlers={handlers} />
      ))}
    </ComingSoon>
  );
}
