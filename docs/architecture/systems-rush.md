# Systems of Equations Rush

A Live Challenge game mode: every graph shows **two lines**, and every student
gets their own and races the round clock to tap what each one asks for — the
**y-intercepts**, the **x-intercepts**, or **the solution of the system**, the
point where the two lines intersect. Some lines have no x-intercept or no
y-intercept (horizontal and vertical lines); some systems have no point a
student can tap: lines that cross between grid lines (**Can't Be
Determined**: the solution exists, the graph cannot show it), parallel lines
(**No Solution**) and the same line twice (**Infinitely Many**). The same line
twice is drawn so that both lines show, one lying on the other.

It is built **on Graph Feature Rush** (`graph-feature-rush.md`), as Inequality
Graphing Rush is (`inequality-rush.md`), on the Live Challenge engine
(`live-challenge-engine.md`). A system is a rush question whose graph is two
lines: its targets are points to tap, or none and a press. The rush's
attempts, receipts, round state, pacing, ranking, round screen, host views and
report serve this game unchanged. What it adds is a question source (its
generator and settings), two presses ("Infinitely Many", "Can't Be
Determined"), a drawing of two lines, and its words.

```
 teacher setup ─► createLiveChallenge (mode: systemsRush) ─► lobby ─► start
                                                                       │
   ┌──────────────────── each round (engine lifecycle) ───────────────┘
   │  student device                               server
   │  getGraphFeatureRushRound ────────────────►  place in the round (receipts)
   │                            ◄────────────────  + next systems, from the seed
   │  tap a point / press a button                 (systemsGenerator.mjs)
   │  graded at once on the device
   │  queue → submitGraphFeatureRushAttempts ──►  one transaction: regrade,
   │        ◄─ verdicts + state                    receipts, player rows
   │  deadline ─► host closes ─► round results + the round's guide published
   └─ Finish ─► match result ─► report (`systemsRush`), rewards, class memory
```

---

## 1. Module map

| Module | Owns | Runs on |
| --- | --- | --- |
| `systemsRush.mjs` | the questions, kinds, presses, difficulty, presets and settings (`normalizeSystemsRushConfig`, `SystemsRushConfigError`); plain-number line geometry the device draws with; every word a student reads (prompts, right/miss/reveal words, press hints, tap notes, the feedback reserve); the report's labels | server, device, tests |
| `systemsGenerator.mjs` | exact geometry (rationals), the items built backwards from their answers, the visual rules, the block schedule; `generateSystemsQuestion`, `publicSystemsQuestion`, `SYSTEMS_GENERATOR_VERSION` | **server and tests only** — never imported by device code |
| `systemsReading.mjs` | the guide a round publishes at its close | server, tests |
| `graphFeatureRushRules.mjs` | the mode id (`SYSTEMS_RUSH_MODE_ID`), the two new presses (`RUSH_ATTEMPT_KIND.INFINITELY_MANY`, `CANNOT_DETERMINE`), which press answers a question (`rushPressAnswer`), three misses on a solution question (`rushAutoSkipMisses`) | everywhere |
| `graphFeatureRush.mjs` | attempts: `applyRushAttempts` grades a tap by the hit test, a press by `rushPressAnswer`; a wrong tap's diagnosis among the system's features; the report's press counts | server, practice, tests |
| `liveChallengeModes.mjs` | `systemsRushMode`: question source `systemsGenerator`, per-player question-set rounds, the rush's pool, Grand Prix on the field curve or Correct Count | everywhere |
| `src/platform/liveChallenge/rushGraphModel.js` | `systemDrawing`: each line clipped to the view, its arrows, its numbered label; `describeSystemCursor` for the keyboard | device, tests |
| `src/components/liveChallenge/GraphFeatureRushGraph.jsx` | `SystemLines`, `SystemLabels`, `SYSTEM_STROKE` | device |
| `src/platform/liveChallenge/rushSession.js` | the device session (shared): `recordInfinitelyMany`, `recordCannotDetermine`, the system's feedback words, its round kinds | device, tests |
| `src/platform/liveChallenge/systemsSetupModel.js`, `SystemsRushSetup.jsx` | the teacher's setup | teacher console |

## 2. Items

**Questions.** `yIntercept` ("Find all y-intercepts"), `xIntercept` ("Find all
x-intercepts"), `solution` — "Find where the two lines intersect" at Easy,
"Find the solution of the system" at Challenge, either at Standard, so the
words "the solution of the system" are learned against the picture.

**Kinds of system.**

| Kind | Variants (from the tier named) | A solution question's answer |
| --- | --- | --- |
| `slanted` | two lines crossing at a grid point (Easy); meeting on the y-axis, on the x-axis (Standard) | tap the crossing |
| `levelUpright` | x = c and a slanted line, y = c and a slanted line, x = a and y = b (Easy); two horizontal or two vertical lines, intercept questions only (Standard) | tap the crossing |
| `cannotDetermine` | crossing inside a grid square (Easy); meeting past the edge of the graph, solution questions only (Challenge) | **Can't Be Determined** |
| `parallel` | two slanted lines (Easy); two horizontal, two vertical (Standard) | **No Solution** |
| `sameLine` | one slanted line twice (Easy); one horizontal, one vertical line twice (Standard) | **Infinitely Many** |

Every kind has an Easy variant, so any kind plays at any difficulty. An
intercept question with no line crossing that axis (two horizontal lines for
x-intercepts, two vertical lines for y-intercepts — from Standard) has no
target: "Does Not Exist", as for a graph. Two lines sharing an intercept have
one target there, tapped once.

**Built backwards, exactly.** A solution question is built from its crossing
(a grid point, or a point plainly inside a grid square) and slopes from the
tier's pool (Easy 1, 2, 3; Standard adds 1/2, 1/3, 2/3, 3/2; Challenge adds
3/4, 4/3, 2/5, 5/2, 3/5, 5/3; both signs). An intercept question is built from
intercepts on the grid. Every line is held as exact rationals
(`graphFeatureRational.mjs`): intercepts and the crossing are solved exactly,
and two lines are "the same line" only when they are exactly equal.

**Seen as asked** (`SYSTEM_VIEW_RULES`, enforced on every item):

- every target at least a tenth of the side inside each edge, and two targets
  far enough apart that a fingertip never reaches both;
- each line crosses at least 60% of the view (the same line twice, 70%), its
  slope readable (at most 3, at least 1/3);
- a crossing at a grid point at 15° or more;
- a crossing that **can't be determined** at 25° or more, each coordinate
  0.25–0.4 from a whole number and at least 0.4 from the nearest grid point,
  in a window of at most 14 squares — never mistakable for a grid point;
- past the edge (Challenge): the lines plainly close in (20° or more) and meet
  between 1.35 and 2.5 half-sides out, so they are visibly apart where they
  leave the graph;
- **parallel lines** at least 1.5 units and a tenth of the side apart;
- on an intercept question, the crossing clear of every intercept; at Easy no
  shared intercepts and no line through the origin.

A slot draws up to 80 times and keeps the first item that passes; a fallback
item, built by hand for each slot, exists for safety and has never been needed
(21,600 items across all 108 slots: no fallbacks, at most 39 draws, 1.65 on
average).

### The same line twice

The two lines of an Infinitely Many system lie exactly on each other, and must
still read as two lines:

- **line 1 solid and wide** (`SYSTEM_STROKE.line1`, 9) in the board's curve
  colour; **line 2 dashed and narrow** (3, dashes 11 on 7 off) in a second
  colour, drawn on top over a casing (6) in the board's own colour — so on
  the same line the dashes run inside the wide line with a gap of board on
  each side, and both lines show;
- each line's **numbered label** at its own end (line 1 prefers the right or
  top end, line 2 the left or bottom), clear of every target, the crossing and
  the other label; on the same line they sit at opposite ends;
