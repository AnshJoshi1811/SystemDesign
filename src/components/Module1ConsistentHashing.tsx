import React, { useState, useEffect } from 'react';
import { PhysicalServer, HashKey } from '../types';
import {
  hashToKey,
  assignKeysToRingNodes,
  getLookupPath,
  getDefaultServers,
  generateSampleKeys,
  SERVER_COLORS,
} from '../lib/hash';
import { HashRingCanvas } from './HashRingCanvas';
import { motion, AnimatePresence } from 'motion/react';
import {
  Server,
  Plus,
  Trash2,
  Search,
  CheckCircle2,
  TrendingDown,
  Play,
  Pause,
  Activity,
  MousePointerClick,
  Info,
  Sparkles,
  Zap,
  RefreshCw,
  Sliders,
  ArrowRight,
  BarChart3,
  AlertTriangle,
  Layers,
  Send,
  HelpCircle
} from 'lucide-react';

interface Module1ConsistentHashingProps {
  isDarkMode?: boolean;
}

export const Module1ConsistentHashing: React.FC<Module1ConsistentHashingProps> = ({ isDarkMode = false }) => {
  const [servers, setServers] = useState<PhysicalServer[]>(getDefaultServers());
  const [keys, setKeys] = useState<HashKey[]>(() => {
    const initialKeys = generateSampleKeys(25, 'AppKey');
    const ringNodes = getDefaultServers().map((s) => ({
      id: s.id,
      physicalServerId: s.id,
      angle: s.angle,
      hashValue: s.hashValue,
    })).sort((a, b) => a.angle - b.angle);
    return assignKeysToRingNodes(initialKeys, ringNodes);
  });

  // Right Panel Tab State
  const [activeTab, setActiveTab] = useState<'lookup' | 'servers' | 'traffic' | 'migration'>('lookup');

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
    timestamp: string;
  }>>([]);

  // Affected arc highlight state
  const [highlightArc, setHighlightArc] = useState<{ startAngle: number; endAngle: number; color?: string } | null>(null);

  // Migration Stats
  const [migrationStats, setMigrationStats] = useState<{
    totalKeys: number;
    movedKeys: number;
    movedPct: number;
    affectedServerName: string;
    actionType: 'added' | 'removed';
  } | null>(null);

  // Sync key mapping whenever server cluster changes
  useEffect(() => {
    const sortedRingNodes = servers
      .map((s) => ({
        id: s.id,
        physicalServerId: s.id,
        angle: s.angle,
        hashValue: s.hashValue,
      }))
      .sort((a, b) => a.angle - b.angle);

    const updatedKeys = assignKeysToRingNodes(keys, sortedRingNodes);
    setKeys(updatedKeys);
  }, [servers]);

  // Traffic Generator Loop
  useEffect(() => {
    if (!isSimulatingTraffic) return;

    const interval = setInterval(() => {
      const randomAngle = Math.random() * 360;
      const testKey: HashKey = {
        id: `Req_${Date.now()}_${Math.floor(Math.random() * 100)}`,
        keyString: `Req_${Math.floor(Math.random() * 1000)}`,
        hashValue: Math.floor((randomAngle / 360) * 4294967295),
        hashHex: '0x' + Math.floor(Math.random() * 0xffffffff).toString(16),
        angle: randomAngle,
      };

      const sortedRingNodes = servers
        .map((s) => ({
          id: s.id,
          physicalServerId: s.id,
          angle: s.angle,
          hashValue: s.hashValue,
        }))
        .sort((a, b) => a.angle - b.angle);

      const path = getLookupPath(testKey, sortedRingNodes);
      if (path) {
        const targetServer = servers.find((s) => s.id === path.targetNode.physicalServerId);
        if (targetServer) {
          setServerRequestCounts((prev) => ({
            ...prev,
            [targetServer.id]: (prev[targetServer.id] || 0) + 1,
          }));
        }
      }

      setSelectedKey(testKey);
      setAnimatedTracerAngle(path?.endAngle || randomAngle);
      setTrafficRequestsCount((prev) => prev + 1);
    }, 450);

    return () => clearInterval(interval);
  }, [isSimulatingTraffic, servers]);

  // Handle Server Position Dragging
  const handleServerDrag = (serverId: string, newAngle: number) => {
    setServers((prev) =>
      prev.map((s) => (s.id === serverId ? { ...s, angle: newAngle } : s))
    );
  };

  // Click on Ring Canvas to Place Key & Run Lookup
  const handleRingClick = (clickAngle: number) => {
    const customKey: HashKey = {
      id: `CustomKey_${Date.now()}`,
      keyString: `Key_${Math.floor(clickAngle)}°`,
      hashValue: Math.floor((clickAngle / 360) * 4294967295),
      hashHex: '0x' + Math.floor((clickAngle / 360) * 4294967295).toString(16).toUpperCase(),
      angle: clickAngle,
    };

    setKeys((prev) => [customKey, ...prev.slice(0, 35)]);
    handlePerformLookup(customKey);
  };

  // Execute Animated Key Lookup
  const handlePerformLookup = (targetKey?: HashKey) => {
    const keyToSearch = targetKey || hashToKey(lookupSearchInput || 'AppKey_12');
    setSelectedKey(keyToSearch);

    const sortedRingNodes = servers
      .map((s) => ({
        id: s.id,
        physicalServerId: s.id,
        angle: s.angle,
        hashValue: s.hashValue,
      }))
      .sort((a, b) => a.angle - b.angle);

    const path = getLookupPath(keyToSearch, sortedRingNodes);
    if (!path) return;

    let currentAngle = path.startAngle;
    let targetAngle = path.endAngle;
    if (targetAngle < currentAngle) targetAngle += 360;

    const steps = 25;
    let stepCount = 0;

    const interval = setInterval(() => {
      stepCount++;
      const progress = stepCount / steps;
      const interpAngle = (currentAngle + (targetAngle - currentAngle) * progress) % 360;
      setAnimatedTracerAngle(interpAngle);

      if (stepCount >= steps) {
        clearInterval(interval);
        setAnimatedTracerAngle(targetAngle % 360);
        const matchedServer = servers.find((s) => s.id === path.targetNode.physicalServerId);
        setLookupTargetServer(matchedServer || null);
      }
    }, 18);
  };

  // Send Single Request function
  const handleSendSingleRequest = (customStr?: string) => {
    const keyStr = (customStr !== undefined ? customStr : customRequestInput).trim() || `Req_${Math.floor(Math.random() * 9000 + 1000)}`;
    const testKey = hashToKey(keyStr);

    const sortedRingNodes = servers
      .map((s) => ({
        id: s.id,
        physicalServerId: s.id,
        angle: s.angle,
        hashValue: s.hashValue,
      }))
      .sort((a, b) => a.angle - b.angle);

    const path = getLookupPath(testKey, sortedRingNodes);
    let matchedServer: PhysicalServer | null = null;
    if (path) {
      matchedServer = servers.find((s) => s.id === path.targetNode.physicalServerId) || null;
      if (matchedServer) {
        setServerRequestCounts((prev) => ({
          ...prev,
          [matchedServer.id]: (prev[matchedServer.id] || 0) + 1,
        }));
      }
    }

    setSelectedKey(testKey);
    setLookupTargetServer(matchedServer);
    setAnimatedTracerAngle(path?.endAngle || testKey.angle);
    setTrafficRequestsCount((prev) => prev + 1);

    if (matchedServer) {
      setRecentRequestLogs((prev) => [
        {
          id: testKey.id + '_' + Date.now(),
          keyString: testKey.keyString,
          angle: testKey.angle,
          hashHex: testKey.hashHex,
          assignedServerName: matchedServer.name,
          assignedServerColor: matchedServer.color,
          timestamp: new Date().toLocaleTimeString(),
        },
        ...prev.slice(0, 19),
      ]);
    }
  };

  // Dispatch Burst of 10 Requests
  const handleDispatchBurst = () => {
    let count = 0;
    const burstInterval = setInterval(() => {
      handleSendSingleRequest(`Burst_Req_${Math.floor(Math.random() * 10000)}`);
      count++;
      if (count >= 10) clearInterval(burstInterval);
    }, 180);
  };

  // Add Server with Affected Arc Highlight
  const handleAddServer = () => {
    if (servers.length >= 8) return;

    const nextIdx = servers.length;
    const newServerId = `S${nextIdx}`;
    const newServerKey = `Server_${nextIdx}_${Date.now()}`;
    const newServerHash = hashToKey(newServerKey);

    const newServer: PhysicalServer = {
      id: newServerId,
      name: `Server ${nextIdx}`,
      color: SERVER_COLORS[nextIdx % SERVER_COLORS.length],
      hashValue: newServerHash.hashValue,
      angle: newServerHash.angle,
      vnodesCount: 1,
    };

    const newServersList = [...servers, newServer];
    const sorted = [...newServersList].sort((a, b) => a.angle - b.angle);
    const newServerPos = sorted.findIndex((s) => s.id === newServerId);
    const prevServer = sorted[(newServerPos - 1 + sorted.length) % sorted.length];

    setHighlightArc({
      startAngle: prevServer.angle,
      endAngle: newServer.angle,
      color: newServer.color,
    });

    const ringNodes = newServersList
      .map((s) => ({
        id: s.id,
        physicalServerId: s.id,
        angle: s.angle,
        hashValue: s.hashValue,
      }))
      .sort((a, b) => a.angle - b.angle);

    const remapped = assignKeysToRingNodes(keys, ringNodes);
    const moved = remapped.filter((k) => k.isMoved).length;
    const pct = Number(((moved / (keys.length || 1)) * 100).toFixed(1));

    setServers(newServersList);
    setKeys(remapped);
    setMigrationStats({
      totalKeys: keys.length,
      movedKeys: moved,
      movedPct: pct,
      affectedServerName: newServer.name,
      actionType: 'added',
    });
    setActiveTab('migration');

    setTimeout(() => {
      setHighlightArc(null);
    }, 3000);
  };

  // Remove Selected Server
  const handleRemoveServer = (serverId: string) => {
    if (servers.length <= 1) return;

    const targetServer = servers.find((s) => s.id === serverId);
    const remaining = servers.filter((s) => s.id !== serverId);

    const ringNodes = remaining
      .map((s) => ({
        id: s.id,
        physicalServerId: s.id,
        angle: s.angle,
        hashValue: s.hashValue,
      }))
      .sort((a, b) => a.angle - b.angle);

    const remapped = assignKeysToRingNodes(keys, ringNodes);
    const moved = remapped.filter((k) => k.isMoved).length;
    const pct = Number(((moved / (keys.length || 1)) * 100).toFixed(1));

    setServers(remaining);
    setKeys(remapped);
    setMigrationStats({
      totalKeys: keys.length,
      movedKeys: moved,
      movedPct: pct,
      affectedServerName: targetServer?.name || serverId,
      actionType: 'removed',
    });
    setActiveTab('migration');
  };

  // Reset to default
  const handleResetCluster = () => {
    const defaultS = getDefaultServers();
    const initialKeys = generateSampleKeys(25, 'AppKey');
    const ringNodes = defaultS.map((s) => ({
      id: s.id,
      physicalServerId: s.id,
      angle: s.angle,
      hashValue: s.hashValue,
    })).sort((a, b) => a.angle - b.angle);

    setServers(defaultS);
    setKeys(assignKeysToRingNodes(initialKeys, ringNodes));
    setSelectedKey(null);
    setLookupTargetServer(null);
    setMigrationStats(null);
    setTrafficRequestsCount(0);
    setServerRequestCounts({});
    setRecentRequestLogs([]);
  };

  // Compute Partition Arc sizes & imbalance calculation
  const sortedServers = [...servers].sort((a, b) => a.angle - b.angle);
  const arcs = sortedServers.map((s, idx) => {
    const prev = sortedServers[(idx - 1 + sortedServers.length) % sortedServers.length];
    let arc = s.angle - prev.angle;
    if (arc < 0) arc += 360;
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

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      
      {/* Module Title & Cluster Health Summary */}
      <div className={`border rounded-3xl p-5 sm:p-6 space-y-4 shadow-xl transition-all ${
        isDarkMode ? 'bg-[#1c1c1e]/90 border-slate-800' : 'bg-white border-slate-200/90'
      }`}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b pb-4 border-slate-200 dark:border-slate-800">
          <div>
            <div className="flex items-center space-x-2 mb-1">
              <span className="px-2.5 py-0.5 bg-amber-500/10 text-amber-600 dark:text-amber-400 font-mono text-[11px] rounded-full border border-amber-500/20 font-bold">
                Chapter 5 • Core Solution
              </span>
              <span className={`text-xs font-semibold ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                Consistent Hash Ring
              </span>
            </div>
            <h2 className={`text-xl sm:text-2xl font-extrabold tracking-tight ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
              Consistent Hashing & Clockwise Lookup
            </h2>
          </div>

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

        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
          <p className={`leading-relaxed ${isDarkMode ? 'text-slate-300' : 'text-slate-600'}`}>
            Keys map onto a 32-bit circular hash space <code>[0, 2^32 - 1]</code> and walk <strong>clockwise</strong> to the first server node encountered. When scaling, only <code>~1/N</code> keys relocate!
          </p>

          {isImbalanced && (
            <div className="shrink-0 flex items-center space-x-1.5 px-3 py-1 bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 rounded-xl font-medium text-[11px]">
              <Info className="w-3.5 h-3.5 shrink-0" />
              <span>Uneven arcs create key hotspots. Physical nodes alone can leave non-uniform gaps.</span>
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
              disabled={servers.length >= 8}
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white font-bold rounded-xl shadow-xs transition-all flex items-center space-x-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Node ({servers.length}/8)</span>
            </button>

            <button
              onClick={() => handleRemoveServer('S1')}
              disabled={servers.length <= 1 || !servers.some(s => s.id === 'S1')}
              className="px-3 py-1.5 bg-rose-600/10 hover:bg-rose-600 text-rose-600 hover:text-white dark:text-rose-400 border border-rose-500/30 disabled:opacity-30 font-bold rounded-xl transition-all flex items-center space-x-1.5"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Simulate S1 Crash</span>
            </button>

            <button
              onClick={() => {
                const newSample = generateSampleKeys(25, `AppKey_${Date.now().toString().slice(-3)}`);
                const sortedRingNodes = servers.map((s) => ({ id: s.id, physicalServerId: s.id, angle: s.angle, hashValue: s.hashValue })).sort((a, b) => a.angle - b.angle);
                setKeys(assignKeysToRingNodes(newSample, sortedRingNodes));
              }}
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
              title="Reset ring back to default 3 servers"
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
          
          <div className={`w-full flex items-center justify-between mb-2 text-xs font-mono ${
            isDarkMode ? 'text-slate-400' : 'text-slate-600'
          }`}>
            <span className="flex items-center space-x-1.5 text-amber-600 dark:text-amber-400 font-semibold">
              <MousePointerClick className="w-3.5 h-3.5 animate-bounce" />
              <span>Click ring to place key • Drag node dots to adjust</span>
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
                  {lookupTargetServer ? lookupTargetServer.name : 'Clockwise Search'}
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
                <span className={`text-[10px] font-mono uppercase font-bold block ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
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
                  disabled={servers.length >= 8}
                  className="px-2.5 py-1 bg-amber-500 text-slate-950 font-bold text-[11px] rounded-lg transition-all flex items-center space-x-1"
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
                        <span className="font-bold w-10 text-right">{s.angle.toFixed(0)}°</span>
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
                <span className={`text-[10px] uppercase font-bold block ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
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
                  <span className={`text-[10px] uppercase font-bold block ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                    Recent Request Stream Log:
                  </span>
                  {recentRequestLogs.length > 0 && (
                    <button 
                      onClick={() => setRecentRequestLogs([])} 
                      className="text-[10px] text-slate-500 hover:text-rose-500 transition-colors"
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
                      <div key={log.id} className={`p-1.5 rounded-xl border text-[10px] flex items-center justify-between ${
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
            <div className="space-y-3 flex-1 font-mono text-xs">
              <div className={`flex items-center space-x-2 border-b pb-2 ${
                isDarkMode ? 'border-slate-800' : 'border-slate-200'
              }`}>
                <TrendingDown className="w-4 h-4 text-amber-500" />
                <h3 className={`font-bold uppercase ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>Key Migration Log</h3>
              </div>

              {migrationStats ? (
                <div className={`p-4 rounded-2xl border space-y-3 ${
                  isDarkMode ? 'bg-slate-950 border-amber-500/30' : 'bg-amber-50/60 border-amber-200'
                }`}>
                  <div className="text-amber-600 dark:text-amber-400 font-bold flex items-center space-x-2">
                    <Sparkles className="w-4 h-4" />
                    <span>Cluster Rebalance: {migrationStats.affectedServerName} ({migrationStats.actionType})</span>
                  </div>

                  <div className={`flex justify-between ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                    <span>Keys Moved on Hash Ring:</span>
                    <span className="text-amber-600 dark:text-amber-400 font-bold">{migrationStats.movedKeys} / {migrationStats.totalKeys} ({migrationStats.movedPct}%)</span>
                  </div>

                  <div className={`flex justify-between ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                    <span>Traditional Modulo Movement:</span>
                    <span className="text-rose-600 dark:text-rose-400 font-bold">~{Math.round(migrationStats.totalKeys * 0.85)} / {migrationStats.totalKeys} (85%+)</span>
                  </div>

                  <p className={`text-[11px] leading-relaxed font-sans pt-2 border-t ${
                    isDarkMode ? 'text-slate-400 border-slate-800' : 'text-slate-600 border-slate-200'
                  }`}>
                    Consistent hashing avoided cache thrashing! Only keys falling directly inside the affected arc were relocated.
                  </p>
                </div>
              ) : (
                <div className={`p-4 rounded-2xl border italic text-center space-y-2 ${
                  isDarkMode ? 'bg-slate-950 border-slate-800 text-slate-500' : 'bg-slate-50 border-slate-200 text-slate-400'
                }`}>
                  <p>Click <strong>Add Node</strong> or <strong>Simulate S1 Crash</strong> in the presets toolbar above to test key migration.</p>
                </div>
              )}
            </div>
          )}

          <div className={`pt-2 border-t flex items-center justify-between text-[11px] font-mono ${
            isDarkMode ? 'border-slate-800 text-slate-500' : 'border-slate-200 text-slate-400'
          }`}>
            <span>Clockwise Space: [0, 2^32-1]</span>
            <span className="text-amber-600 dark:text-amber-400 font-semibold">Chapter 5 Mod 1</span>
          </div>

        </div>

      </div>

    </div>
  );
};
