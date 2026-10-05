# Live Challenge engine and rewards foundation

One engine runs every Live Challenge game mode, and one rewards system turns a
finished match into Class Points and item rewards. This document is the map:
what each piece owns, the contracts between them, where idempotency is
enforced, how to add a game mode, and what later work must not change.

Code lives in `functions/shared/*.mjs` (pure modules shared by Cloud Functions,
the teacher projector and the student device) and in the Live Challenge block
of `functions/index.js` (the callables that apply them inside Firestore
transactions).

```
GAME PERFORMANCE ──► ROUND RESULT ──► MATCH RESULT ──► REWARD RULES ──► LEDGER / GRANTS
 (receipts, per       (ranked once      (written once     (pure: who        (delivered once
  attempt)             at round close)   at finish)        earned what)      per award id)
```

Game score is not a reward and is not a grade. The scoreboard never reads the
rewards ledger, and reward rules never read the scoreboard: they read the
durable match result.

---

## 1. Module map

| Module | Owns | Pure? |
| --- | --- | --- |
| `liveChallengeLifecycle.mjs` | session status, round state, derived match state, the command planner | yes |
| `liveChallengeTimer.mjs` | the round clock as data: build, read back, phase, remaining/elapsed, compress, pause/resume, close readiness, arrival window | yes |
| `liveChallengeRanking.mjs` | deterministic ranking with shared ranks for ties; placement points | yes |
| `liveChallengeResponses.mjs` | question specs, attempts vs completion, round progress summaries | yes |
| `liveChallengeScoring.mjs` | scoring strategies and their registry | yes |
| `liveChallengeModes.mjs` | game modes, round structures, and their registry | yes |
| `liveChallengeResults.mjs` | round results, match results, standings | yes |
| `liveChallengeRewardRules.mjs` | reward policies, criteria, award identity | yes |
| `rewardGrants.mjs` | reward definitions; grant documents and their lifecycle transitions | yes |
| `rewardGrantStore.mjs` | applying a grant transition atomically | server |
| `liveChallengeClassPoints.mjs` | staging and delivering awards (ledger credits, grants) | server |
| `liveChallenge.mjs` | the mature per-response scorer, receipts, leaderboard, tallies (pre-engine; still authoritative for Accuracy First arithmetic) | yes |
| `liveChallengeParity.mjs` | client clock calibration, round phases, snapshot acceptance | yes |
| `graphFeature*.mjs` | Graph Feature Rush: exact graph math, the generator, hit testing, attempt rules (see `graph-feature-rush.md`) | yes |
| `liveChallengePresence.mjs` | the heartbeat a game screen's clock calibration writes: quality, recent sessions (devices), reconnects | yes |

`functions/index.js` loads the pure modules once through `liveChallengeEngine()`.

The screens around a game — the host console, the projector and a student's
device, for every mode — are the **shell**, with its own client-side models:
see `live-challenge-shell.md`.

---

## 2. Lifecycle

### Persisted state

A room is described by **two persisted fields and one clock**:

| Field | Values | Meaning |
| --- | --- | --- |
| `status` | `lobby` → `running` → `finished` \| `cancelled` | the session |
| `roundState` | `open` → `closed` (only while running) | the current round |
| `startsAt` / `endsAt` | timestamps | the round clock (section 4) |

Plus the round identity: `currentRound` (index), `roundVersion` (increments on
every round opening) and `roundToken` (random per opening). A submission or a
round command names the identity it acted on.

Rooms created before `roundState` existed read as: running with
`currentRound >= 0` means the round is open (`roomRoundState`).

### Derived state

Screens render from `deriveMatchState(room, now)`, never from a stored flag
that could disagree with the fields above:

```
lobby ──start──► countdown ──(clock)──► roundActive ──(deadline)──► roundLocked
                     ▲                      │  ▲                         │
                     │                  pause  resume                closeRound
                     │                      ▼  │                         ▼
                     │                   roundPaused               roundResults
                     └────────────────────advance (next round)───────────┘
roundResults/any open state ──finish──► completed        any non-terminal ──cancel──► cancelled
```

`countdown`, `roundActive` and `roundLocked` are the same persisted state
(`running` + `open`) at different instants: the clock moves the room between
them with no write.

### Commands

`planLifecycleCommand({ command, room, expected, joinedCount, completedCount, nowMs, force })`
is pure. It answers one of:

- **apply** — do it (with details: `nextRoundIndex`, `closeCurrentRound`, …)
- **alreadyApplied** — the effect the caller asked for is already true. This is
  a **success**, not an error. A double click, a retried request or a second
  teacher tab gets this answer.
- **reject** — with a code from `LIFECYCLE_REJECTION` and a message for the
  teacher.

