# MathMaster build backlog

Things worth building, why, and what is already true. Kept in the repository so
it survives a conversation, and updated as items ship.

Status: `open` · `in progress` · `shipped` · `needs a decision from the teacher`

---

## Needs a decision before it can be built

### ~~Does Live Challenge performance count as mastery evidence?~~ — decided
**Status:** decided · yes, at reduced weight · built

It counts. The answers are real answers to real questions from the secure bank,
graded by the same graders as everything else, so refusing them was throwing
away evidence the platform already had.

How it is recorded reflects the conditions rather than pretending they do not
exist:

- **Weighted 0.7** — below untimed practice (1.0) and below a Warm-Up (0.8).
  One attempt against a countdown with a leaderboard in view is noisier
  evidence: a wrong answer may mean "cannot do this" or may mean "ran out of
  seconds", and the estimate should not treat those as equally informative.
- **Aggregated per standard, not per round.** A single timed question is close
  to a coin flip. Four rounds on one standard with three right is a proportion
  worth 0.75, which is something the estimate can actually use.
- **Replays never count twice.** A second-chance round is the same question the
  room already missed, and the second showing is the easier one.
- **Unanswered rounds contribute nothing** — not a zero. A student still reading
  when the timer ended has not demonstrated that they cannot do it.
- **Every event states its conditions** on the record itself, so a reader can
  see what it was rather than having to know.

Not gated behind a per-challenge teacher opt-in. The weight is the control, and
a switch that had to be remembered mid-lesson would mostly be forgotten.

### ~~Who may reconcile attendance?~~ — decided
**Status:** decided · the teacher reconciles

The teacher reconciles attendance. The permission check is therefore scoped to
the teacher of record for the class, matching how every other class-scoped
action already works.

Still worth revisiting later, but not blocking: a substitute or co-teacher
covering a period cannot mark anything under this rule. Treat a delegate as a
future addition rather than part of the first build.

### ~~Is there an SIS attendance export to reconcile against?~~ — decided
**Status:** decided · not needed · nothing to build

No SIS export is required. The teacher reconciles attendance in MathMaster and
that record stands on its own; there is no second system to agree with. Nothing
here needs building, and the import-shaped record this section was holding open
is not required either.

---

## Known risk, not yet mitigated

### ~~One Firestore document takes a write per student per round~~ — fixed
**Status:** fixed · the hot document is gone, not sharded

Every submission used to increment the per-round answered and missed tallies on
`liveChallengePrivate/{roomId}`, so one document took one write per student per
round. A class of 24 answering within a couple of seconds is roughly 24 writes
to a single document, against Firestore guidance of about one per second
sustained. Correctness held — the concurrency suite proved no increment was
lost — but the failure mode it risked is a student being told their correct
answer did not count.

**The counters were redundant.** Each player document already records which
rounds that student answered and which they missed, because mastery evidence
needs both. The room-level numbers are those arrays added up, and both readers —
the second-chance planner and the post-game report — already load every player.
`deriveRoundTallies` computes them where they are read. Nothing writes a shared
counter, and new rooms are not created with the fields at all.

Replays are excluded from the derivation exactly as they were excluded from the
increments: a second-chance round is the same question offered again, and
counting it would give that question a denominator it never had.

**Rooms in flight across the deploy** keep working. Their early answers were
counted the old way and left no per-player record, so a stored count is used
where the derived one cannot see it. That is a one-deploy fallback, not a second
source of truth — nothing writes those fields any more, so it stops mattering as
soon as those rooms end.

**Verified:** the 24-student concurrency suite still asserts every answer is
counted and every miss is a miss, now reading the derived tallies, and asserts
no room-level counter is written at all. Twelve unit tests cover the arithmetic,
the replay exclusion, the replay-list ordering, and the fallback.

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

### ~~Fix how the question bank is sampled~~ — fixed (variety); difficulty still open
**Status:** variety fixed · difficulty targeting still open

`loadChallengeCandidates` pulled `.limit(300)` with no `orderBy`, so Firestore
returned document-ID order and every mixed Algebra I game drew the same first
300 of 837 questions. About two thirds of the bank was unreachable, and the
shuffle downstream hid it — each game looked varied while the pool behind it
never moved.

The window now starts at a random offset inside the filtered set, with a
wrap-around so a game is never short of questions. See
`functions/lib/challengeSampling.js`.

**A document-ID pivot was tried first and does not work on this data.** These
ids are authored strings sharing a long prefix (`mm_act_alg_1_...`), not evenly
spread auto-ids, so a random pivot lands either before every document or past
every document and never inside the range — returning the first page either way.
The coverage test caught it. The offset is counted with an aggregation query
instead, which is uniform over the documents rather than over the shape of their
names.

