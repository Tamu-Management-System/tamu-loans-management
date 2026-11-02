import { useId, useState } from "react";
import { ApiError } from "../../api/client";
import { useUpdateBorrower } from "../../api/borrowers";
import type { BorrowerProfile } from "../../api/types";
import { Dialog, Field } from "../../components/ui/Dialog";
import { Select } from "../../components/ui/Select";
import { normalisePhone } from "../../lib/phone";
import styles from "./EditBorrowerDialog.module.css";

const INCOME_PERIODS = [
  { value: "daily", label: "a day" },
  { value: "weekly", label: "a week" },
  { value: "monthly", label: "a month" },
] as const;

interface EditBorrowerDialogProps {
  borrower: BorrowerProfile;
  onClose: () => void;
  onSaved: (message: string) => void;
}

type FormState = {
  phone: string;
  area: string;
  premises: string;
  secondaryPhone: string;
  kinName: string;
  kinRelationship: string;
  kinPhone: string;
  occupation: string;
  income: string;
  incomePeriod: "daily" | "weekly" | "monthly";
};

/**
 * Updates the borrower's details. Name and National ID are locked (they must match the ID card).
 * Contact and shop / premises come from Tamu's payment agreement; the rest is optional until the
 * client confirms it. A new main phone, the mobile money payout number, only takes effect after a
 * second person approves it.
 */
export function EditBorrowerDialog({ borrower, onClose, onSaved }: EditBorrowerDialogProps) {
  const id = useId();
  const update = useUpdateBorrower(borrower.id);
  const initial: FormState = {
    phone: borrower.phone,
    area: borrower.area,
    premises: borrower.premises,
    secondaryPhone: borrower.secondaryPhone ?? "",
    kinName: borrower.nextOfKin?.name ?? "",
    kinRelationship: borrower.nextOfKin?.relationship ?? "",
    kinPhone: borrower.nextOfKin?.phone ?? "",
    occupation: borrower.work.occupation ?? "",
    income: borrower.work.income ? String(borrower.work.income.amount) : "",
    incomePeriod: borrower.work.income?.period ?? "weekly",
  };
  const [form, setForm] = useState(initial);
  const [submitted, setSubmitted] = useState(false);
  const set = (key: keyof FormState) => (event: { target: { value: string } }) => setForm((current) => ({ ...current, [key]: event.target.value }));

  const phone = normalisePhone(form.phone);
  const secondaryPhone = form.secondaryPhone.trim() ? normalisePhone(form.secondaryPhone) : null;
  const kinGiven = !!(form.kinName.trim() || form.kinRelationship.trim() || form.kinPhone.trim());
  const kinPhone = form.kinPhone.trim() ? normalisePhone(form.kinPhone) : null;
  const income = form.income.trim() ? Number(form.income) : null;
  const errors: Partial<Record<keyof FormState, string>> = {};
  if (!phone) errors.phone = "Enter a Ugandan mobile number, e.g. 0772 418 230.";
  if (!form.area.trim()) errors.area = "Enter the area.";
  if (!form.premises.trim()) errors.premises = "Enter the shop, premises, building or arcade.";
  if (form.secondaryPhone.trim() && !secondaryPhone) errors.secondaryPhone = "Enter a Ugandan mobile number, or leave it empty.";
  if (kinGiven && !form.kinName.trim()) errors.kinName = "Enter the name, or clear the next of kin fields.";
  if (kinGiven && !kinPhone) errors.kinPhone = "Enter a Ugandan mobile number.";
  if (income !== null && !(Number.isFinite(income) && income > 0)) errors.income = "Enter an amount, or leave it empty.";
  const valid = Object.keys(errors).length === 0;
  const changed = (Object.keys(initial) as (keyof FormState)[]).some((key) => form[key].trim() !== initial[key].trim());
  const phoneChanging = !!phone && phone !== borrower.phone && phone !== borrower.pendingPhoneChange?.newPhone;
  const show = (key: keyof FormState) => (submitted ? errors[key] : undefined);

  const submit = () => {
    setSubmitted(true);
    if (!valid || !phone) return;
    update.mutate(
      {
        phone,
        secondaryPhone,
        area: form.area.trim(),
        premises: form.premises.trim(),
        nextOfKin: kinGiven && kinPhone ? { name: form.kinName.trim(), relationship: form.kinRelationship.trim(), phone: kinPhone } : null,
        work: { occupation: form.occupation.trim() || null, income: income ? { amount: Math.round(income), period: form.incomePeriod } : null },
      },
      {
        onSuccess: () => {
          onSaved(phoneChanging ? "Details saved. The new mobile money number is waiting for approval." : "Details saved.");
          onClose();
        },
      },
    );
  };

  const serverError = update.error instanceof ApiError ? update.error.message : update.error ? "The changes couldn't be saved. Try again." : null;

  const input = (key: keyof FormState, props: { label: string; inputMode?: "tel" | "numeric"; hint?: string }) => (
    <Field label={props.label} htmlFor={`${id}-${key}`} hint={show(key) ? <span className={styles.error}>{show(key)}</span> : props.hint}>
      <input
        id={`${id}-${key}`}
        value={form[key]}
        onChange={set(key)}
        inputMode={props.inputMode}
        type={props.inputMode === "tel" ? "tel" : "text"}
        autoComplete="off"
        aria-invalid={!!show(key)}
      />
    </Field>
  );

  return (
    <Dialog
      size="wide"
      title="Edit details"
      subtitle={`${borrower.name} · ${borrower.id}`}
      submitLabel="Save changes"
      submitting={update.isPending}
      submitDisabled={!changed}
      error={serverError ?? (submitted && !valid ? "Check the highlighted fields." : null)}
      onSubmit={submit}
      onClose={onClose}
    >
      <p className={styles.locked}>Name and National ID can't be changed here because they must match the ID card. Ask an admin to correct them.</p>

      <fieldset className={styles.group}>
        <legend>As on the payment agreement</legend>
        {input("phone", { label: "Main phone (mobile money)", inputMode: "tel" })}
        {phoneChanging && (
          <p className={styles.approvalNote} role="note">
            Changing the mobile money number needs a second person's approval. Payouts keep using {borrower.phone} until someone else approves {phone}.
          </p>
        )}
        {borrower.pendingPhoneChange && !phoneChanging && (
          <p className={styles.approvalNote} role="note">
            A change to {borrower.pendingPhoneChange.newPhone} is already waiting for approval.
          </p>
        )}
        <div className={styles.pair}>
          {input("premises", { label: "Shop / premises / building / arcade" })}
          {input("area", { label: "Area" })}
        </div>
      </fieldset>

      <fieldset className={styles.group}>
        <legend>
          Optional <span className={styles.legendNote}>· not on Tamu's forms yet</span>
        </legend>
        <div className={styles.pair}>
          {input("secondaryPhone", { label: "Other phone", inputMode: "tel" })}
          {input("occupation", { label: "Occupation" })}
        </div>
        <div className={styles.income}>
          {input("income", { label: "Approximate income (UGX)", inputMode: "numeric" })}
          <Field label="Per" htmlFor={`${id}-period`}>
            <Select id={`${id}-period`} value={form.incomePeriod} onChange={(incomePeriod) => setForm((current) => ({ ...current, incomePeriod }))} options={[...INCOME_PERIODS]} />
          </Field>
        </div>
        {input("kinName", { label: "Next of kin's name" })}
        <div className={styles.pair}>
          {input("kinRelationship", { label: "Relationship" })}
          {input("kinPhone", { label: "Next of kin's phone", inputMode: "tel" })}
        </div>
      </fieldset>
    </Dialog>
  );
}
