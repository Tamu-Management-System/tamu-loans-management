import { useId, useState } from "react";
import { useChangePassword, useMySessions, useSignOutOtherDevices } from "../../api/account";
import { ApiError } from "../../api/client";
import { useSystemSettings } from "../../api/settings";
import type { SessionEndReason } from "../../api/types";
import { useAuth } from "../../auth/AuthContext";
import { Button } from "../../components/ui/Button";
import { Icon } from "../../components/ui/Icon";
import { useToast } from "../../components/ui/Toast";
import { formatDayAndTime, formatRelativeDay } from "../../lib/format";
import styles from "./Account.module.css";
import { deviceName, placeName } from "../../lib/deviceName";


/** Account settings: change your password, and see and end your other sign-ins. */
export function AccountSettingsPage() {
  const { data: settings } = useSystemSettings();
  return (
    <>
      <div className={styles.header}>
        <h1>Account settings</h1>
        <p className={styles.subtitle}>Keep your account safe</p>
      </div>
      <div className={styles.columns}>
        <PasswordCard minLength={settings?.security.minPasswordLength ?? 8} />
        <div className={styles.column}>
          <DevicesCard />
          <RecentSignInsCard />
          <section className={styles.card} aria-labelledby="timeout-heading">
            <div className={styles.cardHeader}>
              <h2 id="timeout-heading">Automatic sign-out</h2>
            </div>
            <p className={styles.text}>
              You're signed out after <b>{settings?.security.idleTimeoutMinutes ?? 15} minutes</b> without activity, so an unattended screen doesn't show clients' details. Your admin sets this.
            </p>
          </section>
        </div>
      </div>
    </>
  );
}

function PasswordCard({ minLength }: { minLength: number }) {
  const ids = { current: useId(), next: useId(), confirm: useId() };
  const { user } = useAuth();
  const showToast = useToast();
  const change = useChangePassword();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [visible, setVisible] = useState(false);
  const [left, setLeft] = useState({ next: false, confirm: false });

  const lower = next.toLowerCase();
  const personal = [user.email.split("@")[0], ...user.name.split(" ").filter((part) => part.length > 2)].some((part) => lower.includes(part.toLowerCase()));
  const checks = [
    { ok: next.length >= minLength, label: `At least ${minLength} characters` },
    { ok: !!next && !personal, label: "Not your name or email" },
    { ok: !!next && next === confirm, label: "Both new passwords match" },
  ];
  const ready = !!current && checks.every((check) => check.ok);
  // Say what's wrong once the person has had a chance to finish: on leaving the field, or when the second box is as long as the first
  const nextError = left.next && next && next.length < minLength ? `Use at least ${minLength} characters` : null;
  const confirmError = confirm && confirm !== next && (left.confirm || confirm.length >= next.length) ? "The two passwords don't match" : null;

  const submit = () => {
    if (!ready) return;
    change
      .mutateAsync({ currentPassword: current, newPassword: next })
      .then(() => {
        setCurrent("");
        setNext("");
        setConfirm("");
        setLeft({ next: false, confirm: false });
        showToast({ message: "Password changed. Your other devices are signed out." });
      })
      .catch(() => undefined);
  };

  const type = visible ? "text" : "password";
  return (
    <section className={styles.card} aria-labelledby="password-heading">
      <div className={styles.cardHeader}>
        <h2 id="password-heading">Change password</h2>
        <button type="button" className={styles.textButton} onClick={() => setVisible(!visible)} aria-pressed={visible}>
          <Icon name={visible ? "eyeOff" : "eye"} size={16} strokeWidth={1.8} />
          {visible ? "Hide" : "Show"} passwords
        </button>
      </div>
      <form
        className={styles.form}
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <label htmlFor={ids.current}>Current password</label>
        <input id={ids.current} className={styles.input} type={type} value={current} onChange={(event) => setCurrent(event.target.value)} autoComplete="current-password" />
        <label htmlFor={ids.next}>New password</label>
        <input
          id={ids.next}
          className={styles.input}
          type={type}
          value={next}
          onChange={(event) => setNext(event.target.value)}
          onBlur={() => setLeft((state) => ({ ...state, next: true }))}
          autoComplete="new-password"
          aria-invalid={!!nextError}
          aria-describedby={nextError ? `${ids.next}-error` : undefined}
        />
        {nextError && (
          <p id={`${ids.next}-error`} className={styles.fieldError} role="alert">
            {nextError}
          </p>
        )}
        <label htmlFor={ids.confirm}>New password again</label>
        <input
          id={ids.confirm}
          className={styles.input}
          type={type}
          value={confirm}
          onChange={(event) => setConfirm(event.target.value)}
          onBlur={() => setLeft((state) => ({ ...state, confirm: true }))}
          autoComplete="new-password"
          aria-invalid={!!confirmError}
          aria-describedby={confirmError ? `${ids.confirm}-error` : undefined}
        />
        {confirmError && (
          <p id={`${ids.confirm}-error`} className={styles.fieldError} role="alert">
            {confirmError}
          </p>
        )}
        <ul className={styles.checks} aria-label="Password checks">
          {checks.map((check) => (
            <li key={check.label} className={check.ok ? styles.checkOk : undefined}>
              <Icon name={check.ok ? "check" : "close"} size={14} strokeWidth={2.4} />
              {check.label}
            </li>
          ))}
        </ul>
        <p className={styles.hint}>A long phrase you'll remember is the strongest, e.g. three or four words. Common passwords are refused.</p>
        {change.error && (
          <p className={styles.error} role="alert">
            {change.error instanceof ApiError ? change.error.message : "The password couldn't be changed. Try again."}
          </p>
        )}
        <div className={styles.formActions}>
          <Button type="submit" disabled={!ready || change.isPending}>
            {change.isPending ? "Changing…" : "Change password"}
          </Button>
        </div>
        <p className={styles.hint}>Changing it signs you out on your other devices.</p>
      </form>
    </section>
  );
}

