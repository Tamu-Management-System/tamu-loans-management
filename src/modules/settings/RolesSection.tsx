import { Fragment, useState } from "react";
import { Link } from "react-router";
import { useRoles } from "../../api/settings";
import { DATA_SCOPES, PERMISSION_CATALOG, PERMISSION_MODULES, permissionInfo } from "../../auth/permissions";
import { Icon } from "../../components/ui/Icon";
import styles from "./Settings.module.css";

/** Settings → Roles & permissions: the built-in roles (read-only) and the custom ones admins make, as cards or side by side. */
export function RolesSection() {
  const { data: roles, isPending, isError, refetch } = useRoles();
  const [view, setView] = useState<"cards" | "compare">("cards");

  return (
    <section aria-labelledby="roles-heading">
      <div className={styles.sectionHeader}>
        <div>
          <h2 id="roles-heading">Roles & permissions</h2>
          <p className={styles.subtitle}>Each person has one role; the role decides what they can see and do</p>
        </div>
        <Link to="/settings/roles/new" className={styles.primaryLink}>
          New role
        </Link>
      </div>

      <div className={styles.pills} role="group" aria-label="View">
        <button type="button" aria-pressed={view === "cards"} onClick={() => setView("cards")}>
          Roles
        </button>
        <button type="button" aria-pressed={view === "compare"} onClick={() => setView("compare")}>
          Compare
        </button>
      </div>

      {isError ? (
        <div className={styles.card}>
          <p className={styles.message} role="alert">
            Roles couldn't load.{" "}
            <button type="button" className={styles.linkButton} onClick={() => refetch()}>
              Try again
            </button>
          </p>
        </div>
      ) : isPending ? (
        <div className={styles.loading} aria-busy="true" aria-label="Loading roles" />
      ) : view === "cards" ? (
        <ul className={styles.roleList}>
          {roles.map((role) => {
            const sensitive = role.permissions.filter((permission) => permissionInfo(permission).sensitive);
            return (
              <li key={role.id}>
                <Link to={`/settings/roles/${role.id}`} className={styles.roleCard}>
                  <span className={styles.roleTitle}>
                    <b>{role.name}</b>
                    {role.builtIn && <span className={`${styles.chip} ${styles.chipNeutral}`}>Built-in</span>}
                  </span>
                  <span className={styles.roleDescription}>{role.description}</span>
                  <span className={styles.roleStats}>
                    <span>
                      <Icon name="shield" size={13} strokeWidth={2} /> {DATA_SCOPES.find((scope) => scope.value === role.dataScope)!.label}
                    </span>
                    <span>
                      {role.permissions.length} of {PERMISSION_CATALOG.length} permissions
                    </span>
                    {sensitive.length > 0 && <span className={styles.roleStatWarning}>{sensitive.length} sensitive</span>}
                  </span>
                  <span className={styles.roleMeta}>
                    {role.userCount === 1 ? "1 person" : `${role.userCount} people`} · {role.builtIn ? "View" : "Edit"}
                    <Icon name="chevronDown" size={15} strokeWidth={2} className={styles.menuChevron} />
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className={`${styles.card} ${styles.matrixCard}`}>
          <div className={styles.matrixScroll}>
            <table className={`${styles.matrix} ${styles.compare}`}>
              <thead>
                <tr>
                  <th scope="col">
                    <span className="sr-only">Permission</span>
                  </th>
                  {roles.map((role) => (
                    <th key={role.id} scope="col">
                      <Link to={`/settings/roles/${role.id}`}>{role.name}</Link>
                      <small>{DATA_SCOPES.find((scope) => scope.value === role.dataScope)!.label}</small>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {PERMISSION_MODULES.map((module) => (
                  <Fragment key={module.name}>
                    <tr className={styles.compareModule}>
                      <th scope="colgroup" colSpan={roles.length + 1}>
                        {module.name}
                      </th>
                    </tr>
                    {PERMISSION_CATALOG.filter((info) => info.module === module.name).map((info) => (
                      <tr key={info.id}>
                        <th scope="row" title={info.description}>
                          {info.label}
                          {info.sensitive && <Icon name="warning" size={12} strokeWidth={2.2} className={styles.cellSensitive} aria-label="Sensitive" />}
                        </th>
                        {roles.map((role) => (
                          <td key={role.id}>
                            {role.permissions.includes(info.id) ? (
                              <span className={styles.detailOn} aria-label="Yes">
                                ✓
                              </span>
                            ) : (
                              <span className={styles.noCell} aria-label="No">
                                –
                              </span>
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
