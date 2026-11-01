# Graph Feature Rush

A Live Challenge game mode: every student gets their own graphs and races the
round clock to tap the features asked for — x-intercepts (zeros, roots), the
y-intercept, the vertex, the maximum, the minimum, the asymptotes — or to
answer "Does Not Exist" (and, in a game with off-screen features, "Off
screen"). The graph dominates the screen; a correct tap is acknowledged in the
next frame; a graph with several targets completes itself when the last one is
found. Every curve carries an arrowhead where it leaves the screen and a dot
where it ends, so a student reads where it goes.

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
| `graphFeatureCurves.mjs` | graph specs (`kind` + parameters, an optional restricted `domain`), evaluation, continuous segments, asymptotes, endpoint dots, where each stretch of the curve leaves the screen (`curveRuns`), sampling for drawing | everywhere |
| `graphFeatureFamilies.mjs` | the nine families: exact builders and independent analyses | server, tests |
| `graphFeatureCatalog.mjs` | a static summary of the families (names; which features each can ask, from which tier), held to the families by test | everywhere |
| `graphFeatureGenerator.mjs` | seeded schedules, view selection, visual validation, the question a student gets (its random source, `seededRandom.mjs`, is shared with Graph the Line and re-exported here) | server, tests |
| `graphFeatureHitTest.mjs` | screen-space tolerance and nearest-target resolution | everywhere |
| `graphFeatureRushConfig.mjs` | presets, difficulty, round limits, teacher-setting validation | everywhere |
| `graphFeatureRushRules.mjs` | the constants device and server share: attempt kinds, verdicts, request and record limits, cooldown, auto-skip | everywhere |
| `graphFeatureRush.mjs` | the submit transaction's body (`applyRushAttempts`), round state from receipts, player totals, the report | server, practice, tests |
| `src/platform/liveChallenge/rushGraphModel.js` | the drawing in unit space (curve, grid, asymptotes, dots, arrowheads), screen↔graph, keyboard cursor, open-dot taps | browser, tests |
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
`minimum`, `asymptote`), with classroom vocabulary chosen per family and tier: "Find all
x-intercepts", "Find all zeros", "Find all roots" (roots only for
polynomials). A polynomial with non-real roots — a parabola that never meets
the axis, a cubic with one real root — is only ever asked for its
x-intercepts: its roots and zeros include the complex ones, so "Find all
roots" answered "Does Not Exist" (or with one point) would be false. A prompt
never says how many targets there are. Adding a feature
(an axis of symmetry, a hole, an inflection point) is a registry declaration,
family support and — for a non-point geometry — a hit-test distance; nothing
in the engine changes.

