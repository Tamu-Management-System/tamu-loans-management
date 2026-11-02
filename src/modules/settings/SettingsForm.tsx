import { useId, useState, type ReactNode } from "react";
import { ApiError } from "../../api/client";
import type { SettingsSection } from "../../api/types";
import type { useSettingsDraft } from "./useSettingsDraft";
import { Button } from "../../components/ui/Button";
import { useToast } from "../../components/ui/Toast";
import { formatDate, formatTime } from "../../lib/format";
import styles from "./Settings.module.css";

/** The frame of a settings section: heading, its rows, and the save bar that appears once something changes. */
export function SettingsForm({
  title,
  subtitle,
  draft,
  canEdit,
  validate,
  children,
}: {
  title: string;
  subtitle: string;
  draft: ReturnType<typeof useSettingsDraft<SettingsSection>>;
  canEdit: boolean;
  /** A problem with the values that blocks saving, shown in the save bar */
  validate?: () => string | null;
  children: ReactNode;
}) {
  const showToast = useToast();
  const problem = draft.dirty && validate ? validate() : null;
  const error = draft.save.error instanceof ApiError ? draft.save.error.message : draft.save.error ? "The settings couldn't be saved. Try again." : null;

  const submit = () => {
    if (!draft.values || problem) return;
    draft.save
      .mutateAsync(draft.values as never)
      .then(() => {
        draft.onSaved();
        showToast({ message: `${title} saved. Everyone sees the change straight away.` });
      })
      .catch(() => undefined);
  };

  return (
    <section aria-labelledby={`${title}-heading`.replace(/\W/g, "-")}>
      <div className={styles.sectionHeader}>
        <div>
          <h2 id={`${title}-heading`.replace(/\W/g, "-")}>{title}</h2>
          <p className={styles.subtitle}>{subtitle}</p>
        </div>
        {draft.changed && (
          <p className={styles.lastChanged}>
            Last changed {formatDate(draft.changed.at)}, {formatTime(draft.changed.at)}
            <br />
            by {draft.changed.by}
          </p>
        )}
      </div>
      {draft.isError ? (
        <div className={styles.card}>
          <p className={styles.message} role="alert">
            Settings couldn't load.{" "}
            <button type="button" className={styles.linkButton} onClick={() => draft.refetch()}>
              Try again
            </button>
          </p>
        </div>
      ) : draft.isPending || !draft.values ? (
        <div className={styles.loading} aria-busy="true" aria-label="Loading settings" />
      ) : (
        <form
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <fieldset className={styles.settingsFieldset} disabled={!canEdit}>
            {children}
          </fieldset>
          {canEdit && draft.dirty && (
            <div className={styles.saveBar} role="region" aria-label="Unsaved changes">
              <p className={problem || error ? styles.saveBarProblem : undefined} role={problem || error ? "alert" : undefined}>
                {problem ?? error ?? "You have unsaved changes."}
              </p>
              <Button variant="secondary" onClick={draft.discard}>
                Discard
              </Button>
              <Button type="submit" disabled={draft.save.isPending || !!problem}>
                {draft.save.isPending ? "Saving…" : "Save changes"}
              </Button>
            </div>
          )}
        </form>
      )}
    </section>
  );
}

/** A group of setting rows in a card, with an optional heading */
export function SettingsGroup({ title, description, children }: { title?: string; description?: string; children: ReactNode }) {
  return (
    <div className={styles.settingsGroup}>
      {title && (
        <div className={styles.settingsGroupHeader}>
          <h3>{title}</h3>
          {description && <p>{description}</p>}
        </div>
      )}
      {children}
    </div>
  );
}

/** One setting: what it is and why on the left, the control on the right */
export function SettingRow({ label, description, htmlFor, children }: { label: string; description?: ReactNode; htmlFor?: string; children: ReactNode }) {
  return (
    <div className={styles.settingRow}>
      <div className={styles.settingText}>
        {htmlFor ? <label htmlFor={htmlFor}>{label}</label> : <span className={styles.settingLabel}>{label}</span>}
        {description && <p>{description}</p>}
      </div>
      <div className={styles.settingControl}>{children}</div>
    </div>
  );
}

/** An on/off switch (a checkbox with role="switch") */
export function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (checked: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <label className={styles.switch}>
      <input type="checkbox" role="switch" checked={checked} onChange={(event) => onChange(event.target.checked)} aria-label={label} disabled={disabled} />
      <span className={styles.switchTrack} aria-hidden="true" />
      <span className={styles.switchState}>{checked ? "On" : "Off"}</span>
    </label>
  );
}

/** A whole number with its unit ("minutes", "UGX", "%"), kept within limits */
export function NumberField({
  id,
  value,
  onChange,
  min,
  max,
  unit,
  unitBefore = false,
  step = 1,
  label,
  wide = false,
  allowDecimal = false,
}: {
  id?: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  unit: string;
  unitBefore?: boolean;
  step?: number;
  label?: string;
  wide?: boolean;
  allowDecimal?: boolean;
}) {
  const ownId = useId();
  const [text, setText] = useState<string | null>(null);
  const shown = text ?? (unit === "UGX" ? value.toLocaleString("en-US") : String(value));
  const outOfRange = value < min || value > max;
  return (
    <span className={`${styles.numberField} ${wide ? styles.numberFieldWide : ""} ${outOfRange ? styles.numberFieldInvalid : ""}`}>
      {unitBefore && <span className={styles.unit}>{unit}</span>}
      <input
        id={id ?? ownId}
        inputMode={allowDecimal ? "decimal" : "numeric"}
        value={shown}
        aria-label={label}
        aria-invalid={outOfRange}
        onChange={(event) => {
          setText(event.target.value);
          const cleaned = event.target.value.replace(allowDecimal ? /[^\d.]/g : /\D/g, "");
          if (cleaned !== "") onChange(allowDecimal ? Number(cleaned) : Math.round(Number(cleaned)));
        }}
        onBlur={() => setText(null)}
        onKeyDown={(event) => {
          if (event.key === "ArrowUp" || event.key === "ArrowDown") {
            event.preventDefault();
            setText(null);
            onChange(Math.min(max, Math.max(min, value + (event.key === "ArrowUp" ? step : -step))));
          }
        }}
      />
      {!unitBefore && <span className={styles.unit}>{unit}</span>}
    </span>
  );
}

/** A small set of choices shown as joined buttons (a radio group) */
export function Segmented<T extends string>({ value, onChange, options, label }: { value: T; onChange: (value: T) => void; options: { value: T; label: string }[]; label: string }) {
  const name = useId();
  return (
    <span className={styles.choiceOptions} role="radiogroup" aria-label={label}>
      {options.map((option) => (
        <label key={option.value} className={value === option.value ? styles.choiceChecked : undefined}>
          <input type="radio" name={name} checked={value === option.value} onChange={() => onChange(option.value)} />
          {option.label}
        </label>
      ))}
    </span>
  );
}
