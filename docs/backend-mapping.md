# What the backend covers, and what is missing

Written from reading `loan-app-rest-api` (branch `master`; read again on 11 Nov 2026 at commit `bab20ec`, the same as the remote). It is the frontend's view; nothing in the backend was changed.
Use it with [api-contract.md](api-contract.md) (what the screens need) and [backend-plan.md](backend-plan.md) (the rules).

## How the backend works today

- **46 generic controllers**, one per table, at `/api/private/<Models>/…` (for example `/api/private/Borrowers/find-all/`).
  Each has the same 16 routes: `find-all`, `find-by-pk`, `find-one`, `find-and-count-all`, `find-and-count-all-by-cursor`,
  `count`, `create`, `bulk-create`, `save-with-relationships`, `update-one`, `update-by-pk`, `delete-one`, `delete-by-pk`,
  `delete-all`, `restore` and `download-import-template` (the last one is a `GET`).
- **Reads are `POST` with a body** `{ "query": { … } }`. Query keys: `id`, `advancedFilters` (`[{ fieldName, value, operator,
  conjunction, childrenFilterParts }]`), `sort` (`[{ sortProperty, sortDirection }]`), `page` and `size`, `cursor`, `populate`,
  `projections`, `excludedProjections`, `includeSoftDeletedEntries`. Operators: `equals`, `ne`, `gt`, `gte`, `lt`, `lte`, `in`,
  `like`, `iLike`, `startsWith`, `endsWith`, `contains`, `between`, `isNull` and more. `like` and `iLike` add the `%` signs themselves,
  and a dotted name such as `person.fullNames` filters a joined table (the relation must be in `populate`).
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
| Sign in | login, logout, change password, find-account (the staff account and its person) | `POST` refresh-token route (the cookie is set, nothing reads it); forgot password and reset (service methods exist, no routes); set a password from an invite link; a route that returns the user **with their CASL rules**; lockout count and minutes from Settings, not fixed in code; idle-timeout value |
| Clients | `Borrower`, `Person`, `TelephoneNumber` CRUD | an optional **email** on the client (`Person` has none); reveal the full National ID (audit-logged, short-lived); phone change **approval** (`PhoneChangeRequest` exists, no rule or route); a client profile summary (loans, balance, status) |
| Applications | `LoanApplication`, `ApplicationGuarantor`, `OnlineApplicationLink` CRUD | submit; **approve**, **send back** (every rejection goes back to the officer, with a reason) and **close** (could map to `CANCELLED`); creator cannot approve; the guarantor check and **waiver** (one active loan per guarantor, an approver may waive); the online form (public, by token, with ID photos); signed-application PDF upload and **private** download |
| Loan products | `LoanProduct` CRUD | pricing copied onto the application so later edits don't change a loan; product limits and the other limits from Settings |
| Loans | `Loan`, `RepaymentSchedule`, `Disbursement` CRUD | build the schedule from the terms; pay out (mobile money, idempotency key, approver cannot pay out); to-disburse list; recovery |
| Payments | `Payment`, `PaymentAllocation`, `PaymentReversal` CRUD | record a payment (cap at what is owed, allocation order, idempotency key); edit a payment within the Settings window; reversal approval |
| Settings | `Settings` (section + JSON value) | validation and limits per section; a `NOTIFICATIONS` section (the enum has Business, Loan rules, Payments, Security); read by every signed-in user, write by permission; history of who changed what |
| Staff, roles | `StaffAccount`, `Role`, `Permission`, `RolePermission`, `StaffInvite` CRUD | send the invite email and accept it; role editor rules (built-in roles read-only, a role can't give more than its editor holds) |
| Dashboard, worklist, reports | `WorkListTask`, `Notification`, `AuditLog` tables | the dashboard figures, worklist builder, PAR30 and arrears numbers, the reports (JSON, CSV, PDF) and the loan tracker CSV |
| Files | `FileResource` table, upload routes | storage for uploads (the upload route does not save the file) and an authenticated download; only a public `static` folder is served today |

## What really exists in the backend code (checked again 11 Nov)

- **Every route is the generic one** (see above), plus login, logout, change password, find-account, the two payment webhooks and the file upload routes.
  There is no route for approve, send back, close, pay out, record a payment, recovery, reports, dashboard or worklist.
- **The service hooks are empty.** Each table's `beforeCreate`, `afterCreate`, `doCustomValidations` and the rest only contain the template
  (`// handle hook here`), so nothing is checked or calculated when a loan, payment, application or disbursement is saved. All the rules
  in [backend-plan.md](backend-plan.md) (schedule, allocation, late fees, two-person checks, guarantor limit) still have to be written.
- **Sending a payout:** `MobileMoneyDisbursementService.disburse()` (MTN and Airtel) exists, but no route or service calls it.
- **Webhooks work:** a payment callback becomes a `MobileMoneyTransaction`: `OUT` and `MATCHED` when it belongs to one of our disbursements
  (the disbursement turns `CONFIRMED` or `FAILED`), otherwise `UNMATCHED`. This is the data the "Match payments" screen needs.
  Nothing yet turns a matched transaction into a `Payment`.
- **SMS:** `SendSMSService` (Africa's Talking) and `SendSMSJob`/`SendEmailJob` (queued by `SidequestJobsService`) exist, but nothing queues them.
  There are no texts for payout, payment received or reminders, and no schedule that decides when a reminder goes.

## The new screens against the backend

| Screen | What the generic routes can already give | Still to build |
|---|---|---|
| Arrears & SMS (late loans) | `RepaymentSchedule`, `Loan` | the arrears figures (days late, overdue amount, age bands, collection rate); sending a staff text to a client (queue the SMS job, write a `CommunicationLog`, check `sms.send`) |
| Arrears & SMS (texts sent) | `CommunicationLog` (channel, to, details, status, sentAt, recipient) | filter to texts staff sent, scoped to the officer's own clients |
| Accounting, money in | `Payment` | totals by method for the dates |
| Accounting, money out | `Disbursement` (grossAmount, channel, sentAt, status, transactionId) | the list in the screen's shape; the payout itself (see above) |
| Match payments | `MobileMoneyTransaction` with `status = UNMATCHED` (has `matchedPaymentId`) | the match candidates (same phone, or the amount due); the match action that records a `Payment` and sets `matchedPaymentId` and `MATCHED`; the worklist task |
| Texts to clients (payout, payment, reminder) | `SendSMSService`, jobs, `MessageTemplate`, `CommunicationLog` | the triggers on payout and payment, the reminder schedule from the loan's repayment interval, the on/off and days-before settings (a `NOTIFICATIONS` settings section) |
| Four dashboard boxes, worklist, portfolio and risk cards | `WorkListTask` (type, priority, status, assignee), `Notification` | the builder that creates the tasks, and every figure (PAR30, arrears, early warnings, collection rate) |

## The schema already has room for

Recovery (`since`, `note`, `returnedAt`, `returnNote`), payment `idempotencyKey` and `surplus`, disbursement `idempotencyKey` and
`consentConfirmedAt`, late fee fields on `LoanProduct` and `Loan`, `WorkListType.PAYMENT_UNMATCHED`, `PaymentReversal`, `PromiseToPay`.

## The schema does not have yet

- An email on the client (`Person` has none).
- The guarantor waiver (reason and who granted it) and the "closed by officer" state of an application (could be `CANCELLED`).
- A `NOTIFICATIONS` section in `SettingsSection`, and fields for the client text switches and reminder days.
- Late fees that start only when a loan is in recovery (today the late fee fields on the loan say nothing about when they start).

## What the frontend will change to match

- Reads become `POST` with `{ query }`; list answers are read from `page.content` and `page.count`.
- The token is sent as a `Bearer` header and kept in memory only, with the `Refresh` cookie used to renew it.
- Sign-in sends the staff email as `username` (his login looks the account up by email, lower-cased), so the screen keeps its "Email" label.
- Every business action keeps its named route in [api-contract.md](api-contract.md) until the backend has it.

## Not checked yet

CORS (`origin: '*'` in `main.ts`), the `Refresh` cookie flags (`SameSite`, `Secure`), a literal password in `application.yml`,
and the CSRF protection the contract asks for (his build has none).
