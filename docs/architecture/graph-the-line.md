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

**Status. Launched.** Phase 1 (the pure foundation: exact line math, how
equations are written and read, the generator, auto-check grading, hints,
teacher settings, shared rules), Phase 2 (the server: the three modes, the
planner, the attempt pipeline, the callables, the report), Phase 3 (the
screens: the student's round, the teacher's setup and "Try it yourself
first", the host's race and report, the projector, the Classic reveal, early
close) and Phase 4 (certification: whole classes of 30 and 35 playing every
format at class scale, then the launch) are built and tested. The three modes
are `teacherSelectable: true`: every teacher's console offers "Graph the
Line". **Mastery evidence** has its own rules — each line's first try only,
Graph it as A.3C and Name it as A.2C, at a Live Challenge's weight — and is
built **switched off**: no event is written until the owner turns it on
(§11, LC12).

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

- **Placing a point**: press on the grid → a point follows the finger,
  snapped to the nearest grid point, its coordinates shown *above* the finger
  (higher for a finger than a pen or a cursor; beside it, against the top
  edge, when there is no room above — never under the hand) → let go to place
  it. Precision without a Submit button.
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
  for 1.8 s, the item counts as not completed, and the next item appears. The
  server decides it: the miss that uses the last try is recorded as the item's
  end (`forfeit`, `revealed`) — ONE receipt. (The rush records its
  eighth-miss skip as a second receipt; with one to three tries that would
  count each final miss twice, and a one-try game where 7 of 10 lines were
  right would read 54% accurate instead of 70%.)
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
a code becomes evidence only from a classifier declared in the registry. The
game's mastery evidence (§11) records none yet: the registry's codes are read
per question, and that evidence is one event per standard per game, so a
first try's code needs its own per-item record and a reader
(`MISCONCEPTION_EVIDENCE.md`, backlog). Intercept sign, point-slope sign and
horizontal/vertical confusion have no registry code yet. Today diagnoses
reach the hint, the teacher's report and the Classic reveal's label.

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
  green never beats reading the equation. Simulated 60-second Rush rounds
  through the real pipeline (means over 12; `lineGraphPlay.test.mjs`):

  | Player | Lines | Accuracy | Work score |
  | --- | --- | --- | --- |
  | careful (6 s a line, 10% slips, fixed next try) | 9.0 | 90% | 8.95 |
  | slope guesser (right starting point, a common slope, 1.5 s a try) | 1.4 | 5% | 0.48 |
  | sprayer (two random grid points, 1.2 s a try) | 0.0 | 0% | 0.00 |

  With "until right" the guesser's growing pauses bring it to 0.40.
- Limits (`LINE_LIMITS`): 12 attempts a request, 30 an item, 400 a round, 1,200
  a match; claimed times within 8 s of arrival; 16 characters a typed box;
  attempt ids up to 40 characters (a device sends a 36-character UUID). The
  private record is one document: the largest receipt this mode can write is
  measured by test and 1,200 of them stay under the rush's 800 KiB budget.
- A typed equation whose boxes each read but together leave the exact integer
  range is `form` ("too large"), never an exception inside the transaction.
- **A student's support plan** (LC09). The race stays one race for everyone,
  and nothing public says who has an accommodation:
  - **Extended time comes after the buzzer, in Classic and Sprint** (the
    modes' `extraTimeAfterBuzzer`; `lineFormatGivesExtraTime`). A question-set
    race ranks how much each student completes against one clock, so
    stretching one student's clock would change the race. Instead the race is
    decided at the class's buzzer, exactly as if nobody had extra time, and a
    student whose plan gives them extended time (the join reads it, ≤ 2×, as
    for every game) keeps working to their own deadline to finish their set.
    The server routes what arrives after the class's window — or what their
    device made after the buzzer, even inside the arrival grace — into its own
    map, `extraTimeReceipts` (`extraTime: true`, no points), beside the race's
    `submissionReceipts`. Everything that ranks, scores or rewards reads only
    the race's receipts; the item rules (tries, `repeated`, where they are),
    the round's readiness (the round waits for them, `extended_time`, and
    closes the moment their set is finished), the Classic reveal's counts,
    the teacher's report (`itemsCompletedInExtraTime`) and mastery evidence
    read all of their work. Their public row never moves after the buzzer (a
    row that changed then would name them); the room says only
    `extendedTimeInPlay`, and the projector "A few students are still
    finishing". So nobody's place changes because a classmate had extra time,
    and the student is never placed below where the class's clock alone would
    put them. **A Rush gives none**: it is as many lines as the clock allows,
    with nothing to finish. The teacher reads the rule under "Time per round"
    (`lineExtraTimeRule`), and the student, on their own screen at the
    buzzer: "Your extra time. The race is over — finish your lines. They count
    for your practice, not the race."
  - **The slope helper is the student's own** when their plan gives them a
    graphing aid — graph paper or a graphic organizer
    (`planTurnsOnSlopeHelper`). It draws the rise and run of their own line
    and never says which line is right, so it changes how they work, not how
    many lines they finish. Decided at the join, kept on the private player
    record (`lineSlopeHelper`) and returned only by their own
    `getLineGraphRound` (`slopeHelper`); the room's own setting still turns it
    on for everyone.
