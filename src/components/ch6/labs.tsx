import React, { useEffect, useState } from 'react';
import { RotateCcw, Scissors, Send, Search, Power, StepForward, GitMerge, Eraser, RefreshCw } from 'lucide-react';
import { usePersistentState } from '../../lib/usePersistentState';
import { Callout, Stat, Slider, Button, Segmented } from '../lesson/blocks';
import {
  NODES,
  TOKENS,
  SEED,
  OFFLINE_TICKS,
  SUSPECT_TICKS,
  BUCKETS,
  MERKLE_SEED,
  MERKLE_PAIR,
  MEMTABLE_LIMIT,
  BOOK_STEPS,
  STORAGE_SEED,
  EMPTY_STORAGE,
  type Ctx,
  type Outcome,
  type SimState,
  type TargetOutcome,
  type VCVersion,
  type StorageState,
  type ReadStep,
  keyAngle,
  ringWalk,
  walkUntil,
  preferenceList,
  clockwiseServers,
  createInitialSim,
  tickSim,
  doPut,
  doGet,
  toggleCrash,
  isReachable,
  globalLatest,
  hasAll,
  hintsFor,
  sharedKeys,
  buildMerkle,
  compareMerkle,
  merkleSync,
  storeVersion,
  mergeClocks,
  compareClocks,
  fmtClock,
  vcWrite,
  vcHeads,
  bloomPositions,
  storagePut,
  storageCrash,
  storageGet,
} from './engine';

/* =====================================================================================
 * Shared pieces
 * ===================================================================================== */

const stage = 'rounded-xl bg-slate-50 dark:bg-white/[0.04] p-4 sm:p-5';
const label = 'text-xs font-medium text-slate-500 dark:text-slate-400';
const muted = 'text-sm text-slate-600 dark:text-slate-300';

/** Background rounds: async copies land, heartbeats tick, hints are handed back. */
function useSim(seed: [string, string][] = SEED, run = true) {
  const [sim, setSim] = useState<SimState>(() => createInitialSim(seed));
  useEffect(() => {
    if (!run) return;
    const t = setInterval(() => setSim(tickSim), 1000);
    return () => clearInterval(t);
  }, [run]);
  return [sim, setSim] as const;
}

const OUTCOME: Record<Outcome, { text: (t: TargetOutcome) => string; tone: 'good' | 'wait' | 'bad' | 'none' }> = {
  ack: { text: () => 'acked', tone: 'good' },
  async: { text: () => 'copy in background', tone: 'wait' },
  hint: { text: (t) => `hint for ${t.forNode}`, tone: 'wait' },
  down: { text: () => 'down, no ack', tone: 'bad' },
  partitioned: { text: () => 'cut off', tone: 'bad' },
  refused: { text: () => 'not written', tone: 'none' },
  fresh: { text: () => 'replied: latest', tone: 'good' },
  stale: { text: () => 'replied: stale', tone: 'wait' },
  repaired: { text: () => 'stale, repaired', tone: 'wait' },
  skipped: { text: () => 'not waited for', tone: 'none' },
};

const chipTone = {
  good: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-400/15 dark:text-emerald-300',
  wait: 'bg-amber-100 text-amber-800 dark:bg-amber-400/15 dark:text-amber-300',
  bad: 'bg-rose-100 text-rose-800 dark:bg-rose-400/15 dark:text-rose-300',
  none: 'bg-slate-200 text-slate-600 dark:bg-white/10 dark:text-slate-300',
};

