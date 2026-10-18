# Student pass 3 — wave 3 on the integration branch (2026-10-17)

`claude/modest-pasteur-xzagn7` moves from `6accda1` to this merge. Seven of wave 3's eight sessions are in it. The
eighth, B (Submit and finishing, `claude/pass3-b5-submit-and-finish`), is reviewed: it merges this base on its own
branch, then joins wave 4. Each session's handoff holds the detail. This note says what the merge itself changed,
how the merged tree was checked, and how it ships.

## What merged

| Session | Branch | Merged at | Handoff |
| --- | --- | --- | --- |
| F · Read aloud and Translate | `claude/pass3-b6-read-aloud-translate` | `f866955` | [STUDENT_PASS3_READ_ALOUD_TRANSLATE.md](STUDENT_PASS3_READ_ALOUD_TRANSLATE.md) |
| H · D10 Phase 0, the open assignment reads | `claude/pass3-d10-phase0` | `b841ec6` | [STUDENT_PASS3_D10_PHASE0.md](STUDENT_PASS3_D10_PHASE0.md) |
| A · where you stand, room to work | `claude/pass3-b5-assignment-chrome` | `6955c74`; review fixes `0e357bc`; wave-3 round `9257bc8` | [STUDENT_PASS3_ASSIGNMENT_CHROME.md](STUDENT_PASS3_ASSIGNMENT_CHROME.md) |
| C · getting around | `claude/pass3-b5-getting-around` | `3fca304` | [STUDENT_PASS3_GETTING_AROUND.md](STUDENT_PASS3_GETTING_AROUND.md) |
| G · extra time on the exit ticket (D7) | `claude/pass3-d7-extra-time-dol` | `837b383` | [STUDENT_PASS3_D7_EXTRA_TIME.md](STUDENT_PASS3_D7_EXTRA_TIME.md) |
| D · tools on the keyboard, focus, Undo | `claude/pass3-b6-tools-keyboard-undo` | `12f0835` | [STUDENT_PASS3_TOOLS_KEYBOARD_UNDO.md](STUDENT_PASS3_TOOLS_KEYBOARD_UNDO.md) |
| E · what tools say and show | `claude/pass3-b6-tools-speech-contrast` | `776c69f` | [STUDENT_PASS3_TOOLS_SPEECH_CONTRAST.md](STUDENT_PASS3_TOOLS_SPEECH_CONTRAST.md) |

The base moved twice while they were built (`ff163f9`, `8e51f65`, then `6accda1`); each move was merged in, never
rebased.

## What the merge changed

- **One textual conflict.** D and E each added a comment block at the same place in
  `.github/workflows/student-runtime-browser-gates.yml`; both are kept.
- **`0e53cf3` · enduranceJourneys.** C named the lesson's Back control for where it goes. The journey still pressed
  "Back to dashboard". It now presses the visible `/^(← )?Back to (dashboard|home)$/i`.
- **`fe56f54` · focusSafeToolControls.** E's new driver opened Work View by "Enlarge", and A renamed that button
  "Open Work View". The driver now accepts either name.
- **A's wave-3 round, merged as `fd3563e`.** This gate's journeys found these on the merged tree, and A fixed them on its
  branch:
  - The navigator printed a raw date key ("Opens 2026-10-17"). It now says "Opens Mon, Oct 19", "Closed" or "Opens in
    class" (`76f2514`).
  - A locked question is marked `data-locked` (`4067eea`).
  - At 1366×768 a toast covered Submit. With the compact navigator, a short question leaves the action bar in the flow,
    not stuck to the bottom of the screen. Toasts now rise above the bar's actual top, published as
    `--mm-action-bar-clearance`; phones keep toasts at the top (`1fe4591`).
  - Journeys were updated for the merged chrome:
    - they open "Show progress" before reading question numbers;
    - the exit-ticket timer checks use a student without extra time, since G gives 910002 extra time;
    - P2 reads the address once a question is on screen.
- **`0688865` · studentScreenChange S7.** The "That question has moved" notice is raised as the assignment starts
  opening, so Home can stay on screen for a few seconds after it. That happens on the base too: Home was showing
  800 ms after the notice in 2 of 3 probes at 1366×768. The check measured at 800 ms and sometimes found no Submit at
  all. It now waits for the action bar, and requires the notice (shown for 10 s) to still be up when it measures.
  Three runs at both sizes pass. With the toast-clearance rule disabled, it reports the tap landing on the toast.

## Checks

