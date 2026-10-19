# Path growth events for rewards

For job E (growth, effort and mastery rewards). My Math Path does not grant
rewards. It exposes one pure reader,
`functions/shared/pathGrowthEvents.mjs`, that says which reward-worthy events
a student's Path records contain. It has no Firestore, network or clock, so
Cloud Functions and the browser import the same file. Tests:
`tests/platform/pathGrowthEvents.test.mjs`.

## The two events

| Event | Means | Read from | Counted by |
| --- | --- | --- | --- |
| `weeklyGoalHit` | The student finished every session of a frozen weekly goal | the `weeklyPathGoalSnapshots` document (written by the server with `assignmentState: "assigned"`) + that week's completions | `evaluateWeeklyGoalProgress` (weeklyPathGrade.mjs): the slot matcher and required count the weekly grade uses |
| `skillMastered` | A skill became Mastered | two successive mastery snapshots, or a history of them | `classifyMasteryStatus` (masteryRule.mjs): the one Mastered rule |

```js
{ type: 'weeklyGoalHit', eventKey, studentId, classId, weekKey,
  completedAt, onTime, required, completedOnTime }

{ type: 'skillMastered', eventKey, studentId, classId, teksCode, at }
```

- `completedAt` is when the goal was hit: the time of the last matched
  completion needed (the `required`-th, in time order). It is `null` if those
  completions have no usable time.
- `onTime` uses the grade's own rule: the goal was hit by `goal.dueAt`.
- `required` is never more than the slots the week was given. A week the
  planner could not fill to the teacher's count is hit when its own cards are
  done (see `requiredWeeklySessions`).
- A proposed or simulated week (`assignmentState` other than `"assigned"`) is
  never an event.
- Completions must come from `completionFromPathSession` /
  `collectWeeklyPathSessions` (weeklyPathCompletion.mjs), so only sessions the
  server marked `completed` count.
- A mastery profile is classified from its facts by the rule. Its stored
  status label is not read.

## Idempotency: `eventKey`

| Event | `eventKey` | Unique per |
| --- | --- | --- |
| weekly goal hit | `weeklyGoalHit:<studentId>:<weekKey>` | student and week (Monday-start week key) |
| skill mastered | `skillMastered:<studentId>:<TEKS>` | student and skill, ever |

Reading the same records again gives the same keys. That covers a retried
trigger, a nightly re-scan and two overlapping jobs. So write each grant
create-if-absent under its key, inside a transaction.

A skill that drops below Mastered and comes back keeps the same key. That is
on purpose: mastering a skill is rewarded once. Paying for the round trip
would pay a student to let a skill decay.

`eventKey` is not a Firestore document id, because it contains `:` and `.`.
Use it as the award's source id and hash that, the way `rewardGrants` already
does:

```js
const identity = rewardAwardIdentity({ sourceType: 'pathGrowth', sourceId: event.eventKey, studentId: event.studentId, ruleId });
const grantId = buildRewardGrantId(identity);   // create-if-absent
```

## How to call it

Skill mastered, live: `updateMyMathPathMasteryFromEvidence` already holds the
stored profiles and the profiles it is about to write, in one transaction.

```js
const events = skillMasteredEvents({
  studentId, classId: evidence.classId,
  before: profileSnapshot.data()?.profiles || {},   // what was stored
  after: profiles,                                   // what is being written
  at: Date.now(),
});
```

Weekly goal hit, live: after a weekly Path session completes, read the
student's frozen goal for that week and the week's completions.

```js
const event = weeklyGoalHitEvent({ studentId, goal: frozenSnapshot, completions });
```

Weekly goal hit, after the week closes: use the class-week loader the
Classroom publisher already uses (`loadWeeklyPathClassWeek`).

```js
const events = weeklyGoalHitEvents({ goalsByStudentId, completionsByStudentId });
```

Catch-up or backfill from the weekly mastery history (`studentMasteryHistory`,
from job D's growth track: `functions/shared/masteryHistory.mjs`). Snapshots
go oldest first. Values may be profiles, status strings or anything `statusOf`
understands.

```js
const events = skillMasteredEventsFromHistory({
  studentId,
  history: weekKeys.sort().map((weekKey) => ({ at: weeks[weekKey].updatedAt, skills: weeks[weekKey].skills })),
  // e.g. the weekly history's [estimate, statusCode] pairs:
  statusOf: ([, code] = []) => masteryStatusFromCode(code),
  assumeEmptyBaseline: true,   // count skills already Mastered in the first snapshot
});
```

Without `assumeEmptyBaseline`, the first snapshot is only a baseline. A skill
already Mastered there was mastered at an unknown earlier time, so it produces
no event.

## What this reader does not do

- It grants nothing and writes nothing.
- It does not decide amounts, badges or which rule applies. That is job E's
  policy.
- It does not read answers, questions or anything a student could use to game
  a reward. Its inputs are completion facts and mastery facts the server
  already computed.
