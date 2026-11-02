import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { useDismiss } from "../../lib/useDismiss";
import { Icon } from "./Icon";
import styles from "./Select.module.css";

export interface SelectOption<T extends string> {
  value: T;
  label: string;
  /** Extra text the search also matches (e.g. a phone number), not shown */
  keywords?: string;
}

interface SelectProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  options: SelectOption<T>[];
  /** For a <label htmlFor> */
  id?: string;
  "aria-label"?: string;
  /** Shown when the value isn't one of the options */
  placeholder?: string;
  /** Long lists: a search box at the top of the list filters the options */
  searchable?: boolean;
  searchPlaceholder?: string;
  disabled?: boolean;
  autoFocus?: boolean;
  /** Width and layout from the caller; without one the control fills its container (as in a form field) */
  className?: string;
}

/** Lists longer than this get a search box */
export const SEARCH_FROM = 8;
const LIST_MAX_HEIGHT = 300;
const TYPEAHEAD_RESET_MS = 600;

/**
 * The app's dropdown, used instead of the browser's <select> so it looks the same everywhere.
 *
 * Short lists follow the "select-only combobox" pattern: focus stays on the button; the arrow keys,
 * Home, End and typing move through the options; Enter or Space choose. Long lists (`searchable`)
 * open with a search box that filters as you type; the arrow keys and Enter work from the box.
 * Escape closes only the list, never a dialog it sits in. The list is positioned against the
 * window, so a dialog's scrolling body can't clip it, and opens upwards when there isn't room below.
 */
