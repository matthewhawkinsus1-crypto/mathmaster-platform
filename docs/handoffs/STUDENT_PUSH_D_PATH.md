# Student push — Job D: My Math Path progress that adds up

**Branch:** `claude/student-push-d-path` (base `main` @ 2453643; `main` @ 2b46154 merged in).
**Date:** 2026-10-10. **Status:** the coordinator's review of #459 is addressed
(one blocker, one major, two minors); ready for review; nothing deployed.

**Goal:** what a student sees about their practice, mastery and weekly goal is
true, matches what the teacher and Google Classroom get, and shows growth.

---

## Ship this first: a live grading defect (hotfix PR #456)

On production My Math Path, every multiple-choice item answered through a
choice field was graded **wrong even when the student picked the right
option**. `issueNextQuestion` stores the issued item already sanitized (its
options carry runtime ids, and `privateGrading` names them), then sanitizes it
a second time for the browser. `choiceRuntimeId` hashed the runtime ids again,
so the served ids matched nothing in the answer key.

- Found while building the session recap; reproduced independently by the
  coordinator. Shipped ahead of the rest of job D as **PR #456** (the
  coordinator cherry-picked 2541109 and 94419db from this branch and added
  77acaab: ids are kept only when the server says the item was issued,
  `buildSanitizedQuestion(stored, { issued: true })`, never by the id's shape).
- This branch carries #456's exact `functions/lib/mathPath.js` and its
  round-trip test, so merging `main` after #456 is a no-op there.
- The session recap also re-sends a stored item, so it passes `issued: true`
  too (functions/lib/pathSessionRecap.js), proven end to end with a
  multiple-choice item.
