import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Languages, Maximize2, Zap, Loader2 } from 'lucide-react';

const WORKER_URL = 'https://sd-ai-proxy.anshsjoshi07.workers.dev';
const MIN_SELECTION_LEN = 3;
const MAX_SELECTION_LEN = 400;

type Mode = 'hinglish' | 'elaborate' | 'brief';

const MODES: { id: Mode; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'hinglish', label: 'Hinglish', icon: Languages },
  { id: 'elaborate', label: 'Elaborate', icon: Maximize2 },
  { id: 'brief', label: 'Brief', icon: Zap },
];

interface Selection {
  text: string;
  range: Range;
  x: number;
  y: number;
}

/**
 * Swaps the selected text for its explanation in place. The original DOM
 * fragment is kept so the ↺ button can put it back exactly as it was.
 */
function replaceInPlace(range: Range, explanation: string, mode: Mode) {
  const original = range.cloneContents();

  const wrap = document.createElement('span');
  wrap.dataset.explained = mode;
  wrap.style.cssText =
    'background: var(--surface-muted); border-left: 2px solid var(--accent); border-radius: 4px; padding: 1px 6px; margin: 0 2px;';
  wrap.appendChild(document.createTextNode(explanation + ' '));

  const restore = document.createElement('button');
  restore.type = 'button';
  restore.textContent = '↺ original';
  restore.title = 'Show the original text';
  restore.style.cssText =
    'margin-left: 6px; font-size: 10px; opacity: 0.55; background: none; border: none; color: inherit; cursor: pointer; white-space: nowrap;';
  restore.onmouseenter = () => (restore.style.opacity = '1');
  restore.onmouseleave = () => (restore.style.opacity = '0.55');
  restore.onclick = (e) => {
    e.stopPropagation();
    wrap.replaceWith(original);
  };
  wrap.appendChild(restore);

  range.deleteContents();
  range.insertNode(wrap);
}

export const SelectionAssistant: React.FC<{ chapter?: string }> = ({ chapter }) => {
  const [selection, setSelection] = useState<Selection | null>(null);
  const [loading, setLoading] = useState<Mode | null>(null);
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Pick up selections made inside lesson content only, so UI chrome never triggers it.
  useEffect(() => {
    const onSelectionEnd = () => {
      const sel = window.getSelection();
      const text = sel?.toString().trim() ?? '';

      if (!sel || sel.rangeCount === 0 || !text || text.length < MIN_SELECTION_LEN || text.length > MAX_SELECTION_LEN) {
        setSelection(null);
        return;
      }

      const anchorEl = sel.anchorNode instanceof Element ? sel.anchorNode : sel.anchorNode?.parentElement;
      if (!anchorEl?.closest('.lesson-prose')) {
        setSelection(null);
        return;
      }

      const range = sel.getRangeAt(0).cloneRange();
      const rect = range.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) return;

      setSelection({ text, range, x: rect.left + rect.width / 2 + window.scrollX, y: rect.top + window.scrollY });
      setError(null);
    };

    document.addEventListener('mouseup', onSelectionEnd);
    document.addEventListener('keyup', onSelectionEnd);
    return () => {
      document.removeEventListener('mouseup', onSelectionEnd);
      document.removeEventListener('keyup', onSelectionEnd);
    };
  }, []);

  // Dismiss on outside click, scroll, or Escape.
  useEffect(() => {
    if (!selection) return;
    const dismiss = (e: Event) => {
      if (e instanceof KeyboardEvent && e.key !== 'Escape') return;
      if (e.type === 'mousedown' && containerRef.current?.contains(e.target as Node)) return;
      setSelection(null);
      setError(null);
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
    setError(null);
    try {
      const res = await fetch(`${WORKER_URL}/explain`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: selection.text, mode, chapter }),
      });
      const data = await res.json();
      if (!res.ok || !data?.explanation) {
        setError(data?.error ?? 'Could not generate an explanation — try again.');
        return;
      }

      // Swap the paragraph in place, then clear the selection and the pill.
      if (!selection.range.startContainer.isConnected) {
        setError('This text changed — select it again.');
        return;
      }
      replaceInPlace(selection.range, data.explanation.trim(), mode);
      window.getSelection()?.removeAllRanges();
      setSelection(null);
    } catch {
      setError('Something went wrong — check your connection and try again.');
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
      <div
        className="flex items-center gap-0.5 rounded-full p-1 whitespace-nowrap"
        style={{ background: 'var(--surface-solid)', border: '1px solid var(--header-border)', boxShadow: 'var(--shadow-float)' }}
      >
        {MODES.map((m) => {
          const Icon = m.icon;
          const isLoading = loading === m.id;
          return (
            <button
              key={m.id}
              onClick={() => ask(m.id)}
              disabled={loading !== null}
              className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50"
              style={{ color: 'var(--text-base)' }}
              onMouseEnter={(e) => { if (!loading) e.currentTarget.style.background = 'var(--surface-muted)'; }}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              {isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Icon className="w-3.5 h-3.5" />}
              {m.label}
            </button>
          );
        })}
      </div>
      {error && (
        <div className="mt-2 rounded-lg px-3 py-1.5 text-xs" style={{ background: 'var(--surface-solid)', border: '1px solid var(--header-border)', color: 'var(--text-muted)' }}>
          {error}
        </div>
      )}
    </div>
  );
};
