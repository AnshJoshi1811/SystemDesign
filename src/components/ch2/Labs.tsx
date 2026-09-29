import React, { useState } from 'react';
import { Eye, RotateCcw, ChevronRight } from 'lucide-react';
import { usePersistentState } from '../../lib/usePersistentState';
import { Term } from '../learn/LearningKit';
import { Callout, Stat, Button, Segmented } from '../lesson/blocks';

export const SECONDS_PER_DAY = 86_400;

// =====================================================================
// Formatting helpers (decimal units, as the book's arithmetic uses)
// =====================================================================

export const sig = (n: number, digits = 3) => (n === 0 ? '0' : Number(n.toPrecision(digits)).toLocaleString());

export const fmtBytes = (bytes: number) => {
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB'];
  let v = bytes;
  let i = 0;
  while (v >= 1000 && i < units.length - 1) {
    v /= 1000;
    i++;
  }
  return `${sig(v)} ${units[i]}`;
};

export const fmtCount = (n: number) => {
  if (n >= 1e9) return `${sig(n / 1e9)} billion`;
  if (n >= 1e6) return `${sig(n / 1e6)} million`;
  return Math.round(n).toLocaleString();
};

const fmtLatency = (ns: number) => {
  if (ns < 1_000) return `${ns} ns`;
  if (ns < 1_000_000) return `${sig(ns / 1_000)} µs`;
  return `${sig(ns / 1_000_000)} ms`;
};

export const formatDuration = (sec: number) => {
  if (sec < 1) return `${sig(sec * 1000)} ms`;
  if (sec < 60) return `${sig(sec)} s`;
  if (sec < 3600) return `${sig(sec / 60)} min`;
  if (sec < SECONDS_PER_DAY) return `${sig(sec / 3600)} h`;
  if (sec < 365 * SECONDS_PER_DAY) return `${sig(sec / SECONDS_PER_DAY)} days`;
  return `${sig(sec / (365 * SECONDS_PER_DAY))} years`;
};

/** One line of worked arithmetic: prose label, then the math in monospace. */
export const Step: React.FC<{ label: React.ReactNode; math: React.ReactNode }> = ({ label, math }) => (
  <p>
    <span>{label} </span>
    <span className="font-mono text-slate-900 dark:text-white">{math}</span>
  </p>
);

// =====================================================================
// Estimate first, then reveal
// =====================================================================

const parseGuess = (raw: string): number | null => {
  const m = raw.replace(/,/g, '').trim().match(/^(\d*\.?\d+)\s*([kmbt])?/i);
  if (!m) return null;
  const mult: Record<string, number> = { k: 1e3, m: 1e6, b: 1e9, t: 1e12 };
  return parseFloat(m[1]) * (m[2] ? mult[m[2].toLowerCase()] : 1);
};

export const EstimateCheck: React.FC<{
  id: string;
  prompt: React.ReactNode;
  unit: string;
  answer: number;
  worked: React.ReactNode;
  hint?: React.ReactNode;
}> = ({ id, prompt, unit, answer, worked, hint }) => {
  const [state, setState] = usePersistentState<{ guess: string; revealed: boolean }>(`chapter2:estimate:${id}`, { guess: '', revealed: false });
  const guess = parseGuess(state.guess);
  const factor = guess && guess > 0 ? Math.max(guess / answer, answer / guess) : null;
  const verdict =
    factor === null
      ? null
      : factor <= 1.5
      ? { tone: 'success' as const, text: 'Spot on for a back-of-the-envelope estimate.' }
      : factor <= 3
      ? { tone: 'success' as const, text: 'Close: same order of magnitude. That is all an interview needs.' }
      : factor <= 10
      ? { tone: 'warning' as const, text: 'Within 10×. Check which step drifted.' }
      : { tone: 'danger' as const, text: 'Off by more than 10×. Walk through the steps to find the slip.' };
  const reveal = () => setState((s) => ({ ...s, revealed: true }));

  return (
    <div className="space-y-4">
      <div className="text-[15px] leading-7 text-slate-800 dark:text-slate-100">{prompt}</div>
      {hint && !state.revealed && <p className="text-sm text-slate-500 dark:text-slate-400">Hint: {hint}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          inputMode="decimal"
          value={state.guess}
          disabled={state.revealed}
          onChange={(e) => setState((s) => ({ ...s, guess: e.target.value }))}
          onKeyDown={(e) => e.key === 'Enter' && reveal()}
          placeholder="e.g. 3500 or 3.5k"
          aria-label={`Your estimate in ${unit}`}
          className="w-44 rounded-lg px-3 py-2 text-sm font-mono bg-white ring-1 ring-slate-300 text-slate-900 dark:bg-white/[0.04] dark:ring-white/15 dark:text-white disabled:opacity-70"
        />
        <span className="text-sm text-slate-600 dark:text-slate-300">{unit}</span>
        {!state.revealed ? (
          <Button variant="primary" onClick={reveal}>
            <Eye className="w-4 h-4" />
            {state.guess.trim() ? 'Check my estimate' : 'Just show me'}
          </Button>
        ) : (
          <Button variant="ghost" onClick={() => setState({ guess: '', revealed: false })}>
            <RotateCcw className="w-4 h-4" /> Try again
          </Button>
        )}
      </div>
      {state.revealed && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Stat label="Answer" value={<span className="font-mono">≈ {sig(answer)}</span>} hint={unit} />
            <Stat
              label="You said"
              value={<span className="font-mono">{guess !== null ? sig(guess) : '–'}</span>}
              hint={factor === null ? 'no estimate' : factor < 1.05 ? 'essentially exact' : `${sig(factor, 2)}× ${guess! > answer ? 'high' : 'low'}`}
              tone={verdict ? (verdict.tone === 'success' ? 'good' : verdict.tone === 'danger' ? 'bad' : 'neutral') : 'neutral'}
            />
          </div>
          {verdict && <Callout tone={verdict.tone}>{verdict.text}</Callout>}
          <div className="rounded-xl bg-slate-50 dark:bg-white/[0.04] p-4 text-sm leading-6 text-slate-600 dark:text-slate-300 space-y-1">{worked}</div>
        </div>
      )}
    </div>
  );
};

