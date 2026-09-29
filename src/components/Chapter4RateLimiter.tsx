import React, { useState, useEffect, useRef, useCallback } from 'react';
import { RateLimiterAlgo } from '../types';
import { usePersistentState } from '../lib/usePersistentState';
import { LessonGoal, Takeaway, Quiz, Term, WhatChanged, QuizQuestion } from './learn/LearningKit';
import {
  Gauge,
  Zap,
  Database,
  Play,
  Pause,
  RefreshCw,
  Sliders,
  Flame,
  Activity,
  Laptop,
  Server,
  ShieldCheck,
  ShieldAlert,
  Network,
  Hourglass,
  SplitSquareHorizontal,
} from 'lucide-react';

interface Chapter4RateLimiterProps {
  /** Kept for API compatibility with App; theming uses Tailwind `dark:` bound to the app toggle. */
  isDarkMode?: boolean;
}

type Tab = 'concepts' | 'algorithms' | 'simulator' | 'production';
type LogStatus = 'ALLOWED' | 'REJECTED' | 'QUEUED';

interface SimLog {
  id: string;
  requestId: string;
  userId: string;
  timestamp: number;
  timeString: string;
  status: LogStatus;
  algorithm: RateLimiterAlgo;
  reason: string;
  headers: { limit: number; remaining: number; retryAfter?: number };
  /** Leaky bucket only: how long the request waited in the queue before being served. */
  waitedMs?: number;
}

interface QueuedReq {
  logId: string;
  requestId: string;
  enqueuedAt: number;
}

interface LogEntry {
  t: number;
  allowed: boolean;
}

/** The limiter's state. Lives in a ref so every request (bursts, stream, timers) sees the latest value. */
interface Engine {
  tokens: number;
  lastRefill: number;
  queue: QueuedReq[];
  lastLeak: number;
  leaked: number;
  windowStart: number;
  currCount: number; // fixed window counter, and "current window" for sliding counter
  prevCount: number; // sliding counter: requests counted in the previous window
  log: LogEntry[]; // sliding log: timestamps, including rejected ones (as in the book)
}

interface Config {
  algo: RateLimiterAlgo;
  capacity: number;
  rate: number;
  windowSec: number;
  userId: string;
}

interface Decision {
  status: LogStatus;
  reason: string;
  remaining: number;
  retryAfter?: number;
}

type Snapshot = Engine & { now: number };
type Stats = Record<RateLimiterAlgo, { allowed: number; rejected: number }>;

const LOG_MEMORY_CAP = 300;

const ALGOS: { id: RateLimiterAlgo; label: string; desc: string }[] = [
  { id: 'tokenBucket', label: 'Token Bucket', desc: 'Burst up to capacity, refill R/sec' },
  { id: 'leakyBucket', label: 'Leaky Bucket', desc: 'Queue, then fixed outflow' },
  { id: 'fixedWindow', label: 'Fixed Window', desc: 'One counter per window' },
  { id: 'slidingLog', label: 'Sliding Log', desc: 'Every timestamp kept' },
  { id: 'slidingCounter', label: 'Sliding Counter', desc: 'Two counters, weighted' },
];
const algoLabel = (id: RateLimiterAlgo) => ALGOS.find((a) => a.id === id)?.label ?? id;
const isWindowAlgo = (a: RateLimiterAlgo) => a === 'fixedWindow' || a === 'slidingLog' || a === 'slidingCounter';

const freshEngine = (now: number, capacity: number): Engine => ({
  tokens: capacity,
  lastRefill: now,
  queue: [],
  lastLeak: now,
  leaked: 0,
  windowStart: now,
  currCount: 0,
  prevCount: 0,
  log: [],
});

const emptyStats = (): Stats => ({
  tokenBucket: { allowed: 0, rejected: 0 },
  leakyBucket: { allowed: 0, rejected: 0 },
  fixedWindow: { allowed: 0, rejected: 0 },
  slidingLog: { allowed: 0, rejected: 0 },
  slidingCounter: { allowed: 0, rejected: 0 },
});

const secs = (ms: number) => Math.max(1, Math.ceil(ms / 1000));

/** Apply everything that happens with the passage of time: refill, leak, window rollover. Mutates `e`. */
function advance(e: Engine, cfg: Config, now: number): { req: QueuedReq; at: number }[] {
  // Token bucket: continuous refill, capped at capacity.
  e.tokens = Math.min(cfg.capacity, e.tokens + ((now - e.lastRefill) / 1000) * cfg.rate);
  e.lastRefill = now;

  // Leaky bucket: pull one request off the FIFO queue every 1/rate seconds.
  const interval = 1000 / cfg.rate;
  const served: { req: QueuedReq; at: number }[] = [];
  if (e.queue.length === 0) e.lastLeak = Math.max(e.lastLeak, now - interval); // idle processor is ready
  while (e.queue.length > 0 && now - e.lastLeak >= interval) {
    e.lastLeak += interval;
    const req = e.queue.shift()!;
    e.leaked += 1;
    served.push({ req, at: Math.max(e.lastLeak, req.enqueuedAt) });
  }
  if (e.queue.length === 0) e.lastLeak = Math.max(e.lastLeak, now - interval);

  // Window rollover (fixed window + sliding counter).
  const W = cfg.windowSec * 1000;
  if (now >= e.windowStart + W) {
    const k = Math.floor((now - e.windowStart) / W);
    e.prevCount = k === 1 ? e.currCount : 0; // skipped a whole window -> previous window had 0
    e.currCount = 0;
    e.windowStart += k * W;
  }
  return served;
}

/** Evaluate one request against the latest engine state. Mutates `e`. */
function decide(e: Engine, cfg: Config, now: number, ids: { logId: string; requestId: string }): Decision {
  const N = cfg.capacity;
  const W = cfg.windowSec * 1000;
  switch (cfg.algo) {
    case 'tokenBucket': {
      if (e.tokens >= 1) {
        e.tokens -= 1;
        return { status: 'ALLOWED', remaining: Math.floor(e.tokens), reason: `Took 1 token, ${Math.floor(e.tokens)} left` };
      }
      return {
        status: 'REJECTED',
        remaining: 0,
        retryAfter: secs(((1 - e.tokens) / cfg.rate) * 1000),
        reason: 'Bucket empty: no token to take',
      };
    }
    case 'leakyBucket': {
      const interval = 1000 / cfg.rate;
      if (e.queue.length < N) {
        e.queue.push({ ...ids, enqueuedAt: now });
        const pos = e.queue.length;
        const eta = Math.max(0, e.lastLeak + pos * interval - now) / 1000;
        return {
          status: 'QUEUED',
          remaining: N - pos,
          reason: `Queued at position ${pos}; served in ~${eta.toFixed(1)}s`,
        };
      }
      return {
        status: 'REJECTED',
        remaining: 0,
        retryAfter: secs(e.lastLeak + interval - now),
        reason: `Queue full (${N}/${N}): request dropped`,
      };
    }
    case 'fixedWindow': {
      if (e.currCount < N) {
        e.currCount += 1;
        return { status: 'ALLOWED', remaining: N - e.currCount, reason: `Counter ${e.currCount}/${N} in this window` };
      }
      return {
        status: 'REJECTED',
        remaining: 0,
        retryAfter: secs(e.windowStart + W - now),
        reason: `Counter at ${N}/${N}: blocked until the window resets`,
      };
    }
    case 'slidingLog': {
      // Book: remove outdated timestamps, add the new one, accept if log size <= limit.
      e.log = e.log.filter((x) => x.t > now - W);
      const entry = { t: now, allowed: false };
      e.log.push(entry);
      if (e.log.length > LOG_MEMORY_CAP) e.log.splice(0, e.log.length - LOG_MEMORY_CAP);
      const size = e.log.length;
      if (size <= N) {
        entry.allowed = true;
        return { status: 'ALLOWED', remaining: N - size, reason: `Log size ${size}/${N} after insert` };
      }
      // Next request passes once all but N-1 of the current entries have aged out.
      const blocker = e.log[size - N];
      return {
        status: 'REJECTED',
        remaining: 0,
        retryAfter: secs(blocker.t + W - now),
        reason: `Log size ${size}/${N}: rejected, but its timestamp stays in the log`,
      };
    }
    case 'slidingCounter': {
      const overlap = 1 - Math.min(1, (now - e.windowStart) / W);
      const est = e.currCount + e.prevCount * overlap;
      const shown = `${e.currCount} + ${e.prevCount} × ${overlap.toFixed(2)} = ${est.toFixed(2)}`;
      if (Math.floor(est) < N) {
        e.currCount += 1;
        const after = e.currCount + e.prevCount * overlap;
        return { status: 'ALLOWED', remaining: Math.max(0, Math.ceil(N - after)), reason: `${shown} → ${Math.floor(est)} < ${N}` };
      }
      let allowAt: number;
      if (e.currCount >= N) {
        // Must wait for the next window, then for this window's count to fade: curr × (1 - p) < N.
        allowAt = e.windowStart + W + W * Math.max(0, 1 - N / e.currCount);
      } else {
        // Previous window's weight must fade: curr + prev × (1 - p) < N.
        allowAt = e.windowStart + W * (1 - (N - e.currCount) / e.prevCount);
      }
      return { status: 'REJECTED', remaining: 0, retryAfter: secs(allowAt - now), reason: `${shown} → ${Math.floor(est)} ≥ ${N}` };
    }
  }
}

