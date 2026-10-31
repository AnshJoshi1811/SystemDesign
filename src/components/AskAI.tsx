import React, { useCallback, useRef, useState } from 'react';
import { Bot, Send, X, Loader2, AlertCircle } from 'lucide-react';

/*
 * AskAI — free AI Q&A using Hugging Face Inference API (no API key needed for public models).
 * Model: microsoft/Phi-3.5-mini-instruct — small, fast, runs free on HF serverless tier.
 * Users can optionally supply their own HF token for higher rate limits.
 *
 * Zero token burn on Anthropic — 100% on HF infrastructure.
 */

// After deploying the Cloudflare Worker (cf-worker.js in repo root),
// replace this URL with your worker's URL from the Cloudflare dashboard.
// e.g. https://sd-ai-proxy.YOUR-NAME.workers.dev
const WORKER_URL = 'https://sd-ai-proxy.anshsjoshi07.workers.dev';



interface Message {
  role: 'user' | 'assistant';
  content: string;
}

const SUGGESTED = [
  'When should I use a token bucket vs sliding window?',
  'What is the CAP theorem?',
  'Why does consistent hashing need virtual nodes?',
  'How does Snowflake ID avoid clock skew?',
];

export const AskAI: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);

  const ask = useCallback(async (question: string) => {
    if (!question.trim() || loading) return;
    const userMsg: Message = { role: 'user', content: question.trim() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput('');
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(WORKER_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inputs: userMsg.content }),
      });

      if (!res.ok) {
        if (res.status === 429) throw new Error('Rate limit hit — try again in a minute.');
        throw new Error(`AI service error (${res.status}) — please try again.`);
      }

      const data = await res.json();
      // NVIDIA NIM returns OpenAI-compatible format: choices[0].message.content
      const clean: string = data?.choices?.[0]?.message?.content?.trim()
        || 'Sorry, I could not generate a response.';
      setMessages(prev => [...prev, { role: 'assistant', content: clean }]);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoading(false);
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
    }
  }, [messages, loading]);

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(input); }
  };

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3">
      {/* Chat panel */}
      {open && (
        <div
          className="w-[340px] sm:w-[400px] rounded-2xl overflow-hidden flex flex-col"
          style={{
            background: 'var(--surface-solid)',
            border: '1px solid var(--header-border)',
            boxShadow: '0 16px 48px rgba(0,0,0,0.2)',
            maxHeight: '520px',
          }}
        >
          {/* Header */}
          <div
            className="flex items-center justify-between px-4 py-3 shrink-0"
            style={{ borderBottom: '1px solid var(--header-border)', background: 'var(--surface-muted)' }}
          >
            <div className="flex items-center gap-2">
              <Bot className="w-4 h-4" style={{ color: 'var(--text-base)' }} />
              <span className="text-sm font-semibold" style={{ color: 'var(--text-base)' }}>Ask AI</span>
              <span
                className="text-[10px] px-1.5 py-0.5 rounded font-medium"
                style={{ background: 'var(--accent)', color: 'var(--accent-fg)' }}
              >
                Free · Phi-3.5
              </span>
            </div>
            <button onClick={() => setOpen(false)} className="opacity-50 hover:opacity-100 transition-opacity">
              <X className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3" style={{ minHeight: 0 }}>
            {messages.length === 0 && (
              <div className="space-y-2">
                <p className="text-xs" style={{ color: 'var(--text-subtle)' }}>
                  Ask any system design question. Powered by{' '}
                  <a href="https://huggingface.co" target="_blank" rel="noopener noreferrer" className="underline">HuggingFace</a>{' '}
                  — free, no Anthropic tokens used.
                </p>
                <div className="space-y-1.5 mt-3">
                  {SUGGESTED.map(q => (
                    <button
                      key={q}
                      onClick={() => ask(q)}
                      className="w-full text-left text-xs px-3 py-2 rounded-lg transition-colors"
                      style={{ background: 'var(--surface-muted)', color: 'var(--text-muted)', border: '1px solid var(--header-border)' }}
                      onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
                      onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--header-border)')}
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className="max-w-[85%] rounded-xl px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap"
                  style={
                    m.role === 'user'
                      ? { background: 'var(--accent)', color: 'var(--accent-fg)' }
                      : { background: 'var(--surface-muted)', color: 'var(--text-base)', border: '1px solid var(--header-border)' }
                  }
                >
                  {m.content}
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex justify-start">
                <div
                  className="rounded-xl px-3 py-2 flex items-center gap-2"
                  style={{ background: 'var(--surface-muted)', border: '1px solid var(--header-border)' }}
                >
                  <Loader2 className="w-3.5 h-3.5 animate-spin" style={{ color: 'var(--text-subtle)' }} />
                  <span className="text-xs" style={{ color: 'var(--text-subtle)' }}>Thinking…</span>
                </div>
              </div>
            )}

            {error && (
              <div
                className="flex items-start gap-2 rounded-xl px-3 py-2 text-xs"
                style={{ background: 'var(--surface-muted)', border: '1px solid var(--header-border)', color: 'var(--text-muted)' }}
              >
                <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}
            <div ref={bottomRef} />
          </div>



          {/* Input */}
          <div
            className="px-3 pb-3 pt-2 shrink-0"
            style={{ borderTop: '1px solid var(--header-border)' }}
          >
            <div
              className="flex items-end gap-2 rounded-xl px-3 py-2"
              style={{ background: 'var(--surface-muted)', border: '1px solid var(--header-border)' }}
            >
              <textarea
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKey}
                placeholder="Ask a system design question…"
                rows={1}
                className="flex-1 bg-transparent outline-none resize-none text-sm leading-relaxed"
                style={{ color: 'var(--text-base)', maxHeight: '80px' }}
              />
              <button
                onClick={() => ask(input)}
                disabled={!input.trim() || loading}
                className="shrink-0 rounded-lg p-1.5 transition-opacity disabled:opacity-30"
                style={{ background: 'var(--accent)', color: 'var(--accent-fg)' }}
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            </div>
            <p className="mt-1.5 text-[10px] text-center" style={{ color: 'var(--text-subtle)' }}>
              Enter to send · Shift+Enter for newline
            </p>
          </div>
        </div>
      )}

      {/* FAB */}
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 rounded-full px-4 py-3 text-sm font-semibold shadow-lg transition-transform hover:scale-105 active:scale-95"
        style={{ background: 'var(--accent)', color: 'var(--accent-fg)' }}
        aria-label="Ask AI a question"
      >
        <Bot className="w-4 h-4" />
        {open ? 'Close' : 'Ask AI'}
      </button>
    </div>
  );
};