**Asymptotes** were added that way: the first feature whose targets are
**lines** (`geometry: 'line'`: `{ orientation: 'vertical', x }` or
`{ orientation: 'horizontal', y }`). "Find all asymptotes": a rational graph
has two (x = h, y = k), an exponential one (y = k, on the side it approaches,
if its domain keeps that side), every other family none — "Does Not Exist".
Rational from Standard, exponential from Easy; an asymptote on an axis (x = 0,
y = 0) at Challenge. A slanted line, and piecewise pieces (never level), have
none; whether a level line is its own asymptote is a debate, so it is never
asked. On an asymptote question the dashed lines are not drawn (they are the
answer); each is drawn, labelled "x = 2", when found. Everywhere else they are
drawn in their own colour (`--mm-rush-asymptote`, the theme's accent), over the
axes, so one lying on an axis still shows.

The existing presets keep the five features they had
(`CLASSIC_GRAPH_FEATURE_IDS`): a feature added to the registry is the
teacher's to choose, never slipped into a preset a class already plays.

### Families

Linear, quadratic, absolute value, cubic, exponential, square root, cube root,
rational (`a/(x − h) + k`) and piecewise linear — all nine. Each family
**builds** exact parameters meant to give a requested shape (two zeros, a
tangent, no maximum…) and, separately, **analyses** those parameters from
scratch. A question is issued only when the analysis agrees with the request.

**Restricted domains (rays and segments).** A line, parabola, absolute value
or exponential graph may carry `domain: { from, to }`, each end `{ x, closed }`
or null. Its analysis is the same graph's, restricted: an intercept counts
only where the domain includes it, the vertex only if it is on the graph, and
a maximum or minimum is worked out exactly from the closed ends, the turning
point and where the graph heads past an open side (`restrictedExtreme`). They
are asked as intercept variants:

| Variant | From | The question |
| --- | --- | --- |
| `rayFromZero` (line, parabola, absolute value, exponential) | Standard | a ray whose CLOSED end is on the x-axis: that end is the zero, and counts |
| `rayFromAxis` (the same four) | Standard | a ray from a closed end on the y-axis: the y-intercept |
| `rayOpenAtZero`, `rayOpenAtAxis` | Challenge | the same with an OPEN end there: not on the graph, so Does Not Exist |
| `cutOneZero` (parabola, absolute value) | Challenge | cut at the vertex, so only one of its two zeros is on the graph |
| `segmentShort` (line) | Challenge | a segment that stops at least 1.5 units short of the axis it heads for: Does Not Exist |

A restricted graph is asked for its x-intercepts or zeros, never its "roots"
(the polynomial's roots ignore the cut).

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
refuses to issue or grade (the current version is 3: arrows and endpoints,
restricted domains, asymptotes, off-screen features).

**Off-screen features** are a layer a teacher turns on (`offScreen` in the
config; off by default and in every preset). Variants flagged `offScreen`
build a graph whose feature exists where the generator then chooses a view
that leaves it out — every target at least 10% of the span past an edge — and
the student answers **"Off screen"**: the arrows show the curve keeps going
to it. They are the ones a student can infer from what is on screen: a line's
x- or y-intercept (Standard), a parabola's vertex (Standard; the prompt says
it has one), and at Challenge an absolute value graph's vertex and a wide V's
two x-intercepts (its vertex on screen below the axis). The view is the widest
symmetric window that keeps the family's anchors (the y-intercept for a hidden
zero, the zero for a hidden y-intercept, the vertex of a V) well inside and
the feature out; a hidden zero is never approached on screen. A game with the
layer offers "Off screen" on every graph, so the button never hints. It starts
at Standard and needs a family and feature that can hide (graphFeatureCatalog
`GRAPH_FAMILY_OFF_SCREEN`, held to the families by test); otherwise the
config is refused with a sentence. The public question carries
`offScreen: true` and `offScreenTargets` (the reveal names where it was);
"Does Not Exist" on it is a miss.

Each slot of a block first settles whether its answer exists — "Does Not
Exist" at exactly the tier's share — and only then picks a (family, feature)
not yet used in the block on that side. (Avoiding repeats across the whole
catalog drifted the share: a maximum-only Challenge game, where most families
have no maximum, drew "Does Not Exist" for about two answers in five.) Two
questions in a row are never the same graph asked the same way: an
odd-numbered question passes over the graph of either neighbour with its
family and feature, so every adjacent pair has one free and one checked
member and grading never regenerates more than three questions.

**Difficulty** is not bigger coefficients. Easy: integer features, one target,
friendly families and windows, no "Does Not Exist". Standard: halves, two
zeros, the plural wordings, "Does Not Exist" about one graph in eight.
Challenge: wider windows, three-zero cubics, asymptotes and domains, "Does Not
Exist" about one in five. Mixed starts easy and then mixes Standard and
Challenge.

