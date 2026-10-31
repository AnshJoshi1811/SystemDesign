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

/** Chapter number badge — inverts to black/white on hover */
const ChapterBadge: React.FC<{
  num: number;
  complete: boolean;
  active: boolean;
}> = ({ num, complete, active }) => {
  const [hovered, setHovered] = useState(false);
  const filled = complete || active || hovered;

  return (
    <span
      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-all duration-150"
      style={{
        background: filled ? 'var(--accent)' : 'var(--surface-muted)',
        color: filled ? 'var(--accent-fg)' : 'var(--text-muted)',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      aria-hidden
    >
      {complete ? <Check className="w-3 h-3" strokeWidth={3} /> : num}
    </span>
  );
};

export const Header: React.FC<HeaderProps> = ({ view, onNavigate, isDarkMode, setIsDarkMode }) => {
  const current = view === 'home' ? undefined : chapterById(view);
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !menuRef.current?.contains(e.target as Node))
        setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);

  return (
    <header
      className="sticky top-0 z-50"
      style={{
        background: 'var(--header-bg)',
        borderBottom: '1px solid var(--header-border)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
      }}
    >
      <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center gap-3">

        {/* ── Left: Logo + chapter switcher ── */}
        <div className="flex items-center gap-2 min-w-0 shrink-0">
          {/* Logo */}
          <button
            onClick={() => onNavigate('home')}
            className="flex items-center gap-2.5 shrink-0 rounded-lg px-1.5 py-1 -ml-1.5 transition-colors"
            style={{ color: 'var(--text-base)' }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-muted)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          >
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

          <span className="text-sm" style={{ color: 'var(--text-subtle)' }}>/</span>

          {/* Chapter switcher dropdown */}
          <div className="relative min-w-0" ref={menuRef}>
            <button
              onClick={() => setOpen(o => !o)}
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
              <ChevronDown
                className={`w-4 h-4 shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
                style={{ color: 'var(--text-subtle)' }}
              />
            </button>

            {open && (
              <div
                role="menu"
                className="absolute left-0 mt-2 w-72 rounded-xl p-1.5"
                style={{
                  background: isDarkMode ? '#111' : '#fff',
                  boxShadow: '0 8px 32px rgba(0,0,0,0.14)',
                  border: '1px solid var(--header-border)',
                }}
              >
                {/* Course overview row */}
                <button
                  role="menuitem"
                  onClick={() => { onNavigate('home'); setOpen(false); }}
                  className="w-full flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors"
                  style={{ color: 'var(--text-muted)' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-muted)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  <LayoutGrid className="w-4 h-4 shrink-0" style={{ color: 'var(--text-subtle)' }} />
                  Course overview
                </button>

                <div className="my-1 h-px" style={{ background: 'var(--header-border)' }} />

                {/* Chapter rows */}
                {CHAPTERS.map(c => {
                  const p = readProgress(c.id);
                  const complete = !!(p && p.total > 0 && p.done >= p.total);
                  const isActive = c.id === view;
                  return (
                    <button
                      key={c.id}
                      role="menuitem"
                      onClick={() => { onNavigate(c.id); setOpen(false); }}
                      className="group/row w-full flex items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors"
                      style={{
                        background: isActive ? 'var(--surface-muted)' : 'transparent',
                        color: 'var(--text-base)',
                      }}
                      onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'var(--surface-muted)'; }}
                      onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
                    >
                      <ChapterBadge num={c.num} complete={complete} active={isActive} />
                      <span className="flex-1 truncate">{c.short}</span>
                      {p && p.total > 0 && !complete && (
                        <span className="text-xs tabular-nums shrink-0" style={{ color: 'var(--text-subtle)' }}>
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

        {/* ── Centre: Search ── */}
        <div className="hidden sm:flex flex-1 justify-center px-4 max-w-sm">
          <SearchBar />
        </div>

        {/* ── Right: Dark mode toggle ── */}
        <button
          onClick={() => setIsDarkMode(!isDarkMode)}
          className="shrink-0 rounded-lg p-2 transition-colors ml-auto sm:ml-0"
          style={{ color: 'var(--text-muted)' }}
          onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-muted)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          title={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}
          aria-label={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {isDarkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>
      </div>
    </header>
  );
};
