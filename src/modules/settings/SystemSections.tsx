import { useId } from "react";
import type { AllocationPart, PaymentMethod, PayoutAccount } from "../../api/types";
import { useAuth } from "../../auth/AuthContext";
import { Icon } from "../../components/ui/Icon";
import { Select } from "../../components/ui/Select";
import { normalisePhone } from "../../lib/phone";
import { SETTING_LIMITS } from "../../lib/settingLimits";
import { NumberField, Segmented, SettingRow, SettingsForm, SettingsGroup, Switch } from "./SettingsForm";
import { useSettingsDraft } from "./useSettingsDraft";
import styles from "./Settings.module.css";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const outside = (value: number, [min, max]: readonly [number, number]) => value < min || value > max;
const rangeText = ([min, max]: readonly [number, number], unit: string) => `${min} to ${max} ${unit}`;

/** Where a payment goes first. Each choice is a full order, so it can't be left half-set. */
const ALLOCATION_ORDERS: { order: AllocationPart[]; label: string }[] = [
  { order: ["charges", "fees", "interest", "principal"], label: "Late fees, fees, interest, then the loan (recommended)" },
  { order: ["fees", "interest", "principal", "charges"], label: "Fees, interest, the loan, then late fees" },
  { order: ["interest", "principal", "fees", "charges"], label: "Interest, the loan, then fees and late fees" },
];
const orderKey = (order: AllocationPart[]) => order.join(">");

