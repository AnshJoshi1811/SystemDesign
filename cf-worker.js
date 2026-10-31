const ALLOWED_ORIGIN = 'https://anshjoshi1811.github.io';
const NVIDIA_API_URL = 'https://integrate.api.nvidia.com/v1/chat/completions';
const MODEL = 'deepseek-ai/deepseek-v4.1-flash';
const SYSTEM_PROMPT = `You are a concise system design tutor. Answer questions about system design: scaling, rate limiting, consistent hashing, key-value stores, unique ID generation, URL shorteners. Keep answers under 120 words. Use bullet points. Be direct.`;

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      });
    }
    if (request.method !== 'POST') return new Response('POST only', { status: 405 });

    let body;
    try { body = await request.json(); }
    catch { return new Response('Bad JSON', { status: 400 }); }

    const nvRes = await fetch(NVIDIA_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${env.NVIDIA_API_KEY}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: body.inputs },
        ],
        max_tokens: 300,
        temperature: 0.4,
      }),
    });

    const data = await nvRes.text();
    return new Response(data, {
      status: nvRes.status,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': ALLOWED_ORIGIN },
    });
  },
};
