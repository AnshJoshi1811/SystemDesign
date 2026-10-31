import { CHAPTERS, ChapterMeta } from '../chapters';
import { ModuleType } from '../types';

export interface SearchResult {
  chapterId: ModuleType;
  chapterNum: number;
  chapterTitle: string;
  lessonTitle?: string;
  lessonIndex?: number;
  blurb: string;
  type: 'chapter' | 'lesson' | 'tech';
  score: number;
}

// Flat index built at module load time — zero runtime cost on search
interface IndexEntry {
  id: string;
  tokens: string[];
  result: Omit<SearchResult, 'score'>;
}

// All lesson titles extracted statically — kept in sync with chapters
const LESSON_INDEX: { chapterId: ModuleType; lessons: string[] }[] = [
  {
    chapterId: 'chapter1',
    lessons: [
      'Single server', 'Database', 'Which database to use', 'Vertical vs horizontal scaling',
      'Load balancer', 'Database replication', 'Cache', 'CDN', 'Stateless web tier',
      'Data centres', 'Message queue', 'Logging, metrics, automation', 'Millions of users',
    ],
  },
  {
    chapterId: 'chapter2',
    lessons: [
      'Why estimate', 'Powers of two', 'Latency numbers', 'Availability nines',
      'From users to QPS', 'Storage', 'Worked example: Twitter', 'Tips for the interview', 'Playground',
    ],
  },
  {
    chapterId: 'chapter3',
    lessons: [
      'What the interview measures', 'Step 1: Understand the problem', 'Step 2: High-level design',
      'Step 3: Deep dive', 'Step 4: Wrap up', 'Budgeting 45 minutes', "Dos and don'ts", 'Practice interview',
    ],
  },
  {
    chapterId: 'rateLimiter',
    lessons: [
      'What a rate limiter does', 'Where to put it', 'In the client app', 'Inside the API servers',
      'In a middleware in front', 'In an API gateway',
      'Algorithm 1: Token bucket', 'Algorithm 2: Leaky bucket', 'Algorithm 3: Fixed window counter',
      'Algorithm 4: Sliding window log', 'Algorithm 5: Sliding window counter',
      'Choosing an algorithm', 'Running it in production',
    ],
  },
  {
    chapterId: 'chapter5',
    lessons: [
      'Hashing a key', 'Modulo sharding', 'The rehashing problem', 'The hash ring',
      "Finding a key's server", 'Adding or removing a server', 'Uneven partitions and hotspots',
      'Virtual nodes', 'Real-world uses',
    ],
  },
  {
    chapterId: 'chapter6',
    lessons: [
      'The requirements', 'CAP theorem', 'Data partitioning', 'Data replication',
      'Consistency models', 'Inconsistency resolution: versioning', 'Handling failures',
      'System architecture', 'Write path', 'Read path',
    ],
  },
  {
    chapterId: 'chapter7',
    lessons: [
      'The requirements', 'One database counter', 'Multi-master replication', 'UUIDs',
      'Ticket server', 'Snowflake: the 64-bit layout', 'Generating Snowflake IDs',
      'Clock problems', 'Decode an ID',
    ],
  },
  {
    chapterId: 'chapter8',
    lessons: [
      'What we are building', 'Back-of-the-envelope numbers', '301 vs 302 redirects',
      'The data model', 'How long should the code be?', 'Hash and collision resolution',
      'Base62 conversion', 'Hash vs base62', 'The shortening flow',
      'The redirect flow with a cache', 'Scaling and wrap-up',
    ],
  },
];

function tokenize(text: string): string[] {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
}

// Build flat index once
const INDEX: IndexEntry[] = [];

for (const chapter of CHAPTERS) {
  // Chapter-level entry
  INDEX.push({
    id: `chapter:${chapter.id}`,
    tokens: tokenize(`${chapter.title} ${chapter.short} ${chapter.blurb} ${chapter.techLogos.map(t => t.name).join(' ')}`),
    result: {
      chapterId: chapter.id,
      chapterNum: chapter.num,
      chapterTitle: chapter.title,
      blurb: chapter.blurb,
      type: 'chapter',
    },
  });

  // Tech logo entries
  for (const tech of chapter.techLogos) {
    INDEX.push({
      id: `tech:${chapter.id}:${tech.name}`,
      tokens: tokenize(`${tech.name} ${chapter.title}`),
      result: {
        chapterId: chapter.id,
        chapterNum: chapter.num,
        chapterTitle: chapter.title,
        blurb: `Used in Ch ${chapter.num}: ${chapter.short}`,
        type: 'tech',
      },
    });
  }

  // Lesson-level entries
  const lessonData = LESSON_INDEX.find(l => l.chapterId === chapter.id);
  if (lessonData) {
    lessonData.lessons.forEach((lessonTitle, lessonIndex) => {
      INDEX.push({
        id: `lesson:${chapter.id}:${lessonIndex}`,
        tokens: tokenize(`${lessonTitle} ${chapter.title} ${chapter.short}`),
        result: {
          chapterId: chapter.id,
          chapterNum: chapter.num,
          chapterTitle: chapter.title,
          lessonTitle,
          lessonIndex,
          blurb: `Ch ${chapter.num} · ${chapter.short}`,
          type: 'lesson',
        },
      });
    });
  }
}

export function search(query: string, limit = 8): SearchResult[] {
  const queryTokens = tokenize(query);
  if (queryTokens.length === 0) return [];

  const results: SearchResult[] = [];

  for (const entry of INDEX) {
    let score = 0;
    for (const qt of queryTokens) {
      for (const et of entry.tokens) {
        if (et === qt) score += 2;           // exact token match
        else if (et.startsWith(qt)) score += 1; // prefix match
      }
    }
    if (score > 0) {
      results.push({ ...entry.result, score });
    }
  }

  // Sort: score desc, then chapters before lessons for tie-breaking
  return results
    .sort((a, b) => b.score - a.score || (a.type === 'chapter' ? -1 : 1))
    .slice(0, limit);
}
