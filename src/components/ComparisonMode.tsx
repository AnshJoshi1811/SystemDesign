import React, { useState, useMemo } from 'react';
import { PhysicalServer } from '../types';
import {
  generateVirtualNodes,
  assignKeysToRingNodes,
  computeDistributionStats,
  getDefaultServers,
  generateSampleKeys,
} from '../lib/hash';
import { HashRingCanvas } from './HashRingCanvas';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Split, Layers, Zap, ArrowRight, ShieldCheck, Database, Check } from 'lucide-react';

interface ComparisonModeProps {
  isDarkMode?: boolean;
}

export const ComparisonMode: React.FC<ComparisonModeProps> = ({ isDarkMode = false }) => {
  const [servers, setServers] = useState<PhysicalServer[]>(getDefaultServers());

  const [testKeyCount, setTestKeyCount] = useState<number>(2000);
  const [activeTab, setActiveTab] = useState<'benchmark' | 'industry'>('benchmark');
  const [dbTab, setDbTab] = useState<'cassandra' | 'dynamodb' | 'scylladb'>('cassandra');

  // Left Side: V = 1 (No Virtual Nodes)
  const leftVirtualNodes = useMemo(() => {
    return generateVirtualNodes(servers, 1, 'murmur3');
  }, [servers]);

  // Right Side: V = 100 (With Virtual Nodes)
  const rightVirtualNodes = useMemo(() => {
    return generateVirtualNodes(servers, 100, 'murmur3');
  }, [servers]);

  // Generate Sample Keys
  const sampleKeys = useMemo(() => {
    return generateSampleKeys(testKeyCount, 'CompDataKey');
  }, [testKeyCount]);

  // Compute Left Stats (V = 1)
  const leftStats = useMemo(() => {
    const ringNodes = leftVirtualNodes.map((vn) => ({ id: vn.id, physicalServerId: vn.physicalServerId, angle: vn.angle, hashValue: vn.hashValue }));
    const mappedKeys = assignKeysToRingNodes(sampleKeys, ringNodes);
    return computeDistributionStats(
      servers.map((s) => ({ ...s, vnodesCount: 1 })),
      mappedKeys,
      leftVirtualNodes.map((vn) => ({ id: vn.id, physicalServerId: vn.physicalServerId, angle: vn.angle }))
    );
  }, [servers, sampleKeys, leftVirtualNodes]);

  // Compute Right Stats (V = 100)
  const rightStats = useMemo(() => {
    const ringNodes = rightVirtualNodes.map((vn) => ({ id: vn.id, physicalServerId: vn.physicalServerId, angle: vn.angle, hashValue: vn.hashValue }));
    const mappedKeys = assignKeysToRingNodes(sampleKeys, ringNodes);
    return computeDistributionStats(
      servers.map((s) => ({ ...s, vnodesCount: 100 })),
      mappedKeys,
      rightVirtualNodes.map((vn) => ({ id: vn.id, physicalServerId: vn.physicalServerId, angle: vn.angle }))
    );
  }, [servers, sampleKeys, rightVirtualNodes]);

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      
      {/* Intro Header */}
      <div className={`border rounded-2xl p-5 sm:p-6 space-y-2 shadow-xl ${
        isDarkMode ? 'bg-[#1c1c1e] border-slate-800' : 'bg-white border-slate-200'
      }`}>
        <div className="flex items-center space-x-3">
          <span className="px-3 py-1 bg-purple-500/10 text-purple-600 dark:text-purple-400 font-mono text-xs rounded-full border border-purple-500/20 font-semibold">
            Lab & Benchmark
          </span>
          <span className={`text-xs ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Side-by-Side Comparison</span>
        </div>
        <h2 className={`text-xl sm:text-2xl font-bold tracking-tight ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
          Without VNodes (V = 1) vs With 100 VNodes (V = 100)
        </h2>
        <p className={`text-xs max-w-3xl leading-relaxed ${isDarkMode ? 'text-slate-300' : 'text-slate-600'}`}>
          Compare single-node physical sharding against 100 virtual node token distribution side by side under identical traffic workload.
        </p>
      </div>

      {/* Main View Mode Selector */}
      <div className={`flex space-x-2 p-1.5 rounded-2xl border font-mono text-xs max-w-md ${
        isDarkMode ? 'bg-[#1c1c1e] border-slate-800' : 'bg-slate-100 border-slate-200'
      }`}>
        <button
          onClick={() => setActiveTab('benchmark')}
          className={`flex-1 py-2 rounded-xl font-bold transition-colors ${
            activeTab === 'benchmark'
              ? 'bg-purple-600 text-white shadow-md'
              : isDarkMode
              ? 'text-slate-400 hover:text-white'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          Side-by-Side Benchmark
        </button>
        <button
          onClick={() => setActiveTab('industry')}
          className={`flex-1 py-2 rounded-xl font-bold transition-colors ${
            activeTab === 'industry'
              ? 'bg-purple-600 text-white shadow-md'
              : isDarkMode
              ? 'text-slate-400 hover:text-white'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          Production DB Architecture
        </button>
      </div>

      {/* TAB 1: SIDE BY SIDE BENCHMARK */}
      {activeTab === 'benchmark' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          
          {/* LEFT PANEL: V = 1 */}
          <div className={`border rounded-2xl p-5 space-y-4 shadow-xl flex flex-col justify-between ${
            isDarkMode ? 'bg-[#1c1c1e]/90 border-slate-800' : 'bg-white border-slate-200'
          }`}>
            <div className={`flex items-center justify-between border-b pb-2 ${
              isDarkMode ? 'border-slate-800' : 'border-slate-200'
            }`}>
              <span className="px-3 py-1 bg-amber-500/10 text-amber-600 dark:text-amber-400 font-mono text-xs rounded-full border border-amber-500/20 font-bold">
                V = 1 Node / Server
              </span>
              <span className={`text-xs font-mono ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Basic Ring</span>
            </div>

            <div className={`flex justify-center rounded-xl p-3 border ${
              isDarkMode ? 'bg-slate-950/80 border-slate-800' : 'bg-slate-50 border-slate-200'
            }`}>
              <HashRingCanvas
                servers={servers}
                vnodes={leftVirtualNodes}
                keys={sampleKeys.slice(0, 80)}
                showVNodes={false}
                size={260}
                isDarkMode={isDarkMode}
              />
            </div>

            <div className="grid grid-cols-2 gap-2 font-mono text-xs">
              <div className={`p-2.5 rounded-xl border ${
                isDarkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'
              }`}>
                <span className={`text-[10px] block uppercase ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Std Deviation (σ)</span>
                <span className="text-base font-bold text-amber-600 dark:text-amber-400">{leftStats.stdDeviation}</span>
              </div>
              <div className={`p-2.5 rounded-xl border ${
                isDarkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'
              }`}>
                <span className={`text-[10px] block uppercase ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Max Imbalance</span>
                <span className="text-base font-bold text-red-600 dark:text-red-400">{leftStats.maxLoadRatio}x</span>
              </div>
            </div>

            <div className="h-32 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={leftStats.distribution}>
                  <XAxis dataKey="serverName" stroke={isDarkMode ? "#64748b" : "#475569"} fontSize={10} />
                  <YAxis stroke={isDarkMode ? "#64748b" : "#475569"} fontSize={10} />
                  <Tooltip contentStyle={{
                    backgroundColor: isDarkMode ? '#0f172a' : '#ffffff',
                    borderColor: isDarkMode ? '#334155' : '#cbd5e1',
                    borderRadius: '8px',
                    color: isDarkMode ? '#fff' : '#0f172a'
                  }} />
                  <Bar dataKey="keyCount">
                    {leftStats.distribution.map((entry, index) => (
                      <Cell key={`left-cell-${index}`} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* RIGHT PANEL: V = 100 */}
          <div className={`border rounded-2xl p-5 space-y-4 shadow-xl flex flex-col justify-between ${
            isDarkMode ? 'bg-[#1c1c1e]/90 border-emerald-500/30' : 'bg-white border-emerald-300'
          }`}>
            <div className={`flex items-center justify-between border-b pb-2 ${
              isDarkMode ? 'border-slate-800' : 'border-slate-200'
            }`}>
              <span className="px-3 py-1 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-mono text-xs rounded-full border border-emerald-500/20 font-bold">
                V = 100 VNodes / Server
              </span>
              <span className="text-xs font-mono text-emerald-600 dark:text-emerald-400 font-semibold">Production Ready</span>
            </div>

            <div className={`flex justify-center rounded-xl p-3 border ${
              isDarkMode ? 'bg-slate-950/80 border-slate-800' : 'bg-slate-50 border-slate-200'
            }`}>
              <HashRingCanvas
                servers={servers}
                vnodes={rightVirtualNodes}
                keys={sampleKeys.slice(0, 80)}
                showVNodes={true}
                size={260}
                isDarkMode={isDarkMode}
              />
            </div>

            <div className="grid grid-cols-2 gap-2 font-mono text-xs">
              <div className={`p-2.5 rounded-xl border ${
                isDarkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'
              }`}>
                <span className={`text-[10px] block uppercase ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Std Deviation (σ)</span>
                <span className="text-base font-bold text-emerald-600 dark:text-emerald-400">{rightStats.stdDeviation}</span>
              </div>
              <div className={`p-2.5 rounded-xl border ${
                isDarkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'
              }`}>
                <span className={`text-[10px] block uppercase ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Max Imbalance</span>
                <span className="text-base font-bold text-emerald-600 dark:text-emerald-400">{rightStats.maxLoadRatio}x</span>
              </div>
            </div>

            <div className="h-32 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={rightStats.distribution}>
                  <XAxis dataKey="serverName" stroke={isDarkMode ? "#64748b" : "#475569"} fontSize={10} />
                  <YAxis stroke={isDarkMode ? "#64748b" : "#475569"} fontSize={10} />
                  <Tooltip contentStyle={{
                    backgroundColor: isDarkMode ? '#0f172a' : '#ffffff',
                    borderColor: isDarkMode ? '#334155' : '#cbd5e1',
                    borderRadius: '8px',
                    color: isDarkMode ? '#fff' : '#0f172a'
                  }} />
                  <Bar dataKey="keyCount">
                    {rightStats.distribution.map((entry, index) => (
                      <Cell key={`right-cell-${index}`} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

        </div>
      )}

      {/* TAB 2: INDUSTRY CASE STUDIES */}
      {activeTab === 'industry' && (
        <div className={`border rounded-2xl p-6 space-y-4 shadow-xl ${
          isDarkMode ? 'bg-[#1c1c1e] border-slate-800' : 'bg-white border-slate-200'
        }`}>
          <div className={`flex items-center space-x-3 border-b pb-3 ${
            isDarkMode ? 'border-slate-800' : 'border-slate-200'
          }`}>
            <Database className="w-5 h-5 text-purple-600 dark:text-purple-400" />
            <h3 className={`text-lg font-bold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>Production Industry Implementations</h3>
          </div>

          <div className={`flex space-x-2 border-b pb-2 ${
            isDarkMode ? 'border-slate-800' : 'border-slate-200'
          }`}>
            {[
              { id: 'cassandra', label: 'Apache Cassandra' },
              { id: 'dynamodb', label: 'Amazon DynamoDB' },
              { id: 'scylladb', label: 'ScyllaDB / Riak KV' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setDbTab(tab.id as any)}
                className={`px-4 py-2 rounded-xl text-xs font-bold font-mono transition-colors ${
                  dbTab === tab.id
                    ? 'bg-purple-600 text-white shadow-md'
                    : isDarkMode
                    ? 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className={`text-xs leading-relaxed space-y-2 font-mono p-5 rounded-xl border ${
            isDarkMode
              ? 'bg-slate-950 border-slate-800 text-slate-300'
              : 'bg-slate-50 border-slate-200 text-slate-700'
          }`}>
            {dbTab === 'cassandra' && (
              <div className="space-y-2">
                <h4 className={`text-sm font-bold font-sans ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>Apache Cassandra (num_tokens = 256)</h4>
                <p>
                  Cassandra assigns multiple token ranges to each node via <code className="text-blue-600 dark:text-cyan-400 font-bold">num_tokens</code>. When adding a machine to a 50-node cluster, it streams data from all 50 peers simultaneously instead of taking a single large contiguous block from one node.
                </p>
              </div>
            )}

            {dbTab === 'dynamodb' && (
              <div className="space-y-2">
                <h4 className={`text-sm font-bold font-sans ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>Amazon DynamoDB Auto-Partitioning</h4>
                <p>
                  DynamoDB routes client SDK requests using internal request router hash rings. Items are hashed on partition key (PK) and mapped to storage partitions transparently without downtime.
                </p>
              </div>
            )}

            {dbTab === 'scylladb' && (
              <div className="space-y-2">
                <h4 className={`text-sm font-bold font-sans ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>ScyllaDB Core-Pinned Tokens</h4>
                <p>
                  ScyllaDB pins virtual node tokens to specific CPU cores on the host machine, achieving sub-millisecond p99 latency by eliminating cross-core lock contention.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

    </div>
  );
};
