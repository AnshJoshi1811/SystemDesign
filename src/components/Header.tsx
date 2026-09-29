import React, { useEffect, useRef, useState } from 'react';
import { Sun, Moon, ChevronDown, LayoutGrid, Check } from 'lucide-react';
import { CHAPTERS, chapterById, readProgress } from '../chapters';
import { View } from './lesson/ChapterPlayer';

interface HeaderProps {
  view: View;
  onNavigate: (v: View) => void;
  isDarkMode: boolean;
  setIsDarkMode: (dark: boolean) => void;
}

export const Header: React.FC<HeaderProps> = ({ view, onNavigate, isDarkMode, setIsDarkMode }) => {
  const current = view === 'home' ? undefined : chapterById(view);
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !menuRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);

  return (
    <header className="sticky top-0 z-50 border-b border-slate-200/80 bg-white/90 backdrop-blur-md dark:border-white/[0.06] dark:bg-[#0c0c0e]/90">
      <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <button onClick={() => onNavigate('home')} className="flex items-center gap-2.5 shrink-0 rounded-lg px-1.5 py-1 -ml-1.5 hover:bg-slate-100 dark:hover:bg-white/[0.06]">
            <span className="rounded-md bg-slate-900 px-1.5 py-0.5 text-[11px] font-black tracking-widest text-white dark:bg-white dark:text-black">SD</span>
            <span className="hidden sm:inline text-sm font-semibold text-slate-900 dark:text-white">System Design</span>
          </button>

          {/* Chapter switcher */}
          <div className="relative min-w-0" ref={menuRef}>
            <button
              onClick={() => setOpen((o) => !o)}
              aria-haspopup="menu"
              aria-expanded={open}
              className="flex items-center gap-1.5 min-w-0 rounded-lg px-2.5 py-1.5 text-sm text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/[0.06]"
            >
              <span className="text-slate-300 dark:text-slate-600">/</span>
              {current ? (
                <span className="truncate">
                  <span className="text-slate-400 dark:text-slate-500">Ch {current.num}</span>{' '}
                  <span className="font-medium text-slate-900 dark:text-white">{current.short}</span>
                </span>
              ) : (
                <span className="font-medium text-slate-900 dark:text-white">All chapters</span>
              )}
              <ChevronDown className="w-4 h-4 shrink-0 text-slate-400" />
            </button>

            {open && (
              <div role="menu" className="absolute left-0 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-xl bg-white p-1.5 shadow-xl ring-1 ring-slate-200 dark:bg-[#18181b] dark:ring-white/10">
                <button
                  role="menuitem"
                  onClick={() => {
                    onNavigate('home');
                    setOpen(false);
                  }}
                  className="w-full flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-white/[0.06]"
                >
                  <LayoutGrid className="w-4 h-4 text-slate-400" />
                  Course overview
                </button>
                <div className="my-1 h-px bg-slate-100 dark:bg-white/10" />
                {CHAPTERS.map((c) => {
                  const p = readProgress(c.id);
                  const complete = p && p.total > 0 && p.done >= p.total;
                  return (
                    <button
                      key={c.id}
                      role="menuitem"
                      onClick={() => {
                        onNavigate(c.id);
                        setOpen(false);
                      }}
                      className={`w-full flex items-center gap-3 rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-100 dark:hover:bg-white/[0.06] ${
                        c.id === view ? 'bg-indigo-50 dark:bg-indigo-400/[0.1]' : ''
                      }`}
                    >
                      <span
                        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                          complete ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300'
                        }`}
                      >
                        {complete ? <Check className="w-3 h-3" strokeWidth={3} /> : c.num}
                      </span>
                      <span className="flex-1 text-slate-800 dark:text-slate-100">{c.short}</span>
                      {p && p.total > 0 && !complete && (
                        <span className="text-xs tabular-nums text-slate-400">
                          {p.done}/{p.total}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <button
          onClick={() => setIsDarkMode(!isDarkMode)}
          className="shrink-0 rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-white/[0.06] dark:hover:text-white"
          title={isDarkMode ? 'Switch to light theme' : 'Switch to dark theme'}
          aria-label={isDarkMode ? 'Switch to light theme' : 'Switch to dark theme'}
        >
          {isDarkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>
      </div>
    </header>
  );
};
