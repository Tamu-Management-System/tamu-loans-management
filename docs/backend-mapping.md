# What the backend covers, and what is missing

Written from reading `loan-app-rest-api` (branch `master`, 10 Nov 2026). It is the frontend's view; nothing in the backend was changed.
Use it with [api-contract.md](api-contract.md) (what the screens need) and [backend-plan.md](backend-plan.md) (the rules).

## How the backend works today

- **46 generic controllers**, one per table, at `/api/private/<Models>/…` (for example `/api/private/Borrowers/find-all/`).
  Each has the same 16 routes: `find-all`, `find-by-pk`, `find-one`, `find-and-count-all`, `find-and-count-all-by-cursor`,
  `count`, `create`, `bulk-create`, `save-with-relationships`, `update-one`, `update-by-pk`, `delete-one`, `delete-by-pk`,
  `delete-all`, `restore` and `download-import-template` (the last one is a `GET`).
- **Reads are `POST` with a body** `{ "query": { … } }`. Query keys: `id`, `advancedFilters` (`[{ fieldName, value, operator,
  conjunction, childrenFilterParts }]`), `sort` (`[{ sortProperty, sortDirection }]`), `page` and `size`, `cursor`, `populate`,
  `projections`, `excludedProjections`, `includeSoftDeletedEntries`. Operators: `equals`, `ne`, `gt`, `gte`, `lt`, `lte`, `in`,
  `like`, `iLike`, `startsWith`, `endsWith`, `contains`, `between`, `isNull` and more.
- **Answers:** one record `{ content, success, message }`; a list `{ page: { count, content }, success, message }`; by cursor the
  same plus `nextCursor`.
- **Permissions (CASL):** each route has `@CheckPolicies({ action, subject })`. Subject = the table name (`Borrower`), actions =
  `CREATE READ UPDATE UPSERT SOFT_DELETE HARD_DELETE RESTORE MANAGE`. Rules come from `Role → RolePermission → Permission`, with
  `conditions`, `fields`, `inverted` and `reason`. Roles have `dataScope` (`OWN` or `MARKET`) and `authorityRanking`.
- **Sign-in:** `POST /api/public/account/login` with `{ username, password }` → `{ content: { idToken, user, accounts } }`; the token is also
  in the `Authorization` header; a `Refresh` cookie is set (`HttpOnly`). Requests carry `Authorization: Bearer <idToken>`.
  Five failed sign-ins lock the account for 15 minutes (fixed in code). Also `POST /api/private/account/logout`,
  `POST …/change-password`, `GET …/find-account`.
- **Errors** are Nest `HttpException`s: a status code and a `message`.
- **Other:** MTN and Airtel webhook routes, file upload routes, email and SMS jobs, throttling (100 requests a minute).

## What the screens need, and where the backend stands

| Area | Covered by the generic routes | Missing (the screens need it) |
|---|---|---|
| Sign in | login, logout, change password | `POST` refresh-token route (the cookie is set, nothing reads it); forgot password and reset (service methods exist, no routes); set a password from an invite link; a route that returns the user **with their CASL rules**; lockout count and minutes from Settings, not fixed in code; idle-timeout value |
| Clients | `Borrower`, `Person`, `TelephoneNumber` CRUD | an optional **email** on the client (`Person` has none); reveal the full National ID (audit-logged, short-lived); phone change **approval** (`PhoneChangeRequest` exists, no rule or route); a client profile summary (loans, balance, status) |
| Applications | `LoanApplication`, `ApplicationGuarantor`, `OnlineApplicationLink` CRUD | submit; **approve**, **send back** (every rejection goes back to the officer, with a reason) and **close** (could map to `CANCELLED`); creator cannot approve; the guarantor check and **waiver** (one active loan per guarantor, an approver may waive); the online form (public, by token, with ID photos); signed-application PDF upload and **private** download |
| Loan products | `LoanProduct` CRUD | pricing copied onto the application so later edits don't change a loan; product limits and the other limits from Settings |
| Loans | `Loan`, `RepaymentSchedule`, `Disbursement` CRUD | build the schedule from the terms; pay out (mobile money, idempotency key, approver cannot pay out); to-disburse list; recovery |
| Payments | `Payment`, `PaymentAllocation`, `PaymentReversal` CRUD | record a payment (cap at what is owed, allocation order, idempotency key); edit a payment within the Settings window; reversal approval |
| Settings | `Settings` (section + JSON value) | validation and limits per section; a `NOTIFICATIONS` section (the enum has Business, Loan rules, Payments, Security); read by every signed-in user, write by permission; history of who changed what |
| Staff, roles | `StaffAccount`, `Role`, `Permission`, `RolePermission`, `StaffInvite` CRUD | send the invite email and accept it; role editor rules (built-in roles read-only, a role can't give more than its editor holds) |
| Dashboard, worklist, reports | `WorkListTask`, `Notification`, `AuditLog` tables | the dashboard figures, worklist builder, PAR30 and arrears numbers, the reports (JSON, CSV, PDF) and the loan tracker CSV |
| Files | `FileResource` table, upload routes | storage for uploads (the upload route does not save the file) and an authenticated download; only a public `static` folder is served today |

## What the frontend will change to match

- Reads become `POST` with `{ query }`; list answers are read from `page.content` and `page.count`.
- The token is sent as a `Bearer` header and kept in memory only, with the `Refresh` cookie used to renew it.
- Sign-in sends `username`; the screen label stays "Email" until the backend dev says which field staff use.
- Every business action keeps its named route in [api-contract.md](api-contract.md) until the backend has it.

## Not checked yet

CORS (`origin: '*'` in `main.ts`), the `Refresh` cookie flags (`SameSite`, `Secure`), a literal password in `application.yml`,
and the CSRF protection the contract asks for (his build has none).
