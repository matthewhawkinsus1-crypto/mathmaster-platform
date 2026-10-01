# Live Challenge + Rewards production hardening — 2026-10-01

A record of one end-to-end hardening pass over Live Challenge (every mode,
Graph Feature Rush included) and its Rewards integration, done as if a teacher
were running it in class tomorrow: what was run, what broke, what was fixed,
what was measured, and what is left. Branch `claude/exciting-dijkstra-jepv2b`,
from `main` at `128ec6c` (after #403, #406, #409, #410 and #411).

Nothing was deployed. Everything below ran against the Firestore emulator,
through the real Cloud Functions handlers (`functions/platformEntry.js`), in
real Chromium pages, or through the real pure modules.

---

## 1. How it was tested

| Method | What it exercised |
| --- | --- |
| **Probes through the real callables** (a private emulator, scripted classes) | lifecycle races (double Start / Next / End Round / Finish, two host tabs, two student tabs, replays, the arrival grace), concurrent creates, a 32-student class (joins, answers, rejoins, heartbeats, finalization with 81 awards), a 20-answer burst past the closing threshold, error requests |
| **Shell QA in real browsers** (`tests/browser/liveChallengeShellQa.mjs`) | console, projector and student screens against the real server: classic, scoring, rush, reconnect, big class (32), repeat, **endurance (new)**, adversarial |
| **Rush game in real browsers** (`tests/browser/graphFeatureRushGame.mjs`) | students tapping graphs on a Chromebook and a phone; Grand Prix and Correct Count; a class of twelve; tap latency |
| **Rewards QA in real browsers** (`tests/browser/rewardsQa.mjs`) | wallet, Practice Pass redemption (double click, refusals, lost answers), teacher grants/undo, per-match rewards cards |
| **Graph Feature Rush math audit** | 131,616 questions from every preset and 279 configs through `generateRushQuestion`, each checked by an independent numeric oracle; contact/flatness/wording/schedule/variation/determinism/a11y scripts; bots through the real attempt pipeline |
| **Scoring simulations** | 1,120 random Grand Prix / Correct Count matches at 2–35 players through the real round/match/leaderboard/reward code; comeback scenarios; 22 tie scenarios × 9 surfaces; 57,277 randomized rush attempts |
| **Security review** | every Live Challenge callable and Firestore rule, each suspicion traced through the code and, where it mattered, reproduced |

---

## 2. What changed

| Area | Problem found (measured or reproduced) | Change | Proof |
| --- | --- | --- | --- |
| Lifecycle / rewards | End Game during a round's 3-2-1 counted that round as played (`playedRoundCount = currentRound + 1`), ranked it and published results for it | `playedRoundCountAt` counts rounds that started; finishing in a countdown ranks nothing | `liveChallengeEngineResults.test.mjs`, `liveChallengeHardening.test.mjs` |
| Rewards | Finisher measured against SCHEDULED rounds: a 10-round game ended after 3 denied it to every student who answered all 3 | `participationFacts` / `rewardContextFor` measure against rounds played; diagnostics read the same facts | `liveChallengeRewards.test.mjs` |
| Lifecycle | Two creates at once (two tabs, Play Again on two screens) built two lobbies; one tab sat on a lobby nobody could join, the other room stayed in `lobby` forever | teacher pointer claimed in a transaction before players/invites; the loser retires its room | `liveChallengeHardening.test.mjs` (two concurrent creates) |
| Identity | After the game the console showed only code names; after a refresh the roster was gone (finalization deletes private state) | roster callable falls back to the match result; final standings show names behind the existing switch; roster names paired by key | `liveChallengeShellWiring.test.mjs`, integration |
| Performance | 20 answers at once past the 70% closing threshold: 2.4–3.9 s to "Correct!" (threshold off: 0.3 s) — every answer opened a room transaction | only answers that can compress check; one conditional write | integration (burst compresses once); 0.22–0.33 s |
| Security | an answer id shaped like `milestone:2:1` could be erased by a later progress report (Strong Accuracy gamed); progress during the 3-2-1 paid full milestones; code names in student-id order; Warm-Up link to another class's assignment; a finished room's settings still writable | id pattern; milestones never overwrite; progress only after start; shuffled aliasing; audience check; terminal rooms refuse configuration | `liveChallengeHardening.test.mjs` |
| Graph Feature Rush math | "Find all roots" → Does Not Exist for a parabola with complex roots; shallow crossings lying along the axis for 16% of the width; 2×2 windows; Standard piecewise y-intercepts decided by open/closed dots; back-to-back identical graphs (287 in the sample); "Does Not Exist" at 41% of a maximum-only game | generator v2 (§4) | `graphFeatureRushMath.test.mjs` (6 new tests, each mutation-checked) |
| Graph Feature Rush fairness | tapping along an axis at the tolerance spacing completed as many intercept graphs as reading (16.8 vs 16.8) | cooldown 1 s steps (max 4 s) | `graphFeatureRushEngine.test.mjs` (fails on the old cooldown) |
| Accessibility | ConfirmDialog re-ran its focus effect on every console render: focus jumped back to "Keep playing" under a keyboard user; no focus trap | handler through a ref; Tab/Shift+Tab wrap | shell QA adversarial (fails on the old dialog), wiring test |
| Accessibility | rush keyboard readout said "The curve is at y 0" for 0.0027 — an x-intercept that does not exist | "just above / just below y 0" | `graphFeatureRushDevice.test.mjs` |
| Projector | at 1366×768 the final standings under the podium asked for 5 rows where 3 fit; rows and "Everyone sees their own final place" were cut off | rows measured to fit whole | shell QA big-class at 5 sizes/zooms, wiring test |
| Student copy | server vocabulary on screen: "bounded delivery window" (also for answers BEFORE the start), "stale round version", "secure server confirmation", "server-authored deadline", "conservative server timing", "Caught up with the server." | plain sentences that say what to do | lifecycle/fairness tests, integration (early answer), stub harness |
| Student state | an invite to a room that no longer exists: "Opening …" forever, no way out | "no longer available" + back button, on the server's word only | wiring test |
| Student state | a refresh on the podium flashed "You joined after the last round." | "Loading your final place…" until standings arrive | wiring test |
| Rewards copy | "Rewards … show up here as soon as they are added" forever for students who earned nothing, even when the game offered nothing | the card says what the game offered; no card when nothing was offered | rewards QA (2 new checks) |
| Host copy | a rush round's hint promised "ends when … everyone has answered" | "until time runs out" | `liveChallengeShellModel.test.mjs` |
| Rush results copy | a student with partial targets and 0 graphs saw "+12 championship points" with no explanation | a line saying unfinished-graph targets count; doc corrected | `graphFeatureRushEngine.test.mjs` (pins the rule) |
| QA tooling | the stub harnesses timed out on a cold first load; the endurance numbers were polluted by Playwright element handles (each `waitForSelector` kept a whole setup panel alive) | 120 s first-load budget; locator waits; watcher counting, DOM census, detached-tree census, optional heap snapshots | — |
| Docs | the rush doc's Correct Count tiebreak said "rounds played ↓" (the code ranks fewer rounds first) | corrected | — |

Every behavior test above was run against the code before its fix and failed
(mutation-checked). Four existing source-text tests pinned a spelling the fixes
changed; each was rewritten against the behavior and mutation-checked
(AGENTS.md).

---

## 3. Measurements

### Latency, through the real callables (emulator, 4-core container)

| Operation | Result |
| --- | --- |
| 32 joins at once | p95 214 ms |
| 32 rejoins at once (a class refreshing) | p95 267 ms |
| heartbeats | ~177 ms |
| close round / advance | ~65 ms / ~85 ms |
| finish + every effect + 81 reward awards | 1.38 s |
| 20 answers at once, threshold 70% | before 2.4–3.9 s each (p50 3.4 s); after 0.22–0.33 s |
| rush tap batch, round trip (browser) | measured by `graphFeatureRushGame.mjs` tap-latency: passes its budget |

### Endurance: five whole games on the same screens

Standard → Rush (Correct Count) → Rush (Grand Prix, 2 rounds) → Solver Race →
Rush, with two students solving in real browsers (a Chromebook and a phone;
~55 graphs a round each in the rush games) and two more by the real callables.
Sampled after a forced GC:

| Page | Open Live Challenge listeners after each game | JS event listeners | DOM nodes | Heap |
| --- | --- | --- | --- | --- |
| console | 4, 4, 4, 4, 4 (pointer, room, players, diagnostics) | 194 → 193 | 276 → 297 | 47.3 → 48.2 MB |
| student (Chromebook) | 3, 3, 3, 3, 3 (invite, room, players) | 186 → 189 | 159 → 159 | 46.0 → 49.8 MB |
| student (phone) | 3, 3, 3, 3, 3 | 187 → 190 | 160 → 159 | 46.1 → 49.9 MB |
| students after leaving | 1 (the invite) | — | — | — |

Detached DOM held after GC: one `<audio>` (the stinger still playing), nothing
else. The students' heap step (+2.5 MB) is at the first Solver Race game: the
workspace module loading once. Every game's board matched its stored result;
names showed on the console; Practice Passes reached exactly the winners,
once; no game was left open.

The first endurance runs showed the console growing ~550 DOM nodes and ~35
listeners a game. A heap snapshot's retainer path ended at "(Global handles)
→ DevTools console → `<h3>Create a challenge</h3>`": Playwright's
`waitForSelector` handles, one per game. The harness now waits with locators;
the console was never leaking.

### Graph Feature Rush, generator v1 → v2

The audit's 131,616 questions each, except where a row names its own sample.

| | v1 | v2 |
| --- | --- | --- |
| wrong answer keys (oracle) | 0 | 0 |
| fallback questions | 0 | 0 |
| mean / max build attempts | 1.22 / 17 | 1.26 / 22 |
| "Find all roots/zeros" on a polynomial with non-real roots | 272 | 0 |
| identical graph and feature back-to-back | 287 | 0 |
| zero contact wider than 14% of the view | 1,450 | 332 (all double/triple roots, symmetric) |
| zero contact centred > 3% off the zero | 3 | 0 |
| widest contact around a zero | 62% of the width | 20% (flat roots) |
| views with a side ≤ 4 units (300 per slot) | 2,607 | 0 |
| "Does Not Exist", maximum-only Challenge (400 blocks) | 41% | 22% |
| screen reader "y 0" at a non-zero point (300 asymptote questions) | 43 | 0 |

### Sweeping the axis (bots through the real pipeline, phone tolerance, 30 students)

| Intercept-only Standard, 60 s | 600 ms cooldown steps | 1 s steps |
| --- | --- | --- |
| careful reader (2.6 s a feature, 10% slips) | 16.8 graphs | 16.8 |
| struggling reader (6 s, 30% slips) | 6.5 | 6.3 |
| tolerance-spaced axis sweep | **17.3** | 12.1 |
| random sprayer | 0.3 | 0.3 |

---

## 4. Graph Feature Rush mathematics

No generated answer key was wrong: every target of every sampled question
matched an independent numeric oracle (sign changes, wide sweeps, domain
probes). What the audit found was questions that were unfair or untrue to a
careful student, all fixed in generator v2 (`GRAPH_FEATURE_GENERATOR_VERSION =
2`; a room created under v1 refuses to issue or grade, as designed):

- **Non-real roots.** "Find all roots" answered "Does Not Exist" for a
  parabola with complex roots; "all roots" of a cubic with one real root asked
  for one point. Those variants are flagged `nonRealRoots` and only ever worded
  "Find all x-intercepts".
- **Readable zeros.** The stretch where the drawn curve lies on the axis
  (within 1.5% of the height) must reach at most 6% of the width either side
  of each zero (10% for double/triple roots, flagged `flatZero`), be centred
  within 2%, and never run off the view.
- **Windows.** Lopsided Challenge windows are at least 6 units each way.
- **Piecewise y-intercepts** sit on the split only at Challenge.
- **Repeats.** An odd-numbered question passes over a neighbour's graph with
  the same family and feature.
- **"Does Not Exist" share.** Each block slot settles exists/absent at the
  catalog share before avoiding repeated families.

Also verified, unchanged: device and server hit tests agree on every tap
(133,560 offset checks), random taps at maximum tolerance hit 1.3–1.5% of the
time, no two targets' tolerance circles overlap, generation is deterministic
in and across processes, students share each block's slots in their own
order, and a class of 30 sees different graphs at the same index (0.1–0.5%
coincide, by chance, on small catalogs).

Known and accepted: steep curves overlap the y-axis visually over up to 13% of
the height (symmetric about the intercept); triple roots stay flat by nature
(bounded at 10%, centred).

---

## 5. Scoring

Verified with the real code (`buildRoundResult`, `playerTotalsAfterRound`,
`buildMatchResult`, `publicLeaderboard`, the projector and standings models,
`evaluateRewardPolicy`), mirroring the server's writes:

- **Grand Prix**, 2–35 players, rush (field curve) and classic (table curve):
  1,120 matches, 0 rank, point, total or curve-rule mismatches; the final
  result's order equals the live scoreboard's in every match.
- **Comebacks.** A: a student who wins rounds 2 and 3 overtakes a round-1
  blowout (60 graphs to 5) in nearly every placement; B: four students
  rotating first stay within 2–9 points with nobody eliminated early; C: a
  student who wins every round, three by timing alone, finishes first at every
  size and is never overtaken. A consistent 2nd beats a student alternating
  1st and last from 10 players up (in tiny classes "last" is near the top).
- **Ties**: 22 scenarios (equal counts, equal accuracy, equal timing, ties for
  first, ranks 2–4, a 3-way tie straddling a top-3 reward, non-players) × 9
  surfaces (round result, stored result, live board, last round's standings,
  podium split, boards, round view, rewards delivered, rewards shown): all
  agree; no reward ever issued twice.
- **Correct Count**: one point per completed graph; misses, skips, auto-skips,
  partial graphs at the buzzer and replays add nothing (57,277 randomized
  attempts, 6,699 replays, 0 mismatches); "Does Not Exist" completes a graph.
- **Partial work in a rush round** counts: a student who found one of a
  graph's two zeros has half a graph of work and is placed by it (now stated
  in the doc and on the results card, and pinned by a test).

