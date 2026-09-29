/*
 * Chapter 6 engine: pure logic for a Dynamo-style key-value store.
 * Ring placement, strict vs sloppy quorum, async replication, hinted handoff, gossip heartbeats,
 * vector clocks, Merkle-tree anti-entropy, and a single node's commit log / memtable / SSTables / bloom filters.
 * No React in here.
 */
import { murmur3Hash, HASH_SPACE_MAX } from '../../lib/hash';

/* ---------------------------------------------------------------- ring ---------------------------------------------------------------- */

export type Clock = Record<string, number>;
export interface Version {
  value: string;
  clock: Clock;
}
export type NodeStatus = 'healthy' | 'crashed';

export interface KVNode {
  id: string;
  dc: 'US-East' | 'EU-West';
  /** Ring positions (degrees). Two tokens per server = two virtual nodes. */
  tokens: number[];
}

// Five servers, two data centers.
export const NODES: KVNode[] = [
  { id: 's0', dc: 'US-East', tokens: [15, 240] },
  { id: 's1', dc: 'US-East', tokens: [55, 95] },
  { id: 's2', dc: 'US-East', tokens: [130, 275] },
  { id: 's3', dc: 'EU-West', tokens: [170, 310] },
  { id: 's4', dc: 'EU-West', tokens: [205, 345] },
];
export const TOKENS = NODES.flatMap((n) => n.tokens.map((angle) => ({ angle, nodeId: n.id }))).sort((a, b) => a.angle - b.angle);
export const nodeById = (id: string) => NODES.find((n) => n.id === id)!;

export const SEED: [string, string][] = [
  ['user:101', 'Alice'],
  ['cart:88', '3 items'],
  ['session:992', 'token-xyz'],
  ['profile:7', 'Bob'],
  ['order:5150', 'shipped'],
];

export const ASYNC_DELAY_MS = 5000;
export const SUSPECT_TICKS = 3;
export const OFFLINE_TICKS = 6;

export function keyAngle(key: string): number {
  return (Math.round((murmur3Hash(key) / HASH_SPACE_MAX) * 3600) / 10) % 360;
}

export interface WalkStep {
  angle: number;
  nodeId: string;
  taken: boolean;
}

/** Walk clockwise from `angle`, visiting every token once; `order` keeps only the first token of each distinct server. */
export function ringWalk(angle: number): { steps: WalkStep[]; order: { nodeId: string; angle: number }[] } {
  let start = TOKENS.findIndex((t) => t.angle >= angle);
  if (start === -1) start = 0;
  const steps: WalkStep[] = [];
  const order: { nodeId: string; angle: number }[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < TOKENS.length; i++) {
    const t = TOKENS[(start + i) % TOKENS.length];
    const taken = !seen.has(t.nodeId);
    if (taken) {
      seen.add(t.nodeId);
      order.push({ nodeId: t.nodeId, angle: t.angle });
    }
    steps.push({ angle: t.angle, nodeId: t.nodeId, taken });
  }
  return { steps, order };
}
export const clockwiseServers = (angle: number) => ringWalk(angle).order.map((o) => o.nodeId);
export const preferenceList = (key: string, n: number) => clockwiseServers(keyAngle(key)).slice(0, n);

/** Walk steps up to and including the N-th distinct server (for showing "skip, same server"). */
export function walkUntil(key: string, n: number): WalkStep[] {
  const out: WalkStep[] = [];
  let taken = 0;
  for (const st of ringWalk(keyAngle(key)).steps) {
    if (taken >= n) break;
    out.push(st);
    if (st.taken) taken++;
  }
  return out;
}

/* ---------------------------------------------------------------- vector clocks ---------------------------------------------------------------- */

export function compareClocks(a: Clock, b: Clock): 'equal' | 'before' | 'after' | 'concurrent' {
  let aLess = false;
  let bLess = false;
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const x = a[k] ?? 0;
    const y = b[k] ?? 0;
    if (x < y) aLess = true;
    if (y < x) bLess = true;
  }
  if (!aLess && !bLess) return 'equal';
  if (aLess && !bLess) return 'before';
  if (bLess && !aLess) return 'after';
  return 'concurrent';
}