- each line's own arrows: line 2's narrower and in its own colour, haloed;
- a key under the graph (a wide solid swatch "Line 1", a dashed one "Line 2"),
  and the graph's accessible name says "line 1 solid, line 2 dashed";
- in a contrast theme (forced colours) both lines are `CanvasText` and the
  casing `Canvas`: the dashes still show as gaps in the wide line.

The same drawing serves every kind, so nothing about how a graph is drawn
says which kind it is.

### The schedule

As for graphs and inequalities: item k of a student's round is a pure function
of (room secret, student, round, k, settings, `SYSTEMS_GENERATOR_VERSION`).
Each block of six is shared by every student in the round — the same
(question, kind, variant) slots, each student in their own order with their
own numbers — so no one's race is easier. A block first takes a (question,
kind) pair not yet used in it, weighted (crossing kinds twice the special
ones', so the special ones stay special). **Mixed** ramps as the rush does: a
gentle first block, then Standard and Challenge. Two items in a row are never
the same two lines asked the same way.

## 3. Settings and presets

`normalizeSystemsRushConfig` validates `{ presetId, questions, kinds,
difficulty }` and throws `SystemsRushConfigError` with a sentence a teacher can
act on — no question; no kind; solution questions with only special kinds
("Solution questions need some systems with one solution to tap: choose Two
slanted lines or Horizontal & vertical lines too.").
`createLiveChallenge` and `previewSystemsRush` turn it into `invalid-argument`.
A preset fills in what a request leaves out and stays named only while the
settings still match it ("custom" otherwise).

| Level | Questions | Kinds | Difficulty | Time |
| --- | --- | --- | --- | --- |
| 1 · Intercepts | y, x | slanted | Easy | 3 × 60 s (Algebra I's default) |
| 2 · Where They Intersect | y, x, solution | slanted | Easy | 3 × 60 s |
| 3 · The Solution | solution | slanted | Standard | 3 × 60 s |
| 4 · Horizontal & Vertical | y, x, solution | slanted, horizontal & vertical | Standard | 3 × 60 s |
| 5 · Can't Be Determined | solution | slanted, can't be determined | Standard | 3 × 60 s |
| 6 · None or Infinitely Many | solution | slanted, parallel, same line | Standard | 3 × 60 s |
| Every Kind of System | all three | all five | Mixed | 3 × 90 s (Algebra II's default) |

Rounds 1–8, 30–120 s, Grand Prix (field curve) or Correct Count — the rush's
limits and scoring.

## 4. Answering

- **A tap** is graded by the rush's hit test (screen-space tolerance, clamped
  to the view). A tap on a point already found is "already found", never a
  miss. The keyboard moves a cursor on the grid and Enter taps; a screen
  reader hears the point and where each line is there ("Pointer at (1, 0).
  Line 1 is at y 1. Line 2 is the vertical line x = 3.").
- **The buttons are the game's, not the item's.** Every intercept question
  offers Does Not Exist and Skip. Every solution question offers one button
  for each special kind the game includes — **No Solution** (the rush's "Does
  Not Exist" press), **Infinitely Many**, **Can't Be Determined** — and Skip,
  on every solution question of that game, so a button never gives an answer
  away. A round that asks both keeps the other row's room held, invisibly and
  out of the tab order, so the graph never moves between them.
- **A press is right exactly where it is the answer** (`rushPressAnswer`): the
  item's `answerPress` (`infinite`, `undetermined`), else "Does Not Exist"
  where there is nothing to tap. Server and device grade with the same
  function.
- **Wrong** gets words that ask, never a button's name: a press — "Is it the
  same line twice? Look again.", "Do these lines cross? Look again."; a tap on
  a solution question — what it landed on: "That point is on line 1, not
  line 2.", "That point is on both lines — and it is not the only one.",
  "They cross between grid lines there — can you read that point exactly?";
  else "Not the solution — try again."
- **Right** says why, in the system's words: "Correct — (2, −1) is on both
  lines: the solution.", "Correct — parallel lines never meet: no solution.",
  "Correct — the same line: every point on it is a solution.", "Correct — they
  cross at (7/3, 5/4), between grid lines."
- **The third miss on a solution question** — taps and presses alike
  (`rushAutoSkipMisses`: three, as for a number line; eight on an intercept
  question, as for a graph) — shows the answer for `RUSH_REVEAL_PAUSE_MS`
  ("They cross at (7/3, 5/4), between grid lines: can't be determined from the
  graph. Next graph.") and moves on; the server records the skip itself.
- An item is worth what its answer takes (`rushQuestionWeight`): a point a
  target, a press one.

## 5. Server

The game plays on Graph Feature Rush's callables. `RUSH_QUESTION_SOURCES` in
`functions/index.js` holds its entry, `systemsGenerator`: the room's private
state under `systemsRush`, "Systems of Equations Rush" in a refusal, and its
generator (version, `generate`, `publicQuestion`).
`getGraphFeatureRushRound` issues and `submitGraphFeatureRushAttempts` grades
a systems room with the same code as a graph room.

| Piece | What it does |
| --- | --- |
| `SYSTEMS_RUSH_PLANNER` | `plan`: placeholder round ids, a fresh private seed (`liveChallengePrivate/{room}.systemsRush: { seed, config, generatorVersion }`), the public settings (`room.systemsRush: { config, generatorVersion }`); `openRound`: a card (`kind: "systemsRush"`, the questions, kinds and difficulty — never a system) and the round's guide kept privately |
| `liveChallengeRevealableRounds` | publishes the guide at the round's close, as a rush round's |
| `questionSetModeReport` | the rush's report with `SYSTEMS_REPORT_LABELS`, under `systemsRush` |
| `previewSystemsRush` | sample systems for a teacher's settings (a fresh seed, nothing written) — the practice round's source |

**What a device receives** (`publicSystemsQuestion`): the two lines, the view,
the targets, the press that answers it, and a solution question's exact
crossing for its words — the answer travels with the item, as a graph's
targets do, and the server grades every attempt again from its own copy. The
system's other features (`graphFeatures`, every intercept and crossing) stay
on the server, for the report's diagnosis of a wrong tap.

**Generator version.** A room is graded with the generator it was created
under, or not at all: a room whose `generatorVersion` is not
`SYSTEMS_GENERATOR_VERSION` refuses to issue or grade ("This Systems of
Equations Rush was created before an update. Ask your teacher to start a new
game."). Bump it with any change that would generate a different item for the
same seed, and deploy outside class time.

**Stored shapes.** Nothing an item carries is stored: items are regenerated. A
press's receipt keeps its `attemptKind` (`dne`, `infinite`, `undetermined`)
and, when right, its `targetId` (the press); a wrong tap keeps where it landed
and its `diagnosis` — the feature it found instead (`yIntercept`,
`xIntercept`, `solution`).

## 6. Screens

- **Student:** the rush's round screen (`GraphFeatureRushRound.jsx`). For a
  system it draws the two lines (§2), their key, and the rows of buttons (§4);
  its words come from `rushGameWords` ("systems", not "graphs").
- **Teacher:** "Systems of Equations Rush" in the game type list; its setup
  panel — the levels, what students find, the kinds of system, a picture of
  how the two lines look (crossing, and the same line twice), difficulty,
  rounds, time, scoring; "Try it yourself first" plays `previewSystemsRush`
  systems on the student's own screen (`GraphFeatureRushPractice` with
  `game`), nothing recorded.
- **Host and projector:** the rush's race views, in this game's words; the
  settings line lists the questions and kinds.
- **Report:** completed, accuracy, skips; No Solution, Infinitely Many and
  Can't Be Determined each with its accuracy; by question and by kind of
  system (hardest first); and where wrong taps landed ("Tapped a y-intercept
  when asked for the solution"), most common first. Permanent deletion takes a
  student out of `systemsRush.players` (`REPORT_STUDENT_ROW_PATHS`, SI07).
- **Play Again** replays the questions, kinds and difficulty
  (`challengeReplayModel.js`).
- **Last time:** a finished game leaves its class a memory, and the next setup
  opens with its card, as for the other rushes; at Easy the suggestion drops
  the weakest kind, never one the settings need (a solution question keeps a
  kind to tap). See `live-challenge-engine.md` → Finalization effects.

## 7. The round's guide

`systemsReading.mjs`: the same text for every student, from the game's
settings alone, titled "How to read a system". One line each, for what the
game asks and draws: the intercepts; the solution of the system ("where the
two lines intersect — the one point on both lines"); horizontal and vertical
lines; and, with solution questions, Can't Be Determined, No Solution and
Infinitely Many. Seven lines at most — the projector's limit — and one of
slips ("two lines on top of each other are still two lines — look for both").

## 8. Tests

- `tests/platform/systemsRush.test.mjs`:
  - every item of every slot against an **independent oracle** (each line put
    in standard form, the system solved by Cramer's rule, intercepts solved
    again), with the visibility rules, over many seeds;
  - variants by tier and the solution question's wording; determinism, shared
    blocks, no repeats, the kinds' shares;
  - **the same line twice**: two lines drawn in the same place, labels at
    opposite ends, line 2 dashed over a casing narrower than line 1 and drawn
    after it, and the forced-colours rules;
  - labels clear of every target over hundreds of items; the cursor's words;
  - settings, presets, refusals, the mode's declaration;
  - server grading of every press, the three-miss reveal on device and
    server, and **device–server agreement** over random play;
  - words that never name the right button, the feedback reserve;
  - the report, its diagnosis and deletion rows, the guide, class memory, and
    the screens' and server's wiring (the generator never reaches device code).
- `tests/integration/systemsRush.test.mjs` (emulator, `npm run
  test:challenge-finish`): a whole game through the callables — a private
  seed, a card for a round, each student's own systems, a tap on the crossing,
  each press recorded as itself and right only where it is the answer, a wrong
  tap's diagnosis, the third-miss skip on a solution question and none on an
  intercept question, the guide at the close, the report under its own key,
  the class's memory, refusals (nothing to ask, nothing to tap, a stale
  generator) and the preview.
- QA harness, not CI: `tests/browser/systemsRushScreens.mjs` drives the real
  round screen on a phone and a laptop: both lines and their labels, the same
  line twice also in forced colours, each kind answered through its own
  button, nothing scrolling sideways, and the graph keeping its place between
  intercept and solution questions. Its page mounts the teacher's setup panel
  instead with `?setup=1`.
