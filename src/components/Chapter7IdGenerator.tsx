import React, { useState, useEffect, useRef } from 'react';
import {
  Hash,
  Server,
  Cpu,
  Clock,
  Layers,
  Zap,
  Activity,
  AlertTriangle,
  CheckCircle2,
  Play,
  Pause,
  RotateCcw,
  Sparkles,
  ArrowRight,
  Shield,
  Sliders,
  Terminal,
  Award,
  Database,
  Globe,
  Plus,
  RefreshCw,
  ZapOff,
  GitBranch,
  Info,
  ChevronRight,
  ChevronDown,
  Lock,
  Copy,
  Check
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface Chapter7IdGeneratorProps {
  isDarkMode?: boolean;
}

export type StrategyType = 'AUTO_INCREMENT' | 'AUTO_INC_OFFSET' | 'UUID' | 'TICKET_SERVER' | 'SNOWFLAKE';

export interface GeneratedIdRecord {
  id: string;
  strategy: StrategyType;
  decimalValue: string;
  binary64: string;
  timestampMs: number;
  datacenterId: number;
  machineId: number;
  sequence: number;
  formattedUtc: string;
  workerName: string;
  isCollision: boolean;
  timeTakenMs: number;
}

export interface WorkerNode {
  id: string;
  name: string;
  datacenterId: number;
  machineId: number;
  ip: string;
  status: 'healthy' | 'clock_drift' | 'overloaded' | 'offline';
  requestsPerSec: number;
  clockOffsetMs: number;
  lastSequence: number;
  lastTimestampMs: number;
}

export const Chapter7IdGenerator: React.FC<Chapter7IdGeneratorProps> = ({ isDarkMode = false }) => {
  // --- STAGE PROGRESSION (1 to 5) ---
  const [stage, setStage] = useState<number>(1);
  const [activeTab, setActiveTab] = useState<'canvas' | 'builder' | 'clock' | 'sequence' | 'logs' | 'quiz'>('canvas');

  // Active Generator Strategy
  const [strategy, setStrategy] = useState<StrategyType>('AUTO_INCREMENT');

  // Snowflake Bit Configuration (Standard Snowflake: 1 sign + 41 timestamp + 5 DC + 5 Machine + 12 sequence = 64)
  const [timestampBits, setTimestampBits] = useState<number>(41);
  const [datacenterBits, setDatacenterBits] = useState<number>(5);
  const [machineBits, setMachineBits] = useState<number>(5);
  const [sequenceBits, setSequenceBits] = useState<number>(12);

  // Custom Epoch (Twitter Epoch default: 1288834974657 ms -> Nov 04 2010)
  const [customEpochMs, setCustomEpochMs] = useState<number>(1288834974657);
  const [selectedEpochName, setSelectedEpochName] = useState<'twitter' | 'custom2026' | 'unix'>('twitter');

  // Interactive Simulation Controls
  const [isSimulating, setIsSimulating] = useState<boolean>(true);
  const [trafficRateRps, setTrafficRateRps] = useState<number>(500); // Requests per sec
  const [selectedWorkerId, setSelectedWorkerId] = useState<string>('worker-dc1-m0');

  // Clock Drift / Failure Testing State
  const [clockOffsetMs, setClockOffsetMs] = useState<number>(0); // Negative = backward drift
  const [clockDriftAction, setClockDriftAction] = useState<'WAIT' | 'REFUSE' | 'BACKUP_WORKER'>('WAIT');

  // Sequence Overflow Lab State
  const [seqBurstCount, setSeqBurstCount] = useState<number>(100);

  // Generated ID Records History
  const [idLogs, setIdLogs] = useState<GeneratedIdRecord[]>([]);
  const [selectedRecord, setSelectedRecord] = useState<GeneratedIdRecord | null>(null);

  // Auto increment counter state for naive strategies
  const autoIncCounterRef = useRef<number>(1000);
  const ticketServerCounterRef = useRef<number>(5000000);

  // Workers List
  const [workers, setWorkers] = useState<WorkerNode[]>([
    { id: 'worker-dc1-m0', name: 'DC1 - Worker 0', datacenterId: 1, machineId: 0, ip: '10.1.0.1', status: 'healthy', requestsPerSec: 240, clockOffsetMs: 0, lastSequence: 0, lastTimestampMs: Date.now() },
    { id: 'worker-dc1-m1', name: 'DC1 - Worker 1', datacenterId: 1, machineId: 1, ip: '10.1.0.2', status: 'healthy', requestsPerSec: 180, clockOffsetMs: 0, lastSequence: 0, lastTimestampMs: Date.now() },
    { id: 'worker-dc2-m0', name: 'DC2 - Worker 0', datacenterId: 2, machineId: 0, ip: '10.2.0.1', status: 'healthy', requestsPerSec: 310, clockOffsetMs: 0, lastSequence: 0, lastTimestampMs: Date.now() },
    { id: 'worker-dc3-m0', name: 'DC3 - Worker 0', datacenterId: 3, machineId: 0, ip: '10.3.0.1', status: 'healthy', requestsPerSec: 150, clockOffsetMs: 0, lastSequence: 0, lastTimestampMs: Date.now() },
  ]);

  // Statistics
  const [totalGenerated, setTotalGenerated] = useState<number>(1420);
  const [collisionsCount, setCollisionsCount] = useState<number>(0);
  const [activeRequestPacket, setActiveRequestPacket] = useState<{
    id: string;
    workerName: string;
    value: string;
    type: StrategyType;
  } | null>(null);

  // Synchronize strategy with Stage changes
  useEffect(() => {
    if (stage === 1) setStrategy('AUTO_INCREMENT');
    if (stage === 2) setStrategy('AUTO_INC_OFFSET');
    if (stage === 3) setStrategy('UUID');
    if (stage === 4) setStrategy('TICKET_SERVER');
    if (stage === 5) setStrategy('SNOWFLAKE');
  }, [stage]);

  // Derived Calculations for Snowflake Bit Allocation
  const maxSequence = Math.pow(2, sequenceBits) - 1; // e.g. 2^12 - 1 = 4095
  const maxDatacenters = Math.pow(2, datacenterBits); // e.g. 2^5 = 32
  const maxMachines = Math.pow(2, machineBits); // e.g. 2^5 = 32
  const maxTimestampRangeMs = Math.pow(2, timestampBits); // e.g. 2^41 = ~2.19 x 10^12 ms (~69.7 years)
  const remainingYears = (maxTimestampRangeMs / (1000 * 60 * 60 * 24 * 365.25)).toFixed(1);
  const overflowDate = new Date(customEpochMs + maxTimestampRangeMs).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });

  // Handle Epoch Presets
  const handleEpochChange = (preset: 'twitter' | 'custom2026' | 'unix') => {
    setSelectedEpochName(preset);
    if (preset === 'twitter') setCustomEpochMs(1288834974657); // Nov 04 2010
    if (preset === 'custom2026') setCustomEpochMs(1767225600000); // Jan 01 2026
    if (preset === 'unix') setCustomEpochMs(0); // Jan 01 1970
  };

  // Helper to generate a single ID according to strategy
  const generateSingleId = (worker: WorkerNode): GeneratedIdRecord | null => {
    const now = Date.now() + worker.clockOffsetMs;
    const formattedUtc = new Date(now).toISOString();

    if (strategy === 'AUTO_INCREMENT') {
      autoIncCounterRef.current += 1;
      const num = autoIncCounterRef.current;
      // In multi-db environment without offset, collisions occur if multiple workers generate same sequence!
      const isCol = Math.random() < 0.25; // 25% collision chance in naive multi-node auto-inc
      return {
        id: Math.random().toString(),
        strategy,
        decimalValue: num.toString(),
        binary64: num.toString(2).padStart(64, '0'),
        timestampMs: now,
        datacenterId: worker.datacenterId,
        machineId: worker.machineId,
        sequence: num % 1000,
        formattedUtc,
        workerName: worker.name,
        isCollision: isCol,
        timeTakenMs: 0.1
      };
    }

    if (strategy === 'AUTO_INC_OFFSET') {
      autoIncCounterRef.current += 2; // Step by offset
      const num = autoIncCounterRef.current + (worker.machineId % 2);
      return {
        id: Math.random().toString(),
        strategy,
        decimalValue: num.toString(),
        binary64: num.toString(2).padStart(64, '0'),
        timestampMs: now,
        datacenterId: worker.datacenterId,
        machineId: worker.machineId,
        sequence: num % 1000,
        formattedUtc,
        workerName: worker.name,
        isCollision: false,
        timeTakenMs: 0.2
      };
    }

    if (strategy === 'UUID') {
      // 128-bit Random UUID v4 mockup
      const u1 = Math.floor(Math.random() * 0xffffffff).toString(16).padStart(8, '0');
      const u2 = Math.floor(Math.random() * 0xffff).toString(16).padStart(4, '0');
      const u3 = Math.floor(Math.random() * 0xffff).toString(16).padStart(4, '0');
      const u4 = Math.floor(Math.random() * 0xffffffff).toString(16).padStart(8, '0');
      const uuidStr = `${u1}-${u2}-4${u3.slice(1)}-${u4}`;

      return {
        id: Math.random().toString(),
        strategy,
        decimalValue: uuidStr,
        binary64: '128-bit UUID (Non-integer, Random high-entropy bit string)',
        timestampMs: now,
        datacenterId: worker.datacenterId,
        machineId: worker.machineId,
        sequence: Math.floor(Math.random() * 9999),
        formattedUtc,
        workerName: worker.name,
        isCollision: false,
        timeTakenMs: 0.4
      };
    }

    if (strategy === 'TICKET_SERVER') {
      ticketServerCounterRef.current += 1;
      const num = ticketServerCounterRef.current;
      return {
        id: Math.random().toString(),
        strategy,
        decimalValue: num.toString(),
        binary64: num.toString(2).padStart(64, '0'),
        timestampMs: now,
        datacenterId: 1,
        machineId: 0,
        sequence: num,
        formattedUtc,
        workerName: 'Central Ticket Server',
        isCollision: false,
        timeTakenMs: 22.5 // High latency due to network roundtrip to single server
      };
    }

    // STRATEGY: TWITTER SNOWFLAKE
    if (strategy === 'SNOWFLAKE') {
      // Check Clock Rollback
      if (now < worker.lastTimestampMs) {
        if (clockDriftAction === 'REFUSE') {
          return null; // Clock moved backward! Refuse generation
        }
      }

      // Calculate relative timestamp from custom epoch
      let timeDiff = now - customEpochMs;
      if (timeDiff < 0) timeDiff = 0;

      // Handle sequence increment within same millisecond
      let seq = worker.lastSequence;
      if (now === worker.lastTimestampMs) {
        seq = (seq + 1) & maxSequence;
        if (seq === 0) {
          // Sequence overflow in same millisecond! Must wait or drift
          timeDiff += 1;
        }
      } else {
        seq = 0;
      }

      // Update worker last sequence & timestamp
      worker.lastSequence = seq;
      worker.lastTimestampMs = now;

      // Bit shifting math for 64-bit ID
      // 0 (1 sign) + Timestamp (41 bits) + DC (5 bits) + Machine (5 bits) + Sequence (12 bits)
      // BigInt math to prevent 32-bit bitwise truncation in JS
      const timeBitShift = BigInt(datacenterBits + machineBits + sequenceBits);
      const dcBitShift = BigInt(machineBits + sequenceBits);
      const machineBitShift = BigInt(sequenceBits);

      const timestampPart = (BigInt(timeDiff) & ((1n << BigInt(timestampBits)) - 1n)) << timeBitShift;
      const dcPart = (BigInt(worker.datacenterId) & ((1n << BigInt(datacenterBits)) - 1n)) << dcBitShift;
      const machinePart = (BigInt(worker.machineId) & ((1n << BigInt(machineBits)) - 1n)) << machineBitShift;
      const seqPart = BigInt(seq) & ((1n << BigInt(sequenceBits)) - 1n);

      const finalSnowflakeBigInt = timestampPart | dcPart | machinePart | seqPart;

      // Convert to binary 64-bit string
      const binary64 = finalSnowflakeBigInt.toString(2).padStart(64, '0');

      return {
        id: Math.random().toString(),
        strategy,
        decimalValue: finalSnowflakeBigInt.toString(),
        binary64,
        timestampMs: now,
        datacenterId: worker.datacenterId,
        machineId: worker.machineId,
        sequence: seq,
        formattedUtc,
        workerName: worker.name,
        isCollision: false,
        timeTakenMs: 0.05
      };
    }

    return null;
  };

  // Trigger ID Generation Action
  const triggerManualGeneration = () => {
    const activeWorker = workers.find(w => w.id === selectedWorkerId) || workers[0];
    const newRecord = generateSingleId(activeWorker);

    if (newRecord) {
      if (newRecord.isCollision) {
        setCollisionsCount(c => c + 1);
      }
      setTotalGenerated(t => t + 1);
      setIdLogs(prev => [newRecord, ...prev.slice(0, 49)]);
      setSelectedRecord(newRecord);

      // Trigger packet animation
      setActiveRequestPacket({
        id: newRecord.id,
        workerName: newRecord.workerName,
        value: newRecord.decimalValue,
        type: newRecord.strategy
      });

      setTimeout(() => setActiveRequestPacket(null), 1500);
    }
  };

  // Live simulation heartbeat
  useEffect(() => {
    if (!isSimulating) return;

    const interval = setInterval(() => {
      const randomWorker = workers[Math.floor(Math.random() * workers.length)];
      const record = generateSingleId(randomWorker);

      if (record) {
        if (record.isCollision) {
          setCollisionsCount(c => c + 1);
        }
        setTotalGenerated(t => t + 1);
        setIdLogs(prev => [record, ...prev.slice(0, 49)]);
      }
    }, Math.max(100, 10000 / trafficRateRps));

    return () => clearInterval(interval);
  }, [isSimulating, trafficRateRps, workers, strategy, timestampBits, datacenterBits, machineBits, sequenceBits, customEpochMs]);

  // Stage Guidance Content
  const stageGuide = [
    {
      stage: 1,
      title: 'Stage 1: Single Database Auto-Increment',
      problem: 'Single database uses AUTO_INCREMENT (1, 2, 3...). When traffic explodes and you add 4 database shards, every shard tries to generate ID #1, creating catastrophic ID collisions!',
      solution: 'Assign different offsets to each database server (e.g. Server A=1,3,5; Server B=2,4,6).',
      question: 'Why does naive AUTO_INCREMENT break in sharded environments?'
    },
    {
      stage: 2,
      title: 'Stage 2: Multi-Master Replication with Offsets',
      problem: 'Server A generates odd IDs (1, 3, 5), Server B generates even IDs (2, 4, 6). When Server C joins, rebalancing offsets is extremely complex and IDs lose overall time ordering.',
      solution: 'Switch to a coordinate-free 128-bit UUID or centralized generator.',
      question: 'What happens when you add a 5th server to an offset-based auto-increment cluster?'
    },
    {
      stage: 3,
      title: 'Stage 3: UUID (128-bit Random)',
      problem: 'UUIDs are 128-bit strings (e.g. f47ac10b-58cc-4372-a567-0e02b2c3d479). They eliminate collisions, BUT they are 16 bytes, non-numeric, and destroy B-Tree database index insertion performance due to randomness!',
      solution: 'Introduce a centralized Ticket Server (Flickr model) or Snowflake generator.',
      question: 'Why do random UUIDs cause severe database index page splitting and memory bloat?'
    },
    {
      stage: 4,
      title: 'Stage 4: Centralized Ticket Server (Flickr Pattern)',
      problem: 'A single dedicated database server issues central auto-increment IDs. Ordering is perfect and 64-bit! BUT if the Ticket Server crashes, the entire global app stops working (Single Point of Failure).',
      solution: 'Eliminate centralized bottlenecks with Twitter Snowflake bit allocation!',
      question: 'What is the primary vulnerability of relying on a centralized Ticket Server?'
    },
    {
      stage: 5,
      title: 'Stage 5: Twitter Snowflake (64-bit Decentralized)',
      problem: 'How do you generate 64-bit numeric IDs across thousands of machines without coordination, with 100% uniqueness and time ordering?',
      solution: 'Divide 64 bits: 1 Sign Bit + 41-bit Timestamp + 5-bit Datacenter ID + 5-bit Machine ID + 12-bit Sequence.',
      question: 'How does Twitter Snowflake achieve 4,096 IDs per millisecond per machine without locks?'
    }
  ];

  const currentGuide = stageGuide[stage - 1];

  // Quizzes
  const quizzes = [
    {
      stage: 1,
      question: "Why does standard SQL AUTO_INCREMENT fail in a multi-master distributed database?",
      options: [
        "A. SQL databases do not support numbers over 1000",
        "B. Independent database nodes generate identical integer IDs concurrently, causing primary key collisions",
        "C. Auto-increment consumes too much CPU memory",
        "D. Auto-increment only works on Windows operating systems"
      ],
      correct: 1,
      explanation: "Without central coordination or offset rules, multiple database nodes will assign the same auto-increment ID to different records."
    },
    {
      stage: 2,
      question: "In Multi-Master Auto-Increment with Offsets (Step = N), what is the biggest drawback when scaling?",
      options: [
        "A. Adding or removing database nodes requires reconfiguring step sizes across all servers and rebalancing IDs",
        "B. Offsets double the storage size of every record",
        "C. Offsets require an internet connection to work",
        "D. Offsets cannot generate even numbers"
      ],
      correct: 0,
      explanation: "Changing node counts breaks the offset step formula (ID % N = ServerID), requiring painful cluster-wide reconfigurations."
    },
    {
      stage: 3,
      question: "Why are UUID v4 identifiers suboptimal as primary keys in high-throughput relational databases?",
      options: [
        "A. UUIDs cannot be stored in modern databases",
        "B. Their 128-bit size increases index storage, and random ordering causes constant B-Tree index fragmentation & page splits",
        "C. UUIDs can only be generated once per minute",
        "D. UUIDs do not contain letters"
      ],
      correct: 1,
      explanation: "Random UUIDs insert data randomly across index pages, causing frequent disk page splitting and cache thrashing."
    },
    {
      stage: 4,
      question: "What is the primary architectural risk of a Flickr-style Ticket Server?",
      options: [
        "A. It generates duplicate IDs every 10 seconds",
        "B. It forms a Single Point of Failure (SPOF) and a high-latency cross-region network bottleneck",
        "C. It cannot generate 64-bit numbers",
        "D. It requires complex vector clock reconciliation"
      ],
      correct: 1,
      explanation: "If the central Ticket Server goes down or experiences network latency, all write operations across the entire application fail."
    },
    {
      stage: 5,
      question: "In standard Twitter Snowflake (41-bit timestamp, 5-bit DC, 5-bit Machine, 12-bit Sequence), how many IDs can 1 worker generate in 1 millisecond?",
      options: [
        "A. 1 ID",
        "B. 256 IDs",
        "C. 4,096 IDs (2^12)",
        "D. 1,000,000 IDs"
      ],
      correct: 2,
      explanation: "12 sequence bits allow 2^12 = 4,096 unique sequence numbers (0 to 4095) per millisecond on each machine."
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
                CHAPTER 7
              </span>
              <span className={`text-xs font-mono font-semibold ${isDarkMode ? 'text-amber-400' : 'text-amber-700'}`}>
                Distributed Unique ID Generation
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold tracking-tight">
              Design Twitter Snowflake &amp; Distributed IDs
            </h1>
            <p className={`text-xs sm:text-sm leading-relaxed ${isDarkMode ? 'text-slate-300' : 'text-slate-600'}`}>
              Master global scale ID generation. Evolve naive Auto-Increment &amp; UUIDs into Twitter Snowflake—allocating 64 bits across timestamp, datacenter, machine, and sequence for 100% collision-free, time-ordered, sub-millisecond generation.
            </p>
          </div>

          {/* Stage Progression Pills (1 to 5) */}
          <div className={`flex flex-wrap items-center gap-1.5 shrink-0 p-2.5 rounded-2xl border ${
            isDarkMode ? 'bg-slate-950/60 backdrop-blur-md border-amber-500/20' : 'bg-slate-100 border-slate-300'
          }`}>
            {[1, 2, 3, 4, 5].map((stg) => (
              <button
                key={stg}
                onClick={() => setStage(stg)}
                className={`w-9 h-9 rounded-xl font-mono text-xs font-bold transition-all flex items-center justify-center ${
                  stage === stg
                    ? 'bg-amber-500 text-slate-950 shadow-lg scale-105 font-black'
                    : stage > stg
                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                    : isDarkMode ? 'text-slate-500 hover:text-white' : 'text-slate-400 hover:text-slate-800'
                }`}
                title={`Jump to Stage ${stg}`}
              >
                Stg {stg}
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
              <Hash className="w-5 h-5" />
            </div>
            <div>
              <h2 className={`text-base font-bold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                {currentGuide.title}
              </h2>
              <p className="text-xs text-slate-500 font-mono">
                Distributed Systems ID Generator Blueprint
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
              disabled={stage === 5}
              onClick={() => setStage(prev => Math.min(5, prev + 1))}
              className={`px-4 py-1.5 bg-amber-500 hover:bg-amber-600 text-slate-950 font-black rounded-xl text-xs font-mono transition-all shadow-md ${
                stage === 5 ? 'opacity-40 cursor-not-allowed' : ''
              }`}
            >
              Next Stage →
            </button>
          </div>
        </div>

        <div className={`p-3.5 rounded-2xl border text-xs leading-relaxed ${
          isDarkMode ? 'bg-slate-950 border-slate-800 text-slate-300' : 'bg-slate-50 border-slate-200 text-slate-700'
        }`}>
          <p className="mb-1"><strong>Challenge:</strong> {currentGuide.problem}</p>
          <p className="text-amber-500 dark:text-amber-400 font-medium"><strong>Solution:</strong> {currentGuide.solution}</p>
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
          <span>Live Architecture Canvas</span>
        </button>

        <button
          onClick={() => setActiveTab('builder')}
          className={`px-4 py-2 rounded-xl font-mono text-xs font-bold flex items-center space-x-2 transition-all ${
            activeTab === 'builder'
              ? 'bg-indigo-600 text-white shadow-md'
              : isDarkMode ? 'text-slate-400 hover:text-white hover:bg-slate-800' : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Sliders className="w-4 h-4" />
          <span>64-Bit Snowflake Register</span>
        </button>

        <button
          onClick={() => setActiveTab('clock')}
          className={`px-4 py-2 rounded-xl font-mono text-xs font-bold flex items-center space-x-2 transition-all ${
            activeTab === 'clock'
              ? 'bg-rose-600 text-white shadow-md'
              : isDarkMode ? 'text-slate-400 hover:text-white hover:bg-slate-800' : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Clock className="w-4 h-4" />
          <span>Clock Rollback Lab</span>
        </button>

        <button
          onClick={() => setActiveTab('sequence')}
          className={`px-4 py-2 rounded-xl font-mono text-xs font-bold flex items-center space-x-2 transition-all ${
            activeTab === 'sequence'
              ? 'bg-emerald-600 text-white shadow-md'
              : isDarkMode ? 'text-slate-400 hover:text-white hover:bg-slate-800' : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Zap className="w-4 h-4" />
          <span>Sequence Overflow Lab</span>
        </button>

        <button
          onClick={() => setActiveTab('logs')}
          className={`px-4 py-2 rounded-xl font-mono text-xs font-bold flex items-center space-x-2 transition-all ${
            activeTab === 'logs'
              ? 'bg-slate-800 text-white shadow-md'
              : isDarkMode ? 'text-slate-400 hover:text-white hover:bg-slate-800' : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Terminal className="w-4 h-4" />
          <span>Binary Explorer &amp; Logs</span>
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

      {/* TAB 1: LIVE CANVAS & ARCHITECTURE */}
      {activeTab === 'canvas' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* LEFT 2 COLUMNS: ARCHITECTURE CANVAS */}
          <div className={`lg:col-span-2 p-6 rounded-3xl border relative min-h-[500px] flex flex-col justify-between ${
            isDarkMode ? 'bg-[#1c1c1e] border-slate-800' : 'bg-white border-slate-200 shadow-xs'
          }`}>
            <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center space-x-2">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse"></span>
                <h3 className={`text-xs font-bold font-mono uppercase tracking-wider ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                  LIVE GENERATION ARCHITECTURE TOPOLOGY
                </h3>
              </div>

              {/* Active Strategy Badge */}
              <div className="flex items-center space-x-2 font-mono text-[10px]">
                <span className="px-2.5 py-1 rounded-full bg-amber-500 text-slate-950 font-black uppercase">
                  Strategy: {strategy}
                </span>
                <span className="px-2.5 py-1 rounded-full bg-indigo-500/10 text-indigo-400 font-bold border border-indigo-500/20">
                  RPS: {trafficRateRps}
                </span>
              </div>
            </div>

            {/* CANVAS VISUALIZATION FLOW */}
            <div className="py-8 flex flex-col items-center justify-center my-auto space-y-8">

              {/* Clients Layer */}
              <div className="w-full max-w-lg flex items-center justify-between px-6">
                <div className={`p-3 rounded-2xl border text-center font-mono ${isDarkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
                  <Globe className="w-5 h-5 text-indigo-400 mx-auto mb-1" />
                  <span className="text-[10px] font-bold block">Global Web Clients</span>
                </div>
                <div className="h-0.5 flex-1 mx-4 bg-dashed border-t-2 border-indigo-500/30 flex items-center justify-center">
                  <span className="text-[9px] font-mono bg-indigo-500/10 text-indigo-400 px-2 py-0.5 rounded">HTTP POST /create</span>
                </div>
                <div className={`p-3 rounded-2xl border text-center font-mono ${isDarkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
                  <Server className="w-5 h-5 text-amber-500 mx-auto mb-1" />
                  <span className="text-[10px] font-bold block">API Gateway</span>
                </div>
              </div>

              {/* Animated Packet Flow */}
              {activeRequestPacket && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.8, y: -20 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, y: 20 }}
                  className="px-4 py-2 bg-amber-500 text-slate-950 rounded-2xl font-mono text-xs font-black shadow-lg flex items-center space-x-2 animate-bounce"
                >
                  <Zap className="w-4 h-4 text-slate-950" />
                  <span>ID Generated: {activeRequestPacket.value}</span>
                  <span className="text-[9px] bg-slate-950 text-amber-400 px-1.5 py-0.5 rounded">
                    {activeRequestPacket.workerName}
                  </span>
                </motion.div>
              )}

              {/* Workers / Generators Layer */}
              <div className="w-full grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {workers.map((w) => {
                  const isSelected = selectedWorkerId === w.id;
                  return (
                    <div
                      key={w.id}
                      onClick={() => setSelectedWorkerId(w.id)}
                      className={`p-3.5 rounded-2xl border cursor-pointer transition-all ${
                        isSelected
                          ? 'bg-amber-500 text-slate-950 font-bold border-amber-400 ring-4 ring-amber-500/20 scale-105'
                          : isDarkMode
                          ? 'bg-slate-950 border-slate-800 text-white hover:border-amber-500/50'
                          : 'bg-slate-50 border-slate-200 text-slate-900 hover:border-amber-500/50'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <Cpu className={`w-4 h-4 ${isSelected ? 'text-slate-950' : 'text-amber-500'}`} />
                        <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-slate-800 text-slate-300">
                          DC{w.datacenterId} M{w.machineId}
                        </span>
                      </div>
                      <div className="text-xs font-bold font-mono">{w.name}</div>
                      <div className="text-[9px] font-mono opacity-80 mt-1">IP: {w.ip}</div>
                      <div className="text-[9px] font-mono mt-1 font-bold text-emerald-400">
                        Seq: {w.lastSequence}
                      </div>
                    </div>
                  );
                })}
              </div>

            </div>

            {/* BOTTOM METRICS */}
            <div className="pt-4 border-t border-slate-200 dark:border-slate-800 grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className={`p-3 rounded-xl border ${isDarkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
                <span className="text-[10px] text-slate-400 uppercase font-mono font-bold block">Total Generated</span>
                <p className="text-sm font-bold font-mono text-amber-400">{totalGenerated.toLocaleString()} IDs</p>
              </div>
              <div className={`p-3 rounded-xl border ${isDarkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
                <span className="text-[10px] text-slate-400 uppercase font-mono font-bold block">Collisions Count</span>
                <p className={`text-sm font-bold font-mono ${collisionsCount > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                  {collisionsCount} Collisions
                </p>
              </div>
              <div className={`p-3 rounded-xl border ${isDarkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
                <span className="text-[10px] text-slate-400 uppercase font-mono font-bold block">Bits Precision</span>
                <p className="text-sm font-bold font-mono text-indigo-400">
                  {strategy === 'UUID' ? '128 Bits' : '64 Bits'}
                </p>
              </div>
              <div className={`p-3 rounded-xl border ${isDarkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
                <span className="text-[10px] text-slate-400 uppercase font-mono font-bold block">Time Monotonic</span>
                <p className={`text-sm font-bold font-mono ${strategy === 'SNOWFLAKE' ? 'text-emerald-400' : 'text-amber-400'}`}>
                  {strategy === 'SNOWFLAKE' ? '100% Guaranteed' : 'No Monotonicity'}
                </p>
              </div>
            </div>

          </div>

          {/* RIGHT 1 COLUMN: STRATEGY & CONTROLS */}
          <div className={`p-6 rounded-3xl border space-y-5 ${
            isDarkMode ? 'bg-[#1c1c1e] border-slate-800' : 'bg-white border-slate-200 shadow-xs'
          }`}>
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center space-x-2">
                <Sliders className="w-4 h-4 text-amber-500" />
                <h3 className={`text-sm font-bold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                  Strategy Switcher
                </h3>
              </div>
            </div>

            {/* Strategy Buttons */}
            <div className="space-y-2">
              {[
                { type: 'AUTO_INCREMENT' as StrategyType, label: '1. Single DB Auto Increment', desc: 'Fails on sharding' },
                { type: 'AUTO_INC_OFFSET' as StrategyType, label: '2. Multi-Master Offsets', desc: 'Complex rebalancing' },
                { type: 'UUID' as StrategyType, label: '3. UUID v4 (128-bit)', desc: 'Index fragmentation' },
                { type: 'TICKET_SERVER' as StrategyType, label: '4. Ticket Server (Flickr)', desc: 'Single Point of Failure' },
                { type: 'SNOWFLAKE' as StrategyType, label: '5. Twitter Snowflake (64-bit)', desc: 'Decentralized & Time-ordered' },
              ].map((s) => (
                <button
                  key={s.type}
                  onClick={() => setStrategy(s.type)}
                  className={`w-full p-3 rounded-2xl border text-left transition-all ${
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

            {/* Simulation Speed & Trigger Controls */}
            <div className="space-y-3 pt-3 border-t border-slate-200 dark:border-slate-800">
              <div className="flex items-center justify-between text-xs font-mono font-bold">
                <span>Traffic Rate</span>
                <span className="text-amber-400">{trafficRateRps} Req/Sec</span>
              </div>
              <input
                type="range"
                min={50}
                max={2000}
                step={50}
                value={trafficRateRps}
                onChange={(e) => setTrafficRateRps(Number(e.target.value))}
                className="w-full accent-amber-500"
              />

              <div className="grid grid-cols-2 gap-2 pt-2">
                <button
                  onClick={triggerManualGeneration}
                  className="py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black rounded-xl text-xs font-mono shadow-md flex items-center justify-center space-x-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Generate ID</span>
                </button>

                <button
                  onClick={() => setIsSimulating(!isSimulating)}
                  className={`py-2.5 rounded-xl text-xs font-mono font-bold shadow-md flex items-center justify-center space-x-1 ${
                    isSimulating
                      ? 'bg-rose-600 hover:bg-rose-500 text-white'
                      : 'bg-emerald-600 hover:bg-emerald-500 text-white'
                  }`}
                >
                  {isSimulating ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                  <span>{isSimulating ? 'Pause Flow' : 'Start Flow'}</span>
                </button>
              </div>
            </div>

          </div>

        </div>
      )}

      {/* TAB 2: INTERACTIVE 64-BIT SNOWFLAKE REGISTER & BIT ALLOCATOR */}
      {activeTab === 'builder' && (
        <div className={`p-6 rounded-3xl border space-y-6 ${
          isDarkMode ? 'bg-[#1c1c1e] border-slate-800' : 'bg-white border-slate-200'
        }`}>
          <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-800">
            <div className="flex items-center space-x-3">
              <div className="p-2.5 bg-indigo-500/10 text-indigo-500 rounded-2xl border border-indigo-500/20">
                <Sliders className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold font-mono">64-Bit Snowflake Bit Register &amp; Capacity Builder</h3>
                <p className="text-xs text-slate-500 font-mono">Configure bit allocations across Timestamp, Datacenter, Machine, and Sequence fields.</p>
              </div>
            </div>

            {/* Total Bits Check */}
            <div className="px-3 py-1 bg-amber-500/10 text-amber-500 rounded-full text-xs font-mono font-bold border border-amber-500/20">
              1 Sign Bit + {timestampBits} Timestamp + {datacenterBits} DC + {machineBits} Machine + {sequenceBits} Seq = 64 Bits
            </div>
          </div>

          {/* VISUAL 64-BIT REGISTER DISPLAY */}
          <div className="space-y-3">
            <span className="text-xs font-mono font-bold text-slate-400 uppercase tracking-wider block">
              64-Bit Register Bit Layout (0 to 63)
            </span>

            <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 font-mono text-xs overflow-x-auto">
              <div className="flex items-center space-x-1 min-w-[600px]">
                {/* 1 Sign Bit */}
                <div className="px-2 py-3 bg-slate-800 text-slate-400 rounded-lg text-center font-bold" title="Unused Sign Bit (Always 0)">
                  <span className="text-[10px] block opacity-60">Bit 63</span>
                  <span className="text-amber-400">0</span>
                  <span className="text-[9px] block mt-1">Sign</span>
                </div>

                {/* Timestamp Bits */}
                <div className="flex-1 px-3 py-3 bg-indigo-950/80 border border-indigo-500/40 text-indigo-300 rounded-lg text-center font-bold">
                  <span className="text-[10px] block opacity-80">Bits {62 - timestampBits + 1} - 62 ({timestampBits} bits)</span>
                  <span className="text-indigo-400 font-black text-sm">Timestamp (ms)</span>
                  <span className="text-[9px] block mt-1 opacity-80">Lifetime: {remainingYears} Years</span>
                </div>

                {/* Datacenter Bits */}
                <div className="px-3 py-3 bg-purple-950/80 border border-purple-500/40 text-purple-300 rounded-lg text-center font-bold">
                  <span className="text-[10px] block opacity-80">{datacenterBits} bits</span>
                  <span className="text-purple-400 font-black text-sm">DC ID</span>
                  <span className="text-[9px] block mt-1 opacity-80">{maxDatacenters} DCs</span>
                </div>

                {/* Machine Bits */}
                <div className="px-3 py-3 bg-amber-950/80 border border-amber-500/40 text-amber-300 rounded-lg text-center font-bold">
                  <span className="text-[10px] block opacity-80">{machineBits} bits</span>
                  <span className="text-amber-400 font-black text-sm">Machine ID</span>
                  <span className="text-[9px] block mt-1 opacity-80">{maxMachines} Nodes/DC</span>
                </div>

                {/* Sequence Bits */}
                <div className="px-3 py-3 bg-emerald-950/80 border border-emerald-500/40 text-emerald-300 rounded-lg text-center font-bold">
                  <span className="text-[10px] block opacity-80">{sequenceBits} bits</span>
                  <span className="text-emerald-400 font-black text-sm">Sequence</span>
                  <span className="text-[9px] block mt-1 opacity-80">{maxSequence + 1} IDs/ms</span>
                </div>
              </div>
            </div>
          </div>

          {/* BIT ADJUSTMENT SLIDERS */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">

            {/* Timestamp Bits */}
            <div className={`p-4 rounded-2xl border space-y-3 ${isDarkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
              <div className="flex justify-between text-xs font-mono font-bold">
                <span>Timestamp Bits</span>
                <span className="text-indigo-400">{timestampBits} Bits</span>
              </div>
              <input
                type="range"
                min={30}
                max={45}
                value={timestampBits}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  setTimestampBits(val);
                  // Auto adjust sequence to fit 63 bits
                  const diff = 63 - (val + datacenterBits + machineBits);
                  if (diff >= 8) setSequenceBits(diff);
                }}
                className="w-full accent-indigo-500"
              />
              <p className="text-[10px] text-slate-500 font-mono">
                Supports {remainingYears} years before integer overflow.
              </p>
            </div>

            {/* Datacenter Bits */}
            <div className={`p-4 rounded-2xl border space-y-3 ${isDarkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
              <div className="flex justify-between text-xs font-mono font-bold">
                <span>Datacenter Bits</span>
                <span className="text-purple-400">{datacenterBits} Bits</span>
              </div>
              <input
                type="range"
                min={2}
                max={8}
                value={datacenterBits}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  setDatacenterBits(val);
                  const diff = 63 - (timestampBits + val + machineBits);
                  if (diff >= 8) setSequenceBits(diff);
                }}
                className="w-full accent-purple-500"
              />
              <p className="text-[10px] text-slate-500 font-mono">
                Supports up to {maxDatacenters} distinct datacenters.
              </p>
            </div>

            {/* Machine Bits */}
            <div className={`p-4 rounded-2xl border space-y-3 ${isDarkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
              <div className="flex justify-between text-xs font-mono font-bold">
                <span>Machine Bits</span>
                <span className="text-amber-400">{machineBits} Bits</span>
              </div>
              <input
                type="range"
                min={2}
                max={8}
                value={machineBits}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  setMachineBits(val);
                  const diff = 63 - (timestampBits + datacenterBits + val);
                  if (diff >= 8) setSequenceBits(diff);
                }}
                className="w-full accent-amber-500"
              />
              <p className="text-[10px] text-slate-500 font-mono">
                Supports up to {maxMachines} workers per datacenter.
              </p>
            </div>

            {/* Sequence Bits */}
            <div className={`p-4 rounded-2xl border space-y-3 ${isDarkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
              <div className="flex justify-between text-xs font-mono font-bold">
                <span>Sequence Bits</span>
                <span className="text-emerald-400">{sequenceBits} Bits</span>
              </div>
              <input
                type="range"
                min={8}
                max={16}
                value={sequenceBits}
                onChange={(e) => setSequenceBits(Number(e.target.value))}
                className="w-full accent-emerald-500"
              />
              <p className="text-[10px] text-slate-500 font-mono">
                Max {maxSequence + 1} unique IDs per millisecond per worker.
              </p>
            </div>

          </div>

          {/* CUSTOM EPOCH SELECTOR */}
          <div className={`p-5 rounded-2xl border space-y-4 ${
            isDarkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'
          }`}>
            <span className="text-xs font-mono font-bold text-slate-400 uppercase tracking-wider block">
              Epoch Timestamp Selection (Extends Usable Lifetime)
            </span>

            <div className="flex flex-wrap items-center gap-3">
              {[
                { id: 'twitter' as const, label: 'Twitter Epoch (Nov 4, 2010)', epoch: 1288834974657 },
                { id: 'custom2026' as const, label: 'Custom 2026 Epoch (Jan 1, 2026)', epoch: 1767225600000 },
                { id: 'unix' as const, label: 'Standard Unix Epoch (Jan 1, 1970)', epoch: 0 },
              ].map((ep) => (
                <button
                  key={ep.id}
                  onClick={() => handleEpochChange(ep.id)}
                  className={`px-4 py-2 rounded-xl text-xs font-mono font-bold border transition-all ${
                    selectedEpochName === ep.id
                      ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-md'
                      : isDarkMode ? 'bg-[#1c1c1e] border-slate-800 text-slate-300' : 'bg-white border-slate-200 text-slate-700'
                  }`}
                >
                  {ep.label}
                </button>
              ))}
            </div>

            <div className="text-xs font-mono text-slate-400 space-y-1">
              <p>Selected Epoch Epoch MS: <span className="text-amber-400 font-bold">{customEpochMs}</span></p>
              <p>Predicted Overflow Date: <span className="text-emerald-400 font-bold">{overflowDate}</span> ({remainingYears} years from epoch)</p>
            </div>
          </div>

        </div>
      )}

      {/* TAB 3: CLOCK ROLLBACK / DRIFT LAB */}
      {activeTab === 'clock' && (
        <div className={`p-6 rounded-3xl border space-y-6 ${
          isDarkMode ? 'bg-[#1c1c1e] border-slate-800' : 'bg-white border-slate-200'
        }`}>
          <div className="flex items-center space-x-3 pb-4 border-b border-slate-200 dark:border-slate-800">
            <div className="p-2.5 bg-rose-500/10 text-rose-500 rounded-2xl border border-rose-500/20">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold font-mono">Clock Rollback &amp; NTP Drift Laboratory</h3>
              <p className="text-xs text-slate-500 font-mono">Simulate what happens when worker system clocks drift backward due to NTP resynchronization.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

            {/* Controls */}
            <div className={`p-5 rounded-2xl border space-y-5 ${
              isDarkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'
            }`}>
              <span className="text-xs font-mono font-bold text-slate-400 uppercase tracking-wider block">
                Inject Clock Drift Fault
              </span>

              <div className="space-y-2">
                <div className="flex justify-between text-xs font-mono font-bold">
                  <span>Clock Shift (ms)</span>
                  <span className={clockOffsetMs < 0 ? 'text-rose-400' : 'text-emerald-400'}>
                    {clockOffsetMs} ms {clockOffsetMs < 0 ? '(BACKWARD DRIFT)' : ''}
                  </span>
                </div>
                <input
                  type="range"
                  min={-100}
                  max={50}
                  value={clockOffsetMs}
                  onChange={(e) => {
                    const offset = Number(e.target.value);
                    setClockOffsetMs(offset);
                    // Update worker 0 clock offset
                    setWorkers(prev => prev.map((w, idx) => idx === 0 ? { ...w, clockOffsetMs: offset } : w));
                  }}
                  className="w-full accent-rose-500"
                />
              </div>

              {/* Mitigation Strategy Radio Buttons */}
              <div className="space-y-2">
                <span className="text-xs font-mono font-bold text-slate-300 block">
                  Clock Rollback Handling Strategy
                </span>

                {[
                  { id: 'WAIT' as const, label: '1. Sleep & Wait until clock catches up', desc: 'Recommended for small drift (<10ms)' },
                  { id: 'REFUSE' as const, label: '2. Refuse generation & throw exception', desc: 'Protects strict non-collision invariant' },
                  { id: 'BACKUP_WORKER' as const, label: '3. Route to Backup Worker Machine', desc: 'Maintains zero-latency availability' },
                ].map((act) => (
                  <button
                    key={act.id}
                    onClick={() => setClockDriftAction(act.id)}
                    className={`w-full p-3 rounded-xl border text-left transition-all ${
                      clockDriftAction === act.id
                        ? 'bg-rose-500 text-white font-bold border-rose-400 shadow-md'
                        : isDarkMode ? 'bg-[#1c1c1e] border-slate-800 text-slate-300' : 'bg-white border-slate-200 text-slate-700'
                    }`}
                  >
                    <div className="text-xs font-mono">{act.label}</div>
                    <div className="text-[10px] opacity-80">{act.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Live Rollback Visualizer */}
            <div className={`p-5 rounded-2xl border space-y-4 flex flex-col justify-between ${
              isDarkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'
            }`}>
              <div className="space-y-2">
                <div className="flex items-center space-x-2">
                  <AlertTriangle className={`w-5 h-5 ${clockOffsetMs < 0 ? 'text-rose-500 animate-bounce' : 'text-emerald-500'}`} />
                  <h4 className="text-sm font-bold font-mono">Live Clock Status</h4>
                </div>
                <p className="text-xs text-slate-400 font-mono leading-relaxed">
                  {clockOffsetMs < 0
                    ? `DANGER: Worker system clock was pushed BACKWARDS by ${Math.abs(clockOffsetMs)}ms. If Snowflake blindly generated IDs now, timestamp values would duplicate previous milliseconds!`
                    : 'System clocks across all datacenters are in sync.'}
                </p>
              </div>

              <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 font-mono text-xs space-y-2">
                <div className="flex justify-between">
                  <span className="text-slate-400">Current Physical System Time:</span>
                  <span className="font-bold text-white">{Date.now()} ms</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Worker 0 Effective Clock:</span>
                  <span className={`font-bold ${clockOffsetMs < 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                    {Date.now() + clockOffsetMs} ms
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Action Enforced:</span>
                  <span className="font-bold text-amber-400">{clockDriftAction}</span>
                </div>
              </div>

              <button
                onClick={() => {
                  setClockOffsetMs(0);
                  setWorkers(prev => prev.map(w => ({ ...w, clockOffsetMs: 0 })));
                }}
                className="w-full py-2 bg-emerald-600 text-white font-bold rounded-xl text-xs font-mono hover:bg-emerald-500"
              >
                Reset System Clocks to Normal
              </button>
            </div>

          </div>
        </div>
      )}

      {/* TAB 4: SEQUENCE OVERFLOW LAB */}
      {activeTab === 'sequence' && (
        <div className={`p-6 rounded-3xl border space-y-6 ${
          isDarkMode ? 'bg-[#1c1c1e] border-slate-800' : 'bg-white border-slate-200'
        }`}>
          <div className="flex items-center space-x-3 pb-4 border-b border-slate-200 dark:border-slate-800">
            <div className="p-2.5 bg-emerald-500/10 text-emerald-500 rounded-2xl border border-emerald-500/20">
              <Zap className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold font-mono">Millisecond Sequence Overflow Stress Test</h3>
              <p className="text-xs text-slate-500 font-mono">Observe what happens when requests exceed {maxSequence + 1} IDs per millisecond on a single worker node.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

            <div className={`p-5 rounded-2xl border space-y-4 ${
              isDarkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'
            }`}>
              <span className="text-xs font-mono font-bold text-slate-400 uppercase tracking-wider block">
                Sequence Burst Controller
              </span>

              <div className="space-y-2">
                <div className="flex justify-between text-xs font-mono font-bold">
                  <span>Burst Batch Size</span>
                  <span className="text-emerald-400">{seqBurstCount} IDs / ms</span>
                </div>
                <input
                  type="range"
                  min={10}
                  max={maxSequence + 500}
                  step={50}
                  value={seqBurstCount}
                  onChange={(e) => setSeqBurstCount(Number(e.target.value))}
                  className="w-full accent-emerald-500"
                />
              </div>

              <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 font-mono text-xs space-y-2">
                <div className="flex justify-between">
                  <span className="text-slate-400">Sequence Bits:</span>
                  <span className="font-bold text-white">{sequenceBits} Bits</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Max Sequence per ms:</span>
                  <span className="font-bold text-emerald-400">{maxSequence} (0 to {maxSequence})</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Status:</span>
                  <span className={`font-bold ${seqBurstCount > maxSequence ? 'text-rose-400' : 'text-emerald-400'}`}>
                    {seqBurstCount > maxSequence ? 'OVERFLOW TRIGGERED' : 'SAFE CAPACITY'}
                  </span>
                </div>
              </div>

              <button
                onClick={() => {
                  for (let i = 0; i < 10; i++) {
                    triggerManualGeneration();
                  }
                }}
                className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs font-mono shadow-md"
              >
                Fire Burst Request Batch (10 IDs)
              </button>
            </div>

            <div className={`p-5 rounded-2xl border space-y-4 ${
              isDarkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'
            }`}>
              <h4 className="text-xs font-mono font-bold text-slate-400 uppercase tracking-wider">
                Sequence Wrapping Mechanism
              </h4>

              <p className="text-xs text-slate-400 font-mono leading-relaxed">
                When sequence reaches {maxSequence} within the same millisecond, the worker holds execution until the clock ticks to the next millisecond, resetting sequence to 0. This guarantees zero duplicate IDs even under extreme microburst traffic!
              </p>

              <div className="w-full bg-slate-800 rounded-full h-4 overflow-hidden border border-slate-700">
                <div
                  style={{ width: `${Math.min(100, (workers[0].lastSequence / maxSequence) * 100)}%` }}
                  className="bg-emerald-500 h-full transition-all duration-200"
                ></div>
              </div>
              <span className="text-[10px] font-mono text-slate-400 block text-right">
                Worker 0 Sequence: {workers[0].lastSequence} / {maxSequence}
              </span>
            </div>

          </div>
        </div>
      )}

      {/* TAB 5: BINARY EXPLORER & LOGS */}
      {activeTab === 'logs' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* LEFT 2 COLUMNS: REAL-TIME GENERATED ID LOGS */}
          <div className={`lg:col-span-2 p-6 rounded-3xl border space-y-4 ${
            isDarkMode ? 'bg-[#1c1c1e] border-slate-800' : 'bg-white border-slate-200 shadow-xs'
          }`}>
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center space-x-2">
                <Terminal className="w-4 h-4 text-amber-500" />
                <h3 className={`text-sm font-bold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                  Live Generated ID Feed
                </h3>
              </div>
              <span className="text-[10px] font-mono text-slate-400">Click any row to decode 64-bit binary fields</span>
            </div>

            <div className="space-y-2 max-h-[440px] overflow-y-auto pr-1">
              {idLogs.map((rec) => (
                <div
                  key={rec.id}
                  onClick={() => setSelectedRecord(rec)}
                  className={`p-3 rounded-2xl border font-mono text-xs cursor-pointer transition-all flex items-center justify-between ${
                    selectedRecord?.id === rec.id
                      ? 'bg-amber-500/20 border-amber-500/80 text-amber-300 ring-2 ring-amber-500/30'
                      : rec.isCollision
                      ? 'bg-rose-950/80 border-rose-500/80 text-rose-300'
                      : isDarkMode ? 'bg-slate-950 border-slate-800 hover:border-slate-700' : 'bg-slate-50 border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className="space-y-1">
                    <div className="flex items-center space-x-2">
                      <span className="font-extrabold text-amber-400 text-sm">{rec.decimalValue}</span>
                      <span className="text-[9px] px-2 py-0.5 bg-slate-800 rounded text-slate-300">
                        {rec.strategy}
                      </span>
                    </div>
                    <div className="text-[10px] text-slate-500">
                      Worker: {rec.workerName} • DC{rec.datacenterId} M{rec.machineId} • Seq: {rec.sequence}
                    </div>
                  </div>

                  <div className="text-right space-y-1">
                    <span className="text-[10px] text-slate-400 block">{rec.formattedUtc.split('T')[1].replace('Z','')}</span>
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                      rec.isCollision ? 'bg-rose-500 text-white' : 'bg-emerald-500/10 text-emerald-400'
                    }`}>
                      {rec.isCollision ? 'COLLISION DETECTED' : 'UNIQUE'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* RIGHT 1 COLUMN: 64-BIT BINARY DECODER */}
          <div className={`p-6 rounded-3xl border space-y-5 ${
            isDarkMode ? 'bg-[#1c1c1e] border-slate-800' : 'bg-white border-slate-200 shadow-xs'
          }`}>
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center space-x-2">
                <Hash className="w-4 h-4 text-amber-500" />
                <h3 className={`text-sm font-bold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                  64-Bit Binary Decoder
                </h3>
              </div>
            </div>

            {selectedRecord ? (
              <div className="space-y-4 font-mono text-xs">
                <div className="p-3 bg-slate-950 rounded-2xl border border-slate-800 space-y-2">
                  <span className="text-[10px] text-slate-400 block">64-Bit Binary Representation</span>
                  <div className="break-all font-bold text-amber-400 text-xs tracking-widest">
                    {selectedRecord.binary64}
                  </div>
                </div>

                <div className="space-y-2">
                  <div className={`p-2.5 rounded-xl border flex justify-between ${isDarkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
                    <span className="text-slate-400 text-[10px]">Decimal Value:</span>
                    <span className="font-bold text-amber-400">{selectedRecord.decimalValue}</span>
                  </div>
                  <div className={`p-2.5 rounded-xl border flex justify-between ${isDarkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
                    <span className="text-slate-400 text-[10px]">Extracted UTC Time:</span>
                    <span className="font-bold text-indigo-400">{selectedRecord.formattedUtc.split('T')[1]}</span>
                  </div>
                  <div className={`p-2.5 rounded-xl border flex justify-between ${isDarkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
                    <span className="text-slate-400 text-[10px]">Datacenter ID:</span>
                    <span className="font-bold text-purple-400">DC {selectedRecord.datacenterId}</span>
                  </div>
                  <div className={`p-2.5 rounded-xl border flex justify-between ${isDarkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
                    <span className="text-slate-400 text-[10px]">Machine / Worker ID:</span>
                    <span className="font-bold text-amber-400">Machine {selectedRecord.machineId}</span>
                  </div>
                  <div className={`p-2.5 rounded-xl border flex justify-between ${isDarkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
                    <span className="text-slate-400 text-[10px]">Sequence Number:</span>
                    <span className="font-bold text-emerald-400">Seq #{selectedRecord.sequence}</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-xs text-slate-500 font-mono text-center py-8">Select an ID record from the feed to inspect bit fields.</div>
            )}
          </div>

        </div>
      )}

      {/* TAB 6: ARCHITECT CHALLENGE / QUIZ */}
      {activeTab === 'quiz' && (
        <div className={`p-6 sm:p-8 rounded-3xl border space-y-6 ${
          isDarkMode ? 'bg-[#1c1c1e] border-slate-800' : 'bg-white border-slate-200'
        }`}>
          <div className="flex items-center space-x-3 pb-4 border-b border-slate-200 dark:border-slate-800">
            <div className="p-2.5 bg-amber-500/10 text-amber-500 rounded-2xl border border-amber-500/20">
              <Award className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-lg font-bold font-mono">Distributed Systems Architect Quiz (Stage {stage})</h3>
              <p className="text-xs text-slate-500 font-mono">Test your knowledge of distributed ID generation, Snowflake bit math, and clock synchronization.</p>
            </div>
          </div>

          <div className="space-y-4 max-w-2xl">
            <h4 className="text-sm font-bold font-mono text-amber-400">
              Question {stage}: {currentQuiz.question}
            </h4>

            <div className="space-y-2">
              {currentQuiz.options.map((opt, idx) => (
                <button
                  key={idx}
                  onClick={() => {
                    if (idx === currentQuiz.correct) {
                      alert('Correct! ' + currentQuiz.explanation);
                    } else {
                      alert('Incorrect. Try again!');
                    }
                  }}
                  className={`w-full p-4 rounded-2xl border text-left font-mono text-xs font-bold transition-all ${
                    isDarkMode ? 'bg-slate-950 border-slate-800 hover:border-amber-500/50 text-white' : 'bg-slate-50 border-slate-200 hover:border-amber-500/50 text-slate-900'
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
