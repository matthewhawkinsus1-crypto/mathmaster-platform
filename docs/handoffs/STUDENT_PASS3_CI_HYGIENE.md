# Student pass 3, wave 7, W7-7: CI hygiene (the hand-run drivers, known test gaps, a bank count)

Branch `claude/pass3-ci-hygiene`, from `claude/modest-pasteur-xzagn7` at `530ac3cf` (`main` today). Nothing here
deploys, writes to a production project or re-grades anything. No new Firestore path, no rules or index change.

The only product change is one line in `StudentDashboardView.jsx`. Everything else is drivers, harnesses, workflows
and tests.

Every item was first checked on the base `530ac3cf`, in this container. Visual items were checked in a browser.
Where a run says "base", it is the base's own code; where it says "branch", it is this branch.

## Per item: what a student saw → what changed → proof

### 1. Twenty pass-3 browser drivers that no workflow ran

**Still true on the base?** Yes, all twenty. I checked the list against `.github/workflows/*.yml`, `package.json` and
`scripts/`:

- No workflow names any of the twenty.
- `package.json` names only `tests/integration/secureExamNavigation.test.mjs`. That is the emulator suite, not the
  browser driver.
- Nothing in `scripts/` names any of them.

Two of the twenty were red on the base without anyone seeing it: toolDraftSyncSweep and studentHomeToday (item 2).

**What a student would have seen.** Nothing directly. A regression in any of these screens had no CI gate: Home,
Grades, the result page, the secure screens, Live Challenge, the systems lessons, Matrix Lab, drafts, Ask my teacher,
names and the assignment chrome.

**Changed.** Each driver is in the workflow that starts its server, in a new job sized for it. No existing job
changes, so none grows.

| Workflow | Job (timeout) | Server | Drivers (time on this container) |
| --- | --- | --- | --- |
| student-runtime-browser-gates.yml | `pass3-student-screens` (40 min) | plain `npx vite --host 127.0.0.1 --port 5199 --strictPort` | see the job table in the gate |
| student-runtime-browser-gates.yml | `pass3-secure-screens` (30 min) | secureResults and secureExamNavigation start their own stubbed Vite; secureAccessParity uses the emulator config on 5203 | see the gate |
| student-runtime-browser-gates.yml | `pass3-test-cycle-rich-tools` (40 min) | the driver starts the Firestore emulator, the bridge to the real callables, and Vite | testCycleRichToolQa |
| student-runtime-browser-gates.yml | `pass3-live-challenge-shell` (60 min) | the same, its own | liveChallengeShellQa |
| student-teacher-journeys.yml | `pass3-student-journeys` (30 min) | the teacher harness on 5188, and the accessibility App harness on 5189 | assignmentChromeJourneys, studentNameJourneys (5188); askMyTeacherJourneys and the lobby invite's way into the game (5189) |

- **The long ones.** testCycleRichToolQa and liveChallengeShellQa each have their own job.
- **When they run.** On pull requests that touch their paths, not on a schedule. The runtime gates' `paths` gain each
  driver, its harness page, `tests/browser/emulator/**`, `tests/browser/support/**` and `functions/**` (the two
  emulator jobs run the real callables).
- **Permissions.** Both workflows keep `permissions: contents: read`. No job holds a write token, and nothing pushes
  (AGENTS.md "Scaffolding must not merge").
- **Install steps.** Every job installs the way the other browser jobs do: `npm ci`, then Playwright 1.55.0 with
  `scripts/check-lockfile-install.mjs`. The two emulator jobs add `npm --prefix functions ci`, as
  live-challenge-option-b does.
- **Failure handling.** Every step after a job's first driver is `if: always()`, so one red driver does not hide the
  rest.

**Proof.**

- `tests/platform/pass3BrowserDriversInCi.test.mjs` pins each driver to its job and server. It checks:
  - the job exists and has a time limit;
  - the step runs exactly `node tests/browser/<driver>.mjs`;
  - a later step is `if: always()`;
  - no driver is nightly-only;
  - the right server starts before the driver, on the port its origin points at;
  - the lobby journey's `LIVE_CHALLENGE_HARNESS_ORIGIN` is the accessibility harness's port;
  - the gates' `paths` name each driver;
  - `contents: read`, and no `contents: write`.
- Mutation-checked:
  - a driver's command renamed: red;
  - an `if: always()` removed: red.
