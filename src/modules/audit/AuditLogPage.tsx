import { Fragment, useEffect, useId, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { useAuditLog, useExportAuditLog, type AuditParams } from "../../api/audit";
import { ApiError } from "../../api/client";
import type { AuditCategory, AuditEvent } from "../../api/types";
import { useAuth } from "../../auth/AuthContext";
import { Avatar } from "../../components/ui/Avatar";
import { Button } from "../../components/ui/Button";
import { Icon } from "../../components/ui/Icon";
import { Pagination } from "../../components/ui/Pagination";
import { SEARCH_FROM, Select } from "../../components/ui/Select";
import { useToast } from "../../components/ui/Toast";
import { formatDate, formatShortDate, formatTime, toDateInputValue } from "../../lib/format";
import { useLatest } from "../../lib/useLatest";
import styles from "./AuditLogPage.module.css";

type Range = "today" | "week" | "month";
const RANGES: { value: Range; label: string; days: number }[] = [
  { value: "today", label: "Today", days: 0 },
  { value: "week", label: "Last 7 days", days: 6 },
  { value: "month", label: "Last 30 days", days: 29 },
];

const AUDIT_CATEGORIES: { value: AuditCategory; label: string }[] = [
  { value: "money", label: "Money" },
  { value: "decisions", label: "Decisions" },
  { value: "access", label: "Data access" },
  { value: "borrowers", label: "Client changes" },
  { value: "admin", label: "Staff and settings" },
  { value: "signin", label: "Sign-ins" },
];
const SEARCH_DEBOUNCE_MS = 300;

const capitalise = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** Range, person, type, search and page, kept in the address */
function useAuditFilters() {
  const [searchParams, setSearchParams] = useSearchParams();
  const rangeParam = searchParams.get("range") as Range | null;
  const range = RANGES.find((r) => r.value === rangeParam) ?? RANGES[1];
  const categoryParam = searchParams.get("type") as AuditCategory | null;
  const today = new Date();
  const from = new Date(today);
  from.setDate(today.getDate() - range.days);
  const params: AuditParams = {
    from: toDateInputValue(from),
    to: toDateInputValue(today),
    actorId: searchParams.get("person"),
    category: AUDIT_CATEGORIES.some((c) => c.value === categoryParam) ? categoryParam : null,
    query: searchParams.get("q") ?? "",
    page: Math.max(1, Number(searchParams.get("page")) || 1),
  };
  const update = (changes: Record<string, string | null>, replace = false) =>
    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current);
        Object.entries(changes).forEach(([key, value]) => (value ? next.set(key, value) : next.delete(key)));
        if (!("page" in changes)) next.delete("page");
        return next;
      },
      { replace },
    );
  return { range: range.value, params, update };
}