// =====================================================================
// Lesson 2: powers of two
// =====================================================================

const POWERS = [
  { p: 10, approx: '1 thousand', name: 'kilobyte (KB)', ex: 'a short JSON payload' },
  { p: 20, approx: '1 million', name: 'megabyte (MB)', ex: 'a compressed photo' },
  { p: 30, approx: '1 billion', name: 'gigabyte (GB)', ex: 'an hour of HD video' },
  { p: 40, approx: '1 trillion', name: 'terabyte (TB)', ex: 'a large SSD' },
  { p: 50, approx: '1 quadrillion', name: 'petabyte (PB)', ex: 'a large media archive' },
];
const UNIT_NAMES = ['bytes', 'KB', 'MB', 'GB', 'TB', 'PB'];

export const PowerLab: React.FC = () => {
  const [p, setP] = usePersistentState<string>('chapter2:lab:power', '30');
  const row = POWERS.find((r) => String(r.p) === p) ?? POWERS[2];
  const exact = Math.pow(2, row.p);
  const level = row.p / 10;
  const drift = ((exact / Math.pow(10, 3 * level) - 1) * 100).toFixed(1);

  return (
    <div className="space-y-5">
      <Segmented
        label="Power of two"
        value={p}
        onChange={setP}
        options={POWERS.map((r) => ({ value: String(r.p), label: `2^${r.p}` }))}
      />
      <div className="rounded-xl bg-slate-50 dark:bg-white/[0.04] p-4 space-y-2">
        <p className="text-xs font-medium text-slate-500 dark:text-slate-400">2^{row.p} written in each unit (1 unit = 1,024 of the one before)</p>
        <ul className="space-y-1.5">
          {UNIT_NAMES.map((u, i) => {
            const v = exact / Math.pow(1024, i);
            const here = i === level;
            if (v < 0.001) return null;
            return (
              <li
                key={u}
                className={`flex items-baseline justify-between gap-3 rounded-lg px-3 py-1.5 text-sm ${
                  here ? 'bg-indigo-600 text-white' : 'text-slate-700 dark:text-slate-300'
                }`}
              >
                <span className={here ? 'font-medium' : ''}>{u}</span>
                <span className="font-mono tabular-nums break-all text-right">{v >= 1 ? v.toLocaleString() : v.toFixed(3)}</span>
              </li>
            );
          })}
        </ul>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Stat label="Roughly" value={row.approx} hint="bytes" />
        <Stat label="Unit" value={row.name.split(' ')[1].replace(/[()]/g, '')} hint={`${row.name.split(' ')[0]}, e.g. ${row.ex}`} />
      </div>
      <Callout tone="idea">
        2^{row.p} is only {drift}% more than 10^{3 * level}. That is why estimates treat every step (KB, MB, GB…) as ×1,000.
      </Callout>
    </div>
  );
};

// =====================================================================
// Lesson 3: latency numbers (Dr. Dean's 2010 numbers, as in the book)
// =====================================================================

