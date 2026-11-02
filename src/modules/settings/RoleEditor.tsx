import { Fragment, useEffect, useId, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { ApiError } from "../../api/client";
import { useDeleteRole, useRoles, useSaveRole, useStaff, useSystemSettings } from "../../api/settings";
import type { RoleSummary } from "../../api/types";
import { useAuth } from "../../auth/AuthContext";
import {
  DATA_SCOPES,
  PERMISSION_ACTIONS,
  PERMISSION_CATALOG,
  PERMISSION_MODULES,
  dependentsOf,
  permissionInfo,
  withRequirements,
  type DataScope,
  type Permission,
  type PermissionInfo,
} from "../../auth/permissions";
import { Button } from "../../components/ui/Button";
import { Dialog } from "../../components/ui/Dialog";
import { Icon } from "../../components/ui/Icon";
import { Select } from "../../components/ui/Select";
import { useToast } from "../../components/ui/Toast";
import { Segmented } from "./SettingsForm";
import styles from "./Settings.module.css";

/** Modules that must see the whole branch: managing staff, roles or settings isn't a portfolio job */
const BRANCH_ONLY = (permission: Permission) => /^(users|roles|settings)\./.test(permission);

/** /settings/roles/new (optionally ?from=<role> to start from a copy) and /settings/roles/:roleId */
export function RoleEditor() {
  const { roleId } = useParams();
  const [searchParams] = useSearchParams();
  const { data: roles, isPending, isError, refetch } = useRoles();

  const breadcrumb = (current: string) => (
    <nav aria-label="Breadcrumb" className={styles.breadcrumb}>
      <Link to="/settings/roles">Roles & permissions</Link>
      <Icon name="chevronDown" size={14} strokeWidth={2} className={styles.breadcrumbSeparator} />
      <span aria-current="page">{current}</span>
    </nav>
  );

  if (isError)
    return (
      <>
        {breadcrumb("Role")}
        <p className={styles.message} role="alert">
          The role couldn't load.{" "}
          <button type="button" className={styles.linkButton} onClick={() => refetch()}>
            Try again
          </button>
        </p>
      </>
    );
  if (isPending) return <div className={styles.loading} aria-busy="true" aria-label="Loading the role" />;

  const role = roleId ? roles.find((r) => r.id === roleId) : null;
  if (roleId && !role)
    return (
      <>
        {breadcrumb("Role")}
        <p className={styles.message}>This role doesn't exist. It may have been deleted.</p>
      </>
    );
  const copyOf = !role ? roles.find((r) => r.id === searchParams.get("from")) : undefined;
  return (
    <>
      {breadcrumb(role ? role.name : "New role")}
      <RoleForm key={role?.id ?? `new-${copyOf?.id ?? ""}`} role={role ?? null} copyOf={copyOf} roles={roles} />
    </>
  );
}

function RoleForm({ role, copyOf, roles }: { role: RoleSummary | null; copyOf: RoleSummary | undefined; roles: RoleSummary[] }) {
  const ids = { name: useId(), description: useId(), search: useId(), start: useId() };
  const navigate = useNavigate();
  const showToast = useToast();
  const { user, can } = useAuth();
  const save = useSaveRole();
  const remove = useDeleteRole();
  const { data: staff } = useStaff(can("users.view"));
  const { data: settings } = useSystemSettings();
  const readOnly = !!role?.builtIn;
  const start = role ?? copyOf;
  const [name, setName] = useState(role ? role.name : copyOf ? `${copyOf.name} (copy)` : "");
  const [description, setDescription] = useState(start?.description ?? "");
  const [dataScope, setDataScope] = useState<DataScope>(start?.dataScope ?? "own");
  const [granted, setGranted] = useState<Set<Permission>>(() => new Set(start?.permissions ?? []));
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [autoNote, setAutoNote] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const initial = useRef(JSON.stringify({ name: role?.name ?? "", description: role?.description ?? "", dataScope: role?.dataScope ?? "own", permissions: [...(role?.permissions ?? [])].sort() }));

  const holders = staff?.filter((member) => member.role.id === role?.id && member.status !== "deactivated") ?? [];
  const isOwnRole = !!role && user.role.id === role.id;
  const dirty = JSON.stringify({ name, description, dataScope, permissions: [...granted].sort() }) !== initial.current;
  const branchOnly = [...granted].filter(BRANCH_ONLY);
  const problems = [
    name.trim().length < 3 && "Give the role a name.",
    granted.size === 0 && "Choose at least one permission.",
    dataScope === "own" && branchOnly.length > 0 && "Roles that manage staff, roles or settings must see the whole market.",
  ].filter(Boolean) as string[];

  // Leaving with unsaved changes: the browser asks first
  useEffect(() => {
    if (!dirty || readOnly) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, readOnly]);

  /** Turn one on (with what it needs) or off (with what needs it), and say what else changed */
  const toggle = (id: Permission, on: boolean) => {
    const next = new Set(granted);
    const also: Permission[] = [];
    if (on) {
      for (const needed of withRequirements([id])) {
        if (next.has(needed)) continue;
        next.add(needed);
        if (needed !== id) also.push(needed);
      }
    } else {
      next.delete(id);
      for (const dependent of dependentsOf(id)) if (next.delete(dependent)) also.push(dependent);
    }
    setGranted(next);
    setAutoNote(also.length ? `${on ? "Also turned on" : "Also turned off"}: ${also.map((p) => permissionInfo(p).label.toLowerCase()).join(", ")} (${on ? "needed for" : "they need"} “${permissionInfo(id).label.toLowerCase()}”).` : null);
  };
  const setModule = (module: string, on: boolean) => {
    const ids = PERMISSION_CATALOG.filter((info) => info.module === module).map((info) => info.id);
    const next = new Set(granted);
    if (on) for (const needed of withRequirements(ids)) next.add(needed);
    else for (const id of ids) for (const removed of [id, ...dependentsOf(id)]) next.delete(removed);
    setGranted(next);
    setAutoNote(null);
  };
  const startFrom = (fromId: string) => {
    const from = roles.find((r) => r.id === fromId);
    if (!from) return;
    setGranted(new Set(from.permissions));
    setDataScope(from.dataScope);
    setAutoNote(`Started from ${from.name}: ${from.permissions.length} permissions. Change anything below.`);
  };

  const needle = query.trim().toLowerCase();
  const matches = (info: PermissionInfo) => !needle || `${info.label} ${info.description} ${info.module} ${info.cellLabel ?? ""}`.toLowerCase().includes(needle);
  const modules = PERMISSION_MODULES.filter((module) => PERMISSION_CATALOG.some((info) => info.module === module.name && matches(info)));
  const sensitive = [...granted].filter((p) => permissionInfo(p).sensitive);

  const warnings = useMemo(() => {
    const list: string[] = [];
    if (granted.has("applications.approve") && granted.has("loans.disburse"))
      list.push(
        settings?.loanRules.approverCannotDisburse === false
          ? "Can approve and pay out, and Loan rules let one person do both on the same loan."
          : "Can approve and pay out; Loan rules stop one person doing both on the same loan.",
      );
    if (granted.has("applications.create") && granted.has("applications.approve"))
      list.push(settings?.loanRules.creatorCannotApprove === false ? "Can start and approve applications, and Loan rules allow approving their own." : "Can start and approve; nobody can approve an application they started.");
    if (granted.has("users.manage") && granted.has("roles.manage")) list.push("Can create roles and give them to anyone: full control of who can do what.");
    if (granted.has("payments.record") && dataScope === "branch") list.push("Can record payments on any loan in the market.");
    return list;
  }, [granted, dataScope, settings]);

  const submit = () => {
    setTouched(true);
    if (readOnly || problems.length) return;
    save
      .mutateAsync({ roleId: role?.id ?? null, name: name.trim(), description: description.trim(), dataScope, permissions: [...granted] })
      .then((saved) => {
        showToast({ message: role ? `${saved.name} is saved. It applies from everyone's next click.` : `${saved.name} is created. Give it to someone in Users.` });
        navigate("/settings/roles");
      })
      .catch(() => undefined);
  };

  const error = save.error instanceof ApiError ? save.error.message : save.error ? "The role couldn't be saved. Try again." : null;
  return (
    <>
      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <div className={styles.sectionHeader}>
          <div>
            <h2>
              {role ? role.name : "New role"}
              {readOnly && <span className={`${styles.chip} ${styles.chipNeutral} ${styles.headingChip}`}>Built-in · read-only</span>}
            </h2>
            <p className={styles.subtitle}>
              {readOnly
                ? "Built-in roles can't be changed. Copy one to make a custom role."
                : role
                  ? `${holders.length === 1 ? "1 person has" : `${holders.length} people have`} this role; changes apply to them straight away.`
                  : "Choose what people with this role can see and do."}
            </p>
          </div>
          {role && (
            <div className={styles.headerActions}>
              <Link to={`/settings/roles/new?from=${encodeURIComponent(role.id)}`} className={styles.secondaryLinkButton}>
                {readOnly ? "Copy to a new role" : "Copy"}
              </Link>
            </div>
          )}
        </div>

        <div className={styles.roleLayout}>
          <div className={styles.roleMain}>
            <div className={styles.card}>
              <div className={styles.formRow}>
                <label htmlFor={ids.name}>Name</label>
                <input id={ids.name} value={name} onChange={(event) => setName(event.target.value)} disabled={readOnly} maxLength={40} autoComplete="off" autoFocus={!role} />
              </div>
              <div className={styles.formRow}>
                <label htmlFor={ids.description}>What it's for</label>
                <input id={ids.description} value={description} onChange={(event) => setDescription(event.target.value)} disabled={readOnly} maxLength={140} placeholder="e.g. Follows up late loans in the field" autoComplete="off" />
              </div>
              <div className={styles.formRow}>
                <span className={styles.formRowLabel}>Data access</span>
                <div>
                  {readOnly ? (
                    <span className={styles.lockedValue}>{DATA_SCOPES.find((scope) => scope.value === dataScope)!.label}</span>
                  ) : (
                    <Segmented label="Data access" value={dataScope} onChange={setDataScope} options={DATA_SCOPES.map(({ value, label }) => ({ value, label }))} />
                  )}
                  <p className={styles.formRowHint}>{DATA_SCOPES.find((scope) => scope.value === dataScope)!.description} Applies to borrowers, documents, applications, loans, payments, recovery and reports.</p>
                </div>
              </div>
              {!role && (
                <div className={styles.formRow}>
                  <label htmlFor={ids.start}>Start from</label>
                  <Select id={ids.start} value="" onChange={startFrom} options={roles.map((r) => ({ value: r.id, label: r.name }))} placeholder="An existing role (optional)" />
                </div>
              )}
            </div>

            <div className={`${styles.card} ${styles.matrixCard}`}>
              <div className={styles.matrixToolbar}>
                <h3>Permissions</h3>
                <label className={styles.search} htmlFor={ids.search}>
                  <Icon name="search" size={16} strokeWidth={1.8} />
                  <input id={ids.search} type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find a permission" aria-label="Find a permission" autoComplete="off" />
                </label>
              </div>
              <p className={styles.autoNote} aria-live="polite">
                {autoNote}
              </p>
              {modules.length === 0 ? (
                <p className={styles.message}>No permission matches “{query.trim()}”.</p>
              ) : (
                <div className={styles.matrixScroll}>
                  <table className={styles.matrix}>
                    <colgroup>
                      <col className={styles.matrixAreaCol} />
                      {PERMISSION_ACTIONS.map((action) => (
                        <col key={action.value} />
                      ))}
                      {!readOnly && <col className={styles.matrixAllCol} />}
                    </colgroup>
                    <thead>
                      <tr>
                        <th scope="col">Area</th>
                        {PERMISSION_ACTIONS.map((action) => (
                          <th key={action.value} scope="col">
                            {action.label}
                          </th>
                        ))}
                        {!readOnly && <th scope="col">All</th>}
                      </tr>
                    </thead>
                    {(["Lending", "Administration"] as const).map((group) => {
                      const groupModules = modules.filter((module) => module.group === group);
                      if (groupModules.length === 0) return null;
                      return (
                        <tbody key={group}>
                          <tr className={styles.matrixGroup}>
                            <th scope="colgroup" colSpan={PERMISSION_ACTIONS.length + (readOnly ? 1 : 2)}>
                              {group}
                              <span>{group === "Lending" ? `Sees ${dataScope === "own" ? "their own portfolio" : "the whole market"}` : "Not limited by data access"}</span>
                            </th>
                          </tr>
                          {groupModules.map((module) => {
                            const all = PERMISSION_CATALOG.filter((info) => info.module === module.name);
                            const on = all.filter((info) => granted.has(info.id)).length;
                            const open = expanded === module.name || !!needle;
                            return (
                              <Fragment key={module.name}>
                                <tr className={`${styles.matrixRow} ${on ? styles.matrixRowOn : ""}`}>
                                  <th scope="row">
                                    <button type="button" className={styles.moduleButton} aria-expanded={open} onClick={() => setExpanded(open && !needle ? null : module.name)}>
                                      <Icon name="chevronDown" size={14} strokeWidth={2.2} className={styles.moduleChevron} />
                                      <span className={styles.moduleName}>{module.name}</span>
                                      <span className={styles.moduleCount}>
                                        {on}/{all.length}
                                      </span>
                                    </button>
                                  </th>
                                  {PERMISSION_ACTIONS.map((action) => {
                                    const info = all.find((item) => item.action === action.value);
                                    if (!info)
                                      return (
                                        <td key={action.value}>
                                          <span className={styles.noCell} aria-hidden="true" />
                                        </td>
                                      );
                                    return (
                                      <td key={action.value}>
                                        <label className={`${styles.cellBox} ${info.sensitive ? styles.cellBoxSensitive : ""} ${needle && matches(info) ? styles.cellMatch : ""}`} title={`${info.label}: ${info.description}`}>
                                          <input type="checkbox" checked={granted.has(info.id)} disabled={readOnly} onChange={(event) => toggle(info.id, event.target.checked)} aria-label={info.label} />
                                        </label>
                                      </td>
                                    );
                                  })}
                                  {!readOnly && (
                                    <td>
                                      <label className={styles.cellBox} title={`Everything in ${module.name}`}>
                                        <input
                                          type="checkbox"
                                          aria-label={`All of ${module.name}`}
                                          checked={on === all.length}
                                          ref={(box) => {
                                            if (box) box.indeterminate = on > 0 && on < all.length;
                                          }}
                                          onChange={(event) => setModule(module.name, event.target.checked)}
                                        />
                                      </label>
                                    </td>
                                  )}
                                </tr>
                                {open && (
                                  <tr className={styles.detailsRow}>
                                    <td colSpan={PERMISSION_ACTIONS.length + (readOnly ? 1 : 2)}>
                                      <p className={styles.moduleDescription}>{module.description}</p>
                                      <ul className={styles.permissionDetails}>
                                        {all.filter(matches).map((info) => (
                                          <li key={info.id}>
                                            <span className={styles.detailAction}>{PERMISSION_ACTIONS.find((action) => action.value === info.action)!.label}</span>
                                            <span>
                                              <b className={granted.has(info.id) ? undefined : styles.detailOffText}>{info.label}</b>
                                              {info.sensitive && <span className={styles.sensitive}>Sensitive</span>}
                                              <small>
                                                {info.description}
                                                {info.requires && ` Needs: ${info.requires.map((p) => permissionInfo(p).label.toLowerCase()).join(", ")}.`}
                                              </small>
                                            </span>
                                          </li>
                                        ))}
                                      </ul>
                                    </td>
                                  </tr>
                                )}
                              </Fragment>
                            );
                          })}
                        </tbody>
                      );
                    })}
                  </table>
                </div>
              )}
              <p className={styles.matrixLegend}>
                <span className={styles.legendSwatch} aria-hidden="true" /> Sensitive: moves money, shows personal data or controls access. Open a row to see what each box means.
              </p>
            </div>
          </div>

          <aside className={styles.roleSummary} aria-label="Summary">
            <h3>Summary</h3>
            <dl className={styles.summaryRows}>
              <div>
                <dt>Permissions</dt>
                <dd>
                  <b>{granted.size}</b> of {PERMISSION_CATALOG.length}
                </dd>
              </div>
              <div>
                <dt>Data access</dt>
                <dd>{DATA_SCOPES.find((scope) => scope.value === dataScope)!.label}</dd>
              </div>
              <div>
                <dt>Sensitive</dt>
                <dd>{sensitive.length ? sensitive.map((p) => permissionInfo(p).label).join(", ") : "None"}</dd>
              </div>
              {role && can("users.view") && (
                <div>
                  <dt>People</dt>
                  <dd>{holders.length ? holders.map((member) => member.name).join(", ") : "Nobody yet"}</dd>
                </div>
              )}
              {warnings.length > 0 && (
                <div className={styles.summaryWarnings}>
                  <dt>Worth knowing</dt>
                  <dd>
                    {warnings.map((warning) => (
                      <p key={warning}>{warning}</p>
                    ))}
                  </dd>
                </div>
              )}
            </dl>
            {!readOnly && (
              <div className={styles.summaryActions}>
                {((touched && problems.length > 0) || error) && (
                  <p className={styles.formError} role="alert">
                    {touched && problems.length ? problems.join(" ") : error}
                  </p>
                )}
                {isOwnRole && <p className={styles.formNote}>This is your own role: you can't take away your access to staff or roles.</p>}
                <Button type="submit" disabled={save.isPending || (!!role && !dirty)}>
                  {save.isPending ? "Saving…" : role ? "Save changes" : "Create role"}
                </Button>
                <Button variant="secondary" onClick={() => navigate("/settings/roles")}>
                  Cancel
                </Button>
                {role && (
                  <button type="button" className={`${styles.textButton} ${styles.textButtonDanger}`} onClick={() => setConfirmingDelete(true)}>
                    Delete role
                  </button>
                )}
              </div>
            )}
          </aside>
        </div>
      </form>

      {confirmingDelete && role && (
        <Dialog
          title={`Delete ${role.name}?`}
          submitLabel="Delete role"
          submittingLabel="Deleting…"
          cancelLabel="Keep role"
          submitting={remove.isPending}
          error={remove.error instanceof ApiError ? remove.error.message : remove.error ? "The role couldn't be deleted. Try again." : null}
          onSubmit={() =>
            remove
              .mutateAsync(role.id)
              .then(() => {
                showToast({ message: `${role.name} is deleted.` });
                navigate("/settings/roles");
              })
              .catch(() => undefined)
          }
          onClose={() => {
            remove.reset();
            setConfirmingDelete(false);
          }}
        >
          <p className={styles.dialogText}>Only a role nobody has can be deleted. The audit log keeps a record of it.</p>
        </Dialog>
      )}
    </>
  );
}
