import { useEffect, useId, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { BORROWERS_PAGE_SIZE, useBorrowerList, useOfficers } from "../../api/borrowers";
import type { BorrowerSort, BorrowerStatus } from "../../api/types";
import { useAuth } from "../../auth/AuthContext";
import { Avatar } from "../../components/ui/Avatar";
import { Icon } from "../../components/ui/Icon";
import { Pagination } from "../../components/ui/Pagination";
import { SEARCH_FROM, Select } from "../../components/ui/Select";
import { formatUGX } from "../../lib/format";
import { BorrowerStatusChip } from "./BorrowerStatusChip";
import { useBorrowerListParams } from "./useBorrowerListParams";
import { useLatest } from "../../lib/useLatest";
import styles from "./BorrowersPage.module.css";

const SEARCH_DEBOUNCE_MS = 300;

const TABS: { status: BorrowerStatus | null; label: string; countKey: BorrowerStatus | "all" }[] = [
  { status: null, label: "All", countKey: "all" },
  { status: "active", label: "Active", countKey: "active" },
  { status: "in-arrears", label: "In arrears", countKey: "in-arrears" },
  { status: "cleared", label: "Cleared", countKey: "cleared" },
  { status: "applicant", label: "Applications", countKey: "applicant" },
];

function SortButton({ label, column, sort, order, onSort }: { label: string; column: BorrowerSort; sort: BorrowerSort; order: "asc" | "desc"; onSort: (column: BorrowerSort) => void }) {
  const active = sort === column;
  return (
    <button type="button" className={styles.sortButton} onClick={() => onSort(column)}>
      {label}
      <Icon name="chevronDown" size={13} strokeWidth={2.2} className={`${styles.sortIcon} ${active ? styles.sortIconActive : ""} ${active && order === "asc" ? styles.sortIconAscending : ""}`} />
    </button>
  );
}

/** Clients directory (user flow, phase 8): every client the user can see, with their loan status. */
export function BorrowersPage() {
  const { can, seesBranch } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  // The profile's "Clients" link comes back to this tab, search and page
  const profileState = { listSearch: location.search };
  const searchId = useId();
  
  const { params, update } = useBorrowerListParams();
  const { data, isPending, isError, isFetching, refetch } = useBorrowerList(params);
  const { data: officers = [] } = useOfficers(seesBranch);

  // Typing updates the address (and the search) after a short pause
  // The timer below runs later: it must use the latest update (and so the latest address)
  const latestUpdate = useLatest(update);
  const [searchInput, setSearchInput] = useState(params.query);
  useEffect(() => {
    if (searchInput.trim() === params.query) return;
    const timer = window.setTimeout(() => latestUpdate.current({ query: searchInput }), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only react to typing
  }, [searchInput]);

  const sortBy = (column: BorrowerSort) =>
    update({ sort: column, order: params.sort === column && params.order === "asc" ? "desc" : column === "balance" ? "desc" : "asc" });
  const ariaSort = (column: BorrowerSort) => (params.sort === column ? (params.order === "asc" ? "ascending" : "descending") : undefined);

  return (
    <>
      <div className={styles.header}>
        <div>
          <h1>Clients</h1>
          <p className={styles.subtitle}>{seesBranch ? "Every client in the market" : "Clients in your portfolio"}</p>
        </div>
        {can("applications.create") && (
          <Link to="/applications/new" className={styles.newApplication}>
            New application
          </Link>
        )}
      </div>

      <div className={styles.card}>
        <div className={styles.filters}>
          <label className={styles.search} htmlFor={searchId}>
            <Icon name="search" size={17} strokeWidth={1.8} />
            <input
              id={searchId}
              type="search"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Search name, phone, loan ID or full National ID"
              aria-label="Search clients by name, phone, loan or application ID, or full National ID number"
              autoComplete="off"
            />
          </label>
          {seesBranch && (
            <Select
              className={styles.officerFilter}
              value={params.officerId ?? ""}
              onChange={(officerId) => update({ officerId: officerId || null })}
              options={[{ value: "", label: "All officers" }, ...officers.map((officer) => ({ value: officer.id, label: officer.name }))]}
              searchable={officers.length > SEARCH_FROM}
              searchPlaceholder="Search officers"
              aria-label="Loan officer"
            />
          )}
        </div>

        <div className={styles.tabs} role="tablist" aria-label="Client status">
          {TABS.map((tab) => (
            <button key={tab.label} role="tab" aria-selected={params.status === tab.status} onClick={() => update({ status: tab.status })}>
              {tab.label} <span className={styles.tabCount}>{data ? data.counts[tab.countKey] : "–"}</span>
            </button>
          ))}
        </div>

        {isError ? (
          <p className={styles.message} role="alert">
            Clients couldn't load.{" "}
            <button type="button" className={styles.linkButton} onClick={() => refetch()}>
              Try again
            </button>
          </p>
        ) : isPending ? (
          <div className={styles.loading} aria-busy="true" aria-label="Loading clients" />
        ) : data.items.length === 0 ? (
          <p className={styles.message}>
            {params.query ? (
              <>
                No clients match “{params.query}”.{" "}
                <button
                  type="button"
                  className={styles.linkButton}
                  onClick={() => {
                    setSearchInput("");
                    update({ query: "" });
                  }}
                >
                  Clear search
                </button>
              </>
            ) : (
              "No clients here yet."
            )}
          </p>
        ) : (
          <>
            <table className={`${styles.table} ${isFetching ? styles.refreshing : ""}`}>
              <thead>
                <tr>
                  <th aria-sort={ariaSort("name")}>
                    <SortButton label="CLIENT" column="name" sort={params.sort} order={params.order} onSort={sortBy} />
                  </th>
                  <th>PHONE</th>
                  <th>LOAN</th>
                  <th className={styles.numeric} aria-sort={ariaSort("balance")}>
                    <SortButton label="BALANCE" column="balance" sort={params.sort} order={params.order} onSort={sortBy} />
                  </th>
                  <th className={styles.status}>STATUS</th>
                  {seesBranch && <th>OFFICER</th>}
                </tr>
              </thead>
              <tbody>
                {data.items.map((borrower) => (
                  <tr key={borrower.id} className={styles.row} onClick={() => navigate(`/borrowers/${borrower.id}`, { state: profileState })}>
                    <td>
                      <span className={styles.borrower}>
                        <Avatar name={borrower.name} />
                        <span>
                          {/* The link gives keyboard and screen-reader access; the whole row is also clickable */}
                          <Link to={`/borrowers/${borrower.id}`} state={profileState} className={styles.borrowerName} onClick={(event) => event.stopPropagation()}>
                            {borrower.name}
                          </Link>
                          <span className={styles.secondary}>{borrower.area}</span>
                        </span>
                      </span>
                    </td>
                    <td className={styles.phone}>{borrower.phone}</td>
                    <td className={styles.loan}>
                      {borrower.currentLoan?.id ?? borrower.application?.id ?? <span className={styles.secondary}>—</span>}
                    </td>
                    <td className={`${styles.numeric} ${styles.balance}`}>
                      {borrower.currentLoan ? formatUGX(borrower.currentLoan.balance) : <span className={styles.secondary}>—</span>}
                    </td>
                    <td className={styles.status}>
                      <BorrowerStatusChip status={borrower.status} daysPastDue={borrower.currentLoan?.daysPastDue} applicationStatus={borrower.application?.status} />
                    </td>
                    {seesBranch && <td className={styles.officer}>{borrower.officer.name}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
            <Pagination page={data.page} pageSize={BORROWERS_PAGE_SIZE} total={data.total} noun="clients" onPageChange={(page) => update({ page })} />
          </>
        )}
      </div>
    </>
  );
}
