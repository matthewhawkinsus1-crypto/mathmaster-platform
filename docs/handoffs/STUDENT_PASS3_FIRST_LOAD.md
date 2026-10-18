# Student pass 3 — the student first load (wave 5, session W5-1)

Branch `claude/pass3-first-load`, from the integration branch `claude/modest-pasteur-xzagn7` at `e822504`.
No baseline change: `scripts/first-load-baseline.json` is untouched (the integrator rewrites it once everything is
merged and measured).

## Result

| Path | Base `e822504` | After the cherry-pick (`636ef10`) | This branch | Limit (baseline + 8 KB) |
| --- | --- | --- | --- | --- |
| studentHome | 1,048.6 KB gzip, 196 files | 1,045.5 KB, 195 files | **845.5 KB, 189 files** | 1,031.4 KB |
| signIn | 291.4 KB, 27 files | 291.4 KB | **291.4 KB** (unchanged) | 298.3 KB |

studentHome is 203.1 KB lighter, 185.9 KB under the limit and 169.5 KB under the 1,015 KB target. What a student or
teacher can do is unchanged.

## Item 1 · the budget fails on the integration branch

**What a student saw.** Before Home, every student's browser downloaded and parsed the whole of mathjs (the
`create-*.js` chunk, 174.1 KB gzip, the largest file on the path), although Home does no math.

**Why.** Two of `src/App.jsx`'s static imports reached it:

- `./problemGenerator` — App used it for `generateQuestion` (only when a student prints a worksheet) and
  `isPersonalizedBlueprint` (the "Request New Question" rule). Through `functionGraphUtils` →
  `toolMath/graphWorkspace/modelExpression.mjs` → `functions/shared/algebra/safeMath.mjs` → `mathjs`, whose entry
  builds every factory (`core/create.js`).
- `./platform/assignment/liveQuestionCorrection.js` — `repairAssignmentTrackerForCurrentGrader`, which only the
  teacher's Grades tab runs (`persistCurrentGraderCreditRepairs`), through `workflowGrading` and the same math.

Found by dumping the bundler's module graph (a scratch Vite config with a `generateBundle` plugin, never committed)
and asking which of App's direct imports reach `mathjs/lib/esm/core/create.js`: only these two. Cutting both removes
1,075 modules from the static graph.

**What changed (`src/App.jsx`).**

- `isPersonalizedBlueprint` is now `canGenerateDistinctVariants` from `functions/shared/questionVariability.mjs`, the
  very function `problemGenerator.js` re-exported it as (`export const isPersonalizedBlueprint = (question) =>
  canGenerateDistinctVariants(question)`). Same rule, no math engine.
- `exportAssignmentWorksheetPdf` (student, a click) loads `./problemGenerator` with `import()` before it resolves any
  question. A failed load reports "Could not export PDF", like a failed render, and stops.
- `persistCurrentGraderCreditRepairs` (teacher, async, already awaited and caught by its caller) loads
  `liveQuestionCorrection.js` first and hands `repairAssignmentTrackerForCurrentGrader` to
  `repairGradesByAssignmentWithCurrentGrader`. Its trigger is unchanged: the full-roster grades snapshot while
  `teacherTab === 'grades'`, once; a failure clears the ref so the next snapshot retries, as before.

**What left the first load** (gzip, from `--report`, base → this branch):

| Gone | KB |
| --- | --- |
| `create-*.js` (mathjs: decimal.js, typed-function, complex.js, fraction.js and every mathjs factory) | 174.1 |
| `parentContactStore-*.js` (a shared chunk, see the lead below; the cherry-pick) | 13.7 |
| `interactiveGraphEngine` | 7.6 |
| `problemGenerator` | 6.5 |
| `liveQuestionCorrection` | 5.3 |
| `workflowGrading` | 5.1 |
| `parentContactCenter` (the cherry-pick) | 2.6 |
| `familyPinReplay` | 1.8 |
| `safeMath`, `latexToExpression`, `functionGraphUtils`, `questionWorkflow` | 1.7 |

Shared chunks that stay were re-split and renamed by the bundler (for example `questionFamilyExact` 13.8 → 1.6 KB with
its rest now in `composedWorkflowContract`); the totals above are the honest measure.

**Students: nothing on Home waits on a new round trip.** Proof on a production build of the teacher-workflow harness
(`vite build` of `tests/browser/teacherWorkflow/index.html` with its in-memory Firebase fakes, served by `vite
preview`), base and branch side by side, student 910002, four runs each:

- Before Home shows ("Continue" visible): no `create`, `problemGenerator` or `liveQuestionCorrection` request on this
  branch; on the base, `problemGenerator` and `liveQuestionCorrection` were always among them.
- Home appeared at 794–1,065 ms (base) and 778–892 ms (branch): no slower.
- After Home, the app's existing prefetch of the question screen (QuestionEngine) brings mathjs with it: 61 requests
  after Home instead of 55. Opening the assignment from Home showed the question in 447 ms (base) and 433 ms (branch),
  with nothing left to fetch.

**Contracts.**

- `tests/platform/initialBundleBoundary.test.mjs`: "mathjs is not in the first load" (no `mathjs`, `problemGenerator`,
  `liveQuestionCorrection` or `safeMath` in main.jsx's + App.jsx's static graph). It replaces "the first load reaches
  mathjs only through the lazily built instances", which allowed mathjs as factories; the lazy-instance rule is still
  enforced by `tests/platform/mathjsInstance.test.mjs`. New: "App loads the question generator where a student prints,
  not with Home" (the shared-rule import, and the guarded `import()` before any question is resolved).
- `tests/platform/liveQuestionCorrectionWiring.test.mjs`: the name-anywhere `assert.match(app,
  /repairAssignmentTrackerForCurrentGrader/)` is now anchored: the `import()` inside `persistCurrentGraderCreditRepairs`
  and the loaded function passed to, and called by, `repairGradesByAssignmentWithCurrentGrader`.
- Mutation checks, each red then restored: a static `problemGenerator` import back in App (mathjs test red); the
  catch's toast and return removed (generator test red); the repair imported statically again (mathjs test and the
  grader test red); the roster repair not calling the loaded function (grader test red).

## Item 2 · the leads

| Lead | Verified | Done here? |
| --- | --- | --- |
| `create-*.js`, 174 KB | mathjs's full build (`core/create.js` with every factory), reached only through `problemGenerator` and `liveQuestionCorrection`. Home does not need it. | Yes — item 1. |
| `parentContactStore-*.js`, 13.7 KB, "58 dynamic imports" | A shared chunk named after one member. Its sources: `src/app/lazyScreens.js` 8.1 K chars, `dolAttemptGrantClient.js` 7.8 K, `app/student/assignmentRuntimeHelpers.js` 5.4 K, `parentContactStore.js` 4.4 K, `app/screenScopes.js` 3.0 K, `automaticClassroomPublishing.js` 1.6 K. Only the store is teacher code; the rest are the lazy-screen table and student runtime helpers every screen shares, hence the many dynamic importers. | The store left with the cherry-pick; the chunk's other members stay (they are the student's own). |
| `supportEvidenceStore` 6.8, `studentSupportSignals` 4.2, `needsAttention` 3.0, `teacherActionCenter` 2.3 | Static imports in App (`src/App.jsx` ~39, ~451–473), each a direct App import. | No — see "Not done". |
| `teacherWorkspace` CSS 2.2, `supportEvidence` CSS 1.7 | Reached through `src/app/shell/leadingStyles.js`. | No. |
| `assignmentAuthoringState` 1.9 (via `assignmentAvailability.js`), `lessonPublishingIntent` 1.9, `teacherWorksheetEligibility` 1.3 | Static, through App. | No. |
| The App chunk, 113 KB | Mostly `App.jsx` itself (602 K chars of source) plus the student centers it renders (Grade Center, Assignments Center, result screen). | No. |

## Item 3 · the parent-contact pattern from main

`git cherry-pick -x 636ef10` (from `claude/pass3-b3-release`), clean, first commit on the branch. App's
parent-contact effect imports its store on demand and a teacher who leaves before it arrives never subscribes;
`tests/platform/parentContactCenter.test.mjs` asserts it and `tests/platform/listenerLifecycleGuard.test.mjs`
accepts its `const unsubscribe = …; release = () => unsubscribe()` shape. Both pass. studentHome 1,048.6 → 1,045.5 KB
by itself. No other teacher listener moved on this branch, so there was no other listener to give that shape.

## Item 4 · safety

- Moved listeners: only the cherry-picked one; its cleanup is unchanged from main and covered by the two tests above.
- Teacher-only work runs only for teachers: the grader repair is still inside the teacher full-roster snapshot, gated
  on the Grades tab and the once-ref.
