import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Send, Zap, RotateCcw, Timer } from 'lucide-react';
import { RateLimiterAlgo } from '../types';
import { usePersistentState } from '../lib/usePersistentState';
import { Term, QuizQuestion } from './learn/LearningKit';
import { ChapterPlayer, Lesson } from './lesson/ChapterPlayer';
import { Explain, Try, Check, GoDeeper, Callout, Figure, Stat, Slider, Button } from './lesson/blocks';

interface Chapter4RateLimiterProps {
  /** Kept for API compatibility with App; theming uses Tailwind `dark:` bound to the app toggle. */
  isDarkMode?: boolean;
}

// =====================================================================
// Limiter engine: pure functions over a mutable state object.
// Kept in a ref by the lab so bursts and timers always see the latest state.
// =====================================================================

type Status = 'ALLOWED' | 'REJECTED' | 'QUEUED';

interface Engine {
  tokens: number;
  lastRefill: number;
  queue: { id: number; at: number }[];
  lastLeak: number;
  windowStart: number;
  currCount: number; // fixed window counter, and "current window" for sliding counter
  prevCount: number; // sliding counter: requests counted in the previous window
  log: { t: number; allowed: boolean }[]; // sliding log: timestamps, including rejected ones (as in the book)
}

interface Config {
  algo: RateLimiterAlgo;
  capacity: number;
  rate: number;
  windowSec: number;
}

interface Decision {
  status: Status;
  reason: string;
  remaining: number;
  retryAfter?: number;
}

const LOG_MEMORY_CAP = 300;

const freshEngine = (now: number, capacity: number): Engine => ({
  tokens: capacity,
  lastRefill: now,
  queue: [],
  lastLeak: now,
  windowStart: now,
  currCount: 0,
  prevCount: 0,
  log: [],
});

const secs = (ms: number) => Math.max(1, Math.ceil(ms / 1000));

/** Apply the passage of time: refill, leak, window rollover. Returns ids of queued requests now served. */
function advance(e: Engine, cfg: Config, now: number): number[] {
  e.tokens = Math.min(cfg.capacity, e.tokens + ((now - e.lastRefill) / 1000) * cfg.rate);
  e.lastRefill = now;

  const interval = 1000 / cfg.rate;
  const served: number[] = [];
  if (e.queue.length === 0) e.lastLeak = Math.max(e.lastLeak, now - interval);
  while (e.queue.length > 0 && now - e.lastLeak >= interval) {
    e.lastLeak += interval;
    served.push(e.queue.shift()!.id);
  }
  if (e.queue.length === 0) e.lastLeak = Math.max(e.lastLeak, now - interval);

  const W = cfg.windowSec * 1000;
  if (now >= e.windowStart + W) {
    const k = Math.floor((now - e.windowStart) / W);
    e.prevCount = k === 1 ? e.currCount : 0; // skipped a whole window -> previous window had 0
    e.currCount = 0;
    e.windowStart += k * W;
  }
  return served;
}

/** Evaluate one request against the latest state. Mutates `e`. */
function decide(e: Engine, cfg: Config, now: number, id: number): Decision {
  const N = cfg.capacity;
  const W = cfg.windowSec * 1000;
  switch (cfg.algo) {
    case 'tokenBucket': {
      if (e.tokens >= 1) {
        e.tokens -= 1;
        return { status: 'ALLOWED', remaining: Math.floor(e.tokens), reason: `Took a token. ${Math.floor(e.tokens)} left in the bucket.` };
      }
      return { status: 'REJECTED', remaining: 0, retryAfter: secs(((1 - e.tokens) / cfg.rate) * 1000), reason: 'The bucket is empty, so there is no token to take.' };
    }
    case 'leakyBucket': {
      if (e.queue.length < N) {
        e.queue.push({ id, at: now });
        const pos = e.queue.length;
        const eta = Math.max(0, e.lastLeak + pos * (1000 / cfg.rate) - now) / 1000;
        return { status: 'QUEUED', remaining: N - pos, reason: `Waiting in the queue at position ${pos}. It will be served in about ${eta.toFixed(1)}s.` };
      }
      return { status: 'REJECTED', remaining: 0, retryAfter: secs(e.lastLeak + 1000 / cfg.rate - now), reason: `The queue is full (${N} of ${N}), so the request is dropped.` };
    }
    case 'fixedWindow': {
      if (e.currCount < N) {
        e.currCount += 1;
        return { status: 'ALLOWED', remaining: N - e.currCount, reason: `Counter is now ${e.currCount} of ${N} for this window.` };
      }
      return { status: 'REJECTED', remaining: 0, retryAfter: secs(e.windowStart + W - now), reason: `Counter is already ${N} of ${N}. Blocked until the window resets.` };
    }
    case 'slidingLog': {
      e.log = e.log.filter((x) => x.t > now - W);
      const entry = { t: now, allowed: false };
      e.log.push(entry);
      if (e.log.length > LOG_MEMORY_CAP) e.log.splice(0, e.log.length - LOG_MEMORY_CAP);
      const size = e.log.length;
      if (size <= N) {
        entry.allowed = true;
        return { status: 'ALLOWED', remaining: N - size, reason: `${size} timestamps in the last ${cfg.windowSec}s, which is within the limit of ${N}.` };
      }
      const blocker = e.log[size - N];
      return {
        status: 'REJECTED',
        remaining: 0,
        retryAfter: secs(blocker.t + W - now),
        reason: `${size} timestamps in the last ${cfg.windowSec}s is over ${N}. Rejected, but its timestamp stays in the log.`,
      };
    }
    case 'slidingCounter': {
      const overlap = 1 - Math.min(1, (now - e.windowStart) / W);
      const est = e.currCount + e.prevCount * overlap;
      const shown = `${e.currCount} + ${e.prevCount} × ${overlap.toFixed(2)} = ${est.toFixed(1)}`;
      if (Math.floor(est) < N) {
        e.currCount += 1;
        return { status: 'ALLOWED', remaining: Math.max(0, Math.ceil(N - (e.currCount + e.prevCount * overlap))), reason: `Estimate ${shown}, below ${N}.` };
      }
      const allowAt =
        e.currCount >= N ? e.windowStart + W + W * Math.max(0, 1 - N / e.currCount) : e.windowStart + W * (1 - (N - e.currCount) / e.prevCount);
      return { status: 'REJECTED', remaining: 0, retryAfter: secs(allowAt - now), reason: `Estimate ${shown}, which reaches the limit of ${N}.` };
    }
  }
}

