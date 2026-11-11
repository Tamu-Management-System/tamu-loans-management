# Tamu Loans: backend plan

For the backend developer. The frontend is built and runs against a mock API that behaves like the real backend
should. This plan says what to build, in what order, and the rules behind the numbers. The endpoint-by-endpoint
detail (requests, responses, errors) is in [api-contract.md](api-contract.md); security requirements are in
[security.md](security.md).

**Client:** Tamu Cleaning Services (Kampala Central branch). **MVP:** Module 1 (borrower onboarding) and Module 2
(loan lifecycle), plus staff, roles, settings, audit log, reports and account pages, which the MVP screens depend on.
The Arrears & SMS and Accounting screens are built (see "Arrears & SMS, Accounting" in api-contract.md). Still Phase 2: automatic arrears rules, bulk and automatic reminders for late loans, and matching mobile money statements to loans.

## 1. How to start

1. Run the frontend: `npm install`, `npm run dev` (mock API on), sign in with a demo account (password
   `tamu2026`). Use the demo controls (bottom right) to switch between Loan officer, Finance and Admin.
2. The mock is the reference implementation: `src/mocks/handlers.ts` (every endpoint, with its checks),
   `src/mocks/seed.ts` (how sample data is shaped), `src/mocks/portfolioFigures.ts` (the calculations below),
   `src/lib/repaymentSchedule.ts` (interest, fees, schedule, late fees: **port this exactly**).
3. Response shapes are TypeScript types in `src/api/types.ts`. Match them field for field.
4. Point the frontend at your API with `VITE_API_URL` and build with `npm run build` (no mocks). Every screen
   should work unchanged.

## 2. Data model

> **The backend developer's own data model document is the source of truth for the database.** The table below is an
> early sketch kept for reference. Section 6 maps his model's names to the API's.

One branch for now (keep a `branch` column on users and borrowers so more can be added later). **Tamu calls these
"markets"** (they have staff in Mbarara): the screens say "Market"; the API keeps the key `branch` (e.g. data scope
`branch` = "Whole market"). Mbarara staff use the same shared book in the MVP. Money is whole
Ugandan shillings (integers). Dates are calendar dates in Kampala time (EAT, UTC+3); timestamps are UTC.

