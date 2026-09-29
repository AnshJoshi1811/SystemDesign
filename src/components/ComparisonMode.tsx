import React, { useState, useMemo } from 'react';
import { PhysicalServer, HashKey } from '../types';
import {
  generateVirtualNodes,
  assignKeysToRingNodes,
  computeDistributionStats,
  generateSampleKeys,
  makeServer,
  vnodesToRingNodes,
  countMovedRing,
  stdDevPercentOfMean,
  arcSharePercentOfMean,
} from '../lib/hash';
import { HashRingCanvas } from './HashRingCanvas';
import { usePersistentState } from '../lib/usePersistentState';
import { LessonGoal, Takeaway, Quiz, QuizQuestion } from './learn/LearningKit';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, ReferenceLine } from 'recharts';
import { Database } from 'lucide-react';

interface ComparisonModeProps {
  isDarkMode?: boolean;
}

const KEY_COUNTS = [1000, 5000, 20000];
const VNODE_OPTIONS = [10, 50, 100, 200];

const QUIZ: QuizQuestion[] = [
  {
    question: 'You raise virtual nodes per server from 10 to 200 with the same servers and keys. What should you expect?',
    options: [
      {
        text: 'Lower spread of load between servers, with a larger ring map to store',
        correct: true,
        why: 'More tokens average out random arc sizes (σ falls roughly like 1/√V), and every extra token is one more entry in the token → server map.',
      },
      {
        text: 'Fewer keys moved per server added, well below k/n',
        why: 'Moved keys can’t beat k/n on average — the new server must take its fair share. Virtual nodes make the number land close to k/n instead of swinging randomly.',
      },
      {
        text: 'Faster lookups',
        why: 'More tokens make the sorted ring longer; binary search is still fast, but it is not faster than with fewer tokens.',
      },
    ],
  },
  {
    question: 'Why did Cassandra 4.0 lower its default num_tokens from 256 to 16?',
    options: [
      {
        text: 'It added a token-allocation algorithm that picks balanced positions, so far fewer tokens give good balance with less overhead',
        correct: true,
        why: 'Random placement needs many tokens to average out. Deliberate placement reaches similar balance with 16, which also makes operations like repair and streaming cheaper.',
      },
      {
        text: 'Virtual nodes turned out not to help balance',
        why: 'They do help — this page shows it. The change was about getting the same balance with fewer, smarter-placed tokens.',
      },
      {
        text: 'Clusters became smaller, so fewer tokens were enough',
        why: 'The motivation was per-token overhead and better placement, not smaller clusters.',
      },
    ],
  },
];

/** Everything we show for one side: ring tokens, mapped keys, stats, and keys moved when one server is added. */
function measure(servers: PhysicalServer[], sampleKeys: HashKey[], v: number) {
  const vnodes = generateVirtualNodes(servers, v, 'murmur3');
  const ring = vnodesToRingNodes(vnodes);
  const mappedKeys = assignKeysToRingNodes(sampleKeys, ring);
  const stats = computeDistributionStats(
    servers.map((s) => ({ ...s, vnodesCount: v })),
    mappedKeys,
    ring
  );
  const grown = [...servers, makeServer(servers.length)];
  const movedOnAdd = countMovedRing(sampleKeys, ring, vnodesToRingNodes(generateVirtualNodes(grown, v, 'murmur3')));
  return {
    v,
    vnodes,
    mappedKeys,
    stats,
    cv: stdDevPercentOfMean(stats.stdDeviation, sampleKeys.length, servers.length),
    arcCv: arcSharePercentOfMean(stats),
    movedPct: Number(((movedOnAdd / (sampleKeys.length || 1)) * 100).toFixed(1)),
  };
}

type SideResult = ReturnType<typeof measure>;