Every callable runs the plan **inside the Firestore transaction that read the
room**, then applies it in the same transaction:

| Callable | Command | Notes |
| --- | --- | --- |
| `startLiveChallenge` | `start` | needs ≥ 1 joined player; opens round 0 atomically |
| `closeLiveChallengeRound` | `closeRound` | ranks and persists the round; `force` is a host override |
| `advanceLiveChallenge` | `advance` | closes an open round if ready, then opens the next round or finalizes |
| `finishLiveChallenge` | `finish` | closes an open round, finalizes |
| `cancelLiveChallenge` | `cancel` | finalizes as cancelled |
| `joinLiveChallenge` | `join` | rejected once terminal |
| `submitLiveChallengeResponse` | `submit` | stale round, version or token → rejected |

The legal transitions are data (`LIFECYCLE_TRANSITIONS`); tests check the
planner against the table so the two cannot drift.

**Terminal states are terminal.** No command moves a room out of `finished` or
`cancelled`. (A finished match used to be relabelled `cancelled` after its
rewards and credit had been issued.)

**Round commands carry the round they are about.** `advance` and `closeRound`
accept `expectedRoundIndex` / `expectedRoundVersion`. An expectation for an
earlier round or version means the command already happened →
`alreadyApplied`. The teacher console always sends the round on screen, so two
presses of Next Round open one round, never two.

**The room answers first.** A round command plans from the room before it
requires the private state. A Next Round press that raced Finish is told the
match is finished (`alreadyApplied`) even after the finished match's effects
deleted its private state.

**Joining mid-match** records `joinedAtRound` once (`joinRoundFor`): the round
still open, or the next one when the current round has already closed. A
rejoin keeps the recorded round. Warm-Up credit and the Finisher reward measure
a student against the rounds from there on.

**A round ended in its 3-2-1 was never played.** `finish` closes an open
round only if it has started (`openRoundStartedAt`); ended during its
countdown, the round is neither ranked nor counted, and the match result's
`playedRoundCount` (`playedRoundCountAt`) leaves it out — so Warm-Up credit
and the Finisher reward are never measured against a round nobody could
answer.

**One lobby per teacher, even from two tabs.** `createLiveChallenge` claims
the teacher's active-room pointer in a transaction before it writes players
or invites. The tab that loses the race retires its own room (cancelled,
private state deleted) and is told which room is live; a players or invites
write that fails releases the pointer and retires the room the same way.

**Readiness** — a round may close when every joined player has completed it,
or its authoritative deadline has passed (`roundReadyToClose`). Zero of zero is
not "everyone finished"; a paused clock does not expire; an open-ended Pace Race
round never closes merely because it has no deadline.

---

## 3. Game modes

A mode is a **declaration** the engine reads, registered in
`liveChallengeModes.mjs`:

```js
defineChallengeMode({
  id: 'standard',                         // permanent; stored on rooms
  label: 'Standard Challenge',
  projectorLabel: 'Live Challenge',
  roundStructure: ROUND_STRUCTURE.SYNCHRONIZED_QUESTION,
  questionSource: QUESTION_SOURCE.SECURE_BANK,  // which planner draws questions
  questionSpec: { completionRule: 'singleResponse', targetCount: 1 },
  defaultScoringStrategy: 'accuracyFirst',
  scoringStrategies: ['accuracyFirst', 'grandPrix', 'correctCount'],
  capabilities: { secondChance, progressMilestones, paceTiming, closingThreshold, dryRun, warmupLink },
  normalizeConfig: (raw) => ({ questionStyle, ... }),   // the mode's teacher settings
  // Optional:
  questionIssue: QUESTION_ISSUE.SHARED,   // or PER_PLAYER: each player has their own questions
  roundLimits: { minRounds, maxRounds, defaultRounds, minSeconds, maxSeconds, defaultSeconds },
  scoringDefaults: { grandPrix: { placementCurve: 'field' } },
})
```

