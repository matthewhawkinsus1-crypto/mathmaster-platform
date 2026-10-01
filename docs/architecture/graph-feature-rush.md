# Graph Feature Rush

A Live Challenge game mode: every student gets their own graphs and races the
round clock to tap the features asked for — x-intercepts (zeros, roots), the
y-intercept, the vertex, the maximum, the minimum — or to answer "Does Not
Exist". The graph dominates the screen; a correct tap is acknowledged in the
next frame; a graph with several targets completes itself when the last one is
found.

It is built **on** the Live Challenge engine (`live-challenge-engine.md`), not
beside it. Lifecycle, the authoritative clock, receipts and idempotency,
ranking, round and match results, finalization and rewards are the engine's;
the rush adds a question source, a way for a student to receive and answer
questions, and screens.

```
 teacher setup ─► createLiveChallenge (mode: graphFeatureRush) ─► lobby ─► start
                                                                            │
   ┌──────────────────────── each round (engine lifecycle) ────────────────┘
   │  student device                              server
   │  getGraphFeatureRushRound ───────────────►  place in the round (from receipts)
   │                            ◄───────────────  + next graphs, regenerated from the seed
   │  tap → graded at once (same hit test)
   │  queue → submitGraphFeatureRushAttempts ─►  one transaction: regrade, receipts,
   │        ◄─ verdicts + state (device defers)   private + public player rows
   │  deadline (room clock) ─► host closes the round ─► ranked round result,
   │                                                     each player's lastRound
   └─ Next Round … Finish ─► match result ─► report, rewards, private cleanup
```

---

## 1. Module map

| Module | Owns | Runs on |
| --- | --- | --- |
| `graphFeatureRational.mjs` | exact rational arithmetic for every coordinate a student can be asked to tap | server, tests |
| `graphFeatureRegistry.mjs` | canonical features, their vocabulary, target ids | everywhere |
| `graphFeatureCurves.mjs` | graph specs (`kind` + parameters), evaluation, continuous segments, asymptotes, endpoint dots, sampling for drawing | everywhere |
| `graphFeatureFamilies.mjs` | the nine families: exact builders and independent analyses | server, tests |
| `graphFeatureCatalog.mjs` | a static summary of the families (names; which features each can ask, from which tier), held to the families by test | everywhere |
| `graphFeatureGenerator.mjs` | seeded schedules, view selection, visual validation, the question a student gets | server, tests |
| `graphFeatureHitTest.mjs` | screen-space tolerance and nearest-target resolution | everywhere |
| `graphFeatureRushConfig.mjs` | presets, difficulty, round limits, teacher-setting validation | everywhere |
| `graphFeatureRushRules.mjs` | the constants device and server share: attempt kinds, verdicts, request and record limits, cooldown, auto-skip | everywhere |
| `graphFeatureRush.mjs` | the submit transaction's body (`applyRushAttempts`), round state from receipts, player totals, the report | server, practice, tests |
| `src/platform/liveChallenge/rushGraphModel.js` | the drawing in unit space, screen↔graph, keyboard cursor | browser, tests |
| `src/platform/liveChallenge/rushSession.js` | a student's round on the device: local grading, queue, reconciliation | browser, tests |
| `rushStandingsModel.js`, `rushSetupModel.js` | round results and the live race from public rows; the setup as data | browser, tests |

Screens: `GraphFeatureRushRound.jsx` (student round), `GraphFeatureRushGraph.jsx`
(the SVG), `GraphFeatureRushSetup.jsx`, `GraphFeatureRushPractice.jsx`,
`GraphFeatureRushHost.jsx` (console and projector boards, report), plus
branches in `LiveChallengeStudent.jsx`, `LiveChallengeTeacher.jsx` and
`LiveChallengeArenaProjector.jsx`.

---

## 2. On the engine's contracts

The mode is a declaration in `liveChallengeModes.mjs`:

| Contract | Graph Feature Rush |
| --- | --- |
| round structure | `questionSet`: many questions per round against the clock; ranked by work score, then accuracy, then the time of the last correct completion |
| question source | `graphFeatureGenerator` — the planner stores a private seed and generator version, contributes public room fields (`graphFeatureRush.config`), and opens each round with a card ("find the features on your own graphs"), never a graph |
| question issue | `perPlayer` — each student's questions are their own; a round's question specs are read from that student's receipts (`questionSpecsFromReceipts`) |
| question spec | `allTargets`; each question records its own `targetCount` on its receipts |
| pool | 150 questions per round (the engine's `MAX_QUESTIONS_PER_ROUND`) — more than anyone completes in two minutes |
| scoring | `grandPrix` (default, with the class-size field curve) or `correctCount` |
| round limits | 1–8 rounds, 30–120 s |
| capabilities | no Second Chance, progress milestones, pace timing, closing threshold, dry run or Warm-Up link |

Every engine path that used to assume one shared question now asks the mode:
round completion and close readiness, round results (per-player specs,
`fieldSize`), the public round summary (`completed`, `accuracyPercent`), the
classic submit and progress callables (which refuse a rush room), pacing (a
rush has no closing threshold), create (round limits, capabilities, scoring
defaults) and the report.

---

## 3. Mathematics

### Features

One canonical id per feature (`xIntercept`, `yIntercept`, `vertex`, `maximum`,
`minimum`), with classroom vocabulary chosen per family and tier: "Find all
x-intercepts", "Find all zeros", "Find all roots" (roots only for
polynomials). A prompt never says how many targets there are. Adding a feature
(an axis of symmetry, a hole, an inflection point) is a registry declaration,
family support and — for a non-point geometry — a hit-test distance; nothing
in the engine changes.