// =====================================================================
// The lab: one algorithm, a picture of its state, three actions.
// =====================================================================

interface Req {
  id: number;
  status: Status;
  reason: string;
  retryAfter?: number;
  remaining: number;
  waitedMs?: number;
  at: number;
}

const isWindowAlgo = (a: RateLimiterAlgo) => a === 'fixedWindow' || a === 'slidingLog' || a === 'slidingCounter';

const LAB_DEFAULTS: Record<RateLimiterAlgo, { capacity: number; rate: number; windowSec: number }> = {
  tokenBucket: { capacity: 5, rate: 1, windowSec: 10 },
  leakyBucket: { capacity: 5, rate: 1, windowSec: 10 },
  fixedWindow: { capacity: 5, rate: 1, windowSec: 10 },
  slidingLog: { capacity: 5, rate: 1, windowSec: 10 },
  slidingCounter: { capacity: 5, rate: 1, windowSec: 10 },
};

const LimiterLab: React.FC<{ algo: RateLimiterAlgo }> = ({ algo }) => {
  const d = LAB_DEFAULTS[algo];
  const [capacity, setCapacity] = usePersistentState<number>(`rateLimiter:lab:${algo}:capacity`, d.capacity);
  const [rate, setRate] = usePersistentState<number>(`rateLimiter:lab:${algo}:rate`, d.rate);
  const [windowSec, setWindowSec] = usePersistentState<number>(`rateLimiter:lab:${algo}:window`, d.windowSec);

  const cfgRef = useRef<Config>({ algo, capacity, rate, windowSec });
  cfgRef.current = { algo, capacity, rate, windowSec };
  const engRef = useRef<Engine>(freshEngine(Date.now(), capacity));
  const nextId = useRef(1);
  const timers = useRef<number[]>([]);
  const [now, setNow] = useState(Date.now());
  const [, force] = useState(0);
  const [reqs, setReqs] = useState<Req[]>([]);
  const [demo, setDemo] = useState<string | null>(null);

  const markServed = useCallback((ids: number[]) => {
    if (!ids.length) return;
    const t = Date.now();
    setReqs((prev) => prev.map((r) => (ids.includes(r.id) ? { ...r, status: 'ALLOWED', waitedMs: t - r.at, reason: `Served after waiting ${((t - r.at) / 1000).toFixed(1)}s in the queue.` } : r)));
  }, []);

  // Clock: refill / leak / rollover keep moving with no traffic.
  useEffect(() => {
    const t = setInterval(() => {
      markServed(advance(engRef.current, cfgRef.current, Date.now()));
      setNow(Date.now());
    }, 150);
    return () => clearInterval(t);
  }, [markServed]);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const send = useCallback((): Status => {
    const t = Date.now();
    markServed(advance(engRef.current, cfgRef.current, t));
    const id = nextId.current++;
    const dcs = decide(engRef.current, cfgRef.current, t, id);
    setReqs((prev) => [...prev, { id, at: t, ...dcs }].slice(-24));
    force((n) => n + 1);
    return dcs.status;
  }, [markServed]);

  const later = (fn: () => void, ms: number) => timers.current.push(window.setTimeout(fn, ms));

  const reset = (cap = capacity) => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    engRef.current = freshEngine(Date.now(), cap);
    setReqs([]);
    setDemo(null);
    setNow(Date.now());
  };

  const burst = () => {
    for (let i = 0; i < 5; i++) later(() => send(), i * 100);
  };

  /** A full limit just before a window edge and another just after. */
  const edgeDemo = () => {
    const N = capacity;
    const W = windowSec * 1000;
    const gap = 60;
    const lead = N * gap + 400;
    reset();
    const start = Date.now();
    engRef.current.windowStart = start + lead - W; // the window ends `lead` ms from now
    let allowed = 0;
    for (let i = 0; i < N; i++) later(() => { if (send() === 'ALLOWED') allowed++; }, i * gap);
    for (let i = 0; i < N; i++) later(() => { if (send() === 'ALLOWED') allowed++; }, lead + 200 + i * gap);
    later(() => {
      const span = ((Date.now() - start) / 1000).toFixed(1);
      setDemo(`${allowed} of ${2 * N} requests got through in ${span} seconds. The limit is ${N} per ${windowSec} seconds.`);
    }, lead + 200 + N * gap + 250);
  };

  const e = engRef.current;
  const W = windowSec * 1000;
  const elapsed = Math.min(1, Math.max(0, (now - e.windowStart) / W));
  const latest = reqs[reqs.length - 1];
  const allowed = reqs.filter((r) => r.status === 'ALLOWED').length;
  const rejected = reqs.filter((r) => r.status === 'REJECTED').length;
  const queued = reqs.filter((r) => r.status === 'QUEUED').length;

  return (
    <div className="space-y-6">
      {/* 1. The picture of the limiter's state */}
      <div className="rounded-xl bg-slate-50 dark:bg-white/[0.04] p-4 sm:p-5">
        <StateView algo={algo} e={e} cfg={cfgRef.current} now={now} elapsed={elapsed} />
      </div>

      {/* 2. Actions */}
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" onClick={() => send()}>
          <Send className="w-4 h-4" /> Send 1 request
        </Button>
        <Button onClick={burst}>
          <Zap className="w-4 h-4" /> Send 5 at once
        </Button>
        {isWindowAlgo(algo) && (
          <Button onClick={edgeDemo}>
            <Timer className="w-4 h-4" /> Burst across a window edge
          </Button>
        )}
        <Button variant="ghost" onClick={() => reset()}>
          <RotateCcw className="w-4 h-4" /> Reset
        </Button>
      </div>

      {/* 3. What happened */}
      <div className="space-y-3">
        <div className="flex flex-wrap gap-1.5 min-h-[28px]" aria-label="Recent requests">
          {reqs.length === 0 && <span className="text-sm text-slate-500 dark:text-slate-400">No requests yet.</span>}
          {reqs.map((r) => (
            <span
              key={r.id}
              title={r.reason}
              className={`inline-flex h-7 min-w-[44px] items-center justify-center rounded-md px-1.5 text-xs font-semibold tabular-nums transition-colors ${
                r.status === 'ALLOWED'
                  ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-400/15 dark:text-emerald-300'
                  : r.status === 'QUEUED'
                  ? 'bg-amber-100 text-amber-800 dark:bg-amber-400/15 dark:text-amber-300'
                  : 'bg-rose-100 text-rose-800 dark:bg-rose-400/15 dark:text-rose-300'
              }`}
            >
              {r.status === 'ALLOWED' ? '200' : r.status === 'QUEUED' ? 'wait' : '429'}
            </span>
          ))}
        </div>

        {demo ? (
          <Callout tone="idea" title="Edge burst result">{demo}</Callout>
        ) : (
          latest && (
            <Callout
              tone={latest.status === 'ALLOWED' ? 'success' : latest.status === 'QUEUED' ? 'warning' : 'danger'}
              title={latest.status === 'ALLOWED' ? '200 OK: request allowed' : latest.status === 'QUEUED' ? 'Queued: request waits its turn' : '429 Too Many Requests'}
            >
              {latest.reason}
              {latest.status === 'REJECTED' && latest.retryAfter !== undefined && <> The client is told to retry after {latest.retryAfter}s.</>}
            </Callout>
          )
        )}

        <div className="grid grid-cols-3 gap-3">
          <Stat label="Allowed" value={allowed} tone={allowed ? 'good' : 'neutral'} />
          {algo === 'leakyBucket' ? <Stat label="Waiting" value={queued} /> : <Stat label="Limit" value={capacity} hint={isWindowAlgo(algo) ? `per ${windowSec}s` : 'bucket size'} />}
          <Stat label="Rejected" value={rejected} tone={rejected ? 'bad' : 'neutral'} />
        </div>
      </div>

      {/* 4. Settings, secondary */}
      <details className="group rounded-xl ring-1 ring-slate-200 dark:ring-white/10 [&_summary::-webkit-details-marker]:hidden">
        <summary className="cursor-pointer select-none px-4 py-3 text-sm font-medium text-slate-700 dark:text-slate-200">
          Change the settings
          <span className="ml-2 font-normal text-slate-500 dark:text-slate-400">
            {algo === 'tokenBucket' && `size ${capacity}, refill ${rate}/s`}
            {algo === 'leakyBucket' && `queue ${capacity}, outflow ${rate}/s`}
            {isWindowAlgo(algo) && `${capacity} per ${windowSec}s`}
          </span>
        </summary>
        <div className="grid gap-5 sm:grid-cols-2 px-4 pb-4">
          <Slider
            label={algo === 'leakyBucket' ? 'Queue size' : algo === 'tokenBucket' ? 'Bucket size' : 'Limit'}
            value={capacity}
            min={1}
            max={12}
            onChange={(v) => {
              setCapacity(v);
              reset(v);
            }}
          />
          {isWindowAlgo(algo) ? (
            <Slider label="Window length" unit="s" value={windowSec} min={3} max={20} onChange={(v) => { setWindowSec(v); reset(); }} />
          ) : (
            <Slider label={algo === 'leakyBucket' ? 'Outflow rate' : 'Refill rate'} unit="/s" value={rate} min={1} max={5} onChange={setRate} />
          )}
        </div>
      </details>
    </div>
  );
};