export const LATENCIES: { op: string; ns: number }[] = [
  { op: 'L1 cache reference', ns: 0.5 },
  { op: 'Branch mispredict', ns: 5 },
  { op: 'L2 cache reference', ns: 7 },
  { op: 'Mutex lock/unlock', ns: 100 },
  { op: 'Main memory reference', ns: 100 },
  { op: 'Compress 1 KB with Zippy', ns: 10_000 },
  { op: 'Send 2 KB over a 1 Gbps network', ns: 20_000 },
  { op: 'Read 1 MB sequentially from memory', ns: 250_000 },
  { op: 'Round trip within the same datacenter', ns: 500_000 },
  { op: 'Disk seek', ns: 10_000_000 },
  { op: 'Read 1 MB sequentially from the network', ns: 10_000_000 },
  { op: 'Read 1 MB sequentially from disk', ns: 30_000_000 },
  { op: 'Send packet CA → Netherlands → CA', ns: 150_000_000 },
];
const lat = (op: string) => LATENCIES.find((l) => l.op === op)!;

// Log axis from 0.1 ns (10^-1) to 1 s (10^9 ns).
const logPct = (ns: number) => ((Math.log10(ns) + 1) / 10) * 100;

export const LatencyBars: React.FC<{ highlight?: string[] }> = ({ highlight = [] }) => (
  <div role="img" aria-label="Log-scale bars of operation latencies from 0.5 ns for an L1 cache reference to 150 ms for a California to Netherlands round trip">
    <div className="space-y-2">
      {LATENCIES.map((item) => {
        const on = highlight.length === 0 || highlight.includes(item.op);
        return (
          <div key={item.op} className={`transition-opacity ${on ? '' : 'opacity-35'}`}>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="text-slate-800 dark:text-slate-200 min-w-0">{item.op}</span>
              <span className="font-mono tabular-nums text-slate-900 dark:text-white shrink-0">{fmtLatency(item.ns)}</span>
            </div>
            <div className="relative mt-1 h-2 rounded-full bg-slate-200 dark:bg-white/10 overflow-hidden">
              <div className="h-full rounded-full bg-indigo-500" style={{ width: `${logPct(item.ns)}%` }} />
            </div>
          </div>
        );
      })}
    </div>
    <div className="relative mt-2 h-4 text-[11px] text-slate-500 dark:text-slate-400">
      {[
        { ns: 1, l: '1 ns' },
        { ns: 1e3, l: '1 µs' },
        { ns: 1e6, l: '1 ms' },
        { ns: 1e9, l: '1 s' },
      ].map((t) => (
        <span key={t.l} className="absolute -translate-x-1/2 font-mono whitespace-nowrap" style={{ left: `${Math.min(94, logPct(t.ns))}%` }}>
          {t.l}
        </span>
      ))}
    </div>
  </div>
);

const PAIRS: [string, string][] = [
  ['Disk seek', 'Round trip within the same datacenter'],
  ['Read 1 MB sequentially from memory', 'Round trip within the same datacenter'],
  ['Read 1 MB sequentially from the network', 'Read 1 MB sequentially from disk'],
  ['Compress 1 KB with Zippy', 'Send 2 KB over a 1 Gbps network'],
  ['Send packet CA → Netherlands → CA', 'Read 1 MB sequentially from disk'],
  ['Main memory reference', 'L2 cache reference'],
];

