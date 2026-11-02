# Tamu Loans — API contract

This is the API the frontend expects. It grows as screens are built, so the backend
developer can build exactly what the frontend needs. While the backend doesn't exist,
the mock API in `src/mocks/handlers.ts` answers these requests. Keep the two in step:
when an endpoint here changes, change its mock handler too.

## Conventions

- **Base URL:** `/api` by default. Set `VITE_API_URL` to point the frontend at the real backend.
- **Format:** JSON request and response bodies. Dates as ISO 8601 strings (`2026-10-31T09:42:00Z`).
- **Money:** whole Ugandan shillings as integers (`1240000`), never formatted strings.
- **Auth:** session cookie (`credentials: "include"`). An unauthenticated request returns `401`.
- **CSRF:** the backend sets a readable `XSRF-TOKEN` cookie; every `POST`/`PATCH`/`PUT`/`DELETE` carries the same
  value in the `X-XSRF-TOKEN` header, which the backend must check (`403` if missing or wrong).
- **Security requirements** (session flags, timeouts, lockout, audit log): see [security.md](security.md).
- **Errors:** non-2xx status with a body of `{ "message": "Readable explanation" }`.
  The frontend shows `message` to the user, so write it for them.
- **Permissions:** the backend must enforce every permission itself. The frontend only
  hides what a user can't do; it is not a security boundary.

## Permissions

Each user has one role; a role is a set of permissions. Built-in roles (Admin, Finance,
Loan officer) are **read-only**. Admins create **custom roles** with any set of permissions.

Each role also has a **data access level** (`dataScope`): `own` (only the borrowers its people look after) or
`branch` (everyone in the branch). It applies to borrowers, documents, applications, loans, payments, recovery and
reports. Roles with any `users.*`, `roles.*` or `settings.*` permission must be `branch`.

| Permission | Meaning | Needs |
|---|---|---|
| `borrowers.view` | See borrowers | |
| `borrowers.create` | Register borrowers | `borrowers.view` |
| `borrowers.edit` | Edit contact, next of kin and work details | `borrowers.view` |
| `borrowers.phoneApprove` | Approve a new mobile money number asked for by someone else | `borrowers.view` |
| `borrowers.export` | Export borrower lists | `borrowers.view` |
| `borrowers.nationalId` | Reveal full National ID numbers (logged) | `borrowers.view` |
| `documents.view` | View documents in the app (logged) | `borrowers.view` |
| `documents.upload` | Upload and replace documents | `documents.view` |
| `documents.download` | Download documents and signed applications (logged) | `documents.view` |
| `applications.view` | See applications | |
| `applications.create` | Start and submit applications | `applications.view`, `borrowers.create`, `documents.upload` |
| `applications.approve` | Approve or reject applications | `applications.view`, `documents.view` |
| `applications.onlineLink` | Create online form links | `applications.view` |
| `loans.view` | See loans | |
| `loans.disburse` | Record payouts | `loans.view`, `applications.view` |
| `loans.export` | Export loan lists | `loans.view` |
| `payments.view` | See payments | |
| `payments.record` | Record repayments | `payments.view`, `loans.view` |
| `payments.export` | Export payments | `payments.view` |
| `recovery.view` | See loans in recovery | `loans.view` |
| `recovery.manage` | Send loans to recovery and bring them back | `recovery.view` |
| `reports.view` / `reports.export` | Reports | |
| `users.view` / `users.manage` | Staff accounts | |
| `roles.manage` | Custom roles | `users.view` |
| `settings.business`, `settings.products`, `settings.rules`, `settings.payments`, `settings.security` | Each Settings section | |
| `audit.view` | The audit log | |

When a role is saved, the backend adds whatever the chosen permissions need (the "Needs" column).

Built-in defaults are in `src/auth/permissions.ts`.

**System rules (Settings → Loan rules):** the person who approved a loan can't disburse it, and whoever started
an application can't approve it (both on by default and switchable). Enforce them on the endpoints; return `403`
with a clear `message`.

## Endpoints

### `POST /auth/login`

Signs a staff member in with email and password.

```json
{ "email": "sharon@tamu.example", "password": "…" }
```

- `204` and an **HTTP-only, secure session cookie** on success. The frontend then calls `GET /me`.
- `401` with `{ "message": "That email and password don't match. Check them and try again." }` on a wrong
  email or password. Use the same message for both, so the screen doesn't reveal which emails exist.
- Consider `429` with a `message` after repeated failures (lockout); the frontend shows it as is.
- **Decisions (client, 31 Oct):** email + password only; no 2-step code for the MVP (SMS is Phase 2);
  forgotten passwords are reset by an admin (worklist action "Send reset link"), no self-service yet.

### `POST /auth/logout`

Ends the session. `204`. The frontend clears its cached data and shows the login screen.

### Session expiry

Any endpoint may return `401` when the session has ended. The frontend then shows the login screen and,
after signing in again, returns the user to the page they were on.

### `GET /me`

The signed-in user, with permissions already resolved from their role.

```json
{
  "id": "u-sharon",
  "name": "Sharon Nakalema",
  "email": "sharon@tamu.example",
  "photoUrl": "https://…/photo.jpg",
  "branch": "Kampala Central",
  "role": { "id": "loan_officer", "name": "Loan officer" },
  "permissions": ["borrowers.create", "applications.create", "documents.upload", "loans.view.own", "payments.record", "reports.view.own"]
}
```

- `photoUrl` may be `null`; the frontend then shows initials.
- `401` if not signed in.

### `GET /search?q={text}`

Finds loans and applications by borrower name, ID or phone number, for the top-bar search.

- Returns `[]` when `q` is shorter than 2 characters.
- **Scope:** users with `loans.view.own` only get their own borrowers; `loans.view.all` gets the branch.
- At most 6 results, loans first.

```json
[
  { "kind": "loan", "id": "TL-0987", "title": "Moses Ssebunya", "subtitle": "TL-0987 · 0701 552 914 · 9 days late", "href": "/loans/TL-0987" },
  { "kind": "application", "id": "APP-311", "title": "Godfrey Byaruhanga", "subtitle": "APP-311 · application · UGX 2,500,000", "href": "/applications/APP-311" }
]
```

`href` is the frontend route the result opens. Phone matching ignores spaces; at least 3 digits are needed.

### `GET /notifications`

Alerts for the bell in the top bar, chosen by the user's permissions.

```json
[
  { "id": "repayments-due", "title": "Repayments due today", "detail": "Record them as borrowers pay", "href": "/?worklist=collect", "unread": true }
]
```