/** Draws the limiter's internal state for one algorithm. */
const StateView: React.FC<{ algo: RateLimiterAlgo; e: Engine; cfg: Config; now: number; elapsed: number }> = ({ algo, e, cfg, now, elapsed }) => {
  const N = cfg.capacity;
  const W = cfg.windowSec * 1000;
  const label = 'text-xs font-medium text-slate-500 dark:text-slate-400';

  if (algo === 'tokenBucket') {
    const whole = Math.floor(e.tokens);
    const nextIn = e.tokens >= N ? null : ((1 - (e.tokens - whole)) / cfg.rate).toFixed(1);
    return (
      <div className="space-y-3">
        <div className="flex items-baseline justify-between">
          <p className={label}>Tokens in the bucket</p>
          <p className="text-sm tabular-nums text-slate-600 dark:text-slate-300">{nextIn ? `next token in ${nextIn}s` : 'bucket is full'}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: N }).map((_, i) => (
            <span
              key={i}
              className={`h-8 w-8 rounded-full transition-all duration-300 ${
                i < whole ? 'bg-amber-400 shadow-inner scale-100' : 'bg-transparent border-2 border-dashed border-slate-300 dark:border-white/20 scale-90'
              }`}
            />
          ))}
        </div>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          <strong className="text-slate-900 dark:text-white tabular-nums">{whole}</strong> of {N} tokens. Each request takes one. {cfg.rate} token{cfg.rate > 1 ? 's' : ''} drip back
          in every second.
        </p>
      </div>
    );
  }

  if (algo === 'leakyBucket') {
    const interval = 1000 / cfg.rate;
    const nextIn = e.queue.length ? Math.max(0, (e.lastLeak + interval - now) / 1000).toFixed(1) : null;
    return (
      <div className="space-y-3">
        <div className="flex items-baseline justify-between">
          <p className={label}>Queue (first in, first out)</p>
          <p className="text-sm tabular-nums text-slate-600 dark:text-slate-300">{nextIn ? `next one served in ${nextIn}s` : 'queue is empty'}</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex flex-row-reverse gap-1.5">
            {Array.from({ length: N }).map((_, i) => (
              <span
                key={i}
                className={`h-9 w-9 rounded-lg transition-all duration-300 ${
                  i < e.queue.length ? 'bg-amber-400' : 'border-2 border-dashed border-slate-300 dark:border-white/20'
                }`}
              />
            ))}
          </div>
          <span className="text-slate-400">→</span>
          <span className="rounded-lg bg-slate-900 text-white dark:bg-white dark:text-slate-900 px-3 py-2 text-xs font-medium">
            server, {cfg.rate}/s
          </span>
        </div>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          <strong className="text-slate-900 dark:text-white tabular-nums">{e.queue.length}</strong> of {N} slots used. Requests leave at a steady {cfg.rate} per second, however
          fast they arrive.
        </p>
      </div>
    );
  }

  const windowBar = (
    <div>
      <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400 mb-1">
        <span>current window</span>
        <span className="tabular-nums">resets in {Math.max(0, (e.windowStart + W - now) / 1000).toFixed(1)}s</span>
      </div>
      <div className="h-2 rounded-full bg-slate-200 dark:bg-white/10 overflow-hidden">
        <div className="h-full bg-indigo-500" style={{ width: `${elapsed * 100}%` }} />
      </div>
    </div>
  );

  if (algo === 'fixedWindow') {
    return (
      <div className="space-y-4">
        <p className={label}>Counter for this window</p>
        <div className="flex flex-wrap gap-1.5">
          {Array.from({ length: N }).map((_, i) => (
            <span key={i} className={`h-8 w-8 rounded-md transition-colors ${i < e.currCount ? 'bg-indigo-500' : 'border-2 border-dashed border-slate-300 dark:border-white/20'}`} />
          ))}
        </div>
        {windowBar}
        <p className="text-sm text-slate-600 dark:text-slate-300">
          <strong className="text-slate-900 dark:text-white tabular-nums">{e.currCount}</strong> of {N} used. When the window ends, the counter drops straight back to 0.
        </p>
      </div>
    );
  }

  if (algo === 'slidingLog') {
    const inWindow = e.log.filter((x) => x.t > now - W);
    return (
      <div className="space-y-4">
        <div className="flex items-baseline justify-between">
          <p className={label}>Timestamps in the last {cfg.windowSec}s</p>
          <p className="text-sm tabular-nums text-slate-600 dark:text-slate-300">
            {inWindow.length} stored · limit {N}
          </p>
        </div>
        <div className="relative h-12 rounded-lg bg-white ring-1 ring-slate-200 dark:bg-white/[0.03] dark:ring-white/10">
          {inWindow.map((x, i) => {
            const pos = 1 - (now - x.t) / W; // 0 = window start (left), 1 = now (right)
            return (
              <span
                key={x.t + '-' + i}
                title={x.allowed ? 'allowed' : 'rejected (still stored)'}
                className={`absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full ${x.allowed ? 'bg-emerald-500' : 'bg-rose-500'}`}
                style={{ left: `${4 + pos * 92}%` }}
              />
            );
          })}
          <span className="absolute bottom-1 left-2 text-[11px] text-slate-500 dark:text-slate-400">{cfg.windowSec}s ago</span>
          <span className="absolute bottom-1 right-2 text-[11px] text-slate-500 dark:text-slate-400">now</span>
        </div>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Dots slide left and drop off as they age. <span className="text-emerald-600 dark:text-emerald-400">Green</span> were allowed,{' '}
          <span className="text-rose-600 dark:text-rose-400">red</span> were rejected but still take memory and still count.
        </p>
      </div>
    );
  }

  // slidingCounter
  const overlap = 1 - elapsed;
  const est = e.currCount + e.prevCount * overlap;
  return (
    <div className="space-y-4">
      <p className={label}>Estimated requests in the rolling window</p>
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-lg bg-white ring-1 ring-slate-200 dark:bg-white/[0.03] dark:ring-white/10 p-3">
          <p className="text-xs text-slate-500 dark:text-slate-400">Previous window</p>
          <p className="text-xl font-semibold tabular-nums text-slate-900 dark:text-white">{e.prevCount}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">counts {Math.round(overlap * 100)}%</p>
        </div>
        <div className="rounded-lg bg-white ring-1 ring-slate-200 dark:bg-white/[0.03] dark:ring-white/10 p-3">
          <p className="text-xs text-slate-500 dark:text-slate-400">Current window</p>
          <p className="text-xl font-semibold tabular-nums text-slate-900 dark:text-white">{e.currCount}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">counts 100%</p>
        </div>
      </div>
      {windowBar}
      <p className="text-sm text-slate-700 dark:text-slate-200 tabular-nums">
        {e.currCount} + {e.prevCount} × {overlap.toFixed(2)} ={' '}
        <strong className={Math.floor(est) >= N ? 'text-rose-600 dark:text-rose-400' : 'text-slate-900 dark:text-white'}>{est.toFixed(1)}</strong>{' '}
        <span className="text-slate-500 dark:text-slate-400">(limit {N})</span>
      </p>
    </div>
  );
};