| Table | Key fields | Notes |
|---|---|---|
| `users` (staff) | id, name, email (unique), phone, photo, branch (market, chosen on invite), role_id, status (`active` / `invited` / `deactivated`), password_hash, last_sign_in_at, deactivated_at/by | Never deleted. Demo accounts are for the mock only. |
| `invites` | user_id, token_hash, sent_at, expires_at, used_at | One-time links; a new one kills the old. |
| `sessions` | id, user_id, device, location, created_at, last_active_at, ended_at | HTTP-only cookie; see security.md. |
| `roles` | id, name, description, built_in, data_scope (`own` / `branch`) | Built-in: Admin, Finance, Loan officer (read-only). |
| `role_permissions` | role_id, permission | Permission list in api-contract.md. Save adds required permissions. |
| `settings` | section (`business`, `loanRules`, `payments`, `security`), value (JSON), changed_at, changed_by | Defaults in `src/mocks/systemSettings.ts`. |
| `loan_products` | id, name, description, status (`active` / `archived`), repayment_schedule (`daily` / `weekly` / `monthly`), interest_rate_percent, interest_per (`loan` / `day` / `week` / `month`), amount_min, amount_max, number_of_payments (loan length), fee_type/value/collection, penalty_type/value/per/grace_days, updated_at/by | Defaults: Daily 0.6% a day, Weekly 4.5% a week, Monthly 18% a month, all one month long. |
| `borrowers` | id (`B-0001`), full_name, nin (encrypted, unique), phone (mobile money), secondary_phone, email (optional, clients only), gender, address, occupation (optional), premises, next_of_kin_name/phone/relationship, officer_id, registered_on, branch | The client's confirmed fields (questionnaire, 2 Nov 2026). No work/income. |
| `phone_change_requests` | borrower_id, new_phone, requested_by, requested_at, decided_by, decision | Four-eyes on the payout number. |
| `applications` | id (`APP-301`), borrower_id (null until an online form is submitted), officer_id, route (`paper` / `online`), status (`draft` / `awaiting-borrower` / `submitted` / `approved` / `rejected`), product_id, amount, repayment_schedule, first_payment_on, number_of_payments, **pricing snapshot** (product name, rate, basis, fee), missing, returned_reason/note/by/at, created/submitted/decided at/by, loan_id | Pricing is copied from the product when saved, so product edits never change it. |
| `guarantors` | application_id, position (1/2), full_name, nin (encrypted), phone, relationship | Two per application. Relationship only from the online form (paper: it is on the signed consent). A guarantor (matched by NIN) on a loan still being repaid can't be on another, up to Settings `guarantorMaxActiveLoans` (1), unless the application carries a waiver (`waiver_reason`, `waiver_requested_by/at`, `waiver_granted_by/at` on the application) that an approver granted when approving. |
| `online_forms` | token_hash, application_id, borrower_id, expires_at (`loanRules.onlineLinkValidHours`, default 72 h), status (`open` / `submitted` / `replaced`), submission (JSON) | Public; the token is the only access. |
| `documents` + `document_versions` | borrower_id, slot (e.g. `national-id-front`, `APP-301:application`), file (private storage), content_type (sniffed), size, uploaded_by/at, method (`scanned` / `online`), version | Never deleted; replacing adds a version. |
| `loans` | id (`TL-0001`), borrower_id, application_id, officer_id, product_id, pricing snapshot, principal, interest, fee, total_repayable, repayment_schedule, disbursed_on, payout method/reference (unique)/by, status (`active` / `cleared`), cleared_on | One open loan per borrower when that rule is on. |
| `instalments` | loan_id, number, due_on, amount | Generated at payout (section 3). |
| `payments` | id, loan_id, amount, method (`Cash` / `MTN MoMo` / `Airtel Money`), reference, paid_on, recorded_at, recorded_by, idempotency_key | Never deleted. The amount can be changed once the client asks for it (typing mistakes): keep each change in a `payment_edits` table (payment_id, old_amount, new_amount, edited_by, edited_at, reason) and never overwrite history; see `PATCH /payments/{id}`. |
| `recovery` | loan_id, since, by (person or `Automatic`), reason, note, returned_at/by/note | |
| `follow_ups` | loan_id, user_id, type (`promise` / `no-answer` / `field-visit`), promised_on, created_at | Feeds the worklist. |
| `audit_log` | id, at, actor (user, borrower or automatic rule), category, description, target (loan/application), details (before → after), ip, device | Append-only. |

## 3. Rules and calculations {#calculations}

Port `src/lib/repaymentSchedule.ts` exactly; the frontend shows the same numbers before saving.

**Interest.** `interest = amount × rate% × periods`, where `periods` is 1 for `interest_per = loan`, otherwise the
number of days, weeks or months the loan runs (the number of payments when the basis matches the schedule;
otherwise the loan length in days ÷ 1, 7 or 30). Example: Weekly loan, UGX 1,000,000, 4.5% a week × 4 weeks =
UGX 180,000.

**Fee.** `percent` of the amount or a `fixed` amount. `deducted`: taken from the payout (the borrower receives
amount − fee); `added`: added to what's repaid.

**Schedule.** `total = amount + interest (+ fee if added)`. Each instalment = `floor(total ÷ n ÷ 100) × 100`; the
last instalment takes the remainder. Due dates: the first payment date, then every day / 7 days / calendar month.
At payout the schedule moves so the first payment keeps the gap planned at application (payout date + that gap).
The first payment must be within 7 (daily), 14 (weekly) or 35 (monthly) days of the application.

**Payments** pay instalments oldest first. A loan clears when payments reach the total. **A payment can never be more than
the borrower owes** (balance plus unpaid late fees): there are no overpayments, so `Payment.surplus` is always 0, the
BORROWER_CREDIT ledger stays empty, and no refunds are needed. Back-dating up to `payments.backdateDays`; mobile money
needs a transaction ID when `payments.referenceRequired`.

