// ============================================================
// SystemDesign AI Gateway — Cloudflare Worker
// ============================================================
// One public endpoint that the website's "Ask AI" chat calls.
// Internally it tries providers in priority order (fastest and
// most reliable first) and falls back automatically. Every
// attempt is logged to D1 so the admin dashboard can show
// live status + usage stats per provider.
//
// Required bindings/secrets (set in Cloudflare dashboard):
//   D1 database bound as "DB"           (Settings → Bindings → D1)
//   GROQ_API_KEY          (secret)
//   OPENROUTER_API_KEY    (secret)
//   GEMINI_API_KEY        (secret)
//   ITERACOMPUTE_API_KEY  (secret)
//   OPENCODE_API_KEY      (secret, optional — omit until you have one)
//   ADMIN_TOKEN           (secret — you choose this, protects /admin/*)
// ============================================================

const ALLOWED_ORIGIN = 'https://anshjoshi1811.github.io';

const SYSTEM_PROMPT = 'You are a concise system design tutor. Answer questions about system design: scaling, rate limiting, consistent hashing, key-value stores, unique ID generation, URL shorteners. If the user asks something unrelated to software/system design, politely decline and redirect them to ask a system design question instead. Keep answers under 120 words. Use bullet points. Be direct.';

// ------------------------------------------------------------
// Input validation — every request costs real (free-tier) quota shared
// across all visitors, so reject obviously abusive/off-topic input
// before it ever reaches a provider.
// ------------------------------------------------------------
const MIN_MESSAGE_LENGTH = 2;
const MAX_MESSAGE_LENGTH = 500; // plenty for a real question, blocks essay-length abuse

// Broad system-design / CS vocabulary. A message only needs ONE match to pass —
// this is a cheap pre-filter, not a strict classifier, so it stays generous.
const TOPIC_KEYWORDS = [
  'scal', 'load balanc', 'cache', 'caching', 'database', 'db', 'sql', 'nosql', 'latency',
  'throughput', 'consisten', 'replicat', 'shard', 'partition', 'queue', 'kafka', 'rabbitmq',
  'microservice', 'api', 'rest', 'grpc', 'cdn', 'rate limit', 'hashing', 'index', 'server',
  'availab', 'reliab', 'fault toleran', 'redundan', 'distribut', 'cluster', 'node', 'quorum',
  'cap theorem', 'acid', 'eventual', 'leader election', 'gossip', 'cqrs', 'event sourc',
  'message broker', 'pub/sub', 'websocket', 'tcp', 'http', 'dns', 'proxy', 'gateway',
  'auth', 'token', 'session', 'encrypt', 'tls', 'ssl', 'id generat', 'snowflake', 'uuid',
  'url shorten', 'key-value', 'key value', 'storage', 'disk', 'memory', 'ram', 'bandwidth',
  'traffic', 'request', 'response', 'client', 'backend', 'frontend', 'architecture', 'design',
  'system', 'interview', 'estimat', 'capacity', 'monitor', 'metric', 'log', 'observab',
  'container', 'kubernetes', 'docker', 'deploy', 'ci/cd', 'version', 'schema', 'migration',
  // common greetings/small talk — allowed through without penalty so the chat doesn't
  // feel broken when someone just says hi
  'hi', 'hello', 'hey', 'thanks', 'thank you', 'help', 'what is', 'how does', 'why',
  'explain', 'example', 'difference',
];

// ------------------------------------------------------------
// Paragraph explanation cache — the 3 "select text" modes.
// Prompts live here (not the client) so they stay consistent and private.
// ------------------------------------------------------------
const EXPLAIN_MODES = ['hinglish', 'elaborate', 'brief'];
const EXPLAIN_PROMPT = {
  hinglish: (text) => `Explain this system design snippet in Hinglish (mix of Hindi and English, like how Indian engineers actually talk) — 2-3 short sentences, friendly tone: "${text}"`,
  elaborate: (text) => `Explain this system design snippet in more depth than the original — add a concrete real-world example and why it matters, 3-4 sentences: "${text}"`,
  brief: (text) => `Explain this system design snippet in exactly one short, simple sentence — no jargon: "${text}"`,
};
const MAX_EXPLAIN_TEXT_LEN = 600;

