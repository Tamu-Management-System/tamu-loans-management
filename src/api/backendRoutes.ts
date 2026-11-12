// Turns the calls the screens make (the paths in docs/api-contract.md) into the calls the real backend (loan-app-rest-api) expects.
// Only the client uses it, so no screen knows about it.
// The backend's own table of paths is docs/frontend-mapping.md in its repository; the rules below follow it row by row.
//
// What changes between the two:
//  - private routes live under /private/<Model>/…, public ones under /public/…
//  - a read is a POST to <path>/query with { query: { … } } (the screens send a GET with a query string)
//  - downloads (files, CSV) stay a GET with their query string

export interface BackendCall {
  method: string;
  /** Path under the API base, e.g. /private/Loans/list/query */
  path: string;
  body?: unknown;
}

type Mode =
  /** The call keeps its method and body */
  | "same"
  /** A GET with a query string becomes POST <path>/query with { query } */
  | "read";

interface Rule {
  method: string;
  /** The screen's path, with :params */
  from: RegExp;
  keys: string[];
  /** The backend's path, with :params from `from` */
  to: string;
  mode: Mode;
}

/** "/loans/:id/sms" -> a regular expression and the names of its parameters */
function pattern(path: string) {
  const keys: string[] = [];
  const source = path.replace(/:([A-Za-z]+)/g, (_match, key: string) => {
    keys.push(key);
    return "([^/]+)";
  });
  return { from: new RegExp(`^${source}$`), keys };
}

function rule(method: string, from: string, to: string, mode: Mode): Rule {
  return { method, ...pattern(from), to, mode };
}

const same = (method: string, from: string, to: string) => rule(method, from, to, "same");
const read = (from: string, to: string) => rule("GET", from, to, "read");

// Order matters where one path is more specific than another (e.g. /loans/list before /loans/:id).
const RULES: Rule[] = [
  // ---- sign in and my account
  same("GET", "/me", "/private/account/me"),
  read("/me/profile", "/private/account/me/profile"),
  same("PATCH", "/me/profile", "/private/account/me/profile"),
  same("POST", "/me/password", "/private/account/me/password"),
  read("/me/sessions", "/private/account/me/sessions"),
  same("POST", "/me/sessions/sign-out-others", "/private/account/me/sessions/sign-out-others"),
  read("/support/contacts", "/private/account/support/contacts"),
  read("/public/invites/:token", "/public/account/invites/:token"),
  same("POST", "/public/invites/:token", "/public/account/invites/:token"),

  // ---- applications
  same("POST", "/guarantors/check", "/private/LoanApplications/guarantors/check"),
  same("POST", "/applications", "/private/LoanApplications"),
  read("/applications", "/private/LoanApplications"),
  read("/applications/:id/draft", "/private/LoanApplications/:id/draft"),
  same("POST", "/applications/:id/approve", "/private/LoanApplications/:id/decision/approve"),
  same("POST", "/applications/:id/reject", "/private/LoanApplications/:id/decision/reject"),
  same("POST", "/applications/:id/close", "/private/LoanApplications/:id/close"),
  same("POST", "/applications/:id/disburse", "/private/Disbursements/applications/:id/disburse"),
  same("PATCH", "/applications/:id", "/private/LoanApplications/:id"),
  read("/applications/:id", "/private/LoanApplications/:id"),

  // ---- clients and documents
  read("/officers", "/private/Borrowers/officers"),
  read("/borrowers", "/private/Borrowers"),
  same("POST", "/borrowers/:id/national-id", "/private/Borrowers/:id/national-id"),
  same("POST", "/borrowers/:id/online-links", "/private/Borrowers/:id/online-links"),
  same("POST", "/borrowers/:id/phone-change/:changeId", "/private/Borrowers/:id/phone-change/:changeId"),
  read("/borrowers/:id/activity", "/private/Borrowers/:id/activity"),
  read("/borrowers/:id/documents", "/private/Borrowers/:id/documents"),
  same("POST", "/borrowers/:id/documents", "/private/Borrowers/:id/documents"),
  read("/borrowers/:id/loans", "/private/Borrowers/:id/loans"),
  same("PATCH", "/borrowers/:id", "/private/Borrowers/:id"),
  read("/borrowers/:id", "/private/Borrowers/:id"),
  same("GET", "/documents/:id/file", "/private/FileResources/:id/file"),

  // ---- loans, payments and recovery
  read("/sms/history", "/private/CommunicationLogs/sms-history"),
  read("/accounting/payouts", "/private/Disbursements/payouts"),
  read("/loans/to-disburse", "/private/Loans/to-disburse"),
  read("/loans/list", "/private/Loans/list"),
  same("GET", "/loans/export", "/private/Loans/export"),
  same("GET", "/loans/:id/application-pdf", "/private/Loans/:id/application-pdf"),
  same("POST", "/loans/:id/sms", "/private/Loans/:id/sms"),
  same("POST", "/loans/:id/recovery/return", "/private/Loans/:id/recovery/return"),
  same("POST", "/loans/:id/recovery", "/private/Loans/:id/recovery"),
  read("/loans/:id", "/private/Loans/:id"),
  read("/loans", "/private/Loans"),
  read("/payments/list", "/private/Payments/list"),
  same("POST", "/payments", "/private/Payments"),
  same("PATCH", "/payments/:id", "/private/Payments/:id"),

  // ---- dashboard, worklist, bell and portfolio
  read("/dashboard/today", "/private/dashboard/today"),
  read("/navigation/badges", "/private/dashboard/navigation/badges"),
  read("/search", "/private/dashboard/search"),
  read("/team/performance", "/private/dashboard/team/performance"),
  read("/activity", "/private/dashboard/activity"),
  read("/portfolio/risk-summary", "/private/Loans/portfolio/risk-summary"),
  read("/portfolio/risk", "/private/Loans/portfolio/risk"),
  read("/portfolio/arrears", "/private/Loans/portfolio/arrears"),
  read("/portfolio/early-warnings", "/private/Loans/portfolio/early-warnings"),
  read("/portfolio/summary", "/private/Loans/portfolio/summary"),
  read("/notifications/history", "/private/Notifications/history"),
  same("POST", "/notifications/mark-read", "/private/Notifications/mark-read"),
  read("/notifications", "/private/Notifications"),
  same("POST", "/worklist/tasks", "/private/WorkListTasks/tasks"),
  same("POST", "/worklist/:id/actions", "/private/WorkListTasks/:id/actions"),
  same("POST", "/worklist/:id/call-outcome", "/private/WorkListTasks/:id/call-outcome"),
  same("POST", "/worklist/:id/undo", "/private/WorkListTasks/:id/undo"),
  read("/worklist/:id/match-candidates", "/private/WorkListTasks/:id/match-candidates"),
  same("POST", "/worklist/:id/match", "/private/WorkListTasks/:id/match"),
  read("/worklist", "/private/WorkListTasks"),

  // ---- reports and audit
  same("GET", "/reports/:name/export", "/private/Reports/:name/export"),
  read("/reports/:name", "/private/Reports/:name"),
  same("GET", "/audit/export", "/private/AuditLogs/export"),
  read("/audit", "/private/AuditLogs"),

  // ---- settings, products, staff and roles
  read("/settings", "/private/Settings"),
  same("PUT", "/settings/:section", "/private/Settings/:section"),
  read("/loan-products", "/private/LoanProducts"),
  same("POST", "/loan-products/:id/archive", "/private/LoanProducts/:id/archive"),
  same("POST", "/loan-products/:id/restore", "/private/LoanProducts/:id/restore"),
  same("POST", "/loan-products", "/private/LoanProducts"),
  same("PUT", "/loan-products/:id", "/private/LoanProducts/:id"),
  read("/roles", "/private/Roles"),
  same("POST", "/roles", "/private/Roles"),
  same("PUT", "/roles/:id", "/private/Roles/:id"),
  same("DELETE", "/roles/:id", "/private/Roles/:id"),
  read("/staff", "/private/StaffAccounts"),
  same("POST", "/staff/invites", "/private/StaffAccounts/invites"),
  same("POST", "/staff/:id/invite", "/private/StaffAccounts/:id/invite"),
  same("DELETE", "/staff/:id/invite", "/private/StaffAccounts/:id/invite"),
  same("PUT", "/staff/:id/role", "/private/StaffAccounts/:id/role"),
  same("PUT", "/staff/:id/branch", "/private/StaffAccounts/:id/branch"),
  same("POST", "/staff/:id/deactivate", "/private/StaffAccounts/:id/deactivate"),
  same("POST", "/staff/:id/reactivate", "/private/StaffAccounts/:id/reactivate"),

  // ---- the public online form (no sign-in)
  read("/public/forms/:token", "/public/online-application/forms/:token"),
  same("POST", "/public/forms/:token", "/public/online-application/forms/:token"),
];

