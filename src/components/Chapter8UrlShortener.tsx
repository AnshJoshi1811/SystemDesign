import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Link2,
  Database,
  Zap,
  Globe,
  Sliders,
  Terminal,
  Plus,
  Shield,
  ExternalLink,
  Cpu,
  MousePointer,
  Play,
  Pause,
  RotateCcw,
  Filter,
  Server,
  Search,
  BarChart3,
  AlertTriangle,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { usePersistentState } from '../lib/usePersistentState';
import { murmur3Hash } from '../lib/hash';
import { LessonGoal, Takeaway, Quiz, Term, WhatChanged, type QuizQuestion } from './learn/LearningKit';

interface Chapter8UrlShortenerProps {
  isDarkMode?: boolean;
}

export type CodeGenStrategy = 'HASH_CRC32' | 'BASE62_ID' | 'KGS';
export type RedirectType = '301_PERMANENT' | '302_TEMPORARY';
type Tab = 'canvas' | 'base62' | 'collision' | 'redirect' | 'scale';
type LookupKind = 'browser' | 'memory' | 'cache' | 'db';

export interface ShortUrlRecord {
  id: number; // primary key from the unique ID generator
  shortCode: string;
  longUrl: string;
  strategy: CodeGenStrategy;
  userClicks: number; // clicks users actually made
  serverClicks: number; // clicks the shortener server saw (and could log)
}

export interface RequestLog {
  id: string;
  timestamp: string;
  method: 'POST' | 'GET';
  path: string;
  statusCode: number;
  note: string;
  latencyMs: number;
  country?: string;
}

interface HashAttempt {
  input: string;
  hex: string;
  candidate: string;
  bloom: 'absent' | 'maybe';
  outcome: 'free' | 'false-positive' | 'collision';
  takenBy?: string;
}

