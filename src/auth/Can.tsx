import type { ReactNode } from "react";
import { useAuth } from "./AuthContext";
import type { Permission } from "./permissions";

/** Renders children only if the user has any of the given permissions. */
export function Can({ perform, children, fallback = null }: { perform: Permission | Permission[]; children: ReactNode; fallback?: ReactNode }) {
  const { can } = useAuth();
  return <>{can(perform) ? children : fallback}</>;
}
