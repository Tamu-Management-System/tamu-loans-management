import { useState } from "react";
import { ApiError } from "../../api/client";
import type { CallOutcome, InstalmentDueTask, OverdueTask, PromiseDueTask } from "../../api/types";
import { useLogCallOutcome } from "../../api/worklist";
import { Dialog, RadioOption } from "../../components/ui/Dialog";
import { firstName, toDateInputValue } from "../../lib/format";
import styles from "./Worklist.module.css";

type LoanTask = InstalmentDueTask | PromiseDueTask | OverdueTask;
type Choice = "promised" | "no-answer" | "field-visit" | "paying-now";

const DEFAULT_PROMISE_DAYS = 3;

interface LogCallDialogProps {
  task: LoanTask;
  onClose: () => void;
  /** "Paying now" hands over to the Record payment dialog */
  onPayingNow: () => void;
  onLogged: (message: string, undoTaskId: string) => void;
}

/** Records the outcome of a call to a client. */
export function LogCallDialog({ task, onClose, onPayingNow, onLogged }: LogCallDialogProps) {
  const logCall = useLogCallOutcome();
  const today = new Date();
  const defaultPromise = new Date(today);
  defaultPromise.setDate(today.getDate() + DEFAULT_PROMISE_DAYS);

  const [choice, setChoice] = useState<Choice>("promised");
  const [promisedDate, setPromisedDate] = useState(toDateInputValue(defaultPromise));
  const borrower = task.borrower;

  const submit = () => {
    if (choice === "paying-now") {
      onPayingNow();
      return;
    }
    const outcome: CallOutcome = choice === "promised" ? { outcome: "promised", promisedDate } : { outcome: choice };
    const messages: Record<Exclude<Choice, "paying-now">, string> = {
      promised: `Promise logged for ${borrower.name}`,
      "no-answer": `Call logged. ${firstName(borrower.name)} stays on today's list`,
      "field-visit": `Field visit booked for ${borrower.name}`,
    };
    logCall.mutate(
      { taskId: task.id, outcome },
      {
        onSuccess: () => {
          onLogged(messages[choice], task.id);
          onClose();
        },
      },
    );
  };

  const error = logCall.error instanceof ApiError ? logCall.error.message : logCall.error ? "The call couldn't be logged. Try again." : null;

  return (
    <Dialog
      title="Log a call"
      subtitle={`${borrower.name} · ${task.loanId}`}
      submitLabel={choice === "paying-now" ? "Record payment" : "Save"}
      submitting={logCall.isPending}
      submitDisabled={choice === "promised" && !promisedDate}
      error={error}
      onSubmit={submit}
      onClose={onClose}
    >
      <p className={styles.dialogIntro}>
        Call <a href={`tel:${borrower.phone.replace(/\s/g, "")}`}>{borrower.phone}</a>, then record what happened.
      </p>
      <RadioOption name="outcome" value="promised" checked={choice === "promised"} onChange={() => setChoice("promised")} label="Promised to pay" description="You'll be reminded on the promised date">
        <input
          type="date"
          aria-label="Promised payment date"
          value={promisedDate}
          min={toDateInputValue(today)}
          onChange={(event) => setPromisedDate(event.target.value)}
          onFocus={() => setChoice("promised")}
        />
      </RadioOption>
      <RadioOption name="outcome" value="no-answer" checked={choice === "no-answer"} onChange={() => setChoice("no-answer")} label="No answer" description="Stays on today's list so you can try again" />
      <RadioOption name="outcome" value="field-visit" checked={choice === "field-visit"} onChange={() => setChoice("field-visit")} label="Needs a field visit" description="Adds a visit to tomorrow's list" />
      <RadioOption name="outcome" value="paying-now" checked={choice === "paying-now"} onChange={() => setChoice("paying-now")} label="Paying now" description="Record the payment next" />
    </Dialog>
  );
}
