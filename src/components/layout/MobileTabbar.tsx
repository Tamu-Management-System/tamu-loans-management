import { NavLink } from "react-router";
import { useAuth } from "../../auth/AuthContext";
import type { Permission } from "../../auth/permissions";
import { Icon, type IconName } from "../ui/Icon";
import styles from "./AppShell.module.css";

// Phones: the sidebar is replaced by a bottom tab bar with the most-used screens.
const MOBILE_TABS: { label: string; icon: IconName; to: string; requires?: Permission[] }[] = [
  { label: "Dashboard", icon: "dashboard", to: "/" },
  { label: "Loans", icon: "loans", to: "/loans/all", requires: ["loans.view"] },
  { label: "Clients", icon: "user", to: "/borrowers", requires: ["borrowers.view"] },
  { label: "Payments", icon: "payments", to: "/payments", requires: ["payments.view"] },
  { label: "More", icon: "menu", to: "/more" },
];

export function MobileTabbar() {
  const { can } = useAuth();
  return (
    <nav className={styles.tabBar} aria-label="Main menu">
      {MOBILE_TABS.filter((tab) => !tab.requires || can(tab.requires)).map((tab) => (
        <NavLink key={tab.to} to={tab.to} end={tab.to === "/"} className={({ isActive }) => (isActive ? styles.tabActive : undefined)}>
          <Icon name={tab.icon} size={22} strokeWidth={1.7} />
          {tab.label}
        </NavLink>
      ))}
    </nav>
  );
}
