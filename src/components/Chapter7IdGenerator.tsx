import React from 'react';
import { Term, WhatChanged, QuizQuestion } from './learn/LearningKit';
import { ChapterPlayer, Lesson } from './lesson/ChapterPlayer';
import { Explain, Try, Check, GoDeeper, Callout, Figure } from './lesson/blocks';
import {
  RequirementsList,
  ReqCheck,
  Scorecard,
  CounterLab,
  MultiMasterLab,
  UuidLab,
  LayoutLab,
  BitTuner,
  BurstLab,
  ClockSection,
  DecodeLab,
} from './ch7/Labs';

interface Chapter7IdGeneratorProps {
  /** Kept for API compatibility with App; theming uses Tailwind `dark:` bound to the app toggle. */
  isDarkMode?: boolean;
}

// =====================================================================
// Quiz questions
// =====================================================================

const Q = {
  requirements: [
    {
      question: 'One requirement says IDs must be "ordered by date". What does that mean?',
      options: [
        { text: 'An ID created later is a bigger number than one created earlier', correct: true, why: 'Right. Sorting by ID then sorts by creation time.' },
        { text: 'Each ID contains the date as text, like 20260929…', why: 'IDs only have to sort by time. How a design achieves that is up to it, and text would break "numeric only".' },
        { text: 'IDs are consecutive: 1, 2, 3 with no gaps', why: 'Gaps are fine. Only the order matters.' },
      ],
    },
  ] as QuizQuestion[],
  singleDb: [
    {
      question: 'Your only database uses AUTO_INCREMENT. Which requirement is it weakest on?',
      options: [
        { text: 'Uniqueness: two inserts can receive the same number', why: 'One counter serializes every insert, so it never repeats a value.' },
        { text: 'Ordering: later IDs can be smaller', why: 'A single counter only goes up, so later IDs are always larger.' },
        { text: 'Availability and scale: every ID depends on one server', correct: true, why: 'Right. It is a single point of failure and every ID request queues on the same machine.' },
        { text: 'Size: values quickly exceed 64 bits', why: 'A signed 64-bit counter lasts about 29 million years at 10,000 IDs per second.' },
      ],
    },
    {
      question: 'You add a second database, both using default AUTO_INCREMENT (start 1, step 1). What happens?',
      options: [
        { text: 'Both issue 1, 2, 3…, so the same IDs appear twice', correct: true, why: 'Right. Each counter is local and knows nothing about the other. The next lesson fixes this with offsets.' },
        { text: 'The databases detect each other and skip used numbers', why: 'AUTO_INCREMENT is purely local; there is no cross-server check.' },
        { text: 'Only ordering breaks; uniqueness survives', why: 'Identical counters produce identical values, so uniqueness is the first thing to break.' },
      ],
    },
  ] as QuizQuestion[],
  multi: [
    {
      question: 'With k = 3 servers, server 2 has issued 2, 5, 8. What does it issue next?',
      options: [
        { text: '9', why: 'That would be a step of 1. In multi-master mode each server adds k to its own previous ID.' },
        { text: '11', correct: true, why: 'Right: previous ID on the same server + k = 8 + 3.' },
        { text: '10', why: 'That is a step of 2, which only applies when k = 2.' },
      ],
    },
    {
      question: 'A k = 2 cluster (A: 1, 3, 5…; B: 2, 4, 6…) gets a third server. What is the danger?',
      options: [
        { text: 'k becomes 3, so the new server starts at 3, a number A already issued, and later steps collide too', correct: true, why: 'Right. That is the duplicate you produced in the lab.' },
        { text: 'None; the new server simply takes the next free offset', why: 'Under the new k, the "free" offset overlaps values already issued under the old k.' },
        { text: 'Only the new server becomes slower', why: 'Speed is not the issue; uniqueness is.' },
      ],
    },
  ] as QuizQuestion[],
  uuid: [
    {
      question: "Which of the chapter's requirements does a UUID fail?",
      options: [
        { text: 'Fits in 64 bits, numeric only, and ordered by date', correct: true, why: 'Right. It is 128 bits, written as hex, and random.' },
        { text: 'Uniqueness', why: 'Collisions are astronomically unlikely: the book quotes a 50% chance only after a billion UUIDs per second for about 100 years.' },
        { text: 'Generating 10,000 IDs per second', why: 'Each server generates locally, so throughput grows with the number of servers.' },
      ],
    },
    {
      question: 'Why do servers not need to coordinate to generate UUIDs?',
      options: [
        { text: 'With 122 random bits, two servers picking the same value is practically impossible', correct: true, why: 'Right. Uniqueness comes from randomness, not from agreement.' },
        { text: 'Each server is assigned a unique range in advance', why: 'That is the multi-master offset idea, not UUID.' },
        { text: 'A central registry checks every UUID', why: 'There is no registry; that would be a ticket server.' },
      ],
    },
  ] as QuizQuestion[],
  ticket: [
    {
      question: 'What is the main drawback of one ticket server?',
      options: [
        { text: 'It is a single point of failure', correct: true, why: 'Right. When it is down, no service can create IDs.' },
        { text: 'Its IDs are not numeric', why: 'They are plain auto_increment integers.' },
        { text: 'Its IDs are not ordered', why: 'A single counter only goes up, so they are ordered.' },
      ],
    },
    {
      question: 'You add a second ticket server to remove the single point of failure. What new problem appears?',
      options: [
        { text: 'The two must be kept in sync (e.g. odd/even), which brings back the multi-master problems', correct: true, why: 'Right. The book calls this the data synchronization challenge.' },
        { text: 'IDs become 128 bits', why: 'Both servers still issue 64-bit integers.' },
        { text: 'Nothing; two independent counters are always safe', why: 'Two default counters issue the same numbers, as you saw in the multi-master lesson.' },
      ],
    },
  ] as QuizQuestion[],
  layout: [
    {
      question: 'Why are Snowflake IDs sortable by time?',
      options: [
        { text: 'The timestamp occupies the most significant bits, so a later millisecond always gives a bigger number', correct: true, why: 'Right. The lower fields only break ties inside the same millisecond.' },
        { text: 'The sequence number keeps increasing forever', why: 'It resets to 0 every millisecond.' },
        { text: 'Datacenter IDs are assigned in time order', why: 'Datacenter and machine IDs are fixed at startup.' },
      ],
    },
    {
      question: 'Why use a custom epoch instead of 1970?',
      options: [
        { text: '41 bits cover about 69 years from the epoch, so starting near today delays overflow', correct: true, why: 'Right. From 1970, 41 bits would already run out in 2039.' },
        { text: 'Unix time cannot be stored in binary', why: 'It can; the issue is how many years the field lasts.' },
        { text: 'It makes IDs unique across datacenters', why: 'Uniqueness across datacenters comes from the datacenter ID field.' },
      ],
    },
  ] as QuizQuestion[],
  generate: [
    {
      question: 'With 12 sequence bits, how many IDs can one machine create in one millisecond?',
      options: [
        { text: '4,096', correct: true, why: 'Right: 2^12 = 4,096 values (0 to 4,095).' },
        { text: '4,095', why: '4,095 is the largest value, but counting from 0 gives 4,096 values.' },
        { text: '12', why: '12 is the number of bits, not the number of values they can hold.' },
      ],
    },
    {
      question: '5,000 requests hit one worker in the same millisecond. What should the generator do with request #4,097?',
      options: [
        { text: 'Wait until the next millisecond and issue it with sequence 0', correct: true, why: 'Right. The new timestamp makes the ID unique again.' },
        { text: 'Wrap the sequence to 0 in the same millisecond', why: 'That rebuilds exactly the ID of request #1, a duplicate.' },
        { text: 'Borrow the next datacenter ID', why: 'That ID belongs to another datacenter, so it could collide with its IDs.' },
      ],
    },
  ] as QuizQuestion[],
  clock: [
    {
      question: "An NTP correction moves a worker's clock back 3 ms. With no protection, what can happen?",
      options: [
        { text: 'It reuses milliseconds it already used, restarts the sequence at 0, and issues duplicate IDs', correct: true, why: 'Right. That is what the red cells showed under Ignore.' },
        { text: 'Nothing, because the sequence number keeps IDs unique', why: 'The sequence resets on every new millisecond, so it starts again at 0 and repeats.' },
        { text: 'IDs become 128 bits long', why: 'The layout does not change; the timestamp value just goes backwards.' },
      ],
    },
    {
      question: 'Which rollback policy keeps serving requests with no extra latency?',
      options: [
        { text: 'Switch to a backup worker ID', correct: true, why: "Right. A different machine ID cannot collide with the primary's earlier IDs, so it can issue immediately." },
        { text: 'Reject and throw an error', why: 'Safe, but callers get errors until the clock catches up.' },
        { text: 'Wait until the clock catches up', why: 'Safe, but each request is delayed by the size of the jump.' },
      ],
    },
  ] as QuizQuestion[],
  decode: [
    {
      question: 'With the book layout (41 · 5 · 5 · 12), how do you get the creation time out of an ID?',
      options: [
        { text: 'Shift it right by 22 bits, then add the epoch', correct: true, why: 'Right. The 22 low bits are datacenter, machine and sequence; what is left is milliseconds since the epoch.' },
        { text: 'Read the first 13 decimal digits', why: 'Fields are packed in binary, so they do not line up with decimal digits.' },
        { text: 'Keep only the lowest 12 bits', why: 'Those are the sequence number.' },
      ],
    },
  ] as QuizQuestion[],
};

