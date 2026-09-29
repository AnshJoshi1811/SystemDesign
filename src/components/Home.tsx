import React from 'react';
import { ArrowRight, Check } from 'lucide-react';
import { CHAPTERS, readProgress } from '../chapters';
import { useNav } from './lesson/ChapterPlayer';
import { ModuleType } from '../types';

export const Home: React.FC<{ lastChapter: ModuleType | null }> = ({ lastChapter }) => {
  const { go } = useNav();
  const resume = lastChapter ? CHAPTERS.find((c) => c.id === lastChapter) : undefined;
  const resumeProgress = resume ? readProgress(resume.id) : null;

  return (
    <div className="max-w-5xl mx-auto">
      <section className="py-6 sm:py-10">
        <p className="text-sm font-medium text-indigo-600 dark:text-indigo-300">System Design Interview · Chapters 1–8</p>
        <h1 className="mt-2 text-3xl sm:text-4xl font-semibold tracking-tight text-slate-900 dark:text-white max-w-2xl">
          Learn system design by building it, breaking it, and fixing it.
        </h1>
        <p className="mt-4 text-lg leading-relaxed text-slate-600 dark:text-slate-300 max-w-2xl">
          Each chapter is a short series of lessons. Read one idea, try it in a small simulation, answer one question, move on.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <button
            onClick={() => go(resume ? resume.id : 'chapter1')}
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-5 py-3 text-sm font-medium text-white shadow-sm hover:bg-indigo-500"
          >
            {resume ? `Continue Chapter ${resume.num}` : 'Start with Chapter 1'}
            {resume && resumeProgress && resumeProgress.total > 0 && (
              <span className="text-indigo-200">· lesson {resumeProgress.lesson + 1} of {resumeProgress.total}</span>
            )}
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </section>

      <section aria-label="Chapters" className="grid gap-3 sm:grid-cols-2">
        {CHAPTERS.map((c) => {
          const p = readProgress(c.id);
          const pct = p && p.total ? Math.round((p.done / p.total) * 100) : 0;
          const complete = p && p.total > 0 && p.done >= p.total;
          return (
            <button
              key={c.id}
              onClick={() => go(c.id)}
              className="group text-left rounded-2xl bg-white ring-1 ring-slate-200 hover:ring-indigo-300 hover:shadow-md dark:bg-white/[0.03] dark:ring-white/10 dark:hover:ring-indigo-400/40 p-5 transition-all"
            >
              <div className="flex items-start gap-4">
                <span
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${
                    complete
                      ? 'bg-emerald-500 text-white'
                      : 'bg-slate-100 text-slate-700 group-hover:bg-indigo-600 group-hover:text-white dark:bg-white/10 dark:text-slate-200'
                  } transition-colors`}
                >
                  {complete ? <Check className="w-4 h-4" strokeWidth={3} /> : c.num}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-slate-900 dark:text-white">{c.title}</p>
                  <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{c.blurb}</p>
                  {p && p.total > 0 && (
                    <div className="mt-3 flex items-center gap-3">
                      <div className="h-1.5 flex-1 rounded-full bg-slate-100 dark:bg-white/10 overflow-hidden">
                        <div className="h-full rounded-full bg-emerald-500" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-xs tabular-nums text-slate-500 dark:text-slate-400">
                        {p.done}/{p.total}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </section>
    </div>
  );
};