export function Select<T extends string>({
  value,
  onChange,
  options,
  id,
  placeholder = "Choose…",
  searchable = false,
  searchPlaceholder = "Search",
  disabled = false,
  autoFocus = false,
  className = "",
  ...aria
}: SelectProps<T>) {
  const ownId = useId();
  const buttonId = id ?? `${ownId}-button`;
  const listId = `${ownId}-list`;
  const wrapperRef = useRef<HTMLSpanElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [position, setPosition] = useState<{ top: number; left: number; width: number; maxHeight: number; up: boolean } | null>(null);
  const typed = useRef({ text: "", at: 0 });

  const selected = options.find((option) => option.value === value) ?? null;
  const needle = query.trim().toLowerCase();
  const shown = needle ? options.filter((option) => `${option.label} ${option.keywords ?? ""}`.toLowerCase().includes(needle)) : options;

  const close = useCallback(() => setOpen(false), []);
  useDismiss(wrapperRef, open, close);

  // Place the list under the button (or above it when there's more room there), and keep it there
  const place = useCallback(() => {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;
    const below = window.innerHeight - rect.bottom - 8;
    const above = rect.top - 8;
    const up = below < Math.min(LIST_MAX_HEIGHT, 220) && above > below;
    setPosition({ top: up ? rect.top - 4 : rect.bottom + 4, left: rect.left, width: rect.width, maxHeight: Math.min(LIST_MAX_HEIGHT, up ? above : below), up });
  }, []);
  useLayoutEffect(() => {
    if (!open) return;
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, place]);

  // Searchable: typing goes straight into the search box (once the panel is placed and rendered)
  const placed = position !== null;
  useEffect(() => {
    if (open && placed && searchable) searchRef.current?.focus();
  }, [open, placed, searchable]);

  // Keep the active option in view
  useEffect(() => {
    if (open) listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [open, active]);

  const openList = () => {
    if (disabled || options.length === 0) return;
    setQuery("");
    const index = options.findIndex((option) => option.value === value);
    setActive(index >= 0 ? index : 0);
    setOpen(true);
  };
  const closeList = () => {
    setOpen(false);
    buttonRef.current?.focus();
  };
  const choose = (option: SelectOption<T> | undefined) => {
    if (!option) return;
    if (option.value !== value) onChange(option.value);
    closeList();
  };

  /** Arrow keys, Home/End, Enter and Escape: the same from the button and from the search box. */
  const navigate = (event: KeyboardEvent, fromSearch: boolean) => {
    const last = shown.length - 1;
    switch (event.key) {
      case "ArrowDown":
      case "ArrowUp":
        event.preventDefault();
        if (!open) openList();
        else setActive((current) => Math.min(last, Math.max(0, current + (event.key === "ArrowDown" ? 1 : -1))));
        return true;
      case "Home":
      case "End":
        if (!open || fromSearch) return false; // in the search box they move the text cursor
        event.preventDefault();
        setActive(event.key === "Home" ? 0 : last);
        return true;
      case "Enter":
        event.preventDefault();
        if (open) choose(shown[active]);
        else openList();
        return true;
      case "Escape":
        if (!open) return false;
        // Close just the list: don't let a dialog around it close too
        event.preventDefault();
        event.stopPropagation();
        closeList();
        return true;
      case "Tab":
        setOpen(false);
        return true;
    }
    return false;
  };

  const onButtonKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (navigate(event, false)) return;
    if (event.key === " ") {
      event.preventDefault();
      if (open) choose(shown[active]);
      else openList();
      return;
    }
    // Type to jump to an option (or, for a searchable list, to start searching)
    if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      if (searchable) {
        event.preventDefault();
        openList();
        setQuery(event.key);
        return;
      }
      const now = Date.now();
      typed.current = { text: (now - typed.current.at > TYPEAHEAD_RESET_MS ? "" : typed.current.text) + event.key.toLowerCase(), at: now };
      const match = options.findIndex((option) => option.label.toLowerCase().startsWith(typed.current.text));
      if (match >= 0) {
        if (open) setActive(match);
        else if (options[match].value !== value) onChange(options[match].value);
      }
    }
  };

  return (
    <span ref={wrapperRef} className={`${styles.select} ${className || styles.fill}`}>
      <button
        ref={buttonRef}
        id={buttonId}
        type="button"
        role={searchable ? undefined : "combobox"}
        className={`${styles.button} ${open ? styles.buttonOpen : ""}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open && !searchable ? `${listId}-${active}` : undefined}
        aria-label={aria["aria-label"]}
        disabled={disabled}
        autoFocus={autoFocus}
        onClick={() => (open ? setOpen(false) : openList())}
        onKeyDown={onButtonKeyDown}
      >
        <span className={selected ? styles.value : styles.placeholder}>{selected ? selected.label : placeholder}</span>
        <Icon name="chevronDown" size={16} strokeWidth={2} className={`${styles.chevron} ${open ? styles.chevronOpen : ""}`} />
      </button>
      {open && position && (
        <div className={`${styles.panel} ${position.up ? styles.panelUp : ""}`} style={{ top: position.top, left: position.left, minWidth: position.width, maxHeight: position.maxHeight }}>
          {searchable && (
            <div className={styles.search}>
              <Icon name="search" size={15} strokeWidth={1.9} />
              <input
                ref={searchRef}
                type="search"
                role="combobox"
                aria-expanded="true"
                aria-controls={listId}
                aria-autocomplete="list"
                aria-activedescendant={shown.length ? `${listId}-${active}` : undefined}
                aria-label={searchPlaceholder}
                placeholder={searchPlaceholder}
                value={query}
                autoComplete="off"
                onChange={(event) => {
                  setQuery(event.target.value);
                  setActive(0);
                }}
                onKeyDown={(event) => navigate(event, true)}
              />
            </div>
          )}
          <ul ref={listRef} id={listId} role="listbox" aria-labelledby={buttonId} tabIndex={-1} className={styles.list}>
            {shown.map((option, index) => (
              <li
                key={option.value}
                id={`${listId}-${index}`}
                data-index={index}
                role="option"
                aria-selected={option.value === value}
                className={`${styles.option} ${index === active ? styles.optionActive : ""}`}
                onPointerMove={() => setActive(index)}
                // Keep focus where it is while choosing
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choose(option)}
              >
                <span>{option.label}</span>
                {option.value === value && <Icon name="check" size={15} strokeWidth={2.4} className={styles.check} />}
              </li>
            ))}
            {shown.length === 0 && (
              <li className={styles.empty} role="presentation">
                No matches for “{query.trim()}”
              </li>
            )}
          </ul>
        </div>
      )}
    </span>
  );
}
