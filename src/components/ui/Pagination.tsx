import { Icon } from "./Icon";
import styles from "./Pagination.module.css";

interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  /** What's being counted, e.g. "borrowers" */
  noun: string;
  onPageChange: (page: number) => void;
}

/** Page numbers to show: first, last, and the current page with one on each side. */
function visiblePages(page: number, pageCount: number): (number | "gap")[] {
  const pages = new Set([1, pageCount, page - 1, page, page + 1].filter((p) => p >= 1 && p <= pageCount));
  const sorted = [...pages].sort((a, b) => a - b);
  return sorted.flatMap((p, index) => (index > 0 && p - sorted[index - 1] > 1 ? ["gap" as const, p] : [p]));
}

/** "Showing 1–25 of 210 borrowers" with previous / next and page numbers. */
export function Pagination({ page, pageSize, total, noun, onPageChange }: PaginationProps) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const first = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const last = Math.min(total, page * pageSize);

  return (
    <nav className={styles.pagination} aria-label="Pages">
      <span className={styles.summary}>
        Showing {first}–{last} of {total} {noun}
      </span>
      {pageCount > 1 && (
        <div className={styles.pages}>
          <button type="button" onClick={() => onPageChange(page - 1)} disabled={page === 1} aria-label="Previous page">
            <Icon name="chevronDown" size={16} strokeWidth={2} className={styles.previousIcon} />
          </button>
          {visiblePages(page, pageCount).map((item, index) =>
            item === "gap" ? (
              <span key={`gap-${index}`} className={styles.gap} aria-hidden="true">
                …
              </span>
            ) : (
              <button key={item} type="button" onClick={() => onPageChange(item)} aria-current={item === page ? "page" : undefined} aria-label={`Page ${item}`}>
                {item}
              </button>
            ),
          )}
          <button type="button" onClick={() => onPageChange(page + 1)} disabled={page === pageCount} aria-label="Next page">
            <Icon name="chevronDown" size={16} strokeWidth={2} className={styles.nextIcon} />
          </button>
        </div>
      )}
    </nav>
  );
}
