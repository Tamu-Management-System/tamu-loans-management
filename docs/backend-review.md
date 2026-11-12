# Backend review (read-only)

Written from reading `loan-app-rest-api` at commit `4004532` (12 Nov 2026). Nothing in the backend was changed.
This is the frontend's view. It says what the backend does, what the frontend must change to match it, and what the backend developer should look at.
None of the problems below were tested against a running server, because the review is read-only.

## How it was read

About 180,000 lines, but most of it is generated: the same service, controller and module repeated for each of the 46 tables.

- **Hand-written code, read line by line:** `services/lending`, `application`, `account`, `dashboard`, `reporting`, `review`, `audit`, `utils`, the big services (Payment, Disbursement, LoanApplication, Ledger, Settings, LoanProduct, Role, AuditLog, RepaymentSchedule, FileResource), the "screens' routes" of 19 controllers plus Auth, Dashboard, Report, online intake and the webhooks, `security/` (including the whole permission layer), `sidequest/`, `payments/`, `utils/`, `config.ts`, `main.ts`, the modules, the database config, the migrations, the demo seeder, the scripts and the tests.
- **Generated services and controllers:** every file compared against a reference with the model name swapped out. The services differ only in their field mapping; the controllers differ only in which permission each route asks for (the full map was extracted and reviewed). Person and StaffAccount were generated in an older style and have no custom logic.
- **Generated entities (46 tables):** every column, type, nullability, unique constraint and index extracted by script and reviewed.
- **Generated response classes (DTOs), query classes and Swagger schemas:** checked by script for which sensitive fields are returned or hidden. They were not read line by line, because they are the same template repeated.
- **Dependencies:** all 71 production dependencies checked against what the code imports.

## What matches our contract exactly (checked)

- **Permissions:** the same 36 keys, and the three built-in roles (Admin, Finance, Loan officer) have exactly the same permissions as in the frontend. Each screen route asks for the permission the contract names.
- **Settings:** five sections (business, loan rules, payments, security, notifications), with the same fields, defaults and limits as the mock, validated and audited. Markets are `Region` rows.
- **Online form link:** `{FRONTEND_URL}/forms/{token}` and the invite and reset link `{FRONTEND_URL}/set-password/{token}` are routes the frontend already has.

## What is built

- **Loan arithmetic** (`lending/repayment-schedule.ts`): flat interest (per loan, day, week or month), fee added to the repayment or deducted from the payout, installments rounded down to UGX 100 with the remainder on the last one, parts always add up exactly.
- **Payment allocation** (`lending/allocation.ts`): a targeted installment first, then oldest first; inside an installment the order comes from Settings. Never more than is owed: an overpayment is refused, not held as credit.
- **Applications:** the paper and online routes, saved all at once (draft or submit) exactly as the screens do it, guarantor limit with waiver, creator cannot approve, three approval checks, send back with a reason, close, pricing copied onto the application so later product edits do not change it. (His older step-by-step flows are also still there.)
- **Payout:** finance records a manual mobile money payout. The transaction ID must be unique, the amount must equal the approved amount, the date must be between approval and today, the number must be one of Tamu's payout accounts, and the approver cannot pay out. The loan, its schedule and its ledger are created only when the payout is confirmed. The same service can also send the payout through MTN or Airtel and settle it by webhook or polling.
- **Payments:** an officer records a payment (idempotency key); a customer pays by USSD with the loan number as the reference (webhook); an officer can ask the customer to pay ("request to pay", which our screens do not have yet); a payment can be edited (old ledger lines reversed, never erased), only by the person who recorded it, only the latest on the loan, within the Settings window; the loan closes when fully repaid.
- **Late fees and recovery:** a loan goes to recovery after the number of days in Settings (unless a person brought it back); late fees are charged only for loans in recovery, once per installment (or per day), enforced by a unique index.
- **Texts to clients:** payout and payment texts, reminders (a daily job at 08:00, de-duplicated by a unique index), staff texts and text history, each logged in `CommunicationLog`. Sending needs his second process and the Africa's Talking settings.
- **Ledger:** double entries for payouts, fees, payments and payment edits. The MOBILE_MONEY, INCOME, FEES, BORROWER_CREDIT and CASH ledgers must each exist exactly once, or the payment or payout is refused with a clear message.
- **Sign-in:** sessions with refresh-token rotation and theft detection, lockout and password length read from Settings, forgot and reset password (no email enumeration), invites, sign-in audit, "where you're signed in".
- **Files:** the type is checked by the first bytes, 5 MB limit, random private keys, never overwritten, no path traversal, every view and download audited.
- **Public form:** the link token is stored hashed, works once, shows only the loan terms, and ID photos are checked.
- **Figures and reports:** loan figures, PAR, arrears bands, collection rate, early warnings, the eight reports and the CSV export (formulas neutralised), the daily worklist with promises to pay and unmatched payments.
- **Payment providers:** MTN and Airtel clients cache their token, send a reference with every transfer, and the Airtel PIN is RSA-encrypted as Airtel requires. Their keys come from environment variables.
- **Database:** 113 migrations; the indexes the code relies on exist (one late fee per installment and day, one payment per idempotency key, one transaction per provider and ID, one live payout and one loan per application, one reminder per installment and milestone).
- **Tests:** 21 end-to-end suites and 19 unit suites cover applications, payouts, repayments, late fees, reminders, reports, staff and roles, access and settings. None of them touches the generic table routes.

