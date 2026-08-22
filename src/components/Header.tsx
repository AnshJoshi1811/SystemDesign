import React from 'react';
import { ModuleType } from '../types';
import { Pause, Play, RefreshCw, Sun, Moon } from 'lucide-react';

interface HeaderProps {
  activeModule: ModuleType;
  setActiveModule: (module: ModuleType) => void;
  onReset: () => void;
  speed: number;
  setSpeed: (speed: number) => void;
  isPlaying: boolean;
  setIsPlaying: (isPlaying: boolean) => void;
  isDarkMode?: boolean;
  setIsDarkMode?: (dark: boolean) => void;
}

const ch5 = ['module0', 'module1', 'module2', 'comparison'];

const chapters = [
  { id: 'chapter1'  as ModuleType, num: '01', label: 'Scale 0 \u2192 1M' },
  { id: 'chapter2'  as ModuleType, num: '02', label: 'Estimation' },
  { id: 'chapter3'  as ModuleType, num: '03', label: 'Framework' },
  { id: 'rateLimiter' as ModuleType, num: '04', label: 'Rate Limiter' },
  { id: 'module0'   as ModuleType, num: '05', label: 'Hashing' },
  { id: 'module1'   as ModuleType, num: '05', label: 'Ring' },
  { id: 'module2'   as ModuleType, num: '05', label: 'VNodes' },
  { id: 'comparison' as ModuleType, num: '05', label: 'Lab' },
  { id: 'chapter6'  as ModuleType, num: '06', label: 'Key-Value Store' },
  { id: 'chapter7'  as ModuleType, num: '07', label: 'Unique ID' },
  { id: 'chapter8'  as ModuleType, num: '08', label: 'URL Shortener' },
];

const iconBtn = (dark: boolean) =>
  `p-1.5 rounded transition-colors ${dark
    ? 'text-white/40 hover:text-white/80 hover:bg-white/[0.06]'
    : 'text-slate-400 hover:text-slate-700 hover:bg-slate-100'}`;

export const Header: React.FC<HeaderProps> = ({
  activeModule,
  setActiveModule,
  onReset,
  speed,
  setSpeed,
  isPlaying,
  setIsPlaying,
  isDarkMode = true,
  setIsDarkMode,
}) => {
  return (
    <header className={`sticky top-0 z-50 ${
      isDarkMode
        ? 'bg-[#111113]/95 border-b border-white/[0.06]'
        : 'bg-white/95 border-b border-slate-200'
    } backdrop-blur-md`}>

      {/* ── Brand row ── */}
      <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8 h-11 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className={`text-[10px] font-black tracking-widest px-1.5 py-0.5 rounded-sm ${
            isDarkMode ? 'bg-white text-black' : 'bg-[#1c1c1e] text-white'
          }`}>SD</span>
          <span className={`text-sm font-semibold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
            System Design
          </span>
          <span className={`text-[11px] hidden sm:inline ${isDarkMode ? 'text-white/25' : 'text-slate-400'}`}>
            Ch. 1\u20138 \u00b7 Alex Xu
          </span>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-1">
          <select
            value={String(speed)}
            onChange={(e) => setSpeed(Number(e.target.value))}
            className={`text-[11px] rounded px-1.5 py-1 border mr-1 ${
              isDarkMode
                ? 'border-white/10 bg-white/[0.05] text-white/60 hover:text-white/90'
                : 'border-slate-300 bg-slate-50 text-slate-600'
            }`}
          >
            <option value="0.5">0.5x</option>
            <option value="1">1x</option>
            <option value="2">2x</option>
          </select>

          <button onClick={() => setIsPlaying(!isPlaying)} className={iconBtn(isDarkMode)} title={isPlaying ? 'Pause' : 'Play'}>
            {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
          </button>
          <button onClick={onReset} className={iconBtn(isDarkMode)} title="Reset">
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
          {setIsDarkMode && (
            <button onClick={() => setIsDarkMode(!isDarkMode)} className={iconBtn(isDarkMode)} title={isDarkMode ? 'Light' : 'Dark'}>
              {isDarkMode ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
            </button>
          )}
        </div>
      </div>

      {/* ── Chapter tabs row ── */}
      <div className={`border-t ${isDarkMode ? 'border-white/[0.04]' : 'border-slate-100'}`}>
        <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8">
          <nav className="flex items-end overflow-x-auto no-scrollbar -mb-px">
            {chapters.map((ch, i) => {
              const isActive = activeModule === ch.id;
              const prevIsCh5 = i > 0 && ch.num === '05' && chapters[i - 1].num !== '05';
              const isCh5First = ch.num === '05' && (i === 0 || chapters[i - 1].num !== '05');

              return (
                <React.Fragment key={ch.id}>
                  {/* Ch.5 group start: separator + group label */}
                  {isCh5First && (
                    <div className={`flex items-center self-center mx-1 gap-1 shrink-0 ${
                      isDarkMode ? 'text-white/20' : 'text-slate-300'
                    }`}>
                      <div className="w-px h-4 bg-current" />
                    </div>
                  )}

                  <button
                    onClick={() => setActiveModule(ch.id)}
                    className={`group relative flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium whitespace-nowrap transition-colors border-b-2 ${
                      isActive
                        ? isDarkMode
                          ? 'border-amber-400 text-white'
                          : 'border-amber-500 text-slate-900'
                        : isDarkMode
                        ? 'border-transparent text-white/35 hover:text-white/70'
                        : 'border-transparent text-slate-400 hover:text-slate-700'
                    }`}
                  >
                    <span className={`text-[9px] font-mono font-bold rounded px-1 py-px transition-colors ${
                      isActive
                        ? isDarkMode ? 'bg-amber-400/20 text-amber-400' : 'bg-amber-100 text-amber-600'
                        : isDarkMode ? 'bg-white/[0.04] text-white/25' : 'bg-slate-100 text-slate-400'
                    }`}>{ch.num}</span>
                    {ch.label}
                  </button>

                  {/* Separator after Ch.5 group */}
                  {ch.num === '05' && (i === chapters.length - 1 || chapters[i + 1]?.num !== '05') && (
                    <div className={`flex items-center self-center mx-1 shrink-0 ${isDarkMode ? 'text-white/20' : 'text-slate-300'}`}>
                      <div className="w-px h-4 bg-current" />
                    </div>
                  )}
                </React.Fragment>
              );
            })}
          </nav>
        </div>
      </div>
    </header>
  );
};

