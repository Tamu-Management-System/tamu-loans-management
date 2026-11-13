import { useCallback, useState } from "react";

const STORAGE_KEY = "tamu.sidebar-collapsed";

/** Whether the person last left the menu collapsed. Kept in this browser only; it still works when storage is blocked. */
export function useSidebarCollapsed() {
  const [collapsed, setCollapsedState] = useState(() => {
    try {
      return window.localStorage.getItem(STORAGE_KEY) === "1";
    } catch {
      return false;
    }
  });
  const setCollapsed = useCallback((value: boolean) => {
    setCollapsedState(value);
    try {
      window.localStorage.setItem(STORAGE_KEY, value ? "1" : "0");
    } catch {
      // Storage is blocked: the choice lasts until the page is reloaded
    }
  }, []);
  return [collapsed, setCollapsed] as const;
}
