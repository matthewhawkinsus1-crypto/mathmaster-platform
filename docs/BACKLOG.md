# MathMaster build backlog

Things worth building, why, and what is already true. Kept in the repository so
it survives a conversation, and updated as items ship.

Status: `open` · `in progress` · `shipped` · `needs a decision from the teacher`

---

## Needs a decision before it can be built

### Does Live Challenge performance count as mastery evidence?
**Status:** needs a decision

The post-game report deliberately writes none. A timed, gamified round is real
retrieval practice but is not equivalent to independent untimed work, and
quietly writing evidence while building a report would have decided this by
accident.

A defensible position: yes at reduced weight, never toward grades unless a
teacher opts in per challenge. Not implemented either way.

### ~~Who may reconcile attendance?~~ — decided
**Status:** decided · the teacher reconciles

The teacher reconciles attendance. The permission check is therefore scoped to
the teacher of record for the class, matching how every other class-scoped
action already works.

Still worth revisiting later, but not blocking: a substitute or co-teacher
covering a period cannot mark anything under this rule. Treat a delegate as a
future addition rather than part of the first build.

### Is there an SIS attendance export to reconcile against?
**Status:** needs a decision

If the district's SIS produces a daily CSV, the teacher's confirmation step
becomes a verification step and accuracy rises considerably. The manual path
should be built either way, but the record should be shaped so an import can
populate it.

---

## Unknown, and worth finding out first

### ~~What happens when a Chromebook sleeps mid-game?~~ — checked, it recovers
**Status:** verified · no work needed

Traced end to end. A student whose device sleeps or drops wifi gets back in on
its own, and five separate properties have to hold for that, all of which do:

- Joining is **automatic on mount** — no code to type and no button to find, so
  waking the device is the whole recovery action.
- `joinLiveChallenge` accepts a room in **running** status, not only lobby, so
  rejoining mid-game is allowed rather than refused.
- It **merges** into the existing player record, so score, correct count and
  streak all survive the reconnect.
- The room is read through `onSnapshot`, and the Firestore SDK re-establishes
  its listeners after a drop without help.
- The countdown derives from `roundEndsAt`, which is **server time**, so a woken
  device shows the real remaining seconds rather than a stale local timer.

Two small things remain, neither urgent: a student is not told they missed a
round while they were away, and a reconnect can fire one redundant join call
before the leaderboard reloads — harmless, because the call is idempotent.

---

## Live Challenge

### Fix how the question bank is sampled
**Status:** open · high value, small

`loadChallengeCandidates` pulls `.limit(300)` for a mixed game and `.limit(100)`
for a single standard, with **no `orderBy`**. Firestore returns by document ID,
so every mixed game draws from the same first 300 documents. Students who play
often will see repeats and most of the bank is unreachable.

There is also no difficulty targeting: a mixed game can serve a DOK-3 modeling
question as round 1 under a 45-second timer.

### Round sources beyond one standard
**Status:** open

Today a teacher picks one standard or `mixed`. Each of these is a query change,
not new content:

- **Yesterday's DOL misses** — the strongest of the set. Makes a challenge
  diagnostic-driven, and every round is one somebody in the room needs.
- **This week's Path slots** — the game reinforces the weekly target instead of
  interrupting it.
- **The class's weakest standards** — computed from `masteryProfilesByTEKS`.
- **Retention-due standards** — spiral review, from `retentionScheduler`.
- **An existing assignment** — any built lesson becomes a round set.
- **CCMR / ASVAB / SAT transfer** — the audited banks already exist.
- **Hand-picked** — everything else is a shortcut to this.

### Competition formats
**Status:** open

Every challenge is currently a free-for-all with one ranked list. This axis
decides whether the game encourages a struggling student or confirms what they
already believe.

- **Teams**, scored on **average not sum**, so nobody gets carried and every
  student's round matters
- **Class vs class**, settled asynchronously between periods
- **Class vs its own record** — the safest competitive frame there is
- **Co-op against a target**, with no ranking at all — for reteach days
- **Handicap scoring** against each student's own baseline, so the student who
  improved most can win

