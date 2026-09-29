import React, { useEffect, useMemo, useState } from 'react';
import {
  Database,
  Server,
  Network,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Play,
  Pause,
  Sliders,
  Terminal,
  GitBranch,
  GitMerge,
  HardDrive,
  ZapOff,
  Radio,
  Lock,
  Scissors,
  RotateCcw,
  MessageSquare,
} from 'lucide-react';
import { usePersistentState } from '../lib/usePersistentState';
import { murmur3Hash, HASH_SPACE_MAX } from '../lib/hash';
import { LessonGoal, WhatChanged, Takeaway, Term, Quiz, type QuizQuestion } from './learn/LearningKit';

interface Chapter6KeyValueStoreProps {
  isDarkMode?: boolean;
}

/* =====================================================================================
 * Model
 * ===================================================================================== */

type Clock = Record<string, number>;
interface Version {
  value: string;
  clock: Clock;
}
type NodeStatus = 'healthy' | 'crashed';

interface KVNode {
  id: string;
  dc: 'US-East' | 'EU-West';
  /** Ring positions (degrees). Two tokens per server = two virtual nodes. */
  tokens: number[];
}

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

type LogType = 'PUT' | 'GET' | 'REPLICATE' | 'REPAIR' | 'HANDOFF' | 'MERKLE' | 'FAILURE' | 'PARTITION';
type LogStatus = 'OK' | 'WARN' | 'ERROR';

interface OperationLog {
  id: number;
  timestamp: string;
  type: LogType;
  status: LogStatus;
  detail: string;
}

type Outcome = 'ack' | 'async' | 'hint' | 'down' | 'partitioned' | 'refused' | 'fresh' | 'stale' | 'repaired' | 'skipped';

interface TargetOutcome {
  nodeId: string;
  forNode?: string;
  outcome: Outcome;
}

interface LastOp {
  type: 'PUT' | 'GET';
  key: string;
  coordinator: string | null;
  pref: string[];
  targets: TargetOutcome[];
  needed: number;
  got: number;
  ok: boolean;
  summary: string;
  result?: Version[];
}

interface SimState {
  status: Record<string, NodeStatus>;
  partitioned: boolean;
  replicas: Record<string, Record<string, Version[]>>;
  hints: Hint[];
  pending: PendingCopy[];
  logs: OperationLog[];
  seq: number;
  lastOp: LastOp | null;
  heartbeats: Record<string, number>;
  /** Membership list as seen by s0: last heartbeat value heard and the tick it last increased. */
  seen: Record<string, { hb: number; at: number }>;
  tick: number;
}

interface Ctx {
  n: number;
  w: number;
  r: number;
  cap: 'CP' | 'AP';
  sloppy: boolean;
  readRepair: boolean;
}

// Five servers, two data centers. The partition toggle cuts EU-West off from the client/coordinators.
const NODES: KVNode[] = [
  { id: 's0', dc: 'US-East', tokens: [15, 240] },
  { id: 's1', dc: 'US-East', tokens: [55, 95] },
  { id: 's2', dc: 'US-East', tokens: [130, 275] },
  { id: 's3', dc: 'EU-West', tokens: [170, 310] },
  { id: 's4', dc: 'EU-West', tokens: [205, 345] },
];
const TOKENS = NODES.flatMap((n) => n.tokens.map((angle) => ({ angle, nodeId: n.id }))).sort((a, b) => a.angle - b.angle);
const nodeById = (id: string) => NODES.find((n) => n.id === id)!;

const SEED: [string, string][] = [
  ['user:101', 'Alice'],
  ['cart:88', '3 items'],
  ['session:992', 'token-xyz'],
  ['profile:7', 'Bob'],
  ['order:5150', 'shipped'],
];

const ASYNC_DELAY_MS = 5000;
const SUSPECT_TICKS = 3;
const OFFLINE_TICKS = 6;

function keyAngle(key: string): number {
  return (Math.round((murmur3Hash(key) / HASH_SPACE_MAX) * 3600) / 10) % 360;
}

interface WalkStep {
  angle: number;
  nodeId: string;
  taken: boolean;
}

/** Walk clockwise from `angle`, visiting every token once; `order` keeps only the first token of each distinct server. */
function ringWalk(angle: number): { steps: WalkStep[]; order: { nodeId: string; angle: number }[] } {
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
const clockwiseServers = (angle: number) => ringWalk(angle).order.map((o) => o.nodeId);

/* ---------- vector clocks ---------- */

function compareClocks(a: Clock, b: Clock): 'equal' | 'before' | 'after' | 'concurrent' {
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

function mergeClocks(clocks: Clock[]): Clock {
  const out: Clock = {};
  clocks.forEach((c) => Object.entries(c).forEach(([k, v]) => (out[k] = Math.max(out[k] ?? 0, v))));
  return out;
}

/** Add a version to a replica's sibling set: drop versions it descends from; ignore it if something already descends from it. */
function addVersion(existing: Version[] = [], v: Version): Version[] {
  if (existing.some((e) => ['before', 'equal'].includes(compareClocks(v.clock, e.clock)))) return existing;
  return [...existing.filter((e) => compareClocks(e.clock, v.clock) !== 'before'), v];
}

const latestVersions = (all: Version[]) => all.reduce<Version[]>((acc, v) => addVersion(acc, v), []);

const hasAll = (have: Version[], wanted: Version[]) =>
  wanted.every((w) => have.some((h) => compareClocks(h.clock, w.clock) === 'equal'));

function fmtClock(c: Clock, label = 'D'): string {
  const parts = Object.entries(c)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `[${k},${v}]`);
  return `${label}(${parts.join(', ')})`;
}

/* ---------- cluster simulation (pure state transitions) ---------- */

const clockNow = () => new Date().toLocaleTimeString('en-US', { hour12: false });

function addLog(s: SimState, type: LogType, status: LogStatus, detail: string): SimState {
  return { ...s, seq: s.seq + 1, logs: [{ id: s.seq, timestamp: clockNow(), type, status, detail }, ...s.logs].slice(0, 80) };
}

const isReachable = (s: SimState, id: string) => s.status[id] === 'healthy' && !(s.partitioned && nodeById(id).dc === 'EU-West');
const downReason = (s: SimState, id: string): 'down' | 'partitioned' => (s.status[id] === 'crashed' ? 'down' : 'partitioned');

function storeVersion(s: SimState, nodeId: string, key: string, v: Version): SimState {
  const nodeStore = s.replicas[nodeId] ?? {};
  return { ...s, replicas: { ...s.replicas, [nodeId]: { ...nodeStore, [key]: addVersion(nodeStore[key], v) } } };
}

function allKeys(s: SimState): string[] {
  const keys = new Set<string>();
  Object.values(s.replicas).forEach((store) => Object.keys(store).forEach((k) => keys.add(k)));
  s.hints.forEach((h) => keys.add(h.key));
  s.pending.forEach((p) => keys.add(p.key));
  return [...keys].sort();
}

/** God's-eye view: newest versions of a key anywhere in the system (replicas, hints, in-flight copies). */
function globalLatest(s: SimState, key: string): Version[] {
  return latestVersions([
    ...Object.values(s.replicas).flatMap((store) => store[key] ?? []),
    ...s.hints.filter((h) => h.key === key).map((h) => h.version),
    ...s.pending.filter((p) => p.key === key).map((p) => p.version),
  ]);
}

function deliverHints(s: SimState): SimState {
  let next = s;
  const keep: Hint[] = [];
  for (const h of s.hints) {
    if (isReachable(s, h.target) && isReachable(s, h.holder)) {
      next = storeVersion(next, h.target, h.key, h.version);
      next = addLog(next, 'HANDOFF', 'OK', `Hinted handoff: ${h.holder} sent "${h.key}" ${fmtClock(h.version.clock)} back to ${h.target} and deleted the hint.`);
    } else keep.push(h);
  }
  return keep.length === s.hints.length ? s : { ...next, hints: keep };
}

function createInitialSim(): SimState {
  const ids = NODES.map((n) => n.id);
  let s: SimState = {
    status: Object.fromEntries(ids.map((id) => [id, 'healthy'])) as Record<string, NodeStatus>,
    partitioned: false,
    replicas: Object.fromEntries(ids.map((id) => [id, {}])),
    hints: [],
    pending: [],
    logs: [],
    seq: 1,
    lastOp: null,
    heartbeats: Object.fromEntries(ids.map((id) => [id, 0])),
    seen: Object.fromEntries(ids.map((id) => [id, { hb: 0, at: 0 }])),
    tick: 0,
  };
  SEED.forEach(([k, v]) => {
    const pref = clockwiseServers(keyAngle(k)).slice(0, 3);
    const version = { value: v, clock: { [pref[0]]: 1 } };
    pref.forEach((id) => (s = storeVersion(s, id, k, version)));
  });
  return addLog(s, 'PUT', 'OK', `Seeded ${SEED.length} keys, each on the first 3 distinct servers clockwise from its hash.`);
}

function doPut(s: SimState, ctx: Ctx, key: string, value: string, context?: Clock): SimState {
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
        : `Only ${possible} of the ${ctx.n} replicas can acknowledge, but W = ${ctx.w}. Strict quorum (CP): the write is rejected and nothing is stored.`;
    return addLog(
      { ...s, lastOp: { type: 'PUT', key, coordinator: null, pref, targets, needed: ctx.w, got: possible, ok: false, summary } },
      'PUT',
      'ERROR',
      `PUT "${key}" rejected: ${possible} ack(s) possible, W = ${ctx.w}.`
    );
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
    ? `Coordinator ${coord} received ${acked} of W = ${ctx.w} acks, so the write succeeded with version ${fmtClock(version.clock)}.`
    : `Only ${acked} ack(s), W = ${ctx.w}. AP mode accepts the write anyway: the unreachable replicas are now stale and must be reconciled later.`;
  if (asyncCount) summary += ` ${asyncCount} more replica(s) get the copy asynchronously in ~${ASYNC_DELAY_MS / 1000}s.`;
  if (hintCount) summary += ` ${hintCount} stand-in server(s) hold hints for down replicas.`;
  next = { ...next, lastOp: { type: 'PUT', key, coordinator: coord, pref, targets, needed: ctx.w, got: acked, ok, summary } };
  return addLog(next, 'PUT', ok ? 'OK' : 'WARN', `PUT "${key}"="${value}" via ${coord}: ${acked}/${ctx.w} acks. ${ok ? 'Succeeded.' : 'Below quorum (AP accepted).'}`);
}

function doGet(s: SimState, ctx: Ctx, key: string): SimState {
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
        : `Only ${possible} replica(s) can reply, but R = ${ctx.r}. Strict quorum (CP): the read returns an error instead of possibly stale data.`;
    const targets = [...downTargets, ...responders.map((x) => ({ nodeId: x.nodeId, forNode: x.forNode, outcome: 'skipped' as Outcome }))];
    return addLog(
      { ...s, lastOp: { type: 'GET', key, coordinator: null, pref, targets, needed: ctx.r, got: possible, ok: false, summary } },
      'GET',
      'ERROR',
      `GET "${key}" failed: ${possible} replies possible, R = ${ctx.r}.`
    );
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
      const before = u.versions.length ? u.versions.map((v) => fmtClock(v.clock)).join(' | ') : 'nothing';
      next = latest.reduce((acc, v) => storeVersion(acc, u.nodeId, key, v), next);
      next = addLog(next, 'REPAIR', 'OK', `Read repair: ${u.nodeId} had ${before}; updated to ${latest.map((v) => fmtClock(v.clock)).join(' | ')}.`);
      repaired.push(u.nodeId);
    }
    targets.push({ nodeId: u.nodeId, forNode: u.forNode, outcome: fresh ? 'fresh' : repaired.includes(u.nodeId) ? 'repaired' : 'stale' });
  }
  unused.forEach((u) => targets.push({ nodeId: u.nodeId, forNode: u.forNode, outcome: 'skipped' }));

  const ok = used.length >= ctx.r;
  const staleRead = truth.length > 0 && !hasAll(latest, truth);
  let summary = ok ? `${used.length} of R = ${ctx.r} replies. ` : `Only ${used.length} of R = ${ctx.r} replies (AP returns its best answer). `;
  if (!latest.length) summary += `"${key}" not found on the replicas read.`;
  else if (latest.length > 1) summary += `${latest.length} concurrent versions (siblings) came back: the client must reconcile them.`;
  else summary += `Returned "${latest[0].value}" ${fmtClock(latest[0].clock)}.`;
  if (staleRead)
    summary += ` STALE READ: a newer version exists elsewhere, but none of the replicas read had it (their read set missed the write set).`;
  if (repaired.length) summary += ` Read repair updated ${repaired.join(', ')}.`;
  next = { ...next, lastOp: { type: 'GET', key, coordinator: used[0]?.nodeId ?? null, pref, targets, needed: ctx.r, got: used.length, ok, summary, result: latest } };
  return addLog(next, 'GET', staleRead || !ok ? 'WARN' : 'OK', `GET "${key}": ${used.length}/${ctx.r} replies. ${latest.map((v) => `"${v.value}" ${fmtClock(v.clock)}`).join(' | ') || 'not found'}${staleRead ? ' (stale)' : ''}`);
}

function tickSim(s: SimState): SimState {
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
      next = addLog(next, 'REPLICATE', 'OK', `Async replication: "${p.key}" ${fmtClock(p.version.clock)} reached ${p.target}.`);
    } else {
      next = addLog(next, 'REPLICATE', 'WARN', `Async copy of "${p.key}" to ${p.target} lost (${downReason(s, p.target)}). ${p.target} stays stale until read repair or anti-entropy.`);
    }
  }
  next = { ...next, pending: remaining };
  // Gossip: every live node bumps its heartbeat; s0 records what it can hear.
  const heartbeats = { ...s.heartbeats };
  const seen = { ...s.seen };
  NODES.forEach((n) => {
    if (s.status[n.id] === 'healthy') heartbeats[n.id] = (heartbeats[n.id] ?? 0) + 1;
    if (s.status.s0 === 'healthy' && isReachable(s, n.id) && heartbeats[n.id] > seen[n.id].hb) seen[n.id] = { hb: heartbeats[n.id], at: next.tick };
  });
  return deliverHints({ ...next, heartbeats, seen });
}

function toggleCrash(s: SimState, id: string): SimState {
  const nextStatus: NodeStatus = s.status[id] === 'crashed' ? 'healthy' : 'crashed';
  let next = addLog(
    { ...s, status: { ...s.status, [id]: nextStatus } },
    'FAILURE',
    nextStatus === 'crashed' ? 'ERROR' : 'OK',
    nextStatus === 'crashed' ? `${id} crashed. It stops acknowledging writes and answering reads.` : `${id} recovered. Any writes it missed leave it stale until hints, read repair or anti-entropy fix it.`
  );
  if (nextStatus === 'healthy') next = deliverHints(next);
  return next;
}

function togglePartition(s: SimState): SimState {
  const partitioned = !s.partitioned;
  let next = addLog(
    { ...s, partitioned },
    'PARTITION',
    partitioned ? 'ERROR' : 'OK',
    partitioned ? 'Network partition: EU-West (s3, s4) can no longer talk to US-East.' : 'Partition healed: EU-West reachable again.'
  );
  if (!partitioned) next = deliverHints(next);
  return next;
}

