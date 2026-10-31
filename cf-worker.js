/**
 * Cloudflare Worker — CORS proxy for HuggingFace Inference API
 * Deploy at: dash.cloudflare.com → Workers → Create Worker → paste this → Deploy
 * Free tier: 100,000 requests/day — more than enough
 */

const HF_MODEL = 'microsoft/Phi-3.5-mini-instruct';
const ALLOWED_ORIGIN = 'https://anshjoshi1811.github.io'; // your GitHub Pages URL

export default {
  async fetch(request) {
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
          'Access-Control-Max-Age': '86400',
        },
      });
    }

    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 });
    }

    try {
      const body = await request.json();

      // Forward to HuggingFace — HF_TOKEN is a Cloudflare env secret (optional)
      const headers = { 'Content-Type': 'application/json' };
      if (typeof HF_TOKEN !== 'undefined' && HF_TOKEN) {
        headers['Authorization'] = `Bearer ${HF_TOKEN}`;
      }

      const hfRes = await fetch(
        `https://api-inference.huggingface.co/models/${HF_MODEL}`,
        { method: 'POST', headers, body: JSON.stringify(body) }
      );

      const data = await hfRes.text();

      return new Response(data, {
        status: hfRes.status,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
        },
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
        },
      });
    }
  },
};
