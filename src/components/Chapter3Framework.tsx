import React from 'react';
import {
  BookOpen,
  HelpCircle,
  Layers,
  Cpu,
  CheckCircle2,
  AlertTriangle,
  Lightbulb,
  Clock,
  ArrowRight,
  ShieldAlert,
  Sparkles,
  RefreshCw,
  Check,
  X,
  Database,
  Server,
  Wifi,
  Award,
  Share2,
  User,
  Hash,
  Radio,
  Bell,
  Activity,
  Globe,
  MessageSquare,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { usePersistentState } from '../lib/usePersistentState';
import { LessonGoal, Takeaway, Quiz, Term } from './learn/LearningKit';

interface Chapter3FrameworkProps {
  isDarkMode?: boolean;
}

type SectionTab =
  | 'intro'
  | 'step1'
  | 'step2'
  | 'step3'
  | 'step4'
  | 'dos-donts'
  | 'time-split'
  | 'simulator';

// =====================================================================
// SIMULATOR DATA — every option carries a quality weight and a "why".
// Scale figures come from the book's worked example for each problem
// (news feed: Ch.3/11, URL shortener: Ch.8, chat: Ch.12).
// =====================================================================

type ProblemId = 'newsfeed' | 'urlshortener' | 'chat';
type Quality = 'strong' | 'ok' | 'weak';
type Tone = 'good' | 'ok' | 'bad';

interface Choice {
  id: string;
  text: string;
  /** Positive = helps, 0 = neutral, negative = hurts. */
  weight: number;
  why: string;
  /** Interviewer's answer (clarifying questions only). */
  reply?: string;
  /** Key clarifying question: skipping it triggers a warning. */
  key?: boolean;
  /** What goes wrong if a key question is skipped. */
  risk?: string;
}

interface ComponentRole {
  role: 'core' | 'useful' | 'unneeded';
  why: string;
  /** Interviewer pushback when a core component is missing. */
  pushback?: string;
}

interface DeepDiveTopic {
  id: string;
  title: string;
  options: { text: string; quality: Quality; why: string }[];
}

interface ProblemDef {
  label: string;
  prompt: string;
  questions: Choice[];
  fr: Choice[];
  nfr: Choice[];
  components: Record<ComponentId, ComponentRole>;
  deepDive: DeepDiveTopic[];
}

type ComponentId = 'lb' | 'app' | 'cache' | 'db' | 'mq' | 'worker' | 'cdn' | 'idgen' | 'ws' | 'presence' | 'notif';

const COMPONENTS: { id: ComponentId; name: string; icon: React.ElementType }[] = [
  { id: 'lb', name: 'Load Balancer', icon: Wifi },
  { id: 'app', name: 'Web / API Servers', icon: Server },
  { id: 'cache', name: 'Cache (e.g. Redis)', icon: Database },
  { id: 'db', name: 'Database', icon: Database },
  { id: 'mq', name: 'Message Queue', icon: Share2 },
  { id: 'worker', name: 'Fanout Workers', icon: RefreshCw },
  { id: 'cdn', name: 'CDN', icon: Globe },
  { id: 'idgen', name: 'Unique ID Generator', icon: Hash },
  { id: 'ws', name: 'WebSocket Chat Servers', icon: Radio },
  { id: 'presence', name: 'Presence Servers', icon: Activity },
  { id: 'notif', name: 'Push Notification Service', icon: Bell },
];

const PROBLEMS: Record<ProblemId, ProblemDef> = {
  newsfeed: {
    label: 'Design a News Feed',
    prompt: 'Please design a news feed system.',
    questions: [
      {
        id: 'q-features', text: 'What are the most important features?', weight: 3, key: true,
        reply: 'Making a post and seeing friends’ news feed.',
        why: 'Pins the scope to two flows — publish and read — so you don’t design likes, comments or stories nobody asked for.',
        risk: 'You may spend the interview on features that were never in scope.',
      },
      {
        id: 'q-dau', text: 'What is the traffic volume (daily active users)?', weight: 3, key: true,
        reply: '10 million DAU.',
        why: 'Scale decides whether a single database is enough, how big the feed cache must be, and whether fanout is a bottleneck.',
        risk: 'Without scale you can’t justify caches, sharding or fanout strategy — every component is a guess.',
      },
      {
        id: 'q-order', text: 'Is the feed reverse-chronological or ranked?', weight: 2, key: true,
        reply: 'Reverse chronological, to keep it simple.',
        why: 'A ranked feed needs a ranking service and changes how feed entries are stored. Knowing it’s chronological removes that whole subsystem.',
        risk: 'You might build (or forget) a ranking pipeline and get the storage model wrong.',
      },
      {
        id: 'q-friends', text: 'How many friends can a user have?', weight: 2,
        reply: '5,000.',
        why: 'This is the fanout multiplier: one post may be written into up to 5,000 feeds. It drives the deep dive later.',
      },
      {
        id: 'q-media', text: 'Can posts contain images or videos?', weight: 2,
        reply: 'Yes — both images and videos.',
        why: 'Media means blob storage and a CDN; text-only would not.',
      },
      {
        id: 'q-tech', text: 'Should I use Cassandra or MongoDB for posts?', weight: -2,
        reply: 'That’s your call — what do the requirements suggest?',
        why: 'Choosing technology before you know the requirements is jumping to a solution. Ask about the problem, not the tools.',
      },
    ],
    fr: [
      { id: 'fr-post', text: 'Publish a post (text, image, video)', weight: 2, why: 'One of the two features the interviewer named.' },
      { id: 'fr-feed', text: 'View a feed of friends’ posts', weight: 2, why: 'The other named feature — the read path you must make fast.' },
      { id: 'fr-follow', text: 'Add friends', weight: 1, why: 'Needed to have a friend graph, but not the focus. Mention it and move on.' },
      { id: 'fr-dm', text: 'Direct messaging between friends', weight: -2, why: 'Out of scope — this is a chat system, a different interview question.' },
    ],
    nfr: [
      { id: 'nfr-latency', text: 'Feed loads with low latency', weight: 2, why: 'Users open the feed far more often than they post; the read path is what they feel.' },
      { id: 'nfr-avail', text: 'Highly available; eventual consistency is acceptable', weight: 2, why: 'A friend’s post appearing a few seconds late is fine. Saying so lets you use caches and async fanout.' },
      { id: 'nfr-scale', text: 'Supports 10M DAU and up to 5,000 friends per user', weight: 2, why: 'Writes down the numbers you just learned so later decisions can refer to them.' },
      { id: 'nfr-strong', text: 'Strong consistency: every friend sees a post the instant it’s published', weight: -2, why: 'Costly (synchronous fanout to thousands of feeds) and not needed for a social feed — this is over-engineering.' },
    ],
    components: {
      lb: { role: 'core', why: 'Spreads 10M users’ requests across many web servers.', pushback: 'With 10 million daily users, how are requests spread across more than one web server?' },
      app: { role: 'core', why: 'Runs the post service and the feed service.', pushback: 'Where does the logic for publishing a post or building a feed actually run?' },
      db: { role: 'core', why: 'Durably stores posts and the friend graph.', pushback: 'If the cache is wiped, where do posts and friendships live?' },
      cache: { role: 'core', why: 'Holds each user’s pre-built feed (post IDs) so reads don’t recompute it.', pushback: 'How do users get their feed quickly without querying every friend’s posts on each app open?' },
      worker: { role: 'core', why: 'The fanout service: pushes a new post’s ID into each friend’s feed.', pushback: 'When someone posts, what puts that post into their 5,000 friends’ feeds?' },
      mq: { role: 'useful', why: 'Buffers fanout work so a slow fanout doesn’t slow down the person posting.' },
      cdn: { role: 'useful', why: 'Posts include images and video; a CDN serves media close to users.' },
      notif: { role: 'useful', why: 'The book’s design notifies friends about new posts — nice, not essential.' },
      idgen: { role: 'useful', why: 'Posts need unique IDs; time-sortable IDs help chronological feeds.' },
      ws: { role: 'unneeded', why: 'The feed is fetched when the app opens; no persistent connection was required.' },
      presence: { role: 'unneeded', why: 'Online status isn’t part of this problem.' },
    },
    deepDive: [
      {
        id: 'fanout',
        title: 'How should a new post reach friends’ feeds?',
        options: [
          { text: 'Fanout on write (push) for everyone', quality: 'ok', why: 'Feeds are pre-built so reads are fast — but a user with millions of followers turns one post into millions of cache writes (the “hotkey” problem).' },
          { text: 'Fanout on read (pull) for everyone', quality: 'ok', why: 'No wasted writes for inactive users, but every feed open must gather and merge posts from up to 5,000 friends — slow reads.' },
          { text: 'Hybrid: push for most users, pull for celebrities', quality: 'strong', why: 'Keeps reads fast for the common case and avoids hot spots from very popular accounts. This is the book’s choice, and you named the trade-off.' },
        ],
      },
      {
        id: 'pagination',
        title: 'How should the feed be paginated?',
        options: [
          { text: 'Offset pagination (page=3, size=20)', quality: 'weak', why: 'New posts arriving at the top shift every offset, so users see duplicates or miss posts while scrolling.' },
          { text: 'Cursor pagination (last seen post ID / timestamp)', quality: 'strong', why: 'The cursor marks a fixed point in the feed, so new posts don’t disturb the next page.' },
        ],
      },
    ],
  },

  urlshortener: {
    label: 'Design a URL Shortener',
    prompt: 'Please design a URL shortening service like TinyURL.',
    questions: [
      {
        id: 'q-volume', text: 'What is the traffic volume?', weight: 3, key: true,
        reply: '100 million new URLs per day.',
        why: 'Gives ~1,160 writes/s, ~11,600 reads/s at a 10:1 ratio, and ~365 billion records over 10 years — the numbers every later choice rests on.',
        risk: 'You can’t size storage or know that reads dominate, so caching decisions have no basis.',
      },
      {
        id: 'q-length', text: 'How short must the URL be, and which characters are allowed?', weight: 3, key: true,
        reply: 'As short as possible; 0–9, a–z, A–Z.',
        why: '62 characters and 365 billion URLs means 7 characters are enough (62⁷ ≈ 3.5 trillion). This sets the encoding design.',
        risk: 'You can’t derive the short-code length or pick an encoding scheme.',
      },
      {
        id: 'q-update', text: 'Can short URLs be deleted or updated?', weight: 2,
        reply: 'Assume they can’t, for simplicity.',
        why: 'Immutable mappings make caching trivial — a cached entry never goes stale.',
      },
      {
        id: 'q-example', text: 'Can you walk me through how shortening and redirect should work?', weight: 1,
        reply: 'Long URL in, short alias out; clicking the alias redirects to the original.',
        why: 'Confirms the two use cases. Reasonable, though fairly obvious for this problem.',
      },
      {
        id: 'q-hash', text: 'Should I use MD5 or SHA-1 for the hash?', weight: -2,
        reply: 'Let’s hold that for later.',
        why: 'An implementation detail for the deep dive. Asking it first skips scoping entirely.',
      },
    ],
    fr: [
      { id: 'fr-shorten', text: 'Shorten a long URL', weight: 2, why: 'Core use case #1.' },
      { id: 'fr-redirect', text: 'Redirect a short URL to the original', weight: 2, why: 'Core use case #2 — and the hot path, since reads outnumber writes 10:1.' },
      { id: 'fr-alias', text: 'Custom aliases chosen by users', weight: -1, why: 'Not requested. It adds uniqueness checks and abuse handling; mention it as a possible extension.' },
      { id: 'fr-analytics', text: 'Click analytics dashboard', weight: -1, why: 'Not requested. Scoping it in steals time from the core design.' },
    ],
    nfr: [
      { id: 'nfr-read', text: 'Fast redirects for a read-heavy workload (~10:1)', weight: 2, why: 'Tells you where to spend effort: the read path and caching.' },
      { id: 'nfr-avail', text: 'High availability and fault tolerance', weight: 2, why: 'A broken redirect breaks every link that uses the service.' },
      { id: 'nfr-storage', text: 'Store ~365 billion mappings over 10 years (~365 TB)', weight: 2, why: 'Makes the storage requirement explicit so you can plan partitioning.' },
      { id: 'nfr-strong', text: 'Strongly consistent multi-region writes', weight: -1, why: 'Mappings never change once written, so global strong consistency buys little and costs latency.' },
    ],
    components: {
      lb: { role: 'core', why: 'Spreads ~11,600 redirects per second across servers.', pushback: 'At around 11,600 redirects per second, how is traffic spread across more than one server?' },
      app: { role: 'core', why: 'Handles POST /shorten and GET /{code}.', pushback: 'Which component actually handles the shorten and redirect requests?' },
      db: { role: 'core', why: 'Durably stores short → long mappings.', pushback: 'Where do 365 billion short-to-long mappings live durably?' },
      cache: { role: 'core', why: 'Popular links are read far more than written; caching them spares the database.', pushback: 'Reads are ten times writes — how do popular redirects avoid hitting the database every time?' },
      idgen: { role: 'useful', why: 'Required if you pick base62 conversion of a unique ID; a hash-based approach doesn’t need it.' },
      mq: { role: 'unneeded', why: 'Shortening is a single synchronous write; there’s nothing to queue.' },
      worker: { role: 'unneeded', why: 'There’s no fanout — each short URL maps to exactly one record.' },
      cdn: { role: 'unneeded', why: 'Responses are tiny redirects that need a lookup; a CDN adds little here.' },
      ws: { role: 'unneeded', why: 'Plain request/response; no server push required.' },
      presence: { role: 'unneeded', why: 'Nothing here has an online status.' },
      notif: { role: 'unneeded', why: 'No one needs to be notified.' },
    },
    deepDive: [
      {
        id: 'encoding',
        title: 'How is the short code generated?',
        options: [
          { text: 'Base62-encode a unique ID from a distributed ID generator', quality: 'strong', why: 'Unique by construction, so no collision checks. Trade-off: depends on the ID generator and codes are guessable in sequence.' },
          { text: 'Hash the long URL, take 7 chars, retry on collision', quality: 'ok', why: 'Works, and the book covers it — but each collision check is a database lookup (a Bloom filter helps). Mention that cost.' },
          { text: 'Random 7-character string with no collision check', quality: 'weak', why: 'Across billions of URLs, collisions will happen, and one user’s link would silently point to someone else’s page.' },
        ],
      },
      {
        id: 'storage',
        title: 'How are mappings stored and served?',
        options: [
          { text: 'Relational or key-value store + cache for hot URLs', quality: 'strong', why: 'Either store can hold <short, long> pairs; the cache absorbs the 10:1 read load. Immutable mappings mean no invalidation headaches.' },
          { text: 'Relational database, no cache', quality: 'weak', why: 'The store is fine, but every one of ~11,600 reads/s hits it. You ignored the read-heavy requirement you wrote down.' },
        ],
      },
    ],
  },

  chat: {
    label: 'Design a Chat System',
    prompt: 'Please design a chat system.',
    questions: [
      {
        id: 'q-kind', text: 'Is it 1-on-1 chat, group chat, or both?', weight: 3, key: true,
        reply: 'Both.',
        why: 'The book calls this the first thing to nail down — 1-on-1 and group chat route messages differently.',
        risk: 'You may design only one kind of message routing, and the interviewer expected both.',
      },
      {
        id: 'q-scale', text: 'What scale — a startup or massive?', weight: 3, key: true,
        reply: '50 million DAU.',
        why: 'Determines how many persistent connections you must hold and whether chat servers must scale horizontally.',
        risk: 'You can’t size the connection layer or storage.',
      },
      {
        id: 'q-features', text: 'Which features matter? Are attachments supported?', weight: 2, key: true,
        reply: '1-on-1, group chat and an online indicator. Text only.',
        why: 'Text-only removes media storage and a CDN; the online indicator adds presence.',
        risk: 'You may add media storage nobody needs, or miss the online indicator.',
      },
      {
        id: 'q-group', text: 'What is the maximum group size?', weight: 2,
        reply: '100 people.',
        why: 'Small groups make it reasonable to copy each message to every member’s inbox.',
      },
      {
        id: 'q-history', text: 'How long is chat history kept?', weight: 2,
        reply: 'Forever.',
        why: 'Drives the storage choice — a huge, ever-growing dataset of mostly recent reads.',
      },
      {
        id: 'q-erlang', text: 'Should we build it in Erlang like WhatsApp?', weight: -2,
        reply: 'Use whatever you’re comfortable with.',
        why: 'Language choice isn’t a requirement question. It signals you are anchoring on a known product instead of this problem.',
      },
    ],
    fr: [
      { id: 'fr-1on1', text: '1-on-1 messaging with low latency', weight: 2, why: 'A named core feature.' },
      { id: 'fr-group', text: 'Group chat (up to 100 members)', weight: 2, why: 'A named core feature with a known size limit.' },
      { id: 'fr-presence', text: 'Online presence indicator', weight: 2, why: 'A named feature that needs its own component.' },
      { id: 'fr-push', text: 'Push notifications for offline users', weight: 1, why: 'The book includes it; reasonable as a supporting feature.' },
      { id: 'fr-calls', text: 'Voice and video calls', weight: -2, why: 'Not requested, and a completely different real-time media problem.' },
    ],
    nfr: [
      { id: 'nfr-latency', text: 'Low delivery latency', weight: 2, why: 'Chat feels broken if messages lag — this justifies persistent connections.' },
      { id: 'nfr-scale', text: 'Supports 50M DAU', weight: 2, why: 'Writes down the scale that sizes the connection layer.' },
      { id: 'nfr-durable', text: 'Durable history, kept forever', weight: 2, why: 'Sets the expectation that storage must grow without limit.' },
      { id: 'nfr-e2e', text: 'End-to-end encryption from day one', weight: -1, why: 'Not required now. Flag it as a later topic rather than scoping it in.' },
    ],
    components: {
      lb: { role: 'core', why: 'Routes clients to API servers and assigns chat servers.', pushback: 'With 50 million daily users, how do clients get spread across servers?' },
      app: { role: 'core', why: 'Stateless API servers for login, signup and profiles.', pushback: 'Where do signup, login and profile requests go? Those don’t need a persistent connection.' },
      ws: { role: 'core', why: 'Hold persistent connections so the server can push messages instantly.', pushback: 'How does the server deliver a new message to the recipient without the client constantly polling?' },
      db: { role: 'core', why: 'Stores chat history (the book picks a key-value store).', pushback: 'History is kept forever — where is it stored?' },
      presence: { role: 'core', why: 'Tracks who is online via heartbeats.', pushback: 'The interviewer asked for an online indicator. What tracks whether a user is online?' },
      notif: { role: 'useful', why: 'Delivers messages to users who are offline.' },
      idgen: { role: 'useful', why: 'Messages need IDs that sort by time within a conversation.' },
      mq: { role: 'useful', why: 'The book’s group-chat design copies each message into a per-recipient sync queue.' },
      cache: { role: 'useful', why: 'Can hold recent messages or session data.' },
      worker: { role: 'unneeded', why: 'Groups cap at 100, so delivery happens through the chat servers and sync queues, not a separate fanout fleet.' },
      cdn: { role: 'unneeded', why: 'Text only — there’s no media to serve.' },
    },
    deepDive: [
      {
        id: 'protocol',
        title: 'How does the server push messages to clients?',
        options: [
          { text: 'WebSocket: persistent two-way connection', quality: 'strong', why: 'The server can send the moment a message arrives. Trade-off: chat servers become stateful, so you need a way to find which server holds a user’s connection.' },
          { text: 'Long polling', quality: 'ok', why: 'Works, and the book discusses it — but the server can’t easily tell if a client disconnected, and idle users still make periodic requests.' },
          { text: 'Short polling every second', quality: 'weak', why: 'Most requests return nothing. At 50M users that is enormous wasted load, and latency is up to a full polling interval.' },
        ],
      },
      {
        id: 'presence',
        title: 'How is online/offline status tracked?',
        options: [
          { text: 'Client heartbeats; mark offline if none arrive for ~30 s', quality: 'strong', why: 'Tolerates brief network blips (e.g. a tunnel) without flapping the status. This is the book’s approach.' },
          { text: 'Mark offline immediately on disconnect', quality: 'ok', why: 'Simple, but flaky mobile networks cause constant online/offline flicker that fans out to every friend.' },
          { text: 'Every client polls the database every 1 s', quality: 'weak', why: 'Millions of polling reads per second for a signal that rarely changes — the database becomes the bottleneck.' },
        ],
      },
    ],
  },
};

const WRAP_UP: Choice[] = [
  { id: 'w-bottleneck', text: 'Point out bottlenecks and what you would improve', weight: 1, why: 'The book is blunt: never say your design is perfect. Self-critique shows judgment.' },
  { id: 'w-recap', text: 'Recap the design and the key decisions', weight: 1, why: 'Refreshes the interviewer’s memory after a long session, especially if you proposed several options.' },
  { id: 'w-errors', text: 'Discuss error cases: server failure, network loss', weight: 1, why: 'Shows you think about what happens when things break, not just the happy path.' },
  { id: 'w-ops', text: 'Operations: metrics, error logs, how to roll it out', weight: 1, why: 'Real systems must be monitored and deployed; mentioning this signals production experience.' },
  { id: 'w-scale', text: 'Next scale curve: what changes at 10× users', weight: 1, why: 'Shows you know which parts of today’s design would break first as traffic grows.' },
  { id: 'w-perfect', text: 'Tell the interviewer the design is complete and has no weak spots', weight: -1, why: 'A red flag. Every design has trade-offs; claiming none suggests you don’t see them.' },
  { id: 'w-detail', text: 'Spend the remaining minutes detailing one algorithm’s internals', weight: -1, why: 'The book warns against this (its example: explaining a feed-ranking algorithm in detail). It eats time without showing system-design skill.' },
];

const WRAP_TARGET = 4;
const QUALITY_POINTS: Record<Quality, number> = { strong: 1, ok: 0.5, weak: 0 };

interface SimState {
  problem: ProblemId;
  step: 1 | 2 | 3 | 4 | 5;
  questions: string[];
  fr: string[];
  nfr: string[];
  components: ComponentId[];
  buyIn: { status: 'none' | 'approved' | 'pushback'; message: string; attempts: number };
  deepDive: Record<string, number>;
  wrapUp: string[];
}

const freshSim = (problem: ProblemId): SimState => ({
  problem,
  step: 1,
  questions: [],
  fr: [],
  nfr: [],
  components: [],
  buyIn: { status: 'none', message: '', attempts: 0 },
  deepDive: {},
  wrapUp: [],
});

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const sumWeights = (list: Choice[]) => list.reduce((a, c) => a + c.weight, 0);
const toneOfWeight = (w: number): Tone => (w >= 2 ? 'good' : w > 0 ? 'ok' : 'bad');
const toneOfQuality = (q: Quality): Tone => (q === 'strong' ? 'good' : q === 'ok' ? 'ok' : 'bad');
const toneOfRole = (r: ComponentRole['role']): Tone => (r === 'core' ? 'good' : r === 'useful' ? 'ok' : 'bad');

function scoreStage1(p: ProblemDef, s: SimState) {
  const all = [...p.questions, ...p.fr, ...p.nfr];
  const picked = new Set([...s.questions, ...s.fr, ...s.nfr]);
  const max = sumWeights(all.filter((c) => c.weight > 0));
  return Math.round(clamp01(sumWeights(all.filter((c) => picked.has(c.id))) / max) * 25);
}

function scoreStage2(p: ProblemDef, s: SimState) {
  const core = COMPONENTS.filter((c) => p.components[c.id].role === 'core');
  const coreHit = core.filter((c) => s.components.includes(c.id)).length;
  const unneeded = s.components.filter((id) => p.components[id].role === 'unneeded').length;
  const pushbacks = Math.max(0, s.buyIn.attempts - 1);
  return Math.round((15 * coreHit) / core.length + Math.max(0, 5 - 2 * unneeded) + Math.max(0, 5 - 2 * pushbacks));
}

function scoreStage3(p: ProblemDef, s: SimState) {
  const pts = p.deepDive.reduce((a, t) => {
    const i = s.deepDive[t.id];
    return a + (i === undefined || !t.options[i] ? 0 : QUALITY_POINTS[t.options[i].quality]);
  }, 0);
  return Math.round((pts / p.deepDive.length) * 25);
}

function scoreStage4(s: SimState) {
  const picked = WRAP_UP.filter((w) => s.wrapUp.includes(w.id));
  const good = picked.filter((w) => w.weight > 0).length;
  const bad = picked.filter((w) => w.weight < 0).length;
  return Math.round(clamp01((Math.min(good, WRAP_TARGET) - bad) / WRAP_TARGET) * 25);
}

// ---------- small presentational helpers ----------

const TONE_CLASSES: Record<Tone, string> = {
  good: 'bg-emerald-50 text-emerald-900 border-emerald-200 dark:bg-emerald-400/[0.08] dark:text-emerald-100 dark:border-emerald-400/30',
  ok: 'bg-amber-50 text-amber-900 border-amber-200 dark:bg-amber-400/[0.08] dark:text-amber-100 dark:border-amber-400/30',
  bad: 'bg-rose-50 text-rose-900 border-rose-200 dark:bg-rose-400/[0.08] dark:text-rose-100 dark:border-rose-400/30',
};
const TONE_LABEL: Record<Tone, string> = { good: 'Strong', ok: 'Okay', bad: 'Weak' };

const FeedbackNote: React.FC<{ tone: Tone; children: React.ReactNode }> = ({ tone, children }) => (
  <div className={`mt-1.5 rounded-lg border px-3 py-2 text-xs leading-relaxed ${TONE_CLASSES[tone]}`}>
    <strong className="mr-1">{TONE_LABEL[tone]}:</strong>
    {children}
  </div>
);

const ChoiceButton: React.FC<{
  picked: boolean;
  onClick: () => void;
  text: string;
  tone: Tone;
  feedback: React.ReactNode;
}> = ({ picked, onClick, text, tone, feedback }) => (
  <div>
    <button
      onClick={onClick}
      aria-pressed={picked}
      className={`w-full p-2.5 rounded-xl border text-left text-xs transition-all flex items-start gap-2 ${
        picked
          ? 'bg-amber-50 border-amber-400 text-slate-900 font-semibold dark:bg-amber-400/10 dark:border-amber-400/60 dark:text-white'
          : 'bg-slate-50 border-slate-200 text-slate-700 hover:border-slate-300 dark:bg-slate-950 dark:border-slate-800 dark:text-slate-300 dark:hover:border-slate-700'
      }`}
    >
      <span
        className={`w-4 h-4 rounded border shrink-0 mt-0.5 flex items-center justify-center ${
          picked ? 'bg-amber-500 border-amber-500 text-slate-950' : 'border-slate-400 dark:border-slate-600'
        }`}
      >
        {picked && <Check className="w-3 h-3 stroke-[3]" />}
      </span>
      <span>{text}</span>
    </button>
    {picked && <FeedbackNote tone={tone}>{feedback}</FeedbackNote>}
  </div>
);

const backBtn =
  'px-4 py-2 rounded-xl text-xs font-bold bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700';
const nextBtn =
  'px-6 py-3 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold rounded-2xl text-xs flex items-center space-x-2 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-md';

const TIME_SPLIT = [
  { step: 'Step 1: Understand the problem & scope', min: 3, max: 10, color: 'bg-blue-500', light: 'bg-blue-500/30', desc: 'Ask clarifying questions, agree on features and scale, write assumptions down.' },
  { step: 'Step 2: High-level design & buy-in', min: 10, max: 15, color: 'bg-amber-500', light: 'bg-amber-500/30', desc: 'Sketch the blueprint, check it against the scale, and get the interviewer to agree.' },
  { step: 'Step 3: Design deep dive', min: 10, max: 25, color: 'bg-indigo-500', light: 'bg-indigo-500/30', desc: 'Work through the 2–3 components the interviewer cares most about, with trade-offs.' },
  { step: 'Step 4: Wrap up', min: 3, max: 5, color: 'bg-emerald-500', light: 'bg-emerald-500/30', desc: 'Recap, point out bottlenecks and failure cases, discuss the next scale curve.' },
];
const INTERVIEW_MIN = 45;
const pctOf45 = (m: number) => Math.round((m / INTERVIEW_MIN) * 100);

export const Chapter3Framework: React.FC<Chapter3FrameworkProps> = ({ isDarkMode = false }) => {
  const [activeTab, setActiveTab] = usePersistentState<SectionTab>('chapter3:tab', 'intro');
  const [sim, setSim] = usePersistentState<SimState>('chapter3:sim', freshSim('newsfeed'));

  const P = PROBLEMS[sim.problem] ?? PROBLEMS.newsfeed;
  const update = (patch: Partial<SimState>) => setSim((prev) => ({ ...prev, ...patch }));
  const toggleIn = <T,>(list: T[], item: T) => (list.includes(item) ? list.filter((i) => i !== item) : [...list, item]);

  const body = isDarkMode ? 'text-slate-300' : 'text-slate-600';
  const heading = isDarkMode ? 'text-white' : 'text-slate-900';
  const panel = isDarkMode ? 'bg-[#1c1c1e] border-slate-800' : 'bg-white border-slate-200';
  const inset = isDarkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200';

  // ---------- simulator derived values ----------
  const missingKeyQuestions = P.questions.filter((q) => q.key && !sim.questions.includes(q.id));
  const stage1Ready = sim.questions.length > 0 && sim.fr.length > 0 && sim.nfr.length > 0;

  const presentBlueprint = () => {
    const attempts = sim.buyIn.attempts + 1;
    const missing = COMPONENTS.filter((c) => P.components[c.id].role === 'core' && !sim.components.includes(c.id));
    if (missing.length > 0) {
      const more = missing.length > 1 ? ` (${missing.length} core pieces are still missing.)` : '';
      update({ buyIn: { status: 'pushback', message: `${P.components[missing[0].id].pushback}${more}`, attempts } });
      return;
    }
    const extra = COMPONENTS.find((c) => sim.components.includes(c.id) && P.components[c.id].role === 'unneeded');
    const message = extra
      ? `This covers the core flows, so let’s go deeper. One question first: why do we need the ${extra.name}? (${P.components[extra.id].why})`
      : 'This covers the core flows and fits the scale. Let’s dig into the bottlenecks.';
    update({ buyIn: { status: 'approved', message, attempts } });
  };

  const scores = [scoreStage1(P, sim), scoreStage2(P, sim), scoreStage3(P, sim), scoreStage4(sim)];
  const totalScore = scores.reduce((a, b) => a + b, 0);

  const buildFeedback = () => {
    const strengths: string[][] = [[], [], [], []];
    const improve: string[][] = [[], [], [], []];
    const s1 = [...P.questions, ...P.fr, ...P.nfr];
    const picked1 = new Set([...sim.questions, ...sim.fr, ...sim.nfr]);

    const keyAsked = P.questions.filter((q) => q.key && picked1.has(q.id));
    if (keyAsked.length) strengths[0].push(`Asked the key questions: ${keyAsked.map((q) => `“${q.text}”`).join(', ')}.`);
    missingKeyQuestions.forEach((q) => improve[0].push(`Didn’t ask “${q.text}” — ${q.risk}`));
    s1.filter((c) => c.weight < 0 && picked1.has(c.id)).forEach((c) => improve[0].push(`“${c.text}”: ${c.why}`));
    s1.filter((c) => c.weight >= 2 && !c.key && !picked1.has(c.id) && !c.id.startsWith('q-')).forEach((c) =>
      improve[0].push(`Didn’t state the requirement “${c.text}”. ${c.why}`)
    );

    const core = COMPONENTS.filter((c) => P.components[c.id].role === 'core');
    if (core.every((c) => sim.components.includes(c.id))) strengths[1].push(`Included every core component (${core.map((c) => c.name).join(', ')}).`);
    const useful = COMPONENTS.filter((c) => sim.components.includes(c.id) && P.components[c.id].role === 'useful');
    if (useful.length) strengths[1].push(`Sensible extras: ${useful.map((c) => c.name).join(', ')}.`);
    if (sim.buyIn.attempts > 1)
      improve[1].push(`The interviewer pushed back ${sim.buyIn.attempts - 1} time(s) before agreeing. Walk through a concrete use case (e.g. “a user posts”) before presenting — it exposes missing pieces.`);
    else if (sim.buyIn.attempts === 1) strengths[1].push('Got buy-in on the first presentation.');
    COMPONENTS.filter((c) => sim.components.includes(c.id) && P.components[c.id].role === 'unneeded').forEach((c) =>
      improve[1].push(`${c.name} isn’t needed here: ${P.components[c.id].why} Unjustified components read as over-engineering.`)
    );

    P.deepDive.forEach((t) => {
      const opt = t.options[sim.deepDive[t.id]];
      if (!opt) return;
      if (opt.quality === 'strong') strengths[2].push(`${t.title} — ${opt.text}. ${opt.why}`);
      else {
        const best = t.options.find((o) => o.quality === 'strong');
        improve[2].push(`${t.title} — you chose “${opt.text}”. ${opt.why}${best ? ` Stronger: ${best.text}.` : ''}`);
      }
    });

    const wrapPicked = WRAP_UP.filter((w) => sim.wrapUp.includes(w.id));
    const goodWrap = wrapPicked.filter((w) => w.weight > 0);
    if (goodWrap.length) strengths[3].push(`Covered: ${goodWrap.map((w) => w.text.toLowerCase()).join('; ')}.`);
    wrapPicked.filter((w) => w.weight < 0).forEach((w) => improve[3].push(`“${w.text}”: ${w.why}`));
    if (goodWrap.length < WRAP_TARGET) {
      const missed = WRAP_UP.filter((w) => w.weight > 0 && !sim.wrapUp.includes(w.id));
      improve[3].push(`Aim for ${WRAP_TARGET} wrap-up points. Not covered: ${missed.map((w) => w.text.toLowerCase()).join('; ')}.`);
    }
    return { strengths, improve };
  };

  return (
    <div className="space-y-6">

      {/* CHAPTER HEADER BANNER */}
      <div className={`p-6 sm:p-8 rounded-3xl border shadow-xl relative overflow-hidden transition-all ${
        isDarkMode
          ? 'bg-[#161616] border-white/[0.08] text-white'
          : 'bg-white border-slate-200 text-slate-900'
      }`}>
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2 max-w-3xl">
            <div className="flex items-center space-x-2">
              <span className="px-3 py-1 bg-amber-500 text-slate-950 font-mono text-xs font-black rounded-full uppercase tracking-wider">
                CHAPTER 3
              </span>
              <span className={`text-xs font-semibold ${isDarkMode ? 'text-amber-400' : 'text-amber-700'}`}>
                A Framework for System Design Interviews
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold tracking-tight">
              A 4-Step Process for Effective System Design Interviews
            </h1>
            <p className={`text-xs sm:text-sm leading-relaxed ${body}`}>
              An open-ended design question has no single right answer. What the interviewer evaluates is how you get to an answer: the questions you ask, the trade-offs you name, and how you respond to feedback. This chapter gives you a repeatable 4-step structure for that conversation.
            </p>
          </div>

          <button
            onClick={() => setActiveTab('simulator')}
            className="shrink-0 px-5 py-3 bg-gradient-to-r from-amber-500 via-orange-500 to-indigo-600 hover:opacity-95 text-white font-bold rounded-2xl shadow-lg flex items-center space-x-2 text-xs transition-transform active:scale-95"
          >
            <Sparkles className="w-4 h-4" />
            <span>Launch Interview Simulator</span>
          </button>
        </div>
      </div>

      {/* SUB-NAVIGATION TABS */}
      <div className={`flex items-center space-x-1 p-1.5 rounded-2xl border overflow-x-auto no-scrollbar text-xs font-semibold ${
        isDarkMode ? 'bg-[#1c1c1e]/80 border-slate-800' : 'bg-white border-slate-200 shadow-xs'
      }`}>
        {[
          { id: 'intro', label: '1. Introduction & Mindset', icon: BookOpen },
          { id: 'step1', label: '2. Step 1: Understand & Scope', icon: HelpCircle },
          { id: 'step2', label: '3. Step 2: High-Level Design', icon: Layers },
          { id: 'step3', label: '4. Step 3: Deep Dive', icon: Cpu },
          { id: 'step4', label: '5. Step 4: Wrap Up', icon: CheckCircle2 },
          { id: 'dos-donts', label: '6. Dos & Don’ts', icon: AlertTriangle },
          { id: 'time-split', label: '7. Time Allocation', icon: Clock },
          { id: 'simulator', label: 'Interview Simulator', icon: Sparkles, highlight: true },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as SectionTab)}
              className={`flex items-center space-x-2 px-3.5 py-2 rounded-xl whitespace-nowrap transition-all ${
                isActive
                  ? tab.highlight
                    ? 'bg-gradient-to-r from-amber-500 to-orange-600 text-white font-bold shadow-md'
                    : 'bg-amber-500 text-slate-950 font-bold shadow-xs'
                  : tab.highlight
                  ? 'text-amber-700 dark:text-amber-400 font-bold hover:bg-amber-500/10'
                  : isDarkMode
                  ? 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* TAB CONTENT AREAS */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.2 }}
        >
          {/* ========================================================= */}
          {/* TAB 1: INTRODUCTION & MINDSET */}
          {/* ========================================================= */}
          {activeTab === 'intro' && (
            <div className="space-y-6">
              <LessonGoal
                goal="What a system design interview actually measures, and why a fixed structure helps."
                why="Nobody expects you to design Google search in an hour. The interview simulates two co-workers working through an ambiguous problem together."
              />

              <div className={`p-6 rounded-3xl border space-y-4 ${panel}`}>
                <div className="flex items-center space-x-3">
                  <div className="p-3 bg-amber-500/10 text-amber-500 rounded-2xl border border-amber-500/20">
                    <Lightbulb className="w-6 h-6" />
                  </div>
                  <div>
                    <h2 className={`text-lg font-bold ${heading}`}>What is a System Design Interview?</h2>
                    <p className="text-xs text-slate-500">The process matters more than the final diagram</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
                  <div className={`p-4 rounded-2xl border space-y-2 ${inset}`}>
                    <h3 className="font-bold text-xs text-amber-600 dark:text-amber-400 uppercase">1. No single correct answer</h3>
                    <p className={`text-xs leading-relaxed ${body}`}>
                      The problem is open-ended. Every decision is a trade-off (e.g. consistency vs latency, cost vs availability), and a design for a young startup looks different from one for a company with millions of users.
                    </p>
                  </div>
                  <div className={`p-4 rounded-2xl border space-y-2 ${inset}`}>
                    <h3 className="font-bold text-xs text-indigo-600 dark:text-indigo-400 uppercase">2. Signals beyond technical skill</h3>
                    <p className={`text-xs leading-relaxed ${body}`}>
                      Interviewers look for how you collaborate, work under pressure, resolve ambiguity, and ask good questions — many specifically look for that last skill.
                    </p>
                  </div>
                  <div className={`p-4 rounded-2xl border space-y-2 ${inset}`}>
                    <h3 className="font-bold text-xs text-rose-600 dark:text-rose-400 uppercase">3. Red flags</h3>
                    <p className={`text-xs leading-relaxed ${body}`}>
                      <Term term="Over-engineering">Adding complexity the requirements don’t need — extra services, stricter guarantees, more scale than asked. It has compounding real-world costs.</Term> is the one the book singles out. Narrow-mindedness and stubbornness are others.
                    </p>
                  </div>
                </div>
              </div>

              <div className={`p-6 rounded-3xl border space-y-4 ${panel}`}>
                <h3 className={`text-base font-bold ${heading}`}>Why a structured approach helps</h3>
                <p className={`text-xs leading-relaxed ${body}`}>
                  Without a structure, it’s easy to jump straight into database schemas, spend 20 minutes on one component, or run out of time before discussing what breaks at scale. The four steps below make sure each of those gets its turn.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-2">
                  {[
                    { step: '01', title: 'Understand & Scope', desc: 'Ask clarifying questions; agree on features and scale.', color: 'text-blue-500' },
                    { step: '02', title: 'High-Level Design', desc: 'Sketch the blueprint and get the interviewer to agree.', color: 'text-amber-500' },
                    { step: '03', title: 'Design Deep Dive', desc: 'Drill into the most important components and trade-offs.', color: 'text-indigo-500' },
                    { step: '04', title: 'Wrap Up', desc: 'Recap, point out bottlenecks and failure cases, next scale.', color: 'text-emerald-500' },
                  ].map((s) => (
                    <div key={s.step} className={`p-4 rounded-2xl border space-y-2 ${inset}`}>
                      <span className={`text-2xl font-black font-mono ${s.color}`}>{s.step}</span>
                      <h4 className={`font-bold text-xs ${heading}`}>{s.title}</h4>
                      <p className={`text-xs leading-relaxed ${body}`}>{s.desc}</p>
                    </div>
                  ))}
                </div>
              </div>

              <Takeaway>
                The final design matters less than the process: show how you reason, defend choices, and take feedback — without over-engineering.
              </Takeaway>
              <Quiz
                persistKey="chapter3:quiz:intro"
                questions={[
                  {
                    question: 'Which red flag does the book single out as “a real disease of many engineers”?',
                    options: [
                      { text: 'Over-engineering: adding complexity the requirements don’t need', correct: true, why: 'Right. Engineers enjoy design purity and ignore trade-offs; in practice those extra pieces carry compounding costs.' },
                      { text: 'Not knowing the internals of a specific database', why: 'Knowing internals can help in a deep dive, but the book doesn’t treat it as a red flag. Reasoning about trade-offs matters more.' },
                      { text: 'Asking too many clarifying questions', why: 'The opposite — the book says asking good questions is a skill many interviewers specifically look for.' },
                      { text: 'Drawing a design that doesn’t match a real company’s architecture', why: 'There is no single right answer; no one expects you to reproduce a real system.' },
                    ],
                  },
                  {
                    question: 'If the final design matters less, what is the interviewer mostly evaluating?',
                    options: [
                      { text: 'How you collaborate, resolve ambiguity, defend choices and respond to feedback', correct: true, why: 'Yes. The session simulates two co-workers solving an open-ended problem together.' },
                      { text: 'Whether you can recall well-known architectures from memory', why: 'Memorised diagrams don’t show how you handle a new problem’s constraints.' },
                      { text: 'How many technologies you can name', why: 'Naming technology without a reason tends to count against you — it can look like over-engineering.' },
                    ],
                  },
                ]}
              />
            </div>
          )}

          {/* ========================================================= */}
          {/* TAB 2: STEP 1 - UNDERSTAND & SCOPE */}
          {/* ========================================================= */}
          {activeTab === 'step1' && (
            <div className="space-y-6">
              <LessonGoal
                goal="How to turn a vague prompt into agreed features and numbers before you draw anything."
                why="Answering fast without understanding the requirements is a big red flag — it tends to produce a design for the wrong system."
              />

              <div className={`p-6 rounded-3xl border space-y-4 ${
                isDarkMode ? 'bg-rose-950/20 border-rose-900/40 text-slate-200' : 'bg-rose-50 border-rose-200 text-slate-800'
              }`}>
                <div className="flex items-center space-x-3">
                  <div className="p-2.5 bg-rose-500/20 text-rose-500 rounded-2xl border border-rose-500/30">
                    <ShieldAlert className="w-6 h-6" />
                  </div>
                  <div>
                    <span className="text-xs text-rose-600 dark:text-rose-400 uppercase font-black">Common pitfall</span>
                    <h3 className="text-base font-bold text-rose-700 dark:text-rose-400">Don’t be like Jimmy</h3>
                  </div>
                </div>
                <p className="text-xs leading-relaxed">
                  The book’s Jimmy is the student who always answers first, whether or not he has thought it through. In a system design interview that habit backfires: there are no points for speed. If Jimmy hears “design a news feed” and starts drawing caches and queues, he may be designing for the wrong scale, the wrong ordering, or media the product doesn’t support.
                </p>
                <p className="text-xs font-bold text-rose-700 dark:text-rose-300">
                  Slow down. Ask questions to clarify requirements and assumptions first.
                </p>
              </div>

              <div className={`p-6 rounded-3xl border space-y-5 ${panel}`}>
                <h3 className={`text-base font-bold ${heading}`}>What to ask</h3>
                <p className={`text-xs leading-relaxed ${body}`}>
                  The book suggests starting with: what specific features are we building? How many users are there? How fast is the company expecting to grow (3 months, 6 months, a year)? What is the existing tech stack, and are there services we can reuse? If the interviewer asks <em>you</em> to make an assumption, write it on the board — you’ll need it later.
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className={`p-4 rounded-2xl border space-y-2 ${inset}`}>
                    <h4 className="font-bold text-xs text-blue-600 dark:text-blue-400 uppercase">
                      <Term term="Functional requirements">What the system must do — the features users interact with.</Term>
                    </h4>
                    <ul className={`text-xs space-y-1 list-disc list-inside pt-1 ${body}`}>
                      <li>User can publish a post.</li>
                      <li>User can see friends’ posts in their feed.</li>
                      <li>Feed is in reverse-chronological order.</li>
                    </ul>
                  </div>
                  <div className={`p-4 rounded-2xl border space-y-2 ${inset}`}>
                    <h4 className="font-bold text-xs text-amber-700 dark:text-amber-400 uppercase">
                      <Term term="Non-functional requirements">How well it must do it — latency, availability, scale, consistency.</Term>
                    </h4>
                    <ul className={`text-xs space-y-1 list-disc list-inside pt-1 ${body}`}>
                      <li>Feed loads fast (it is read far more than written).</li>
                      <li>Highly available; a few seconds’ delay before friends see a post is fine.</li>
                      <li>Handles 10 million daily active users.</li>
                    </ul>
                  </div>
                </div>

                <div className={`p-4 rounded-2xl border space-y-3 ${inset}`}>
                  <h4 className={`font-bold text-xs uppercase ${isDarkMode ? 'text-amber-400' : 'text-amber-700'}`}>
                    Example dialogue from the book: “Design a news feed”
                  </h4>
                  <div className="space-y-2 text-xs">
                    {[
                      { c: 'Is this a mobile app, a web app, or both?', i: 'Both.', why: 'Mobile clients change how you think about bandwidth and pagination.' },
                      { c: 'What are the most important features?', i: 'Making a post and seeing friends’ news feed.', why: 'Sets the scope to two flows.' },
                      { c: 'Is the feed reverse-chronological or ranked by some weight?', i: 'Reverse chronological, to keep it simple.', why: 'Removes a ranking system from scope.' },
                      { c: 'How many friends can a user have?', i: '5,000.', why: 'One post may need to reach 5,000 feeds — the fanout cost.' },
                      { c: 'What is the traffic volume?', i: '10 million daily active users (DAU).', why: 'Sizes servers, caches and storage.' },
                      { c: 'Can the feed contain images and videos, or just text?', i: 'Both images and videos.', why: 'Means media storage and a CDN.' },
                    ].map((d) => (
                      <div key={d.c} className="space-y-1">
                        <div className="p-2.5 rounded-xl bg-blue-50 border border-blue-200 text-blue-900 dark:bg-blue-500/10 dark:border-blue-500/20 dark:text-blue-200">
                          <strong>Candidate:</strong> {d.c}
                          <span className={`block mt-1 ${body}`}>Why ask: {d.why}</span>
                        </div>
                        <div className="p-2.5 rounded-xl bg-purple-50 border border-purple-200 text-purple-900 dark:bg-purple-500/10 dark:border-purple-500/20 dark:text-purple-200">
                          <strong>Interviewer:</strong> {d.i}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <Takeaway>
                Every answer in step 1 removes a guess from step 2. Scale (10M DAU) and fanout (5,000 friends) will drive the deep dive later.
              </Takeaway>
              <Quiz
                persistKey="chapter3:quiz:step1"
                questions={[
                  {
                    question: 'You ask about scale and the interviewer says “you tell me — make an assumption.” What do you do?',
                    options: [
                      { text: 'State a reasonable number and write it on the board', correct: true, why: 'The book’s advice exactly: write assumptions down, because later decisions depend on them.' },
                      { text: 'Pick the largest plausible number so the design is safe', why: 'Designing for more scale than needed is over-engineering; pick something reasonable and say why.' },
                      { text: 'Skip scale and start the high-level design', why: 'Without a number you can’t justify caches, sharding or fanout choices later.' },
                      { text: 'Insist the interviewer gives you a real number', why: 'Asking the interviewer to decide is fine; refusing to proceed is stubbornness, another red flag.' },
                    ],
                  },
                  {
                    question: 'Why does “how many friends can a user have?” matter for a news feed?',
                    options: [
                      { text: 'It sets the fanout cost: one post may be copied into up to 5,000 feeds', correct: true, why: 'Yes. That multiplier decides whether push-based fanout is affordable.' },
                      { text: 'It decides which database vendor to use', why: 'Vendor choice follows from access patterns; friend count affects write amplification, not the brand of database.' },
                      { text: 'It doesn’t — only DAU matters for scale', why: 'DAU tells you how many users; friend count tells you how much work each post creates. Both matter.' },
                    ],
                  },
                ]}
              />
            </div>
          )}

          {/* ========================================================= */}
          {/* TAB 3: STEP 2 - HIGH-LEVEL DESIGN */}
          {/* ========================================================= */}
          {activeTab === 'step2' && (
            <div className="space-y-6">
              <LessonGoal
                goal="How to propose a blueprint and get the interviewer to agree before going deep."
                why="Agreement on the big picture is what lets you spend deep-dive time on the parts the interviewer actually cares about."
              />

              <div className={`p-6 rounded-3xl border space-y-4 ${panel}`}>
                <h3 className={`text-base font-bold ${heading}`}>Step 2: Propose a high-level design and get buy-in</h3>
                <ul className={`text-xs leading-relaxed space-y-1.5 list-disc list-inside ${body}`}>
                  <li>Come up with an initial blueprint and <strong>ask for feedback</strong>. Treat the interviewer as a teammate.</li>
                  <li>Draw box diagrams of key components: clients, APIs, web servers, data stores, cache, CDN, message queue.</li>
                  <li>Do <Term term="back-of-the-envelope">Quick rough estimates (QPS, storage) to check a design fits the scale — see Chapter 2.</Term> calculations to check the blueprint fits the scale. Ask whether the interviewer wants them first.</li>
                  <li>Walk through a few concrete use cases. They frame the design and often reveal edge cases.</li>
                  <li>API endpoints and schema? It depends — too low-level for “design Google search”, fair game for a multiplayer poker backend. Ask.</li>
                </ul>

                <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 space-y-3">
                  <h4 className="font-bold text-xs text-amber-700 dark:text-amber-400 uppercase">
                    Book example: a news feed splits into two flows
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                    <div className={`p-3 rounded-xl border ${inset}`}>
                      <h5 className="font-bold text-blue-600 dark:text-blue-400 mb-1">1. Feed publishing</h5>
                      <p className={body}>When a user posts, the data is written to cache and database, and the post is populated into friends’ news feeds.</p>
                    </div>
                    <div className={`p-3 rounded-xl border ${inset}`}>
                      <h5 className="font-bold text-indigo-600 dark:text-indigo-400 mb-1">2. News feed building</h5>
                      <p className={body}>The feed is built by aggregating friends’ posts in reverse-chronological order — e.g. via <code className="font-mono">GET /v1/me/feed</code>.</p>
                    </div>
                  </div>
                </div>

                <div className={`p-4 rounded-2xl border space-y-3 ${inset}`}>
                  <h4 className="font-bold text-xs text-slate-500 uppercase">Blueprint: the path a feed request takes</h4>
                  <div className="flex flex-col md:flex-row items-center justify-between gap-3 text-center text-xs py-2">
                    <div className="p-3 bg-blue-500/10 border border-blue-500/30 text-blue-700 dark:text-blue-300 rounded-xl w-full md:w-32">
                      <User className="w-4 h-4 mx-auto mb-1" />
                      Client app
                    </div>
                    <ArrowRight className="w-4 h-4 text-slate-400 shrink-0 hidden md:block" />
                    <div className="p-3 bg-purple-500/10 border border-purple-500/30 text-purple-700 dark:text-purple-300 rounded-xl w-full md:w-36">
                      <Wifi className="w-4 h-4 mx-auto mb-1" />
                      Load balancer
                    </div>
                    <ArrowRight className="w-4 h-4 text-slate-400 shrink-0 hidden md:block" />
                    <div className="p-3 bg-indigo-500/10 border border-indigo-500/30 text-indigo-700 dark:text-indigo-300 rounded-xl w-full md:w-36">
                      <Server className="w-4 h-4 mx-auto mb-1" />
                      Web servers
                    </div>
                    <ArrowRight className="w-4 h-4 text-slate-400 shrink-0 hidden md:block" />
                    <div className="p-3 bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-300 rounded-xl w-full md:w-44">
                      <Database className="w-4 h-4 mx-auto mb-1" />
                      Feed cache + database
                    </div>
                  </div>
                </div>
              </div>

              <Takeaway>
                A blueprint is a proposal, not a monologue. Present it, ask “does this match what you had in mind?”, and adjust before going deeper.
              </Takeaway>
              <Quiz
                persistKey="chapter3:quiz:step2"
                questions={[
                  {
                    question: 'You’ve drawn your first blueprint. What should you do next?',
                    options: [
                      { text: 'Ask the interviewer for feedback and adjust', correct: true, why: 'The goal of step 2 is agreement. Good interviewers like to get involved; treat them as a teammate.' },
                      { text: 'Immediately start designing the database schema in detail', why: 'Going deep on one component too early is one of the book’s don’ts. Get buy-in on the whole picture first.' },
                      { text: 'Keep adding components until nothing could possibly fail', why: 'That’s over-engineering. Add what the requirements need and discuss failures in the wrap-up.' },
                    ],
                  },
                  {
                    question: 'Should step 2 include API endpoints and a database schema?',
                    options: [
                      { text: 'It depends on the problem — ask the interviewer', correct: true, why: 'The book: too low-level for a huge problem like search, but fair game for something like a poker game backend.' },
                      { text: 'Always — the interviewer expects them', why: 'For broad problems it wastes time on detail before the big picture is agreed.' },
                      { text: 'Never — they belong only in the deep dive', why: 'For small, well-bounded problems the API is part of the high-level design.' },
                    ],
                  },
                ]}
              />
            </div>
          )}

          {/* ========================================================= */}
          {/* TAB 4: STEP 3 - DESIGN DEEP DIVE */}
          {/* ========================================================= */}
          {activeTab === 'step3' && (
            <div className="space-y-6">
              <LessonGoal
                goal="How to choose what to go deep on, and how to show trade-offs when you do."
                why="There isn’t time to detail everything. Picking the right 2–3 components — with the interviewer — is itself a signal."
              />

              <div className={`p-6 rounded-3xl border space-y-4 ${panel}`}>
                <h3 className={`text-base font-bold ${heading}`}>Step 3: Design deep dive</h3>
                <p className={`text-xs leading-relaxed ${body}`}>
                  By now you should have agreed on goals and scope, sketched a blueprint, and heard the interviewer’s reaction. Work with them to prioritise components. Some interviewers want to stay high-level; for senior roles the focus may be performance and bottlenecks. Avoid details that don’t show design skill — the book’s example is explaining a feed-ranking algorithm in depth.
                </p>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {[
                    { tag: 'News feed', color: 'text-amber-700 dark:text-amber-400', title: 'Fanout on write vs on read', problem: 'Pushing every post into every follower’s feed makes reads fast, but one very popular account creates millions of writes.', fix: 'Hybrid: push for most users, let followers pull celebrity posts at read time.' },
                    { tag: 'URL shortener', color: 'text-blue-600 dark:text-blue-400', title: 'Hash vs base62 conversion', problem: 'Truncated hashes can collide, and each collision check is a database lookup.', fix: 'Base62-encode a unique ID — collision-free, at the cost of depending on an ID generator.' },
                    { tag: 'Chat system', color: 'text-emerald-600 dark:text-emerald-400', title: 'Low latency & online status', problem: 'Polling wastes requests and delays messages; online status flickers on flaky networks.', fix: 'Persistent WebSocket connections, plus heartbeats with a timeout for presence.' },
                  ].map((ex) => (
                    <div key={ex.tag} className={`p-4 rounded-2xl border space-y-2 ${inset}`}>
                      <span className={`text-xs font-bold uppercase ${ex.color}`}>{ex.tag}</span>
                      <h4 className={`font-bold text-xs ${heading}`}>{ex.title}</h4>
                      <p className={`text-xs leading-relaxed ${body}`}><strong>Problem:</strong> {ex.problem}</p>
                      <p className={`text-xs leading-relaxed ${body}`}><strong>Common answer:</strong> {ex.fix}</p>
                    </div>
                  ))}
                </div>
              </div>

              <Takeaway>
                A deep dive is a trade-off discussion: name at least two options, say what each costs, and pick one for this problem’s requirements.
              </Takeaway>
              <Quiz
                persistKey="chapter3:quiz:step3"
                questions={[
                  {
                    question: 'Which of these is a poor use of deep-dive time in a news feed interview?',
                    options: [
                      { text: 'Explaining the internals of a feed-ranking algorithm in detail', correct: true, why: 'The book’s own example: it eats time and doesn’t show you can design a scalable system.' },
                      { text: 'Comparing fanout-on-write and fanout-on-read', why: 'That is the central scalability trade-off of a news feed — a strong deep-dive topic.' },
                      { text: 'Discussing how to handle accounts with millions of followers', why: 'Hot spots from celebrities are exactly the bottleneck worth digging into.' },
                    ],
                  },
                  {
                    question: 'How should you decide which components to deep dive into?',
                    options: [
                      { text: 'Prioritise with the interviewer, watching for hints about what they care about', correct: true, why: 'Every interview is different; the book stresses working with the interviewer to pick focus areas.' },
                      { text: 'Always start with the database, since it’s the hardest part', why: 'Sometimes it is, sometimes not — for chat, connections and presence may matter more.' },
                      { text: 'Cover every component equally', why: 'There’s no time, and it spreads your signal thin. Critical components first.' },
                    ],
                  },
                ]}
              />
            </div>
          )}

          {/* ========================================================= */}
          {/* TAB 5: STEP 4 - WRAP UP */}
          {/* ========================================================= */}
          {activeTab === 'step4' && (
            <div className="space-y-6">
              <LessonGoal
                goal="What to say in the last few minutes to leave a strong final impression."
                why="The interviewer may ask follow-ups or let you choose. Either way, self-critique shows you understand your own design’s limits."
              />

              <div className={`p-6 rounded-3xl border space-y-4 ${panel}`}>
                <h3 className={`text-base font-bold ${heading}`}>Step 4: Wrap up</h3>
                <p className={`text-xs leading-relaxed ${body}`}>
                  Directions the book suggests for the last 3–5 minutes:
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {[
                    { t: 'Bottlenecks & improvements', d: 'Never say the design is perfect. Name what you’d improve — it shows critical thinking.', c: 'text-rose-600 dark:text-rose-400' },
                    { t: 'Recap', d: 'Summarise the design, especially if you proposed several options along the way.', c: 'text-indigo-600 dark:text-indigo-400' },
                    { t: 'Error cases', d: 'What happens on server failure or network loss?', c: 'text-amber-700 dark:text-amber-400' },
                    { t: 'Operations', d: 'How do you monitor metrics and error logs? How do you roll the system out?', c: 'text-emerald-600 dark:text-emerald-400' },
                    { t: 'Next scale curve', d: 'If this supports 1 million users, what must change to support 10 million?', c: 'text-blue-600 dark:text-blue-400' },
                    { t: 'Other refinements', d: 'What would you add with more time?', c: 'text-purple-600 dark:text-purple-400' },
                  ].map((w) => (
                    <div key={w.t} className={`p-4 rounded-2xl border space-y-1 ${inset}`}>
                      <h4 className={`font-bold text-xs uppercase ${w.c}`}>{w.t}</h4>
                      <p className={`text-xs leading-relaxed ${body}`}>{w.d}</p>
                    </div>
                  ))}
                </div>

                <div className="p-4 bg-indigo-500/10 border border-indigo-500/20 rounded-2xl text-xs space-y-2">
                  <span className="font-bold text-indigo-700 dark:text-indigo-300 uppercase">A common closing question</span>
                  <p className={`italic ${body}`}>“If you had 10× the users, what would break first?”</p>
                  <p className={body}>
                    Example answer for a news feed: <em>“The feed cache for users with many friends and the fanout workers for very popular accounts. I’d move celebrities to pull-based fanout, shard the feed cache by user ID, and add alerts on fanout queue lag so we see the backlog before users do.”</em>
                  </p>
                </div>
              </div>

              <Takeaway>
                You’re not done when the diagram is finished — you’re done when the interviewer says so. Use the last minutes to show you know where your design is weakest.
              </Takeaway>
              <Quiz
                persistKey="chapter3:quiz:step4"
                questions={[
                  {
                    question: 'The interviewer asks, “Anything you would improve?” Best response?',
                    options: [
                      { text: 'Name specific bottlenecks and how you’d address them', correct: true, why: 'There is always something to improve; this is a chance to show critical thinking.' },
                      { text: '“I think the design handles everything we discussed.”', why: 'The book says never claim the design is perfect — it suggests you don’t see its trade-offs.' },
                      { text: 'Start adding a brand-new subsystem in full detail', why: 'Mentioning refinements is good; detailing a new subsystem in the last minutes isn’t achievable and loses the recap.' },
                    ],
                  },
                  {
                    question: 'Your design supports 1M users. Which wrap-up topic does the book call “the next scale curve”?',
                    options: [
                      { text: 'What must change to support 10M users', correct: true, why: 'Exactly the book’s example — shows you know which parts fail first as load grows.' },
                      { text: 'How to reduce cost at 1M users', why: 'Cost can be worth discussing, but that’s not what “next scale curve” refers to.' },
                      { text: 'How to migrate to a different programming language', why: 'Not a scale concern; language choice rarely determines how a system scales.' },
                    ],
                  },
                ]}
              />
            </div>
          )}

          {/* ========================================================= */}
          {/* TAB 6: DOS & DON'TS */}
          {/* ========================================================= */}
          {activeTab === 'dos-donts' && (
            <div className="space-y-6">
              <LessonGoal
                goal="The book’s short list of habits to keep and habits to avoid."
                why="Most of them are about communication, not technology — which is exactly what the interview measures."
              />

              <div className={`p-6 rounded-3xl border space-y-4 ${panel}`}>
                <h3 className={`text-base font-bold ${heading}`}>Dos and Don’ts</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 dark:bg-emerald-500/10 dark:border-emerald-500/30 space-y-3">
                    <h4 className="font-bold text-xs text-emerald-700 dark:text-emerald-400 flex items-center uppercase">
                      <CheckCircle2 className="w-4 h-4 mr-1" /> Do
                    </h4>
                    <ul className="text-xs space-y-2 text-slate-700 dark:text-slate-300">
                      {[
                        ['Ask for clarification.', 'Don’t assume your assumption is correct.'],
                        ['Understand the requirements.', 'A startup’s design differs from one for millions of users.'],
                        ['Think out loud.', 'Let the interviewer know what you’re thinking.'],
                        ['Suggest multiple approaches', 'where possible, and say what each costs.'],
                        ['Design the most critical components first', 'once the blueprint is agreed.'],
                        ['Bounce ideas off the interviewer.', 'A good one works with you like a teammate.'],
                        ['Never give up.', ''],
                      ].map(([b, rest]) => (
                        <li key={b} className="flex items-start space-x-2">
                          <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                          <span><strong>{b}</strong> {rest}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 dark:bg-rose-500/10 dark:border-rose-500/30 space-y-3">
                    <h4 className="font-bold text-xs text-rose-700 dark:text-rose-400 flex items-center uppercase">
                      <AlertTriangle className="w-4 h-4 mr-1" /> Don’t
                    </h4>
                    <ul className="text-xs space-y-2 text-slate-700 dark:text-slate-300">
                      {[
                        ['Don’t jump into a solution', 'without clarifying requirements and assumptions — the book calls answering without understanding a huge red flag.'],
                        ['Don’t go deep on one component early.', 'High-level design first, then drill down.'],
                        ['Don’t name-drop technology without a reason.', 'If you say “Kafka”, say what problem it solves here (e.g. buffering fanout work) and why a simpler option isn’t enough.'],
                        ['Don’t think in silence.', 'Communicate throughout.'],
                        ['Don’t hesitate to ask for hints', 'if you get stuck.'],
                        ['Don’t assume you’re done after the design.', 'You’re done when the interviewer says so. Ask for feedback early and often.'],
                        ['Don’t be unprepared', 'for typical interview questions.'],
                      ].map(([b, rest]) => (
                        <li key={b} className="flex items-start space-x-2">
                          <X className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
                          <span><strong>{b}</strong> {rest}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>

              <Takeaway>Clarify first, communicate constantly, and treat the interviewer as a collaborator — including asking for hints.</Takeaway>
              <Quiz
                persistKey="chapter3:quiz:dos"
                questions={[
                  {
                    question: 'You’re stuck on how to handle a hot spot. What does the book recommend?',
                    options: [
                      { text: 'Ask the interviewer for a hint', correct: true, why: 'Listed explicitly: don’t hesitate to ask for hints. It keeps the session collaborative and moving.' },
                      { text: 'Stay quiet and think until you have the full answer', why: 'Thinking in silence is a don’t — the interviewer can’t credit reasoning they can’t hear.' },
                      { text: 'Change topic to a component you know better', why: 'Avoiding the problem loses the signal the interviewer was looking for.' },
                    ],
                  },
                  {
                    question: 'You finish your design and the interviewer goes quiet. Are you done?',
                    options: [
                      { text: 'No — ask for feedback; you’re done when the interviewer says so', correct: true, why: 'Straight from the book’s don’ts: ask for feedback early and often.' },
                      { text: 'Yes — the design is complete', why: 'The interview isn’t over until the interviewer ends it; silence is a cue to engage.' },
                      { text: 'Yes, but start listing every possible technology you could add', why: 'Unprompted buzzwords look like over-engineering. Ask what they’d like to explore.' },
                    ],
                  },
                  {
                    question: 'You’d like to use a message queue. How should you bring it up?',
                    options: [
                      { text: 'Name it and explain the problem it solves here and the trade-off', correct: true, why: 'Justified components are fine; unjustified ones read as buzzwords or over-engineering.' },
                      { text: 'Just add it — interviewers expect to see Kafka', why: 'No component is expected by default; each should trace back to a requirement.' },
                      { text: 'Avoid queues entirely; they’re always over-engineering', why: 'Queues are often the right tool (e.g. decoupling fanout). The issue is adding one without a reason.' },
                    ],
                  },
                ]}
              />
            </div>
          )}

          {/* ========================================================= */}
          {/* TAB 7: TIME ALLOCATION */}
          {/* ========================================================= */}
          {activeTab === 'time-split' && (
            <div className="space-y-6">
              <LessonGoal
                goal="Roughly how to split a 45-minute interview across the four steps."
                why="Running out of time before the deep dive is a common way good candidates lose signal."
              />

              <div className={`p-6 rounded-3xl border space-y-4 ${panel}`}>
                <h3 className={`text-base font-bold ${heading}`}>Time allocation for a 45-minute interview</h3>
                <p className={`text-xs leading-relaxed ${body}`}>
                  The book gives this as a <strong>rough guide</strong> — the real split depends on the problem and the interviewer. Each bar spans 0–45 minutes: the solid part is the minimum, the lighter part extends to the maximum.
                </p>

                <div className="space-y-3 pt-2">
                  {TIME_SPLIT.map((t) => (
                    <div key={t.step} className={`p-4 rounded-2xl border space-y-2 ${inset}`}>
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-bold">
                        <span className={heading}>{t.step}</span>
                        <span className="font-mono text-amber-700 dark:text-amber-400">
                          {t.min}–{t.max} min ({pctOf45(t.min)}–{pctOf45(t.max)}% of 45)
                        </span>
                      </div>
                      <div
                        className="w-full h-2.5 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden flex"
                        role="img"
                        aria-label={`${t.min} to ${t.max} minutes of a 45 minute interview`}
                      >
                        <div className={`h-full ${t.color}`} style={{ width: `${(t.min / INTERVIEW_MIN) * 100}%` }} />
                        <div className={`h-full ${t.light}`} style={{ width: `${((t.max - t.min) / INTERVIEW_MIN) * 100}%` }} />
                      </div>
                      <p className={`text-xs ${body}`}>{t.desc}</p>
                    </div>
                  ))}
                </div>
                <p className={`text-xs leading-relaxed ${body}`}>
                  The ranges overlap on purpose: the midpoints add up to about {TIME_SPLIT.reduce((a, t) => a + (t.min + t.max) / 2, 0)} minutes, leaving slack. If step 1 runs long, the deep dive shrinks; if the interviewer wants detail, step 3 can take up to 25 minutes.
                </p>
              </div>

              <Takeaway>Step 3 has the widest range because it’s where the interviewer steers you. Keep steps 1 and 2 tight enough to leave room for it.</Takeaway>
              <Quiz
                persistKey="chapter3:quiz:time"
                questions={[
                  {
                    question: 'Which step has the widest time range in the book’s 45-minute guide?',
                    options: [
                      { text: 'Deep dive: 10–25 minutes', correct: true, why: 'It flexes the most because its depth depends on what the interviewer wants to explore.' },
                      { text: 'Understand the problem: 3–10 minutes', why: 'A 7-minute range — significant, but narrower than the deep dive’s 15.' },
                      { text: 'High-level design: 10–15 minutes', why: 'Only a 5-minute range; the blueprint should be fairly quick.' },
                      { text: 'Wrap up: 3–5 minutes', why: 'The shortest step, with a 2-minute range.' },
                    ],
                  },
                  {
                    question: 'You’re 18 minutes in and still clarifying requirements. What should you do?',
                    options: [
                      { text: 'Write down the remaining assumptions and move to the high-level design', correct: true, why: 'Step 1 guidance is 3–10 minutes. Stating assumptions lets you move on without losing what you learned.' },
                      { text: 'Keep asking — more requirements always means a better design', why: 'You’re eating deep-dive time, which is where most signal comes from.' },
                      { text: 'Skip the high-level design and go straight to the deep dive', why: 'Without an agreed blueprint the deep dive has no context; the book’s don’ts warn against going deep first.' },
                    ],
                  },
                ]}
              />
            </div>
          )}

          {/* ========================================================= */}
          {/* TAB 8: INTERACTIVE INTERVIEW SIMULATOR */}
          {/* ========================================================= */}
          {activeTab === 'simulator' && (
            <div className="space-y-6">
              <div className={`p-6 sm:p-8 rounded-3xl border shadow-xl space-y-6 ${
                isDarkMode ? 'bg-[#1c1c1e] border-slate-800 text-slate-100' : 'bg-white border-slate-200 text-slate-900'
              }`}>

                {/* Header & Problem Selector */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b pb-4 border-slate-200 dark:border-slate-800">
                  <div>
                    <div className="flex items-center space-x-2">
                      <Sparkles className="w-5 h-5 text-amber-500" />
                      <h2 className="text-lg font-extrabold tracking-tight">Interview Simulator</h2>
                    </div>
                    <p className={`text-xs mt-0.5 ${body}`}>
                      Every choice gets interviewer feedback right away and is scored on quality, not quantity. Scale figures come from the book’s worked example for each problem.
                    </p>
                  </div>

                  <div className="flex items-center space-x-2">
                    <label htmlFor="ch3-problem" className={`text-xs font-bold ${body}`}>Problem:</label>
                    <select
                      id="ch3-problem"
                      value={sim.problem}
                      onChange={(e) => setSim(freshSim(e.target.value as ProblemId))}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold border focus:outline-none cursor-pointer ${
                        isDarkMode ? 'bg-slate-950 border-slate-800 text-amber-400' : 'bg-slate-100 border-slate-200 text-amber-800'
                      }`}
                    >
                      {(Object.keys(PROBLEMS) as ProblemId[]).map((id) => (
                        <option key={id} value={id}>{PROBLEMS[id].label}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Progress Tracker */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-xs font-bold">
                  {['1. Scope & scale', '2. High-level blueprint', '3. Deep dive', '4. Wrap up'].map((title, i) => {
                    const num = i + 1;
                    const isPassed = sim.step > num;
                    const isCurrent = sim.step === num;
                    return (
                      <div
                        key={title}
                        className={`p-2.5 rounded-xl border transition-all ${
                          isPassed
                            ? 'bg-emerald-50 border-emerald-300 text-emerald-700 dark:bg-emerald-500/10 dark:border-emerald-500/40 dark:text-emerald-400'
                            : isCurrent
                            ? 'bg-amber-500 border-amber-500 text-slate-950 shadow-md font-black'
                            : isDarkMode
                            ? 'bg-slate-950 border-slate-800 text-slate-500'
                            : 'bg-slate-100 border-slate-200 text-slate-500'
                        }`}
                      >
                        {isPassed ? `✓ ${title}` : title}
                      </div>
                    );
                  })}
                </div>

                {/* STEP 1 */}
                {sim.step === 1 && (
                  <div className="space-y-5">
                    <div className="p-4 rounded-2xl bg-blue-50 border border-blue-200 dark:bg-blue-500/10 dark:border-blue-500/20 text-xs space-y-1">
                      <span className="font-bold text-blue-700 dark:text-blue-400 uppercase">Stage 1: Understand the problem</span>
                      <p className={body}>
                        <MessageSquare className="w-3.5 h-3.5 inline mr-1" />
                        Interviewer: <em>“{P.prompt}”</em>
                      </p>
                      <p className={body}>Ask questions, then state the functional and non-functional requirements. Not every option is a good one.</p>
                    </div>

                    <div className="space-y-2">
                      <h3 className="font-bold text-xs uppercase text-amber-700 dark:text-amber-400">Clarifying questions to ask</h3>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {P.questions.map((q) => (
                          <ChoiceButton
                            key={q.id}
                            picked={sim.questions.includes(q.id)}
                            onClick={() => update({ questions: toggleIn(sim.questions, q.id) })}
                            text={q.text}
                            tone={toneOfWeight(q.weight)}
                            feedback={<><em>Interviewer: “{q.reply}”</em> — {q.why}</>}
                          />
                        ))}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <h4 className="font-bold text-xs uppercase text-blue-700 dark:text-blue-400">Functional requirements</h4>
                        {P.fr.map((c) => (
                          <ChoiceButton
                            key={c.id}
                            picked={sim.fr.includes(c.id)}
                            onClick={() => update({ fr: toggleIn(sim.fr, c.id) })}
                            text={c.text}
                            tone={toneOfWeight(c.weight)}
                            feedback={c.why}
                          />
                        ))}
                      </div>
                      <div className="space-y-2">
                        <h4 className="font-bold text-xs uppercase text-emerald-700 dark:text-emerald-400">Non-functional requirements</h4>
                        {P.nfr.map((c) => (
                          <ChoiceButton
                            key={c.id}
                            picked={sim.nfr.includes(c.id)}
                            onClick={() => update({ nfr: toggleIn(sim.nfr, c.id) })}
                            text={c.text}
                            tone={toneOfWeight(c.weight)}
                            feedback={c.why}
                          />
                        ))}
                      </div>
                    </div>

                    {sim.questions.length > 0 && missingKeyQuestions.length > 0 && (
                      <div className={`p-4 rounded-2xl border text-xs space-y-1.5 ${TONE_CLASSES.ok}`}>
                        <p className="font-bold flex items-center"><AlertTriangle className="w-4 h-4 mr-1" /> Key questions not asked yet</p>
                        {missingKeyQuestions.map((q) => (
                          <p key={q.id}><strong>“{q.text}”</strong> — Risk: {q.risk}</p>
                        ))}
                        <p>You can continue, but it will cost points and the gap will show up in your feedback.</p>
                      </div>
                    )}

                    <div className="pt-3 flex flex-col sm:flex-row items-end sm:items-center justify-end gap-3">
                      {!stage1Ready && (
                        <p className={`text-xs ${body}`}>
                          To continue, ask at least one question and state at least one functional and one non-functional requirement.
                        </p>
                      )}
                      <button disabled={!stage1Ready} onClick={() => update({ step: 2 })} className={nextBtn}>
                        <span>{missingKeyQuestions.length > 0 ? 'Proceed anyway to Stage 2' : 'Proceed to Stage 2: Blueprint'}</span>
                        <ArrowRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}

                {/* STEP 2 */}
                {sim.step === 2 && (
                  <div className="space-y-5">
                    <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 dark:bg-amber-500/10 dark:border-amber-500/20 text-xs space-y-1">
                      <span className="font-bold text-amber-700 dark:text-amber-400 uppercase">Stage 2: High-level blueprint</span>
                      <p className={body}>
                        Pick the components for <strong>{P.label.replace('Design a ', '')}</strong>, then present the blueprint. The interviewer agrees only when the core flows are covered.
                      </p>
                    </div>

                    <div className="space-y-2">
                      <h3 className="font-bold text-xs uppercase text-amber-700 dark:text-amber-400">Blueprint components</h3>
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 text-xs">
                        {COMPONENTS.map((c) => {
                          const Icon = c.icon;
                          const isSelected = sim.components.includes(c.id);
                          return (
                            <button
                              key={c.id}
                              aria-pressed={isSelected}
                              onClick={() =>
                                update({
                                  components: toggleIn(sim.components, c.id),
                                  buyIn: { ...sim.buyIn, status: 'none', message: '' },
                                })
                              }
                              className={`p-3 rounded-2xl border flex flex-col items-center text-center space-y-2 transition-all ${
                                isSelected
                                  ? 'bg-amber-50 border-amber-500 text-amber-800 font-bold dark:bg-amber-500/10 dark:text-amber-300'
                                  : isDarkMode ? 'bg-slate-950 border-slate-800 text-slate-300' : 'bg-slate-50 border-slate-200 text-slate-700'
                              }`}
                            >
                              <Icon className="w-5 h-5" />
                              <span>{c.name}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {sim.components.length > 0 && (
                      <div className="space-y-1">
                        <h4 className={`text-xs font-bold ${body}`}>Why each piece is (or isn’t) here</h4>
                        {COMPONENTS.filter((c) => sim.components.includes(c.id)).map((c) => {
                          const r = P.components[c.id];
                          return (
                            <FeedbackNote key={c.id} tone={toneOfRole(r.role)}>
                              <strong>{c.name}</strong> ({r.role === 'core' ? 'core' : r.role === 'useful' ? 'useful extra' : 'probably not needed'}) — {r.why}
                            </FeedbackNote>
                          );
                        })}
                      </div>
                    )}

                    <div className={`p-4 rounded-2xl border space-y-3 ${inset}`}>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className={`text-xs font-bold ${heading}`}>
                          Interviewer buy-in
                          {sim.buyIn.attempts > 0 && <span className={`ml-2 font-normal ${body}`}>(presented {sim.buyIn.attempts}×)</span>}
                        </span>
                        <button
                          onClick={presentBlueprint}
                          disabled={sim.components.length === 0 || sim.buyIn.status === 'approved'}
                          className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all disabled:cursor-not-allowed ${
                            sim.buyIn.status === 'approved'
                              ? 'bg-emerald-500 text-white'
                              : 'bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-40'
                          }`}
                        >
                          {sim.buyIn.status === 'approved' ? '✓ Interviewer agrees' : 'Present blueprint to interviewer'}
                        </button>
                      </div>
                      {sim.buyIn.message && (
                        <FeedbackNote tone={sim.buyIn.status === 'approved' ? 'good' : 'bad'}>
                          Interviewer: “{sim.buyIn.message}”
                        </FeedbackNote>
                      )}
                    </div>

                    <div className="pt-3 flex justify-between">
                      <button onClick={() => update({ step: 1 })} className={backBtn}>← Back</button>
                      <button disabled={sim.buyIn.status !== 'approved'} onClick={() => update({ step: 3 })} className={nextBtn}>
                        <span>Proceed to Stage 3: Deep Dive</span>
                        <ArrowRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}

                {/* STEP 3 */}
                {sim.step === 3 && (
                  <div className="space-y-5">
                    <div className="p-4 rounded-2xl bg-indigo-50 border border-indigo-200 dark:bg-indigo-500/10 dark:border-indigo-500/20 text-xs space-y-1">
                      <span className="font-bold text-indigo-700 dark:text-indigo-400 uppercase">Stage 3: Design deep dive</span>
                      <p className={body}>The interviewer wants to go deeper on these two areas. Choose an approach for each — you can change your mind after reading the feedback.</p>
                    </div>

                    <div className="space-y-3">
                      {P.deepDive.map((topic) => {
                        const pickedIdx = sim.deepDive[topic.id];
                        const picked = pickedIdx === undefined ? undefined : topic.options[pickedIdx];
                        return (
                          <div key={topic.id} className={`p-4 rounded-2xl border space-y-3 ${inset}`}>
                            <h4 className="font-bold text-xs text-amber-700 dark:text-amber-400">{topic.title}</h4>
                            <div className={`grid grid-cols-1 gap-2 ${topic.options.length === 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}>
                              {topic.options.map((opt, i) => (
                                <button
                                  key={opt.text}
                                  aria-pressed={pickedIdx === i}
                                  onClick={() => update({ deepDive: { ...sim.deepDive, [topic.id]: i } })}
                                  className={`p-2.5 rounded-xl border text-xs text-left transition-all ${
                                    pickedIdx === i
                                      ? 'bg-indigo-50 border-indigo-500 text-indigo-800 font-bold dark:bg-indigo-500/20 dark:text-indigo-200'
                                      : isDarkMode ? 'bg-[#1c1c1e] border-slate-800 text-slate-300' : 'bg-white border-slate-200 text-slate-700'
                                  }`}
                                >
                                  {opt.text}
                                </button>
                              ))}
                            </div>
                            {picked && <FeedbackNote tone={toneOfQuality(picked.quality)}>{picked.why}</FeedbackNote>}
                          </div>
                        );
                      })}
                    </div>

                    <div className="pt-3 flex justify-between">
                      <button onClick={() => update({ step: 2 })} className={backBtn}>← Back</button>
                      <button
                        disabled={P.deepDive.some((t) => sim.deepDive[t.id] === undefined)}
                        onClick={() => update({ step: 4 })}
                        className={nextBtn}
                      >
                        <span>Proceed to Stage 4: Wrap Up</span>
                        <ArrowRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}

                {/* STEP 4 */}
                {sim.step === 4 && (
                  <div className="space-y-5">
                    <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 dark:bg-emerald-500/10 dark:border-emerald-500/20 text-xs space-y-1">
                      <span className="font-bold text-emerald-700 dark:text-emerald-400 uppercase">Stage 4: Wrap up</span>
                      <p className={body}>Interviewer: <em>“We have about five minutes left. Anything else you’d like to cover?”</em> Pick what you’d say — aim for {WRAP_TARGET} strong points.</p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {WRAP_UP.map((w) => (
                        <ChoiceButton
                          key={w.id}
                          picked={sim.wrapUp.includes(w.id)}
                          onClick={() => update({ wrapUp: toggleIn(sim.wrapUp, w.id) })}
                          text={w.text}
                          tone={w.weight > 0 ? 'good' : 'bad'}
                          feedback={w.why}
                        />
                      ))}
                    </div>

                    <div className="pt-3 flex justify-between">
                      <button onClick={() => update({ step: 3 })} className={backBtn}>← Back</button>
                      <button
                        disabled={sim.wrapUp.length === 0}
                        onClick={() => update({ step: 5 })}
                        className="px-6 py-3 bg-gradient-to-r from-amber-500 via-orange-500 to-indigo-600 text-white font-black rounded-2xl text-xs flex items-center space-x-2 transition-all shadow-lg disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <Award className="w-4 h-4" />
                        <span>See score &amp; feedback</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* REPORT */}
                {sim.step === 5 && (() => {
                  const { strengths, improve } = buildFeedback();
                  const stageNames = ['Scope & scale', 'High-level blueprint', 'Deep dive', 'Wrap up'];
                  return (
                    <div className="space-y-6">
                      <div className="p-6 rounded-3xl bg-gradient-to-br from-amber-500/10 via-orange-500/10 to-indigo-500/10 border border-amber-500/30 space-y-2 text-center">
                        <Award className="w-12 h-12 text-amber-500 mx-auto" />
                        <h3 className="text-2xl font-black">Interview feedback — {P.label.replace('Design a ', '')}</h3>
                        <div className="text-4xl font-black font-mono text-amber-600 dark:text-amber-400">
                          {totalScore} <span className={`text-base font-normal ${body}`}>/ 100</span>
                        </div>
                        <p className={`text-xs max-w-lg mx-auto leading-relaxed ${body}`}>
                          Each stage is worth 25 points and is scored on the quality of your choices: helpful picks add, weak or out-of-scope picks subtract, and pushbacks from the interviewer cost points.
                        </p>
                      </div>

                      <div className="space-y-3">
                        {stageNames.map((name, i) => (
                          <div key={name} className={`p-4 rounded-2xl border space-y-2 ${inset}`}>
                            <div className="flex items-center justify-between text-xs font-bold">
                              <span className={heading}>Stage {i + 1}: {name}</span>
                              <span className="font-mono text-amber-700 dark:text-amber-400">{scores[i]} / 25</span>
                            </div>
                            <div className="w-full h-2 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                              <div className="h-full bg-amber-500" style={{ width: `${(scores[i] / 25) * 100}%` }} />
                            </div>
                            {strengths[i].map((s) => <FeedbackNote key={s} tone="good">{s}</FeedbackNote>)}
                            {improve[i].map((s) => <FeedbackNote key={s} tone="bad">{s}</FeedbackNote>)}
                            {strengths[i].length === 0 && improve[i].length === 0 && (
                              <p className={`text-xs ${body}`}>Nothing notable in this stage.</p>
                            )}
                          </div>
                        ))}
                      </div>

                      <div className="flex justify-center">
                        <button
                          onClick={() => setSim(freshSim(sim.problem))}
                          className="px-6 py-3 bg-slate-100 text-slate-800 hover:bg-slate-200 dark:bg-slate-800 dark:text-white dark:hover:bg-slate-700 font-bold rounded-2xl text-xs flex items-center space-x-2"
                        >
                          <RefreshCw className="w-4 h-4" />
                          <span>Retry this problem</span>
                        </button>
                      </div>
                      <p className={`text-xs text-center ${body}`}>Or pick a different problem from the menu above.</p>
                    </div>
                  );
                })()}
              </div>
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
};