- **Not done (owner's decision):** Path evidence, mastery and weekly accuracy
  for multiple-choice items answered before the deploy are still recorded as
  wrong. They could be re-graded from `pathSubmissions`.

---

## What shipped, item by item

### 1. One completion truth (student panel = teacher table = Classroom)

The student's weekly panel counted any session with one finalized answer as
done; the teacher table and the Classroom publisher counted only
`pathSessions` with `status === "completed"`.

- `functions/shared/weeklyPathCompletion.mjs` is the one rule (completed
  sessions only) and the one window (the week plus the Sunday-evening day).
  The teacher callable, the Classroom loader and the new student callable
  `getMyWeeklyPathCompletions` all use it. Home (App.jsx) reads the same
  callable.
- A half-done session keeps **Resume · n of m answered**; it is never ticked,
  never counted, and never shows the 🎉.
- **Grade so far = Classroom's grade.** `publishedWeeklyGoal()`
  (weeklyPathGrade.mjs) hands the grader the goal exactly as the publisher
  grades it: the frozen snapshot, without the teacher's live settings, with
  its frozen due date. The student panel and the teacher table both grade
  through it. The panel and My Progress show the published number itself
  (two decimals at the default 100 points), not a rounding of it.
  `tests/platform/weeklyPathPublishedGradeParity.test.mjs` runs the real
  `syncWeeklyPathClassWeek` against a teacher config with a non-default policy
  and a due day changed after the freeze.
- Teacher Path Simulator: its runtime exposes production-shaped session
  documents and the panel counts them with the same collector.
- New index: `pathSessions (studentId ASC, completedAt ASC)`. Until it is built
  the callables fall back to an unranged scan of the student's sessions.
- **The server decides how many sessions are graded** (coordinator review).
  The freeze graded the proposal's own length, so a browser could freeze a
  one-session week that graded 100 after one session (main required four).
  `resolveWeeklyPathGoalSnapshot` now reads the class's weekly settings
  (`settings/weeklyPathGoals`, by class id then period, as the student client
  reads them) and the student's course level
  (`functions/lib/weeklyPathFreezeInputs.js`), and the freeze grades that
  count. A shorter week is accepted only when the settings explain it (the
  teacher selects every session); any other short proposal is refused. A week
  already frozen is returned first, as it is, so a stale browser is never
  refused its own week.
- A short week says so: "Graded on N of M requested sessions" in the teacher's
  table. The class's Classroom post adds a line that names no student: "If
  your week had fewer sessions than this, it is graded on the sessions it
  had."
- The freeze also refuses a due date outside the week it freezes, and any week
  but the current one by the server clock. So no week stays open for good, and
  no past week can be frozen after the fact; the weeks-hit streak (a job E
  reward input) reads both.

### 2. One mastery truth, and no one loses on deploy day

The Path map, Recommended, prerequisite locks and Challenge unlocks called a
skill Mastered at an assignment-only 0.9; the wheel and the planner read the
server rule (85+, four events, two independent successes, a DOK-3 item).

- `functions/shared/masteryRule.mjs` is the one rule. The server trigger
  classifies with it; the client re-derives every status with it.
- `src/platform/mastery/unifiedMastery.js` merges the server profile
  (`studentMasteryProfiles`) over the assignment fallback. App.jsx subscribes
  to the server profile, and My Math Path re-derives from that live
  subscription, so a mastery update shows when the background trigger lands.
- **Coordinator decision (review of #459): no student loses, on deploy day, a
  Mastered status, an unlock, Challenge access or map progress they have on
  main.** The server trigger counts every attempt as an event, so "right on
  the second try" reads 50% where main's per-question record reads 100%. Fed
  alone to the engine, it took Mastered away overnight and locked the skills
  built on it. So the Path engine (map, locks, readiness, Challenge, topic
  browser, Recommended) reads, per skill, the MORE FAVOURABLE of main's
  assignment record and the unified profile (`favourableMasteryBySkill` in
  `src/platform/path/masteryAdapter.js`): the higher number, and Mastered when
  either verdict says so. Path-only evidence, which main never saw, can credit
  a skill but never lock one or lower readiness. Four reproduced profiles are
  pinned against main's own outcome
  (`tests/platform/pathFavourableMastery.test.mjs`).
- **The divergence, documented until wave 2.** The wheel, its skill card and
  the weekly planner keep the server rule, as on main. So a skill that main's
  record calls Mastered can show Mastered on the map and in the topic browser
  while the wheel shows it in progress, its card lists "What's left to master
  this", and the planner still plans it. The real fix is for the server to
  score each question's final attempt, so both read the same. That changes
  server mastery, so it is wave 2 and is not made here.
- Answers on an adjusted version (an IEP modification) carry no weight in the
  rule; the evidence lines call them practice instead of "You haven't
  practised this yet." ("You've practised this with 6 adjusted questions.
  Your score here comes from questions that are not adjusted, so it is not
  set yet.")
- The skill card shows one score (the duplicate "Mastery estimate" /
  "Observed accuracy" are gone) and **What's left to master this**, a
  checklist from the rule.
- Vocabulary: practice depth is **Level 1–3** (Foundation / Deeper practice /
  Stretch practice) and a finished run is a **round**. "Path Pass" no longer
  collides with the Practice Pass reward, and Level 3 no longer reads as a
  mastery claim.

### 3. Swap a skill, end to end

- The freeze keeps up to 3 sanitized alternatives per slot
  (`functions/shared/weeklyPathSlotAuthority.mjs`, shared with the simulator).
- `startMyMathPathSession` accepts a launch on the slot's own TEKS or one of
  its frozen alternatives, always at the slot's framework, DOK, band and
  purpose. The slot key never changes, so the swap fills the same slot for the
  student, the teacher table and Classroom.
- Resume follows an opened swapped session after a reload. Weeks frozen before
  this deploy are never backfilled; they honestly offer no swap.
- The teacher's weekly table says "Session 1: chose A.7C instead of A.5A".

### 4. Session end

- **Start session N of M** (or Resume) when the week has more; the 🎉 only when
  this completed session completed the goal.
- **Review what you missed:** each missed or partly-credited question with the
  student's answer, the correct answer and the worked solution. The entry is
  written in the submit transaction to the server-only `pathSubmissions`
  document; `getMyPathSessionRecap` releases it only to the session's owner and
  only once the session is `completed` (decision 3).
- **Skills that moved:** mastery at session start versus the live server
  profile once the trigger has applied this session ("Updating your skills…"
  until it lands).
- The stale "Free-choice paths are unlocked" is gone, and so is the
  unreachable "Finish your weekly target first".
- **No lasting answer key** (coordinator review). 27 bank templates draw fewer
  than 8 distinct questions in 30 draws, so the same question comes back, a
  retention re-check included. Their recap entries keep the question and the
  student's answer and leave out the correct answer and the steps, on the
  server, in the read, in the Simulator and on screen ("This question comes
  back in practice, so its answer and steps stay out of your review."). The
  list is `functions/shared/pathRecapWithheld.mjs`; a test regenerates it from
  the seed bank and fails when it drifts.
- The end screen counts the finished session through the same completion
  window as the teacher table and Classroom. A session from another week leads
  back to My Math Path instead of claiming this week's goal. On a resumed
  session, "Skills that moved" waits only for the answers given after it
  reopened.

### 5. Retention that works

- Every retention launch (weekly Retention slot, Overview focus card, banner,
  Path map "Quick retention check") starts a two-question `retentionProbe`;
  the server decides the kind from the slot's frozen purpose.
- The map's retention section is populated from the same scheduler as the
  banner.
- A completed check fills its weekly slot and moves the schedule (14 → 30 → 60
  days on a pass; a concern on a miss).
- The weekly planner now reads the schedules through the same time-based
  scheduler (`evaluatedRetentionSchedules`), so a mastered skill that comes due
  gets a Retention slot. The server only ever stores "scheduled" or "concern",
  so before this the planner never planned a check for a skill that simply came
  due.
- Checks are only for skills the shared rule calls Mastered. The scheduler
  used to list Secure skills too, and two passed checks then kept a skill the
  class was still learning out of weekly plans for 45 days. A skill has one
  card on the map: never a check beside its own practice card, and never a
  check for a locked skill.
- The freeze keeps a Retention slot as a two-question check only for a skill
  the server's own records say is due one (`retentionCheckIsDue` in
  `functions/shared/pathRetentionCheck.mjs`, parity-tested against the
  scheduler). Any other proposed Retention slot freezes as a full Review
  session.

### 6. Growth over time

- Weekly mastery snapshots: the mastery trigger also writes
  `studentMasteryHistory/{studentId}` (≤ 60 weeks, 512 KB budget, never
  rewrites a past week). New rules: student reads own, authorized teacher and
  root read; no client writes.
- **My Progress** tab: this week vs four weeks ago (skills mastered, average
  score like for like, biggest movers), past weeks with their weekly Path
  grade (the number Classroom received), and a **weeks hit** streak
  (`getMyWeeklyPathHistory`).
- Practice History: support ids become student-facing names, raw ids are never
  shown, and the 300-answer cap is stated with a by-week summary.
- "N of M recent weeks hit" no longer counts the week in progress as a miss.
  On Sunday evening, when last week is still open by the Central-time
  deadline, the streak card says "Including last week".

### 7. Topic browser

- **Browse all topics** on the Path tab: every unit and skill of the course,
  grouped by the district's units (named, at last), with the shared mastery
  status, the map's own open/locked state and the same launcher and coverage
  gate. Locked and future skills say why. Search by name.
- Labelled wheel: numbered topics, a topic and skill list, a true colour key.
- "Why recommended" names its evidence ("Your score on this is 58% from 6
  questions", "Your class is working on this now (Module 2: …)", "Builds on
  Finding slope, which you've mastered").
- Grade 6–8 strand titles are topic names, not "Grade 8 · TEKS 8.4".

### 8. CCMR plan, saved on the server

- `studentCcmrPlans/{studentId}` (goals + optional test date), written only by
  `setMyCcmrPlan`; new rules and emulator cases. The old browser copy is moved
  to the account once and deleted. The teacher's read-only view now reads the
  student's server plan.
- CCMR hub: test-date field and benchmark context ("SAT math benchmark: 530 ·
  23 days to your test"; ACT 22, TSIA2 950).
- The weekly plan uses the student's test format for transfer slots (dated
  test within 28 days first), never adding transfer work beyond the teacher's
  expectation.
- Separate fix: a CCMR transfer gap could empty a non-Honors student's week
  when CCMR work is off.
- The teacher's Weekly Path table (before a week freezes) and the profile
  drawer build the week from the class's own weekly settings, as the student's
  Path does (`weeklyPlanClassInputs`). A class that expects no CCMR work no
  longer previews an empty week, and a teacher who picked ACT sees ACT
  practice.

### 9. Assignments ↔ Path

"Practice This Skill" on an assignment result opens My Math Path on that
lesson's main skill (`src/platform/path/assignmentPathLaunch.js`; one import and
one handler in App.jsx). Section Recovery, split Classroom posts, Test Cycles
and lessons with no Path skill keep the old behaviour. Home placement stayed
with job C; `studentDashboardModel.js` was not touched.

### 10. Small items

- The weekly grade note names the teacher's due day ("closes on Friday night"),
  read from the frozen `dueAt` in Central time.
- Every mastered skill is reachable (preview 6, "Show all N mastered skills").
- A week the planner cannot fill freezes the goal it actually holds
  (`goalSessions` = slots; the teacher's count kept as `requestedSessions`),
  and weeks already frozen with the wrong count read correctly everywhere.
- Raw support ids and Grade 6–8 strand titles: see items 6 and 7.

### For job E (rewards)

`functions/shared/pathGrowthEvents.mjs` — a pure reader for `weeklyGoalHit`
and `skillMastered` events with idempotency keys. Documented in
`docs/handoffs/PATH_GROWTH_EVENTS_FOR_REWARDS.md`. Also usable:
`functions/shared/masteryHistory.mjs` (growth comparisons) and
`functions/shared/weeklyPathHistory.mjs` (weeks hit, streak).

---

## Product calls made (conservative)

- Weekly completion counts only server-`completed` sessions; Home shows the
  same.
- The weekly grade is graded exactly as the publisher grades the frozen
  snapshot: a teacher's live grading settings and a due day changed after the
  freeze apply from the next week. Shown to two decimals.
- Swaps: no backfill for weeks frozen before the deploy; an unopened choice is
  session-scoped; a swap always runs at the slot's rigor.
- Recap: only for completed sessions; questions closed before the deploy say
  they cannot be reviewed.
- Streak: a closed week with no frozen goal breaks it (no school calendar);
  "hit" means every session done by the due date.
- CCMR: a teacher's explicit framework wins over the student's plan; the
  migration from browser storage runs automatically once.
- "Practice This Skill" uses the lesson's most common primary TEKS (the route's
  question index is usually a Warm-Up on a prerequisite).
- Mastered once per skill for rewards (`skillMastered` key is per skill, ever).
- Mastery (coordinator decision): the Path engine reads the more favourable of
  main's record and the server profile; the wheel, its card and the planner
  keep the server rule until wave 2.
- A short week the class settings cannot explain is refused rather than graded
  on fewer sessions (coordinator decision; the cost is under What's left). A
  proposed Retention slot for a skill that is not due is not refused: it
  freezes as a Review session.
- Recap: the 27 repeating templates keep their answer and steps out of the
  recap; the question and the student's answer stay.
- Retention checks only for Mastered skills.

## What's left, and why

- **Historical multiple-choice grades** (before #456 deploys) are still wrong
  in evidence and mastery — owner's decision.
- **Server mastery scoring is wave 2** (coordinator). Until the server scores
  each question's final attempt, the wheel, its card and the planner (server
  rule) can disagree with the map (more favourable of the two records); see
  item 2.
- **Week keys are UTC** (pre-existing; coordinator minor 4, noted, not fixed).
  `weekKeyFor` starts a week at Sunday 00:00 UTC, so from 7pm CDT (6pm CST) on
  Sunday a student already sees next week. Changing week keys needs a
  migration of frozen snapshots, completions and Classroom syncs.
- **Short weeks are refused** (the cost of the server-decided count). In a
  sweep of 360 legitimate class configurations the planner produced a short
  week 4 times, all six-session classes in August, when too few skills are
  open. Those freezes are now refused: the student's panel keeps showing the
  unfrozen proposal (no swaps, the refusal only logged), and with no frozen
  week the teacher table and Classroom have nothing to grade for that student
  that week, as for any freeze that fails. Fix later by having the server plan
  the week itself, or accept a short week when the server's own planner, on
  the same inputs, cannot fill it.
- **Content follow-up: 27 templates repeat their questions** (fewer than 8
  distinct in 30 draws). Their recap now withholds the answer and steps; the
  real fix is to widen these generators, after which the regeneration test
  drops them from the list:
  `mm_A2_2A_v2_exponential-graph-attributes`,
  `mm_A2_2A_v2_logarithmic-graph-attributes`,
  `mm_A2_2A_v2_reciprocal-graph-attributes`,
  `mm_A2_2A_v2_root-family-graph`,
  `mm_A2_2A_v2_symmetry-family-graph`,
  `mm_A2_2C_v2_exponential-log-features`,
  `mm_A2_3B_v2_matrix-technology-rref`,
  `mm_A2_4E_v2_quadratic-context-interpolation`,
  `mm_A2_4E_v2_quadratic-regression-table`,
  `mm_A2_4E_v2_square-root-context-interpolation`,
  `mm_A2_5B_v2_logarithmic-ratio-scale-model`,
  `mm_A2_8B_v2_exponential-regression-decay-noisy`,
  `mm_A2_8B_v2_exponential-regression-growth-noisy`,
  `mm_A2_8B_v2_linear-regression-noisy`,
  `mm_A2_8B_v2_quadratic-regression-noisy`,
  `mm_A2_8C_v2_prediction-model-variants`,
  `mm_A_12A_v2_mapping-nonfunction`,
  `mm_A_12D_v2_geometric-decay-terms-to-formula`,
  `mm_A_12E_v2_solve-area-height`,
  `mm_A_2A_v2_discrete-mapping-domain-range`,
  `mm_A_3G_v2_error-read-intersection`,
  `mm_A_3G_v2_graph-then-verify`,
  `mm_A_3G_v2_pricing-estimate`,
  `mm_A_3G_v2_savings-estimate`,
  `mm_A_3G_v2_transport-estimate`,
  `mm_A_9B_v2_growth-factor`,
  `mm_A_9D_v2_context-decay-graph`.
- **Teacher previews before a week freezes** now use the class's weekly
  settings, but not the student's own CCMR plan ("Auto": their test and date),
  which is still read only on the student's side. The drawer and
  StudentsRoster's Learning Profile stay previews; the roster needs a
  weekly-settings prop that lives outside this lane. Once the student opens
  Path, the frozen snapshot is the truth and the teacher table matches it.
- **Verifier minors not fixed** (low risk, listed for a follow-up):
  - topics: the wheel's hub still says "Not practised yet" where the colour key
    says "Not Enough Evidence"; mastered map cards carry the heading "Why this
    is suggested"; between two topic windows of one module a unit the class is
    partway through is headed "Your class starts this unit soon"; a locked
    skill can show a repair button for a different skill with no sentence
    linking the two, and the topic browser can show a skill as closed while
    offering it as repair practice.
  - CCMR: a saved test date that has passed shows a validation alert on load;
    the hub's "leans toward this test" promise is false in a class whose
    teacher picked a framework; a cached plan unlocks editing before the
    server answers; a simulator comment overstates what it follows; every
    plan snapshot rebuilds the weekly plan; three container guards in
    `ccmrPlanWiring.test.mjs` can be broken with every test green.
  - retention: `submitPathResponse` imports `pathRetentionCheck.mjs` inside its
    transaction (a cold-start cost, not a correctness issue); the "· 2
    questions" start label has no test; in the Teacher Path Simulator a passed
    weekly check can un-tick its slot when the unfrozen simulated week
    re-plans.
- **Open retention checks share the open-practice lock** with practice on the
  same TEKS (pre-existing), and the server does not check that an open check
  is actually due (pre-existing; weekly slots are protected).
- **Swap lock ids** are still per target and slot (changing them would orphan
  in-flight sessions); the client resumes the open session.
- **My Progress history starts at deploy** (profiles were never time-indexed).
- Teacher-facing copy in `WeeklyPathAutoPublish.jsx` still says "midnight
  Sunday night" (outside job D's lane; `weeklyDueDayName` is available).

## Deploy (owner, Cloud Shell)

Order: indexes → functions → rules → Hosting (what `release-firebase.mjs`
does). Functions before Hosting matters: the new client calls new callables.

1. `firestore:indexes` — `pathSessions (studentId, completedAt)`.
2. Functions whose behaviour changed (exact names):
   `getMyWeeklyPathCompletions`, `getTeacherWeeklyPathCompletions`,
   `runWeeklyPathClassroomSyncNow`, `publishWeeklyPathGrades`,
   `resolveWeeklyPathGoalSnapshot` (at freeze it now reads the class's weekly
   settings, the student's course level, and their mastery profile and
   retention schedule),
   `startMyMathPathSession`,
   `issueNextQuestion`, `submitPathResponse`, `getMyPathSessionRecap`,
   `updateMyMathPathMasteryFromEvidence`, `getMyWeeklyPathHistory`,
   `setMyCcmrPlan`, `saveClass`, `setStudentClass`,
   `permanentlyDeleteStudent`, `resetPreproductionTestData`.
   (`node scripts/release-firebase.mjs --since origin/main` plans every
   default-codebase function, because `functions/index.js` changed; that is
   its normal behaviour.)
   The Classroom post's short-week line ships with
   `runWeeklyPathClassroomSyncNow` and `publishWeeklyPathGrades`; the recap's
   withheld answers with `submitPathResponse` and `getMyPathSessionRecap`.
   New server files ride with the default codebase:
   `functions/lib/weeklyPathFreezeInputs.js`,
   `functions/shared/pathRecapWithheld.mjs` (plus the changed
   `weeklyPathSlotAuthority.mjs`, `pathRetentionCheck.mjs`,
   `pathSessionRecap.mjs`, `weeklyPathHistory.mjs`).
3. `functions:path-admin` — optional: it vendors `functions/shared` whole, but
   the modules it runs (`rolePolicy`, `pathCoverage`, `texasStandards`,
   `pathReleasePlan`) are unchanged here.
4. `firestore:rules` — `studentMasteryHistory`, `studentCcmrPlans`.
5. Hosting via `npm run deploy:hosting`.

## Files outside job D's lane (small hunks)

- `src/App.jsx` — wiring only: the server mastery subscription and its prop,
  server weekly completions for Home, the "Practice This Skill" handler, and
  the class's weekly settings (`weeklyPlanClassInputs`) for the teacher table
  and profile drawer previews. Each import is asserted next to its call in
  tests.
- `functions/index.js`, `firestore.rules`, `firestore.indexes.json` — new
  callables and local edits; two new rules blocks; one index.
- `functions/lib/admin.js` — the two new collections in the erasure and reset
  lists.
- `src/components/teacher/WeeklyPathControls.jsx` — 5 lines showing swaps and
  5 lines rendering the short-week note.
- `src/components/teacher/SimulatedStudentExperience.jsx`, `PathSimulator.jsx`
  — simulator parity.
- `tests/browser/teacherWorkflow/fakeFunctions.js` — fakes for the two new
  student callables Home and My Progress read.

## Verification

Local gates on the final head (this branch with `main` @ 2b46154 merged in):

| Gate | Result |
| --- | --- |
| `npm run test:platform` | 9552 / 9552 pass (#454's new `axe-core` needed an `npm install`; that file's 3 tests then pass) |
| `npm run test:authoring-v5` | 686 / 686 pass |
| `npm run lint` | 0 errors (warnings only) |
| `npm run build`, `npm run build:firebase` | both pass |
| `npm run test:rules` | 236 / 236 rules cases, 166 / 166 rules tests |

The coordinator's review of #459, each fix with a test that fails without it.
Every new assertion was mutation-checked: the fix was reverted and the test
failed.

- **Blocker 1, nobody loses Mastered or an unlock**
  (`pathFavourableMastery.test.mjs`). The four reproduced profiles are: eight
  right on the 2nd try; 5/3/2 right on the 1st/2nd/3rd try; six right on the
  3rd try; and 10/10 first try, then one missed Path diagnostic. Each has the
  outcome on the Path that it has on main (A.3A Mastered; A.2B, A.2C and A.3B
  open), with main's outcome computed from main's own engine input in the
  same run. Six mutations, all caught.
- **Major 2, the server decides the graded count**
  (`weeklyPathServerCount.test.mjs`, `weeklyPlanClassInputs.test.mjs`). One
  easy slot is refused, not graded 100. The class's count is the graded count
  whatever the proposal claims. A short week passes only with the teacher's
  own selection. Retention stays a check only when due, parity-tested against
  the scheduler on the same records. The callable reads the class by id, then
  period. Six mutations, all caught. A sweep of 360 legitimate class
  configurations found 4 short weeks (the trade-off under What's left).
- **Minor 3, no lasting answer key** (`pathRecapWithheld.test.mjs`). The test
  regenerates the list (3337 templates, 30 draws each, 27 below 8 distinct)
  and covers the entry, the read, the server path, the Simulator and the
  screen. Twelve mutations, all caught.
- **Earlier verifier fixes in this pass.** The due date must fall inside the
  frozen week: every due date a real client computes (49 week-start and
  due-day settings, both Chicago daylight-saving weeks) is accepted. Only the
  current week freezes: every real proposal, for all seven week starts, is
  accepted. Also: retention for Mastered skills only, adjusted answers,
  teacher previews, session end and My Progress. Each new assertion was
  mutation-checked.

Browser: each part's harness ran at 1366×768 and 390×844 when it was built.
Since then the PR's CI journeys have covered the screens: student,
student-runtime, teacher, certify on seven devices, browser-accessibility
(axe) and browser-readability. CI runs on #459 at every push; the final head's results are in the PR's checks.
