import type { NavigationBadges } from "../api/types";
import { ANY_SETTINGS_PERMISSION, type Permission } from "../auth/permissions";
import type { IconName } from "../components/ui/Icon";

/** MVP = Modules 1 & 2 (proposal). Phase 2 = Modules 3 & 4. */
export type Release = "mvp" | "phase-2";

export interface NavItem {
  label: string;
  icon: IconName;
  /** Route path; omitted for groups that only open a submenu. */
  to?: string;
  /** Any one of these grants access. Omitted = everyone signed in. */
  requires?: Permission | Permission[];
  /** Release the screen ships in; anything after the MVP shows a "Soon" badge. Defaults to "mvp". */
  release?: Release;
  /** Count shown next to the item, from GET /navigation/badges */
  badge?: keyof NavigationBadges;
  children?: NavItem[];
  /** The page has pages of its own under its address (e.g. /settings/users) */
  subpages?: boolean;
}

const VIEW_LOANS_PERMISSIONS: Permission[] = ["loans.view"];

// The sidebar, phone menu and route guards all read this list.
export const NAVIGATION: NavItem[] = [
  { label: "Dashboard", icon: "dashboard", to: "/" },
  {
    label: "Loans",
    icon: "loans",
    requires: VIEW_LOANS_PERMISSIONS,
    children: [
      { label: "To disburse", icon: "loans", to: "/loans/to-disburse", requires: VIEW_LOANS_PERMISSIONS },
      { label: "Active", icon: "loans", to: "/loans/active", requires: VIEW_LOANS_PERMISSIONS },
      { label: "In recovery", icon: "loans", to: "/loans/recovery", requires: VIEW_LOANS_PERMISSIONS },
      { label: "Cleared", icon: "loans", to: "/loans/cleared", requires: VIEW_LOANS_PERMISSIONS },
      { label: "All loans", icon: "loans", to: "/loans/all", requires: VIEW_LOANS_PERMISSIONS },
    ],
  },
  { label: "Applications", icon: "applications", to: "/applications", requires: "applications.view", badge: "applications" },
  { label: "Clients", icon: "user", to: "/borrowers", requires: "borrowers.view" },
  { label: "Arrears & SMS", icon: "arrears", to: "/arrears", requires: VIEW_LOANS_PERMISSIONS, release: "phase-2" },
  { label: "Payments", icon: "payments", to: "/payments", requires: "payments.view" },
  { label: "Accounting", icon: "accounting", to: "/accounting", requires: "reports.view", release: "phase-2" },
  { label: "Reports", icon: "reports", to: "/reports", requires: "reports.view" },
  { label: "Audit log", icon: "clock", to: "/audit-log", requires: "audit.view" },
  { label: "Settings", icon: "settings", to: "/settings", requires: ANY_SETTINGS_PERMISSION, subpages: true },
];

/** Every item that has its own route, for the router and route guards. */
export const ROUTABLE_NAV_ITEMS: NavItem[] = NAVIGATION.flatMap((item) => item.children ?? [item]).filter((item) => item.to);
