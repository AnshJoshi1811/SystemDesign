import React from 'react';
import {
  Calculator,
  Database,
  HardDrive,
  Cpu,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Lightbulb,
  TrendingUp,
  Wifi,
  ShieldAlert,
  FileText,
  Check,
  Eye,
  RotateCcw,
  ArrowRight,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { usePersistentState } from '../lib/usePersistentState';
import { LessonGoal, Takeaway, Term, Quiz } from './learn/LearningKit';

interface Chapter2EstimationProps {
  isDarkMode?: boolean;
}

type SectionTab = 'intro' | 'why' | 'power2' | 'latency' | 'availability' | 'twitter' | 'tips' | 'playground';

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
  twitter: {
    mauMillions: 300, dailyActivePct: 50, writesPerUser: 2, readsPerWrite: 100, textBytes: 204,
    mediaPct: 10, mediaKB: 1000, retentionYears: 5, peakFactor: 2, hotPct: 20, cacheMedia: false, qpsPerServer: 1000,
  },
  youtube: {
    mauMillions: 1000, dailyActivePct: 50, writesPerUser: 0.1, readsPerWrite: 500, textBytes: 1000,
    mediaPct: 100, mediaKB: 50000, retentionYears: 10, peakFactor: 2, hotPct: 20, cacheMedia: false, qpsPerServer: 1000,
  },
  whatsapp: {
    mauMillions: 2000, dailyActivePct: 50, writesPerUser: 40, readsPerWrite: 1, textBytes: 100,
    mediaPct: 15, mediaKB: 100, retentionYears: 3, peakFactor: 2, hotPct: 20, cacheMedia: false, qpsPerServer: 1000,
  },
  tinyurl: {
    mauMillions: 100, dailyActivePct: 100, writesPerUser: 1, readsPerWrite: 100, textBytes: 500,
    mediaPct: 0, mediaKB: 0, retentionYears: 10, peakFactor: 2, hotPct: 20, cacheMedia: false, qpsPerServer: 1000,
  },
};

const SECONDS_PER_DAY = 86_400;

// ---------- formatting helpers (decimal units, as the book's arithmetic uses) ----------
const sig = (n: number, digits = 3) => (n === 0 ? '0' : Number(n.toPrecision(digits)).toLocaleString());

const fmtBytes = (bytes: number) => {
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB'];
  let v = bytes;
  let i = 0;
  while (v >= 1000 && i < units.length - 1) {
    v /= 1000;
    i++;
  }
  return `${sig(v)} ${units[i]}`;
};

const fmtCount = (n: number) => {
  if (n >= 1e9) return `${sig(n / 1e9)} billion`;
  if (n >= 1e6) return `${sig(n / 1e6)} million`;
  return Math.round(n).toLocaleString();
};

const fmtLatency = (ns: number) => {
  if (ns < 1_000) return `${ns} ns`;
  if (ns < 1_000_000) return `${sig(ns / 1_000)} µs`;
  return `${sig(ns / 1_000_000)} ms`;
};

const formatDuration = (sec: number) => {
  if (sec < 1) return `${sig(sec * 1000)} ms`;
  if (sec < 60) return `${sig(sec)} s`;
  if (sec < 3600) return `${sig(sec / 60)} min`;
  if (sec < SECONDS_PER_DAY) return `${sig(sec / 3600)} h`;
  if (sec < 365 * SECONDS_PER_DAY) return `${sig(sec / SECONDS_PER_DAY)} days`;
  return `${sig(sec / (365 * SECONDS_PER_DAY))} years`;
};

// ---------- shared styles ----------
const panel = 'p-5 sm:p-6 rounded-3xl border space-y-5 bg-white border-slate-200 dark:bg-[#1c1c1e] dark:border-slate-800';
const inset = 'p-4 rounded-2xl border bg-slate-50 border-slate-200 dark:bg-slate-950 dark:border-slate-800';
const h3 = 'text-base font-bold text-slate-900 dark:text-white';
const body = 'text-sm leading-relaxed text-slate-600 dark:text-slate-300';
const sub = 'text-sm text-slate-500 dark:text-slate-400';
const strongText = 'text-slate-900 dark:text-white';

// ---------- latency (Dr. Dean's 2010 numbers, Table 2-2 in the book) ----------
type LatencyTier = 'cpu' | 'memory' | 'network' | 'disk';
const LATENCIES: { op: string; ns: number; tier: LatencyTier }[] = [
  { op: 'L1 cache reference', ns: 0.5, tier: 'cpu' },
  { op: 'Branch mispredict', ns: 5, tier: 'cpu' },
  { op: 'L2 cache reference', ns: 7, tier: 'cpu' },
  { op: 'Mutex lock/unlock', ns: 100, tier: 'cpu' },
  { op: 'Main memory reference', ns: 100, tier: 'memory' },
  { op: 'Compress 1 KB with Zippy', ns: 10_000, tier: 'cpu' },
  { op: 'Send 2 KB over a 1 Gbps network', ns: 20_000, tier: 'network' },
  { op: 'Read 1 MB sequentially from memory', ns: 250_000, tier: 'memory' },
  { op: 'Round trip within the same datacenter', ns: 500_000, tier: 'network' },
  { op: 'Disk seek', ns: 10_000_000, tier: 'disk' },
  { op: 'Read 1 MB sequentially from the network', ns: 10_000_000, tier: 'network' },
  { op: 'Read 1 MB sequentially from disk', ns: 30_000_000, tier: 'disk' },
  { op: 'Send packet CA → Netherlands → CA', ns: 150_000_000, tier: 'network' },
];
const TIER_STYLE: Record<LatencyTier, { bar: string; label: string }> = {
  cpu: { bar: 'bg-emerald-500', label: 'CPU' },
  memory: { bar: 'bg-blue-500', label: 'Memory' },
  network: { bar: 'bg-amber-500', label: 'Network' },
  disk: { bar: 'bg-rose-500', label: 'Disk' },
};
// Log axis from 0.1 ns (10^-1) to 1 s (10^9 ns): 10 decades.
const LOG_MIN = -1;
const LOG_MAX = 9;
const logPct = (ns: number) => ((Math.log10(ns) - LOG_MIN) / (LOG_MAX - LOG_MIN)) * 100;

// ---------- availability ----------
const NINES = [99, 99.9, 99.99, 99.999, 99.9999];
const NINE_NAMES: Record<number, string> = {
  99: 'two nines', 99.9: 'three nines', 99.99: 'four nines', 99.999: 'five nines', 99.9999: 'six nines',
};
const downtimeFor = (pct: number) => {
  const f = 1 - pct / 100;
  const year = f * 365.25 * SECONDS_PER_DAY;
  return { day: f * SECONDS_PER_DAY, week: f * 7 * SECONDS_PER_DAY, month: year / 12, year };
};
// One source of truth for the "typical approach" shown in both the cards and the table (illustrative, not from the book).
const infraFor = (pct: number) => {
  if (pct < 99.9) return 'Single server with backups; manual recovery is acceptable';
  if (pct < 99.99) return 'Redundant web servers behind a load balancer; database replica with failover';
  if (pct < 99.999) return 'Automated failover across availability zones; no single point of failure';
  if (pct < 99.9999) return 'Multi-region active-active with automated health checks and traffic shifting';
  return 'Multi-region plus extreme automation; rarely promised in practice';
};

// ---------- estimate-first self-check ----------
const parseGuess = (raw: string): number | null => {
  const m = raw.replace(/,/g, '').trim().match(/^(\d*\.?\d+)\s*([kmbt])?/i);
  if (!m) return null;
  const mult: Record<string, number> = { k: 1e3, m: 1e6, b: 1e9, t: 1e12 };
  return parseFloat(m[1]) * (m[2] ? mult[m[2].toLowerCase()] : 1);
};