- Every job was run locally exactly as its workflow runs it. See the gate.

### 1b. Wave 7's other drivers: guarded steps (the integrator's addition)

Five drivers arrive with other wave-7 branches that are not on this base. Each has a step beside the drivers that
share its server. The step runs the driver once the file is there; until then it prints "… is not on this branch
yet: skipped" and exits 0.

| Driver | From | Job | Server |
| --- | --- | --- | --- |
| `tests/browser/stepNotQueued.mjs` | W7-3 | `pass3-student-screens` | plain Vite 5199 |
| `tests/browser/toolOutcomeReach.mjs` | W7-4 | `pass3-student-screens` | plain Vite 5199 |
| `tests/browser/feedbackReasons2.mjs` | W7-4 | `pass3-student-screens` | plain Vite 5199 |
| `tests/browser/toolChoiceGroups.mjs` | W7-2 | `pass3-student-screens` | plain Vite 5199 |
| `tests/browser/teacherWorkflow/draftSaveNoticeReloadJourneys.mjs` | W7-3 | `pass3-student-journeys` | teacher harness 5188 |

- **Triggers.** The runtime gates' `paths` name the four plain-Vite drivers. student-teacher-journeys already
  triggers on `tests/browser/teacherWorkflow/**`.
- **Pinned.** `pass3BrowserDriversInCi` checks each guarded step: its job, its `if: always()`, its origin, and the
  exact guard. Mutation-checked.
- **Run here.** Each guard ran in this container and skipped with exit 0.
- **For the integrator, once those branches merge.** Run the two jobs and see each driver run, not skip.
- **Already in a workflow.** W7-2's in-place extensions need nothing new:
  - `studentAccessibleNames` and `certify:accessibility` run in accessibility-certification.yml;
  - dark mode runs in theme-certification.yml.

### 2. Known test gaps

#### 2a. toolDraftSyncSweep `[expressionMeaning]`: "locator.click: Timeout 30000ms exceeded" (on the base too)

**Still there on the base?** Yes: rc=1, that one finding.

**Was the driver or the tool wrong?** The driver. The journey clicked `groups.nth(0).locator('button').nth(…)` over
every `[role="group"]` in the tool. The task card's "How to do this" step list (`TaskCard` with `stepsAreControls`)
is also a `role="group"`, and it has no buttons. Measured in the browser, the groups are:

1. "How to do this", 0 buttons;
2. Unit, 4 buttons;
3. Contextual meaning, 4 buttons;
4. Mathematical role, 4 buttons.

The first click waited for a button that does not exist. The tool is right.

**Changed.** The journey picks only groups that hold buttons.

**Proof.**

- Branch: `expressionMeaning … journey=targeted restored=true`, rc=0.
- Mutation: the tool reopening on row 1 (the PQ-028 bug) turns the now-reachable restore check red: "reopened on row
  1 of 3, not on the half-done row 3".

#### 2b. The Live Challenge lobby invite away from Home, and the Work View rail's Submit on an exit ticket

**Still true on the base?** Yes. Neither had a driver (W6-2 "Not done").

**Lobby invite: changed.** assignmentChromeJourneys has a new `lobbyInvite` journey. The student is inside today's
lesson when the teacher opens a lobby.

- **Before the lobby opens:** no invite.
- **After, on a Chromebook:** the invite banner, "Your teacher opened the Live Challenge lobby…", with a 44 px
  "Enter Challenge Lobby".
- **After, on a phone:** the status chip reads "⚡ Challenge lobby open", and it opens the invite line.
- **Pressing it, on either size:** the student reaches the lobby ("Waiting for your teacher to start"), with no
  error, and the way out says "Back to your assignment".

Two harness changes were needed:

- **Where the journey runs.** The game's screen reads `snapshot.metadata.fromCache`, which the plain teacher harness
  does not fake, so the screen showed "Cannot read properties of undefined (reading 'fromCache')". The journey opens
  the lesson on the accessibility App harness instead: the same App and fixture, with metadata filled in
  (`LIVE_CHALLENGE_HARNESS_ORIGIN`, default `http://127.0.0.1:5189`).
- **A fake for the join.** The teacher harness had no fake for `joinLiveChallenge`. It now has a small one in
  `fakeFunctions.js`, which does what the server does for a rostered student in a lobby:
  - only the room on the student's own invite;
  - the player's row is marked joined;
  - the invite says joined, or running once the game has started.

