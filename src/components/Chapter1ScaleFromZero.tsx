import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Server,
  Database,
  Globe,
  Layers,
  Zap,
  Cpu,
  Play,
  Pause,
  MessageSquare,
  Sliders,
  Info,
  Terminal,
  Flame,
  SlidersHorizontal,
  Workflow,
  KeyRound,
  BarChart3,
  Users,
  ArrowRight,
  CheckCircle2,
  Wrench,
} from 'lucide-react';
import { usePersistentState } from '../lib/usePersistentState';
import { LessonGoal, WhatChanged, Takeaway, Term, Quiz, type QuizQuestion } from './learn/LearningKit';

interface Chapter1ScaleFromZeroProps {
  isDarkMode?: boolean;
}

type ComponentId =
  | 'dns'
  | 'geoDns'
  | 'cdn'
  | 'lb'
  | 'web'
  | 'cache'
  | 'sessionStore'
  | 'masterDb'
  | 'slaveDb'
  | 'mq'
  | 'monitoring';

type NodeStatus = 'healthy' | 'degraded' | 'failed' | 'standby';

interface ComponentInfo {
  name: string;
  category: 'Networking' | 'Compute' | 'Storage' | 'Async' | 'Operations';
  stats: [string, string][];
  whatIsIt: string;
  whyExist: string;
  whatIfRemoved: string;
  tradeoffs: string;
}

interface LogEntry {
  id: string;
  timestamp: string;
  type: 'info' | 'warn' | 'error' | 'success';
  source: string;
  message: string;
}

type Failure = 'server_crash' | 'db_crash' | 'cache_stampede' | 'traffic_spike' | 'dc_outage' | 'hotspot';

/* ------------------------------------------------------------------
 * Illustrative capacity model. The numbers are made up but chosen so
 * each architecture step moves the metrics in the direction the book
 * describes. They are NOT benchmarks.
 * ------------------------------------------------------------------ */
const STAGE_COUNT = 10;
const WEB_CAP = 400; // requests/s one web server can handle
const SINGLE_BOX_CAP = 250; // stage 1: web app and DB share one machine
const DB_CAP = 1000; // queries/s one database node can handle
const SINGLE_BOX_DB_CAP = 600;
const REPLICAS = 2; // read replicas (per shard)
const STATIC_COST = 0.4; // extra web work per page when web servers also serve static files (no CDN)
const PHOTO_SHARE = 0.02; // share of requests that are slow photo-processing jobs
const PHOTO_COST = 15; // an inline photo job ties up the web server like ~15 normal requests
const PHOTO_MS = 2000; // how long a photo job takes
const WORKER_CAP = 25; // photo jobs/s one worker completes
const STICKY_SKEW = 1.3; // with sticky sessions the busiest node carries ~30% more than average
const MAX_WEB = 8; // manual limit per data center
const AUTOSCALE_MAX = 60; // autoscaler limit per data center
const SHOWN_NODES = 6; // canvas draws at most this many web nodes
const FAILOVER_MS = 6000;

// Traffic slider is logarithmic: 50 .. 30,000 RPS.
const RPS_MIN = 50;
const RPS_RANGE = 600;
const posToRps = (p: number) => {
  const raw = RPS_MIN * Math.pow(RPS_RANGE, p / 100);
  const mag = Math.pow(10, Math.floor(Math.log10(raw)) - 1);
  return Math.round(raw / mag) * mag;
};
const rpsToPos = (r: number) => Math.round((Math.log(r / RPS_MIN) / Math.log(RPS_RANGE)) * 100);

const fmt = (n: number) => Math.round(n).toLocaleString();
const congestion = (u: number) => (u < 0.7 ? 0 : Math.round(Math.min(400, ((u - 0.7) / 0.3) ** 2 * 150)));

/* ------------------------------------------------------------------
 * Stage content — follows the order of Chapter 1 in the book.
 * ------------------------------------------------------------------ */
interface StageContent {
  title: string;
  goal: React.ReactNode;
  why: React.ReactNode;
  before: React.ReactNode;
  after: React.ReactNode;
  reason: React.ReactNode;
  weakSpot: React.ReactNode;
  fix: React.ReactNode;
  takeaway: React.ReactNode;
  quiz: QuizQuestion[];
}

