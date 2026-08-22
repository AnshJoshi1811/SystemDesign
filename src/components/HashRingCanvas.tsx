import React, { useState } from 'react';
import { PhysicalServer, VirtualNode, HashKey } from '../types';
import { motion, AnimatePresence } from 'motion/react';

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
  isDarkMode?: boolean;
}

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
  isDarkMode = false,
}) => {
  const [hoveredNode, setHoveredNode] = useState<{ id: string; type: 'server' | 'vnode' | 'key'; label: string; details: string; angle: number } | null>(null);
  const [draggingServerId, setDraggingServerId] = useState<string | null>(null);

  const center = size / 2;
  const radius = size * 0.38;
  const nodeRadius = showVNodes ? (vnodes.length > 60 ? 4 : 7) : 13;
  const keyRadius = 5;

  // Converts angle in degrees to SVG (x, y) coordinates
  const polarToCartesian = (angleDeg: number, r: number) => {
    const rad = ((angleDeg - 90) * Math.PI) / 180;
    return {
      x: center + r * Math.cos(rad),
      y: center + r * Math.sin(rad),
    };
  };

  // Convert SVG coordinates back to angle in degrees (0 to 360)
  const cartesianToAngle = (x: number, y: number) => {
    const dx = x - center;
    const dy = y - center;
    let rad = Math.atan2(dy, dx) + Math.PI / 2;
    if (rad < 0) rad += 2 * Math.PI;
    return (rad * 180) / Math.PI;
  };

  // Helper to construct SVG arc string
  const describeArc = (startAngle: number, endAngle: number, r: number) => {
    let start = polarToCartesian(startAngle, r);
    let end = polarToCartesian(endAngle, r);

    let sweepAngle = endAngle - startAngle;
    if (sweepAngle < 0) sweepAngle += 360;

    const largeArcFlag = sweepAngle <= 180 ? '0' : '1';

    return [
      'M', start.x, start.y,
      'A', r, r, 0, largeArcFlag, 1, end.x, end.y
    ].join(' ');
  };

  // Handle ring click to place a key
  const handleSvgClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (draggingServerId) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    // Check if click was near the ring radius
    const distFromCenter = Math.sqrt(Math.pow(x - center, 2) + Math.pow(y - center, 2));
    if (Math.abs(distFromCenter - radius) < 40 && onRingClick) {
      const clickAngle = cartesianToAngle(x, y);
      onRingClick(clickAngle);
    }
  };

  // Handle server node dragging on SVG
  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!draggingServerId || !onServerDrag) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const newAngle = cartesianToAngle(mouseX, mouseY);
    onServerDrag(draggingServerId, newAngle);
  };

  const handleMouseUp = () => {
    setDraggingServerId(null);
  };

  // Decide whether to render physical server nodes or virtual nodes
  const displayNodes = showVNodes && vnodes.length > 0
    ? vnodes.map((vn) => ({
        id: vn.id,
        serverId: vn.physicalServerId,
        label: vn.id,
        angle: vn.angle,
        color: vn.color,
        isVNode: true,
      }))
    : servers.map((s) => ({
        id: s.id,
        serverId: s.id,
        label: s.name,
        angle: s.angle,
        color: s.color,
        isVNode: false,
      }));

  return (
    <div className="relative flex flex-col items-center justify-center select-none">
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="overflow-visible cursor-pointer"
        onClick={handleSvgClick}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <defs>
          <radialGradient id="ringGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={isDarkMode ? "#38bdf8" : "#3b82f6"} stopOpacity={isDarkMode ? "0.15" : "0.08"} />
            <stop offset="100%" stopColor={isDarkMode ? "#0f172a" : "#f8fafc"} stopOpacity="0" />
          </radialGradient>
          
          <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>

        {/* Ambient Ring Background Glow */}
        <circle cx={center} cy={center} r={radius * 1.2} fill="url(#ringGlow)" />

        {/* ── Ownership arc segments: colored by the server that owns each arc ── */}
        {(() => {
          const sorted = [...displayNodes].sort((a, b) => a.angle - b.angle);
          if (sorted.length < 2) return null;
          return sorted.map((node, i) => {
            const nextNode = sorted[(i + 1) % sorted.length];
            // The arc from node.angle → nextNode.angle is owned by nextNode (clockwise lookup)
            let sweep = nextNode.angle - node.angle;
            if (sweep <= 0) sweep += 360;
            // Only draw if arc is big enough to be visible
            if (sweep < 1) return null;
            return (
              <path
                key={`arc-${node.id}`}
                d={describeArc(node.angle, nextNode.angle, radius)}
                fill="none"
                stroke={nextNode.color}
                strokeWidth={showVNodes ? 3 : 5}
                strokeLinecap="butt"
                opacity={showVNodes ? 0.55 : 0.7}
              />
            );
          });
        })()}

        {/* Base Hash Ring (thin guide circle drawn on top of arc segments) */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke={isDarkMode ? "rgba(148,163,184,0.15)" : "rgba(100,116,139,0.2)"}
          strokeWidth="1"
        />

        {/* Cardinal tick marks at 90°, 180°, 270° */}
        {[90, 180, 270].map((deg) => {
          const outer = polarToCartesian(deg, radius + 10);
          const inner = polarToCartesian(deg, radius - 10);
          return (
            <line
              key={deg}
              x1={inner.x} y1={inner.y}
              x2={outer.x} y2={outer.y}
              stroke={isDarkMode ? "rgba(148,163,184,0.25)" : "rgba(100,116,139,0.3)"}
              strokeWidth="1"
            />
          );
        })}

        {/* 0 / 2^32 Marker at top */}
        <g transform={`translate(${center}, ${center - radius - 20})`}>
          <rect
            x="-32"
            y="-12"
            width="64"
            height="20"
            rx="4"
            fill={isDarkMode ? "#1c1c1e" : "#ffffff"}
            stroke={isDarkMode ? "#334155" : "#e2e8f0"}
            strokeWidth="1"
          />
          <text
            textAnchor="middle"
            y="2"
            fill={isDarkMode ? "#64748b" : "#64748b"}
            fontSize="9"
            fontWeight="bold"
            fontFamily="monospace"
          >
            0 / 2^32
          </text>
        </g>

        {/* Highlighted Arc (e.g., during Add/Remove Server key migration) */}
        {highlightArc && (
          <motion.path
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            d={describeArc(highlightArc.startAngle, highlightArc.endAngle, radius)}
            fill="none"
            stroke={highlightArc.color || '#06b6d4'}
            strokeWidth="12"
            strokeLinecap="round"
            className="filter drop-shadow-[0_0_8px_rgba(6,182,212,0.6)]"
          />
        )}

        {/* Clockwise Traversal Tracer for Key Lookup */}
        {activeLookupKey && (
          <g>
            {/* Lookup Start Pin */}
            {(() => {
              const pos = polarToCartesian(activeLookupKey.angle, radius);
              return (
                <circle
                  cx={pos.x}
                  cy={pos.y}
                  r="7"
                  fill="#f59e0b"
                  stroke="#ffffff"
                  strokeWidth="2"
                  filter="url(#glow)"
                />
              );
            })()}

            {/* Traversal Arc */}
            {animatedTracerAngle !== null && (
              <motion.path
                d={describeArc(activeLookupKey.angle, animatedTracerAngle, radius)}
                fill="none"
                stroke="#f59e0b"
                strokeWidth="8"
                strokeLinecap="round"
              />
            )}
          </g>
        )}

        {/* Render Keys on Ring */}
        {keys.map((k) => {
          const pos = polarToCartesian(k.angle, radius * 0.84);
          const isLookup = activeLookupKey?.id === k.id;
          const assignedServer = servers.find((s) => s.id === k.assignedServerId);

          return (
            <motion.circle
              key={k.id}
              cx={pos.x}
              cy={pos.y}
              r={isLookup ? 8 : keyRadius}
              fill={k.isMoved ? '#ef4444' : assignedServer?.color || (isDarkMode ? '#38bdf8' : '#2563eb')}
              stroke={isLookup ? '#ffffff' : isDarkMode ? '#090d16' : '#ffffff'}
              strokeWidth={isLookup ? 2.5 : 1}
              className="transition-all duration-300 cursor-pointer hover:scale-150"
              onClick={() => onKeySelect && onKeySelect(k)}
              onMouseEnter={() =>
                setHoveredNode({
                  id: k.id,
                  type: 'key',
                  label: k.keyString,
                  details: `Hash: ${k.hashHex} (${k.angle.toFixed(1)}°) → ${assignedServer?.name || 'Unassigned'}`,
                  angle: k.angle,
                })
              }
              onMouseLeave={() => setHoveredNode(null)}
            />
          );
        })}

        {/* Render Server / VNode Positions */}
        {displayNodes.map((node) => {
          const pos = polarToCartesian(node.angle, radius);
          const isHovered = hoveredNode?.id === node.id;
          const physicalServer = servers.find((s) => s.id === node.serverId);

          // Label positioned outside the ring, pushed away from center
          const labelDist = radius + nodeRadius + (showVNodes ? 12 : 20);
          const labelPos = polarToCartesian(node.angle, labelDist);
          const isTopHalf = node.angle > 270 || node.angle < 90;

          return (
            <g key={node.id} className="cursor-pointer">
              {/* Outer halo — only on hover or physical servers */}
              {(!showVNodes || isHovered) && (
                <circle
                  cx={pos.x}
                  cy={pos.y}
                  r={nodeRadius + (isHovered ? 5 : 3)}
                  fill={node.color}
                  fillOpacity={0.18}
                  stroke="none"
                />
              )}

              {/* Core Node Circle */}
              <circle
                cx={pos.x}
                cy={pos.y}
                r={nodeRadius}
                fill={node.color}
                stroke={isDarkMode ? "#111113" : "#ffffff"}
                strokeWidth={showVNodes ? 1.5 : 2.5}
                onMouseDown={() => interactive && onServerDrag && setDraggingServerId(node.serverId)}
                onClick={() => physicalServer && onServerSelect && onServerSelect(physicalServer)}
                onMouseEnter={() =>
                  setHoveredNode({
                    id: node.id,
                    type: node.isVNode ? 'vnode' : 'server',
                    label: node.label,
                    details: `${node.angle.toFixed(1)}° | ${physicalServer?.name || node.serverId}`,
                    angle: node.angle,
                  })
                }
                onMouseLeave={() => setHoveredNode(null)}
              />

              {/* Physical server labels: always visible, outside ring */}
              {!showVNodes && (
                <text
                  x={labelPos.x}
                  y={labelPos.y + 4}
                  textAnchor={
                    node.angle > 15 && node.angle < 165 ? 'start'
                    : node.angle > 195 && node.angle < 345 ? 'end'
                    : 'middle'
                  }
                  fill={node.color}
                  fontSize="11"
                  fontWeight="700"
                  fontFamily="'Inter', system-ui, sans-serif"
                  className="pointer-events-none"
                >
                  {node.label}
                </text>
              )}
            </g>
          );
        })}

        {/* Center Ring Info Summary */}
        <g transform={`translate(${center}, ${center})`}>
          <text textAnchor="middle" y="-14" fill={isDarkMode ? "#94a3b8" : "#6b7280"} fontSize="11" fontFamily="'Inter',system-ui,sans-serif">
            {showVNodes ? `${vnodes.length} virtual tokens` : `${servers.length} servers`}
          </text>
          <text textAnchor="middle" y="8" fill={isDarkMode ? "#f8fafc" : "#0f172a"} fontSize="22" fontWeight="700" fontFamily="'Inter',system-ui,sans-serif">
            {keys.length}
          </text>
          <text textAnchor="middle" y="24" fill={isDarkMode ? "#94a3b8" : "#6b7280"} fontSize="11" fontFamily="'Inter',system-ui,sans-serif">
            keys
          </text>
        </g>
      </svg>

      {/* ── Server color legend below the canvas ── */}
      <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 mt-3 px-2">
        {servers.map((s) => (
          <div key={s.id} className="flex items-center gap-1.5 text-[11px] font-medium" style={{ color: s.color }}>
            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: s.color }} />
            <span className={isDarkMode ? 'text-slate-300' : 'text-slate-700'}>{s.name}</span>
          </div>
        ))}
      </div>
      <AnimatePresence>
        {hoveredNode && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 5 }}
            className={`absolute bottom-2 px-3.5 py-2 rounded-xl text-xs border shadow-xl pointer-events-none backdrop-blur-md z-30 ${
              isDarkMode
                ? 'bg-slate-900/95 border-slate-700/80 text-slate-200'
                : 'bg-[#1c1c1e]/90 text-white border-slate-700'
            }`}
          >
            <div className="flex items-center space-x-2">
              <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-ping" />
              <span className="font-bold font-mono text-white">{hoveredNode.label}</span>
              <span className="text-slate-300 capitalize">({hoveredNode.type})</span>
            </div>
            <p className="text-slate-200 font-mono mt-0.5">{hoveredNode.details}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

