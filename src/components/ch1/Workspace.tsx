import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Boxes,
  BookOpen,
  Clock,
  RotateCcw,
  Check,
  ChevronDown,
  Zap,
  Search,
  Flame,
  Wrench,
  CircleHelp,
  Minus,
  Plus,
  Settings2,
  X,
  PanelLeftClose,
  PanelLeftOpen,
  ExternalLink,
} from 'lucide-react';
import { usePersistentState } from '../../lib/usePersistentState';
import { useLang } from '../../lib/i18n';
import { WhatChanged, Quiz } from '../learn/LearningKit';
import { Callout, Segmented } from '../lesson/blocks';
import { useNav } from '../lesson/ChapterPlayer';
import { chapterById } from '../../chapters';
import { STAGES, StageContent } from './content';
import { FINAL_STAGE, STAGE_META, COMPONENT_INFO, TECH, KIND_NAME, Experiment } from './meta';
import { buildArch, simulate, Inputs, Failures, CAP, FAILOVER_MS, ArchNode, NodeState, Kind } from './model';
import { Diagram, ICON as KIND_ICON } from './Diagram';

/** "Read on Medium" link shown inside Concepts, everywhere it renders. */
const MediumLink: React.FC<{ url: string; lang: 'en' | 'hi' }> = ({ url, lang }) => (
  <a
    href={url}
    target="_blank"
    rel="noopener noreferrer"
    className="group/medium flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium transition-all"
    style={{ background: 'var(--surface-muted)', border: '1px solid var(--header-border)', color: 'var(--text-base)' }}
    onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = 'var(--shadow-float-sm)'; }}
    onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--header-border)'; e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'none'; }}
  >
    <BookOpen className="h-4 w-4 shrink-0" style={{ color: 'var(--text-subtle)' }} />
    <span className="flex-1">{lang === 'hi' ? 'Medium pe poora article padho' : 'Read the full article on Medium'}</span>
    <ExternalLink className="h-3.5 w-3.5 shrink-0 transition-transform group-hover/medium:translate-x-0.5 group-hover/medium:-translate-y-0.5" style={{ color: 'var(--text-subtle)' }} />
  </a>
);

/** One icon button in the left vertical toolbar — active state, danger tone for destructive actions, tooltip flyout on hover. */
const ToolbarIcon: React.FC<{
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
  active?: boolean;
  tone?: 'default' | 'danger';
}> = ({ icon: Icon, label, onClick, active = false, tone = 'default' }) => {
  const [hover, setHover] = useState(false);
  const danger = tone === 'danger';
  return (
    <div className="relative">
      <button
        onClick={onClick}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        className="flex h-9 w-9 items-center justify-center rounded-lg transition-all duration-150"
        style={{
          background: active ? 'var(--accent)' : hover ? (danger ? 'rgba(225,29,72,0.1)' : 'var(--surface-muted)') : 'transparent',
          color: danger ? '#e11d48' : active ? 'var(--accent-fg)' : 'var(--text-subtle)',
          transform: hover ? 'scale(1.06)' : 'scale(1)',
        }}
        aria-label={label}
        title={label}
      >
        <Icon className="h-[18px] w-[18px]" />
      </button>

      {hover && (
        <span
          className="pointer-events-none absolute left-full top-1/2 z-50 ml-2.5 -translate-y-1/2 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-xs font-medium"
          style={{ background: 'var(--surface)', border: '1px solid var(--header-border)', boxShadow: 'var(--shadow-float-sm)', color: 'var(--text-base)' }}
        >
          {label}
        </span>
      )}
    </div>
  );
};

/** Small static icon badge shown next to a panel's title (component kind, or a book for Concepts). */
const KindIconBadge: React.FC<{ icon: React.ComponentType<{ className?: string }> }> = ({ icon: Icon }) => (
  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md" style={{ color: 'var(--text-subtle)', background: 'var(--surface)' }}>
    <Icon className="h-3.5 w-3.5" />
  </span>
);

/** Always-visible close button for a floating panel — no hover-to-reveal, so it works on touch too. */
const PanelCloseButton: React.FC<{ onClose: () => void; label: string }> = ({ onClose, label }) => (
  <button
    onClick={onClose}
    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-colors"
    style={{ color: 'var(--text-subtle)' }}
    onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface)'; e.currentTarget.style.color = 'var(--text-base)'; }}
    onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-subtle)'; }}
    title={label}
    aria-label={label}
  >
    <X className="h-4 w-4" />
  </button>
);

const ALL_STAGES: StageContent[] = [...STAGES, FINAL_STAGE];
const N = ALL_STAGES.length;

type Tab = 'architecture' | 'concepts';
type FlowStep = 'learn' | 'explore' | 'break' | 'fix' | 'check';
type Flow = Record<FlowStep, boolean>;
const EMPTY_FLOW: Flow = { learn: false, explore: false, break: false, fix: false, check: false };

const hasFix = (i: number) => i >= 1 && i <= 9;
const levelFor = (i: number, after: boolean) => (i === 0 ? 1 : i === N - 1 ? 10 : after ? i + 1 : i);
const noFailures = (): Failures => ({ crashed: [], masterDownAt: null, scenario: null, scenarioAt: null });

// Traffic slider is logarithmic: 50 .. 20,000 requests/s.
const posToRps = (p: number) => {
  const raw = 50 * Math.pow(400, p / 100);
  const mag = Math.pow(10, Math.floor(Math.log10(raw)) - 1);
  return Math.round(raw / mag) * mag;
};
const rpsToPos = (r: number) => Math.round((Math.log(r / 50) / Math.log(400)) * 100);

