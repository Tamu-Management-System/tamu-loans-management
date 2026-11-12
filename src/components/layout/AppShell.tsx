import { Suspense } from "react";
import { Outlet } from "react-router";
import { MobileTabbar } from "./MobileTabbar";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import styles from "./AppShell.module.css";

/** Top bar + sidebar + scrolling content panel. Pages render into <Suspense fallback={null}>
            <Outlet />
          </Suspense>. */
export function AppShell() {
  return (
    <div className={styles.shell}>
      <Topbar />
      <div className={styles.body}>
        <Sidebar />
        <main className={`${styles.content} scroll-area`}>
          <Suspense fallback={null}>
            <Outlet />
          </Suspense>
        </main>
      </div>
      <MobileTabbar />
    </div>
  );
}