async function sha256Hex(input) {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function isOffTopic(message) {
  const lower = message.toLowerCase();
  const hasKeyword = TOPIC_KEYWORDS.some(k => lower.includes(k));
  if (hasKeyword) return false;
  // Only flag substantive messages — short ones (greetings, "ok", etc.) always pass,
  // since blocking those would make the widget feel broken for no real savings.
  return message.trim().split(/\s+/).length > 12;
}

// Priority order: fastest/most-reliable first, slowest last-resort at the end.
const PROVIDERS = [
  {
    name: 'groq',
    keyEnv: 'GROQ_API_KEY',
    url: 'https://api.groq.com/openai/v1/chat/completions',
    model: 'openai/gpt-oss-120b',
    timeoutMs: 15000,
    buildBody: (messages, key) => ({ model: 'openai/gpt-oss-120b', messages, max_tokens: 300, temperature: 0.4 }),
  },
  {
    name: 'openrouter',
    keyEnv: 'OPENROUTER_API_KEY',
    url: 'https://openrouter.ai/api/v1/chat/completions',
    model: 'openrouter/free',
    timeoutMs: 15000,
    buildBody: (messages) => ({ model: 'openrouter/free', messages, max_tokens: 300 }),
  },
  {
    name: 'gemini',
    keyEnv: 'GEMINI_API_KEY',
    url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent',
    model: 'gemini-3.8-flash',
    timeoutMs: 20000,
    isGemini: true,
  },
  {
    name: 'opencode',
    keyEnv: 'OPENCODE_API_KEY',
    url: 'https://opencode.ai/zen/v1/chat/completions',
    model: 'glm-4.7-free',
    timeoutMs: 20000,
    buildBody: (messages) => ({ model: 'glm-4.7-free', messages, max_tokens: 300 }),
  },
  {
    name: 'iteracompute',
    keyEnv: 'ITERACOMPUTE_API_KEY',
    url: 'https://api.iteracompute.com/v1/chat/completions',
    model: 'qwen/qwen3.8-27b',
    timeoutMs: 55000, // slow under load — only reached if everything above fails
    buildBody: (messages) => ({ model: 'qwen/qwen3.8-27b', messages, max_tokens: 300, reasoning_effort: 'low' }),
  },
];

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Token',
  };
}

async function logRequest(env, { provider, model, success, latencyMs, tokensIn, tokensOut, errorMessage }) {
  if (!env.DB) return; // D1 not bound yet — skip logging rather than crash
  try {
    await env.DB.prepare(
      `INSERT INTO requests (ts, provider, model, success, latency_ms, tokens_in, tokens_out, error_message)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(Date.now(), provider, model || null, success ? 1 : 0, latencyMs || null, tokensIn || null, tokensOut || null, errorMessage || null).run();
  } catch (e) {
    // logging must never break the actual chat response
  }
}

async function callProvider(provider, messages, env) {
  const key = env[provider.keyEnv];
  if (!key) return { ok: false, skipped: true, error: 'no key configured' };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), provider.timeoutMs);
  const start = Date.now();

  try {
    let res, data;
    if (provider.isGemini) {
      res = await fetch(`${provider.url}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `${SYSTEM_PROMPT}\n\nUser: ${messages[messages.length - 1].content}` }] }],
        }),
        signal: controller.signal,
      });
      data = await res.json();
      clearTimeout(timer);
      const latencyMs = Date.now() - start;
      if (!res.ok) return { ok: false, latencyMs, error: data?.error?.message || `HTTP ${res.status}` };
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) return { ok: false, latencyMs, error: 'empty response' };
      return { ok: true, latencyMs, content: text, tokensIn: null, tokensOut: null };
    }

    const body = provider.buildBody([{ role: 'system', content: SYSTEM_PROMPT }, ...messages]);
    res = await fetch(provider.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    data = await res.json();
    clearTimeout(timer);
    const latencyMs = Date.now() - start;

    if (!res.ok) return { ok: false, latencyMs, error: data?.error?.message || `HTTP ${res.status}` };
    const content = data?.choices?.[0]?.message?.content;
    if (!content) return { ok: false, latencyMs, error: 'empty response' };
    return {
      ok: true,
      latencyMs,
      content,
      tokensIn: data?.usage?.prompt_tokens ?? null,
      tokensOut: data?.usage?.completion_tokens ?? null,
    };
  } catch (e) {
    clearTimeout(timer);
    const latencyMs = Date.now() - start;
    return { ok: false, latencyMs, error: e.name === 'AbortError' ? 'timeout' : String(e) };
  }
}

