import React, { useState, useEffect } from 'react';
import { RateLimiterAlgo, RateLimiterRequestLog } from '../types';
import { 
  Gauge, 
  Zap, 
  Database, 
  Play, 
  Pause, 
  RefreshCw,
  Sliders,
  Flame,
  Activity,
  Laptop,
  Server,
  ShieldCheck,
  ShieldAlert,
  ArrowRight,
  Network,
  CheckCircle2,
  XCircle
} from 'lucide-react';

interface Chapter4RateLimiterProps {
  isDarkMode?: boolean;
}

export const Chapter4RateLimiter: React.FC<Chapter4RateLimiterProps> = ({ isDarkMode = false }) => {
  // Navigation tabs for Chapter 4 sections
  const [activeTab, setActiveTab] = useState<'concepts' | 'algorithms' | 'simulator'>('simulator');
  const [selectedAlgo, setSelectedAlgo] = useState<RateLimiterAlgo>('tokenBucket');

  // --- SIMULATOR CONFIGURATION STATE ---
  const [bucketCapacity, setBucketCapacity] = useState<number>(10);
  const [refillRate, setRefillRate] = useState<number>(2); // tokens per second or leak rate
  const [windowSeconds, setWindowSeconds] = useState<number>(10); // for fixed/sliding windows

  // --- LIVE ALGORITHM ENGINE STATES ---
  // 1. Token Bucket
  const [tokens, setTokens] = useState<number>(10);
  // 2. Leaky Bucket
  const [queue, setQueue] = useState<string[]>([]);
  // 3. Fixed Window
  const [fixedCount, setFixedCount] = useState<number>(0);
  const [windowStartTime, setWindowStartTime] = useState<number>(Date.now());
  // 4. Sliding Window Log
  const [logs, setLogs] = useState<number[]>([]);
  // 5. Sliding Window Counter
  const [prevWindowCount, setPrevWindowCount] = useState<number>(4);
  const [currentWindowCount, setCurrentWindowCount] = useState<number>(0);

  // General Traffic Metrics & Logs
  const [customUserId, setCustomUserId] = useState<string>('User_Alpha');
  const [requestLogs, setRequestLogs] = useState<RateLimiterRequestLog[]>([]);
  const [isAutoStreamActive, setIsAutoStreamActive] = useState<boolean>(false);
  const [totalAllowed, setTotalAllowed] = useState<number>(0);
  const [totalRejected, setTotalRejected] = useState<number>(0);

  const buildRateLimitHeaders = (remainingCount: number, rejected: boolean) => {
    const retryAfterSeconds = rejected
      ? (selectedAlgo === 'fixedWindow' || selectedAlgo === 'slidingLog' || selectedAlgo === 'slidingCounter'
          ? windowSeconds
          : 1)
      : undefined;

    return {
      retryAfterSeconds,
      responseHeaders: {
        limit: bucketCapacity,
        remaining: Math.max(0, remainingCount),
        retryAfter: retryAfterSeconds,
      },
    };
  };

  // --- TOKEN BUCKET & LEAKY BUCKET REFILL / LEAK INTERVAL ---
  useEffect(() => {
    const timer = setInterval(() => {
      const now = Date.now();

      // Token Bucket Refill
      setTokens((prevTokens) => {
        const nextTokens = Math.min(bucketCapacity, prevTokens + refillRate);
        return parseFloat(nextTokens.toFixed(1));
      });

      // Leaky Bucket Leak Process (processes 1 item per leak cycle)
      setQueue((prevQueue) => {
        if (prevQueue.length > 0) {
          return prevQueue.slice(1);
        }
        return prevQueue;
      });

      // Fixed Window Reset check
      if (now - windowStartTime >= windowSeconds * 1000) {
        setPrevWindowCount(currentWindowCount);
        setCurrentWindowCount(0);
        setFixedCount(0);
        setWindowStartTime(now);
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [bucketCapacity, refillRate, windowSeconds, windowStartTime, currentWindowCount]);

  // --- AUTOMATIC STREAM TRAFFIC GENERATOR ---
  useEffect(() => {
    if (!isAutoStreamActive) return;

    const streamTimer = setInterval(() => {
      dispatchRequest();
    }, 1000);

    return () => clearInterval(streamTimer);
  }, [isAutoStreamActive, selectedAlgo, tokens, queue, fixedCount, logs, currentWindowCount, prevWindowCount, bucketCapacity, windowSeconds]);

  // --- DISPATCH REQUEST HANDLER (REQUEST BY REQUEST) ---
  const dispatchRequest = (overrideUser?: string) => {
    const now = Date.now();
    const userId = overrideUser || customUserId || `User_${Math.floor(Math.random() * 900 + 100)}`;
    const reqId = `REQ-${Math.floor(Math.random() * 90000 + 10000)}`;
    const timeStr = new Date().toLocaleTimeString();

    let isAllowed = false;
    let reason = '';
    let remaining = 0;

    switch (selectedAlgo) {
      case 'tokenBucket': {
        if (tokens >= 1) {
          isAllowed = true;
          setTokens((prev) => Math.max(0, parseFloat((prev - 1).toFixed(1))));
          remaining = Math.max(0, Math.floor(tokens - 1));
          reason = 'Token available in bucket';
        } else {
          isAllowed = false;
          remaining = 0;
          reason = 'Rate limit exceeded: No tokens available in bucket';
        }
        break;
      }

      case 'leakyBucket': {
        if (queue.length < bucketCapacity) {
          isAllowed = true;
          setQueue((prev) => [...prev, reqId]);
          remaining = bucketCapacity - (queue.length + 1);
          reason = 'Request queued in bucket buffer';
        } else {
          isAllowed = false;
          remaining = 0;
          reason = 'Rate limit exceeded: Leaky bucket queue full';
        }
        break;
      }

      case 'fixedWindow': {
        if (fixedCount < bucketCapacity) {
          isAllowed = true;
          setFixedCount((prev) => prev + 1);
          remaining = bucketCapacity - (fixedCount + 1);
          reason = 'Within fixed window limit';
        } else {
          isAllowed = false;
          remaining = 0;
          reason = 'Rate limit exceeded: Fixed window counter maxed out';
        }
        break;
      }

      case 'slidingLog': {
        const windowStart = now - windowSeconds * 1000;
        const validLogs = logs.filter((t) => t > windowStart);
        if (validLogs.length < bucketCapacity) {
          isAllowed = true;
          setLogs([...validLogs, now]);
          remaining = bucketCapacity - (validLogs.length + 1);
          reason = 'Logged request inside sliding log window';
        } else {
          isAllowed = false;
          setLogs(validLogs);
          remaining = 0;
          reason = 'Rate limit exceeded: Sliding log count full';
        }
        break;
      }

      case 'slidingCounter': {
        const elapsedTime = (now - windowStartTime) / 1000;
        const windowProgress = Math.min(1, elapsedTime / windowSeconds);
        const weightedCount = Math.floor(currentWindowCount + prevWindowCount * (1 - windowProgress));

        if (weightedCount < bucketCapacity) {
          isAllowed = true;
          setCurrentWindowCount((prev) => prev + 1);
          remaining = bucketCapacity - (weightedCount + 1);
          reason = `Weighted count (${weightedCount}/${bucketCapacity}) allowed`;
        } else {
          isAllowed = false;
          remaining = 0;
          reason = `Weighted count (${weightedCount}/${bucketCapacity}) exceeded capacity`;
        }
        break;
      }
    }

    if (isAllowed) {
      setTotalAllowed((prev) => prev + 1);
    } else {
      setTotalRejected((prev) => prev + 1);
    }

    const headerMeta = buildRateLimitHeaders(remaining, !isAllowed);

    const newLog: RateLimiterRequestLog = {
      id: `${reqId}_${now}`,
      requestId: reqId,
      userId,
      timestamp: now,
      timeString: timeStr,
      status: isAllowed ? 'ALLOWED' : 'REJECTED',
      algorithm: selectedAlgo,
      remainingTokens: remaining,
      reason,
      retryAfterSeconds: headerMeta.retryAfterSeconds,
      responseHeaders: headerMeta.responseHeaders,
    };

    setRequestLogs((prev) => [newLog, ...prev.slice(0, 24)]);
  };

  // Dispatch Burst of 5 Requests
  const handleFireBurst = () => {
    for (let i = 0; i < 5; i++) {
      setTimeout(() => {
        dispatchRequest();
      }, i * 150);
    }
  };

  // Reset simulator statistics
  const handleResetSimulator = () => {
    setTokens(bucketCapacity);
    setQueue([]);
    setFixedCount(0);
    setLogs([]);
    setCurrentWindowCount(0);
    setPrevWindowCount(3);
    setRequestLogs([]);
    setTotalAllowed(0);
    setTotalRejected(0);
  };

  return (
    <div className="space-y-8 max-w-6xl mx-auto">
      
      {/* Chapter 4 Header Banner */}
      <div className={`border rounded-2xl p-6 shadow-xl space-y-3 ${
        isDarkMode ? 'bg-[#1c1c1e] border-slate-800' : 'bg-white border-slate-200'
      }`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-gradient-to-tr from-amber-500 to-orange-600 rounded-xl shadow-md text-white">
              <Gauge className="w-6 h-6" />
            </div>
            <div>
              <span className="px-2.5 py-0.5 bg-amber-500/10 text-amber-600 dark:text-amber-400 font-mono text-xs rounded-full border border-amber-500/20 font-bold">
                Chapter 4
              </span>
              <h2 className={`text-2xl font-bold tracking-tight ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                Design a Rate Limiter
              </h2>
            </div>
          </div>

          {/* Sub Navigation Tabs inside Chapter 4 */}
          <div className={`flex space-x-1 p-1 rounded-xl border font-mono text-xs ${
            isDarkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-100 border-slate-200'
          }`}>
            <button
              onClick={() => setActiveTab('simulator')}
              className={`px-3.5 py-1.5 rounded-lg font-bold transition-all ${
                activeTab === 'simulator'
                  ? 'bg-amber-600 text-white shadow-md'
                  : isDarkMode ? 'text-slate-400 hover:text-white' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Interactive Simulator
            </button>
            <button
              onClick={() => setActiveTab('algorithms')}
              className={`px-3.5 py-1.5 rounded-lg font-bold transition-all ${
                activeTab === 'algorithms'
                  ? 'bg-amber-600 text-white shadow-md'
                  : isDarkMode ? 'text-slate-400 hover:text-white' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              5 Algorithms Breakdown
            </button>
            <button
              onClick={() => setActiveTab('concepts')}
              className={`px-3.5 py-1.5 rounded-lg font-bold transition-all ${
                activeTab === 'concepts'
                  ? 'bg-amber-600 text-white shadow-md'
                  : isDarkMode ? 'text-slate-400 hover:text-white' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Architecture & Placement
            </button>
          </div>
        </div>

        <p className={`text-xs max-w-4xl leading-relaxed ${isDarkMode ? 'text-slate-300' : 'text-slate-600'}`}>
          A Rate Limiter controls the rate of traffic sent by a client or service. In HTTP APIs, it limits the number of client requests allowed within a specific time frame, returning <code className="font-bold text-amber-600 dark:text-amber-400">HTTP 429 Too Many Requests</code> when limits are exceeded.
        </p>
      </div>

      {/* VIEW 1: INTERACTIVE SIMULATOR */}
      {activeTab === 'simulator' && (
        <div className="space-y-6">

          {/* Client -> Rate Limiter Middleware -> Application Server Topology Flow */}
          {(() => {
            const latestLog = requestLogs[0];
            return (
              <div className={`p-4 rounded-3xl border space-y-3 shadow-md ${
                isDarkMode ? 'bg-[#1c1c1e]/90 border-slate-800' : 'bg-white border-slate-200'
              }`}>
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 border-b pb-2.5 border-slate-200 dark:border-slate-800">
                  <div className="flex items-center space-x-2">
                    <Network className="w-4 h-4 text-amber-500" />
                    <h3 className={`font-bold text-xs uppercase font-mono ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                      System Architecture: Client ➔ Rate Limiter Middleware ➔ Backend Server
                    </h3>
                  </div>
                  <span className={`text-[11px] font-mono font-bold ${
                    latestLog
                      ? latestLog.status === 'ALLOWED' ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
                      : isDarkMode ? 'text-slate-400' : 'text-slate-500'
                  }`}>
                    Latest Request: {latestLog ? (latestLog.status === 'ALLOWED' ? 'HTTP 200 OK (Forwarded)' : 'HTTP 429 Too Many Requests (Blocked)') : 'Awaiting Traffic...'}
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-stretch">
                  
                  {/* 1. CLIENT NODE */}
                  <div className={`p-3.5 rounded-2xl border flex flex-col items-center text-center justify-between space-y-2 relative ${
                    isDarkMode ? 'bg-slate-950 border-slate-800/80' : 'bg-slate-50 border-slate-200'
                  }`}>
                    <div className="p-2.5 bg-blue-500/10 text-blue-500 rounded-2xl border border-blue-500/20">
                      <Laptop className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className={`font-bold text-xs ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                        Client App / Browser
                      </h4>
                      <p className="text-[10px] text-slate-500 font-mono mt-0.5">User Key: {customUserId}</p>
                    </div>
                    <div className="px-2 py-1 bg-blue-500/10 border border-blue-500/20 text-blue-600 dark:text-blue-400 rounded-lg text-[10px] font-mono font-bold">
                      GET /api/v1/resource
                    </div>
                  </div>

                  {/* 2. RATE LIMITER MIDDLEWARE NODE */}
                  <div className={`p-3.5 rounded-2xl border flex flex-col items-center text-center justify-between space-y-2 relative transition-all ${
                    latestLog?.status === 'ALLOWED'
                      ? 'bg-emerald-500/10 border-emerald-500/40'
                      : latestLog?.status === 'REJECTED'
                      ? 'bg-rose-500/10 border-rose-500/40'
                      : isDarkMode ? 'bg-slate-950 border-slate-800/80' : 'bg-slate-50 border-slate-200'
                  }`}>
                    <div className={`p-2.5 rounded-2xl border ${
                      latestLog?.status === 'ALLOWED'
                        ? 'bg-emerald-500/20 text-emerald-500 border-emerald-500/30'
                        : latestLog?.status === 'REJECTED'
                        ? 'bg-rose-500/20 text-rose-500 border-rose-500/30'
                        : 'bg-amber-500/10 text-amber-500 border-amber-500/20'
                    }`}>
                      {latestLog?.status === 'REJECTED' ? <ShieldAlert className="w-5 h-5" /> : <ShieldCheck className="w-5 h-5" />}
                    </div>
                    <div>
                      <h4 className={`font-bold text-xs ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                        Rate Limiter Middleware
                      </h4>
                      <p className="text-[10px] text-slate-500 font-mono mt-0.5">
                        Capacity: {bucketCapacity} reqs
                      </p>
                    </div>
                    {latestLog ? (
                      <span className={`px-2.5 py-1 rounded-lg text-[10px] font-mono font-bold shadow-xs ${
                        latestLog.status === 'ALLOWED'
                          ? 'bg-emerald-600 text-white'
                          : 'bg-rose-600 text-white'
                      }`}>
                        {latestLog.status === 'ALLOWED' ? '✓ 200 ALLOWED' : '✕ 429 REJECTED'}
                      </span>
                    ) : (
                      <span className="text-[10px] font-mono text-slate-400 italic">Ready to evaluate</span>
                    )}
                  </div>

                  {/* 3. APPLICATION SERVER NODE */}
                  <div className={`p-3.5 rounded-2xl border flex flex-col items-center text-center justify-between space-y-2 relative ${
                    isDarkMode ? 'bg-slate-950 border-slate-800/80' : 'bg-slate-50 border-slate-200'
                  }`}>
                    <div className="p-2.5 bg-indigo-500/10 text-indigo-500 rounded-2xl border border-indigo-500/20">
                      <Server className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className={`font-bold text-xs ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                        Backend Application Server
                      </h4>
                      <p className="text-[10px] text-slate-500 font-mono mt-0.5">Database & Core Business Logic</p>
                    </div>
                    <div className={`px-2 py-1 rounded-lg text-[10px] font-mono font-bold border ${
                      latestLog?.status === 'ALLOWED'
                        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400'
                        : 'bg-slate-200 dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-500'
                    }`}>
                      {latestLog?.status === 'ALLOWED' ? 'Server Received Request' : 'Protected From Overload'}
                    </div>
                  </div>

                </div>
              </div>
            );
          })()}
          
          {/* Algorithm Selector Bar */}
          <div className={`p-4 rounded-2xl border space-y-3 ${
            isDarkMode ? 'bg-[#1c1c1e]/90 border-slate-800' : 'bg-white border-slate-200 shadow-sm'
          }`}>
            <div className="flex items-center justify-between">
              <span className={`text-xs font-mono font-bold uppercase ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                1. Select Rate Limiting Algorithm:
              </span>
              <span className="text-xs font-mono text-amber-600 dark:text-amber-400 font-bold">
                Active: {selectedAlgo === 'tokenBucket' ? 'Token Bucket' : selectedAlgo === 'leakyBucket' ? 'Leaky Bucket' : selectedAlgo === 'fixedWindow' ? 'Fixed Window Counter' : selectedAlgo === 'slidingLog' ? 'Sliding Window Log' : 'Sliding Window Counter'}
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              {[
                { id: 'tokenBucket' as RateLimiterAlgo, label: 'Token Bucket', desc: 'Refill R tokens/sec' },
                { id: 'leakyBucket' as RateLimiterAlgo, label: 'Leaky Bucket', desc: 'Fixed output rate' },
                { id: 'fixedWindow' as RateLimiterAlgo, label: 'Fixed Window', desc: 'Resets every N sec' },
                { id: 'slidingLog' as RateLimiterAlgo, label: 'Sliding Log', desc: '100% precise log' },
                { id: 'slidingCounter' as RateLimiterAlgo, label: 'Sliding Counter', desc: 'Weighted overlap' },
              ].map((algo) => (
                <button
                  key={algo.id}
                  onClick={() => {
                    setSelectedAlgo(algo.id);
                    handleResetSimulator();
                  }}
                  className={`p-3 rounded-xl border text-left transition-all font-mono ${
                    selectedAlgo === algo.id
                      ? 'bg-gradient-to-r from-amber-500 to-orange-600 text-white border-transparent shadow-lg scale-[1.02]'
                      : isDarkMode
                      ? 'bg-slate-950/80 border-slate-800 hover:border-slate-700 text-slate-300'
                      : 'bg-slate-50 border-slate-200 hover:border-slate-300 text-slate-700'
                  }`}
                >
                  <div className="font-bold text-xs">{algo.label}</div>
                  <div className={`text-[10px] opacity-80 mt-0.5 ${selectedAlgo === algo.id ? 'text-white' : isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                    {algo.desc}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Interactive Control Panel & Parameters */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* Left Column: Configuration Controls */}
            <div className={`p-5 rounded-2xl border space-y-4 ${
              isDarkMode ? 'bg-[#1c1c1e]/90 border-slate-800' : 'bg-white border-slate-200 shadow-sm'
            }`}>
              <div className="flex items-center space-x-2 border-b pb-2 border-slate-200 dark:border-slate-800">
                <Sliders className="w-4 h-4 text-amber-500" />
                <h3 className={`font-bold text-sm ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                  Algorithm Parameters
                </h3>
              </div>

              {/* Bucket Capacity Slider */}
              <div className="space-y-1.5 font-mono text-xs">
                <div className="flex justify-between">
                  <span className={isDarkMode ? 'text-slate-300' : 'text-slate-700'}>
                    Capacity Limit ($N$):
                  </span>
                  <span className="font-bold text-amber-600 dark:text-amber-400">{bucketCapacity} reqs</span>
                </div>
                <input
                  type="range"
                  min={3}
                  max={25}
                  value={bucketCapacity}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    setBucketCapacity(val);
                    setTokens(val);
                  }}
                  className="w-full accent-amber-500 cursor-pointer"
                />
              </div>

              {/* Refill Rate / Leak Rate Slider */}
              {(selectedAlgo === 'tokenBucket' || selectedAlgo === 'leakyBucket') && (
                <div className="space-y-1.5 font-mono text-xs">
                  <div className="flex justify-between">
                    <span className={isDarkMode ? 'text-slate-300' : 'text-slate-700'}>
                      {selectedAlgo === 'tokenBucket' ? 'Refill Rate ($R$):' : 'Leak Process Speed:'}
                    </span>
                    <span className="font-bold text-emerald-600 dark:text-emerald-400">{refillRate} / sec</span>
                  </div>
                  <input
                    type="range"
                    min={1}
                    max={5}
                    value={refillRate}
                    onChange={(e) => setRefillRate(Number(e.target.value))}
                    className="w-full accent-emerald-500 cursor-pointer"
                  />
                </div>
              )}

              {/* Window Duration Slider */}
              {(selectedAlgo === 'fixedWindow' || selectedAlgo === 'slidingLog' || selectedAlgo === 'slidingCounter') && (
                <div className="space-y-1.5 font-mono text-xs">
                  <div className="flex justify-between">
                    <span className={isDarkMode ? 'text-slate-300' : 'text-slate-700'}>
                      Window Time ($W$):
                    </span>
                    <span className="font-bold text-blue-600 dark:text-cyan-400">{windowSeconds} seconds</span>
                  </div>
                  <input
                    type="range"
                    min={5}
                    max={30}
                    step={5}
                    value={windowSeconds}
                    onChange={(e) => setWindowSeconds(Number(e.target.value))}
                    className="w-full accent-blue-500 cursor-pointer"
                  />
                </div>
              )}

              {/* Single Request Dispatcher Controls */}
              <div className={`p-3.5 rounded-xl border space-y-3 ${
                isDarkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'
              }`}>
                <div className="flex items-center justify-between font-mono text-xs">
                  <span className={`font-bold ${isDarkMode ? 'text-slate-200' : 'text-slate-800'}`}>
                    Dispatch Requests (1-by-1):
                  </span>
                </div>

                <div className="space-y-2">
                  <div className="flex space-x-2">
                    <input
                      type="text"
                      value={customUserId}
                      onChange={(e) => setCustomUserId(e.target.value)}
                      placeholder="User Key (e.g. user_101)..."
                      className={`flex-1 border rounded-lg px-2.5 py-1.5 text-xs font-mono focus:outline-none focus:border-amber-500 ${
                        isDarkMode ? 'bg-[#1c1c1e] border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-900'
                      }`}
                    />
                    <button
                      onClick={() => dispatchRequest()}
                      className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-mono font-bold text-xs rounded-lg shadow-sm flex items-center space-x-1"
                    >
                      <Zap className="w-3.5 h-3.5 fill-current" />
                      <span>+1 Request</span>
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={handleFireBurst}
                      className="py-1.5 bg-amber-600 hover:bg-amber-700 text-white font-mono font-bold text-xs rounded-lg shadow-sm flex items-center justify-center space-x-1"
                    >
                      <Flame className="w-3.5 h-3.5" />
                      <span>Fire Burst (5x)</span>
                    </button>
                    <button
                      onClick={() => setIsAutoStreamActive(!isAutoStreamActive)}
                      className={`py-1.5 font-mono font-bold text-xs rounded-lg shadow-sm flex items-center justify-center space-x-1 transition-all ${
                        isAutoStreamActive
                          ? 'bg-red-600 hover:bg-red-700 text-white'
                          : 'bg-blue-600 hover:bg-blue-700 text-white'
                      }`}
                    >
                      {isAutoStreamActive ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                      <span>{isAutoStreamActive ? 'Stop Stream' : 'Auto Stream'}</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Reset Counters Button */}
              <button
                onClick={handleResetSimulator}
                className={`w-full py-2 rounded-xl border text-xs font-mono font-semibold flex items-center justify-center space-x-2 transition-all ${
                  isDarkMode
                    ? 'border-slate-800 bg-slate-950 text-slate-400 hover:text-white hover:bg-slate-800'
                    : 'border-slate-200 bg-slate-100 text-slate-600 hover:text-slate-900 hover:bg-slate-200'
                }`}
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Reset Simulation Metrics</span>
              </button>
            </div>

            {/* Middle Column: Live Visual Representation of Algorithm State */}
            <div className={`p-5 rounded-2xl border flex flex-col justify-between space-y-4 ${
              isDarkMode ? 'bg-[#1c1c1e]/90 border-slate-800' : 'bg-white border-slate-200 shadow-sm'
            }`}>
              <div className="flex items-center justify-between border-b pb-2 border-slate-200 dark:border-slate-800">
                <div className="flex items-center space-x-2">
                  <Activity className="w-4 h-4 text-emerald-500" />
                  <h3 className={`font-bold text-sm ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                    Internal Engine Visualizer
                  </h3>
                </div>
                <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[10px] font-mono rounded font-bold">
                  LIVE STATE
                </span>
              </div>

              {/* TOKEN BUCKET VISUALIZER */}
              {selectedAlgo === 'tokenBucket' && (
                <div className="space-y-4 my-auto">
                  <div className="text-center space-y-1">
                    <span className="text-3xl font-extrabold text-amber-500 font-mono">
                      {tokens} / {bucketCapacity}
                    </span>
                    <p className={`text-xs ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                      Tokens Available in Bucket (Refills +{refillRate}/sec)
                    </p>
                  </div>

                  {/* Bucket Visual Container */}
                  <div className={`h-40 w-40 mx-auto rounded-b-3xl border-2 border-t-0 border-amber-500/60 p-2 flex flex-wrap-reverse align-content-start gap-1 overflow-hidden shadow-inner relative ${
                    isDarkMode ? 'bg-slate-950' : 'bg-amber-50/40'
                  }`}>
                    {Array.from({ length: Math.floor(tokens) }).map((_, i) => (
                      <div
                        key={i}
                        className="w-7 h-7 rounded-full bg-gradient-to-tr from-amber-500 to-yellow-400 text-slate-900 font-bold text-[10px] flex items-center justify-center shadow-md animate-in zoom-in duration-200"
                      >
                        ⚡
                      </div>
                    ))}
                    {tokens === 0 && (
                      <div className="absolute inset-0 flex items-center justify-center text-red-500 font-mono text-xs font-bold bg-red-500/10 backdrop-blur-xs">
                        BUCKET EMPTY (429)
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* LEAKY BUCKET VISUALIZER */}
              {selectedAlgo === 'leakyBucket' && (
                <div className="space-y-4 my-auto font-mono text-xs">
                  <div className="text-center space-y-1">
                    <span className="text-3xl font-extrabold text-blue-500">
                      {queue.length} / {bucketCapacity}
                    </span>
                    <p className={`text-xs ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                      Requests Queued in Buffer (Leaks 1 req/sec)
                    </p>
                  </div>

                  <div className={`h-40 w-44 mx-auto rounded-2xl border-2 border-blue-500/50 p-2 flex flex-col justify-end gap-1.5 relative overflow-hidden ${
                    isDarkMode ? 'bg-slate-950' : 'bg-blue-50/40'
                  }`}>
                    {queue.map((item, idx) => (
                      <div
                        key={idx}
                        className="w-full py-1 bg-blue-600 text-white rounded-lg text-[10px] text-center font-bold shadow-xs animate-in slide-in-from-top-2 duration-150"
                      >
                        {item}
                      </div>
                    ))}
                    {queue.length === 0 && (
                      <div className="my-auto text-center text-slate-400 text-[11px] italic">
                        Queue Empty (Ready)
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* FIXED WINDOW COUNTER VISUALIZER */}
              {selectedAlgo === 'fixedWindow' && (
                <div className="space-y-4 my-auto font-mono text-xs">
                  <div className="text-center space-y-1">
                    <span className="text-3xl font-extrabold text-purple-500">
                      {fixedCount} / {bucketCapacity}
                    </span>
                    <p className={`text-xs ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                      Requests in Current Fixed Window ({windowSeconds}s)
                    </p>
                  </div>

                  <div className="space-y-2 max-w-xs mx-auto">
                    <div className="flex justify-between text-[11px]">
                      <span className={isDarkMode ? 'text-slate-400' : 'text-slate-600'}>Capacity Limit:</span>
                      <span className="font-bold text-purple-500">{fixedCount >= bucketCapacity ? 'LIMIT REACHED (429)' : `${bucketCapacity - fixedCount} Left`}</span>
                    </div>

                    <div className={`w-full h-5 rounded-full overflow-hidden p-0.5 border ${
                      isDarkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-100 border-slate-300'
                    }`}>
                      <div
                        style={{ width: `${Math.min(100, (fixedCount / bucketCapacity) * 100)}%` }}
                        className={`h-full rounded-full transition-all duration-300 ${
                          fixedCount >= bucketCapacity ? 'bg-red-500' : 'bg-purple-600'
                        }`}
                      />
                    </div>

                    <p className="text-[10px] text-center text-slate-400">
                      Window resets periodically every {windowSeconds} seconds.
                    </p>
                  </div>
                </div>
              )}

              {/* SLIDING WINDOW LOG VISUALIZER */}
              {selectedAlgo === 'slidingLog' && (
                <div className="space-y-3 my-auto font-mono text-xs">
                  <div className="text-center space-y-1">
                    <span className="text-3xl font-extrabold text-cyan-500">
                      {logs.length} / {bucketCapacity}
                    </span>
                    <p className={`text-xs ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                      Active Timestamps in Sliding Window ({windowSeconds}s)
                    </p>
                  </div>

                  <div className={`p-3 rounded-xl border max-h-[140px] overflow-y-auto space-y-1 ${
                    isDarkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'
                  }`}>
                    {logs.length === 0 ? (
                      <div className="text-center text-slate-400 italic py-4">No active request logs in memory</div>
                    ) : (
                      logs.map((ts, idx) => (
                        <div key={idx} className={`p-1.5 rounded flex justify-between items-center text-[10px] ${
                          isDarkMode ? 'bg-[#1c1c1e] text-slate-300' : 'bg-white text-slate-800 shadow-xs'
                        }`}>
                          <span>Log #{idx + 1}</span>
                          <span className="font-bold text-cyan-600 dark:text-cyan-400">{new Date(ts).toLocaleTimeString()}</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}

              {/* SLIDING WINDOW COUNTER VISUALIZER */}
              {selectedAlgo === 'slidingCounter' && (
                <div className="space-y-4 my-auto font-mono text-xs">
                  <div className="text-center space-y-1">
                    <span className="text-2xl font-extrabold text-indigo-500">
                      Weighted Formula Calculation
                    </span>
                    <p className={`text-xs ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                      Combines Previous Window ({prevWindowCount}) + Current Window ({currentWindowCount})
                    </p>
                  </div>

                  <div className={`p-3.5 rounded-xl border space-y-2 text-center ${
                    isDarkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'
                  }`}>
                    <div className="text-[11px] text-slate-400 font-mono">
                      $Count = Current + Prev \times (1 - Overlap\%)$
                    </div>
                    <div className="text-base font-bold text-indigo-600 dark:text-indigo-400">
                      {currentWindowCount} + ({prevWindowCount} × 0.50) = <span className="text-amber-500 font-extrabold">{currentWindowCount + Math.floor(prevWindowCount * 0.5)}</span> / {bucketCapacity}
                    </div>
                  </div>
                </div>
              )}

              {/* Footer Summary Stats */}
              <div className="grid grid-cols-2 gap-2 font-mono text-xs pt-2 border-t border-slate-200 dark:border-slate-800">
                <div className={`p-2.5 rounded-xl border ${
                  isDarkMode ? 'bg-slate-950 border-slate-800' : 'bg-emerald-50/50 border-emerald-200'
                }`}>
                  <span className="text-[10px] block uppercase text-emerald-600 dark:text-emerald-400 font-bold">200 Allowed</span>
                  <span className="text-base font-bold text-emerald-600 dark:text-emerald-400">{totalAllowed}</span>
                </div>
                <div className={`p-2.5 rounded-xl border ${
                  isDarkMode ? 'bg-slate-950 border-slate-800' : 'bg-red-50/50 border-red-200'
                }`}>
                  <span className="text-[10px] block uppercase text-red-600 dark:text-red-400 font-bold">429 Rejected</span>
                  <span className="text-base font-bold text-red-600 dark:text-red-400">{totalRejected}</span>
                </div>
              </div>
            </div>

            {/* Right Column: Real-Time Request Stream Log */}
            <div className={`p-5 rounded-2xl border flex flex-col justify-between space-y-3 ${
              isDarkMode ? 'bg-[#1c1c1e]/90 border-slate-800' : 'bg-white border-slate-200 shadow-sm'
            }`}>
              <div className="flex items-center justify-between border-b pb-2 border-slate-200 dark:border-slate-800">
                <div className="flex items-center space-x-2">
                  <Database className="w-4 h-4 text-amber-500" />
                  <h3 className={`font-bold text-sm ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                    Live HTTP Traffic Log
                  </h3>
                </div>
                <span className={`text-[10px] font-mono ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                  {requestLogs.length} Entries
                </span>
              </div>

              {/* Log Table Container */}
              <div className={`flex-1 max-h-[320px] overflow-y-auto rounded-xl border p-2 space-y-1.5 font-mono text-xs ${
                isDarkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'
              }`}>
                {requestLogs.length === 0 ? (
                  <div className={`text-center py-12 italic text-xs ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                    No requests dispatched yet.<br/>Click "+1 Request" or "Fire Burst" above to test the rate limiter.
                  </div>
                ) : (
                  requestLogs.map((log) => (
                    <div
                      key={log.id}
                      className={`p-2 rounded-lg border transition-all ${
                        log.status === 'ALLOWED'
                          ? isDarkMode ? 'bg-emerald-950/20 border-emerald-800/40 text-emerald-300' : 'bg-emerald-50 border-emerald-200 text-emerald-900'
                          : isDarkMode ? 'bg-red-950/20 border-red-800/40 text-red-300' : 'bg-red-50 border-red-200 text-red-900'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="space-y-0.5">
                          <div className="flex items-center space-x-2">
                            <span className="font-bold">{log.requestId}</span>
                            <span className="text-[10px] opacity-75">({log.userId})</span>
                          </div>
                          <div className="text-[10px] opacity-80">{log.reason}</div>
                          {log.responseHeaders && (
                            <div className="text-[10px] opacity-80 pt-0.5">
                              <span className="font-semibold">Headers:</span>{' '}
                              X-RateLimit-Limit={log.responseHeaders.limit}, X-RateLimit-Remaining={log.responseHeaders.remaining}
                              {log.retryAfterSeconds ? `, Retry-After=${log.retryAfterSeconds}s` : ''}
                            </div>
                          )}
                        </div>

                        <div className="text-right space-y-0.5 shrink-0">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            log.status === 'ALLOWED' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
                          }`}>
                            {log.status === 'ALLOWED' ? '200 OK' : '429 TOO MANY'}
                          </span>
                          <div className="text-[10px] opacity-70">{log.timeString}</div>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

          </div>

        </div>
      )}

      {/* VIEW 2: 5 ALGORITHMS DETAILED BREAKDOWN */}
      {activeTab === 'algorithms' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* 1. Token Bucket */}
            <div className={`p-5 rounded-2xl border space-y-3 ${
              isDarkMode ? 'bg-[#1c1c1e] border-slate-800' : 'bg-white border-slate-200 shadow-sm'
            }`}>
              <div className="flex items-center space-x-2">
                <span className="p-2 bg-amber-500/10 text-amber-500 rounded-lg font-bold font-mono text-xs">01</span>
                <h3 className={`font-bold text-base ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>Token Bucket Algorithm</h3>
              </div>
              <p className={`text-xs leading-relaxed ${isDarkMode ? 'text-slate-300' : 'text-slate-600'}`}>
                A container holds tokens up to capacity $N$. A background process adds $R$ tokens per second. Each request consumes 1 token. If tokens exist, request proceeds; otherwise HTTP 429 is returned.
              </p>
              <div className="space-y-1 text-xs font-mono">
                <div className="text-emerald-600 dark:text-emerald-400 font-bold">✓ Pros: Handles traffic bursts well, low memory footprint O(1).</div>
                <div className="text-amber-600 dark:text-amber-400">⚠ Cons: Hard to tune refill rate R vs capacity N for varying traffic.</div>
              </div>
            </div>

            {/* 2. Leaky Bucket */}
            <div className={`p-5 rounded-2xl border space-y-3 ${
              isDarkMode ? 'bg-[#1c1c1e] border-slate-800' : 'bg-white border-slate-200 shadow-sm'
            }`}>
              <div className="flex items-center space-x-2">
                <span className="p-2 bg-blue-500/10 text-blue-500 rounded-lg font-bold font-mono text-xs">02</span>
                <h3 className={`font-bold text-base ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>Leaky Bucket Algorithm</h3>
              </div>
              <p className={`text-xs leading-relaxed ${isDarkMode ? 'text-slate-300' : 'text-slate-600'}`}>
                Requests enter a FIFO queue of fixed size. Requests are processed at a constant output rate. If queue is full, incoming requests are dropped.
              </p>
              <div className="space-y-1 text-xs font-mono">
                <div className="text-emerald-600 dark:text-emerald-400 font-bold">✓ Pros: Smooths out traffic spikes into steady output stream.</div>
                <div className="text-amber-600 dark:text-amber-400">⚠ Cons: Burst requests fill queue and get delayed; old items block new ones.</div>
              </div>
            </div>

            {/* 3. Fixed Window Counter */}
            <div className={`p-5 rounded-2xl border space-y-3 ${
              isDarkMode ? 'bg-[#1c1c1e] border-slate-800' : 'bg-white border-slate-200 shadow-sm'
            }`}>
              <div className="flex items-center space-x-2">
                <span className="p-2 bg-purple-500/10 text-purple-500 rounded-lg font-bold font-mono text-xs">03</span>
                <h3 className={`font-bold text-base ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>Fixed Window Counter</h3>
              </div>
              <p className={`text-xs leading-relaxed ${isDarkMode ? 'text-slate-300' : 'text-slate-600'}`}>
                Time is divided into fixed intervals (e.g., 1 min). Each request increments a counter. When counter exceeds limit $N$, requests are rejected until the next window resets.
              </p>
              <div className="space-y-1 text-xs font-mono">
                <div className="text-emerald-600 dark:text-emerald-400 font-bold">✓ Pros: extremely simple, minimal memory usage O(1).</div>
                <div className="text-red-600 dark:text-red-400">⚠ Cons: Traffic spike at window boundary can allow 2x limit in short duration.</div>
              </div>
            </div>

            {/* 4. Sliding Window Log */}
            <div className={`p-5 rounded-2xl border space-y-3 ${
              isDarkMode ? 'bg-[#1c1c1e] border-slate-800' : 'bg-white border-slate-200 shadow-sm'
            }`}>
              <div className="flex items-center space-x-2">
                <span className="p-2 bg-cyan-500/10 text-cyan-500 rounded-lg font-bold font-mono text-xs">04</span>
                <h3 className={`font-bold text-base ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>Sliding Window Log</h3>
              </div>
              <p className={`text-xs leading-relaxed ${isDarkMode ? 'text-slate-300' : 'text-slate-600'}`}>
                Tracks timestamp of every request in memory (e.g., Redis Sorted Set). Outdated logs are purged. If log count $\le N$, request is allowed.
              </p>
              <div className="space-y-1 text-xs font-mono">
                <div className="text-emerald-600 dark:text-emerald-400 font-bold">✓ Pros: 100% accurate rate limiting with zero boundary edge bugs.</div>
                <div className="text-red-600 dark:text-red-400">⚠ Cons: High memory consumption O(M) because every log is stored.</div>
              </div>
            </div>

          </div>

          <div className={`p-5 rounded-2xl border space-y-3 ${
            isDarkMode ? 'bg-[#1c1c1e] border-slate-800' : 'bg-white border-slate-200 shadow-sm'
          }`}>
            <div className="flex items-center space-x-2">
              <span className="p-2 bg-indigo-500/10 text-indigo-500 rounded-lg font-bold font-mono text-xs">Production Note</span>
              <h3 className={`font-bold text-base ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>Redis Atomicity: INCR/EXPIRE Race vs Lua Script</h3>
            </div>
            <p className={`text-xs leading-relaxed ${isDarkMode ? 'text-slate-300' : 'text-slate-600'}`}>
              In distributed deployments, two requests can read the same counter before either writes back. Solve this by using an atomic Redis Lua script that
              performs read, compare, increment, and expiry in one operation.
            </p>
            <div className={`p-3 rounded-xl border font-mono text-[11px] ${
              isDarkMode ? 'bg-slate-950 border-slate-800 text-slate-300' : 'bg-slate-50 border-slate-200 text-slate-700'
            }`}>
              Naive flow: GET counter -&gt; compare -&gt; INCR -&gt; EXPIRE (race prone).<br />
              Atomic flow: EVAL Lua(counter_key, limit, ttl_seconds) -&gt; allow/deny + remaining + retry_after.
            </div>
          </div>
        </div>
      )}

      {/* VIEW 3: SYSTEM DESIGN ARCHITECTURE & PLACEMENT */}
      {activeTab === 'concepts' && (
        <div className={`p-6 rounded-2xl border space-y-6 ${
          isDarkMode ? 'bg-[#1c1c1e] border-slate-800 text-slate-200' : 'bg-white border-slate-200 text-slate-800 shadow-sm'
        }`}>
          <div className="space-y-2">
            <h3 className={`text-lg font-bold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
              System Architecture & Rate Limiter Placement
            </h3>
            <p className="text-xs leading-relaxed">
              Before choosing an algorithm, system architects must decide <strong>where</strong> to place the rate limiter in the infrastructure pipeline.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 font-mono text-xs">
            <div className={`p-4 rounded-xl border space-y-2 ${
              isDarkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'
            }`}>
              <span className="text-amber-500 font-bold uppercase">1. Client-Side</span>
              <p className="text-[11px] leading-relaxed">
                Implemented inside mobile/web apps. Unreliable because clients can be compromised or bypassed by attackers.
              </p>
            </div>

            <div className={`p-4 rounded-xl border space-y-2 ${
              isDarkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'
            }`}>
              <span className="text-blue-500 font-bold uppercase">2. Server-Side</span>
              <p className="text-[11px] leading-relaxed">
                Embedded as a middleware component inside app server code. Flexible but consumes web server application CPU.
              </p>
            </div>

            <div className={`p-4 rounded-xl border space-y-2 ${
              isDarkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'
            }`}>
              <span className="text-emerald-500 font-bold uppercase">3. API Gateway</span>
              <p className="text-[11px] leading-relaxed">
                Centralized middleware (e.g., Kong, Envoy, AWS API Gateway) with Redis cache. Blocks malicious traffic at edge before reaching servers.
              </p>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