// =====================================================================
// Lessons
// =====================================================================

const LESSONS: Lesson[] = [
  {
    id: 'requirements',
    title: 'The requirements',
    goal: 'Five requirements that every design in this chapter will be scored against.',
    content: (
      <>
        <Explain>
          <p>
            With one database, <code>auto_increment</code> hands out IDs for free. In a distributed system many machines create records at the same moment,
            and each record needs an ID that no other machine will ever hand out.
          </p>
          <p>Asking clarifying questions in the interview settles what "a good ID" means here.</p>
        </Explain>
        <Figure caption="Keep this checklist in mind. Each of the next lessons scores one design against it.">
          <RequirementsList />
        </Figure>
        <Check persistKey="chapter7:quiz:requirements" questions={Q.requirements} />
      </>
    ),
  },
  {
    id: 'single-db',
    title: 'One database counter',
    goal: 'A single auto_increment counter meets every requirement but one: it cannot survive its own failure or grow past one machine.',
    content: (
      <>
        <Explain>
          <p>
            Every web server inserts into the same database, and the database assigns the next number: 1, 2, 3. One counter means IDs are unique and always
            go up.
          </p>
          <p>
            The catch is that every new record, on every server, depends on that one machine. It is a{' '}
            <Term term="single point of failure">One component whose failure takes the whole system down.</Term> and a throughput ceiling.
          </p>
        </Explain>
        <Figure caption="A single counter scored against the checklist.">
          <ReqCheck approach="db" />
        </Figure>
        <Try task={<>Press <strong>Request an ID</strong> a few times. Then press <strong>Crash the database</strong> and request again. Watch every web server fail.</>}>
          <CounterLab kind="db" />
        </Try>
        <Check persistKey="chapter7:quiz:single-db" questions={Q.singleDb} />
      </>
    ),
  },
  {
    id: 'multi-master',
    title: 'Multi-master replication',
    goal: 'k databases can share the work by each stepping its counter by k, but only while k never changes.',
    content: (
      <>
        <Explain>
          <p>
            Give each of the k database servers its own counter that steps by <strong>k</strong> instead of 1. Server i issues i, i + k, i + 2k… With k = 2,
            DB A issues 1, 3, 5 and DB B issues 2, 4, 6. No two servers can pick the same number.
          </p>
          <p>The book lists three drawbacks: it is hard to run across data centers, IDs do not go up with time across servers, and adding or removing a server breaks it.</p>
        </Explain>
        <WhatChanged
          before="One database counter: 1, 2, 3, …"
          after="k database servers; server i issues i, i + k, i + 2k, …"
          reason="Removes the single server from the path and spreads the load."
        />
        <Try
          task={
            <>
              Tap <strong>DB A</strong> three times (1, 3, 5), then <strong>DB B</strong> once: its 2 is smaller than A's 5. Now press <strong>Add a server</strong> and tap{' '}
              <strong>DB C</strong>. It starts at 3, which A already issued.
            </>
          }
        >
          <MultiMasterLab />
        </Try>
        <Callout tone="idea">Stepping by k keeps IDs unique only while k is frozen, and never orders them by time across servers.</Callout>
        <GoDeeper title="Scored against the checklist">
          <ReqCheck approach="multi" />
        </GoDeeper>
        <Check persistKey="chapter7:quiz:multi-master" questions={Q.multi} />
      </>
    ),
  },
  {
    id: 'uuid',
    title: 'UUIDs',
    goal: 'A UUID needs no coordination at all, but it breaks three of the five requirements.',
    content: (
      <>
        <Explain>
          <p>
            A{' '}
            <Term term="UUID">Universally unique identifier: a 128-bit value. Version 4 fills 122 of its bits at random.</Term> is generated by each web server
            on its own, with no counter and no network call. Collisions are so unlikely that the book puts a 50% chance only after a billion UUIDs per
            second for about 100 years.
          </p>
          <p>That makes it easy and fast. But look at what it is: 128 bits, written as hex, and random.</p>
        </Explain>
        <Figure caption="A UUID scored against the checklist.">
          <ReqCheck approach="uuid" />
        </Figure>
        <Try task={<>Press <strong>Generate 5</strong>. Look at the letters in each ID, then at the <strong>Sorted by value</strong> row: the order no longer matches #1 to #5.</>}>
          <UuidLab />
        </Try>
        <GoDeeper title="What the fixed digits mean">
          <p>
            The highlighted digit is the version: always <code>4</code> for a random UUID. The first digit of the fourth group is the variant (8, 9, a or b).
            Those 6 fixed bits are why only 122 of the 128 are random.
          </p>
        </GoDeeper>
        <Check persistKey="chapter7:quiz:uuid" questions={Q.uuid} />
      </>
    ),
  },
  {
    id: 'ticket',
    title: 'Ticket server',
    goal: 'One counter on a dedicated server that everyone calls: numeric and ordered again, but a single point of failure again.',
    content: (
      <>
        <Explain>
          <p>
            Flickr built a{' '}
            <Term term="ticket server">A database whose only job is issuing auto_increment numbers to every other service.</Term>: one central auto_increment
            that every web server asks for its next ID.
          </p>
          <p>IDs are numeric, fit in 64 bits and are ordered, and it is easy to build. The book says it works for small and medium-scale applications.</p>
        </Explain>
        <Figure caption="A ticket server scored against the checklist.">
          <ReqCheck approach="ticket" />
        </Figure>
        <Try task={<>Request a few IDs from different web servers, then press <strong>Crash the ticket server</strong> and try again.</>}>
          <CounterLab kind="ticket" />
        </Try>
        <Callout tone="warning" title="Why not run two?">
          Two ticket servers need to be kept apart (for example odd and even numbers), which brings back the synchronization problems of multi-master
          replication.
        </Callout>
        <Check persistKey="chapter7:quiz:ticket" questions={Q.ticket} />
      </>
    ),
  },
  {
    id: 'layout',
    title: 'Snowflake: the 64-bit layout',
    goal: 'Split 64 bits into time, place and a counter, so every machine can build unique, time-sorted IDs on its own.',
    content: (
      <>
        <Explain>
          <p>Twitter's Snowflake divides one 64-bit number into fields:</p>
          <ul>
            <li>
              <strong>Timestamp</strong>, in the highest bits: milliseconds since a custom{' '}
              <Term term="epoch">The instant the timestamp counts from. Twitter uses Nov 4, 2010, so 41 bits last about 69 years from then instead of from 1970.</Term>
              . Later means bigger.
            </li>
            <li>
              <strong>Datacenter and machine IDs</strong>: two machines can never build the same ID.
            </li>
            <li>
              <strong>Sequence</strong>: breaks ties between IDs from the same machine in the same millisecond.
            </li>
          </ul>
        </Explain>
        <WhatChanged
          before="Every ID needs a network call to one ticket server"
          after="Each machine builds its own ID from its clock, its datacenter and machine ID, and a per-millisecond sequence"
          reason="No coordination and no single point of failure, while staying numeric, 64-bit and ordered by time."
        />
        <Try task="Hover or tap each field in the bar. Watch which bits of the example ID light up, and read what that field holds.">
          <LayoutLab />
        </Try>
        <GoDeeper title="Tune the field sizes">
          <p>
            The book notes that field widths can be tuned: a long-lived system with little traffic can move bits from the sequence to the timestamp. The
            total is fixed at 64, so every width is a trade. This is a sandbox; the next lessons keep the book layout.
          </p>
          <BitTuner />
        </GoDeeper>
        <GoDeeper title="All five designs side by side">
          <Scorecard />
        </GoDeeper>
        <Check persistKey="chapter7:quiz:layout" questions={Q.layout} />
      </>
    ),
  },
  {
    id: 'generate',
    title: 'Generating Snowflake IDs',
    goal: 'Within one millisecond the sequence counts from 0 to 4,095. Request 4,097 must wait for the next millisecond.',
    content: (
      <>
        <Explain>
          <p>For each request, the machine reads its clock:</p>
          <ul>
            <li>A new millisecond: sequence starts at 0.</li>
            <li>The same millisecond as the last ID: sequence + 1.</li>
            <li>Sequence already at 4,095: wait until the clock ticks to the next millisecond, then start at 0.</li>
          </ul>
          <p>12 bits give 4,096 IDs per millisecond per machine, over 4 million per second, far above the 10,000 required.</p>
        </Explain>
        <Try
          task={
            <>
              Leave the slider at 5,000 and press <strong>Fire</strong>. The first millisecond fills at 4,096 and the rest spill into the next one. Then open{' '}
              <strong>Change the settings</strong>, pick <strong>Wrap to 0 (bug)</strong> and fire again.
            </>
          }
        >
          <BurstLab />
        </Try>
        <GoDeeper title="The generator in code">
          <pre className="rounded-lg bg-slate-900 text-slate-100 p-3 text-xs overflow-x-auto">
{`ts = now()
if ts == lastTs:
    seq = (seq + 1) & 4095
    if seq == 0:              # 4,096 used this ms
        ts = waitUntilAfter(lastTs)
else:
    seq = 0
lastTs = ts
return (ts - epoch) << 22 | dc << 17 | machine << 12 | seq`}
          </pre>
        </GoDeeper>
        <Check persistKey="chapter7:quiz:generate" questions={Q.generate} />
      </>
    ),
  },
  {
    id: 'clocks',
    title: 'Clock problems',
    goal: 'Snowflake assumes clocks only move forward. When one jumps back, a machine can rebuild IDs it already issued.',
    content: (
      <>
        <Explain>
          <p>
            Servers keep their clocks in line with{' '}
            <Term term="NTP">Network Time Protocol: servers regularly sync their clocks with reference time servers. A correction can move a clock backwards.</Term>
            . When a correction moves a clock <strong>backwards</strong>, the machine revisits milliseconds it has already used. The sequence restarts at 0,
            so it builds the same IDs again.
          </p>
          <p>A generator must notice that the clock is behind the last timestamp it used, and do one of four things: ignore it, reject, wait, or switch to a spare machine ID.</p>
        </Explain>
        <ClockSection
          task={
            <>
              Start on <strong>Ignore</strong> and count the red cells after the jump. Then switch to <strong>Reject</strong>, <strong>Wait</strong> and{' '}
              <strong>Backup ID</strong> and compare what each one costs.
            </>
          }
        />
        <Check persistKey="chapter7:quiz:clocks" questions={Q.clock} />
      </>
    ),
  },
  {
    id: 'decode',
    title: 'Decode an ID',
    goal: 'Because each field sits at a fixed position, shifting and masking an ID tells you when, where and in what order it was made.',
    content: (
      <>
        <Explain>
          <p>
            Reading a Snowflake ID is the build step run backwards. Shift right to drop the lower fields, mask to keep only the bits you want, and add the
            epoch back to the timestamp.
          </p>
        </Explain>
        <Try task={<>Tap each of the first four IDs. They were made about a minute apart on different workers: compare their timestamps and datacenters. Then press <strong>Make a new ID now</strong>.</>}>
          <DecodeLab />
        </Try>
        <GoDeeper title="Wrap-up: follow-ups the book suggests">
          <ul>
            <li>
              <strong>Clock synchronization:</strong> the design assumes all ID servers share one clock. NTP is the usual fix, and the last lesson showed what
              happens when it moves a clock back.
            </li>
            <li>
              <strong>Section length tuning:</strong> fewer sequence bits and more timestamp bits suit long-lived, low-traffic systems.
            </li>
            <li>
              <strong>High availability:</strong> an ID generator is mission-critical, so it must stay up.
            </li>
          </ul>
        </GoDeeper>
        <Check persistKey="chapter7:quiz:decode" questions={Q.decode} />
      </>
    ),
  },
];

export const Chapter7IdGenerator: React.FC<Chapter7IdGeneratorProps> = () => <ChapterPlayer chapterId="chapter7" lessons={LESSONS} />;
