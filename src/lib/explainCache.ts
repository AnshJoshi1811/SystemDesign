// Browser-side cache for paragraph explanations.
// - Prefetches the current chapter and the next one (one request per chapter).
// - Lookup is by the same SHA-256 hash the Worker uses, so a selection that
//   matches a stored paragraph resolves with zero network calls.
// - A chapter's entries are dropped after it has been neither current nor next
//   for EVICT_AFTER_MS, so memory stays small while you move through the course.

const WORKER = 'https://sd-ai-proxy.anshsjoshi07.workers.dev';
const EVICT_AFTER_MS = 7 * 60_000; // 7 minutes, inside the 5–10 minute window

type Entry = { explanation: string; chapter: string };

const entries = new Map<string, Entry>();              // key: sha256 hash
const lastActive = new Map<string, number>();           // chapter -> last time it was current/next

const normalize = (t: string) => t.replace(/\s+/g, ' ').trim().toLowerCase();

export async function hashFor(mode: string, text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${mode}:${normalize(text)}`));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function getByHash(hash: string): string | null {
  return entries.get(hash)?.explanation ?? null;
}

export function putByHash(hash: string, explanation: string, chapter: string) {
  entries.set(hash, { explanation, chapter });
}

export async function prefetch(chapter: string) {
  lastActive.set(chapter, Date.now());
  try {
    const res = await fetch(`${WORKER}/explanations?chapter=${encodeURIComponent(chapter)}`);
    if (!res.ok) return;
    const { items } = (await res.json()) as { items: { hash: string; explanation: string }[] };
    for (const it of items) entries.set(it.hash, { explanation: it.explanation, chapter });
  } catch {
    // prefetch is best-effort; selection still works through /explain
  }
}

export function markActive(chapter: string) {
  lastActive.set(chapter, Date.now());
}

function evictStale() {
  const cutoff = Date.now() - EVICT_AFTER_MS;
  for (const [chapter, seen] of lastActive) {
    if (seen < cutoff) {
      lastActive.delete(chapter);
      for (const [hash, entry] of entries) {
        if (entry.chapter === chapter) entries.delete(hash);
      }
    }
  }
}

if (typeof window !== 'undefined') {
  setInterval(evictStale, 30_000);
}
