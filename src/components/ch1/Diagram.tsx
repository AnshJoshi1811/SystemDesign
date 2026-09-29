import React, { useLayoutEffect, useRef, useState } from 'react';
import { Globe, Network, Server, Database, HardDrive, Zap, KeyRound, Inbox, Cog, Cloud, Plus, Minus, Maximize2 } from 'lucide-react';
import { Arch, ArchEdge, ArchNode, Kind, NodeState, SimResult } from './model';

const ICON: Record<Kind, React.ComponentType<{ className?: string }>> = {
  dns: Globe,
  cdn: Cloud,
  lb: Network,
  server: Server,
  web: Server,
  cache: Zap,
  session: KeyRound,
  queue: Inbox,
  workers: Cog,
  master: Database,
  replica: HardDrive,
};

/** Tint per component family: networking blue/violet, compute green, data rose/teal, async amber. */
const TINT: Record<Kind, { box: string; icon: string }> = {
  dns: { box: 'bg-sky-50 ring-sky-200 dark:bg-sky-400/[0.07] dark:ring-sky-400/25', icon: 'text-sky-600 dark:text-sky-300' },
  cdn: { box: 'bg-sky-50 ring-sky-200 dark:bg-sky-400/[0.07] dark:ring-sky-400/25', icon: 'text-sky-600 dark:text-sky-300' },
  lb: { box: 'bg-violet-50 ring-violet-200 dark:bg-violet-400/[0.07] dark:ring-violet-400/25', icon: 'text-violet-600 dark:text-violet-300' },
  server: { box: 'bg-emerald-50 ring-emerald-200 dark:bg-emerald-400/[0.07] dark:ring-emerald-400/25', icon: 'text-emerald-600 dark:text-emerald-300' },
  web: { box: 'bg-emerald-50 ring-emerald-200 dark:bg-emerald-400/[0.07] dark:ring-emerald-400/25', icon: 'text-emerald-600 dark:text-emerald-300' },
  cache: { box: 'bg-amber-50 ring-amber-200 dark:bg-amber-400/[0.07] dark:ring-amber-400/25', icon: 'text-amber-600 dark:text-amber-300' },
  session: { box: 'bg-amber-50 ring-amber-200 dark:bg-amber-400/[0.07] dark:ring-amber-400/25', icon: 'text-amber-600 dark:text-amber-300' },
  queue: { box: 'bg-orange-50 ring-orange-200 dark:bg-orange-400/[0.07] dark:ring-orange-400/25', icon: 'text-orange-600 dark:text-orange-300' },
  workers: { box: 'bg-orange-50 ring-orange-200 dark:bg-orange-400/[0.07] dark:ring-orange-400/25', icon: 'text-orange-600 dark:text-orange-300' },
  master: { box: 'bg-rose-50 ring-rose-200 dark:bg-rose-400/[0.07] dark:ring-rose-400/25', icon: 'text-rose-600 dark:text-rose-300' },
  replica: { box: 'bg-teal-50 ring-teal-200 dark:bg-teal-400/[0.07] dark:ring-teal-400/25', icon: 'text-teal-600 dark:text-teal-300' },
};

const statusDot = (s: NodeState['status']) =>
  s === 'down' ? 'bg-rose-500' : s === 'busy' ? 'bg-amber-500' : s === 'promoting' ? 'bg-violet-500 animate-pulse' : s === 'idle' ? 'bg-slate-300' : 'bg-emerald-500';

const NodeCard: React.FC<{ node: ArchNode; state: NodeState; selected: boolean; onSelect: () => void }> = ({ node, state, selected, onSelect }) => {
  const Icon = ICON[node.kind];
  const down = state.status === 'down';
  const tint = TINT[node.kind];
  return (
    <button
      data-node={node.id}
      onClick={onSelect}
      aria-pressed={selected}
      aria-label={`${node.label}: ${down ? 'down' : state.status}`}
      className={`relative flex w-[176px] items-center gap-2.5 rounded-xl px-3 py-2.5 text-left ring-1 transition-all ${
        down ? 'bg-rose-50/60 ring-rose-300 dark:bg-rose-500/[0.08] dark:ring-rose-500/40' : tint.box
      } ${selected ? 'ring-2 !ring-indigo-500 shadow-md' : 'hover:shadow-sm'}`}
    >
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/80 dark:bg-white/[0.06] ${down ? 'text-rose-500' : tint.icon}`}>
        <Icon className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${statusDot(state.status)}`} />
          <span className={`truncate text-[13px] font-semibold ${down ? 'text-rose-700 line-through dark:text-rose-300' : 'text-slate-900 dark:text-white'}`}>{node.label}</span>
        </span>
        <span className="block truncate text-[11px] text-slate-500 dark:text-slate-400">{state.role ?? node.sub}</span>
      </span>
      {state.badge && (
        <span
          className={`absolute -top-2 right-2 rounded-md px-1.5 py-0.5 text-[11px] font-semibold tabular-nums shadow-sm ring-1 ${
            down
              ? 'bg-rose-600 text-white ring-rose-600'
              : state.status === 'busy'
              ? 'bg-amber-100 text-amber-800 ring-amber-200 dark:bg-amber-400/20 dark:text-amber-200 dark:ring-amber-400/30'
              : 'bg-white text-slate-700 ring-slate-200 dark:bg-[#1a1a1d] dark:text-slate-200 dark:ring-white/10'
          }`}
        >
          {state.badge}
        </span>
      )}
    </button>
  );
};

