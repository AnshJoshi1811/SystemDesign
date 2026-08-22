import React, { useState } from 'react';
import {
  Calculator,
  Database,
  Server,
  HardDrive,
  Cpu,
  Clock,
  Zap,
  Activity,
  CheckCircle2,
  AlertTriangle,
  Lightbulb,
  Sparkles,
  ArrowRight,
  TrendingUp,
  BarChart2,
  Sliders,
  RefreshCw,
  Globe,
  Wifi,
  ShieldAlert,
  Layers,
  HelpCircle,
  FileText,
  Copy,
  ChevronRight,
  Check,
  User,
  PieChart
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface Chapter2EstimationProps {
  isDarkMode?: boolean;
}

type SectionTab =
  | 'intro'
  | 'why'
  | 'power2'
  | 'latency'
  | 'availability'
  | 'twitter'
  | 'tips'
  | 'playground';

export const Chapter2Estimation: React.FC<Chapter2EstimationProps> = ({ isDarkMode = false }) => {
  const [activeTab, setActiveTab] = useState<SectionTab>('intro');

  // --- POWER OF TWO CONVERTER STATE ---
  const [powerExponent, setPowerExponent] = useState<number>(30); // 2^30 = 1 GB

  // --- AVAILABILITY CALCULATOR STATE ---
  const [slaNines, setSlaNines] = useState<number>(99.99); // 99.99%

  // --- ESTIMATION PLAYGROUND STATE ---
  const [preset, setPreset] = useState<'twitter' | 'youtube' | 'whatsapp' | 'tinyurl' | 'custom'>('twitter');
  const [dau, setDau] = useState<number>(300); // Millions
  const [writesPerUser, setWritesPerUser] = useState<number>(2); // Actions per user per day
  const [readRatio, setReadRatio] = useState<number>(100); // 1:100 write:read
  const [textSizeBytes, setTextSizeBytes] = useState<number>(300); // Bytes per action text/meta
  const [mediaPercent, setMediaPercent] = useState<number>(10); // % containing media
  const [mediaSizeBytes, setMediaSizeBytes] = useState<number>(200); // KB per media file
  const [retentionYears, setRetentionYears] = useState<number>(5); // Years of storage
  const [cacheRatio, setCacheRatio] = useState<number>(20); // Pareto 80/20 rule: cache 20% of reads

  // Apply preset values
  const handlePresetSelect = (p: 'twitter' | 'youtube' | 'whatsapp' | 'tinyurl' | 'custom') => {
    setPreset(p);
    if (p === 'twitter') {
      setDau(300);
      setWritesPerUser(2);
      setReadRatio(100);
      setTextSizeBytes(300);
      setMediaPercent(10);
      setMediaSizeBytes(200);
      setRetentionYears(5);
      setCacheRatio(20);
    } else if (p === 'youtube') {
      setDau(500);
      setWritesPerUser(0.1); // 1 video uploaded per 10 days avg
      setReadRatio(500); // 1:500 video upload vs views
      setTextSizeBytes(1000); // Title, description, tags metadata
      setMediaPercent(100); // 100% media
      setMediaSizeBytes(50000); // 50 MB average video file
      setRetentionYears(10);
      setCacheRatio(10);
    } else if (p === 'whatsapp') {
      setDau(1000); // 1 Billion DAU
      setWritesPerUser(40); // 40 messages per day
      setReadRatio(1); // 1:1 messaging write vs read
      setTextSizeBytes(100); // 100 bytes text message
      setMediaPercent(15); // 15% photos/audio
      setMediaSizeBytes(100); // 100 KB avg image/audio
      setRetentionYears(3);
      setCacheRatio(5);
    } else if (p === 'tinyurl') {
      setDau(100); // 100M daily active requests
      setWritesPerUser(1); // 1 URL created per day
      setReadRatio(100); // 1:100 write vs redirect
      setTextSizeBytes(500); // Long URL + short code + metadata
      setMediaPercent(0); // 0% media
      setMediaSizeBytes(0);
      setRetentionYears(10);
      setCacheRatio(20);
    }
  };

  // --- CALCULATION LOGIC FOR PLAYGROUND ---
  const totalDailyWrites = (dau * 1_000_000 * writesPerUser);
  const totalDailyReads = totalDailyWrites * readRatio;
  const avgWriteQps = totalDailyWrites / 86400;
  const peakWriteQps = avgWriteQps * 2;
  const avgReadQps = totalDailyReads / 86400;
  const peakReadQps = avgReadQps * 2;

  // Storage calculations
  const textStorageBytesPerDay = totalDailyWrites * textSizeBytes;
  const mediaStorageBytesPerDay = totalDailyWrites * (mediaPercent / 100) * (mediaSizeBytes * 1024);
  const totalDailyStorageBytes = textStorageBytesPerDay + mediaStorageBytesPerDay;
  const totalStorageGBPerDay = totalDailyStorageBytes / (1024 * 1024 * 1024);
  const totalStorageTBPerDay = totalStorageGBPerDay / 1024;
  const multiYearStorageTB = totalStorageTBPerDay * 365 * retentionYears;
  const multiYearStoragePB = multiYearStorageTB / 1024;

  // Bandwidth
  const ingressBytesPerSec = totalDailyStorageBytes / 86400;
  const ingressMBps = ingressBytesPerSec / (1024 * 1024);
  const egressMBps = ingressMBps * readRatio;
  const egressGBps = egressMBps / 1024;

  // Cache RAM Estimation (Caching X% of daily reads)
  const cachedReadsCount = totalDailyReads * (cacheRatio / 100);
  const avgPayloadSizeBytes = textSizeBytes + ((mediaPercent / 100) * (mediaSizeBytes * 1024));
  const memoryCacheNeededGB = (cachedReadsCount * avgPayloadSizeBytes) / (1024 * 1024 * 1024);

  // App Server instances needed (assuming 1 server can handle ~1,000 QPS)
  const appServersNeeded = Math.max(1, Math.ceil(peakReadQps / 1000));

  // SLA Downtime calculation
  const uptimeFraction = slaNines / 100;
  const downtimeFraction = 1 - uptimeFraction;
  const downtimePerYearSec = downtimeFraction * 365.25 * 86400;
  const formatTimeSpan = (seconds: number) => {
    if (seconds < 60) return `${seconds.toFixed(1)} seconds`;
    if (seconds < 3600) return `${(seconds / 60).toFixed(1)} minutes`;
    if (seconds < 86400) return `${(seconds / 3600).toFixed(1)} hours`;
    return `${(seconds / 86400).toFixed(1)} days`;
  };

  return (
    <div className="space-y-6">
      
      {/* CHAPTER HEADER BANNER */}
      <div className={`p-6 sm:p-8 rounded-3xl border shadow-xl relative overflow-hidden transition-all ${
        isDarkMode
          ? 'bg-[#161616] border-white/[0.08] text-white'
          : 'bg-white border-slate-200 text-slate-900'
      }`}>
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2 max-w-3xl">
            <div className="flex items-center space-x-2">
              <span className="px-3 py-1 bg-amber-500 text-slate-950 font-mono text-xs font-black rounded-full uppercase tracking-wider">
                CHAPTER 2
              </span>
              <span className={`text-xs font-mono font-semibold ${isDarkMode ? 'text-amber-400' : 'text-amber-700'}`}>
                System Architecture Capacity &amp; Scalability
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold tracking-tight">
              Back-of-the-Envelope Estimation
            </h1>
            <p className={`text-xs sm:text-sm leading-relaxed ${isDarkMode ? 'text-slate-300' : 'text-slate-600'}`}>
              Learn how senior engineers make fast, accurate capacity estimates for QPS, memory, storage, bandwidth, and server counts. Master binary units, latency numbers, and SLA availability.
            </p>
          </div>

          <button
            onClick={() => setActiveTab('playground')}
            className="shrink-0 px-5 py-3 bg-gradient-to-r from-amber-500 via-orange-500 to-indigo-600 hover:opacity-95 text-white font-bold rounded-2xl shadow-lg flex items-center space-x-2 text-xs transition-transform active:scale-95"
          >
            <Calculator className="w-4 h-4" />
            <span>Open Estimation Playground</span>
          </button>
        </div>
      </div>

      {/* SUB-NAVIGATION TABS */}
      <div className={`flex items-center space-x-1 p-1.5 rounded-2xl border overflow-x-auto no-scrollbar text-xs font-semibold ${
        isDarkMode ? 'bg-[#1c1c1e]/80 border-slate-800' : 'bg-white border-slate-200 shadow-xs'
      }`}>
        {[
          { id: 'intro', label: '1. What & Why', icon: Lightbulb },
          { id: 'why', label: '2. Why Estimation Matters', icon: TrendingUp },
          { id: 'power2', label: '3. Power of Two', icon: Cpu },
          { id: 'latency', label: '4. Latency Spectrum', icon: Clock },
          { id: 'availability', label: '5. SLA Availability', icon: ShieldAlert },
          { id: 'twitter', label: '6. Estimating Twitter', icon: FileText },
          { id: 'tips', label: '7. Interview Tips', icon: CheckCircle2 },
          { id: 'playground', label: '🧮 Interactive Playground', icon: Calculator, highlight: true },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as SectionTab)}
              className={`flex items-center space-x-2 px-3.5 py-2 rounded-xl whitespace-nowrap transition-all ${
                isActive
                  ? tab.highlight
                    ? 'bg-gradient-to-r from-amber-500 to-orange-600 text-white font-bold shadow-md'
                    : 'bg-amber-500 text-slate-950 font-bold shadow-xs'
                  : tab.highlight
                  ? 'text-amber-600 dark:text-amber-400 font-bold hover:bg-amber-500/10'
                  : isDarkMode
                  ? 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* TAB CONTENT AREAS */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.2 }}
        >
          {/* ========================================================= */}
          {/* TAB 1: INTRODUCTION */}
          {/* ========================================================= */}
          {activeTab === 'intro' && (
            <div className="space-y-6">
              <div className={`p-6 rounded-3xl border space-y-4 ${
                isDarkMode ? 'bg-[#1c1c1e] border-slate-800' : 'bg-white border-slate-200'
              }`}>
                <div className="flex items-center space-x-3">
                  <div className="p-3 bg-amber-500/10 text-amber-500 rounded-2xl border border-amber-500/20">
                    <Lightbulb className="w-6 h-6" />
                  </div>
                  <div>
                    <h2 className={`text-lg font-bold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                      What is Back-of-the-Envelope Estimation?
                    </h2>
                    <p className="text-xs text-slate-500 font-mono">
                      Quick approximations to validate architecture feasibility
                    </p>
                  </div>
                </div>

                <p className={`text-xs sm:text-sm leading-relaxed ${isDarkMode ? 'text-slate-300' : 'text-slate-600'}`}>
                  In real-world engineering and system design interviews, nobody knows the exact traffic or storage numbers in advance. Instead, engineers use <strong>back-of-the-envelope estimation</strong>—a method of making quick, order-of-magnitude calculations to test whether a design is scalable, cost-effective, and technically viable.
                </p>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
                  <div className={`p-4 rounded-2xl border space-y-2 ${
                    isDarkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'
                  }`}>
                    <h3 className="font-bold text-xs text-amber-500 font-mono uppercase">1. Reasoning Over Math Precision</h3>
                    <p className={`text-xs leading-relaxed ${isDarkMode ? 'text-slate-300' : 'text-slate-600'}`}>
                      Interviewers evaluate your thought process. Rounding 86,400 seconds in a day to 100,000 is encouraged because it speeds up calculations without losing architectural context.
                    </p>
                  </div>

                  <div className={`p-4 rounded-2xl border space-y-2 ${
                    isDarkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'
                  }`}>
                    <h3 className="font-bold text-xs text-indigo-500 font-mono uppercase">2. Order of Magnitude</h3>
                    <p className={`text-xs leading-relaxed ${isDarkMode ? 'text-slate-300' : 'text-slate-600'}`}>
                      Knowing whether a system requires 10 servers or 1,000 servers (or 10 Terabytes vs 10 Petabytes) dictates database choice, caching strategy, and network design.
                    </p>
                  </div>

                  <div className={`p-4 rounded-2xl border space-y-2 ${
                    isDarkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'
                  }`}>
                    <h3 className="font-bold text-xs text-emerald-500 font-mono uppercase">3. Preventing Costly Errors</h3>
                    <p className={`text-xs leading-relaxed ${isDarkMode ? 'text-slate-300' : 'text-slate-600'}`}>
                      Estimating before building prevents adopting an impossible architecture—like attempting to store 50 Petabytes on a single relational SQL node.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ========================================================= */}
          {/* TAB 2: WHY ESTIMATION MATTERS */}
          {/* ========================================================= */}
          {activeTab === 'why' && (
            <div className="space-y-6">
              <div className={`p-6 rounded-3xl border space-y-4 ${
                isDarkMode ? 'bg-[#1c1c1e] border-slate-800' : 'bg-white border-slate-200'
              }`}>
                <h3 className={`text-base font-bold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                  Why Estimation is a Crucial Engineering Skill
                </h3>
                <p className={`text-xs leading-relaxed ${isDarkMode ? 'text-slate-300' : 'text-slate-600'}`}>
                  Before writing a line of code or deploying a single cloud instance, estimations answer core architectural questions:
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                  {[
                    { title: '⚡ Can this DB handle our QPS?', desc: 'Single MySQL master node maxes out at ~1,000-3,000 QPS for heavy writes. If your estimate shows 50,000 QPS, you immediately know you need sharding or NoSQL.', icon: Database, color: 'text-blue-500' },
                    { title: '💾 How much RAM for caching?', desc: 'Applying the Pareto 80/20 rule (caching top 20% of requests) lets you calculate exact Redis memory size and cluster sizing.', icon: Cpu, color: 'text-amber-500' },
                    { title: '📦 Disk Storage Sizing', desc: 'Will we need 5 Terabytes or 50 Petabytes over 5 years? Dictates whether standard cloud disks (EBS) or distributed object stores (S3) are required.', icon: HardDrive, color: 'text-indigo-500' },
                    { title: '🌐 Network Bandwidth Limits', desc: 'High video or image egress bandwidth dictates whether a CDN (Cloudflare/CloudFront) is required to prevent data center pipe exhaustion.', icon: Wifi, color: 'text-emerald-500' },
                  ].map((item, idx) => {
                    const Icon = item.icon;
                    return (
                      <div key={idx} className={`p-4 rounded-2xl border space-y-2 ${
                        isDarkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'
                      }`}>
                        <div className="flex items-center space-x-2">
                          <Icon className={`w-5 h-5 ${item.color}`} />
                          <h4 className={`font-bold text-xs ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>{item.title}</h4>
                        </div>
                        <p className="text-xs text-slate-500 leading-relaxed">{item.desc}</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* ========================================================= */}
          {/* TAB 3: POWER OF TWO */}
          {/* ========================================================= */}
          {activeTab === 'power2' && (
            <div className="space-y-6">
              <div className={`p-6 rounded-3xl border space-y-5 ${
                isDarkMode ? 'bg-[#1c1c1e] border-slate-800' : 'bg-white border-slate-200'
              }`}>
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className={`text-base font-bold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                      Powers of Two: Binary Base Units
                    </h3>
                    <p className="text-xs text-slate-500 font-mono">
                      Computers calculate in base-2 (binary). Understanding data unit scales is fundamental.
                    </p>
                  </div>
                  <span className="px-3 py-1 bg-blue-500/10 text-blue-500 rounded-full text-xs font-mono font-bold border border-blue-500/20">
                    1 Byte = 8 Bits
                  </span>
                </div>

                {/* Units Table */}
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs font-mono">
                    <thead>
                      <tr className={`border-b ${isDarkMode ? 'border-slate-800 text-amber-400' : 'border-slate-200 text-amber-700'}`}>
                        <th className="py-2.5 px-3">Power</th>
                        <th className="py-2.5 px-3">Exact Value</th>
                        <th className="py-2.5 px-3">Approx Value</th>
                        <th className="py-2.5 px-3">Name</th>
                        <th className="py-2.5 px-3">Real-World Context</th>
                      </tr>
                    </thead>
                    <tbody className={`divide-y ${isDarkMode ? 'divide-slate-800/60 text-slate-300' : 'divide-slate-100 text-slate-700'}`}>
                      <tr>
                        <td className="py-2 px-3 font-bold text-blue-500">2^10</td>
                        <td className="py-2 px-3">1,024 Bytes</td>
                        <td className="py-2 px-3 text-amber-500">1 Thousand Bytes</td>
                        <td className="py-2 px-3 font-bold">1 KB (Kilobyte)</td>
                        <td className="py-2 px-3 text-slate-500">Small text string / JSON payload</td>
                      </tr>
                      <tr>
                        <td className="py-2 px-3 font-bold text-blue-500">2^20</td>
                        <td className="py-2 px-3">1,048,576 Bytes</td>
                        <td className="py-2 px-3 text-amber-500">1 Million Bytes</td>
                        <td className="py-2 px-3 font-bold">1 MB (Megabyte)</td>
                        <td className="py-2 px-3 text-slate-500">Compressed image / MP3 audio file</td>
                      </tr>
                      <tr>
                        <td className="py-2 px-3 font-bold text-blue-500">2^30</td>
                        <td className="py-2 px-3">1,073,741,824 Bytes</td>
                        <td className="py-2 px-3 text-amber-500">1 Billion Bytes</td>
                        <td className="py-2 px-3 font-bold">1 GB (Gigabyte)</td>
                        <td className="py-2 px-3 text-slate-500">HD Movie file / Server RAM block</td>
                      </tr>
                      <tr>
                        <td className="py-2 px-3 font-bold text-blue-500">2^40</td>
                        <td className="py-2 px-3">1,099,511,627,776 Bytes</td>
                        <td className="py-2 px-3 text-amber-500">1 Trillion Bytes</td>
                        <td className="py-2 px-3 font-bold">1 TB (Terabyte)</td>
                        <td className="py-2 px-3 text-slate-500">Large SSD disk drive / DB node</td>
                      </tr>
                      <tr>
                        <td className="py-2 px-3 font-bold text-blue-500">2^50</td>
                        <td className="py-2 px-3">1,125,899,906,842,624 Bytes</td>
                        <td className="py-2 px-3 text-amber-500">1 Quadrillion Bytes</td>
                        <td className="py-2 px-3 font-bold">1 PB (Petabyte)</td>
                        <td className="py-2 px-3 text-slate-500">Global video data warehouse</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* Interactive Power of 2 Slider */}
                <div className={`p-4 rounded-2xl border space-y-3 ${
                  isDarkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'
                }`}>
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs uppercase font-mono text-amber-500">Interactive Power-of-2 Inspector:</span>
                    <span className="font-mono text-xs font-bold text-indigo-400">2^{powerExponent}</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={50}
                    step={1}
                    value={powerExponent}
                    onChange={(e) => setPowerExponent(Number(e.target.value))}
                    className="w-full accent-amber-500 cursor-pointer"
                  />
                  <div className="p-3 bg-indigo-500/10 border border-indigo-500/20 rounded-xl flex items-center justify-between text-xs font-mono">
                    <span>Calculated Value: <strong>{Math.pow(2, powerExponent).toLocaleString()} Bytes</strong></span>
                    <span className="text-amber-500 font-bold">
                      ≈ {powerExponent >= 50 ? `${(Math.pow(2, powerExponent)/Math.pow(2, 50)).toFixed(2)} PB`
                           : powerExponent >= 40 ? `${(Math.pow(2, powerExponent)/Math.pow(2, 40)).toFixed(2)} TB`
                           : powerExponent >= 30 ? `${(Math.pow(2, powerExponent)/Math.pow(2, 30)).toFixed(2)} GB`
                           : powerExponent >= 20 ? `${(Math.pow(2, powerExponent)/Math.pow(2, 20)).toFixed(2)} MB`
                           : powerExponent >= 10 ? `${(Math.pow(2, powerExponent)/Math.pow(2, 10)).toFixed(2)} KB`
                           : `${Math.pow(2, powerExponent)} Bytes`}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ========================================================= */}
          {/* TAB 4: LATENCY NUMBERS */}
          {/* ========================================================= */}
          {activeTab === 'latency' && (
            <div className="space-y-6">
              <div className={`p-6 rounded-3xl border space-y-5 ${
                isDarkMode ? 'bg-[#1c1c1e] border-slate-800' : 'bg-white border-slate-200'
              }`}>
                <div>
                  <h3 className={`text-base font-bold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                    Latency Numbers Every Programmer Should Know
                  </h3>
                  <p className="text-xs text-slate-500 font-mono">
                    Based on Dean &amp; Norvig's famous computer latency benchmarks. Understand the order of magnitude speed difference!
                  </p>
                </div>

                {/* Visual Latency Bars */}
                <div className="space-y-3 font-mono text-xs">
                  {[
                    { op: 'L1 Cache Reference', time: '0.5 ns', relative: 1, bar: 'w-[2%]', color: 'bg-emerald-500', desc: 'Processor L1 CPU cache' },
                    { op: 'Mutex Lock / Unlock', time: '100 ns', relative: 200, bar: 'w-[4%]', color: 'bg-emerald-500', desc: 'CPU synchronization' },
                    { op: 'Main Memory (RAM) Read', time: '100 ns', relative: 200, bar: 'w-[4%]', color: 'bg-blue-500', desc: 'In-memory data structures / Redis' },
                    { op: 'Compress 1KB (Snappy)', time: '10 µs', relative: 20000, bar: 'w-[12%]', color: 'bg-blue-500', desc: 'CPU compression before sending' },
                    { op: 'Read 1MB sequentially from RAM', time: '250 µs', relative: 500000, bar: 'w-[25%]', color: 'bg-amber-500', desc: 'Fast memory sequential fetch' },
                    { op: 'SSD Random Read', time: '150 µs', relative: 300000, bar: 'w-[20%]', color: 'bg-amber-500', desc: 'NVMe SSD random flash read' },
                    { op: 'Read 1MB sequentially from SSD', time: '1 ms', relative: 2000000, bar: 'w-[40%]', color: 'bg-amber-600', desc: 'NVMe SSD throughput' },
                    { op: 'HDD Disk Seek', time: '10 ms', relative: 20000000, bar: 'w-[75%]', color: 'bg-rose-500', desc: 'Rotational mechanical disk head seek' },
                    { op: 'Cross-Atlantic Network RTT', time: '150 ms', relative: 300000000, bar: 'w-[100%]', color: 'bg-rose-600', desc: 'USA to Europe submarine fiber optics' },
                  ].map((item, idx) => (
                    <div key={idx} className={`p-3 rounded-xl border space-y-1.5 ${
                      isDarkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'
                    }`}>
                      <div className="flex items-center justify-between font-bold">
                        <span className={isDarkMode ? 'text-slate-200' : 'text-slate-800'}>{item.op}</span>
                        <span className="text-amber-500">{item.time}</span>
                      </div>
                      <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
                        <div className={`h-full ${item.color} ${item.bar}`}></div>
                      </div>
                      <p className="text-[10px] text-slate-500">{item.desc}</p>
                    </div>
                  ))}
                </div>

                {/* Key Engineering Rules */}
                <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-2xl space-y-2">
                  <h4 className="font-bold text-xs text-amber-600 dark:text-amber-400 uppercase font-mono">
                    Core Architectural Takeaways:
                  </h4>
                  <ul className="text-xs space-y-1 text-slate-300 list-disc list-inside">
                    <li><strong>RAM is ~1,000x faster than NVMe SSD</strong> and <strong>100,000x faster than mechanical HDD</strong>. Keep hot data in RAM (Redis / Memcached).</li>
                    <li><strong>Avoid network calls in tight loops</strong>: A local RAM read takes 100ns vs a database network call taking ~10ms (100,000x latency penalty!).</li>
                    <li><strong>Compress data before network transit</strong>: Spending 10µs CPU time compressing payload saves megabytes of high-latency network transmission.</li>
                  </ul>
                </div>
              </div>
            </div>
          )}

          {/* ========================================================= */}
          {/* TAB 5: AVAILABILITY NUMBERS */}
          {/* ========================================================= */}
          {activeTab === 'availability' && (
            <div className="space-y-6">
              <div className={`p-6 rounded-3xl border space-y-5 ${
                isDarkMode ? 'bg-[#1c1c1e] border-slate-800' : 'bg-white border-slate-200'
              }`}>
                <div>
                  <h3 className={`text-base font-bold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                    High Availability &amp; SLA "Nines"
                  </h3>
                  <p className="text-xs text-slate-500 font-mono">
                    Service Level Agreements (SLAs) guarantee uptime percentages. Each extra "nine" requires exponential architecture complexity.
                  </p>
                </div>

                {/* Interactive Availability Slider */}
                <div className={`p-5 rounded-2xl border space-y-4 ${
                  isDarkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'
                }`}>
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs font-mono uppercase text-amber-500">Select Target SLA:</span>
                    <span className="font-mono text-sm font-black text-emerald-400">{slaNines}% Uptime</span>
                  </div>

                  <div className="flex items-center space-x-2">
                    {[99, 99.9, 99.99, 99.999, 99.9999].map((val) => (
                      <button
                        key={val}
                        onClick={() => setSlaNines(val)}
                        className={`flex-1 py-2 rounded-xl text-xs font-bold font-mono transition-all ${
                          slaNines === val
                            ? 'bg-amber-500 text-slate-950 shadow-md'
                            : isDarkMode ? 'bg-[#1c1c1e] text-slate-400 hover:text-white' : 'bg-white text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        {val}%
                      </button>
                    ))}
                  </div>

                  {/* Downtime Metrics Cards */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
                    <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-center space-y-1">
                      <span className="text-[10px] text-slate-400 uppercase font-mono">Downtime / Day</span>
                      <p className="text-xs font-bold font-mono text-rose-400">{formatTimeSpan(downtimePerYearSec / 365.25)}</p>
                    </div>
                    <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-center space-y-1">
                      <span className="text-[10px] text-slate-400 uppercase font-mono">Downtime / Month</span>
                      <p className="text-xs font-bold font-mono text-rose-400">{formatTimeSpan(downtimePerYearSec / 12)}</p>
                    </div>
                    <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-center space-y-1">
                      <span className="text-[10px] text-slate-400 uppercase font-mono">Downtime / Year</span>
                      <p className="text-xs font-bold font-mono text-rose-400">{formatTimeSpan(downtimePerYearSec)}</p>
                    </div>
                    <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-center space-y-1">
                      <span className="text-[10px] text-slate-400 uppercase font-mono">Architectural Target</span>
                      <p className="text-xs font-bold font-mono text-emerald-400">
                        {slaNines >= 99.999 ? 'Multi-Region Active-Active' : slaNines >= 99.99 ? 'Multi-AZ Auto-Failover' : 'Standard Primary/Replica'}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Table of Nines */}
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs font-mono">
                    <thead>
                      <tr className={`border-b ${isDarkMode ? 'border-slate-800 text-amber-400' : 'border-slate-200 text-amber-700'}`}>
                        <th className="py-2.5 px-3">SLA</th>
                        <th className="py-2.5 px-3">Downtime per Year</th>
                        <th className="py-2.5 px-3">Downtime per Month</th>
                        <th className="py-2.5 px-3">Required Infra Strategy</th>
                      </tr>
                    </thead>
                    <tbody className={`divide-y ${isDarkMode ? 'divide-slate-800/60 text-slate-300' : 'divide-slate-100 text-slate-700'}`}>
                      <tr>
                        <td className="py-2 px-3 font-bold text-amber-500">99% (Two 9s)</td>
                        <td className="py-2 px-3 text-rose-400">3.65 days</td>
                        <td className="py-2 px-3">7.3 hours</td>
                        <td className="py-2 px-3 text-slate-500">Basic single instance app server</td>
                      </tr>
                      <tr>
                        <td className="py-2 px-3 font-bold text-amber-500">99.9% (Three 9s)</td>
                        <td className="py-2 px-3 text-rose-400">8.77 hours</td>
                        <td className="py-2 px-3">43.8 minutes</td>
                        <td className="py-2 px-3 text-slate-500">Load balancer + multi-instance web tier</td>
                      </tr>
                      <tr>
                        <td className="py-2 px-3 font-bold text-amber-500">99.99% (Four 9s)</td>
                        <td className="py-2 px-3 text-rose-400">52.6 minutes</td>
                        <td className="py-2 px-3">4.38 minutes</td>
                        <td className="py-2 px-3 text-slate-500">Multi-AZ DB auto-failover + stateless web tier</td>
                      </tr>
                      <tr>
                        <td className="py-2 px-3 font-bold text-amber-500">99.999% (Five 9s)</td>
                        <td className="py-2 px-3 text-rose-400">5.26 minutes</td>
                        <td className="py-2 px-3">26.3 seconds</td>
                        <td className="py-2 px-3 text-slate-500">Multi-region active-active + automated health checks</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ========================================================= */}
          {/* TAB 6: ESTIMATING TWITTER EXAMPLE */}
          {/* ========================================================= */}
          {activeTab === 'twitter' && (
            <div className="space-y-6">
              <div className={`p-6 rounded-3xl border space-y-5 ${
                isDarkMode ? 'bg-[#1c1c1e] border-slate-800' : 'bg-white border-slate-200'
              }`}>
                <div>
                  <h3 className={`text-base font-bold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                    Step-by-Step Example: Estimating Twitter
                  </h3>
                  <p className="text-xs text-slate-500 font-mono">
                    Walk through the complete estimation process used in real system design interviews.
                  </p>
                </div>

                {/* Given Assumptions Box */}
                <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-2xl space-y-2 text-xs">
                  <span className="font-bold text-blue-500 uppercase font-mono">Step 1: Stated Assumptions</span>
                  <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-slate-300 font-mono">
                    <li>• Daily Active Users (DAU) = 300 Million</li>
                    <li>• Tweets per user/day = 2 tweets</li>
                    <li>• Read-to-Write Ratio = 1:100 (Read-heavy)</li>
                    <li>• Media Percentage = 10% tweets include image (200 KB)</li>
                    <li>• Tweet Text Metadata = 300 Bytes per tweet</li>
                    <li>• Data Retention = 5 Years</li>
                  </ul>
                </div>

                {/* Step-by-Step Calculations */}
                <div className="space-y-3 font-mono text-xs">
                  <div className={`p-4 rounded-2xl border space-y-1.5 ${
                    isDarkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'
                  }`}>
                    <h4 className="font-bold text-amber-500 uppercase">1. Query Per Second (QPS) Calculation</h4>
                    <p className="text-slate-400">Total Write Requests/Day = 300 Million × 2 = 600 Million tweets/day</p>
                    <p className="text-slate-400">Average Write QPS = 600,000,000 / 86,400s ≈ <strong>6,944 Write QPS</strong></p>
                    <p className="text-slate-400">Peak Write QPS = 2 × Average Write QPS ≈ <strong>~14,000 Write QPS</strong></p>
                    <p className="text-emerald-400 font-bold">Read QPS = 6,944 Write QPS × 100 = 694,400 Read QPS (Peak Read QPS ≈ 1.4 Million QPS)</p>
                  </div>

                  <div className={`p-4 rounded-2xl border space-y-1.5 ${
                    isDarkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'
                  }`}>
                    <h4 className="font-bold text-indigo-500 uppercase">2. Daily Storage Requirement</h4>
                    <p className="text-slate-400">Text Storage/Day = 600M tweets × 300 bytes = 180 GB / day</p>
                    <p className="text-slate-400">Media Storage/Day = 600M × 10% × 200 KB = 60M × 200 KB = 12 TB / day</p>
                    <p className="text-amber-400 font-bold">Total Storage/Day = 180 GB + 12 TB = 12.18 Terabytes / day</p>
                  </div>

                  <div className={`p-4 rounded-2xl border space-y-1.5 ${
                    isDarkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'
                  }`}>
                    <h4 className="font-bold text-emerald-500 uppercase">3. 5-Year Storage &amp; Bandwidth</h4>
                    <p className="text-slate-400">5-Year Storage = 12.18 TB/day × 365 days × 5 years ≈ <strong>22.2 Petabytes</strong></p>
                    <p className="text-slate-400">Ingress Bandwidth = 12.18 TB / 86,400s ≈ <strong>140 MB/s</strong></p>
                    <p className="text-rose-400 font-bold">Egress Bandwidth = 140 MB/s × 100 read ratio = 14 GB/s (CDN Essential!)</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ========================================================= */}
          {/* TAB 7: INTERVIEW TIPS */}
          {/* ========================================================= */}
          {activeTab === 'tips' && (
            <div className="space-y-6">
              <div className={`p-6 rounded-3xl border space-y-4 ${
                isDarkMode ? 'bg-[#1c1c1e] border-slate-800' : 'bg-white border-slate-200'
              }`}>
                <h3 className={`text-base font-bold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                  Best Practices &amp; Interview Tips for Estimation
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 space-y-3">
                    <h4 className="font-bold text-xs text-emerald-600 dark:text-emerald-400 flex items-center space-x-1 font-mono uppercase">
                      <CheckCircle2 className="w-4 h-4 mr-1" /> DO THIS (INTERVIEW WINNERS)
                    </h4>
                    <ul className="text-xs space-y-2 text-slate-300">
                      <li className="flex items-start space-x-2">
                        <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                        <span><strong>Use rounded numbers:</strong> Treat 86,400 seconds in a day as 100,000 to keep calculations fast.</span>
                      </li>
                      <li className="flex items-start space-x-2">
                        <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                        <span><strong>State assumptions explicitly:</strong> Write DAU, media %, and payload sizes on the board.</span>
                      </li>
                      <li className="flex items-start space-x-2">
                        <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                        <span><strong>Label every unit:</strong> Distinguish clearly between Bits (b) and Bytes (B), MB/s vs Gbps.</span>
                      </li>
                    </ul>
                  </div>

                  <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 space-y-3">
                    <h4 className="font-bold text-xs text-rose-600 dark:text-rose-400 flex items-center space-x-1 font-mono uppercase">
                      <AlertTriangle className="w-4 h-4 mr-1" /> DON'T DO THIS (COMMON TRAPS)
                    </h4>
                    <ul className="text-xs space-y-2 text-slate-300">
                      <li className="flex items-start space-x-2">
                        <Check className="w-3.5 h-3.5 text-rose-500 shrink-0 mt-0.5" />
                        <span><strong>Don't stress over exact decimals:</strong> 6.9k QPS vs 7.0k QPS makes zero difference to architecture choices.</span>
                      </li>
                      <li className="flex items-start space-x-2">
                        <Check className="w-3.5 h-3.5 text-rose-500 shrink-0 mt-0.5" />
                        <span><strong>Don't do silent calculations:</strong> Talk through each step out loud so interviewer follows your logic.</span>
                      </li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ========================================================= */}
          {/* TAB 8: INTERACTIVE ESTIMATION PLAYGROUND */}
          {/* ========================================================= */}
          {activeTab === 'playground' && (
            <div className="space-y-6">
              <div className={`p-6 sm:p-8 rounded-3xl border shadow-xl space-y-6 ${
                isDarkMode ? 'bg-[#1c1c1e] border-slate-800 text-slate-100' : 'bg-white border-slate-200 text-slate-900'
              }`}>
                {/* Playground Header & Presets */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b pb-4 border-slate-200 dark:border-slate-800">
                  <div>
                    <div className="flex items-center space-x-2">
                      <Calculator className="w-5 h-5 text-amber-500" />
                      <h2 className="text-lg font-extrabold tracking-tight">
                        Interactive System Capacity Estimation Playground
                      </h2>
                    </div>
                    <p className="text-xs text-slate-500 font-mono mt-0.5">
                      Adjust parameters to instantly calculate QPS, storage, bandwidth, RAM, and server instances!
                    </p>
                  </div>

                  {/* Preset Selector */}
                  <div className="flex items-center space-x-2">
                    <span className="text-xs font-mono font-bold text-slate-400">Preset:</span>
                    <select
                      value={preset}
                      onChange={(e) => handlePresetSelect(e.target.value as any)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold font-mono border focus:outline-none cursor-pointer ${
                        isDarkMode ? 'bg-slate-950 border-slate-800 text-amber-400' : 'bg-slate-100 border-slate-200 text-amber-700'
                      }`}
                    >
                      <option value="twitter">🐦 Twitter (Social Feed)</option>
                      <option value="youtube">📺 YouTube (Video Streaming)</option>
                      <option value="whatsapp">💬 WhatsApp (Messaging)</option>
                      <option value="tinyurl">🔗 TinyURL (URL Shortener)</option>
                      <option value="custom">⚙️ Custom Parameters</option>
                    </select>
                  </div>
                </div>

                {/* Input Controls Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  {/* DAU */}
                  <div className={`p-4 rounded-2xl border space-y-2 ${
                    isDarkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'
                  }`}>
                    <div className="flex items-center justify-between text-xs font-mono">
                      <span className="font-bold text-blue-500">DAU (Millions)</span>
                      <span className="font-bold text-amber-400">{dau}M</span>
                    </div>
                    <input
                      type="range"
                      min={1}
                      max={2000}
                      step={5}
                      value={dau}
                      onChange={(e) => {
                        setDau(Number(e.target.value));
                        setPreset('custom');
                      }}
                      className="w-full accent-blue-500 cursor-pointer"
                    />
                  </div>

                  {/* Writes per user */}
                  <div className={`p-4 rounded-2xl border space-y-2 ${
                    isDarkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'
                  }`}>
                    <div className="flex items-center justify-between text-xs font-mono">
                      <span className="font-bold text-indigo-500">Writes / User / Day</span>
                      <span className="font-bold text-amber-400">{writesPerUser}</span>
                    </div>
                    <input
                      type="range"
                      min={0.1}
                      max={100}
                      step={0.1}
                      value={writesPerUser}
                      onChange={(e) => {
                        setWritesPerUser(Number(e.target.value));
                        setPreset('custom');
                      }}
                      className="w-full accent-indigo-500 cursor-pointer"
                    />
                  </div>

                  {/* Read to Write Ratio */}
                  <div className={`p-4 rounded-2xl border space-y-2 ${
                    isDarkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'
                  }`}>
                    <div className="flex items-center justify-between text-xs font-mono">
                      <span className="font-bold text-emerald-500">Read:Write Ratio</span>
                      <span className="font-bold text-amber-400">1 : {readRatio}</span>
                    </div>
                    <input
                      type="range"
                      min={1}
                      max={500}
                      step={1}
                      value={readRatio}
                      onChange={(e) => {
                        setReadRatio(Number(e.target.value));
                        setPreset('custom');
                      }}
                      className="w-full accent-emerald-500 cursor-pointer"
                    />
                  </div>

                  {/* Media % */}
                  <div className={`p-4 rounded-2xl border space-y-2 ${
                    isDarkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'
                  }`}>
                    <div className="flex items-center justify-between text-xs font-mono">
                      <span className="font-bold text-purple-500">Media Content %</span>
                      <span className="font-bold text-amber-400">{mediaPercent}%</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      step={1}
                      value={mediaPercent}
                      onChange={(e) => {
                        setMediaPercent(Number(e.target.value));
                        setPreset('custom');
                      }}
                      className="w-full accent-purple-500 cursor-pointer"
                    />
                  </div>
                </div>

                {/* REAL-TIME DASHBOARD RESULTS */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  {/* Write & Read QPS */}
                  <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-2xl space-y-2">
                    <span className="text-[10px] font-mono font-bold text-blue-400 uppercase">1. Request Rate (QPS)</span>
                    <div className="space-y-1 text-xs font-mono">
                      <div className="flex justify-between">
                        <span className="text-slate-400">Avg Write QPS:</span>
                        <span className="font-bold text-white">{Math.round(avgWriteQps).toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Peak Write QPS:</span>
                        <span className="font-bold text-amber-400">{Math.round(peakWriteQps).toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between border-t pt-1 border-blue-500/20">
                        <span className="text-slate-400">Peak Read QPS:</span>
                        <span className="font-bold text-emerald-400">{Math.round(peakReadQps).toLocaleString()}</span>
                      </div>
                    </div>
                  </div>

                  {/* Storage */}
                  <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-2xl space-y-2">
                    <span className="text-[10px] font-mono font-bold text-amber-400 uppercase">2. Storage Requirements</span>
                    <div className="space-y-1 text-xs font-mono">
                      <div className="flex justify-between">
                        <span className="text-slate-400">Daily Storage:</span>
                        <span className="font-bold text-white">
                          {totalStorageTBPerDay >= 1
                            ? `${totalStorageTBPerDay.toFixed(2)} TB / day`
                            : `${totalStorageGBPerDay.toFixed(1)} GB / day`}
                        </span>
                      </div>
                      <div className="flex justify-between border-t pt-1 border-amber-500/20">
                        <span className="text-slate-400">{retentionYears}-Year Total:</span>
                        <span className="font-bold text-amber-400">
                          {multiYearStoragePB >= 1
                            ? `${multiYearStoragePB.toFixed(2)} Petabytes`
                            : `${multiYearStorageTB.toFixed(1)} Terabytes`}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Bandwidth */}
                  <div className="p-4 bg-purple-500/10 border border-purple-500/20 rounded-2xl space-y-2">
                    <span className="text-[10px] font-mono font-bold text-purple-400 uppercase">3. Network Bandwidth</span>
                    <div className="space-y-1 text-xs font-mono">
                      <div className="flex justify-between">
                        <span className="text-slate-400">Ingress:</span>
                        <span className="font-bold text-white">{ingressMBps.toFixed(1)} MB/s</span>
                      </div>
                      <div className="flex justify-between border-t pt-1 border-purple-500/20">
                        <span className="text-slate-400">Egress:</span>
                        <span className="font-bold text-purple-400">
                          {egressGBps >= 1 ? `${egressGBps.toFixed(2)} GB/s` : `${egressMBps.toFixed(1)} MB/s`}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* App Servers & Cache RAM */}
                  <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl space-y-2">
                    <span className="text-[10px] font-mono font-bold text-emerald-400 uppercase">4. Infra Sizing (Servers &amp; RAM)</span>
                    <div className="space-y-1 text-xs font-mono">
                      <div className="flex justify-between">
                        <span className="text-slate-400">App Instances:</span>
                        <span className="font-bold text-white">~{appServersNeeded.toLocaleString()} servers</span>
                      </div>
                      <div className="flex justify-between border-t pt-1 border-emerald-500/20">
                        <span className="text-slate-400">Redis Cache RAM (20%):</span>
                        <span className="font-bold text-emerald-400">{memoryCacheNeededGB.toFixed(1)} GB</span>
                      </div>
                    </div>
                  </div>
                </div>

              </div>
            </div>
          )}

        </motion.div>
      </AnimatePresence>

    </div>
  );
};
