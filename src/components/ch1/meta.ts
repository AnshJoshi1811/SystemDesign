import { Kind, Scenario } from './model';
import { StageContent } from './content';

/** Stage 11: the whole picture. Explore only, no break/fix. */
export const FINAL_STAGE: StageContent = {
  title: 'Final architecture',
  goal: 'Put every piece together and explain what each one is for, and what breaks without it.',
  why: 'This is the design the chapter builds, from one server to millions of users. Click any component and crash it: most failures should now be graceful.',
  before: 'One server running everything.',
  after:
    'GeoDNS, a CDN, load balancers, stateless web servers, a cache, a session store, a message queue with workers, and sharded databases with replicas, in two data centers.',
  reason: 'Every component removes one specific bottleneck or single point of failure you met on the way.',
  weakSpot: 'Crash components one by one from the inspector. Which failures still hurt, and why?',
  fix: 'Beyond this chapter: split the tiers into smaller services, and keep measuring before adding more.',
  takeaway:
    'Keep the web tier stateless, build redundancy at every tier, cache as much as you can, support multiple data centers, host static assets in a CDN, shard the data tier, split tiers into services, and monitor and automate.',
  quiz: [
    {
      question: 'A web server, the cache and one database replica all crash at once. Roughly what do users notice?',
      options: [
        {
          text: 'Little: the load balancer skips the dead web server, reads fall back to the database, and latency rises a bit.',
          correct: true,
          why: 'Redundancy at every tier means each loss costs some capacity or speed, not availability. Try it in the diagram.',
        },
        { text: 'A full outage, because three components failed.', why: 'None of them is a single point of failure any more.' },
        { text: 'All writes fail until the cache is back.', why: 'Writes go to the master databases. The cache only speeds up reads.' },
      ],
    },
    {
      question: 'Which piece lets you add and remove web servers freely?',
      options: [
        { text: 'The stateless web tier with a shared session store.', correct: true, why: 'With no user state on the servers, any server can take any request.' },
        { text: 'The CDN.', why: 'The CDN offloads static files. It does not change how web servers join or leave the pool.' },
        { text: 'Database sharding.', why: 'Sharding scales the data tier, not the web tier.' },
      ],
    },
  ],
};

export type ExperimentAction = { scenario: Scenario } | { crash: string };

export interface Experiment {
  id: string;
  label: string;
  description: string;
  action: ExperimentAction;
}

export interface StageMeta {
  minutes: number;
  keyNode: string;
  experiments: Experiment[];
  defaults: { rps: number; readPct: number; websPerDc: number };
}

/** Per-stage workspace settings, indexed like the stage list (10 book stages + final). */
export const STAGE_META: StageMeta[] = [
  {
    minutes: 8,
    keyNode: 'server',
    experiments: [
      { id: 'crash', label: 'Crash the server', description: 'The only machine goes offline.', action: { crash: 'server' } },
      { id: 'spike', label: 'Traffic spike (5×)', description: 'A post goes viral and traffic jumps five-fold.', action: { scenario: 'spike' } },
    ],
    defaults: { rps: 100, readPct: 85, websPerDc: 1 },
  },
  {
    minutes: 10,
    keyNode: 'db',
    experiments: [{ id: 'spike', label: 'Traffic spike (5×)', description: 'Traffic jumps five-fold. Who runs out of room first?', action: { scenario: 'spike' } }],
    defaults: { rps: 200, readPct: 85, websPerDc: 1 },
  },
  {
    minutes: 12,
    keyNode: 'lb-1',
    experiments: [{ id: 'crash-web', label: 'Crash a web server', description: 'Web server 1 dies in the middle of the day.', action: { crash: 'web-1-1' } }],
    defaults: { rps: 350, readPct: 85, websPerDc: 3 },
  },
  {
    minutes: 15,
    keyNode: 'db',
    experiments: [{ id: 'crash-db', label: 'Crash the database', description: 'The database server fails.', action: { crash: 'db' } }],
    defaults: { rps: 700, readPct: 85, websPerDc: 3 },
  },
  {
    minutes: 12,
    keyNode: 'cache',
    experiments: [
      { id: 'read-surge', label: 'Popular page (4× reads)', description: 'A trending page makes every visit run four times more reads.', action: { scenario: 'read-surge' } },
    ],
    defaults: { rps: 600, readPct: 85, websPerDc: 3 },
  },
  {
    minutes: 10,
    keyNode: 'cdn',
    experiments: [
      { id: 'far-users', label: 'Users far away load a page', description: 'Visitors from another continent load a page full of images.', action: { scenario: 'far-users' } },
    ],
    defaults: { rps: 600, readPct: 85, websPerDc: 3 },
  },
  {
    minutes: 12,
    keyNode: 'session',
    experiments: [
      { id: 'crash-web', label: 'Lose a web server', description: 'Web server 1 is removed: a crash, or the autoscaler shrinking the pool.', action: { crash: 'web-1-1' } },
    ],
    defaults: { rps: 600, readPct: 85, websPerDc: 3 },
  },
  {
    minutes: 12,
    keyNode: 'dns',
    experiments: [{ id: 'dc-down', label: 'Data center outage', description: 'The US-East data center loses power.', action: { scenario: 'dc-down' } }],
    defaults: { rps: 600, readPct: 85, websPerDc: 2 },
  },
  {
    minutes: 12,
    keyNode: 'queue',
    experiments: [
      { id: 'upload-burst', label: 'Burst of photo uploads', description: 'Thousands of users upload photos that need slow processing.', action: { scenario: 'upload-burst' } },
    ],
    defaults: { rps: 600, readPct: 85, websPerDc: 2 },
  },
  {
    minutes: 15,
    keyNode: 'shard-1',
    experiments: [
      { id: 'write-surge', label: 'Write surge (5× writes)', description: 'A new feature makes every user write five times more.', action: { scenario: 'write-surge' } },
    ],
    defaults: { rps: 1000, readPct: 80, websPerDc: 2 },
  },
  {
    minutes: 10,
    keyNode: 'lb-1',
    experiments: [],
    defaults: { rps: 1200, readPct: 85, websPerDc: 2 },
  },
];

