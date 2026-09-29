# System Design Notes - Interactive Visualizer

An interactive React + Vite course based on *System Design Interview* (Alex Xu), Chapters 1–8.
Each chapter is a short series of lessons: read one idea, try it in a small simulation, answer a quick check, move on.

## Chapters

| # | Chapter | Format |
|---|---------|--------|
| 1 | Scale from Zero to Millions of Users | Architecture workspace: live vertical diagram, component inspector, experiments, observability, Learn → Explore → Break it → Fix it → Check |
| 2 | Back-of-the-Envelope Estimation | 9 lessons, estimate-first exercises, calculator playground |
| 3 | A Framework for System Design Interviews | 8 lessons plus a full practice interview |
| 4 | Design a Rate Limiter | 9 lessons, one lab per algorithm |
| 5 | Design Consistent Hashing | 9 lessons on the hash ring and virtual nodes |
| 6 | Design a Key-Value Store | 12 lessons: CAP, quorum, vector clocks, gossip, Merkle trees |
| 7 | Design a Unique ID Generator | 9 lessons ending with Snowflake |
| 8 | Design a URL Shortener | 11 lessons: hashing, base62, redirects, caching |

Chapters 9–16 are out of scope for now. Simulation numbers are illustrative, chosen to show the direction of each effect, not benchmarks.

## Project layout

- `src/chapters.ts` — chapter list, titles and progress helpers
- `src/components/lesson/` — `ChapterPlayer` (lesson rail, progress, Back/Continue) and lesson blocks (`Explain`, `Try`, `Check`, `GoDeeper`, `Callout`, …)
- `src/components/learn/LearningKit.tsx` — `Quiz`, `Term` (glossary tooltip), `WhatChanged`
- `src/components/ch1/` … `ch8/` — each chapter's engine (pure logic), labs and lessons
- Progress is saved in the browser (`localStorage`, keys prefixed `sd:`); "Restart this chapter" clears one chapter.

## Run locally

Prerequisite: Node.js

1. Install dependencies: `npm install`
2. Start the dev server: `npm run dev` (http://localhost:3000)
3. Type-check: `npm run lint`
4. Production build: `npm run build`
