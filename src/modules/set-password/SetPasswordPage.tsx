import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { ApiError } from "../../api/client";
import { usePasswordLink, useSetPassword } from "../../api/passwordLink";
import { AuthLayout } from "../../components/layout/AuthLayout";
import { Button } from "../../components/ui/Button";
import { Icon } from "../../components/ui/Icon";
import login from "../../pages/LoginPage.module.css";
import styles from "./SetPassword.module.css";

/** Why a link can't be used, and what to do about it. */
const LINK_PROBLEMS: Record<string, { title: string; text: string; signIn?: boolean }> = {
  invalid: { title: "This link isn't valid", text: "Check that you opened the whole link, or ask your admin to send you a new one." },
  used: { title: "This link has already been used", text: "Your password is already set. Sign in with it, or ask your admin for a reset link if you've forgotten it.", signIn: true },
  replaced: { title: "This link was replaced", text: "A newer link was sent to you. Use the latest message, or ask your admin to send another." },
  expired: { title: "This link has expired", text: "Links only work for a limited time. Ask your admin to send you a new one." },
};

/**
 * Where a new member of staff (invite) or someone whose admin sent a reset opens their emailed link and chooses a
 * password. It's public: the token in the link is the only access, it works once, and the password only ever travels
 * in the request body. Afterwards they're sent to sign in.
 */