**Visual validation** (fractions of the square view): targets 8% inside the
edges and 15% apart; both axes and asymptotes visible; enough curve on
screen; **the curve leaves the screen only at its ends** — each continuous
piece is on screen as one stretch, ending at a dot (its own end, inside the
view) or by leaving through an edge, where the screen draws an arrowhead, so
an arrow always means "keeps going" and never "comes back"; no stretch turns
back within 1.2% of the top or bottom edge (it would look like an exit); a
restricted domain's ends 6% inside the view, so every end is a dot on screen;
a graph that ends on the x-axis leaves it promptly (well clear of it within
12% of the width of its end); no "ghost zero" — wherever the curve comes closest to the x-axis it
either crosses (a real zero) or stays clearly away; **every zero is readable
where it is drawn** — the stretch around it where the curve lies on the axis
(within 1.5% of the height) reaches at most 6% of the width to either side
(10% for a curve that touches and turns or flattens through its zero, which
its symmetry keeps centred), is centred on the zero within 2%, and never runs
off the view (a shallow square-root or cube-root crossing that lay along the
axis for a sixth of the width was a guess, not a reading); two nearby zeros
must be separated by a visible dip; open dots clear of targets and other dots;
a lopsided Challenge window is at least 6 units each way (a 2-by-2 window
flattened a cubic into a line). Below Challenge a piecewise y-intercept never
sits on the split, so the filled or open dot is never the whole question.
Measured over every slot (generator 3, 40 seeds each, 7,040 questions): a
mean of 1.23 build attempts, the worst 17 (cap 80), and no fallback question
ever needed.

---

## 4. Hit testing

Tolerance is measured on the **screen**: a fingertip is a fingertip whether the
graph is 300 or 900 pixels wide.

| Pointer | Radius |
| --- | --- |
| touch | 26 px |
| pen, mouse, touchpad | 18 px |
| keyboard cursor | 22 px |

A **line target** (an asymptote) is found by a tap anywhere near it: its
distance is measured across the line only, in the same tolerance units. Two
asymptotes cross, so a tap near the crossing reaches both; it finds the
nearest one not yet found, and is "already found" only when every target in
reach has been. Point targets are 15% apart, so a tap never reaches two of
them and this changes nothing for them. A miss on an open dot is told "Open
dot — that point isn't on the graph." (the device's words; the server records
a miss like any other).

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

A batch of up to 12 attempts (`tap`, `dne`, `offScreen`, `skip`) is graded in
one transaction against regenerated questions, in order ("Does Not Exist" is
right only when the feature is absent; "Off screen" only when it exists past
the edge):

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
second miss in a row (1 s, growing 1 s per further miss, at most 4 s).
The **eighth miss on a graph skips it**, recorded by the server with that
miss, so the rule holds for a device that never sends the skip. Record
limits: 30 attempts per graph, 400 per round, 1,800 per match (the private
record is one document; that is about 760 KiB of receipts). Simulated 60-s
rounds of the Algebra 1 Functions preset on a phone (through the real
pipeline, fingertip tolerance, cooldowns and flashes included; means over 12
students):

| Player | Graphs | Accuracy | Work score |
| --- | --- | --- | --- |
| careful (2.6 s a feature, 10% slips) | 18.5 | 92% | 18.42 |
| struggling (6 s a feature, 30% slips) | 5.5 | 60% | 5.32 |
| axis sweeper, taps spaced to the tolerance | 12.0 | 26% | 10.28 |
| random sprayer | 0.0 | 0% | 0.00 |

Intercepts lie on an axis, so a sweep can find them without reading the
graph. With the earlier 600 ms cooldown steps a tolerance-spaced sweep matched
careful readers on an intercept-only game (16.8 graphs each); with 1 s steps
it completes about two thirds as many (11.6), at about a quarter accuracy —
plain in the teacher's report — while careful readers lose nothing. Measured
over 100 rooms of intercept-only Standard games (every family), a sweep
completes 62% of what careful reading does, under generator 2 and 3 alike;
any one room is luck (a room whose first blocks hold no "Does Not Exist"
graph lets a lucky sweep pass an unlucky reader there, in about a quarter of
rooms), so the test measures eight rooms. A sweep
can still outscore a student who reads very slowly; the cooldown is not
allowed to punish honest mistakes harder than that.

What a modified client could still do: skip the cooldown (the miss penalty and
the eighth-miss skip still apply), or read a question's targets from the
response. The targets travel with the graph so feedback is instant; the graph
itself shows where its features are, so withholding them would cost the game
its speed and protect nothing. The answer key is never on a shared screen.