/** Query-string values the backend reads as numbers */
const NUMERIC_KEYS = new Set(["page", "pageSize", "limit", "endedLimit"]);

function queryObject(search: string): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of new URLSearchParams(search)) {
    out[key] = NUMERIC_KEYS.has(key) && /^\d+$/.test(value) ? Number(value) : value;
  }
  return out;
}

/** Sign-in, renewal and sign-out are the backend's own, not renamed versions of the contract's. */
export const SIGN_IN_PATH = "/public/account/login";
export const REFRESH_PATH = "/public/account/refresh";
export const SIGN_OUT_PATH = "/private/account/logout";

/**
 * The backend's call for one of the screen's calls.
 * A path that no rule knows is sent unchanged, so the server's 404 shows which one is missing.
 */
export function toBackend(method: string, screenPath: string, body?: unknown): BackendCall {
  if (method === "POST" && screenPath === "/auth/login") {
    const { email, password } = (body ?? {}) as { email?: string; password?: string };
    return { method, path: SIGN_IN_PATH, body: { username: email, password } };
  }
  if (method === "POST" && screenPath === "/auth/logout") return { method, path: SIGN_OUT_PATH };

  const queryStart = screenPath.indexOf("?");
  const path = queryStart === -1 ? screenPath : screenPath.slice(0, queryStart);
  const search = queryStart === -1 ? "" : screenPath.slice(queryStart + 1);

  for (const candidate of RULES) {
    if (candidate.method !== method) continue;
    const match = candidate.from.exec(path);
    if (!match) continue;
    const target = candidate.keys.reduce((result, key, index) => result.replace(`:${key}`, match[index + 1]), candidate.to);
    if (candidate.mode === "read") return { method: "POST", path: `${target}/query`, body: { query: queryObject(search) } };
    return { method, path: search ? `${target}?${search}` : target, body };
  }
  return { method, path: screenPath, body };
}
