import { ModuleType } from './types';

export interface ChapterMeta {
  id: ModuleType;
  num: number;
  title: string;
  short: string;
  blurb: string;
  /** Medium article URL for further reading. */
  mediumUrl?: string;
  /** Tech logos relevant to this chapter — used as SVG devicons from cdnjs. */
  techLogos: { name: string; icon: string; color: string }[];
}

/** Single source of truth for chapter order, names, descriptions, articles and tech logos. */
export const CHAPTERS: ChapterMeta[] = [
  {
    id: 'chapter1',
    num: 1,
    title: 'Scale from Zero to Millions of Users',
    short: 'Scale 0 → 1M',
    blurb: 'Grow one server into a system for millions, one fix at a time.',
    mediumUrl: 'https://medium.com/@narendra.n/scale-from-zero-to-millions-of-users-system-design-b2e7e5ea3c8b',
    techLogos: [
      { name: 'Nginx', icon: 'nginx', color: '#009639' },
      { name: 'MySQL', icon: 'mysql', color: '#4479A1' },
      { name: 'Redis', icon: 'redis', color: '#DC382D' },
      { name: 'Amazon AWS', icon: 'amazonwebservices', color: '#FF9900' },
      { name: 'CDN / Cloudflare', icon: 'cloudflare', color: '#F38020' },
    ],
  },
  {
    id: 'chapter2',
    num: 2,
    title: 'Back-of-the-Envelope Estimation',
    short: 'Estimation',
    blurb: 'Estimate traffic, storage and servers in your head, fast.',
    mediumUrl: 'https://medium.com/interviewnoodle/back-of-envelope-estimation-7c21943e0e25',
    techLogos: [
      { name: 'Python', icon: 'python', color: '#3776AB' },
      { name: 'Google Sheets', icon: 'google', color: '#34A853' },
    ],
  },
  {
    id: 'chapter3',
    num: 3,
    title: 'A Framework for System Design Interviews',
    short: 'Interview Framework',
    blurb: 'The 4-step conversation interviewers want to see.',
    mediumUrl: 'https://medium.com/geekculture/system-design-interview-framework-10f7e72f5fc5',
    techLogos: [
      { name: 'Confluence', icon: 'confluence', color: '#172B4D' },
      { name: 'Notion', icon: 'notion', color: '#000000' },
    ],
  },
  {
    id: 'rateLimiter',
    num: 4,
    title: 'Design a Rate Limiter',
    short: 'Rate Limiter',
    blurb: 'Stop floods of requests with five classic algorithms.',
    mediumUrl: 'https://medium.com/@saurabh.codes/rate-limiting-algorithms-explained-9f9a47c8b7d2',
    techLogos: [
      { name: 'Redis', icon: 'redis', color: '#DC382D' },
      { name: 'Nginx', icon: 'nginx', color: '#009639' },
      { name: 'Kubernetes', icon: 'kubernetes', color: '#326CE5' },
    ],
  },
  {
    id: 'chapter5',
    num: 5,
    title: 'Design Consistent Hashing',
    short: 'Consistent Hashing',
    blurb: 'Add or remove servers without reshuffling every key.',
    mediumUrl: 'https://medium.com/system-design-blog/consistent-hashing-b9134c8a9062',
    techLogos: [
      { name: 'Apache Cassandra', icon: 'apachecassandra', color: '#1287B1' },
      { name: 'Amazon DynamoDB', icon: 'amazondynamodb', color: '#4053D6' },
      { name: 'Redis', icon: 'redis', color: '#DC382D' },
    ],
  },
  {
    id: 'chapter6',
    num: 6,
    title: 'Design a Key-Value Store',
    short: 'Key-Value Store',
    blurb: 'Replication, quorums and conflict resolution, Dynamo-style.',
    mediumUrl: 'https://medium.com/@narendra.n/key-value-store-system-design-3c0e1e4b7c9a',
    techLogos: [
      { name: 'Redis', icon: 'redis', color: '#DC382D' },
      { name: 'Amazon DynamoDB', icon: 'amazondynamodb', color: '#4053D6' },
      { name: 'Apache Cassandra', icon: 'apachecassandra', color: '#1287B1' },
      { name: 'RocksDB', icon: 'rocksdb', color: '#2B2B2B' },
    ],
  },
  {
    id: 'chapter7',
    num: 7,
    title: 'Design a Unique ID Generator',
    short: 'Unique IDs',
    blurb: 'Generate sortable 64-bit IDs across many machines.',
    mediumUrl: 'https://medium.com/geekculture/distributed-unique-id-generator-snowflake-6f0e1b3c8d4e',
    techLogos: [
      { name: 'Apache Kafka', icon: 'apachekafka', color: '#231F20' },
      { name: 'PostgreSQL', icon: 'postgresql', color: '#336791' },
      { name: 'Twitter / X', icon: 'x', color: '#000000' },
    ],
  },
  {
    id: 'chapter8',
    num: 8,
    title: 'Design a URL Shortener',
    short: 'URL Shortener',
    blurb: 'Hashing, base62 and redirects behind a TinyURL.',
    mediumUrl: 'https://medium.com/system-design-blog/url-shortener-system-design-a2f5b9c6d7e8',
    techLogos: [
      { name: 'MySQL', icon: 'mysql', color: '#4479A1' },
      { name: 'Redis', icon: 'redis', color: '#DC382D' },
      { name: 'Nginx', icon: 'nginx', color: '#009639' },
      { name: 'Amazon AWS', icon: 'amazonwebservices', color: '#FF9900' },
    ],
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
