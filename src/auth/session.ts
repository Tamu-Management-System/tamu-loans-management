// Session helpers that aren't React components: safe redirects, ending a session, and
// keeping every open tab in step. The backend owns the real session (an HTTP-only cookie);
// these only make sure the frontend never shows data after it has ended.
import type { QueryClient } from "@tanstack/react-query";

/** Sign out after this long without activity. Agreed default for a financial system; confirm
 *  with the client. The backend must enforce the same limit (see docs/security.md). */
export const IDLE_TIMEOUT_MINUTES = 15;

/** Why the user is being sent to the login screen; shown there as a short notice. */
export type SessionEndReason = "idle" | "expired" | "signed-out-elsewhere";

const SESSION_END_REASONS: SessionEndReason[] = ["idle", "expired", "signed-out-elsewhere"];

export const isSessionEndReason = (value: string | null): value is SessionEndReason =>
  !!value && (SESSION_END_REASONS as string[]).includes(value);

// ---------- Safe redirects ----------

/**
 * The page to open after signing in, from `?next=`. Only paths inside this app are allowed,
 * so a crafted link like /login?next=https://evil.example can't send users to another site
 * (an "open redirect", a common phishing trick).
 */
export function safeNextPath(next: string | null): string {
  if (!next) return "/";
  const isAppPath = next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") && !next.includes("://");
  if (!isAppPath || next.startsWith("/login")) return "/";
  return next;
}

/** Address of the login page, remembering where the user was going and why they're there. */
export function loginPath({ next, reason }: { next?: string; reason?: SessionEndReason | null }) {
  const params = new URLSearchParams();
  if (next && next !== "/") params.set("next", next);
  if (reason) params.set("reason", reason);
  const query = params.toString();
  return query ? `/login?${query}` : "/login";
}

// ---------- Ending a session ----------

let pendingReason: SessionEndReason | null = null;
let returnToPage = true;

/** Why the last session ended, and whether to return to the same page after signing in again. */
export const sessionEnd = () => ({ reason: pendingReason, returnToPage });

export const clearSessionEndReason = () => {
  pendingReason = null;
  returnToPage = true;
};

/**
 * Forgets the signed-in user and every piece of cached data at once, so nothing from the
 * session can be shown again (including with the Back button). The page guard then opens the
 * login page, remembering the current page unless `returnToPage` is false (a deliberate sign-out).
 */
export function endSession(queryClient: QueryClient, reason: SessionEndReason | null = null, options: { returnToPage?: boolean } = {}) {
  pendingReason = reason;
  returnToPage = options.returnToPage ?? true;
  queryClient.cancelQueries();
  queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== "me" });
  queryClient.setQueryData(["me"], null);
}

// ---------- Keeping tabs in step ----------

type SessionMessage = "signed-out" | "signed-in";

const channel = typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel("tamu-session");

/** Tells the app's other open tabs that the user signed in or out. */
export const announceSession = (message: SessionMessage) => channel?.postMessage(message);

/** Listens for sign-in / sign-out in other tabs. Returns a function that stops listening. */
export function onSessionMessage(handler: (message: SessionMessage) => void) {
  if (!channel) return () => {};
  const listener = (event: MessageEvent<SessionMessage>) => handler(event.data);
  channel.addEventListener("message", listener);
  return () => channel.removeEventListener("message", listener);
}