/** Plain-language name for each component type, used in the tech stack table. */
export const KIND_NAME: Record<Kind, string> = {
  dns: 'DNS',
  cdn: 'CDN',
  lb: 'Load balancer',
  server: 'Single server',
  web: 'Web servers',
  cache: 'Cache',
  session: 'Session store',
  queue: 'Message queue',
  workers: 'Workers',
  master: 'Database (master)',
  replica: 'Read replicas',
};

/** Technologies commonly used for each component in real systems. First entry = the usual default. */
export const TECH: Record<Kind, { name: string; note: string }[]> = {
  dns: [
    { name: 'Amazon Route 53', note: 'Managed DNS with geo and latency-based routing (geoDNS) and health checks.' },
    { name: 'Cloudflare DNS', note: 'Fast global DNS, often paired with Cloudflare’s CDN.' },
    { name: 'Google Cloud DNS', note: 'Managed DNS for workloads on Google Cloud.' },
  ],
  cdn: [
    { name: 'Cloudflare', note: 'Global edge network: CDN, DDoS protection and caching rules.' },
    { name: 'Amazon CloudFront', note: 'AWS CDN; pulls from S3 or your servers as the origin.' },
    { name: 'Akamai', note: 'One of the largest, longest-running CDNs, common in big enterprises.' },
    { name: 'Fastly', note: 'CDN known for instant cache purges and edge logic.' },
  ],
  lb: [
    { name: 'NGINX', note: 'Web server and reverse proxy; a very common software load balancer.' },
    { name: 'AWS Elastic Load Balancing', note: 'Managed ALB (HTTP) and NLB (TCP) load balancers with health checks.' },
    { name: 'HAProxy', note: 'High-performance open-source TCP/HTTP load balancer.' },
    { name: 'Envoy', note: 'Modern proxy used in service meshes and by Kubernetes ingress controllers.' },
  ],
  server: [
    { name: 'A cloud VM (AWS EC2, DigitalOcean)', note: 'One virtual machine running the app and the database, e.g. a LAMP stack.' },
    { name: 'Heroku / Render', note: 'Platforms that run a small app for you without managing the machine.' },
  ],
  web: [
    { name: 'Node.js (Express, NestJS)', note: 'JavaScript/TypeScript API servers; good for I/O-heavy APIs.' },
    { name: 'Java (Spring Boot)', note: 'Widely used for large backend services.' },
    { name: 'Python (Django, FastAPI)', note: 'Fast to build with; common for web apps and APIs.' },
    { name: 'Go', note: 'Compiled, lightweight services with low memory use.' },
    { name: 'Kubernetes / Amazon ECS', note: 'Run the web servers as containers and autoscale them.' },
  ],
  cache: [
    { name: 'Redis', note: 'In-memory key-value store with TTLs and rich data types; the usual default.' },
    { name: 'Memcached', note: 'Simple, very fast in-memory cache for plain key-value data.' },
    { name: 'Amazon ElastiCache', note: 'Managed Redis or Memcached on AWS.' },
  ],
  session: [
    { name: 'Redis', note: 'Session data with automatic expiry via TTL.' },
    { name: 'Amazon DynamoDB', note: 'Managed NoSQL key-value store, as the book suggests for shared state.' },
    { name: 'Apache Cassandra', note: 'Distributed NoSQL for very large, multi-data-center setups.' },
  ],
  queue: [
    { name: 'Apache Kafka', note: 'Durable, high-throughput event log; consumers read at their own pace.' },
    { name: 'RabbitMQ', note: 'Classic message broker with flexible routing and acknowledgements.' },
    { name: 'Amazon SQS', note: 'Fully managed queue; nothing to operate.' },
    { name: 'Google Cloud Pub/Sub', note: 'Managed publish/subscribe messaging on Google Cloud.' },
  ],
  workers: [
    { name: 'Celery (Python)', note: 'Background job workers fed by a broker such as RabbitMQ or Redis.' },
    { name: 'Sidekiq (Ruby) / BullMQ (Node.js)', note: 'Job workers backed by Redis.' },
    { name: 'Kafka consumer groups', note: 'Several consumers share a topic’s partitions to process events in parallel.' },
    { name: 'AWS Lambda', note: 'Serverless functions triggered by queue messages.' },
  ],
  master: [
    { name: 'MySQL', note: 'The relational database the book uses in its examples.' },
    { name: 'PostgreSQL', note: 'Feature-rich open-source relational database.' },
    { name: 'Amazon Aurora / RDS', note: 'Managed MySQL/PostgreSQL with automatic failover.' },
    { name: 'Vitess / Citus', note: 'Sharding layers for MySQL (Vitess) and PostgreSQL (Citus).' },
  ],
  replica: [
    { name: 'MySQL replication', note: 'Built-in asynchronous primary → replica replication.' },
    { name: 'PostgreSQL streaming replication', note: 'Replicas follow the primary’s write-ahead log.' },
    { name: 'Aurora read replicas', note: 'Managed replicas that share storage with the primary.' },
  ],
};

