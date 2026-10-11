# Rewards: wallet, redemption and teacher controls

This document covers the rewards a student holds and uses, and what their
teacher sees and can correct. It sits on top of the rewards foundation in
`docs/architecture/live-challenge-engine.md` §9. That foundation covers reward
rules, award identity, exactly-once delivery and the grant lifecycle. This
document builds on it and redesigns none of it.

```
EARN                         HOLD                    USE                          SEE / CORRECT
Live Challenge rule ─┐                               Student: Use a Practice Pass  Teacher: student drawer → Rewards
Teacher gives one ───┼─►  rewardGrants/{id}  ──►  redeemPracticePass (one tx) ─► classPointRewardRedemptions/{id}
Class Points (100) ──┘    (one doc per item)       pass or points + waiver         ↑ every grade/completion reader
```

---

## 1. Reward types

All reward copy lives in `functions/shared/rewardGrants.mjs` `REWARD_DEFINITIONS`. That includes the student sentence, how to use it, the teacher sentence and the grade effect. The wallet, the teacher's reward guide and these docs all read that one source.

| Reward | Kind | How it is earned | What it does | Grade / completion effect |
| --- | --- | --- | --- | --- |
| **Practice Pass** | item (grant), redeemable | Live Challenge placement rule; a teacher; or bought with 100 Class Points | Excuses the Practice section of one eligible assignment | Practice is **excused, not scored**. It is removed from the assignment grade denominator and from required completion, and sent to Google Classroom without Practice. Grade Transfer shows it as *Excused (Practice Pass)* with no numeric TEAMS row. Warm-Up, Classwork and DOL are unchanged. It never counts as a correct answer or as mastery evidence. |
| **Badge** | item (grant), kept | Live Challenge rule (e.g. *Live Challenge Champion*); a teacher | Recognition only | None |
| **Class Points** | currency (ledger) | Teacher awards; Live Challenge achievements | Spent 100 at a time on a Practice Pass | Earning points has no grade effect. Spending them has the Practice Pass effect above. |

**There is no separate Homework Pass.** In MathMaster the homework *is* the
Practice section. Publishing with a separate Practice due date posts it to
Classroom as "— Homework" (`publicationPlanner.js`). A Homework Pass would
have exactly the Practice Pass's effect under a second name. §8 explains how
to add a reward with a genuinely different effect.

## 2. Lifecycle

### Item rewards (`rewardGrants/{grantId}`)

```
available ──use──────► redeemed   (on one assignment; terminal)
available ──take back► revoked    (teacher, with a reason the student sees; terminal)
available ──time─────► expired    (read as expired once past expiresAt; terminal)
```

Nothing is ever deleted. Every transition appends to `history`. A Challenge
award that is taken back keeps its document, so a retried delivery (finish
again, host reconnect, the 15-minute sweep) finds it and never issues it again.

Grant ids are deterministic, so a retry lands on the same document:

| Source | `source.type` | Id |
| --- | --- | --- |
| Live Challenge rule | `liveChallenge` | `lcg_<sha256(award identity)>` (foundation) |
| Teacher | `teacher` | `tgr_<sha256(classId␀studentId␀requestId)>` |
| Returned by an undo | `restored` | `rgr_<sha256(redemptionId␀cycle)>`, `source.restoresGrantId` = the spent grant |

### A use (`classPointRewardRedemptions/{redemptionId}`)

The waiver is a single document per (student, class, assignment). It has the same id the original 100-point Practice Pass always used. That is why every grading reader honours a pass however it was paid for.

```
(none) ──use──► redeemed ──teacher undo──► reversed ──use again──► redeemed (previousRedemptions keeps the undone use)
```

| Field | Meaning |
| --- | --- |
| `paidWith` | `pass` (a grant the student held) or `classPoints` |
| `grantId` / `transactionId` | the spent grant, or the 100-point ledger debit |
| `status` | `redeemed` = Practice is excused; `reversed` = undone, kept as history |
| `reversal`, `refund` | who undid it and why; the returned pass (`grantId`) or refund (`transactionId`) |
| `previousRedemptions` | every earlier, undone use of the same assignment |

