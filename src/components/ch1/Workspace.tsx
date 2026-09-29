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
  Layers,
} from 'lucide-react';
import { usePersistentState } from '../../lib/usePersistentState';
import { WhatChanged, Quiz } from '../learn/LearningKit';
import { Callout, Segmented } from '../lesson/blocks';
import { useNav } from '../lesson/ChapterPlayer';
import { STAGES, StageContent } from './content';
import { FINAL_STAGE, STAGE_META, COMPONENT_INFO, TECH, KIND_NAME, Experiment } from './meta';
import { buildArch, simulate, Inputs, Failures, CAP, FAILOVER_MS, ArchNode, NodeState, Kind } from './model';
import { Diagram } from './Diagram';

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
  const [storedTab, setTab] = usePersistentState<Tab>('chapter1:tab', 'architecture');
  const tab: Tab = storedTab === 'concepts' ? 'concepts' : 'architecture';
  const [flows, setFlows] = usePersistentState<Record<number, Flow>>('chapter1:flow', {});
  const [afterMap, setAfterMap] = usePersistentState<Record<number, boolean>>('chapter1:after', {});
  const [inputsMap, setInputsMap] = usePersistentState<Record<number, Inputs>>('chapter1:inputs', {});
  const [pickerOpen, setPickerOpen] = useState(false);

  const i = Math.min(Math.max(0, stage), N - 1);
  const content = ALL_STAGES[i];
  const meta = STAGE_META[i];
  const after = hasFix(i) ? afterMap[i] ?? true : true; // open on this stage's own design
  const level = levelFor(i, after);
  const inputs: Inputs = inputsMap[i] ?? { ...meta.defaults, cacheHit: 80 };
  const arch = useMemo(() => buildArch(level, inputs.websPerDc), [level, inputs.websPerDc]);

  const [fail, setFail] = useState<Failures>(noFailures);
  const [selected, setSelected] = useState<string | null>(meta.keyNode);
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
              className={`w-full flex items-center gap-3 rounded-lg px-2.5 py-2 text-left text-sm transition-colors ${
                active
                  ? 'bg-indigo-50 font-medium text-indigo-900 ring-1 ring-indigo-200 dark:bg-indigo-400/[0.12] dark:text-white dark:ring-indigo-400/30'
                  : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/[0.05]'
              }`}
            >
              <span
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
                  done ? 'bg-emerald-500 text-white' : active ? 'bg-indigo-600 ring-4 ring-indigo-100 dark:ring-indigo-400/20' : 'ring-2 ring-slate-300 dark:ring-white/20'
                }`}
              >
                {done && <Check className="h-3 w-3" strokeWidth={3} />}
              </span>
              <span className="text-xs tabular-nums text-slate-500 dark:text-slate-400 w-5">{String(k + 1).padStart(2, '0')}</span>
              <span className="truncate">{s.title}</span>
            </button>
          </li>
        );
      })}
    </ol>
  );

  const progressCard = (
    <div className="rounded-xl bg-white ring-1 ring-slate-200 p-3.5 dark:bg-white/[0.03] dark:ring-white/10">
      <div className="flex items-baseline justify-between">
        <p className="text-sm font-semibold text-slate-900 dark:text-white">Chapter progress</p>
        <p className="text-xs tabular-nums text-slate-500 dark:text-slate-400">
          {doneCount} / {N} stages
        </p>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-white/10">
        <div className="h-full rounded-full bg-indigo-600 transition-all" style={{ width: `${(doneCount / N) * 100}%` }} />
      </div>
    </div>
  );

  return (
    <div className="lg:grid lg:grid-cols-[250px_minmax(0,1fr)] lg:gap-8">
      {/* ---------- Stage rail ---------- */}
      <aside className="hidden lg:block">
        <div className="sticky top-20 space-y-5">
          <div>
            <p className="text-xs font-semibold text-indigo-600 dark:text-indigo-300">Chapter 1</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">System design foundations</p>
            <p className="mt-1 text-lg font-bold leading-snug text-slate-900 dark:text-white">Scale from 0 → 1M users</p>
          </div>
          {stageList}
          {progressCard}
          <button onClick={resetChapter} className="flex items-center gap-1.5 px-2.5 text-xs text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200">
            <RotateCcw className="h-3 w-3" /> Restart this chapter
          </button>
        </div>
      </aside>

      <div className="min-w-0 space-y-5">
        {/* ---------- Mobile stage picker ---------- */}
        <div className="lg:hidden rounded-xl bg-white ring-1 ring-slate-200 dark:bg-white/[0.03] dark:ring-white/10">
          <button onClick={() => setPickerOpen((o) => !o)} aria-expanded={pickerOpen} className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left">
            <span className="min-w-0">
              <span className="block text-xs text-slate-500 dark:text-slate-400">
                Chapter 1 · Stage {i + 1} of {N}
              </span>
              <span className="block truncate text-sm font-medium text-slate-900 dark:text-white">{content.title}</span>
            </span>
            <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${pickerOpen ? 'rotate-180' : ''}`} />
          </button>
          {pickerOpen && <div className="space-y-3 border-t border-slate-100 p-3 dark:border-white/10">{stageList}{progressCard}</div>}
        </div>

        {/* ---------- Stage header ---------- */}
        <header className="rounded-2xl bg-white ring-1 ring-slate-200 p-5 dark:bg-white/[0.03] dark:ring-white/10">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div className="flex gap-4 min-w-0">
              <span className="hidden sm:flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600 ring-1 ring-indigo-100 dark:bg-indigo-400/10 dark:text-indigo-300 dark:ring-indigo-400/20">
                <Layers className="h-7 w-7" />
              </span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-600 dark:bg-white/[0.06] dark:text-slate-300">
                    Stage {i + 1} of {N}
                  </span>
                  <span className="flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-600 dark:bg-white/[0.06] dark:text-slate-300">
                    <Clock className="h-3 w-3" /> ~{meta.minutes} min
                  </span>
                </div>
                <h1 className="mt-1.5 text-2xl font-bold tracking-tight text-slate-900 dark:text-white">{content.title}</h1>
                <p className="mt-1 max-w-2xl text-sm leading-relaxed text-slate-600 dark:text-slate-300">{content.goal}</p>
              </div>
            </div>
            <div className="flex shrink-0 gap-2">
              <button
                onClick={() => goStage(i - 1)}
                disabled={i === 0}
                className="inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-medium text-slate-700 ring-1 ring-slate-300 hover:bg-slate-50 disabled:opacity-40 dark:bg-white/[0.04] dark:text-slate-200 dark:ring-white/15"
              >
                <ArrowLeft className="h-4 w-4" /> Previous
              </button>
              <button
                onClick={() => goStage(Math.min(N - 1, i + 1))}
                disabled={i === N - 1}
                className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-500 disabled:opacity-40"
              >
                Next <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </header>

        {/* ---------- Tabs ---------- */}
        <nav className="flex gap-1 overflow-x-auto no-scrollbar" aria-label="Stage views">
          {(
            [
              ['architecture', 'Architecture', Boxes],
              ['concepts', 'Concepts', BookOpen],
            ] as [Tab, string, React.ComponentType<{ className?: string }>][]
          ).map(([id, label, Icon]) => (
            <button
              key={id}
              onClick={() => openTab(id)}
              aria-current={tab === id ? 'page' : undefined}
              className={`flex shrink-0 items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition-colors ${
                tab === id ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 hover:bg-white hover:ring-1 hover:ring-slate-200 dark:text-slate-300 dark:hover:bg-white/[0.05] dark:hover:ring-white/10'
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </nav>

        {/* ---------- Architecture ---------- */}
        {tab === 'architecture' && (
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
            <section className="min-w-0 rounded-2xl bg-white ring-1 ring-slate-200 p-4 sm:p-5 dark:bg-white/[0.03] dark:ring-white/10">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <div className="flex items-center gap-2.5">
                  <span className={`h-2.5 w-2.5 rounded-full ${health === 'ok' ? 'bg-emerald-500' : health === 'degraded' ? 'bg-amber-500' : 'bg-rose-500'}`} />
                  <h2 className="font-semibold text-slate-900 dark:text-white">Stage {i + 1}: {content.title}</h2>
                  <span
                    className={`rounded-md px-2 py-0.5 text-xs font-medium ${
                      health === 'ok'
                        ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-300'
                        : health === 'degraded'
                        ? 'bg-amber-50 text-amber-700 dark:bg-amber-400/10 dark:text-amber-300'
                        : 'bg-rose-50 text-rose-700 dark:bg-rose-400/10 dark:text-rose-300'
                    }`}
                  >
                    {health === 'ok' ? 'Running' : health === 'degraded' ? 'Degraded' : 'Outage'}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {meta.experiments.map((ex) => (
                    <button
                      key={ex.id}
                      onClick={() => runExperiment(ex)}
                      title={ex.description}
                      className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-rose-700 ring-1 ring-rose-200 hover:bg-rose-50 dark:text-rose-300 dark:ring-rose-400/30 dark:hover:bg-rose-400/10"
                    >
                      <Flame className="h-3.5 w-3.5" /> {ex.label}
                    </button>
                  ))}
                  {hasFix(i) && (
                    <Segmented
                      label="Architecture version"
                      value={after ? 'after' : 'before'}
                      options={[
                        { value: 'before', label: meta.toggle?.[0] ?? 'Before' },
                        { value: 'after', label: meta.toggle?.[1] ?? 'After' },
                      ]}
                      onChange={(v) => setAfter(v === 'after')}
                    />
                  )}
                  <button
                    onClick={clearFailures}
                    className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50 dark:text-slate-300 dark:ring-white/10 dark:hover:bg-white/[0.05]"
                  >
                    <RotateCcw className="h-3.5 w-3.5" /> Reset
                  </button>
                </div>
              </div>

              {failing && (
                <Callout
                  className="mb-4"
                  tone={health === 'ok' ? 'success' : health === 'outage' ? 'danger' : 'warning'}
                  title={health === 'ok' ? 'The architecture absorbed the failure' : sim.headline}
                >
                  <FailureSummary sim={sim} after={after} stage={i} withLabel={meta.toggle?.[1]} withoutLabel={meta.toggle?.[0]} />
                </Callout>
              )}

              <Diagram arch={arch} sim={sim} selected={selected} onSelect={select} running={sim.success > 0} />

              {/* Simulation controls */}
              <div className="mt-5 rounded-xl bg-slate-50 p-4 dark:bg-white/[0.03]">
                <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-800 dark:text-slate-100">
                  <Settings2 className="h-4 w-4" /> Simulation controls
                </p>
                <div className="grid gap-4 sm:grid-cols-3">
                  <Control label="Traffic (requests/sec)" value={`${inputs.rps.toLocaleString()} RPS`}>
                    <input type="range" min={0} max={100} value={rpsToPos(inputs.rps)} onChange={(e) => setInputs({ rps: posToRps(Number(e.target.value)) })} className="w-full accent-indigo-600" aria-label="Traffic" />
                  </Control>
                  <Control label="Read / write mix" value={`${inputs.readPct}% / ${100 - inputs.readPct}%`}>
                    <input type="range" min={50} max={99} value={inputs.readPct} onChange={(e) => setInputs({ readPct: Number(e.target.value) })} className="w-full accent-emerald-600" aria-label="Read share" />
                  </Control>
                  <Control label={arch.f.multiDc ? 'Web servers per data center' : 'Web servers'} value={arch.f.lb ? `${inputs.websPerDc} nodes` : '1 node'}>
                    {arch.f.lb ? (
                      <div className="flex items-center gap-2">
                        <StepBtn label="Remove a web server" onClick={() => setInputs({ websPerDc: Math.max(1, inputs.websPerDc - 1) })} disabled={inputs.websPerDc <= 1}>
                          <Minus className="h-4 w-4" />
                        </StepBtn>
                        <span className="w-8 text-center text-sm tabular-nums">{inputs.websPerDc}</span>
                        <StepBtn label="Add a web server" onClick={() => setInputs({ websPerDc: Math.min(4, inputs.websPerDc + 1) })} disabled={inputs.websPerDc >= 4}>
                          <Plus className="h-4 w-4" />
                        </StepBtn>
                      </div>
                    ) : (
                      <p className="text-xs text-slate-500 dark:text-slate-400">Needs a load balancer in front of the web servers.</p>
                    )}
                  </Control>
                </div>
                {arch.f.cache && (
                  <details className="mt-4 [&_summary::-webkit-details-marker]:hidden">
                    <summary className="cursor-pointer text-sm text-slate-600 dark:text-slate-300">Advanced settings</summary>
                    <div className="mt-3 max-w-sm">
                      <Control label="Cache hit ratio" value={`${inputs.cacheHit}%`}>
                        <input type="range" min={0} max={99} value={inputs.cacheHit} onChange={(e) => setInputs({ cacheHit: Number(e.target.value) })} className="w-full accent-amber-500" aria-label="Cache hit ratio" />
                      </Control>
                    </div>
                  </details>
                )}
              </div>
            </section>

            <Inspector
              node={selNode}
              state={selNode ? sim.nodes[selNode.id] : undefined}
              crashed={selNode ? fail.crashed.includes(selNode.id) : false}
              count={selNode ? arch.all.filter((n) => n.kind === selNode.kind).length : 0}
              onClose={() => setSelected(null)}
              onCrash={() => selNode && crash(selNode.id)}
              onRecover={() => selNode && recover(selNode.id)}
            />

            <TechStack arch={arch} selected={selected} onSelect={select} />
          </div>
        )}

        {/* ---------- Concepts ---------- */}
        {tab === 'concepts' && (
          <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <div className="space-y-5">
              <div className="rounded-2xl bg-white p-5 ring-1 ring-slate-200 dark:bg-white/[0.03] dark:ring-white/10 lesson-prose max-w-none">
                <p>{content.why}</p>
                <p>
                  <strong>Weak spot: </strong>
                  {content.weakSpot}
                </p>
                <p>
                  <strong>{i === N - 1 ? 'Next: ' : 'The fix: '}</strong>
                  {content.fix}
                </p>
              </div>
              {i > 0 && <WhatChanged before={content.before} after={content.after} reason={content.reason} />}
              <Callout tone="idea" title="Key takeaway">
                {content.takeaway}
              </Callout>
            </div>
            <div id="ch1-check">
              <Quiz
                key={i}
                persistKey={`chapter1:quiz:stage${i}`}
                questions={content.quiz}
                title="Quick check"
                onProgress={(s, t) => s === t && mark('check')}
              />
            </div>
          </section>
        )}

        {/* ---------- Learning flow ---------- */}
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

const Control: React.FC<{ label: string; value: string; children: React.ReactNode }> = ({ label, value, children }) => (
  <div className="rounded-lg bg-white p-3 ring-1 ring-slate-200 dark:bg-white/[0.03] dark:ring-white/10">
    <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
    <p className="mb-2 text-base font-semibold tabular-nums text-slate-900 dark:text-white">{value}</p>
    {children}
  </div>
);

const StepBtn: React.FC<{ label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }> = ({ label, onClick, disabled, children }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    aria-label={label}
    className="flex h-8 w-8 items-center justify-center rounded-lg ring-1 ring-slate-300 text-slate-700 hover:bg-slate-100 disabled:opacity-40 dark:ring-white/15 dark:text-slate-200 dark:hover:bg-white/[0.06]"
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
}> = ({ node, state, crashed, count, onClose, onCrash, onRecover }) => {
  const [view, setView] = useState<'overview' | 'tech' | 'metrics' | 'config'>('overview');
  if (!node) {
    return (
      <aside className="rounded-2xl bg-white p-5 ring-1 ring-slate-200 dark:bg-white/[0.03] dark:ring-white/10">
        <p className="flex items-center gap-2 font-semibold text-slate-900 dark:text-white">
          <Search className="h-4 w-4" /> Component inspector
        </p>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Click any component in the diagram to see what it does and to crash it.</p>
      </aside>
    );
  }
  const info = COMPONENT_INFO[node.kind];
  const status = state?.status ?? 'healthy';
  return (
    <aside className="self-start rounded-2xl bg-white p-5 ring-1 ring-slate-200 dark:bg-white/[0.03] dark:ring-white/10 xl:sticky xl:top-20">
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-2 font-semibold text-slate-900 dark:text-white">
          <Search className="h-4 w-4" /> Component inspector
        </p>
        <button onClick={onClose} aria-label="Close inspector" className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-white/[0.06]">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-4 flex items-center justify-between gap-3 rounded-xl ring-1 ring-slate-200 p-3 dark:ring-white/10">
        <div className="min-w-0">
          <p className="truncate font-semibold text-slate-900 dark:text-white">{node.label}</p>
          <p className="truncate text-xs text-slate-500 dark:text-slate-400">{state?.role ?? node.sub}</p>
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

      <div className="mt-4 flex border-b border-slate-200 dark:border-white/10 text-sm" role="tablist">
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
            className={`flex-1 border-b-2 px-2 py-2 -mb-px ${view === id ? 'border-indigo-600 font-medium text-indigo-700 dark:text-indigo-300' : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400'}`}
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
            <p className="text-xs text-slate-500 dark:text-slate-400">What teams actually run for this component:</p>
            <ul className="space-y-2">
              {TECH[node.kind].map((t, k) => (
                <li key={t.name} className="rounded-xl bg-slate-50 p-3 dark:bg-white/[0.04]">
                  <p className="flex items-center gap-2 font-semibold text-slate-900 dark:text-white">
                    {t.name}
                    {k === 0 && <span className="rounded-md bg-indigo-50 px-1.5 py-0.5 text-[11px] font-medium text-indigo-700 dark:bg-indigo-400/15 dark:text-indigo-300">common pick</span>}
                  </p>
                  <p className="mt-0.5 text-slate-600 dark:text-slate-300">{t.note}</p>
                </li>
              ))}
            </ul>
          </>
        )}
        {view === 'metrics' && (
          <dl className="divide-y divide-slate-100 dark:divide-white/10">
            <Row k="Status" v={STATUS_LABEL[status]} />
            <Row k="Load" v={status === 'down' ? '—' : `${Math.round(Math.min(1, state?.load ?? 0) * 100)}%`} />
            <Row k="Throughput" v={state?.throughput ?? '—'} />
            {state?.badge && <Row k="Now" v={state.badge} />}
          </dl>
        )}
        {view === 'config' && (
          <dl className="divide-y divide-slate-100 dark:divide-white/10">
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
          <button onClick={onCrash} className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-3 py-2.5 text-sm font-medium text-white hover:bg-indigo-500">
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
    <section className="xl:col-span-2 rounded-2xl bg-white p-4 sm:p-5 ring-1 ring-slate-200 dark:bg-white/[0.03] dark:ring-white/10">
      <div className="mb-3">
        <h2 className="flex items-center gap-2 font-semibold text-slate-900 dark:text-white">
          <Boxes className="h-4 w-4" /> Tech stack in the real world
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">What teams actually use for each piece of this architecture. Click a row to inspect that component.</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-500 dark:text-slate-400">
              <th className="py-2 pr-4 font-medium">Component</th>
              <th className="py-2 font-medium">Common technologies</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-white/10">
            {kinds.map(({ kind, first }) => (
              <tr
                key={kind}
                onClick={() => onSelect(first)}
                className={`cursor-pointer align-top transition-colors hover:bg-slate-50 dark:hover:bg-white/[0.03] ${selKind === kind ? 'bg-indigo-50/60 dark:bg-indigo-400/[0.06]' : ''}`}
              >
                <td className="whitespace-nowrap py-2.5 pr-4 font-medium text-slate-900 dark:text-white">{kind === 'master' && !arch.f.replicas ? 'Database' : KIND_NAME[kind]}</td>
                <td className="py-2">
                  <div className="flex flex-wrap gap-1.5">
                    {TECH[kind].map((t, k) => (
                      <span
                        key={t.name}
                        title={t.note}
                        className={`rounded-md px-2 py-1 text-xs ${
                          k === 0
                            ? 'bg-indigo-600 font-medium text-white'
                            : 'bg-slate-100 text-slate-700 dark:bg-white/[0.06] dark:text-slate-200'
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
      tone === 'indigo' ? 'bg-indigo-50 dark:bg-indigo-400/[0.08]' : tone === 'amber' ? 'bg-amber-50 dark:bg-amber-400/[0.08]' : 'bg-rose-50 dark:bg-rose-400/[0.08]'
    }`}
  >
    <p
      className={`text-xs font-semibold ${
        tone === 'indigo' ? 'text-indigo-700 dark:text-indigo-300' : tone === 'amber' ? 'text-amber-700 dark:text-amber-300' : 'text-rose-700 dark:text-rose-300'
      }`}
    >
      {title}
    </p>
    <p className="mt-0.5 text-slate-700 dark:text-slate-200">{children}</p>
  </div>
);

const Row: React.FC<{ k: string; v: string }> = ({ k, v }) => (
  <div className="flex justify-between gap-4 py-2">
    <dt className="text-slate-500 dark:text-slate-400">{k}</dt>
    <dd className="text-right text-slate-800 dark:text-slate-100">{v}</dd>
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
  indigo: { box: 'ring-indigo-200 dark:ring-indigo-400/30', icon: 'bg-indigo-500 text-white', bar: 'bg-indigo-500' },
  amber: { box: 'ring-amber-200 dark:ring-amber-400/30', icon: 'bg-amber-500 text-white', bar: 'bg-amber-500' },
  violet: { box: 'ring-violet-200 dark:ring-violet-400/30', icon: 'bg-violet-500 text-white', bar: 'bg-violet-500' },
  slate: { box: 'ring-slate-200 dark:ring-white/15', icon: 'bg-slate-500 text-white', bar: 'bg-slate-500' },
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
            className={`relative rounded-2xl bg-white p-4 text-left ring-1 transition-shadow hover:shadow-md dark:bg-white/[0.03] ${next === s.id ? `${t.box} ring-2` : 'ring-slate-200 dark:ring-white/10'}`}
          >
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <span className={`flex h-6 w-6 items-center justify-center rounded-md ${done ? t.icon : 'bg-slate-100 text-slate-500 dark:bg-white/10 dark:text-slate-300'}`}>
                  <Icon className="h-3.5 w-3.5" />
                </span>
                <span className="text-sm font-semibold text-slate-900 dark:text-white">
                  <span className="text-slate-500 dark:text-slate-400 mr-1">{k + 1}</span>
                  {s.title}
                </span>
              </span>
              {done && (
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-white">
                  <Check className="h-3 w-3" strokeWidth={3} />
                </span>
              )}
            </div>
            <p className="mt-1.5 text-xs leading-relaxed text-slate-600 dark:text-slate-400">{desc}</p>
            <div className="mt-3 h-1 overflow-hidden rounded-full bg-slate-100 dark:bg-white/10">
              <div className={`h-full rounded-full ${t.bar} transition-all`} style={{ width: done ? '100%' : next === s.id ? '15%' : '0%' }} />
            </div>
          </button>
        );
      })}
    </nav>
  );
};
