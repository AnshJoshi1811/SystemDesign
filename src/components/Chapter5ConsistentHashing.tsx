import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Ch5Part } from '../types';
import { usePersistentState } from '../lib/usePersistentState';
import { Module0Hashing } from './Module0Hashing';
import { Module1ConsistentHashing } from './Module1ConsistentHashing';
import { Module2VirtualNodes } from './Module2VirtualNodes';
import { ComparisonMode } from './ComparisonMode';

const PARTS: { id: Ch5Part; title: string; question: string }[] = [
  { id: 'module0', title: 'Why modulo breaks', question: 'What goes wrong with hash(key) % N when N changes?' },
  { id: 'module1', title: 'The hash ring', question: 'How does a ring limit how many keys move?' },
  { id: 'module2', title: 'Virtual nodes', question: 'Why is a ring with one point per server still uneven?' },
  { id: 'comparison', title: 'Compare', question: 'How much do virtual nodes actually help?' },
];

/** Chapter 5 as one chapter with an internal 4-part stepper. */
export const Chapter5ConsistentHashing: React.FC<{ isDarkMode?: boolean }> = ({ isDarkMode = false }) => {
  const [part, setPart] = usePersistentState<Ch5Part>('chapter5:part', 'module0');
  const idx = Math.max(0, PARTS.findIndex((p) => p.id === part));

  const go = (i: number) => {
    setPart(PARTS[i].id);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-slate-200 bg-white dark:border-white/10 dark:bg-[#111113] p-4 sm:p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2 mb-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Chapter 5</p>
            <h1 className="text-xl font-bold text-slate-900 dark:text-white">Design Consistent Hashing</h1>
          </div>
          <span className="text-xs text-slate-500 dark:text-slate-400">
            Part {idx + 1} of {PARTS.length}
          </span>
        </div>
        <ol className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {PARTS.map((p, i) => {
            const active = i === idx;
            return (
              <li key={p.id}>
                <button
                  onClick={() => go(i)}
                  aria-current={active ? 'step' : undefined}
                  className={`w-full text-left rounded-lg border px-3 py-2 transition-colors ${
                    active
                      ? 'border-indigo-400 bg-indigo-50 dark:border-indigo-400/50 dark:bg-indigo-400/[0.08]'
                      : 'border-slate-200 hover:border-slate-300 dark:border-white/10 dark:hover:border-white/20'
                  }`}
                >
                  <span className="block text-xs text-slate-500 dark:text-slate-400">Part {i + 1}</span>
                  <span className="block text-sm font-medium text-slate-900 dark:text-white">{p.title}</span>
                </button>
              </li>
            );
          })}
        </ol>
        <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">
          <strong className="text-slate-800 dark:text-slate-100">Question for this part: </strong>
          {PARTS[idx].question}
        </p>
      </div>

      {part === 'module0' && <Module0Hashing isDarkMode={isDarkMode} onNavigateModule={setPart} />}
      {part === 'module1' && <Module1ConsistentHashing isDarkMode={isDarkMode} />}
      {part === 'module2' && <Module2VirtualNodes isDarkMode={isDarkMode} />}
      {part === 'comparison' && <ComparisonMode isDarkMode={isDarkMode} />}

      <div className="flex items-center justify-between border-t border-slate-200 dark:border-white/10 pt-4">
        <button
          onClick={() => go(idx - 1)}
          disabled={idx === 0}
          className="flex items-center gap-1 text-sm px-3 py-2 rounded-lg text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/[0.06] disabled:opacity-40"
        >
          <ChevronLeft className="w-4 h-4" />
          {idx > 0 ? PARTS[idx - 1].title : 'Previous'}
        </button>
        <button
          onClick={() => go(idx + 1)}
          disabled={idx === PARTS.length - 1}
          className="flex items-center gap-1 text-sm px-4 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-40"
        >
          {idx < PARTS.length - 1 ? `Next: ${PARTS[idx + 1].title}` : 'Chapter complete'}
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