const STAGES: StageContent[] = [
  {
    title: 'Single server',
    goal: 'Follow one request end to end: DNS lookup, then HTTP to your only server, then a response.',
    why: 'Everything (web app, database) runs on one machine. It is the simplest setup that works.',
    before: 'Nothing deployed.',
    after: 'One server runs the web app and the database. DNS maps the domain to its IP address.',
    reason: 'Start simple. You only add pieces when a real problem forces you to.',
    weakSpot: (
      <>
        The web app and the database compete for the same CPU and memory, and there is no spare machine: this server is a{' '}
        <Term term="single point of failure (SPOF)">A part of a system that, if it fails, stops the entire system from working.</Term>. Crash it in
        the Chaos Lab and every request fails.
      </>
    ),
    fix: 'Move the database onto its own server so the web tier and the data tier can grow separately.',
    takeaway: 'DNS only turns a name into an IP address. After that, the browser talks to your server directly, so if that one server is down, so is the site.',
    quiz: [
      {
        question: 'Your single server hosts both the web app and the database. It crashes at 3 a.m. What happens?',
        options: [
          { text: 'The whole site is down until the server is back.', correct: true, why: 'There is one machine and no spare. It is a single point of failure.' },
          { text: 'Only writes fail; pages still load from the web app.', why: 'The web app runs on the same machine, so it went down too.' },
          { text: 'DNS automatically sends users to a backup server.', why: 'DNS here just maps a name to one IP. There is no backup, and plain DNS does not check whether a server is healthy.' },
        ],
      },
      {
        question: 'What role does DNS play in this request?',
        options: [
          { text: "It returns the server's IP; the browser then sends HTTP requests straight to that IP.", correct: true, why: 'DNS is a lookup. Once the browser has the IP, DNS is out of the request path.' },
          { text: 'It forwards every HTTP request to the server.', why: 'DNS never carries your HTTP traffic. It only answers "what IP is this name?"' },
          { text: 'It balances traffic across servers.', why: 'Spreading load is the load balancer’s job (stage 3). A basic DNS record points at one address.' },
        ],
      },
    ],
  },
  {
    title: 'Separate web and database servers',
    goal: 'See why splitting the web tier from the data tier is the first scaling step.',
    why: 'The web server handles web and mobile traffic; a separate server runs the database.',
    before: 'Web app and database on one machine, fighting over CPU and memory.',
    after: 'A web server plus a separate database server. The web server no longer shares its CPU with the database.',
    reason: 'Separate tiers can be scaled independently. You can give the database more memory without touching the web tier.',
    weakSpot: (
      <>
        Users still connect straight to one web server. If it goes offline, or more users arrive than it can handle, requests fail. Making that server
        bigger (<Term term="vertical scaling">"Scale up": add more CPU/RAM to one server. Simple, but it has a hard limit and no failover.</Term>) only
        goes so far. Push the traffic slider up until the web server saturates and requests start failing.
      </>
    ),
    fix: (
      <>
        Put a load balancer in front and add more web servers (
        <Term term="horizontal scaling">"Scale out": add more servers to a pool instead of making one bigger.</Term>).
      </>
    ),
    takeaway:
      'Splitting tiers is the first step because it lets each tier scale on its own. Relational databases are usually the right default; consider NoSQL for very low latency, unstructured data or huge volumes.',
    quiz: [
      {
        question: 'Why move the database onto its own server?',
        options: [
          { text: 'So the web tier and data tier can be scaled independently.', correct: true, why: 'This is the book’s reason: each tier gets its own resources and can grow on its own.' },
          { text: 'Because it removes the single point of failure.', why: 'There is still one web server and one database. Now there are two SPOFs, not zero.' },
          { text: 'Because a relational database cannot share a machine with a web app.', why: 'It can. Stage 1 did exactly that; it just does not scale well.' },
        ],
      },
      {
        question: 'When might a NoSQL database fit better than a relational one?',
        options: [
          { text: 'You need very low latency, your data is unstructured, or you must store a huge amount of it.', correct: true, why: 'These are the cases the book lists for considering non-relational stores.' },
          { text: 'You need join operations across many tables.', why: 'Joins are a strength of relational databases; most NoSQL stores do not support them.' },
          { text: 'Your team wants the most proven, general-purpose option.', why: 'The book says relational databases are the best option for most developers, with a 40+ year track record.' },
        ],
      },
    ],
  },
  {
    title: 'Load balancer and multiple web servers',
    goal: 'Understand how a load balancer removes the web tier’s single point of failure and lets you add capacity.',
    why: 'Users now connect to the load balancer’s public IP. Web servers sit behind it on private IPs.',
    before: 'Users hit one web server directly. Crash it and the site is down.',
    after: 'DNS returns the load balancer’s IP. It spreads requests over two web servers and skips any that fail health checks.',
    reason: 'If server 1 goes offline, traffic goes to server 2. If traffic grows, add servers to the pool and the LB starts using them.',
    weakSpot: (
      <>
        The web tier now survives a crash (try it), but there is still one database. It is a single point of failure, and every read and write hits
        it. Raise traffic and watch the database load in the inspector.
      </>
    ),
    fix: 'Add database replication: a master that takes writes, plus read-only replicas that serve reads.',
    takeaway: 'A load balancer plus two or more web servers gives the web tier failover and lets it scale out. Capacity lost in a crash is one node’s share, not the whole site.',
    quiz: [
      {
        question: 'Three web servers each handle 400 RPS behind a load balancer. Traffic is 600 RPS and server 1 crashes. What do users see?',
        options: [
          { text: 'Almost nothing: the LB stops routing to server 1, and the other two have 800 RPS of capacity.', correct: true, why: 'Health checks take the dead node out of rotation. You lose a third of capacity, but 800 > 600, so no requests fail.' },
          { text: 'About a third of requests fail with 502 until server 1 recovers.', why: 'That would happen only if the LB kept sending traffic to the dead node. Routing around failures is its job.' },
          { text: 'The whole site goes down.', why: 'That is the no-load-balancer case from stage 2.' },
        ],
      },
      {
        question: 'Why do web servers get private IPs once the load balancer is in place?',
        options: [
          { text: 'Clients only reach the LB’s public IP. Servers talk over a private network, which is more secure.', correct: true, why: 'Web servers are no longer directly reachable from the internet.' },
          { text: 'Private IPs make internet traffic faster.', why: 'Private IPs cannot be reached from the internet at all. That is the point.' },
          { text: 'So DNS can rotate between the web servers.', why: 'DNS now returns the load balancer’s address; the web servers are hidden behind it.' },
        ],
      },
    ],
  },
  {
    title: 'Database replication',
    goal: 'See how a master/replica setup splits reads from writes and survives a database failure.',
    why: 'Most apps read far more than they write, so you usually run more replicas than masters.',
    before: 'One database handles every read and every write, and has no backup.',
    after: 'The master takes only writes (insert, update, delete). Two read replicas copy its data and serve the reads.',
    reason: 'Reads run in parallel on replicas (performance), data exists in more than one place (reliability), and a replica can take over if the master dies (availability).',
    weakSpot: (
      <>
        Every page load still runs database queries, even for data that barely changes. Move the read/write slider and compare master and replica
        load: reads dominate. Static files (images, JS, CSS) also still come from your web servers.
      </>
    ),
    fix: 'Add a cache tier in front of the database so repeated reads are answered from memory.',
    takeaway: (
      <>
        Replication improves performance, reliability and availability. The price is{' '}
        <Term term="replication lag">Replicas copy the master asynchronously, so they can briefly return slightly old data.</Term>, and promoting a
        replica may need data recovery because it can be behind.
      </>
    ),
    quiz: [
      {
        question: 'Traffic is 90% reads. With one master and two replicas, where do the reads go?',
        options: [
          { text: 'To the replicas. The master handles only data-modifying operations.', correct: true, why: 'Reads spread across replicas; all inserts, updates and deletes go to the master.' },
          { text: 'To the master, because replicas might be stale.', why: 'Replica lag is a trade-off to manage, but taking reads off the master is the whole purpose of replicas.' },
          { text: 'Evenly across all three databases.', why: 'In the book’s master/slave model the master generally supports only writes.' },
        ],
      },
      {
        question: 'The master database goes offline. What happens in this design?',
        options: [
          { text: 'A replica is promoted to master. Writes pause until then; reads continue on the other replicas.', correct: true, why: 'Crash the master in the Chaos Lab to watch this. In production the promoted replica may need recovery scripts to fill in missing data.' },
          { text: 'All reads and writes fail until the old master is repaired.', why: 'That is what happened without replication. Replicas keep reads going and one of them takes over writes.' },
          { text: 'Writes continue on the replicas immediately, with no data lost.', why: 'Replicas are read-only until one is promoted, and it may be slightly behind the old master.' },
        ],
      },
    ],
  },
  {
    title: 'Cache tier',
    goal: 'Learn how a read-through cache takes load off the database and speeds up responses.',
    why: 'A web server checks the cache first. On a miss it queries the database, stores the result in the cache, and returns it.',
    before: 'Every read goes to a database replica, even for the same popular rows.',
    after: 'A memory cache answers most reads. Only misses reach the database.',
    reason: 'Memory is much faster than a database query, and fewer queries means the database tier needs fewer machines.',
    weakSpot: (
      <>
        Static files still come from your web servers: they use web CPU and load slowly for users far away. Compare the "Static assets" latency with
        API latency on the canvas.
      </>
    ),
    fix: 'Move static assets (images, JS, CSS, video) to a CDN.',
    takeaway: (
      <>
        Cache data that is read often and changed rarely. Set an expiration (
        <Term term="TTL">Time to live: how long an item stays valid in a cache before it expires.</Term>) that is neither too short nor too long, plan
        for cache/DB inconsistency, avoid a single cache server as a SPOF, and pick an eviction policy (LRU is the most common).
      </>
    ),
    quiz: [
      {
        question: 'Which data is a good candidate for the cache?',
        options: [
          { text: 'Data that is read often but changed rarely, like a user profile.', correct: true, why: 'High read-to-write ratio means high hit rate and little staleness.' },
          { text: 'Payment records that must never be lost.', why: 'Cache memory is volatile: a restart loses it. Important data belongs in persistent storage.' },
          { text: 'Data that changes on every request.', why: 'It would be stale almost immediately and would rarely be a hit.' },
        ],
      },
      {
        question: 'You set the cache TTL to one second. What is the likely effect?',
        options: [
          { text: 'A low hit rate: data is reloaded from the database too often.', correct: true, why: 'The book warns that too-short expiry makes the system hit the database constantly.' },
          { text: 'Users see very stale data.', why: 'That is the risk of a TTL that is too long.' },
          { text: 'The cache runs out of memory.', why: 'A short TTL frees memory faster. Memory pressure is handled by the eviction policy.' },
        ],
      },
    ],
  },
  {
    title: 'Content delivery network (CDN)',
    goal: 'See what a CDN speeds up (static files) and what it does not (your API).',
    why: 'A CDN is a set of servers spread around the world that cache static content close to users.',
    before: 'Web servers send images, JS and CSS themselves, from one location.',
    after: 'Static files come from the nearest CDN edge. On a miss the edge fetches from the origin once and caches it until its TTL expires.',
    reason: 'Pages load faster for distant users, and web servers stop spending CPU on static files.',
    weakSpot: (
      <>
        Web servers keep login sessions in their own memory, so the load balancer must use{' '}
        <Term term="sticky sessions">The load balancer sends every request from a user to the same server, because only that server has their session.</Term>
        . Remove a web node or crash one: its users are logged out. Load is also uneven across nodes.
      </>
    ),
    fix: 'Move session state out of the web servers into a shared data store (the book uses NoSQL), so any server can handle any request.',
    takeaway: 'A CDN helps static content, not dynamic API calls. Watch cost (you pay for transfer), set sensible expiry, plan a fallback to the origin if the CDN fails, and invalidate or version files when they change.',
    quiz: [
      {
        question: 'What does adding a CDN speed up?',
        options: [
          { text: 'Static files, served from an edge server near the user instead of from your web servers.', correct: true, why: 'Notice API latency barely moved on the canvas; static asset latency dropped.' },
          { text: 'Database queries, because the CDN caches query results.', why: 'That is the cache tier’s job. The book’s CDN caches static content.' },
          { text: 'Personalized API responses for logged-in users.', why: 'Dynamic content caching exists but is outside this book’s scope.' },
        ],
      },
      {
        question: 'You replaced logo.png but users still see the old one. What is a standard fix?',
        options: [
          { text: 'Version the URL (logo.png?v=2) or invalidate the object with the CDN vendor’s API.', correct: true, why: 'Both approaches from the book make the edge stop serving the old copy.' },
          { text: 'Restart your web servers.', why: 'The edge keeps serving its cached copy until the TTL expires, no matter what the origin does.' },
          { text: 'Lower the database cache TTL.', why: 'That is a different cache. It does not touch files cached at CDN edges.' },
        ],
      },
    ],
  },
  {
    title: 'Stateless web tier',
    goal: 'See why keeping state out of web servers makes adding, removing and replacing them painless.',
    why: 'Web servers fetch session data from a shared store on each request instead of keeping it in memory.',
    before: 'Sessions live in each web server’s memory. Sticky sessions pin users to one server; losing that server logs them out.',
    after: 'Sessions live in a shared NoSQL store. Any server can handle any request, and the load balancer spreads load evenly.',
    reason: 'A stateless system is simpler, more robust and easier to scale. It also makes autoscaling possible (try the toggle).',
    weakSpot: (
      <>
        Everything runs in one data center. Distant users pay extra network latency, and a data-center outage takes the whole site down. Try "Data
        center outage" in the Chaos Lab.
      </>
    ),
    fix: (
      <>
        Run in two data centers and use <Term term="geoDNS">A DNS service that resolves a name to different IPs depending on where the user is.</Term>{' '}
        to send each user to the nearest one.
      </>
    ),
    takeaway: 'Move state out of the web tier. Then servers become interchangeable, and autoscaling can add or remove them based on load.',
    quiz: [
      {
        question: 'Before this stage, sessions lived in each web server’s memory. Why was removing a server painful?',
        options: [
          { text: 'Users whose session was on that server were logged out, because sticky sessions tied them to it.', correct: true, why: 'Only that server had their session data.' },
          { text: 'The load balancer had to be restarted to learn the new server list.', why: 'Load balancers update their server pool live. The problem was the state on the server.' },
          { text: 'It drops in-flight requests for every user on the site.', why: 'Only that server’s users are affected. The others are on other servers.' },
        ],
      },
      {
        question: 'Why is autoscaling easy once the web tier is stateless?',
        options: [
          { text: 'Any server can handle any request, so servers can be added or removed with load without breaking sessions.', correct: true, why: 'This is exactly the book’s argument for autoscaling after state is removed.' },
          { text: 'Stateless servers use much less CPU per request.', why: 'Not the point. They may even do an extra fetch from the session store.' },
          { text: 'Sticky sessions become faster.', why: 'Sticky sessions are no longer needed at all.' },
        ],
      },
    ],
  },
  {
    title: 'Multiple data centers',
    goal: 'See how geoDNS routes users to the nearest data center and fails over when one goes offline.',
    why: 'In normal operation traffic is split between US-East and US-West. Each data center has the full stack.',
    before: 'One data center. Distant users are slow, and an outage there is a total outage.',
    after: 'Two data centers, 50/50 traffic via geoDNS. If one goes offline, all traffic goes to the healthy one.',
    reason: 'Better availability and a better experience across wider areas.',
    weakSpot: (
      <>
        Slow work like photo processing still runs inside the web request: the user waits about 2 seconds and the web server is tied up. And with this
        many servers across two data centers, you cannot log in to each one to read its logs.
      </>
    ),
    fix: 'Add a message queue with workers for slow jobs, plus centralized logging, metrics and automation.',
    takeaway: 'Multiple data centers need traffic redirection (geoDNS), data synchronization (replicate data across data centers) and automated test and deploy at every location.',
    quiz: [
      {
        question: 'The US-West data center goes offline. What does the system do?',
        options: [
          { text: 'Route 100% of traffic to the healthy data center (US-East).', correct: true, why: 'This is the book’s failover picture. Watch whether US-East has enough capacity for double its load.' },
          { text: 'Nothing. West users wait until it comes back.', why: 'Surviving a data center outage is the main reason for a second data center.' },
          { text: 'Serve West users from CDN edges.', why: 'A CDN serves static files only. It cannot run your API or database.' },
        ],
      },
      {
        question: 'Which challenge is specific to running multiple data centers?',
        options: [
          { text: 'Data synchronization: a user failed over to another data center must find their data there.', correct: true, why: 'That is why data is replicated across data centers, often asynchronously.' },
          { text: 'Choosing between SQL and NoSQL.', why: 'That choice exists at any scale, even with one server.' },
          { text: 'Needing a load balancer.', why: 'You needed one as soon as you had two web servers.' },
        ],
      },
    ],
  },
  {
    title: 'Message queue, logging, metrics and automation',
    goal: 'Learn how a queue decouples slow work from user requests, and why a large system needs monitoring and automation.',
    why: 'Web servers publish photo jobs to a queue and reply right away. Workers pull jobs and process them in the background.',
    before: 'Photo jobs run inside the web request: users wait about 2 s and web capacity is tied up. Logs are scattered across servers.',
    after: 'Jobs go to a queue; a worker pool processes them. Logs and metrics are collected centrally (see the Logs tab).',
    reason: 'Producers and consumers scale separately: add workers when the queue grows, remove them when it is empty.',
    weakSpot: (
      <>
        Every write still goes to one master database. Turn on autoscaling and push traffic toward the top of the slider: the web tier keeps up,
        but write load on the master becomes the limit, even with a cache and replicas. One machine has hardware limits.
      </>
    ),
    fix: (
      <>
        Shard the database: split users across several databases using a{' '}
        <Term term="sharding key">The column(s) that decide which shard a row lives on, e.g. user_id. It should spread data evenly.</Term> (here{' '}
        <code className="font-mono">user_id % N</code>).
      </>
    ),
    takeaway: 'A message queue makes the system loosely coupled and more failure-resilient. At this size, logging, host/aggregate/business metrics, and automated build/test/deploy become essential.',
    quiz: [
      {
        question: 'Photo processing takes a few seconds. With a message queue, what happens when a user submits a photo edit?',
        options: [
          { text: 'The web server publishes a job and replies right away; a worker processes it later.', correct: true, why: 'The user is not blocked, and the web server is free for the next request.' },
          { text: 'The web server waits for a worker to finish, then replies.', why: 'That is still synchronous, so the queue would not help.' },
          { text: 'The queue processes the photo itself.', why: 'A queue only stores messages. Consumers (workers) do the work.' },
        ],
      },
      {
        question: 'The queue keeps growing. What fix does the book suggest?',
        options: [
          { text: 'Add more workers. Producers and consumers scale independently.', correct: true, why: 'Try it: add workers until throughput exceeds the job rate and the backlog drains.' },
          { text: 'Add more web servers.', why: 'Web servers are the producers. More of them would publish jobs faster, not process them.' },
          { text: 'Delete the oldest messages.', why: 'That throws away users’ work instead of doing it.' },
        ],
      },
    ],
  },
  {
    title: 'Database sharding',
    goal: 'See how sharding spreads writes across databases, and the new problems it brings.',
    why: 'Each shard has the same schema but holds different users. A hash of the sharding key picks the shard.',
    before: 'One master takes every write. Scaling it up has hardware limits, costs a lot and is still a SPOF.',
    after: 'N shards (user_id % N), each with its own master and replicas. Write capacity grows with N.',
    reason: 'Horizontal scaling of the data tier: add servers instead of buying an ever-bigger one.',
    weakSpot: (
      <>
        Sharding adds complexity: resharding when a shard fills up or data is uneven, hotspot ("celebrity") keys that overload one shard, and joins
        across shards. Try "Celebrity hotspot" in the Chaos Lab.
      </>
    ),
    fix: 'Keep iterating: choose a key that spreads data evenly, use consistent hashing (Chapter 5) to make resharding easier, denormalize to avoid cross-shard joins, and split tiers into smaller services.',
    takeaway:
      'The chapter in one list: keep the web tier stateless, build redundancy at every tier, cache as much as you can, support multiple data centers, host static assets in a CDN, shard the data tier, split tiers into services, and monitor and automate.',
    quiz: [
      {
        question: 'With user_id % 4 as the hash function, which shard stores user 10?',
        options: [
          { text: 'Shard 2', correct: true, why: '10 divided by 4 is 2 remainder 2, so 10 % 4 = 2.' },
          { text: 'Shard 1', why: '% gives the remainder, not a rounded quotient. 10 = 4 × 2 + 2.' },
          { text: 'Whichever shard has the most free space', why: 'The hash decides, not free space. That is what lets any server find the right shard without a lookup.' },
        ],
      },
      {
        question: 'Several celebrities’ data lands on the same shard and it overloads. What is this called, and what is one fix?',
        options: [
          { text: 'The celebrity (hotspot key) problem; give very heavy users their own shards.', correct: true, why: 'The book suggests a shard per celebrity, possibly partitioned further.' },
          { text: 'The resharding problem; add more replicas to that shard.', why: 'Resharding is about shards filling up or uneven data. More replicas help reads a little but writes still hit one master.' },
          { text: 'The join problem; denormalize the tables.', why: 'Denormalizing solves cross-shard joins, a different problem.' },
        ],
      },
    ],
  },
];

