import type { ReactNode } from "react";
import { ForbiddenPage } from "../pages/PlaceholderPage";
import { useAuth } from "./AuthContext";
import type { Permission } from "./permissions";

/** Route guard: shows "No access" instead of the page when the user lacks the permission.
 *  The backend must enforce the same rule; this only keeps the UI honest. */
export function RequirePermission({ requires, screen, children }: { requires?: Permission | Permission[]; /** The screen's name, shown on the "No access" page */ screen?: string; children: ReactNode }) {
  const { can } = useAuth();
  return <>{!requires || can(requires) ? children : <ForbiddenPage screen={screen} />}</>;
}
