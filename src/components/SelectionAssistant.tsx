import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Languages, Maximize2, Zap, Loader2, X } from 'lucide-react';

const WORKER_URL = 'https://sd-ai-proxy.anshsjoshi07.workers.dev';
const MIN_SELECTION_LEN = 3;
const MAX_SELECTION_LEN = 400; // keep the selected snippet focused, not a whole page

type Mode = 'hinglish' | 'elaborate' | 'brief';

const MODES: { id: Mode; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'hinglish', label: 'Hinglish', icon: Languages },
  { id: 'elaborate', label: 'Elaborate', icon: Maximize2 },
  { id: 'brief', label: 'Brief', icon: Zap },
];

interface Selection {
  text: string;
  x: number;
  y: number;
}

export const SelectionAssistant: React.FC<{ chapter?: string }> = ({ chapter }) => {
  const [selection, setSelection] = useState<Selection | null>(null);
  const [result, setResult] = useState<{ mode: Mode; text: string; cached: boolean } | null>(null);
  const [loading, setLoading] = useState<Mode | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Detect a selection made inside lesson content specifically — ignores
  // selections in UI chrome (buttons, nav, code, etc.) so this never misfires.
  useEffect(() => {
    const onSelectionEnd = () => {
      const sel = window.getSelection();
      const text = sel?.toString().trim() ?? '';

      if (!sel || !text || text.length < MIN_SELECTION_LEN || text.length > MAX_SELECTION_LEN) {
        setSelection(null);
        setResult(null);
        return;
      }

      const anchorEl = sel.anchorNode instanceof Element ? sel.anchorNode : sel.anchorNode?.parentElement;
      const withinLesson = anchorEl?.closest('.lesson-prose');
      if (!withinLesson) {
        setSelection(null);
        setResult(null);
        return;
      }

      const rect = sel.getRangeAt(0).getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) return; // selection collapsed mid-event
      setSelection({ text, x: rect.left + rect.width / 2 + window.scrollX, y: rect.top + window.scrollY });
      setResult(null);
    };

    document.addEventListener('mouseup', onSelectionEnd);
    document.addEventListener('keyup', onSelectionEnd); // keyboard-driven selection (Shift+Arrow)
    return () => {
      document.removeEventListener('mouseup', onSelectionEnd);
      document.removeEventListener('keyup', onSelectionEnd);
    };
  }, []);

  // Dismiss on click outside, scroll, or Escape.
  useEffect(() => {
    if (!selection) return;
    const dismiss = (e: Event) => {
      if (e instanceof KeyboardEvent && e.key !== 'Escape') return;
      if (e.type === 'mousedown' && containerRef.current?.contains(e.target as Node)) return;
      setSelection(null);
      setResult(null);
    };
    document.addEventListener('mousedown', dismiss);
    document.addEventListener('keydown', dismiss);
    window.addEventListener('scroll', dismiss, true);
    return () => {
      document.removeEventListener('mousedown', dismiss);
      document.removeEventListener('keydown', dismiss);
      window.removeEventListener('scroll', dismiss, true);
    };
  }, [selection]);

  const ask = useCallback(async (mode: Mode) => {
    if (!selection) return;
    setLoading(mode);
    try {
      const res = await fetch(`${WORKER_URL}/explain`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: selection.text, mode, chapter }),
      });
      const data = await res.json();
      const content: string = data?.explanation?.trim() || data?.error || 'Could not generate an explanation — try again.';
      setResult({ mode, text: content, cached: !!data?.cached });
    } catch {
      setResult({ mode, text: 'Something went wrong — check your connection and try again.', cached: false });
    } finally {
      setLoading(null);
    }
  }, [selection, chapter]);

  if (!selection) return null;

  return (
    <div
      ref={containerRef}
      style={{
        position: 'absolute',
        left: selection.x,
        top: selection.y - 10,
        transform: 'translate(-50%, -100%)',
        zIndex: 60,
      }}
    >
      {!result ? (
        // ── Mode picker pill — the 3 buttons ──
        <div
          className="flex items-center gap-0.5 rounded-full p-1 whitespace-nowrap"
          style={{ background: 'var(--surface-solid)', border: '1px solid var(--header-border)', boxShadow: 'var(--shadow-float)' }}
        >
          {MODES.map(m => {
            const Icon = m.icon;
            const isLoading = loading === m.id;
            return (
              <button
                key={m.id}
                onClick={() => ask(m.id)}
                disabled={loading !== null}
                className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50"
                style={{ color: 'var(--text-base)' }}
                onMouseEnter={e => { if (!loading) e.currentTarget.style.background = 'var(--surface-muted)'; }}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                {isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Icon className="w-3.5 h-3.5" />}
                {m.label}
              </button>
            );
          })}
        </div>
      ) : (
        // ── Result card ──
        <div
          className="w-72 rounded-xl p-3.5 text-sm leading-relaxed"
          style={{ background: 'var(--surface-solid)', border: '1px solid var(--header-border)', boxShadow: 'var(--shadow-float)', color: 'var(--text-base)' }}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-subtle)' }}>
              {React.createElement(MODES.find(m => m.id === result.mode)!.icon, { className: 'w-3 h-3' })}
              {MODES.find(m => m.id === result.mode)!.label}
              <span className="font-normal normal-case opacity-60">{result.cached ? '· instant' : '· generated'}</span>
            </span>
            <button onClick={() => { setSelection(null); setResult(null); }} className="opacity-50 hover:opacity-100 transition-opacity">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          {result.text}
        </div>
      )}
    </div>
  );
};
