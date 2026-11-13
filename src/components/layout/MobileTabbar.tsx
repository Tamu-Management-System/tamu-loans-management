import { useCallback, useState } from "react";
import { NavLink, matchPath, useLocation } from "react-router";
import { NAVIGATION } from "../../app/navigation";
import { useAuth } from "../../auth/AuthContext";
import type { Permission } from "../../auth/permissions";
import { Icon, type IconName } from "../ui/Icon";
import { MenuSheet, type MenuSheetItem } from "../ui/MenuSheet";
import styles from "./AppShell.module.css";

// Phones: the sidebar is replaced by a bottom tab bar with the most-used screens; "More" slides up the rest.
const MOBILE_TABS: {
  label: string;
  icon: IconName;
  to: string;
  requires?: Permission[];
}[] = [
  { label: "Dashboard", icon: "dashboard", to: "/" },
  { label: "Loans", icon: "loans", to: "/loans/all", requires: ["loans.view"] },
  {
    label: "Clients",
    icon: "user",
    to: "/borrowers",
    requires: ["borrowers.view"],
  },
  {
    label: "Payments",
    icon: "payments",
    to: "/payments",
    requires: ["payments.view"],
  },
];

/** What each screen in "More" is for */
const MORE_TEXT: Record<string, string> = {
  "/applications": "New and in-progress loan applications",
  "/arrears": "Late loans, and the texts sent to clients",
  "/accounting": "Money in and out across the market",
  "/reports": "Portfolio, repayments and officer reports",
  "/audit-log": "Who did what, and when",
  "/settings": "Business rules, staff, roles and loan products",
};

const TAB_ADDRESSES = new Set(["/", "/borrowers", "/payments"]);

export function MobileTabbar() {
  const { can } = useAuth();
  const { pathname } = useLocation();
  const [moreOpen, setMoreOpen] = useState(false);
  const closeMore = useCallback(() => setMoreOpen(false), []);

  // Every menu item that is not already in the bar (the loan pages are under the Loans tab's Switch)
  const moreItems: MenuSheetItem[] = NAVIGATION.filter(
    (item) =>
      item.to &&
      !TAB_ADDRESSES.has(item.to) &&
      (!item.requires || can(item.requires)),
  ).map((item) => ({
    to: item.to!,
    label: item.label,
    icon: item.icon,
    text: MORE_TEXT[item.to!] ?? "",
  }));
  const moreIsCurrent = moreItems.some((item) =>
    matchPath({ path: item.to, end: false }, pathname),
  );

  return (
    <>
      <nav className={styles.tabBar} aria-label="Main menu">
        {MOBILE_TABS.filter((tab) => !tab.requires || can(tab.requires)).map(
          (tab) => (
            <NavLink
              key={tab.to}
              to={tab.to}
              end={tab.to === "/"}
              className={({ isActive }) =>
                isActive ? styles.tabActive : undefined
              }
            >
              <Icon name={tab.icon} size={22} strokeWidth={1.7} />
              {tab.label}
            </NavLink>
          ),
        )}
        <button
          type="button"
          className={moreIsCurrent || moreOpen ? styles.tabActive : undefined}
          aria-haspopup="dialog"
          aria-expanded={moreOpen}
          onClick={() => setMoreOpen(true)}
        >
          <Icon name="menu" size={22} strokeWidth={1.7} />
          More
        </button>
      </nav>
      {/* Outside the bar, so the bar's own link styling doesn't reach into the sheet */}
      {moreOpen && (
        <MenuSheet
          title="Menu"
          hint="Everything else, one tap away."
          items={moreItems}
          onClose={closeMore}
        />
      )}
    </>
  );
}