## What the frontend must change

1. **URLs:** follow `docs/frontend-mapping.md` in his repo. Private routes are `/api/private/<Model>/…`, public ones `/api/public/…`.
2. **Sign-in answer:** the token is `content.idToken` (also in the `Authorization` header). The refresh token is only in the `Refresh` cookie.
3. **"Where you're signed in"** is now real, but `device` is the raw browser string (for example `Mozilla/5.0 …`) and `location` is the IP address. The screen should shorten the browser string.
4. **Product fees:** in his database a product's `feeValue` and `lateFeeValue` are whole numbers, so a fee such as 2.5% cannot be stored. Our product form should only accept whole numbers for them (or he changes the columns).
5. **Application saving** uses `POST /LoanApplications` and `PATCH /:id` with `submit: true | false`, as the screens already do.
6. **Not in our screens yet:** request to pay (`Payments/collect`), the staged review (`ApplicationReview`), the Ledger and the other tables listed earlier.
7. **Extra routes we do not use:** `POST /api/public/account/forgot-password` and `reset-password` exist, but the contract says resets are made by an admin.

## For the backend developer (not frontend changes)

Ordered by how much they matter.

### Critical

1. **The token signing secret and the encryption key are written in the source (`src/config.ts`) and nothing replaces them.** The code reads them only from those defaults; the yml files have them commented out and no environment variable is read. Anyone who can read the repository can sign a token for any account. They should come from environment variables, the committed values should be treated as exposed and replaced, and all sessions ended once they are.
2. **The generic table routes (`/api/private/<Model>/find-all/`, `create/`, `update-one/` and the rest) bypass the screens' rules.** Reachable by any signed-in user with the matching permission:
   - **SQL injection** in `services/utils/query-options-builder.service.ts` (`buildSqlWhereClauseFromFilterPart`): a filter's `value`, `fieldName` and `conjunction` are put into SQL text without escaping or binding (`'${filterPart.value}'`), reachable through `atLeastOneIncludeRequiredIncludes` plus a nested filter. Any signed-in user with read access to one table could read other tables (for example password hashes).
   - **Writes skip every business rule.** `payments.record` can create or change a `Payment` directly (no allocation, no overpayment check, no ledger); `loans.disburse` can create or change a `Loan`, `Disbursement` and `RepaymentSchedule`; `recovery.manage` can create a `LoanCharge`; `users.manage` can create a `StaffAccount`. The table-level check has no field-level limit.
   - **Reads are not limited to the officer's own clients** except on three tables (`Borrower`, `Loan`, `LoanApplication`). Through `Person`, `TelephoneNumber`, `Payment`, `RepaymentSchedule`, `Disbursement`, `CommunicationLog`, `ApplicationGuarantor` and others, a loan officer sees every officer's data.
   - **The full National ID is returned** by the generic `Person` routes (`nin` is exposed), with no masking, no `borrowers.nationalId` permission and no audit entry, which defeats the "reveal" feature.
   - **Other raw fields are returned:** `Session.tokenHash`, `OnlineApplicationLink.tokenHash` and `submission` (the applicant's whole form), provider responses on `Disbursement`, `Refund` and `MobileMoneyTransaction`.
   - **No cap on page size** (`size` or `limit`), and the caller can switch on soft-deleted rows (`paranoid`).
   - If the user context is missing, reads run unfiltered (fail open).
   - The screens do not use these routes and no test covers them. The simplest fix for all of this is to switch the generic routes off in production, or limit them to a few read-only tables.
3. **Demo accounts with one known password in the live database.** `pnpm seed:demo` creates every staff account (Admin and Finance included) as `<name>@tamu.example` with the password written in the README. He said he loaded it into the database Render uses. These accounts can approve and pay out loans, so they must be removed (`pnpm seed:demo:down`) before real use, and the live database should not hold demo data next to real data.
4. **A clean (non-demo) database cannot be used.** There is no seeder for real data (the `seeders` folder does not exist). Nobody can sign in because no first admin is created; the company ledgers (MOBILE_MONEY, INCOME, FEES, BORROWER_CREDIT, CASH) can only be created by the demo seeder, and `Ledger` creation is closed to every role, so payments and payouts would be refused. A market and the payout accounts must also exist. A one-time setup command for the first admin, the ledgers, the market and the payout accounts is needed before go-live.

### High

5. **No `trust proxy` setting.** On Render every request arrives through the proxy, so `req.ip` is the proxy's address. The rate limits (100 a minute overall, 10 sign-ins a minute) then count all users together, and the audit log and the session list record the proxy's address instead of the user's.
6. **The refresh cookie is `SameSite=Lax`, and the refresh token is not in the response body.** If the frontend (Vercel) and the API (Render) are on different sites, the browser will not send the cookie on a call from the frontend, so the session cannot be renewed and people are signed out when the access token ends (24 hours). Fix with one site for both (for example `app.` and `api.` under one domain), or `SameSite=None; Secure`, or also returning the refresh token in the body (the refresh route already accepts it).
7. **Cross-origin settings:** `CORS_ORIGINS=*` (or nothing set outside production) makes the server answer any website with credentials allowed. It must be the frontend's address only, and `NODE_ENV=production` must be set (it also turns on the `Secure` flag of the cookie).
8. **Uploaded files are saved to a local folder** (`./storage`). On Render that folder is lost at every restart or deploy unless a persistent disk is attached, which would delete signed applications and ID photos. Use a persistent disk or object storage.
9. **The staged-review routes (`/api/private/application-review/...`) do not check who owns the application.** Anyone with `applications.create` (every loan officer) can assign reviewers to, or move to a stage, any application by its id, including other officers' applications, and this sends notifications to the staff named. The review is also not connected to approve and reject (approval ignores the stage), so today it does nothing useful for the staged approval the client described.
10. **Guarantor consent is only a tick box on the borrower's own form.** In the online form the borrower ticks "I agree" for themselves and for both guarantors, from one device, and the PDF says "agreed online". Nothing is sent to the guarantors to confirm (for example an SMS code to each guarantor's phone), so a borrower could consent on their behalf.

