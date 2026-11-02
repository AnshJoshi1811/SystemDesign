// Extracts plain-text paragraphs (<p> and <li>) from a chapter's lessons so they
// can be pre-generated into the explanation cache.
// Run: npx tsx scripts/extract-chapter.tsx ch2 > /tmp/ch2-paragraphs.json
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { LESSONS as CH2 } from '../src/components/Chapter2Estimation';

const sources: Record<string, { chapter: string; lessons: { id: string; title: string; content: React.ReactNode }[] }> = {
  ch2: { chapter: 'chapter2', lessons: CH2 as any },
};

const key = process.argv[2] ?? 'ch2';
const src = sources[key];
if (!src) { console.error(`unknown chapter: ${key}`); process.exit(1); }

const decode = (s: string) => s
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&#39;/g, "'")
  .replace(/&nbsp;/g, ' ');

const out: { chapter: string; lesson: string; text: string }[] = [];
for (const lesson of src.lessons) {
  const html = renderToStaticMarkup(React.createElement(React.Fragment, null, lesson.content as React.ReactNode));
  const blocks = [...html.matchAll(/<(p|li)\b[^>]*>([\s\S]*?)<\/\1>/g)];
  for (const m of blocks) {
    const text = decode(m[2].replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
    if (text.length >= 2) out.push({ chapter: src.chapter, lesson: lesson.id, text });
  }
}

console.log(JSON.stringify(out, null, 2));
console.error(`\n${out.length} paragraphs extracted from ${key} across ${src.lessons.length} lessons`);