export const Chapter1Workspace: React.FC = () => {
  const { resetChapter } = useNav();
  const [stage, setStage] = usePersistentState<number>('chapter1:stage', 0);
  const [storedTab, setTab] = usePersistentState<Tab>('chapter1:tab', 'concepts');
  const tab: Tab = storedTab === 'concepts' ? 'concepts' : 'architecture';
  const [sidebarCollapsed, setSidebarCollapsed] = usePersistentState<boolean>('chapter1:sidebar:collapsed', false);
  // Which panel sits on the right in Miro mode. A clicked component always overrides this to 'components'.
  const [rightPanel, setRightPanel] = useState<'concepts' | 'components' | 'simControls' | null>('concepts');
  const { lang } = useLang();

  // When in Miro mode, add a body class so the global main padding tightens
  useEffect(() => {
    if (sidebarCollapsed) {
      document.body.classList.add('miro-mode');
    } else {
      document.body.classList.remove('miro-mode');
    }
    return () => { document.body.classList.remove('miro-mode'); };
  }, [sidebarCollapsed]);
  const [flows, setFlows] = usePersistentState<Record<number, Flow>>('chapter1:flow', {});
  const [afterMap, setAfterMap] = usePersistentState<Record<number, boolean>>('chapter1:after', {});
  const [inputsMap, setInputsMap] = usePersistentState<Record<number, Inputs>>('chapter1:inputs', {});
  const [pickerOpen, setPickerOpen] = useState(false);

  const i = Math.min(Math.max(0, stage), N - 1);
  const content = ALL_STAGES[i];
  const meta = STAGE_META[i];
  const chapterMeta = chapterById('chapter1');
  const after = hasFix(i) ? afterMap[i] ?? true : true; // open on this stage's own design
  const level = levelFor(i, after);
  const inputs: Inputs = inputsMap[i] ?? { ...meta.defaults, cacheHit: 80 };
  const arch = useMemo(() => buildArch(level, inputs.websPerDc), [level, inputs.websPerDc]);

  const [fail, setFail] = useState<Failures>(noFailures);
  const [selected, setSelected] = useState<string | null>(meta.keyNode);
  const rightPanelOpen = !!selected || rightPanel !== null;
  const [now, setNow] = useState(Date.now());

  // Clock for timed effects (replica promotion, queue draining).
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, []);

  const sim = simulate(arch, inputs, fail, now);
  const flow = flows[i] ?? EMPTY_FLOW;
  const effFlow: Flow = { ...flow, fix: hasFix(i) ? flow.fix : flow.break || i === N - 1, break: i === N - 1 ? true : flow.break };
  const stageDone = (k: number) => {
    const f = flows[k] ?? EMPTY_FLOW;
    const brk = k === N - 1 ? true : f.break;
    const fix = hasFix(k) ? f.fix : brk;
    return f.learn && f.explore && brk && fix && f.check;
  };
  const doneCount = ALL_STAGES.filter((_, k) => stageDone(k)).length;

  // Publish progress for the home screen.
  useEffect(() => {
    try {
      localStorage.setItem('sd:chapter1:progress', JSON.stringify({ done: doneCount, total: N, lesson: i }));
    } catch {
      // ignore
    }
  }, [doneCount, i]);

  const mark = (step: FlowStep) =>
    setFlows((prev) => (prev[i]?.[step] ? prev : { ...prev, [i]: { ...(prev[i] ?? EMPTY_FLOW), [step]: true } }));

  const goStage = (k: number) => {
    setStage(k);
    setFail(noFailures());
    setSelected(STAGE_META[k].keyNode);
    setPickerOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const setInputs = (patch: Partial<Inputs>) => setInputsMap((prev) => ({ ...prev, [i]: { ...inputs, ...patch } }));

  const setAfter = (v: boolean) => {
    setAfterMap((prev) => ({ ...prev, [i]: v }));
    if (v) mark('fix');
    // Keep the active failure so the learner sees the fixed design survive it.
    const nextArch = buildArch(levelFor(i, v), inputs.websPerDc);
    setFail((prev) => {
      const crashed = prev.crashed.filter((id) => nextArch.all.some((n) => n.id === id));
      const masterCrashed = crashed.includes('db') && nextArch.f.replicas;
      return { ...prev, crashed, masterDownAt: masterCrashed ? Date.now() : null };
    });
    if (!nextArch.all.some((n) => n.id === selected)) setSelected(STAGE_META[i].keyNode);
  };

  const crash = (id: string) => {
    const node = arch.all.find((n) => n.id === id);
    if (!node) return;
    setFail((prev) => ({
      ...prev,
      crashed: prev.crashed.includes(id) ? prev.crashed : [...prev.crashed, id],
      masterDownAt: id === 'db' && arch.f.replicas ? Date.now() : prev.masterDownAt,
    }));
    mark('break');
  };
  const recover = (id: string) =>
    setFail((prev) => ({ ...prev, crashed: prev.crashed.filter((c) => c !== id), masterDownAt: id === 'db' ? null : prev.masterDownAt }));
  const clearFailures = () => setFail(noFailures());

  const runExperiment = (ex: Experiment) => {
    if ('crash' in ex.action) {
      crash(ex.action.crash);
    } else {
      setFail((prev) => ({ ...prev, scenario: (ex.action as { scenario: Failures['scenario'] }).scenario, scenarioAt: Date.now() }));
      mark('break');
    }
    setTab('architecture');
  };

  const openTab = (t: Tab) => {
    setTab(t);
    if (t === 'concepts') mark('learn');
  };

  const select = (id: string) => {
    setSelected(id);
    mark('explore');
  };

  const failing = fail.crashed.length > 0 || fail.scenario !== null;
  const health: 'ok' | 'degraded' | 'outage' = sim.success === 0 ? 'outage' : sim.success < 0.99 || sim.apiMs > 500 || sim.loggedOutPct > 0 || sim.staticMs > 200 ? 'degraded' : 'ok';
  const selNode = arch.all.find((n) => n.id === selected) ?? null;

  // ---------------------------------------------------------------- render

  // Matches ChapterPlayer lessonList style exactly
  const stageList = (
    <ol className="space-y-0.5">
      {ALL_STAGES.map((s, k) => {
        const active = k === i;
        const done = stageDone(k);
        return (
          <li key={k}>
            <button
              onClick={() => goStage(k)}
              aria-current={active ? 'step' : undefined}
              className="w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors"
              style={{
                background: active ? 'var(--surface-muted)' : 'transparent',
                color: active ? 'var(--text-base)' : 'var(--text-muted)',
              }}
              onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'var(--surface-muted)'; }}
              onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent'; }}
            >
              <span
                className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold transition-all"
                style={{
                  background: done ? 'var(--accent)' : active ? 'var(--accent)' : 'var(--surface-muted)',
                  color: done || active ? 'var(--accent-fg)' : 'var(--text-subtle)',
                }}
              >
                {done ? <Check className="h-3 w-3" strokeWidth={3} /> : k + 1}
              </span>
              <span className="truncate">{s.title}</span>
            </button>
          </li>
        );
      })}
    </ol>
  );

  // Matches ChapterPlayer progressBar style exactly — inline, not a card
  const progressBar = (
    <div className="space-y-1.5">
      <div className="flex justify-between text-xs" style={{ color: 'var(--text-subtle)' }}>
        <span>{doneCount} of {N} stages done</span>
        <span>{Math.round((doneCount / N) * 100)}%</span>
      </div>
      <div className="h-1 rounded-full overflow-hidden" style={{ background: 'var(--surface-muted)' }}>
        <div className="h-full rounded-full transition-all" style={{ width: `${(doneCount / N) * 100}%`, background: 'var(--progress-bar)' }} />
      </div>
    </div>
  );

  return (
    <div className={`lg:grid lg:gap-10 transition-all duration-200 ${sidebarCollapsed ? 'lg:grid-cols-[0px_minmax(0,1fr)]' : 'lg:grid-cols-[250px_minmax(0,1fr)]'}`}>
      {/* ---------- Stage rail ---------- */}
      <aside className={`hidden lg:block overflow-hidden transition-all duration-200 ${sidebarCollapsed ? 'w-0 opacity-0 pointer-events-none' : 'w-[250px] opacity-100'}`}>
        <div className="sticky top-20 space-y-4 pr-2">
          <div>
            <p className="text-[10px] font-bold tracking-widest uppercase mb-0.5" style={{ color: 'var(--text-subtle)' }}>Chapter 1</p>
            <p className="text-xs mb-1" style={{ color: 'var(--text-subtle)' }}>System design foundations</p>
            <p className="text-base font-bold leading-snug" style={{ color: 'var(--text-base)' }}>Scale from 0 → 1M users</p>
          </div>
          {stageList}
          {progressBar}
          <button onClick={resetChapter} className="flex items-center gap-1.5 px-1 text-xs transition-opacity hover:opacity-60" style={{ color: 'var(--text-subtle)' }}>
            <RotateCcw className="h-3 w-3" /> Restart this chapter
          </button>
        </div>
      </aside>

      <div className={sidebarCollapsed ? 'min-w-0' : 'min-w-0 space-y-4'}>
        {/* ---------- Mobile stage picker ---------- */}
        <div className="lg:hidden rounded-xl bg-[var(--surface)] ring-1 ring-[var(--header-border)]">
          <button onClick={() => setPickerOpen((o) => !o)} aria-expanded={pickerOpen} className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left">
            <span className="min-w-0">
              <span className="block text-xs" style={{ color: 'var(--text-subtle)' }}>Stage {i + 1} of {N}</span>
              <span className="block truncate text-sm font-medium" style={{ color: 'var(--text-base)' }}>{content.title}</span>
            </span>
            <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${pickerOpen ? 'rotate-180' : ''}`} style={{ color: 'var(--text-subtle)' }} />
          </button>
          {pickerOpen && <div className="space-y-3 p-3" style={{ borderTop: '1px solid var(--header-border)' }}>{stageList}{progressBar}</div>}
        </div>

        {/* ---------- Stage header: compact strip in Miro mode, full header otherwise ---------- */}
        <header
          className={sidebarCollapsed ? 'flex items-center gap-3' : 'flex items-start justify-between gap-4'}
          style={
            sidebarCollapsed
              ? {
                  // Thin single-line strip, ~92% of the viewport, centered
                  width: '92vw',
                  marginLeft: 'calc(-46vw + 50%)',
                  padding: '10px 20px',
                  borderBottom: '1px solid var(--header-border)',
                  background: 'var(--surface)',
                  borderRadius: '12px 12px 0 0',
                  border: '1px solid var(--header-border)',
                  borderBottomWidth: 0,
                }
              : { paddingTop: 4 }
          }
        >
          {sidebarCollapsed ? (
            /* ─── MIRO MODE: thin strip ─── */
            <>
              <button
                onClick={() => setSidebarCollapsed(c => !c)}
                className="flex items-center justify-center w-7 h-7 rounded-lg transition-colors shrink-0"
                style={{ color: 'var(--text-subtle)' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-muted)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                title={lang === 'hi' ? 'Stage list dikhao' : 'Show stage list'}
              >
                <PanelLeftOpen className="h-4 w-4" />
              </button>
              <span className="text-xs font-medium whitespace-nowrap" style={{ color: 'var(--text-subtle)' }}>
                Stage {i + 1} / {N}
              </span>
              <span style={{ color: 'var(--text-subtle)' }}>·</span>
              <span className="flex items-center gap-1 text-xs whitespace-nowrap" style={{ color: 'var(--text-subtle)' }}>
                <Clock className="h-3 w-3" /> ~{meta.minutes} min
              </span>
              <span className="hidden md:inline" style={{ color: 'var(--text-subtle)' }}>·</span>
              <span className="hidden md:inline text-sm font-semibold truncate" style={{ color: 'var(--text-base)' }}>
                {content.title}
              </span>
            </>
          ) : (
            /* ─── FOCUSED MODE: full header ─── */
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-1.5">
                <button
                  onClick={() => setSidebarCollapsed(c => !c)}
                  className="hidden lg:flex items-center justify-center w-7 h-7 rounded-lg transition-colors -ml-1 shrink-0"
                  style={{ color: 'var(--text-subtle)' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-muted)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  title="Hide stage list"
                >
                  <PanelLeftClose className="h-4 w-4" />
                </button>
                <span className="text-xs font-medium" style={{ color: 'var(--text-subtle)' }}>Stage {i + 1} / {N}</span>
                <span style={{ color: 'var(--text-subtle)' }}>·</span>
                <span className="flex items-center gap-1 text-xs" style={{ color: 'var(--text-subtle)' }}>
                  <Clock className="h-3 w-3" /> ~{meta.minutes} min
                </span>
              </div>
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight" style={{ color: 'var(--text-base)' }}>{content.title}</h1>
              <p className="mt-1 text-sm leading-relaxed max-w-2xl" style={{ color: 'var(--text-muted)' }}>{content.goal}</p>
            </div>
          )}
          {/* Prev / Next — pushed right */}
          <div className={`flex shrink-0 items-center gap-1.5 ${sidebarCollapsed ? 'ml-auto' : 'mt-0.5'}`}>
            <button
              onClick={() => goStage(i - 1)}
              disabled={i === 0}
              className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm font-medium ring-1 ring-[var(--header-border)] hover:bg-[var(--surface-muted)] disabled:opacity-30 transition-colors"
              style={{ color: 'var(--text-muted)' }}
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Prev
            </button>
            <button
              onClick={() => goStage(Math.min(N - 1, i + 1))}
              disabled={i === N - 1}
              className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm font-medium disabled:opacity-30 transition-colors"
              style={{ background: 'var(--accent)', color: 'var(--accent-fg)' }}
            >
              Next <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </header>

        {/* ---------- Tabs — Concepts first, then Architecture ---------- */}
        <nav className={`${sidebarCollapsed ? 'lg:hidden' : ''} flex gap-1 overflow-x-auto no-scrollbar`} aria-label="Stage views">
          {(
            [
              ['concepts', 'Concepts', BookOpen],
              ['architecture', 'Architecture', Boxes],
            ] as [Tab, string, React.ComponentType<{ className?: string }>][]
          ).map(([id, label, Icon]) => (
            <button
              key={id}
              onClick={() => openTab(id)}
              aria-current={tab === id ? 'page' : undefined}
              className={`flex shrink-0 items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-colors ${
                tab === id
                  ? 'bg-[var(--accent)] text-[var(--accent-fg)] shadow-sm'
                  : 'text-[var(--text-muted)] hover:bg-[var(--surface-muted)] ring-1 ring-[var(--header-border)]'
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </nav>

        {/* ══════════════════════════════════════════════════════
            SPLIT PANE — visible on both tabs at desktop size
            Left: concepts panel | Divider | Right: architecture
            On mobile: tabs switch between them
            ══════════════════════════════════════════════════════ */}

        {/* Mobile: show only the active tab */}
        <div className="lg:hidden space-y-4">
          {tab === 'concepts' && (
            <section className="space-y-5">
              {lang === 'hi' && content.hinglish && (
                <div className="rounded-xl px-4 py-3 text-sm leading-relaxed" style={{ background: 'var(--surface-muted)', border: '1px solid var(--header-border)', color: 'var(--text-base)' }}>
                  {content.hinglish}
                </div>
              )}
              <div className="lesson-prose"><p>{content.why}</p><p><strong>Weak spot: </strong>{content.weakSpot}</p><p><strong>{i === N - 1 ? 'Next: ' : 'The fix: '}</strong>{content.fix}</p></div>
              {i > 0 && <WhatChanged before={content.before} after={content.after} reason={content.reason} />}
              <Callout tone="idea" title="Key takeaway">{content.takeaway}</Callout>
              {chapterMeta?.mediumUrl && <MediumLink url={chapterMeta.mediumUrl} lang={lang} />}
              <div id="ch1-check"><Quiz key={i} persistKey={`chapter1:quiz:stage${i}`} questions={content.quiz} title="Quick check" onProgress={(s, t) => s === t && mark('check')} /></div>
            </section>
          )}
          {tab === 'architecture' && (
            <div className="space-y-4">
              <div className="rounded-2xl bg-[var(--surface)] ring-1 ring-[var(--header-border)] p-4">
                <div className="flex flex-wrap items-center gap-2 mb-3">
                  {meta.experiments.map((ex) => (<button key={ex.id} onClick={() => runExperiment(ex)} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-rose-700 ring-1 ring-rose-200 hover:bg-rose-50 dark:text-rose-300 dark:ring-rose-400/30"><Flame className="h-3.5 w-3.5" /> {ex.label}</button>))}
                  {hasFix(i) && <Segmented label="Version" value={after ? 'after' : 'before'} options={[{ value: 'before', label: meta.toggle?.[0] ?? 'Before' }, { value: 'after', label: meta.toggle?.[1] ?? 'After' }]} onChange={(v) => setAfter(v === 'after')} />}
                  <button onClick={clearFailures} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm ring-1 ring-[var(--header-border)] hover:bg-[var(--surface-muted)]" style={{ color: 'var(--text-muted)' }}><RotateCcw className="h-3.5 w-3.5" /> Reset</button>
                </div>
                {failing && <Callout className="mb-3" tone={health === 'ok' ? 'success' : health === 'outage' ? 'danger' : 'warning'} title={health === 'ok' ? 'Architecture absorbed the failure' : sim.headline}><FailureSummary sim={sim} after={after} stage={i} withLabel={meta.toggle?.[1]} withoutLabel={meta.toggle?.[0]} /></Callout>}
                <Diagram arch={arch} sim={sim} selected={selected} onSelect={select} running={sim.success > 0} />
              </div>
              <Inspector node={selNode} state={selNode ? sim.nodes[selNode.id] : undefined} crashed={selNode ? fail.crashed.includes(selNode.id) : false} count={selNode ? arch.all.filter((n) => n.kind === selNode.kind).length : 0} onClose={() => setSelected(null)} onCrash={() => selNode && crash(selNode.id)} onRecover={() => selNode && recover(selNode.id)} />
              <TechStack arch={arch} selected={selected} onSelect={select} />
            </div>
          )}
        </div>

        {/* ═══════════════ DESKTOP ═══════════════ */}
        <div className="hidden lg:block">

          {/* ───────── When sidebar is VISIBLE: focused tabs ───────── */}
          {!sidebarCollapsed && (
            <>
              {tab === 'concepts' && (
                <section className="max-w-3xl space-y-5">
                  {lang === 'hi' && content.hinglish && (
                    <div className="rounded-xl px-4 py-3 text-sm leading-relaxed" style={{ background: 'var(--surface-muted)', border: '1px solid var(--header-border)', color: 'var(--text-base)' }}>
                      {content.hinglish}
                    </div>
                  )}
                  <div className="lesson-prose">
                    <p>{content.why}</p>
                    <p><strong>{lang === 'hi' ? 'Weak spot (kamzori): ' : 'Weak spot: '}</strong>{content.weakSpot}</p>
                    <p><strong>{i === N - 1 ? (lang === 'hi' ? 'Aage: ' : 'Next: ') : (lang === 'hi' ? 'Solution: ' : 'The fix: ')}</strong>{content.fix}</p>
                  </div>
                  {i > 0 && <WhatChanged before={content.before} after={content.after} reason={content.reason} />}
                  <Callout tone="idea" title={lang === 'hi' ? 'Key baat' : 'Key takeaway'}>{content.takeaway}</Callout>
                  {chapterMeta?.mediumUrl && <MediumLink url={chapterMeta.mediumUrl} lang={lang} />}
                  <div id="ch1-check">
                    <Quiz key={i} persistKey={`chapter1:quiz:stage${i}`} questions={content.quiz} title={lang === 'hi' ? 'Quick test' : 'Quick check'} onProgress={(s, t) => s === t && mark('check')} />
                  </div>
                </section>
              )}
              {tab === 'architecture' && (
                <div className={`grid gap-5 ${selNode ? 'xl:grid-cols-[minmax(0,1fr)_280px]' : 'grid-cols-1'}`}>
                  <section className="min-w-0 rounded-2xl bg-[var(--surface)] ring-1 ring-[var(--header-border)] p-4 sm:p-5">
                    <div className="flex flex-wrap items-center gap-2 mb-3">
                      {meta.experiments.map((ex) => (
                        <button key={ex.id} onClick={() => runExperiment(ex)} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-rose-700 ring-1 ring-rose-200 hover:bg-rose-50 dark:text-rose-300 dark:ring-rose-400/30 dark:hover:bg-rose-400/10">
                          <Flame className="h-3.5 w-3.5" /> {ex.label}
                        </button>
                      ))}
                      {hasFix(i) && (
                        <Segmented label="Version" value={after ? 'after' : 'before'}
                          options={[{ value: 'before', label: meta.toggle?.[0] ?? 'Before' }, { value: 'after', label: meta.toggle?.[1] ?? 'After' }]}
                          onChange={(v) => setAfter(v === 'after')} />
                      )}
                      <button onClick={clearFailures} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm ring-1 ring-[var(--header-border)] hover:bg-[var(--surface-muted)]" style={{ color: 'var(--text-muted)' }}>
                        <RotateCcw className="h-3.5 w-3.5" /> Reset
                      </button>
                    </div>
                    {failing && (
                      <Callout className="mb-3" tone={health === 'ok' ? 'success' : health === 'outage' ? 'danger' : 'warning'} title={health === 'ok' ? 'Architecture absorbed the failure' : sim.headline}>
                        <FailureSummary sim={sim} after={after} stage={i} withLabel={meta.toggle?.[1]} withoutLabel={meta.toggle?.[0]} />
                      </Callout>
                    )}
                    <Diagram arch={arch} sim={sim} selected={selected} onSelect={select} running={sim.success > 0} />
                    <details className="mt-4 rounded-xl overflow-hidden" style={{ border: '1px solid var(--header-border)' }}>
                      <summary className="cursor-pointer flex items-center gap-2 px-4 py-2.5 text-sm font-medium select-none" style={{ background: 'var(--surface-muted)', color: 'var(--text-base)' }}>
                        <Settings2 className="h-4 w-4" style={{ color: 'var(--text-subtle)' }} />
                        Simulation controls
                      </summary>
                      <div className="p-4" style={{ background: 'var(--surface)' }}>
                        <div className="grid gap-4 sm:grid-cols-3">
                          <Control label="Traffic (req/sec)" value={`${inputs.rps.toLocaleString()} RPS`}>
                            <input type="range" min={0} max={100} value={rpsToPos(inputs.rps)} onChange={(e) => setInputs({ rps: posToRps(Number(e.target.value)) })} className="w-full accent-[var(--accent)]" />
                          </Control>
                          <Control label="Read / write mix" value={`${inputs.readPct}% / ${100 - inputs.readPct}%`}>
                            <input type="range" min={50} max={99} value={inputs.readPct} onChange={(e) => setInputs({ readPct: Number(e.target.value) })} className="w-full accent-emerald-600" />
                          </Control>
                          <Control label={arch.f.multiDc ? 'Servers per DC' : 'Web servers'} value={arch.f.lb ? `${inputs.websPerDc} nodes` : '1 node'}>
                            {arch.f.lb ? (
                              <div className="flex items-center gap-2">
                                <StepBtn label="Remove" onClick={() => setInputs({ websPerDc: Math.max(1, inputs.websPerDc - 1) })} disabled={inputs.websPerDc <= 1}><Minus className="h-4 w-4" /></StepBtn>
                                <span className="w-8 text-center text-sm tabular-nums">{inputs.websPerDc}</span>
                                <StepBtn label="Add" onClick={() => setInputs({ websPerDc: Math.min(4, inputs.websPerDc + 1) })} disabled={inputs.websPerDc >= 4}><Plus className="h-4 w-4" /></StepBtn>
                              </div>
                            ) : <p className="text-xs" style={{ color: 'var(--text-subtle)' }}>Needs a load balancer first.</p>}
                          </Control>
                        </div>
                      </div>
                    </details>
                  </section>
                  {selNode && (
                    <div className="min-w-0">
                      <Inspector node={selNode} state={sim.nodes[selNode.id]} crashed={fail.crashed.includes(selNode.id)} count={arch.all.filter((n) => n.kind === selNode.kind).length} onClose={() => setSelected(null)} onCrash={() => crash(selNode.id)} onRecover={() => recover(selNode.id)} />
                    </div>
                  )}
                  {!selNode && <TechStack arch={arch} selected={selected} onSelect={select} />}
                </div>
              )}
            </>
          )}

          {/* ───────── When sidebar is COLLAPSED: true Miro whiteboard, 92% of viewport ───────── */}
          {sidebarCollapsed && (
            <div
              className="relative overflow-hidden"
              style={{
                /* Break out of the max-w-[1280px] parent container to ~92% of the viewport, centered */
                width: '92vw',
                marginLeft: 'calc(-46vw + 50%)',
                height: 'calc(100vh - 230px)',
                minHeight: 520,
                border: '1px solid var(--header-border)',
                borderRadius: '0 0 12px 12px',
                background: 'var(--surface)',
                backgroundImage: `radial-gradient(var(--header-border) 1px, transparent 1px)`,
                backgroundSize: '20px 20px',
              }}
            >
              {/* ─ BACKGROUND LAYER: Architecture canvas, fills everything. Drag anywhere empty to pan. ─ */}
              <div className="absolute inset-0" style={{ paddingLeft: 86, paddingRight: rightPanelOpen ? 440 : 40, paddingTop: 80, paddingBottom: 40, transition: 'padding 0.15s ease-out' }}>
                <div className="w-full h-full">
                  <Diagram arch={arch} sim={sim} selected={selected} onSelect={select} running={sim.success > 0} canvasMode />
                </div>
              </div>

              {/* ─ TOP: Status + version toggle ─ */}
              <div className="absolute top-4 flex items-start justify-between gap-2 z-20 pointer-events-none" style={{ left: 86, right: rightPanelOpen ? 440 : 24, transition: 'right 0.15s ease-out' }}>
                <div className="flex items-center gap-2 pointer-events-auto rounded-xl px-3 py-1.5 backdrop-blur" style={{ background: 'var(--surface)', border: '1px solid var(--header-border)', boxShadow: 'var(--shadow-float-sm)' }}>
                  <span className={`h-2 w-2 rounded-full ${health === 'ok' ? 'bg-emerald-500' : health === 'degraded' ? 'bg-amber-500' : 'bg-rose-500'}`} />
                  <span className="text-xs font-semibold" style={{ color: 'var(--text-base)' }}>{content.title}</span>
                  <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                    health === 'ok' ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-300'
                    : health === 'degraded' ? 'bg-amber-50 text-amber-700 dark:bg-amber-400/10 dark:text-amber-300'
                    : 'bg-rose-50 text-rose-700 dark:bg-rose-400/10 dark:text-rose-300'
                  }`}>{health === 'ok' ? (lang === 'hi' ? 'Chal raha' : 'Running') : health === 'degraded' ? (lang === 'hi' ? 'Dheela' : 'Degraded') : (lang === 'hi' ? 'Band' : 'Outage')}</span>
                </div>

                {hasFix(i) && (
                  <div className="flex items-center gap-1.5 pointer-events-auto rounded-xl px-2 py-1.5 backdrop-blur" style={{ background: 'var(--surface)', border: '1px solid var(--header-border)', boxShadow: 'var(--shadow-float-sm)' }}>
                    <Segmented label="Version" value={after ? 'after' : 'before'}
                      options={[{ value: 'before', label: meta.toggle?.[0] ?? 'Before' }, { value: 'after', label: meta.toggle?.[1] ?? 'After' }]}
                      onChange={(v) => setAfter(v === 'after')} />
                  </div>
                )}
              </div>

              {/* ─ LEFT: vertical icon toolbar, Miro-style ─ */}
              <div
                className="absolute z-30 flex flex-col items-center gap-1 rounded-2xl p-1.5"
                style={{
                  left: 20,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'var(--surface)',
                  border: '1px solid var(--header-border)',
                  boxShadow: 'var(--shadow-float)',
                }}
              >
                <ToolbarIcon
                  icon={BookOpen}
                  label={lang === 'hi' ? 'Concepts' : 'Concepts'}
                  active={!selNode && rightPanel === 'concepts'}
                  onClick={() => { setSelected(null); setRightPanel(p => (p === 'concepts' ? null : 'concepts')); }}
                />
                <ToolbarIcon
                  icon={Boxes}
                  label={lang === 'hi' ? 'Components' : 'Components'}
                  active={!!selNode || rightPanel === 'components'}
                  onClick={() => setRightPanel(p => (p === 'components' && !selNode ? null : 'components'))}
                />

                <div className="w-6 h-px my-1" style={{ background: 'var(--header-border)' }} />

                {meta.experiments.map((ex) => (
                  <ToolbarIcon
                    key={ex.id}
                    icon={Flame}
                    label={ex.label}
                    tone="danger"
                    onClick={() => runExperiment(ex)}
                  />
                ))}
                <ToolbarIcon
                  icon={RotateCcw}
                  label={lang === 'hi' ? 'Reset' : 'Reset'}
                  onClick={clearFailures}
                />

                <div className="w-6 h-px my-1" style={{ background: 'var(--header-border)' }} />

                <ToolbarIcon
                  icon={Settings2}
                  label={lang === 'hi' ? 'Simulation controls' : 'Simulation controls'}
                  active={rightPanel === 'simControls' && !selNode}
                  onClick={() => { setSelected(null); setRightPanel(p => (p === 'simControls' ? null : 'simControls')); }}
                />
              </div>

              {/* ─ RIGHT: content panel — Concepts, Components (Inspector), or Simulation controls ─ */}
              {rightPanelOpen && (
                <div
                  className="absolute z-30 flex flex-col rounded-xl overflow-hidden"
                  style={{
                    right: 24,
                    top: 24,
                    bottom: 24,
                    width: 400,
                    background: 'var(--surface)',
                    border: '1px solid var(--header-border)',
                    boxShadow: 'var(--shadow-float)',
                  }}
                >
                  <div className="shrink-0 flex items-center gap-2 px-3 py-2.5" style={{ borderBottom: '1px solid var(--header-border)', background: 'var(--surface-muted)' }}>
                    {selNode ? (
                      <>
                        <KindIconBadge icon={KIND_ICON[selNode.kind]} />
                        <span className="text-sm font-semibold truncate" style={{ color: 'var(--text-base)' }}>{selNode.label}</span>
                      </>
                    ) : rightPanel === 'simControls' ? (
                      <>
                        <KindIconBadge icon={Settings2} />
                        <span className="text-xs font-bold tracking-widest uppercase" style={{ color: 'var(--text-subtle)' }}>
                          {lang === 'hi' ? 'Simulation Controls' : 'Simulation Controls'}
                        </span>
                      </>
                    ) : rightPanel === 'components' ? (
                      <>
                        <KindIconBadge icon={Boxes} />
                        <span className="text-xs font-bold tracking-widest uppercase" style={{ color: 'var(--text-subtle)' }}>
                          {lang === 'hi' ? 'Components' : 'Components'}
                        </span>
                      </>
                    ) : (
                      <>
                        <KindIconBadge icon={BookOpen} />
                        <span className="text-xs font-bold tracking-widest uppercase" style={{ color: 'var(--text-subtle)' }}>
                          Concepts
                        </span>
                      </>
                    )}
                    <span className="ml-auto text-[10px] shrink-0" style={{ color: 'var(--text-subtle)' }}>
                      Stage {i + 1} / {N}
                    </span>
                    <PanelCloseButton
                      onClose={() => { if (selNode) setSelected(null); else setRightPanel(null); }}
                      label={lang === 'hi' ? 'Band karo' : 'Close'}
                    />
                  </div>

                  <div className="flex-1 min-h-0 overflow-y-auto">
                    {selNode ? (
                      <Inspector
                        embedded
                        node={selNode}
                        state={sim.nodes[selNode.id]}
                        crashed={fail.crashed.includes(selNode.id)}
                        count={arch.all.filter((n) => n.kind === selNode.kind).length}
                        onClose={() => setSelected(null)}
                        onCrash={() => crash(selNode.id)}
                        onRecover={() => recover(selNode.id)}
                      />
                    ) : rightPanel === 'simControls' ? (
                      <div className="p-4 space-y-5">
                        <p className="text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                          {lang === 'hi'
                            ? 'In sliders se tum khud traffic badla sakte ho aur dekh sakte ho ki architecture kaise react karta hai.'
                            : 'Drag these to change the traffic hitting the system and watch how the architecture responds.'}
                        </p>

                        <ExplainedControl
                          label={lang === 'hi' ? 'Traffic (requests/sec)' : 'Traffic (requests/sec)'}
                          value={`${inputs.rps.toLocaleString()} RPS`}
                          explain={lang === 'hi'
                            ? 'Har second kitne requests (jaise page load, API call) system pe aa rahe hain. Jitna zyada RPS, utna load servers par.'
                            : 'How many requests (page loads, API calls) hit the system every second. Higher RPS = more load on every server.'}
                        >
                          <input type="range" min={0} max={100} value={rpsToPos(inputs.rps)} onChange={(e) => setInputs({ rps: posToRps(Number(e.target.value)) })} className="w-full accent-[var(--accent)]" />
                        </ExplainedControl>

                        <ExplainedControl
                          label={lang === 'hi' ? 'Read / Write mix' : 'Read / Write mix'}
                          value={`${inputs.readPct}% read / ${100 - inputs.readPct}% write`}
                          explain={lang === 'hi'
                            ? `Read = data sirf dekhna (jaise profile khol na, feed scroll karna). Write = naya data save karna (jaise post karna, like karna). Default ${inputs.readPct}% read rakha hai kyunki real apps mein log likhne se zyada padhte hain — Twitter pe 100 log scroll karte hain per 1 jo post karta hai. Isiliye reads ko replicas pe bhi bhej sakte ho, par writes hamesha master server ko hi jaana padta hai — isliye write % badhane se master pe load jaldi badhta hai.`
                            : `Reads just fetch data (opening a profile, scrolling a feed). Writes change data (posting, liking). It defaults to ${inputs.readPct}% read because real apps are read-heavy — on Twitter, far more people scroll than post. Reads can be served from replicas, but writes always go to the one master — so pushing write% up loads the master much faster.`}
                        >
                          <input type="range" min={50} max={99} value={inputs.readPct} onChange={(e) => setInputs({ readPct: Number(e.target.value) })} className="w-full accent-emerald-600" />
                        </ExplainedControl>

                        <ExplainedControl
                          label={arch.f.multiDc ? (lang === 'hi' ? 'Servers per DC' : 'Servers per data center') : (lang === 'hi' ? 'Web servers' : 'Web servers')}
                          value={arch.f.lb ? `${inputs.websPerDc} nodes` : '1 node'}
                          explain={lang === 'hi'
                            ? 'Kitne web server machines mil ke traffic handle kar rahe hain. Zyada servers = zyada parallel capacity, par load balancer chahiye unke beech traffic baantne ke liye.'
                            : 'How many web server machines are splitting the traffic between them. More servers means more parallel capacity, but you need a load balancer to spread requests across them.'}
                        >
                          {arch.f.lb ? (
                            <div className="flex items-center gap-2">
                              <StepBtn label="Remove" onClick={() => setInputs({ websPerDc: Math.max(1, inputs.websPerDc - 1) })} disabled={inputs.websPerDc <= 1}><Minus className="h-3.5 w-3.5" /></StepBtn>
                              <span className="w-6 text-center text-xs tabular-nums">{inputs.websPerDc}</span>
                              <StepBtn label="Add" onClick={() => setInputs({ websPerDc: Math.min(4, inputs.websPerDc + 1) })} disabled={inputs.websPerDc >= 4}><Plus className="h-3.5 w-3.5" /></StepBtn>
                            </div>
                          ) : <p className="text-[11px]" style={{ color: 'var(--text-subtle)' }}>{lang === 'hi' ? 'Pehle load balancer chahiye' : 'Needs a load balancer first.'}</p>}
                        </ExplainedControl>
                      </div>
                    ) : rightPanel === 'components' ? (
                      <div className="p-2">
                        <p className="px-2 pt-2 pb-3 text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                          {lang === 'hi' ? 'Kisi bhi component pe click karo use inspect karne ke liye.' : 'Click any component below to inspect it.'}
                        </p>
                        <TechStack arch={arch} selected={selected} onSelect={select} />
                      </div>
                    ) : (
                      <div className="p-4 space-y-4">
                        {lang === 'hi' && content.hinglish && (
                          <div className="rounded-xl px-3 py-2.5 text-xs leading-relaxed" style={{ background: 'var(--surface-muted)', border: '1px solid var(--header-border)', color: 'var(--text-base)' }}>
                            {content.hinglish}
                          </div>
                        )}
                        <div className="lesson-prose text-sm">
                          <p>{content.why}</p>
                          <p><strong>{lang === 'hi' ? 'Weak spot: ' : 'Weak spot: '}</strong>{content.weakSpot}</p>
                          <p><strong>{i === N - 1 ? (lang === 'hi' ? 'Aage: ' : 'Next: ') : (lang === 'hi' ? 'Solution: ' : 'The fix: ')}</strong>{content.fix}</p>
                        </div>
                        {i > 0 && <WhatChanged before={content.before} after={content.after} reason={content.reason} />}
                        <Callout tone="idea" title={lang === 'hi' ? 'Key baat' : 'Key takeaway'}>{content.takeaway}</Callout>
                        {chapterMeta?.mediumUrl && <MediumLink url={chapterMeta.mediumUrl} lang={lang} />}
                        <div id="ch1-check">
                          <Quiz key={i} persistKey={`chapter1:quiz:stage${i}`} questions={content.quiz} title={lang === 'hi' ? 'Quick test' : 'Quick check'} onProgress={(s, t) => s === t && mark('check')} />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ─ Floating failure callout at top center ─ */}
              {failing && (
                <div className="absolute top-16 z-25 pointer-events-auto max-w-md" style={{ left: 86, right: rightPanelOpen ? 440 : 24, marginInline: 'auto', width: 'fit-content' }}>
                  <Callout tone={health === 'ok' ? 'success' : health === 'outage' ? 'danger' : 'warning'} title={health === 'ok' ? (lang === 'hi' ? 'Architecture ne failure handle kiya' : 'Architecture absorbed the failure') : sim.headline}>
                    <FailureSummary sim={sim} after={after} stage={i} withLabel={meta.toggle?.[1]} withoutLabel={meta.toggle?.[0]} />
                  </Callout>
                </div>
              )}

              {/* ─ Hint when nothing is selected and no panel open ─ */}
              {!selNode && !rightPanelOpen && (
                <div className="absolute z-10 text-[11px] italic pointer-events-none" style={{ bottom: 24, right: 24, color: 'var(--text-subtle)' }}>
                  {lang === 'hi' ? '💡 Diagram pe kisi component pe click karo' : '💡 Click any component in the diagram'}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ---------- Learning flow — matches the 92vw whiteboard width in Miro mode ---------- */}
        <div
          style={
            sidebarCollapsed
              ? {
                  width: '92vw',
                  marginLeft: 'calc(-46vw + 50%)',
                  padding: '14px 20px 4px',
                }
              : { marginTop: 20 }
          }
        >
          <FlowBar
            flow={effFlow}
            hasFix={hasFix(i)}
            isFinal={i === N - 1}
            onStep={(s) => {
              if (s === 'learn') openTab('concepts');
              else if (s === 'explore') openTab('architecture');
              else if (s === 'break') {
                openTab('architecture');
                if (hasFix(i) && after) setAfter(false);
                if (meta.experiments[0]) runExperiment(meta.experiments[0]);
              }
              else if (s === 'fix') {
                if (hasFix(i)) {
                  openTab('architecture');
                  setAfter(true);
                } else if (i < N - 1) goStage(i + 1);
              } else {
                openTab('concepts');
                setTimeout(() => document.getElementById('ch1-check')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
              }
            }}
          />
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------

const FailureSummary: React.FC<{ sim: ReturnType<typeof simulate>; after: boolean; stage: number; withLabel?: string; withoutLabel?: string }> = ({ sim, after, stage, withLabel, withoutLabel }) => {
  const parts: string[] = [];
  parts.push(`${(sim.success * 100).toFixed(sim.success === 1 ? 0 : 1)}% of requests succeed, API latency ${sim.apiMs} ms.`);
  if (sim.writesPaused) parts.push('Writes are paused while a replica is promoted to master.');
  if (sim.promoted) parts.push('A replica was promoted to master and writes are flowing again.');
  if (sim.loggedOutPct > 0) parts.push(`${Math.round(sim.loggedOutPct)}% of users were logged out: their sessions lived on the lost server.`);
  if (sim.backlog > 0) parts.push(`Queue backlog: ${Math.round(sim.backlog).toLocaleString()} jobs, draining in the background.`);
  if (sim.staticMs > 200) parts.push(`Static files take ${sim.staticMs} ms to load.`);
  return (
    <>
      {parts.join(' ')}
      {hasFix(stage) && !after && sim.success < 1 && <> Now switch to <strong>{withLabel ?? 'the fixed design'}</strong> and see the same failure.</>}
      {hasFix(stage) && after && !sim.writesPaused && sim.success < 0.99 && <> Better than before, but not solved yet: the next stage tackles what is left.</>}
      {hasFix(stage) && after && withoutLabel && <> Switch to <strong>{withoutLabel}</strong> to see what happens without this stage's fix.</>}
    </>
  );
};

/** A slider control with its explanation always visible underneath — used in the full-width Simulation Controls panel. */
const ExplainedControl: React.FC<{ label: string; value: string; explain: string; children: React.ReactNode }> = ({ label, value, explain, children }) => (
  <div>
    <div className="flex items-baseline justify-between mb-1.5">
      <span className="text-xs font-semibold" style={{ color: 'var(--text-base)' }}>{label}</span>
      <span className="text-xs tabular-nums font-medium" style={{ color: 'var(--text-subtle)' }}>{value}</span>
    </div>
    {children}
    <p className="mt-1.5 text-[11px] leading-relaxed" style={{ color: 'var(--text-subtle)' }}>{explain}</p>
  </div>
);

const Control: React.FC<{ label: string; value: string; children: React.ReactNode }> = ({ label, value, children }) => (
  <div className="rounded-lg bg-[var(--surface)] p-3 ring-1 ring-[var(--header-border)] dark:bg-[var(--surface)] dark:ring-[var(--header-border)]">
    <p className="text-xs text-[var(--text-subtle)] dark:text-[var(--text-subtle)]">{label}</p>
    <p className="mb-2 text-base font-semibold tabular-nums text-[var(--text-base)] dark:text-[var(--text-base)]">{value}</p>
    {children}
  </div>
);

const StepBtn: React.FC<{ label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }> = ({ label, onClick, disabled, children }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    aria-label={label}
    className="flex h-8 w-8 items-center justify-center rounded-lg ring-1 ring-[var(--header-border)] text-[var(--text-muted)] hover:bg-[var(--surface-muted)] disabled:opacity-40 dark:ring-[var(--header-border)] dark:text-[var(--text-muted)] dark:hover:bg-[var(--surface-muted)]"
  >
    {children}
  </button>
);

// ---------------------------------------------------------------------------

const STATUS_LABEL: Record<NodeState['status'], string> = { healthy: 'Healthy', busy: 'Overloaded', down: 'Down', promoting: 'Promoting', idle: 'Idle' };

const CAPACITY: Partial<Record<Kind, string>> = {
  server: `${CAP.box} requests/s (web app and DB share the machine)`,
  web: `${CAP.web} requests/s each`,
  master: `${CAP.master} writes/s per master (${CAP.db} queries/s without replicas)`,
  replica: `${CAP.replica} reads/s each`,
  workers: `${CAP.worker} jobs/s for the pool`,
};

const Inspector: React.FC<{
  node: ArchNode | null;
  state?: NodeState;
  crashed: boolean;
  count: number;
  onClose: () => void;
  onCrash: () => void;
  onRecover: () => void;
  /** When true, strip the card chrome (used inside split pane). */
  embedded?: boolean;
}> = ({ node, state, crashed, count, onClose, onCrash, onRecover, embedded = false }) => {
  const [view, setView] = useState<'overview' | 'tech' | 'metrics' | 'config'>('overview');
  if (!node) {
    return (
      <aside className="rounded-2xl bg-[var(--surface)] p-5 ring-1 ring-[var(--header-border)] dark:bg-[var(--surface)] dark:ring-[var(--header-border)]">
        <p className="flex items-center gap-2 font-semibold text-[var(--text-base)] dark:text-[var(--text-base)]">
          <Search className="h-4 w-4" /> Component inspector
        </p>
        <p className="mt-2 text-sm text-[var(--text-subtle)] dark:text-[var(--text-subtle)]">Click any component in the diagram to see what it does and to crash it.</p>
      </aside>
    );
  }
  const info = COMPONENT_INFO[node.kind];
  const status = state?.status ?? 'healthy';
  return (
    <aside className={embedded
      ? 'p-4'
      : 'self-start rounded-2xl bg-[var(--surface)] p-5 ring-1 ring-[var(--header-border)] xl:sticky xl:top-20'
    }>
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-2 font-semibold" style={{ color: 'var(--text-base)' }}>
          <Search className="h-4 w-4" /> {embedded ? node.name : 'Component inspector'}
        </p>
        {!embedded && (
          <button onClick={onClose} aria-label="Close inspector" className="rounded p-1 hover:bg-[var(--surface-muted)]" style={{ color: 'var(--text-subtle)' }}>
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="mt-4 flex items-center justify-between gap-3 rounded-xl ring-1 ring-[var(--header-border)] p-3 dark:ring-[var(--header-border)]">
        <div className="min-w-0">
          <p className="truncate font-semibold text-[var(--text-base)] dark:text-[var(--text-base)]">{node.label}</p>
          <p className="truncate text-xs text-[var(--text-subtle)] dark:text-[var(--text-subtle)]">{state?.role ?? node.sub}</p>
        </div>
        <span
          className={`shrink-0 flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium ${
            status === 'down'
              ? 'bg-rose-50 text-rose-700 dark:bg-rose-400/10 dark:text-rose-300'
              : status === 'busy' || status === 'promoting'
              ? 'bg-amber-50 text-amber-700 dark:bg-amber-400/10 dark:text-amber-300'
              : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-300'
          }`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${status === 'down' ? 'bg-rose-500' : status === 'busy' || status === 'promoting' ? 'bg-amber-500' : 'bg-emerald-500'}`} />
          {STATUS_LABEL[status]}
        </span>
      </div>

      <div className="mt-4 flex border-b border-[var(--header-border)] dark:border-[var(--header-border)] text-sm" role="tablist">
        {(
          [
            ['overview', 'Overview'],
            ['tech', 'Tech'],
            ['metrics', 'Metrics'],
            ['config', 'Config'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            role="tab"
            aria-selected={view === id}
            onClick={() => setView(id)}
            className={`flex-1 border-b-2 px-2 py-2 -mb-px ${view === id ? 'border-[var(--accent)] font-medium text-[var(--text-base)] dark:text-[var(--text-muted)]' : 'border-transparent text-[var(--text-subtle)] hover:text-[var(--text-base)] dark:text-[var(--text-subtle)]'}`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="mt-4 space-y-3 text-sm">
        {view === 'overview' && (
          <>
            <InfoBox tone="indigo" title="What is it?">
              {info.what}
            </InfoBox>
            <InfoBox tone="amber" title="Why does it exist?">
              {info.why}
            </InfoBox>
            <InfoBox tone="rose" title="If you remove it">
              {info.without}
            </InfoBox>
          </>
        )}
        {view === 'tech' && (
          <>
            <p className="text-xs text-[var(--text-subtle)] dark:text-[var(--text-subtle)]">What teams actually run for this component:</p>
            <ul className="space-y-2">
              {TECH[node.kind].map((t, k) => (
                <li key={t.name} className="rounded-xl bg-[var(--surface-muted)] p-3 dark:bg-[var(--surface-muted)]">
                  <p className="flex items-center gap-2 font-semibold text-[var(--text-base)] dark:text-[var(--text-base)]">
                    {t.name}
                    {k === 0 && <span className="rounded-md bg-[var(--surface-muted)] px-1.5 py-0.5 text-[11px] font-medium text-[var(--text-base)] dark:bg-[var(--surface-muted)] dark:text-[var(--text-muted)]">common pick</span>}
                  </p>
                  <p className="mt-0.5 text-[var(--text-muted)] dark:text-[var(--text-muted)]">{t.note}</p>
                </li>
              ))}
            </ul>
          </>
        )}
        {view === 'metrics' && (
          <dl className="divide-y divide-[var(--header-border)] dark:divide-[var(--header-border)]">
            <Row k="Status" v={STATUS_LABEL[status]} />
            <Row k="Load" v={status === 'down' ? '—' : `${Math.round(Math.min(1, state?.load ?? 0) * 100)}%`} />
            <Row k="Throughput" v={state?.throughput ?? '—'} />
            {state?.badge && <Row k="Now" v={state.badge} />}
          </dl>
        )}
        {view === 'config' && (
          <dl className="divide-y divide-[var(--header-border)] dark:divide-[var(--header-border)]">
            <Row k="Type" v={node.kind === 'master' ? 'Primary database' : node.label.replace(/-\d.*$/, '')} />
            <Row k="In this design" v={`${count} node${count > 1 ? 's' : ''}`} />
            {CAPACITY[node.kind] && <Row k="Capacity" v={CAPACITY[node.kind]!} />}
            {node.kind === 'master' && <Row k="Failover" v={`replica promoted in ~${FAILOVER_MS / 1000}s`} />}
            {node.dc && <Row k="Data center" v={node.dc === 1 ? 'US-East' : 'US-West'} />}
          </dl>
        )}
      </div>

      <div className="mt-5">
        {crashed ? (
          <button onClick={onRecover} className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-3 py-2.5 text-sm font-medium text-white hover:bg-emerald-500">
            <Wrench className="h-4 w-4" /> Recover this component
          </button>
        ) : (
          <button onClick={onCrash} className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-[var(--accent)] px-3 py-2.5 text-sm font-medium text-[var(--accent-fg)] hover:bg-[var(--accent-hover)]">
            <Zap className="h-4 w-4" /> Crash this component
          </button>
        )}
      </div>
    </aside>
  );
};

/** One row per component type in the current architecture, with the technologies used for it in practice. */
const TechStack: React.FC<{ arch: ReturnType<typeof buildArch>; selected: string | null; onSelect: (id: string) => void }> = ({ arch, selected, onSelect }) => {
  const kinds: { kind: Kind; first: string }[] = [];
  arch.all.forEach((n) => {
    if (!kinds.some((k) => k.kind === n.kind)) kinds.push({ kind: n.kind, first: n.id });
  });
  const selKind = arch.all.find((n) => n.id === selected)?.kind;
  return (
    <section className="xl:col-span-2 rounded-2xl bg-[var(--surface)] p-4 sm:p-5 ring-1 ring-[var(--header-border)] dark:bg-[var(--surface)] dark:ring-[var(--header-border)]">
      <div className="mb-3">
        <h2 className="flex items-center gap-2 font-semibold text-[var(--text-base)] dark:text-[var(--text-base)]">
          <Boxes className="h-4 w-4" /> Tech stack in the real world
        </h2>
        <p className="text-sm text-[var(--text-subtle)] dark:text-[var(--text-subtle)]">What teams actually use for each piece of this architecture. Click a row to inspect that component.</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-[var(--text-subtle)] dark:text-[var(--text-subtle)]">
              <th className="py-2 pr-4 font-medium">Component</th>
              <th className="py-2 font-medium">Common technologies</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--header-border)] dark:divide-[var(--header-border)]">
            {kinds.map(({ kind, first }) => (
              <tr
                key={kind}
                onClick={() => onSelect(first)}
                className={`cursor-pointer align-top transition-colors hover:bg-[var(--surface-muted)] dark:hover:bg-[var(--surface)]/[0.03] ${selKind === kind ? 'bg-[var(--surface-muted)]/60 dark:bg-[var(--surface-muted)]' : ''}`}
              >
                <td className="whitespace-nowrap py-2.5 pr-4 font-medium text-[var(--text-base)] dark:text-[var(--text-base)]">{kind === 'master' && !arch.f.replicas ? 'Database' : KIND_NAME[kind]}</td>
                <td className="py-2">
                  <div className="flex flex-wrap gap-1.5">
                    {TECH[kind].map((t, k) => (
                      <span
                        key={t.name}
                        title={t.note}
                        className={`rounded-md px-2 py-1 text-xs ${
                          k === 0
                            ? 'bg-[var(--accent)] font-medium text-[var(--accent-fg)]'
                            : 'bg-[var(--surface-muted)] text-[var(--text-muted)] dark:bg-[var(--surface-muted)] dark:text-[var(--text-muted)]'
                        }`}
                      >
                        {t.name}
                      </span>
                    ))}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
};

const InfoBox: React.FC<{ tone: 'indigo' | 'amber' | 'rose'; title: string; children: React.ReactNode }> = ({ tone, title, children }) => (
  <div
    className={`rounded-xl p-3 ${
      tone === 'indigo' ? 'bg-[var(--surface-muted)] dark:bg-[var(--surface-muted)]' : tone === 'amber' ? 'bg-amber-50 dark:bg-amber-400/[0.08]' : 'bg-rose-50 dark:bg-rose-400/[0.08]'
    }`}
  >
    <p
      className={`text-xs font-semibold ${
        tone === 'indigo' ? 'text-[var(--text-base)] dark:text-[var(--text-muted)]' : tone === 'amber' ? 'text-amber-700 dark:text-amber-300' : 'text-rose-700 dark:text-rose-300'
      }`}
    >
      {title}
    </p>
    <p className="mt-0.5 text-[var(--text-muted)] dark:text-[var(--text-muted)]">{children}</p>
  </div>
);

const Row: React.FC<{ k: string; v: string }> = ({ k, v }) => (
  <div className="flex justify-between gap-4 py-2">
    <dt className="text-[var(--text-subtle)] dark:text-[var(--text-subtle)]">{k}</dt>
    <dd className="text-right text-[var(--text-base)] dark:text-[var(--text-base)]">{v}</dd>
  </div>
);

// ---------------------------------------------------------------------------

const FLOW_STEPS: { id: FlowStep; title: string; desc: string; icon: React.ComponentType<{ className?: string }>; tone: string }[] = [
  { id: 'learn', title: 'Learn', desc: 'Read why this stage exists.', icon: BookOpen, tone: 'emerald' },
  { id: 'explore', title: 'Explore', desc: 'Click a component in the diagram.', icon: Search, tone: 'indigo' },
  { id: 'break', title: 'Break it', desc: 'Press the red button above the diagram.', icon: Flame, tone: 'amber' },
  { id: 'fix', title: 'Fix it', desc: 'Apply the fix and run it again.', icon: Wrench, tone: 'violet' },
  { id: 'check', title: 'Check', desc: 'Answer the quick check.', icon: CircleHelp, tone: 'slate' },
];

const FLOW_TONE: Record<string, { box: string; icon: string; bar: string }> = {
  emerald: { box: 'ring-emerald-200 dark:ring-emerald-400/30', icon: 'bg-emerald-500 text-white', bar: 'bg-emerald-500' },
  indigo: { box: 'ring-[var(--header-border)] dark:ring-[var(--header-border)]', icon: 'bg-[var(--accent)] text-[var(--accent-fg)]', bar: 'bg-[var(--accent)]' },
  amber: { box: 'ring-amber-200 dark:ring-amber-400/30', icon: 'bg-amber-500 text-white', bar: 'bg-amber-500' },
  violet: { box: 'ring-violet-200 dark:ring-violet-400/30', icon: 'bg-violet-500 text-white', bar: 'bg-violet-500' },
  slate: { box: 'ring-[var(--header-border)] dark:ring-[var(--header-border)]', icon: 'bg-[var(--surface-muted)] text-[var(--text-subtle)]', bar: 'bg-[var(--surface-muted)]' },
};

const FlowBar: React.FC<{ flow: Flow; hasFix: boolean; isFinal: boolean; onStep: (s: FlowStep) => void }> = ({ flow, hasFix: fixable, isFinal, onStep }) => {
  const next = FLOW_STEPS.find((s) => !flow[s.id])?.id;
  return (
    <nav aria-label="Learning flow" className="grid gap-2 sm:grid-cols-5 items-stretch">
      {FLOW_STEPS.map((s, k) => {
        const t = FLOW_TONE[s.tone];
        const done = flow[s.id];
        const Icon = s.icon;
        const desc = s.id === 'fix' && !fixable ? (isFinal ? 'Nothing to fix: explore freely.' : 'The fix is the next stage.') : s.id === 'break' && isFinal ? 'Crash anything from the inspector.' : s.desc;
        return (
          <button
            key={s.id}
            onClick={() => onStep(s.id)}
            className={`relative rounded-2xl bg-[var(--surface)] p-4 text-left ring-1 transition-shadow hover:shadow-md dark:bg-[var(--surface)] ${next === s.id ? `${t.box} ring-2` : 'ring-[var(--header-border)] dark:ring-[var(--header-border)]'}`}
          >
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <span className={`flex h-6 w-6 items-center justify-center rounded-md ${done ? t.icon : 'bg-[var(--surface-muted)] text-[var(--text-subtle)] dark:bg-[var(--surface-muted)] dark:text-[var(--text-muted)]'}`}>
                  <Icon className="h-3.5 w-3.5" />
                </span>
                <span className="text-sm font-semibold text-[var(--text-base)] dark:text-[var(--text-base)]">
                  <span className="text-[var(--text-subtle)] dark:text-[var(--text-subtle)] mr-1">{k + 1}</span>
                  {s.title}
                </span>
              </span>
              {done && (
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-white">
                  <Check className="h-3 w-3" strokeWidth={3} />
                </span>
              )}
            </div>
            <p className="mt-1.5 text-xs leading-relaxed text-[var(--text-muted)] dark:text-[var(--text-subtle)]">{desc}</p>
            <div className="mt-3 h-1 overflow-hidden rounded-full bg-[var(--surface-muted)] dark:bg-[var(--surface-muted)]">
              <div className={`h-full rounded-full ${t.bar} transition-all`} style={{ width: done ? '100%' : next === s.id ? '15%' : '0%' }} />
            </div>
          </button>
        );
      })}
    </nav>
  );
};