`isActivePracticePassRedemption` exists on both sides
(`functions/shared/classPointRewards.mjs`, `src/platform/classPointsClient.js`).
It is the only test for "is Practice excused". A record with no `status` was written before uses could be undone, and it is treated as live.

## 3. Redemption

`redeemPracticePass` (callable) → `rewardActionStore.redeemPracticePass`, in **one transaction**:

1. Read the student's grade record (class of record), the assignment and the waiver document.
2. **An active waiver already exists** → answer `alreadyExcused` and spend nothing. A double click, a refresh, a second tab and a retry after a lost response all land here.
3. Check the roster: the class exists, is not archived, and the student and class agree.
4. Check eligibility (§4).
5. Pay:
   - **`pass`**: query the student's available passes in this class and spend the soonest-expiring one (`pickGrantToSpend`; the browser's suggestion is honoured if it is still usable). There are no passes when none are usable, so another student's grant id can never be spent: the query is scoped to the caller.
   - **`classPoints`**: debit 100 through the ledger (`applyTransaction` refuses a negative balance).
6. Write the waiver and the payment together.

The benefit and its payment commit together or not at all. "Consumed without
benefit" and "benefit without consumption" are impossible by construction.
One pass cannot cover two assignments: two concurrent uses on different
assignments contend on the same grant document, so the second gets a different
pass or is refused.

A call without `payWith` keeps the original meaning (spend 100 Class Points), so a browser still running the previous build behaves as before.

## 4. Eligibility

There is one rule, `evaluatePracticePassEligibility`
(`functions/shared/classPointRewards.mjs`), enforced only by the server. The
browser's `practicePassClientEligibility.js` mirrors it **only to decide what to
offer**. A wrong guess there costs nothing.

| Rule | Code |
| --- | --- |
| Assigned to the student's class | `not-assigned-to-class` |
| Teacher has not turned passes off (`assignment.rewardPolicy.practicePassEligible === false`) | `reward-policy-disabled` |
| Has a current-content Practice section | `no-practice-section` |
| Not a Test Cycle / quiz / test (absolute; no override) | `test-cycle-assignment`, `quiz-assignment`, `test-assignment` |
| Open now: not scheduled, not past the final (per-student) deadline | `assignment-scheduled`, `assignment-practice-mode`, `assignment-not-credit-eligible` |
| No credit-bearing Practice attempt yet (authoritative tracker, never a draft) | `practice-already-attempted` |
| 100 Class Points — **only when paying with points** | `insufficient-balance` |

If an assignment stops being eligible while the confirmation is open (Practice
answered in another tab, a deadline passing), the dialog says so and the
button is disabled. If only the server can see the change, its refusal is
shown with "Nothing was used."

## 5. Assignment effects — where a waiver is read

| Reader | How |
| --- | --- |
| Submission ingestion (`functions/index.js`) | A Practice response for an excused assignment is retired (`practice-pass-redeemed`), never graded. After an undo, Practice responses are accepted again. |
| Google Classroom passback | Practice indices are removed from the denominator while the waiver is active. |
| Grade Transfer / TEAMS export | `listGradeTransferState` counts `status === 'redeemed'` only. Excused Practice gets no numeric row. |
| Student Grade Center, dashboard, runtime | `redemptionsByAssignment` holds **live waivers only**, so required navigation, completion and resume skip Practice. |
| **Teacher gradebook, Assignment Hub, student drawer** *(new in this change)* | `useClassPracticePasses` → `classGradeProgress({ hasPracticePass })` / `studentAssignmentProgress({ practicePassRedeemed })`. A student who used a pass reads as complete with Practice *Excused (Pass)*, not "in progress, Practice 0%". |

Grading policy itself is unchanged. These readers now apply the waiver the
student, Classroom and Grade Transfer already applied.

## 6. Live Challenge rewards

