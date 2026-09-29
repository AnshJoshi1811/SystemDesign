import React, { useState, useEffect, useRef } from 'react';
import {
  Hash,
  Server,
  Cpu,
  Clock,
  Zap,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Play,
  Pause,
  RotateCcw,
  Sliders,
  Terminal,
  Database,
  Globe,
  Plus,
  Minus,
  Power,
} from 'lucide-react';
import { LessonGoal, Takeaway, WhatChanged, Term, Quiz, type QuizQuestion } from './learn/LearningKit';
import { usePersistentState } from '../lib/usePersistentState';

interface Chapter7IdGeneratorProps {
  isDarkMode?: boolean;
}

export type StrategyType = 'AUTO_INCREMENT' | 'AUTO_INC_OFFSET' | 'UUID' | 'TICKET_SERVER' | 'SNOWFLAKE';

/** Bits per field; the sign bit is always 1 more, so a valid layout sums to 63. */
interface BitLayout {
  t: number;
  d: number;
  m: number;
  s: number;
}

export interface GeneratedIdRecord {
  uid: number;
  strategy: StrategyType;
  /** Decimal string for numeric IDs, canonical text for UUIDs. */
  value: string;
  /** The timestamp the generator used (wall clock for counters/UUIDs, the embedded ms for Snowflake). */
  issuedAtMs: number;
  source: string;
  datacenterId?: number;
  machineId?: number;
  sequence?: number;
  /** Snowflake only: the layout + epoch the ID was built with, needed to decode it. */
  layout?: BitLayout & { epoch: number };
  note?: string;
  isDuplicate: boolean;
  duplicateOf?: string;
  outOfOrder: boolean;
}

export interface WorkerNode {
  id: string;
  name: string;
  datacenterId: number;
  machineId: number;
  ip: string;
}

type Draft = Omit<GeneratedIdRecord, 'uid' | 'isDuplicate' | 'duplicateOf' | 'outOfOrder'>;
type TabId = 'canvas' | 'builder' | 'clock' | 'sequence' | 'logs';
type RollbackPolicy = 'IGNORE' | 'REJECT' | 'WAIT' | 'BACKUP_WORKER';
type OverflowMode = 'WAIT' | 'WRAP';
type MultiMasterMode = 'offset' | 'naive';
type EpochId = 'twitter' | 'custom2026' | 'unix';

interface Stats {
  generated: number;
  duplicates: number;
  outOfOrder: number;
  failures: number;
}

interface DbServer {
  name: string;
  start: number;
  last: number | null;
}

interface SfRuntime {
  lastTs: number;
  seq: number;
}

/** Per-strategy history used to flag duplicates and time-order violations. */
interface Tracker {
  seen: Map<string, string>;
  lastMs: number;
  maxPrev: string | null; // largest ID issued in an earlier millisecond
  maxCur: string | null; // largest ID issued in the current millisecond
}

interface DupExample {
  strategy: StrategyType;
  value: string;
  first: string;
  second: string;
}

