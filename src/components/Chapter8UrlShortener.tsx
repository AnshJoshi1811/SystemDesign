import React, { useState, useEffect, useRef } from 'react';
import {
  Link2,
  Server,
  Database,
  Zap,
  Globe,
  Sliders,
  Terminal,
  Award,
  Plus,
  RefreshCw,
  Copy,
  Check,
  Play,
  Pause,
  AlertTriangle,
  ArrowRight,
  BarChart3,
  CheckCircle2,
  Layers,
  Clock,
  Shield,
  ExternalLink,
  Info,
  Cpu,
  MousePointer,
  RotateCcw,
  Sparkles,
  ZapOff,
  Filter,
  Eye,
  Activity,
  ChevronRight,
  SlidersHorizontal,
  FolderSync
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface Chapter8UrlShortenerProps {
  isDarkMode?: boolean;
}

export type CodeGenStrategy = 'HASH_MD5' | 'BASE62_COUNTER' | 'RANDOM_STRING' | 'UUID' | 'KGS';
export type RedirectType = '301_PERMANENT' | '302_TEMPORARY';

export interface ShortUrlRecord {
  shortCode: string;
  longUrl: string;
  createdAt: number;
  clickCount: number;
  customAlias?: string;
  ttlDays?: number;
  expired?: boolean;
  strategy: CodeGenStrategy;
  dbId: number;
}

export interface RequestLog {
  id: string;
  timestamp: string;
  method: 'POST' | 'GET';
  path: string;
  statusCode: number;
  longUrl?: string;
  shortCode?: string;
  redirectType?: RedirectType;
  cacheHit: boolean;
  latencyMs: number;
  country: string;
  device: string;
}

export const Chapter8UrlShortener: React.FC<Chapter8UrlShortenerProps> = ({ isDarkMode = false }) => {
  // --- STAGE PROGRESSION (1 to 10) ---
  const [stage, setStage] = useState<number>(1);
  const [activeTab, setActiveTab] = useState<'canvas' | 'base62' | 'collision' | 'redirect' | 'analytics' | 'quiz'>('canvas');

  // Input state for creation
  const [inputLongUrl, setInputLongUrl] = useState<string>('https://openai.com/research/system-design-gpt4-architecture');
  const [inputCustomAlias, setInputCustomAlias] = useState<string>('');
  const [inputTtlDays, setInputTtlDays] = useState<number>(30);

  // Strategy & Configuration
  const [strategy, setStrategy] = useState<CodeGenStrategy>('HASH_MD5');
  const [redirectType, setRedirectType] = useState<RedirectType>('302_TEMPORARY');
  const [useCache, setUseCache] = useState<boolean>(true);
  const [useAsyncAnalytics, setUseAsyncAnalytics] = useState<boolean>(true);
  const [readReplicaCount, setReadReplicaCount] = useState<number>(2);

  // Interactive Simulation Controls
  const [isSimulating, setIsSimulating] = useState<boolean>(false);
  const [trafficRps, setTrafficRps] = useState<number>(100);

  // Stats & Metrics
  const [totalUrlsCreated, setTotalUrlsCreated] = useState<number>(12840);
  const [totalRedirects, setTotalRedirects] = useState<number>(458200);
  const [cacheHits, setCacheHits] = useState<number>(389470);
  const [collisionsCount, setCollisionsCount] = useState<number>(12);
  const [avgLatencyMs, setAvgLatencyMs] = useState<number>(14.2);
  const [dbLoadPercent, setDbLoadPercent] = useState<number>(24);
  const [bloomFilterChecks, setBloomFilterChecks] = useState<number>(0);
  const [bloomFilterBypassReads, setBloomFilterBypassReads] = useState<number>(0);

  // Copy Feedback State
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  // Request Animation State
  const [activePacket, setActivePacket] = useState<{
    id: string;
    type: 'CREATE' | 'REDIRECT';
    shortCode: string;
    longUrl: string;
    cacheHit: boolean;
  } | null>(null);

  // Sample Short URLs Database
  const [urlDatabase, setUrlDatabase] = useState<ShortUrlRecord[]>([
    { shortCode: 'Ab9KxP', longUrl: 'https://openai.com/research/system-design', createdAt: Date.now() - 3600000, clickCount: 1420, strategy: 'BASE62_COUNTER', dbId: 11157113224 },
    { shortCode: 'x7K9L2', longUrl: 'https://github.com/google/gemini-api', createdAt: Date.now() - 7200000, clickCount: 890, strategy: 'BASE62_COUNTER', dbId: 11157113225 },
    { shortCode: 'sysDes', longUrl: 'https://ai.studio/build/system-design-notes', createdAt: Date.now() - 10800000, clickCount: 3200, customAlias: 'sysDes', strategy: 'BASE62_COUNTER', dbId: 11157113226 },
    { shortCode: '3mKp9Q', longUrl: 'https://aws.amazon.com/architecture/well-architected', createdAt: Date.now() - 14400000, clickCount: 540, strategy: 'HASH_MD5', dbId: 11157113227 },
  ]);

  const bloomShortCodeSetRef = useRef<Set<string>>(new Set(urlDatabase.map((record) => record.shortCode)));

  // Request Logs Stream
  const [requestLogs, setRequestLogs] = useState<RequestLog[]>([
    { id: '1', timestamp: new Date().toLocaleTimeString(), method: 'GET', path: '/Ab9KxP', statusCode: 302, longUrl: 'https://openai.com/research/system-design', cacheHit: true, latencyMs: 2.1, country: 'United States', device: 'Desktop' },
    { id: '2', timestamp: new Date().toLocaleTimeString(), method: 'POST', path: '/api/v1/shorten', statusCode: 201, longUrl: 'https://github.com/google/gemini-api', shortCode: 'x7K9L2', cacheHit: false, latencyMs: 18.4, country: 'Germany', device: 'Mobile' },
    { id: '3', timestamp: new Date().toLocaleTimeString(), method: 'GET', path: '/sysDes', statusCode: 302, longUrl: 'https://ai.studio/build/system-design-notes', cacheHit: true, latencyMs: 1.8, country: 'Japan', device: 'Desktop' },
  ]);

  // Base62 Playground State
  const [base62InputNum, setBase62InputNum] = useState<number>(11157113224);
  const [base62InputStr, setBase62InputStr] = useState<string>('Ab9KxP');

  // 301 vs 302 Simulator Clicks History
  const [redirectSimClicks, setRedirectSimClicks] = useState<{ id: number; hitServer: boolean; latency: number }[]>([]);

  // Base62 Alphabet (0-9, a-z, A-Z)
  const BASE62_ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';

  // Base62 Encoding Math Helpers
  const encodeBase62 = (num: number): string => {
    if (num === 0) return BASE62_ALPHABET[0];
    let str = '';
    let current = num;
    while (current > 0) {
      const rem = current % 62;
      str = BASE62_ALPHABET[rem] + str;
      current = Math.floor(current / 62);
    }
    return str;
  };

  const decodeBase62 = (str: string): number => {
    let num = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str[i];
      const index = BASE62_ALPHABET.indexOf(char);
      if (index === -1) return 0;
      num = num * 62 + index;
    }
    return num;
  };

  const isExistingShortCode = (shortCode: string) => {
    setBloomFilterChecks((count) => count + 1);
    if (!bloomShortCodeSetRef.current.has(shortCode)) {
      setBloomFilterBypassReads((count) => count + 1);
      return false;
    }
    return urlDatabase.some((entry) => entry.shortCode === shortCode);
  };

  // Sync Strategy with Stages
  useEffect(() => {
    if (stage === 1) {
      setUseCache(false);
      setStrategy('HASH_MD5');
    } else if (stage === 2) {
      setUseCache(false);
      setStrategy('HASH_MD5');
    } else if (stage === 3) {
      setUseCache(true);
      setStrategy('HASH_MD5');
    } else if (stage === 4) {
      setStrategy('BASE62_COUNTER');
    } else if (stage === 5) {
      setStrategy('KGS');
    } else if (stage === 6) {
      setRedirectType('301_PERMANENT');
    } else if (stage >= 7) {
      setUseCache(true);
      setUseAsyncAnalytics(true);
    }
  }, [stage]);

  // Helper to generate short code based on active strategy
  const generateCodeForStrategy = (longUrl: string, alias?: string): { code: string; dbId: number; isCollision: boolean } => {
    if (alias && alias.trim().length > 0) {
      const aliasCode = alias.trim();
      return { code: aliasCode, dbId: Date.now(), isCollision: isExistingShortCode(aliasCode) };
    }

    if (strategy === 'BASE62_COUNTER') {
      const nextId = 11157113220 + urlDatabase.length + Math.floor(Math.random() * 50);
      const code = encodeBase62(nextId).padStart(6, '0');
      return { code, dbId: nextId, isCollision: false };
    }

    if (strategy === 'UUID') {
      const uuidStr = Math.random().toString(36).substring(2, 8);
      return { code: uuidStr, dbId: Date.now(), isCollision: false };
    }

    if (strategy === 'KGS') {
      // Key Generation Service pre-allocated pool
      const kgsPool = ['Kg9Xp2', 'Kg3Lm8', 'Kg7Qy1', 'Kg4Zb9', 'Kg1Wv5'];
      const code = kgsPool[Math.floor(Math.random() * kgsPool.length)] + Math.floor(Math.random() * 90 + 10);
      return { code, dbId: Date.now(), isCollision: false };
    }

    // Default: Hash (MD5/SHA256) first 6 chars
    let hash = 0;
    for (let i = 0; i < longUrl.length; i++) {
      hash = (hash << 5) - hash + longUrl.charCodeAt(i);
      hash |= 0;
    }
    const absHash = Math.abs(hash);
    const code = encodeBase62(absHash).substring(0, 6).padStart(6, 'a');

    // Check collision
    return { code, dbId: absHash, isCollision: isExistingShortCode(code) };
  };

  // Handle URL Creation Action
  const handleCreateShortUrl = () => {
    if (!inputLongUrl) return;

    const { code, dbId, isCollision } = generateCodeForStrategy(inputLongUrl, inputCustomAlias);

    if (isCollision) {
      setCollisionsCount(c => c + 1);
    }

    const newRecord: ShortUrlRecord = {
      shortCode: code,
      longUrl: inputLongUrl,
      createdAt: Date.now(),
      clickCount: 0,
      customAlias: inputCustomAlias || undefined,
      ttlDays: inputTtlDays,
      strategy,
      dbId
    };

    bloomShortCodeSetRef.current.add(code);
    setUrlDatabase(prev => [newRecord, ...prev]);
    setTotalUrlsCreated(t => t + 1);

    // Trigger Request Packet Animation
    setActivePacket({
      id: Math.random().toString(),
      type: 'CREATE',
      shortCode: code,
      longUrl: inputLongUrl,
      cacheHit: false
    });

    // Add log
    const newLog: RequestLog = {
      id: Math.random().toString(),
      timestamp: new Date().toLocaleTimeString(),
      method: 'POST',
      path: '/api/v1/shorten',
      statusCode: isCollision ? 409 : 201,
      longUrl: inputLongUrl,
      shortCode: code,
      cacheHit: false,
      latencyMs: stage === 1 ? 2.5 : stage === 2 ? 18.5 : 8.2,
      country: 'United States',
      device: 'Desktop'
    };
    setRequestLogs(prev => [newLog, ...prev.slice(0, 49)]);

    setTimeout(() => setActivePacket(null), 1500);
  };

  // Handle Testing / Clicking a Short URL
  const handleTestRedirect = (record: ShortUrlRecord) => {
    // Determine Cache Hit
    const isCacheHit = useCache && Math.random() < 0.85; // 85% cache hit
    const latency = isCacheHit ? 1.2 : 18.5;

    // Increment click count
    setUrlDatabase(prev => prev.map(u => u.shortCode === record.shortCode ? { ...u, clickCount: u.clickCount + 1 } : u));
    setTotalRedirects(r => r + 1);
    if (isCacheHit) setCacheHits(ch => ch + 1);

    // Trigger Packet
    setActivePacket({
      id: Math.random().toString(),
      type: 'REDIRECT',
      shortCode: record.shortCode,
      longUrl: record.longUrl,
      cacheHit: isCacheHit
    });

    const countries = ['United States', 'Germany', 'Japan', 'United Kingdom', 'Brazil', 'India'];
    const devices = ['Desktop', 'Mobile', 'Tablet'];

    const newLog: RequestLog = {
      id: Math.random().toString(),
      timestamp: new Date().toLocaleTimeString(),
      method: 'GET',
      path: `/${record.shortCode}`,
      statusCode: redirectType === '301_PERMANENT' ? 301 : 302,
      longUrl: record.longUrl,
      shortCode: record.shortCode,
      redirectType,
      cacheHit: isCacheHit,
      latencyMs: latency,
      country: countries[Math.floor(Math.random() * countries.length)],
      device: devices[Math.floor(Math.random() * devices.length)]
    };

    setRequestLogs(prev => [newLog, ...prev.slice(0, 49)]);

    setTimeout(() => setActivePacket(null), 1500);
  };

  // Simulation heartbeat
  useEffect(() => {
    if (!isSimulating) return;

    const interval = setInterval(() => {
      if (urlDatabase.length === 0) return;
      const randomRecord = urlDatabase[Math.floor(Math.random() * urlDatabase.length)];
      const isCacheHit = useCache && Math.random() < 0.85;

      setTotalRedirects(r => r + 1);
      if (isCacheHit) setCacheHits(ch => ch + 1);

      setUrlDatabase(prev => prev.map(u => u.shortCode === randomRecord.shortCode ? { ...u, clickCount: u.clickCount + 1 } : u));
    }, Math.max(100, 10000 / trafficRps));

    return () => clearInterval(interval);
  }, [isSimulating, trafficRps, urlDatabase, useCache]);

  // Handle 301 vs 302 Click Test Simulation
  const handleSimulateRedirectClick = () => {
    if (redirectType === '301_PERMANENT') {
      const isFirst = redirectSimClicks.length === 0;
      const hitServer = isFirst; // Subsequent clicks cached by browser!
      const latency = hitServer ? 16.5 : 0.8;
      setRedirectSimClicks(prev => [...prev, { id: prev.length + 1, hitServer, latency }]);
    } else {
      // 302 Temporary: ALWAYS hits server!
      setRedirectSimClicks(prev => [...prev, { id: prev.length + 1, hitServer: true, latency: 14.2 }]);
    }
  };

  // Stage Guidance Content
  const stageGuide = [
    {
      stage: 1,
      title: 'Stage 1: Simple URL Mapping (In-Memory HashMap)',
      problem: 'In-Memory HashMap works fast for tiny prototypes. However, server restarts wipe all mappings, and memory is strictly limited (RAM exhaustion).',
      solution: 'Persist mappings into a database (RDBMS/NoSQL) so data survives restarts.',
      question: 'What happens when your service receives 100 Million URLs in RAM?'
    },
    {
      stage: 2,
      title: 'Stage 2: Persistent Database Storage',
      problem: 'Data is now durable, BUT every redirect requires a disk/network read. At high traffic (100k QPS), database disk I/O becomes the main latency bottleneck (~20ms).',
      solution: 'Add a high-speed In-Memory Cache (Redis / Memcached) in front of the database.',
      question: 'Why does database disk read latency degrade user experience during redirects?'
    },
    {
      stage: 3,
      title: 'Stage 3: Caching Layer (Redis)',
      problem: '99% of read traffic targets popular hot links. Without cache, DB CPU hits 100%. Cache hits reduce latency from 20ms to <2ms.',
      solution: 'Now solve short code generation: How to turn long URLs into 6-7 character strings?',
      question: 'What cache eviction policy (LRU vs LFU) is best for short link redirects?'
    },
    {
      stage: 4,
      title: 'Stage 4: Short Code Generation Strategies',
      problem: 'Hashing long URLs (MD5/SHA256) and taking the first 6 characters leads to Hash Collisions! Multiple long URLs map to the same short code.',
      solution: 'Use Auto-Increment Distributed ID + Base62 Encoding or a Key Generation Service (KGS).',
      question: 'Why is Base62 (62 characters) superior to Hexadecimal (16) or Base64 (64)?'
    },
    {
      stage: 5,
      title: 'Stage 5: Collision Detection & Key Generation Service (KGS)',
      problem: 'If two long URLs hash to the same 6-character code, query checks add expensive latency retries.',
      solution: 'Pre-generate unique random 7-character keys offline in a KGS database and load key batches into memory for zero-collision instant assignment.',
      question: 'How does a Key Generation Service eliminate runtime collision check queries?'
    },
    {
      stage: 6,
      title: 'Stage 6: Redirect Optimization (301 Permanent vs 302 Temporary)',
      problem: '301 Moved Permanently allows browsers to cache redirects locally (0 server traffic), BUT completely destroys backend analytics tracking!',
      solution: 'Use 302 Found (Temporary) when click analytics (country, referrer) are required.',
      question: 'When should a business choose HTTP 301 vs HTTP 302?'
    },
    {
      stage: 7,
      title: 'Stage 7: Read Replicas & Database Sharding',
      problem: 'URL shorteners have an extreme 100:1 Read-to-Write ratio. A single database primary cannot handle millions of reads/sec.',
      solution: 'Deploy database Read Replicas and shard long URL mappings using Consistent Hashing on shortCode.',
      question: 'How do Read Replicas prevent database primary write starvation?'
    },
    {
      stage: 8,
      title: 'Stage 8: Asynchronous Analytics Pipeline (Kafka Queue)',
      problem: 'Writing click logs (IP, user-agent, location) synchronously inside the redirect path slows down user HTTP response times by 30ms.',
      solution: 'Publish redirect events to an Asynchronous Message Queue (Kafka/RabbitMQ) for decoupled background worker processing.',
      question: 'Why should analytics processing never block the HTTP redirect response?'
    },
    {
      stage: 9,
      title: 'Stage 9: Expiration, TTL & Cleanup Workers',
      problem: 'Millions of old, unused short URLs accumulate, bloating database storage and memory indexes over years.',
      solution: 'Set Time-To-Live (TTL) expiration policies and run background cleanup cron workers during low-traffic hours.',
      question: 'How does TTL expiration prevent database storage exhaustion?'
    },
    {
      stage: 10,
      title: 'Stage 10: Global Deployment & Edge CDN Caching',
      problem: 'Users across the globe experience 200ms transatlantic network ping times when accessing centralized servers.',
      solution: 'Deploy Geo-DNS routing, Multi-Region Read Replicas, and Edge CDN caching to serve redirects in under 10ms worldwide.',
      question: 'How does Edge CDN caching achieve sub-10ms global redirection?'
    }
  ];

  const currentGuide = stageGuide[stage - 1];
  const hottestUrlRecord = [...urlDatabase].sort((a, b) => b.clickCount - a.clickCount)[0];

  // Quizzes
  const quizzes = [
    {
      stage: 1,
      question: "Why is storing short URL mappings in a single server's in-memory HashMap insufficient for production?",
      options: [
        "A. Memory loses all mappings when the server restarts or crashes, and RAM capacity is strictly limited",
        "B. HashMaps cannot store strings longer than 10 characters",
        "C. In-memory storage slows down network requests",
        "D. HashMaps only work with integer keys"
      ],
      correct: 0,
      explanation: "In-memory state lacks durability across server restarts and cannot scale beyond the RAM limits of a single machine."
    },
    {
      stage: 4,
      question: "Why is Base62 encoding (0-9, a-z, A-Z) preferred over Base64 for short URL codes?",
      options: [
        "A. Base62 is faster to calculate than Base64",
        "B. Base64 contains '+' and '/' characters which require URL encoding ('%2B', '%2F') making URLs ugly and unsafe",
        "C. Base62 requires 128 bits of memory",
        "D. Base64 cannot be decoded"
      ],
      correct: 1,
      explanation: "Base64 includes characters (+, /, =) that are special symbols in HTTP URLs, requiring awkward escaping. Base62 is 100% URL-safe."
    },
    {
      stage: 5,
      question: "How does a Key Generation Service (KGS) eliminate runtime hash collisions?",
      options: [
        "A. By making all long URLs uppercase",
        "B. By pre-generating unique random short codes offline and serving pre-computed keys instantly from memory",
        "C. By checking the database 5 times before every insertion",
        "D. By using 50-character long codes"
      ],
      correct: 1,
      explanation: "KGS pre-computes unique keys offline in a key DB and loads batches into memory, guaranteeing 0 runtime collisions and 0 DB lookup overhead during code assignment."
    },
    {
      stage: 6,
      question: "What is the key architectural difference between HTTP 301 and HTTP 302 redirects?",
      options: [
        "A. HTTP 301 is for mobile, HTTP 302 is for desktop",
        "B. HTTP 301 is permanently cached by browsers (bypassing server on subsequent clicks, destroying analytics), whereas 302 always hits the server",
        "C. HTTP 302 causes database corruption",
        "D. HTTP 301 requires an SSL certificate"
      ],
      correct: 1,
      explanation: "HTTP 301 instructs browser local cache to directly load the target long URL on future visits, preventing the shortening server from logging click analytics."
    },
    {
      stage: 8,
      question: "Why should click analytics (country, device, referrer) be processed asynchronously via Message Queue (Kafka)?",
      options: [
        "A. Async queues compress the database size",
        "B. Synchronous database writes during redirection add 30ms latency to every user click; async processing decouples analytics writes",
        "C. Web browsers do not support synchronous HTTP requests",
        "D. Async queues prevent SQL injection"
      ],
      correct: 1,
      explanation: "Decoupling analytics writes to a message queue guarantees that user redirect responses remain sub-millisecond without waiting for analytics DB inserts."
    }
  ];

  const currentQuiz = quizzes[(stage - 1) % quizzes.length];

  return (
    <div className="space-y-6">

      {/* CHAPTER HERO BANNER */}
      <div className={`p-6 sm:p-8 rounded-3xl border shadow-xl relative overflow-hidden transition-all ${
        isDarkMode
          ? 'bg-[#161616] border-white/[0.08] text-white'
          : 'bg-white border-slate-200 text-slate-900'
      }`}>
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2 max-w-3xl">
            <div className="flex items-center space-x-2">
              <span className="px-3 py-1 bg-amber-500 text-slate-950 font-mono text-xs font-black rounded-full uppercase tracking-wider">
                CHAPTER 8
              </span>
              <span className={`text-xs font-mono font-semibold ${isDarkMode ? 'text-amber-400' : 'text-amber-700'}`}>
                URL Shortener Architecture (TinyURL / Bitly)
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold tracking-tight">
              Design a Globally Scalable URL Shortener
            </h1>
            <p className={`text-xs sm:text-sm leading-relaxed ${isDarkMode ? 'text-slate-300' : 'text-slate-600'}`}>
              Synthesize Chapters 1–7 into a production-grade URL shortening service. Master Base62 encoding, Key Generation Services (KGS), 301 vs 302 HTTP redirects, Redis caching, and asynchronous Kafka analytics pipelines.
            </p>
          </div>

          {/* Stage Progression Pills (1 to 10) */}
          <div className="flex flex-wrap items-center gap-1.5 shrink-0 bg-slate-950/60 backdrop-blur-md p-2.5 rounded-2xl border border-amber-500/20 max-w-xs">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((stg) => (
              <button
                key={stg}
                onClick={() => setStage(stg)}
                className={`w-7 h-7 sm:w-8 sm:h-8 rounded-xl font-mono text-[10px] sm:text-xs font-bold transition-all flex items-center justify-center ${
                  stage === stg
                    ? 'bg-amber-500 text-slate-950 shadow-lg scale-105 font-black'
                    : stage > stg
                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                    : isDarkMode ? 'text-slate-500 hover:text-white' : 'text-slate-400 hover:text-slate-800'
                }`}
                title={`Jump to Stage ${stg}`}
              >
                {stg}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ARCHITECT DIAGNOSIS & LESSON BOX */}
      <div className={`p-5 rounded-3xl border space-y-3 ${
        isDarkMode ? 'bg-[#1c1c1e]/90 border-slate-800' : 'bg-white border-slate-200 shadow-xs'
      }`}>
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-amber-500/10 text-amber-500 rounded-2xl border border-amber-500/20">
              <Link2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className={`text-base font-bold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                {currentGuide.title}
              </h2>
              <p className="text-xs text-slate-500 font-mono">
                System Design Milestone • Stage {stage} of 10
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2 shrink-0">
            <button
              disabled={stage === 1}
              onClick={() => setStage(prev => Math.max(1, prev - 1))}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold font-mono border transition-all ${
                stage === 1 ? 'opacity-40 cursor-not-allowed' : 'hover:bg-amber-500/10'
              }`}
            >
              ← Prev Stage
            </button>
            <button
              disabled={stage === 10}
              onClick={() => setStage(prev => Math.min(10, prev + 1))}
              className={`px-4 py-1.5 bg-amber-500 hover:bg-amber-600 text-slate-950 font-black rounded-xl text-xs font-mono transition-all shadow-md ${
                stage === 10 ? 'opacity-40 cursor-not-allowed' : ''
              }`}
            >
              Next Stage →
            </button>
          </div>
        </div>

        <div className={`p-3.5 rounded-2xl border text-xs leading-relaxed ${
          isDarkMode ? 'bg-slate-950 border-slate-800 text-slate-300' : 'bg-slate-50 border-slate-200 text-slate-700'
        }`}>
          <p className="mb-1"><strong>Bottleneck:</strong> {currentGuide.problem}</p>
          <p className="text-amber-500 dark:text-amber-400 font-medium"><strong>Architecture Evolution:</strong> {currentGuide.solution}</p>
        </div>
      </div>

      {/* NAVIGATION TABS */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-2">
        <button
          onClick={() => setActiveTab('canvas')}
          className={`px-4 py-2 rounded-xl font-mono text-xs font-bold flex items-center space-x-2 transition-all ${
            activeTab === 'canvas'
              ? 'bg-amber-500 text-slate-950 shadow-md font-black'
              : isDarkMode ? 'text-slate-400 hover:text-white hover:bg-slate-800' : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Globe className="w-4 h-4" />
          <span>Live URL Flow Canvas</span>
        </button>

        <button
          onClick={() => setActiveTab('base62')}
          className={`px-4 py-2 rounded-xl font-mono text-xs font-bold flex items-center space-x-2 transition-all ${
            activeTab === 'base62'
              ? 'bg-indigo-600 text-white shadow-md'
              : isDarkMode ? 'text-slate-400 hover:text-white hover:bg-slate-800' : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Sliders className="w-4 h-4" />
          <span>Base62 Playground</span>
        </button>

        <button
          onClick={() => setActiveTab('collision')}
          className={`px-4 py-2 rounded-xl font-mono text-xs font-bold flex items-center space-x-2 transition-all ${
            activeTab === 'collision'
              ? 'bg-rose-600 text-white shadow-md'
              : isDarkMode ? 'text-slate-400 hover:text-white hover:bg-slate-800' : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Shield className="w-4 h-4" />
          <span>Collision &amp; KGS Lab</span>
        </button>

        <button
          onClick={() => setActiveTab('redirect')}
          className={`px-4 py-2 rounded-xl font-mono text-xs font-bold flex items-center space-x-2 transition-all ${
            activeTab === 'redirect'
              ? 'bg-emerald-600 text-white shadow-md'
              : isDarkMode ? 'text-slate-400 hover:text-white hover:bg-slate-800' : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <MousePointer className="w-4 h-4" />
          <span>301 vs 302 Redirect Lab</span>
        </button>

        <button
          onClick={() => setActiveTab('analytics')}
          className={`px-4 py-2 rounded-xl font-mono text-xs font-bold flex items-center space-x-2 transition-all ${
            activeTab === 'analytics'
              ? 'bg-slate-800 text-white shadow-md'
              : isDarkMode ? 'text-slate-400 hover:text-white hover:bg-slate-800' : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <BarChart3 className="w-4 h-4" />
          <span>Console &amp; Analytics</span>
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
          <span>Architect Challenge</span>
        </button>
      </div>

      {/* TAB 1: LIVE URL FLOW CANVAS */}
      {activeTab === 'canvas' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* LEFT 2 COLUMNS: ARCHITECTURE CANVAS */}
          <div className={`lg:col-span-2 p-6 rounded-3xl border relative min-h-[520px] flex flex-col justify-between ${
            isDarkMode ? 'bg-[#1c1c1e] border-slate-800' : 'bg-white border-slate-200 shadow-xs'
          }`}>
            <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center space-x-2">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse"></span>
                <h3 className={`text-xs font-bold font-mono uppercase tracking-wider ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                  SYSTEM TOPOLOGY &amp; LIVE URL REDIRECTION CANVAS
                </h3>
              </div>

              <div className="flex items-center space-x-2 font-mono text-[10px]">
                <span className="px-2.5 py-1 rounded-full bg-amber-500 text-slate-950 font-black uppercase">
                  Code: {strategy}
                </span>
                <span className="px-2.5 py-1 rounded-full bg-indigo-500/10 text-indigo-400 font-bold border border-indigo-500/20">
                  HTTP: {redirectType === '301_PERMANENT' ? '301 Permanent' : '302 Found'}
                </span>
              </div>
            </div>

            {/* INTERACTIVE FORM FOR SHORTENING URL */}
            <div className={`p-4 rounded-2xl border my-4 ${isDarkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
              <span className="text-xs font-mono font-bold text-amber-500 block mb-2">
                1. Create Short URL (`POST /api/v1/shorten`)
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <input
                    type="text"
                    value={inputLongUrl}
                    onChange={(e) => setInputLongUrl(e.target.value)}
                    placeholder="Enter long target URL..."
                    className={`w-full px-3 py-2 rounded-xl text-xs font-mono border focus:outline-hidden ${
                      isDarkMode ? 'bg-[#1c1c1e] border-slate-800 text-white' : 'bg-white border-slate-200 text-slate-900'
                    }`}
                  />
                </div>
                <div>
                  <button
                    onClick={handleCreateShortUrl}
                    className="w-full py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black rounded-xl text-xs font-mono shadow-md flex items-center justify-center space-x-1"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Generate Short Link</span>
                  </button>
                </div>
              </div>
            </div>

            {/* ANIMATED PACKET FLOW */}
            {activePacket && (
              <motion.div
                initial={{ opacity: 0, scale: 0.8, y: -20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, y: 20 }}
                className="px-4 py-2 bg-amber-500 text-slate-950 rounded-2xl font-mono text-xs font-black shadow-xl flex items-center justify-between my-2 animate-bounce"
              >
                <div className="flex items-center space-x-2">
                  <Zap className="w-4 h-4 text-slate-950" />
                  <span>
                    {activePacket.type === 'CREATE'
                      ? `POST Shortened -> https://tiny.url/${activePacket.shortCode}`
                      : `GET /${activePacket.shortCode} -> 302 Redirect to ${activePacket.longUrl.substring(0, 30)}...`}
                  </span>
                </div>
                <span className="text-[9px] bg-slate-950 text-amber-400 px-2 py-0.5 rounded">
                  {activePacket.cacheHit ? 'CACHE HIT (Redis 1ms)' : 'DB LOOKUP (18ms)'}
                </span>
              </motion.div>
            )}

            {/* SYSTEM NODES TOPOLOGY MAP */}
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 my-4">

              {/* Client Node */}
              <div className={`p-3 rounded-2xl border text-center font-mono ${isDarkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
                <Globe className="w-5 h-5 text-indigo-400 mx-auto mb-1" />
                <span className="text-[10px] font-bold block">Clients (Browser/App)</span>
                <span className="text-[9px] text-slate-500">GET /shortCode</span>
              </div>

              {/* API Gateway & Cache Node */}
              <div className={`p-3 rounded-2xl border text-center font-mono relative ${
                useCache ? 'border-emerald-500/50 bg-emerald-950/10' : isDarkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'
              }`}>
                <Zap className={`w-5 h-5 mx-auto mb-1 ${useCache ? 'text-emerald-400' : 'text-slate-500'}`} />
                <span className="text-[10px] font-bold block">Redis Cache Layer</span>
                <span className={`text-[9px] ${useCache ? 'text-emerald-400' : 'text-slate-500'}`}>
                  {useCache ? 'Enabled (Hot Keys 1ms)' : 'Disabled'}
                </span>
              </div>

              {/* Key Generator / API Node */}
              <div className={`p-3 rounded-2xl border text-center font-mono ${isDarkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
                <Cpu className="w-5 h-5 text-amber-500 mx-auto mb-1" />
                <span className="text-[10px] font-bold block">API &amp; Generator</span>
                <span className="text-[9px] text-amber-400">{strategy}</span>
              </div>

              {/* Database Node */}
              <div className={`p-3 rounded-2xl border text-center font-mono ${isDarkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
                <Database className="w-5 h-5 text-indigo-400 mx-auto mb-1" />
                <span className="text-[10px] font-bold block">SQL / NoSQL DB</span>
                <span className="text-[9px] text-slate-500">{readReplicaCount} Read Replicas</span>
              </div>

            </div>

            {/* LIVE ACTIVE URL MAPPINGS TABLE */}
            <div className="space-y-2 mt-2">
              <span className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider block">
                2. Active Short URL Mappings (Click to Test Redirection)
              </span>

              <div className="space-y-1.5 max-h-[180px] overflow-y-auto pr-1">
                {urlDatabase.map((rec) => (
                  <div
                    key={rec.shortCode}
                    className={`p-2.5 rounded-xl border flex items-center justify-between font-mono text-xs transition-all ${
                      isDarkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'
                    }`}
                  >
                    <div className="flex items-center space-x-2 min-w-0 flex-1 pr-2">
                      <span className="px-2 py-0.5 bg-amber-500 text-slate-950 font-extrabold rounded text-[10px] shrink-0">
                        https://tiny.url/{rec.shortCode}
                      </span>
                      <ArrowRight className="w-3 h-3 text-slate-500 shrink-0" />
                      <span className="text-slate-400 truncate text-[11px]">{rec.longUrl}</span>
                    </div>

                    <div className="flex items-center space-x-2 shrink-0">
                      <span className="text-[10px] text-indigo-400 font-bold px-1.5 py-0.5 rounded bg-indigo-500/10">
                        {rec.clickCount} clicks
                      </span>
                      <button
                        onClick={() => handleTestRedirect(rec)}
                        className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-bold rounded-lg transition-all flex items-center space-x-1"
                      >
                        <ExternalLink className="w-3 h-3" />
                        <span>Test Click</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* BOTTOM METRICS */}
            <div className="pt-4 border-t border-slate-200 dark:border-slate-800 grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
              <div className={`p-3 rounded-xl border ${isDarkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
                <span className="text-[10px] text-slate-400 uppercase font-mono font-bold block">Total Created</span>
                <p className="text-sm font-bold font-mono text-amber-400">{totalUrlsCreated.toLocaleString()}</p>
              </div>
              <div className={`p-3 rounded-xl border ${isDarkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
                <span className="text-[10px] text-slate-400 uppercase font-mono font-bold block">Total Redirects</span>
                <p className="text-sm font-bold font-mono text-emerald-400">{totalRedirects.toLocaleString()}</p>
              </div>
              <div className={`p-3 rounded-xl border ${isDarkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
                <span className="text-[10px] text-slate-400 uppercase font-mono font-bold block">Cache Hit Ratio</span>
                <p className="text-sm font-bold font-mono text-indigo-400">
                  {((cacheHits / Math.max(1, totalRedirects)) * 100).toFixed(1)}%
                </p>
              </div>
              <div className={`p-3 rounded-xl border ${isDarkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
                <span className="text-[10px] text-slate-400 uppercase font-mono font-bold block">Collisions</span>
                <p className={`text-sm font-bold font-mono ${collisionsCount > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                  {collisionsCount} Collisions
                </p>
              </div>
            </div>

          </div>

          {/* RIGHT 1 COLUMN: TOOLBOX & ARCHITECTURE TOGGLES */}
          <div className={`p-6 rounded-3xl border space-y-5 ${
            isDarkMode ? 'bg-[#1c1c1e] border-slate-800' : 'bg-white border-slate-200 shadow-xs'
          }`}>
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center space-x-2">
                <Sliders className="w-4 h-4 text-amber-500" />
                <h3 className={`text-sm font-bold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                  Architecture Controls
                </h3>
              </div>
            </div>

            {/* Short Code Strategy Selector */}
            <div className="space-y-2">
              <span className="text-xs font-mono font-bold text-slate-400 block">Short Code Generator Strategy</span>
              {[
                { type: 'HASH_MD5' as CodeGenStrategy, label: '1. Hash (MD5) + Base62', desc: 'Can produce collisions' },
                { type: 'BASE62_COUNTER' as CodeGenStrategy, label: '2. Auto-Inc ID + Base62', desc: 'Predictable & Sequential' },
                { type: 'UUID' as CodeGenStrategy, label: '3. UUID Random String', desc: 'Non-numeric, longer' },
                { type: 'KGS' as CodeGenStrategy, label: '4. Key Generation Service (KGS)', desc: 'Pre-computed offline, 0 collision' },
              ].map((s) => (
                <button
                  key={s.type}
                  onClick={() => setStrategy(s.type)}
                  className={`w-full p-2.5 rounded-xl border text-left transition-all ${
                    strategy === s.type
                      ? 'bg-amber-500 text-slate-950 font-bold border-amber-400 ring-2 ring-amber-500/20 shadow-md'
                      : isDarkMode
                      ? 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
                      : 'bg-slate-50 border-slate-200 text-slate-700 hover:border-slate-300'
                  }`}
                >
                  <div className="text-xs font-bold font-mono">{s.label}</div>
                  <div className="text-[10px] opacity-80">{s.desc}</div>
                </button>
              ))}
            </div>

            {/* Redis Cache Toggle */}
            <div className="space-y-2 pt-2 border-t border-slate-200 dark:border-slate-800">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono font-bold">Redis Caching Layer</span>
                <button
                  onClick={() => setUseCache(!useCache)}
                  className={`px-3 py-1 rounded-full text-xs font-mono font-bold transition-all ${
                    useCache ? 'bg-emerald-500 text-slate-950' : 'bg-slate-800 text-slate-400'
                  }`}
                >
                  {useCache ? 'Enabled' : 'Disabled'}
                </button>
              </div>
            </div>

            {/* HTTP Redirect Type Selector */}
            <div className="space-y-2 pt-2 border-t border-slate-200 dark:border-slate-800">
              <span className="text-xs font-mono font-bold text-slate-400 block">HTTP Redirect Status</span>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setRedirectType('301_PERMANENT')}
                  className={`p-2 rounded-xl border text-xs font-mono font-bold transition-all ${
                    redirectType === '301_PERMANENT'
                      ? 'bg-indigo-600 text-white border-indigo-500'
                      : isDarkMode ? 'bg-slate-950 border-slate-800 text-slate-400' : 'bg-slate-50 border-slate-200 text-slate-600'
                  }`}
                >
                  301 Permanent
                </button>

                <button
                  onClick={() => setRedirectType('302_TEMPORARY')}
                  className={`p-2 rounded-xl border text-xs font-mono font-bold transition-all ${
                    redirectType === '302_TEMPORARY'
                      ? 'bg-indigo-600 text-white border-indigo-500'
                      : isDarkMode ? 'bg-slate-950 border-slate-800 text-slate-400' : 'bg-slate-50 border-slate-200 text-slate-600'
                  }`}
                >
                  302 Temporary
                </button>
              </div>
            </div>

            {/* Traffic Load Simulator Toggle */}
            <div className="space-y-3 pt-3 border-t border-slate-200 dark:border-slate-800">
              <div className="flex items-center justify-between text-xs font-mono font-bold">
                <span>Traffic Load Rate</span>
                <span className="text-amber-400">{trafficRps} Req/Sec</span>
              </div>
              <input
                type="range"
                min={50}
                max={2000}
                step={50}
                value={trafficRps}
                onChange={(e) => setTrafficRps(Number(e.target.value))}
                className="w-full accent-amber-500"
              />

              <button
                onClick={() => setIsSimulating(!isSimulating)}
                className={`w-full py-2.5 rounded-xl text-xs font-mono font-bold shadow-md flex items-center justify-center space-x-1 ${
                  isSimulating
                    ? 'bg-rose-600 hover:bg-rose-500 text-white'
                    : 'bg-emerald-600 hover:bg-emerald-500 text-white'
                }`}
              >
                {isSimulating ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                <span>{isSimulating ? 'Pause Traffic Stream' : 'Start Live Traffic Stream'}</span>
              </button>
            </div>

          </div>

        </div>
      )}

      {/* TAB 2: BASE62 & ENCODING PLAYGROUND */}
      {activeTab === 'base62' && (
        <div className={`p-6 rounded-3xl border space-y-6 ${
          isDarkMode ? 'bg-[#1c1c1e] border-slate-800' : 'bg-white border-slate-200'
        }`}>
          <div className="flex items-center space-x-3 pb-4 border-b border-slate-200 dark:border-slate-800">
            <div className="p-2.5 bg-indigo-500/10 text-indigo-500 rounded-2xl border border-indigo-500/20">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold font-mono">Base62 Encoding Interactive Playground</h3>
              <p className="text-xs text-slate-500 font-mono">Learn how Base62 converts huge auto-increment integer IDs into compact, 100% URL-safe strings.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

            {/* Integer <-> Base62 Converter */}
            <div className={`p-5 rounded-2xl border space-y-4 ${
              isDarkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'
            }`}>
              <span className="text-xs font-mono font-bold text-amber-500 uppercase tracking-wider block">
                Interactive Converter: ID (Integer) ↔ Short Code (Base62)
              </span>

              <div className="space-y-3">
                <div>
                  <label className="text-xs font-mono text-slate-400 block mb-1">
                    Database Integer ID (64-bit auto-increment):
                  </label>
                  <input
                    type="number"
                    value={base62InputNum}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      setBase62InputNum(val);
                      setBase62InputStr(encodeBase62(val));
                    }}
                    className={`w-full px-3 py-2 rounded-xl text-xs font-mono border focus:outline-hidden ${
                      isDarkMode ? 'bg-[#1c1c1e] border-slate-800 text-white' : 'bg-white border-slate-200 text-slate-900'
                    }`}
                  />
                </div>

                <div className="flex items-center justify-center">
                  <ArrowRight className="w-5 h-5 text-amber-500 rotate-90 sm:rotate-0" />
                </div>

                <div>
                  <label className="text-xs font-mono text-slate-400 block mb-1">
                    Generated Base62 Short Code (URL Path):
                  </label>
                  <input
                    type="text"
                    value={base62InputStr}
                    onChange={(e) => {
                      const str = e.target.value;
                      setBase62InputStr(str);
                      setBase62InputNum(decodeBase62(str));
                    }}
                    className={`w-full px-3 py-2 rounded-xl text-xs font-mono font-bold border focus:outline-hidden ${
                      isDarkMode ? 'bg-[#1c1c1e] border-slate-800 text-amber-400' : 'bg-white border-slate-200 text-amber-600'
                    }`}
                  />
                </div>
              </div>

              <div className="p-3 bg-slate-900 text-slate-300 rounded-xl font-mono text-[11px] space-y-1">
                <p>Math Calculation Step-by-Step:</p>
                <p className="text-amber-400 font-bold">
                  {base62InputNum} ÷ 62 = {Math.floor(base62InputNum / 62)} (Remainder: {base62InputNum % 62} → '{BASE62_ALPHABET[base62InputNum % 62]}')
                </p>
                <p className="text-slate-400">Total capacity for 7 Base62 digits = 62⁷ = 3,521,614,606,208 URLs (~3.5 Trillion!)</p>
              </div>
            </div>

            {/* Base62 Character Matrix Visualizer */}
            <div className={`p-5 rounded-2xl border space-y-3 ${
              isDarkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'
            }`}>
              <span className="text-xs font-mono font-bold text-slate-400 uppercase tracking-wider block">
                Base62 Alphabet Matrix (62 Characters: 0-9, a-z, A-Z)
              </span>

              <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 font-mono text-xs flex flex-wrap gap-1 max-h-[180px] overflow-y-auto">
                {BASE62_ALPHABET.split('').map((char, idx) => (
                  <span
                    key={char}
                    className={`px-1.5 py-0.5 rounded text-[11px] font-bold ${
                      base62InputStr.includes(char)
                        ? 'bg-amber-500 text-slate-950 font-black scale-110'
                        : 'bg-slate-800 text-slate-400'
                    }`}
                    title={`Index ${idx} -> '${char}'`}
                  >
                    {char}
                  </span>
                ))}
              </div>

              <div className="space-y-1 text-[11px] font-mono text-slate-400 pt-2 border-t border-slate-800">
                <p>Why not Base64? Base64 includes <span className="text-rose-400 font-bold">+ / =</span> which require percent-encoding in browser URLs.</p>
                <p>Why not Hexadecimal? Hex only provides 16 chars (0-9, a-f). A 7-char Hex code holds only 268 Million URLs vs 3.5 Trillion in Base62!</p>
              </div>
            </div>

          </div>

          {/* CAPACITY COMPARISON TABLE */}
          <div className="space-y-3 pt-4 border-t border-slate-200 dark:border-slate-800">
            <span className="text-xs font-mono font-bold text-slate-400 uppercase tracking-wider block">
              Encoding Scheme Comparison Matrix (Length = 7 Characters)
            </span>

            <div className="overflow-x-auto">
              <table className="w-full font-mono text-xs text-left">
                <thead>
                  <tr className={`border-b ${isDarkMode ? 'border-slate-800 text-slate-400' : 'border-slate-200 text-slate-600'}`}>
                    <th className="p-2.5">Encoding</th>
                    <th className="p-2.5">Alphabet Size</th>
                    <th className="p-2.5">7-Char URL Capacity</th>
                    <th className="p-2.5">URL Safe?</th>
                    <th className="p-2.5">Assessment</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className={`border-b ${isDarkMode ? 'border-slate-800/60' : 'border-slate-200/60'}`}>
                    <td className="p-2.5 font-bold text-amber-400">Base62</td>
                    <td className="p-2.5">62 (0-9, a-z, A-Z)</td>
                    <td className="p-2.5 font-bold text-emerald-400">3.52 Trillion URLs</td>
                    <td className="p-2.5 text-emerald-400 font-bold">100% Safe</td>
                    <td className="p-2.5 text-emerald-400 font-bold">Industry Gold Standard</td>
                  </tr>
                  <tr className={`border-b ${isDarkMode ? 'border-slate-800/60' : 'border-slate-200/60'}`}>
                    <td className="p-2.5">Hexadecimal</td>
                    <td className="p-2.5">16 (0-9, a-f)</td>
                    <td className="p-2.5 text-rose-400">268.4 Million URLs</td>
                    <td className="p-2.5 text-emerald-400 font-bold">100% Safe</td>
                    <td className="p-2.5 text-rose-400">Capacity too small</td>
                  </tr>
                  <tr className={`border-b ${isDarkMode ? 'border-slate-800/60' : 'border-slate-200/60'}`}>
                    <td className="p-2.5">Base64</td>
                    <td className="p-2.5">64 (0-9, a-z, A-Z, +, /)</td>
                    <td className="p-2.5">4.39 Trillion URLs</td>
                    <td className="p-2.5 text-rose-400 font-bold">Unsafe (+ and /)</td>
                    <td className="p-2.5 text-rose-400">Requires URL escaping</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

        </div>
      )}

      {/* TAB 3: COLLISION LABORATORY & KGS LAB */}
      {activeTab === 'collision' && (
        <div className={`p-6 rounded-3xl border space-y-6 ${
          isDarkMode ? 'bg-[#1c1c1e] border-slate-800' : 'bg-white border-slate-200'
        }`}>
          <div className="flex items-center space-x-3 pb-4 border-b border-slate-200 dark:border-slate-800">
            <div className="p-2.5 bg-rose-500/10 text-rose-500 rounded-2xl border border-rose-500/20">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold font-mono">Hash Collision Laboratory &amp; Key Generation Service (KGS)</h3>
              <p className="text-xs text-slate-500 font-mono">Compare collision resolution strategies and understand how KGS pre-allocates keys offline.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

            {/* Strategy Comparison */}
            <div className={`p-5 rounded-2xl border space-y-3 ${
              isDarkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'
            }`}>
              <span className="text-xs font-mono font-bold text-amber-500 uppercase tracking-wider block">
                1. Hash + Salt &amp; Retry Strategy
              </span>
              <p className="text-xs text-slate-400 leading-relaxed">
                When MD5/SHA256 truncated hash collisions occur, append a predefined salt (e.g. `longUrl + salt`), re-hash, and check the database again. Repeat until a unique code is found.
              </p>
              <div className="p-3 bg-slate-900 rounded-xl font-mono text-[11px] text-slate-300 space-y-1">
                <p className="text-rose-400">Drawback: Requires multiple expensive DB queries per insertion!</p>
              </div>
            </div>

            {/* KGS Pre-Allocation */}
            <div className={`p-5 rounded-2xl border space-y-3 ${
              isDarkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'
            }`}>
              <span className="text-xs font-mono font-bold text-emerald-400 uppercase tracking-wider block">
                2. Key Generation Service (KGS) Offline Pool
              </span>
              <p className="text-xs text-slate-400 leading-relaxed">
                Pre-generate billions of unique 6-7 character keys offline in a specialized KGS database. Load key batches (e.g. 10,000 keys) directly into memory on API servers for instant 0-collision assignment!
              </p>
              <div className="p-3 bg-slate-900 rounded-xl font-mono text-[11px] text-emerald-400 space-y-1">
                <p>Advantage: 0 Hash Collisions, 0 Runtime DB Lookup Queries, Sub-millisecond response!</p>
              </div>
            </div>

          </div>

          <div className={`p-4 rounded-2xl border space-y-2 ${
            isDarkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'
          }`}>
            <span className="text-xs font-mono font-bold text-indigo-400 uppercase tracking-wider block">
              Bloom Filter Guardrail (Pre-DB Existence Check)
            </span>
            <p className="text-xs text-slate-400 leading-relaxed">
              Bloom filter cheaply answers "definitely not present" so we skip database collision lookups for most new codes. "Maybe present" still requires DB verification.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 font-mono text-[11px]">
              <div className={`p-2 rounded-lg border ${isDarkMode ? 'bg-[#1c1c1e] border-slate-800 text-slate-300' : 'bg-white border-slate-200 text-slate-700'}`}>
                Bloom checks: <strong>{bloomFilterChecks}</strong>
              </div>
              <div className={`p-2 rounded-lg border ${isDarkMode ? 'bg-[#1c1c1e] border-slate-800 text-slate-300' : 'bg-white border-slate-200 text-slate-700'}`}>
                DB reads bypassed: <strong>{bloomFilterBypassReads}</strong>
              </div>
            </div>
          </div>

        </div>
      )}

      {/* TAB 4: REDIRECT LAB - 301 VS 302 */}
      {activeTab === 'redirect' && (
        <div className={`p-6 rounded-3xl border space-y-6 ${
          isDarkMode ? 'bg-[#1c1c1e] border-slate-800' : 'bg-white border-slate-200'
        }`}>
          <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-800">
            <div className="flex items-center space-x-3">
              <div className="p-2.5 bg-emerald-500/10 text-emerald-500 rounded-2xl border border-emerald-500/20">
                <MousePointer className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold font-mono">HTTP 301 Moved Permanently vs 302 Found Laboratory</h3>
                <p className="text-xs text-slate-500 font-mono">Simulate browser caching behavior and see why 301 destroys analytics tracking while 302 preserves it.</p>
              </div>
            </div>

            {/* Toggle Status */}
            <div className="flex items-center space-x-2">
              <button
                onClick={() => {
                  setRedirectType('301_PERMANENT');
                  setRedirectSimClicks([]);
                }}
                className={`px-3 py-1.5 rounded-xl font-mono text-xs font-bold transition-all ${
                  redirectType === '301_PERMANENT' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400'
                }`}
              >
                Test HTTP 301
              </button>

              <button
                onClick={() => {
                  setRedirectType('302_TEMPORARY');
                  setRedirectSimClicks([]);
                }}
                className={`px-3 py-1.5 rounded-xl font-mono text-xs font-bold transition-all ${
                  redirectType === '302_TEMPORARY' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400'
                }`}
              >
                Test HTTP 302
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

            {/* Live Interactive Click Simulator */}
            <div className={`p-5 rounded-2xl border space-y-4 ${
              isDarkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'
            }`}>
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono font-bold text-amber-500 uppercase">
                  Click Traffic Simulator ({redirectType === '301_PERMANENT' ? '301 Permanent' : '302 Found'})
                </span>
                <button
                  onClick={handleSimulateRedirectClick}
                  className="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black rounded-xl text-xs font-mono transition-all flex items-center space-x-1"
                >
                  <MousePointer className="w-3.5 h-3.5" />
                  <span>Simulate User Click #{redirectSimClicks.length + 1}</span>
                </button>
              </div>

              {/* Click History Log */}
              <div className="space-y-1.5 max-h-[220px] overflow-y-auto pr-1">
                {redirectSimClicks.map((clk) => (
                  <div
                    key={clk.id}
                    className={`p-2 rounded-xl border flex items-center justify-between font-mono text-xs ${
                      clk.hitServer
                        ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                        : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                    }`}
                  >
                    <span>Click #{clk.id}</span>
                    <span>{clk.hitServer ? 'HITS SERVER (Logged Analytics)' : 'BROWSER LOCAL CACHE (Bypassed Server)'}</span>
                    <span className="font-bold">{clk.latency}ms</span>
                  </div>
                ))}

                {redirectSimClicks.length === 0 && (
                  <p className="text-xs font-mono text-slate-500 text-center py-6">
                    Click the button above to simulate user visits under {redirectType}.
                  </p>
                )}
              </div>
            </div>

            {/* Explanation & Tradeoff Matrix */}
            <div className={`p-5 rounded-2xl border space-y-3 ${
              isDarkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'
            }`}>
              <span className="text-xs font-mono font-bold text-slate-400 uppercase tracking-wider block">
                Tradeoff Comparison: HTTP 301 vs HTTP 302
              </span>

              <div className="space-y-2 text-xs font-mono leading-relaxed">
                <div className="p-3 bg-indigo-950/60 border border-indigo-500/30 text-indigo-300 rounded-xl">
                  <p className="font-bold text-amber-400 mb-1">HTTP 301 (Moved Permanently):</p>
                  <p>Browser caches the redirect target locally. Subsequent clicks bypass your server completely! Reduces server CPU load, BUT prevents click analytics logging.</p>
                </div>

                <div className="p-3 bg-emerald-950/60 border border-emerald-500/30 text-emerald-300 rounded-xl">
                  <p className="font-bold text-emerald-400 mb-1">HTTP 302 (Found / Temporary):</p>
                  <p>Browser sends EVERY click to your URL shortener server. Server logs click location, device, referrer, and redirects. Higher server load, BUT 100% accurate analytics.</p>
                </div>
              </div>
            </div>

          </div>

        </div>
      )}

      {/* TAB 5: REQUEST CONSOLE & ASYNC ANALYTICS */}
      {activeTab === 'analytics' && (
        <div className={`p-6 rounded-3xl border space-y-6 ${
          isDarkMode ? 'bg-[#1c1c1e] border-slate-800' : 'bg-white border-slate-200'
        }`}>
          <div className="flex items-center space-x-3 pb-4 border-b border-slate-200 dark:border-slate-800">
            <div className="p-2.5 bg-slate-800 text-white rounded-2xl border border-slate-700">
              <Terminal className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold font-mono">Live Request Console &amp; Asynchronous Kafka Analytics</h3>
              <p className="text-xs text-slate-500 font-mono">Real-time HTTP request log stream decoupled from click analytics through Kafka message queue.</p>
            </div>
          </div>

          <div className={`p-4 rounded-2xl border ${
            isDarkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'
          }`}>
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-mono font-bold text-amber-500 uppercase tracking-wider">Hot-key Mitigation Playbook</span>
              {hottestUrlRecord && (
                <span className="text-[10px] font-mono text-slate-400">
                  Hottest: /{hottestUrlRecord.shortCode} ({hottestUrlRecord.clickCount} clicks)
                </span>
              )}
            </div>
            <div className="text-xs font-mono text-slate-400 mt-2 space-y-1">
              <p>1. Warm top redirect keys into Redis before campaigns go live.</p>
              <p>2. Replicate hot ranges to read replicas and route with locality-aware LB.</p>
              <p>3. Push top short-code mappings to edge cache when hit rate spikes.</p>
            </div>
          </div>

          <div className="space-y-3">
            <span className="text-xs font-mono font-bold text-slate-400 uppercase tracking-wider block">
              HTTP Live Stream Log Console (`/shorten` &amp; `/{`shortCode`}`)
            </span>

            <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 font-mono text-xs space-y-2 max-h-[300px] overflow-y-auto">
              {requestLogs.map((log) => (
                <div key={log.id} className="flex items-center justify-between border-b border-slate-800/80 pb-1.5 text-[11px]">
                  <div className="flex items-center space-x-2 min-w-0">
                    <span className="text-slate-500">{log.timestamp}</span>
                    <span className={`px-1.5 py-0.5 rounded font-black ${
                      log.method === 'POST' ? 'bg-indigo-500/20 text-indigo-400' : 'bg-amber-500/20 text-amber-400'
                    }`}>
                      {log.method}
                    </span>
                    <span className="text-slate-300 truncate">{log.path}</span>
                    <span className={`px-1.5 py-0.5 rounded font-bold ${
                      log.statusCode === 201 ? 'bg-emerald-500/20 text-emerald-400' : 'bg-blue-500/20 text-blue-400'
                    }`}>
                      {log.statusCode}
                    </span>
                  </div>

                  <div className="flex items-center space-x-3 shrink-0 text-slate-400 text-[10px]">
                    <span>{log.country}</span>
                    <span>{log.device}</span>
                    <span className="text-amber-400 font-bold">{log.latencyMs}ms</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>
      )}

      {/* TAB 6: ARCHITECT CHALLENGE & QUIZ */}
      {activeTab === 'quiz' && (
        <div className={`p-6 rounded-3xl border space-y-6 ${
          isDarkMode ? 'bg-[#1c1c1e] border-slate-800' : 'bg-white border-slate-200'
        }`}>
          <div className="flex items-center space-x-3 pb-4 border-b border-slate-200 dark:border-slate-800">
            <div className="p-2.5 bg-amber-500/10 text-amber-500 rounded-2xl border border-amber-500/20">
              <Award className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold font-mono">Chapter 8 System Architect Assessment</h3>
              <p className="text-xs text-slate-500 font-mono">Test your mastery of URL Shortener design trade-offs, Base62, 301/302 redirects, and KGS.</p>
            </div>
          </div>

          <div className={`p-6 rounded-2xl border space-y-4 ${
            isDarkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'
          }`}>
            <span className="text-xs font-mono font-bold text-amber-500 uppercase">
              Question {stage} of 10
            </span>
            <h4 className="text-sm font-bold font-mono text-white">
              {currentQuiz.question}
            </h4>

            <div className="space-y-2 pt-2">
              {currentQuiz.options.map((opt, idx) => (
                <button
                  key={idx}
                  onClick={() => alert(idx === currentQuiz.correct ? "✅ Correct! " + currentQuiz.explanation : "❌ Incorrect. Try again!")}
                  className={`w-full p-3 rounded-xl border text-left font-mono text-xs transition-all ${
                    isDarkMode ? 'bg-[#1c1c1e] border-slate-800 text-slate-300 hover:border-amber-500/50' : 'bg-white border-slate-200 text-slate-800 hover:border-amber-500/50'
                  }`}
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>

        </div>
      )}

    </div>
  );
};
