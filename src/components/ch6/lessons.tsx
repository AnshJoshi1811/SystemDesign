import React from 'react';
import { Term, WhatChanged } from '../learn/LearningKit';
import type { Lesson } from '../lesson/ChapterPlayer';
import { Explain, Try, Check, GoDeeper, Callout } from '../lesson/blocks';
import {
  SingleServerLab,
  CapLab,
  RingLab,
  QuorumLab,
  StaleReadLab,
  VectorClockLab,
  GossipLab,
  HintedHandoffLab,
  MerkleLab,
  WritePathLab,
  ReadPathLab,
  QUORUM_KEY,
  MERKLE_REPLICAS,
} from './labs';

export const LESSONS: Lesson[] = [
  {
    id: 'single',
    title: 'A key-value store on one server',
    goal: 'The simplest key-value store is a hash table in one server’s memory. It is fast, but one machine caps both its size and its uptime.',
    content: (
      <>
        <Explain>
          <p>
            A key-value store has two operations: <code>put(key, value)</code> and <code>get(key)</code>. The easiest version keeps every pair in an in-memory
            hash table on one server. Lookups are a single memory access.
          </p>
          <p>
            Two limits show up quickly. Memory runs out, and when the server crashes every client fails. Compressing values or moving rarely used data to disk buys
            time, but does not remove either limit.
          </p>
        </Explain>
        <Try task={<>Press <strong>Add a key</strong> until memory is full. Then press <strong>Crash the server</strong> and try <strong>Get user:101</strong>.</>}>
          <SingleServerLab />
        </Try>
        <Callout tone="idea">Everything else in this chapter is about spreading data over many servers without losing correctness.</Callout>
        <Check
          persistKey="chapter6:quiz:single"
          questions={[
            {
              question: 'Your single-server store is at 95% memory. Which option actually removes the capacity ceiling?',
              options: [
                { text: 'Compress the values', why: 'A valid optimization, but data keeps growing, so it only delays the limit.' },
                { text: 'Buy a bigger server', why: 'That raises the ceiling once. There is a largest machine you can buy, and it is still one point of failure.' },
                { text: 'Distribute the key-value pairs across many servers', correct: true, why: 'Only spreading data over many machines lets capacity grow with the number of servers.' },
              ],
            },
          ]}
        />
      </>
    ),
  },
  {
    id: 'cap',
    title: 'CAP theorem',
    goal: 'When the network between replicas breaks, a distributed store must choose: refuse requests (CP) or answer with possibly stale data (AP).',
    content: (
      <>
        <Explain>
          <p>
            The <Term term="CAP theorem">A distributed system cannot provide consistency, availability and partition tolerance all at once.</Term> names three
            properties:
          </p>
          <ul>
            <li><strong>Consistency:</strong> every client sees the same data, whichever node it asks.</li>
            <li><strong>Availability:</strong> every request gets an answer, even if some nodes are down.</li>
            <li><strong>Partition tolerance:</strong> the system keeps working when the network between nodes breaks.</li>
          </ul>
          <p>
            Real networks do break, so partition tolerance is not optional. The real choice is what to give up while a partition lasts: consistency or
            availability.
          </p>
        </Explain>
        <Try
          task={
            <>
              Press <strong>Cut the link to n3</strong>, then <strong>Write via n1</strong> in CP mode: it is rejected. Switch to AP and write again: it is
              accepted, and n3 turns stale.
            </>
          }
        >
          <CapLab />
        </Try>
        <Callout tone="idea" title="Which to pick">
          A bank balance wants CP: an error beats a wrong number. A shopping cart wants AP: a briefly stale cart beats “service unavailable”.
        </Callout>
        <GoDeeper title="Writing on both sides of a partition">
          <p>
            In AP mode, write via n1 and via n3 while the link is cut, then heal it. Both sides changed, so the replicas conflict and one write must be thrown away,
            unless versions carry enough history to merge them. That is what vector clocks add in lesson 7.
          </p>
        </GoDeeper>
        <Check
          persistKey="chapter6:quiz:cap"
          questions={[
            {
              question: 'A partition isolates n3. In a CP store, what happens to a write sent to n1?',
              options: [
                { text: 'It is blocked and the client gets an error until the partition heals', correct: true, why: 'CP keeps replicas identical by refusing writes that cannot reach them, which makes the system unavailable for that write.' },
                { text: 'It succeeds on n1 and n2, and n3 catches up later', why: 'That is the AP behaviour: accept now, sync after the partition heals.' },
                { text: 'It is redirected to n3', why: 'n3 is the isolated node; nothing can reach it.' },
              ],
            },
            {
              question: 'Why can’t a real distributed key-value store be CA?',
              options: [
                { text: 'Network partitions happen anyway, so the system must tolerate them', correct: true, why: 'CA assumes the network never fails. Since it does, you must tolerate partitions and pick C or A.' },
                { text: 'Consistency and availability mean the same thing', why: 'They are different guarantees: the same data everywhere vs. always getting a response.' },
                { text: 'CA systems are too slow', why: 'Speed is not the issue. CA is impossible as soon as a partition occurs.' },
              ],
            },
          ]}
        />
      </>
    ),
  },
  {
    id: 'partition',
    title: 'Partitioning data on a ring',
    goal: 'Consistent hashing decides which server stores each key: walk clockwise from the key’s hash to the first server.',
    content: (
      <>
        <Explain>
          <p>
            The data no longer fits on one machine, so it is split across five servers using consistent hashing from Chapter 5. Servers sit at points on a hash
            ring; each appears twice as{' '}
            <Term term="virtual node">One of several ring positions owned by the same physical server. More positions means a bigger share of the keys.</Term>. A
            key is hashed onto the ring and stored on the first server found walking clockwise.
          </p>
          <p>When a server joins or leaves, only the keys next to it move.</p>
        </Explain>
        <Try task="Tap different keys (on the ring or in the list) and watch which server each lands on.">
          <RingLab />
        </Try>
        <Callout tone="warning">Right now each key has exactly one home, so a single crash still makes that key unavailable.</Callout>
        <Check
          persistKey="chapter6:quiz:partition"
          questions={[
            {
              question: 'A key hashes to 100°. The next positions clockwise are 130° (s2) and 170° (s3); the previous one is 95° (s1). Where is the key stored?',
              options: [
                { text: 's2', correct: true, why: 'Lookup walks clockwise from the key and stops at the first server position: 130° belongs to s2.' },
                { text: 's1, because 95° is the closest position', why: 'Distance does not matter; lookup only walks clockwise, and 95° is behind the key.' },
                { text: 's3', why: 's3 would only be reached if s2 were skipped; the first position clockwise wins.' },
              ],
            },
          ]}
        />
      </>
    ),
  },
  {
    id: 'replication',
    title: 'Replication',
    goal: 'Each key is copied to the first N distinct servers clockwise from it, its preference list.',
    content: (
      <>
        <Explain>
          <p>
            To survive crashes, each key is stored on <strong>N</strong> servers. Keep walking clockwise past the first server and take the next ones, until you
            have N <em>different</em> machines. That ordered list is the key’s{' '}
            <Term term="preference list">The ordered list of N servers responsible for a key. It depends only on the key’s ring position and N, not on which servers are up.</Term>.
          </p>
          <p>
            Because every server has two ring positions, the walk can hit a server it already picked. That position is skipped, or two “copies” would sit on the
            same machine.
          </p>
        </Explain>
        <Try task="Pick a key and move the N slider. The highlighted positions are its replicas, in order. Try user:101 at N = 3 and look for a skipped position.">
          <RingLab replication />
        </Try>
        <WhatChanged
          before="Each key on the first server clockwise."
          after="Each key on N distinct servers: its preference list."
          reason="N copies on N machines survive N − 1 crashes."
        />
        <GoDeeper title="Replicas across data centers">
          <p>
            Servers s0 to s2 are in one data center and s3, s4 in another. Real systems place replicas in several data centers, linked by fast networks, so a whole
            data center going dark does not lose a key.
          </p>
        </GoDeeper>
        <Check
          persistKey="chapter6:quiz:replication"
          questions={[
            {
              question: 'N = 3, key at 40°. Positions clockwise: 55° s1, 95° s1, 130° s2, 170° s3. Which servers hold the replicas?',
              options: [
                { text: 's1, s2, s3', correct: true, why: 'Take s1 at 55°, skip 95° because s1 is already chosen, then take s2 and s3.' },
                { text: 's1, s1, s2', why: 'Two copies on one machine: a single crash would lose both. Only distinct servers count.' },
                { text: 's0, s1, s2 (the three lowest ring positions)', why: 'Placement starts at the key’s position, not at 0°.' },
              ],
            },
          ]}
        />
      </>
    ),
  },
  {
    id: 'quorum',
    title: 'Quorum: N, W and R',
    goal: 'A write succeeds after W replicas acknowledge it, a read waits for R replies, and W + R > N makes every read see the latest write.',
    content: (
      <>
        <Explain>
          <p>
            A <Term term="coordinator">The node that relays one request between the client and the key’s replicas.</Term> sends each request to all N replicas,
            then waits:
          </p>
          <ul>
            <li><strong>W</strong>: acks a write needs before it counts as successful.</li>
            <li><strong>R</strong>: replies a read waits for before answering.</li>
          </ul>
          <p>
            W and R count answers, not copies: every replica still gets the write. If <strong>W + R &gt; N</strong>, the replicas that acked the write and the
            replicas that answer the read must share at least one, so the read sees the new value. The usual setting is N = 3, W = R = 2.
          </p>
        </Explain>
        <Try
          task={
            <>
              With W = 2, press <strong>Put a new value</strong>: 2 acks, success. Now click two replica boxes to crash them and put again: only 1 ack is
              possible, so the write fails.
            </>
          }
        >
          <QuorumLab />
        </Try>
        <Callout tone="idea" title="Tuning">
          R = 1, W = N gives fast reads. W = 1, R = N gives fast writes. Smaller W or R answers sooner; larger is more consistent.
        </Callout>
        <GoDeeper title="Read repair">
          <p>
            When a read finds a replica with an older version, the coordinator writes the newest version back to it. Crash a replica, put a value, recover it, then
            get: the box shows “stale, repaired”.
          </p>
        </GoDeeper>
        <Check
          persistKey="chapter6:quiz:quorum"
          questions={[
            {
              question: 'N = 3, W = 2. Two of the key’s three replicas are down. What happens to a put?',
              options: [
                { text: 'It fails: only 1 ack is possible and W = 2', correct: true, why: 'The preference list is fixed; with two replicas down, only one can acknowledge, which is below W.' },
                { text: 'It succeeds because one replica stored it', why: 'One ack is below W, so the coordinator reports failure.' },
                { text: 'It succeeds after two other healthy servers take the write', why: 'That is sloppy quorum (lesson 9). A strict quorum only counts the preference list.' },
              ],
            },
            {
              question: 'Which setting is optimized for fast reads?',
              options: [
                { text: 'R = 1, W = N', correct: true, why: 'A read waits for one reply, and W = N makes every replica current, so the fast read is still consistent.' },
                { text: 'W = 1, R = N', why: 'That is optimized for fast writes; reads wait for every replica.' },
                { text: 'W = 1, R = 1', why: 'Both are fast, but W + R ≤ N, so stale reads are possible.' },
              ],
            },
          ]}
        />
      </>
    ),
  },
  {
    id: 'consistency',
    title: 'Consistency models',
    goal: 'Strong, weak and eventual consistency describe how fresh a read is guaranteed to be.',
    content: (
      <>
        <Explain>
          <ul>
            <li><strong>Strong consistency:</strong> a read always returns the latest write.</li>
            <li><strong>Weak consistency:</strong> a read may not see the latest write.</li>
            <li>
              <strong>Eventual consistency:</strong> a kind of weak consistency. Given enough time, every replica catches up.
            </li>
          </ul>
          <p>
            Replicas beyond the first W get their copy in the background, a few seconds later. With W + R ≤ N a read can land entirely on replicas that have not
            caught up yet. Dynamo and Cassandra choose eventual consistency and accept this window.
          </p>
        </Explain>
        <Try
          task={
            <>
              With W = 1, R = 1, press <strong>Put a new value</strong> and then <strong>Read right away</strong>: stale. Wait for the copies to land and read
              again. Then switch to W = 2, R = 2 and repeat.
            </>
          }
        >
          <StaleReadLab />
        </Try>
        <Check
          persistKey="chapter6:quiz:consistency"
          questions={[
            {
              question: 'N = 3, W = 1, R = 1. A write returns, then a read follows immediately. Why can the read return the old value?',
              options: [
                { text: 'The read may hit a replica the write has not reached yet: 1 + 1 ≤ 3, so the sets need not overlap', correct: true, why: 'With W + R ≤ N the replica that acked and the replica you read can be different ones.' },
                { text: 'Because W = 1 means the data is stored on only one server', why: 'The data still goes to all N replicas; the coordinator just stops waiting after one ack.' },
                { text: 'It can’t: quorums always return the latest value', why: 'Only W + R > N guarantees that.' },
              ],
            },
          ]}
        />
      </>
    ),
  },
  {
    id: 'versioning',
    title: 'Versioning and vector clocks',
    goal: 'A vector clock records which writes a version has seen, so the store can tell a newer version from a conflicting one.',
    content: (
      <>
        <Explain>
          <p>
            With eventual consistency, two servers can accept writes to the same key at the same time. Wall clocks drift, so “latest timestamp wins” can silently
            drop an update.
          </p>
          <p>
            Instead, each version carries a{' '}
            <Term term="vector clock">A list of [server, counter] pairs, written D([S1, v1], [S2, v2], …).</Term>. The server handling a write bumps its own
            counter. If every counter in Y is at least the one in X, Y descends from X and replaces it. Otherwise the two are <strong>siblings</strong>: keep both,
            and let the client merge them.
          </p>
        </Explain>
        <Try task={<>Press <strong>Next step</strong> four times to build D1 to D4, the book’s example. Read why D3 and D4 conflict, then press <strong>Reconcile via Sx</strong>.</>}>
          <VectorClockLab />
        </Try>
        <GoDeeper title="The downsides">
          <ul>
            <li>The client must implement the merge, which adds complexity.</li>
            <li>Clocks grow with every server that handles a write. Systems cap the length and drop the oldest pairs, which works well in practice.</li>
          </ul>
        </GoDeeper>
        <Check
          persistKey="chapter6:quiz:versioning"
          questions={[
            {
              question: 'D([Sx,2], [Sy,1]) vs D([Sx,2], [Sz,1]). What is the relationship?',
              options: [
                { text: 'Siblings (conflict)', correct: true, why: 'The first has Sy:1 the second lacks, and the second has Sz:1 the first lacks. Neither descends from the other.' },
                { text: 'The second is newer because z comes after y', why: 'Server names carry no order; only counters matter.' },
                { text: 'The first is newer because it was written first', why: 'Vector clocks ignore wall-clock order; that is what makes them safe with drifting clocks.' },
              ],
            },
            {
              question: 'A client merges D([Sx,2], [Sy,1]) and D([Sx,2], [Sz,1]) and writes through Sx. What is the new clock?',
              options: [
                { text: 'D([Sx,3], [Sy,1], [Sz,1])', correct: true, why: 'Take the larger counter from each clock, then bump the handling server (Sx: 2 → 3).' },
                { text: 'D([Sx,3])', why: 'Dropping Sy and Sz loses history, and later comparisons would see false conflicts.' },
                { text: 'D([Sx,2], [Sy,1], [Sz,1])', why: 'Every write bumps the handling server’s counter; skipping it makes different writes look the same.' },
              ],
            },
          ]}
        />
      </>
    ),
  },
  {
    id: 'gossip',
    title: 'Detecting failures with gossip',
    goal: 'Servers learn that another server is down by watching its heartbeat counter stop increasing, shared through gossip.',
    content: (
      <>
        <Explain>
          <p>
            Every server pinging every other server costs about n² messages per round. With a{' '}
            <Term term="gossip protocol">Each node periodically shares its membership list with a few random nodes, which pass it on.</Term> instead:
          </p>
          <ul>
            <li>Each server keeps a membership list: every member’s heartbeat counter.</li>
            <li>It bumps its own counter and sends the list to a few random servers.</li>
            <li>A member whose counter has not gone up for a while is marked offline.</li>
          </ul>
          <p>One missed message is not enough: the stalled counter has to be confirmed through gossip from other servers.</p>
        </Explain>
        <Try task={<>Press <strong>Crash s2</strong> and watch its row in s0’s list: the counter freezes, it becomes suspect, then offline. Recover it and it turns alive again.</>}>
          <GossipLab />
        </Try>
        <GoDeeper title="The numbers for 1,000 servers">
          <p>
            All-to-all heartbeats: 1,000 × 999 ≈ 1 million messages per round. Gossip with a fan-out of 3: about 3,000, and news of a stalled counter still reaches
            everyone within a few rounds.
          </p>
        </GoDeeper>
        <Check
          persistKey="chapter6:quiz:gossip"
          questions={[
            {
              question: 'In gossip-based failure detection, when is a member considered offline?',
              options: [
                { text: 'When its heartbeat counter has not increased for longer than a set period', correct: true, why: 'A stalled counter, spread by gossip and confirmed by others, marks the member offline.' },
                { text: 'As soon as one node fails to reach it once', why: 'One source is not enough; a single missed message can be a network blip.' },
                { text: 'When a central monitoring server says so', why: 'Gossip is decentralized precisely to avoid a monitor that could itself fail.' },
              ],
            },
          ]}
        />
      </>
    ),
  },
  {
    id: 'hinted',
    title: 'Temporary failures: sloppy quorum',
    goal: 'When a replica is briefly down, the next healthy server takes its writes and hands them back later.',
    content: (
      <>
        <Explain>
          <p>
            Under a strict quorum, a crashed replica can make writes fail. A{' '}
            <Term term="sloppy quorum">Use the first W healthy servers walking clockwise, skipping down ones, instead of only the preference list.</Term> keeps
            writes available: the next healthy server clockwise stands in and stores the write with a note saying who it is really for.
          </p>
          <p>
            When the owner recovers, the stand-in sends the data back and deletes its note. This is{' '}
            <Term term="hinted handoff">A stand-in keeps writes meant for a down replica and hands them back when it recovers.</Term>.
          </p>
        </Explain>
        <Try
          task={
            <>
              Crash two of the three replicas of {QUORUM_KEY} and press <strong>Put a new value</strong>: strict quorum rejects it. Switch to{' '}
              <strong>Sloppy quorum</strong> and put again: stand-ins take hints. Then recover the replicas and watch the hints go home.
            </>
          }
        >
          <HintedHandoffLab />
        </Try>
        <Callout tone="warning" title="The price">
          Writes and reads may land on different stand-ins, so W + R &gt; N no longer guarantees a fresh read while sloppy quorum is in use.
        </Callout>
        <Check
          persistKey="chapter6:quiz:hinted"
          questions={[
            {
              question: 'Sloppy quorum on, N = 3, W = 2. Two of the key’s three replicas are down. What happens to a put?',
              options: [
                { text: 'The next healthy servers on the ring take the write with hints, it reaches W and succeeds', correct: true, why: 'Sloppy quorum still needs W acks, but lets healthy servers outside the preference list provide them.' },
                { text: 'It fails', why: 'That is the strict-quorum behaviour this lesson relaxes.' },
                { text: 'It succeeds with just the one healthy replica’s ack', why: 'Sloppy quorum still requires W acks; it only changes who may give them.' },
              ],
            },
          ]}
        />
      </>
    ),
  },
  {
    id: 'merkle',
    title: 'Permanent failures: Merkle trees',
    goal: 'Two replicas compare hash trees to find the few buckets that differ, and sync only those.',
    content: (
      <>
        <Explain>
          <p>
            Hints cover short outages. If a replica loses its disk, it has to be rebuilt from another replica. Comparing every key would move the whole data set.
          </p>
          <p>
            Instead, each replica splits its keys into buckets and builds a{' '}
            <Term term="Merkle tree">A tree in which each parent is the hash of its children. Equal roots mean equal data.</Term>: one hash per bucket, then hashes
            of hashes up to a root. Compare the roots; if they differ, go down only into children that differ. Syncing the differing buckets is called{' '}
            <Term term="anti-entropy">A background process that compares replicas and updates each to the newest version.</Term>.
          </p>
        </Explain>
        <Try
          task={
            <>
              Press <strong>{MERKLE_REPLICAS[1]} misses a write</strong> and see which hashes turn red: only one path. Press <strong>Sync differing buckets</strong>.
              Then try <strong>Wipe {MERKLE_REPLICAS[1]}’s disk</strong>.
            </>
          }
        >
          <MerkleLab />
        </Try>
        <Callout tone="idea">The data moved is proportional to what differs, not to the data size.</Callout>
        <GoDeeper title="Real bucket sizes">
          <p>The book’s example: 1 billion keys in 1 million buckets, about 1,000 keys per bucket. A single wrong key costs one bucket of transfer.</p>
        </GoDeeper>
        <Check
          persistKey="chapter6:quiz:merkle"
          questions={[
            {
              question: 'Roots differ; the left children match and the right children differ. What next?',
              options: [
                { text: 'Descend only into the right subtree', correct: true, why: 'A matching left hash proves every bucket under it is identical.' },
                { text: 'Transfer all keys', why: 'That throws away the whole benefit of the tree.' },
                { text: 'Stop: the data is consistent', why: 'Differing roots prove something below differs.' },
              ],
            },
          ]}
        />
      </>
    ),
  },
  {
    id: 'write-path',
    title: 'The write path',
    goal: 'Inside one node, a write goes to a commit log on disk, then to a memory table, and is flushed to a sorted file when that fills.',
    content: (
      <>
        <Explain>
          <p>So far we looked between nodes. Inside one node (the book follows Cassandra), a write takes three steps:</p>
          <ol>
            <li>
              Append it to the <Term term="commit log">An append-only file on disk. Every write lands here first so it survives a crash.</Term>.
            </li>
            <li>
              Put it in the <Term term="memtable">An in-memory table of recent writes.</Term>.
            </li>
            <li>
              When the memtable is full, flush it to disk as an{' '}
              <Term term="SSTable">Sorted-string table: an immutable, sorted list of key-value pairs on disk.</Term>.
            </li>
          </ol>
          <p>Appending to a log is fast and durable; the memtable makes the write fast; SSTables keep data compact on disk.</p>
        </Explain>
        <Try task={<>Press <strong>Write</strong> twice, then <strong>Crash and restart</strong>: the memtable comes back from the log. Write until the memtable flushes to an SSTable.</>}>
          <WritePathLab />
        </Try>
        <Check
          persistKey="chapter6:quiz:write-path"
          questions={[
            {
              question: 'A node crashes with 2 unflushed keys in its memtable. How are they recovered?',
              options: [
                { text: 'By replaying the commit log on restart', correct: true, why: 'Every write hit the commit log before the memtable, so the log can rebuild it.' },
                { text: 'From the SSTables', why: 'Those keys were never flushed, so no SSTable has them.' },
                { text: 'They are lost', why: 'That is exactly what the commit log prevents.' },
              ],
            },
          ]}
        />
      </>
    ),
  },
  {
    id: 'read-path',
    title: 'The read path',
    goal: 'A read checks memory first, then uses a bloom filter per SSTable to skip files that cannot hold the key.',
    content: (
      <>
        <Explain>
          <p>
            A read first checks the memtable. If the key is not there, it may be in any SSTable, and reading every file from disk is slow.
          </p>
          <p>
            Each SSTable has a <Term term="bloom filter">A small bit array. A key sets a few bits; if any of its bits is 0, the key is definitely not in the file.</Term>.
            If any of the key’s bits is 0, the file is skipped. If all are 1, the key is <em>maybe</em> there, so the node reads the file.
          </p>
        </Explain>
        <Try task="Tap each key. Watch which SSTables are skipped, which are read, and spot a false positive (read, but not there).">
          <ReadPathLab />
        </Try>
        <Callout tone="idea">
          The commit log makes writes durable, the memtable makes them fast, and bloom filters let reads skip files. Across nodes, the ring, quorums, vector clocks,
          hints and Merkle trees keep the whole store available and correct.
        </Callout>
        <Check
          persistKey="chapter6:quiz:read-path"
          questions={[
            {
              question: 'A bloom filter says “maybe” for SST-1. What does that mean?',
              options: [
                { text: 'The key might be there; read the SSTable to find out', correct: true, why: 'Bloom filters can give false positives but never false negatives.' },
                { text: 'The key is definitely there', why: 'Other keys may have set the same bits, so “maybe” is not a guarantee.' },
                { text: 'The key is definitely not there', why: 'That is what a 0 bit means.' },
              ],
            },
          ]}
        />
      </>
    ),
  },
];
