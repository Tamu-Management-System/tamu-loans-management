import { useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router";
import { useNavigationBadges, useRiskSummary } from "../../api/shell";
import { NAVIGATION, type NavItem } from "../../app/navigation";
import { useAuth } from "../../auth/AuthContext";
import { PORTFOLIO_SECTION_ID } from "../../modules/portfolio/sectionId";
import { Icon } from "../ui/Icon";
import styles from "./AppShell.module.css";

/** Fixed left menu. The list scrolls on its own on short screens; the risk card stays pinned below it. It can fold down to icons. */
export function Sidebar({ collapsed, onCollapsedChange }: { collapsed: boolean; onCollapsedChange: (collapsed: boolean) => void }) {
  const { can } = useAuth();
  const isAllowed = (item: NavItem) => !item.requires || can(item.requires);

  return (
    <nav className={styles.sidebar} aria-label="Main menu">
      <div className={`${styles.navList} scroll-area`}>
        {NAVIGATION.filter(isAllowed).map((item) =>
          item.children ? (
            <NavGroup key={item.label} item={item} items={item.children.filter(isAllowed)} collapsed={collapsed} onExpand={() => onCollapsedChange(false)} />
          ) : (
            <NavItemLink key={item.label} item={item} collapsed={collapsed} />
          ),
        )}
      </div>
      {can("loans.view") && <SidebarRiskCard />}
    </nav>
  );
}

function NavItemLink({ item, collapsed }: { item: NavItem; collapsed: boolean }) {
  const { data: badges } = useNavigationBadges();
  const count = item.badge ? badges?.[item.badge] : undefined;

  return (
    <NavLink to={item.to!} end={item.to === "/"} title={collapsed ? item.label : undefined} className={({ isActive }) => `${styles.navItem} ${isActive ? styles.active : ""}`}>
      <Icon name={item.icon} className={styles.navIcon} size={22} />
      <span className={styles.navLabel}>{item.label}</span>
      {!!count && (
        <span className={styles.countBadge} aria-label={`${count} waiting`}>
          {count}
        </span>
      )}
    </NavLink>
  );
}

function NavGroup({ item, items, collapsed, onExpand }: { item: NavItem; items: NavItem[]; collapsed: boolean; onExpand: () => void }) {
  const { pathname } = useLocation();
  const containsActive = items.some((child) => child.to && pathname.startsWith(child.to));
  const [open, setOpen] = useState(containsActive);
  const submenuId = `submenu-${item.label.toLowerCase().replace(/\W+/g, "-")}`;

  return (
    <>
      <button
        className={`${styles.navItem} ${containsActive ? styles.containsActive : ""}`}
        aria-expanded={open && !collapsed}
        aria-controls={submenuId}
        title={collapsed ? item.label : undefined}
        onClick={(event) => {
          // Folded down there is no room for the sub-items, so the menu opens with this group showing
          if (collapsed) {
            onExpand();
            setOpen(true);
            return;
          }
          setOpen(!open);
          // On short screens the list scrolls: bring the revealed items into view
          const button = event.currentTarget;
          if (!open) requestAnimationFrame(() => button.nextElementSibling?.scrollIntoView({ block: "nearest", behavior: "smooth" }));
        }}
      >
        <Icon name={item.icon} className={styles.navIcon} size={22} />
        <span className={styles.navLabel}>{item.label}</span>
        <Icon name="chevronDown" size={14} strokeWidth={2.2} className={`${styles.chevron} ${open ? styles.chevronOpen : ""}`} />
      </button>
      {open && !collapsed && (
        <div className={styles.subnav} id={submenuId}>
          {items.map((child) => (
            <NavLink key={child.to} to={child.to!} className={({ isActive }) => `${styles.subnavItem} ${isActive ? styles.subnavActive : ""}`}>
              {child.label}
            </NavLink>
          ))}
        </div>
      )}
    </>
  );
}

/** PAR30 for the user's portfolio (or the branch). */
function SidebarRiskCard() {
  const { data: risk } = useRiskSummary();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  if (!risk) return null;

  const aboveTarget = risk.par30Percent > risk.targetPercent;
  const loansLabel = `${risk.loansOver30Days} loan${risk.loansOver30Days === 1 ? "" : "s"} over 30 days late`;

  return (
    <div className={styles.sidebarFooter}>
      <div className={`${styles.riskCard} ${aboveTarget ? styles.riskCardAlert : ""}`}>
        <button
          type="button"
          className={styles.riskCardButton}
          title={`${risk.scope === "own" ? "My risk" : "Market risk"}: PAR30 ${risk.par30Percent.toFixed(1)}%. ${aboveTarget ? "Above" : "Within"} the ${risk.targetPercent}% target`}
          onClick={() => {
            // Opens the portfolio section on the dashboard
            const scroll = () => document.getElementById(PORTFOLIO_SECTION_ID)?.scrollIntoView({ behavior: "smooth", block: "start" });
            if (pathname === "/") scroll();
            else {
              navigate("/");
              window.setTimeout(scroll, 300);
            }
          }}
        >
          <span className={styles.riskLabel}>{risk.scope === "own" ? "MY RISK" : "MARKET RISK"}</span>
          <Icon name={aboveTarget ? "warning" : "shield"} size={22} className={styles.riskIcon} />
          <span className={styles.riskValue}>
            <span className={styles.riskName}>PAR30 </span>
            {risk.par30Percent.toFixed(1)}%
          </span>
          <span className={styles.riskDetail}>
            {aboveTarget ? "Above" : "Within"} the {risk.targetPercent}% target · {loansLabel}
          </span>
        </button>
      </div>
    </div>
  );
}
