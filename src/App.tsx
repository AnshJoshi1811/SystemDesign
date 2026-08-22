import React, { useState } from 'react';
import { ModuleType } from './types';
import { Header } from './components/Header';
import { Chapter1ScaleFromZero } from './components/Chapter1ScaleFromZero';
import { Chapter2Estimation } from './components/Chapter2Estimation';
import { Chapter3Framework } from './components/Chapter3Framework';
import { Chapter4RateLimiter } from './components/Chapter4RateLimiter';
import { Module0Hashing } from './components/Module0Hashing';
import { Module1ConsistentHashing } from './components/Module1ConsistentHashing';
import { Module2VirtualNodes } from './components/Module2VirtualNodes';
import { ComparisonMode } from './components/ComparisonMode';
import { Chapter6KeyValueStore } from './components/Chapter6KeyValueStore';
import { Chapter7IdGenerator } from './components/Chapter7IdGenerator';
import { Chapter8UrlShortener } from './components/Chapter8UrlShortener';
import { motion, AnimatePresence } from 'motion/react';

export default function App() {
  const [activeModule, setActiveModule] = useState<ModuleType>('chapter1');
  const [speed, setSpeed] = useState<number>(1);
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [resetCounter, setResetCounter] = useState<number>(0);
  const [isDarkMode, setIsDarkMode] = useState<boolean>(false);

  const handleReset = () => {
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
          setActiveModule={setActiveModule}
          onReset={handleReset}
          speed={speed}
          setSpeed={setSpeed}
          isPlaying={isPlaying}
          setIsPlaying={setIsPlaying}
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
              {activeModule === 'module0' && <Module0Hashing isDarkMode={isDarkMode} onNavigateModule={setActiveModule} />}
              {activeModule === 'module1' && <Module1ConsistentHashing isDarkMode={isDarkMode} />}
              {activeModule === 'module2' && <Module2VirtualNodes isDarkMode={isDarkMode} />}
              {activeModule === 'comparison' && <ComparisonMode isDarkMode={isDarkMode} />}
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
          <span className={`text-xs font-medium ${isDarkMode ? 'text-white/20' : 'text-slate-400'}`}>System Design Notes</span>
          <span className={`text-xs ${isDarkMode ? 'text-white/20' : 'text-slate-400'}`}>Based on Alex Xu — Chapters 1–8</span>
        </div>
      </footer>

    </div>
  );
}

