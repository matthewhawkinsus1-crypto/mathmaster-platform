# Student push — Job C: Home and Grades students can trust (2026-10-07)

Branch `claude/student-push-c-home-grades`, from `main @ 2453643`. Goal: every
student, every day, can trust Home to name the one thing to do now, and Grades
to say how they are doing and how to raise it.

## Deploy targets (owner's manual Cloud Shell step — nothing was deployed)

```bash
npm run build && npm run build:firebase
firebase deploy --project mathmaster-aleks --only functions:loadMyReviewWork
FIREBASE_HOSTING_UPLOAD_CONCURRENCY=4 npm run deploy:hosting
```

- `functions:loadMyReviewWork` — new student-only callable (default codebase).
- Hosting — every screen change, the new title and icon.
- **No** `firestore:rules` change and **no** new index. The callable reads with
  Admin authority; its two queries (`studentAssignmentOverrides where
  assignmentId ==`, `grades where classId == … select(profile)`) are
  single-field equalities served by automatic indexes.
- Deploy the function and Hosting together: the result page calls the callable
  only for closed work, and an un-deployed callable shows "Your answers could not
  be loaded right now. Try again." (no crash).

## What shipped

### 1. Privacy
Home's header shows only the class period. "· Inclusion supports active" is
gone, and App no longer passes the support flag to Home at all
(`studentHomeHonestCards.test.mjs`, `studentTodayAppWiring.test.mjs`).

### 2. One "Today" rule
`src/platform/student/lessonSections.js` — `describeLessonSections` decides,
per section: done / excused / open / Recovery / opens later (with the real
time) / locked (teacher lock or prerequisite) / closed. Inputs: Warm-Up and DOL
windows, the teacher's per-class Classwork/Practice lock, release date and
prerequisite, the student's whole-assignment excusal, Practice Pass and
reduced-item accommodation, and Recovery state for every open assignment
(`src/platform/student/recoveryStates.js`, built once a minute in App).

- **Decision 4 is the finished rule**: a lesson is Finished when every section
  is done at any accuracy; a section is done when every required question is
  terminal, or it can no longer be worked (closed with no Recovery the student
  can start or continue now, or excused). It replaced `isDone`'s
  "notesClasswork is finished at Classwork 100" rule; the pinned test in
  `practicePassDashboardCompletion.test.mjs` was rewritten against the decision.
- `buildStudentDashboardModel` entries carry `lesson`, `finished`, `excused`,
  `actionable`, `nextQuestionIndex`, `action` ('recovery'), `waitText`.
  The next-action card, Home's groups, Resume, the Assignments Center, Grades
  rows and the result page all read them.
- Test Cycle stages are placed by whether they are underway and by due date,
  never forced into "Due today"; work waiting on the teacher is not "to do".
- Excused work is never recommended (Home and Grades agree).
- **Every Start/Continue lands on the first unfinished question the student
  can do now**: the model passes `nextQuestionIndex`; `resolveStudentAssignmentEntry`
  (assignmentEntry.js) skips finished questions; a saved resume position on a
  finished question moves on; live Warm-Up/DOL buttons open the first unfinished
  item of the student's own section.
- **No dead ends**: a whole-assignment start with nothing open goes to the
  result page, which lists each section and when it opens. A Home next action
  with only waiting work says so with the real time and offers My Math Path.
- **Up next**: `resolveUpNext` hands off from the section-complete button in
  the workspace (`assignmentHandoff.js`: next section with work left that is
  workable *now* → Up next → results) and from the result page. "Continue to
  Practice →" is no longer offered when Practice is done, and the button never
  leads to a closed Warm-Up or an ended DOL.