interface Line {
  d: string;
  kind: ArchEdge['kind'];
  dead: boolean;
  key: string;
}

/** Vertical architecture diagram: HTML node cards in rows, SVG connectors measured from the DOM. */
export const Diagram: React.FC<{
  arch: Arch;
  sim: SimResult;
  selected: string | null;
  onSelect: (id: string) => void;
  running: boolean;
}> = ({ arch, sim, selected, onSelect, running }) => {
  const outerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [fit, setFit] = useState(1);
  const [zoom, setZoom] = useState(1);
  // Shrink to fit, but never below a readable size: past that the diagram scrolls sideways.
  const scale = Math.max(fit, 0.6) * zoom;

  // Fit the diagram to the available width.
  useLayoutEffect(() => {
    const outer = outerRef.current;
    const inner = innerRef.current;
    if (!outer || !inner) return;
    const measure = () => {
      const natural = inner.scrollWidth;
      setFit(Math.min(1, (outer.clientWidth - 16) / natural));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(outer);
    return () => ro.disconnect();
  }, [arch]);

  // Route connectors between node cards (in unscaled coordinates).
  useLayoutEffect(() => {
    const inner = innerRef.current;
    if (!inner) return;
    const base = inner.getBoundingClientRect();
    const rect = (id: string) => {
      const el = inner.querySelector(`[data-node="${id}"]`) as HTMLElement | null;
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: (r.left - base.left) / scale, y: (r.top - base.top) / scale, w: r.width / scale, h: r.height / scale };
    };
    const out: Line[] = [];
    arch.edges.forEach((e, i) => {
      const a = rect(e.from);
      const b = rect(e.to);
      if (!a || !b) return;
      const dead = sim.nodes[e.from]?.status === 'down' || sim.nodes[e.to]?.status === 'down';
      let d: string;
      if (Math.abs(a.y - b.y) < 10) {
        // Same row: horizontal connector between facing sides.
        const [l, r] = a.x < b.x ? [a, b] : [b, a];
        const y = a.y + a.h / 2;
        d = a.x < b.x ? `M${l.x + l.w},${y} H${r.x - 2}` : `M${r.x},${y} H${l.x + l.w + 2}`;
      } else {
        const x1 = a.x + a.w / 2;
        const y1 = a.y + a.h;
        const x2 = b.x + b.w / 2;
        const y2 = b.y - 2;
        const my = y1 + Math.max(10, (y2 - y1) / 2);
        d = Math.abs(x1 - x2) < 1 ? `M${x1},${y1} V${y2}` : `M${x1},${y1} V${my} H${x2} V${y2}`;
      }
      out.push({ d, kind: e.kind, dead, key: `${e.from}-${e.to}-${i}` });
    });
    setLines(out);
    setSize({ w: inner.scrollWidth, h: inner.scrollHeight });
  }, [arch, sim, scale]);

  // When the diagram is wider than its box, start scrolled to the middle (the request path is centred).
  useLayoutEffect(() => {
    const outer = outerRef.current;
    if (outer && outer.scrollWidth > outer.clientWidth) outer.scrollLeft = (outer.scrollWidth - outer.clientWidth) / 2;
  }, [arch, size.w, scale]);

  const stroke = (l: Line) =>
    l.dead
      ? 'stroke-rose-300 dark:stroke-rose-500/50'
      : l.kind === 'replication'
      ? 'stroke-emerald-500'
      : l.kind === 'async'
      ? 'stroke-orange-400'
      : l.kind === 'static'
      ? 'stroke-sky-400'
      : 'stroke-slate-400 dark:stroke-slate-500';

  const row = (nodes: ArchNode[], cls = 'justify-center') =>
    nodes.length > 0 && (
      <div className={`relative z-10 flex flex-wrap gap-x-6 gap-y-4 ${cls}`}>
        {nodes.map((n) => (
          <NodeCard key={n.id} node={n} state={sim.nodes[n.id] ?? { status: 'healthy', load: 0 }} selected={selected === n.id} onSelect={() => onSelect(n.id)} />
        ))}
      </div>
    );

  const webGroups = arch.f.multiDc ? [arch.webs.filter((w) => w.dc === 1), arch.webs.filter((w) => w.dc === 2)] : [arch.webs];

  return (
    <div className="relative">
      <div ref={outerRef} className="overflow-x-auto overflow-y-hidden rounded-xl bg-[radial-gradient(circle,rgb(148_163_184/0.25)_1px,transparent_1px)] [background-size:18px_18px] py-6">
        <div className="relative mx-auto" style={{ width: size.w * scale || undefined, height: size.h * scale || undefined }}>
          <div
            ref={innerRef}
            className="absolute left-0 top-0 flex w-max flex-col gap-10 px-4"
            style={{ transform: `scale(${scale})`, transformOrigin: 'top left' }}
          >
            <svg className="pointer-events-none absolute left-0 top-0 z-0 overflow-visible" width={size.w} height={size.h} aria-hidden>
              <defs>
                <marker id="ch1-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                  <path d="M0,0 L10,5 L0,10 z" fill="context-stroke" />
                </marker>
              </defs>
              {lines.map((l) => (
                <path
                  key={l.key}
                  d={l.d}
                  fill="none"
                  strokeWidth={1.6}
                  className={`${stroke(l)} ${running && !l.dead && l.kind === 'request' ? 'flow-dash' : ''}`}
                  strokeDasharray={l.dead ? '2 4' : l.kind === 'request' ? (running ? '6 6' : undefined) : '5 4'}
                  markerEnd="url(#ch1-arrow)"
                />
              ))}
            </svg>

            {row(arch.edge)}
            {row(arch.lbs, arch.f.multiDc ? 'justify-around' : 'justify-center')}
            {arch.f.multiDc ? (
              <div className="relative z-10 flex justify-center gap-10">
                {webGroups.map((g, i) => (
                  <div key={i} className="rounded-2xl border border-dashed border-slate-300 dark:border-white/15 p-3 pt-6 relative">
                    <span className="absolute left-3 top-1.5 text-[11px] font-medium text-slate-500 dark:text-slate-400">{i === 0 ? 'US-East' : 'US-West'}</span>
                    {row(g)}
                  </div>
                ))}
              </div>
            ) : (
              row(arch.webs)
            )}
            {(arch.dataLeft.length > 0 || arch.dbs.length > 0 || arch.dataRight.length > 0) && (
              <div className="relative z-10 flex items-start justify-center gap-10">
                {arch.dataLeft.length > 0 && <div className="flex flex-col gap-4">{row(arch.dataLeft, 'flex-col')}</div>}
                {row(arch.dbs)}
                {arch.dataRight.length > 0 && <div className="flex gap-6">{row(arch.dataRight)}</div>}
              </div>
            )}
            {row(arch.replicas)}
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
        <LegendItem cls="stroke-slate-400" label="Request flow" />
        {arch.f.replicas && <LegendItem cls="stroke-emerald-500" dashed label="Replication (async)" />}
        {arch.f.queue && <LegendItem cls="stroke-orange-400" dashed label="Queued jobs" />}
        {arch.f.cdn && <LegendItem cls="stroke-sky-400" dashed label="Static files" />}
        <LegendItem cls="stroke-rose-300" dotted label="Broken link" />
      </div>

      {/* Zoom */}
      <div className="absolute right-2 top-2 flex flex-col overflow-hidden rounded-lg bg-white ring-1 ring-slate-200 shadow-sm dark:bg-[#18181b] dark:ring-white/10">
        <ZoomBtn label="Zoom in" onClick={() => setZoom((z) => Math.min(1.6, z + 0.15))}>
          <Plus className="h-4 w-4" />
        </ZoomBtn>
        <ZoomBtn label="Zoom out" onClick={() => setZoom((z) => Math.max(0.5, z - 0.15))}>
          <Minus className="h-4 w-4" />
        </ZoomBtn>
        <ZoomBtn label="Fit to screen" onClick={() => setZoom(1)}>
          <Maximize2 className="h-3.5 w-3.5" />
        </ZoomBtn>
      </div>
    </div>
  );
};

const ZoomBtn: React.FC<{ label: string; onClick: () => void; children: React.ReactNode }> = ({ label, onClick, children }) => (
  <button onClick={onClick} title={label} aria-label={label} className="flex h-8 w-8 items-center justify-center text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/[0.06]">
    {children}
  </button>
);

const LegendItem: React.FC<{ cls: string; label: string; dashed?: boolean; dotted?: boolean }> = ({ cls, label, dashed, dotted }) => (
  <span className="flex items-center gap-2">
    <svg width="28" height="8" aria-hidden>
      <line x1="0" y1="4" x2="28" y2="4" className={cls} strokeWidth="1.6" strokeDasharray={dotted ? '2 4' : dashed ? '5 4' : undefined} />
    </svg>
    {label}
  </span>
);