### Teacher dry run before launching
**Status:** open

A teacher currently launches blind in front of the class. A dry run lets them
play their own configured challenge solo against the real bank with the real
timer — and **swap out a round they do not like** before launching.

The value is question review; seeing the UI is the bonus. `DemoExperience.jsx`
and the Teacher Path Simulator are both precedent for this shape.

### A `liveChallenge` authoring contract slice
**Status:** open · do after the selector

A challenge question has constraints an assignment question does not: answerable
in 45 seconds, single part, no multi-stage tool, no scratchpad dependency,
unambiguous when read fast. `CONTRACT_SLICES` and the `issuable` template gate
already exist; this adds the slice and a timing validator so an outside AI can
produce usable rounds.

Worth doing **after** the selector, so the constraints are written from what a
good round turned out to be in practice.

### ~~Export a challenge as JSON~~ — shipped
**Status:** shipped

Anchored to the post-game report rather than the live room: the question set
lives in private state, which is deleted when the room closes, so exporting from
a running game would have worked once and been impossible for every game already
finished. The report is written before that deletion, so any finished game can
be saved.

The file carries content only — question ids, standards, round timing and the
class result. No names, no scores, no roster. A teacher can email it to a
colleague without thinking about it.

Live Challenge has **no JSON in or out**. The teacher's whole configuration is
four dropdowns — class, standard, round count, round seconds — and a finished
game cannot be saved, shared or repeated.

Export is the safe half and is immediately useful: keep the set that worked for
period 1 and run it again for period 3, hand a real example to an outside AI, or
keep a record of what was asked. It needs no new validation, because everything
in the set already came from the validated bank.

### Import a challenge from JSON
**Status:** open · next · reader already written

`parseChallengeExport` already validates a file and answers a wrong one with a
sentence rather than a stack trace. What remains is the server half, and it is
the half that matters: passing the file check means the FILE is well formed, not
that the questions still exist, are still active, or are still issuable. An
import must run `safeBuildTemplateIssuePlan` server-side before a single round
reaches a class.

The natural counterpart, and the way an AI-written round set would actually
reach a class. It must **validate rather than accept**: every question the game
uses today passes `safeBuildTemplateIssuePlan`, and a free-form import that
skipped that gate would put unvalidated content in front of a class in real
time, with no preflight and no way to back out mid-game.

So this waits on the `liveChallenge` contract slice and the timing validator.
Export first, import second.

### More ways to be recognised at the end
**Status:** open

Most improved · steadiest · first to answer · best comeback · team that pulled
together. With one prize the same three students win every time and the rest
stop playing.

### Private personal bests
**Status:** open

"Your best round yet", shown only to that student. Recognition that does not
require beating anybody.

### Public top few, private own rank
**Status:** open

Aliases already protect identity. Showing only a top three or five publicly,
with each student's own position shown only to them, means **nobody is ever
publicly last** — which is where perseverance is won or lost.

### Solution reveal between rounds
**Status:** open

Five seconds of the worked solution before the next question. It is the
difference between a quiz and a lesson, and it is the only thing the student who
just missed it otherwise gets.

### Run a challenge as the Warm-Up of an assignment
**Status:** in progress · decision layer built, runtime wiring remains

Today a challenge needs its own login path: the teacher creates a room, invites
land in `liveChallengeInvites`, and every student has to notice and join before
the game can start. That join step, times twenty-four, at the start of a period,
is what stops a five-minute activity being worth running.

Students opening the assignment are **already authenticated and already
present**. If the Warm-Up section is the challenge, the join step disappears —
the assignment makes the connection.

**Built** (`functions/shared/warmupChallenge.mjs`, pure and tested):

- The attachment shape. Off unless explicitly switched on, defaulting to five
  30-second rounds — a bell-ringer inside a lesson rather than the lesson.
- The routing decision: play, wait for the teacher, or continue into the
  assignment. The Warm-Up's own window is the authority, so a teacher who closes
  the Warm-Up early closes the game with it even while the room still runs.