const EstimateCheck: React.FC<{
  id: string;
  prompt: React.ReactNode;
  unit: string;
  answer: number;
  worked: React.ReactNode;
  hint?: React.ReactNode;
}> = ({ id, prompt, unit, answer, worked, hint }) => {
  const [state, setState] = usePersistentState<{ guess: string; revealed: boolean }>(`chapter2:estimate:${id}`, {
    guess: '',
    revealed: false,
  });
  const guess = parseGuess(state.guess);
  const factor = guess && guess > 0 ? Math.max(guess / answer, answer / guess) : null;
  const verdict =
    factor === null
      ? null
      : factor <= 1.5
      ? { text: 'Spot on for a back-of-the-envelope estimate.', tone: 'text-emerald-700 dark:text-emerald-300' }
      : factor <= 3
      ? { text: 'Close: same order of magnitude. That is all an interview needs.', tone: 'text-emerald-700 dark:text-emerald-300' }
      : factor <= 10
      ? { text: 'Within 10×. Check which step drifted.', tone: 'text-amber-700 dark:text-amber-300' }
      : { text: 'Off by more than 10×. Walk through the steps below to find the slip.', tone: 'text-rose-700 dark:text-rose-300' };

  return (
    <div className="rounded-2xl border border-indigo-200 bg-indigo-50/50 dark:border-indigo-400/20 dark:bg-indigo-400/[0.05] p-4 space-y-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-indigo-700 dark:text-indigo-300">Estimate first, then reveal</p>
      <div className="text-sm text-slate-800 dark:text-slate-100 leading-relaxed">{prompt}</div>
      {hint && !state.revealed && <p className="text-xs text-slate-500 dark:text-slate-400">Hint: {hint}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          inputMode="decimal"
          value={state.guess}
          disabled={state.revealed}
          onChange={(e) => setState((s) => ({ ...s, guess: e.target.value }))}
          onKeyDown={(e) => e.key === 'Enter' && setState((s) => ({ ...s, revealed: true }))}
          placeholder="Your estimate (e.g. 3500 or 3.5k)"
          aria-label={`Your estimate in ${unit}`}
          className="w-56 px-3 py-2 rounded-lg border text-sm font-mono bg-white border-slate-300 text-slate-900 dark:bg-slate-950 dark:border-slate-700 dark:text-white disabled:opacity-70"
        />
        <span className="text-sm font-mono text-slate-600 dark:text-slate-300">{unit}</span>
        {!state.revealed ? (
          <button
            onClick={() => setState((s) => ({ ...s, revealed: true }))}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold bg-indigo-600 text-white hover:bg-indigo-500"
          >
            <Eye className="w-4 h-4" />
            {state.guess.trim() ? 'Check my estimate' : 'Just show me'}
          </button>
        ) : (
          <button
            onClick={() => setState({ guess: '', revealed: false })}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/[0.06]"
          >
            <RotateCcw className="w-3.5 h-3.5" /> Try again
          </button>
        )}
      </div>
      {state.revealed && (
        <div className="rounded-xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 p-3 space-y-2">
          <p className="text-sm text-slate-800 dark:text-slate-100">
            Answer: <strong className="font-mono">≈ {sig(answer)} {unit}</strong>
            {guess !== null && factor !== null && (
              <>
                {' '}· You said <span className="font-mono">{sig(guess)} {unit}</span> ({factor < 1.05 ? 'essentially exact' : `${sig(factor, 2)}× ${guess > answer ? 'high' : 'low'}`})
              </>
            )}
          </p>
          {verdict && <p className={`text-sm font-semibold ${verdict.tone}`}>{verdict.text}</p>}
          <div className="text-sm text-slate-600 dark:text-slate-300 space-y-1 leading-relaxed">{worked}</div>
        </div>
      )}
    </div>
  );
};

/** One line of worked arithmetic: prose label, then the math in monospace. */
const Step: React.FC<{ label: React.ReactNode; math: React.ReactNode }> = ({ label, math }) => (
  <p>
    <span>{label} </span>
    <span className="font-mono text-slate-900 dark:text-white">{math}</span>
  </p>
);

// ---------- playground input ----------
const NumField: React.FC<{
  label: React.ReactNode;
  unit: string;
  value: number;
  min: number;
  max: number;
  step: number;
  help: React.ReactNode;
  onChange: (v: number) => void;
}> = ({ label, unit, value, min, max, step, help, onChange }) => (
  <div className={`${inset} space-y-2`}>
    <div className="flex items-center justify-between gap-2">
      <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">{label}</span>
      <span className="flex items-center gap-1">
        <input
          type="number"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => {
            const v = Number(e.target.value);
            if (!Number.isNaN(v)) onChange(Math.max(min, v));
          }}
          className="w-24 px-2 py-1 rounded-lg border text-right text-sm font-mono bg-white border-slate-300 text-slate-900 dark:bg-slate-900 dark:border-slate-700 dark:text-white"
        />
        <span className="text-xs text-slate-500 dark:text-slate-400 w-14">{unit}</span>
      </span>
    </div>
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={Math.min(value, max)}
      onChange={(e) => onChange(Number(e.target.value))}
      className="w-full accent-amber-500 cursor-pointer"
      aria-label={typeof label === 'string' ? label : unit}
    />
    <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">{help}</p>
  </div>
);

