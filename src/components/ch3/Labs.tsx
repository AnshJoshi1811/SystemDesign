import React, { useState } from 'react';
import { Check as CheckIcon, RotateCcw, ChevronLeft, ChevronRight } from 'lucide-react';
import { usePersistentState } from '../../lib/usePersistentState';
import { Callout, Stat, Slider, Button, Segmented } from '../lesson/blocks';
import {
  COMPONENTS,
  PROBLEMS,
  WRAP_UP,
  WRAP_TARGET,
  NO_BUY_IN,
  INTERVIEW_MIN,
  BuyIn,
  Choice,
  ComponentId,
  ProblemId,
  SimState,
  Tone,
  freshSim,
  presentBlueprint,
  toggleIn,
  toneOfWeight,
  toneOfQuality,
  toneOfRole,
  scoreStage1,
  scoreStage2,
  scoreStage3,
  scoreStage4,
  buildFeedback,
} from './data';

// =====================================================================
// Small shared pieces
// =====================================================================

const NOTE: Record<Tone, string> = {
  good: 'bg-emerald-50 text-emerald-950 dark:bg-emerald-400/[0.08] dark:text-emerald-50',
  ok: 'bg-amber-50 text-amber-950 dark:bg-amber-400/[0.08] dark:text-amber-50',
  bad: 'bg-rose-50 text-rose-950 dark:bg-rose-400/[0.08] dark:text-rose-50',
};
const NOTE_LABEL: Record<Tone, string> = { good: 'Strong', ok: 'Okay', bad: 'Weak' };

/** One line of interviewer feedback, tinted by how good the choice was. */
const Note: React.FC<{ tone: Tone; label?: string; children: React.ReactNode }> = ({ tone, label, children }) => (
  <div className={`mt-1.5 rounded-lg px-3 py-2 text-sm leading-6 ${NOTE[tone]}`}>
    <span className="font-semibold mr-1">{label ?? NOTE_LABEL[tone]}.</span>
    {children}
  </div>
);

const optionClass = (on: boolean) =>
  `w-full flex items-start gap-3 rounded-xl px-4 py-3 text-left text-sm transition-colors ring-1 ${
    on
      ? 'bg-indigo-50 ring-indigo-400 text-indigo-950 dark:bg-indigo-400/[0.1] dark:ring-indigo-400/50 dark:text-white'
      : 'bg-white ring-slate-200 text-slate-800 hover:ring-slate-300 dark:bg-white/[0.03] dark:ring-white/10 dark:text-slate-100 dark:hover:ring-white/20'
  }`;

