import React, { useState, useEffect } from 'react';
import {
  Database,
  Server,
  Network,
  Cpu,
  Zap,
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Play,
  Pause,
  RotateCcw,
  Sparkles,
  ArrowRight,
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
  Award,
  Layers,
  Flame,
  Globe,
  GitCommit,
  GitMerge,
  Split,
  FileCode,
  HardDrive,
  Check,
  ZapOff,
  GitBranch,
  Filter
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface Chapter6KeyValueStoreProps {
  isDarkMode?: boolean;
}

export interface KVNode {
  id: string;
  name: string;
  dc: 'US-East' | 'EU-West' | 'AP-South';
  ip: string;
  ringPosition: number; // 0 - 360 degrees
  status: 'healthy' | 'degraded' | 'crashed' | 'isolated';
  cpu: number;
  memory: number;
  storageMb: number;
  keysCount: number;
  vnodes: number;
  hasHints: boolean;
  merkleHash: string;
}

export interface KeyRecord {
  key: string;
  value: string;
  hash: number; // 0 - 360
  primaryNodeId: string;
  replicaNodeIds: string[];
  vectorClock: Record<string, number>;
  updatedAt: string;
  isConflict?: boolean;
  siblings?: { value: string; clock: Record<string, number> }[];
}

export interface OperationLog {
  id: string;
  timestamp: string;
  type: 'PUT' | 'GET' | 'DELETE' | 'REPLICATE' | 'REPAIR' | 'HANDOFF' | 'MERKLE' | 'FAILURE';
  status: 'SUCCESS' | 'WARN' | 'ERROR' | 'QUORUM_OK' | 'STALE_READ';
  key?: string;
  detail: string;
  nodesInvolved?: string[];
}

export interface MerkleNode {
  id: string;
  label: string;
  hash: string;
  children?: MerkleNode[];
  isMatched?: boolean;
  keyRange?: [number, number];
}

export const Chapter6KeyValueStore: React.FC<Chapter6KeyValueStoreProps> = ({ isDarkMode = false }) => {
  // --- STAGE PROGRESSION (1 to 10) ---
  const [stage, setStage] = useState<number>(1);
  const [activeTab, setActiveTab] = useState<'canvas' | 'quorum' | 'conflicts' | 'merkle' | 'logs' | 'quiz'>('canvas');

  // Interactive Parameters
  const [replicationFactorN, setReplicationFactorN] = useState<number>(3);
  const [readQuorumR, setReadQuorumR] = useState<number>(2);
  const [writeQuorumW, setWriteQuorumW] = useState<number>(2);
  const [capMode, setCapMode] = useState<'AP' | 'CP'>('AP');
  const [isPartitioned, setIsPartitioned] = useState<boolean>(false);
  const [isSimulating, setIsSimulating] = useState<boolean>(true);

  // DB State
  const [nodes, setNodes] = useState<KVNode[]>([
    { id: 'node-A', name: 'Node A', dc: 'US-East', ip: '10.0.0.1', ringPosition: 30, status: 'healthy', cpu: 32, memory: 45, storageMb: 120, keysCount: 42, vnodes: 3, hasHints: false, merkleHash: 'a8f9c' },
    { id: 'node-B', name: 'Node B', dc: 'US-East', ip: '10.0.0.2', ringPosition: 120, status: 'healthy', cpu: 28, memory: 50, storageMb: 110, keysCount: 40, vnodes: 3, hasHints: false, merkleHash: 'b3e21' },
    { id: 'node-C', name: 'Node C', dc: 'EU-West', ip: '10.0.1.1', ringPosition: 210, status: 'healthy', cpu: 35, memory: 48, storageMb: 135, keysCount: 45, vnodes: 3, hasHints: false, merkleHash: 'c7d42' },
    { id: 'node-D', name: 'Node D', dc: 'AP-South', ip: '10.0.2.1', ringPosition: 300, status: 'healthy', cpu: 25, memory: 40, storageMb: 95, keysCount: 38, vnodes: 3, hasHints: false, merkleHash: 'd9a11' },
  ]);

  const [kvStore, setKvStore] = useState<Record<string, KeyRecord>>({
    'user:101': { key: 'user:101', value: 'Alice Smith', hash: 45, primaryNodeId: 'node-A', replicaNodeIds: ['node-A', 'node-B', 'node-C'], vectorClock: { 'node-A': 2, 'node-B': 1 }, updatedAt: '12:00:01' },
    'cart:88': { key: 'cart:88', value: '3 Items [$49.99]', hash: 140, primaryNodeId: 'node-B', replicaNodeIds: ['node-B', 'node-C', 'node-D'], vectorClock: { 'node-B': 3 }, updatedAt: '12:00:05' },
    'session:992': { key: 'session:992', value: 'Active [Token-XYZ]', hash: 230, primaryNodeId: 'node-C', replicaNodeIds: ['node-C', 'node-D', 'node-A'], vectorClock: { 'node-C': 1 }, updatedAt: '12:00:10' },
  });

  // Selected Component / Node for Inspection
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>('node-A');

  // Form Inputs for PUT/GET
  const [inputKey, setInputKey] = useState<string>('user:101');
  const [inputValue, setInputValue] = useState<string>('Alice (Updated)');

  // Vector Clock Conflict Lab state
  const [conflictKey, setConflictKey] = useState<string>('cart:88');
  const [valBranchA, setValBranchA] = useState<string>('Cart: [Laptop]');
  const [valBranchB, setValBranchB] = useState<string>('Cart: [Headphones]');

  // Live Operation Logs
  const [logs, setLogs] = useState<OperationLog[]>([
    { id: '1', timestamp: '12:00:01', type: 'PUT', status: 'QUORUM_OK', key: 'user:101', detail: 'PUT key "user:101" succeeded with W=2 (Replicas: Node A, Node B)', nodesInvolved: ['node-A', 'node-B'] },
    { id: '2', timestamp: '12:00:05', type: 'GET', status: 'SUCCESS', key: 'cart:88', detail: 'GET key "cart:88" returned "3 Items [$49.99]" with R=2 Quorum', nodesInvolved: ['node-B', 'node-C'] },
  ]);

  // Active Animated Request Packet
  const [activeRequest, setActiveRequest] = useState<{
    key: string;
    type: 'PUT' | 'GET';
    targetNodes: string[];
    respondedNodes: string[];
    isQuorumMet: boolean;
  } | null>(null);

  // Merkle Tree Node Mismatch state for Stage 9
  const [merkleMismatchKey, setMerkleMismatchKey] = useState<boolean>(false);

  // Stage Features Unlock Mapping
  const isSingleNode = stage === 1;
  const hasPartitioning = stage >= 2;
  const hasConsistentHashing = stage >= 3;
  const hasReplication = stage >= 4;
  const hasCapControls = stage >= 5;
  const hasQuorum = stage >= 6;
  const hasVectorClocks = stage >= 7;
  const hasHintedHandoff = stage >= 8;
  const hasMerkleTree = stage >= 9;
  const hasMultiDC = stage >= 10;

  // Quorum Math Check
  const isStrongConsistency = writeQuorumW + readQuorumR > replicationFactorN;

  // Handle stage change constraints
  useEffect(() => {
    if (stage === 1) {
      setReplicationFactorN(1);
      setWriteQuorumW(1);
      setReadQuorumR(1);
    } else if (stage === 2 || stage === 3) {
      setReplicationFactorN(1);
      setWriteQuorumW(1);
      setReadQuorumR(1);
    } else {
      setReplicationFactorN(3);
      setWriteQuorumW(2);
      setReadQuorumR(2);
    }
  }, [stage]);

  // Live simulation heartbeat
  useEffect(() => {
    if (!isSimulating) return;

    const interval = setInterval(() => {
      const now = new Date().toLocaleTimeString('en-US', { hour12: false });
      const rand = Math.random();

      if (rand > 0.7) {
        // Random background PUT or GET
        const keys = Object.keys(kvStore);
        if (keys.length > 0) {
          const k = keys[Math.floor(Math.random() * keys.length)];
          setLogs((prev) => [
            {
              id: Math.random().toString(),
              timestamp: now,
              type: 'GET',
              status: 'SUCCESS',
              key: k,
              detail: `Background Quorum read GET("${k}") -> R=${readQuorumR} nodes verified`,
              nodesInvolved: ['node-A', 'node-B'],
            },
            ...prev.slice(0, 30),
          ]);
        }
      }
    }, 2500);

    return () => clearInterval(interval);
  }, [isSimulating, kvStore, readQuorumR]);

  // --- MENTOR STAGE GUIDANCE ---
  const mentorAdvice = [
    {
      stage: 1,
      title: 'Stage 1: Single Node HashMap',
      problem: 'You have a single server storing all records in memory HashMap<Key, Value>. Storage is reaching 95%! A single machine cannot scale to billions of records.',
      solution: 'Partition (shard) the data across multiple database servers.',
      question: 'What happens when a single server runs out of RAM or crashes?'
    },
    {
      stage: 2,
      title: 'Stage 2: Simple Data Partitioning (Modulo Hashing)',
      problem: 'You split data across 4 servers using hash(key) % N. When server 5 is added, almost 100% of keys move, destroying your cache!',
      solution: 'Upgrade to a Consistent Hash Ring so adding/removing nodes only remaps K/N keys.',
      question: 'Why does traditional modulo sharding trigger catastrophic key movement?'
    },
    {
      stage: 3,
      title: 'Stage 3: Consistent Hash Ring & Virtual Nodes',
      problem: 'Keys are routed around a 0-360° ring. Some servers get 5x more traffic due to non-uniform key distribution (hotspots).',
      solution: 'Introduce Virtual Nodes (VNodes) to distribute physical servers uniformly across the ring.',
      question: 'How do virtual nodes solve physical server hotspots?'
    },
    {
      stage: 4,
      title: 'Stage 4: Data Replication (N = 3)',
      problem: 'Server B crashes! Thousands of keys stored solely on Server B disappear permanently.',
      solution: 'Replicate every key across N consecutive clockwise nodes on the hash ring.',
      question: 'How many replicas do you need to survive 2 simultaneous node crashes?'
    },
    {
      stage: 5,
      title: 'Stage 5: Network Partition & CAP Theorem',
      problem: 'A network partition cuts your cluster in half. EU-West cannot talk to US-East!',
      solution: 'Choose between CP (Reject writes to guarantee consistency) or AP (Allow writes on both sides, reconcile later).',
      question: 'In a real-world shopping cart database, would you choose CP or AP?'
    },
    {
      stage: 6,
      title: 'Stage 6: Tunable Quorum Consistency (W + R > N)',
      problem: 'Replicas diverge due to async replication delays, causing users to see old data.',
      solution: 'Enforce Quorum formula: W + R > N ensures read and write sets always overlap at least 1 up-to-date node!',
      question: 'If N=3, W=2, R=2, why are you guaranteed to read the latest write?'
    },
    {
      stage: 7,
      title: 'Stage 7: Concurrent Version Conflicts & Vector Clocks',
      problem: 'Two users update the same key at the exact same millisecond on different nodes.',
      solution: 'Attach Vector Clocks [NodeA:1, NodeB:2] to detect causal order and preserve divergent sibling versions for application resolution.',
      question: 'Why is standard physical clock timestamp synchronization (NTP) unsafe for distributed ordering?'
    },
    {
      stage: 8,
      title: 'Stage 8: Temporary Failures & Hinted Handoff',
      problem: 'Node C is temporarily down for 2 minutes during maintenance. Standard writes fail.',
      solution: 'Use Sloppy Quorum: Node B accepts write on behalf of Node C, stores a "Hint", and replays it when Node C recovers.',
      question: 'What is the trade-off between strict quorum and sloppy quorum with hinted handoff?'
    },
    {
      stage: 9,
      title: 'Stage 9: Permanent Failure Recovery & Merkle Trees',
      problem: 'A node drive corrupts after weeks offline. Transferring the entire terabyte database to re-sync is too slow.',
      solution: 'Compare Merkle Trees (hash trees). Only out-of-sync leaf branches are transferred over the wire!',
      question: 'Why do Merkle Trees allow sub-second anti-entropy sync over massive key spaces?'
    },
    {
      stage: 10,
      title: 'Stage 10: Multi-Data Center Global Distribution',
      problem: 'Transatlantic network roundtrips (150ms+) slow down local user reads and writes.',
      solution: 'Deploy local datacenter quorum groups with background asynchronous cross-region replication.',
      question: 'How do Amazon Dynamo and Apache Cassandra handle multi-region replication?'
    }
  ];

  const currentMentor = mentorAdvice[stage - 1];

  // --- ACTIONS ---

  // Execute PUT operation
  const handleExecutePut = () => {
    if (!inputKey.trim()) return;
    const now = new Date().toLocaleTimeString('en-US', { hour12: false });
    
    // Hash key to ring position 0 - 360
    let hash = 0;
    for (let i = 0; i < inputKey.length; i++) {
      hash = (hash * 31 + inputKey.charCodeAt(i)) % 360;
    }

    // Find primary node clockwise
    const healthyNodes = nodes.filter(n => n.status !== 'crashed');
    if (healthyNodes.length === 0) {
      setLogs(prev => [{
        id: Math.random().toString(),
        timestamp: now,
        type: 'PUT',
        status: 'ERROR',
        key: inputKey,
        detail: 'FATAL: All nodes down! Cannot perform write.'
      }, ...prev]);
      return;
    }

    // Sort clockwise
    const sorted = [...healthyNodes].sort((a, b) => a.ringPosition - b.ringPosition);
    let primary = sorted.find(n => n.ringPosition >= hash) || sorted[0];

    // Pick N replicas
    const replicaNodes = sorted.slice(0, Math.min(replicationFactorN, sorted.length)).map(n => n.id);

    // Check write quorum
    const ackCount = replicaNodes.filter(id => {
      const n = nodes.find(x => x.id === id);
      return n && n.status === 'healthy';
    }).length;

    const isQuorumAchieved = ackCount >= writeQuorumW;

    // Trigger visual packet animation
    setActiveRequest({
      key: inputKey,
      type: 'PUT',
      targetNodes: replicaNodes,
      respondedNodes: replicaNodes.slice(0, ackCount),
      isQuorumMet: isQuorumAchieved
    });

    setTimeout(() => setActiveRequest(null), 2000);

    // Update state
    if (isQuorumAchieved || capMode === 'AP') {
      setKvStore(prev => ({
        ...prev,
        [inputKey]: {
          key: inputKey,
          value: inputValue,
          hash,
          primaryNodeId: primary.id,
          replicaNodeIds: replicaNodes,
          vectorClock: {
            ...(prev[inputKey]?.vectorClock || {}),
            [primary.id]: ((prev[inputKey]?.vectorClock?.[primary.id] || 0) + 1)
          },
          updatedAt: now
        }
      }));

      setLogs(prev => [{
        id: Math.random().toString(),
        timestamp: now,
        type: 'PUT',
        status: isQuorumAchieved ? 'QUORUM_OK' : 'WARN',
        key: inputKey,
        detail: `PUT("${inputKey}", "${inputValue}") -> Hash ${hash}°, Primary: ${primary.name}. ACKs: ${ackCount}/${writeQuorumW} W-Quorum ${isQuorumAchieved ? 'ACHIEVED' : 'PARTIAL (AP Mode)'}`,
        nodesInvolved: replicaNodes
      }, ...prev]);
    } else {
      setLogs(prev => [{
        id: Math.random().toString(),
        timestamp: now,
        type: 'PUT',
        status: 'ERROR',
        key: inputKey,
        detail: `PUT FAILED: Write Quorum NOT MET! Got ${ackCount} ACKs, required W=${writeQuorumW} (CP Mode strictness)`,
        nodesInvolved: replicaNodes
      }, ...prev]);
    }
  };

  // Execute GET operation
  const handleExecuteGet = () => {
    const record = kvStore[inputKey];
    const now = new Date().toLocaleTimeString('en-US', { hour12: false });

    if (!record) {
      setLogs(prev => [{
        id: Math.random().toString(),
        timestamp: now,
        type: 'GET',
        status: 'WARN',
        key: inputKey,
        detail: `GET("${inputKey}") -> Key not found in database.`
      }, ...prev]);
      return;
    }

    const healthyReplicas = record.replicaNodeIds.filter(id => {
      const n = nodes.find(x => x.id === id);
      return n && n.status === 'healthy';
    });

    const isQuorumMet = healthyReplicas.length >= readQuorumR;

    setActiveRequest({
      key: inputKey,
      type: 'GET',
      targetNodes: record.replicaNodeIds,
      respondedNodes: healthyReplicas,
      isQuorumMet
    });

    setTimeout(() => setActiveRequest(null), 2000);

    if (isQuorumMet) {
      setLogs(prev => [{
        id: Math.random().toString(),
        timestamp: now,
        type: 'GET',
        status: 'SUCCESS',
        key: inputKey,
        detail: `GET("${inputKey}") -> Value: "${record.value}" | Read Quorum (${healthyReplicas.length}/${readQuorumR}) CONFIRMED. Vector Clock: ${JSON.stringify(record.vectorClock)}`,
        nodesInvolved: healthyReplicas
      }, ...prev]);
    } else {
      setLogs(prev => [{
        id: Math.random().toString(),
        timestamp: now,
        type: 'GET',
        status: 'STALE_READ',
        key: inputKey,
        detail: `GET("${inputKey}") -> Read Quorum failed (${healthyReplicas.length}/${readQuorumR}). Returning potentially stale replica value.`,
        nodesInvolved: healthyReplicas
      }, ...prev]);
    }
  };

  // Trigger Node Failure toggle
  const toggleNodeCrash = (nodeId: string) => {
    setNodes(prev => prev.map(n => {
      if (n.id === nodeId) {
        const nextStatus = n.status === 'crashed' ? 'healthy' : 'crashed';
        const now = new Date().toLocaleTimeString('en-US', { hour12: false });
        
        setLogs(l => [{
          id: Math.random().toString(),
          timestamp: now,
          type: 'FAILURE',
          status: nextStatus === 'crashed' ? 'ERROR' : 'SUCCESS',
          detail: `Node ${n.name} (${n.ip}) is now ${nextStatus.toUpperCase()}!`
        }, ...l]);

        return { ...n, status: nextStatus };
      }
      return n;
    }));
  };

  // Trigger Read Repair simulation
  const handleTriggerReadRepair = () => {
    const now = new Date().toLocaleTimeString('en-US', { hour12: false });
    setLogs(prev => [{
      id: Math.random().toString(),
      timestamp: now,
      type: 'REPAIR',
      status: 'SUCCESS',
      detail: 'Read Repair Initiated: Scanned key "cart:88". Synchronized out-of-date replica Node C with latest vector clock from Node B.'
    }, ...prev]);
  };

  // Trigger Anti-Entropy Merkle Tree Sync
  const handleTriggerMerkleSync = () => {
    const now = new Date().toLocaleTimeString('en-US', { hour12: false });
    setMerkleMismatchKey(false);
    setLogs(prev => [{
      id: Math.random().toString(),
      timestamp: now,
      type: 'MERKLE',
      status: 'SUCCESS',
      detail: 'Anti-Entropy Sync Completed: Exchanged Merkle Trees between Node A & Node C. Located 1 leaf hash mismatch [0x7f2a]. Synchronized 2 keys without full database scan.'
    }, ...prev]);
  };

  // Stage Quizzes
  const quizzes = [
    {
      stage: 1,
      question: "Your single-node key-value database memory usage reaches 98%. What is the best architectural fix?",
      options: [
        "A. Reboot the server every hour",
        "B. Partition (shard) keys across a cluster of multiple database servers",
        "C. Delete half your user records",
        "D. Switch to HTML storage"
      ],
      correct: 1,
      explanation: "Data partitioning allows horizontal scaling across multiple machines when a single server hits memory or disk limits."
    },
    {
      stage: 2,
      question: "In modulo sharding hash(key) % N, what happens when you increase N from 4 to 5 servers?",
      options: [
        "A. Only 20% of keys move",
        "B. Almost 100% of keys are remapped to wrong servers, causing massive cache miss stampedes",
        "C. Nothing changes",
        "D. Keys are duplicated automatically"
      ],
      correct: 1,
      explanation: "Modulo hashing changes the denominator for every key, forcing almost all keys to relocate. Consistent hashing solves this!"
    },
    {
      stage: 3,
      question: "Why are Virtual Nodes (VNodes) essential in a Consistent Hash Ring?",
      options: [
        "A. They make database queries 100x faster",
        "B. They map each physical server to multiple points on the ring, ensuring uniform data distribution and eliminating hotspots",
        "C. They encrypt data at rest",
        "D. They replace hard drives with RAM"
      ],
      correct: 1,
      explanation: "Virtual nodes prevent physical server hotspots by spreading a server's responsibility across many ring segments."
    },
    {
      stage: 4,
      question: "To achieve a Replication Factor of N = 3, where are replicas stored on the ring?",
      options: [
        "A. Randomly on any server in the world",
        "B. On the primary coordinator node and the next 2 consecutive distinct physical nodes clockwise around the ring",
        "C. Only on the same machine in different folders",
        "D. On external client web browsers"
      ],
      correct: 1,
      explanation: "Dynamo-style key-value stores walk clockwise around the hash ring to pick N distinct physical replica nodes."
    },
    {
      stage: 5,
      question: "Under the CAP Theorem, during a network partition that isolates two halves of a cluster, what does an AP system choose?",
      options: [
        "A. Refuses all writes to enforce strict consistency",
        "B. Remains Available for reads and writes on both sides, accepting temporary divergence to be reconciled later",
        "C. Shuts down the entire database",
        "D. Deletes out-of-sync records"
      ],
      correct: 1,
      explanation: "AP systems prioritize high Availability over strict Consistency during network partitions (ideal for shopping carts and feeds)."
    },
    {
      stage: 6,
      question: "In Quorum consistency with Replication N = 3, which formula guarantees Strong Consistency (no stale reads)?",
      options: [
        "A. W + R <= N",
        "B. W + R > N (e.g. W = 2, R = 2, N = 3 -> 4 > 3)",
        "C. W = 0, R = 0",
        "D. N = W * R"
      ],
      correct: 1,
      explanation: "When W + R > N, the set of write nodes and read nodes must overlap by at least 1 node holding the latest version!"
    }
  ];

  const currentQuiz = quizzes[(stage - 1) % quizzes.length] || quizzes[0];

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
              <span className="px-3 py-1 bg-amber-500 text-slate-950 font-mono text-xs font-black rounded-full uppercase tracking-wider">
                CHAPTER 6
              </span>
              <span className={`text-xs font-mono font-semibold ${isDarkMode ? 'text-amber-400' : 'text-amber-700'}`}>
                Distributed Key-Value Store Architecture
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold tracking-tight">
              Design Amazon Dynamo &amp; Cassandra
            </h1>
            <p className={`text-xs sm:text-sm leading-relaxed ${isDarkMode ? 'text-slate-300' : 'text-slate-600'}`}>
              Step into the shoes of a Lead Distributed Systems Engineer. Evolve a single-node HashMap into a globally distributed, fault-tolerant, eventually consistent Key-Value Store with Quorums, Vector Clocks, Merkle Trees, and Hinted Handoff.
            </p>
          </div>

          {/* Stage Progression Pills (1 to 10) */}
          <div className={`flex flex-wrap items-center gap-1.5 shrink-0 p-2.5 rounded-2xl border max-w-xs sm:max-w-none ${
            isDarkMode ? 'bg-slate-950/60 backdrop-blur-md border-amber-500/20' : 'bg-slate-100 border-slate-300'
          }`}>
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((stg) => (
              <button
                key={stg}
                onClick={() => setStage(stg)}
                className={`w-8 h-8 rounded-xl font-mono text-xs font-bold transition-all flex items-center justify-center ${
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

      {/* MENTOR / PRINCIPAL ENGINEER DIAGNOSIS BAR */}
      <div className={`p-5 rounded-3xl border space-y-4 ${
        isDarkMode ? 'bg-[#1c1c1e]/90 border-slate-800' : 'bg-white border-slate-200 shadow-xs'
      }`}>
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-amber-500/10 text-amber-500 rounded-2xl border border-amber-500/20">
              <HardDrive className="w-5 h-5" />
            </div>
            <div>
              <h2 className={`text-base font-bold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                {currentMentor.title}
              </h2>
              <p className="text-xs text-slate-500 font-mono">
                Principal Database Engineer Blueprint
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
          <p className="mb-1"><strong>Challenge:</strong> {currentMentor.problem}</p>
          <p className="text-amber-500 dark:text-amber-400 font-medium"><strong>Solution:</strong> {currentMentor.solution}</p>
        </div>
      </div>

      {/* WORKSPACE TAB NAVIGATION */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-2">
        <button
          onClick={() => setActiveTab('canvas')}
          className={`px-4 py-2 rounded-xl font-mono text-xs font-bold flex items-center space-x-2 transition-all ${
            activeTab === 'canvas'
              ? 'bg-amber-500 text-slate-950 shadow-md font-black'
              : isDarkMode ? 'text-slate-400 hover:text-white hover:bg-slate-800' : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Network className="w-4 h-4" />
          <span>Live Cluster Canvas</span>
        </button>

        <button
          onClick={() => setActiveTab('quorum')}
          className={`px-4 py-2 rounded-xl font-mono text-xs font-bold flex items-center space-x-2 transition-all ${
            activeTab === 'quorum'
              ? 'bg-indigo-600 text-white shadow-md'
              : isDarkMode ? 'text-slate-400 hover:text-white hover:bg-slate-800' : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Sliders className="w-4 h-4" />
          <span>Quorum Lab (W + R &gt; N)</span>
        </button>

        <button
          onClick={() => setActiveTab('conflicts')}
          className={`px-4 py-2 rounded-xl font-mono text-xs font-bold flex items-center space-x-2 transition-all ${
            activeTab === 'conflicts'
              ? 'bg-purple-600 text-white shadow-md'
              : isDarkMode ? 'text-slate-400 hover:text-white hover:bg-slate-800' : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <GitBranch className="w-4 h-4" />
          <span>Vector Clocks &amp; Conflicts</span>
        </button>

        <button
          onClick={() => setActiveTab('merkle')}
          className={`px-4 py-2 rounded-xl font-mono text-xs font-bold flex items-center space-x-2 transition-all ${
            activeTab === 'merkle'
              ? 'bg-emerald-600 text-white shadow-md'
              : isDarkMode ? 'text-slate-400 hover:text-white hover:bg-slate-800' : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <GitMerge className="w-4 h-4" />
          <span>Merkle Trees &amp; Anti-Entropy</span>
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
          <span>Operation Logs</span>
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

      {/* TAB 1: LIVE CLUSTER CANVAS & SIDEBARS */}
      {activeTab === 'canvas' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* CENTER 2 COLUMNS: INTERACTIVE TOPOLOGY & RING */}
          <div className={`lg:col-span-2 p-6 rounded-3xl border relative min-h-[520px] flex flex-col justify-between ${
            isDarkMode ? 'bg-[#1c1c1e] border-slate-800' : 'bg-white border-slate-200 shadow-xs'
          }`}>
            <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center space-x-2">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse"></span>
                <h3 className={`text-xs font-bold font-mono uppercase tracking-wider ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                  DISTRIBUTED CLUSTER TOPOLOGY (STAGE {stage})
                </h3>
              </div>

              {/* Status Badges */}
              <div className="flex items-center space-x-2 font-mono text-[10px]">
                <span className={`px-2 py-0.5 rounded font-bold ${
                  isStrongConsistency ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                }`}>
                  {isStrongConsistency ? 'STRONG CONSISTENCY (W+R > N)' : 'EVENTUAL CONSISTENCY'}
                </span>
                <span className="px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-400 font-bold border border-indigo-500/20">
                  N={replicationFactorN} | W={writeQuorumW} | R={readQuorumR}
                </span>
              </div>
            </div>

            {/* VISUAL HASH RING / SINGLE NODE CANVAS */}
            <div className="py-8 flex flex-col items-center justify-center my-auto relative min-h-[340px]">
              
              {isSingleNode ? (
                /* STAGE 1: SINGLE NODE HASHMAP */
                <div className="text-center space-y-4 max-w-md w-full p-6 rounded-3xl border border-amber-500/30 bg-amber-500/5">
                  <div className="p-4 bg-amber-500/10 text-amber-500 rounded-2xl inline-block">
                    <Database className="w-10 h-10 animate-bounce" />
                  </div>
                  <h4 className="text-lg font-bold">Single In-Memory HashMap</h4>
                  <p className="text-xs text-slate-500 font-mono leading-relaxed">
                    HashMap&lt;Key, Value&gt; running on a single server node. RAM Usage: 95% (DANGER). Zero replication, single point of failure.
                  </p>
                  <div className="w-full bg-slate-800 rounded-full h-3 overflow-hidden border border-amber-500/30">
                    <div className="bg-rose-500 h-full w-[95%] animate-pulse"></div>
                  </div>
                  <button
                    onClick={() => setStage(2)}
                    className="px-4 py-2 bg-amber-500 text-slate-950 font-black rounded-xl text-xs font-mono shadow-md hover:bg-amber-400"
                  >
                    Unlock Data Partitioning (Stage 2) →
                  </button>
                </div>
              ) : (
                /* STAGE 2-10: HASH RING TOPOLOGY */
                <div className="relative w-72 h-72 sm:w-80 sm:h-80 rounded-full border-2 border-dashed border-indigo-500/30 flex items-center justify-center">
                  
                  {/* Center Coordinator Icon */}
                  <div className="text-center space-y-1">
                    <div className="p-3 bg-amber-500/10 text-amber-500 rounded-2xl inline-block border border-amber-500/20">
                      <Zap className="w-6 h-6 animate-pulse" />
                    </div>
                    <div className="text-[10px] font-mono font-bold text-slate-400">Consistent Ring</div>
                    <div className="text-[9px] font-mono text-emerald-400 font-bold">360° Key Space</div>
                  </div>

                  {/* Render Cluster Nodes around Ring */}
                  {nodes.map((node) => {
                    const angleRad = (node.ringPosition * Math.PI) / 180;
                    const radius = 130; // Radius of ring in px
                    const x = Math.cos(angleRad) * radius;
                    const y = Math.sin(angleRad) * radius;
                    const isSelected = selectedNodeId === node.id;
                    const isCrashed = node.status === 'crashed';

                    return (
                      <motion.div
                        key={node.id}
                        onClick={() => setSelectedNodeId(node.id)}
                        style={{
                          transform: `translate(${x}px, ${y}px)`,
                        }}
                        className={`absolute p-3 rounded-2xl border cursor-pointer transition-all flex flex-col items-center justify-center shadow-md ${
                          isCrashed
                            ? 'bg-rose-950/80 border-rose-500/80 text-rose-300 animate-pulse'
                            : isSelected
                            ? 'bg-amber-500 text-slate-950 font-bold border-amber-400 ring-4 ring-amber-500/20 scale-110 z-20'
                            : isDarkMode
                            ? 'bg-slate-950 border-slate-800 text-white hover:border-amber-500/50'
                            : 'bg-white border-slate-200 text-slate-900 hover:border-amber-500/50'
                        }`}
                      >
                        <Server className={`w-4 h-4 mb-1 ${isCrashed ? 'text-rose-400' : isSelected ? 'text-slate-950' : 'text-amber-500'}`} />
                        <span className="text-[10px] font-bold font-mono">{node.name}</span>
                        <span className="text-[8px] font-mono opacity-80">{node.ringPosition}°</span>
                      </motion.div>
                    );
                  })}

                  {/* Render Keys mapped on Ring */}
                  {Object.values(kvStore).map((rec: KeyRecord) => {
                    const angleRad = (rec.hash * Math.PI) / 180;
                    const radius = 90; // Inner radius for keys
                    const x = Math.cos(angleRad) * radius;
                    const y = Math.sin(angleRad) * radius;

                    return (
                      <div
                        key={rec.key}
                        style={{ transform: `translate(${x}px, ${y}px)` }}
                        className="absolute p-1.5 rounded-lg bg-indigo-600 text-white font-mono text-[9px] font-bold shadow-sm border border-indigo-400/30 flex items-center space-x-1"
                        title={`Key: ${rec.key} -> Value: ${rec.value}`}
                      >
                        <Database className="w-3 h-3 text-amber-300" />
                        <span>{rec.key.split(':')[0]}</span>
                      </div>
                    );
                  })}

                  {/* Network Partition Visual Divider if Active */}
                  {isPartitioned && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
                      <div className="w-full h-0.5 bg-rose-500/80 animate-pulse flex items-center justify-between px-2">
                        <span className="bg-rose-600 text-white text-[9px] font-bold font-mono px-2 py-0.5 rounded-full">PARTITION ISOLATION WALL</span>
                        <ZapOff className="w-4 h-4 text-rose-500 animate-ping" />
                      </div>
                    </div>
                  )}
                </div>
              )}

            </div>

            {/* LIVE SYSTEM METRICS BOARD */}
            <div className="pt-4 border-t border-slate-200 dark:border-slate-800 grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className={`p-3 rounded-xl border ${isDarkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
                <span className="text-[10px] text-slate-400 uppercase font-mono font-bold block">Cluster Nodes</span>
                <p className="text-sm font-bold font-mono text-amber-400">{nodes.filter(n => n.status === 'healthy').length} / {nodes.length} Healthy</p>
              </div>
              <div className={`p-3 rounded-xl border ${isDarkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
                <span className="text-[10px] text-slate-400 uppercase font-mono font-bold block">Replication N</span>
                <p className="text-sm font-bold font-mono text-indigo-400">N={replicationFactorN} Replicas</p>
              </div>
              <div className={`p-3 rounded-xl border ${isDarkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
                <span className="text-[10px] text-slate-400 uppercase font-mono font-bold block">Write / Read Quorum</span>
                <p className="text-sm font-bold font-mono text-emerald-400">W={writeQuorumW} / R={readQuorumR}</p>
              </div>
              <div className={`p-3 rounded-xl border ${isDarkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
                <span className="text-[10px] text-slate-400 uppercase font-mono font-bold block">Consistency SLA</span>
                <p className={`text-sm font-bold font-mono ${isStrongConsistency ? 'text-emerald-400' : 'text-amber-400'}`}>
                  {isStrongConsistency ? '100% Strong' : 'Eventual'}
                </p>
              </div>
            </div>
          </div>

          {/* RIGHT 1 COLUMN: CLUSTER EXPLORER & NODE INSPECTOR */}
          <div className={`p-6 rounded-3xl border space-y-5 ${
            isDarkMode ? 'bg-[#1c1c1e] border-slate-800' : 'bg-white border-slate-200 shadow-xs'
          }`}>
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center space-x-2">
                <Server className="w-4 h-4 text-amber-500" />
                <h3 className={`text-sm font-bold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                  Cluster Node Inspector
                </h3>
              </div>
              <span className="px-2 py-0.5 bg-amber-500/10 text-amber-500 rounded font-mono text-[10px] font-bold">
                {nodes.length} Physical Nodes
              </span>
            </div>

            {/* Selected Node Details */}
            {selectedNodeId ? (() => {
              const selectedNode = nodes.find(n => n.id === selectedNodeId) || nodes[0];
              const isCrashed = selectedNode.status === 'crashed';

              return (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-base font-extrabold text-amber-500 font-mono">
                        {selectedNode.name}
                      </h4>
                      <span className="text-[10px] text-slate-500 font-mono">{selectedNode.ip} • Region: {selectedNode.dc}</span>
                    </div>
                    <span className={`px-2.5 py-1 rounded-full text-[10px] font-mono font-bold uppercase ${
                      isCrashed ? 'bg-rose-500 text-white' : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                    }`}>
                      {selectedNode.status}
                    </span>
                  </div>

                  {/* Node Metrics */}
                  <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                    <div className={`p-2.5 rounded-xl border ${isDarkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
                      <span className="text-slate-400 text-[10px] block">Ring Position</span>
                      <span className="font-bold">{selectedNode.ringPosition}°</span>
                    </div>
                    <div className={`p-2.5 rounded-xl border ${isDarkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
                      <span className="text-slate-400 text-[10px] block">Storage Used</span>
                      <span className="font-bold">{selectedNode.storageMb} MB</span>
                    </div>
                    <div className={`p-2.5 rounded-xl border ${isDarkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
                      <span className="text-slate-400 text-[10px] block">Keys Stored</span>
                      <span className="font-bold">{selectedNode.keysCount} Keys</span>
                    </div>
                    <div className={`p-2.5 rounded-xl border ${isDarkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
                      <span className="text-slate-400 text-[10px] block">VNodes Count</span>
                      <span className="font-bold">{selectedNode.vnodes} VNodes</span>
                    </div>
                  </div>

                  {/* Interactive Node Fault Injection Buttons */}
                  <div className="space-y-2 pt-2 border-t border-slate-200 dark:border-slate-800">
                    <span className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider block">
                      Fault Injection &amp; Chaos Controls
                    </span>
                    <button
                      onClick={() => toggleNodeCrash(selectedNode.id)}
                      className={`w-full py-2 px-3 rounded-xl text-xs font-bold font-mono transition-all flex items-center justify-center space-x-2 ${
                        isCrashed
                          ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                          : 'bg-rose-600 hover:bg-rose-500 text-white shadow-md'
                      }`}
                    >
                      <ZapOff className="w-3.5 h-3.5" />
                      <span>{isCrashed ? 'Recover & Bring Node Online' : 'Inject Crash Fault on Node'}</span>
                    </button>
                  </div>
                </div>
              );
            })() : (
              <div className="text-xs text-slate-500 font-mono text-center py-6">Select a node on the hash ring to inspect.</div>
            )}

            {/* QUICK DATABASE OPERATIONAL CONSOLE (PUT / GET) */}
            <div className="space-y-3 pt-4 border-t border-slate-200 dark:border-slate-800">
              <span className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider block">
                Database Operation Console
              </span>

              <div className="space-y-2 font-mono text-xs">
                <div>
                  <label className="text-[10px] text-slate-500 block">Key</label>
                  <input
                    type="text"
                    value={inputKey}
                    onChange={(e) => setInputKey(e.target.value)}
                    className={`w-full p-2 rounded-xl border ${
                      isDarkMode ? 'bg-slate-950 border-slate-800 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'
                    }`}
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-500 block">Value Payload</label>
                  <input
                    type="text"
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    className={`w-full p-2 rounded-xl border ${
                      isDarkMode ? 'bg-slate-950 border-slate-800 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'
                    }`}
                  />
                </div>

                <div className="grid grid-cols-2 gap-2 pt-1">
                  <button
                    onClick={handleExecutePut}
                    className="py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black rounded-xl text-xs shadow-md"
                  >
                    PUT(key, val)
                  </button>
                  <button
                    onClick={handleExecuteGet}
                    className="py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl text-xs shadow-md"
                  >
                    GET(key)
                  </button>
                </div>
              </div>
            </div>

            <div className="space-y-2 pt-4 border-t border-slate-200 dark:border-slate-800">
              <span className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider block">
                Storage Engine Path (Production)
              </span>
              <div className={`p-3 rounded-xl border text-[11px] font-mono leading-relaxed ${
                isDarkMode ? 'bg-slate-950 border-slate-800 text-slate-300' : 'bg-slate-50 border-slate-200 text-slate-700'
              }`}>
                <p><strong>Write path:</strong> Client PUT -&gt; append to WAL -&gt; update MemTable -&gt; async flush to immutable SSTable.</p>
                <p className="mt-1"><strong>Read path:</strong> Check MemTable -&gt; Bloom Filter -&gt; candidate SSTables -&gt; return newest version by vector clock.</p>
                <p className="mt-1"><strong>Repair path:</strong> Gossip detects failure -&gt; hinted handoff buffers writes -&gt; Merkle tree sync repairs only divergent key ranges.</p>
              </div>
            </div>

          </div>

        </div>
      )}

      {/* TAB 2: QUORUM CONSISTENCY LAB (W + R > N) */}
      {activeTab === 'quorum' && (
        <div className={`p-6 rounded-3xl border space-y-6 ${
          isDarkMode ? 'bg-[#1c1c1e] border-slate-800' : 'bg-white border-slate-200'
        }`}>
          <div className="flex items-center space-x-3 pb-4 border-b border-slate-200 dark:border-slate-800">
            <div className="p-2.5 bg-indigo-500/10 text-indigo-500 rounded-2xl border border-indigo-500/20">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold font-mono">Tunable Quorum Consistency Simulator</h3>
              <p className="text-xs text-slate-500 font-mono">Formula: W + R &gt; N for Strong Consistency (Zero Stale Reads)</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Sliders */}
            <div className={`p-5 rounded-2xl border space-y-5 ${
              isDarkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'
            }`}>
              <div className="space-y-2">
                <div className="flex justify-between text-xs font-mono font-bold">
                  <span>Replication Factor (N)</span>
                  <span className="text-indigo-400">{replicationFactorN} Replicas</span>
                </div>
                <input
                  type="range"
                  min={1}
                  max={5}
                  value={replicationFactorN}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    setReplicationFactorN(n);
                    if (writeQuorumW > n) setWriteQuorumW(n);
                    if (readQuorumR > n) setReadQuorumR(n);
                  }}
                  className="w-full accent-indigo-500"
                />
              </div>

              <div className="space-y-2">
                <div className="flex justify-between text-xs font-mono font-bold">
                  <span>Write Quorum (W)</span>
                  <span className="text-amber-400">W = {writeQuorumW} Nodes</span>
                </div>
                <input
                  type="range"
                  min={1}
                  max={replicationFactorN}
                  value={writeQuorumW}
                  onChange={(e) => setWriteQuorumW(Number(e.target.value))}
                  className="w-full accent-amber-500"
                />
              </div>

              <div className="space-y-2">
                <div className="flex justify-between text-xs font-mono font-bold">
                  <span>Read Quorum (R)</span>
                  <span className="text-emerald-400">R = {readQuorumR} Nodes</span>
                </div>
                <input
                  type="range"
                  min={1}
                  max={replicationFactorN}
                  value={readQuorumR}
                  onChange={(e) => setReadQuorumR(Number(e.target.value))}
                  className="w-full accent-emerald-500"
                />
              </div>
            </div>

            {/* Quorum Visual Math Verification */}
            <div className={`md:col-span-2 p-5 rounded-2xl border space-y-4 flex flex-col justify-between ${
              isDarkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'
            }`}>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono font-bold uppercase text-slate-400">Quorum Inequality Verification</span>
                  <span className={`px-3 py-1 rounded-full text-xs font-mono font-extrabold ${
                    isStrongConsistency ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                  }`}>
                    {isStrongConsistency ? '✓ STRONG CONSISTENCY GUARANTEED' : '⚠ EVENTUAL CONSISTENCY (STALE READ POSSIBLE)'}
                  </span>
                </div>

                <div className="text-center py-6 font-mono space-y-2">
                  <div className="text-2xl sm:text-3xl font-black">
                    W ({writeQuorumW}) + R ({readQuorumR}) = <span className="text-indigo-400">{writeQuorumW + readQuorumR}</span>
                    <span className="mx-2 text-slate-500">{isStrongConsistency ? '>' : '≤'}</span>
                    N ({replicationFactorN})
                  </div>
                  <p className="text-xs text-slate-400 max-w-md mx-auto">
                    {isStrongConsistency
                      ? 'Write and Read node sets overlap by at least 1 replica. Every GET operation is mathematically guaranteed to see the latest write.'
                      : 'Write and Read sets might NOT overlap. A GET operation may hit replicas that have not received the latest write payload.'}
                  </p>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex justify-end">
                <button
                  onClick={handleTriggerReadRepair}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-mono font-bold rounded-xl shadow-md flex items-center space-x-2"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Simulate Background Read Repair</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: VECTOR CLOCKS & CONFLICT LAB */}
      {activeTab === 'conflicts' && (
        <div className={`p-6 rounded-3xl border space-y-6 ${
          isDarkMode ? 'bg-[#1c1c1e] border-slate-800' : 'bg-white border-slate-200'
        }`}>
          <div className="flex items-center space-x-3 pb-4 border-b border-slate-200 dark:border-slate-800">
            <div className="p-2.5 bg-purple-500/10 text-purple-500 rounded-2xl border border-purple-500/20">
              <GitBranch className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold font-mono">Vector Clocks &amp; Concurrent Conflict Resolution</h3>
              <p className="text-xs text-slate-500 font-mono">Detecting divergent sibling branches when concurrent PUTs bypass physical clock ordering</p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Branch A */}
            <div className={`p-5 rounded-2xl border space-y-3 ${
              isDarkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'
            }`}>
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono font-bold text-indigo-400">Concurrent PUT @ Node A (US-East)</span>
                <span className="px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-400 font-mono text-[10px] font-bold">Vector: [NodeA: 2, NodeB: 1]</span>
              </div>
              <input
                type="text"
                value={valBranchA}
                onChange={(e) => setValBranchA(e.target.value)}
                className={`w-full p-2.5 rounded-xl border text-xs font-mono ${
                  isDarkMode ? 'bg-[#1c1c1e] border-slate-800 text-white' : 'bg-white border-slate-200 text-slate-900'
                }`}
              />
              <p className="text-[10px] text-slate-500 font-mono">User A added [Laptop] on US-East data center.</p>
            </div>

            {/* Branch B */}
            <div className={`p-5 rounded-2xl border space-y-3 ${
              isDarkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'
            }`}>
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono font-bold text-amber-400">Concurrent PUT @ Node C (EU-West)</span>
                <span className="px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 font-mono text-[10px] font-bold">Vector: [NodeA: 1, NodeC: 2]</span>
              </div>
              <input
                type="text"
                value={valBranchB}
                onChange={(e) => setValBranchB(e.target.value)}
                className={`w-full p-2.5 rounded-xl border text-xs font-mono ${
                  isDarkMode ? 'bg-[#1c1c1e] border-slate-800 text-white' : 'bg-white border-slate-200 text-slate-900'
                }`}
              />
              <p className="text-[10px] text-slate-500 font-mono">User B added [Headphones] on EU-West data center simultaneously.</p>
            </div>
          </div>

          <div className="p-4 rounded-2xl border bg-purple-500/10 border-purple-500/30 text-center space-y-3">
            <div className="text-xs font-mono font-bold text-purple-400 uppercase">Conflict Detected: Sibling Versions Created</div>
            <p className="text-xs text-slate-400 max-w-lg mx-auto font-mono">
              Vector clock vector comparison [NodeA:2, NodeB:1] vs [NodeA:1, NodeC:2] indicates neither version dominates the other.
            </p>
            <div className="flex justify-center space-x-3 pt-1">
              <button
                onClick={() => {
                  setInputValue(`${valBranchA} + ${valBranchB}`);
                  handleExecutePut();
                }}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-mono font-bold shadow-md"
              >
                Resolve Sibling Conflict (Merge Both)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: MERKLE TREES & ANTI-ENTROPY LAB */}
      {activeTab === 'merkle' && (
        <div className={`p-6 rounded-3xl border space-y-6 ${
          isDarkMode ? 'bg-[#1c1c1e] border-slate-800' : 'bg-white border-slate-200'
        }`}>
          <div className="flex items-center space-x-3 pb-4 border-b border-slate-200 dark:border-slate-800">
            <div className="p-2.5 bg-emerald-500/10 text-emerald-500 rounded-2xl border border-emerald-500/20">
              <GitMerge className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold font-mono">Merkle Trees &amp; Anti-Entropy Synchronization</h3>
              <p className="text-xs text-slate-500 font-mono">Comparing hierarchical hash trees between nodes to find out-of-sync keys without full scans</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Node A Merkle Tree */}
            <div className={`p-5 rounded-2xl border space-y-4 ${
              isDarkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'
            }`}>
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono font-bold text-indigo-400">Node A (Primary Master)</span>
                <span className="text-[10px] font-mono text-emerald-400 font-bold">Root Hash: 0xa8f9c</span>
              </div>

              <div className="space-y-2 font-mono text-xs">
                <div className="p-2 bg-indigo-500/10 rounded-lg text-center font-bold">
                  Root [Range 0° - 360°]: 0xa8f9c
                </div>
                <div className="grid grid-cols-2 gap-2 text-[10px]">
                  <div className="p-2 bg-slate-800/80 rounded text-center">Left [0°-180°]: 0xb3e21</div>
                  <div className="p-2 bg-slate-800/80 rounded text-center">Right [180°-360°]: 0xc7d42</div>
                </div>
              </div>
            </div>

            {/* Node C Merkle Tree */}
            <div className={`p-5 rounded-2xl border space-y-4 ${
              isDarkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'
            }`}>
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono font-bold text-amber-400">Node C (Replica Node)</span>
                <span className={`text-[10px] font-mono font-bold ${merkleMismatchKey ? 'text-rose-400 animate-pulse' : 'text-emerald-400'}`}>
                  Root Hash: {merkleMismatchKey ? '0xMISMATCH' : '0xa8f9c'}
                </span>
              </div>

              <div className="space-y-2 font-mono text-xs">
                <div className={`p-2 rounded-lg text-center font-bold ${
                  merkleMismatchKey ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40' : 'bg-amber-500/10'
                }`}>
                  Root [Range 0° - 360°]: {merkleMismatchKey ? '0xMISMATCH' : '0xa8f9c'}
                </div>
                <div className="grid grid-cols-2 gap-2 text-[10px]">
                  <div className="p-2 bg-slate-800/80 rounded text-center">Left [0°-180°]: 0xb3e21</div>
                  <div className={`p-2 rounded text-center ${
                    merkleMismatchKey ? 'bg-rose-500/30 text-rose-300 font-bold border border-rose-500' : 'bg-slate-800/80'
                  }`}>
                    Right [180°-360°]: {merkleMismatchKey ? '0x7f2a (Out of Sync)' : '0xc7d42'}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-between items-center pt-3 border-t border-slate-200 dark:border-slate-800">
            <button
              onClick={() => setMerkleMismatchKey(true)}
              className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white text-xs font-mono font-bold rounded-xl shadow-md"
            >
              Inject Merkle Hash Mismatch
            </button>
            <button
              onClick={handleTriggerMerkleSync}
              className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-mono font-bold rounded-xl shadow-md flex items-center space-x-2"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Run Anti-Entropy Sync</span>
            </button>
          </div>
        </div>
      )}

      {/* TAB 5: OPERATION LOGS */}
      {activeTab === 'logs' && (
        <div className={`p-6 rounded-3xl border space-y-4 ${
          isDarkMode ? 'bg-[#1c1c1e] border-slate-800' : 'bg-white border-slate-200'
        }`}>
          <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
            <div className="flex items-center space-x-2">
              <Terminal className="w-4 h-4 text-emerald-400" />
              <h3 className="text-sm font-bold font-mono">Live Database Request &amp; Replication Log</h3>
            </div>
            <button
              onClick={() => setLogs([])}
              className="text-[10px] text-slate-400 hover:text-white font-mono"
            >
              Clear Logs
            </button>
          </div>

          <div className="space-y-2 max-h-96 overflow-y-auto pr-1 font-mono text-xs">
            {logs.map((log) => (
              <div
                key={log.id}
                className={`p-3 rounded-xl border flex items-start space-x-3 ${
                  log.status === 'ERROR'
                    ? 'bg-rose-950/40 border-rose-800/80 text-rose-300'
                    : log.status === 'STALE_READ' || log.status === 'WARN'
                    ? 'bg-amber-950/40 border-amber-800/80 text-amber-300'
                    : log.status === 'QUORUM_OK'
                    ? 'bg-emerald-950/40 border-emerald-800/80 text-emerald-300'
                    : isDarkMode ? 'bg-slate-950 border-slate-800 text-slate-300' : 'bg-slate-50 border-slate-200 text-slate-700'
                }`}
              >
                <span className="text-[10px] text-slate-500 shrink-0">{log.timestamp}</span>
                <span className={`px-2 py-0.5 rounded text-[9px] font-bold shrink-0 ${
                  log.type === 'PUT' ? 'bg-amber-500/20 text-amber-400' : 'bg-indigo-500/20 text-indigo-400'
                }`}>
                  {log.type}
                </span>
                <p className="flex-1 text-xs leading-relaxed">{log.detail}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 6: ARCHITECT STAGE QUIZ */}
      {activeTab === 'quiz' && (
        <div className={`p-6 rounded-3xl border space-y-6 ${
          isDarkMode ? 'bg-[#1c1c1e] border-slate-800' : 'bg-white border-slate-200'
        }`}>
          <div className="flex items-center space-x-3 pb-4 border-b border-slate-200 dark:border-slate-800">
            <div className="p-2.5 bg-amber-500/10 text-amber-500 rounded-2xl border border-amber-500/20">
              <Award className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold font-mono">Stage Architect Challenge (Stage {stage})</h3>
              <p className="text-xs text-slate-500 font-mono">Test your distributed database engineering decision intuition</p>
            </div>
          </div>

          <div className="space-y-4 max-w-2xl">
            <h4 className="text-sm font-bold leading-relaxed">{currentQuiz.question}</h4>

            <div className="space-y-2 font-mono text-xs">
              {currentQuiz.options.map((opt, idx) => (
                <button
                  key={idx}
                  onClick={() => {
                    if (idx === currentQuiz.correct) {
                      alert("✓ Correct! " + currentQuiz.explanation);
                    } else {
                      alert("❌ Incorrect. Try again!");
                    }
                  }}
                  className={`w-full p-3 text-left rounded-xl border transition-all hover:border-amber-500 ${
                    isDarkMode ? 'bg-slate-950 border-slate-800 text-slate-200' : 'bg-slate-50 border-slate-200 text-slate-800'
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
