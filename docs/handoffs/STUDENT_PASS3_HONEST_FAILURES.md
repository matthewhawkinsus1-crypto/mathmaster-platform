# Student pass 3, wave 7, W7-3: honest failures

Branch `claude/pass3-honest-failures`, from `claude/modest-pasteur-xzagn7` at `530ac3cf` (`main` today). Nothing here
deploys, writes to a production project or re-grades anything. No new Firestore path, no rules, index or Cloud
Function change. This session owns `src/App.jsx` this wave.

Each item was first checked on the base by reading the code there (line numbers below are the base's), and the two
visual ones were replayed in a real browser: `tests/browser/stepNotQueued.mjs` runs the old host's answer (`?host=null`)
next to the new one.

## Per item: what a student saw → what changed → proof

### 1. A Step Algebra step, or a new problem, the device could not queue

Source: STUDENT_PASS3_BATCH3_CLIENT.md "Left for later", STUDENT_PASS3_BATCH3_INTO_PASS3.md, wave 6 "Found here".

**Still there on the base?** Yes.

- `App.jsx` `handleStepGrade` (base ~7487) caught a failed outbox write with a toast, "Step not queued — Your step is
  still in Work View…", and returned `null`.
  - The toast sat under Work View.
  - The solver never looked at the answer. It applied the step anyway: new equation, a history entry, "Balanced step
    complete", and the Step Algebra draft moved on.
  - "Submit it again" had nothing to press: the step was already on the board.
- The new-problem handler (base ~7585) did the same with "Replacement not queued". Worse, `QuestionEngine` had already
  removed the question's drafts and emptied its answer before it asked the host.
- Replayed in the browser: with the old host's `null`, the solver applies a step nothing saved (the driver's "defect"
  checks).

**Changed.**

- `src/platform/student/submissionNotQueued.js` gains two results, shaped like Batch 3's `SUBMISSION_NOT_QUEUED`.
  Neither carries a verdict, credit or attempt.
  - `STEP_NOT_QUEUED`: "Step not saved. This device could not save this step, so it was not sent and no try was used.
    Your step is still here: keep this tab open and apply it again."
  - `REPLACEMENT_NOT_QUEUED`: "No new problem yet. This device could not save your request, so nothing changed and no try
    was used. Keep this tab open and ask for the new problem again."
- `App.jsx`: both catches return the result and raise no toast. The save line still says "Not saved · …"; it is not a
  live region, so the alert below is the one announcement.
- `StepByStepAlgebraCore.jsx`: every commit that saves a step now reads the host's answer before it applies anything.
  That is the balanced move, Simplify, Distribute, the Rewrite tools and a standalone cancellation.
  - On `STEP_NOT_QUEUED` (`holdUnsavedStep`) the step is not applied: no new equation, no history entry, no "complete".
  - Whatever the student staged stays on the board: the pending move, the crossed sides, the open tool.
  - One `role="alert"` in the solver says so. It is inside Work View, where the student is. It is remounted on each
    failure, so a second failure is announced again.
  - "Apply the step again" repeats the same step. It is offered only while the board is the equation the step was
    taken on, and is disabled while a save is in flight.
- `MultiRelationAlgebraCore.jsx` (the relation solver, also `stepAlgebra`): `commitState` now saves first and applies
  after.
  - On `STEP_NOT_QUEUED` it returns `false`, and every caller already stops on `false`. The relation, history and
    staging are untouched, the same alert shows, and the student presses the same control (Commit step, …) again.
  - A ref keeps it to one step at a time while a save is in flight. The old order applied first, so a double press
    acted on the new state; now it would have acted twice on the old one.
- `QuestionEngine.jsx` `handleRequestNewQuestion` asks the host first.
  - On `REPLACEMENT_NOT_QUEUED` it keeps the question, its drafts and its answer, and shows the alert under "Request
    New Question", which can be pressed again.
  - Only after a queued request does it clear the old variant's drafts. The variant is part of the draft key, so the
    new problem's key is never touched.

**Proof.**

- `tests/platform/studentHonestFailures.test.mjs`, items 1: the result shapes. App answers with the result, never `null`,
  never a toast. Each of the five solver commits stops between the save and the new equation. The alert and the
  retry's guard. The relation solver saves before it applies. The new problem asks before it clears.
- `tests/browser/stepNotQueued.mjs` (new; real QuestionEngine and solvers; 1366×768 and 390×844; plain Vite on 5199):
  - Step Algebra, 3x + 6 = 21, Subtract 6 and cancel. The board keeps the equation, one alert, no "complete", and the
    button fits the screen. Once the device can save, "Apply the step again" applies it, reaching the host once more.
  - The relation solver, 2x + 3 < 11, Subtract 3: the same, with Commit step pressed again.
  - A new problem: one alert, same variant, its saved draft kept. The second request opens variant 1, and only then
    is the old draft cleared.
  - The defect replayed with the old host's `null` (two checks).
  - 62 checks, 0 findings.
