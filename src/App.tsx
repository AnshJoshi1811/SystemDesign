import React, { useEffect, useState } from 'react';
import { ModuleType } from './types';
import { Header, CHAPTERS } from './components/Header';
import { Chapter1ScaleFromZero } from './components/Chapter1ScaleFromZero';
import { Chapter2Estimation } from './components/Chapter2Estimation';
import { Chapter3Framework } from './components/Chapter3Framework';
import { Chapter4RateLimiter } from './components/Chapter4RateLimiter';
import { Chapter5ConsistentHashing } from './components/Chapter5ConsistentHashing';
import { Chapter6KeyValueStore } from './components/Chapter6KeyValueStore';
import { Chapter7IdGenerator } from './components/Chapter7IdGenerator';
import { Chapter8UrlShortener } from './components/Chapter8UrlShortener';
import { usePersistentState, clearChapterState } from './lib/usePersistentState';
import { motion, AnimatePresence } from 'motion/react';

const isModule = (m: unknown): m is ModuleType => CHAPTERS.some((c) => c.id === m);

export default function App() {
  const [storedModule, setActiveModule] = usePersistentState<ModuleType>('app:chapter', 'chapter1');
  const activeModule: ModuleType = isModule(storedModule) ? storedModule : 'chapter1';
  const [resetCounter, setResetCounter] = useState<number>(0);
  const [isDarkMode, setIsDarkMode] = usePersistentState<boolean>('app:dark', false);

  // `dark:` utilities are bound to this class (see index.css).
  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDarkMode);
  }, [isDarkMode]);

  const handleNavigate = (m: ModuleType) => {
    setActiveModule(m);
    window.scrollTo({ top: 0 });
  };

  const handleReset = () => {
    const label = CHAPTERS.find((c) => c.id === activeModule)?.label ?? 'this chapter';
    if (!window.confirm(`Reset your progress in "${label}"? Stages, quiz answers and settings will be cleared.`)) return;
    clearChapterState(activeModule);
    setResetCounter((prev) => prev + 1);
  };

  return (
    <div className={`sd-app min-h-screen font-sans flex flex-col ${
      isDarkMode
        ? 'bg-[#0a0a0a] text-slate-100'
        : 'bg-[#f5f5f4] text-slate-900'
    }`}>

      {/* Top Header Navigation */}
      <div>
        <Header
          activeModule={activeModule}
          setActiveModule={handleNavigate}
          onReset={handleReset}
          isDarkMode={isDarkMode}
          setIsDarkMode={setIsDarkMode}
        />

        {/* Main Content Area */}
        <main className="max-w-[1280px] mx-auto w-full px-4 sm:px-6 lg:px-8 pt-8 pb-20">
          <AnimatePresence mode="wait">
            <motion.div
              key={`${activeModule}-${resetCounter}`}
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.25 }}
            >
              {activeModule === 'chapter1' && <Chapter1ScaleFromZero isDarkMode={isDarkMode} />}
              {activeModule === 'chapter2' && <Chapter2Estimation isDarkMode={isDarkMode} />}
              {activeModule === 'chapter3' && <Chapter3Framework isDarkMode={isDarkMode} />}
              {activeModule === 'rateLimiter' && <Chapter4RateLimiter isDarkMode={isDarkMode} />}
              {activeModule === 'chapter5' && <Chapter5ConsistentHashing isDarkMode={isDarkMode} />}
              {activeModule === 'chapter6' && <Chapter6KeyValueStore isDarkMode={isDarkMode} />}
              {activeModule === 'chapter7' && <Chapter7IdGenerator isDarkMode={isDarkMode} />}
              {activeModule === 'chapter8' && <Chapter8UrlShortener isDarkMode={isDarkMode} />}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      {/* Footer */}
      <footer className={`mt-auto border-t py-5 ${
        isDarkMode ? 'border-white/[0.06] bg-[#111113]' : 'border-slate-200 bg-[#f5f5f4]'
      }`}>
        <div className="max-w-[1280px] mx-auto px-6 flex items-center justify-between">
          <span className={`text-xs font-medium ${isDarkMode ? 'text-white/40' : 'text-slate-500'}`}>System Design Notes</span>
          <span className={`text-xs ${isDarkMode ? 'text-white/40' : 'text-slate-500'}`}>Based on Alex Xu — Chapters 1–8</span>
        </div>
      </footer>

    </div>
  );
}
