# Student pass 3, wave 6, W6-5: Batch 3 joins the pass-3 line

Branch `claude/pass3-batch3-into-pass3`, from the integration branch `claude/modest-pasteur-xzagn7` at `5062cba5`,
with the base `3cb782a9` merged after the review.
It merges Batch 3 ("never lose work", PR #497, `claude/pass3-b3-release` at `7bb74f8`) into the pass-3 line, with
main's four commits since `25250b4` (#496, thousands separators). Nothing here deploys, writes to a production project
or re-grades. Student words follow D9.

Batch 3's own detail is in its two handoffs, now on this line: [STUDENT_PASS3_BATCH3_CLIENT.md](STUDENT_PASS3_BATCH3_CLIENT.md),
[STUDENT_PASS3_B3_ABANDONED_TEST_FINALIZER.md](STUDENT_PASS3_B3_ABANDONED_TEST_FINALIZER.md), and its release note
[STUDENT_PASS3_BATCH3_RELEASE.md](STUDENT_PASS3_BATCH3_RELEASE.md).

| Commit | What |
| --- | --- |
| `b342437` | The merge, and its two conflicts |
| `c0c6ba2` | Item 3: a submission the device could not queue is announced once |
| `cb9bf2e` | Item 2: the save lines agree with Batch 3's unsaved-work notice |
| `c24ce4a` | Item 4: the dark-mode certification runs on the school's clock |
| `58ef6c2` | Item 5: the rich-tool driver reads the open item where a navigable test keeps it, and submits from the review page |
| `8c4c18d` | Review S2: an unsaved-work notice lasts only as long as the work it is about (also applies to PR #497) |
| `8a902e2` | Review S2: Home's part of it, pass-3 only |
| `248e422` | Review B1, S1, N2: Digital SAT boxes read a grouped number as live does; Path list fields keep their kind |
| `181baed` | Merge of the base `3cb782a9` (the Work View CSS fix `6ce0517`, docs) |
| this note | the handoff |

## 1. The merge (`b342437`)

**Before.** The pass-3 line had none of Batch 3: device pins the question dropped were never replaced, a fresh
Chromebook's early touch could overwrite saved multi-answer, Step Algebra and composed answers, saves that failed were
a console line, a submission the device could not queue showed "Correct!" and locked the question, and a timed test
left after its time ran out stayed open until a teacher finished it. Main's #496 (`8,050` graded as 8050 everywhere
`sameValue` is used) was missing too.

**Conflicts.** Two, as the integrator's trial merge found.

- **`src/QuestionEngine.jsx`, imports only.** Both kept: pass-3's `displayGradingSurface`, `attemptResultsReveal` and
  `motionPreference`, and Batch 3's `isSubmissionNotQueued`. The bodies merged without conflict; every Batch 3 guard
  (the ordinary submit, both registry-tool paths, the "same answer again" check) is in place, asserted by
  `submitNotQueued.test.mjs`.
- **`functions/shared/answerEquivalence.mjs`, thousands separators.** The two sides solved the same report two ways:
  - #496 (main) reads the student's grouped number inside `sameValue`, against a key that is one number with no comma,
    and never across a comma and a space. That reaches every `sameValue` caller, including the Path grader.
  - pass-3 (`b86556b`, batch 2) reads a grouped number on either side, but only in the field, literal and table graders,
    and only when the field expects one number (`fieldAcceptsThousandsSeparators`: never a list, set, interval,
    point or roster with element credit; at the merge also never a Digital SAT box, which the review reversed, below).

  Kept both, so neither side's accepted answers are lost and neither side's refusals are undone:
  - `sameValue` applies #496's rule with pass-3's strict grouping (no leading-zero group: `0,500` is not 500), and
    takes `{ thousandsSeparators: false }` from a caller that knows its field is comma-separated.
  - `fieldAcceptsThousandsSeparators` moves into `answerEquivalence.mjs` (`answerUtils` re-exports it), and the
    assignment matcher, the Path grader (`mathPath.js` `valuesEquivalent`) and the teacher's Path simulation
    (`teacherPathRuntime.js`) pass its answer to `sameValue`.
  - `withoutThousandsSeparators` refuses a comma followed by a space (#496's list rule). The pass-3 matcher used to
    accept `1, 250` for 1250.

**After the review (`248e422`).**
- **Digital SAT boxes read a grouped number, as live does** (review B1; decision 1, the integrator's call). #496 is
  live today (`56a5a5b`): the live client and server grade `1,280` right in a Digital SAT number box. The pass-3 line
  refused it, and the server re-grades every queued answer at ingestion, so during release 2 (functions about an hour
  before Hosting), in a tab not reloaded, or for an answer queued offline before it, a student who saw "Correct!" would
  have been recorded wrong. `fieldAcceptsThousandsSeparators` no longer excludes SAT boxes; the SAT decimal rule and
  the strict grouping stay.
- **Path list fields keep their kind** (review S1). Path's stored private grading (`privateGradingDefinition`, used
  for Path, Live Challenge, secure tests and Test Cycle) kept only `equivalence` of a field's kind, so a field
  declared a list through `inputProfile`, `answerFormat`, `notation` or `toolProfile` read `1,250` as 1250 through the
  real `buildIssuePlan`. New issues now store those four (`fieldFormatOf`); stored items keep what they were issued
  with. No bank field is affected today.
- **The teacher's Path simulation** (review N2) builds the same definition (`buildFieldGradingDefinition`) and passes
  the same switch, so a simulation equals production.

**Proof.**
- `pGrading_answerEquivalence` (#496's cases) and `thousandsSeparatorGrading` (pass-3's) both pass. Before the merge's
  resolution two failed (`1, 250` accepted by the assignment matcher; `8,050` through `sameValue` where the field
  said otherwise).
- New cases go through what production builds: `buildIssuePlan` then `gradeResponse` (a number box reads `8,050`
  and `$8,050`, a Digital SAT box reads `8,050` but not `80,50`, list/set/pair fields declared each of the four ways
  refuse `1,250` and accept `1250`, and the kind is stored with the private grading), the SAT box on the assignment
  matcher (with the SAT decimal rule still applying), list and roster fields on the matcher, and the teacher
  simulator (`1,250` is one number in a number box, two values in a list).
- Eight mutations, each red: the Path grader ignoring the field, the matcher not passing it on, the comma-space guard
  removed, #496's hook removed, `fieldFormatOf` dropped, the SAT exclusion restored, the simulator ignoring the
  field, the simulator's definition dropping the kinds.
- **The grading sweep** (`scripts/sweep-equivalence-verdicts.mjs --base <worktree> --draws 3 --check-wrong`), exit 0
  against `5062cba5` at the merge and against `3cb782a9` after the review: **0 right → wrong, 0 wrong → right, 0 near
  miss → right** (SWEEP2), 0 editor spellings refused, 0 wrong stacked spellings accepted. Its corpus has no
  comma-grouped spellings.
- **A thousands probe over the same corpus** (scratch, not committed): every field whose key is one plain number of
  four or more digits (88 fields), graded by four trees (this one, the base, main + Batch 3 `7bb74f8`, and live main
  `56a5a5b`) with the Path grader (Digital SAT boxes marked as `mathPath` marks them), the assignment matcher and
  `sameValue`. Right responses: the key grouped (`8,050`), MathLive's `8{,}050`, and `$8,050`. Wrong: a grouped near
  miss (`8,051`), a bad grouping (`80,50`), a list (`8, 050`) and a leading-zero group (`0,050`).
  - Wrong accepted by this tree, by main + Batch 3, or by live: **0**.
  - Right that live accepts and this tree refuses: **0** (36 before the review, all in Digital SAT boxes).
  - Wrong the base accepted and this tree refuses: 82, all a comma and a space (`163, 840` for 163840) in the
    assignment matcher. Live refuses them too (decision 2).
  - Right this tree accepts that the base did not: 264 Path and 264 `sameValue` verdicts, and 18 assignment verdicts
    in Digital SAT boxes. Live accepts every one.

## 2. Batch 3's persistence and session B's save line (`cb9bf2e`)

Batch 3's client half was built on the pass-3 line before session B (RUN-4, RUN-11, RUN-12, RUN-13) merged, so the
two had never been seen together. Where they disagreed about what a student sees, the honest one is kept:

| Where | Session B / the base said | Batch 3 said | Kept |
| --- | --- | --- | --- |
| The line under a question when the device queue could not be written (`volatile`) | "Saved on this device only. MathMaster will finish saving when you are back online." (the old last branch; session B left `volatile` to App) | "Not saved · this device could not store your last change. Keep this tab open and try it again." | **Batch 3's.** Nothing was saved. It merged without conflict, as session B's handoff predicted. |
| The question after a submission the device could not queue | "Correct!", locked, Submit gone (RUN-3) | Blocked feedback: "Not submitted. … no try was used … press Submit again"; Submit stays with its cost | **Batch 3's.** Session B's Submit label ("Submit — uses 1 of 3 tries") is unchanged by it, since no try was spent. Checked in the real App (below). |
| The line under a question while unfinished work cannot be saved | "Draft saved on this device. You may keep working." / "Draft saved." (about the progress in the device queue) | an alert: "Your work is not being saved on this device: its storage is full…" (or the backup refused it, or is full) | **Batch 3's alert.** The two sat on one screen and said both things. While the alert stands for this student and assignment, a line about drafts is not shown (`saveLineIsAboutDrafts`). A line about an answer the student sent stays, and so do offline, needs-review, refused and not stored. |
| Home's status while a draft cannot be saved | "All work saved" | (the alert is on the assignment screen only) | **"Some work needs attention — keep this tab open"** (`describeSaveStatus` `draftsUnsaved`, from `draftSaveProblemsForStudent`). A closed assignment's own words still come first. |
| What is announced | one always-mounted status region for offline, needs review and refused | the engine's alert, plus a toast (item 3) | one announcement per event (item 3) |

Batch 3's per-answer drafts and wave 4's draft work (session B's "Draft saved" subject; `3eab81c`, composedReopenSubmit
finding Submit by B's label) touch different code: the merge changed neither. The draft gates below cover both.

**Proof.**
- `draftSaveFailureNotice`: three new tests (the rule over every status and subject; Home's status; the student filter)
  and one App wiring test. Seven mutations, each red: the rule never true for a draft line (two), App not applying
  it, Home ignoring it (two), the student filter matching `s10` for `s1`, and Home's unsaved state put ahead of the
  closed-assignment words.
- Three source contracts pinned the old JSX spelling of intact behaviour and were rewritten to anchor on the shared
  value (SOURCE_CONTRACT_PLAYBOOK): `draftSaveFailureNotice` "App.jsx shows the notice…", `submitAndFinish` "App
  wires the save line…" and `submitNotQueued` "the save line has its own words…". Each mutated once (the notice gated
  on the outbox status, the line shown unconditionally, the notice's text replaced, the notice read across
  assignments) and went red.
- **In the real App** (teacher harness, scratch probe, 11 checks, all pass): with drafts refused by the device's
  storage, the student types and moves on; the alert says the work is not being saved, no line says "Draft saved",
  and Home says "Some work needs attention — keep this tab open". The same steps with storage working (the control)
  show "Draft saved on this device. You may keep working." and no alert. With the device queue unwritable, Submit on
  a correct answer: one "Not submitted…" alert, no toast, no verdict, Submit still "Submit — uses 1 of 3 tries", and
  the line "Not saved · …".

**After the review: the notice lasts only as long as the work it is about (`8c4c18d`, `8a902e2`; review S2).** A
problem cleared only when the same draft key saved again, or at sign-out. After a failed save, a student who started
the question over, asked for a new problem, or submitted the answer kept "Your work is not being saved on this
device…" and Home's "Some work needs attention — keep this tab open" for the rest of the session, about work that was
gone or already in the device queue. `clearDraftSaveProblemsForFamily` clears every kind for one question's draft
family; `resetQuestionDraftFamily`, `removeQuestionDraftFamily` and `removeAssignmentDrafts` call it, and so does the
engine after a submission the device queued (not one it could not queue, and not a blocked refusal). A later failed
write reports again.
- `draftSaveProblemLifetime`: one family only (another question's notice, and another assignment whose id starts with
  this one's, stay); Start over clears it even when the device cannot store the reset either; a new problem and a
  retired assignment clear theirs; the engine clears after the two guards on all three submit paths; Home returns to
  "saved". Seven mutations, each red: each of the three storage calls dropped, the family match loosened to a plain
  prefix, the engine's clear dropped, the clear made unconditional on a blocked result, and (Home) the reset's clear
  dropped.
- **The same false alarm is on PR #497's head (`7bb74f8`)**, for the notice (it has no Home part): a scratch probe
  there reports the problem after New problem and after Start over; on this branch it clears. `8c4c18d` applies to
  `7bb74f8` (one import hunk with reduced context; a cherry-pick's three-way merge takes it), and on it
  `draftSaveProblemLifetime`, `draftSaveFailureNotice`, `submitNotQueued`, `fieldRecordDraftMerge` and
  `fieldRecordReviewRegressions` pass (56 of 56). `8a902e2` is pass-3 only.
- **The registry is in memory and per tab.** After a reload, or in a second tab, it reads empty until the next write
  there fails. A device that is still full reports again on the next keystroke; a backup problem on the next save.

## 3. One announcement for a submission the device could not queue (`c0c6ba2`)

**Before.** Batch 3 said it twice: the engine's `role="alert"` "Not submitted. This device could not save your answer,
so it was not sent and no try was used. …" in the question, and a toast "Not submitted — This device could not save
your answer. No try was used. Keep this tab open and press Submit again." in the polite toast region.

**Now.** The alert only. It sits with the question's results, where Submit is, and is brought into view by the result
reveal. The results render inside Work View's dialog too (`{attemptResults}` inside `EnlargeableFigure`), so a student
in Work View sees it there. The toast added nothing: it is on the same page, and it sits under Work View (z-index
20000 against Work View's 2147483000), so in Work View it was not visible at all. The save line's "Not saved · …" is
plain text, not a live region (session B's rule), so it is not a second announcement.

**Proof.** `submitNotQueued` "a failed queue returns 'not submitted'": the failure branch calls no toast (mutation:
a `toastWarning` put back turns it red). The real-App probe above counts the live regions that carry "Not submitted":
one.

## 4. The dark-mode certification runs on the school's clock (`c24ce4a`)

**Before.** Part 2 (the real App) opened its browsers on the runner's clock in UTC. The fixture builds the bell
schedule from that clock: near midnight UTC its period is clamped to end at 23:55, and the pack-up banner, DOL
toasts and "Good evening" join the scenes it audits. Run at 23:46 UTC (libfaketime, browser and runner both), the
unchanged driver's teacher dashboard read "Good evening · Sunday, October 18", Period 3 "11:48 PM – 11:55 PM", the
Warm-Up "closes 11:55 PM", and the student's Home a DOL toast with "5:31 left · Closes at 11:55 PM". It passed, but
it certified a different school day on every run.

**Now.** `certify` opens each context with `newSchoolContext` from `teacherWorkflow/schoolClock.mjs`: the school's zone
(America/Chicago) and a Wednesday 11:00 school morning on which class meets, with timers left real, exactly as every
teacher-harness journey runs. Part 1 (the Work View harness) builds no schedule and is unchanged.

**Proof.** At the same faked 23:46 UTC the pinned driver passes, and its scenes read "Good morning · Wednesday,
October 7", Period 3 11:03 AM. `npm run certify:dark-mode` also passes on the real clock (192 application surfaces, both parts).

## 5. The rich-tool driver lost track of the item, twice (`58ef6c2`)

**Before.** `testCycleRichToolQa` reported 14 findings, the same on `e822504`: every tool's "reload reopens the same
item" read `Cannot read properties of null (reading 'questionInstanceId')`.

**Cause: the driver, not the product, and not Batch 3's pins.** A secure test became navigable (secure exam
navigation, pass 3): the session document keeps only the item order and the cursor, and the open item with its draft
is a server-only document in `examSessions/{id}/items/{instanceId}` (`secureExamItems.js`). `currentQuestion` is null
on every navigable session, so the driver read `null` before the reload, not after it. Device pins are for ordinary
assignments' family deliveries and play no part in a secure test.

Fixed in the driver, it went one step further and stopped again on all 14 sessions: "Submit test" now opens the review
page (`SecureExamSubmitReview`, a page, not an alertdialog), and the driver waited for an alertdialog.

**Now.** The driver reads the item at the session's cursor from the items subcollection (and `currentQuestion` for a
session from before navigation), its draft from the same document, and submits through "Review and submit", the
review page and its "Submit test", as `secureExamNavigation.mjs` does. A new check fails when the item cannot be read
back at all, so the reload check can no longer pass on two missing ids.

**Proof.** The whole driver: 490 checks, 0 findings (it was 434 checks and 14 findings with the reload fix alone, and 14 findings before it). A reload reopens the same item for all seven tools on Chromebook and iPad, and the work survives
it; the autosaved construction is recorded on submit; nothing is left on the device. Mutation: the driver reading the item at the wrong position turns the new check, the reload check and the submit check red.

## 6. The release order

Nothing is deployed. W5-5's step-key change must ship in two releases
([STUDENT_PASS3_WAVE5_INTEGRATION.md](STUDENT_PASS3_WAVE5_INTEGRATION.md#w5-5-must-ship-in-two-releases)), and Batch 3
ships from main first. With this merge the pass-3 line carries Batch 3, so releasing it can no longer take Batch 3
off the site. Main's thousands rule (#496) is live now (`56a5a5b`). The order becomes:

0. **Batch 3 from main**, exactly as [STUDENT_PASS3_BATCH3_RELEASE.md](STUDENT_PASS3_BATCH3_RELEASE.md) says: merge
   PR #497 (open, head `7bb74f8`, mergeable), check `--whats-live` shows `56a5a5b`, then
   `node scripts/release-firebase.mjs --since 56a5a5b --only hosting --functions <its twelve>` and `--execute`. Ask
   teachers to have students reload.
1. **W5-5's step 0** (the owner's read-only count, its decision 7).
2. **Release 1: the key, on main with Batch 3.** Release 1 is built on **the commit main holds once PR #497 is merged**
   (its tree is `7bb74f8`'s), plus one commit holding only the three key hunks:

   ```
   git diff c350dfc0 9f4ea43e -- functions/shared/attemptPolicy.mjs functions/index.js functions/lib/classroomGradeRuntime.js > release1.patch
   git checkout main && git pull --ff-only origin main      # main with #497
   git apply --check release1.patch && git apply --index release1.patch
   git commit -m "Step-state key: a TeX tie is spacing (pass 3 release 1)"
   node scripts/release-firebase.mjs --since <main with #497>   # then --execute
   ```

   Put that commit on main (a PR of its own) before releasing it: Batch 3's release note stops when the live build is a
   commit that is not on main, and that check should keep meaning something.
   Checked here on a local, unpushed copy (`7bb74f8` + the patch, `b2d1e06`): the patch applies; the planner
   (`--since 7bb74f8`) names exactly the three files, the whole default fleet in 25 groups (about 56 minutes),
   path-admin and Hosting, no rules, no indexes.
3. **Wait** until `node scripts/release-firebase.mjs --whats-live` shows every function, path-admin included, on
   release 1's commit, then 10 to 15 minutes more.
4. **Release 2: the pass-3 line** (the integration branch once this is merged into it), planned with
   `node scripts/release-firebase.mjs --since <release 1's commit>`, then `--execute`. On this branch against the local
   release-1 copy the planner names: Firestore rules (`firestore.rules`: Batch 8's "Ask my teacher" and D10 P0-3, which
   main does not have), the whole default fleet (27 groups, about 61 minutes; `calibrateLiveChallengeClock` first and
   alone, `closeOverdueLiveChallengeRounds` last and alone), the verify and browser-access checks, path-admin and
   Hosting. No indexes. `teacher-import-jsons/…/T2_L3_Solving_Systems_with_Matrices.json` is deployed by nothing
   (W5-3: teachers re-import it). This branch already holds the three key hunks (the patch reverse-applies here), so
   release 2 changes no step key.
5. Ask teachers to have students reload after each Hosting release.
6. **After release 2 the live build is a pass-3 commit that is not on main.** Until the integration branch is merged
   to main, release only from the integration branch; a hotfix goes there. (Batch 3's release note stops when the
   live build is not on main; after release 2 that is expected, and releasing from main would take pass 3 off the
   site.)

`node scripts/release-firebase.mjs --since origin/main` (plan only, on this branch) plans what is expected: 677 files;
rules, the whole default fleet (27 groups), path-admin and Hosting; no indexes; the matrices lesson JSON unmapped. It
is the same as release 2's plan, because main and release 1 differ only in Batch 3 (already here) and the three hunks
(already here).

**An alternative the owner may take:** steps 0 and 2 as one release from main (main with #497 plus the key commit,
planned against the live `56a5a5b`): the whole fleet, path-admin and Hosting, about an hour instead of five minutes for
Batch 3 alone. It saves one release; it gives up Batch 3's short, narrow window ("outside class time; do not pause or
resume a live Test while `manageAssignmentLifecycle` is deploying" then lasts the hour).

## Deploy targets (release 2, this branch)

- **Hosting**: yes (every student change here, and the shared grader).
- **Functions**: the whole default fleet, including Batch 3's `finalizeAbandonedSecureExams` (new, scheduled every 5
  minutes, private; `firebase deploy` creates its Cloud Scheduler job when it first ships, in step 0) and every
  function that loads `answerEquivalence.mjs` (the thousands resolution) and `mathPath.js`.
- **path-admin**: yes (`mathPath.js`, `answerEquivalence.mjs` and the rest of the shared graders).
- **Firestore rules**: yes, pass-3's (not from this merge; Batch 3 changes no rule, its rules cases are tests).
- **Indexes**: none. Batch 3's two `examSessions` queries are single-field.

## Decisions for the owner

1. **Digital SAT boxes accept `1,280` as live does** (decided by the integrator after the review). Main's #496 is live
   now (`56a5a5b`) and grades it right in a Digital SAT number box; this line now does too, so no release turns a
   right answer wrong. If the owner wants the SAT's own no-comma entry rule, it belongs at entry (the box declines the
   keystroke with the SAT's words), never as a right value graded wrong.
2. **`1, 250` (a comma and a space) is no longer one number** in assignments, as on main. Pass-3 had accepted it for a
   one-number key since batch 2. The sweep's corpus has no such spellings; the probe found 82 that the base accepted.
3. **The release order above**, and whether to fold Batch 3 into release 1.

## Outside my scope

- `functions/lib/mathPath.js` (the Path grader passes the field's answer to `sameValue`; new issues store the field's
  kind), `functions/shared/answerUtils.mjs`, `functions/shared/legacyFieldGrading.mjs` and
  `src/platform/simulation/teacherPathRuntime.js`: W6-6's area (grader gaps). The changes are the conflict's
  resolution and the review's S1 and N2, nothing else.
- `src/questionDraftStorage.js` and `src/QuestionEngine.jsx` (review S2: the notice is cleared with its work).
- `src/platform/student/saveStatusModel.js` (session B's) gains `saveLineIsAboutDrafts` and `describeSaveStatus`'s
  `draftsUnsaved`; `src/App.jsx` reads them.
- `tests/browser/testCycleRichToolQa.mjs` and `tests/browser/darkModeCertification.mjs` (items 4 and 5, as asked).
- No student sentence is new. Batch 3's own sentences (the not-submitted alert, the unsaved-work notice, the "Not
  saved" line) are not in a Read aloud or Translate region, so they have no Spanish entries, as on PR #497.

## Gate

All on this branch (`58ef6c2`, code; the handoff commits after it change only this note), with Vite at
`127.0.0.1:5199` and the teacher harness at `5188`, one driver at a time.

| Check | Result |
| --- | --- |
| `npm run test:platform` | 11,848 of 11,848 |
| `node --test tests/tools/*.test.mjs` | 1,709 pass, 0 fail, 1 skipped |
| `npm run lint` | pass (0 errors; warnings only, none in changed lines) |
| `npm run build` · `npm run build:firebase` | pass · pass; no tracked file rewritten |
| `node scripts/check-first-load-budget.mjs` | within baseline: **studentHome 851.3 KB** (baseline 847.1, limit 855.1; Batch 3 adds about 4 KB, as expected), signIn 291.3 KB. Baseline not edited |
| Grading sweep (`--base` worktree of `5062cba5`, `--draws 3 --check-wrong`) | exit 0: 0 right → wrong, 0 wrong → right, 0 near miss → right (269,994 verdicts) |
| Thousands probe (scratch, three trees) | see item 1: 0 wrong accepted; 36 SAT-box verdicts main accepts and this refuses (decision 1) |
| `test:rules` | 248 of 248 and 221 of 221 |
| `test:draft-persistence` | every certified family kept the work |
| `test:test-cycle-device` | all 12 device/stage combinations |
| `test:challenge-finish` · `test:canonical-persistence` | 477 · 35 |
| `test:secure-exam-navigation` · `test:grade-authority` · `test:secure-exam-auto-finalize` | 25 · 14 · 11 |
| testCycleRichToolQa | 490 checks, 0 findings (was 14 findings) |
| durableOutboxRecovery, composedDraftRestore, draftEditTime, errorRecovery, duplicateTabs, staleTabRecord, submitNotQueued (21 checks) | all pass |
| warmupReopenDraft, and `--family` | pass, pass |
| familyPinContainment, and `--slow` | 77 checks each, 0 findings |
| Teacher harness: draftCrossDeviceJourneys (42), recoveryDraftCrossDeviceJourneys (100), recoveryHoldJourneys (450), restoredDraftFocusRaceJourneys (164), submitAndFinishJourneys | all pass |
| `npm run certify:dark-mode` | pass on the real clock; pass at a faked 23:46 UTC (libfaketime on the runner and Chromium) |
| Real-App save-line probe (scratch) | 11 of 11 (item 2) |
| toolDraftSyncSweep (Batch 3 ran it; not in this gate's list) | **1 finding, pre-existing**: `[expressionMeaning] sweep could not run: locator.click: Timeout`. The same on the base `5062cba5` (served from a worktree on its own Vite). Not touched here |

## Not done

- `tests/browser/submitNotQueued.mjs` (Batch 3's real-engine driver) is in no CI workflow; it ran here.
- `toolDraftSyncSweep`'s expressionMeaning journey times out on the base too (gate table): for the integrator.
- A Step Algebra step and a replacement the device cannot queue still use toasts ("Step not queued", "Replacement not
  queued", `App.jsx` `handleStepGrade` and the new-problem handler). Those toasts sit under Work View. Not changed
  here.
- The per-answer draft merge stays on the first load (review N5): it is the draft-restore path, and a lazy import
  there could fail offline exactly when it is needed. W6-7 (`claude/pass3-first-load-2`) takes teacher-only code off
  the first load instead.
- Batch 3's own "left for later" list stands (client handoff): a Step Algebra step the device cannot queue still
  returns `null` to the solver; device clocks decide edit times; the rollout window drops `resetAt`.