/** A toggleable choice; its "why" appears once picked. */
const ChoiceRow: React.FC<{ picked: boolean; onClick: () => void; text: string; tone: Tone; feedback: React.ReactNode }> = ({
  picked,
  onClick,
  text,
  tone,
  feedback,
}) => (
  <li>
    <button onClick={onClick} aria-pressed={picked} className={optionClass(picked)}>
      <span
        className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded ring-1 ${
          picked ? 'bg-indigo-600 ring-indigo-600 text-white' : 'ring-slate-400 dark:ring-white/30'
        }`}
      >
        {picked && <CheckIcon className="w-3 h-3" strokeWidth={3} />}
      </span>
      <span>{text}</span>
    </button>
    {picked && <Note tone={tone}>{feedback}</Note>}
  </li>
);

const GroupTitle: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <h3 className="text-sm font-medium text-slate-700 dark:text-slate-200 mb-2">{children}</h3>
);

const InterviewerLine: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className="rounded-xl bg-slate-50 dark:bg-white/[0.04] px-4 py-3 text-sm leading-6 text-slate-700 dark:text-slate-200">
    <span className="font-medium text-slate-900 dark:text-white">Interviewer: </span>
    {children}
  </p>
);

// =====================================================================
// Boards: one per interview step. Used by the lesson labs and the full practice.
// =====================================================================

const QuestionList: React.FC<{ problem: ProblemId; picked: string[]; onToggle: (id: string) => void }> = ({ problem, picked, onToggle }) => (
  <ul className="space-y-2">
    {PROBLEMS[problem].questions.map((q) => (
      <ChoiceRow
        key={q.id}
        picked={picked.includes(q.id)}
        onClick={() => onToggle(q.id)}
        text={q.text}
        tone={toneOfWeight(q.weight)}
        feedback={
          <>
            <em>“{q.reply}”</em> {q.why}
          </>
        }
      />
    ))}
  </ul>
);

const RequirementList: React.FC<{ items: Choice[]; picked: string[]; onToggle: (id: string) => void }> = ({ items, picked, onToggle }) => (
  <ul className="space-y-2">
    {items.map((c) => (
      <ChoiceRow key={c.id} picked={picked.includes(c.id)} onClick={() => onToggle(c.id)} text={c.text} tone={toneOfWeight(c.weight)} feedback={c.why} />
    ))}
  </ul>
);

const ROLE_LABEL = { core: 'Core piece', useful: 'Useful extra', unneeded: 'Probably not needed' } as const;

const BlueprintBoard: React.FC<{
  problem: ProblemId;
  selected: ComponentId[];
  buyIn: BuyIn;
  onChange: (selected: ComponentId[], buyIn: BuyIn) => void;
}> = ({ problem, selected, buyIn, onChange }) => {
  const P = PROBLEMS[problem];
  const [last, setLast] = useState<ComponentId | null>(null);
  const core = COMPONENTS.filter((c) => P.components[c.id].role === 'core');
  const coreIn = core.filter((c) => selected.includes(c.id)).length;
  const lastRole = last && selected.includes(last) ? P.components[last] : null;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {COMPONENTS.map((c) => {
          const on = selected.includes(c.id);
          return (
            <button
              key={c.id}
              aria-pressed={on}
              onClick={() => {
                setLast(c.id);
                onChange(toggleIn(selected, c.id), { ...buyIn, status: 'none', message: '' });
              }}
              className={`rounded-xl px-3 py-2.5 text-left text-sm transition-colors ring-1 ${
                on
                  ? 'bg-indigo-50 ring-indigo-400 font-medium text-indigo-950 dark:bg-indigo-400/[0.1] dark:ring-indigo-400/50 dark:text-white'
                  : 'bg-white ring-slate-200 text-slate-700 hover:ring-slate-300 dark:bg-white/[0.03] dark:ring-white/10 dark:text-slate-200'
              }`}
            >
              {c.name}
            </button>
          );
        })}
      </div>

      {lastRole && last && (
        <Note tone={toneOfRole(lastRole.role)} label={ROLE_LABEL[lastRole.role]}>
          {COMPONENTS.find((c) => c.id === last)!.name}: {lastRole.why}
        </Note>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="primary"
          disabled={selected.length === 0 || buyIn.status === 'approved'}
          onClick={() => onChange(selected, presentBlueprint(P, selected, buyIn.attempts))}
        >
          {buyIn.status === 'approved' ? 'Interviewer agrees' : 'Present to the interviewer'}
        </Button>
        <span className="text-sm text-slate-500 dark:text-slate-400">
          Core pieces: <span className="tabular-nums font-medium text-slate-900 dark:text-white">{coreIn} of {core.length}</span>
          {buyIn.attempts > 0 && <> · presented {buyIn.attempts}×</>}
        </span>
      </div>

      {buyIn.message && (
        <Callout tone={buyIn.status === 'approved' ? 'success' : 'warning'} title={buyIn.status === 'approved' ? 'Buy-in' : 'Pushback'}>
          “{buyIn.message}”
        </Callout>
      )}
    </div>
  );
};

const DeepDiveBoard: React.FC<{ problem: ProblemId; picks: Record<string, number>; onPick: (topic: string, i: number) => void }> = ({ problem, picks, onPick }) => (
  <div className="space-y-6">
    {PROBLEMS[problem].deepDive.map((t) => {
      const p = picks[t.id];
      const opt = p === undefined ? undefined : t.options[p];
      return (
        <div key={t.id}>
          <GroupTitle>{t.title}</GroupTitle>
          <div className="space-y-2" role="radiogroup" aria-label={t.title}>
            {t.options.map((o, i) => (
              <button key={o.text} role="radio" aria-checked={p === i} onClick={() => onPick(t.id, i)} className={optionClass(p === i)}>
                <span
                  className={`mt-0.5 h-4 w-4 shrink-0 rounded-full ring-1 ${p === i ? 'bg-indigo-600 ring-indigo-600 ring-offset-2 ring-offset-white dark:ring-offset-slate-900' : 'ring-slate-400 dark:ring-white/30'}`}
                />
                <span>{o.text}</span>
              </button>
            ))}
          </div>
          {opt && <Note tone={toneOfQuality(opt.quality)}>{opt.why}</Note>}
        </div>
      );
    })}
  </div>
);

// =====================================================================
// Lesson labs (news feed)
// =====================================================================

export const ClarifyLab: React.FC = () => {
  const [picked, setPicked] = usePersistentState<string[]>('chapter3:try:questions', []);
  const P = PROBLEMS.newsfeed;
  const key = P.questions.filter((q) => q.key);
  const keyAsked = key.filter((q) => picked.includes(q.id)).length;
  const weak = P.questions.filter((q) => q.weight < 0 && picked.includes(q.id)).length;
  const nextMissing = key.find((q) => !picked.includes(q.id));

  return (
    <div className="space-y-5">
      <InterviewerLine>“{P.prompt}”</InterviewerLine>
      <QuestionList problem="newsfeed" picked={picked} onToggle={(id) => setPicked(toggleIn(picked, id))} />
      <div className="grid grid-cols-2 gap-3">
        <Stat label="Key questions asked" value={`${keyAsked} of ${key.length}`} tone={keyAsked === key.length ? 'good' : 'neutral'} />
        <Stat label="Weak questions" value={weak} tone={weak ? 'bad' : 'neutral'} />
      </div>
      {picked.length > 0 &&
        (nextMissing ? (
          <Callout tone="warning" title="Still a gap in what you know">
            You haven’t asked “{nextMissing.text}” {nextMissing.risk}
          </Callout>
        ) : (
          <Callout tone="success" title="Enough to start designing">
            You know the features, the scale and the feed order. Write them down as requirements, then move to the blueprint.
          </Callout>
        ))}
      {picked.length > 0 && (
        <Button variant="ghost" onClick={() => setPicked([])}>
          <RotateCcw className="w-4 h-4" /> Start over
        </Button>
      )}
    </div>
  );
};

export const BlueprintLab: React.FC = () => {
  const [selected, setSelected] = usePersistentState<ComponentId[]>('chapter3:try:blueprint', []);
  const [buyIn, setBuyIn] = usePersistentState<BuyIn>('chapter3:try:buyin', NO_BUY_IN);
  return (
    <div className="space-y-4">
      <BlueprintBoard
        problem="newsfeed"
        selected={selected}
        buyIn={buyIn}
        onChange={(s, b) => {
          setSelected(s);
          setBuyIn(b);
        }}
      />
      {(selected.length > 0 || buyIn.attempts > 0) && (
        <Button
          variant="ghost"
          onClick={() => {
            setSelected([]);
            setBuyIn(NO_BUY_IN);
          }}
        >
          <RotateCcw className="w-4 h-4" /> Start over
        </Button>
      )}
    </div>
  );
};

export const DeepDiveLab: React.FC = () => {
  const [picks, setPicks] = usePersistentState<Record<string, number>>('chapter3:try:deepdive', {});
  return <DeepDiveBoard problem="newsfeed" picks={picks} onPick={(t, i) => setPicks({ ...picks, [t]: i })} />;
};

// =====================================================================
// Time budget: drag step 1 and watch the deep dive shrink
// =====================================================================

const STEP2_MIN = 12;
const WRAP_MIN = 4;

export const TimeBudgetLab: React.FC = () => {
  const [step1, setStep1] = usePersistentState<number>('chapter3:try:step1min', 7);
  const left = INTERVIEW_MIN - step1 - STEP2_MIN - WRAP_MIN;
  const deep = Math.min(25, left);
  const slack = left - deep;
  const status: Tone = deep >= 15 ? 'good' : deep >= 10 ? 'ok' : 'bad';
  const deepColor = status === 'good' ? 'bg-emerald-600' : status === 'ok' ? 'bg-amber-600' : 'bg-rose-600';

  const segs = [
    { label: 'Understand', min: step1, cls: 'bg-indigo-600 text-white' },
    { label: 'High-level design', min: STEP2_MIN, cls: 'bg-slate-600 text-white dark:bg-slate-500' },
    { label: 'Deep dive', min: deep, cls: `${deepColor} text-white` },
    { label: 'Wrap up', min: WRAP_MIN, cls: 'bg-slate-300 text-slate-800 dark:bg-slate-600 dark:text-white' },
    ...(slack > 0 ? [{ label: 'Spare', min: slack, cls: 'bg-slate-100 text-slate-500 dark:bg-white/[0.06] dark:text-slate-400' }] : []),
  ];

  return (
    <div className="space-y-5">
      <div>
        <div className="flex h-10 w-full overflow-hidden rounded-lg" role="img" aria-label={`Step 1 takes ${step1} minutes, leaving ${deep} for the deep dive`}>
          {segs.map((s) => (
            <div
              key={s.label}
              title={`${s.label}: ${s.min} min`}
              className={`flex items-center justify-center text-xs font-medium tabular-nums transition-all duration-300 ${s.cls}`}
              style={{ width: `${(s.min / INTERVIEW_MIN) * 100}%` }}
            >
              {s.min >= 3 ? s.min : ''}
            </div>
          ))}
        </div>
        <div className="mt-1 flex justify-between text-[11px] tabular-nums text-slate-400">
          <span>0</span>
          <span>15</span>
          <span>30</span>
          <span>45 min</span>
        </div>
        <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600 dark:text-slate-300">
          {segs.map((s) => (
            <li key={s.label} className="flex items-center gap-1.5">
              <span className={`h-2.5 w-2.5 rounded-sm ${s.cls}`} />
              {s.label} <span className="tabular-nums text-slate-400">{s.min}m</span>
            </li>
          ))}
        </ul>
      </div>

      <Slider label="Minutes spent understanding the problem" unit=" min" value={step1} min={3} max={20} onChange={setStep1} hint="High-level design and wrap-up are held at 12 and 4 minutes." />

      <div className="grid grid-cols-2 gap-3">
        <Stat label="Step 1" value={`${step1} min`} tone={step1 <= 10 ? 'neutral' : 'bad'} hint="guide: 3–10" />
        <Stat label="Left for the deep dive" value={`${deep} min`} tone={status === 'bad' ? 'bad' : status === 'good' ? 'good' : 'neutral'} hint="guide: 10–25" />
      </div>

      {status === 'good' && <Callout tone="success" title="Room to go deep">Plenty of time for two or three components and their trade-offs.</Callout>}
      {status === 'ok' && <Callout tone="warning" title="Getting tight">You can cover one deep-dive topic properly, maybe two. State your remaining assumptions and move on.</Callout>}
      {status === 'bad' && (
        <Callout tone="danger" title="The deep dive is squeezed out">
          Only {deep} minutes left for the part where the interviewer learns the most about you.
        </Callout>
      )}
    </div>
  );
};

// =====================================================================
// Practice interview: the full four-stage simulator with a score report
// =====================================================================

const STAGES = ['Understand the problem', 'High-level design', 'Deep dive', 'Wrap up'];

export const PracticeInterview: React.FC = () => {
  const [sim, setSim] = usePersistentState<SimState>('chapter3:practice', freshSim('newsfeed'));
  const P = PROBLEMS[sim.problem] ?? PROBLEMS.newsfeed;
  const update = (patch: Partial<SimState>) => setSim((prev) => ({ ...prev, ...patch }));
  const go = (step: SimState['step']) => {
    update({ step });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const missingKey = P.questions.filter((q) => q.key && !sim.questions.includes(q.id));
  const stage1Ready = sim.questions.length > 0 && sim.fr.length > 0 && sim.nfr.length > 0;

  const nav = (back: SimState['step'] | null, next: React.ReactNode, onNext: () => void, disabled: boolean, hint?: string) => (
    <div className="space-y-2 pt-2">
      {disabled && hint && <p className="text-sm text-slate-500 dark:text-slate-400">{hint}</p>}
      <div className="flex items-center justify-between gap-3">
        {back ? (
          <Button variant="ghost" onClick={() => go(back)}>
            <ChevronLeft className="w-4 h-4" /> Back
          </Button>
        ) : (
          <span />
        )}
        <Button variant="primary" disabled={disabled} onClick={onNext}>
          {next} <ChevronRight className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented<ProblemId>
          label="Problem"
          value={sim.problem}
          options={(Object.keys(PROBLEMS) as ProblemId[]).map((id) => ({ value: id, label: PROBLEMS[id].short }))}
          onChange={(id) => id !== sim.problem && setSim(freshSim(id))}
        />
      </div>

      {sim.step <= 4 && (
        <div>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Stage {sim.step} of 4 · <span className="font-medium text-slate-900 dark:text-white">{STAGES[sim.step - 1]}</span>
          </p>
          <div className="mt-2 grid grid-cols-4 gap-1.5" aria-hidden>
            {STAGES.map((s, i) => (
              <span key={s} className={`h-1.5 rounded-full ${i + 1 < sim.step ? 'bg-emerald-500' : i + 1 === sim.step ? 'bg-indigo-600' : 'bg-slate-200 dark:bg-white/10'}`} />
            ))}
          </div>
        </div>
      )}

      {sim.step === 1 && (
        <div className="space-y-6">
          <InterviewerLine>“{P.prompt}”</InterviewerLine>
          <div>
            <GroupTitle>Ask clarifying questions</GroupTitle>
            <QuestionList problem={sim.problem} picked={sim.questions} onToggle={(id) => update({ questions: toggleIn(sim.questions, id) })} />
          </div>
          <div>
            <GroupTitle>State the functional requirements (what it does)</GroupTitle>
            <RequirementList items={P.fr} picked={sim.fr} onToggle={(id) => update({ fr: toggleIn(sim.fr, id) })} />
          </div>
          <div>
            <GroupTitle>State the non-functional requirements (how well)</GroupTitle>
            <RequirementList items={P.nfr} picked={sim.nfr} onToggle={(id) => update({ nfr: toggleIn(sim.nfr, id) })} />
          </div>
          {sim.questions.length > 0 && missingKey.length > 0 && (
            <Callout tone="warning" title={`${missingKey.length} key question${missingKey.length > 1 ? 's' : ''} not asked yet`}>
              <ul className="list-disc pl-5 space-y-1">
                {missingKey.map((q) => (
                  <li key={q.id}>
                    “{q.text}” {q.risk}
                  </li>
                ))}
              </ul>
              <p className="mt-1">You can continue, but it will cost points.</p>
            </Callout>
          )}
          {nav(null, 'Go to the blueprint', () => go(2), !stage1Ready, 'Ask at least one question and state at least one requirement of each kind.')}
        </div>
      )}

      {sim.step === 2 && (
        <div className="space-y-6">
          <InterviewerLine>“Sketch the main components for me.”</InterviewerLine>
          <BlueprintBoard problem={sim.problem} selected={sim.components} buyIn={sim.buyIn} onChange={(components, buyIn) => update({ components, buyIn })} />
          {nav(1, 'Go to the deep dive', () => go(3), sim.buyIn.status !== 'approved', 'Get the interviewer to agree to the blueprint first.')}
        </div>
      )}

      {sim.step === 3 && (
        <div className="space-y-6">
          <InterviewerLine>“Let’s go deeper on two areas. Pick an approach for each.”</InterviewerLine>
          <DeepDiveBoard problem={sim.problem} picks={sim.deepDive} onPick={(t, i) => update({ deepDive: { ...sim.deepDive, [t]: i } })} />
          {nav(2, 'Go to the wrap-up', () => go(4), P.deepDive.some((t) => sim.deepDive[t.id] === undefined), 'Choose an approach for both topics.')}
        </div>
      )}

      {sim.step === 4 && (
        <div className="space-y-6">
          <InterviewerLine>“We have about five minutes left. Anything else you’d like to cover?” Aim for {WRAP_TARGET} strong points.</InterviewerLine>
          <RequirementList items={WRAP_UP} picked={sim.wrapUp} onToggle={(id) => update({ wrapUp: toggleIn(sim.wrapUp, id) })} />
          {nav(3, 'See my score', () => go(5), sim.wrapUp.length === 0, 'Pick at least one thing to say.')}
        </div>
      )}

      {sim.step === 5 && <Report sim={sim} onRetry={() => setSim(freshSim(sim.problem))} />}
    </div>
  );
};

const Report: React.FC<{ sim: SimState; onRetry: () => void }> = ({ sim, onRetry }) => {
  const P = PROBLEMS[sim.problem];
  const scores = [scoreStage1(P, sim), scoreStage2(P, sim), scoreStage3(P, sim), scoreStage4(sim)];
  const total = scores.reduce((a, b) => a + b, 0);
  const { strengths, improve } = buildFeedback(P, sim);

  return (
    <div className="space-y-6">
      <div className="rounded-xl bg-slate-50 dark:bg-white/[0.04] p-5 text-center">
        <p className="text-sm text-slate-500 dark:text-slate-400">Your score · {P.short}</p>
        <p className={`mt-1 text-4xl font-semibold tabular-nums ${total >= 75 ? 'text-emerald-600 dark:text-emerald-400' : total >= 50 ? 'text-slate-900 dark:text-white' : 'text-rose-600 dark:text-rose-400'}`}>
          {total}
          <span className="text-base font-normal text-slate-500 dark:text-slate-400"> / 100</span>
        </p>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300 max-w-md mx-auto">
          Each stage is worth 25 points and scores the quality of your choices: good picks add, weak or out-of-scope picks subtract, and pushbacks cost points.
        </p>
      </div>

      <div className="space-y-5">
        {STAGES.map((name, i) => (
          <div key={name}>
            <div className="flex items-baseline justify-between text-sm">
              <span className="font-medium text-slate-900 dark:text-white">
                {i + 1}. {name}
              </span>
              <span className="tabular-nums text-slate-600 dark:text-slate-300">{scores[i]} / 25</span>
            </div>
            <div className="mt-1.5 h-1.5 rounded-full bg-slate-200 dark:bg-white/10 overflow-hidden">
              <div className="h-full rounded-full bg-indigo-600" style={{ width: `${(scores[i] / 25) * 100}%` }} />
            </div>
            {strengths[i].map((s) => (
              <Note key={s} tone="good" label="Did well">
                {s}
              </Note>
            ))}
            {improve[i].map((s) => (
              <Note key={s} tone="ok" label="Improve">
                {s}
              </Note>
            ))}
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button variant="primary" onClick={onRetry}>
          <RotateCcw className="w-4 h-4" /> Retry this problem
        </Button>
        <span className="text-sm text-slate-500 dark:text-slate-400">or pick another problem at the top.</span>
      </div>
    </div>
  );
};