export function mergeClocks(clocks: Clock[]): Clock {
  const out: Clock = {};
  clocks.forEach((c) => Object.entries(c).forEach(([k, v]) => (out[k] = Math.max(out[k] ?? 0, v))));
  return out;
}

/** Add a version to a replica's sibling set: drop versions it descends from; ignore it if something already descends from it. */
export function addVersion(existing: Version[] = [], v: Version): Version[] {
  if (existing.some((e) => ['before', 'equal'].includes(compareClocks(v.clock, e.clock)))) return existing;
  return [...existing.filter((e) => compareClocks(e.clock, v.clock) !== 'before'), v];
}

export const latestVersions = (all: Version[]) => all.reduce<Version[]>((acc, v) => addVersion(acc, v), []);

export const hasAll = (have: Version[], wanted: Version[]) => wanted.every((w) => have.some((h) => compareClocks(h.clock, w.clock) === 'equal'));

export function fmtClock(c: Clock, label = 'D'): string {
  const parts = Object.entries(c)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `[${k},${v}]`);
  return `${label}(${parts.join(', ')})`;
}

/** The book's example: versions of one data item D written through servers Sx, Sy, Sz. */
export interface VCVersion {
  id: string;
  value: string;
  clock: Clock;
  server: string;
  from: string[];
}

export function vcWrite(history: VCVersion[], parents: string[], server: string, value: string): VCVersion[] {
  const base = mergeClocks(history.filter((h) => parents.includes(h.id)).map((h) => h.clock));
  const clock = { ...base, [server]: (base[server] ?? 0) + 1 };
  return [...history, { id: `D${history.length + 1}`, value, clock, server, from: parents }];
}

export const BOOK_STEPS: { parents: string[]; server: string; value: string; text: string }[] = [
  { parents: [], server: 'Sx', value: 'name=john', text: 'A client writes D1 to the system, handled by server Sx.' },
  { parents: ['D1'], server: 'Sx', value: 'name=johnDoe', text: 'A client reads D1, updates it to D2, and Sx handles the write again, so Sx’s counter goes up.' },
  { parents: ['D2'], server: 'Sy', value: 'name=johnSF', text: 'A client reads D2, updates it to D3, and this time Sy handles the write.' },
  { parents: ['D2'], server: 'Sz', value: 'name=johnNY', text: 'At the same time another client reads D2 and writes D4 through Sz.' },
];

/** Leaves of the current history: versions nothing else descends from. More than one = siblings (conflict). */
export const vcHeads = (history: VCVersion[]) => history.filter((h) => !history.some((o) => compareClocks(h.clock, o.clock) === 'before'));

/* ---------------------------------------------------------------- cluster simulation ---------------------------------------------------------------- */

interface Hint {
  holder: string;
  target: string;
  key: string;
  version: Version;
}

interface PendingCopy {
  target: string;
  key: string;
  version: Version;
  due: number;
}

export type Outcome = 'ack' | 'async' | 'hint' | 'down' | 'partitioned' | 'refused' | 'fresh' | 'stale' | 'repaired' | 'skipped';

export interface TargetOutcome {
  nodeId: string;
  forNode?: string;
  outcome: Outcome;
}

export interface LastOp {
  type: 'PUT' | 'GET';
  key: string;
  coordinator: string | null;
  pref: string[];
  targets: TargetOutcome[];
  needed: number;
  got: number;
  ok: boolean;
  stale?: boolean;
  summary: string;
  result?: Version[];
}

export interface SimState {
  status: Record<string, NodeStatus>;
  partitioned: boolean;
  replicas: Record<string, Record<string, Version[]>>;
  hints: Hint[];
  pending: PendingCopy[];
  /** Short background notices (newest first): async copies landing, hints handed back. */
  notes: string[];
  lastOp: LastOp | null;
  heartbeats: Record<string, number>;
  /** Membership list as seen by s0: last heartbeat value heard and the tick it last increased. */
  seen: Record<string, { hb: number; at: number }>;
  tick: number;
}

