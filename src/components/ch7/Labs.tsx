import React, { useMemo, useRef, useState } from 'react';
import { Plus, Minus, RotateCcw, Send, Power, Zap, Sparkles } from 'lucide-react';
import { usePersistentState } from '../../lib/usePersistentState';
import { Callout, Stat, Slider, Button, Segmented, Try, GoDeeper } from '../lesson/blocks';
import {
  BitLayout,
  BOOK_LAYOUT,
  BIT_BOUNDS,
  EPOCHS,
  EpochId,
  LAYOUT_PRESETS,
  MS_PER_YEAR,
  OverflowMode,
  RollbackPolicy,
  SfRuntime,
  TWITTER_EPOCH,
  WORKERS,
  autoFix,
  composeSnowflake,
  decodeSnowflake,
  fmtUtc,
  layoutTotal,
  nextSnowflake,
  rebalance,
  runClockScenario,
  sanitizeLayout,
  uuidV4,
} from './engine';

// ---------------------------------------------------------------------------
// Shared bits
// ---------------------------------------------------------------------------

const surface = 'rounded-xl bg-slate-50 dark:bg-white/[0.04] p-4';
const small = 'text-xs text-slate-500 dark:text-slate-400';
const strong = 'text-slate-900 dark:text-white';

const Settings: React.FC<{ summary: React.ReactNode; children: React.ReactNode }> = ({ summary, children }) => (
  <details className="rounded-xl ring-1 ring-slate-200 dark:ring-white/10 [&_summary::-webkit-details-marker]:hidden">
    <summary className="cursor-pointer select-none px-4 py-3 text-sm font-medium text-slate-700 dark:text-slate-200">
      Change the settings
      <span className="ml-2 font-normal text-slate-500 dark:text-slate-400">{summary}</span>
    </summary>
    <div className="px-4 pb-4 space-y-4">{children}</div>
  </details>
);

type ChipTone = 'ok' | 'warn' | 'bad' | 'neutral';
const CHIP: Record<ChipTone, string> = {
  ok: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-400/15 dark:text-emerald-300',
  warn: 'bg-amber-100 text-amber-800 dark:bg-amber-400/15 dark:text-amber-300',
  bad: 'bg-rose-100 text-rose-800 dark:bg-rose-400/15 dark:text-rose-300',
  neutral: 'bg-slate-200 text-slate-700 dark:bg-white/10 dark:text-slate-200',
};
const Chip: React.FC<{ tone: ChipTone; children: React.ReactNode; title?: string }> = ({ tone, children, title }) => (
  <span title={title} className={`inline-flex h-7 min-w-[36px] items-center justify-center rounded-md px-1.5 text-xs font-mono font-semibold tabular-nums ${CHIP[tone]}`}>
    {children}
  </span>
);

// ---------------------------------------------------------------------------
// Requirements checklist
// ---------------------------------------------------------------------------

export const REQUIREMENTS = [
  { short: 'Unique', text: 'IDs must be unique.', why: 'Two records must never share an ID.' },
  { short: 'Numeric', text: 'IDs are numerical values only.', why: 'No letters or dashes.' },
  { short: '64-bit', text: 'IDs fit into 64 bits.', why: 'So they fit a BIGINT column and a CPU register.' },
  { short: 'Sortable', text: 'IDs are ordered by date.', why: 'An ID made in the evening is bigger than one made that morning.' },
  { short: '10k/s', text: 'The system can make over 10,000 IDs per second.', why: 'And keep doing it when a machine fails.' },
];

export const RequirementsList: React.FC = () => (
  <ol className="space-y-3">
    {REQUIREMENTS.map((r, i) => (
      <li key={r.short} className="flex gap-3">
        <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-xs font-semibold text-white">{i + 1}</span>
        <span>
          <span className={`block text-sm font-medium ${strong}`}>{r.text}</span>
          <span className="block text-sm text-slate-600 dark:text-slate-300">{r.why}</span>
        </span>
      </li>
    ))}
  </ol>
);

type Verdict = 'yes' | 'partial' | 'no';
type Approach = 'db' | 'multi' | 'uuid' | 'ticket' | 'snowflake';
const SCORECARD: Record<Approach, { label: string; cells: [Verdict, string][] }> = {
  db: {
    label: 'One DB auto_increment',
    cells: [
      ['yes', 'one counter'],
      ['yes', 'integers'],
      ['yes', 'BIGINT'],
      ['yes', 'one counter only goes up'],
      ['partial', 'one server is the ceiling, and a single point of failure'],
    ],
  },
  multi: {
    label: 'Multi-master (step k)',
    cells: [
      ['partial', 'only while k never changes'],
      ['yes', 'integers'],
      ['yes', 'BIGINT'],
      ['no', 'not across servers'],
      ['partial', 'scales with DB count; hard across data centers'],
    ],
  },
  uuid: {
    label: 'UUID v4',
    cells: [
      ['yes', 'collisions practically impossible'],
      ['no', 'hex string with dashes'],
      ['no', '128 bits'],
      ['no', 'random'],
      ['yes', 'generated locally'],
    ],
  },
  ticket: {
    label: 'Ticket server',
    cells: [
      ['yes', 'one central counter'],
      ['yes', 'integers'],
      ['yes', 'BIGINT'],
      ['yes', 'one counter only goes up'],
      ['partial', 'small to medium scale; single point of failure'],
    ],
  },
  snowflake: {
    label: 'Twitter Snowflake',
    cells: [
      ['yes', 'time + machine + sequence'],
      ['yes', 'integer'],
      ['yes', '1 + 41 + 5 + 5 + 12'],
      ['yes', 'time in the high bits (needs synced clocks)'],
      ['yes', '4,096 per ms per machine'],
    ],
  },
};
const VERDICT: Record<Verdict, { label: string; cls: string }> = {
  yes: { label: 'Yes', cls: 'text-emerald-700 dark:text-emerald-300' },
  partial: { label: 'Partly', cls: 'text-amber-700 dark:text-amber-300' },
  no: { label: 'No', cls: 'text-rose-700 dark:text-rose-300' },
};