**Late.** `daysPastDue` = days since the due date of the oldest instalment not fully paid (0 if it's due today or
later). `arrearsAmount` = what's unpaid on instalments due before today. "Seriously late" from
`loanRules.seriouslyLateDays` (default 30).

**Late fees** (from the loan's product), charged only once a loan is with the recovery team (not when it first goes overdue): after `grace_days`, `percent` of the overdue amount or a `fixed` amount,
charged once per missed payment or every day late. The nightly job must never charge twice: one late fee per instalment when charged per missed payment,
one per instalment per day when charged per day (a unique key on the charge enforces it). The frontend shows them separately; the backend adds them to
what's owed.

**Portfolio figures** (scope = the user's data access; open loans only):
- PAR1 / PAR30 / PAR90 = outstanding on loans more than 0 / 30 / 90 days late ÷ total outstanding.
- PAR30 history: the same calculation at the start of each of the last 12 months, and weekly, using the payments
  made before that date.
- Arrears bands: up to date, 1–30, 31–60, 61–90 and 90+ days late (amount and count).
- Collection rate (last 30 days): of the instalments that fell due in the last 30 days (before today), the share
  paid. Payments cover each loan's instalments oldest first, so catch-up payments on older arrears don't count.
- Early warnings (loans `loanRules.earlyWarningDays`+ days late, default 7, not in recovery): "moves past 30 days late in N days" (25–30 days late),
  "no payment since payout", "no payment for N days" (14+), otherwise "N days behind; last paid …".
- Officer summary: outstanding, active loans, paid out and cleared this month, still due in the next 7 days.
- Team performance: per officer, outstanding, loans, PAR30, due today, collected today.

**Recovery.** Manual send/return any time (`recovery.manage`). With `loanRules.recoveryMode = auto`, a daily job
sends loans `recoveryAfterDaysLate` days late (by "Automatic"); a loan a person brought back isn't sent again.
`suggest` only flags them in lists.

**Payout (MVP).** After approval the loan appears under Loans → To disburse for anyone with `loans.disburse`
(Finance by default), never the approver. They send the money by hand from Tamu's MTN/Airtel account, then record
the payout with the transaction ID and confirm the consent step; the schedule starts from that date.

**Payout (Phase 2, agreed with the client side 2 Nov 2026).** Approval does **not** pay out automatically. A person
with `loans.disburse` still clicks "Pay out"; that click sends the money through the MTN/Airtel API, and the
transaction ID, amount and loan start are recorded from the provider's response (no typing). This keeps the
approver ≠ payer rule. Handle pending/failed provider responses: the loan only starts when the provider confirms.

**Fees.** All products have no fee for now (`fee_type = none`); the fee fields stay so admins can add one later.
Minimum amount on every product is UGX 100,000.

**Two-person rules** (`loanRules`): the creator can't approve their application; the approver can't pay out that
loan; a new mobile money number needs someone else's approval. **One loan at a time** when
`oneOpenLoanPerBorrower`.

**Worklist** (per user, per day): officers get instalments due today, late loans to follow up (promise-due when a
promise falls due), and their incomplete drafts; admins get applications waiting for approval, approved loans
waiting for payout and pending invites. Priorities: promises due and loans `seriouslyLateDays`+ late `do-first`; other late
loans and drafts `do-today`; the rest `routine`.

**No hard-coded business numbers.** Targets, thresholds, lifetimes and limits come from `settings` (editable in
Settings, audit-logged), never from code: PAR30 target, early warning days, seriously late days, recovery days,
online link and invite lifetimes, back-dating, security limits, products, markets and payout accounts.

## 4. Build order

Each phase leaves the frontend working for the screens it covers (switch screens over as endpoints land).

1. **Foundation:** users, sessions, sign-in/out, lockout, CSRF, `GET /me`, roles and permissions, data scope,
   settings (`GET /settings`), audit log writer. Seed the built-in roles, the default settings and products.
2. **Staff and settings:** `/staff`, `/roles`, invites (+ email), `/settings/{section}`, `/loan-products`,
   `/me/*`, `/support/contacts`, `/audit`.
3. **Borrowers and applications:** borrowers list/profile/edit, NIN reveal, documents (upload, versions, view,
   download, sniffing, private storage), `POST/PATCH /applications`, drafts, online forms (public endpoints),
   approve/reject, phone change approval.
4. **Loans and money:** payout (`/loans/to-disburse`, `/applications/{id}/disburse`) with schedule generation,
   loans list/detail, `POST /payments`, `/payments/list`, recovery, late fees, the recovery job.
5. **Dashboard and reports:** `/dashboard/today`, `/worklist` and its actions, notifications, badges, search,
   portfolio figures, team performance, `/reports/{name}` (+ PDF/CSV export): portfolio, aged, due, collections, disbursements, cleared, applications, officers.
6. **Workflow notifications (client request, Nov 2026):** each step from the online form to payout tells the next person (in-app, and by
   SMS / email as set in Settings → Notifications). A queue with retries and a delivery log, plus a messaging provider
   (SMS and email). Steps, recipients and rules are in `api-contract.md` (Settings → Notifications). Which channel the client wants
   first, whether clients get messages too, and a reminder when nobody acts are still open questions.

## 5. Sample data

`src/mocks/seed.ts` shows the shape to aim for in a staging database: about 190 borrowers across five officers,
each with up to a year of one-month loans (most repaid on time, some often late, a few stopped paying and went to
recovery), real schedules and payments, and applications at every stage. Never load sample data into production.

## 6. Data model and API names

The data model (database) and the API (what the screens call) can use different names. The API shapes in
[api-contract.md](api-contract.md) are what the frontend expects, so the API maps the model's names as below.
Nothing in the frontend has to change for the model, and nothing in the model has to change for the frontend.

**Style.** The model uses `camelCase` fields and `UPPER_CASE` enums. The API uses lower-case words for enum values
(`awaiting-borrower`, `in-arrears`, `missed-payment`), so map them at the edge.

| Model | API |
|---|---|
| Region (a "market") | `branch` (name) and `branchId` (the Region id) on staff; `settings.business.branches` is a list of `{ id, name }`. A rename keeps the id. Screens say "Market"; role `dataScope: "branch"` = MARKET. |
| Person.fullName, otherNames | `fullName` (borrowers also `name`). `otherNames` isn't on any screen. |
| Person.gender, address | Required by the screens for borrowers only (`gender`, `area`). Not asked for guarantors or staff, so they stay empty on their Person. |
| Person.address, placeOfWork | `area` (shown as "Address (Location)"), `premises` (shop / arcade / building) |
| TelephoneNumber MAIN / OTHER | `phone` (mobile money), `secondaryPhone`. A PhoneChangeRequest shows as `pendingPhoneChange`. |
| Phone numbers (E.164) | Store `+2567…`. Accept local or `+256` on input. **Return the local display form `0772 418 230`**, so screens show it unchanged. |
| Borrower.nextOfKinName / Phone / Relationship (all optional) | `nextOfKin: { name, phone, relationship }`, each `null` when not given |
| Borrower.status | `status`: `applicant`, `active`, `in-arrears`, `cleared` |
| LoanProduct fields | `interest { ratePercent, per }`, `amount { min, max }`, `numberOfPayments`, `fee { type, value, collection: added \| deducted }`, `penalty { type, value, per: missed-payment \| day, graceDays }`, `repaymentSchedule`, `status: active \| archived` |
| LoanApplication.status | `draft`, `awaiting-borrower` (WAITING_FOR_BORROWER), `submitted` (PENDING_APPROVAL), `approved`, `rejected`. DISBURSED = `approved` with `loanId` set. CANCELLED applications aren't returned (no screen yet). |
| ApplicationEvent (RETURNED) | `returned { reason, note, by, at }` = the latest return that hasn't been fixed |
| decidedBy / decidedAt | `decided { by, at }` |
| ApplicationGuarantor | `guarantors[]` with `fullName`, `nationalId`, `phone`, `relationship` (empty on paper applications) |
| StaffInvite (INVITE / PASSWORD_RESET) | The emailed link `/set-password/<token>`; `GET` and `POST /public/invites/{token}` (see api-contract.md). Setting the password makes the account ACTIVE and ends its old sessions. |
| Disbursement (belongs to the application) | `POST /applications/{id}/disburse`; its response gives the new `loanId`. The loan exists only after a CONFIRMED payout. |
| Loan.status ACTIVE / CLOSED / IN_RECOVERY / WRITTEN_OFF | `status` `active` / `cleared`; in recovery = `recovery` object present; late = `daysPastDue > 0` (computed). WRITTEN_OFF has no screen yet. |
| Loan.loanOfficer | `officer { id, name }` |
| RepaymentSchedule (current version) | `schedule[]` with `number`, `dueOn`, `amount`, `status`. Superseded versions aren't shown. |
| Payment | `payments[]`; `method` is `Cash`, `MTN MoMo` or `Airtel Money` |
| LoanCharge (LATE_FEE) | `lateFees { amount, … }`. "Owed now" = balance + late fees. |
| Recovery.reason | `long-overdue`, `unreachable`, `refuses-to-pay`, `other` |
| WorklistTask.type | `instalment-due`, `promise-due`, `overdue`, `application-incomplete`, `awaiting-approval`, `awaiting-disbursement`, `access-request` |
| Allocation order (Settings LOAN_RULES) | `loanRules.paymentAllocationOrder`: `charges`, `fees`, `interest`, `principal` in the order a payment clears them |
| Settings sections BUSINESS / LOAN_RULES / PAYMENTS / SECURITY | `business`, `loanRules`, `payments`, `security`; `changed { at, by }` from the newest row |
| Payment.transactionId | `reference` (mobile money transaction ID; for cash an optional receipt number) |
| Payment.idempotencyKey | the `Idempotency-Key` header on `POST /payments` |
| Disbursement.payoutAccount, consentConfirmedAt | `payoutAccount`, `consentConfirmed: true` in the payout request (the server stamps the time) |
| LoanApplication.createdBy | `officer { id, name }` on applications: the loan officer who created it. Applications have no market of their own in the model: work it out from the creator's market (or the borrower's, when there is one). |
| Consent (online form) | No signatures: each of the three people ticks "I agree". `consent: { borrower, guarantor1, guarantor2 }` in the submission; the server stamps `ApplicationGuarantor.consentSignedAt` for each guarantor and logs the borrower's consent time in the AuditLog (actorType BORROWER). |
| Session / sign-in history | `recentSignIns` on My profile = the person's AuditLog SIGN_IN entries (successful and failed), not Session rows |
| Technical support contact (KadoshDev) | Server configuration, not a database table: `GET /support/contacts` returns it with the admins and business contacts |
| AuditLog.actorType + actorId | `actor { id, name, role, photoUrl }` (SYSTEM shows as "Automatic") |

**Calculations to keep.** Each instalment's `amountDue` follows the rule in section 3 (rounded down to 100, the last
one takes the remainder). The model's principal / interest / fee parts of an instalment are that amount split in
proportion (any rounding remainder goes to the last instalment).