export interface Ctx {
  n: number;
  w: number;
  r: number;
  cap: 'CP' | 'AP';
  sloppy: boolean;
  readRepair: boolean;
}

const note = (s: SimState, text: string): SimState => ({ ...s, notes: [text, ...s.notes].slice(0, 6) });

export const isReachable = (s: SimState, id: string) => s.status[id] === 'healthy' && !(s.partitioned && nodeById(id).dc === 'EU-West');
export const downReason = (s: SimState, id: string): 'down' | 'partitioned' => (s.status[id] === 'crashed' ? 'down' : 'partitioned');

export function storeVersion(s: SimState, nodeId: string, key: string, v: Version): SimState {
  const nodeStore = s.replicas[nodeId] ?? {};
  return { ...s, replicas: { ...s.replicas, [nodeId]: { ...nodeStore, [key]: addVersion(nodeStore[key], v) } } };
}

export function allKeys(s: SimState): string[] {
  const keys = new Set<string>();
  Object.values(s.replicas).forEach((store) => Object.keys(store).forEach((k) => keys.add(k)));
  s.hints.forEach((h) => keys.add(h.key));
  s.pending.forEach((p) => keys.add(p.key));
  return [...keys].sort();
}

/** God's-eye view: newest versions of a key anywhere in the system (replicas, hints, in-flight copies). */
export function globalLatest(s: SimState, key: string): Version[] {
  return latestVersions([
    ...Object.values(s.replicas).flatMap((store) => store[key] ?? []),
    ...s.hints.filter((h) => h.key === key).map((h) => h.version),
    ...s.pending.filter((p) => p.key === key).map((p) => p.version),
  ]);
}

export const hintsFor = (s: SimState, key: string) => s.hints.filter((h) => h.key === key);

function deliverHints(s: SimState): SimState {
  let next = s;
  const keep: Hint[] = [];
  for (const h of s.hints) {
    if (isReachable(s, h.target) && isReachable(s, h.holder)) {
      next = storeVersion(next, h.target, h.key, h.version);
      next = note(next, `Hinted handoff: ${h.holder} sent "${h.key}" back to ${h.target} and deleted its hint.`);
    } else keep.push(h);
  }
  return keep.length === s.hints.length ? s : { ...next, hints: keep };
}

export function createInitialSim(seed: [string, string][] = SEED, n = 3): SimState {
  const ids = NODES.map((x) => x.id);
  let s: SimState = {
    status: Object.fromEntries(ids.map((id) => [id, 'healthy'])) as Record<string, NodeStatus>,
    partitioned: false,
    replicas: Object.fromEntries(ids.map((id) => [id, {}])),
    hints: [],
    pending: [],
    notes: [],
    lastOp: null,
    heartbeats: Object.fromEntries(ids.map((id) => [id, 0])),
    seen: Object.fromEntries(ids.map((id) => [id, { hb: 0, at: 0 }])),
    tick: 0,
  };
  seed.forEach(([k, v]) => {
    const pref = preferenceList(k, n);
    const version = { value: v, clock: { [pref[0]]: 1 } };
    pref.forEach((id) => (s = storeVersion(s, id, k, version)));
  });
  return s;
}

