import { useDashboardToday } from "../../api/dashboard";
import type { DashboardToday } from "../../api/types";
import { useAuth } from "../../auth/AuthContext";
import { formatUGX } from "../../lib/format";
import { SummaryTile, type SummaryTileProps } from "./SummaryTile";
import { useWorklistFilter, type WorklistFilter } from "./worklistFilter";
import styles from "./TodaySummary.module.css";

type TileDefinition = Omit<SummaryTileProps, "selected" | "onSelect"> & { filter: WorklistFilter | null };

const plural = (count: number, singular: string, pluralForm: string) => (count === 1 ? singular : pluralForm);

/** Turns the API's sections into boxes, in the order of the approved design. */
function buildTiles(today: DashboardToday, { marketWide, canApprove }: { marketWide: boolean; canApprove: boolean }): TileDefinition[] {
  const tiles: TileDefinition[] = [];
  const { activeLoans, collections, followUps, applicationsToComplete, paymentReversals, awaitingApproval, approvedNotDisbursed, accessRequests } = today;

  // Active loans first, then what's due to collect (the client's order)
  if (activeLoans)
    tiles.push({
      filter: null,
      href: "/loans/active",
      label: "Active loans",
      icon: "loans",
      value: activeLoans.count,
      detail: `${formatUGX(activeLoans.outstanding)} outstanding · ${activeLoans.lateCount} late`,
    });
  if (collections)
    tiles.push({
      // Market-wide it's everyone's borrowers, so the box opens Payments rather than filtering your worklist
      ...(marketWide ? { filter: null, href: "/payments" } : { filter: "collect" as const }),
      label: "Due to collect",
      icon: "coins",
      value: collections.dueCount,
      detail: `${formatUGX(collections.collectedAmount)} collected of ${formatUGX(collections.expectedAmount)} expected${marketWide ? " · whole market" : ""}`,
      progress: collections.expectedAmount ? collections.collectedAmount / collections.expectedAmount : 0,
    });
  if (followUps)
    tiles.push({
      filter: "follow-up",
      label: "Overdue follow-ups",
      icon: "clock",
      value: followUps.overdueCount,
      // Loans with the recovery team aren't on the list, so say so: otherwise they seem to be missing
      detail: [
        `${followUps.over30DaysCount} ${plural(followUps.over30DaysCount, "is", "are")} over 30 days late`,
        followUps.withRecoveryCount > 0 && `${followUps.withRecoveryCount} more with the recovery team`,
      ]
        .filter(Boolean)
        .join(" · "),
    });
  if (applicationsToComplete)
    tiles.push({
      filter: "complete",
      label: "Applications to complete",
      icon: "document",
      value: applicationsToComplete.count,
      detail: "Missing documents or guarantor consent",
    });
  if (paymentReversals)
    tiles.push({
      filter: "reversals",
      label: "Payment reversals",
      icon: "undo",
      value: paymentReversals.count,
      detail: `${formatUGX(paymentReversals.amount)} waiting to be reversed`,
    });
  if (awaitingApproval)
    tiles.push({
      filter: "approvals",
      label: canApprove ? "Waiting for approval" : "Waiting on Finance",
      icon: "document",
      value: awaitingApproval.count,
      detail: `${awaitingApproval.over48HoursCount} waiting over 48 hours`,
    });
  if (approvedNotDisbursed)
    tiles.push({
      filter: "disbursement",
      label: "Approved, not disbursed",
      icon: "send",
      value: approvedNotDisbursed.count,
      detail: `${formatUGX(approvedNotDisbursed.amount)} still to pay out`,
    });
  if (accessRequests)
    tiles.push({
      filter: "access",
      label: "Access requests",
      icon: "person",
      value: accessRequests.count,
      detail: "Password resets and invites",
    });
  return tiles;
}

/** The "Today" section: four boxes summarising today's work. Selecting one filters the worklist. */
export function TodaySummary() {
  const { data: today, isPending, isError, refetch } = useDashboardToday();
  const { selected, toggle } = useWorklistFilter();
  const { can, seesBranch } = useAuth();
  const tiles = today ? buildTiles(today, { marketWide: seesBranch, canApprove: can("applications.approve") }) : [];

  if (today && tiles.length === 0) return null;

  return (
    <section aria-labelledby="today-heading">
      <div className={styles.sectionHeader}>
        {/* Visible "Today" title removed at the user's request; kept for screen readers */}
        <h2 id="today-heading" className="sr-only">
          Today
        </h2>
        <span className={styles.sectionNote}>Select a box to filter the worklist</span>
      </div>

      {isError ? (
        <p className={styles.loadError} role="alert">
          Today's numbers couldn't load.{" "}
          <button type="button" onClick={() => refetch()}>
            Try again
          </button>
        </p>
      ) : (
        <div className={styles.tiles} aria-busy={isPending}>
          {isPending
            ? Array.from({ length: 4 }, (_, index) => <div key={index} className={`${styles.tile} ${styles.tileLoading}`} />)
            : tiles.map(({ filter, ...tile }) => (
                <SummaryTile key={tile.label} {...tile} selected={!!filter && selected === filter} onSelect={() => filter && toggle(filter)} />
              ))}
        </div>
      )}
    </section>
  );
}
