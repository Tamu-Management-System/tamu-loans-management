import { useId, useState } from "react";
import { ApiError, newIdempotencyKey } from "../../api/client";
import type { PaymentMethod } from "../../api/types";
import { usePayableLoans, useRecordPayment } from "../../api/worklist";
import { Dialog, Field, SummaryBox } from "../../components/ui/Dialog";
import { Select } from "../../components/ui/Select";
import { useSystemSettings } from "../../api/settings";
import { toDateInputValue } from "../../lib/format";
import { formatUGX } from "../../lib/format";
import styles from "./RecordPaymentDialog.module.css";


interface RecordPaymentDialogProps {
  /** Pre-selected loan (from a worklist row); omit to let the user pick a client */
  loanId?: string;
  onClose: () => void;
  /** Called after saving, with a confirmation message (and a task that can be undone, if any) */
  onRecorded: (message: string, undoTaskId: string | null) => void;
}

/**
 * Records a repayment. Before confirming, the user sees what the client owes, the amount being paid and what's
 * left. A payment can't be more than the client owes (the server checks too), so a typing mistake like an extra
 * zero can't go in, and nobody ever has to be refunded.
 */
export function RecordPaymentDialog({ loanId: initialLoanId, onClose, onRecorded }: RecordPaymentDialogProps) {
  const ids = { loan: useId(), amount: useId(), method: useId(), reference: useId(), paidOn: useId() };
  // Accepted methods, transaction IDs and back-dating follow Settings → Payments
  const { data: settings } = useSystemSettings();
  const rules = settings?.payments;
  const methods: PaymentMethod[] = rules?.repaymentMethods ?? ["Cash", "MTN MoMo", "Airtel Money"];
  const today = toDateInputValue(new Date());
  const earliest = toDateInputValue(new Date(Date.now() - (rules?.backdateDays ?? 0) * 86_400_000));
  const { data: loans = [], isPending: loansLoading } = usePayableLoans();
  const recordPayment = useRecordPayment();
  // One key for this dialog: if the same payment is sent twice (retry, double click), the server records it once
  const [idempotencyKey] = useState(newIdempotencyKey);

  const [loanId, setLoanId] = useState(initialLoanId ?? "");
  const [amountInput, setAmountInput] = useState<string | null>(null); // null = not edited yet
  const [chosenMethod, setMethod] = useState<PaymentMethod | null>(null);
  const method = chosenMethod && methods.includes(chosenMethod) ? chosenMethod : methods[0];
  const [reference, setReference] = useState("");
  const [paidOn, setPaidOn] = useState(today);
  const referenceNeeded = !!rules?.referenceRequired && method !== "Cash";

  const loan = loans.find((l) => l.id === loanId);
  // Until the user types, suggest what's due today
  const amountText = amountInput ?? (loan?.dueToday ? String(loan.dueToday) : "");
  const amount = Number(amountText);
  const validAmount = amountText !== "" && Number.isFinite(amount) && amount > 0;
  // The most a payment can be: what the client owes now (the balance plus any late fees)
  const owed = loan?.owedNow ?? 0;
  const tooMuch = !!loan && validAmount && amount > owed;
  const ready = !!loan && validAmount && !tooMuch && (!referenceNeeded || !!reference.trim()) && paidOn >= earliest && paidOn <= today;

  const submit = () => {
    if (!loan || !ready) return;
    recordPayment.mutate(
      { loanId: loan.id, amount, method, reference: reference.trim() || undefined, paidOn: paidOn === today ? undefined : paidOn, idempotencyKey },
      {
        onSuccess: (result) => {
          const cleared = result.balanceAfter <= 0 ? " Loan cleared." : "";
          // No quick undo for money: a mistyped amount is fixed with "Edit payment", which keeps the old amount and the reason
          onRecorded(`${formatUGX(amount)} recorded for ${loan.borrowerName}.${cleared}`, null);
          onClose();
        },
      },
    );
  };

  const error = recordPayment.error instanceof ApiError ? recordPayment.error.message : recordPayment.error ? "The payment couldn't be saved. Try again." : null;

  return (
    <Dialog
      title="Record payment"
      subtitle={initialLoanId && loan ? `${loan.borrowerName} · ${loan.id}` : "Cash or mobile money payment"}
      submitLabel="Confirm payment"
      submitting={recordPayment.isPending}
      submitDisabled={!ready}
      error={error}
      onSubmit={submit}
      onClose={onClose}
    >
      {!initialLoanId && (
        <Field label="Client" htmlFor={ids.loan}>
          <Select
            id={ids.loan}
            value={loanId}
            onChange={(id) => {
              setLoanId(id);
              setAmountInput(null);
            }}
            options={loans.map((option) => ({ value: option.id, label: `${option.borrowerName} · ${option.id}`, keywords: option.phone }))}
            placeholder={loansLoading ? "Loading clients…" : "Choose a client"}
            searchable
            searchPlaceholder="Name, loan ID or phone"
            disabled={loansLoading}
            autoFocus
          />
        </Field>
      )}

      <Field
        label="Amount (UGX)"
        htmlFor={ids.amount}
        hint={loan?.dueToday ? `Due today: ${formatUGX(loan.dueToday)}. Enter less for a part payment.` : loan ? `Owes ${formatUGX(owed)} in all.` : undefined}
      >
        <input
          id={ids.amount}
          inputMode="numeric"
          autoComplete="off"
          value={amountText}
          // Whole shillings only: anything that isn't a digit (minus signs, letters, decimals) is dropped
          onChange={(event) => setAmountInput(event.target.value.replace(/\D/g, "").replace(/^0+/, ""))}
          aria-invalid={tooMuch}
          autoFocus={!!initialLoanId}
          required
        />
      </Field>

      <Field label="Method" htmlFor={ids.method}>
        <Select id={ids.method} value={method} onChange={setMethod} options={methods.map((option) => ({ value: option, label: option }))} />
      </Field>

      <Field
        label={referenceNeeded ? "Transaction ID" : <>Reference <span className={styles.optional}>(optional)</span></>}
        htmlFor={ids.reference}
        hint={referenceNeeded ? "Required for mobile money, so the payment can be matched to the statement." : undefined}
      >
        <input id={ids.reference} value={reference} onChange={(event) => setReference(event.target.value)} placeholder={method === "Cash" ? "e.g. receipt number" : "From the mobile money message"} />
      </Field>

      {(rules?.backdateDays ?? 0) > 0 && (
        <Field label="Paid on" htmlFor={ids.paidOn} hint={`Today, or up to ${rules!.backdateDays} days back.`}>
          <input id={ids.paidOn} type="date" value={paidOn} min={earliest} max={today} onChange={(event) => setPaidOn(event.target.value)} />
        </Field>
      )}

      {loan && validAmount && (
        <SummaryBox
          ariaLabel="Balance after this payment"
          rows={[
            ["Client", `${loan.borrowerName} · ${loan.id}`],
            ["Owes now", formatUGX(owed)],
            ["Paying now", formatUGX(amount)],
            ["Left to pay", formatUGX(Math.max(0, owed - amount))],
          ]}
        />
      )}
      {tooMuch && (
        <p role="alert" className={styles.tooMuch}>
          That's more than {loan!.borrowerName} owes ({formatUGX(owed)}). Enter {formatUGX(owed)} or less.
        </p>
      )}
    </Dialog>
  );
}