async function handleChat(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders() } });
  }

  const userMessage = String(body.inputs ?? '').trim();

  if (userMessage.length < MIN_MESSAGE_LENGTH) {
    return new Response(JSON.stringify({ error: 'Message is too short.' }), {
      status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    });
  }

  if (userMessage.length > MAX_MESSAGE_LENGTH) {
    return new Response(JSON.stringify({
      error: `Message is too long (max ${MAX_MESSAGE_LENGTH} characters). Try asking a more focused question.`,
    }), { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders() } });
  }

  if (isOffTopic(userMessage)) {
    return new Response(JSON.stringify({
      choices: [{ message: { content: "I'm built specifically to help with system design questions — scaling, databases, caching, load balancing, and similar topics. Try asking something along those lines!" } }],
      served_by: 'input-filter',
    }), { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders() } });
  }

  const messages = [{ role: 'user', content: userMessage }];

  for (const provider of PROVIDERS) {
    const result = await callProvider(provider, messages, env);

    if (result.skipped) continue; // no key configured for this provider, move on silently

    await logRequest(env, {
      provider: provider.name,
      model: provider.model,
      success: result.ok,
      latencyMs: result.latencyMs,
      tokensIn: result.tokensIn,
      tokensOut: result.tokensOut,
      errorMessage: result.ok ? null : result.error,
    });

    if (result.ok) {
      return new Response(JSON.stringify({ choices: [{ message: { content: result.content } }], served_by: provider.name }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...corsHeaders() },
      });
    }
    // else: fall through to the next provider in the chain
  }

  return new Response(JSON.stringify({ error: 'All providers are currently unavailable. Please try again shortly.' }), {
    status: 503,
    headers: { 'Content-Type': 'application/json', ...corsHeaders() },
  });
}

async function handleExplain(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders() } });
  }

  // Collapse all whitespace runs so a browser selection matches the cached paragraph.
  const text = String(body.text ?? '').replace(/\s+/g, ' ').trim();
  const mode = String(body.mode ?? '');
  const chapter = body.chapter ? String(body.chapter).slice(0, 40) : null;

  if (!EXPLAIN_MODES.includes(mode)) {
    return new Response(JSON.stringify({ error: `mode must be one of: ${EXPLAIN_MODES.join(', ')}` }), { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders() } });
  }
  if (text.length < MIN_MESSAGE_LENGTH || text.length > MAX_EXPLAIN_TEXT_LEN) {
    return new Response(JSON.stringify({ error: `text must be between ${MIN_MESSAGE_LENGTH} and ${MAX_EXPLAIN_TEXT_LEN} characters` }), { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders() } });
  }

  const hash = await sha256Hex(`${mode}:${text.toLowerCase()}`);

  // 1. Check the cache first — this is the whole point: instant, zero-cost on a hit.
  if (env.DB) {
    try {
      const cached = await env.DB.prepare(
        `SELECT explanation FROM paragraph_explanations WHERE hash = ? AND mode = ?`
      ).bind(hash, mode).first();
      if (cached?.explanation) {
        return new Response(JSON.stringify({ explanation: cached.explanation, cached: true }), {
          status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
        });
      }
    } catch (e) {
      // cache lookup failure shouldn't block generation — fall through
    }
  }

  // 2. Cache miss — new generation costs quota, so rate-limit it per IP.
  if (!(await allowMiss(request, env))) {
    return jsonResponse({ error: 'Too many new explanations right now. Please wait a minute and try again.' }, 429);
  }

  // Generate once via the normal provider fallback chain.
  const messages = [{ role: 'user', content: EXPLAIN_PROMPT[mode](text) }];
  for (const provider of PROVIDERS) {
    const result = await callProvider(provider, messages, env);
    if (result.skipped) continue;

    await logRequest(env, {
      provider: provider.name,
      model: provider.model,
      success: result.ok,
      latencyMs: result.latencyMs,
      tokensIn: result.tokensIn,
      tokensOut: result.tokensOut,
      errorMessage: result.ok ? null : result.error,
    });

    if (result.ok) {
      // 3. Store it — every future selection of this exact paragraph+mode is now instant.
      if (env.DB) {
        try {
          await env.DB.prepare(
            `INSERT OR REPLACE INTO paragraph_explanations (hash, mode, chapter, source_text, explanation, created_at) VALUES (?, ?, ?, ?, ?, ?)`
          ).bind(hash, mode, chapter, text.slice(0, 500), result.content, Date.now()).run();
        } catch (e) {
          // storing is best-effort — the person still gets their answer either way
        }
      }
      return new Response(JSON.stringify({ explanation: result.content, cached: false }), {
        status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
      });
    }
  }

  return new Response(JSON.stringify({ error: 'All providers are currently unavailable. Please try again shortly.' }), {
    status: 503, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
  });
}

// ------------------------------------------------------------
// Rate limit for NEW explanations only (cache misses). Pre-generated paragraphs
// stay free. Admin token bypasses it so bulk pre-warming can run.
// ------------------------------------------------------------
const MISS_LIMIT_PER_MIN = 10;

