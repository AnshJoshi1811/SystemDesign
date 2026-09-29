// Pure Snowflake / ID helpers for Chapter 7. No React here.

/** Bits per field; the sign bit is always 1 more, so a valid layout sums to 63. */
export interface BitLayout {
  t: number;
  d: number;
  m: number;
  s: number;
}

export interface SfRuntime {
  lastTs: number;
  seq: number;
}

export type RollbackPolicy = 'IGNORE' | 'REJECT' | 'WAIT' | 'BACKUP_WORKER';
export type OverflowMode = 'WAIT' | 'WRAP';
export type EpochId = 'twitter' | 'custom2026' | 'unix';

export interface WorkerNode {
  id: string;
  name: string;
  datacenterId: number;
  machineId: number;
}

export const TWITTER_EPOCH = 1288834974657; // Nov 04 2010 01:42:54 UTC (book)
export const EPOCHS: { id: EpochId; label: string; ms: number }[] = [
  { id: 'twitter', label: 'Twitter 2010', ms: TWITTER_EPOCH },
  { id: 'custom2026', label: 'Jan 2026', ms: 1767225600000 },
  { id: 'unix', label: 'Unix 1970', ms: 0 },
];

export const BOOK_LAYOUT: BitLayout = { t: 41, d: 5, m: 5, s: 12 };
export const BIT_BOUNDS: Record<keyof BitLayout, [number, number]> = { t: [30, 45], d: [1, 10], m: [1, 10], s: [4, 20] };
export const LAYOUT_PRESETS: { label: string; layout: BitLayout }[] = [
  { label: 'Book default', layout: BOOK_LAYOUT },
  { label: 'Long-lived, low traffic', layout: { t: 44, d: 5, m: 5, s: 9 } },
  { label: 'Few DCs, many machines', layout: { t: 41, d: 2, m: 8, s: 12 } },
];
export const MS_PER_YEAR = 1000 * 60 * 60 * 24 * 365; // book uses 365-day years (~69 years for 41 bits)

export const WORKERS: WorkerNode[] = [
  { id: 'dc1-m0', name: 'DC1 · Worker 0', datacenterId: 1, machineId: 0 },
  { id: 'dc1-m1', name: 'DC1 · Worker 1', datacenterId: 1, machineId: 1 },
  { id: 'dc2-m0', name: 'DC2 · Worker 0', datacenterId: 2, machineId: 0 },
  { id: 'dc3-m0', name: 'DC3 · Worker 0', datacenterId: 3, machineId: 0 },
];

export const mask = (bits: number) => (1n << BigInt(bits)) - 1n;
export const clamp = (v: number, [lo, hi]: [number, number]) => Math.min(hi, Math.max(lo, v));

/** Compose sign(0) | timestamp | datacenter | machine | sequence with BigInt shifts. */
export function composeSnowflake(rel: number, dc: number, machine: number, seq: number, L: BitLayout): bigint {
  return (
    ((BigInt(Math.max(0, rel)) & mask(L.t)) << BigInt(L.d + L.m + L.s)) |
    ((BigInt(dc) & mask(L.d)) << BigInt(L.m + L.s)) |
    ((BigInt(machine) & mask(L.m)) << BigInt(L.s)) |
    (BigInt(seq) & mask(L.s))
  );
}

/** Read every field back out of the ID's bits: timestamp = (id >> (d+m+s)) + epoch. */
export function decodeSnowflake(id: bigint, L: BitLayout, epoch: number) {
  const rel = Number((id >> BigInt(L.d + L.m + L.s)) & mask(L.t));
  return {
    rel,
    timestampMs: rel + epoch,
    datacenterId: Number((id >> BigInt(L.m + L.s)) & mask(L.d)),
    machineId: Number((id >> BigInt(L.s)) & mask(L.m)),
    sequence: Number(id & mask(L.s)),
  };
}

export type SfStep =
  | { ok: true; ts: number; seq: number; waitedMs: number; behindMs: number; overflowWait: boolean; wrapped: boolean }
  | { ok: false; behindMs: number };

/**
 * One Snowflake generation step against a worker's runtime (mutated in place).
 * - now < lastTs (clock went backwards): IGNORE uses the old time, REJECT fails, WAIT blocks until the
 *   clock reaches lastTs (simulated: we use lastTs and report how long the request would have waited).
 * - more than 2^s IDs in one ms: WAIT blocks until the next millisecond; WRAP (the bug) reuses sequence 0.
 */
export function nextSnowflake(rt: SfRuntime, now: number, seqBits: number, overflow: OverflowMode, rollback: 'IGNORE' | 'REJECT' | 'WAIT'): SfStep {
  let ts = now;
  let waitedMs = 0;
  const behindMs = Math.max(0, rt.lastTs - now);
  if (behindMs > 0) {
    if (rollback === 'REJECT') return { ok: false, behindMs };
    if (rollback === 'WAIT') {
      waitedMs = behindMs;
      ts = rt.lastTs;
    }
  }
  const maxSeq = 2 ** seqBits - 1;
  let seq = 0;
  let overflowWait = false;
  let wrapped = false;
  if (ts === rt.lastTs) {
    seq = rt.seq + 1;
    if (seq > maxSeq) {
      seq = 0;
      if (overflow === 'WAIT') {
        ts = rt.lastTs + 1;
        overflowWait = true;
      } else {
        wrapped = true;
      }
    }
  }
  rt.lastTs = ts;
  rt.seq = seq;
  return { ok: true, ts, seq, waitedMs, behindMs, overflowWait, wrapped };
}

