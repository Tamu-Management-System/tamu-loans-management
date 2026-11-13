import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import { useSignOut } from "../../api/auth";
import { SEARCH_MIN_LENGTH, useMarkNotificationsRead, useNotifications, useSearch } from "../../api/shell";
import { useAuth } from "../../auth/AuthContext";
import { ANY_SETTINGS_PERMISSION } from "../../auth/permissions";
import { useDismiss } from "../../lib/useDismiss";
import { Avatar } from "../ui/Avatar";
import { Icon, TamuLogoMark } from "../ui/Icon";
import styles from "./AppShell.module.css";

export function Topbar({ sidebarCollapsed, onToggleSidebar }: { sidebarCollapsed: boolean; onToggleSidebar: () => void }) {
  const { can } = useAuth();
  return (
    <header className={styles.topbar}>
      <div className={styles.brandRow}>
        <Link to="/" className={styles.brand}>
          <span className={styles.brandMark}>
            <TamuLogoMark size={38} />
          </span>
          <span className={styles.brandName}>Tamu Loans</span>
        </Link>
      </div>
      <GlobalSearch sidebarCollapsed={sidebarCollapsed} onToggleSidebar={onToggleSidebar} />
      <div className={styles.topbarActions}>
        <ProfileMenu />
        <span className={`${styles.topbarDivider} ${styles.wideOnly}`} aria-hidden="true" />
        <div className={styles.wideOnly}>
          <Notifications />
        </div>
        {/* Everyone gets the gear (as in the design): system settings for admins, personal settings for others */}
        <Link
          to={can(ANY_SETTINGS_PERMISSION) ? "/settings" : "/account/settings"}
          className={`${styles.iconButton} ${styles.wideOnly}`}
          aria-label="Settings"
          title="Settings"
        >
          <Icon name="settings" size={22} strokeWidth={1.6} />
        </Link>
      </div>
    </header>
  );
}

const SEARCH_DEBOUNCE_MS = 200;


/** Finds clients, loans and applications by name, ID or phone. Results respect the user's scope. */
function GlobalSearch({ sidebarCollapsed, onToggleSidebar }: { sidebarCollapsed: boolean; onToggleSidebar: () => void }) {
  const navigate = useNavigate();
  const [input, setInput] = useState("");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const containerRef = useRef<HTMLFormElement>(null);
  const listId = useId();
  const close = useCallback(() => setOpen(false), []);
  useDismiss(containerRef, open, close);

  useEffect(() => {
    const timer = window.setTimeout(() => setQuery(input), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [input]);

  const { data: results = [], isFetching } = useSearch(query);
  // Check both: the panel closes as soon as the box is cleared, without waiting for the debounce
  const showPanel = open && input.trim().length >= SEARCH_MIN_LENGTH && query.trim().length >= SEARCH_MIN_LENGTH;

  const openResult = (href: string) => {
    navigate(href);
    setInput("");
    setQuery("");
    setOpen(false);
  };

  return (
    <form
      ref={containerRef}
      className={styles.searchForm}
      role="search"
      onSubmit={(event) => {
        event.preventDefault();
        if (results[activeIndex]) openResult(results[activeIndex].href);
      }}
    >
      {/* The menu toggle sits inside the search bar, on its left; it stays out of the label so a click on it doesn't focus the search */}
      <button
        type="button"
        className={styles.sidebarToggle}
        aria-expanded={!sidebarCollapsed}
        aria-label={sidebarCollapsed ? "Expand menu" : "Collapse menu"}
        title={sidebarCollapsed ? "Expand menu" : "Collapse menu"}
        onClick={onToggleSidebar}
      >
        <Icon name="panelLeft" size={20} />
      </button>
      <label className={styles.searchField}>
        <Icon name="search" size={17} strokeWidth={1.8} />
        <input
          type="search"
          value={input}
          placeholder="Search client, loan ID or phone"
          aria-label="Search clients, loan IDs or phone numbers"
          autoComplete="off"
          role="combobox"
          aria-expanded={showPanel}
          aria-controls={listId}
          aria-activedescendant={showPanel && results[activeIndex] ? `${listId}-${activeIndex}` : undefined}
          onChange={(event) => {
            setInput(event.target.value);
            setActiveIndex(0);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setActiveIndex((index) => Math.min(index + 1, results.length - 1));
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              setActiveIndex((index) => Math.max(index - 1, 0));
            }
          }}
        />
      </label>
      {showPanel && (
        <div className={styles.searchResults} id={listId} role="listbox" aria-label="Search results">
          {results.map((result, index) => (
            <button
              type="button"
              key={`${result.kind}-${result.id}`}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={index === activeIndex}
              className={index === activeIndex ? styles.searchResultActive : undefined}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => openResult(result.href)}
            >
              <b>{result.title}</b>
              <span className={styles.mutedText}>{result.subtitle}</span>
            </button>
          ))}
          {!results.length && !isFetching && <p className={styles.dropdownEmpty}>No client, loan ID or phone matches “{query.trim()}”.</p>}
        </div>
      )}
    </form>
  );
}

