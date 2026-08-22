import React, { useState, useMemo } from 'react';
import { PhysicalServer, HashKey } from '../types';
import {
  generateVirtualNodes,
  assignKeysToRingNodes,
  computeDistributionStats,
  getDefaultServers,
  generateSampleKeys,
  hashToKey,
  SERVER_COLORS,
} from '../lib/hash';
import { HashRingCanvas } from './HashRingCanvas';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { motion } from 'motion/react';
import { Layers, Sliders, BarChart2, Plus, Minus, ShieldCheck, Zap, Layers3, Activity } from 'lucide-react';

interface Module2VirtualNodesProps {
  isDarkMode?: boolean;
}

export const Module2VirtualNodes: React.FC<Module2VirtualNodesProps> = ({ isDarkMode = false }) => {
  const [servers, setServers] = useState<PhysicalServer[]>(getDefaultServers());

  const [useVNodes, setUseVNodes] = useState<boolean>(true);
  const [vnodeSliderVal, setVnodeSliderVal] = useState<number>(50);
  const [keyCountPreset, setKeyCountPreset] = useState<number>(1000);
  const [activeTab, setActiveTab] = useState<'ring' | 'charts' | 'table'>('ring');

  // Single Request Dispatcher state
  const [customVNodeReq, setCustomVNodeReq] = useState<string>('Data_Req_1');
  const [vnodeDispatchedLogs, setVNodeDispatchedLogs] = useState<Array<{
    id: string;
    keyString: string;
    angle: number;
    hashHex: string;
    serverName: string;
    serverColor: string;
    timestamp: string;
  }>>([]);

  const activeVNodeCount = useVNodes ? vnodeSliderVal : 1;

  // Single request sender function
  const handleSendVNodeSingleRequest = (customStr?: string) => {
    const keyStr = (customStr !== undefined ? customStr : customVNodeReq).trim() || `Req_${Math.floor(Math.random() * 9000 + 1000)}`;
    const testKey = hashToKey(keyStr);

    const ringNodes = virtualNodesList.map((vn) => ({
      id: vn.id,
      physicalServerId: vn.physicalServerId,
      angle: vn.angle,
      hashValue: vn.hashValue,
    }));

    const assignedKeys = assignKeysToRingNodes([testKey], ringNodes);
    const assignedKey = assignedKeys[0];
    const targetServer = servers.find((s) => s.id === assignedKey.assignedServerId);

    if (targetServer) {
      setVNodeDispatchedLogs((prev) => [
        {
          id: testKey.id + '_' + Date.now(),
          keyString: testKey.keyString,
          angle: testKey.angle,
          hashHex: testKey.hashHex,
          serverName: targetServer.name,
          serverColor: targetServer.color,
          timestamp: new Date().toLocaleTimeString(),
        },
        ...prev.slice(0, 15),
      ]);
    }
  };

  // Generate virtual nodes array
  const virtualNodesList = useMemo(() => {
    return generateVirtualNodes(servers, activeVNodeCount, 'murmur3');
  }, [servers, activeVNodeCount]);

  // Generate test keys based on keyCountPreset
  const keysList = useMemo(() => {
    const rawKeys = generateSampleKeys(keyCountPreset, 'VNodeDataKey');
    const ringNodes = virtualNodesList.map((vn) => ({
      id: vn.id,
      physicalServerId: vn.physicalServerId,
      angle: vn.angle,
      hashValue: vn.hashValue,
    }));
    return assignKeysToRingNodes(rawKeys, ringNodes);
  }, [keyCountPreset, virtualNodesList]);

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

  // Handle Server Add/Remove
  const handleAddPhysicalServer = () => {
    if (servers.length >= 8) return;
    const nextIdx = servers.length;
    const newServer: PhysicalServer = {
      id: `S${nextIdx}`,
      name: `Server ${nextIdx}`,
      color: SERVER_COLORS[nextIdx % SERVER_COLORS.length],
      hashValue: 0,
      angle: 0,
      vnodesCount: activeVNodeCount,
    };
    setServers([...servers, newServer]);
  };

  const handleRemovePhysicalServer = () => {
    if (servers.length <= 1) return;
    setServers(servers.slice(0, servers.length - 1));
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      
      {/* Module Title Header */}
      <div className={`border rounded-2xl p-5 sm:p-6 space-y-2 shadow-xl ${
        isDarkMode ? 'bg-[#1c1c1e] border-slate-800' : 'bg-white border-slate-200'
      }`}>
        <div className="flex items-center space-x-3">
          <span className="px-3 py-1 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-mono text-xs rounded-full border border-emerald-500/20 font-semibold">
            Module 2 — Advanced Solution
          </span>
          <span className={`text-xs ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Virtual Nodes (VNodes)</span>
        </div>
        <h2 className={`text-xl sm:text-2xl font-bold tracking-tight ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
          Virtual Nodes & Uniform Load Balancing
        </h2>
        <p className={`text-xs max-w-3xl leading-relaxed ${isDarkMode ? 'text-slate-300' : 'text-slate-600'}`}>
          Each physical server is chopped into <span className="text-emerald-600 dark:text-emerald-400 font-semibold">V virtual tokens</span> interleaved across the ring. Adjust the slider to observe how higher VNode counts smooth out load imbalance and lower Standard Deviation (σ)!
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
            <span className={`text-[10px] uppercase font-mono font-bold block ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
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
                  <span className="font-bold px-1.5 py-0.5 rounded text-white text-[10px]" style={{ backgroundColor: log.serverColor }}>
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

      </div>

      {/* View Viewport Container */}
      <div className={`border rounded-2xl p-5 shadow-xl space-y-4 ${
        isDarkMode ? 'bg-[#1c1c1e] border-slate-800' : 'bg-white border-slate-200'
      }`}>
        
        {/* View Mode Tabs */}
        <div className={`flex items-center justify-between border-b pb-3 ${
          isDarkMode ? 'border-slate-800' : 'border-slate-200'
        }`}>
          <div className="flex space-x-2 font-mono text-xs">
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

          <div className="hidden sm:flex items-center space-x-4 font-mono text-xs">
            <span>Std Dev (σ): <strong className="text-emerald-600 dark:text-emerald-400">{stats.stdDeviation}</strong></span>
            <span>Max Imbalance: <strong className="text-amber-600 dark:text-amber-400">{stats.maxLoadRatio}x</strong></span>
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
                <span className={`text-[10px] block uppercase ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Standard Deviation</span>
                <span className="text-emerald-600 dark:text-emerald-400 font-bold">{stats.stdDeviation}</span>
              </div>
              <div className={`p-2.5 rounded-xl border ${
                isDarkMode ? 'bg-[#1c1c1e] border-slate-800' : 'bg-white border-slate-200'
              }`}>
                <span className={`text-[10px] block uppercase ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Max/Avg Load</span>
                <span className="text-amber-600 dark:text-amber-400 font-bold">{stats.maxLoadRatio}x</span>
              </div>
              <div className={`p-2.5 rounded-xl border ${
                isDarkMode ? 'bg-[#1c1c1e] border-slate-800' : 'bg-white border-slate-200'
              }`}>
                <span className={`text-[10px] block uppercase ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Keys / Server</span>
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
                    <td className="py-3 text-emerald-600 dark:text-emerald-400 font-bold">{d.percentage}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

      </div>

    </div>
  );
};