export const ComparisonMode: React.FC<ComparisonModeProps> = ({ isDarkMode = false }) => {
  const [serverCount, setServerCount] = usePersistentState<number>('chapter5:compare:servers', 4);
  const [testKeyCount, setTestKeyCount] = usePersistentState<number>('chapter5:compare:keys', 5000);
  const [vnodesPerServer, setVnodesPerServer] = usePersistentState<number>('chapter5:compare:vnodes', 100);
  const [activeTab, setActiveTab] = usePersistentState<'benchmark' | 'industry'>('chapter5:compare:tab', 'benchmark');
  const [dbTab, setDbTab] = useState<'cassandra' | 'dynamo' | 'others'>('cassandra');

  const servers = useMemo<PhysicalServer[]>(
    () => Array.from({ length: serverCount }, (_, i) => makeServer(i)),
    [serverCount]
  );

  const sampleKeys = useMemo(() => generateSampleKeys(testKeyCount, 'CompDataKey'), [testKeyCount]);

  const left = useMemo(() => measure(servers, sampleKeys, 1), [servers, sampleKeys]);
  const right = useMemo(() => measure(servers, sampleKeys, vnodesPerServer), [servers, sampleKeys, vnodesPerServer]);
  const idealMovedPct = Number((100 / (serverCount + 1)).toFixed(1));
  const meanKeys = testKeyCount / serverCount;

  const panelBg = isDarkMode ? 'bg-[#1c1c1e]/90' : 'bg-white';
  const tileBg = isDarkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200';
  const muted = isDarkMode ? 'text-slate-400' : 'text-slate-500';
  const axisColor = isDarkMode ? '#94a3b8' : '#475569';

  const chip = (active: boolean) =>
    `px-2.5 py-1 rounded-lg text-xs font-mono font-bold transition-colors ${
      active
        ? 'bg-purple-600 text-white'
        : isDarkMode
        ? 'bg-slate-800 text-slate-300 hover:text-white'
        : 'bg-slate-200 text-slate-700 hover:text-slate-900'
    }`;

  // A plain render function (not a nested component) so the charts aren't remounted on every render.
  const renderSide = (side: SideResult, good: boolean) => (
    <div className={`border rounded-2xl p-5 space-y-4 shadow-xl flex flex-col ${panelBg} ${
      good ? (isDarkMode ? 'border-emerald-500/30' : 'border-emerald-300') : isDarkMode ? 'border-slate-800' : 'border-slate-200'
    }`}>
      <div className={`flex items-center justify-between border-b pb-2 ${isDarkMode ? 'border-slate-800' : 'border-slate-200'}`}>
        <span className={`px-3 py-1 font-mono text-xs rounded-full border font-bold ${
          good
            ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20'
            : 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20'
        }`}>
          V = {side.v} {side.v === 1 ? 'point / server' : 'vnodes / server'}
        </span>
        <span className={`text-xs ${muted}`}>{side.vnodes.length} tokens on the ring</span>
      </div>

      <div className={`flex justify-center rounded-xl p-3 border ${isDarkMode ? 'bg-slate-950/80 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
        <HashRingCanvas
          servers={servers}
          vnodes={side.vnodes}
          keys={side.mappedKeys.slice(0, 80)}
          showVNodes={true}
          size={260}
          isDarkMode={isDarkMode}
        />
      </div>

      <div className="grid grid-cols-3 gap-2 text-xs">
        {[
          { label: 'σ, % of mean', value: `${side.cv}%` },
          { label: 'Busiest / avg', value: `${side.stats.maxLoadRatio}×` },
          { label: `Moved on +1 server`, value: `${side.movedPct}%` },
        ].map((t) => (
          <div key={t.label} className={`p-2.5 rounded-xl border ${tileBg}`}>
            <span className={`text-xs block ${muted}`}>{t.label}</span>
            <span className={`text-base font-mono font-bold ${good ? 'text-emerald-700 dark:text-emerald-300' : 'text-amber-700 dark:text-amber-300'}`}>
              {t.value}
            </span>
          </div>
        ))}
      </div>

      <div className="h-36 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={side.stats.distribution}>
            <XAxis dataKey="serverName" stroke={axisColor} fontSize={11} tickLine={false} />
            <YAxis stroke={axisColor} fontSize={11} tickLine={false} width={44} />
            <ReferenceLine y={meanKeys} stroke={axisColor} strokeDasharray="4 3" label={{ value: 'fair share', fill: axisColor, fontSize: 11, position: 'insideTopRight' }} />
            <Tooltip
              contentStyle={{
                backgroundColor: isDarkMode ? '#0f172a' : '#ffffff',
                borderColor: isDarkMode ? '#334155' : '#cbd5e1',
                borderRadius: '8px',
                color: isDarkMode ? '#fff' : '#0f172a',
              }}
            />
            <Bar dataKey="keyCount" name="keys">
              {side.stats.distribution.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );

  return (
    <div className="space-y-6 max-w-6xl mx-auto">

      <LessonGoal
        goal="Put the basic ring (one point per server) and a virtual-node ring side by side on the same servers and keys, and measure how evenly load spreads and how many keys move when a server joins."
        why={`Change the controls and watch both sides recompute. The ideal when growing ${serverCount} → ${serverCount + 1} servers is k/n = ${idealMovedPct}% of keys moved.`}
      />

      {/* Main View Mode Selector */}
      <div className={`flex space-x-2 p-1.5 rounded-2xl border text-xs max-w-md ${
        isDarkMode ? 'bg-[#1c1c1e] border-slate-800' : 'bg-slate-100 border-slate-200'
      }`}>
        {[
          { id: 'benchmark', label: 'Side-by-side benchmark' },
          { id: 'industry', label: 'In real databases' },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id as 'benchmark' | 'industry')}
            className={`flex-1 py-2 rounded-xl font-bold transition-colors ${
              activeTab === t.id
                ? 'bg-purple-600 text-white shadow-md'
                : isDarkMode
                ? 'text-slate-300 hover:text-white'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* TAB 1: SIDE BY SIDE BENCHMARK */}
      {activeTab === 'benchmark' && (
        <>
          <div className={`border rounded-2xl p-4 flex flex-wrap gap-x-6 gap-y-3 items-center ${panelBg} ${isDarkMode ? 'border-slate-800' : 'border-slate-200'}`}>
            <div className="flex items-center gap-2">
              <span className={`text-xs ${muted}`}>Servers</span>
              <input
                type="range"
                min={2}
                max={8}
                value={serverCount}
                onChange={(e) => setServerCount(Number(e.target.value))}
                className="w-28 accent-purple-500"
                aria-label="Number of servers"
              />
              <span className={`text-sm font-mono font-bold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>{serverCount}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className={`text-xs ${muted}`}>Test keys</span>
              {KEY_COUNTS.map((k) => (
                <button key={k} onClick={() => setTestKeyCount(k)} className={chip(testKeyCount === k)}>
                  {k / 1000}k
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <span className={`text-xs ${muted}`}>Vnodes / server (right side)</span>
              {VNODE_OPTIONS.map((v) => (
                <button key={v} onClick={() => setVnodesPerServer(v)} className={chip(vnodesPerServer === v)}>
                  {v}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {renderSide(left, false)}
            {renderSide(right, true)}
          </div>

          <div className={`border rounded-2xl p-4 text-sm leading-relaxed ${panelBg} ${isDarkMode ? 'border-slate-800 text-slate-300' : 'border-slate-200 text-slate-600'}`}>
            <strong className={isDarkMode ? 'text-white' : 'text-slate-900'}>Reading the numbers: </strong>
            σ of each server's hash-space share is {left.arcCv}% of the mean with one point per server vs {right.arcCv}% with{' '}
            {vnodesPerServer} vnodes. The book cites ~10% at 100 vnodes and ~5% at 200. The key-count σ tiles also include sampling
            noise of about {(100 / Math.sqrt(meanKeys)).toFixed(1)}% from testing {testKeyCount.toLocaleString()} keys — choose 20k to
            shrink it. Moved-on-add should hover near {idealMovedPct}% on the right; on the left it is whatever arc the new server lands in.
          </div>
        </>
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
            <h3 className={`text-lg font-bold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>Where consistent hashing shows up</h3>
          </div>

          <div className={`flex flex-wrap gap-2 border-b pb-2 ${
            isDarkMode ? 'border-slate-800' : 'border-slate-200'
          }`}>
            {[
              { id: 'cassandra', label: 'Apache Cassandra' },
              { id: 'dynamo', label: 'Amazon Dynamo' },
              { id: 'others', label: 'Discord, Akamai, Maglev' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setDbTab(tab.id as 'cassandra' | 'dynamo' | 'others')}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-colors ${
                  dbTab === tab.id
                    ? 'bg-purple-600 text-white shadow-md'
                    : isDarkMode
                    ? 'text-slate-300 hover:text-white hover:bg-slate-800'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className={`text-sm leading-relaxed space-y-2 p-5 rounded-xl border ${
            isDarkMode
              ? 'bg-slate-950 border-slate-800 text-slate-300'
              : 'bg-slate-50 border-slate-200 text-slate-700'
          }`}>
            {dbTab === 'cassandra' && (
              <div className="space-y-2">
                <h4 className={`text-base font-bold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                  Apache Cassandra — <code className="font-mono text-sm">num_tokens</code>
                </h4>
                <p>
                  Each Cassandra node owns several token ranges on a ring, set by <code className="font-mono">num_tokens</code> — these
                  are its virtual nodes. When a node joins, it takes small ranges from many existing nodes and streams data from all of them
                  in parallel, instead of one neighbour handing over one large range.
                </p>
                <p>
                  Through Cassandra 3.x the default was <code className="font-mono">num_tokens: 256</code> with random token positions.
                  Cassandra 4.0 changed the default to <code className="font-mono">16</code>, paired with a token-allocation algorithm
                  that chooses balanced positions — deliberate placement gets good balance with far fewer tokens, and fewer tokens make
                  repair and streaming cheaper.
                </p>
              </div>
            )}

            {dbTab === 'dynamo' && (
              <div className="space-y-2">
                <h4 className={`text-base font-bold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>Amazon Dynamo (the 2007 paper)</h4>
                <p>
                  The book lists Dynamo's partitioning component as a classic user of consistent hashing. The paper describes a hash ring
                  where each physical node is assigned multiple virtual nodes, so a node's load can match its capacity (more powerful
                  machines get more tokens) and a failed node's load spreads over many peers.
                </p>
                <p>
                  Note that the managed DynamoDB service is a later system; it also hashes the partition key to pick a partition, but its
                  internals are not the same as the paper's ring.
                </p>
              </div>
            )}

            {dbTab === 'others' && (
              <div className="space-y-2">
                <h4 className={`text-base font-bold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>Other examples the book cites</h4>
                <ul className="list-disc pl-5 space-y-1">
                  <li><strong>Discord</strong> — deciding which machine in the cluster runs the process for each Discord server (guild), so adding machines moves only a few guilds.</li>
                  <li><strong>Akamai CDN</strong> — mapping content to cache servers so a server joining or leaving only reshuffles a small share of cached objects.</li>
                  <li><strong>Google Maglev</strong> — a network load balancer that uses its own consistent-hashing variant so connections keep hitting the same backend when backends change.</li>
                </ul>
              </div>
            )}
          </div>
        </div>
      )}

      <Takeaway>
        Same servers, same keys: one point per server gives lopsided load and a random amount of data moved when a server joins; enough
        virtual nodes bring load close to the fair share and moved keys close to k/n. Real systems tune the token count against its
        overhead — Cassandra now defaults to 16 well-placed tokens rather than 256 random ones.
      </Takeaway>

      <Quiz persistKey="chapter5:quiz:comparison" questions={QUIZ} />
    </div>
  );
};