const Chip: React.FC<{ tone: keyof typeof chipTone; children: React.ReactNode }> = ({ tone, children }) => (
  <span className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-xs font-medium ${chipTone[tone]}`}>{children}</span>
);

/**
 * One box per server for a single key: what it stores, whether that is the latest version,
 * and what happened to it in the last request. Click a box to crash or recover that server.
 */
const ServerBoxes: React.FC<{
  sim: SimState;
  k: string;
  ids: string[];
  roles: string[];
  onToggle: (id: string) => void;
  cols?: string;
}> = ({ sim, k, ids, roles, onToggle, cols = 'grid-cols-3' }) => {
  const truth = globalLatest(sim, k);
  const op = sim.lastOp && sim.lastOp.key === k ? sim.lastOp : null;
  const now = Date.now();
  return (
    <div className={`grid ${cols} gap-2`}>
      {ids.map((id, i) => {
        const up = isReachable(sim, id);
        const versions = sim.replicas[id]?.[k] ?? [];
        const heldHints = hintsFor(sim, k).filter((h) => h.holder === id);
        const inFlight = sim.pending.find((p) => p.target === id && p.key === k);
        const isReplica = roles[i].startsWith('replica');
        const fresh = versions.length > 0 && hasAll(versions, truth);
        const outcome = op?.targets.find((t) => t.nodeId === id);
        return (
          <button
            key={id}
            onClick={() => onToggle(id)}
            aria-label={`${id}, ${roles[i]}, ${up ? 'up' : 'down'}. Click to ${up ? 'crash' : 'recover'} it.`}
            className={`min-w-0 rounded-xl p-2.5 text-left ring-1 transition-colors ${
              up
                ? 'bg-white ring-slate-200 hover:ring-slate-300 dark:bg-white/[0.03] dark:ring-white/10'
                : 'bg-rose-50 ring-rose-300 dark:bg-rose-400/[0.08] dark:ring-rose-400/40'
            }`}
          >
            <span className="flex items-baseline justify-between gap-1">
              <span className="font-mono text-sm font-semibold text-slate-900 dark:text-white">{id}</span>
              <span className={`text-xs ${up ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>{up ? 'up' : 'down'}</span>
            </span>
            <span className="block text-xs text-slate-500 dark:text-slate-400">{roles[i]}</span>
            <span className="mt-1.5 block truncate text-sm text-slate-800 dark:text-slate-100">
              {versions.length ? versions.map((v) => v.value).join(' | ') : heldHints.length ? heldHints.map((h) => h.version.value).join(' | ') : '—'}
            </span>
            <span className="mt-1.5 flex flex-wrap gap-1">
              {isReplica && versions.length > 0 && <Chip tone={fresh ? 'good' : 'wait'}>{fresh ? 'latest' : 'stale'}</Chip>}
              {isReplica && versions.length === 0 && truth.length > 0 && <Chip tone="wait">missing</Chip>}
              {inFlight && <Chip tone="wait">copy in {Math.max(0, Math.ceil((inFlight.due - now) / 1000))}s</Chip>}
              {heldHints.length > 0 && <Chip tone="wait">holds hint for {heldHints.map((h) => h.target).join(', ')}</Chip>}
            </span>
            {outcome && (
              <span className={`mt-1.5 block text-xs font-medium ${outcome.outcome === 'down' || outcome.outcome === 'partitioned' ? 'text-rose-600 dark:text-rose-400' : 'text-slate-600 dark:text-slate-300'}`}>
                last {op!.type === 'PUT' ? 'write' : 'read'}: {OUTCOME[outcome.outcome].text(outcome)}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
};

/* ---------- hash ring picture ---------- */

const CX = 190;
const CY = 190;
const R_NODE = 140;
const R_KEY = 96;
const polar = (angle: number, r: number) => ({ x: CX + r * Math.sin((angle * Math.PI) / 180), y: CY - r * Math.cos((angle * Math.PI) / 180) });

function arcPath(from: number, to: number, r: number) {
  const delta = (to - from + 360) % 360;
  const a = polar(from, r);
  const b = polar(to, r);
  return `M ${a.x} ${a.y} A ${r} ${r} 0 ${delta > 180 ? 1 : 0} 1 ${b.x} ${b.y}`;
}

const RingDiagram: React.FC<{ keys: string[]; selectedKey: string; n: number; onSelectKey: (k: string) => void }> = ({ keys, selectedKey, n, onSelectKey }) => {
  const selAngle = keyAngle(selectedKey || ' ');
  const order = ringWalk(selAngle).order.slice(0, n);
  const walked = walkUntil(selectedKey || ' ', n);
  const lastAngle = walked[walked.length - 1]?.angle ?? selAngle;
  const keyPt = polar(selAngle, R_KEY);
  return (
    <svg
      viewBox="0 0 380 380"
      className="w-full h-auto max-w-[400px] mx-auto text-slate-700 dark:text-slate-200"
      role="img"
      aria-label={`Hash ring with five servers, two positions each. Key ${selectedKey} at ${selAngle} degrees. Walking clockwise, its ${n} replica${n > 1 ? 's are' : ' is'} ${order.map((o) => o.nodeId).join(', ')}.`}
    >
      <circle cx={CX} cy={CY} r={R_NODE} fill="none" stroke="currentColor" strokeOpacity={0.2} strokeWidth={2} />
      <path d={arcPath(selAngle, lastAngle, R_NODE)} fill="none" className="stroke-indigo-500" strokeWidth={4} strokeLinecap="round" opacity={0.6} />
      <line x1={keyPt.x} y1={keyPt.y} x2={polar(selAngle, R_NODE).x} y2={polar(selAngle, R_NODE).y} className="stroke-indigo-500" strokeWidth={1.5} strokeDasharray="3 3" />
      <text x={CX} y={CY + 4} textAnchor="middle" fontSize={12} fill="currentColor" opacity={0.6}>
        clockwise →
      </text>

      {TOKENS.map((t) => {
        const p = polar(t.angle, R_NODE);
        const lp = polar(t.angle, R_NODE + 28);
        const rank = order.findIndex((o) => o.nodeId === t.nodeId && o.angle === t.angle);
        const skipped = rank < 0 && walked.some((w) => w.angle === t.angle && !w.taken);
        return (
          <g key={`${t.nodeId}-${t.angle}`}>
            <circle
              cx={p.x}
              cy={p.y}
              r={16}
              className={rank >= 0 ? 'fill-indigo-600 stroke-indigo-600' : 'fill-white stroke-slate-300 dark:fill-[#1c1c1c] dark:stroke-white/25'}
              strokeWidth={1.5}
              strokeDasharray={skipped ? '3 3' : undefined}
            />
            <text x={p.x} y={p.y + 4} textAnchor="middle" fontSize={12} fontWeight={600} className={rank >= 0 ? 'fill-white' : 'fill-slate-700 dark:fill-slate-200'}>
              {t.nodeId}
            </text>
            <text x={lp.x} y={lp.y + 4} textAnchor="middle" fontSize={11} fill="currentColor" opacity={0.6}>
              {rank >= 0 ? `#${rank + 1}` : skipped ? 'skip' : `${t.angle}°`}
            </text>
          </g>
        );
      })}

      {keys.map((k) => {
        const p = polar(keyAngle(k), R_KEY);
        const sel = k === selectedKey;
        return (
          <g key={k} onClick={() => onSelectKey(k)} className="cursor-pointer">
            <title>{`${k} at ${keyAngle(k)}°`}</title>
            <rect x={p.x - 7} y={p.y - 7} width={14} height={14} rx={3} className={sel ? 'fill-indigo-600' : 'fill-slate-400 dark:fill-slate-500'} />
          </g>
        );
      })}
      {selectedKey && !keys.includes(selectedKey) && <rect x={keyPt.x - 7} y={keyPt.y - 7} width={14} height={14} rx={3} className="fill-indigo-600" />}
      {selectedKey && (
        <text
          x={polar(selAngle, R_KEY - 26).x}
          y={polar(selAngle, R_KEY - 26).y + 4}
          textAnchor="middle"
          fontSize={12}
          fontWeight={600}
          className="fill-indigo-700 dark:fill-indigo-300"
        >
          {selectedKey} {selAngle}°
        </text>
      )}
    </svg>
  );
};

const KeyPicker: React.FC<{ keys: string[]; value: string; onChange: (k: string) => void }> = ({ keys, value, onChange }) => (
  <div className="flex flex-wrap gap-1.5">
    {keys.map((k) => (
      <button
        key={k}
        onClick={() => onChange(k)}
        aria-pressed={k === value}
        className={`rounded-lg px-2.5 py-1 text-xs font-mono ring-1 transition-colors ${
          k === value
            ? 'bg-indigo-600 text-white ring-indigo-600'
            : 'bg-white text-slate-700 ring-slate-200 hover:ring-slate-300 dark:bg-white/[0.03] dark:text-slate-200 dark:ring-white/10'
        }`}
      >
        {k}
      </button>
    ))}
  </div>
);

/* =====================================================================================
 * Lesson 1: one server
 * ===================================================================================== */

const SINGLE_CAPACITY = 6;
const SINGLE_START: [string, string][] = [
  ['user:101', 'Alice'],
  ['cart:88', '3 items'],
  ['profile:7', 'Bob'],
];

export const SingleServerLab: React.FC = () => {
  const [store, setStore] = useState<[string, string][]>(SINGLE_START);
  const [up, setUp] = useState(true);
  const [next, setNext] = useState(1);
  const [msg, setMsg] = useState<{ tone: 'success' | 'danger' | 'warning'; title: string; text: string } | null>(null);

  const add = () => {
    if (!up) return setMsg({ tone: 'danger', title: 'Write failed', text: 'The only server is down. There is no other copy and no other machine to try.' });
    if (store.length >= SINGLE_CAPACITY) return setMsg({ tone: 'danger', title: 'Out of memory', text: `All ${SINGLE_CAPACITY} slots are used. One machine has hit its ceiling, so the write is rejected.` });
    const k = `item:${next}`;
    setStore([...store, [k, `value ${next}`]]);
    setNext(next + 1);
    setMsg({ tone: 'success', title: 'Stored', text: `put("${k}") went into the in-memory hash table. Fast, but memory is filling up.` });
  };
  const get = () => {
    if (!up) return setMsg({ tone: 'danger', title: 'Read failed', text: 'The server is down, so every client fails at once.' });
    setMsg({ tone: 'success', title: 'Found', text: 'get("user:101") returned "Alice" with one memory lookup.' });
  };

  return (
    <div className="space-y-5">
      <div className={stage}>
        <div className="flex items-baseline justify-between">
          <p className={label}>Memory of the one server</p>
          <p className={`text-sm ${up ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>{up ? 'server up' : 'server down'}</p>
        </div>
        <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-2">
          {Array.from({ length: SINGLE_CAPACITY }).map((_, i) => {
            const e = store[i];
            return (
              <div
                key={i}
                className={`rounded-lg px-3 py-2 text-sm ${
                  e ? (up ? 'bg-white ring-1 ring-slate-200 dark:bg-white/[0.04] dark:ring-white/10' : 'bg-rose-50 ring-1 ring-rose-200 dark:bg-rose-400/[0.06] dark:ring-rose-400/30') : 'border-2 border-dashed border-slate-300 dark:border-white/15'
                }`}
              >
                {e ? (
                  <>
                    <span className="block font-mono text-xs text-slate-900 dark:text-white">{e[0]}</span>
                    <span className="block text-xs text-slate-500 dark:text-slate-400">{e[1]}</span>
                  </>
                ) : (
                  <span className="text-xs text-slate-500 dark:text-slate-400">free</span>
                )}
              </div>
            );
          })}
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" onClick={add}>
          <Send className="w-4 h-4" /> Add a key
        </Button>
        <Button onClick={get}>
          <Search className="w-4 h-4" /> Get user:101
        </Button>
        <Button variant={up ? 'danger' : 'secondary'} onClick={() => { setUp(!up); setMsg(null); }}>
          <Power className="w-4 h-4" /> {up ? 'Crash the server' : 'Restart the server'}
        </Button>
        <Button variant="ghost" onClick={() => { setStore(SINGLE_START); setUp(true); setNext(1); setMsg(null); }}>
          <RotateCcw className="w-4 h-4" /> Reset
        </Button>
      </div>
      {msg && (
        <Callout tone={msg.tone} title={msg.title}>
          {msg.text}
        </Callout>
      )}
    </div>
  );
};

/* =====================================================================================
 * Lesson 2: CAP (three replicas, n3 can be cut off)
 * ===================================================================================== */

type CapNode = 'n1' | 'n2' | 'n3';
interface CapRep {
  value: string;
  ver: number;
}
const CAP_ITEMS = ['pen', 'lamp', 'mug', 'desk', 'chair', 'bag'];

export const CapLab: React.FC = () => {
  const initial: CapRep = { value: '[book]', ver: 1 };
  const [mode, setMode] = usePersistentState<'CP' | 'AP'>('chapter6:lab:cap:mode', 'CP');
  const [partitioned, setPartitioned] = useState(false);
  const [reps, setReps] = useState<Record<CapNode, CapRep>>({ n1: initial, n2: initial, n3: initial });
  const [dirty, setDirty] = useState({ main: false, iso: false });
  const [conflict, setConflict] = useState<{ main: CapRep; iso: CapRep } | null>(null);
  const [msg, setMsg] = useState<{ tone: 'success' | 'warning' | 'danger' | 'info'; title: string; text: string } | null>(null);
  const [counter, setCounter] = useState(0);
  const maxVer = Math.max(reps.n1.ver, reps.n2.ver, reps.n3.ver);

  const write = (target: CapNode) => {
    const value = `[book, ${CAP_ITEMS[counter % CAP_ITEMS.length]}]`;
    setCounter(counter + 1);
    const nv: CapRep = { value, ver: maxVer + 1 };
    if (!partitioned) {
      setReps({ n1: nv, n2: nv, n3: nv });
      setMsg({ tone: 'success', title: 'Write accepted everywhere', text: `No partition, so the write via ${target} reached all three replicas.` });
    } else if (mode === 'CP') {
      setMsg({ tone: 'danger', title: 'Write rejected (CP)', text: `n3 cannot be reached, so the write via ${target} is refused to keep all replicas identical. The client gets an error.` });
    } else {
      const side: CapNode[] = target === 'n3' ? ['n3'] : ['n1', 'n2'];
      setReps({ ...reps, ...Object.fromEntries(side.map((s) => [s, nv])) });
      setDirty(target === 'n3' ? { ...dirty, iso: true } : { ...dirty, main: true });
      setMsg({ tone: 'warning', title: 'Write accepted (AP)', text: `Stored on ${side.join(' and ')}. ${target === 'n3' ? 'n1 and n2 are' : 'n3 is'} now stale until the partition heals.` });
    }
  };

  const read = () => {
    if (partitioned && mode === 'CP') return setMsg({ tone: 'danger', title: 'Read refused (CP)', text: 'n3 is cut off and cannot confirm it has the latest value, so it returns an error.' });
    const r = reps.n3;
    setMsg(
      r.ver < maxVer
        ? { tone: 'warning', title: 'Stale read', text: `n3 answered ${r.value}, but a newer cart exists on the other side of the partition.` }
        : { tone: 'success', title: 'Latest value', text: `n3 answered ${r.value}.` }
    );
  };

  const toggle = () => {
    if (partitioned) {
      if (dirty.main && dirty.iso) {
        setConflict({ main: reps.n1, iso: reps.n3 });
        setMsg({ tone: 'warning', title: 'Healed, with a conflict', text: 'Both sides accepted different writes. Something has to reconcile them.' });
      } else if (dirty.main || dirty.iso) {
        const newest = dirty.main ? reps.n1 : reps.n3;
        setReps({ n1: newest, n2: newest, n3: newest });
        setMsg({ tone: 'success', title: 'Healed', text: 'The newer data was copied to the stale side. All replicas agree again.' });
      } else setMsg({ tone: 'info', title: 'Healed', text: 'No writes happened during the partition, so there was nothing to sync.' });
      setDirty({ main: false, iso: false });
    } else setMsg(null);
    setPartitioned(!partitioned);
  };

  const resolve = (pick: CapRep) => {
    setReps({ n1: pick, n2: pick, n3: pick });
    setConflict(null);
    setMsg({ tone: 'info', title: 'One write was thrown away', text: 'Without versioning you can only keep one side. Lesson 7 shows how vector clocks let the client merge both.' });
  };

  const pos: Record<CapNode, { x: number; y: number }> = { n1: { x: 80, y: 55 }, n2: { x: 80, y: 165 }, n3: { x: 300, y: 110 } };

  return (
    <div className="space-y-5">
      <div className={stage}>
        <svg viewBox="0 0 380 220" className="w-full h-auto text-slate-700 dark:text-slate-200" role="img" aria-label={`Three replicas. ${partitioned ? 'The link to n3 is cut.' : 'All links are up.'}`}>
          <line x1={80} y1={55} x2={80} y2={165} stroke="currentColor" strokeOpacity={0.35} strokeWidth={2} />
          {(['n1', 'n2'] as CapNode[]).map((id) => (
            <line key={id} x1={pos[id].x} y1={pos[id].y} x2={300} y2={110} className={partitioned ? 'stroke-rose-500' : 'stroke-slate-400'} strokeWidth={2} strokeDasharray={partitioned ? '4 6' : undefined} />
          ))}
          {partitioned && (
            <text x={200} y={100} textAnchor="middle" fontSize={12} className="fill-rose-600 dark:fill-rose-400">
              partition
            </text>
          )}
          {(Object.keys(pos) as CapNode[]).map((id) => {
            const stale = reps[id].ver < maxVer;
            return (
              <g key={id}>
                <rect x={pos[id].x - 62} y={pos[id].y - 24} width={124} height={48} rx={10} className={`fill-white dark:fill-[#1c1c1c] ${stale ? 'stroke-amber-500' : 'stroke-slate-300 dark:stroke-white/20'}`} strokeWidth={stale ? 2 : 1.5} />
                <text x={pos[id].x} y={pos[id].y - 5} textAnchor="middle" fontSize={12} fontWeight={600} fill="currentColor">
                  {id}
                  {stale ? ' (stale)' : ''}
                </text>
                <text x={pos[id].x} y={pos[id].y + 13} textAnchor="middle" fontSize={11} fill="currentColor" opacity={0.75}>
                  {reps[id].value}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Segmented
          label="During a partition"
          value={mode}
          onChange={setMode}
          options={[
            { value: 'CP', label: 'CP: consistency' },
            { value: 'AP', label: 'AP: availability' },
          ]}
        />
        <Button variant={partitioned ? 'secondary' : 'danger'} onClick={toggle}>
          <Scissors className="w-4 h-4" /> {partitioned ? 'Heal the partition' : 'Cut the link to n3'}
        </Button>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" onClick={() => write('n1')}>
          <Send className="w-4 h-4" /> Write via n1
        </Button>
        <Button onClick={() => write('n3')}>
          <Send className="w-4 h-4" /> Write via n3
        </Button>
        <Button onClick={read}>
          <Search className="w-4 h-4" /> Read from n3
        </Button>
      </div>
      {msg && (
        <Callout tone={msg.tone} title={msg.title}>
          {msg.text}
        </Callout>
      )}
      {conflict && (
        <div className="flex flex-wrap items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
          <span>Keep:</span>
          <Button onClick={() => resolve(conflict.main)}>n1/n2’s {conflict.main.value}</Button>
          <Button onClick={() => resolve(conflict.iso)}>n3’s {conflict.iso.value}</Button>
        </div>
      )}
    </div>
  );
};

/* =====================================================================================
 * Lessons 3 and 4: the ring (partitioning with N = 1, replication with N slider)
 * ===================================================================================== */

const RING_KEYS = SEED.map(([k]) => k);

export const RingLab: React.FC<{ replication?: boolean }> = ({ replication = false }) => {
  const [k, setK] = usePersistentState<string>(`chapter6:lab:ring:${replication ? 'rep' : 'part'}:key`, 'user:101');
  const [nSetting, setN] = usePersistentState<number>('chapter6:lab:ring:n', 3);
  const n = replication ? nSetting : 1;
  const steps = walkUntil(k, n);
  const pref = preferenceList(k, n);
  const hasSkip = steps.some((s) => !s.taken);

  return (
    <div className="space-y-5">
      <div className={stage}>
        <RingDiagram keys={RING_KEYS} selectedKey={k} n={n} onSelectKey={setK} />
      </div>
      <KeyPicker keys={RING_KEYS} value={k} onChange={setK} />
      {replication && <Slider label="N: copies of each key" value={n} min={1} max={5} onChange={setN} />}
      <p className={muted}>
        Walk clockwise from {keyAngle(k)}°:{' '}
        {steps.map((st, i) => (
          <span key={i} className={`font-mono ${st.taken ? 'text-slate-900 dark:text-white' : 'line-through text-slate-400'}`}>
            {st.nodeId} at {st.angle}°{i < steps.length - 1 ? ' → ' : ''}
          </span>
        ))}
      </p>
      {replication ? (
        <Callout tone={hasSkip ? 'idea' : 'success'} title={`Replicas of ${k}: ${pref.join(', ')}`}>
          {hasSkip
            ? 'The walk passed a second position of a server already on the list and skipped it, so the N copies land on N different machines.'
            : `The first ${n} distinct servers clockwise hold the copies. ${n > 1 ? `Any ${n - 1} of them can crash and the key is still readable.` : 'One crash makes this key unavailable.'}`}
        </Callout>
      ) : (
        <Callout tone="success" title={`${k} is stored on ${pref[0]}`}>
          {pref[0]} owns the first position clockwise from the key ({steps[0].angle}°). Distance does not matter: only the clockwise direction does.
        </Callout>
      )}
    </div>
  );
};

/* =====================================================================================
 * Lessons 5 and 6: quorum on one key
 * ===================================================================================== */

const QKEY = 'user:101';
const Q_PREF = preferenceList(QKEY, 3);
const Q_ROLES = Q_PREF.map((_, i) => `replica #${i + 1}`);

function useVersionName(base: string) {
  const [v, setV] = useState(2);
  return () => {
    setV(v + 1);
    return `${base} v${v}`;
  };
}

export const QuorumLab: React.FC = () => {
  const [sim, setSim] = useSim();
  const [w, setW] = usePersistentState<number>('chapter6:lab:quorum:w', 2);
  const [r, setR] = usePersistentState<number>('chapter6:lab:quorum:r', 2);
  const nextValue = useVersionName('Alice');
  const ctx: Ctx = { n: 3, w, r, cap: 'CP', sloppy: false, readRepair: true };
  const op = sim.lastOp;
  const up = Q_PREF.filter((id) => isReachable(sim, id)).length;
  const overlap = w + r - 3;

  return (
    <div className="space-y-5">
      <div className={stage}>
        <p className={label}>The 3 replicas of {QKEY}. Click one to crash or recover it.</p>
        <div className="mt-3">
          <ServerBoxes sim={sim} k={QKEY} ids={Q_PREF} roles={Q_ROLES} onToggle={(id) => setSim((s) => toggleCrash(s, id))} />
        </div>
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        <Slider label="W: acks a write waits for" value={w} min={1} max={3} onChange={setW} />
        <Slider label="R: replies a read waits for" value={r} min={1} max={3} onChange={setR} />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" onClick={() => setSim((s) => doPut(s, ctx, QKEY, nextValue()))}>
          <Send className="w-4 h-4" /> Put a new value
        </Button>
        <Button onClick={() => setSim((s) => doGet(s, ctx, QKEY))}>
          <Search className="w-4 h-4" /> Get
        </Button>
        <Button variant="ghost" onClick={() => setSim(createInitialSim())}>
          <RotateCcw className="w-4 h-4" /> Reset
        </Button>
      </div>
      {op && (
        <Callout tone={!op.ok ? 'danger' : op.stale ? 'warning' : 'success'} title={`${op.type === 'PUT' ? 'Write' : 'Read'} ${op.ok ? 'succeeded' : 'failed'}: ${op.got} of ${op.needed} ${op.type === 'PUT' ? 'acks' : 'replies'}`}>
          {op.summary}
        </Callout>
      )}
      <div className="grid grid-cols-3 gap-3">
        <Stat label="Replicas up" value={`${up}/3`} tone={up === 3 ? 'neutral' : 'bad'} />
        <Stat label="W + R" value={w + r} hint={overlap > 0 ? '> N = 3' : '≤ N = 3'} tone={overlap > 0 ? 'good' : 'bad'} />
        <Stat label="Overlap" value={Math.max(0, overlap)} hint="replicas in both sets" />
      </div>
    </div>
  );
};

/** Put, then read immediately, while the other copies are still on their way. */
export const StaleReadLab: React.FC = () => {
  const [sim, setSim] = useSim();
  const [preset, setPreset] = usePersistentState<'weak' | 'strong'>('chapter6:lab:stale:preset', 'weak');
  const nextValue = useVersionName('Alice');
  const w = preset === 'weak' ? 1 : 2;
  const r = w;
  const ctx: Ctx = { n: 3, w, r, cap: 'CP', sloppy: false, readRepair: false };
  const op = sim.lastOp;
  const inFlight = sim.pending.filter((p) => p.key === QKEY).length;

  return (
    <div className="space-y-5">
      <Segmented
        label="Quorum setting"
        value={preset}
        onChange={(v) => {
          setPreset(v);
          setSim(createInitialSim());
        }}
        options={[
          { value: 'weak', label: 'W = 1, R = 1' },
          { value: 'strong', label: 'W = 2, R = 2' },
        ]}
      />
      <div className={stage}>
        <p className={label}>The 3 replicas of {QKEY}</p>
        <div className="mt-3">
          <ServerBoxes sim={sim} k={QKEY} ids={Q_PREF} roles={Q_ROLES} onToggle={(id) => setSim((s) => toggleCrash(s, id))} />
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" onClick={() => setSim((s) => doPut(s, ctx, QKEY, nextValue()))}>
          <Send className="w-4 h-4" /> Put a new value
        </Button>
        <Button onClick={() => setSim((s) => doGet(s, ctx, QKEY))}>
          <Search className="w-4 h-4" /> Read right away
        </Button>
      </div>
      {op?.type === 'GET' && op.ok ? (
        op.stale ? (
          <Callout tone="warning" title="Stale read">
            The read asked {r} replica{r > 1 ? 's' : ''} and none had the new value yet. W + R = {w + r} is not more than N = 3, so the read set and the write set did not overlap.
            Wait for the background copies and read again: that is eventual consistency.
          </Callout>
        ) : (
          <Callout tone="success" title="Latest value">
            {inFlight > 0 && w + r > 3
              ? `Even with ${inFlight} cop${inFlight > 1 ? 'ies' : 'y'} still in flight, W + R = ${w + r} > 3 forces the read to include a replica that acked the write.`
              : 'Every replica read had the newest version.'}
          </Callout>
        )
      ) : (
        op && (
          <Callout tone={op.ok ? 'info' : 'danger'} title={op.type === 'PUT' ? 'Write done' : 'Read failed'}>
            {op.summary}
          </Callout>
        )
      )}
      <div className="grid grid-cols-2 gap-3">
        <Stat label="Copies still in flight" value={inFlight} />
        <Stat label="W + R vs N" value={`${w + r} ${w + r > 3 ? '>' : '≤'} 3`} tone={w + r > 3 ? 'good' : 'bad'} />
      </div>
    </div>
  );
};

/* =====================================================================================
 * Lesson 7: vector clocks, the book's D1 to D5 example
 * ===================================================================================== */

function relation(a: VCVersion, b: VCVersion): { tone: 'success' | 'warning' | 'info'; text: string } {
  const c = compareClocks(a.clock, b.clock);
  if (c === 'equal') return { tone: 'info', text: `${a.id} and ${b.id} have identical clocks.` };
  if (c === 'before' || c === 'after') {
    const [x, y] = c === 'before' ? [a, b] : [b, a];
    return { tone: 'success', text: `${x.id} is an ancestor of ${y.id}: every counter in ${y.id} is at least the matching counter in ${x.id}. ${y.id} can safely replace ${x.id}.` };
  }
  const keys = [...new Set([...Object.keys(a.clock), ...Object.keys(b.clock)])];
  const ka = keys.find((k) => (a.clock[k] ?? 0) > (b.clock[k] ?? 0))!;
  const kb = keys.find((k) => (b.clock[k] ?? 0) > (a.clock[k] ?? 0))!;
  return {
    tone: 'warning',
    text: `${a.id} and ${b.id} conflict: ${a.id} has ${ka}:${a.clock[ka]} (vs ${b.clock[ka] ?? 0}), but ${b.id} has ${kb}:${b.clock[kb]} (vs ${a.clock[kb] ?? 0}). Neither descends from the other, so both are kept as siblings.`,
  };
}

export const VectorClockLab: React.FC = () => {
  const [history, setHistory] = useState<VCVersion[]>([]);
  const [cmpA, setCmpA] = useState('D3');
  const [cmpB, setCmpB] = useState('D4');
  const step = history.length;
  const heads = vcHeads(history);
  const conflict = heads.length > 1;
  const done = step === 5;

  const nextStep = () => {
    if (step < BOOK_STEPS.length) {
      const s = BOOK_STEPS[step];
      setHistory(vcWrite(history, s.parents, s.server, s.value));
    }
  };
  const reconcile = () => setHistory(vcWrite(history, heads.map((h) => h.id), 'Sx', 'name=johnSF+NY'));
  const byId = (id: string) => history.find((h) => h.id === id);
  const a = byId(cmpA);
  const b = byId(cmpB);

  const caption =
    step === 0
      ? 'No versions yet. Press Next step to start the book’s example.'
      : step <= BOOK_STEPS.length
      ? BOOK_STEPS[step - 1].text
      : 'A client read both siblings, merged them, and wrote D5 through Sx. Its clock takes the larger counter from each parent and bumps Sx.';

  return (
    <div className="space-y-5">
      <div className={stage}>
        <p className={label}>Versions of data item D</p>
        {history.length === 0 && <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">Empty.</p>}
        <ol className="mt-3 space-y-2">
          {history.map((h) => {
            const live = heads.some((x) => x.id === h.id);
            return (
              <li
                key={h.id}
                className={`rounded-lg px-3 py-2 ring-1 ${
                  live
                    ? conflict
                      ? 'bg-amber-50 ring-amber-300 dark:bg-amber-400/[0.08] dark:ring-amber-400/40'
                      : 'bg-emerald-50 ring-emerald-300 dark:bg-emerald-400/[0.08] dark:ring-emerald-400/40'
                    : 'bg-white ring-slate-200 dark:bg-white/[0.03] dark:ring-white/10'
                }`}
              >
                <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <span className="font-mono text-sm font-semibold text-slate-900 dark:text-white">{fmtClock(h.clock, h.id)}</span>
                  <span className="text-xs text-slate-500 dark:text-slate-400">{live ? (conflict ? 'sibling' : 'current') : 'replaced'}</span>
                </div>
                <span className="text-xs text-slate-600 dark:text-slate-300">
                  {h.value}, written via {h.server}
                  {h.from.length ? `, based on ${h.from.join(' + ')}` : ''}
                </span>
              </li>
            );
          })}
        </ol>
      </div>
      <p className={muted}>{caption}</p>
      <div className="flex flex-wrap gap-2">
        {!conflict && step < BOOK_STEPS.length && (
          <Button variant="primary" onClick={nextStep}>
            <StepForward className="w-4 h-4" /> Next step
          </Button>
        )}
        {conflict && (
          <Button variant="primary" onClick={reconcile}>
            <GitMerge className="w-4 h-4" /> Reconcile via Sx
          </Button>
        )}
        <Button variant="ghost" onClick={() => { setHistory([]); setCmpA('D3'); setCmpB('D4'); }}>
          <RotateCcw className="w-4 h-4" /> Start over
        </Button>
      </div>
      {conflict && byId('D3') && byId('D4') && <Callout tone="warning" title="Conflict detected">{relation(byId('D3')!, byId('D4')!).text}</Callout>}
      {done && (
        <Callout tone="success" title={`${fmtClock(history[4].clock, 'D5')}`}>
          Matches the book. D5 descends from both D3 and D4, so it replaces them and the conflict is gone.
        </Callout>
      )}
      {history.length >= 2 && (
        <details className="rounded-xl ring-1 ring-slate-200 dark:ring-white/10 [&_summary::-webkit-details-marker]:hidden">
          <summary className="cursor-pointer select-none px-4 py-3 text-sm font-medium text-slate-700 dark:text-slate-200">Compare any two versions</summary>
          <div className="px-4 pb-4 space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              {[
                [cmpA, setCmpA],
                [cmpB, setCmpB],
              ].map(([val, set], i) => (
                <React.Fragment key={i}>
                  {i === 1 && <span className="text-slate-500 dark:text-slate-400">vs</span>}
                  <select
                    value={val as string}
                    onChange={(e) => (set as (v: string) => void)(e.target.value)}
                    className="rounded-lg px-2 py-1.5 text-sm font-mono ring-1 ring-slate-300 bg-white text-slate-900 dark:bg-white/[0.06] dark:ring-white/15 dark:text-white"
                  >
                    {history.map((h) => (
                      <option key={h.id}>{h.id}</option>
                    ))}
                  </select>
                </React.Fragment>
              ))}
            </div>
            {a && b && <p className={muted}>{relation(a, b).text}</p>}
          </div>
        </details>
      )}
    </div>
  );
};

/* =====================================================================================
 * Lesson 8: gossip membership list
 * ===================================================================================== */

export const GossipLab: React.FC = () => {
  const [sim, setSim] = useSim();
  return (
    <div className="space-y-5">
      <div className={stage}>
        <p className={label}>s0’s membership list. One gossip round per second.</p>
        <ul className="mt-3 space-y-2">
          {NODES.map((nd) => {
            const since = sim.tick - sim.seen[nd.id].at;
            const st = since >= OFFLINE_TICKS ? 'offline' : since >= SUSPECT_TICKS ? 'suspect' : 'alive';
            return (
              <li key={nd.id} className="flex items-center gap-3 rounded-lg bg-white px-3 py-2 ring-1 ring-slate-200 dark:bg-white/[0.03] dark:ring-white/10">
                <span className="w-7 font-mono text-sm font-semibold text-slate-900 dark:text-white">{nd.id}</span>
                <span className="w-20 text-xs text-slate-500 dark:text-slate-400">
                  heartbeat <span className="font-mono text-slate-900 dark:text-white">{sim.seen[nd.id].hb}</span>
                </span>
                <span className="flex-1 flex gap-0.5" aria-label={`${since} rounds since its counter increased`}>
                  {Array.from({ length: OFFLINE_TICKS }).map((_, i) => (
                    <span
                      key={i}
                      className={`h-2 flex-1 rounded-full ${
                        i < Math.min(since, OFFLINE_TICKS) ? (since >= OFFLINE_TICKS ? 'bg-rose-500' : since >= SUSPECT_TICKS ? 'bg-amber-400' : 'bg-slate-300 dark:bg-white/20') : 'bg-slate-200 dark:bg-white/10'
                      }`}
                    />
                  ))}
                </span>
                <Chip tone={st === 'alive' ? 'good' : st === 'suspect' ? 'wait' : 'bad'}>{st}</Chip>
              </li>
            );
          })}
        </ul>
        <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
          The bar fills while a member’s counter stays the same: suspect after {SUSPECT_TICKS} rounds, offline after {OFFLINE_TICKS}.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {NODES.filter((nd) => nd.id !== 's0').map((nd) => {
          const down = sim.status[nd.id] === 'crashed';
          return (
            <Button key={nd.id} variant={down ? 'secondary' : 'danger'} onClick={() => setSim((s) => toggleCrash(s, nd.id))}>
              <Power className="w-4 h-4" /> {down ? `Recover ${nd.id}` : `Crash ${nd.id}`}
            </Button>
          );
        })}
      </div>
    </div>
  );
};

/* =====================================================================================
 * Lesson 9: sloppy quorum and hinted handoff
 * ===================================================================================== */

const H_ORDER = clockwiseServers(keyAngle(QKEY));
const H_ROLES = H_ORDER.map((_, i) => (i < 3 ? `replica #${i + 1}` : 'next clockwise'));

export const HintedHandoffLab: React.FC = () => {
  const [sim, setSim] = useSim();
  const [mode, setMode] = usePersistentState<'strict' | 'sloppy'>('chapter6:lab:hinted:mode', 'strict');
  const nextValue = useVersionName('Alice');
  const ctx: Ctx = { n: 3, w: 2, r: 2, cap: mode === 'sloppy' ? 'AP' : 'CP', sloppy: mode === 'sloppy', readRepair: true };
  const op = sim.lastOp;
  const handoff = sim.notes.find((x) => x.startsWith('Hinted handoff'));
  const hints = sim.hints.length;
  const down = H_ORDER.slice(0, 3).filter((id) => !isReachable(sim, id)).length;

  return (
    <div className="space-y-5">
      <Segmented
        label="Quorum type"
        value={mode}
        onChange={setMode}
        options={[
          { value: 'strict', label: 'Strict quorum' },
          { value: 'sloppy', label: 'Sloppy quorum' },
        ]}
      />
      <div className={stage}>
        <p className={label}>All 5 servers in clockwise order from {QKEY}. N = 3, W = 2. Click a server to crash or recover it.</p>
        <div className="mt-3">
          <ServerBoxes sim={sim} k={QKEY} ids={H_ORDER} roles={H_ROLES} cols="grid-cols-2 sm:grid-cols-5" onToggle={(id) => setSim((s) => toggleCrash(s, id))} />
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" onClick={() => setSim((s) => doPut(s, ctx, QKEY, nextValue()))}>
          <Send className="w-4 h-4" /> Put a new value
        </Button>
        <Button variant="ghost" onClick={() => setSim(createInitialSim())}>
          <RotateCcw className="w-4 h-4" /> Reset
        </Button>
      </div>
      {handoff && hints === 0 && op?.targets.some((t) => t.outcome === 'hint') ? (
        <Callout tone="success" title="Hints handed back">
          {handoff} The recovered replica now has the write it missed.
        </Callout>
      ) : (
        op && (
          <Callout tone={!op.ok ? 'danger' : op.targets.some((t) => t.outcome === 'hint') ? 'warning' : 'success'} title={op.ok ? `Write succeeded: ${op.got} of W = 2 acks` : `Write rejected: ${op.got} of W = 2 possible`}>
            {op.summary}
          </Callout>
        )
      )}
      <div className="grid grid-cols-2 gap-3">
        <Stat label="Replicas down" value={`${down}/3`} tone={down ? 'bad' : 'neutral'} />
        <Stat label="Hints held" value={hints} />
      </div>
    </div>
  );
};

/* =====================================================================================
 * Lesson 10: Merkle trees
 * ===================================================================================== */

const [MA, MB] = MERKLE_PAIR;

export const MerkleLab: React.FC = () => {
  const [sim, setSim] = useSim(MERKLE_SEED, false);
  const [miss, setMiss] = useState(0);
  const [result, setResult] = useState<string | null>(null);
  const keys = sharedKeys(sim, MA, MB, 3);
  const ta = buildMerkle(sim.replicas[MA] ?? {}, keys);
  const tb = buildMerkle(sim.replicas[MB] ?? {}, keys);
  const cmp = compareMerkle(ta, tb);
  const diffBuckets = cmp.leafDiff.filter(Boolean).length;
  const toMove = cmp.leafDiff.reduce((acc, d, j) => acc + (d ? ta.buckets[j].length : 0), 0);

  const wipe = () => {
    setSim({ ...sim, replicas: { ...sim.replicas, [MB]: {} } });
    setResult(null);
  };
  const missWrite = () => {
    const k = keys[(miss * 5) % keys.length];
    const cur = sim.replicas[MA]?.[k] ?? [];
    const clock = mergeClocks(cur.map((v) => v.clock));
    setSim(storeVersion(sim, MA, k, { value: `new ${miss + 1}`, clock: { ...clock, [MA]: (clock[MA] ?? 0) + 1 } }));
    setMiss(miss + 1);
    setResult(null);
  };
  const sync = () => {
    const r = merkleSync(sim, MA, MB, 3);
    setSim(r.state);
    setResult(`Synced ${r.moved} of ${r.total} shared keys, only the ones in the ${diffBuckets} differing bucket${diffBuckets === 1 ? '' : 's'}. The roots match again.`);
  };

  const cell = (hash: string, compared: boolean, diff: boolean, text: string) => (
    <div
      className={`min-w-0 rounded-lg px-1.5 py-1.5 text-center ${
        !compared ? 'bg-slate-100 text-slate-500 dark:bg-white/[0.03] dark:text-slate-400' : diff ? 'bg-rose-100 text-rose-800 dark:bg-rose-400/15 dark:text-rose-200' : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-400/15 dark:text-emerald-200'
      }`}
      title={compared ? (diff ? 'hashes differ' : 'hashes match') : 'not compared: its parent matched'}
    >
      <span className="block text-[11px] truncate">{text}</span>
      <span className="block font-mono text-xs font-semibold truncate">{hash}</span>
    </div>
  );
  const tree = (t: typeof ta, id: string) => (
    <div className="space-y-2">
      <p className="text-sm font-semibold text-slate-900 dark:text-white">{id}’s tree</p>
      {cell(t.root, true, cmp.rootDiff, 'root')}
      <div className="grid grid-cols-2 gap-1.5">{t.mids.map((m, i) => <React.Fragment key={i}>{cell(m, cmp.rootDiff, cmp.midDiff[i], i === 0 ? '0–180°' : '180–360°')}</React.Fragment>)}</div>
      <div className="grid grid-cols-4 gap-1.5">
        {t.leaves.map((l, j) => (
          <div key={j}>
            {cell(l, cmp.leafCompared[j], cmp.leafDiff[j], `${BUCKETS[j][0]}°+`)}
            <p className="mt-0.5 text-center text-[11px] text-slate-500 dark:text-slate-400">{t.buckets[j].length} keys</p>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className="space-y-5">
      <div className={`${stage} grid gap-5 sm:grid-cols-2`}>
        {tree(ta, MA)}
        {tree(tb, MB)}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="danger" onClick={wipe}>
          <Eraser className="w-4 h-4" /> Wipe {MB}’s disk
        </Button>
        <Button onClick={missWrite}>
          <Send className="w-4 h-4" /> {MB} misses a write
        </Button>
        <Button variant="primary" disabled={!cmp.rootDiff} onClick={sync}>
          <RefreshCw className="w-4 h-4" /> Sync differing buckets
        </Button>
        <Button variant="ghost" onClick={() => { setSim(createInitialSim(MERKLE_SEED)); setResult(null); setMiss(0); }}>
          <RotateCcw className="w-4 h-4" /> Reset
        </Button>
      </div>
      {result ? (
        <Callout tone="success" title="In sync">
          {result}
        </Callout>
      ) : cmp.rootDiff ? (
        <Callout tone="warning" title="Roots differ">
          Walking down only where hashes differ took {cmp.comparisons} comparisons and found {diffBuckets} of 4 buckets out of sync. Syncing moves {toMove} of {keys.length} keys.
        </Callout>
      ) : (
        <Callout tone="success" title="Roots match">
          One comparison proves all {keys.length} keys that {MA} and {MB} share are identical. Nothing to transfer.
        </Callout>
      )}
      <div className="grid grid-cols-3 gap-3">
        <Stat label="Comparisons" value={cmp.comparisons} />
        <Stat label="Buckets differ" value={`${diffBuckets}/4`} tone={diffBuckets ? 'bad' : 'good'} />
        <Stat label="Keys to move" value={`${toMove}/${keys.length}`} />
      </div>
    </div>
  );
};

/* =====================================================================================
 * Lessons 11 and 12: one node's write path and read path
 * ===================================================================================== */

const WRITE_KEYS = ['apple', 'banana', 'cherry', 'date', 'elder', 'fig', 'grape', 'kiwi', 'lemon'];

const TableRow: React.FC<{ id: number; entries: [string, string][]; bits?: boolean[]; mark?: number[]; verdict?: ReadStep['verdict'] }> = ({ id, entries, bits, mark = [], verdict }) => (
  <div className="rounded-lg bg-white px-3 py-2 ring-1 ring-slate-200 dark:bg-white/[0.03] dark:ring-white/10 space-y-1.5">
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <span className="font-mono text-sm font-semibold text-slate-900 dark:text-white">SST-{id}</span>
      {verdict && (
        <Chip tone={verdict === 'hit' ? 'good' : verdict === 'skip' ? 'none' : 'wait'}>
          {verdict === 'hit' ? 'read from disk: found' : verdict === 'skip' ? 'skipped: definitely not here' : 'read from disk: not here (false positive)'}
        </Chip>
      )}
    </div>
    <p className="font-mono text-xs text-slate-600 dark:text-slate-300 break-words">{entries.map(([k]) => k).join(', ')}</p>
    {bits && (
      <div className="flex gap-0.5" aria-label={`Bloom filter of SST-${id}`}>
        {bits.map((b, i) => (
          <span
            key={i}
            className={`h-4 flex-1 rounded-sm ${b ? 'bg-indigo-500' : 'bg-slate-200 dark:bg-white/10'} ${mark.includes(i) ? 'ring-2 ring-amber-500 ring-offset-1 ring-offset-white dark:ring-offset-[#1c1c1c]' : ''}`}
          />
        ))}
      </div>
    )}
  </div>
);

export const WritePathLab: React.FC = () => {
  const [st, setSt] = useState<StorageState>(EMPTY_STORAGE);
  const [i, setI] = useState(0);
  const [msg, setMsg] = useState<{ tone: 'success' | 'info' | 'danger'; title: string; text: string } | null>(null);

  const write = () => {
    const k = WRITE_KEYS[i % WRITE_KEYS.length];
    const r = storagePut(st, k, String(i + 1));
    setSt(r.state);
    setI(i + 1);
    setMsg(
      r.flushed
        ? { tone: 'info', title: `Memtable flushed to SST-${r.flushed}`, text: `The memtable reached ${MEMTABLE_LIMIT} keys, so it was written to disk as a sorted SSTable and the commit log was cleared.` }
        : { tone: 'success', title: `${k} written`, text: 'Appended to the commit log on disk first, then put in the memtable in memory.' }
    );
  };
  const crash = () => {
    const r = storageCrash(st);
    setSt(r.state);
    setMsg({ tone: r.lost ? 'success' : 'info', title: 'Crashed and restarted', text: r.lost ? `The ${r.lost} key(s) in memory were lost, then rebuilt by replaying ${r.replayed} commit-log entr${r.replayed === 1 ? 'y' : 'ies'}. Nothing lost.` : 'The memtable was empty, so there was nothing to recover.' });
  };

  const col = 'rounded-lg bg-white p-3 ring-1 ring-slate-200 dark:bg-white/[0.03] dark:ring-white/10 min-h-[96px]';
  return (
    <div className="space-y-5">
      <div className={`${stage} grid gap-3 sm:grid-cols-3`}>
        <div className={col}>
          <p className={label}>1. Commit log (disk)</p>
          <ol className="mt-2 space-y-0.5 font-mono text-xs text-slate-800 dark:text-slate-100">
            {st.commitLog.length === 0 && <li className="text-slate-500 dark:text-slate-400">empty</li>}
            {st.commitLog.map(([k, v], j) => (
              <li key={j}>
                {k}={v}
              </li>
            ))}
          </ol>
        </div>
        <div className={col}>
          <p className={label}>
            2. Memtable (memory) {Object.keys(st.memtable).length}/{MEMTABLE_LIMIT}
          </p>
          <div className="mt-2 space-y-1">
            {Array.from({ length: MEMTABLE_LIMIT }).map((_, j) => {
              const e = Object.entries(st.memtable)[j];
              return (
                <div key={j} className={`h-6 rounded px-2 font-mono text-xs leading-6 ${e ? 'bg-indigo-100 text-indigo-900 dark:bg-indigo-400/15 dark:text-indigo-100' : 'border border-dashed border-slate-300 dark:border-white/15'}`}>
                  {e ? `${e[0]}=${e[1]}` : ''}
                </div>
              );
            })}
          </div>
        </div>
        <div className={col}>
          <p className={label}>3. SSTables (disk)</p>
          <ul className="mt-2 space-y-1 font-mono text-xs text-slate-800 dark:text-slate-100">
            {st.sstables.length === 0 && <li className="text-slate-500 dark:text-slate-400">none yet</li>}
            {st.sstables.map((t) => (
              <li key={t.id}>
                SST-{t.id}: {t.entries.map(([k]) => k).join(', ')}
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" onClick={write}>
          <Send className="w-4 h-4" /> Write {WRITE_KEYS[i % WRITE_KEYS.length]}
        </Button>
        <Button variant="danger" onClick={crash}>
          <Power className="w-4 h-4" /> Crash and restart
        </Button>
        <Button variant="ghost" onClick={() => { setSt(EMPTY_STORAGE); setI(0); setMsg(null); }}>
          <RotateCcw className="w-4 h-4" /> Reset
        </Button>
      </div>
      {msg && (
        <Callout tone={msg.tone} title={msg.title}>
          {msg.text}
        </Callout>
      )}
    </div>
  );
};

const READ_KEYS = ['mango', 'apple', 'fig', 'kiwi', 'peach', 'zebra'];

export const ReadPathLab: React.FC = () => {
  const st = STORAGE_SEED;
  const [k, setK] = useState<string | null>(null);
  const res = k ? storageGet(st, k) : null;
  const verdictFor = (id: number) => res?.steps.find((s) => s.table === id)?.verdict;
  const mem = Object.entries(st.memtable);

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <p className={label}>Read a key</p>
        <KeyPicker keys={READ_KEYS} value={k ?? ''} onChange={setK} />
      </div>
      <div className={`${stage} space-y-2`}>
        <div className="flex flex-wrap items-baseline justify-between gap-2 rounded-lg bg-white px-3 py-2 ring-1 ring-slate-200 dark:bg-white/[0.03] dark:ring-white/10">
          <span className="text-sm font-semibold text-slate-900 dark:text-white">Memtable</span>
          <span className="font-mono text-xs text-slate-600 dark:text-slate-300">{mem.map(([x]) => x).join(', ') || 'empty'}</span>
          {res && <Chip tone={res.steps[0].verdict === 'hit' ? 'good' : 'none'}>{res.steps[0].verdict === 'hit' ? 'found in memory' : 'not here'}</Chip>}
        </div>
        {st.sstables.map((t) => (
          <TableRow key={t.id} id={t.id} entries={t.entries} bits={t.bits} mark={k ? bloomPositions(k) : []} verdict={res && res.steps[0].verdict !== 'hit' ? verdictFor(t.id) : undefined} />
        ))}
        {k && (
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Amber rings: the 2 bits “{k}” hashes to ({bloomPositions(k).join(', ')}). All set means maybe here; any empty bit means definitely not.
          </p>
        )}
      </div>
      {res && (
        <Callout tone={res.value !== null ? 'success' : 'info'} title={res.value !== null ? `${k} = ${res.value}` : `${k} not found`}>
          {res.diskReads === 0 && res.value !== null
            ? 'Found in the memtable, so no disk read at all.'
            : `${res.diskReads} disk read${res.diskReads === 1 ? '' : 's'}; the bloom filters let the node skip ${res.skipped} of ${st.sstables.length} SSTables.`}
        </Callout>
      )}
      {res && (
        <div className="grid grid-cols-2 gap-3">
          <Stat label="Disk reads" value={res.diskReads} />
          <Stat label="SSTables skipped" value={res.skipped} tone={res.skipped ? 'good' : 'neutral'} />
        </div>
      )}
    </div>
  );
};

/** For lesson Try tasks: the servers each lab uses (they come from the hash, so lessons must not hard-code them). */
export const QUORUM_KEY = QKEY;
export const MERKLE_REPLICAS = MERKLE_PAIR;