/* ---------- Merkle trees ---------- */

const BUCKETS: [number, number][] = [
  [0, 90],
  [90, 180],
  [180, 270],
  [270, 360],
];
const h6 = (str: string) => murmur3Hash(str).toString(16).padStart(8, '0').slice(0, 6);

function sharedKeys(s: SimState, a: string, b: string, n: number): string[] {
  return allKeys(s).filter((k) => {
    const pref = clockwiseServers(keyAngle(k)).slice(0, n);
    return pref.includes(a) && pref.includes(b);
  });
}

interface MerkleTree {
  buckets: string[][];
  leaves: string[];
  mids: string[];
  root: string;
}

function buildMerkle(store: Record<string, Version[]>, keys: string[]): MerkleTree {
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

function compareMerkle(a: MerkleTree, b: MerkleTree) {
  const rootDiff = a.root !== b.root;
  const midDiff = a.mids.map((m, i) => rootDiff && m !== b.mids[i]);
  const leafCompared = a.leaves.map((_, j) => midDiff[Math.floor(j / 2)]);
  const leafDiff = a.leaves.map((l, j) => leafCompared[j] && l !== b.leaves[j]);
  const comparisons = 1 + (rootDiff ? 2 : 0) + midDiff.filter(Boolean).length * 2;
  return { rootDiff, midDiff, leafCompared, leafDiff, comparisons };
}

function merkleSync(s: SimState, a: string, b: string, n: number): SimState {
  const keys = sharedKeys(s, a, b, n);
  const ta = buildMerkle(s.replicas[a] ?? {}, keys);
  const tb = buildMerkle(s.replicas[b] ?? {}, keys);
  const cmp = compareMerkle(ta, tb);
  if (!cmp.rootDiff) return addLog(s, 'MERKLE', 'OK', `Anti-entropy ${a}↔${b}: root hashes match (1 comparison). Nothing to transfer.`);
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
  const diffBuckets = cmp.leafDiff.filter(Boolean).length;
  return addLog(
    next,
    'MERKLE',
    'OK',
    `Anti-entropy ${a}↔${b}: ${cmp.comparisons} hash comparisons found ${diffBuckets} of 4 buckets out of sync; exchanged ${moved} of ${keys.length} shared keys.`
  );
}

/* =====================================================================================
 * Stage content (book order: single server → CAP → partition → replication → consistency →
 * inconsistency resolution → failure detection → temporary failures → permanent failures → write/read path)
 * ===================================================================================== */

type TabId = 'cluster' | 'quorum' | 'versions' | 'gossip' | 'merkle' | 'storage' | 'logs';

const TAB_META: { id: TabId; label: string; icon: React.ElementType; unlock: number }[] = [
  { id: 'cluster', label: 'Cluster', icon: Network, unlock: 1 },
  { id: 'quorum', label: 'Quorum (W + R > N)', icon: Sliders, unlock: 5 },
  { id: 'versions', label: 'Vector clocks', icon: GitBranch, unlock: 6 },
  { id: 'gossip', label: 'Gossip', icon: Radio, unlock: 7 },
  { id: 'merkle', label: 'Merkle anti-entropy', icon: GitMerge, unlock: 9 },
  { id: 'storage', label: 'Write & read path', icon: HardDrive, unlock: 10 },
  { id: 'logs', label: 'Operation log', icon: Terminal, unlock: 3 },
];

interface StageInfo {
  short: string;
  title: string;
  tab: TabId;
  goal: React.ReactNode;
  why: React.ReactNode;
  problem: React.ReactNode;
  solution: React.ReactNode;
  question: string;
  tryThis?: React.ReactNode;
  change?: { before: React.ReactNode; after: React.ReactNode; reason: React.ReactNode };
  takeaway: React.ReactNode;
  quiz: QuizQuestion[];
}

const STAGES: StageInfo[] = [
  {
    short: 'Single server',
    title: 'Stage 1: Single-server key-value store',
    tab: 'cluster',
    goal: 'Why one in-memory hash table cannot be the whole answer.',
    why: 'It is the simplest key-value store and it is fast, but it hits two hard limits: one machine’s memory and one machine’s failures.',
    problem: 'All key-value pairs live in one server’s in-memory hash table. Fill the memory and writes fail; crash the server and every request fails.',
    solution: 'Compression and keeping rarely used data on disk buy time, but big data needs a distributed key-value store (a distributed hash table).',
    question: 'What happens to every client when this one server crashes?',
    tryThis: 'Add keys until memory is full, then crash the server and try a GET.',
    takeaway:
      'A single server is easy and fast, but its capacity and availability are capped by one machine. Everything that follows is about spreading data over many servers without losing correctness.',
    quiz: [
      {
        question: 'Your single-server store is at 95% memory. Which option actually removes the capacity ceiling?',
        options: [
          { text: 'Compress the values', why: 'Compression is a valid optimization, but it only delays the limit because data keeps growing.' },
          { text: 'Keep rarely used data on disk', why: 'Also a valid optimization, but one machine’s disk is still finite and it is still a single point of failure.' },
          { text: 'Distribute the key-value pairs across many servers', correct: true, why: 'Only spreading data over many machines lets capacity grow with the number of servers.' },
          { text: 'Buy a bigger server', why: 'That raises the ceiling once, but there is a largest machine you can buy and it is still one point of failure.' },
        ],
      },
      {
        question: 'The single server crashes. What do clients see?',
        options: [
          { text: 'All reads and writes fail until it recovers', correct: true, why: 'There is exactly one copy on one machine, so nothing else can serve requests.' },
          { text: 'Writes fail but reads keep working', why: 'Reads need the data too, and the only copy is on the crashed server.' },
          { text: 'Clients switch to a replica automatically', why: 'There is no replica yet. Replication arrives in stage 4.' },
        ],
      },
    ],
  },
  {
    short: 'CAP theorem',
    title: 'Stage 2: CAP theorem',
    tab: 'cluster',
    goal: (
      <>
        What the <Term term="CAP theorem">A distributed system cannot provide consistency, availability and partition tolerance all at once; it can guarantee at most two.</Term>{' '}
        forces you to choose when the network splits.
      </>
    ),
    why: 'Once data lives on several nodes, a network partition will eventually happen. Then you must either refuse requests (CP) or answer with possibly stale data (AP).',
    problem: 'Data is replicated on n1, n2 and n3. The link to n3 breaks, so writes to n1 cannot reach n3.',
    solution:
      'Choose CP (block writes and return errors so replicas never disagree, e.g. a bank balance) or AP (keep accepting requests and sync n3 when the partition heals, e.g. a shopping cart).',
    question: 'For a shopping cart, is a briefly stale cart worse than a “service unavailable” error?',
    tryThis: 'Cut the link to n3, then write in CP mode and in AP mode. Heal the partition after writing on both sides in AP mode.',
    change: {
      before: 'One server: no network between copies, so CAP never comes up.',
      after: 'Three replicas connected by a network that can partition.',
      reason: 'Partitions cannot be avoided in real networks, so a CA system cannot exist. The real choice is C or A while a partition lasts.',
    },
    takeaway:
      'Partition tolerance is not optional. During a partition, a CP store gives up availability (it returns errors) and an AP store gives up consistency (stale reads, reconcile later).',
    quiz: [
      {
        question: 'A partition isolates n3. In a CP store, what happens to a write sent to n1?',
        options: [
          { text: 'It is blocked and the client gets an error until the partition heals', correct: true, why: 'CP keeps replicas consistent by refusing writes that cannot reach the replicas it needs, which makes the system unavailable for that write.' },
          { text: 'It succeeds on n1 and n2, and n3 catches up later', why: 'That is the AP behaviour: accept now, sync after the partition heals.' },
          { text: 'It is redirected to n3', why: 'n3 is the isolated node; nothing can reach it.' },
        ],
      },
      {
        question: 'Why can’t a real distributed key-value store be CA?',
        options: [
          { text: 'Network partitions happen anyway, so the system must tolerate them', correct: true, why: 'CA assumes the network never fails. Since it does, you must tolerate partitions and pick C or A.' },
          { text: 'Consistency and availability mean the same thing', why: 'They are different guarantees: the same data everywhere vs. always getting a response.' },
          { text: 'CA systems are too slow', why: 'Speed is not the issue. CA is impossible as soon as a partition occurs.' },
        ],
      },
    ],
  },
  {
    short: 'Data partition',
    title: 'Stage 3: Data partition with consistent hashing',
    tab: 'cluster',
    goal: 'How consistent hashing decides which server stores each key.',
    why: 'Partitioning must spread data evenly and move as little data as possible when servers join or leave (Chapter 5).',
    problem: 'The data set no longer fits on one server. It must be split into partitions across five servers.',
    solution: (
      <>
        Place servers on a hash ring (each at two{' '}
        <Term term="virtual node">One of several ring positions owned by the same physical server. More vnodes means a bigger share of the key space.</Term> positions). A key lives
        on the first server found walking clockwise from the key’s hash.
      </>
    ),
    question: 'Why hash servers onto a ring instead of using hash(key) % number_of_servers?',
    tryThis: 'Click a key to see its owner. Crash that server and GET the key: with a single copy, it is unavailable.',
    change: {
      before: 'Every key on one server.',
      after: 'Keys spread over s0 to s4 by a clockwise lookup on the ring.',
      reason: 'Consistent hashing spreads keys evenly and moves few keys when servers change; virtual nodes let bigger servers own more of the ring.',
    },
    takeaway: 'The ring turns “where does this key live?” into a clockwise walk. Right now each key has exactly one home, so a single crash still makes keys unavailable.',
    quiz: [
      {
        question: 'A key hashes to 100°. The next tokens clockwise are 130° (s2) and 170° (s3); the previous one is 95° (s1). Without replication, where is the key stored?',
        options: [
          { text: 's2', correct: true, why: 'Lookup walks clockwise from the key and stops at the first server token: 130° belongs to s2.' },
          { text: 's1, because 95° is the closest token', why: 'Distance does not matter; lookup only walks clockwise, and 95° is behind the key.' },
          { text: 's3', why: 's3 would only be reached if s2 were skipped; the first token clockwise wins.' },
        ],
      },
      {
        question: 'What do virtual nodes add to partitioning?',
        options: [
          { text: 'Each server appears at several ring positions, so load spreads more evenly and bigger servers can own more', correct: true, why: 'The book notes vnode count can be proportional to server capacity (heterogeneity).' },
          { text: 'They store extra copies of every key', why: 'That is replication (next stage). Vnodes are just more ring positions for the same server.' },
          { text: 'They make the hash function faster', why: 'Hashing cost does not change; vnodes affect how the key space is divided.' },
        ],
      },
    ],
  },
  {
    short: 'Replication',
    title: 'Stage 4: Data replication',
    tab: 'cluster',
    goal: (
      <>
        How a key’s N replicas are chosen: the first N <em>distinct</em> servers walking clockwise from the key, called its{' '}
        <Term term="preference list">The ordered list of N servers responsible for a key. It depends only on the key’s ring position and N, not on which servers are up.</Term>.
      </>
    ),
    why: 'One copy per key means one crash makes that key unavailable. N copies on N different servers survive N − 1 crashes.',
    problem: 'With one copy per key, crashing a server makes all of its keys unavailable.',
    solution:
      'Walk clockwise from the key’s position and take the first N distinct servers, skipping extra vnodes of a server already chosen. For extra safety, place replicas in different data centers.',
    question: 'Why must the walk skip a second vnode of a server that is already on the list?',
    tryThis: 'Change N and watch the preference list grow. Look at the walk for a key whose path passes s1’s two tokens (55° and 95°) to see the skip.',
    change: {
      before: 'Each key on the first server clockwise.',
      after: 'Each key on N distinct servers: its preference list.',
      reason: 'Replication gives availability and durability; skipping duplicate vnodes guarantees N copies on N machines, not two copies on one.',
    },
    takeaway: 'The preference list depends only on the key’s position and N, never on which servers happen to be up. That fixed list is what makes quorums (next stage) meaningful.',
    quiz: [
      {
        question: 'N = 3, key at 40°. Tokens clockwise: 55° s1, 95° s1, 130° s2, 170° s3. Which servers hold the replicas?',
        options: [
          { text: 's1, s2, s3', correct: true, why: 'Take s1 at 55°, skip 95° because s1 is already chosen, then take s2 and s3.' },
          { text: 's1, s1, s2', why: 'Two copies on one machine: a single crash would lose both. Only distinct servers count.' },
          { text: 's0, s1, s2 (the three lowest ring positions)', why: 'Placement starts at the key’s position, not at 0°. Taking the first N servers from 0° is a common bug.' },
        ],
      },
      {
        question: 'How many replicas do you need so that any 2 simultaneous server crashes cannot make a key unavailable?',
        options: [
          { text: '3', correct: true, why: 'N copies survive N − 1 failures, so N = 3 survives 2.' },
          { text: '2', why: 'Two crashes could take out both copies.' },
          { text: '5, one per server', why: 'It works but wastes storage; N = 3 is enough for two failures.' },
        ],
      },
    ],
  },
  {
    short: 'Consistency',
    title: 'Stage 5: Consistency with quorum consensus',
    tab: 'cluster',
    goal: (
      <>
        How <Term term="W">Write quorum: the number of replica acknowledgments the coordinator waits for before a write counts as successful.</Term> and{' '}
        <Term term="R">Read quorum: the number of replica responses the coordinator waits for before answering a read.</Term> decide whether a write succeeds and whether a read is
        fresh, and what a crash does to both.
      </>
    ),
    why: (
      <>
        The <Term term="coordinator">The node that acts as a proxy between the client and the replicas for one request.</Term> sends each request to the key’s N replicas and waits
        for W acks (writes) or R replies (reads). Crashed replicas cannot answer.
      </>
    ),
    problem: 'Replicas copy data asynchronously, so some lag behind. When replicas crash, fewer of them can acknowledge a write.',
    solution: (
      <>
        Quorum consensus: a write succeeds only after W acks; a read waits for R replies. With W + R &gt; N and a{' '}
        <Term term="strict quorum">Only the key’s own preference-list replicas count toward W and R. Down replicas are not replaced by stand-ins.</Term>, the read set and write set
        always share at least one up-to-date replica. Stale replicas found during a read are fixed by{' '}
        <Term term="read repair">When a read sees replicas with older versions, the coordinator writes the newest version back to them.</Term>.
      </>
    ),
    question: 'N = 3, W = 2: two of a key’s three replicas crash. Should a write to that key succeed?',
    tryThis:
      'Keep N = 3, W = 2 in CP mode. Crash two replicas of a key and PUT it: 1 ack is below W, so the write fails. Then set W = 1, R = 1, pause background activity, PUT and immediately GET: the read can miss the new value.',
    change: {
      before: 'Every write waited for 1 ack and every read asked 1 replica.',
      after: 'Tunable N, W and R; writes fail below W acks; reads repair stale replicas.',
      reason: 'Tuning W and R trades latency against consistency, and a strict quorum turns failures into visible errors instead of silent stale data.',
    },
    takeaway:
      'W and R count replies the coordinator waits for, not how many copies exist. W + R > N guarantees you read the latest successful write only under a strict quorum, where down replicas are not replaced by stand-ins.',
    quiz: [
      {
        question: 'N = 3, W = 2, strict quorum. Two of the key’s three replicas are down. What happens to a PUT?',
        options: [
          { text: 'It fails: only 1 ack is possible and W = 2', correct: true, why: 'The preference list is fixed; with two replicas down, only one can acknowledge, which is below W.' },
          { text: 'It succeeds because one replica stored it', why: 'One ack is below W. Under a strict quorum the coordinator reports failure.' },
          { text: 'It succeeds after two other healthy servers take the write', why: 'That is sloppy quorum (stage 8). A strict quorum only counts the preference list.' },
        ],
      },
      {
        question: 'N = 3, W = 1, R = 1. A write returns, then a read follows immediately. Why can the read return the old value?',
        options: [
          { text: 'The read may hit a replica the write has not reached yet: 1 + 1 ≤ 3, so the sets need not overlap', correct: true, why: 'With W + R ≤ N the replica that acked the write and the replica you read can be different ones.' },
          { text: 'Because W = 1 means the data is stored on only one server', why: 'W = 1 does not mean one copy. The data still goes to all N replicas; the coordinator just stops waiting after one ack.' },
          { text: 'It can’t: quorums always return the latest value', why: 'Only W + R > N (with a strict quorum) guarantees that.' },
        ],
      },
      {
        question: 'Which setting is optimized for fast reads?',
        options: [
          { text: 'R = 1, W = N', correct: true, why: 'A read waits for just one reply, and W = N makes every replica current, so the fast read is still consistent.' },
          { text: 'W = 1, R = N', why: 'That is optimized for fast writes; reads have to wait for every replica.' },
          { text: 'W = 1, R = 1', why: 'Both are fast, but W + R ≤ N, so stale reads are possible.' },
        ],
      },
    ],
  },
  {
    short: 'Versioning',
    title: 'Stage 6: Inconsistency resolution with versioning',
    tab: 'versions',
    goal: (
      <>
        How a <Term term="vector clock">A list of [server, counter] pairs attached to each version, written D([S1,v1], [S2,v2], …). It records which writes a version has seen.</Term>{' '}
        tells a newer version from a conflicting one.
      </>
    ),
    why: 'With eventual consistency, two servers can accept writes to the same key at the same time. Wall-clock timestamps cannot order them reliably; vector clocks record causality.',
    problem: 'Two clients update the same key through different servers at the same time. Which version wins?',
    solution:
      'Treat every write as a new immutable version with a vector clock. If every counter in Y is ≥ the matching counter in X, Y descends from X and replaces it. Otherwise they are siblings: keep both and let the client reconcile.',
    question: 'Why can’t we just keep the version with the later wall-clock timestamp?',
    tryThis: 'The book’s example (D1 to D4) is loaded. Compare D3 and D4, then reconcile the siblings through Sx and check that the result matches D5([Sx,3], [Sy,1], [Sz,1]).',
    change: {
      before: 'The last write a replica saw simply overwrote the previous one.',
      after: 'Every version carries a vector clock; concurrent versions are kept as siblings.',
      reason: 'Clocks on different servers drift, so “latest timestamp wins” can silently drop a real update. Vector clocks detect the conflict instead.',
    },
    takeaway:
      'Vector clocks detect conflicts; they do not resolve them. The client merges siblings and writes back a version whose clock dominates both. The costs: client-side merge logic and clocks that grow (trimmed at a size threshold).',
    quiz: [
      {
        question: 'Is D([s0,1], [s1,1]) an ancestor of D([s0,1], [s1,2])?',
        options: [
          { text: 'Yes: every counter in the second is ≥ the first', correct: true, why: 's0 is equal and s1 went from 1 to 2, so the second descends from the first. No conflict.' },
          { text: 'No, they conflict', why: 'A conflict needs each side to have a counter bigger than the other’s. Here only one side is bigger.' },
          { text: 'You can’t tell without timestamps', why: 'The vector clocks alone answer it; that is their whole point.' },
        ],
      },
      {
        question: 'D([Sx,2], [Sy,1]) vs D([Sx,2], [Sz,1]). What is the relationship?',
        options: [
          { text: 'Siblings (conflict)', correct: true, why: 'The first has Sy:1 the second lacks, and the second has Sz:1 the first lacks. Neither descends from the other.' },
          { text: 'The second is newer because z comes after y', why: 'Server names carry no order; only counters matter.' },
          { text: 'The first is newer because it was written first', why: 'Vector clocks ignore wall-clock order; that is what makes them safe with drifting clocks.' },
        ],
      },
      {
        question: 'A client merges D([Sx,2], [Sy,1]) and D([Sx,2], [Sz,1]) and writes through Sx. What is the new clock?',
        options: [
          { text: 'D([Sx,3], [Sy,1], [Sz,1])', correct: true, why: 'Take the pointwise maximum of both clocks, then increment the handling server’s counter (Sx: 2 → 3).' },
          { text: 'D([Sx,3])', why: 'Dropping Sy and Sz would lose history, and future comparisons would treat real descendants as conflicts.' },
          { text: 'D([Sx,2], [Sy,1], [Sz,1])', why: 'That dominates both parents, but every write increments the handling server’s counter; skipping it makes different writes indistinguishable.' },
        ],
      },
    ],
  },
  {
    short: 'Failure detection',
    title: 'Stage 7: Failure detection with gossip',
    tab: 'gossip',
    goal: (
      <>
        How servers decide another server is down without a central monitor, using a{' '}
        <Term term="gossip protocol">Each node keeps a membership list of heartbeat counters and periodically shares it with a few random nodes, which pass it on.</Term>.
      </>
    ),
    why: 'Handling failures starts with detecting them. One server saying “s2 is down” is not enough; you need independent confirmation, cheaply.',
    problem: 'All-to-all heartbeats (every server pings every other server) cost n·(n − 1) messages per round, which is far too many for a large cluster.',
    solution:
      'Gossip: each node increments its own heartbeat counter and sends its membership list to a few random nodes. A member whose counter has not increased for a set period is marked offline.',
    question: 'Why require more than one source before marking a server down?',
    tryThis: 'Crash s2 and watch s0’s membership list: s2’s counter stops increasing, it becomes suspect, then offline. Try a partition too: s0 stops hearing s3 and s4.',
    change: {
      before: 'Failures were known instantly and magically.',
      after: 'Each node keeps heartbeat counters; a stalled counter marks a member suspect, then offline.',
      reason: 'A decentralized detector has no single point of failure and costs only a small, fixed fan-out per node per round.',
    },
    takeaway:
      'Gossip turns “is s2 down?” into “has s2’s heartbeat stopped increasing, as seen by several nodes?” In this simulator the coordinator still learns about failures instantly; gossip is how a real cluster gets that knowledge.',
    quiz: [
      {
        question: 'In gossip-based failure detection, when is a member considered offline?',
        options: [
          { text: 'When its heartbeat counter has not increased for longer than a set period', correct: true, why: 'A stalled counter, spread by gossip and confirmed by others, marks the member offline.' },
          { text: 'As soon as one node fails to reach it once', why: 'One source is not enough; a single missed message can be a transient network blip.' },
          { text: 'When a central monitoring server says so', why: 'Gossip is decentralized precisely to avoid a central monitor that could itself fail.' },
        ],
      },
      {
        question: 'Why is all-to-all multicasting a poor choice for 1,000 servers?',
        options: [
          { text: 'It needs about a million heartbeat messages per round', correct: true, why: 'n·(n − 1) = 1,000 × 999 ≈ 1 million messages, versus a few thousand with gossip.' },
          { text: 'It cannot detect crashes', why: 'It detects them fine; it is just very expensive.' },
          { text: 'It requires vector clocks', why: 'Vector clocks version data; failure detection uses heartbeats.' },
        ],
      },
    ],
  },
  {
    short: 'Temporary failures',
    title: 'Stage 8: Temporary failures, sloppy quorum and hinted handoff',
    tab: 'cluster',
    goal: (
      <>
        How <Term term="sloppy quorum">Instead of only the preference list, use the first W (or R) healthy servers walking clockwise. Down servers are skipped.</Term> and{' '}
        <Term term="hinted handoff">A stand-in server keeps writes meant for a down replica, tagged with a hint, and hands them back when that replica recovers.</Term> keep writes
        available when a replica is briefly down.
      </>
    ),
    why: 'Under a strict quorum a crashed replica can make writes fail (stage 5). Sloppy quorum trades some consistency for availability.',
    problem: 'A replica in the preference list is down for a few minutes. With a strict quorum, writes to its keys are rejected.',
    solution: 'Sloppy quorum: the next healthy server clockwise stands in and stores the write with a hint. When the owner recovers, the stand-in hands the data back.',
    question: 'While stand-ins accept writes, does W + R > N still guarantee reading the latest value?',
    tryThis: 'Switch to AP, enable sloppy quorum, crash one of a key’s replicas and PUT: a stand-in stores a hint and the write reaches W. Recover the replica and watch the hand-off in the log.',
    change: {
      before: 'Down replica → fewer acks → strict-quorum write fails.',
      after: 'Down replica → next healthy server stores a hint → write reaches W → hint handed back on recovery.',
      reason: 'Short failures are common. Failing every write during a brief outage costs more availability than a short window of weaker consistency.',
    },
    takeaway:
      'Hinted handoff handles temporary failures. The price: reads and writes may land on different stand-ins, so W + R > N stops guaranteeing fresh reads while sloppy quorum is in use.',
    quiz: [
      {
        question: 'Sloppy quorum on, N = 3, W = 2. Two of the key’s three replicas are down. What happens to a PUT?',
        options: [
          { text: 'The next healthy servers on the ring take the write with hints, it reaches W and succeeds', correct: true, why: 'Sloppy quorum still needs W acks, but lets healthy servers outside the preference list provide them.' },
          { text: 'It fails', why: 'That is the strict-quorum behaviour this stage relaxes.' },
          { text: 'It succeeds with just the one healthy replica’s ack', why: 'Sloppy quorum still requires W acks; it only changes who may provide them.' },
        ],
      },
      {
        question: 'The crashed replica comes back. What does hinted handoff do?',
        options: [
          { text: 'The stand-in sends it the hinted writes and deletes the hint', correct: true, why: 'That restores the preference list’s copies without a full resync.' },
          { text: 'The recovered node copies the whole data set from scratch', why: 'That is the heavy approach for permanent failures; anti-entropy with Merkle trees makes even that incremental.' },
          { text: 'Nothing; the stand-in keeps the data forever', why: 'Then reads to the real preference list would keep missing the data.' },
        ],
      },
    ],
  },
  {
    short: 'Permanent failures',
    title: 'Stage 9: Permanent failures and anti-entropy with Merkle trees',
    tab: 'merkle',
    goal: (
      <>
        How a <Term term="Merkle tree">A tree in which each non-leaf node is the hash of its children. Equal roots mean equal data; differing roots point you to the differing branch.</Term>{' '}
        finds the few out-of-sync keys between two replicas without comparing everything.
      </>
    ),
    why: (
      <>
        Hints cover short outages. If a replica loses its disk or misses writes for a long time, replicas must be compared and repaired:{' '}
        <Term term="anti-entropy">A background process that compares replicas and updates each to the newest version.</Term>.
      </>
    ),
    problem: 'A replica’s disk is replaced. Comparing every key with another replica would transfer the whole data set.',
    solution: 'Each replica hashes its key-range buckets into a Merkle tree. Compare roots; if they differ, descend only into children that differ, and sync just those buckets.',
    question: 'If two replicas’ root hashes match, what do you know about every bucket beneath?',
    tryThis: 'Wipe one server’s disk, or crash it, PUT a few keys and recover it. Then compare its tree with a neighbour and sync only the differing buckets.',
    change: {
      before: 'Short outages covered by hints; long divergence stayed unrepaired.',
      after: 'Replicas compare Merkle trees and sync only differing buckets.',
      reason: 'The data moved is proportional to the differences, not to the data size (for example 1 million buckets for 1 billion keys, about 1,000 keys per bucket).',
    },
    takeaway:
      'Merkle trees make anti-entropy cheap: matching hashes let you skip whole subtrees, so repairing a replica costs work proportional to what actually differs.',
    quiz: [
      {
        question: 'Roots differ; the left children match and the right children differ. What next?',
        options: [
          { text: 'Descend only into the right subtree', correct: true, why: 'A matching left hash proves every bucket under it is identical, so only the right side needs work.' },
          { text: 'Transfer all keys', why: 'That throws away the whole benefit of the tree.' },
          { text: 'Stop: the data is consistent', why: 'Differing roots prove something differs somewhere below.' },
        ],
      },
      {
        question: 'Why do the leaves cover buckets of keys instead of one leaf per key?',
        options: [
          { text: 'It keeps the tree shallow; a differing bucket costs about one bucket’s worth of keys to sync', correct: true, why: 'Buckets bound the tree depth; the book’s example has about 1,000 keys per bucket.' },
          { text: 'Individual keys cannot be hashed', why: 'They can; each key in a bucket is hashed to build the bucket’s hash.' },
          { text: 'Buckets make root hashes always match', why: 'Roots match only when the data matches, whatever the bucket size.' },
        ],
      },
    ],
  },
  {
    short: 'Write & read path',
    title: 'Stage 10: Write path and read path',
    tab: 'storage',
    goal: 'What happens inside one node when it stores or looks up a key (Cassandra-style).',
    why: 'Everything so far happens between nodes. Inside a node, writes must be durable yet fast, and reads must avoid scanning every file on disk.',
    problem: 'Writing straight into sorted files on disk is slow; keeping everything in memory is lost on a crash; a read might need to check many files.',
    solution: (
      <>
        Write: <Term term="commit log">An append-only file on disk. Every write is appended here first so it survives a crash.</Term> → memory cache (
        <Term term="memtable">An in-memory sorted table of recent writes. Flushed to disk when it fills up.</Term>) → flush to an{' '}
        <Term term="SSTable">Sorted-string table: an immutable, sorted list of key-value pairs on disk.</Term> when full. Read: memtable first; otherwise a{' '}
        <Term term="bloom filter">A compact bit array that answers “definitely not here” or “maybe here” for a key, so a read can skip SSTables.</Term> per SSTable says which files
        might hold the key.
      </>
    ),
    question: 'Why write to the commit log before the memory cache?',
    tryThis: 'PUT keys until the memtable flushes. GET a key from an old SSTable and watch the bloom filters skip files. Crash the node with keys still in the memtable and see the commit log replay.',
    change: {
      before: 'Each node was a black box that “stored” versions.',
      after: 'Commit log + memtable + SSTables on writes; memtable + bloom filters + SSTables on reads.',
      reason: 'Sequential log appends are fast and durable; bloom filters let reads skip SSTables that definitely do not hold the key.',
    },
    takeaway:
      'The commit log makes writes durable, the memtable makes them fast, SSTables make them compact on disk, and bloom filters let reads skip files. Across nodes, replicating to several data centers covers a whole data center going dark.',
    quiz: [
      {
        question: 'A node crashes with 3 unflushed keys in its memtable. How are they recovered?',
        options: [
          { text: 'By replaying the commit log on restart', correct: true, why: 'Every write hit the commit log before the memtable, so the log can rebuild it.' },
          { text: 'From the SSTables', why: 'Those keys were never flushed, so no SSTable has them.' },
          { text: 'They are lost', why: 'That is exactly what the commit log prevents.' },
        ],
      },
      {
        question: 'A bloom filter says “maybe” for SST-1. What does that mean?',
        options: [
          { text: 'The key might be there; read the SSTable to find out (it could be a false positive)', correct: true, why: 'Bloom filters can give false positives but never false negatives.' },
          { text: 'The key is definitely there', why: 'Other keys may have set the same bits, so “maybe” is not a guarantee.' },
          { text: 'The key is definitely not there', why: 'That is what a “no” answer means (at least one bit is 0).' },
        ],
      },
    ],
  },
];

/* =====================================================================================
 * Small UI helpers
 * ===================================================================================== */

const panel = 'rounded-3xl border border-slate-200 bg-white dark:border-white/10 dark:bg-[#161616]';
const sub = 'rounded-2xl border border-slate-200 bg-slate-50 dark:border-white/10 dark:bg-white/[0.03]';
const muted = 'text-slate-600 dark:text-slate-400';
const heading = 'text-slate-900 dark:text-white';
const btn = 'px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed';
const btnGhost = `${btn} border border-slate-300 text-slate-700 hover:bg-slate-100 dark:border-white/15 dark:text-slate-200 dark:hover:bg-white/[0.06]`;
const inputCls =
  'w-full px-2.5 py-2 rounded-xl border text-sm font-mono border-slate-300 bg-white text-slate-900 dark:border-white/15 dark:bg-[#0f0f0f] dark:text-white';

const toneCls = {
  ok: 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-400/30 dark:bg-emerald-400/[0.08] dark:text-emerald-100',
  warn: 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-400/30 dark:bg-amber-400/[0.08] dark:text-amber-100',
  error: 'border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-400/30 dark:bg-rose-400/[0.08] dark:text-rose-100',
  info: 'border-slate-200 bg-slate-50 text-slate-800 dark:border-white/10 dark:bg-white/[0.03] dark:text-slate-200',
};
type Tone = keyof typeof toneCls;

const TryThis: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className={`rounded-xl border p-3 text-sm ${toneCls.info}`}>
    <strong>Try this: </strong>
    {children}
  </div>
);