- **Bundles.** Registering the modes puts their settings module
  (`lineGraphConfig.mjs`, with `lineGraphRules.mjs`) into the chunk that
  carries the mode registry — the student Live Challenge chunk, which the
  teacher console imports: +8.3 kB (+2.8 kB gzip), the same way the rush's
  settings ship. Phase 3 loads the rest only where it is used, and no line
  drawing loads up front on any screen. Measured against Phase 2's build
  (each screen's chunk plus everything it loads eagerly): a student's Live
  Challenge screen +3.5 kB (+1.5 kB gzip); the teacher's console +20.9 kB
  (+6.0 kB gzip — the setup model, host status, report and wiring). Lazy, for
  a line room only: the student's round 65.1 kB (21.1 kB gzip) with the
  shared grid 9.5 kB (4.0 kB); a revealed line 3.1 kB (1.5 kB) plus the grid,
  only when a Classic round has one (`RevealedLine`); the setup panel 10.9 kB
  (3.3 kB) and practice 9.8 kB (4.0 kB), only when the teacher picks the
  game. The generator reaches no browser at all (a test holds that).

---

## 8. Screens (built in Phase 3)

**Student** (`LineGraphRound.jsx`, lazily loaded). A full-screen surface below
the identity bar (the rush's `.mm-rush-shell` contract): the equation (or the
line to name), the grid as the largest square that fits, Start over and Skip
(Sprint, Rush) in the same place on every item, the clock, the count and a
streak (display only). Feedback: a green line, ✓ and a flash; a red line, ✗
and the hint, with the tries left; after the last try the answer dashed
through its key points. The ✓ or ✗ sits on the line where it covers neither
point nor either point's coordinates (`verdictBadgeSpot`); colour is never the
only signal. The slope helper ("up 2, right 3") shows between the points when
the teacher turns it on, or when the student's own plan does (their round
request says so, §7). A student with extended time in Classic and Sprint
reads the race's countdown like everyone, then, past the class's buzzer,
"Your extra time" and their own countdown (§7). Keyboard: arrows move a
crosshair (Shift: five),
Enter places, picks up and drops a point, Escape puts a held point back;
coordinates and outcomes are announced. The grid draws its own keyboard ring,
shown only after keyboard use (`data-focus-ring="own"` keeps the page's
`:focus-visible` ring, which a focus given in code would leave on through
every press, off it). Reduced motion turns off the flash and slide. Time,
network and storage are the rush round's: one clock anchor
(`monotonicRoundOrigin`), the input gate read from refs, attempts queued in
localStorage and sent gathered, the server's counts taken when they differ.
The standings listener pauses while a question-set round is open.

**Teacher setup** (`LineGraphSetup.jsx`, lazy). "Graph the Line" in Create a
challenge, for every teacher. One switch decides it — the modes'
`teacherSelectable`: set back to false, the server launches the game for the
platform administrator only and the console offers "Graph the Line (preview)"
to the administrator alone. Format cards, presets, item types, Name-it
style, forms and special lines, difficulty, tries, Sprint length, same
equations, show your method, slope helper, rounds, time, scoring, the shared
Rewards choice; the server's own words when a setting makes the game
impossible (Create is disabled). The model (`lineGraphSetupModel.js`) keeps a
preset named only while the settings still match it, and a Sprint's suggested
time following its length until the teacher sets one. **Try it yourself
first** (`LineGraphPractice.jsx`, lazy) plays sample items from
`previewLineGraph` on the student's own screen, checked on the device by the
server's attempt pipeline; nothing is sent or recorded. A Classic practice is
its first six lines in a row. **Play Again** carries every setting.

