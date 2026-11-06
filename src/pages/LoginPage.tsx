import { lazy, Suspense, useId, useRef, useState, type FormEvent } from "react";
import { Navigate, useSearchParams } from "react-router";
import { ApiError } from "../api/client";
import { useSignIn } from "../api/auth";
import { useSession } from "../auth/AuthContext";
import { isSessionEndReason, safeNextPath, type SessionEndReason } from "../auth/session";
import { Button } from "../components/ui/Button";
import { AuthLayout } from "../components/layout/AuthLayout";
import { Icon } from "../components/ui/Icon";
import styles from "./LoginPage.module.css";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// TEMPORARY demo accounts; not part of production builds (__MOCK_API_ENABLED__ in vite.config.ts)
const DemoAccounts = __MOCK_API_ENABLED__ ? lazy(() => import("../demo/DemoAccounts").then((module) => ({ default: module.DemoAccounts }))) : null;

/** Why the user is on the login page, when it wasn't their choice. */
const SESSION_END_NOTICES: Record<SessionEndReason, string> = {
  idle: "You were signed out after a while without activity, to keep client data safe. Sign in again to continue.",
  expired: "Your session has ended. Sign in again to continue.",
  "signed-out-elsewhere": "You signed out in another tab.",
};

interface FieldErrors {
  email?: string;
  password?: string;
}

function validate(email: string, password: string): FieldErrors {
  const errors: FieldErrors = {};
  if (!email.trim()) errors.email = "Enter your email address.";
  else if (!EMAIL_PATTERN.test(email.trim())) errors.email = "Enter a valid email address, like name@example.com.";
  if (!password) errors.password = "Enter your password.";
  return errors;
}

/**
 * Staff sign-in at /login: email and password. Forgotten passwords are reset by an admin
 * (no self-service yet), and there's no second step for the MVP. After signing in, the user
 * returns to `?next=` if it's a page inside the app, otherwise the dashboard.
 */
export function LoginPage() {
  const { status } = useSession();
  const [searchParams] = useSearchParams();
  const nextPath = safeNextPath(searchParams.get("next"));
  const reasonParam = searchParams.get("reason");
  // After setting a password from an invite or reset link, the page sends people here with ?notice=password-set
  const sessionEndNotice = isSessionEndReason(reasonParam) ? SESSION_END_NOTICES[reasonParam] : searchParams.get("notice") === "password-set" ? "Your password is set. Sign in with your email and new password." : null;
  const ids = { email: useId(), password: useId(), emailError: useId(), passwordError: useId(), forgot: useId() };
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const signIn = useSignIn();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showForgotHelp, setShowForgotHelp] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const found = validate(email, password);
    setErrors(found);
    if (found.email) return emailRef.current?.focus();
    if (found.password) return passwordRef.current?.focus();
    signIn.mutate({ email: email.trim(), password });
  };

  const serverError =
    signIn.error instanceof ApiError && signIn.error.status < 500
      ? signIn.error.message
      : signIn.error
        ? "We couldn't reach the server. Check your connection and try again."
        : null;

  // Already signed in (or just signed in): open the page they were going to
  if (status === "signed-in") return <Navigate to={nextPath} replace />;

  return (
    <AuthLayout>
        <form className={styles.form} onSubmit={submit} noValidate>
          <h1>Welcome back</h1>
          <p className={styles.subtitle}>Sign in to continue</p>

          {sessionEndNotice && (
            <p className={styles.sessionNotice} role="status">
              {sessionEndNotice}
            </p>
          )}

          <div className={styles.field}>
            <label htmlFor={ids.email}>Email</label>
            <input
              ref={emailRef}
              id={ids.email}
              type="email"
              autoComplete="username"
              inputMode="email"
              autoFocus
              value={email}
              onChange={(event) => {
                setEmail(event.target.value);
                signIn.reset(); // an old "doesn't match" message no longer applies
              }}
              aria-invalid={!!errors.email}
              aria-describedby={errors.email ? ids.emailError : undefined}
            />
            {errors.email && (
              <p id={ids.emailError} className={styles.fieldError}>
                {errors.email}
              </p>
            )}
          </div>

          <div className={styles.field}>
            <label htmlFor={ids.password}>Password</label>
            <div className={styles.passwordInput}>
              <input
                ref={passwordRef}
                id={ids.password}
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                value={password}
                onChange={(event) => {
                  setPassword(event.target.value);
                  signIn.reset();
                }}
                aria-invalid={!!errors.password}
                aria-describedby={errors.password ? ids.passwordError : undefined}
              />
              <button
                type="button"
                className={styles.revealButton}
                onClick={() => setShowPassword(!showPassword)}
                aria-pressed={showPassword}
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                <Icon name={showPassword ? "eyeOff" : "eye"} size={18} strokeWidth={1.8} />
              </button>
            </div>
            {errors.password && (
              <p id={ids.passwordError} className={styles.fieldError}>
                {errors.password}
              </p>
            )}
          </div>

          <button
            type="button"
            className={styles.forgotLink}
            aria-expanded={showForgotHelp}
            aria-controls={ids.forgot}
            onClick={() => setShowForgotHelp(!showForgotHelp)}
          >
            Forgot password?
          </button>
          {showForgotHelp && (
            <p id={ids.forgot} className={styles.forgotHelp}>
              Ask an admin to send you a password reset link.
            </p>
          )}

          {serverError && (
            <p className={styles.serverError} role="alert">
              {serverError}
            </p>
          )}

          <Button type="submit" className={styles.submit} disabled={signIn.isPending}>
            {signIn.isPending ? "Signing in…" : "Sign in"}
          </Button>

          {DemoAccounts && (
            <Suspense fallback={null}>
              <DemoAccounts
                onPick={(demoEmail, demoPassword) => {
                  setEmail(demoEmail);
                  setPassword(demoPassword);
                  setErrors({});
                  signIn.reset();
                }}
              />
            </Suspense>
          )}
        </form>
    </AuthLayout>
  );
}