/** Settings → Loan rules: the checks every loan goes through. */
export function LoanRulesSection() {
  const { can } = useAuth();
  const draft = useSettingsDraft("loanRules");
  const ids = { recovery: useId(), late: useId(), target: useId(), warning: useId(), link: useId(), order: useId() };
  const numbers = [
    ["seriouslyLateDays", "Days late shown in red", "days"],
    ["par30TargetPercent", "PAR30 target", "%"],
    ["earlyWarningDays", "Early warning", "days"],
    ["onlineLinkValidHours", "Online link lifetime", "hours"],
  ] as const;
  const rules = draft.values;
  return (
    <SettingsForm
      title="Loan rules"
      subtitle="The checks every application and loan goes through"
      draft={draft as never}
      canEdit={can("settings.rules")}
      validate={() =>
        rules!.recoveryAfterDaysLate !== null && outside(rules!.recoveryAfterDaysLate, SETTING_LIMITS.recoveryAfterDaysLate)
          ? `Days late before recovery: ${rangeText(SETTING_LIMITS.recoveryAfterDaysLate, "days")}.`
          : (() => {
              const bad = numbers.find(([key]) => outside(rules![key], SETTING_LIMITS[key]));
              return bad ? `${bad[1]}: ${rangeText(SETTING_LIMITS[bad[0]], bad[2])}.` : null;
            })()
      }
    >
      {rules && (
        <>
          <SettingsGroup title="Two-person checks" description="Money only moves when two different people agree. Turning these off makes fraud easier; every exception is still logged.">
            <SettingRow label="The person who starts an application can't approve it" description="Someone else with permission to approve must check it.">
              <Switch label="Creator can't approve" checked={rules.creatorCannotApprove} onChange={(value) => draft.set("creatorCannotApprove", value)} />
            </SettingRow>
            <SettingRow label="The person who approves a loan can't pay it out" description="Another person with permission to pay out records the payout.">
              <Switch label="Approver can't pay out" checked={rules.approverCannotDisburse} onChange={(value) => draft.set("approverCannotDisburse", value)} />
            </SettingRow>
            <SettingRow label="A new mobile money number needs a second person's approval" description="Payouts keep going to the old number until someone else approves the new one.">
              <Switch label="Number changes need approval" checked={rules.phoneChangeNeedsApproval} onChange={(value) => draft.set("phoneChangeNeedsApproval", value)} />
            </SettingRow>
          </SettingsGroup>

          <SettingsGroup title="Applications">
            <SettingRow label="One loan at a time" description="A client can't start a new loan until the current one is repaid.">
              <Switch label="One loan at a time" checked={rules.oneOpenLoanPerBorrower} onChange={(value) => draft.set("oneOpenLoanPerBorrower", value)} />
            </SettingRow>
            <SettingRow label="Online application links work for" htmlFor={ids.link} description="The link sent to a client stops working after this, or as soon as they submit.">
              <NumberField id={ids.link} value={rules.onlineLinkValidHours} onChange={(value) => draft.set("onlineLinkValidHours", value)} min={SETTING_LIMITS.onlineLinkValidHours[0]} max={SETTING_LIMITS.onlineLinkValidHours[1]} unit="hours" />
            </SettingRow>
          </SettingsGroup>

          <SettingsGroup title="Payments" description="How money paid by a client is applied to what they owe.">
            <SettingRow label="A payment goes first to" htmlFor={ids.order} description="Money clears things in this order. It changes what is cleared first, not how much is owed.">
              <Select
                id={ids.order}
                value={orderKey(rules.paymentAllocationOrder)}
                onChange={(value) => draft.set("paymentAllocationOrder", value.split(">") as AllocationPart[])}
                options={[
                  // An order set some other way (e.g. by the server) is still shown, so the form never hides what's saved
                  ...(ALLOCATION_ORDERS.some((option) => orderKey(option.order) === orderKey(rules.paymentAllocationOrder)) ? [] : [{ value: orderKey(rules.paymentAllocationOrder), label: `Custom: ${rules.paymentAllocationOrder.join(", ")}` }]),
                  ...ALLOCATION_ORDERS.map((option) => ({ value: orderKey(option.order), label: option.label })),
                ]}
              />
            </SettingRow>
          </SettingsGroup>

          <SettingsGroup title="Portfolio health" description="What the dashboards compare against.">
            <SettingRow label="PAR30 target" htmlFor={ids.target} description="The share of money owed that may be more than 30 days late. Above this, the dashboard shows it in red.">
              <NumberField id={ids.target} value={rules.par30TargetPercent} onChange={(value) => draft.set("par30TargetPercent", value)} min={SETTING_LIMITS.par30TargetPercent[0]} max={SETTING_LIMITS.par30TargetPercent[1]} unit="%" />
            </SettingRow>
            <SettingRow label="Early warning from" htmlFor={ids.warning} description="Late loans show as warning signs on the dashboard from this day.">
              <NumberField id={ids.warning} value={rules.earlyWarningDays} onChange={(value) => draft.set("earlyWarningDays", value)} min={SETTING_LIMITS.earlyWarningDays[0]} max={SETTING_LIMITS.earlyWarningDays[1]} unit="days late" />
            </SettingRow>
          </SettingsGroup>

          <SettingsGroup title="Late loans">
            <SettingRow label="Show as seriously late after" htmlFor={ids.late} description="Late loans turn red from this day in lists and on the loan page.">
              <NumberField id={ids.late} value={rules.seriouslyLateDays} onChange={(value) => draft.set("seriouslyLateDays", value)} min={SETTING_LIMITS.seriouslyLateDays[0]} max={SETTING_LIMITS.seriouslyLateDays[1]} unit="days late" />
            </SettingRow>
            <SettingRow
              label="Recovery"
              description={
                rules.recoveryAfterDaysLate === null
                  ? "Off: loans only go to the recovery team when someone sends them."
                  : rules.recoveryMode === "auto"
                    ? "Loans this late go to the recovery team automatically, every day. Anyone with permission can still bring one back."
                    : "Loans this late are marked “Ready for recovery”. Someone with permission decides whether to send them."
              }
            >
              <Segmented
                label="Recovery"
                value={rules.recoveryAfterDaysLate === null ? "off" : rules.recoveryMode}
                onChange={(value) =>
                  draft.replace({ ...rules, recoveryAfterDaysLate: value === "off" ? null : (rules.recoveryAfterDaysLate ?? 60), recoveryMode: value === "off" ? rules.recoveryMode : value })
                }
                options={[
                  { value: "off", label: "Off" },
                  { value: "suggest", label: "Suggest" },
                  { value: "auto", label: "Send automatically" },
                ]}
              />
            </SettingRow>
            {rules.recoveryAfterDaysLate !== null && (
              <SettingRow label={rules.recoveryMode === "auto" ? "Send to recovery after" : "Suggest recovery after"} htmlFor={ids.recovery}>
                <NumberField id={ids.recovery} value={rules.recoveryAfterDaysLate} onChange={(value) => draft.set("recoveryAfterDaysLate", value)} min={SETTING_LIMITS.recoveryAfterDaysLate[0]} max={SETTING_LIMITS.recoveryAfterDaysLate[1]} unit="days late" />
              </SettingRow>
            )}
          </SettingsGroup>
        </>
      )}
    </SettingsForm>
  );
}