### `POST /notifications/mark-read`

Marks all of the user's current notifications as read (the frontend calls it when the bell is opened). Returns `204`.

### `GET /navigation/badges`

Counts shown next to menu items.

```json
{ "applications": 2 }
```

- `applications`: for users with `loans.approve` or `loans.view.all`, applications waiting for approval;
  otherwise, the user's own drafts that still need documents.

### `GET /portfolio/risk-summary`

PAR30 for the sidebar risk card. Part of the arrears engine (Module 3, Phase 2), but the frontend already shows it under a "Coming soon" overlay.

```json
{ "scope": "own", "par30Percent": 4.1, "targetPercent": 5, "loansOver30Days": 4 }
```

- `scope`: `own` for users with `loans.view.own` only, `branch` for `loans.view.all`.

### `GET /dashboard/today`

Numbers behind the dashboard's "Today" boxes. Include only the sections that apply to the user;
the frontend shows one box per section. Shape: `DashboardToday` in `src/api/types.ts`.

```json
{
  "collections": { "dueCount": 4, "collectedAmount": 0, "expectedAmount": 1240000 },
  "followUps": { "overdueCount": 3, "over30DaysCount": 1 },
  "applicationsToComplete": { "count": 2 },
  "unmatchedPayments": { "count": 2, "amount": 660000 }
}
```

- Loan officers get `collections`, `followUps`, `applicationsToComplete`, `unmatchedPayments` (their own portfolio).
- Users with `users.manage` get `paymentReversals`, `awaitingApproval`, `approvedNotDisbursed`, `accessRequests`.
- Must stay consistent with `GET /worklist`: e.g. `collections.dueCount` = open instalment and promise tasks.

### `GET /worklist`

Today's tasks for the signed-in user, open and done. Each task has a `type`; its fields depend on the
type (see `WorklistTask` in `src/api/types.ts`). Common fields:

| Field | Meaning |
|---|---|
| `id` | Task id |
| `type` | `instalment-due`, `promise-due`, `overdue`, `application-incomplete`, `payment-unmatched`, `reversal-request`, `awaiting-approval`, `awaiting-disbursement`, `access-request` |
| `priority` | `do-first`, `do-today` or `routine` (decided by the backend) |
| `status` | `open` or `done` |
| `result` | What happened, for done tasks |
| `notes` | Short log entries, e.g. `"No answer · 10:42 AM"` |

```json
{
  "id": "task-0987", "type": "promise-due", "priority": "do-first", "status": "open", "notes": [],
  "loanId": "TL-0987", "borrower": { "name": "Moses Ssebunya", "phone": "0701 552 914", "area": "Kawempe" },
  "amountDue": 300000, "amountPaid": 0, "promiseMadeOn": "2026-10-20", "daysPastDue": 9
}
```

Priority rules used in the mock (confirm with the client): promises due today, loans more than 30 days late,
loans with a warning and applications waiting over 48 hours are `do-first` or `do-today`.

### `GET /loans`

Loans the user can see that still have a balance, for pickers such as Record payment. Same scope rule as search.

```json
[{ "id": "TL-1042", "borrowerName": "Aisha Namubiru", "phone": "0772 418 230", "outstandingBalance": 2400000, "dueToday": 450000 }]
```

`dueToday` is the amount still due today on an instalment or promise, otherwise `null`.

### `POST /payments`

Records a repayment. Requires `payments.record`.

```json
{ "loanId": "TL-1042", "amount": 450000, "method": "MTN MoMo", "reference": "MP261031.1042" }
```

- `method`: `Cash`, `MTN MoMo` or `Airtel Money`. `reference` is optional.
- Response `201`:

```json
{ "paymentId": "PAY-1001", "loanId": "TL-1042", "balanceBefore": 2400000, "balanceAfter": 1950000, "surplus": 0, "taskId": "task-1042" }
```

- **Overpayment (QA scenario 3):** accept it. The loan closes, `surplus` is the extra amount, and the team is notified.
- The payment counts towards the loan's open worklist task (`taskId`). Partly paid tasks stay open with a note.
- `422` with a `message` if the amount isn't above zero; `404` if the user can't see the loan.

### `POST /worklist/{taskId}/call-outcome`

Logs a call on a loan task.

```json
{ "outcome": "promised", "promisedDate": "2026-11-03" }
```

`outcome`: `promised` (needs `promisedDate`; closes the task), `no-answer` (adds a note; stays open),
`field-visit` (closes the task and books a visit). Returns the updated task.

### `POST /worklist/{taskId}/actions`

```json
{ "action": "approve-reversal" }
```

`action`: `approve-reversal`, `reject-reversal` (both need `payments.reverse`), `remind-finance` (adds a note;
stays open), `send-reset-link`, `resend-invite` (need `users.manage`). Returns the updated task.

### `POST /worklist/{taskId}/undo`

Reverts the last change to a task (the "Undo" button). `204` on success, `409` with a `message` if it can no
longer be undone. **Open question:** undoing a recorded payment is effectively a payment reversal, which officers
aren't allowed to do (`payments.reverse`). Decide with the client whether payment undo should become a reversal
request to an admin instead.

## Portfolio section ("My portfolio" / "Branch portfolio")

**Scope:** `own` for users with only `loans.view.own`; `branch` for `loans.view.all`. Shapes are in `src/api/types.ts`.
PAR, arrears and early warnings come from the arrears engine (Module 3, Phase 2); the frontend already shows them
under a "Coming soon" overlay, so the endpoints can arrive with Phase 2.

### `GET /portfolio/risk` (Phase 2)

```json
{
  "scope": "own", "asOf": "2026-10-31T05:00:00Z", "loanCount": 41,
  "par1Percent": 8.6, "par30Percent": 4.1, "par90Percent": 0.4, "targetPercent": 5,
  "amountOver30Days": 3900000, "loansOver30Days": 4,
  "monthly": [{ "month": "2025-11", "par30Percent": 3.8 }, "… 12 entries, the last is the current month"],
  "weekly": [{ "date": "2025-11-01", "par30Percent": 3.8 }, "… weekly points over the same 12 months, the last is today"]
}
```

The frontend shows 3, 6 or 12 months; the change chip compares today with the first month shown.

### `GET /portfolio/arrears` (Phase 2)

```json
{
  "scope": "own", "totalOutstanding": 96000000,
  "current": { "amount": 87700000, "loans": 33 },
  "bands": [{ "label": "1–30 days", "amount": 4400000, "loans": 4 }, "… 31–60, 61–90, 90+"],
  "collectionRatePercent": 94.2
}
```

