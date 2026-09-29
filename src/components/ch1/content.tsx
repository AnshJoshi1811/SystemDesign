import React from 'react';
import { Term, QuizQuestion } from '../learn/LearningKit';

export interface StageContent {
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

export const STAGES: StageContent[] = [
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
        <Term term="single point of failure (SPOF)">A part of a system that, if it fails, stops the entire system from working.</Term>. Crash it with the red
        button above the diagram and every request fails.
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
          { text: 'A replica is promoted to master. Writes pause until then; reads continue on the other replicas.', correct: true, why: 'Crash the master to watch this. In production the promoted replica may need recovery scripts to fill in missing data.' },
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
        Static files still come from your web servers: they use web CPU and load slowly for users far away. The next stage tests
        this with users on another continent.
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
          { text: 'Static files, served from an edge server near the user instead of from your web servers.', correct: true, why: 'API latency barely moves while static-file latency drops.' },
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
    reason: 'A stateless system is simpler, more robust and easier to scale. It also makes autoscaling possible.',
    weakSpot: (
      <>
        Everything runs in one data center. Distant users pay extra network latency, and a data-center outage takes the whole site down. Try "Data
        center outage" above the diagram.
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
          { text: 'Route 100% of traffic to the healthy data center (US-East).', correct: true, why: 'This is the book’s failover picture. US-East must have enough capacity for double its load.' },
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
    after: 'Jobs go to a queue; a worker pool processes them. Logs and metrics are collected centrally.',
    reason: 'Producers and consumers scale separately: add workers when the queue grows, remove them when it is empty.',
    weakSpot: (
      <>
        Every write still goes to one master database. The web tier can keep scaling out, but write load on the master becomes the limit, even
        with a cache and replicas. One machine has hardware limits.
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
          { text: 'Add more workers. Producers and consumers scale independently.', correct: true, why: 'Consumers are scaled separately from producers.' },
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
        across shards.
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