- The grading rule. **Challenge points never reach the assignment.** What
  travels is participation and accuracy — facts about the mathematics rather
  than about a student's reaction time.
- Late arrivals. A student who joins at round six is measured against the four
  rounds they could have played, not against ten.

**Remains:**

- Creating the room when the Warm-Up window opens for a class, and joining every
  student who opens the assignment.
- The hand-off in the assignment runtime: render the challenge in place of the
  Warm-Up section, then return the student to the next section when it ends.
- Recording the credit against the Warm-Up section.
- Somewhere for the teacher to switch it on for an assignment.

### Run a challenge at the DOL phase
**Status:** open · with a caveat worth taking seriously

Mechanically the same idea, and the DOL window and single attempt fit a game
well. But a DOL is **graded**, and putting speed pressure on a graded exit
ticket is the exact thing the perseverance work was written against: the
students who most need to think would be the ones paying for it.

Recommended shape if it is built: a DOL challenge is diagnostic, its points do
not reach the gradebook, and the DOL grade comes from accuracy alone. Otherwise
run it as review the day after the DOL rather than as the DOL.

---

## Live Class and attendance

### The period roll from the monitor
**Status:** open · attendance is waiting on this

At the bell the monitor already knows who showed no activity in the window. That
is the proposed-absent list, with no new collection.

It must arrive as **evidence** — "no activity 9:05–9:52" — never as a verdict. A
dead Chromebook and an empty seat produce the identical record, and the teacher
is the one who can tell them apart.

### Partial presence
**Status:** open · probably the highest-value signal here

A student active for twelve minutes of a fifty-minute period is neither
present-and-working nor absent, and today reads as present. An engagement window
distinguishes arriving late, leaving early, and quietly stopping — three
different conversations, none of them truancy.

### Which question broke the room
**Status:** open

Eighteen of twenty-four carrying `x` on question 7 is a reteach signal, currently
discoverable only afterwards and one student at a time. One row per question
turns the monitor from a supervision tool into a live formative one.

### Who to see next
**Status:** open

Severity flags sort by how bad things look. A teacher walking the room needs a
different order: longest without progress. A quiet student stuck for nine
minutes outranks a loud one who missed a question thirty seconds ago.

### A period replay
**Status:** open

The monitor shows the room as it is, not that the room fell off a cliff at 9:22.
An engagement line across the period separates "my lesson lost them" from "that
student left".

### Flag for follow-up from the tile
**Status:** open · depends on the attendance extension

One control that opens the extension the attendance layer already computes, in
the period rather than as an evening admin task. The extension only helps if
granting it is easier than forgetting.

---

## Attendance layer

### The teacher reconciliation card
**Status:** open · blocked on the two decisions above

The observation record and the four-state card — present, excused, unexcused,
unmarked — with unmarked doing nothing at all. The pure policy modules
(`classMeetings.js`, `absencePolicy.js`) are built and tested; nothing is wired.

### The weekly Path publisher needs a new refusal
**Status:** open

`weeklyPathPublishDecision` refuses on `not_enabled`, `not_linked`,
`not_over_yet`, `no_weekly_score` and `teacher_already_changed`. It needs
`attendance_not_yet_reconciled` alongside them, or Monday's automatic run pushes
a low weekly score to the family of a student who was out sick before the
teacher has marked anything.

### Suppress needs-attention for confirmed absences
**Status:** open

`needsAttention.js` already carries the worry in a comment: *"a strong student
who was absent starts reading as a struggling one."* Once absences are
confirmed, that queue should stop reporting them.

---

## Shipped

- Student question legibility — inequality prompts, answer-format hints,
  exponential asymptotes, sticky submit and undo
- Enlarge on every graph, diagram and number line; auto-enlarge for aiming tools
- Tool chrome compaction and foldable reference panels
- Scratchpad pages, and the fix for Close discarding unsaved work
- Graph self-check ("Check my points"), gated by section policy
- Weekly Path progress bar and the grade a student is earning
- Live Challenge comeback points and second-chance rounds
- Live Challenge post-game report
