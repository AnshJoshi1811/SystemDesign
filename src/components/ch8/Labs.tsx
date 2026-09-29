import React, { useMemo, useRef, useState } from 'react';
import { Link2, RotateCcw, Search, Plus, Zap, MousePointerClick, UserPlus, ChevronRight } from 'lucide-react';
import { usePersistentState } from '../../lib/usePersistentState';
import { Callout, Stat, Button, Segmented } from '../lesson/blocks';
import {
  BLOOM_BITS,
  BLOOM_HASHES,
  CODE_LENGTH,
  DEFAULT_LONG_URL,
  FIRST_ID,
  PREDEFINED_STRING,
  base62Steps,
  bloomIndexes,
  bloomMaybe,
  buildBloom,
  crc32Hex,
  encodeBase62,
  fmtBytes,
  fmtInt,
  randomString,
  resolveHash,
  sampleUrl,
  shortUrl,
  type HashAttempt,
} from './engine';

// ---------------------------------------------------------------------------
// Shared bits
// ---------------------------------------------------------------------------
const box = 'rounded-xl bg-slate-50 dark:bg-white/[0.04] p-4 sm:p-5';
const labelCls = 'text-xs font-medium text-slate-500 dark:text-slate-400';
const muted = 'text-sm text-slate-600 dark:text-slate-300';
const inputCls =
  'w-full min-w-0 rounded-lg px-3 py-2 text-sm font-mono bg-white ring-1 ring-slate-300 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:bg-white/[0.04] dark:ring-white/15 dark:text-white';
const chipOk = 'bg-emerald-100 text-emerald-800 dark:bg-emerald-400/15 dark:text-emerald-300';
const chipBad = 'bg-rose-100 text-rose-800 dark:bg-rose-400/15 dark:text-rose-300';
const chipNeutral = 'bg-slate-200 text-slate-700 dark:bg-white/10 dark:text-slate-300';

const Settings: React.FC<{ summary: React.ReactNode; children: React.ReactNode }> = ({ summary, children }) => (
  <details className="group rounded-xl ring-1 ring-slate-200 dark:ring-white/10 [&_summary::-webkit-details-marker]:hidden">
    <summary className="cursor-pointer select-none px-4 py-3 text-sm font-medium text-slate-700 dark:text-slate-200">
      Change the settings
      <span className="ml-2 font-normal text-slate-500 dark:text-slate-400">{summary}</span>
    </summary>
    <div className="space-y-3 px-4 pb-4">{children}</div>
  </details>
);

const fmtBig = (n: number) =>
  n >= 1e12 ? `${+(n / 1e12).toFixed(2)} trillion` : n >= 1e9 ? `${+(n / 1e9).toFixed(1)} billion` : n >= 1e6 ? `${+(n / 1e6).toFixed(1)} million` : fmtInt(n);

const tail = (s: string, n = 38) => (s.length > n ? '…' + s.slice(-n) : s);

// Small SVG pieces for the request-path pictures.
const Arrow: React.FC<{ x1: number; y1: number; x2: number; y2: number; label: string; lx: number; ly: number; active: boolean }> = ({
  x1,
  y1,
  x2,
  y2,
  label,
  lx,
  ly,
  active,
}) => {
  const ang = Math.atan2(y2 - y1, x2 - x1);
  const h = 8;
  const p1 = `${x2 - h * Math.cos(ang - 0.4)},${y2 - h * Math.sin(ang - 0.4)}`;
  const p2 = `${x2 - h * Math.cos(ang + 0.4)},${y2 - h * Math.sin(ang + 0.4)}`;
  return (
    <g opacity={active ? 1 : 0.25}>
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="currentColor" strokeWidth={2} strokeDasharray={active ? undefined : '5 4'} />
      <polygon points={`${x2},${y2} ${p1} ${p2}`} fill="currentColor" />
      <text x={lx} y={ly} fontSize={13} fill="currentColor" textAnchor="middle">
        {label}
      </text>
    </g>
  );
};

const Node: React.FC<{ x: number; y: number; w: number; label: string; sub?: string; dashed?: boolean; highlight?: boolean }> = ({
  x,
  y,
  w,
  label,
  sub,
  dashed,
  highlight,
}) => (
  <g className={highlight ? 'text-indigo-600 dark:text-indigo-300' : ''}>
    <rect
      x={x}
      y={y}
      width={w}
      height={44}
      rx={10}
      fill="none"
      stroke="currentColor"
      strokeWidth={highlight ? 2.5 : 1.5}
      strokeDasharray={dashed ? '5 4' : undefined}
      opacity={dashed ? 0.5 : 1}
    />
    <text x={x + w / 2} y={y + (sub ? 19 : 27)} fontSize={14} fontWeight={600} fill="currentColor" textAnchor="middle">
      {label}
    </text>
    {sub && (
      <text x={x + w / 2} y={y + 36} fontSize={12} fill="currentColor" textAnchor="middle" opacity={0.75}>
        {sub}
      </text>
    )}
  </g>
);

// ---------------------------------------------------------------------------
// Lesson 1: the two endpoints
// ---------------------------------------------------------------------------
interface Link {
  id: number;
  code: string;
  longUrl: string;
}

type Note = { tone: 'success' | 'info' | 'danger'; title: string; body: React.ReactNode };

