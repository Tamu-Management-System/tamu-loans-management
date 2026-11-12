# Tamu Loans — security

Tamu Loans handles borrowers' identity documents, phone numbers, loans and money. Treat it as a
financial system: assume it will be attacked, and protect it in depth.

**The backend enforces security. The frontend never replaces it.** Everything the frontend hides or
checks (permissions, timeouts, validation) must also be enforced by the backend, because anyone
can call the API directly.

---

## 1. What the frontend already does

| Protection | Where |
|---|---|
| Sign-in at `/login`; every other page needs a session and redirects to `/login?next=…` | `src/auth/AuthContext.tsx` |
| `next` only accepts paths inside the app, which blocks open-redirect phishing links (e.g. `?next=https://evil.example`) | `safeNextPath` in `src/auth/session.ts` |
| Sign-out wipes all cached data at once; Back can't show the previous user's screens | `endSession` in `src/auth/session.ts` |
| Signing out in one tab signs out every open tab | `BroadcastChannel` in `src/auth/session.ts` |
| Automatic sign-out after **15 minutes** without activity, with a 2-minute warning; activity in any tab counts | `src/auth/IdleSessionGuard.tsx` |
| Any `401` (session ended on the server) wipes data and returns to the login page | `handleSessionExpiry` in `src/app/App.tsx` |
| One error message for a wrong email **or** password, so the page doesn't reveal which emails exist | `src/pages/LoginPage.tsx` |
| CSRF token sent on every request that changes data (double-submit cookie, see 2.2) | `src/api/client.ts` |
| API responses are never stored in the browser's HTTP cache (`cache: "no-store"`) | `src/api/client.ts` |
| Content Security Policy in production builds (scripts, styles, fonts, images and API calls only from listed sources) | `vite.config.ts` |
| The code contains **no** mock API, sample data or demo accounts, and a build refuses to run without the backend address | `vite.config.ts` (`VITE_API_URL` check) |
| No source maps in production (they would publish readable source code) | `vite.config.ts` |
| Permission checks in the UI (`can("applications.approve")`), never role names | `src/auth/permissions.ts` |
| Nothing sensitive in browser storage: only UI preferences and the last-activity time | — |
| National ID numbers are masked; showing one is a separate request, recorded by the server and masked again after 30 seconds or when the tab is hidden; never cached | `src/modules/borrowers/NationalIdField.tsx` |
| Documents (ID photos, agreements) are fetched with the session and previewed from memory (`blob:`), never linked directly; only JPEG, PNG and PDF are rendered, anything else can only be downloaded | `src/modules/borrowers/documents/DocumentPreviewDialog.tsx` |
| Uploads are checked before sending: JPEG, PNG or PDF, at most 5 MB | `src/modules/borrowers/documents/UploadDocumentDialog.tsx` |
| Online application links: only loan terms are shown (no personal data), the link works once (dead after submit) and expires in 72 h; pages send no referrer and ask search engines not to index them; ID photos are shrunk and re-drawn on the phone, dropping hidden photo data such as location | `src/modules/online-application/`, `index.html` |

---

## 2. What the backend must do

### 2.1 Sessions
- Session in a cookie set by `POST /auth/login`: **`HttpOnly`, `Secure`, `SameSite=Lax`** (or `Strict`), `Path=/`.
  Never return a session token in a response body, and never accept it in a URL.
- **New session id on every sign-in** (prevents session fixation). Destroy it server-side on `POST /auth/logout`.
- **Idle timeout: 15 minutes** (same as the frontend; confirm with the client). **Absolute timeout:** e.g. 10 hours,
  then sign in again whatever the activity.
- When a session has ended, every endpoint returns `401`.
- Optional: list and revoke a user's active sessions (needed if a device is lost).

### 2.2 CSRF (cross-site request forgery)
- Set a readable cookie `XSRF-TOKEN` (random, per session; **not** `HttpOnly`).
- For every `POST`, `PATCH`, `PUT` and `DELETE`, require header `X-XSRF-TOKEN` to equal that cookie; otherwise `403`.
  The frontend already sends it.
- `SameSite` cookies help, but don't rely on them alone.

