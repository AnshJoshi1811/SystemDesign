import React from 'react';
import { ModuleType } from '../types';
import { RotateCcw, Sun, Moon } from 'lucide-react';

interface HeaderProps {
  activeModule: ModuleType;
  setActiveModule: (module: ModuleType) => void;
  onReset: () => void;
  isDarkMode?: boolean;
  setIsDarkMode?: (dark: boolean) => void;
}

export const CHAPTERS: { id: ModuleType; num: string; label: string }[] = [
  { id: 'chapter1', num: '01', label: 'Scale 0 → 1M' },
  { id: 'chapter2', num: '02', label: 'Estimation' },
  { id: 'chapter3', num: '03', label: 'Framework' },
  { id: 'rateLimiter', num: '04', label: 'Rate Limiter' },
  { id: 'chapter5', num: '05', label: 'Consistent Hashing' },
  { id: 'chapter6', num: '06', label: 'Key-Value Store' },
  { id: 'chapter7', num: '07', label: 'Unique ID' },
  { id: 'chapter8', num: '08', label: 'URL Shortener' },
];

const iconBtn = (dark: boolean) =>
  `flex items-center gap-1.5 px-2 py-1.5 rounded text-xs transition-colors ${dark
    ? 'text-white/60 hover:text-white hover:bg-white/[0.06]'
    : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100'}`;

export const Header: React.FC<HeaderProps> = ({
  activeModule,
  setActiveModule,
  onReset,
  isDarkMode = false,
  setIsDarkMode,
}) => {
  const idx = CHAPTERS.findIndex((c) => c.id === activeModule);

  return (
    <header className={`sticky top-0 z-50 ${
      isDarkMode
        ? 'bg-[#111113]/95 border-b border-white/[0.06]'
        : 'bg-white/95 border-b border-slate-200'
    } backdrop-blur-md`}>

      {/* ── Brand row ── */}
      <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8 h-11 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className={`text-[11px] font-black tracking-widest px-1.5 py-0.5 rounded-sm ${
            isDarkMode ? 'bg-white text-black' : 'bg-[#1c1c1e] text-white'
          }`}>SD</span>
          <span className={`text-sm font-semibold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
            System Design
          </span>
          <span className={`text-xs hidden sm:inline ${isDarkMode ? 'text-white/50' : 'text-slate-500'}`}>
            Chapter {idx + 1} of {CHAPTERS.length} · Alex Xu
          </span>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-1">
          <button onClick={onReset} className={iconBtn(isDarkMode)} title="Reset this chapter's progress">
            <RotateCcw className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Reset chapter</span>
          </button>
          {setIsDarkMode && (
            <button
              onClick={() => setIsDarkMode(!isDarkMode)}
              className={iconBtn(isDarkMode)}
              title={isDarkMode ? 'Switch to light theme' : 'Switch to dark theme'}
              aria-label={isDarkMode ? 'Switch to light theme' : 'Switch to dark theme'}
            >
              {isDarkMode ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
            </button>
          )}
        </div>
      </div>

      {/* ── Chapter tabs row ── */}
      <div className={`border-t ${isDarkMode ? 'border-white/[0.04]' : 'border-slate-100'}`}>
        <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8">
          <nav className="flex items-end overflow-x-auto no-scrollbar -mb-px" aria-label="Chapters">
            {CHAPTERS.map((ch) => {
              const isActive = activeModule === ch.id;
              return (
                <button
                  key={ch.id}
                  onClick={() => setActiveModule(ch.id)}
                  aria-current={isActive ? 'page' : undefined}
                  className={`group relative flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium whitespace-nowrap transition-colors border-b-2 ${
                    isActive
                      ? isDarkMode
                        ? 'border-amber-400 text-white'
                        : 'border-amber-500 text-slate-900'
                      : isDarkMode
                      ? 'border-transparent text-white/50 hover:text-white/80'
                      : 'border-transparent text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <span className={`text-[11px] font-mono font-bold rounded px-1 py-px transition-colors ${
                    isActive
                      ? isDarkMode ? 'bg-amber-400/20 text-amber-400' : 'bg-amber-100 text-amber-700'
                      : isDarkMode ? 'bg-white/[0.06] text-white/50' : 'bg-slate-100 text-slate-500'
                  }`}>{ch.num}</span>
                  {ch.label}
                </button>
              );
            })}
          </nav>
        </div>
      </div>
    </header>
  );
};