/* ------------------------------------------------------------------ */

const toneClass = {
  ok: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300',
  warn: 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300',
  bad: 'bg-rose-600 text-white',
  info: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-500/15 dark:text-indigo-300',
  neutral: 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200',
} as const;
type Tone = keyof typeof toneClass;

const Badge: React.FC<{ tone: Tone; children: React.ReactNode }> = ({ tone, children }) => (
  <span className={`text-[11px] px-1.5 py-0.5 rounded font-mono font-semibold whitespace-nowrap ${toneClass[tone]}`}>{children}</span>
);

const statusBgFor = (s: NodeStatus, dark: boolean) =>
  s === 'failed'
    ? dark ? 'bg-rose-950/60 border-rose-500/70' : 'bg-rose-50 border-rose-400'
    : s === 'degraded'
    ? dark ? 'bg-amber-950/40 border-amber-500/60' : 'bg-amber-50 border-amber-400'
    : s === 'standby'
    ? dark ? 'bg-indigo-950/40 border-indigo-500/60' : 'bg-indigo-50 border-indigo-300'
    : dark ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200';

const CanvasCtx = React.createContext<{ dark: boolean; selected: ComponentId; select: (id: ComponentId) => void }>({
  dark: false,
  selected: 'web',
  select: () => {},
});