function ProfileMenu() {
  const { user } = useAuth();
  const { signOut, isSigningOut } = useSignOut();
  const { can } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(ref, open, close);
  const roleLine = `${user.role.name} · ${user.branch}`;
  const { data: notifications = [] } = useNotifications();
  const unread = notifications.filter((item) => item.unread).length;

  return (
    <div className={styles.menuAnchor} ref={ref}>
      <button className={styles.profileButton} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className={styles.avatarWrap}>
          <Avatar name={user.name} src={user.photoUrl} size={40} />
          {unread > 0 && <span className={styles.avatarDot} aria-label={`${unread} new notifications`} />}
        </span>
        <span className={styles.profileText}>
          <b>{user.name}</b>
          <span className={styles.mutedText}>{roleLine}</span>
        </span>
      </button>
      {open && (
        <div className={styles.dropdown} role="menu" aria-label="Account">
          <div className={styles.dropdownHeader}>
            <b>{user.name}</b>
            <span className={styles.mutedText}>{roleLine}</span>
          </div>
          <Link role="menuitem" to="/account/profile" onClick={close}>
            <Icon name="user" size={17} strokeWidth={1.8} />
            My profile
          </Link>
          <Link role="menuitem" to="/notifications" onClick={close}>
            <Icon name="bell" size={17} strokeWidth={1.8} />
            Notifications
            {unread > 0 && <span className={styles.menuCount} aria-label={`${unread} new`}>{unread > 9 ? "9+" : unread}</span>}
          </Link>
          <Link role="menuitem" to="/account/settings" onClick={close}>
            <Icon name="settings" size={17} strokeWidth={1.8} />
            Account settings
          </Link>
          {can(ANY_SETTINGS_PERMISSION) && (
            <Link role="menuitem" to="/settings" onClick={close}>
              <Icon name="settings" size={17} strokeWidth={1.8} />
              System settings
            </Link>
          )}
          <Link role="menuitem" to="/help" onClick={close}>
            <Icon name="help" size={17} strokeWidth={1.8} />
            Help &amp; support
          </Link>
          <button
            role="menuitem"
            className={styles.signOut}
            onClick={() => void signOut()}
            disabled={isSigningOut}
          >
            <Icon name="signOut" size={17} strokeWidth={1.8} />
            {isSigningOut ? "Signing out…" : "Sign out"}
          </button>
        </div>
      )}
    </div>
  );
}

function Notifications() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(ref, open, close);
  const { data: notifications = [] } = useNotifications();
  const markRead = useMarkNotificationsRead();
  const unreadCount = notifications.filter((item) => item.unread).length;

  const toggle = () => {
    const opening = !open;
    setOpen(opening);
    if (opening && unreadCount > 0) markRead.mutate();
  };

  return (
    <div className={styles.menuAnchor} ref={ref}>
      <button
        className={styles.iconButton}
        aria-label={unreadCount ? `Notifications, ${unreadCount} new` : "Notifications"}
        aria-expanded={open}
        onClick={toggle}
      >
        <Icon name="bell" size={22} strokeWidth={1.6} />
        {unreadCount > 0 && <span className={styles.unreadDot} aria-hidden="true" />}
      </button>
      {open && (
        <div className={`${styles.dropdown} ${styles.notificationsDropdown}`} role="dialog" aria-label="Notifications">
          {notifications.length ? (
            notifications.map((item) => (
              <Link key={item.id} to={item.href} onClick={close} className={styles.notificationItem}>
                <b>{item.title}</b>
                <span className={styles.mutedText}>{item.detail}</span>
              </Link>
            ))
          ) : (
            <p className={styles.dropdownEmpty}>You're all caught up.</p>
          )}
          <Link to="/notifications" onClick={close} className={styles.notificationsAll}>
            See all notifications
          </Link>
        </div>
      )}
    </div>
  );
}