// ---------- Shared styling ----------
const panel = 'rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-[#1c1c1e]';
const inset = 'rounded-xl border border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-950';
const heading = 'text-slate-900 dark:text-white';
const body = 'text-slate-600 dark:text-slate-300';
const muted = 'text-slate-500 dark:text-slate-400';

// ---------- Per-algorithm lesson content for the simulator ----------
const SIM_LESSONS: Record<RateLimiterAlgo, { goal: string; why: string; takeaway: string; quiz: QuizQuestion[] }> = {
  tokenBucket: {
    goal: 'How a bucket of tokens lets a short burst through, then throttles traffic down to the refill rate.',
    why: 'Try it: capacity 10, refill 1/sec, then press "Fire burst" three times quickly. The first two bursts drain the stored tokens; the third mostly gets 429 because tokens come back only one per second.',
    takeaway:
      'Capacity decides how big a burst you tolerate; refill rate decides the long-run average. Amazon and Stripe throttle their APIs with token buckets because short bursts are normal client behaviour.',
    quiz: [
      {
        question: 'Capacity 4, refill 2 tokens/sec, bucket full. A client sends 6 requests at the same instant. What happens?',
        options: [
          { text: '4 pass, 2 get HTTP 429', correct: true, why: 'Only 4 tokens exist at that instant. Refill adds tokens over the next second, too late for requests that arrive now.' },
          { text: 'All 6 pass, because 2 more tokens are refilled every second', why: 'Refill happens over time. At the instant the 6 requests arrive, there are only 4 tokens to take.' },
          { text: '2 pass, 4 are rejected, because only the refill rate is allowed per second', why: 'That would be a strict per-second counter. A token bucket lets stored tokens be spent as a burst, up to its capacity.' },
          { text: 'All 6 are queued and served at 2 per second', why: 'Queueing and serving at a fixed rate is the leaky bucket. A token bucket drops requests when it has no token.' },
        ],
      },
    ],
  },
  leakyBucket: {
    goal: 'How a leaky bucket turns a burst into a steady outflow by queueing requests, not by rejecting them early.',
    why: 'Set the outflow rate to 1/sec and fire a burst. Requests show as QUEUED, then turn 200 one by one, each waiting longer than the last. Only when the queue is full does a request get 429.',
    takeaway:
      'The leaky bucket guarantees a stable processing rate (Shopify uses it), and pays for that with latency: a burst waits in the queue, and if old requests fill it, recent requests are dropped.',
    quiz: [
      {
        question: 'Queue size 5, outflow 1 request/sec, queue empty. 8 requests arrive at once. What do clients see?',
        options: [
          { text: '5 are queued and served about one per second; 3 get 429', correct: true, why: 'The queue holds 5; the processor drains it at the fixed outflow rate, so the 5th waits about 4 seconds. The 3 that find the queue full are dropped.' },
          { text: '5 are served immediately and 3 are rejected', why: 'A queue does not speed anything up. Queued requests are delayed until the processor pulls them at the outflow rate.' },
          { text: 'All 8 are queued and eventually served', why: 'The queue size is the bucket size. Once it holds 5, further arrivals are dropped.' },
          { text: 'All 8 pass because the bucket was empty', why: 'An empty leaky bucket means the queue is empty, not that it has credit to spend. Output is capped at the outflow rate regardless.' },
        ],
      },
    ],
  },
  fixedWindow: {
    goal: "The fixed window counter's weakness: a burst on both sides of a window edge lets through up to twice the limit.",
    why: 'Press "Edge burst demo". It moves the clock close to a window edge, sends a full limit just before the reset and another full limit just after it.',
    takeaway:
      'A fixed window is cheap (one counter per key) and easy to understand, but it only enforces the limit per calendar window, not over every rolling window of the same length.',
    quiz: [
      {
        question: 'Limit 5 requests per minute; windows reset on the minute. 5 requests arrive at 2:00:45 and 5 at 2:01:10. How many requests fall inside the one-minute span 2:00:30 to 2:01:30?',
        options: [
          { text: '10, twice the limit', correct: true, why: 'Each batch is within its own window, so all 10 pass. A rolling window that straddles the reset contains both batches. This is the book\'s edge case.' },
          { text: '5, because the limiter never lets more than 5 through per minute', why: 'It never lets more than 5 through per calendar minute. Any other one-minute span can contain up to twice that.' },
          { text: '6, because the counter carries one request into the next window', why: 'The fixed window counter resets to zero; nothing carries over. That is exactly why the edge burst gets through.' },
          { text: '0, because the second batch is rejected', why: 'The second batch lands in a fresh window whose counter starts at 0, so it is allowed.' },
        ],
      },
    ],
  },
  slidingLog: {
    goal: 'How keeping every request timestamp makes the limit exact over any rolling window, and why that costs memory.',
    why: 'Run the "Edge burst demo" here: the second batch is rejected. Then watch "stored in memory": following the book, even rejected requests leave their timestamp in the log.',
    takeaway:
      'The sliding log is exact, but memory grows with traffic, not with the limit. And because rejected timestamps stay in the log, a client that keeps retrying keeps itself blocked.',
    quiz: [
      {
        question: 'Limit 2 per minute. Requests at 1:00:01 and 1:00:30 were allowed; one at 1:00:50 was rejected. A request arrives at 1:01:40. Is it accepted?',
        options: [
          { text: 'Yes: 1:00:01 and 1:00:30 are outdated and removed, leaving 1:00:50 plus the new one, 2 in total', correct: true, why: 'The window is [1:00:40, 1:01:40). Two outdated timestamps are removed, the log size after insertion is 2, which is not above the limit.' },
          { text: 'No: the log holds 1:00:30, 1:00:50 and the new one, 3 in total', why: '1:00:30 is older than the window start 1:00:40, so it is removed before counting.' },
          { text: 'Yes, because rejected requests are never stored in the log', why: 'In the book\'s version they are stored: 1:00:50 is still in the log. The request passes only because two older entries expired.' },
          { text: 'No: a client that was rejected must wait a full minute from its rejection', why: 'There is no penalty timer. The decision is just "how many timestamps are in the last minute".' },
        ],
      },
      {
        question: 'Why does the sliding log use more memory than the other algorithms?',
        options: [
          { text: 'It keeps one timestamp per request (even rejected ones) instead of one or two counters', correct: true, why: 'Memory is proportional to the number of requests in the window, and rejected requests add entries too.' },
          { text: 'It stores the full body of every request', why: 'Only timestamps are stored, often in a Redis sorted set. Even so, one entry per request adds up.' },
          { text: 'It keeps a separate counter for every second of the window', why: 'That describes a bucketed approximation. The log keeps raw timestamps.' },
          { text: 'It never deletes anything', why: 'Outdated timestamps are removed whenever a new request arrives. The cost is how many remain in the window.' },
        ],
      },
    ],
  },
  slidingCounter: {
    goal: 'How the sliding window counter estimates a rolling window from just two counters.',
    why: "Watch the formula as time moves. The previous window's count is weighted by how much of the rolling window still overlaps it, so its influence fades as the current window progresses. Try the edge burst demo and compare with Fixed Window.",
    takeaway:
      'Two counters give a close estimate of a rolling window. Cloudflare measured only 0.003% wrong decisions over 400 million requests. The price: it assumes the previous window\'s requests were evenly spread.',
    quiz: [
      {
        question: 'Limit 7 per minute. The previous minute had 5 requests, the current one 3. A request arrives 30% into the current minute. What does the formula give?',
        options: [
          { text: '3 + 5 × 0.7 = 6.5, rounded down to 6, so it is allowed', correct: true, why: 'The rolling window still overlaps 70% of the previous minute. 6 is below 7, so it passes; the next request would hit the limit.' },
          { text: '3 + 5 × 0.3 = 4.5, so it is allowed', why: '0.3 is how far we are into the current window. The weight for the previous window is the overlap, 1 − 0.3 = 0.7.' },
          { text: '3 + 5 = 8, so it is rejected', why: 'That counts the whole previous minute as if it were inside the rolling window. Only 70% of it overlaps.' },
          { text: '3, so it is allowed; the previous window no longer matters', why: 'Ignoring the previous window is the fixed window counter, which is exactly what this algorithm improves on.' },
        ],
      },
    ],
  },
};

// ---------- Placement diagram ----------
const PlacementDiagram: React.FC = () => (
  <svg
    viewBox="0 0 660 230"
    role="img"
    aria-label="Request path: a client sends three requests to the rate limiter middleware, which reads and increments a counter in Redis, forwards requests 1 and 2 to the API servers and returns HTTP 429 for request 3."
    className="w-full h-auto text-slate-700 dark:text-slate-200"
  >
    <defs>
      <marker id="rl-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
        <path d="M0,0 L10,5 L0,10 z" fill="currentColor" />
      </marker>
    </defs>
    <g fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="10" y="40" width="120" height="60" rx="10" />
      <rect x="260" y="40" width="150" height="60" rx="10" />
      <rect x="530" y="40" width="120" height="60" rx="10" />
      <rect x="275" y="165" width="120" height="50" rx="10" strokeDasharray="4 3" />
    </g>
    <g fill="currentColor" fontSize="13" textAnchor="middle" fontWeight="600">
      <text x="70" y="75">Client</text>
      <text x="335" y="68">Rate limiter</text>
      <text x="335" y="86">middleware</text>
      <text x="590" y="75">API servers</text>
      <text x="335" y="195">Redis counter</text>
    </g>
    <g stroke="currentColor" strokeWidth="1.5" markerEnd="url(#rl-arrow)">
      <line x1="130" y1="58" x2="258" y2="58" />
      <line x1="410" y1="70" x2="528" y2="70" className="text-emerald-600 dark:text-emerald-400" stroke="currentColor" />
      <line x1="258" y1="88" x2="132" y2="88" className="text-rose-600 dark:text-rose-400" stroke="currentColor" />
      <line x1="320" y1="102" x2="320" y2="163" />
      <line x1="350" y1="102" x2="350" y2="163" />
    </g>
    <g fontSize="12" textAnchor="middle" fill="currentColor">
      <text x="194" y="50">req 1, 2, 3</text>
      <text x="469" y="60" className="text-emerald-700 dark:text-emerald-300" fill="currentColor">forwards 1, 2</text>
      <text x="194" y="108" className="text-rose-700 dark:text-rose-300" fill="currentColor">429 for req 3</text>
      <text x="262" y="138" textAnchor="end">read counter</text>
      <text x="358" y="138" textAnchor="start">INCR</text>
      <text x="590" y="122">never sees req 3</text>
    </g>
  </svg>
);

