# System Design Labs

**[Try the live demo →](https://anshjoshi1811.github.io/SD/)**

Interactive, hands-on labs for practicing system design interview concepts. Each chapter pairs a short explanation with a small live simulation you can poke at — read one idea, try it, answer a quick check, move on.

Built with React + Vite + TypeScript + Tailwind, loosely following the structure of *System Design Interview* by Alex Xu (see [References](#references) — no copyrighted material is redistributed here).

![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)
![Built with Vite](https://img.shields.io/badge/built%20with-Vite-646CFF.svg)
![React 19](https://img.shields.io/badge/React-19-61DAFB.svg)

## Chapters

| # | Chapter | Format |
|---|---------|--------|
| 1 | Scale from Zero to Millions of Users | Architecture workspace: live vertical diagram, component inspector, Learn → Explore → Break it → Fix it → Check |
| 2 | Back-of-the-Envelope Estimation | 9 lessons, estimate-first exercises, calculator playground |
| 3 | A Framework for System Design Interviews | 8 lessons plus a full practice interview |
| 4 | Design a Rate Limiter | 9 lessons, one lab per algorithm |
| 5 | Design Consistent Hashing | 9 lessons on the hash ring and virtual nodes |
| 6 | Design a Key-Value Store | 12 lessons: CAP, quorum, vector clocks, gossip, Merkle trees |
| 7 | Design a Unique ID Generator | 9 lessons ending with Snowflake |
| 8 | Design a URL Shortener | 11 lessons: hashing, base62, redirects, caching |

Chapters 9–16 are out of scope for now. Simulation numbers are illustrative, chosen to show the direction of each effect, not benchmarks.

## Why this exists

Reading about system design concepts isn't the same as building intuition for them. These labs let you turn the knobs yourself — add servers, change hash functions, trigger a rebalance — and see the effect immediately, instead of just reading a diagram.

If you're preparing for system design interviews, feel free to fork this, work through the chapters, and extend it with your own labs.

## Project layout

```
src/
├── chapters.ts              # Chapter list, titles and progress helpers
├── types.ts                 # Shared types
├── App.tsx                  # View routing (home ↔ chapter), dark mode, progress reset
├── components/
│   ├── Home.tsx, Header.tsx # Landing page and top nav
│   ├── Chapter1..8*.tsx     # Top-level chapter entry components
│   ├── ch1/ … ch8/          # Per-chapter engine (pure logic) + labs + lessons
│   ├── lesson/              # ChapterPlayer (lesson rail, progress, Back/Continue)
│   │                         # and lesson blocks (Explain, Try, Check, GoDeeper, Callout, …)
│   └── learn/                # LearningKit: Quiz, Term (glossary tooltip), WhatChanged
└── lib/                      # hash.ts, usePersistentState.ts
```

Progress is saved in the browser (`localStorage`, keys prefixed `sd:`); "Restart this chapter" clears one chapter's progress.

## Run locally

Prerequisite: Node.js 20+

```bash
npm install
npm run dev      # http://localhost:3000
npm run lint     # type-check
npm run build    # production build to dist/
```

## Deployment

Pushes to `main` automatically build and deploy to GitHub Pages via [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml). No manual steps needed beyond enabling Pages once in the repo settings (**Settings → Pages → Source: GitHub Actions**).

## Contributing

Issues and pull requests are welcome — new labs, bug fixes, clearer explanations, or extra chapters. Keep simulations small, self-contained, and illustrative rather than benchmark-accurate.

## References

This project's chapter structure is inspired by:

> Xu, Alex. *System Design Interview – An Insider's Guide.* Independently published.

No text, figures, or files from the book are included in this repository — all explanations and simulations here are original. If you want the full reference material, buy the book directly from the author or your preferred retailer.

## License

[MIT](LICENSE) — the code in this repository. The system design concepts themselves are, of course, free for everyone.