const REPAYMENT_METHODS: { value: PaymentMethod; label: string; description: string }[] = [
  { value: "MTN MoMo", label: "MTN Mobile Money", description: "Client sends to Tamu's MTN number" },
  { value: "Airtel Money", label: "Airtel Money", description: "Client sends to Tamu's Airtel number" },
  { value: "Cash", label: "Cash", description: "Paid to the loan officer or at the office" },
];

/** Settings → Payments: how repayments are recorded and how loans are paid out. */
export function PaymentsSection() {
  const { can } = useAuth();
  const draft = useSettingsDraft("payments");
  const backdateId = useId();
  const editId = useId();
  const payments = draft.values;
  const toggle = <T extends string>(list: T[], item: T, on: boolean) => (on ? [...list.filter((x) => x !== item), item] : list.filter((x) => x !== item));
  return (
    <SettingsForm
      title="Payments"
      subtitle="How repayments are recorded and how loans are paid out"
      draft={draft as never}
      canEdit={can("settings.payments")}
      validate={() =>
        payments!.repaymentMethods.length === 0
          ? "Accept at least one way to repay."
          : payments!.payoutMethods.length === 0
            ? "Choose at least one way to pay out."
            : outside(payments!.backdateDays, SETTING_LIMITS.backdateDays)
              ? `Back-dating: ${rangeText(SETTING_LIMITS.backdateDays, "days")}.`
              : outside(payments!.editWindowHours, SETTING_LIMITS.editWindowHours)
                ? `Time to change a payment: ${rangeText(SETTING_LIMITS.editWindowHours, "hours")}.`
                : null
      }
    >
      {payments && (
        <>
          <SettingsGroup title="Repayments" description="What staff can choose when they record a payment.">
            {REPAYMENT_METHODS.map((method) => (
              <SettingRow key={method.value} label={method.label} description={method.description}>
                <Switch
                  label={`Accept ${method.label}`}
                  checked={payments.repaymentMethods.includes(method.value)}
                  onChange={(on) => draft.set("repaymentMethods", toggle(payments.repaymentMethods, method.value, on))}
                />
              </SettingRow>
            ))}
            <SettingRow label="Mobile money transaction ID required" description="Staff must enter the transaction ID for every mobile money repayment, so it can be matched to the statement.">
              <Switch label="Transaction ID required" checked={payments.referenceRequired} onChange={(value) => draft.set("referenceRequired", value)} />
            </SettingRow>
            <SettingRow label="Payments can be dated up to" htmlFor={backdateId} description="For money received while staff were away from the system. 0 means today only.">
              <NumberField id={backdateId} value={payments.backdateDays} onChange={(value) => draft.set("backdateDays", value)} min={SETTING_LIMITS.backdateDays[0]} max={SETTING_LIMITS.backdateDays[1]} unit="days back" />
            </SettingRow>
            <SettingRow
              label="A payment's amount can be changed for"
              htmlFor={editId}
              description="By the person who recorded it, for a mistyped amount. Only the latest payment on a loan, and the old amount and the reason are kept. 0 means never."
            >
              <NumberField id={editId} value={payments.editWindowHours} onChange={(value) => draft.set("editWindowHours", value)} min={SETTING_LIMITS.editWindowHours[0]} max={SETTING_LIMITS.editWindowHours[1]} unit="hours" />
            </SettingRow>
          </SettingsGroup>

          <SettingsGroup title="Payouts" description="How approved loans are sent to clients. Each method needs a payout account in Business details.">
            {(["MTN MoMo", "Airtel Money"] as const).map((method) => (
              <SettingRow key={method} label={method === "MTN MoMo" ? "MTN Mobile Money" : "Airtel Money"}>
                <Switch label={`Pay out with ${method}`} checked={payments.payoutMethods.includes(method)} onChange={(on) => draft.set("payoutMethods", toggle(payments.payoutMethods, method, on))} />
              </SettingRow>
            ))}
          </SettingsGroup>
        </>
      )}
    </SettingsForm>
  );
}

