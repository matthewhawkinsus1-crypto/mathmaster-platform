# Student push — Job I: Server truth

Branch `claude/student-push-i-server-truth` (draft PR #467), from `main` @ 3a70944.
Nothing is deployed. Deployment is the owner's manual Cloud Shell step (§4).

## 1. What shipped

### Item 1 — the server scores each question once; one favourable rule everywhere (85ab9d8, 5c4e274)

- **Each question is one event, scored by its final attempt.** `functions/shared/masteryScoring.mjs` is used by the trigger `updateMyMathPathMasteryFromEvidence` and by the backfill.
  - It keeps each question's last contribution and replaces it when a later attempt arrives. "Right on the second try" now reads 100%, as the assignment record does.
  - What counts as one question:
    - assignment work: the assignment plus the question, whatever version (variant) was answered;
    - anything else: the delivered instance;
    - with neither: the event itself.
  - An older attempt that arrives late changes nothing.
  - **Bounded document:** at most 60 question rows per skill and 1,500 per document (`compactQuestionRows`, run after every answer). A dropped row's contribution stays folded into the sums. 52 skills × 200 questions stays under 400 KB, where the unbounded rows measured 1,066 KiB.
  - The trigger writes the whole document rather than merging, so dropped rows really go.
  - It keeps `masteredEvidence`: the evidence a skill first reached Mastered with. Growth rewards read it, so a skill that later slipped, or was rescored, still pays a reward it earned.
- **One status rule for every screen (coordinator decision, review of #467).**
  - Every screen reads each skill as the more favourable of the server profile and the assignment record: the higher number, and Mastered when either says so (main's 0.9 cut-off).
  - That covers the wheel, its card and the weekly planner as well as the Path map, locks, readiness, Challenge, topic browser and Recommended.
  - `buildUnifiedMasteryProfiles` attaches the record's side as `favourableRecord`, and the shared rule (`masteryRule.mjs`) honours it, so every re-derived status agrees.
  - **Each side is classified on its own facts** (re-check BLOCKER 1, d5791ea): the server on its own number, weight, events, successes and DOK; the record on its own number and items (Mastered at 0.9, otherwise its band). Then the higher status and the higher number win. The merged profile keeps `mastery.serverEstimate`, so no later re-derivation mixes the two.
  - Pinned: the reviewer's repro (server 88, Mastered, 10 events, beside a quiz at 88.1 from 2 items) stays Mastered on the wheel, card, map and Path; a record at 85.9 beside a Developing server is not promoted to Mastered.
  - The record never lowers anything and is never stored by the server.
  - `favourableMasteryBySkill` is D's rule unchanged, and Path-only skills still never lock (`gate: false`).
  - The skill card says "Mastered in your assignment work" when the record, not the evidence checklist, decides Mastered.
  - Server-side floors are gone.
- **Backfill: `scripts/backfill-mastery-scoring.mjs`.** The plan itself is `scripts/lib/masteryScoringBackfill.mjs`.
  - Dry run by default; `--execute` asks for the project id to be typed.
  - Idempotent: a document already rescored (`masteryScoring.version ≥ 2`) is skipped.
  - It rebuilds each student's profiles from all of `grades/{id}/evidenceEvents`, first reading My Math Path answers as they should have been written (QA round 2 R2-M2: an answer's own post-answer review is not support for it, `functions/shared/pathReviewReclassification.mjs`).
  - It compares main's real screens today (the stored document, the server-rule wheel and D's favourable map) with this branch's screens after, through the client's own code. Any lower status, score or verdict, a skill the Path engine newly closes, or a lost Challenge (extension) card means the student is **refused**: nothing is written for them, and the report names the skill.
  - Locks and Challenge cards are checked at every pacing window (1–8) and both acceleration radii, because a Challenge card depends on where the class is in the year.
  - A label dropping to Not Enough Evidence counts as a loss (conservative). Per-question scoring produces that often (one question answered three times was three events), so expect about 2% of students refused for it.
  - Lower evidence strength alone is not a loss. Counting each question once removes per-attempt inflation; what that could cost, a newly closed skill, is checked directly.
  - Grades, assignments and evidence are read again inside each student's transaction. One student's failure, in planning or in writing, is reported and the run goes on.
  - The trigger takes a question's final attempt as the higher attempt number, or a lower one only when it is later in time. That keeps a correct final attempt from a device whose clock runs behind, and still counts work after a content-repair reset (scorer level; see §3 for the live path).

### Item 2 — growth rewards from mastered-at data (lane `wip/i-growth`, c6eac87)

- "A skill reached Mastered" is paid from `studentMasteryHistory`, through `masteryMilestones` (each skill's first move to Mastered).
- Unchanged:
  - award ids (`masterySkill` + TEKS code; the test pins the old hash), so nobody is paid twice across the switch;
  - the first-sync baseline;
  - the class check;
  - the cap of 5 per sync.
- Mastered, lost, then mastered again pays once.
- Earned but not yet paid survives rescoring: the evidence check also passes on the entry's `masteredEvidence` snapshot (live counts can now fall: a later attempt replaces an earlier one).
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
  - **Integrity entries only** (review M4): `__assignment`, `__sectionIntegrity_*` and the section-zero copies. Any other entry carrying a note, actor or role, for example a per-question teacher correction, is reported as `not-an-integrity-override` and left untouched. No incident is created for it.
  - **Saved corrections in a section's restore state are left exactly as they are** (re-check MAJOR 3, 107ce0e). A lift puts them back verbatim, note and actor included. They are reported as `saved-previous-override`, never fill the incident's note and never become a grade copy. Pinned on the emulator (`tests/integration/integrityNoteMigration.test.mjs`).
  - A malformed document is reported and skipped.

### Coordinator QA findings (release candidate)

- **M2:** see item 3.
- **m10 (4de40f2):** Home's "Recommended for you" reads the coverage index and offers no optional skill or repair target that the bank cannot issue. With no index it fails closed. Teacher-assigned skills stay.
- **m12 (6e5746a):** a class reward repriced or removed while its confirm is open now shows only what changed, plus Close.
- **m9 (69bae59):** the projector and host console label a generic check instruction "Check:", never "Answer:". The content itself is J's.

## 2. How it was verified

- **Gate on the final head:** see §6.
- **Process:** each lane had one implementer and one adversarial verifier, in isolated worktrees, followed by a fixer only where a blocking finding stood. Only item 5 had one: the server planned without the student's assignment grades, so a tampered browser could drop a session. It was fixed in 2f8fb41.
- **Mutation checks:** every new assertion was checked by breaking the behaviour, seeing it go red, and restoring the code.
- **Item 1 tests:**
  - `serverMasteryScoring.test.mjs` (12 tests);
  - `masteryScoringBackfill.test.mjs`:
    - D's four reproduced profiles, plus a seeded sweep of 400 real-shaped students (assignment record, the evidence the server wrote, and the profile the old trigger built);
    - no plan lowers anything on the wheel or the map, and no skill becomes newly locked;
    - after the backfill, map and wheel agree on every skill's verdict and number.
    - the review's (a), (b) and (c) profiles keep main's outcome after ordinary use. (a): 3/3 first-try classwork, then 12 Path items with 2 right, gives Mastered with A.2B open. (b): assignment work the server never saw keeps 70%. (c): 8 correct new questions without DOK 3 keep Mastered;
    - 300 students after the backfill plus ten new questions never read below main, and no skill is closed that main had open;
    - an emulator fixture (`tests/integration/masteryScoringBackfill.test.mjs`) covers dry run, execute, refusal, idempotency and the in-transaction re-read.
  - Mutations: no record on the unified profiles, additive (old) scoring, no compaction, the checklist line, no in-transaction re-read. All go red.
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
- **Item 1:** a skill main's assignment record called Mastered (0.9, possibly from one question) reads Mastered on every screen, the wheel included, for as long as that record says so. That is the coordinator's decision, the price of one rule. Refused students keep their per-attempt server record; the favourable rule still protects them.
- **Not driven in Chromium:** QA round 2's R2-m1 and R2-m2 (Path UI) are queued for the follow-up PR (`claude/student-push-i2-followups`).
- **Owner decision, Challenge cards (re-check MAJOR 2).** A Challenge (extension) card needs prerequisite evidence strength ≥ 0.5 (`recommendationEngine.js`). Per-question scoring removes the per-attempt inflation of that strength, so in ordinary use Challenge cards appear later than on main: 88 of 1,793 simulated students after 10 answers without the backfill. The backfill refuses anyone who would lose a card on deploy day (35 in the reviewer's sweep). Keep the 0.5 threshold, or recalibrate it for per-question strength.
- **Owner decision, drift in ordinary use.** Per-question scoring counts fewer events than per-attempt scoring, so labels settle differently from main. Per 600 simulated students after 10 ordinary answers (reviewer's sweep): about 210 Needs Attention → Not Enough Evidence, about 19 Developing → Not Enough Evidence, and 25–35 Challenge cards appearing later. No Mastered, unlock or number is lost against main; the favourable rule covers those.
- **Follow-up, pre-existing (main behaves the same):** live, a same-variant attempt after a content-repair reset never reaches the trigger. It gets the same eventKey and application marker as the attempt before the reset (`buildAttemptEvidenceEvent`), and `transaction.set` overwrites the same evidence document (functions/index.js ~570, ~1119), so `onDocumentCreated` never fires. The scorer handles a reset (tested), but production never hands it the event.
- **Pre-existing, listed only (they bypass the favourable rule):** the mastery history and My Progress tiles; `courseChallengeEarned` (functions/index.js); in-session routing; retention eligibility.
- **Not in scope (owner decisions):** UTC week keys; re-grading historical Path multiple-choice answers.

## 4. Deploy (owner, Cloud Shell; dry runs first)

Order: functions → rules → Hosting → scripts. Run the release planner first, `node scripts/release-firebase.mjs`, with its default `--since` (the live build). It plans every default-codebase function, because `functions/index.js` changed.

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
- **Job L's #472 (submitPathResponse no longer marks the post-answer review) must ship before or with the backfill**, or history and new answers are scored differently.
- **One-off scripts, after functions, rules and Hosting are all live (dry run first, then `--execute`):**
  1. `node scripts/backfill-mastery-scoring.mjs --project <id> --limit 50` first, then without `--limit`.
     - Run it from the deployed commit (it imports `src/`), after hours, and well after Hosting: an open tab on the old bundle reads the server number alone until it reloads.
     - Expect `refused` > 0 (a modified final attempt carries no weight under the new scoring, and a label dropping to Not Enough Evidence counts as a loss); refused students are left as they are.
     - The report also gives `pathReviewsReclassified` (R2-M2) and `failed`.
  2. `node scripts/migrate-integrity-override-notes.mjs --project <id> --execute --actor <email>`. Entries reported `not-an-integrity-override` or `saved-previous-override` are left untouched by design.
  3. `node scripts/scrub-live-challenge-public-ranks.mjs --project <id>`, when no Live Challenge room is live.

## 5. Files outside lane I

- `firebase.json`: one predeploy line (the planner copy); not the rewrites.
- `scripts/lib/releasePlan.mjs`: planner files deploy Functions.
- `src/components/student/RecommendedSkills.jsx` and new `src/platform/path/recommendedCoverage.js` (QA m10, assigned by the coordinator).
- `src/components/student/rewards/UseClassRewardDialog.jsx` (QA m12, assigned).
- `src/platform/student/whatChangedModel.js`: comment only.
- `tests/browser/*` harness fakes and drivers, `tests/integration/*`.
- `functions/index.js` hunks: the mastery trigger, Live Challenge regions, `overrideStudentAssignmentGrade`, the freeze's input call, student deletion. The secure-exam and Test Cycle callables (#461) are not touched.

## 6. Final gate (merged head aa0e775, main @ 990faff with #461)

| Gate | Result |
| --- | --- |
| `npm run test:platform` | 10,375 pass, 0 fail |
| `npm run test:rules` | 236/236 rules cases, 196/196 rules tests |
| `npm run test:authoring-v5` | 686/686 |
| `npm run lint` | 0 errors (warnings only) |
| `npm run build`, `npm run build:firebase` | pass |

CI on #467 runs the browser suites.
