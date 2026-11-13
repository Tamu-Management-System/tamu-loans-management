import { useId, useState } from "react";
import { useResendInvite, useRoles, useStaff } from "../../api/settings";
import type { RoleSummary, StaffMember, StaffStatus } from "../../api/types";
import { useAuth } from "../../auth/AuthContext";
import type { Permission } from "../../auth/permissions";
import { Avatar } from "../../components/ui/Avatar";
import { Button } from "../../components/ui/Button";
import { Icon } from "../../components/ui/Icon";
import { useToast } from "../../components/ui/Toast";
import { formatDate, formatRelativeDay } from "../../lib/format";
import { CancelInviteDialog, ChangeRoleDialog, DeactivateStaffDialog, InviteStaffDialog, ReactivateStaffDialog } from "./StaffDialogs";
import styles from "./Settings.module.css";

const STATUS_TABS: { value: StaffStatus; label: string }[] = [
  { value: "active", label: "Active" },
  { value: "invited", label: "Invited" },
  { value: "deactivated", label: "Switched off" },
];

type OpenDialog = { kind: "invite" } | { kind: "role" | "deactivate" | "cancel-invite" | "reactivate"; member: StaffMember } | null;

/** Settings → Users: everyone who can sign in, open invites and switched-off accounts. */
export function UsersSection() {
  const { user, can } = useAuth();
  const canManage = can("users.manage");
  const searchId = useId();
  const showToast = useToast();
  const { data: staff, isPending, isError, refetch } = useStaff();
  const { data: roles = [] } = useRoles();
  const resend = useResendInvite();
  const [status, setStatus] = useState<StaffStatus>("active");
  const [query, setQuery] = useState("");
  const [dialog, setDialog] = useState<OpenDialog>(null);

  const needle = query.trim().toLowerCase();
  const digits = needle.replace(/\D/g, "");
  const shown = (staff ?? []).filter(
    (member) =>
      member.status === status &&
      (!needle || member.name.toLowerCase().includes(needle) || member.email.toLowerCase().includes(needle) || (digits.length >= 3 && member.phone.replace(/\D/g, "").includes(digits))),
  );
  const count = (value: StaffStatus) => staff?.filter((member) => member.status === value).length ?? 0;

  const resendInvite = (member: StaffMember) =>
    resend
      .mutateAsync(member.id)
      .then(() => showToast({ message: `New invite sent to ${member.email}. The old link no longer works.` }))
      .catch(() => showToast({ message: "The invite couldn't be sent. Try again." }));

  return (
    <section aria-labelledby="users-heading">
      <div className={styles.sectionHeader}>
        <div>
          <h2 id="users-heading">Users</h2>
          <p className={styles.subtitle}>People who can sign in to Tamu Loans</p>
        </div>
        {canManage && <Button onClick={() => setDialog({ kind: "invite" })}>Invite user</Button>}
      </div>

      {staff && <TwoPersonWarnings staff={staff} roles={roles} />}

      <div className={`${styles.card} ${styles.usersCard}`}>
        <div className={styles.toolbar}>
          <div className={styles.pills} role="group" aria-label="Status">
            {STATUS_TABS.map((tab) => (
              <button key={tab.value} type="button" aria-pressed={status === tab.value} onClick={() => setStatus(tab.value)}>
                {tab.label}
                <span className={styles.pillCount}>{count(tab.value)}</span>
              </button>
            ))}
          </div>
          <label className={styles.search} htmlFor={searchId}>
            <Icon name="search" size={17} strokeWidth={1.8} />
            <input id={searchId} type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, email or phone" aria-label="Search users by name, email or phone" autoComplete="off" />
          </label>
        </div>

        {isError ? (
          <p className={styles.message} role="alert">
            Users couldn't load.{" "}
            <button type="button" className={styles.linkButton} onClick={() => refetch()}>
              Try again
            </button>
          </p>
        ) : isPending ? (
          <div className={styles.loading} aria-busy="true" aria-label="Loading users" />
        ) : shown.length === 0 ? (
          <p className={styles.message}>{needle ? "No one matches that search." : status === "invited" ? "No open invites." : status === "deactivated" ? "No switched-off accounts." : "No users yet."}</p>
        ) : (
          <table className={`${styles.table} ${styles.usersTable}`}>
            <thead>
              <tr>
                <th>NAME</th>
                <th>ROLE</th>
                {status !== "active" && <th>{status === "invited" ? "INVITE" : "SWITCHED OFF"}</th>}
                <th className={styles.actionsHeading}>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {shown.map((member) => {
                const isYou = member.id === user.id;
                return (
                  <tr key={member.id}>
                    <td>
                      <span className={styles.person}>
                        <Avatar name={member.name} src={member.photoUrl} size={36} />
                        <span className={styles.personText}>
                          <b>
                            {member.name}
                            {isYou && <span className={styles.youTag}>You</span>}
                          </b>
                          <span className={styles.secondary}>{member.email}</span>
                        </span>
                      </span>
                    </td>
                    <td className={styles.role}>
                      <span className={styles.roleName}>{member.role.name}</span>
                      <span className={styles.secondary}>
                        {member.branch} · {member.phone}
                      </span>
                    </td>
                    {status !== "active" && (
                      <td className={styles.when}>
                        <StatusDetail member={member} />
                      </td>
                    )}
                    <td className={styles.actions}>
                      {!canManage ? null : isYou ? (
                        <span className={styles.secondary}>Ask another admin to change your account</span>
                      ) : member.status === "active" ? (
                        <>
                          <button type="button" className={styles.textButton} onClick={() => setDialog({ kind: "role", member })} aria-label={`Change ${member.name}'s role or market`}>
                            Role & market
                          </button>
                          <button type="button" className={`${styles.textButton} ${styles.textButtonDanger}`} onClick={() => setDialog({ kind: "deactivate", member })} aria-label={`Switch off ${member.name}'s account`}>
                            Switch off
                          </button>
                        </>
                      ) : member.status === "invited" ? (
                        <>
                          <button type="button" className={styles.textButton} onClick={() => resendInvite(member)} disabled={resend.isPending} aria-label={`Send ${member.name} a new invite`}>
                            Resend invite
                          </button>
                          <button type="button" className={`${styles.textButton} ${styles.textButtonDanger}`} onClick={() => setDialog({ kind: "cancel-invite", member })} aria-label={`Cancel ${member.name}'s invite`}>
                            Cancel
                          </button>
                        </>
                      ) : (
                        <button type="button" className={styles.textButton} onClick={() => setDialog({ kind: "reactivate", member })} aria-label={`Turn ${member.name}'s account back on`}>
                          Turn back on
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {dialog?.kind === "invite" && <InviteStaffDialog roles={roles} onClose={() => setDialog(null)} onInvited={() => setStatus("invited")} />}
      {dialog?.kind === "role" && <ChangeRoleDialog member={dialog.member} roles={roles} onClose={() => setDialog(null)} />}
      {dialog?.kind === "deactivate" && <DeactivateStaffDialog member={dialog.member} staff={staff ?? []} roles={roles} onClose={() => setDialog(null)} />}
      {dialog?.kind === "cancel-invite" && <CancelInviteDialog member={dialog.member} onClose={() => setDialog(null)} />}
      {dialog?.kind === "reactivate" && <ReactivateStaffDialog member={dialog.member} onClose={() => setDialog(null)} onReactivated={() => setStatus("invited")} />}
    </section>
  );
}

/** "2 days", "5 hours" (rounded up) until a future time */
function timeLeft(iso: string) {
  const hours = Math.max(1, Math.ceil((new Date(iso).getTime() - Date.now()) / 3_600_000));
  const [count, unit] = hours >= 24 ? [Math.floor(hours / 24), "day"] : [hours, "hour"];
  return `${count} ${unit}${count === 1 ? "" : "s"}`;
}

function StatusDetail({ member }: { member: StaffMember }) {
  if (member.status === "invited" && member.invite) {
    if (member.invite.expired)
      return (
        <>
          <span className={`${styles.chip} ${styles.chipWarning}`}>Link expired</span>
          <span className={styles.secondary}>Sent {formatDate(member.invite.sentAt)}</span>
        </>
      );
    return (
      <>
        Sent {formatRelativeDay(member.invite.sentAt)}
        <span className={styles.secondary}>Link expires in {timeLeft(member.invite.expiresAt)}</span>
      </>
    );
  }
  if (member.status === "deactivated" && member.deactivated)
    return (
      <>
        {formatDate(member.deactivated.at)}
        <span className={styles.secondary}>by {member.deactivated.by}</span>
      </>
    );
  return null;
}

/**
 * The two-person rules (the creator can't approve, the approver can't pay out) need at least two
 * active people who can approve and two who can pay out, or loans get stuck.
 */
function TwoPersonWarnings({ staff, roles }: { staff: StaffMember[]; roles: RoleSummary[] }) {
  const holders = (permission: Permission) =>
    staff.filter((member) => member.status === "active" && roles.find((role) => role.id === member.role.id)?.permissions.includes(permission));
  const approvers = holders("applications.approve");
  const payers = holders("loans.disburse");
  if (roles.length === 0 || (approvers.length >= 2 && payers.length >= 2)) return null;
  const who = (people: StaffMember[]) => (people.length === 0 ? "Nobody" : `Only ${people[0].name}`);
  const problem =
    approvers.length < 2 && payers.length < 2 && who(approvers) === who(payers)
      ? `${who(approvers)} can approve and pay out loans.`
      : [approvers.length < 2 && `${who(approvers)} can approve loans.`, payers.length < 2 && `${who(payers)} can pay out loans.`].filter(Boolean).join(" ");
  return (
    <div className={styles.warning} role="note">
      <Icon name="warning" size={17} strokeWidth={1.9} />
      <p>
        <b>{problem}</b> Approving and paying out need two different people, so give someone else a role that can.
      </p>
    </div>
  );
}
