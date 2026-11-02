import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useSignOut } from "../api/auth";
import { Dialog } from "../components/ui/Dialog";
import { useSystemSettings } from "../api/settings";
import { useLatest } from "../lib/useLatest";
import { IDLE_TIMEOUT_MINUTES } from "./session";
import styles from "./IdleSessionGuard.module.css";

// The limit is set in Settings → Security (the default until settings load). The backend must
// enforce the same limit — this only protects an unattended screen.
const WARNING_BEFORE_MS = 2 * 60_000;
const CHECK_EVERY_MS = 1_000;
const ACTIVITY_THROTTLE_MS = 5_000;

// Shared by all open tabs, so working in one tab keeps the others signed in
const LAST_ACTIVITY_KEY = "tamu-last-activity";
const ACTIVITY_EVENTS = ["pointerdown", "keydown", "wheel", "touchstart"] as const;

function readLastActivity(): number {
  try {
    return Number(localStorage.getItem(LAST_ACTIVITY_KEY)) || Date.now();
  } catch {
    return Date.now();
  }
}

function writeLastActivity(time = Date.now()) {
  try {
    localStorage.setItem(LAST_ACTIVITY_KEY, String(time));
  } catch {
    // Storage blocked: this tab still times out on its own activity
  }
}

const formatCountdown = (ms: number) => {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
};

/**
 * Signs the user out after the sign-out time in Settings → Security without activity, so an unattended screen doesn't keep
 * showing borrower and payment data. Two minutes before, a warning offers to stay signed in.
 */
export function IdleSessionGuard() {
  const queryClient = useQueryClient();
  const { signOut } = useSignOut();
  const { data: settings } = useSystemSettings();
  const timeoutMs = (settings?.security.idleTimeoutMinutes ?? IDLE_TIMEOUT_MINUTES) * 60_000;
  // Read by the timer below, which is set up once
  const latestTimeout = useLatest(timeoutMs);
  const [remainingMs, setRemainingMs] = useState(timeoutMs);
  const lastWrite = useRef(0);
  const signingOut = useRef(false);
  // Latest sign-out function, so the timer below is set up once (not on every tick)
  const signOutRef = useRef(signOut);
  signOutRef.current = signOut;

  useEffect(() => {
    writeLastActivity();
    const recordActivity = () => {
      const now = Date.now();
      if (now - lastWrite.current < ACTIVITY_THROTTLE_MS) return;
      lastWrite.current = now;
      writeLastActivity(now);
    };
    ACTIVITY_EVENTS.forEach((type) => window.addEventListener(type, recordActivity, { passive: true, capture: true }));

    const timer = window.setInterval(() => {
      const remaining = latestTimeout.current - (Date.now() - readLastActivity());
      setRemainingMs(remaining);
      if (remaining <= 0 && !signingOut.current) {
        signingOut.current = true;
        void signOutRef.current("idle");
      }
    }, CHECK_EVERY_MS);

    return () => {
      ACTIVITY_EVENTS.forEach((type) => window.removeEventListener(type, recordActivity, { capture: true }));
      window.clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- set up once; the timeout is read through a ref
  }, []);

  const staySignedIn = () => {
    writeLastActivity();
    setRemainingMs(timeoutMs);
    // Any request keeps the server session alive too
    void queryClient.invalidateQueries({ queryKey: ["me"] });
  };

  if (remainingMs > WARNING_BEFORE_MS) return null;

  return (
    <Dialog
      title="Are you still there?"
      subtitle="For your security, you'll be signed out soon."
      submitLabel="Stay signed in"
      cancelLabel="Sign out now"
      onSubmit={staySignedIn}
      onClose={staySignedIn}
      onCancel={() => void signOut()}
    >
      <p className={styles.countdown} role="timer" aria-live="off">
        Signing out in <b>{formatCountdown(remainingMs)}</b>
      </p>
      <p className={styles.explanation}>You've been inactive for a while. Unsaved changes will be lost when you're signed out.</p>
    </Dialog>
  );
}