async function allowMiss(request, env) {
  const token = request.headers.get('X-Admin-Token');
  if (token && token === env.ADMIN_TOKEN) return true;
  if (!env.DB) return true;

  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const minute = Math.floor(Date.now() / 60000);
  const key = `${ip}:${minute}`;
  try {
    // Two plain statements, no RETURNING: count the miss, then read the count back.
    await env.DB.prepare(
      `INSERT INTO rate_limits (key, count, window_start) VALUES (?, 1, ?)
       ON CONFLICT(key) DO UPDATE SET count = count + 1`
    ).bind(key, minute).run();
    const row = await env.DB.prepare(`SELECT count FROM rate_limits WHERE key = ?`).bind(key).first();
    env.DB.prepare(`DELETE FROM rate_limits WHERE window_start < ?`).bind(minute - 5).run().catch(() => {});
    if (!row) return true;
    return Number(row.count) <= MISS_LIMIT_PER_MIN;
  } catch (e) {
    console.log('rate limit error', String(e));
    return true; // fail open: never break explanations because the limiter errored
  }
}

// Returns every cached explanation for one chapter, so the browser can prefetch it.
async function handleExplanations(request, env) {
  const chapter = new URL(request.url).searchParams.get('chapter') || '';
  if (!/^[a-zA-Z0-9_-]{1,40}$/.test(chapter)) return jsonResponse({ error: 'invalid chapter' }, 400);
  if (!env.DB) return jsonResponse({ items: [] });

  const rows = await env.DB.prepare(
    `SELECT hash, mode, explanation FROM paragraph_explanations WHERE chapter = ?`
  ).bind(chapter).all();

  return new Response(JSON.stringify({ items: rows.results }), {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=300', ...corsHeaders() },
  });
}

function requireAdmin(request, env) {
  const token = request.headers.get('X-Admin-Token') || new URL(request.url).searchParams.get('token');
  return env.ADMIN_TOKEN && token === env.ADMIN_TOKEN;
}

async function handleAdminStats(request, env) {
  if (!requireAdmin(request, env)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders() } });
  }
  if (!env.DB) {
    return new Response(JSON.stringify({ error: 'D1 database not bound yet' }), { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders() } });
  }

  const since24h = Date.now() - 24 * 60 * 60 * 1000;

  const rows = await env.DB.prepare(
    `SELECT provider,
            COUNT(*) as total,
            SUM(success) as successes,
            AVG(latency_ms) as avg_latency,
            SUM(tokens_in) as tokens_in,
            SUM(tokens_out) as tokens_out,
            MAX(ts) as last_used
     FROM requests
     WHERE ts > ?
     GROUP BY provider`
  ).bind(since24h).all();

  const recentErrors = await env.DB.prepare(
    `SELECT provider, error_message, ts FROM requests WHERE success = 0 AND ts > ? ORDER BY ts DESC LIMIT 10`
  ).bind(since24h).all();

  return new Response(JSON.stringify({
    window: '24h',
    providers: rows.results,
    recent_errors: recentErrors.results,
  }), { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders() } });
}

async function handleAdminHealth(request, env) {
  if (!requireAdmin(request, env)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders() } });
  }

  const checks = await Promise.all(PROVIDERS.map(async (provider) => {
    const key = env[provider.keyEnv];
    if (!key) return { provider: provider.name, configured: false, status: 'not_connected' };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
    try {
      let url, headers;
      if (provider.name === 'gemini') {
        url = 'https://generativelanguage.googleapis.com/v1beta/models';
        headers = { 'x-goog-api-key': key };
      } else if (provider.name === 'groq') {
        url = 'https://api.groq.com/openai/v1/models';
        headers = { Authorization: `Bearer ${key}` };
      } else if (provider.name === 'openrouter') {
        url = 'https://openrouter.ai/api/v1/models';
        headers = { Authorization: `Bearer ${key}` };
      } else if (provider.name === 'opencode') {
        url = 'https://opencode.ai/zen/v1/models';
        headers = { Authorization: `Bearer ${key}` };
      } else {
        url = 'https://api.iteracompute.com/v1/models';
        headers = { Authorization: `Bearer ${key}` };
      }
      const res = await fetch(url, { headers, signal: controller.signal });
      clearTimeout(timer);
      return { provider: provider.name, configured: true, status: res.ok ? 'up' : 'auth_error', http_status: res.status };
    } catch (e) {
      clearTimeout(timer);
      return { provider: provider.name, configured: true, status: 'unreachable' };
    }
  }));

  return new Response(JSON.stringify({ checks }), { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders() } });
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders() });
    }

    const url = new URL(request.url);

    if (url.pathname === '/admin/stats') return handleAdminStats(request, env);
    if (url.pathname === '/admin/health') return handleAdminHealth(request, env);
    if (url.pathname === '/explanations' && request.method === 'GET') return handleExplanations(request, env);
    if (url.pathname === '/explain') return handleExplain(request, env);

    if (request.method !== 'POST') {
      return new Response('POST only (or /admin/stats, /admin/health)', { status: 405, headers: corsHeaders() });
    }

    return handleChat(request, env);
  },
};
