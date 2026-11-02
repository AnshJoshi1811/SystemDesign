// Pre-generates Hinglish / Elaborate / Brief explanations for every paragraph
// in a chapter and stores them in D1 via the Worker's /explain endpoint.
// Idempotent: already-cached items come back with cached:true and cost nothing.
//
//   ADMIN_TOKEN=... node scripts/prewarm.mjs /tmp/ch1-paragraphs.json   # run
//   node scripts/prewarm.mjs /tmp/ch1-paragraphs.json --dry      # just count

import { readFileSync } from 'node:fs';

const WORKER = 'https://sd-ai-proxy.anshsjoshi07.workers.dev/explain';
const MODES = ['hinglish', 'elaborate', 'brief'];
const DELAY_MS = 2500;          // gentle pacing so we stay under free-tier RPM limits
const MAX_RETRIES = 3;

const [file, flag] = process.argv.slice(2);
const paragraphs = JSON.parse(readFileSync(file, 'utf8'));
const jobs = paragraphs.flatMap(p => MODES.map(mode => ({ ...p, mode })));

console.log(`${paragraphs.length} paragraphs × ${MODES.length} modes = ${jobs.length} explanations`);
if (flag === '--dry') process.exit(0);

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function explain(job) {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const res = await fetch(WORKER, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Bypasses the per-IP miss limit so bulk generation can run.
        ...(process.env.ADMIN_TOKEN ? { 'X-Admin-Token': process.env.ADMIN_TOKEN } : {}),
      },
      body: JSON.stringify({ text: job.text, mode: job.mode, chapter: job.chapter }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.explanation) return data;
    if (res.status === 400) throw new Error(`rejected: ${data.error}`);
    await sleep(DELAY_MS * attempt * 2); // back off on 503 / provider overload
  }
  throw new Error('gave up after retries');
}

// Safety check: refuse to run if the deployed Worker is still the old chat-only code.
const probe = await explain({ text: 'A single server is a single point of failure.', mode: 'brief', chapter: 'probe' });
if (!probe.explanation) {
  console.error('ABORT: /explain did not return an explanation. Redeploy cf-worker.js first.');
  process.exit(1);
}
console.log('Worker check passed. Starting…\n');

let done = 0, cached = 0, failed = [];
for (const job of jobs) {
  try {
    const r = await explain(job);
    r.cached ? cached++ : done++;
    process.stdout.write(`${r.cached ? '·' : '✓'}`);
  } catch (e) {
    failed.push({ ...job, error: e.message });
    process.stdout.write('✗');
  }
  await sleep(DELAY_MS);
}

console.log(`\n\nGenerated: ${done}   Already cached: ${cached}   Failed: ${failed.length}`);
if (failed.length) {
  console.log('Failed items (re-run the script later to retry just these):');
  failed.slice(0, 10).forEach(f => console.log(` - [${f.mode}] ${f.text.slice(0, 60)}… (${f.error})`));
}