const Slider: React.FC<{
  label: string;
  value: number;
  min?: number;
  max: number;
  disabled?: boolean;
  lockNote?: string;
  accent: string;
  onChange: (v: number) => void;
}> = ({ label, value, min = 1, max, disabled, lockNote, accent, onChange }) => (
  <div className="space-y-1">
    <div className="flex justify-between text-xs">
      <span className="font-medium text-slate-700 dark:text-slate-200">{label}</span>
      <span className="font-mono font-semibold text-slate-900 dark:text-white">
        {value}
        {disabled && lockNote && <span className={`ml-2 font-sans font-normal ${muted}`}>({lockNote})</span>}
      </span>
    </div>
    <input
      type="range"
      min={min}
      max={max}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(Number(e.target.value))}
      className={`w-full ${accent} disabled:opacity-40`}
    />
  </div>
);

const QuorumSliders: React.FC<{
  stage: number;
  n: number;
  w: number;
  r: number;
  setN: (v: number) => void;
  setW: (v: number) => void;
  setR: (v: number) => void;
}> = ({ stage, n, w, r, setN, setW, setR }) => {
  const nLocked = stage < 4;
  const wrLocked = stage < 5;
  return (
    <div className="space-y-3">
      <Slider
        label="N: replicas per key"
        value={nLocked ? 1 : n}
        max={5}
        disabled={nLocked}
        lockNote="fixed at 1 until stage 4"
        accent="accent-indigo-500"
        onChange={(v) => {
          setN(v);
          if (w > v) setW(v);
          if (r > v) setR(v);
        }}
      />
      <Slider label="W: acks a write waits for" value={wrLocked ? 1 : Math.min(w, n)} max={wrLocked ? 1 : n} disabled={wrLocked} lockNote="fixed at 1 until stage 5" accent="accent-amber-500" onChange={setW} />
      <Slider label="R: replies a read waits for" value={wrLocked ? 1 : Math.min(r, n)} max={wrLocked ? 1 : n} disabled={wrLocked} lockNote="fixed at 1 until stage 5" accent="accent-emerald-500" onChange={setR} />
    </div>
  );
};