/** One approach scored against the five requirements. */
export const ReqCheck: React.FC<{ approach: Approach }> = ({ approach }) => (
  <ul className="divide-y divide-slate-200 dark:divide-white/10">
    {SCORECARD[approach].cells.map(([v, note], i) => (
      <li key={i} className="flex items-baseline gap-3 py-2 text-sm">
        <span className={`w-20 shrink-0 font-medium ${strong}`}>{REQUIREMENTS[i].short}</span>
        <span className={`w-12 shrink-0 font-semibold ${VERDICT[v].cls}`}>{VERDICT[v].label}</span>
        <span className="text-slate-600 dark:text-slate-300">{note}</span>
      </li>
    ))}
  </ul>
);

/** All approaches side by side. */
export const Scorecard: React.FC = () => (
  <div className="overflow-x-auto -mx-1">
    <table className="w-full text-sm min-w-[520px]">
      <thead>
        <tr className="text-left text-slate-500 dark:text-slate-400">
          <th className="py-2 px-1 font-medium">Approach</th>
          {REQUIREMENTS.map((r) => (
            <th key={r.short} className="py-2 px-1 font-medium">
              {r.short}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-200 dark:divide-white/10">
        {(Object.keys(SCORECARD) as Approach[]).map((a) => (
          <tr key={a}>
            <td className={`py-2 px-1 font-medium ${strong}`}>{SCORECARD[a].label}</td>
            {SCORECARD[a].cells.map(([v, note], i) => (
              <td key={i} className={`py-2 px-1 font-semibold ${VERDICT[v].cls}`} title={note}>
                {VERDICT[v].label}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

// ---------------------------------------------------------------------------
// Lessons 2 and 5: one central counter (primary DB or ticket server)
// ---------------------------------------------------------------------------

const WEB = ['Web 1', 'Web 2', 'Web 3'];

export const CounterLab: React.FC<{ kind: 'db' | 'ticket' }> = ({ kind }) => {
  const label = kind === 'db' ? 'Primary database' : 'Ticket server';
  const [counter, setCounter] = useState(0);
  const [down, setDown] = useState(false);
  const [recent, setRecent] = useState<{ n: number; from: string; value: number | null }[]>([]);
  const nRef = useRef(0);

  const request = () => {
    const n = nRef.current++;
    const from = WEB[n % WEB.length];
    if (down) {
      setRecent((p) => [...p, { n, from, value: null }].slice(-16));
      return;
    }
    const value = counter + 1;
    setCounter(value);
    setRecent((p) => [...p, { n, from, value }].slice(-16));
  };
  const reset = () => {
    setCounter(0);
    setDown(false);
    setRecent([]);
    nRef.current = 0;
  };

  const latest = recent[recent.length - 1];
  const failed = recent.filter((r) => r.value === null).length;
  const issued = recent.length - failed;

  return (
    <div className="space-y-6">
      <div className={`${surface} flex flex-col items-center gap-3`}>
        <div className="flex gap-2">
          {WEB.map((w) => (
            <span
              key={w}
              className={`rounded-lg px-3 py-2 text-xs font-medium ring-1 transition-colors ${
                latest?.from === w ? 'bg-indigo-50 ring-indigo-400 text-indigo-900 dark:bg-indigo-400/[0.12] dark:ring-indigo-400/50 dark:text-white' : 'bg-white ring-slate-200 text-slate-700 dark:bg-white/[0.03] dark:ring-white/10 dark:text-slate-200'
              }`}
            >
              {w}
            </span>
          ))}
        </div>
        <span className={small}>every new record asks for the next number</span>
        <span className="text-slate-400">↓</span>
        <div
          className={`w-full max-w-xs rounded-xl px-4 py-3 text-center ring-2 transition-colors ${
            down ? 'ring-rose-400 bg-rose-50 dark:bg-rose-400/[0.08]' : 'ring-emerald-400 bg-white dark:bg-white/[0.03]'
          }`}
        >
          <p className={`text-sm font-medium ${strong}`}>{label}</p>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            {down ? 'down' : 'up'} · last ID <span className={`font-mono font-semibold ${strong}`}>{counter || '–'}</span>
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button variant="primary" onClick={request}>
          <Send className="w-4 h-4" /> Request an ID
        </Button>
        <Button variant={down ? 'secondary' : 'danger'} onClick={() => setDown((d) => !d)}>
          <Power className="w-4 h-4" /> {down ? 'Restart it' : `Crash the ${kind === 'db' ? 'database' : 'ticket server'}`}
        </Button>
        <Button variant="ghost" onClick={reset}>
          <RotateCcw className="w-4 h-4" /> Reset
        </Button>
      </div>

      <div className="space-y-3">
        <div className="flex flex-wrap gap-1.5 min-h-[28px]" aria-label="Recent IDs">
          {recent.length === 0 && <span className="text-sm text-slate-500 dark:text-slate-400">No requests yet.</span>}
          {recent.map((r) => (
            <Chip key={r.n} tone={r.value === null ? 'bad' : 'ok'} title={r.from}>
              {r.value ?? 'fail'}
            </Chip>
          ))}
        </div>
        {latest &&
          (latest.value === null ? (
            <Callout tone="danger" title="No ID, so no new record">
              The {label.toLowerCase()} is down. {latest.from} cannot create anything until it comes back. Every server that needs an ID is stuck.
            </Callout>
          ) : (
            <Callout tone="success" title={`${latest.from} got ID ${latest.value}`}>
              One counter hands out every number, so IDs are unique and always go up.
            </Callout>
          ))}
        <div className="grid grid-cols-3 gap-3">
          <Stat label="Issued" value={issued} tone={issued ? 'good' : 'neutral'} />
          <Stat label="Failed" value={failed} tone={failed ? 'bad' : 'neutral'} />
          <Stat label="Last ID" value={counter || '–'} />
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Lesson 3: multi-master replication
// ---------------------------------------------------------------------------

type MmMode = 'offset' | 'naive';
interface MmServer {
  name: string;
  start: number;
  last: number | null;
}
interface MmIssued {
  n: number;
  value: number;
  server: string;
  dupOf?: string;
  outOfOrder: boolean;
}

const buildServers = (k: number, mode: MmMode): MmServer[] =>
  Array.from({ length: k }, (_, i) => ({ name: `DB ${String.fromCharCode(65 + i)}`, start: mode === 'offset' ? i + 1 : 1, last: null }));

export const MultiMasterLab: React.FC = () => {
  const [mode, setMode] = usePersistentState<MmMode>('chapter7:lab:mm:mode', 'offset');
  const [servers, setServers] = useState<MmServer[]>(() => buildServers(2, mode));
  const [issued, setIssued] = useState<MmIssued[]>([]);
  const [msg, setMsg] = useState<{ tone: 'success' | 'warning' | 'danger' | 'idea'; title: string; text: string } | null>(null);

  const k = servers.length;
  const step = mode === 'offset' ? k : 1;

  const generate = (i: number) => {
    const srv = servers[i];
    const value = srv.last === null ? srv.start : srv.last + step;
    const prior = issued.find((x) => x.value === value);
    const bigger = issued.filter((x) => x.value > value);
    const rec: MmIssued = { n: issued.length, value, server: srv.name, dupOf: prior?.server, outOfOrder: !prior && bigger.length > 0 };
    setServers(servers.map((s, j) => (j === i ? { ...s, last: value } : s)));
    setIssued([...issued, rec]);
    if (prior) setMsg({ tone: 'danger', title: `Duplicate ID ${value}`, text: `${srv.name} issued ${value}, but ${prior.server} already issued ${value}. Two records now share one ID.` });
    else if (rec.outOfOrder)
      setMsg({
        tone: 'warning',
        title: 'Newer, but smaller',
        text: `${srv.name} issued ${value} after ${bigger[bigger.length - 1].server} had issued ${bigger[bigger.length - 1].value}. The later ID is smaller, so the IDs are not ordered by time.`,
      });
    else setMsg({ tone: 'success', title: `${srv.name} issued ${value}`, text: `Its previous ID plus ${step}.` });
  };

  const addServer = () => {
    if (k >= 6) return;
    const newK = k + 1;
    const name = `DB ${String.fromCharCode(64 + newK)}`;
    const start = mode === 'offset' ? newK : 1;
    setServers([...servers, { name, start, last: null }]);
    const owner = issued.find((x) => x.value === start);
    setMsg({
      tone: 'idea',
      title: `k is now ${newK}`,
      text:
        mode === 'offset'
          ? `Every server now steps by ${newK} from where it was, and ${name} starts at ${start}${owner ? `, a number ${owner.server} already issued` : ''}. Keep generating and watch for duplicates.`
          : `${name} starts at 1, like the others.`,
    });
  };

  const removeServer = () => {
    if (k <= 1) return;
    const gone = servers[k - 1];
    setServers(servers.slice(0, -1));
    setMsg({
      tone: 'idea',
      title: `k is now ${k - 1}`,
      text: mode === 'offset' ? `${gone.name} removed. The rest now step by ${k - 1} and will land on numbers already issued.` : `${gone.name} removed.`,
    });
  };

  const reset = (m: MmMode = mode, size = 2) => {
    setServers(buildServers(size, m));
    setIssued([]);
    setMsg(null);
  };

  const dups = issued.filter((x) => x.dupOf).length;
  const ooo = issued.filter((x) => x.outOfOrder).length;

  return (
    <div className="space-y-6">
      <div className={surface}>
        <p className={`${small} mb-3`}>
          k = <span className="font-mono font-semibold">{k}</span> servers. Each one: next ID = its previous ID + <span className="font-mono font-semibold">{step}</span>. Tap a
          server to generate there.
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {servers.map((s, i) => {
            const mine = issued.filter((x) => x.server === s.name).slice(-5);
            return (
              <button
                key={s.name}
                onClick={() => generate(i)}
                className="rounded-xl bg-white p-3 text-left ring-1 ring-slate-200 hover:ring-indigo-400 dark:bg-white/[0.03] dark:ring-white/10 dark:hover:ring-indigo-400/60 transition-colors"
              >
                <span className="flex items-baseline justify-between">
                  <span className={`text-sm font-medium ${strong}`}>{s.name}</span>
                  <span className={small}>
                    next <span className={`font-mono font-semibold ${strong}`}>{s.last === null ? s.start : s.last + step}</span>
                  </span>
                </span>
                <span className="mt-2 flex flex-wrap gap-1 min-h-[28px]">
                  {mine.length === 0 && <span className={small}>nothing yet</span>}
                  {mine.map((x) => (
                    <Chip key={x.n} tone={x.dupOf ? 'bad' : x.outOfOrder ? 'warn' : 'neutral'}>
                      {x.value}
                    </Chip>
                  ))}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button variant="primary" onClick={addServer} disabled={k >= 6}>
          <Plus className="w-4 h-4" /> Add a server
        </Button>
        <Button onClick={removeServer} disabled={k <= 1}>
          <Minus className="w-4 h-4" /> Remove one
        </Button>
        <Button variant="ghost" onClick={() => reset()}>
          <RotateCcw className="w-4 h-4" /> Reset
        </Button>
      </div>

      <div className="space-y-3">
        {msg && (
          <Callout tone={msg.tone} title={msg.title}>
            {msg.text}
          </Callout>
        )}
        <div className="grid grid-cols-3 gap-3">
          <Stat label="Issued" value={issued.length} />
          <Stat label="Duplicates" value={dups} tone={dups ? 'bad' : 'neutral'} />
          <Stat label="Out of order" value={ooo} tone={ooo ? 'bad' : 'neutral'} hint="smaller than an earlier ID" />
        </div>
      </div>

      <Settings summary={mode === 'offset' ? 'start i, step k' : 'naive: start 1, step 1'}>
        <Segmented
          label="Counter setup"
          value={mode}
          onChange={(m) => {
            setMode(m);
            reset(m, k);
            setMsg({
              tone: 'idea',
              title: m === 'naive' ? 'Naive setup' : 'Offset setup',
              text: m === 'naive' ? 'Every server starts at 1 and steps by 1, so they all produce the same numbers.' : 'Server i starts at i and steps by k, as in the book.',
            });
          }}
          options={[
            { value: 'offset', label: 'Start i, step k' },
            { value: 'naive', label: 'Default (step 1)' },
          ]}
        />
      </Settings>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Lesson 4: UUIDs
// ---------------------------------------------------------------------------

export const UuidLab: React.FC = () => {
  const [list, setList] = useState<{ n: number; v: string }[]>([]);
  const add = (count: number) =>
    setList((p) => {
      const out = [...p];
      for (let i = 0; i < count; i++) out.push({ n: (out[out.length - 1]?.n ?? 0) + 1, v: uuidV4() });
      return out.slice(-8);
    });

  const sorted = [...list].sort((a, b) => (a.v < b.v ? -1 : a.v > b.v ? 1 : 0));
  const inOrder = sorted.every((x, i) => x.n === list[i].n);
  const latest = list[list.length - 1];
  const letters = latest ? (latest.v.match(/[a-f]/g) ?? []).length : 0;

  return (
    <div className="space-y-6">
      <div className={`${surface} space-y-2`}>
        {list.length === 0 && <p className="text-sm text-slate-500 dark:text-slate-400">No UUIDs yet.</p>}
        {list.map((x) => (
          <div key={x.n} className="flex items-baseline gap-3">
            <span className={`w-6 shrink-0 text-right ${small} tabular-nums`}>#{x.n}</span>
            <span className={`font-mono text-sm break-all ${strong}`}>
              {x.v.slice(0, 14)}
              <span className="rounded bg-indigo-100 px-0.5 text-indigo-800 dark:bg-indigo-400/20 dark:text-indigo-200" title="version digit: always 4">
                {x.v[14]}
              </span>
              {x.v.slice(15)}
            </span>
          </div>
        ))}
        {list.length >= 2 && (
          <div className="pt-3 flex flex-wrap items-center gap-1.5">
            <span className={small}>Sorted by value:</span>
            {sorted.map((x, i) => (
              <Chip key={x.n} tone={x.n === list[i].n ? 'neutral' : 'warn'}>
                #{x.n}
              </Chip>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button variant="primary" onClick={() => add(1)}>
          <Sparkles className="w-4 h-4" /> Generate a UUID
        </Button>
        <Button onClick={() => add(5)}>Generate 5</Button>
        <Button variant="ghost" onClick={() => setList([])}>
          <RotateCcw className="w-4 h-4" /> Clear
        </Button>
      </div>

      {list.length > 0 && (
        <div className="space-y-3">
          {list.length >= 3 && !inOrder && (
            <Callout tone="warning" title="Sorting scrambles the creation order">
              Sort by value and you get {sorted.map((x) => `#${x.n}`).join(', ')}. A UUID says nothing about when it was made.
            </Callout>
          )}
          <div className="grid grid-cols-3 gap-3">
            <Stat label="Size" value="128" hint="bits (need 64)" tone="bad" />
            <Stat label="Letters in #last" value={letters} hint="hex, not a number" tone={letters ? 'bad' : 'neutral'} />
            <Stat label="Sorted = made?" value={list.length < 2 ? '–' : inOrder ? 'Yes' : 'No'} tone={list.length < 2 ? 'neutral' : inOrder ? 'good' : 'bad'} />
          </div>
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Lesson 6: the 64-bit layout
// ---------------------------------------------------------------------------

export type FieldKey = 'sign' | 't' | 'd' | 'm' | 's';
const FIELD: Record<FieldKey, { label: string; bar: string; text: string }> = {
  sign: { label: 'Sign', bar: 'bg-slate-200 text-slate-700 dark:bg-white/10 dark:text-slate-200', text: 'text-slate-500 dark:text-slate-400' },
  t: { label: 'Timestamp', bar: 'bg-indigo-100 text-indigo-900 dark:bg-indigo-400/20 dark:text-indigo-100', text: 'text-indigo-700 dark:text-indigo-300' },
  d: { label: 'DC', bar: 'bg-sky-100 text-sky-900 dark:bg-sky-400/20 dark:text-sky-100', text: 'text-sky-700 dark:text-sky-300' },
  m: { label: 'Machine', bar: 'bg-violet-100 text-violet-900 dark:bg-violet-400/20 dark:text-violet-100', text: 'text-violet-700 dark:text-violet-300' },
  s: { label: 'Seq', bar: 'bg-fuchsia-100 text-fuchsia-900 dark:bg-fuchsia-400/20 dark:text-fuchsia-100', text: 'text-fuchsia-700 dark:text-fuchsia-300' },
};
const ORDER: FieldKey[] = ['sign', 't', 'd', 'm', 's'];
const bitsOf = (k: FieldKey, L: BitLayout) => (k === 'sign' ? 1 : L[k]);

/** The 64-bit bar. Interactive when `onActive` is given. */
export const BitBar: React.FC<{ layout: BitLayout; active?: FieldKey | null; onActive?: (k: FieldKey) => void }> = ({ layout, active, onActive }) => (
  <div className="flex gap-1 w-full" role={onActive ? 'group' : 'img'} aria-label={`1 sign, ${layout.t} timestamp, ${layout.d} datacenter, ${layout.m} machine, ${layout.s} sequence bits`}>
    {ORDER.map((k) => {
      const n = bitsOf(k, layout);
      const cls = `rounded-lg px-1 py-2.5 text-center transition-all ${FIELD[k].bar} ${active === k ? 'ring-2 ring-indigo-500 dark:ring-indigo-300' : active ? 'opacity-50' : ''}`;
      const style = { flexGrow: n, flexBasis: 0, minWidth: k === 'sign' ? 40 : 52 };
      const inner = (
        <>
          <span className="block text-xs font-semibold truncate">{FIELD[k].label}</span>
          <span className="block text-xs font-mono">{n}</span>
        </>
      );
      return onActive ? (
        <button key={k} style={style} className={cls} onMouseEnter={() => onActive(k)} onFocus={() => onActive(k)} onClick={() => onActive(k)} aria-pressed={active === k}>
          {inner}
        </button>
      ) : (
        <div key={k} style={style} className={cls}>
          {inner}
        </div>
      );
    })}
  </div>
);

/** Binary string split into coloured fields. `dimExcept` fades every other field. */
const Binary: React.FC<{ id: bigint; layout: BitLayout; dimExcept?: FieldKey | null }> = ({ id, layout, dimExcept }) => {
  const bin = id.toString(2).padStart(64, '0');
  let pos = 0;
  return (
    <p className="font-mono text-xs sm:text-sm break-all leading-6">
      {ORDER.map((k) => {
        const n = bitsOf(k, layout);
        const part = bin.slice(pos, pos + n);
        pos += n;
        return (
          <span key={k} className={`${FIELD[k].text} font-semibold mr-1.5 ${dimExcept && dimExcept !== k ? 'opacity-30' : ''}`}>
            {part}
          </span>
        );
      })}
    </p>
  );
};

const describe = (k: FieldKey, L: BitLayout): { title: string; text: string } => {
  const years = ((2 ** L.t - 1) / MS_PER_YEAR).toFixed(0);
  switch (k) {
    case 'sign':
      return { title: 'Sign bit: 1 bit', text: 'Always 0. It is reserved so the ID stays a positive number in a signed 64-bit integer.' };
    case 't':
      return {
        title: `Timestamp: ${L.t} bits`,
        text: `Milliseconds since a custom epoch (Twitter: Nov 4, 2010). ${L.t} bits hold about ${years} years. It sits in the highest bits, so a later millisecond always makes a bigger ID.`,
      };
    case 'd':
      return { title: `Datacenter ID: ${L.d} bits`, text: `Which datacenter made the ID: ${(2 ** L.d).toLocaleString()} possible values. Fixed when the system starts.` };
    case 'm':
      return {
        title: `Machine ID: ${L.m} bits`,
        text: `Which machine inside that datacenter: ${(2 ** L.m).toLocaleString()} per datacenter, ${(2 ** (L.d + L.m)).toLocaleString()} in total. Together with the datacenter ID, it keeps two machines from ever building the same ID.`,
      };
    case 's':
      return {
        title: `Sequence: ${L.s} bits`,
        text: `Counts IDs made on this machine in the same millisecond, from 0 to ${(2 ** L.s - 1).toLocaleString()}. It resets to 0 every millisecond.`,
      };
  }
};

export const LayoutLab: React.FC = () => {
  const [active, setActive] = useState<FieldKey | null>('t');
  const L = BOOK_LAYOUT;
  const [example] = useState(() => {
    const now = Date.now();
    return composeSnowflake(now - TWITTER_EPOCH, 1, 3, 7, L);
  });
  const dec = decodeSnowflake(example, L, TWITTER_EPOCH);
  // Bit positions, counted from 63 (left) to 0 (right).
  const hi: Record<FieldKey, number> = { sign: 63, t: 62, d: 62 - L.t, m: 62 - L.t - L.d, s: L.s - 1 };
  const value: Record<FieldKey, string> = {
    sign: '0',
    t: `${dec.rel.toLocaleString()} ms after the epoch`,
    d: String(dec.datacenterId),
    m: String(dec.machineId),
    s: String(dec.sequence),
  };
  const info = active ? describe(active, L) : null;

  return (
    <div className="space-y-5">
      <BitBar layout={L} active={active} onActive={setActive} />
      <div className={`${surface} space-y-2`}>
        <p className={small}>An example ID, in binary</p>
        <Binary id={example} layout={L} dimExcept={active} />
        <p className={`font-mono text-sm ${strong}`}>= {example.toString()}</p>
      </div>
      {info && active && (
        <div className="space-y-1">
          <p className={`text-sm font-semibold ${FIELD[active].text}`}>{info.title}</p>
          <p className="text-sm text-slate-700 dark:text-slate-200">{info.text}</p>
          <p className={small}>
            Bits {hi[active]}
            {bitsOf(active, L) > 1 ? ` to ${hi[active] - bitsOf(active, L) + 1}` : ''} · in this example: <span className="font-mono">{value[active]}</span>
          </p>
        </div>
      )}
    </div>
  );
};

/** GoDeeper sandbox: retune the field widths and the epoch. */
export const BitTuner: React.FC = () => {
  const [stored, setStored] = usePersistentState<BitLayout>('chapter7:tuner:bits', BOOK_LAYOUT);
  const [epochId, setEpochId] = usePersistentState<EpochId>('chapter7:tuner:epoch', 'twitter');
  const L = sanitizeLayout(stored);
  const epoch = (EPOCHS.find((e) => e.id === epochId) ?? EPOCHS[0]).ms;
  const total = layoutTotal(L);
  const valid = total === 64;
  const tsRange = 2 ** L.t;
  const years = (tsRange - 1) / MS_PER_YEAR;
  const runsOut = epoch + tsRange - 1;
  const elapsed = Date.now() - epoch;
  const perSec = 2 ** L.s * 1000;
  const misfits = WORKERS.filter((w) => w.datacenterId >= 2 ** L.d || w.machineId >= 2 ** L.m);

  return (
    <div className="space-y-5 pt-2">
      <BitBar layout={L} />
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className={`font-mono ${valid ? 'text-emerald-700 dark:text-emerald-300' : 'text-rose-700 dark:text-rose-300'}`}>
          1 + {L.t} + {L.d} + {L.m} + {L.s} = {total} bits
        </span>
        {!valid && (
          <Button variant="danger" onClick={() => setStored(autoFix(L))}>
            Rebalance to 64
          </Button>
        )}
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        {(['t', 'd', 'm', 's'] as (keyof BitLayout)[]).map((k) => (
          <Slider
            key={k}
            label={`${k === 't' ? 'Timestamp' : k === 'd' ? 'Datacenter' : k === 'm' ? 'Machine' : 'Sequence'} bits`}
            value={L[k]}
            min={BIT_BOUNDS[k][0]}
            max={BIT_BOUNDS[k][1]}
            onChange={(v) => setStored(rebalance(L, k, v))}
          />
        ))}
      </div>
      <p className={small}>Moving timestamp, datacenter or machine takes bits from the sequence; moving the sequence trades with the timestamp.</p>
      <div className="flex flex-wrap gap-2">
        {LAYOUT_PRESETS.map((p) => (
          <Button key={p.label} variant="ghost" onClick={() => setStored(p.layout)}>
            {p.label}
          </Button>
        ))}
      </div>
      <div className="space-y-2">
        <p className={small}>Epoch (the instant the timestamp counts from)</p>
        <Segmented label="Epoch" value={epochId} onChange={setEpochId} options={EPOCHS.map((e) => ({ value: e.id, label: e.label }))} />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="Lifetime" value={years < 1000 ? years.toFixed(1) : '1000+'} hint="years" />
        <Stat label="Runs out" value={runsOut > 8.64e15 ? 'far' : new Date(runsOut).getUTCFullYear()} />
        <Stat label="Machines" value={(2 ** (L.d + L.m)).toLocaleString()} />
        <Stat label="IDs/s per machine" value={perSec >= 1e6 ? `${(perSec / 1e6).toFixed(1)}M` : perSec.toLocaleString()} tone={perSec >= 10_000 ? 'good' : 'bad'} />
      </div>
      {(elapsed > tsRange - 1 || misfits.length > 0) && (
        <Callout tone="warning" title="This layout breaks something">
          {elapsed > tsRange - 1 && <>The timestamp has already overflowed: more ms have passed since this epoch than {L.t} bits can hold, so new IDs wrap and collide. </>}
          {misfits.length > 0 && (
            <>
              {misfits.map((w) => w.name).join(', ')} no longer fit{misfits.length === 1 ? 's' : ''}. Masking folds {misfits.length === 1 ? 'it' : 'them'} onto another
              datacenter or machine ID, so two workers can mint identical IDs.
            </>
          )}
        </Callout>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Lesson 7: bursts beyond the sequence range
// ---------------------------------------------------------------------------

interface BurstResult {
  requested: number;
  mode: OverflowMode;
  perMs: number[];
  overflowAt: number | null; // 1-based request number of the first overflow
  duplicates: number;
  firstId: string;
  lastId: string;
}

export const BurstLab: React.FC = () => {
  const L = BOOK_LAYOUT;
  const cap = 2 ** L.s;
  const worker = WORKERS[0];
  const [size, setSize] = usePersistentState<number>('chapter7:lab:burst:n', 5000);
  const [mode, setMode] = usePersistentState<OverflowMode>('chapter7:lab:burst:mode', 'WAIT');
  const n = Math.min(20_000, Math.max(100, Math.round(size / 100) * 100));
  const rtRef = useRef<SfRuntime>({ lastTs: -1, seq: 0 });
  const [res, setRes] = useState<BurstResult | null>(null);

  const fire = () => {
    const rt = rtRef.current;
    // Simulated clock: it only moves when the generator waits for the next millisecond.
    const start = Math.max(Date.now(), rt.lastTs + 1);
    let clock = start;
    let overflowAt: number | null = null;
    const counts = new Map<number, number>();
    const seen = new Set<string>();
    let duplicates = 0;
    let firstId = '';
    let lastId = '';
    for (let i = 0; i < n; i++) {
      const st = nextSnowflake(rt, clock, L.s, mode, 'WAIT');
      if (!st.ok) continue;
      if (st.overflowWait) clock = st.ts;
      if ((st.overflowWait || st.wrapped) && overflowAt === null) overflowAt = i + 1;
      counts.set(st.ts, (counts.get(st.ts) ?? 0) + 1);
      const v = composeSnowflake(st.ts - TWITTER_EPOCH, worker.datacenterId, worker.machineId, st.seq, L).toString();
      if (seen.has(v)) duplicates++;
      else seen.add(v);
      if (i === 0) firstId = v;
      lastId = v;
    }
    // The simulated waits "took" real milliseconds; let the real clock catch up, as Snowflake's tilNextMillis does.
    const guard = Date.now();
    while (Date.now() < rt.lastTs && Date.now() - guard < 250) {
      /* spin */
    }
    setRes({
      requested: n,
      mode,
      perMs: Array.from(counts.entries())
        .sort((a, b) => a[0] - b[0])
        .map(([, c]) => c),
      overflowAt,
      duplicates,
      firstId,
      lastId,
    });
  };

  const rows = res ? res.perMs : [];
  return (
    <div className="space-y-6">
      <div className={`${surface} space-y-2`}>
        <p className={small}>
          IDs issued by {worker.name} in each millisecond (room for {cap.toLocaleString()} per ms)
        </p>
        {!res && (
          <div className="flex items-center gap-2 text-xs font-mono">
            <span className="w-12 shrink-0 text-slate-500 dark:text-slate-400">ms +0</span>
            <div className="h-5 flex-1 rounded bg-slate-200 dark:bg-white/10" />
            <span className="w-24 text-right text-slate-500 dark:text-slate-400">0 / {cap.toLocaleString()}</span>
          </div>
        )}
        {rows.slice(0, 6).map((c, i) => (
          <div key={i} className="flex items-center gap-2 text-xs font-mono">
            <span className="w-12 shrink-0 text-slate-500 dark:text-slate-400">ms +{i}</span>
            <div className="h-5 flex-1 rounded bg-slate-200 dark:bg-white/10 overflow-hidden">
              <div className={`h-full ${c > cap ? 'bg-rose-500' : 'bg-indigo-500'}`} style={{ width: `${Math.min(100, (c / cap) * 100)}%` }} />
            </div>
            <span className={`w-24 text-right ${c > cap ? 'text-rose-600 dark:text-rose-400 font-semibold' : strong}`}>
              {c.toLocaleString()} / {cap.toLocaleString()}
            </span>
          </div>
        ))}
        {rows.length > 6 && <p className={small}>…and {rows.length - 6} more milliseconds</p>}
      </div>

      <Slider label="Requests arriving in the same millisecond" value={n} min={100} max={20_000} step={100} onChange={setSize} hint={`${Math.ceil(n / cap)} millisecond${Math.ceil(n / cap) > 1 ? 's' : ''} needed at ${cap.toLocaleString()} per ms`} />

      <div className="flex flex-wrap gap-2">
        <Button variant="primary" onClick={fire}>
          <Zap className="w-4 h-4" /> Fire {n.toLocaleString()} requests
        </Button>
      </div>

      {res && (
        <div className="space-y-3">
          {res.overflowAt === null ? (
            <Callout tone="info" title="Fits in one millisecond">
              {res.requested.toLocaleString()} requests used sequence 0 to {(res.requested - 1).toLocaleString()}. Nothing had to wait.
            </Callout>
          ) : res.mode === 'WAIT' ? (
            <Callout tone="success" title={`All ${res.requested.toLocaleString()} IDs are unique`}>
              Request #{res.overflowAt.toLocaleString()} found the sequence already at {(cap - 1).toLocaleString()}, so the generator waited for the next millisecond and
              restarted at sequence 0. The new timestamp keeps the ID unique.
            </Callout>
          ) : (
            <Callout tone="danger" title={`${res.duplicates.toLocaleString()} duplicate IDs`}>
              Request #{res.overflowAt.toLocaleString()} wrapped the sequence to 0 in the same millisecond, rebuilding exactly the ID of request #1, and every request after it
              repeated one too.
            </Callout>
          )}
          <div className="grid grid-cols-3 gap-3">
            <Stat label="Milliseconds used" value={res.perMs.length} />
            <Stat label={res.mode === 'WAIT' ? 'Waits' : 'Wraps'} value={Math.max(0, res.mode === 'WAIT' ? res.perMs.length - 1 : Math.ceil(res.requested / cap) - 1)} />
            <Stat label="Duplicates" value={res.duplicates.toLocaleString()} tone={res.duplicates ? 'bad' : 'good'} />
          </div>
          <p className={`${small} font-mono break-all`}>
            first {res.firstId} · last {res.lastId}
          </p>
        </div>
      )}

      <Settings summary={mode === 'WAIT' ? 'on overflow: wait for next ms' : 'on overflow: wrap to 0 (bug)'}>
        <Segmented
          label="When the sequence runs out"
          value={mode}
          onChange={(m) => {
            setMode(m);
            setRes(null);
          }}
          options={[
            { value: 'WAIT', label: 'Wait for next ms' },
            { value: 'WRAP', label: 'Wrap to 0 (bug)' },
          ]}
        />
      </Settings>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Lesson 8: clock rollback
// ---------------------------------------------------------------------------

const POLICY_OPTS: { value: RollbackPolicy; label: string }[] = [
  { value: 'IGNORE', label: 'Ignore' },
  { value: 'REJECT', label: 'Reject' },
  { value: 'WAIT', label: 'Wait' },
  { value: 'BACKUP_WORKER', label: 'Backup ID' },
];

type ClockRows = ReturnType<typeof runClockScenario>;

/** Lesson 8's Try plus a GoDeeper table, sharing one policy state. */
export const ClockSection: React.FC<{ task: React.ReactNode }> = ({ task }) => {
  const [stored, setPolicy] = usePersistentState<RollbackPolicy>('chapter7:lab:clock:policy', 'IGNORE');
  const policy: RollbackPolicy = POLICY_OPTS.some((o) => o.value === stored) ? stored : 'IGNORE';
  const [jump, setJump] = usePersistentState<number>('chapter7:lab:clock:jump', 3);
  const [T0] = useState(() => Date.now());
  const rows = useMemo(() => runClockScenario(policy, jump, T0), [policy, jump, T0]);
  return (
    <>
      <Try task={task}>
        <ClockLab policy={policy} setPolicy={setPolicy} jump={jump} setJump={setJump} rows={rows} />
      </Try>
      <GoDeeper title="Every request, row by row">
        <ClockTable rows={rows} policy={policy} />
      </GoDeeper>
    </>
  );
};

const ClockLab: React.FC<{ policy: RollbackPolicy; setPolicy: (p: RollbackPolicy) => void; jump: number; setJump: (n: number) => void; rows: ClockRows }> = ({
  policy,
  setPolicy,
  jump,
  setJump,
  rows,
}) => {
  const dups = rows.filter((r) => r.duplicate).length;
  const rejected = rows.filter((r) => r.rejected).length;
  const waited = rows.reduce((a, r) => a + r.waitedMs, 0);
  const fromBackup = rows.filter((r) => r.backup).length;
  const J = Math.min(5, Math.max(1, jump));

  const cell = (r: ClockRows[number]) => {
    const tone = r.duplicate ? CHIP.bad : r.rejected ? CHIP.neutral : r.waitedMs ? CHIP.warn : CHIP.ok;
    return (
      <div key={r.n} className={`rounded-lg px-1 py-1.5 text-center ${tone} ${r.rejected ? 'opacity-60' : ''}`} title={`Request ${r.n}: worker clock +${r.clockRel} ms`}>
        <span className="block text-xs font-mono font-semibold">{r.tsRel === null ? 'error' : `+${r.tsRel}`}</span>
        <span className="block text-[11px]">{r.rejected ? '–' : r.backup ? `bk s${r.seq}` : `seq ${r.seq}`}</span>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <Segmented label="Rollback policy" value={policy} onChange={setPolicy} options={POLICY_OPTS} />

      <div className={`${surface} space-y-3`}>
        <p className={small}>Before: the worker issues one ID per millisecond. Each cell shows the timestamp used and the sequence.</p>
        <div className="grid grid-cols-6 gap-1.5">{rows.slice(0, 6).map(cell)}</div>
        <p className="text-sm font-medium text-rose-700 dark:text-rose-300">NTP moves the clock back {J} ms</p>
        <div className="grid grid-cols-6 gap-1.5">{rows.slice(6).map(cell)}</div>
        <p className={small}>
          Clock readings after the jump: {rows.slice(6).map((r) => `+${r.clockRel}`).join(', ')} ms. The last ID was issued at +5.
        </p>
      </div>

      <div className="space-y-3">
        {policy === 'IGNORE' && (
          <Callout tone="danger" title={`${dups} duplicate IDs`}>
            After the jump the worker reused milliseconds it had already used. The sequence restarted at 0, so it rebuilt IDs it had already issued, and they are smaller than
            IDs made a moment earlier.
          </Callout>
        )}
        {policy === 'REJECT' && (
          <Callout tone="warning" title={`${rejected} requests failed`}>
            No duplicates, but callers got an error until the clock passed the last used millisecond.
          </Callout>
        )}
        {policy === 'WAIT' && (
          <Callout tone="warning" title={`No duplicates, ${waited} ms of waiting`}>
            Each request blocked until the clock caught up with the last used millisecond. Safe, but the jump becomes latency.
          </Callout>
        )}
        {policy === 'BACKUP_WORKER' && (
          <Callout tone="success" title="No duplicates, no waiting">
            While the primary's clock was behind, {fromBackup} requests were issued under a spare machine ID (bk), which cannot collide with the primary's IDs. The cost: one
            machine ID reserved for emergencies.
          </Callout>
        )}
        <div className="grid grid-cols-3 gap-3">
          <Stat label="Duplicates" value={dups} tone={dups ? 'bad' : 'good'} />
          <Stat label="Rejected" value={rejected} tone={rejected ? 'bad' : 'neutral'} />
          <Stat label="Total wait" value={`${waited} ms`} />
        </div>
      </div>

      <Settings summary={`clock jumps back ${J} ms`}>
        <Slider label="Clock jumps back by" unit=" ms" value={J} min={1} max={5} onChange={setJump} />
      </Settings>
    </div>
  );
};

/** Row-by-row table of the clock scenario, for GoDeeper. */
const ClockTable: React.FC<{ rows: ClockRows; policy: RollbackPolicy }> = ({ rows, policy }) => {
  return (
    <div className="overflow-x-auto -mx-1">
      <p className="text-sm">
        Policy: <strong>{POLICY_OPTS.find((o) => o.value === policy)?.label}</strong>. Times are in ms from the start of the scenario.
      </p>
      <table className="w-full text-xs min-w-[560px] mt-2">
        <thead>
          <tr className="text-left text-slate-500 dark:text-slate-400">
            {['#', 'True time', 'Clock', 'Handled by', 'Timestamp', 'Seq', 'ID (last 8)', 'Outcome'].map((h) => (
              <th key={h} className="py-1.5 px-1 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200 dark:divide-white/10 font-mono">
          {rows.map((r) => (
            <tr key={r.n} className={r.duplicate ? 'text-rose-700 dark:text-rose-300' : ''}>
              <td className="py-1.5 px-1">{r.n}</td>
              <td className="py-1.5 px-1">+{r.trueRel}</td>
              <td className="py-1.5 px-1">+{r.clockRel}</td>
              <td className="py-1.5 px-1 font-sans">{r.handler}</td>
              <td className="py-1.5 px-1">{r.tsRel === null ? '–' : `+${r.tsRel}`}</td>
              <td className="py-1.5 px-1">{r.seq ?? '–'}</td>
              <td className="py-1.5 px-1">{r.value ? r.value.slice(-8) : '–'}</td>
              <td className="py-1.5 px-1 font-sans">
                {r.rejected
                  ? `Rejected: ${r.behindMs} ms behind`
                  : r.duplicate
                  ? 'Duplicate'
                  : r.backup
                  ? `Backup (primary ${r.behindMs} ms behind)`
                  : r.waitedMs
                  ? `Waited ${r.waitedMs} ms`
                  : r.behindMs
                  ? 'Reused an old ms'
                  : 'OK'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Lesson 9: decode an ID
// ---------------------------------------------------------------------------

const MAX_ID = (1n << 63n) - 1n;

export const DecodeLab: React.FC = () => {
  const L = BOOK_LAYOUT;
  const rts = useRef<Record<string, SfRuntime>>({});
  const make = (w = WORKERS[Math.floor(Math.random() * WORKERS.length)], at = Date.now()) => {
    const rt = (rts.current[w.id] ??= { lastTs: -1, seq: 0 });
    const st = nextSnowflake(rt, at, L.s, 'WAIT', 'WAIT');
    if (!st.ok) return null;
    return { value: composeSnowflake(st.ts - TWITTER_EPOCH, w.datacenterId, w.machineId, st.seq, L).toString(), who: w.name };
  };
  const [ids, setIds] = useState<{ value: string; who: string }[]>(() => {
    const now = Date.now();
    return WORKERS.map((w, i) => make(w, now - (WORKERS.length - 1 - i) * 61_234)).filter((x): x is { value: string; who: string } => x !== null);
  });
  const [picked, setPicked] = useState<string>(() => ids[ids.length - 1]?.value ?? '0');
  const [typed, setTyped] = useState('');

  const typedValid = /^\d{1,19}$/.test(typed.trim()) && BigInt(typed.trim()) <= MAX_ID;
  const current = typed.trim() && typedValid ? typed.trim() : picked;
  const id = BigInt(current);
  const dec = decodeSnowflake(id, L, TWITTER_EPOCH);
  const shift = L.d + L.m + L.s;
  const agoMs = Date.now() - dec.timestampMs;
  const ago = agoMs < 0 ? 'in the future' : agoMs < 60_000 ? `${Math.round(agoMs / 1000)} seconds ago` : agoMs < 3.6e6 ? `${Math.round(agoMs / 60_000)} minutes ago` : agoMs < 8.64e7 ? `${Math.round(agoMs / 3.6e6)} hours ago` : `${Math.round(agoMs / 8.64e7).toLocaleString()} days ago`;

  const rows: { k: FieldKey; label: string; formula: string; value: string }[] = [
    { k: 't', label: 'Timestamp', formula: `id >> ${shift}`, value: `${dec.rel.toLocaleString()} ms` },
    { k: 't', label: 'Plus the epoch', formula: `+ ${TWITTER_EPOCH}`, value: fmtUtc(dec.timestampMs) },
    { k: 'd', label: 'Datacenter', formula: `(id >> ${L.m + L.s}) & ${2 ** L.d - 1}`, value: String(dec.datacenterId) },
    { k: 'm', label: 'Machine', formula: `(id >> ${L.s}) & ${2 ** L.m - 1}`, value: String(dec.machineId) },
    { k: 's', label: 'Sequence', formula: `id & ${2 ** L.s - 1}`, value: String(dec.sequence) },
  ];

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <div className="flex flex-wrap gap-2">
          {ids.map((x) => (
            <button
              key={x.value}
              onClick={() => {
                setPicked(x.value);
                setTyped('');
              }}
              aria-pressed={current === x.value}
              title={x.who}
              className={`rounded-lg px-2.5 py-1.5 font-mono text-xs ring-1 transition-colors ${
                current === x.value
                  ? 'bg-indigo-50 ring-indigo-400 text-indigo-900 dark:bg-indigo-400/[0.12] dark:ring-indigo-400/50 dark:text-white'
                  : 'bg-white ring-slate-200 text-slate-700 hover:ring-slate-300 dark:bg-white/[0.03] dark:ring-white/10 dark:text-slate-200'
              }`}
            >
              {x.value}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            onClick={() => {
              const x = make();
              if (!x) return;
              setIds((p) => [...p, x].slice(-6));
              setPicked(x.value);
              setTyped('');
            }}
          >
            <Plus className="w-4 h-4" /> Make a new ID now
          </Button>
          <input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            inputMode="numeric"
            placeholder="or paste an ID"
            aria-label="Snowflake ID to decode"
            className="min-w-0 flex-1 rounded-lg bg-white px-3 py-2 font-mono text-sm ring-1 ring-slate-300 text-slate-900 placeholder:text-slate-400 dark:bg-white/[0.04] dark:ring-white/15 dark:text-white"
          />
        </div>
        {typed.trim() && !typedValid && <p className="text-sm text-rose-600 dark:text-rose-400">Enter a whole number from 0 to {MAX_ID.toString()}.</p>}
      </div>

      <div className={`${surface} space-y-2`}>
        <p className={`font-mono text-sm break-all ${strong}`}>{current}</p>
        <Binary id={id} layout={L} />
      </div>

      <dl className="divide-y divide-slate-200 dark:divide-white/10">
        {rows.map((r) => (
          <div key={r.label} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 py-2 text-sm">
            <dt>
              <span className={`font-medium ${FIELD[r.k].text}`}>{r.label}</span>
              <span className={`ml-2 font-mono ${small}`}>{r.formula}</span>
            </dt>
            <dd className={`font-mono font-semibold ${strong}`}>{r.value}</dd>
          </div>
        ))}
      </dl>

      <Callout tone="idea" title={`Made ${ago}`}>
        The creation time came straight out of the ID's own bits. No database lookup, no extra column.
      </Callout>
    </div>
  );
};
