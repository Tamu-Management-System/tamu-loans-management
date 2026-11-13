import { Suspense } from "react";
import { Outlet } from "react-router";
import { useSidebarCollapsed } from "../../lib/useSidebarCollapsed";
import { MobileTabbar } from "./MobileTabbar";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import styles from "./AppShell.module.css";

/** Top bar + sidebar (which can fold down to icons) + scrolling content panel. Pages render into the <Outlet />. */
export function AppShell() {
  const [collapsed, setCollapsed] = useSidebarCollapsed();
  return (
    <div className={styles.shell} data-sidebar={collapsed ? "collapsed" : "open"}>
      <Topbar sidebarCollapsed={collapsed} onToggleSidebar={() => setCollapsed(!collapsed)} />
      <div className={styles.body}>
        <Sidebar collapsed={collapsed} onCollapsedChange={setCollapsed} />
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
