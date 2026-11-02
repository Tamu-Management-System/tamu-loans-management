import { useId, useState } from "react";
import { ApiError } from "../../api/client";
import { useReturnFromRecovery, useSendToRecovery } from "../../api/loans";
import type { RecoveryReason } from "../../api/types";
import { Dialog, Field, RadioOption } from "../../components/ui/Dialog";
import { useToast } from "../../components/ui/Toast";
import { formatUGX, dayCount } from "../../lib/format";
import styles from "./RecoveryDialogs.module.css";

const REASONS: { value: RecoveryReason; label: string; description: string }[] = [
  { value: "long-overdue", label: "Long overdue", description: "Payments have been missed for too long." },
  { value: "unreachable", label: "Can't be reached", description: "Phone off, moved, or not found at home or work." },
  { value: "refuses-to-pay", label: "Refuses to pay", description: "Says they won't pay or keeps breaking promises." },
  { value: "other", label: "Other", description: "Explain in the note." },
];

interface LoanSummary {
  id: string;
  borrowerName: string;
  balance: number;
  daysPastDue: number;
}

/** Hands a loan to the recovery team, with a reason (recorded on the borrower's timeline and in the audit log). */
export function SendToRecoveryDialog({ loan, onClose }: { loan: LoanSummary; onClose: () => void }) {
  const noteId = useId();
  const showToast = useToast();
  const send = useSendToRecovery(loan.id);
  const [reason, setReason] = useState<RecoveryReason | null>(loan.daysPastDue > 0 ? "long-overdue" : null);
  const [note, setNote] = useState("");
  const noteRequired = reason === "other";

  const submit = () => {
    if (!reason || (noteRequired && !note.trim())) return;
    send
      .mutateAsync({ reason, note: note.trim() || null })
      .then(() => {
        showToast({ message: `${loan.id} is with the recovery team.` });
        onClose();
      })
      .catch(() => undefined /* shown in the dialog */);
  };

  const error = send.error instanceof ApiError ? send.error.message : send.error ? "That didn't go through. Try again." : null;
  return (
    <Dialog
      title={`Send ${loan.id} to recovery`}
      subtitle={`${loan.borrowerName} · ${formatUGX(loan.balance)} to pay${loan.daysPastDue > 0 ? ` · ${dayCount(loan.daysPastDue)} late` : ""}`}
      submitLabel="Send to recovery"
      submittingLabel="Sending…"
      submitting={send.isPending}
      submitDisabled={!reason || (noteRequired && !note.trim())}
      error={error}
      onSubmit={submit}
      onClose={onClose}
    >
      <div role="radiogroup" aria-label="Reason">
        {REASONS.map((option) => (
          <RadioOption key={option.value} name="reason" value={option.value} checked={reason === option.value} onChange={() => setReason(option.value)} label={option.label} description={option.description} />
        ))}
      </div>
      <Field label={noteRequired ? "Note" : "Note (optional)"} htmlFor={noteId} hint="The recovery team sees this, e.g. where the borrower was last seen.">
        <textarea id={noteId} className={styles.note} rows={3} value={note} onChange={(event) => setNote(event.target.value)} />
      </Field>
    </Dialog>
  );
}

/** Brings a loan back to its loan officer, e.g. once the arrears are paid or a payment plan is agreed. */
export function ReturnFromRecoveryDialog({ loan, onClose }: { loan: LoanSummary; onClose: () => void }) {
  const noteId = useId();
  const showToast = useToast();
  const bringBack = useReturnFromRecovery(loan.id);
  const [note, setNote] = useState("");

  const submit = () => {
    if (!note.trim()) return;
    bringBack
      .mutateAsync({ note: note.trim() })
      .then(() => {
        showToast({ message: `${loan.id} is back with the loan officer.` });
        onClose();
      })
      .catch(() => undefined /* shown in the dialog */);
  };

  const error = bringBack.error instanceof ApiError ? bringBack.error.message : bringBack.error ? "That didn't go through. Try again." : null;
  return (
    <Dialog
      title={`Bring ${loan.id} back from recovery`}
      subtitle={`${loan.borrowerName} · ${formatUGX(loan.balance)} to pay`}
      submitLabel="Bring back"
      submittingLabel="Saving…"
      submitting={bringBack.isPending}
      submitDisabled={!note.trim()}
      error={error}
      onSubmit={submit}
      onClose={onClose}
    >
      <Field label="Why" htmlFor={noteId} hint="e.g. Paid the arrears, or agreed a payment plan of UGX 100,000 a week.">
        <textarea id={noteId} className={styles.note} rows={3} value={note} onChange={(event) => setNote(event.target.value)} autoFocus />
      </Field>
    </Dialog>
  );
}
