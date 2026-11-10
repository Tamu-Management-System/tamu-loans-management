import type { ReactNode } from "react";
import { useNavigate } from "react-router";
import type { WorklistAction, WorklistTask } from "../../api/types";
import { useSystemSettings } from "../../api/settings";
import { useFeatureFlags } from "../../app/featureFlags";
import { useAuth } from "../../auth/AuthContext";
import { Button } from "../../components/ui/Button";
import { Icon } from "../../components/ui/Icon";
import { formatUGX } from "../../lib/format";
import { amountLabel, describeStatus, describeSubject } from "./taskDescriptions";
import { PRIORITY_LABEL, taskAmount } from "./worklistConfig";
import styles from "./Worklist.module.css";

export interface WorklistRowHandlers {
  onRecordPayment: (task: WorklistTask) => void;
  onLogCall: (task: WorklistTask) => void;
  onCompleteApplication: (task: WorklistTask) => void;
  onMatchPayment: (task: WorklistTask) => void;
  onSendSms: (task: WorklistTask) => void;
  onAction: (task: WorklistTask, action: WorklistAction) => void;
}

function RowActions({ task, handlers }: { task: WorklistTask; handlers: WorklistRowHandlers }) {
  const { showUpcomingModules } = useFeatureFlags();
  const { can } = useAuth();
  const navigate = useNavigate();
  const borrowerName = describeSubject(task).name;

  const smsButton = (
    <Button
      variant="icon"
      size="small"
      onClick={() => handlers.onSendSms(task)}
      disabled={!showUpcomingModules}
      aria-label={showUpcomingModules ? `Send SMS to ${borrowerName}` : `Send SMS to ${borrowerName}, coming in Phase 2`}
      title={showUpcomingModules ? "Send SMS" : "SMS · coming in Phase 2"}
    >
      <Icon name="message" size={16} strokeWidth={1.8} />
    </Button>
  );
  const callButton = (
    <Button variant="icon" size="small" onClick={() => handlers.onLogCall(task)} aria-label={`Log a call with ${borrowerName}`} title="Log a call">
      <Icon name="phone" size={16} strokeWidth={1.8} />
    </Button>
  );

  let actions: ReactNode;
  switch (task.type) {
    case "instalment-due":
    case "promise-due":
      actions = (
        <>
          <Button size="small" onClick={() => handlers.onRecordPayment(task)}>Record payment</Button>
          {callButton}
          {smsButton}
        </>
      );
      break;
    case "overdue":
      actions = (
        <>
          <Button size="small" onClick={() => handlers.onLogCall(task)}>Log call</Button>
          <Button variant="secondary" size="small" onClick={() => handlers.onRecordPayment(task)}>Record payment</Button>
          {smsButton}
        </>
      );
      break;
    case "application-incomplete":
      actions = <Button size="small" onClick={() => handlers.onCompleteApplication(task)}>Complete application</Button>;
      break;
    case "payment-unmatched":
      actions = <Button size="small" onClick={() => handlers.onMatchPayment(task)}>Match payment</Button>;
      break;
    case "reversal-request":
      actions = (
        <>
          <Button size="small" onClick={() => handlers.onAction(task, "approve-reversal")}>Approve reversal</Button>
          <Button variant="secondary" size="small" onClick={() => handlers.onAction(task, "reject-reversal")}>Reject</Button>
        </>
      );
      break;
    // Whoever can decide or pay out does it; anyone else (e.g. an admin) can only nudge Finance
    case "awaiting-approval":
      actions = can("applications.approve") ? (
        <Button size="small" onClick={() => navigate(`/applications/${task.applicationId}`)}>Review</Button>
      ) : (
        <Button size="small" onClick={() => handlers.onAction(task, "remind-finance")}>Remind Finance</Button>
      );
      break;
    case "awaiting-disbursement":
      actions = can("loans.disburse") ? (
        <Button size="small" onClick={() => navigate("/loans/to-disburse")}>Pay out</Button>
      ) : (
        <Button size="small" onClick={() => handlers.onAction(task, "remind-finance")}>Remind Finance</Button>
      );
      break;
    case "access-request":
      actions =
        task.kind === "password-reset" ? (
          <Button size="small" onClick={() => handlers.onAction(task, "send-reset-link")}>Send reset link</Button>
        ) : (
          <Button size="small" onClick={() => handlers.onAction(task, "resend-invite")}>Resend invite</Button>
        );
      break;
  }
  return <div className={styles.actions}>{actions}</div>;
}

/** One task in the worklist: priority bar, subject, status, amount and actions. */
export function WorklistRow({ task, handlers }: { task: WorklistTask; handlers: WorklistRowHandlers }) {
  const subject = describeSubject(task);
  const status = describeStatus(task, useSystemSettings().data?.loanRules);
  const amount = taskAmount(task);
  const label = amountLabel(task);
  const warning = "warning" in task ? task.warning : undefined;

  return (
    <div className={`${styles.row} ${styles[`priority-${task.priority}`]}`} id={`task-${task.id}`}>
      <div>
        <span className="sr-only">{PRIORITY_LABEL[task.priority]}. </span>
        <div className={styles.subjectName}>
          {subject.name} <span className={styles.reference}>{subject.reference}</span>
        </div>
        <div className={styles.secondaryText}>{subject.detail}</div>
        {warning && (
          <div className={`${styles.secondaryText} ${styles.warningLine}`}>
            <Icon name="warning" size={13} strokeWidth={1.8} />
            <span>{warning}</span>
          </div>
        )}
        {task.notes.length > 0 && (
          <div className={styles.notes}>
            {task.notes.map((note, index) => (
              <span key={index}>{note}</span>
            ))}
          </div>
        )}
      </div>
      <div>
        <span className={`${styles.chip} ${styles[`chip-${status.tone}`]}`}>{status.label}</span>
        <div className={styles.secondaryText}>{status.detail}</div>
      </div>
      <div>
        {amount !== null && <div className={styles.amount}>{formatUGX(amount)}</div>}
        {label && <div className={styles.secondaryText}>{label}</div>}
      </div>
      <RowActions task={task} handlers={handlers} />
    </div>
  );
}