**Host** (`LineGraphHost.jsx`). The room's settings in one line; during a
round, the race board (the rush's, with each student's lines right and, in
Classic and Sprint, "✓ done") and how many have finished. Never an equation
during a round: each student may have their own, and the projector is for the
whole room. A round held past the buzzer for extra time says so on the
console alone ("the race is decided… those count for their practice, not the
race"), with End Round Now; the projector says only "still finishing".

**Early close.** Classic and Sprint rounds close when every joined student has
finished — the host sees it from each public row's `rushRoundFinished`, and
the server's close guard agrees from the receipts (`roundReadyToClose`), so
no force is needed. Rush rounds, like Graph Feature Rush's, end on the clock
(`roomRoundsEndOnTheClock`). The host's hint says which.

**Projector.** Countdown, then the race (`LineRunningView`) — never an item
while the round can be answered.

**Classic reveal** (`lineGraphReveal.mjs`, `LineRevealGraph.jsx`). In a
Classic game with the same equations (its default), the round's line is
captured privately when the round opens. When the round closes — on the same
three paths, and under the same hold rule, as every shared question's worked
solution (`liveChallengeSolutionReveal.mjs`) — the server publishes it with
the class's facts from the receipts: how many answered, how many got it (and
on the first try), and the wrong line or option most students gave, dashed —
**only when at least two gave it**, as a count, never a name. The projector,
the teacher's console and each student's results card draw the same graph.

**Report** (`LineGraphReport`). After the game: lines right, accuracy and
tries by form, item type and difficulty; the class's mistakes, most first,
labelled only when the diagnosis is unambiguous; each student's line.

**Generalised mode checks.** The client asks `challengeShellModel.js` —
`questionSetGameOf`, `roomRunsQuestionSets`, `roomRoundsEndOnTheClock` —
instead of comparing the rush's id; a test holds those sets to the registry.

---

## 9. Data (built in Phase 2)

| Where | What |
| --- | --- |
| `liveChallengeRooms/{room}` | `challengeMode`, `lineGraph: { config, generatorVersion }` — no seed; while a round is open, `currentQuestion` is a card (`kind: 'lineGraph'`, format, forms, item types, `roundQuestionCount`) — never an equation |
| `liveChallengePrivate/{room}` | `lineGraph: { seed, config, generatorVersion }`; `questionIds` are placeholders (`lineGraph:round:N`) with no standard |
| `…/players/{studentId}` receipts | `targetAttempt`, `targetCount: 1`, `roundQuestionCount`, `tier`, `reportTags: { form, itemType, variant }`, `itemKey` (the line asked, `lineKey`: the evidence counts a line met again once — LC12), the answer (`points` [x₁, y₁, x₂, y₂], `choice`, or `fields`), and for a miss its `diagnosis` and `answerKey`; `forfeit` + `revealed` on the miss that used the last try |
| `…/players/{studentId}` (LC09) | from the join: `timeMultiplier` (> 1 only in Classic and Sprint) and `lineSlopeHelper` (the plan's graphing aid); `extraTimeReceipts`: attempts made after the class's buzzer in extended time (`extraTime: true`, no points), apart from the race's `submissionReceipts` (§7) |
| `…/players/{key}` (public row) | score, accuracy and the rush's race fields (`rushRound`, `rushRoundCompleted`, `rushActiveAt`, and since Phase 3 `rushRoundFinished`: this round's items are all done), so the shared race board, early close and presence read them; `lastRound` after a close. No student id, no answers |
| `liveChallengePrivate/{room}` (Phase 3) | a Classic game with the same equations: `roundSolutions[round]`, its line's worked solution, captured when the round opens; the plan's `sharedLineKeys`, which hold a round's reveal while a later round asks the same line |
| `liveChallengeRooms/{room}/solutions/{round}` (Phase 3) | after the round closes: the worked solution with `lineGraph` (the line, key points, equation tokens, options) and `class: { answered, correct, firstTry, mistake }` — counts only; `revealedSolutionRounds` on the room lists it |
| `liveChallengeMatchResults/{room}` | each standing's `questionSetSummary` now also carries `byTag` (the mode's report tags) and `mistakes` (diagnosis counts) — empty for the rush; in a line game (LC12) each standing's `lineGraphEvidence`: `{ version, graph, name, slopeHelper }`, per item type the lines counted, right on the first try and first tried in extended time — counted at the finish from the receipts, so the evidence effect reads the result, never private state, and deleting the student removes it with the standing |
| `platformFlags/liveChallengeEvidence` (LC12) | the owner's switch: `lineGraph: true` (only the boolean) lets the evidence effect write a line game's events; absent, off. Like every `platformFlags` switch, signed-in clients may read it and only the Admin SDK writes it (`firestore.rules`) |
| `grades/{student}/evidenceEvents/{id}` (LC12, switch on) | one event per student per standard per game: `eventKey` `liveChallenge_{room}_{A.3C\|A.2C}`, `source: { kind: 'liveChallenge', activityRole: 'liveChallenge', itemType, evidenceVersion }`, `performance.score` = right on the first try ÷ lines counted (`linesCounted`, `linesRightFirstTry`), `supportUsage` (independent; `accommodations: ['extra-time']` and `slopeHelper` stated, never discounting), `conditions` in words |
| `liveChallengeReports/{room}` | `lineGraph`: items completed and ended, accuracy, by form, by item type, by tier (hardest first), mistakes (most first, labelled), per student |