// =====================================================================
// Small figures and mini-labs used by the concept lessons
// =====================================================================

const PlacementDiagram: React.FC = () => (
  <svg
    viewBox="0 0 660 230"
    role="img"
    aria-label="A client sends three requests to the rate limiter middleware. The middleware checks a counter in Redis, forwards requests 1 and 2 to the API servers, and returns HTTP 429 for request 3."
    className="w-full h-auto"
  >
    <defs>
      <marker id="rl-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
        <path d="M0,0 L10,5 L0,10 z" fill="context-stroke" />
      </marker>
    </defs>
    <g fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="10" y="40" width="120" height="60" rx="10" />
      <rect x="260" y="40" width="150" height="60" rx="10" />
      <rect x="530" y="40" width="120" height="60" rx="10" />
      <rect x="275" y="165" width="120" height="50" rx="10" strokeDasharray="4 3" />
    </g>
    <g fill="currentColor" fontSize="14" textAnchor="middle" fontWeight="600">
      <text x="70" y="75">Client</text>
      <text x="335" y="68">Rate limiter</text>
      <text x="335" y="86" fontWeight="400">middleware</text>
      <text x="590" y="75">API servers</text>
      <text x="335" y="195" fontWeight="400">Redis counter</text>
    </g>
    <g strokeWidth="1.75" markerEnd="url(#rl-arrow)">
      <line x1="130" y1="58" x2="258" y2="58" stroke="currentColor" />
      <line x1="410" y1="70" x2="528" y2="70" stroke="#10b981" />
      <line x1="258" y1="88" x2="132" y2="88" stroke="#f43f5e" />
      <line x1="320" y1="102" x2="320" y2="163" stroke="currentColor" />
      <line x1="350" y1="102" x2="350" y2="163" stroke="currentColor" />
    </g>
    <g fontSize="13" textAnchor="middle" fill="currentColor">
      <text x="194" y="50">requests 1, 2, 3</text>
      <text x="469" y="60" fill="#059669">forwards 1, 2</text>
      <text x="194" y="110" fill="#e11d48">429 for 3</text>
      <text x="312" y="138" textAnchor="end">read</text>
      <text x="358" y="138" textAnchor="start">+1</text>
      <text x="590" y="122" opacity="0.7">never sees request 3</text>
    </g>
  </svg>
);