**The cost, stated:** Firestore bills skipped documents on an offset, so a draw
costs up to the size of the filtered set in reads. A challenge is created a
handful of times a day, not per student per round, so this is a fine trade — but
it grows with the bank and would be the wrong shape on a hot path.

**Still open: difficulty targeting.** A mixed game can still serve a DOK-3
modelling question as round 1 under a 45-second timer. That needs a rule for
what belongs in a timed round at all, which is a content judgement rather than a
query change, so it is deliberately not bundled with the sampling fix.

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

### ~~Live Challenge: question style, live board, game surface~~ — shipped

**Status:** shipped

**Question style** on the create panel — Any / Interactive tools only / Typed
and chosen answers only — filters candidates on the server before selection, so
every draw honours it including a dry-run swap. About three quarters of the bank
has no tool, so a narrow skill set plus tools only may not fill a long game; the
shortage message names the style rather than reporting a baffling count against
a bank of 800.

**The board moves mid-round.** A player publishes a running total — what their
step credit is worth so far — to their OWN public player document, at most once
a second and only when it changes. That is not the hot document: Firestore's
sustained write limit is per document, so twenty-four students are twenty-four
documents. It is display only, clamped, never written to `score`, and dropped
the instant the round is answered. `publicLeaderboard` takes `activeRound` as an
opt-in defaulting to off, so the report, the export and the final standings rank
on banked score without each caller having to remember.

**Still open:** tool depth in the bank. stepAlgebra has one Algebra I question
and none in Algebra II, so "interactive tools only" leans hard on
systemsWorkspace, dataModelingLab and functionInvestigation. Authoring is the
next constraint, not code.

### ~~Teacher dry run before launching~~ — shipped
**Status:** shipped

**Try it yourself first**, on the create-a-challenge panel, draws the settings
on screen into a game only the teacher can see: the real bank, the real
instantiation seed, the real timer and the real grader, with **Swap this
question** on every round. Partial credit is scored by the same
`scoreChallengeRound` the game uses, so what a teacher sees is what the class
will get; speed and streak read zero because neither exists in a rehearsal.

It is deliberately not a room. No roster is loaded, no invite is written, no
player document exists, no report is produced, no mastery evidence is recorded
and nothing reaches `grades` — one teacher-scoped `liveChallengeDryRuns`
document holds the question ids so grading resolves on the server instead of
trusting the browser, and closing the rehearsal deletes it. Clients cannot read
or write that collection at all.

The round the teacher plays is the *student's* `ChallengeRound` component with
one prop swapped, not a copy of it — a lookalike would reassure a teacher about
a screen students never see.

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

### ~~Run a challenge as the Warm-Up of an assignment~~ — shipped
**Status:** shipped · teacher switch, runtime hand-off, credit and evidence all built

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

**Also built** (`src/platform/liveChallenge/warmupChallengeLink.js` and the
`createLiveChallenge` link, tested): which room, if any, belongs to a given
Warm-Up. A student has one invite document, written for every challenge their
teacher opens including standalone ones, so "is there an invite" was never a
safe question — it would drop a student into an unrelated game mid-lesson. The
link is explicit and fails closed: an invite with no assignment id never drives
a Warm-Up, an invite for assignment A never drives assignment B, and a blank id
is never a wildcard. The server refuses to link a room to an assignment that did
not switch the challenge on, so the mistake surfaces at the teacher's desk
rather than in front of a class.

**Now complete end to end.** A teacher picks an assignment under *Run as a
Warm-Up* when creating a challenge; that selection switches it on for the
assignment and links the room. Students who open that assignment during its
Warm-Up window are put straight into the game — no invite to spot, no code. When
it ends, participation and accuracy are written to the assignment and the
challenge score is not.

**What it still needs before a real period:** none of the rendering has been
seen in a browser — it is verified by build, lint and the headless suite only.
Enable it on a throwaway assignment with a test class first and confirm the game
appears, that *Back to Warm-Up* really returns, and that a student in a
different assignment still gets the old dashboard banner.

**Open decisions this did not make:**

- ~~Whether challenge performance counts as mastery evidence.~~ Decided and
  built: it counts, weighted 0.7, aggregated per standard.
- Whether a student who never joined should get a 0% or no record. Currently no
  record — an absence is an attendance question, which the teacher reconciles,
  and a 0% would make it indistinguishable from a student who sat through the
  game and answered nothing.

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
