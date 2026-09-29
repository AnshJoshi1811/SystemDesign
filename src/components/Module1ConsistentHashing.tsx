import React, { useState, useEffect, useRef } from 'react';
import { PhysicalServer, HashKey } from '../types';
import {
  hashToKey,
  assignKeysToRingNodes,
  getLookupPath,
  getDefaultServers,
  generateSampleKeys,
  makeServer,
  serversToRingNodes,
  countMovedTraditional,
  HASH_SPACE_MAX,
  SERVER_COLORS,
} from '../lib/hash';
import { HashRingCanvas } from './HashRingCanvas';
import { usePersistentState } from '../lib/usePersistentState';
import { LessonGoal, Takeaway, Term, Quiz, QuizQuestion } from './learn/LearningKit';
import { motion } from 'motion/react';
import {
  Server,
  Plus,
  Trash2,
  Search,
  CheckCircle2,
  TrendingDown,
  Play,
  Activity,
  MousePointerClick,
  Info,
  Sparkles,
  Zap,
  RefreshCw,
  AlertTriangle,
} from 'lucide-react';

interface Module1ConsistentHashingProps {
  isDarkMode?: boolean;
}

type Tab = 'lookup' | 'servers' | 'traffic' | 'migration';

interface MigrationStats {
  totalKeys: number;
  movedKeys: number;
  movedPct: number;
  moduloMoved: number;
  moduloPct: number;
  idealKeys: number;
  idealPct: number;
  fromN: number;
  toN: number;
  affectedServerName: string;
  actionType: 'added' | 'removed';
  /** Every moved key went to (or came from) the affected server — no shuffling between the others. */
  onlyAffectedServer: boolean;
}

const MAX_SERVERS = 8;
const DEFAULT_KEY_COUNT = 25;

const QUIZ: QuizQuestion[] = [
  {
    question: 'A key hashes to 100°. Servers sit at 40°, 150° and 300°. Which server owns the key?',
    options: [
      {
        text: 'The server at 150°',
        correct: true,
        why: 'Walk clockwise (increasing angle) from 100° — the first server you meet is at 150°.',
      },
      {
        text: 'The server at 40°',
        why: '40° is the closest server behind the key. Lookup only ever walks clockwise, never backwards.',
      },
      {
        text: 'Whichever server is nearest in either direction',
        why: 'Nearest-either-way would make ownership ambiguous at the midpoint. The rule is strictly clockwise, so every key has exactly one owner.',
      },
    ],
  },
  {
    question: 'A key hashes to 330°. Servers sit at 40°, 150° and 300°. Which server owns it?',
    options: [
      {
        text: 'The server at 40°, after wrapping past 0°',
        correct: true,
        why: 'No server lies between 330° and 360°, so the walk wraps past 0 / 2^32 and reaches 40°. This wrap-around is why the hash space is a ring.',
      },
      {
        text: 'The server at 300°',
        why: '300° is behind the key. Clockwise from 330° you pass 360° → 0° before meeting any server.',
      },
      {
        text: 'No server — the key is past the last server',
        why: 'On a ring there is no "past the end": the search wraps around to the first server.',
      },
    ],
  },
  {
    question: 'A fifth server is added to a 4-server ring. Which keys move?',
    options: [
      {
        text: 'Only keys in the arc between the new server and the server before it — they move to the new server',
        correct: true,
        why: 'Those keys now meet the new server first when walking clockwise. Every other key still meets the same server as before.',
      },
      {
        text: 'About 1/5 of every server’s keys, so load stays equal',
        why: 'That is what modulo-style rebalancing would aim for. On a ring the new server takes keys from only one neighbour, which is why a basic ring can end up uneven.',
      },
      {
        text: 'Most keys, like with hash % N',
        why: 'The ring never uses N in a key’s address, so adding a server only affects the one arc it lands in.',
      },
    ],
  },
];

const initialKeys = () => assignKeysToRingNodes(generateSampleKeys(DEFAULT_KEY_COUNT, 'AppKey'), serversToRingNodes(getDefaultServers()));

