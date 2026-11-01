// Extracts plain-text paragraphs from a chapter so they can be pre-generated
// into the explanation cache. Run: npx tsx scripts/extract-paragraphs.tsx
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { STAGES } from '../src/components/ch1/content';

const TEXT_FIELDS = ['goal', 'why', 'before', 'after', 'reason', 'weakSpot', 'fix', 'takeaway'] as const;

// Turn a ReactNode (string or JSX) into plain text, keeping only the words.
const toText = (v: unknown): string => {
  if (typeof v === 'string') return v;
  if (v && typeof v === 'object') {
    return renderToStaticMarkup(React.createElement(React.Fragment, null, v as React.ReactNode))
      .replace(/<[^>]+>/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }
  return '';
};

const chapter = 'ch1';
const out: { chapter: string; stage: number; field: string; text: string }[] = [];

STAGES.forEach((s, stage) => {
  for (const f of TEXT_FIELDS) {
    const text = toText((s as unknown as Record<string, unknown>)[f]);
    if (text.length >= 2) out.push({ chapter, stage: stage + 1, field: f, text });
  }
});

console.log(JSON.stringify(out, null, 2));
console.error(`\n${out.length} paragraphs extracted from ${chapter}`);
