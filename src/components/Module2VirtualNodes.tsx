import React, { useState, useMemo } from 'react';
import { PhysicalServer } from '../types';
import {
  generateVirtualNodes,
  assignKeysToRingNodes,
  computeDistributionStats,
  getDefaultServers,
  generateSampleKeys,
  hashToKey,
  makeServer,
  vnodesToRingNodes,
  countMovedRing,
  stdDevPercentOfMean,
  arcSharePercentOfMean,
} from '../lib/hash';
import { HashRingCanvas } from './HashRingCanvas';
import { usePersistentState } from '../lib/usePersistentState';
import { LessonGoal, Takeaway, Term, Quiz, QuizQuestion } from './learn/LearningKit';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Plus, Minus, Zap } from 'lucide-react';

interface Module2VirtualNodesProps {
  isDarkMode?: boolean;
}

const MAX_SERVERS = 8;

const QUIZ: QuizQuestion[] = [
  {
    question: 'Why does a ring with one point per server usually give uneven load?',
    options: [
      {
        text: 'Server positions are random, so the gaps between them — each server’s arc — are random sizes',
        correct: true,
        why: 'A server owns the arc back to its counter-clockwise neighbour. A handful of random points almost never splits a circle evenly; one arc is often several times another.',
      },
      {
        text: 'The hash function puts more keys near 0°',
        why: 'A good hash spreads keys uniformly. The unevenness comes from the few server points, not from the keys.',
      },
      {
        text: 'Clockwise lookup favours servers near the top of the ring',
        why: 'Direction doesn’t favour any position; the server with the widest arc before it gets the most keys, wherever it sits.',
      },
    ],
  },
  {
    question: 'The book cites an experiment: standard deviation of load is about 10% of the mean with 100 virtual nodes per server. What happens at 200?',
    options: [
      {
        text: 'It drops to about 5% — more tokens average out the random arc sizes',
        correct: true,
        why: 'Each server’s share is the sum of many small random arcs, so relative spread shrinks as tokens grow. The book reports ~5% at 200.',
      },
      {
        text: 'It stays at 10% — beyond 100 nothing changes',
        why: 'Spread keeps shrinking as tokens increase (roughly with 1/√V); the gains just get smaller.',
      },
      {
        text: 'It reaches 0% — perfectly even',
        why: 'Positions are still random, so there is always some spread. More tokens reduce it but never remove it.',
      },
    ],
  },
  {
    question: 'What is the main cost of giving each server many virtual nodes?',
    options: [
      {
        text: 'More metadata: the ring (token → server map) every client or router must store and search grows',
        correct: true,
        why: 'The book names this tradeoff: more virtual nodes need more space to store ring data. Lookup is a binary search, so it stays fast.',
      },
      {
        text: 'Each key has to be stored once per virtual node',
        why: 'Virtual nodes are only positions on the ring. A key is still stored once (per replica), on the server that owns its arc.',
      },
      {
        text: 'Adding a server moves more keys',
        why: 'The opposite: with many tokens the new server takes a small slice from every server, and the total moved stays close to k/n.',
      },
    ],
  },
];

