// The only place the app talks to the backend. Screens call these helpers
// (usually through TanStack Query), never fetch() directly, so switching from
// the mock API to the real one is a config change: set VITE_API_URL.
const BASE_URL = import.meta.env.VITE_API_URL ?? "/api";

export class ApiError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(status: number, message: string, body?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

/** Wording shown when the server doesn't send its own message. */
function fallbackMessage(status: number) {
  if (status === 401) return "Please sign in again.";
  if (status === 403) return "You don't have permission to do that.";
  if (status === 404) return "We couldn't find that. It may have been moved or removed.";
  if (status >= 500) return "Something went wrong on our side. Please try again.";
  return "That didn't work. Please try again.";
}

// CSRF protection (double-submit cookie): the backend sets a readable XSRF-TOKEN cookie and
// rejects any request that changes data unless the same value comes back in this header.
const CSRF_COOKIE = "XSRF-TOKEN";
const CSRF_HEADER = "X-XSRF-TOKEN";
const SAFE_METHODS = ["GET", "HEAD", "OPTIONS"];

function readCookie(name: string): string | null {
  const match = document.cookie.split("; ").find((cookie) => cookie.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : null;
}

function parseJson(text: string): unknown {
  try {
    return text ? JSON.parse(text) : undefined;
  } catch {
    return undefined; // e.g. an HTML error page from a proxy
  }
}

interface RequestOptions {
  /** Sent as the Idempotency-Key header: the server returns the first result again for a repeat of the same key */
  idempotencyKey?: string;
}

/** A fresh key for one money action (one opened dialog); the same key is reused if that action is retried. */
export function newIdempotencyKey() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

/** Sends a request and returns the response, or throws an ApiError with the server's message. */
async function send(method: string, path: string, body?: unknown, options: RequestOptions = {}): Promise<Response> {
  const isUpload = body instanceof FormData;
  const headers: Record<string, string> = {};
  // Money requests carry a key so a retry (a double click, a dropped connection) can't be recorded twice
  if (options.idempotencyKey) headers["Idempotency-Key"] = options.idempotencyKey;
  // Uploads: the browser sets the multipart Content-Type (with its boundary) itself
  if (body !== undefined && !isUpload) headers["Content-Type"] = "application/json";
  const csrfToken = SAFE_METHODS.includes(method) ? null : readCookie(CSRF_COOKIE);
  if (csrfToken) headers[CSRF_HEADER] = csrfToken;

  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : isUpload ? body : JSON.stringify(body),
    // Send the session cookie; never keep financial data in the browser's HTTP cache
    credentials: "include",
    cache: "no-store",
  });

  if (!response.ok) {
    const data = parseJson(await response.text());
    const message =
      typeof data === "object" && data !== null && "message" in data
        ? String((data as { message: unknown }).message)
        : fallbackMessage(response.status);
    throw new ApiError(response.status, message, data);
  }
  return response;
}

async function request<T>(method: string, path: string, body?: unknown, options?: RequestOptions): Promise<T> {
  const response = await send(method, path, body, options);
  return parseJson(await response.text()) as T;
}

export const api = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body?: unknown, options?: RequestOptions) => request<T>("POST", path, body, options),
  patch: <T>(path: string, body?: unknown, options?: RequestOptions) => request<T>("PATCH", path, body, options),
  put: <T>(path: string, body?: unknown) => request<T>("PUT", path, body),
  delete: <T>(path: string) => request<T>("DELETE", path),
  /** A file (e.g. a PDF), fetched with the session like any other request */
  getFile: async (path: string) => {
    const response = await send("GET", path);
    // A file is never a web page. If one comes back, the request didn't reach the API (the app's own page was served instead),
    // so refuse it rather than saving a web page as a "report".
    if ((response.headers.get("Content-Type") ?? "").toLowerCase().includes("text/html")) throw new ApiError(502, "The file couldn't be downloaded. Refresh the page and try again.");
    return response.blob();
  },
  /** Multipart upload, e.g. a document with its fields */
  upload: <T>(path: string, form: FormData) => request<T>("POST", path, form),
};
