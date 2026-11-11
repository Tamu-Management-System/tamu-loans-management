import { useState } from "react";
import { ApiError } from "../../api/client";
import type { PaymentUnmatchedTask } from "../../api/types";
import { useMatchCandidates, useMatchPayment } from "../../api/worklist";
import { Dialog, RadioOption } from "../../components/ui/Dialog";
import { formatTime, formatUGX } from "../../lib/format";
import styles from "./Worklist.module.css";

interface MatchPaymentDialogProps {
  task: PaymentUnmatchedTask;
  onClose: () => void;
  onMatched: (message: string, taskId: string) => void;
}

/** Puts mobile money that arrived without a loan on the right loan, from the likely matches. */
export function MatchPaymentDialog({ task, onClose, onMatched }: MatchPaymentDialogProps) {
  const { payment } = task;
  const { data: candidates, isPending, isError } = useMatchCandidates(task.id);
  const match = useMatchPayment(task.id);
  const [chosen, setChosen] = useState<string | null>(null);
  // The first suggestion is ticked until someone picks another
  const loanId = chosen ?? candidates?.[0]?.loanId ?? null;

  const submit = () => {
    if (!loanId) return;
    const target = candidates?.find((candidate) => candidate.loanId === loanId);
    match
      .mutateAsync({ loanId })
      .then(() => {
        onMatched(`${formatUGX(payment.amount)} matched to ${target?.borrowerName ?? loanId}`, task.id);
        onClose();
      })
      .catch(() => undefined /* shown in the dialog */);
  };

  const error = match.error instanceof ApiError ? match.error.message : match.error ? "That didn't go through. Try again." : null;
  return (
    <Dialog
      title="Match payment"
      subtitle={`${payment.provider} · ref ${payment.reference}`}
      submitLabel="Match payment"
      submittingLabel="Matching…"
      submitting={match.isPending}
      submitDisabled={!loanId}
      error={error}
      onSubmit={submit}
      onClose={onClose}
    >
      <p className={styles.matchSummary}>
        <b>{formatUGX(payment.amount)}</b> from {payment.phone} at {formatTime(payment.receivedAt)}
      </p>
      <p className={styles.matchHeading}>Likely matches</p>
      {isPending ? (
        <p className={styles.secondaryText}>Looking for the loan…</p>
      ) : isError ? (
        <p className={styles.secondaryText}>The matches didn't load. Close this and try again.</p>
      ) : candidates.length === 0 ? (
        <p className={styles.secondaryText}>No loan has this phone number or this amount due.</p>
      ) : (
        <div role="radiogroup" aria-label="Loan">
          {candidates.map((candidate) => (
            <RadioOption
              key={candidate.loanId}
              name="loan"
              value={candidate.loanId}
              checked={loanId === candidate.loanId}
              onChange={() => setChosen(candidate.loanId)}
              label={`${candidate.borrowerName} · ${candidate.loanId}`}
              description={`${candidate.phone} · ${candidate.reason} · owes ${formatUGX(candidate.owedNow)}`}
            />
          ))}
        </div>
      )}
      <p className={`${styles.secondaryText} ${styles.matchNote}`}>Not listed? Record the payment from Payments, with the client's loan.</p>
    </Dialog>
  );
}
