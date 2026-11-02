import type { OnlineApplicationForm } from "../../api/types";
import { amountInWords } from "../../lib/amountInWords";
import { formatLongDate, formatUGX } from "../../lib/format";
import type { BorrowerDraft, PersonDraft } from "../applications/applicationValidation";
import styles from "./OnlineApplication.module.css";

const FREQUENCY = { daily: "Daily", weekly: "Weekly", monthly: "Monthly" } as const;

interface WordingProps {
  form: OnlineApplicationForm;
  borrower: BorrowerDraft;
}

/** Tamu's "Money / Amount Owing Payment Agreement" (loan-docs/), filled in with what was entered. */
export function AgreementWording({ form, borrower, guarantors }: WordingProps & { guarantors: [PersonDraft, PersonDraft] }) {
  const { terms } = form;
  const today = new Date().toISOString();
  return (
    <div className={styles.wording} tabIndex={0} aria-label="Payment agreement">
      <h3>Money / Amount Owing Payment Agreement</h3>
      <dl className={styles.wordingFields}>
        <div>
          <dt>Name of Payee (Borrower)</dt>
          <dd>{borrower.fullName}</dd>
        </div>
        <div>
          <dt>I.D. NIN</dt>
          <dd>{borrower.nationalId}</dd>
        </div>
        <div>
          <dt>Shop / Premises / Building / Arcade</dt>
          <dd>{borrower.premises}</dd>
        </div>
        <div>
          <dt>Telephone number</dt>
          <dd>{borrower.phone}</dd>
        </div>
        <div>
          <dt>Date borrowed</dt>
          <dd>{formatLongDate(today)}</dd>
        </div>
        <div>
          <dt>Total amount</dt>
          <dd>
            {amountInWords(terms.amount)} ({formatUGX(terms.amount)})
          </dd>
        </div>
        <div>
          <dt>Repayment date</dt>
          <dd>{formatLongDate(terms.lastPaymentOn)}</dd>
        </div>
      </dl>
      <h4>Agreement terms</h4>
      <p>
        I, {borrower.fullName} ("Payee"), borrowed {formatUGX(terms.amount)} ({amountInWords(terms.amount)}) from TAMU SERVICES UGANDA ("Promisor") on {formatLongDate(today)}. By signing
        this agreement both Payee and Promisor acknowledge that Payee will pay back Promisor using the following payment schedule.
      </p>
      <p>
        <b>Payment frequency: {FREQUENCY[terms.repaymentSchedule]}</b>. Payment deposit details: C/O TAMU SERVICES UGANDA (Promisor).
      </p>
      <p>
        The payee agrees to repay the Promisor an Interest of{" "}
        <b>
          {terms.interestRatePercent}%{/ a (day|week|month)$/.test(terms.interestLabel) ? ` per ${terms.interestLabel.split(" a ")[1]}` : ""} Administration charge
        </b>
        {terms.fee > 0 && <>, and a fee of {formatUGX(terms.fee)} {terms.feeCollection === "deducted" ? "taken from the amount paid out" : "added to the repayments"}</>}. The repayments will commence on{" "}
        {formatLongDate(terms.firstPaymentOn)}, till maturity. The last payment will be made on {formatLongDate(terms.lastPaymentOn)}, inclusive of Charge and Principal plus any other
        accrued charges, at which time the loan will be fully repaid. All payments to be made via TAMU SERVICES Merchant Codes as provided.
      </p>
      <p>
        <b>Failure to make payment on agreed timelines: our recovery / legal team will be notified to effect recovery measures as necessary and immediately.</b>
      </p>
      <p>
        <b>Recovery charges</b> will be added as determined by the recovery team to help recover the defaulted amount and the same will be paid by the defaulter at time of
        recovery. Both the payee and promisor agree on the charges as stated above.
      </p>
      <dl className={styles.wordingFields}>
        {guarantors.map((guarantor, index) => (
          <div key={index}>
            <dt>Guarantor {index + 1}</dt>
            <dd>
              {guarantor.fullName} · ID {guarantor.nationalId} · {guarantor.phone}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** Tamu's "Guarantor Consent and Undertaking to pay TAMU amount in case of default by the Borrower". */
export function ConsentWording({ form, borrower, guarantor }: WordingProps & { guarantor: PersonDraft }) {
  const { terms } = form;
  return (
    <div className={styles.wording} tabIndex={0} aria-label={`Guarantor consent for ${guarantor.fullName}`}>
      <h3>Guarantor Consent and Undertaking to pay TAMU amount in case of default by the Borrower</h3>
      <p>
        I, <b>{guarantor.fullName}</b> of NIN {guarantor.nationalId}, has hereby agreed to guarantee <b>{borrower.fullName}</b> of NIN {borrower.nationalId} for (Amount in
        words: {amountInWords(terms.amount)}) Amount in figures: {formatUGX(terms.amount)}, the amount borrowed on this date {formatLongDate(new Date().toISOString())} as per agreed
        terms from TAMU CLEANING SERVICES. In case of any default in payment of the amount plus any accrued charges, I will pay all the amounts owed.
      </p>
    </div>
  );
}