/** The audit log (Admin, Finance): everything done in the system, who did it and when. Nothing here can be changed. */
export function AuditLogPage() {
  const { can } = useAuth();
  const searchId = useId();
  const showToast = useToast();
  const { range, params, update } = useAuditFilters();
  const { data, isPending, isError, isFetching, refetch } = useAuditLog(params);
  const exportLog = useExportAuditLog();
  const [open, setOpen] = useState<string | null>(null);

  // The timer below runs later: it must use the latest update (and so the latest address)
  const latestUpdate = useLatest(update);
  const [searchInput, setSearchInput] = useState(params.query);
  useEffect(() => {
    if (searchInput.trim() === params.query) return;
    const timer = window.setTimeout(() => latestUpdate.current({ q: searchInput.trim() || null }, true), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only react to typing
  }, [searchInput]);

  const people = data?.people ?? [];
  const filtered = !!(params.query || params.actorId || params.category);
  const exportCsv = () =>
    exportLog
      .mutateAsync(params)
      .then(() => showToast({ message: `Exported ${data?.total ?? ""} events. The export is in the log too.` }))
      .catch((error) => showToast({ message: error instanceof ApiError ? error.message : "The export didn't work. Try again." }));

  return (
    <>
      <div className={styles.header}>
        <div>
          <h1>Audit log</h1>
          <p className={styles.subtitle}>Everything done in Tamu Loans: who, what and when. Nothing here can be changed or deleted.</p>
        </div>
        {can("audit.export") && (
          <Button variant="secondary" onClick={exportCsv} disabled={exportLog.isPending || !data?.total}>
            <Icon name="upload" size={16} strokeWidth={1.8} className={styles.exportIcon} />
            {exportLog.isPending ? "Exporting…" : "Export CSV"}
          </Button>
        )}
      </div>

      <div className={styles.card}>
        <div className={styles.ranges} role="group" aria-label="Dates">
          {RANGES.map((option) => (
            <button key={option.value} type="button" aria-pressed={range === option.value} onClick={() => update({ range: option.value === "week" ? null : option.value })}>
              {option.label}
            </button>
          ))}
        </div>

        <div className={styles.filters}>
          <label className={styles.search} htmlFor={searchId}>
            <Icon name="search" size={17} strokeWidth={1.8} />
            <input id={searchId} type="search" value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="Search what happened, loan ID or client" aria-label="Search the audit log" autoComplete="off" />
          </label>
          <Select
            className={styles.select}
            value={params.actorId ?? ""}
            onChange={(person) => update({ person: person || null })}
            options={[{ value: "", label: "Everyone" }, ...people.map((person) => ({ value: person.id, label: person.name }))]}
            searchable={people.length > SEARCH_FROM}
            searchPlaceholder="Search people"
            aria-label="Person"
          />
          <Select
            className={styles.select}
            value={params.category ?? ""}
            onChange={(type) => update({ type: type || null })}
            options={[{ value: "", label: "All types" }, ...AUDIT_CATEGORIES]}
            aria-label="Type"
          />
        </div>

        {isError ? (
          <p className={styles.message} role="alert">
            The audit log couldn't load.{" "}
            <button type="button" className={styles.linkButton} onClick={() => refetch()}>
              Try again
            </button>
          </p>
        ) : isPending ? (
          <div className={styles.loading} aria-busy="true" aria-label="Loading the audit log" />
        ) : data.items.length === 0 ? (
          <p className={styles.message}>{filtered ? "Nothing matches these filters." : "Nothing happened in these dates."}</p>
        ) : (
          <>
            <table className={`${styles.table} ${isFetching ? styles.refreshing : ""}`}>
              <thead>
                <tr>
                  <th>WHEN</th>
                  <th>WHO</th>
                  <th>WHAT</th>
                  <th>TYPE</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((event) => {
                  const expanded = open === event.id;
                  return (
                    <Fragment key={event.id}>
                      <tr className={`${styles.row} ${expanded ? styles.rowOpen : ""}`} onClick={() => setOpen(expanded ? null : event.id)}>
                        <td className={styles.when}>
                          {formatShortDate(event.at)}
                          <span className={styles.secondary}>{formatTime(event.at)}</span>
                        </td>
                        <td>
                          <span className={styles.person}>
                            <Avatar name={event.actor.name} src={event.actor.photoUrl} size={32} />
                            <span>
                              <b>{event.actor.name}</b>
                              <span className={styles.secondary}>{event.actor.role}</span>
                            </span>
                          </span>
                        </td>
                        <td className={styles.what}>
                          <button type="button" className={styles.whatButton} aria-expanded={expanded} onClick={(clickEvent) => {
                              clickEvent.stopPropagation();
                              setOpen(expanded ? null : event.id);
                            }}>
                            {capitalise(event.description)}
                          </button>
                        </td>
                        <td>
                          <span className={`${styles.chip} ${styles[`chip_${event.category}`]}`}>{AUDIT_CATEGORIES.find((c) => c.value === event.category)!.label}</span>
                        </td>
                      </tr>
                      {expanded && (
                        <tr className={styles.detailRow}>
                          <td colSpan={4}>
                            <EventDetails event={event} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
            <Pagination page={data.page} pageSize={data.pageSize} total={data.total} noun="events" onPageChange={(page) => update({ page: page > 1 ? String(page) : null })} />
          </>
        )}
      </div>
    </>
  );
}

function EventDetails({ event }: { event: AuditEvent }) {
  return (
    <dl className={styles.details}>
      <div>
        <dt>When</dt>
        <dd>
          {formatDate(event.at)}, {new Date(event.at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit" })}
        </dd>
      </div>
      <div>
        <dt>Who</dt>
        <dd>
          {event.actor.name} · {event.actor.role}
        </dd>
      </div>
      {event.target && (
        <div>
          <dt>Record</dt>
          <dd>
            <Link to={event.target.href}>Open {event.target.label}</Link>
          </dd>
        </div>
      )}
      {event.details?.map((detail) => (
        <div key={detail.label}>
          <dt>{detail.label}</dt>
          <dd className={styles.change}>{detail.value}</dd>
        </div>
      ))}
      <div>
        <dt>Event</dt>
        <dd className={styles.eventId}>{event.id}</dd>
      </div>
    </dl>
  );
}