---

## 6. Scoring

### Correct Count

One point per completed graph, banked as the server confirms it; the match
total is graphs completed. Ties: match accuracy (hits ÷ attempts), then fewer
rounds played (the same total in fewer rounds ranks first).

### Grand Prix

Each round ranks the field by work score, then accuracy, then the earliest
last correct completion. Placement earns championship points on a curve sized
to the class: a straight line from 11 at the top of the field down to 3 for
last (rounded half up), with a one-point winner's bonus that makes 1st worth
12. Ties share the place's points, and a player with no credit earns nothing:
nothing found, or misses that cancel what was (a work score of 0). Work counts
targets found fractionally, so a student who found one of a graph's two zeros
before time ran out has half a graph of work — it places them, and the
results card says so beside "0 graphs completed".

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
Count): graphs ↓, accuracy ↓, rounds played ↑. Never by name, device or
arrival order. (↓: higher first; ↑: lower first.)

---

## 7. State, time and reconnection

- **Time is the room's.** Each screen anchors the room's `startsAt`/`endsAt`
  to its monotonic clock once, from the calibrated server time; a device clock
  change moves nothing and a refresh rejoins the same deadline. Input stops at
  zero; a request arriving after the deadline's bounded grace is refused.
- **The host closes each round** about 1.5 s after its deadline (past the
  arrival grace), with the ordinary idempotent close command — from the
  teacher's console or projector, whichever is open. A rush round is never
  closed early (every student plays against the clock), and Next Round is the
  teacher's, from a closed round, so every class sees its results. Every mode
  now paces its rounds this way (`live-challenge-shell.md` §4).
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
place on every graph ("Off screen" between them in a game with off-screen
features), the round, the student's count and the clock. Every curve has an
arrowhead where it leaves the plot (`curveArrows`, from the same analysis the
generator checked) and a dot where it ends inside it. Portrait
stacks them; landscape puts the controls beside the graph. Feedback: a found
point draws a mark with its coordinates; a miss draws a fading cross and
names the feature it was not; the cooldown dims the graph and shows a draining
bar. Both standings listeners (the class's snapshot and the student's own
row) pause during an open rush round, so a class's taps do not wake every
screen. The "Get ready" card counts 3 · 2 · 1 off the
round's start. Between rounds the student sees the shell's results card, read
from the round's own result document (never from the paused listener's rows):
graphs, accuracy, place, the championship points it earned, and their
championship total and standing — or, if they earned no credit, that they
earned no championship points (targets found on a graph left unfinished are
credit, and the card says they count toward the place). Below how the round
went, a card **"How to read the features"** (LC07): a rush has no shared
question and so no worked solution, but every student shares what they were
asked to find, so the results carry a short reading guide to the features in
the game: one line each saying what the feature is and where it sits ("x-
intercepts: the points where the graph meets the x-axis, so the y-value is 0")
and the slip to watch for, and one line on the answers that are not a tap
("Does Not Exist"; "Off screen" in a game with off-screen features; above
Easy, "An open dot is not on the graph."). It is the same text for every
student and every round, a function of the game's settings alone (`graphFeatureReading.mjs`),
and names no graph, target or coordinate of anyone's. It rides the
worked-solution pipeline: captured with the round when it opens
(`GRAPH_FEATURE_RUSH_PLANNER.openRound`), published at the round's close
(`liveChallengeRevealableRounds`; no Second Chance holds it back), read by the
student, console and projector cards, which title it from `guide: true`
(`solutionTitle`). The end-of-game recap leaves it out, so a five-round game
does not say it five times. A game already running when this shipped has no
guide captured and publishes none. A feature added to the registry needs its
reading in `graphFeatureReading.mjs`: a test fails until it has one.

**Teacher.** Graph Feature Rush is a game type in the existing Create a
challenge panel: presets as starting points, then families, features (the
asymptotes among them), the off-screen layer, difficulty, rounds, time and
scoring (with the ladder for the class size).
Rewards use the same choice as every Live Challenge (`ChallengeRewardSettings`:
the standard Class Points achievements, plus a Practice Pass for the top
places and a Champion badge if the teacher wants them); placement comes from
the rush's final ranking. An impossible combination is explained before
anything is created. "Try it yourself first" plays server-generated sample
graphs on the student's screen, graded locally, recording nothing.

**Host and projector.** The countdown, the live race (graphs completed this
round), then the round's results with the points each place earned and the
championship it left (movement included) and the reading guide beside them
(the shell's results layout, LC03), then the podium. Never a graph, an
answer or a coordinate. The lobby, results, final standings, confirmations and
Play Again are the shell's (`live-challenge-shell.md`).

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
  p95 28 ms, on a Chromebook profile with the CPU slowed 4× (browser harness).
- **Requests**: a fast player sends about one request a second (taps are
  gathered); each is one transaction reading the room and the private player
  and writing both player rows. Local emulator: median 77 ms, p95 169 ms.
- **Listeners**: during a rush round a student listens to the room and their
  invite only; the teacher and projector listen to the players.
- **Bundles**: the student round is its own lazily loaded chunk (≈38 kB,
  13 kB gzip) fetched while the lobby waits; the generator and families never
  ship to a browser; the teacher's setup panel and practice load only when a
  rush is chosen. Classic games carry the rush's branches: measured against
  the build before this mode, a classic student's Live Challenge code grew by
  13 kB (≈6 kB gzip) and the teacher console by 51 kB (≈18 kB gzip: the host
  race view, the projector's rush branches, the setup model). Loading the host
  view and the setup model only for a rush would recover ≈17 kB of those
  51 kB.
- **Known cost**: the legacy `adjustLiveChallengeExperienceScore` trigger is out
  of the source (LC23), but the deployed copy fires on every private-player
  write and returns at once for a rush until someone deletes the function
  explicitly (`live-challenge-engine.md` section 14); that saves one no-op
  invocation per request.

---

## 11. Testing

- `tests/platform/graphFeatureRushMath.test.mjs` — every family, feature,
  variant and tier generates valid questions verified by an independent
  oracle (asymptotes found from where the curve blows up and where it
  settles; off-screen features found on the curve and past the edge; zeros at
  closed ends); special cases; vocabulary; determinism; schedules; the "Does
  Not Exist" share; the catalog equals the families.
- `graphFeatureRushArrowsAsymptotes.test.mjs` — every graph leaves the screen
  only at its ends (sampled independently), the device's arrowheads,
  restricted domains (closed and open ends, the parabola cut to one zero, the
  exact restricted extremes, no "roots"), asymptotes by family, hidden lines
  revealed with labels, line hit testing, the open-dot message, the
  off-screen layer end to end, device–server agreement over random play with
  all of them, the reading guide's lines, and the screens' wiring.
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

- **A server-side close** for an expired round when no host screen is open
  (today the console or projector closes it; students wait on "Time!"). This
  now applies to every mode (`live-challenge-shell.md` §14).
- **Misconception analytics**: receipts already record where wrong taps land
  (e.g. the y-intercept tapped for "zeros"); the report does not yet group them.
- **More features** (axis of symmetry, holes, relative extrema, inflection
  points) and families (logarithmic, trigonometric, higher-degree
  polynomials) through the registry and family contracts.
- **Off-screen presses in the report**: receipts record them (`attemptKind:
  'offScreen'`), the report does not yet count them beside "Does Not Exist".

---

## 13. Releasing a generator change

A room is graded with the generator it was created under, or not at all
(§3). A release that bumps `GRAPH_FEATURE_GENERATOR_VERSION` therefore stops
every rush room created before it: its students are told to ask for a new
game. Deploy it outside class time, after the day's games have finished.
- **Warm-Up link** for a rush (the capability is off).
- **Teacher-tunable fairness** (cooldown, auto-skip) and per-student
  accommodations such as larger tolerance.
- **Deleting the legacy experience trigger** (section 10).