export const ShortenLab: React.FC = () => {
  const [links, setLinks] = usePersistentState<Link[]>('chapter8:lab:api:links', []);
  const [nextId, setNextId] = usePersistentState<number>('chapter8:lab:api:nextId', FIRST_ID);
  const [input, setInput] = useState(DEFAULT_LONG_URL);
  const [redirects, setRedirects] = useState(0);
  const [note, setNote] = useState<Note | null>(null);

  const shorten = () => {
    const longUrl = input.trim();
    if (!/^https?:\/\/\S+\.\S+/.test(longUrl)) {
      setNote({ tone: 'danger', title: '400 Bad Request', body: 'Enter a full URL starting with http:// or https://.' });
      return;
    }
    const existing = links.find((l) => l.longUrl === longUrl);
    if (existing) {
      setNote({
        tone: 'info',
        title: '200 OK: already shortened',
        body: (
          <>
            This long URL already has <span className="font-mono">{shortUrl(existing.code)}</span>, so the server returns it. No new ID, no new row.
          </>
        ),
      });
      return;
    }
    const id = nextId;
    const code = encodeBase62(id);
    setLinks([{ id, code, longUrl }, ...links].slice(0, 8));
    setNextId(id + 1);
    setNote({
      tone: 'success',
      title: '201 Created',
      body: (
        <>
          The server answers with <span className="font-mono">{shortUrl(code)}</span>. Click it in the list to follow it.
        </>
      ),
    });
  };

  const open = (l: Link) => {
    setRedirects((r) => r + 1);
    setNote({
      tone: 'success',
      title: `GET /${l.code}: redirect`,
      body: (
        <>
          The server looks up <span className="font-mono">{l.code}</span> and answers with a redirect whose{' '}
          <span className="font-mono break-all">Location</span> header is <span className="font-mono break-all">{l.longUrl}</span>. The browser then opens that page.
        </>
      ),
    });
  };

  const reset = () => {
    setLinks([]);
    setNextId(FIRST_ID);
    setRedirects(0);
    setNote(null);
  };

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <p className={labelCls}>
          <span className="font-mono">POST api/v1/data/shorten</span> with this long URL
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input value={input} onChange={(e) => setInput(e.target.value)} className={inputCls} aria-label="Long URL" />
          <Button variant="primary" onClick={shorten} className="shrink-0">
            <Link2 className="w-4 h-4" /> Shorten
          </Button>
        </div>
      </div>

      <div className={box}>
        <p className={`${labelCls} mb-3`}>
          Your short links. Clicking one sends <span className="font-mono">GET api/v1/{'{shortUrl}'}</span>
        </p>
        {links.length === 0 ? (
          <p className={muted}>None yet. Press Shorten.</p>
        ) : (
          <ul className="space-y-2.5">
            {links.map((l) => (
              <li key={l.code} className="flex min-w-0 flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-3">
                <button
                  onClick={() => open(l)}
                  className="self-start shrink-0 font-mono text-sm font-medium text-indigo-600 underline decoration-indigo-300 underline-offset-2 hover:text-indigo-500 dark:text-indigo-300 dark:decoration-indigo-400/40"
                >
                  {shortUrl(l.code)}
                </button>
                <span className="min-w-0 truncate font-mono text-xs text-slate-500 dark:text-slate-400" title={l.longUrl}>
                  {l.longUrl}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {note && (
        <Callout tone={note.tone} title={note.title}>
          {note.body}
        </Callout>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Stat label="Short links stored" value={links.length} />
        <Stat label="Redirects served" value={redirects} tone={redirects ? 'good' : 'neutral'} />
      </div>

      <Button variant="ghost" onClick={reset}>
        <RotateCcw className="w-4 h-4" /> Reset
      </Button>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Lessons 2 and 5: traffic volume (shared setting)
// ---------------------------------------------------------------------------
const VOLUMES = [
  { value: '10000000', label: '10M' },
  { value: '100000000', label: '100M' },
  { value: '1000000000', label: '1B' },
];

const useUrlsPerDay = () => usePersistentState<number>('chapter8:lab:urlsPerDay', 1e8);

const VolumePicker: React.FC<{ value: number; onChange: (v: number) => void }> = ({ value, onChange }) => (
  <div className="flex flex-wrap items-center gap-3">
    <span className="text-sm font-medium text-slate-700 dark:text-slate-200">New URLs per day</span>
    <Segmented label="New URLs per day" value={String(value)} options={VOLUMES} onChange={(v) => onChange(Number(v))} />
  </div>
);

export const EstimateLab: React.FC = () => {
  const [perDay, setPerDay] = useUrlsPerDay();
  const writes = perDay / 86400;
  const records = perDay * 365 * 10;
  return (
    <div className="space-y-6">
      <VolumePicker value={perDay} onChange={setPerDay} />
      <div className="grid grid-cols-2 gap-3">
        <Stat label="Writes per second" value={fmtInt(writes)} hint="per day ÷ 86,400 s" />
        <Stat label="Reads per second" value={fmtInt(writes * 10)} hint="writes × 10" />
        <Stat label="URLs in 10 years" value={fmtBig(records)} hint="per day × 365 × 10" />
        <Stat label="Storage" value={fmtBytes(records * 100)} hint="URLs × 100 bytes" />
      </div>
      {perDay === 1e8 ? (
        <Callout tone="idea" title="The book's numbers">
          About 1,160 writes and 11,600 reads per second, and 365 billion URLs to keep. Redirects are the hot path.
        </Callout>
      ) : (
        <p className={muted}>Switch back to 100M to see the book's numbers.</p>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Lesson 3: 301 vs 302
// ---------------------------------------------------------------------------
type RedirectMode = '301' | '302';

export const RedirectLab: React.FC = () => {
  const [mode, setModeRaw] = usePersistentState<RedirectMode>('chapter8:lab:redirect:mode', '301');
  const [clicks, setClicks] = useState<{ id: number; user: number; hitServer: boolean }[]>([]);
  const [users, setUsers] = useState(1);

  const setMode = (m: RedirectMode) => {
    setModeRaw(m);
    setClicks([]); // each mode starts with an empty (simulated) browser cache
    setUsers(1);
  };

  // Under 301 a browser caches the redirect after its first server round trip; under 302 it never does.
  const click = (user: number) =>
    setClicks((prev) => {
      const hitServer = mode === '302' || !prev.some((c) => c.user === user && c.hitServer);
      return [...prev, { id: prev.length + 1, user, hitServer }];
    });

  const newUser = () => {
    const u = users + 1;
    setUsers(u);
    click(u);
  };

  const last = clicks[clicks.length - 1];
  const seen = clicks.filter((c) => c.hitServer).length;
  const missed = clicks.length - seen;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Server answers with</span>
        <Segmented
          label="Redirect status code"
          value={mode}
          options={[
            { value: '301', label: '301 Moved Permanently' },
            { value: '302', label: '302 Found' },
          ]}
          onChange={setMode}
        />
      </div>

      <div className={box}>
        <svg viewBox="0 0 500 150" className="w-full h-auto text-slate-700 dark:text-slate-300" role="img" aria-label="Path of the last click: browser, shortener, long URL site">
          <Node x={5} y={54} w={110} label="Browser" sub={last ? (last.hitServer ? `user ${last.user}` : 'cached 301') : undefined} highlight={!!last} />
          <Node x={195} y={4} w={130} label="Shortener" sub="tinyurl.com" highlight={!!last?.hitServer} />
          <Node x={385} y={54} w={110} label="Long URL site" highlight={!!last} />
          <g className="text-indigo-600 dark:text-indigo-300">
            <Arrow x1={90} y1={54} x2={200} y2={30} lx={112} ly={30} label="1. GET /zn9edcu" active={!!last?.hitServer} />
            <Arrow x1={210} y1={48} x2={110} y2={72} lx={176} ly={78} label={`2. ${mode} + Location`} active={!!last?.hitServer} />
            <Arrow x1={115} y1={96} x2={383} y2={96} lx={250} ly={118} label="3. GET long URL" active={!!last} />
          </g>
        </svg>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button variant="primary" onClick={() => click(1)}>
          <MousePointerClick className="w-4 h-4" /> User 1 clicks
        </Button>
        <Button onClick={newUser}>
          <UserPlus className="w-4 h-4" /> A new user clicks
        </Button>
        <Button variant="ghost" onClick={() => setMode(mode)}>
          <RotateCcw className="w-4 h-4" /> Reset
        </Button>
      </div>

      <div className="space-y-3">
        <div className="flex flex-wrap gap-1.5 min-h-[28px]" aria-label="Clicks so far">
          {clicks.length === 0 && <span className="text-sm text-slate-500 dark:text-slate-400">No clicks yet.</span>}
          {clicks.slice(-24).map((c) => (
            <span
              key={c.id}
              title={c.hitServer ? 'reached the shortener' : 'answered by the browser cache'}
              className={`inline-flex h-7 items-center rounded-md px-2 text-xs font-medium ${c.hitServer ? chipOk : chipNeutral}`}
            >
              user {c.user} · {c.hitServer ? 'server' : 'cache'}
            </span>
          ))}
        </div>

        {last &&
          (last.hitServer ? (
            <Callout tone="success" title="The click reached the shortener">
              Steps 1 to 3 all happened, so the server could log this click.
              {mode === '301' && ' The browser now remembers the 301 for this link.'}
            </Callout>
          ) : (
            <Callout tone="warning" title="The browser skipped the shortener">
              User {last.user}'s browser remembered the 301 and went straight to the long URL. The server never saw this click.
            </Callout>
          ))}

        <div className="grid grid-cols-3 gap-3">
          <Stat label="Clicks users made" value={clicks.length} />
          <Stat label="Clicks the server saw" value={seen} tone={seen ? 'good' : 'neutral'} />
          <Stat label="Missed by analytics" value={missed} tone={missed ? 'bad' : 'neutral'} />
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Lesson 4: hash table vs database
// ---------------------------------------------------------------------------
const STORAGE_SEED: Link[] = [
  'https://en.wikipedia.org/wiki/URL_shortening',
  'https://github.com/donnemartin/system-design-primer',
  'https://developer.mozilla.org/en-US/docs/Web/HTTP/Status/302',
].map((longUrl, i) => ({ id: FIRST_ID - 3 + i, code: encodeBase62(FIRST_ID - 3 + i), longUrl }));

export const StorageLab: React.FC = () => {
  const [mode, setModeRaw] = useState<'memory' | 'db'>('memory');
  const [rows, setRows] = useState<Link[]>(STORAGE_SEED);
  const [restarts, setRestarts] = useState(0);
  const [result, setResult] = useState<'lost' | 'kept' | null>(null);

  const setMode = (m: 'memory' | 'db') => {
    setModeRaw(m);
    setRows(STORAGE_SEED);
    setResult(null);
  };

  const restart = () => {
    setRestarts((r) => r + 1);
    if (mode === 'memory') {
      setRows([]);
      setResult('lost');
    } else setResult('kept');
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Mappings live in</span>
        <Segmented
          label="Where mappings live"
          value={mode}
          options={[
            { value: 'memory', label: 'Hash table in RAM' },
            { value: 'db', label: 'Relational database' },
          ]}
          onChange={setMode}
        />
      </div>

      <div className={box}>
        <p className={`${labelCls} mb-3`}>
          {mode === 'memory' ? 'hashTable in the web server\'s memory: shortURL → longURL' : 'Table url on disk: id, shortURL, longURL'}
        </p>
        {rows.length === 0 ? (
          <p className="text-sm text-rose-600 dark:text-rose-400">Empty. Every short link now leads nowhere.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <tbody className="divide-y divide-slate-200 dark:divide-white/10">
                {rows.map((r) => (
                  <tr key={r.code}>
                    {mode === 'db' && <td className="py-1.5 pr-3 font-mono text-xs text-slate-500 dark:text-slate-400">{r.id}</td>}
                    <td className="py-1.5 pr-3 font-mono font-medium text-slate-900 dark:text-white">{r.code}</td>
                    <td className="py-1.5 font-mono text-xs text-slate-600 dark:text-slate-300 max-w-[220px] truncate" title={r.longUrl}>
                      {r.longUrl}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button variant="primary" onClick={restart}>
          <RotateCcw className="w-4 h-4" /> Restart the server
        </Button>
        {rows.length === 0 && (
          <Button variant="ghost" onClick={() => setMode(mode)}>
            Restore the links
          </Button>
        )}
      </div>

      {result === 'lost' && (
        <Callout tone="danger" title="All mappings are gone">
          RAM is wiped on restart. A shared short link is a promise that has to outlive any one server.
        </Callout>
      )}
      {result === 'kept' && (
        <Callout tone="success" title="Every mapping survived">
          The rows are on disk, so the restarted server reads them again. The table can also grow far beyond one machine's memory.
        </Callout>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Stat label="Links stored" value={rows.length} tone={rows.length ? 'neutral' : 'bad'} />
        <Stat label="Restarts" value={restarts} />
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Lesson 5: code length
// ---------------------------------------------------------------------------
export const LengthLab: React.FC = () => {
  const [perDay, setPerDay] = useUrlsPerDay();
  const need = perDay * 365 * 10;
  const lengths = [1, 2, 3, 4, 5, 6, 7, 8];
  const maxLog = Math.log10(Math.pow(62, 8));
  const smallest = lengths.find((n) => Math.pow(62, n) >= need);
  const marker = (Math.log10(need) / maxLog) * 100;

  return (
    <div className="space-y-6">
      <VolumePicker value={perDay} onChange={setPerDay} />

      <div className={box}>
        <div className="flex items-baseline justify-between gap-3 mb-3">
          <p className={labelCls}>Codes available with n characters (62ⁿ)</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            line = <span className="text-rose-600 dark:text-rose-400">{fmtBig(need)}</span> needed
          </p>
        </div>
        <div className="space-y-1.5">
          {lengths.map((n) => {
            const cap = Math.pow(62, n);
            const ok = cap >= need;
            return (
              <div key={n} className="grid grid-cols-[1.25rem_minmax(0,1fr)_6.5rem] items-center gap-2">
                <span className={`font-mono text-sm ${n === smallest ? 'font-semibold text-slate-900 dark:text-white' : 'text-slate-500 dark:text-slate-400'}`}>{n}</span>
                <div className="relative h-5 rounded bg-slate-200/70 dark:bg-white/[0.06]">
                  <div
                    className={`h-full rounded transition-all ${ok ? (n === smallest ? 'bg-emerald-500' : 'bg-emerald-300 dark:bg-emerald-500/40') : 'bg-slate-300 dark:bg-white/15'}`}
                    style={{ width: `${(n / 8) * 100}%` }}
                  />
                  <span className="absolute inset-y-[-3px] w-0.5 bg-rose-500" style={{ left: `${marker}%` }} aria-hidden />
                </div>
                <span className={`text-right font-mono text-xs ${ok ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-500 dark:text-slate-400'}`}>{fmtBig(cap)}</span>
              </div>
            );
          })}
        </div>
        <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">Log scale: each extra character multiplies the capacity by 62.</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Stat label="URLs in 10 years" value={fmtBig(need)} />
        <Stat label="Shortest code that fits" value={smallest ? `${smallest} chars` : '> 8'} tone="good" />
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Lesson 6: hash + collision resolution
// ---------------------------------------------------------------------------
export const HashLab: React.FC = () => {
  const [len, setLen] = usePersistentState<number>('chapter8:lab:hash:len', 2);
  const [rows, setRows] = useState<{ code: string; longUrl: string }[]>([]);
  const [sampleIdx, setSampleIdx] = useState(0);
  const [collisions, setCollisions] = useState(0);
  const [last, setLast] = useState<{ longUrl: string; code: string | null; attempts: HashAttempt[]; existing?: boolean } | null>(null);
  const probeCounter = useRef(0);
  const taken = useMemo(() => new Map<string, string>(rows.map((r) => [r.code, r.longUrl])), [rows]);

  const shorten = (longUrl: string) => {
    const already = rows.find((r) => r.longUrl === longUrl);
    if (already) {
      setLast({ longUrl, code: already.code, attempts: [], existing: true });
      return;
    }
    const r = resolveHash(longUrl, len, taken);
    if (r.code) setRows((prev) => [...prev, { code: r.code as string, longUrl }]);
    setCollisions((c) => c + r.attempts.filter((a) => a.outcome === 'collision').length);
    setLast({ longUrl, code: r.code, attempts: r.attempts });
  };

  const next = () => {
    shorten(sampleUrl(sampleIdx));
    setSampleIdx((i) => i + 1);
  };

  /** Search for a fresh URL whose truncated hash is already taken, then shorten it. */
  const forceCollision = () => {
    for (let i = 0; i < 200000; i++) {
      const url = `https://example.com/post/${++probeCounter.current}`;
      if (taken.has(crc32Hex(url).slice(0, len)) && !rows.some((r) => r.longUrl === url)) {
        shorten(url);
        return;
      }
    }
  };

  const reset = (newLen = len) => {
    setLen(newLen);
    setRows([]);
    setSampleIdx(0);
    setCollisions(0);
    setLast(null);
  };

  const lastCollisions = last ? last.attempts.filter((a) => a.outcome === 'collision').length : 0;

  return (
    <div className="space-y-6">
      <div className={box}>
        <p className={`${labelCls} mb-3`}>Attempts for the last URL</p>
        {!last || last.attempts.length === 0 ? (
          <p className={muted}>{last?.existing ? 'That URL is already stored, so nothing was hashed.' : 'Press Shorten next URL to hash one.'}</p>
        ) : (
          <ol className="space-y-2">
            {last.attempts.map((a, i) => (
              <li key={i} className="rounded-lg bg-white ring-1 ring-slate-200 dark:bg-white/[0.03] dark:ring-white/10 px-3 py-2">
                <p className="break-all font-mono text-xs text-slate-600 dark:text-slate-300">
                  {i + 1}. CRC32("{tail(a.input)}")
                </p>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                  <span className="font-mono text-base">
                    <strong className="font-semibold text-slate-900 dark:text-white">{a.hex.slice(0, len)}</strong>
                    <span className="text-slate-400 dark:text-slate-500">{a.hex.slice(len)}</span>
                  </span>
                  {a.outcome === 'collision' ? (
                    <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${chipBad}`}>
                      taken by {tail(a.takenBy ?? '', 24)}, append "{PREDEFINED_STRING}"
                    </span>
                  ) : (
                    <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${chipOk}`}>free, saved</span>
                  )}
                </div>
              </li>
            ))}
          </ol>
        )}

        <p className={`${labelCls} mt-5 mb-2`}>Codes in the table ({rows.length})</p>
        <div className="flex flex-wrap gap-1.5 min-h-[28px]">
          {rows.length === 0 && <span className="text-sm text-slate-500 dark:text-slate-400">Empty.</span>}
          {rows.map((r) => (
            <span
              key={r.code}
              title={r.longUrl}
              className={`inline-flex h-7 items-center rounded-md px-2 font-mono text-xs font-medium ${
                r.code === last?.code ? 'bg-indigo-600 text-white' : chipNeutral
              }`}
            >
              {r.code}
            </span>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button variant="primary" onClick={next}>
          <Plus className="w-4 h-4" /> Shorten next URL
        </Button>
        <Button onClick={forceCollision} disabled={rows.length === 0 || len > 3} title={len > 3 ? 'Too many codes to find a collision quickly' : undefined}>
          <Zap className="w-4 h-4" /> Force a collision
        </Button>
        <Button variant="ghost" onClick={() => reset()}>
          <RotateCcw className="w-4 h-4" /> Reset
        </Button>
      </div>

      {last &&
        (last.existing ? (
          <Callout tone="info" title="Same long URL, same code">
            It is already stored as <span className="font-mono">{last.code}</span>. That is a duplicate, not a collision.
          </Callout>
        ) : !last.code ? (
          <Callout tone="danger" title="No free code after 20 re-hashes">
            The code space is nearly full. Keep more characters.
          </Callout>
        ) : lastCollisions > 0 ? (
          <Callout tone="warning" title={`Collision resolved after ${lastCollisions} re-hash${lastCollisions > 1 ? 'es' : ''}`}>
            The first code was already taken by another URL, so "{PREDEFINED_STRING}" was appended and the new string hashed again. It landed on the free code{' '}
            <span className="font-mono">{last.code}</span>.
          </Callout>
        ) : (
          <Callout tone="success" title="No collision">
            Stored as <span className="font-mono">{last.code}</span> on the first try.
          </Callout>
        ))}

      <div className="grid grid-cols-2 gap-3">
        <Stat label="URLs stored" value={rows.length} />
        <Stat label="Collisions resolved" value={collisions} tone={collisions ? 'bad' : 'neutral'} />
      </div>

      <Settings summary={`keep ${len} hex character${len > 1 ? 's' : ''} · ${fmtInt(Math.pow(16, len))} possible codes`}>
        <Segmented
          label="Characters kept from the hash"
          value={String(len)}
          options={[
            { value: '1', label: '1' },
            { value: '2', label: '2' },
            { value: '3', label: '3' },
            { value: '7', label: '7 (book)' },
          ]}
          onChange={(v) => reset(Number(v))}
        />
        <p className="text-xs text-slate-500 dark:text-slate-400">
          CRC32 prints 8 hex digits, 16 values each. The book keeps 7 (about 268 million codes), where a small demo would almost never collide. The lab keeps 2 so
          collisions show up after a handful of URLs. Changing this empties the table.
        </p>
      </Settings>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Lesson 7: base62 conversion
// ---------------------------------------------------------------------------
const charRange = (r: number) => (r < 10 ? 'a digit' : r < 36 ? `a to z start at 10, so ${r} is lowercase` : `A to Z start at 36, so ${r} is uppercase`);

export const Base62Lab: React.FC = () => {
  const [num, setNum] = useState(11157);
  const [shown, setShown] = useState(0);
  const rows = base62Steps(num);
  const done = shown >= rows.length;
  const code = rows.map((r) => r.char).reverse().join('') || '0';

  const pick = (n: number) => {
    setNum(n);
    setShown(0);
  };

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <p className={labelCls}>ID from the unique ID generator</p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            type="number"
            min={0}
            value={num}
            onChange={(e) => pick(Math.min(Number.MAX_SAFE_INTEGER, Math.max(0, Math.floor(Number(e.target.value) || 0))))}
            className={inputCls}
            aria-label="ID in base 10"
          />
          <div className="flex gap-2 shrink-0">
            <Button onClick={() => pick(11157)}>11157</Button>
            <Button onClick={() => pick(FIRST_ID)}>{FIRST_ID}</Button>
          </div>
        </div>
      </div>

      <div className={box}>
        <p className={`${labelCls} mb-3`}>Short code, filled in from the right</p>
        <div className="flex flex-wrap gap-1.5">
          {rows.length === 0 ? (
            <span className="flex h-11 w-10 items-center justify-center rounded-lg bg-indigo-600 font-mono text-lg font-semibold text-white">0</span>
          ) : (
            rows
              .slice()
              .reverse()
              .map((r, j) => {
                const rowIdx = rows.length - 1 - j;
                const filled = rowIdx < shown;
                return (
                  <span
                    key={j}
                    className={`flex h-11 w-10 items-center justify-center rounded-lg font-mono text-lg font-semibold transition-colors ${
                      filled ? 'bg-indigo-600 text-white' : 'border-2 border-dashed border-slate-300 text-transparent dark:border-white/20'
                    }`}
                  >
                    {filled ? r.char : '·'}
                  </span>
                );
              })
          )}
        </div>

        {shown > 0 && (
          <ol className="mt-4 space-y-1.5">
            {rows.slice(0, shown).map((r, i) => (
              <li key={i} className="rounded-lg bg-white ring-1 ring-slate-200 dark:bg-white/[0.03] dark:ring-white/10 px-3 py-2 text-sm">
                <span className="font-mono text-slate-900 dark:text-white">
                  {r.dividend.toLocaleString()} ÷ 62 = {r.quotient.toLocaleString()} remainder {r.remainder} → {r.char}
                </span>
                <span className="block text-xs text-slate-500 dark:text-slate-400">{charRange(r.remainder)}</span>
              </li>
            ))}
          </ol>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button variant="primary" onClick={() => setShown((s) => s + 1)} disabled={done}>
          <ChevronRight className="w-4 h-4" /> Next division
        </Button>
        <Button onClick={() => setShown(rows.length)} disabled={done}>
          Show all
        </Button>
      </div>

      {done && (
        <Callout tone="success" title={`${num.toLocaleString()} in base 62 is ${code}`}>
          {rows.length === 0
            ? 'Zero is simply the digit 0.'
            : `${rows.length} divisions gave ${rows.length} characters. The first remainder is the last character, so you read them bottom-up.`}
          {num === FIRST_ID && ' This is the book\'s example: the ID becomes zn9edcu.'}
        </Callout>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Lesson 9: the shortening flow and its Bloom filter
// ---------------------------------------------------------------------------
export const ShortenFlowFigure: React.FC = () => {
  const step = 'rounded-lg ring-1 ring-slate-300 dark:ring-white/15 px-3 py-2 text-sm';
  const arrow = <div className="pl-5 text-slate-400" aria-hidden>↓</div>;
  return (
    <div className="space-y-1.5">
      <div className={step}>
        1. Input: <span className="font-mono">longURL</span>
      </div>
      {arrow}
      <div className={`${step} flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between`}>
        <span>2. Is longURL already in the database?</span>
        <span className="text-emerald-700 dark:text-emerald-400">yes → return the stored shortURL</span>
      </div>
      <div className="pl-5 text-sm text-slate-500 dark:text-slate-400">↓ no</div>
      <div className={step}>
        3. Get a new ID from the unique ID generator: <span className="font-mono">{FIRST_ID}</span>
      </div>
      {arrow}
      <div className={step}>
        4. Convert the ID to base62: <span className="font-mono">{encodeBase62(FIRST_ID)}</span>
      </div>
      {arrow}
      <div className={step}>
        5. Save <span className="font-mono">(id, shortURL, longURL)</span> and return the shortURL
      </div>
    </div>
  );
};

export const BloomLab: React.FC = () => {
  const [keys, setKeys] = useState<string[]>([]);
  const [urlIdx, setUrlIdx] = useState(0);
  const [probe, setProbe] = useState('');
  const [searchMsg, setSearchMsg] = useState<string | null>(null);
  const bits = useMemo(() => buildBloom(keys), [keys]);
  const setCount = bits.filter(Boolean).length;
  const fpRate = Math.pow(setCount / BLOOM_BITS, BLOOM_HASHES);

  const add = (n: number) => {
    const next = [...keys];
    for (let i = 0; i < n; i++) {
      const code = crc32Hex(sampleUrl(urlIdx + i)).slice(0, CODE_LENGTH);
      if (!next.includes(code)) next.push(code);
    }
    setKeys(next);
    setUrlIdx(urlIdx + n);
    setProbe(next[next.length - 1] ?? '');
    setSearchMsg(null);
  };

  const findFalsePositive = () => {
    for (let i = 0; i < 5000; i++) {
      const cand = randomString('0123456789abcdef', CODE_LENGTH);
      if (!keys.includes(cand) && bloomMaybe(bits, cand)) {
        setProbe(cand);
        setSearchMsg(`Found after ${(i + 1).toLocaleString()} random codes.`);
        return;
      }
    }
    setProbe('');
    setSearchMsg('No false positive in 5,000 random codes. The filter is still sparse: add more URLs.');
  };

  const reset = () => {
    setKeys([]);
    setUrlIdx(0);
    setProbe('');
    setSearchMsg(null);
  };

  const key = probe.trim();
  const probed = key ? bloomIndexes(key) : [];
  const maybe = key ? bloomMaybe(bits, key) : false;
  const stored = key ? keys.includes(key) : false;

  return (
    <div className="space-y-6">
      <div className={box}>
        <div className="flex items-baseline justify-between gap-3 mb-3">
          <p className={labelCls}>
            Bloom filter: {BLOOM_BITS} bits, {BLOOM_HASHES} hash functions
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400">outlined = bits the probe checks</p>
        </div>
        <div
          className="grid gap-1"
          style={{ gridTemplateColumns: 'repeat(16, minmax(0, 1fr))' }}
          role="img"
          aria-label={`${setCount} of ${BLOOM_BITS} bits set`}
        >
          {bits.map((on, i) => (
            <span
              key={i}
              title={`bit ${i}: ${on ? 1 : 0}`}
              className={`aspect-square rounded-sm ${on ? 'bg-indigo-500' : 'bg-white ring-1 ring-slate-200 dark:bg-white/[0.04] dark:ring-white/10'} ${
                probed.includes(i) ? 'outline outline-2 outline-offset-1 outline-slate-900 dark:outline-white' : ''
              }`}
            />
          ))}
        </div>

        <p className={`${labelCls} mt-5 mb-2`}>Stored codes ({keys.length})</p>
        <div className="flex flex-wrap gap-1.5 min-h-[28px]">
          {keys.length === 0 && <span className="text-sm text-slate-500 dark:text-slate-400">None yet.</span>}
          {keys.map((k) => (
            <button
              key={k}
              onClick={() => {
                setProbe(k);
                setSearchMsg(null);
              }}
              className={`inline-flex h-7 items-center rounded-md px-2 font-mono text-xs font-medium ${k === key ? 'bg-indigo-600 text-white' : chipNeutral}`}
            >
              {k}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button variant="primary" onClick={() => add(4)}>
          <Plus className="w-4 h-4" /> Add 4 URLs
        </Button>
        <Button onClick={findFalsePositive} disabled={keys.length === 0}>
          <Search className="w-4 h-4" /> Find a false positive
        </Button>
        <Button variant="ghost" onClick={reset}>
          <RotateCcw className="w-4 h-4" /> Reset
        </Button>
      </div>

      <div className="space-y-3">
        <label className="block">
          <span className={labelCls}>Is this code taken? Ask the filter</span>
          <input
            value={probe}
            onChange={(e) => {
              setProbe(e.target.value);
              setSearchMsg(null);
            }}
            placeholder="type a 7-character code"
            className={`${inputCls} mt-1`}
          />
        </label>
        {searchMsg && <p className="text-sm text-slate-600 dark:text-slate-300">{searchMsg}</p>}
        {key &&
          (!maybe ? (
            <Callout tone="success" title="Definitely absent">
              At least one of its bits is 0, so no stored code could have produced it. The server skips the database read.
            </Callout>
          ) : stored ? (
            <Callout tone="info" title="Maybe present, and the database confirms it">
              All its bits are set. The filter can only say "maybe", so the server reads the database, which says the code is taken.
            </Callout>
          ) : (
            <Callout tone="warning" title="False positive">
              All three bits were set by other codes, but <span className="font-mono">{key}</span> was never stored. The database read finds it free: one wasted lookup,
              never a wrong answer.
            </Callout>
          ))}
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Stat label="Codes stored" value={keys.length} />
        <Stat label="Bits set" value={`${setCount}/${BLOOM_BITS}`} />
        <Stat label="False-positive rate" value={`${(fpRate * 100).toFixed(1)}%`} hint="(set ÷ 64)³" />
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Lesson 10: redirect flow with a cache
// ---------------------------------------------------------------------------
const CACHE_LINKS: Link[] = [
  'https://en.wikipedia.org/wiki/Systems_design',
  'https://en.wikipedia.org/wiki/URL_shortening',
  'https://en.wikipedia.org/wiki/Cache_(computing)',
  'https://en.wikipedia.org/wiki/Load_balancing_(computing)',
].map((longUrl, i) => ({ id: FIRST_ID + i, code: encodeBase62(FIRST_ID + i), longUrl }));
const INVALID_CODE = 'zzzzzzz';

type Lookup = 'cache' | 'db' | 'invalid';

export const CacheLab: React.FC = () => {
  const [mode, setModeRaw] = usePersistentState<'on' | 'off'>('chapter8:lab:cache:mode', 'on');
  const cacheRef = useRef(new Set<string>());
  const [stats, setStats] = useState({ clicks: 0, hits: 0, reads: 0 });
  const [last, setLast] = useState<{ code: string; kind: Lookup } | null>(null);

  const reset = () => {
    cacheRef.current.clear();
    setStats({ clicks: 0, hits: 0, reads: 0 });
    setLast(null);
  };

  const setMode = (m: 'on' | 'off') => {
    setModeRaw(m);
    reset();
  };

  /** Web server: check the cache first; on a miss read the DB and fill the cache. */
  const serve = (code: string): Lookup => {
    const on = mode === 'on';
    if (on && cacheRef.current.has(code)) return 'cache';
    const valid = CACHE_LINKS.some((l) => l.code === code);
    if (valid && on) cacheRef.current.add(code);
    return valid ? 'db' : 'invalid';
  };

  const record = (results: { code: string; kind: Lookup }[]) => {
    const hits = results.filter((r) => r.kind === 'cache').length;
    setStats((s) => ({ clicks: s.clicks + results.length, hits: s.hits + hits, reads: s.reads + results.length - hits }));
    setLast(results[results.length - 1]);
  };

  const click = (code: string) => record([{ code, kind: serve(code) }]);

  /** Hot links get most of the clicks (weights 1, 1/2, 1/3, 1/4). */
  const burst = () => {
    const weights = CACHE_LINKS.map((_, i) => 1 / (i + 1));
    const total = weights.reduce((a, b) => a + b, 0);
    const results: { code: string; kind: Lookup }[] = [];
    for (let n = 0; n < 20; n++) {
      let r = Math.random() * total;
      let i = 0;
      while (i < weights.length - 1 && r > weights[i]) r -= weights[i++];
      const code = CACHE_LINKS[i].code;
      results.push({ code, kind: serve(code) });
    }
    record(results);
  };

  const k = last?.kind;
  const on = mode === 'on';
  const lookups = stats.hits + stats.reads;
  const target = last ? CACHE_LINKS.find((l) => l.code === last.code) : undefined;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Cache</span>
        <Segmented
          label="Cache in front of the database"
          value={mode}
          options={[
            { value: 'on', label: 'On' },
            { value: 'off', label: 'Off' },
          ]}
          onChange={setMode}
        />
      </div>

      <div className={box}>
        <svg viewBox="0 0 500 178" className="w-full h-auto text-slate-700 dark:text-slate-300" role="img" aria-label="Redirect path: browser to web server, then cache, then database on a miss">
          <Node x={5} y={67} w={110} label="Browser" sub={last ? `/${last.code}` : 'GET /code'} highlight={!!last} />
          <Node x={170} y={67} w={130} label="Web server" sub="behind the LB" highlight={!!last} />
          <Node x={360} y={8} w={135} label="Cache" sub={on ? `${cacheRef.current.size} link${cacheRef.current.size === 1 ? '' : 's'} cached` : 'off'} dashed={!on} highlight={k === 'cache'} />
          <Node x={360} y={126} w={135} label="Database" sub="id, shortURL, longURL" highlight={k === 'db' || k === 'invalid'} />
          <g className="text-indigo-600 dark:text-indigo-300">
            <Arrow x1={115} y1={89} x2={168} y2={89} lx={142} ly={82} label="GET" active={!!last} />
            <Arrow x1={300} y1={80} x2={358} y2={34} lx={316} ly={48} label="1. check" active={!!last && on} />
            <Arrow x1={300} y1={98} x2={358} y2={144} lx={314} ly={138} label="2. on miss" active={k === 'db' || k === 'invalid'} />
          </g>
        </svg>
      </div>

      <div className="space-y-2">
        <p className={labelCls}>Click a short link</p>
        <div className="flex flex-wrap gap-2">
          {CACHE_LINKS.map((l) => (
            <Button key={l.code} onClick={() => click(l.code)} className="font-mono">
              {l.code}
            </Button>
          ))}
          <Button onClick={() => click(INVALID_CODE)} className="font-mono" title="A code that was never created">
            {INVALID_CODE}
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button variant="primary" onClick={burst}>
          <Zap className="w-4 h-4" /> 20 random clicks
        </Button>
        <Button variant="ghost" onClick={reset}>
          <RotateCcw className="w-4 h-4" /> Reset
        </Button>
      </div>

      {last &&
        (k === 'cache' ? (
          <Callout tone="success" title="Cache hit">
            <span className="font-mono">{last.code}</span> was in memory. The server returned its long URL without touching the database.
          </Callout>
        ) : k === 'db' ? (
          <Callout tone="info" title={on ? 'Cache miss: read the database' : 'Database read'}>
            The server read <span className="font-mono">{last.code}</span> from the database{on ? ' and copied the pair into the cache, so the next click is a hit' : ''}.
            It redirects to <span className="font-mono break-all">{target?.longUrl}</span>.
          </Callout>
        ) : (
          <Callout tone="danger" title="404: invalid short URL">
            <span className="font-mono">{last.code}</span> is in neither the cache nor the database, so it was never created.
          </Callout>
        ))}

      <div className="grid grid-cols-3 gap-3">
        <Stat label="Cache hits" value={stats.hits} tone={stats.hits ? 'good' : 'neutral'} />
        <Stat label="Database reads" value={stats.reads} />
        <Stat label="Hit ratio" value={lookups ? `${Math.round((stats.hits / lookups) * 100)}%` : '–'} />
      </div>
    </div>
  );
};