### Families

Linear, quadratic, absolute value, cubic, exponential, square root, cube root,
rational (`a/(x − h) + k`) and piecewise linear — all nine. Each family
**builds** exact parameters meant to give a requested shape (two zeros, a
tangent, no maximum…) and, separately, **analyses** those parameters from
scratch. A question is issued only when the analysis agrees with the request.

Every tappable coordinate is an exact rational on the grid (integers at Easy,
halves above). Deliberately not asked in v1: the vertex of anything but a
parabola or absolute value graph; a cubic's maximum/minimum (its turning
points are relative — "the maximum" would be "Does Not Exist" beside an obvious
peak); extrema of constant functions; a piecewise extremum reached only at an
open endpoint; vertical lines.

Special cases the generator produces on purpose and the tests check: a
parabola tangent to the x-axis (one zero), triple roots, exponentials with no
x-intercept, an asymptote on the axis, square-root endpoints that are the
minimum, piecewise jumps with open and closed dots, "Does Not Exist" maxima of
upward parabolas and of lines.

### Questions

A round is cut into blocks of six slots (family, feature, variant, tier).
Every student gets the same slots in each block, in their own order, with
their own numbers: after any whole number of blocks two students have faced
the same mix, and a neighbour's screen is a different graph. Question k for a
student is a pure function of (room seed, student, round, k, settings,
generator version), so the server stores nothing it issued — it regenerates a
question to grade a tap. A room created under another generator version
refuses to issue or grade.

**Difficulty** is not bigger coefficients. Easy: integer features, one target,
friendly families and windows, no "Does Not Exist". Standard: halves, two
zeros, the plural wordings, "Does Not Exist" about one graph in eight.
Challenge: wider windows, three-zero cubics, asymptotes and domains, "Does Not
Exist" about one in five. Mixed starts easy and then mixes Standard and
Challenge.

**Visual validation** (fractions of the square view): targets 8% inside the
edges and 15% apart; both axes and asymptotes visible; enough curve on
screen; no "ghost zero" — wherever the curve comes closest to the x-axis it
either crosses (a real zero) or stays clearly away; two nearby zeros must be
separated by a visible dip; open dots clear of targets and other dots.
Measured over every slot: at most 11 build attempts, a mean under 3, and no
fallback question ever needed.

---

## 4. Hit testing

Tolerance is measured on the **screen**: a fingertip is a fingertip whether the
graph is 300 or 900 pixels wide.

| Pointer | Radius |
| --- | --- |
| touch | 26 px |
| pen, mouse, touchpad | 18 px |
| keyboard cursor | 22 px |

The radius is converted to graph units for each axis of the rendered plot and
clamped to 0.5–7% of the axis span, so a device claiming absurd pixels cannot
turn random tapping into hits (a random tap at the maximum tolerance finds a
target well under one time in twenty). A tap resolves to the **nearest**
target in tolerance units; a target already found is neither credit nor
penalty. Device and server run the same function on the same numbers — the
device clamps before sending, the server clamps again — so their verdicts
agree by construction (a property test plays thousands of random taps through
both). The keyboard cursor moves on the half grid every target sits on, so it
can land on any target exactly, and announces where it is and where the curve
is at that x.

---

## 5. Attempts, fairness and the server's authority

A batch of up to 12 attempts (`tap`, `dne`, `skip`) is graded in one
transaction against regenerated questions, in order:

- only the **current** question (the first neither completed nor skipped)
  takes attempts; a late tap for a finished graph is `resolved`, an attempt
  for a later one `outOfOrder` — so a graph completes **once**, however taps
  race, retry or replay;
- an attempt id seen before is a **replay** of its receipt;
- each recorded attempt is a `targetAttempt` receipt with what was asked
  (feature, family, tier) and where a tap landed;
- claimed times are bounded: never after arrival, never before the previous
  attempt, never more than 8 s before arrival.