/** Real version-4 UUID (8-4-4-4-12), via crypto.randomUUID when available. */
export function uuidV4(): string {
  const c: Crypto | undefined = typeof globalThis !== 'undefined' ? globalThis.crypto : undefined;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  const b = new Uint8Array(16);
  if (c && typeof c.getRandomValues === 'function') c.getRandomValues(b);
  else for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
  b[6] = (b[6] & 0x0f) | 0x40; // version 4
  b[8] = (b[8] & 0x3f) | 0x80; // RFC 4122 variant
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export function sanitizeLayout(l: unknown): BitLayout {
  const x = l as Partial<BitLayout> | null;
  if (!x || typeof x !== 'object') return BOOK_LAYOUT;
  const pick = (k: keyof BitLayout) => (typeof x[k] === 'number' ? clamp(Math.round(x[k] as number), BIT_BOUNDS[k]) : BOOK_LAYOUT[k]);
  return { t: pick('t'), d: pick('d'), m: pick('m'), s: pick('s') };
}

export const layoutTotal = (L: BitLayout) => 1 + L.t + L.d + L.m + L.s;

/** Rebalance after one slider moves so the total stays 63 + sign bit (clamping may make that impossible). */
export function rebalance(L: BitLayout, field: keyof BitLayout, val: number): BitLayout {
  const next = { ...L, [field]: val };
  if (field !== 's') next.s = clamp(63 - next.t - next.d - next.m, BIT_BOUNDS.s);
  else next.t = clamp(63 - next.s - next.d - next.m, BIT_BOUNDS.t);
  return next;
}

/** Spread any leftover or missing bits over the fields, within their bounds. */
export function autoFix(L: BitLayout): BitLayout {
  const next = { ...L };
  let diff = 63 - (next.t + next.d + next.m + next.s);
  for (const k of ['s', 't', 'm', 'd'] as (keyof BitLayout)[]) {
    if (diff === 0) break;
    const target = clamp(next[k] + diff, BIT_BOUNDS[k]);
    diff -= target - next[k];
    next[k] = target;
  }
  return next;
}

export const fmtUtc = (ms: number) => {
  const d = new Date(ms);
  return Number.isNaN(d.getTime()) ? 'invalid date' : d.toISOString().replace('T', ' ').replace('Z', ' UTC');
};

// ---------------------------------------------------------------------------
// Clock rollback scenario: worker DC1-M0 issues one ID per ms for 6 ms, its clock
// is corrected backwards by `jump` ms, then 6 more requests arrive.
// ---------------------------------------------------------------------------

export interface ClockRow {
  n: number;
  phase: 'before' | 'after';
  trueRel: number;
  clockRel: number;
  handler: string;
  tsRel: number | null;
  value: string | null;
  seq: number | null;
  waitedMs: number;
  behindMs: number;
  duplicate: boolean;
  rejected: boolean;
  backup: boolean;
}

export function runClockScenario(policy: RollbackPolicy, jump: number, T0: number, L: BitLayout = BOOK_LAYOUT, epoch = TWITTER_EPOCH): ClockRow[] {
  const J = clamp(jump, [1, 5]);
  const primary: SfRuntime = { lastTs: -1, seq: 0 };
  const backup: SfRuntime = { lastTs: -1, seq: 0 };
  const backupMachine = 2 ** L.m - 1;
  const seen = new Set<string>();
  const plan = [
    ...Array.from({ length: 6 }, (_, i) => ({ phase: 'before' as const, trueRel: i, clockRel: i })),
    ...Array.from({ length: 6 }, (_, k) => ({ phase: 'after' as const, trueRel: 6 + k, clockRel: 6 + k - J })),
  ];
  return plan.map((p, i): ClockRow => {
    const clockNow = T0 + p.clockRel;
    const useBackup = policy === 'BACKUP_WORKER' && clockNow < primary.lastTs;
    const rt = useBackup ? backup : primary;
    const machine = useBackup ? backupMachine : 0;
    // The backup machine's own clock is healthy, so it reads true time.
    const readAt = useBackup ? T0 + p.trueRel : clockNow;
    const pol = policy === 'BACKUP_WORKER' ? 'WAIT' : policy;
    const behindBefore = Math.max(0, primary.lastTs - clockNow);
    const st = nextSnowflake(rt, readAt, L.s, 'WAIT', pol);
    const base = { n: i + 1, phase: p.phase, trueRel: p.trueRel, clockRel: p.clockRel, handler: useBackup ? `Backup M${backupMachine}` : 'Primary M0', backup: useBackup };
    if (!st.ok) return { ...base, tsRel: null, value: null, seq: null, waitedMs: 0, behindMs: st.behindMs, duplicate: false, rejected: true };
    const value = composeSnowflake(st.ts - epoch, 1, machine, st.seq, L).toString();
    const duplicate = seen.has(value);
    seen.add(value);
    return { ...base, tsRel: st.ts - T0, value, seq: st.seq, waitedMs: st.waitedMs, behindMs: useBackup ? behindBefore : st.behindMs, duplicate, rejected: false };
  });
}
