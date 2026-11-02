import type { ReactNode } from "react";
import { ForbiddenPage } from "../pages/PlaceholderPage";
import { useAuth } from "./AuthContext";
import type { Permission } from "./permissions";

/** Route guard: shows "No access" instead of the page when the user lacks the permission.
 *  The backend must enforce the same rule; this only keeps the UI honest. */
export function RequirePermission({ requires, children }: { requires?: Permission | Permission[]; children: ReactNode }) {
  const { can } = useAuth();
  return <>{!requires || can(requires) ? children : <ForbiddenPage />}</>;
}