**Lobby invite: proof.** Mutations:

- the invite rule firing only for "joined": 6 checks red at both sizes;
- an inverted rule: the invite showed before the lobby opened, red.

**Rail Submit on a DOL: changed.** matrixLabFeedback has a new RAIL journey, on a fresh DOL 1 at 1366×768.

- Work View's rail carries exactly one Submit, reading "Submit — your only try".
- It is off until the work is filled.
- Nothing is recorded before the press.
- The press spends the one try (`attemptCount: 1`): it is the tool's own Submit.
- No verdict ("Not yet", "Correct", "Not quite"…), no fix list and no marked cell show, in Work View or on the page.
- "Your answer is saved. You will see whether it is right when …" is shown.

**Rail Submit on a DOL: proof.** Mutations:

- the mirror's press doing nothing (`toolCheckMirror.js`): "one try spent (null)", red;
- the outcome policy forced open (`showOutcomeFeedback = true`): the verdict, list, cell and held-message checks go
  red.

#### 2c. The Path stimulus's vertical boundary, never seen in a browser (Batch 1/2)

**Still true on the base?** Yes. The drawing is covered only by unit and source tests.

**Changed.** figureDescriptions has a new `pathBoundary` scene: a Path stimulus (`PathQuestionStimulus` in the real
QuestionEngine) with two boundaries:

- x = 5 of x ≤ 5, solid;
- x = 1 of x > 1, dashed.

At 1366×768 and 390×844, the driver checks:

- where each boundary is drawn and with what dash, read from the SVG and converted to graph units with the plane's
  own ticks: `[{x:1, dashed:true}, {x:5, dashed:false}]`;
- the plane's description in the accessibility tree: "1 dashed vertical line." and "1 solid vertical line.".

**Screenshots:**

- [path-vertical-boundary-chromebook.png](../qa/student-experience-pass-3/screenshots/path-vertical-boundary-chromebook.png)
- [path-vertical-boundary-phone.png](../qa/student-experience-pass-3/screenshots/path-vertical-boundary-phone.png)

The driver also writes them to `tests/browser/artifacts/figureDescriptions/` on every run.

**Proof.** Mutation: the stimulus dropping the authored `boundaryStyle` draws both solid, which is red at both sizes.

**Seen in the screenshot, not fixed (outside this item; the owners are named under "Not done"):**

- On a phone, the multi-part question's "Open Work View" button covers the stimulus title.
- The answer box's placeholder "for example 0 ≤ x ≤" is cut off.
- The plane's "−1" and "0" tick labels touch.

#### 2d. The teacher harness's `p3StartMin`: documented 40, actually 0

**Still there on the base?** Yes. `Number(params.get('p3StartMin'))` is `Number(null)` = 0 when the parameter is
absent, so the default was 0, not the 40 the comment gave.

**Which way to make them agree.** The code's way. Every journey that passes no `p3StartMin` has always run with
Period 3 beginning now, so its Warm-Up is open, and they pass that way. Changing the default to 40 would silently close
the Warm-Up in all of them.

**Changed.** The default is now explicit code, not an accident of `Number(null)`: a missing or empty parameter is 0.
The comment says 0, says what it means, and says to pass 40 for a period under way.

**Proof.**

- `tests/platform/teacherWorkflowPeriodClock.test.mjs` (3 tests):
  - no parameter, an empty one and an unreadable one all give noon (now);
  - `p3StartMin=40` and `=3` move the start back;
  - `p3EndMin` defaults to 50.
- Mutations: either fallback set to 40 is red.

#### 2e. `npm run certify:accessibility` cannot reach secure-exam/start in some containers

**Why.** The secure exam's audit page needs the emulator config's stubbed services
(`tests/browser/emulator/vite.config.mjs`). Most browser drivers, and the gate's own instructions, use a *plain*
`npx vite --port 5199`. Where a plain server already held 5199, the stubbed one could not take the port (it starts
with `--strictPort`), and the certification audited the same page wired to the real services. The Test Cycle card
then never loads.

**Reproduced here:**

- With the plain server on 5199, `ONLY=secure-exam`: "secure-exam/start|desktop: could not reach the screen —
  locator.waitFor: Timeout 180000ms exceeded", and the same for phone, rc=1 after 366 s.
- With the stubbed server, it passes in 11 s.