export function SetPasswordPage() {
  const { token = "" } = useParams();
  const navigate = useNavigate();
  const { data: link, isPending, error } = usePasswordLink(token);
  const setPassword = useSetPassword(token);
  const ids = { password: useId(), confirm: useId() };
  const passwordRef = useRef<HTMLInputElement>(null);
  const confirmRef = useRef<HTMLInputElement>(null);

  const [password, setPasswordText] = useState("");
  const [confirm, setConfirm] = useState("");
  const [visible, setVisible] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const [left, setLeft] = useState({ password: false, confirm: false });

  useEffect(() => {
    document.title = "Set your password · Tamu Loans";
  }, []);

  if (isPending) return <AuthLayout><FormSkeleton /></AuthLayout>;

  if (error || !link) {
    const reason = error instanceof ApiError ? ((error.body as { reason?: string } | undefined)?.reason ?? "invalid") : "unknown";
    const problem = LINK_PROBLEMS[reason];
    return (
      <AuthLayout>
        <div className={`${login.form} ${styles.problem}`}>
          <span className={styles.problemIcon} aria-hidden="true">
            <Icon name="warning" size={26} strokeWidth={1.8} />
          </span>
          <h1>{problem?.title ?? "Something went wrong"}</h1>
          <p>{problem?.text ?? "The page couldn't open. Check your internet connection and open the link again."}</p>
          {problem?.signIn && (
            <Link to="/login" className={login.forgotLink}>
              Go to sign in
            </Link>
          )}
        </div>
      </AuthLayout>
    );
  }

  const long = password.length >= link.minPasswordLength;
  const matches = !!password && password === confirm;
  const checks = [
    { ok: long, label: `At least ${link.minPasswordLength} characters` },
    { ok: matches, label: "Both passwords match" },
  ];
  const ready = long && matches;
  // Say what's wrong once the person has had a chance to finish: on leaving the field, on submitting, or when the second box is as long as the first
  const passwordError = (left.password || showErrors) && password && !long ? `Use at least ${link.minPasswordLength} characters` : showErrors && !password ? "Enter a password" : null;
  const confirmError =
    confirm && confirm !== password && (left.confirm || showErrors || confirm.length >= password.length) ? "The two passwords don't match" : showErrors && password && !confirm ? "Enter the password again" : null;
  const firstName = link.name.split(" ")[0];

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!ready) {
      setShowErrors(true);
      (long ? confirmRef : passwordRef).current?.focus();
      return;
    }
    setPassword.mutate(
      { password },
      // Replace this page in the history so the used link isn't one tap away on "back"
      { onSuccess: () => navigate("/login?notice=password-set", { replace: true }) },
    );
  };

  const serverError = setPassword.error instanceof ApiError && setPassword.error.status < 500 ? setPassword.error.message : setPassword.error ? "We couldn't reach the server. Check your connection and try again." : null;
  const type = visible ? "text" : "password";
  const reveal = (
    <button type="button" className={login.revealButton} onClick={() => setVisible(!visible)} aria-pressed={visible} aria-label={visible ? "Hide passwords" : "Show passwords"}>
      <Icon name={visible ? "eyeOff" : "eye"} size={18} strokeWidth={1.8} />
    </button>
  );

  return (
    <AuthLayout>
      <form className={login.form} onSubmit={submit} noValidate>
        <h1>{link.purpose === "invite" ? `Welcome, ${firstName}` : "Choose a new password"}</h1>
        <p className={login.subtitle}>{link.purpose === "invite" ? "Choose a password to finish setting up your account." : `Your admin sent you a reset link, ${firstName}.`}</p>
        <p className={styles.who}>
          You'll sign in with <b>{link.email}</b>
        </p>

        <div className={login.field}>
          <label htmlFor={ids.password}>New password</label>
          <div className={login.passwordInput}>
            <input
              ref={passwordRef}
              id={ids.password}
              type={type}
              autoComplete="new-password"
              autoCapitalize="off"
              spellCheck={false}
              autoFocus
              value={password}
              onChange={(event) => {
                setPasswordText(event.target.value);
                setPassword.reset();
              }}
              onBlur={() => setLeft((state) => ({ ...state, password: true }))}
              aria-invalid={!!passwordError}
              aria-describedby={passwordError ? `${ids.password}-error` : undefined}
            />
            {reveal}
          </div>
          {passwordError && (
            <p id={`${ids.password}-error`} className={login.fieldError} role="alert">
              {passwordError}
            </p>
          )}
        </div>

        <div className={login.field}>
          <label htmlFor={ids.confirm}>New password again</label>
          <input
            ref={confirmRef}
            id={ids.confirm}
            type={type}
            autoComplete="new-password"
            autoCapitalize="off"
            spellCheck={false}
            value={confirm}
            onChange={(event) => {
              setConfirm(event.target.value);
              setPassword.reset();
            }}
            onBlur={() => setLeft((state) => ({ ...state, confirm: true }))}
            aria-invalid={!!confirmError}
            aria-describedby={confirmError ? `${ids.confirm}-error` : undefined}
          />
          {confirmError && (
            <p id={`${ids.confirm}-error`} className={login.fieldError} role="alert">
              {confirmError}
            </p>
          )}
        </div>

        <ul className={styles.checks} aria-label="Password checks">
          {checks.map((check) => (
            <li key={check.label} className={check.ok ? styles.met : undefined}>
              <span className={styles.checkMark} aria-hidden="true">
                {check.ok && <Icon name="check" size={11} strokeWidth={3} />}
              </span>
              {check.label}
              <span className="sr-only">{check.ok ? " (done)" : " (not yet)"}</span>
            </li>
          ))}
        </ul>
        <p className={styles.hint}>A long phrase you'll remember is the strongest, for example three or four words. Common passwords, and ones with your name or email in them, are refused.</p>

        {serverError && (
          <p className={login.serverError} role="alert">
            {serverError}
          </p>
        )}

        <Button type="submit" className={login.submit} disabled={setPassword.isPending}>
          {setPassword.isPending ? "Saving…" : "Set password and continue"}
        </Button>
      </form>
    </AuthLayout>
  );
}

/** Grey shapes where the heading and fields will be, while the link is checked. */
function FormSkeleton() {
  const bar = (width: string, height: number, radius?: number) => <div className={styles.skeletonBar} style={{ width, height, borderRadius: radius }} />;
  return (
    <div className={`${login.form} ${styles.skeleton}`} aria-busy="true" aria-label="Opening your link">
      {bar("62%", 32)}
      {bar("80%", 14)}
      {bar("100%", 40, 12)}
      {bar("32%", 13)}
      {bar("100%", 48, 12)}
      {bar("40%", 13)}
      {bar("100%", 48, 12)}
      {bar("100%", 48, 14)}
    </div>
  );
}
