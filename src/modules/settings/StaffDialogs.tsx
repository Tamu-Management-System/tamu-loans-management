import { useId, useState } from "react";
import { ApiError } from "../../api/client";
import { useCancelInvite, useChangeStaffBranch, useChangeStaffRole, useDeactivateStaff, useInviteStaff, useReactivateStaff, useSystemSettings } from "../../api/settings";
import type { Market, RoleSummary, StaffMember } from "../../api/types";
import { Dialog, Field } from "../../components/ui/Dialog";
import { SEARCH_FROM, Select } from "../../components/ui/Select";
import { useToast } from "../../components/ui/Toast";
import { normalisePhone } from "../../lib/phone";
import { DATA_SCOPES, permissionInfo } from "../../auth/permissions";
import styles from "./Settings.module.css";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const errorMessage = (error: unknown) => (error instanceof ApiError ? error.message : error ? "That didn't go through. Try again." : null);
const marketOptions = (markets: Market[] = []) => markets.flatMap((market) => (market.id ? [{ value: market.id, label: market.name }] : []));

const roleOptions = (roles: RoleSummary[]) => roles.map((role) => ({ value: role.id, label: role.builtIn ? role.name : `${role.name} (custom)` }));

/** The role's description, and the sensitive things it allows */
function RoleHint({ role }: { role: RoleSummary | undefined }) {
  if (!role) return null;
  const sensitive = role.permissions.filter((permission) => permissionInfo(permission).sensitive);
  return (
    <>
      {role.description} Sees {DATA_SCOPES.find((scope) => scope.value === role.dataScope)!.label.toLowerCase()}.
      {sensitive.length > 0 && <span className={styles.hintSensitive}> Can {sensitive.map((permission) => permissionInfo(permission).label.toLowerCase()).join(", ")}.</span>}
    </>
  );
}

/** Invite a member of staff: they get a one-time link by email and set their own password. */
export function InviteStaffDialog({ roles, onClose, onInvited }: { roles: RoleSummary[]; onClose: () => void; onInvited: () => void }) {
  const ids = { name: useId(), email: useId(), phone: useId(), role: useId(), market: useId() };
  const showToast = useToast();
  const invite = useInviteStaff();
  const { data: settings } = useSystemSettings();
  const [form, setForm] = useState({ name: "", email: "", phone: "", roleId: "", branchId: "" });
  const [touched, setTouched] = useState(false);
  const markets = marketOptions(settings?.business.branches);
  // With a single market there's nothing to choose
  const branchId = form.branchId || (markets.length === 1 ? markets[0].value : "");

  const name = form.name.trim().replace(/\s+/g, " ");
  const email = form.email.trim().toLowerCase();
  const phone = normalisePhone(form.phone);
  const problems = {
    name: name.length < 3 ? "Enter their full name." : null,
    email: !EMAIL_PATTERN.test(email) ? "Enter a valid email address." : null,
    phone: !phone ? "Enter a Ugandan mobile number, e.g. 0772 123 456." : null,
    roleId: !form.roleId ? "Choose a role." : null,
    branchId: !branchId ? "Choose the market they work in." : null,
  };
  const valid = Object.values(problems).every((problem) => !problem);
  const show = (key: keyof typeof problems) => (touched ? problems[key] : null);
  const set = (key: keyof typeof form) => (value: string) => setForm((current) => ({ ...current, [key]: value }));

  const submit = () => {
    setTouched(true);
    if (!valid) return;
    invite
      .mutateAsync({ name, email, phone: phone!, roleId: form.roleId, branchId })
      .then(() => {
        showToast({ message: `Invite sent to ${email}.` });
        onInvited();
        onClose();
      })
      .catch(() => undefined /* shown in the dialog */);
  };

  return (
    <Dialog title="Invite user" subtitle="They'll get an email to set their own password" submitLabel="Send invite" submittingLabel="Sending…" submitting={invite.isPending} error={errorMessage(invite.error)} onSubmit={submit} onClose={onClose}>
      <Field label="Full name" htmlFor={ids.name} hint={show("name")}>
        <input id={ids.name} value={form.name} onChange={(event) => set("name")(event.target.value)} autoComplete="off" autoFocus aria-invalid={!!show("name")} />
      </Field>
      <Field label="Work email" htmlFor={ids.email} hint={show("email")}>
        <input id={ids.email} type="email" value={form.email} onChange={(event) => set("email")(event.target.value)} autoComplete="off" aria-invalid={!!show("email")} />
      </Field>
      <Field label="Phone" htmlFor={ids.phone} hint={show("phone")}>
        <input id={ids.phone} inputMode="tel" value={form.phone} onChange={(event) => set("phone")(event.target.value)} placeholder="0772 123 456" autoComplete="off" aria-invalid={!!show("phone")} />
      </Field>
      <Field label="Role" htmlFor={ids.role} hint={show("roleId") ?? <RoleHint role={roles.find((role) => role.id === form.roleId)} />}>
        <Select id={ids.role} value={form.roleId} onChange={set("roleId")} options={roleOptions(roles)} placeholder="Choose a role" />
      </Field>
      <Field label="Market" htmlFor={ids.market} hint={show("branchId") ?? "Where they work. Admins add markets in Business details."}>
        <Select id={ids.market} value={branchId} onChange={set("branchId")} options={markets} placeholder="Choose a market" />
      </Field>
      <p className={styles.dialogNote}>The link works once, for {settings?.security.inviteValidHours ?? 48} hours. Nobody else sees their password, not even admins.</p>
    </Dialog>
  );
}

