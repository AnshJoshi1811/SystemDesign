import React, { useState, useEffect } from 'react';
import {
  Server,
  Database,
  Globe,
  Layers,
  Zap,
  Activity,
  AlertTriangle,
  CheckCircle2,
  Cpu,
  Clock,
  Play,
  Pause,
  RotateCcw,
  Sparkles,
  ArrowRight,
  TrendingUp,
  Shield,
  MessageSquare,
  Search,
  Sliders,
  ChevronRight,
  Info,
  X,
  RefreshCw,
  Plus,
  Terminal,
  HelpCircle,
  Flame,
  Award,
  SlidersHorizontal,
  Workflow
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface Chapter1ScaleFromZeroProps {
  isDarkMode?: boolean;
}

export type ComponentId =
  | 'dns'
  | 'cdn'
  | 'lb'
  | 'web1'
  | 'web2'
  | 'web3'
  | 'cache'
  | 'masterDb'
  | 'slaveDb'
  | 'mq'
  | 'searchDb'
  | 'geoDns';

export interface ComponentInfo {
  id: ComponentId;
  name: string;
  category: 'Networking' | 'Compute' | 'Storage' | 'Async';
  status: 'healthy' | 'degraded' | 'failed' | 'disabled';
  cpu: number;
  memory: number;
  qps: number;
  latencyMs: number;
  errorRate: number;
  whatIsIt: string;
  whyExist: string;
  whenToUse: string;
  whatIfRemoved: string;
  tradeoffs: string;
}

export interface LogEntry {
  id: string;
  timestamp: string;
  type: 'info' | 'warn' | 'error' | 'success';
  source: string;
  message: string;
}

export const Chapter1ScaleFromZero: React.FC<Chapter1ScaleFromZeroProps> = ({ isDarkMode = false }) => {
  // --- STAGE PROGRESSION ---
  const [stage, setStage] = useState<number>(1);
  const [trafficRps, setTrafficRps] = useState<number>(150); // Traffic slider (RPS)
  const [readRatio, setReadRatio] = useState<number>(85); // 85% reads, 15% writes
  const [selectedComp, setSelectedComp] = useState<ComponentId | null>('web1');
  const [activeFailure, setActiveFailure] = useState<string | null>(null);
  const [isSimulating, setIsSimulating] = useState<boolean>(true);
  const [activeTab, setActiveTab] = useState<'canvas' | 'chaos' | 'logs' | 'quiz'>('canvas');

  // Dynamic component states & custom overrides
  const [manualWebCount, setManualWebCount] = useState<number>(1);
  const [cacheHitRatio, setCacheHitRatio] = useState<number>(0.85);
  const [lbStrategy, setLbStrategy] = useState<'round-robin' | 'least-connections' | 'ip-hash'>('round-robin');
  const [mqBacklog, setMqBacklog] = useState<number>(0);
  const [dbFailoverActive, setDbFailoverActive] = useState<boolean>(false);
  const [quizScore, setQuizScore] = useState<number>(0);
  const [selectedAnswers, setSelectedAnswers] = useState<Record<number, number>>({});

  // Live Terminal Logs
  const [logs, setLogs] = useState<LogEntry[]>([
    { id: '1', timestamp: '00:00:01', type: 'info', source: 'DNS', message: 'Resolved api.app.com -> 192.168.1.10' },
    { id: '2', timestamp: '00:00:02', type: 'success', source: 'Web Node 1', message: 'HTTP 200 GET /user/profile (12ms)' },
  ]);

  // Stage features unlocking
  const hasSeparateDb = stage >= 2;
  const hasReadReplicas = stage >= 2;
  const hasLoadBalancer = stage >= 3;
  const hasMultipleWeb = stage >= 3;
  const hasCache = stage >= 4;
  const hasCdn = stage >= 4;
  const hasStatelessSession = stage >= 5;
  const hasMessageQueue = stage >= 6;
  const hasSearchEngine = stage >= 6;
  const hasGeoDns = stage >= 6;

  // Auto update web count when stage changes
  useEffect(() => {
    if (stage === 1 || stage === 2) setManualWebCount(1);
    else if (stage === 3 || stage === 4) setManualWebCount(2);
    else setManualWebCount(3);
  }, [stage]);

  // Live Simulation Heartbeat & Logs Generator
  useEffect(() => {
    if (!isSimulating) return;

    const interval = setInterval(() => {
      const now = new Date().toLocaleTimeString('en-US', { hour12: false });
      const types: ('info' | 'success' | 'warn' | 'error')[] = ['info', 'success'];
      let msg = '';
      let source = 'System';
      let type: 'info' | 'warn' | 'error' | 'success' = 'info';

      if (activeFailure === 'server_crash') {
        type = 'error';
        source = 'Web Node 1';
        msg = 'Connection refused: Web Server Node 1 crashed! Returning 502 Bad Gateway';
      } else if (activeFailure === 'db_crash') {
        type = 'error';
        source = 'Primary DB';
        msg = 'FATAL: PostgreSQL connection timeout. Lock table full!';
      } else if (activeFailure === 'cache_stampede') {
        type = 'warn';
        source = 'Redis';
        msg = 'Cache Miss Stampede! 5,000 queries bypassing cache down to Master DB';
      } else {
        const rand = Math.random();
        if (rand > 0.6 && hasCache) {
          type = 'success';
          source = 'Redis';
          msg = `Cache HIT for key 'user:10294' (latency 0.8ms)`;
        } else if (rand > 0.3) {
          type = 'info';
          source = hasLoadBalancer ? 'Nginx LB' : 'Web Node 1';
          msg = `Routed HTTP GET /feed (RPS: ${trafficRps})`;
        } else {
          type = 'info';
          source = 'Primary DB';
          msg = `SQL SELECT * FROM users WHERE id = 849 (Read Ratio: ${readRatio}%)`;
        }
      }

      setLogs((prev) => [
        { id: Math.random().toString(), timestamp: now, type, source, message: msg },
        ...prev.slice(0, 25),
      ]);
    }, 1500);

    return () => clearInterval(interval);
  }, [isSimulating, activeFailure, stage, trafficRps, hasCache, hasLoadBalancer, readRatio]);

  // --- CALCULATE LIVE SYSTEM METRICS ---
  const activeWebServers = Math.max(1, manualWebCount);
  const capacityPerWeb = 400; // max RPS per web server
  const effectiveCacheHit = hasCache ? cacheHitRatio : 0;
  
  // Database RPS calculation
  const rawDbRps = hasCache ? trafficRps * (1 - effectiveCacheHit) : trafficRps;
  const databaseRps = activeFailure === 'cache_stampede' ? trafficRps : rawDbRps;
  const webCapacity = activeWebServers * capacityPerWeb * (hasCache ? 2.5 : 1);

  // CPU Load calculation
  let cpuLoad = Math.min(100, Math.round((trafficRps / webCapacity) * 100));
  if (activeFailure === 'traffic_spike') cpuLoad = 100;
  
  const isOverloaded = cpuLoad > 85 || activeFailure !== null;

  // Latency calculation
  let baseLatency = 12; // ms
  if (!hasCdn) baseLatency += 35;
  if (!hasCache && trafficRps > 300) baseLatency += 75;
  if (activeFailure === 'cache_stampede') baseLatency += 280;
  if (isOverloaded) baseLatency += 320;

  const failedRequestsPct = activeFailure === 'server_crash' ? 50 
                          : activeFailure === 'db_crash' ? 95
                          : activeFailure === 'traffic_spike' ? (trafficRps > webCapacity ? 35 : 10)
                          : isOverloaded ? Math.min(70, Math.round((cpuLoad - 80) * 2)) : 0.01;

  const availabilityPct = Math.max(5, Number((100 - failedRequestsPct).toFixed(2)));
  const monthlyCost = 45 + (stage * 110) + (manualWebCount * 30) + (hasCdn ? 120 : 0) + (hasCache ? 90 : 0) + (hasMessageQueue ? 180 : 0);

  // --- MENTOR MESSAGES BY STAGE ---
  const mentorAdvice = [
    {
      stage: 1,
      title: 'Stage 1: Single Server Monolith (0 to 1,000 Users)',
      problem: 'Everything runs on 1 machine (Web App + Database). When traffic increases beyond 400 RPS, CPU maxes out and the database locks.',
      solution: 'Split the Web Server and Database onto dedicated machines, then add Read Replicas.'
    },
    {
      stage: 2,
      title: 'Stage 2: Separate Web & Database + Read Replicas (1k to 10k Users)',
      problem: 'Database reads account for 85%+ of traffic. A single database master cannot handle heavy read queries while processing writes.',
      solution: 'Implement Master-Slave Database Replication. Master handles writes, Read Slaves handle queries.'
    },
    {
      stage: 3,
      title: 'Stage 3: Load Balancer & Horizontal Scaling (10k to 100k Users)',
      problem: 'A single web server is a Single Point of Failure (SPOF). If it crashes, the entire site goes down.',
      solution: 'Introduce a Load Balancer (Nginx/ALB) and spin up multiple web server instances.'
    },
    {
      stage: 4,
      title: 'Stage 4: In-Memory Cache & CDN (100k to 500k Users)',
      problem: 'Hitting disk storage for static assets and repetitive profile queries creates slow latencies.',
      solution: 'Add Redis/Memcached for hot query results and Cloudflare CDN for static media.'
    },
    {
      stage: 5,
      title: 'Stage 5: Stateless Web Tier & Externalized Sessions (500k to 1M Users)',
      problem: 'Web servers store user login sessions in local memory. If a user request hits Server 2, they get logged out!',
      solution: 'Move session data out of web servers into a shared Redis cluster.'
    },
    {
      stage: 6,
      title: 'Stage 6: Message Queues, Search DB & Multi-Region (1M+ Users)',
      problem: 'Synchronous heavy tasks (email sending, image processing) block user HTTP request loops.',
      solution: 'Introduce Kafka Message Queues for async processing, Elasticsearch for search, and GeoDNS for global routing.'
    }
  ];

  const currentMentor = mentorAdvice[stage - 1];

  // Component details database
  const componentDetails: Record<ComponentId, ComponentInfo> = {
    dns: {
      id: 'dns',
      name: 'DNS (Domain Name System)',
      category: 'Networking',
      status: 'healthy',
      cpu: 4,
      memory: 12,
      qps: trafficRps,
      latencyMs: 2,
      errorRate: 0,
      whatIsIt: 'Translates human domain names (api.example.com) into machine IP addresses.',
      whyExist: 'Without DNS, users would have to type raw IPv4/IPv6 addresses into browser bars.',
      whenToUse: 'Always required for any public web application.',
      whatIfRemoved: 'Users cannot locate your servers by domain name.',
      tradeoffs: 'DNS caching propagates updates slowly when changing IP addresses (TTL delays).'
    },
    geoDns: {
      id: 'geoDns',
      name: 'GeoDNS / Anycast Routing',
      category: 'Networking',
      status: 'healthy',
      cpu: 8,
      memory: 20,
      qps: trafficRps,
      latencyMs: 5,
      errorRate: 0,
      whatIsIt: 'Routes users to the geographically closest data center based on IP origin.',
      whyExist: 'Reduces transatlantic latency by keeping traffic local to the user region.',
      whenToUse: 'When serving millions of global users across North America, Europe, and Asia.',
      whatIfRemoved: 'Global users suffer 150ms+ cross-continental fiber network delays.',
      tradeoffs: 'Increased multi-region database replication complexity and costs.'
    },
    cdn: {
      id: 'cdn',
      name: 'CDN (Content Delivery Network)',
      category: 'Networking',
      status: hasCdn ? 'healthy' : 'disabled',
      cpu: 12,
      memory: 28,
      qps: hasCdn ? Math.round(trafficRps * 0.6) : 0,
      latencyMs: 8,
      errorRate: 0,
      whatIsIt: 'Edge server network (e.g. Cloudflare) that caches static images, JS, CSS, and videos.',
      whyExist: 'Delivers assets directly from edge locations closest to the user, bypassing your origin servers.',
      whenToUse: 'When static assets consume heavy origin bandwidth or increase page load times.',
      whatIfRemoved: 'Origin web servers become flooded with static media downloads.',
      tradeoffs: 'Requires proper cache invalidation strategies (Cache-Control headers).'
    },
    lb: {
      id: 'lb',
      name: 'Load Balancer (Nginx / AWS ALB)',
      category: 'Networking',
      status: hasLoadBalancer ? 'healthy' : 'disabled',
      cpu: Math.min(85, Math.round(trafficRps / 120)),
      memory: 38,
      qps: hasLoadBalancer ? trafficRps : 0,
      latencyMs: 3,
      errorRate: 0,
      whatIsIt: 'Distributes incoming HTTP/HTTPS traffic across healthy web server pools.',
      whyExist: 'Prevents single server overload and automatically redirects traffic away from crashed nodes.',
      whenToUse: 'When scaling horizontally beyond 1 web server instance.',
      whatIfRemoved: 'Traffic hits a single IP address, creating a severe bottleneck and SPOF.',
      tradeoffs: 'Requires SSL termination handling and health check monitoring configuration.'
    },
    web1: {
      id: 'web1',
      name: 'Web Server Node 1',
      category: 'Compute',
      status: activeFailure === 'server_crash' ? 'failed' : isOverloaded ? 'degraded' : 'healthy',
      cpu: activeFailure === 'server_crash' ? 0 : cpuLoad,
      memory: Math.min(95, Math.round(35 + cpuLoad * 0.5)),
      qps: Math.round(trafficRps / activeWebServers),
      latencyMs: baseLatency,
      errorRate: failedRequestsPct,
      whatIsIt: 'Executes application business logic (Node.js/Go/Python) and renders response payloads.',
      whyExist: 'Handles user HTTP requests, performs validation, and communicates with backend stores.',
      whenToUse: 'Always required for dynamic backend processing.',
      whatIfRemoved: 'No application code can execute.',
      tradeoffs: 'Stateful local memory usage prevents seamless horizontal autoscaling.'
    },
    web2: {
      id: 'web2',
      name: 'Web Server Node 2',
      category: 'Compute',
      status: hasMultipleWeb && manualWebCount >= 2 ? (isOverloaded ? 'degraded' : 'healthy') : 'disabled',
      cpu: hasMultipleWeb && manualWebCount >= 2 ? cpuLoad : 0,
      memory: hasMultipleWeb && manualWebCount >= 2 ? 42 : 0,
      qps: hasMultipleWeb && manualWebCount >= 2 ? Math.round(trafficRps / activeWebServers) : 0,
      latencyMs: baseLatency,
      errorRate: failedRequestsPct,
      whatIsIt: 'Secondary horizontally scaled application server instance.',
      whyExist: 'Provides active-active redundancy and increases total RPS capacity.',
      whenToUse: 'When a single web server CPU/RAM is saturated by concurrent requests.',
      whatIfRemoved: 'Capacity drops by 33%, increasing load on remaining servers.',
      tradeoffs: 'Increases cloud computing infrastructure cost.'
    },
    web3: {
      id: 'web3',
      name: 'Web Server Node 3',
      category: 'Compute',
      status: hasMultipleWeb && manualWebCount >= 3 ? (isOverloaded ? 'degraded' : 'healthy') : 'disabled',
      cpu: hasMultipleWeb && manualWebCount >= 3 ? cpuLoad : 0,
      memory: hasMultipleWeb && manualWebCount >= 3 ? 42 : 0,
      qps: hasMultipleWeb && manualWebCount >= 3 ? Math.round(trafficRps / activeWebServers) : 0,
      latencyMs: baseLatency,
      errorRate: failedRequestsPct,
      whatIsIt: 'Tertiary horizontally scaled application server instance.',
      whyExist: 'Enables high availability (HA) and dynamic autoscaling during traffic spikes.',
      whenToUse: 'When handling 10,000+ concurrent active user sessions.',
      whatIfRemoved: 'Reduces horizontal queue depth headroom during traffic bursts.',
      tradeoffs: 'Requires automated deployment and health check monitoring.'
    },
    cache: {
      id: 'cache',
      name: 'In-Memory Cache (Redis Cluster)',
      category: 'Storage',
      status: activeFailure === 'cache_stampede' ? 'degraded' : hasCache ? 'healthy' : 'disabled',
      cpu: hasCache ? (activeFailure === 'cache_stampede' ? 95 : 20) : 0,
      memory: hasCache ? 60 : 0,
      qps: hasCache ? Math.round(trafficRps * effectiveCacheHit) : 0,
      latencyMs: 1,
      errorRate: 0,
      whatIsIt: 'Ultra-fast RAM storage store that saves frequent database query results and user sessions.',
      whyExist: 'Sub-millisecond RAM access is 100x faster than reading from relational database disk drives.',
      whenToUse: 'When read requests dominate write requests or DB queries are expensive.',
      whatIfRemoved: 'Database gets overwhelmed by repetitive read queries (Cache Miss Stampede).',
      tradeoffs: 'Cache invalidation is complex; risk of serving stale data if TTL is misconfigured.'
    },
    masterDb: {
      id: 'masterDb',
      name: 'Primary Database Master (PostgreSQL)',
      category: 'Storage',
      status: activeFailure === 'db_crash' ? 'failed' : dbFailoverActive ? 'degraded' : 'healthy',
      cpu: activeFailure === 'db_crash' ? 0 : Math.min(98, Math.round(databaseRps * 0.7)),
      memory: 68,
      qps: Math.round(databaseRps * (hasReadReplicas ? (100 - readRatio) / 100 : 1)),
      latencyMs: 12,
      errorRate: activeFailure === 'db_crash' ? 100 : 0,
      whatIsIt: 'Authoritative primary relational database handling all INSERT, UPDATE, and DELETE writes.',
      whyExist: 'Guarantees ACID transactions and persistent data integrity on durable storage.',
      whenToUse: 'Always required for core persistent data storage.',
      whatIfRemoved: 'Application cannot perform any write transactions or store state.',
      tradeoffs: 'Single master node write throughput is limited by disk I/O and CPU.'
    },
    slaveDb: {
      id: 'slaveDb',
      name: 'Read Replica Slaves (PostgreSQL)',
      category: 'Storage',
      status: hasReadReplicas ? 'healthy' : 'disabled',
      cpu: hasReadReplicas ? Math.min(85, Math.round(databaseRps * 0.35)) : 0,
      memory: hasReadReplicas ? 55 : 0,
      qps: hasReadReplicas ? Math.round(databaseRps * (readRatio / 100)) : 0,
      latencyMs: 9,
      errorRate: 0,
      whatIsIt: 'Read-only database copies asynchronously synchronized with the Master DB.',
      whyExist: 'Offloads read SELECT queries from the Master DB, scaling read throughput linearly.',
      whenToUse: 'When read traffic outweighs write traffic (e.g. 85% reads / 15% writes).',
      whatIfRemoved: 'Master DB handles 100% of queries, leading to disk lock bottlenecks.',
      tradeoffs: 'Replication lag means read replicas may temporarily serve slightly stale data.'
    },
    mq: {
      id: 'mq',
      name: 'Message Queue (Apache Kafka / RabbitMQ)',
      category: 'Async',
      status: mqBacklog > 200 ? 'degraded' : hasMessageQueue ? 'healthy' : 'disabled',
      cpu: hasMessageQueue ? 18 : 0,
      memory: hasMessageQueue ? 38 : 0,
      qps: hasMessageQueue ? Math.round(trafficRps * 0.12) : 0,
      latencyMs: 2,
      errorRate: 0,
      whatIsIt: 'Asynchronous event buffer that decouples producer web tasks from consumer worker processes.',
      whyExist: 'Allows web servers to instantly acknowledge HTTP requests without waiting for slow tasks.',
      whenToUse: 'For heavy background jobs like email dispatching, video encoding, or payment processing.',
      whatIfRemoved: 'User HTTP requests hang while waiting for synchronous background processing.',
      tradeoffs: 'Adds architectural complexity and requires consumer failure retry queues.'
    },
    searchDb: {
      id: 'searchDb',
      name: 'Search Engine (Elasticsearch / Algolia)',
      category: 'Storage',
      status: hasSearchEngine ? 'healthy' : 'disabled',
      cpu: hasSearchEngine ? 28 : 0,
      memory: hasSearchEngine ? 48 : 0,
      qps: hasSearchEngine ? Math.round(trafficRps * 0.15) : 0,
      latencyMs: 14,
      errorRate: 0,
      whatIsIt: 'Inverted-index search database optimized for full-text fuzzy queries and filtering.',
      whyExist: 'Relational DB `LIKE %query%` SQL scans are extremely slow and lock database tables.',
      whenToUse: 'When providing instant search auto-complete or multi-attribute catalog filtering.',
      whatIfRemoved: 'SQL database crashes when users perform complex text searches.',
      tradeoffs: 'Data must be continuously synced from the primary database master.'
    }
  };

  const currentInfo = selectedComp ? componentDetails[selectedComp] : componentDetails['web1'];

  // Stage Quizzes
  const quizzes = [
    {
      stage: 1,
      question: "At 500 RPS, your single monolith server CPU reaches 98% and database queries freeze. What is the correct first architectural step?",
      options: [
        "A. Rewrite application in C++",
        "B. Separate Web Server and Database onto dedicated machines",
        "C. Increase DNS TTL to 1 day",
        "D. Add more CSS minification"
      ],
      correct: 1,
      explanation: "Separating compute (Web App) from storage (Database) allows each to scale independently without competing for memory and CPU."
    },
    {
      stage: 2,
      question: "Your traffic is 90% read SELECT queries and 10% write INSERT queries. How should you scale the database tier?",
      options: [
        "A. Put everything in local localStorage",
        "B. Add Read Replica Slaves & route reads away from Master DB",
        "C. Disable database indexes",
        "D. Run 2 Master DBs without replication"
      ],
      correct: 1,
      explanation: "Master-Slave replication allows Master DB to focus purely on ACID writes while multiple Read Slaves handle 90% of SELECT queries!"
    },
    {
      stage: 3,
      question: "You added Web Server Node 2 and Node 3. How do you distribute incoming traffic across them automatically?",
      options: [
        "A. Tell users to type IP addresses directly",
        "B. Place a Load Balancer (Nginx/ALB) in front of the web pool",
        "C. Use JavaScript window.location redirect",
        "D. Put Web Node 2 inside Web Node 1"
      ],
      correct: 1,
      explanation: "A Load Balancer distributes requests evenly using algorithms like Round-Robin or Least Connections and monitors node health."
    },
    {
      stage: 4,
      question: "Your primary database is getting hit 10,000 times per second for identical user profile data. What component cures this?",
      options: [
        "A. An In-Memory RAM Cache (Redis/Memcached)",
        "B. A bigger hard drive",
        "C. More HTML comments",
        "D. Disabling HTTPS"
      ],
      correct: 0,
      explanation: "An In-Memory Cache (Redis) holds hot key-value pairs in RAM, returning sub-millisecond responses without touching the disk DB."
    }
  ];

  const currentQuiz = quizzes[(stage - 1) % quizzes.length];

  return (
    <div className="space-y-6">
      
      {/* CHAPTER TOP HERO BANNER */}
      <div className={`p-6 sm:p-8 rounded-3xl border shadow-xl relative overflow-hidden transition-all ${
        isDarkMode
          ? 'bg-[#161616] border-white/[0.08] text-white'
          : 'bg-white border-slate-200 text-slate-900'
      }`}>
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2 max-w-3xl">
            <div className="flex items-center space-x-2">
              <span className="px-3 py-1 bg-indigo-600 text-white font-mono text-xs font-black rounded-full uppercase tracking-wider">
                CHAPTER 1
              </span>
              <span className={`text-xs font-mono font-semibold ${isDarkMode ? 'text-indigo-400' : 'text-indigo-700'}`}>
                System Design Foundations
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold tracking-tight">
              Scale From Zero To Millions Of Users
            </h1>
            <p className={`text-xs sm:text-sm leading-relaxed ${isDarkMode ? 'text-slate-300' : 'text-slate-600'}`}>
              An interactive engineering sandbox where you discover why architectural components exist by experiencing real bottlenecks, triggering failures, and scaling step-by-step from 1 to 1,000,000+ users.
            </p>
          </div>

          {/* Stage Quick Selection Pills */}
          <div className={`flex items-center space-x-1 shrink-0 p-2 rounded-2xl border ${
            isDarkMode ? 'bg-slate-950/50 backdrop-blur-md border-indigo-500/20' : 'bg-slate-100 border-slate-300'
          }`}>
            {[1, 2, 3, 4, 5, 6].map((stg) => (
              <button
                key={stg}
                onClick={() => {
                  setStage(stg);
                  setActiveFailure(null);
                }}
                className={`w-9 h-9 rounded-xl font-mono text-xs font-bold transition-all flex items-center justify-center ${
                  stage === stg
                    ? 'bg-indigo-600 text-white shadow-lg scale-105'
                    : stage > stg
                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                    : isDarkMode ? 'text-slate-500 hover:text-white' : 'text-slate-400 hover:text-slate-800'
                }`}
              >
                {stg}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* STAGE DIAGNOSIS & INTERACTIVE PARAMETERS HEADER */}
      <div className={`p-5 rounded-3xl border space-y-4 ${
        isDarkMode ? 'bg-[#1c1c1e]/90 border-slate-800' : 'bg-white border-slate-200 shadow-xs'
      }`}>
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-indigo-500/10 text-indigo-500 rounded-2xl border border-indigo-500/20">
              <Workflow className="w-5 h-5" />
            </div>
            <div>
              <h2 className={`text-base font-bold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                {currentMentor.title}
              </h2>
              <p className="text-xs text-slate-500 font-mono">
                Current Bottleneck Diagnosis &amp; Evolution
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2 shrink-0">
            <button
              disabled={stage === 1}
              onClick={() => {
                setStage(prev => Math.max(1, prev - 1));
                setActiveFailure(null);
              }}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold font-mono border transition-all ${
                stage === 1 ? 'opacity-40 cursor-not-allowed' : 'hover:bg-indigo-500/10'
              }`}
            >
              ← Prev Stage
            </button>
            <button
              disabled={stage === 6}
              onClick={() => {
                setStage(prev => Math.min(6, prev + 1));
                setActiveFailure(null);
              }}
              className={`px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold font-mono transition-all shadow-md ${
                stage === 6 ? 'opacity-40 cursor-not-allowed' : ''
              }`}
            >
              Next Stage →
            </button>
          </div>
        </div>

        <p className={`text-xs leading-relaxed ${isDarkMode ? 'text-slate-300' : 'text-slate-600'}`}>
          <strong>Challenge:</strong> {currentMentor.problem}
        </p>

        {/* Live Interactive Sliders & Controls Bar */}
        <div className={`p-4 rounded-2xl border grid grid-cols-1 md:grid-cols-3 gap-4 ${
          isDarkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'
        }`}>
          {/* Traffic Intensity Slider */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="text-slate-400 font-bold flex items-center gap-1.5">
                <Sliders className="w-3.5 h-3.5 text-amber-500" />
                Incoming Traffic:
              </span>
              <span className="font-bold text-indigo-400">{trafficRps.toLocaleString()} RPS</span>
            </div>
            <input
              type="range"
              min={50}
              max={stage >= 4 ? 25000 : 2000}
              step={stage >= 4 ? 500 : 50}
              value={trafficRps}
              onChange={(e) => setTrafficRps(Number(e.target.value))}
              className="w-full accent-indigo-500 cursor-pointer"
            />
          </div>

          {/* Read vs Write Query Mix */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="text-slate-400 font-bold flex items-center gap-1.5">
                <SlidersHorizontal className="w-3.5 h-3.5 text-blue-400" />
                Read / Write Mix:
              </span>
              <span className="font-bold text-emerald-400">{readRatio}% Reads / {100 - readRatio}% Writes</span>
            </div>
            <input
              type="range"
              min={50}
              max={98}
              value={readRatio}
              onChange={(e) => setReadRatio(Number(e.target.value))}
              className="w-full accent-emerald-500 cursor-pointer"
            />
          </div>

          {/* Web Instance Scaling Control */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="text-slate-400 font-bold flex items-center gap-1.5">
                <Server className="w-3.5 h-3.5 text-purple-400" />
                Web Tier Instances:
              </span>
              <span className="font-bold text-purple-400">{manualWebCount} Nodes</span>
            </div>
            <div className="flex items-center space-x-2">
              <button
                disabled={manualWebCount <= 1}
                onClick={() => setManualWebCount(prev => Math.max(1, prev - 1))}
                className="px-3 py-1 bg-slate-800 text-slate-200 rounded-lg text-xs font-bold disabled:opacity-40"
              >
                - 1 Node
              </button>
              <button
                disabled={manualWebCount >= 3 || !hasMultipleWeb}
                onClick={() => setManualWebCount(prev => Math.min(3, prev + 1))}
                className="px-3 py-1 bg-indigo-600 text-white rounded-lg text-xs font-bold disabled:opacity-40"
              >
                + 1 Node
              </button>
              {!hasMultipleWeb && (
                <span className="text-[10px] text-slate-500 font-mono">Unlock @ Stage 3</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* WORKSPACE TAB SWITCHER */}
      <div className="flex items-center space-x-2 border-b border-slate-200 dark:border-slate-800 pb-2">
        <button
          onClick={() => setActiveTab('canvas')}
          className={`px-4 py-2 rounded-xl font-mono text-xs font-bold flex items-center space-x-2 transition-all ${
            activeTab === 'canvas'
              ? 'bg-indigo-600 text-white shadow-md'
              : isDarkMode ? 'text-slate-400 hover:text-white hover:bg-slate-800' : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Layers className="w-4 h-4" />
          <span>Interactive Canvas</span>
        </button>

        <button
          onClick={() => setActiveTab('chaos')}
          className={`px-4 py-2 rounded-xl font-mono text-xs font-bold flex items-center space-x-2 transition-all ${
            activeTab === 'chaos'
              ? 'bg-rose-600 text-white shadow-md'
              : isDarkMode ? 'text-slate-400 hover:text-white hover:bg-slate-800' : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Flame className="w-4 h-4 text-rose-400" />
          <span>Chaos Lab &amp; Failures</span>
          {activeFailure && <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping"></span>}
        </button>

        <button
          onClick={() => setActiveTab('logs')}
          className={`px-4 py-2 rounded-xl font-mono text-xs font-bold flex items-center space-x-2 transition-all ${
            activeTab === 'logs'
              ? 'bg-emerald-600 text-white shadow-md'
              : isDarkMode ? 'text-slate-400 hover:text-white hover:bg-slate-800' : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Terminal className="w-4 h-4" />
          <span>Live Terminal Logs</span>
        </button>

        <button
          onClick={() => setActiveTab('quiz')}
          className={`px-4 py-2 rounded-xl font-mono text-xs font-bold flex items-center space-x-2 transition-all ${
            activeTab === 'quiz'
              ? 'bg-amber-600 text-white shadow-md'
              : isDarkMode ? 'text-slate-400 hover:text-white hover:bg-slate-800' : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Award className="w-4 h-4" />
          <span>Stage Architect Quiz</span>
        </button>
      </div>

      {/* TAB 1: MAIN CANVAS & INSPECTOR */}
      {activeTab === 'canvas' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* LEFT 2 COLUMNS: VISUAL NODE GRAPH */}
          <div className={`lg:col-span-2 p-6 rounded-3xl border relative min-h-[520px] flex flex-col justify-between ${
            isDarkMode ? 'bg-[#1c1c1e] border-slate-800' : 'bg-white border-slate-200 shadow-sm'
          }`}>
            <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center space-x-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
                <h3 className={`text-sm font-bold font-mono ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                  LIVE ARCHITECTURE CANVAS (STAGE {stage})
                </h3>
              </div>

              {/* Simulation State Indicator */}
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setIsSimulating(!isSimulating)}
                  className={`px-3 py-1 rounded-lg text-xs font-mono font-bold flex items-center space-x-1.5 transition-all ${
                    isSimulating ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30' : 'bg-slate-800 text-slate-400'
                  }`}
                >
                  {isSimulating ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                  <span>{isSimulating ? 'Simulating Traffic' : 'Paused'}</span>
                </button>
              </div>
            </div>

            {/* NODE GRAPH GRID */}
            <div className="py-8 grid grid-cols-1 md:grid-cols-4 gap-6 items-center justify-center my-auto relative">
              
              {/* COLUMN 1: CLIENT & ROUTING */}
              <div className="space-y-4">
                <div
                  onClick={() => setSelectedComp('dns')}
                  className={`p-3.5 rounded-2xl border transition-all cursor-pointer ${
                    selectedComp === 'dns' ? 'ring-2 ring-indigo-500 scale-105' : ''
                  } ${isDarkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'}`}
                >
                  <div className="flex items-center space-x-2">
                    <Globe className="w-4 h-4 text-blue-500" />
                    <span className="text-xs font-bold font-mono">DNS Router</span>
                  </div>
                  <div className="text-[10px] text-slate-500 font-mono mt-1">Route: api.app.com</div>
                </div>

                {hasGeoDns && (
                  <div
                    onClick={() => setSelectedComp('geoDns')}
                    className={`p-3.5 rounded-2xl border transition-all cursor-pointer ${
                      selectedComp === 'geoDns' ? 'ring-2 ring-indigo-500 scale-105' : ''
                    } ${isDarkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'}`}
                  >
                    <div className="flex items-center space-x-2">
                      <Globe className="w-4 h-4 text-indigo-400" />
                      <span className="text-xs font-bold font-mono">GeoDNS Anycast</span>
                    </div>
                    <div className="text-[10px] text-emerald-400 font-mono mt-1">Multi-Region Active</div>
                  </div>
                )}

                {hasCdn && (
                  <div
                    onClick={() => setSelectedComp('cdn')}
                    className={`p-3.5 rounded-2xl border transition-all cursor-pointer ${
                      selectedComp === 'cdn' ? 'ring-2 ring-indigo-500 scale-105' : ''
                    } ${isDarkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'}`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <Zap className="w-4 h-4 text-amber-500" />
                        <span className="text-xs font-bold font-mono">CDN Edge</span>
                      </div>
                      <span className="text-[9px] bg-amber-500/10 text-amber-500 px-1.5 py-0.5 rounded font-mono">Static</span>
                    </div>
                  </div>
                )}
              </div>

              {/* COLUMN 2: LOAD BALANCER & TRAFFIC DISTRIBUTION */}
              <div className="space-y-4">
                {hasLoadBalancer ? (
                  <div
                    onClick={() => setSelectedComp('lb')}
                    className={`p-4 rounded-2xl border transition-all cursor-pointer text-center space-y-2 ${
                      selectedComp === 'lb' ? 'ring-2 ring-indigo-500 scale-105' : ''
                    } ${isDarkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'}`}
                  >
                    <div className="p-2 bg-indigo-500/10 text-indigo-500 rounded-xl inline-block">
                      <Layers className="w-6 h-6" />
                    </div>
                    <div className="text-xs font-bold font-mono">Load Balancer</div>
                    <div className="text-[10px] text-emerald-400 font-mono uppercase">{lbStrategy}</div>
                  </div>
                ) : (
                  <div className="p-4 rounded-2xl border border-dashed border-slate-700 text-center text-xs text-slate-500 font-mono">
                    Direct IP (No LB)
                  </div>
                )}
              </div>

              {/* COLUMN 3: WEB COMPUTE TIER */}
              <div className="space-y-3">
                <div
                  onClick={() => setSelectedComp('web1')}
                  className={`p-3.5 rounded-2xl border transition-all cursor-pointer ${
                    activeFailure === 'server_crash' ? 'bg-rose-950/60 border-rose-500/80 text-rose-300 animate-pulse' :
                    selectedComp === 'web1' ? 'ring-2 ring-indigo-500 scale-105' : ''
                  } ${isDarkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'}`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <Server className="w-4 h-4 text-indigo-500" />
                      <span className="text-xs font-bold font-mono">Web Node 1</span>
                    </div>
                    <span className={`text-[9px] px-1.5 py-0.5 rounded font-mono font-bold ${
                      activeFailure === 'server_crash' ? 'bg-rose-500 text-white' : 'bg-emerald-500/10 text-emerald-400'
                    }`}>
                      {activeFailure === 'server_crash' ? 'CRASHED' : `${cpuLoad}% CPU`}
                    </span>
                  </div>
                </div>

                {hasMultipleWeb && manualWebCount >= 2 && (
                  <div
                    onClick={() => setSelectedComp('web2')}
                    className={`p-3.5 rounded-2xl border transition-all cursor-pointer ${
                      selectedComp === 'web2' ? 'ring-2 ring-indigo-500 scale-105' : ''
                    } ${isDarkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'}`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <Server className="w-4 h-4 text-indigo-500" />
                        <span className="text-xs font-bold font-mono">Web Node 2</span>
                      </div>
                      <span className="text-[9px] bg-emerald-500/10 text-emerald-400 px-1.5 py-0.5 rounded font-mono font-bold">
                        {cpuLoad}% CPU
                      </span>
                    </div>
                  </div>
                )}

                {hasMultipleWeb && manualWebCount >= 3 && (
                  <div
                    onClick={() => setSelectedComp('web3')}
                    className={`p-3.5 rounded-2xl border transition-all cursor-pointer ${
                      selectedComp === 'web3' ? 'ring-2 ring-indigo-500 scale-105' : ''
                    } ${isDarkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'}`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <Server className="w-4 h-4 text-indigo-500" />
                        <span className="text-xs font-bold font-mono">Web Node 3</span>
                      </div>
                      <span className="text-[9px] bg-emerald-500/10 text-emerald-400 px-1.5 py-0.5 rounded font-mono font-bold">
                        {cpuLoad}% CPU
                      </span>
                    </div>
                  </div>
                )}

                {hasMessageQueue && (
                  <div
                    onClick={() => setSelectedComp('mq')}
                    className={`p-3.5 rounded-2xl border transition-all cursor-pointer ${
                      selectedComp === 'mq' ? 'ring-2 ring-indigo-500 scale-105' : ''
                    } ${isDarkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'}`}
                  >
                    <div className="flex items-center space-x-2">
                      <MessageSquare className="w-4 h-4 text-purple-400" />
                      <span className="text-xs font-bold font-mono">Kafka Queue</span>
                    </div>
                  </div>
                )}
              </div>

              {/* COLUMN 4: STORAGE & CACHE TIER */}
              <div className="space-y-3">
                {hasCache && (
                  <div
                    onClick={() => setSelectedComp('cache')}
                    className={`p-3.5 rounded-2xl border transition-all cursor-pointer ${
                      activeFailure === 'cache_stampede' ? 'bg-amber-950/60 border-amber-500 animate-pulse' :
                      selectedComp === 'cache' ? 'ring-2 ring-indigo-500 scale-105' : ''
                    } ${isDarkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'}`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <Cpu className="w-4 h-4 text-amber-500" />
                        <span className="text-xs font-bold font-mono">Redis Cache</span>
                      </div>
                      <span className="text-[9px] bg-amber-500/10 text-amber-500 px-1.5 py-0.5 rounded font-mono font-bold">
                        {Math.round(cacheHitRatio * 100)}% Hit
                      </span>
                    </div>
                  </div>
                )}

                <div
                  onClick={() => setSelectedComp('masterDb')}
                  className={`p-3.5 rounded-2xl border transition-all cursor-pointer ${
                    activeFailure === 'db_crash' ? 'bg-rose-950/60 border-rose-500/80 text-rose-300 animate-pulse' :
                    selectedComp === 'masterDb' ? 'ring-2 ring-indigo-500 scale-105' : ''
                  } ${isDarkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'}`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <Database className="w-4 h-4 text-blue-500" />
                      <span className="text-xs font-bold font-mono">Primary DB Master</span>
                    </div>
                    <span className={`text-[9px] px-1.5 py-0.5 rounded font-mono font-bold ${
                      activeFailure === 'db_crash' ? 'bg-rose-500 text-white' : 'bg-blue-500/10 text-blue-400'
                    }`}>
                      {activeFailure === 'db_crash' ? 'CRASHED' : 'WRITES'}
                    </span>
                  </div>
                </div>

                {hasReadReplicas && (
                  <div
                    onClick={() => setSelectedComp('slaveDb')}
                    className={`p-3.5 rounded-2xl border transition-all cursor-pointer ${
                      selectedComp === 'slaveDb' ? 'ring-2 ring-indigo-500 scale-105' : ''
                    } ${isDarkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'}`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <Database className="w-4 h-4 text-emerald-500" />
                        <span className="text-xs font-bold font-mono">Read Replicas</span>
                      </div>
                      <span className="text-[9px] bg-emerald-500/10 text-emerald-400 px-1.5 py-0.5 rounded font-mono font-bold">
                        READS
                      </span>
                    </div>
                  </div>
                )}

                {hasSearchEngine && (
                  <div
                    onClick={() => setSelectedComp('searchDb')}
                    className={`p-3.5 rounded-2xl border transition-all cursor-pointer ${
                      selectedComp === 'searchDb' ? 'ring-2 ring-indigo-500 scale-105' : ''
                    } ${isDarkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'}`}
                  >
                    <div className="flex items-center space-x-2">
                      <Search className="w-4 h-4 text-purple-400" />
                      <span className="text-xs font-bold font-mono">Elasticsearch</span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* LIVE SYSTEM METRICS BOARD */}
            <div className="pt-4 border-t border-slate-200 dark:border-slate-800 grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className={`p-3 rounded-xl border ${isDarkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
                <span className="text-[10px] text-slate-400 uppercase font-mono font-bold block">Total Throughput</span>
                <p className="text-sm font-bold font-mono text-indigo-400">{trafficRps.toLocaleString()} RPS</p>
              </div>
              <div className={`p-3 rounded-xl border ${isDarkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
                <span className="text-[10px] text-slate-400 uppercase font-mono font-bold block">Avg Latency</span>
                <p className={`text-sm font-bold font-mono ${baseLatency > 100 ? 'text-rose-400' : 'text-emerald-400'}`}>
                  {baseLatency} ms
                </p>
              </div>
              <div className={`p-3 rounded-xl border ${isDarkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
                <span className="text-[10px] text-slate-400 uppercase font-mono font-bold block">Availability SLA</span>
                <p className={`text-sm font-bold font-mono ${availabilityPct < 90 ? 'text-rose-400' : 'text-emerald-400'}`}>
                  {availabilityPct}%
                </p>
              </div>
              <div className={`p-3 rounded-xl border ${isDarkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
                <span className="text-[10px] text-slate-400 uppercase font-mono font-bold block">Est. Cloud Bill</span>
                <p className="text-sm font-bold font-mono text-amber-400">${monthlyCost} / mo</p>
              </div>
            </div>
          </div>

          {/* RIGHT 1 COLUMN: COMPONENT INSPECTOR & ACTIONS */}
          <div className={`p-6 rounded-3xl border space-y-5 ${
            isDarkMode ? 'bg-[#1c1c1e] border-slate-800' : 'bg-white border-slate-200 shadow-sm'
          }`}>
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center space-x-2">
                <Info className="w-4 h-4 text-indigo-500" />
                <h3 className={`text-sm font-bold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                  Component Inspector
                </h3>
              </div>
              <span className="px-2 py-0.5 bg-indigo-500/10 text-indigo-500 rounded font-mono text-[10px] font-bold">
                {currentInfo.category}
              </span>
            </div>

            {/* Component Name & Realtime Metrics */}
            <div className="space-y-3">
              <h4 className="text-base font-extrabold tracking-tight text-indigo-400 font-mono">
                {currentInfo.name}
              </h4>

              <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                <div className={`p-2.5 rounded-xl border ${isDarkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
                  <span className="text-[10px] text-slate-400 block">CPU Usage</span>
                  <span className="font-bold text-amber-400">{currentInfo.cpu}%</span>
                </div>
                <div className={`p-2.5 rounded-xl border ${isDarkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
                  <span className="text-[10px] text-slate-400 block">Node Latency</span>
                  <span className="font-bold text-emerald-400">{currentInfo.latencyMs} ms</span>
                </div>
              </div>
            </div>

            {/* INTERACTIVE ACTIONS FOR SELECTED NODE */}
            <div className={`p-3.5 rounded-2xl border space-y-2.5 ${
              isDarkMode ? 'bg-slate-950/80 border-slate-800' : 'bg-slate-50 border-slate-200'
            }`}>
              <span className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider block">
                Interactive Component Controls
              </span>

              {selectedComp === 'web1' || selectedComp === 'web2' || selectedComp === 'web3' ? (
                <div className="flex flex-col gap-2">
                  <button
                    onClick={() => setTrafficRps((prev) => prev + 500)}
                    className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-mono font-bold"
                  >
                    ⚡ Stress Test (+500 RPS)
                  </button>
                  <button
                    onClick={() => setActiveFailure(activeFailure === 'server_crash' ? null : 'server_crash')}
                    className="px-3 py-1.5 bg-rose-600/20 text-rose-400 border border-rose-500/30 rounded-xl text-xs font-mono font-bold hover:bg-rose-600 hover:text-white"
                  >
                    🔥 Trigger Node Crash
                  </button>
                </div>
              ) : selectedComp === 'cache' ? (
                <div className="flex flex-col gap-2">
                  <button
                    onClick={() => setCacheHitRatio(0)}
                    className="px-3 py-1.5 bg-amber-600 text-white rounded-xl text-xs font-mono font-bold"
                  >
                    🧊 Flush Cache (Cold Cache Test)
                  </button>
                  <button
                    onClick={() => setCacheHitRatio(0.92)}
                    className="px-3 py-1.5 bg-emerald-600 text-white rounded-xl text-xs font-mono font-bold"
                  >
                    ⚡ Warm Cache (92% Hit Ratio)
                  </button>
                </div>
              ) : selectedComp === 'masterDb' ? (
                <div className="flex flex-col gap-2">
                  <button
                    onClick={() => setActiveFailure(activeFailure === 'db_crash' ? null : 'db_crash')}
                    className="px-3 py-1.5 bg-rose-600 text-white rounded-xl text-xs font-mono font-bold"
                  >
                    💥 Crash Primary Master DB
                  </button>
                  <button
                    onClick={() => setDbFailoverActive(!dbFailoverActive)}
                    className="px-3 py-1.5 bg-indigo-600 text-white rounded-xl text-xs font-mono font-bold"
                  >
                    🔄 Failover to Replica Slave
                  </button>
                </div>
              ) : selectedComp === 'lb' ? (
                <div className="flex flex-col gap-2">
                  <span className="text-[10px] text-slate-400">Load Balancing Algorithm:</span>
                  <div className="flex gap-1">
                    {(['round-robin', 'least-connections', 'ip-hash'] as const).map((algo) => (
                      <button
                        key={algo}
                        onClick={() => setLbStrategy(algo)}
                        className={`flex-1 py-1 rounded text-[9px] font-mono font-bold uppercase border ${
                          lbStrategy === algo ? 'bg-indigo-600 text-white border-indigo-500' : 'bg-slate-800 text-slate-400'
                        }`}
                      >
                        {algo.split('-')[0]}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-xs text-slate-500">Component parameters running smoothly within nominal range.</p>
              )}
            </div>

            {/* Q&A Architectural Guide */}
            <div className="space-y-3 text-xs leading-relaxed overflow-y-auto max-h-[300px] pr-1">
              <div className={`p-3 rounded-xl border space-y-1 ${isDarkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
                <span className="font-bold text-indigo-400 font-mono block uppercase text-[10px]">What is this?</span>
                <p className={isDarkMode ? 'text-slate-300' : 'text-slate-600'}>{currentInfo.whatIsIt}</p>
              </div>

              <div className={`p-3 rounded-xl border space-y-1 ${isDarkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
                <span className="font-bold text-amber-500 font-mono block uppercase text-[10px]">Why does it exist?</span>
                <p className={isDarkMode ? 'text-slate-300' : 'text-slate-600'}>{currentInfo.whyExist}</p>
              </div>

              <div className={`p-3 rounded-xl border space-y-1 ${isDarkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
                <span className="font-bold text-emerald-500 font-mono block uppercase text-[10px]">When should you use it?</span>
                <p className={isDarkMode ? 'text-slate-300' : 'text-slate-600'}>{currentInfo.whenToUse}</p>
              </div>

              <div className={`p-3 rounded-xl border space-y-1 ${isDarkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
                <span className="font-bold text-purple-400 font-mono block uppercase text-[10px]">Trade-offs Introduced</span>
                <p className={isDarkMode ? 'text-slate-300' : 'text-slate-600'}>{currentInfo.tradeoffs}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: CHAOS ENGINEERING & FAILURES LAB */}
      {activeTab === 'chaos' && (
        <div className={`p-6 rounded-3xl border space-y-6 ${
          isDarkMode ? 'bg-[#1c1c1e] border-slate-800' : 'bg-white border-slate-200'
        }`}>
          <div className="space-y-1">
            <h3 className="text-base font-bold text-rose-500 flex items-center gap-2">
              <Flame className="w-5 h-5" />
              Chaos Engineering &amp; Failure Injection Suite
            </h3>
            <p className="text-xs text-slate-500">
              Test your architecture by triggering real production disasters and observing system degradation.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <button
              onClick={() => setActiveFailure(activeFailure === 'server_crash' ? null : 'server_crash')}
              className={`p-4 rounded-2xl border text-left space-y-2 transition-all ${
                activeFailure === 'server_crash'
                  ? 'bg-rose-600 text-white ring-2 ring-rose-400 shadow-lg'
                  : isDarkMode ? 'bg-slate-950 border-slate-800 hover:bg-slate-800' : 'bg-slate-50 border-slate-200 hover:bg-slate-100'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold font-mono">🔥 Web Server Crash</span>
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-black/20">502 Error</span>
              </div>
              <p className="text-[11px] opacity-80 leading-relaxed">
                Simulates 1 web instance crashing. Tests load balancer auto-drain routing.
              </p>
            </button>

            <button
              onClick={() => setActiveFailure(activeFailure === 'db_crash' ? null : 'db_crash')}
              className={`p-4 rounded-2xl border text-left space-y-2 transition-all ${
                activeFailure === 'db_crash'
                  ? 'bg-rose-600 text-white ring-2 ring-rose-400 shadow-lg'
                  : isDarkMode ? 'bg-slate-950 border-slate-800 hover:bg-slate-800' : 'bg-slate-50 border-slate-200 hover:bg-slate-100'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold font-mono">💥 Primary DB Crash</span>
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-black/20">500 Error</span>
              </div>
              <p className="text-[11px] opacity-80 leading-relaxed">
                Simulates PostgreSQL Master disk lock failure. Write transactions halt.
              </p>
            </button>

            <button
              onClick={() => setActiveFailure(activeFailure === 'cache_stampede' ? null : 'cache_stampede')}
              className={`p-4 rounded-2xl border text-left space-y-2 transition-all ${
                activeFailure === 'cache_stampede'
                  ? 'bg-amber-600 text-white ring-2 ring-amber-400 shadow-lg'
                  : isDarkMode ? 'bg-slate-950 border-slate-800 hover:bg-slate-800' : 'bg-slate-50 border-slate-200 hover:bg-slate-100'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold font-mono">🧊 Cache Stampede</span>
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-black/20">Latency +300ms</span>
              </div>
              <p className="text-[11px] opacity-80 leading-relaxed">
                Redis flushes while 10,000 users slam backend DB simultaneously.
              </p>
            </button>

            <button
              onClick={() => setActiveFailure(activeFailure === 'traffic_spike' ? null : 'traffic_spike')}
              className={`p-4 rounded-2xl border text-left space-y-2 transition-all ${
                activeFailure === 'traffic_spike'
                  ? 'bg-amber-600 text-white ring-2 ring-amber-400 shadow-lg'
                  : isDarkMode ? 'bg-slate-950 border-slate-800 hover:bg-slate-800' : 'bg-slate-50 border-slate-200 hover:bg-slate-100'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold font-mono">⚡ Black Friday 10x Spike</span>
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-black/20">100% CPU</span>
              </div>
              <p className="text-[11px] opacity-80 leading-relaxed">
                Instantly surges traffic to 25,000 RPS. Tests auto-scaling headroom.
              </p>
            </button>
          </div>

          {activeFailure && (
            <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs font-mono space-y-2">
              <div className="flex items-center justify-between font-bold">
                <span>Active Failure Injected: {activeFailure.toUpperCase()}</span>
                <button
                  onClick={() => setActiveFailure(null)}
                  className="px-2.5 py-1 bg-rose-600 text-white rounded-lg hover:bg-rose-500"
                >
                  Clear Failure
                </button>
              </div>
              <p className="opacity-90">
                System SLA dropped to <strong>{availabilityPct}%</strong>. Latency increased to <strong>{baseLatency} ms</strong>.
              </p>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: LIVE TERMINAL LOGS */}
      {activeTab === 'logs' && (
        <div className={`p-6 rounded-3xl border space-y-4 font-mono ${
          isDarkMode ? 'bg-slate-950 border-slate-800 text-white' : 'bg-slate-900 border-slate-700 text-white'
        }`}>
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <div className="flex items-center space-x-2">
              <Terminal className="w-4 h-4 text-emerald-400" />
              <h3 className="text-xs font-bold text-slate-300">LIVE SYSTEM REQUEST LOG TRACER</h3>
            </div>
            <button
              onClick={() => setLogs([])}
              className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-400 text-[10px] rounded-lg"
            >
              Clear Logs
            </button>
          </div>

          <div className="h-80 overflow-y-auto space-y-1.5 text-xs pr-2">
            {logs.map((log) => (
              <div key={log.id} className="flex items-start space-x-3 py-1 border-b border-slate-900">
                <span className="text-slate-600 text-[10px] shrink-0">{log.timestamp}</span>
                <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase shrink-0 ${
                  log.type === 'error' ? 'bg-rose-950 text-rose-400 border border-rose-800' :
                  log.type === 'warn' ? 'bg-amber-950 text-amber-400 border border-amber-800' :
                  log.type === 'success' ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' :
                  'bg-blue-950 text-blue-400 border border-blue-800'
                }`}>
                  {log.source}
                </span>
                <span className={
                  log.type === 'error' ? 'text-rose-300' :
                  log.type === 'warn' ? 'text-amber-300' :
                  log.type === 'success' ? 'text-emerald-300' : 'text-slate-300'
                }>
                  {log.message}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 4: ARCHITECT QUIZ */}
      {activeTab === 'quiz' && (
        <div className={`p-6 rounded-3xl border space-y-6 ${
          isDarkMode ? 'bg-[#1c1c1e] border-slate-800' : 'bg-white border-slate-200'
        }`}>
          <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
            <div>
              <span className="text-xs font-mono font-bold text-amber-500 uppercase">Stage {stage} Knowledge Check</span>
              <h3 className={`text-base font-bold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                Senior Architect Decision Quiz
              </h3>
            </div>
            <div className="text-xs font-mono bg-amber-500/10 text-amber-500 font-bold px-3 py-1 rounded-xl">
              Score: {quizScore} Points
            </div>
          </div>

          <div className="space-y-4 max-w-2xl">
            <p className={`text-sm font-semibold ${isDarkMode ? 'text-slate-200' : 'text-slate-800'}`}>
              {currentQuiz.question}
            </p>

            <div className="space-y-2">
              {currentQuiz.options.map((opt, idx) => {
                const isSelected = selectedAnswers[stage] === idx;
                const isCorrect = idx === currentQuiz.correct;
                const hasAnswered = selectedAnswers[stage] !== undefined;

                return (
                  <button
                    key={opt}
                    onClick={() => {
                      if (hasAnswered) return;
                      setSelectedAnswers(prev => ({ ...prev, [stage]: idx }));
                      if (isCorrect) setQuizScore(prev => prev + 100);
                    }}
                    className={`w-full p-3.5 rounded-2xl border text-left text-xs font-mono font-bold transition-all ${
                      hasAnswered
                        ? isCorrect
                          ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400'
                          : isSelected
                          ? 'bg-rose-500/20 border-rose-500 text-rose-400'
                          : 'opacity-40 border-slate-800'
                        : isDarkMode ? 'bg-slate-950 border-slate-800 hover:bg-slate-800' : 'bg-slate-50 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {opt}
                  </button>
                );
              })}
            </div>

            {selectedAnswers[stage] !== undefined && (
              <div className={`p-4 rounded-2xl border text-xs leading-relaxed ${
                selectedAnswers[stage] === currentQuiz.correct
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                  : 'bg-rose-500/10 border-rose-500/30 text-rose-400'
              }`}>
                <strong>Explanation:</strong> {currentQuiz.explanation}
              </div>
            )}
          </div>
        </div>
      )}

    </div>
  );
};
