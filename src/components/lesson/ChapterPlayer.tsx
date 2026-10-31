import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Check as CheckIcon, ChevronDown, ChevronLeft, ChevronRight, RotateCcw, ArrowRight, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { ModuleType } from '../../types';
import { CHAPTERS, chapterById } from '../../chapters';
import { BookOpen, ExternalLink } from 'lucide-react';
import { usePersistentState } from '../../lib/usePersistentState';

export type View = 'home' | ModuleType;

/** App-level navigation, provided by App so lessons can link to other chapters. */
export const NavContext = createContext<{ go: (v: View) => void; resetChapter: () => void }>({
  go: () => {},
  resetChapter: () => {},
});
export const useNav = () => useContext(NavContext);

export interface Lesson {
  id: string;
  title: string;
  /** One sentence: what the learner will be able to explain after this lesson. */
  goal: string;
  content: React.ReactNode;
}

/**
 * One chapter = an ordered list of short lessons, shown one at a time.
 * Desktop: lesson list in a left rail. Mobile: collapsible "Lesson n of N" picker.
 */
export const ChapterPlayer: React.FC<{ chapterId: ModuleType; lessons: Lesson[] }> = ({ chapterId, lessons }) => {
  const meta = chapterById(chapterId)!;
  const [sidebarCollapsed, setSidebarCollapsed] = usePersistentState<boolean>(`${chapterId}:sidebar:collapsed`, false);;
  const { go, resetChapter } = useNav();
  const [current, setCurrent] = usePersistentState<number>(`${chapterId}:lesson`, 0);
  const [done, setDone] = usePersistentState<string[]>(`${chapterId}:done`, []);
  const [pickerOpen, setPickerOpen] = useState(false);

  const idx = Math.min(Math.max(0, current), lessons.length - 1);
  const lesson = lessons[idx];
  const isLast = idx === lessons.length - 1;
  // Use a Set for O(1) membership checks instead of scanning the array on every render.
  const doneSet = useMemo(() => new Set(done), [done]);
  const doneCount = useMemo(() => lessons.filter((l) => doneSet.has(l.id)).length, [lessons, doneSet]);
  const next = useMemo(() => CHAPTERS[CHAPTERS.findIndex((c) => c.id === chapterId) + 1], [chapterId]);

  // Publish progress for the home screen.
  useEffect(() => {
    try {
      localStorage.setItem(`sd:${chapterId}:progress`, JSON.stringify({ done: doneCount, total: lessons.length, lesson: idx }));
    } catch {
      // ignore
    }
  }, [chapterId, doneCount, lessons.length, idx]);

  const open = useCallback((i: number) => {
    setCurrent(i);
    setPickerOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [setCurrent]);

  const complete = useCallback(() => {
    if (!doneSet.has(lesson.id)) setDone((prev) => [...prev, lesson.id]);
    if (!isLast) open(idx + 1);
  }, [doneSet, lesson.id, setDone, isLast, open, idx]);

  const lessonList = useMemo(() => (
    <ol className="space-y-0.5">
      {lessons.map((l, i) => {
        const active = i === idx;
        const isDone = doneSet.has(l.id);
        return (
          <li key={l.id}>
            <button
              onClick={() => open(i)}
              aria-current={active ? 'step' : undefined}
              className="w-full flex items-start gap-3 rounded-lg px-2.5 py-2 text-left text-sm transition-colors"
              style={{
                background: active ? 'var(--surface-muted)' : 'transparent',
                color: active ? 'var(--text-base)' : 'var(--text-muted)',
              }}
            >
              <span
                className="mt-px flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold"
                style={{
                  background: isDone ? 'var(--accent)' : active ? 'var(--accent)' : 'var(--surface-muted)',
                  color: isDone || active ? 'var(--accent-fg)' : 'var(--text-muted)',
                }}
              >
                {isDone ? <CheckIcon className="w-3 h-3" strokeWidth={3} /> : i + 1}
              </span>
              <span className={active ? 'font-medium' : ''}>{l.title}</span>
            </button>
          </li>
        );
      })}
    </ol>
  ), [lessons, idx, doneSet, open]);

  const progressBar = useMemo(() => (
    <div>
      <div className="flex justify-between text-xs mb-1.5" style={{ color: 'var(--text-subtle)' }}>
        <span>{doneCount} of {lessons.length} lessons done</span>
        <span>{Math.round((doneCount / lessons.length) * 100)}%</span>
      </div>
      <div className="h-1 rounded-full overflow-hidden" style={{ background: 'var(--surface-muted)' }}>
        <div className="h-full rounded-full transition-all" style={{ width: `${(doneCount / lessons.length) * 100}%`, background: 'var(--progress-bar)' }} />
      </div>
    </div>
  ), [doneCount, lessons.length]);

  return (
    <div className={`lg:grid lg:gap-10 transition-all duration-200 ${sidebarCollapsed ? 'lg:grid-cols-[0px_minmax(0,1fr)]' : 'lg:grid-cols-[260px_minmax(0,1fr)]'}`}>

      {/* ── Desktop sidebar rail ── */}
      <aside className={`hidden lg:block overflow-hidden transition-all duration-200 ${sidebarCollapsed ? 'w-0 opacity-0 pointer-events-none' : 'w-[260px] opacity-100'}`}>
        <div className="sticky top-20 space-y-4 pr-2">
          {/* Chapter identity */}
          <div>
            <p className="text-[10px] font-bold tracking-widest uppercase mb-1" style={{ color: 'var(--text-subtle)' }}>
              Chapter {meta.num}
            </p>
            <p className="text-sm font-semibold leading-snug" style={{ color: 'var(--text-base)' }}>{meta.title}</p>
            {meta.mediumUrl && (
              <a
                href={meta.mediumUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1.5 flex items-center gap-1 text-[11px] transition-opacity hover:opacity-60"
                style={{ color: 'var(--text-subtle)' }}
              >
                <BookOpen className="w-3 h-3" />
                Read on Medium
                <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>

          {progressBar}
          {lessonList}

          <button
            onClick={resetChapter}
            className="flex items-center gap-1.5 px-1 text-xs transition-opacity hover:opacity-60"
            style={{ color: 'var(--text-subtle)' }}
          >
            <RotateCcw className="w-3 h-3" />
            Restart chapter
          </button>
        </div>
      </aside>

      {/* ── Main content ── */}
      <article className="min-w-0">

        {/* Mobile lesson picker */}
        <div className="lg:hidden mb-6 rounded-xl" style={{ background: 'var(--surface)', border: '1px solid var(--header-border)' }}>
          <button
            onClick={() => setPickerOpen(o => !o)}
            className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left"
            aria-expanded={pickerOpen}
          >
            <span className="min-w-0">
              <span className="block text-xs" style={{ color: 'var(--text-subtle)' }}>
                Ch {meta.num} · Lesson {idx + 1} of {lessons.length}
              </span>
              <span className="block truncate text-sm font-medium" style={{ color: 'var(--text-base)' }}>
                {lesson.title}
              </span>
            </span>
            <ChevronDown
              className={`w-4 h-4 shrink-0 transition-transform ${pickerOpen ? 'rotate-180' : ''}`}
              style={{ color: 'var(--text-subtle)' }}
            />
          </button>
          {pickerOpen && (
            <div className="p-3 space-y-4" style={{ borderTop: '1px solid var(--header-border)' }}>
              {progressBar}
              {lessonList}
            </div>
          )}
        </div>

        {/* Lesson header */}
        <header className="mb-8 max-w-3xl">
          {/* Breadcrumb row: Chapter name + collapse toggle + lesson count */}
          <div className="flex items-center gap-2 mb-3">
            {/* Sidebar toggle — desktop only */}
            <button
              onClick={() => setSidebarCollapsed(c => !c)}
              className="hidden lg:flex items-center justify-center w-7 h-7 rounded-lg transition-colors -ml-1 shrink-0"
              style={{ color: 'var(--text-subtle)' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-muted)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              title={sidebarCollapsed ? 'Show lesson list' : 'Hide lesson list'}
              aria-label={sidebarCollapsed ? 'Show lesson list' : 'Hide lesson list'}
            >
              {sidebarCollapsed
                ? <PanelLeftOpen className="w-4 h-4" />
                : <PanelLeftClose className="w-4 h-4" />
              }
            </button>

            <span className="text-xs font-semibold" style={{ color: 'var(--text-subtle)' }}>
              {meta.short}
            </span>
            <span className="text-xs" style={{ color: 'var(--text-subtle)' }}>·</span>
            <span className="text-xs" style={{ color: 'var(--text-subtle)' }}>
              Lesson {idx + 1} / {lessons.length}
            </span>

            {/* Progress pill — compact, always visible */}
            {doneCount > 0 && (
              <span
                className="ml-auto text-[10px] px-2 py-0.5 rounded-full font-medium shrink-0"
                style={{ background: 'var(--surface-muted)', color: 'var(--text-subtle)' }}
              >
                {doneCount}/{lessons.length} done
              </span>
            )}
          </div>

          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight" style={{ color: 'var(--text-base)' }}>
            {lesson.title}
          </h1>
          <p className="mt-2 text-base leading-relaxed" style={{ color: 'var(--text-muted)' }}>
            {lesson.goal}
          </p>
        </header>

        {/* Lesson body */}
        <div key={lesson.id} className="space-y-10 max-w-3xl">
          {lesson.content}
        </div>

        {/* Footer nav */}
        <footer
          className="mt-12 max-w-3xl flex items-center justify-between gap-3 pt-6"
          style={{ borderTop: '1px solid var(--header-border)' }}
        >
          <button
            onClick={() => open(idx - 1)}
            disabled={idx === 0}
            className="inline-flex items-center gap-1 rounded-lg px-3 py-2 text-sm transition-colors disabled:invisible"
            style={{ color: 'var(--text-muted)' }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-muted)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          >
            <ChevronLeft className="w-4 h-4" />
            Back
          </button>

          {!isLast ? (
            <button onClick={complete} className="btn-primary">
              Continue
              <span className="hidden sm:inline opacity-60 text-xs">· {lessons[idx + 1].title}</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={() => { complete(); go(next ? next.id : 'home'); window.scrollTo({ top: 0 }); }}
              className="btn-primary"
            >
              {next ? `Finish · Chapter ${next.num}` : 'Finish course'}
              <ArrowRight className="w-4 h-4" />
            </button>
          )}
        </footer>
      </article>
    </div>
  );
};