export function doPut(s: SimState, ctx: Ctx, key: string, value: string, context?: Clock): SimState {
  const walk = clockwiseServers(keyAngle(key));
  const pref = walk.slice(0, ctx.n);
  const spares = walk.slice(ctx.n).filter((id) => isReachable(s, id));
  // Preference list is fixed by ring position. A down replica either gets a stand-in (sloppy quorum) or nothing.
  const slots = pref.map((p) => {
    if (isReachable(s, p)) return { pref: p, nodeId: p as string | null, forNode: undefined as string | undefined };
    if (ctx.sloppy && spares.length) return { pref: p, nodeId: spares.shift()!, forNode: p };
    return { pref: p, nodeId: null, forNode: undefined };
  });
  const possible = slots.filter((x) => x.nodeId).length;

  if (possible === 0 || (ctx.cap === 'CP' && possible < ctx.w)) {
    const targets: TargetOutcome[] = slots.map((x) =>
      x.nodeId ? { nodeId: x.nodeId, forNode: x.forNode, outcome: 'refused' } : { nodeId: x.pref, outcome: downReason(s, x.pref) }
    );
    const summary =
      possible === 0
        ? `No replica of "${key}" is reachable, so the write cannot be stored anywhere.`
        : `Only ${possible} of the ${ctx.n} replicas can acknowledge, but W = ${ctx.w}. Under a strict quorum the write is rejected and nothing is stored.`;
    return { ...s, lastOp: { type: 'PUT', key, coordinator: null, pref, targets, needed: ctx.w, got: possible, ok: false, summary } };
  }

  const coord = slots.find((x) => x.nodeId)!.nodeId!;
  const ctxClock = context ?? mergeClocks((s.replicas[coord]?.[key] ?? []).map((v) => v.clock));
  const version: Version = { value, clock: { ...ctxClock, [coord]: (ctxClock[coord] ?? 0) + 1 } };
  let next = s;
  let acked = 0;
  let asyncCount = 0;
  let hintCount = 0;
  const targets: TargetOutcome[] = [];
  const due = Date.now() + ASYNC_DELAY_MS;
  for (const x of slots) {
    if (!x.nodeId) {
      targets.push({ nodeId: x.pref, outcome: downReason(s, x.pref) });
    } else if (x.forNode) {
      next = { ...next, hints: [...next.hints, { holder: x.nodeId, target: x.forNode, key, version }] };
      if (acked < ctx.w) acked++;
      hintCount++;
      targets.push({ nodeId: x.nodeId, forNode: x.forNode, outcome: 'hint' });
    } else if (acked < ctx.w) {
      next = storeVersion(next, x.nodeId, key, version);
      acked++;
      targets.push({ nodeId: x.nodeId, outcome: 'ack' });
    } else {
      // The coordinator already has W acks and returns; this replica gets its copy asynchronously.
      next = { ...next, pending: [...next.pending, { target: x.nodeId, key, version, due }] };
      asyncCount++;
      targets.push({ nodeId: x.nodeId, outcome: 'async' });
    }
  }
  const ok = acked >= ctx.w;
  let summary = ok
    ? `The coordinator got ${acked} of W = ${ctx.w} acks, so the write succeeded.`
    : `Only ${acked} ack(s), W = ${ctx.w}. The write was accepted anyway; the unreachable replicas are stale until repaired.`;
  if (asyncCount) summary += ` ${asyncCount} more replica(s) get the copy in the background, about ${ASYNC_DELAY_MS / 1000}s later.`;
  if (hintCount) summary += ` ${hintCount} stand-in server(s) hold a hint for a down replica.`;
  return { ...next, lastOp: { type: 'PUT', key, coordinator: coord, pref, targets, needed: ctx.w, got: acked, ok, summary } };
}