/** Settings → Security & sign-in */
export function SecuritySection() {
  const { can } = useAuth();
  const draft = useSettingsDraft("security");
  const security = draft.values;
  const ids = { idle: useId(), nin: useId(), invite: useId(), fails: useId(), lockout: useId(), password: useId() };
  const fields = [
    ["idleTimeoutMinutes", "Sign-out time", "minutes"],
    ["nationalIdVisibleSeconds", "National ID display time", "seconds"],
    ["inviteValidHours", "Invite link lifetime", "hours"],
    ["maxFailedSignIns", "Failed sign-ins", "attempts"],
    ["lockoutMinutes", "Lockout", "minutes"],
    ["minPasswordLength", "Password length", "characters"],
  ] as const;
  return (
    <SettingsForm
      title="Security & sign-in"
      subtitle="Protects clients' data and Tamu's money"
      draft={draft as never}
      canEdit={can("settings.security")}
      validate={() => {
        const bad = fields.find(([key]) => outside(security![key], SETTING_LIMITS[key]));
        return bad ? `${bad[1]}: ${rangeText(SETTING_LIMITS[bad[0]], bad[2])}.` : null;
      }}
    >
      {security && (
        <>
          <SettingsGroup title="Sessions">
            <SettingRow label="Sign out after no activity for" htmlFor={ids.idle} description="An unattended screen locks itself. A warning shows one minute before.">
              <NumberField id={ids.idle} value={security.idleTimeoutMinutes} onChange={(value) => draft.set("idleTimeoutMinutes", value)} min={SETTING_LIMITS.idleTimeoutMinutes[0]} max={SETTING_LIMITS.idleTimeoutMinutes[1]} unit="minutes" />
            </SettingRow>
            <SettingRow label="Show a full National ID for" htmlFor={ids.nin} description="After this it's hidden again. Every reveal is logged.">
              <NumberField id={ids.nin} value={security.nationalIdVisibleSeconds} onChange={(value) => draft.set("nationalIdVisibleSeconds", value)} min={SETTING_LIMITS.nationalIdVisibleSeconds[0]} max={SETTING_LIMITS.nationalIdVisibleSeconds[1]} unit="seconds" />
            </SettingRow>
          </SettingsGroup>
          <SettingsGroup title="Sign-in">
            <SettingRow label="Lock an account after" htmlFor={ids.fails} description="Wrong passwords in a row. Protects against guessing.">
              <NumberField id={ids.fails} value={security.maxFailedSignIns} onChange={(value) => draft.set("maxFailedSignIns", value)} min={SETTING_LIMITS.maxFailedSignIns[0]} max={SETTING_LIMITS.maxFailedSignIns[1]} unit="failed attempts" />
            </SettingRow>
            <SettingRow label="Keep it locked for" htmlFor={ids.lockout} description="An admin can unlock it sooner.">
              <NumberField id={ids.lockout} value={security.lockoutMinutes} onChange={(value) => draft.set("lockoutMinutes", value)} min={SETTING_LIMITS.lockoutMinutes[0]} max={SETTING_LIMITS.lockoutMinutes[1]} unit="minutes" />
            </SettingRow>
            <SettingRow label="Passwords at least" htmlFor={ids.password} description="Long passwords are the strongest protection. Common and leaked passwords are always refused.">
              <NumberField id={ids.password} value={security.minPasswordLength} onChange={(value) => draft.set("minPasswordLength", value)} min={SETTING_LIMITS.minPasswordLength[0]} max={SETTING_LIMITS.minPasswordLength[1]} unit="characters" />
            </SettingRow>
            <SettingRow label="Invite links work for" htmlFor={ids.invite} description="New staff set their password from this link. It works once.">
              <NumberField id={ids.invite} value={security.inviteValidHours} onChange={(value) => draft.set("inviteValidHours", value)} min={SETTING_LIMITS.inviteValidHours[0]} max={SETTING_LIMITS.inviteValidHours[1]} unit="hours" />
            </SettingRow>
          </SettingsGroup>
        </>
      )}
    </SettingsForm>
  );
}

