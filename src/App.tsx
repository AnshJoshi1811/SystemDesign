import React, { useEffect, useState } from 'react';
import { ModuleType } from './types';
import { CHAPTERS, chapterById } from './chapters';
import { Header } from './components/Header';
import { Home } from './components/Home';
import { NavContext, View } from './components/lesson/ChapterPlayer';
import { Chapter1ScaleFromZero } from './components/Chapter1ScaleFromZero';
import { Chapter2Estimation } from './components/Chapter2Estimation';
import { Chapter3Framework } from './components/Chapter3Framework';
import { Chapter4RateLimiter } from './components/Chapter4RateLimiter';
import { Chapter5ConsistentHashing } from './components/Chapter5ConsistentHashing';
import { Chapter6KeyValueStore } from './components/Chapter6KeyValueStore';
import { Chapter7IdGenerator } from './components/Chapter7IdGenerator';
import { Chapter8UrlShortener } from './components/Chapter8UrlShortener';
import { usePersistentState, clearChapterState } from './lib/usePersistentState';

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

        <main key={`${view}-${resetCounter}`} className="max-w-[1280px] mx-auto w-full px-4 sm:px-6 lg:px-8 pt-8 pb-24 animate-[fadein_.2s_ease-out]">
          {view === 'home' && <Home lastChapter={lastChapter} />}
          {view === 'chapter1' && <Chapter1ScaleFromZero isDarkMode={isDarkMode} />}
          {view === 'chapter2' && <Chapter2Estimation isDarkMode={isDarkMode} />}
          {view === 'chapter3' && <Chapter3Framework isDarkMode={isDarkMode} />}
          {view === 'rateLimiter' && <Chapter4RateLimiter isDarkMode={isDarkMode} />}
          {view === 'chapter5' && <Chapter5ConsistentHashing isDarkMode={isDarkMode} />}
          {view === 'chapter6' && <Chapter6KeyValueStore isDarkMode={isDarkMode} />}
          {view === 'chapter7' && <Chapter7IdGenerator isDarkMode={isDarkMode} />}
          {view === 'chapter8' && <Chapter8UrlShortener isDarkMode={isDarkMode} />}
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
