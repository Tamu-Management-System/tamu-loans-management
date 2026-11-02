import { useSearchParams } from "react-router";
import type { ApplicationListParams } from "../../api/applications";
import type { ApplicationStatus } from "../../api/types";

const STATUSES: ApplicationStatus[] = ["draft", "awaiting-borrower", "submitted", "approved", "rejected"];

/**
 * The applications list's tab, search and page, kept in the address (e.g. /applications?status=submitted)
 * so Back, shared links and the notifications open the right tab.
 */
export function useApplicationListParams(defaultStatus: ApplicationStatus) {
  const [searchParams, setSearchParams] = useSearchParams();
  const status = searchParams.get("status") as ApplicationStatus | null;
  const params: ApplicationListParams = {
    status: status && STATUSES.includes(status) ? status : defaultStatus,
    query: searchParams.get("q") ?? "",
    page: Math.max(1, Number(searchParams.get("page")) || 1),
  };

  /** Anything other than the page sends the user back to page 1. Typing replaces the history entry. */
  const update = (changes: Partial<ApplicationListParams>) =>
    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current);
        if ("status" in changes) next.set("status", changes.status!);
        if ("query" in changes) {
          if (changes.query?.trim()) next.set("q", changes.query.trim());
          else next.delete("q");
        }
        if ("page" in changes && changes.page && changes.page > 1) next.set("page", String(changes.page));
        else next.delete("page");
        return next;
      },
      { replace: "query" in changes },
    );

  return { params, update };
}