**Engine changes Phase 2 made** (each additive; Graph Feature Rush is
unchanged and its suites pass):

- `questionSpecsFromReceipts` takes a round's length from its receipts'
  `roundQuestionCount` when present — so a Sprint of five is finished after
  five, and a round whose students all are is ready to close.
- `questionSetMatchSummary` adds `byTag` and `mistakes`.
- `liveChallengeQuestionPlanner` looks per-player sources up in one table
  (`GENERATED_QUESTION_PLANNERS`); the report writer stores a question-set
  report under its mode's key (`questionSetModeReport`); the classic-submit
  refusal names the game ("Graph Feature Rush is played on its own game
  screen…").

---

## 10. Module map (built)

| Module | Owns |
| --- | --- |
| `functions/shared/lineGraphMath.mjs` | exact lines: canonical triples, slope and intercepts, grid points in a view |
| `functions/shared/lineGraphForms.mjs` | writing equations (tokens, text, LaTeX, speech); reading typed boxes |
| `functions/shared/lineGraphFeedback.mjs` | the mistakes each form models; diagnosis; hint sentences |
| `functions/shared/lineGraphGenerator.mjs` | schedule, variants, validation, choices, the item a device receives |
| `functions/shared/lineGraphGrading.mjs` | checking one answer (line, choice, boxes); `answerKey` |
| `functions/shared/lineGraphConfig.mjs` | teacher settings, presets, round limits per format |
| `functions/shared/lineGraphRules.mjs` | mode ids, attempt kinds, verdicts, limits, tries, pause, timings |
| `functions/shared/lineGraphAttempts.mjs` | the submit transaction's body (`applyLineGraphAttempts`), round state from receipts, player totals, the report |
| `functions/shared/seededRandom.mjs` | the integer-only seeded random source (moved verbatim from the rush generator, which re-exports it; its output is unchanged) |
| `functions/shared/lineGraphReveal.mjs` | a shared Classic round's worked solution, and the class's facts added at its close |
| `functions/shared/lineGraphEvidence.mjs` | mastery evidence (LC12): each student's first tries per item type (`lineEvidenceFacts`), the events (`buildLineGraphEvidenceEvents`), the conditions text, the owner's switch |
| `functions/index.js` | `lineGraphModules()`, `LINE_GRAPH_PLANNER` (with the shared round's solution), the preview gate in `createLiveChallenge` (for any mode not yet offered), `getLineGraphRound`, `submitLineGraphAttempts` (writes `rushRoundFinished`), `previewLineGraph`, the reveal's class facts |
| `src/platform/liveChallenge/liveChallengeService.js` | the three callables for the screens (mirrored in the emulator bridge) |
| `src/platform/liveChallenge/lineGraphModel.js` | the grid as geometry: unit space, snapping, the line edge to edge, the draft reducer (press, drag, release), the keyboard, where labels and the ✓/✗ float |
| `src/platform/liveChallenge/lineGraphSession.js` | a student's round on the device: verdicts (the server's grading), tries, pauses, the queue, the server's word |
| `src/platform/liveChallenge/lineGraphSetupModel.js` | the teacher's setup, presets and formats, and the create request |
| `src/platform/liveChallenge/challengeShellModel.js` | which rooms run question sets and which end on the clock (`QUESTION_SET_GAME`) |
| `src/components/liveChallenge/LineGraphRound.jsx`, `LineGraphCanvas.jsx`, `LineGridLayer.jsx`, `LineEquation.jsx` | the student's round, the grid, its grid lines, an equation's tokens |
| `src/components/liveChallenge/LineGraphSetup.jsx`, `LineGraphPractice.jsx`, `LineGraphHost.jsx`, `LineRevealGraph.jsx` | the teacher's setup and practice, host status and report, the revealed line |
| `src/components/liveChallenge/RevealedLine.jsx` | the revealed line, loaded on first use: every room's results can show one, only a Classic line game has one |

---

## 11. Build plan and integration checklist

**Phase 2 — engine and server. Done.**

- [x] **A round's length from its receipts.** A Sprint's pool is its length
  (5–20), chosen per room, but `defineChallengeMode` fixes `questionsPerRound`
  per mode. Rather than thread room config through `roundQuestionSpecsFor`'s
  callers (`liveChallengeRoundCompletion`, `buildRoundResult`,
  `playerRoundOutcomes`, the callables), record `roundQuestionCount` on every
  attempt receipt and let `questionSpecsFromReceipts` take the smaller of it
  and the mode's pool — "rebuilt from the log alone", as target counts already
  are. A player with no receipts is unfinished either way.
- [x] Register `lineGraphClassic`, `lineGraphSprint`, `lineGraphRush` in
  `liveChallengeModes.mjs` (`teacherSelectable: false` until Phase 4
  certified them).
  `normalizeConfig` must return `questionStyle`, `solverRaceFocus` and
  `solverRaceDifficulty` (null is fine) — the room write has no
  `ignoreUndefinedProperties`.
- [x] The question planner: `liveChallengeQuestionPlanner` maps question
  sources to planners by hand (the rush's is outside
  `LIVE_CHALLENGE_QUESTION_PLANNERS`); add the line source. `plan` stores the
  seed privately and `{ config, generatorVersion }` publicly; `openRound`
  returns a card (never an equation); `swap` throws. Keep the planner block
  free of `.set(` / `.add(` (a test reads it).
- [x] `createLiveChallenge`: turn `LineGraphConfigError` into
  `invalid-argument` beside `GraphFeatureRushConfigError`; launch a mode that
  is not teacher-selectable for the platform administrator only.
- [x] Callables: get a round's items (from the place in the round the receipts
  say), submit attempts (one transaction: `applyLineGraphAttempts` — the rush's
  pipeline with line grading, tries/forfeit, `repeated`), preview items for
  practice. Exporting `onCall` from `functions/index.js` is enough for the
  inventory, release and access scripts. Never write `answeredRound` (it marks
  a player finished at once).
