import React from 'react';
import { BookOpen, Hand, ChevronDown, Info, CheckCircle2, AlertTriangle, XCircle, Lightbulb } from 'lucide-react';
import { Quiz, QuizQuestion } from '../learn/LearningKit';

/*
 * Building blocks for one lesson. A lesson reads top to bottom as:
 *   <Explain>  short idea, optional <Figure>
 *   <Try>      one interactive, with one task
 *   <Check>    one or two questions
 *   <GoDeeper> optional, collapsed extras
 * Keep each lesson to a single idea. If it needs a second Try, it is two lessons.
 */

const sectionLabel = 'flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400';

export const Explain: React.FC<{ children: React.ReactNode; title?: string }> = ({ children, title = 'Understand' }) => (
  <section className="space-y-3">
    <h2 className={sectionLabel}>
      <BookOpen className="w-4 h-4" />
      {title}
    </h2>
    <div className="lesson-prose">{children}</div>
  </section>
);

export const Try: React.FC<{ task: React.ReactNode; children: React.ReactNode }> = ({ task, children }) => (
  <section className="space-y-3">
    <h2 className={sectionLabel}>
      <Hand className="w-4 h-4" />
      Try it
    </h2>
    <p className="text-[15px] leading-7 text-slate-800 dark:text-slate-100">{task}</p>
    <div className="rounded-2xl bg-white ring-1 ring-slate-200 dark:bg-white/[0.03] dark:ring-white/10 p-4 sm:p-6">{children}</div>
  </section>
);

export const Check: React.FC<{ persistKey: string; questions: QuizQuestion[] }> = ({ persistKey, questions }) => (
  <section className="space-y-3">
    <h2 className={sectionLabel}>
      <CheckCircle2 className="w-4 h-4" />
      Quick check
    </h2>
    <Quiz persistKey={persistKey} questions={questions} title={questions.length > 1 ? `${questions.length} questions` : 'One question'} />
  </section>
);

export const GoDeeper: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <details className="group rounded-xl bg-slate-50 dark:bg-white/[0.03] [&_summary::-webkit-details-marker]:hidden">
    <summary className="flex cursor-pointer select-none items-center justify-between gap-3 px-4 py-3 text-sm font-medium text-slate-700 dark:text-slate-200">
      <span>
        <span className="text-slate-500 dark:text-slate-400 mr-2">Go deeper</span>
        {title}
      </span>
      <ChevronDown className="w-4 h-4 text-slate-400 transition-transform group-open:rotate-180" />
    </summary>
    <div className="px-4 pb-4 lesson-prose">{children}</div>
  </details>
);

const TONES = {
  info: { icon: Info, box: 'bg-sky-50 text-sky-950 dark:bg-sky-400/[0.08] dark:text-sky-50', ic: 'text-sky-600 dark:text-sky-300' },
  success: { icon: CheckCircle2, box: 'bg-emerald-50 text-emerald-950 dark:bg-emerald-400/[0.08] dark:text-emerald-50', ic: 'text-emerald-600 dark:text-emerald-300' },
  warning: { icon: AlertTriangle, box: 'bg-amber-50 text-amber-950 dark:bg-amber-400/[0.08] dark:text-amber-50', ic: 'text-amber-600 dark:text-amber-300' },
  danger: { icon: XCircle, box: 'bg-rose-50 text-rose-950 dark:bg-rose-400/[0.08] dark:text-rose-50', ic: 'text-rose-600 dark:text-rose-300' },
  idea: { icon: Lightbulb, box: 'bg-indigo-50 text-indigo-950 dark:bg-indigo-400/[0.08] dark:text-indigo-50', ic: 'text-indigo-600 dark:text-indigo-300' },
} as const;

/** A single highlighted note. Use sparingly: at most one or two per lesson. */
export const Callout: React.FC<{ tone?: keyof typeof TONES; title?: React.ReactNode; children: React.ReactNode; className?: string }> = ({
  tone = 'info',
  title,
  children,
  className = '',
}) => {
  const t = TONES[tone];
  const Icon = t.icon;
  return (
    <div className={`flex gap-3 rounded-xl p-4 text-sm leading-6 ${t.box} ${className}`} role={tone === 'danger' ? 'alert' : undefined}>
      <Icon className={`w-5 h-5 shrink-0 mt-0.5 ${t.ic}`} />
      <div>
        {title && <p className="font-semibold mb-0.5">{title}</p>}
        {children}
      </div>
    </div>
  );
};

export const Figure: React.FC<{ caption: React.ReactNode; children: React.ReactNode }> = ({ caption, children }) => (
  <figure className="my-2 rounded-2xl bg-white ring-1 ring-slate-200 dark:bg-white/[0.03] dark:ring-white/10 p-4 sm:p-6 text-slate-700 dark:text-slate-200">
    {children}
    <figcaption className="mt-3 text-sm text-slate-500 dark:text-slate-400">{caption}</figcaption>
  </figure>
);

/** A big number with a label — for simulation outputs. */
export const Stat: React.FC<{ label: string; value: React.ReactNode; tone?: 'neutral' | 'good' | 'bad'; hint?: string }> = ({
  label,
  value,
  tone = 'neutral',
  hint,
}) => (
  <div className="rounded-xl bg-slate-50 dark:bg-white/[0.04] px-4 py-3">
    <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
    <p
      className={`mt-0.5 text-2xl font-semibold tabular-nums ${
        tone === 'good' ? 'text-emerald-600 dark:text-emerald-400' : tone === 'bad' ? 'text-rose-600 dark:text-rose-400' : 'text-slate-900 dark:text-white'
      }`}
    >
      {value}
    </p>
    {hint && <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{hint}</p>}
  </div>
);

/** Labeled range input with its current value. */
export const Slider: React.FC<{
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  onChange: (v: number) => void;
  hint?: string;
}> = ({ label, value, min, max, step = 1, unit = '', onChange, hint }) => (
  <label className="block">
    <span className="flex items-baseline justify-between text-sm">
      <span className="font-medium text-slate-700 dark:text-slate-200">{label}</span>
      <span className="tabular-nums text-slate-900 dark:text-white font-semibold">
        {value}
        {unit && <span className="text-slate-500 dark:text-slate-400 font-normal ml-0.5">{unit}</span>}
      </span>
    </span>
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className="mt-2 w-full accent-indigo-600"
    />
    {hint && <span className="block text-xs text-slate-500 dark:text-slate-400 mt-1">{hint}</span>}
  </label>
);

type BtnVariant = 'primary' | 'secondary' | 'danger' | 'ghost';
const BTN: Record<BtnVariant, string> = {
  primary: 'bg-indigo-600 text-white hover:bg-indigo-500 shadow-sm',
  secondary: 'bg-white text-slate-800 ring-1 ring-slate-300 hover:bg-slate-50 dark:bg-white/[0.06] dark:text-slate-100 dark:ring-white/15 dark:hover:bg-white/[0.1]',
  danger: 'bg-rose-600 text-white hover:bg-rose-500 shadow-sm',
  ghost: 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/[0.06]',
};

export const Button: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant }> = ({
  variant = 'secondary',
  className = '',
  ...rest
}) => (
  <button
    {...rest}
    className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${BTN[variant]} ${className}`}
  />
);

/** Two-to-five option segmented control. */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-lg bg-slate-100 dark:bg-white/[0.06] p-1">
      {options.map((o) => (
        <button
          key={o.value}
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
            value === o.value
              ? 'bg-white text-slate-900 shadow-sm dark:bg-white/[0.12] dark:text-white'
              : 'text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
