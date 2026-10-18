# Student pass 3 — wave 4 on the integration branch (2026-10-18)

`claude/modest-pasteur-xzagn7` moves from `cbeff6a` to this merge. It holds:
- wave 4's four sessions;
- session B (Submit and finishing), reviewed with wave 3 and merged once it had merged that base;
- wave 5's first-load session (W5-1). The rest of wave 5 needs a branch whose first-load budget passes, so W5-1 lands first.

Each session's handoff holds the detail. This note says what the merge itself changed, how the merged tree was
checked, and how it ships.

## What merged

| Session | Branch | Merged at | Handoff |
| --- | --- | --- | --- |
| W4-2 · Test Cycle dates (PR-19, PR-20, PR-21) | `claude/pass3-test-cycle-dates` | `3ceee42` | [STUDENT_PASS3_TEST_CYCLE_DATES.md](STUDENT_PASS3_TEST_CYCLE_DATES.md) |
| W4-3 · Live Challenge rounds that always finish (Q-23, Q-58) | `claude/pass3-live-challenge-rounds` | `1cf8e83` | [STUDENT_PASS3_LIVE_CHALLENGE_ROUNDS.md](STUDENT_PASS3_LIVE_CHALLENGE_ROUNDS.md) |
| W4-4 · Systems tools that never strand a student (PR-22, PR-23, Q-24) | `claude/pass3-systems-tools` | `32f02df` | [STUDENT_PASS3_SYSTEMS_TOOLS.md](STUDENT_PASS3_SYSTEMS_TOOLS.md) |
| W4-1 · Work View help, and exit tickets that keep the method to themselves (TOOL-3, R-9, R-10) | `claude/pass3-b6-work-view-help` | `016c2ea` | [STUDENT_PASS3_WORK_VIEW_HELP.md](STUDENT_PASS3_WORK_VIEW_HELP.md) |
| B · the button that spends a try, and how a question ends (RUN-4, RUN-11, RUN-12, RUN-13, RUN-16) | `claude/pass3-b5-submit-and-finish` | `86f6769`; last round `c6b4025` | [STUDENT_PASS3_SUBMIT_AND_FINISH.md](STUDENT_PASS3_SUBMIT_AND_FINISH.md) |
| W5-1 · the student first load | `claude/pass3-first-load` | `8154f60` | [STUDENT_PASS3_FIRST_LOAD.md](STUDENT_PASS3_FIRST_LOAD.md) |

They merged in that order, then wave 3's last gate fixes (`cbeff6a`). Nothing was rebased.

## What the merge changed

- **Conflicts.** Every one was resolved by keeping both sides:
  - **W4-2 and wave 3, `src/App.jsx`.** The Test Cycle screen computes this student's dates (W4-2). It renders
    through `renderStudentScreen`, the shell with its `<main>` (NAV-15). Wave 3's unused class late-date constant is
    gone. `TestCycleCard` takes W4-2's `dueAt` and `classLateDueAt` beside wave 3's `exitLabel` (NAV-9).
  - **W4-1 and wave 3, the Regression Calculator's how-to.** Wave 3 (TOOL-9) wrote steps that name the controls.
    W4-1 made the list controls-only (`stepsAreControls`), so that an exit ticket can show it. One list of three
    steps keeps both: it names the controls (Add Item, the x₁ and y₁ columns, Add Regression, the curve button) and
    says nothing about reading r. `toolPolicyGates` takes W4-1's Work View locator, which matches both button names.
  - **B and W4-1, `QuestionEngine`.** W4-1's Work View Help, which withholds the method, sits above B's way on from a
    closed question (`barContinueAction` is `closedQuestionWayOn`). `ComplexPlaneLab` and `RepresentationBridge`
    import W4-1's `useMethodWithheld` and B's `SubmitText` together.
- **`f09ad2a` · the integration tests share one bell schedule.** `node --test` runs the integration files in parallel
  against one emulator:
  - W4-2's tests J, K and L replaced `settings/classSchedule` and then deleted it;
  - `testCycleSecureWorkflow`'s cleanup removed whole days.

  With wave 3's `dolExtraTimeServer` running beside them, L's meeting disappeared mid-test. "The student who sat it
  does Corrections" failed in the full suite and passed alone, on W4-2's own head and on this tree. Each test now
  merges only its own period's days into the document and deletes only those fields afterwards.
