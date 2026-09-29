import React from 'react';
import { Check as CheckIcon, X } from 'lucide-react';
import { Term } from './learn/LearningKit';
import { ChapterPlayer, Lesson } from './lesson/ChapterPlayer';
import { Explain, Try, Check, GoDeeper, Callout, Figure } from './lesson/blocks';
import { ClarifyLab, BlueprintLab, DeepDiveLab, TimeBudgetLab, PracticeInterview } from './ch3/Labs';
import { TIME_SPLIT } from './ch3/data';

interface Chapter3FrameworkProps {
  /** Kept for API compatibility with App; theming uses Tailwind `dark:` bound to the app toggle. */
  isDarkMode?: boolean;
}

const FourSteps: React.FC = () => (
  <ol className="grid grid-cols-1 sm:grid-cols-4 gap-3">
    {[
      ['Understand the problem', 'Ask questions; agree on features and scale.'],
      ['High-level design', 'Sketch the blueprint and get buy-in.'],
      ['Deep dive', 'Drill into the parts that matter most.'],
      ['Wrap up', 'Recap, bottlenecks, failures, next scale.'],
    ].map(([t, d], i) => (
      <li key={t} className="rounded-xl bg-slate-50 dark:bg-white/[0.04] p-3">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-600 text-xs font-semibold text-white">{i + 1}</span>
        <p className="mt-2 text-sm font-medium text-slate-900 dark:text-white">{t}</p>
        <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-300">{d}</p>
      </li>
    ))}
  </ol>
);

const DOS = [
  ['Ask for clarification.', 'Don’t assume your assumption is correct.'],
  ['Understand the requirements.', 'A startup’s design differs from one for millions of users.'],
  ['Think out loud.', 'Let the interviewer hear your reasoning.'],
  ['Suggest several approaches,', 'and say what each costs.'],
  ['Design the most critical components first,', 'once the blueprint is agreed.'],
  ['Bounce ideas off the interviewer.', 'A good one works with you like a teammate.'],
  ['Never give up.', ''],
];

const DONTS = [
  ['Jump into a solution', 'before clarifying requirements and assumptions.'],
  ['Go deep on one component early.', 'High-level design first, then drill down.'],
  ['Name-drop technology without a reason.', 'If you say “Kafka”, say what problem it solves here.'],
  ['Think in silence.', 'Communicate throughout.'],
  ['Hesitate to ask for hints', 'when you are stuck.'],
  ['Assume you’re done after the design.', 'You’re done when the interviewer says so.'],
];

