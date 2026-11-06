import type { DataScope, Permission } from "./permissions";

/** Shape of GET /api/me. Documented in docs/api-contract.md. */
export interface CurrentUser {
  id: string;
  name: string;
  email: string;
  photoUrl: string | null;
  branch: string;
  role: { id: string; name: string };
  /** Resolved from the user's role by the backend; the UI only reads this list. */
  permissions: Permission[];
  /** Whose records they see: their own clients, or the whole branch */
  dataScope: DataScope;
}
