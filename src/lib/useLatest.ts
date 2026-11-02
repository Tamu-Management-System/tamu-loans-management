import { useLayoutEffect, useRef } from "react";

/**
 * A ref that always holds the latest value. For callbacks that run later (timers): they call
 * ref.current instead of the copy from the render that scheduled them, which may be out of date.
 */
export function useLatest<T>(value: T) {
  const ref = useRef(value);
  useLayoutEffect(() => {
    ref.current = value;
  });
  return ref;
}
