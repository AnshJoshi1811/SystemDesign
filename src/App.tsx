import React, { Suspense, lazy, useCallback, useEffect, useMemo, useState } from 'react';
import { ModuleType } from './types';
import { CHAPTERS, chapterById } from './chapters';
import { Header } from './components/Header';
import { AskAI } from './components/AskAI';
import { Home } from './components/Home';
import { ChapterSkeleton } from './components/Skeleton';
import { NavContext, View } from './components/lesson/ChapterPlayer';
import { usePersistentState, clearChapterState } from './lib/usePersistentState';

// Each chapter is its own lazy chunk — downloaded once, on first open.
type CC = React.ComponentType<{ isDarkMode?: boolean }>;
const load = (f: () => Promise<Record<string, unknown>>, name: string) =>
  lazy(() => f().then(m => ({ default: m[name] as CC })));

const CHAPTER_VIEWS: Record<ModuleType, React.LazyExoticComponent<CC>> = {
  chapter1:    load(() => import('./components/Chapter1ScaleFromZero'),    'Chapter1ScaleFromZero'),
  chapter2:    load(() => import('./components/Chapter2Estimation'),        'Chapter2Estimation'),
  chapter3:    load(() => import('./components/Chapter3Framework'),          'Chapter3Framework'),
  rateLimiter: load(() => import('./components/Chapter4RateLimiter'),       'Chapter4RateLimiter'),
  chapter5:    load(() => import('./components/Chapter5ConsistentHashing'), 'Chapter5ConsistentHashing'),
  chapter6:    load(() => import('./components/Chapter6KeyValueStore'),     'Chapter6KeyValueStore'),
  chapter7:    load(() => import('./components/Chapter7IdGenerator'),       'Chapter7IdGenerator'),
  chapter8:    load(() => import('./components/Chapter8UrlShortener'),      'Chapter8UrlShortener'),
};

const isView = (v: unknown): v is View =>
  v === 'home' || CHAPTERS.some(c => c.id === v);

export default function App() {
  const [storedView, setView] = usePersistentState<View>('app:view', 'home');
  const view: View = isView(storedView) ? storedView : 'home';
  const [lastChapter, setLastChapter] = usePersistentState<ModuleType | null>('app:chapter', null);
  const [resetCounter, setResetCounter] = useState(0);
  // Dark is the default — light is the opt-in.
  const [isDarkMode, setIsDarkMode] = usePersistentState<boolean>('app:dark', true);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDarkMode);
  }, [isDarkMode]);

  const go = useCallback((v: View) => {
    setView(v);
    if (v !== 'home') setLastChapter(v);
    window.scrollTo({ top: 0 });
  }, [setView, setLastChapter]);

  const resetChapter = useCallback(() => {
    if (view === 'home') return;
    const title = chapterById(view)?.title ?? 'this chapter';
    if (!window.confirm(`Restart "${title}"? Your progress will be cleared.`)) return;
    clearChapterState(view);
    setResetCounter(n => n + 1);
  }, [view]);

  const navCtx = useMemo(() => ({ go, resetChapter }), [go, resetChapter]);

  return (
    <NavContext.Provider value={navCtx}>
      <div className="min-h-screen flex flex-col" style={{ background: 'var(--surface-muted)', color: 'var(--text-base)' }}>
        <Header view={view} onNavigate={go} isDarkMode={isDarkMode} setIsDarkMode={setIsDarkMode} />

        <main
          key={`${view}-${resetCounter}`}
          className="max-w-[1280px] mx-auto w-full px-4 sm:px-6 lg:px-8 pt-6 pb-24 animate-[fadein_.18s_ease-out]"
        >
          {view === 'home' ? (
            <Home lastChapter={lastChapter} />
          ) : (
            <Suspense fallback={<ChapterSkeleton />}>
              {React.createElement(CHAPTER_VIEWS[view], { isDarkMode })}
            </Suspense>
          )}
        </main>

        <AskAI />

        <footer
          className="mt-auto py-5"
          style={{ borderTop: '1px solid var(--header-border)' }}
        >
          <div
            className="max-w-[1280px] mx-auto px-6 flex items-center justify-between text-xs"
            style={{ color: 'var(--text-subtle)' }}
          >
            <span>System Design Labs</span>
            <span>Based on Alex Xu · Chapters 1–8</span>
          </div>
        </footer>
      </div>
    </NavContext.Provider>
  );
}