const PLACEMENTS = [
  {
    id: 'client',
    title: 'In the client app',
    verdict: 'bad' as const,
    text: 'Easy to add, but anyone can forge requests that skip your app entirely, and you often do not control client code. It cannot protect the server.',
  },
  {
    id: 'server',
    title: 'Inside the API servers',
    verdict: 'ok' as const,
    text: 'Full control over the algorithm, but every server must share the same counts, and your language and cache must make it fast.',
  },
  {
    id: 'middleware',
    title: 'In a middleware in front',
    verdict: 'good' as const,
    text: 'A separate layer throttles before requests reach the API servers, so rejected requests cost them nothing. This is the diagram above.',
  },
  {
    id: 'gateway',
    title: 'In an API gateway',
    verdict: 'good' as const,
    text: 'A managed middleware that also handles auth, SSL and IP allow-lists. Quick to adopt if you already have one, but you may not get to pick the algorithm.',
  },
];

const PlacementPicker: React.FC = () => {
  const [picked, setPicked] = usePersistentState<string | null>('rateLimiter:placement', null);
  const p = PLACEMENTS.find((x) => x.id === picked);
  return (
    <div className="space-y-4">
      <div className="grid gap-2 sm:grid-cols-2">
        {PLACEMENTS.map((x) => (
          <button
            key={x.id}
            onClick={() => setPicked(x.id)}
            aria-pressed={picked === x.id}
            className={`rounded-xl px-4 py-3 text-left text-sm font-medium transition-colors ring-1 ${
              picked === x.id
                ? 'bg-indigo-50 ring-indigo-400 text-indigo-900 dark:bg-indigo-400/[0.1] dark:ring-indigo-400/50 dark:text-white'
                : 'bg-white ring-slate-200 text-slate-800 hover:ring-slate-300 dark:bg-white/[0.03] dark:ring-white/10 dark:text-slate-100'
            }`}
          >
            {x.title}
          </button>
        ))}
      </div>
      {p ? (
        <Callout tone={p.verdict === 'bad' ? 'danger' : p.verdict === 'ok' ? 'warning' : 'success'} title={p.title}>
          {p.text}
        </Callout>
      ) : (
        <p className="text-sm text-slate-500 dark:text-slate-400">Pick a place to see the trade-off.</p>
      )}
    </div>
  );
};

/** Two concurrent requests doing read, check, write on a shared counter. */
const RaceLab: React.FC = () => {
  const [mode, setMode] = useState<'naive' | 'atomic' | null>(null);
  const steps =
    mode === 'naive'
      ? [
          ['A reads the counter', '3'],
          ['B reads the counter', '3'],
          ['A writes 3 + 1', '4'],
          ['B writes 3 + 1', '4'],
        ]
      : mode === 'atomic'
      ? [
          ['A runs read + check + write as one step', '4'],
          ['B runs read + check + write as one step', '5'],
        ]
      : [];
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Button variant={mode === 'naive' ? 'primary' : 'secondary'} onClick={() => setMode('naive')}>
          Run the naive way
        </Button>
        <Button variant={mode === 'atomic' ? 'primary' : 'secondary'} onClick={() => setMode('atomic')}>
          Run with an atomic Lua script
        </Button>
      </div>
      {mode && (
        <>
          <ol className="space-y-1.5 text-sm">
            <li className="flex justify-between rounded-lg bg-slate-50 dark:bg-white/[0.04] px-3 py-2 text-slate-500 dark:text-slate-400">
              <span>Start</span>
              <span className="tabular-nums">counter = 3</span>
            </li>
            {steps.map(([what, val], i) => (
              <li key={i} className="flex justify-between rounded-lg bg-slate-50 dark:bg-white/[0.04] px-3 py-2 text-slate-800 dark:text-slate-100" style={{ animation: `fadein .25s ease-out ${i * 0.15}s both` }}>
                <span>{what}</span>
                <span className="tabular-nums font-medium">counter = {val}</span>
              </li>
            ))}
          </ol>
          {mode === 'naive' ? (
            <Callout tone="danger" title="Two requests arrived, but the counter only went up by one">
              B read the old value before A wrote. One request slipped through uncounted.
            </Callout>
          ) : (
            <Callout tone="success" title="Both requests counted">
              Redis runs the whole script at once, so B cannot read in the middle of A's update.
            </Callout>
          )}
        </>
      )}
    </div>
  );
};

