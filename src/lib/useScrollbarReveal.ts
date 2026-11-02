import { useEffect } from "react";

const SCROLL_AREA_CLASS = "scroll-area";
const SCROLLING_CLASS = "is-scrolling";
const HIDE_DELAY_MS = 900;

/** Shows the slim `.scroll-area` scrollbar only while an area is being scrolled. */
export function useScrollbarReveal() {
  useEffect(() => {
    const hideTimers = new WeakMap<Element, number>();

    const handleScroll = (event: Event) => {
      const element = event.target;
      if (!(element instanceof Element) || !element.classList.contains(SCROLL_AREA_CLASS)) return;

      element.classList.add(SCROLLING_CLASS);
      window.clearTimeout(hideTimers.get(element));
      hideTimers.set(
        element,
        window.setTimeout(() => element.classList.remove(SCROLLING_CLASS), HIDE_DELAY_MS),
      );
    };

    document.addEventListener("scroll", handleScroll, true);
    return () => document.removeEventListener("scroll", handleScroll, true);
  }, []);
}