/* =====================================================================================
 * Hash ring (draws the preference list and the path of the last request)
 * ===================================================================================== */

const CX = 190;
const CY = 190;
const R_NODE = 140;
const R_KEY = 92;
const polar = (angle: number, r: number) => ({ x: CX + r * Math.sin((angle * Math.PI) / 180), y: CY - r * Math.cos((angle * Math.PI) / 180) });

const OUTCOME_STYLE: Record<Outcome, { stroke: string; dash?: string; label: (t: TargetOutcome) => string }> = {
  ack: { stroke: 'stroke-emerald-500', label: () => 'ack' },
  async: { stroke: 'stroke-sky-500', dash: '5 4', label: () => 'async copy' },
  hint: { stroke: 'stroke-amber-500', dash: '5 4', label: (t) => `hint for ${t.forNode}` },
  down: { stroke: 'stroke-rose-500', dash: '2 4', label: () => 'down: no ack' },
  partitioned: { stroke: 'stroke-rose-500', dash: '2 4', label: () => 'cut off: no ack' },
  refused: { stroke: 'stroke-slate-400', dash: '2 4', label: () => 'not written' },
  fresh: { stroke: 'stroke-emerald-500', label: () => 'latest' },
  stale: { stroke: 'stroke-amber-500', label: () => 'stale' },
  repaired: { stroke: 'stroke-amber-500', label: () => 'stale → repaired' },
  skipped: { stroke: 'stroke-slate-400', dash: '2 4', label: () => 'not waited for' },
};

const RingView: React.FC<{
  sim: SimState;
  keys: string[];
  selectedKey: string;
  n: number;
  onSelectKey: (k: string) => void;
}> = ({ sim, keys, selectedKey, n, onSelectKey }) => {
  const selAngle = keyAngle(selectedKey || ' ');
  const walk = ringWalk(selAngle).order;
  const prefTokens = walk.slice(0, n);
  const tokenFor = (id: string) => walk.find((o) => o.nodeId === id)!.angle;
  const op = sim.lastOp && sim.lastOp.key === selectedKey ? sim.lastOp : null;
  const keyPt = polar(selAngle, R_KEY);

  return (
    <svg
      viewBox="0 0 380 380"
      className="w-full max-w-[440px] mx-auto text-slate-700 dark:text-slate-200"
      role="img"
      aria-label={`Hash ring with five servers, two tokens each. Key ${selectedKey} at ${selAngle} degrees; its preference list is ${prefTokens.map((p) => p.nodeId).join(', ')}.${
        op ? ` Last ${op.type}: ${op.got} of ${op.needed} replies.` : ''
      }`}
    >
      <circle cx={CX} cy={CY} r={R_NODE} fill="none" stroke="currentColor" strokeOpacity={0.25} strokeWidth={2} strokeDasharray="4 5" />
      <text x={CX} y={CY - 6} textAnchor="middle" fontSize={12} fill="currentColor" opacity={0.7}>
        hash ring 0°–360°
      </text>
      <text x={CX} y={CY + 12} textAnchor="middle" fontSize={11} fill="currentColor" opacity={0.6}>
        walk clockwise →
      </text>

      {/* Request path of the last operation on the selected key */}
      {op &&
        op.targets.map((t, i) => {
          const style = OUTCOME_STYLE[t.outcome];
          const p = polar(tokenFor(t.nodeId), R_NODE - 16);
          const mx = keyPt.x + (p.x - keyPt.x) * 0.62;
          const my = keyPt.y + (p.y - keyPt.y) * 0.62;
          return (
            <g key={`${t.nodeId}-${i}`}>
              <line x1={keyPt.x} y1={keyPt.y} x2={p.x} y2={p.y} className={style.stroke} strokeWidth={2.5} strokeDasharray={style.dash} />
              <text
                x={mx}
                y={my}
                textAnchor="middle"
                fontSize={11}
                fontWeight={600}
                className="fill-slate-800 dark:fill-slate-100 stroke-white dark:stroke-[#161616]"
                strokeWidth={4}
                style={{ paintOrder: 'stroke' }}
              >
                {style.label(t)}
              </text>
            </g>
          );
        })}

      {/* Server tokens */}
      {TOKENS.map((t) => {
        const p = polar(t.angle, R_NODE);
        const lp = polar(t.angle, R_NODE + 30);
        const rank = prefTokens.findIndex((pt) => pt.nodeId === t.nodeId && pt.angle === t.angle);
        const crashed = sim.status[t.nodeId] === 'crashed';
        const cut = !crashed && sim.partitioned && nodeById(t.nodeId).dc === 'EU-West';
        const fill = crashed ? 'fill-rose-100 dark:fill-rose-950' : 'fill-white dark:fill-[#1f1f1f]';
        const stroke = rank >= 0 ? 'stroke-amber-500' : crashed ? 'stroke-rose-500' : 'stroke-slate-400 dark:stroke-slate-500';
        const rp = polar(t.angle, R_NODE - 30);
        return (
          <g key={`${t.nodeId}-${t.angle}`}>
            <circle cx={p.x} cy={p.y} r={16} className={`${fill} ${stroke}`} strokeWidth={rank >= 0 ? 3 : 1.5} strokeDasharray={cut ? '3 3' : undefined} />
            <text x={p.x} y={p.y + 4} textAnchor="middle" fontSize={12} fontWeight={700} className={crashed ? 'fill-rose-600 dark:fill-rose-300' : 'fill-slate-800 dark:fill-slate-100'}>
              {t.nodeId}
            </text>
            <text x={lp.x} y={lp.y + 4} textAnchor="middle" fontSize={11} fill="currentColor" opacity={0.65}>
              {crashed ? 'down' : cut ? 'cut off' : `${t.angle}°`}
            </text>
            {rank >= 0 && (
              <text x={rp.x} y={rp.y + 4} textAnchor="middle" fontSize={11} fontWeight={700} className="fill-amber-600 dark:fill-amber-400">
                #{rank + 1}
              </text>
            )}
          </g>
        );
      })}

      {/* Keys */}
      {keys.map((k) => {
        const p = polar(keyAngle(k), R_KEY);
        const sel = k === selectedKey;
        return (
          <g key={k} onClick={() => onSelectKey(k)} className="cursor-pointer">
            <title>{`${k} at ${keyAngle(k)}°`}</title>
            <rect x={p.x - 6} y={p.y - 6} width={12} height={12} rx={3} className={sel ? 'fill-indigo-600 stroke-indigo-300' : 'fill-indigo-400/70 stroke-transparent'} strokeWidth={2} />
          </g>
        );
      })}
      {!keys.includes(selectedKey) && selectedKey && (
        <rect x={keyPt.x - 6} y={keyPt.y - 6} width={12} height={12} rx={3} className="fill-none stroke-indigo-500" strokeWidth={2} strokeDasharray="3 2" />
      )}
      {selectedKey && (
        <text
          x={polar(selAngle, R_KEY - 22).x}
          y={polar(selAngle, R_KEY - 22).y + 4}
          textAnchor="middle"
          fontSize={12}
          fontWeight={700}
          className="fill-indigo-700 dark:fill-indigo-300 stroke-white dark:stroke-[#161616]"
          strokeWidth={4}
          style={{ paintOrder: 'stroke' }}
        >
          {selectedKey} @ {selAngle}°
        </text>
      )}
    </svg>
  );
};

/* =====================================================================================
 * Stage 1: single server
 * ===================================================================================== */

const SINGLE_CAPACITY = 6;

