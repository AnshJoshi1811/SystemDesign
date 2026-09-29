/*
 * Chapter 1 architecture model.
 *
 * Illustrative capacity numbers, chosen so each step moves the metrics the way
 * the book describes. They are not benchmarks.
 */

export type Kind = 'dns' | 'cdn' | 'lb' | 'server' | 'web' | 'cache' | 'session' | 'queue' | 'workers' | 'master' | 'replica';

export interface Features {
  separateDb: boolean;
  lb: boolean;
  replicas: boolean;
  cache: boolean;
  cdn: boolean;
  stateless: boolean;
  multiDc: boolean;
  queue: boolean;
  shards: boolean;
}

/** Architecture level 1..10 = the book's stages; each level adds one component. */
export const featuresAt = (level: number): Features => ({
  separateDb: level >= 2,
  lb: level >= 3,
  replicas: level >= 4,
  cache: level >= 5,
  cdn: level >= 6,
  stateless: level >= 7,
  multiDc: level >= 8,
  queue: level >= 9,
  shards: level >= 10,
});

export interface ArchNode {
  id: string;
  kind: Kind;
  label: string;
  sub: string;
  dc?: 1 | 2;
}

export type EdgeKind = 'request' | 'replication' | 'async' | 'static';
export interface ArchEdge {
  from: string;
  to: string;
  kind: EdgeKind;
}

/** Rows top to bottom. The data row has three groups: left services, databases, right services. */
export interface Arch {
  level: number;
  f: Features;
  edge: ArchNode[];
  lbs: ArchNode[];
  webs: ArchNode[];
  dataLeft: ArchNode[];
  dbs: ArchNode[];
  dataRight: ArchNode[];
  replicas: ArchNode[];
  edges: ArchEdge[];
  all: ArchNode[];
}

export function buildArch(level: number, websPerDc: number): Arch {
  const f = featuresAt(level);
  const dcs: (1 | 2)[] = f.multiDc ? [1, 2] : [1];
  const dcName = (d: 1 | 2) => (d === 1 ? 'US-East' : 'US-West');

  const edge: ArchNode[] = [
    { id: 'dns', kind: 'dns', label: f.multiDc ? 'GeoDNS' : 'DNS', sub: f.multiDc ? 'Nearest data center' : f.lb ? 'Returns LB IP' : 'Returns server IP' },
  ];
  if (f.cdn) edge.push({ id: 'cdn', kind: 'cdn', label: 'CDN', sub: 'Static files at the edge' });

  const lbs: ArchNode[] = f.lb
    ? dcs.map((d) => ({ id: `lb-${d}`, kind: 'lb' as const, label: f.multiDc ? `Load balancer · ${dcName(d)}` : 'Load balancer', sub: 'Distributes traffic', dc: d }))
    : [];

  let webs: ArchNode[];
  if (level === 1) webs = [{ id: 'server', kind: 'server', label: 'Server', sub: 'Web app + database', dc: 1 }];
  else if (!f.lb) webs = [{ id: 'web-1-1', kind: 'web', label: 'Web server', sub: 'Handles app requests', dc: 1 }];
  else
    webs = dcs.flatMap((d) =>
      Array.from({ length: websPerDc }, (_, i) => ({
        id: `web-${d}-${i + 1}`,
        kind: 'web' as const,
        label: f.multiDc ? `Web-${i + 1} · ${d === 1 ? 'East' : 'West'}` : `Web-${i + 1}`,
        sub: 'Handles app requests',
        dc: d,
      })),
    );

  const dataLeft: ArchNode[] = [];
  if (f.cache) dataLeft.push({ id: 'cache', kind: 'cache', label: 'Cache', sub: 'Hot data in memory' });
  if (f.stateless) dataLeft.push({ id: 'session', kind: 'session', label: 'Session store', sub: 'Shared NoSQL' });

  const dbs: ArchNode[] = !f.separateDb
    ? []
    : f.shards
    ? [
        { id: 'shard-1', kind: 'master', label: 'Shard 1 · master', sub: 'user_id % 2 = 0' },
        { id: 'shard-2', kind: 'master', label: 'Shard 2 · master', sub: 'user_id % 2 = 1' },
      ]
    : [{ id: 'db', kind: 'master', label: f.replicas ? 'Master DB' : 'Database', sub: f.replicas ? 'Handles writes' : 'Reads and writes' }];

  const dataRight: ArchNode[] = [];
  if (f.queue) {
    dataRight.push({ id: 'queue', kind: 'queue', label: 'Message queue', sub: 'Buffers slow jobs' });
    dataRight.push({ id: 'workers', kind: 'workers', label: 'Workers', sub: 'Process jobs' });
  }

  const replicas: ArchNode[] = !f.replicas
    ? []
    : f.shards
    ? [
        { id: 'shard-1-r', kind: 'replica', label: 'Shard 1 · replica', sub: 'Handles reads' },
        { id: 'shard-2-r', kind: 'replica', label: 'Shard 2 · replica', sub: 'Handles reads' },
      ]
    : [
        { id: 'replica-1', kind: 'replica', label: 'Replica-1', sub: 'Handles reads' },
        { id: 'replica-2', kind: 'replica', label: 'Replica-2', sub: 'Handles reads' },
      ];

  const edges: ArchEdge[] = [];
  if (f.cdn) edges.push({ from: 'dns', to: 'cdn', kind: 'static' });
  if (f.lb) {
    lbs.forEach((lb) => edges.push({ from: 'dns', to: lb.id, kind: 'request' }));
    webs.forEach((w) => edges.push({ from: `lb-${w.dc}`, to: w.id, kind: 'request' }));
  } else edges.push({ from: 'dns', to: webs[0].id, kind: 'request' });

  webs.forEach((w) => {
    if (f.cache) edges.push({ from: w.id, to: 'cache', kind: 'request' });
    if (f.stateless) edges.push({ from: w.id, to: 'session', kind: 'request' });
    dbs.forEach((db) => edges.push({ from: w.id, to: db.id, kind: 'request' }));
    if (f.queue) edges.push({ from: w.id, to: 'queue', kind: 'async' });
  });
  if (f.queue) edges.push({ from: 'queue', to: 'workers', kind: 'async' });
  replicas.forEach((r, i) => edges.push({ from: dbs[f.shards ? i : 0].id, to: r.id, kind: 'replication' }));

  const all = [...edge, ...lbs, ...webs, ...dataLeft, ...dbs, ...dataRight, ...replicas];
  return { level, f, edge, lbs, webs, dataLeft, dbs, dataRight, replicas, edges, all };
}

