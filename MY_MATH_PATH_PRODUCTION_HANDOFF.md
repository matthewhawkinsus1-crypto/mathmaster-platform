# My Math Path — production handoff

This document is the operating manual for the work that turned My Math Path
from a routing skeleton with a placeholder question bank into a running
learning experience. It is written for the person who owns the platform, not
for a compiler.

---

## 1. The rule everything else serves

**My Math Path adapts instruction without doing the mathematics for the
student.**

Every decision below was made against that sentence. Where a convenience would
have made a hard problem into a click, the convenience lost.

---

## 2. What a student does now

A student opens My Math Path and gets a question that was chosen for them by a
server they cannot see, on a skill the routing engine picked, in a form that
asks them to do mathematics.

- **They answer, they do not identify a letter.** Multiple choice is a set of
  real buttons with the options rendered as mathematics. Typed answers get the
  right kind of box — a number field, an expression field, an equation field,
  an interval field with a symbol pad, a multi-part response — and the box
  tells them what shape the answer takes without telling them the answer.
- **Their work survives a wrong attempt.** Responses are keyed to the question
  instance, so attempt two starts from what they wrote, not from an empty box.
- **They get told something specific when they miss**, and it is not the
  answer. On a second miss they can choose to open one conceptual hint —
  behind a button that says "Show me something to think about", so using it is
  a decision rather than an accident. Every hint in the bank is checked at
  build time for containing its own answer, and a hint that does is a build
  failure, not a warning.
- **The worked solution is released when the question closes** — either
  because they got it right or because their attempts ran out. It is never in
  the payload before that. It is not a rule enforced by the UI; the review
  lives on the server session document beside the grading definition and is
  handed out one piece at a time.
- **They are told where they are going and why, in their own language.** "This
  builds on something you learned earlier, so you are working on that for a
  few questions. You will come back." No TEKS codes, no DOK levels, no
  difficulty bands, no internal reason strings.

## 3. What the engine does behind that

- **Routing runs on the server, in the live session.** After each finalized
  question the Cloud Function asks the same routing engine the simulator uses:
  continue, retry with support, diagnose, descend to a prerequisite, bridge
  back, extend, verify retention, or hand off to the teacher.
- **Repeated failure produces a diagnosis, not a fourth identical question.**
  A diagnostic is one question with one attempt, because three tries at it
  would measure persistence instead of answering the question it was asked to
  answer.
- **An excursion always comes home.** The origin skill and return threshold
  travel with the excursion, and passing the prerequisite bridges the student
  back to the skill that sent them away.
- **A student is never stranded.** If routing wants a skill the bank cannot
  serve, the engine keeps them on something runnable rather than showing an
  empty screen.
- **Evidence is credited to the skill the question came from**, not to the
  target the student happened to start on.

## 4. How a question gets chosen

One selector, `selectNextFamily`, ranks in this order:

1. **Quality first.** A polished family beats a placeholder, whatever the
   difficulty bands say. This is the only axis allowed to jump the queue.
2. **Unused before used.** Meeting the same problem twice in one session tells
   the student the bank is thin.
3. **Variety.** A representation and a kind of thinking this session has not
   used yet.
4. **Difficulty**, closest to readiness, easier side first at equal distance.
5. **Only then repeat** — least used, longest ago.

The Teacher Path Simulator calls the same function over the same session
state. It used to have its own round-robin, which quietly made it a second
recommendation engine showing sessions no student would be given. It does not
any more.

## 5. The content

126 standards are authored to production quality — five genuinely different
families each, with no standard falling back on carried-forward starter items.

| Course | Standards | Questions |
| --- | --- | --- |
| Grade 6 | 2 | 10 |
| Grade 7 | 4 | 20 |
| Grade 8 | 23 | 115 |
| Algebra I | 49 | 245 |
| Algebra II | 48 | 240 |
| **Total** | **126** | **630** |

Every standard clears these gates before the build will write a seed file:

- five production-quality families
- at least three distinct representations (symbolic, table, graph, context,
  verbal, diagram, number line, ordered pairs, multiple representation)
