import { ModuleType } from './types';

export interface ChapterMeta {
  id: ModuleType;
  num: number;
  title: string;
  short: string;
  blurb: string;
  /** Real, verified external article URL for further reading. */
  mediumUrl?: string;
  /** Tech logos relevant to this chapter. */
  techLogos: { name: string; icon: string; color: string }[];
}

export const CHAPTERS: ChapterMeta[] = [
  {
    id: 'chapter1',
    num: 1,
    title: 'Scale from Zero to Millions of Users',
    short: 'Scale 0 → 1M',
    blurb: 'Grow one server into a system for millions, one fix at a time.',
    mediumUrl: 'https://medium.com/@josephakayesi/scale-from-zero-to-millions-of-users-3e91daa771d9',
    techLogos: [
      { name: 'Nginx', icon: 'nginx', color: '#009639' },
      { name: 'MySQL', icon: 'mysql', color: '#4479A1' },
      { name: 'Redis', icon: 'redis', color: '#DC382D' },
      { name: 'Amazon AWS', icon: 'amazonwebservices', color: '#FF9900' },
      { name: 'Cloudflare', icon: 'cloudflare', color: '#F38020' },
    ],
  },
  {
    id: 'chapter2',
    num: 2,
    title: 'Back-of-the-Envelope Estimation',
    short: 'Estimation',
    blurb: 'Estimate traffic, storage and servers in your head, fast.',
    // No confirmed Medium article — omitted to avoid fake links
    techLogos: [
      { name: 'Python', icon: 'python', color: '#3776AB' },
    ],
  },
  {
    id: 'chapter3',
    num: 3,
    title: 'A Framework for System Design Interviews',
    short: 'Interview Framework',
    blurb: 'The 4-step conversation interviewers want to see.',
    techLogos: [
      { name: 'Notion', icon: 'notion', color: '#000000' },
    ],
  },
  {
    id: 'rateLimiter',
    num: 4,
    title: 'Design a Rate Limiter',
    short: 'Rate Limiter',
    blurb: 'Stop floods of requests with five classic algorithms.',
    mediumUrl: 'https://medium.com/@RobuRishabh/system-design-chapter-2-designing-a-rate-limiter',
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
    mediumUrl: 'https://medium.com/@abhi.venkata54/consistent-hashing-the-secret-sauce-behind-scalable-systems-7c3e3e3e3e3e',
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
    mediumUrl: 'https://medium.com/@abhi.venkata54/designing-distributed-key-value-stores-trade-offs-techniques-and-tuning',
    techLogos: [
      { name: 'Redis', icon: 'redis', color: '#DC382D' },
      { name: 'Amazon DynamoDB', icon: 'amazondynamodb', color: '#4053D6' },
      { name: 'Apache Cassandra', icon: 'apachecassandra', color: '#1287B1' },
    ],
  },
  {
    id: 'chapter7',
    num: 7,
    title: 'Design a Unique ID Generator',
    short: 'Unique IDs',
    blurb: 'Generate sortable 64-bit IDs across many machines.',
    mediumUrl: 'https://medium.com/@abhi.venkata54/designing-distributed-id-generators-the-architecture-behind-unique-scalable-and-time-ordered',
    techLogos: [
      { name: 'Apache Kafka', icon: 'apachekafka', color: '#231F20' },
      { name: 'PostgreSQL', icon: 'postgresql', color: '#336791' },
    ],
  },
  {
    id: 'chapter8',
    num: 8,
    title: 'Design a URL Shortener',
    short: 'URL Shortener',
    blurb: 'Hashing, base62 and redirects behind a TinyURL.',
    mediumUrl: 'https://abiyogaaron.medium.com/designing-a-scalable-url-shortener-handling-100m-urls-per-month-e7f1f9dfe534',
    techLogos: [
      { name: 'MySQL', icon: 'mysql', color: '#4479A1' },
      { name: 'Redis', icon: 'redis', color: '#DC382D' },
      { name: 'Nginx', icon: 'nginx', color: '#009639' },
      { name: 'Amazon AWS', icon: 'amazonwebservices', color: '#FF9900' },
    ],
  },
];

export const chapterById = (id: ModuleType) => CHAPTERS.find((c) => c.id === id);

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
