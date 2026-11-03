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
  /** Pre-selected loan (from a worklist row); omit to let the user pick a borrower */
  loanId?: string;
  onClose: () => void;
  /** Called after saving, with a confirmation message and the task that can be undone */
  onRecorded: (message: string, undoTaskId: string | null) => void;
}

/**
 * Records a repayment. Before confirming, the user sees the current balance, the amount
 * being paid and the new balance (user flow, phase 6). Overpayments (when Settings allow them) must
 * be confirmed and stay within Settings → Payments' limit over the balance, so a typing mistake can't go in.
 */
export function RecordPaymentDialog({ loanId: initialLoanId, onClose, onRecorded }: RecordPaymentDialogProps) {
  const ids = { loan: useId(), amount: useId(), method: useId(), reference: useId(), paidOn: useId() };
  // Accepted methods, transaction IDs, back-dating and overpayments follow Settings → Payments
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
  const [surplusConfirmed, setSurplusConfirmed] = useState(false);
  const referenceNeeded = !!rules?.referenceRequired && method !== "Cash";

  const loan = loans.find((l) => l.id === loanId);
  // Until the user types, suggest what's due today
  const amountText = amountInput ?? (loan?.dueToday ? String(loan.dueToday) : "");
  const amount = Number(amountText);
  const validAmount = amountText !== "" && Number.isFinite(amount) && amount > 0;
  const newBalance = loan ? Math.max(0, loan.outstandingBalance - amount) : 0;
  const surplus = loan && validAmount ? Math.max(0, amount - loan.outstandingBalance) : 0;
  const mostAccepted = loan ? Math.floor(loan.outstandingBalance * (1 + (rules?.maxOverpaymentPercent ?? 10) / 100)) : 0;
  const overpaymentRefused = surplus > 0 && (rules?.allowOverpayment === false || amount > mostAccepted);
  const ready = !!loan && validAmount && !overpaymentRefused && (surplus === 0 || surplusConfirmed) && (!referenceNeeded || !!reference.trim()) && paidOn >= earliest && paidOn <= today;

  const submit = () => {
    if (!loan || !ready) return;
    recordPayment.mutate(
      { loanId: loan.id, amount, method, reference: reference.trim() || undefined, paidOn: paidOn === today ? undefined : paidOn, surplusConfirmed: surplus > 0 ? true : undefined, idempotencyKey },
      {
        onSuccess: (result) => {
          const surplusNote = result.surplus > 0 ? ` Loan cleared; ${formatUGX(result.surplus)} surplus recorded.` : "";
          onRecorded(`${formatUGX(amount)} recorded for ${loan.borrowerName}.${surplusNote}`, result.taskId);
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
        <Field label="Borrower" htmlFor={ids.loan}>
          <Select
            id={ids.loan}
            value={loanId}
            onChange={(id) => {
              setLoanId(id);
              setAmountInput(null);
              setSurplusConfirmed(false);
            }}
            options={loans.map((option) => ({ value: option.id, label: `${option.borrowerName} · ${option.id}`, keywords: option.phone }))}
            placeholder={loansLoading ? "Loading borrowers…" : "Choose a borrower"}
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
        hint={loan?.dueToday ? `Due today: ${formatUGX(loan.dueToday)}. Enter less for a part payment.` : undefined}
      >
        <input
          id={ids.amount}
          inputMode="numeric"
          autoComplete="off"
          value={amountText}
          // Whole shillings only: anything that isn't a digit (minus signs, letters, decimals) is dropped
          onChange={(event) => {
            setAmountInput(event.target.value.replace(/\D/g, "").replace(/^0+/, ""));
            setSurplusConfirmed(false);
          }}
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
            ["Borrower", `${loan.borrowerName} · ${loan.id}`],
            ["Current balance", formatUGX(loan.outstandingBalance)],
            ["Paying now", formatUGX(amount)],
            ["New balance", formatUGX(newBalance)],
          ]}
        />
      )}
      {surplus > 0 &&
        (overpaymentRefused ? (
          <p role="alert" className={styles.overpaymentRefused}>
            {rules?.allowOverpayment === false
              ? `This is ${formatUGX(surplus)} more than the balance. Payments above the balance aren't accepted; enter ${formatUGX(loan!.outstandingBalance)} or less.`
              : `This is ${formatUGX(surplus)} more than the balance, which is too much to be right. Check the amount: the most accepted is ${formatUGX(mostAccepted)}.`}
          </p>
        ) : (
          <label className={styles.surplusConfirm}>
            <input type="checkbox" checked={surplusConfirmed} onChange={(event) => setSurplusConfirmed(event.target.checked)} />
            <span>
              <b>The borrower paid {formatUGX(surplus)} more than they owe.</b> The loan will close and the extra will be recorded.
            </span>
          </label>
        ))}
    </Dialog>
  );
}