export const Module2VirtualNodes: React.FC<Module2VirtualNodesProps> = ({ isDarkMode = false }) => {
  const [servers, setServers] = useState<PhysicalServer[]>(getDefaultServers());

  const [useVNodes, setUseVNodes] = usePersistentState<boolean>('chapter5:module2:useVNodes', true);
  const [vnodeSliderVal, setVnodeSliderVal] = usePersistentState<number>('chapter5:module2:vnodes', 50);
  const [keyCountPreset, setKeyCountPreset] = usePersistentState<number>('chapter5:module2:keys', 1000);
  const [activeTab, setActiveTab] = usePersistentState<'ring' | 'charts' | 'table'>('chapter5:module2:tab', 'ring');

  // Single Request Dispatcher state
  const [customVNodeReq, setCustomVNodeReq] = useState<string>('Data_Req_1');
  const [vnodeDispatchedLogs, setVNodeDispatchedLogs] = useState<Array<{
    id: string;
    keyString: string;
    angle: number;
    hashHex: string;
    serverName: string;
    serverColor: string;
  }>>([]);
  const [requestSeq, setRequestSeq] = useState(0);

  const activeVNodeCount = useVNodes ? vnodeSliderVal : 1;

  // Single request sender function
  const handleSendVNodeSingleRequest = (customStr?: string) => {
    const seq = requestSeq + 1;
    setRequestSeq(seq);
    const keyStr = (customStr !== undefined ? customStr : customVNodeReq).trim() || `Req_${seq}`;
    const testKey = hashToKey(keyStr);

    const [assignedKey] = assignKeysToRingNodes([testKey], vnodesToRingNodes(virtualNodesList));
    const targetServer = servers.find((s) => s.id === assignedKey.assignedServerId);

    if (targetServer) {
      setVNodeDispatchedLogs((prev) => [
        {
          id: `${testKey.id}_${seq}`,
          keyString: testKey.keyString,
          angle: testKey.angle,
          hashHex: testKey.hashHex,
          serverName: targetServer.name,
          serverColor: targetServer.color,
        },
        ...prev.slice(0, 15),
      ]);
    }
  };

  // Generate virtual nodes array
  const virtualNodesList = useMemo(() => {
    return generateVirtualNodes(servers, activeVNodeCount, 'murmur3');
  }, [servers, activeVNodeCount]);

  const rawKeys = useMemo(() => generateSampleKeys(keyCountPreset, 'VNodeDataKey'), [keyCountPreset]);

  // Generate test keys based on keyCountPreset
  const keysList = useMemo(
    () => assignKeysToRingNodes(rawKeys, vnodesToRingNodes(virtualNodesList)),
    [rawKeys, virtualNodesList]
  );

  // Calculate Distribution Statistics
  const ringNodesForStats = useMemo(() => {
    return virtualNodesList.map((vn) => ({
      id: vn.id,
      physicalServerId: vn.physicalServerId,
      angle: vn.angle,
    }));
  }, [virtualNodesList]);

  const stats = useMemo(() => {
    const updatedServers = servers.map((s) => ({ ...s, vnodesCount: activeVNodeCount }));
    return computeDistributionStats(updatedServers, keysList, ringNodesForStats);
  }, [servers, activeVNodeCount, keysList, ringNodesForStats]);

  // Baseline stats at V=1 for live comparison
  const baselineVnodesList = useMemo(() => generateVirtualNodes(servers, 1, 'murmur3'), [servers]);
  const baselineKeys = useMemo(
    () => assignKeysToRingNodes(rawKeys, vnodesToRingNodes(baselineVnodesList)),
    [rawKeys, baselineVnodesList]
  );
  const baselineStats = useMemo(() => {
    const s1 = servers.map((s) => ({ ...s, vnodesCount: 1 }));
    const rn = baselineVnodesList.map((vn) => ({ id: vn.id, physicalServerId: vn.physicalServerId, angle: vn.angle }));
    return computeDistributionStats(s1, baselineKeys, rn);
  }, [servers, baselineKeys, baselineVnodesList]);

  const improvementPct = baselineStats.stdDeviation > 0
    ? Math.round((1 - stats.stdDeviation / baselineStats.stdDeviation) * 100)
    : 0;

  // σ as a percentage of the mean load (coefficient of variation) — the unit the book quotes.
  const cv = stdDevPercentOfMean(stats.stdDeviation, keyCountPreset, servers.length);
  const baselineCv = stdDevPercentOfMean(baselineStats.stdDeviation, keyCountPreset, servers.length);
  const arcCv = arcSharePercentOfMean(stats);
  // Even a perfectly even ring shows ~1/√(keys per server) spread just from random sampling of test keys.
  const samplingNoisePct = Number((100 / Math.sqrt(keyCountPreset / servers.length)).toFixed(1));

  const baselineArcs = [...baselineStats.distribution].sort((a, b) => b.arcCoveragePercentage - a.arcCoveragePercentage);
  const largestArc = baselineArcs[0];
  const smallestArc = baselineArcs[baselineArcs.length - 1];

  // Membership-change demo: how many keys would move if we added or removed a machine right now?
  const membershipPreview = useMemo(() => {
    const moved = (after: PhysicalServer[], v: number) =>
      countMovedRing(
        rawKeys,
        vnodesToRingNodes(generateVirtualNodes(servers, v)),
        vnodesToRingNodes(generateVirtualNodes(after, v))
      );
    const total = rawKeys.length || 1;
    const pct = (n: number) => Number(((n / total) * 100).toFixed(1));
    const add =
      servers.length < MAX_SERVERS
        ? (() => {
            const after = [...servers, makeServer(servers.length)];
            return { name: `Server ${servers.length}`, pctV: pct(moved(after, activeVNodeCount)), pct1: pct(moved(after, 1)), ideal: Number((100 / after.length).toFixed(1)) };
          })()
        : null;
    const remove =
      servers.length > 1
        ? (() => {
            const after = servers.slice(0, -1);
            return { name: servers[servers.length - 1].name, pctV: pct(moved(after, activeVNodeCount)), pct1: pct(moved(after, 1)), ideal: Number((100 / servers.length).toFixed(1)) };
          })()
        : null;
    return { add, remove };
  }, [servers, rawKeys, activeVNodeCount]);

  // Handle Server Add/Remove (machines are numbered 0..N-1 here; removing always drops the last one)
  const handleAddPhysicalServer = () => {
    if (servers.length >= MAX_SERVERS) return;
    setServers([...servers, makeServer(servers.length, activeVNodeCount)]);
  };

  const handleRemovePhysicalServer = () => {
    if (servers.length <= 1) return;
    setServers(servers.slice(0, servers.length - 1));
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      
      <LessonGoal
        goal={
          <>
            Give each server many{' '}
            <Term term="virtual nodes">
              Extra ring positions for the same physical server (Server 0 → S0#vn-0, S0#vn-1, …). A key that lands on any of them is stored on that server.
            </Term>{' '}
            instead of one point, and each server's share of the ring becomes the sum of many small arcs — which evens out load.
          </>
        }
        why="Move the slider and watch σ (as % of the mean) fall. Then check the membership panel: with many tokens, adding or removing a machine still moves only about k/n keys."
      />

      {/* Why one point per server is uneven */}
      <div className={`border rounded-2xl p-5 sm:p-6 space-y-3 ${
        isDarkMode ? 'bg-[#1c1c1e] border-slate-800' : 'bg-white border-slate-200'
      }`}>
        <h2 className={`text-lg font-bold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>Why is one point per server uneven?</h2>
        <p className={`text-sm leading-relaxed ${isDarkMode ? 'text-slate-300' : 'text-slate-600'}`}>
          A server owns the arc between itself and the previous server counter-clockwise. With only {servers.length} random points on
          the ring, those gaps are random sizes: right now (V = 1){' '}
          {largestArc && smallestArc && (
            <>
              <strong style={{ color: largestArc.color }}>{largestArc.serverName}</strong> owns {largestArc.arcCoveragePercentage}% of the
              ring while <strong style={{ color: smallestArc.color }}>{smallestArc.serverName}</strong> owns{' '}
              {smallestArc.arcCoveragePercentage}% — a fair share would be {(100 / servers.length).toFixed(1)}% each.
            </>
          )}{' '}
          The server with the biggest arc becomes a hotspot. With V tokens each, a server's share is the sum of V small random arcs;
          the highs and lows cancel out, so the spread shrinks roughly like 1/√V.
        </p>

        {/* ── Live σ comparison: V=1 vs current V ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className={`p-3.5 rounded-xl border space-y-1 ${
            isDarkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'
          }`}>
            <div className={`text-xs font-medium uppercase tracking-wider ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
              Without virtual nodes (V = 1)
            </div>
            <div className="flex items-end gap-1.5">
              <span className="text-2xl font-bold text-rose-600 dark:text-rose-400">{baselineCv}%</span>
              <span className={`text-xs pb-0.5 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>σ of load, as % of mean</span>
            </div>
            <div className={`text-xs ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
              Busiest server: <span className="text-rose-600 dark:text-rose-400 font-medium">{baselineStats.maxLoadRatio}× the average</span>
            </div>
          </div>

          <div className={`p-3.5 rounded-xl border space-y-1 relative ${
            isDarkMode ? 'bg-slate-950 border-emerald-500/30' : 'bg-emerald-50/50 border-emerald-200'
          }`}>
            <div className="text-xs font-medium uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
              With virtual nodes (V = {activeVNodeCount})
            </div>
            <div className="flex items-end gap-1.5">
              <span className="text-2xl font-bold text-emerald-700 dark:text-emerald-300">{cv}%</span>
              <span className={`text-xs pb-0.5 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>σ of load, as % of mean</span>
            </div>
            <div className="text-xs text-emerald-700 dark:text-emerald-300">
              Busiest server: <span className="font-medium">{stats.maxLoadRatio}× the average</span>
              {improvementPct > 0 && (
                <span className="ml-2 px-1.5 py-0.5 bg-emerald-500/15 rounded font-bold">↓ {improvementPct}% less spread</span>
              )}
            </div>
          </div>
        </div>

        <p className={`text-xs leading-relaxed ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
          <strong className={isDarkMode ? 'text-slate-200' : 'text-slate-700'}>Compare with the book:</strong> it cites an experiment where σ
          is about 10% of the mean with 100 virtual nodes and about 5% with 200. Here, the share of the hash space each server owns has σ ={' '}
          <span className="font-mono">{arcCv}%</span> of the mean at V = {activeVNodeCount}. The key-count figure above also includes
          ~{samplingNoisePct}% of pure sampling noise from testing only {keyCountPreset.toLocaleString()} keys — pick 5k keys for a closer
          comparison. Exact numbers vary with the hash function and server names.
        </p>
      </div>

      {/* Control Toolbar Panel */}
      <div className={`border rounded-2xl p-5 space-y-4 shadow-xl ${
        isDarkMode ? 'bg-[#1c1c1e] border-slate-800' : 'bg-white border-slate-200'
      }`}>
        
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
          
          {/* Toggle VNodes Mode */}
          <div className={`md:col-span-4 flex items-center justify-between p-2.5 rounded-xl border ${
            isDarkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'
          }`}>
            <span className={`text-xs font-mono ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>VNode System:</span>
            <button
              onClick={() => setUseVNodes(!useVNodes)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                useVNodes
                  ? 'bg-emerald-600 text-white shadow-md'
                  : isDarkMode
                  ? 'bg-slate-800 text-slate-400 hover:text-slate-200'
                  : 'bg-slate-200 text-slate-600 hover:text-slate-900'
              }`}
            >
              {useVNodes ? 'ON (VNodes)' : 'OFF (1 Node/Server)'}
            </button>
          </div>

          {/* VNode Slider */}
          <div className={`md:col-span-5 space-y-1.5 p-2.5 rounded-xl border ${
            isDarkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'
          }`}>
            <div className="flex justify-between text-xs font-mono">
              <span className={isDarkMode ? 'text-slate-400' : 'text-slate-500'}>VNodes per Machine:</span>
              <span className="text-emerald-600 dark:text-emerald-400 font-bold">{activeVNodeCount} VNodes</span>
            </div>
            <input
              type="range"
              min="1"
              max="200"
              step="1"
              value={vnodeSliderVal}
              disabled={!useVNodes}
              onChange={(e) => setVnodeSliderVal(Number(e.target.value))}
              className="w-full accent-emerald-500 bg-slate-200 dark:bg-slate-800 h-2 rounded-lg cursor-pointer disabled:opacity-40"
            />
          </div>

          {/* Key Scale Presets */}
          <div className={`md:col-span-3 space-y-1 p-2.5 rounded-xl border ${
            isDarkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'
          }`}>
            <span className={`text-[11px] font-mono block ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Test Key Scale:</span>
            <div className="flex space-x-1.5">
              {[100, 1000, 5000].map((count) => (
                <button
                  key={count}
                  onClick={() => setKeyCountPreset(count)}
                  className={`flex-1 py-1 text-xs font-mono font-bold rounded-lg transition-colors ${
                    keyCountPreset === count
                      ? 'bg-blue-600 text-white'
                      : isDarkMode
                      ? 'bg-slate-800 text-slate-400 hover:text-white'
                      : 'bg-slate-200 text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {count >= 1000 ? `${count / 1000}k` : count}
                </button>
              ))}
            </div>
          </div>

        </div>

        {/* Single Request Dispatcher Control Bar */}
        <div className={`p-3 rounded-xl border flex flex-col sm:flex-row items-center justify-between gap-3 text-xs font-mono ${
          isDarkMode ? 'bg-slate-950/80 border-slate-800' : 'bg-slate-50 border-slate-200'
        }`}>
          <div className="flex items-center space-x-2 w-full sm:w-auto">
            <Zap className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span className={`font-bold ${isDarkMode ? 'text-slate-200' : 'text-slate-800'}`}>Dispatch Request 1-by-1:</span>
            <input
              type="text"
              value={customVNodeReq}
              onChange={(e) => setCustomVNodeReq(e.target.value)}
              placeholder="Req string (e.g. Order_99)..."
              className={`border rounded-lg px-2.5 py-1 text-xs font-mono focus:outline-none focus:border-emerald-500 w-36 sm:w-48 ${
                isDarkMode ? 'bg-[#1c1c1e] border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-900'
              }`}
            />
          </div>

          <div className="flex items-center space-x-2 w-full sm:w-auto justify-end">
            <button
              onClick={() => handleSendVNodeSingleRequest(customVNodeReq)}
              className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold shadow-sm"
            >
              Send Key
            </button>
            <button
              onClick={() => handleSendVNodeSingleRequest()}
              className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold shadow-sm flex items-center space-x-1"
            >
              <Zap className="w-3.5 h-3.5 fill-current" />
              <span>+1 Request</span>
            </button>
          </div>
        </div>

        {/* Recent Dispatched Stream Logs */}
        {vnodeDispatchedLogs.length > 0 && (
          <div className="space-y-1">
            <span className={`text-xs uppercase font-mono font-bold block ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
              Recent Request Dispatches:
            </span>
            <div className={`flex flex-wrap gap-1.5 max-h-[80px] overflow-y-auto p-2 rounded-xl border text-[11px] font-mono ${
              isDarkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'
            }`}>
              {vnodeDispatchedLogs.map((log) => (
                <div
                  key={log.id}
                  className={`px-2 py-1 rounded-lg border flex items-center space-x-1.5 ${
                    isDarkMode ? 'bg-[#1c1c1e] border-slate-800 text-slate-300' : 'bg-white border-slate-200 text-slate-800 shadow-sm'
                  }`}
                >
                  <span className="font-bold text-amber-600 dark:text-amber-400">{log.keyString}</span>
                  <span className={isDarkMode ? 'text-slate-500' : 'text-slate-400'}>→</span>
                  <span className="font-bold px-1.5 py-0.5 rounded text-white text-xs" style={{ backgroundColor: log.serverColor }}>
                    {log.serverName}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Machine Scale Actions */}
        <div className={`flex items-center justify-between flex-wrap gap-3 text-xs font-mono pt-2 border-t ${
          isDarkMode ? 'border-slate-800' : 'border-slate-200'
        }`}>
          <div className="flex items-center space-x-2">
            <span className={isDarkMode ? 'text-slate-400' : 'text-slate-600'}>Physical Machines: <strong className={isDarkMode ? 'text-white' : 'text-slate-900'}>{servers.length}</strong></span>
            <span className={isDarkMode ? 'text-slate-600' : 'text-slate-300'}>|</span>
            <span className={isDarkMode ? 'text-slate-400' : 'text-slate-600'}>Ring Virtual Tokens: <strong className="text-emerald-600 dark:text-emerald-400">{virtualNodesList.length}</strong></span>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={handleRemovePhysicalServer}
              disabled={servers.length <= 1}
              className={`px-3 py-1.5 rounded-lg border transition-colors flex items-center space-x-1 ${
                isDarkMode
                  ? 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700/80 disabled:opacity-30'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-800 border-slate-300 disabled:opacity-30'
              }`}
            >
              <Minus className="w-3.5 h-3.5" />
              <span>Remove Machine</span>
            </button>
            <button
              onClick={handleAddPhysicalServer}
              disabled={servers.length >= 8}
              className={`px-3 py-1.5 rounded-lg border transition-colors flex items-center space-x-1 ${
                isDarkMode
                  ? 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700/80 disabled:opacity-30'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-800 border-slate-300 disabled:opacity-30'
              }`}
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Machine</span>
            </button>
          </div>
        </div>

        {/* Membership change: keys moved stays ≈ k/n */}
        <div className={`p-3 rounded-xl border space-y-2 ${
          isDarkMode ? 'bg-slate-950/80 border-slate-800' : 'bg-slate-50 border-slate-200'
        }`}>
          <p className={`text-sm font-semibold ${isDarkMode ? 'text-slate-100' : 'text-slate-800'}`}>
            If the cluster changed right now, how many of the {keyCountPreset.toLocaleString()} keys would move?
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className={isDarkMode ? 'text-slate-400' : 'text-slate-500'}>
                  <th className="py-1 pr-3 font-medium">Change</th>
                  <th className="py-1 pr-3 font-medium">Ideal k/n</th>
                  <th className="py-1 pr-3 font-medium">V = {activeVNodeCount}</th>
                  <th className="py-1 font-medium">V = 1</th>
                </tr>
              </thead>
              <tbody className={`font-mono ${isDarkMode ? 'text-slate-200' : 'text-slate-800'}`}>
                {[
                  membershipPreview.add && { label: `Add ${membershipPreview.add.name}`, ...membershipPreview.add },
                  membershipPreview.remove && { label: `Remove ${membershipPreview.remove.name}`, ...membershipPreview.remove },
                ]
                  .filter(Boolean)
                  .map((row) => {
                    const r = row as { label: string; pctV: number; pct1: number; ideal: number };
                    return (
                      <tr key={r.label} className={`border-t ${isDarkMode ? 'border-slate-800' : 'border-slate-200'}`}>
                        <td className="py-1.5 pr-3 font-sans">{r.label}</td>
                        <td className="py-1.5 pr-3">{r.ideal}%</td>
                        <td className="py-1.5 pr-3 font-bold text-emerald-700 dark:text-emerald-300">{r.pctV}%</td>
                        <td className="py-1.5 text-rose-700 dark:text-rose-300">{r.pct1}%</td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
          <p className={`text-xs leading-relaxed ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
            With many tokens the new machine takes a thin slice from every server, so the total moved lands close to k/n. With V = 1 it
            takes one random arc from one neighbour, which can be far more or far less than its fair share.
          </p>
        </div>

      </div>

      {/* View Viewport Container */}
      <div className={`border rounded-2xl p-5 shadow-xl space-y-4 ${
        isDarkMode ? 'bg-[#1c1c1e] border-slate-800' : 'bg-white border-slate-200'
      }`}>
        
        {/* View Mode Tabs */}
        <div className={`flex flex-wrap items-center justify-between gap-2 border-b pb-3 ${
          isDarkMode ? 'border-slate-800' : 'border-slate-200'
        }`}>
          <div className="flex flex-wrap gap-2 text-xs">
            <button
              onClick={() => setActiveTab('ring')}
              className={`px-3 py-1.5 rounded-xl font-bold transition-colors ${
                activeTab === 'ring'
                  ? 'bg-emerald-600 text-white'
                  : isDarkMode
                  ? 'bg-slate-950 text-slate-400 hover:text-white'
                  : 'bg-slate-100 text-slate-600 hover:text-slate-900'
              }`}
            >
              Virtual Ring Canvas
            </button>
            <button
              onClick={() => setActiveTab('charts')}
              className={`px-3 py-1.5 rounded-xl font-bold transition-colors ${
                activeTab === 'charts'
                  ? 'bg-emerald-600 text-white'
                  : isDarkMode
                  ? 'bg-slate-950 text-slate-400 hover:text-white'
                  : 'bg-slate-100 text-slate-600 hover:text-slate-900'
              }`}
            >
              Load Distribution Bar Chart
            </button>
            <button
              onClick={() => setActiveTab('table')}
              className={`px-3 py-1.5 rounded-xl font-bold transition-colors ${
                activeTab === 'table'
                  ? 'bg-emerald-600 text-white'
                  : isDarkMode
                  ? 'bg-slate-950 text-slate-400 hover:text-white'
                  : 'bg-slate-100 text-slate-600 hover:text-slate-900'
              }`}
            >
              Server Breakdown Table
            </button>
          </div>

          <div className={`flex items-center space-x-4 text-xs ${isDarkMode ? 'text-slate-300' : 'text-slate-600'}`}>
            <span>σ: <strong className="font-mono text-emerald-700 dark:text-emerald-300">{cv}% of mean</strong></span>
            <span>Busiest: <strong className="font-mono text-amber-700 dark:text-amber-300">{stats.maxLoadRatio}× avg</strong></span>
          </div>
        </div>

        {/* TAB 1: RING CANVAS */}
        {activeTab === 'ring' && (
          <div className={`flex flex-col items-center justify-center min-h-[380px] rounded-xl p-4 border ${
            isDarkMode ? 'bg-slate-950/80 border-slate-800' : 'bg-slate-50 border-slate-200'
          }`}>
            <HashRingCanvas
              servers={servers}
              vnodes={virtualNodesList}
              keys={keysList.slice(0, 120)}
              showVNodes={true}
              size={380}
              isDarkMode={isDarkMode}
            />
          </div>
        )}

        {/* TAB 2: BAR CHART */}
        {activeTab === 'charts' && (
          <div className={`min-h-[380px] flex flex-col justify-center rounded-xl p-4 border space-y-4 ${
            isDarkMode ? 'bg-slate-950/80 border-slate-800' : 'bg-slate-50 border-slate-200'
          }`}>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats.distribution}>
                  <XAxis dataKey="serverName" stroke={isDarkMode ? "#64748b" : "#475569"} fontSize={11} tickLine={false} />
                  <YAxis stroke={isDarkMode ? "#64748b" : "#475569"} fontSize={11} tickLine={false} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: isDarkMode ? '#0f172a' : '#ffffff',
                      borderColor: isDarkMode ? '#334155' : '#cbd5e1',
                      borderRadius: '12px',
                      color: isDarkMode ? '#fff' : '#0f172a',
                    }}
                  />
                  <Bar dataKey="keyCount" radius={[6, 6, 0, 0]}>
                    {stats.distribution.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="grid grid-cols-3 gap-3 text-center font-mono text-xs">
              <div className={`p-2.5 rounded-xl border ${
                isDarkMode ? 'bg-[#1c1c1e] border-slate-800' : 'bg-white border-slate-200'
              }`}>
                <span className={`text-xs block uppercase ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>σ (% of mean)</span>
                <span className="text-emerald-700 dark:text-emerald-300 font-bold">
                  {cv}% <span className="font-normal opacity-80">({stats.stdDeviation} keys)</span>
                </span>
              </div>
              <div className={`p-2.5 rounded-xl border ${
                isDarkMode ? 'bg-[#1c1c1e] border-slate-800' : 'bg-white border-slate-200'
              }`}>
                <span className={`text-xs block uppercase ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Max/Avg Load</span>
                <span className="text-amber-600 dark:text-amber-400 font-bold">{stats.maxLoadRatio}x</span>
              </div>
              <div className={`p-2.5 rounded-xl border ${
                isDarkMode ? 'bg-[#1c1c1e] border-slate-800' : 'bg-white border-slate-200'
              }`}>
                <span className={`text-xs block uppercase ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Keys / Server</span>
                <span className={`font-bold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>{Math.round(keyCountPreset / servers.length)}</span>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: BREAKDOWN TABLE */}
        {activeTab === 'table' && (
          <div className={`min-h-[380px] rounded-xl p-4 border overflow-x-auto ${
            isDarkMode ? 'bg-slate-950/80 border-slate-800' : 'bg-slate-50 border-slate-200'
          }`}>
            <table className="w-full text-left border-collapse text-xs font-mono">
              <thead>
                <tr className={`border-b ${isDarkMode ? 'border-slate-800 text-slate-400' : 'border-slate-200 text-slate-500'}`}>
                  <th className="py-2.5">Server</th>
                  <th className="py-2.5">Virtual Tokens</th>
                  <th className="py-2.5">Assigned Keys</th>
                  <th className="py-2.5">Load Percentage</th>
                  <th className="py-2.5">Ring Share</th>
                </tr>
              </thead>
              <tbody className={`divide-y ${
                isDarkMode ? 'divide-slate-800/60 text-slate-200' : 'divide-slate-200 text-slate-800'
              }`}>
                {stats.distribution.map((d) => (
                  <tr key={d.serverId}>
                    <td className="py-3 flex items-center space-x-2">
                      <span className="w-3 h-3 rounded-full" style={{ backgroundColor: d.color }} />
                      <span className="font-bold">{d.serverName}</span>
                    </td>
                    <td className={`py-3 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>{d.vnodeCount} VNodes</td>
                    <td className={`py-3 font-bold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>{d.keyCount.toLocaleString()} keys</td>
                    <td className="py-3 text-emerald-700 dark:text-emerald-300 font-bold">{d.percentage}%</td>
                    <td className={`py-3 ${isDarkMode ? 'text-slate-300' : 'text-slate-600'}`}>{d.arcCoveragePercentage}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className={`mt-3 text-xs ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
              Ring share = how much of the hash space the server's tokens own. Load follows ring share, plus a little noise from which test
              keys happened to be drawn.
            </p>
          </div>
        )}

      </div>

      <Takeaway>
        One point per server splits the ring into a few random-sized arcs, so some servers get far more keys than others. Many virtual
        nodes per server average those arcs out (the book cites σ ≈ 10% of the mean at 100 vnodes, ≈ 5% at 200) and keep keys moved on a
        membership change close to k/n — at the cost of a bigger ring map to store.
      </Takeaway>

      <Quiz persistKey="chapter5:quiz:module2" questions={QUIZ} />

    </div>
  );
};
