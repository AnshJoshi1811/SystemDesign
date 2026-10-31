import React from 'react';
import { ArrowRight, Check, BookOpen, ExternalLink } from 'lucide-react';
import { CHAPTERS, readProgress } from '../chapters';
import { useNav } from './lesson/ChapterPlayer';
import { ModuleType } from '../types';

// Devicon SVG via cdnjs — plain colored SVG icons
const TechLogo: React.FC<{ name: string; icon: string; color: string }> = ({ name, icon, color }) => (
  <span
    title={name}
    className="flex items-center justify-center w-6 h-6 rounded"
    style={{ background: 'var(--surface-muted)' }}
  >
    <img
      src={`https://cdn.jsdelivr.net/npm/devicons@2.2.0/!SVG/${icon}.svg`}
      alt={name}
      width={16}
      height={16}
      style={{ filter: 'none' }}
      onError={(e) => {
        // fallback: colored dot
        const target = e.currentTarget as HTMLImageElement;
        target.style.display = 'none';
        const dot = document.createElement('span');
        dot.style.width = '8px';
        dot.style.height = '8px';
        dot.style.borderRadius = '50%';
        dot.style.background = color;
        dot.style.display = 'inline-block';
        target.parentElement?.appendChild(dot);
      }}
    />
  </span>
);

export const Home: React.FC<{ lastChapter: ModuleType | null }> = ({ lastChapter }) => {
  const { go } = useNav();
  const resume = lastChapter ? CHAPTERS.find((c) => c.id === lastChapter) : undefined;
  const resumeProgress = resume ? readProgress(resume.id) : null;

  return (
    <div className="max-w-5xl mx-auto">
      {/* Hero */}
      <section className="py-10 sm:py-16">
        <p className="text-xs font-semibold tracking-widest uppercase mb-3" style={{ color: 'var(--text-subtle)' }}>
          System Design Interview · Chapters 1–8
        </p>
        <h1 className="text-3xl sm:text-5xl font-bold tracking-tight leading-tight max-w-2xl" style={{ color: 'var(--text-base)' }}>
          Learn system design by building, breaking, and fixing it.
        </h1>
        <p className="mt-5 text-base sm:text-lg leading-relaxed max-w-2xl" style={{ color: 'var(--text-muted)' }}>
          Each chapter is a short series of lessons. Read one idea, try it in a simulation, answer one question, move on.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <button
            onClick={() => go(resume ? resume.id : 'chapter1')}
            className="btn-primary"
          >
            {resume ? `Continue Chapter ${resume.num}` : 'Start with Chapter 1'}
            {resume && resumeProgress && resumeProgress.total > 0 && (
              <span className="opacity-60 text-xs">· lesson {resumeProgress.lesson + 1} of {resumeProgress.total}</span>
            )}
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </section>

      {/* Chapter grid */}
      <section aria-label="Chapters" className="grid gap-3 sm:grid-cols-2">
        {CHAPTERS.map((c) => {
          const p = readProgress(c.id);
          const pct = p && p.total ? Math.round((p.done / p.total) * 100) : 0;
          const complete = p && p.total > 0 && p.done >= p.total;

          return (
            <div
              key={c.id}
              className="chapter-card group relative"
            >
              {/* Main clickable area */}
              <button
                onClick={() => go(c.id)}
                className="w-full text-left"
                style={{ background: 'transparent', border: 'none', padding: 0, cursor: 'pointer' }}
              >
                <div className="flex items-start gap-4">
                  {/* Chapter number / complete badge */}
                  <span
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold transition-colors"
                    style={
                      complete
                        ? { background: 'var(--accent)', color: 'var(--accent-fg)' }
                        : { background: 'var(--surface-muted)', color: 'var(--text-muted)' }
                    }
                  >
                    {complete ? <Check className="w-4 h-4" strokeWidth={3} /> : c.num}
                  </span>

                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-sm sm:text-base" style={{ color: 'var(--text-base)' }}>{c.title}</p>
                    <p className="mt-1 text-sm" style={{ color: 'var(--text-muted)' }}>{c.blurb}</p>

                    {/* Tech logos */}
                    {c.techLogos.length > 0 && (
                      <div className="mt-3 flex flex-wrap items-center gap-1.5">
                        {c.techLogos.map((logo) => (
                          <span
                            key={logo.name}
                            title={logo.name}
                            className="flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium"
                            style={{ background: 'var(--surface-muted)', color: 'var(--text-muted)', border: '1px solid var(--header-border)' }}
                          >
                            <span
                              className="w-2 h-2 rounded-full shrink-0"
                              style={{ background: logo.color }}
                            />
                            {logo.name}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Progress bar */}
                    {p && p.total > 0 && (
                      <div className="mt-3 flex items-center gap-3">
                        <div className="h-1 flex-1 rounded-full overflow-hidden" style={{ background: 'var(--surface-muted)' }}>
                          <div
                            className="h-full rounded-full transition-all"
                            style={{ width: `${pct}%`, background: 'var(--progress-bar)' }}
                          />
                        </div>
                        <span className="text-xs tabular-nums" style={{ color: 'var(--text-subtle)' }}>
                          {p.done}/{p.total}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </button>

              {/* Medium article link — separate clickable area so it doesn't trigger chapter open */}
              {c.mediumUrl && (
                <div className="mt-4 pt-3 flex items-center gap-1.5" style={{ borderTop: '1px solid var(--header-border)' }}>
                  <BookOpen className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--text-subtle)' }} />
                  <a
                    href={c.mediumUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-medium flex items-center gap-1 transition-opacity hover:opacity-70"
                    style={{ color: 'var(--text-muted)' }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    Read on Medium
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              )}
            </div>
          );
        })}
      </section>

      {/* Footer gap */}
      <div className="h-16" />
    </div>
  );
};