export const SlowerGame: React.FC = () => {
  const [i, setI] = useState(0);
  const [pick, setPick] = useState<string | null>(null);
  const [score, setScore] = useState({ right: 0, played: 0 });
  const [a, b] = PAIRS[i % PAIRS.length];
  const A = lat(a);
  const B = lat(b);
  const slow = A.ns > B.ns ? A : B;
  const fast = slow === A ? B : A;
  const ratio = slow.ns / fast.ns;

  const choose = (op: string) => {
    if (pick) return;
    setPick(op);
    setScore((s) => ({ right: s.right + (op === slow.op ? 1 : 0), played: s.played + 1 }));
  };

  return (
    <div className="space-y-5">
      <p className="text-sm text-slate-500 dark:text-slate-400">
        Pair {(i % PAIRS.length) + 1} of {PAIRS.length}: which one is slower?
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        {[A, B].map((x) => {
          const state = !pick ? 'idle' : x.op === slow.op ? 'slow' : 'fast';
          return (
            <button
              key={x.op}
              onClick={() => choose(x.op)}
              disabled={!!pick}
              className={`rounded-xl px-4 py-3 text-left text-sm font-medium ring-1 transition-colors ${
                state === 'idle'
                  ? 'bg-white ring-slate-200 text-slate-800 hover:ring-indigo-300 dark:bg-white/[0.03] dark:ring-white/10 dark:text-slate-100'
                  : state === 'slow'
                  ? 'bg-rose-50 ring-rose-300 text-rose-900 dark:bg-rose-400/[0.1] dark:ring-rose-400/40 dark:text-rose-100'
                  : 'bg-emerald-50 ring-emerald-300 text-emerald-900 dark:bg-emerald-400/[0.1] dark:ring-emerald-400/40 dark:text-emerald-100'
              }`}
            >
              {x.op}
              {pick && <span className="block mt-1 font-mono font-normal">{fmtLatency(x.ns)}</span>}
            </button>
          );
        })}
      </div>
      {pick && (
        <>
          <Callout tone={pick === slow.op ? 'success' : 'danger'} title={pick === slow.op ? 'Right' : 'Not quite'}>
            {slow.op} is about <strong>{sig(ratio, 2)}×</strong> slower than {fast.op.charAt(0).toLowerCase() + fast.op.slice(1)}.
          </Callout>
          <Button
            variant="primary"
            onClick={() => {
              setI((n) => n + 1);
              setPick(null);
            }}
          >
            Next pair <ChevronRight className="w-4 h-4" />
          </Button>
        </>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Stat label="Correct" value={score.right} tone={score.right ? 'good' : 'neutral'} />
        <Stat label="Played" value={score.played} />
      </div>
    </div>
  );
};

// =====================================================================
// Lesson 4: availability nines
// =====================================================================

export const NINES = [99, 99.9, 99.99, 99.999, 99.9999];
const NINE_NAMES: Record<number, string> = {
  99: 'two nines',
  99.9: 'three nines',
  99.99: 'four nines',
  99.999: 'five nines',
  99.9999: 'six nines',
};
export const downtimeFor = (pct: number) => {
  const f = 1 - pct / 100;
  const year = f * 365.25 * SECONDS_PER_DAY;
  return { day: f * SECONDS_PER_DAY, week: f * 7 * SECONDS_PER_DAY, month: year / 12, year };
};
/** Illustrative, not from the book. */
export const infraFor = (pct: number) => {
  if (pct < 99.9) return 'A single server with backups; manual recovery is acceptable.';
  if (pct < 99.99) return 'Redundant web servers behind a load balancer; a database replica with failover.';
  if (pct < 99.999) return 'Automated failover across availability zones; no single point of failure.';
  if (pct < 99.9999) return 'Multi-region active-active with automated health checks and traffic shifting.';
  return 'Multi-region plus extreme automation; rarely promised in practice.';
};

export const NinesLab: React.FC = () => {
  const [pick, setPick] = usePersistentState<string>('chapter2:lab:nines', '99.99');
  const pct = Number(pick);
  const d = downtimeFor(pct);
  // Log scale for downtime per year: 1 s .. 1 week.
  const bar = (sec: number) => Math.max(3, ((Math.log10(sec) - 0) / Math.log10(7 * SECONDS_PER_DAY)) * 100);

  return (
    <div className="space-y-5">
      <div className="overflow-x-auto -mx-1 px-1">
        <Segmented label="Availability target" value={pick} onChange={setPick} options={NINES.map((n) => ({ value: String(n), label: `${n}%` }))} />
      </div>
      <div className="rounded-xl bg-slate-50 dark:bg-white/[0.04] p-4 space-y-2.5">
        <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Allowed downtime per year (log scale)</p>
        {NINES.map((n) => {
          const y = downtimeFor(n).year;
          const on = n === pct;
          return (
            <div key={n}>
              <div className={`flex justify-between text-sm ${on ? 'font-medium text-slate-900 dark:text-white' : 'text-slate-500 dark:text-slate-400'}`}>
                <span>
                  <span className="font-mono">{n}%</span> {NINE_NAMES[n]}
                </span>
                <span className="font-mono tabular-nums">{formatDuration(y)}</span>
              </div>
              <div className="mt-1 h-2 rounded-full bg-slate-200 dark:bg-white/10 overflow-hidden">
                <div className={`h-full rounded-full ${on ? 'bg-indigo-500' : 'bg-slate-400/60 dark:bg-white/25'}`} style={{ width: `${bar(y)}%` }} />
              </div>
            </div>
          );
        })}
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Stat label="Per year" value={<span className="text-lg sm:text-2xl">{formatDuration(d.year)}</span>} />
        <Stat label="Per month" value={<span className="text-lg sm:text-2xl">{formatDuration(d.month)}</span>} />
        <Stat label="Per day" value={<span className="text-lg sm:text-2xl">{formatDuration(d.day)}</span>} />
      </div>
      <Callout tone="info" title="Typical approach (illustrative)">
        {infraFor(pct)}
      </Callout>
    </div>
  );
};

// =====================================================================
// Lesson 7: Twitter, one step at a time
// =====================================================================

const TWITTER_STEPS: { title: string; body: React.ReactNode }[] = [
  {
    title: 'Write down the assumptions',
    body: (
      <ul className="list-disc pl-5 space-y-1">
        <li>
          300 million <Term term="monthly active users (MAU)">Distinct users who use the product at least once in a month.</Term>
        </li>
        <li>50% of them use it every day</li>
        <li>Each user posts 2 tweets per day on average</li>
        <li>10% of tweets contain media, about 1 MB each</li>
        <li>A tweet also has a 64-byte ID and ~140 bytes of text</li>
        <li>Data is stored for 5 years</li>
      </ul>
    ),
  },
  {
    title: 'Daily active users and tweets per day',
    body: (
      <>
        <Step
          label={
            <>
              <Term term="DAU">Daily active users: distinct users on a given day. Request volume is driven by DAU, not MAU.</Term> =
            </>
          }
          math="300 million × 50% = 150 million"
        />
        <Step label="Tweets per day =" math="150 million × 2 = 300 million" />
      </>
    ),
  },
  {
    title: 'Average and peak QPS',
    body: (
      <EstimateCheck
        id="twitter-qps"
        prompt={
          <>
            With 300 million tweets per day, what is the average{' '}
            <Term term="QPS">Queries (requests) per second. Here: tweets written per second.</Term> for posting tweets?
          </>
        }
        unit="QPS"
        answer={300_000_000 / SECONDS_PER_DAY}
        hint="divide by the seconds in a day."
        worked={
          <>
            <Step label="Seconds per day:" math="24 h × 3,600 s = 86,400 s" />
            <Step label="Average QPS:" math="300,000,000 / 86,400 ≈ 3,472 → book: ~3,500" />
            <Step label="Peak QPS (book assumes 2× average):" math="2 × 3,500 ≈ 7,000" />
            <p>Shortcut: 300 million / 100,000 = 3,000. Same order of magnitude.</p>
          </>
        }
      />
    ),
  },
  {
    title: 'Media storage per day',
    body: (
      <EstimateCheck
        id="twitter-media-day"
        prompt={<>How much new media storage is needed per day? The book estimates only media, since it dominates.</>}
        unit="TB/day"
        answer={30}
        worked={
          <>
            <Step label="Tweets with media:" math="300 million × 10% = 30 million" />
            <Step label="Bytes:" math="30 million × 1 MB = 30 × 10^6 × 10^6 B = 30 × 10^12 B" />
            <Step label="Media per day:" math="= 30 TB/day" />
            <p>Text is negligible: 300 million × ~204 bytes ≈ 61 GB/day, about 0.2% of the media volume.</p>
          </>
        }
      />
    ),
  },
  {
    title: 'Media storage over 5 years',
    body: (
      <EstimateCheck
        id="twitter-media-5y"
        prompt={<>How much media storage after 5 years?</>}
        unit="PB"
        answer={(30 * 365 * 5) / 1000}
        worked={
          <>
            <Step label="Days:" math="365 × 5 = 1,825 days" />
            <Step label="Total:" math="30 TB × 1,825 = 54,750 TB" />
            <Step label="Convert:" math="54,750 TB / 1,000 ≈ 55 PB (the book's answer)" />
          </>
        }
      />
    ),
  },
];

export const TwitterWalk: React.FC = () => {
  const [step, setStep] = usePersistentState<number>('chapter2:twitter:step', 0);
  const shown = Math.min(Math.max(0, step), TWITTER_STEPS.length - 1);
  const last = shown === TWITTER_STEPS.length - 1;
  return (
    <div className="space-y-5">
      <ol className="space-y-5">
        {TWITTER_STEPS.slice(0, shown + 1).map((s, i) => (
          <li key={s.title} className={`flex gap-3 ${i < shown ? 'opacity-70' : ''}`}>
            <span
              className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                i < shown ? 'bg-emerald-500 text-white' : 'bg-indigo-600 text-white'
              }`}
            >
              {i + 1}
            </span>
            <div className="min-w-0 flex-1 space-y-2 text-sm leading-6 text-slate-700 dark:text-slate-300">
              <p className="font-medium text-slate-900 dark:text-white">{s.title}</p>
              {s.body}
            </div>
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap gap-2">
        {!last ? (
          <Button variant="primary" onClick={() => setStep(shown + 1)}>
            Next step <ChevronRight className="w-4 h-4" />
          </Button>
        ) : (
          <Callout tone="success" className="w-full" title="Done">
            ~3,500 average QPS, ~7,000 peak QPS, ~30 TB of new media per day and ~55 PB after 5 years.
          </Callout>
        )}
        {shown > 0 && (
          <Button variant="ghost" onClick={() => setStep(0)}>
            <RotateCcw className="w-4 h-4" /> Start over
          </Button>
        )}
      </div>
    </div>
  );
};

// =====================================================================
// Lesson 9: the full playground
// =====================================================================

type Preset = 'twitter' | 'youtube' | 'whatsapp' | 'tinyurl' | 'custom';

interface PlaygroundInputs {
  preset: Preset;
  mauMillions: number;
  dailyActivePct: number;
  writesPerUser: number;
  readsPerWrite: number;
  textBytes: number;
  mediaPct: number;
  mediaKB: number;
  retentionYears: number;
  peakFactor: number;
  hotPct: number;
  cacheMedia: boolean;
  qpsPerServer: number;
}

// Twitter preset uses the book's Chapter 2 assumptions. Reads-per-write is not given in the book
// (it only estimates tweet QPS and media storage), so 100 is an illustrative assumption.
const PRESETS: Record<Exclude<Preset, 'custom'>, Omit<PlaygroundInputs, 'preset'>> = {
  twitter: { mauMillions: 300, dailyActivePct: 50, writesPerUser: 2, readsPerWrite: 100, textBytes: 204, mediaPct: 10, mediaKB: 1000, retentionYears: 5, peakFactor: 2, hotPct: 20, cacheMedia: false, qpsPerServer: 1000 },
  youtube: { mauMillions: 1000, dailyActivePct: 50, writesPerUser: 0.1, readsPerWrite: 500, textBytes: 1000, mediaPct: 100, mediaKB: 50000, retentionYears: 10, peakFactor: 2, hotPct: 20, cacheMedia: false, qpsPerServer: 1000 },
  whatsapp: { mauMillions: 2000, dailyActivePct: 50, writesPerUser: 40, readsPerWrite: 1, textBytes: 100, mediaPct: 15, mediaKB: 100, retentionYears: 3, peakFactor: 2, hotPct: 20, cacheMedia: false, qpsPerServer: 1000 },
  tinyurl: { mauMillions: 100, dailyActivePct: 100, writesPerUser: 1, readsPerWrite: 100, textBytes: 500, mediaPct: 0, mediaKB: 0, retentionYears: 10, peakFactor: 2, hotPct: 20, cacheMedia: false, qpsPerServer: 1000 },
};

const NumField: React.FC<{
  label: React.ReactNode;
  unit: string;
  value: number;
  min: number;
  max: number;
  step: number;
  help?: React.ReactNode;
  onChange: (v: number) => void;
}> = ({ label, unit, value, min, max, step, help, onChange }) => (
  <div className="space-y-1.5">
    <div className="flex items-center justify-between gap-2 text-sm">
      <span className="font-medium text-slate-700 dark:text-slate-200">{label}</span>
      <span className="flex items-center gap-1.5">
        <input
          type="number"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => {
            const v = Number(e.target.value);
            if (!Number.isNaN(v)) onChange(Math.min(max, Math.max(min, v)));
          }}
          className="w-24 rounded-md px-2 py-1 text-right text-sm font-mono bg-white ring-1 ring-slate-300 text-slate-900 dark:bg-white/[0.04] dark:ring-white/15 dark:text-white"
          aria-label={typeof label === 'string' ? label : unit}
        />
        <span className="w-16 text-xs text-slate-500 dark:text-slate-400">{unit}</span>
      </span>
    </div>
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={Math.min(value, max)}
      onChange={(e) => onChange(Number(e.target.value))}
      className="w-full accent-indigo-600"
      aria-label={typeof label === 'string' ? label : unit}
    />
    {help && <p className="text-xs text-slate-500 dark:text-slate-400">{help}</p>}
  </div>
);

const Section: React.FC<{ title: string; summary: string; open?: boolean; children: React.ReactNode }> = ({ title, summary, open, children }) => (
  <details open={open} className="group rounded-xl ring-1 ring-slate-200 dark:ring-white/10 [&_summary::-webkit-details-marker]:hidden">
    <summary className="cursor-pointer select-none px-4 py-3 text-sm font-medium text-slate-700 dark:text-slate-200">
      {title}
      <span className="ml-2 font-normal text-slate-500 dark:text-slate-400">{summary}</span>
    </summary>
    <div className="grid gap-5 sm:grid-cols-2 px-4 pb-4">{children}</div>
  </details>
);

export const Playground: React.FC = () => {
  const [pg, setPg] = usePersistentState<PlaygroundInputs>('chapter2:playground', { preset: 'twitter', ...PRESETS.twitter });
  const setField = <K extends keyof PlaygroundInputs>(key: K, value: PlaygroundInputs[K]) => setPg((p) => ({ ...p, [key]: value, preset: 'custom' }));
  const applyPreset = (p: Preset) => setPg((prev) => (p === 'custom' ? { ...prev, preset: 'custom' } : { preset: p, ...PRESETS[p] }));

  // Every result comes from `pg`.
  const dau = pg.mauMillions * 1e6 * (pg.dailyActivePct / 100);
  const writesPerDay = dau * pg.writesPerUser;
  const readsPerDay = writesPerDay * pg.readsPerWrite;
  const avgWriteQps = writesPerDay / SECONDS_PER_DAY;
  const avgReadQps = readsPerDay / SECONDS_PER_DAY;
  const peakWriteQps = avgWriteQps * pg.peakFactor;
  const peakReadQps = avgReadQps * pg.peakFactor;

  const mediaBytesPerWrite = (pg.mediaPct / 100) * pg.mediaKB * 1000;
  const bytesPerWrite = pg.textBytes + mediaBytesPerWrite;
  const textPerDay = writesPerDay * pg.textBytes;
  const mediaPerDay = writesPerDay * mediaBytesPerWrite;
  const storagePerDay = textPerDay + mediaPerDay;
  const storageTotal = storagePerDay * 365 * pg.retentionYears;

  const ingressPerSec = storagePerDay / SECONDS_PER_DAY;
  const egressPerSec = (readsPerDay * bytesPerWrite) / SECONDS_PER_DAY;

  // A cache holds each hot item once, so size it from unique data created per day, not from read volume.
  const cacheableDaily = pg.cacheMedia ? storagePerDay : textPerDay;
  const cacheBytes = cacheableDaily * (pg.hotPct / 100);

  const peakTotalQps = peakReadQps + peakWriteQps;
  const serversNeeded = Math.max(1, Math.ceil(peakTotalQps / Math.max(1, pg.qpsPerServer)));

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="overflow-x-auto -mx-1 px-1">
          <Segmented
            label="Preset"
            value={pg.preset}
            onChange={applyPreset}
            options={[
              { value: 'twitter', label: 'Twitter' },
              { value: 'youtube', label: 'Video' },
              { value: 'whatsapp', label: 'Chat' },
              { value: 'tinyurl', label: 'Short URL' },
              { value: 'custom', label: 'Custom' },
            ]}
          />
        </div>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {pg.preset === 'twitter'
            ? "Users, activity, media and retention match the book. The read ratio, cache share and per-server capacity are illustrative."
            : pg.preset === 'custom'
            ? 'Your own numbers. Pick a preset to start over.'
            : 'Illustrative numbers, not from the book.'}
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <Stat label="Peak write QPS" value={<span className="font-mono text-xl">{fmtCount(peakWriteQps)}</span>} hint={`avg ${fmtCount(avgWriteQps)}`} />
        <Stat label="Peak read QPS" value={<span className="font-mono text-xl">{fmtCount(peakReadQps)}</span>} hint={`avg ${fmtCount(avgReadQps)}`} />
        <Stat label="Storage per day" value={<span className="font-mono text-xl">{fmtBytes(storagePerDay)}</span>} hint={`media ${fmtBytes(mediaPerDay)}`} />
        <Stat label={`Storage, ${pg.retentionYears} years`} value={<span className="font-mono text-xl">{fmtBytes(storageTotal)}</span>} />
        <Stat label="Cache memory" value={<span className="font-mono text-xl">{fmtBytes(cacheBytes)}</span>} hint={`${pg.hotPct}% of new ${pg.cacheMedia ? 'data' : 'text'}/day`} />
        <Stat label="App servers at peak" value={<span className="font-mono text-xl">~{serversNeeded.toLocaleString()}</span>} hint={`egress ${fmtBytes(egressPerSec)}/s`} />
      </div>

      <div className="space-y-3">
        <Section title="Traffic" summary={`${pg.mauMillions}M MAU, ${pg.dailyActivePct}% daily, ${pg.writesPerUser} writes each`} open>
          <NumField label="Monthly active users" unit="million" value={pg.mauMillions} min={1} max={3000} step={1} onChange={(v) => setField('mauMillions', v)} />
          <NumField label="Daily active share" unit="% of MAU" value={pg.dailyActivePct} min={1} max={100} step={1} help={<>DAU = {fmtCount(dau)}</>} onChange={(v) => setField('dailyActivePct', v)} />
          <NumField label="Writes per user per day" unit="writes" value={pg.writesPerUser} min={0.1} max={100} step={0.1} onChange={(v) => setField('writesPerUser', v)} />
          <NumField label="Reads per write" unit="reads" value={pg.readsPerWrite} min={1} max={1000} step={1} onChange={(v) => setField('readsPerWrite', v)} />
          <NumField label="Peak-to-average" unit="×" value={pg.peakFactor} min={1} max={10} step={0.5} help="The book uses peak = 2 × average." onChange={(v) => setField('peakFactor', v)} />
        </Section>
        <Section title="Data" summary={`${pg.textBytes} B text, ${pg.mediaPct}% media of ${sig(pg.mediaKB)} KB, ${pg.retentionYears} years`}>
          <NumField label="Text per write" unit="bytes" value={pg.textBytes} min={0} max={10000} step={1} help="Book's tweet: 64-byte ID + 140 bytes ≈ 204 bytes." onChange={(v) => setField('textBytes', v)} />
          <NumField label="Writes with media" unit="%" value={pg.mediaPct} min={0} max={100} step={1} onChange={(v) => setField('mediaPct', v)} />
          <NumField label="Media size" unit="KB" value={pg.mediaKB} min={0} max={100000} step={10} help="Book's tweet media: 1 MB = 1,000 KB." onChange={(v) => setField('mediaKB', v)} />
          <NumField label="Retention" unit="years" value={pg.retentionYears} min={1} max={20} step={1} onChange={(v) => setField('retentionYears', v)} />
        </Section>
        <Section title="Infrastructure" summary={`cache ${pg.hotPct}% hot, ${pg.qpsPerServer.toLocaleString()} QPS per server`}>
          <NumField label="Hot share to cache" unit="%" value={pg.hotPct} min={1} max={100} step={1} help="80/20 rule: cache the hottest ~20% of each day's new data." onChange={(v) => setField('hotPct', v)} />
          <NumField label="QPS one server handles" unit="QPS" value={pg.qpsPerServer} min={50} max={50000} step={50} help="A rough assumption. Benchmark the real workload." onChange={(v) => setField('qpsPerServer', v)} />
          <label className="flex items-start gap-2 text-sm text-slate-700 dark:text-slate-200 cursor-pointer">
            <input type="checkbox" checked={pg.cacheMedia} onChange={(e) => setField('cacheMedia', e.target.checked)} className="mt-1 h-4 w-4 accent-indigo-600" />
            <span>
              <span className="font-medium">Cache media in RAM too</span>
              <span className="block text-xs text-slate-500 dark:text-slate-400">Usually off: media is served from object storage through a CDN.</span>
            </span>
          </label>
        </Section>
      </div>

      <details className="rounded-xl bg-slate-50 dark:bg-white/[0.03] [&_summary::-webkit-details-marker]:hidden">
        <summary className="cursor-pointer select-none px-4 py-3 text-sm font-medium text-slate-700 dark:text-slate-200">Show the arithmetic</summary>
        <div className="px-4 pb-4 space-y-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
          <Step label="Write QPS:" math={`${fmtCount(dau)} DAU × ${pg.writesPerUser} = ${fmtCount(writesPerDay)}/day ÷ 86,400 = ${fmtCount(avgWriteQps)}; × ${pg.peakFactor} peak`} />
          <Step label="Read QPS:" math={`write QPS × ${pg.readsPerWrite} reads per write`} />
          <Step label="Storage:" math={`${fmtCount(writesPerDay)} × (${pg.textBytes} B + ${pg.mediaPct}% × ${sig(pg.mediaKB)} KB) = ${fmtBytes(storagePerDay)}/day; × 365 × ${pg.retentionYears}`} />
          <Step
            label={
              <>
                <Term term="Ingress">Data flowing into your system, e.g. uploads.</Term> /{' '}
                <Term term="egress">Data flowing out of your system to users, e.g. serving images.</Term>:
              </>
            }
            math={`${fmtBytes(ingressPerSec)}/s in, ${fmtBytes(egressPerSec)}/s out (reads × ${fmtBytes(bytesPerWrite)} avg item)`}
          />
          <Step label="Cache:" math={`${pg.hotPct}% × ${fmtBytes(cacheableDaily)} new ${pg.cacheMedia ? 'data' : 'text'}/day`} />
          <Step label="Servers:" math={`${fmtCount(peakTotalQps)} peak QPS ÷ ${pg.qpsPerServer.toLocaleString()} per server`} />
        </div>
      </details>
    </div>
  );
};