| Check | On | Result |
| --- | --- | --- |
| `npm run test:platform` | `fd3563e` | 11,598 of 11,598 |
| `node --test tests/tools/*.test.mjs` | `fd3563e` | 1,671 of 1,671 |
| `npm run lint` · `npm run audit:theme-colors` | `fd3563e` · `0e53cf3` | pass · pass |
| `npm run build` · `npm run build:firebase` | `fd3563e` | pass; no tracked file rewritten |
| `node scripts/check-first-load-budget.mjs` | `fd3563e` | **fails** — see below |
| `test:rules` | `0e53cf3` | 243 and 218 (both runners) |
| `test:challenge-finish` · `test:canonical-persistence` · `test:test-cycle-certification` · `test:secure-exam-navigation` · `test:grade-authority` | `0e53cf3` | 453 · 35 · 35 · 25 · 14, all pass |
| Student drivers, 24 (plain Vite) | `0e53cf3` | all pass after `fe56f54`. composedDraftRestore failed once at load average 16 and passes alone |
| Student drivers, 23 more, incl. workViewMatrix and the tool captures | `fe56f54` | all pass. workViewMatrix `--write` changed only its fixture's timestamp, restored |
| The 11 student drivers nearest A's last round (studentUxPlatform, assignmentMobile, keyboardSweep, day1SystemsJourney, unansweredChoiceGates, stagedQuestion, phoneToolPanelReach, workViewCertification, workViewTerminalTransition, studentResultUpNext, reviewMyWork) | `0688865` | all pass |
| Real-App journeys, 8 (teacher harness) | `fd3563e` | all pass |
| Real-App journeys, 11 more | `fd3563e` | 9 pass. studentScreenChange: fixed above. studentNameJourneys N2/N4 fail **on `6accda1` too**: the teacher's Attendance History lists students as "ID 9100xx" (not in CI; wave 5 takes it) |
| `warmupReopenJourneys --slow` | `0688865` | all pass: 139 checks in 56 min. The base takes 52 min here, so a 30-minute limit in an earlier run was mine, not the app's |
| `npm run certify:dark-mode` · `scripts/certify-interactive-capabilities.mjs` | `0688865` | running after the push |
| `npm run certify:accessibility` and the accessibility drivers | `0688865` | running after the push |
| The rest of the full-platform suite: six emulator suites (Classroom regrade report, identity repair, Live Challenge launch, path choice report, path release, Warm-Up reopen) and its audits, plus assignment-v5 foundation | `0688865` | all pass (5, 4, 10, 5, 4 and 1 cases; answer acceptance, path release verify, release authority, challenge DOK and quality, fidelity seeds, authoring boundary, legacy source, authoring v5 tests and validation); no tracked file rewritten |
| The rest of the journeys job: linearMultipleRepresentations, lmrProcessMode, warmupReopenDraft (both modes), familyPinContainment `--slow`, recoveryHoldJourneys `--slow` | `0688865` | running after the push |
| `test:draft-persistence`, `test:test-cycle-device`, `certify:performance:load`, and the three Live Challenge browser suites | `0688865` | running after the push |

The last four rows ran after the push, so that B and wave 5 could start on this base; their results are added to this note as they finish, and anything they find is fixed on this branch.

The emulator suites ran before A's last round. They were not re-run after it, because that round and the last commit
change browser code and tests only.

### The first-load budget

CI's "Student first-load budget" step fails on this branch. The baseline is 1,023.4 KB gzip with an 8 KB allowance,
so the limit is 1,031.4 KB. Measured studentHome:

| Tree | studentHome |
| --- | --- |
| Batch 1–2 tip `464858b` | 1,030.1 KB |
| `6accda1` (the previous integration head; already over) | 1,035.5 KB |
| This merge (`fd3563e`) | 1,048.8 KB in 196 files |

Most of what joined is student code that Home does not need yet:
- Batch 8's Ask-my-teacher pieces;
- the assignment chrome's navigator and timers;
- `misconceptionStudentMessages`;
- teacher-only modules that App imports statically.

The pass-3 branch cannot go to main until this passes. A wave-5 session is assigned to it: load these lazily, and never
raise the baseline. `main` is within its limit: 1,030.1 KB at `56a5a5b`, and 1,031.0 KB with Batch 3 (PR #497).

## Deploying (not done)

Nothing here is deployed. The union of the sessions' targets:

- **Hosting:** every session.
- **Functions:**
  - G: twelve functions plus `platformBuildInfo`, functions first. See its handoff for the list and the order.
  - H: `setAssignmentReadScope`.
  - C: `loadMyReviewWork`, optional.
  - `node scripts/release-firebase.mjs` plans the whole fleet, because `functions/index.js` changed.
- **Rules:** H's `firestore.rules`. The by-id read switch ships off. H's handoff gives the owner's steps for turning
  it on, starting at least seven school days after the release.
- **Indexes:** none.

Release with `node scripts/release-firebase.mjs` (plan, then `--execute`). Never use a raw
`firebase deploy --only hosting`. This branch does not have Batch 3 yet; Batch 3 ships to main on its own (PR #497). Once
Batch 3 is live, releasing from this branch before Batch 3 is merged into it would take Batch 3 off the site.

## Decisions waiting for the owner

Each handoff lists its own. The ones to settle before students rely on this wave:
- **F:** a Spanish-speaking math teacher reviews `packs/esSupport.js` (974 templates) before students rely on
  Translate's Spanish.
- **H:** when to turn on the class-scoped lists (P0-2, at least seven school days after the release), and then the
  by-id switch (P0-3).
- **G:** confirm the following:
  - the legacy "extra-time" box extends a timed DOL 1.5×;
  - an expired profile keeps extending it;
  - extra time may run past the bell.
- **A:** which closed sections a student may open read-only, and whether the 2:00 and 0:30 warnings still show to
  a student whose support setting hides countdowns.
- **C:** what "Reopened" means (NAV-14), and 10-second toasts.

## Found here, left for later

- Following a link to a question that moved: the notice ("…so it opened where you can work now") shows over Home for
  up to about five seconds before the assignment opens. That predates this wave. Show the notice when the workspace
  opens, or show "Opening…" instead of Home.
- `darkModeCertification` runs on the real clock. Near midnight UTC the fixture's period ends at 23:55 and the
  pack-up banner joins its scenes (A's handoff). Pin its clock.
- Batch 3 announces a submission it could not queue twice: an alert and a toast. To fix when Batch 3 merges into this
  branch.
