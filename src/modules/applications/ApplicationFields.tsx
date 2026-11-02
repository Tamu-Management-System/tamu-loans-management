import { useId } from "react";
import type { FieldErrors, PersonDraft } from "./applicationValidation";
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