- `submitNotQueued.test.mjs`'s two import assertions now allow the added names (behaviour unchanged; mutation-checked).

### 2. Raw error text reaching students

Source: STUDENT_PASS3_GETTING_AROUND.md "Not done".

**Still there on the base?** Yes, and Graph the Line (#500) added more. On the base every one of these printed
`error.message`:

- `LiveChallengeStudent.jsx`:
  - the answer submit (~386) and its retry (~430);
  - the room listener (~861);
  - the score, standings and place listeners (~954, ~963, ~973);
  - the join (~1064).
- `GraphFeatureRushRound.jsx` (~364, ~447).
- New with #500: `LineGraphRound.jsx` (~517, ~599), `LineGraphPractice.jsx` (~81), and the same in
  `GraphFeatureRushPractice.jsx` (~60).
- `SessionGate.jsx` printed `hydrationError` as is, from `App.jsx`'s `error.message` (~3574).

A Firestore listener's refusal reads "Missing or insufficient permissions."; a program error reads like "e.map is not
a function". Both pass `studentSafeSentence`'s word filter, so routing alone would not have been enough.

**Changed.**

- `src/platform/student/studentErrorWords.js` (new) is the words half of `studentErrorText.js`: `text` and `retry`,
  with no navigation exit and no imports. `studentErrorText.js` re-exports it and adds the exit; its behaviour for
  callers is unchanged.
  - New rule: only a callable's message (`functions/…`) counts as a sentence our server wrote. A Firestore or Auth SDK
    error, or a program error (`TypeError`, `RangeError`, …), is never shown.
  - New option `fallback`: the screen's own sentence when none comes with the error.
- `studentErrorSentence(error, fallback)` is used at every site above. Each keeps the technical error in a
  `console.error` / `console.warn` line, for support.
- `SessionGate` shows `studentErrorSentence(hydrationError, …)`. Its fallback is "Something went wrong while loading
  your account. Return to sign in and try again." `App.jsx` now hands it the error itself and logs it.
- `TestCycleCard` (the existing user) now also hides a Firestore SDK message. A callable's sentence is kept as before.

**Proof.**

- `studentHonestFailures.test.mjs`, item 2:
  - the translator on real errors (SDK, program, callable, plain sentence, offline, bare code);
  - the words module imports nothing;
  - each of the five Live Challenge screens sets no `.message`, routes every shown error (7 / 2 / 2 / 1 / 1), and logs
    each one;
  - SessionGate and App's hand-off.
- `studentErrorText.test.mjs` unchanged and green.
- `appShellSplit.test.mjs`'s gate assertion now expects the translated sentence (rewritten per the playbook,
  mutation-checked).

### 3. Copy that is no longer true

Sources: STUDENT_PASS3_WAVE6_INTEGRATION.md "Found here"; STUDENT_PASS3_D7_EXTRA_TIME.md "Not done"; W6-2's N6.

**Still there on the base?** All three.

- `whatChangedModel.js` (~270) listed any extension as "You have more time on … — now due <date>", past dates
  included.
- `SectionTimeLeft` read "Exit ticket (DOL) open · 3:20" and Home "Closes at 10:52". A pill counting past the class's
  end gave no reason.
- The arrival effect (`App.jsx` ~11246) returned early off the workspace and kept the queue. A notice for an opening
  that never committed would show over the next, unrelated one.

**Changed.**

- An extension whose date has passed is not listed any more (`controlChanges` uses the `nowValue` it was already
  passed).
- "extra time" (`src/platform/assessment/extraTimeWords.js`, re-exported by `dolCloseCopy.js`) is now said in four
  places, all from `getDOLState().extendedTime`:
  - the pill: "Exit ticket (DOL) open · extra time · 3:20";
  - the pill's screen-reader sentence: "… is open (extra time), 3:20 left.";
  - Home's card: "Closes at 10:52 AM — extra time" (`resolveNextAction` → `extraTime`);
  - the open notice, as before.
  It names no accommodation and no multiplier.
- The arrival notices are dropped by any commit that has them queued and is not the workspace. They are queued in the
  same update that opens the workspace, so such a commit means it never opened.

**Proof.** `studentHonestFailures.test.mjs`, item 3: a past and a future extension; `resolveNextAction` with and without
extra time; the Home card, pill and App wiring. `appUrlArrival.test.mjs` rewritten: the drop comes before the toast.

### 4. "Not being saved" across a reload

Source: wave 6 "Found here" (W6-5).

**Still there on the base?** Yes. `draftSaveHealth.js` kept the problems in module memory. Separately, App cleared all
of them whenever `user?.id` changed (an effect cleanup). That includes null → student, which is what a reload does as
the account loads.

**Changed.**