export const Chapter2Estimation: React.FC<Chapter2EstimationProps> = () => {
  const [activeTab, setActiveTab] = usePersistentState<SectionTab>('chapter2:tab', 'intro');
  const [powerExponent, setPowerExponent] = usePersistentState<number>('chapter2:power', 30);
  const [slaNines, setSlaNines] = usePersistentState<number>('chapter2:sla', 99.99);
  const [pg, setPg] = usePersistentState<PlaygroundInputs>('chapter2:playground', { preset: 'twitter', ...PRESETS.twitter });

  const setField = <K extends keyof PlaygroundInputs>(key: K, value: PlaygroundInputs[K]) =>
    setPg((p) => ({ ...p, [key]: value, preset: 'custom' }));
  const applyPreset = (p: Preset) => setPg((prev) => (p === 'custom' ? { ...prev, preset: 'custom' } : { preset: p, ...PRESETS[p] }));

  // --- PLAYGROUND CALCULATIONS (every assumption comes from `pg`) ---
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

  // Cache holds each hot item once, so size it from the unique data created per day, not from read volume.
  const cacheableDaily = pg.cacheMedia ? storagePerDay : textPerDay;
  const cacheBytes = cacheableDaily * (pg.hotPct / 100);

  const peakTotalQps = peakReadQps + peakWriteQps;
  const serversNeeded = Math.max(1, Math.ceil(peakTotalQps / Math.max(1, pg.qpsPerServer)));

  const downtime = downtimeFor(slaNines);

  const tabs: { id: SectionTab; label: string; icon: React.ElementType; highlight?: boolean }[] = [
    { id: 'intro', label: '1. What & Why', icon: Lightbulb },
    { id: 'why', label: '2. Why Estimation Matters', icon: TrendingUp },
    { id: 'power2', label: '3. Power of Two', icon: Cpu },
    { id: 'latency', label: '4. Latency Numbers', icon: Clock },
    { id: 'availability', label: '5. Availability', icon: ShieldAlert },
    { id: 'twitter', label: '6. Estimating Twitter', icon: FileText },
    { id: 'tips', label: '7. Interview Tips', icon: CheckCircle2 },
    { id: 'playground', label: 'Playground', icon: Calculator, highlight: true },
  ];

  return (
    <div className="space-y-6">
      {/* CHAPTER HEADER BANNER */}
      <div className="p-6 sm:p-8 rounded-3xl border shadow-xl relative overflow-hidden bg-white border-slate-200 text-slate-900 dark:bg-[#161616] dark:border-white/[0.08] dark:text-white">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2 max-w-3xl">
            <div className="flex items-center space-x-2">
              <span className="px-3 py-1 bg-amber-500 text-slate-950 font-mono text-xs font-black rounded-full uppercase tracking-wider">
                CHAPTER 2
              </span>
              <span className="text-xs font-semibold text-amber-700 dark:text-amber-400">Capacity &amp; scalability</span>
            </div>
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold tracking-tight">Back-of-the-Envelope Estimation</h1>
            <p className={body}>
              Learn how engineers make fast, order-of-magnitude estimates for QPS, storage, bandwidth, cache memory and server
              counts, using powers of two, latency numbers and availability numbers.
            </p>
          </div>
          <button
            onClick={() => setActiveTab('playground')}
            className="shrink-0 px-5 py-3 bg-gradient-to-r from-amber-500 via-orange-500 to-indigo-600 hover:opacity-95 text-white font-bold rounded-2xl shadow-lg flex items-center space-x-2 text-sm transition-transform active:scale-95"
          >
            <Calculator className="w-4 h-4" />
            <span>Open Estimation Playground</span>
          </button>
        </div>
      </div>

      {/* SUB-NAVIGATION TABS */}
      <div className="flex items-center space-x-1 p-1.5 rounded-2xl border overflow-x-auto no-scrollbar text-sm font-semibold bg-white border-slate-200 dark:bg-[#1c1c1e]/80 dark:border-slate-800">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center space-x-2 px-3.5 py-2 rounded-xl whitespace-nowrap transition-all ${
                isActive
                  ? tab.highlight
                    ? 'bg-gradient-to-r from-amber-500 to-orange-600 text-white font-bold shadow-md'
                    : 'bg-amber-500 text-slate-950 font-bold shadow-xs'
                  : tab.highlight
                  ? 'text-amber-700 dark:text-amber-400 font-bold hover:bg-amber-500/10'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-white dark:hover:bg-slate-800/60'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.2 }}
        >
          {/* ============================ TAB 1: INTRODUCTION ============================ */}
          {activeTab === 'intro' && (
            <div className="space-y-6">
              <LessonGoal
                goal="What a back-of-the-envelope estimate is, and why interviewers care about the reasoning more than the exact number."
                why="Jeff Dean describes these as estimates built from thought experiments plus common performance numbers, used to get a feel for which designs will meet your requirements."
              />
              <div className={panel}>
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">What is back-of-the-envelope estimation?</h2>
                <p className={body}>
                  Nobody knows the exact traffic or storage of a system before it is built. Instead, engineers make quick,{' '}
                  <Term term="order-of-magnitude">
                    The power of ten a number falls into. 3,500 and 7,000 are the same order of magnitude (thousands); 3,500 and 350,000 are not.
                  </Term>{' '}
                  calculations to test whether a design is feasible, before committing to it.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {[
                    { title: 'Reasoning over precision', color: 'text-amber-600 dark:text-amber-400', text: 'Rounding 86,400 seconds in a day to 100,000 is encouraged: it makes the math fast and changes the answer by only ~15%.' },
                    { title: 'Order of magnitude', color: 'text-indigo-600 dark:text-indigo-400', text: 'Knowing whether you need 10 or 1,000 servers, or 10 TB vs 10 PB, decides the database, caching and network design.' },
                    { title: 'Catch impossible designs early', color: 'text-emerald-600 dark:text-emerald-400', text: 'An estimate tells you up front that, say, 50 PB of media cannot live on a single database node.' },
                  ].map((c) => (
                    <div key={c.title} className={`${inset} space-y-2`}>
                      <h3 className={`font-bold text-sm ${c.color}`}>{c.title}</h3>
                      <p className={body}>{c.text}</p>
                    </div>
                  ))}
                </div>
                <EstimateCheck
                  id="intro-qps"
                  prompt={<>A service receives <strong>10 million requests per day</strong>, spread evenly. Roughly how many requests per second is that?</>}
                  unit="requests/s"
                  answer={10_000_000 / SECONDS_PER_DAY}
                  hint="a day has 86,400 seconds; round it to 100,000."
                  worked={
                    <>
                      <Step label="Exact:" math="10,000,000 / 86,400 s ≈ 116 requests/s" />
                      <Step label="Interview shortcut:" math="10,000,000 / 100,000 = 100 requests/s" />
                      <p>The shortcut is ~14% low, which is fine: both say "about a hundred per second".</p>
                    </>
                  }
                />
              </div>
              <Takeaway>Estimation is about the process. Get the order of magnitude right and show every step; exact decimals do not change design decisions.</Takeaway>
              <Quiz
                persistKey="chapter2:quiz:intro"
                questions={[
                  {
                    question: 'You divide by 100,000 instead of 86,400 seconds per day. What is the interviewer mainly evaluating?',
                    options: [
                      { text: 'Your reasoning and whether the order of magnitude is right', correct: true, why: 'The book stresses that the process matters more than the result, and precision is not expected.' },
                      { text: 'Whether you can do exact long division under pressure', why: 'Precise arithmetic wastes interview time; the book explicitly recommends rounding.' },
                      { text: 'Whether you remember the real traffic numbers of the company', why: 'Estimates are built from stated assumptions. Even the book notes its Twitter figures are not real.' },
                    ],
                  },
                  {
                    question: 'Your estimate says a service will hold ~50 PB after 5 years. What is the most useful conclusion?',
                    options: [
                      { text: 'You need a distributed storage system (e.g. object storage), not a single database server', correct: true, why: 'Petabytes are far beyond one machine, so the estimate changes the architecture before anything is built.' },
                      { text: 'Buy the largest single disk available', why: 'No single disk or server holds tens of petabytes; this is exactly the mistake estimation prevents.' },
                      { text: 'Storage size is irrelevant until launch', why: 'Storage scale drives database and storage choices, which are expensive to change later.' },
                    ],
                  },
                ]}
              />
            </div>
          )}

          {/* ============================ TAB 2: WHY ESTIMATION MATTERS ============================ */}
          {activeTab === 'why' && (
            <div className="space-y-6">
              <LessonGoal goal="The four questions estimates usually answer: request rate, cache memory, storage and bandwidth." why="Each one maps directly to a design decision you will make in later chapters." />
              <div className={panel}>
                <h3 className={h3}>What an estimate decides</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {[
                    {
                      title: 'Can one database handle the write rate?',
                      desc: (
                        <>
                          Rough rule of thumb (not from the book): a single relational primary handles somewhere in the thousands of simple writes per second.
                          The real number depends heavily on hardware, schema, indexes and query shape, so benchmark before relying on it. If your
                          estimate is 50,000 writes/s, you know early that you need{' '}
                          <Term term="sharding">Splitting data across several database servers so each holds and serves only part of it (Chapter 1).</Term> or a
                          write-scalable store.
                        </>
                      ),
                      icon: Database,
                      color: 'text-blue-600 dark:text-blue-400',
                    },
                    {
                      title: 'How much RAM for the cache?',
                      desc: (
                        <>
                          Using the{' '}
                          <Term term="80/20 rule">
                            The Pareto principle applied to traffic: roughly 20% of the items receive about 80% of the reads, so caching that hot 20% serves most requests.
                          </Term>
                          , cache the hottest ~20% of the data created per day. The cache stores each item once, however often it is read, so size it from unique data, not read volume.
                        </>
                      ),
                      icon: Cpu,
                      color: 'text-amber-600 dark:text-amber-400',
                    },
                    {
                      title: 'How much disk over the retention period?',
                      desc: <>Storage per day × 365 × years tells you whether ordinary disks are enough or you need distributed object storage.</>,
                      icon: HardDrive,
                      color: 'text-indigo-600 dark:text-indigo-400',
                    },
                    {
                      title: 'How much network bandwidth?',
                      desc: <>Large outbound traffic (images, video) is a strong signal to put a CDN in front, so the data center link is not saturated.</>,
                      icon: Wifi,
                      color: 'text-emerald-600 dark:text-emerald-400',
                    },
                  ].map((item) => {
                    const Icon = item.icon;
                    return (
                      <div key={item.title} className={`${inset} space-y-2`}>
                        <div className="flex items-center space-x-2">
                          <Icon className={`w-5 h-5 ${item.color}`} />
                          <h4 className={`font-bold text-sm ${strongText}`}>{item.title}</h4>
                        </div>
                        <p className={body}>{item.desc}</p>
                      </div>
                    );
                  })}
                </div>
                <p className={sub}>
                  The book lists the commonly asked estimates as: QPS, peak QPS, storage, cache, and number of servers. The playground computes all of them.
                </p>
              </div>
              <Takeaway>Each number you estimate should end in a decision: shard or not, how big a cache, which storage tier, CDN or not.</Takeaway>
              <Quiz
                persistKey="chapter2:quiz:why"
                questions={[
                  {
                    question: 'Your estimate shows ~50,000 writes per second, well above what one relational primary is usually good for. What is a sensible next step?',
                    options: [
                      { text: 'Plan to partition (shard) writes or use a write-scalable store, and benchmark to confirm', correct: true, why: 'Writes must land somewhere durable; spreading them over several nodes is the standard answer to a write bottleneck.' },
                      { text: 'Add a read cache in front of the database', why: 'A cache absorbs reads. Every write still has to reach the database, so it does not fix a write bottleneck.' },
                      { text: 'Nothing: one bigger server will always cope', why: 'Vertical scaling has a hard ceiling (Chapter 1). A 10× gap is a signal to change the design, not just the machine.' },
                    ],
                  },
                  {
                    question: 'Why size a cache from "hot fraction × unique data per day" rather than "hot fraction × total reads"?',
                    options: [
                      { text: 'A cached item is stored once no matter how many times it is read', correct: true, why: 'Multiplying by read count counts the same item hundreds of times, which inflates memory by the read:write ratio.' },
                      { text: 'Reads are cheaper than writes, so they need less memory', why: 'Cost per read is not the issue; memory depends on how many distinct bytes you keep.' },
                      { text: 'The 80/20 rule says the cache should hold 80% of all data', why: 'It is the reverse: about 20% of items serve about 80% of requests, so you cache the hot 20%.' },
                    ],
                  },
                ]}
              />
            </div>
          )}

          {/* ============================ TAB 3: POWER OF TWO ============================ */}
          {activeTab === 'power2' && (
            <div className="space-y-6">
              <LessonGoal goal="The data-volume units (KB → PB) and how to jump between them quickly." why="Almost every estimate ends in bytes. Mixing up MB and GB is the fastest way to be off by 1,000×." />
              <div className={panel}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className={h3}>Powers of two: data volume units</h3>
                    <p className={sub}>A byte is 8 bits, and one ASCII character uses one byte.</p>
                  </div>
                  <span className="px-3 py-1 bg-blue-500/10 text-blue-700 dark:text-blue-300 rounded-full text-xs font-mono font-bold border border-blue-500/20">1 Byte = 8 Bits</span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-slate-800 text-amber-700 dark:text-amber-400">
                        <th className="py-2.5 px-3">Power</th>
                        <th className="py-2.5 px-3">Exact value (bytes)</th>
                        <th className="py-2.5 px-3">Approximate</th>
                        <th className="py-2.5 px-3">Name</th>
                        <th className="py-2.5 px-3">Example</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-700 dark:divide-slate-800/60 dark:text-slate-300">
                      {[
                        { p: 10, approx: 'Thousand', name: '1 KB (kilobyte)', ex: 'A short JSON payload' },
                        { p: 20, approx: 'Million', name: '1 MB (megabyte)', ex: 'A compressed photo' },
                        { p: 30, approx: 'Billion', name: '1 GB (gigabyte)', ex: 'An hour of HD video' },
                        { p: 40, approx: 'Trillion', name: '1 TB (terabyte)', ex: 'A large SSD' },
                        { p: 50, approx: 'Quadrillion', name: '1 PB (petabyte)', ex: 'A large media archive' },
                      ].map((r) => (
                        <tr key={r.p}>
                          <td className="py-2 px-3 font-mono font-bold text-blue-600 dark:text-blue-400">2^{r.p}</td>
                          <td className="py-2 px-3 font-mono">{Math.pow(2, r.p).toLocaleString()}</td>
                          <td className="py-2 px-3 text-amber-700 dark:text-amber-400">1 {r.approx}</td>
                          <td className="py-2 px-3 font-bold">{r.name}</td>
                          <td className="py-2 px-3 text-slate-500 dark:text-slate-400">{r.ex}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className={`${inset} space-y-3`}>
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-sm text-amber-700 dark:text-amber-400">Power-of-two inspector</span>
                    <span className="font-mono text-sm font-bold text-indigo-600 dark:text-indigo-400">2^{powerExponent}</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={50}
                    step={1}
                    value={powerExponent}
                    onChange={(e) => setPowerExponent(Number(e.target.value))}
                    className="w-full accent-amber-500 cursor-pointer"
                    aria-label="Exponent"
                  />
                  <div className="p-3 bg-indigo-500/10 border border-indigo-500/20 rounded-xl flex flex-wrap items-center justify-between gap-2 text-sm text-slate-800 dark:text-slate-100">
                    <span>
                      Exact: <strong className="font-mono">{Math.pow(2, powerExponent).toLocaleString()} bytes</strong>
                    </span>
                    <span className="font-mono font-bold text-amber-700 dark:text-amber-400">
                      ≈{' '}
                      {powerExponent >= 50
                        ? `${(Math.pow(2, powerExponent) / Math.pow(2, 50)).toFixed(2)} PB`
                        : powerExponent >= 40
                        ? `${(Math.pow(2, powerExponent) / Math.pow(2, 40)).toFixed(2)} TB`
                        : powerExponent >= 30
                        ? `${(Math.pow(2, powerExponent) / Math.pow(2, 30)).toFixed(2)} GB`
                        : powerExponent >= 20
                        ? `${(Math.pow(2, powerExponent) / Math.pow(2, 20)).toFixed(2)} MB`
                        : powerExponent >= 10
                        ? `${(Math.pow(2, powerExponent) / Math.pow(2, 10)).toFixed(2)} KB`
                        : `${Math.pow(2, powerExponent)} bytes`}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Each +10 on the exponent multiplies by 1,024 ≈ 1,000, which is why estimates can treat KB/MB/GB as steps of a thousand. At 2^40, the
                    gap between 1,024⁴ and 1,000⁴ is about 10%, still fine for an estimate.
                  </p>
                </div>

                <EstimateCheck
                  id="power2-users"
                  prompt={<>You store a <strong>1 KB profile</strong> for each of <strong>1 billion users</strong>. How many GB is that?</>}
                  unit="GB"
                  answer={1000}
                  worked={
                    <>
                      <Step label="Bytes:" math="10^9 users × 10^3 bytes = 10^12 bytes" />
                      <Step label="Convert:" math="10^12 bytes = 1 TB = 1,000 GB" />
                      <p>Trick: add the exponents. Billion (9) + kilo (3) = 12, and 10^12 is a terabyte.</p>
                    </>
                  }
                />
              </div>
              <Takeaway>Treat each unit step as ×1,000 and add exponents: million × KB = GB, billion × KB = TB, billion × MB = PB.</Takeaway>
              <Quiz
                persistKey="chapter2:quiz:power2"
                questions={[
                  {
                    question: '2^30 bytes is approximately…',
                    options: [
                      { text: '1 billion bytes (1 GB)', correct: true, why: '2^30 = 1,073,741,824, roughly a billion bytes: a gigabyte.' },
                      { text: '1 million bytes (1 MB)', why: 'That is 2^20. Each +10 in the exponent is another ×1,000.' },
                      { text: '1 trillion bytes (1 TB)', why: 'That is 2^40, one step further up.' },
                    ],
                  },
                  {
                    question: '30 million photos of 1 MB each take up about…',
                    options: [
                      { text: '30 TB', correct: true, why: 'Million (10^6) × MB (10^6) = 10^12 bytes = TB, so 30 × 1 TB = 30 TB. This is the book\'s Twitter media figure.' },
                      { text: '30 GB', why: 'That would be 30 million × 1 KB. Missing a ×1,000 step is the classic unit slip.' },
                      { text: '30 PB', why: 'That would need 30 billion photos, or 1 GB each.' },
                    ],
                  },
                ]}
              />
            </div>
          )}

          {/* ============================ TAB 4: LATENCY NUMBERS ============================ */}
          {activeTab === 'latency' && (
            <div className="space-y-6">
              <LessonGoal
                goal="How much slower disk and network are than memory, by orders of magnitude."
                why="These ratios explain why caches exist, why disk seeks are avoided and why cross-region calls are kept out of the request path."
              />
              <div className={panel}>
                <div>
                  <h3 className={h3}>Latency numbers every programmer should know</h3>
                  <p className={sub}>
                    Dr. Jeff Dean's numbers from 2010, as listed in the book. Hardware has improved since, but the ratios between tiers still hold.
                  </p>
                </div>

                {/* Log-scale bars */}
                <div role="img" aria-label="Log-scale bar chart of operation latencies from 0.5 nanoseconds for an L1 cache reference to 150 milliseconds for a transatlantic round trip">
                  <div className="hidden sm:grid grid-cols-[minmax(0,15rem)_1fr_5rem] gap-3 text-xs text-slate-500 dark:text-slate-400 mb-1">
                    <span />
                    <div className="relative h-4">
                      {[
                        { ns: 1, l: '1 ns' },
                        { ns: 1e3, l: '1 µs' },
                        { ns: 1e6, l: '1 ms' },
                        { ns: 1e9, l: '1 s' },
                      ].map((t) => (
                        <span key={t.l} className="absolute -translate-x-1/2 font-mono" style={{ left: `${logPct(t.ns)}%` }}>
                          {t.l}
                        </span>
                      ))}
                    </div>
                    <span />
                  </div>
                  <div className="space-y-1.5">
                    {LATENCIES.map((item) => (
                      <div key={item.op} className="grid grid-cols-1 sm:grid-cols-[minmax(0,15rem)_1fr_5rem] gap-x-3 gap-y-1 items-center">
                        <span className="text-sm text-slate-800 dark:text-slate-200 truncate" title={item.op}>
                          {item.op}
                        </span>
                        <div className="relative h-3 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                          {[1, 1e3, 1e6].map((t) => (
                            <span key={t} className="absolute top-0 bottom-0 w-px bg-slate-400/40" style={{ left: `${logPct(t)}%` }} />
                          ))}
                          <div className={`h-full rounded-full ${TIER_STYLE[item.tier].bar}`} style={{ width: `${logPct(item.ns)}%` }} />
                        </div>
                        <span className="text-sm font-mono font-bold text-slate-900 dark:text-white sm:text-right">{fmtLatency(item.ns)}</span>
                      </div>
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-4 mt-3 text-xs text-slate-600 dark:text-slate-300">
                    {(Object.keys(TIER_STYLE) as LatencyTier[]).map((t) => (
                      <span key={t} className="flex items-center gap-1.5">
                        <span className={`w-3 h-3 rounded-sm ${TIER_STYLE[t].bar}`} /> {TIER_STYLE[t].label}
                      </span>
                    ))}
                    <span className="text-slate-500 dark:text-slate-400">Log scale: each gridline is 1,000× the previous one.</span>
                  </div>
                </div>

                <div className={`${inset} space-y-2`}>
                  <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">Human scale: if an L1 cache reference took 1 second…</p>
                  <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-sm text-slate-600 dark:text-slate-300">
                    {LATENCIES.filter((l) => ['Main memory reference', 'Round trip within the same datacenter', 'Disk seek', 'Send packet CA → Netherlands → CA'].includes(l.op)).map((l) => (
                      <li key={l.op}>
                        {l.op}: <strong className="font-mono text-slate-900 dark:text-white">{formatDuration(l.ns / 0.5)}</strong>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-2xl space-y-2">
                  <h4 className="font-bold text-sm text-amber-700 dark:text-amber-400">What the numbers tell you (the book's conclusions)</h4>
                  <ul className="text-sm space-y-1.5 text-slate-700 dark:text-slate-200 list-disc pl-5">
                    <li>
                      <strong>Memory is fast, disk is slow.</strong> Reading 1 MB from memory takes ~250 µs; from disk ~30 ms, about 120× longer.
                    </li>
                    <li>
                      <strong>Avoid disk seeks.</strong> One seek (~10 ms) costs as much as 100,000 main-memory references.
                    </li>
                    <li>
                      <strong>Network hops add up.</strong> A round trip to another machine in the same datacenter is ~500 µs, about 5,000× a memory reference, before
                      the remote server does any work. Many such calls in a loop quickly cost milliseconds.
                    </li>
                    <li>
                      <strong>Simple compression is fast</strong> (~10 µs per KB), so compress data before sending it over the internet.
                    </li>
                    <li>
                      <strong>Data centers in different regions are far apart:</strong> a California–Netherlands round trip is ~150 ms.
                    </li>
                  </ul>
                </div>

                <EstimateCheck
                  id="latency-mem"
                  prompt={<>How long does it take to read <strong>1 GB sequentially from memory</strong>?</>}
                  unit="ms"
                  answer={250}
                  worked={
                    <>
                      <Step label="From the table:" math="1 MB from memory ≈ 250 µs" />
                      <Step label="Scale up:" math="1 GB = 1,000 MB → 1,000 × 250 µs = 250,000 µs = 250 ms" />
                    </>
                  }
                />
                <EstimateCheck
                  id="latency-disk"
                  prompt={<>And how long to read the same <strong>1 GB sequentially from disk</strong>?</>}
                  unit="seconds"
                  answer={30}
                  worked={
                    <>
                      <Step label="From the table:" math="1 MB from disk ≈ 30 ms" />
                      <Step label="Scale up:" math="1,000 × 30 ms = 30,000 ms = 30 s" />
                      <p>Same data, 120× slower. That gap is why hot data is kept in memory.</p>
                    </>
                  }
                />
              </div>
              <Takeaway>Memory is measured in nanoseconds, the network inside a datacenter in hundreds of microseconds, disks and cross-region links in milliseconds. Design so the hot path stays in memory.</Takeaway>
              <Quiz
                persistKey="chapter2:quiz:latency"
                questions={[
                  {
                    question: 'Which of these is slowest?',
                    options: [
                      { text: 'One disk seek', correct: true, why: '~10 ms, 20× slower than a same-datacenter round trip and 40× slower than reading 1 MB from memory.' },
                      { text: 'A round trip within the same datacenter', why: '~500 µs, which is 0.5 ms: fast compared with a disk seek.' },
                      { text: 'Reading 1 MB sequentially from memory', why: '~250 µs. Sequential memory reads are very fast.' },
                    ],
                  },
                  {
                    question: 'Roughly how much slower is a same-datacenter round trip than a main-memory reference?',
                    options: [
                      { text: 'About 5,000×', correct: true, why: '500,000 ns ÷ 100 ns = 5,000.' },
                      { text: 'About 10×', why: 'Far too small: memory is ~100 ns and the round trip ~500,000 ns.' },
                      { text: 'About 100,000×', why: 'That is the disk seek vs memory ratio (10 ms ÷ 100 ns).' },
                    ],
                  },
                  {
                    question: 'Why does the book suggest compressing data before sending it over the internet?',
                    options: [
                      { text: 'Compression is cheap (~10 µs per KB) compared with the time to move bytes across long network links', correct: true, why: 'Spending microseconds of CPU to send fewer bytes over a link measured in milliseconds is a good trade.' },
                      { text: 'Compression makes the CPU run faster', why: 'Compression costs CPU time; the saving is in network transfer.' },
                      { text: 'The network is faster than memory, so data should be small in memory', why: 'The reverse: the network is much slower than memory.' },
                    ],
                  },
                ]}
              />
            </div>
          )}

          {/* ============================ TAB 5: AVAILABILITY ============================ */}
          {activeTab === 'availability' && (
            <div className="space-y-6">
              <LessonGoal
                goal={<>What an availability target like 99.99% means as allowed downtime, and how quickly the budget shrinks with each extra nine.</>}
                why="Converting a percentage into minutes per month makes the cost of a target concrete."
              />
              <div className={panel}>
                <div>
                  <h3 className={h3}>Availability and the "nines"</h3>
                  <p className={body}>
                    Availability is measured as the percentage of time a service is up; most services fall between 99% and 100%. A{' '}
                    <Term term="service level agreement (SLA)">A formal agreement between a provider and its customer that defines the level of uptime the service will deliver.</Term>{' '}
                    promises a level of uptime. The book notes that the major cloud providers set their SLAs at 99.9% or above.
                  </p>
                </div>

                <div className={`${inset} space-y-4`}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-bold text-sm text-amber-700 dark:text-amber-400">Pick a target</span>
                    <span className="font-mono text-sm font-black text-emerald-700 dark:text-emerald-400">
                      {slaNines}% ({NINE_NAMES[slaNines]})
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {NINES.map((val) => (
                      <button
                        key={val}
                        onClick={() => setSlaNines(val)}
                        className={`flex-1 min-w-[5rem] py-2 rounded-xl text-sm font-bold font-mono transition-all ${
                          slaNines === val
                            ? 'bg-amber-500 text-slate-950 shadow-md'
                            : 'bg-white text-slate-600 hover:text-slate-900 border border-slate-200 dark:bg-[#1c1c1e] dark:border-slate-800 dark:text-slate-400 dark:hover:text-white'
                        }`}
                      >
                        {val}%
                      </button>
                    ))}
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {(['day', 'week', 'month', 'year'] as const).map((k) => (
                      <div key={k} className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-center space-y-1">
                        <span className="block text-xs text-slate-600 dark:text-slate-400">Downtime per {k}</span>
                        <p className="text-sm font-bold font-mono text-rose-700 dark:text-rose-300">{formatDuration(downtime[k])}</p>
                      </div>
                    ))}
                  </div>
                  <p className="text-sm text-slate-700 dark:text-slate-200">
                    <span className="font-semibold">Typical approach (illustrative): </span>
                    {infraFor(slaNines)}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Computed as (1 − availability) × period, with a year of 365.25 days and a month of one twelfth of a year.
                  </p>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-slate-800 text-amber-700 dark:text-amber-400">
                        <th className="py-2.5 px-3">Availability</th>
                        <th className="py-2.5 px-3">Per day</th>
                        <th className="py-2.5 px-3">Per week</th>
                        <th className="py-2.5 px-3">Per month</th>
                        <th className="py-2.5 px-3">Per year</th>
                        <th className="py-2.5 px-3">Typical approach (illustrative)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-700 dark:divide-slate-800/60 dark:text-slate-300">
                      {NINES.map((n) => {
                        const d = downtimeFor(n);
                        return (
                          <tr
                            key={n}
                            onClick={() => setSlaNines(n)}
                            className={`cursor-pointer ${n === slaNines ? 'bg-amber-500/10' : 'hover:bg-slate-50 dark:hover:bg-white/[0.03]'}`}
                          >
                            <td className="py-2 px-3 font-bold text-amber-700 dark:text-amber-400 whitespace-nowrap">
                              <span className="font-mono">{n}%</span> <span className="font-normal text-slate-500 dark:text-slate-400">{NINE_NAMES[n]}</span>
                            </td>
                            <td className="py-2 px-3 font-mono">{formatDuration(d.day)}</td>
                            <td className="py-2 px-3 font-mono">{formatDuration(d.week)}</td>
                            <td className="py-2 px-3 font-mono">{formatDuration(d.month)}</td>
                            <td className="py-2 px-3 font-mono text-rose-700 dark:text-rose-300">{formatDuration(d.year)}</td>
                            <td className="py-2 px-3 text-slate-500 dark:text-slate-400">{infraFor(n)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <EstimateCheck
                  id="availability-9995"
                  prompt={<>A provider promises <strong>99.95%</strong> monthly availability. About how many minutes of downtime per month does that allow?</>}
                  unit="minutes"
                  answer={0.0005 * (365.25 / 12) * 24 * 60}
                  hint="a month is about 30 × 24 × 60 ≈ 43,800 minutes."
                  worked={
                    <>
                      <Step label="Unavailable fraction:" math="1 − 0.9995 = 0.0005" />
                      <Step label="Minutes in a month:" math="30.44 days × 1,440 ≈ 43,830 min" />
                      <Step label="Budget:" math="0.0005 × 43,830 ≈ 21.9 min" />
                      <p>That sits between three nines (43.8 min/month) and four nines (4.4 min/month). Each extra nine divides the budget by 10.</p>
                    </>
                  }
                />
              </div>
              <Takeaway>Every extra nine cuts the downtime budget by 10×. Three nines allows ~44 minutes a month; four nines only ~4.</Takeaway>
              <Quiz
                persistKey="chapter2:quiz:availability"
                questions={[
                  {
                    question: 'About how much downtime per year does 99.99% availability allow?',
                    options: [
                      { text: '~52.6 minutes', correct: true, why: '0.0001 × 365.25 days × 1,440 min ≈ 52.6 minutes.' },
                      { text: '~8.8 hours', why: 'That is three nines (99.9%), which allows 10× more downtime.' },
                      { text: '~5.3 minutes', why: 'That is five nines (99.999%).' },
                    ],
                  },
                  {
                    question: 'A request must pass through two independent services, each 99.9% available. The combined availability is roughly…',
                    options: [
                      { text: '99.8%', correct: true, why: 'Dependencies in series multiply: 0.999 × 0.999 ≈ 0.998, so the downtime budgets roughly add up.' },
                      { text: '99.9%', why: 'Either one failing breaks the request, so the combination is worse than each alone.' },
                      { text: '99.99%', why: 'Availability improves only with redundant copies in parallel, not with a chain of dependencies.' },
                    ],
                  },
                ]}
              />
            </div>
          )}

          {/* ============================ TAB 6: ESTIMATING TWITTER ============================ */}
          {activeTab === 'twitter' && (
            <div className="space-y-6">
              <LessonGoal
                goal="Walk through the book's Twitter example: from users to QPS, peak QPS, and 5-year media storage."
                why="It is the template for every estimation question: state assumptions, then multiply and divide step by step, labeling units."
              />
              <div className={panel}>
                <div>
                  <h3 className={h3}>Worked example: Twitter QPS and storage</h3>
                  <p className={sub}>The book stresses these figures are for the exercise only, not Twitter's real numbers.</p>
                </div>

                <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-2xl space-y-2">
                  <span className="font-bold text-sm text-blue-700 dark:text-blue-300">Assumptions (from the book)</span>
                  <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-sm text-slate-700 dark:text-slate-200 list-disc pl-5">
                    <li>
                      300 million{' '}
                      <Term term="monthly active users (MAU)">Distinct users who use the product at least once in a month.</Term>
                    </li>
                    <li>50% of them use it every day</li>
                    <li>Each user posts 2 tweets per day on average</li>
                    <li>10% of tweets contain media, about 1 MB each</li>
                    <li>A tweet also has a 64-byte ID and ~140 bytes of text</li>
                    <li>Data is stored for 5 years</li>
                  </ul>
                </div>

                <div className={`${inset} space-y-1 text-sm text-slate-600 dark:text-slate-300`}>
                  <p className="font-bold text-amber-700 dark:text-amber-400">Step 1: daily active users</p>
                  <Step
                    label={
                      <>
                        <Term term="DAU">Daily active users: distinct users on a given day. Request volume is driven by DAU, not MAU.</Term> =
                      </>
                    }
                    math="300 million × 50% = 150 million"
                  />
                  <Step label="Tweets per day =" math="150 million × 2 = 300 million" />
                </div>

                <EstimateCheck
                  id="twitter-qps"
                  prompt={
                    <>
                      <strong>Step 2.</strong> With 300 million tweets per day, what is the average{' '}
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

                <EstimateCheck
                  id="twitter-media-day"
                  prompt={<><strong>Step 3.</strong> How much new media storage is needed per day? (The book estimates only media, since it dominates.)</>}
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

                <EstimateCheck
                  id="twitter-media-5y"
                  prompt={<><strong>Step 4.</strong> How much media storage after 5 years?</>}
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

                <div className="flex flex-wrap items-center gap-3">
                  <button
                    onClick={() => {
                      applyPreset('twitter');
                      setActiveTab('playground');
                    }}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold bg-amber-500 text-slate-950 hover:bg-amber-400"
                  >
                    Load these numbers into the playground <ArrowRight className="w-4 h-4" />
                  </button>
                  <span className={sub}>Then change one assumption at a time and watch which results move.</span>
                </div>
              </div>
              <Takeaway>Users → DAU → actions per day → ÷ 86,400 for QPS → ×2 for peak; actions × size for storage per day → × days retained. That chain answers most estimation questions.</Takeaway>
              <Quiz
                persistKey="chapter2:quiz:twitter"
                questions={[
                  {
                    question: 'Why does the example multiply 300 million MAU by 50% before computing QPS?',
                    options: [
                      { text: 'Daily request volume comes from users active that day (DAU), not everyone active in a month', correct: true, why: 'Only people using the product today generate today\'s requests, so QPS is based on DAU.' },
                      { text: 'To account for peak traffic', why: 'Peak is handled separately by multiplying the average QPS by 2.' },
                      { text: 'Because half the tweets are deleted', why: 'Nothing in the assumptions mentions deletion; the 50% is the daily-active share.' },
                    ],
                  },
                  {
                    question: 'Why is it reasonable to estimate only media storage here?',
                    options: [
                      { text: 'A 1 MB media file is thousands of times larger than ~200 bytes of ID and text, so media dominates', correct: true, why: 'Even with only 10% of tweets carrying media, media is ~30 TB/day vs ~61 GB/day of text.' },
                      { text: 'Tweet text is not stored', why: 'It is stored; it is simply too small to change the total noticeably.' },
                      { text: 'Text is kept only in the cache', why: 'Caches hold copies; the durable copy still lives in storage.' },
                    ],
                  },
                ]}
              />
            </div>
          )}

          {/* ============================ TAB 7: INTERVIEW TIPS ============================ */}
          {activeTab === 'tips' && (
            <div className="space-y-6">
              <LessonGoal goal="The book's four habits for estimation questions." why="Interviewers are testing your problem-solving process, so make it visible." />
              <div className={panel}>
                <h3 className={h3}>Tips for estimation in interviews</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 space-y-3">
                    <h4 className="font-bold text-sm text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4" /> Do this
                    </h4>
                    <ul className="text-sm space-y-2 text-slate-700 dark:text-slate-200">
                      {[
                        ['Round and approximate.', 'Something like 99,987 / 9.1 becomes 100,000 / 10 = 10,000. Precision is not expected.'],
                        ['Write down your assumptions', 'so you (and the interviewer) can refer back to them later.'],
                        ['Label your units.', 'Does "5" mean 5 KB or 5 MB? Writing "5 MB" removes the ambiguity.'],
                        ['Practise the common ones:', 'QPS, peak QPS, storage, cache and number of servers.'],
                      ].map(([b, t]) => (
                        <li key={b} className="flex items-start gap-2">
                          <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                          <span>
                            <strong>{b}</strong> {t}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 space-y-3">
                    <h4 className="font-bold text-sm text-rose-700 dark:text-rose-400 flex items-center gap-1.5">
                      <AlertTriangle className="w-4 h-4" /> Avoid this
                    </h4>
                    <ul className="text-sm space-y-2 text-slate-700 dark:text-slate-200">
                      {[
                        ['Chasing decimals.', '3,472 vs 3,500 QPS makes no difference to the design.'],
                        ['Silent calculation.', 'Say each step out loud so the interviewer can follow and correct you early.'],
                        ['Mixing bits and bytes.', 'Network speeds are often quoted in bits per second (Gbps), storage in bytes: a factor of 8.'],
                      ].map(([b, t]) => (
                        <li key={b} className="flex items-start gap-2">
                          <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
                          <span>
                            <strong>{b}</strong> {t}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
              <Takeaway>Round aggressively, write assumptions down, and label every unit. The process is what is being graded.</Takeaway>
              <Quiz
                persistKey="chapter2:quiz:tips"
                questions={[
                  {
                    question: 'Mid-interview you need 99,987 / 9.1. What should you do?',
                    options: [
                      { text: 'Approximate it as 100,000 / 10 = 10,000 and move on', correct: true, why: 'The book recommends exactly this: rounding keeps you fast and the answer is within a few percent.' },
                      { text: 'Work it out exactly by long division', why: 'It burns interview time for precision nobody needs.' },
                      { text: 'Skip the step and guess the final number', why: 'Skipping hides your reasoning, which is what is being assessed.' },
                    ],
                  },
                  {
                    question: 'You wrote "storage = 5" on the whiteboard. What is the problem?',
                    options: [
                      { text: 'Without a unit it could be 5 KB or 5 PB, a 10^12× ambiguity', correct: true, why: 'Labeling units ("5 TB/day") prevents confusing yourself and the interviewer later.' },
                      { text: 'You should have used exact numbers like 5.03', why: 'Precision is not the issue; the missing unit is.' },
                      { text: 'Storage should always be given in bits', why: 'Storage is normally in bytes; bits are common for network rates.' },
                    ],
                  },
                ]}
              />
            </div>
          )}

          {/* ============================ TAB 8: PLAYGROUND ============================ */}
          {activeTab === 'playground' && (
            <div className="space-y-6">
              <LessonGoal
                goal="See how each assumption flows into QPS, storage, bandwidth, cache size and server count."
                why="Change one input at a time and notice which results move and which do not. That is the cause-and-effect interviewers expect you to reason about."
              />
              <div className="p-5 sm:p-8 rounded-3xl border shadow-xl space-y-6 bg-white border-slate-200 text-slate-900 dark:bg-[#1c1c1e] dark:border-slate-800 dark:text-slate-100">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b pb-4 border-slate-200 dark:border-slate-800">
                  <div>
                    <div className="flex items-center space-x-2">
                      <Calculator className="w-5 h-5 text-amber-500" />
                      <h2 className="text-lg font-extrabold tracking-tight">Capacity estimation playground</h2>
                    </div>
                    <p className={`${sub} mt-0.5`}>Every assumption is an input below. Units are decimal (1 MB = 1,000 KB), as in the book's arithmetic.</p>
                  </div>
                  <label className="flex items-center space-x-2">
                    <span className="text-sm font-semibold text-slate-600 dark:text-slate-400">Preset:</span>
                    <select
                      value={pg.preset}
                      onChange={(e) => applyPreset(e.target.value as Preset)}
                      className="px-3 py-1.5 rounded-xl text-sm font-semibold border focus:outline-none cursor-pointer bg-slate-100 border-slate-200 text-amber-800 dark:bg-slate-950 dark:border-slate-800 dark:text-amber-400"
                    >
                      <option value="twitter">Twitter (book's assumptions)</option>
                      <option value="youtube">Video site (illustrative)</option>
                      <option value="whatsapp">Chat app (illustrative)</option>
                      <option value="tinyurl">URL shortener (illustrative)</option>
                      <option value="custom">Custom</option>
                    </select>
                  </label>
                </div>
                {pg.preset === 'twitter' && (
                  <p className="text-sm text-slate-600 dark:text-slate-300">
                    Users, activity, media and retention match the book. The book does not give a read ratio, cache fraction or per-server capacity; those
                    values are illustrative assumptions you can change.
                  </p>
                )}

                <div className="space-y-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Traffic assumptions</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    <NumField label="Monthly active users" unit="million" value={pg.mauMillions} min={1} max={3000} step={1} help="Distinct users in a month." onChange={(v) => setField('mauMillions', v)} />
                    <NumField label="Daily active share" unit="% of MAU" value={pg.dailyActivePct} min={1} max={100} step={1} help={<>DAU = MAU × this share = <span className="font-mono">{fmtCount(dau)}</span></>} onChange={(v) => setField('dailyActivePct', Math.min(100, v))} />
                    <NumField label="Writes per user per day" unit="writes" value={pg.writesPerUser} min={0.1} max={100} step={0.1} help="Posts, messages or uploads each daily user creates." onChange={(v) => setField('writesPerUser', v)} />
                    <NumField label="Reads per write" unit="reads" value={pg.readsPerWrite} min={1} max={1000} step={1} help={<>Read:write ratio = <span className="font-mono">{pg.readsPerWrite}:1</span>. Reads/day = writes/day × this.</>} onChange={(v) => setField('readsPerWrite', v)} />
                    <NumField label="Peak-to-average factor" unit="×" value={pg.peakFactor} min={1} max={10} step={0.5} help="The book uses peak = 2 × average QPS." onChange={(v) => setField('peakFactor', v)} />
                  </div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 pt-2">Data assumptions</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    <NumField label="Text / metadata per write" unit="bytes" value={pg.textBytes} min={0} max={10000} step={1} help="Book's tweet: 64-byte ID + 140 bytes text ≈ 204 bytes." onChange={(v) => setField('textBytes', v)} />
                    <NumField label="Writes with media" unit="%" value={pg.mediaPct} min={0} max={100} step={1} help="Share of writes that carry an image or video." onChange={(v) => setField('mediaPct', Math.min(100, v))} />
                    <NumField label="Media size" unit="KB" value={pg.mediaKB} min={0} max={100000} step={10} help="Book's tweet media: 1 MB = 1,000 KB." onChange={(v) => setField('mediaKB', v)} />
                    <NumField label="Retention" unit="years" value={pg.retentionYears} min={1} max={20} step={1} help="How long data is kept. Affects total storage only." onChange={(v) => setField('retentionYears', v)} />
                  </div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 pt-2">Infrastructure assumptions</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    <NumField label="Hot data fraction to cache" unit="%" value={pg.hotPct} min={1} max={100} step={1} help="80/20 rule: cache the hottest ~20% of each day's new data." onChange={(v) => setField('hotPct', Math.min(100, v))} />
                    <NumField label="QPS one server handles" unit="QPS" value={pg.qpsPerServer} min={50} max={50000} step={50} help="Rough assumption; real capacity depends on the workload. Benchmark it." onChange={(v) => setField('qpsPerServer', v)} />
                    <div className={`${inset} space-y-2`}>
                      <label className="flex items-center gap-2 text-sm font-semibold text-slate-800 dark:text-slate-100 cursor-pointer">
                        <input type="checkbox" checked={pg.cacheMedia} onChange={(e) => setField('cacheMedia', e.target.checked)} className="accent-amber-500 w-4 h-4" />
                        Cache media in RAM too
                      </label>
                      <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                        Usually off: large media is served from object storage through a CDN, and the in-memory cache holds text and metadata.
                      </p>
                    </div>
                  </div>
                </div>

                {/* RESULTS: value + the arithmetic that produced it */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-2xl space-y-2">
                    <span className="text-xs font-bold text-blue-700 dark:text-blue-300 uppercase tracking-wide">1. Request rate (QPS)</span>
                    <div className="space-y-1 text-sm">
                      <div className="flex justify-between"><span className="text-slate-600 dark:text-slate-400">Average write QPS</span><span className="font-mono font-bold text-slate-900 dark:text-white">{fmtCount(avgWriteQps)}</span></div>
                      <div className="flex justify-between"><span className="text-slate-600 dark:text-slate-400">Peak write QPS</span><span className="font-mono font-bold text-slate-900 dark:text-white">{fmtCount(peakWriteQps)}</span></div>
                      <div className="flex justify-between"><span className="text-slate-600 dark:text-slate-400">Peak read QPS</span><span className="font-mono font-bold text-slate-900 dark:text-white">{fmtCount(peakReadQps)}</span></div>
                    </div>
                    <p className="text-xs font-mono text-slate-600 dark:text-slate-400 leading-relaxed">
                      {fmtCount(dau)} DAU × {pg.writesPerUser} = {fmtCount(writesPerDay)} writes/day ÷ 86,400 s = {fmtCount(avgWriteQps)}; × {pg.peakFactor} peak. Reads × {pg.readsPerWrite}.
                    </p>
                  </div>

                  <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-2xl space-y-2">
                    <span className="text-xs font-bold text-amber-700 dark:text-amber-300 uppercase tracking-wide">2. Storage</span>
                    <div className="space-y-1 text-sm">
                      <div className="flex justify-between"><span className="text-slate-600 dark:text-slate-400">Per day (media + text)</span><span className="font-mono font-bold text-slate-900 dark:text-white">{fmtBytes(storagePerDay)}</span></div>
                      <div className="flex justify-between"><span className="text-slate-600 dark:text-slate-400">of which media</span><span className="font-mono text-slate-900 dark:text-white">{fmtBytes(mediaPerDay)}</span></div>
                      <div className="flex justify-between"><span className="text-slate-600 dark:text-slate-400">{pg.retentionYears}-year total</span><span className="font-mono font-bold text-slate-900 dark:text-white">{fmtBytes(storageTotal)}</span></div>
                    </div>
                    <p className="text-xs font-mono text-slate-600 dark:text-slate-400 leading-relaxed">
                      {fmtCount(writesPerDay)} writes × ({pg.textBytes} B + {pg.mediaPct}% × {sig(pg.mediaKB)} KB) = {fmtBytes(storagePerDay)}/day; × 365 × {pg.retentionYears}.
                    </p>
                  </div>

                  <div className="p-4 bg-purple-500/10 border border-purple-500/20 rounded-2xl space-y-2">
                    <span className="text-xs font-bold text-purple-700 dark:text-purple-300 uppercase tracking-wide">3. Network bandwidth (average)</span>
                    <div className="space-y-1 text-sm">
                      <div className="flex justify-between">
                        <span className="text-slate-600 dark:text-slate-400"><Term term="Ingress">Data flowing into your system, e.g. uploads.</Term></span>
                        <span className="font-mono font-bold text-slate-900 dark:text-white">{fmtBytes(ingressPerSec)}/s</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-600 dark:text-slate-400"><Term term="Egress">Data flowing out of your system to users, e.g. serving images.</Term></span>
                        <span className="font-mono font-bold text-slate-900 dark:text-white">{fmtBytes(egressPerSec)}/s</span>
                      </div>
                    </div>
                    <p className="text-xs font-mono text-slate-600 dark:text-slate-400 leading-relaxed">
                      Ingress = storage/day ÷ 86,400. Egress = reads/day × {fmtBytes(bytesPerWrite)} avg item ÷ 86,400 (= ingress × {pg.readsPerWrite}).
                    </p>
                  </div>

                  <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl space-y-2">
                    <span className="text-xs font-bold text-emerald-700 dark:text-emerald-300 uppercase tracking-wide">4. Cache and servers</span>
                    <div className="space-y-1 text-sm">
                      <div className="flex justify-between"><span className="text-slate-600 dark:text-slate-400">Cache memory ({pg.hotPct}% hot)</span><span className="font-mono font-bold text-slate-900 dark:text-white">{fmtBytes(cacheBytes)}</span></div>
                      <div className="flex justify-between"><span className="text-slate-600 dark:text-slate-400">App servers at peak</span><span className="font-mono font-bold text-slate-900 dark:text-white">~{serversNeeded.toLocaleString()}</span></div>
                    </div>
                    <p className="text-xs font-mono text-slate-600 dark:text-slate-400 leading-relaxed">
                      Cache = {pg.hotPct}% × {fmtBytes(cacheableDaily)} new {pg.cacheMedia ? 'data' : 'text'}/day. Servers = {fmtCount(peakTotalQps)} peak QPS ÷ {pg.qpsPerServer.toLocaleString()} per server.
                    </p>
                  </div>
                </div>
              </div>
              <Takeaway>Retention changes only total storage; the read ratio changes read QPS and egress but not storage; media size dominates storage and bandwidth. Knowing which input drives which output is the real skill.</Takeaway>
              <Quiz
                persistKey="chapter2:quiz:playground"
                questions={[
                  {
                    question: 'You double retention from 5 to 10 years. What changes?',
                    options: [
                      { text: 'Only the total storage doubles', correct: true, why: 'Retention multiplies storage per day by the number of days kept. QPS, bandwidth and daily cache size do not depend on it.' },
                      { text: 'QPS doubles too', why: 'Keeping data longer does not make users send more requests.' },
                      { text: 'Cache memory doubles', why: 'Here the cache is sized from the hot share of each day\'s new data, which retention does not change.' },
                    ],
                  },
                  {
                    question: 'You raise reads per write from 100 to 200. What happens?',
                    options: [
                      { text: 'Read QPS and egress double; storage stays the same', correct: true, why: 'Reads fetch existing data, so they add traffic but no new bytes to store.' },
                      { text: 'Storage doubles', why: 'Storage grows with writes, not reads.' },
                      { text: 'Write QPS doubles', why: 'Write QPS depends on DAU and writes per user only.' },
                    ],
                  },
                ]}
              />
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
};