### Medium

11. **Certificate checking is off** for the mail server (`rejectUnauthorized: false` in `SendEmail.service.ts`) and for the database connection (`database/config/config.ts`). The emails carry set-password and reset links, so someone who can sit between the server and the mail server could read the tokens.
12. **Secrets and personal data in logs and URLs:** the MTN and Airtel callbacks accept the shared secret as `?token=` (it ends up in logs and proxies), the webhook controller logs the whole callback body (phone numbers and amounts), and `console.log` prints the decoded token on every request (`Common.module.ts`), the request query (`decrypt-ids.interceptor.ts`) and the data being saved in the permission layer's `upsert`.
13. **Error messages reach the client unchanged,** including database errors (constraint names, table and column names), because `ErrorUtilsService` passes `error.message` through.
14. **The API documentation (Swagger) is public at `/api/v2/api-docs`,** also in production. It lists every route and field.
15. **Access tokens last 24 hours.** They are revocable (the session is checked on every request), but a shorter life is safer. Also, any unhandled rejection closes the app and exits (`main.ts`), so one bad request in a job can take the API down, and the JSON body limit is 50 MB on every route while uploads are multipart.
16. **Slow lists and figures (cause found, fix tested, 12 Nov 2026):** the dashboard, loan lists, payment list, portfolio figures and reports took 2.5 to 4.7 seconds each for the admin on the demo data (906 loans, 9,296 payments), and under load the database cancelled statements over 3 seconds (`statement_timeout`), answering `500` (3 of 8 screens failed in the browser). A CPU profile showed the time was mainly the code, not the database: (1) `Portfolio.shape` and `LoanBook.viewsFor` scan the whole list of 10,361 schedule rows for each of the 906 loans (`rows.filter((r) => r.loanId === l.id)`, about 9.4 million comparisons, each read through Sequelize's slow getters); (2) Sequelize builds a full model object, with every date column parsed, for each schedule row, loan, client, person and phone when the figures use five or six columns; (3) the payment list builds a full object from four joined tables for each of 12,887 rows to keep one page of 25. The fix (two files, `loan-app-performance-fix.patch`): group the rows by loan once, ask for only the needed columns (plain rows for the schedule), and for the payment list fetch plain columns for the totals and build the full objects only for the 25 on the page. Same machine, same data, admin, median of 3 runs, 12 key requests added up: 41.7 seconds before, 4.1 seconds after (dashboard 3.9 s to 0.36 s, portfolio risk 3.2 s to 0.41 s, loan list 4.6 s to 0.46 s, payment list 2.6 s to 0.16 s, reports 3.2 to 3.5 s to 0.3 to 0.44 s). In the browser, with the original 3-second limit, all 78 screen loads (admin, finance, officer) passed with no timeouts. The answers are identical to the original code on 120 of 126 requests across the three roles; the other 6 are lists sorted by something many rows share (loans disbursed the same day, payments at the same minute), where the original left the order of equal items undefined: the loan picker has identical content, and the changed payment list returns all 9,296 payments across its pages with none repeated (the original returned a `500` partway through the same walk). Payments with the same time now have a fixed order. His end-to-end suite passes (21 of 21 suites, 517 tests). Still open: the 12-month and 52-week risk history could be calculated once a day and stored, and the dashboard loads the loans more than once per request. On Render the change has not been measured.
17. **Dependencies:** 27 of the 71 production dependencies are never imported (including the deprecated `csurf`, `node-easyocr` which has a native install script allowed in `pnpm-workspace.yaml`, `livekit-server-sdk`, `socket.io`, `@sendgrid/mail`, `express-session`, and `embedded-postgres`, a test database listed as a production dependency). Removing them shrinks the attack surface. The repo has no Dockerfile, deploy file or CI, so nothing runs the tests before a deploy.
18. **Schema:** `Ledger.balance` is a floating-point number while all other money is a whole number; `Disbursement.transactionId` and `idempotencyKey` have no unique constraint (the "transaction ID already used" rule is only a check before saving, so two simultaneous payouts could both pass); `Notification.readAt` is a string; `StaffAccount` keeps a second copy of the password hash in `password`; the National ID is stored as plain text; money columns are 32-bit integers (about 2.1 billion, which a very large loan with interest and fee could pass); the product's `feeValue` and `lateFeeValue` are whole numbers only; the database time zone defaults to `America/Los_Angeles` when `TIMEZONE` is not set; guarantors are re-created as new `Person` rows on every save, which leaves unused rows behind.
19. **A suggestion, not in the contract:** an admin can create a role with any permission (for example approve and pay out) and give it to another account. A rule that a role cannot give more than its editor holds would keep the separation between approving and paying out.

### Smaller

The unknown-email sign-in skips the password check (a small timing difference); `AuthService.MAX_FAILED_SIGN_INS` and `LOCK_OUT_MINUTES` are now unused (Settings are used); `X-XSRF-TOKEN` is allowed in CORS but nothing checks it (there is no CSRF check; the bearer header is the main protection, the cookie is only used by the refresh route); `payments/mtn-momo/mtn-momo.service.ts` is an unused placeholder; the job dashboard has its login read from the environment and would be open if switched on without it; the 14-day and 25 to 30 day signals in the early warnings, the 30-60-90 day bands and the overdue reminder days (1, 3, 7, then every 7 up to 60) are written in code or in environment variables, not in Settings; the three standard products (`DEFAULT_PRODUCTS`) and the smallest request-to-pay amount (UGX 500) are written in code; `count` in the cursor route and `count()` in the permission layer behave differently from the filtered reads; PAR and the portfolio figures leave out unpaid late fees, while the loan page includes them; the unverified token payload is stored in the request context and used to pick the key of the opt-in encryption middleware; only the first 50 unmatched payments appear in the worklist; the Excel import service has no route that uses it.

## Checked by running it (12 Nov 2026)

A copy of the backend (the repository itself untouched) was run on a throwaway database with its own migrations and demo data, and the frontend was run against it with the mock removed.

- Every screen loaded without an error for an admin, a finance user and a loan officer, including the detail pages (loan, client, application at each stage), the eight reports with their PDF and CSV downloads, and document downloads. The only failures were the timeouts in item 16 (the test was repeated with that limit raised in the copy).
- Actions that were exercised and worked: all five settings sections, loan products (create, change, archive, restore), roles, staff (invite, resend, cancel, change role and market, turn back on), approve and send back, manual payout (and the same payout again with the same key), recording and editing a payment (and again with the same key), recovery, a text to a client, paper and online applications (draft, submit with the PDF), the public online form, client edits, documents, National ID reveal, online links.
- Sign-in: a wrong password shows his message; a reload keeps the session by renewing from the refresh cookie; signing out ends it.
- Found and fixed on the frontend side: the payments totals showed `NaN` when a method had no payments (his `byMethod` omits it); the loan page counted unpaid late fees twice (his balance already includes them); "Add to today" is only possible for loans the signed-in person looks after (finance and admin got "Loan not found"), so the button is now shown to loan officers only.
- Not available from his side: profile photos (`/me/photo`).

## Checked on the live server (12 Nov 2026, https://loan-app-rest-api.onrender.com)

Read-only checks with a demo officer account; nothing was created or changed.

- **It is up** and the API documentation answers in under a second. Sign-in, the user, and the screens (dashboard, loans, applications, clients, arrears, payments, accounting, reports, settings, notifications, account) all loaded.
- **CORS accepts any website.** A preflight from `https://evil.example` was answered with that origin and `access-control-allow-credentials: true`, the same as for `localhost` and the Vercel address (item 7). `CORS_ORIGINS` is not set to the frontend's address.
- **The sign-in cookie is not `Secure`** (the browser stored `Refresh` with `secure: false`), so the server is not running with `NODE_ENV=production` (item 7).
- **A reload signs people out** when the frontend calls the server directly from another site (`401` on the renewal call), because the cookie is `SameSite=Lax` (item 6). The frontend avoids this by passing `/api` through its own address (`docs/running-against-the-backend.md`), which needs nothing from the backend.
- **It is slow on the demo data:** the portfolio summary took 6 seconds for a loan officer (0.3 seconds locally), and once answered `500` on the dashboard (item 16).

## His 13 new commits (12 Nov 2026, read the same day)

The backend moved from `4004532` to `02b7551` (41 files, 619 lines added). Nothing in them touches the loan lists, portfolio figures or reports, so the performance fix applies on top.

- **Texts now go through Ego SMS** (replacing Africa's Talking, whose packages were removed). Keys come from `EGO_SMS_API_USERNAME`, `EGO_SMS_API_KEY`, `EGO_SMS_SENDER_ID` and `EGO_SMS_API_URL`. A refused text is told apart from one worth retrying (for example a low balance is retried).
- **Mobile money goes through a queue.** Requests to pay, payouts and every MTN or Airtel callback run as jobs on a `mobile-money` queue that has priority over texts. The webhook answers `200` at once after checking its secret and queues the work; if it can't be queued it answers an error so the provider sends it again. Handling is safe to repeat. The limits are set by `QUEUE_MAX_CONCURRENT_JOBS`, `QUEUE_MOBILE_MONEY_CONCURRENCY`, `QUEUE_HIGH_PRIORITY_CONCURRENCY`, `QUEUE_DEFAULT_CONCURRENCY`, `QUEUE_HEAVY_REPORTS_CONCURRENCY`, not in code.
- **Jobs run inside the app's own process** (`fork: false`, `runner: 'inline'`) from a separate worker process (`pnpm worker:start`); the daily reminder job is registered when the worker starts.
- **The job dashboard is off by default** (it used to be on by default) and needs `SIDE_QUEST_DASHBOARD_ENABLED=true` and a user and password.
- **MTN setting names changed** and must be set on the server: `MTN_MOMO_API_BASE_URL`, `MTN_MOMO_COLLECTIONS_APP_USER`, `MTN_MOMO_COLLECTIONS_API_KEY`, `MTN_MOMO_COLLECTIONS_SUBSCRIPTION_KEY`, `MTN_MOMO_DISBURSEMENTS_APP_USER`, `MTN_MOMO_DISBURSEMENTS_API_KEY`, `MTN_MOMO_DISBURSEMENTS_SUBSCRIPTION_KEY`. In `sandbox` mode test numbers are sent as given.
- **For the frontend:** payouts and requests to pay now answer as soon as the job is queued ("Request queued"), and the result arrives later, so those screens (not built yet) must show a pending state and refresh.

**New problems in them (checked on the live server with empty bodies, so nothing was sent):**

1. **Two test routes are live and can ask any phone for money.** `POST /api/private/Payments/test-momo/collect/` sends an MTN request-to-pay for any phone and amount, with no loan and nothing saved, and `/test-momo/status/:referenceId` checks it. They are guarded only by `payments.record` (loan officers and finance have it) and by `NODE_ENV === 'production'`. The live server is not in production mode (its sign-in cookie has no `Secure` flag), so both work: the status route reached MTN and MTN answered "resource not found" for a made-up reference. Fix: remove them before real use, or guard them with an explicit off-by-default setting instead of `NODE_ENV`, and set `NODE_ENV=production` on the server.
2. **`POST /api/private/CommunicationLogs/send-sms` sends any text to any Ugandan mobile number** for anyone with `sms.send` (officers and finance), not tied to a loan or client, up to 1,000 characters. Live too (it answered its own validation message). The screen route `POST /Loans/:id/sms` is tied to a loan; this one is not. It costs money and could be used to send misleading texts under the company's name. Fix: remove it, or limit it to an admin and to a client's own number.
3. **The webhook still logs the whole callback body** (`MTN callback received: …`, `Airtel callback received: …`, phone numbers and amounts) and still accepts the secret as `?token=`. Unchanged from item 12.

Not touched by his commits, so still open: items 1 to 11 and 13 to 19 above (`src/config.ts`, `main.ts`, the generic routes and the live CORS setting are all unchanged).

## Corrections to earlier notes

- `POST /LoanProducts/:id/restore` exists (an earlier search cut off before it).
- The "Where you're signed in" list is no longer demo-only on his side: sessions are written at sign-in, listed and ended by his code.
- His migration dates (up to `2026.11.20`) are later than this machine's clock; that is harmless.
