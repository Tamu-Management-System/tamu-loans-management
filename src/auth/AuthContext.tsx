import { createContext, useCallback, useContext, useEffect, useMemo, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Navigate, useLocation } from "react-router";
import { api, ApiError } from "../api/client";
import { hasAnyPermission, type Permission } from "./permissions";
import { endSession, loginPath, onSessionMessage, sessionEnd } from "./session";
import type { CurrentUser } from "./types";
import styles from "./AuthContext.module.css";

// ---------- Session state (signed in, signed out, loading) ----------

type SessionStatus = "loading" | "signed-in" | "signed-out" | "error";

interface SessionValue {
  status: SessionStatus;
  user: CurrentUser | null;
  retry: () => void;
}

const SessionContext = createContext<SessionValue | null>(null);

/**
 * Loads the signed-in user from GET /me. A 401, or an explicit sign-out (user set to null),
 * means signed out. Also follows sign-in / sign-out in the app's other tabs.
 */
export function SessionProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const { data, isPending, error, refetch } = useQuery<CurrentUser | null>({
    queryKey: ["me"],
    queryFn: async () => {
      const user = await api.get<CurrentUser>("/me");
      return { ...user, branch: user.branch ?? "" };
    },
    staleTime: Infinity,
    retry: (failureCount, err) => !(err instanceof ApiError && err.status === 401) && failureCount < 1,
  });

  useEffect(
    () =>
      onSessionMessage((message) => {
        if (message === "signed-out") endSession(queryClient, "signed-out-elsewhere");
        if (message === "signed-in") queryClient.invalidateQueries({ queryKey: ["me"] });
      }),
    [queryClient],
  );

  const status: SessionStatus = data
    ? "signed-in"
    : data === null || (error instanceof ApiError && error.status === 401)
      ? "signed-out"
      : isPending
        ? "loading"
        : "error";

  const value = useMemo(() => ({ status, user: data ?? null, retry: () => void refetch() }), [status, data, refetch]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const context = useContext(SessionContext);
  if (!context) throw new Error("useSession must be used inside <SessionProvider>");
  return context;
}

// ---------- Signed-in area ----------

interface AuthValue {
  user: CurrentUser;
  /** can("applications.approve") or can(["users.view", "roles.manage"]) for any-of */
  can: (needed: Permission | Permission[]) => boolean;
  /** Sees the whole branch (otherwise only the clients they look after) */
  seesBranch: boolean;
}

const AuthContext = createContext<AuthValue | null>(null);

/**
 * Guards every page except /login. Signed-out visitors are redirected to
 * /login?next=<this page>, so they return here after signing in.
 */
export function RequireSignIn({ children }: { children: ReactNode }) {
  const { status, user, retry } = useSession();
  const location = useLocation();

  const can = useCallback(
    (needed: Permission | Permission[]) => (user ? hasAnyPermission(user.permissions, needed) : false),
    [user],
  );
  const value = useMemo(() => (user ? { user, can, seesBranch: user.dataScope === "branch" } : null), [user, can]);

  if (status === "signed-out") {
    const { reason, returnToPage } = sessionEnd();
    return <Navigate to={loginPath({ next: returnToPage ? location.pathname + location.search : undefined, reason })} replace />;
  }
  if (value) return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
  // The same outline index.html shows before the app starts, so the page doesn't flash blank while the account loads
  if (status === "loading")
    return (
      <div className="boot-shell" role="status" aria-label="Loading your account">
        <div className="boot-side">
          <div className="boot-logo" />
          {Array.from({ length: 7 }, (_, index) => (
            <div key={index} className="boot-item" />
          ))}
        </div>
        <div className="boot-main">
          <div className="boot-top" />
          <div className="boot-card" />
        </div>
      </div>
    );
  return (
    <div className={styles.fullPage} role="alert">
      <p>We couldn't load your account.</p>
      <button type="button" onClick={retry}>
        Try again
      </button>
    </div>
  );
}

/** The signed-in user and permission check. Only inside <RequireSignIn>. */
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside <RequireSignIn>");
  return context;
}