- [x] The report writer stores any question-set mode's report under the rush's
  key: make it mode-keyed. The classic submit refuses per-player rooms with
  rush wording ("tapping graphs") — make it mode-neutral (the rush's
  integration test pins that text; update both).
- [x] **Mastery evidence** held back: `liveChallengeEvidence` counts a round
  correct unless it is in `missedRounds`, which question-set rooms never
  write, so the line planner gives its rounds no `alignmentKeys` (the
  integration test checks the private `roundStandards` are empty). Wiring
  question-set outcomes into evidence is Phase 3 — otherwise every round
  played would become "correct" A.3C evidence.
- [x] Tests: the mode declarations; the attempt pipeline (replays, races,
  tries, forfeits, `repeated`, limits, claimed times); the bot fairness
  simulation; an emulator integration game through the callables.

**Phase 3 — screens. Done.**

- [x] The client's literal checks of the rush's id generalised into
  `challengeShellModel.js` (`QUESTION_SET_GAME`, `questionSetGameOf`,
  `roomRunsQuestionSets`, `roomRoundsEndOnTheClock`); the student, shell,
  projector, teacher, replay and solution code ask it.
- [x] Early close for Classic and Sprint: `roundCloseDue` closes them when
  every joined student's row says `rushRoundFinished` (the server's guard
  agrees from the receipts); Rush rounds end on the clock; the host's hint
  says which.
- [x] The create panel: the rush's create branch serves both games, still
  exactly two `createLiveChallenge({` calls, each with `standingsDisplay`.
- [x] The student surface: new pointer code with capture and
  `touchAction: none`; the rush's clock, countdown, queue, storage and
  reconciliation patterns; lazily loaded.
- [x] Classic reveal: a per-round solution for shared items, published at the
  close with the class's facts; on the projector, the console and the results
  card.
- [x] The report screen (`report.lineGraph`), beside the rush's.
- [x] **Mastery evidence — deferred here, on purpose; built in LC12 (below),
  switched off.** Turning it on then would have written wrong evidence about
  real students. `liveChallengeEvidence.mjs` counts
  a ROUND as one answer to one bank question, and stamps every record "One
  attempt, no hints" and `isMathematicallyIndependent: true`. A line round is
  up to 150 items, each with a hint after a miss and up to three (or
  unlimited) tries; mixed Graph it and Name it items share a round, so one
  standard per round (`roundStandards`) cannot say which is A.3C and which
  A.2C; and question-set rooms never write the `answeredRounds` /
  `missedRounds` the builder reads. Doing it right needs: an item's FIRST try
  as the independent answer (later tries are supported by a hint), counted
  per item type into the match summary at the close; an evidence builder over
  those counts with its own conditions text and support usage; per-item-type
  standards (A.3C Graph it, A.2C Name it); and the misconception classifier
  declared in the registry so unambiguous diagnoses become misconception
  evidence. Until then the planner gives line rounds no standards, so a line
  game writes no evidence at all (the integration test checks
  `roundStandards` stays empty). The game is certified now; this ships next,
  as its own reviewed change.

