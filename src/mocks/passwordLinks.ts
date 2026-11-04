// Invite and password-reset links (demo). The real backend emails the person a link and stores only a hash of its
// token. There is no email here, so the demo server prints the link in the browser console instead (see
// `sendDemoEmail`); links are kept in localStorage so one opened in another tab of the same browser still works.
// None of this runs in production builds.
const STORAGE_KEY = "tamu-demo-password-links";

export interface MockPasswordLink {
  /** A plain random token (nothing is encoded in it), like the real one */
  token: string;
  staffId: string;
  name: string;
  email: string;
  purpose: "invite" | "reset";
  createdAt: string;
  expiresAt: string;
  /** open: waiting; used: the password is set; revoked: replaced by a newer link or cancelled */
  status: "open" | "used" | "revoked";
}

function load(): MockPasswordLink[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]") as MockPasswordLink[];
  } catch {
    return [];
  }
}

function save(links: MockPasswordLink[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(links));
  } catch {
    /* storage full or blocked: the demo just can't remember the link */
  }
}

const randomToken = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

/** A new link for someone; any earlier open link for them stops working. */
export function createPasswordLink(person: { id: string; name: string; email: string }, purpose: MockPasswordLink["purpose"], validHours: number) {
  const now = Date.now();
  const link: MockPasswordLink = {
    token: randomToken(),
    staffId: person.id,
    name: person.name,
    email: person.email,
    purpose,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + validHours * 3_600_000).toISOString(),
    status: "open",
  };
  save([...load().map((existing) => (existing.staffId === person.id && existing.status === "open" ? { ...existing, status: "revoked" as const } : existing)), link]);
  return link;
}

export const findPasswordLink = (token: string) => load().find((link) => link.token === token);

export function markPasswordLinkUsed(token: string) {
  save(load().map((link) => (link.token === token ? { ...link, status: "used" as const } : link)));
}

/** Cancelling an invite (or switching someone off) ends their open links. */
export function revokePasswordLinks(staffId: string) {
  save(load().map((link) => (link.staffId === staffId && link.status === "open" ? { ...link, status: "revoked" as const } : link)));
}

/** Why a link can't be used, or null if it can. */
export function passwordLinkProblem(link: MockPasswordLink | undefined): "invalid" | "used" | "replaced" | "expired" | null {
  if (!link) return "invalid";
  if (link.status === "used") return "used";
  if (link.status === "revoked") return "replaced";
  if (new Date(link.expiresAt).getTime() <= Date.now()) return "expired";
  return null;
}

/** The demo's stand-in for sending an email: prints what the person would receive. */
export function sendDemoEmail(link: MockPasswordLink) {
  const url = `${location.origin}/set-password/${link.token}`;
  console.info(`[demo email] To ${link.email}: ${link.purpose === "invite" ? "you're invited to Tamu Loans. Set your password" : "reset your Tamu Loans password"} here (works once): ${url}`);
}

/**
 * Sample links, like the sample accounts, so every version of the "Set your password" screen can be opened in any
 * browser without sending an invite first. They exist in every browser that loads the demo; an expired one stays
 * expired, and a valid one is renewed when it runs out. (Real links are random and only exist in the database.)
 */
const DEMO_LINKS: { token: string; staffId: string; name: string; email: string; purpose: MockPasswordLink["purpose"]; state: "valid" | "expired" | "used" }[] = [
  { token: "lF9s8BLc0oh5BgGK4oLFQmXQB7y7rurvQWwqPSmVSSs", staffId: "u-grace", name: "Grace Namutebi", email: "grace@tamu.example", purpose: "invite", state: "valid" },
  { token: "x4dDv2BLme-koAhRc4WDrukxuEq6fIHZMBUvMtJaJiU", staffId: "u-sarah", name: "Sarah Kyomuhendo", email: "sarah@tamu.example", purpose: "reset", state: "valid" },
  { token: "eJo0EOOMurRsR-Agqo30Uvn_Iwt4L5u7cT1E3NjckB4", staffId: "u-ivan", name: "Ivan Kasozi", email: "ivan@tamu.example", purpose: "invite", state: "expired" },
  { token: "RNI7fBvwCqY0ax1C8FTWoLyutlLrNfO6HOlW--7Axcg", staffId: "u-joan", name: "Joan Nansubuga", email: "joan@tamu.example", purpose: "invite", state: "used" },
];

export function ensureDemoPasswordLinks(validHours: number) {
  const links = load();
  const now = Date.now();
  let changed = false;
  for (const demo of DEMO_LINKS) {
    const existing = links.find((link) => link.token === demo.token);
    const expiresAt = new Date(demo.state === "expired" ? now - 3_600_000 : now + validHours * 3_600_000).toISOString();
    if (!existing) {
      links.push({ token: demo.token, staffId: demo.staffId, name: demo.name, email: demo.email, purpose: demo.purpose, createdAt: new Date(now).toISOString(), expiresAt, status: demo.state === "used" ? "used" : "open" });
      changed = true;
    } else if (demo.state === "valid" && existing.status === "open" && new Date(existing.expiresAt).getTime() <= now) {
      existing.expiresAt = expiresAt;
      changed = true;
    }
  }
  if (changed) save(links);
}
