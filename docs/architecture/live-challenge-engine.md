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

`functions/index.js` loads the pure modules once through `liveChallengeEngine()`.

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
  capabilities: { secondChance, progressMilestones, paceTiming, closingThreshold, dryRun },
  normalizeConfig: (raw) => ({ questionStyle, ... }),   // the mode's teacher settings
})
```

| Part | What it decides |
| --- | --- |
| `roundStructure` | how many questions a round holds, how a player's round is measured (`performance`) and ranked (`ranking`) |
| `questionSource` | which question planner draws the round's questions (`LIVE_CHALLENGE_QUESTION_PLANNERS` in `functions/index.js`: `plan` for a room or dry run, `swap` for a dry-run swap) |
| `questionSpec` | completion rule and target count per question (section 5) |
| `scoringStrategies` | the strategies a room of this mode may use; anything else resolves to the default |
| `capabilities` | engine features the mode opts into, read where they apply (e.g. `progressMilestones` gates the Solver Race progress callable) |
| `normalizeConfig` | validates the mode's own create settings |

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
   `{ candidateCount, selected, roundQuestions, seed }`, and `swap`).
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
shaped mode exactly this way.

---

## 4. The round timer

The clock is **data the server owns**: `startsAt` and `endsAt`. Every screen
derives what it shows from those timestamps and its calibrated view of server
time, so a refresh, a sleeping Chromebook or a reconnect catches up to the real
deadline. There is no countdown to restart.

- `buildRoundTimer({ nowMs, durationMs })` — a round starts
  `ROUND_SYNC_LEAD_MS` after the server's now so every device can synchronize;
  `durationMs: null` is an open-ended Pace Race round.
- `timerFromRoom(room)` — reads it back; only `timingMode: 'pace'` is
  open-ended by design.
- `compressTimer` — the closing threshold; only ever brings a deadline closer.
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
attempt. Score-only receipts (Solver Race productive-speed milestones,
`receiptKind: 'productiveSpeedMilestone'`) carry points but are never attempts.

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
| `grandPrix` | per round | round performance → round rank → placement points (`[15, 12, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1]`, 1 beyond the table, 0 for no credit) → championship total. No streak/comeback carry-over between rounds. Ranked by match points, then round wins, then raw score. |
| `correctCount` | per response | one point per fully correct response |

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
the championship total. Leaderboards use `leaderboardOptionsFor(strategy)`:
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
  (`publicRoundSummary`: player key, alias, rank, points — no student id), read
  by the room's audience.

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
| `privateCleanup` | deletes `liveChallengePrivate/{roomId}` — last, only once every other effect has settled (or been abandoned after `LIVE_CHALLENGE_EFFECT_MAX_ATTEMPTS`) |

Each effect is idempotent. Outcomes are merged into `effects` in a transaction
where `done` always wins. A failure is logged and left for the scheduled sweep
(`retryLiveChallengeAchievementJobs`, every 15 minutes), which re-runs pending
effects for results more than two minutes old. A crash between the terminal
transaction and the effects therefore loses nothing.

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
finish first.

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

---

## 10. Idempotency, in one table

| Hazard | Guard |
| --- | --- |
| two Start / Next Round / Finish presses | lifecycle plan inside the transaction; `alreadyApplied` |
| a late or repeated round command | `expectedRoundIndex` / `expectedRoundVersion` |
| a retried submission | receipt keyed by `submissionId` → replay |
| a second answer to a classic round | `planAttempt` → completed question rejects |
| a submission into a stale round | lifecycle `submit` checks round index, version and token |
| a retried round close | `roundState: closed`; per-round totals keyed by round |
| a retried or concurrent finalization | terminal status + one match result per room; `finalizationId` |
| an effect run twice | each effect idempotent; `done` wins the merge |
| a reward delivered twice | deterministic award id; existence check in the delivering transaction |
| re-staging rewards | merge keeps processed awards processed |
| a grant used twice | `transitionRewardGrant` plans and writes in one transaction |
| a reconnect | `joinLiveChallenge` merges into the existing player: same key, score and join round |

---

## 11. Clients

- **One mount per room.** The student screen is keyed by room id (dashboard and
  Warm-Up), and resets its room, standings and error when the room changes.
  `acceptChallengeSnapshot` accepts a snapshot of a *different* room
  unconditionally and orders snapshots of the same room by round, version and
  phase. A student's second and third match of a period start clean.
- **Listener ownership.** The room listener depends on the room id only; clock
  calibration (every 30 s) is read through a ref and never re-subscribes it.
- **Refresh after answering.** The public player row's `answeredRound` locks the
  round even when no local result survived; the server's result is kept for the
  current round (live rooms only) and restored on reload; a refused second
  answer (`already-exists`) is shown as "recorded", not as an error.
- **One command at a time.** The teacher console sends lifecycle commands
  through one lock; every lifecycle button is disabled while any command is in
  flight, and round commands carry the round on screen.
- **Leaderboards** rank with the room's strategy (`leaderboardOptionsFor`);
  the lobby lists players without ranks; the podium fills steps in standing
  order and labels each step with its player's (possibly shared) rank.
- **Host audio** forgets the previous game's state when the room changes.

---

## 12. Data model and access

| Path | Holds | Client access |
| --- | --- | --- |
| `liveChallengeRooms/{roomId}` | status, round identity and state, clock, current question, mode/strategy ids, speed setting | room audience reads |
| `…/players/{playerKey}` | alias, scores, answeredRound — no student id | room audience reads |
| `…/rounds/{round}` | anonymous round result | room audience reads |
| `…/diagnostics/{playerKey}` | device health | room owner reads |
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

---

## 13. Performance notes

- **Per submission**: one transaction reading the room and the private player,
  writing the private and public player — as before. Speed influence is read
  from the room (rooms created before the field read the experience document
  once).
- **Per round close / advance**: one transaction reading the room, private state
  and the room's private players (the roster), writing the room, private state,
  two round-result documents, and — for a per-round strategy only — each
  player's private and public record. A 35-student Grand Prix round is about 76
  writes, well inside the 500-write transaction limit. Readiness is decided from
  the same read, so it cannot disagree with what the close writes.
- **Contention**: submissions arriving during a close wait on the close's
  read locks for its duration (tens of milliseconds); the close only happens
  once the round is ready, when late traffic is limited to the bounded grace.
- **Finalization**: one transaction (room, private state, match result,
  pointer), then the effects. Award delivery is one small transaction per award.
- **Client listeners**: student — room + players (the 30-second re-subscription
  is gone); teacher — room, players, diagnostics, active pointer.
- **Client bundle**: the lazily loaded student game chunk carries the ranking,
  timer-readiness and strategy registries it now ranks with — about 12 kB more
  than before the engine (≈4 kB gzip). The engine modules deliberately have no
  `export default` aggregate object: one would reference every function and
  defeat tree-shaking, which is what an early draft of this work did (+23 kB).
  Keep it that way when adding modules the browser imports.

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

- Host pause/resume controls (the timer model supports them) and an automatic
  round close from the host screen when a round becomes ready.
- Teacher UI for choosing a scoring strategy, Grand Prix round-result screens
  and a reward-policy editor (the server accepts `scoringStrategyId`,
  `scoringConfig` and `rewardPolicy` at create and validates them).
- A student rewards wallet, teacher revoke, and an expiry sweep — all built on
  `transitionRewardGrant`.
- Graph Feature Rush (multi-target, question-set rounds) — the mode contract,
  round structure and attempt model are in place.
- Deleting the legacy experience trigger in a deployment that removes it
  explicitly.
- Reports written before `studentIds` existed are not reachable by permanent
  student deletion.
