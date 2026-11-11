// TEMPORARY: floating demo controls for client presentations. Remove before launch,
// together with src/demo and the demo sign-in in src/mocks/fixtures.ts.
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../auth/AuthContext";
import { Icon } from "../components/ui/Icon";
import { DEMO_USER_KEY, roles, users } from "../mocks/fixtures";
import styles from "./DemoControls.module.css";

const ROLE_SHORT_LABELS: Record<string, string> = { loan_officer: "Officer", finance: "Finance", admin: "Admin" };
const PANEL_OPEN_KEY = "tamu-demo-panel-open";

const readPanelOpen = () => {
  try {
    return localStorage.getItem(PANEL_OPEN_KEY) === "1";
  } catch {
    return false;
  }
};

export function DemoControls() {
  const [isOpen, setIsOpenState] = useState(readPanelOpen); // closed by default
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const setIsOpen = (open: boolean) => {
    setIsOpenState(open);
    try {
      localStorage.setItem(PANEL_OPEN_KEY, open ? "1" : "0");
    } catch {
      /* not remembered */
    }
  };

  const signInAs = (userId: string) => {
    try {
      localStorage.setItem(DEMO_USER_KEY, userId);
    } catch {
      /* storage blocked */
    }
    // Everything depends on who is signed in, so refetch it all
    queryClient.invalidateQueries();
  };

  if (!isOpen)
    return (
      <button className={styles.launcher} onClick={() => setIsOpen(true)} aria-label="Open demo controls" title="Demo controls">
        <Icon name="sliders" size={20} strokeWidth={1.8} />
      </button>
    );

  return (
    <section className={styles.panel} aria-label="Demo controls">
      <div className={styles.header}>
        <div>
          <b>Demo controls</b>
          <small>Temporary · not part of the product</small>
        </div>
        <button className={styles.closeButton} onClick={() => setIsOpen(false)} aria-label="Close demo controls" autoFocus>
          <Icon name="close" size={16} strokeWidth={2} />
        </button>
      </div>

      <div role="group" aria-label="View dashboard as" className={styles.fieldLabel}>
        View as
        <div className={styles.segmentedControl}>
          {users.map((demoUser) => (
            <button key={demoUser.id} aria-pressed={user.id === demoUser.id} onClick={() => signInAs(demoUser.id)}>
              {ROLE_SHORT_LABELS[demoUser.roleId] ?? roles[demoUser.roleId]?.name}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
