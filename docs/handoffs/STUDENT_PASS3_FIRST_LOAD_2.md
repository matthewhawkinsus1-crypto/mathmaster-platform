# Student pass 3 — the student first load, part 2 (wave 6, session W6-7)

Branch `claude/pass3-first-load-2`, from the integration branch `claude/modest-pasteur-xzagn7` at `3cb782a9`.
`scripts/first-load-baseline.json` is untouched: the integrator regenerates it after merging wave 6.

## Result

| Path | Base `3cb782a9` | This branch | Change |
| --- | --- | --- | --- |
| studentHome | 847.0 KB gzip, 186 files | **830.3 KB, 184 files** | **−16.7 KB** |
| signIn | 291.2 KB, 27 files | 291.2 KB, 27 files | 0 |

Measured with `npm run build && node scripts/check-first-load-budget.mjs --report` on both trees. (`npm run
build:firebase` stamps the commit into the bundle, so after it signIn reads 291.3 KB on either tree.) The integrator's
trial merge of the six other wave-6 branches was 855.8 KB against a limit of 855.1 KB. Those branches add about 8.7 KB,
so with this branch the merge should come to about 839 KB: 16 KB under the limit. That is an estimate. The real
number is the integrator's measurement after the merge.

The first push (`8f946670`) also loaded the support-evidence store on demand, for 18.4 KB in all. That move was
reverted at the integrator's request because it could drop a student's evidence (see "The support-evidence store:
tried and reverted").

A student and a teacher see and can do exactly what they could before (proof under each item, and the side-by-side
probe below). Only the time a module's code arrives changed.

## How the modules were traced

I dumped the bundler's module graph (a scratch Vite config with a `generateBundle` plugin, kept in the scratchpad and
never committed). For each module I asked three questions: who imports it statically inside App's first-load graph,
by what chain, and what else shares its chunk. The `--report` names are chunk names, and a chunk is named after one
of its members. `automaticClassroomPublishing` (13.2 KB) is a good example. It held `lazyScreens.js`,
`dolAttemptGrantClient.js`, `assignmentRuntimeHelpers.js` and `screenScopes.js`, which are all student code, and
only 1.5 K characters of `automaticClassroomPublishing.js` itself.

## Item 1 · the teacher-only modules

| Module (`--report` KB) | Who imported it in the first load | A student path before Home? | Done |
| --- | --- | --- | --- |
| `needsAttention` 3.0 | App only (`buildNeedsAttentionQueue`, in a `useMemo`) | No. The memo ran for students too, on empty data, and nothing showed it | Teacher kit |
| `teacherActionCenter` 2.3 | App only (`buildTeacherActionItems`, `openTeacherActionCount`) | No (Action Center tab) | Teacher kit |
| `lessonPublishingIntent` 1.9 | App only (`openAssignmentPreflight`) | No (Assignment Review) | Teacher kit |
| `teacherWorksheetEligibility` 1.3 | App only (teacher worksheet export) | No | Teacher kit |
| `automaticClassroomPublishing` (1.5 K chars of a 13.2 KB chunk) | App only (`autoPublishAssignmentPackageToClassroom`) | No. The rest of the chunk is student code and stays | Teacher kit |
| `assignmentAuthoringState` 1.9 | `assignmentAvailability.js`, which a student's Home does need (`studentDashboardModel`, `whatChangedModel`), but only for the four `AUTHORING_STATES` names | Only the constant | Constant split out |
| `supportEvidenceStore` 6.8 | App (`recordStudentSupportEvidence`) and `useEngagementLedger.js` (`recordEngagementMinute`) | No. Both writes happen inside an assignment, never on Home | **Tried, then reverted**: stays static (below) |
| `studentSupportSignals` 4.2 | App, `studentSupportStore.js`, `returnCheckIn.js` (← App and `extensionReconciliation.js`), `teacherActionCenter.js` | No before Home. A student runs `summarizeRapidCorrectness` for the live status inside an assignment | **Not moved** (see "Not done") |

### The teacher kit (5 modules, −8.5 KB in isolation)

**What changed.**

- `src/app/teacher/teacherKit.js` re-exports the nine functions App used from the first five modules. The logic and
  its tests stay where they were.
- `src/app/teacher/teacherKitLoader.js` (in the first load, about 0.3 KB) makes one request per page.
  `loadedTeacherKit()` hands the kit out synchronously once it has arrived. A failed load is forgotten so the next
  attempt asks again.