/** Settings → Business details: who Tamu is, on forms, agreements and payouts. */
export function BusinessSection() {
  const { can } = useAuth();
  const draft = useSettingsDraft("business");
  const business = draft.values;
  const ids = { name: useId(), short: useId(), address: useId(), phone: useId(), email: useId() };
  const text = (key: "name" | "shortName" | "address" | "phone" | "email", id: string, props: { inputMode?: "tel" | "email"; maxLength: number }) => (
    <input id={id} className={styles.textInput} value={business![key]} onChange={(event) => draft.set(key, event.target.value)} autoComplete="off" {...props} />
  );
  const setAccount = (index: number, changes: Partial<PayoutAccount>) => draft.set("payoutAccounts", business!.payoutAccounts.map((account, i) => (i === index ? { ...account, ...changes } : account)));
  return (
    <SettingsForm
      title="Business details"
      subtitle="Shown on the online application, agreements and messages to clients"
      draft={draft as never}
      canEdit={can("settings.business")}
      validate={() =>
        business!.name.trim().length < 3
          ? "Enter the business name."
          : business!.shortName.trim().length < 2
            ? "Enter a short name."
            : !EMAIL_PATTERN.test(business!.email)
              ? "Enter a valid email address."
              : business!.payoutAccounts.length === 0
                ? "Add at least one payout account."
                : business!.payoutAccounts.some((account) => !normalisePhone(account.number) || !account.accountName.trim())
                  ? "Each payout account needs a valid mobile money number and name."
                  : business!.branches.length === 0 || business!.branches.some((market) => market.name.trim().length < 2)
                    ? "Add at least one market, each with a name."
                    : null
      }
    >
      {business && (
        <>
          <SettingsGroup title="Business">
            <SettingRow label="Legal name" htmlFor={ids.name} description="As on loan agreements and guarantor forms.">
              {text("name", ids.name, { maxLength: 80 })}
            </SettingRow>
            <SettingRow label="Short name" htmlFor={ids.short} description="In messages and on the online form, e.g. “Tamu”.">
              {text("shortName", ids.short, { maxLength: 30 })}
            </SettingRow>
            <SettingRow label="Address" htmlFor={ids.address}>
              {text("address", ids.address, { maxLength: 120 })}
            </SettingRow>
            <SettingRow label="Phone" htmlFor={ids.phone} description="Clients call this with questions.">
              {text("phone", ids.phone, { inputMode: "tel", maxLength: 20 })}
            </SettingRow>
            <SettingRow label="Email" htmlFor={ids.email}>
              {text("email", ids.email, { inputMode: "email", maxLength: 80 })}
            </SettingRow>
          </SettingsGroup>

          <SettingsGroup title="Payout accounts" description="Tamu's mobile money accounts that loans are sent from. Finance sees these when paying out.">
            {business.payoutAccounts.map((account, index) => (
              <div key={index} className={styles.accountRow}>
                <Select
                  aria-label="Method"
                  className={styles.accountMethod}
                  value={account.method}
                  onChange={(method) => setAccount(index, { method })}
                  options={[
                    { value: "MTN MoMo", label: "MTN MoMo" },
                    { value: "Airtel Money", label: "Airtel Money" },
                  ]}
                />
                <input className={styles.textInput} aria-label="Mobile money number" inputMode="tel" value={account.number} onChange={(event) => setAccount(index, { number: event.target.value })} placeholder="0772 123 456" />
                <input className={styles.textInput} aria-label="Account name" value={account.accountName} onChange={(event) => setAccount(index, { accountName: event.target.value })} placeholder="Name on the account" />
                <button
                  type="button"
                  className={styles.iconButton}
                  aria-label={`Remove the ${account.method} account ${account.number}`}
                  onClick={() => draft.set("payoutAccounts", business.payoutAccounts.filter((_, i) => i !== index))}
                >
                  <Icon name="close" size={16} strokeWidth={2} />
                </button>
              </div>
            ))}
            <button type="button" className={styles.addButton} onClick={() => draft.set("payoutAccounts", [...business.payoutAccounts, { method: "MTN MoMo", number: "", accountName: business.name }])}>
              + Add payout account
            </button>
          </SettingsGroup>

          <SettingsGroup title="Markets" description="Where Tamu works, e.g. Kampala Central or Mbarara. Each user belongs to one; choose it when inviting them.">
            {business.branches.map((market, index) => (
              <div key={market.id ?? `new-${index}`} className={styles.marketRow}>
                <input
                  className={styles.textInput}
                  aria-label={`Market ${index + 1}`}
                  value={market.name}
                  maxLength={40}
                  // Renaming keeps the market's id, so the people in it stay in it
                  onChange={(event) => draft.set("branches", business.branches.map((existing, i) => (i === index ? { ...existing, name: event.target.value } : existing)))}
                  placeholder="Market name"
                />
                <button type="button" className={styles.iconButton} aria-label={`Remove the ${market.name || "new"} market`} onClick={() => draft.set("branches", business.branches.filter((_, i) => i !== index))}>
                  <Icon name="close" size={16} strokeWidth={2} />
                </button>
              </div>
            ))}
            <button type="button" className={styles.addButton} onClick={() => draft.set("branches", [...business.branches, { id: null, name: "" }])}>
              + Add market
            </button>
          </SettingsGroup>
        </>
      )}
    </SettingsForm>
  );
}
