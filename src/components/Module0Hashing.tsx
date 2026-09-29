import React, { useState } from 'react';
import { HashKey, PhysicalServer, Ch5Part } from '../types';
import { hashToKey, assignKeysTraditional, getDefaultServers, generateSampleKeys, makeServer } from '../lib/hash';
import { HashRingCanvas } from './HashRingCanvas';
import { usePersistentState } from '../lib/usePersistentState';
import { LessonGoal, Takeaway, Term, Quiz, QuizQuestion } from './learn/LearningKit';
import { motion, AnimatePresence } from 'motion/react';
import {
  ArrowRight,
  Cpu,
  Plus,
  Minus,
  Hash,
  RotateCw,
  AlertTriangle,
  ChevronRight,
  ChevronLeft,
  Server,
} from 'lucide-react';

interface Module0HashingProps {
  isDarkMode?: boolean;
  onNavigateModule?: (part: Ch5Part) => void;
}

const SECTION_GOALS: Record<number, { goal: React.ReactNode; why: React.ReactNode }> = {
  1: {
    goal: 'A hash function turns any key into a fixed-size number — the same key always gives the same number.',
    why: 'That determinism is what lets every client independently agree on where a key lives, without asking a directory.',
  },
  2: {
    goal: 'All possible hash values form a range from 0 to 2^32 − 1. Joining the two ends turns that line into a ring.',
    why: 'On a ring there is no "end": walking clockwise from any point always reaches another point. The next part relies on that.',
  },
  3: {
    goal: 'The simplest way to spread keys over N servers is server = hash(key) % N.',
    why: 'It balances well while N stays fixed. Watch the buckets — then see what happens when N changes.',
  },
  4: {
    goal: 'Changing N by one server makes hash(key) % N give a different answer for most keys.',
    why: 'Every key that changes server is a cache miss or a data move. This is the rehashing problem consistent hashing solves.',
  },
};

const QUIZ: QuizQuestion[] = [
  {
    question: 'A cache cluster uses server = hash(key) % 4. One server is added (N = 5). Roughly what fraction of keys now map to a different server?',
    options: [
      {
        text: 'About 80% — most keys move',
        correct: true,
        why: 'A key stays put only if hash % 4 and hash % 5 happen to agree, which is true for about 1 in 5 keys. So ~4/5 move, even though the new server should only take 1/5 of the data.',
      },
      {
        text: 'About 20% — only the new server’s share',
        why: '20% is what an ideal scheme would move (the new server’s fair share). Modulo moves far more, because changing N changes the remainder for almost every key.',
      },
      {
        text: 'None — existing keys keep their server until they expire',
        why: 'The formula is re-evaluated on every lookup, so as soon as N changes, clients start asking a different server for most keys.',
      },
    ],
  },
  {
    question: 'Why must the hash function be deterministic for sharding to work?',
    options: [
      {
        text: 'So every client computes the same server for the same key without coordinating',
        correct: true,
        why: 'Routing works only because hash("User123") is the same on every machine, every time.',
      },
      {
        text: 'So that hash values are evenly spread',
        why: 'Even spread (uniformity) is a separate property. A deterministic hash can still be badly skewed.',
      },
      {
        text: 'So that the hash value can be reversed back into the key',
        why: 'Sharding never needs to reverse a hash — it only needs a stable number to pick a server.',
      },
    ],
  },
  {
    question: 'In the modulo scheme, server 1 of 4 crashes and N becomes 3. Which keys are affected?',
    options: [
      {
        text: 'Most keys, including many that were on healthy servers',
        correct: true,
        why: 'The formula changed from % 4 to % 3 for everyone, so keys on servers 0, 2 and 3 also get new homes — a storm of cache misses.',
      },
      {
        text: 'Only the keys that were on server 1',
        why: 'That is what we would like to happen, and it is exactly what consistent hashing achieves. Modulo cannot, because N is part of every key’s formula.',
      },
      {
        text: 'No keys — the remaining servers already hold copies',
        why: 'Plain modulo sharding keeps each key on one server; there are no copies to fall back on.',
      },
    ],
  },
];