- **`282006b` · toolFocusAndUndo counts the how-to a student can see.** Wave 3's Regression Calculator check expected
  exactly one "How to do this (3 steps)" on the page. Since TOOL-3 (W4-1), Work View's Help drawer holds the same
  steps, closed until the student opens Help, so the page has two copies and only one is visible. The check now
  counts the visible one. The scene passes at 1366×768 and 390×844.
- **`cd6ae7f` · the release planner keeps Live Challenge's deploy order.** W4-3's handoff requires a release order;
  its review made the order part of a blocker fix:
  - `calibrateLiveChallengeClock` goes first and alone, so the host heartbeat is live before anything acts on it;
  - `closeOverdueLiveChallengeRounds` goes last and alone, once every other function is proven.

  A release of the whole fleet put both in the same group (3 of 25), and a fleet release cannot be split by hand
  into separate by-name runs. The planner now deploys the heartbeat in a group of its own, first. It deploys the
  sweep in a group of its own after the verify and browser-access steps, and only when every function shipped and
  both checks passed. Otherwise the sweep is held, even with `--continue-after-function-failure`, and the
  finishing command includes it. Four unit cases cover it. Six mutations each turn them red; a seventh, on a
  defensive line that no current path reaches, does not.

## Checks

| Check | On | Result |
| --- | --- | --- |
| `npm run test:platform` | `7d59c1a` | 11,668 of 11,668 |
| `node --test tests/tools/*.test.mjs` | `7d59c1a` | 1,682 of 1,682 |
| `npm run lint` · `npm run audit:theme-colors` | `7d59c1a` · `5190e97` | pass (0 errors) · pass |
| `npm run build` · `npm run build:firebase` | `7d59c1a` | pass; no tracked file rewritten |
| `node scripts/check-first-load-budget.mjs` | `7d59c1a` | **pass**: studentHome 845.3 KB, signIn 291.2 KB (see below) |
| `test:rules` | `5190e97` | 243 and 220 (both runners) |
| `test:challenge-finish` · `test:test-cycle-certification` | `f09ad2a` | 477 (twice) · 38, all pass. Before `f09ad2a`, 476 of 477: test L, above |
| `test:canonical-persistence` · `test:secure-exam-navigation` · `test:grade-authority` | `5190e97` | 35 · 25 · 14, all pass |
| The rest of the full-platform suite: six emulator suites (Classroom regrade report, identity repair, Live Challenge launch, path choice report, path release, Warm-Up reopen) and the audits | `7d59c1a` | all pass (5, 4, 10, 5, 4 and 1 cases). The audits are answer acceptance, path release verify, release authority, challenge DOK and quality, fidelity seeds, authoring boundary, legacy source, and authoring v5 tests (686) and validation. No tracked file rewritten |
| `releasePlan` and the release tests | `cd6ae7f` | 73 of 73 |
| Student drivers, 27 (plain Vite), including W4-1's workViewHelpReach and B's closedQuestionEnter and moduleRecoveryLock | `7d59c1a` | 26 pass. toolFocusAndUndo failed on the how-to count; `282006b` fixes it (the scene passes at both sizes), and the whole driver runs again below |
| toolFocusAndUndo, whole driver | pushed head | running after the push |
| Student drivers, 20 more, workViewMatrix and the two tool captures | pushed head | running after the push |
| Real-App journeys (teacher harness), 20, including B's submitAndFinishJourneys and studentNameJourneys | pushed head | running after the push |
| `warmupReopenJourneys --slow` | pushed head | running after the push |
| The rest of the journeys job (linearMultipleRepresentations, lmrProcessMode, warmupReopenDraft both modes, familyPinContainment `--slow`, recoveryHoldJourneys `--slow`) | pushed head | running after the push |
| `test:draft-persistence`, `test:test-cycle-device`, `certify:performance:load`, and the three Live Challenge browser suites | pushed head | running after the push |
| `npm run certify:dark-mode` · `scripts/certify-interactive-capabilities.mjs` | pushed head | running after the push |
| `npm run certify:accessibility` and the accessibility drivers | pushed head | running after the push |

The rows marked "running after the push" run on the pushed head so that wave 5 can merge this base sooner, as with
wave 3. Anything they find is fixed on this branch and listed here.

The emulator suites ran on `5190e97` (B merged), before W5-1, B's last round and `cbeff6a`. They were not re-run on
the later commits, because those change browser code, browser tests and documents only, with two exceptions. The two
integration files `f09ad2a` touches were re-run. `cd6ae7f` changes release tooling, which its own tests cover.

