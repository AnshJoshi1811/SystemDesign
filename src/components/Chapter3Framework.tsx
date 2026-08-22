import React, { useState } from 'react';
import {
  BookOpen,
  HelpCircle,
  Layers,
  Cpu,
  CheckCircle2,
  AlertTriangle,
  Lightbulb,
  Clock,
  MessageSquare,
  ArrowRight,
  ShieldAlert,
  Sparkles,
  RefreshCw,
  ChevronRight,
  Check,
  X,
  FileText,
  Database,
  Server,
  Wifi,
  Zap,
  Award,
  Target,
  Compass,
  Play,
  Flame,
  Layout,
  Share2,
  User,
  Sliders
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface Chapter3FrameworkProps {
  isDarkMode?: boolean;
}

type SectionTab = 
  | 'intro' 
  | 'step1' 
  | 'step2' 
  | 'step3' 
  | 'step4' 
  | 'dos-donts' 
  | 'time-split' 
  | 'simulator';

export const Chapter3Framework: React.FC<Chapter3FrameworkProps> = ({ isDarkMode = false }) => {
  const [activeTab, setActiveTab] = useState<SectionTab>('intro');

  // --- INTERACTIVE SIMULATOR STATE ---
  const [simProblem, setSimProblem] = useState<'newsfeed' | 'urlshortener' | 'chat'>('newsfeed');
  const [simStep, setSimStep] = useState<1 | 2 | 3 | 4 | 5>(1); // 1 to 4 steps + 5 is score report
  
  // Step 1 simulator state
  const [selectedQuestions, setSelectedQuestions] = useState<string[]>([]);
  const [selectedFR, setSelectedFR] = useState<string[]>([]);
  const [selectedNFR, setSelectedNFR] = useState<string[]>([]);
  
  // Step 2 simulator state
  const [selectedComponents, setSelectedComponents] = useState<string[]>([]);
  const [architectureApproved, setArchitectureApproved] = useState<boolean>(false);
  
  // Step 3 simulator state
  const [deepDiveTopics, setDeepDiveTopics] = useState<string[]>([]);
  const [deepDiveAnswers, setDeepDiveAnswers] = useState<Record<string, string>>({});

  // Step 4 simulator state
  const [selectedWrapUpItems, setSelectedWrapUpItems] = useState<string[]>([]);

  // Calculate simulator score
  const calculateScore = () => {
    let score = 0;
    // Step 1: 25 pts
    if (selectedQuestions.length >= 2) score += 10;
    if (selectedFR.length >= 2) score += 8;
    if (selectedNFR.length >= 2) score += 7;

    // Step 2: 25 pts
    if (selectedComponents.length >= 4) score += 15;
    if (architectureApproved) score += 10;

    // Step 3: 25 pts
    if (deepDiveTopics.length >= 2) score += 15;
    if (Object.keys(deepDiveAnswers).length >= 2) score += 10;

    // Step 4: 25 pts
    if (selectedWrapUpItems.length >= 3) score += 25;

    return Math.min(100, score);
  };

  const resetSimulator = () => {
    setSimStep(1);
    setSelectedQuestions([]);
    setSelectedFR([]);
    setSelectedNFR([]);
    setSelectedComponents([]);
    setArchitectureApproved(false);
    setDeepDiveTopics([]);
    setDeepDiveAnswers({});
    setSelectedWrapUpItems([]);
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
                CHAPTER 3
              </span>
              <span className={`text-xs font-mono font-semibold ${isDarkMode ? 'text-amber-400' : 'text-amber-700'}`}>
                System Design Interview Framework
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold tracking-tight">
              A 4-Step Process for Effective System Design Interviews
            </h1>
            <p className={`text-xs sm:text-sm leading-relaxed ${isDarkMode ? 'text-slate-300' : 'text-slate-600'}`}>
              Master how to think like a Senior System Architect. Learn the structured 4-step framework used to lead high-stakes architecture discussions with confidence, clarity, and precision.
            </p>
          </div>

          <button
            onClick={() => setActiveTab('simulator')}
            className="shrink-0 px-5 py-3 bg-gradient-to-r from-amber-500 via-orange-500 to-indigo-600 hover:opacity-95 text-white font-bold rounded-2xl shadow-lg flex items-center space-x-2 text-xs transition-transform active:scale-95"
          >
            <Sparkles className="w-4 h-4" />
            <span>Launch Interview Simulator</span>
          </button>
        </div>
      </div>

      {/* SUB-NAVIGATION TABS */}
      <div className={`flex items-center space-x-1 p-1.5 rounded-2xl border overflow-x-auto no-scrollbar text-xs font-semibold ${
        isDarkMode ? 'bg-[#1c1c1e]/80 border-slate-800' : 'bg-white border-slate-200 shadow-xs'
      }`}>
        {[
          { id: 'intro', label: '1. Introduction & Mindset', icon: BookOpen },
          { id: 'step1', label: '2. Step 1: Understand & Scope', icon: HelpCircle },
          { id: 'step2', label: '3. Step 2: High-Level Design', icon: Layers },
          { id: 'step3', label: '4. Step 3: Deep Dive', icon: Cpu },
          { id: 'step4', label: '5. Step 4: Wrap Up', icon: CheckCircle2 },
          { id: 'dos-donts', label: '6. Dos & Don’ts', icon: AlertTriangle },
          { id: 'time-split', label: '7. Time Allocation', icon: Clock },
          { id: 'simulator', label: '🎮 Interview Simulator', icon: Sparkles, highlight: true },
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
          {/* TAB 1: INTRODUCTION & MINDSET */}
          {/* ========================================================= */}
          {activeTab === 'intro' && (
            <div className="space-y-6">
              
              {/* Core Philosophy Banner */}
              <div className={`p-6 rounded-3xl border space-y-4 ${
                isDarkMode ? 'bg-[#1c1c1e] border-slate-800' : 'bg-white border-slate-200'
              }`}>
                <div className="flex items-center space-x-3">
                  <div className="p-3 bg-amber-500/10 text-amber-500 rounded-2xl border border-amber-500/20">
                    <Lightbulb className="w-6 h-6" />
                  </div>
                  <div>
                    <h2 className={`text-lg font-bold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                      What is a System Design Interview?
                    </h2>
                    <p className="text-xs text-slate-500 font-mono">
                      Evaluating structured problem-solving vs memorized diagrams
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
                  <div className={`p-4 rounded-2xl border space-y-2 ${
                    isDarkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'
                  }`}>
                    <h3 className="font-bold text-xs text-amber-500 font-mono uppercase">1. No Single Correct Answer</h3>
                    <p className={`text-xs leading-relaxed ${isDarkMode ? 'text-slate-300' : 'text-slate-600'}`}>
                      System design is inherently open-ended. Every decision involves trade-offs (e.g. consistency vs latency, cost vs availability). There is no "perfect" blueprint.
                    </p>
                  </div>

                  <div className={`p-4 rounded-2xl border space-y-2 ${
                    isDarkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'
                  }`}>
                    <h3 className="font-bold text-xs text-indigo-500 font-mono uppercase">2. Thinking Process Over Results</h3>
                    <p className={`text-xs leading-relaxed ${isDarkMode ? 'text-slate-300' : 'text-slate-600'}`}>
                      Interviewers evaluate <em>how</em> you analyze problems, navigate ambiguity, evaluate trade-offs, and justify architectural decisions under real constraints.
                    </p>
                  </div>

                  <div className={`p-4 rounded-2xl border space-y-2 ${
                    isDarkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'
                  }`}>
                    <h3 className="font-bold text-xs text-emerald-500 font-mono uppercase">3. Communication = Technical Skill</h3>
                    <p className={`text-xs leading-relaxed ${isDarkMode ? 'text-slate-300' : 'text-slate-600'}`}>
                      System design is a collaborative design session. Silence or silent drawing is a critical failure. You must think out loud and partner with your interviewer.
                    </p>
                  </div>
                </div>
              </div>

              {/* Why Structure Matters */}
              <div className={`p-6 rounded-3xl border space-y-4 ${
                isDarkMode ? 'bg-[#1c1c1e] border-slate-800' : 'bg-white border-slate-200'
              }`}>
                <h3 className={`text-base font-bold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                  Why a Structured Approach is Essential
                </h3>
                <p className={`text-xs leading-relaxed ${isDarkMode ? 'text-slate-300' : 'text-slate-600'}`}>
                  Without a framework, candidates panic and fall into common traps: jumping straight into database schemas, over-engineering irrelevant microservices, or running out of time before addressing core scalability bottlenecks.
                </p>

                {/* 4 Steps Overview Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-2">
                  {[
                    { step: '01', title: 'Understand & Scope', desc: 'Ask clarifying questions, define FR/NFR, estimate scale.', color: 'border-blue-500/40 text-blue-500' },
                    { step: '02', title: 'High-Level Design', desc: 'Draft architecture blueprint, data flow, APIs, get buy-in.', color: 'border-amber-500/40 text-amber-500' },
                    { step: '03', title: 'Design Deep Dive', desc: 'Identify critical bottlenecks, trade-offs, storage, fanout.', color: 'border-indigo-500/40 text-indigo-500' },
                    { step: '04', title: 'Wrap Up', desc: 'Identify SPOF, monitoring, logging, future scaling improvements.', color: 'border-emerald-500/40 text-emerald-500' },
                  ].map((s) => (
                    <div key={s.step} className={`p-4 rounded-2xl border space-y-2 relative ${
                      isDarkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'
                    }`}>
                      <span className={`text-2xl font-black font-mono ${s.color}`}>{s.step}</span>
                      <h4 className={`font-bold text-xs ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>{s.title}</h4>
                      <p className="text-[11px] text-slate-500 leading-relaxed">{s.desc}</p>
                    </div>
                  ))}
                </div>
              </div>

            </div>
          )}

          {/* ========================================================= */}
          {/* TAB 2: STEP 1 - UNDERSTAND & SCOPE */}
          {/* ========================================================= */}
          {activeTab === 'step1' && (
            <div className="space-y-6">
              
              {/* Don't be like Jimmy Story Card */}
              <div className={`p-6 rounded-3xl border space-y-4 ${
                isDarkMode ? 'bg-rose-950/20 border-rose-900/40 text-slate-200' : 'bg-rose-50 border-rose-200 text-slate-800'
              }`}>
                <div className="flex items-center space-x-3">
                  <div className="p-2.5 bg-rose-500/20 text-rose-500 rounded-2xl border border-rose-500/30">
                    <ShieldAlert className="w-6 h-6" />
                  </div>
                  <div>
                    <span className="text-[10px] font-mono text-rose-500 uppercase font-black">COMMON PITFALL</span>
                    <h3 className="text-base font-bold text-rose-600 dark:text-rose-400">
                      The "Don't Be Like Jimmy" Cautionary Tale
                    </h3>
                  </div>
                </div>
                <p className="text-xs leading-relaxed">
                  Jimmy gets the prompt: <em>"Design a News Feed system."</em> Excited, Jimmy instantly grabs the marker and starts drawing Redis clusters, Cassandra databases, and Kafka message queues. 15 minutes later, the interviewer asks: <em>"Wait, is this feed for 100 users or 500 Million DAU? Is it chronological or ML-ranked? Can users post videos?"</em>
                </p>
                <p className="text-xs font-bold text-rose-600 dark:text-rose-300">
                  ⚠️ Result: Jimmy built a solution for the wrong problem. Always clarify requirements first!
                </p>
              </div>

              {/* Requirement Gathering Breakdown */}
              <div className={`p-6 rounded-3xl border space-y-5 ${
                isDarkMode ? 'bg-[#1c1c1e] border-slate-800' : 'bg-white border-slate-200'
              }`}>
                <h3 className={`text-base font-bold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                  Step 1 Checklist: Gathering Scope &amp; Scale
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className={`p-4 rounded-2xl border space-y-2 ${
                    isDarkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'
                  }`}>
                    <h4 className="font-bold text-xs text-blue-500 font-mono uppercase">1. Functional Requirements (FR)</h4>
                    <p className="text-xs text-slate-500">What specific features must the user be able to do?</p>
                    <ul className="text-xs space-y-1 text-slate-400 list-disc list-inside pt-1">
                      <li>User can publish posts with text/images.</li>
                      <li>User can see friends' posts in their News Feed.</li>
                      <li>Feed sorted chronologically or by engagement score.</li>
                    </ul>
                  </div>

                  <div className={`p-4 rounded-2xl border space-y-2 ${
                    isDarkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'
                  }`}>
                    <h4 className="font-bold text-xs text-amber-500 font-mono uppercase">2. Non-Functional Requirements (NFR)</h4>
                    <p className="text-xs text-slate-500">What operational constraints define system quality?</p>
                    <ul className="text-xs space-y-1 text-slate-400 list-disc list-inside pt-1">
                      <li>High availability (99.99% uptime).</li>
                      <li>Low feed generation latency (&lt; 200ms).</li>
                      <li>Eventual consistency ok for feeds vs strict consistency for payments.</li>
                    </ul>
                  </div>
                </div>

                {/* News Feed Interview Dialogue Example */}
                <div className={`p-4 rounded-2xl border space-y-3 ${
                  isDarkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'
                }`}>
                  <h4 className={`font-bold text-xs font-mono uppercase ${isDarkMode ? 'text-amber-400' : 'text-amber-700'}`}>
                    Real Interview Dialogue: "Design a News Feed"
                  </h4>

                  <div className="space-y-2 text-xs font-mono">
                    <div className="p-2.5 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400">
                      <strong>Candidate:</strong> "Is this a mobile app or web app? How many daily active users (DAU) are we targeting?"
                      <span className="block text-[10px] text-slate-400 font-sans mt-1">
                        💡 <em>Why candidate asks:</em> Mobile bandwidth constraints impact media compression &amp; pagination strategy; DAU dictates QPS and caching layer sizing.
                      </span>
                    </div>

                    <div className="p-2.5 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-400">
                      <strong>Interviewer:</strong> "500 Million DAU. Both mobile and web."
                    </div>

                    <div className="p-2.5 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400">
                      <strong>Candidate:</strong> "Can feed items contain media like high-res images and videos, or text only?"
                      <span className="block text-[10px] text-slate-400 font-sans mt-1">
                        💡 <em>Why candidate asks:</em> Video content requires CDN blob storage, transcoder workers, and chunked streaming.
                      </span>
                    </div>
                  </div>
                </div>
              </div>

            </div>
          )}

          {/* ========================================================= */}
          {/* TAB 3: STEP 2 - HIGH-LEVEL DESIGN */}
          {/* ========================================================= */}
          {activeTab === 'step2' && (
            <div className="space-y-6">
              
              <div className={`p-6 rounded-3xl border space-y-4 ${
                isDarkMode ? 'bg-[#1c1c1e] border-slate-800' : 'bg-white border-slate-200'
              }`}>
                <h3 className={`text-base font-bold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                  Step 2: Propose High-Level Design &amp; Get Buy-In
                </h3>
                <p className={`text-xs leading-relaxed ${isDarkMode ? 'text-slate-300' : 'text-slate-600'}`}>
                  Draw a high-level blueprint that acts as an agreed contract between you and the interviewer. Separate concerns logically before diving into database indexes or code.
                </p>

                {/* News Feed Architecture Division Example */}
                <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 space-y-3">
                  <h4 className="font-bold text-xs text-amber-600 dark:text-amber-400 uppercase font-mono">
                    Architectural Insight: Decoupling News Feed into 2 Core Flows
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                    <div className={`p-3 rounded-xl border ${isDarkMode ? 'bg-slate-950 border-slate-800' : 'bg-white border-slate-200'}`}>
                      <h5 className="font-bold text-blue-500 mb-1">1. Feed Publishing Flow</h5>
                      <p className="text-[11px] text-slate-500">
                        When a user posts content, it writes to DB/cache and triggers fanout services to push the post to followers' cache.
                      </p>
                    </div>
                    <div className={`p-3 rounded-xl border ${isDarkMode ? 'bg-slate-950 border-slate-800' : 'bg-white border-slate-200'}`}>
                      <h5 className="font-bold text-indigo-500 mb-1">2. News Feed Building Flow</h5>
                      <p className="text-[11px] text-slate-500">
                        When a user opens the app, the client requests <code>GET /v1/me/feed</code>, fetching pre-computed feed IDs directly from Redis cache.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Interactive High-Level Architecture Flowchart */}
                <div className={`p-4 rounded-2xl border space-y-3 ${
                  isDarkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'
                }`}>
                  <h4 className="font-bold text-xs text-slate-500 uppercase font-mono">
                    Visual Blueprint: Feed Publishing &amp; Reading Flow
                  </h4>

                  <div className="flex flex-col md:flex-row items-center justify-between gap-3 text-center text-xs font-mono py-2">
                    {/* Client */}
                    <div className="p-3 bg-blue-500/10 border border-blue-500/30 text-blue-500 rounded-xl w-full md:w-32">
                      <User className="w-4 h-4 mx-auto mb-1" />
                      Client App
                    </div>

                    <ArrowRight className="w-4 h-4 text-slate-400 shrink-0 hidden md:block" />

                    {/* Load Balancer */}
                    <div className="p-3 bg-purple-500/10 border border-purple-500/30 text-purple-500 rounded-xl w-full md:w-36">
                      <Wifi className="w-4 h-4 mx-auto mb-1" />
                      Load Balancer
                    </div>

                    <ArrowRight className="w-4 h-4 text-slate-400 shrink-0 hidden md:block" />

                    {/* Web Servers */}
                    <div className="p-3 bg-indigo-500/10 border border-indigo-500/30 text-indigo-500 rounded-xl w-full md:w-36">
                      <Server className="w-4 h-4 mx-auto mb-1" />
                      Web Servers
                    </div>

                    <ArrowRight className="w-4 h-4 text-slate-400 shrink-0 hidden md:block" />

                    {/* Cache & DB */}
                    <div className="p-3 bg-amber-500/10 border border-amber-500/30 text-amber-500 rounded-xl w-full md:w-44">
                      <Database className="w-4 h-4 mx-auto mb-1" />
                      Redis Cache + DB
                    </div>
                  </div>
                </div>
              </div>

            </div>
          )}

          {/* ========================================================= */}
          {/* TAB 4: STEP 3 - DESIGN DEEP DIVE */}
          {/* ========================================================= */}
          {activeTab === 'step3' && (
            <div className="space-y-6">
              
              <div className={`p-6 rounded-3xl border space-y-4 ${
                isDarkMode ? 'bg-[#1c1c1e] border-slate-800' : 'bg-white border-slate-200'
              }`}>
                <h3 className={`text-base font-bold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                  Step 3: Design Deep Dive &amp; Bottleneck Analysis
                </h3>
                <p className={`text-xs leading-relaxed ${isDarkMode ? 'text-slate-300' : 'text-slate-600'}`}>
                  After establishing the high-level blueprint, zero in on the 2–3 most critical components or bottlenecks. Address trade-offs explicitly!
                </p>

                {/* Deep Dive Examples Grid */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  
                  {/* News Feed Deep Dive */}
                  <div className={`p-4 rounded-2xl border space-y-2 ${
                    isDarkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'
                  }`}>
                    <span className="text-[10px] font-mono font-bold text-amber-500 uppercase">Example A: News Feed</span>
                    <h4 className={`font-bold text-xs ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>Fanout-on-Write vs Fanout-on-Read</h4>
                    <p className="text-[11px] text-slate-500 leading-relaxed">
                      Pushing posts to 5M followers when a celebrity tweets causes huge write hot-spots. Solution: Hybrid fanout (Push for normal users, Pull for celebrities).
                    </p>
                  </div>

                  {/* URL Shortener Deep Dive */}
                  <div className={`p-4 rounded-2xl border space-y-2 ${
                    isDarkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'
                  }`}>
                    <span className="text-[10px] font-mono font-bold text-blue-500 uppercase">Example B: URL Shortener</span>
                    <h4 className={`font-bold text-xs ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>Base62 Encoding vs Hashing</h4>
                    <p className="text-[11px] text-slate-500 leading-relaxed">
                      MD5/SHA256 produces hash collisions when truncated. Solution: Base62 conversion combined with a distributed unique ID generator (Snowflake).
                    </p>
                  </div>

                  {/* Chat System Deep Dive */}
                  <div className={`p-4 rounded-2xl border space-y-2 ${
                    isDarkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'
                  }`}>
                    <span className="text-[10px] font-mono font-bold text-emerald-500 uppercase">Example C: Chat System</span>
                    <h4 className={`font-bold text-xs ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>Stateful WebSockets &amp; Presence</h4>
                    <p className="text-[11px] text-slate-500 leading-relaxed">
                      HTTP polling overhead is prohibitive for real-time messaging. Solution: Persistent WebSocket gateway servers with Redis Pub/Sub for cross-node message routing.
                    </p>
                  </div>

                </div>
              </div>

            </div>
          )}

          {/* ========================================================= */}
          {/* TAB 5: STEP 4 - WRAP UP */}
          {/* ========================================================= */}
          {activeTab === 'step4' && (
            <div className="space-y-6">
              
              <div className={`p-6 rounded-3xl border space-y-4 ${
                isDarkMode ? 'bg-[#1c1c1e] border-slate-800' : 'bg-white border-slate-200'
              }`}>
                <h3 className={`text-base font-bold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                  Step 4: Wrap Up &amp; Demonstrating Senior Engineering Maturity
                </h3>
                <p className={`text-xs leading-relaxed ${isDarkMode ? 'text-slate-300' : 'text-slate-600'}`}>
                  The last 3–5 minutes differentiate good candidates from great ones. Show self-awareness by identifying remaining weak spots and future improvements.
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className={`p-4 rounded-2xl border space-y-2 ${
                    isDarkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'
                  }`}>
                    <h4 className="font-bold text-xs text-rose-500 font-mono uppercase">1. Single Point of Failure (SPOF)</h4>
                    <p className="text-xs text-slate-500">
                      Identify components without redundancy (e.g. primary DB master node) and explain failover strategies (Multi-AZ DB replication, virtual IP swapping).
                    </p>
                  </div>

                  <div className={`p-4 rounded-2xl border space-y-2 ${
                    isDarkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'
                  }`}>
                    <h4 className="font-bold text-xs text-emerald-500 font-mono uppercase">2. Observability &amp; Metrics</h4>
                    <p className="text-xs text-slate-500">
                      Mention logging, distributed tracing (Jaeger/Zipkin), and key alert metrics (P99 latency, cache hit ratios, queue backlog lag).
                    </p>
                  </div>
                </div>

                <div className="p-4 bg-indigo-500/10 border border-indigo-500/20 rounded-2xl text-xs space-y-2">
                  <span className="font-bold text-indigo-500 uppercase font-mono">The Million Dollar Closing Question</span>
                  <p className="italic text-slate-400">
                    "If you had another 2 hours or 10x more scale, what would you improve?"
                  </p>
                  <p className="text-slate-300">
                    Sample Answer: <em>"I would add multi-region active-active replication with geo-DNS routing, introduce a dedicated ML feature pipeline for personalized ranking, and implement graceful client degradation during outage spikes."</em>
                  </p>
                </div>
              </div>

            </div>
          )}

          {/* ========================================================= */}
          {/* TAB 6: DOS & DON'TS */}
          {/* ========================================================= */}
          {activeTab === 'dos-donts' && (
            <div className="space-y-6">
              
              <div className={`p-6 rounded-3xl border space-y-4 ${
                isDarkMode ? 'bg-[#1c1c1e] border-slate-800' : 'bg-white border-slate-200'
              }`}>
                <h3 className={`text-base font-bold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                  System Design Interview: Dos and Don'ts
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* DOS */}
                  <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 space-y-3">
                    <h4 className="font-bold text-xs text-emerald-600 dark:text-emerald-400 flex items-center space-x-1 font-mono uppercase">
                      <CheckCircle2 className="w-4 h-4 mr-1" /> DO THIS (BEST PRACTICES)
                    </h4>
                    <ul className="text-xs space-y-2 text-slate-300">
                      <li className="flex items-start space-x-2">
                        <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                        <span><strong>Always clarify requirements:</strong> Never build based on unverified assumptions.</span>
                      </li>
                      <li className="flex items-start space-x-2">
                        <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                        <span><strong>Write down assumptions:</strong> State DAU, QPS, and storage sizes on the board.</span>
                      </li>
                      <li className="flex items-start space-x-2">
                        <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                        <span><strong>Communicate out loud:</strong> Turn silence into an active dialogue with your interviewer.</span>
                      </li>
                      <li className="flex items-start space-x-2">
                        <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                        <span><strong>Propose trade-offs:</strong> Explicitly mention pros &amp; cons for DB choice (SQL vs NoSQL).</span>
                      </li>
                    </ul>
                  </div>

                  {/* DONTS */}
                  <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 space-y-3">
                    <h4 className="font-bold text-xs text-rose-600 dark:text-rose-400 flex items-center space-x-1 font-mono uppercase">
                      <AlertTriangle className="w-4 h-4 mr-1" /> DON'T DO THIS (CRITICAL TRAPS)
                    </h4>
                    <ul className="text-xs space-y-2 text-slate-300">
                      <li className="flex items-start space-x-2">
                        <X className="w-3.5 h-3.5 text-rose-500 shrink-0 mt-0.5" />
                        <span><strong>Don't jump straight to architecture:</strong> Skipping Step 1 is the #1 cause of rejection.</span>
                      </li>
                      <li className="flex items-start space-x-2">
                        <X className="w-3.5 h-3.5 text-rose-500 shrink-0 mt-0.5" />
                        <span><strong>Don't drop buzzwords without justification:</strong> Don't say "Kafka" if standard Redis streams work.</span>
                      </li>
                      <li className="flex items-start space-x-2">
                        <X className="w-3.5 h-3.5 text-rose-500 shrink-0 mt-0.5" />
                        <span><strong>Don't go silent:</strong> Silent drawing for 5+ minutes creates discomfort and misalignments.</span>
                      </li>
                      <li className="flex items-start space-x-2">
                        <X className="w-3.5 h-3.5 text-rose-500 shrink-0 mt-0.5" />
                        <span><strong>Don't get stubborn:</strong> If interviewer gives a hint, adapt immediately!</span>
                      </li>
                    </ul>
                  </div>
                </div>
              </div>

            </div>
          )}

          {/* ========================================================= */}
          {/* TAB 7: TIME ALLOCATION */}
          {/* ========================================================= */}
          {activeTab === 'time-split' && (
            <div className="space-y-6">
              
              <div className={`p-6 rounded-3xl border space-y-4 ${
                isDarkMode ? 'bg-[#1c1c1e] border-slate-800' : 'bg-white border-slate-200'
              }`}>
                <h3 className={`text-base font-bold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                  Time Allocation for a 45-Minute Interview
                </h3>
                <p className={`text-xs leading-relaxed ${isDarkMode ? 'text-slate-300' : 'text-slate-600'}`}>
                  Time management is an essential engineering skill. Here is the optimal breakdown:
                </p>

                <div className="space-y-3 pt-2">
                  {[
                    { step: 'Step 1: Understand & Scope', time: '3 - 5 mins', pct: '10%', color: 'bg-blue-500', desc: 'Ask clarifying questions, define FR / NFR, calculate scale.' },
                    { step: 'Step 2: High-Level Design', time: '10 - 15 mins', pct: '30%', color: 'bg-amber-500', desc: 'Draw end-to-end blueprint, APIs, databases, get interviewer buy-in.' },
                    { step: 'Step 3: Design Deep Dive', time: '10 - 25 mins', pct: '50%', color: 'bg-indigo-500', desc: 'Dive into critical bottlenecks, trade-offs, cache invalidation, fanout strategies.' },
                    { step: 'Step 4: Wrap Up', time: '3 - 5 mins', pct: '10%', color: 'bg-emerald-500', desc: 'Summarize, mention SPOFs, monitoring, and answer "What would you improve?".' },
                  ].map((t) => (
                    <div key={t.step} className={`p-4 rounded-2xl border space-y-2 ${
                      isDarkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'
                    }`}>
                      <div className="flex items-center justify-between text-xs font-bold">
                        <span className={isDarkMode ? 'text-white' : 'text-slate-900'}>{t.step}</span>
                        <span className="font-mono text-amber-500">{t.time} ({t.pct})</span>
                      </div>
                      <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                        <div className={`h-full ${t.color}`} style={{ width: t.pct }}></div>
                      </div>
                      <p className="text-[11px] text-slate-500">{t.desc}</p>
                    </div>
                  ))}
                </div>
              </div>

            </div>
          )}

          {/* ========================================================= */}
          {/* TAB 8: INTERACTIVE INTERVIEW SIMULATOR */}
          {/* ========================================================= */}
          {activeTab === 'simulator' && (
            <div className="space-y-6">
              
              {/* Simulator Outer Box */}
              <div className={`p-6 sm:p-8 rounded-3xl border shadow-xl space-y-6 ${
                isDarkMode ? 'bg-[#1c1c1e] border-slate-800 text-slate-100' : 'bg-white border-slate-200 text-slate-900'
              }`}>
                
                {/* Header & Problem Selector */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b pb-4 border-slate-200 dark:border-slate-800">
                  <div>
                    <div className="flex items-center space-x-2">
                      <Sparkles className="w-5 h-5 text-amber-500" />
                      <h2 className="text-lg font-extrabold tracking-tight">
                        Interactive System Design Interview Simulator
                      </h2>
                    </div>
                    <p className="text-xs text-slate-500 font-mono mt-0.5">
                      Practice applying the 4-Step Framework in a real interview setting!
                    </p>
                  </div>

                  {/* Problem Dropdown */}
                  <div className="flex items-center space-x-2">
                    <span className="text-xs font-mono font-bold text-slate-400">Problem:</span>
                    <select
                      value={simProblem}
                      onChange={(e) => {
                        setSimProblem(e.target.value as any);
                        resetSimulator();
                      }}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold font-mono border focus:outline-none cursor-pointer ${
                        isDarkMode ? 'bg-slate-950 border-slate-800 text-amber-400' : 'bg-slate-100 border-slate-200 text-amber-700'
                      }`}
                    >
                      <option value="newsfeed">📰 Design News Feed (500M DAU)</option>
                      <option value="urlshortener">🔗 Design URL Shortener (TinyURL)</option>
                      <option value="chat">💬 Design Real-time Chat (WhatsApp)</option>
                    </select>
                  </div>
                </div>

                {/* Progress Tracker (Steps 1 -> 2 -> 3 -> 4) */}
                <div className="grid grid-cols-4 gap-2 text-center text-xs font-mono font-bold">
                  {[
                    { num: 1, title: '1. Scope & Scale' },
                    { num: 2, title: '2. High-Level Blueprint' },
                    { num: 3, title: '3. Deep Dive' },
                    { num: 4, title: '4. Wrap Up' },
                  ].map((s) => {
                    const isPassed = simStep > s.num;
                    const isCurrent = simStep === s.num;
                    return (
                      <div
                        key={s.num}
                        className={`p-2.5 rounded-xl border transition-all ${
                          isPassed
                            ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-500'
                            : isCurrent
                            ? 'bg-amber-500 text-slate-950 shadow-md font-black'
                            : isDarkMode
                            ? 'bg-slate-950 border-slate-800 text-slate-500'
                            : 'bg-slate-100 border-slate-200 text-slate-400'
                        }`}
                      >
                        {isPassed ? `✓ ${s.title}` : s.title}
                      </div>
                    );
                  })}
                </div>

                {/* STEP 1 SIMULATOR VIEW */}
                {simStep === 1 && (
                  <div className="space-y-5 animate-in fade-in duration-200">
                    <div className="p-4 rounded-2xl bg-blue-500/10 border border-blue-500/20 text-xs space-y-1">
                      <span className="font-bold text-blue-500 uppercase font-mono">Stage 1: Requirement Gathering</span>
                      <p className="text-slate-300">
                        Interviewer says: <em>"Please design {simProblem === 'newsfeed' ? 'a News Feed system like Facebook' : simProblem === 'urlshortener' ? 'a URL shortener service like TinyURL' : 'a real-time chat application like WhatsApp'}."</em>
                      </p>
                      <p className="text-slate-400 italic">Select clarifying questions and identify FR/NFR before drawing architecture!</p>
                    </div>

                    {/* Clarifying Questions Picker */}
                    <div className="space-y-2">
                      <h3 className="font-bold text-xs uppercase font-mono text-amber-500">Pick Clarifying Questions to Ask Interviewer:</h3>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                        {(simProblem === 'newsfeed'
                          ? [
                              'How many Daily Active Users (DAU) are expected?',
                              'Is the feed chronological or ML-ranked?',
                              'Can users post high-res media/video?',
                              'What is the read-to-write ratio?',
                            ]
                          : simProblem === 'urlshortener'
                          ? [
                              'What is the expected write traffic vs read traffic?',
                              'What should be the character length of the shortened URL?',
                              'Do URLs expire or last forever?',
                              'Are custom aliases allowed?',
                            ]
                          : [
                              'Is this 1-on-1 chat or group chat or both?',
                              'Is message history stored indefinitely?',
                              'Do we need online presence indicators (last seen)?',
                              'What is the max group size?',
                            ]
                        ).map((q) => {
                          const isPicked = selectedQuestions.includes(q);
                          return (
                            <button
                              key={q}
                              onClick={() => {
                                if (isPicked) {
                                  setSelectedQuestions(selectedQuestions.filter((item) => item !== q));
                                } else {
                                  setSelectedQuestions([...selectedQuestions, q]);
                                }
                              }}
                              className={`p-3 rounded-xl border text-left transition-all flex items-start space-x-2 ${
                                isPicked
                                  ? 'bg-amber-500/10 border-amber-500/50 text-amber-500 font-bold'
                                  : isDarkMode
                                  ? 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
                                  : 'bg-slate-50 border-slate-200 text-slate-700 hover:border-slate-300'
                              }`}
                            >
                              <div className={`w-4 h-4 rounded border shrink-0 mt-0.5 flex items-center justify-center ${
                                isPicked ? 'bg-amber-500 border-amber-500 text-slate-950' : 'border-slate-600'
                              }`}>
                                {isPicked && <Check className="w-3 h-3 stroke-[3]" />}
                              </div>
                              <span>{q}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Functional & Non-Functional Requirements */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* FR */}
                      <div className="space-y-2">
                        <h4 className="font-bold text-xs uppercase font-mono text-blue-400">Select Functional Requirements:</h4>
                        {(simProblem === 'newsfeed'
                          ? ['Publish a new post', 'View news feed', 'Add friends / follow']
                          : simProblem === 'urlshortener'
                          ? ['Shorten long URL', 'Redirect short URL to long URL', 'Custom alias']
                          : ['Send 1-on-1 messages', 'Receive push notifications', 'Online presence']
                        ).map((fr) => {
                          const isPicked = selectedFR.includes(fr);
                          return (
                            <button
                              key={fr}
                              onClick={() => {
                                if (isPicked) setSelectedFR(selectedFR.filter((i) => i !== fr));
                                else setSelectedFR([...selectedFR, fr]);
                              }}
                              className={`w-full p-2.5 rounded-xl border text-left text-xs transition-all flex items-center justify-between ${
                                isPicked
                                  ? 'bg-blue-500/10 border-blue-500/40 text-blue-400 font-bold'
                                  : isDarkMode ? 'bg-slate-950 border-slate-800 text-slate-400' : 'bg-slate-50 border-slate-200 text-slate-600'
                              }`}
                            >
                              <span>{fr}</span>
                              {isPicked && <Check className="w-3.5 h-3.5 text-blue-400" />}
                            </button>
                          );
                        })}
                      </div>

                      {/* NFR */}
                      <div className="space-y-2">
                        <h4 className="font-bold text-xs uppercase font-mono text-emerald-400">Select Non-Functional Requirements:</h4>
                        {['High Availability (99.99%)', 'Low Latency (<200ms)', 'High Scalability (500M DAU)', 'Data Consistency'].map((nfr) => {
                          const isPicked = selectedNFR.includes(nfr);
                          return (
                            <button
                              key={nfr}
                              onClick={() => {
                                if (isPicked) setSelectedNFR(selectedNFR.filter((i) => i !== nfr));
                                else setSelectedNFR([...selectedNFR, nfr]);
                              }}
                              className={`w-full p-2.5 rounded-xl border text-left text-xs transition-all flex items-center justify-between ${
                                isPicked
                                  ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-400 font-bold'
                                  : isDarkMode ? 'bg-slate-950 border-slate-800 text-slate-400' : 'bg-slate-50 border-slate-200 text-slate-600'
                              }`}
                            >
                              <span>{nfr}</span>
                              {isPicked && <Check className="w-3.5 h-3.5 text-emerald-400" />}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="pt-3 flex justify-end">
                      <button
                        disabled={selectedQuestions.length === 0}
                        onClick={() => setSimStep(2)}
                        className="px-6 py-3 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold rounded-2xl text-xs flex items-center space-x-2 disabled:opacity-40 transition-all shadow-md"
                      >
                        <span>Proceed to Stage 2: High-Level Blueprint</span>
                        <ArrowRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}

                {/* STEP 2 SIMULATOR VIEW */}
                {simStep === 2 && (
                  <div className="space-y-5 animate-in fade-in duration-200">
                    <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-xs space-y-1">
                      <span className="font-bold text-amber-500 uppercase font-mono">Stage 2: High-Level Architecture Blueprint</span>
                      <p className="text-slate-300">
                        Assemble the core infrastructure components for <strong>{simProblem.toUpperCase()}</strong> and present your blueprint to the interviewer.
                      </p>
                    </div>

                    {/* Component Selector Palette */}
                    <div className="space-y-2">
                      <h3 className="font-bold text-xs uppercase font-mono text-amber-500">Select Blueprint Components:</h3>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-mono">
                        {[
                          { id: 'lb', name: 'Load Balancer (Nginx/ALB)', icon: Wifi },
                          { id: 'gw', name: 'API Gateway', icon: Server },
                          { id: 'app', name: 'Application Servers', icon: Cpu },
                          { id: 'cache', name: 'Redis Cache Cluster', icon: Database },
                          { id: 'db', name: 'Primary DB (Postgres/Cassandra)', icon: Database },
                          { id: 'mq', name: 'Message Queue (Kafka/RabbitMQ)', icon: Share2 },
                          { id: 'worker', name: 'Async Fanout Workers', icon: RefreshCw },
                          { id: 'cdn', name: 'CDN (Cloudflare)', icon: Wifi },
                        ].map((c) => {
                          const Icon = c.icon;
                          const isSelected = selectedComponents.includes(c.id);
                          return (
                            <button
                              key={c.id}
                              onClick={() => {
                                if (isSelected) setSelectedComponents(selectedComponents.filter((i) => i !== c.id));
                                else setSelectedComponents([...selectedComponents, c.id]);
                              }}
                              className={`p-3 rounded-2xl border flex flex-col items-center text-center space-y-2 transition-all ${
                                isSelected
                                  ? 'bg-amber-500/10 border-amber-500 text-amber-500 font-bold shadow-xs'
                                  : isDarkMode ? 'bg-slate-950 border-slate-800 text-slate-400' : 'bg-slate-50 border-slate-200 text-slate-600'
                              }`}
                            >
                              <Icon className="w-5 h-5" />
                              <span className="text-[11px]">{c.name}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Buy-In Confirmation */}
                    <div className={`p-4 rounded-2xl border space-y-3 ${
                      isDarkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'
                    }`}>
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-300">Interviewer Buy-In Status:</span>
                        <button
                          onClick={() => setArchitectureApproved(!architectureApproved)}
                          className={`px-3 py-1.5 rounded-xl text-xs font-bold font-mono transition-all ${
                            architectureApproved
                              ? 'bg-emerald-500 text-white'
                              : 'bg-slate-800 text-slate-400 hover:text-white'
                          }`}
                        >
                          {architectureApproved ? '✓ Architecture Approved' : 'Click to Get Buy-In'}
                        </button>
                      </div>
                      {architectureApproved && (
                        <p className="text-xs text-emerald-400 font-mono">
                          💬 Interviewer: "Looks solid! Let's now dive deeper into the key bottlenecks."
                        </p>
                      )}
                    </div>

                    <div className="pt-3 flex justify-between">
                      <button
                        onClick={() => setSimStep(1)}
                        className="px-4 py-2 bg-slate-800 text-slate-300 font-bold rounded-xl text-xs"
                      >
                        ← Back
                      </button>
                      <button
                        disabled={selectedComponents.length < 3 || !architectureApproved}
                        onClick={() => setSimStep(3)}
                        className="px-6 py-3 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold rounded-2xl text-xs flex items-center space-x-2 disabled:opacity-40 transition-all shadow-md"
                      >
                        <span>Proceed to Stage 3: Deep Dive</span>
                        <ArrowRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}

                {/* STEP 3 SIMULATOR VIEW */}
                {simStep === 3 && (
                  <div className="space-y-5 animate-in fade-in duration-200">
                    <div className="p-4 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-xs space-y-1">
                      <span className="font-bold text-indigo-500 uppercase font-mono">Stage 3: Design Deep Dive</span>
                      <p className="text-slate-300">
                        Pick the critical bottleneck for <strong>{simProblem.toUpperCase()}</strong> and evaluate architectural trade-offs!
                      </p>
                    </div>

                    <div className="space-y-3">
                      <h3 className="font-bold text-xs uppercase font-mono text-indigo-400">Select Deep Dive Focus Area:</h3>
                      
                      {(simProblem === 'newsfeed'
                        ? [
                            { id: 'fanout', title: 'Fanout-on-Write vs Fanout-on-Read for Celebrity Accounts', options: ['Pure Push (Fanout-on-write)', 'Pure Pull (Fanout-on-read)', 'Hybrid Push/Pull Model'] },
                            { id: 'cache', title: 'News Feed Redis Cache Invalidation & Pagination', options: ['Offset-based Pagination', 'Cursor-based Pagination (Timestamp + PostID)'] },
                          ]
                        : simProblem === 'urlshortener'
                        ? [
                            { id: 'encoding', title: 'Short URL Generation Algorithm', options: ['Base62 Conversion + Distributed ID Generator', 'MD5 Hashing + Collision Retries'] },
                            { id: 'db', title: 'Database Selection & Caching', options: ['NoSQL Key-Value Store + Redis LRU Cache', 'Relational Postgres DB without cache'] },
                          ]
                        : [
                            { id: 'ws', title: 'Real-Time Protocol Selection', options: ['WebSockets with Stateful Gateway Workers', 'HTTP Long Polling'] },
                            { id: 'presence', title: 'User Online Presence Syncing', options: ['Heartbeat ping + Redis Key Expiry', 'Database poll every 1s'] },
                          ]
                      ).map((topic) => {
                        return (
                          <div key={topic.id} className={`p-4 rounded-2xl border space-y-3 ${
                            isDarkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'
                          }`}>
                            <h4 className="font-bold text-xs text-amber-500">{topic.title}</h4>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                              {topic.options.map((opt) => {
                                const isPicked = deepDiveAnswers[topic.id] === opt;
                                return (
                                  <button
                                    key={opt}
                                    onClick={() => {
                                      setDeepDiveAnswers({ ...deepDiveAnswers, [topic.id]: opt });
                                      if (!deepDiveTopics.includes(topic.id)) setDeepDiveTopics([...deepDiveTopics, topic.id]);
                                    }}
                                    className={`p-2.5 rounded-xl border text-xs text-left font-mono transition-all ${
                                      isPicked
                                        ? 'bg-indigo-500/20 border-indigo-500 text-indigo-400 font-bold'
                                        : isDarkMode ? 'bg-[#1c1c1e] border-slate-800 text-slate-400' : 'bg-white border-slate-200 text-slate-600'
                                    }`}
                                  >
                                    {opt}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <div className="pt-3 flex justify-between">
                      <button onClick={() => setSimStep(2)} className="px-4 py-2 bg-slate-800 text-slate-300 font-bold rounded-xl text-xs">
                        ← Back
                      </button>
                      <button
                        disabled={Object.keys(deepDiveAnswers).length === 0}
                        onClick={() => setSimStep(4)}
                        className="px-6 py-3 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold rounded-2xl text-xs flex items-center space-x-2 disabled:opacity-40 transition-all shadow-md"
                      >
                        <span>Proceed to Stage 4: Wrap Up</span>
                        <ArrowRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}

                {/* STEP 4 SIMULATOR VIEW */}
                {simStep === 4 && (
                  <div className="space-y-5 animate-in fade-in duration-200">
                    <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-xs space-y-1">
                      <span className="font-bold text-emerald-500 uppercase font-mono">Stage 4: Wrap Up &amp; Self-Critique</span>
                      <p className="text-slate-300">
                        Summarize your system, identify single points of failure (SPOF), and outline future scaling plans.
                      </p>
                    </div>

                    <div className="space-y-2">
                      <h3 className="font-bold text-xs uppercase font-mono text-emerald-400">Select Engineering Maturity Points:</h3>
                      {[
                        'Identify Single Points of Failure (SPOF) & Multi-AZ DB replication',
                        'Define metrics & alerts (P99 Latency, Cache Hit Ratio, Queue Backlog)',
                        'Explain graceful degradation during traffic spikes',
                        'Discuss multi-region active-active deployment plans',
                      ].map((item) => {
                        const isPicked = selectedWrapUpItems.includes(item);
                        return (
                          <button
                            key={item}
                            onClick={() => {
                              if (isPicked) setSelectedWrapUpItems(selectedWrapUpItems.filter((i) => i !== item));
                              else setSelectedWrapUpItems([...selectedWrapUpItems, item]);
                            }}
                            className={`w-full p-3 rounded-xl border text-left text-xs transition-all flex items-center justify-between ${
                              isPicked
                                ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-400 font-bold'
                                : isDarkMode ? 'bg-slate-950 border-slate-800 text-slate-400' : 'bg-slate-50 border-slate-200 text-slate-600'
                            }`}
                          >
                            <span>{item}</span>
                            {isPicked && <Check className="w-4 h-4 text-emerald-400" />}
                          </button>
                        );
                      })}
                    </div>

                    <div className="pt-3 flex justify-between">
                      <button onClick={() => setSimStep(3)} className="px-4 py-2 bg-slate-800 text-slate-300 font-bold rounded-xl text-xs">
                        ← Back
                      </button>
                      <button
                        onClick={() => setSimStep(5)}
                        className="px-6 py-3 bg-gradient-to-r from-amber-500 via-orange-500 to-indigo-600 text-white font-black rounded-2xl text-xs flex items-center space-x-2 transition-all shadow-lg"
                      >
                        <Award className="w-4 h-4" />
                        <span>Generate Interview Score &amp; Feedback</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* STEP 5 REPORT VIEW */}
                {simStep === 5 && (
                  <div className="space-y-6 animate-in zoom-in-95 duration-200 text-center">
                    <div className="p-6 rounded-3xl bg-gradient-to-br from-amber-500/10 via-orange-500/10 to-indigo-500/10 border border-amber-500/30 space-y-3">
                      <Award className="w-12 h-12 text-amber-500 mx-auto" />
                      <h3 className="text-2xl font-black">Interview Assessment Report</h3>
                      <div className="text-4xl font-black font-mono text-amber-500">
                        {calculateScore()} <span className="text-base text-slate-400 font-normal">/ 100 PTS</span>
                      </div>
                      <p className="text-xs text-slate-300 max-w-md mx-auto leading-relaxed">
                        {calculateScore() >= 80
                          ? '🎉 Outstanding candidate performance! You followed the 4-Step Framework systematically, clarified requirements before drawing, justified trade-offs, and demonstrated senior engineering maturity.'
                          : '👍 Good effort! Remember to ask more clarifying questions in Step 1 and explicitly address SPOFs in Step 4.'}
                      </p>
                    </div>

                    <div className="flex justify-center space-x-3">
                      <button
                        onClick={resetSimulator}
                        className="px-6 py-3 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-2xl text-xs flex items-center space-x-2"
                      >
                        <RefreshCw className="w-4 h-4" />
                        <span>Try Another Design Problem</span>
                      </button>
                    </div>
                  </div>
                )}

              </div>

            </div>
          )}

        </motion.div>
      </AnimatePresence>

    </div>
  );
};