**Fairness.** A wrong attempt costs 1/20 of a graph in the round's work score
(exact score units, never below zero). The device pauses input after the
second miss in a row (600 ms, growing 600 ms per further miss, at most 3 s).
The **eighth miss on a graph skips it**, recorded by the server with that
miss, so the rule holds for a device that never sends the skip. Record
limits: 30 attempts per graph, 400 per round, 1,800 per match (the private
record is one document; that is about 760 KiB of receipts). Simulated 60-s
rounds (through the real pipeline, cooldowns and flashes included):

| Player | Graphs | Accuracy | Work score |
| --- | --- | --- | --- |
| careful (2.6 s a feature, 10% slips) | 18.0 | 95% | 17.95 |
| struggling (6 s a feature, 30% slips) | 6.8 | 70% | 6.77 |
| axis sweeper | 3.3 | 9% | 1.61 |
| random sprayer | 0.5 | 1% | 0.00 |

What a modified client could still do: skip the cooldown (the miss penalty and
the eighth-miss skip still apply), or read a question's targets from the
response. The targets travel with the graph so feedback is instant; the graph
itself shows where its features are, so withholding them would cost the game
its speed and protect nothing. The answer key is never on a shared screen.

---

## 6. Scoring

### Correct Count

One point per completed graph, banked as the server confirms it; the match
total is graphs completed. Ties: match accuracy (hits ÷ attempts), then rounds
played.

### Grand Prix

Each round ranks the field by work score, then accuracy, then the earliest
last correct completion. Placement earns championship points on a curve sized
to the class: 1st earns 12, last earns 3, everyone between on a straight line
(rounded half up), ties share the place's points, and a player who completed
nothing earns nothing.

| Players | Points by place |
| --- | --- |
| 2 | 12 3 |
| 4 | 12 8 6 3 |
| 10 | 12 10 9 8 7 7 6 5 4 3 |
| 20 | 12 11 10 10 9 9 8 8 8 7 7 6 6 6 5 5 4 4 3 3 |
| 30 | 12 11 10 10 10 10 9 9 9 9 8 8 8 7 7 7 7 6 6 6 5 5 5 5 4 4 4 4 3 3 |
| 35 | 12 11 11 10 10 10 10 9 9 9 9 8 8 8 8 7 7 7 7 7 6 6 6 6 5 5 5 5 4 4 4 4 3 3 3 |

Because every round pays at most 12 and at least 3, one runaway round cannot
decide a match, and a student who falls behind can win it back — the tests
include a five-player match where raw totals would crown one student and the
championship goes to another. The match ranks by championship points, then
round wins, then raw work.

**Final ranking rule.** Round: work score ↓, accuracy ↓, last correct
completion time ↑; equal on all three is a tie (shared rank). Match (Grand
Prix): championship points ↓, round wins ↓, raw score ↓. Match (Correct
Count): graphs ↓, accuracy ↓, rounds played ↓. Never by name, device or
arrival order.

---

## 7. State, time and reconnection

- **Time is the room's.** Each screen anchors the room's `startsAt`/`endsAt`
  to its monotonic clock once, from the calibrated server time; a device clock
  change moves nothing and a refresh rejoins the same deadline. Input stops at
  zero; a request arriving after the deadline's bounded grace is refused.
- **The host closes each round** about 1.5 s after its deadline (past the
  arrival grace), with the ordinary idempotent close command — from the
  teacher's console or projector, whichever is open. Next Round unlocks only
  from a closed round, so every class sees its results.
