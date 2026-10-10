# Student push — Job I: Server truth

Branch `claude/student-push-i-server-truth` (draft PR #467), from `main` @ 3a70944.
Nothing is deployed. Deployment is the owner's manual Cloud Shell step (§4).

## 1. What shipped

### Item 1 — the server scores each question once (85ab9d8)

- **Each question is one event, scored by its final attempt.** `functions/shared/masteryScoring.mjs` is used by the trigger `updateMyMathPathMasteryFromEvidence` and by the backfill.
  - It keeps each question's last contribution and replaces it when a later attempt arrives. "Right on the second try" now reads 100%, as the assignment record does.
  - What counts as one question:
    - assignment work: the assignment plus the question, whatever version (variant) was answered;
    - anything else: the delivered instance;
    - with neither: the event itself.
  - An older attempt that arrives late changes nothing.
  - Each skill keeps at most 200 question rows. When a row is dropped, its contribution stays folded into the sums.
  - The trigger now writes the whole document instead of merging, so a floor the student has reached, and dropped rows, really go.
- **Deploy-day floors (decision 8).** A profile entry can carry `floor: { status, estimate, effectiveWeight, questionsSince }`.
  - The shared rule (`masteryRule.mjs`) honours it in `classifyMasteryStatus` and `masteryFactsFromProfile`, so every reader honours it: wheel, card, planner, Path map, history and retention.
  - A floor only ever raises a status, and it never sets "Not Enough Evidence".
  - The trigger removes a floor once the student's own evidence reaches it, or after 8 new questions on the skill. It protects deploy day, not every day after.
- **Backfill: `scripts/backfill-mastery-scoring.mjs`.** The plan itself is `scripts/lib/masteryScoringBackfill.mjs`.
  - Dry run by default; `--execute` asks for the project id to be typed.
  - Idempotent: a document already rescored (`masteryScoring.version ≥ 2`) is skipped.
  - It rebuilds each student's profiles from all of `grades/{id}/evidenceEvents`, inside the transaction that writes them.
  - It compares what the student sees today with what they would see after, through the client's own code: the wheel (`buildUnifiedMasteryProfiles`) and the map (`favourableMasteryBySkill`).
  - It floors every skill that would show a lower status, score or evidence strength, or that could newly lock.
  - It writes a floor-only entry for a skill that only the assignment record knows, wherever the map gives more than the wheel. After that, map and wheel read one record.
  - A plan that would still lower something after flooring is refused for that student and reported, never written.
- **The bridge is narrowed.** `favourableMasteryBySkill` now gives the unified record unchanged for a skill the backfill rescored (`serverScored`, i.e. `scoringVersion` 2). So map, wheel, card and planner read the same number and the same verdict.
  - Any other skill keeps the more favourable of the two records. That covers students the backfill hasn't reached and the Teacher Path Simulator, which has no server document.
  - Path-only skills still never lock (`gate: false`).

### Item 2 — growth rewards from mastered-at data (lane `wip/i-growth`, c6eac87)

- "A skill reached Mastered" is paid from `studentMasteryHistory`, through `masteryMilestones` (each skill's first move to Mastered).
- Unchanged:
  - award ids (`masterySkill` + TEKS code; the test pins the old hash), so nobody is paid twice across the switch;
  - the first-sync baseline;
  - the class check;
  - the cap of 5 per sync.
- Mastered, lost, then mastered again pays once.
- A Mastered held only by a deploy-day floor is not paid: its stored score is the floor's, so the evidence check refuses it. It pays once the student's own evidence earns it.
- Verifier minors fixed: the time-unknown branch's start-date check now has a test, and the re-mastery doc is corrected.

### Item 3 — Live Challenge ranks nobody else can read (lane `wip/i-live`)

- **Class-readable documents keep only the `publicStandingsRows` output.** These are `rounds/{n}` and `standings/current` (now schema 2: public rows, `count`, `lastRank`).
- **New teacher-only `hostRounds/{n}`.** It holds the whole round table for the console and the projector. The projector renders inside the teacher console, so it reads as a teacher.
- **New `playerSummaries/{studentId}`.** It holds each student's own round places, standings and final place.
  - Server-written only.
  - Only that student can read their own; the room's teacher can read and list them all.
  - Written in the same commit as the class copy.
- **`players/{key}`:** a student can read only the row their invite names.
- **Old rooms:** `scripts/scrub-live-challenge-public-ranks.mjs` (dry run by default) scrubs pre-deploy rooms.
- **Tests:**
  - emulator rules cases (`tests/rules/liveChallengeRankPrivacyRules.test.mjs`): no other student's summary or row, no listing, no collection-group query, no `hostRounds`;
  - 240 seeded rounds (`tests/platform/liveChallengeRankPrivacy.test.mjs`);
  - verifier fuzz: 20,000 classes and rounds, 0 violations of the public rule.
- **QA M2 (d68c821): nobody tied for last gets the podium headline or the confetti.** The server stores `final.headline` per player in their own summary: a podium place below the class's last rank. The final card and the confetti read only that. Students tied with last place get the effort card, with their place as a quiet line. The 2-player and 3-player projection rules are unchanged.

### Item 4 — prerequisite met early (lane `wip/i-lifecycle`, plus b6874a5)

- `getSectionAccessState` takes an optional `classworkGradesByAssignment`. A scheduled lesson whose prerequisite is met opens Classwork and Practice, still subject to the teacher's lock and per-class override.
  - The lifecycle is untouched: still `scheduled`, never `creditEligible` early. So grading and closing cannot move.
  - DOL and assessments never open early.
- **Proof:**
  - `sectionAccessPrerequisiteEquivalence.test.mjs` runs a grid of more than 50,000 cells against a frozen copy of the old function (checked line by line against 3a70944). Every cell is identical except a scheduled section whose prerequisite is met.
  - Server: the finalizer's real decision path, and ingestion's capture-time verdict (0 cells changed).
  - The finalizer does not import `assignmentLifecycle.js`, so it is unchanged by construction.
- **`sectionAccessForStudent(grades)`** binds the student's grades once for every call. **App.jsx wiring is needed (job G; relayed to the coordinator):** rename the import and add one `useMemo` line. Until then, students see no change.

### Item 5 — short weeks (lane `wip/i-shortweek`, plus 889527c)

- A proposal shorter than the class's count is accepted only when the server's own planner can't fill more. It is the same planner the browser runs, fed the same records: the grades document, the class's assignments, saved pacing, overrides and the teacher's recommendation.
- Such a week freezes graded on the sessions it holds, with `requestedSessions` kept and `shortWeekReason: 'plannerShortfall'`. A short proposal the server can fill is still refused.
- D's 360-configuration sweep is rebuilt as a test: the 4 short weeks now freeze graded 5 of 6, and the other 356 are unchanged. The teacher table and the Classroom short-week line already read `goalSessions` against `requestedSessions`.
- In random sampling (3,000 cases), the server never plans fewer sessions than the browser.
- The planner's module closure (177 files) is copied into the gitignored `functions/vendor/` by `scripts/sync-functions-weekly-planner.mjs`.
  - That step is now part of the default codebase's predeploy in `firebase.json`.
  - The release planner deploys Functions whenever a planner `src/` file changes.

### Item 6 — integrity notes off the student-readable grade doc (lane `wip/i-integrity`, plus 01d0d62)

- `overrideStudentAssignmentGrade` now writes to `grades/{sid}` only: active, score, reasonCode, reason, source, incidentId, at (plus sectionRole and persistent for sections). Shared builder: `functions/shared/integrityOverridePrivacy.mjs`.
- `note`, `actor` and `participantRole` go only to the teacher-only `studentSupportEvents` incident and `gradeOverrideAudits`.
- Teacher screens read those from the incident and the audit.
- Rules cases prove a student cannot read them by any path.
- **Migration: `scripts/migrate-integrity-override-notes.mjs`.**
  - Dry run by default and idempotent; never changes a grade value.
  - It moves the fields to the incident, creating a linked teacher-only incident when one is missing, and strips them from the grade doc.
  - A malformed document is reported and skipped.

### Coordinator QA findings (release candidate)

- **M2:** see item 3.
- **m10 (4de40f2):** Home's "Recommended for you" reads the coverage index and offers no optional skill or repair target that the bank cannot issue. With no index it fails closed. Teacher-assigned skills stay.
- **m12 (6e5746a):** a class reward repriced or removed while its confirm is open now shows only what changed, plus Close.
- **m9 (69bae59):** the projector and host console label a generic check instruction "Check:", never "Answer:". The content itself is J's.

## 2. How it was verified

- **Gate on the final head:**
  - `npm run test:platform`: see the PR checks and §6.
  - `npm run test:rules`: 236/236 and 194/194.
  - `npm run lint`: 0 errors.
  - `npm run build` passes.
- **Process:** each lane had one implementer and one adversarial verifier, in isolated worktrees, followed by a fixer only where a blocking finding stood. Only item 5 had one: the server planned without the student's assignment grades, so a tampered browser could drop a session. It was fixed in 2f8fb41.
- **Mutation checks:** every new assertion was checked by breaking the behaviour, seeing it go red, and restoring the code.
- **Item 1 tests:**
  - `serverMasteryScoring.test.mjs` (12 tests);
  - `masteryScoringBackfill.test.mjs`:
    - D's four reproduced profiles, plus a seeded sweep of 400 real-shaped students (assignment record, the evidence the server wrote, and the profile the old trigger built);
    - no plan lowers anything on the wheel or the map, and no skill becomes newly locked;
    - after the backfill, map and wheel agree on every skill's verdict and number.
  - Mutations: no floors, no `serverScored` branch, additive (old) scoring, and a rule that ignores floors. All four go red.
- **Browser runs (Chromium):**
  - class-rewards journey, including the new reprice-while-open check: 22/22, phone and Chromebook;
  - topic-browser harness: `recommendedCards` passes. Its `browseLockedAndLaunch` scene fails identically on base 3a70944 (not this branch).
  - Live Challenge drivers: run in CI (`browser` job).

## 3. Left, and why

- **Item 4 needs G's App.jsx line** (above).
- **The teacher's section toggle still refuses before release.** So a teacher can't open a section, authored as locked, for students whose prerequisite opened the lesson early. Product question.
- **Item 5 refusals that remain:**
  - Grade 6–8 courses with no saved pacing: the server doesn't plan.
  - Weeks that are short only because of practice cooldowns: the server ignores practice history, which can only make its week longer.
  - Both are refused, as before. Fails closed.
- **Item 3:**
  - With 5 players the public rule can leave exactly two unshown, so the 4th-place student can name the 5th from the lobby list. Product rule, not a leak.
  - Student summaries in rooms with no match result (retired or stale rooms) are not erased by permanent deletion. This matches the existing gap for private player docs.
  - An old bundle mid-game during the deploy reads no standings: deploy when no rooms are live.
- **Item 1:** the floor freezes deploy-day values as a minimum until the student earns them or answers 8 new questions on the skill. Assignment evidence older than the trigger exists only in floors.
- **Not in scope (owner decisions):** UTC week keys; re-grading historical Path multiple-choice answers.

## 4. Deploy (owner, Cloud Shell; dry runs first)

Order: functions → rules → Hosting → scripts. Run the release planner first: `node scripts/release-firebase.mjs --since 3a70944`. It plans every default-codebase function, because `functions/index.js` changed.

- **Functions (exact names):**
  - mastery: `updateMyMathPathMasteryFromEvidence`
  - growth rewards: `syncStudentGrowthRewards`
  - Live Challenge: `closeLiveChallengeRound`, `advanceLiveChallenge`, `finishLiveChallenge`, `cancelLiveChallenge`, `publishLiveChallengeStandings`, `ensureLiveChallengeFinalStandings`
  - student deletion: `permanentlyDeleteStudent`
  - weekly freeze: `resolveWeeklyPathGoalSnapshot` (its predeploy copies the planner)
  - integrity zero: `overrideStudentAssignmentGrade`
  - plus `platformBuildInfo`, as every release does
- **`firestore:rules`:** Live Challenge `playerSummaries`, `hostRounds` and `players` rows, plus the standings and rounds shapes.
- **Indexes:** none new.
- **Hosting** via `npm run deploy:hosting`. Deploy when no Live Challenge rooms are live.
- **One-off scripts, after everything above is live (dry run first, then `--execute`):**
  1. `node scripts/backfill-mastery-scoring.mjs --project <id>`. Check the report: `refused` should be 0.
  2. `node scripts/migrate-integrity-override-notes.mjs --project <id>`
  3. `node scripts/scrub-live-challenge-public-ranks.mjs --project <id>`

## 5. Files outside lane I

- `firebase.json`: one predeploy line (the planner copy); not the rewrites.
- `scripts/lib/releasePlan.mjs`: planner files deploy Functions.
- `src/components/student/RecommendedSkills.jsx` and new `src/platform/path/recommendedCoverage.js` (QA m10, assigned by the coordinator).
- `src/components/student/rewards/UseClassRewardDialog.jsx` (QA m12, assigned).
- `src/platform/student/whatChangedModel.js`: comment only.
- `tests/browser/*` harness fakes and drivers, `tests/integration/*`.
- `functions/index.js` hunks: the mastery trigger, Live Challenge regions, `overrideStudentAssignmentGrade`, the freeze's input call, student deletion. The secure-exam and Test Cycle callables (#461) are not touched.

## 6. Final gate

See the PR checks on the head that carries this file.
