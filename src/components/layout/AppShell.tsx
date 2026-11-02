import { Outlet } from "react-router";
import { useScrollbarReveal } from "../../lib/useScrollbarReveal";
import { MobileTabbar } from "./MobileTabbar";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import styles from "./AppShell.module.css";

/** Top bar + sidebar + scrolling content panel. Pages render into <Outlet />. */
export function AppShell() {
  useScrollbarReveal();
  return (
    <div className={styles.shell}>
      <Topbar />
      <div className={styles.body}>
        <Sidebar />
        <main className={`${styles.content} scroll-area`}>
          <Outlet />
        </main>
      </div>
      <MobileTabbar />
    </div>
  );
}
