// Every action the UI can gate. Screens check permissions, never role names,
// so custom roles (created by an admin) work without code changes.
// A role also has a data access level: its own clients only, or the whole branch.

export const PERMISSIONS = [
  "borrowers.view",
  "borrowers.create",
  "borrowers.edit",
  "borrowers.nationalId",
  "borrowers.phoneApprove",
  "borrowers.export",
  "documents.view",
  "documents.upload",
  "documents.download",
  "applications.view",
  "applications.create",
  "applications.onlineLink",
  "applications.approve",
  "loans.view",
  "loans.disburse",
  "loans.export",
  "payments.view",
  "payments.record",
  "payments.edit",
  "payments.export",
  "recovery.view",
  "recovery.manage",
  "reports.view",
  "reports.export",
  "users.view",
  "users.manage",
  "roles.manage",
  "settings.business",
  "settings.products",
  "settings.rules",
  "settings.payments",
  "settings.security",
  "settings.notifications",
  "audit.view",
  "audit.export",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

/** Whose records a role sees: the clients its people look after, or everyone in the branch */
export type DataScope = "own" | "branch";

export const DATA_SCOPES: { value: DataScope; label: string; description: string }[] = [
  { value: "own", label: "Own portfolio", description: "Only the clients, loans and payments of people they look after." },
  { value: "branch", label: "Whole market", description: "Every client, loan and payment in the market." },
];

/** The columns of the permissions matrix */
export type PermissionAction = "view" | "create" | "edit" | "approve" | "export" | "manage";

export const PERMISSION_ACTIONS: { value: PermissionAction; label: string }[] = [
  { value: "view", label: "View" },
  { value: "create", label: "Create" },
  { value: "edit", label: "Edit" },
  { value: "approve", label: "Approve" },
  { value: "export", label: "Export" },
  { value: "manage", label: "Manage" },
];

export interface PermissionInfo {
  id: Permission;
  module: string;
  action: PermissionAction;
  /** Shown in the matrix cell when it says more than the column, e.g. "Pay out" in the Approve column */
  cellLabel?: string;
  /** Plain English, as an admin reads it */
  label: string;
  description: string;
  /** Moves money, reveals personal data or controls access */
  sensitive?: boolean;
  /** Needs these too (ticked automatically) */
  requires?: Permission[];
}

export interface PermissionModule {
  name: string;
  description: string;
  /** Lending modules follow the role's data access level; administration ones don't */
  group: "Lending" | "Administration";
}

export const PERMISSION_MODULES: PermissionModule[] = [
  { group: "Lending", name: "Clients", description: "Client records, contact details and their loans" },
  { group: "Lending", name: "Documents", description: "ID copies, signed applications and guarantor documents" },
  { group: "Lending", name: "Applications", description: "Loan applications, online forms and approval" },
  { group: "Lending", name: "Loans", description: "Active, cleared and to-be-paid-out loans" },
  { group: "Lending", name: "Payments", description: "Repayments and what was collected" },
  { group: "Lending", name: "Recovery", description: "Loans handed to the recovery team" },
  { group: "Lending", name: "Reports", description: "Portfolio, collections and performance reports" },
  { group: "Administration", name: "Staff", description: "Staff accounts, invites and switching accounts off" },
  { group: "Administration", name: "Roles", description: "Roles and their permissions" },
  { group: "Administration", name: "Loan products", description: "Interest, fees, limits and late fees" },
  { group: "Administration", name: "Loan rules", description: "Two-person checks and recovery rules" },
  { group: "Administration", name: "Payment settings", description: "Accepted methods, transaction IDs and back-dating" },
  { group: "Administration", name: "Business details", description: "Name, contacts and payout accounts" },
  { group: "Administration", name: "Security", description: "Sign-out time, lockout and passwords" },
  { group: "Administration", name: "Notifications", description: "Who is told when it's their turn, and how" },
  { group: "Administration", name: "Audit log", description: "Who did what, and when" },
];

export const PERMISSION_CATALOG: PermissionInfo[] = [
  { id: "borrowers.view", module: "Clients", action: "view", label: "See clients", description: "Names, phone numbers, work and loan history." },
  { id: "borrowers.create", module: "Clients", action: "create", label: "Register clients", description: "Add new clients while starting an application.", requires: ["borrowers.view"] },
  { id: "borrowers.edit", module: "Clients", action: "edit", label: "Edit client details", description: "Contact details, next of kin and work. A new mobile money number still needs someone else's approval.", requires: ["borrowers.view"] },
  { id: "borrowers.phoneApprove", module: "Clients", action: "approve", cellLabel: "Number changes", label: "Approve mobile money number changes", description: "Confirm a client's new payout number asked for by someone else.", sensitive: true, requires: ["borrowers.view"] },
  { id: "borrowers.export", module: "Clients", action: "export", label: "Export client lists", description: "Download client lists as spreadsheets.", sensitive: true, requires: ["borrowers.view"] },
  { id: "borrowers.nationalId", module: "Clients", action: "manage", cellLabel: "Show National ID", label: "Show full National ID numbers", description: "Reveal a masked National ID for 30 seconds. Every reveal is logged.", sensitive: true, requires: ["borrowers.view"] },

  { id: "documents.view", module: "Documents", action: "view", label: "View documents", description: "Open ID copies and signed applications in the app. Every view is logged.", requires: ["borrowers.view"] },
  { id: "documents.upload", module: "Documents", action: "create", cellLabel: "Upload", label: "Upload and replace documents", description: "Add missing documents or replace old ones; old versions are kept.", requires: ["documents.view"] },
  { id: "documents.download", module: "Documents", action: "export", cellLabel: "Download", label: "Download documents", description: "Save copies of documents to the device. Every download is logged.", sensitive: true, requires: ["documents.view"] },

  { id: "applications.view", module: "Applications", action: "view", label: "See applications", description: "Drafts, applications waiting for approval, approved and rejected." },
  { id: "applications.create", module: "Applications", action: "create", label: "Start applications", description: "Fill in new applications and send them for approval.", requires: ["applications.view", "borrowers.create", "documents.upload"] },
  { id: "applications.approve", module: "Applications", action: "approve", label: "Approve or reject applications", description: "Decide on applications. Nobody can approve one they started.", sensitive: true, requires: ["applications.view", "documents.view"] },
  { id: "applications.onlineLink", module: "Applications", action: "manage", cellLabel: "Online form links", label: "Send online form links", description: "Create the secure link a client fills in on their phone.", requires: ["applications.view"] },

  { id: "loans.view", module: "Loans", action: "view", label: "See loans", description: "Balances, repayment schedules and payments on each loan." },
  { id: "loans.disburse", module: "Loans", action: "approve", cellLabel: "Pay out", label: "Pay out approved loans", description: "Record the mobile money payout. Whoever approved a loan can't pay it out.", sensitive: true, requires: ["loans.view", "applications.view"] },
  { id: "loans.export", module: "Loans", action: "export", label: "Export loan lists", description: "Download loan lists as spreadsheets.", sensitive: true, requires: ["loans.view"] },

  { id: "payments.view", module: "Payments", action: "view", label: "See payments", description: "Repayments, totals and transaction IDs." },
  { id: "payments.record", module: "Payments", action: "create", cellLabel: "Record", label: "Record repayments", description: "Enter cash and mobile money repayments.", sensitive: true, requires: ["payments.view", "loans.view"] },
  { id: "payments.edit", module: "Payments", action: "edit", cellLabel: "Edit", label: "Edit payments", description: "Fix a mistyped amount on a payment you recorded, within the time Settings allows. The old amount and the reason are kept.", sensitive: true, requires: ["payments.record"] },
  { id: "payments.export", module: "Payments", action: "export", label: "Export payments", description: "Download payment lists as spreadsheets.", requires: ["payments.view"] },

  { id: "recovery.view", module: "Recovery", action: "view", label: "See loans in recovery", description: "The recovery list and why each loan was sent.", requires: ["loans.view"] },
  { id: "recovery.manage", module: "Recovery", action: "manage", cellLabel: "Send and bring back", label: "Send loans to recovery and bring them back", description: "Hand late loans to the recovery team, with a reason.", requires: ["recovery.view"] },

  { id: "reports.view", module: "Reports", action: "view", label: "See reports", description: "Portfolio, collections and officer performance." },
  { id: "reports.export", module: "Reports", action: "export", label: "Export reports", description: "Download reports as spreadsheets or PDF.", requires: ["reports.view"] },

  { id: "users.view", module: "Staff", action: "view", label: "See staff accounts", description: "Who can sign in, their roles and when they last signed in." },
  { id: "users.manage", module: "Staff", action: "manage", cellLabel: "Invite, change, switch off", label: "Manage staff accounts", description: "Invite staff, change their roles and switch accounts off.", sensitive: true, requires: ["users.view"] },

  { id: "roles.manage", module: "Roles", action: "manage", cellLabel: "Create and change", label: "Manage roles", description: "Create custom roles and choose their permissions.", sensitive: true, requires: ["users.view"] },

  { id: "settings.business", module: "Business details", action: "manage", label: "Change business details", description: "Name, contacts and payout accounts shown to clients." },
  { id: "settings.products", module: "Loan products", action: "manage", label: "Manage loan products", description: "Interest, fees, limits and late penalties.", sensitive: true },
  { id: "settings.rules", module: "Loan rules", action: "manage", label: "Change loan rules", description: "Two-person checks, guarantors and recovery rules.", sensitive: true },
  { id: "settings.payments", module: "Payment settings", action: "manage", label: "Change payment settings", description: "Accepted methods, references and back-dating.", sensitive: true },
  { id: "settings.security", module: "Security", action: "manage", label: "Change security settings", description: "Sign-out time, lockout and invite links.", sensitive: true },
  { id: "settings.notifications", module: "Notifications", action: "manage", label: "Change notification settings", description: "Which steps send a message to the next person, and by which channel.", sensitive: true },

  { id: "audit.view", module: "Audit log", action: "view", label: "See the audit log", description: "Every sign-in, change, payment and document view." },
  { id: "audit.export", module: "Audit log", action: "export", label: "Export the audit log", description: "Download it as a spreadsheet (CSV). Every export is logged.", sensitive: true, requires: ["audit.view"] },
];

export const permissionInfo = (id: Permission) => PERMISSION_CATALOG.find((info) => info.id === id)!;

/** The permission plus everything it needs, recursively */
export function withRequirements(ids: Iterable<Permission>): Set<Permission> {
  const result = new Set<Permission>();
  const add = (id: Permission) => {
    if (result.has(id)) return;
    result.add(id);
    permissionInfo(id).requires?.forEach(add);
  };
  for (const id of ids) add(id);
  return result;
}

/** Everything that needs this permission, recursively (unticked with it) */
export function dependentsOf(id: Permission): Set<Permission> {
  const result = new Set<Permission>();
  const visit = (target: Permission) => {
    for (const info of PERMISSION_CATALOG)
      if (info.requires?.includes(target) && !result.has(info.id)) {
        result.add(info.id);
        visit(info.id);
      }
  };
  visit(id);
  return result;
}

export const SETTINGS_PERMISSIONS: Permission[] = ["settings.business", "settings.products", "settings.rules", "settings.payments", "settings.security", "settings.notifications"];
/** Anything that opens Settings */
export const ANY_SETTINGS_PERMISSION: Permission[] = ["users.view", "roles.manage", ...SETTINGS_PERMISSIONS];

export type BuiltInRoleId = "admin" | "finance" | "loan_officer";

export interface Role {
  id: string;
  name: string;
  /** One line on what the role is for */
  description: string;
  /** Built-in roles are read-only; only custom roles can be edited. */
  builtIn: boolean;
  dataScope: DataScope;
  permissions: Permission[];
}

// Defaults agreed so far (see project notes). The backend will own these;
// the mock API serves them from here until then.
export const BUILT_IN_ROLES: Record<BuiltInRoleId, Role> = {
  admin: {
    id: "admin",
    name: "Admin",
    description: "Runs the system: staff, roles and settings. Doesn't approve or pay out loans.",
    builtIn: true,
    dataScope: "branch",
    permissions: [
      "borrowers.view",
      "borrowers.edit",
      "borrowers.nationalId",
      "borrowers.export",
      "documents.view",
      "documents.download",
      "applications.view",
      "loans.view",
      "loans.export",
      "payments.view",
      "payments.export",
      "recovery.view",
      "recovery.manage",
      "reports.view",
      "reports.export",
      "users.view",
      "users.manage",
      "roles.manage",
      "settings.business",
      "settings.products",
      "settings.rules",
      "settings.payments",
      "settings.security",
      "settings.notifications",
      "audit.view",
      "audit.export",
    ],
  },
  finance: {
    id: "finance",
    name: "Finance",
    description: "Approves and pays out loans, and sees the whole market.",
    builtIn: true,
    dataScope: "branch",
    permissions: [
      "borrowers.view",
      "borrowers.nationalId",
      "borrowers.phoneApprove",
      "borrowers.export",
      "documents.view",
      "documents.download",
      "applications.view",
      "applications.approve",
      "loans.view",
      "loans.disburse",
      "loans.export",
      "payments.view",
      "payments.record",
      "payments.edit",
      "payments.export",
      "recovery.view",
      "recovery.manage",
      "reports.view",
      "reports.export",
      "audit.view",
    ],
  },
  loan_officer: {
    id: "loan_officer",
    name: "Loan officer",
    description: "Registers clients, sends applications and collects from their own clients.",
    builtIn: true,
    dataScope: "own",
    permissions: [
      "borrowers.view",
      "borrowers.create",
      "borrowers.edit",
      "borrowers.nationalId",
      "documents.view",
      "documents.upload",
      "documents.download",
      "applications.view",
      "applications.create",
      "applications.onlineLink",
      "loans.view",
      "loans.export",
      "payments.view",
      "payments.record",
      "payments.edit",
      "recovery.view",
      "reports.view",
      "reports.export",
    ],
  },
};

/** True if the user has at least one of the given permissions. */
export function hasAnyPermission(granted: readonly Permission[], needed: Permission | Permission[]): boolean {
  const required = Array.isArray(needed) ? needed : [needed];
  return required.some((permission) => granted.includes(permission));
}
