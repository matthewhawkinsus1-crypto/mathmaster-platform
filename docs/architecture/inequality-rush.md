# Inequality Graphing Rush

A Live Challenge game mode: every student gets their own inequalities and races
the round clock to graph each one on a number line — dots for the endpoints
(● closed, ○ open), arrows for "keeps going", ✓ Check — or to answer
**No Solution** when nothing makes the inequality true. Kinds of inequality
are the teacher's to toggle: simple, reversed, compound "and", compound "or",
solve first (one step, two steps) and absolute value. A wrong answer gets a
hint about the one thing that is off — the sign flip, which way, open or
closed — and the third wrong answer shows the answer and moves on.

It is built **on Graph Feature Rush** (`graph-feature-rush.md`), which is built
on the Live Challenge engine (`live-challenge-engine.md`). An inequality item
is a rush question with one target, its solution set — a domain on its own
number line — so the rush's attempts, receipts, round state, pacing, ranking,
round screen, host views and report serve this game unchanged. What this game
adds is a question source (its generator and settings), a number line for the
round screen, its hints and its words.

```
 teacher setup ─► createLiveChallenge (mode: inequalityRush) ─► lobby ─► start
                                                                          │
   ┌─────────────────────── each round (engine lifecycle) ───────────────┘
   │  student device                               server
   │  getGraphFeatureRushRound ────────────────►  place in the round (receipts)
   │                            ◄────────────────  + next items, from the seed
   │  tap the line → a dot (this device only)      (inequalityRush.mjs)
   │  ✓ Check / No Solution → graded at once
   │  queue → submitGraphFeatureRushAttempts ──►  one transaction: regrade,
   │        ◄─ verdicts + state                    receipts, player rows
   │  deadline ─► host closes ─► round results + the round's guide published
   └─ Finish ─► match result ─► report (`inequalityRush`), rewards, cleanup
```

---

## 1. Module map

