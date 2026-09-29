import React, { Suspense, lazy, useEffect, useState } from 'react';
import { ModuleType } from './types';
import { CHAPTERS, chapterById } from './chapters';
import { Header } from './components/Header';
import { Home } from './components/Home';
import { NavContext, View } from './components/lesson/ChapterPlayer';
import { usePersistentState, clearChapterState } from './lib/usePersistentState';

// Each chapter is its own chunk, downloaded the first time it is opened.
type ChapterComponent = React.ComponentType<{ isDarkMode?: boolean }>;
const load = (f: () => Promise<Record<string, unknown>>, name: string) =>
  lazy(() => f().then((m) => ({ default: m[name] as ChapterComponent })));

const CHAPTER_VIEWS: Record<ModuleType, React.LazyExoticComponent<ChapterComponent>> = {
  chapter1: load(() => import('./components/Chapter1ScaleFromZero'), 'Chapter1ScaleFromZero'),
  chapter2: load(() => import('./components/Chapter2Estimation'), 'Chapter2Estimation'),
  chapter3: load(() => import('./components/Chapter3Framework'), 'Chapter3Framework'),
  rateLimiter: load(() => import('./components/Chapter4RateLimiter'), 'Chapter4RateLimiter'),
  chapter5: load(() => import('./components/Chapter5ConsistentHashing'), 'Chapter5ConsistentHashing'),
  chapter6: load(() => import('./components/Chapter6KeyValueStore'), 'Chapter6KeyValueStore'),
  chapter7: load(() => import('./components/Chapter7IdGenerator'), 'Chapter7IdGenerator'),
  chapter8: load(() => import('./components/Chapter8UrlShortener'), 'Chapter8UrlShortener'),
};

const ChapterLoading = () => (
  <div className="flex items-center justify-center py-24 text-sm text-slate-500 dark:text-slate-400" role="status">
    Loading chapter…
  </div>
);

const isView = (v: unknown): v is View => v === 'home' || CHAPTERS.some((c) => c.id === v);

export default function App() {
  const [storedView, setView] = usePersistentState<View>('app:view', 'home');
  const view: View = isView(storedView) ? storedView : 'home';
  const [lastChapter, setLastChapter] = usePersistentState<ModuleType | null>('app:chapter', null);
  const [resetCounter, setResetCounter] = useState(0);
  const [isDarkMode, setIsDarkMode] = usePersistentState<boolean>('app:dark', false);

  // `dark:` utilities are bound to this class (see index.css).
  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDarkMode);
  }, [isDarkMode]);

  const go = (v: View) => {
    setView(v);
    if (v !== 'home') setLastChapter(v);
    window.scrollTo({ top: 0 });
  };

  const resetChapter = () => {
    if (view === 'home') return;
    const title = chapterById(view)?.title ?? 'this chapter';
    if (!window.confirm(`Restart "${title}"? Your lesson progress and answers in this chapter will be cleared.`)) return;
    clearChapterState(view);
    setResetCounter((n) => n + 1);
  };

  return (
    <NavContext.Provider value={{ go, resetChapter }}>
      <div className="sd-app min-h-screen flex flex-col bg-[#fafaf9] text-slate-900 dark:bg-[#0a0a0b] dark:text-slate-100">
        <Header view={view} onNavigate={go} isDarkMode={isDarkMode} setIsDarkMode={setIsDarkMode} />

        <main key={`${view}-${resetCounter}`} className={`${view === 'chapter1' ? 'max-w-[1600px]' : 'max-w-[1280px]'} mx-auto w-full px-4 sm:px-6 lg:px-8 pt-8 pb-24 animate-[fadein_.2s_ease-out]`}>
          {view === 'home' ? (
            <Home lastChapter={lastChapter} />
          ) : (
            <Suspense fallback={<ChapterLoading />}>
              {React.createElement(CHAPTER_VIEWS[view], { isDarkMode })}
            </Suspense>
          )}
        </main>

        <footer className="mt-auto border-t border-slate-200 dark:border-white/[0.06] py-5">
          <div className="max-w-[1280px] mx-auto px-6 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>System Design Notes</span>
            <span>Based on Alex Xu — Chapters 1–8</span>
          </div>
        </footer>
      </div>
    </NavContext.Provider>
  );
}
