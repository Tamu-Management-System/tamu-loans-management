import type { ReactNode } from "react";
import { useArrearsBreakdown, useEarlyWarnings, usePortfolioRisk, usePortfolioSummary, useRecentActivity, useTeamPerformance } from "../../api/portfolio";
import { useAuth } from "../../auth/AuthContext";
import { ComingSoon } from "../../components/ui/ComingSoon";
import { formatTime } from "../../lib/format";
import { ArrearsInsightsCard } from "./ArrearsInsightsCard";
import { EarlyWarningsCard } from "./EarlyWarningsCard";
import { ParTrendCard } from "./ParTrendCard";
import { PortfolioSummaryCard } from "./PortfolioSummaryCard";
import { RecentActivityCard } from "./RecentActivityCard";
import { TeamPerformanceCard } from "./TeamPerformanceCard";
import { PORTFOLIO_SECTION_ID } from "./sectionId";
import styles from "./Portfolio.module.css";

/** Loading placeholder, or the card once its data has arrived. */
function CardSlot<T>({ data, children }: { data: T | undefined; children: (data: T) => ReactNode }) {
  return data ? <>{children(data)}</> : <div className={`${styles.card} ${styles.loading}`} aria-busy="true" />;
}

/** Phase 2 card: blurred under a "Coming soon" overlay until Phase 2 is switched on. */
function UpcomingCard({ feature, module, children }: { feature: string; module: string; children: ReactNode }) {
  return (
    <ComingSoon feature={feature} module={module} className={styles.cardSlot}>
      {children}
    </ComingSoon>
  );
}

interface PortfolioSectionProps {
  announce: (message: string, undoTaskId?: string | null) => void;
}

/**
 * "My portfolio" for loan officers, "Branch portfolio" for admins. Risk cards (PAR30, arrears,
 * early warnings) belong to the arrears engine (Module 3) and stay under "Coming soon" for the MVP.
 */
export function PortfolioSection({ announce }: PortfolioSectionProps) {
  const { can, seesBranch } = useAuth();
  const isOfficer = can("loans.view") && !seesBranch;
  const isAdmin = can("users.view");

  // Hooks run for both layouts; the backend rejects what the user can't see, and those cards don't render
  const risk = usePortfolioRisk();
  const arrears = useArrearsBreakdown();

  if (!isOfficer && !isAdmin) return null;

  const asOf = risk.data ? `Balances as of ${formatTime(risk.data.asOf)} today · ` : "";
  const scopeNote = risk.data ? (isOfficer ? `your ${risk.data.loanCount} loans` : `all ${risk.data.loanCount} loans in the branch`) : "";

  return (
    <section id={PORTFOLIO_SECTION_ID} aria-labelledby="portfolio-heading">
      <div className={styles.sectionHeader}>
        <h2 id="portfolio-heading">{isOfficer ? "My portfolio" : "Branch portfolio"}</h2>
        <span className={styles.sectionNote}>
          {asOf}
          {scopeNote}
        </span>
      </div>

      <div className={styles.grid}>
        <UpcomingCard feature="PAR30 trend" module="Module 3 · Arrears aging engine">
          <CardSlot data={risk.data}>{(data) => <ParTrendCard risk={data} />}</CardSlot>
        </UpcomingCard>
        <UpcomingCard feature="Arrears insights" module="Module 3 · Arrears aging engine">
          <CardSlot data={arrears.data}>{(data) => <ArrearsInsightsCard arrears={data} />}</CardSlot>
        </UpcomingCard>
        {isOfficer ? <OfficerCards announce={announce} /> : <AdminCards targetPercent={risk.data?.targetPercent} />}
      </div>
    </section>
  );
}

function OfficerCards({ announce }: PortfolioSectionProps) {
  const warnings = useEarlyWarnings();
  const summary = usePortfolioSummary();
  return (
    <>
      <UpcomingCard feature="Early warnings" module="Module 3 · Arrears engine & SMS">
        <CardSlot data={warnings.data}>{(data) => <EarlyWarningsCard warnings={data} announce={announce} />}</CardSlot>
      </UpcomingCard>
      <CardSlot data={summary.data}>{(data) => <PortfolioSummaryCard summary={data} />}</CardSlot>
    </>
  );
}

function AdminCards({ targetPercent }: { targetPercent: number | undefined }) {
  const activity = useRecentActivity();
  const team = useTeamPerformance();
  return (
    <>
      <CardSlot data={activity.data}>{(data) => <RecentActivityCard activity={data} />}</CardSlot>
      <CardSlot data={team.data && targetPercent !== undefined ? team.data : undefined}>
        {(data) => <TeamPerformanceCard officers={data} targetPercent={targetPercent!} />}
      </CardSlot>
    </>
  );
}
