import { useId, useState } from "react";
import { ApiError } from "../../api/client";
import { useUpdateBorrower } from "../../api/borrowers";
import type { BorrowerProfile } from "../../api/types";
import { Dialog, Field } from "../../components/ui/Dialog";
import { normalisePhone } from "../../lib/phone";
import styles from "./EditBorrowerDialog.module.css";

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
  gender: "female" | "male" | "";
};

/**
 * Updates the borrower's details (the fields the client confirmed). Name and National ID are locked
 * (they must match the ID card). A new main phone, the mobile money payout number, only takes effect
 * after a second person approves it.
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
    gender: borrower.gender ?? "",
  };
  const [form, setForm] = useState(initial);
  const [submitted, setSubmitted] = useState(false);
  const set = (key: keyof FormState) => (event: { target: { value: string } }) => setForm((current) => ({ ...current, [key]: event.target.value }));

  const phone = normalisePhone(form.phone);
  const secondaryPhone = form.secondaryPhone.trim() ? normalisePhone(form.secondaryPhone) : null;
  const kinPhone = form.kinPhone.trim() ? normalisePhone(form.kinPhone) : null;
  const errors: Partial<Record<keyof FormState, string>> = {};
  if (!phone) errors.phone = "Enter a Ugandan mobile number, e.g. 0772 418 230.";
  if (!form.gender) errors.gender = "Choose female or male.";
  if (!form.area.trim()) errors.area = "Enter the address.";
  if (!form.premises.trim()) errors.premises = "Enter the shop, premises, building or arcade.";
  if (form.secondaryPhone.trim() && !secondaryPhone) errors.secondaryPhone = "Enter a Ugandan mobile number, or leave it empty.";
  // Next of kin is optional; a number, if given, must be valid
  if (form.kinPhone.trim() && !kinPhone) errors.kinPhone = "Enter a Ugandan mobile number, or leave it empty.";
  const valid = Object.keys(errors).length === 0;
  const changed = (Object.keys(initial) as (keyof FormState)[]).some((key) => form[key].trim() !== initial[key].trim());
  const phoneChanging = !!phone && phone !== borrower.phone && phone !== borrower.pendingPhoneChange?.newPhone;
  const show = (key: keyof FormState) => (submitted ? errors[key] : undefined);

  const submit = () => {
    setSubmitted(true);
    if (!valid || !phone || !form.gender) return;
    update.mutate(
      {
        phone,
        secondaryPhone,
        area: form.area.trim(),
        premises: form.premises.trim(),
        nextOfKin: { name: form.kinName.trim() || null, relationship: form.kinRelationship.trim() || null, phone: kinPhone },
        gender: form.gender,
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
        <legend>Contact and address</legend>
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
        {input("secondaryPhone", { label: "Other phone (optional)", inputMode: "tel" })}
        <Field label="Gender" htmlFor={`${id}-gender`} hint={show("gender") ? <span className={styles.error}>{show("gender")}</span> : undefined}>
          <div className={styles.choices} role="radiogroup" id={`${id}-gender`} aria-label="Gender">
            {(["female", "male"] as const).map((option) => (
              <label key={option} className={form.gender === option ? styles.choiceSelected : undefined}>
                <input type="radio" name={`${id}-gender`} checked={form.gender === option} onChange={() => setForm((current) => ({ ...current, gender: option }))} />
                {option === "female" ? "Female" : "Male"}
              </label>
            ))}
          </div>
        </Field>
        <div className={styles.pair}>
          {input("area", { label: "Address", hint: "Where they live" })}
          {input("premises", { label: "Shop / premises / building / arcade" })}
        </div>
      </fieldset>

      <fieldset className={styles.group}>
        <legend>Next of kin (optional)</legend>
        {input("kinName", { label: "Full name" })}
        <div className={styles.pair}>
          {input("kinRelationship", { label: "Relationship" })}
          {input("kinPhone", { label: "Phone", inputMode: "tel" })}
        </div>
      </fieldset>
    </Dialog>
  );
}
