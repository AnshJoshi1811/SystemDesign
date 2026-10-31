const ALLOWED_ORIGIN = 'https://anshjoshi1811.github.io';

// Models tried in order — if one is down/overloaded, next is tried
const MODELS = [
  'HuggingFaceH4/zephyr-7b-beta',
  'mistralai/Mistral-7B-Instruct-v0.2',
  'google/flan-t5-large',
];

export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      });
    }

    if (request.method !== 'POST') {
      return new Response('Send a POST request', { status: 405 });
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': ALLOWED_ORIGIN },
      });
    }

    // Try each model until one works
    let lastStatus = 500;
    let lastData = '';
    for (const model of MODELS) {
      const hfRes = await fetch(
        `https://api-inference.huggingface.co/models/${model}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }
      );
      lastData = await hfRes.text();
      lastStatus = hfRes.status;

      // 200 or 503 (model loading) — stop here
      if (hfRes.status === 200 || hfRes.status === 503) break;
      // 5xx other than 503 — try next model
    }

    return new Response(lastData, {
      status: lastStatus,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
      },
    });
  },
};
