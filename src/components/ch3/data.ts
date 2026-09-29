// =====================================================================
// Interview simulator data. Every option carries a quality weight and a "why".
// Scale figures come from the book's worked example for each problem
// (news feed: Ch.3/11, URL shortener: Ch.8, chat: Ch.12).
// =====================================================================

export type ProblemId = 'newsfeed' | 'urlshortener' | 'chat';
export type Quality = 'strong' | 'ok' | 'weak';
export type Tone = 'good' | 'ok' | 'bad';

export interface Choice {
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

export interface ComponentRole {
  role: 'core' | 'useful' | 'unneeded';
  why: string;
  /** Interviewer pushback when a core component is missing. */
  pushback?: string;
}

export interface DeepDiveTopic {
  id: string;
  title: string;
  options: { text: string; quality: Quality; why: string }[];
}

export type ComponentId = 'lb' | 'app' | 'cache' | 'db' | 'mq' | 'worker' | 'cdn' | 'idgen' | 'ws' | 'presence' | 'notif';

export interface ProblemDef {
  label: string;
  short: string;
  prompt: string;
  questions: Choice[];
  fr: Choice[];
  nfr: Choice[];
  components: Record<ComponentId, ComponentRole>;
  deepDive: DeepDiveTopic[];
}

export const COMPONENTS: { id: ComponentId; name: string }[] = [
  { id: 'lb', name: 'Load balancer' },
  { id: 'app', name: 'Web / API servers' },
  { id: 'cache', name: 'Cache (e.g. Redis)' },
  { id: 'db', name: 'Database' },
  { id: 'mq', name: 'Message queue' },
  { id: 'worker', name: 'Fanout workers' },
  { id: 'cdn', name: 'CDN' },
  { id: 'idgen', name: 'Unique ID generator' },
  { id: 'ws', name: 'WebSocket chat servers' },
  { id: 'presence', name: 'Presence servers' },
  { id: 'notif', name: 'Push notification service' },
];

export const PROBLEMS: Record<ProblemId, ProblemDef> = {
  newsfeed: {
    label: 'Design a News Feed',
    short: 'News feed',
    prompt: 'Please design a news feed system.',
    questions: [
      {
        id: 'q-features', text: 'What are the most important features?', weight: 3, key: true,
        reply: 'Making a post and seeing friends’ news feed.',
        why: 'Pins the scope to two flows, publish and read, so you don’t design likes, comments or stories nobody asked for.',
        risk: 'You may spend the interview on features that were never in scope.',
      },
      {
        id: 'q-dau', text: 'What is the traffic volume (daily active users)?', weight: 3, key: true,
        reply: '10 million DAU.',
        why: 'Scale decides whether a single database is enough, how big the feed cache must be, and whether fanout is a bottleneck.',
        risk: 'Without scale you can’t justify caches, sharding or fanout strategy. Every component is a guess.',
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
        reply: 'Yes, both images and videos.',
        why: 'Media means blob storage and a CDN; text-only would not.',
      },
      {
        id: 'q-tech', text: 'Should I use Cassandra or MongoDB for posts?', weight: -2,
        reply: 'That’s your call. What do the requirements suggest?',
        why: 'Choosing technology before you know the requirements is jumping to a solution. Ask about the problem, not the tools.',
      },
    ],
    fr: [
      { id: 'fr-post', text: 'Publish a post (text, image, video)', weight: 2, why: 'One of the two features the interviewer named.' },
      { id: 'fr-feed', text: 'View a feed of friends’ posts', weight: 2, why: 'The other named feature: the read path you must make fast.' },
      { id: 'fr-follow', text: 'Add friends', weight: 1, why: 'Needed to have a friend graph, but not the focus. Mention it and move on.' },
      { id: 'fr-dm', text: 'Direct messaging between friends', weight: -2, why: 'Out of scope. This is a chat system, a different interview question.' },
    ],
    nfr: [
      { id: 'nfr-latency', text: 'Feed loads with low latency', weight: 2, why: 'Users open the feed far more often than they post; the read path is what they feel.' },
      { id: 'nfr-avail', text: 'Highly available; eventual consistency is acceptable', weight: 2, why: 'A friend’s post appearing a few seconds late is fine. Saying so lets you use caches and async fanout.' },
      { id: 'nfr-scale', text: 'Supports 10M DAU and up to 5,000 friends per user', weight: 2, why: 'Writes down the numbers you just learned so later decisions can refer to them.' },
      { id: 'nfr-strong', text: 'Strong consistency: every friend sees a post the instant it’s published', weight: -2, why: 'Costly (synchronous fanout to thousands of feeds) and not needed for a social feed. This is over-engineering.' },
    ],
    components: {
      lb: { role: 'core', why: 'Spreads 10M users’ requests across many web servers.', pushback: 'With 10 million daily users, how are requests spread across more than one web server?' },
      app: { role: 'core', why: 'Runs the post service and the feed service.', pushback: 'Where does the logic for publishing a post or building a feed actually run?' },
      db: { role: 'core', why: 'Durably stores posts and the friend graph.', pushback: 'If the cache is wiped, where do posts and friendships live?' },
      cache: { role: 'core', why: 'Holds each user’s pre-built feed (post IDs) so reads don’t recompute it.', pushback: 'How do users get their feed quickly without querying every friend’s posts on each app open?' },
      worker: { role: 'core', why: 'The fanout service: pushes a new post’s ID into each friend’s feed.', pushback: 'When someone posts, what puts that post into their 5,000 friends’ feeds?' },
      mq: { role: 'useful', why: 'Buffers fanout work so a slow fanout doesn’t slow down the person posting.' },
      cdn: { role: 'useful', why: 'Posts include images and video; a CDN serves media close to users.' },
      notif: { role: 'useful', why: 'The book’s design notifies friends about new posts. Nice, not essential.' },
      idgen: { role: 'useful', why: 'Posts need unique IDs; time-sortable IDs help chronological feeds.' },
      ws: { role: 'unneeded', why: 'The feed is fetched when the app opens; no persistent connection was required.' },
      presence: { role: 'unneeded', why: 'Online status isn’t part of this problem.' },
    },
    deepDive: [
      {
        id: 'fanout',
        title: 'How should a new post reach friends’ feeds?',
        options: [
          { text: 'Fanout on write (push) for everyone', quality: 'ok', why: 'Feeds are pre-built so reads are fast, but a user with millions of followers turns one post into millions of cache writes (the “hotkey” problem).' },
          { text: 'Fanout on read (pull) for everyone', quality: 'ok', why: 'No wasted writes for inactive users, but every feed open must gather and merge posts from up to 5,000 friends: slow reads.' },
          { text: 'Hybrid: push for most users, pull for celebrities', quality: 'strong', why: 'Keeps reads fast for the common case and avoids hot spots from very popular accounts. This is the book’s choice, and you named the trade-off.' },
        ],
      },
      {
        id: 'pagination',
        title: 'How should the feed be paginated?',
        options: [
          { text: 'Offset pagination (page=3, size=20)', quality: 'weak', why: 'New posts arriving at the top shift every offset, so users see duplicates or miss posts while scrolling.' },
          { text: 'Cursor pagination (last seen post ID or timestamp)', quality: 'strong', why: 'The cursor marks a fixed point in the feed, so new posts don’t disturb the next page.' },
        ],
      },
    ],
  },

  urlshortener: {
    label: 'Design a URL Shortener',
    short: 'URL shortener',
    prompt: 'Please design a URL shortening service like TinyURL.',
    questions: [
      {
        id: 'q-volume', text: 'What is the traffic volume?', weight: 3, key: true,
        reply: '100 million new URLs per day.',
        why: 'Gives ~1,160 writes/s, ~11,600 reads/s at a 10:1 ratio, and ~365 billion records over 10 years: the numbers every later choice rests on.',
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
        why: 'Immutable mappings make caching trivial: a cached entry never goes stale.',
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
      { id: 'fr-redirect', text: 'Redirect a short URL to the original', weight: 2, why: 'Core use case #2, and the hot path, since reads outnumber writes 10:1.' },
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
      cache: { role: 'core', why: 'Popular links are read far more than written; caching them spares the database.', pushback: 'Reads are ten times writes. How do popular redirects avoid hitting the database every time?' },
      idgen: { role: 'useful', why: 'Required if you pick base62 conversion of a unique ID; a hash-based approach doesn’t need it.' },
      mq: { role: 'unneeded', why: 'Shortening is a single synchronous write; there’s nothing to queue.' },
      worker: { role: 'unneeded', why: 'There’s no fanout: each short URL maps to exactly one record.' },
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
          { text: 'Hash the long URL, take 7 chars, retry on collision', quality: 'ok', why: 'Works, and the book covers it, but each collision check is a database lookup (a Bloom filter helps). Mention that cost.' },
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
    short: 'Chat',
    prompt: 'Please design a chat system.',
    questions: [
      {
        id: 'q-kind', text: 'Is it 1-on-1 chat, group chat, or both?', weight: 3, key: true,
        reply: 'Both.',
        why: 'The book calls this the first thing to nail down: 1-on-1 and group chat route messages differently.',
        risk: 'You may design only one kind of message routing, and the interviewer expected both.',
      },
      {
        id: 'q-scale', text: 'What scale: a startup or massive?', weight: 3, key: true,
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
        why: 'Drives the storage choice: a huge, ever-growing dataset of mostly recent reads.',
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
      { id: 'nfr-latency', text: 'Low delivery latency', weight: 2, why: 'Chat feels broken if messages lag. This justifies persistent connections.' },
      { id: 'nfr-scale', text: 'Supports 50M DAU', weight: 2, why: 'Writes down the scale that sizes the connection layer.' },
      { id: 'nfr-durable', text: 'Durable history, kept forever', weight: 2, why: 'Sets the expectation that storage must grow without limit.' },
      { id: 'nfr-e2e', text: 'End-to-end encryption from day one', weight: -1, why: 'Not required now. Flag it as a later topic rather than scoping it in.' },
    ],
    components: {
      lb: { role: 'core', why: 'Routes clients to API servers and assigns chat servers.', pushback: 'With 50 million daily users, how do clients get spread across servers?' },
      app: { role: 'core', why: 'Stateless API servers for login, signup and profiles.', pushback: 'Where do signup, login and profile requests go? Those don’t need a persistent connection.' },
      ws: { role: 'core', why: 'Hold persistent connections so the server can push messages instantly.', pushback: 'How does the server deliver a new message to the recipient without the client constantly polling?' },
      db: { role: 'core', why: 'Stores chat history (the book picks a key-value store).', pushback: 'History is kept forever. Where is it stored?' },
      presence: { role: 'core', why: 'Tracks who is online via heartbeats.', pushback: 'The interviewer asked for an online indicator. What tracks whether a user is online?' },
      notif: { role: 'useful', why: 'Delivers messages to users who are offline.' },
      idgen: { role: 'useful', why: 'Messages need IDs that sort by time within a conversation.' },
      mq: { role: 'useful', why: 'The book’s group-chat design copies each message into a per-recipient sync queue.' },
      cache: { role: 'useful', why: 'Can hold recent messages or session data.' },
      worker: { role: 'unneeded', why: 'Groups cap at 100, so delivery happens through the chat servers and sync queues, not a separate fanout fleet.' },
      cdn: { role: 'unneeded', why: 'Text only: there’s no media to serve.' },
    },
    deepDive: [
      {
        id: 'protocol',
        title: 'How does the server push messages to clients?',
        options: [
          { text: 'WebSocket: persistent two-way connection', quality: 'strong', why: 'The server can send the moment a message arrives. Trade-off: chat servers become stateful, so you need a way to find which server holds a user’s connection.' },
          { text: 'Long polling', quality: 'ok', why: 'Works, and the book discusses it, but the server can’t easily tell if a client disconnected, and idle users still make periodic requests.' },
          { text: 'Short polling every second', quality: 'weak', why: 'Most requests return nothing. At 50M users that is enormous wasted load, and latency is up to a full polling interval.' },
        ],
      },
      {
        id: 'presence',
        title: 'How is online/offline status tracked?',
        options: [
          { text: 'Client heartbeats; mark offline if none arrive for ~30 s', quality: 'strong', why: 'Tolerates brief network blips (e.g. a tunnel) without flapping the status. This is the book’s approach.' },
          { text: 'Mark offline immediately on disconnect', quality: 'ok', why: 'Simple, but flaky mobile networks cause constant online/offline flicker that fans out to every friend.' },
          { text: 'Every client polls the database every 1 s', quality: 'weak', why: 'Millions of polling reads per second for a signal that rarely changes. The database becomes the bottleneck.' },
        ],
      },
    ],
  },
};

export const WRAP_UP: Choice[] = [
  { id: 'w-bottleneck', text: 'Point out bottlenecks and what you would improve', weight: 1, why: 'The book is blunt: never say your design is perfect. Self-critique shows judgment.' },
  { id: 'w-recap', text: 'Recap the design and the key decisions', weight: 1, why: 'Refreshes the interviewer’s memory after a long session, especially if you proposed several options.' },
  { id: 'w-errors', text: 'Discuss error cases: server failure, network loss', weight: 1, why: 'Shows you think about what happens when things break, not just the happy path.' },
  { id: 'w-ops', text: 'Operations: metrics, error logs, how to roll it out', weight: 1, why: 'Real systems must be monitored and deployed; mentioning this signals production experience.' },
  { id: 'w-scale', text: 'Next scale curve: what changes at 10× users', weight: 1, why: 'Shows you know which parts of today’s design would break first as traffic grows.' },
  { id: 'w-perfect', text: 'Tell the interviewer the design is complete and has no weak spots', weight: -1, why: 'A red flag. Every design has trade-offs; claiming none suggests you don’t see them.' },
  { id: 'w-detail', text: 'Spend the remaining minutes detailing one algorithm’s internals', weight: -1, why: 'The book warns against this (its example: explaining a feed-ranking algorithm in detail). It eats time without showing system-design skill.' },
];

export const WRAP_TARGET = 4;
const QUALITY_POINTS: Record<Quality, number> = { strong: 1, ok: 0.5, weak: 0 };

export interface BuyIn {
  status: 'none' | 'approved' | 'pushback';
  message: string;
  attempts: number;
}

export interface SimState {
  problem: ProblemId;
  step: 1 | 2 | 3 | 4 | 5;
  questions: string[];
  fr: string[];
  nfr: string[];
  components: ComponentId[];
  buyIn: BuyIn;
  deepDive: Record<string, number>;
  wrapUp: string[];
}

export const NO_BUY_IN: BuyIn = { status: 'none', message: '', attempts: 0 };

export const freshSim = (problem: ProblemId): SimState => ({
  problem,
  step: 1,
  questions: [],
  fr: [],
  nfr: [],
  components: [],
  buyIn: NO_BUY_IN,
  deepDive: {},
  wrapUp: [],
});

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const sumWeights = (list: Choice[]) => list.reduce((a, c) => a + c.weight, 0);
export const toneOfWeight = (w: number): Tone => (w >= 2 ? 'good' : w > 0 ? 'ok' : 'bad');
export const toneOfQuality = (q: Quality): Tone => (q === 'strong' ? 'good' : q === 'ok' ? 'ok' : 'bad');
export const toneOfRole = (r: ComponentRole['role']): Tone => (r === 'core' ? 'good' : r === 'useful' ? 'ok' : 'bad');
export const toggleIn = <T,>(list: T[], item: T) => (list.includes(item) ? list.filter((i) => i !== item) : [...list, item]);

/** The interviewer's reaction when the candidate presents a blueprint. */
export function presentBlueprint(p: ProblemDef, selected: ComponentId[], prevAttempts: number): BuyIn {
  const attempts = prevAttempts + 1;
  const missing = COMPONENTS.filter((c) => p.components[c.id].role === 'core' && !selected.includes(c.id));
  if (missing.length > 0) {
    const more = missing.length > 1 ? ` (${missing.length} core pieces are still missing.)` : '';
    return { status: 'pushback', message: `${p.components[missing[0].id].pushback}${more}`, attempts };
  }
  const extra = COMPONENTS.find((c) => selected.includes(c.id) && p.components[c.id].role === 'unneeded');
  const message = extra
    ? `This covers the core flows, so let’s go deeper. One question first: why do we need the ${extra.name.toLowerCase()}? (${p.components[extra.id].why})`
    : 'This covers the core flows and fits the scale. Let’s dig into the bottlenecks.';
  return { status: 'approved', message, attempts };
}

export function scoreStage1(p: ProblemDef, s: SimState) {
  const all = [...p.questions, ...p.fr, ...p.nfr];
  const picked = new Set([...s.questions, ...s.fr, ...s.nfr]);
  const max = sumWeights(all.filter((c) => c.weight > 0));
  return Math.round(clamp01(sumWeights(all.filter((c) => picked.has(c.id))) / max) * 25);
}

export function scoreStage2(p: ProblemDef, s: SimState) {
  const core = COMPONENTS.filter((c) => p.components[c.id].role === 'core');
  const coreHit = core.filter((c) => s.components.includes(c.id)).length;
  const unneeded = s.components.filter((id) => p.components[id].role === 'unneeded').length;
  const pushbacks = Math.max(0, s.buyIn.attempts - 1);
  return Math.round((15 * coreHit) / core.length + Math.max(0, 5 - 2 * unneeded) + Math.max(0, 5 - 2 * pushbacks));
}

export function scoreStage3(p: ProblemDef, s: SimState) {
  const pts = p.deepDive.reduce((a, t) => {
    const i = s.deepDive[t.id];
    return a + (i === undefined || !t.options[i] ? 0 : QUALITY_POINTS[t.options[i].quality]);
  }, 0);
  return Math.round((pts / p.deepDive.length) * 25);
}

export function scoreStage4(s: SimState) {
  const picked = WRAP_UP.filter((w) => s.wrapUp.includes(w.id));
  const good = picked.filter((w) => w.weight > 0).length;
  const bad = picked.filter((w) => w.weight < 0).length;
  return Math.round(clamp01((Math.min(good, WRAP_TARGET) - bad) / WRAP_TARGET) * 25);
}

/** Per-stage strengths and improvements for the final report. */
export function buildFeedback(P: ProblemDef, sim: SimState) {
  const strengths: string[][] = [[], [], [], []];
  const improve: string[][] = [[], [], [], []];
  const s1 = [...P.questions, ...P.fr, ...P.nfr];
  const picked1 = new Set([...sim.questions, ...sim.fr, ...sim.nfr]);

  const keyAsked = P.questions.filter((q) => q.key && picked1.has(q.id));
  if (keyAsked.length) strengths[0].push(`Asked the key questions: ${keyAsked.map((q) => `“${q.text}”`).join(', ')}.`);
  P.questions.filter((q) => q.key && !picked1.has(q.id)).forEach((q) => improve[0].push(`Didn’t ask “${q.text}”. ${q.risk}`));
  s1.filter((c) => c.weight < 0 && picked1.has(c.id)).forEach((c) => improve[0].push(`“${c.text}”: ${c.why}`));
  s1.filter((c) => c.weight >= 2 && !c.key && !picked1.has(c.id) && !c.id.startsWith('q-')).forEach((c) =>
    improve[0].push(`Didn’t state the requirement “${c.text}”. ${c.why}`)
  );

  const core = COMPONENTS.filter((c) => P.components[c.id].role === 'core');
  if (core.every((c) => sim.components.includes(c.id))) strengths[1].push(`Included every core component (${core.map((c) => c.name.toLowerCase()).join(', ')}).`);
  const useful = COMPONENTS.filter((c) => sim.components.includes(c.id) && P.components[c.id].role === 'useful');
  if (useful.length) strengths[1].push(`Sensible extras: ${useful.map((c) => c.name.toLowerCase()).join(', ')}.`);
  if (sim.buyIn.attempts > 1)
    improve[1].push(`The interviewer pushed back ${sim.buyIn.attempts - 1} time(s) before agreeing. Walk through a concrete use case (e.g. “a user posts”) before presenting; it exposes missing pieces.`);
  else if (sim.buyIn.attempts === 1) strengths[1].push('Got buy-in on the first presentation.');
  COMPONENTS.filter((c) => sim.components.includes(c.id) && P.components[c.id].role === 'unneeded').forEach((c) =>
    improve[1].push(`${c.name} isn’t needed here: ${P.components[c.id].why} Unjustified components read as over-engineering.`)
  );

  P.deepDive.forEach((t) => {
    const opt = t.options[sim.deepDive[t.id]];
    if (!opt) return;
    if (opt.quality === 'strong') strengths[2].push(`${t.title} ${opt.text}. ${opt.why}`);
    else {
      const best = t.options.find((o) => o.quality === 'strong');
      improve[2].push(`${t.title} You chose “${opt.text}”. ${opt.why}${best ? ` Stronger: ${best.text}.` : ''}`);
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
}

export const TIME_SPLIT = [
  { step: 'Understand the problem', min: 3, max: 10 },
  { step: 'High-level design', min: 10, max: 15 },
  { step: 'Deep dive', min: 10, max: 25 },
  { step: 'Wrap up', min: 3, max: 5 },
];
export const INTERVIEW_MIN = 45;