- The two backup problems are kept in the tab's `sessionStorage` (`mathmaster:draft-save-health:v1`). They are read
  back on load only for drafts still in this device's storage.
  - `BACKUP_REFUSED`: the server backup refused a draft that is on this device.
  - `BACKUP_FULL`: the backup is past its caps and left the oldest drafts out.
- Every change writes through, so the notice goes the moment the draft saves, and a reload does not bring it back.
- `DEVICE_FULL` is not kept. That work never reached storage, so after a reload it is not in the page any more, and
  the next write that fails says so again.
- Still per tab: a new tab starts clear.
- App now clears the problems only when a signed-in account gives way (sign-out, another student), never when one
  arrives.

**Proof.**

- `studentHonestFailures.test.mjs`, item 4: module reloads with fake storages. A refused backup survives; device-full
  and a retired draft do not. A clear writes through; sign-out empties what is kept; an unreadable copy starts clear.
  App's account rule.
- `tests/browser/teacherWorkflow/draftSaveNoticeReloadJourneys.mjs` (new; the real App on the teacher harness, 5188):
  - R1: after a reload the account loads, Home says "Some work needs attention", and the assignment shows the refused
    sentence.
  - R2: an edit that is backed up clears it, and a reload keeps it cleared.
  - R3: a kept problem for a draft no longer on the device is dropped.
  - 10 checks, all pass.
  - The refusal is planted in the kept copy; the guard that refuses a real draft is `draftSaveFailureNotice`'s.

## Gate

GATE_TABLE

## The first load

FIRST_LOAD

## Deploying (not done)

- **Hosting only.** Every change is under `src/`; tests and docs do not ship.
- **Functions, rules, indexes:** none. `functions/` and `functions/shared/` are untouched.
- Run `node scripts/release-firebase.mjs --since 530ac3cf` for the exact plan.
- It touches persistence: the device's draft-save notice, and the order in which a step and a new-problem request are
  saved and applied. Release outside class time, as the brief says.
- An open tab of an older build keeps the old behaviour until it reloads. Nothing it writes conflicts: the kept-notice
  key is new and read only by this build.

## Decisions for the owner

1. **A wrong-side tap or wrong simplification the device could not save** (a "slip" record, kept only for the teacher
   at levels that record slips) is not announced to the student. It costs them nothing, and the save line says
   "Not saved". Before, it raised the "Step not queued… submit it again" toast, with nothing to submit.
2. **"Apply the step again" repeats the step as staged when it failed.** If the student edits the staged
   simplification after the failure, the button still applies the original. The solver's own "Check my
   simplification" uses the edited one. The button goes as soon as the equation changes.
3. **Step credit for a checked intercept** (`LinearInterceptsOrchestrator`, fire-and-forget) that could not be queued
   is not announced. The intercept is checked locally and graded at Submit; only that step's credit is lost. Before, a
   toast said "Step not queued".
4. **The account-load fallback** reads "Something went wrong while loading your account. Return to sign in and try
   again." Teachers see it too, so it does not say "tell your teacher".
5. **Device-full is not kept across a reload** (item 4, above). Say if you want it kept until the next successful write
   instead.

## What I touched outside my scope

- `src/QuestionEngine.jsx`: the new-problem handler and its alert (item 1). W7-4 (feedback reasons 2) may also be in
  this file. My hunks are the import line, one `useState`, `handleRequestNewQuestion`, and one line after the "Request
  New Question" button.
- `src/StepByStepAlgebraCore.jsx` and `src/MultiRelationAlgebraCore.jsx`: item 1 needs the solvers to read the host's
  answer.
- `src/components/student/SectionTimeLeft.jsx`, `WhatShouldIDoNow.jsx`, `src/studentDashboardModel.js`: the
  "extra time" words.
- `src/platform/student/studentErrorText.js` was split. It re-exports everything it had; behaviour is unchanged except
  that SDK and program errors are no longer kept.
- Tests rewritten per SOURCE_CONTRACT_PLAYBOOK: `appShellSplit` (1 assertion), `appUrlArrival` (1), `submitNotQueued`
  (2).
- For W7-7 (CI hygiene): two new drivers are in no workflow yet:
  - `tests/browser/stepNotQueued.mjs` (plain Vite on 5199);
  - `tests/browser/teacherWorkflow/draftSaveNoticeReloadJourneys.mjs` (teacher harness on 5188).

## Not done

- `LinearInterceptsOrchestrator`'s own intercept step (decision 3).
- A slip that could not be saved (decision 1).
- `SectionRecoveryRunner`, `ToolWrapper` and the Live Challenge question host have their own step hosts. None of them
  writes to the durable outbox, so none returns these results; nothing to change.
- Teacher-facing Live Challenge screens (`LiveChallengeTeacher`, hosts, setup) still print `error.message`: out of
  scope (students only).

MUTATIONS
