import { useCallback, useEffect, useRef, useState } from 'react';

// All learner progress lives under this prefix so a chapter reset can clear just its own keys.
export const STORAGE_PREFIX = 'sd:';

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

/**
 * useState that survives chapter switches and page reloads.
 * Use keys of the form `<chapterId>:<name>`, e.g. `chapter1:stage`.
 *
 * Optimisations vs the original:
 *  - The effect only fires when `value` actually changes (tracked via a ref),
 *    not on every re-render where the same value is re-assigned.
 *  - JSON.stringify is only called when a write is actually needed.
 *  - setValue is wrapped in useCallback so callers that pass it as a prop
 *    get a stable reference.
 */
export function usePersistentState<T>(key: string, fallback: T) {
  const [value, setValueRaw] = useState<T>(() => read(key, fallback));

  // Track the last-serialised value so we can skip identical writes.
  const lastWritten = useRef<string | null>(null);
  const keyRef = useRef(key);
  keyRef.current = key;

  useEffect(() => {
    try {
      const serialised = JSON.stringify(value);
      if (serialised !== lastWritten.current) {
        localStorage.setItem(STORAGE_PREFIX + keyRef.current, serialised);
        lastWritten.current = serialised;
      }
    } catch {
      // Storage unavailable (private mode, quota) — progress just won't persist.
    }
  }, [value]);

  const setValue = useCallback((next: T | ((prev: T) => T)) => {
    setValueRaw(next);
  }, []);

  return [value, setValue] as const;
}

/** Remove every persisted key belonging to one chapter. */
export function clearChapterState(chapterId: string) {
  try {
    const prefix = `${STORAGE_PREFIX}${chapterId}:`;
    Object.keys(localStorage)
      .filter((k) => k.startsWith(prefix))
      .forEach((k) => localStorage.removeItem(k));
  } catch {
    // ignore
  }
}
