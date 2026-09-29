import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Minus, RotateCcw, Trash2 } from 'lucide-react';
import { HashKey, PhysicalServer } from '../../types';
import {
  HASH_SPACE_MAX,
  SERVER_COLORS,
  hashToKey,
  generateSampleKeys,
  getDefaultServers,
  makeServer,
  assignKeysTraditional,
  assignKeysToRingNodes,
  serversToRingNodes,
  vnodesToRingNodes,
  generateVirtualNodes,
  getLookupPath,
  computeDistributionStats,
  arcSharePercentOfMean,
  countMovedTraditional,
  countMovedRing,
  clearAssignments,
  RingNode,
} from '../../lib/hash';
import { usePersistentState } from '../../lib/usePersistentState';
import { HashRingCanvas } from '../HashRingCanvas';
import { Callout, Stat, Slider, Button, Segmented } from '../lesson/blocks';

const muted = 'text-slate-500 dark:text-slate-400';
const pct = (n: number, total: number) => Number(((n / (total || 1)) * 100).toFixed(1));

/** Collapsed secondary settings, as in the Ch.4 labs. */
const Settings: React.FC<{ summary: string; children: React.ReactNode }> = ({ summary, children }) => (
  <details className="rounded-xl ring-1 ring-slate-200 dark:ring-white/10 [&_summary::-webkit-details-marker]:hidden">
    <summary className="cursor-pointer select-none px-4 py-3 text-sm font-medium text-slate-700 dark:text-slate-200">
      Change the settings
      <span className={`ml-2 font-normal ${muted}`}>{summary}</span>
    </summary>
    <div className="px-4 pb-4 space-y-4">{children}</div>
  </details>
);

// =====================================================================
// Lesson 1: a key becomes a number and a position in the hash space
// =====================================================================

const HASH_PRESETS = ['User123', 'User124', 'Order_99', 'Cart_88'];