---

## 6. Rewards

- Placement rewards follow the stored ranks (tied winners both win); minimum
  rounds answered applies on display and delivery alike.
- Delivery is exactly once per award identity: re-finishing, a second host,
  a retried effect, Play Again and a refreshed podium deliver nothing twice
  (probes and every browser game; the endurance run checks each game).
- The Finisher fix above; Warm-Up credit and Finisher now read the same
  "rounds played".
- Redemption (rewards QA): a double click spends one pass; an assignment that
  stops being eligible during confirmation is explained and not spent on; a
  server refusal and a lost answer are both told the truth; teacher undo
  returns the pass and keeps history.

---

## 7. Device and responsive QA

Real browsers, screenshots in each harness's output folder:

- Console: 1366×768 (Chromebook), 1920×1080.
- Projector: 1366×768 at 100/125/150% zoom and at 80/67% (1708×960,
  2039×1146): nothing scrolls sideways; at least three standings rows fully
  visible on results; under the podium only whole rows and the note.
- Students: Chromebook, iPad portrait (820×1180) and landscape (1180×820),
  phone portrait (390×844, 360×640) and landscape (844×390), a Chromebook at
  80/67%: no sideways scroll on results or the final card; reduced motion
  turns confetti off.
- Rush: the graph is the largest square that fits on a Chromebook and a
  phone; Does Not Exist and Skip stay on screen; taps land within tolerance on
  touch and mouse.