### `GET /portfolio/early-warnings?limit=5` (Phase 2)

```json
{
  "total": 6,
  "items": [{
    "loanId": "TL-0743", "borrowerName": "Ronald Mukasa", "daysPastDue": 38, "signal": "Broke a promise to pay on 26 Oct",
    "officerName": "Sharon Nakalema", "worklistTask": { "id": "task-0743", "status": "open", "type": "overdue" }
  }]
}
```

Most serious first. `worklistTask` is the loan's task on the user's worklist today, or `null`.

### `POST /worklist/tasks` ("Add to today")

```json
{ "loanId": "TL-0760" }
```

Adds an overdue loan to the user's worklist as an `overdue` task. `201` with the task; `409` if it's already on
today's list; `422` if the loan isn't overdue. `POST /worklist/{taskId}/undo` removes it again.

### `GET /portfolio/summary` (loan officers)

```json
{ "outstandingBalance": 96000000, "activeLoans": 41, "disbursedThisMonth": { "amount": 6400000, "count": 5 }, "clearedThisMonth": 3, "dueThisWeek": 2100000 }
```

"Collected today" on this card comes from `GET /dashboard/today` (`collections`), so the two always agree.

### `GET /activity?limit=5` (requires `users.manage`)

Audit log preview, newest first.

```json
{ "total": 6, "items": [{ "id": "act-1", "actor": { "name": "Moses Okot", "role": "Finance", "photoUrl": null }, "description": "approved APP-309 · UGX 800,000", "at": "2026-10-31T06:42:00Z" }] }
```

### `GET /team/performance` (requires `loans.view.all`)

```json
[{ "officerId": "u-ruth", "name": "Ruth Atim", "photoUrl": null, "portfolioAmount": 67500000, "loanCount": 34, "par30Percent": 13.2, "collectedToday": 0, "expectedToday": 380000 }]
```

Sorted by PAR30, highest first. The frontend shows 5 and links to Reports for the rest.

## Borrowers

### `GET /borrowers`

Borrower directory (user flow phase 8). Requires `loans.view.own` or `loans.view.all`.

| Query | Values | Notes |
|---|---|---|
| `q` | text | Name (contains), phone (digits only, at least 3, spaces ignored), exact loan or application ID, or a **full** National ID number (exact match only) |
| `status` | `active`, `in-arrears`, `cleared`, `applicant` | Omit for all |
| `officerId` | user ID | Branch-wide users only |
| `sort` / `order` | `name` (default) or `balance` / `asc` or `desc` | |
| `page` / `pageSize` | default `1` / `25`, max `100` | |

```json
{
  "items": [{
    "id": "B-0038", "name": "Aisha Namubiru", "phone": "0772 418 230", "area": "Owino market", "status": "active",
    "currentLoan": { "id": "TL-1042", "balance": 2400000, "daysPastDue": 0 },
    "application": null,
    "officer": { "id": "u-sharon", "name": "Sharon Nakalema" }
  }],
  "total": 46, "page": 1, "pageSize": 25,
  "counts": { "all": 46, "active": 33, "in-arrears": 8, "cleared": 3, "applicant": 2 }
}
```

- **Scope is enforced by the server:** with only `loans.view.own`, `officerId` is ignored and the results are
  always the user's own borrowers. The frontend hiding the officer filter is not a control.
- **The list never includes the National ID number**, not even masked. It is shown, masked, only on the borrower
  profile, and revealing it there is a separate, audit-logged request.
- NIN search matches the whole number exactly, so the search box can't be used to guess IDs a few characters at a time.
- `counts` respect `q` and `officerId` but not `status`, so the tabs show how many are in each.
- A borrower in arrears is one whose current loan has `daysPastDue > 0`; `applicant` means no loan yet, only an application.

### `GET /officers` (requires `loans.view.all`)

Loan officers, for the officer filter. `403` without the permission.

```json
[{ "id": "u-joel", "name": "Joel Okello" }]
```

### `GET /borrowers/{id}`

The borrower profile. Same scope rule as the list: an officer asking for another officer's borrower gets
`404` (not `403`), so the endpoint can't be used to find out who else is a borrower.

```json
{
  "id": "B-0176", "name": "Aisha Namubiru", "status": "active",
  "phone": "0772 418 230", "secondaryPhone": "0756 790 295", "area": "Owino market", "premises": "Kisenyi, Shop 3",
  "nationalIdMasked": "CM••••••••••QK",
  "registeredOn": "2026-03-21",
  "officer": { "id": "u-sharon", "name": "Sharon Nakalema" },
  "nextOfKin": { "name": "Joseph Namubiru", "phone": "0782 692 721", "relationship": "Father" },
  "work": { "occupation": "Retail shop", "income": { "amount": 450000, "period": "weekly" } },
  "currentLoan": {
    "id": "TL-1042", "product": "Business loan", "principal": 3480000, "totalRepayable": 4170000, "balance": 2400000,
    "repaymentSchedule": "monthly", "disbursedOn": "2026-06-11",
    "nextPayment": { "dueOn": "2026-11-07", "amount": 695000 },
    "daysPastDue": 0, "arrearsAmount": 0
  },
  "application": null,
  "loansCleared": 1
}
```

- `nationalIdMasked` keeps the first two and last two characters. The full number is never in this response.
- `premises` (shop / premises / building / arcade) is on Tamu's payment agreement and required.
- **Optional, not on Tamu's forms yet** (waiting for the client to confirm): `secondaryPhone`, `nextOfKin`
  (may be `null`), `work.occupation` and `work.income` (may be `null`).