### The first-load budget

CI's "Student first-load budget" step passes again. The baseline is 1,023.4 KB gzip with an 8 KB allowance, so the
limit is 1,031.4 KB.

| Tree | studentHome | signIn |
| --- | --- | --- |
| Wave 3 as merged (`fd3563e`) | 1,048.8 KB, 196 files | 291.5 KB |
| Wave 4 and B, before W5-1 (`5190e97`) | 1,048.7 KB, 193 files | 291.3 KB |
| W5-1 alone (`8154f60`, its handoff) | 845.5 KB, 189 files | 291.4 KB |
| This merge (`7d59c1a`) | **845.3 KB, 185 files** | **291.2 KB**, 27 files |

W5-1 took mathjs (174 KB gzip) and the modules that reached it out of the first load (its handoff, item 1). Wave 4
added nothing Home has to wait for. `scripts/first-load-baseline.json` is unchanged. The baseline's rule is to
lower it after a deliberate reduction. That happens once wave 5 is merged and measured (W5-1, decision 1), so that
each later session is measured against the same number.

## Deploying (not done)

Nothing here is deployed. Wave 4's own targets (`node scripts/release-firebase.mjs --since cbeff6a`, plan only):

- **Hosting:** every session.
- **Functions:**
  - W4-2 changes `functions/index.js` and `functions/shared/testCycleAvailability.mjs`, so the whole fleet
    redeploys. Its callables must be live before Hosting (PR-20: an old `getStudentTestCycle` ignores `preview` and
    would open a stand-in Retest). The planner already orders it this way. Never deploy Hosting alone.
  - W4-3 changes the Live Challenge callables and adds the scheduled `closeOverdueLiveChallengeRounds`. The planner
    now keeps its order (`cd6ae7f`, above). Ending abandoned games stays off after the deploy; it is the owner's
    switch (`platformFlags/liveChallengeServerSweep`, W4-3 decision 1). W4-3's handoff gives the rollback order:
    the switch first.
  - W4-4's `functions/shared` changes do not change any server grader. The planner lists the fleet anyway.
  - B, W4-1 and W5-1: Hosting only.
- **`functions:path-admin`:** yes, because `functions/shared` changed.
- **Rules and indexes:** none in wave 4. Wave 3's rules (H) are still on this branch, undeployed.

The whole branch against `main` plans 27 function groups (about an hour), then the checks, the sweep, path-admin,
rules and Hosting. Release it with `node scripts/release-firebase.mjs` (plan, then `--execute`). Never use a raw
`firebase deploy --only hosting`. Batch 3 (PR #497) ships to main on its own. Once it is live, releasing from this
branch before Batch 3 is merged into it would take Batch 3 off the site.

## Decisions waiting for the owner

Each handoff lists its own. These are the ones to settle before students rely on this wave:
- **W4-3:**
  - whether to end abandoned games (off by default);
  - its windows: 10 s close grace, 30 minutes host away.
- **W4-2:**
  - a day designated A/B after its period ended (retroactive designation);
  - whether a student's own extension moves the Corrections and Retest close;
  - the students the PR-21 bug moved to a stand-in Retest (nothing is deleted).
- **W4-1:**
  - which tool steps count as method, and so are withheld on an exit ticket, quiz or test;
  - mixed step lists. Splitting them into control steps and method steps is content work, queued for wave 5.
- **B:**
  - the first try's label counts the total ("uses 1 of 3 tries");
  - Enter on a closed question continues;
  - "Go back" goes to the earliest open question.
- **W4-4:** whether functions ship with its Hosting release. Its behaviour is the same either way.
- **W5-1:** the teacher-only modules still in the first load, about 26 KB. They are worth moving on their own if the
  budget gets tight again.

## Found here, left for later

- `studentNameJourneys` N2 and N4 failed in wave 3's gate on the base too. W5-1 found the cause in the harness: its
  clock put the teacher on a Fall-break Wednesday, when Attendance History correctly lists no one. W5-1 fixed it,
  and the journeys above run with the fix.
- Still open from wave 3:
  - the arrival notice that shows over Home;
  - `darkModeCertification`'s real clock;
  - Batch 3's double announcement;
  - Q-97, the inert closed work area.

  See [STUDENT_PASS3_WAVE3_INTEGRATION.md](STUDENT_PASS3_WAVE3_INTEGRATION.md).