### 3. Honest cards (Home)
One primary action (the next-action card; the matching DOL/Warm-Up/Resume card
is not drawn again, and Home's Warm-Up banner is gone); rewards and
celebrations below the work; finished/closed/excused work never shows LATE;
the retired `assignmentType` label replaced by the real section makeup with
per-section progress; teacher-jargon chips removed; contradictory copy fixed
(past-due vs closed hints, Resume "saved on the server", "Nothing waiting"
only when nothing is waiting); the DOL card shows its real open time.

### 4. Grades that show how to raise them
Start/Continue on missing and open work (no Start on work that cannot be done
now — it shows its wait line); no "View Results" on not-started work;
"Try it again — no credit" on closed work; **Ways to raise your grade**
(`waysToRaiseModel.js`: missing → Start, late windows, Test Cycle
corrections/retests, Recoveries, Practice Pass — only for a student holding one)
with its count on Home; **How this grade is figured** (earned/possible points,
in-progress work counted at its current score and named, what is not counted)
and each section's share of an assignment grade when it reconciles exactly.

### 5. Review My Work (decision 3)
`functions/lib/reviewMyWork.js` + `exports.loadMyReviewWork` (7-line hunk in
functions/index.js), `src/services/reviewMyWorkService.js`,
`src/platform/student/reviewMyWorkModel.js`, `src/components/student/ReviewMyWork.jsx`
(lazy-loaded so MathLive stays out of the first load). The student's own
answer beside the worked solution, per-question outcome, and a fixed teacher
reason label when a grade was changed.

Gates (server, re-checked on every call): caller's own id only (any id in the
request is ignored); assigned to their class; not a Test Cycle (current or
legacy form), not archived/paused/draft; closed for this student **and for the
whole class** (a classmate's private extension, legacy per-student deadline or
support-plan deadline holds solutions back; the refusal names no one); feedback
released. A generated question with no kept delivered instance shows no
solution rather than the template's (which would answer a different version).
Notes, teacher identity, email and the grading trace are never returned.

### 6. What changed (decision 6)
`src/platform/student/whatChangedModel.js` + `WhatChangedList.jsx`, on Home
(compact) and Grades: released results, grade changes (fixed reason labels
only), excused / reopened / more time / extra DOL attempt, new assignments,
retest ready. Built from data the student already reads — no new writes, no
rules. Per-device "seen" in localStorage.

### 7. Polish
One Log Out (identity bar), with a confirm when unsent work is queued
(`logoutGuard.js`); save-status line on Home (`saveStatusModel.js`); page title
"MathMaster" and `public/mathmaster-icon.svg`; Tests & Exams gets the shared
student nav; Back labels name their destination ("Back to Home", "← Assignments",
"← Grades"); Upcoming sorted soonest first; closed work is "Try it again — no
credit" everywhere on these screens; the workspace and result page show only a
Classroom grade released to the student, in plain words.

## How it was verified

- **Gate**: `npm run test:platform`, `npm run test:authoring-v5`, `tests/tools`,
  `npm run lint`, `npm run build`, `npm run build:firebase` (see the final
  report for the last run). `test:rules` not needed (rules unchanged).
- **Unit/contract tests** (all new assertions mutation-checked — code broken,
  test red, code restored): `studentTodayRule`, `studentTodayIntegrationEdges`,
  `studentTodayAppWiring`, `studentAssignmentHandoff`, `assignmentEntryRouting`,
  `studentHomeHonestCards`, `studentAssignmentsCenterToday`,
  `studentResultUpNext`, `studentWaysToRaise`, `studentGradeCenterActions`,
  `reviewMyWorkServer`, `reviewMyWorkModel`, `studentWhatChanged`,
  `studentPolish`, `studentVerifyFixes`, `appRenderDeclarationOrder`.
- **`appRenderDeclarationOrder.test.mjs`** (new): parses App.jsx and fails on
  any read of a render-path binding before its declaration. Added after the real
  App boot caught a result-page TDZ crash that lint and the build both missed.
- **Browser (Chromium, 1366×768 and 390×844)**: component harnesses
  `tests/browser/studentHomeToday`, `studentGradesRaise`, `studentResultUpNext`,
  `studentWhatChanged`, `reviewMyWork`, plus `gradeCenterMobile` (390) and the
  `studentUxPlatform` identity journey. Each harness builds its screen from the
  real models and aborts every non-localhost request.