const SingleServerLab: React.FC = () => {
  const [store, setStore] = useState<Record<string, string>>({ 'user:101': 'Alice', 'cart:88': '3 items', 'session:992': 'token-xyz', 'profile:7': 'Bob' });
  const [up, setUp] = useState(true);
  const [k, setK] = useState('order:5150');
  const [v, setV] = useState('shipped');
  const [msg, setMsg] = useState<{ tone: Tone; text: string } | null>(null);
  const used = Object.keys(store).length;
  const pct = Math.round((used / SINGLE_CAPACITY) * 100);

  const put = () => {
    if (!up) return setMsg({ tone: 'error', text: 'Server is down: the write fails. There is no other copy and no other server.' });
    if (!(k in store) && used >= SINGLE_CAPACITY)
      return setMsg({ tone: 'error', text: `Out of memory (${used}/${SINGLE_CAPACITY} slots). The write is rejected: one machine has hit its ceiling.` });
    setStore({ ...store, [k]: v });
    setMsg({ tone: 'ok', text: `hashTable["${k}"] = "${v}". Memory now ${Math.round(((used + (k in store ? 0 : 1)) / SINGLE_CAPACITY) * 100)}%.` });
    setK(`key:${Math.floor(Math.random() * 900 + 100)}`);
  };
  const get = () => {
    if (!up) return setMsg({ tone: 'error', text: 'Server is down: the read fails. Every client is affected at once.' });
    setMsg(k in store ? { tone: 'ok', text: `hashTable["${k}"] → "${store[k]}" (one memory lookup: fast).` } : { tone: 'warn', text: `"${k}" not found.` });
  };

  return (
    <div className={`${panel} p-5 space-y-4`}>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div className={`${sub} p-4 space-y-3`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Database className={`w-5 h-5 ${up ? 'text-amber-500' : 'text-rose-500'}`} />
              <span className={`font-semibold ${heading}`}>One server, in-memory hash table</span>
            </div>
            <span className={`text-xs font-mono px-2 py-0.5 rounded-full ${up ? toneCls.ok : toneCls.error} border`}>{up ? 'up' : 'down'}</span>
          </div>
          <div>
            <div className="flex justify-between text-xs mb-1">
              <span className={muted}>Memory used</span>
              <span className="font-mono">
                {used}/{SINGLE_CAPACITY} slots ({pct}%)
              </span>
            </div>
            <div className="w-full h-3 rounded-full bg-slate-200 dark:bg-white/10 overflow-hidden">
              <div className={`h-full transition-all ${pct >= 100 ? 'bg-rose-500' : pct >= 80 ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${Math.min(100, pct)}%` }} />
            </div>
          </div>
          <ul className="text-sm font-mono space-y-1">
            {Object.entries(store).map(([kk, vv]) => (
              <li key={kk} className="flex justify-between gap-2">
                <span>{kk}</span>
                <span className={muted}>{vv}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="space-y-3">
          <label className={`text-xs ${muted}`}>Key</label>
          <input className={inputCls} value={k} onChange={(e) => setK(e.target.value)} />
          <label className={`text-xs ${muted}`}>Value</label>
          <input className={inputCls} value={v} onChange={(e) => setV(e.target.value)} />
          <div className="flex flex-wrap gap-2">
            <button className={`${btn} bg-amber-500 text-slate-950 hover:bg-amber-400`} onClick={put}>
              put(key, value)
            </button>
            <button className={`${btn} bg-indigo-600 text-white hover:bg-indigo-500`} onClick={get}>
              get(key)
            </button>
            <button className={`${btn} ${up ? 'bg-rose-600 hover:bg-rose-500' : 'bg-emerald-600 hover:bg-emerald-500'} text-white`} onClick={() => setUp(!up)}>
              {up ? 'Crash the server' : 'Restart the server'}
            </button>
          </div>
          {msg && <div className={`rounded-xl border p-3 text-sm ${toneCls[msg.tone]}`}>{msg.text}</div>}
          <p className={`text-sm ${muted}`}>
            Mitigations such as compressing values or keeping only hot data in memory stretch this server a little, but capacity and availability are still those of one machine.
          </p>
        </div>
      </div>
    </div>
  );
};

/* =====================================================================================
 * Stage 2: CAP lab (three replicas, n3 can be cut off)
 * ===================================================================================== */

type CapNode = 'n1' | 'n2' | 'n3';
interface CapRep {
  value: string;
  ver: number;
}

const CapLab: React.FC<{ partitioned: boolean; onTogglePartition: () => void; cap: 'CP' | 'AP'; setCap: (c: 'CP' | 'AP') => void }> = ({
  partitioned,
  onTogglePartition,
  cap,
  setCap,
}) => {
  const initial: CapRep = { value: 'cart=[book]', ver: 1 };
  const [reps, setReps] = useState<Record<CapNode, CapRep>>({ n1: initial, n2: initial, n3: initial });
  const [dirty, setDirty] = useState({ main: false, iso: false });
  const [conflict, setConflict] = useState<{ main: CapRep; iso: CapRep } | null>(null);
  const [msg, setMsg] = useState<{ tone: Tone; text: string } | null>(null);
  const [counter, setCounter] = useState(1);
  const items = ['pen', 'lamp', 'mug', 'desk', 'chair', 'bag'];
  const maxVer = Math.max(reps.n1.ver, reps.n2.ver, reps.n3.ver);

  const write = (target: CapNode) => {
    const value = `cart=[book, ${items[counter % items.length]}]`;
    setCounter((c) => c + 1);
    const nv: CapRep = { value, ver: maxVer + 1 };
    if (!partitioned) {
      setReps({ n1: nv, n2: nv, n3: nv });
      setMsg({ tone: 'ok', text: `Write via ${target} replicated to n1, n2 and n3 (v${nv.ver}). No partition: consistent and available.` });
    } else if (cap === 'CP') {
      setMsg({ tone: 'error', text: `CP: n3 cannot be reached, so the write via ${target} is blocked to keep all replicas identical. The client gets an error: the system is unavailable for writes.` });
    } else {
      const side: CapNode[] = target === 'n3' ? ['n3'] : ['n1', 'n2'];
      setReps((prev) => ({ ...prev, ...Object.fromEntries(side.map((s) => [s, nv])) }));
      setDirty((d) => (target === 'n3' ? { ...d, iso: true } : { ...d, main: true }));
      setMsg({
        tone: 'warn',
        text: `AP: accepted on ${side.join(' and ')} (v${nv.ver}). ${target === 'n3' ? 'n1 and n2 are' : 'n3 is'} now stale until the partition heals.`,
      });
    }
  };

  const read = (target: CapNode) => {
    if (partitioned && cap === 'CP' && target === 'n3')
      return setMsg({ tone: 'error', text: 'CP: n3 is cut off and cannot confirm it has the latest value, so it returns an error instead of possibly stale data.' });
    const r = reps[target];
    setMsg(
      r.ver < maxVer
        ? { tone: 'warn', text: `Read from ${target}: ${r.value} (v${r.ver}). STALE: the newest version is v${maxVer} on the other side of the partition.` }
        : { tone: 'ok', text: `Read from ${target}: ${r.value} (v${r.ver}). This is the latest version.` }
    );
  };

  const toggle = () => {
    if (partitioned) {
      // healing
      if (dirty.main && dirty.iso) {
        setConflict({ main: reps.n1, iso: reps.n3 });
        setMsg({ tone: 'warn', text: 'Partition healed, but both sides accepted different writes. The replicas conflict and something has to reconcile them.' });
      } else if (dirty.main || dirty.iso) {
        const newest = dirty.main ? reps.n1 : reps.n3;
        setReps({ n1: newest, n2: newest, n3: newest });
        setMsg({ tone: 'ok', text: `Partition healed: the newer data (v${newest.ver}) was synced to the stale side. All replicas agree again.` });
      } else setMsg({ tone: 'ok', text: 'Partition healed. No writes happened during it, so nothing to sync.' });
      setDirty({ main: false, iso: false });
    } else {
      setMsg({ tone: 'warn', text: 'Network partition: n3 can no longer talk to n1 and n2. Now choose: consistency or availability?' });
    }
    onTogglePartition();
  };

  const resolve = (pick: CapRep) => {
    setReps({ n1: pick, n2: pick, n3: pick });
    setConflict(null);
    setMsg({ tone: 'info', text: `Kept ${pick.value}. The other write is lost. Stage 6 shows how vector clocks detect this conflict so the client can merge both instead.` });
  };

  const nodePos: Record<CapNode, { x: number; y: number }> = { n1: { x: 90, y: 60 }, n2: { x: 90, y: 180 }, n3: { x: 330, y: 120 } };
  const repTone = (id: CapNode) => (reps[id].ver < maxVer ? 'stroke-amber-500' : 'stroke-emerald-500');

  return (
    <div className={`${panel} p-5 space-y-4`}>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <svg
          viewBox="0 0 420 240"
          className="w-full text-slate-700 dark:text-slate-200"
          role="img"
          aria-label={`Three replicas n1, n2, n3. ${partitioned ? 'The link to n3 is cut by a partition.' : 'All links are up.'} Mode ${cap}.`}
        >
          <line x1={90} y1={60} x2={90} y2={180} stroke="currentColor" strokeOpacity={0.4} strokeWidth={2} />
          {(['n1', 'n2'] as CapNode[]).map((id) => (
            <line
              key={id}
              x1={nodePos[id].x}
              y1={nodePos[id].y}
              x2={330}
              y2={120}
              className={partitioned ? 'stroke-rose-500' : 'stroke-slate-400'}
              strokeWidth={2}
              strokeDasharray={partitioned ? '4 6' : undefined}
            />
          ))}
          <text x={210} y={partitioned ? 112 : 84} textAnchor="middle" fontSize={11} fill="currentColor" opacity={0.8}>
            {partitioned ? '✂ partition: no replication' : 'replicates'}
          </text>
          {(Object.keys(nodePos) as CapNode[]).map((id) => (
            <g key={id}>
              <rect x={nodePos[id].x - 70} y={nodePos[id].y - 26} width={140} height={52} rx={10} className={`fill-white dark:fill-[#1f1f1f] ${repTone(id)}`} strokeWidth={2} />
              <text x={nodePos[id].x} y={nodePos[id].y - 7} textAnchor="middle" fontSize={12} fontWeight={700} fill="currentColor">
                {id} · v{reps[id].ver}
                {reps[id].ver < maxVer ? ' (stale)' : ''}
              </text>
              <text x={nodePos[id].x} y={nodePos[id].y + 12} textAnchor="middle" fontSize={11} fill="currentColor" opacity={0.8}>
                {reps[id].value}
              </text>
            </g>
          ))}
        </svg>
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2 items-center">
            <button className={`${btn} ${partitioned ? 'bg-emerald-600 hover:bg-emerald-500' : 'bg-rose-600 hover:bg-rose-500'} text-white flex items-center gap-1.5`} onClick={toggle}>
              <Scissors className="w-3.5 h-3.5" />
              {partitioned ? 'Heal the partition' : 'Cut the link to n3'}
            </button>
            <div className="inline-flex rounded-xl border border-slate-300 dark:border-white/15 overflow-hidden text-xs">
              {(['CP', 'AP'] as const).map((m) => (
                <button key={m} onClick={() => setCap(m)} className={`px-3 py-1.5 font-semibold ${cap === m ? 'bg-indigo-600 text-white' : 'text-slate-700 dark:text-slate-200'}`}>
                  {m === 'CP' ? 'CP: consistency' : 'AP: availability'}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {(['n1', 'n2', 'n3'] as CapNode[]).map((id) => (
              <div key={id} className="space-y-1">
                <button className={`${btn} w-full bg-amber-500 text-slate-950 hover:bg-amber-400`} onClick={() => write(id)}>
                  Write via {id}
                </button>
                <button className={`${btn} w-full bg-indigo-600 text-white hover:bg-indigo-500`} onClick={() => read(id)}>
                  Read {id}
                </button>
              </div>
            ))}
          </div>
          {msg && <div className={`rounded-xl border p-3 text-sm ${toneCls[msg.tone]}`}>{msg.text}</div>}
          {conflict && (
            <div className={`rounded-xl border p-3 text-sm space-y-2 ${toneCls.warn}`}>
              <p>
                n1/n2 have <span className="font-mono">{conflict.main.value}</span>, n3 has <span className="font-mono">{conflict.iso.value}</span>. Without versioning, you can only keep one:
              </p>
              <div className="flex gap-2">
                <button className={btnGhost} onClick={() => resolve(conflict.main)}>
                  Keep n1/n2’s
                </button>
                <button className={btnGhost} onClick={() => resolve(conflict.iso)}>
                  Keep n3’s
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
      <p className={`text-sm ${muted}`}>
        <Term term="Consistency">All clients see the same data at the same time, whichever node they connect to.</Term> ·{' '}
        <Term term="Availability">Every request gets a response, even if some nodes are down.</Term> ·{' '}
        <Term term="Partition tolerance">The system keeps operating even when the network between nodes breaks.</Term>
      </p>
    </div>
  );
};

/* =====================================================================================
 * Stage 6: vector clock lab (book notation, real increment/compare)
 * ===================================================================================== */

interface VCVersion {
  id: string;
  value: string;
  clock: Clock;
  server: string;
  from: string[];
}
const VC_SERVERS = ['Sx', 'Sy', 'Sz'];

function vcWrite(history: VCVersion[], parents: string[], server: string, value: string): VCVersion[] {
  const base = mergeClocks(history.filter((h) => parents.includes(h.id)).map((h) => h.clock));
  const clock = { ...base, [server]: (base[server] ?? 0) + 1 };
  return [...history, { id: `D${history.length + 1}`, value, clock, server, from: parents }];
}

const BOOK_EXAMPLE: VCVersion[] = [
  (h: VCVersion[]) => vcWrite(h, [], 'Sx', 'name=john'),
  (h: VCVersion[]) => vcWrite(h, ['D1'], 'Sx', 'name=johnDoe'),
  (h: VCVersion[]) => vcWrite(h, ['D2'], 'Sy', 'name=johnSanFrancisco'),
  (h: VCVersion[]) => vcWrite(h, ['D2'], 'Sz', 'name=johnNewYork'),
].reduce<VCVersion[]>((h, step) => step(h), []);

function relationText(a: VCVersion, b: VCVersion): { tone: Tone; text: string } {
  const c = compareClocks(a.clock, b.clock);
  if (c === 'equal') return { tone: 'info', text: `${a.id} and ${b.id} have identical clocks.` };
  if (c === 'before' || c === 'after') {
    const [x, y] = c === 'before' ? [a, b] : [b, a];
    return { tone: 'ok', text: `${x.id} is an ancestor of ${y.id}: every counter in ${y.id} is ≥ the matching counter in ${x.id}. No conflict; ${y.id} can overwrite ${x.id}.` };
  }
  const keys = [...new Set([...Object.keys(a.clock), ...Object.keys(b.clock)])];
  const ka = keys.find((k) => (a.clock[k] ?? 0) > (b.clock[k] ?? 0))!;
  const kb = keys.find((k) => (b.clock[k] ?? 0) > (a.clock[k] ?? 0))!;
  return {
    tone: 'warn',
    text: `${a.id} and ${b.id} are siblings (conflict): ${a.id} has [${ka},${a.clock[ka]}] vs ${b.clock[ka] ?? 0} in ${b.id}, but ${b.id} has [${kb},${b.clock[kb]}] vs ${a.clock[kb] ?? 0} in ${a.id}. Neither descends from the other.`,
  };
}

const VectorClockLab: React.FC<{ tryThis?: React.ReactNode }> = ({ tryThis }) => {
  const [history, setHistory] = useState<VCVersion[]>(BOOK_EXAMPLE);
  const [readFrom, setReadFrom] = useState<string>('D4');
  const [server, setServer] = useState('Sx');
  const [value, setValue] = useState('name=johnNY');
  const [cmpA, setCmpA] = useState('D3');
  const [cmpB, setCmpB] = useState('D4');

  const current = history.filter((h) => !history.some((o) => compareClocks(h.clock, o.clock) === 'before'));
  const parents = readFrom ? [readFrom] : [];
  const previewBase = mergeClocks(history.filter((h) => parents.includes(h.id)).map((h) => h.clock));
  const preview = { ...previewBase, [server]: (previewBase[server] ?? 0) + 1 };
  const byId = (id: string) => history.find((h) => h.id === id);
  const a = byId(cmpA);
  const b = byId(cmpB);
  const rel = a && b ? relationText(a, b) : null;
  const siblingIds = current.map((c) => c.id);
  const mergedPreview = (() => {
    const base = mergeClocks(current.map((c) => c.clock));
    return { ...base, [server]: (base[server] ?? 0) + 1 };
  })();

  const write = () => {
    const next = vcWrite(history, parents, server, value || `value${history.length + 1}`);
    setHistory(next);
    setReadFrom(next[next.length - 1].id);
    setCmpB(next[next.length - 1].id);
  };
  const reconcile = () => {
    const next = vcWrite(history, siblingIds, server, current.map((c) => c.value).join(' + '));
    setHistory(next);
    setReadFrom(next[next.length - 1].id);
    setCmpA(siblingIds[0]);
    setCmpB(next[next.length - 1].id);
  };

  return (
    <div className={`${panel} p-5 space-y-4`}>
      {tryThis && <TryThis>{tryThis}</TryThis>}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className={`${sub} p-4 space-y-3`}>
          <p className={`text-sm font-semibold ${heading}`}>Write a new version of data item D</p>
          <label className={`text-xs ${muted} block`}>Client first reads (context)</label>
          <select className={inputCls} value={readFrom} onChange={(e) => setReadFrom(e.target.value)}>
            <option value="">nothing: brand-new item</option>
            {history.map((h) => (
              <option key={h.id} value={h.id}>
                {h.id} {fmtClock(h.clock, '')} “{h.value}”
              </option>
            ))}
          </select>
          <label className={`text-xs ${muted} block`}>Write handled by server</label>
          <div className="flex gap-2">
            {VC_SERVERS.map((s) => (
              <button key={s} onClick={() => setServer(s)} className={`${btn} ${server === s ? 'bg-purple-600 text-white' : btnGhost}`}>
                {s}
              </button>
            ))}
          </div>
          <label className={`text-xs ${muted} block`}>New value</label>
          <input className={inputCls} value={value} onChange={(e) => setValue(e.target.value)} />
          <p className="text-sm">
            New clock: <span className="font-mono font-semibold">{fmtClock(preview, `D${history.length + 1}`)}</span>
            <span className={`block text-xs ${muted}`}>
              {readFrom ? `Copies ${readFrom}’s clock, then ` : 'Starts empty, then '}
              {previewBase[server] ? `increments [${server},${previewBase[server]}] → ${previewBase[server] + 1}.` : `adds a new entry [${server},1].`}
            </span>
          </p>
          <div className="flex gap-2 flex-wrap">
            <button className={`${btn} bg-purple-600 text-white hover:bg-purple-500`} onClick={write}>
              Write
            </button>
            <button className={btnGhost} onClick={() => { setHistory(BOOK_EXAMPLE); setReadFrom('D4'); setCmpA('D3'); setCmpB('D4'); }}>
              Load book example (D1–D4)
            </button>
            <button className={btnGhost} onClick={() => { setHistory([]); setReadFrom(''); }}>
              Clear
            </button>
          </div>
        </div>

        <div className="space-y-3">
          <p className={`text-sm font-semibold ${heading}`}>Version history</p>
          {history.length === 0 && <p className={`text-sm ${muted}`}>No versions yet. Write one.</p>}
          <ul className="space-y-1.5">
            {history.map((h) => {
              const live = siblingIds.includes(h.id);
              return (
                <li key={h.id} className={`rounded-xl border px-3 py-2 text-sm ${live ? (current.length > 1 ? toneCls.warn : toneCls.ok) : toneCls.info}`}>
                  <div className="flex justify-between gap-2">
                    <span className="font-mono font-semibold">{fmtClock(h.clock, h.id)}</span>
                    <span className="text-xs">{live ? (current.length > 1 ? 'sibling' : 'current') : 'overwritten'}</span>
                  </div>
                  <span className="text-xs">
                    “{h.value}” via {h.server}
                    {h.from.length ? `, read ${h.from.join(' + ')}` : ''}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      </div>

      {current.length > 1 && (
        <div className={`rounded-xl border p-4 space-y-2 ${toneCls.warn}`}>
          <p className="text-sm font-semibold">Conflict: {siblingIds.join(' and ')} are siblings</p>
          <p className="text-sm">
            A read returns all of them and the client must merge. Reconciling through {server} merges the clocks (pointwise max) and increments {server}:{' '}
            <span className="font-mono font-semibold">{fmtClock(mergedPreview, `D${history.length + 1}`)}</span>.
          </p>
          <button className={`${btn} bg-purple-600 text-white hover:bg-purple-500`} onClick={reconcile}>
            Reconcile siblings via {server}
          </button>
        </div>
      )}

      {history.length >= 2 && (
        <div className={`${sub} p-4 space-y-2`}>
          <p className={`text-sm font-semibold ${heading}`}>Compare two versions</p>
          <div className="flex gap-2 items-center flex-wrap">
            <select className={`${inputCls} w-auto`} value={cmpA} onChange={(e) => setCmpA(e.target.value)}>
              {history.map((h) => (
                <option key={h.id}>{h.id}</option>
              ))}
            </select>
            <span className={muted}>vs</span>
            <select className={`${inputCls} w-auto`} value={cmpB} onChange={(e) => setCmpB(e.target.value)}>
              {history.map((h) => (
                <option key={h.id}>{h.id}</option>
              ))}
            </select>
          </div>
          {rel && <div className={`rounded-xl border p-3 text-sm ${toneCls[rel.tone]}`}>{rel.text}</div>}
        </div>
      )}
    </div>
  );
};

/* =====================================================================================
 * Stage 10: single-node storage engine (commit log, memtable, SSTables, bloom filters)
 * ===================================================================================== */

const MEMTABLE_LIMIT = 3;
const BLOOM_BITS = 16;
const bloomPositions = (key: string) => [murmur3Hash(key, 1) % BLOOM_BITS, murmur3Hash(key, 7) % BLOOM_BITS];

interface SSTable {
  id: number;
  entries: [string, string][];
  bits: boolean[];
}
interface EngineState {
  commitLog: [string, string][];
  memtable: Record<string, string>;
  sstables: SSTable[];
  nextId: number;
}

function enginePut(s: EngineState, k: string, v: string): { state: EngineState; trace: string[] } {
  const trace = [`1. Append ${k}=${v} to the commit log on disk (sequential write, survives a crash).`, `2. Put it in the memtable (memory).`];
  const memtable = { ...s.memtable, [k]: v };
  const commitLog: [string, string][] = [...s.commitLog, [k, v]];
  if (Object.keys(memtable).length < MEMTABLE_LIMIT) return { state: { ...s, memtable, commitLog }, trace };
  const entries = Object.entries(memtable).sort(([a], [b]) => a.localeCompare(b));
  const bits = Array(BLOOM_BITS).fill(false) as boolean[];
  entries.forEach(([key]) => bloomPositions(key).forEach((p) => (bits[p] = true)));
  trace.push(`3. Memtable reached ${MEMTABLE_LIMIT} keys: flushed to SST-${s.nextId} (sorted) with its bloom filter; commit log truncated.`);
  return { state: { commitLog: [], memtable: {}, sstables: [{ id: s.nextId, entries, bits }, ...s.sstables], nextId: s.nextId + 1 }, trace };
}

const ENGINE_SEED: EngineState = (
  [
    ['apple', '1'],
    ['banana', '2'],
    ['cherry', '3'],
    ['date', '4'],
    ['elder', '5'],
    ['fig', '6'],
    ['grape', '7'],
  ] as [string, string][]
).reduce<EngineState>((s, [k, v]) => enginePut(s, k, v).state, { commitLog: [], memtable: {}, sstables: [], nextId: 1 });

const StorageEngineLab: React.FC<{ tryThis?: React.ReactNode }> = ({ tryThis }) => {
  const [eng, setEng] = useState<EngineState>(ENGINE_SEED);
  const [k, setK] = useState('apple');
  const [v, setV] = useState('10');
  const [trace, setTrace] = useState<{ tone: Tone; text: string }[]>([]);

  const put = () => {
    const r = enginePut(eng, k, v);
    setEng(r.state);
    setTrace(r.trace.map((text) => ({ tone: 'info' as Tone, text })));
  };
  const get = () => {
    const steps: { tone: Tone; text: string }[] = [];
    if (k in eng.memtable) {
      steps.push({ tone: 'ok', text: `1. Memtable hit: ${k}=${eng.memtable[k]}. Returned from memory, no disk read.` });
      return setTrace(steps);
    }
    steps.push({ tone: 'info', text: '1. Not in the memtable. Check each SSTable’s bloom filter, newest first.' });
    let reads = 0;
    let skipped = 0;
    for (const t of eng.sstables) {
      const pos = bloomPositions(k);
      const maybe = pos.every((p) => t.bits[p]);
      if (!maybe) {
        skipped++;
        steps.push({ tone: 'ok', text: `SST-${t.id}: bit ${pos.find((p) => !t.bits[p])} is 0 → definitely not here. Skipped (no disk read).` });
        continue;
      }
      reads++;
      const hit = t.entries.find(([ek]) => ek === k);
      if (hit) {
        steps.push({ tone: 'ok', text: `SST-${t.id}: bits ${pos.join(', ')} all 1 → maybe. Disk read: found ${k}=${hit[1]}.` });
        steps.push({ tone: 'info', text: `Done: ${reads} disk read(s), ${skipped} SSTable(s) skipped by bloom filters.` });
        return setTrace(steps);
      }
      steps.push({ tone: 'warn', text: `SST-${t.id}: bits ${pos.join(', ')} all 1 → maybe. Disk read: not there (false positive).` });
    }
    steps.push({ tone: 'warn', text: `"${k}" not found. ${reads} disk read(s), ${skipped} SSTable(s) skipped by bloom filters.` });
    setTrace(steps);
  };
  const crash = () => {
    const lost = Object.keys(eng.memtable).length;
    const memtable = Object.fromEntries(eng.commitLog);
    setEng({ ...eng, memtable });
    setTrace([
      { tone: 'error', text: `Node crashed: the memtable (${lost} key(s)) was in memory and is gone.` },
      { tone: 'ok', text: `Restart: replayed ${eng.commitLog.length} commit-log entr${eng.commitLog.length === 1 ? 'y' : 'ies'} to rebuild the memtable. Nothing lost.` },
    ]);
  };

  return (
    <div className={`${panel} p-5 space-y-4`}>
      {tryThis && <TryThis>{tryThis}</TryThis>}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className={`${sub} p-4 space-y-2`}>
          <p className={`text-sm font-semibold ${heading}`}>Commit log (disk, append-only)</p>
          {eng.commitLog.length === 0 ? <p className={`text-sm ${muted}`}>empty (truncated after the last flush)</p> : null}
          <ol className="text-sm font-mono space-y-0.5">
            {eng.commitLog.map(([ck, cv], i) => (
              <li key={i}>
                {i + 1}. {ck}={cv}
              </li>
            ))}
          </ol>
          <p className={`text-sm font-semibold pt-2 ${heading}`}>
            Memtable (memory) {Object.keys(eng.memtable).length}/{MEMTABLE_LIMIT}
          </p>
          <ul className="text-sm font-mono space-y-0.5">
            {Object.entries(eng.memtable).map(([mk, mv]) => (
              <li key={mk}>
                {mk}={mv}
              </li>
            ))}
          </ul>
        </div>
        <div className={`${sub} p-4 space-y-3 lg:col-span-2`}>
          <p className={`text-sm font-semibold ${heading}`}>SSTables on disk (newest first) with bloom filters ({BLOOM_BITS} bits, 2 hashes)</p>
          {eng.sstables.map((t) => {
            const pos = bloomPositions(k);
            return (
              <div key={t.id} className="space-y-1">
                <div className="flex justify-between text-sm">
                  <span className="font-mono font-semibold">SST-{t.id}</span>
                  <span className="font-mono">{t.entries.map(([ek, ev]) => `${ek}=${ev}`).join(', ')}</span>
                </div>
                <div className="flex gap-0.5" aria-label={`Bloom filter bits for SST-${t.id}`}>
                  {t.bits.map((bit, i) => (
                    <span
                      key={i}
                      title={`bit ${i}`}
                      className={`flex-1 h-5 rounded text-[11px] leading-5 text-center font-mono ${
                        bit ? 'bg-indigo-500 text-white' : 'bg-slate-200 text-slate-500 dark:bg-white/10 dark:text-slate-400'
                      } ${pos.includes(i) ? 'ring-2 ring-amber-500' : ''}`}
                    >
                      {bit ? 1 : 0}
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
          <p className={`text-xs ${muted}`}>
            Amber rings mark the bits for key “{k}” ({bloomPositions(k).join(', ')}). All 1 → maybe here; any 0 → definitely not.
          </p>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <input className={inputCls} value={k} onChange={(e) => setK(e.target.value)} aria-label="Key" />
            <input className={inputCls} value={v} onChange={(e) => setV(e.target.value)} aria-label="Value" />
          </div>
          <div className="flex gap-2 flex-wrap">
            <button className={`${btn} bg-amber-500 text-slate-950 hover:bg-amber-400`} onClick={put}>
              Write path: put
            </button>
            <button className={`${btn} bg-indigo-600 text-white hover:bg-indigo-500`} onClick={get}>
              Read path: get
            </button>
            <button className={`${btn} bg-rose-600 text-white hover:bg-rose-500`} onClick={crash}>
              Crash &amp; restart node
            </button>
            <button className={btnGhost} onClick={() => { setEng(ENGINE_SEED); setTrace([]); }}>
              Reset
            </button>
          </div>
        </div>
        <div className="space-y-1.5">
          {trace.length === 0 && <p className={`text-sm ${muted}`}>Run a put or get to see each step.</p>}
          {trace.map((t, i) => (
            <div key={i} className={`rounded-xl border px-3 py-2 text-sm ${toneCls[t.tone]}`}>
              {t.text}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

/* =====================================================================================
 * Main chapter
 * ===================================================================================== */

export const Chapter6KeyValueStore: React.FC<Chapter6KeyValueStoreProps> = () => {
  const [stage, setStage] = usePersistentState<number>('chapter6:stage', 1);
  const [storedTab, setActiveTab] = usePersistentState<TabId>('chapter6:tab', 'cluster');
  const [nSetting, setN] = usePersistentState<number>('chapter6:n', 3);
  const [wSetting, setW] = usePersistentState<number>('chapter6:w', 2);
  const [rSetting, setR] = usePersistentState<number>('chapter6:r', 2);
  const [capMode, setCapMode] = usePersistentState<'CP' | 'AP'>('chapter6:cap', 'CP');
  const [sloppySetting, setSloppy] = usePersistentState<boolean>('chapter6:sloppy', false);
  const [isSimulating, setIsSimulating] = useState(true);
  const [sim, setSim] = useState<SimState>(createInitialSim);
  const [inputKey, setInputKey] = useState('user:101');
  const [inputValue, setInputValue] = useState('Alice (updated)');
  const [merkleA, setMerkleA] = useState('s3');
  const [merkleB, setMerkleB] = useState('s4');
  const [gossipCluster, setGossipCluster] = useState(1000);

  const safeStage = Math.min(10, Math.max(1, stage || 1));
  const info = STAGES[safeStage - 1];
  const tabMeta = TAB_META.find((t) => t.id === storedTab);
  const activeTab: TabId = tabMeta && tabMeta.unlock <= safeStage ? storedTab : 'cluster';

  // Effective settings: each knob only takes effect from the stage that introduces it.
  const n = safeStage >= 4 ? nSetting : 1;
  const w = safeStage >= 5 ? Math.min(wSetting, n) : 1;
  const r = safeStage >= 5 ? Math.min(rSetting, n) : 1;
  const sloppy = safeStage >= 8 && capMode === 'AP' && sloppySetting;
  const ctx: Ctx = { n, w, r, cap: capMode, sloppy, readRepair: safeStage >= 5 };
  const isStrong = w + r > n;

  useEffect(() => {
    if (!isSimulating) return;
    const id = setInterval(() => setSim(tickSim), 1000);
    return () => clearInterval(id);
  }, [isSimulating]);

  const goToStage = (s: number) => {
    setStage(s);
    setActiveTab(STAGES[s - 1].tab);
  };

  const keys = useMemo(() => allKeys(sim), [sim]);
  const key = inputKey.trim();

  const consistency: { tone: Tone; text: string } =
    safeStage < 5
      ? { tone: 'info', text: 'W = R = 1 until stage 5: no consistency guarantee between replicas.' }
      : sloppy
      ? { tone: 'warn', text: 'Sloppy quorum on: stand-ins count toward W and R, so W + R > N no longer guarantees fresh reads.' }
      : !isStrong
      ? { tone: 'warn', text: `W + R = ${w + r} ≤ N = ${n}: read and write sets may not overlap, so stale reads are possible.` }
      : capMode === 'AP'
      ? { tone: 'warn', text: `W + R > N, but AP accepts writes below quorum during failures; those can be missed by reads until repaired.` }
      : { tone: 'ok', text: `W + R = ${w + r} > N = ${n} with a strict quorum: every successful read overlaps the latest successful write.` };

  /* ---------- sub-panels ---------- */

  const NodeChips = (
    <div className="grid grid-cols-5 gap-1.5">
      {NODES.map((nd) => {
        const crashed = sim.status[nd.id] === 'crashed';
        const cut = !crashed && sim.partitioned && nd.dc === 'EU-West';
        return (
          <button
            key={nd.id}
            onClick={() => setSim((s) => toggleCrash(s, nd.id))}
            title={crashed ? `Recover ${nd.id}` : `Crash ${nd.id}`}
            className={`rounded-xl border px-1 py-2 text-center transition-colors ${
              crashed ? toneCls.error : cut ? toneCls.warn : 'border-slate-300 hover:bg-slate-100 dark:border-white/15 dark:hover:bg-white/[0.06]'
            }`}
          >
            <Server className="w-4 h-4 mx-auto" />
            <span className="block text-xs font-mono font-semibold">{nd.id}</span>
            <span className="block text-[11px]">{crashed ? 'down' : cut ? 'cut off' : nd.dc === 'US-East' ? 'US' : 'EU'}</span>
          </button>
        );
      })}
    </div>
  );

  const renderCluster = () => {
    if (safeStage === 1) return <SingleServerLab />;
    if (safeStage === 2) return <CapLab partitioned={sim.partitioned} onTogglePartition={() => setSim(togglePartition)} cap={capMode} setCap={setCapMode} />;

    const walk = ringWalk(keyAngle(key || ' '));
    const pref = walk.order.slice(0, n).map((o) => o.nodeId);
    const truth = globalLatest(sim, key);
    const hintHolders = sim.hints.filter((h) => h.key === key);
    const op = sim.lastOp;
    let takenCount = 0;
    const walkSteps: WalkStep[] = [];
    for (const st of walk.steps) {
      if (takenCount >= n) break;
      walkSteps.push(st);
      if (st.taken) takenCount++;
    }

    return (
      <div className="space-y-4">
        {info.tryThis && <TryThis>{info.tryThis}</TryThis>}
        <div className="grid grid-cols-1 xl:grid-cols-5 gap-5">
          <div className={`${panel} xl:col-span-3 p-5 space-y-4`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className={`text-sm font-semibold ${heading}`}>Hash ring: 5 servers × 2 virtual nodes</h3>
              <span className="text-xs font-mono px-2 py-0.5 rounded-full border border-indigo-300 text-indigo-700 dark:border-indigo-400/30 dark:text-indigo-300">
                N={n} · W={w} · R={r} · {capMode}
                {sloppy ? ' · sloppy' : ''}
              </span>
            </div>
            <RingView sim={sim} keys={keys} selectedKey={key} n={n} onSelectKey={setInputKey} />
            <div className="flex flex-wrap gap-1.5">
              {keys.map((k) => (
                <button
                  key={k}
                  onClick={() => setInputKey(k)}
                  className={`px-2 py-1 rounded-lg text-xs font-mono border ${
                    k === key ? 'bg-indigo-600 text-white border-indigo-600' : 'border-slate-300 text-slate-700 dark:border-white/15 dark:text-slate-200'
                  }`}
                >
                  {k} <span className="opacity-70">{keyAngle(k)}°</span>
                </button>
              ))}
            </div>

            {key && (
              <div className="space-y-2">
                <p className={`text-sm ${muted}`}>
                  Clockwise walk from {keyAngle(key)}°:{' '}
                  {walkSteps.map((st, i) => (
                    <span key={i} className={`font-mono ${st.taken ? 'text-emerald-700 dark:text-emerald-300' : 'line-through opacity-60'}`}>
                      {st.angle}° {st.nodeId}
                      {st.taken ? '' : ' (same server, skip)'}
                      {i < walkSteps.length - 1 ? ' → ' : ''}
                    </span>
                  ))}
                  . Preference list: <strong className="font-mono">{pref.join(', ')}</strong>
                  {safeStage < 4 && ' (one copy until stage 4)'}.
                </p>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className={`text-left text-xs ${muted}`}>
                        <th className="py-1 pr-2">Server</th>
                        <th className="py-1 pr-2">Role</th>
                        <th className="py-1 pr-2">Stored version(s)</th>
                        <th className="py-1">State</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...pref.map((id, i) => ({ id, role: `replica #${i + 1}`, versions: sim.replicas[id]?.[key] ?? [] })), ...hintHolders.map((h) => ({ id: h.holder, role: `stand-in for ${h.target}`, versions: [h.version] }))].map(
                        (row, i) => {
                          const pending = sim.pending.some((p) => p.target === row.id && p.key === key);
                          const up = isReachable(sim, row.id);
                          const state = !row.versions.length
                            ? pending
                              ? { tone: 'info' as Tone, text: 'missing (async copy in flight)' }
                              : { tone: truth.length ? ('warn' as Tone) : ('info' as Tone), text: 'missing' }
                            : hasAll(row.versions, truth)
                            ? { tone: 'ok' as Tone, text: row.versions.length > 1 ? 'latest (has siblings)' : 'latest' }
                            : { tone: 'warn' as Tone, text: pending ? 'stale (async copy in flight)' : 'stale' };
                          return (
                            <tr key={`${row.id}-${i}`} className="border-t border-slate-200 dark:border-white/10">
                              <td className="py-1.5 pr-2 font-mono">
                                {row.id} <span className={`text-xs ${up ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>{up ? 'up' : downReason(sim, row.id)}</span>
                              </td>
                              <td className="py-1.5 pr-2 text-xs">{row.role}</td>
                              <td className="py-1.5 pr-2 font-mono text-xs">{row.versions.map((v) => `“${v.value}” ${fmtClock(v.clock)}`).join(' | ') || '—'}</td>
                              <td className="py-1.5">
                                <span className={`text-xs px-2 py-0.5 rounded-full border ${toneCls[state.tone]}`}>{state.text}</span>
                              </td>
                            </tr>
                          );
                        }
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          <div className="xl:col-span-2 space-y-5">
            <div className={`${panel} p-5 space-y-3`}>
              <h3 className={`text-sm font-semibold ${heading}`}>Client: put / get</h3>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className={`text-xs ${muted}`}>Key</label>
                  <input className={inputCls} value={inputKey} onChange={(e) => setInputKey(e.target.value)} />
                </div>
                <div>
                  <label className={`text-xs ${muted}`}>Value</label>
                  <input className={inputCls} value={inputValue} onChange={(e) => setInputValue(e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button disabled={!key} className={`${btn} py-2 bg-amber-500 text-slate-950 hover:bg-amber-400`} onClick={() => setSim((s) => doPut(s, ctx, key, inputValue))}>
                  put(key, value)
                </button>
                <button disabled={!key} className={`${btn} py-2 bg-indigo-600 text-white hover:bg-indigo-500`} onClick={() => setSim((s) => doGet(s, ctx, key))}>
                  get(key)
                </button>
              </div>

              {op ? (
                <div className={`rounded-xl border p-3 space-y-2 ${toneCls[op.ok ? (op.summary.includes('STALE') ? 'warn' : 'ok') : op.coordinator ? 'warn' : 'error']}`}>
                  <div className="flex items-center gap-2">
                    {op.ok ? <CheckCircle2 className="w-5 h-5 shrink-0" /> : op.coordinator ? <AlertTriangle className="w-5 h-5 shrink-0" /> : <XCircle className="w-5 h-5 shrink-0" />}
                    <span className="font-semibold">
                      {op.type} {op.key}: {op.type === 'PUT' ? 'acks' : 'replies'} {op.got} / {op.type === 'PUT' ? 'W' : 'R'} = {op.needed}
                    </span>
                  </div>
                  <div className="flex gap-1" aria-hidden>
                    {Array.from({ length: Math.max(op.needed, op.got) }).map((_, i) => (
                      <span key={i} className={`h-2 flex-1 rounded-full ${i < op.got ? 'bg-emerald-500' : 'bg-rose-400'}`} />
                    ))}
                  </div>
                  <p className="text-sm">{op.summary}</p>
                  {op.type === 'GET' && op.result && op.result.length > 1 && (
                    <button
                      className={`${btn} bg-purple-600 text-white hover:bg-purple-500`}
                      onClick={() =>
                        setSim((s) =>
                          doPut(
                            s,
                            ctx,
                            op.key,
                            op.result!.map((v) => v.value).join(' + '),
                            mergeClocks(op.result!.map((v) => v.clock))
                          )
                        )
                      }
                    >
                      Reconcile: write merged value
                    </button>
                  )}
                </div>
              ) : (
                <p className={`text-sm ${muted}`}>Run a put or get. The ring draws the request’s path to each replica and whether it answered.</p>
              )}
            </div>

            <div className={`${panel} p-5 space-y-4`}>
              <h3 className={`text-sm font-semibold ${heading}`}>Failures &amp; settings</h3>
              <div className="space-y-1">
                <p className={`text-xs ${muted}`}>Click a server to crash or recover it</p>
                {NodeChips}
              </div>
              <div className="flex flex-wrap gap-2 items-center">
                <button className={`${btn} ${sim.partitioned ? 'bg-emerald-600 hover:bg-emerald-500' : 'bg-rose-600 hover:bg-rose-500'} text-white flex items-center gap-1.5`} onClick={() => setSim(togglePartition)}>
                  <ZapOff className="w-3.5 h-3.5" />
                  {sim.partitioned ? 'Heal partition' : 'Partition EU-West (s3, s4)'}
                </button>
                <div className="inline-flex rounded-xl border border-slate-300 dark:border-white/15 overflow-hidden text-xs" role="group" aria-label="On quorum failure">
                  {(['CP', 'AP'] as const).map((m) => (
                    <button key={m} onClick={() => setCapMode(m)} className={`px-3 py-1.5 font-semibold ${capMode === m ? 'bg-indigo-600 text-white' : 'text-slate-700 dark:text-slate-200'}`}>
                      {m === 'CP' ? 'CP: reject below quorum' : 'AP: accept, reconcile later'}
                    </button>
                  ))}
                </div>
              </div>
              <QuorumSliders stage={safeStage} n={nSetting} w={wSetting} r={rSetting} setN={setN} setW={setW} setR={setR} />
              {safeStage >= 8 && (
                <label className="flex items-start gap-2 text-sm">
                  <input type="checkbox" className="mt-1" checked={sloppySetting} disabled={capMode === 'CP'} onChange={(e) => setSloppy(e.target.checked)} />
                  <span>
                    Sloppy quorum + hinted handoff
                    <span className={`block text-xs ${muted}`}>
                      {capMode === 'CP' ? 'Switch to AP first: stand-ins trade consistency for availability.' : 'Down replicas are replaced by the next healthy server clockwise, which keeps a hint.'}
                    </span>
                  </span>
                </label>
              )}
              <div className={`rounded-xl border p-3 text-sm ${toneCls[consistency.tone]}`}>{consistency.text}</div>
              <div className="flex items-center justify-between gap-2">
                <span className={`text-xs ${muted}`}>
                  Background: {sim.pending.length} async cop{sim.pending.length === 1 ? 'y' : 'ies'} in flight, {sim.hints.length} hint(s) held
                </span>
                <button className={`${btnGhost} flex items-center gap-1`} onClick={() => setIsSimulating(!isSimulating)}>
                  {isSimulating ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                  {isSimulating ? 'Pause' : 'Resume'} background
                </button>
              </div>
              <button className={`${btnGhost} flex items-center gap-1`} onClick={() => setSim(createInitialSim())}>
                <RotateCcw className="w-3.5 h-3.5" /> Reset cluster data
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderQuorum = () => {
    const overlap = Math.max(0, w + r - n);
    return (
      <div className={`${panel} p-5 space-y-5`}>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <div className={`${sub} p-4 space-y-4`}>
            <QuorumSliders stage={safeStage} n={nSetting} w={wSetting} r={rSetting} setN={setN} setW={setW} setR={setR} />
            <div className="space-y-1">
              <p className={`text-xs ${muted}`}>Book presets</p>
              <div className="flex flex-wrap gap-1.5">
                <button className={btnGhost} onClick={() => { setN(3); setW(2); setR(2); }}>N=3, W=R=2 (usual)</button>
                <button className={btnGhost} onClick={() => { setW(nSetting); setR(1); }}>Fast read: R=1, W=N</button>
                <button className={btnGhost} onClick={() => { setW(1); setR(nSetting); }}>Fast write: W=1, R=N</button>
              </div>
            </div>
          </div>
          <div className="md:col-span-2 space-y-4">
            <div className="text-center font-mono text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white">
              W ({w}) + R ({r}) = {w + r} <span className="text-indigo-600 dark:text-indigo-400">{isStrong ? '>' : '≤'}</span> N ({n})
            </div>
            <div role="img" aria-label={`${n} replicas: the first ${w} acknowledge the write, the last ${r} answer the read, overlap ${overlap}.`} className="space-y-2">
              <div className="flex gap-2">
                {Array.from({ length: n }).map((_, i) => {
                  const inW = i < w;
                  const inR = i >= n - r;
                  return (
                    <div key={i} className={`flex-1 rounded-xl border-2 p-2 text-center text-xs ${inW && inR ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-400/10' : 'border-slate-300 dark:border-white/15'}`}>
                      <span className="font-mono font-semibold block">replica #{i + 1}</span>
                      <span className="block mt-1">{inW ? 'has the write' : 'copy arrives later'}</span>
                      <span className="block">{inR ? 'answers the read' : '—'}</span>
                    </div>
                  );
                })}
              </div>
              <p className={`text-sm ${muted}`}>
                Worst case: the write is acknowledged by the first {w} replica(s) and the read is answered by the last {r}.{' '}
                {overlap > 0 ? (
                  <strong className="text-emerald-700 dark:text-emerald-300">They overlap on {overlap} replica(s) (W + R − N), so the read sees the latest write.</strong>
                ) : (
                  <strong className="text-amber-700 dark:text-amber-300">No overlap: the read can miss the latest write entirely.</strong>
                )}
              </p>
            </div>
            <div className={`rounded-xl border p-3 text-sm ${toneCls[consistency.tone]}`}>{consistency.text}</div>
            <p className={`text-sm ${muted}`}>
              Latency trade-off: the coordinator waits for the slowest of the W (or R) replies it needs. Smaller W or R answers faster; larger W or R is more consistent. Try the effect on
              the Cluster tab: set W = 1, R = 1, pause background activity, then put and immediately get a key.
            </p>
          </div>
        </div>
      </div>
    );
  };

  const renderGossip = () => {
    const observerUp = sim.status.s0 === 'healthy';
    return (
      <div className={`${panel} p-5 space-y-4`}>
        {info.tab === 'gossip' && info.tryThis && <TryThis>{info.tryThis}</TryThis>}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div className="space-y-3">
            <p className={`text-sm font-semibold ${heading}`}>Membership list kept by s0</p>
            {!observerUp && <div className={`rounded-xl border p-3 text-sm ${toneCls.error}`}>s0 itself is down, so its list is frozen. Recover s0 to continue.</div>}
            <table className="w-full text-sm">
              <thead>
                <tr className={`text-left text-xs ${muted}`}>
                  <th className="py-1">Member</th>
                  <th className="py-1">Heartbeat counter</th>
                  <th className="py-1">Rounds since it increased</th>
                  <th className="py-1">s0 thinks</th>
                </tr>
              </thead>
              <tbody>
                {NODES.map((nd) => {
                  const since = sim.tick - sim.seen[nd.id].at;
                  const st: { tone: Tone; text: string } =
                    since >= OFFLINE_TICKS ? { tone: 'error', text: 'offline' } : since >= SUSPECT_TICKS ? { tone: 'warn', text: 'suspect' } : { tone: 'ok', text: 'alive' };
                  return (
                    <tr key={nd.id} className="border-t border-slate-200 dark:border-white/10">
                      <td className="py-1.5 font-mono">{nd.id}</td>
                      <td className="py-1.5 font-mono">{sim.seen[nd.id].hb}</td>
                      <td className="py-1.5 font-mono">{since}</td>
                      <td className="py-1.5">
                        <span className={`text-xs px-2 py-0.5 rounded-full border ${toneCls[st.tone]}`}>{st.text}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className={`text-xs ${muted}`}>
              One round per second{isSimulating ? '' : ' (paused)'}. Suspect after {SUSPECT_TICKS} rounds without an increase, offline after {OFFLINE_TICKS}. A real cluster marks a
              node offline only once gossip from other nodes confirms its counter has stalled too.
            </p>
            {NodeChips}
            <div className="flex gap-2 flex-wrap">
              <button className={`${btn} ${sim.partitioned ? 'bg-emerald-600 hover:bg-emerald-500' : 'bg-rose-600 hover:bg-rose-500'} text-white`} onClick={() => setSim(togglePartition)}>
                {sim.partitioned ? 'Heal partition' : 'Partition EU-West (s3, s4)'}
              </button>
              <button className={`${btnGhost} flex items-center gap-1`} onClick={() => setIsSimulating(!isSimulating)}>
                {isSimulating ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                {isSimulating ? 'Pause' : 'Resume'} rounds
              </button>
            </div>
          </div>
          <div className={`${sub} p-4 space-y-3`}>
            <p className={`text-sm font-semibold ${heading}`}>Why not all-to-all heartbeats?</p>
            <label className={`text-xs ${muted} block`}>Cluster size (servers)</label>
            <input type="number" min={2} max={100000} className={inputCls} value={gossipCluster} onChange={(e) => setGossipCluster(Math.max(2, Number(e.target.value) || 2))} />
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className={`rounded-xl border p-3 ${toneCls.error}`}>
                <span className="block text-xs">All-to-all: n·(n − 1)</span>
                <span className="font-mono font-semibold">{(gossipCluster * (gossipCluster - 1)).toLocaleString()}</span> msgs/round
              </div>
              <div className={`rounded-xl border p-3 ${toneCls.ok}`}>
                <span className="block text-xs">Gossip, fan-out 3: n·3</span>
                <span className="font-mono font-semibold">{(gossipCluster * 3).toLocaleString()}</span> msgs/round
              </div>
            </div>
            <p className={`text-sm ${muted}`}>
              Each gossip message carries the sender’s whole membership list, so news of a stalled counter still spreads to everyone within a few rounds.
            </p>
          </div>
        </div>
      </div>
    );
  };

  const renderMerkle = () => {
    const shared = sharedKeys(sim, merkleA, merkleB, n);
    const ta = buildMerkle(sim.replicas[merkleA] ?? {}, shared);
    const tb = buildMerkle(sim.replicas[merkleB] ?? {}, shared);
    const cmp = compareMerkle(ta, tb);
    const pairs = NODES.flatMap((x, i) => NODES.slice(i + 1).map((y) => ({ a: x.id, b: y.id, count: sharedKeys(sim, x.id, y.id, n).length })))
      .filter((p) => p.count > 0)
      .sort((p, q) => q.count - p.count);
    const cell = (hash: string, compared: boolean, diff: boolean, label: string) => (
      <div
        className={`rounded-lg border px-2 py-1.5 text-center text-xs ${diff ? toneCls.error : compared ? toneCls.ok : 'border-slate-200 text-slate-400 dark:border-white/10 dark:text-slate-500'}`}
        title={compared ? (diff ? 'hashes differ' : 'hashes match') : 'not compared (parent matched)'}
      >
        <span className="block">{label}</span>
        <span className="font-mono font-semibold">{hash}</span>
      </div>
    );
    const tree = (t: MerkleTree, id: string) => (
      <div className={`${sub} p-3 space-y-2`}>
        <p className={`text-sm font-semibold ${heading}`}>
          {id} {isReachable(sim, id) ? '' : `(${downReason(sim, id)})`}
        </p>
        {cell(t.root, true, cmp.rootDiff, 'root')}
        <div className="grid grid-cols-2 gap-2">{t.mids.map((m, i) => cell(m, cmp.rootDiff, cmp.midDiff[i], i === 0 ? '0°–180°' : '180°–360°'))}</div>
        <div className="grid grid-cols-4 gap-1.5">
          {t.leaves.map((l, j) => (
            <div key={j}>
              {cell(l, cmp.leafCompared[j], cmp.leafDiff[j], `${BUCKETS[j][0]}–${BUCKETS[j][1]}°`)}
              <p className={`text-[11px] text-center mt-0.5 ${muted}`}>{t.buckets[j].length} key(s)</p>
            </div>
          ))}
        </div>
      </div>
    );
    return (
      <div className={`${panel} p-5 space-y-4`}>
        {info.tab === 'merkle' && info.tryThis && <TryThis>{info.tryThis}</TryThis>}
        <div className="flex flex-wrap gap-2 items-center text-sm">
          <span className={muted}>Compare</span>
          <select className={`${inputCls} w-auto`} value={merkleA} onChange={(e) => setMerkleA(e.target.value)}>
            {NODES.map((nd) => (
              <option key={nd.id}>{nd.id}</option>
            ))}
          </select>
          <span className={muted}>with</span>
          <select className={`${inputCls} w-auto`} value={merkleB} onChange={(e) => setMerkleB(e.target.value)}>
            {NODES.filter((nd) => nd.id !== merkleA).map((nd) => (
              <option key={nd.id}>{nd.id}</option>
            ))}
          </select>
          <span className={muted}>
            over the {shared.length} key(s) both replicate (N = {n}): {shared.join(', ') || 'none'}
          </span>
        </div>
        {pairs.length > 0 && (
          <div className="flex flex-wrap gap-1.5 items-center text-xs">
            <span className={muted}>Replica pairs that share keys:</span>
            {pairs.map((p) => (
              <button
                key={`${p.a}-${p.b}`}
                onClick={() => {
                  setMerkleA(p.a);
                  setMerkleB(p.b);
                }}
                className={`px-2 py-1 rounded-lg font-mono border ${
                  p.a === merkleA && p.b === merkleB ? 'bg-emerald-600 text-white border-emerald-600' : 'border-slate-300 text-slate-700 dark:border-white/15 dark:text-slate-200'
                }`}
              >
                {p.a}–{p.b} ({p.count})
              </button>
            ))}
          </div>
        )}
        {shared.length === 0 ? (
          <div className={`rounded-xl border p-3 text-sm ${toneCls.info}`}>These two servers share no keys at N = {n}. Pick servers that are neighbours on the ring, or raise N.</div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {tree(ta, merkleA)}
              {tree(tb, merkleB)}
            </div>
            <div className={`rounded-xl border p-3 text-sm ${toneCls[cmp.rootDiff ? 'warn' : 'ok']}`}>
              {cmp.rootDiff
                ? `Roots differ. Walking down took ${cmp.comparisons} hash comparisons and found ${cmp.leafDiff.filter(Boolean).length} of 4 buckets out of sync; syncing moves only their ${cmp.leafDiff.reduce(
                    (acc, d, j) => acc + (d ? ta.buckets[j].length : 0),
                    0
                  )} key(s), not all ${shared.length}.`
                : 'Roots match after 1 comparison: every bucket below is identical, nothing to transfer.'}
            </div>
          </>
        )}
        <div className="flex flex-wrap gap-2">
          <button
            className={`${btn} bg-emerald-600 text-white hover:bg-emerald-500`}
            disabled={!cmp.rootDiff || !isReachable(sim, merkleA) || !isReachable(sim, merkleB)}
            onClick={() => setSim((s) => merkleSync(s, merkleA, merkleB, n))}
          >
            Sync differing buckets
          </button>
          <button className={`${btn} bg-rose-600 text-white hover:bg-rose-500`} onClick={() => setSim((s) => addLog({ ...s, replicas: { ...s.replicas, [merkleA]: {} } }, 'FAILURE', 'ERROR', `${merkleA}'s disk was replaced: all its data is gone (permanent failure).`))}>
            Wipe {merkleA}’s disk
          </button>
          <button className={btnGhost} onClick={() => setActiveTab('cluster')}>
            Go make writes on the Cluster tab
          </button>
        </div>
      </div>
    );
  };

  const renderLogs = () => (
    <div className={`${panel} p-5 space-y-3`}>
      <div className="flex items-center justify-between">
        <h3 className={`text-sm font-semibold ${heading}`}>Operation log (newest first)</h3>
        <button className={btnGhost} onClick={() => setSim((s) => ({ ...s, logs: [] }))}>
          Clear
        </button>
      </div>
      <div className="space-y-1.5 max-h-[28rem] overflow-y-auto pr-1">
        {sim.logs.length === 0 && <p className={`text-sm ${muted}`}>No operations yet.</p>}
        {sim.logs.map((l) => (
          <div key={l.id} className={`rounded-xl border px-3 py-2 flex items-start gap-3 text-sm ${toneCls[l.status === 'ERROR' ? 'error' : l.status === 'WARN' ? 'warn' : 'info']}`}>
            <span className="font-mono text-xs shrink-0 opacity-70">{l.timestamp}</span>
            <span className="font-mono text-xs font-semibold shrink-0 w-20">{l.type}</span>
            <span className="leading-relaxed">{l.detail}</span>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* HERO */}
      <div className={`${panel} p-6 sm:p-8`}>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2 max-w-3xl">
            <div className="flex items-center gap-2">
              <span className="px-3 py-1 bg-amber-500 text-slate-950 font-mono text-xs font-bold rounded-full uppercase tracking-wider">Chapter 6</span>
              <span className="text-xs font-semibold text-amber-700 dark:text-amber-400">Design a key-value store</span>
            </div>
            <h1 className={`text-2xl sm:text-3xl font-extrabold tracking-tight ${heading}`}>Build a Dynamo-style key-value store</h1>
            <p className={`text-sm leading-relaxed ${muted}`}>
              Grow a single-server hash table into a distributed store, one design decision at a time: CAP, partitioning, replication, quorums, vector clocks, gossip, hinted
              handoff, Merkle trees, and each node’s write and read path.
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5 shrink-0 max-w-xs sm:max-w-sm">
            {STAGES.map((s, i) => {
              const stg = i + 1;
              return (
                <button
                  key={stg}
                  onClick={() => goToStage(stg)}
                  title={`Stage ${stg}: ${s.short}`}
                  aria-label={`Stage ${stg}: ${s.short}`}
                  className={`w-9 h-9 rounded-xl font-mono text-sm font-bold transition-colors ${
                    safeStage === stg
                      ? 'bg-amber-500 text-slate-950'
                      : safeStage > stg
                      ? 'bg-emerald-100 text-emerald-800 border border-emerald-300 dark:bg-emerald-400/10 dark:text-emerald-300 dark:border-emerald-400/30'
                      : 'border border-slate-300 text-slate-600 hover:bg-slate-100 dark:border-white/15 dark:text-slate-400 dark:hover:bg-white/[0.06]'
                  }`}
                >
                  {stg}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* STAGE BRIEFING */}
      <div className={`${panel} p-5 space-y-4`}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <h2 className={`text-lg font-bold ${heading}`}>{info.title}</h2>
          <div className="flex gap-2 shrink-0">
            <button disabled={safeStage === 1} onClick={() => goToStage(safeStage - 1)} className={btnGhost}>
              ← Previous stage
            </button>
            <button disabled={safeStage === 10} onClick={() => goToStage(safeStage + 1)} className={`${btn} bg-amber-500 text-slate-950 hover:bg-amber-400`}>
              Next: {safeStage < 10 ? STAGES[safeStage].short : ''} →
            </button>
          </div>
        </div>
        <LessonGoal goal={info.goal} why={info.why} />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
          <div className={`rounded-xl border p-3 ${toneCls.error}`}>
            <strong className="block mb-1">Problem</strong>
            {info.problem}
          </div>
          <div className={`rounded-xl border p-3 ${toneCls.ok}`}>
            <strong className="block mb-1">Solution</strong>
            {info.solution}
          </div>
        </div>
        <div className="flex items-start gap-2 text-sm text-slate-700 dark:text-slate-200">
          <MessageSquare className="w-4 h-4 mt-0.5 shrink-0 text-indigo-500" />
          <span>
            <strong>Think about it:</strong> {info.question}
          </span>
        </div>
        {info.change && <WhatChanged before={info.change.before} after={info.change.after} reason={info.change.reason} />}
      </div>

      {/* TABS */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 dark:border-white/10 pb-2" role="tablist">
        {TAB_META.map((t) => {
          const locked = t.unlock > safeStage;
          const Icon = locked ? Lock : t.icon;
          return (
            <button
              key={t.id}
              role="tab"
              aria-selected={activeTab === t.id}
              disabled={locked}
              onClick={() => setActiveTab(t.id)}
              title={locked ? `Unlocks at stage ${t.unlock}: ${STAGES[t.unlock - 1].short}` : undefined}
              className={`px-3 py-2 rounded-xl text-sm font-medium flex items-center gap-2 transition-colors disabled:opacity-45 disabled:cursor-not-allowed ${
                activeTab === t.id ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/[0.06]'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{t.label}</span>
              {locked && <span className="text-xs">(stage {t.unlock})</span>}
            </button>
          );
        })}
      </div>

      {activeTab === 'cluster' && renderCluster()}
      {activeTab === 'quorum' && renderQuorum()}
      {activeTab === 'versions' && <VectorClockLab tryThis={info.tab === 'versions' ? info.tryThis : undefined} />}
      {activeTab === 'gossip' && renderGossip()}
      {activeTab === 'merkle' && renderMerkle()}
      {activeTab === 'storage' && <StorageEngineLab tryThis={info.tab === 'storage' ? info.tryThis : undefined} />}
      {activeTab === 'logs' && renderLogs()}

      <Takeaway>{info.takeaway}</Takeaway>
      <Quiz key={safeStage} persistKey={`chapter6:quiz:stage${safeStage}`} questions={info.quiz} title={`Check your understanding: stage ${safeStage}`} />
    </div>
  );
};