// ---------------------------------------------------------------------------
// Simulation
// ---------------------------------------------------------------------------

export const CAP = {
  box: 250, // stage 1: web app and DB on one machine, requests/s
  web: 400, // one web server, requests/s
  db: 1000, // one database doing reads and writes, queries/s
  master: 500, // writes/s one master takes (per shard)
  replica: 800, // reads/s one replica serves
  worker: 150, // queued jobs/s the worker pool drains
};
export const FAILOVER_MS = 6000;
const BACKLOG_START = 3000;

export type Scenario = 'spike' | 'read-surge' | 'far-users' | 'dc-down' | 'upload-burst' | 'write-surge';

export interface Inputs {
  rps: number;
  readPct: number;
  websPerDc: number;
  cacheHit: number; // %
}

export interface Failures {
  crashed: string[];
  /** When the (non-sharded) master crashed; drives the replica promotion timer. */
  masterDownAt: number | null;
  scenario: Scenario | null;
  scenarioAt: number | null;
}

export type Status = 'healthy' | 'busy' | 'down' | 'promoting' | 'idle';
export interface NodeState {
  status: Status;
  load: number; // 0..1+
  badge?: string;
  role?: string;
  throughput?: string;
}

export interface SimResult {
  nodes: Record<string, NodeState>;
  success: number; // 0..1
  apiMs: number;
  staticMs: number;
  cost: number;
  loggedOutPct: number;
  backlog: number;
  promoted: boolean;
  writesPaused: boolean;
  headline: string;
}

const congestion = (u: number) => (u < 0.7 ? 0 : Math.round(Math.min(600, ((u - 0.7) / 0.3) ** 2 * 150)));
const pct = (n: number) => `${Math.round(n * 100)}%`;
const perSec = (n: number) => `${Math.round(n).toLocaleString()}/s`;

const PRICE: Record<Kind, number> = { dns: 5, cdn: 40, lb: 20, server: 60, web: 70, cache: 60, session: 50, queue: 30, workers: 70, master: 150, replica: 120 };