- **The device's queue** is written to `localStorage` before anything is sent,
  sent one request at a time (gathered for ~0.7 s), retried with backoff and
  on `online`, flushed at the buzzer and when the page is hidden. After a
  refresh the stored queue is resent first (the server answers replays), then
  the device asks where it stands. A refusal (round closed, stale token, not
  this student's) is dropped, never retried.
- **Reconciliation.** Whenever its queue drains, the device compares its place
  (graph, found targets) with the server's and adopts the server's if they
  differ; counts always come from the server.
- **Duplicates.** One completion per graph (cursor ordering and the engine's
  `planAttempt`), one receipt per attempt id, one placement per round
  (`roundPlacements[round]`), one join per student per room.

---

## 8. Screens

**Student.** A full-screen surface (fixed, safe-area aware): the prompt, the
graph as the largest square that fits, "Does Not Exist" and Skip in the same
place on every graph, the round, the student's count and the clock. Portrait
stacks them; landscape puts the controls beside the graph. Feedback: a found
point draws a mark with its coordinates; a miss draws a fading cross and
names the feature it was not; the cooldown dims the graph and shows a draining
bar. The standings listener pauses during an open rush round, so a class's
taps do not wake every screen; between rounds the student sees their own
round — graphs, accuracy, place, points, championship total and standing.

**Teacher.** Graph Feature Rush is a game type in the existing Create a
challenge panel: presets as starting points, then families, features,
difficulty, rounds, time and scoring (with the ladder for the class size).
Rewards use the same choice as every Live Challenge (`ChallengeRewardSettings`:
the standard Class Points achievements, plus a Practice Pass for the top
places and a Champion badge if the teacher wants them); placement comes from
the rush's final ranking. An impossible combination is explained before
anything is created. "Try it yourself first" plays server-generated sample
graphs on the student's screen, graded locally, recording nothing.

**Host and projector.** The live race (graphs completed this round), then the
round's results with the points each place earned, then the championship.
Never a graph, an answer or a coordinate.

**Accessibility.** Keyboard play with a visible cursor (shown only to keyboard
users) and spoken coordinates; a polite live region for prompts, feedback and
30-/10-second warnings; 44 px+ controls; theme tokens for the graph in light
and dark; reduced motion turns the pops and fades off.

---

## 9. Data

| Where | What |
| --- | --- |
| `liveChallengeRooms/{room}` | `challengeMode: 'graphFeatureRush'`, `graphFeatureRush: { config, generatorVersion }` (no seed) |
| `…/players/{key}` | `score`, `rawScore`, `correctCount`, `roundsAnswered`, `matchAccuracy`, `rushRound`, `rushRoundCompleted`, `rushActiveAt`, and after a close `lastRound: { roundIndex, rank, fieldSize, completed, accuracyPercent, workScore, matchPointsAwarded, participated }` |
| `liveChallengePrivate/{room}` | `graphFeatureRush: { seed, config, generatorVersion }` |
| `…/players/{studentId}` | receipts (`targetAttempt`, with feature, family, tier, tap position, pointer), totals |
| `liveChallengeReports/{room}` | `graphFeatureRush`: graphs completed, tap accuracy, skips, "Does Not Exist" accuracy, by feature and by family (hardest first), per student |

---

## 10. Performance

- **Feedback**: tap to the next frame after the mark appears — median 18 ms,
  p95 27 ms, on a Chromebook profile with the CPU slowed 4× (browser harness).
- **Requests**: a fast player sends about one request a second (taps are
  gathered); each is one transaction reading the room and the private player
  and writing both player rows. Local emulator: median 63 ms, p95 181 ms.
- **Listeners**: during a rush round a student listens to the room and their
  invite only; the teacher and projector listen to the players.
- **Bundles**: the student round is its own lazily loaded chunk (≈38 kB,
  13 kB gzip) fetched while the lobby waits; the generator and families never
  ship to a browser; the teacher's setup panel and practice load only when a
  rush is chosen.
- **Known cost**: the legacy `adjustLiveChallengeExperienceScore` trigger
  (`functions/entry.js`) fires on every private-player write and returns at
  once for a rush; deleting it in a deployment that removes it explicitly
  would save one no-op invocation per request.

---

## 11. Testing

- `tests/platform/graphFeatureRushMath.test.mjs` — every family, feature,
  variant and tier generates valid questions verified by an independent
  oracle; special cases; vocabulary; determinism; schedules; the "Does Not
  Exist" share; the catalog equals the families.
- `graphFeatureRushPlay.test.mjs` — hit testing on every device size, the
  attempt pipeline, replays, races, limits, claimed times, the eighth-miss
  skip, round state equal to the engine's round summary.
- `graphFeatureRushEngine.test.mjs` — ranking, Grand Prix for 2/4/10/20/30+
  players, comebacks, Correct Count, results, the report, reward evaluation,
  and the bot fairness simulation.
- `graphFeatureRushDevice.test.mjs` — the drawing, coordinates, keyboard
  cursor, the device session, and device–server agreement over thousands of
  random taps.
- `graphFeatureRushScreens.test.mjs` — the setup and results models, the
  shared Rewards choice, and source contracts for every screen's wiring.
- `tests/integration/graphFeatureRush.test.mjs` (emulator) — full games
  through the callables: replays, refresh, stale tokens, deadlines, the
  eighth-miss skip, closes and results, finish, the next game, 10 and 35
  students.
- `tests/browser/graphFeatureRushGame.mjs` (QA harness, not CI) — whole games
  in real browsers against the real server code (see its header).

---

## 12. Deferred

- **A server-side close** for an expired rush round when no host screen is
  open (today the console or projector closes it; students wait on "Time!").
- **Misconception analytics**: receipts already record where wrong taps land
  (e.g. the y-intercept tapped for "zeros"); the report does not yet group them.
- **More features** (axis of symmetry, holes, relative extrema, inflection
  points) and families (logarithmic, trigonometric, higher-degree
  polynomials) through the registry and family contracts.
- **Warm-Up link** for a rush (the capability is off).
- **Teacher-tunable fairness** (cooldown, auto-skip) and per-student
  accommodations such as larger tolerance.
- **Deleting the legacy experience trigger** (section 10).
