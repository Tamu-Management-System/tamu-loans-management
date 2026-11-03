import { useId, useState } from "react";
import { ApiError, newIdempotencyKey } from "../../api/client";
import { useDisburse } from "../../api/loans";
import type { LoanToDisburse, PayoutMethod } from "../../api/types";
import { Dialog, Field, RadioOption, SummaryBox } from "../../components/ui/Dialog";
import { useToast } from "../../components/ui/Toast";
import { formatLongDate, formatUGX, toDateInputValue } from "../../lib/format";
import { summariseTerms } from "../../lib/repaymentSchedule";
import { useSystemSettings } from "../../api/settings";
import styles from "./ToDisbursePage.module.css";

/**
 * Records a payout. In the MVP the money is sent by hand by mobile money (automatic payouts
 * are Phase 2), then recorded here: which network, the transaction ID, the
 * exact amount and the date. The loan
 * becomes active and its repayment schedule starts from the payout date.
 */
export function DisburseDialog({ loan, onClose }: { loan: LoanToDisburse; onClose: () => void }) {
  const ids = { reference: useId(), amount: useId(), paidOn: useId() };
  const showToast = useToast();
  const disburse = useDisburse(loan.applicationId);
  const today = toDateInputValue(new Date());
  // Payout methods and Tamu's accounts come from Settings (Payments, Business details)
  const { data: settings } = useSystemSettings();
  const methods: PayoutMethod[] = settings?.payments.payoutMethods ?? ["MTN MoMo", "Airtel Money"];
  const [chosenMethod, setMethod] = useState<PayoutMethod | null>(null);
  const method = chosenMethod && methods.includes(chosenMethod) ? chosenMethod : methods[0];
  const from = settings?.business.payoutAccounts.find((account) => account.method === method);
  const [reference, setReference] = useState("");
  const [amountText, setAmountText] = useState("");
  const [paidOn, setPaidOn] = useState(today);
  const [submitted, setSubmitted] = useState(false);
  // Second step: the person paying out confirms what they sent before it's recorded
  const [confirming, setConfirming] = useState(false);
  const [consent, setConsent] = useState(false);
  // One key for this dialog: a retried payout is recorded once
  const [idempotencyKey] = useState(newIdempotencyKey);

  const amount = Number(amountText.replace(/\D/g, "")) || 0;
  const errors = {
    reference: !reference.trim() ? "Enter the transaction ID from the mobile money message." : !/^[A-Za-z0-9][A-Za-z0-9.-]{5,29}$/.test(reference.trim()) ? "6 to 30 letters, numbers, dots or dashes." : undefined,
    amount: amount !== loan.payout ? `Must be exactly ${formatUGX(loan.payout)}.` : undefined,
    paidOn: !paidOn || paidOn > today || paidOn < loan.approved.at.slice(0, 10) ? "Between the approval and today." : undefined,
  };
  const valid = !errors.reference && !errors.amount && !errors.paidOn;

  // The new dates: the first payment keeps the gap planned at application, counted from the payout
  const firstPaymentOn = paidOn ? toDateInputValue(new Date(new Date(`${paidOn}T00:00:00`).getTime() + loan.firstPaymentGapDays * 86_400_000)) : null;
  const schedule = firstPaymentOn
    ? summariseTerms({ amount: loan.amount, repaymentSchedule: loan.terms.repaymentSchedule, firstPaymentOn, numberOfPayments: loan.terms.numberOfPayments, pricing: loan.terms.pricing })
    : null;

  const submit = () => {
    setSubmitted(true);
    if (!valid) return;
    setConsent(false);
    setConfirming(true);
  };

  const record = () => {
    if (!consent) return;
    // The dialog closes when the list refreshes, so confirm from the request itself
    disburse
      .mutateAsync({ method, reference: reference.trim(), amount, paidOn, payoutAccount: from?.number ?? "", consentConfirmed: true, idempotencyKey })
      .then((result) => {
        showToast({ message: `${result.loanId} is active. First payment due ${formatLongDate(result.firstPaymentOn)}.` });
        onClose();
      })
      .catch(() => undefined /* shown in the dialog */);
  };

  const show = (key: keyof typeof errors) => (submitted ? errors[key] : undefined);
  const serverError = disburse.error instanceof ApiError ? disburse.error.message : disburse.error ? "The payout couldn't be recorded. Try again." : null;

  if (confirming)
    return (
      <Dialog
        title="Confirm payout"
        subtitle={`${loan.applicationId} · ${loan.borrower.name}`}
        submitLabel="Record payout"
        submittingLabel="Recording…"
        submitting={disburse.isPending}
        submitDisabled={!consent}
        cancelLabel="Back"
        onCancel={() => {
          disburse.reset();
          setConfirming(false);
        }}
        error={serverError}
        onSubmit={record}
        onClose={onClose}
      >
        <SummaryBox
          ariaLabel="The payout"
          rows={[
            ["Sent to", `${loan.borrower.name} · ${loan.payTo}`],
            ["From", from ? `Tamu's ${from.method} · ${from.number}` : method],
            ["Transaction ID", reference.trim()],
            ["Paid out on", formatLongDate(paidOn)],
            ["Amount", formatUGX(amount)],
          ]}
        />
        <label className={styles.consent}>
          <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} />
          <span>
            I confirm I sent <b>{formatUGX(amount)}</b> to {loan.borrower.name} on <b>{loan.payTo}</b>, and the transaction ID above is from the confirmation message. Once recorded, the loan starts and this can't be undone.
          </span>
        </label>
      </Dialog>
    );

  return (
    <Dialog
      title={`Pay out ${loan.applicationId}`}
      subtitle={`${loan.borrower.name} · ${formatUGX(loan.amount)} · ${loan.terms.pricing.productName}`}
      submitLabel="Continue"
      error={submitted && !valid ? "Check the highlighted fields." : null}
      onSubmit={submit}
      onClose={onClose}
    >
      <p className={styles.dialogIntro}>
        Send <b>{formatUGX(loan.payout)}</b> to <b>{loan.payTo}</b> ({loan.borrower.name}) first, then record it here.
        {loan.payout !== loan.amount && (
          <>
            {" "}
            That's {formatUGX(loan.amount)} less the {loan.terms.pricing.productName} fee of {formatUGX(loan.amount - loan.payout)}.
          </>
        )}
        {from && (
          <>
            {" "}
            Send from Tamu's {from.method} account {from.number}.
          </>
        )}
      </p>
      <div role="radiogroup" aria-label="Mobile money network" className={styles.networks}>
        {methods.map((option) => (
          <RadioOption key={option} name="method" value={option} checked={method === option} onChange={() => setMethod(option)} label={option} />
        ))}
      </div>
      <Field
        label={`${method} transaction ID`}
        htmlFor={ids.reference}
        hint={show("reference") ? <span className={styles.fieldError}>{show("reference")}</span> : undefined}
      >
        <input id={ids.reference} value={reference} onChange={(event) => setReference(event.target.value)} placeholder="From the confirmation message" autoComplete="off" aria-invalid={!!show("reference")} />
      </Field>
      <Field label="Amount paid out (UGX)" htmlFor={ids.amount} hint={show("amount") ? <span className={styles.fieldError}>{show("amount")}</span> : undefined}>
        <input
          id={ids.amount}
          inputMode="numeric"
          value={amountText ? Number(amountText.replace(/\D/g, "")).toLocaleString("en-US") : ""}
          onChange={(event) => setAmountText(event.target.value.replace(/\D/g, "").slice(0, 10))}
          placeholder={`Type ${loan.payout.toLocaleString("en-US")} to confirm`}
          autoComplete="off"
          aria-invalid={!!show("amount")}
        />
      </Field>
      <Field label="Paid out on" htmlFor={ids.paidOn} hint={show("paidOn") ? <span className={styles.fieldError}>{show("paidOn")}</span> : undefined}>
        <input id={ids.paidOn} type="date" value={paidOn} min={loan.approved.at.slice(0, 10)} max={today} onChange={(event) => setPaidOn(event.target.value)} aria-invalid={!!show("paidOn")} />
      </Field>
      {schedule && firstPaymentOn && (
        <SummaryBox
          ariaLabel="Repayments after this payout"
          rows={[
            ["Repayments", `${loan.terms.numberOfPayments} ${loan.terms.repaymentSchedule} × ${formatUGX(schedule.instalment)}`],
            ["First payment", formatLongDate(firstPaymentOn)],
            ["Last payment", formatLongDate(schedule.lastPaymentOn)],
          ]}
        />
      )}
    </Dialog>
  );
}