### 2.3 Sign-in and passwords
- Hash passwords with **Argon2id** (or bcrypt, cost ≥ 12). Never store or log plain passwords.
- Minimum **12 characters**; reject common or breached passwords. Don't force character-type rules or regular rotation (NIST SP 800-63B).
- **Rate limiting and lockout:** e.g. 5 failed attempts per account in 15 minutes locks it for 15 minutes, plus a
  per-IP limit. Answer `429` with a `message` (the login page shows it as is).
- Same error for unknown email and wrong password; keep response times similar for both.
- Reset links (sent by an admin): single use, expire in ≤ 30 minutes, invalidate all of the user's sessions on use.
- **New staff join by invite** (Settings → Users): a single-use link that expires after 48 hours, stored only as a
  hash; the person sets their own password, so no admin ever knows it. Sending a new invite kills the old link.
- Record every sign-in, failed attempt, lockout and password reset in the audit log (with IP and device).
- **Phase 2:** a second step (SMS code) for sign-in, at least for Admin and Finance, once the SMS gateway exists.

### 2.4 Authorisation
- Check the permission on **every** endpoint; never trust the frontend.
- **Data isolation (QA scenario 1):** users whose role has `dataScope: "own"` must get `404` for anything outside their own
  portfolio, by id, in lists, search results and exports.
- **Four-eyes rule:** the person who approved a loan can't disburse it (Settings → Loan rules).
- **Staff and roles:** nobody can change their own role or switch off their own account. Refuse any change that
  would leave nobody active with `users.manage` or `roles.manage`. Built-in roles can't be changed.
- **Leavers:** switching an account off ends all its sessions at once and blocks sign-in; the account and its
  history are never deleted. Their borrowers move to another officer first. Turning it back on sends a new invite
  (new password), never the old one.
- Money operations (payments, disbursements): validate amounts server-side, make them idempotent
  (an idempotency key, so a double click can't pay twice), and never trust balances sent by the client.

### 2.5 Audit trail
- Append-only log of who did what, when, from where: sign-ins, payments, approvals, disbursements,
  permission and role changes, document views and downloads.
- Anyone with `audit.view` can read it (Admin and Finance by default); nobody can edit or delete it.
- Exports need `audit.export` (Admin by default), are CSV with formula injection neutralised, and are logged.

### 2.6 Data protection
- Uganda's **Data Protection and Privacy Act, 2019** applies (National ID numbers, ID photos, phone numbers,
  next of kin, income, guarantors). Register with the **Personal Data Protection Office**, collect only what's
  needed, and agree retention periods with the client.
- Encrypt data **in transit** (HTTPS only) and **at rest** (database, file storage, backups).
- ID photos and loan agreements: private storage only; serve them through short-lived, permission-checked links.
- **Uploads:** check the real file type from its contents (magic bytes), not the name or the browser's
  Content-Type; accept only JPEG, PNG and PDF up to 5 MB; scan for malware; strip image metadata (EXIF location);
  store under a random name, never the uploaded one. Replacing a document keeps the old version; nothing is deleted.
- Serve documents with `Content-Type` set from the stored, verified type, `X-Content-Type-Options: nosniff` and
  `Cache-Control: no-store`, and log every view and download.
- Don't log personal data (National ID numbers, phone numbers, full names) in application logs.
- Encrypted, tested backups; a restore drill before launch.

---

## 3. What the hosting must do

Serve the app over **HTTPS only**, with these response headers (`frame-ancestors` and HSTS can't be set
from the page itself):

```
Strict-Transport-Security: max-age=31536000; includeSubDomains
Content-Security-Policy: frame-ancestors 'none'
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=()
Cache-Control: no-store            (for index.html; hashed files in /assets can be cached long-term)
```

- Serve `index.html` for every app path (`/login`, `/applications/…`), so deep links work.
- **Deploy `npm run build`** with `VITE_API_URL` set to the backend. There is no demo build any more.

---

## 4. Before launch (checklist)

- [ ] All of section 2 implemented and tested, including the QA scenarios in the proposal.
- [ ] Independent penetration test (or at least an OWASP Top 10 review) of the backend.
- [ ] `npm audit --omit=dev` shows no vulnerabilities; dependencies up to date.
- [x] The demo tools (`src/demo`, `src/mocks`, `public/mockServiceWorker.js`) removed from the codebase (12 Nov 2026).
- [ ] Hosting headers in section 3 verified (e.g. with securityheaders.com).
- [ ] Idle and absolute timeouts confirmed with the client.
