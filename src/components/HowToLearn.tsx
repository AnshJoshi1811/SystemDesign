import React, { useEffect, useRef, useState } from 'react';
import { HelpCircle, X, BookOpen, Zap, CheckCircle, ArrowRight } from 'lucide-react';

const STEPS = [
  {
    icon: BookOpen,
    label: 'Read',
    desc: 'Each lesson starts with one concept — short enough to hold in your head.',
  },
  {
    icon: Zap,
    label: 'Break it',
    desc: 'Run the interactive simulation. Crash a server. Push the slider past its limit. See what fails.',
  },
  {
    icon: CheckCircle,
    label: 'Check',
    desc: 'Answer one question to lock in the idea before moving on.',
  },
  {
    icon: ArrowRight,
    label: 'Next lesson',
    desc: 'Each chapter is 8–11 short lessons. Finish one, start the next chapter.',
  },
];

export const HowToLearn: React.FC = () => {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent) { if (e.key === 'Escape') setOpen(false); return; }
      if (!panelRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors"
        style={{
          background: 'var(--surface-muted)',
          color: 'var(--text-muted)',
          border: '1px solid var(--header-border)',
        }}
        onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
        onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--header-border)')}
        aria-label="How to use this site"
        aria-expanded={open}
      >
        <HelpCircle className="w-3.5 h-3.5 shrink-0" />
        How to learn
      </button>

      {open && (
        <div
          ref={panelRef}
          role="dialog"
          aria-label="How to learn"
          className="absolute left-0 mt-2 w-80 rounded-2xl p-5 z-50"
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--header-border)',
            boxShadow: '0 12px 40px rgba(0,0,0,0.2)',
          }}
        >
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm font-semibold" style={{ color: 'var(--text-base)' }}>
              How to use this course
            </p>
            <button
              onClick={() => setOpen(false)}
              className="rounded-lg p-1 transition-opacity hover:opacity-60"
              style={{ color: 'var(--text-subtle)' }}
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Steps */}
          <ol className="space-y-3">
            {STEPS.map((s, i) => {
              const Icon = s.icon;
              return (
                <li key={s.label} className="flex items-start gap-3">
                  <span
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold mt-0.5"
                    style={{ background: 'var(--accent)', color: 'var(--accent-fg)' }}
                  >
                    {i + 1}
                  </span>
                  <div>
                    <p className="text-sm font-semibold flex items-center gap-1.5" style={{ color: 'var(--text-base)' }}>
                      <Icon className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--text-subtle)' }} />
                      {s.label}
                    </p>
                    <p className="text-xs leading-relaxed mt-0.5" style={{ color: 'var(--text-muted)' }}>
                      {s.desc}
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>

          {/* Tip */}
          <div
            className="mt-4 rounded-xl px-3 py-2.5 text-xs leading-relaxed"
            style={{ background: 'var(--surface-muted)', color: 'var(--text-muted)' }}
          >
            💡 <strong style={{ color: 'var(--text-base)' }}>Tip:</strong> Use{' '}
            <kbd className="rounded px-1 py-0.5 text-[10px] font-mono" style={{ background: 'var(--header-border)' }}>⌘K</kbd>{' '}
            to search across all chapters and lessons instantly.
          </div>
        </div>
      )}
    </div>
  );
};