- at least three distinct kinds of thinking (procedural, conceptual,
  interpretation, application, error analysis, comparison, modeling, reverse
  reasoning, representation translation, transfer)
- at least two difficulty bands and two DOK levels
- no duplicate prompt shapes inside a standard
- a solution review with at least two lines of reasoning
- no hint that contains its own answer
- no prompt that asks the student to type a letter

There is also a **correct-option position gate**: the original bank had the
correct option first in 460 of 472 multiple-choice items, which is a defect a
student can exploit without doing any mathematics. Option order is now derived
from a deterministic hash of the item id, and the build fails if any position
exceeds 40% of items.

## 6. What a teacher or administrator can verify

**Administration → Path content coverage** shows, per standard: issuable
items, production-quality items, representation spread, thinking spread,
bands and DOK levels, reviews and tools, whether a session can run, and the
content-quality state. Five states, and they mean different things:

- *No content* — nothing exists
- *Authored but unusable* — items exist and none can be issued
- *Minimum operational* — a session will run
- *Candidate* — polished but thin on variety
- *Production ready* — a session is worth running

There is a "show only unfinished standards" filter, and an execution-mode
panel that says out loud whether this build is configured for production.

**Teacher Path Simulator** runs a synthetic learner through the real student
components — the real dashboard, the real Path, the real wheels — against the
real secure bank. Per question it now shows *why this item*: the selection
reason in plain English, the band chosen against the student's readiness band,
the representation, the kind of thinking, the content-quality state, and how
many unused families are left. The event log shows each result and the routing
decision that followed it, with the sentence the student would have read.

The simulator writes to a synthetic learner id, its evidence container is
marked simulated and assigned to no class period, and it has no Firestore
write path at all — that last one is asserted by a test that greps the module
for `setDoc`, `updateDoc`, `addDoc`, `writeBatch` and `httpsCallable`.

## 7. Security posture, unchanged and enforced

- Answer keys never appear in a Path payload. The sanitized question is built
  from an allowlist, and tests assert the serialized instance contains no
  `expected` value.
- A browser-supplied `isCorrect` is never authoritative in production.
- Tool selection cannot be forged by the browser; the grading definition comes
  from server-held session state.
- A tool the server cannot securely grade **fails closed**. It is never
  silently downgraded into a text box.
- Teacher simulation cannot impersonate a student's authenticated identity —
  which is exactly why the simulator has its own runtime rather than the
  student's credentials.
- Submission ids are idempotency keys. A retried network failure returns the
  first result instead of burning a second attempt. The simulator honours this
  too, so a teacher testing a flaky Chromebook sees the behaviour a student
  would get.
- **Production execution mode fails closed.** A production build with a
  missing, invalid, or mock execution-mode variable resolves to
  `MISCONFIGURED` and shows a configuration panel. A missing environment
  variable can no longer silently turn a live student's session into fake
  practice questions.

## 8. Commands

Run these from the repository root.

```bash
# Dependencies
npm ci

# Rebuild the question bank from the authored source and validate every gate
node scripts/build-path-bank.mjs

# Validate without writing (use this in CI)
node scripts/build-path-bank.mjs --check

# Tests
node --test tests/platform/*.test.mjs

# Build and lint
npm run build
npm run lint
```

Deploy is unchanged: the seed files land in both `seed/pathQuestionBank/` and
`functions/seeds/pathQuestionBank/`, and `PATH_BANK_COVERAGE_MANIFEST.json` is
regenerated alongside them.

## 9. Adding content

Authoring lives in `seed/pathQuestionBank/authoring/`. To add a standard:

1. Write it in a course file using the builders in `kit.mjs` — `choice`,
   `numeric`, `expression`, `equation`, `interval`, `inequality`,
   `orderedPair`, `shortText`, `parts`, and the tool builders.
2. Export it and add it to `index.mjs`.
3. Run `node scripts/build-path-bank.mjs --check` and fix what it reports.

The kit refuses to build an item without a band, DOK level, task type,
representation, or a review with at least two lines of reasoning. That is
deliberate: the gates are in the authoring API, not in a style guide nobody
reads.