// =====================================================================
// Lessons
// =====================================================================

const ALGO_QUIZ: Record<RateLimiterAlgo, QuizQuestion[]> = {
  tokenBucket: [
    {
      question: 'Bucket size 4, refill 2 tokens per second, bucket full. A client sends 6 requests at the same instant. What happens?',
      options: [
        { text: '4 pass, 2 get HTTP 429', correct: true, why: 'Only 4 tokens exist at that instant. Refill adds tokens over the next second, too late for requests arriving now.' },
        { text: 'All 6 pass, because 2 tokens are refilled every second', why: 'Refill happens over time. At the instant the 6 requests arrive there are only 4 tokens.' },
        { text: 'All 6 are queued and served 2 per second', why: 'Queueing and serving at a fixed rate is the leaky bucket. A token bucket rejects when it has no token.' },
      ],
    },
  ],
  leakyBucket: [
    {
      question: 'Queue size 5, outflow 1 per second, queue empty. 8 requests arrive at once. What do clients see?',
      options: [
        { text: '5 wait in the queue and are served one per second; 3 get 429', correct: true, why: 'The queue holds 5 and drains at the outflow rate, so the 5th waits about 4 seconds. The 3 that find it full are dropped.' },
        { text: '5 are served immediately, 3 are rejected', why: 'A queue does not speed anything up. Queued requests wait until the server pulls them at the outflow rate.' },
        { text: 'All 8 are queued and eventually served', why: 'The queue size is the bucket size. Once 5 are waiting, new arrivals are dropped.' },
      ],
    },
  ],
  fixedWindow: [
    {
      question: 'Limit 5 per minute, windows reset on the minute. 5 requests arrive at 2:00:45 and 5 more at 2:01:10. How many fall inside the one-minute span 2:00:30 to 2:01:30?',
      options: [
        { text: '10, twice the limit', correct: true, why: 'Each batch is inside its own window, so all 10 pass. Any rolling minute that straddles the reset contains both.' },
        { text: '5, because it never allows more than 5 per minute', why: 'It never allows more than 5 per calendar minute. Other one-minute spans can contain up to twice that.' },
        { text: '0, because the second batch is rejected', why: 'The second batch lands in a fresh window whose counter starts at 0.' },
      ],
    },
  ],
  slidingLog: [
    {
      question: 'Why does the sliding log use more memory than the other algorithms?',
      options: [
        { text: 'It keeps one timestamp per request, even rejected ones, instead of one or two counters', correct: true, why: 'Memory grows with traffic, not with the limit, and rejected requests add entries too.' },
        { text: 'It stores the full body of every request', why: 'Only timestamps are stored, often in a Redis sorted set. One entry per request still adds up.' },
        { text: 'It never deletes anything', why: 'Old timestamps are removed on each new request. The cost is how many remain inside the window.' },
      ],
    },
  ],
  slidingCounter: [
    {
      question: 'Limit 7 per minute. The previous minute had 5 requests, the current one 3. A request arrives 30% into the current minute. What is the estimate?',
      options: [
        { text: '3 + 5 × 0.7 = 6.5, so it is allowed', correct: true, why: 'The rolling window still overlaps 70% of the previous minute. 6.5 rounds down to 6, below 7.' },
        { text: '3 + 5 × 0.3 = 4.5, so it is allowed', why: '0.3 is how far into the current window we are. The previous window is weighted by the overlap, 1 − 0.3 = 0.7.' },
        { text: '3 + 5 = 8, so it is rejected', why: 'That counts the whole previous minute. Only 70% of it overlaps the rolling window.' },
      ],
    },
  ],
};

