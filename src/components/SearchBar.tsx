import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Search, X, BookOpen, Layers, Cpu } from 'lucide-react';
import { search, SearchResult } from '../lib/searchIndex';
import { useNav } from './lesson/ChapterPlayer';

const TYPE_ICON: Record<SearchResult['type'], React.ReactNode> = {
  chapter: <Layers className="w-3.5 h-3.5 shrink-0" />,
  lesson:  <BookOpen className="w-3.5 h-3.5 shrink-0" />,
  tech:    <Cpu className="w-3.5 h-3.5 shrink-0" />,
};

export const SearchBar: React.FC = () => {
  const { go } = useNav();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Run search on query change
  useEffect(() => {
    if (query.trim().length < 2) { setResults([]); return; }
    setResults(search(query.trim()));
    setActive(0);
    setOpen(true);
  }, [query]);

  // Close on outside click
  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (!panelRef.current?.contains(e.target as Node) && !inputRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  // Global keyboard shortcut: Cmd/Ctrl+K
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
      if (e.key === 'Escape') {
        setOpen(false);
        inputRef.current?.blur();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  const handleKey = (e: React.KeyboardEvent) => {
    if (!results.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(a + 1, results.length - 1)); }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setActive(a => Math.max(a - 1, 0)); }
    if (e.key === 'Enter')     { e.preventDefault(); pick(results[active]); }
  };

  const pick = useCallback((r: SearchResult) => {
    go(r.chapterId);
    setOpen(false);
    setQuery('');
  }, [go]);

  const clear = () => { setQuery(''); setResults([]); setOpen(false); inputRef.current?.focus(); };

  const showPanel = open && results.length > 0;

  return (
    <div className="relative w-full max-w-xs sm:max-w-sm">
      {/* Input */}
      <div
        className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-all"
        style={{
          background: 'var(--surface-muted)',
          border: '1px solid var(--header-border)',
          boxShadow: open ? '0 0 0 2px var(--accent)' : undefined,
        }}
      >
        <Search className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--text-subtle)' }} />
        <input
          ref={inputRef}
          value={query}
          onChange={e => setQuery(e.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
          onKeyDown={handleKey}
          placeholder="Search chapters & lessons…"
          className="flex-1 bg-transparent outline-none text-sm min-w-0"
          style={{ color: 'var(--text-base)' }}
          aria-label="Search chapters and lessons"
          aria-autocomplete="list"
          aria-expanded={showPanel}
        />
        {query ? (
          <button onClick={clear} className="shrink-0 opacity-50 hover:opacity-100 transition-opacity">
            <X className="w-3.5 h-3.5" style={{ color: 'var(--text-muted)' }} />
          </button>
        ) : (
          <kbd className="hidden sm:inline-flex items-center gap-0.5 text-[10px] shrink-0 opacity-40 font-mono" style={{ color: 'var(--text-muted)' }}>
            <span>⌘</span><span>K</span>
          </kbd>
        )}
      </div>

      {/* Results panel */}
      {showPanel && (
        <div
          ref={panelRef}
          role="listbox"
          className="absolute top-full left-0 right-0 mt-2 rounded-xl overflow-hidden z-50"
          style={{
            background: 'var(--surface-solid)',
            border: '1px solid var(--header-border)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
          }}
        >
          {results.map((r, i) => (
            <button
              key={`${r.chapterId}-${r.type}-${r.lessonIndex ?? ''}`}
              role="option"
              aria-selected={i === active}
              onClick={() => pick(r)}
              onMouseEnter={() => setActive(i)}
              className="w-full flex items-center gap-3 px-3 py-2.5 text-left text-sm transition-colors"
              style={{
                background: i === active ? 'var(--surface-muted)' : 'transparent',
                color: 'var(--text-base)',
              }}
            >
              <span style={{ color: 'var(--text-subtle)' }}>{TYPE_ICON[r.type]}</span>
              <span className="flex-1 min-w-0">
                <span className="block truncate font-medium">{r.lessonTitle ?? r.chapterTitle}</span>
                <span className="block text-xs truncate" style={{ color: 'var(--text-subtle)' }}>{r.blurb}</span>
              </span>
              <span
                className="shrink-0 text-[10px] rounded px-1.5 py-0.5"
                style={{ background: 'var(--surface-muted)', color: 'var(--text-subtle)' }}
              >
                Ch {r.chapterNum}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
