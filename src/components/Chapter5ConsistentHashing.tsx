import React from 'react';
import { Term } from './learn/LearningKit';
import { ChapterPlayer, Lesson } from './lesson/ChapterPlayer';
import { Explain, Try, Check, GoDeeper, Callout } from './lesson/blocks';
import { HashLab, ModuloLab, RingIntroLab, LookupLab, MembershipLab, HotspotLab, VNodeLab } from './ch5/Labs';

const LESSONS: Lesson[] = [
  {
    id: 'hash',
    title: 'Hashing a key',
    goal: 'A hash function turns any key into a fixed-size number, and the same key always gives the same number.',
    content: (
      <>
        <Explain>
          <p>
            Before we can spread data over servers, we need a way to turn a key such as <code>User123</code> into a number. A{' '}
            <Term term="hash function">A function that maps any input to a fixed-size number. Good ones spread similar inputs far apart.</Term> does
            exactly that. Here it produces a 32-bit number, somewhere from 0 to 2³² − 1 (about 4.3 billion values).
          </p>
          <p>Two properties matter:</p>
          <ul>
            <li>
              <strong>Deterministic.</strong> The same key gives the same number on every machine, every time. So every client can work out where a key
              lives without asking anyone.
            </li>
            <li>
              <strong>Well spread.</strong> Similar keys land far apart, so data does not bunch up.
            </li>
          </ul>
        </Explain>
        <Try task={<>Press <strong>User123</strong>, then <strong>User124</strong>. One character changed, but the indigo dot jumps somewhere else. Press <strong>User123</strong> again: the same number as before.</>}>
          <HashLab />
        </Try>
        <Check
          persistKey="chapter5:quiz:hash"
          questions={[
            {
              question: 'Why must the hash function be deterministic for sharding to work?',
              options: [
                { text: 'So every client computes the same server for the same key without coordinating', correct: true, why: 'Routing works only because hash("User123") is the same on every machine, every time.' },
                { text: 'So that hash values are evenly spread', why: 'Even spread is a separate property. A deterministic hash can still be badly skewed.' },
                { text: 'So that the hash value can be reversed back into the key', why: 'Sharding never needs to reverse a hash. It only needs a stable number to pick a server.' },
              ],
            },
          ]}
        />
      </>
    ),
  },
  {
    id: 'modulo',
    title: 'Modulo sharding',
    goal: 'The simplest way to spread keys over N servers is server = hash(key) % N.',
    content: (
      <>
        <Explain>
          <p>
            With 4 servers numbered 0 to 3, take the key's hash and divide by 4. The remainder, 0 to 3, is the server. That is{' '}
            <code>hash(key) % 4</code>.
          </p>
          <p>
            It is fast, needs no lookup table, and spreads keys fairly evenly as long as the number of servers never changes. Hold on to that last
            condition.
          </p>
        </Explain>
        <Try task={<>Tap any numbered key. The note below shows its hash, the remainder after dividing by 4, and the server that remainder picks.</>}>
          <ModuloLab />
        </Try>
        <Check
          persistKey="chapter5:quiz:modulo"
          questions={[
            {
              question: 'A key hashes to 1,000,003 and there are 4 servers. Which server stores it?',
              options: [
                { text: 'Server 3', correct: true, why: '1,000,003 = 4 × 250,000 + 3, so the remainder is 3.' },
                { text: 'Server 0', why: 'That would need the hash to divide evenly by 4. 1,000,000 does, but 1,000,003 leaves 3 over.' },
                { text: 'Server 4', why: 'With 4 servers the remainder can only be 0, 1, 2 or 3. There is no Server 4.' },
              ],
            },
          ]}
        />
      </>
    ),
  },
  {
    id: 'rehash',
    title: 'The rehashing problem',
    goal: 'Changing N by one server makes hash(key) % N give a different answer for most keys.',
    content: (
      <>
        <Explain>
          <p>
            Servers get added when traffic grows and removed when they crash. Either way N changes, and N is part of every key's formula. A key with hash
            10 is on server <code>10 % 4 = 2</code>; with 5 servers it is on <code>10 % 5 = 0</code>.
          </p>
          <p>
            Every key that changes server is a <strong>cache miss</strong> (or data that has to be copied). The book's example: one of 4 cache servers
            goes offline, and most keys are redistributed, not just the ones on the dead server.
          </p>
        </Explain>
        <Try task={<>Press <strong>Add a server</strong> once. Red keys changed server. Read the share that moved, then compare it with the fair share. Press <strong>Reset</strong> and try <strong>Remove a server</strong>.</>}>
          <ModuloLab resizable />
        </Try>
        <Check
          persistKey="chapter5:quiz:rehash"
          questions={[
            {
              question: 'A cache cluster uses server = hash(key) % 4. One server is added (N = 5). Roughly what fraction of keys now map to a different server?',
              options: [
                { text: 'About 80%: most keys move', correct: true, why: 'A key stays put only if hash % 4 and hash % 5 happen to agree, which is true for about 1 in 5 keys.' },
                { text: "About 20%: only the new server's share", why: '20% is what an ideal scheme would move. Modulo moves far more, because the remainder changes for almost every key.' },
                { text: 'None: existing keys keep their server until they expire', why: 'The formula is re-evaluated on every lookup, so clients start asking a different server straight away.' },
              ],
            },
            {
              question: 'Server 1 of 4 crashes and N becomes 3. Which keys are affected?',
              options: [
                { text: 'Most keys, including many that were on healthy servers', correct: true, why: 'The formula changed from % 4 to % 3 for everyone, so keys on servers 0, 2 and 3 also get new homes.' },
                { text: 'Only the keys that were on server 1', why: 'That is what we would like, and it is exactly what consistent hashing achieves. Modulo cannot.' },
                { text: 'No keys: the other servers already hold copies', why: 'Plain modulo sharding keeps each key on one server; there are no copies to fall back on.' },
              ],
            },
          ]}
        />
      </>
    ),
  },
  {
    id: 'ring',
    title: 'The hash ring',
    goal: 'Join the two ends of the hash space into a ring, then place both servers and keys on it by their hash.',
    content: (
      <>
        <Explain>
          <p>
            All possible hash values, 0 to 2³² − 1, form the{' '}
            <Term term="hash space">Every value the hash function can output. For a 32-bit hash that is 0 to 2³² − 1.</Term>. Bend that line round
            until its two ends meet and you get a{' '}
            <Term term="hash ring">The hash space with its ends joined: moving clockwise past 2³² − 1 wraps back to 0.</Term>.
          </p>
          <p>
            Now put two kinds of things on it, using the <strong>same hash function</strong>: servers (hash their name or IP) and keys. Notice what is
            missing: N. No position depends on how many servers there are.
          </p>
        </Explain>
        <Try task={<>Switch between <strong>As a line</strong> and <strong>As a ring</strong>. The same servers and keys stay at the same hash values; the two ends of the line meet at the top.</>}>
          <RingIntroLab />
        </Try>
        <Check
          persistKey="chapter5:quiz:ring"
          questions={[
            {
              question: 'On the hash ring, what comes straight after 2³² − 1 when you move clockwise?',
              options: [
                { text: '0: the ring wraps around', correct: true, why: 'That is the whole point of the ring. Every position has a next position, so there is no end to fall off.' },
                { text: 'Nothing: it is the last value', why: 'On a line it would be. The ring joins the ends so the walk continues at 0.' },
                { text: '2³², a new value', why: 'A 32-bit hash can never produce 2³². The next value clockwise is 0.' },
              ],
            },
          ]}
        />
      </>
    ),
  },
  {
    id: 'lookup',
    title: "Finding a key's server",
    goal: 'A key belongs to the first server you meet walking clockwise from the key.',
    content: (
      <>
        <Explain>
          <p>
            To find where a key lives: start at the key's position and walk clockwise until you hit a server. That server stores the key. If you pass the
            top, keep going; the ring wraps around.
          </p>
          <p>
            So each server owns the arc between itself and the previous server counter-clockwise. On the ring below each arc is drawn in the colour of
            the server that owns it.
          </p>
        </Explain>
        <Try task={<>Tap a key dot (or one of the buttons) and watch the indigo walk. Try the key marked <strong>near the top</strong>: it wraps past 0 before it finds a server. You can also tap anywhere on the ring to drop a new key.</>}>
          <LookupLab />
        </Try>
        <GoDeeper title="How a real router does the walk">
          <p>
            Nobody walks a ring step by step. The server positions are kept in a sorted array; a binary search finds the first position at or after the
            key's hash, and wraps to index 0 if there is none. That is O(log n) per lookup.
          </p>
        </GoDeeper>
        <Check
          persistKey="chapter5:quiz:lookup"
          questions={[
            {
              question: 'A key hashes to 100°. Servers sit at 40°, 150° and 300°. Which server owns the key?',
              options: [
                { text: 'The server at 150°', correct: true, why: 'Walk clockwise (increasing angle) from 100°. The first server you meet is at 150°.' },
                { text: 'The server at 40°', why: '40° is the closest server behind the key. Lookup only walks clockwise.' },
                { text: 'Whichever server is nearest in either direction', why: 'That would be ambiguous at the midpoint. The rule is strictly clockwise, so every key has one owner.' },
              ],
            },
            {
              question: 'A key hashes to 330°. Servers sit at 40°, 150° and 300°. Which server owns it?',
              options: [
                { text: 'The server at 40°, after wrapping past 0°', correct: true, why: 'No server lies between 330° and 360°, so the walk wraps past 0 and reaches 40°.' },
                { text: 'The server at 300°', why: '300° is behind the key. Clockwise from 330° you pass 360° before meeting any server.' },
                { text: 'No server: the key is past the last server', why: 'On a ring there is no past the end. The search wraps around.' },
              ],
            },
          ]}
        />
      </>
    ),
  },
  {
    id: 'membership',
    title: 'Adding or removing a server',
    goal: 'When a server joins or leaves, only the keys in one arc move. On average that is k/n keys, not nearly all of them.',
    content: (
      <>
        <Explain>
          <p>
            <strong>Add a server</strong> and it lands somewhere on the ring. Keys between it and the previous server now meet it first, so they move
            to it. Every other key still meets the same server as before.
          </p>
          <p>
            <strong>Remove a server</strong> and only its keys move, to the next server clockwise.
          </p>
          <p>
            With k keys and n servers, that averages <strong>k/n</strong> keys moved: one server's fair share. Modulo, by contrast, moved most keys.
          </p>
        </Explain>
        <Try task={<>Press <strong>Add Server 4</strong>. Compare the three numbers: what the ring moved, what <code>hash % N</code> would have moved for the same change, and the fair share. Then press <strong>Reset</strong> and <strong>Remove Server 1</strong>.</>}>
          <MembershipLab />
        </Try>
        <Callout tone="warning" title="Why the ring's number is not exactly k/n">
          With one point per server, the new server takes whatever arc it happens to land in, which can be far more or less than its fair share. The
          next two lessons deal with that.
        </Callout>
        <Check
          persistKey="chapter5:quiz:membership"
          questions={[
            {
              question: 'A fifth server is added to a 4-server ring. Which keys move?',
              options: [
                { text: 'Only keys between the new server and the server before it; they move to the new server', correct: true, why: 'Those keys now meet the new server first when walking clockwise. Every other key meets the same server as before.' },
                { text: "About 1/5 of every server's keys, so load stays equal", why: 'On a basic ring the new server takes keys from only one neighbour, which is why load can end up uneven.' },
                { text: 'Most keys, like with hash % N', why: "The ring never uses N in a key's address, so adding a server only affects the arc it lands in." },
              ],
            },
          ]}
        />
      </>
    ),
  },
  {
    id: 'hotspots',
    title: 'Uneven partitions and hotspots',
    goal: 'With one point per server, the arcs are random sizes, so some servers get far more keys than others.',
    content: (
      <>
        <Explain>
          <p>
            Servers are placed by hash, so their positions are effectively random. A handful of random points almost never splits a circle evenly. The
            book names two problems:
          </p>
          <ul>
            <li>
              <strong>Uneven partitions.</strong> One server can own a huge arc while another owns a sliver, and the gaps change again whenever a server
              is added or removed.
            </li>
            <li>
              <strong>Uneven keys.</strong> The server with the biggest arc gets the most keys and becomes a{' '}
              <Term term="hotspot">A server that gets far more keys or traffic than the average, so it overloads first.</Term>.
            </li>
          </ul>
        </Explain>
        <Try task={<>Read the bars: one server owns most of the ring. Drag server dots around the ring until the bars roughly match the dashed line. Then imagine redoing that by hand every time a server joins or fails.</>}>
          <HotspotLab />
        </Try>
        <GoDeeper title="Hot keys are a different problem">
          <p>
            Even with perfectly equal arcs, one very popular key (a celebrity's profile, say) can overload the server that stores it. Balancing arcs
            does not help there; caching or splitting that key does.
          </p>
        </GoDeeper>
        <Check
          persistKey="chapter5:quiz:hotspots"
          questions={[
            {
              question: 'Why does a ring with one point per server usually give uneven load?',
              options: [
                { text: 'Server positions are random, so the gaps between them are random sizes', correct: true, why: 'A server owns the arc back to its counter-clockwise neighbour. A few random points almost never split a circle evenly.' },
                { text: 'The hash function puts more keys near 0°', why: 'A good hash spreads keys evenly. The unevenness comes from the few server points, not the keys.' },
                { text: 'Clockwise lookup favours servers near the top of the ring', why: 'Direction favours no position. The server with the widest arc before it gets the most keys, wherever it sits.' },
              ],
            },
          ]}
        />
      </>
    ),
  },
  {
    id: 'vnodes',
    title: 'Virtual nodes',
    goal: 'Give each server many points on the ring. Its share becomes the sum of many small arcs, which evens out load.',
    content: (
      <>
        <Explain>
          <p>
            Instead of one position, each server gets many{' '}
            <Term term="virtual nodes">Extra ring positions for the same server (S0#vn-0, S0#vn-1, ...). A key that lands on any of them is stored on that server.</Term>
            , also called tokens. Lookup is unchanged: walk clockwise to the first token, and the key goes to that token's server.
          </p>
          <p>
            One random arc can be huge or tiny. The sum of 100 random arcs is close to average. The book reports the spread of load (standard
            deviation) at about <strong>10% of the mean with 100 virtual nodes</strong> and about <strong>5% with 200</strong>.
          </p>
        </Explain>
        <Try task={<>Drag the slider from 1 to about 100. Watch the bars close in on the dashed line and the spread fall. Then look at <strong>Moved if one joins</strong>: it settles near the fair share.</>}>
          <VNodeLab />
        </Try>
        <Callout tone="idea" title="Your numbers will not match the book exactly">
          One ring is one random draw. Theory says the spread is roughly 100/√V percent (about 10% at 100, 7% at 200), and a single ring lands a
          few points either side. The trend is what matters.
        </Callout>
        <GoDeeper title="What virtual nodes cost">
          <p>
            Each token is one more entry in the token-to-server map that every router must store and search. Lookup stays a binary search, so it is
            still fast, but the map grows with servers × tokens. Systems tune the token count to balance even load against that overhead.
          </p>
          <p>
            A bonus: when a server with many tokens fails, its load is spread over many other servers instead of dumped on one neighbour.
          </p>
        </GoDeeper>
        <Check
          persistKey="chapter5:quiz:vnodes"
          questions={[
            {
              question: 'The book cites a spread of about 10% of the mean with 100 virtual nodes per server. What happens at 200?',
              options: [
                { text: 'It drops to about 5%: more tokens average out the random arcs', correct: true, why: "Each server's share is the sum of many small random arcs, so the relative spread shrinks as tokens grow." },
                { text: 'It stays at 10%: beyond 100 nothing changes', why: 'Spread keeps shrinking as tokens increase (roughly like 1/√V); the gains just get smaller.' },
                { text: 'It reaches 0%: perfectly even', why: 'Positions are still random, so some spread always remains.' },
              ],
            },
            {
              question: 'What is the main cost of giving each server many virtual nodes?',
              options: [
                { text: 'More metadata: the token-to-server map every router stores and searches grows', correct: true, why: 'The book names this trade-off. Lookup is a binary search, so it stays fast.' },
                { text: 'Each key has to be stored once per virtual node', why: 'Virtual nodes are only positions. A key is still stored once, on the server that owns its arc.' },
                { text: 'Adding a server moves more keys', why: 'The opposite: the new server takes a thin slice from every server, and the total stays close to k/n.' },
              ],
            },
          ]}
        />
      </>
    ),
  },
  {
    id: 'real-world',
    title: 'Real-world uses',
    goal: 'Consistent hashing sits under many databases, caches and load balancers. Know where, and how they tune it.',
    content: (
      <>
        <Explain>
          <p>The book lists these users:</p>
          <ul>
            <li>
              <strong>Amazon Dynamo</strong> (the 2007 paper): partitions data on a ring with virtual nodes. More powerful machines get more tokens, so
              load can match capacity.
            </li>
            <li>
              <strong>Apache Cassandra</strong>: each node owns token ranges set by <code>num_tokens</code>. The default was 256 random tokens; Cassandra
              4.0 lowered it to 16, paired with an algorithm that chooses balanced positions.
            </li>
            <li>
              <strong>Discord</strong>: decides which machine runs each chat server (guild), so adding machines moves only a few guilds.
            </li>
            <li>
              <strong>Akamai CDN</strong>: maps content to cache servers so a server joining or leaving reshuffles only a small share of objects.
            </li>
            <li>
              <strong>Google Maglev</strong>: a network load balancer with its own consistent-hashing variant, so connections keep reaching the same
              backend when backends change.
            </li>
          </ul>
          <p>
            In an interview, the short version is: keys move minimally when servers change, data spreads evenly with virtual nodes, and hot shards are
            easier to avoid.
          </p>
        </Explain>
        <GoDeeper title="Dynamo the paper vs DynamoDB the service">
          <p>
            The managed DynamoDB service is a later system. It also hashes the partition key to pick a partition, but its internals are not the ring
            described in the paper.
          </p>
        </GoDeeper>
        <Check
          persistKey="chapter5:quiz:real-world"
          questions={[
            {
              question: 'Why did Cassandra 4.0 lower its default num_tokens from 256 to 16?',
              options: [
                { text: 'A new token-allocation algorithm picks balanced positions, so far fewer tokens give good balance with less overhead', correct: true, why: 'Random placement needs many tokens to average out. Deliberate placement reaches similar balance with 16, and makes repair and streaming cheaper.' },
                { text: 'Virtual nodes turned out not to help balance', why: 'They do help; you saw it in the previous lesson. The change was about the same balance with fewer, smarter tokens.' },
                { text: 'Clusters became smaller, so fewer tokens were enough', why: 'The motivation was per-token overhead and better placement, not smaller clusters.' },
              ],
            },
            {
              question: 'One machine in your cluster has twice the memory of the others. How can virtual nodes use that?',
              options: [
                { text: 'Give it about twice as many tokens, so it owns about twice the share of the ring', correct: true, why: 'Share of the ring follows token count, which is how Dynamo matches load to capacity.' },
                { text: 'Place its single token at 0°', why: 'Position alone does not set share; the gap before it does, and one token is still one random arc.' },
                { text: 'Nothing: every server must have the same number of tokens', why: 'Nothing in the lookup rule requires that. Unequal token counts are a feature.' },
              ],
            },
          ]}
        />
      </>
    ),
  },
];

/** Chapter 5 as a guided lesson player. `isDarkMode` is accepted for App compatibility; theming uses Tailwind `dark:`. */
export const Chapter5ConsistentHashing: React.FC<{ isDarkMode?: boolean }> = () => <ChapterPlayer chapterId="chapter5" lessons={LESSONS} />;