const NodeCard: React.FC<{
  id: ComponentId;
  icon: React.ReactNode;
  title: string;
  status?: NodeStatus;
  badge?: React.ReactNode;
  sub?: React.ReactNode;
}> = ({ id, icon, title, status = 'healthy' as NodeStatus, badge, sub }) => {
  const { dark, selected, select } = React.useContext(CanvasCtx);
  return (
    <button
      type="button"
      onClick={() => select(id)}
      className={`w-full text-left p-3 rounded-2xl border transition-all ${statusBgFor(status, dark)} ${
        selected === id ? 'ring-2 ring-indigo-500' : ''
      } ${status === 'failed' ? 'animate-pulse' : ''}`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className={`flex items-center gap-2 min-w-0 ${dark ? 'text-slate-100' : 'text-slate-900'}`}>
          {icon}
          <span className="text-xs font-semibold truncate">{title}</span>
        </div>
        {badge}
      </div>
      {sub && <div className={`text-xs mt-1 ${dark ? 'text-slate-400' : 'text-slate-500'}`}>{sub}</div>}
    </button>
  );
};

const statusTone = (s: NodeStatus): Tone => (s === 'failed' ? 'bad' : s === 'degraded' ? 'warn' : s === 'standby' ? 'info' : 'ok');
const utilStatus = (u: number): NodeStatus => (u > 0.85 ? 'degraded' : 'healthy');

export const Chapter1ScaleFromZero: React.FC<Chapter1ScaleFromZeroProps> = ({ isDarkMode = false }) => {
  // --- PERSISTED LEARNER STATE ---
  const [stage, setStage] = usePersistentState<number>('chapter1:stage', 1);
  const [completed, setCompleted] = usePersistentState<number[]>('chapter1:completed', []);
  const [activeTab, setActiveTab] = usePersistentState<'canvas' | 'chaos' | 'logs'>('chapter1:tab', 'canvas');
  const [trafficRps, setTrafficRps] = usePersistentState<number>('chapter1:traffic', 100);
  const [readRatio, setReadRatio] = usePersistentState<number>('chapter1:readRatio', 85);
  const [webCount, setWebCount] = usePersistentState<number>('chapter1:webCount', 1);
  const [autoscale, setAutoscale] = usePersistentState<boolean>('chapter1:autoscale', false);
  const [cacheHitRatio, setCacheHitRatio] = usePersistentState<number>('chapter1:cacheHit', 0.85);
  const [workers, setWorkers] = usePersistentState<number>('chapter1:workers', 1);
  const [shardCount, setShardCount] = usePersistentState<number>('chapter1:shards', 4);

  // --- TRANSIENT SIMULATION STATE ---
  const [selectedComp, setSelectedComp] = useState<ComponentId>('web');
  const [activeFailure, setActiveFailure] = useState<Failure | null>(null);
  const [failoverPhase, setFailoverPhase] = useState<'none' | 'promoting' | 'promoted'>('none');
  const [isSimulating, setIsSimulating] = useState<boolean>(true);
  const [mqBacklog, setMqBacklog] = useState<number>(0);
  const [sessionNotice, setSessionNotice] = useState<string | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);

  const content = STAGES[stage - 1];

  // --- STAGE FEATURES (book order) ---
  const hasSeparateDb = stage >= 2;
  const hasLoadBalancer = stage >= 3;
  const hasReplicas = stage >= 4;
  const hasCache = stage >= 5;
  const hasCdn = stage >= 6;
  const hasStatelessSession = stage >= 7;
  const hasMultiDc = stage >= 8;
  const hasMessageQueue = stage >= 9;
  const hasMonitoring = stage >= 9;
  const hasSharding = stage >= 10;

  const pushLog = useCallback((type: LogEntry['type'], source: string, message: string) => {
    const timestamp = new Date().toLocaleTimeString('en-US', { hour12: false });
    setLogs((prev) => [{ id: Math.random().toString(36).slice(2), timestamp, type, source, message }, ...prev.slice(0, 40)]);
  }, []);

  const goToStage = (next: number) => {
    const s = Math.min(STAGE_COUNT, Math.max(1, next));
    setStage(s);
    setActiveFailure(null);
    setSessionNotice(null);
    setWebCount(s <= 2 ? 1 : s <= 6 ? 2 : 3);
    if (s < 9) setMqBacklog(0);
  };

  const applyFixAndAdvance = () => {
    setCompleted((prev) => (prev.includes(stage) ? prev : [...prev, stage]));
    if (stage < STAGE_COUNT) goToStage(stage + 1);
  };

  // ================= LIVE SYSTEM MODEL =================
  const spike = activeFailure === 'traffic_spike';
  const serverCrash = activeFailure === 'server_crash';
  const dbCrash = activeFailure === 'db_crash';
  const stampede = activeFailure === 'cache_stampede' && hasCache;
  const dcDown = activeFailure === 'dc_outage';
  const hotspot = activeFailure === 'hotspot' && hasSharding;

  const rps = spike ? trafficRps * 10 : trafficRps;
  const reads = (rps * readRatio) / 100;
  const writes = rps - reads;

  // Web tier: every request costs 1 unit; serving static files (no CDN) and inline photo jobs (no queue) cost extra.
  const staticUnits = hasCdn ? 0 : STATIC_COST;
  const photoUnits = hasMessageQueue ? 0 : PHOTO_SHARE * (PHOTO_COST - 1);
  const webUnitsPerReq = 1 + staticUnits + photoUnits;
  const webDemand = rps * webUnitsPerReq;

  const dcCount = hasMultiDc ? 2 : 1;
  const liveDcs = dcDown ? dcCount - 1 : dcCount;
  const nodeCap = stage === 1 ? SINGLE_BOX_CAP : WEB_CAP;
  const autoscaleOn = autoscale && hasStatelessSession;
  const autoscaleTarget = Math.min(AUTOSCALE_MAX,Math.max(2, Math.ceil(webDemand / Math.max(1, liveDcs) / (WEB_CAP * 0.7)) + (serverCrash ? 1 : 0)));
  const nodesPerDc = !hasLoadBalancer ? 1 : autoscaleOn ? autoscaleTarget : webCount;
  const crashedNodes = serverCrash && liveDcs > 0 ? 1 : 0;
  const healthyNodes = Math.max(0, liveDcs * nodesPerDc - crashedNodes);
  const skew = hasLoadBalancer && !hasStatelessSession && nodesPerDc > 1 ? STICKY_SKEW : 1;
  const webUtil = healthyNodes > 0 ? webDemand / (healthyNodes * nodeCap) : 0;
  const hottestWebUtil = webUtil * skew;
  const webFail = healthyNodes === 0 ? 1 : Math.max(0, 1 - (healthyNodes * nodeCap) / skew / webDemand);
  const served = 1 - webFail;

  // Data tier
  const cacheHit = hasCache && !stampede ? cacheHitRatio : 0;
  const dbReads = reads * served * (1 - cacheHit);
  const dbWrites = writes * served;
  const shards = hasSharding ? shardCount : 1;
  const hotShare = hotspot ? 0.5 : 1 / shards; // share of DB traffic on the busiest shard
  const hotScope = hotspot ? hotShare : 1; // share of all queries exposed to that shard's overload
  const dbDataCenterDown = liveDcs === 0;
  const masterUp = !dbDataCenterDown && (!dbCrash || failoverPhase === 'promoted');
  const replicasUp = dbDataCenterDown ? 0 : hasReplicas ? (dbCrash && failoverPhase === 'promoted' ? REPLICAS - 1 : REPLICAS) : 0;
  const masterCap = stage === 1 ? SINGLE_BOX_DB_CAP : DB_CAP;

  const masterQps = (replicasUp > 0 ? dbWrites : dbReads + dbWrites) * hotShare; // per (busiest) shard master
  const replicaQps = replicasUp > 0 ? (dbReads * hotShare) / replicasUp : 0; // per replica
  const masterUtil = masterUp ? masterQps / masterCap : 0;
  const replicaUtil = replicaQps / DB_CAP;

  let failedReads = 0;
  let failedWrites = 0;
  if (!masterUp) {
    failedWrites = dbWrites;
    if (replicasUp === 0) failedReads = dbReads;
  } else {
    const mFail = masterQps > 0 ? Math.max(0, 1 - masterCap / masterQps) : 0;
    failedWrites = dbWrites * hotScope * mFail;
    if (replicasUp === 0) failedReads = dbReads * hotScope * mFail;
  }
  if (replicasUp > 0) {
    const rFail = replicaQps > 0 ? Math.max(0, 1 - DB_CAP / replicaQps) : 0;
    failedReads = dbReads * hotScope * rFail;
  }
  const failedTotal = rps * webFail + failedReads + failedWrites;
  const failedPct = rps > 0 ? Math.min(100, (failedTotal / rps) * 100) : 0;
  const successRate = Math.max(0, 100 - failedPct);
  const dbUtil = Math.max(masterUtil, replicaUtil);

  // Latency (illustrative). API latency = app + data access + congestion + photo jobs + network distance.
  const dataMs = readRatio / 100 * (cacheHit * 1 + (1 - cacheHit) * 8) + (1 - readRatio / 100) * 10;
  const photoMs = PHOTO_SHARE * (hasMessageQueue ? 5 : PHOTO_MS);
  const networkMs = hasMultiDc ? (dcDown ? 30 : 15) : 45;
  const apiLatency = Math.round(15 + dataMs + congestion(hottestWebUtil) + congestion(dbUtil) + photoMs + networkMs);
  const staticLatency = hasCdn ? 25 : Math.round(180 + congestion(hottestWebUtil));

  // Queue
  const photoJobsPerSec = rps * PHOTO_SHARE * served;
  const workerThroughput = workers * WORKER_CAP;
  const queueWaitSec = hasMessageQueue && workerThroughput > 0 ? mqBacklog / workerThroughput : 0;

  // Sessions
  const statefulPool = hasLoadBalancer && !hasStatelessSession;
  const loggedOutPct = serverCrash ? (healthyNodes === 0 ? 100 : statefulPool ? Math.round(100 / (liveDcs * nodesPerDc)) : 0) : 0;

  const monthlyCost = Math.round(
    dcCount * (nodesPerDc * 70 + (hasLoadBalancer ? 25 : 0)) +
      (hasSeparateDb ? dcCount * shards * (150 + (hasReplicas ? REPLICAS * 120 : 0)) : 0) +
      (hasCache ? 90 * dcCount : 0) +
      (hasCdn ? 120 : 0) +
      (hasStatelessSession ? 60 * dcCount : 0) +
      (hasMessageQueue ? 40 + workers * 50 : 0) +
      (hasMonitoring ? 80 : 0)
  );

  // ---- Effects ----
  // Automatic failover: when the master dies and replicas exist, one is promoted after a short delay.
  useEffect(() => {
    if (!dbCrash || !hasReplicas) {
      setFailoverPhase('none');
      return;
    }
    setFailoverPhase('promoting');
    pushLog('error', 'Master DB', 'Master offline. Writes failing; reads continue on replicas. Promoting replica 1…');
    const t = setTimeout(() => {
      setFailoverPhase('promoted');
      pushLog('success', 'Replica 1', 'Promoted to master. Writes resumed. A new replica should be added to replace it.');
    }, FAILOVER_MS);
    return () => clearTimeout(t);
  }, [dbCrash, hasReplicas, pushLog]);

  // Queue backlog integrates job arrivals minus worker throughput.
  useEffect(() => {
    if (!isSimulating || !hasMessageQueue) return;
    const i = setInterval(() => {
      setMqBacklog((b) => Math.max(0, Math.min(1_000_000, b + (photoJobsPerSec - workerThroughput) * 1.5)));
    }, 1500);
    return () => clearInterval(i);
  }, [isSimulating, hasMessageQueue, photoJobsPerSec, workerThroughput]);

  // Request log generator reflecting the current model. Reads a ref so the timer is not reset on every model change.
  const modelRef = useRef({ healthyNodes, serverCrash, masterUp, replicasUp, failedPct, hasCache, cacheHit, hasMessageQueue, mqBacklog, hasLoadBalancer, apiLatency });
  modelRef.current = { healthyNodes, serverCrash, masterUp, replicasUp, failedPct, hasCache, cacheHit, hasMessageQueue, mqBacklog, hasLoadBalancer, apiLatency };
  useEffect(() => {
    if (!isSimulating) return;
    const i = setInterval(() => {
      const { healthyNodes, serverCrash, masterUp, replicasUp, failedPct, hasCache, cacheHit, hasMessageQueue, mqBacklog, hasLoadBalancer, apiLatency } = modelRef.current;
      const r = Math.random();
      if (healthyNodes === 0) {
        pushLog('error', hasLoadBalancer ? 'LB' : 'Client', 'Connection refused: no healthy web server. Request failed.');
      } else if (serverCrash && r < 0.4) {
        pushLog('warn', 'LB', `Health check failed for web-1; routing to ${healthyNodes} healthy node(s).`);
      } else if (!masterUp && r < 0.5) {
        pushLog('error', 'App', replicasUp > 0 ? 'INSERT failed: no master (promotion in progress). Reads still OK.' : 'Query failed: database unavailable.');
      } else if (failedPct > 1 && r < 0.5) {
        pushLog('error', 'App', `503 Service Unavailable: overloaded (${failedPct.toFixed(0)}% of requests failing).`);
      } else if (hasCache && r < cacheHit * 0.6) {
        pushLog('success', 'Cache', 'HIT user:10294 (≈1 ms)');
      } else if (hasMessageQueue && r > 0.9) {
        pushLog('info', 'Queue', `Published photo job; backlog ${fmt(mqBacklog)} job(s).`);
      } else if (r > 0.55) {
        pushLog('info', replicasUp > 0 ? 'Replica' : 'DB', `SELECT * FROM users WHERE id = ${Math.floor(r * 10000)}`);
      } else {
        pushLog('info', hasLoadBalancer ? 'LB' : 'Web', `GET /feed → ${apiLatency} ms`);
      }
    }, 1500);
    return () => clearInterval(i);
  }, [isSimulating, pushLog]);

  // ---- Node scaling handlers (show the stateful vs stateless consequence) ----
  const addNode = () => {
    if (webCount >= MAX_WEB) return;
    setWebCount(webCount + 1);
    const msg = statefulPool
      ? `Added web-${webCount + 1}. Sticky sessions keep existing users on their old servers, so the new node only gets new users and load stays uneven.`
      : `Added web-${webCount + 1}. The load balancer starts sending it requests immediately.`;
    setSessionNotice(msg);
    pushLog('info', 'LB', msg);
  };
  const removeNode = () => {
    if (webCount <= 1) return;
    setWebCount(webCount - 1);
    const msg = statefulPool
      ? `Removed web-${webCount}. About ${Math.round(100 / webCount)}% of logged-in users had their session in its memory and were logged out.`
      : `Removed web-${webCount}. Sessions live in the shared store, so nobody was logged out.`;
    setSessionNotice(msg);
    pushLog(statefulPool ? 'warn' : 'info', 'Sessions', msg);
  };

  // ---- Theme helpers ----
  const panel = isDarkMode ? 'bg-[#1c1c1e] border-slate-800' : 'bg-white border-slate-200 shadow-sm';
  const tile = isDarkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200';
  const strong = isDarkMode ? 'text-slate-100' : 'text-slate-900';
  const body = isDarkMode ? 'text-slate-300' : 'text-slate-600';
  const muted = isDarkMode ? 'text-slate-400' : 'text-slate-500';
  const btnSecondary = isDarkMode
    ? 'bg-slate-800 text-slate-200 border-slate-700 hover:bg-slate-700'
    : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100';
  const statusBg = (s: NodeStatus) => statusBgFor(s, isDarkMode);

  // Per-node load: with sticky sessions node 1 is busiest; the rest share what is left.
  const nodeUtil = (i: number) => {
    const n = nodesPerDc;
    if (skew === 1 || n <= 1) return webUtil;
    return i === 0 ? webUtil * skew : (webUtil * (n - skew)) / (n - 1);
  };

  const shardLabel = hasSharding ? `${shards} shard masters` : stage === 1 ? 'Database (same server)' : 'Master DB';

  // ---- Component inspector data ----
  const pct = (u: number) => `${Math.round(u * 100)}%`;
  const componentDetails: Record<ComponentId, ComponentInfo> = {
    dns: {
      name: 'DNS',
      category: 'Networking',
      stats: [
        ['Returns', hasLoadBalancer ? 'Load balancer IP' : 'Web server IP'],
        ['Lookups', `${fmt(rps)}/s (before caching)`],
      ],
      whatIsIt: 'A lookup service that turns a domain name (api.mysite.com) into an IP address. Usually a paid third-party service.',
      whyExist: 'People use names; networks use IP addresses. DNS answers once, then the browser talks to that IP.',
      whatIfRemoved: 'Users could not find your servers by name.',
      tradeoffs: 'Answers are cached by clients, so changing an IP takes time to spread (TTL).',
    },
    geoDns: {
      name: 'geoDNS',
      category: 'Networking',
      stats: [
        ['US-East', dcDown ? '100% of users' : '50% of users'],
        ['US-West', dcDown ? 'OFFLINE' : '50% of users'],
      ],
      whatIsIt: 'DNS that returns a different IP depending on where the user is, so each user reaches the nearest data center.',
      whyExist: 'Shorter network distance means lower latency, and an unhealthy data center can be taken out of the answers.',
      whatIfRemoved: 'Everyone goes to one data center: slower for distant users and a total outage if it fails.',
      tradeoffs: 'Data must be replicated across data centers, and test/deploy must cover every location.',
    },
    cdn: {
      name: 'CDN',
      category: 'Networking',
      stats: [
        ['Static asset latency', `${staticLatency} ms`],
        ['Web CPU saved', `${Math.round((STATIC_COST / (1 + STATIC_COST)) * 100)}% per page (illustrative)`],
      ],
      whatIsIt: 'Servers spread around the world that cache static files (images, video, CSS, JS) close to users.',
      whyExist: 'The nearest edge serves the file, so pages load faster and your web servers stop serving static files.',
      whatIfRemoved: 'Web servers go back to serving every static file from one location.',
      tradeoffs: 'You pay for data transfer, must set expiry and invalidate/version files, and need a fallback to the origin if the CDN is down.',
    },
    lb: {
      name: 'Load balancer',
      category: 'Networking',
      stats: [
        ['Routing', statefulPool ? 'Sticky sessions' : 'Any healthy node'],
        ['Healthy nodes', `${healthyNodes} of ${liveDcs * nodesPerDc}`],
        ['Busiest node', pct(hottestWebUtil)],
      ],
      whatIsIt: 'Receives all traffic on a public IP and spreads it across web servers on private IPs, skipping any that fail health checks.',
      whyExist: 'Removes the web tier’s single point of failure and lets you add capacity by adding servers.',
      whatIfRemoved: 'Users connect to one server directly; if it goes down, the site goes down.',
      tradeoffs: statefulPool
        ? 'With sessions in server memory it must pin users to a server (sticky sessions). That makes load uneven and adding/removing servers painful.'
        : 'Stateless servers mean it can send any request anywhere, so load stays even.',
    },
    web: {
      name: stage === 1 ? 'Server (web app + database)' : 'Web servers',
      category: 'Compute',
      stats: [
        ['Nodes', `${healthyNodes} healthy${crashedNodes ? `, ${crashedNodes} crashed` : ''}${hasMultiDc ? ` (${nodesPerDc} per DC)` : ''}`],
        ['Avg load', pct(webUtil)],
        ['Work per request', `${webUnitsPerReq.toFixed(2)}× (${[staticUnits ? 'static files' : '', photoUnits ? 'inline photo jobs' : ''].filter(Boolean).join(' + ') || 'API only'})`],
        ['Capacity', `${fmt((healthyNodes * nodeCap) / skew / webUnitsPerReq)} RPS`],
      ],
      whatIsIt: 'Runs your application code: validates requests, reads and writes data, builds responses.',
      whyExist: 'Every dynamic request needs it.',
      whatIfRemoved: 'No application code runs.',
      tradeoffs: hasStatelessSession
        ? 'Stateless: session data comes from the shared store, so nodes are interchangeable.'
        : 'Keeps sessions in local memory, which ties each user to one node.',
    },
    cache: {
      name: 'Cache tier',
      category: 'Storage',
      stats: [
        ['Hit ratio', pct(cacheHit)],
        ['Reads answered', `${fmt(reads * served * cacheHit)}/s`],
        ['Reads sent to DB', `${fmt(dbReads)}/s`],
      ],
      whatIsIt: 'An in-memory key-value store (e.g. Memcached or Redis) holding results of frequent reads.',
      whyExist: 'Memory is much faster than a database query, and every hit is a query the database never sees.',
      whatIfRemoved: 'Every read goes to the database (try Flush below).',
      tradeoffs: 'Stale data and cache/DB inconsistency; data is lost on restart; one cache server is a SPOF; needs expiry and eviction (LRU).',
    },
    sessionStore: {
      name: 'Shared session store (NoSQL)',
      category: 'Storage',
      stats: [
        ['Session reads', `${fmt(rps * served)}/s`],
        ['Sessions lost on node crash', '0'],
      ],
      whatIsIt: 'A shared data store holding user sessions, reachable by every web server.',
      whyExist: 'Moves state out of the web tier so any server can serve any user.',
      whatIfRemoved: 'Sessions return to server memory: sticky sessions, uneven load, logouts when a node goes away.',
      tradeoffs: 'One more system to run and scale; each request does a small extra lookup.',
    },
    masterDb: {
      name: hasSharding ? `Shard masters (user_id % ${shards})` : stage === 1 ? 'Database (on the same server)' : 'Master database',
      category: 'Storage',
      stats: [
        ['Status', !masterUp ? (dbCrash && hasReplicas ? 'Offline, replica being promoted' : 'OFFLINE') : dbCrash ? 'Replica promoted to master' : 'Healthy'],
        [hasSharding ? 'Busiest shard QPS' : 'Master QPS', `${fmt(masterUp ? masterQps : 0)}/s ${replicasUp > 0 ? '(writes only)' : '(reads + writes)'}`],
        ['Load', pct(masterUtil)],
      ],
      whatIsIt: hasReplicas
        ? 'The authoritative copy. All inserts, updates and deletes go here; replicas copy from it.'
        : 'The only database. Every read and write goes here.',
      whyExist: 'Stores the data that must survive restarts.',
      whatIfRemoved: 'Nothing can be saved.',
      tradeoffs: hasSharding
        ? 'Sharding multiplies write capacity but adds resharding, hotspot keys and cross-shard joins.'
        : 'One master’s write throughput is capped by its hardware.',
    },
    slaveDb: {
      name: 'Read replicas',
      category: 'Storage',
      stats: [
        ['Replicas', `${replicasUp}${hasSharding ? ' per shard' : ''}`],
        ['QPS per replica', `${fmt(replicaQps)}/s (reads only)`],
        ['Load', pct(replicaUtil)],
      ],
      whatIsIt: 'Read-only copies that receive the master’s changes and serve SELECT queries.',
      whyExist: 'Reads usually far outnumber writes, so spreading them across replicas lets more queries run in parallel.',
      whatIfRemoved: 'The master handles every read and write again, and there is no one to promote if it fails.',
      tradeoffs: 'Replication lag: replicas can briefly serve old data; a promoted replica may be missing recent writes.',
    },
    mq: {
      name: 'Message queue + workers',
      category: 'Async',
      stats: [
        ['Jobs in', `${photoJobsPerSec.toFixed(1)}/s`],
        ['Workers', `${workers} × ${WORKER_CAP}/s = ${workerThroughput}/s`],
        ['Backlog', `${fmt(mqBacklog)} jobs (~${fmt(queueWaitSec)} s wait)`],
      ],
      whatIsIt: 'A durable buffer. Producers (web servers) publish messages; consumers (workers) pull and process them.',
      whyExist: 'Slow jobs no longer block user requests, and producers and consumers scale separately.',
      whatIfRemoved: 'Photo jobs run inside the request: ~2 s waits and busy web servers.',
      tradeoffs: 'Work finishes later, not instantly; you must watch queue depth and handle retries.',
    },
    monitoring: {
      name: 'Logging, metrics, automation',
      category: 'Operations',
      stats: [
        ['Host', `web CPU ${pct(webUtil)}, DB ${pct(dbUtil)}`],
        ['Aggregate', `${successRate.toFixed(1)}% success, ${apiLatency} ms API`],
      ],
      whatIsIt: 'Central collection of error logs and metrics, plus CI and automated build, test and deploy.',
      whyExist: 'With dozens of servers in two data centers you need one place to see problems, and automation to change things safely.',
      whatIfRemoved: 'You find outages from users and deploy by hand.',
      tradeoffs: 'Costs money and effort; too many alerts get ignored.',
    },
  };

  const isAvailable = (id: ComponentId) =>
    id === 'dns' || id === 'web' || id === 'masterDb' ||
    (id === 'geoDns' && hasMultiDc) || (id === 'cdn' && hasCdn) || (id === 'lb' && hasLoadBalancer) ||
    (id === 'cache' && hasCache) || (id === 'sessionStore' && hasStatelessSession) ||
    (id === 'slaveDb' && hasReplicas) || ((id === 'mq' || id === 'monitoring') && hasMessageQueue);
  const inspected: ComponentId = isAvailable(selectedComp) ? selectedComp : 'web';
  const currentInfo = componentDetails[inspected];

  // Human-readable request path for this stage.
  const requestPath = [
    hasMultiDc ? 'geoDNS (nearest DC)' : 'DNS',
    hasLoadBalancer ? 'load balancer' : null,
    'web server',
    hasStatelessSession ? 'session store' : null,
    hasCache ? 'cache' : null,
    hasReplicas ? 'replica (reads) / master (writes)' : 'database',
  ].filter(Boolean) as string[];

  // ---- Failure impact report (chaos tab) ----
  const failureReport = (): string[] => {
    const lines: string[] = [];
    switch (activeFailure) {
      case 'server_crash':
        if (!hasLoadBalancer) lines.push('No load balancer: users connect to this one server directly, so every request fails.');
        else {
          lines.push(`Health checks take web-1 out of rotation. Capacity lost: 1 of ${liveDcs * nodesPerDc} nodes (${Math.round(100 / (liveDcs * nodesPerDc))}%).`);
          lines.push(webFail > 0 ? `The remaining ${healthyNodes} node(s) cannot carry the load: ${(webFail * 100).toFixed(0)}% of requests are rejected.` : `The remaining ${healthyNodes} node(s) have enough spare capacity, so no requests fail.`);
          lines.push(statefulPool ? `Sticky sessions: about ${loggedOutPct}% of logged-in users had their session on web-1 and are logged out.` : 'Sessions live in the shared store: nobody is logged out.');
          if (autoscaleOn) lines.push('Autoscaling launched a replacement node.');
        }
        break;
      case 'db_crash':
        if (!hasReplicas) lines.push('Only one database and no replica: every query fails, so the site is down.');
        else if (failoverPhase === 'promoting') lines.push('Master offline. Reads continue on replicas; writes fail until a replica is promoted (a few seconds here).');
        else lines.push(`Replica promoted to master. Writes resumed; ${replicasUp} replica now serves all reads until a new one is added.`);
        break;
      case 'cache_stampede':
        lines.push(`Cache emptied: reads to the database jumped from ${fmt(reads * served * (1 - cacheHitRatio))}/s to ${fmt(dbReads)}/s.`);
        lines.push(dbUtil > 1 ? 'The database tier is over capacity, so reads fail.' : 'The database tier can absorb it this time, but latency rose.');
        break;
      case 'traffic_spike':
        lines.push(`Traffic ×10: ${fmt(trafficRps)} → ${fmt(rps)} RPS. Web capacity is ${fmt((healthyNodes * nodeCap) / skew / webUnitsPerReq)} RPS.`);
        lines.push(autoscaleOn ? `Autoscaling grew the pool to ${nodesPerDc} node(s) per DC.` : hasStatelessSession ? 'Turn on autoscaling to add nodes automatically.' : 'Without a stateless web tier you cannot autoscale safely.');
        break;
      case 'dc_outage':
        lines.push(hasMultiDc ? 'US-West is offline. geoDNS sends 100% of users to US-East, which now runs on half the servers.' : 'Only one data center: this is a total outage.');
        break;
      case 'hotspot':
        lines.push(`Half of all queries hit one shard (celebrity keys). Its master is at ${pct(masterUtil)}${replicasUp > 0 ? `, replicas at ${pct(replicaUtil)}` : ''} while other shards are idle.`);
        break;
    }
    lines.push(`Result: ${failedPct.toFixed(1)}% of requests failing, API latency ${apiLatency} ms.`);
    return lines;
  };

  const failureCards: { id: Failure; title: string; desc: string; enabled: boolean; needs?: string }[] = [
    { id: 'server_crash', title: 'Web server crash', desc: 'Web server 1 dies. Does anything route around it? Are users logged out?', enabled: true },
    { id: 'db_crash', title: 'Master database crash', desc: 'The database that takes writes goes offline. Is there a replica to promote?', enabled: true },
    { id: 'cache_stampede', title: 'Cache flushed', desc: 'The cache restarts empty and every read falls through to the database.', enabled: hasCache, needs: 'Needs stage 5 (cache)' },
    { id: 'traffic_spike', title: 'Traffic spike ×10', desc: 'A sale or viral post multiplies traffic by 10.', enabled: true },
    { id: 'dc_outage', title: 'Data center outage', desc: 'A whole data center goes offline.', enabled: true },
    { id: 'hotspot', title: 'Celebrity hotspot', desc: 'Very popular users all land on one shard.', enabled: hasSharding, needs: 'Needs stage 10 (sharding)' },
  ];

  const tabBtn = (id: 'canvas' | 'chaos' | 'logs', label: string, icon: React.ReactNode, activeCls: string) => (
    <button
      onClick={() => setActiveTab(id)}
      className={`px-4 py-2 rounded-xl text-sm font-semibold flex items-center gap-2 transition-all ${
        activeTab === id ? `${activeCls} text-white shadow-md` : isDarkMode ? 'text-slate-400 hover:text-white hover:bg-slate-800' : 'text-slate-600 hover:bg-slate-100'
      }`}
    >
      {icon}
      <span>{label}</span>
      {id === 'chaos' && activeFailure && <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping"></span>}
    </button>
  );

  const metric = (label: string, value: React.ReactNode, cls: string, hint?: string) => (
    <div className={`p-3 rounded-xl border ${tile}`} title={hint}>
      <span className={`text-xs font-semibold block ${muted}`}>{label}</span>
      <p className={`text-sm font-bold font-mono ${cls}`}>{value}</p>
    </div>
  );

  const goodBad = (bad: boolean) => (bad ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400');

  return (
    <div className="space-y-6">
      {/* CHAPTER HERO */}
      <div className={`p-6 sm:p-8 rounded-3xl border shadow-xl ${isDarkMode ? 'bg-[#161616] border-white/[0.08] text-white' : 'bg-white border-slate-200 text-slate-900'}`}>
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-2 max-w-3xl">
            <div className="flex items-center gap-2">
              <span className="px-3 py-1 bg-indigo-600 text-white text-xs font-bold rounded-full uppercase tracking-wider">Chapter 1</span>
              <span className={`text-xs font-semibold ${isDarkMode ? 'text-indigo-300' : 'text-indigo-700'}`}>System design foundations</span>
            </div>
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold tracking-tight">Scale From Zero To Millions Of Users</h1>
            <p className={`text-sm leading-relaxed ${body}`}>
              Build the book’s architecture one step at a time, from a single server to a sharded, multi-data-center system. At each stage, find the
              weak spot, break it on purpose, then apply the fix.
            </p>
          </div>

          {/* Stage pills — green only once you applied that stage’s fix */}
          <div className={`flex flex-wrap gap-1 shrink-0 p-2 rounded-2xl border max-w-xs ${isDarkMode ? 'bg-slate-950/50 border-indigo-500/20' : 'bg-slate-100 border-slate-300'}`}>
            {STAGES.map((s, i) => {
              const n = i + 1;
              const done = completed.includes(n);
              return (
                <button
                  key={n}
                  onClick={() => goToStage(n)}
                  title={`Stage ${n}: ${s.title}${done ? ' (completed)' : ''}`}
                  className={`w-9 h-9 rounded-xl font-mono text-xs font-bold transition-all flex items-center justify-center ${
                    stage === n
                      ? 'bg-indigo-600 text-white shadow-lg'
                      : done
                      ? 'bg-emerald-100 text-emerald-800 border border-emerald-300 dark:bg-emerald-500/20 dark:text-emerald-300 dark:border-emerald-500/30'
                      : isDarkMode ? 'text-slate-400 hover:text-white' : 'text-slate-500 hover:text-slate-900'
                  }`}
                >
                  {n}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* STAGE HEADER: goal, what changed, controls */}
      <div className={`p-5 rounded-3xl border space-y-4 ${panel}`}>
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-indigo-500/10 text-indigo-500 rounded-2xl border border-indigo-500/20">
              <Workflow className="w-5 h-5" />
            </div>
            <div>
              <p className={`text-xs font-semibold ${muted}`}>Stage {stage} of {STAGE_COUNT}</p>
              <h2 className={`text-lg font-bold ${strong}`}>{content.title}</h2>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              disabled={stage === 1}
              onClick={() => goToStage(stage - 1)}
              className={`px-3 py-1.5 rounded-xl text-sm font-semibold border transition-all disabled:opacity-40 disabled:cursor-not-allowed ${btnSecondary}`}
            >
              ← Previous
            </button>
            <button
              disabled={stage === STAGE_COUNT}
              onClick={() => goToStage(stage + 1)}
              className={`px-3 py-1.5 rounded-xl text-sm font-semibold border transition-all disabled:opacity-40 disabled:cursor-not-allowed ${btnSecondary}`}
            >
              Skip ahead →
            </button>
          </div>
        </div>

        <LessonGoal goal={content.goal} why={content.why} />
        <WhatChanged before={content.before} after={content.after} reason={content.reason} />

        {/* Controls */}
        <div className={`p-4 rounded-2xl border grid grid-cols-1 md:grid-cols-3 gap-4 ${tile}`}>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className={`font-semibold flex items-center gap-1.5 ${muted}`}>
                <Sliders className="w-3.5 h-3.5 text-amber-500" /> Incoming traffic
              </span>
              <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400">
                {fmt(trafficRps)} RPS{spike && ` (×10 = ${fmt(rps)})`}
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={rpsToPos(trafficRps)}
              onChange={(e) => setTrafficRps(posToRps(Number(e.target.value)))}
              className="w-full accent-indigo-500 cursor-pointer"
              aria-label="Incoming traffic, requests per second"
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className={`font-semibold flex items-center gap-1.5 ${muted}`}>
                <SlidersHorizontal className="w-3.5 h-3.5 text-blue-500" /> Read / write mix
              </span>
              <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                {readRatio}% R / {100 - readRatio}% W
              </span>
            </div>
            <input
              type="range"
              min={50}
              max={98}
              value={readRatio}
              onChange={(e) => setReadRatio(Number(e.target.value))}
              className="w-full accent-emerald-500 cursor-pointer"
              aria-label="Share of requests that are reads"
            />
            <p className={`text-xs ${muted}`}>
              {hasReplicas ? (
                <>Master: <span className="font-mono">{fmt(masterUp ? masterQps : 0)}</span> writes/s · each replica: <span className="font-mono">{fmt(replicaQps)}</span> reads/s</>
              ) : (
                <>Database: <span className="font-mono">{fmt(masterQps)}</span> queries/s (reads and writes together)</>
              )}
            </p>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className={`font-semibold flex items-center gap-1.5 ${muted}`}>
                <Server className="w-3.5 h-3.5 text-purple-500" /> Web servers{hasMultiDc ? ' per data center' : ''}
              </span>
              <span className="font-mono font-bold text-purple-600 dark:text-purple-400">{nodesPerDc}</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                disabled={!hasLoadBalancer || autoscaleOn || webCount <= 1}
                onClick={removeNode}
                className={`px-3 py-1 rounded-lg text-xs font-semibold border disabled:opacity-40 ${btnSecondary}`}
              >
                − 1 node
              </button>
              <button
                disabled={!hasLoadBalancer || autoscaleOn || webCount >= MAX_WEB}
                onClick={addNode}
                className="px-3 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold disabled:opacity-40"
              >
                + 1 node
              </button>
              {!hasLoadBalancer && <span className={`text-xs ${muted}`}>Needs a load balancer (stage 3)</span>}
              {hasStatelessSession && (
                <label className={`flex items-center gap-1.5 text-xs font-semibold ${body}`}>
                  <input type="checkbox" checked={autoscale} onChange={(e) => setAutoscale(e.target.checked)} className="accent-indigo-500" />
                  Autoscale
                </label>
              )}
            </div>
            {hasLoadBalancer && !hasStatelessSession && <p className={`text-xs ${muted}`}>Autoscaling unlocks at stage 7: it is unsafe while sessions live on the servers.</p>}
          </div>

          {(hasCache || hasMessageQueue || hasSharding) && (
            <div className="md:col-span-3 grid grid-cols-1 md:grid-cols-3 gap-4 pt-3 border-t border-slate-200 dark:border-slate-800">
              {hasCache && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className={`font-semibold ${muted}`}>Cache hit ratio</span>
                    <span className="font-mono font-bold text-amber-600 dark:text-amber-400">{Math.round(cacheHitRatio * 100)}%</span>
                  </div>
                  <input type="range" min={0} max={98} value={Math.round(cacheHitRatio * 100)} onChange={(e) => setCacheHitRatio(Number(e.target.value) / 100)} className="w-full accent-amber-500 cursor-pointer" aria-label="Cache hit ratio" />
                </div>
              )}
              {hasMessageQueue && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className={`font-semibold ${muted}`}>Queue workers</span>
                    <span className="font-mono font-bold text-purple-600 dark:text-purple-400">{workers} ({workerThroughput} jobs/s vs {photoJobsPerSec.toFixed(1)} in)</span>
                  </div>
                  <div className="flex gap-2">
                    <button disabled={workers <= 1} onClick={() => setWorkers(workers - 1)} className={`px-3 py-1 rounded-lg text-xs font-semibold border disabled:opacity-40 ${btnSecondary}`}>− worker</button>
                    <button disabled={workers >= 40} onClick={() => setWorkers(workers + 1)} className="px-3 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold disabled:opacity-40">+ worker</button>
                  </div>
                </div>
              )}
              {hasSharding && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className={`font-semibold ${muted}`}>Shards (user_id % N)</span>
                    <span className="font-mono font-bold text-blue-600 dark:text-blue-400">N = {shardCount}</span>
                  </div>
                  <input type="range" min={2} max={8} value={shardCount} onChange={(e) => setShardCount(Number(e.target.value))} className="w-full accent-blue-500 cursor-pointer" aria-label="Number of shards" />
                </div>
              )}
            </div>
          )}
        </div>

        {sessionNotice && (
          <div className={`p-3 rounded-xl border text-sm flex items-start gap-2 ${statefulPool ? 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200' : 'border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200'}`}>
            <Users className="w-4 h-4 mt-0.5 shrink-0" />
            <span className="flex-1">{sessionNotice}</span>
            <button onClick={() => setSessionNotice(null)} className="text-xs font-semibold underline">Dismiss</button>
          </div>
        )}
      </div>

      {/* TABS */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-2">
        {tabBtn('canvas', 'Architecture canvas', <Layers className="w-4 h-4" />, 'bg-indigo-600')}
        {tabBtn('chaos', 'Chaos lab', <Flame className="w-4 h-4" />, 'bg-rose-600')}
        {tabBtn('logs', 'Logs & metrics', <Terminal className="w-4 h-4" />, 'bg-emerald-600')}
      </div>

      {/* TAB 1: CANVAS + INSPECTOR */}
      {activeTab === 'canvas' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className={`lg:col-span-2 p-6 rounded-3xl border flex flex-col gap-4 ${panel}`}>
            <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <span className={`w-2.5 h-2.5 rounded-full ${failedPct > 1 ? 'bg-rose-500' : 'bg-emerald-500'} animate-pulse`}></span>
                <h3 className={`text-sm font-bold ${strong}`}>Live architecture, stage {stage}</h3>
              </div>
              <button
                onClick={() => setIsSimulating(!isSimulating)}
                className={`px-3 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 border transition-all ${
                  isSimulating ? 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-500/30' : btnSecondary
                }`}
              >
                {isSimulating ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                <span>{isSimulating ? 'Simulating' : 'Paused'}</span>
              </button>
            </div>

            {hasMultiDc && (
              <div className="flex flex-wrap gap-2 text-xs">
                <span className={`px-2 py-1 rounded-lg border ${tile} ${strong}`}>US-East: <span className="font-mono">{dcDown ? '100%' : '50%'}</span> of traffic</span>
                <span className={`px-2 py-1 rounded-lg border ${dcDown ? statusBg('failed') : tile} ${strong}`}>US-West: {dcDown ? 'OFFLINE' : <span className="font-mono">50%</span>}{!dcDown && ' of traffic'}</span>
                <span className={muted}>Each data center runs the same stack; one is shown below.</span>
              </div>
            )}

            {/* Node graph, laid out in request order */}
            <CanvasCtx.Provider value={{ dark: isDarkMode, selected: selectedComp, select: setSelectedComp }}>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-start">
              <div className="space-y-3">
                <p className={`text-xs font-semibold uppercase tracking-wide ${muted}`}>1 · Find the server</p>
                <NodeCard id={hasMultiDc ? 'geoDns' : 'dns'} icon={<Globe className="w-4 h-4 text-blue-500" />} title={hasMultiDc ? 'geoDNS' : 'DNS'} sub={hasMultiDc ? 'Nearest data center' : hasLoadBalancer ? 'Returns LB IP' : 'Returns server IP'} />
                {hasCdn && <NodeCard id="cdn" icon={<Zap className="w-4 h-4 text-amber-500" />} title="CDN edge" badge={<Badge tone="ok">{staticLatency} ms</Badge>} sub="Static files" />}
                {hasMonitoring && <NodeCard id="monitoring" icon={<BarChart3 className="w-4 h-4 text-emerald-500" />} title="Logs & metrics" sub="Central view" />}
              </div>

              <div className="space-y-3">
                <p className={`text-xs font-semibold uppercase tracking-wide ${muted}`}>2 · Route</p>
                {hasLoadBalancer ? (
                  <NodeCard id="lb" icon={<Layers className="w-4 h-4 text-indigo-500" />} title="Load balancer" badge={<Badge tone={statefulPool ? 'warn' : 'info'}>{statefulPool ? 'sticky' : 'any node'}</Badge>} sub={`${healthyNodes}/${liveDcs * nodesPerDc} nodes healthy`} />
                ) : (
                  <div className={`p-3 rounded-2xl border border-dashed text-xs ${isDarkMode ? 'border-slate-700' : 'border-slate-300'} ${muted}`}>No load balancer: users connect straight to the server’s IP.</div>
                )}
              </div>

              <div className="space-y-2">
                <p className={`text-xs font-semibold uppercase tracking-wide ${muted}`}>3 · Run app code</p>
                {Array.from({ length: Math.min(nodesPerDc, SHOWN_NODES) }).map((_, i) => {
                  const crashed = i === 0 && crashedNodes > 0;
                  const u = crashed ? 0 : nodeUtil(i);
                  const st: NodeStatus = crashed || healthyNodes === 0 ? 'failed' : utilStatus(u);
                  return (
                    <NodeCard
                      key={i}
                      id="web"
                      icon={<Server className="w-4 h-4 text-indigo-500" />}
                      title={stage === 1 ? 'Server (web + DB)' : `web-${i + 1}`}
                      status={st}
                      badge={<Badge tone={statusTone(st)}>{st === 'failed' ? 'DOWN' : `${Math.round(u * 100)}%`}</Badge>}
                    />
                  );
                })}
                {nodesPerDc > SHOWN_NODES && (
                  <p className={`text-xs ${muted}`}>+ {nodesPerDc - SHOWN_NODES} more web nodes{autoscaleOn ? ' (added by autoscaling)' : ''}</p>
                )}
                {hasMessageQueue && (
                  <NodeCard
                    id="mq"
                    icon={<MessageSquare className="w-4 h-4 text-purple-500" />}
                    title="Queue → workers"
                    status={queueWaitSec > 30 ? 'degraded' : 'healthy'}
                    badge={<Badge tone={queueWaitSec > 30 ? 'warn' : 'ok'}>{fmt(mqBacklog)} queued</Badge>}
                    sub={`${workers} worker(s)`}
                  />
                )}
              </div>

              <div className="space-y-2">
                <p className={`text-xs font-semibold uppercase tracking-wide ${muted}`}>4 · Read / write data</p>
                {hasStatelessSession && <NodeCard id="sessionStore" icon={<KeyRound className="w-4 h-4 text-teal-500" />} title="Session store" badge={<Badge tone="ok">shared</Badge>} />}
                {hasCache && (
                  <NodeCard
                    id="cache"
                    icon={<Cpu className="w-4 h-4 text-amber-500" />}
                    title="Cache"
                    status={stampede ? 'degraded' : 'healthy'}
                    badge={<Badge tone={stampede ? 'warn' : 'ok'}>{Math.round(cacheHit * 100)}% hit</Badge>}
                  />
                )}
                <NodeCard
                  id="masterDb"
                  icon={<Database className="w-4 h-4 text-blue-500" />}
                  title={dbCrash && failoverPhase === 'promoted' ? 'Master (was replica 1)' : shardLabel}
                  status={!masterUp ? 'failed' : utilStatus(masterUtil)}
                  badge={<Badge tone={!masterUp ? 'bad' : statusTone(utilStatus(masterUtil))}>{!masterUp ? 'DOWN' : `W ${fmt(masterQps)}/s`}</Badge>}
                  sub={
                    hasSharding ? (
                      <span className="font-mono">{Array.from({ length: shards }).map((_, s) => `S${s}:${pct(hotspot ? (s === 0 ? masterUtil : (dbWrites * 0.5 / (shards - 1)) / DB_CAP) : masterUtil)}`).join(' ')}</span>
                    ) : replicasUp > 0 ? 'Writes only' : stage === 1 ? 'Same machine as the app' : 'Reads + writes'
                  }
                />
                {hasReplicas && (
                  <NodeCard
                    id="slaveDb"
                    icon={<Database className="w-4 h-4 text-emerald-500" />}
                    title={`Read replicas ×${replicasUp}`}
                    status={dbCrash && failoverPhase === 'promoting' ? 'standby' : utilStatus(replicaUtil)}
                    badge={<Badge tone={dbCrash && failoverPhase === 'promoting' ? 'info' : statusTone(utilStatus(replicaUtil))}>{dbCrash && failoverPhase === 'promoting' ? 'PROMOTING…' : `R ${fmt(replicaQps)}/s each`}</Badge>}
                    sub="replicates from master"
                  />
                )}
              </div>
            </div>
            </CanvasCtx.Provider>

            <p className={`text-xs ${body}`}>
              <span className="font-semibold">Request path: </span>
              {requestPath.map((p, i) => (
                <React.Fragment key={p}>
                  {i > 0 && <ArrowRight className="inline w-3 h-3 mx-1 -mt-0.5" />}
                  {p}
                </React.Fragment>
              ))}
            </p>

            <div className="pt-4 border-t border-slate-200 dark:border-slate-800 grid grid-cols-2 sm:grid-cols-5 gap-3">
              {metric('Traffic', `${fmt(rps)} RPS`, 'text-indigo-600 dark:text-indigo-400')}
              {metric('Success rate (now)', `${successRate.toFixed(1)}%`, goodBad(successRate < 99), 'Share of requests currently succeeding in this model')}
              {metric('API latency', `${apiLatency} ms`, goodBad(apiLatency > 150), 'Dynamic request: app + data + congestion + network')}
              {metric('Static assets', `${staticLatency} ms`, goodBad(staticLatency > 100), 'Images, JS, CSS: from the CDN edge or from your web servers')}
              {metric('Cost / month', `$${fmt(monthlyCost)}`, 'text-amber-600 dark:text-amber-400')}
            </div>
            <p className={`text-xs ${muted}`}>All numbers come from a simplified model (e.g. 400 RPS per web server, 1,000 queries/s per database). They are illustrative, not benchmarks — watch the direction they move.</p>
          </div>

          {/* INSPECTOR */}
          <div className={`p-6 rounded-3xl border space-y-4 ${panel}`}>
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <Info className="w-4 h-4 text-indigo-500" />
                <h3 className={`text-sm font-bold ${strong}`}>Component inspector</h3>
              </div>
              <Badge tone="info">{currentInfo.category}</Badge>
            </div>
            <h4 className="text-base font-bold text-indigo-600 dark:text-indigo-400">{currentInfo.name}</h4>
            <div className="space-y-1.5">
              {currentInfo.stats.map(([k, v]) => (
                <div key={k} className={`flex justify-between gap-3 text-xs p-2 rounded-lg border ${tile}`}>
                  <span className={muted}>{k}</span>
                  <span className={`font-mono font-semibold text-right ${strong}`}>{v}</span>
                </div>
              ))}
            </div>

            <div className={`p-3 rounded-2xl border space-y-2 ${tile}`}>
              <span className={`text-xs font-semibold block ${muted}`}>Try it</span>
              {inspected === 'web' ? (
                <div className="flex flex-col gap-2">
                  <button onClick={() => setTrafficRps(Math.min(30000, trafficRps + 500))} className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold">Stress test (+500 RPS)</button>
                  <button onClick={() => setActiveFailure(serverCrash ? null : 'server_crash')} className="px-3 py-1.5 rounded-xl text-xs font-semibold border border-rose-300 text-rose-700 bg-rose-50 hover:bg-rose-100 dark:border-rose-500/30 dark:text-rose-300 dark:bg-rose-500/10">
                    {serverCrash ? 'Restore web-1' : 'Crash web-1'}
                  </button>
                </div>
              ) : inspected === 'cache' ? (
                <div className="flex flex-col gap-2">
                  <button onClick={() => setActiveFailure(stampede ? null : 'cache_stampede')} className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-xs font-semibold">{stampede ? 'Refill cache' : 'Flush cache (cold start)'}</button>
                  <button onClick={() => setCacheHitRatio(0.92)} className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold">Set hit ratio to 92%</button>
                </div>
              ) : inspected === 'masterDb' ? (
                <button onClick={() => setActiveFailure(dbCrash ? null : 'db_crash')} className="w-full px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-semibold">
                  {dbCrash ? 'Restore master' : hasReplicas ? 'Crash master (watch failover)' : 'Crash the database'}
                </button>
              ) : inspected === 'mq' ? (
                <div className="flex gap-2">
                  <button disabled={workers <= 1} onClick={() => setWorkers(workers - 1)} className={`flex-1 px-3 py-1.5 rounded-xl text-xs font-semibold border disabled:opacity-40 ${btnSecondary}`}>− worker</button>
                  <button onClick={() => setWorkers(Math.min(40, workers + 1))} className="flex-1 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold">+ worker</button>
                </div>
              ) : (
                <p className={`text-xs ${body}`}>Use the controls above or the Chaos lab to see how this component reacts.</p>
              )}
            </div>

            <div className="space-y-2 text-sm leading-relaxed">
              {([
                ['What is it?', currentInfo.whatIsIt, 'text-indigo-600 dark:text-indigo-400'],
                ['Why does it exist?', currentInfo.whyExist, 'text-amber-600 dark:text-amber-400'],
                ['If you removed it', currentInfo.whatIfRemoved, 'text-rose-600 dark:text-rose-400'],
                ['Trade-offs', currentInfo.tradeoffs, 'text-purple-600 dark:text-purple-400'],
              ] as const).map(([label, text, cls]) => (
                <div key={label} className={`p-3 rounded-xl border ${tile}`}>
                  <span className={`text-xs font-semibold block ${cls}`}>{label}</span>
                  <p className={body}>{text}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: CHAOS LAB */}
      {activeTab === 'chaos' && (
        <div className={`p-6 rounded-3xl border space-y-5 ${panel}`}>
          <div className="space-y-1">
            <h3 className="text-base font-bold text-rose-600 dark:text-rose-400 flex items-center gap-2">
              <Flame className="w-5 h-5" /> Chaos lab
            </h3>
            <p className={`text-sm ${body}`}>Break one thing at a time and see how the current stage’s architecture copes. Try the same failure at different stages.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {failureCards.map((f) => {
              const on = activeFailure === f.id;
              return (
                <button
                  key={f.id}
                  disabled={!f.enabled}
                  onClick={() => setActiveFailure(on ? null : f.id)}
                  className={`p-4 rounded-2xl border text-left space-y-1.5 transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
                    on ? 'bg-rose-600 border-rose-600 text-white ring-2 ring-rose-400 shadow-lg' : `${tile} ${strong} hover:border-rose-300`
                  }`}
                >
                  <span className="text-sm font-semibold block">{f.title}</span>
                  <p className={`text-xs leading-relaxed ${on ? 'text-rose-50' : body}`}>{f.enabled ? f.desc : f.needs}</p>
                </button>
              );
            })}
          </div>

          {activeFailure && (
            <div className="p-4 rounded-2xl border border-rose-300 bg-rose-50 text-rose-900 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-100 space-y-2">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-semibold">What happened at stage {stage}</span>
                <button onClick={() => setActiveFailure(null)} className="px-2.5 py-1 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-semibold">Clear failure</button>
              </div>
              <ul className="list-disc pl-5 text-sm space-y-1">
                {failureReport().map((l) => <li key={l}>{l}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: LOGS & METRICS */}
      {activeTab === 'logs' && (
        <div className="space-y-4">
          {hasMonitoring ? (
            <div className={`p-5 rounded-3xl border grid grid-cols-1 md:grid-cols-3 gap-3 ${panel}`}>
              <div className="md:col-span-3 flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-emerald-500" />
                <h3 className={`text-sm font-bold ${strong}`}>Central metrics (unlocked at stage 9)</h3>
              </div>
              {metric('Host: busiest web node CPU', pct(hottestWebUtil), goodBad(hottestWebUtil > 0.85))}
              {metric('Aggregate: database tier load', pct(dbUtil), goodBad(dbUtil > 0.85))}
              {metric('Business: successful requests/s', fmt(rps * successRate / 100), 'text-indigo-600 dark:text-indigo-400')}
            </div>
          ) : (
            <div className="p-4 rounded-2xl border border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100 text-sm">
              No central logging yet: in a real system at this stage each server keeps its own log file, and you would log in to each one to find
              an error. This sandbox shows you everything anyway; stage 9 adds central logging and metrics.
            </div>
          )}

          <div className="p-6 rounded-3xl border space-y-4 bg-slate-900 border-slate-700 text-slate-100">
            <div className="flex items-center justify-between pb-3 border-b border-slate-700">
              <div className="flex items-center gap-2">
                <Terminal className="w-4 h-4 text-emerald-400" />
                <h3 className="text-sm font-semibold text-slate-200">Request log</h3>
              </div>
              <button onClick={() => setLogs([])} className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs rounded-lg">Clear</button>
            </div>
            <div className="h-80 overflow-y-auto space-y-1.5 text-xs font-mono pr-2">
              {logs.length === 0 && <p className="text-slate-400 font-sans">Logs appear here while the simulation runs.</p>}
              {logs.map((log) => (
                <div key={log.id} className="flex items-start gap-3 py-1 border-b border-slate-800">
                  <span className="text-slate-400 shrink-0">{log.timestamp}</span>
                  <span className={`px-1.5 py-0.5 rounded text-[11px] font-bold uppercase shrink-0 ${
                    log.type === 'error' ? 'bg-rose-950 text-rose-300 border border-rose-800'
                      : log.type === 'warn' ? 'bg-amber-950 text-amber-300 border border-amber-800'
                      : log.type === 'success' ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                      : 'bg-blue-950 text-blue-300 border border-blue-800'
                  }`}>
                    {log.source}
                  </span>
                  <span className={log.type === 'error' ? 'text-rose-300' : log.type === 'warn' ? 'text-amber-300' : log.type === 'success' ? 'text-emerald-300' : 'text-slate-300'}>
                    {log.message}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* WEAK SPOT → FIX, TAKEAWAY, QUIZ */}
      <div className={`p-5 rounded-3xl border space-y-4 ${panel}`}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-xl border p-4 border-rose-200 bg-rose-50/70 dark:border-rose-400/20 dark:bg-rose-400/[0.06]">
            <p className="text-xs font-semibold uppercase tracking-wide text-rose-700 dark:text-rose-300 mb-1">Weak spot at this stage</p>
            <p className="text-sm text-slate-800 dark:text-slate-100 leading-relaxed">{content.weakSpot}</p>
          </div>
          <div className="rounded-xl border p-4 border-emerald-200 bg-emerald-50/70 dark:border-emerald-400/20 dark:bg-emerald-400/[0.06] flex flex-col gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300 mb-1 flex items-center gap-1.5">
                <Wrench className="w-3.5 h-3.5" /> {stage < STAGE_COUNT ? 'The fix (next stage)' : 'Beyond this chapter'}
              </p>
              <p className="text-sm text-slate-800 dark:text-slate-100 leading-relaxed">{content.fix}</p>
            </div>
            <button onClick={applyFixAndAdvance} className="self-start px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-sm font-semibold flex items-center gap-2">
              {completed.includes(stage) && <CheckCircle2 className="w-4 h-4" />}
              {stage < STAGE_COUNT ? `Apply the fix → stage ${stage + 1}` : completed.includes(stage) ? 'Chapter complete' : 'Mark chapter complete'}
            </button>
          </div>
        </div>
        <Takeaway>{content.takeaway}</Takeaway>
        <Quiz key={stage} persistKey={`chapter1:quiz:stage${stage}`} questions={content.quiz} title={`Stage ${stage} check`} />
      </div>
    </div>
  );
};
