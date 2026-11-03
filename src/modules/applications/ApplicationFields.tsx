import { useId } from "react";
import type { BorrowerDraft, FieldErrors, Gender, GuarantorDraft, PersonDraft } from "./applicationValidation";
import styles from "./ApplicationFields.module.css";

// Fields shared by the officer's New application and the borrower's online form, so both
// routes collect the same details with the same checks.

export function PersonFields({ person, onChange, errors, phoneLabel }: { person: PersonDraft; onChange: (changes: Partial<PersonDraft>) => void; errors: FieldErrors<PersonDraft>; phoneLabel: string }) {
  return (
    <>
      <TextField label="Full name" value={person.fullName} onChange={(fullName) => onChange({ fullName })} error={errors.fullName} autoComplete="off" />
      <TextField
        label="National ID number (NIN)"
        value={person.nationalId}
        onChange={(nationalId) => onChange({ nationalId: nationalId.toUpperCase() })}
        error={errors.nationalId}
        hint="14 characters, on the front of the card"
        autoCapitalize="characters"
      />
      <TextField label={phoneLabel} value={person.phone} onChange={(phone) => onChange({ phone })} error={errors.phone} inputMode="tel" type="tel" />
    </>
  );
}

/** Gender, other phone, address and next of kin: the rest of a new borrower's details */
export function BorrowerExtraFields({
  borrower,
  onChange,
  errors,
  you = false,
}: {
  borrower: BorrowerDraft;
  onChange: (changes: Partial<BorrowerDraft>) => void;
  errors: FieldErrors<BorrowerDraft>;
  /** Worded for the borrower filling it in themselves */
  you?: boolean;
}) {
  return (
    <>
      <GenderField value={borrower.gender} onChange={(gender) => onChange({ gender })} error={errors.gender} />
      <TextField label="Other phone number (optional)" value={borrower.secondaryPhone} onChange={(secondaryPhone) => onChange({ secondaryPhone })} error={errors.secondaryPhone} hint="Another number to reach them" inputMode="tel" type="tel" />
      <TextField label="Address" value={borrower.area} onChange={(area) => onChange({ area })} error={errors.area} hint={you ? "Where you live" : "Where they live"} />
      <TextField label="Shop / premises / building / arcade" value={borrower.premises} onChange={(premises) => onChange({ premises })} error={errors.premises} />
      <h3 className={styles.groupHeading}>Next of kin (optional)</h3>
      <TextField label="Full name" value={borrower.kinName} onChange={(kinName) => onChange({ kinName })} error={errors.kinName} />
      <TextField label="Phone number (optional)" value={borrower.kinPhone} onChange={(kinPhone) => onChange({ kinPhone })} error={errors.kinPhone} inputMode="tel" type="tel" />
    </>
  );
}

/** Online form: a guarantor's details, and how they know the borrower */
export function GuarantorFields({ guarantor, onChange, errors }: { guarantor: GuarantorDraft; onChange: (changes: Partial<GuarantorDraft>) => void; errors: FieldErrors<GuarantorDraft> }) {
  return (
    <>
      <PersonFields person={guarantor} onChange={onChange} errors={errors} phoneLabel="Phone number" />
      <TextField label="Relationship to the borrower" value={guarantor.relationship} onChange={(relationship) => onChange({ relationship })} error={errors.relationship} hint="e.g. sister, friend, landlord, workmate" />
    </>
  );
}

function GenderField({ value, onChange, error }: { value: Gender | ""; onChange: (value: Gender) => void; error?: string }) {
  const id = useId();
  return (
    <fieldset className={styles.choiceField} aria-describedby={error ? `${id}-note` : undefined}>
      <legend>Gender</legend>
      <div className={styles.choices}>
        {(["female", "male"] as const).map((option) => (
          <label key={option} className={value === option ? styles.choiceSelected : undefined}>
            <input type="radio" name={id} checked={value === option} onChange={() => onChange(option)} aria-invalid={!!error} />
            {option === "female" ? "Female" : "Male"}
          </label>
        ))}
      </div>
      {error && (
        <span id={`${id}-note`} className={styles.fieldError}>
          {error}
        </span>
      )}
    </fieldset>
  );
}

export function TextField({
  label,
  value,
  onChange,
  error,
  hint,
  inputMode,
  type = "text",
  autoComplete = "off",
  autoCapitalize,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  hint?: string;
  inputMode?: "tel";
  type?: string;
  autoComplete?: string;
  autoCapitalize?: string;
}) {
  const id = useId();
  return (
    <div className={styles.field}>
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        inputMode={inputMode}
        autoComplete={autoComplete}
        autoCapitalize={autoCapitalize}
        aria-invalid={!!error}
        aria-describedby={error || hint ? `${id}-note` : undefined}
      />
      {(error || hint) && (
        <span id={`${id}-note`} className={error ? styles.fieldError : styles.hint}>
          {error ?? hint}
        </span>
      )}
    </div>
  );
}

