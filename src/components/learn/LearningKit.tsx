import React, { useEffect, useState } from 'react';
import { Target, Lightbulb, ArrowRight, CheckCircle2, XCircle, RotateCcw } from 'lucide-react';
import { usePersistentState } from '../../lib/usePersistentState';

/*
 * Shared building blocks for the per-stage learning loop:
 *   LessonGoal  -> Simulation (chapter-specific) -> WhatChanged -> Takeaway -> Quiz
 * All components theme via Tailwind `dark:` (bound to the app toggle in index.css).
 */

const card = 'rounded-xl border p-4 sm:p-5';

export const LessonGoal: React.FC<{ goal: React.ReactNode; why?: React.ReactNode; className?: string }> = ({
  goal,
  why,
  className = '',
}) => (
  <div className={`${card} border-indigo-200 bg-indigo-50/70 dark:border-indigo-400/20 dark:bg-indigo-400/[0.06] ${className}`}>
    <div className="flex items-start gap-3">
      <Target className="w-5 h-5 mt-0.5 shrink-0 text-indigo-600 dark:text-indigo-300" />
      <div className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-indigo-700 dark:text-indigo-300">What you'll learn</p>
        <p className="text-sm text-slate-800 dark:text-slate-100 leading-relaxed">{goal}</p>
        {why && <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">{why}</p>}
      </div>
    </div>
  </div>
);

export const Takeaway: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
  <div className={`${card} border-amber-200 bg-amber-50/70 dark:border-amber-400/20 dark:bg-amber-400/[0.06] ${className}`}>
    <div className="flex items-start gap-3">
      <Lightbulb className="w-5 h-5 mt-0.5 shrink-0 text-amber-600 dark:text-amber-300" />
      <div className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">Key takeaway</p>
        <div className="text-sm text-slate-800 dark:text-slate-100 leading-relaxed">{children}</div>
      </div>
    </div>
  </div>
);

/** Before/after of one architectural step, with the reason it was needed. */
export const WhatChanged: React.FC<{ before: React.ReactNode; after: React.ReactNode; reason: React.ReactNode; className?: string }> = ({
  before,
  after,
  reason,
  className = '',
}) => (
  <div className={`${card} border-slate-200 bg-white dark:border-white/10 dark:bg-white/[0.03] ${className}`}>
    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-3">What changed in this stage</p>
    <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] gap-3 items-center">
      <div className="rounded-lg bg-rose-50 dark:bg-rose-400/[0.08] p-3 text-sm text-slate-800 dark:text-slate-100">
        <span className="block text-xs font-semibold text-rose-700 dark:text-rose-300 mb-1">Before</span>
        {before}
      </div>
      <ArrowRight className="hidden sm:block w-5 h-5 text-slate-400" />
      <div className="rounded-lg bg-emerald-50 dark:bg-emerald-400/[0.08] p-3 text-sm text-slate-800 dark:text-slate-100">
        <span className="block text-xs font-semibold text-emerald-700 dark:text-emerald-300 mb-1">After</span>
        {after}
      </div>
    </div>
    <p className="mt-3 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
      <strong className="text-slate-800 dark:text-slate-100">Why: </strong>
      {reason}
    </p>
  </div>
);

/** Inline glossary term: dotted underline, definition on hover or keyboard focus. */
export const Term: React.FC<{ term: string; children: React.ReactNode }> = ({ term, children }) => (
  <span className="relative inline-block group">
    <span
      tabIndex={0}
      className="underline decoration-dotted decoration-slate-400 underline-offset-2 cursor-help outline-none focus-visible:ring-2 focus-visible:ring-amber-400 rounded-sm"
    >
      {term}
    </span>
    <span
      role="tooltip"
      className="pointer-events-none absolute left-1/2 -translate-x-1/2 bottom-full mb-2 w-64 rounded-lg bg-slate-900 text-white dark:bg-white dark:text-slate-900 text-xs leading-relaxed p-2.5 shadow-lg opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity z-50"
    >
      {children}
    </span>
  </span>
);

export interface QuizOption {
  text: string;
  correct?: boolean;
  /** Shown after the learner picks this option — explain why it is right or wrong. */
  why: string;
}

export interface QuizQuestion {
  question: string;
  options: QuizOption[];
}

/**
 * Multiple-choice check with inline feedback. Picking any option reveals its explanation;
 * wrong picks can be retried. Progress persists under `<persistKey>`.
 */