- `src/App.jsx` has state `teacherKit` (initialised from `loadedTeacherKit`) and an effect that loads it only when
  `user?.role === 'teacher'`. The effect also prefetches the TeacherWorkspace chunk, so the two downloads run side by
  side, not one after the other. The effect follows the parent-contact pattern (`636ef10`): `let stopped = false`,
  the kit is set only if `!stopped`, and the cleanup sets `stopped = true`, so a teacher who leaves before it arrives
  is never handed it. A failed load is logged (`console.error('The teacher workspace could not load:', …)`) and
  stored.
- The teacher branch of App's render now does this, in order:
  1. If the load failed, it throws the error. AppErrorBoundary catches it, as it catches a failed TeacherWorkspace
     chunk, and a stale tab gets its calm "MathMaster was just updated" panel.
  2. If the kit has not arrived, it renders `<SessionGate authStatus="loading" hydrating …/>`. That is the same
     "Loading your MathMaster workspace…" that AppShell's Suspense boundary shows while the TeacherWorkspace chunk
     loads.
  3. Otherwise it renders TeacherWorkspace, as before.
- The two memos return `[]` without the kit and list `teacherKit` in their dependencies.
- The handlers use `requireTeacherKit()`, which throws a plain error ("The teacher workspace has not finished
  loading…") inside each caller's own try/catch. Only TeacherWorkspace calls these handlers, and it never renders
  without the kit, so this is a guard, not a path anyone takes.

**Why there is no flash for a teacher.** Every value these modules compute reaches the screen only through
TeacherWorkspace's props. TeacherWorkspace renders only in a render where `teacherKit` is already set. So no render
ever shows the teacher an empty queue, empty Action Center items or a zero badge that the kit would then correct.
Until then the teacher sees the loading state they already saw while the screen's chunk loaded.

**Teacher preview** returns before the teacher branch (unchanged). It needs nothing from the kit.

### `AUTHORING_STATES` (−1.7 KB in isolation)

`src/platform/preflight/authoringStates.js` holds the frozen object. `assignmentAuthoringState.js` imports it and
re-exports it, so every existing importer gets the same object (the test checks identity).
`assignmentAvailability.js` imports it from the new file, so the authoring and repair-triage logic
(`assignmentRepairTriage.js`) leaves the first load.

### The support-evidence store: tried and reverted (it stays in the first load)

**Tried** in `8f946670`. `loadSupportEvidenceStore.js` did `import('./supportEvidenceStore.js')`, called from App's
recorder and from `useEngagementLedger`. That was −1.9 KB in isolation.

**Why it was reverted.** `src/firebase.js` uses `persistentLocalCache`. With the store imported along with App, every
evidence write goes straight into Firestore's durable write queue: offline, on a flaky network, or in a tab older than
the last deploy. It syncs later. Loaded on demand, the import has to succeed first, and when it failed the caller
dropped the write:

- A student offline at their first evidence write in a page, before the chunk was ever fetched. The worst case is the
  launch records ("available"/"provided"), which fire once per launch (`launchedSupportKeyRef`) and so were lost until
  that assignment was launched again. A "used" record could be lost if there was no next use.
- A tab opened before a deploy. Hosting no longer serves the old hashed chunk, so every evidence write in that tab
  failed until a reload.

I found this while the reviewer was on `8f946670` and reported it to the integrator myself. A warm-up after Home plus
an in-memory retry queue would narrow the gap but not close it: a page closed before the chunk loads still loses the
write, and the fix is extra code that has to stay right. Support evidence is a student record, so the integrator
chose the base's simple guarantee over 1.9 KB.

**Now.** App and `useEngagementLedger.js` import the store statically, exactly as on `3cb782a9`. The loader is
deleted. `tests/platform/supportTelemetryWiring.test.mjs` is back to the base's version. A new test in
`firstLoadTeacherCode.test.mjs` pins the store in the first load: the graph reaches it, both static imports are
present, and there is no `import()` of it. It goes red with an on-demand load in the hook or in App (both checked).

## Item 2 · the two teacher stylesheets: left in place

`teacherWorkspace.css` (2.2 KB) and `supportEvidence.css` (1.7 KB) reach the student through
`src/app/shell/leadingStyles.js` on purpose. App's chunk imports them, so they link before `App-*.css`, and App.css's
`.mm-dashboard-content` touch rules win over equal-specificity teacher rules only by coming later.

Any on-demand load inserts a stylesheet after App.css, because the teacher's CSS would then arrive with a later
chunk. That reverses the order for every teacher, and it is exactly the regression the module's header describes.
Keeping a teacher's order while dropping the sheets for students would need a different mechanism. Two examples: a
`<link>` inserted before App's stylesheet for teachers only, or the touch rules rewritten to win by specificity. And
it would still need computed-style snapshots of every affected selector on both roles. That is a cascade change, not
a load-order change, so I did not make it here.

## Item 3 · other modules on studentHome

| Chunk (KB) | What reaches it | What Home uses it for | Done |
| --- | --- | --- | --- |
| `questionAlignmentInfo` 11.0 (mostly `assessmentStandardReferences.js`, 44 K chars) | App only, for `questionAssessmentFramework` (the question navigator's "SAT practice" label) | The navigator only. It is a pure function with no imports, and the standard references belong to the other export, `buildQuestionAlignmentInfo` (StandardBadge, QuestionEngine) | **Split**: `src/platform/student/questionAssessmentFramework.js`, re-exported by `questionAlignmentInfo.js`. −8.9 KB in isolation |
| `questionFamilyInstance` 25.9 | App (`familySlotKey`, `isFamilyBackedQuestion`) plus 10 other first-load modules: `questionVariability` (Request New Question), the section-recovery modules (Home's recovery cards), `gradingSupport`, `familyDelivery` | Recovery readiness and the family-backed question rules that Home's cards and the assignment launch read | Not moved: woven through student modules |
| `texasStandards` 11.7 | `src/texasStandards.js` ← App (the teacher's `searchableStandards`), `masteryEngine`, `alignments`, `strandConfig`, `assessmentCrosswalk`, `pathSkillLabels`, `teksUtils` | Skill and strand labels on Home's cards and mastery | Not moved. App's one teacher-only use (`searchableStandards`) would not take it off the path |
| `pathToolContracts` 14.7 | `testCycle.js` → `testCycleBlueprint` → `secureToolCertification`. `testCycle.js` has 10 first-load importers (Grade Center, Assignments Center, test-cycle discovery, recovery discovery…) | `isTestCycleAssignment` and Test Cycle cards on Home | Not moved: would need `testCycle.js` split for 10 importers. A lead |
| `composedWorkflowContract` 12.4 | `responseCheckpoint.js` → `gradingSupport` → `gradingManifest` → `questionTypes` | The response-checkpoint and grading manifest App's student runtime uses | Not moved: student grading path |

## Before and after, by file (`--report`, studentHome)

The bundler re-splits shared chunks when a member leaves, so some chunks appear under new names. The totals are the
honest measure.

| File | Base KB | Branch KB | Change |
| --- | --- | --- | --- |
| `automaticClassroomPublishing-*.js` | 13.2 | — | −13.2 |
| `lazyScreens-*.js` (the same chunk minus `automaticClassroomPublishing`, renamed) | — | 12.9 | +12.9 |
| `questionAlignmentInfo-*.js` | 11.0 | — | −11.0 |
| `questionAssessmentFramework-*.js` (with `misconceptionStudentMessages`, re-split) | — | 2.0 | +2.0 |
| `needsAttention-*.js` | 3.0 | — | −3.0 |
| `teacherActionCenter-*.js` | 2.3 | — | −2.3 |
| `assignmentAuthoringState-*.js` | 1.9 | — | −1.9 |
| `lessonPublishingIntent-*.js` | 1.9 | — | −1.9 |
| `teacherWorksheetEligibility-*.js` | 1.3 | — | −1.3 |
| `returnCheckIn-*.js` | 4.2 | 3.2 | −1.0 |
| `classMeetings-*.js`, `familyDelivery-*.js` (re-split out of the chunks above) | — | 1.3, 1.0 | +2.3 |
| `authoringStates-*.js` | — | 0.1 | +0.1 |
| `App-*.js` (the loader, plus small shared modules the bundler now inlines) | 114.3 | 115.7 | +1.4 |
| **studentHome** | **847.0** | **830.3** | **−16.7** |

signIn: no file changed.

Each move in isolation, measured as this branch with only that change undone (scratch builds): teacher kit 8.5 KB,
question alignment 8.9, authoring states 1.7. These sum to 19.1, more than the 16.7 together, because they share
chunks.

## Proof on the running app (teacher-workflow harness, base `3cb782a9` on :5189 beside this branch on :5188)

Run on `8f946670`, before the store revert. The revert puts back the base's own code for the store, so it changes
nothing these probes compare.

Scratch probe, never committed. Its text was normalised (whitespace collapsed, digits masked, so the live countdowns
compare):

| What | Base vs branch |
| --- | --- |
| Teacher Home, whole page (needs attention, the support dashboard) | identical, 5,642 chars |
| Class page (Algebra II — Period 3, `needsAttentionCount`) | identical |
| Sidebar Action Center button, before and after opening it (the cached badge) | identical |
| Action Center items | identical |
| Print / answer key dialog (worksheet eligibility) | identical |
| Student 910002's Home | identical |
| Console errors | identical on both: only the harness's default "Could not load Weekly Path progress" (that callable fails by default) |

More probes on the branch:

- Before a student's Home shows, none of the moved modules is requested; on the base all nine are. On the dev server
  the branch can still request `questionAlignmentInfo.js` before "Continue". That request comes after
  `QuestionEngine.jsx` (request 683 vs 618), so it is the existing prefetch of the question screen, not Home.
- A student never requests `teacherKit.js` or `TeacherWorkspace.jsx`, before Home or after opening an assignment.
- A teacher's `teacherKit.js` request delayed by 6 s: "Loading your MathMaster workspace…" shows, then Teacher Home.
  Nothing partial appears.
- A teacher's `teacherKit.js` request aborted: AppErrorBoundary shows "MathMaster was just updated … Load the new
  version", and the console says "The teacher workspace could not load".

## Contracts

New, in `tests/platform/firstLoadTeacherCode.test.mjs`, with the walker in `tests/platform/helpers/firstLoadGraph.mjs`
(the same walk as initialBundleBoundary.test.mjs; that file is untouched):

- Nine modules are not in main.jsx's + App.jsx's static graph: the kit, its five modules, `assignmentAuthoringState`,
  `questionAlignmentInfo` and `assessmentStandardReferences`. The loaders and the split
  modules are reached, which also proves the walk still works.
- The kit loads once and is shared. App uses exactly the kit's members, always through the kit, and none is
  statically imported again.
- App's effect is teacher-only, never hands the kit over after cleanup, logs and stores a failure, and prefetches
  the screen. The teacher branch throws a failure and waits on the loading state. `requireTeacherKit` says what is
  wrong.
- The two memos are guarded on the kit and depend on it.
- The support-evidence store stays in the first load, statically imported by App and the ledger hook (after the
  revert).
- `AUTHORING_STATES` and `questionAssessmentFramework` are the same object and the same function from their new
  homes, with behaviour checked on an SAT item.

Re-anchored (the behaviour each protects holds, and each was checked red against a mutation):

- `appShellSplit.test.mjs`: the teacher branch may hold only the kit wait before `<TeacherWorkspace`. The prop-list
  equality is unchanged.
- `teacherActionProductionWiring.test.mjs`: the badge count is read through the kit.
- `teacherAssignmentPdfWiring.test.mjs`: `requiresStudent` is read through the kit.

**Mutation checks: every one red, each restored.** On `8f946670` there were 20, including six on the lazy store, which
are now void. After the revert: an on-demand store load in the hook, and one in App, both red on the new pin.

- A static `needsAttention` import back in App.
- `assignmentAvailability` importing from `assignmentAuthoringState.js` again.
- App importing the framework rule from `questionAlignmentInfo.js` again.
- The `!stopped` check removed.
- The failure swallowed.
- The failure not thrown in the branch.
- The branch rendering without the kit.
- The kit loaded for every role.
- The queue memo without its kit dependency.
- The Action Center memo without its guard.
- A bare kit call.
- An export missing from the kit.
- The loader never forgetting a failure.
- `AUTHORING_STATES` copied instead of re-exported.
- The prefetch removed.

## Gate

| Check | Result |
| --- | --- |
| `npm run test:platform` | 11,790 pass, 0 fail |
| `node --test tests/tools/*.test.mjs` | 1,709 pass, 0 fail |
| `npm run lint` | 0 errors (existing warnings only) |
| `npm run build` / `npm run build:firebase` | ok, no tracked file rewritten |
| `node scripts/check-first-load-budget.mjs` | within baseline: studentHome 828.6 KB (base 847.0), signIn 291.2 KB |
| teacherWorkflow `journeys.mjs` (5188) | pass, A–K and retry at 1440 and 1024 |
| `supportEvidenceJourneys.mjs` | pass |
| `caseReviewJourneys.mjs` | pass (C1–C7 at four viewports) |
| `walkthroughJourneys.mjs` | pass |
| `askMyTeacherJourneys.mjs` | pass |
| `privateControlsJourneys.mjs` (the Action Center listener) | pass |
| `districtIdJourneys.mjs` | pass |
| `appUrlJourneys.mjs` | pass |
| `studentScreenChange.mjs` | pass |
| `enduranceJourneys.mjs` | pass: no growth that keeps going, no fan-out, clean console |
| studentUxPlatform (5199) | pass |
| assignmentMobile (5199) | pass |
| keyboardSweep (5199) | pass |
| studentAccessibleNames | pass |
| `npm run test:live-challenge-teaching-browser` | pass, 58 checks |
| `npm run test:live-challenge-projector-privacy-browser` | pass, 86 checks, no findings |
| `npm run certify:dark-mode` (13:36 UTC) | pass: 192 surfaces, light and dark |
| `npm run certify:accessibility` | 14 audited screens: 0 violations. **Exit 1 because 4 screens could not be reached:** `secure-exam/start` and `live-challenge/lobby`, desktop and phone. The live-challenge screenshot reads "Cannot read properties of undefined (reading 'fromCache')", which comes from `watchLiveChallengeRoom` on the harness's fake Firestore. The secure exam never advances past its Review stage. **This was broken before this branch:** the same certification on the base `3cb782a9` (same servers, same day) fails the same 4 screens, and the 14 audited screens are line-for-line identical. Not fixed here: out of scope, and no moved module is involved |
| `npm run test:rules` (Firestore emulator, includes `supportEvidenceRules`) | pass |
| Teacher kit and support-evidence probes on the harness | see "Proof on the running app" |

No emulator suite covers the moved modules beyond the rules: no rules, functions or indexes changed.

## Deploy targets

Hosting only (`npm run build && npm run build:firebase`, then `FIREBASE_HOSTING_UPLOAD_CONCURRENCY=4 npm run
deploy:hosting`). No functions, rules or indexes changed. Nothing was deployed from this session.

## What I touched outside my scope

- Three existing source-contract tests, re-anchored as above: `appShellSplit`, `teacherActionProductionWiring` and
  `teacherAssignmentPdfWiring`. (`supportTelemetryWiring` and `useEngagementLedger.js` were changed and then restored
  to the base with the store revert.)
- `src/platform/preflight/assignmentAuthoringState.js`, `src/platform/assignments/assignmentAvailability.js` and
  `src/platform/student/questionAlignmentInfo.js`: definitions moved out and re-exported. No exported name changed.
- App.jsx, for other wave-6 branches merging over it:
  - the imports at the old lines 267, 442–450, 453 and 474 (line 39, the store, is back as on the base);
  - one new block of state and an effect after `teacherActionOpenCountCache`;
  - six call sites;
  - the two memos;
  - two lines in the teacher branch;
  - the `questionAssessmentFramework` import.

## Not done, and why

- **`studentSupportSignals` (4.2 KB).** No student path runs it before Home. It stays because four first-load
  modules import it statically. These are App (its `SUPPORT_EVENT_*` constants in teacher handlers, and
  `summarizeRapidCorrectness` in a student's live status inside an assignment), `studentSupportStore.js` (App's teacher
  listeners), `returnCheckIn.js` (App's Action Center memo, and `extensionReconciliation.js` for attendance
  corrections) and `teacherActionCenter.js`. Moving it means rewiring the teacher's support listeners and the attendance
  correction flow, and putting the student's live status behind an import. That is the riskier, listener-shaped
  change, and it was not needed for the budget.
- **The two teacher stylesheets (3.9 KB)**: item 2.
- **`pathToolContracts` 14.7 KB via `testCycle.js`.** The likeliest next lead: Home needs `isTestCycleAssignment` and
  the cards' Test Cycle rules, not the secure tool certification. It needs `testCycle.js` split carefully for its 10
  importers.
- **App's own chunk (115.9 KB).** Not attempted.