The Challenge foundation decides who earned what, from the durable match
result, and delivers each award once (engine doc §9). This change adds:

- **A teacher choice** in the create panel (`ChallengeRewardSettings`):
  - Practice Pass for nobody / 1st / top 2 / top 3, expiring after 7, 14 or 30 days, or never.
  - Champion badge for 1st, on or off.

  `challengeRewardPolicy.js` turns the choice into the `rewardPolicy` the server already validated. The default achievements are always kept under their original ids. Choosing nothing sends no policy, so the server default is unchanged. Ties share a place, so tied players all earn it.
- **The student's match results** (`ChallengeRewardsEarned`, a slot in the
  finished view). It shows what reached the wallet *from that room*, apart from
  placement and game points.
- **Teacher diagnostics** (`rewardDiagnostics.mjs`). For the student's last six
  matches in the class, each rule shows what it needs, what the student did,
  whether it was met, and whether the reward arrived (`Delivered`, `Arriving`,
  `Not delivered: the student had moved to a different class`, …).
- **`rewardsSkipReason`** on the match result, written when a whole match's
  rewards were skipped (archived class, no teacher of record). Before this, it
  left no trace.
- **What placement earns, on the screens** (`live-challenge-shell.md`). At
  create, `publicRewardSummary(policy)` stores the policy's placement rules on
  the public room as `rewardSummary` (max rank, minimum rounds answered, the
  reward's code and label; whether Class Points achievements are on) — rewards,
  never a student. The lobby and the console say "Top 3: Practice Pass each";
  the projector's podium shows the reward beside each place
  (`placementRewardsFor`, the same rule the delivery applies — a test holds the
  two equal over random standings, ties included). It is display only: the
  policy itself stays private and rewards are still delivered once, by the
  server, from the match result; a student's own device shows what reached
  their wallet.

## 7. Reversal rules

| Mistake | Correction | Effect |
| --- | --- | --- |
| A pass or badge given in error (teacher or Challenge) | **Take back** (`revokeRewardGrant`) | Grant → `revoked` with the reason. Only an *unused* reward can be taken back. |
| A pass used on the wrong assignment | **Undo** (`undoPracticePassRedemption`) | Waiver → `reversed`, so Practice is required again. A pass bought with a pass returns as a new `restored` grant: the spent one stays redeemed, because terminal states never change. Its expiry is the original or at least 7 days from now. A pass bought with points is refunded 100 by a `rewardRefund` transaction, which lowers `lifetimeSpent` and does not count as earnings. |
| A teacher Class Points award | **Reverse award** (existing, Live Classroom) | Compensating ledger entry. |
| A Live Challenge Class Points achievement | Not reversible | Awarded by rule from the match result. Deliberately outside teacher reversal (`isReversibleAward`). |

Every correction requires a reason the student sees. Each is one transaction, idempotent on retry, and authorized from the class record (`authorizeClassPointsActor`) before anything is read back.

## 8. Adding a reward type

1. Add a definition to `REWARD_DEFINITIONS` with every copy field. Set `grantable` / `redeemable` / `teacherAwardable` and, if it is redeemed, `redeemsAgainst`.
2. If it is redeemed against something new, write its eligibility rule beside `evaluatePracticePassEligibility`, server-only. Write its effect document and make **every reader** of that effect go through one `isActive…` helper (§5 is the list for Practice).
3. Add a store function shaped like `redeemPracticePass`: one transaction that writes the effect and the grant transition together, with an existing-effect check as the idempotency key.
4. Wallet: `buildRewardWallet` counts by `rewardCode`. Add a card and a use dialog if it is used.
5. Teacher: `buildTeacherRewardsView` already lists any grant; add its use list if it has an effect.
6. Tests: a pure eligibility test, an emulator test in `tests/integration/rewardActions.test.mjs` (atomic, idempotent, refused without spending), a rules case, and a step in `tests/browser/rewardsQa.mjs`.

## 9. Security

- No client writes `rewardGrants` or `classPointRewardRedemptions`. That includes the root admin (`firestore.rules`; `tests/rules/securityRules.test.mjs` covers forging, editing type, quantity, source or history, and self-excusing).
- A student redeems only as the student in their verified token. The class comes from their own grade record, the assignment must be assigned to that class, and the pass query is scoped to them.
- Teacher actions and the teacher read require the class's teacher of record (or root admin) and a roster that agrees with the class. This is checked inside the transaction for writes, and first for the read.

## 10. Reads, listeners and cost

| Screen | Reads |
| --- | --- |
| Student (always) | one listener on `rewardGrants` where student = me, class = mine, status = available. It is small and makes new rewards appear live. |
| Student (existing) | Class Points account + last 10 transactions; own waivers |
| My Rewards → History | one `getDocs` of the student's grants in this class, when opened; shown 10 at a time |
| Teacher student drawer | one `getStudentRewards` call per opening: grants, waivers, last 30 Class Points entries, last 6 matches + their award jobs (`getAll`) |
| Gradebook / Assignment Hub | one `listGradeTransferState({ practicePassesOnly })` call per class while open |

New index: `liveChallengeMatchResults (studentIds CONTAINS, finalizedAtMs DESC)` for the diagnostics query. The rest use equality filters only. **Deploy needs `firestore:indexes` and the new callables:** `awardRewardGrant`, `revokeRewardGrant`, `undoPracticePassRedemption`, `getStudentRewards`, plus the updated `redeemPracticePass`, `listGradeTransferState`, the ingestion callable, the Classroom passback trigger and `retryLiveChallengeAchievementJobs`. The safe choice is a full functions deploy.

## 11. Tests

| Suite | Holds |
| --- | --- |
| `tests/platform/rewardWallet.test.mjs` | counts, multiple types, expiry, history kinds, celebration-once, match-scoped results, failure copy |
| `tests/platform/rewardsDomain.test.mjs` | pass-paid eligibility, live-waiver rule (both sides), refund ledger arithmetic, refund ids, spend order, teacher progress with a waiver |
| `tests/platform/rewardDiagnosticsAndPolicy.test.mjs` | the teacher's Challenge choice → validated policy, ties, diagnostics, teacher view |
| `tests/platform/rewardsWiring.test.mjs` | callables delegate to the store; every waiver reader honours undo; grade views pass the waiver; screens reachable |
| `tests/integration/rewardActions.test.mjs` (emulator) | award once, use atomically, double click / two tabs / one pass for two assignments, expired never spent, refused without spending, another student's pass, points purchase, undo both ways, take back, Challenge award taken back never re-issued, teacher read across three matches |
| `tests/rules/securityRules.test.mjs` | wallet queries scoped to self; no client issues, edits or self-excuses |
| `tests/browser/rewardsQa.mjs` (`npm run test:rewards-browser`) | the whole flow in Chromium at phone, tablet and Chromebook sizes: 26 checks covering both roles, plus screenshots |

## 12. Growth rewards and class rewards (student push E, 2026-10)

### Growth, effort and mastery (`functions/shared/growthRewardRules.mjs`, `functions/lib/growthRewards.js`)

`syncStudentGrowthRewards` (student; called once per session by
`useGrowthRewardSync`) re-derives awards from the student's own authoritative
records and delivers each exactly once (deterministic `gra_` ledger / `grg_`
grant ids, existence check and roster re-check in the delivering transaction):

| Rule | Source | Award |
| --- | --- | --- |
| Retest improved by ≥ 10 points | `testCycleRecords` (raw released scores) | 15 Class Points + badge `growth-retest` |
| Retest passed after a failing test | same (either-or with the above, one identity per cycle) | 20 Class Points + badge `growth-retest` |
| Corrections completed (required, not waived, non-empty) | `testCycleRecords.corrections` | 10 + badge `growth-corrections` |
| Weekly My Math Path goal met on time | `weeklyPathGoalSnapshots` + `pathSessions` | 10; three weeks running: 15 + badge `growth-path-streak` |
| A skill reaches Mastered | `studentMasteryHistory` (when), checked against `studentMasteryProfiles` (the evidence) | 5 per skill, once ever; badges `mastery-5`, `mastery-10` |

Only events on or after 2026-10-07 count (no retroactive flood); the first sync
freezes skills already Mastered as a baseline. Ledger source type
`growthReward` ("Growth reward" in the wallet). The weekly rules still read
`weeklyPathGoalSnapshots` + `pathSessions`; the weekly evaluator is where Job
D's weekly-goal data would switch in, keeping award ids.

**Mastery, from the mastered-at history.** `evaluateMasteryGrowth` reads Job
D's weekly snapshots (`studentMasteryHistory/{studentId}`,
`functions/shared/masteryHistory.mjs`), which the mastery trigger writes in the
same transaction as the profile; no client writes either document. Each skill's
first move to Mastered on record (`masteryMilestones`, via
`pathGrowthEvents.mjs skillMasteredEventsFromHistory`) is its one event:

- **A move the history saw** pays if it is on or after the start date, on or
  after the baseline was frozen, outside the baseline, and the profile entry
  carries real Mastered evidence (`reachedMasteredEvidence`: canonical code,
  the trigger's counts at the Mastered thresholds, a consistent estimate). It
  need not still be Mastered: mastered, then lost, pays that once; mastering it
  again pays nothing (the identity names the skill).
- **A skill already Mastered in the oldest week** (time unknown) pays by the
  rule from before the switch: Mastered now (`serverDerivedMastered`), profile
  entry updated on or after the start date, outside the baseline.
- **No history** (no mastery update since Job D's deploy) pays nothing; the
  next update writes one.

Unchanged by the switch: the award identity (`masterySkill` + TEKS code, so a
skill paid from the profile before is found already paid), the first-sync
baseline, the class check (the history's class of the last evidence must be the
class of record), and at most `MASTERY_SKILLS_PER_SYNC` (5) unpaid skills per
sync, oldest mastery first. Skills already paid take no place under the cap and
count toward the badges. Conservative call: a skill the history saw mastered
*before* the baseline and lost again by then (so not frozen) normally does not
pay when mastered again; before the switch it would have paid on re-mastery.
Two edges bring that one pre-switch payment back (still once): the history
keeps 60 weeks, so a re-mastery can become the oldest week (time unknown), and
it keeps one snapshot a week, so mastered, lost and re-mastered inside one
week is seen only as the last. A skill held at Mastered only by a deploy-day
floor (functions/shared/masteryScoring.mjs) does not pay while the floor holds
it: its stored score is the floor's, not its evidence's, so the evidence check
refuses it; it pays once the student's own evidence earns Mastered.
Tests: `tests/platform/growthRewardMasteryHistory.test.mjs` (the real sync
against an in-memory Firestore), `growthRewardRules.test.mjs`,
`growthRewardMintingGuards.test.mjs`, and against the emulator
`tests/integration/growthRewards.test.mjs`.

### Class rewards (`functions/shared/classRewardCatalog.mjs`, `functions/lib/classRewardStore.js`)

The Practice Pass is no longer the only thing to spend points on. A teacher of
record keeps a non-academic catalog per class (`classRewardCatalogs/{classId}`,
up to 12 items, 10–500 Class Points, optional weekly limit; wording that
promises an academic effect is refused). A student redeems with
`redeemClassReward` (one transaction: ledger debit `rewardRedemption` +
`classRewardRequests/{id}` pending; a retry is the same request); the teacher
fulfils or declines with a reason (`resolveClassRewardRequest`; a decline
refunds once via `rewardRefund`). Rules: catalog read by the class's students
and teachers, requests by their student and authorized teachers, no client
writes. Screens: the student's rewards center (class rewards shelf, Practice
Pass first) and the teacher's Classes workspace (`ClassRewardRequestsPanel`,
`ClassRewardCatalogEditor`).