const LESSONS: Lesson[] = [
  {
    id: 'measures',
    title: 'What the interview measures',
    goal: 'A system design interview grades how you reach a design, not the final diagram, and a fixed four-step structure keeps that process on track.',
    content: (
      <>
        <Explain>
          <p>
            Nobody expects you to design Google search in an hour. The interview simulates two co-workers working through an open-ended problem. There is
            no single right answer: every decision is a trade-off, and a startup’s design looks different from one for millions of users.
          </p>
          <p>
            What gets graded is how you work: whether you ask good questions, resolve ambiguity, name trade-offs, and respond to feedback. Without a
            structure it is easy to jump into database schemas or run out of time, so the book splits the conversation into four steps.
          </p>
        </Explain>
        <Figure caption="The four steps of the framework, in order. The next four lessons take them one at a time.">
          <FourSteps />
        </Figure>
        <Callout tone="warning" title="The red flag the book singles out">
          <Term term="Over-engineering">Adding complexity the requirements don’t need: extra services, stricter guarantees, more scale than asked.</Term>{' '}
          Engineers love design purity, but every extra piece has real costs. Narrow-mindedness and stubbornness are the other red flags.
        </Callout>
        <Check
          persistKey="chapter3:quiz:intro"
          questions={[
            {
              question: 'Which red flag does the book single out as “a real disease of many engineers”?',
              options: [
                { text: 'Over-engineering: adding complexity the requirements don’t need', correct: true, why: 'Right. Engineers enjoy design purity and ignore trade-offs; in practice those extra pieces carry compounding costs.' },
                { text: 'Not knowing the internals of a specific database', why: 'Knowing internals can help in a deep dive, but the book doesn’t treat it as a red flag. Reasoning about trade-offs matters more.' },
                { text: 'Asking too many clarifying questions', why: 'The opposite: the book says asking good questions is a skill many interviewers specifically look for.' },
              ],
            },
            {
              question: 'If the final design matters less, what is the interviewer mostly evaluating?',
              options: [
                { text: 'How you collaborate, resolve ambiguity, defend choices and respond to feedback', correct: true, why: 'Yes. The session simulates two co-workers solving an open-ended problem together.' },
                { text: 'Whether you can recall well-known architectures from memory', why: 'Memorised diagrams don’t show how you handle a new problem’s constraints.' },
                { text: 'How many technologies you can name', why: 'Naming technology without a reason tends to count against you. It can look like over-engineering.' },
              ],
            },
          ]}
        />
      </>
    ),
  },
  {
    id: 'step1',
    title: 'Step 1: Understand the problem',
    goal: 'Turn a vague prompt into agreed features and numbers before you draw anything.',
    content: (
      <>
        <Explain>
          <p>
            The book’s Jimmy always answers first, whether or not he has thought it through. In a design interview there are no points for speed:
            answering without understanding the requirements is a big red flag.
          </p>
          <p>Slow down and ask. Good first questions:</p>
          <ul>
            <li>What specific features are we building?</li>
            <li>How many users, and how fast will that grow?</li>
            <li>What is the existing tech stack? Anything we can reuse?</li>
          </ul>
          <p>
            Then write down the{' '}
            <Term term="functional requirements">What the system must do: the features users interact with.</Term> and the{' '}
            <Term term="non-functional requirements">How well it must do it: latency, availability, scale, consistency.</Term>. If the interviewer asks
            you to assume something, write the assumption on the board too.
          </p>
        </Explain>
        <Try task={<>The interviewer says “design a news feed”. Tap the questions you would ask. Each one shows the interviewer’s answer and whether it was worth asking. Aim to ask all three key questions without any weak ones.</>}>
          <ClarifyLab />
        </Try>
        <GoDeeper title="The book’s example requirements for a news feed">
          <ul>
            <li>Functional: publish a post; see friends’ posts in reverse-chronological order.</li>
            <li>Non-functional: the feed loads fast; highly available (a few seconds’ delay is fine); 10 million daily active users; up to 5,000 friends.</li>
            <li>The book also asks whether it is a mobile app, a web app, or both (answer: both).</li>
          </ul>
        </GoDeeper>
        <Check
          persistKey="chapter3:quiz:step1"
          questions={[
            {
              question: 'You ask about scale and the interviewer says “you tell me, make an assumption.” What do you do?',
              options: [
                { text: 'State a reasonable number and write it on the board', correct: true, why: 'The book’s advice exactly: write assumptions down, because later decisions depend on them.' },
                { text: 'Pick the largest plausible number so the design is safe', why: 'Designing for more scale than needed is over-engineering; pick something reasonable and say why.' },
                { text: 'Skip scale and start the high-level design', why: 'Without a number you can’t justify caches, sharding or fanout choices later.' },
              ],
            },
            {
              question: 'Why does “how many friends can a user have?” matter for a news feed?',
              options: [
                { text: 'It sets the fanout cost: one post may be copied into up to 5,000 feeds', correct: true, why: 'Yes. That multiplier decides whether push-based fanout is affordable.' },
                { text: 'It decides which database vendor to use', why: 'Vendor choice follows from access patterns; friend count affects write amplification, not the brand of database.' },
                { text: 'It doesn’t: only DAU matters for scale', why: 'DAU tells you how many users; friend count tells you how much work each post creates. Both matter.' },
              ],
            },
          ]}
        />
      </>
    ),
  },
  {
    id: 'step2',
    title: 'Step 2: High-level design',
    goal: 'Propose a blueprint of boxes and arrows, and get the interviewer to agree to it before going deep.',
    content: (
      <>
        <Explain>
          <p>
            Sketch the key components (clients, API servers, data stores, cache, CDN, queues) and <strong>ask for feedback</strong>. Treat the
            interviewer as a teammate: the goal of this step is agreement.
          </p>
          <ul>
            <li>
              Check the blueprint fits the scale with{' '}
              <Term term="back-of-the-envelope">Quick rough estimates of QPS and storage, covered in Chapter 2.</Term> numbers. Ask first whether the
              interviewer wants them.
            </li>
            <li>Walk through a concrete use case, such as “a user posts”. It often exposes missing pieces.</li>
          </ul>
          <p>A news feed has two flows: publishing a post, and building the feed a user reads.</p>
        </Explain>
        <Try task={<>Add the components you think a news feed needs, then press <strong>Present to the interviewer</strong>. If a core piece is missing, the interviewer pushes back with a hint. Keep going until they agree.</>}>
          <BlueprintLab />
        </Try>
        <GoDeeper title="Should step 2 include APIs and a database schema?">
          <p>
            It depends on the problem. For a huge problem like “design Google search” it is too low-level. For a small, well-bounded one like a
            multiplayer poker backend it is fair game. Ask the interviewer.
          </p>
        </GoDeeper>
        <Check
          persistKey="chapter3:quiz:step2"
          questions={[
            {
              question: 'You’ve drawn your first blueprint. What should you do next?',
              options: [
                { text: 'Ask the interviewer for feedback and adjust', correct: true, why: 'The goal of step 2 is agreement. Good interviewers like to get involved; treat them as a teammate.' },
                { text: 'Immediately start designing the database schema in detail', why: 'Going deep on one component too early is one of the book’s don’ts. Get buy-in on the whole picture first.' },
                { text: 'Keep adding components until nothing could possibly fail', why: 'That’s over-engineering. Add what the requirements need and discuss failures in the wrap-up.' },
              ],
            },
          ]}
        />
      </>
    ),
  },
  {
    id: 'step3',
    title: 'Step 3: Deep dive',
    goal: 'Pick the two or three components that matter most, with the interviewer, and discuss their trade-offs.',
    content: (
      <>
        <Explain>
          <p>
            There isn’t time to detail everything. Work with the interviewer to prioritise, and watch for hints about what they care about. For senior
            roles the focus is often performance and bottlenecks.
          </p>
          <p>
            A good deep dive names at least two options, says what each costs, and picks one for <em>this</em> problem’s requirements. Avoid detail that
            doesn’t show design skill, such as explaining a ranking algorithm step by step.
          </p>
        </Explain>
        <Try task="The interviewer wants to dig into two news-feed topics. Pick one approach for each and read the feedback. You can change your mind.">
          <DeepDiveLab />
        </Try>
        <GoDeeper title="Typical deep-dive topics for other problems">
          <ul>
            <li>
              <strong>URL shortener:</strong> hashing (collisions, a lookup per check) vs base62 of a unique ID (no collisions, needs an ID generator).
            </li>
            <li>
              <strong>Chat:</strong> polling wastes requests; persistent WebSocket connections push instantly. Heartbeats with a timeout keep online status
              from flickering.
            </li>
          </ul>
        </GoDeeper>
        <Check
          persistKey="chapter3:quiz:step3"
          questions={[
            {
              question: 'Which of these is a poor use of deep-dive time in a news feed interview?',
              options: [
                { text: 'Explaining the internals of a feed-ranking algorithm in detail', correct: true, why: 'The book’s own example: it eats time and doesn’t show you can design a scalable system.' },
                { text: 'Comparing fanout-on-write and fanout-on-read', why: 'That is the central scalability trade-off of a news feed, a strong deep-dive topic.' },
                { text: 'Discussing how to handle accounts with millions of followers', why: 'Hot spots from celebrities are exactly the bottleneck worth digging into.' },
              ],
            },
            {
              question: 'How should you decide which components to deep dive into?',
              options: [
                { text: 'Prioritise with the interviewer, watching for hints about what they care about', correct: true, why: 'Every interview is different; the book stresses working with the interviewer to pick focus areas.' },
                { text: 'Always start with the database, since it’s the hardest part', why: 'Sometimes it is, sometimes not. For chat, connections and presence may matter more.' },
                { text: 'Cover every component equally', why: 'There’s no time, and it spreads your signal thin. Critical components first.' },
              ],
            },
          ]}
        />
      </>
    ),
  },
  {
    id: 'step4',
    title: 'Step 4: Wrap up',
    goal: 'Use the last few minutes to show you know where your own design is weakest.',
    content: (
      <>
        <Explain>
          <p>The interviewer may ask follow-ups or let you choose. Directions the book suggests:</p>
          <ul>
            <li>
              <strong>Bottlenecks and improvements.</strong> Never say the design is perfect.
            </li>
            <li>
              <strong>Recap</strong> the design, especially if you proposed several options.
            </li>
            <li>
              <strong>Error cases:</strong> server failure, network loss.
            </li>
            <li>
              <strong>Operations:</strong> metrics, error logs, how to roll it out.
            </li>
            <li>
              <strong>The next scale curve:</strong> if this supports 1 million users, what changes for 10 million?
            </li>
          </ul>
        </Explain>
        <Callout tone="idea" title="Example: “With 10× the users, what breaks first?”">
          “The feed cache for users with many friends, and the fanout workers for very popular accounts. I’d move celebrities to pull-based fanout,
          shard the feed cache by user ID, and alert on fanout queue lag.”
        </Callout>
        <Check
          persistKey="chapter3:quiz:step4"
          questions={[
            {
              question: 'The interviewer asks, “Anything you would improve?” Best response?',
              options: [
                { text: 'Name specific bottlenecks and how you’d address them', correct: true, why: 'There is always something to improve; this is a chance to show critical thinking.' },
                { text: '“I think the design handles everything we discussed.”', why: 'The book says never claim the design is perfect. It suggests you don’t see its trade-offs.' },
                { text: 'Start adding a brand-new subsystem in full detail', why: 'Mentioning refinements is good; detailing a new subsystem in the last minutes isn’t achievable and loses the recap.' },
              ],
            },
            {
              question: 'Your design supports 1M users. Which wrap-up topic does the book call “the next scale curve”?',
              options: [
                { text: 'What must change to support 10M users', correct: true, why: 'Exactly the book’s example. It shows you know which parts fail first as load grows.' },
                { text: 'How to reduce cost at 1M users', why: 'Cost can be worth discussing, but that’s not what “next scale curve” refers to.' },
                { text: 'How to migrate to a different programming language', why: 'Not a scale concern; language choice rarely determines how a system scales.' },
              ],
            },
          ]}
        />
      </>
    ),
  },
  {
    id: 'time',
    title: 'Budgeting 45 minutes',
    goal: 'Keep the first two steps tight so the deep dive, where most of the signal comes from, gets the time it needs.',
    content: (
      <>
        <Explain>
          <p>The book’s rough guide for a 45-minute interview:</p>
          <ul>
            {TIME_SPLIT.map((t) => (
              <li key={t.step}>
                <strong>{t.step}:</strong> {t.min}–{t.max} minutes
              </li>
            ))}
          </ul>
          <p>
            The deep dive has the widest range because the interviewer steers it. Every extra minute spent in step 1 comes out of it.
          </p>
        </Explain>
        <Try task={<>Drag the slider to make step 1 run long. Watch the deep-dive block on the timeline shrink, and find the point where it turns red.</>}>
          <TimeBudgetLab />
        </Try>
        <Check
          persistKey="chapter3:quiz:time"
          questions={[
            {
              question: 'Which step has the widest time range in the book’s 45-minute guide?',
              options: [
                { text: 'Deep dive: 10–25 minutes', correct: true, why: 'It flexes the most because its depth depends on what the interviewer wants to explore.' },
                { text: 'Understand the problem: 3–10 minutes', why: 'A 7-minute range: significant, but narrower than the deep dive’s 15.' },
                { text: 'High-level design: 10–15 minutes', why: 'Only a 5-minute range; the blueprint should be fairly quick.' },
              ],
            },
            {
              question: 'You’re 18 minutes in and still clarifying requirements. What should you do?',
              options: [
                { text: 'Write down the remaining assumptions and move to the high-level design', correct: true, why: 'Step 1 guidance is 3–10 minutes. Stating assumptions lets you move on without losing what you learned.' },
                { text: 'Keep asking: more requirements always means a better design', why: 'You’re eating deep-dive time, which is where most signal comes from.' },
                { text: 'Skip the high-level design and go straight to the deep dive', why: 'Without an agreed blueprint the deep dive has no context; the book warns against going deep first.' },
              ],
            },
          ]}
        />
      </>
    ),
  },
  {
    id: 'dos',
    title: 'Dos and don’ts',
    goal: 'Most of the habits that help or hurt are about communication, not technology.',
    content: (
      <>
        <Explain>
          <p>The book closes the chapter with a short checklist. Read it once now, and again the night before an interview.</p>
        </Explain>
        <div className="grid gap-6 sm:grid-cols-2 text-[15px] leading-7 text-slate-700 dark:text-slate-300">
            <div>
              <p className="font-medium text-slate-900 dark:text-white mb-2">Do</p>
              <ul className="space-y-2">
                {DOS.map(([b, rest]) => (
                  <li key={b} className="flex items-start gap-2">
                    <CheckIcon className="w-4 h-4 mt-1 shrink-0 text-emerald-600 dark:text-emerald-400" />
                    <span>
                      <strong>{b}</strong> {rest}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="font-medium text-slate-900 dark:text-white mb-2">Don’t</p>
              <ul className="space-y-2">
                {DONTS.map(([b, rest]) => (
                  <li key={b} className="flex items-start gap-2">
                    <X className="w-4 h-4 mt-1 shrink-0 text-rose-600 dark:text-rose-400" />
                    <span>
                      <strong>{b}</strong> {rest}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
        </div>
        <Check
          persistKey="chapter3:quiz:dos"
          questions={[
            {
              question: 'You’re stuck on how to handle a hot spot. What does the book recommend?',
              options: [
                { text: 'Ask the interviewer for a hint', correct: true, why: 'Listed explicitly: don’t hesitate to ask for hints. It keeps the session collaborative and moving.' },
                { text: 'Stay quiet and think until you have the full answer', why: 'Thinking in silence is a don’t. The interviewer can’t credit reasoning they can’t hear.' },
                { text: 'Change topic to a component you know better', why: 'Avoiding the problem loses the signal the interviewer was looking for.' },
              ],
            },
            {
              question: 'You’d like to use a message queue. How should you bring it up?',
              options: [
                { text: 'Name it and explain the problem it solves here and the trade-off', correct: true, why: 'Justified components are fine; unjustified ones read as buzzwords or over-engineering.' },
                { text: 'Just add it: interviewers expect to see Kafka', why: 'No component is expected by default; each should trace back to a requirement.' },
                { text: 'Avoid queues entirely; they’re always over-engineering', why: 'Queues are often the right tool (e.g. decoupling fanout). The issue is adding one without a reason.' },
              ],
            },
          ]}
        />
      </>
    ),
  },
  {
    id: 'practice',
    title: 'Practice interview',
    goal: 'Run all four steps end to end on a real problem and get a scored report on the quality of your choices.',
    content: (
      <>
        <Explain>
          <p>
            Pick a problem and go through the four stages one at a time. Every choice gets feedback straight away. At the end you get a score out of 100:
            good picks add points, weak or out-of-scope picks and interviewer pushback take them away.
          </p>
        </Explain>
        <Try task="Choose a problem, then work through each stage and press the button at the bottom to move on. Try to score above 80, then try a different problem.">
          <PracticeInterview />
        </Try>
      </>
    ),
  },
];

export const Chapter3Framework: React.FC<Chapter3FrameworkProps> = () => <ChapterPlayer chapterId="chapter3" lessons={LESSONS} />;