- `repaymentSchedule` is `daily`, `weekly` or `monthly` (the agreement's payment frequency); `totalRepayable`
  includes the interest (18% for now; it will come from the loan product).
- `currentLoan` is `null` when there's no loan being repaid; `application` is the open application, if any.
- When the loan is late, `nextPayment` is the oldest missed instalment and its `amount` is everything overdue
  (`arrearsAmount`, never more than `balance`).

### `POST /borrowers/{id}/national-id`

Returns the full National ID number so the profile can show it for a short time.

```json
{ "nationalId": "CM1234567890QK", "visibleForSeconds": 30 }
```

- **Every call must be written to the audit log** (who, whose ID, when) before the number is returned.
- Same scope rule (`404` for borrowers outside the user's portfolio). Send `Cache-Control: no-store`.
- Consider a rate limit per user (e.g. 20 an hour) and an alert when someone exceeds it.
- The frontend keeps the number only in component state (never in the query cache or storage) and masks it again
  after `visibleForSeconds`, when the user hides it, or as soon as the tab is hidden.

### `GET /borrowers/{id}/loans`

Every loan the borrower has taken, newest first, with their track record. Same scope rule (`404` outside the
user's portfolio).

```json
{
  "items": [
    { "id": "TL-1042", "product": "Business loan", "principal": 3130000, "disbursedOn": "2026-06-22", "clearedOn": null,
      "status": "active", "daysPastDue": 0, "mostDaysLate": 0, "applicationPdfAvailable": true },
    { "id": "TL-0243", "product": "School fees loan", "principal": 600000, "disbursedOn": "2026-04-08", "clearedOn": "2026-06-03",
      "status": "cleared", "daysPastDue": 0, "mostDaysLate": 14, "applicationPdfAvailable": true }
  ],
  "summary": { "loansTaken": 2, "totalBorrowed": 3730000, "cleared": 1, "clearedOnTime": 0 }
}
```

- `status`: `active`, `in-arrears` or `cleared`. `mostDaysLate` is the worst the loan ever got (0 = always on time);
  the profile shows it as "Cleared · was 14 days late", which matters when deciding on a repeat loan.
- `applicationPdfAvailable` is false until the signed loan application has been uploaded or completed online.

## Documents

Tamu's forms are the source of truth (see `loan-docs/` next to this project):

- **Money / Amount Owing Payment Agreement**: borrower name, NIN, shop / premises, phone, date borrowed,
  amount in words and figures, repayment date, payment frequency (daily, weekly or monthly), the 18%
  administration charge, recovery terms, and both guarantors' name, ID number, phone and signature.
- **Guarantor Consent and Undertaking**, one per guarantor: guarantor name and NIN, borrower name and NIN,
  amount in words and figures, date borrowed, signature and date.

**How a loan application works:** the officer enters the borrower's and both guarantors' details and the loan
terms as data. The proof is **one signed loan application PDF per loan**: the agreement and both consents,
signed and merged into one document. It comes in one of two ways:

- **Paper:** the forms are filled in and signed, scanned into one PDF, and uploaded by the officer.
- **Online:** the officer sends a one-time link (copied into WhatsApp); the borrower completes and signs
  online, and the server generates the merged PDF. Paper stays for people without a smartphone.

### `GET /borrowers/{id}/documents`

Grouped: `identity` (the borrower's National ID copy; the original is seen in person), `work` (optional
workplace photo), then one section per open application and loan, newest first. Same scope rule (`404`
outside the user's portfolio). No file contents, no full NINs, no link tokens.

```json
{
  "sections": [
    { "id": "TL-1042", "title": "TL-1042 · Business loan", "subtitle": "Current loan",
      "guarantors": [
        { "name": "David Ssali", "phone": "0756 808 037", "nationalIdMasked": "CF••••••••••KW" },
        { "name": "Jane Namusoke", "phone": "0772 423 611", "nationalIdMasked": "CM••••••••••EQ" }
      ],
      "slots": [
        { "key": "TL-1042:application", "label": "Signed loan application", "required": true, "canCompleteOnline": true, "onlineRequest": null,
          "file": { "id": "DOC-00412", "fileName": "loan-application.pdf", "contentType": "application/pdf", "sizeBytes": 845000,
                    "uploadedBy": "Sharon Nakalema", "uploadedAt": "2026-06-20T10:12:00Z", "version": 1, "method": "scanned" } }
      ] },
    { "id": "APP-311", "title": "APP-311 · application", "subtitle": "Draft", "guarantors": [ … ],
      "slots": [
        { "key": "APP-311:application", "label": "Signed loan application", "required": true, "canCompleteOnline": true, "file": null,
          "onlineRequest": { "createdAt": "2026-10-31T08:00:00Z", "expiresAt": "2026-11-03T08:00:00Z", "createdBy": "Sharon Nakalema" } }
      ] }
  ]
}
```

- `guarantors` are the details the officer entered (from the forms), not documents.
- `method`: `scanned` (paper, uploaded by staff) or `online` (completed through a link; `uploadedBy` is the
  borrower who signed).
- `required` + `file: null` = missing. `onlineRequest` = a link was sent and hasn't been used or expired yet.

### `POST /borrowers/{id}/online-links` (requires `documents.upload`)

`{ "slot": "APP-311:application" }` → `201 { "url": "https://…/forms/<token>", "expiresAt": "…" }`.

- Only for a loan application that isn't completed yet (`409` otherwise, `422` for other slots).
- The token is random (at least 256 bits), **works once** and expires after **72 hours**. Creating a new link
  revokes the previous one. Store only a hash of the token.
- The page behind the link shows the application pre-filled with what the officer entered; the borrower checks
  it and signs (typed name confirmed with a one-time SMS code once the SMS gateway exists). **Open question for
  the client:** how guarantors sign online (on the same link, or a link each).
- On completion the server generates the merged PDF as a new version with `method: "online"`. Log who created
  each link, when it was opened and when it was completed.

### `POST /applications` (requires `applications.create`)

New application (user flow, phase 3). `multipart/form-data`: `application` (JSON below) and, on the paper route,
`signedApplication` (the signed agreement + both consents as **one PDF**, ≤ 5 MB) and, for a new borrower,
`idFront` / `idBack` (JPEG or PNG, ≤ 5 MB).

```json
{
  "borrowerId": null,
  "terms": { "amount": 1500000, "repaymentSchedule": "weekly", "firstPaymentOn": "2026-11-08", "numberOfPayments": 20 },
  "route": "paper",
  "newBorrower": { "fullName": "Agnes Nakimera", "nationalId": "CF901234567890", "phone": "0782 123 456", "premises": "Owino market, Stall 12", "area": "Kampala Central" },
  "guarantors": [{ "fullName": "Grace Kato", "nationalId": "CM880011223344", "phone": "0701 234 567" }, { … }],
  "submit": true
}
```

→ `201 { "id": "APP-322", "borrowerId": "B-0207", "status": "submitted", "onlineLink": null }`

- **Terms:** whole shillings > 0; `daily` / `weekly` / `monthly`; first payment from tomorrow; 1–365 payments.
  The server works out (and stores) the interest (18% for now; later from the loan product), total, instalments (rounded down to UGX 100;
  the last payment takes the difference) and the last payment date: same rules as `src/lib/repaymentSchedule.ts`.
- **Borrower:** an existing one in the user's scope (`404` otherwise), who has **no loan still being repaid and no
  application in progress** (`409` with the reason). Or someone new: their NIN must not belong to any borrower
  (`409` "already registered", **without saying whose**).
- **Paper, `submit: true`:** everything required (new borrower's details and ID photos, two guarantors, the PDF);
  status `submitted` (waiting for approval). **`submit: false`** saves a draft: only who the borrower is is required;
  `missing` says what's left.
- **Online:** only the terms (and `borrowerId` if they're registered). Returns `onlineLink` (see below); status
  `draft` until the borrower submits, then `submitted`. A new person is registered, in the sending officer's
  portfolio, when they submit (matched to an existing borrower if the NIN is already registered).
- The borrower, guarantors and terms are stored as data; the PDF is proof. Record everything in the audit log.

### `GET /applications?status=&q=&page=`

The Applications list. `status`: `draft`, `awaiting-borrower` (online link sent), `submitted` (waiting for
approval), `approved` or `rejected`. Officers get their own applications; users with `loans.approve` or
`loans.view.all` get the branch. `counts` per status respect the search, for the tabs. Items: id, status, route,
borrower `{ id | null, name }`, amount, terms (`repaymentSchedule`, `numberOfPayments`, `instalment`), `missing`
(drafts), `returned` (`{ reason, note, by, at }` when sent back or rejected), officer, `createdAt`, `submittedAt`,
`decided` (`{ by, at }`). Newest activity first.

### `GET /applications/{id}`

Everything an approver checks: the list item plus `borrowerDetails` (masked NIN, phone, premises, area),
`guarantors` (masked NINs), `schedule` (first and last payment, interest, total, last instalment),
`schedule` uses `interest` (18% for now; it will come from the loan product). `documents`
(`signedApplication`, `idFront`, `idBack` as document files) and
`decision: { allowed, reason }`. `404` when the application isn't visible to the user.

### `POST /applications/{id}/approve` (requires `loans.approve`)

`{ "checks": { "signedPdfMatchesDetails": true, "idCopyMatchesNin": true, "guarantorsSigned": true } }` → the
updated application.

- Only while `submitted` (`409` otherwise); all three checks must be `true` (`422`); a signed application must exist.
- **Two people:** whoever created the application can't approve it (`403`), even with a role that has both
  permissions. Record the approver, the time and the checks in the audit log.
- The approved application waits to be paid out (Loans → To disburse); the disburser can't be the approver
  (Settings → Loan rules).

### `POST /applications/{id}/reject` (requires `loans.approve`)

`{ "reason": "signature-missing" | "details-mismatch" | "document-unclear" | "other" | "not-eligible", "note": "…" }`

- Same rules as approving (only while `submitted`, not one's own). `note` is required for `other` and
  `not-eligible`.
- `not-eligible` closes it for good (`rejected`). Any other reason **sends it back** to the officer as a `draft`
  with `returned` set, to fix and submit again.

### `GET /applications/{id}/draft` (the officer who owns it)

A **paper draft** for its officer to continue, including one an approver sent back: borrower, `terms`,
`guarantors` **with full NINs** (they entered them and may need to correct them), the current
`signedApplication`, `idCopyComplete`, `missing` and `returned`. `404` for anyone else; `409` for online or
non-draft applications. Log every opening (it shows guarantors' ID numbers); send `Cache-Control: no-store`.

### `PATCH /applications/{id}` (the officer who owns it)

`multipart/form-data`: `application` = `{ "terms": { … }, "guarantors": [ … ], "submit": true | false }` and
optionally a new `signedApplication` PDF (a new version; the old one is kept). Same validation as
`POST /applications`.

- `submit: false` saves the draft and recomputes `missing`.
- `submit: true` needs two guarantors, a signed PDF and both sides of the borrower's ID copy. If something is
  missing the changes are still saved and the response is `422` "Your changes are saved, but it can't be
  submitted yet: …". On success the status becomes `submitted` (`returned` cleared) and the timeline records
  "Fixed and resubmitted … (sent back for: …)" when it had been sent back.

### `GET /loans/list?status=active|cleared|all&q=&officerId=&late=true&page=`

The Loans tabs. Officers get their own loans; `loans.view.all` gets the branch (`officerId` filters by officer,
ignored for officers). `q`: loan ID (exact), borrower name, or phone (3+ digits). `late=true`: only loans behind on
payments.

- Items: `id`, `borrower`, `phone`, `principal`, `totalRepayable`, `balance`, `repaymentSchedule`, `disbursedOn`,
  `clearedOn`, `status` (`active` / `in-arrears` / `cleared`), `daysPastDue`, `arrearsAmount`, `mostDaysLate`,
  `nextPayment { dueOn, amount }`, `officer`.
- Order: **active** by next payment (late ones first, oldest missed payment first); **cleared** newest first;
  **all** by disbursement date, newest first.
- `counts` for the tabs (`toDisburse`, `active`, `cleared`, `all`) and `totals` for the strip (`loans`,
  `outstanding`, `late`, `overdue`, `repaid`) cover everything matching the filters, not just the page.

### `GET /loans/{id}`

One loan, for the loan page. Same scope rule (`404` outside the user's portfolio).

- Amounts: `principal`, `interest` (18% for now; later from the loan product), `totalRepayable`, `repaid`,
  `balance`; `status`, `daysPastDue`, `arrearsAmount`, `nextPayment`, `recovery`.
- `schedule`: every instalment `{ number, dueOn, amount, paid, status }`, with what's been repaid applied to
  the instalments in order. `status`: `paid`, `part-paid`, `late` (due date passed, not fully paid), `due`
  (today), `upcoming`. The last instalment takes the rounding difference. The first `late` instalment's date is
  what `daysPastDue` counts from.
- `payments`: every repayment, newest first: `{ paidAt, amount, method, reference, recordedBy }`.
- Where it came from: `applicationId`, `approvedBy`, `payout { method, reference, by, paidOn }`, and the
  `signedApplication` document.
- Loans repaid before the system have no `schedule` or `payments` (empty lists) and no `applicationId`.

### Recovery (`requires recovery.manage`)

Loans handed to Tamu's recovery department, which follows up borrowers in the field. **Manual for now**:
the automatic rule ("send to recovery after N days late", in Settings → Loan rules and later per loan product)
waits for Tamu to set N. `GET /loans/list?status=recovery` lists them (newest hand-over first); every loan
item, and the borrower's `currentLoan`, carries `recovery: { since, by, reason, note } | null`.

#### `POST /loans/{id}/recovery`

`{ "reason": "long-overdue" | "unreachable" | "refuses-to-pay" | "other", "note": "…" }` → `204`.
`note` required for `other`. `409` if repaid or already in recovery. Record on the borrower's timeline and in the
audit log.

#### `POST /loans/{id}/recovery/return`

`{ "note": "Agreed a payment plan of UGX 100,000 a week." }` → `204`. Back to the loan officer (e.g. arrears paid,
payment plan agreed). `note` required; `409` if not in recovery.

Open with the client: the day limit, who confirms hand-overs, how recovery charges are worked out (the agreement
says the recovery team adds them), and whether recovery staff need logins.

### `GET /payments/list?from=&to=&q=&officerId=&method=&page=`

The Payments page: every repayment, newest first. Officers get their own borrowers' payments; `loans.view.all`
gets the branch. `from`/`to` are inclusive local dates; `q` matches borrower, loan ID (exact), phone (3+ digits)
or transaction ID; `method`: `MTN MoMo`, `Airtel Money` or `Cash`.

Items: `id`, `paidAt`, `amount`, `method`, `reference`, `recordedBy`, `loanId`, `borrower`, `officer`.
`totals`: collected, number of payments, and collected by method, over everything matching.

### `GET /loans/to-disburse`

Approved applications waiting to be paid out, longest-waiting first. Officers get their own; branch-wide users
all. Each: `applicationId`, `borrower`, `payTo` (the mobile money number), `amount`, `terms`, `officer`,
`approved { by, at }`, `firstPaymentGapDays` (to preview the new dates) and
`disbursement { allowed, label, reason }` (`label` is short for the list, e.g. "Approved by you").

### `POST /applications/{id}/disburse` (requires `loans.disburse`)

In the MVP the money is sent by hand by mobile money and recorded here (automatic payouts are Phase 2):

```json
{ "method": "MTN MoMo", "reference": "MP261101.1043.A12", "amount": 1500000, "paidOn": "2026-11-01" }
```

→ `201 { "loanId": "TL-2163", "firstPaymentOn": "2026-11-12", "lastPaymentOn": "2027-03-25" }`

- `method`: `MTN MoMo` or `Airtel Money` (no cash for now). `reference` (the transaction ID) is required and
  **can't have been used for another payout** (`409`).
- `amount` must equal the approved amount exactly; `paidOn` between the approval date and today (Uganda dates,
  not UTC).
- **Settings → Loan rules, on by default:** whoever approved the loan can't pay it out (`403`).
- The schedule moves with the payout: the first payment keeps the gap planned at application, counted from
  `paidOn`; the rest follow from it. The loan becomes the borrower's current loan; record the payout on their
  timeline and in the audit log (method, transaction ID, who, when).

### Online loan application (public, `/forms/{token}` in the app)

The page the borrower opens from the link. **No account and no sign-in: the token is the only access**, so these
two endpoints sit outside the session (no `401`, no CSRF cookie; the token does that job). One link goes to the
borrower; on it they fill in their own details and both guarantors' details, add photos of their National ID,
and all three people tick to agree and sign with a finger.

#### `GET /public/forms/{token}`

```json
{
  "reference": "APP-311", "lender": "Tamu Cleaning Services",
  "terms": { "amount": 2500000, "repaymentSchedule": "weekly", "interestRatePercent": 18, "totalRepayable": 2950000,
             "firstPaymentOn": "2026-11-08", "lastPaymentOn": "2027-05-02" },
  "expiresAt": "2026-11-04T08:00:00Z"
}
```

- **Only the loan terms the officer set; never anyone's personal details**, so a forwarded or leaked link reveals nothing.
- `404 { "reason": "invalid" }` for an unknown token; `410` with `reason` `used` (already submitted), `replaced`
  (a newer link or a paper upload) or `expired`.

#### `POST /public/forms/{token}` (multipart)

| Part | Content |
|---|---|
| `details` | JSON `{ "borrower": { "fullName", "nationalId", "phone", "premises", "area" }, "guarantors": [{ "fullName", "nationalId", "phone" }, { … }] }` |
| `idFront`, `idBack` | Photos of the borrower's National ID (JPEG or PNG, ≤ 5 MB; the app shrinks them to ≤ 1600 px and strips photo data) |
| `borrowerSignature`, `guarantor1Signature`, `guarantor2Signature` | Drawn signatures (JPEG, ≤ 512 KB) |

`201 { "reference": "APP-311" }`. Then, **in one transaction**:

1. Mark the token used: **it never works again** (`410 used` on any later GET or POST).
2. Validate everything again: full names, NINs (`C[MF]` + 12 characters, three different people), Ugandan mobile
   numbers, premises and area, real image types from the bytes.
3. Generate the signed loan application PDF (agreement + both consents, with the three signatures) as a new
   version of `{reference}:application` with `method: "online"`, and store the ID photos.
4. Record it on the borrower's timeline and in the audit log, with the IP address and user agent.

Also: rate-limit both endpoints per IP; never log the token or the request body; serve with
`Cache-Control: no-store` and `Referrer-Policy: no-referrer` (the page already sets no-referrer, so the token
isn't sent to other sites).

### `GET /documents/{documentId}/file?disposition=inline|attachment`

The file itself. `inline` = viewed in the app, `attachment` = saved to the device; **both are audit-logged**
(who, which document, whose, when, view or download).

- Headers: `Content-Type` from the verified stored type (`image/jpeg`, `image/png` or `application/pdf` only),
  `X-Content-Type-Options: nosniff`, `Cache-Control: no-store`, `Content-Disposition` with the stored file name.
- The frontend only renders the file when the returned type matches the listed `contentType`.

### `POST /borrowers/{id}/documents` (requires `documents.upload`)

`multipart/form-data` with `slot` (a slot `key`) and `file`. Uploads a missing document or replaces the current
one (a new version with `method: "scanned"`; nothing is deleted). Returns `201` with the new `file` object.
The signed loan application must be **one PDF**; ID copies and photos may be JPEG, PNG or PDF.

| Status | When |
|---|---|
| `403` | No `documents.upload` permission |
| `404` | Borrower outside the user's portfolio |
| `413` | Over 5 MB |
| `415` | Not really a JPEG, PNG or PDF (checked from the file's bytes, not its name), or not a PDF for a loan application |
| `422` | Unknown `slot`, or no file |

See docs/security.md 2.6 for storage, scanning and metadata rules. Uploads and replacements are audit-logged.

### `GET /loans/{id}/application-pdf`

The loan's signed loan application (the same document as `{loanId}:application` above), for the Loans tab.
Audit-logged like any other download.

## Editing a borrower and their timeline

### `PATCH /borrowers/{id}` (requires `borrowers.create`)

```json
{
  "phone": "0701 999 888", "area": "Owino market", "premises": "Kisenyi, Shop 3",
  "secondaryPhone": "0703 111 222",
  "nextOfKin": { "name": "Peter Namubiru", "relationship": "Sibling", "phone": "0701 908 735" },
  "work": { "occupation": "Tailor", "income": { "amount": 380000, "period": "weekly" } }
}
```

`204` on success; `422` with a message for an invalid field. `phone`, `area` and `premises` are required;
`secondaryPhone`, `nextOfKin` and `work` are optional (send `null` to clear; next of kin needs a name and phone). Phones must be Ugandan mobile numbers (`07XXXXXXXX`
or `+2567…`), stored as `0772 418 230`.

- **Name and National ID can't be changed here** (they must match the ID card; corrections are an admin task).
- **The main phone is the mobile money payout number, so a new one isn't applied.** It becomes
  `pendingPhoneChange` on the profile, and disbursements keep using the current number until someone else approves it.
- Record each change on the borrower's timeline and in the audit log (which fields changed, by whom).

### `POST /borrowers/{id}/phone-change/{changeId}`

`{ "decision": "approve" | "reject" }`. `204` on success.

- **approve:** requires `loans.approve` **and** must not be the person who asked (`403` "You asked for this change,
  so someone else must approve it."). Applies the number to the borrower and their open loan.
- **reject:** someone with `loans.approve` rejects it, or the person who asked withdraws it.
- `409` if the change was already approved, rejected or replaced.

### `GET /borrowers/{id}/activity?category=&before=`

The borrower's timeline, newest first, 15 at a time. `category`: `money`, `contact`, `changes` or `access` (omit
for all). Pass `nextBefore` from the previous page as `before` for older events.

```json
{
  "items": [
    { "id": "EV-912", "category": "access", "description": "Viewed the National ID number",
      "actor": { "name": "Sharon Nakalema", "role": "Loan officer" }, "at": "2026-11-01T07:14:00Z" }
  ],
  "nextBefore": "2026-10-04T07:52:00Z"
}
```

- **money:** payments, disbursements, loans repaid and closed. **contact:** calls and their outcome.
  **changes:** registration, applications, approvals, edits, uploads, number changes. **access:** views of the
  National ID, documents and agreements.
- Same scope rule (`404` outside the user's portfolio). Built from the audit log; nothing here can be edited.

## Settings: staff and roles

Settings → Users (`users.manage`) and Settings → Roles & permissions (`roles.manage`). Record every change below
in the audit log (who, what, before and after). Accounts and roles that anyone has used are never deleted.

### `GET /staff` (requires `users.manage`)

Every staff account, active first, then invited, then switched off.

```json
[
  { "id": "u-joel", "name": "Joel Okello", "email": "joel@tamu.example", "phone": "0756 410 228", "photoUrl": null,
    "role": { "id": "loan_officer", "name": "Loan officer" }, "status": "active",
    "lastSignInAt": "2026-11-01T06:54:00Z", "invite": null, "deactivated": null,
    "portfolio": { "borrowers": 44, "activeLoans": 38, "openApplications": 3 } }
]
```

- `status`: `active`, `invited` (hasn't set a password yet) or `deactivated` (switched off).
- `invite` (invited only): `{ "sentAt", "expiresAt", "expired" }`. `deactivated`: `{ "at", "by" }`.
- `portfolio`: the borrowers this person looks after (they must move to someone else before deactivation).

### `GET /roles` (requires `users.manage` or `roles.manage`)

Built-in roles first, then custom ones by name:
`[{ "id", "name", "description", "builtIn", "permissions": [...], "userCount" }]`. `userCount` counts active and
invited users.

### `POST /staff/invites` (requires `users.manage`)

`{ "name", "email", "phone", "roleId" }`. `201` with the new `StaffMember` (status `invited`).

- Emails the person a link to set their own password. **The link works once and expires after 48 hours**; store
  only a hash of its token. Admins never see or set passwords.
- `422` for a missing name, invalid email, non-Ugandan mobile number or unknown role. `409` if the email is already
  used by any account (including switched-off ones: turn that account back on instead).

### `POST /staff/{id}/invite` and `DELETE /staff/{id}/invite` (require `users.manage`)

- `POST` sends a new link; the previous link stops working. `200` with the `StaffMember`.
- `DELETE` cancels an unused invite (e.g. a wrong email); the link stops working. `204`. Only for `invited` accounts.

### `PUT /staff/{id}/role` (requires `users.manage`)

`{ "roleId" }`. `200` with the `StaffMember`. Takes effect on the person's next request.

- `403` for your own account ("Ask another admin").
- `409` if nobody active would be left with `users.manage` or `roles.manage` (a lockout), or if the person looks
  after borrowers and the new role can't see loans.

### `POST /staff/{id}/deactivate` (requires `users.manage`)

`{ "reassignTo": "u-sarah" | null, "reason": "Left Tamu" }`. `200` with the `StaffMember` (status `deactivated`).

- **Ends all their sessions immediately**; sign-in is refused from then on. Nothing they did is changed or deleted.
- If they look after borrowers, `reassignTo` is required: an active user whose role has `loans.view.own`. Their
  borrowers, open loans and applications move to that person in the same transaction (`422` otherwise).
- `403` for your own account; `409` for a lockout (as above). `reason` is required and goes to the audit log.

### `POST /staff/{id}/reactivate` (requires `users.manage`)

Turns a switched-off account back on **as an invite**: a fresh link, a new password; the old password never works
again. `200` with the `StaffMember` (status `invited`). `409` if their old role was deleted.

### `POST /roles` and `PUT /roles/{id}` (require `roles.manage`)

`{ "name", "description", "dataScope": "own" | "branch", "permissions": [...] }`. `201` / `200` with the `RoleSummary`.

- `422` without a name (3+ characters), with a duplicate name, or with no permissions. Ignore unknown permissions.
- `403` for built-in roles: they can't be changed.
- `409` if the change would lock out the editor (their own role losing `roles.manage` or `users.manage`) or leave
  nobody active with `users.manage` or `roles.manage`.
- Changes apply to everyone with the role on their next request.

### `DELETE /roles/{id}` (requires `roles.manage`)

`204`. `403` for built-in roles. `409` while any account has the role, including switched-off accounts (their
history shows the role name).

## Settings: system settings and loan products

Nothing an admin can change is hard-coded in the frontend: it reads these and follows them.

### `GET /settings` (any signed-in user)

```json
{
  "business": { "name": "Tamu Cleaning Services Ltd", "shortName": "Tamu", "address": "…", "phone": "0414 530 220", "email": "loans@tamu.example",
                "payoutAccounts": [{ "method": "MTN MoMo", "number": "0772 900 410", "accountName": "Tamu Cleaning Services" }] },
  "loanRules": { "approverCannotDisburse": true, "creatorCannotApprove": true, "phoneChangeNeedsApproval": true, "oneOpenLoanPerBorrower": true,
                 "recoveryAfterDaysLate": 60, "recoveryMode": "suggest", "seriouslyLateDays": 30 },
  "payments": { "repaymentMethods": ["Cash", "MTN MoMo", "Airtel Money"], "payoutMethods": ["MTN MoMo", "Airtel Money"],
                "referenceRequired": true, "backdateDays": 3, "allowOverpayment": true },
  "security": { "idleTimeoutMinutes": 15, "nationalIdVisibleSeconds": 30, "inviteValidHours": 48, "maxFailedSignIns": 5, "lockoutMinutes": 15, "minPasswordLength": 12 },
  "changed": { "business": { "at": "…", "by": "Martin Ssempa" }, "loanRules": null, "payments": null, "security": null }
}
```

### `PUT /settings/{business|loanRules|payments|security}`

The whole section. Requires `settings.business`, `settings.rules`, `settings.payments` or `settings.security`.
`200` with the full settings. `422` when a value is out of range (limits in `src/lib/settingLimits.ts`), a
payout method has no payout account, or no repayment/payout method is left. Audit-log which fields changed.

What each setting does on the server:
- `recoveryMode: "auto"` with `recoveryAfterDaysLate`: a daily job sends loans that late to recovery (by
  "Automatic (Loan rules)"); a loan a person brought back isn't sent again automatically. `"suggest"` only flags them.
- `oneOpenLoanPerBorrower`: `409` on a new application while the borrower has a loan to repay.
- `phoneChangeNeedsApproval: false`: a new mobile money number applies straight away (still logged).
- Payments: refuse methods not in `repaymentMethods`/`payoutMethods`; require `reference` for mobile money when
  `referenceRequired`; `paidOn` (new, optional on `POST /payments`) may be up to `backdateDays` in the past;
  refuse amounts above the balance when `allowOverpayment` is false.
- Security: sign-in lockout, idle timeout, National ID display time and invite lifetime follow these values.

### Loan products

`GET /loan-products` (any signed-in user), `POST /loan-products`, `PUT /loan-products/{id}`,
`POST /loan-products/{id}/archive` and `/restore` (require `settings.products`).

```json
{ "id": "prod-weekly", "name": "Weekly loan", "description": "…", "status": "active", "repaymentSchedule": "weekly",
  "interest": { "ratePercent": 18, "per": "loan" }, "amount": { "min": 200000, "max": 5000000 }, "numberOfPayments": 20,
  "fee": { "type": "none", "value": 0, "collection": "added" },
  "penalty": { "type": "percent", "value": 5, "per": "missed-payment", "graceDays": 3 },
  "inUse": 104, "updatedAt": "…", "updatedBy": "Martin Ssempa" }
```

- `interest.per`: `loan` (once on the amount, as on Tamu's agreement) or `month` (for each month the loan runs).
- `numberOfPayments`: the loan's length; officers don't choose it.
- `fee.collection`: `deducted` (taken from the payout: the payout amount is the amount less the fee) or `added` (repaid).
- `penalty`: late fee on overdue instalments, `percent` of the overdue amount or `fixed` UGX, once per missed
  payment or every day late, after `graceDays`.
- Applications now send `terms.productId` with the amount and first payment date; the server checks the amount
  limits and the loan length, and **copies the product's pricing onto the application**, so changing a product
  never alters existing loans. The repayment schedule can't change while a product is in use; archive and copy it.
- The first payment must be within 7 (daily), 14 (weekly) or 35 (monthly) days of the application.

## Audit log

Append-only: nothing in it can be edited or deleted (see [security.md](security.md)). Every endpoint above that
says "audit-log" writes here, plus sign-ins, failed sign-ins and exports.

### `GET /audit?from=&to=&actorId=&category=&q=&page=` (requires `audit.view`)

`from`/`to`: ISO dates, inclusive (local days). `category`: `money`, `decisions`, `access`, `borrowers`,
`admin` or `signin`. `q` searches the description and the person's name. 30 a page, newest first.

```json
{
  "items": [
    { "id": "act-1730459520-12", "at": "2026-11-01T10:32:00Z",
      "actor": { "id": "u-martin", "name": "Martin Ssempa", "role": "Admin", "photoUrl": null },
      "category": "admin", "description": "changed payment settings: backdateDays",
      "target": null, "details": [{ "label": "backdateDays", "value": "3 → 5" }] }
  ],
  "total": 412, "page": 1, "pageSize": 30,
  "people": [{ "id": "u-joel", "name": "Joel Okello" }]
}
```

- `actor.id` is null for borrowers (online form) and automatic rules. `target` links the loan or application.
- `details`: before → after for changes (settings, roles); null otherwise.
- The real backend also stores the IP address and device; add them to `details` when available.

### `GET /audit/export?from=&to=&actorId=&category=&q=` (requires `audit.export`)

The same filters, all matching events, as `text/csv` (`When, Who, Role, Type, What, Loan or application,
Details`). Every cell is quoted and cells starting with `=`, `+`, `-` or `@` are prefixed with `'` so a
spreadsheet can't run them as formulas. The export itself is logged ("exported the audit log (N events)").

## My account (any signed-in user, their own account only)

- `GET /me/profile`: `{ id, name, email, phone, photoUrl, branch, role, recentSignIns: [{ at, device, success }] }`
  (the last 8 sign-ins, including failed attempts).
- `PATCH /me/profile` `{ phone }`: a Ugandan mobile number (`422` otherwise). Name, email and role are admin-only.
- `POST /me/photo` (multipart `photo`): JPEG or PNG, up to 2 MB, checked from the file's bytes; `DELETE /me/photo`.
- `POST /me/password` `{ currentPassword, newPassword }`: `403` if the current password is wrong (counts towards
  the lockout); `422` if the new one is shorter than Settings → Security's `minPasswordLength`, common/breached, or
  contains the person's name or email. On success, **end every other session** of the account. No character-type
  rules (NIST SP 800-63B).
- `GET /me/sessions`: `[{ id, device, location, lastActiveAt, current }]`; `POST /me/sessions/sign-out-others`.
- `GET /support/contacts`: `{ admins: [{ name, phone, email }], business: { name, phone, email } }` for the
  Help page (active people with `users.manage`).

All of these are audit-logged.
