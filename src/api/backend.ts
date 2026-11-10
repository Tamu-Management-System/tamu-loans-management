// How the real backend (loan-app-rest-api) is spoken to, read from its code. See docs/backend-mapping.md.
// Every table has the same routes under /private/<Model>/<action>/. Reads are POST with { query }.

/** The tables that have routes, as they appear in the URL (e.g. /private/Borrowers/find-all/) */
export type BackendModel =
  | "ApplicationEvents"
  | "ApplicationGuarantors"
  | "AuditLogs"
  | "AutomationRuns"
  | "AutomationWorkflowNodes"
  | "AutomationWorkflows"
  | "Borrowers"
  | "CommunicationLogs"
  | "Disbursements"
  | "FileResources"
  | "FollowUps"
  | "LedgerEntries"
  | "Ledgers"
  | "LoanApplications"
  | "LoanCharges"
  | "LoanProducts"
  | "LoanRestructures"
  | "LoanWriteOffs"
  | "Loans"
  | "MessageTemplates"
  | "MobileMoneyTransactions"
  | "Notifications"
  | "OnlineApplicationLinks"
  | "PaymentAllocations"
  | "PaymentReversals"
  | "Payments"
  | "People"
  | "Permissions"
  | "PhoneChangeRequests"
  | "PromiseToPayRepaymentSchedules"
  | "PromiseToPays"
  | "Recoveries"
  | "Refunds"
  | "Regions"
  | "RepaymentSchedules"
  | "RestorePoints"
  | "RolePermissions"
  | "Roles"
  | "Sessions"
  | "Settings"
  | "StaffAccountRoles"
  | "StaffAccounts"
  | "StaffInvites"
  | "Teams"
  | "TelephoneNumbers"
  | "WorkListTasks";

/** Routes that only read (all are POST with a body) */
export type BackendReadAction = "find-all" | "find-by-pk" | "find-one" | "find-and-count-all" | "find-and-count-all-by-cursor" | "count";

/** Routes that change data */
export type BackendWriteAction = "create" | "bulk-create" | "save-with-relationships" | "update-one" | "update-by-pk" | "delete-one" | "delete-by-pk" | "delete-all" | "restore";

export type FilterOperator =
  | "equals"
  | "ne"
  | "notEquals"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "in"
  | "nin"
  | "notIn"
  | "like"
  | "iLike"
  | "notLike"
  | "notILike"
  | "startsWith"
  | "endsWith"
  | "substring"
  | "contains"
  | "notContains"
  | "between"
  | "notBetween"
  | "is"
  | "isNull"
  | "notNull";

/**
 * One condition, or a group of them joined by `conjunction` (AND unless said otherwise).
 * `like` and `iLike` add the % signs around the value themselves, so send the plain text (`ann`, not `%ann%`).
 * A name with a dot (`person.fullNames`) filters a joined table, so that relation must also be in `populate`.
 */
export interface FilterPart {
  fieldName?: string;
  value?: unknown;
  operator?: FilterOperator;
  conjunction?: "AND" | "OR";
  childrenFilterParts?: FilterPart[];
}

export interface SortPart {
  sortProperty: string;
  sortDirection?: "ASC" | "DESC";
}

/** The `query` object every read takes */
export interface BackendQuery {
  /** find-by-pk */
  id?: string;
  /** Comma separated relations to join, e.g. "person,loanOfficer" */
  populate?: string;
  advancedFilters?: FilterPart[];
  sort?: SortPart[];
  /** Pages start at 1 */
  page?: number;
  size?: number;
  /** Comma separated columns to return (the screen's own fields only) */
  projections?: string;
  excludedProjections?: string;
  includeSoftDeletedEntries?: boolean;
}

/** A single record */
export interface BackendEnvelope<T> {
  content: T;
  success: boolean;
  message: string;
}

/** A list with its total */
export interface BackendPageEnvelope<T> {
  page: { count: number; content: T[] };
  success: boolean;
  message: string;
}

export const backendPath = (model: BackendModel, action: BackendReadAction | BackendWriteAction) => `/private/${model}/${action}/`;

/** Conditions that must all hold */
export const allOf = (...parts: FilterPart[]): FilterPart[] => parts;

export const where = (fieldName: string, operator: FilterOperator, value?: unknown): FilterPart => ({ fieldName, operator, value });

/** A group where any one condition is enough, e.g. a search over a name, a phone number or a National ID */
export const anyOf = (...parts: FilterPart[]): FilterPart => ({ conjunction: "OR", childrenFilterParts: parts });
