import React, { createContext, useContext, useEffect, useState } from 'react';
import { Check as CheckIcon, ChevronDown, ChevronLeft, ChevronRight, RotateCcw, ArrowRight } from 'lucide-react';
import { ModuleType } from '../../types';
import { CHAPTERS, chapterById } from '../../chapters';
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
  const { go, resetChapter } = useNav();
  const [current, setCurrent] = usePersistentState<number>(`${chapterId}:lesson`, 0);
  const [done, setDone] = usePersistentState<string[]>(`${chapterId}:done`, []);
  const [pickerOpen, setPickerOpen] = useState(false);

  const idx = Math.min(Math.max(0, current), lessons.length - 1);
  const lesson = lessons[idx];
  const isLast = idx === lessons.length - 1;
  const doneCount = lessons.filter((l) => done.includes(l.id)).length;
  const next = CHAPTERS[CHAPTERS.findIndex((c) => c.id === chapterId) + 1];

  // Publish progress for the home screen.
  useEffect(() => {
    try {
      localStorage.setItem(`sd:${chapterId}:progress`, JSON.stringify({ done: doneCount, total: lessons.length, lesson: idx }));
    } catch {
      // ignore
    }
  }, [chapterId, doneCount, lessons.length, idx]);

  const open = (i: number) => {
    setCurrent(i);
    setPickerOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const complete = () => {
    if (!done.includes(lesson.id)) setDone([...done, lesson.id]);
    if (!isLast) open(idx + 1);
  };

  const lessonList = (
    <ol className="space-y-0.5">
      {lessons.map((l, i) => {
        const active = i === idx;
        const isDone = done.includes(l.id);
        return (
          <li key={l.id}>
            <button
              onClick={() => open(i)}
              aria-current={active ? 'step' : undefined}
              className={`w-full flex items-start gap-3 rounded-lg px-2.5 py-2 text-left text-sm transition-colors ${
                active
                  ? 'bg-indigo-50 text-indigo-900 dark:bg-indigo-400/[0.12] dark:text-white'
                  : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/[0.05]'
              }`}
            >
              <span
                className={`mt-px flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${
                  isDone
                    ? 'bg-emerald-500 text-white'
                    : active
                    ? 'bg-indigo-600 text-white'
                    : 'bg-slate-200 text-slate-600 dark:bg-white/10 dark:text-slate-300'
                }`}
              >
                {isDone ? <CheckIcon className="w-3 h-3" strokeWidth={3} /> : i + 1}
              </span>
              <span className={active ? 'font-medium' : ''}>{l.title}</span>
            </button>
          </li>
        );
      })}
    </ol>
  );

  const progressBar = (
    <div>
      <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400 mb-1.5">
        <span>
          {doneCount} of {lessons.length} lessons done
        </span>
        <span>{Math.round((doneCount / lessons.length) * 100)}%</span>
      </div>
      <div className="h-1.5 rounded-full bg-slate-200 dark:bg-white/10 overflow-hidden">
        <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${(doneCount / lessons.length) * 100}%` }} />
      </div>
    </div>
  );

  return (
    <div className="lg:grid lg:grid-cols-[260px_minmax(0,1fr)] lg:gap-12">
      {/* Desktop rail */}
      <aside className="hidden lg:block">
        <div className="sticky top-20 space-y-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-indigo-600 dark:text-indigo-300">Chapter {meta.num}</p>
            <p className="mt-1 text-lg font-semibold leading-snug text-slate-900 dark:text-white">{meta.title}</p>
          </div>
          {progressBar}
          {lessonList}
          <button
            onClick={resetChapter}
            className="flex items-center gap-1.5 px-2.5 text-xs text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
          >
            <RotateCcw className="w-3 h-3" />
            Restart this chapter
          </button>
        </div>
      </aside>

      <article className="min-w-0">
        {/* Mobile picker */}
        <div className="lg:hidden mb-6 rounded-xl bg-white ring-1 ring-slate-200 dark:bg-white/[0.03] dark:ring-white/10">
          <button onClick={() => setPickerOpen((o) => !o)} className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left" aria-expanded={pickerOpen}>
            <span className="min-w-0">
              <span className="block text-xs text-slate-500 dark:text-slate-400">
                Chapter {meta.num} · Lesson {idx + 1} of {lessons.length}
              </span>
              <span className="block truncate text-sm font-medium text-slate-900 dark:text-white">{lesson.title}</span>
            </span>
            <ChevronDown className={`w-4 h-4 shrink-0 text-slate-400 transition-transform ${pickerOpen ? 'rotate-180' : ''}`} />
          </button>
          {pickerOpen && (
            <div className="border-t border-slate-100 dark:border-white/10 p-3 space-y-4">
              {progressBar}
              {lessonList}
            </div>
          )}
        </div>

        <header className="mb-8 max-w-3xl">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Lesson {idx + 1} of {lessons.length}
          </p>
          <h1 className="mt-1 text-2xl sm:text-3xl font-semibold tracking-tight text-slate-900 dark:text-white">{lesson.title}</h1>
          <p className="mt-3 text-base sm:text-lg leading-relaxed text-slate-600 dark:text-slate-300">{lesson.goal}</p>
        </header>

        <div key={lesson.id} className="space-y-10 max-w-3xl">
          {lesson.content}
        </div>

        <footer className="mt-12 max-w-3xl flex items-center justify-between gap-3 border-t border-slate-200 dark:border-white/10 pt-6">
          <button
            onClick={() => open(idx - 1)}
            disabled={idx === 0}
            className="inline-flex items-center gap-1 rounded-lg px-3 py-2 text-sm text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/[0.06] disabled:invisible"
          >
            <ChevronLeft className="w-4 h-4" />
            Back
          </button>
          {!isLast ? (
            <button
              onClick={complete}
              className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-indigo-500"
            >
              Continue
              <span className="hidden sm:inline text-indigo-200">· {lessons[idx + 1].title}</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={() => {
                complete();
                go(next ? next.id : 'home');
                window.scrollTo({ top: 0 });
              }}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-emerald-500"
            >
              {next ? `Finish · next: Chapter ${next.num}` : 'Finish course'}
              <ArrowRight className="w-4 h-4" />
            </button>
          )}
        </footer>
      </article>
    </div>
  );
};