export const Module1ConsistentHashing: React.FC<Module1ConsistentHashingProps> = ({ isDarkMode = false }) => {
  const [servers, setServers] = useState<PhysicalServer[]>(getDefaultServers());
  const [keys, setKeys] = useState<HashKey[]>(initialKeys);
  // Server ids only ever count up, so a crash followed by an add never produces two "S3"s.
  const [nextServerIdx, setNextServerIdx] = useState<number>(4);

  // Right Panel Tab State
  const [activeTab, setActiveTab] = usePersistentState<Tab>('chapter5:module1:tab', 'lookup');

  // Lookup Animation state
  const [selectedKey, setSelectedKey] = useState<HashKey | null>(null);
  const [lookupSearchInput, setLookupSearchInput] = useState<string>('AppKey_12');
  const [animatedTracerAngle, setAnimatedTracerAngle] = useState<number | null>(null);
  const [lookupTargetServer, setLookupTargetServer] = useState<PhysicalServer | null>(null);

  // Traffic Simulation State
  const [isSimulatingTraffic, setIsSimulatingTraffic] = useState<boolean>(false);
  const [trafficRequestsCount, setTrafficRequestsCount] = useState<number>(0);
  const [serverRequestCounts, setServerRequestCounts] = useState<Record<string, number>>({});
  const [customRequestInput, setCustomRequestInput] = useState<string>('User_Req_1');
  const [recentRequestLogs, setRecentRequestLogs] = useState<Array<{
    id: string;
    keyString: string;
    angle: number;
    hashHex: string;
    assignedServerName: string;
    assignedServerColor: string;
  }>>([]);

  // Affected arc highlight state
  const [highlightArc, setHighlightArc] = useState<{ startAngle: number; endAngle: number; color?: string } | null>(null);

  const [migrationStats, setMigrationStats] = useState<MigrationStats | null>(null);

  const lookupTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const burstTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestSeqRef = useRef(0);

  useEffect(
    () => () => {
      if (lookupTimerRef.current) clearInterval(lookupTimerRef.current);
      if (burstTimerRef.current) clearInterval(burstTimerRef.current);
      if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
    },
    []
  );

  const ringNodes = serversToRingNodes(servers);

  const ownerOf = (key: HashKey, nodes = ringNodes, list = servers) => {
    const path = getLookupPath(key, nodes);
    return { path, server: path ? list.find((s) => s.id === path.targetNode.physicalServerId) || null : null };
  };

  const flashArc = (arc: { startAngle: number; endAngle: number; color?: string }) => {
    setHighlightArc(arc);
    if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
    highlightTimerRef.current = setTimeout(() => setHighlightArc(null), 3000);
  };

  // Dragging a server (or its angle slider) moves its point on the ring; keys are re-owned immediately.
  const handleServerDrag = (serverId: string, newAngle: number) => {
    const next = servers.map((s) => (s.id === serverId ? { ...s, angle: newAngle } : s));
    setServers(next);
    setKeys((prev) => assignKeysToRingNodes(prev, serversToRingNodes(next)));
  };

  // Execute Animated Key Lookup: sweep a tracer clockwise from the key to its owner.
  const handlePerformLookup = (targetKey?: HashKey) => {
    const keyToSearch = targetKey || hashToKey(lookupSearchInput || 'AppKey_12');
    const { path, server } = ownerOf(keyToSearch);
    setSelectedKey(keyToSearch);
    setLookupTargetServer(null);
    if (!path) return;

    const startAngle = path.startAngle;
    let targetAngle = path.endAngle;
    if (targetAngle < startAngle) targetAngle += 360; // wrap past 0 / 2^32

    if (lookupTimerRef.current) clearInterval(lookupTimerRef.current);
    const steps = 25;
    let stepCount = 0;
    lookupTimerRef.current = setInterval(() => {
      stepCount++;
      setAnimatedTracerAngle((startAngle + (targetAngle - startAngle) * (stepCount / steps)) % 360);
      if (stepCount >= steps) {
        if (lookupTimerRef.current) clearInterval(lookupTimerRef.current);
        lookupTimerRef.current = null;
        setLookupTargetServer(server);
      }
    }, 18);
  };

  // Click on the ring: place a key at that exact position and look it up.
  const handleRingClick = (clickAngle: number) => {
    const hashValue = Math.min(HASH_SPACE_MAX, Math.floor((clickAngle / 360) * HASH_SPACE_MAX));
    const seq = ++requestSeqRef.current;
    const [customKey] = assignKeysToRingNodes(
      [
        {
          id: `Placed_${seq}`,
          keyString: `Key@${clickAngle.toFixed(0)}°`,
          hashValue,
          hashHex: '0x' + hashValue.toString(16).padStart(8, '0').toUpperCase(),
          angle: clickAngle,
        },
      ],
      ringNodes
    );
    setKeys((prev) => [customKey, ...prev.slice(0, 59)]);
    handlePerformLookup(customKey);
  };

  // Every request — typed, burst or auto-traffic — goes through the same clockwise lookup and log.
  const handleSendSingleRequest = (customStr?: string) => {
    const keyStr = (customStr !== undefined ? customStr : customRequestInput).trim() || `Req_${++requestSeqRef.current}`;
    const testKey = hashToKey(keyStr);
    const { path, server } = ownerOf(testKey);

    setSelectedKey(testKey);
    setLookupTargetServer(server);
    setAnimatedTracerAngle(path ? path.endAngle : testKey.angle);
    setTrafficRequestsCount((prev) => prev + 1);

    if (server) {
      setServerRequestCounts((prev) => ({ ...prev, [server.id]: (prev[server.id] || 0) + 1 }));
      setRecentRequestLogs((prev) => [
        {
          id: `${testKey.id}_${++requestSeqRef.current}`,
          keyString: testKey.keyString,
          angle: testKey.angle,
          hashHex: testKey.hashHex,
          assignedServerName: server.name,
          assignedServerColor: server.color,
        },
        ...prev.slice(0, 19),
      ]);
    }
  };

  // The interval must always call the latest version (it sees the current servers).
  const sendRef = useRef(handleSendSingleRequest);
  sendRef.current = handleSendSingleRequest;

  // Auto traffic: real hashed request keys (Req_1, Req_2, ...) through the normal lookup path.
  useEffect(() => {
    if (!isSimulatingTraffic) return;
    const interval = setInterval(() => sendRef.current(`Req_${++requestSeqRef.current}`), 450);
    return () => clearInterval(interval);
  }, [isSimulatingTraffic]);

  // Dispatch Burst of 10 Requests
  const handleDispatchBurst = () => {
    if (burstTimerRef.current) clearInterval(burstTimerRef.current);
    let count = 0;
    burstTimerRef.current = setInterval(() => {
      sendRef.current(`Burst_${++requestSeqRef.current}`);
      count++;
      if (count >= 10 && burstTimerRef.current) {
        clearInterval(burstTimerRef.current);
        burstTimerRef.current = null;
      }
    }, 180);
  };

  /** Apply a membership change and measure it three ways: this ring, hash % N on the same keys, and k/n. */
  const applyClusterChange = (newServers: PhysicalServer[], affected: PhysicalServer, actionType: 'added' | 'removed') => {
    const remapped = assignKeysToRingNodes(keys, serversToRingNodes(newServers));
    const movedList = remapped.filter((k) => k.isMoved);
    const moved = movedList.length;
    const total = keys.length || 1;
    const moduloMoved = countMovedTraditional(keys, servers, newServers);
    const n = Math.max(servers.length, newServers.length);

    setServers(newServers);
    setKeys(remapped);
    setMigrationStats({
      totalKeys: keys.length,
      movedKeys: moved,
      movedPct: Number(((moved / total) * 100).toFixed(1)),
      moduloMoved,
      moduloPct: Number(((moduloMoved / total) * 100).toFixed(1)),
      idealKeys: Number((keys.length / n).toFixed(1)),
      idealPct: Number((100 / n).toFixed(1)),
      fromN: servers.length,
      toN: newServers.length,
      affectedServerName: affected.name,
      actionType,
      onlyAffectedServer: movedList.every((k) =>
        actionType === 'added' ? k.assignedServerId === affected.id : k.previousServerId === affected.id
      ),
    });
    setActiveTab('migration');
  };

  // Add Server with Affected Arc Highlight
  const handleAddServer = () => {
    if (servers.length >= MAX_SERVERS) return;
    const base = makeServer(nextServerIdx);
    const freeColor = SERVER_COLORS.find((c) => !servers.some((s) => s.color === c)) || base.color;
    const newServer: PhysicalServer = { ...base, color: freeColor };
    setNextServerIdx((i) => i + 1);

    const newServersList = [...servers, newServer];
    const sorted = serversToRingNodes(newServersList);
    const pos = sorted.findIndex((s) => s.id === newServer.id);
    const prev = sorted[(pos - 1 + sorted.length) % sorted.length];
    flashArc({ startAngle: prev.angle, endAngle: newServer.angle, color: newServer.color });

    applyClusterChange(newServersList, newServer, 'added');
  };

  // Remove (crash) a server: its arc is absorbed by the next server clockwise.
  const handleRemoveServer = (serverId: string) => {
    if (servers.length <= 1) return;
    const targetServer = servers.find((s) => s.id === serverId);
    if (!targetServer) return;
    const remaining = servers.filter((s) => s.id !== serverId);

    const sorted = serversToRingNodes(servers);
    const pos = sorted.findIndex((s) => s.id === serverId);
    const prev = sorted[(pos - 1 + sorted.length) % sorted.length];
    const successor = servers.find((s) => s.id === sorted[(pos + 1) % sorted.length].physicalServerId);
    flashArc({ startAngle: prev.angle, endAngle: targetServer.angle, color: successor?.color });

    applyClusterChange(remaining, targetServer, 'removed');
  };

  // Reset to default
  const handleResetCluster = () => {
    if (lookupTimerRef.current) clearInterval(lookupTimerRef.current);
    if (burstTimerRef.current) clearInterval(burstTimerRef.current);
    setIsSimulatingTraffic(false);
    setServers(getDefaultServers());
    setKeys(initialKeys());
    setNextServerIdx(4);
    setSelectedKey(null);
    setLookupTargetServer(null);
    setAnimatedTracerAngle(null);
    setHighlightArc(null);
    setMigrationStats(null);
    setTrafficRequestsCount(0);
    setServerRequestCounts({});
    setRecentRequestLogs([]);
  };

  const handleReshuffleKeys = () => {
    const batch = ++requestSeqRef.current;
    setKeys(assignKeysToRingNodes(generateSampleKeys(DEFAULT_KEY_COUNT, `AppKey_b${batch}`), ringNodes));
    setMigrationStats(null);
  };

  // Compute Partition Arc sizes & imbalance calculation
  const sortedServers = [...servers].sort((a, b) => a.angle - b.angle);
  const arcs = sortedServers.map((s, idx) => {
    const prev = sortedServers[(idx - 1 + sortedServers.length) % sortedServers.length];
    let arc = s.angle - prev.angle;
    if (arc <= 0) arc += 360;
    return { server: s, arcDegrees: arc };
  });

  // Calculate standard deviation of key assignment for health badge
  const countsPerServer = servers.map(s => keys.filter(k => k.assignedServerId === s.id).length);
  const avgKeys = keys.length / (servers.length || 1);
  const variance = countsPerServer.reduce((acc, val) => acc + Math.pow(val - avgKeys, 2), 0) / (servers.length || 1);
  const stdDev = Math.sqrt(variance);
  const isImbalanced = stdDev > avgKeys * 0.4;

  // Sample quick-lookup chips
  const sampleLookupChips = ['AppKey_12', 'User_301', 'Cache_Hero', 'Session_99', 'Order_404', 'Database_77'];
  const crashTarget = servers.find((s) => s.id === 'S1') || servers[1];

  return (
    <div className="space-y-6 max-w-6xl mx-auto">

      <LessonGoal
        goal={
          <>
            Servers and keys are hashed onto the same{' '}
            <Term term="hash ring">
              The 0 … 2^32 − 1 hash space with its ends joined, so walking clockwise past the top wraps back to 0.
            </Term>
            . A key belongs to the first server found walking clockwise from it — so adding or removing a server only re-homes the keys in one arc.
          </>
        }
        why="Try: click the ring to drop a key, drag a server dot, then Add a server or Crash one and open the Migration tab to compare against hash % N."
      />

      {/* Cluster Health Summary */}
      <div className={`border rounded-3xl p-5 sm:p-6 space-y-4 shadow-xl transition-all ${
        isDarkMode ? 'bg-[#1c1c1e]/90 border-slate-800' : 'bg-white border-slate-200/90'
      }`}>
        <div className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b pb-4 ${isDarkMode ? 'border-slate-800' : 'border-slate-200'}`}>
          <h2 className={`text-lg sm:text-xl font-bold tracking-tight ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
            Clockwise lookup on a ring
          </h2>

          {/* Quick Stats Badges */}
          <div className="flex items-center space-x-2 shrink-0">
            <div className={`px-3 py-1.5 rounded-xl border text-xs font-mono font-bold flex items-center space-x-1.5 ${
              isDarkMode ? 'bg-slate-950 border-slate-800 text-slate-200' : 'bg-slate-50 border-slate-200 text-slate-800'
            }`}>
              <Server className="w-3.5 h-3.5 text-blue-500" />
              <span>{servers.length} Nodes</span>
            </div>

            <div className={`px-3 py-1.5 rounded-xl border text-xs font-mono font-bold flex items-center space-x-1.5 ${
              isDarkMode ? 'bg-slate-950 border-slate-800 text-slate-200' : 'bg-slate-50 border-slate-200 text-slate-800'
            }`}>
              <Sparkles className="w-3.5 h-3.5 text-amber-500" />
              <span>{keys.length} Keys</span>
            </div>

            <div className={`px-3 py-1.5 rounded-xl border text-xs font-mono font-bold flex items-center space-x-1.5 ${
              isImbalanced
                ? 'bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400'
                : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400'
            }`}>
              {isImbalanced ? <AlertTriangle className="w-3.5 h-3.5" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
              <span>{isImbalanced ? 'Hotspot Skew' : 'Balanced'}</span>
            </div>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-sm">
          <p className={`leading-relaxed ${isDarkMode ? 'text-slate-300' : 'text-slate-600'}`}>
            Each coloured arc is owned by the server at its clockwise end. A key's owner never depends on how many servers exist — only on
            which server comes next — so a membership change moves about <span className="font-mono">k/n</span> keys (k keys, n servers).
          </p>

          {isImbalanced && (
            <div className="shrink-0 flex items-center space-x-1.5 px-3 py-1 bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-300 rounded-xl font-medium text-xs">
              <Info className="w-3.5 h-3.5 shrink-0" />
              <span>
                Uneven arcs create a{' '}
                <Term term="hotspot">A server that receives far more keys or traffic than the average, so it overloads first.</Term>. With
                one point per server, gaps are random.
              </span>
            </div>
          )}
        </div>

        {/* Quick Action Presets Toolbar */}
        <div className={`p-2.5 rounded-2xl border flex flex-wrap items-center justify-between gap-2 text-xs font-mono ${
          isDarkMode ? 'bg-slate-950/80 border-slate-800' : 'bg-slate-50 border-slate-200/80'
        }`}>
          <div className="flex items-center space-x-1 text-[11px] font-bold text-amber-600 dark:text-amber-400 mr-2">
            <Zap className="w-3.5 h-3.5" />
            <span>Presets:</span>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <button
              onClick={handleDispatchBurst}
              className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold rounded-xl shadow-xs transition-all flex items-center space-x-1.5"
              title="Dispatches 10 sequential request keys to demonstrate clockwise server routing"
            >
              <Zap className="w-3.5 h-3.5 fill-current" />
              <span>Fire 10 Reqs</span>
            </button>

            <button
              onClick={handleAddServer}
              disabled={servers.length >= MAX_SERVERS}
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white font-bold rounded-xl shadow-xs transition-all flex items-center space-x-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Server {nextServerIdx} ({servers.length}/{MAX_SERVERS})</span>
            </button>

            <button
              onClick={() => crashTarget && handleRemoveServer(crashTarget.id)}
              disabled={servers.length <= 1 || !crashTarget}
              className="px-3 py-1.5 bg-rose-600/10 hover:bg-rose-600 text-rose-700 hover:text-white dark:text-rose-300 border border-rose-500/30 disabled:opacity-30 font-bold rounded-xl transition-all flex items-center space-x-1.5"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Crash {crashTarget ? crashTarget.name : 'a server'}</span>
            </button>

            <button
              onClick={handleReshuffleKeys}
              className={`px-3 py-1.5 rounded-xl border font-bold transition-all flex items-center space-x-1.5 ${
                isDarkMode ? 'bg-[#1c1c1e] border-slate-700 hover:bg-slate-800 text-slate-200' : 'bg-white border-slate-300 hover:bg-slate-100 text-slate-800'
              }`}
            >
              <RefreshCw className="w-3 h-3" />
              <span>Reshuffle Keys</span>
            </button>

            <button
              onClick={handleResetCluster}
              className={`px-3 py-1.5 rounded-xl border font-bold transition-all flex items-center space-x-1.5 ${
                isDarkMode ? 'bg-[#1c1c1e] border-slate-700 hover:bg-slate-800 text-slate-400' : 'bg-white border-slate-300 hover:bg-slate-100 text-slate-600'
              }`}
              title="Reset ring back to the default 4 servers and 25 keys"
            >
              <span>Reset Ring</span>
            </button>
          </div>
        </div>

      </div>

      {/* Main Grid View */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* Ring Canvas Visualizer (Left 7 Cols) */}
        <div className={`lg:col-span-7 border rounded-3xl p-5 flex flex-col items-center justify-between relative shadow-xl min-h-[490px] ${
          isDarkMode ? 'bg-[#1c1c1e]/90 border-slate-800' : 'bg-white border-slate-200'
        }`}>
          
          <div className={`w-full flex flex-wrap items-center justify-between gap-2 mb-2 text-xs ${
            isDarkMode ? 'text-slate-400' : 'text-slate-600'
          }`}>
            <span className="flex items-center space-x-1.5 text-amber-600 dark:text-amber-400 font-semibold">
              <MousePointerClick className="w-3.5 h-3.5" />
              <span>Click the ring to place a key · drag a server dot to move it</span>
            </span>

            <button
              onClick={() => setIsSimulatingTraffic(!isSimulatingTraffic)}
              className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-all flex items-center space-x-1.5 ${
                isSimulatingTraffic
                  ? 'bg-amber-500 text-slate-950 shadow-md animate-pulse'
                  : isDarkMode
                  ? 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700/80'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300'
              }`}
            >
              <Activity className="w-3.5 h-3.5" />
              <span>{isSimulatingTraffic ? 'Stop Auto-Traffic' : 'Auto Traffic Stream'}</span>
            </button>
          </div>

          <HashRingCanvas
            servers={servers}
            keys={keys}
            activeLookupKey={selectedKey}
            highlightArc={highlightArc}
            onServerDrag={handleServerDrag}
            onRingClick={handleRingClick}
            onKeySelect={(k) => handlePerformLookup(k)}
            size={410}
            animatedTracerAngle={animatedTracerAngle}
            isDarkMode={isDarkMode}
          />

          {selectedKey ? (
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className={`w-full mt-3 p-3 border rounded-2xl text-xs font-mono flex flex-col sm:flex-row items-center justify-between gap-2 shadow-sm ${
                isDarkMode ? 'bg-slate-950 border-slate-800 text-slate-300' : 'bg-slate-50 border-slate-200 text-slate-800'
              }`}
            >
              <div className="flex items-center space-x-2">
                <span className="px-2 py-0.5 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 font-bold border border-amber-500/20">
                  Target Key
                </span>
                <span className="font-bold text-slate-900 dark:text-white">{selectedKey.keyString}</span>
                <span className="text-slate-500 text-[11px]">({selectedKey.angle.toFixed(1)}°)</span>
              </div>

              <div className="flex items-center space-x-2">
                <span className="text-slate-500 text-[11px]">Clockwise Owner:</span>
                <span 
                  className="font-bold px-2 py-0.5 rounded text-white text-[11px]"
                  style={{ backgroundColor: lookupTargetServer?.color || '#3B82F6' }}
                >
                  {lookupTargetServer ? lookupTargetServer.name : 'walking clockwise…'}
                </span>
              </div>
            </motion.div>
          ) : (
            <div className={`w-full mt-3 p-2.5 rounded-2xl border text-xs font-mono text-center italic ${
              isDarkMode ? 'bg-slate-950/60 border-slate-800/80 text-slate-500' : 'bg-slate-50 border-slate-200 text-slate-400'
            }`}>
              Click any key dot or sample button to inspect its clockwise path.
            </div>
          )}
        </div>

        {/* Right Dashboard Inspector Panel (Right 5 Cols) */}
        <div className={`lg:col-span-5 border rounded-3xl p-5 space-y-4 shadow-xl min-h-[490px] flex flex-col justify-between ${
          isDarkMode ? 'bg-[#1c1c1e] border-slate-800' : 'bg-white border-slate-200'
        }`}>
          
          {/* Sub-Tab Selector */}
          <div className={`flex space-x-1 p-1 rounded-2xl border text-xs font-mono ${
            isDarkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-100 border-slate-200'
          }`}>
            {[
              { id: 'lookup', label: 'Lookup' },
              { id: 'servers', label: 'Servers' },
              { id: 'traffic', label: 'Traffic' },
              { id: 'migration', label: 'Migration' },
            ].map((t) => (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id as any)}
                className={`flex-1 py-1.5 rounded-xl font-bold transition-all ${
                  activeTab === t.id
                    ? 'bg-gradient-to-r from-amber-500 to-orange-600 text-white shadow-md'
                    : isDarkMode
                    ? 'text-slate-400 hover:text-slate-200'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* TAB 1: KEY LOOKUP INSPECTOR */}
          {activeTab === 'lookup' && (
            <div className="space-y-4 flex-1">
              <div className={`flex items-center space-x-2 border-b pb-2 ${
                isDarkMode ? 'border-slate-800' : 'border-slate-200'
              }`}>
                <Search className="w-4 h-4 text-amber-500" />
                <h3 className={`font-bold text-xs uppercase font-mono ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                  Clockwise Tracer Search
                </h3>
              </div>

              {/* Sample Quick Lookup Chips */}
              <div className="space-y-1.5">
                <span className={`text-xs font-mono uppercase font-bold block ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                  Quick Sample Keys:
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {sampleLookupChips.map((chip) => (
                    <button
                      key={chip}
                      onClick={() => {
                        setLookupSearchInput(chip);
                        handlePerformLookup(hashToKey(chip));
                      }}
                      className={`px-2.5 py-1 rounded-xl text-xs font-mono font-medium border transition-all ${
                        lookupSearchInput === chip
                          ? 'bg-amber-500 text-slate-950 border-amber-400 font-bold shadow-xs'
                          : isDarkMode
                          ? 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
                          : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      {chip}
                    </button>
                  ))}
                </div>
              </div>

              {/* Search Bar Input */}
              <div className="space-y-2">
                <div className="flex space-x-2">
                  <input
                    type="text"
                    value={lookupSearchInput}
                    onChange={(e) => setLookupSearchInput(e.target.value)}
                    placeholder="Enter key string (e.g. AppKey_12)..."
                    className={`flex-1 border rounded-xl px-3 py-2 text-xs font-mono focus:outline-none focus:border-amber-500 ${
                      isDarkMode
                        ? 'bg-slate-950 border-slate-800 text-white'
                        : 'bg-slate-50 border-slate-300 text-slate-900'
                    }`}
                  />
                  <button
                    onClick={() => handlePerformLookup()}
                    className="px-4 py-2 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white font-bold text-xs rounded-xl transition-all flex items-center space-x-1 shadow-sm"
                  >
                    <Play className="w-3.5 h-3.5 fill-current" />
                    <span>Run</span>
                  </button>
                </div>

                {selectedKey && (
                  <div className={`p-3.5 rounded-2xl border font-mono text-xs space-y-2 ${
                    isDarkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'
                  }`}>
                    <div className="flex justify-between items-center border-b pb-2 border-slate-800/40 dark:border-slate-800">
                      <span className={isDarkMode ? "text-slate-400" : "text-slate-500"}>1. Key String:</span>
                      <span className="text-amber-600 dark:text-amber-400 font-bold">{selectedKey.keyString}</span>
                    </div>

                    <div className="flex justify-between items-center border-b pb-2 border-slate-800/40 dark:border-slate-800">
                      <span className={isDarkMode ? "text-slate-400" : "text-slate-500"}>2. Murmur3 Hash:</span>
                      <span className="text-slate-700 dark:text-slate-300 font-bold">{selectedKey.hashHex}</span>
                    </div>

                    <div className="flex justify-between items-center border-b pb-2 border-slate-800/40 dark:border-slate-800">
                      <span className={isDarkMode ? "text-slate-400" : "text-slate-500"}>3. Ring Position:</span>
                      <span className="text-amber-700 dark:text-amber-300 font-bold">{selectedKey.angle.toFixed(1)}°</span>
                    </div>

                    <div className="flex justify-between items-center">
                      <span className={isDarkMode ? "text-slate-400" : "text-slate-500"}>4. Nearest Node (CW):</span>
                      <span 
                        className="font-bold px-2 py-0.5 rounded text-white text-[11px]"
                        style={{ backgroundColor: lookupTargetServer?.color || '#3B82F6' }}
                      >
                        {lookupTargetServer ? lookupTargetServer.name : 'Searching...'}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: SERVER CLUSTER PARTITIONS */}
          {activeTab === 'servers' && (
            <div className="space-y-3 flex-1">
              <div className={`flex items-center justify-between border-b pb-2 ${
                isDarkMode ? 'border-slate-800' : 'border-slate-200'
              }`}>
                <span className={`font-bold text-xs uppercase font-mono ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                  Server Cluster Nodes ({servers.length})
                </span>

                <button
                  onClick={handleAddServer}
                  disabled={servers.length >= MAX_SERVERS}
                  className="px-2.5 py-1 bg-amber-500 text-slate-950 font-bold text-xs rounded-lg transition-all flex items-center space-x-1 disabled:opacity-40"
                >
                  <Plus className="w-3 h-3" />
                  <span>Add Node</span>
                </button>
              </div>

              <div className="space-y-2 max-h-[280px] overflow-y-auto pr-1">
                {servers.map((s) => {
                  const assignedKeys = keys.filter((k) => k.assignedServerId === s.id);
                  const arcInfo = arcs.find((a) => a.server.id === s.id);
                  const pct = Number(((assignedKeys.length / (keys.length || 1)) * 100).toFixed(1));

                  return (
                    <div
                      key={s.id}
                      className={`p-3 rounded-2xl border space-y-2 text-xs font-mono ${
                        isDarkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                          <span className="w-3.5 h-3.5 rounded-full shrink-0 shadow-xs" style={{ backgroundColor: s.color }} />
                          <span className={`font-bold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>{s.name}</span>
                        </div>

                        <div className="flex items-center space-x-3">
                          <span className="text-amber-600 dark:text-amber-400 font-bold">{assignedKeys.length} keys ({pct}%)</span>
                          <button
                            onClick={() => handleRemoveServer(s.id)}
                            disabled={servers.length <= 1}
                            className="p-1 text-slate-400 hover:text-red-500 disabled:opacity-30 transition-colors"
                            title="Delete server node"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Slider to adjust server angle */}
                      <div className="flex items-center space-x-2 text-[11px]">
                        <span className={isDarkMode ? 'text-slate-400' : 'text-slate-500'}>Angle:</span>
                        <input
                          type="range"
                          min="0"
                          max="359"
                          value={Math.round(s.angle)}
                          onChange={(e) => handleServerDrag(s.id, Number(e.target.value))}
                          className="flex-1 h-1.5 bg-slate-200 dark:bg-slate-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
                        />
                        <span className={`font-bold w-10 text-right ${isDarkMode ? 'text-slate-200' : 'text-slate-800'}`}>{s.angle.toFixed(0)}°</span>
                      </div>
                      <div className={isDarkMode ? 'text-slate-400' : 'text-slate-500'}>
                        Owns {arcInfo ? ((arcInfo.arcDegrees / 360) * 100).toFixed(1) : '0'}% of the ring (fair share{' '}
                        {(100 / servers.length).toFixed(1)}%)
                      </div>

                      {/* Distribution progress bar */}
                      <div className={`w-full h-1.5 rounded-full overflow-hidden ${isDarkMode ? 'bg-[#1c1c1e]' : 'bg-slate-200'}`}>
                        <div
                          style={{ width: `${pct}%`, backgroundColor: s.color }}
                          className="h-full rounded-full transition-all duration-300"
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 3: LIVE TRAFFIC SIMULATOR */}
          {activeTab === 'traffic' && (
            <div className="space-y-3 flex-1 font-mono text-xs">
              <div className={`flex items-center justify-between border-b pb-2 ${
                isDarkMode ? 'border-slate-800' : 'border-slate-200'
              }`}>
                <span className={`font-bold uppercase ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>Request-by-Request Traffic</span>
                <span className="text-amber-600 dark:text-amber-400 font-bold">{trafficRequestsCount} Requests Dispatched</span>
              </div>

              {/* Single Request Dispatcher Controls */}
              <div className={`p-3 rounded-2xl border space-y-2.5 ${
                isDarkMode ? 'bg-slate-950/80 border-slate-800' : 'bg-slate-50 border-slate-200'
              }`}>
                <div className="flex items-center justify-between">
                  <span className={`text-[11px] font-bold ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                    Send Single Request:
                  </span>
                  <button
                    onClick={() => handleSendSingleRequest()}
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs shadow-sm flex items-center space-x-1.5 transition-all"
                  >
                    <Zap className="w-3.5 h-3.5 fill-current" />
                    <span>+1 Request</span>
                  </button>
                </div>

                <div className="flex space-x-2">
                  <input
                    type="text"
                    value={customRequestInput}
                    onChange={(e) => setCustomRequestInput(e.target.value)}
                    placeholder="Custom Request Key string..."
                    className={`flex-1 border rounded-xl px-2.5 py-1.5 text-xs font-mono focus:outline-none focus:border-emerald-500 ${
                      isDarkMode ? 'bg-[#1c1c1e] border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-900'
                    }`}
                  />
                  <button
                    onClick={() => handleSendSingleRequest(customRequestInput)}
                    className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-slate-950 rounded-xl font-bold text-xs shadow-sm"
                  >
                    Send Key
                  </button>
                </div>
              </div>

              {/* Server Load Counts */}
              <div className="space-y-1.5">
                <span className={`text-xs uppercase font-bold block ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                  Server Traffic Breakdown:
                </span>
                <div className="space-y-1.5 max-h-[110px] overflow-y-auto pr-1">
                  {servers.map((s) => {
                    const reqs = serverRequestCounts[s.id] || 0;
                    const pct = trafficRequestsCount > 0 ? ((reqs / trafficRequestsCount) * 100).toFixed(0) : '0';
                    return (
                      <div key={s.id} className="space-y-0.5">
                        <div className="flex justify-between text-[11px]">
                          <span style={{ color: s.color }} className="font-bold">{s.name}</span>
                          <span className={isDarkMode ? 'text-slate-300' : 'text-slate-700'}>{reqs} reqs ({pct}%)</span>
                        </div>
                        <div className={`w-full h-1.5 rounded-full overflow-hidden ${isDarkMode ? 'bg-slate-950' : 'bg-slate-200'}`}>
                          <div
                            style={{ width: `${pct}%`, backgroundColor: s.color }}
                            className="h-full rounded-full transition-all duration-300"
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Recent Dispatched Request Stream Log */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className={`text-xs uppercase font-bold block ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                    Recent Request Stream Log:
                  </span>
                  {recentRequestLogs.length > 0 && (
                    <button 
                      onClick={() => setRecentRequestLogs([])} 
                      className="text-xs text-slate-500 hover:text-rose-500 transition-colors"
                    >
                      Clear Log
                    </button>
                  )}
                </div>

                <div className={`max-h-[110px] overflow-y-auto rounded-2xl border p-2 space-y-1 ${
                  isDarkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'
                }`}>
                  {recentRequestLogs.length === 0 ? (
                    <div className={`text-[11px] italic text-center py-3 ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                      Click "+1 Request" above or "Fire 10 Reqs" to send traffic.
                    </div>
                  ) : (
                    recentRequestLogs.map((log) => (
                      <div key={log.id} className={`p-1.5 rounded-xl border text-xs flex items-center justify-between ${
                        isDarkMode ? 'bg-[#1c1c1e] border-slate-800/80 text-slate-300' : 'bg-white border-slate-200 text-slate-800'
                      }`}>
                        <div className="flex items-center space-x-2">
                          <span className="font-bold text-amber-600 dark:text-amber-400">{log.keyString}</span>
                          <span className={isDarkMode ? 'text-slate-500' : 'text-slate-400'}>({log.angle.toFixed(0)}°)</span>
                        </div>
                        <div className="flex items-center space-x-2">
                          <span className="font-bold px-1.5 py-0.5 rounded text-white" style={{ backgroundColor: log.assignedServerColor }}>
                            {log.assignedServerName}
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

            </div>
          )}

          {/* TAB 4: MIGRATION STATS */}
          {activeTab === 'migration' && (
            <div className="space-y-3 flex-1 text-xs">
              <div className={`flex items-center space-x-2 border-b pb-2 ${
                isDarkMode ? 'border-slate-800' : 'border-slate-200'
              }`}>
                <TrendingDown className="w-4 h-4 text-amber-500" />
                <h3 className={`font-bold uppercase font-mono ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>Key Migration</h3>
              </div>

              {migrationStats ? (
                <div className={`p-4 rounded-2xl border space-y-3 ${
                  isDarkMode ? 'bg-slate-950 border-amber-500/30' : 'bg-amber-50/60 border-amber-200'
                }`}>
                  <div className="text-amber-700 dark:text-amber-300 font-bold flex items-center space-x-2 text-sm">
                    <Sparkles className="w-4 h-4" />
                    <span>
                      {migrationStats.affectedServerName} {migrationStats.actionType} · N {migrationStats.fromN} → {migrationStats.toN} ·{' '}
                      {migrationStats.totalKeys} keys
                    </span>
                  </div>

                  {(
                    [
                      { label: 'This ring (moved keys)', moved: migrationStats.movedKeys, pct: migrationStats.movedPct, tone: 'bg-amber-500', text: 'text-amber-700 dark:text-amber-300' },
                      { label: `hash % N on the same keys (${migrationStats.fromN} → ${migrationStats.toN})`, moved: migrationStats.moduloMoved, pct: migrationStats.moduloPct, tone: 'bg-rose-500', text: 'text-rose-700 dark:text-rose-300' },
                      { label: `Theory: k/n = ${migrationStats.totalKeys}/${Math.max(migrationStats.fromN, migrationStats.toN)}`, moved: migrationStats.idealKeys, pct: migrationStats.idealPct, tone: 'bg-emerald-500', text: 'text-emerald-700 dark:text-emerald-300' },
                    ] as const
                  ).map((row) => (
                    <div key={row.label} className="space-y-1">
                      <div className={`flex justify-between gap-2 ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                        <span>{row.label}</span>
                        <span className={`font-mono font-bold ${row.text}`}>
                          {row.moved} ({row.pct}%)
                        </span>
                      </div>
                      <div className={`w-full h-1.5 rounded-full overflow-hidden ${isDarkMode ? 'bg-slate-800' : 'bg-slate-200'}`}>
                        <div className={`h-full rounded-full ${row.tone}`} style={{ width: `${Math.min(100, row.pct)}%` }} />
                      </div>
                    </div>
                  ))}

                  <p className={`text-sm leading-relaxed pt-2 border-t ${
                    isDarkMode ? 'text-slate-300 border-slate-800' : 'text-slate-700 border-slate-200'
                  }`}>
                    {migrationStats.onlyAffectedServer
                      ? migrationStats.actionType === 'added'
                        ? `Every moved key went to ${migrationStats.affectedServerName}; no key moved between the servers that were already there. `
                        : `Only ${migrationStats.affectedServerName}'s keys moved — each went to the next server clockwise. `
                      : ''}
                    The ring's number can land well above or below k/n: with one point per server, the new server takes whatever arc it
                    happens to land in. Virtual nodes (next part) make that share predictable.
                  </p>
                </div>
              ) : (
                <div className={`p-4 rounded-2xl border text-center space-y-2 text-sm ${
                  isDarkMode ? 'bg-slate-950 border-slate-800 text-slate-400' : 'bg-slate-50 border-slate-200 text-slate-500'
                }`}>
                  <p>
                    Click <strong>Add Server</strong> or <strong>Crash</strong> in the toolbar above. You'll see how many keys the ring moved,
                    how many <span className="font-mono">hash % N</span> would have moved for the same change, and the k/n ideal.
                  </p>
                </div>
              )}
            </div>
          )}

          <div className={`pt-2 border-t text-xs font-mono ${
            isDarkMode ? 'border-slate-800 text-slate-400' : 'border-slate-200 text-slate-500'
          }`}>
            <span>Clockwise space: [0, 2^32 − 1], wraps at the top</span>
          </div>

        </div>

      </div>

      <Takeaway>
        On a hash ring a key's owner is simply the next server clockwise, so adding or removing a server only re-homes the keys in one arc —
        about k/n of them, instead of nearly all keys with <span className="font-mono">hash % N</span>. The catch: with one point per server,
        arc sizes are random, so load and moved keys can be very uneven.
      </Takeaway>

      <Quiz persistKey="chapter5:quiz:module1" questions={QUIZ} />

    </div>
  );
};