| Part | What it decides |
| --- | --- |
| `roundStructure` | how many questions a round holds, how a player's round is measured (`performance`) and ranked (`ranking`) |
| `questionSource` | which question planner draws the round's questions (`LIVE_CHALLENGE_QUESTION_PLANNERS` in `functions/index.js`: `plan` for a room or dry run, `swap` for a dry-run swap) |
| `questionSpec` | completion rule and target count per question (section 5) |
| `scoringStrategies` | the strategies a room of this mode may use; anything else resolves to the default |
| `capabilities` | engine features the mode opts into, read where they apply (e.g. `progressMilestones` gates the Solver Race progress callable; `warmupLink` whether a room may be an assignment's Warm-Up) |
| `normalizeConfig` | validates the mode's own create settings |
| `questionIssue` | `shared` (everyone answers the round's question) or `perPlayer` (each player's questions are their own; a round's question specs are read from that player's receipts, `questionSpecsFromReceipts`) |
| `roundLimits` | the round count and seconds a room of the mode may be created with (`normalizeModeRoundCount/Seconds`); the classic defaults otherwise |
| `scoringDefaults` | per-strategy config defaults applied before the request's own (`modeScoringConfig`) |

Round structures:

- **synchronizedQuestion** — everyone answers the same single question; one
  graded response each. Ranked by score fraction, then (correct answers only)
  completion time. Standard and Solver Race.
- **questionSet** — several questions per round against the round clock; a
  player may not finish them all. Ranked by completed work (targets found count
  fractionally), then accuracy, then the time of the last correct completion.
  Built for multi-target modes such as Graph Feature Rush.

`getChallengeMode(id)` resolves an unknown or missing id to Standard, so rooms
created before modes existed keep working.

### Adding a game mode

1. If a new question source is needed, add a planner to
   `LIVE_CHALLENGE_QUESTION_PLANNERS` (`plan` returning
   `{ candidateCount, selected, roundQuestions, seed }`, and `swap`). A planner
   may also return `roomFields` (public room settings) and `privateFields`
   (server-only state, such as a seed), and may define `openRound` to build a
   round's opening itself instead of drawing a bank question.
2. Declare the mode with `defineChallengeMode` and register it in the mode
   registry. Start with `teacherSelectable: false` until it ships.
3. Pick a round structure and question spec. A multi-target question is
   `{ completionRule: 'allTargets', targetCount: n }`; the server records each
   target attempt as a receipt with `receiptKind: 'targetAttempt'` and a
   `targetId`, and `planAttempt` rejects a duplicate target.
4. List the scoring strategies it supports.
5. Add the mode to the teacher create panel (and its labels to the projector
   model if the registry's `projectorLabel` is not enough).
6. Tests: a pure test that ranks a round of the new structure, and an
   integration test that plays one round through the callables.

`tests/platform/liveChallengeEngineModes.test.mjs` declares a Feature-Rush-
shaped mode exactly this way, and Graph Feature Rush (`graph-feature-rush.md`)
is the first registered mode built on the question-set structure.

---

## 4. The round timer

The clock is **data the server owns**: `startsAt` and `endsAt`. Every screen
derives what it shows from those timestamps and its calibrated view of server
time, so a refresh, a sleeping Chromebook or a reconnect catches up to the real
deadline. There is no countdown to restart.

- `buildRoundTimer({ nowMs, syncLeadMs, durationMs })` — a round starts in the
  future so every device can synchronize: `ROUND_SYNC_LEAD_MS` by default, and
  `ROUND_COUNTDOWN_LEAD_MS` (3.5 s) for every round the lifecycle opens, so
  each screen shows the same 3-2-1 off `startsAt` before anyone can answer.
  Everything counts from `startsAt`, so the lead never shortens a round.
  `durationMs: null` is an open-ended Pace Race round.
- `timerFromRoom(room)` — reads it back; only `timingMode: 'pace'` is
  open-ended by design.
- `compressTimer` — the closing threshold; only ever brings a deadline closer.
  It is applied once per round by a single conditional write (a precondition
  on the room's update time), checked only while it can still apply
  (`roundCompressionMayApply`: threshold on, not already closing and, for a
  timed round, the deadline more than 5 s away); a class answering at once
  used to queue every answer behind a room transaction.
- `pauseTimer` / `resumeTimer` — modelled, not yet wired to a control. Resuming
  shifts **both** timestamps by the paused duration, so everything that computes
  elapsed time as `now − startsAt` (speed scoring included) excludes the pause
  without knowing pauses exist.
- `timerAcceptsArrival(timer, arrivedAtMs)` — whether a response belongs to the
  round: after the start, before the deadline plus the bounded transport grace
  (`SUBMISSION_ARRIVAL_GRACE_MS`). A paused round accepts nothing; a timed round
  with no deadline is a broken timeline and accepts nothing.

---

## 5. Questions, attempts and completion

`liveChallengeResponses.mjs` separates four things that the first Live
Challenge treated as one:

| Concept | Is | Stored as |
| --- | --- | --- |
| question spec | what a round asks: questions, targets per question, completion rule | the mode |
| attempt | one graded interaction | a receipt in `submissionReceipts`, keyed by its id |
| completion | whether a question is done | **derived** from its attempts by the rule |
| score | points | decided by the scoring strategy |

Completion rules: `singleResponse` (the first graded response completes it,
right or wrong — the classic round), `correctResponse` (keep answering until
correct), `allTargets` (every target must be found; wrong attempts count but do
not complete it).

**The receipt log is the source of truth.** The attempt id (the client's
`submissionId`) is the receipt key, written in the same transaction that scores
it, so a retried submission is a **replay** of its receipt, never a second
attempt. An id is `[A-Za-z0-9_-]{1,100}` (a UUID's alphabet), so it can never
be a server receipt's key. Score-only receipts (Solver Race productive-speed
milestones, `receiptKind: 'productiveSpeedMilestone'`, keyed
`milestone:{version}:{depth}`) carry points but are never attempts, and a
milestone never overwrites a receipt already there. Progress reports
(`reportLiveChallengeProgress`) are not recorded until the round has started.

A **forfeit** receipt (`forfeit: true`) gives a question up: it completes the
question, not correctly, keeping any targets already found. Each attempt on a
multi-target question records its `targetCount`, so a per-player round's
question specs are rebuilt from the log alone. Round score totals are kept in
**exact score units** (`SCORE_UNIT`, the least common multiple of 1–20 target
counts), so equal work compares equal whatever order fractions were added in.
A round holds at most `MAX_QUESTIONS_PER_ROUND` (150) questions. A
question-set round's **work score** is completed work less 1/20 of a question
per wrong attempt, never below zero (`questionSetWorkScore`).

---

## 6. Scoring strategies

A strategy (`liveChallengeScoring.mjs`) owns exactly three decisions:

```js
defineScoringStrategy({
  id, label, description,
  accumulation: 'perResponse' | 'perRound',
  normalizeConfig(raw) → config,
  scoreResponse(input) → { basePoints, speedBonus, legacySpeedBonus, speedTier, streakBonus,
                           comebackBonus, recoveryPoints, pointsAwarded, newStreak,
                           secondChance, matchPointsDelta },
  matchPointsForPlacement({ rank, participated, performance }, config) → integer,
  matchRanking: { metrics: [{ key, direction }] },
})
```

| Strategy | Accumulation | Match total |
| --- | --- | --- |
| `accuracyFirst` (default) | per response | the sum of response points: 1,000 for correctness, bounded speed, streak and comeback bonuses, second-chance recovery shares. Unchanged arithmetic. |
| `grandPrix` | per round | round performance → round rank → placement points → championship total. `placementCurve: 'table'` (default): `[15, 12, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1]`, 1 beyond the table. `'field'` (Graph Feature Rush): sized to the class — a straight line from 11 at the top down to 3 for last, plus a one-point winner's bonus that makes 1st worth 12 (`fieldPlacementPoints`). Either way 0 for no credit, and ties share a place's points. No streak/comeback carry-over between rounds. Ranked by match points, then round wins, then raw score. |
| `correctCount` | per response | one point per fully correct response (or completed multi-target question, via the `scoreTargetAttempt` hook); ties by match accuracy, then rounds answered |

**Speed influence is native.** The teacher's speed setting (0–50%) is applied by
the strategy at submit time with the exact arithmetic the retired post-hoc
wrapper used (`scaleLegacySpeedPoints`), including Solver Race milestone speed —
so "Off" pays no speed anywhere. The legacy experience trigger in
`functions/entry.js` stays deployed for the rolling-deploy window; every new
submission marks its round (`experienceSpeedAdjustedRound`) so the trigger
returns before touching it.

A **per-round** strategy changes the match total only when a round closes:
`playerTotalsAfterRound` records the placement under `roundPlacements[round]`,
so a retried close cannot pay a round twice, and the displayed `score` becomes
the championship total. A **round win** is first place *with credit*
(`roundWon`): when nobody earns anything every player ties for first, and that
round is no one's win and no one's placement (`lastRoundRank: null`). Leaderboards use `leaderboardOptionsFor(strategy)`:
in-progress provisional points appear only on per-response boards.

---

## 7. Ranking

One implementation (`rankEntries`) ranks the live board, a round, the final
standings, and any reward rule that asks "who finished first":

- A ranking is a list of metrics with directions; the first metric that differs
  decides.
- Players equal on **every** metric are tied and **share a rank** (1, 2, 2, 4).
  A tie is never broken by name, device, arrival order or chance.
- Tied players are *displayed* in a stable order — display name
  (case-insensitive, then exact), then participant id — compared by code point,
  never `localeCompare`. That affects `position`, never `rank`.
- A missing or non-numeric metric is the worst value for its direction.
- The output is identical for any input order.

Placement points for a tie are the points of the shared rank: two players tied
for second both earn second's points; the next player earns fourth's.

---

## 8. Results

### Round result

Written once, in the transaction that closes the round:

- `liveChallengePrivate/{roomId}/rounds/{round}` — named standings with each
  player's round metrics, rank, round points and the match points the strategy
  awarded.
- `liveChallengeRooms/{roomId}/rounds/{round}` — the **anonymous** copy
  (`publicRoundSummary`: player key, alias, rank, points — no student id; for
  a question-set round also `completed` and `accuracyPercent`), read by the
  room's audience. It also carries `standingsAfterRound`
  (`matchStandingsAfterRound`): the match standings ranked from the totals the
  same transaction wrote — the final result's own ranking — so a results
  screen reads the round and the standings it left from one document, and
  movement compares two standings the engine wrote. The last round's are the
  final standings.
- For a question-set round, each joined player's public row gets `lastRound`
  (their rank in the round's field, `fieldSize`, completed work, accuracy and
  the points it earned) in the same transaction — what their round-results
  screen shows, also after a refresh.

### Match result

`liveChallengeMatchResults/{roomId}`, written once, in the same transaction
that makes the room terminal (`buildMatchResult`). It carries everything every
downstream consumer needs — mode and strategy, class and assignment, scheduled
and **played** round counts, question ids and standards, second-chance map,
eligible/played counts, and ranked standings (absent players last with
`rank: null`) with each student's answered/missed rounds and per-round outcomes —
plus `studentIds`, the room's reward policy, and the finalization bookkeeping.

Server-only: no client may read or write it (`firestore.rules`).

### Finalization effects

After the terminal transaction commits, `runLiveChallengeFinalizationEffects`
runs each effect **from the match result**, never from private game state:

| Effect | Writes |
| --- | --- |
| `report` | `liveChallengeReports/{roomId}` |
| `invites` | invite status — only invites that still point at this room |
| `warmupCredit` | the assignment's participation/accuracy credit, measured against rounds actually played |
| `evidence` | mastery evidence (weight 0.7, replays excluded) |
| `rewards` | reward delivery (section 9); finished matches only |
| `privateCleanup` | deletes `liveChallengePrivate/{roomId}` — last, once every other effect has settled, or on the last attempt |

Each effect is idempotent. Outcomes are merged into `effects` in a transaction
where `done` always wins. A failure is logged and left for the scheduled sweep
(`retryLiveChallengeAchievementJobs`, every 15 minutes), which re-runs pending
effects for results more than two minutes old. A crash between the terminal
transaction and the effects therefore loses nothing.

The sweep gives up after `LIVE_CHALLENGE_EFFECT_MAX_ATTEMPTS` (10) runs
(`finalizationEffectsState`): whatever is still unsettled, the private-state
cleanup included, is recorded as `effectsAbandoned` and logged, so one broken
match cannot hold one of the sweep's slots forever.

---

## 9. Rewards

### Definitions and instances

- **Currency** — Class Points. An immutable ledger transaction per change plus
  an account projection (`classPoints.mjs`). Unchanged.
- **Items** — a Practice Pass, a badge. Each held item is its own **grant**
  document, `rewardGrants/{grantId}`, with a lifecycle:

```
available ──redeem──► redeemed      (used against a named target; terminal)
available ──revoke──► revoked       (teacher/admin reversal, with a reason; terminal)
available ──expire──► expired       (past expiresAt; terminal)
```

Terminal states never change. A transition never deletes anything: it sets the
new status, records who/when/why/against-what, and appends to `history`. A
retried transition with the same intent is `alreadyApplied`, not a second use.
An available grant past `expiresAt` already reads as expired
(`effectiveGrantStatus`); persisting that is optional.
`transitionRewardGrant(db, grantId, transition)` (`rewardGrantStore.mjs`)
applies a transition atomically — the integration point a wallet, a teacher's
"take back" or an expiry sweep calls.

### Rules

A room's **reward policy** (validated at create, stored privately, copied onto
the match result) is a list of rules:

```js
{ ruleId: 'topFinish', ruleVersion: 1,
  criterion: { kind: 'placement', maxRank: 1, minRoundsAnswered: 1 },
  reward: { kind: 'grant', rewardCode: 'practicePass', expiresInDays: 14 } }
```

Criteria: `participation`, `accuracy`, `comeback`, `placement`. Rewards:
`classPoints` (1–10 per rule) or `grant` (a grantable item). Limits: 8 rules, 3
item rules, 20 Class Points per student per match, 365-day expiry. A missing
policy is the **default policy**, which is exactly the original achievements:
Finisher +2, Strong Accuracy +3, Comeback +2, under their original rule ids.

Rules read **standings from the match result** — never score, speed bonus,
streak or the live board. Placement is decided by rank, so tied winners both
finish first. Participation (Finisher) measures a student against the rounds
the match actually played (`rewardContextFor`: the smaller of scheduled and
played), so a game the teacher ends after five of ten rounds still rewards
the students who answered all five; the reward diagnostics use the same
facts (`participationFacts`).

### Delivery and identity

Every award has a deterministic identity: `liveChallenge ␀ roomId ␀ studentId ␀ ruleId`.

- A Class Points award is the ledger transaction
  `lca_<sha256(roomId␀studentId␀ruleId)[0:32]>` — the id the achievements have
  always used, so an award staged by earlier code and the same award now are
  one transaction.
- An item award is the grant `lcg_<sha256(identity)[0:40]>`.

Delivery (`processLiveChallengeMatchRewards`):

1. **Stage** — evaluate the policy and merge the planned awards into
   `liveChallengeAchievementJobs/{roomId}` inside a transaction. Re-staging
   never resets a delivered, skipped or failed award.
2. **Execute** — deliver each undelivered award in its **own** transaction that
   returns early if the award's document exists, re-checks the roster (class of
   record, not archived, the student still in it), and writes the credit or the
   grant. Any number of concurrent executors deliver each award once.
3. A failed roster check is recorded as `skipped` (a business outcome), never
   retried. A transient error is retried up to `MAX_AWARD_ATTEMPTS`, then
   recorded `failed`.

A job is `pending` while any award is undelivered, and only pending jobs are
retried (`RETRYABLE_JOB_STATUSES`). Once every award is processed the job is
`completed`, or `completed_with_failures` when one failed for good, and it
leaves the sweep's query. `partially_failed`, which the earlier implementation
wrote for a job with undelivered awards, is still retried and is relabelled on
its first run. An executor never writes back a job that was deleted while it
ran (permanent student deletion removes a job whose every award was that
student's).

---

## 10. Idempotency, in one table

| Hazard | Guard |
| --- | --- |
| two Start / Next Round / Finish presses | lifecycle plan inside the transaction; `alreadyApplied` |
| a late or repeated round command | `expectedRoundIndex` / `expectedRoundVersion` |
| a retried submission | receipt keyed by `submissionId` → replay |
| a submission id shaped like a server receipt key | ids are `[A-Za-z0-9_-]{1,100}`; a milestone never overwrites a receipt |
| two lobby creates at once (two tabs) | pointer claimed in a transaction before players and invites; the losing room is retired |
| a class answering at once past the closing threshold | one conditional write per round; the rest find it closing and skip |
| a second answer to a classic round | `planAttempt` → completed question rejects |
| a submission into a stale round | lifecycle `submit` checks round index, version and token |
| a retried round close | `roundState: closed`; per-round totals keyed by round |
| a retried or concurrent finalization | terminal status + one match result per room; `finalizationId` |
| an effect run twice | each effect idempotent; `done` wins the merge |
| a reward delivered twice | deterministic award id; existence check in the delivering transaction |
| re-staging rewards | merge keeps processed awards processed |
| a grant used twice | `transitionRewardGrant` plans and writes in one transaction |
| a reconnect | `joinLiveChallenge` merges into the existing player: same key, score and join round |
| several host screens closing the same round on time | the close is round-scoped and idempotent: the first closes it, the rest get `alreadyApplied` |
| Play Again | always a new room id: new receipts, rounds, tokens, match result and award identities |

---

## 11. Clients

The host console, the projector and the student screens are described in
`live-challenge-shell.md`: the derived stages, the countdown, round pacing,
score presentation, the results moment, the roster and presence, reconnects,
late join and Play Again. The rules below are the engine-facing ones.

- **One mount per room.** The student screen is keyed by room id (dashboard and
  Warm-Up), and resets its room, standings and error when the room changes.
  `acceptChallengeSnapshot` accepts a snapshot of a *different* room
  unconditionally and orders snapshots of the same room by round, version and
  phase. A student's second and third match of a period start clean.
- **Listener ownership.** The room listener depends on the room id only; clock
  calibration (every 30 s, live games only) is read through a ref and never
  re-subscribes it.
- **Refresh after answering.** The student's own public player row (its one
  row listener) carries `answeredRound`, which locks the round even when no
  local result survived; the server's result is kept for the
  current round (live rooms only) and restored on reload; a refused second
  answer (`already-exists`) is shown as "recorded", not as an error.
- **One command at a time.** The teacher console sends lifecycle commands
  through one lock; every lifecycle control is disabled while any command is in
  flight, and round commands carry the round on screen.
- **The host closes rounds** for every mode (shell doc §4) with the same
  idempotent close the teacher can press; Next Round is the teacher's, from a
  closed round.
- **Boards** rank with the room's strategy (`leaderboardOptionsFor`) and show
  working points only while the round takes answers; results read the round's
  result document; the podium fills steps in standing order and labels each
  step with its player's (possibly shared) rank.
- **Standings reach a student as one snapshot** (§12a), never as the class's
  rows: a screen listens to the room, the standings snapshot, its own public
  row and its invite — four listeners whatever the class size.
- **The host console paces live standings** (`useStandingsPublisher`): it
  already ranks every row, and when its board changes it asks
  `publishLiveChallengeStandings` for a fresh snapshot, at most once a second.
  A console that is closed or asleep leaves the live board stale and nothing
  else.
- **Host audio** forgets the previous game's state when the room changes, and
  makes no sound it cannot play (unprimed or muted).
- **Graph Feature Rush** (`graph-feature-rush.md`): the student plays on a
  lazily loaded full-screen surface; both standings listeners (the snapshot
  and the student's own row) pause while a rush round is open.

---

## 12. Data model and access

| Path | Holds | Client access |
| --- | --- | --- |
| `liveChallengeRooms/{roomId}` | status, round identity and state, clock, current question, mode/strategy ids, speed setting, `rewardSummary` (what placements earn; no student) | room audience reads |
| `…/players/{playerKey}` | alias, seat (`slot`), scores, answeredRound; for a rush also `matchAccuracy`, `rushRound`, `rushRoundCompleted`, `rushActiveAt`, `lastRound` — no student id | room audience reads (a student's screen listens to its own row only; own-row-only rules are a later deploy) |
| `…/standings/current` | the class's standings snapshot (§12a): top rows, every seat's rank and score, the moment it is from — no student id | room audience reads; no client writes |
| `…/rounds/{round}` | anonymous round result, with `standingsAfterRound` | room audience reads |
| `…/diagnostics/{playerKey}` | device health: connection quality, recent `sessions` (per-tab ids → last heard), `reconnectedAt` | room owner reads |
| `liveChallengePrivate/{roomId}` (+ `players`, `rounds`) | question ids, roster, receipts, reward policy, scoring config | none |
| `liveChallengeInvites/{studentId}` | which room a student is in | own student |
| `liveChallengeTeacherActive/{email}` | the teacher's active room pointer | own teacher |
| `liveChallengeMatchResults/{roomId}` | durable final result + effects bookkeeping | none |
| `liveChallengeReports/{roomId}` | teacher report | room's teacher |
| `liveChallengeAchievementJobs/{roomId}` | staged awards and outcomes | none |
| `classPointTransactions`, `classPointAccounts` | the Class Points ledger | student own; authorized teachers |
| `rewardGrants/{grantId}` | item rewards | student own; authorized teachers; no client writes |

Permanent student deletion (`permanentlyDeleteStudent`) removes the student's
grants and award-job references and scrubs their rows from match results and
reports (by the `studentIds` key both carry). Reports written before that key
existed are not reachable by query — a known gap. The pre-production reset
clears every collection above.

### 12a. The standings snapshot

Students used to listen to every classmate's public row; every answer (and
every progress report, and every round close under a placement strategy) was
delivered to every screen — N × N per round, 4,096 at 64 students, each one
re-ranking the class on a Chromebook. Now one small document,
`liveChallengeRooms/{roomId}/standings/current`
(`functions/shared/liveChallengeStandingsProjection.mjs`), carries what a
student's screen shows: the top five rows, and every joined player's rank and
score as two compact lists indexed by seat (`slot`, fixed at room creation; a
room from before seats is seated by player key, `slotKeys`). It is replaced
whole, never patched, so a screen that missed one loses nothing.

| Kind | Written by | From |
| --- | --- | --- |
| `live` | `publishLiveChallengeStandings`, when the host's pacer asks (≤ 1 request/s while the board changes; the server writes at most one per 750 ms, room for the publish's own duration) | one read-only transaction over the room and every public row, ranked by `publicLeaderboard` with the room's strategy |
| `roundClosed` | the transaction that closes a round (Close Round, Next Round) | that round's `standingsAfterRound`, from the private records |
| `final` | the transaction that finishes the match (or `ensureLiveChallengeFinalStandings`, once, for a finished room that has none) | the match result's standings: the podium IS the match result |

Ordering (`projectionMayReplace`): a final is never replaced; an earlier
moment of the match (round version, then lobby < open < closed < final) never
replaces a later one; at the same moment an exact snapshot beats a live one;
live against live, the later read wins. An answer never reads or writes the
snapshot, and nothing reads it to score: points, placements, rewards and the
match result come from the private records only. Its contents are what every
student is already shown (game alias, rank, shared rank, score, how many are
playing) — never a student id, email, answer, per-player time, diagnostic or
support. Rules: the room's audience reads it; no client writes it.

---

## 13. Performance notes

- **Per submission**: one transaction reading the room and the private player,
  writing the private and public player — as before. Speed influence is read
  from the room (rooms created before the field read the experience document
  once). The closing-threshold check (two count aggregations) runs only while
  compression can still apply, and compresses with one precondition write: 20
  answers arriving together waited 3.4 s (p50) for "Correct!" behind a room
  transaction each; they now take about 0.3 s.
- **Per round close / advance**: one transaction reading the room, private state
  and the room's private players (the roster), writing the room, private state,
  two round-result documents, the standings snapshot (§12a), and — for a
  per-round strategy only — each player's private and public record. A 35-student Grand Prix round is about 76
  writes, well inside the 500-write transaction limit. Readiness is decided from
  the same read, so it cannot disagree with what the close writes.
- **Contention**: submissions arriving during a close wait on the close's
  read locks for its duration (tens of milliseconds); the close only happens
  once the round is ready, when late traffic is limited to the bounded grace.
- **Finalization**: one transaction (room, private state, match result,
  pointer), then the effects. Award delivery is one small transaction per award.
- **Client listeners**: student — room (with metadata, for an honest
  "Reconnecting…"), the standings snapshot and their own public row (§12a),
  plus the current round's result while its results are on screen — constant
  in the class size; teacher — room, players, diagnostics, active pointer,
  plus the round result during results; the roster callable once per room.
- **Standings delivery** (§12a): a student's screen receives at most about one
  snapshot a second while the board changes, plus the exact snapshot at each
  close and at the finish, and its own row when it changes — about 14
  standings documents per screen over a three-round game at any class size
  (the launch certification bounds it). Before, each screen received every
  classmate's row change: about N per round, N² across the class. The live
  snapshot costs the server one read-only transaction over the room's public
  rows and one write, at most once a second, only while the board changes.
  Each calibration is now one transaction on the student's diagnostics row
  (it was a merge write).
- **Client rendering**: screens re-derive at clock boundaries instead of
  re-rendering every 250 ms; clock digits tick in their own component; the
  question engine is memoized against the round around it (shell doc §2).
- **Graph Feature Rush**: one transaction per batch of a student's taps (see
  `graph-feature-rush.md` §10).
