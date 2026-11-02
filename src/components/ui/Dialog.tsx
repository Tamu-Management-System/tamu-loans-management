import { useEffect, useId, useRef, type FormEvent, type ReactNode } from "react";
import { Button } from "./Button";
import styles from "./Dialog.module.css";

interface DialogProps {
  title: string;
  subtitle?: string;
  /** Label of the submit button, e.g. "Confirm payment" */
  submitLabel: string;
  submitting?: boolean;
  /** Submit label while submitting (default "Saving…") */
  submittingLabel?: string;
  submitDisabled?: boolean;
  /** Shown above the buttons, e.g. a server error */
  error?: string | null;
  onSubmit: () => void;
  /** Escape key, and the secondary button unless onCancel is given */
  onClose: () => void;
  /** Secondary button: label (default "Cancel") and action (default onClose) */
  cancelLabel?: string;
  onCancel?: () => void;
  /** "wide" for longer forms, "large" for content such as a document preview */
  size?: "medium" | "wide" | "large";
  children: ReactNode;
}

/**
 * Modal form dialog (native <dialog>): traps focus, closes on Escape and
 * returns focus to whatever opened it. Mount it to open; unmount to close.
 */
export function Dialog({
  title,
  subtitle,
  submitLabel,
  submitting = false,
  submittingLabel = "Saving…",
  submitDisabled = false,
  error,
  onSubmit,
  onClose,
  cancelLabel = "Cancel",
  onCancel,
  size = "medium",
  children,
}: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!submitting && !submitDisabled) onSubmit();
  };

  return (
    <dialog ref={ref} className={`${styles.dialog} ${size === "medium" ? "" : styles[size]}`} aria-labelledby={titleId} onCancel={(event) => { event.preventDefault(); onClose(); }}>
      <form onSubmit={handleSubmit} noValidate>
        <div className={styles.header}>
          <h3 id={titleId}>{title}</h3>
          {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
        </div>
        <div className={`${styles.body} scroll-area`}>{children}</div>
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
        <div className={styles.footer}>
          <Button variant="secondary" size="small" onClick={onCancel ?? onClose}>
            {cancelLabel}
          </Button>
          <Button type="submit" size="small" disabled={submitting || submitDisabled}>
            {submitting ? submittingLabel : submitLabel}
          </Button>
        </div>
      </form>
    </dialog>
  );
}

/** Labelled form field used inside dialogs. */
export function Field({ label, hint, htmlFor, children }: { label: ReactNode; hint?: ReactNode; htmlFor: string; children: ReactNode }) {
  return (
    <div className={styles.field}>
      <label htmlFor={htmlFor}>{label}</label>
      {children}
      {hint && <p className={styles.hint}>{hint}</p>}
    </div>
  );
}

/** Radio button presented as a card, with an optional description and extra content. */
export function RadioOption({
  name,
  value,
  checked,
  onChange,
  label,
  description,
  children,
}: {
  name: string;
  value: string;
  checked: boolean;
  onChange: (value: string) => void;
  label: string;
  description?: string;
  children?: ReactNode;
}) {
  return (
    <label className={styles.option}>
      <input type="radio" name={name} value={value} checked={checked} onChange={() => onChange(value)} />
      <span className={styles.optionText}>
        <b>{label}</b>
        {description && <small>{description}</small>}
        {children}
      </span>
    </label>
  );
}

/** Label/value rows in a grey box; the last row is emphasised (e.g. a new balance). */
export function SummaryBox({ rows, ariaLabel }: { rows: [label: ReactNode, value: ReactNode][]; ariaLabel?: string }) {
  return (
    <div className={styles.summary} aria-label={ariaLabel}>
      {rows.map(([label, value], index) => (
        <div key={index} className={styles.summaryRow}>
          <span>{label}</span>
          <span>{value}</span>
        </div>
      ))}
    </div>
  );
}