interface ClockRow {
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

interface ClockRun {
  policy: RollbackPolicy;
  jump: number;
  rows: ClockRow[];
}

interface BurstResult {
  requested: number;
  worker: string;
  mode: OverflowMode;
  capacityPerMs: number;
  waits: number;
  wraps: number;
  duplicates: number;
  perMs: { ms: number; count: number }[];
  events: string[];
  firstId: string;
  lastId: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TWITTER_EPOCH = 1288834974657; // Nov 04 2010 01:42:54 UTC (book)
const EPOCHS: { id: EpochId; label: string; ms: number }[] = [
  { id: 'twitter', label: 'Twitter epoch (Nov 4, 2010)', ms: TWITTER_EPOCH },
  { id: 'custom2026', label: 'Custom epoch (Jan 1, 2026)', ms: 1767225600000 },
  { id: 'unix', label: 'Unix epoch (Jan 1, 1970)', ms: 0 },
];

const BOOK_LAYOUT: BitLayout = { t: 41, d: 5, m: 5, s: 12 };
const BIT_BOUNDS: Record<keyof BitLayout, [number, number]> = { t: [30, 45], d: [1, 10], m: [1, 10], s: [4, 20] };
const LAYOUT_PRESETS: { label: string; layout: BitLayout; hint: string }[] = [
  { label: 'Book default', layout: BOOK_LAYOUT, hint: '41 · 5 · 5 · 12' },
  { label: 'Long-lived, low concurrency', layout: { t: 44, d: 5, m: 5, s: 9 }, hint: 'fewer sequence bits, more timestamp bits' },
  { label: 'Few DCs, many machines', layout: { t: 41, d: 2, m: 8, s: 12 }, hint: '4 DCs × 256 machines' },
];
const MS_PER_YEAR = 1000 * 60 * 60 * 24 * 365; // book uses 365-day years (~69 years for 41 bits)
const DUP_TRACK_LIMIT = 200_000;

const WORKERS: WorkerNode[] = [
  { id: 'worker-dc1-m0', name: 'DC1 · Worker 0', datacenterId: 1, machineId: 0, ip: '10.1.0.1' },
  { id: 'worker-dc1-m1', name: 'DC1 · Worker 1', datacenterId: 1, machineId: 1, ip: '10.1.0.2' },
  { id: 'worker-dc2-m0', name: 'DC2 · Worker 0', datacenterId: 2, machineId: 0, ip: '10.2.0.1' },
  { id: 'worker-dc3-m0', name: 'DC3 · Worker 0', datacenterId: 3, machineId: 0, ip: '10.3.0.1' },
];

const TABS: { id: TabId; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'canvas', label: 'Stage walkthrough', icon: Globe },
  { id: 'builder', label: '64-bit layout builder', icon: Sliders },
  { id: 'clock', label: 'Clock rollback lab', icon: Clock },
  { id: 'sequence', label: 'Sequence overflow lab', icon: Zap },
  { id: 'logs', label: 'ID feed & decoder', icon: Terminal },
];

const FIELD = {
  sign: {
    label: 'Sign',
    box: 'bg-slate-100 border-slate-300 text-slate-700 dark:bg-slate-800 dark:border-slate-600 dark:text-slate-200',
    text: 'text-slate-500 dark:text-slate-400',
  },
  t: {
    label: 'Timestamp',
    box: 'bg-indigo-50 border-indigo-300 text-indigo-900 dark:bg-indigo-950/70 dark:border-indigo-500/40 dark:text-indigo-200',
    text: 'text-indigo-700 dark:text-indigo-300',
  },
  d: {
    label: 'Datacenter',
    box: 'bg-purple-50 border-purple-300 text-purple-900 dark:bg-purple-950/70 dark:border-purple-500/40 dark:text-purple-200',
    text: 'text-purple-700 dark:text-purple-300',
  },
  m: {
    label: 'Machine',
    box: 'bg-amber-50 border-amber-300 text-amber-900 dark:bg-amber-950/70 dark:border-amber-500/40 dark:text-amber-200',
    text: 'text-amber-700 dark:text-amber-300',
  },
  s: {
    label: 'Sequence',
    box: 'bg-emerald-50 border-emerald-300 text-emerald-900 dark:bg-emerald-950/70 dark:border-emerald-500/40 dark:text-emerald-200',
    text: 'text-emerald-700 dark:text-emerald-300',
  },
} as const;

// Shared class strings (Tailwind `dark:` follows the in-app toggle).
const panel = 'p-6 rounded-3xl border bg-white border-slate-200 shadow-xs dark:bg-[#1c1c1e] dark:border-slate-800';
const inset = 'rounded-2xl border bg-slate-50 border-slate-200 dark:bg-slate-950 dark:border-slate-800';
const heading = 'text-slate-900 dark:text-white';
const muted = 'text-slate-600 dark:text-slate-400';
const labelCls = 'text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400';

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

const mask = (bits: number) => (1n << BigInt(bits)) - 1n;

/** Compose sign(0) | timestamp | datacenter | machine | sequence with BigInt shifts. */
function composeSnowflake(rel: number, dc: number, machine: number, seq: number, L: BitLayout): bigint {
  return (
    ((BigInt(Math.max(0, rel)) & mask(L.t)) << BigInt(L.d + L.m + L.s)) |
    ((BigInt(dc) & mask(L.d)) << BigInt(L.m + L.s)) |
    ((BigInt(machine) & mask(L.m)) << BigInt(L.s)) |
    (BigInt(seq) & mask(L.s))
  );
}

/** Read every field back out of the ID's bits: timestamp = (id >> (d+m+s)) + epoch. */
function decodeSnowflake(id: bigint, L: BitLayout, epoch: number) {
  const rel = Number((id >> BigInt(L.d + L.m + L.s)) & mask(L.t));
  return {
    rel,
    timestampMs: rel + epoch,
    datacenterId: Number((id >> BigInt(L.m + L.s)) & mask(L.d)),
    machineId: Number((id >> BigInt(L.s)) & mask(L.m)),
    sequence: Number(id & mask(L.s)),
  };
}

type SfStep =
  | { ok: true; ts: number; seq: number; waitedMs: number; behindMs: number; overflowWait: boolean; wrapped: boolean }
  | { ok: false; behindMs: number };

/**
 * One Snowflake generation step against a worker's runtime (mutated in place).
 * - now < lastTs (clock went backwards): IGNORE uses the old time, REJECT fails, WAIT blocks until the
 *   clock reaches lastTs (simulated: we use lastTs and report how long the request would have waited).
 * - more than 2^s IDs in one ms: WAIT blocks until the next millisecond; WRAP (the bug) reuses sequence 0.
 */
function nextSnowflake(
  rt: SfRuntime,
  now: number,
  seqBits: number,
  overflow: OverflowMode,
  rollback: 'IGNORE' | 'REJECT' | 'WAIT'
): SfStep {
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
function uuidV4(): string {
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

const compareIds = (a: string, b: string, strategy: StrategyType) => {
  if (strategy === 'UUID') return a < b ? -1 : a > b ? 1 : 0;
  const x = BigInt(a);
  const y = BigInt(b);
  return x < y ? -1 : x > y ? 1 : 0;
};

const emptyStats = (): Stats => ({ generated: 0, duplicates: 0, outOfOrder: 0, failures: 0 });
const initStats = (): Record<StrategyType, Stats> => ({
  AUTO_INCREMENT: emptyStats(),
  AUTO_INC_OFFSET: emptyStats(),
  UUID: emptyStats(),
  TICKET_SERVER: emptyStats(),
  SNOWFLAKE: emptyStats(),
});

const buildServers = (k: number, mode: MultiMasterMode): DbServer[] =>
  Array.from({ length: k }, (_, i) => ({ name: `DB ${String.fromCharCode(65 + i)}`, start: mode === 'offset' ? i + 1 : 1, last: null }));

const clamp = (v: number, [lo, hi]: [number, number]) => Math.min(hi, Math.max(lo, v));

function sanitizeLayout(l: unknown): BitLayout {
  const x = l as Partial<BitLayout> | null;
  if (!x || typeof x !== 'object') return BOOK_LAYOUT;
  const pick = (k: keyof BitLayout) => (typeof x[k] === 'number' ? clamp(Math.round(x[k] as number), BIT_BOUNDS[k]) : BOOK_LAYOUT[k]);
  return { t: pick('t'), d: pick('d'), m: pick('m'), s: pick('s') };
}

const fmtUtc = (ms: number) => {
  const d = new Date(ms);
  return Number.isNaN(d.getTime()) ? 'invalid date' : d.toISOString().replace('T', ' ').replace('Z', ' UTC');
};

// ---------------------------------------------------------------------------
// Stage content
// ---------------------------------------------------------------------------

interface StageInfo {
  title: string;
  short: string;
  desc: string;
  strategy: StrategyType;
  goal: React.ReactNode;
  why: React.ReactNode;
  problem: React.ReactNode;
  solution: React.ReactNode;
  tryIt: React.ReactNode;
  change?: { before: React.ReactNode; after: React.ReactNode; reason: React.ReactNode };
  takeaway: React.ReactNode;
  quiz: QuizQuestion[];
}

const STAGES: StageInfo[] = [
  {
    title: 'Stage 1 · One database with AUTO_INCREMENT',
    short: 'Single DB auto_increment',
    desc: 'Unique & ordered, but one server',
    strategy: 'AUTO_INCREMENT',
    goal: 'See why a single database counter gives perfect IDs, and why it cannot be the whole answer.',
    why: (
      <>
        One counter hands out 1, 2, 3… so IDs are unique and grow with time. But every ID request depends on that one server: it is a{' '}
        <Term term="SPOF">Single point of failure: one component whose failure takes the whole system down.</Term> and a throughput
        ceiling. (This is the starting point; the book's four options begin at stage 2.)
      </>
    ),
    problem: 'Every web server must call the one database for each new ID. If it crashes, nobody can create records.',
    solution: 'Spread ID generation across several database servers (stage 2).',
    tryIt: 'Generate a few IDs, then click “Crash” on the primary DB and try again.',
    takeaway:
      'A single counter gives uniqueness and ordering for free. The hard part of distributed ID generation is keeping those properties once more than one machine hands out IDs.',
    quiz: [
      {
        question: 'Your only database uses AUTO_INCREMENT. Which requirement is it weakest on?',
        options: [
          { text: 'Uniqueness: two inserts can receive the same number', why: 'One counter serializes every insert, so it never repeats a value.' },
          { text: 'Ordering: later IDs can be smaller', why: 'A single counter only goes up, so later IDs are always larger.' },
          { text: 'Availability and scale: every ID depends on one server', correct: true, why: 'Right. It is a single point of failure and every ID request queues on the same machine.' },
          { text: 'Size: values quickly exceed 64 bits', why: 'A signed 64-bit counter lasts about 29 million years at 10,000 IDs per second.' },
        ],
      },
      {
        question: 'You add a second database, both using default AUTO_INCREMENT (start 1, step 1). What happens?',
        options: [
          { text: 'Both issue 1, 2, 3…, so the same IDs appear twice', correct: true, why: 'Right. Each counter is local and knows nothing about the other. Try naive mode in stage 2.' },
          { text: 'The databases detect each other and skip used numbers', why: 'AUTO_INCREMENT is purely local; there is no cross-server check.' },
          { text: 'Only ordering breaks; uniqueness survives', why: 'Identical counters produce identical values, so uniqueness is the first thing to break.' },
        ],
      },
    ],
  },
  {
    title: 'Stage 2 · Multi-master replication (step by k)',
    short: 'Multi-master, step k',
    desc: 'Unique only while k is fixed',
    strategy: 'AUTO_INC_OFFSET',
    goal: 'Learn how k database servers can each run AUTO_INCREMENT with a step of k, and reproduce the three drawbacks the book lists.',
    why: 'Server i issues i, i+k, i+2k… so no two servers pick the same number, as long as k never changes.',
    problem: (
      <ul className="list-disc pl-5 space-y-1">
        <li>Hard to scale with multiple data centers: every server everywhere must agree on k and its own offset.</li>
        <li>IDs do not go up with time across servers: a busy server's counter runs ahead of a quiet one.</li>
        <li>Adding or removing a server changes k, and the new step lands on numbers that were already issued.</li>
      </ul>
    ),
    solution: 'Drop coordinated counters entirely: let each server generate random IDs (stage 3).',
    tryIt:
      'Switch to naive mode and watch duplicates appear. In offset mode, generate several IDs on DB A only, then one on DB B: it is smaller (out of order). Then add a server and keep generating.',
    change: {
      before: 'One database counter: 1, 2, 3, …',
      after: 'k database servers; server i issues i, i+k, i+2k, …',
      reason: 'Removes the single server from the path and spreads the load.',
    },
    takeaway:
      'Stepping by k keeps IDs unique only while k is frozen, and never makes them time-ordered across servers. Any change to the fleet becomes a migration.',
    quiz: [
      {
        question: 'With k = 3 servers, server 2 has issued 2, 5, 8. What does it issue next?',
        options: [
          { text: '9', why: 'That would be a step of 1. In multi-master mode each server adds k to its own previous ID.' },
          { text: '11', correct: true, why: 'Right: previous ID on the same server + k = 8 + 3.' },
          { text: '10', why: 'That is a step of 2, which only applies when k = 2.' },
        ],
      },
      {
        question: 'Why do multi-master IDs not go up with time?',
        options: [
          { text: 'Each server counts independently, so a busy server runs ahead and a later ID from a quiet server can be smaller', correct: true, why: 'Right. Ordering is per server only; nothing links the counters to the clock.' },
          { text: 'Replication lag reorders the rows', why: 'The problem exists even with zero lag; it comes from independent counters.' },
          { text: 'Stepping by k makes the numbers wrap around', why: 'Nothing wraps; each counter keeps increasing, just at different rates.' },
        ],
      },
      {
        question: 'A k = 2 cluster (A: 1, 3, 5…; B: 2, 4, 6…) gets a third server. What is the danger?',
        options: [
          { text: 'k becomes 3, so the new server starts at 3, a number A already issued, and later steps collide too', correct: true, why: 'Right. Try “Add server” in the simulation and watch the duplicate counter.' },
          { text: 'None; the new server simply takes the next free offset', why: 'Under the new k, the “free” offset overlaps values already issued under the old k.' },
          { text: 'Only the new server becomes slower', why: 'Speed is not the issue; uniqueness is.' },
        ],
      },
    ],
  },
  {
    title: 'Stage 3 · UUID (128-bit, random)',
    short: 'UUID v4',
    desc: 'No coordination, but 128-bit',
    strategy: 'UUID',
    goal: 'See how UUIDs remove coordination completely, and which requirements they fail.',
    why: 'A version-4 UUID is 128 bits, 122 of them random. Each web server makes its own, and the chance of two matching is negligible.',
    problem:
      'UUIDs are 128 bits (the requirement is 64), they are hex strings rather than numbers, and they are random, so they do not go up with time. Watch the “out of order” counter climb.',
    solution: 'Go back to a numeric counter, but a single dedicated one: the ticket server (stage 4).',
    tryIt: 'Start the flow and compare the out-of-order count with stage 1.',
    change: {
      before: 'Coordinated counters on the database servers',
      after: 'Each web server generates random 128-bit IDs locally',
      reason: 'No coordination means nothing to misconfigure and generation scales with the web servers.',
    },
    takeaway: 'UUIDs trade the size, numeric and ordering requirements for zero coordination. Fine for many systems, but not for this spec.',
    quiz: [
      {
        question: 'Which of the chapter\'s requirements does a UUID fail?',
        options: [
          { text: 'Fits in 64 bits, numeric only, and ordered by date', correct: true, why: 'Right. It is 128 bits, written as hex, and random.' },
          { text: 'Uniqueness', why: 'Collisions are astronomically unlikely: the book quotes a 50% chance only after a billion UUIDs per second for about 100 years.' },
          { text: 'Generating 10,000 IDs per second', why: 'Each server generates locally, so throughput grows with the number of servers.' },
        ],
      },
      {
        question: 'Why do servers not need to coordinate to generate UUIDs?',
        options: [
          { text: 'With 122 random bits, two servers picking the same value is practically impossible', correct: true, why: 'Right. Uniqueness comes from randomness, not from agreement.' },
          { text: 'Each server is assigned a unique range in advance', why: 'That is the offset idea from stage 2, not UUID.' },
          { text: 'A central registry checks every UUID', why: 'There is no registry; that would be a ticket server.' },
        ],
      },
    ],
  },
  {
    title: 'Stage 4 · Central ticket server (Flickr)',
    short: 'Ticket server',
    desc: 'Numeric & ordered, but a SPOF',
    strategy: 'TICKET_SERVER',
    goal: (
      <>
        Centralize one AUTO_INCREMENT in a dedicated{' '}
        <Term term="ticket server">A database whose only job is issuing auto_increment numbers to every other service. Flickr built this to generate distributed primary keys.</Term>
        .
      </>
    ),
    why: 'IDs are numeric, fit in 64 bits and are ordered, and it is easy to implement. The book says it works for small to medium-scale applications.',
    problem:
      'It is a single point of failure: if the ticket server goes down, every system that needs IDs stops. Adding a second ticket server brings back the synchronization problems from stage 2.',
    solution: 'Let every machine generate IDs itself, but give each ID a structure that guarantees uniqueness and ordering: Snowflake (stage 5).',
    tryIt: 'Start the flow, then crash the ticket server and watch every request fail.',
    change: {
      before: 'Random 128-bit UUIDs made on each web server',
      after: 'One central counter that every web server calls',
      reason: 'Get numeric, 64-bit, time-ordered IDs back.',
    },
    takeaway: 'Centralizing brings back every nice property, and the single point of failure with them.',
    quiz: [
      {
        question: 'What is the main drawback of one ticket server?',
        options: [
          { text: 'It is a single point of failure', correct: true, why: 'Right. When it is down, no service can create IDs.' },
          { text: 'Its IDs are not numeric', why: 'They are plain auto_increment integers.' },
          { text: 'Its IDs are not ordered', why: 'A single counter only goes up, so they are ordered.' },
        ],
      },
      {
        question: 'You add a second ticket server to remove the SPOF. What new problem appears?',
        options: [
          { text: 'The two must be kept in sync (e.g. odd/even), which brings back the multi-master problems', correct: true, why: 'Right. The book calls this the data synchronization challenge.' },
          { text: 'IDs become 128 bits', why: 'Both servers still issue 64-bit integers.' },
          { text: 'Nothing; two independent counters are always safe', why: 'Two default counters issue the same numbers. That is stage 2\'s naive mode.' },
        ],
      },
    ],
  },
  {
    title: 'Stage 5 · Twitter Snowflake (64-bit, decentralized)',
    short: 'Twitter Snowflake',
    desc: 'Meets all five requirements',
    strategy: 'SNOWFLAKE',
    goal: (
      <>
        Divide 64 bits into sign · timestamp · datacenter · machine ·{' '}
        <Term term="sequence number">A per-machine counter that resets to 0 every millisecond and goes up by 1 for each extra ID in that same millisecond. 12 bits allow 4,096 IDs per ms per machine.</Term>{' '}
        so every machine can issue unique, time-sortable IDs without asking anyone.
      </>
    ),
    why: (
      <>
        The 41-bit timestamp counts milliseconds since a custom{' '}
        <Term term="epoch">The instant the timestamp counts from. Twitter's epoch is Nov 4, 2010, so 41 bits last about 69 years from then instead of from 1970.</Term>{' '}
        and sits in the high bits, so later means bigger. The datacenter and machine IDs make it unique across machines.
      </>
    ),
    problem:
      'You now depend on clocks (what if one goes backwards?) and on the sequence field (what if one machine gets more than 4,096 requests in one millisecond?).',
    solution: 'Explore both in the clock rollback and sequence overflow labs, and tune field sizes in the layout builder.',
    tryIt: 'Raise the traffic rate: sequence numbers climb within a millisecond. Open the decoder to pull the timestamp back out of the bits.',
    change: {
      before: 'Every ID needs a network call to one ticket server',
      after: 'Each worker composes its ID from its clock, its datacenter/machine ID and a per-ms sequence',
      reason: 'No coordination at generation time and no SPOF, while staying numeric, 64-bit and ordered by time.',
    },
    takeaway:
      'Snowflake meets all five requirements by putting time in the high bits and machine identity in the middle: uniqueness comes from structure, not coordination.',
    quiz: [
      {
        question: 'With 12 sequence bits, how many IDs can one machine create in one millisecond?',
        options: [
          { text: '4,096', correct: true, why: 'Right: 2^12 = 4,096 values (0 to 4,095).' },
          { text: '4,095', why: '4,095 is the largest value, but counting from 0 gives 4,096 values.' },
          { text: '12', why: '12 is the number of bits, not the number of values they can hold.' },
          { text: '1,000', why: 'That is milliseconds per second, unrelated to the sequence width.' },
        ],
      },
      {
        question: 'Why are Snowflake IDs sortable by time?',
        options: [
          { text: 'The timestamp occupies the most significant bits, so a later millisecond always gives a bigger number', correct: true, why: 'Right. The lower fields only break ties inside the same millisecond.' },
          { text: 'The sequence number keeps increasing forever', why: 'It resets to 0 every millisecond.' },
          { text: 'Datacenter IDs are assigned in time order', why: 'Datacenter and machine IDs are fixed at startup.' },
        ],
      },
      {
        question: 'Why use a custom epoch instead of 1970?',
        options: [
          { text: '41 bits cover about 69 years from the epoch, so starting near today delays overflow', correct: true, why: 'Right. From 1970, 41 bits would already run out in 2039.' },
          { text: 'Unix time cannot be stored in binary', why: 'It can; the issue is how many years the field lasts.' },
          { text: 'It makes IDs unique across datacenters', why: 'Uniqueness across datacenters comes from the datacenter ID field.' },
        ],
      },
    ],
  },
];

type Verdict = 'yes' | 'partial' | 'no';
const REQUIREMENTS = ['Unique', 'Numeric only', 'Fits in 64 bits', 'Ordered by date', 'Scales past 10,000 IDs/s'];
const SCORECARD: { strategy: StrategyType; label: string; cells: [Verdict, string][] }[] = [
  {
    strategy: 'AUTO_INCREMENT',
    label: 'Single DB auto_increment',
    cells: [
      ['yes', 'one counter'],
      ['yes', 'integers'],
      ['yes', 'BIGINT'],
      ['yes', 'one counter only goes up'],
      ['partial', 'one server is the ceiling and a SPOF'],
    ],
  },
  {
    strategy: 'AUTO_INC_OFFSET',
    label: 'Multi-master (step k)',
    cells: [
      ['partial', 'only while k never changes'],
      ['yes', 'integers'],
      ['yes', 'BIGINT'],
      ['no', 'not across servers'],
      ['partial', 'scales with DB count; hard across data centers'],
    ],
  },
  {
    strategy: 'UUID',
    label: 'UUID v4',
    cells: [
      ['yes', 'collisions practically impossible'],
      ['no', 'hex string'],
      ['no', '128 bits'],
      ['no', 'random'],
      ['yes', 'generated locally'],
    ],
  },
  {
    strategy: 'TICKET_SERVER',
    label: 'Ticket server',
    cells: [
      ['yes', 'one central counter'],
      ['yes', 'integers'],
      ['yes', 'BIGINT'],
      ['yes', 'one counter only goes up'],
      ['partial', 'small–medium scale; SPOF'],
    ],
  },
  {
    strategy: 'SNOWFLAKE',
    label: 'Twitter Snowflake',
    cells: [
      ['yes', 'time + machine + sequence'],
      ['yes', 'integer'],
      ['yes', '1+41+5+5+12'],
      ['yes', 'time in high bits (needs synced clocks)'],
      ['yes', '4,096 per ms per machine'],
    ],
  },
];

const VERDICT_STYLE: Record<Verdict, { label: string; cls: string }> = {
  yes: { label: 'Yes', cls: 'text-emerald-700 dark:text-emerald-300' },
  partial: { label: 'Partly', cls: 'text-amber-700 dark:text-amber-300' },
  no: { label: 'No', cls: 'text-rose-700 dark:text-rose-300' },
};

const BITS_QUIZ: QuizQuestion[] = [
  {
    question: 'A low-traffic system must keep issuing IDs for 200 years. Which change fits the book\'s “section length tuning” advice?',
    options: [
      { text: 'Move bits from the sequence field to the timestamp field', correct: true, why: 'Right. Fewer IDs per ms are fine at low concurrency, and each extra timestamp bit doubles the lifetime.' },
      { text: 'Move bits from the timestamp to the machine field', why: 'That shortens the lifetime, the opposite of what is needed.' },
      { text: 'Use a 65-bit ID', why: 'The requirement is that IDs fit in 64 bits.' },
    ],
  },
  {
    question: 'You shrink the datacenter field from 5 bits to 1. What happens to DC 2 and DC 3?',
    options: [
      { text: 'Their IDs no longer fit; masking folds them onto DC 0 and DC 1, so two datacenters can mint identical IDs', correct: true, why: 'Right. The builder flags workers that no longer fit for exactly this reason.' },
      { text: 'They automatically get new unique IDs', why: 'Nothing reassigns them; datacenter IDs are fixed at startup.' },
      { text: 'Only the lifetime changes', why: 'Datacenter bits do not affect the timestamp; they limit how many datacenters are addressable.' },
    ],
  },
];

const CLOCK_QUIZ: QuizQuestion[] = [
  {
    question: 'An NTP correction moves a worker\'s clock back 3 ms. With no protection, what can happen?',
    options: [
      { text: 'It reuses milliseconds it already used, restarts the sequence at 0, and issues duplicate IDs', correct: true, why: 'Right. Run the lab with “No protection” to see the duplicates.' },
      { text: 'Nothing, because the sequence number keeps IDs unique', why: 'The sequence resets on every new millisecond, so it starts again at 0 and repeats.' },
      { text: 'IDs become 128 bits long', why: 'The layout does not change; the timestamp value just goes backwards.' },
    ],
  },
  {
    question: 'Which rollback policy keeps serving requests with no extra latency?',
    options: [
      { text: 'Switch to a backup worker ID', correct: true, why: 'Right. A different machine ID cannot collide with the primary\'s earlier IDs, so it can issue immediately.' },
      { text: 'Reject and throw an error', why: 'Safe, but callers get errors until the clock catches up.' },
      { text: 'Wait until the clock catches up', why: 'Safe, but each request is delayed by the size of the jump.' },
    ],
  },
];

const SEQUENCE_QUIZ: QuizQuestion[] = [
  {
    question: '5,000 requests hit one worker in the same millisecond (12-bit sequence). What should the generator do with request #4,097?',
    options: [
      { text: 'Wait until the next millisecond and issue it with sequence 0', correct: true, why: 'Right. The new timestamp makes the ID unique again.' },
      { text: 'Wrap the sequence to 0 in the same millisecond', why: 'That rebuilds exactly the ID of request #1, a duplicate. Try “Wrap” mode.' },
      { text: 'Borrow the next datacenter ID', why: 'That ID belongs to another datacenter, so it could collide with its IDs.' },
    ],
  },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const Chapter7IdGenerator: React.FC<Chapter7IdGeneratorProps> = () => {
  // --- Persisted learner state ---
  const [storedStage, setStage] = usePersistentState<number>('chapter7:stage', 1);
  const stage = clamp(Math.round(Number(storedStage)) || 1, [1, 5]);
  const [storedTab, setActiveTab] = usePersistentState<TabId>('chapter7:tab', 'canvas');
  const activeTab: TabId = TABS.some((t) => t.id === storedTab) ? storedTab : 'canvas';
  const [storedLayout, setLayout] = usePersistentState<BitLayout>('chapter7:bits', BOOK_LAYOUT);
  const layout = sanitizeLayout(storedLayout);
  const [epochName, setEpochName] = usePersistentState<EpochId>('chapter7:epoch', 'twitter');
  const epoch = (EPOCHS.find((e) => e.id === epochName) ?? EPOCHS[0]).ms;
  const [mmMode, setMmMode] = usePersistentState<MultiMasterMode>('chapter7:mmMode', 'offset');
  const [rollbackPolicy, setRollbackPolicy] = usePersistentState<RollbackPolicy>('chapter7:rollbackPolicy', 'WAIT');
  const [clockJumpMs, setClockJumpMs] = usePersistentState<number>('chapter7:clockJump', 3);
  const [burstSize, setBurstSize] = usePersistentState<number>('chapter7:burst', 5000);
  const [overflowMode, setOverflowMode] = usePersistentState<OverflowMode>('chapter7:overflowMode', 'WAIT');

  const info = STAGES[stage - 1];
  const strategy = info.strategy; // strategy is derived from the stage, so they can never disagree

  // --- Transient simulation state ---
  const [isSimulating, setIsSimulating] = useState(false);
  const [rps, setRps] = useState(40);
  const [selectedWorkerId, setSelectedWorkerId] = useState(WORKERS[0].id);
  const [selectedServerIdx, setSelectedServerIdx] = useState(0);
  const [centralDown, setCentralDown] = useState(false);
  const [stats, setStats] = useState<Record<StrategyType, Stats>>(initStats);
  const [idLogs, setIdLogs] = useState<GeneratedIdRecord[]>([]);
  const [selectedRecord, setSelectedRecord] = useState<GeneratedIdRecord | null>(null);
  const [dupExamples, setDupExamples] = useState<DupExample[]>([]);
  const [lastEvent, setLastEvent] = useState<{ text: string; tone: 'ok' | 'fail' | 'dup' | 'warn' } | null>(null);
  const [mmNote, setMmNote] = useState<string | null>(null);
  const [layoutNote, setLayoutNote] = useState<string | null>(null);
  const [clockRun, setClockRun] = useState<ClockRun | null>(null);
  const [burstResult, setBurstResult] = useState<BurstResult | null>(null);
  const [, setRenderTick] = useState(0);
  const rerender = () => setRenderTick((t) => t + 1);

  // --- Generator internals (refs: mutated synchronously while generating) ---
  const uidRef = useRef(0);
  const dbCounterRef = useRef(0);
  const ticketRef = useRef(0);
  const mmRef = useRef<DbServer[]>(buildServers(2, mmMode));
  const sfRef = useRef<Record<string, SfRuntime>>({});
  const trackersRef = useRef<Partial<Record<StrategyType, Tracker>>>({});

  useEffect(() => {
    setCentralDown(false);
    setLastEvent(null);
    setMmNote(null);
  }, [stage]);

  // --- Derived layout values ---
  const bitTotal = 1 + layout.t + layout.d + layout.m + layout.s;
  const layoutValid = bitTotal === 64;
  const maxSeq = 2 ** layout.s - 1;
  const maxDcs = 2 ** layout.d;
  const maxMachines = 2 ** layout.m;
  const tsRange = 2 ** layout.t;
  const lifetimeYears = (tsRange - 1) / MS_PER_YEAR;
  const overflowDate = new Date(epoch + tsRange - 1);
  const elapsedSinceEpoch = Date.now() - epoch;
  const tsOverflowed = elapsedSinceEpoch > tsRange - 1;
  const workerFits = (w: WorkerNode) => w.datacenterId < maxDcs && w.machineId < maxMachines;
  const misfitWorkers = WORKERS.filter((w) => !workerFits(w));

  // --- Recording: duplicate + ordering detection ---
  const commit = (s: StrategyType, drafts: Draft[], failures = 0, select = false): GeneratedIdRecord[] => {
    let tr = trackersRef.current[s];
    if (!tr) {
      tr = { seen: new Map(), lastMs: -Infinity, maxPrev: null, maxCur: null };
      trackersRef.current[s] = tr;
    }
    let dups = 0;
    let ooo = 0;
    const examples: DupExample[] = [];
    const out = drafts.map((d): GeneratedIdRecord => {
      if (d.issuedAtMs > tr!.lastMs) {
        if (tr!.maxCur !== null && (tr!.maxPrev === null || compareIds(tr!.maxCur, tr!.maxPrev, s) > 0)) tr!.maxPrev = tr!.maxCur;
        tr!.maxCur = null;
        tr!.lastMs = d.issuedAtMs;
      }
      const outOfOrder = d.issuedAtMs >= tr!.lastMs && tr!.maxPrev !== null && compareIds(d.value, tr!.maxPrev, s) < 0;
      if (tr!.maxCur === null || compareIds(d.value, tr!.maxCur, s) > 0) tr!.maxCur = d.value;
      const prev = tr!.seen.get(d.value);
      const isDuplicate = prev !== undefined;
      if (isDuplicate) {
        dups++;
        if (examples.length < 3) examples.push({ strategy: s, value: d.value, first: prev!, second: d.source });
      } else {
        tr!.seen.set(d.value, d.source);
      }
      if (outOfOrder) ooo++;
      uidRef.current += 1;
      return { ...d, uid: uidRef.current, isDuplicate, duplicateOf: prev, outOfOrder };
    });
    if (tr.seen.size > DUP_TRACK_LIMIT) tr.seen.clear();

    setStats((p) => ({
      ...p,
      [s]: {
        generated: p[s].generated + out.length,
        duplicates: p[s].duplicates + dups,
        outOfOrder: p[s].outOfOrder + ooo,
        failures: p[s].failures + failures,
      },
    }));
    if (out.length) setIdLogs((p) => [...out.slice(-50).reverse(), ...p].slice(0, 50));
    if (examples.length) setDupExamples((p) => [...examples, ...p].slice(0, 6));
    if (select && out.length) setSelectedRecord(out[out.length - 1]);
    return out;
  };

  const resetStrategy = (s: StrategyType, mode: MultiMasterMode = mmMode) => {
    delete trackersRef.current[s];
    setStats((p) => ({ ...p, [s]: emptyStats() }));
    setIdLogs((p) => p.filter((r) => r.strategy !== s));
    setDupExamples((p) => p.filter((d) => d.strategy !== s));
    setSelectedRecord((r) => (r && r.strategy === s ? null : r));
    if (s === 'AUTO_INCREMENT') dbCounterRef.current = 0;
    if (s === 'TICKET_SERVER') ticketRef.current = 0;
    if (s === 'AUTO_INC_OFFSET') mmRef.current = buildServers(mmRef.current.length, mode);
    if (s === 'SNOWFLAKE') sfRef.current = {};
    setLastEvent(null);
  };

  /** Build one ID for the given strategy (or a failure reason). */
  const draftFor = (s: StrategyType, workerId?: string, serverIdx?: number): { draft?: Draft; fail?: string } => {
    const now = Date.now();
    const worker = (workerId && WORKERS.find((w) => w.id === workerId)) || WORKERS[Math.floor(Math.random() * WORKERS.length)];

    if (s === 'AUTO_INCREMENT') {
      if (centralDown) return { fail: `${worker.name}: primary DB is down, so no ID can be issued.` };
      dbCounterRef.current += 1;
      return { draft: { strategy: s, value: String(dbCounterRef.current), issuedAtMs: now, source: `${worker.name} → Primary DB` } };
    }

    if (s === 'AUTO_INC_OFFSET') {
      const servers = mmRef.current;
      const idx = serverIdx !== undefined && serverIdx < servers.length ? serverIdx : Math.floor(Math.random() * servers.length);
      const srv = servers[idx];
      const step = mmMode === 'offset' ? servers.length : 1;
      const next = srv.last === null ? srv.start : srv.last + step;
      srv.last = next;
      return {
        draft: { strategy: s, value: String(next), issuedAtMs: now, source: srv.name, note: `start ${srv.start}, step ${step}` },
      };
    }

    if (s === 'UUID') {
      return { draft: { strategy: s, value: uuidV4(), issuedAtMs: now, source: worker.name } };
    }

    if (s === 'TICKET_SERVER') {
      if (centralDown) return { fail: `${worker.name}: ticket server is down, so no ID can be issued.` };
      ticketRef.current += 1;
      return { draft: { strategy: s, value: String(ticketRef.current), issuedAtMs: now, source: `${worker.name} → Ticket server` } };
    }

    // SNOWFLAKE
    if (!layoutValid) return { fail: `Bit layout sums to ${bitTotal}, not 64. Fix it in the layout builder.` };
    const rt = (sfRef.current[worker.id] ??= { lastTs: -1, seq: 0 });
    const st = nextSnowflake(rt, now, layout.s, 'WAIT', 'WAIT');
    if (!st.ok) return { fail: 'Clock moved backwards.' };
    const value = composeSnowflake(st.ts - epoch, worker.datacenterId, worker.machineId, st.seq, layout).toString();
    const note = st.overflowWait ? 'sequence exhausted: waited for next millisecond' : st.waitedMs > 0 ? `waited ${st.waitedMs} ms for the clock` : undefined;
    return {
      draft: {
        strategy: s,
        value,
        issuedAtMs: st.ts,
        source: worker.name,
        datacenterId: worker.datacenterId,
        machineId: worker.machineId,
        sequence: st.seq,
        layout: { ...layout, epoch },
        note,
      },
    };
  };

  const generateManual = (serverIdx?: number) => {
    const r = draftFor(strategy, selectedWorkerId, serverIdx ?? selectedServerIdx);
    if (!r.draft) {
      commit(strategy, [], 1);
      setLastEvent({ text: r.fail ?? 'Request failed.', tone: 'fail' });
      return;
    }
    const [rec] = commit(strategy, [r.draft], 0, true);
    if (rec.isDuplicate) setLastEvent({ text: `Duplicate! ${rec.value} from ${rec.source} was already issued by ${rec.duplicateOf}.`, tone: 'dup' });
    else if (rec.outOfOrder) setLastEvent({ text: `${rec.value} from ${rec.source} is smaller than an ID issued earlier: not ordered by time.`, tone: 'warn' });
    else setLastEvent({ text: `Issued ${rec.value} (${rec.source}${rec.sequence !== undefined ? `, seq ${rec.sequence}` : ''}).`, tone: 'ok' });
  };

  // Live flow: every 250 ms, generate rps/4 IDs with the current strategy.
  const tickRef = useRef<() => void>(() => {});
  tickRef.current = () => {
    const n = Math.max(1, Math.round(rps / 4));
    const drafts: Draft[] = [];
    let failures = 0;
    for (let i = 0; i < n; i++) {
      const r = draftFor(strategy);
      if (r.draft) drafts.push(r.draft);
      else failures++;
    }
    commit(strategy, drafts, failures);
    if (failures && !drafts.length) setLastEvent({ text: `${failures} requests failed in the last 250 ms: nothing can issue IDs.`, tone: 'fail' });
  };
  useEffect(() => {
    if (!isSimulating) return;
    const iv = setInterval(() => tickRef.current(), 250);
    return () => clearInterval(iv);
  }, [isSimulating]);

  // --- Multi-master controls ---
  const setMultiMasterMode = (mode: MultiMasterMode) => {
    setMmMode(mode);
    resetStrategy('AUTO_INC_OFFSET', mode);
    setMmNote(
      mode === 'naive'
        ? 'Naive mode: every server starts at 1 and steps by 1, so they all produce the same sequence.'
        : 'Offset mode: server i starts at i and steps by k.'
    );
  };
  const addServer = () => {
    const servers = mmRef.current;
    if (servers.length >= 6) return;
    const oldK = servers.length;
    const newK = oldK + 1;
    const name = `DB ${String.fromCharCode(64 + newK)}`;
    const start = mmMode === 'offset' ? newK : 1;
    servers.push({ name, start, last: null });
    const owner = trackersRef.current.AUTO_INC_OFFSET?.seen.get(String(start));
    setMmNote(
      mmMode === 'offset'
        ? `k changed ${oldK} → ${newK}. Existing servers now step by ${newK} from where they were, and ${name} starts at ${start}${owner ? `, which ${owner} already issued` : ''}. Keep generating and watch duplicates appear.`
        : `${name} added. In naive mode it starts at 1 like the others.`
    );
    rerender();
  };
  const removeServer = () => {
    const servers = mmRef.current;
    if (servers.length <= 1) return;
    const gone = servers.pop()!;
    setSelectedServerIdx((i) => Math.min(i, servers.length - 1));
    setMmNote(
      mmMode === 'offset'
        ? `${gone.name} removed; k changed ${servers.length + 1} → ${servers.length}. The remaining servers now step by ${servers.length} and will land on numbers already issued.`
        : `${gone.name} removed.`
    );
    rerender();
  };

  // --- Layout controls ---
  const applyLayout = (next: BitLayout) => {
    setLayout(next);
    resetStrategy('SNOWFLAKE');
    setBurstResult(null);
    setClockRun(null);
    setLayoutNote('Layout changed: Snowflake history and duplicate tracking were reset, because IDs built with different layouts cannot be compared.');
  };
  const changeBits = (field: keyof BitLayout, val: number) => {
    const next = { ...layout, [field]: val };
    // Rebalance so the total stays 63 + sign bit; clamping may make that impossible → error state.
    if (field !== 's') next.s = clamp(63 - next.t - next.d - next.m, BIT_BOUNDS.s);
    else next.t = clamp(63 - next.s - next.d - next.m, BIT_BOUNDS.t);
    applyLayout(next);
  };
  const autoFixLayout = () => {
    const next = { ...layout };
    let diff = 63 - (next.t + next.d + next.m + next.s);
    for (const k of ['s', 't', 'm', 'd'] as (keyof BitLayout)[]) {
      if (diff === 0) break;
      const target = clamp(next[k] + diff, BIT_BOUNDS[k]);
      diff -= target - next[k];
      next[k] = target;
    }
    applyLayout(next);
  };
  const changeEpoch = (id: EpochId) => {
    setEpochName(id);
    resetStrategy('SNOWFLAKE');
    setBurstResult(null);
    setClockRun(null);
    setLayoutNote('Epoch changed: Snowflake history was reset. In production, changing the epoch would break sorting against existing IDs.');
  };

  // --- Clock rollback scenario (isolated worker, simulated clock readings) ---
  const runClockScenario = () => {
    if (!layoutValid) return;
    const T0 = Date.now();
    const J = clamp(clockJumpMs, [1, 5]);
    const primary: SfRuntime = { lastTs: -1, seq: 0 };
    const backup: SfRuntime = { lastTs: -1, seq: 0 };
    const backupMachine = maxMachines - 1;
    const seen = new Set<string>();
    const plan = [
      ...Array.from({ length: 6 }, (_, i) => ({ phase: 'before' as const, trueRel: i, clockRel: i })),
      ...Array.from({ length: 6 }, (_, k) => ({ phase: 'after' as const, trueRel: 6 + k, clockRel: 6 + k - J })),
    ];
    const rows: ClockRow[] = plan.map((p, i) => {
      const clockNow = T0 + p.clockRel;
      const useBackup = rollbackPolicy === 'BACKUP_WORKER' && clockNow < primary.lastTs;
      const rt = useBackup ? backup : primary;
      const machine = useBackup ? backupMachine : 0;
      // The backup machine's own clock is healthy, so it reads true time.
      const readAt = useBackup ? T0 + p.trueRel : clockNow;
      const policy = rollbackPolicy === 'BACKUP_WORKER' ? 'WAIT' : rollbackPolicy;
      const behindBefore = Math.max(0, primary.lastTs - clockNow);
      const st = nextSnowflake(rt, readAt, layout.s, 'WAIT', policy);
      const base = { n: i + 1, phase: p.phase, trueRel: p.trueRel, clockRel: p.clockRel, handler: useBackup ? `Backup M${backupMachine}` : 'Primary M0', backup: useBackup };
      if (!st.ok) {
        return { ...base, tsRel: null, value: null, seq: null, waitedMs: 0, behindMs: st.behindMs, duplicate: false, rejected: true };
      }
      const value = composeSnowflake(st.ts - epoch, 1, machine, st.seq, layout).toString();
      const duplicate = seen.has(value);
      seen.add(value);
      return { ...base, tsRel: st.ts - T0, value, seq: st.seq, waitedMs: st.waitedMs, behindMs: useBackup ? behindBefore : st.behindMs, duplicate, rejected: false };
    });
    setClockRun({ policy: rollbackPolicy, jump: J, rows });
  };

  // --- Sequence burst (selected worker; all requests arrive in the same millisecond) ---
  const burstMax = Math.min(100_000, Math.max(20_000, (maxSeq + 1) * 3));
  const burstN = clamp(burstSize, [100, burstMax]);
  const runBurst = () => {
    if (!layoutValid) return;
    const worker = WORKERS.find((w) => w.id === selectedWorkerId) ?? WORKERS[0];
    const rt = (sfRef.current[worker.id] ??= { lastTs: -1, seq: 0 });
    // Simulated clock: it only advances when the generator waits for the next millisecond.
    const start = Math.max(Date.now(), rt.lastTs);
    let clock = start;
    let waits = 0;
    let wraps = 0;
    const events: string[] = [];
    const perMs = new Map<number, number>();
    const drafts: Draft[] = [];
    for (let i = 0; i < burstN; i++) {
      const st = nextSnowflake(rt, clock, layout.s, overflowMode, 'WAIT');
      if (!st.ok) continue;
      let note: string | undefined;
      if (st.overflowWait) {
        waits++;
        clock = st.ts;
        note = 'sequence exhausted: waited for next millisecond';
        if (events.length < 8)
          events.push(`Request #${(i + 1).toLocaleString()}: sequence already at ${maxSeq.toLocaleString()} in ms +${st.ts - 1 - start} → waited for the next millisecond (+${st.ts - start}), sequence reset to 0.`);
      }
      if (st.wrapped) {
        wraps++;
        note = 'sequence wrapped to 0 in the same millisecond';
        if (events.length < 8)
          events.push(`Request #${(i + 1).toLocaleString()}: sequence passed ${maxSeq.toLocaleString()} → wrapped to 0 in the same millisecond (+${st.ts - start}) without waiting.`);
      }
      perMs.set(st.ts, (perMs.get(st.ts) ?? 0) + 1);
      drafts.push({
        strategy: 'SNOWFLAKE',
        value: composeSnowflake(st.ts - epoch, worker.datacenterId, worker.machineId, st.seq, layout).toString(),
        issuedAtMs: st.ts,
        source: worker.name,
        datacenterId: worker.datacenterId,
        machineId: worker.machineId,
        sequence: st.seq,
        layout: { ...layout, epoch },
        note,
      });
    }
    const out = commit('SNOWFLAKE', drafts);
    // The simulated waits "took" real milliseconds; let the real clock catch up (a few ms at most).
    const guardStart = Date.now();
    while (Date.now() < rt.lastTs && Date.now() - guardStart < 250) {
      /* spin, as Snowflake's tilNextMillis does */
    }
    setBurstResult({
      requested: burstN,
      worker: worker.name,
      mode: overflowMode,
      capacityPerMs: maxSeq + 1,
      waits,
      wraps,
      duplicates: out.filter((r) => r.isDuplicate).length,
      perMs: Array.from(perMs.entries())
        .sort((a, b) => a[0] - b[0])
        .map(([ms, count]) => ({ ms: ms - start, count })),
      events,
      firstId: out[0]?.value ?? '',
      lastId: out[out.length - 1]?.value ?? '',
    });
  };

  const cur = stats[strategy];
  const currentDupExamples = dupExamples.filter((d) => d.strategy === strategy);

  // -------------------------------------------------------------------------
  // Render helpers
  // -------------------------------------------------------------------------

  const renderWorkerCards = () => (
    <div className="w-full grid grid-cols-2 lg:grid-cols-4 gap-3">
      {WORKERS.map((w) => {
        const isSelected = selectedWorkerId === w.id;
        const rt = sfRef.current[w.id];
        const fits = workerFits(w);
        return (
          <button
            key={w.id}
            onClick={() => setSelectedWorkerId(w.id)}
            className={`p-3 rounded-2xl border text-left transition-all ${
              isSelected
                ? 'bg-amber-100 border-amber-400 ring-2 ring-amber-500/30 text-slate-900 dark:bg-amber-500/15 dark:text-white'
                : 'bg-slate-50 border-slate-200 text-slate-900 hover:border-amber-400 dark:bg-slate-950 dark:border-slate-800 dark:text-white'
            }`}
          >
            <div className="flex items-center justify-between mb-1.5">
              <Cpu className="w-4 h-4 text-amber-600 dark:text-amber-400" />
              {strategy === 'SNOWFLAKE' && (
                <span className="text-[11px] font-mono font-semibold px-1.5 py-0.5 rounded bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                  DC{w.datacenterId} M{w.machineId}
                </span>
              )}
            </div>
            <div className="text-xs font-semibold">{w.name}</div>
            <div className={`text-xs font-mono mt-0.5 ${muted}`}>{w.ip}</div>
            {strategy === 'SNOWFLAKE' && (
              <div className="text-xs font-mono mt-1 font-semibold text-emerald-700 dark:text-emerald-400">seq {rt?.seq ?? 0}</div>
            )}
            {strategy === 'UUID' && <div className={`text-xs mt-1 ${muted}`}>local UUID generator</div>}
            {strategy === 'SNOWFLAKE' && !fits && <div className="text-xs mt-1 text-rose-700 dark:text-rose-300">does not fit current layout</div>}
          </button>
        );
      })}
    </div>
  );

  const renderCentralNode = (label: string, counter: number) => (
    <div
      className={`w-full max-w-sm p-4 rounded-2xl border-2 text-center ${
        centralDown
          ? 'border-rose-400 bg-rose-50 dark:bg-rose-500/10 dark:border-rose-500/60'
          : 'border-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 dark:border-emerald-500/50'
      }`}
    >
      <Database className={`w-6 h-6 mx-auto mb-1 ${centralDown ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}`} />
      <div className={`text-sm font-bold ${heading}`}>{label}</div>
      <div className={`text-xs ${muted}`}>
        {centralDown ? 'DOWN: every ID request fails' : 'UP'} · last issued <span className="font-mono font-semibold">{counter || '—'}</span>
      </div>
      <button
        onClick={() => setCentralDown((d) => !d)}
        className={`mt-2 inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold text-white ${
          centralDown ? 'bg-emerald-600 hover:bg-emerald-500' : 'bg-rose-600 hover:bg-rose-500'
        }`}
      >
        <Power className="w-3.5 h-3.5" />
        {centralDown ? 'Restart' : 'Crash'}
      </button>
    </div>
  );

  const renderMultiMaster = () => {
    const servers = mmRef.current;
    const k = servers.length;
    const step = mmMode === 'offset' ? k : 1;
    return (
      <div className="w-full space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          {(['offset', 'naive'] as MultiMasterMode[]).map((m) => (
            <button
              key={m}
              onClick={() => setMultiMasterMode(m)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${
                mmMode === m
                  ? 'bg-amber-500 border-amber-500 text-slate-950'
                  : 'bg-white border-slate-300 text-slate-700 hover:border-amber-400 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-300'
              }`}
            >
              {m === 'offset' ? 'Offset mode (book): start i, step k' : 'Naive: start 1, step 1'}
            </button>
          ))}
          <span className="flex-1" />
          <button
            onClick={removeServer}
            disabled={k <= 1}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold border border-slate-300 text-slate-700 disabled:opacity-40 dark:border-slate-700 dark:text-slate-300"
          >
            <Minus className="w-3.5 h-3.5" /> Remove server
          </button>
          <button
            onClick={addServer}
            disabled={k >= 6}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-40"
          >
            <Plus className="w-3.5 h-3.5" /> Add server
          </button>
        </div>
        <p className={`text-xs ${muted}`}>
          k = <span className="font-mono font-semibold">{k}</span> servers. Each server: next ID = its previous ID + <span className="font-mono font-semibold">{step}</span>.
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {servers.map((srv, i) => {
            const next = srv.last === null ? srv.start : srv.last + step;
            const sel = selectedServerIdx === i;
            return (
              <div
                key={srv.name}
                onClick={() => setSelectedServerIdx(i)}
                className={`p-3 rounded-2xl border cursor-pointer ${
                  sel
                    ? 'bg-amber-100 border-amber-400 ring-2 ring-amber-500/30 dark:bg-amber-500/15'
                    : 'bg-slate-50 border-slate-200 hover:border-amber-400 dark:bg-slate-950 dark:border-slate-800'
                }`}
              >
                <div className="flex items-center gap-1.5 mb-1">
                  <Database className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                  <span className={`text-sm font-bold ${heading}`}>{srv.name}</span>
                </div>
                <div className={`text-xs font-mono space-y-0.5 ${muted}`}>
                  <div>start {srv.start} · step {step}</div>
                  <div>
                    last <span className={`font-semibold ${heading}`}>{srv.last ?? '—'}</span> · next <span className={`font-semibold ${heading}`}>{next}</span>
                  </div>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedServerIdx(i);
                    generateManual(i);
                  }}
                  className="mt-2 w-full py-1.5 rounded-lg text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-slate-950"
                >
                  Generate here
                </button>
              </div>
            );
          })}
        </div>
        {mmNote && (
          <div className="p-3 rounded-xl border border-indigo-200 bg-indigo-50 text-sm text-indigo-900 dark:border-indigo-400/30 dark:bg-indigo-400/10 dark:text-indigo-100">
            {mmNote}
          </div>
        )}
      </div>
    );
  };

  const flowLabel: Record<StrategyType, string> = {
    AUTO_INCREMENT: '↓ every request: INSERT on the one DB, which assigns the next auto_increment value',
    AUTO_INC_OFFSET: 'requests are spread across the DB servers; each steps its own counter by k',
    UUID: 'no network hop: each web server generates its own random UUID',
    TICKET_SERVER: '↓ every request: ask the ticket server for the next number',
    SNOWFLAKE: 'no network hop: each worker composes its own ID from clock + DC + machine + sequence',
  };

  const renderLayoutBar = (compact = false) => {
    const fields: { key: keyof typeof FIELD; bits: number; sub: string }[] = [
      { key: 'sign', bits: 1, sub: 'always 0' },
      { key: 't', bits: layout.t, sub: `${lifetimeYears.toFixed(1)} yrs` },
      { key: 'd', bits: layout.d, sub: `${maxDcs.toLocaleString()} DCs` },
      { key: 'm', bits: layout.m, sub: `${maxMachines.toLocaleString()} / DC` },
      { key: 's', bits: layout.s, sub: `${(maxSeq + 1).toLocaleString()} / ms` },
    ];
    return (
      <div className="flex gap-1 w-full" role="img" aria-label={`Bit layout: 1 sign, ${layout.t} timestamp, ${layout.d} datacenter, ${layout.m} machine, ${layout.s} sequence bits`}>
        {fields.map((f) => (
          <div
            key={f.key}
            style={{ flexGrow: f.bits, flexBasis: 0, minWidth: f.key === 'sign' ? 40 : 56 }}
            className={`px-1.5 py-2 rounded-lg border text-center ${FIELD[f.key].box}`}
          >
            <div className="text-xs font-bold truncate">{FIELD[f.key].label}</div>
            <div className="text-xs font-mono">{f.bits} bit{f.bits > 1 ? 's' : ''}</div>
            {!compact && <div className="text-[11px] opacity-80 truncate">{f.sub}</div>}
          </div>
        ))}
      </div>
    );
  };

  const renderBinary = (bin: string, L: BitLayout) => {
    const segs: [keyof typeof FIELD, number][] = [
      ['sign', 1],
      ['t', L.t],
      ['d', L.d],
      ['m', L.m],
      ['s', L.s],
    ];
    let pos = 0;
    return (
      <div className="break-all font-mono text-xs font-semibold tracking-wider">
        {segs.map(([k, n]) => {
          const part = bin.slice(pos, pos + n);
          pos += n;
          return (
            <span key={k} className={`${FIELD[k].text} mr-1`}>
              {part}
            </span>
          );
        })}
      </div>
    );
  };

  // -------------------------------------------------------------------------
  // JSX
  // -------------------------------------------------------------------------

  return (
    <div className="space-y-6">
      {/* CHAPTER HERO */}
      <div className="p-6 sm:p-8 rounded-3xl border shadow-xl bg-white border-slate-200 text-slate-900 dark:bg-[#161616] dark:border-white/[0.08] dark:text-white">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2 max-w-3xl">
            <div className="flex items-center space-x-2">
              <span className="px-3 py-1 bg-amber-500 text-slate-950 font-mono text-xs font-black rounded-full uppercase tracking-wider">Chapter 7</span>
              <span className="text-xs font-semibold text-amber-700 dark:text-amber-400">Distributed Unique ID Generation</span>
            </div>
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold tracking-tight">Design a Unique ID Generator</h1>
            <p className={`text-sm leading-relaxed ${muted}`}>
              Requirements from the book: IDs must be unique, numerical only, fit in 64 bits, be ordered by date, and the system must generate over
              10,000 IDs per second. Walk through five designs and watch which requirements each one breaks.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 shrink-0 p-2.5 rounded-2xl border bg-slate-100 border-slate-300 dark:bg-slate-950/60 dark:border-amber-500/20">
            {[1, 2, 3, 4, 5].map((stg) => (
              <button
                key={stg}
                onClick={() => setStage(stg)}
                className={`px-2.5 h-9 rounded-xl font-mono text-xs font-bold transition-all flex items-center justify-center ${
                  stage === stg
                    ? 'bg-amber-500 text-slate-950 shadow-lg'
                    : stage > stg
                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-300 dark:bg-emerald-500/20 dark:text-emerald-300 dark:border-emerald-500/30'
                    : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
                }`}
                title={STAGES[stg - 1].title}
              >
                Stage {stg}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* STAGE GUIDE */}
      <div className={`${panel} space-y-4`}>
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-amber-500/10 text-amber-600 dark:text-amber-400 rounded-2xl border border-amber-500/20">
              <Hash className="w-5 h-5" />
            </div>
            <h2 className={`text-base font-bold ${heading}`}>{info.title}</h2>
          </div>
          <div className="flex items-center space-x-2 shrink-0">
            <button
              disabled={stage === 1}
              onClick={() => setStage(Math.max(1, stage - 1))}
              className="px-3 py-1.5 rounded-xl text-xs font-semibold border border-slate-300 text-slate-700 hover:bg-amber-500/10 disabled:opacity-40 disabled:cursor-not-allowed dark:border-slate-700 dark:text-slate-300"
            >
              ← Previous stage
            </button>
            <button
              disabled={stage === 5}
              onClick={() => setStage(Math.min(5, stage + 1))}
              className="px-4 py-1.5 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold rounded-xl text-xs shadow-md disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Next stage →
            </button>
          </div>
        </div>

        <LessonGoal goal={info.goal} why={info.why} />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm leading-relaxed">
          <div className="p-3.5 rounded-2xl border border-rose-200 bg-rose-50/60 text-slate-800 dark:border-rose-400/20 dark:bg-rose-400/[0.06] dark:text-slate-100">
            <p className="text-xs font-semibold uppercase tracking-wide text-rose-700 dark:text-rose-300 mb-1">Problem</p>
            {info.problem}
          </div>
          <div className="p-3.5 rounded-2xl border border-emerald-200 bg-emerald-50/60 text-slate-800 dark:border-emerald-400/20 dark:bg-emerald-400/[0.06] dark:text-slate-100">
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300 mb-1">Next step</p>
            {info.solution}
          </div>
        </div>

        {info.change && <WhatChanged before={info.change.before} after={info.change.after} reason={info.change.reason} />}
      </div>

      {/* NAVIGATION TABS */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-2">
        {TABS.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center space-x-2 transition-all ${
                activeTab === t.id
                  ? 'bg-amber-500 text-slate-950 shadow-md'
                  : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-white dark:hover:bg-slate-800'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{t.label}</span>
            </button>
          );
        })}
      </div>

      {/* TAB 1: STAGE WALKTHROUGH */}
      {activeTab === 'canvas' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Topology */}
            <div className={`lg:col-span-2 ${panel} flex flex-col gap-5`}>
              <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-200 dark:border-slate-800">
                <h3 className={`text-sm font-bold ${heading}`}>How an ID is generated in this stage</h3>
                <span className="px-2.5 py-1 rounded-full bg-amber-500 text-slate-950 text-xs font-bold">{info.short}</span>
              </div>

              <p className={`text-sm ${muted}`}>
                <strong className={heading}>Try it: </strong>
                {info.tryIt}
              </p>

              <div className="flex flex-col items-center gap-4">
                <div className="flex items-center gap-3 text-xs">
                  <div className={`${inset} px-3 py-2 text-center`}>
                    <Globe className="w-4 h-4 text-indigo-500 mx-auto mb-0.5" />
                    <span className={`font-semibold ${heading}`}>Clients</span>
                  </div>
                  <span className={`${muted}`}>create record →</span>
                  <div className={`${inset} px-3 py-2 text-center`}>
                    <Server className="w-4 h-4 text-amber-500 mx-auto mb-0.5" />
                    <span className={`font-semibold ${heading}`}>Web servers</span>
                  </div>
                </div>

                {strategy !== 'AUTO_INC_OFFSET' && renderWorkerCards()}

                <p className={`text-xs text-center ${muted}`}>{flowLabel[strategy]}</p>

                {strategy === 'AUTO_INCREMENT' && renderCentralNode('Primary DB (auto_increment)', dbCounterRef.current)}
                {strategy === 'TICKET_SERVER' && renderCentralNode('Ticket server', ticketRef.current)}
                {strategy === 'AUTO_INC_OFFSET' && renderMultiMaster()}
              </div>

              {lastEvent && (
                <div
                  className={`p-3 rounded-xl border text-sm flex items-start gap-2 ${
                    lastEvent.tone === 'ok'
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-400/30 dark:bg-emerald-400/10 dark:text-emerald-100'
                      : lastEvent.tone === 'warn'
                      ? 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-100'
                      : 'border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-400/30 dark:bg-rose-400/10 dark:text-rose-100'
                  }`}
                >
                  {lastEvent.tone === 'ok' ? <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" /> : <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />}
                  <span className="break-all">{lastEvent.text}</span>
                </div>
              )}

              {/* Computed metrics for the current strategy */}
              <div className="pt-4 border-t border-slate-200 dark:border-slate-800 grid grid-cols-2 sm:grid-cols-5 gap-3">
                {[
                  { label: 'IDs generated', value: cur.generated.toLocaleString(), tone: heading },
                  { label: 'Duplicates', value: cur.duplicates.toLocaleString(), tone: cur.duplicates ? 'text-rose-700 dark:text-rose-400' : 'text-emerald-700 dark:text-emerald-400' },
                  { label: 'Out of order', value: cur.outOfOrder.toLocaleString(), tone: cur.outOfOrder ? 'text-amber-700 dark:text-amber-400' : 'text-emerald-700 dark:text-emerald-400' },
                  { label: 'Failed requests', value: cur.failures.toLocaleString(), tone: cur.failures ? 'text-rose-700 dark:text-rose-400' : 'text-emerald-700 dark:text-emerald-400' },
                  { label: 'ID size', value: strategy === 'UUID' ? '128 bits' : '64 bits', tone: strategy === 'UUID' ? 'text-rose-700 dark:text-rose-400' : 'text-emerald-700 dark:text-emerald-400' },
                ].map((m) => (
                  <div key={m.label} className={`${inset} p-3`}>
                    <span className={`text-xs ${muted} block`}>{m.label}</span>
                    <p className={`text-sm font-bold font-mono ${m.tone}`}>{m.value}</p>
                  </div>
                ))}
              </div>
              <p className={`text-xs ${muted}`}>
                “Out of order” counts IDs smaller than one issued in an earlier millisecond (the “ordered by date” requirement). Duplicates are checked
                against every ID this strategy has issued since its last reset.
              </p>

              {currentDupExamples.length > 0 && (
                <div className="p-3 rounded-xl border border-rose-200 bg-rose-50 dark:border-rose-400/30 dark:bg-rose-400/10">
                  <p className="text-xs font-semibold uppercase tracking-wide text-rose-700 dark:text-rose-300 mb-1">Duplicate IDs detected</p>
                  <ul className="text-sm text-rose-900 dark:text-rose-100 space-y-0.5">
                    {currentDupExamples.map((d, i) => (
                      <li key={i} className="break-all">
                        <span className="font-mono font-semibold">{d.value}</span>: first from {d.first}, again from {d.second}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* Controls */}
            <div className={`${panel} space-y-5`}>
              <div className="flex items-center space-x-2 pb-3 border-b border-slate-200 dark:border-slate-800">
                <Sliders className="w-4 h-4 text-amber-500" />
                <h3 className={`text-sm font-bold ${heading}`}>Strategy (one per stage)</h3>
              </div>

              <div className="space-y-2">
                {STAGES.map((s, i) => (
                  <button
                    key={s.strategy}
                    onClick={() => setStage(i + 1)}
                    className={`w-full p-3 rounded-2xl border text-left transition-all ${
                      stage === i + 1
                        ? 'bg-amber-500 text-slate-950 border-amber-400 ring-2 ring-amber-500/20 shadow-md'
                        : 'bg-slate-50 border-slate-200 text-slate-700 hover:border-slate-300 dark:bg-slate-950 dark:border-slate-800 dark:text-slate-300 dark:hover:border-slate-700'
                    }`}
                  >
                    <div className="text-xs font-bold">
                      {i + 1}. {s.short}
                    </div>
                    <div className="text-xs opacity-80">{s.desc}</div>
                  </button>
                ))}
              </div>

              <div className="space-y-3 pt-3 border-t border-slate-200 dark:border-slate-800">
                <div className="flex items-center justify-between text-xs font-semibold">
                  <span className={heading}>Simulated traffic</span>
                  <span className="font-mono text-amber-700 dark:text-amber-400">{rps.toLocaleString()} req/s</span>
                </div>
                <input type="range" min={4} max={4000} step={4} value={rps} onChange={(e) => setRps(Number(e.target.value))} className="w-full accent-amber-500" />
                <p className={`text-xs ${muted}`}>
                  The flow issues {Math.max(1, Math.round(rps / 4)).toLocaleString()} IDs every 250 ms. Higher rates put more IDs in the same millisecond.
                </p>

                <div className="grid grid-cols-2 gap-2 pt-1">
                  <button
                    onClick={() => generateManual()}
                    className="py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl text-xs shadow-md flex items-center justify-center space-x-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Generate one ID</span>
                  </button>
                  <button
                    onClick={() => setIsSimulating(!isSimulating)}
                    className={`py-2.5 rounded-xl text-xs font-semibold shadow-md flex items-center justify-center space-x-1 text-white ${
                      isSimulating ? 'bg-rose-600 hover:bg-rose-500' : 'bg-emerald-600 hover:bg-emerald-500'
                    }`}
                  >
                    {isSimulating ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                    <span>{isSimulating ? 'Pause flow' : 'Start flow'}</span>
                  </button>
                </div>
                <p className={`text-xs ${muted}`}>
                  {strategy === 'AUTO_INC_OFFSET'
                    ? `“Generate one ID” uses the selected DB server (${mmRef.current[selectedServerIdx]?.name ?? '—'}).`
                    : `“Generate one ID” uses the selected web server (${WORKERS.find((w) => w.id === selectedWorkerId)?.name}).`}
                </p>
                <button
                  onClick={() => resetStrategy(strategy)}
                  className="w-full py-2 rounded-xl text-xs font-semibold border border-slate-300 text-slate-700 hover:bg-slate-100 flex items-center justify-center gap-1 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  <RotateCcw className="w-3.5 h-3.5" /> Reset counters for this strategy
                </button>
              </div>
            </div>
          </div>

          {/* Requirements scorecard */}
          <div className={`${panel} space-y-3`}>
            <h3 className={`text-sm font-bold ${heading}`}>Requirements scorecard (from the book's scope)</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[720px]">
                <thead>
                  <tr className="text-left">
                    <th className={`py-2 pr-3 ${labelCls}`}>Approach</th>
                    {REQUIREMENTS.map((r) => (
                      <th key={r} className={`py-2 pr-3 ${labelCls}`}>
                        {r}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {SCORECARD.map((row) => (
                    <tr
                      key={row.strategy}
                      className={`border-t border-slate-200 dark:border-slate-800 ${row.strategy === strategy ? 'bg-amber-50 dark:bg-amber-500/10' : ''}`}
                    >
                      <td className={`py-2 pr-3 font-semibold ${heading}`}>{row.label}</td>
                      {row.cells.map(([v, note], i) => (
                        <td key={i} className="py-2 pr-3 align-top">
                          <span className={`font-semibold ${VERDICT_STYLE[v].cls}`}>{VERDICT_STYLE[v].label}</span>
                          <span className={`block text-xs ${muted}`}>{note}</span>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <Takeaway>{info.takeaway}</Takeaway>
          <Quiz key={stage} persistKey={`chapter7:quiz:stage${stage}`} questions={info.quiz} title={`Check your understanding: stage ${stage}`} />
        </div>
      )}

      {/* TAB 2: 64-BIT LAYOUT BUILDER */}
      {activeTab === 'builder' && (
        <div className={`${panel} space-y-6`}>
          <LessonGoal
            goal="See how the 64 bits are divided, and what each field's width buys you: lifetime, datacenters, machines, and IDs per millisecond."
            why="The book notes that section lengths can be tuned: fewer sequence bits and more timestamp bits suit low-concurrency, long-lived systems. Every width is a trade-off because the total is fixed."
          />

          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className={`text-base font-bold ${heading}`}>Bit layout</h3>
            <div
              className={`px-3 py-1 rounded-full text-xs font-mono font-bold border ${
                layoutValid
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-300 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-500/30'
                  : 'bg-rose-50 text-rose-800 border-rose-300 dark:bg-rose-500/10 dark:text-rose-300 dark:border-rose-500/30'
              }`}
            >
              1 + {layout.t} + {layout.d} + {layout.m} + {layout.s} = {bitTotal} bits {layoutValid ? '✓' : '≠ 64'}
            </div>
          </div>

          {renderLayoutBar()}

          {!layoutValid && (
            <div className="p-3 rounded-xl border border-rose-300 bg-rose-50 text-sm text-rose-900 flex flex-wrap items-center gap-3 dark:border-rose-400/40 dark:bg-rose-400/10 dark:text-rose-100">
              <XCircle className="w-4 h-4 shrink-0" />
              <span className="flex-1">
                {bitTotal < 64 ? `${64 - bitTotal} bit(s) unassigned` : `${bitTotal - 64} bit(s) too many`}: the fields could not be rebalanced within their limits.
                Snowflake generation is disabled until the layout sums to 64.
              </span>
              <button onClick={autoFixLayout} className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold">
                Rebalance
              </button>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {(
              [
                { key: 't', desc: `Lifetime ${lifetimeYears.toFixed(1)} years (${tsRange.toLocaleString()} ms).` },
                { key: 'd', desc: `Up to ${maxDcs.toLocaleString()} datacenters.` },
                { key: 'm', desc: `Up to ${maxMachines.toLocaleString()} machines per datacenter.` },
                { key: 's', desc: `${(maxSeq + 1).toLocaleString()} IDs per ms per machine.` },
              ] as { key: keyof BitLayout; desc: string }[]
            ).map((f) => (
              <div key={f.key} className={`${inset} p-4 space-y-2`}>
                <div className="flex justify-between text-xs font-semibold">
                  <span className={heading}>{FIELD[f.key].label} bits</span>
                  <span className={`font-mono ${FIELD[f.key].text}`}>{layout[f.key]}</span>
                </div>
                <input
                  type="range"
                  min={BIT_BOUNDS[f.key][0]}
                  max={BIT_BOUNDS[f.key][1]}
                  value={layout[f.key]}
                  onChange={(e) => changeBits(f.key, Number(e.target.value))}
                  className="w-full accent-amber-500"
                  aria-label={`${FIELD[f.key].label} bits`}
                />
                <p className={`text-xs ${muted}`}>{f.desc}</p>
              </div>
            ))}
          </div>
          <p className={`text-xs ${muted}`}>
            Moving the timestamp, datacenter or machine slider gives or takes bits from the sequence field; moving the sequence slider trades with the
            timestamp.
          </p>

          <div className="flex flex-wrap gap-2">
            {LAYOUT_PRESETS.map((p) => (
              <button
                key={p.label}
                onClick={() => applyLayout(p.layout)}
                className="px-3 py-2 rounded-xl text-xs border border-slate-300 text-slate-700 hover:border-amber-400 text-left dark:border-slate-700 dark:text-slate-300"
              >
                <span className="font-semibold block">{p.label}</span>
                <span className={muted}>{p.hint}</span>
              </button>
            ))}
          </div>

          {/* Derived limits */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            {[
              { label: 'Lifetime from epoch', value: `${lifetimeYears.toFixed(1)} years` },
              { label: 'Timestamp runs out', value: overflowDate.getTime() > 8.64e15 ? 'far future' : overflowDate.toISOString().slice(0, 10) },
              { label: 'Datacenters', value: maxDcs.toLocaleString() },
              { label: 'Machines in total', value: (maxDcs * maxMachines).toLocaleString() },
              { label: 'IDs/sec per machine', value: ((maxSeq + 1) * 1000).toLocaleString() },
            ].map((m) => (
              <div key={m.label} className={`${inset} p-3`}>
                <span className={`text-xs ${muted} block`}>{m.label}</span>
                <p className={`text-sm font-bold font-mono ${heading}`}>{m.value}</p>
              </div>
            ))}
          </div>
          <p className={`text-xs ${muted}`}>
            Requirement: over 10,000 IDs per second. One machine alone can issue {((maxSeq + 1) * 1000).toLocaleString()} per second with this layout
            {(maxSeq + 1) * 1000 >= 10_000 ? ', so the requirement is met.' : ', which is below the requirement.'}
          </p>

          {/* Warnings driven by the layout */}
          {(tsOverflowed || misfitWorkers.length > 0) && (
            <div className="p-3 rounded-xl border border-amber-300 bg-amber-50 text-sm text-amber-900 space-y-1 dark:border-amber-400/40 dark:bg-amber-400/10 dark:text-amber-100">
              {tsOverflowed && (
                <p>
                  <strong>Timestamp overflow:</strong> {elapsedSinceEpoch.toLocaleString()} ms have passed since this epoch, more than {layout.t} bits can hold.
                  New IDs wrap around, so they are no longer ordered and can collide. The decoder will show the wrong time.
                </p>
              )}
              {misfitWorkers.map((w) => (
                <p key={w.id}>
                  <strong>{w.name}</strong> (DC{w.datacenterId}, M{w.machineId}) does not fit: masking turns it into DC{w.datacenterId & (maxDcs - 1)}, M
                  {w.machineId & (maxMachines - 1)}, which can collide with another worker's IDs.
                </p>
              ))}
            </div>
          )}

          {layoutNote && <p className={`text-xs ${muted}`}>{layoutNote}</p>}

          {/* Epoch */}
          <div className={`${inset} p-5 space-y-3`}>
            <span className={labelCls}>Epoch</span>
            <p className={`text-sm ${muted}`}>
              The timestamp stores milliseconds since the{' '}
              <Term term="epoch">The instant the timestamp counts from. A custom epoch close to today delays the overflow date.</Term>. Choosing a recent
              epoch spends the {layout.t}-bit range on the future instead of on years already past.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              {EPOCHS.map((ep) => (
                <button
                  key={ep.id}
                  onClick={() => changeEpoch(ep.id)}
                  className={`px-4 py-2 rounded-xl text-xs font-semibold border transition-all ${
                    epochName === ep.id
                      ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-md'
                      : 'bg-white border-slate-200 text-slate-700 dark:bg-[#1c1c1e] dark:border-slate-800 dark:text-slate-300'
                  }`}
                >
                  {ep.label}
                </button>
              ))}
            </div>
            <div className={`text-xs space-y-1 ${muted}`}>
              <p>
                Epoch: <span className="font-mono font-semibold">{epoch}</span> ms · used so far:{' '}
                <span className="font-mono font-semibold">{Math.min(100, (elapsedSinceEpoch / tsRange) * 100).toFixed(1)}%</span> of the timestamp range
              </p>
            </div>
          </div>

          <Takeaway>
            The total is fixed at 64 bits, so every field is a trade: more timestamp bits mean a longer lifetime, more machine bits mean a bigger fleet,
            more sequence bits mean more IDs per millisecond. Datacenter and machine IDs are fixed at startup; changing them carelessly causes ID
            conflicts.
          </Takeaway>
          <Quiz persistKey="chapter7:quiz:bits" questions={BITS_QUIZ} />
        </div>
      )}

      {/* TAB 3: CLOCK ROLLBACK LAB */}
      {activeTab === 'clock' && (
        <div className={`${panel} space-y-6`}>
          <LessonGoal
            goal={
              <>
                See what happens when a worker's clock jumps backwards (for example after an{' '}
                <Term term="NTP">Network Time Protocol: servers periodically sync their clocks with reference time servers. The book names it as the most popular fix for clock sync, but a correction can move a clock backwards.</Term>{' '}
                correction), and compare four ways to handle it.
              </>
            }
            why={
              <>
                The book's design assumes all ID servers share the same clock. In reality there is{' '}
                <Term term="clock skew">The difference between clocks that should agree: between two servers, or one server before and after a correction.</Term>
                , and Snowflake's uniqueness depends on a worker never reusing a millisecond.
              </>
            }
          />

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className={`${inset} p-5 space-y-5`}>
              <div className="space-y-2">
                <div className="flex justify-between text-xs font-semibold">
                  <span className={heading}>Clock jumps back by</span>
                  <span className="font-mono text-rose-700 dark:text-rose-400">{clamp(clockJumpMs, [1, 5])} ms</span>
                </div>
                <input
                  type="range"
                  min={1}
                  max={5}
                  value={clamp(clockJumpMs, [1, 5])}
                  onChange={(e) => setClockJumpMs(Number(e.target.value))}
                  className="w-full accent-rose-500"
                />
                <p className={`text-xs ${muted}`}>
                  Scenario: worker DC1-M0 issues one ID per millisecond for 6 ms, its clock is corrected backwards, then 6 more requests arrive.
                </p>
              </div>

              <div className="space-y-2">
                <span className={labelCls}>Rollback policy</span>
                {(
                  [
                    { id: 'IGNORE', label: 'No protection', desc: 'Use whatever the clock says (the bug to avoid)' },
                    { id: 'REJECT', label: 'Reject and throw', desc: 'Refuse requests until the clock passes the last used ms' },
                    { id: 'WAIT', label: 'Wait for the clock', desc: 'Block each request until the clock catches up' },
                    { id: 'BACKUP_WORKER', label: 'Switch to backup worker ID', desc: 'Issue from a spare machine ID meanwhile' },
                  ] as { id: RollbackPolicy; label: string; desc: string }[]
                ).map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setRollbackPolicy(p.id)}
                    className={`w-full p-3 rounded-xl border text-left transition-all ${
                      rollbackPolicy === p.id
                        ? 'bg-rose-600 text-white border-rose-500 shadow-md'
                        : 'bg-white border-slate-200 text-slate-700 dark:bg-[#1c1c1e] dark:border-slate-800 dark:text-slate-300'
                    }`}
                  >
                    <div className="text-xs font-semibold">{p.label}</div>
                    <div className="text-xs opacity-80">{p.desc}</div>
                  </button>
                ))}
              </div>

              <button
                onClick={runClockScenario}
                disabled={!layoutValid}
                className="w-full py-2.5 bg-rose-600 hover:bg-rose-500 text-white font-semibold rounded-xl text-xs shadow-md disabled:opacity-40"
              >
                Run rollback scenario
              </button>
              {!layoutValid && <p className="text-xs text-rose-700 dark:text-rose-300">Fix the bit layout first (it must sum to 64).</p>}
            </div>

            <div className="lg:col-span-2 space-y-4">
              {!clockRun ? (
                <div className={`${inset} p-8 text-center text-sm ${muted}`}>Pick a policy and run the scenario to see each request's outcome.</div>
              ) : (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                    {[
                      { label: 'IDs issued', value: clockRun.rows.filter((r) => !r.rejected).length, bad: false },
                      { label: 'Rejected', value: clockRun.rows.filter((r) => r.rejected).length, bad: true },
                      { label: 'Duplicates', value: clockRun.rows.filter((r) => r.duplicate).length, bad: true },
                      { label: 'Total wait', value: `${clockRun.rows.reduce((a, r) => a + r.waitedMs, 0)} ms`, bad: false },
                      { label: 'From backup', value: clockRun.rows.filter((r) => r.backup).length, bad: false },
                    ].map((m) => (
                      <div key={m.label} className={`${inset} p-3`}>
                        <span className={`text-xs ${muted} block`}>{m.label}</span>
                        <p className={`text-sm font-bold font-mono ${m.bad && m.value ? 'text-rose-700 dark:text-rose-400' : heading}`}>{m.value}</p>
                      </div>
                    ))}
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-xs min-w-[640px]">
                      <thead>
                        <tr className="text-left">
                          {['#', 'True time', 'Worker clock', 'Handled by', 'Timestamp used', 'Seq', 'ID', 'Outcome'].map((h) => (
                            <th key={h} className={`py-1.5 pr-2 ${labelCls}`}>
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="font-mono">
                        {clockRun.rows.map((r) => {
                          const rowTone = r.duplicate
                            ? 'bg-rose-50 dark:bg-rose-500/10'
                            : r.rejected
                            ? 'bg-slate-100 dark:bg-slate-800/60'
                            : r.backup
                            ? 'bg-purple-50 dark:bg-purple-500/10'
                            : r.waitedMs
                            ? 'bg-amber-50 dark:bg-amber-500/10'
                            : '';
                          return (
                            <React.Fragment key={r.n}>
                              {r.n === 7 && (
                                <tr>
                                  <td colSpan={8} className="py-1 text-center text-xs font-sans font-semibold text-rose-700 dark:text-rose-300">
                                    ↺ clock corrected backwards by {clockRun.jump} ms
                                  </td>
                                </tr>
                              )}
                              <tr className={`border-t border-slate-200 dark:border-slate-800 ${rowTone} ${heading}`}>
                                <td className="py-1.5 pr-2">{r.n}</td>
                                <td className="py-1.5 pr-2">+{r.trueRel} ms</td>
                                <td className={`py-1.5 pr-2 ${r.clockRel !== r.trueRel ? 'text-rose-700 dark:text-rose-400' : ''}`}>+{r.clockRel} ms</td>
                                <td className="py-1.5 pr-2">{r.handler}</td>
                                <td className="py-1.5 pr-2">{r.tsRel === null ? '—' : `+${r.tsRel} ms`}</td>
                                <td className="py-1.5 pr-2">{r.seq ?? '—'}</td>
                                <td className="py-1.5 pr-2">{r.value ? `…${r.value.slice(-8)}` : '—'}</td>
                                <td className="py-1.5 pr-2 font-sans">
                                  {r.rejected
                                    ? `Rejected: clock ${r.behindMs} ms behind the last used ms`
                                    : r.duplicate
                                    ? 'DUPLICATE of an earlier ID'
                                    : r.backup
                                    ? `Primary ${r.behindMs} ms behind → backup ID`
                                    : r.waitedMs
                                    ? `Waited ${r.waitedMs} ms`
                                    : r.behindMs
                                    ? 'Reused an old millisecond'
                                    : 'OK'}
                                </td>
                              </tr>
                            </React.Fragment>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <p className={`text-xs ${muted}`}>
                    Times are relative to the start of the scenario. The IDs shown are the last 8 digits; the timestamp field is what differs between rows.
                  </p>
                </>
              )}
            </div>
          </div>

          <Takeaway>
            A backwards clock makes a worker revisit milliseconds it already used, and because the sequence restarts at 0, it rebuilds IDs it already
            issued. Rejecting and waiting are both safe but cost errors or latency; a spare worker ID stays available but uses up machine-ID space.
          </Takeaway>
          <Quiz persistKey="chapter7:quiz:clock" questions={CLOCK_QUIZ} />
        </div>
      )}

      {/* TAB 4: SEQUENCE OVERFLOW LAB */}
      {activeTab === 'sequence' && (
        <div className={`${panel} space-y-6`}>
          <LessonGoal
            goal={`Push more than ${(maxSeq + 1).toLocaleString()} requests into one worker within a single millisecond and see what the sequence field does.`}
            why={
              <>
                The{' '}
                <Term term="sequence number">A per-machine counter that resets every millisecond and increments for each extra ID in that millisecond.</Term>{' '}
                has {layout.s} bits, so a worker can issue {(maxSeq + 1).toLocaleString()} IDs per millisecond. Request number{' '}
                {(maxSeq + 2).toLocaleString()} must wait for the next millisecond, or it would reuse sequence 0 and duplicate an ID.
              </>
            }
          />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className={`${inset} p-5 space-y-4`}>
              <div className="space-y-2">
                <div className="flex justify-between text-xs font-semibold">
                  <span className={heading}>Burst size (all in the same ms)</span>
                  <span className="font-mono text-emerald-700 dark:text-emerald-400">{burstN.toLocaleString()} requests</span>
                </div>
                <input
                  type="range"
                  min={100}
                  max={burstMax}
                  step={100}
                  value={burstN}
                  onChange={(e) => setBurstSize(Number(e.target.value))}
                  className="w-full accent-emerald-500"
                />
                <p className={`text-xs ${muted}`}>
                  Capacity: {(maxSeq + 1).toLocaleString()} per ms → this burst needs at least {Math.ceil(burstN / (maxSeq + 1))} millisecond
                  {Math.ceil(burstN / (maxSeq + 1)) > 1 ? 's' : ''}.
                </p>
              </div>

              <div className="space-y-2">
                <span className={labelCls}>When the sequence runs out</span>
                <div className="grid grid-cols-2 gap-2">
                  {(
                    [
                      { id: 'WAIT', label: 'Wait for next ms', desc: 'Correct Snowflake' },
                      { id: 'WRAP', label: 'Wrap to 0 (bug)', desc: 'Same ms, no wait' },
                    ] as { id: OverflowMode; label: string; desc: string }[]
                  ).map((m) => (
                    <button
                      key={m.id}
                      onClick={() => setOverflowMode(m.id)}
                      className={`p-2.5 rounded-xl border text-left ${
                        overflowMode === m.id
                          ? 'bg-emerald-600 text-white border-emerald-500'
                          : 'bg-white border-slate-200 text-slate-700 dark:bg-[#1c1c1e] dark:border-slate-800 dark:text-slate-300'
                      }`}
                    >
                      <div className="text-xs font-semibold">{m.label}</div>
                      <div className="text-xs opacity-80">{m.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <span className={labelCls}>Target worker</span>
                <select
                  value={selectedWorkerId}
                  onChange={(e) => setSelectedWorkerId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border text-sm bg-white border-slate-300 text-slate-800 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-100"
                >
                  {WORKERS.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
                </select>
              </div>

              <button
                onClick={runBurst}
                disabled={!layoutValid}
                className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-xl text-xs shadow-md disabled:opacity-40"
              >
                Fire {burstN.toLocaleString()} requests in one millisecond
              </button>
              {!layoutValid && <p className="text-xs text-rose-700 dark:text-rose-300">Fix the bit layout first (it must sum to 64).</p>}

              {(() => {
                const rt = sfRef.current[selectedWorkerId];
                const seq = rt?.seq ?? 0;
                return (
                  <div>
                    <div className="w-full bg-slate-200 dark:bg-slate-800 rounded-full h-3 overflow-hidden">
                      <div style={{ width: `${Math.min(100, (seq / maxSeq) * 100)}%` }} className="bg-emerald-500 h-full transition-all duration-200" />
                    </div>
                    <span className={`text-xs font-mono block text-right mt-1 ${muted}`}>
                      current sequence: {seq.toLocaleString()} / {maxSeq.toLocaleString()}
                    </span>
                  </div>
                );
              })()}
            </div>

            <div className={`${inset} p-5 space-y-4`}>
              <h4 className={labelCls}>Result</h4>
              {!burstResult ? (
                <p className={`text-sm ${muted}`}>Fire a burst to see how the requests spread over milliseconds.</p>
              ) : (
                <>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { label: 'Milliseconds used', value: burstResult.perMs.length, bad: false },
                      { label: burstResult.mode === 'WAIT' ? 'Waited for next ms' : 'Wrapped in same ms', value: burstResult.mode === 'WAIT' ? burstResult.waits : burstResult.wraps, bad: burstResult.mode === 'WRAP' },
                      { label: 'Duplicate IDs', value: burstResult.duplicates, bad: true },
                    ].map((m) => (
                      <div key={m.label} className="p-2.5 rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-[#1c1c1e]">
                        <span className={`text-xs ${muted} block`}>{m.label}</span>
                        <p className={`text-sm font-bold font-mono ${m.bad && m.value ? 'text-rose-700 dark:text-rose-400' : heading}`}>{m.value.toLocaleString()}</p>
                      </div>
                    ))}
                  </div>

                  <div className="space-y-1" role="img" aria-label="IDs issued per millisecond during the burst">
                    {burstResult.perMs.slice(0, 12).map((p) => (
                      <div key={p.ms} className="flex items-center gap-2 text-xs font-mono">
                        <span className={`w-14 shrink-0 ${muted}`}>ms +{p.ms}</span>
                        <div className="flex-1 bg-slate-200 dark:bg-slate-800 rounded h-3 overflow-hidden">
                          <div
                            className={`h-full ${p.count > burstResult.capacityPerMs ? 'bg-rose-500' : 'bg-emerald-500'}`}
                            style={{ width: `${Math.min(100, (p.count / Math.max(burstResult.capacityPerMs, ...burstResult.perMs.map((x) => x.count))) * 100)}%` }}
                          />
                        </div>
                        <span className={`w-16 text-right ${heading}`}>{p.count.toLocaleString()}</span>
                      </div>
                    ))}
                    {burstResult.perMs.length > 12 && <p className={`text-xs ${muted}`}>…and {burstResult.perMs.length - 12} more milliseconds</p>}
                  </div>

                  {burstResult.events.length > 0 ? (
                    <ul
                      className={`text-xs space-y-1 p-3 rounded-xl border ${
                        burstResult.mode === 'WAIT'
                          ? 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-100'
                          : 'border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-400/30 dark:bg-rose-400/10 dark:text-rose-100'
                      }`}
                    >
                      {burstResult.events.map((e, i) => (
                        <li key={i}>{e}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className={`text-sm ${muted}`}>The burst fit inside one millisecond's sequence range, so no wait was needed.</p>
                  )}

                  <p className={`text-sm ${burstResult.duplicates ? 'text-rose-700 dark:text-rose-300' : 'text-emerald-700 dark:text-emerald-300'}`}>
                    {burstResult.duplicates
                      ? `${burstResult.duplicates.toLocaleString()} duplicate IDs: wrapping in the same millisecond rebuilt IDs that were already issued.`
                      : `All ${burstResult.requested.toLocaleString()} IDs from ${burstResult.worker} are unique.`}
                  </p>
                  <p className={`text-xs font-mono break-all ${muted}`}>
                    first {burstResult.firstId} · last {burstResult.lastId}
                  </p>
                </>
              )}
            </div>
          </div>

          <Takeaway>
            The sequence field caps IDs per millisecond per machine. A correct generator waits for the next millisecond when it runs out; wrapping
            without waiting silently creates duplicates.
          </Takeaway>
          <Quiz persistKey="chapter7:quiz:sequence" questions={SEQUENCE_QUIZ} />
        </div>
      )}

      {/* TAB 5: ID FEED & DECODER */}
      {activeTab === 'logs' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className={`lg:col-span-2 ${panel} space-y-4`}>
            <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center space-x-2">
                <Terminal className="w-4 h-4 text-amber-500" />
                <h3 className={`text-sm font-bold ${heading}`}>Latest generated IDs (all strategies)</h3>
              </div>
              <span className={`text-xs ${muted}`}>Click a row to decode it</span>
            </div>

            {idLogs.length === 0 ? (
              <p className={`text-sm ${muted} text-center py-8`}>No IDs yet. Generate some in the stage walkthrough or the labs.</p>
            ) : (
              <div className="space-y-2 max-h-[480px] overflow-y-auto pr-1">
                {idLogs.map((rec) => (
                  <button
                    key={rec.uid}
                    onClick={() => setSelectedRecord(rec)}
                    className={`w-full p-3 rounded-2xl border text-left transition-all flex items-center justify-between gap-3 ${
                      selectedRecord?.uid === rec.uid
                        ? 'bg-amber-50 border-amber-400 ring-2 ring-amber-500/30 dark:bg-amber-500/15'
                        : rec.isDuplicate
                        ? 'bg-rose-50 border-rose-300 dark:bg-rose-500/10 dark:border-rose-500/50'
                        : 'bg-slate-50 border-slate-200 hover:border-slate-300 dark:bg-slate-950 dark:border-slate-800 dark:hover:border-slate-700'
                    }`}
                  >
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`font-mono font-bold text-sm break-all ${heading}`}>{rec.value}</span>
                        <span className="text-[11px] px-1.5 py-0.5 rounded bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300">{rec.strategy}</span>
                      </div>
                      <div className={`text-xs ${muted}`}>
                        {rec.source}
                        {rec.sequence !== undefined && ` · seq ${rec.sequence}`}
                        {rec.note && ` · ${rec.note}`}
                      </div>
                    </div>
                    <div className="text-right space-y-1 shrink-0">
                      <span className={`text-xs font-mono block ${muted}`}>{new Date(rec.issuedAtMs).toISOString().slice(11, 23)}</span>
                      <span
                        className={`text-[11px] font-bold px-1.5 py-0.5 rounded ${
                          rec.isDuplicate
                            ? 'bg-rose-600 text-white'
                            : rec.outOfOrder
                            ? 'bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300'
                            : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300'
                        }`}
                      >
                        {rec.isDuplicate ? 'DUPLICATE' : rec.outOfOrder ? 'OUT OF ORDER' : 'UNIQUE'}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className={`${panel} space-y-4`}>
            <div className="flex items-center space-x-2 pb-3 border-b border-slate-200 dark:border-slate-800">
              <Hash className="w-4 h-4 text-amber-500" />
              <h3 className={`text-sm font-bold ${heading}`}>Decoder</h3>
            </div>

            {!selectedRecord ? (
              <p className={`text-sm ${muted} text-center py-8`}>Select an ID from the feed to see what its bits contain.</p>
            ) : selectedRecord.strategy === 'UUID' ? (
              <div className="space-y-3 text-sm">
                <p className={`font-mono text-xs break-all font-semibold ${heading}`}>{selectedRecord.value}</p>
                <div className={`${inset} p-3 space-y-1 text-xs`}>
                  <p className={muted}>
                    Format 8-4-4-4-12 hex digits = 32 × 4 = <strong className={heading}>128 bits</strong>.
                  </p>
                  <p className={muted}>
                    Version digit (13th): <span className="font-mono font-semibold">{selectedRecord.value[14]}</span> · variant digit:{' '}
                    <span className="font-mono font-semibold">{selectedRecord.value[19]}</span>
                  </p>
                </div>
                <p className="text-sm text-rose-700 dark:text-rose-300">
                  Fails the 64-bit and numeric requirements, and there is no timestamp inside: the bits cannot tell you when it was created.
                </p>
              </div>
            ) : selectedRecord.strategy !== 'SNOWFLAKE' || !selectedRecord.layout ? (
              <div className="space-y-3 text-sm">
                <p className={`font-mono text-sm break-all font-semibold ${heading}`}>{selectedRecord.value}</p>
                <div className={`${inset} p-3`}>
                  <span className={`text-xs ${muted} block mb-1`}>64-bit binary</span>
                  <p className="font-mono text-xs break-all text-slate-700 dark:text-slate-300">{BigInt(selectedRecord.value).toString(2).padStart(64, '0')}</p>
                </div>
                <p className={`text-sm ${muted}`}>
                  A plain counter value: the bits contain no timestamp, datacenter or machine. You can only learn when it was made by looking it up.
                </p>
              </div>
            ) : (
              (() => {
                const L = selectedRecord.layout!;
                const id = BigInt(selectedRecord.value);
                const dec = decodeSnowflake(id, L, L.epoch);
                const shift = L.d + L.m + L.s;
                const matches = dec.timestampMs === selectedRecord.issuedAtMs;
                return (
                  <div className="space-y-3">
                    <p className={`font-mono text-sm break-all font-semibold ${heading}`}>{selectedRecord.value}</p>
                    <div className={`${inset} p-3 space-y-2`}>
                      <span className={`text-xs ${muted} block`}>64-bit binary (sign · timestamp · DC · machine · sequence)</span>
                      {renderBinary(id.toString(2).padStart(64, '0'), L)}
                    </div>
                    <div className="space-y-2 text-xs">
                      {[
                        { label: `Timestamp = (id >> ${shift})`, value: `${dec.rel.toLocaleString()} ms`, cls: FIELD.t.text },
                        { label: '+ epoch → UTC', value: fmtUtc(dec.timestampMs), cls: FIELD.t.text },
                        { label: `Datacenter = (id >> ${L.m + L.s}) & ${2 ** L.d - 1}`, value: `DC ${dec.datacenterId}`, cls: FIELD.d.text },
                        { label: `Machine = (id >> ${L.s}) & ${2 ** L.m - 1}`, value: `M ${dec.machineId}`, cls: FIELD.m.text },
                        { label: `Sequence = id & ${2 ** L.s - 1}`, value: `#${dec.sequence}`, cls: FIELD.s.text },
                      ].map((r) => (
                        <div key={r.label} className={`${inset} p-2.5 flex justify-between gap-2`}>
                          <span className={`font-mono ${muted}`}>{r.label}</span>
                          <span className={`font-mono font-bold text-right ${r.cls}`}>{r.value}</span>
                        </div>
                      ))}
                    </div>
                    <p className={`text-xs ${matches ? 'text-emerald-700 dark:text-emerald-300' : 'text-rose-700 dark:text-rose-300'}`}>
                      {matches
                        ? 'Decoded time matches the generator clock: the ID carries its own creation time.'
                        : 'Decoded time does not match the generator clock: the timestamp field overflowed and wrapped around.'}
                    </p>
                  </div>
                );
              })()
            )}
          </div>
        </div>
      )}
    </div>
  );
};