export function doGet(s: SimState, ctx: Ctx, key: string): SimState {
  const walk = clockwiseServers(keyAngle(key));
  const pref = walk.slice(0, ctx.n);
  // Worst case for overlap: the replicas furthest down the preference list (last to get async copies) answer first.
  const responders: { nodeId: string; forNode?: string; versions: Version[] }[] = [];
  const downTargets: TargetOutcome[] = [];
  for (const p of [...pref].reverse()) {
    if (isReachable(s, p)) responders.push({ nodeId: p, versions: s.replicas[p]?.[key] ?? [] });
    else {
      const hint = ctx.sloppy ? s.hints.find((h) => h.target === p && h.key === key && isReachable(s, h.holder)) : undefined;
      if (hint)
        responders.push({
          nodeId: hint.holder,
          forNode: p,
          versions: latestVersions(s.hints.filter((h) => h.target === p && h.key === key && h.holder === hint.holder).map((h) => h.version)),
        });
      else downTargets.push({ nodeId: p, outcome: downReason(s, p) });
    }
  }
  const possible = responders.length;
  if (possible === 0 || (ctx.cap === 'CP' && possible < ctx.r)) {
    const summary =
      possible === 0
        ? `No replica of "${key}" is reachable, so the read fails.`
        : `Only ${possible} replica(s) can reply, but R = ${ctx.r}. Under a strict quorum the read returns an error instead of possibly stale data.`;
    const targets = [...downTargets, ...responders.map((x) => ({ nodeId: x.nodeId, forNode: x.forNode, outcome: 'skipped' as Outcome }))];
    return { ...s, lastOp: { type: 'GET', key, coordinator: null, pref, targets, needed: ctx.r, got: possible, ok: false, summary } };
  }
  const used = responders.slice(0, ctx.r);
  const unused = responders.slice(ctx.r);
  const latest = latestVersions(used.flatMap((u) => u.versions));
  const truth = globalLatest(s, key);
  let next = s;
  const repaired: string[] = [];
  const targets: TargetOutcome[] = [...downTargets];
  for (const u of used) {
    const fresh = hasAll(u.versions, latest);
    if (!fresh && ctx.readRepair && !u.forNode && latest.length) {
      next = latest.reduce((acc, v) => storeVersion(acc, u.nodeId, key, v), next);
      repaired.push(u.nodeId);
    }
    targets.push({ nodeId: u.nodeId, forNode: u.forNode, outcome: fresh ? 'fresh' : repaired.includes(u.nodeId) ? 'repaired' : 'stale' });
  }
  unused.forEach((u) => targets.push({ nodeId: u.nodeId, forNode: u.forNode, outcome: 'skipped' }));

  const ok = used.length >= ctx.r;
  const staleRead = truth.length > 0 && !hasAll(latest, truth);
  let summary = ok ? `${used.length} of R = ${ctx.r} replies. ` : `Only ${used.length} of R = ${ctx.r} replies; returning the best answer available. `;
  if (!latest.length) summary += `"${key}" was not found on the replicas read.`;
  else if (latest.length > 1) summary += `${latest.length} concurrent versions came back; the client must reconcile them.`;
  else summary += `Returned "${latest[0].value}".`;
  if (staleRead) summary += ' A newer value exists on another replica, but none of the replicas read had it yet.';
  if (repaired.length) summary += ` Read repair updated ${repaired.join(', ')}.`;
  return {
    ...next,
    lastOp: { type: 'GET', key, coordinator: used[0]?.nodeId ?? null, pref, targets, needed: ctx.r, got: used.length, ok, stale: staleRead, summary, result: latest },
  };
}

/** One background round: deliver due async copies, bump heartbeats, let s0 hear gossip, hand back hints. */
export function tickSim(s: SimState): SimState {
  let next: SimState = { ...s, tick: s.tick + 1 };
  const t = Date.now();
  const remaining: PendingCopy[] = [];
  for (const p of s.pending) {
    if (p.due > t) {
      remaining.push(p);
      continue;
    }
    if (isReachable(s, p.target)) {
      next = storeVersion(next, p.target, p.key, p.version);
      next = note(next, `Background copy of "${p.key}" reached ${p.target}.`);
    } else {
      next = note(next, `Background copy of "${p.key}" to ${p.target} was lost; ${p.target} stays stale until repaired.`);
    }
  }
  next = { ...next, pending: remaining };
  const heartbeats = { ...s.heartbeats };
  const seen = { ...s.seen };
  NODES.forEach((x) => {
    if (s.status[x.id] === 'healthy') heartbeats[x.id] = (heartbeats[x.id] ?? 0) + 1;
    if (s.status.s0 === 'healthy' && isReachable(s, x.id) && heartbeats[x.id] > seen[x.id].hb) seen[x.id] = { hb: heartbeats[x.id], at: next.tick };
  });
  return deliverHints({ ...next, heartbeats, seen });
}

export function toggleCrash(s: SimState, id: string): SimState {
  const nextStatus: NodeStatus = s.status[id] === 'crashed' ? 'healthy' : 'crashed';
  const next = { ...s, status: { ...s.status, [id]: nextStatus } };
  return nextStatus === 'healthy' ? deliverHints(next) : next;
}