- **Client bundle**: the lazily loaded student game chunk carries the ranking,
  timer-readiness and strategy registries it now ranks with — about 12 kB more
  than before the engine (≈4 kB gzip). The engine modules deliberately have no
  `export default` aggregate object: one would reference every function and
  defeat tree-shaking, which is what an early draft of this work did (+23 kB).
  Keep it that way when adding modules the browser imports. The shell (stage,
  standings, presence and replay models, the shared parts and cards) added
  about 32 kB to the lazily loaded student chunk (≈10 kB gzip) and 16 kB to the
  teacher console (≈5 kB gzip).

---

## 14. What future work must not change

- **Lifecycle semantics**: the status values, terminal immutability, and
  `alreadyApplied` as success. New states are derived, not stored beside these.
- **Ids that are stored**: mode ids, scoring strategy ids, reward rule ids
  (`challengeFinisher`, `strongAccuracy`, `comeback`), `RECEIPT_KIND` values.
  Registries refuse to replace a registered id.
- **Award identity and document ids**: `lca_` ledger ids and `lcg_` grant ids.
  Changing either re-awards everything already awarded. Change a rule's meaning
  with a new `ruleVersion` or a new `ruleId`, never by editing in place.
- **Receipts as the source of truth**, keyed by attempt id; completion is
  derived, never stored.