- **Real App boot** (integration verifier): the real index.html/App.jsx against
  a local Firestore emulator with a stub student session; Home → first
  unfinished question; Warm-Up closed → hand-off to Up next; result page;
  Grades; Assignments Center; Log Out confirm with queued work; plus a
  2,904-scenario sweep (every 5 minutes 06:00–16:00, lock variants, tracker
  states, three time zones) checking Home's promise matches where entry lands.
  The harness lives outside the repo (session scratchpad) — it swaps
  `src/firebase.js` and the AuthProvider and is not a committed test.

## Files outside job C's lane

- `functions/index.js` — one 7-line export (`loadMyReviewWork`).
- `src/components/assessment/StudentSecureExamDashboard.jsx` (job B) — one line:
  "Back to dashboard" → "← Home".
- Shared hot file `src/App.jsx` — wiring only: imports, `buildStudentDashboardNow`
  / cached `studentUpNextDashboard` (hoisted declarations), recovery/what-changed/
  ways memos, props, the section hand-off, removal of the Home Warm-Up banner,
  and the workspace's Classroom receipt line / draft toast.
- Imported (not edited) from job A: `SolutionReview`, `ToolSolutionReview`,
  `QuestionSupplementBoundary`.

## Conservative calls made (product questions not covered by the decisions)

1. **Recovery and "Finished"**: only a Recovery the student can start or
   continue *now* keeps a lesson open; a Recovery still locked behind Practice is
   listed under Ways to raise your grade instead.
2. **Closed-by-deadline lessons** are Finished (decision 4) but filed in their
   own collapsed Home group "Closed — try again (no credit)", apart from work the
   student completed.
3. **Review My Work waits for the whole class** to be closed, not just the
   student (assessment safety outranks a faster review).
4. **No solution for a generated question with no kept instance** rather than
   the template's.
5. **Per-question grade changes say "Your teacher updated your grade"** with no
   reason: the reason lives only in staff-only audits. Showing it needs a server
   change (a student-safe `reasonCode` on the override projection) — follow-up.
6. **Teacher-draft Classroom grades** are not shown to students anywhere, and
   the "progress checkpoint saved" toast is gone.
7. **Practice Pass ways** appear only when the student holds a pass.

## Left for later, and why

- **"Reopened"** (What changed and the Grades status): per
  `studentAssignmentOverrides.mjs` the `reopened` flag alone opens nothing; the
  copy may overpromise. Needs a product decision on what "reopened" means.
- **Prerequisite met early** (pre-existing): `getSectionAccessState` reports
  `scheduled` while `lifecycle.isScheduled` even when the prerequisite was met,
  so such a lesson shows "opens later" and entry cannot open it. Fix belongs in
  `assignmentLifecycle.js` (shared with the server finalizer; not changed here).
- **`warmup.enabled === false` with authored Warm-Up questions**: lessonSections
  treats the section as open; entry treats it as closed. Nothing writes that flag
  today (low risk).
- **Copy**: Resume says "Continue at Question N" using storage order (the
  workspace numbers per section); a partly-done lesson waiting only on its DOL
  can show a "NOT OPEN YET" badge; the identity bar's Log Out is under 44px tall
  (pre-existing); Grades' "0 missing" chip is red.
- **For job A**: `SolutionReview`/`ToolSolutionReview` hardcode "This problem
  version is closed. Review the solution before requesting another problem…",
  wrong for a closed assignment; some "Representation" values and inline `$x$`
  rendered blank in headless Chromium.
- **"Practice" meaning other things** in other jobs' screens (My Math Path
  "Practice History", CCMR, Recovery runner header, Test Cycle corrections
  aria-label) — listed in the polish agent's report; not job C files.
- **Out of scope by the brief**: real URLs, refresh survival, per-screen titles
  (wave 2 with the App.jsx split).
