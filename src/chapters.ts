import { ModuleType } from './types';

export interface ChapterMeta {
  id: ModuleType;
  num: number;
  title: string;
  short: string;
  blurb: string;
}

/** Single source of truth for chapter order, names and one-line descriptions. */
export const CHAPTERS: ChapterMeta[] = [
  {
    id: 'chapter1',
    num: 1,
    title: 'Scale from Zero to Millions of Users',
    short: 'Scale 0 → 1M',
    blurb: 'Grow one server into a system for millions, one fix at a time.',
  },
  {
    id: 'chapter2',
    num: 2,
    title: 'Back-of-the-Envelope Estimation',
    short: 'Estimation',
    blurb: 'Estimate traffic, storage and servers in your head, fast.',
  },
  {
    id: 'chapter3',
    num: 3,
    title: 'A Framework for System Design Interviews',
    short: 'Interview Framework',
    blurb: 'The 4-step conversation interviewers want to see.',
  },
  {
    id: 'rateLimiter',
    num: 4,
    title: 'Design a Rate Limiter',
    short: 'Rate Limiter',
    blurb: 'Stop floods of requests with five classic algorithms.',
  },
  {
    id: 'chapter5',
    num: 5,
    title: 'Design Consistent Hashing',
    short: 'Consistent Hashing',
    blurb: 'Add or remove servers without reshuffling every key.',
  },
  {
    id: 'chapter6',
    num: 6,
    title: 'Design a Key-Value Store',
    short: 'Key-Value Store',
    blurb: 'Replication, quorums and conflict resolution, Dynamo-style.',
  },
  {
    id: 'chapter7',
    num: 7,
    title: 'Design a Unique ID Generator',
    short: 'Unique IDs',
    blurb: 'Generate sortable 64-bit IDs across many machines.',
  },
  {
    id: 'chapter8',
    num: 8,
    title: 'Design a URL Shortener',
    short: 'URL Shortener',
    blurb: 'Hashing, base62 and redirects behind a TinyURL.',
  },
];

export const chapterById = (id: ModuleType) => CHAPTERS.find((c) => c.id === id);

/** Progress each ChapterPlayer publishes so the home screen can show it. */
export interface ChapterProgress {
  done: number;
  total: number;
  lesson: number;
}

export function readProgress(id: ModuleType): ChapterProgress | null {
  try {
    const raw = localStorage.getItem(`sd:${id}:progress`);
    return raw ? (JSON.parse(raw) as ChapterProgress) : null;
  } catch {
    return null;
  }
}