export const Quiz: React.FC<{
  persistKey: string;
  questions: QuizQuestion[];
  title?: string;
  className?: string;
  /** Called with how many questions are solved, whenever that changes. */
  onProgress?: (solved: number, total: number) => void;
}> = ({ persistKey, questions, title = 'Check your understanding', className = '', onProgress }) => {
  // picks[q] = list of option indexes tried, in order
  const [picks, setPicks] = usePersistentState<number[][]>(persistKey, []);
  const [index, setIndex] = useState(() => {
    const firstOpen = questions.findIndex((q, i) => !(picks[i] ?? []).some((p) => q.options[p]?.correct));
    return firstOpen === -1 ? 0 : firstOpen;
  });
  const solvedCount = questions.filter((qq, i) => (picks[i] ?? []).some((p) => qq.options[p]?.correct)).length;
  useEffect(() => {
    onProgress?.(solvedCount, questions.length);
  }, [solvedCount, questions.length]); // eslint-disable-line react-hooks/exhaustive-deps

  if (questions.length === 0) return null;
  const q = questions[Math.min(index, questions.length - 1)];
  const tried = picks[index] ?? [];
  const last = tried.length ? tried[tried.length - 1] : undefined;
  const solved = tried.some((p) => q.options[p]?.correct);
  const firstTryCorrect = questions.filter((qq, i) => {
    const t = picks[i] ?? [];
    return t.length > 0 && qq.options[t[0]]?.correct;
  }).length;
  const answered = questions.filter((qq, i) => (picks[i] ?? []).some((p) => qq.options[p]?.correct)).length;

  const choose = (optIdx: number) => {
    if (solved) return;
    setPicks((prev) => {
      const next = questions.map((_, i) => [...(prev[i] ?? [])]);
      if (!next[index].includes(optIdx)) next[index].push(optIdx);
      return next;
    });
  };

  return (
    <div className={`${card} border-slate-200 bg-white dark:border-white/10 dark:bg-white/[0.03] ${className}`}>
      <div className="flex items-center justify-between gap-3 mb-3">
        <p className="text-sm font-semibold text-slate-900 dark:text-white">{title}</p>
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-500 dark:text-slate-400">
            {answered}/{questions.length} answered · {firstTryCorrect} first try
          </span>
          <button
            onClick={() => {
              setPicks([]);
              setIndex(0);
            }}
            title="Restart quiz"
            className="p-1 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {questions.length > 1 && (
        <div className="flex gap-1 mb-4" aria-hidden>
          {questions.map((qq, i) => {
            const done = (picks[i] ?? []).some((p) => qq.options[p]?.correct);
            return (
              <button
                key={i}
                onClick={() => setIndex(i)}
                className={`h-1.5 flex-1 rounded-full transition-colors ${
                  i === index ? 'bg-indigo-500' : done ? 'bg-emerald-400' : 'bg-slate-200 dark:bg-white/10'
                }`}
              />
            );
          })}
        </div>
      )}

      <p className="text-sm text-slate-800 dark:text-slate-100 leading-relaxed mb-3">
        <span className="text-slate-400 mr-1">Q{index + 1}.</span>
        {q.question}
      </p>

      <div className="space-y-2">
        {q.options.map((opt, i) => {
          const picked = tried.includes(i);
          const tone = !picked
            ? 'border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/50 dark:border-white/10 dark:hover:border-indigo-400/40 dark:hover:bg-indigo-400/[0.05]'
            : opt.correct
            ? 'border-emerald-300 bg-emerald-50 dark:border-emerald-400/40 dark:bg-emerald-400/[0.08]'
            : 'border-rose-300 bg-rose-50 dark:border-rose-400/40 dark:bg-rose-400/[0.08]';
          return (
            <button
              key={i}
              onClick={() => choose(i)}
              disabled={solved && !picked}
              className={`w-full text-left rounded-lg border px-3 py-2.5 text-sm transition-colors disabled:opacity-50 disabled:cursor-default text-slate-800 dark:text-slate-100 ${tone}`}
            >
              <span className="flex items-start gap-2">
                {picked &&
                  (opt.correct ? (
                    <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0 text-emerald-600 dark:text-emerald-300" />
                  ) : (
                    <XCircle className="w-4 h-4 mt-0.5 shrink-0 text-rose-600 dark:text-rose-300" />
                  ))}
                <span>{opt.text}</span>
              </span>
            </button>
          );
        })}
      </div>

      {last !== undefined && (
        <div
          className={`mt-3 rounded-lg p-3 text-sm leading-relaxed ${
            q.options[last].correct
              ? 'bg-emerald-50 text-emerald-900 dark:bg-emerald-400/[0.08] dark:text-emerald-100'
              : 'bg-rose-50 text-rose-900 dark:bg-rose-400/[0.08] dark:text-rose-100'
          }`}
        >
          <strong>{q.options[last].correct ? 'Correct. ' : 'Not quite. '}</strong>
          {q.options[last].why}
          {!q.options[last].correct && <span className="block mt-1 opacity-80">Try another option.</span>}
        </div>
      )}

      {questions.length > 1 && (
        <div className="flex justify-between mt-4">
          <button
            onClick={() => setIndex((i) => Math.max(0, i - 1))}
            disabled={index === 0}
            className="text-sm px-3 py-1.5 rounded-lg text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/[0.06] disabled:opacity-40"
          >
            ← Previous
          </button>
          <button
            onClick={() => setIndex((i) => Math.min(questions.length - 1, i + 1))}
            disabled={index === questions.length - 1}
            className="text-sm px-3 py-1.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-40"
          >
            Next question →
          </button>
        </div>
      )}
    </div>
  );
};