/** Short explanation per component kind, for the inspector. */
export const COMPONENT_INFO: Record<Kind, { what: string; why: string; without: string }> = {
  dns: {
    what: 'Turns a name like api.app.com into an IP address. With geoDNS, the answer depends on where the user is.',
    why: 'Browsers need an IP to connect to. After the lookup, DNS is out of the request path.',
    without: 'Nobody can find your site by name.',
  },
  cdn: {
    what: 'Servers around the world that cache static files (images, JS, CSS, video) close to users.',
    why: 'Distant users get files faster, and web servers stop spending CPU sending them.',
    without: 'Static files come from your web servers, slowly for far-away users.',
  },
  lb: {
    what: 'Spreads incoming requests across a pool of web servers and skips any that fail health checks.',
    why: 'Lets you add web servers for capacity and survive one of them dying.',
    without: 'Users hit one web server directly. If it goes down, so does the site.',
  },
  server: {
    what: 'One machine running both the web application and the database.',
    why: 'The simplest setup that works. Fine for the first users.',
    without: 'Nothing is running.',
  },
  web: {
    what: 'Runs your application code: validates requests, talks to the data tier, returns responses.',
    why: 'Every dynamic request needs one. More of them means more capacity.',
    without: 'With a load balancer, the remaining servers take its share. Without one, the site is down.',
  },
  cache: {
    what: 'An in-memory store for data that is read often and changed rarely.',
    why: 'Memory answers in microseconds, so most reads never reach the database.',
    without: 'Every read goes to the database: slower responses and a busier database.',
  },
  session: {
    what: 'A shared data store (the book uses NoSQL) holding user sessions.',
    why: 'Web servers keep no user state, so any server can handle any request.',
    without: 'Users cannot stay logged in; every request that needs a session fails.',
  },
  queue: {
    what: 'A durable buffer. Producers put jobs in; consumers take them out when they can.',
    why: 'Slow work like photo processing happens in the background, not inside the user’s request.',
    without: 'Web servers do slow jobs inline, and users wait.',
  },
  workers: {
    what: 'Background processes that pull jobs off the queue and do the work.',
    why: 'They scale separately from the web tier: add workers when the queue grows.',
    without: 'Jobs pile up in the queue until workers come back.',
  },
  master: {
    what: 'The primary database. It handles all writes (insert, update, delete).',
    why: 'One source of truth for changes to the data.',
    without: 'Writes fail. With replicas, one is promoted to master after a short pause.',
  },
  replica: {
    what: 'A read-only copy of the master, kept up to date asynchronously.',
    why: 'Serves reads in parallel and can take over if the master fails.',
    without: 'Reads shift to the remaining replicas, or to the master.',
  },
};
