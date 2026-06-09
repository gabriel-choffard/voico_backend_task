import { useEffect, useState } from "react";

/**
 * Returns a copy of `value` that only updates after it has stopped changing for
 * `delayMs`. Used to throttle search-as-you-type so each keystroke doesn't fire
 * its own API request, while the input/chips stay instantly responsive.
 */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);

  return debounced;
}