### The manual test matrix

What was run, and where (every cell in real browsers against the real
server unless it names a probe):

| | Standard (classic) | Rush · Correct Count | Rush · Grand Prix | Solver Race |
| --- | --- | --- | --- | --- |
| **Chromebook 1366×768** | classic, adversarial, endurance | endurance, rush harness | rush, endurance, rush harness | endurance |
| **Desktop 1920×1080** | adversarial (second host tab) | — | rush harness | — |
| **Tablet** (iPad portrait/landscape) | classic, big class | rush harness | — | — |
| **Phone** (390×844, 360×640, 844×390) | classic, big class, reconnect | endurance, rush harness | rush, endurance | endurance |
| **Normal game** | classic | endurance | endurance | endurance |
| **Reconnect** (offline, frozen tab, 2 devices, refresh at buzzer) | reconnect | rush harness (offline queue) | — | — |
| **Host refresh** (mid-round, podium) | reconnect | — | — | — |
| **Late join** | reconnect | rush harness | — | — |
| **Repeated games** | repeat (4), endurance (5) | endurance | endurance | endurance |
| **1 student** | game stub | — | rush harness (practice) | — |
| **Small group** (2–6) | classic, adversarial | endurance | rush harness (2) | endurance |
| **Larger group** | big class (32), probe (32) | rush harness (12) | probe | — |
| **Reward awarded** | classic (top 3), endurance | endurance | endurance | endurance |
| **No reward** | rewards QA (offer card) | endurance (non-winners) | endurance | endurance |
| **Redemption** | rewards QA | — | — | — |
| **Duplicate event** | probes (re-finish), rewards QA (double click) | endurance (one pass each) | endurance | endurance |