const LESSONS: Lesson[] = [
  {
    id: 'what',
    title: 'What a rate limiter does',
    goal: 'A rate limiter caps how many requests a client can make in a period of time, and turns the extra ones away.',
    content: (
      <>
        <Explain>
          <p>
            Picture an API that allows <strong>2 requests per second</strong>. A client sends 3 in one second. The first two go through; the third is
            answered with{' '}
            <Term term="HTTP 429">"Too Many Requests", the status code a rate limiter returns when a client is over its limit.</Term> before it
            ever reaches your servers.
          </p>
          <p>Rate limiters exist for three reasons:</p>
          <ul>
            <li>
              <strong>Stop abuse and overload.</strong> One runaway or malicious client should not be able to starve everyone else.
            </li>
            <li>
              <strong>Control cost.</strong> Fewer wasted calls, especially to paid third-party APIs.
            </li>
            <li>
              <strong>Keep servers healthy.</strong> Bots and retry storms are cut off early.
            </li>
          </ul>
        </Explain>
        <Figure caption="The limiter sits in front of the servers and keeps a count per client in a fast in-memory store such as Redis.">
          <PlacementDiagram />
        </Figure>
        <Check
          persistKey="rateLimiter:quiz:what"
          questions={[
            {
              question: 'A client goes over its limit. What does a well-built rate limiter send back?',
              options: [
                { text: 'HTTP 429 Too Many Requests', correct: true, why: '429 tells the client it is being throttled, so it can slow down and retry later.' },
                { text: 'HTTP 500 Internal Server Error', why: '500 means the server failed. Nothing failed here; the client simply sent too much.' },
                { text: 'Nothing: the request is silently dropped', why: 'Silent drops leave clients guessing and retrying. A clear 429 plus headers is the book\'s answer.' },
              ],
            },
          ]}
        />
      </>
    ),
  },
  {
    id: 'where',
    title: 'Where to put it',
    goal: 'Limits only work where the client cannot bypass them. Choose between the server, a middleware and an API gateway.',
    content: (
      <>
        <Explain>
          <p>
            Before choosing an algorithm you have to choose where requests get counted. There is no single right answer, but there is one wrong one.
          </p>
        </Explain>
        <Try task="Tap each place to see its trade-off.">
          <PlacementPicker />
        </Try>
        <GoDeeper title="How to choose in an interview">
          <ul>
            <li>Check your stack: can your language and cache implement it efficiently on the server?</li>
            <li>Need a specific algorithm? Building it yourself gives full control; a third-party gateway may not offer it.</li>
            <li>Already running an API gateway for auth or IP allow-lists? Add the limiter there.</li>
            <li>Short on engineering time? A commercial gateway beats building your own.</li>
          </ul>
        </GoDeeper>
        <Check
          persistKey="rateLimiter:quiz:placement"
          questions={[
            {
              question: 'Your company already runs an API gateway for authentication, and the team is small. Where should the rate limiter go?',
              options: [
                { text: 'In the API gateway', correct: true, why: 'The book suggests adding it to an existing gateway, especially with limited engineering time.' },
                { text: 'In the mobile and web apps', why: 'Client-side limits can be bypassed with forged requests.' },
                { text: 'In each API server, written from scratch', why: 'Possible, and gives full control, but it costs time the small team does not have.' },
              ],
            },
          ]}
        />
      </>
    ),
  },
  {
    id: 'token',
    title: 'Algorithm 1: Token bucket',
    goal: 'A bucket of tokens lets a short burst through, then throttles traffic down to the refill rate.',
    content: (
      <>
        <Explain>
          <p>
            The bucket holds up to a fixed number of tokens, and new tokens drip in at a steady rate. Each request takes one token. <strong>No token, no
            entry.</strong>
          </p>
          <p>Two settings: the bucket size (how big a burst you allow) and the refill rate (the long-run average).</p>
        </Explain>
        <Try task={<>Press <strong>Send 5 at once</strong> twice in a row. The first burst empties the bucket. The second mostly gets 429 because tokens only come back one per second.</>}>
          <LimiterLab algo="tokenBucket" />
        </Try>
        <Callout tone="idea" title="Who uses it">
          Amazon and Stripe throttle their APIs with token buckets, because short bursts are normal client behaviour.
        </Callout>
        <Check persistKey="rateLimiter:quiz:sim:tokenBucket" questions={ALGO_QUIZ.tokenBucket} />
      </>
    ),
  },
  {
    id: 'leaky',
    title: 'Algorithm 2: Leaky bucket',
    goal: 'A leaky bucket turns a burst into a steady outflow by queueing requests instead of rejecting them straight away.',
    content: (
      <>
        <Explain>
          <p>
            Requests join a <strong>queue</strong>. The server takes them off the front at a fixed rate, no matter how fast they arrive. Only when the
            queue is full is a request dropped.
          </p>
          <p>The price of a smooth outflow is waiting time: during a burst, later requests sit in the queue.</p>
        </Explain>
        <Try task={<>Press <strong>Send 5 at once</strong>, then once more. Watch the first five turn from <em>wait</em> to 200 one by one, and the extras get 429.</>}>
          <LimiterLab algo="leakyBucket" />
        </Try>
        <Callout tone="idea" title="Who uses it">
          Shopify uses a leaky bucket. It fits whenever the thing behind the limiter needs a stable rate.
        </Callout>
        <Check persistKey="rateLimiter:quiz:sim:leakyBucket" questions={ALGO_QUIZ.leakyBucket} />
      </>
    ),
  },
  {
    id: 'fixed',
    title: 'Algorithm 3: Fixed window counter',
    goal: 'Count requests per fixed time window. Cheap and simple, but a burst at a window edge lets through twice the limit.',
    content: (
      <>
        <Explain>
          <p>
            Time is cut into fixed windows, say 10 seconds each. Each window has one counter. When it reaches the limit, requests are rejected until the
            next window starts and the counter resets to zero.
          </p>
        </Explain>
        <Try task={<>Press <strong>Burst across a window edge</strong>. It sends a full limit just before the reset and another full limit just after. Count how many get through.</>}>
          <LimiterLab algo="fixedWindow" />
        </Try>
        <Callout tone="warning" title="The edge problem">
          Both batches fit inside their own window, so all of them pass, even though they arrived within about a second of each other.
        </Callout>
        <Check persistKey="rateLimiter:quiz:sim:fixedWindow" questions={ALGO_QUIZ.fixedWindow} />
      </>
    ),
  },
  {
    id: 'log',
    title: 'Algorithm 4: Sliding window log',
    goal: 'Keep a timestamp for every request so the limit is exact over any rolling window, at the cost of memory.',
    content: (
      <>
        <Explain>
          <p>
            Instead of a counter, keep a list of <strong>request timestamps</strong>. On each request, drop the ones older than the window, add the new
            one, and allow it if the list is within the limit.
          </p>
          <p>Following the book, a rejected request's timestamp stays in the list too.</p>
        </Explain>
        <Try task={<>Press <strong>Burst across a window edge</strong> and compare with the fixed window: the second batch is blocked. Then send a few more and watch the red dots pile up.</>}>
          <LimiterLab algo="slidingLog" />
        </Try>
        <Callout tone="warning" title="The catch">
          Memory grows with traffic, not with the limit. A client that keeps retrying keeps adding timestamps, and keeps itself blocked.
        </Callout>
        <Check persistKey="rateLimiter:quiz:sim:slidingLog" questions={ALGO_QUIZ.slidingLog} />
      </>
    ),
  },
  {
    id: 'counter',
    title: 'Algorithm 5: Sliding window counter',
    goal: 'Estimate a rolling window from just two counters: the current window plus a fading share of the previous one.',
    content: (
      <>
        <Explain>
          <p>
            <strong>Estimate = current window + previous window × overlap</strong>, where overlap is how much of the rolling window still lies in the
            previous window. Early in a window the previous count weighs almost fully; by the end it has faded to nothing.
          </p>
        </Explain>
        <Try task={<>Send a few requests, then wait for the window to reset. Watch the previous count's weight shrink as the bar fills. Try the edge burst too.</>}>
          <LimiterLab algo="slidingCounter" />
        </Try>
        <Callout tone="idea" title="Good enough in practice">
          It assumes the previous window's requests were evenly spread. Cloudflare measured only 0.003% wrong decisions across 400 million requests.
        </Callout>
        <Check persistKey="rateLimiter:quiz:sim:slidingCounter" questions={ALGO_QUIZ.slidingCounter} />
      </>
    ),
  },
  {
    id: 'choose',
    title: 'Choosing an algorithm',
    goal: 'Each algorithm trades burst tolerance, accuracy and memory differently. Pick by what the use case needs.',
    content: (
      <>
        <Explain>
          <div className="overflow-x-auto -mx-1">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-500 dark:text-slate-400">
                  <th className="py-2 px-1 font-medium">Algorithm</th>
                  <th className="py-2 px-1 font-medium">Memory</th>
                  <th className="py-2 px-1 font-medium">Bursts</th>
                  <th className="py-2 px-1 font-medium">Best for</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-white/10">
                {[
                  ['Token bucket', 'tiny', 'allowed, up to bucket size', 'bursty APIs, flash sales'],
                  ['Leaky bucket', 'bounded queue', 'queued, then smoothed', 'a downstream needing a steady rate'],
                  ['Fixed window', '1 counter', 'up to 2× at edges', 'simple quotas that reset on schedule'],
                  ['Sliding log', '1 entry per request', 'never over the limit', 'when exactness matters most'],
                  ['Sliding counter', '2 counters', 'approximately limited', 'the usual default at scale'],
                ].map((row) => (
                  <tr key={row[0]}>
                    {row.map((c, i) => (
                      <td key={i} className={`py-2 px-1 align-top ${i === 0 ? 'font-medium text-slate-900 dark:text-white' : ''}`}>
                        {c}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Explain>
        <Check
          persistKey="rateLimiter:quiz:algorithms"
          questions={[
            {
              question: 'A flash sale will cause short bursts of legitimate traffic. Which algorithm fits best?',
              options: [
                { text: 'Token bucket', correct: true, why: 'Stored tokens let a burst through while the refill rate still caps the average.' },
                { text: 'Leaky bucket', why: 'It would queue the burst and add delay, then drop requests once the queue fills.' },
                { text: 'Sliding window log', why: 'Precise but memory hungry, and it has no notion of saved-up burst capacity.' },
              ],
            },
            {
              question: 'A payment processor behind you can only handle a fixed number of calls per second. Which algorithm fits?',
              options: [
                { text: 'Leaky bucket', correct: true, why: 'It serves requests at a fixed outflow rate, exactly what a rate-sensitive downstream needs.' },
                { text: 'Token bucket', why: 'A full bucket lets a burst through at once, which could overwhelm the processor.' },
                { text: 'Fixed window counter', why: 'Requests can still arrive all at once inside a window, and up to twice the limit at an edge.' },
              ],
            },
          ]}
        />
      </>
    ),
  },
  {
    id: 'production',
    title: 'Running it in production',
    goal: 'Tell clients where they stand, and keep one correct count when many limiter servers run at once.',
    content: (
      <>
        <Explain>
          <p>
            With many limiter servers, the counters live in one shared store such as Redis. That raises a new problem: two requests updating the same
            counter at the same moment.
          </p>
        </Explain>
        <Try task="Run the same two concurrent requests both ways and compare the final counter.">
          <RaceLab />
        </Try>
        <GoDeeper title="Headers clients see">
          <p>Every response carries headers so a well-behaved client can slow down before it gets blocked:</p>
          <pre className="rounded-lg bg-slate-900 text-slate-100 p-3 text-xs overflow-x-auto">
{`HTTP/1.1 429 Too Many Requests
X-Ratelimit-Limit: 10         # calls allowed per window
X-Ratelimit-Remaining: 0      # calls left in this window
X-Ratelimit-Retry-After: 4    # seconds until you may retry`}
          </pre>
        </GoDeeper>
        <GoDeeper title="Many limiter servers: sticky sessions vs shared store">
          <p>
            A client's requests may land on different limiter servers. If each keeps its own counts, none sees the full picture. Pinning each client to
            one server (sticky sessions) works but does not scale; a central store like Redis lets any server decide correctly.
          </p>
        </GoDeeper>
        <GoDeeper title="Hard vs soft limits, and monitoring">
          <ul>
            <li>
              <strong>Hard limit:</strong> requests can never exceed the threshold. <strong>Soft limit:</strong> they may, briefly.
            </li>
            <li>Rules usually live in config files (e.g. "at most 5 logins per minute") and are cached by the limiter.</li>
            <li>Watch whether rules are too strict (valid users blocked) or too loose. Clients should back off and retry after the 429.</li>
          </ul>
        </GoDeeper>
        <Check
          persistKey="rateLimiter:quiz:production"
          questions={[
            {
              question: 'The Redis counter is 3. Two requests run the naive read, check, write +1 at the same moment. What is the counter afterwards?',
              options: [
                { text: '4, so one request went uncounted', correct: true, why: 'Both read 3 and both write 4. An atomic Lua script or sorted set prevents this lost update.' },
                { text: '5, because Redis handles one command at a time', why: 'Each command is atomic, but read and write are separate commands, so the other request slips in between.' },
                { text: 'It depends on which request finishes first', why: 'Either order gives the same wrong answer: 4.' },
              ],
            },
            {
              question: 'A client got a 429. Which header tells it when to try again?',
              options: [
                { text: 'X-Ratelimit-Retry-After', correct: true, why: 'It gives the seconds to wait before the next request will be accepted.' },
                { text: 'X-Ratelimit-Remaining', why: 'That is how many calls are left; after a 429 it is 0 and says nothing about timing.' },
                { text: 'X-Ratelimit-Limit', why: 'That is the quota per window, not the wait time.' },
              ],
            },
          ]}
        />
      </>
    ),
  },
];

export const Chapter4RateLimiter: React.FC<Chapter4RateLimiterProps> = () => <ChapterPlayer chapterId="rateLimiter" lessons={LESSONS} />;