**Phase 4 — certification and launch. Done.** (Phase 3 had already played
every format in real browsers — phone, iPad, Chromebook, mouse, finger and
keyboard — against the real handlers: `tests/browser/lineGraphGame.mjs`.)

- [x] Two loose ends from Phase 3's browser QA, neither in this game: the
  Graph Feature Rush grid kept the page's focus ring after a mouse or finger
  tap (it draws its own keyboard ring, so it now opts out with
  `data-focus-ring="own"`, as the line grid does), and on the projector a
  bank question's worked-solution steps were centred under their numbers
  (they read down a left edge now).
- [x] The launch certification's simulated students play line rounds
  (`tests/integration/support/liveChallengeSimLineRound.mjs`): every verdict
  through the screen's own session, and the round's clock anchor, sending,
  storage, resume and prefetch mirrored from `LineGraphRound.jsx`, held to it
  by `liveChallengeLaunchCertificationMirror.test.mjs`. Each student follows
  a plan (right first time, a slip fixed, the class's common mistake, out of
  tries, skipping). The simulated host closes a round when the console would
  (`roundCloseDue`), through `closeLiveChallengeRound`, never forced. The
  launch certification's own games still pass on the changed device and
  host (`npm run test:live-challenge-launch:emulator`, 10 of 10).
- [x] Whole classes against Firestore (`tests/integration/lineGraphLaunch`,
  `npm run test:line-graph-launch:emulator`: an emulator to itself, in CI's
  full platform suite, about two minutes):
  - **Sprint, 30 students**, five lines each: one device offline at the
    start, one that reloads its page while offline mid-round, one that opens
    after the start. Every attempt recorded exactly once, to each plan's
    count (230 for the class, in about 180 submits and 35 item requests);
    the room 2.1 kB at launch, a first batch at most 4.2 kB; the round
    closed the moment the class had finished, 1.2 s after its last answer
    and 20 s in.
  - **Classic, 35 students**, three rounds, the same line for everyone: 18
    right first time, 9 drawing the same wrong line first, 5 slips fixed, 3
    out of tries. Each round closed 1.2 s after its last answer; only then was
    its line published, every time with the class's facts — 35 answered, 32
    right, 18 first time, "Right point, wrong slope" by 9, the nine's own line
    — and no student's id or key.
  - **Rush, 30 students**, Graph it and built equations for 30 seconds: 36
    lines a student (median; 39 at most), one check per line for students who
    drew every line right, items fetched ahead in 7 batches (the first at most
    4.7 kB); the round ended on its clock, never early, and no batch arrived
    too late.
  - In every game: what each device shows is what the server holds; no
    standings listener and no live snapshot while a round is open; the final
    standings on every screen are the match result's; the report counts the
    receipts; diagnostics stay small and private; every listener closes.
- [x] A flake, found and fixed — in the simulated students, not the game. In
  two runs of three, a stuck student completed a line it should have run out
  of tries on. The cause: a key point on the grid's edge (about one item in
  twenty), where every offset one way leaves the grid, left the plan two
  wrong lines, so its third try was the right one. The offsets reach ±6
  now, and `tests/platform/lineGraphLaunchPlans.test.mjs` checks every plan
  on every kind of item the generator makes, and the edge case by name.
  Five runs in a row since: all green.
- [x] `teacherSelectable: true` for the three modes. The console reads the
  same flag (`LINE_GRAPH_LAUNCHED`): "Graph the Line" for every teacher, with
  no preview wording. The server's preview gate stays, for any mode not yet
  offered; set the flag back to false and the administrator-only preview
  returns, label and all.

**LC12 — mastery evidence. Built, switched off.** BACKLOG decided a Live
Challenge counts as evidence at weight 0.7; a line game gets there by its own
rules (`lineGraphEvidence.mjs`), never through the bank rounds' builder,
whose path and output are unchanged (it still writes nothing for a line game:
no standard per round).

- [x] **The first try on each line, only.** Each item's first recorded
  attempt, in the order the student met the items; every later try follows a
  hint, and a line out of tries is shown. What is never recorded (`repeated`,
  `method`, `form`) is never a first try; a retried or replayed batch adds
  nothing. Nothing to farm: repeating, hints and retries never add a right
  first try, and a line met again later in the game (a long Rush, a Classic
  schedule) counts once, by the receipt's `itemKey` — a receipt without one
  counts for nothing.
