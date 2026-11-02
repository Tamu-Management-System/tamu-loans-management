// Staff accounts for Settings → Users. The three demo sign-in accounts are part of the list
// (the same objects, so a role change applies to their next request), plus the other officers,
// an open invite and someone who has left.
import { officers, users, type MockUser } from "./fixtures";
import { borrowers } from "./borrowerDirectory";

export interface MockStaff extends MockUser {
  phone: string;
  status: "active" | "invited" | "deactivated";
  lastSignInAt: string | null;
  invite: { sentAt: string; expiresAt: string } | null;
  deactivated: { at: string; by: string } | null;
}

/** An invite link works once, for this long */
export const INVITE_VALID_HOURS = 48;

const hoursAgo = (hours: number) => new Date(Date.now() - hours * 3_600_000).toISOString();
const inviteSentHoursAgo = (hours: number) => ({ sentAt: hoursAgo(hours), expiresAt: hoursAgo(hours - INVITE_VALID_HOURS) });

const DEMO_DETAILS: Record<string, Pick<MockStaff, "phone" | "lastSignInAt">> = {
  "u-sharon": { phone: "0772 104 662", lastSignInAt: hoursAgo(0.5) },
  "u-martin": { phone: "0782 330 915", lastSignInAt: hoursAgo(3) },
  "u-moses": { phone: "0701 845 270", lastSignInAt: hoursAgo(1) },
};
const OFFICER_DETAILS: Record<string, { email: string; phone: string; lastSignInHoursAgo: number }> = {
  "u-joel": { email: "joel@tamu.example", phone: "0756 410 228", lastSignInHoursAgo: 2 },
  "u-sarah": { email: "sarah@tamu.example", phone: "0774 902 513", lastSignInHoursAgo: 5 },
  "u-peter": { email: "peter@tamu.example", phone: "0703 228 194", lastSignInHoursAgo: 26 },
  "u-ruth": { email: "ruth@tamu.example", phone: "0789 615 340", lastSignInHoursAgo: 50 },
};

export const staff: MockStaff[] = [
  ...users.map((user) => Object.assign(user, { status: "active" as const, invite: null, deactivated: null, ...DEMO_DETAILS[user.id] })),
  ...officers
    .filter((officer) => !users.some((user) => user.id === officer.id))
    .map((officer) => {
      const details = OFFICER_DETAILS[officer.id];
      return {
        id: officer.id,
        name: officer.name,
        email: details.email,
        phone: details.phone,
        photoUrl: officer.photoUrl,
        branch: "Kampala Central",
        roleId: "loan_officer",
        status: "active" as const,
        lastSignInAt: hoursAgo(details.lastSignInHoursAgo),
        invite: null,
        deactivated: null,
      };
    }),
  {
    id: "u-grace",
    name: "Grace Namutebi",
    email: "grace@tamu.example",
    phone: "0752 318 406",
    photoUrl: null,
    branch: "Kampala Central",
    roleId: "finance",
    status: "invited",
    lastSignInAt: null,
    invite: inviteSentHoursAgo(20),
    deactivated: null,
  },
  {
    id: "u-ivan",
    name: "Ivan Kasozi",
    email: "ivan@tamu.example",
    phone: "0778 640 152",
    photoUrl: null,
    branch: "Kampala Central",
    roleId: "role-recovery",
    status: "invited",
    lastSignInAt: null,
    // Not opened in time: the admin can send a new one
    invite: inviteSentHoursAgo(80),
    deactivated: null,
  },
  {
    id: "u-david",
    name: "David Kato",
    email: "david@tamu.example",
    phone: "0711 502 937",
    photoUrl: null,
    branch: "Kampala Central",
    roleId: "loan_officer",
    status: "deactivated",
    lastSignInAt: hoursAgo(24 * 74),
    invite: null,
    deactivated: { at: hoursAgo(24 * 73), by: "Martin Ssempa" },
  },
];

export const findStaff = (id: string) => staff.find((member) => member.id === id);

export const inviteExpired = (member: MockStaff) => !!member.invite && new Date(member.invite.expiresAt).getTime() < Date.now();

/** The borrowers someone looks after, with their open loans and applications */
export function portfolioOf(staffId: string) {
  const own = borrowers.filter((borrower) => borrower.officerId === staffId);
  return { borrowers: own.length, activeLoans: own.filter((b) => b.currentLoanId).length, openApplications: own.filter((b) => b.applicationId).length };
}

export const nextStaffId = () => `u-${Date.now().toString(36)}`;