export function simulate(arch: Arch, inp: Inputs, fail: Failures, now: number): SimResult {
  const f = arch.f;
  const nodes: Record<string, NodeState> = {};
  arch.all.forEach((n) => (nodes[n.id] = { status: 'healthy', load: 0 }));
  const isDown = (id: string) => fail.crashed.includes(id);
  const sc = fail.scenario;

  // ---- Data center outage ----
  const dcDown = sc === 'dc-down';
  if (dcDown) {
    arch.all.forEach((n) => {
      if (!f.multiDc || n.dc === 1) nodes[n.id].status = 'down';
    });
  }

  const rps = inp.rps * (sc === 'spike' ? 5 : 1);
  const readFrac = inp.readPct / 100;

  // ---- Web tier ----
  const staticMult = f.cdn ? 1 : 1.3; // without a CDN, web servers also send images/JS/CSS
  const uploadInline = sc === 'upload-burst' && !f.queue;
  const demand = rps * staticMult * (uploadInline ? 1.8 : 1);

  const webs = arch.webs;
  const healthyWebs = webs.filter((w) => !isDown(w.id) && nodes[w.id].status !== 'down');
  const perNodeCap = arch.level === 1 ? CAP.box : CAP.web;
  const reachable = f.lb ? healthyWebs : healthyWebs.filter((w) => w.id === webs[0].id);
  const webCap = reachable.length * perNodeCap;
  const sWeb = webCap === 0 ? 0 : Math.min(1, webCap / demand);
  const avgLoad = webCap === 0 ? 0 : demand / webCap;
  const sticky = f.lb && !f.stateless;
  reachable.forEach((w, i) => {
    const skew = sticky ? (i === 0 ? 1.3 : 0.85) : 1;
    const load = avgLoad * skew;
    nodes[w.id] = { status: load > 1 ? 'busy' : 'healthy', load, badge: pct(Math.min(load, 1)), throughput: perSec((Math.min(demand, webCap) / reachable.length) * skew) };
  });
  webs.forEach((w) => {
    if (isDown(w.id) || nodes[w.id].status === 'down') nodes[w.id] = { status: 'down', load: 0, badge: 'down' };
  });
  arch.lbs.forEach((lb) => {
    if (nodes[lb.id].status === 'down') return;
    const share = f.multiDc && dcDown ? 1 : 1 / arch.lbs.length;
    nodes[lb.id] = { status: 'healthy', load: 0.2, badge: perSec(rps * share), throughput: perSec(rps * share) };
  });
  if (nodes.dns.status !== 'down') nodes.dns = { status: 'healthy', load: 0.05, throughput: perSec(rps) };
  if (f.multiDc && dcDown) nodes.dns.badge = 'all → West';

  const loggedOutPct = sticky && webs.length > 0 ? (webs.filter((w) => isDown(w.id)).length / webs.length) * 100 : 0;

  // ---- Data tier ----
  const served = rps * sWeb;
  let reads = served * readFrac * (sc === 'read-surge' ? 4 : 1);
  let writes = served * (1 - readFrac) * (sc === 'write-surge' ? 5 : 1);
  const cacheUp = f.cache && !isDown('cache') && nodes.cache?.status !== 'down';
  if (f.cache) {
    const hit = cacheUp ? inp.cacheHit / 100 : 0;
    nodes.cache = cacheUp
      ? { status: 'healthy', load: 0.3, badge: `hit ${inp.cacheHit}%`, throughput: perSec(reads * hit) }
      : { status: 'down', load: 0, badge: 'down' };
    reads = reads * (1 - hit);
  }
  if (f.stateless) {
    nodes.session = isDown('session') ? { status: 'down', load: 0, badge: 'down' } : { status: 'healthy', load: 0.2, throughput: perSec(served) };
  }

  let sRead = 1;
  let sWrite = 1;
  let dbLoad = 0;
  let promoted = false;
  let writesPaused = false;

  if (arch.level === 1) {
    // The single box serves everything; its limit is already in sWeb.
    const box = nodes.server;
    if (box.status !== 'down') box.throughput = `${perSec(reads)} reads, ${perSec(writes)} writes`;
  } else if (!f.replicas) {
    const db = arch.dbs[0];
    if (isDown(db.id) || nodes[db.id].status === 'down') {
      nodes[db.id] = { status: 'down', load: 0, badge: 'down' };
      sRead = sWrite = 0;
    } else {
      dbLoad = (reads + writes) / CAP.db;
      const s = Math.min(1, CAP.db / Math.max(1, reads + writes));
      sRead = sWrite = s;
      nodes[db.id] = { status: dbLoad > 1 ? 'busy' : 'healthy', load: dbLoad, badge: pct(Math.min(dbLoad, 1)), throughput: `${perSec(reads)} R, ${perSec(writes)} W` };
    }
  } else {
    // Master(s) take writes, replicas take reads.
    const groups = f.shards
      ? arch.dbs.map((m, i) => ({ master: m, reps: [arch.replicas[i]] }))
      : [{ master: arch.dbs[0], reps: arch.replicas }];
    let writeOk = 0;
    let readOk = 0;
    const wShare = writes / groups.length;
    const rShare = reads / groups.length;
    groups.forEach(({ master, reps }) => {
      let masterUp = !isDown(master.id) && nodes[master.id].status !== 'down';
      let liveReps = reps.filter((r) => !isDown(r.id) && nodes[r.id].status !== 'down');
      if (!masterUp && !f.shards && fail.masterDownAt !== null) {
        if (now - fail.masterDownAt < FAILOVER_MS && liveReps.length) {
          writesPaused = true;
          nodes[liveReps[0].id] = { status: 'promoting', load: 0.5, badge: `promoting… ${Math.ceil((FAILOVER_MS - (now - fail.masterDownAt)) / 1000)}s` };
        } else if (liveReps.length) {
          promoted = true;
          masterUp = true;
          const p = liveReps[0];
          liveReps = liveReps.slice(1);
          const wl = wShare / CAP.master;
          nodes[p.id] = { status: wl > 1 ? 'busy' : 'healthy', load: wl, badge: `new master · W ${perSec(wShare)}`, role: 'Promoted to master' };
          writeOk += Math.min(wShare, CAP.master);
        }
      }
      if (masterUp && !promoted) {
        const wl = wShare / CAP.master;
        writeOk += Math.min(wShare, CAP.master);
        nodes[master.id] = { status: wl > 1 ? 'busy' : 'healthy', load: wl, badge: `W ${perSec(wShare)}`, throughput: perSec(wShare) };
        dbLoad = Math.max(dbLoad, wl);
      } else if (!masterUp || promoted) {
        nodes[master.id] = { status: 'down', load: 0, badge: 'down' };
      }
      const readers = liveReps.filter((r) => nodes[r.id].status !== 'promoting');
      const readCap = readers.length * CAP.replica || (masterUp ? CAP.master : 0);
      const rl = readCap ? rShare / readCap : 0;
      readOk += Math.min(rShare, readCap);
      dbLoad = Math.max(dbLoad, rl);
      readers.forEach((r) => {
        nodes[r.id] = { status: rl > 1 ? 'busy' : 'healthy', load: rl, badge: `R ${perSec(rShare / readers.length)}`, throughput: perSec(rShare / readers.length) };
      });
      reps.forEach((r) => {
        if (isDown(r.id)) nodes[r.id] = { status: 'down', load: 0, badge: 'down' };
      });
    });
    sWrite = writes ? writeOk / writes : 1;
    sRead = reads ? readOk / reads : 1;
  }

  // ---- Queue ----
  let backlog = 0;
  if (f.queue) {
    if (sc === 'upload-burst' && fail.scenarioAt !== null) backlog = Math.max(0, BACKLOG_START - ((now - fail.scenarioAt) / 1000) * CAP.worker);
    const qDown = isDown('queue') || isDown('workers');
    nodes.queue = isDown('queue') ? { status: 'down', load: 0, badge: 'down' } : { status: backlog > 0 ? 'busy' : 'healthy', load: backlog / BACKLOG_START, badge: backlog > 0 ? `backlog ${Math.round(backlog).toLocaleString()}` : 'empty' };
    nodes.workers = isDown('workers') ? { status: 'down', load: 0, badge: 'down' } : { status: backlog > 0 ? 'busy' : 'idle', load: backlog > 0 ? 0.9 : 0.1, badge: backlog > 0 ? perSec(CAP.worker) : 'idle' };
    if (qDown && backlog > 0) backlog = BACKLOG_START;
  }

  if (f.cdn) nodes.cdn = isDown('cdn') ? { status: 'down', load: 0, badge: 'down' } : { status: 'healthy', load: 0.2, badge: sc === 'far-users' ? 'edge hit' : undefined };

  // ---- Totals ----
  const dnsOk = !isDown('dns') && nodes.dns.status !== 'down';
  const lbOk = !f.lb || arch.lbs.some((l) => !isDown(l.id) && nodes[l.id].status !== 'down');
  const success = !dnsOk || !lbOk ? 0 : sWeb * (readFrac * sRead + (1 - readFrac) * sWrite);

  const cdnUp = f.cdn && !isDown('cdn');
  const farExtra = sc === 'far-users' || sc === 'dc-down' ? (f.multiDc && !dcDown ? 20 : 140) : 0;
  const apiMs = Math.round(35 + congestion(avgLoad) + (cacheUp ? 6 : 22) + congestion(dbLoad) + farExtra + (uploadInline ? 1800 : 0));
  const staticMs = Math.round(cdnUp ? 30 : 90 + congestion(avgLoad) + (sc === 'far-users' ? 260 : 0));

  const cost = arch.all.reduce((s, n) => s + PRICE[n.kind], 0) * (f.multiDc ? 1 : 1);

  const headline =
    success === 0
      ? 'Total outage: no request can be served.'
      : success < 0.99
      ? `${pct(1 - success)} of requests are failing.`
      : apiMs > 500
      ? 'Everything works, but users are waiting a long time.'
      : loggedOutPct > 0
      ? `Requests are served, but ${Math.round(loggedOutPct)}% of users were logged out.`
      : staticMs > 200
      ? 'Requests are served, but pages load slowly for far-away users.'
      : 'All requests are being served.';

  return { nodes, success, apiMs, staticMs, cost, loggedOutPct, backlog, promoted, writesPaused, headline };
}