- [x] **A skip is not right.** A skipped line is a line counted and not right
  — otherwise skipping every unsure line would record only the sure ones. A
  line still on screen at the buzzer with no attempt counts for nothing (the
  bank rounds' rule).
- [x] **Per item type, per standard.** Graph it is A.3C (graph linear
  functions), so a vertical Graph it line — no function's graph — is left
  out; Name it is A.2C. One event per student per standard per game, worth
  the share right on the first try (a Live Challenge's evidence is always
  aggregated: one timed item is close to a coin flip), `activityRole:
  'liveChallenge'` (0.7). The event key is stable, so a retried finish
  writes the same event again.
- [x] **Conditions on the record.** Timed, first tries only, a skip not
  right, a line met again once — in words on the event. The slope helper
  (the room's, or the plan's — LC09) and extended time are stated when they
  were there and never lower the credit: they are access, not help with the
  mathematics. A first try in extended time counts like any other; the race
  never read it, the evidence does.
- [x] **Wiring.** The finish counts each joined student's facts from their
  receipts (race and extra time) into their standing on the match result, in
  the same commit; the `evidence` effect adds the line events after the bank
  builder's, from the result alone. Every line game records the facts; the
  events are written only while `platformFlags/liveChallengeEvidence` has
  `lineGraph: true` — the boolean, which the owner sets in the Firebase
  console (the console's "Add field" default, a string, is not a decision).
  It is **off**: no document, so nothing is written. A game finished while it
  was off is not written later.
- [ ] **Misconception codes — not yet.** A wrong first Graph it line's slope
  mistake is provable by `tool:graphing2`'s rule (through the form's own
  point, slope exactly −m or 1/m, blockers −1/m, none when |m| = 1), but the
  registry's codes are read per question and the case review counts
  questions, while this evidence is one event per standard per game. It
  needs a per-item record and a reader (`MISCONCEPTION_EVIDENCE.md`,
  backlog).
- [ ] **Turning it on — the owner's decision.** Worth knowing first: a
  student's device holds each item's answer (the instant check needs it), so
  a student who reads the network traffic could answer any line — the race
  and its rewards already accept that, and the evidence would too.

---

## 12. Testing

| File | Holds |
| --- | --- |
| `tests/platform/lineGraphMath.test.mjs` | one triple per line; grid points by brute force; how every shape is written, read back by an independent oracle (`helpers/lineEquationOracle.mjs`); typed numbers; the boxes |
| `tests/platform/lineGraphFeedback.test.mjs` | every modelled mistake named, ambiguity never claimed, over every generated item; random wrong lines; hints never quote the answer |
| `tests/platform/lineGraphGenerator.test.mjs` | every slot × 40 seeds valid with no fallback; the oracle on every equation and option; key points and grid points; difficulty; pinned items; the schedule's mix; same equations; Classic across rounds; no repeats |
| `tests/platform/lineGraphGrading.test.mjs` | every pair of grid points of a right line; wrong lines; invalid gestures; show your method; choices; built equations (decimals, any point, any multiple); writing problems |
| `tests/platform/lineGraphConfig.test.mjs` | defaults per format; validation; presets; round limits; pools; mode ids; tries; the pause |
| `tests/platform/lineGraphPlay.test.mjs` | the attempt pipeline: a right answer completes once; a miss with its mistake; `repeated`; the last try ends the item in one receipt; tries 1/2/3/until right; one try for a choice; `method` and `form`; replays, late, early, malformed and mismatched attempts; skips; claimed times; record limits; a Sprint's length read back by the engine; the report; the receipt size budget; the fairness simulation |
| `tests/platform/lineGraphEngine.test.mjs` | the three mode declarations; the format is the mode's; limits per format; a Sprint round ranked by `buildRoundResult` from pipeline receipts |
| `tests/integration/lineGraph.test.mjs` (emulator, `npm run test:challenge-finish`) | every teacher launches each format; a three-student Sprint through the callables (private seed, own items, instant verdicts, `repeated`, replays, the end of the Sprint, three misses and a refresh, `rushRoundFinished`, close without force when everyone is done, the engine's ranking, the report); a Classic game (the same equation for everyone, refusals, one item a round; the reveal published only at the close, with the class's counts and no student id); a student's plan (extended time after the buzzer in a Classic round: the round held for them, their line recorded apart, the race ranked at the buzzer, no public document naming them, the report counting it; their own slope helper; a Rush at ×1); mastery evidence (no event while the switch is off, the facts on the result anyway; with it on, a Graph it and Name it Sprint writes each joined student's first tries — a retried line, a missed choice, a skip — as A.3C and A.2C, counted against the test's own tally); previews |
| `tests/platform/lineGraphEvidence.test.mjs` | the evidence rules (LC12): each receipt names its line; the first try only (a retry, a replay, a repeat add nothing); a skip is not right; a line met again counts once; a receipt without its line counts for nothing; Graph it A.3C without vertical lines, Name it A.2C; extended time counted and stated; the slope helper stated, never discounting; the events, their key and their weight through the mastery estimate; the switch takes only the boolean; the server's wiring |
| `tests/platform/lineGraphAccommodations.test.mjs` | which modes extend time and how; the plan's slope helper (graph paper, graphic organizer; nothing else; a revision not in effect); extra time through the pipeline (recorded apart, no points, a device's claim after the buzzer inside the grace, tries and repeats across the buzzer); the round ranked at the buzzer; readiness once their set is finished; the reveal's counts; the screens and the server wiring |
| `tests/platform/lineGraphScreenModels.test.mjs` | the grid's geometry and gestures (checked only on a release that completes or changes a line); where the held label and the ✓/✗ float; the keyboard; the device session — tries, pauses, reveals, method, naming, skips, the queue, the server's word — and its verdicts replayed through the server's pipeline over random rounds; shown answers read back by the oracle |
| `tests/platform/lineGraphReveal.test.mjs` | every slot's worked solution is the item's own line, every point a step names on it; the class's facts (distinct students, skips, who left); a mistake shown only when two students made it; the published document names no student; a line held while a later round asks it |
| `tests/platform/lineGraphScreens.test.mjs` | the setup model against the server's validation; formats and presets; which rooms end on the clock; who has finished; Play Again; source contracts for the student, round, canvas, teacher, projector and server wiring |
| `tests/browser/lineGraphGame.mjs` (QA, not CI) | whole games in Chromium against the real handlers on the emulator: setup and practice; a Sprint with a mouse and a finger (a hint and a fix by dragging, the label beside the finger, three misses, early close, results, the report); a Classic round's reveal on phones and the projector; built equations and the keyboard |
| `tests/integration/lineGraphLaunch/lineGraphLaunchCertification.test.mjs` (an emulator to itself, `npm run test:line-graph-launch:emulator`, CI) | the class-scale certification: a Sprint of 30 (an outage at the start, a reload while offline, a late join), a three-round Classic of 35, a 30-second Rush of 30; each plan's exact attempts against the receipts; each device against the server; quiet boards while a round is open; the console's early close (a Rush only on its clock); the reveal only after the close, with the class's own mistake and no student named; items fetched ahead; the final standings on every screen; the report; diagnostics |
| `tests/platform/lineGraphLaunchPlans.test.mjs` | every plan a simulated student follows does what it says on every kind of item the generator makes (3 formats × 4 difficulties × 2 Name-it styles × 24 seeds × 6 items): wrong answers that are wrong, three different ones for a stuck student, one common mistake for the class; a key point on the grid's edge |
| `tests/platform/liveChallengeLaunchCertificationMirror.test.mjs`, `liveChallengeStandingsWiring.test.mjs` | the simulated line round held to `LineGraphRound.jsx` (its timings and refusal rule, the clock anchor, storage then the server at the start, sending and retries, prefetch, the finish and the buzzer, the reconnect), and the simulated host's round closing to the console's |