export const Chapter4RateLimiter: React.FC<Chapter4RateLimiterProps> = () => {
  const [activeTab, setActiveTab] = usePersistentState<Tab>('rateLimiter:tab', 'concepts');
  const [selectedAlgo, setSelectedAlgo] = usePersistentState<RateLimiterAlgo>('rateLimiter:algo', 'tokenBucket');

  // --- Learner settings (persisted) ---
  const [bucketCapacity, setBucketCapacity] = usePersistentState<number>('rateLimiter:capacity', 10);
  const [rate, setRate] = usePersistentState<number>('rateLimiter:rate', 2); // refill rate or leak rate, per second
  const [windowSeconds, setWindowSeconds] = usePersistentState<number>('rateLimiter:window', 10);
  const [streamRate, setStreamRate] = usePersistentState<number>('rateLimiter:streamRate', 1);

  // --- Transient simulation state ---
  const [customUserId, setCustomUserId] = useState<string>('User_Alpha');
  const [requestLogs, setRequestLogs] = useState<SimLog[]>([]);
  const [isAutoStreamActive, setIsAutoStreamActive] = useState<boolean>(false);
  const [stats, setStats] = useState<Stats>(emptyStats);
  const [switchNotice, setSwitchNotice] = useState<string | null>(null);
  const [demoResult, setDemoResult] = useState<string | null>(null);

  // Source of truth for limiter state + latest config. Rendering reads the `snap` mirror.
  const engRef = useRef<Engine>(freshEngine(Date.now(), bucketCapacity));
  const cfgRef = useRef<Config>({ algo: selectedAlgo, capacity: bucketCapacity, rate, windowSec: windowSeconds, userId: customUserId });
  cfgRef.current = { algo: selectedAlgo, capacity: bucketCapacity, rate, windowSec: windowSeconds, userId: customUserId };
  const timersRef = useRef<number[]>([]);
  const [snap, setSnap] = useState<Snapshot>(() => ({ ...engRef.current, now: Date.now() }));

  const publish = useCallback(() => {
    const e = engRef.current;
    setSnap({ ...e, queue: e.queue.slice(), log: e.log.slice(), now: Date.now() });
  }, []);

  const completeServed = useCallback((served: { req: QueuedReq; at: number }[]) => {
    if (served.length === 0) return;
    const byId = new Map(served.map((s) => [s.req.logId, s]));
    setRequestLogs((prev) =>
      prev.map((l) => {
        const s = byId.get(l.id);
        return s ? { ...l, status: 'ALLOWED', waitedMs: s.at - s.req.enqueuedAt, reason: `Served after waiting in queue` } : l;
      }),
    );
    setStats((prev) => ({ ...prev, leakyBucket: { ...prev.leakyBucket, allowed: prev.leakyBucket.allowed + served.length } }));
  }, []);

  /** Bring the engine up to "now" (refill, leak, rollover) using the current config. */
  const settle = useCallback(() => {
    completeServed(advance(engRef.current, cfgRef.current, Date.now()));
  }, [completeServed]);

  const dispatchRequest = useCallback((): LogStatus => {
    const cfg = cfgRef.current;
    const e = engRef.current;
    const now = Date.now();
    completeServed(advance(e, cfg, now));

    const requestId = `REQ-${Math.floor(Math.random() * 90000 + 10000)}`;
    const logId = `${requestId}_${now}_${Math.random().toString(36).slice(2, 6)}`;
    const d = decide(e, cfg, now, { logId, requestId });

    const entry: SimLog = {
      id: logId,
      requestId,
      userId: cfg.userId || 'anonymous',
      timestamp: now,
      timeString: new Date(now).toLocaleTimeString(),
      status: d.status,
      algorithm: cfg.algo,
      reason: d.reason,
      headers: { limit: cfg.capacity, remaining: Math.max(0, d.remaining), retryAfter: d.retryAfter },
    };
    setRequestLogs((prev) => [entry, ...prev].slice(0, 30));
    if (d.status !== 'QUEUED') {
      setStats((prev) => ({
        ...prev,
        [cfg.algo]: {
          allowed: prev[cfg.algo].allowed + (d.status === 'ALLOWED' ? 1 : 0),
          rejected: prev[cfg.algo].rejected + (d.status === 'REJECTED' ? 1 : 0),
        },
      }));
    }
    publish();
    return d.status;
  }, [completeServed, publish]);

  const schedule = (fn: () => void, ms: number) => {
    timersRef.current.push(window.setTimeout(fn, ms));
  };
  const clearScheduled = () => {
    timersRef.current.forEach((t) => clearTimeout(t));
    timersRef.current = [];
  };

  // Clock: refill / leak / rollover animate even with no traffic.
  useEffect(() => {
    if (activeTab !== 'simulator') return;
    const t = setInterval(() => {
      settle();
      publish();
    }, 150);
    return () => clearInterval(t);
  }, [activeTab, settle, publish]);

  // Auto stream uses the same dispatch path as manual requests.
  useEffect(() => {
    if (!isAutoStreamActive) return;
    const t = setInterval(() => dispatchRequest(), 1000 / streamRate);
    return () => clearInterval(t);
  }, [isAutoStreamActive, streamRate, dispatchRequest]);

  useEffect(() => () => clearScheduled(), []);

  const handleFireBurst = () => {
    for (let i = 0; i < 5; i++) schedule(() => dispatchRequest(), i * 120);
  };

  const resetEngine = () => {
    clearScheduled();
    engRef.current = freshEngine(Date.now(), cfgRef.current.capacity);
    setRequestLogs([]);
    setDemoResult(null);
    publish();
  };

  const handleResetSimulator = () => {
    resetEngine();
    setStats(emptyStats());
    setSwitchNotice(null);
  };

  const handleSelectAlgo = (id: RateLimiterAlgo) => {
    if (id === selectedAlgo) return;
    setSelectedAlgo(id);
    cfgRef.current = { ...cfgRef.current, algo: id };
    resetEngine();
    setSwitchNotice(
      `Switched to ${algoLabel(id)}: the limiter started fresh (full bucket, empty queue/log, new window) and the traffic log was cleared. Allowed/rejected totals are kept per algorithm below so you can compare.`,
    );
  };

  /** Fixed-window edge problem: a full limit just before a window edge and another just after. */
  const runEdgeBurstDemo = () => {
    const N = cfgRef.current.capacity;
    const W = cfgRef.current.windowSec * 1000;
    const algo = cfgRef.current.algo;
    const gap = 30;
    const lead = N * gap + 300; // the window edge falls this many ms from now
    resetEngine();
    const start = Date.now();
    engRef.current.windowStart = start + lead - W; // we are near the end of the current window
    publish();
    let allowed = 0;
    for (let i = 0; i < N; i++) schedule(() => { if (dispatchRequest() === 'ALLOWED') allowed++; }, i * gap);
    for (let i = 0; i < N; i++) schedule(() => { if (dispatchRequest() === 'ALLOWED') allowed++; }, lead + 150 + i * gap);
    schedule(() => {
      const span = ((Date.now() - start) / 1000).toFixed(1);
      const verdict =
        algo === 'fixedWindow'
          ? 'Both batches fit in their own window, so the rolling span around the edge saw twice the limit.'
          : algo === 'slidingLog'
          ? 'The log still holds the first batch, so the second batch is rejected: the rolling window never exceeds the limit.'
          : "Right after the edge the previous window's count is weighted ~100%, so almost all of the second batch is rejected.";
      setDemoResult(`${allowed} of ${2 * N} requests allowed within ${span}s, while the limit is ${N} per ${W / 1000}s. ${verdict}`);
    }, lead + 150 + N * gap + 200);
  };

  // ---------- Derived view values ----------
  const now = snap.now;
  const W = windowSeconds * 1000;
  const windowElapsed = Math.min(1, Math.max(0, (now - snap.windowStart) / W));
  const windowLeftSec = Math.max(0, (snap.windowStart + W - now) / 1000);
  const validLog = snap.log.filter((x) => x.t > now - W);
  const overlap = 1 - windowElapsed;
  const estimate = snap.currCount + snap.prevCount * overlap;
  const tokensWhole = Math.floor(snap.tokens);
  const nextTokenSec = snap.tokens >= bucketCapacity ? 0 : (1 - (snap.tokens - tokensWhole)) / rate;
  const leakInterval = 1000 / rate;
  const nextLeakSec = snap.queue.length ? Math.max(0, (snap.lastLeak + leakInterval - now) / 1000) : 0;
  const latestLog = requestLogs[0];
  const lesson = SIM_LESSONS[selectedAlgo];

  const tabs: { id: Tab; label: string }[] = [
    { id: 'concepts', label: '1. Where it lives' },
    { id: 'algorithms', label: '2. Five algorithms' },
    { id: 'simulator', label: '3. Simulator' },
    { id: 'production', label: '4. Production concerns' },
  ];

  const statusBadge = (s: LogStatus) =>
    s === 'ALLOWED' ? 'bg-emerald-600 text-white' : s === 'QUEUED' ? 'bg-amber-500 text-slate-900' : 'bg-rose-600 text-white';

  return (
    <div className="space-y-8 max-w-6xl mx-auto">
      {/* Chapter 4 Header Banner */}
      <div className={`${panel} p-6 space-y-3`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-gradient-to-tr from-amber-500 to-orange-600 rounded-xl shadow-md text-white">
              <Gauge className="w-6 h-6" />
            </div>
            <div>
              <span className="px-2.5 py-0.5 bg-amber-500/10 text-amber-700 dark:text-amber-400 font-mono text-xs rounded-full border border-amber-500/20 font-bold">
                Chapter 4
              </span>
              <h2 className={`text-2xl font-bold tracking-tight ${heading}`}>Design a Rate Limiter</h2>
            </div>
          </div>

          <div className="flex flex-wrap gap-1 p-1 rounded-xl border text-xs bg-slate-100 border-slate-200 dark:bg-slate-950 dark:border-slate-800">
            {tabs.map((t) => (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                className={`px-3.5 py-1.5 rounded-lg font-semibold transition-all ${
                  activeTab === t.id
                    ? 'bg-amber-600 text-white shadow-md'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <p className={`text-sm max-w-4xl leading-relaxed ${body}`}>
          A rate limiter controls how much traffic a client or service may send. For an HTTP API it caps the number of requests a
          client can make in a time period; extra requests are blocked and get{' '}
          <Term term="HTTP 429">"Too Many Requests": the status code a rate limiter returns when a client exceeds its limit.</Term>.
          It prevents resource starvation from abusive or runaway clients, reduces cost, and protects servers from overload.
        </p>
      </div>

      {/* VIEW 1: WHERE IT LIVES */}
      {activeTab === 'concepts' && (
        <div className="space-y-6">
          <LessonGoal
            goal="Where a rate limiter can run (client, server, middleware, API gateway) and how to choose."
            why="Before picking an algorithm you have to decide where requests get counted. That choice decides who can bypass it and how much control you have."
          />

          <div className={`${panel} p-6 space-y-5`}>
            <div className="space-y-1">
              <h3 className={`text-lg font-bold ${heading}`}>The request path</h3>
              <p className={`text-sm leading-relaxed ${body}`}>
                The book's example: the API allows 2 requests per second and a client sends 3 in one second. The{' '}
                <Term term="middleware">A component that sits in front of the API servers and handles every request before they do.</Term>{' '}
                keeps a counter per client in an in-memory store, forwards the first two, and answers the third with 429 itself, so the API
                servers never spend work on it.
              </p>
            </div>
            <div className={`${inset} p-4`}>
              <PlacementDiagram />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                {
                  title: 'Client-side',
                  tone: 'text-rose-600 dark:text-rose-400',
                  text: 'Inside the web/mobile app. Unreliable: requests are easy to forge, and you often do not control the client code.',
                },
                {
                  title: 'Server-side',
                  tone: 'text-blue-600 dark:text-blue-400',
                  text: 'Inside the API servers. You have full control over the algorithm, but your language and cache must make it efficient.',
                },
                {
                  title: 'Middleware',
                  tone: 'text-amber-700 dark:text-amber-400',
                  text: 'A separate layer in front of the API servers that throttles before requests reach them (the diagram above).',
                },
                {
                  title: 'API gateway',
                  tone: 'text-emerald-600 dark:text-emerald-400',
                  text: 'A managed middleware that also does auth, SSL termination and IP whitelisting. Quick to adopt, but your algorithm choice may be limited.',
                },
              ].map((c) => (
                <div key={c.title} className={`${inset} p-4 space-y-2`}>
                  <span className={`text-sm font-bold ${c.tone}`}>{c.title}</span>
                  <p className={`text-sm leading-relaxed ${body}`}>{c.text}</p>
                </div>
              ))}
            </div>

            <div className="space-y-2">
              <h4 className={`text-sm font-bold ${heading}`}>How to choose (there is no single right answer)</h4>
              <ul className={`text-sm leading-relaxed list-disc pl-5 space-y-1 ${body}`}>
                <li>Check your stack: can your language and cache implement it efficiently on the server?</li>
                <li>Need a specific algorithm? Building it yourself gives full control; a third-party gateway may not offer it.</li>
                <li>Already running microservices with an API gateway for auth or IP whitelisting? Add the limiter there.</li>
                <li>Short on engineering time? A commercial API gateway beats building your own service.</li>
              </ul>
            </div>

            <div className="space-y-2">
              <h4 className={`text-sm font-bold ${heading}`}>Requirements agreed in the book's interview</h4>
              <ul className={`text-sm leading-relaxed list-disc pl-5 space-y-1 ${body}`}>
                <li>Limit excessive requests accurately, with low added latency and little memory.</li>
                <li>Distributed: one limit shared across many servers or processes.</li>
                <li>Tell throttled users clearly (status code and headers).</li>
                <li>Fault tolerant: if the limiter's cache fails, the whole system must not go down.</li>
              </ul>
            </div>
          </div>

          <Takeaway>
            Enforce limits somewhere the client cannot bypass: on the server, in a middleware, or in an API gateway. Choose by stack,
            algorithm needs, existing infrastructure and team capacity.
          </Takeaway>

          <Quiz
            persistKey="rateLimiter:quiz:placement"
            questions={[
              {
                question: 'Why is a client-side rate limiter not enough to protect your API?',
                options: [
                  { text: 'A malicious actor can forge requests that skip the client code entirely', correct: true, why: 'Anything running on the client is under the client\'s control. Limits must be enforced where the attacker cannot reach.' },
                  { text: 'Clients do not have a clock precise enough to count requests', why: 'Clocks are fine. The problem is trust: the client can simply not run the limiter.' },
                  { text: 'Client-side limiting always costs more server CPU', why: 'It costs the server nothing, which is why it is tempting. It is just not enforceable.' },
                  { text: 'Browsers block HTTP 429 responses', why: 'Browsers handle 429 like any other status. The issue is bypassability, not the status code.' },
                ],
              },
              {
                question: 'Your company already runs an API gateway for authentication and IP whitelisting, and the team is small. Where should the rate limiter go?',
                options: [
                  { text: 'In the API gateway', correct: true, why: 'The book suggests adding it to an existing gateway, especially when engineering resources are limited.' },
                  { text: 'In each API server, written from scratch', why: 'Possible and gives full control, but it costs engineering time the small team does not have.' },
                  { text: 'In the mobile and web clients', why: 'Client-side limits can be bypassed by forged requests.' },
                  { text: 'In the database, as a trigger that counts rows', why: 'Disk-backed databases are too slow for per-request counting; the book uses an in-memory cache.' },
                ],
              },
            ]}
          />
        </div>
      )}

      {/* VIEW 2: 5 ALGORITHMS */}
      {activeTab === 'algorithms' && (
        <div className="space-y-6">
          <LessonGoal
            goal="How the five classic algorithms decide allow-or-reject, and the trade-off each one makes."
            why="Every algorithm balances burst tolerance, accuracy and memory differently. Knowing the trade-offs lets you pick one for a use case, then try it in the simulator."
          />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {[
              {
                n: '01',
                title: 'Token bucket',
                tone: 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
                how: 'A bucket holds up to a set number of tokens and a refiller adds tokens at a fixed rate; overflow is discarded. Each request takes one token. No token, no entry. Parameters: bucket size and refill rate.',
                pros: ['Easy to implement', 'Memory efficient', 'Allows short bursts as long as tokens remain'],
                cons: ['Two parameters (size, refill rate) that can be hard to tune'],
              },
              {
                n: '02',
                title: 'Leaking bucket',
                tone: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
                how: 'Requests join a FIFO queue if it is not full, otherwise they are dropped. A processor pulls requests off the queue at a fixed outflow rate. Parameters: bucket (queue) size and outflow rate.',
                pros: ['Memory efficient, the queue is bounded', 'Fixed processing rate, good when a stable outflow is required'],
                cons: ['A burst fills the queue with old requests; if they are not processed in time, recent requests are dropped', 'Two parameters that can be hard to tune'],
              },
              {
                n: '03',
                title: 'Fixed window counter',
                tone: 'bg-purple-500/10 text-purple-600 dark:text-purple-400',
                how: 'The timeline is split into fixed windows, each with a counter. Each request adds one; once the counter hits the threshold, requests are dropped until the next window starts.',
                pros: ['Memory efficient', 'Easy to understand', 'Resetting quota at the end of a window fits some use cases'],
                cons: ['A spike at the edges of a window can let through more than the quota, up to twice the limit'],
              },
              {
                n: '04',
                title: 'Sliding window log',
                tone: 'bg-cyan-500/10 text-cyan-700 dark:text-cyan-400',
                how: 'Keeps each request\'s timestamp (e.g. in a Redis sorted set). On a new request, remove timestamps older than the window start, add the new one, and accept if the log size is at or below the limit.',
                pros: ['Very accurate: no rolling window ever exceeds the limit'],
                cons: ['Uses a lot of memory: even a rejected request\'s timestamp may stay stored'],
              },
              {
                n: '05',
                title: 'Sliding window counter',
                tone: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400',
                how: 'A hybrid of fixed window and log. Estimated count = requests in the current window + requests in the previous window × the overlap of the rolling window with the previous window. Example: 3 + 5 × 0.7 = 6.5, rounded down to 6.',
                pros: ['Smooths spikes, because the rate is based on the previous window\'s average', 'Memory efficient: two counters'],
                cons: ['An approximation for a not-so-strict look-back window: it assumes the previous window\'s requests were evenly spread (Cloudflare saw 0.003% wrong decisions)'],
              },
            ].map((a) => (
              <div key={a.n} className={`${panel} p-5 space-y-3`}>
                <div className="flex items-center space-x-2">
                  <span className={`p-2 rounded-lg font-bold font-mono text-xs ${a.tone}`}>{a.n}</span>
                  <h3 className={`font-bold text-base ${heading}`}>{a.title}</h3>
                </div>
                <p className={`text-sm leading-relaxed ${body}`}>{a.how}</p>
                <div className="space-y-1 text-sm">
                  {a.pros.map((p) => (
                    <div key={p} className="text-emerald-700 dark:text-emerald-400">✓ {p}</div>
                  ))}
                  {a.cons.map((c) => (
                    <div key={c} className="text-rose-700 dark:text-rose-400">✕ {c}</div>
                  ))}
                </div>
              </div>
            ))}

            <div className={`${panel} p-5 space-y-3`}>
              <h3 className={`font-bold text-base ${heading}`}>At a glance</h3>
              <table className="w-full text-sm">
                <thead>
                  <tr className={`text-left ${muted}`}>
                    <th className="py-1 font-semibold">Algorithm</th>
                    <th className="py-1 font-semibold">State per key</th>
                    <th className="py-1 font-semibold">Bursts</th>
                  </tr>
                </thead>
                <tbody className={body}>
                  <tr><td className="py-1">Token bucket</td><td>tokens + last refill</td><td>allowed up to size</td></tr>
                  <tr><td className="py-1">Leaking bucket</td><td>bounded queue</td><td>queued, then smoothed</td></tr>
                  <tr><td className="py-1">Fixed window</td><td>1 counter</td><td>up to 2× at edges</td></tr>
                  <tr><td className="py-1">Sliding log</td><td>1 timestamp / request</td><td>never above limit</td></tr>
                  <tr><td className="py-1">Sliding counter</td><td>2 counters</td><td>approximately limited</td></tr>
                </tbody>
              </table>
              <button
                onClick={() => setActiveTab('simulator')}
                className="mt-2 px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-sm font-semibold"
              >
                Try them in the simulator →
              </button>
            </div>
          </div>

          <Takeaway>
            No algorithm wins everywhere. Token bucket suits bursty APIs, leaking bucket suits a stable outflow, fixed window is the cheapest,
            sliding log is exact but memory hungry, and sliding counter is a cheap, close approximation of the log.
          </Takeaway>

          <Quiz
            persistKey="rateLimiter:quiz:algorithms"
            questions={[
              {
                question: 'A flash sale will cause sudden short bursts of legitimate traffic. Which algorithm does the book suggest fits best?',
                options: [
                  { text: 'Token bucket', correct: true, why: 'Stored tokens let a burst through while the refill rate still caps the average. The book names it for flash sales.' },
                  { text: 'Leaking bucket', why: 'It would queue the burst and serve it at a fixed rate, adding delay and dropping requests once the queue fills.' },
                  { text: 'Fixed window counter', why: 'It lets bursts through only by accident of window timing, and the quota resets on a schedule rather than tracking bursts.' },
                  { text: 'Sliding window log', why: 'It is precise but memory hungry, and it has no notion of saved-up burst capacity.' },
                ],
              },
              {
                question: 'A downstream payment processor can only handle a fixed number of calls per second. Which algorithm fits?',
                options: [
                  { text: 'Leaking bucket', correct: true, why: 'It processes requests at a fixed outflow rate, which is exactly what a rate-sensitive downstream needs.' },
                  { text: 'Token bucket', why: 'A full bucket lets a burst through at once, which could exceed what the processor can handle.' },
                  { text: 'Fixed window counter', why: 'Requests can arrive all at once inside a window, and up to twice the limit at an edge.' },
                  { text: 'Sliding window counter', why: 'It limits the count per rolling window, but still lets that count arrive in a burst.' },
                ],
              },
            ]}
          />
        </div>
      )}

      {/* VIEW 3: INTERACTIVE SIMULATOR */}
      {activeTab === 'simulator' && (
        <div className="space-y-6">
          <LessonGoal goal={lesson.goal} why={lesson.why} />

          {/* Client -> Rate Limiter Middleware -> Application Server */}
          <div className={`${panel} p-4 space-y-3`}>
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 border-b pb-2.5 border-slate-200 dark:border-slate-800">
              <div className="flex items-center space-x-2">
                <Network className="w-4 h-4 text-amber-500" />
                <h3 className={`font-bold text-sm ${heading}`}>Request path: Client → Rate limiter middleware → API server</h3>
              </div>
              <span
                className={`text-xs font-mono font-bold ${
                  !latestLog
                    ? muted
                    : latestLog.status === 'ALLOWED'
                    ? 'text-emerald-700 dark:text-emerald-400'
                    : latestLog.status === 'QUEUED'
                    ? 'text-amber-700 dark:text-amber-400'
                    : 'text-rose-700 dark:text-rose-400'
                }`}
              >
                Latest:{' '}
                {!latestLog
                  ? 'awaiting traffic'
                  : latestLog.status === 'ALLOWED'
                  ? 'HTTP 200 (forwarded)'
                  : latestLog.status === 'QUEUED'
                  ? 'queued, response delayed'
                  : 'HTTP 429 Too Many Requests'}
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-stretch">
              <div className={`${inset} p-3.5 flex flex-col items-center text-center justify-between space-y-2`}>
                <div className="p-2.5 bg-blue-500/10 text-blue-500 rounded-2xl border border-blue-500/20">
                  <Laptop className="w-5 h-5" />
                </div>
                <div>
                  <h4 className={`font-bold text-sm ${heading}`}>Client</h4>
                  <p className={`text-xs font-mono mt-0.5 ${muted}`}>key: {customUserId || 'anonymous'}</p>
                </div>
                <div className="px-2 py-1 bg-blue-500/10 border border-blue-500/20 text-blue-700 dark:text-blue-400 rounded-lg text-xs font-mono font-bold">
                  GET /api/v1/resource
                </div>
              </div>

              <div
                className={`p-3.5 rounded-xl border flex flex-col items-center text-center justify-between space-y-2 transition-all ${
                  latestLog?.status === 'ALLOWED'
                    ? 'bg-emerald-500/10 border-emerald-500/40'
                    : latestLog?.status === 'REJECTED'
                    ? 'bg-rose-500/10 border-rose-500/40'
                    : latestLog?.status === 'QUEUED'
                    ? 'bg-amber-500/10 border-amber-500/40'
                    : 'bg-slate-50 border-slate-200 dark:bg-slate-950 dark:border-slate-800'
                }`}
              >
                <div className="p-2.5 rounded-2xl border bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20">
                  {latestLog?.status === 'REJECTED' ? <ShieldAlert className="w-5 h-5" /> : <ShieldCheck className="w-5 h-5" />}
                </div>
                <div>
                  <h4 className={`font-bold text-sm ${heading}`}>Rate limiter middleware</h4>
                  <p className={`text-xs font-mono mt-0.5 ${muted}`}>
                    {algoLabel(selectedAlgo)} · limit {bucketCapacity}
                  </p>
                </div>
                {latestLog ? (
                  <span className={`px-2.5 py-1 rounded-lg text-xs font-mono font-bold ${statusBadge(latestLog.status)}`}>
                    {latestLog.status === 'ALLOWED' ? '200 allowed' : latestLog.status === 'QUEUED' ? 'queued' : '429 rejected'}
                  </span>
                ) : (
                  <span className={`text-xs italic ${muted}`}>Ready to evaluate</span>
                )}
              </div>

              <div className={`${inset} p-3.5 flex flex-col items-center text-center justify-between space-y-2`}>
                <div className="p-2.5 bg-indigo-500/10 text-indigo-500 rounded-2xl border border-indigo-500/20">
                  <Server className="w-5 h-5" />
                </div>
                <div>
                  <h4 className={`font-bold text-sm ${heading}`}>API server</h4>
                  <p className={`text-xs mt-0.5 ${muted}`}>Business logic and database</p>
                </div>
                <div
                  className={`px-2 py-1 rounded-lg text-xs font-bold border ${
                    latestLog?.status === 'ALLOWED'
                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-400'
                      : 'bg-slate-100 border-slate-300 text-slate-600 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300'
                  }`}
                >
                  {latestLog?.status === 'ALLOWED' ? 'Received the request' : 'Protected from this request'}
                </div>
              </div>
            </div>
          </div>

          {/* Algorithm selector */}
          <div className={`${panel} p-4 space-y-3`}>
            <div className="flex items-center justify-between">
              <span className={`text-xs font-semibold uppercase tracking-wide ${muted}`}>Choose an algorithm</span>
              <span className="text-xs font-bold text-amber-700 dark:text-amber-400">Active: {algoLabel(selectedAlgo)}</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              {ALGOS.map((algo) => (
                <button
                  key={algo.id}
                  onClick={() => handleSelectAlgo(algo.id)}
                  className={`p-3 rounded-xl border text-left transition-all ${
                    selectedAlgo === algo.id
                      ? 'bg-gradient-to-r from-amber-500 to-orange-600 text-white border-transparent shadow-lg'
                      : 'bg-slate-50 border-slate-200 hover:border-slate-300 text-slate-700 dark:bg-slate-950/80 dark:border-slate-800 dark:hover:border-slate-700 dark:text-slate-300'
                  }`}
                >
                  <div className="font-bold text-sm">{algo.label}</div>
                  <div className={`text-xs mt-0.5 ${selectedAlgo === algo.id ? 'text-white/90' : muted}`}>{algo.desc}</div>
                </button>
              ))}
            </div>
            {switchNotice && (
              <p className="text-xs rounded-lg px-3 py-2 bg-amber-50 text-amber-900 border border-amber-200 dark:bg-amber-400/[0.08] dark:text-amber-100 dark:border-amber-400/20">
                {switchNotice}
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left: controls */}
            <div className={`${panel} p-5 space-y-4`}>
              <div className="flex items-center space-x-2 border-b pb-2 border-slate-200 dark:border-slate-800">
                <Sliders className="w-4 h-4 text-amber-500" />
                <h3 className={`font-bold text-sm ${heading}`}>Parameters</h3>
              </div>

              <div className="space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <span className={body}>
                    {selectedAlgo === 'tokenBucket' ? 'Bucket size' : selectedAlgo === 'leakyBucket' ? 'Queue size' : 'Limit per window'} (<i>N</i>)
                  </span>
                  <span className="font-mono font-bold text-amber-700 dark:text-amber-400">{bucketCapacity}</span>
                </div>
                <input
                  type="range"
                  min={3}
                  max={25}
                  value={bucketCapacity}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    settle();
                    engRef.current.tokens = Math.min(engRef.current.tokens, val);
                    setBucketCapacity(val);
                  }}
                  className="w-full accent-amber-500 cursor-pointer"
                />
              </div>

              {(selectedAlgo === 'tokenBucket' || selectedAlgo === 'leakyBucket') && (
                <div className="space-y-1.5 text-sm">
                  <div className="flex justify-between">
                    <span className={body}>
                      {selectedAlgo === 'tokenBucket' ? 'Refill rate' : 'Outflow (leak) rate'} (<i>R</i>)
                    </span>
                    <span className="font-mono font-bold text-emerald-700 dark:text-emerald-400">{rate} / sec</span>
                  </div>
                  <input
                    type="range"
                    min={1}
                    max={5}
                    value={rate}
                    onChange={(e) => {
                      settle(); // account elapsed time at the old rate first
                      setRate(Number(e.target.value));
                    }}
                    className="w-full accent-emerald-500 cursor-pointer"
                  />
                </div>
              )}

              {isWindowAlgo(selectedAlgo) && (
                <div className="space-y-1.5 text-sm">
                  <div className="flex justify-between">
                    <span className={body}>
                      Window length (<i>W</i>)
                    </span>
                    <span className="font-mono font-bold text-blue-700 dark:text-cyan-400">{windowSeconds} s</span>
                  </div>
                  <input
                    type="range"
                    min={5}
                    max={30}
                    step={5}
                    value={windowSeconds}
                    onChange={(e) => {
                      settle();
                      setWindowSeconds(Number(e.target.value));
                    }}
                    className="w-full accent-blue-500 cursor-pointer"
                  />
                </div>
              )}

              <div className={`${inset} p-3.5 space-y-3`}>
                <span className={`text-sm font-bold ${heading}`}>Send traffic</span>
                <div className="flex space-x-2">
                  <input
                    type="text"
                    value={customUserId}
                    onChange={(e) => setCustomUserId(e.target.value)}
                    placeholder="Client key (e.g. user_101)"
                    aria-label="Client key"
                    className="flex-1 min-w-0 border rounded-lg px-2.5 py-1.5 text-xs font-mono focus:outline-none focus:border-amber-500 bg-white border-slate-300 text-slate-900 dark:bg-[#1c1c1e] dark:border-slate-700 dark:text-white"
                  />
                  <button
                    onClick={() => dispatchRequest()}
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs rounded-lg shadow-sm flex items-center space-x-1"
                  >
                    <Zap className="w-3.5 h-3.5 fill-current" />
                    <span>+1 request</span>
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={handleFireBurst}
                    className="py-1.5 bg-amber-600 hover:bg-amber-700 text-white font-semibold text-xs rounded-lg shadow-sm flex items-center justify-center space-x-1"
                  >
                    <Flame className="w-3.5 h-3.5" />
                    <span>Fire burst (5×)</span>
                  </button>
                  <button
                    onClick={() => setIsAutoStreamActive(!isAutoStreamActive)}
                    className={`py-1.5 font-semibold text-xs rounded-lg shadow-sm flex items-center justify-center space-x-1 text-white ${
                      isAutoStreamActive ? 'bg-rose-600 hover:bg-rose-700' : 'bg-blue-600 hover:bg-blue-700'
                    }`}
                  >
                    {isAutoStreamActive ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                    <span>{isAutoStreamActive ? 'Stop stream' : 'Auto stream'}</span>
                  </button>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className={muted}>Stream speed</span>
                  <div className="flex gap-1">
                    {[1, 2, 4].map((r) => (
                      <button
                        key={r}
                        onClick={() => setStreamRate(r)}
                        className={`px-2 py-0.5 rounded font-mono ${
                          streamRate === r
                            ? 'bg-blue-600 text-white'
                            : 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                        }`}
                      >
                        {r}/s
                      </button>
                    ))}
                  </div>
                </div>

                {isWindowAlgo(selectedAlgo) && (
                  <div className="pt-2 border-t border-slate-200 dark:border-slate-800 space-y-1.5">
                    <button
                      onClick={runEdgeBurstDemo}
                      className="w-full py-1.5 bg-purple-600 hover:bg-purple-700 text-white font-semibold text-xs rounded-lg shadow-sm flex items-center justify-center space-x-1"
                    >
                      <SplitSquareHorizontal className="w-3.5 h-3.5" />
                      <span>Edge burst demo ({bucketCapacity} + {bucketCapacity} across a window edge)</span>
                    </button>
                    <p className={`text-xs ${muted}`}>
                      Resets the limiter, jumps to just before a window edge, sends {bucketCapacity} requests, then {bucketCapacity} more right after the edge.
                    </p>
                  </div>
                )}
              </div>

              <button
                onClick={handleResetSimulator}
                className="w-full py-2 rounded-xl border text-xs font-semibold flex items-center justify-center space-x-2 transition-all border-slate-200 bg-slate-100 text-slate-600 hover:text-slate-900 hover:bg-slate-200 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400 dark:hover:text-white dark:hover:bg-slate-800"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Reset limiter and all totals</span>
              </button>
            </div>

            {/* Middle: engine state */}
            <div className={`${panel} p-5 flex flex-col justify-between space-y-4`}>
              <div className="flex items-center justify-between border-b pb-2 border-slate-200 dark:border-slate-800">
                <div className="flex items-center space-x-2">
                  <Activity className="w-4 h-4 text-emerald-500" />
                  <h3 className={`font-bold text-sm ${heading}`}>Inside the limiter</h3>
                </div>
                <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 text-xs font-mono rounded font-bold">LIVE</span>
              </div>

              {selectedAlgo === 'tokenBucket' && (
                <div className="space-y-4 my-auto">
                  <div className="text-center space-y-1">
                    <span className="text-3xl font-extrabold text-amber-500 font-mono">
                      {tokensWhole} / {bucketCapacity}
                    </span>
                    <p className={`text-xs ${muted}`}>
                      tokens in bucket · +{rate}/sec ·{' '}
                      {snap.tokens >= bucketCapacity ? 'full (extra tokens overflow)' : `next token in ${nextTokenSec.toFixed(1)}s`}
                    </p>
                  </div>
                  <div className="h-40 w-40 mx-auto rounded-b-3xl border-2 border-t-0 border-amber-500/60 p-2 flex flex-wrap-reverse content-start gap-1 overflow-hidden relative bg-amber-50/40 dark:bg-slate-950">
                    {Array.from({ length: tokensWhole }).map((_, i) => (
                      <div key={i} className="w-7 h-7 rounded-full bg-gradient-to-tr from-amber-500 to-yellow-400 text-slate-900 text-xs flex items-center justify-center shadow-md">
                        ⚡
                      </div>
                    ))}
                    {tokensWhole === 0 && (
                      <div className="absolute inset-0 flex items-center justify-center text-rose-600 dark:text-rose-400 text-xs font-bold bg-rose-500/10">
                        Empty: requests get 429
                      </div>
                    )}
                  </div>
                </div>
              )}

              {selectedAlgo === 'leakyBucket' && (
                <div className="space-y-3 my-auto text-xs">
                  <div className="text-center space-y-1">
                    <span className="text-3xl font-extrabold text-blue-500 font-mono">
                      {snap.queue.length} / {bucketCapacity}
                    </span>
                    <p className={muted}>
                      queued · outflow {rate}/sec · served so far {snap.leaked}
                      {snap.queue.length > 0 && ` · next out in ${nextLeakSec.toFixed(1)}s`}
                    </p>
                  </div>
                  <div className="h-44 w-full max-w-[14rem] mx-auto rounded-2xl border-2 border-blue-500/50 p-2 flex flex-col justify-end gap-1 overflow-hidden bg-blue-50/40 dark:bg-slate-950">
                    {snap.queue.length === 0 ? (
                      <div className={`my-auto text-center italic ${muted}`}>Queue empty: next request is served at once</div>
                    ) : (
                      snap.queue
                        .slice()
                        .reverse()
                        .map((q, idx, arr) => {
                          const pos = arr.length - idx;
                          const eta = Math.max(0, snap.lastLeak + pos * leakInterval - now) / 1000;
                          return (
                            <div key={q.logId} className="w-full py-0.5 px-2 bg-blue-600 text-white rounded-md text-xs font-mono flex justify-between">
                              <span>{q.requestId}</span>
                              <span>out in {eta.toFixed(1)}s</span>
                            </div>
                          );
                        })
                    )}
                  </div>
                  <p className={`text-center ${muted}`}>↓ leaks {rate} request{rate > 1 ? 's' : ''}/sec to the API server</p>
                </div>
              )}

              {selectedAlgo === 'fixedWindow' && (
                <div className="space-y-4 my-auto text-xs">
                  <div className="text-center space-y-1">
                    <span className="text-3xl font-extrabold text-purple-500 font-mono">
                      {snap.currCount} / {bucketCapacity}
                    </span>
                    <p className={muted}>requests counted in this {windowSeconds}s window</p>
                  </div>
                  <div className="space-y-3 max-w-xs mx-auto">
                    <div className="space-y-1">
                      <div className="flex justify-between">
                        <span className={body}>Counter</span>
                        <span className="font-bold text-purple-600 dark:text-purple-400">
                          {snap.currCount >= bucketCapacity ? 'limit reached (429)' : `${bucketCapacity - snap.currCount} left`}
                        </span>
                      </div>
                      <div className="w-full h-4 rounded-full overflow-hidden p-0.5 border bg-slate-100 border-slate-300 dark:bg-slate-950 dark:border-slate-800">
                        <div
                          style={{ width: `${Math.min(100, (snap.currCount / bucketCapacity) * 100)}%` }}
                          className={`h-full rounded-full transition-all duration-300 ${snap.currCount >= bucketCapacity ? 'bg-rose-500' : 'bg-purple-600'}`}
                        />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <div className="flex justify-between">
                        <span className={body}>Window clock</span>
                        <span className="font-mono font-bold text-blue-700 dark:text-cyan-400">resets in {windowLeftSec.toFixed(1)}s</span>
                      </div>
                      <div className="w-full h-2 rounded-full overflow-hidden bg-slate-200 dark:bg-slate-800">
                        <div style={{ width: `${windowElapsed * 100}%` }} className="h-full bg-blue-500" />
                      </div>
                    </div>
                    <p className={`text-center ${muted}`}>At the reset the counter drops to 0, whatever happened a moment before.</p>
                  </div>
                </div>
              )}

              {selectedAlgo === 'slidingLog' && (
                <div className="space-y-3 my-auto text-xs">
                  <div className="grid grid-cols-2 gap-2 text-center">
                    <div>
                      <div className="text-3xl font-extrabold text-cyan-500 font-mono">
                        {validLog.length} / {bucketCapacity}
                      </div>
                      <p className={muted}>timestamps in the last {windowSeconds}s</p>
                    </div>
                    <div>
                      <div className="text-3xl font-extrabold text-slate-700 dark:text-slate-200 font-mono">{snap.log.length}</div>
                      <p className={muted}>stored in memory</p>
                    </div>
                  </div>
                  <div className={`${inset} p-2 max-h-[150px] overflow-y-auto space-y-1`}>
                    {snap.log.length === 0 ? (
                      <div className={`text-center italic py-4 ${muted}`}>Log is empty</div>
                    ) : (
                      snap.log
                        .slice()
                        .reverse()
                        .slice(0, 40)
                        .map((x, idx) => {
                          const expired = x.t <= now - W;
                          return (
                            <div
                              key={`${x.t}_${idx}`}
                              className={`px-2 py-1 rounded flex justify-between items-center font-mono bg-white text-slate-800 dark:bg-[#1c1c1e] dark:text-slate-200 ${
                                expired ? 'opacity-50 line-through' : ''
                              }`}
                            >
                              <span>{new Date(x.t).toLocaleTimeString()}</span>
                              <span className={x.allowed ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400'}>
                                {expired ? 'expired' : x.allowed ? 'allowed' : 'rejected'}
                              </span>
                            </div>
                          );
                        })
                    )}
                  </div>
                  <p className={muted}>
                    Expired entries are only removed when the next request arrives. Rejected requests also stay in the log, so memory grows with
                    traffic, not with the limit (this demo caps it at {LOG_MEMORY_CAP}).
                  </p>
                </div>
              )}

              {selectedAlgo === 'slidingCounter' && (
                <div className="space-y-3 my-auto text-xs">
                  <div className="grid grid-cols-2 gap-2 text-center">
                    <div className={`${inset} p-2`}>
                      <div className="text-2xl font-extrabold font-mono text-slate-700 dark:text-slate-200">{snap.prevCount}</div>
                      <p className={muted}>previous window</p>
                    </div>
                    <div className={`${inset} p-2`}>
                      <div className="text-2xl font-extrabold font-mono text-indigo-600 dark:text-indigo-400">{snap.currCount}</div>
                      <p className={muted}>current window</p>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <div className="flex justify-between">
                      <span className={body}>Position in current window</span>
                      <span className="font-mono font-bold">{Math.round(windowElapsed * 100)}%</span>
                    </div>
                    <div className="w-full h-2 rounded-full overflow-hidden bg-slate-200 dark:bg-slate-800">
                      <div style={{ width: `${windowElapsed * 100}%` }} className="h-full bg-indigo-500" />
                    </div>
                    <p className={muted}>
                      Overlap of the rolling {windowSeconds}s window with the previous window = 1 − position ={' '}
                      <span className="font-mono font-bold">{overlap.toFixed(2)}</span>
                    </p>
                  </div>
                  <div className={`${inset} p-3 space-y-1 text-center`}>
                    <div className={muted}>current + previous × overlap</div>
                    <div className="text-base font-bold font-mono text-indigo-700 dark:text-indigo-300">
                      {snap.currCount} + {snap.prevCount} × {overlap.toFixed(2)} = {estimate.toFixed(2)}
                    </div>
                    <div className={`font-mono ${body}`}>
                      rounded down: <span className="font-bold text-amber-600 dark:text-amber-400">{Math.floor(estimate)}</span> / {bucketCapacity} →{' '}
                      {Math.floor(estimate) < bucketCapacity ? 'next request allowed' : 'next request rejected'}
                    </div>
                  </div>
                </div>
              )}

              {demoResult && (
                <p className="text-xs rounded-lg px-3 py-2 bg-purple-50 text-purple-900 border border-purple-200 dark:bg-purple-400/[0.08] dark:text-purple-100 dark:border-purple-400/20">
                  <strong>Edge burst result: </strong>
                  {demoResult}
                </p>
              )}

              <div className="space-y-2 pt-2 border-t border-slate-200 dark:border-slate-800">
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="p-2.5 rounded-xl border bg-emerald-50/60 border-emerald-200 dark:bg-slate-950 dark:border-slate-800">
                    <span className="block uppercase text-emerald-700 dark:text-emerald-400 font-bold">Served (200)</span>
                    <span className="text-base font-bold font-mono text-emerald-700 dark:text-emerald-400">{stats[selectedAlgo].allowed}</span>
                  </div>
                  <div className="p-2.5 rounded-xl border bg-rose-50/60 border-rose-200 dark:bg-slate-950 dark:border-slate-800">
                    <span className="block uppercase text-rose-700 dark:text-rose-400 font-bold">Rejected (429)</span>
                    <span className="text-base font-bold font-mono text-rose-700 dark:text-rose-400">{stats[selectedAlgo].rejected}</span>
                  </div>
                </div>
                <div className={`text-xs ${muted}`}>
                  <span className="font-semibold">Totals by algorithm (served / rejected): </span>
                  {ALGOS.map((a, i) => (
                    <span key={a.id} className={a.id === selectedAlgo ? 'font-bold text-slate-800 dark:text-slate-100' : ''}>
                      {a.label} <span className="font-mono">{stats[a.id].allowed}/{stats[a.id].rejected}</span>
                      {i < ALGOS.length - 1 ? ' · ' : ''}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* Right: traffic log */}
            <div className={`${panel} p-5 flex flex-col space-y-3`}>
              <div className="flex items-center justify-between border-b pb-2 border-slate-200 dark:border-slate-800">
                <div className="flex items-center space-x-2">
                  <Database className="w-4 h-4 text-amber-500" />
                  <h3 className={`font-bold text-sm ${heading}`}>HTTP traffic log</h3>
                </div>
                <span className={`text-xs font-mono ${muted}`}>{requestLogs.length} entries</span>
              </div>

              <div className={`${inset} flex-1 max-h-[420px] overflow-y-auto p-2 space-y-1.5 font-mono text-xs`}>
                {requestLogs.length === 0 ? (
                  <div className={`text-center py-12 italic font-sans ${muted}`}>
                    No requests yet.
                    <br />
                    Press "+1 request" or "Fire burst".
                  </div>
                ) : (
                  requestLogs.map((log) => (
                    <div
                      key={log.id}
                      className={`p-2 rounded-lg border ${
                        log.status === 'ALLOWED'
                          ? 'bg-emerald-50 border-emerald-200 text-emerald-900 dark:bg-emerald-950/20 dark:border-emerald-800/40 dark:text-emerald-200'
                          : log.status === 'QUEUED'
                          ? 'bg-amber-50 border-amber-200 text-amber-900 dark:bg-amber-950/20 dark:border-amber-800/40 dark:text-amber-200'
                          : 'bg-rose-50 border-rose-200 text-rose-900 dark:bg-rose-950/20 dark:border-rose-800/40 dark:text-rose-200'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="space-y-0.5 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-bold">{log.requestId}</span>
                            <span className="opacity-75 truncate">({log.userId})</span>
                          </div>
                          <div className="opacity-90 font-sans">
                            {log.reason}
                            {log.waitedMs !== undefined && ` (${(log.waitedMs / 1000).toFixed(1)}s)`}
                          </div>
                          <div className="opacity-80 pt-0.5 break-words">
                            X-Ratelimit-Limit: {log.headers.limit} · X-Ratelimit-Remaining: {log.headers.remaining}
                            {log.headers.retryAfter !== undefined && ` · X-Ratelimit-Retry-After: ${log.headers.retryAfter}`}
                          </div>
                        </div>
                        <div className="text-right space-y-0.5 shrink-0">
                          <span className={`px-2 py-0.5 rounded font-bold ${statusBadge(log.status)}`}>
                            {log.status === 'ALLOWED' ? '200 OK' : log.status === 'QUEUED' ? (
                              <span className="inline-flex items-center gap-1"><Hourglass className="w-3 h-3" />queued</span>
                            ) : '429'}
                          </span>
                          <div className="opacity-70">{log.timeString}</div>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
              <p className={`text-xs ${muted}`}>
                Retry-After is computed from the limiter's state: when the next token arrives, the next queue slot frees, the window resets, or
                enough old requests age out.
              </p>
            </div>
          </div>

          <Takeaway>{lesson.takeaway}</Takeaway>
          <Quiz key={selectedAlgo} persistKey={`rateLimiter:quiz:sim:${selectedAlgo}`} title={`Check your understanding: ${algoLabel(selectedAlgo)}`} questions={lesson.quiz} />
        </div>
      )}

      {/* VIEW 4: PRODUCTION CONCERNS */}
      {activeTab === 'production' && (
        <div className="space-y-6">
          <LessonGoal
            goal="What a production rate limiter tells clients, and what breaks when it runs on many servers at once."
            why="The algorithm is the easy part. Real systems must explain throttling to clients and keep one shared, correct count across many limiter instances."
          />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className={`${panel} p-5 space-y-3`}>
              <h3 className={`font-bold text-base ${heading}`}>Telling the client: 429 and headers</h3>
              <p className={`text-sm leading-relaxed ${body}`}>
                A throttled request gets HTTP 429. Every response carries headers so a well-behaved client can slow down before it is blocked:
              </p>
              <pre className={`${inset} p-3 font-mono text-xs overflow-x-auto text-slate-800 dark:text-slate-200`}>
{`HTTP/1.1 429 Too Many Requests
X-Ratelimit-Limit: 10         # calls allowed per window
X-Ratelimit-Remaining: 0      # calls left in this window
X-Ratelimit-Retry-After: 4    # seconds until you may retry`}
              </pre>
              <p className={`text-sm leading-relaxed ${body}`}>
                A limited request does not have to be lost: depending on the use case it can be dropped, or put on a queue to be processed later
                (for example orders rejected during an overload).
              </p>
            </div>

            <div className={`${panel} p-5 space-y-3`}>
              <h3 className={`font-bold text-base ${heading}`}>Rules, hard vs soft limits</h3>
              <p className={`text-sm leading-relaxed ${body}`}>
                Rules are usually written in config files on disk (Lyft's open-source limiter uses entries like "at most 5 logins per minute").
                Workers pull them into a cache, and the middleware reads rules from the cache and counters from Redis.
              </p>
              <ul className={`text-sm leading-relaxed list-disc pl-5 space-y-1 ${body}`}>
                <li>
                  <strong className={heading}>Hard limit:</strong> requests can never exceed the threshold.
                </li>
                <li>
                  <strong className={heading}>Soft limit:</strong> requests may exceed the threshold for a short period.
                </li>
                <li>
                  The limiter in this chapter works at the HTTP layer (layer 7); you can also limit by IP address at layer 3, e.g. with iptables.
                </li>
              </ul>
            </div>

            <div className={`${panel} p-5 space-y-3`}>
              <h3 className={`font-bold text-base ${heading}`}>Challenge 1: race condition</h3>
              <p className={`text-sm leading-relaxed ${body}`}>
                A naive limiter reads the counter, checks it, then writes counter + 1. Two concurrent requests can both read the same value:
              </p>
              <div className={`${inset} p-3 font-mono text-xs space-y-0.5 text-slate-800 dark:text-slate-200`}>
                <div>counter = 3</div>
                <div>request A: read 3 → check ok → write 4</div>
                <div>request B: read 3 → check ok → write 4</div>
                <div className="text-rose-700 dark:text-rose-400">result: 4, but two requests arrived, so it should be 5</div>
              </div>
              <p className={`text-sm leading-relaxed ${body}`}>
                Locks fix it but slow the system down a lot. The book's two common fixes: a{' '}
                <Term term="Lua script">Redis runs a Lua script as one atomic step, so read, check and increment cannot interleave with another request.</Term>{' '}
                that does read-check-increment atomically inside Redis, or a Redis{' '}
                <Term term="sorted set">A Redis structure of members ordered by score; storing request timestamps as scores lets you trim old ones and count in atomic operations.</Term>.
              </p>
            </div>

            <div className={`${panel} p-5 space-y-3`}>
              <h3 className={`font-bold text-base ${heading}`}>Challenge 2: synchronization</h3>
              <p className={`text-sm leading-relaxed ${body}`}>
                At scale one limiter server is not enough. The web tier is stateless, so a client's requests may land on different limiter
                instances. If each keeps its own counters, none of them sees the client's full traffic.
              </p>
              <p className={`text-sm leading-relaxed ${body}`}>
                Sticky sessions (pin a client to one limiter) work but are neither scalable nor flexible. The better fix is a centralized data store
                such as Redis that every limiter reads and writes.
              </p>
            </div>
          </div>

          <WhatChanged
            before="Each limiter instance counts requests in its own memory; a client spread over two instances gets twice its quota."
            after="All limiter instances read and update the same counters in a centralized Redis, using atomic Lua scripts."
            reason="A limit is only correct if every decision sees the same, up-to-date count. Centralizing the state fixes synchronization; atomic scripts fix the race."
          />

          <div className={`${panel} p-5 space-y-2`}>
            <h3 className={`font-bold text-base ${heading}`}>Performance and monitoring</h3>
            <ul className={`text-sm leading-relaxed list-disc pl-5 space-y-1 ${body}`}>
              <li>Run limiters in many data centers or edge locations so users far away do not pay extra latency.</li>
              <li>Synchronize counters between locations with an eventual consistency model (see Chapter 6).</li>
              <li>Monitor whether the algorithm and rules are effective: too strict drops valid requests; a flash sale may call for a burst-friendly token bucket.</li>
              <li>Clients should cache responses, back off exponentially on errors, and catch 429s gracefully.</li>
            </ul>
          </div>

          <Takeaway>
            Tell clients where they stand with 429 and X-Ratelimit-* headers. In a distributed limiter, keep counters in one shared store like
            Redis and update them atomically (Lua script or sorted set); otherwise concurrent requests and multiple instances undercount.
          </Takeaway>

          <Quiz
            persistKey="rateLimiter:quiz:production"
            questions={[
              {
                question: 'The Redis counter is 3. Two requests run the naive read → check → write +1 at the same moment. What is the counter afterwards?',
                options: [
                  { text: '4, so one request went uncounted', correct: true, why: 'Both read 3 and both write 4. That lost update is the race condition; an atomic Lua script prevents it.' },
                  { text: '5, because Redis serializes the writes', why: 'Each individual command is atomic, but the read and the write are separate commands, so the other request can slip in between.' },
                  { text: '3, because the second write cancels the first', why: 'Both writes store 4; nothing resets it to 3.' },
                  { text: 'It depends on which request finishes first', why: 'Either order gives the same wrong answer: 4.' },
                ],
              },
              {
                question: 'Why does the book prefer a centralized Redis over sticky sessions for multiple limiter servers?',
                options: [
                  { text: 'Sticky sessions are neither scalable nor flexible; a shared store lets any limiter decide correctly', correct: true, why: 'Pinning clients to one limiter makes load balancing and failover hard. With shared counters, any instance can serve any request.' },
                  { text: 'Sticky sessions do not work over HTTPS', why: 'They work with HTTPS; the problem is scalability and flexibility.' },
                  { text: 'Redis stores counters on disk, so they survive restarts', why: 'Redis is chosen because it is in memory and fast, with built-in expiry.' },
                  { text: 'Sticky sessions double-count every request', why: 'They do not double-count; they just tie each client to one server.' },
                ],
              },
              {
                question: 'A client got a 429. Which header tells it when it can try again without being throttled?',
                options: [
                  { text: 'X-Ratelimit-Retry-After', correct: true, why: 'It gives the number of seconds to wait before the next request will be accepted.' },
                  { text: 'X-Ratelimit-Remaining', why: 'That says how many calls are left in the window; after a 429 it is 0 and says nothing about timing.' },
                  { text: 'X-Ratelimit-Limit', why: 'That is the quota per window, not the wait time.' },
                  { text: 'None: the client should retry immediately in a loop', why: 'Retrying immediately just gets more 429s, and with a sliding log each retry even pushes the wait further out.' },
                ],
              },
            ]}
          />
        </div>
      )}
    </div>
  );
};