- **Effects read the match result**, never private state, and stay idempotent.
  Private state is deleted last.
- **Public documents carry no student id** (players, rounds).
- **The experience trigger marker** (`experienceSpeedAdjustedRound`) until a
  deployment explicitly deletes `adjustLiveChallengeExperienceScore`.
- **Accuracy First arithmetic**: existing classes' scores must not shift.

---

## 15. Deferred, deliberately

- Host pause/resume controls (the timer model supports them). ~~An automatic
  round close from the host screen for the classic modes~~ — built: every mode
  (`live-challenge-shell.md` §4).
- Teacher UI for choosing a scoring strategy for the classic modes (the server
  accepts `scoringStrategyId` and `scoringConfig` at create and validates them;
  every results screen presents Grand Prix and Correct Count; Graph Feature
  Rush's setup offers its two strategies). The reward-policy
  choice now exists as a small preset picker (`ChallengeRewardSettings`, used
  by every mode); a free-form rule editor is still deferred.
- ~~A student rewards wallet and teacher revoke~~ — built: see
  `docs/architecture/rewards.md` (wallet, Practice Pass redemption from a
  held pass, teacher give / take back / undo, Challenge reward choice and
  diagnostics). An expiry sweep is still deferred: an expired grant already
  reads as expired everywhere (`effectiveGrantStatus`), so persisting it is
  housekeeping, not correctness.
- Deleting the legacy experience trigger in a deployment that removes it
  explicitly.
- Reports written before `studentIds` existed are not reachable by permanent
  student deletion.
