import { useSearchParams } from "react-router";
import type { BorrowerListParams } from "../../api/borrowers";
import type { BorrowerSort, BorrowerStatus } from "../../api/types";

const STATUSES: BorrowerStatus[] = ["active", "in-arrears", "cleared", "applicant"];
const SORTS: BorrowerSort[] = ["name", "balance"];

/**
 * The client list's search, tab, officer filter, sort and page, kept in the address
 * (e.g. /borrowers?status=in-arrears&page=2) so Back and shared links work.
 */
export function useBorrowerListParams() {
  const [searchParams, setSearchParams] = useSearchParams();

  const status = searchParams.get("status");
  const sort = searchParams.get("sort");
  const params: BorrowerListParams = {
    query: searchParams.get("q") ?? "",
    status: STATUSES.includes(status as BorrowerStatus) ? (status as BorrowerStatus) : null,
    officerId: searchParams.get("officer"),
    sort: SORTS.includes(sort as BorrowerSort) ? (sort as BorrowerSort) : "name",
    order: searchParams.get("order") === "desc" ? "desc" : "asc",
    page: Math.max(1, Number(searchParams.get("page")) || 1),
  };

  /** Changes some settings; anything other than the page sends the user back to page 1. */
  const update = (changes: Partial<BorrowerListParams>) => {
    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current);
        const set = (key: string, value: string | null | undefined) => (value ? next.set(key, value) : next.delete(key));
        if ("query" in changes) set("q", changes.query?.trim());
        if ("status" in changes) set("status", changes.status);
        if ("officerId" in changes) set("officer", changes.officerId);
        if ("sort" in changes) set("sort", changes.sort === "name" ? null : changes.sort);
        if ("order" in changes) set("order", changes.order === "asc" ? null : changes.order);
        set("page", "page" in changes && changes.page && changes.page > 1 ? String(changes.page) : null);
        return next;
      },
      // Typing a search replaces the entry (no history step per keystroke); tabs, filters, sort and pages add one so Back works
      { replace: "query" in changes },
    );
  };

  return { params, update };
}
