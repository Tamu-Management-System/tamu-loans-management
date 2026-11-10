import { useId, useState } from "react";
import { ApiError, newIdempotencyKey } from "../../api/client";
import { useEditPayment } from "../../api/payments";
import { usePayableLoans } from "../../api/worklist";
import type { LoanPayment } from "../../api/types";
import { Dialog, Field, SummaryBox } from "../../components/ui/Dialog";
import { formatUGX } from "../../lib/format";
import styles from "./RecordPaymentDialog.module.css";

interface EditPaymentDialogProps {
  payment: Pick<LoanPayment, "id" | "amount" | "method">;
  loanId: string;
  clientName: string;
  onClose: () => void;
  /** Called after saving, with the message to show */
  onChanged: (message: string) => void;
}

/**
 * Fixes a mistyped amount (200000 instead of 20000). It shows what was recorded, what it becomes and what the client
 * will then owe. The new amount can't be more than the client owes (counting this payment as not yet made), and a reason
 * is required: the old amount, the reason and who changed it stay on the payment and in the audit log.
 */
export function EditPaymentDialog({ payment, loanId, clientName, onClose, onChanged }: EditPaymentDialogProps) {
  const ids = { amount: useId(), reason: useId() };
  const { data: loans = [] } = usePayableLoans();
  const editPayment = useEditPayment(payment.id);
  // One key for this dialog: a double click or retry changes the payment once
  const [idempotencyKey] = useState(newIdempotencyKey);
  const [amountText, setAmountText] = useState(String(payment.amount));
  const [reason, setReason] = useState("");

  const owedNow = loans.find((loan) => loan.id === loanId)?.owedNow ?? 0;
  // What the client would owe if this payment hadn't been made: the most the amount can become
  const most = owedNow + payment.amount;
  const amount = Number(amountText);
  const validAmount = amountText !== "" && Number.isFinite(amount) && amount > 0;
  const tooMuch = validAmount && amount > most;
  const unchanged = validAmount && amount === payment.amount;
  const ready = validAmount && !tooMuch && !unchanged && reason.trim().length >= 3;

  const submit = () => {
    if (!ready) return;
    editPayment.mutate(
      { amount, reason: reason.trim(), idempotencyKey },
      {
        onSuccess: () => {
          onChanged(`Payment changed from ${formatUGX(payment.amount)} to ${formatUGX(amount)}.`);
          onClose();
        },
      },
    );
  };

  const error = editPayment.error instanceof ApiError ? editPayment.error.message : editPayment.error ? "The payment couldn't be changed. Try again." : null;

  return (
    <Dialog
      title="Edit payment"
      subtitle={`${clientName} · ${loanId} · ${payment.method}`}
      submitLabel="Save change"
      submitting={editPayment.isPending}
      submitDisabled={!ready}
      error={error}
      onSubmit={submit}
      onClose={onClose}
    >
      <Field label="Correct amount (UGX)" htmlFor={ids.amount} hint={`Recorded as ${formatUGX(payment.amount)}. The most it can be is ${formatUGX(most)}.`}>
        <input
          id={ids.amount}
          inputMode="numeric"
          autoComplete="off"
          value={amountText}
          // Whole shillings only: anything that isn't a digit is dropped
          onChange={(event) => setAmountText(event.target.value.replace(/\D/g, "").replace(/^0+/, ""))}
          aria-invalid={tooMuch}
          autoFocus
          required
        />
      </Field>

      <Field label="Why is it being changed?" htmlFor={ids.reason} hint="Kept with the payment and in the audit log.">
        <input id={ids.reason} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="e.g. typed an extra zero" maxLength={200} required />
      </Field>

      {validAmount && !unchanged && (
        <SummaryBox
          ariaLabel="Balance after this change"
          rows={[
            ["Recorded", formatUGX(payment.amount)],
            ["Changes to", formatUGX(amount)],
            ["Left to pay after", formatUGX(Math.max(0, most - amount))],
          ]}
        />
      )}
      {tooMuch && (
        <p role="alert" className={styles.tooMuch}>
          That's more than {clientName} owes. Enter {formatUGX(most)} or less.
        </p>
      )}
    </Dialog>
  );
}
