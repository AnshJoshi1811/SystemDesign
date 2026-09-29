import { useEffect, useState } from 'react';

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
 */
export function usePersistentState<T>(key: string, fallback: T) {
  const [value, setValue] = useState<T>(() => read(key, fallback));

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(value));
    } catch {
      // Storage unavailable (private mode, quota) — progress just won't persist.
    }
  }, [key, value]);

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