**Changed (the harness).** Before it runs, the certification asks the audit origin how it serves
`/src/components/student/TestCycleCard.jsx`.

- The stubbed server rewrites its service import to `/tests/browser/emulator/testCycleServiceStub.js`; a plain one
  imports `/src/services/testCycleService.js`.
- If the server is not the stubbed one, the run starts its own stubbed Vite on a free port and says so in a note.
- The server is unref'd and killed on exit, so the run still ends when its work does.

CI is unchanged: there the stubbed server owns 5199.

**Proof.**

- With the plain server on 5199, the same command now prints "note: http://127.0.0.1:5199 is not the stubbed harness
  server … Started one at http://127.0.0.1:45697", and passes 4 of 4 audits.
- `accessibilityCertificationContract` gains a test:
  - the probe tells the two servers' imports apart;
  - the emulator config still swaps that service for that stub;
  - the card still imports that service.
- Mutation: a probe that accepts any `testCycleService` import is red.

#### 2f. A notice shown 2–3 times at once in dev (React StrictMode, W6-2): checked on a production build

I built the teacher harness, which is the real `index.html` and App with in-memory Firebase, with the production
pipeline (`vite build --config tests/browser/teacherWorkflow/vite.config.mjs`), and served it with
`scripts/serve-static-spa.mjs` (Hosting's SPA rewrite).

A probe sampled every 50 ms. On each sample it counted every visible `.mm-toast` and every live region by text, and it
kept the most copies of any one text seen at once. Three paths, at 1366×768 and 390×844, two runs each:

1. **Home, cold load:** "✓ All work saved".
2. **The arrival deep link** `/assignments/a-today/classwork/99`: the "That question has moved" toast and its live
   region.
3. **A Live Challenge lobby opened while the student is in the lesson:** "Your teacher opened the Live Challenge
   lobby."

**What I saw.**

- **Production build:** every notice once, every time.
- **Dev server, on this base:** also once, every time. I could not reproduce the 2–3 copies in dev here.
- **studentScreenChange** (S1–S8, including S7's arrival notice) passes in full against the production build.

Nothing to change.

#### 2g. studentHomeToday fails its console check when the coverage read is logged

**Still there on the base?** Yes, and here it fails every time, not intermittently. The console carried "Could not
load My Math Path coverage: … the client is offline" and "Failed to load resource: net::ERR_FAILED". Home's
`RecommendedSkills` read `pathCoverage/algebra1` from Firestore, and the driver aborts every non-local request.

**Changed.**

- **The product change, one line.** `StudentDashboardView` passes `recommended.coverage` through to
  `RecommendedSkills`, which already took a `coverage` prop for tests. In the app `recommended.coverage` is undefined,
  so `RecommendedSkills` still reads Firestore exactly as before.
- **The harness** passes `recommended={{ coverage: null }}`. null is what the aborted read returned (no index, so
  recommendations fail closed). The screen is the one the driver always measured, minus the console error.

**Proof.**

- Branch: PASS at both sizes, "no console errors".
- Mutation: the pass-through removed, the driver is red again with the coverage error.

#### 2h. liveChallengeShellQa "classic" and "scoring" (and "launch", found here)

**Do they still stand on this base (after #500)?** Yes, both:

- classic: "the projector round table is not in the round's order";
- scoring: "the projector does not say the round earned championship points".

A third scenario, **launch**, fails on this base too: all six real screens are on round results before they could
answer ("never reached round 1", then "could not answer on the round", for each of the six).

The other scenarios passed on the base:

- rush, reconnect, big-class and repeat passed;
- endurance was cut off by my own 10-minute background limit, not by a finding.

**Was the driver or the projector wrong?** The driver, in all three. No product change.

- **classic and scoring.** When a worked solution is ready, the projector's results give it the left of the screen,
  and the round's own table steps aside; the standings stay. This is deliberate (`LiveChallengeArenaProjector`
  `ResultsView`, `solutionFills`, since `9dcbd2d`), and the teacher has "Hide solution" for this round. The driver read
  the round table and its "Round results · championship points" heading while the solution filled the screen
  (screenshot A06: "Worked solution" on the left, "Standings · After round 1" on the right).
  - Now a helper, `showRoundTable`, presses "Hide solution" as a teacher would. The hide applies to this round only,
    by design (`solutionHiddenFor` is keyed by round). Then the driver reads the table, and fails if the table never
    shows.
- **launch.** The scenario uses 90-second rounds so that "a screen whose choices are disabled mid-round is … never
  about the clock running out". But the console's default "Round closing threshold" is 70% (`DEFAULT_ROUND_CLOSING_THRESHOLD`,
  since #446). The 34 bots answer at once, which is 34 of 40, so the round closed 5 seconds later, before the
  throttled, frozen, offline and late screens arrived.
  - Now `createClassic` takes `closingThreshold`, and launch sets it to Off. The threshold itself is covered by the
    other scenarios and the endurance games, which keep the default.

**Proof.**

- Branch, `SHELL_QA_SCENARIOS=classic,scoring,launch`: ✓ classic, ✓ scoring, ✓ launch, "no findings".
- The full run on the branch is in the gate.
- Mutation: a projector that ignores "Hide solution" (`showSolution` without `!solutionHidden`) is red with "the
  projector never shows the round table, even with the solution hidden" and the order finding.

#### 2i. graphFeatureRushGame: class-of-twelve's `page.goto` timeout, and the cursor announcement read without waiting

**Do they still stand on this base?** Not in this container. The base driver passed all five scenarios (298 s),
class-of-twelve included. Both are timing failures, seen elsewhere (and once in three runs for the cursor).

**Changed (the driver).**

- **class-of-twelve.** It opened 13 pages at once against a cold Vite dev server, which compiles the app on first
  load, with Playwright's default 30 s `goto`. The fix: `openPage` gives `goto` 120 s, and class-of-twelve opens
  students four at a time.
- **The cursor check.** It read `.mm-rush-visually-hidden` in the same tick as the ArrowRight, before React had drawn
  the move. It now waits up to 3 s for "Pointer at (" and then reads the regions, so the finding text is unchanged.

**Proof.** Branch: all five scenarios pass (293 s). These are robustness changes to a timing race. No mutation can
show the race closed; the assertion itself is unchanged.

#### 2j. #500 (Graph the Line) and the workflows

- #500 changed `full-platform-suite.yml`. I did not touch that file, so there is nothing to merge step for step.
- My workflow edits are new jobs only, in student-runtime-browser-gates.yml and student-teacher-journeys.yml.
- graphFeatureRushGame stays a QA tool outside CI, as its header says.

### 3. A read-only count over the authored banks

**What I counted.** `scripts/audit-systems-shapes.mjs` (no product change, no network) counts two shapes:

- **(a)** stand-alone 2×2 systems whose two rows each hold a *different single* variable (`x = 3`, `y = −2`). The
  systems workspace cannot solve these.
- **(b)** systems-of-inequalities regions with a vertices step but no corners. That vertices step can never show done.

It scans 315 tracked JSON files with 16,578 items (tests' fixtures excluded):

- `teacher-import-jsons/**`;
- `seed/pathQuestionBank/*` and `functions/seeds/*`;
- `docs/assignments`;
- `drafts/**`;
- the root `SAMPLE_*.json`.

Generated Path templates are drawn 24 times each with the platform's own `generatePathInstance`.

**Result: 0 and 0.**

- **(a)** Only 3 stand-alone 2×2 algebraic systems exist, all in
  `docs/assignments/Algebra_II_Honors_3x3_Systems_Day1_V5_FINAL.json` (`3x3-d1-wu-1`, `3x3-d1-wu-2`,
  `3x3-d1-pr-6-ccmr-bridge`), and all are ordinary.
- **(b)** No shipped item turns the vertices step on. 105 Systems Workspace questions are in `inequalities` mode,
  and none sets `studentBuild`, `reasoning.vertices` or `askVertices`.

**What it uses.** The platform's own routing and parsers:

- for (a): `resolveSystemsWorkspaceMode`, `algebraicSystemDimension` and `linearEquationForm`. It agrees with
  `eliminationSeparatedReduction` on every fixture;
- for (b): `studentBuildInequalityTask`, `feasibleRegionVertices` and `classifyFeasibleRegion`.

**What it does not see.** Teacher-authored items stored only in Firestore. The script makes no Firestore call. A
count over production is the owner's to run (decision 3).

**Proof.** `tests/tools/auditSystemsShapes.test.mjs` (8 tests): positive and negative synthetic fixtures for both
shapes, a synthetic bank with a generated template, and a run over the real banks. Mutation-checked five ways:

- the single-variable rule loosened;
- the distinct-variable check removed;
- the `askVertices` gate removed;
- the corner count off by one;
- generator expansion removed.

## Gate

Run in this container on the branch, one driver at a time, except where a job runs several in sequence, as its
workflow does.

### The new jobs, run as their workflows run them

Each was run from a fresh server, step for step, with the workflow's env (`PLAYWRIGHT_MODULE=playwright`, the
origins).

| Job | Driver | Result | Time here |
| --- | --- | --- | --- |
| `pass3-student-screens` | submitNotQueued | pass | 15 s |
| | toolDraftSyncSweep | pass (was red on the base, 2a) | 87 s |
| | matrixLabFeedback (with RAIL) | pass | 52 s |
| | afterLastMiss | pass | 55 s |
| | day1SystemsJourney | pass | 155 s |
| | day2NonuniqueJourneys | pass | 208 s |
| | assignmentMobile | pass | 23 s |
| | studentHomeToday | pass (was red on the base, 2g) | 8 s |
| | studentGradesRaise | pass | 7 s |
| | studentResultUpNext | pass | 10 s |
| | studentWhatChanged | pass | 3 s |
| | gradeCenterMobile | pass | 4 s |
| | **job** | **12 of 12** | **≈ 10.5 min (timeout 40)** |
| `pass3-secure-screens` | secureResults | pass (324 checks on the base run) | 148 s |
| | secureExamNavigation | pass (412 checks on the base run) | 265 s |
| | secureAccessParity (stubbed Vite, 5203) | pass, 26 checks | 122 s |
| | **job** | **3 of 3** | **≈ 9 min (timeout 30)** |
| `pass3-student-journeys` | assignmentChromeJourneys (with lobbyInvite on 5189) | pass | 137 s |
| | studentNameJourneys | pass, N1–N4 | 93 s |
| | askMyTeacherJourneys (5189) | pass, 58 checks | 99 s |
| | **job** | **3 of 3** | **≈ 5.5 min (timeout 30)** |
| `pass3-test-cycle-rich-tools` | testCycleRichToolQa | pass (also on the base: 297 s; W6-4's two "questionInstanceId" findings did not appear here) | 275 s (timeout 40) |
| `pass3-live-challenge-shell` | liveChallengeShellQa, all 11 scenarios incl. endurance | pass, "no findings" | 574 s (timeout 60) |

### Each driver on the base first (`530ac3cf`, same servers)

| Result on the base | Drivers |
| --- | --- |
| pass | submitNotQueued, matrixLabFeedback, afterLastMiss, day1SystemsJourney, day2NonuniqueJourneys, assignmentMobile, studentGradesRaise, studentResultUpNext, studentWhatChanged, gradeCenterMobile, secureResults, secureExamNavigation, secureAccessParity, assignmentChromeJourneys, studentNameJourneys, askMyTeacherJourneys, testCycleRichToolQa, graphFeatureRushGame |
| red | toolDraftSyncSweep (2a), studentHomeToday (2g), liveChallengeShellQa classic, scoring and launch (2h) |

### The usual gate

| Check | Result |
| --- | --- |
| `npm run test:platform` | 12,128 of 12,128 pass |
| `node --test tests/tools/*.test.mjs` | 1,718 of 1,718 pass |
| `npm run lint` | exit 0; 496 warnings, the same count as the base `530ac3cf` (each warning in a file I touched is on a line I did not write) |
| `npm run build` · `npm run build:firebase` | pass · pass; no tracked file rewritten (`git status` shows only this handoff, before it was committed) |
| `node scripts/check-first-load-budget.mjs --report` | within baseline; see "The first load" |
| Tests that pin `.github/workflows` (`ciLockfileInstall`, `phoneGraphPanelNotPinned`, `firstLoadBudget`, `integrationSuiteConfig`, `functionsRuntime`, the new `pass3BrowserDriversInCi`) | pass (inside `test:platform`) |
| Emulator suites | none touched: no file in `functions/`, `firestore.rules`, an index or `tests/integration`/`tests/rules` changes. Not run |
| `npm run certify:accessibility`, as its workflow runs it (stubbed Vite on 5199, accessibility App harness on 5188) | pass, no note (the stubbed server held 5199) |
| `ONLY=secure-exam` with a plain Vite on 5199 (the failing case) | base: 2 screens unreachable, rc=1 after 366 s · branch: note, own stubbed server, pass in 12 s |
| figureDescriptions (with pathBoundary) | pass at both sizes |
| graphFeatureRushGame | base pass (298 s) · branch pass (293 s) |
| Teacher harness journeys that use the fixture and fakes I touched: dolExtraTimeJourneys (passes `p3StartMin=40`), studentScreenChange, appUrlJourneys | pass · pass · pass |
| The production build of the teacher harness: studentScreenChange S1–S8; the notice probe (2f) | pass; every notice once |
| `scripts/audit-systems-shapes.mjs` | 0 and 0 (I re-checked "105 inequality-mode questions, none with a vertices step" with a separate scan) |

**Mutation checks**, each seen red and then restored:

- 2a: the tool reopening on row 1.
- 2b: the lobby invite rule narrowed; the invite rule inverted; the rail press dropped; the outcome policy opened.
- 2c: `boundaryStyle` dropped.
- 2d: either fallback set to 40.
- 2e: the probe loosened.
- 2g: the pass-through removed.
- 2h: the projector ignoring Hide solution.
- Item 1: a driver's command renamed; an `if: always()` removed.
- Item 3: five ways (listed there).

## The first load

`node scripts/check-first-load-budget.mjs --report`, both trees built the same way in this container:

| | Base `530ac3cf` | Branch |
| --- | --- | --- |
| studentHome | 839.4 KB gzip, 184 files | **839.5 KB gzip, 184 files** |
| signIn | 291.8 KB gzip, 27 files | **291.9 KB gzip, 27 files** |

The integration note gives the base's studentHome as 839.3 KB.

- **The branch's share:** at most 0.1 KB of the wave's 8 KB.
- **Where it comes from.** The only product change is one JSX attribute (`coverage={recommended.coverage}`). Per
  file:
  - `App.js` moves +0.1 KB;
  - `mathLiveCompat.js`, which no change touches, also moves +0.1 KB;
  - so the rest is rounding and the chunk hashes.
- `scripts/first-load-baseline.json` is untouched. Within baseline.

## Deploying

- **Hosting:** the one-line `StudentDashboardView.jsx` pass-through. It changes nothing a student sees: in the app
  `recommended.coverage` is undefined.
- **Functions, rules and indexes:** none.

Ship it with the rest of the integration branch through `node scripts/release-firebase.mjs`. It adds no
release-ordering constraint. The CI changes need no deploy.

## Decisions for the owner

1. **The two long drivers run on every pull request that touches their paths** (`src/**`, `functions/**`, the
   emulator harness): testCycleRichToolQa in about 5 minutes here, liveChallengeShellQa in about 10 minutes here (all 11 scenarios). If runner minutes
   matter more than catching a Live Challenge or secure-tool regression before merge, move those two jobs to a
   nightly schedule. They are self-contained jobs, so that is a one-line `if:`.
2. **`p3StartMin`'s default stays 0.** Say if you want 40, and every journey that relies on an open Warm-Up will need
   `p3StartMin` set.
3. **The bank count does not see Firestore-only teacher items.** Run `node scripts/audit-systems-shapes.mjs` over an
   export if you want those counted. I wrote no production read.

## What I touched outside my scope

- **`src/components/student/StudentDashboardView.jsx`:** the one-line `coverage` pass-through the brief allows.
- **Harness and fixture files shared with other drivers:**
  - `tests/browser/teacherWorkflow/fakeFunctions.js`: a new `joinLiveChallenge` fake. No journey relied on its absence.
  - `tests/browser/teacherWorkflow/fixture.js`: the `p3StartMin` default, made explicit; behaviour unchanged.
- **Drivers other sessions may also edit:** `tests/browser/matrixLabFeedback.mjs` and
  `tests/browser/teacherWorkflow/assignmentChromeJourneys.mjs`, a new journey each, appended.
- **Not touched:** `src/App.jsx`.

## Not done

- **Phone layout seen in the vertical-boundary screenshot** (2c), for W7-2 (boxes) or the owner:
  - "Open Work View" covers the stimulus title;
  - the placeholder is cut off;
  - the "−1" and "0" ticks touch.
- **The Path stimulus still cannot shade beside a vertical boundary** (Batch 1/2). That is a feature, not a test gap.
- **graphFeatureRushGame stays out of CI.**
