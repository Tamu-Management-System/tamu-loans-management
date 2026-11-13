import {
  useEffect,
  useRef,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { NavLink } from "react-router";
import { Icon, type IconName } from "./Icon";
import styles from "./MenuSheet.module.css";

export interface MenuSheetItem {
  to: string;
  label: string;
  icon: IconName;
  /** One line on what the page is for */
  text: string;
  /** Highlight this one as "you are here" even when the address only starts the same (e.g. /settings/users) */
  end?: boolean;
}

// How far (px) or how fast (px per ms) a downward drag has to go to close the sheet. Feel of the gesture, not a business rule.
const CLOSE_DRAG_PX = 110;
const CLOSE_FLICK_SPEED = 0.6;

/**
 * Phones: a sheet that slides up from the bottom with the pages to go to, each with a picture and a line on what it
 * is for. The current page is highlighted. It can be dragged down by its top bar and title to close it; tapping the dimmed area or pressing Escape closes it too.
 */
export function MenuSheet({
  title,
  hint,
  items,
  footer,
  onClose,
}: {
  title: string;
  hint: string;
  items: MenuSheetItem[];
  footer?: ReactNode;
  onClose: () => void;
}) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ startY: number; startAt: number; dy: number } | null>(
    null,
  );

  const onDragStart = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { startY: event.clientY, startAt: event.timeStamp, dy: 0 };
    if (sheetRef.current) sheetRef.current.style.transition = "none";
  };
  const onDragMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const current = drag.current;
    const sheet = sheetRef.current;
    if (!current || !sheet) return;
    // Only downwards: pulling up does nothing
    current.dy = Math.max(0, event.clientY - current.startY);
    sheet.style.transform = `translateY(${current.dy}px)`;
    if (backdropRef.current)
      backdropRef.current.style.opacity = String(
        Math.max(0, 1 - current.dy / sheet.offsetHeight),
      );
  };
  const onDragEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    const current = drag.current;
    const sheet = sheetRef.current;
    drag.current = null;
    if (!current || !sheet) return;
    const speed = current.dy / Math.max(1, event.timeStamp - current.startAt);
    if (
      current.dy > CLOSE_DRAG_PX ||
      (current.dy > 20 && speed > CLOSE_FLICK_SPEED)
    )
      return onClose();
    // Not far enough: settle back into place
    sheet.style.transition = "transform 0.2s ease";
    sheet.style.transform = "";
    if (backdropRef.current) backdropRef.current.style.opacity = "";
  };

  // The page behind stays put while the sheet is open
  useEffect(() => {
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = overflow;
    };
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    sheetRef.current?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <>
      <div
        className={styles.backdrop}
        ref={backdropRef}
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        className={styles.sheet}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        ref={sheetRef}
        tabIndex={-1}
      >
        {/* The part you grab: the bar, the title and the line under it */}
        <div
          className={styles.grab}
          onPointerDown={onDragStart}
          onPointerMove={onDragMove}
          onPointerUp={onDragEnd}
          onPointerCancel={onDragEnd}
        >
          <span className={styles.handle} aria-hidden="true" />
          <p className={styles.sheetTitle}>{title}</p>
          <p className={styles.sheetHint}>{hint}</p>
        </div>
        <ul>
          {items.map((item) => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `${styles.page} ${isActive ? styles.currentPage : ""}`
                }
                onClick={onClose}
              >
                <span className={styles.pageIcon}>
                  <Icon name={item.icon} size={18} strokeWidth={1.8} />
                </span>
                <span className={styles.pageText}>
                  <b>{item.label}</b>
                  <span>{item.text}</span>
                </span>
                <Icon
                  name="check"
                  size={18}
                  strokeWidth={2.2}
                  className={styles.tick}
                />
              </NavLink>
            </li>
          ))}
        </ul>
        {footer}
      </div>
    </>
  );
}

/** A dashed button for under the list (e.g. "Download this list as CSV") */
export function MenuSheetButton({
  icon,
  disabled,
  onClick,
  children,
}: {
  icon: IconName;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className={styles.footerButton}
      disabled={disabled}
      onClick={onClick}
    >
      <Icon
        name={icon}
        size={16}
        strokeWidth={1.8}
        className={icon === "upload" ? styles.footerIcon : undefined}
      />
      {children}
    </button>
  );
}