**Not planned (the client doesn't need them; build only if that changes):** PaymentReversal and Refund. They are rare and
hard to do safely, so the system prevents the cases instead: a payment can never be more than the borrower owes (see
Payments in section 3), so there are no overpayments to refund, and a wrong payment is fixed by telling Finance or an admin.
The tables stay in the data model but nothing uses them yet.

**Not on any screen yet (build when the module arrives):** LoanWriteOff (forgiving money, needing a second person's
approval), the Ledger and LedgerEntry accounting entries (Module 4), MobileMoneyTransaction matching, MessageTemplate /
CommunicationLog / AutomationWorkflow (Module 3). The screens for them show "Coming soon".

## 7. Open questions for the client

- Who can override a late fee, and whether late fees count towards PAR.
- Recovery charges ("as determined by the recovery team" on the agreement): how they're worked out and recorded.
- Whether recovery staff need their own logins (a custom role exists for it).
- Monthly loans: is one month always the length, or do officers pick 1, 2 or 3 months per loan?
- Where a payment goes first: admins choose it in Settings → Loan rules (default charges → fees → interest →
  principal). Confirm with Tamu which order they want as the default.
- Payment matching with MTN/Airtel statements (Module 4) and SMS reminders for late payments (Module 3) are Phase 2. Workflow messages to staff are not: see item 6 above.
