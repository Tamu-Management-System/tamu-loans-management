import { useSearchParams } from "react-router";

/**
 * Which group of today's work is selected. Kept in the URL (?worklist=collect) so the
 * "Today" boxes, the worklist tabs and notification links all share one selection.
 */
export type WorklistFilter =
  | "collect"
  | "follow-up"
  | "complete"
  | "match"
  | "reversals"
  | "approvals"
  | "disbursement"
  | "access";

const PARAM = "worklist";

export function useWorklistFilter() {
  const [searchParams, setSearchParams] = useSearchParams();
  const selected = searchParams.get(PARAM) as WorklistFilter | null;

  /** Selects a filter, or clears it if it's already selected. */
  const toggle = (filter: WorklistFilter) => {
    setSearchParams(
      (params) => {
        const next = new URLSearchParams(params);
        if (next.get(PARAM) === filter) next.delete(PARAM);
        else next.set(PARAM, filter);
        return next;
      },
      { replace: true },
    );
  };

  /** Selects a filter, or shows everything when given null. */
  const select = (filter: WorklistFilter | null) => {
    setSearchParams(
      (params) => {
        const next = new URLSearchParams(params);
        if (filter) next.set(PARAM, filter);
        else next.delete(PARAM);
        return next;
      },
      { replace: true },
    );
  };

  return { selected, toggle, select };
}