export const HashLab: React.FC = () => {
  const [input, setInput] = usePersistentState<string>('chapter5:lab:hash:input', 'User123');
  const [algo, setAlgo] = usePersistentState<'murmur3' | 'fnv1a'>('chapter5:lab:hash:algo', 'murmur3');
  const [seen, setSeen] = useState<string[]>(['Order_99', 'Cart_88']);
  const key = input.trim() || 'User123';
  const h = hashToKey(key, algo);

  const pick = (s: string) => {
    setInput(s);
    remember(s);
  };
  const remember = (s: string) => setSeen((prev) => [s, ...prev.filter((x) => x !== s)].slice(0, 5));
  const others = seen.filter((s) => s !== key).map((s) => hashToKey(s, algo));
  const at = (k: HashKey) => (k.hashValue / HASH_SPACE_MAX) * 100;

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <label htmlFor="ch5-key" className="block text-sm font-medium text-slate-700 dark:text-slate-200">
          Key
        </label>
        <input
          id="ch5-key"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onBlur={() => input.trim() && remember(input.trim())}
          className="w-full rounded-lg bg-white px-3 py-2 font-mono text-sm text-slate-900 ring-1 ring-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:bg-white/[0.04] dark:text-white dark:ring-white/15"
        />
        <div className="flex flex-wrap gap-2">
          {HASH_PRESETS.map((p) => (
            <button
              key={p}
              onClick={() => pick(p)}
              className={`rounded-md px-2.5 py-1 font-mono text-xs ring-1 transition-colors ${
                p === key
                  ? 'bg-indigo-50 text-indigo-900 ring-indigo-300 dark:bg-indigo-400/[0.12] dark:text-white dark:ring-indigo-400/40'
                  : 'text-slate-700 ring-slate-200 hover:bg-slate-50 dark:text-slate-200 dark:ring-white/10 dark:hover:bg-white/[0.05]'
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* key -> hash -> position */}
      <div className="rounded-xl bg-slate-50 dark:bg-white/[0.04] p-4 space-y-4">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          <span className="font-mono font-semibold text-slate-900 dark:text-white break-all">{key}</span>
          <span className={muted}>→ {algo === 'murmur3' ? 'MurmurHash3' : 'FNV-1a'} →</span>
          <span className="font-mono font-semibold text-indigo-700 dark:text-indigo-300">{h.hashHex}</span>
          <span className={`font-mono ${muted}`}>= {h.hashValue.toLocaleString()}</span>
        </div>
        <div>
          <div className="relative h-10">
            <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-slate-200 dark:bg-white/10" />
            {others.map((k) => (
              <span
                key={k.id}
                title={`${k.keyString}: ${k.hashHex}`}
                className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-slate-400 dark:bg-slate-500"
                style={{ left: `${at(k)}%` }}
              />
            ))}
            <span
              className="absolute top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-indigo-600 ring-4 ring-white transition-all duration-300 dark:ring-slate-900"
              style={{ left: `${at(h)}%` }}
            />
          </div>
          <div className={`flex justify-between font-mono text-xs ${muted}`}>
            <span>0</span>
            <span>2³² − 1</span>
          </div>
        </div>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          <strong className="text-slate-900 dark:text-white tabular-nums">{at(h).toFixed(1)}%</strong> of the way along the hash space. Grey dots are
          keys you tried before.
        </p>
      </div>

      <Settings summary={algo === 'murmur3' ? 'MurmurHash3' : 'FNV-1a'}>
        <Segmented
          label="Hash function"
          value={algo}
          onChange={setAlgo}
          options={[
            { value: 'murmur3', label: 'MurmurHash3' },
            { value: 'fnv1a', label: 'FNV-1a' },
          ]}
        />
        <p className={`text-sm ${muted}`}>A different hash function gives different numbers, but each one is still the same every time for the same key.</p>
      </Settings>
    </div>
  );
};

// =====================================================================
// Lessons 2-3: hash(key) % N buckets, and what happens when N changes
// =====================================================================

const MOD_KEYS = generateSampleKeys(40, 'Key');
const modServers = (n: number) => Array.from({ length: n }, (_, i) => makeServer(i));
const keyNum = (k: HashKey) => k.keyString.split('_').pop();

export const ModuloLab: React.FC<{ resizable?: boolean }> = ({ resizable = false }) => {
  const [servers, setServers] = useState<PhysicalServer[]>(() => modServers(4));
  const [keys, setKeys] = useState<HashKey[]>(() => assignKeysTraditional(clearAssignments(MOD_KEYS), modServers(4)));
  const [selectedId, setSelectedId] = useState<string | null>(resizable ? null : MOD_KEYS[0].id);
  const [change, setChange] = useState<{ from: number; to: number; moved: number } | null>(null);

  const resize = (delta: number) => {
    const n = servers.length + delta;
    if (n < 2 || n > 8) return;
    const next = modServers(n);
    const remapped = assignKeysTraditional(keys, next);
    setServers(next);
    setKeys(remapped);
    setChange({ from: servers.length, to: n, moved: remapped.filter((k) => k.isMoved).length });
  };

  const reset = () => {
    setServers(modServers(4));
    setKeys(assignKeysTraditional(clearAssignments(MOD_KEYS), modServers(4)));
    setChange(null);
    setSelectedId(null);
  };

  const sel = keys.find((k) => k.id === selectedId);
  const nameOf = (id?: string) => servers.find((s) => s.id === id)?.name ?? `Server ${id?.slice(1)}`;
  const N = servers.length;
  const fair = change ? Math.round(MOD_KEYS.length / Math.max(change.from, change.to)) : 0;

  return (
    <div className="space-y-5">
      <div className="rounded-xl bg-slate-50 dark:bg-white/[0.04] p-4 space-y-3">
        <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
          server = <span className="font-mono">hash(key) % {N}</span>
        </p>
        {servers.map((s) => {
          const mine = keys.filter((k) => k.assignedServerId === s.id);
          return (
            <div key={s.id} className="flex gap-3">
              <div className="w-20 shrink-0 pt-1">
                <p className="flex items-center gap-1.5 text-sm font-medium text-slate-800 dark:text-slate-100">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: s.color }} />
                  {s.name}
                </p>
                <p className={`text-xs tabular-nums ${muted}`}>{mine.length} keys</p>
              </div>
              <div className="flex flex-wrap gap-1 min-h-[28px]">
                {mine.map((k) => (
                  <button
                    key={k.id}
                    onClick={() => setSelectedId(k.id)}
                    title={k.keyString}
                    className={`h-7 min-w-[28px] rounded-md px-1 text-xs font-medium tabular-nums transition-colors ${
                      k.isMoved
                        ? 'bg-rose-100 text-rose-800 dark:bg-rose-400/15 dark:text-rose-300'
                        : 'bg-white text-slate-700 ring-1 ring-slate-200 dark:bg-white/[0.06] dark:text-slate-200 dark:ring-white/10'
                    } ${k.id === selectedId ? 'outline outline-2 outline-indigo-500' : ''}`}
                  >
                    {keyNum(k)}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {resizable && (
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" onClick={() => resize(1)} disabled={N >= 8}>
            <Plus className="w-4 h-4" /> Add a server
          </Button>
          <Button onClick={() => resize(-1)} disabled={N <= 2}>
            <Minus className="w-4 h-4" /> Remove a server
          </Button>
          <Button variant="ghost" onClick={reset}>
            <RotateCcw className="w-4 h-4" /> Reset
          </Button>
        </div>
      )}

      {resizable && change && (
        <>
          <div className="grid grid-cols-3 gap-3">
            <Stat label="Keys that moved" value={`${change.moved}/${MOD_KEYS.length}`} tone="bad" />
            <Stat label="Share moved" value={`${Math.round(pct(change.moved, MOD_KEYS.length))}%`} tone="bad" />
            <Stat label="Fair share" value={`~${fair}`} hint="one server's worth" />
          </div>
          <Callout tone="danger" title={`N went from ${change.from} to ${change.to}: ${Math.round(pct(change.moved, MOD_KEYS.length))}% of keys changed server`}>
            Only about {fair} keys ({Math.round(100 / Math.max(change.from, change.to))}%) needed to move. The rest moved because{' '}
            <span className="font-mono">% N</span> changed for every key, even keys whose server was fine.
          </Callout>
        </>
      )}

      {sel && (
        <Callout tone="idea" title={`${sel.keyString} lives on ${nameOf(sel.assignedServerId)}`}>
          <span className="font-mono">
            {sel.hashValue.toLocaleString()} % {N} = {sel.hashValue % N}
          </span>
          {sel.isMoved && sel.previousServerId && <>. Before the change it was on {`Server ${sel.previousServerId.slice(1)}`}.</>}
        </Callout>
      )}
      {!resizable && !sel && <p className={`text-sm ${muted}`}>Tap a key to see the calculation.</p>}
    </div>
  );
};

// =====================================================================
// Lesson 4: the same hash space drawn as a line and as a ring
// =====================================================================

const INTRO_KEYS = generateSampleKeys(10, 'Key');

export const RingIntroLab: React.FC = () => {
  const [view, setView] = usePersistentState<'line' | 'ring'>('chapter5:lab:intro:view', 'line');
  const servers = useMemo(() => getDefaultServers(), []);
  const x = (v: number) => 30 + (v / HASH_SPACE_MAX) * 540;
  const byPos = [...servers].sort((a, b) => a.hashValue - b.hashValue);

  return (
    <div className="space-y-5">
      <Segmented
        label="Drawing"
        value={view}
        onChange={setView}
        options={[
          { value: 'line', label: 'As a line' },
          { value: 'ring', label: 'As a ring' },
        ]}
      />
      <div className="rounded-xl bg-slate-50 dark:bg-white/[0.04] p-4">
        {view === 'line' ? (
          <svg viewBox="0 0 600 130" className="w-full h-auto" role="img" aria-label="The hash space as a line from 0 to 2^32 minus 1, with 4 servers and 10 keys placed at their hash values.">
            <line x1="30" y1="70" x2="570" y2="70" strokeWidth="4" strokeLinecap="round" className="stroke-slate-300 dark:stroke-white/15" />
            {INTRO_KEYS.map((k) => (
              <circle key={k.id} cx={x(k.hashValue)} cy={94} r={5} fill="#6366f1">
                <title>{k.keyString}</title>
              </circle>
            ))}
            {byPos.map((s, i) => (
              <g key={s.id}>
                <circle cx={x(s.hashValue)} cy={70} r={9} fill={s.color} strokeWidth="2" className="stroke-white dark:stroke-slate-900" />
                <text x={x(s.hashValue)} y={i % 2 ? 30 : 48} textAnchor="middle" fontSize="12" fontWeight="600" fill={s.color}>
                  {s.id}
                </text>
              </g>
            ))}
            <g fontSize="12" fontFamily="ui-monospace, monospace" className="fill-slate-500 dark:fill-slate-400">
              <text x="30" y="122" textAnchor="start">0</text>
              <text x="300" y="122" textAnchor="middle">2³¹</text>
              <text x="570" y="122" textAnchor="end">2³² − 1</text>
            </g>
          </svg>
        ) : (
          <HashRingCanvas servers={servers} keys={INTRO_KEYS} size={340} interactive={false} />
        )}
      </div>
      <p className="text-sm text-slate-600 dark:text-slate-300">
        Coloured dots are servers, hashed by name (<span className="font-mono">hash("Server_0")</span>). Small indigo dots are keys.{' '}
        {view === 'ring' ? 'Every position is the same as on the line; only the shape changed.' : 'Nothing is to the right of 2³² − 1.'}
      </p>
    </div>
  );
};

// =====================================================================
// Lesson 5: walk clockwise from a key to its server
// =====================================================================

const LOOKUP_KEYS = generateSampleKeys(16, 'Key');

/** Animates the clockwise walk from a key to its owner. */
function useWalk(ringNodes: RingNode[]) {
  const [key, setKey] = useState<HashKey | null>(null);
  const [tracer, setTracer] = useState<number | null>(null);
  const [done, setDone] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => () => {
    if (timer.current) clearInterval(timer.current);
  }, []);

  const walk = (k: HashKey) => {
    const path = getLookupPath(k, ringNodes);
    setKey(k);
    setDone(false);
    if (!path) return;
    const start = path.startAngle;
    let end = path.endAngle;
    if (end < start) end += 360; // wrap past 0 / 2^32
    if (timer.current) clearInterval(timer.current);
    let step = 0;
    timer.current = setInterval(() => {
      step++;
      setTracer((start + (end - start) * (step / 25)) % 360);
      if (step >= 25) {
        if (timer.current) clearInterval(timer.current);
        timer.current = null;
        setDone(true);
      }
    }, 18);
  };
  const clear = () => {
    if (timer.current) clearInterval(timer.current);
    setKey(null);
    setTracer(null);
    setDone(false);
  };
  return { key, tracer, done, walk, clear, path: key ? getLookupPath(key, ringNodes) : null };
}

export const LookupLab: React.FC = () => {
  const servers = useMemo(() => getDefaultServers(), []);
  const ring = useMemo(() => serversToRingNodes(servers), [servers]);
  const [keys, setKeys] = useState<HashKey[]>(() => assignKeysToRingNodes(LOOKUP_KEYS, ring));
  const w = useWalk(ring);
  const seq = useRef(0);

  const lastServer = Math.max(...servers.map((s) => s.angle));
  const wrapping = keys.find((k) => k.angle > lastServer);
  const chips = [...keys.slice(0, 3), ...(wrapping && !keys.slice(0, 3).includes(wrapping) ? [wrapping] : [])];

  const placeAt = (angle: number) => {
    const hashValue = Math.min(HASH_SPACE_MAX, Math.floor((angle / 360) * HASH_SPACE_MAX));
    const [k] = assignKeysToRingNodes(
      [{ id: `Placed_${++seq.current}`, keyString: `Key@${angle.toFixed(0)}°`, hashValue, hashHex: '0x' + hashValue.toString(16).padStart(8, '0').toUpperCase(), angle }],
      ring
    );
    setKeys((prev) => [...prev, k].slice(-30));
    w.walk(k);
  };

  const owner = w.path ? servers.find((s) => s.id === w.path!.targetNode.physicalServerId) : null;
  const wrapped = w.path ? w.path.endAngle < w.path.startAngle : false;
  const dist = w.path ? (w.path.endAngle - w.path.startAngle + 360) % 360 : 0;

  return (
    <div className="space-y-5">
      <HashRingCanvas
        servers={servers}
        keys={keys}
        activeLookupKey={w.key}
        animatedTracerAngle={w.tracer}
        onKeySelect={w.walk}
        onRingClick={placeAt}
        size={380}
      />
      <div className="flex flex-wrap items-center gap-2">
        <span className={`text-sm ${muted}`}>Or pick one:</span>
        {chips.map((k) => (
          <Button key={k.id} variant={w.key?.id === k.id ? 'primary' : 'secondary'} className="font-mono" onClick={() => w.walk(k)}>
            {k.keyString}
            {k === wrapping ? ' (near the top)' : ''}
          </Button>
        ))}
      </div>
      {w.key && owner && w.done ? (
        <Callout tone="idea" title={`${w.key.keyString} belongs to ${owner.name}`}>
          The key sits at {w.key.angle.toFixed(1)}°. Walking clockwise{wrapped ? ', it passes the top (0 = 2³²) and wraps around;' : ','} the first server it meets is{' '}
          {owner.name} at {owner.angle.toFixed(1)}°, {dist.toFixed(1)}° further on.
        </Callout>
      ) : (
        <p className={`text-sm ${muted}`}>{w.key ? 'Walking clockwise…' : 'Tap a key dot, a button, or anywhere on the ring.'}</p>
      )}
    </div>
  );
};

// =====================================================================
// Lesson 6: add or remove a server and count moved keys three ways
// =====================================================================

const MEMBER_KEYS = generateSampleKeys(60, 'Key');

interface MembershipResult {
  label: string;
  moved: number;
  modulo: number;
  idealPct: number;
  onlyAffected: boolean;
  affected: string;
  added: boolean;
}

export const MembershipLab: React.FC = () => {
  const [servers, setServers] = useState<PhysicalServer[]>(getDefaultServers);
  const [keys, setKeys] = useState<HashKey[]>(() => assignKeysToRingNodes(MEMBER_KEYS, serversToRingNodes(getDefaultServers())));
  const [nextIdx, setNextIdx] = useState(4);
  const [arc, setArc] = useState<{ startAngle: number; endAngle: number; color?: string } | null>(null);
  const [result, setResult] = useState<MembershipResult | null>(null);

  const apply = (next: PhysicalServer[], affected: PhysicalServer, added: boolean) => {
    const remapped = assignKeysToRingNodes(keys, serversToRingNodes(next));
    const movedList = remapped.filter((k) => k.isMoved);
    setResult({
      label: `${affected.name} ${added ? 'added' : 'removed'}: ${servers.length} → ${next.length} servers`,
      moved: movedList.length,
      modulo: countMovedTraditional(keys, servers, next),
      idealPct: Number((100 / Math.max(servers.length, next.length)).toFixed(1)),
      onlyAffected: movedList.every((k) => (added ? k.assignedServerId === affected.id : k.previousServerId === affected.id)),
      affected: affected.name,
      added,
    });
    setServers(next);
    setKeys(remapped);
  };

  const add = () => {
    if (servers.length >= 8) return;
    const base = makeServer(nextIdx);
    const s: PhysicalServer = { ...base, color: SERVER_COLORS.find((c) => !servers.some((x) => x.color === c)) || base.color };
    setNextIdx((i) => i + 1);
    const next = [...servers, s];
    const sorted = serversToRingNodes(next);
    const pos = sorted.findIndex((n) => n.id === s.id);
    setArc({ startAngle: sorted[(pos - 1 + sorted.length) % sorted.length].angle, endAngle: s.angle, color: s.color });
    apply(next, s, true);
  };

  const remove = (target: PhysicalServer) => {
    if (servers.length <= 2) return;
    const sorted = serversToRingNodes(servers);
    const pos = sorted.findIndex((n) => n.id === target.id);
    const successor = servers.find((s) => s.id === sorted[(pos + 1) % sorted.length].physicalServerId);
    setArc({ startAngle: sorted[(pos - 1 + sorted.length) % sorted.length].angle, endAngle: target.angle, color: successor?.color });
    apply(
      servers.filter((s) => s.id !== target.id),
      target,
      false
    );
  };

  const reset = () => {
    setServers(getDefaultServers());
    setKeys(assignKeysToRingNodes(MEMBER_KEYS, serversToRingNodes(getDefaultServers())));
    setNextIdx(4);
    setArc(null);
    setResult(null);
  };

  const crashTarget = servers.find((s) => s.id === 'S1') || servers[1];

  return (
    <div className="space-y-5">
      <HashRingCanvas servers={servers} keys={keys} highlightArc={arc} size={380} interactive={false} />
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" onClick={add} disabled={servers.length >= 8}>
          <Plus className="w-4 h-4" /> Add Server {nextIdx}
        </Button>
        <Button onClick={() => crashTarget && remove(crashTarget)} disabled={servers.length <= 2 || !crashTarget}>
          <Trash2 className="w-4 h-4" /> Remove {crashTarget?.name}
        </Button>
        <Button variant="ghost" onClick={reset}>
          <RotateCcw className="w-4 h-4" /> Reset
        </Button>
      </div>
      {result ? (
        <>
          <div className="grid grid-cols-3 gap-3">
            <Stat label="Ring moved" value={`${Math.round(pct(result.moved, MEMBER_KEYS.length))}%`} hint={`${result.moved} of ${MEMBER_KEYS.length} keys`} tone="good" />
            <Stat label="hash % N moves" value={`${Math.round(pct(result.modulo, MEMBER_KEYS.length))}%`} hint="same keys, same change" tone="bad" />
            <Stat label="Fair share, k/n" value={`${Math.round(result.idealPct)}%`} hint="one server's worth" />
          </div>
          <Callout tone="success" title={result.label}>
            {result.onlyAffected &&
              (result.added
                ? `Every moved key went to ${result.affected}. No key moved between the servers that were already there. `
                : `Only ${result.affected}'s keys moved, each to the next server clockwise. `)}
            Red dots are the keys that moved; the shaded arc is where they live.
          </Callout>
        </>
      ) : (
        <p className={`text-sm ${muted}`}>{MEMBER_KEYS.length} keys on the ring. Add or remove a server to see which ones move.</p>
      )}
    </div>
  );
};

// =====================================================================
// Lessons 7-8: how much of the ring each server owns
// =====================================================================

/** One bar per server: its share of the ring, against the fair share (dashed line). */
const ShareBars: React.FC<{ servers: PhysicalServer[]; shares: Record<string, number> }> = ({ servers, shares }) => {
  const fair = 100 / servers.length;
  const scale = Math.max(fair * 2, ...servers.map((s) => shares[s.id] ?? 0));
  return (
    <div className="space-y-2">
      {servers.map((s) => {
        const share = shares[s.id] ?? 0;
        return (
          <div key={s.id} className="flex items-center gap-3 text-sm">
            <span className="w-20 shrink-0 text-slate-700 dark:text-slate-200">{s.name}</span>
            <div className="relative h-3 flex-1 rounded-full bg-slate-200 dark:bg-white/10">
              <div className="h-full rounded-full transition-all duration-300" style={{ width: `${(share / scale) * 100}%`, backgroundColor: s.color }} />
              <span className="absolute -top-1 -bottom-1 w-0 border-l-2 border-dashed border-slate-500 dark:border-slate-300" style={{ left: `${(fair / scale) * 100}%` }} />
            </div>
            <span className="w-14 shrink-0 text-right tabular-nums text-slate-900 dark:text-white">{share.toFixed(1)}%</span>
          </div>
        );
      })}
      <p className={`text-xs ${muted}`}>Share of the ring each server owns. Dashed line: fair share, {fair.toFixed(1)}%.</p>
    </div>
  );
};

const sharesOf = (servers: PhysicalServer[], ring: RingNode[]) => {
  const stats = computeDistributionStats(servers, [], ring);
  const shares: Record<string, number> = {};
  stats.distribution.forEach((d) => (shares[d.serverId] = d.arcCoveragePercentage));
  return { stats, shares, values: stats.distribution.map((d) => d.arcCoveragePercentage) };
};

export const HotspotLab: React.FC = () => {
  const [servers, setServers] = useState<PhysicalServer[]>(getDefaultServers);
  const ring = serversToRingNodes(servers);
  const keys = assignKeysToRingNodes(MEMBER_KEYS, ring);
  const { shares, values } = sharesOf(servers, ring);
  const fair = 100 / servers.length;
  const max = Math.max(...values);
  const min = Math.min(...values);

  const drag = (id: string, angle: number) =>
    setServers((prev) => prev.map((s) => (s.id === id ? { ...s, angle, hashValue: Math.floor((angle / 360) * HASH_SPACE_MAX) } : s)));

  return (
    <div className="space-y-5">
      <HashRingCanvas servers={servers} keys={keys} onServerDrag={drag} size={360} />
      <ShareBars servers={servers} shares={shares} />
      <div className="grid grid-cols-3 gap-3">
        <Stat label="Biggest share" value={`${max.toFixed(0)}%`} tone={max > fair * 1.5 ? 'bad' : 'good'} hint={`${(max / fair).toFixed(1)}× fair`} />
        <Stat label="Smallest share" value={`${min.toFixed(0)}%`} hint={`${(min / fair).toFixed(2)}× fair`} />
        <Stat label="Fair share" value={`${fair.toFixed(0)}%`} />
      </div>
      <Button variant="ghost" onClick={() => setServers(getDefaultServers())}>
        <RotateCcw className="w-4 h-4" /> Put servers back at their hash positions
      </Button>
    </div>
  );
};

const VNODE_KEYS = generateSampleKeys(5000, 'VKey');

export const VNodeLab: React.FC = () => {
  const [v, setV] = usePersistentState<number>('chapter5:lab:vnodes:v', 1);
  const [n, setN] = usePersistentState<number>('chapter5:lab:vnodes:servers', 4);

  const m = useMemo(() => {
    const servers = Array.from({ length: n }, (_, i) => makeServer(i, v));
    const vnodes = generateVirtualNodes(servers, v);
    const ring = vnodesToRingNodes(vnodes);
    const { stats, shares, values } = sharesOf(servers, ring);
    const grown = vnodesToRingNodes(generateVirtualNodes([...servers, makeServer(n, v)], v));
    return {
      servers,
      vnodes,
      shares,
      spread: arcSharePercentOfMean(stats),
      busiest: Math.max(...values) / (100 / n),
      moved: pct(countMovedRing(VNODE_KEYS, ring, grown), VNODE_KEYS.length),
      shownKeys: assignKeysToRingNodes(VNODE_KEYS.slice(0, 80), ring),
    };
  }, [v, n]);

  const theory = Math.round(100 / Math.sqrt(v));
  const ideal = Math.round(100 / (n + 1));

  return (
    <div className="space-y-5">
      <Slider label="Virtual nodes per server" value={v} min={1} max={200} onChange={setV} hint={`${m.vnodes.length} tokens on the ring in total`} />
      <HashRingCanvas servers={m.servers} vnodes={m.vnodes} keys={m.shownKeys} showVNodes size={340} interactive={false} />
      <ShareBars servers={m.servers} shares={m.shares} />
      <div className="grid grid-cols-3 gap-3">
        <Stat label="Spread (σ)" value={`${m.spread}%`} hint={`of the mean; theory ≈ ${theory}%`} tone={m.spread <= 15 ? 'good' : 'bad'} />
        <Stat label="Busiest server" value={`${m.busiest.toFixed(2)}×`} hint="its fair share" tone={m.busiest > 1.5 ? 'bad' : 'neutral'} />
        <Stat label="Moved if one joins" value={`${m.moved}%`} hint={`fair share ${ideal}%`} />
      </div>
      {v === 1 ? (
        <Callout tone="warning" title="One point per server">
          Each server owns one random arc, so the bars are far apart. Drag the slider to the right.
        </Callout>
      ) : (
        <Callout tone={m.spread <= 15 ? 'success' : 'info'} title={`${v} tokens per server`}>
          Each server's share is now the sum of {v} small arcs, so the highs and lows cancel out. Spread shrinks roughly like 1/√V.
        </Callout>
      )}
      <Settings summary={`${n} servers`}>
        <Slider label="Servers" value={n} min={2} max={8} onChange={setN} />
        <p className={`text-sm ${muted}`}>
          "Moved if one joins" adds Server {n} and counts how many of {VNODE_KEYS.length.toLocaleString()} test keys change server.
        </p>
      </Settings>
    </div>
  );
};
