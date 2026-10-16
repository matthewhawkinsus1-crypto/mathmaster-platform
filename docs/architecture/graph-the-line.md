# Graph the Line

A Live Challenge game about linear equations. Students **graph** equations
written in slope-intercept form, standard form (graphed by its intercepts) and
point-slope form, and — if the teacher turns it on — **name** the equation of
a graph. There is no Submit button: a line is checked the moment it is
complete, the student sees right or a specific hint in the next frame, and
keeps moving.

It is built **on** the Live Challenge engine (`live-challenge-engine.md`) the
way Graph Feature Rush is (`graph-feature-rush.md`): lifecycle, the room
clock, receipts and idempotency, ranking, results and rewards are the
engine's. This mode adds a question source, a way to answer, and screens.

**Status.** Phase 1 — the pure foundation (exact line math, how equations are
written and read, the generator, auto-check grading, hints, teacher settings,
shared rules) — is built and tested. The modes are **not registered yet**:
registering a mode before its planner and callables exist would let a room be
created that nothing can play (§11). Phases 2–4 are below.

---

## 1. Decisions

Settled with the product owner (2026-10-16):

| Question | Decision |
| --- | --- |
| The "x- and y-intercept" format | **Standard form**, `Ax + By = C`: students find both intercepts and connect them. Challenge adds intercepts between grid lines and lines through the origin. |
| A wrong line | **Hint, fix, 3 tries** by default: a specific hint; drag a point to fix it; after the third miss the line is shown and the student moves on. Teachers may choose 1, 2, 3 or "until right" (auto-skip after 8, the rush's rule). |
| Answering "Name it" | **Teacher picks per game**: choose one of four (one try; the wrong options are common mistakes) or build it in the boxes of the form (checked on Enter). |
| Winning a Sprint | **The rush's ranking**: work completed, then accuracy, then the time of the last correct completion. Careful beats sloppy-fast. |

---

## 2. Formats

Each format is its **own registered mode** (ids in `lineGraphRules.mjs`), so
each declares its own round structure, question pool and round limits without
new engine contracts. The teacher sees one game type, "Graph the Line", with a
format choice.

| Format | Mode id | A round is | Questions | Closes | Rounds | Seconds |
| --- | --- | --- | --- | --- | --- | --- |
| **Classic** | `lineGraphClassic` | one item; by default the whole class gets the same equation | 1 | when everyone is done, or at the clock | 3–20 (8) | 20–120 (45) |
| **Sprint** | `lineGraphSprint` | a set of 5, 10, 15 or 20 items in a row | its length | when everyone is done, or at the clock | 1–5 (2) | 60–300 (180) |
| **Rush** | `lineGraphRush` | as many items as possible | 150 (more than anyone finishes) | at the clock | 1–8 (3) | 30–120 (60) |

All three are `questionSet` rounds with `perPlayer` question issue (the engine
only allows per-player questions in question-set rounds), each item
`{ completionRule: 'allTargets', targetCount: 1 }` — which reuses the rush's
attempt pipeline unchanged. Scoring: Grand Prix with the field curve (default)
or Correct Count.

A Classic round has one item, so its schedule runs **across rounds** (rounds
0–5 are one block of six); with `sameEquations` every student's item in a
round is identical, which is what lets the projector reveal one line between
rounds (§8).

---

## 3. Items

| | Graph it | Name it |
| --- | --- | --- |
| Student sees | an equation | a line on the grid (point-slope: a marked point) |
| Student does | places two points; the line is drawn through them | taps one of four equations, or fills `y = □x + □` / `□x + □y = □` / `y − □ = □(x − □)` |
| Checked | when the second point is let go, and each time a dragged point is let go | on the tap; on Enter |
| Tries | the teacher's (default 3) | choose: one; build: the teacher's |

**Forms**, each on or off: slope-intercept, standard, point-slope. **Horizontal
and vertical lines** (`y = k`, `x = h`) are a separate toggle; as Name-it items
they are always chosen, never built (there are no boxes to fill, and the four
options — `y = k`, `x = k`, `y = −k`, `x = −k` — test exactly the confusion).

**Difficulty** is in what the equation asks, not bigger numbers:

| | Easy (grid ±6) | Standard (±8) | Challenge (±10) |
| --- | --- | --- | --- |
| slope-intercept | whole slopes, `y = x + b`, through the origin | fraction slopes | `y = 4 − 2x`, `y = 0.5x − 2`, a y-intercept between grid lines (`y = ½x + 3/2`) |
| standard | `x + y = c`, positive intercepts | negative intercepts, unreduced (`4x + 6y = 12`) | `3x − 2y = 0` (no intercepts to use), an intercept between grid lines (`2x + 3y = 9`) |
| point-slope | positive points | sign traps (`y + 3 = −2(x − 4)`), fraction slopes | `y + 4 = −(x − 1)`, `y = 2(x − 3)`, `y = 2(x + 1) − 3` |
| special | `y = k`, `x = h` | same | `2y = −6`, `3x = 9` |

Mixed starts with an Easy-heavy block, then mixes Standard and Challenge (the
rush's ramp). One fixed grid per tier: in a race, students read the equation,
not the scale.

---

## 4. Auto-check: the interaction contract

The single rule: **an answer is checked when it is complete, and never while
it is still being made.**

- **Placing a point** (Phase 3 screen): press on the grid → a point follows the
  finger, snapped to the nearest grid point, its coordinates shown *above* the
  finger → let go to place it. Precision without a Submit button.
- **The line is checked** when the second point is let go — and again each
  time a point that was dragged is let go. Never mid-drag.
- **Right** → the line turns green, a 450 ms flash, the next item.
- **Wrong** → the line stays; a hint names what to check (§6); the student
  drags either point to fix it. Pressing on empty grid moves the nearer point
  there (one gesture, no need to grab a small dot); "Start over" clears both.
- **Repeated**: letting go without changing the line (or redrawing the same
  wrong line through other points) is the same answer — `repeated`, neither a
  miss nor credit (`answerKey` in `lineGraphGrading.mjs`).
- **Out of tries** → the correct line is drawn dashed through its key points
  for 1.8 s, the item counts as not completed (a forfeit receipt, recorded by
  the server with the miss that reaches the limit — the rush's auto-skip), and
  the next item appears.
- **Pause after repeated misses**: none after one; 1 s after a second in a
  row, a second more per further miss, at most 4 s (`lineLockoutMs`, the
  rush's tuning).
- **Show your method** (teacher option): the right line counts only through
  every key point — the y-intercept; both intercepts; the point in the
  equation. A right line through other points is `method`: "Right line! Now
  draw it through the y-intercept." — neither credit nor a miss. Items whose
  key point is between grid lines waive it.
- **Name it, choose**: the tap is the answer; one try (tapping through four
  options is guessing, not graphing).
- **Name it, build**: Enter checks it. Checking every keystroke would let a
  student type digits until the screen turned green. Boxes that do not yet
  spell an equation (empty; a fraction in standard form) are `form`: told what
  to fix, nothing recorded.

Verdicts (`LINE_VERDICT`): recorded — `correct`, `incorrect`, `skipped`; not
recorded — `method`, `form`, `repeated`, `resolved`, `outOfOrder`, `limit`,
`invalid`.

---

## 5. Mathematics

**Exact lines** (`lineGraphMath.mjs`). Every line is three integers,
`a·x + b·y = c`, reduced, with `a > 0` (or `a = 0, b > 0`): one line, one
triple. "Is the student's line the equation's line?" is three integer
comparisons — no float slopes, no tolerance (the assignment graphing tool
compares floats within 0.12; a game graded on every release cannot have a
line that is right on one device and not another). Vertical lines are ordinary
lines (`b = 0`).

**Writing equations** (`lineGraphForms.mjs`). An equation is written exactly
as the generator chose — the author's own coefficients and order — as tokens
read four ways: the game's own renderer (stacked fractions, real minus signs;
the game chunk does not load MathLive), plain text (`y = (2/3)x − 1`), LaTeX
for teacher surfaces, and speech ("y plus 3 equals negative 2 times the
quantity x minus 4"). The same module reads typed boxes: whole numbers,
fractions, terminating decimals, either minus sign; never a mixed number
(`1 1/2` is refused, not read as 11/2).

**The generator** (`lineGraphGenerator.mjs`) follows the rush:

- **Schedule.** Blocks of six slots `(item type, form, variant, tier)`. Every
  student gets the same six slots per block, in their own order, with their
  own numbers. With both item types on, exactly two of six are Name it; with
  special lines on, exactly one is one; the enabled forms are dealt evenly
  over the rest. With `sameEquations`, order and numbers are shared too.
- **Determinism.** Item k for a student is a pure function of (room secret,
  student, round, k, config, generator version): the server regenerates an
  item to grade it and stores nothing it issued. The random source is
  `seededRandom.mjs`, shared with the rush; generated items are pinned by test,
  so any change to either must bump `LINE_GRAPH_GENERATOR_VERSION`.
- **Validation.** Never an axis; at least two grid points one unit inside the
  view (three for Name it); every key point of the method that is a grid point
  one unit inside; for Name it, what the answer is read from (the y-intercept,
  both intercepts, the marked point) on the grid. Two items in a row are
  never the same line asked the same way (the rush's odd/even rule).
- **Measured** over every slot (62) × 300 seeds: mean 1.09 draws per item,
  worst 9 (cap 60), no fallback ever needed.
- **Choose-from-four options** are the answer plus three lines that real
  mistakes draw from this line (§6), padded with near neighbours only when
  fewer than three are distinct, in a seeded order.

---

## 6. Hints

`lineGraphFeedback.mjs`. Each form lists the lines particular mistakes draw
from *this* equation:

| Form | Mistakes modelled |
| --- | --- |
| slope-intercept | slope sign; rise and run swapped; intercept sign; b plotted on the x-axis (graphing) / the x-intercept read as b (naming); slope and intercept swapped |
| point-slope | both signs of the point; the x sign; the y sign; the coordinates swapped; slope sign; rise and run swapped |
| standard | x-intercept sign; y-intercept sign; both signs; intercepts swapped; through the origin: slope sign, rise and run |
| special | horizontal ↔ vertical; the sign |

A wrong line earns a **specific** hint only when it is exactly one mistake's
line, for one reason. When two mistakes draw the same line (with slope 1,
"both signs flipped" and "coordinates swapped" coincide), neither is claimed;
the student gets a **structural** hint that is true whatever happened — right
slope, wrong place; right point, wrong slope — or the form's method in one
line. This is the misconception registry's rule (`misconceptionCodes.mjs`).
Hints name what to check and never give the answer; point-slope hints may quote
the equation ("(x − 4) means x = 4") — that is reading the prompt.

Diagnoses with the same meaning as a registered misconception code
(`DIAGNOSIS_MISCONCEPTION`: slope sign, run over rise, slope/intercept
swapped, intercepts swapped, ordered pair reversed) are mapped, **for later**:
a code becomes evidence only from a classifier declared in the registry
(Phase 3). Intercept sign, point-slope sign and horizontal/vertical confusion
have no registry code yet.

---

## 7. Fairness and the server's authority

- The device grades every attempt locally (same functions) for instant
  feedback; the server re-grades every attempt against its own regenerated
  item and records the receipt. The line travels with the item: the equation
  (or the drawn graph) already shows it, so withholding it would cost the game
  its speed and protect nothing — the rush's stance.
- A wrong attempt costs 1/20 of an item in the round's work score (the
  engine's question-set rule), the pause grows with repeated misses, and the
  try limit ends a stuck item: dragging points at random until the line turns
  green never beats reading the equation. (Phase 2 runs the rush's bot
  simulation against this mode to confirm it.)
- Limits (`LINE_LIMITS`): 12 attempts a request, 30 an item, 400 a round, 1,800
  a match; claimed times within 8 s of arrival; 16 characters a typed box.

---

## 8. Screens (Phase 3)

**Student.** A full-screen surface below the identity bar (the rush's
`.mm-rush-shell` contract): the prompt and equation, the grid as the largest
square that fits, Start over and Skip (Sprint, Rush) in the same place on every
item, the clock, the count. Feedback: green line + flash; red line + hint;
dashed reveal. Optional slope helper ("up 2, right 3") while placing the
second point. Streak counter (display only). Keyboard: arrows move a crosshair
on the grid, Enter places/picks up/drops a point, Escape cancels; coordinates
and the line's state are announced. Colour is never the only signal (✓/✗,
dashed reveal). Reduced motion turns off the flash and slide.

**Teacher setup.** "Graph the Line" in Create a challenge: format, preset,
item types, forms, special lines, difficulty, Name-it style, tries, Sprint
length, same equations, show your method, slope helper, rounds, time, scoring,
Rewards (the shared `ChallengeRewardSettings`), and "Try it yourself first".

**Host and projector.** Countdown, then the live race (items completed — never
an equation's line). Between Classic rounds with shared equations: the
correct line and the class's most common mistake ("7 drew a slope of 3/2"),
anonymised, published only after the round closes (the solution-reveal rule:
never public while anyone can still answer).

**Report.** Items completed, accuracy and time per item by form and item type,
tries used, the mistakes students made (named only when unambiguous).

---

## 9. Data (Phase 2)

| Where | What |
| --- | --- |
| `liveChallengeRooms/{room}` | `challengeMode`, `lineGraph: { config, generatorVersion }` — no seed |
| `liveChallengePrivate/{room}` | `lineGraph: { seed, config, generatorVersion }` |
| `…/players/{studentId}` receipts | `targetAttempt`, `targetCount: 1`, `roundQuestionCount` (§11), item type, form, variant, tier, the answer (two points, a choice id, the boxes), the diagnosis |
| `…/players/{key}` (public row) | the rush's race fields (`rushRound`, `rushRoundCompleted`, `rushActiveAt`) so the shared race board reads them; `lastRound` after a close |
| `liveChallengeReports/{room}` | `lineGraph` report, keyed by mode |

---

## 10. Module map (Phase 1, built)

| Module | Owns |
| --- | --- |
| `functions/shared/lineGraphMath.mjs` | exact lines: canonical triples, slope and intercepts, grid points in a view |
| `functions/shared/lineGraphForms.mjs` | writing equations (tokens, text, LaTeX, speech); reading typed boxes |
| `functions/shared/lineGraphFeedback.mjs` | the mistakes each form models; diagnosis; hint sentences |
| `functions/shared/lineGraphGenerator.mjs` | schedule, variants, validation, choices, the item a device receives |
| `functions/shared/lineGraphGrading.mjs` | checking one answer (line, choice, boxes); `answerKey` |
| `functions/shared/lineGraphConfig.mjs` | teacher settings, presets, round limits per format |
| `functions/shared/lineGraphRules.mjs` | mode ids, attempt kinds, verdicts, limits, tries, pause, timings |
| `functions/shared/seededRandom.mjs` | the integer-only seeded random source (moved verbatim from the rush generator, which re-exports it; its output is unchanged) |

---

## 11. Build plan and integration checklist

**Phase 2 — engine and server.**

- [ ] **A round's length from its receipts.** A Sprint's pool is its length
  (5–20), chosen per room, but `defineChallengeMode` fixes `questionsPerRound`
  per mode. Rather than thread room config through `roundQuestionSpecsFor`'s
  callers (`liveChallengeRoundCompletion`, `buildRoundResult`,
  `playerRoundOutcomes`, the callables), record `roundQuestionCount` on every
  attempt receipt and let `questionSpecsFromReceipts` take the smaller of it
  and the mode's pool — "rebuilt from the log alone", as target counts already
  are. A player with no receipts is unfinished either way.
- [ ] Register `lineGraphClassic`, `lineGraphSprint`, `lineGraphRush` in
  `liveChallengeModes.mjs` (`teacherSelectable: false` until Phase 3 ships).
  `normalizeConfig` must return `questionStyle`, `solverRaceFocus` and
  `solverRaceDifficulty` (null is fine) — the room write has no
  `ignoreUndefinedProperties`.
- [ ] The question planner: `liveChallengeQuestionPlanner` maps question
  sources to planners by hand (the rush's is outside
  `LIVE_CHALLENGE_QUESTION_PLANNERS`); add the line source. `plan` stores the
  seed privately and `{ config, generatorVersion }` publicly; `openRound`
  returns a card (never an equation); `swap` throws. Keep the planner block
  free of `.set(` / `.add(` (a test reads it).
- [ ] `createLiveChallenge`: turn `LineGraphConfigError` into
  `invalid-argument` beside `GraphFeatureRushConfigError`.
- [ ] Callables: get a round's items (from the place in the round the receipts
  say), submit attempts (one transaction: `applyLineGraphAttempts` — the rush's
  pipeline with line grading, tries/forfeit, `repeated`), preview items for
  practice. Exporting `onCall` from `functions/index.js` is enough for the
  inventory, release and access scripts. Never write `answeredRound` (it marks
  a player finished at once).
- [ ] The report writer stores any question-set mode's report under the rush's
  key: make it mode-keyed. The classic submit refuses per-player rooms with
  rush wording ("tapping graphs") — make it mode-neutral (the rush's
  integration test pins that text; update both).
- [ ] **Mastery evidence**: `liveChallengeEvidence` counts a round correct
  unless it is in `missedRounds`, which question-set rooms never write. Do
  **not** give the line planner `alignmentKeys` until question-set outcomes
  feed evidence correctly — otherwise every round played becomes "correct"
  A.3C evidence.
- [ ] Tests: the mode declarations; the attempt pipeline (replays, races,
  tries, forfeits, `repeated`, limits, claimed times); the bot fairness
  simulation; an emulator integration game through the callables.

**Phase 3 — screens.**

- [ ] The client has no registry and checks the rush's id by literal in the
  student, shell, projector, teacher, replay and presence code. Add the line
  modes to `challengeShellModel`'s `QUESTION_SET_MODES` (a test holds it to the
  registry), and generalise the literal checks into one helper rather than
  adding more.
- [ ] Early close: `roundCloseDue` closes question-set rounds on the deadline
  only; Classic and Sprint rounds should also close when everyone is done
  (the server already agrees: `roundReadyToClose`), and the host hint must not
  say "until time runs out" for them.
- [ ] The create panel: generalise the rush's create branch — a test requires
  exactly two `createLiveChallenge({` calls there, each with
  `standingsDisplay`.
- [ ] The student surface: new pointer code (the rush's graph handles
  `pointerdown` only); the rush's clock, countdown, queue, storage and
  reconciliation patterns (`rushSession.js`, `GraphFeatureRushRound.jsx`);
  `touchAction: none` (the assignment plane's `pan-y` lets a vertical drag
  scroll the page and cancel a placement). Lazily loaded, like the rush round.
- [ ] Classic reveal: a per-round solution for shared items (today the reveal
  is off for per-player modes), shown on the projector and the results card.
- [ ] Declare the mode's misconception classifier in the registry, so
  unambiguous diagnoses become evidence.

**Phase 4 — certification.** Browser QA on phone, Chromebook and keyboard; 30-
and 35-student launch runs; then `teacherSelectable: true`.

---

## 12. Testing (Phase 1)

| File | Holds |
| --- | --- |
| `tests/platform/lineGraphMath.test.mjs` | one triple per line; grid points by brute force; how every shape is written, read back by an independent oracle (`helpers/lineEquationOracle.mjs`); typed numbers; the boxes |
| `tests/platform/lineGraphFeedback.test.mjs` | every modelled mistake named, ambiguity never claimed, over every generated item; random wrong lines; hints never quote the answer |
| `tests/platform/lineGraphGenerator.test.mjs` | every slot × 40 seeds valid with no fallback; the oracle on every equation and option; key points and grid points; difficulty; pinned items; the schedule's mix; same equations; Classic across rounds; no repeats |
| `tests/platform/lineGraphGrading.test.mjs` | every pair of grid points of a right line; wrong lines; invalid gestures; show your method; choices; built equations (decimals, any point, any multiple); writing problems |
| `tests/platform/lineGraphConfig.test.mjs` | defaults per format; validation; presets; round limits; pools; mode ids; tries; the pause |

Each assertion that protects a behaviour was broken once on purpose and seen
to fail (the sign convention, a wrong option marked right, the block mix,
ambiguity, the method rule, the repeat rule, canonical signs, the random
source).

---

## 13. Later

Inequalities (dashed or solid boundary, shading — the same line tool), systems
(graph two lines, tap the intersection), real-world contexts, a Warm-Up link
for Classic, student self-practice outside a live game, per-student
accommodations (slope helper on, extended time — today extended time applies
to synchronized rounds only).
