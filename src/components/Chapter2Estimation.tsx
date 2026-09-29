import React from 'react';
import { Term } from './learn/LearningKit';
import { ChapterPlayer, Lesson } from './lesson/ChapterPlayer';
import { Explain, Try, Check, GoDeeper, Callout, Figure } from './lesson/blocks';
import {
  SECONDS_PER_DAY,
  Step,
  EstimateCheck,
  PowerLab,
  LatencyBars,
  SlowerGame,
  NinesLab,
  NINES,
  downtimeFor,
  formatDuration,
  infraFor,
  LATENCIES,
  TwitterWalk,
  Playground,
} from './ch2/Labs';

interface Chapter2EstimationProps {
  /** Kept for API compatibility with App; theming uses Tailwind `dark:` bound to the app toggle. */
  isDarkMode?: boolean;
}

const LESSONS: Lesson[] = [
  {
    id: 'why',
    title: 'Why estimate',
    goal: 'A quick, rounded estimate tells you whether a design can work before anything is built.',
    content: (
      <>
        <Explain>
          <p>
            Nobody knows the exact traffic or storage of a system before it exists. Instead, engineers make quick{' '}
            <Term term="order-of-magnitude">
              The power of ten a number falls into. 3,500 and 7,000 are the same order of magnitude (thousands); 3,500 and 350,000 are not.
            </Term>{' '}
            calculations from a few assumptions plus common performance numbers. Jeff Dean calls these back-of-the-envelope estimates.
          </p>
          <p>Knowing whether you need 10 or 1,000 servers, or 10 TB or 10 PB, decides the database, cache and network design. Exact decimals do not.</p>
          <p>The estimates interviewers ask for most: QPS, peak QPS, storage, cache and number of servers.</p>
        </Explain>
        <Callout tone="idea">Estimation is graded on the process. Get the order of magnitude right and show every step.</Callout>
        <GoDeeper title="What each estimate decides">
          <ul>
            <li>
              <strong>Write rate</strong> decides whether one database is enough or you need{' '}
              <Term term="sharding">Splitting data across several database servers so each holds and serves only part of it (Chapter 1).</Term>. A single
              relational primary handles somewhere in the thousands of simple writes per second (a rough rule, not from the book; benchmark it).
            </li>
            <li>
              <strong>Cache size</strong> decides how much RAM you buy.
            </li>
            <li>
              <strong>Storage over the retention period</strong> decides ordinary disks versus distributed object storage.
            </li>
            <li>
              <strong>Bandwidth</strong>: large outbound traffic (images, video) says put a CDN in front.
            </li>
          </ul>
        </GoDeeper>
        <Check
          persistKey="chapter2:quiz:intro"
          questions={[
            {
              question: 'You divide by 100,000 instead of 86,400 seconds per day. What is the interviewer mainly evaluating?',
              options: [
                { text: 'Your reasoning and whether the order of magnitude is right', correct: true, why: 'The book stresses that the process matters more than the result, and precision is not expected.' },
                { text: 'Whether you can do exact long division under pressure', why: 'Precise arithmetic wastes interview time; the book explicitly recommends rounding.' },
                { text: 'Whether you remember the real traffic numbers of the company', why: 'Estimates are built from stated assumptions. Even the book notes its Twitter figures are not real.' },
              ],
            },
            {
              question: 'Your estimate says a service will hold ~50 PB after 5 years. What is the most useful conclusion?',
              options: [
                { text: 'You need a distributed storage system (e.g. object storage), not a single database server', correct: true, why: 'Petabytes are far beyond one machine, so the estimate changes the architecture before anything is built.' },
                { text: 'Buy the largest single disk available', why: 'No single disk or server holds tens of petabytes; this is exactly the mistake estimation prevents.' },
                { text: 'Storage size is irrelevant until launch', why: 'Storage scale drives database and storage choices, which are expensive to change later.' },
              ],
            },
          ]}
        />
      </>
    ),
  },
  {
    id: 'power2',
    title: 'Powers of two',
    goal: 'Each data unit is about 1,000 times the one before, so you can jump from bytes to petabytes by counting steps.',
    content: (
      <>
        <Explain>
          <p>
            A byte is 8 bits, and one ASCII character takes one byte. Data volume units are powers of two: 2^10 bytes is a kilobyte, 2^20 a megabyte, and
            so on up to 2^50, a petabyte.
          </p>
          <p>
            Since 2^10 = 1,024 ≈ 1,000, every step up is roughly <strong>×1,000</strong>. Million × KB = GB, billion × KB = TB, billion × MB = PB.
          </p>
        </Explain>
        <Try task={<>Pick <strong>2^10</strong>, then <strong>2^30</strong>, then <strong>2^50</strong>. Look at the highlighted unit and how far 2^n drifts from the round power of ten.</>}>
          <PowerLab />
        </Try>
        <Check
          persistKey="chapter2:quiz:power2"
          questions={[
            {
              question: '2^30 bytes is approximately…',
              options: [
                { text: '1 billion bytes (1 GB)', correct: true, why: '2^30 = 1,073,741,824, roughly a billion bytes: a gigabyte.' },
                { text: '1 million bytes (1 MB)', why: 'That is 2^20. Each +10 in the exponent is another ×1,000.' },
                { text: '1 trillion bytes (1 TB)', why: 'That is 2^40, one step further up.' },
              ],
            },
          ]}
        />
      </>
    ),
  },
  {
    id: 'latency',
    title: 'Latency numbers',
    goal: 'Memory is nanoseconds, the network inside a datacenter is hundreds of microseconds, and disks and far-away regions are milliseconds.',
    content: (
      <>
        <Explain>
          <p>
            The book lists Jeff Dean's 2010 latency numbers. Hardware is faster now, but the gaps between tiers still hold, and they explain most design
            choices:
          </p>
          <ul>
            <li>Memory is fast, disk is slow. Avoid disk seeks.</li>
            <li>Simple compression is cheap, so compress before sending over the internet.</li>
            <li>Datacenters in different regions are far apart: a round trip takes ~150 ms.</li>
          </ul>
        </Explain>
        <Figure caption="Log scale: each labelled tick is 1,000× the one before, so a disk seek, whose bar looks under 3× longer than a memory reference, is really 100,000× slower.">
          <LatencyBars />
        </Figure>
        <Try task={<>Tap the operation you think is <strong>slower</strong>. Read how many times slower it is, then press <strong>Next pair</strong>.</>}>
          <SlowerGame />
        </Try>
        <GoDeeper title="Human scale: if an L1 cache reference took 1 second">
          <ul>
            {LATENCIES.filter((l) => ['Main memory reference', 'Round trip within the same datacenter', 'Disk seek', 'Send packet CA → Netherlands → CA'].includes(l.op)).map((l) => (
              <li key={l.op}>
                {l.op}: <strong className="font-mono">{formatDuration(l.ns / 0.5)}</strong>
              </li>
            ))}
          </ul>
        </GoDeeper>
        <GoDeeper title="Estimate: reading 1 GB from memory and from disk">
          <div className="space-y-6">
            <EstimateCheck
              id="latency-mem"
              prompt={<>How long does it take to read <strong>1 GB sequentially from memory</strong>?</>}
              unit="ms"
              answer={250}
              worked={
                <>
                  <Step label="From the table:" math="1 MB from memory ≈ 250 µs" />
                  <Step label="Scale up:" math="1 GB = 1,000 MB → 1,000 × 250 µs = 250,000 µs = 250 ms" />
                </>
              }
            />
            <EstimateCheck
              id="latency-disk"
              prompt={<>And how long to read the same <strong>1 GB sequentially from disk</strong>?</>}
              unit="seconds"
              answer={30}
              worked={
                <>
                  <Step label="From the table:" math="1 MB from disk ≈ 30 ms" />
                  <Step label="Scale up:" math="1,000 × 30 ms = 30,000 ms = 30 s" />
                  <p>Same data, 120× slower. That gap is why hot data is kept in memory.</p>
                </>
              }
            />
          </div>
        </GoDeeper>
        <Check
          persistKey="chapter2:quiz:latency"
          questions={[
            {
              question: 'Roughly how much slower is a same-datacenter round trip than a main-memory reference?',
              options: [
                { text: 'About 5,000×', correct: true, why: '500,000 ns ÷ 100 ns = 5,000.' },
                { text: 'About 10×', why: 'Far too small: memory is ~100 ns and the round trip ~500,000 ns.' },
                { text: 'About 100,000×', why: 'That is the disk seek vs memory ratio (10 ms ÷ 100 ns).' },
              ],
            },
            {
              question: 'Why does the book suggest compressing data before sending it over the internet?',
              options: [
                { text: 'Compression is cheap (~10 µs per KB) compared with the time to move bytes across long network links', correct: true, why: 'Spending microseconds of CPU to send fewer bytes over a link measured in milliseconds is a good trade.' },
                { text: 'Compression makes the CPU run faster', why: 'Compression costs CPU time; the saving is in network transfer.' },
                { text: 'The network is faster than memory, so data should be small in memory', why: 'The reverse: the network is much slower than memory.' },
              ],
            },
          ]}
        />
      </>
    ),
  },
  {
    id: 'nines',
    title: 'Availability nines',
    goal: 'An availability target is a downtime budget, and each extra nine divides that budget by ten.',
    content: (
      <>
        <Explain>
          <p>
            Availability is the share of time a service is up, usually between 99% and 100%. A{' '}
            <Term term="service level agreement (SLA)">A formal agreement between a provider and its customer that defines the level of uptime the service will deliver.</Term>{' '}
            promises a level of uptime. The major cloud providers set theirs at 99.9% or above.
          </p>
          <p>
            Allowed downtime = (1 − availability) × period. Three nines allows about 44 minutes a month; four nines only about 4.
          </p>
        </Explain>
        <Try task={<>Pick <strong>99.9%</strong>, then <strong>99.99%</strong>. Compare the downtime per month, then look at what it takes to reach each target.</>}>
          <NinesLab />
        </Try>
        <GoDeeper title="The full table">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-500 dark:text-slate-400">
                  <th className="py-2 pr-3 font-medium">Availability</th>
                  <th className="py-2 pr-3 font-medium">Per day</th>
                  <th className="py-2 pr-3 font-medium">Per week</th>
                  <th className="py-2 pr-3 font-medium">Per month</th>
                  <th className="py-2 font-medium">Per year</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-white/10">
                {NINES.map((n) => {
                  const d = downtimeFor(n);
                  return (
                    <tr key={n} className="font-mono">
                      <td className="py-2 pr-3">{n}%</td>
                      <td className="py-2 pr-3">{formatDuration(d.day)}</td>
                      <td className="py-2 pr-3">{formatDuration(d.week)}</td>
                      <td className="py-2 pr-3">{formatDuration(d.month)}</td>
                      <td className="py-2">{formatDuration(d.year)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p>A year is 365.25 days and a month one twelfth of a year. Typical approaches (illustrative, not from the book):</p>
          <ul>
            {NINES.map((n) => (
              <li key={n}>
                <span className="font-mono">{n}%</span>: {infraFor(n)}
              </li>
            ))}
          </ul>
        </GoDeeper>
        <GoDeeper title="Estimate: a 99.95% monthly SLA">
          <EstimateCheck
            id="availability-9995"
            prompt={<>A provider promises <strong>99.95%</strong> monthly availability. About how many minutes of downtime per month does that allow?</>}
            unit="minutes"
            answer={0.0005 * (365.25 / 12) * 24 * 60}
            hint="a month is about 30 × 24 × 60 ≈ 43,800 minutes."
            worked={
              <>
                <Step label="Unavailable fraction:" math="1 − 0.9995 = 0.0005" />
                <Step label="Minutes in a month:" math="30.44 days × 1,440 ≈ 43,830 min" />
                <Step label="Budget:" math="0.0005 × 43,830 ≈ 21.9 min" />
                <p>That sits between three nines (43.8 min/month) and four nines (4.4 min/month).</p>
              </>
            }
          />
        </GoDeeper>
        <Check
          persistKey="chapter2:quiz:availability"
          questions={[
            {
              question: 'About how much downtime per year does 99.99% availability allow?',
              options: [
                { text: '~52.6 minutes', correct: true, why: '0.0001 × 365.25 days × 1,440 min ≈ 52.6 minutes.' },
                { text: '~8.8 hours', why: 'That is three nines (99.9%), which allows 10× more downtime.' },
                { text: '~5.3 minutes', why: 'That is five nines (99.999%).' },
              ],
            },
            {
              question: 'A request must pass through two independent services, each 99.9% available. The combined availability is roughly…',
              options: [
                { text: '99.8%', correct: true, why: 'Dependencies in series multiply: 0.999 × 0.999 ≈ 0.998, so the downtime budgets roughly add up.' },
                { text: '99.9%', why: 'Either one failing breaks the request, so the combination is worse than each alone.' },
                { text: '99.99%', why: 'Availability improves only with redundant copies in parallel, not with a chain of dependencies.' },
              ],
            },
          ]}
        />
      </>
    ),
  },
  {
    id: 'qps',
    title: 'From users to QPS',
    goal: 'Requests per second come from daily users × actions per user, divided by the seconds in a day, then doubled for peak.',
    content: (
      <>
        <Explain>
          <p>The chain is always the same:</p>
          <ol>
            <li>
              Start from <strong>daily</strong> active users (DAU), not monthly: only today's users make today's requests.
            </li>
            <li>Multiply by actions per user per day.</li>
            <li>
              Divide by 86,400 seconds in a day. Rounding it to 100,000 is fine and makes the math fast (about 14% low).
            </li>
            <li>Peak QPS: the book assumes 2 × the average.</li>
          </ol>
        </Explain>
        <Try task={<>Type your estimate and press <strong>Check my estimate</strong>. Rounding is encouraged.</>}>
          <EstimateCheck
            id="intro-qps"
            prompt={<>A service receives <strong>10 million requests per day</strong>, spread evenly. Roughly how many requests per second is that?</>}
            unit="requests/s"
            answer={10_000_000 / SECONDS_PER_DAY}
            hint="a day has 86,400 seconds; round it to 100,000."
            worked={
              <>
                <Step label="Exact:" math="10,000,000 / 86,400 s ≈ 116 requests/s" />
                <Step label="Interview shortcut:" math="10,000,000 / 100,000 = 100 requests/s" />
                <p>Both say "about a hundred per second". Peak would be about 200.</p>
              </>
            }
          />
        </Try>
        <Check
          persistKey="chapter2:quiz:qps"
          questions={[
            {
              question: 'Why multiply 300 million MAU by the daily-active share before computing QPS?',
              options: [
                { text: 'Daily request volume comes from users active that day (DAU), not everyone active in a month', correct: true, why: "Only people using the product today generate today's requests, so QPS is based on DAU." },
                { text: 'To account for peak traffic', why: 'Peak is handled separately by multiplying the average QPS by 2.' },
                { text: 'Because half the requests fail', why: 'Nothing in the assumptions mentions failures; the share is the daily-active fraction.' },
              ],
            },
            {
              question: 'Your estimate shows ~50,000 writes per second, well above what one relational primary is usually good for. What is a sensible next step?',
              options: [
                { text: 'Plan to partition (shard) writes or use a write-scalable store, and benchmark to confirm', correct: true, why: 'Writes must land somewhere durable; spreading them over several nodes is the standard answer to a write bottleneck.' },
                { text: 'Add a read cache in front of the database', why: 'A cache absorbs reads. Every write still has to reach the database, so it does not fix a write bottleneck.' },
                { text: 'Nothing: one bigger server will always cope', why: 'Vertical scaling has a hard ceiling (Chapter 1). A 10× gap is a signal to change the design, not just the machine.' },
              ],
            },
          ]}
        />
      </>
    ),
  },
  {
    id: 'storage',
    title: 'Storage',
    goal: 'Storage is items per day × size of each item × days kept, and the biggest item type usually decides the answer.',
    content: (
      <>
        <Explain>
          <p>
            Storage per day = writes per day × bytes per write. Multiply by 365 × years of retention for the total. Add exponents to change units: a
            billion (10^9) items of a kilobyte (10^3) is 10^12 bytes, a terabyte.
          </p>
          <p>
            When items mix small text with large media, the media dominates, so estimate that first. A cache is different: it stores each hot item once,
            so size it from the{' '}
            <Term term="80/20 rule">Roughly 20% of the items receive about 80% of the reads, so caching that hot 20% serves most requests.</Term> hot share
            of each day's new data, not from the number of reads.
          </p>
        </Explain>
        <Try task={<>Type your estimate and press <strong>Check my estimate</strong>. Count the powers of ten.</>}>
          <EstimateCheck
            id="power2-users"
            prompt={<>You store a <strong>1 KB profile</strong> for each of <strong>1 billion users</strong>. How many GB is that?</>}
            unit="GB"
            answer={1000}
            worked={
              <>
                <Step label="Bytes:" math="10^9 users × 10^3 bytes = 10^12 bytes" />
                <Step label="Convert:" math="10^12 bytes = 1 TB = 1,000 GB" />
                <p>Billion (9) + kilo (3) = 12, and 10^12 is a terabyte.</p>
              </>
            }
          />
        </Try>
        <Check
          persistKey="chapter2:quiz:storage"
          questions={[
            {
              question: '30 million photos of 1 MB each take up about…',
              options: [
                { text: '30 TB', correct: true, why: "Million (10^6) × MB (10^6) = 10^12 bytes = TB, so 30 × 1 TB = 30 TB. This is the book's Twitter media figure." },
                { text: '30 GB', why: 'That would be 30 million × 1 KB. Missing a ×1,000 step is the classic unit slip.' },
                { text: '30 PB', why: 'That would need 30 billion photos, or 1 GB each.' },
              ],
            },
            {
              question: 'Why size a cache from "hot share × unique data per day" rather than "hot share × total reads"?',
              options: [
                { text: 'A cached item is stored once no matter how many times it is read', correct: true, why: 'Multiplying by read count counts the same item hundreds of times, which inflates memory by the read:write ratio.' },
                { text: 'Reads are cheaper than writes, so they need less memory', why: 'Cost per read is not the issue; memory depends on how many distinct bytes you keep.' },
                { text: 'The 80/20 rule says the cache should hold 80% of all data', why: 'It is the reverse: about 20% of items serve about 80% of requests, so you cache the hot 20%.' },
              ],
            },
          ]}
        />
      </>
    ),
  },
  {
    id: 'twitter',
    title: 'Worked example: Twitter',
    goal: "Put the chain together on the book's Twitter example: users to QPS, peak QPS and 5-year media storage.",
    content: (
      <>
        <Explain>
          <p>
            This is the template for every estimation question: state the assumptions, then multiply and divide one step at a time, labelling units. The
            book stresses these figures are for the exercise, not Twitter's real numbers.
          </p>
        </Explain>
        <Try task={<>Press <strong>Next step</strong> to reveal each step. Where a step asks for an estimate, make one before you look.</>}>
          <TwitterWalk />
        </Try>
        <Callout tone="idea">Users → DAU → actions per day → ÷ 86,400 → ×2 for peak. Actions × size → per day → × days kept.</Callout>
        <Check
          persistKey="chapter2:quiz:twitter"
          questions={[
            {
              question: 'Why is it reasonable to estimate only media storage here?',
              options: [
                { text: 'A 1 MB media file is thousands of times larger than ~200 bytes of ID and text, so media dominates', correct: true, why: 'Even with only 10% of tweets carrying media, media is ~30 TB/day vs ~61 GB/day of text.' },
                { text: 'Tweet text is not stored', why: 'It is stored; it is simply too small to change the total noticeably.' },
                { text: 'Text is kept only in the cache', why: 'Caches hold copies; the durable copy still lives in storage.' },
              ],
            },
          ]}
        />
      </>
    ),
  },
  {
    id: 'tips',
    title: 'Tips for the interview',
    goal: "The book's habits for estimation questions: round, write assumptions down, label units, practise the common ones.",
    content: (
      <>
        <Explain>
          <ul>
            <li>
              <strong>Round and approximate.</strong> 99,987 / 9.1 becomes 100,000 / 10 = 10,000. Precision is not expected.
            </li>
            <li>
              <strong>Write down your assumptions</strong> so you and the interviewer can refer back to them.
            </li>
            <li>
              <strong>Label your units.</strong> Does "5" mean 5 KB or 5 MB? Write "5 MB".
            </li>
            <li>
              <strong>Practise the common ones:</strong> QPS, peak QPS, storage, cache and number of servers.
            </li>
          </ul>
        </Explain>
        <Callout tone="warning" title="Common slips">
          Chasing decimals, calculating silently instead of out loud, and mixing bits and bytes: network speeds are quoted in bits per second, storage in
          bytes, a factor of 8.
        </Callout>
        <Check
          persistKey="chapter2:quiz:tips"
          questions={[
            {
              question: 'Mid-interview you need 99,987 / 9.1. What should you do?',
              options: [
                { text: 'Approximate it as 100,000 / 10 = 10,000 and move on', correct: true, why: 'The book recommends exactly this: rounding keeps you fast and the answer is within a few percent.' },
                { text: 'Work it out exactly by long division', why: 'It burns interview time for precision nobody needs.' },
                { text: 'Skip the step and guess the final number', why: 'Skipping hides your reasoning, which is what is being assessed.' },
              ],
            },
            {
              question: 'You wrote "storage = 5" on the whiteboard. What is the problem?',
              options: [
                { text: 'Without a unit it could be 5 KB or 5 PB, a 10^12× ambiguity', correct: true, why: 'Labelling units ("5 TB/day") prevents confusing yourself and the interviewer later.' },
                { text: 'You should have used exact numbers like 5.03', why: 'Precision is not the issue; the missing unit is.' },
                { text: 'Storage should always be given in bits', why: 'Storage is normally in bytes; bits are common for network rates.' },
              ],
            },
          ]}
        />
      </>
    ),
  },
  {
    id: 'playground',
    title: 'Playground',
    goal: 'See how each assumption flows into QPS, storage, bandwidth, cache size and server count.',
    content: (
      <>
        <Explain>
          <p>
            Every assumption from this chapter is an input here. Units are decimal (1 MB = 1,000 KB), as in the book's arithmetic. The skill is knowing which
            input drives which output.
          </p>
        </Explain>
        <Try task={<>Start from <strong>Twitter</strong>. Open <strong>Data</strong> and double the retention, then open <strong>Traffic</strong> and double reads per write. Watch which results move each time.</>}>
          <Playground />
        </Try>
        <Callout tone="idea">
          Retention changes only total storage. The read ratio changes read QPS and egress but not storage. Media size dominates storage and bandwidth.
        </Callout>
        <Check
          persistKey="chapter2:quiz:playground"
          questions={[
            {
              question: 'You double retention from 5 to 10 years. What changes?',
              options: [
                { text: 'Only the total storage doubles', correct: true, why: 'Retention multiplies storage per day by the number of days kept. QPS, bandwidth and daily cache size do not depend on it.' },
                { text: 'QPS doubles too', why: 'Keeping data longer does not make users send more requests.' },
                { text: 'Cache memory doubles', why: "Here the cache is sized from the hot share of each day's new data, which retention does not change." },
              ],
            },
            {
              question: 'You raise reads per write from 100 to 200. What happens?',
              options: [
                { text: 'Read QPS and egress double; storage stays the same', correct: true, why: 'Reads fetch existing data, so they add traffic but no new bytes to store.' },
                { text: 'Storage doubles', why: 'Storage grows with writes, not reads.' },
                { text: 'Write QPS doubles', why: 'Write QPS depends on DAU and writes per user only.' },
              ],
            },
          ]}
        />
      </>
    ),
  },
];

export const Chapter2Estimation: React.FC<Chapter2EstimationProps> = () => <ChapterPlayer chapterId="chapter2" lessons={LESSONS} />;