/** The most signed-in devices the card lists, this one first then the latest used (screen size, not a rule) */
const MAX_ACTIVE_SHOWN = 4;

function DevicesCard() {
  const showToast = useToast();
  const { data: devices, isPending } = useMySessions();
  const signOutOthers = useSignOutOtherDevices();
  // This device first, then the others by when they were last used
  const active = devices?.filter((device) => !device.endedAt).sort((a, b) => Number(b.current) - Number(a.current) || b.lastActiveAt.localeCompare(a.lastActiveAt));
  const others = active?.filter((device) => !device.current).length ?? 0;
  const shown = active?.slice(0, MAX_ACTIVE_SHOWN);
  return (
    <section className={styles.card} aria-labelledby="devices-heading">
      <div className={styles.cardHeader}>
        <h2 id="devices-heading">Where you're signed in</h2>
      </div>
      {isPending ? (
        <div className={styles.loadingSmall} aria-busy="true" aria-label="Loading devices" />
      ) : (
        <ul className={styles.list}>
          {shown?.map((device) => (
            <li key={device.id}>
              <span>
                <b>{deviceName(device.device)}</b>
                <span className={styles.hint}>
                  {[placeName(device.location), device.current ? "Active now" : `Last active ${formatRelativeDay(device.lastActiveAt)}`].filter(Boolean).join(" · ")}
                </span>
              </span>
              {device.current && <span className={`${styles.chip} ${styles.chipOk}`}>This device</span>}
            </li>
          ))}
        </ul>
      )}
      <div className={styles.cardFooter}>
        <p className={styles.hint}>Don't recognise one, or lost a phone? Sign it out, then change your password.</p>
        <Button
          variant="secondary"
          size="small"
          disabled={others === 0 || signOutOthers.isPending}
          onClick={() => signOutOthers.mutateAsync().then(() => showToast({ message: "Signed out everywhere else." }))}
        >
          Sign out everywhere else
        </Button>
      </div>
    </section>
  );
}

const END_REASONS: Record<SessionEndReason, string> = {
  SIGNED_OUT: "Signed out",
  IDLE: "Signed out after inactivity",
  EXPIRED: "Session expired",
  SIGNED_OUT_ELSEWHERE: "Signed out from another device",
};

/** Where this account was signed in before: when, from what, and how each sign-in ended. Hidden until the backend sends them. */
function RecentSignInsCard() {
  const { data: devices } = useMySessions();
  const ended = devices?.filter((device) => device.endedAt) ?? [];
  if (ended.length === 0) return null;
  return (
    <section className={styles.card} aria-labelledby="recent-heading">
      <div className={styles.cardHeader}>
        <h2 id="recent-heading">Recent sign-ins</h2>
      </div>
      <ul className={styles.list}>
        {ended.map((device) => (
          <li key={device.id}>
            <span>
              <b>{deviceName(device.device)}</b>
              <span className={styles.hint}>{[placeName(device.location), `Signed in ${formatDayAndTime(device.signedInAt ?? device.lastActiveAt).replace(/^[TY]/, (letter) => letter.toLowerCase())}`].filter(Boolean).join(" · ")}</span>
            </span>
            <span className={styles.endNote}>
              {device.endReason ? END_REASONS[device.endReason] : "Signed out"}
              <span className={styles.hint}>{formatDayAndTime(device.endedAt!)}</span>
            </span>
          </li>
        ))}
      </ul>
      <p className={styles.hint}>Don't recognise one? Change your password.</p>
    </section>
  );
}
