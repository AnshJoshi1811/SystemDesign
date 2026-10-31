import React from 'react';
import { ArrowRight, Check, BookOpen, ExternalLink, Lock } from 'lucide-react';
import { HowToLearn } from './HowToLearn';
import { useLang } from '../lib/i18n';
import { CHAPTERS, readProgress } from '../chapters';
import { useNav } from './lesson/ChapterPlayer';
import { ModuleType } from '../types';

export const Home: React.FC<{ lastChapter: ModuleType | null }> = ({ lastChapter }) => {
  const { go } = useNav();
  const { lang } = useLang();
  const resume = lastChapter ? CHAPTERS.find((c) => c.id === lastChapter) : undefined;
  const resumeProgress = resume ? readProgress(resume.id) : null;

  const totalLessons = 8;
  const completedChapters = CHAPTERS.filter((c) => {
    const p = readProgress(c.id);
    return p && p.total > 0 && p.done >= p.total;
  }).length;

  return (
    <div className="max-w-4xl mx-auto">

      {/* ── Hero ── */}
      <section className="pt-12 pb-10 sm:pt-16 sm:pb-12">
        <p
          className="text-[11px] font-semibold tracking-[0.15em] uppercase mb-4"
          style={{ color: 'var(--text-subtle)' }}
        >
          {lang === 'hi' ? 'System Design Interview · Chapters 1–8' : 'System Design Interview · Chapters 1–8'}
        </p>
        <h1
          className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight leading-[1.15] max-w-2xl"
          style={{ color: 'var(--text-base)' }}
        >
          {lang === 'hi' ? (
            <>System design seekho<br className="hidden sm:block" /> karke, padhke nahi.</>
          ) : (
            <>Learn system design by<br className="hidden sm:block" /> doing, not reading.</>
          )}
        </h1>
        <p
          className="mt-4 text-base sm:text-lg leading-relaxed max-w-xl"
          style={{ color: 'var(--text-muted)' }}
        >
          {lang === 'hi'
            ? 'Alex Xu ki System Design Interview book ke har chapter pe interactive labs. Ek concept padho, simulation chalao, ek question ka jawab do, aage badho.'
            : "Interactive labs covering every chapter of Alex Xu's System Design Interview book. Read one concept, run it in a simulation, answer a question, move on."}
        </p>

        <div className="mt-7 flex flex-wrap items-center gap-3">
          <button
            onClick={() => go(resume ? resume.id : 'chapter1')}
            className="btn-primary"
          >
            {resume
              ? (lang === 'hi' ? `Aage badho · Ch ${resume.num}` : `Continue · Ch ${resume.num}`)
              : (lang === 'hi' ? 'Chapter 1 shuru karo' : 'Start Chapter 1')}
            {resume && resumeProgress && resumeProgress.total > 0 && (
              <span className="opacity-50 text-xs font-normal">
                {lang === 'hi' ? `lesson ${resumeProgress.lesson + 1}/${resumeProgress.total}` : `lesson ${resumeProgress.lesson + 1}/${resumeProgress.total}`}
              </span>
            )}
            <ArrowRight className="w-4 h-4 shrink-0" />
          </button>

          <HowToLearn />

          {/* Progress pill */}
          {completedChapters > 0 && (
            <span
              className="text-sm px-3 py-1.5 rounded-full"
              style={{ background: 'var(--surface-muted)', color: 'var(--text-muted)' }}
            >
              {completedChapters}/{totalLessons} {lang === 'hi' ? 'poora hua' : 'done'}
            </span>
          )}
        </div>
      </section>

      {/* ── Chapter grid ── */}
      <section aria-label="Chapters">
        <div className="grid gap-3 sm:grid-cols-2">
          {CHAPTERS.map((c) => {
            const p = readProgress(c.id);
            const pct = p && p.total ? Math.round((p.done / p.total) * 100) : 0;
            const complete = p && p.total > 0 && p.done >= p.total;
            const started = p && p.done > 0 && !complete;

            return (
              <div key={c.id} className="chapter-card">

                {/* ── Top: chapter num + title + blurb ── */}
                <button
                  onClick={() => go(c.id)}
                  className="flex items-start gap-3.5 text-left w-full group/btn"
                  style={{ background: 'transparent', border: 'none', padding: 0, cursor: 'pointer' }}
                >
                  {/* Number badge */}
                  <span
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold mt-0.5 transition-colors"
                    style={
                      complete
                        ? { background: 'var(--accent)', color: 'var(--accent-fg)' }
                        : { background: 'var(--surface-muted)', color: 'var(--text-muted)' }
                    }
                  >
                    {complete ? <Check className="w-3.5 h-3.5" strokeWidth={2.5} /> : c.num}
                  </span>

                  <div className="min-w-0 flex-1">
                    <p
                      className="font-semibold text-sm leading-snug"
                      style={{ color: 'var(--text-base)' }}
                    >
                      {c.title}
                    </p>
                    <p
                      className="mt-1 text-xs leading-relaxed"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      {c.blurb}
                    </p>
                  </div>
                </button>

                {/* ── Tech pills ── */}
                {c.techLogos.length > 0 && (
                  <div className="mt-3.5 flex flex-wrap gap-1.5">
                    {c.techLogos.map((logo) => (
                      <span
                        key={logo.name}
                        className="flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium"
                        style={{
                          background: 'var(--surface-muted)',
                          color: 'var(--text-muted)',
                          border: '1px solid var(--header-border)',
                        }}
                      >
                        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: logo.color }} />
                        {logo.name}
                      </span>
                    ))}
                  </div>
                )}

                {/* ── Spacer pushes footer to bottom ── */}
                <div className="flex-1" />

                {/* ── Progress bar (only if started) ── */}
                {started && (
                  <div className="mt-4 flex items-center gap-2.5">
                    <div
                      className="h-1 flex-1 rounded-full overflow-hidden"
                      style={{ background: 'var(--surface-muted)' }}
                    >
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${pct}%`, background: 'var(--progress-bar)' }}
                      />
                    </div>
                    <span className="text-[11px] tabular-nums shrink-0" style={{ color: 'var(--text-subtle)' }}>
                      {p!.done}/{p!.total}
                    </span>
                  </div>
                )}

                {/* ── Footer: Medium link OR open button ── */}
                <div
                  className="mt-3.5 pt-3 flex items-center justify-between gap-2"
                  style={{ borderTop: '1px solid var(--header-border)' }}
                >
                  {c.mediumUrl ? (
                    <a
                      href={c.mediumUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 text-[11px] font-medium transition-opacity hover:opacity-60"
                      style={{ color: 'var(--text-subtle)' }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <BookOpen className="w-3 h-3 shrink-0" />
                      {lang === 'hi' ? 'Medium pe padho' : 'Read on Medium'}
                      <ExternalLink className="w-3 h-3 shrink-0" />
                    </a>
                  ) : (
                    <span
                      className="flex items-center gap-1.5 text-[11px]"
                      style={{ color: 'var(--text-subtle)' }}
                    >
                      <Lock className="w-3 h-3 shrink-0" />
                      {lang === 'hi' ? 'Abhi article nahi hai' : 'No article yet'}
                    </span>
                  )}

                  <button
                    onClick={() => go(c.id)}
                    className="flex items-center gap-1 text-[11px] font-medium transition-opacity hover:opacity-60 shrink-0"
                    style={{ color: 'var(--text-subtle)', background: 'transparent', border: 'none', cursor: 'pointer' }}
                  >
                    {complete
                      ? (lang === 'hi' ? 'Review' : 'Review')
                      : started
                        ? (lang === 'hi' ? 'Aage badho' : 'Continue')
                        : (lang === 'hi' ? 'Shuru karo' : 'Start')}
                    <ArrowRight className="w-3 h-3" />
                  </button>
                </div>

              </div>
            );
          })}
        </div>
      </section>

      <div className="h-20" />
    </div>
  );
};