interface CreateResult {
  status: number;
  message: string;
  code?: string;
  steps: string[];
  attempts?: HashAttempt[];
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

// Base62 alphabet in the book's order: 0-9 -> 0..9, a-z -> 10..35, A-Z -> 36..61
const BASE62_ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
const CODE_LENGTH = 7; // smallest n with 62^n >= 365 billion
const PREDEFINED_STRING = '#retry'; // appended to the long URL on each collision
const FIRST_ID = 2009215674938; // the book's example ID -> "zn9edcu"
const BLOOM_BITS = 64;
const BLOOM_HASHES = 3;
const MAX_STORED_URLS = 30;
const RATE_LIMIT = { max: 5, windowMs: 10_000 };
const DEFAULT_LONG_URL = 'https://en.wikipedia.org/wiki/Systems_design';
const BOOK_WRITES_PER_SEC = 1160;
const BOOK_READS_PER_SEC = 11600;
const WEB_SERVER_CAPACITY = 4000; // illustrative req/s per web server
const REPLICA_CAPACITY = 5000; // illustrative reads/s per DB replica
const LATENCY_MS: Record<LookupKind, number> = { browser: 0, memory: 0.2, cache: 1, db: 10 }; // illustrative
const COUNTRIES = ['United States', 'Germany', 'India', 'Japan', 'Brazil', 'United Kingdom'];

const encodeBase62 = (num: number): string => {
  if (num <= 0) return BASE62_ALPHABET[0];
  let str = '';
  let current = num;
  while (current > 0) {
    str = BASE62_ALPHABET[current % 62] + str;
    current = Math.floor(current / 62);
  }
  return str;
};

const decodeBase62 = (str: string): number | null => {
  let num = 0;
  for (const char of str) {
    const index = BASE62_ALPHABET.indexOf(char);
    if (index === -1) return null;
    num = num * 62 + index;
  }
  return num;
};

/** Every step of the repeated division, in order. Reading remainders bottom-up gives the code. */
const base62Steps = (num: number) => {
  const rows: { dividend: number; quotient: number; remainder: number; char: string }[] = [];
  let current = num;
  while (current > 0) {
    const quotient = Math.floor(current / 62);
    const remainder = current % 62;
    rows.push({ dividend: current, quotient, remainder, char: BASE62_ALPHABET[remainder] });
    current = quotient;
  }
  return rows;
};

// Standard CRC32 (IEEE 802.3, reflected polynomial 0xEDB88320) — one of the hashes the book lists.
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

const crc32Hex = (text: string): string => {
  let c = 0xffffffff;
  for (const byte of new TextEncoder().encode(text)) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return ((c ^ 0xffffffff) >>> 0).toString(16).padStart(8, '0');
};

// A real (tiny) Bloom filter: 64 bits, 3 hash functions. It can say "definitely absent" or "maybe present".
const bloomIndexes = (key: string) => Array.from({ length: BLOOM_HASHES }, (_, i) => murmur3Hash(key, i + 1) % BLOOM_BITS);

const buildBloom = (keys: string[]) => {
  const bits = new Array<boolean>(BLOOM_BITS).fill(false);
  keys.forEach((k) => bloomIndexes(k).forEach((i) => (bits[i] = true)));
  return bits;
};

const bloomMaybe = (bits: boolean[], key: string) => bloomIndexes(key).every((i) => bits[i]);

/**
 * The book's "hash + collision resolution": take the first `len` chars of the hash; if that code is taken,
 * append a predefined string to the long URL and hash again, until the code is free. A Bloom filter in front
 * of the table skips the DB lookup whenever it answers "definitely absent".
 */
const resolveHash = (longUrl: string, len: number, taken: Map<string, string>) => {
  const bits = buildBloom([...taken.keys()]);
  const attempts: HashAttempt[] = [];
  let input = longUrl;
  for (let i = 0; i < 20; i++) {
    const hex = crc32Hex(input);
    const candidate = hex.slice(0, len);
    if (!bloomMaybe(bits, candidate)) {
      attempts.push({ input, hex, candidate, bloom: 'absent', outcome: 'free' });
      return { code: candidate, attempts };
    }
    const owner = taken.get(candidate);
    if (owner === undefined) {
      attempts.push({ input, hex, candidate, bloom: 'maybe', outcome: 'false-positive' });
      return { code: candidate, attempts };
    }
    attempts.push({ input, hex, candidate, bloom: 'maybe', outcome: 'collision', takenBy: owner });
    input = input + PREDEFINED_STRING;
  }
  return { code: null as string | null, attempts };
};

const randomString = (alphabet: string, len: number) =>
  Array.from({ length: len }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('');

/** KGS (beyond the book): top the pool up with random 7-char keys that were never handed out. */
const refillKgs = (used: Set<string>, pool: string[], size = 8) => {
  const next = pool.filter((k) => !used.has(k));
  const seen = new Set([...used, ...next]);
  while (next.length < size) {
    const key = randomString(BASE62_ALPHABET, CODE_LENGTH);
    if (!seen.has(key)) {
      seen.add(key);
      next.push(key);
    }
  }
  return next;
};

const fmtInt = (n: number) => Math.round(n).toLocaleString();
const fmtBytes = (b: number) =>
  b >= 1e15 ? `${(b / 1e15).toFixed(1)} PB` : b >= 1e12 ? `${(b / 1e12).toFixed(1)} TB` : `${(b / 1e9).toFixed(1)} GB`;
const shortUrl = (code: string) => `tinyurl.com/${code}`;
const now = () => new Date().toLocaleTimeString();

const SEED_RECORDS: ShortUrlRecord[] = [
  {
    id: FIRST_ID - 4,
    shortCode: crc32Hex('https://en.wikipedia.org/wiki/Bloom_filter').slice(0, CODE_LENGTH),
    longUrl: 'https://en.wikipedia.org/wiki/Bloom_filter',
    strategy: 'HASH_CRC32',
    userClicks: 0,
    serverClicks: 0,
  },
  ...[
    'https://github.com/donnemartin/system-design-primer',
    'https://en.wikipedia.org/wiki/URL_shortening',
    'https://developer.mozilla.org/en-US/docs/Web/HTTP/Status/302',
  ].map((longUrl, i) => ({
    id: FIRST_ID - 3 + i,
    shortCode: encodeBase62(FIRST_ID - 3 + i),
    longUrl,
    strategy: 'BASE62_ID' as CodeGenStrategy,
    userClicks: 0,
    serverClicks: 0,
  })),
];

const LAB_SAMPLES = [
  'https://en.wikipedia.org/wiki/Hash_function',
  'https://en.wikipedia.org/wiki/Cyclic_redundancy_check',
  'https://en.wikipedia.org/wiki/MD5',
  'https://en.wikipedia.org/wiki/SHA-1',
  'https://en.wikipedia.org/wiki/Base62',
  'https://en.wikipedia.org/wiki/Load_balancing_(computing)',
  'https://en.wikipedia.org/wiki/Cache_(computing)',
  'https://en.wikipedia.org/wiki/Database_index',
  'https://en.wikipedia.org/wiki/Rate_limiting',
  'https://en.wikipedia.org/wiki/Replication_(computing)',
  'https://en.wikipedia.org/wiki/Shard_(database_architecture)',
  'https://en.wikipedia.org/wiki/HTTP_301',
  'https://en.wikipedia.org/wiki/HTTP_302',
  'https://en.wikipedia.org/wiki/Consistent_hashing',
  'https://en.wikipedia.org/wiki/Snowflake_ID',
  'https://en.wikipedia.org/wiki/Birthday_problem',
];

const EMPTY_STATS = { userClicks: 0, serverHits: 0, browserCached: 0, cacheHits: 0, dbReads: 0 };

// ---------------------------------------------------------------------------
// Shared styling
// ---------------------------------------------------------------------------
const panel = 'rounded-3xl border bg-white border-slate-200 shadow-xs dark:bg-[#1c1c1e] dark:border-slate-800';
const inset = 'rounded-2xl border bg-slate-50 border-slate-200 dark:bg-slate-950 dark:border-slate-800';
const sectionLabel = 'text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 block';
const muted = 'text-slate-600 dark:text-slate-400';
const strong = 'text-slate-900 dark:text-white';
const amberText = 'text-amber-700 dark:text-amber-400';
const emeraldText = 'text-emerald-700 dark:text-emerald-400';
const roseText = 'text-rose-700 dark:text-rose-400';
const indigoText = 'text-indigo-700 dark:text-indigo-300';
const toggleOff = 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300';
const choice = (active: boolean) =>
  active
    ? 'bg-amber-500 text-slate-950 border-amber-400 ring-2 ring-amber-500/20'
    : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300 dark:bg-slate-950 dark:border-slate-800 dark:text-slate-300 dark:hover:border-slate-700';

// ---------------------------------------------------------------------------
// Small SVG helpers
// ---------------------------------------------------------------------------
const Arrow: React.FC<{
  x1: number; y1: number; x2: number; y2: number; label: string; lx: number; ly: number; active: boolean;
}> = ({ x1, y1, x2, y2, label, lx, ly, active }) => {
  const ang = Math.atan2(y2 - y1, x2 - x1);
  const h = 8;
  const p1 = `${x2 - h * Math.cos(ang - 0.4)},${y2 - h * Math.sin(ang - 0.4)}`;
  const p2 = `${x2 - h * Math.cos(ang + 0.4)},${y2 - h * Math.sin(ang + 0.4)}`;
  return (
    <g opacity={active ? 1 : 0.3}>
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="currentColor" strokeWidth={2} strokeDasharray={active ? undefined : '5 4'} />
      <polygon points={`${x2},${y2} ${p1} ${p2}`} fill="currentColor" />
      <text x={lx} y={ly} fontSize={12} fill="currentColor" textAnchor="middle">{label}</text>
    </g>
  );
};

const Node: React.FC<{ x: number; y: number; w: number; label: string; sub?: string; dashed?: boolean; highlight?: boolean }> = ({
  x, y, w, label, sub, dashed, highlight,
}) => (
  <g>
    <rect x={x} y={y} width={w} height={42} rx={10} fill="none" stroke="currentColor" strokeWidth={highlight ? 2.5 : 1.5}
      strokeDasharray={dashed ? '5 4' : undefined} opacity={dashed ? 0.5 : 1} />
    <text x={x + w / 2} y={y + (sub ? 18 : 26)} fontSize={13} fontWeight={600} fill="currentColor" textAnchor="middle">{label}</text>
    {sub && <text x={x + w / 2} y={y + 34} fontSize={11} fill="currentColor" textAnchor="middle" opacity={0.75}>{sub}</text>}
  </g>
);

const AttemptsTable: React.FC<{ attempts: HashAttempt[]; len: number }> = ({ attempts, len }) => (
  <div className="overflow-x-auto">
    <table className="w-full text-xs text-left">
      <thead>
        <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
          <th className="p-2">#</th>
          <th className="p-2">Input hashed</th>
          <th className="p-2">CRC32 (hex)</th>
          <th className="p-2">First {len}</th>
          <th className="p-2">Bloom filter</th>
          <th className="p-2">Result</th>
        </tr>
      </thead>
      <tbody className="text-slate-800 dark:text-slate-200">
        {attempts.map((a, i) => (
          <tr key={i} className="border-b border-slate-200/60 dark:border-slate-800/60">
            <td className="p-2 font-mono">{i + 1}</td>
            <td className="p-2 font-mono max-w-[220px] truncate" title={a.input}>
              {a.input.length > 34 ? '…' + a.input.slice(-34) : a.input}
            </td>
            <td className="p-2 font-mono">{a.hex}</td>
            <td className="p-2 font-mono font-bold">{a.candidate}</td>
            <td className="p-2">
              {a.bloom === 'absent' ? (
                <span className={emeraldText}>definitely absent (DB read skipped)</span>
              ) : (
                <span className={amberText}>maybe present → read DB</span>
              )}
            </td>
            <td className="p-2">
              {a.outcome === 'free' && <span className={emeraldText}>free → use it</span>}
              {a.outcome === 'false-positive' && <span className={indigoText}>free (Bloom false positive cost one DB read)</span>}
              {a.outcome === 'collision' && (
                <span className={roseText}>
                  collision with {a.takenBy && a.takenBy.length > 28 ? a.takenBy.slice(0, 28) + '…' : a.takenBy} → append "{PREDEFINED_STRING}"
                </span>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

// ---------------------------------------------------------------------------
// Stage content (follows the chapter: APIs -> 301/302 -> data model -> length -> hash vs base62 -> flows -> wrap-up)
// ---------------------------------------------------------------------------
interface StageDef {
  title: string;
  tab: Tab;
  goal: React.ReactNode;
  why: React.ReactNode;
  takeaway: React.ReactNode;
  changed?: { before: React.ReactNode; after: React.ReactNode; reason: React.ReactNode };
  quiz: QuizQuestion[];
}

const TAB_LABELS: Record<Tab, string> = {
  canvas: 'Shorten & redirect',
  base62: 'Base62 & code length',
  collision: 'Hash collisions & Bloom filter',
  redirect: '301 vs 302',
  scale: 'Scale, analytics & console',
};

const STAGES: StageDef[] = [
  {
    title: 'API endpoints & back-of-the-envelope numbers',
    tab: 'canvas',
    goal: 'A URL shortener needs only two REST endpoints: POST api/v1/data/shorten (create) and GET api/v1/{shortUrl} (redirect).',
    why: 'Before designing, size it. The book assumes 100 million new URLs per day, a 10:1 read-to-write ratio and 10 years of data — those numbers decide the code length and why caching matters later.',
    takeaway: 'Two endpoints, and a read-heavy workload: ~1,160 writes/s but ~11,600 redirects/s, with 365 billion records over 10 years.',
    quiz: [
      {
        question: 'With 100 million new URLs per day and a 10:1 read-to-write ratio, roughly how many redirects per second must the system serve?',
        options: [
          { text: 'About 11,600 per second', correct: true, why: '100M / 86,400 s ≈ 1,160 writes/s; ten times that is ≈ 11,600 reads/s.' },
          { text: 'About 1,160 per second', why: 'That is the write rate (new short URLs). Reads are 10× higher.' },
          { text: 'About 116,000 per second', why: 'That would be a 100:1 ratio. The book assumes 10:1.' },
          { text: 'About 100 million per second', why: '100 million is the per-day write count, not a per-second rate.' },
        ],
      },
      {
        question: 'Why is shortening a POST while redirecting is a GET?',
        options: [
          { text: 'Shortening creates a new mapping on the server; redirecting only reads an existing one', correct: true, why: 'POST is for requests that create state; GET is a safe read, which is exactly what a redirect lookup is.' },
          { text: 'GET requests cannot carry a URL in them', why: 'The short code travels in the GET path itself. The long URL goes in the POST body because it is new data being stored.' },
          { text: 'Browsers only follow redirects from POST responses', why: 'Browsers follow 301/302 redirects from GET responses — that is how every short link works.' },
          { text: 'It does not matter; either verb works the same', why: 'Verbs carry meaning: caches, crawlers and browsers treat GET as safe to repeat, which would be wrong for creating records.' },
        ],
      },
    ],
  },
  {
    title: 'URL redirecting: 301 vs 302',
    tab: 'redirect',
    goal: (
      <>
        The server answers a short URL with a redirect. A <Term term="301">"Moved Permanently": the browser caches the answer and later clicks go straight to the long URL, skipping the shortener.</Term> and a{' '}
        <Term term="302">"Found" (temporary): the browser does not cache it, so every click goes through the shortener first.</Term> look the same to the user but behave very differently for your servers.
      </>
    ),
    why: 'Click the same link several times under each code and watch which clicks actually reach the server.',
    takeaway: '301 reduces server load (only the first click per browser arrives) but undercounts clicks. 302 sends every click through the server, so choose it when analytics matter.',
    quiz: [
      {
        question: 'Marketing wants accurate click counts per short link. Which redirect should the server return?',
        options: [
          { text: '302, so every click reaches the shortener and can be counted', correct: true, why: 'A 302 is not cached by the browser, so each click is a request your server can log.' },
          { text: '301, because it is faster for users', why: 'It is faster for repeat clicks, but those clicks never reach your server, so they cannot be counted.' },
          { text: 'Either — the server logs every click regardless', why: 'The server can only log requests it receives. With 301, repeat clicks are served from the browser cache.' },
          { text: '301, and add a Redis cache to catch the missed clicks', why: 'Redis sits behind your server. Clicks answered by the browser cache never arrive, so Redis never sees them either.' },
        ],
      },
      {
        question: 'Under 301, one user clicks the same short link 5 times. How many requests reach the shortener?',
        options: [
          { text: '1', correct: true, why: 'The first click learns the target; the browser caches the permanent redirect and handles the other 4 itself.' },
          { text: '5', why: 'That is the 302 behaviour. A 301 is cached after the first response.' },
          { text: '0', why: 'The browser has to ask at least once to learn where the short link points.' },
          { text: 'It depends on the database cache hit ratio', why: 'Server-side caches change how fast the server answers, not whether the browser asks.' },
        ],
      },
    ],
  },
  {
    title: 'From a hash table to a data model',
    tab: 'canvas',
    goal: 'The simplest design keeps <shortURL, longURL> pairs in a hash table: longURL = hashTable.get(shortURL). The deep dive moves them into a relational table with columns id, shortURL, longURL.',
    why: 'Toggle between the in-memory hash table and the database, then press "Restart server" to see which one keeps your links.',
    changed: {
      before: 'In-memory hash table on one server: fast, but limited by RAM and wiped on restart.',
      after: 'Relational table (id, shortURL, longURL): durable, and can grow far beyond one machine\'s memory.',
      reason: 'Memory is limited and expensive; 365 billion mappings will not fit in RAM, and a crash must not lose every link.',
    },
    takeaway: 'A hash table explains the lookup; a database makes it durable and large enough. (The speed of memory comes back later as a cache.)',
    quiz: [
      {
        question: 'Why does the book move mappings from an in-memory hash table to a relational database?',
        options: [
          { text: 'Memory is limited and expensive, and in-memory data is lost when the server restarts', correct: true, why: 'Hundreds of billions of rows will not fit in one server\'s RAM, and durability matters for links people share.' },
          { text: 'Hash table lookups are too slow for redirects', why: 'Hash table lookups are O(1) and very fast. The problem is size and durability, not speed.' },
          { text: 'The database generates the short codes', why: 'Codes come from a hash function or base62 conversion. The DB stores the result (and its primary key can feed base62).' },
          { text: 'A database removes the need for any caching', why: 'The opposite: once data is on disk, a cache is added in front of the DB for the read-heavy redirect path.' },
        ],
      },
    ],
  },
  {
    title: 'How long must the short code be?',
    tab: 'base62',
    goal: (
      <>
        Codes use <Term term="base62">An alphabet of 62 URL-safe characters: 0-9, a-z, A-Z (10 + 26 + 26). A number written in base 62 uses these as digits.</Term> characters. Find the smallest length n with 62ⁿ ≥ the number of URLs you must store.
      </>
    ),
    why: '365 billion URLs need n = 7, since 62⁷ ≈ 3.5 trillion. Change the traffic estimate below and watch the required length move.',
    takeaway: 'The code length comes straight from the estimate: 62⁶ ≈ 56.8 billion is too small for 365 billion, so the book picks 7.',
    quiz: [
      {
        question: 'Why does the book choose 7 characters for the short code?',
        options: [
          { text: '7 is the smallest n where 62ⁿ (≈ 3.5 trillion) covers 365 billion URLs', correct: true, why: '62⁶ ≈ 56.8 billion falls short; 62⁷ ≈ 3.5 trillion covers the 10-year estimate with room to spare.' },
          { text: '6 is enough, because 62⁶ is about 56.8 billion', why: '56.8 billion is less than the 365 billion URLs needed over 10 years.' },
          { text: 'Hash functions output exactly 7 characters', why: 'They output more (CRC32 is 8 hex chars, MD5 is 32). That is why the hash has to be shortened.' },
          { text: 'Browsers limit URL paths to 7 characters', why: 'Browsers accept far longer paths. Short codes are short for people, not because of a browser limit.' },
        ],
      },
      {
        question: 'Why use base62 rather than base64 for short codes?',
        options: [
          { text: 'Base64 includes + and /, which have special meaning in URLs and need escaping', correct: true, why: 'Base62 uses only letters and digits, so every code is URL-safe as-is.' },
          { text: 'Base64 holds fewer values per character', why: 'Base64 holds slightly more (64 vs 62). The problem is its symbols, not its capacity.' },
          { text: 'Base64 cannot be decoded back to a number', why: 'Base64 is fully reversible. It is avoided for URL safety, not reversibility.' },
          { text: 'Base62 is required by the HTTP standard', why: 'HTTP does not mandate an alphabet; base62 is a design choice for clean, safe paths.' },
        ],
      },
    ],
  },
  {
    title: 'Approach 1: hash + collision resolution',
    tab: 'collision',
    goal: (
      <>
        Hash the long URL (CRC32, MD5 or SHA-1) and keep the first 7 characters. Different URLs can then share a prefix — a{' '}
        <Term term="hash collision">Two different inputs that produce the same (shortened) hash value, so they would get the same short code.</Term>. The fix: append a predefined string to the long URL and hash again until the code is free.
      </>
    ),
    why: (
      <>
        Checking the database on every attempt is expensive, so a{' '}
        <Term term="Bloom filter">A bit array plus a few hash functions. It answers "definitely not in the set" or "maybe in the set" using very little memory. It never misses a stored item, but can raise false alarms.</Term>{' '}
        answers "definitely not taken" without a DB read. Shorten the codes to 1–2 characters in the lab to make collisions and false positives happen quickly.
      </>
    ),
    takeaway: 'Truncating a hash causes collisions; re-hashing with an appended string resolves them. A Bloom filter trades a few false positives (an extra DB read) for skipping most DB lookups — it never gives false negatives.',
    quiz: [
      {
        question: 'Two different long URLs produce the same first 7 characters. What does the book\'s approach do?',
        options: [
          { text: 'Append a predefined string to the new long URL and hash again, repeating until the code is unused', correct: true, why: 'Changing the input changes the hash, so re-hashing eventually lands on a free code.' },
          { text: 'Overwrite the existing mapping with the new URL', why: 'That silently breaks a link someone already shared.' },
          { text: 'Return an error and ask the user to try again', why: 'Hashing is deterministic: the same URL would collide again. The server must resolve it itself.' },
          { text: 'Give this URL an 8-character code instead', why: 'That is not the book\'s method, and it would make code length vary unpredictably.' },
        ],
      },
      {
        question: 'The Bloom filter says a candidate code is "maybe present". What should happen next?',
        options: [
          { text: 'Read the database to confirm, because it could be a false positive', correct: true, why: '"Maybe" means all its bits are set — possibly by other keys. Only the DB knows for sure.' },
          { text: 'Nothing — "maybe present" means it is definitely taken', why: 'Bloom filters cannot confirm membership; the bits may have been set by other codes.' },
          { text: 'Remove the code from the Bloom filter', why: 'A standard Bloom filter cannot delete: clearing a bit could erase other keys that share it.' },
          { text: 'Rebuild the filter from scratch', why: 'A false positive is expected behaviour, not corruption. Rebuilding would not change the answer.' },
        ],
      },
      {
        question: 'Can the Bloom filter wrongly say "definitely absent" for a code that is already stored?',
        options: [
          { text: 'No — every stored code set all of its bits, so its check always finds them set', correct: true, why: 'Bloom filters have no false negatives. That is why skipping the DB on "absent" is safe.' },
          { text: 'Yes, about as often as it gives false positives', why: 'Errors only go one way: false positives are possible, false negatives are not.' },
          { text: 'Yes, once the filter is more than half full', why: 'A fuller filter raises the false-positive rate, but bits are never cleared, so stored keys are always found.' },
          { text: 'Only if two codes share a bit', why: 'Shared bits cause false positives (extra "maybe"s), never missed keys.' },
        ],
      },
    ],
  },
  {
    title: 'Approach 2: base62 conversion + the shortening flow',
    tab: 'canvas',
    goal: (
      <>
        The book's chosen design: check whether the long URL already exists; if not, get a new ID from a{' '}
        <Term term="unique ID generator">A service that hands out globally unique numbers (Chapter 7, e.g. Snowflake). Each new long URL gets one as its primary key.</Term>, convert that ID to base62, and save (id, shortURL, longURL).
      </>
    ),
    why: 'Generate a short link for the Systems_design URL: the first ID is the book\'s 2009215674938, which becomes "zn9edcu". Shorten the same URL again and no new row appears.',
    changed: {
      before: 'Hash + collision resolution: fixed-length codes, but collisions need re-hashing and existence checks.',
      after: 'Unique ID → base62: no collisions possible, because every ID is unique.',
      reason: 'Uniqueness moves from "search until free" to "the ID is already unique". The cost: the code length grows with the ID, and consecutive IDs make the next code guessable.',
    },
    takeaway: 'Base62 of a unique ID never collides and needs no retries, but it depends on an ID generator and produces predictable, sequential codes.',
    quiz: [
      {
        question: 'In the book\'s shortening flow, what happens first when a long URL arrives?',
        options: [
          { text: 'Check whether the long URL is already in the database, and return its existing short URL if so', correct: true, why: 'This avoids creating many short URLs for the same long URL.' },
          { text: 'Ask the unique ID generator for a new ID', why: 'Only after confirming the long URL is new; otherwise you waste an ID and create a duplicate mapping.' },
          { text: 'Hash the long URL with CRC32', why: 'That is the other approach. The base62 flow does not hash the URL.' },
          { text: 'Look up the short code in the cache', why: 'The cache serves redirects (short → long). Shortening starts from the long URL.' },
        ],
      },
      {
        question: 'Convert 11157 to base62 (0-9, a-z, A-Z). What is the code?',
        options: [
          { text: '2TX', correct: true, why: '11157 = 2×62² + 55×62 + 59 → digits [2, 55, 59] → 2, T, X.' },
          { text: 'XT2', why: 'The division yields remainders from least significant first; you read them bottom-up, so X is last.' },
          { text: '2tx', why: 'Lowercase letters stand for 10–35. 55 and 59 fall in the uppercase range (36–61): T and X.' },
          { text: '2T9', why: 'The last remainder is 59, which maps to X, not the digit 9.' },
        ],
      },
      {
        question: 'Which is a real drawback of base62 conversion of sequential IDs?',
        options: [
          { text: 'The next short URL is easy to guess, which can be a security concern', correct: true, why: 'If IDs increase by 1, anyone can enumerate neighbouring codes.' },
          { text: 'It can produce collisions that need re-hashing', why: 'Each ID is unique, so its base62 form is unique too. Collisions are the hash approach\'s problem.' },
          { text: 'You cannot decode the code back to the ID', why: 'Base62 is a reversible number representation.' },
          { text: 'Codes are always exactly 7 characters', why: 'The opposite: the length is not fixed and grows as IDs get larger.' },
        ],
      },
    ],
  },
  {
    title: 'URL redirecting deep dive: add a cache',
    tab: 'canvas',
    goal: 'Redirects outnumber writes 10:1 and a mapping never changes once created, so <shortURL, longURL> pairs are kept in a cache in front of the database.',
    why: 'Turn the cache on, click links or start the traffic stream, and compare DB reads and the hit ratio with the cache off.',
    changed: {
      before: 'Every redirect reads the database.',
      after: 'Load balancer → web server → cache; only a cache miss reads the database (and fills the cache).',
      reason: 'Hot links are read over and over; answering them from memory keeps DB load low and redirects fast.',
    },
    takeaway: 'Redirect flow: load balancer → web server → cache hit returns the long URL; on a miss, read the DB. If the DB has no row either, the short URL is invalid.',
    quiz: [
      {
        question: 'Why does the book put the <shortURL, longURL> mapping in a cache?',
        options: [
          { text: 'Reads far outnumber writes and mappings never change, so hot entries can be served from memory', correct: true, why: 'A read-heavy, immutable mapping is the ideal cache workload — no invalidation headaches.' },
          { text: 'The cache makes new short URLs durable', why: 'Durability comes from the database. A cache is a fast copy that can be lost.' },
          { text: 'The cache generates the unique IDs', why: 'IDs come from the unique ID generator; the cache only stores lookups.' },
          { text: 'It lets the system return 301 instead of 302', why: 'Redirect codes are independent of server-side caching.' },
        ],
      },
      {
        question: 'A short code is in neither the cache nor the database. What does that most likely mean?',
        options: [
          { text: 'The user entered an invalid short URL', correct: true, why: 'Every valid code has a DB row; a miss in both means it was never created.' },
          { text: 'The cache evicted it, so the server should create a new mapping', why: 'Eviction only removes the cached copy; the DB would still have the row.' },
          { text: 'The Bloom filter gave a false negative', why: 'Bloom filters have no false negatives, and the redirect path does not need one.' },
          { text: 'The browser cached a 301 incorrectly', why: 'If the request reached the server, the browser did not use a cached redirect.' },
        ],
      },
    ],
  },
  {
    title: 'Wrap-up: rate limiting, scaling, analytics',
    tab: 'scale',
    goal: 'The book\'s extra talking points: a rate limiter against abusive shortening, a stateless web tier that scales by adding servers, database replication and sharding, analytics, and availability/consistency/reliability.',
    why: 'Fire a spam burst with and without the rate limiter, then add web servers and read replicas and watch per-node load against the book\'s traffic estimate.',
    changed: {
      before: 'One web server and one database handle everything.',
      after: 'Rate limiter → load balancer → N stateless web servers → cache → primary DB with read replicas; analytics from logged 302 clicks.',
      reason: 'Each piece removes a specific limit: abuse, web CPU, DB reads, and visibility into how links are used.',
    },
    takeaway: 'Because web servers keep no state, you scale them by adding more. Reads that miss the cache go to replicas; writes go to the primary. Analytics depends on seeing clicks, which ties back to 302.',
    quiz: [
      {
        question: 'Why is the web tier easy to scale horizontally?',
        options: [
          { text: 'It is stateless: any server can answer any request, so you just add or remove servers', correct: true, why: 'All mappings live in the cache/DB, so a load balancer can send a request anywhere.' },
          { text: 'Each web server stores its own subset of URLs', why: 'That would make the tier stateful, and requests would have to reach one specific server.' },
          { text: 'It uses 301 redirects', why: 'Redirect type affects how many requests arrive, not how easy servers are to add.' },
          { text: 'The rate limiter spreads load across servers', why: 'A rate limiter rejects abusive traffic; the load balancer spreads load.' },
        ],
      },
      {
        question: 'One IP floods POST api/v1/data/shorten with requests. Which component addresses it?',
        options: [
          { text: 'A rate limiter that filters requests by IP (Chapter 4)', correct: true, why: 'It caps requests per client, so one abuser cannot exhaust IDs or storage.' },
          { text: 'More read replicas', why: 'Replicas add read capacity; this is a write flood.' },
          { text: 'Switching to 301 redirects', why: '301 affects redirect clicks, not requests to create short URLs.' },
          { text: 'A Bloom filter', why: 'A Bloom filter speeds up existence checks; it cannot tell abusive clients from normal ones.' },
        ],
      },
      {
        question: 'Adding read replicas helps most with which traffic?',
        options: [
          { text: 'Redirect lookups that miss the cache', correct: true, why: 'Replicas copy the data and serve reads; cache misses are the reads that reach the DB.' },
          { text: 'Creating new short URLs', why: 'Writes still go to the primary, so replicas do not add write capacity.' },
          { text: 'Redirects served from the browser\'s 301 cache', why: 'Those never reach your servers at all.' },
          { text: 'Cache hits', why: 'Cache hits are answered before the database is touched.' },
        ],
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export const Chapter8UrlShortener: React.FC<Chapter8UrlShortenerProps> = () => {
  // --- Persisted learner state ---
  const [storedStage, setStage] = usePersistentState<number>('chapter8:stage', 1);
  const stage = Math.min(STAGES.length, Math.max(1, Math.round(Number(storedStage) || 1)));
  const [storedTab, setActiveTab] = usePersistentState<Tab>('chapter8:tab', 'canvas');
  const activeTab: Tab = storedTab in TAB_LABELS ? storedTab : 'canvas';
  const [strategy, setStrategy] = usePersistentState<CodeGenStrategy>('chapter8:strategy', 'BASE62_ID');
  const [redirectType, setRedirectTypeRaw] = usePersistentState<RedirectType>('chapter8:redirect', '302_TEMPORARY');
  const [useCache, setUseCache] = usePersistentState<boolean>('chapter8:cache', false);
  const [storageMode, setStorageMode] = usePersistentState<'memory' | 'db'>('chapter8:storage', 'db');
  const [urlDatabase, setUrlDatabase] = usePersistentState<ShortUrlRecord[]>('chapter8:urls', SEED_RECORDS);
  const [nextId, setNextId] = usePersistentState<number>('chapter8:nextId', FIRST_ID);
  const [kgsPool, setKgsPool] = usePersistentState<string[]>('chapter8:kgsPool', []);
  const [kgsUsed, setKgsUsed] = usePersistentState<string[]>('chapter8:kgsUsed', []);
  const [urlsPerDay, setUrlsPerDay] = usePersistentState<number>('chapter8:urlsPerDay', 100_000_000);
  const [webServers, setWebServers] = usePersistentState<number>('chapter8:webServers', 1);
  const [readReplicaCount, setReadReplicaCount] = usePersistentState<number>('chapter8:replicas', 1);
  const [rateLimiterOn, setRateLimiterOn] = usePersistentState<boolean>('chapter8:rateLimiter', false);

  // --- Transient simulation state ---
  const [inputLongUrl, setInputLongUrl] = useState<string>(DEFAULT_LONG_URL);
  const [lastCreate, setLastCreate] = useState<CreateResult | null>(null);
  const [lastLookup, setLastLookup] = useState<{ kind: LookupKind; code: string } | null>(null);
  const [stats, setStats] = useState(EMPTY_STATS);
  const [analytics, setAnalytics] = useState<Record<string, number>>({});
  const [requestLogs, setRequestLogs] = useState<RequestLog[]>([]);
  const [activePacket, setActivePacket] = useState<{ id: string; text: string; badge: string } | null>(null);
  const [isSimulating, setIsSimulating] = useState(false);
  const [trafficRps, setTrafficRps] = useState(100);
  const [tickRates, setTickRates] = useState<{ requests: number; server: number; db: number } | null>(null);
  const [burstResults, setBurstResults] = useState<boolean[] | null>(null);

  const redisRef = useRef(new Set<string>());
  const browserCacheRef = useRef(new Set<string>()); // `${user}|${code}` pairs holding a cached 301
  const rateWindowRef = useRef(new Map<string, number[]>());
  const packetTimer = useRef<number | undefined>(undefined);

  // 301 vs 302 lab
  const [simClicks, setSimClicks] = useState<{ id: number; user: string; hitServer: boolean }[]>([]);
  const [simUsers, setSimUsers] = useState(1);

  // Collision lab (self-contained so short demo codes do not pollute the main table)
  const [labLen, setLabLen] = useState(2);
  const [labRows, setLabRows] = useState<{ code: string; longUrl: string }[]>([]);
  const [labInput, setLabInput] = useState('');
  const [labSampleIdx, setLabSampleIdx] = useState(0);
  const [labLast, setLabLast] = useState<{ longUrl: string; code: string | null; attempts: HashAttempt[]; existing?: boolean } | null>(null);
  const [bloomProbe, setBloomProbe] = useState('');
  const [fpSearchMsg, setFpSearchMsg] = useState<string | null>(null);

  // Base62 playground
  const [base62InputNum, setBase62InputNum] = useState<number>(11157);
  const [base62InputStr, setBase62InputStr] = useState<string>('2TX');

  const currentStage = STAGES[stage - 1];

  const goToStage = (n: number) => {
    const next = Math.min(STAGES.length, Math.max(1, n));
    setStage(next);
    setActiveTab(STAGES[next - 1].tab);
    if (next === 5) setStrategy('HASH_CRC32');
    if (next === 6) setStrategy('BASE62_ID');
    if (next === 7 && !useCache) setUseCache(true);
  };

  const setRedirectType = (t: RedirectType) => {
    setRedirectTypeRaw(t);
    browserCacheRef.current.clear(); // each mode starts with a fresh simulated browser cache
    setSimClicks([]);
    setSimUsers(1);
  };

  const toggleCache = () => {
    if (useCache) redisRef.current.clear();
    setUseCache(!useCache);
  };

  const pushLogs = (logs: RequestLog[]) => {
    if (logs.length) setRequestLogs((prev) => [...logs, ...prev].slice(0, 40));
  };

  const showPacket = (text: string, badge: string) => {
    setActivePacket({ id: Math.random().toString(), text, badge });
    window.clearTimeout(packetTimer.current);
    packetTimer.current = window.setTimeout(() => setActivePacket(null), 2200);
  };

  useEffect(() => () => window.clearTimeout(packetTimer.current), []);

  const rateLimitAllows = (ip: string) => {
    const t = Date.now();
    const recent = (rateWindowRef.current.get(ip) ?? []).filter((x) => t - x < RATE_LIMIT.windowMs);
    const ok = recent.length < RATE_LIMIT.max;
    if (ok) recent.push(t);
    rateWindowRef.current.set(ip, recent);
    return ok;
  };

  // --- Shortening flow ---
  const handleCreateShortUrl = () => {
    const longUrl = inputLongUrl.trim();
    const log = (statusCode: number, note: string, shortCode?: string) =>
      pushLogs([{ id: Math.random().toString(), timestamp: now(), method: 'POST', path: '/api/v1/data/shorten', statusCode, note: shortCode ? `${note} ${shortCode}` : note, latencyMs: 8 }]);

    if (!/^https?:\/\/\S+\.\S+/.test(longUrl)) {
      setLastCreate({ status: 400, message: 'Enter a full URL starting with http:// or https://', steps: [] });
      return;
    }
    if (rateLimiterOn && !rateLimitAllows('203.0.113.7')) {
      setLastCreate({ status: 429, message: `Rate limited: more than ${RATE_LIMIT.max} shorten requests in ${RATE_LIMIT.windowMs / 1000}s from your IP.`, steps: ['Rate limiter rejected the request before it reached the API servers.'] });
      log(429, 'rate limited');
      return;
    }

    const existing = urlDatabase.find((r) => r.longUrl === longUrl);
    if (existing) {
      setLastCreate({
        status: 200,
        code: existing.shortCode,
        message: 'This long URL was shortened before — returning the existing short URL. No new row, no new ID.',
        steps: ['1. Is longURL in the database? Yes.', `2. Return the stored shortURL ${shortUrl(existing.shortCode)}.`],
      });
      log(200, 'existing', existing.shortCode);
      showPacket(`POST → already exists → ${shortUrl(existing.shortCode)}`, '200 OK');
      return;
    }

    const taken = new Map<string, string>(urlDatabase.map((r) => [r.shortCode, r.longUrl]));
    const id = nextId;
    let code: string | null = null;
    let steps: string[] = ['1. Is longURL in the database? No — it is new.'];
    let attempts: HashAttempt[] | undefined;

    if (strategy === 'BASE62_ID') {
      code = encodeBase62(id);
      steps = [...steps, `2. Unique ID generator returns ${id}.`, `3. base62(${id}) = "${code}" (see the Base62 tab for the division steps).`, `4. Save row (id=${id}, shortURL=${code}, longURL).`];
    } else if (strategy === 'HASH_CRC32') {
      const r = resolveHash(longUrl, CODE_LENGTH, taken);
      code = r.code;
      attempts = r.attempts;
      const collisions = r.attempts.filter((a) => a.outcome === 'collision').length;
      steps = [
        ...steps,
        `2. CRC32(longURL) and keep the first ${CODE_LENGTH} characters.`,
        collisions ? `3. ${collisions} collision(s): appended "${PREDEFINED_STRING}" and re-hashed each time.` : '3. No collision on the first try.',
        `4. Save row (id=${id}, shortURL=${code}, longURL). The id is just the primary key here.`,
      ];
    } else {
      const used = new Set([...taken.keys(), ...kgsUsed]);
      const pool = refillKgs(used, kgsPool, 8);
      code = pool[0];
      setKgsPool(pool.slice(1));
      setKgsUsed((u) => [...u, pool[0]].slice(-200));
      steps = [...steps, `2. Take the next unused key from the KGS pool: "${code}" (marked used so it is never handed out again).`, `3. Save row (id=${id}, shortURL=${code}, longURL).`];
    }

    if (!code) {
      setLastCreate({ status: 500, message: 'Could not find a free code after 20 re-hashes.', steps, attempts });
      log(500, 'no free code');
      return;
    }

    const rec: ShortUrlRecord = { id, shortCode: code, longUrl, strategy, userClicks: 0, serverClicks: 0 };
    setUrlDatabase((prev) => [rec, ...prev].slice(0, MAX_STORED_URLS));
    setNextId(id + 1);
    setLastCreate({ status: 201, code, message: `Created ${shortUrl(code)}`, steps, attempts });
    log(201, 'created', code);
    showPacket(`POST api/v1/data/shorten → ${shortUrl(code)}`, '201 Created');
  };

  // --- Redirect flow: browser 301 cache → web server → cache → DB (or in-memory hash table) ---
  const serveRedirect = (code: string, user: string): LookupKind => {
    const key = `${user}|${code}`;
    if (redirectType === '301_PERMANENT' && browserCacheRef.current.has(key)) return 'browser';
    let kind: LookupKind;
    if (storageMode === 'memory') kind = 'memory';
    else if (useCache && redisRef.current.has(code)) kind = 'cache';
    else {
      kind = 'db';
      if (useCache) redisRef.current.add(code);
    }
    if (redirectType === '301_PERMANENT') browserCacheRef.current.add(key);
    return kind;
  };

  const statusCode = redirectType === '301_PERMANENT' ? 301 : 302;

  const handleTestRedirect = (record: ShortUrlRecord) => {
    const kind = serveRedirect(record.shortCode, 'you');
    const reached = kind !== 'browser';
    setUrlDatabase((prev) =>
      prev.map((u) => (u.shortCode === record.shortCode ? { ...u, userClicks: u.userClicks + 1, serverClicks: u.serverClicks + (reached ? 1 : 0) } : u)),
    );
    setStats((s) => ({
      userClicks: s.userClicks + 1,
      serverHits: s.serverHits + (reached ? 1 : 0),
      browserCached: s.browserCached + (reached ? 0 : 1),
      cacheHits: s.cacheHits + (kind === 'cache' ? 1 : 0),
      dbReads: s.dbReads + (kind === 'db' ? 1 : 0),
    }));
    setLastLookup({ kind, code: record.shortCode });

    if (!reached) {
      showPacket(`Browser reused its cached 301 → went straight to ${record.longUrl.slice(0, 36)}…`, 'server never saw this click');
      return;
    }
    const country = COUNTRIES[Math.floor(Math.random() * COUNTRIES.length)];
    setAnalytics((a) => ({ ...a, [country]: (a[country] ?? 0) + 1 }));
    const where = kind === 'cache' ? 'cache hit' : kind === 'db' ? 'DB read' : 'hash table (RAM)';
    pushLogs([{ id: Math.random().toString(), timestamp: now(), method: 'GET', path: `/${record.shortCode}`, statusCode, note: where, latencyMs: LATENCY_MS[kind], country }]);
    showPacket(`GET /${record.shortCode} → ${statusCode} Location: ${record.longUrl.slice(0, 32)}…`, `${where} · ~${LATENCY_MS[kind]}ms`);
  };

  // --- Traffic stream: many users (u0..u39) clicking, hot links more often ---
  useEffect(() => {
    if (!isSimulating || urlDatabase.length === 0) return;
    const timer = window.setTimeout(() => {
      const batch = Math.max(1, Math.round(trafficRps / 2)); // one tick = 0.5 s
      const weights = urlDatabase.map((_, i) => 1 / (i + 1));
      const totalW = weights.reduce((a, b) => a + b, 0);
      const inc = new Map<string, { user: number; server: number }>();
      const s = { ...EMPTY_STATS };
      const byCountry: Record<string, number> = {};
      const logs: RequestLog[] = [];
      for (let n = 0; n < batch; n++) {
        let r = Math.random() * totalW;
        let idx = 0;
        while (idx < weights.length - 1 && r > weights[idx]) r -= weights[idx++];
        const rec = urlDatabase[idx];
        const kind = serveRedirect(rec.shortCode, `u${Math.floor(Math.random() * 40)}`);
        const reached = kind !== 'browser';
        const d = inc.get(rec.shortCode) ?? { user: 0, server: 0 };
        d.user++;
        if (reached) d.server++;
        inc.set(rec.shortCode, d);
        s.userClicks++;
        if (reached) {
          s.serverHits++;
          const country = COUNTRIES[Math.floor(Math.random() * COUNTRIES.length)];
          byCountry[country] = (byCountry[country] ?? 0) + 1;
          if (logs.length < 2)
            logs.push({ id: Math.random().toString(), timestamp: now(), method: 'GET', path: `/${rec.shortCode}`, statusCode, note: kind === 'cache' ? 'cache hit' : kind === 'db' ? 'DB read' : 'hash table (RAM)', latencyMs: LATENCY_MS[kind], country });
        } else s.browserCached++;
        if (kind === 'cache') s.cacheHits++;
        if (kind === 'db') s.dbReads++;
      }
      setUrlDatabase((prev) => prev.map((r) => {
        const d = inc.get(r.shortCode);
        return d ? { ...r, userClicks: r.userClicks + d.user, serverClicks: r.serverClicks + d.server } : r;
      }));
      setStats((p) => ({
        userClicks: p.userClicks + s.userClicks,
        serverHits: p.serverHits + s.serverHits,
        browserCached: p.browserCached + s.browserCached,
        cacheHits: p.cacheHits + s.cacheHits,
        dbReads: p.dbReads + s.dbReads,
      }));
      setAnalytics((a) => {
        const next = { ...a };
        Object.entries(byCountry).forEach(([c, v]) => (next[c] = (next[c] ?? 0) + v));
        return next;
      });
      pushLogs(logs);
      setTickRates({ requests: batch * 2, server: s.serverHits * 2, db: s.dbReads * 2 });
    }, 500);
    return () => window.clearTimeout(timer);
    // serveRedirect reads the current settings; re-running on each change keeps it fresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSimulating, trafficRps, urlDatabase, useCache, redirectType, storageMode]);

  const handleRestartServer = () => {
    redisRef.current.clear();
    if (storageMode === 'memory') {
      setUrlDatabase([]);
      setLastCreate({ status: 503, message: 'Server restarted: the in-memory hash table is empty. Every short link is now broken.', steps: [] });
    } else {
      setLastCreate({ status: 200, message: 'Server restarted: every mapping survived in the database. (The cache starts cold.)', steps: [] });
    }
    setLastLookup(null);
  };

  // --- 301 vs 302 lab ---
  const handleSimClick = (user: string) => {
    const hitServer = redirectType === '302_TEMPORARY' || !simClicks.some((c) => c.user === user && c.hitServer);
    setSimClicks((prev) => [...prev, { id: prev.length + 1, user, hitServer }]);
  };
  const lastSim = simClicks[simClicks.length - 1];
  const simServerCount = simClicks.filter((c) => c.hitServer).length;

  // --- Collision lab ---
  const labTaken = useMemo(() => new Map<string, string>(labRows.map((r) => [r.code, r.longUrl])), [labRows]);
  const labBits = useMemo(() => buildBloom(labRows.map((r) => r.code)), [labRows]);
  const labSetBits = labBits.filter(Boolean).length;
  const estFpRate = Math.pow(labSetBits / BLOOM_BITS, BLOOM_HASHES);

  const labShorten = (url: string) => {
    const longUrl = url.trim();
    if (!longUrl) return;
    const already = labRows.find((r) => r.longUrl === longUrl);
    if (already) {
      setLabLast({ longUrl, code: already.code, attempts: [], existing: true });
      return;
    }
    const r = resolveHash(longUrl, labLen, labTaken);
    if (r.code) setLabRows((prev) => [...prev, { code: r.code as string, longUrl }]);
    setLabLast({ longUrl, code: r.code, attempts: r.attempts });
    setBloomProbe('');
    setFpSearchMsg(null);
  };

  const labNextSample = () => {
    const url = labSampleIdx < LAB_SAMPLES.length ? LAB_SAMPLES[labSampleIdx] : `https://example.com/article/${labSampleIdx}`;
    setLabSampleIdx((i) => i + 1);
    labShorten(url);
  };

  const resetLab = (len = labLen) => {
    setLabLen(len);
    setLabRows([]);
    setLabLast(null);
    setLabSampleIdx(0);
    setBloomProbe('');
    setFpSearchMsg(null);
  };

  const findFalsePositive = () => {
    for (let i = 0; i < 3000; i++) {
      const cand = randomString('0123456789abcdef', labLen);
      if (!labTaken.has(cand) && bloomMaybe(labBits, cand)) {
        setBloomProbe(cand);
        setFpSearchMsg(`Found after ${i + 1} random tries.`);
        return;
      }
    }
    setBloomProbe('');
    setFpSearchMsg('No false positive found in 3,000 tries — the filter is still sparse. Add more URLs to fill more bits.');
  };

  const probeKey = bloomProbe.trim() || (labLast?.code ?? '');
  const probeIdx = probeKey ? bloomIndexes(probeKey) : [];
  const probeMaybe = probeKey ? bloomMaybe(labBits, probeKey) : false;
  const probeStored = probeKey ? labTaken.has(probeKey) : false;

  // --- Estimates / length ---
  const records10y = urlsPerDay * 365 * 10;
  const requiredLen = [1, 2, 3, 4, 5, 6, 7, 8, 9].find((n) => Math.pow(62, n) >= records10y) ?? 9;

  // --- Scale tab numbers ---
  const lookups = stats.cacheHits + stats.dbReads;
  const hitRatio = useCache && lookups > 0 ? stats.cacheHits / lookups : 0;
  const perWeb = (BOOK_READS_PER_SEC + BOOK_WRITES_PER_SEC) / webServers;
  const dbReadsPerSec = BOOK_READS_PER_SEC * (1 - hitRatio);
  const perReplica = dbReadsPerSec / readReplicaCount;
  const analyticsEntries = Object.entries(analytics) as [string, number][];
  const analyticsTotal = analyticsEntries.reduce((a, [, n]) => a + n, 0);

  const handleBurst = () => {
    const results = Array.from({ length: 12 }, () => (rateLimiterOn ? rateLimitAllows('198.51.100.23') : true));
    setBurstResults(results);
    pushLogs(results.map((ok, i) => ({ id: `${Date.now()}-${i}`, timestamp: now(), method: 'POST' as const, path: '/api/v1/data/shorten', statusCode: ok ? 201 : 429, note: ok ? 'burst: allowed' : 'burst: rate limited', latencyMs: ok ? 8 : 0.3 })).reverse());
  };

  const base62Rows = base62Steps(base62InputNum);

  // =========================================================================
  return (
    <div className="space-y-6">
      {/* CHAPTER HERO */}
      <div className={`p-6 sm:p-8 ${panel} text-slate-900 dark:text-white`}>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2 max-w-3xl">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="px-3 py-1 bg-amber-500 text-slate-950 text-xs font-black rounded-full uppercase tracking-wider">Chapter 8</span>
              <span className={`text-xs font-semibold ${amberText}`}>Design a URL shortener (TinyURL-style)</span>
            </div>
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold tracking-tight">Design a URL Shortener</h1>
            <p className={`text-sm leading-relaxed ${muted}`}>
              Turn long URLs into 7-character codes and send clicks back to the original. Follow the book: APIs, redirect codes, the data model, code length,
              two ways to generate codes, the shortening and redirecting flows, and how to scale it.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 shrink-0 p-2.5 rounded-2xl border bg-slate-50 border-slate-200 dark:bg-slate-950/60 dark:border-amber-500/20 max-w-xs">
            {STAGES.map((s, i) => {
              const n = i + 1;
              return (
                <button
                  key={n}
                  onClick={() => goToStage(n)}
                  className={`w-8 h-8 rounded-xl font-mono text-xs font-bold transition-all flex items-center justify-center ${
                    stage === n
                      ? 'bg-amber-500 text-slate-950 shadow-lg scale-105'
                      : stage > n
                      ? 'bg-emerald-100 text-emerald-800 border border-emerald-300 dark:bg-emerald-500/20 dark:text-emerald-300 dark:border-emerald-500/30'
                      : 'text-slate-500 hover:text-slate-900 hover:bg-slate-200 dark:text-slate-400 dark:hover:text-white dark:hover:bg-slate-800'
                  }`}
                  title={`Stage ${n}: ${s.title}`}
                >
                  {n}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* STAGE HEADER + GOAL */}
      <div className={`p-5 ${panel} space-y-4`}>
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-amber-500/10 text-amber-600 dark:text-amber-400 rounded-2xl border border-amber-500/20">
              <Link2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className={`text-base font-bold ${strong}`}>Stage {stage}: {currentStage.title}</h2>
              <p className={`text-xs ${muted}`}>Stage {stage} of {STAGES.length} · lab: {TAB_LABELS[currentStage.tab]}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              disabled={stage === 1}
              onClick={() => goToStage(stage - 1)}
              className="px-3 py-1.5 rounded-xl text-xs font-bold border border-slate-200 text-slate-700 dark:border-slate-700 dark:text-slate-200 transition-all disabled:opacity-40 disabled:cursor-not-allowed hover:bg-amber-500/10"
            >
              ← Previous
            </button>
            <button
              disabled={stage === STAGES.length}
              onClick={() => goToStage(stage + 1)}
              className="px-4 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black rounded-xl text-xs transition-all shadow-md disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Next stage →
            </button>
          </div>
        </div>

        <LessonGoal goal={currentStage.goal} why={currentStage.why} />
        {currentStage.changed && <WhatChanged {...currentStage.changed} />}

        {stage === 1 && (
          <div className={`p-4 ${inset} space-y-3`}>
            <span className={sectionLabel}>Back-of-the-envelope estimate</span>
            <div className="flex flex-wrap items-center gap-2">
              <span className={`text-sm ${muted}`}>New URLs per day:</span>
              {[1e6, 1e7, 1e8, 1e9, 1e10].map((v) => (
                <button key={v} onClick={() => setUrlsPerDay(v)} className={`px-2.5 py-1 rounded-lg border text-xs font-mono font-bold ${choice(urlsPerDay === v)}`}>
                  {v >= 1e9 ? `${v / 1e9}B` : `${v / 1e6}M`}
                  {v === 1e8 ? ' (book)' : ''}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                ['Writes / second', fmtInt(urlsPerDay / 86400), `${fmtInt(urlsPerDay)} ÷ 86,400 s`],
                ['Reads / second', fmtInt((urlsPerDay / 86400) * 10), 'writes × 10 (10:1 ratio)'],
                ['Records in 10 years', fmtInt(records10y), 'per day × 365 × 10'],
                ['Storage (100 B / URL)', fmtBytes(records10y * 100), 'records × 100 bytes'],
              ].map(([label, value, how]) => (
                <div key={label} className="p-3 rounded-xl border bg-white border-slate-200 dark:bg-[#1c1c1e] dark:border-slate-800">
                  <span className={`text-xs ${muted} block`}>{label}</span>
                  <p className={`text-sm font-bold font-mono ${amberText}`}>{value}</p>
                  <span className="text-xs text-slate-500 dark:text-slate-500">{how}</span>
                </div>
              ))}
            </div>
            <p className={`text-xs ${muted}`}>
              Required code length for this volume: <strong className={strong}>{requiredLen} base62 characters</strong> (details in stage 4). The book prints 365 TB for storage;
              365 billion × 100 bytes works out to about 36.5 TB — either way, far more than one server's memory.
            </p>
          </div>
        )}
      </div>

      {/* NAVIGATION TABS */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-2">
        {(Object.keys(TAB_LABELS) as Tab[]).map((t) => {
          const Icon = { canvas: Globe, base62: Sliders, collision: Shield, redirect: MousePointer, scale: BarChart3 }[t];
          return (
            <button
              key={t}
              onClick={() => setActiveTab(t)}
              className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all ${
                activeTab === t
                  ? 'bg-amber-500 text-slate-950 shadow-md'
                  : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-white dark:hover:bg-slate-800'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{TAB_LABELS[t]}</span>
              {currentStage.tab === t && activeTab !== t && <span className="w-2 h-2 rounded-full bg-amber-500" title="This stage's lab" />}
            </button>
          );
        })}
      </div>

      {/* TAB 1: SHORTEN & REDIRECT */}
      {activeTab === 'canvas' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className={`lg:col-span-2 p-6 ${panel} space-y-5`}>
            <div className="flex flex-wrap items-center justify-between gap-2 pb-4 border-b border-slate-200 dark:border-slate-800">
              <h3 className={`text-sm font-bold ${strong}`}>Shortening and redirecting, end to end</h3>
              <div className="flex items-center gap-2 text-xs font-mono">
                <span className="px-2.5 py-1 rounded-full bg-amber-500 text-slate-950 font-bold">
                  {strategy === 'BASE62_ID' ? 'ID + base62' : strategy === 'HASH_CRC32' ? 'CRC32 + collision resolution' : 'KGS'}
                </span>
                <span className="px-2.5 py-1 rounded-full border border-indigo-300 text-indigo-700 dark:border-indigo-500/30 dark:text-indigo-300 font-bold">
                  HTTP {statusCode}
                </span>
              </div>
            </div>

            {/* Shorten form */}
            <div className={`p-4 ${inset} space-y-3`}>
              <span className={`text-xs font-bold ${amberText} block`}>
                1. Create: <code className="font-mono">POST api/v1/data/shorten</code> with <code className="font-mono">{'{ longUrl }'}</code>
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <input
                  type="text"
                  value={inputLongUrl}
                  onChange={(e) => setInputLongUrl(e.target.value)}
                  placeholder="https://..."
                  className="sm:col-span-2 w-full px-3 py-2 rounded-xl text-xs font-mono border focus:outline-hidden bg-white border-slate-200 text-slate-900 dark:bg-[#1c1c1e] dark:border-slate-800 dark:text-white"
                />
                <button
                  onClick={handleCreateShortUrl}
                  className="w-full py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black rounded-xl text-xs shadow-md flex items-center justify-center gap-1"
                >
                  <Plus className="w-4 h-4" />
                  <span>Shorten</span>
                </button>
              </div>

              {lastCreate && (
                <div className="space-y-2 text-xs">
                  <p className={lastCreate.status < 300 ? emeraldText : roseText}>
                    <span className="font-mono font-bold mr-2">{lastCreate.status}</span>
                    {lastCreate.message}
                  </p>
                  {lastCreate.steps.length > 0 && (
                    <ol className={`space-y-0.5 ${muted}`}>
                      {lastCreate.steps.map((s) => <li key={s}>{s}</li>)}
                    </ol>
                  )}
                  {lastCreate.attempts && <AttemptsTable attempts={lastCreate.attempts} len={CODE_LENGTH} />}
                </div>
              )}
            </div>

            <AnimatePresence>
              {activePacket && (
                <motion.div
                  key={activePacket.id}
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                  className="px-4 py-2 bg-amber-500 text-slate-950 rounded-2xl text-xs font-bold shadow-xl flex flex-wrap items-center justify-between gap-2"
                >
                  <span className="flex items-center gap-2 font-mono">
                    <Zap className="w-4 h-4" />
                    {activePacket.text}
                  </span>
                  <span className="text-xs bg-slate-950 text-amber-300 px-2 py-0.5 rounded">{activePacket.badge}</span>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Redirect path diagram */}
            <div className={`p-4 ${inset} space-y-2`}>
              <span className={sectionLabel}>2. Redirect path of the last click</span>
              <svg viewBox="0 0 500 175" className="w-full max-w-2xl text-slate-700 dark:text-slate-300" role="img"
                aria-label="Path of the last redirect: browser to web servers, then cache, then database on a miss">
                {(() => {
                  const k = lastLookup?.kind;
                  const reached = !!k && k !== 'browser';
                  return (
                    <>
                      <Node x={5} y={66} w={110} label="Browser" sub={k === 'browser' ? 'used cached 301' : 'GET /code'} highlight={k === 'browser'} />
                      <Node x={170} y={66} w={130} label="LB + web servers" sub="stateless" highlight={reached} />
                      <Node x={360} y={8} w={135} label="Cache" sub={useCache ? '<short, long>' : 'off'} dashed={!useCache || storageMode === 'memory'} highlight={k === 'cache'} />
                      <Node x={360} y={124} w={135} label={storageMode === 'memory' ? 'Hash table (RAM)' : 'Database'} sub={storageMode === 'memory' ? 'lost on restart' : 'id, shortURL, longURL'} highlight={k === 'db' || k === 'memory'} />
                      <g className="text-indigo-600 dark:text-indigo-300">
                        <Arrow x1={115} y1={87} x2={168} y2={87} lx={142} ly={80} label="GET" active={reached} />
                        <Arrow x1={300} y1={78} x2={358} y2={34} lx={318} ly={46} label="1. check" active={reached && useCache && storageMode === 'db'} />
                        <Arrow x1={300} y1={96} x2={358} y2={140} lx={318} ly={134} label={storageMode === 'memory' ? 'get()' : '2. read on miss'} active={k === 'db' || k === 'memory'} />
                      </g>
                    </>
                  );
                })()}
              </svg>
              <p className={`text-xs ${muted}`}>
                {!lastLookup && 'Click "Test click" on a row below to trace a redirect.'}
                {lastLookup?.kind === 'browser' && `The browser had a cached 301 for /${lastLookup.code}, so it went straight to the long URL. Nothing on the right was touched — and nothing was logged.`}
                {lastLookup?.kind === 'cache' && `Cache hit for /${lastLookup.code}: answered from memory, no DB read.`}
                {lastLookup?.kind === 'db' && `/${lastLookup.code} was ${useCache ? 'not in the cache, so the DB was read and the cache filled' : 'read from the DB (no cache)'}.`}
                {lastLookup?.kind === 'memory' && `/${lastLookup.code} was found in the in-memory hash table.`}
                {' '}Latencies shown are illustrative.
              </p>
            </div>

            {/* Mappings table */}
            <div className="space-y-2">
              <span className={sectionLabel}>3. Stored mappings — <code className="font-mono normal-case">GET api/v1/{'{shortUrl}'}</code> via "Test click"</span>
              <div className="overflow-x-auto max-h-[260px] overflow-y-auto">
                <table className="w-full text-xs text-left">
                  <thead className="sticky top-0 bg-white dark:bg-[#1c1c1e]">
                    <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                      <th className="p-2">id</th>
                      <th className="p-2">shortURL</th>
                      <th className="p-2">longURL</th>
                      <th className="p-2" title="clicks the server saw / clicks users made">server / user clicks</th>
                      <th className="p-2"></th>
                    </tr>
                  </thead>
                  <tbody className="text-slate-800 dark:text-slate-200">
                    {urlDatabase.map((rec) => (
                      <tr key={rec.shortCode} className="border-b border-slate-200/60 dark:border-slate-800/60">
                        <td className="p-2 font-mono text-slate-500 dark:text-slate-400">{rec.id}</td>
                        <td className="p-2 font-mono font-bold whitespace-nowrap">
                          <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 dark:bg-amber-500/15 dark:text-amber-300">{rec.shortCode}</span>
                        </td>
                        <td className="p-2 font-mono max-w-[240px] truncate" title={rec.longUrl}>{rec.longUrl}</td>
                        <td className="p-2 font-mono">
                          <span className={rec.serverClicks < rec.userClicks ? roseText : ''}>{rec.serverClicks}</span> / {rec.userClicks}
                        </td>
                        <td className="p-2">
                          <button
                            onClick={() => handleTestRedirect(rec)}
                            className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg flex items-center gap-1 whitespace-nowrap"
                          >
                            <ExternalLink className="w-3 h-3" /> Test click
                          </button>
                        </td>
                      </tr>
                    ))}
                    {urlDatabase.length === 0 && (
                      <tr>
                        <td colSpan={5} className={`p-4 text-center ${muted}`}>
                          No mappings.{' '}
                          <button onClick={() => setUrlDatabase(SEED_RECORDS)} className={`underline ${amberText}`}>Restore sample links</button>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <p className={`text-xs ${muted}`}>
                A red server count means clicks happened that the server never saw (cached 301). The table keeps the newest {MAX_STORED_URLS} links.
              </p>
            </div>

            {/* Metrics (all computed from this session) */}
            <div className="pt-4 border-t border-slate-200 dark:border-slate-800 grid grid-cols-2 sm:grid-cols-5 gap-3">
              {[
                ['Links stored', urlDatabase.length.toLocaleString(), amberText],
                ['User clicks', stats.userClicks.toLocaleString(), emeraldText],
                ['Reached server', stats.serverHits.toLocaleString(), stats.serverHits < stats.userClicks ? roseText : emeraldText],
                ['Cache hit ratio', useCache && lookups ? `${(hitRatio * 100).toFixed(1)}%` : '—', indigoText],
                ['DB reads', stats.dbReads.toLocaleString(), strong],
              ].map(([label, value, tone]) => (
                <div key={label} className={`p-3 ${inset}`}>
                  <span className={`text-xs ${muted} block`}>{label}</span>
                  <p className={`text-sm font-bold font-mono ${tone}`}>{value}</p>
                </div>
              ))}
            </div>
            {isSimulating && tickRates && (
              <p className={`text-xs ${muted}`}>
                Live: <strong className={strong}>{tickRates.requests.toLocaleString()}</strong> clicks/s from users →{' '}
                <strong className={strong}>{tickRates.server.toLocaleString()}</strong> reached servers →{' '}
                <strong className={strong}>{tickRates.db.toLocaleString()}</strong> DB reads/s.
              </p>
            )}
          </div>

          {/* Controls */}
          <div className={`p-6 ${panel} space-y-5`}>
            <div className="flex items-center gap-2 pb-3 border-b border-slate-200 dark:border-slate-800">
              <Sliders className="w-4 h-4 text-amber-500" />
              <h3 className={`text-sm font-bold ${strong}`}>Architecture controls</h3>
            </div>

            <div className="space-y-2">
              <span className={sectionLabel}>Short code generation</span>
              {[
                { type: 'BASE62_ID' as CodeGenStrategy, label: 'Unique ID + base62', desc: 'The book\'s choice. No collisions; codes are sequential.' },
                { type: 'HASH_CRC32' as CodeGenStrategy, label: 'Hash (CRC32) + collision resolution', desc: 'First 7 chars of the hash; re-hash on collision.' },
                { type: 'KGS' as CodeGenStrategy, label: 'Key Generation Service', desc: 'Beyond the book: hands out pre-generated, never-used keys.' },
              ].map((s) => (
                <button key={s.type} onClick={() => setStrategy(s.type)} className={`w-full p-2.5 rounded-xl border text-left transition-all ${choice(strategy === s.type)}`}>
                  <div className="text-xs font-bold">{s.label}</div>
                  <div className="text-xs opacity-80">{s.desc}</div>
                </button>
              ))}
              {strategy === 'KGS' && (
                <p className={`text-xs ${muted}`}>
                  Next keys in pool: <span className="font-mono">{kgsPool.slice(0, 4).join(', ') || '(filled on first request)'}</span> · {kgsUsed.length} handed out.
                </p>
              )}
            </div>

            <div className="space-y-2 pt-3 border-t border-slate-200 dark:border-slate-800">
              <span className={sectionLabel}>Where mappings live</span>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => setStorageMode('memory')} className={`p-2 rounded-xl border text-xs font-bold ${choice(storageMode === 'memory')}`}>In-memory hash table</button>
                <button onClick={() => setStorageMode('db')} className={`p-2 rounded-xl border text-xs font-bold ${choice(storageMode === 'db')}`}>Relational database</button>
              </div>
              <button onClick={handleRestartServer} className="w-full py-2 rounded-xl text-xs font-bold border border-rose-300 text-rose-700 hover:bg-rose-50 dark:border-rose-500/40 dark:text-rose-300 dark:hover:bg-rose-500/10 flex items-center justify-center gap-1">
                <RotateCcw className="w-3.5 h-3.5" /> Restart server
              </button>
            </div>

            <div className="space-y-2 pt-3 border-t border-slate-200 dark:border-slate-800">
              <div className="flex items-center justify-between">
                <span className={`text-xs font-bold ${strong}`}>Cache in front of the DB</span>
                <button
                  onClick={toggleCache}
                  disabled={storageMode === 'memory'}
                  className={`px-3 py-1 rounded-full text-xs font-bold transition-all disabled:opacity-40 ${useCache ? 'bg-emerald-500 text-slate-950' : toggleOff}`}
                >
                  {useCache ? 'On' : 'Off'}
                </button>
              </div>
              {storageMode === 'memory' && <p className={`text-xs ${muted}`}>Everything is already in RAM, so a cache adds nothing here.</p>}
            </div>

            <div className="space-y-2 pt-3 border-t border-slate-200 dark:border-slate-800">
              <span className={sectionLabel}>Redirect status</span>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => setRedirectType('301_PERMANENT')} className={`p-2 rounded-xl border text-xs font-bold ${choice(redirectType === '301_PERMANENT')}`}>301 Permanent</button>
                <button onClick={() => setRedirectType('302_TEMPORARY')} className={`p-2 rounded-xl border text-xs font-bold ${choice(redirectType === '302_TEMPORARY')}`}>302 Found</button>
              </div>
            </div>

            <div className="space-y-3 pt-3 border-t border-slate-200 dark:border-slate-800">
              <div className="flex items-center justify-between text-xs font-bold">
                <span className={strong}>Traffic stream (40 simulated users)</span>
                <span className={`font-mono ${amberText}`}>{trafficRps} clicks/s</span>
              </div>
              <input type="range" min={10} max={500} step={10} value={trafficRps} onChange={(e) => setTrafficRps(Number(e.target.value))} className="w-full accent-amber-500" />
              <button
                onClick={() => setIsSimulating(!isSimulating)}
                disabled={urlDatabase.length === 0}
                className={`w-full py-2.5 rounded-xl text-xs font-bold shadow-md flex items-center justify-center gap-1 text-white disabled:opacity-40 ${
                  isSimulating ? 'bg-rose-600 hover:bg-rose-500' : 'bg-emerald-600 hover:bg-emerald-500'
                }`}
              >
                {isSimulating ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                <span>{isSimulating ? 'Pause traffic' : 'Start traffic'}</span>
              </button>
              <button onClick={() => { setStats(EMPTY_STATS); setAnalytics({}); setTickRates(null); }} className={`w-full py-1.5 rounded-xl text-xs font-bold ${toggleOff}`}>
                Reset counters
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: BASE62 & CODE LENGTH */}
      {activeTab === 'base62' && (
        <div className={`p-6 ${panel} space-y-6`}>
          <div className="flex items-center gap-3 pb-4 border-b border-slate-200 dark:border-slate-800">
            <div className="p-2.5 bg-indigo-500/10 text-indigo-600 dark:text-indigo-300 rounded-2xl border border-indigo-500/20">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <h3 className={`text-base font-bold ${strong}`}>Base62: code length and conversion</h3>
              <p className={`text-xs ${muted}`}>How many characters are needed, and how a number becomes a short code.</p>
            </div>
          </div>

          {/* Length table (book Table 8-1) */}
          <div className="space-y-3">
            <span className={sectionLabel}>Code length n vs. URLs it can hold (62ⁿ)</span>
            <div className="flex flex-wrap items-center gap-2">
              <span className={`text-xs ${muted}`}>Must hold {fmtInt(records10y)} URLs (10 years at</span>
              {[1e6, 1e7, 1e8, 1e9, 1e10].map((v) => (
                <button key={v} onClick={() => setUrlsPerDay(v)} className={`px-2 py-0.5 rounded-lg border text-xs font-mono font-bold ${choice(urlsPerDay === v)}`}>
                  {v >= 1e9 ? `${v / 1e9}B` : `${v / 1e6}M`}
                </button>
              ))}
              <span className={`text-xs ${muted}`}>per day)</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                    <th className="p-2">n</th>
                    <th className="p-2">62ⁿ codes</th>
                    <th className="p-2">Enough?</th>
                  </tr>
                </thead>
                <tbody className="text-slate-800 dark:text-slate-200">
                  {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => {
                    const cap = Math.pow(62, n);
                    const ok = cap >= records10y;
                    return (
                      <tr key={n} className={`border-b border-slate-200/60 dark:border-slate-800/60 ${n === requiredLen ? 'bg-amber-50 dark:bg-amber-500/10' : ''}`}>
                        <td className="p-2 font-mono font-bold">{n}</td>
                        <td className="p-2 font-mono">{fmtInt(cap)}</td>
                        <td className={`p-2 ${ok ? emeraldText : roseText}`}>
                          {ok ? (n === requiredLen ? 'Yes — smallest that fits' : 'Yes') : 'No'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Converter with full repeated division */}
            <div className={`p-5 ${inset} space-y-4`}>
              <span className={`text-xs font-bold uppercase tracking-wider ${amberText} block`}>Converter: ID (base 10) ↔ short code (base 62)</span>
              <div className="flex flex-wrap gap-2">
                {[
                  ['Book: 11157', 11157],
                  ['Book: 2009215674938', FIRST_ID],
                ].map(([label, v]) => (
                  <button
                    key={label}
                    onClick={() => { setBase62InputNum(v as number); setBase62InputStr(encodeBase62(v as number)); }}
                    className={`px-2.5 py-1 rounded-lg border text-xs font-mono ${choice(base62InputNum === v)}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="space-y-3">
                <label className={`text-xs ${muted} block`}>
                  ID from the unique ID generator
                  <input
                    type="number"
                    min={0}
                    value={base62InputNum}
                    onChange={(e) => {
                      const val = Math.min(Number.MAX_SAFE_INTEGER, Math.max(0, Math.floor(Number(e.target.value) || 0)));
                      setBase62InputNum(val);
                      setBase62InputStr(encodeBase62(val));
                    }}
                    className="mt-1 w-full px-3 py-2 rounded-xl text-xs font-mono border focus:outline-hidden bg-white border-slate-200 text-slate-900 dark:bg-[#1c1c1e] dark:border-slate-800 dark:text-white"
                  />
                </label>
                <label className={`text-xs ${muted} block`}>
                  Short code
                  <input
                    type="text"
                    value={base62InputStr}
                    onChange={(e) => {
                      const str = e.target.value.trim();
                      setBase62InputStr(str);
                      const n = decodeBase62(str);
                      if (n !== null && n <= Number.MAX_SAFE_INTEGER) setBase62InputNum(n);
                    }}
                    className="mt-1 w-full px-3 py-2 rounded-xl text-xs font-mono font-bold border focus:outline-hidden bg-white border-slate-200 text-amber-700 dark:bg-[#1c1c1e] dark:border-slate-800 dark:text-amber-400"
                  />
                </label>
                {decodeBase62(base62InputStr) === null && <p className={`text-xs ${roseText}`}>Only 0-9, a-z and A-Z are valid base62 characters.</p>}
              </div>

              <div className="p-3 rounded-xl bg-white border border-slate-200 dark:bg-[#1c1c1e] dark:border-slate-800 text-xs space-y-1">
                <p className={`font-semibold ${strong}`}>Repeated division by 62 (remainder → character):</p>
                {base62Rows.length === 0 && <p className="font-mono">0 → '0'</p>}
                {base62Rows.map((r, i) => (
                  <p key={i} className="font-mono text-slate-700 dark:text-slate-300">
                    {r.dividend.toLocaleString()} ÷ 62 = {r.quotient.toLocaleString()} remainder <strong>{r.remainder}</strong> → '<strong className={amberText}>{r.char}</strong>'
                  </p>
                ))}
                {base62Rows.length > 0 && (
                  <p className={muted}>
                    Read the characters bottom-up: <strong className={`font-mono ${amberText}`}>{base62Rows.map((r) => r.char).reverse().join('')}</strong>{' '}
                    ({base62Rows.length} characters). As IDs grow, codes get longer — base62 length is not fixed.
                  </p>
                )}
              </div>
            </div>

            {/* Alphabet */}
            <div className={`p-5 ${inset} space-y-3`}>
              <span className={sectionLabel}>The 62 characters and their values</span>
              <div className="grid grid-cols-8 sm:grid-cols-10 gap-1">
                {BASE62_ALPHABET.split('').map((char, idx) => (
                  <span
                    key={char}
                    className={`px-1 py-1 rounded text-center font-mono text-xs ${
                      base62InputStr.includes(char)
                        ? 'bg-amber-500 text-slate-950 font-black'
                        : 'bg-white border border-slate-200 text-slate-700 dark:bg-slate-900 dark:border-slate-800 dark:text-slate-300'
                    }`}
                    title={`${idx} → '${char}'`}
                  >
                    {char}
                    <span className="block text-[11px] opacity-70">{idx}</span>
                  </span>
                ))}
              </div>
              <div className={`space-y-1 text-xs ${muted} pt-2 border-t border-slate-200 dark:border-slate-800`}>
                <p>Why not base64? It adds <span className={`font-mono font-bold ${roseText}`}>+ /</span>, which have special meaning in URLs and need percent-encoding.</p>
                <p>Why not hex? 16 characters only: 7 hex characters hold about 268 million codes, not 3.5 trillion.</p>
              </div>
            </div>
          </div>

          <div className="space-y-3 pt-4 border-t border-slate-200 dark:border-slate-800">
            <span className={sectionLabel}>Alphabet comparison at 7 characters</span>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                    <th className="p-2">Encoding</th>
                    <th className="p-2">Alphabet</th>
                    <th className="p-2">7-char capacity</th>
                    <th className="p-2">URL-safe?</th>
                  </tr>
                </thead>
                <tbody className="text-slate-800 dark:text-slate-200">
                  <tr className="border-b border-slate-200/60 dark:border-slate-800/60">
                    <td className={`p-2 font-bold ${amberText}`}>Base62</td>
                    <td className="p-2">62 (0-9, a-z, A-Z)</td>
                    <td className={`p-2 font-mono ${emeraldText}`}>{fmtInt(Math.pow(62, 7))}</td>
                    <td className={`p-2 ${emeraldText}`}>Yes</td>
                  </tr>
                  <tr className="border-b border-slate-200/60 dark:border-slate-800/60">
                    <td className="p-2">Hexadecimal</td>
                    <td className="p-2">16 (0-9, a-f)</td>
                    <td className={`p-2 font-mono ${roseText}`}>{fmtInt(Math.pow(16, 7))}</td>
                    <td className={`p-2 ${emeraldText}`}>Yes, but too small</td>
                  </tr>
                  <tr className="border-b border-slate-200/60 dark:border-slate-800/60">
                    <td className="p-2">Base64</td>
                    <td className="p-2">64 (adds + and /)</td>
                    <td className="p-2 font-mono">{fmtInt(Math.pow(64, 7))}</td>
                    <td className={`p-2 ${roseText}`}>No — + and / need escaping</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: HASH COLLISIONS & BLOOM FILTER */}
      {activeTab === 'collision' && (
        <div className={`p-6 ${panel} space-y-6`}>
          <div className="flex items-center gap-3 pb-4 border-b border-slate-200 dark:border-slate-800">
            <div className="p-2.5 bg-rose-500/10 text-rose-600 dark:text-rose-400 rounded-2xl border border-rose-500/20">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <h3 className={`text-base font-bold ${strong}`}>Hash + collision resolution, with a Bloom filter</h3>
              <p className={`text-xs ${muted}`}>
                Real CRC32 (e.g. CRC32 of the book's Systems_design URL is <span className="font-mono">{crc32Hex(DEFAULT_LONG_URL)}</span>, 8 hex chars — too long, so it is truncated).
              </p>
            </div>
          </div>

          <div className={`p-4 ${inset} space-y-3`}>
            <div className="flex flex-wrap items-center gap-2">
              <span className={`text-xs font-bold ${strong}`}>Characters kept from the hash:</span>
              {[1, 2, 7].map((n) => (
                <button key={n} onClick={() => resetLab(n)} className={`px-2.5 py-1 rounded-lg border text-xs font-bold ${choice(labLen === n)}`}>
                  {n === 7 ? '7 (book)' : `${n} (demo: ${Math.pow(16, n)} codes)`}
                </button>
              ))}
              <button onClick={() => resetLab()} className={`ml-auto px-2.5 py-1 rounded-lg text-xs font-bold ${toggleOff}`}>Reset lab</button>
            </div>
            <p className={`text-xs ${muted}`}>
              With 7 hex characters there are 268 million codes, so collisions are rare in a small demo. Keep 1–2 characters to see collisions and re-hashing right away. (Changing this empties the lab table.)
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
              <input
                value={labInput}
                onChange={(e) => setLabInput(e.target.value)}
                placeholder="Type a long URL…"
                className="sm:col-span-2 px-3 py-2 rounded-xl text-xs font-mono border bg-white border-slate-200 text-slate-900 dark:bg-[#1c1c1e] dark:border-slate-800 dark:text-white"
              />
              <button onClick={() => labShorten(labInput)} className="py-2 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950">Shorten it</button>
              <button onClick={labNextSample} className="py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white">Shorten next sample URL</button>
            </div>

            {labLast && (
              <div className="space-y-2 text-xs">
                <p className={muted}>
                  <span className="font-mono">{labLast.longUrl}</span> →{' '}
                  {labLast.existing ? (
                    <span className={emeraldText}>already stored as "{labLast.code}" (same long URL → same code, not a collision)</span>
                  ) : labLast.code ? (
                    <span className={emeraldText}>stored as "<span className="font-mono font-bold">{labLast.code}</span>"</span>
                  ) : (
                    <span className={roseText}>no free code after 20 re-hashes — the code space is nearly full. Use more characters.</span>
                  )}
                </p>
                {labLast.attempts.length > 0 && <AttemptsTable attempts={labLast.attempts} len={labLen} />}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Lab table */}
            <div className={`p-4 ${inset} space-y-2`}>
              <span className={sectionLabel}>Lab table ({labRows.length} rows) — duplicates are never inserted</span>
              <div className="max-h-[260px] overflow-y-auto">
                <table className="w-full text-xs text-left">
                  <tbody className="text-slate-800 dark:text-slate-200">
                    {labRows.map((r) => (
                      <tr key={r.code} className="border-b border-slate-200/60 dark:border-slate-800/60">
                        <td className="p-1.5 font-mono font-bold w-16">{r.code}</td>
                        <td className="p-1.5 font-mono truncate max-w-[260px]" title={r.longUrl}>{r.longUrl}</td>
                      </tr>
                    ))}
                    {labRows.length === 0 && (
                      <tr><td className={`p-3 ${muted}`}>Empty. Shorten a few sample URLs.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Bloom filter */}
            <div className={`p-4 ${inset} space-y-3`}>
              <div className="flex items-center gap-2">
                <Filter className={`w-4 h-4 ${indigoText}`} />
                <span className={sectionLabel}>Bloom filter over the lab table: {BLOOM_BITS} bits, {BLOOM_HASHES} hashes</span>
              </div>
              <div className="grid grid-cols-16 gap-0.5" style={{ gridTemplateColumns: 'repeat(16, minmax(0, 1fr))' }} role="img"
                aria-label={`Bloom filter bit array: ${labSetBits} of ${BLOOM_BITS} bits set`}>
                {labBits.map((on, i) => {
                  const probed = probeIdx.includes(i);
                  return (
                    <div
                      key={i}
                      title={`bit ${i}: ${on ? 1 : 0}`}
                      className={`aspect-square rounded-sm text-[11px] flex items-center justify-center font-mono ${
                        on ? 'bg-indigo-500 text-white' : 'bg-white border border-slate-200 text-slate-400 dark:bg-slate-900 dark:border-slate-800 dark:text-slate-600'
                      } ${probed ? 'ring-2 ring-amber-500 ring-offset-1 ring-offset-slate-50 dark:ring-offset-slate-950' : ''}`}
                    >
                      {on ? 1 : 0}
                    </div>
                  );
                })}
              </div>
              <p className={`text-xs ${muted}`}>
                {labSetBits} of {BLOOM_BITS} bits set → estimated false-positive rate ≈ ({labSetBits}/{BLOOM_BITS})³ = <strong className={strong}>{(estFpRate * 100).toFixed(1)}%</strong>. More rows fill more bits, so false positives rise.
              </p>

              <div className="flex flex-wrap gap-2">
                <input
                  value={bloomProbe}
                  onChange={(e) => { setBloomProbe(e.target.value); setFpSearchMsg(null); }}
                  placeholder={labLast?.code ? `probe (default: ${labLast.code})` : 'probe a code…'}
                  className="flex-1 min-w-[120px] px-3 py-1.5 rounded-xl text-xs font-mono border bg-white border-slate-200 text-slate-900 dark:bg-[#1c1c1e] dark:border-slate-800 dark:text-white"
                />
                <button onClick={findFalsePositive} disabled={labRows.length === 0} className="px-3 py-1.5 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white flex items-center gap-1 disabled:opacity-40">
                  <Search className="w-3.5 h-3.5" /> Find a false positive
                </button>
              </div>
              {fpSearchMsg && <p className={`text-xs ${muted}`}>{fpSearchMsg}</p>}
              {probeKey && (
                <div className="text-xs space-y-1">
                  <p className={muted}>
                    "<span className="font-mono">{probeKey}</span>" checks bits <span className="font-mono">{probeIdx.join(', ')}</span> (outlined).
                  </p>
                  <p>
                    Filter says:{' '}
                    {probeMaybe ? <strong className={amberText}>maybe present</strong> : <strong className={emeraldText}>definitely absent — skip the DB</strong>}
                    {' · '}Table says: {probeStored ? <strong className={strong}>stored</strong> : <strong className={strong}>not stored</strong>}
                  </p>
                  {probeMaybe && !probeStored && (
                    <p className={`font-bold ${indigoText}`}>False positive: every bit was set by other codes. The DB read confirms it is free — one wasted lookup.</p>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Table 8-3 comparison */}
          <div className="space-y-3 pt-4 border-t border-slate-200 dark:border-slate-800">
            <span className={sectionLabel}>Hash + collision resolution vs. base62 conversion</span>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                    <th className="p-2">Hash + collision resolution</th>
                    <th className="p-2">Base62 conversion</th>
                  </tr>
                </thead>
                <tbody className="text-slate-800 dark:text-slate-200">
                  {[
                    ['Fixed code length', 'Length grows with the ID'],
                    ['No unique ID generator needed', 'Depends on a unique ID generator'],
                    ['Collisions possible; must be resolved (re-hash + existence checks)', 'No collisions: every ID is unique'],
                    ['Next code cannot be guessed (does not depend on an ID)', 'Next code is easy to guess if IDs go up by 1 — a possible security concern'],
                  ].map(([a, b]) => (
                    <tr key={a} className="border-b border-slate-200/60 dark:border-slate-800/60">
                      <td className="p-2">{a}</td>
                      <td className="p-2">{b}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className={`text-xs ${muted}`}>
              Beyond the book: a Key Generation Service (selectable on the first tab) pre-generates unused random keys, avoiding both runtime collision checks and guessable codes, at the cost of running another service.
            </p>
          </div>
        </div>
      )}

      {/* TAB 4: 301 VS 302 */}
      {activeTab === 'redirect' && (
        <div className={`p-6 ${panel} space-y-6`}>
          <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-200 dark:border-slate-800">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-2xl border border-emerald-500/20">
                <MousePointer className="w-5 h-5" />
              </div>
              <div>
                <h3 className={`text-base font-bold ${strong}`}>301 Moved Permanently vs 302 Found</h3>
                <p className={`text-xs ${muted}`}>Who gets the request when a user clicks the same short link again?</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => setRedirectType('301_PERMANENT')} className={`px-3 py-1.5 rounded-xl border text-xs font-bold ${choice(redirectType === '301_PERMANENT')}`}>Server returns 301</button>
              <button onClick={() => setRedirectType('302_TEMPORARY')} className={`px-3 py-1.5 rounded-xl border text-xs font-bold ${choice(redirectType === '302_TEMPORARY')}`}>Server returns 302</button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className={`p-5 ${inset} space-y-4`}>
              <div className="flex flex-wrap gap-2">
                <button onClick={() => handleSimClick('User 1')} className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs flex items-center gap-1">
                  <MousePointer className="w-3.5 h-3.5" /> User 1 clicks
                </button>
                <button
                  onClick={() => { const u = `User ${simUsers + 1}`; setSimUsers((n) => n + 1); handleSimClick(u); }}
                  className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl text-xs"
                >
                  A new user clicks
                </button>
                <button onClick={() => { setSimClicks([]); setSimUsers(1); }} className={`px-3 py-1.5 rounded-xl text-xs font-bold ${toggleOff}`}>Clear</button>
              </div>

              <svg viewBox="0 0 500 150" className="w-full text-slate-700 dark:text-slate-300" role="img"
                aria-label="Request path of the last click: browser, shortener server, long URL server">
                <Node x={5} y={54} w={110} label="Browser" sub={lastSim && !lastSim.hitServer ? 'cached 301' : lastSim?.user} highlight={!!lastSim} />
                <Node x={195} y={4} w={130} label="Shortener" sub="tinyurl.com" highlight={!!lastSim?.hitServer} />
                <Node x={385} y={54} w={110} label="Long URL site" highlight={!!lastSim} />
                <g className="text-emerald-600 dark:text-emerald-400">
                  <Arrow x1={90} y1={54} x2={200} y2={30} lx={118} ly={30} label="1. GET /zn9edcu" active={!!lastSim?.hitServer} />
                  <Arrow x1={210} y1={46} x2={110} y2={70} lx={172} ly={74} label={`2. ${statusCode} + Location`} active={!!lastSim?.hitServer} />
                  <Arrow x1={115} y1={96} x2={383} y2={96} lx={250} ly={116} label="3. GET long URL" active={!!lastSim} />
                </g>
              </svg>
              <p className={`text-xs ${muted}`}>
                {!lastSim && 'Click a button to send a click.'}
                {lastSim && lastSim.hitServer && `${lastSim.user}'s click went through the shortener (steps 1–3) and was logged.`}
                {lastSim && !lastSim.hitServer && `${lastSim.user}'s browser remembered the 301 and skipped steps 1–2. The shortener never saw this click.`}
              </p>

              <div className="space-y-1.5 max-h-[200px] overflow-y-auto pr-1">
                {simClicks.map((clk) => (
                  <div
                    key={clk.id}
                    className={`p-2 rounded-xl border flex items-center justify-between text-xs ${
                      clk.hitServer
                        ? 'bg-amber-50 border-amber-200 text-amber-900 dark:bg-amber-500/10 dark:border-amber-500/30 dark:text-amber-300'
                        : 'bg-slate-100 border-slate-200 text-slate-600 dark:bg-slate-800/60 dark:border-slate-700 dark:text-slate-400'
                    }`}
                  >
                    <span className="font-mono">#{clk.id} {clk.user}</span>
                    <span>{clk.hitServer ? 'reached server · logged' : 'browser cache · not logged'}</span>
                  </div>
                ))}
              </div>
              <p className={`text-sm font-bold ${simServerCount < simClicks.length ? roseText : emeraldText}`}>
                Server logged {simServerCount} of {simClicks.length} clicks
                {simServerCount < simClicks.length && ` — analytics undercount by ${simClicks.length - simServerCount}`}
              </p>
              <p className={`text-xs ${muted}`}>Switching between 301 and 302 clears this simulated browser cache so each mode starts fresh. Real browsers keep a cached 301, which is why it is hard to undo.</p>
            </div>

            <div className={`p-5 ${inset} space-y-3 text-sm`}>
              <span className={sectionLabel}>Trade-off</span>
              <div className="p-3 rounded-xl border bg-white border-indigo-200 dark:bg-indigo-500/10 dark:border-indigo-500/30">
                <p className={`font-bold ${indigoText} mb-1`}>301 Moved Permanently</p>
                <p className="text-slate-700 dark:text-slate-300">The browser caches the redirect. Only a user's first click reaches the shortener; later clicks go straight to the long URL. Less server load, but those clicks are invisible to analytics.</p>
              </div>
              <div className="p-3 rounded-xl border bg-white border-emerald-200 dark:bg-emerald-500/10 dark:border-emerald-500/30">
                <p className={`font-bold ${emeraldText} mb-1`}>302 Found (temporary)</p>
                <p className="text-slate-700 dark:text-slate-300">Every click goes to the shortener first, then to the long URL. More server load, but you can track click rate and source.</p>
              </div>
              <p className={`text-xs ${muted}`}>The same rule applies on the first tab: under 301, repeat "Test click"s by you are counted as user clicks but not server clicks.</p>
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: SCALE, ANALYTICS & CONSOLE */}
      {activeTab === 'scale' && (
        <div className={`p-6 ${panel} space-y-6`}>
          <div className="flex items-center gap-3 pb-4 border-b border-slate-200 dark:border-slate-800">
            <div className="p-2.5 bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-white rounded-2xl border border-slate-200 dark:border-slate-700">
              <Server className="w-5 h-5" />
            </div>
            <div>
              <h3 className={`text-base font-bold ${strong}`}>Wrap-up: rate limiter, scaling, analytics</h3>
              <p className={`text-xs ${muted}`}>Load figures use the book's estimate (11,600 reads/s, 1,160 writes/s). Per-node capacities are illustrative.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Rate limiter */}
            <div className={`p-4 ${inset} space-y-3`}>
              <div className="flex items-center justify-between">
                <span className={`text-sm font-bold ${strong}`}>Rate limiter</span>
                <button onClick={() => setRateLimiterOn(!rateLimiterOn)} className={`px-3 py-1 rounded-full text-xs font-bold ${rateLimiterOn ? 'bg-emerald-500 text-slate-950' : toggleOff}`}>
                  {rateLimiterOn ? 'On' : 'Off'}
                </button>
              </div>
              <p className={`text-xs ${muted}`}>Rule: at most {RATE_LIMIT.max} shorten requests per IP per {RATE_LIMIT.windowMs / 1000}s. It also applies to your own "Shorten" button.</p>
              <button onClick={handleBurst} className="w-full py-2 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white flex items-center justify-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5" /> Spam burst: 12 POSTs from one IP
              </button>
              {burstResults && (
                <>
                  <div className="flex flex-wrap gap-1">
                    {burstResults.map((ok, i) => (
                      <span key={i} className={`px-1.5 py-0.5 rounded font-mono text-xs ${ok ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300' : 'bg-rose-100 text-rose-800 dark:bg-rose-500/20 dark:text-rose-300'}`}>
                        {ok ? 'pass' : '429'}
                      </span>
                    ))}
                  </div>
                  <p className={`text-xs ${muted}`}>
                    {burstResults.filter(Boolean).length} of 12 reached the API servers.
                    {!rateLimiterOn && ' Without a limiter every one would consume an ID and a DB row.'}
                  </p>
                </>
              )}
            </div>

            {/* Web tier */}
            <div className={`p-4 ${inset} space-y-3`}>
              <div className="flex items-center justify-between">
                <span className={`text-sm font-bold ${strong}`}>Stateless web servers</span>
                <span className={`font-mono text-xs ${amberText}`}>{webServers}</span>
              </div>
              <input type="range" min={1} max={8} value={webServers} onChange={(e) => setWebServers(Number(e.target.value))} className="w-full accent-amber-500" />
              <p className="text-xs">
                <span className={muted}>Per server: </span>
                <strong className={`font-mono ${perWeb > WEB_SERVER_CAPACITY ? roseText : emeraldText}`}>{fmtInt(perWeb)} req/s</strong>
                <span className={muted}> of ~{WEB_SERVER_CAPACITY.toLocaleString()} capacity</span>
              </p>
              <p className={`text-xs ${muted}`}>
                {perWeb > WEB_SERVER_CAPACITY ? 'Overloaded — add servers. ' : 'Within capacity. '}
                No server holds state, so the load balancer can send any request to any server.
              </p>
            </div>

            {/* DB replicas */}
            <div className={`p-4 ${inset} space-y-3`}>
              <div className="flex items-center justify-between">
                <span className={`text-sm font-bold ${strong}`}>Database read replicas</span>
                <span className={`font-mono text-xs ${amberText}`}>{readReplicaCount}</span>
              </div>
              <input type="range" min={1} max={5} value={readReplicaCount} onChange={(e) => setReadReplicaCount(Number(e.target.value))} className="w-full accent-amber-500" />
              <p className="text-xs">
                <span className={muted}>DB reads = 11,600 × (1 − hit ratio {(hitRatio * 100).toFixed(0)}%) = {fmtInt(dbReadsPerSec)}/s → per replica </span>
                <strong className={`font-mono ${perReplica > REPLICA_CAPACITY ? roseText : emeraldText}`}>{fmtInt(perReplica)}/s</strong>
                <span className={muted}> of ~{REPLICA_CAPACITY.toLocaleString()}</span>
              </p>
              <p className={`text-xs ${muted}`}>
                Hit ratio comes from your clicks on the first tab{useCache ? '' : ' (cache is off, so 0%)'}. Writes ({BOOK_WRITES_PER_SEC.toLocaleString()}/s) still go to the primary; sharding splits them when one primary is not enough.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Analytics */}
            <div className={`p-4 ${inset} space-y-3`}>
              <div className="flex items-center gap-2">
                <BarChart3 className={`w-4 h-4 ${indigoText}`} />
                <span className={`text-sm font-bold ${strong}`}>Click analytics (what the server logged)</span>
              </div>
              <p className="text-xs">
                <span className={muted}>Users clicked </span><strong className={strong}>{stats.userClicks.toLocaleString()}</strong>
                <span className={muted}> times; the server logged </span>
                <strong className={stats.serverHits < stats.userClicks ? roseText : emeraldText}>{stats.serverHits.toLocaleString()}</strong>
                {stats.browserCached > 0 && <span className={roseText}> — {stats.browserCached.toLocaleString()} clicks lost to cached 301s</span>}.
              </p>
              {analyticsTotal === 0 ? (
                <p className={`text-xs ${muted}`}>No logged clicks yet. Use "Test click" or start traffic on the first tab.</p>
              ) : (
                <div className="space-y-1.5">
                  {[...analyticsEntries].sort((a, b) => b[1] - a[1]).map(([country, n]) => (
                    <div key={country} className="flex items-center gap-2 text-xs">
                      <span className={`w-28 shrink-0 ${muted}`}>{country}</span>
                      <div className="flex-1 h-2 rounded-full bg-slate-200 dark:bg-slate-800">
                        <div className="h-2 rounded-full bg-indigo-500" style={{ width: `${(n / analyticsTotal) * 100}%` }} />
                      </div>
                      <span className="font-mono w-14 text-right text-slate-700 dark:text-slate-300">{n.toLocaleString()}</span>
                    </div>
                  ))}
                  <p className={`text-xs ${muted}`}>Countries are randomly assigned in this simulation.</p>
                </div>
              )}
            </div>

            {/* Availability etc. */}
            <div className={`p-4 ${inset} space-y-2`}>
              <div className="flex items-center gap-2">
                <Cpu className={`w-4 h-4 ${amberText}`} />
                <span className={`text-sm font-bold ${strong}`}>Availability, consistency, reliability</span>
              </div>
              <ul className={`text-xs space-y-1.5 list-disc pl-4 ${muted}`}>
                <li>Availability: several stateless web servers and DB replicas mean one failure does not take links down (Chapter 1).</li>
                <li>Consistency: a new link written to the primary may take a moment to reach replicas; a click right after creation could briefly miss.</li>
                <li>Reliability: mappings are durable in the database; the cache can be lost and rebuilt from it (try "Restart server").</li>
              </ul>
            </div>
          </div>

          {/* Console */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Terminal className={`w-4 h-4 ${muted}`} />
              <span className={sectionLabel}>Request log</span>
            </div>
            <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 font-mono text-xs space-y-1.5 max-h-[280px] overflow-y-auto">
              {requestLogs.length === 0 && <p className="text-slate-400">No requests yet.</p>}
              {requestLogs.map((log) => (
                <div key={log.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-1">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-slate-400">{log.timestamp}</span>
                    <span className={`px-1.5 py-0.5 rounded font-bold ${log.method === 'POST' ? 'bg-indigo-500/20 text-indigo-300' : 'bg-amber-500/20 text-amber-300'}`}>{log.method}</span>
                    <span className="text-slate-200 truncate">{log.path}</span>
                    <span className={`px-1.5 py-0.5 rounded font-bold ${
                      log.statusCode >= 400 ? 'bg-rose-500/20 text-rose-300' : log.statusCode >= 300 ? 'bg-sky-500/20 text-sky-300' : 'bg-emerald-500/20 text-emerald-300'
                    }`}>{log.statusCode}</span>
                    <span className="text-slate-400">{log.note}</span>
                  </div>
                  <div className="flex items-center gap-3 shrink-0 text-slate-400">
                    {log.country && <span>{log.country}</span>}
                    <span className="text-amber-300">{log.latencyMs}ms</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* STAGE WRAP: takeaway + quiz */}
      <div className="space-y-4">
        <Takeaway>{currentStage.takeaway}</Takeaway>
        <Quiz key={stage} persistKey={`chapter8:quiz:stage${stage}`} questions={currentStage.quiz} title={`Check your understanding — stage ${stage}`} />
      </div>

      <div className="flex items-center justify-center gap-2 text-xs text-slate-500 dark:text-slate-400">
        <Database className="w-3.5 h-3.5" />
        <span>Links, stage and settings are saved locally. Use "Reset chapter" in the header to start over.</span>
      </div>
    </div>
  );
};