/** Change someone's role (shows what they gain and lose) or the market they work in. */
export function ChangeRoleDialog({ member, roles, onClose }: { member: StaffMember; roles: RoleSummary[]; onClose: () => void }) {
  const roleId = useId();
  const marketId = useId();
  const showToast = useToast();
  const change = useChangeStaffRole();
  const move = useChangeStaffBranch();
  const { data: settings } = useSystemSettings();
  const [chosen, setChosen] = useState(member.role.id);
  const [market, setMarket] = useState(member.branchId);
  const roleChanged = chosen !== member.role.id;
  const marketChanged = market !== member.branchId;
  const current = roles.find((role) => role.id === member.role.id);
  const next = roles.find((role) => role.id === chosen);
  const gains = next && current ? next.permissions.filter((p) => !current.permissions.includes(p)) : [];
  const losses = next && current ? current.permissions.filter((p) => !next.permissions.includes(p)) : [];
  const scopeChange = next && current && next.dataScope !== current.dataScope ? DATA_SCOPES.find((scope) => scope.value === next.dataScope)!.label.toLowerCase() : null;
  const list = (permissions: typeof gains) => permissions.map((p) => permissionInfo(p).label.toLowerCase()).join(", ");

  const submit = async () => {
    try {
      if (roleChanged) await change.mutateAsync({ staffId: member.id, roleId: chosen });
      if (marketChanged) await move.mutateAsync({ staffId: member.id, branchId: market });
      const done = [roleChanged && `is now ${next?.name ?? "in their new role"}`, marketChanged && `works in ${marketOptions(settings?.business.branches).find((option) => option.value === market)?.label ?? "the new market"}`].filter(Boolean).join(" and ");
      showToast({ message: `${member.name} ${done}.` });
      onClose();
    } catch {
      // shown in the dialog
    }
  };

  return (
    <Dialog
      title={`Change ${member.name}'s role or market`}
      subtitle={`Now: ${member.role.name} · ${member.branch}`}
      submitLabel="Save changes"
      submitting={change.isPending || move.isPending}
      submitDisabled={!roleChanged && !marketChanged}
      error={errorMessage(change.error ?? move.error)}
      onSubmit={submit}
      onClose={onClose}
    >
      <Field label="Role" htmlFor={roleId} hint={<RoleHint role={next} />}>
        <Select id={roleId} value={chosen} onChange={setChosen} options={roleOptions(roles)} autoFocus />
      </Field>
      <Field label="Market" htmlFor={marketId}>
        <Select id={marketId} value={market} onChange={setMarket} options={marketOptions(settings?.business.branches ?? [{ id: member.branchId, name: member.branch }])} />
      </Field>
      {(gains.length > 0 || losses.length > 0 || scopeChange) && (
        <div className={styles.changes} aria-label="What changes">
          {gains.length > 0 && (
            <p>
              <b>Will be able to:</b> {list(gains)}
            </p>
          )}
          {scopeChange && (
            <p>
              <b>Will see:</b> {scopeChange}
            </p>
          )}
          {losses.length > 0 && (
            <p>
              <b>Won't be able to:</b> {list(losses)}
            </p>
          )}
        </div>
      )}
      <p className={styles.dialogNote}>It applies straight away, from their next click.</p>
    </Dialog>
  );
}

/**
 * Switch an account off. It's never deleted: their name stays on everything they did. If they
 * look after clients, someone else must take them over first.
 */