---

## 8. Adversarial run

| Attempt | Outcome |
| --- | --- |
| Start pressed three times across two tabs | one round |
| Next Round from two tabs at once | one round, version 2 |
| End Round Now at the timer's zero / End Game at the buzzer | one close, one finalization |
| answer exactly at the deadline (grace 300 ms ok, 1,100 ms refused) | as designed |
| answer during the 3-2-1 | refused: "This round has not started yet. Wait for GO, then answer." |
| double submit / replayed id | one receipt; the replay returns it |
| the same student in two tabs | one row, "2 devices" on the console, one answer counted |
| a student offline through the end of a round | catches up to the results on reconnect |
| a frozen (backgrounded) tab across the deadline | wakes on the results, no running clock |
| host refresh mid-round | same round, the server's time left (±2 s), still closes on time |
| student refresh at the buzzer | lands on the results |
| teacher refresh on the podium | podium and report restored; names from the match result |
| open an old / removed match | finished: the final card; cancelled: said so; removed: "no longer available" |
| change mode between games, five games in a row | clean every time (endurance) |
| spam a graph | cooldown, eighth miss skips it; server-recorded |
| sweep an axis | slower than reading (§3) |
| an answer id shaped like a server key | refused |
| redeem a pass twice | one spent |

---

## 9. Remaining known issues

