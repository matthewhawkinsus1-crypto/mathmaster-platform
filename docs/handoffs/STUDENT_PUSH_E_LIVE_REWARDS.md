# Student push E — Live Challenge that teaches and includes, rewards worth earning

Branch `claude/student-push-e-live-rewards` (draft PR #460), from `main` @ 2453643.
Nothing is deployed. Deployment is the owner's manual Cloud Shell step (§5).

## 1. What shipped

| # | Brief item | What it does now | Where |
| --- | --- | --- | --- |
| 1 | Solution reveal between rounds | A round's worked solution is captured privately when the round opens and published to `liveChallengeRooms/{room}/solutions/{round}` only after the round closes. While Second Chance replays are planned, every scheduled round stays held until the last replay closes, so the held set never says which questions return. A finished match publishes everything; a cancelled one nothing. Student results, the console and the projector show it at the results stage only. | `functions/shared/liveChallengeSolutionReveal.mjs`, `challengeSolutionModel.js`, `ChallengeSolutionParts.jsx` |
| 2 | Nobody publicly last | One rule, `publicStandingsRows`, decides every class-wide list (live board, round results, standings after a round, podium, rows under it) and classmates' rows on a student's own cards. It never shows a row tied with the last rank, never leaves exactly one player unshown, and shows at most the top five. Two players project no ranking; three project 1st only. No board or rank under the question, no header place. The final card leads with the place only for a podium finish. The teacher may opt in to full standings (`standingsDisplay`, kept by Play Again). | `liveChallengeProjectorModel.js`, `functions/shared/liveChallengePrivacy.mjs` |
| 3 | Missed-round notice, recap | Back from a reconnect, rounds that closed meanwhile without an answer get one notice. A finished game shows the student's own rounds with worked solutions, private personal bests and their recognitions (`getLiveChallengeMatchRecap`). It withholds solutions while the student is in another live game. | `challengeMissedRounds.js`, `challengeRecapModel.js`, `functions/lib/liveChallengeRecap.js` |
| 4 | Personal bests, recognition beyond the podium | Personal bests (most correct, best accuracy, longest streak, fastest correct) are all-time, from every earlier match the student joined in the class, and are private, worth +3 Class Points. Recognitions: most improved, steadiest, best comeback, first to answer, team effort; 3 Class Points plus a badge each, team effort 2. Most improved and best comeback are private; a Warm-Up game shows only team effort publicly. 20 Class Points per student per match cap. | `liveChallengeRecognitions.mjs`, `liveChallengePersonalBests.mjs` |
| 5 | New reward types | The rules below, plus teacher-configurable non-academic class rewards (see the second table). | see below |
| 6 | Honest Warm-Up wording | "Your accuracy counts as your Warm-Up; game points don't." The Warm-Up game gets the rewards card, without a second way out. | `ChallengeStudentShell.jsx`, `src/App.jsx` |
| 7 | Accommodations in games | Extended time comes from the support profile at join, applies to Standard and Solver Race, and is capped at 2×. It is private (player record and own invite only). Answers are judged against the student's own deadline, stretched from the round's full length. The round is held for them and no solution is published meanwhile. Their answer reaches their public row only at the close. Speed is scored against their own round. The room says only `extendedTimeInPlay` (set at a round's opening, or by the host's held close when such a student joined mid-round); the projector says "A few students are still finishing". Read aloud on round prompts is available for text-to-speech. The Warm-Up game gets the whole support profile. | `liveChallengeAccommodations.mjs` |
| 8 | Class Points "Temporarily unavailable" | Rules let a student read their own missing account (the id names them). The wallet shows empty. | `firestore.rules`, `classPointsClient.js` |
| 9 | Difficulty targeting | No DOK 3 question in a round shorter than 90 s, judged on the round's real (adjusted) length, with a clamp at opening. No DOK 4 in any timed round. A pool this empties is refused with the reason. | `liveChallengeDifficulty.mjs` |

New reward types (decision 5):

| Reward | Source | Points + badge |
| --- | --- | --- |
| Retest improved by ≥ 10 / passed after failing | `testCycleRecords` (raw released scores) | 15 / 20 + `growth-retest` |
| Corrections completed | `testCycleRecords.corrections` | 10 + `growth-corrections` |
| Weekly My Math Path goal met on time; 3 weeks running | `weeklyPathGoalSnapshots` + completed `pathSessions` | 10; streak 15 + `growth-path-streak` |
| A skill reaches Mastered (trigger-shaped profile only, ≤ 5 per sync) | `studentMasteryProfiles` | 5; badges `mastery-5`, `mastery-10` |
| Class rewards (non-academic redeemables) | teacher catalog per class, 10–500 points | student requests; the teacher fulfils, or declines with a refund |

Growth rewards are delivered exactly once by `syncStudentGrowthRewards`, which the student app calls on open and again every 45 minutes. Only events from 2026-10-07 on count.

## 2. Review findings → fixes

| Finding | Commit |
| --- | --- |
| Own audit: room multiplier written at join; late answer public before close; recap served solutions during a newer game; held set revealed replays; public "struggle" recognitions; one Second Chance predicate | 4b259ed |
| Coordinator lane 1, B1: deletion and reset lists; deleted-student refund guard | 26f3c21, 59731c4 |
| Lane 1, B2: mastery minting (rules `write: false`; trigger-shaped entries; 5 per sync) | 26f3c21 |
| Lane 1, M3: handover re-points requests; archived class can decline | 26f3c21, 59731c4 |
| Lane 1, M4: ISO `createdAt` on growth rows | 26f3c21 |
| Lane 1, m5 (streak re-pay) and m6 (wording guard) | 26f3c21, 59731c4 |
| Lane 2, B1: neutral projector wording | 1679557 (verified in 59731c4) |
| Lane 2, M3: rank-based top few, elimination, 2–3 player podiums | 1679557, 59731c4 |
| Lane 2, M4: DOK on adjusted seconds plus clamp | 3e5d898 |
| Lane 2, M5: emulator hold test, checked against mutation M1 | 3e5d898 |
| Lane 2, m6: extended-time speed credit | 3e5d898 |
| Lane 3, M1: growth sync expiry, sign-out key, retry | 69c78a0 |
| Lane 3, M2: tests that could not fail; CI browser job | 69c78a0 |
| Lane 3, m3–m7: focus; kept drafts; Warm-Up second exit; StrictMode; strict regions | 69c78a0 |
| Lane 3: `classRewardRequests` composite index | 69c78a0 |
| CI: theme-contract baseline; private-controls/teacher harness fake | 59731c4, 3e5d898 |
| CI `browser` job: stale held-solution expectation; round table empty when every answer tied (no-answer rows now sit below ranked rows that scored); console reopening a cancelled room; boards read after an auto-close; Playwright import portable | 5a616f3 |
| Codex P2: personal bests read only the last 25 results (absent invitations included) → whole history, paged | 5a616f3 |
| Codex P2: Test Cycle records cut at 200 by document id → every record, paged by id | 5a616f3 |
| Codex P2: `extendedTimeInPlay` stale after a mid-round join → set by the host's close that the hold refuses | 5a616f3 |

## 3. How it was verified

- **Platform suite:** `npm run test:platform`: 9,252 pass, 0 fail on 69c78a0.
- **Static checks:** `npm run lint`, `npm run build`, `npm run build:firebase`, `npm run test:authoring-v5` and `npm run audit:theme-colors` all pass.
- **Emulator suites:**
  - `npm run test:rules`: 169 pass, including new cases for missing Class Points accounts, `solutions/{round}`, class rewards and growth sources.
  - `npm run test:challenge-finish`: 365 pass at d602875. Since then the changed suites were rerun: accommodation privacy 4/4, recap 6/6, class rewards 14/14, growth 12/12.
  - `npm run test:live-challenge-launch:emulator`: 10 pass.
  - `npm run test:live-challenge`: 5 pass.
- **Mutation checks:** every new assertion was checked by breaking the behaviour, seeing the test go red, and restoring the code. This includes the integration cases against the coordinator's M1 and against reverting the speed fix.
- **Rank policy:** `publicStandingsRows` was checked over 108,000 random rankings for 1–8 and 24 players. No tied-last row was shown and exactly one player was never left unshown.
- **Browser:** the student, projector and class-rewards drivers were run in Chromium at 1366×768 and 390×844 during implementation. They run in CI as the `browser` job of `live-challenge-option-b.yml` (class rewards 21 checks, projector 86, teaching driver clean locally).

## 4. What is left, and why

- **Pre-existing:** public round documents (`rounds/{n}`) and the standings snapshot still carry every player's rank. The screens show only the top few, but a student reading Firestore directly can see all ranks. Fixing this means serving per-student summaries, a redesign of the results path. Recommended as a follow-up.
- Mastery growth rewards wait on Job D's mastered-at data. The first sync freezes already-Mastered skills as a baseline, and `evaluateMasteryGrowth` is where to switch over (award ids stay).
- Recap rounds show the result per round (correct / % / no answer), not the student's typed response re-rendered.
- The Solver Race bank carries no authored solution reviews, so its rounds publish "no worked solution yet". Graph Feature Rush has no shared question, so it publishes none.
- The academic-wording guard is a word list. A teacher can reword past it, but no grade field is ever stored.
- Decisions I made (conservative):
  - `retestPassed` pays 20, the ledger's single-award cap; raising the cap would also raise teachers' manual awards.
  - The recognitions toggle does not turn off personal bests.
  - Extended time is capped at 2× in games.

## 5. Deploy targets

Order: indexes → functions → rules → Hosting. The release planner (`node scripts/release-firebase.mjs --since 2453643`) plans a full functions deploy because `functions/index.js` changed.

- `firestore:indexes`: new `classRewardRequests` (`authorizedTeacherEmails` CONTAINS, `classId`, `status`).
- New functions: `getLiveChallengeMatchRecap`, `syncStudentGrowthRewards`, `saveClassRewardCatalog`, `redeemClassReward`, `resolveClassRewardRequest`.
- Changed functions:
  - Live Challenge: `createLiveChallenge`, `createChallengeDryRun`, `swapChallengeDryRunRound`, `joinLiveChallenge`, `startLiveChallenge`, `closeLiveChallengeRound`, `advanceLiveChallenge`, `finishLiveChallenge`, `cancelLiveChallenge`, `submitLiveChallengeResponse`, `retryLiveChallengeAchievementJobs`.
  - Admin: `permanentlyDeleteStudent`, `resetPreproductionTestData`.
  - Every callable that runs `reauthorizeStudentRecords`.
  - Reward callables that load `classPoints.mjs` / `rewardGrants.mjs` (additive constants): `awardClassPoints`, `reverseClassPointAward`, `awardRewardGrant`, `revokeRewardGrant`, `getStudentRewards`, `redeemPracticePass`, `undoPracticePassRedemption`.
- `firestore:rules`: missing Class Points account read; `solutions/{round}`; `classRewardCatalogs`, `classRewardRequests`; `studentMasteryProfiles` no client writes. No browser code writes that collection; the server trigger uses the Admin SDK.
- Hosting via `npm run deploy:hosting`.

## 6. Files outside lane E

- `src/App.jsx`: wiring only, each call asserted beside its import (`studentPushEAppWiring.test.mjs`).
- `functions/index.js`: Live Challenge regions, five new exports, and `reauthorizeStudentRecords` (class reward requests).
- `firestore.rules`, `firestore.indexes.json`.
- `functions/lib/admin.js` and `src/components/admin/PreproductionReset.jsx`: deletion and reset lists.
- `tests/browser/teacherWorkflow/fakeFunctions.js`, `tests/browser/emulator/*`: harness fakes and exports.
- `scripts/theme-color-baseline.json`, `package.json` (scripts), `.github/workflows/live-challenge-option-b.yml` (browser job).
- `docs/architecture/{live-challenge-engine,live-challenge-shell,rewards}.md`.
