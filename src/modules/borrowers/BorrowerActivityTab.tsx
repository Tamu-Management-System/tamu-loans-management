import { useState } from "react";
import { useBorrowerActivity } from "../../api/borrowers";
import type { BorrowerActivityCategory, BorrowerActivityItem } from "../../api/types";
import { Icon, type IconName } from "../../components/ui/Icon";
import { daysSince, formatTime } from "../../lib/format";
import styles from "./BorrowerActivityTab.module.css";

const FILTERS: { category: BorrowerActivityCategory | null; label: string }[] = [
  { category: null, label: "All" },
  { category: "money", label: "Money" },
  { category: "contact", label: "Contact" },
  { category: "changes", label: "Changes" },
  { category: "access", label: "Access" },
];

const CATEGORY_ICON: Record<BorrowerActivityCategory, IconName> = {
  money: "coins",
  contact: "phone",
  changes: "document",
  access: "eye",
};

/** "Today", "Yesterday" or "Tue 8 Sep 2026" */
function dayHeading(iso: string) {
  const days = daysSince(iso);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  // en-US parts so September is "Sep", like the rest of the app
  const date = new Date(iso);
  const part = (options: Intl.DateTimeFormatOptions) => date.toLocaleDateString("en-US", options);
  return `${part({ weekday: "short" })} ${date.getDate()} ${part({ month: "short" })} ${date.getFullYear()}`;
}

/** Groups events (already newest first) by calendar day. */
function byDay(items: BorrowerActivityItem[]) {
  const groups: { heading: string; items: BorrowerActivityItem[] }[] = [];
  for (const item of items) {
    const heading = dayHeading(item.at);
    const last = groups.at(-1);
    if (last?.heading === heading) last.items.push(item);
    else groups.push({ heading, items: [item] });
  }
  return groups;
}

/** Everything that happened with the borrower: money, contact, changes and who looked at their ID or documents. */
export function BorrowerActivityTab({ borrowerId }: { borrowerId: string }) {
  const [category, setCategory] = useState<BorrowerActivityCategory | null>(null);
  const { data, isPending, isError, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } = useBorrowerActivity(borrowerId, category);
  const items = data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <section className={styles.card} aria-labelledby="borrower-activity">
      <div className={styles.header}>
        <h2 id="borrower-activity" className={styles.title}>
          Activity
        </h2>
        <div className={styles.filters} role="group" aria-label="Show">
          {FILTERS.map((filter) => (
            <button key={filter.label} type="button" aria-pressed={category === filter.category} onClick={() => setCategory(filter.category)}>
              {filter.label}
            </button>
          ))}
        </div>
      </div>

      {isError ? (
        <p className={styles.message} role="alert">
          The activity couldn't load.{" "}
          <button type="button" className={styles.linkButton} onClick={() => refetch()}>
            Try again
          </button>
        </p>
      ) : isPending ? (
        <div className={styles.loading} aria-busy="true" aria-label="Loading activity" />
      ) : items.length === 0 ? (
        <p className={styles.message}>Nothing here yet.</p>
      ) : (
        <>
          {byDay(items).map((group) => (
            <div key={group.heading} className={styles.day}>
              <h3 className={styles.dayHeading}>{group.heading}</h3>
              <ol className={styles.events}>
                {group.items.map((item) => (
                  <li key={item.id} className={styles.event}>
                    <span className={`${styles.eventIcon} ${styles[item.category]}`} aria-hidden="true">
                      <Icon name={CATEGORY_ICON[item.category]} size={15} strokeWidth={1.9} />
                    </span>
                    <span className={styles.eventText}>
                      <span className={styles.eventDescription}>{item.description}</span>
                      <span className={styles.eventMeta}>
                        {item.actor.name} · {item.actor.role} · {formatTime(item.at)}
                      </span>
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          ))}
          {hasNextPage && (
            <button type="button" className={styles.showOlder} onClick={() => fetchNextPage()} disabled={isFetchingNextPage}>
              {isFetchingNextPage ? "Loading…" : "Show older"}
            </button>
          )}
        </>
      )}
    </section>
  );
}
