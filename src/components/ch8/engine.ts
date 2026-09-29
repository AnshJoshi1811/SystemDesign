import { murmur3Hash } from '../../lib/hash';

// Base62 alphabet in the book's order: 0-9 -> 0..9, a-z -> 10..35, A-Z -> 36..61
export const BASE62_ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
export const CODE_LENGTH = 7; // smallest n with 62^n >= 365 billion
export const PREDEFINED_STRING = '#retry'; // appended to the long URL on each collision
export const FIRST_ID = 2009215674938; // the book's example ID -> "zn9edcu"
export const BLOOM_BITS = 64;
export const BLOOM_HASHES = 3;

export const encodeBase62 = (num: number): string => {
  if (num <= 0) return BASE62_ALPHABET[0];
  let str = '';
  let current = num;
  while (current > 0) {
    str = BASE62_ALPHABET[current % 62] + str;
    current = Math.floor(current / 62);
  }
  return str;
};

/** Every step of the repeated division, in order. Reading remainders bottom-up gives the code. */
export const base62Steps = (num: number) => {
  const rows: { dividend: number; quotient: number; remainder: number; char: string }[] = [];
  let current = num;
  while (current > 0) {
    const quotient = Math.floor(current / 62);
    const remainder = current % 62;
    rows.push({ dividend: current, quotient, remainder, char: BASE62_ALPHABET[remainder] });
    current = quotient;
  }
  return rows;
};

// Standard CRC32 (IEEE 802.3, reflected polynomial 0xEDB88320), one of the hashes the book lists.
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export const crc32Hex = (text: string): string => {
  let c = 0xffffffff;
  for (const byte of new TextEncoder().encode(text)) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return ((c ^ 0xffffffff) >>> 0).toString(16).padStart(8, '0');
};

// A real (tiny) Bloom filter: 64 bits, 3 hash functions. It can say "definitely absent" or "maybe present".
export const bloomIndexes = (key: string) => Array.from({ length: BLOOM_HASHES }, (_, i) => murmur3Hash(key, i + 1) % BLOOM_BITS);

export const buildBloom = (keys: string[]) => {
  const bits = new Array<boolean>(BLOOM_BITS).fill(false);
  keys.forEach((k) => bloomIndexes(k).forEach((i) => (bits[i] = true)));
  return bits;
};

export const bloomMaybe = (bits: boolean[], key: string) => bloomIndexes(key).every((i) => bits[i]);

export interface HashAttempt {
  input: string;
  hex: string;
  candidate: string;
  bloom: 'absent' | 'maybe';
  outcome: 'free' | 'false-positive' | 'collision';
  takenBy?: string;
}

/**
 * The book's "hash + collision resolution": take the first `len` chars of the hash; if that code is taken,
 * append a predefined string to the long URL and hash again, until the code is free. A Bloom filter in front
 * of the table skips the DB lookup whenever it answers "definitely absent".
 */
export const resolveHash = (longUrl: string, len: number, taken: Map<string, string>) => {
  const bits = buildBloom([...taken.keys()]);
  const attempts: HashAttempt[] = [];
  let input = longUrl;
  for (let i = 0; i < 20; i++) {
    const hex = crc32Hex(input);
    const candidate = hex.slice(0, len);
    if (!bloomMaybe(bits, candidate)) {
      attempts.push({ input, hex, candidate, bloom: 'absent', outcome: 'free' });
      return { code: candidate, attempts };
    }
    const owner = taken.get(candidate);
    if (owner === undefined) {
      attempts.push({ input, hex, candidate, bloom: 'maybe', outcome: 'false-positive' });
      return { code: candidate, attempts };
    }
    attempts.push({ input, hex, candidate, bloom: 'maybe', outcome: 'collision', takenBy: owner });
    input = input + PREDEFINED_STRING;
  }
  return { code: null as string | null, attempts };
};

export const randomString = (alphabet: string, len: number) =>
  Array.from({ length: len }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('');

export const fmtInt = (n: number) => Math.round(n).toLocaleString();
export const fmtBytes = (b: number) =>
  b >= 1e15 ? `${(b / 1e15).toFixed(1)} PB` : b >= 1e12 ? `${(b / 1e12).toFixed(1)} TB` : `${(b / 1e9).toFixed(1)} GB`;
export const shortUrl = (code: string) => `tinyurl.com/${code}`;

export const SAMPLE_URLS = [
  'https://en.wikipedia.org/wiki/Hash_function',
  'https://en.wikipedia.org/wiki/Cyclic_redundancy_check',
  'https://en.wikipedia.org/wiki/MD5',
  'https://en.wikipedia.org/wiki/SHA-1',
  'https://en.wikipedia.org/wiki/Base62',
  'https://en.wikipedia.org/wiki/Load_balancing_(computing)',
  'https://en.wikipedia.org/wiki/Cache_(computing)',
  'https://en.wikipedia.org/wiki/Database_index',
  'https://en.wikipedia.org/wiki/Rate_limiting',
  'https://en.wikipedia.org/wiki/Replication_(computing)',
  'https://en.wikipedia.org/wiki/Shard_(database_architecture)',
  'https://en.wikipedia.org/wiki/HTTP_301',
  'https://en.wikipedia.org/wiki/HTTP_302',
  'https://en.wikipedia.org/wiki/Consistent_hashing',
  'https://en.wikipedia.org/wiki/Snowflake_ID',
  'https://en.wikipedia.org/wiki/Birthday_problem',
];

export const sampleUrl = (i: number) => (i < SAMPLE_URLS.length ? SAMPLE_URLS[i] : `https://example.com/article/${i}`);

export const DEFAULT_LONG_URL = 'https://en.wikipedia.org/wiki/Systems_design';