export function togglePartition(s: SimState): SimState {
  const next = { ...s, partitioned: !s.partitioned };
  return next.partitioned ? next : deliverHints(next);
}

/* ---------------------------------------------------------------- Merkle trees ---------------------------------------------------------------- */

export const BUCKETS: [number, number][] = [
  [0, 90],
  [90, 180],
  [180, 270],
  [270, 360],
];
const h6 = (str: string) => murmur3Hash(str).toString(16).padStart(8, '0').slice(0, 6);

export function sharedKeys(s: SimState, a: string, b: string, n: number): string[] {
  return allKeys(s).filter((k) => {
    const pref = preferenceList(k, n);
    return pref.includes(a) && pref.includes(b);
  });
}

export interface MerkleTree {
  buckets: string[][];
  leaves: string[];
  mids: string[];
  root: string;
}

export function buildMerkle(store: Record<string, Version[]>, keys: string[]): MerkleTree {
  const buckets = BUCKETS.map(([lo, hi]) => keys.filter((k) => keyAngle(k) >= lo && keyAngle(k) < hi).sort());
  const leaves = buckets.map((bk) =>
    h6(
      bk
        .map((k) => `${k}=${(store[k] ?? []).map((v) => v.value + fmtClock(v.clock)).sort().join('|')}`)
        .join(';')
    )
  );
  const mids = [h6(leaves[0] + leaves[1]), h6(leaves[2] + leaves[3])];
  return { buckets, leaves, mids, root: h6(mids[0] + mids[1]) };
}

export function compareMerkle(a: MerkleTree, b: MerkleTree) {
  const rootDiff = a.root !== b.root;
  const midDiff = a.mids.map((m, i) => rootDiff && m !== b.mids[i]);
  const leafCompared = a.leaves.map((_, j) => midDiff[Math.floor(j / 2)]);
  const leafDiff = a.leaves.map((l, j) => leafCompared[j] && l !== b.leaves[j]);
  const comparisons = 1 + (rootDiff ? 2 : 0) + midDiff.filter(Boolean).length * 2;
  return { rootDiff, midDiff, leafCompared, leafDiff, comparisons };
}

/** Sync only the keys in buckets whose leaf hashes differ. Returns the new state and how many keys moved. */
export function merkleSync(s: SimState, a: string, b: string, n: number): { state: SimState; moved: number; total: number } {
  const keys = sharedKeys(s, a, b, n);
  const ta = buildMerkle(s.replicas[a] ?? {}, keys);
  const tb = buildMerkle(s.replicas[b] ?? {}, keys);
  const cmp = compareMerkle(ta, tb);
  let next = s;
  let moved = 0;
  cmp.leafDiff.forEach((diff, j) => {
    if (!diff) return;
    ta.buckets[j].forEach((k) => {
      const merged = latestVersions([...(s.replicas[a]?.[k] ?? []), ...(s.replicas[b]?.[k] ?? [])]);
      merged.forEach((v) => {
        next = storeVersion(next, a, k, v);
        next = storeVersion(next, b, k, v);
      });
      moved++;
    });
  });
  return { state: next, moved, total: keys.length };
}

/** More keys, so a Merkle comparison has several non-empty buckets. */
export const MERKLE_SEED: [string, string][] = [
  ...SEED,
  ...['user:7', 'user:23', 'user:42', 'cart:3', 'cart:19', 'item:5', 'item:77', 'order:12', 'order:900', 'session:4', 'profile:31', 'profile:64'].map(
    (k, i) => [k, `v${i + 1}`] as [string, string]
  ),
];

/** The replica pair that shares the most keys at N = 3, for the Merkle lab. */
export const MERKLE_PAIR: [string, string] = (() => {
  const s = createInitialSim(MERKLE_SEED, 3);
  let best: [string, string] = ['s0', 's1'];
  let bestCount = -1;
  NODES.forEach((x, i) =>
    NODES.slice(i + 1).forEach((y) => {
      const c = sharedKeys(s, x.id, y.id, 3).length;
      if (c > bestCount) {
        bestCount = c;
        best = [x.id, y.id];
      }
    })
  );
  return best;
})();