export function DeactivateStaffDialog({ member, staff, roles, onClose }: { member: StaffMember; staff: StaffMember[]; roles: RoleSummary[]; onClose: () => void }) {
  const ids = { reassign: useId(), reason: useId() };
  const showToast = useToast();
  const deactivate = useDeactivateStaff();
  const [reassignTo, setReassignTo] = useState("");
  const [reason, setReason] = useState("");
  const { portfolio } = member;
  const needsReassign = portfolio.borrowers > 0;
  // Someone active whose role looks after their own clients
  const takers = staff.filter((other) => {
    const role = roles.find((r) => r.id === other.role.id);
    return other.id !== member.id && other.status === "active" && role?.dataScope === "own" && role.permissions.includes("loans.view");
  });
  const taker = takers.find((other) => other.id === reassignTo);
  const ready = !!reason.trim() && (!needsReassign || !!taker);

  const submit = () => {
    if (!ready) return;
    deactivate
      .mutateAsync({ staffId: member.id, reassignTo: needsReassign ? reassignTo : null, reason: reason.trim() })
      .then(() => {
        showToast({ message: `${member.name}'s account is switched off${taker ? `; ${taker.name} now looks after their borrowers` : ""}.` });
        onClose();
      })
      .catch(() => undefined);
  };

  const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;
  return (
    <Dialog
      title={`Switch off ${member.name}'s account`}
      subtitle={`${member.role.name} · ${member.email}`}
      submitLabel="Switch off account"
      submittingLabel="Switching off…"
      submitting={deactivate.isPending}
      submitDisabled={!ready}
      error={errorMessage(deactivate.error)}
      onSubmit={submit}
      onClose={onClose}
    >
      <ul className={styles.consequences}>
        <li>They're signed out everywhere straight away and can't sign in again.</li>
        <li>Nothing is deleted: their name stays on the loans, payments and records they worked on.</li>
      </ul>
      {needsReassign && (
        <Field
          label="Who looks after their clients now?"
          htmlFor={ids.reassign}
          hint={`${plural(portfolio.borrowers, "client")}, ${plural(portfolio.activeLoans, "active loan")} and ${plural(portfolio.openApplications, "open application")} move to them.`}
        >
          <Select
            id={ids.reassign}
            value={reassignTo}
            onChange={setReassignTo}
            options={takers.map((other) => ({ value: other.id, label: `${other.name} · ${other.portfolio.borrowers} clients` }))}
            placeholder={takers.length ? "Choose a loan officer" : "No other loan officers"}
            searchable={takers.length > SEARCH_FROM}
            searchPlaceholder="Search officers"
            disabled={takers.length === 0}
            autoFocus
          />
        </Field>
      )}
      <Field label="Reason" htmlFor={ids.reason} hint="Kept in the audit log.">
        <input id={ids.reason} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="e.g. Left Tamu on 31 October" autoComplete="off" autoFocus={!needsReassign} />
      </Field>
    </Dialog>
  );
}

/** Cancel an invite that hasn't been used (e.g. a wrong email address). */
export function CancelInviteDialog({ member, onClose }: { member: StaffMember; onClose: () => void }) {
  const showToast = useToast();
  const cancel = useCancelInvite();
  const submit = () =>
    cancel
      .mutateAsync(member.id)
      .then(() => {
        showToast({ message: `${member.name}'s invite is cancelled.` });
        onClose();
      })
      .catch(() => undefined);
  return (
    <Dialog title={`Cancel ${member.name}'s invite?`} subtitle={member.email} submitLabel="Cancel invite" submittingLabel="Cancelling…" cancelLabel="Keep invite" submitting={cancel.isPending} error={errorMessage(cancel.error)} onSubmit={submit} onClose={onClose}>
      <p className={styles.dialogText}>The link in their email stops working. You can invite them again later.</p>
    </Dialog>
  );
}

/** Turn a switched-off account back on: they get a fresh invite and set a new password. */
export function ReactivateStaffDialog({ member, onClose, onReactivated }: { member: StaffMember; onClose: () => void; onReactivated: () => void }) {
  const showToast = useToast();
  const reactivate = useReactivateStaff();
  const submit = () =>
    reactivate
      .mutateAsync(member.id)
      .then(() => {
        showToast({ message: `Invite sent to ${member.email}.` });
        onReactivated();
        onClose();
      })
      .catch(() => undefined);
  return (
    <Dialog title={`Turn ${member.name}'s account back on?`} subtitle={`${member.role.name} · ${member.email}`} submitLabel="Send invite" submittingLabel="Sending…" submitting={reactivate.isPending} error={errorMessage(reactivate.error)} onSubmit={submit} onClose={onClose}>
      <p className={styles.dialogText}>
        They'll get a new invite by email and set a new password; their old password never works again. Their role stays <b>{member.role.name}</b>, which you can change once they're back.
      </p>
    </Dialog>
  );
}