export const Module0Hashing: React.FC<Module0HashingProps> = ({ isDarkMode = false, onNavigateModule }) => {
  // Section Step Navigation: 1 = Hash Function, 2 = Geometry, 3 = Modulo Sharding, 4 = Rehash Crisis
  const [activeSection, setActiveSection] = usePersistentState<number>('chapter5:module0:section', 1);

  // Section 1 State
  const [inputKey, setInputKey] = useState<string>('User123');
  const [algo, setAlgo] = useState<'murmur3' | 'fnv1a'>('murmur3');
  const [hashHistory, setHashHistory] = useState<HashKey[]>([
    hashToKey('User123', 'murmur3'),
    hashToKey('Order99', 'murmur3'),
    hashToKey('Session_A', 'murmur3'),
    hashToKey('Cart_404', 'murmur3'),
  ]);

  // Section 2 State
  const [isRingView, setIsRingView] = useState<boolean>(false);

  // Section 3 & 4 State (Traditional Modulo Sharding)
  const [servers, setServers] = useState<PhysicalServer[]>(getDefaultServers());
  const [keys, setKeys] = useState<HashKey[]>(() =>
    assignKeysTraditional(generateSampleKeys(20, 'DataKey'), getDefaultServers())
  );
  const [rehashStats, setRehashStats] = useState<{ total: number; moved: number; pct: number; from: number; to: number } | null>(null);
  const [isAnimatingRehash, setIsAnimatingRehash] = useState(false);

  // Compute current single key hash for Section 1
  const currentComputedHash = hashToKey(inputKey || 'User123', algo);

  const handleComputeHash = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputKey.trim()) return;
    const computed = hashToKey(inputKey.trim(), algo);
    setHashHistory((prev) => [computed, ...prev.filter((k) => k.keyString !== computed.keyString).slice(0, 7)]);
  };

  // Section 4: Scale server count up or down and calculate key movement
  const handleServerChange = (delta: number) => {
    if (isAnimatingRehash) return;
    const newCount = servers.length + delta;
    if (newCount < 1 || newCount > 8) return;

    setIsAnimatingRehash(true);

    // Modulo servers are indexed 0..N-1, so adding appends the next index and removing drops the last.
    const newServers: PhysicalServer[] =
      delta > 0 ? [...servers, makeServer(servers.length)] : servers.slice(0, servers.length - 1);

    const remappedKeys = assignKeysTraditional(keys, newServers);
    const movedCount = remappedKeys.filter((k) => k.isMoved).length;
    const movedPct = Math.round((movedCount / (keys.length || 1)) * 100);

    setServers(newServers);
    setKeys(remappedKeys);
    setRehashStats({
      total: keys.length,
      moved: movedCount,
      pct: movedPct,
      from: servers.length,
      to: newServers.length,
    });

    setTimeout(() => {
      setIsAnimatingRehash(false);
    }, 800);
  };

  const handleAddSampleKeys = (count: number) => {
    const newKeyBatch = generateSampleKeys(count, `Key_${keys.length + 1}`);
    const updatedAllKeys = assignKeysTraditional([...keys, ...newKeyBatch], servers);
    setKeys(updatedAllKeys);
  };

  const sectionTitles = [
    { id: 1, label: 'Section 1', title: 'The Hash Function', icon: Hash },
    { id: 2, label: 'Section 2', title: 'Hash Space Geometry', icon: RotateCw },
    { id: 3, label: 'Section 3', title: 'Traditional Modulo Sharding', icon: Server },
    { id: 4, label: 'Section 4', title: 'The Resharding Crisis', icon: AlertTriangle },
  ];

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      
      {/* Top Section Stepper Navigation Bar (One Section Per Screen) */}
      <div className={`border rounded-2xl p-4 shadow-xl ${
        isDarkMode ? 'bg-[#1c1c1e] border-slate-800' : 'bg-white border-slate-200'
      }`}>
        <div className="flex items-center justify-between gap-2 overflow-x-auto pb-2 sm:pb-0">
          {sectionTitles.map((sec) => {
            const Icon = sec.icon;
            const isActive = activeSection === sec.id;
            return (
              <button
                key={sec.id}
                onClick={() => setActiveSection(sec.id)}
                className={`flex items-center space-x-2.5 px-4 py-2.5 rounded-xl transition-all duration-200 text-xs font-mono font-medium whitespace-nowrap shrink-0 ${
                  isActive
                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/25 border border-blue-400/30'
                    : isDarkMode
                    ? 'bg-slate-950/60 hover:bg-slate-800/80 text-slate-400 hover:text-slate-200 border border-slate-800/80'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-900 border border-slate-200'
                }`}
              >
                <span className={`p-1 rounded-lg ${
                  isActive ? 'bg-white/20 text-white' : isDarkMode ? 'bg-slate-800 text-slate-400' : 'bg-slate-200 text-slate-600'
                }`}>
                  <Icon className="w-3.5 h-3.5" />
                </span>
                <div className="text-left">
                  <span className="block text-xs opacity-75 uppercase">{sec.label}</span>
                  <span className="font-bold font-sans text-xs">{sec.title}</span>
                </div>
              </button>
            );
          })}
        </div>

        {/* Section Progress Bar */}
        <div className={`w-full h-1.5 rounded-full mt-3 overflow-hidden border ${
          isDarkMode ? 'bg-slate-950 border-slate-800/50' : 'bg-slate-100 border-slate-200'
        }`}>
          <motion.div
            className="bg-gradient-to-r from-blue-500 to-cyan-400 h-full rounded-full"
            initial={{ width: '25%' }}
            animate={{ width: `${(activeSection / 4) * 100}%` }}
            transition={{ duration: 0.3 }}
          />
        </div>
      </div>

      <LessonGoal goal={SECTION_GOALS[activeSection]?.goal} why={SECTION_GOALS[activeSection]?.why} />

      {/* SECTION VIEW CONTAINER (Single-Page View Per Section) */}
      <AnimatePresence mode="wait">
        
        {/* SECTION 1 — HASH FUNCTION */}
        {activeSection === 1 && (
          <motion.div
            key="section1"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2 }}
            className={`border rounded-2xl p-6 sm:p-8 space-y-6 shadow-xl min-h-[480px] flex flex-col justify-between ${
              isDarkMode ? 'bg-[#1c1c1e]/90 border-slate-800' : 'bg-white border-slate-200'
            }`}
          >
            <div className="space-y-6">
              <div className={`flex items-center justify-between flex-wrap gap-4 border-b pb-4 ${
                isDarkMode ? 'border-slate-800' : 'border-slate-200'
              }`}>
                <div className="flex items-center space-x-3">
                  <div className="p-2.5 bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded-xl border border-blue-500/20">
                    <Hash className="w-6 h-6" />
                  </div>
                  <div>
                    <span className="text-xs font-mono uppercase text-blue-600 dark:text-blue-400 font-bold tracking-wider">
                      Step 1 of 4
                    </span>
                    <h3 className={`text-xl font-bold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                      The Hash Engine & Integer Mapping
                    </h3>
                  </div>
                </div>

                {/* Algorithm Switcher */}
                <div className={`flex items-center space-x-2 p-1.5 rounded-xl border text-xs ${
                  isDarkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-100 border-slate-200'
                }`}>
                  <span className={`px-2 font-mono ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>Algo:</span>
                  <button
                    onClick={() => setAlgo('murmur3')}
                    className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
                      algo === 'murmur3'
                        ? 'bg-blue-600 text-white font-bold'
                        : isDarkMode
                        ? 'text-slate-400 hover:text-white'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    MurmurHash3
                  </button>
                  <button
                    onClick={() => setAlgo('fnv1a')}
                    className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
                      algo === 'fnv1a'
                        ? 'bg-blue-600 text-white font-bold'
                        : isDarkMode
                        ? 'text-slate-400 hover:text-white'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    FNV-1a
                  </button>
                </div>
              </div>

              {/* Input Form & Realtime Hash Converter */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
                
                <div className="lg:col-span-5 space-y-4">
                  <form onSubmit={handleComputeHash} className="space-y-2">
                    <label className={`block text-xs font-mono ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                      Type Any Input String Key:
                    </label>
                    <div className="flex space-x-2">
                      <input
                        type="text"
                        value={inputKey}
                        onChange={(e) => setInputKey(e.target.value)}
                        placeholder="e.g. User123, Order_99..."
                        className={`flex-1 border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-blue-500 font-mono ${
                          isDarkMode
                            ? 'bg-slate-950 border-slate-700/80 text-white'
                            : 'bg-slate-50 border-slate-300 text-slate-900'
                        }`}
                      />
                      <button
                        type="submit"
                        className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold transition-colors flex items-center space-x-2 shadow-md"
                      >
                        <Cpu className="w-4 h-4" />
                        <span>Hash</span>
                      </button>
                    </div>
                  </form>

                  <div className="space-y-1.5">
                    <span className={`text-xs font-mono ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Quick Test Presets:</span>
                    <div className="flex flex-wrap gap-2">
                      {['User123', 'Order_9921', 'Session_A4', 'Cart_88', 'Payment_X'].map((preset) => (
                        <button
                          key={preset}
                          onClick={() => {
                            setInputKey(preset);
                            const computed = hashToKey(preset, algo);
                            setHashHistory((prev) => [computed, ...prev.filter((k) => k.keyString !== preset).slice(0, 6)]);
                          }}
                          className={`px-2.5 py-1 text-xs rounded-lg border font-mono transition-colors ${
                            isDarkMode
                              ? 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700/60'
                              : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300'
                          }`}
                        >
                          + {preset}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Pipeline Flowchart */}
                <div className={`lg:col-span-7 border rounded-2xl p-5 flex flex-col sm:flex-row items-center justify-between gap-4 ${
                  isDarkMode ? 'bg-slate-950/90 border-slate-800' : 'bg-slate-50 border-slate-200'
                }`}>
                  
                  <div className={`text-center p-3 rounded-xl border w-full sm:w-auto ${
                    isDarkMode ? 'bg-[#1c1c1e] border-slate-800' : 'bg-white border-slate-200'
                  }`}>
                    <span className={`text-xs uppercase font-mono block ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Input String</span>
                    <span className="text-base font-bold text-amber-600 dark:text-amber-400 font-mono truncate max-w-[130px] inline-block">
                      {inputKey || 'User123'}
                    </span>
                  </div>

                  <ArrowRight className="w-5 h-5 text-blue-500 shrink-0 hidden sm:block animate-pulse" />

                  <div className="text-center p-3 bg-blue-50 dark:bg-blue-950/60 rounded-xl border border-blue-200 dark:border-blue-800/60 w-full sm:w-auto">
                    <span className="text-xs uppercase font-mono text-blue-600 dark:text-blue-300 block">32-Bit Hash Engine</span>
                    <span className="text-xs font-bold text-blue-700 dark:text-blue-400 font-mono">{algo.toUpperCase()}</span>
                  </div>

                  <ArrowRight className="w-5 h-5 text-blue-500 shrink-0 hidden sm:block animate-pulse" />

                  <div className={`text-center p-3 rounded-xl border w-full sm:w-auto ${
                    isDarkMode ? 'bg-[#1c1c1e] border-slate-800' : 'bg-white border-slate-200'
                  }`}>
                    <span className={`text-xs uppercase font-mono block ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>32-bit Hash Value</span>
                    <div className="space-y-0.5">
                      <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400 font-mono block">
                        {currentComputedHash.hashHex}
                      </span>
                      <span className={`text-xs font-mono block ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                        {currentComputedHash.hashValue.toLocaleString()} ({currentComputedHash.angle.toFixed(1)}°)
                      </span>
                    </div>
                  </div>

                </div>

              </div>

              {/* Hash Log History */}
              <div className="space-y-2">
                <h4 className={`text-xs font-mono uppercase tracking-wider ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                  Deterministic Mappings Log:
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                  {hashHistory.map((hk) => (
                    <div
                      key={hk.id}
                      className={`p-3 rounded-xl border font-mono text-xs space-y-1 ${
                        isDarkMode ? 'bg-slate-950/70 border-slate-800' : 'bg-slate-50 border-slate-200'
                      }`}
                    >
                      <div className="flex justify-between">
                        <span className="font-bold text-amber-600 dark:text-amber-300">{hk.keyString}</span>
                        <span className={isDarkMode ? 'text-slate-500' : 'text-slate-400'}>{hk.angle.toFixed(0)}°</span>
                      </div>
                      <div className="text-emerald-600 dark:text-emerald-400 text-[11px] font-semibold">{hk.hashHex}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Bottom Footer Action Controls */}
            <div className={`flex items-center justify-between border-t pt-4 mt-6 ${
              isDarkMode ? 'border-slate-800' : 'border-slate-200'
            }`}>
              <span className={`text-xs font-mono ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Step 1 of 4</span>
              <button
                onClick={() => setActiveSection(2)}
                className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition-all shadow-md flex items-center space-x-2"
              >
                <span>Next: Hash Space Geometry</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        )}

        {/* SECTION 2 — HASH SPACE GEOMETRY */}
        {activeSection === 2 && (
          <motion.div
            key="section2"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2 }}
            className={`border rounded-2xl p-6 sm:p-8 space-y-6 shadow-xl min-h-[480px] flex flex-col justify-between ${
              isDarkMode ? 'bg-[#1c1c1e]/90 border-slate-800' : 'bg-white border-slate-200'
            }`}
          >
            <div className="space-y-6">
              <div className={`flex items-center justify-between flex-wrap gap-4 border-b pb-4 ${
                isDarkMode ? 'border-slate-800' : 'border-slate-200'
              }`}>
                <div className="flex items-center space-x-3">
                  <div className="p-2.5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-xl border border-emerald-500/20">
                    <RotateCw className="w-6 h-6" />
                  </div>
                  <div>
                    <span className="text-xs font-mono uppercase text-emerald-600 dark:text-emerald-400 font-bold tracking-wider">
                      Step 2 of 4
                    </span>
                    <h3 className={`text-xl font-bold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                      Hash Space Geometry — Line to Ring
                    </h3>
                  </div>
                </div>

                <button
                  onClick={() => setIsRingView(!isRingView)}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-md flex items-center space-x-2"
                >
                  <RotateCw className={`w-4 h-4 transition-transform duration-500 ${isRingView ? 'rotate-180' : ''}`} />
                  <span>{isRingView ? 'Flatten to Linear Line' : 'Bend Line into Circular Ring'}</span>
                </button>
              </div>

              {/* Visualizer Display Box */}
              <div className={`border rounded-2xl p-6 flex flex-col items-center justify-center min-h-[300px] ${
                isDarkMode ? 'bg-slate-950/90 border-slate-800' : 'bg-slate-50 border-slate-200'
              }`}>
                <AnimatePresence mode="wait">
                  {!isRingView ? (
                    <motion.div
                      key="linear"
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      className="w-full space-y-8"
                    >
                      <div className={`flex justify-between text-xs font-mono px-2 ${
                        isDarkMode ? 'text-slate-400' : 'text-slate-600'
                      }`}>
                        <span>0 (Start)</span>
                        <span className={isDarkMode ? "text-slate-500" : "text-slate-400"}>2^31 (Midpoint)</span>
                        <span>2^32 - 1 (Max End)</span>
                      </div>

                      {/* Line Axis */}
                      <div className={`relative h-4 rounded-full w-full flex items-center border ${
                        isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-slate-200 border-slate-300'
                      }`}>
                        {hashHistory.map((hk) => {
                          const pct = (hk.hashValue / 4294967295) * 100;
                          return (
                            <div
                              key={hk.id}
                              style={{ left: `${pct}%` }}
                              className="absolute transform -translate-x-1/2 flex flex-col items-center group cursor-pointer"
                            >
                              <div className="w-3.5 h-7 bg-blue-500 dark:bg-cyan-400 rounded-full border border-white shadow-lg group-hover:scale-125 transition-transform" />
                              <span className={`text-xs font-mono font-bold mt-1 px-1.5 py-0.5 rounded border whitespace-nowrap ${
                                isDarkMode ? 'bg-[#1c1c1e]/90 text-cyan-300 border-slate-800' : 'bg-white text-blue-700 border-slate-300 shadow-sm'
                              }`}>
                                {hk.keyString}
                              </span>
                            </div>
                          );
                        })}
                      </div>

                      <p className={`text-center text-sm max-w-lg mx-auto leading-relaxed ${
                        isDarkMode ? 'text-slate-300' : 'text-slate-600'
                      }`}>
                        This line is the{' '}
                        <Term term="hash space">
                          Every value the hash function can output. For a 32-bit hash that is 0 to 2^32 − 1 (about 4.3 billion values).
                        </Term>
                        : 0 on the left, 2^32 − 1 on the right. Bend it so both ends meet at the top (12 o'clock) and you get a{' '}
                        <Term term="hash ring">
                          The hash space with its two ends joined. Moving clockwise past 2^32 − 1 wraps back to 0, so every point has a "next" point.
                        </Term>
                        . Press the button above to bend it.
                      </p>
                    </motion.div>
                  ) : (
                    <motion.div
                      key="ring"
                      initial={{ opacity: 0, rotate: -90 }}
                      animate={{ opacity: 1, rotate: 0 }}
                      exit={{ opacity: 0, rotate: 90 }}
                      transition={{ duration: 0.5, type: 'spring' }}
                      className="w-full flex flex-col items-center gap-3"
                    >
                      <HashRingCanvas
                        servers={servers}
                        keys={hashHistory}
                        size={320}
                        interactive={false}
                        isDarkMode={isDarkMode}
                      />
                      <p className={`text-center text-sm max-w-lg leading-relaxed ${isDarkMode ? 'text-slate-300' : 'text-slate-600'}`}>
                        Same keys, same hash values — only the shape changed. 0 and 2^32 − 1 now sit side by side at the top. The
                        coloured dots are servers hashed onto the same ring; Part 2 uses them.
                      </p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>

            {/* Bottom Footer Action Controls */}
            <div className={`flex items-center justify-between border-t pt-4 mt-6 ${
              isDarkMode ? 'border-slate-800' : 'border-slate-200'
            }`}>
              <button
                onClick={() => setActiveSection(1)}
                className={`px-4 py-2 text-xs font-bold rounded-xl transition-colors flex items-center space-x-1 ${
                  isDarkMode ? 'bg-slate-800 hover:bg-slate-700 text-slate-300' : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                }`}
              >
                <ChevronLeft className="w-4 h-4" />
                <span>Previous</span>
              </button>
              <span className={`text-xs font-mono ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Step 2 of 4</span>
              <button
                onClick={() => setActiveSection(3)}
                className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition-all shadow-md flex items-center space-x-2"
              >
                <span>Next: Modulo Sharding</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        )}

        {/* SECTION 3 — TRADITIONAL MODULO SHARDING */}
        {activeSection === 3 && (
          <motion.div
            key="section3"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2 }}
            className={`border rounded-2xl p-6 sm:p-8 space-y-6 shadow-xl min-h-[480px] flex flex-col justify-between ${
              isDarkMode ? 'bg-[#1c1c1e]/90 border-slate-800' : 'bg-white border-slate-200'
            }`}
          >
            <div className="space-y-6">
              <div className={`flex items-center justify-between flex-wrap gap-4 border-b pb-4 ${
                isDarkMode ? 'border-slate-800' : 'border-slate-200'
              }`}>
                <div className="flex items-center space-x-3">
                  <div className="p-2.5 bg-amber-500/10 text-amber-600 dark:text-amber-400 rounded-xl border border-amber-500/20">
                    <Server className="w-6 h-6" />
                  </div>
                  <div>
                    <span className="text-xs font-mono uppercase text-amber-600 dark:text-amber-400 font-bold tracking-wider">
                      Step 3 of 4
                    </span>
                    <h3 className={`text-xl font-bold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                      Traditional Modulo Sharding
                    </h3>
                  </div>
                </div>

                <div className="flex items-center space-x-3">
                  <span className={`text-xs font-mono ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                    Formula: <code className="text-amber-600 dark:text-amber-400 font-bold">hash(key) % {servers.length}</code>
                  </span>
                  <button
                    onClick={() => handleAddSampleKeys(5)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-xl border transition-colors ${
                      isDarkMode
                        ? 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
                        : 'bg-slate-100 hover:bg-slate-200 text-slate-800 border-slate-300'
                    }`}
                  >
                    + 5 Keys
                  </button>
                </div>
              </div>

              {keys[0] && (
                <div className={`p-3 rounded-xl border text-sm leading-relaxed ${
                  isDarkMode ? 'bg-slate-950 border-slate-800 text-slate-300' : 'bg-slate-50 border-slate-200 text-slate-700'
                }`}>
                  <strong className={isDarkMode ? 'text-white' : 'text-slate-900'}>Worked example: </strong>
                  <span className="font-mono">{keys[0].keyString}</span> hashes to{' '}
                  <span className="font-mono">{keys[0].hashValue.toLocaleString()}</span>, and{' '}
                  <span className="font-mono">
                    {keys[0].hashValue.toLocaleString()} % {servers.length} = {keys[0].hashValue % servers.length}
                  </span>
                  , so it lives on <strong>Server {keys[0].hashValue % servers.length}</strong>. Every key below was placed the same way.
                </div>
              )}

              {/* Server Buckets Display */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                {servers.map((s) => {
                  const serverKeys = keys.filter((k) => k.assignedServerId === s.id);
                  return (
                    <div
                      key={s.id}
                      className={`border rounded-2xl p-4 space-y-3 relative overflow-hidden ${
                        isDarkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'
                      }`}
                    >
                      <div className={`flex items-center justify-between border-b pb-2 ${
                        isDarkMode ? 'border-slate-800/80' : 'border-slate-200'
                      }`}>
                        <div className="flex items-center space-x-2">
                          <span className="w-3 h-3 rounded-full" style={{ backgroundColor: s.color }} />
                          <span className={`font-bold text-sm font-mono ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                            {s.name}
                          </span>
                        </div>
                        <span className={`text-xs font-mono px-2 py-0.5 rounded border ${
                          isDarkMode ? 'text-slate-400 bg-slate-900 border-slate-800' : 'text-slate-600 bg-white border-slate-200'
                        }`}>
                          {serverKeys.length} keys
                        </span>
                      </div>

                      <div className="min-h-[120px] max-h-[180px] overflow-y-auto space-y-1.5 pr-1">
                        {serverKeys.length === 0 ? (
                          <div className={`text-xs italic text-center py-8 ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                            Empty Bucket
                          </div>
                        ) : (
                          serverKeys.map((k) => (
                            <div
                              key={k.id}
                              className={`p-2 rounded-lg border text-xs font-mono flex items-center justify-between ${
                                isDarkMode
                                  ? 'bg-[#1c1c1e] border-slate-800 text-slate-300'
                                  : 'bg-white border-slate-200 text-slate-800 shadow-sm'
                              }`}
                            >
                              <span className="truncate">{k.keyString}</span>
                              <span className={`text-xs ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                                {k.hashHex.slice(0, 6)}
                              </span>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Bottom Footer Action Controls */}
            <div className={`flex items-center justify-between border-t pt-4 mt-6 ${
              isDarkMode ? 'border-slate-800' : 'border-slate-200'
            }`}>
              <button
                onClick={() => setActiveSection(2)}
                className={`px-4 py-2 text-xs font-bold rounded-xl transition-colors flex items-center space-x-1 ${
                  isDarkMode ? 'bg-slate-800 hover:bg-slate-700 text-slate-300' : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                }`}
              >
                <ChevronLeft className="w-4 h-4" />
                <span>Previous</span>
              </button>
              <span className={`text-xs font-mono ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Step 3 of 4</span>
              <button
                onClick={() => setActiveSection(4)}
                className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition-all shadow-md flex items-center space-x-2"
              >
                <span>Next: Resharding Crisis</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        )}

        {/* SECTION 4 — THE RESHARDING CRISIS */}
        {activeSection === 4 && (
          <motion.div
            key="section4"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2 }}
            className={`border rounded-2xl p-6 sm:p-8 space-y-6 shadow-xl min-h-[480px] flex flex-col justify-between ${
              isDarkMode ? 'bg-[#1c1c1e]/90 border-slate-800' : 'bg-white border-slate-200'
            }`}
          >
            <div className="space-y-6">
              <div className={`flex items-center justify-between flex-wrap gap-4 border-b pb-4 ${
                isDarkMode ? 'border-slate-800' : 'border-slate-200'
              }`}>
                <div className="flex items-center space-x-3">
                  <div className="p-2.5 bg-red-500/10 text-red-600 dark:text-red-400 rounded-xl border border-red-500/20">
                    <AlertTriangle className="w-6 h-6" />
                  </div>
                  <div>
                    <span className="text-xs font-mono uppercase text-red-600 dark:text-red-400 font-bold tracking-wider">
                      Step 4 of 4
                    </span>
                    <h3 className={`text-xl font-bold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                      The Resharding Crisis (Scale Failure)
                    </h3>
                  </div>
                </div>

                {/* Scaling Controls */}
                <div className="flex items-center space-x-3">
                  <span className={`text-xs font-mono ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>Cluster Size (N):</span>
                  <div className={`flex items-center space-x-1.5 p-1 rounded-xl border ${
                    isDarkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-100 border-slate-200'
                  }`}>
                    <button
                      onClick={() => handleServerChange(-1)}
                      disabled={servers.length <= 1 || isAnimatingRehash}
                      className={`p-1.5 rounded-lg transition-colors disabled:opacity-40 ${
                        isDarkMode ? 'bg-slate-800 hover:bg-slate-700 text-slate-200' : 'bg-white hover:bg-slate-200 text-slate-800 shadow-sm'
                      }`}
                      title="Remove Server (N - 1)"
                    >
                      <Minus className="w-4 h-4" />
                    </button>
                    <span className="px-3 text-sm font-bold font-mono text-amber-600 dark:text-amber-400">{servers.length}</span>
                    <button
                      onClick={() => handleServerChange(1)}
                      disabled={servers.length >= 8 || isAnimatingRehash}
                      className={`p-1.5 rounded-lg transition-colors disabled:opacity-40 ${
                        isDarkMode ? 'bg-slate-800 hover:bg-slate-700 text-slate-200' : 'bg-white hover:bg-slate-200 text-slate-800 shadow-sm'
                      }`}
                      title="Add Server (N + 1)"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Reshard Impact Banner */}
              {rehashStats ? (
                <motion.div
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="p-4 bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-500/40 rounded-xl flex items-center justify-between flex-wrap gap-4 text-slate-800 dark:text-slate-200 shadow-lg"
                >
                  <div className="flex items-center space-x-3">
                    <AlertTriangle className="w-6 h-6 text-red-600 dark:text-red-400 shrink-0 animate-bounce" />
                    <div>
                      <h4 className="text-sm font-bold text-red-700 dark:text-red-300">
                        N went from {rehashStats.from} to {rehashStats.to}: {rehashStats.pct}% of keys changed server
                      </h4>
                      <p className={`text-sm ${isDarkMode ? 'text-slate-300' : 'text-slate-600'}`}>
                        Keys highlighted red below moved. Ideally only about{' '}
                        {Math.round(100 / Math.max(rehashStats.from, rehashStats.to))}% (one server’s share) would move — modulo moved
                        far more because <code className="font-mono">% N</code> changed for every key.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center space-x-6 font-mono text-right">
                    <div>
                      <span className={`text-xs uppercase block ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Keys moved</span>
                      <span className="text-base font-bold text-red-600 dark:text-red-400">
                        {rehashStats.moved} / {rehashStats.total}
                      </span>
                    </div>
                    <div>
                      <span className={`text-xs uppercase block ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Ideal</span>
                      <span className="text-base font-bold text-emerald-600 dark:text-emerald-400">
                        ~{Math.round(rehashStats.total / Math.max(rehashStats.from, rehashStats.to))}
                      </span>
                    </div>
                  </div>
                </motion.div>
              ) : (
                <div className={`p-4 border rounded-xl text-xs font-mono ${
                  isDarkMode ? 'bg-slate-950 border-slate-800 text-slate-400' : 'bg-slate-50 border-slate-200 text-slate-600'
                }`}>
                  Click <strong className={isDarkMode ? "text-white" : "text-slate-900"}>+ Add Server</strong> or <strong className={isDarkMode ? "text-white" : "text-slate-900"}>- Remove Server</strong> above to test how traditional modulo sharding forces massive key relocations.
                </div>
              )}

              {/* Server Buckets with Highlighted Moved Keys */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                {servers.map((s) => {
                  const serverKeys = keys.filter((k) => k.assignedServerId === s.id);
                  return (
                    <div
                      key={s.id}
                      className={`border rounded-2xl p-4 space-y-3 relative overflow-hidden ${
                        isDarkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'
                      }`}
                    >
                      <div className={`flex items-center justify-between border-b pb-2 ${
                        isDarkMode ? 'border-slate-800/80' : 'border-slate-200'
                      }`}>
                        <div className="flex items-center space-x-2">
                          <span className="w-3 h-3 rounded-full" style={{ backgroundColor: s.color }} />
                          <span className={`font-bold text-sm font-mono ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                            {s.name}
                          </span>
                        </div>
                        <span className={`text-xs font-mono px-2 py-0.5 rounded border ${
                          isDarkMode ? 'text-slate-400 bg-slate-900 border-slate-800' : 'text-slate-600 bg-white border-slate-200'
                        }`}>
                          {serverKeys.length} keys
                        </span>
                      </div>

                      <div className="min-h-[120px] max-h-[160px] overflow-y-auto space-y-1.5 pr-1">
                        {serverKeys.map((k) => (
                          <div
                            key={k.id}
                            className={`p-2 rounded-lg border text-xs font-mono flex items-center justify-between transition-colors ${
                              k.isMoved
                                ? 'bg-red-500/20 border-red-500/60 text-red-700 dark:text-red-200 font-bold animate-pulse'
                                : isDarkMode
                                ? 'bg-[#1c1c1e] border-slate-800 text-slate-300'
                                : 'bg-white border-slate-200 text-slate-800 shadow-sm'
                            }`}
                          >
                            <span className="truncate">{k.keyString}</span>
                            <span className={`text-xs ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                              {k.hashHex.slice(0, 6)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>

              <Takeaway>
                With <code className="font-mono">hash(key) % N</code>, N is part of every key’s address, so changing the server count by one
                re-homes roughly N/(N+1) of all keys (about 80% going from 4 to 5 servers), not just the new server’s fair share. Consistent
                hashing removes N from the formula so only about k/n keys move.
              </Takeaway>

              <Quiz persistKey="chapter5:quiz:module0" questions={QUIZ} />
            </div>

            {/* Bottom Footer Action Controls */}
            <div className={`flex items-center justify-between border-t pt-4 mt-6 ${
              isDarkMode ? 'border-slate-800' : 'border-slate-200'
            }`}>
              <button
                onClick={() => setActiveSection(3)}
                className={`px-4 py-2 text-xs font-bold rounded-xl transition-colors flex items-center space-x-1 ${
                  isDarkMode ? 'bg-slate-800 hover:bg-slate-700 text-slate-300' : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                }`}
              >
                <ChevronLeft className="w-4 h-4" />
                <span>Previous</span>
              </button>
              <span className={`text-xs font-mono ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Step 4 of 4</span>
              <button
                onClick={() => {
                  if (onNavigateModule) {
                    onNavigateModule('module1');
                  }
                }}
                className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition-all shadow-md flex items-center space-x-2"
              >
                <span>Next part: The hash ring</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        )}

      </AnimatePresence>

    </div>
  );
};

