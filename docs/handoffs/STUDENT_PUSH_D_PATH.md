# Student push — Job D: My Math Path progress that adds up

**Branch:** `claude/student-push-d-path` (base `main` @ 2453643; `main` @ f002678 merged in).
**Date:** 2026-10-07. **Status:** ready for review; nothing deployed.

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

### 2. One mastery truth

The Path map, Recommended, prerequisite locks and Challenge unlocks called a
skill Mastered at an assignment-only 0.9; the wheel and the planner read the
server rule (85+, four events, two independent successes, a DOK-3 item).

- `functions/shared/masteryRule.mjs` is the one rule. The server trigger
  classifies with it; the client re-derives every status with it.
- `src/platform/mastery/unifiedMastery.js` is the one source: the server
  profile (`studentMasteryProfiles`) merged over the assignment fallback. The
  wheel, the Path engine (map, Recommended, locks, Challenge), the planner and
  the Teacher Path Simulator all build from it. App.jsx subscribes to the
  server profile, and My Math Path re-derives from that live subscription, so
  a mastery update shows when the background trigger lands.
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
- The stale "Free-choice paths are unlocked" is gone.

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

## What's left, and why

- **Historical multiple-choice grades** (before #456 deploys) are still wrong
  in evidence and mastery — owner's decision.
- **Teacher-side weekly proposals before a week freezes** (roster preview,
  profile drawer) don't pass the student's server mastery, CCMR plan or
  retention schedules; once the student opens Path the frozen snapshot is the
  truth and the teacher table matches it.
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
   `resolveWeeklyPathGoalSnapshot`, `startMyMathPathSession`,
   `issueNextQuestion`, `submitPathResponse`, `getMyPathSessionRecap`,
   `updateMyMathPathMasteryFromEvidence`, `getMyWeeklyPathHistory`,
   `setMyCcmrPlan`, `saveClass`, `setStudentClass`,
   `permanentlyDeleteStudent`, `resetPreproductionTestData`.
   (`node scripts/release-firebase.mjs --since origin/main` plans every
   default-codebase function, because `functions/index.js` changed; that is
   its normal behaviour.)
3. `functions:path-admin` — optional: it vendors `functions/shared` and
   `functions/lib/mathPath.js`, but nothing there changes behaviour.
4. `firestore:rules` — `studentMasteryHistory`, `studentCcmrPlans`.
5. Hosting via `npm run deploy:hosting`.

## Files outside job D's lane (small hunks)

- `src/App.jsx` — wiring only: the server mastery subscription and its prop,
  server weekly completions for Home, the "Practice This Skill" handler. Each
  import is asserted next to its call in tests.
- `functions/index.js`, `firestore.rules`, `firestore.indexes.json` — new
  callables and local edits; two new rules blocks; one index.
- `functions/lib/admin.js` — the two new collections in the erasure and reset
  lists.
- `src/components/teacher/WeeklyPathControls.jsx` — 5 lines showing swaps.
- `src/components/teacher/SimulatedStudentExperience.jsx`, `PathSimulator.jsx`
  — simulator parity.
- `tests/browser/teacherWorkflow/fakeFunctions.js` — fakes for the two new
  student callables Home and My Progress read.

## Verification

(Filled in at the end of the push: suites, browser harnesses, CI workflows.)
