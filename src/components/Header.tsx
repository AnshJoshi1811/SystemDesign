import React, { useEffect, useRef, useState } from 'react';
import { Sun, Moon, ChevronDown, LayoutGrid, Check } from 'lucide-react';
import { CHAPTERS, chapterById, readProgress } from '../chapters';
import { View } from './lesson/ChapterPlayer';
import { SearchBar } from './SearchBar';

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
    <header className="sticky top-0 z-50" style={{ background: 'var(--header-bg)', borderBottom: '1px solid var(--header-border)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}>
      <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between gap-3">
        {/* Logo + chapter switcher */}
        <div className="flex items-center gap-2 min-w-0">
          <button
            onClick={() => onNavigate('home')}
            className="flex items-center gap-2.5 shrink-0 rounded-lg px-1.5 py-1 -ml-1.5 transition-colors"
            style={{ color: 'var(--text-base)' }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-muted)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          >
            {/* SD wordmark — black pill, mirrors OpenClaw's horizontal brand mark approach */}
            <span
              className="rounded-md px-2 py-0.5 text-[11px] font-black tracking-[0.18em]"
              style={{ background: 'var(--accent)', color: 'var(--accent-fg)' }}
            >
              SD
            </span>
            <span className="hidden sm:inline text-sm font-semibold" style={{ color: 'var(--text-base)' }}>
              System Design
            </span>
          </button>

          {/* Breadcrumb divider */}
          <span className="text-sm" style={{ color: 'var(--text-subtle)' }}>/</span>

          {/* Chapter switcher */}
          <div className="relative min-w-0" ref={menuRef}>
            <button
              onClick={() => setOpen((o) => !o)}
              aria-haspopup="menu"
              aria-expanded={open}
              className="flex items-center gap-1.5 min-w-0 rounded-lg px-2.5 py-1.5 text-sm transition-colors"
              style={{ color: 'var(--text-muted)' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-muted)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              {current ? (
                <span className="truncate">
                  <span style={{ color: 'var(--text-subtle)' }}>Ch {current.num}</span>{' '}
                  <span className="font-medium" style={{ color: 'var(--text-base)' }}>{current.short}</span>
                </span>
              ) : (
                <span className="font-medium" style={{ color: 'var(--text-base)' }}>All chapters</span>
              )}
              <ChevronDown className="w-4 h-4 shrink-0" style={{ color: 'var(--text-subtle)' }} />
            </button>

            {open && (
              <div
                role="menu"
                className="absolute left-0 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-xl p-1.5"
                style={{
                  background: isDarkMode ? '#111111' : '#ffffff',
                  boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
                  border: '1px solid var(--header-border)',
                }}
              >
                <button
                  role="menuitem"
                  onClick={() => { onNavigate('home'); setOpen(false); }}
                  className="w-full flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors"
                  style={{ color: 'var(--text-muted)' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-muted)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  <LayoutGrid className="w-4 h-4" style={{ color: 'var(--text-subtle)' }} />
                  Course overview
                </button>
                <div className="my-1 h-px" style={{ background: 'var(--header-border)' }} />
                {CHAPTERS.map((c) => {
                  const p = readProgress(c.id);
                  const complete = p && p.total > 0 && p.done >= p.total;
                  const isActive = c.id === view;
                  return (
                    <button
                      key={c.id}
                      role="menuitem"
                      onClick={() => { onNavigate(c.id); setOpen(false); }}
                      className="w-full flex items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors"
                      style={{
                        background: isActive ? 'var(--surface-muted)' : 'transparent',
                        color: 'var(--text-base)',
                      }}
                      onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'var(--surface-muted)'; }}
                      onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
                    >
                      <span
                        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold"
                        style={{
                          background: complete ? 'var(--accent)' : 'var(--surface-muted)',
                          color: complete ? 'var(--accent-fg)' : 'var(--text-muted)',
                        }}
                      >
                        {complete ? <Check className="w-3 h-3" strokeWidth={3} /> : c.num}
                      </span>
                      <span className="flex-1">{c.short}</span>
                      {p && p.total > 0 && !complete && (
                        <span className="text-xs tabular-nums" style={{ color: 'var(--text-subtle)' }}>
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

        {/* Search */}
        <div className="flex-1 flex justify-center px-2 max-w-xs hidden sm:flex">
          <SearchBar />
        </div>

        {/* Dark mode toggle */}
        <button
          onClick={() => setIsDarkMode(!isDarkMode)}
          className="shrink-0 rounded-lg p-2 transition-colors"
          style={{ color: 'var(--text-muted)' }}
          onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-muted)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          title={isDarkMode ? 'Switch to light theme' : 'Switch to dark theme'}
          aria-label={isDarkMode ? 'Switch to light theme' : 'Switch to dark theme'}
        >
          {isDarkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>
      </div>
    </header>
  );
};