Each assertion that protects a behaviour was broken once on purpose and seen
to fail (the sign convention, a wrong option marked right, the block mix,
ambiguity, the method rule, the repeat rule, canonical signs, the random
source; and through the emulator, the preview gate and the report's key).
Phase 3's were too: a check on press or mid-drag, the label under the finger
or on the wrong side, the ✓/✗ a third of the way along or blind to labels,
the page's focus ring, counting a mistake per attempt instead of per student,
a mistake shown for one student, the reveal's method headline, Classic and
Sprint ending only on the clock (and Rush closing early), the create branch
and the student's question-set flags. That nothing is public while a round
can be answered is checked through the emulator and in the browser, not by
mutation. Phase 4's were too: the Rush grid without its opt-out, a bank
question's steps centred again, the console still saying "preview" or
deciding the launch on its own, the modes back in preview (and through the
emulator, a regular teacher refused); the simulated round drifting from the
screen (its timings, an outage taken as final, the wall clock for its anchor
or its buzzer, a queue not stored, a finished set held back, nothing sent on
reconnect, a resume that forgets the stored queue — and at class scale, a
reload whose stored lines are never sent); the simulated host's finished
rule, grace, round scope and second look; and the plans' old ±4 offsets.

---

## 13. Later

Inequalities (dashed or solid boundary, shading — the same line tool), systems
(graph two lines, tap the intersection), real-world contexts, a Warm-Up link
for Classic, student self-practice outside a live game; a first try's
misconception code as evidence (§11, LC12). (Per-student accommodations — the
slope helper from a plan, extended time after the buzzer in Classic and
Sprint — are built: §7. Mastery evidence is built and switched off: §11.)
