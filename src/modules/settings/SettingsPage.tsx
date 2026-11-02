import type { ReactNode } from "react";
import { Link, NavLink, Navigate, Route, Routes, useLocation } from "react-router";
import type { Permission } from "../../auth/permissions";
import { useAuth } from "../../auth/AuthContext";
import { Icon } from "../../components/ui/Icon";
import { ForbiddenPage, NotFoundPage } from "../../pages/PlaceholderPage";
import { LoanProductEditor, LoanProductsSection } from "./LoanProducts";
import { RoleEditor } from "./RoleEditor";
import { BusinessSection, LoanRulesSection, PaymentsSection, SecuritySection } from "./SystemSections";
import { RolesSection } from "./RolesSection";
import { UsersSection } from "./UsersSection";
import styles from "./Settings.module.css";

interface Section {
  path: string;
  label: string;
  description: string;
  requires: Permission;
  group: string;
}

const SECTIONS: Section[] = [
  { group: "People", path: "users", label: "Users", description: "Staff and invites", requires: "users.view" },
  { group: "People", path: "roles", label: "Roles & permissions", description: "Who can do what", requires: "roles.manage" },
  { group: "Lending", path: "products", label: "Loan products", description: "Interest, fees, limits", requires: "settings.products" },
  { group: "Lending", path: "rules", label: "Loan rules", description: "Checks and recovery", requires: "settings.rules" },
  { group: "Money", path: "payments", label: "Payments", description: "Methods and dates", requires: "settings.payments" },
  { group: "Organisation", path: "business", label: "Business details", description: "Name and accounts", requires: "settings.business" },
  { group: "Organisation", path: "security", label: "Security & sign-in", description: "Sign-in and sessions", requires: "settings.security" },
];

/** Side menu on wider screens; on phones the menu is the first screen */
const WIDE_SCREEN = "(min-width: 761px)";

/** Settings (admins): a menu of sections, each on its own address under /settings. */
export function SettingsPage() {
  const { can } = useAuth();
  const { pathname } = useLocation();
  const sections = SECTIONS.filter((section) => can(section.requires));
  const atMenu = /^\/settings\/?$/.test(pathname);

  const guard = (permission: Permission, element: ReactNode) => (can(permission) ? element : <ForbiddenPage />);

  return (
    <>
      <div className={styles.pageHeader}>
        <h1>Settings</h1>
        <p className={styles.subtitle}>How Tamu Loans works for your team: people, lending, money and security</p>
      </div>
      <div className={`${styles.layout} ${atMenu ? styles.atMenu : ""}`}>
        <nav className={styles.menu} aria-label="Settings">
          {[...new Set(sections.map((section) => section.group))].map((group) => (
            <div key={group} className={styles.menuGroup}>
              <h2 className={styles.menuGroupTitle}>{group}</h2>
              {sections
                .filter((section) => section.group === group)
                .map((section) => (
                  <NavLink key={section.path} to={`/settings/${section.path}`} className={({ isActive }) => `${styles.menuItem} ${isActive ? styles.menuItemActive : ""}`}>
                    <span>
                      {section.label}
                      <small>{section.description}</small>
                    </span>
                    <Icon name="chevronDown" size={16} strokeWidth={2} className={styles.menuChevron} />
                  </NavLink>
                ))}
            </div>
          ))}
        </nav>
        <div className={styles.content}>
          {!atMenu && sections.length > 1 && (
            <Link to="/settings" className={styles.backToMenu}>
              <Icon name="chevronDown" size={15} strokeWidth={2} />
              Settings
            </Link>
          )}
          <Routes>
            <Route index element={<SettingsHome first={sections[0]} />} />
            <Route path="users" element={guard("users.view", <UsersSection />)} />
            <Route path="products" element={guard("settings.products", <LoanProductsSection />)} />
            <Route path="products/new" element={guard("settings.products", <LoanProductEditor />)} />
            <Route path="products/:productId" element={guard("settings.products", <LoanProductEditor />)} />
            <Route path="rules" element={guard("settings.rules", <LoanRulesSection />)} />
            <Route path="payments" element={guard("settings.payments", <PaymentsSection />)} />
            <Route path="business" element={guard("settings.business", <BusinessSection />)} />
            <Route path="security" element={guard("settings.security", <SecuritySection />)} />
            <Route path="roles" element={guard("roles.manage", <RolesSection />)} />
            <Route path="roles/new" element={guard("roles.manage", <RoleEditor />)} />
            <Route path="roles/:roleId" element={guard("roles.manage", <RoleEditor />)} />
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </div>
      </div>
    </>
  );
}

/** /settings: wider screens open the first section; phones show the menu. */
function SettingsHome({ first }: { first: Section | undefined }) {
  if (first && window.matchMedia(WIDE_SCREEN).matches) return <Navigate to={`/settings/${first.path}`} replace />;
  return null;
}
