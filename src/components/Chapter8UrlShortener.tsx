import React from 'react';
import { Term, WhatChanged } from './learn/LearningKit';
import { ChapterPlayer, Lesson } from './lesson/ChapterPlayer';
import { Explain, Try, Check, GoDeeper, Callout, Figure } from './lesson/blocks';
import { ShortenLab, EstimateLab, RedirectLab, StorageLab, LengthLab, HashLab, Base62Lab, ShortenFlowFigure, BloomLab, CacheLab } from './ch8/Labs';

interface Chapter8UrlShortenerProps {
  /** Kept for API compatibility with App; theming uses Tailwind `dark:` bound to the app toggle. */
  isDarkMode?: boolean;
}

const tableCls = 'w-full text-sm';
const thCls = 'py-2 px-1 text-left font-medium text-slate-500 dark:text-slate-400';
const tdCls = 'py-2 px-1 align-top';

const LESSONS: Lesson[] = [
  {
    id: 'what',
    title: 'What we are building',
    goal: 'A URL shortener turns a long URL into a short code and sends anyone who clicks the code back to the long URL. It needs only two endpoints.',
    content: (
      <>
        <Explain>
          <p>
            Think of TinyURL: you paste a long address and get back something like <code>tinyurl.com/zn9edcu</code>. Clicking it takes you to the original page.
          </p>
          <p>The book's requirements: 100 million new URLs a day, codes as short as possible, only digits and letters, and links are never updated or deleted.</p>
          <p>The API is just two REST endpoints:</p>
          <ul>
            <li>
              <strong>Shorten:</strong> <code>POST api/v1/data/shorten</code> with the long URL. Returns the short URL.
            </li>
            <li>
              <strong>Redirect:</strong> <code>GET api/v1/{'{shortUrl}'}</code>. Returns a redirect to the long URL.
            </li>
          </ul>
        </Explain>
        <Try
          task={
            <>
              Press <strong>Shorten</strong>, then click the <em>tinyurl.com</em> link that appears. Press <strong>Shorten</strong> again without changing the URL
              and notice that no second link is made.
            </>
          }
        >
          <ShortenLab />
        </Try>
        <Check
          persistKey="chapter8:quiz:what"
          questions={[
            {
              question: 'Why is shortening a POST while redirecting is a GET?',
              options: [
                { text: 'Shortening creates a new mapping on the server; redirecting only reads an existing one', correct: true, why: 'POST is for requests that create state; GET is a safe read, which is exactly what a redirect lookup is.' },
                { text: 'GET requests cannot carry a URL in them', why: 'The short code travels in the GET path itself. The long URL goes in the POST body because it is new data being stored.' },
                { text: 'Browsers only follow redirects from POST responses', why: 'Browsers follow 301/302 redirects from GET responses. That is how every short link works.' },
              ],
            },
          ]}
        />
      </>
    ),
  },
  {
    id: 'numbers',
    title: 'Back-of-the-envelope numbers',
    goal: 'A quick estimate shows the system is read-heavy and must hold hundreds of billions of URLs.',
    content: (
      <>
        <Explain>
          <p>The book starts from 100 million new URLs per day and works out the rest:</p>
          <ul>
            <li>
              <strong>Writes:</strong> 100 million ÷ 86,400 seconds ≈ 1,160 per second.
            </li>
            <li>
              <strong>Reads:</strong> with a 10:1 read-to-write ratio, ≈ 11,600 redirects per second.
            </li>
            <li>
              <strong>Records:</strong> kept for 10 years, 100 million × 365 × 10 = 365 billion URLs.
            </li>
            <li>
              <strong>Storage:</strong> at about 100 bytes per URL, tens of terabytes.
            </li>
          </ul>
          <p>Two numbers matter later: the 365 billion decides how long a code must be, and the 10:1 ratio is why caching pays off.</p>
        </Explain>
        <Try task={<>Start at <strong>100M</strong> (the book's number) and read the four results. Then switch to <strong>1B</strong> and watch every number grow tenfold.</>}>
          <EstimateLab />
        </Try>
        <GoDeeper title="365 TB or 36.5 TB?">
          <p>
            The book prints the storage as 365 billion × 100 bytes × 10 years = 365 TB. But the 365 billion already covers 10 years, so the years are counted twice.
            365 billion × 100 bytes is about <strong>36.5 TB</strong>. Either way it is far more than one server's memory, which is the point.
          </p>
        </GoDeeper>
        <Check
          persistKey="chapter8:quiz:numbers"
          questions={[
            {
              question: 'With 100 million new URLs per day and a 10:1 read-to-write ratio, roughly how many redirects per second must the system serve?',
              options: [
                { text: 'About 11,600 per second', correct: true, why: '100M / 86,400 s ≈ 1,160 writes/s; ten times that is ≈ 11,600 reads/s.' },
                { text: 'About 1,160 per second', why: 'That is the write rate (new short URLs). Reads are 10× higher.' },
                { text: 'About 116,000 per second', why: 'That would be a 100:1 ratio. The book assumes 10:1.' },
              ],
            },
          ]}
        />
      </>
    ),
  },
  {
    id: 'redirect',
    title: '301 vs 302 redirects',
    goal: 'Both codes send the browser to the long URL, but only a 302 makes every click pass through your server.',
    content: (
      <>
        <Explain>
          <p>When a short link is clicked, the server answers with a redirect and puts the long URL in the <code>Location</code> header. There are two choices:</p>
          <ul>
            <li>
              <Term term="301 Moved Permanently">The browser caches this answer. Later clicks on the same link go straight to the long URL, skipping the shortener.</Term>:
              the browser remembers it, so repeat clicks never reach you. Less load.
            </li>
            <li>
              <Term term="302 Found">A temporary redirect. The browser does not cache it, so every click goes through the shortener first.</Term>: every click comes
              back to you. More load, but you can count clicks.
            </li>
          </ul>
        </Explain>
        <Try
          task={
            <>
              With <strong>301</strong> selected, press <strong>User 1 clicks</strong> four times, then <strong>A new user clicks</strong>. Compare "clicks users made"
              with "clicks the server saw". Then switch to <strong>302</strong> and do the same.
            </>
          }
        >
          <RedirectLab />
        </Try>
        <Callout tone="idea">Pick 301 to cut server load. Pick 302 when click analytics matter.</Callout>
        <Check
          persistKey="chapter8:quiz:redirect"
          questions={[
            {
              question: 'Marketing wants accurate click counts per short link. Which redirect should the server return?',
              options: [
                { text: '302, so every click reaches the shortener and can be counted', correct: true, why: 'A 302 is not cached by the browser, so each click is a request your server can log.' },
                { text: '301, because it is faster for users', why: 'It is faster for repeat clicks, but those clicks never reach your server, so they cannot be counted.' },
                { text: '301, and add a Redis cache to catch the missed clicks', why: 'Redis sits behind your server. Clicks answered by the browser cache never arrive, so Redis never sees them either.' },
              ],
            },
            {
              question: 'Under 301, one user clicks the same short link 5 times. How many requests reach the shortener?',
              options: [
                { text: '1', correct: true, why: 'The first click learns the target; the browser caches the permanent redirect and handles the other 4 itself.' },
                { text: '5', why: 'That is the 302 behaviour. A 301 is cached after the first response.' },
                { text: '0', why: 'The browser has to ask at least once to learn where the short link points.' },
              ],
            },
          ]}
        />
      </>
    ),
  },
  {
    id: 'model',
    title: 'The data model',
    goal: 'A hash table explains the lookup, but the mappings belong in a database so they survive restarts and can grow.',
    content: (
      <>
        <Explain>
          <p>
            The simplest design keeps <code>&lt;shortURL, longURL&gt;</code> pairs in a hash table: <code>longURL = hashTable.get(shortURL)</code>. Fast and simple.
          </p>
          <p>
            But memory is limited and expensive, 365 billion pairs will not fit in one server's RAM, and a restart wipes it. So the book stores them in a relational
            table with three columns: <code>id</code>, <code>shortURL</code>, <code>longURL</code>.
          </p>
        </Explain>
        <Try
          task={
            <>
              With <strong>Hash table in RAM</strong> selected, press <strong>Restart the server</strong>. Then switch to <strong>Relational database</strong> and
              restart again.
            </>
          }
        >
          <StorageLab />
        </Try>
        <WhatChanged
          before="In-memory hash table on one server: fast, but limited by RAM and wiped on restart."
          after="Relational table (id, shortURL, longURL): durable, and can grow far beyond one machine's memory."
          reason="Memory's speed comes back later as a cache in front of the database."
        />
        <Check
          persistKey="chapter8:quiz:model"
          questions={[
            {
              question: 'Why does the book move mappings from an in-memory hash table to a relational database?',
              options: [
                { text: 'Memory is limited and expensive, and in-memory data is lost when the server restarts', correct: true, why: "Hundreds of billions of rows will not fit in one server's RAM, and durability matters for links people share." },
                { text: 'Hash table lookups are too slow for redirects', why: 'Hash table lookups are O(1) and very fast. The problem is size and durability, not speed.' },
                { text: 'A database removes the need for any caching', why: 'The opposite: once data is on disk, a cache is added in front of the database for the read-heavy redirect path.' },
              ],
            },
          ]}
        />
      </>
    ),
  },
  {
    id: 'length',
    title: 'How long should the code be?',
    goal: 'Pick the smallest length n where 62ⁿ covers every URL you must store. For the book that is 7.',
    content: (
      <>
        <Explain>
          <p>
            Codes use{' '}
            <Term term="base62">An alphabet of 62 URL-safe characters: 0-9, a-z, A-Z (10 + 26 + 26).</Term> characters. With n characters there are 62ⁿ possible
            codes.
          </p>
          <p>
            We need room for 365 billion URLs. 62⁶ is about 56.8 billion, too few. 62⁷ is about 3.5 trillion, enough. So <strong>n = 7</strong>.
          </p>
        </Explain>
        <Try task={<>At <strong>100M</strong> per day the first bar past the red line is n = 7. Switch to <strong>10M</strong> and then <strong>1B</strong> and watch the answer change.</>}>
          <LengthLab />
        </Try>
        <GoDeeper title="Why not base64 or hex?">
          <div className="overflow-x-auto">
            <table className={tableCls}>
              <thead>
                <tr>
                  <th className={thCls}>Alphabet</th>
                  <th className={thCls}>7-char codes</th>
                  <th className={thCls}>Problem</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-white/10">
                <tr>
                  <td className={tdCls}>Base62</td>
                  <td className={`${tdCls} font-mono`}>3.5 trillion</td>
                  <td className={tdCls}>none</td>
                </tr>
                <tr>
                  <td className={tdCls}>Hex (16)</td>
                  <td className={`${tdCls} font-mono`}>268 million</td>
                  <td className={tdCls}>far too few</td>
                </tr>
                <tr>
                  <td className={tdCls}>Base64</td>
                  <td className={`${tdCls} font-mono`}>4.4 trillion</td>
                  <td className={tdCls}>+ and / need escaping in URLs</td>
                </tr>
              </tbody>
            </table>
          </div>
        </GoDeeper>
        <Check
          persistKey="chapter8:quiz:length"
          questions={[
            {
              question: 'Why does the book choose 7 characters for the short code?',
              options: [
                { text: '7 is the smallest n where 62ⁿ (≈ 3.5 trillion) covers 365 billion URLs', correct: true, why: '62⁶ ≈ 56.8 billion falls short; 62⁷ ≈ 3.5 trillion covers the 10-year estimate with room to spare.' },
                { text: '6 is enough, because 62⁶ is about 56.8 billion', why: '56.8 billion is less than the 365 billion URLs needed over 10 years.' },
                { text: 'Hash functions output exactly 7 characters', why: 'They output more (CRC32 is 8 hex chars, MD5 is 32). That is why the hash has to be shortened.' },
              ],
            },
            {
              question: 'Why use base62 rather than base64 for short codes?',
              options: [
                { text: 'Base64 includes + and /, which have special meaning in URLs and need escaping', correct: true, why: 'Base62 uses only letters and digits, so every code is URL-safe as-is.' },
                { text: 'Base64 holds fewer values per character', why: 'Base64 holds slightly more (64 vs 62). The problem is its symbols, not its capacity.' },
                { text: 'Base64 cannot be decoded back to a number', why: 'Base64 is fully reversible. It is avoided for URL safety, not reversibility.' },
              ],
            },
          ]}
        />
      </>
    ),
  },
  {
    id: 'hash',
    title: 'Hash and collision resolution',
    goal: 'Hash the long URL, keep the first 7 characters, and when that code is taken, change the input and hash again.',
    content: (
      <>
        <Explain>
          <p>
            The first approach hashes the long URL with CRC32, MD5 or SHA-1. Even the shortest, CRC32, gives 8 hex characters, so we keep only the first 7.
          </p>
          <p>
            Cutting a hash short means two different URLs can start the same way: a{' '}
            <Term term="hash collision">Two different inputs that produce the same shortened hash, so they would get the same short code.</Term>. The fix: append a
            predefined string to the long URL and hash again, repeating until the code is free.
          </p>
        </Explain>
        <Try
          task={
            <>
              Press <strong>Shorten next URL</strong> two or three times, then press <strong>Force a collision</strong>. Watch attempt 1 land on a taken code and
              attempt 2, with <code>#retry</code> appended, land on a free one.
            </>
          }
        >
          <HashLab />
        </Try>
        <Callout tone="warning" title="The hidden cost">
          Every attempt has to ask the database whether the code is taken. Lesson 9 shows how a Bloom filter skips most of those reads.
        </Callout>
        <Check
          persistKey="chapter8:quiz:hash"
          questions={[
            {
              question: "Two different long URLs produce the same first 7 characters. What does the book's approach do?",
              options: [
                { text: 'Append a predefined string to the new long URL and hash again, repeating until the code is unused', correct: true, why: 'Changing the input changes the hash, so re-hashing eventually lands on a free code.' },
                { text: 'Overwrite the existing mapping with the new URL', why: 'That silently breaks a link someone already shared.' },
                { text: 'Return an error and ask the user to try again', why: 'Hashing is deterministic: the same URL would collide again. The server must resolve it itself.' },
              ],
            },
          ]}
        />
      </>
    ),
  },
  {
    id: 'base62',
    title: 'Base62 conversion',
    goal: 'Write a unique numeric ID in base 62 by dividing by 62 repeatedly. Each remainder becomes one character.',
    content: (
      <>
        <Explain>
          <p>
            The second approach does not hash at all. Each new URL gets a number from a{' '}
            <Term term="unique ID generator">A service that hands out globally unique numbers, like the Snowflake design in Chapter 7.</Term>, and that number is
            rewritten in base 62.
          </p>
          <p>
            It works like writing a number in any base: divide by 62, keep the remainder, repeat with the quotient. Remainders 0-9 are digits, 10-35 are a-z, 36-61 are
            A-Z. The book's example: 11157 = 2 × 62² + 55 × 62 + 59, so the digits [2, 55, 59] become <strong>2TX</strong>.
          </p>
        </Explain>
        <Try
          task={
            <>
              Press <strong>Next division</strong> until the code is complete. Each remainder fills one box, starting from the right. Then press the book's ID{' '}
              <strong>2009215674938</strong> and do it again.
            </>
          }
        >
          <Base62Lab />
        </Try>
        <Check
          persistKey="chapter8:quiz:base62"
          questions={[
            {
              question: 'Convert 11157 to base62 (0-9, a-z, A-Z). What is the code?',
              options: [
                { text: '2TX', correct: true, why: '11157 = 2×62² + 55×62 + 59 → digits [2, 55, 59] → 2, T, X.' },
                { text: 'XT2', why: 'The division yields remainders from least significant first; you read them bottom-up, so X is last.' },
                { text: '2tx', why: 'Lowercase letters stand for 10–35. 55 and 59 fall in the uppercase range (36–61): T and X.' },
              ],
            },
          ]}
        />
      </>
    ),
  },
  {
    id: 'compare',
    title: 'Hash vs base62',
    goal: 'Hashing gives fixed-length, unguessable codes but must handle collisions; base62 never collides but needs an ID generator and is predictable.',
    content: (
      <>
        <Explain>
          <div className="overflow-x-auto -mx-1">
            <table className={tableCls}>
              <thead>
                <tr>
                  <th className={thCls}>Hash + collision resolution</th>
                  <th className={thCls}>Base62 conversion</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-white/10">
                {[
                  ['Fixed code length', 'Length grows with the ID'],
                  ['No unique ID generator needed', 'Depends on a unique ID generator'],
                  ['Collisions possible; must re-hash and check the database', 'No collisions: every ID is unique'],
                  ['Next code cannot be guessed', 'Next code is easy to guess if IDs go up by 1'],
                ].map(([a, b]) => (
                  <tr key={a}>
                    <td className={tdCls}>{a}</td>
                    <td className={tdCls}>{b}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p>The book goes with base62 conversion for its deep dive.</p>
        </Explain>
        <GoDeeper title="Beyond the book: a key generation service">
          <p>
            Some designs pre-generate random 7-character keys and keep them in a pool. Each new URL takes an unused key, which is then marked used. There are no
            collision checks at write time and no guessable sequence, at the cost of running and protecting one more service.
          </p>
        </GoDeeper>
        <Check
          persistKey="chapter8:quiz:compare"
          questions={[
            {
              question: 'Which is a real drawback of base62 conversion of sequential IDs?',
              options: [
                { text: 'The next short URL is easy to guess, which can be a security concern', correct: true, why: 'If IDs increase by 1, anyone can enumerate neighbouring codes.' },
                { text: 'It can produce collisions that need re-hashing', why: "Each ID is unique, so its base62 form is unique too. Collisions are the hash approach's problem." },
                { text: 'Codes are always exactly 7 characters', why: 'The opposite: the length is not fixed and grows as IDs get larger.' },
              ],
            },
            {
              question: 'Your team cannot run a unique ID generator. Which approach still works?',
              options: [
                { text: 'Hash + collision resolution', correct: true, why: 'It derives the code from the URL itself, so it needs no central source of IDs.' },
                { text: 'Base62 conversion', why: 'Base62 converts an ID. Without a unique ID generator there is nothing unique to convert.' },
                { text: 'Neither: both need an ID generator', why: 'Only base62 does. The hash approach uses the row id just as a primary key, which the database can assign.' },
              ],
            },
          ]}
        />
      </>
    ),
  },
  {
    id: 'shorten-flow',
    title: 'The shortening flow',
    goal: 'Check whether the long URL is new, give it a fresh ID, convert to base62, save. A Bloom filter makes "is it already there?" cheap.',
    content: (
      <>
        <Explain>
          <p>
            Every shorten request starts with a lookup: is this already stored? Doing that against the database on every request is expensive. A{' '}
            <Term term="Bloom filter">A bit array plus a few hash functions. It answers "definitely not in the set" or "maybe in the set" using very little memory.</Term>{' '}
            answers from memory first.
          </p>
          <p>
            To add a key, set the bits its hash functions point to. To check a key, look at those bits. Any 0 means <strong>definitely absent</strong>, so skip the
            database. All 1s means <strong>maybe</strong>: the bits could have been set by other keys, so read the database to be sure.
          </p>
        </Explain>
        <Figure caption="The book's shortening flow with base62 conversion. Step 2 is where the Bloom filter helps; the hash approach uses it the same way to check candidate codes.">
          <ShortenFlowFigure />
        </Figure>
        <Try
          task={
            <>
              Press <strong>Add 4 URLs</strong> twice, then <strong>Find a false positive</strong>. The outlined bits are all set, yet that code was never stored.
            </>
          }
        >
          <BloomLab />
        </Try>
        <Callout tone="idea">A Bloom filter never gives a false negative: a stored key always finds its own bits set. So "definitely absent" is always safe to trust.</Callout>
        <Check
          persistKey="chapter8:quiz:shorten-flow"
          questions={[
            {
              question: "In the book's shortening flow, what happens first when a long URL arrives?",
              options: [
                { text: 'Check whether the long URL is already stored, and return its existing short URL if so', correct: true, why: 'This avoids creating many short URLs for the same long URL.' },
                { text: 'Ask the unique ID generator for a new ID', why: 'Only after confirming the long URL is new; otherwise you waste an ID and create a duplicate mapping.' },
                { text: 'Look up the short code in the cache', why: 'The cache serves redirects (short → long). Shortening starts from the long URL.' },
              ],
            },
            {
              question: 'The Bloom filter says a key is "maybe present". What should happen next?',
              options: [
                { text: 'Read the database to confirm, because it could be a false positive', correct: true, why: '"Maybe" means all its bits are set, possibly by other keys. Only the database knows for sure.' },
                { text: 'Nothing: "maybe present" means it is definitely there', why: 'Bloom filters cannot confirm membership; the bits may have been set by other keys.' },
                { text: 'Remove the key from the Bloom filter', why: 'A standard Bloom filter cannot delete: clearing a bit could erase other keys that share it.' },
              ],
            },
          ]}
        />
      </>
    ),
  },
  {
    id: 'redirect-flow',
    title: 'The redirect flow with a cache',
    goal: 'Redirects outnumber writes 10 to 1 and a mapping never changes, so hot pairs are served from a cache in front of the database.',
    content: (
      <>
        <Explain>
          <p>When someone clicks a short link:</p>
          <ol>
            <li>The load balancer forwards the request to a web server.</li>
            <li>If the short URL is in the cache, return the long URL straight away.</li>
            <li>If not, read it from the database and put it in the cache.</li>
            <li>If the database has no row either, the short URL is invalid.</li>
          </ol>
          <p>Because a mapping never changes after it is created, the cache never holds stale data.</p>
        </Explain>
        <Try
          task={
            <>
              Click <strong>zn9edcu</strong> twice: the first click is a miss, the second a hit. Press <strong>20 random clicks</strong> and read the hit ratio. Then
              switch the cache <strong>Off</strong> and compare the database reads.
            </>
          }
        >
          <CacheLab />
        </Try>
        <Check
          persistKey="chapter8:quiz:redirect-flow"
          questions={[
            {
              question: 'Why does the book put the <shortURL, longURL> mapping in a cache?',
              options: [
                { text: 'Reads far outnumber writes and mappings never change, so hot entries can be served from memory', correct: true, why: 'A read-heavy, immutable mapping is the ideal cache workload, with no invalidation headaches.' },
                { text: 'The cache makes new short URLs durable', why: 'Durability comes from the database. A cache is a fast copy that can be lost.' },
                { text: 'It lets the system return 301 instead of 302', why: 'Redirect codes are independent of server-side caching.' },
              ],
            },
            {
              question: 'A short code is in neither the cache nor the database. What does that most likely mean?',
              options: [
                { text: 'The user entered an invalid short URL', correct: true, why: 'Every valid code has a database row; a miss in both means it was never created.' },
                { text: 'The cache evicted it, so the server should create a new mapping', why: 'Eviction only removes the cached copy; the database would still have the row.' },
                { text: 'The browser cached a 301 incorrectly', why: 'If the request reached the server, the browser did not use a cached redirect.' },
              ],
            },
          ]}
        />
      </>
    ),
  },
  {
    id: 'scale',
    title: 'Scaling and wrap-up',
    goal: 'Stateless web servers, a replicated and sharded database, a rate limiter and analytics turn the design into something that runs at scale.',
    content: (
      <>
        <Explain>
          <p>The book ends with talking points for the rest of the interview:</p>
          <ul>
            <li>
              <strong>Rate limiter:</strong> stop one client from flooding the shorten endpoint.
            </li>
            <li>
              <strong>Web tier:</strong> servers keep no state, so add more behind the load balancer.
            </li>
            <li>
              <strong>Database:</strong> replicas for reads, sharding when one primary is not enough.
            </li>
            <li>
              <strong>Analytics:</strong> log each click to learn who clicks what, when and from where.
            </li>
            <li>
              <strong>Availability, consistency, reliability:</strong> the same trade-offs as every large system.
            </li>
          </ul>
        </Explain>
        <WhatChanged
          before="One web server and one database handle everything."
          after="Rate limiter → load balancer → stateless web servers → cache → primary database with read replicas, plus click analytics."
          reason="Each piece removes one limit: abuse, web server CPU, database reads, and visibility into how links are used."
        />
        <GoDeeper title="Rate limiting the shorten endpoint">
          <p>
            One IP sending thousands of shorten requests would burn through IDs and storage. A rate limiter in front (Chapter 4) filters by IP or other rules and
            answers the extras with HTTP 429 before they reach the API servers.
          </p>
        </GoDeeper>
        <GoDeeper title="Where the 11,600 reads per second go">
          <p>
            With a 90% cache hit ratio, only about 1,160 reads per second reach the database, and read replicas split those further. Writes, about 1,160 per second,
            still go to the primary. When one primary cannot keep up or hold the data, shard the table, for example by a hash of the short URL.
          </p>
        </GoDeeper>
        <GoDeeper title="Analytics ties back to 302">
          <p>
            Click counts, sources and times can only be logged for requests the server receives. That is why a shortener that sells analytics answers with 302, not
            301.
          </p>
        </GoDeeper>
        <GoDeeper title="Availability, consistency, reliability">
          <ul>
            <li>Several stateless web servers and database replicas mean one failure does not take links down.</li>
            <li>A new link written to the primary may take a moment to reach replicas; a click right after creation could briefly miss.</li>
            <li>Mappings are durable in the database; the cache can be lost and rebuilt from it.</li>
          </ul>
        </GoDeeper>
        <Check
          persistKey="chapter8:quiz:scale"
          questions={[
            {
              question: 'Why is the web tier easy to scale horizontally?',
              options: [
                { text: 'It is stateless: any server can answer any request, so you just add or remove servers', correct: true, why: 'All mappings live in the cache and database, so a load balancer can send a request anywhere.' },
                { text: 'Each web server stores its own subset of URLs', why: 'That would make the tier stateful, and requests would have to reach one specific server.' },
                { text: 'It uses 301 redirects', why: 'Redirect type affects how many requests arrive, not how easy servers are to add.' },
              ],
            },
            {
              question: 'Adding read replicas helps most with which traffic?',
              options: [
                { text: 'Redirect lookups that miss the cache', correct: true, why: 'Replicas copy the data and serve reads; cache misses are the reads that reach the database.' },
                { text: 'Creating new short URLs', why: 'Writes still go to the primary, so replicas do not add write capacity.' },
                { text: "Redirects served from the browser's 301 cache", why: 'Those never reach your servers at all.' },
              ],
            },
          ]}
        />
      </>
    ),
  },
];

export const Chapter8UrlShortener: React.FC<Chapter8UrlShortenerProps> = () => <ChapterPlayer chapterId="chapter8" lessons={LESSONS} />;