**Blocking:** none found.

**Non-blocking, accepted with reasons:**

- A scripted client can read a rush question's targets from its own response
  and skip the cooldown (the server still applies the miss penalty and the
  eighth-miss skip). Targets travel with the graph for instant feedback; the
  graph shows where its features are. A cheater can win placement rewards; a
  per-student pacing plausibility check is the deferred remedy.
- The classic round's question is in the room document 3.5 s before GO (hidden
  on screen); an inspector could read it during the countdown. Answers and
  progress are refused until GO.
- A student who reads very slowly can be outscored by a sweep (§3); the
  cooldown is not allowed to punish honest mistakes harder.
- Self-reported provisional points (classic, before the server's result) can
  show up to 1,000 on the live board for a moment; the stored score is the
  server's.
- An unknown `challengeMode` in a create request becomes a Standard game (a
  stale client cannot break creation).
- Steep curves overlap the y-axis visually (symmetric; §4).

**Future enhancements (deferred):**

- Server-side pacing plausibility for rush attempts; a teacher-visible
  "unusual pace" flag.
- Mount the classic question at GO rather than hiding it during the
  countdown.
- A generic per-player question-set pipeline (§10) before a second
  question-set mode.
- Teacher-tunable cooldown/auto-skip.

---

## 10. Future Challenge mode readiness

Ready and mode-agnostic: the lifecycle planner and its idempotency, the
server-owned timer, receipts and completion rules (`singleResponse`,
`correctResponse`, `allTargets`), scoring strategies (accuracy-first, Grand
Prix with table/field curves, Correct Count), ranking and ties, round/match
results, rewards and their delivery, Play Again, the shell's stages,
countdown, results moment and projector.

What a new mode would hit:

- **The per-player question-set pipeline is Graph Feature Rush's.** Issuing
  (`getGraphFeatureRushRound`), submitting (`submitGraphFeatureRushAttempts`,
  `applyRushAttempts`), the device session (`rushSession.js`) and the report
  (`buildRushReport`) are named and shaped for taps on a graph. Equation
  Sprint and any other per-student set would duplicate them; generalize them
  into a question-set attempt pipeline with a grader per mode first.
- **Targets are points.** The registry declares geometry but only `point` is
  built; Domain & Range Dash (intervals) and Match Rush (pairs) need a new
  geometry or attempt kind and its distance/grading rule.
- **One curve per graph.** Systems Showdown (intersections) and Transformation
  Race (pre-image and image) need multi-curve render specs; the families,
  renderer and hit test otherwise carry over.
- **Mode surfaces are chosen by branches** (`rushRoom ? … : …`) in the student
  screen, console and projector; a third surface wants a mode → component
  registry.

| Mode | Fit today | First engine work |
| --- | --- | --- |
| Equation Sprint | scoring, timer, per-player issue concept | generic question-set pipeline + typed grading (the Solver Race grader exists) |
| Match Rush | `allTargets` completion | a pairing attempt kind |
| Error Hunt | classic synchronized round with choice-style answers | (none for choices); a "tap the step" tool for richer play |
| Transformation Race | rush families, renderer, point hit test | two-curve render spec |
| Systems Showdown | classic rounds with bank systems questions; rush hit test | two-curve render spec for "tap the intersection" |
| Domain & Range Dash | registry and hit-test design anticipate it | interval geometry |

---

## 11. The gate

| Check | Before (`128ec6c`) | After |
| --- | --- | --- |
| `npm run test:platform` | 7,422 / 7,422 | 7,433 / 7,433 |
| `node --test tests/tools/*.test.mjs` | — | 253 / 253 |
| `npm run test:challenge-finish` (emulator) | 222 / 222 | 229 / 229 |
| `npm run test:rules` | 100 / 100 | 100 / 100 (and 225 / 225 legacy) |
| `npm run lint` | 0 errors | 0 errors (warnings pre-existing) |
| `npm run build`, `npm run build:firebase` | ok | ok |
| shell QA, every scenario (real browsers) | 7 scenarios | 8 scenarios, 0 findings |
| rush game / rewards QA / game stub (real browsers) | pass | pass (rewards 28 / 28) |

Bundle cost: the student screen +0.5 kB gzip (22.95 kB), the console +0.8
kB gzip (40.34 kB), the rush round +0.05 kB.

---

## 12. Re-running it

```bash
npm run test:platform                 # unit and contract tests
npm run test:challenge-finish         # integration, incl. liveChallengeHardening
node tests/browser/liveChallengeShellQa.mjs            # every shell scenario
SHELL_QA_SCENARIOS=endurance node tests/browser/liveChallengeShellQa.mjs
node tests/browser/graphFeatureRushGame.mjs
npm run test:rewards-browser
```

The math audit scripts are not part of the repository; the properties they
measured are held by `graphFeatureRushMath.test.mjs` and
`graphFeatureRushEngine.test.mjs`.