/* ---------------------------------------------------------------- single-node storage ---------------------------------------------------------------- */

export const MEMTABLE_LIMIT = 3;
export const BLOOM_BITS = 16;
export const bloomPositions = (key: string) => [murmur3Hash(key, 1) % BLOOM_BITS, murmur3Hash(key, 7) % BLOOM_BITS];

export interface SSTable {
  id: number;
  entries: [string, string][];
  bits: boolean[];
}
export interface StorageState {
  commitLog: [string, string][];
  memtable: Record<string, string>;
  sstables: SSTable[];
  nextId: number;
}

export const EMPTY_STORAGE: StorageState = { commitLog: [], memtable: {}, sstables: [], nextId: 1 };

/** Write path: commit log, then memtable; flush to a sorted SSTable (with its bloom filter) when the memtable is full. */
export function storagePut(s: StorageState, k: string, v: string): { state: StorageState; flushed: number | null } {
  const memtable = { ...s.memtable, [k]: v };
  const commitLog: [string, string][] = [...s.commitLog, [k, v]];
  if (Object.keys(memtable).length < MEMTABLE_LIMIT) return { state: { ...s, memtable, commitLog }, flushed: null };
  const entries = Object.entries(memtable).sort(([a], [b]) => a.localeCompare(b));
  const bits = Array(BLOOM_BITS).fill(false) as boolean[];
  entries.forEach(([key]) => bloomPositions(key).forEach((p) => (bits[p] = true)));
  return { state: { commitLog: [], memtable: {}, sstables: [{ id: s.nextId, entries, bits }, ...s.sstables], nextId: s.nextId + 1 }, flushed: s.nextId };
}

/** Crash and restart: memory is lost, the commit log rebuilds the memtable. */
export function storageCrash(s: StorageState): { state: StorageState; lost: number; replayed: number } {
  return { state: { ...s, memtable: Object.fromEntries(s.commitLog) }, lost: Object.keys(s.memtable).length, replayed: s.commitLog.length };
}

export type ReadStep = { table: number | 'memtable'; verdict: 'hit' | 'skip' | 'false-positive' | 'miss'; bit?: number };

/** Read path: memtable, then each SSTable newest first, skipping any whose bloom filter says "definitely not". */
export function storageGet(s: StorageState, k: string): { steps: ReadStep[]; value: string | null; diskReads: number; skipped: number } {
  if (k in s.memtable) return { steps: [{ table: 'memtable', verdict: 'hit' }], value: s.memtable[k], diskReads: 0, skipped: 0 };
  const steps: ReadStep[] = [{ table: 'memtable', verdict: 'miss' }];
  let diskReads = 0;
  let skipped = 0;
  for (const t of s.sstables) {
    const pos = bloomPositions(k);
    const zero = pos.find((p) => !t.bits[p]);
    if (zero !== undefined) {
      skipped++;
      steps.push({ table: t.id, verdict: 'skip', bit: zero });
      continue;
    }
    diskReads++;
    const hit = t.entries.find(([ek]) => ek === k);
    if (hit) {
      steps.push({ table: t.id, verdict: 'hit' });
      return { steps, value: hit[1], diskReads, skipped };
    }
    steps.push({ table: t.id, verdict: 'false-positive' });
  }
  return { steps, value: null, diskReads, skipped };
}

export const STORAGE_SEED: StorageState = (
  [
    ['apple', '1'],
    ['banana', '2'],
    ['cherry', '3'],
    ['date', '4'],
    ['elder', '5'],
    ['fig', '6'],
    ['grape', '7'],
    ['kiwi', '8'],
    ['lemon', '9'],
    ['mango', '10'],
  ] as [string, string][]
).reduce<StorageState>((s, [k, v]) => storagePut(s, k, v).state, EMPTY_STORAGE);
