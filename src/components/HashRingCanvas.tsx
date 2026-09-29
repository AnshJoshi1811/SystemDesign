import React, { useRef, useState } from 'react';
import { PhysicalServer, VirtualNode, HashKey } from '../types';

export const MAX_VNODE_DOTS = 200;

interface HashRingCanvasProps {
  servers: PhysicalServer[];
  vnodes?: VirtualNode[];
  keys: HashKey[];
  activeLookupKey?: HashKey | null;
  highlightArc?: { startAngle: number; endAngle: number; color?: string } | null;
  onServerSelect?: (server: PhysicalServer) => void;
  onKeySelect?: (key: HashKey) => void;
  onServerDrag?: (serverId: string, newAngle: number) => void;
  onRingClick?: (angle: number) => void;
  showVNodes?: boolean;
  size?: number;
  interactive?: boolean;
  animatedTracerAngle?: number | null;
  /** Show the server colour legend under the ring. */
  showLegend?: boolean;
  /** Kept for API compatibility; theming uses Tailwind `dark:` classes. */
  isDarkMode?: boolean;
}

const ACCENT = '#6366f1'; // indigo-500: lookup walk
const MOVED = '#f43f5e'; // rose-500: keys that changed server

export const HashRingCanvas: React.FC<HashRingCanvasProps> = ({
  servers,
  vnodes = [],
  keys,
  activeLookupKey = null,
  highlightArc = null,
  onServerSelect,
  onKeySelect,
  onServerDrag,
  onRingClick,
  showVNodes = false,
  size = 460,
  interactive = true,
  animatedTracerAngle = null,
  showLegend = true,
}) => {
  const [hovered, setHovered] = useState<{ id: string; label: string; details: string } | null>(null);
  const [draggingServerId, setDraggingServerId] = useState<string | null>(null);
  const dragRef = useRef<{ serverId: string; startX: number; startY: number; moved: boolean } | null>(null);
  const suppressClickRef = useRef(false);

  const center = size / 2;
  const radius = size * 0.38;
  const nodeRadius = showVNodes ? (vnodes.length > 60 ? 4 : 7) : 12;
  // Above this many ring tokens, individual dots become noise (and slow): draw only the coloured ownership arcs.
  const drawNodeDots = !showVNodes || vnodes.length <= MAX_VNODE_DOTS;
  const keyRadius = 5;

  const polarToCartesian = (angleDeg: number, r: number) => {
    const rad = ((angleDeg - 90) * Math.PI) / 180;
    return { x: center + r * Math.cos(rad), y: center + r * Math.sin(rad) };
  };

  const cartesianToAngle = (x: number, y: number) => {
    let rad = Math.atan2(y - center, x - center) + Math.PI / 2;
    if (rad < 0) rad += 2 * Math.PI;
    return (rad * 180) / Math.PI;
  };

  const describeArc = (startAngle: number, endAngle: number, r: number) => {
    const start = polarToCartesian(startAngle, r);
    const end = polarToCartesian(endAngle, r);
    let sweep = endAngle - startAngle;
    if (sweep < 0) sweep += 360;
    return ['M', start.x, start.y, 'A', r, r, 0, sweep <= 180 ? '0' : '1', 1, end.x, end.y].join(' ');
  };

  // Pointer position in viewBox units (the SVG may be scaled down on narrow screens).
  const toLocal = (e: React.PointerEvent<SVGSVGElement> | React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const scale = rect.width > 0 ? size / rect.width : 1;
    return { x: (e.clientX - rect.left) * scale, y: (e.clientY - rect.top) * scale };
  };

  // Click on the ring band (clicks on key/server dots stop propagation before reaching here).
  const handleSvgClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (suppressClickRef.current) {
      // The tail end of a drag, not a request to place a key.
      suppressClickRef.current = false;
      return;
    }
    if (!onRingClick) return;
    const { x, y } = toLocal(e);
    if (Math.abs(Math.hypot(x - center, y - center) - radius) < 40) onRingClick(cartesianToAngle(x, y));
  };

  // Drag with mouse, pen or touch. A drag only counts once the pointer moves a few pixels,
  // so a plain tap on a server still behaves like a click.
  const handleNodePointerDown = (e: React.PointerEvent<SVGCircleElement>, serverId: string) => {
    if (!interactive || !onServerDrag) return;
    dragRef.current = { serverId, startX: e.clientX, startY: e.clientY, moved: false };
  };

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const drag = dragRef.current;
    if (!drag || !onServerDrag) return;
    if (!drag.moved) {
      if (Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) < 4) return;
      drag.moved = true;
      e.currentTarget.setPointerCapture?.(e.pointerId);
      setDraggingServerId(drag.serverId);
    }
    const { x, y } = toLocal(e);
    onServerDrag(drag.serverId, cartesianToAngle(x, y));
  };

  const endDrag = (e: React.PointerEvent<SVGSVGElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    dragRef.current = null;
    if (drag.moved) {
      // The browser fires a click right after pointerup; swallow it so a drag never places a key.
      suppressClickRef.current = true;
      setTimeout(() => {
        suppressClickRef.current = false;
      }, 0);
      if (e.currentTarget.hasPointerCapture?.(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
      setDraggingServerId(null);
    }
  };

  const displayNodes =
    showVNodes && vnodes.length > 0
      ? vnodes.map((vn) => ({ id: vn.id, serverId: vn.physicalServerId, label: vn.id, angle: vn.angle, color: vn.color }))
      : servers.map((s) => ({ id: s.id, serverId: s.id, label: s.name, angle: s.angle, color: s.color }));

  // Ownership arcs: the arc from one node to the next clockwise belongs to that next node.
  const segments: { key: string; start: number; end: number; color: string }[] = [];
  const sorted = [...displayNodes].sort((a, b) => a.angle - b.angle);
  if (sorted.length >= 2) {
    sorted.forEach((node, i) => {
      const nextNode = sorted[(i + 1) % sorted.length];
      const last = segments[segments.length - 1];
      if (last && last.color === nextNode.color && last.end === node.angle) last.end = nextNode.angle;
      else segments.push({ key: `arc-${node.id}`, start: node.angle, end: nextNode.angle, color: nextNode.color });
    });
  }

  const tracerEnd = animatedTracerAngle;

  return (
    <div className="relative flex flex-col items-center select-none">
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className={`overflow-visible w-full h-auto ${onRingClick ? 'cursor-pointer' : ''}`}
        style={{ maxWidth: size }}
        role="img"
        aria-label={`Hash ring with ${showVNodes ? `${vnodes.length} virtual nodes` : `${servers.length} servers`} and ${keys.length} keys. Each key belongs to the first node clockwise from it.`}
        onClick={handleSvgClick}
        onPointerMove={handlePointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        {/* Guide circle */}
        <circle cx={center} cy={center} r={radius} fill="none" strokeWidth="1" className="stroke-slate-300 dark:stroke-white/15" />

        {/* Ownership arcs */}
        {segments.map((seg) => {
          let sweep = seg.end - seg.start;
          if (sweep <= 0) sweep += 360;
          if (sweep < 0.5) return null;
          const d =
            sweep >= 359.5
              ? `${describeArc(seg.start, seg.start + 180, radius)} ${describeArc(seg.start + 180, seg.start + 359.9, radius)}`
              : describeArc(seg.start, seg.end, radius);
          return <path key={seg.key} d={d} fill="none" stroke={seg.color} strokeWidth={showVNodes ? 4 : 5} opacity={0.7} />;
        })}

        {/* 0 / 2^32 marker at the top */}
        <line x1={center} y1={center - radius - 8} x2={center} y2={center - radius + 8} strokeWidth="1.5" className="stroke-slate-400 dark:stroke-slate-500" />
        <text x={center} y={center - radius - 16} textAnchor="middle" fontSize="12" className="fill-slate-500 dark:fill-slate-400" fontFamily="ui-monospace, monospace">
          0 = 2³²
        </text>

        {/* Highlighted arc (e.g. keys that move on a membership change) */}
        {highlightArc && (
          <path
            d={describeArc(highlightArc.startAngle, highlightArc.endAngle, radius)}
            fill="none"
            stroke={highlightArc.color || ACCENT}
            strokeWidth="12"
            strokeLinecap="round"
            opacity={0.45}
          />
        )}

        {/* Clockwise walk for a key lookup */}
        {activeLookupKey && tracerEnd !== null && (
          <path d={describeArc(activeLookupKey.angle, tracerEnd, radius)} fill="none" stroke={ACCENT} strokeWidth="7" strokeLinecap="round" />
        )}

        {/* Keys, just inside the ring */}
        {keys.map((k) => {
          const pos = polarToCartesian(k.angle, radius * 0.84);
          const isLookup = activeLookupKey?.id === k.id;
          const owner = servers.find((s) => s.id === k.assignedServerId);
          return (
            <circle
              key={k.id}
              cx={pos.x}
              cy={pos.y}
              r={isLookup ? 8 : keyRadius}
              fill={k.isMoved ? MOVED : owner?.color || ACCENT}
              strokeWidth={isLookup ? 3 : 1}
              className={`transition-all duration-300 ${isLookup ? 'stroke-slate-900 dark:stroke-white' : 'stroke-white dark:stroke-slate-900'} ${onKeySelect ? 'cursor-pointer' : ''}`}
              onClick={(e) => {
                e.stopPropagation(); // selecting a key must not also place a new key
                onKeySelect?.(k);
              }}
              onMouseEnter={() => setHovered({ id: k.id, label: k.keyString, details: `${k.hashHex} · ${k.angle.toFixed(1)}° → ${owner?.name || 'not placed yet'}` })}
              onMouseLeave={() => setHovered(null)}
            />
          );
        })}

        {/* Lookup start pin (drawn over its key dot if it is also in `keys`) */}
        {activeLookupKey && !keys.some((k) => k.id === activeLookupKey.id) && (() => {
          const pos = polarToCartesian(activeLookupKey.angle, radius * 0.84);
          return <circle cx={pos.x} cy={pos.y} r={8} fill={ACCENT} strokeWidth={3} className="stroke-slate-900 dark:stroke-white" />;
        })()}

        {/* Servers / virtual nodes on the ring */}
        {drawNodeDots &&
          displayNodes.map((node) => {
            const pos = polarToCartesian(node.angle, radius);
            const server = servers.find((s) => s.id === node.serverId);
            const labelPos = polarToCartesian(node.angle, radius + nodeRadius + (showVNodes ? 12 : 16));
            const draggable = interactive && !!onServerDrag;
            return (
              <g key={node.id} className={draggable ? (draggingServerId === node.serverId ? 'cursor-grabbing' : 'cursor-grab') : ''}>
                <circle
                  cx={pos.x}
                  cy={pos.y}
                  r={nodeRadius}
                  fill={node.color}
                  strokeWidth={showVNodes ? 1.5 : 2.5}
                  className="stroke-white dark:stroke-slate-900"
                  style={draggable ? { touchAction: 'none' } : undefined}
                  onPointerDown={(e) => handleNodePointerDown(e, node.serverId)}
                  onClick={(e) => {
                    e.stopPropagation(); // clicking a server is never a request to place a key
                    if (suppressClickRef.current) {
                      suppressClickRef.current = false;
                      return;
                    }
                    if (server && onServerSelect) onServerSelect(server);
                  }}
                  onMouseEnter={() => setHovered({ id: node.id, label: node.label, details: `${node.angle.toFixed(1)}° · ${server?.name || node.serverId}` })}
                  onMouseLeave={() => setHovered(null)}
                />
                {!showVNodes && (
                  <text
                    x={labelPos.x}
                    y={labelPos.y + 4}
                    textAnchor={node.angle > 15 && node.angle < 165 ? 'start' : node.angle > 195 && node.angle < 345 ? 'end' : 'middle'}
                    fill={node.color}
                    fontSize="12"
                    fontWeight="600"
                    className="pointer-events-none"
                  >
                    {node.label}
                  </text>
                )}
              </g>
            );
          })}

        {/* Centre summary */}
        <text x={center} y={center - 12} textAnchor="middle" fontSize="12" className="fill-slate-500 dark:fill-slate-400">
          {showVNodes ? `${vnodes.length} tokens` : `${servers.length} servers`}
        </text>
        <text x={center} y={center + 12} textAnchor="middle" fontSize="22" fontWeight="600" className="fill-slate-900 dark:fill-white">
          {keys.length}
        </text>
        <text x={center} y={center + 28} textAnchor="middle" fontSize="12" className="fill-slate-500 dark:fill-slate-400">
          keys
        </text>
      </svg>

      {showLegend && (
        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 mt-3 px-2">
          {servers.map((s) => (
            <span key={s.id} className="flex items-center gap-1.5 text-xs text-slate-700 dark:text-slate-300">
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
              {s.name}
            </span>
          ))}
        </div>
      )}
      {!drawNodeDots && (
        <p className="mt-1 text-xs text-center text-slate-500 dark:text-slate-400">
          {vnodes.length} tokens are too many to draw as dots; the ring colours still show which server owns each arc.
        </p>
      )}
      {hovered && (
        <div className="absolute bottom-10 rounded-lg bg-slate-900 px-3 py-2 text-xs text-white pointer-events-none dark:bg-slate-700">
          <span className="font-mono font-semibold">{hovered.label}</span>
          <span className="ml-2 font-mono text-slate-300">{hovered.details}</span>
        </div>
      )}
    </div>
  );
};