- No flash for teachers: nothing a teacher sees renders from a module that now arrives later. The grader repair writes
  in the background after the roster is already on screen, exactly as before.
- Students: see the Home probe above.
- signIn: 291.4 KB before and after.

## Item 5 · "ID 9100xx" on Attendance History (studentNameJourneys N2, N4)

**What the journey saw.** Not a name problem. The finding "Attendance History: a row labelled "ID 910090" is shown"
is an expectation that failed: there were **no rows**. The screenshot reads "This class did not meet on 2026-10-14."

**Who was wrong: the harness.** `tests/browser/teacherWorkflow/schoolClock.mjs` puts every harness browser on "the most
recent Wednesday, 11:00 Chicago". From 12 to 18 October 2026 that Wednesday is 14 October, inside Fall break
(`src/curriculum/calendars/schoolYear2026-2027.js`: 2026-10-12 to 2026-10-16). Attendance History correctly classifies
the date as not in session (`classifySchoolDay`, reason `school_closed`), so it lists no one. It reproduced on this
branch before any change and on the base's logic; it would have passed again next week, and failed again at
Thanksgiving and in Winter break.

**Fix.** The harness clock now takes the most recent Wednesday that, with the Tuesday before it ("yesterday" in the
fixture), is instructional on the same district calendar the app reads. Today that is 2026-10-07. Weeks with school
in session pick the same Wednesday as before, so no other journey's day moves then. Checked: 2026-10-18 → 10-07,
10-22 → 10-21, 11-25 → 11-18, 12-30 → 12-16.

**Proof.** `ONLY=N2,N4` before: 6 findings, both journeys failed. After: both pass, and the full studentNameJourneys
run is in the gate table.

## Gate

| Check | Result |
| --- | --- |
| `npm run test:platform` | 11,599 pass, 0 fail (with `functions/` and `functions-path-admin/` dependencies installed; without them 18 environment failures, as the runner reports) |
| `node --test tests/tools/*.test.mjs` | 1,670 pass, 0 fail |
| `npm run lint` | 0 errors (existing warnings only) |
| `npm run build` | ok |
| `npm run build:firebase` | ok, no tracked file rewritten |
| `node scripts/check-first-load-budget.mjs` | passes: studentHome 845.5 KB, signIn 291.4 KB |
| `tests/platform/parentContactCenter.test.mjs`, `listenerLifecycleGuard.test.mjs` | pass (in the suite) |
| studentUxPlatform (5199) | pass |
| assignmentMobile (5199) | pass |
| day1SystemsJourney (5199) | pass, all three journeys |
| teacherWorkflow `journeys.mjs` (5188) | pass |
| `supportEvidenceJourneys.mjs` | pass, 22 runs |
| `caseReviewJourneys.mjs` | pass |
| `privateControlsJourneys.mjs` | pass |
| `studentNameJourneys.mjs` | running (N2, N4 pass) |
| `enduranceJourneys.mjs` | not yet run |
| Home probe on a production harness build | see item 1 |

No emulator suite covers these files: no rules, functions or indexes changed.

## Deploy targets

Hosting only (`npm run build && npm run build:firebase`, then `FIREBASE_HOSTING_UPLOAD_CONCURRENCY=4 npm run
deploy:hosting`). No functions, no rules, no indexes. Nothing was deployed from this session.

## Decisions for the owner

1. The budget is now 185.9 KB under its limit. The baseline rule says lower it after a deliberate reduction; the
   integrator does that once wave 4 and wave 5 are merged and measured, so it was left alone here.
2. The teacher-only modules still in the first load (about 26 KB gzip in total, listed under item 2) were not moved:
   the target was met without them, and moving App's teacher listeners and memos is the riskier kind of change (flash
   of empty content, listener lifecycle). Worth doing as its own change if the budget gets tight again.

## Outside my scope

- `tests/browser/teacherWorkflow/schoolClock.mjs` (item 5): every teacher-harness journey reads this clock. Weeks in
  session are unaffected; in a closed week the journeys now run on the last open Wednesday instead of a closed one.
- `tests/platform/liveQuestionCorrectionWiring.test.mjs` (one assertion anchored, see item 1).

## Not done

- The teacher-only modules and stylesheets in item 2's table.
- Shrinking App's own chunk.