| Module | Owns | Runs on |
| --- | --- | --- |
| `inequalityRush.mjs` | the kinds, difficulty, presets and settings (`normalizeInequalityRushConfig`); the item builders and their exact answers; the block schedule; `generateInequalityQuestion`, `publicInequalityQuestion`; hints (`inequalityHint`) and the report's labels | server, device, tests |
| `inequalityReading.mjs` | the guide a round publishes at its close | server, tests |
| `numberLineSets.mjs` | sets on a number line, the tap model, notation, diagnosis (Graph Feature Rush's domains and ranges share it) | everywhere |
| `graphFeatureRush.mjs` | attempts: `applyRushAttempts` grades a check by set equality, a "No solution" press as a "Does Not Exist" press | server, practice, tests |
| `graphFeatureRushRules.mjs` | the mode ids the device recognises (`isRushModeId`), the three-miss rule for number-line questions (`rushAutoSkipMisses`), `RUSH_SIGN_FLIP` | everywhere |
| `liveChallengeModes.mjs` | `inequalityRushMode`: question source `inequalityGenerator`, per-player question-set rounds, the rush's pool, Grand Prix on the field curve or Correct Count | everywhere |
| `src/platform/liveChallenge/numberLineModel.js` | where each number sits at a width, labels that fit, taps and keys on the ticks, what a drawing puts on the line | device, tests |
| `src/components/liveChallenge/InequalityNumberLine.jsx` | the number line a student taps | device |
| `src/platform/liveChallenge/rushSession.js` | the device session (shared): taps, arrows, ✓ Check, No Solution, notation (`lineNotation`), feedback words | device, tests |
| `src/platform/liveChallenge/inequalitySetupModel.js`, `InequalityRushSetup.jsx` | the teacher's setup | teacher console |

## 2. Items

Every item is built **backwards from its answer**, so every endpoint is a whole
number in [−9, 9] (a tick inside the −10…10 line) and every answer is exact.

| Kind | Examples | Variants by tier |
| --- | --- | --- |
| `simple` | x ≥ −2 | — |
| `reversed` | 3 > x | — |
| `compoundAnd` | −1 ≤ x < 4, x > 1 and x ≤ 5 | between (Easy); **no solution**: x ≥ 5 and x < 2 (Standard); both the same way: x > 1 and x ≥ 4 (Challenge) |
| `compoundOr` | x < −2 or x ≥ 3 | outside (Easy); **every number**: x ≤ 4 or x > 1 (Standard); both the same way (Challenge) |
| `oneStep` | x + 4 > 1, 3x ≤ −6, x/2 ≥ −1 | Easy keeps coefficients positive; Standard divides by a negative (−2x < 8, −x ≥ 3); Challenge adds −x/3 > 1 |
| `twoStep` | 2x − 3 > 5, x/2 + 3 ≤ 1 | negatives from Standard (−3x + 1 ≤ 7); at Challenge more of them, and the constant first (5 − 2x > 11) |
| `absolute` | \|x\| < 3 (Easy, centered at 0), \|x − 2\| ≥ 3 | **no solution** (\|x − 1\| < −2) and **every number** (\|x\| ≥ −3) from Standard; at Challenge isolate first (\|2x − 4\| ≤ 6, \|x + 1\| + 3 > 5), a single point (\|x − 3\| ≤ 0) and every number but one (\|x − 3\| > 0) |

Every kind has an Easy variant, so any kind plays at any difficulty;
difficulty decides which variants, numbers and forms come up. **Mixed** ramps as
Graph Feature Rush does: a gentle first block, then Standard and Challenge.

An item whose solving multiplies or divides by a negative also carries
`flipSet`: the set a student graphs who forgets to flip the sign. The hint and
the report name that slip exactly.

**An item with no solution has no target** (`targets: []`), as a graph without
the asked-for feature has none: "No solution" is the rush's "Does Not Exist"
press, right exactly there. Every item offers the button, and the round
screen draws every item the same way, so nothing on the screen says which kind
it is.

### The schedule

As for graphs: item k of a student's round is a pure function of (room secret,
student, round, k, settings, `INEQUALITY_GENERATOR_VERSION`). Each block of six
is shared by every student in the round — the same kinds and variants, each
student in their own order with their own numbers — so no one's race is
easier. A slot first settles whether it has a solution, at the catalog's share
of "no solution", then picks a kind not yet used in its block. Two items in a
row are never the same inequality (an odd-numbered item passes over either
neighbour's text).

## 3. Settings and presets

`normalizeInequalityRushConfig` validates `{ presetId, itemTypes, difficulty }`
(at least one kind) and throws `InequalityRushConfigError` with a sentence a
teacher can act on; `createLiveChallenge` and `previewInequalityRush` turn it
into `invalid-argument`. A preset fills in what a request leaves out and stays
named only while the settings still match it.

| Preset | Kinds | Difficulty | Time |
| --- | --- | --- | --- |
| Graph It | simple, reversed | Easy | 3 × 60 s |
| Solve and Graph | one step, two steps | Standard | 3 × 90 s |
| Compound Inequalities | "and", "or" | Standard | 3 × 90 s |
| Absolute Value | absolute value, "and", "or" | Standard | 3 × 90 s (Algebra II's default) |
| Every Kind | all seven | Mixed | 3 × 90 s |

Rounds 1–8, 30–120 s, Grand Prix (field curve) or Correct Count — the rush's
limits and scoring.

## 4. Answering

- **A tap on the line** drops a dot at the nearest whole number: once ●, twice
  ○, a third time gone; two dots at most (`numberLineSets.tapNumber`). A tap
  anywhere on the line's panel counts, above or below it. The keyboard moves a
  cursor along the ticks (← →, Shift for five, Home/End) and Enter taps; a
  screen reader hears the number and the dot on it.
- **The line's own end arrows** mean "keeps going": a tap past the outermost
  tick by more than half a tick's spacing lands on the arrow there and turns
  it on or off (`numberLineModel.lineEndAtPixel`); the keyboard steps one
  past −10 or 10 onto it. There is no separate arrow button. Two dots shade
  between them; two dots and both arrows shade outside; both arrows alone are
  every number; an open dot and both arrows, every number but one.
- The notation updates live in both forms, inequality first:
  `x ≥ −3 · [−3, ∞)` — Algebra I students see both as they build.
- An item is worth the taps its answer takes — a ● 1, a ○ 2, an arrow 1,
  ✓ Check 1; "No Solution" is one press — and a correct answer earns them all
  (Graph Feature Rush's "a point a correct tap", `rushQuestionWeight`).
- **✓ Check** is the attempt, offered once the drawing names a set, graded by
  set equality. **No Solution** is the other attempt.
- **Wrong** gets a hint (`inequalityHint`), in this order:
  - the drawing is exactly `flipSet`: "Did you multiply or divide by a
    negative? That flips the sign."
  - the same two dots, the wrong shape: "'Or': either part can be true —
    shade outside." / "'And': both parts must be true — shade between." (for
    an absolute value: more or less than a distance from the center)
  - the same dot, the other way: "Which way? Test a number: does it make the
    inequality true?"
  - the right numbers, a dot's style wrong: "Open or closed at the left end?
    ≤ and ≥ include the number; < and > leave it out."
  - a wrong number on a solve-first item: "Check the number: solve for x
    first."
  - a drawing on an item with no solution: "Test a number you shaded: does it
    make the inequality true?"; No Solution on an item that has solutions:
    "It has solutions — test a number."
- **The third wrong answer** — checks and presses alike, on every item
  (`rushAutoSkipMisses`: three for any number-line question) — shows the
  answer on the line in the found colour, with its notation, for
  `RUSH_REVEAL_PAUSE_MS`, and moves on; the server records the skip with that
  answer.

## 5. Server

The game plays on Graph Feature Rush's callables. `functions/index.js` keeps
the games that do in one table, `RUSH_QUESTION_SOURCES`, by question source:
where a room's private seed and settings live (`inequalityRush`), what a
refusal calls the game, and its generator (version, `generate`,
`publicQuestion`). `loadGraphFeatureRushContext` reads the room's source from
it, so `getGraphFeatureRushRound` issues and `submitGraphFeatureRushAttempts`
grades an inequality room with the same code as a graph room.

| Piece | What it does |
| --- | --- |
| `INEQUALITY_RUSH_PLANNER` | `plan`: placeholder round ids, a fresh private seed (`liveChallengePrivate/{room}.inequalityRush: { seed, config, generatorVersion }`), the public settings (`room.inequalityRush: { config, generatorVersion }`); `openRound`: a card (`kind: "inequalityRush"`, the kinds and difficulty — never an item) and the round's guide kept privately |
| `liveChallengeRevealableRounds` | publishes the guide at the round's close, as a rush round's |
| `questionSetModeReport` | the rush's report with `INEQUALITY_REPORT_LABELS`, under `inequalityRush` |
| `previewInequalityRush` | sample items for a teacher's settings (a fresh seed, nothing written) — the practice round's source |

**Generator version.** A room is graded with the generator it was created
under, or not at all: a room whose `generatorVersion` is not
`INEQUALITY_GENERATOR_VERSION` refuses to issue or grade ("This Inequality
Graphing Rush was created before an update. Ask your teacher to start a new
game."). Bump it with any change that would generate a different item for the
same seed, and deploy outside class time.

**Stored shapes.** Nothing an item carries is stored: items are regenerated.
A check's receipt keeps the drawing with its dots as `{ value, closed }`
objects — Firestore refuses an array directly inside an array — and its
`diagnosis`: `signFlip` (`RUSH_SIGN_FLIP`) when the drawing is the item's
`flipSet`, else the number-line diagnosis (`inclusion`, `direction`,
`endpoint`, `extent`, `several`).

## 6. Screens

- **Student:** the rush's round screen (`GraphFeatureRushRound.jsx`). For an
  inequality item it draws `InequalityNumberLine` — the area's width, centred
  — and offers ✓ Check, **No Solution** and Skip (the arrows are the line's
  own; on a laptop the buttons stack in the side panel, as a domain's do). The prompt keeps its inequality on one line;
  its words come from `rushGameWords` ("inequalities", not "graphs").
- **Teacher:** "Inequality Graphing Rush" in the game type list; its setup
  panel (presets, the seven kinds, difficulty, rounds, time, scoring); "Try
  it yourself first" plays `previewInequalityRush` items on the student's own
  screen (`GraphFeatureRushPractice` with `game`), nothing recorded.
- **Host and projector:** the rush's race views, in this game's words; the
  settings line lists the kinds.
- **Report:** completed, accuracy, skips, "No Solution" accuracy, by kind of
  inequality (hardest first), and what wrong checks got wrong, most common
  first (the sign flip named as such). Permanent deletion takes a student out
  of `inequalityRush.players` (`REPORT_STUDENT_ROW_PATHS`, SI07).
- **Play Again** replays the kinds and difficulty (`challengeReplayModel.js`).
- **Last time:** a finished game leaves its class a memory, and the next setup
  opens with its card — "Period 2 last played this on Oct 28 at Standard,
  3 × 90 s, 58% accuracy → try Easy" — with **Use last settings** and **Use
  suggestion**; at Easy the suggestion drops the weakest kind ("try it
  without absolute value"). See `live-challenge-engine.md` → Finalization
  effects.

## 7. The round's guide

`inequalityReading.mjs`: the same text for every student, from the game's
settings alone, titled "How to graph inequalities" (`guideTitle`; a guide may
now carry its own title, read by `challengeSolutionModel.solutionTitle`). One
line each: open or closed; which way (test a number); a reversed inequality;
the sign flip (above Easy, with solve-first kinds); "and" and "or"; absolute
value; and, above Easy with the kinds that have them, "No Solution" and the
whole line. Seven lines at most — the projector's limit — and one of slips.

## 8. Tests

- `tests/platform/inequalityRush.test.mjs`:
  - every item's answer against an **independent reading of its own text**
    (the inequality turned into a predicate, evaluated at every half-integer
    from −12 to 12 and far out both ways), at every difficulty;
  - every answer drawable with the tap model, and no target where nothing
    works;
  - variants by difficulty, the sign-flip set, the share of "no solution";
  - determinism, shared blocks, no repeats;
  - settings and presets, the mode's declaration;
  - server grading (set equality, the flip's diagnosis, "No solution"), the
    third-miss skip on device and server;
  - hints, the device session, and **device–server agreement** over random
    play;
  - the number line's geometry, the report and its deletion rows, the guide,
    and the screens' and server's wiring.
- `tests/integration/inequalityRush.test.mjs` (emulator): a whole game
  through the callables — a private seed, a card for a round, each student's
  own items, checks stored with their diagnosis (the flip), No Solution, the
  third-miss skip, the guide published at the close, the report under its own
  key, refusals (no kinds, a stale generator) and the preview.
