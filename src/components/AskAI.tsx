import React, { useCallback, useRef, useState } from 'react';
import { Bot, Send, X, Loader2, AlertCircle } from 'lucide-react';

/*
 * AskAI — free AI Q&A via a Cloudflare Worker gateway (cf-worker.js) that
 * tries 5 free providers in priority order (Groq, OpenRouter, Gemini,
 * OpenCode, IteraCompute) and falls back automatically if one is down.
 *
 * Zero token burn on Anthropic — 100% on free-tier provider infrastructure.
 */

// After deploying the Cloudflare Worker (cf-worker.js in repo root),
// replace this URL with your worker's URL from the Cloudflare dashboard.
// e.g. https://sd-ai-proxy.YOUR-NAME.workers.dev
const WORKER_URL = 'https://sd-ai-proxy.anshsjoshi07.workers.dev';
const MAX_MESSAGE_LENGTH = 500; // mirrors the Worker's own limit — server is the real boundary, this is just UX



interface Message {
  role: 'user' | 'assistant';
  content: string;
}

/** Renders **bold** and "- "/"* " bullet lists from plain-text model output, without a markdown library. */
function renderInline(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) =>
    part.startsWith('**') && part.endsWith('**')
      ? <strong key={i}>{part.slice(2, -2)}</strong>
      : <React.Fragment key={i}>{part}</React.Fragment>
  );
}

function renderContent(content: string): React.ReactNode {
  const lines = content.split('\n');
  const elements: React.ReactNode[] = [];
  let listBuffer: string[] = [];

  const flushList = () => {
    if (listBuffer.length) {
      elements.push(
        <ul key={`ul-${elements.length}`} className="list-disc pl-4 space-y-0.5 my-1">
          {listBuffer.map((item, idx) => <li key={idx}>{renderInline(item)}</li>)}
        </ul>
      );
      listBuffer = [];
    }
  };

  lines.forEach((line, idx) => {
    const trimmed = line.trim();
    if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      listBuffer.push(trimmed.slice(2));
    } else {
      flushList();
      if (trimmed !== '') {
        elements.push(<p key={`p-${idx}`} className="mb-1.5 last:mb-0">{renderInline(trimmed)}</p>);
      }
    }
  });
  flushList();
  return elements;
}

type ChapterView = 'home' | 'chapter1' | 'chapter2' | 'chapter3' | 'rateLimiter' | 'chapter5' | 'chapter6' | 'chapter7' | 'chapter8';

/** Suggested starter questions, tailored to whichever chapter the person is currently reading. */
const SUGGESTED_BY_VIEW: Record<ChapterView, string[]> = {
  home: [
    'What should I learn first in system design?',
    'What is the CAP theorem?',
    'SQL vs NoSQL — how do I choose?',
    'What does "scaling horizontally" actually mean?',
  ],
  chapter1: [
    'Why is a single server a single point of failure?',
    'What does a load balancer actually distribute?',
    'When do I need multiple data centers?',
    'Why separate the web tier from the database tier?',
  ],
  chapter2: [
    'How do I estimate QPS from daily active users?',
    'Why do interviewers care about back-of-the-envelope math?',
    'What latency numbers should I just memorize?',
    'How much storage does 1M images a day need?',
  ],
  chapter3: [
    'What are the 4 steps of a system design interview?',
    'How much time should I spend on requirements gathering?',
    'What should I ask before designing anything?',
    'How detailed should my high-level design be?',
  ],
  rateLimiter: [
    'Token bucket vs sliding window — which is better?',
    'Where should a rate limiter live — client, server, or gateway?',
    'How do I rate limit per-user vs per-IP?',
    'What HTTP status code should a rate limiter return?',
  ],
  chapter5: [
    'Why does consistent hashing need virtual nodes?',
    'What breaks without consistent hashing when a server dies?',
    'How is consistent hashing different from normal hashing?',
    'What systems actually use consistent hashing in production?',
  ],
  chapter6: [
    'What is a quorum and why does it matter?',
    'How does a key-value store handle conflicting writes?',
    'What is the difference between Dynamo and a normal database?',
    'Why would I choose eventual consistency on purpose?',
  ],
  chapter7: [
    'How does Snowflake ID avoid clock skew?',
    'Why not just use auto-increment IDs at scale?',
    'What makes a good unique ID generator?',
    'How do multiple machines generate IDs without collisions?',
  ],
  chapter8: [
    'How does a URL shortener generate short codes?',
    'Base62 vs hashing — which is better for short URLs?',
    'How would you handle a custom alias feature?',
    'What happens if two users want the same short code?',
  ],
};

export const AskAI: React.FC<{ view?: string }> = ({ view }) => {
  const suggestions = SUGGESTED_BY_VIEW[(view as ChapterView) ?? 'home'] ?? SUGGESTED_BY_VIEW.home;
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
        if (res.status === 400) {
          const errBody = await res.json().catch(() => null);
          throw new Error(errBody?.error ?? 'That message could not be sent — please rephrase it.');
        }
        throw new Error(`AI service error (${res.status}) — please try again.`);
      }

      const data = await res.json();
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
                Free · 5 providers
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
                  Ask any system design question — routed across 5 free AI providers automatically, no Anthropic tokens used.
                </p>
                <div className="space-y-1.5 mt-3">
                  {suggestions.map(q => (
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
                  {m.role === 'assistant' ? renderContent(m.content) : m.content}
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
                onChange={e => setInput(e.target.value.slice(0, MAX_MESSAGE_LENGTH))}
                onKeyDown={handleKey}
                placeholder="Ask a system design question…"
                rows={1}
                maxLength={MAX_MESSAGE_LENGTH}
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
              {input.length > MAX_MESSAGE_LENGTH - 80 && ` · ${MAX_MESSAGE_LENGTH - input.length} characters left`}
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
