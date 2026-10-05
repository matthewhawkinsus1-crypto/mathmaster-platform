# Secure assessment lifecycle — audit, fixes and QA (2026-10-05)

Scope: Review → secure Test → Corrections → secure Retest (the Test Cycle), the
shared secure exam runtime it runs on, and the assignment lifecycle around it
(create, edit, duplicate, preview, pause, archive, delete, release, grading).
Architecture reference: `TEST_CYCLE_ARCHITECTURE.md`.

## How it was investigated

Every claim below was reproduced before it was fixed. Server defects were
reproduced against the real Cloud Functions in the Firestore emulator
(`tests/integration/testCycleLifecycleSecurity.test.mjs`: each scenario was red
before its fix). Browser defects were reproduced in Chromium against the real
handlers (`tests/browser/testCycleLifecycleQa.mjs`), as a teacher and as
students, including bypass attempts made from the page.

## Findings

### Secure runtime (server)

| # | Severity | Finding |
| --- | --- | --- |
| S1 | P0 | An untimed exam expired the moment it started. `deadlineFor` read `timeLimitSeconds: null` as 0 seconds (`Number(null) === 0`), so every untimed course Test (and every TSIA2 session) refused its first question. |
| S2 | P0 | Review could be skipped: `finalizeSecureExam` on a never-started Test "submitted" it, which marked Review complete and moved the student to Corrections and a Retest. |
| S3 | P1 | A proctor "unlock" on a never-started session started it, bypassing the Review gate. |
| S4 | P1 | Only `startSecureExamSession` checked the course-test gate. A Retest the teacher closed, a reset Test, or an archived assessment kept issuing questions to an open session. |
| S5 | P1 | A submission id replayed by another student returned that student's session. |
| S6 | P1 | Record writes were read-modify-write without a transaction: concurrent student/teacher/corrections writes undid each other, and a double click could mint two Tests or Retests. |
| S7 | P1 | Release read the blueprint from the assignment only. A manifest-backed cycle built an empty correction plan marked "required": the failing student was stuck in Corrections with nothing to do and no Retest. |
| S8 | P1 | Releasing the same Test twice rebuilt the correction plan and wiped the student's progress. |
| S9 | P1 | Supersession treated an emptied stage as a wildcard, so a stale session could write over a reset. |
| S10 | P2 | Teacher actions could create a record for a student outside the assignment's audience. |
| S11 | P2 | Corrections promised three tries per question; the server did not enforce them. |
| S12 | P2 | The teacher's score for a course test was the mean of answered items, not the weighted score over the planned items. |
| S13 | P2 | The proctor list applied its 200-document limit to the whole collection before filtering, so a teacher's course tests could be missing. |

### Lifecycle and data safety

| # | Severity | Finding |
| --- | --- | --- |
| L1 | P0 | A Test Cycle authored in the app was saved without `assessmentPolicy`, `testBlueprint` or `secureTestReference`: it reached students as a Review with no secure Test. Editing an existing cycle dropped the same fields. |
| L2 | P1 | Delete was a client-side delete of the assignment that any teacher could perform, with no check for student evidence. |
| L3 | P1 | Archive and "scheduled" were cosmetic: archived and not-yet-released cycles could still be entered through the callables. There was no way to pause an assessment. |
| L4 | P1 | The retest policy (cap, passing score) and the contract were plain client-writable fields: changeable by any teacher, after results were released, with no audit. |
| L5 | P2 | Duplicating an assignment copied its archived state and history. |

### Student experience

| # | Severity | Finding |
| --- | --- | --- |
| U1 | P1 | The secure Test fell back to the Digital SAT policy in the browser: "Digital SAT Math · Reference sheet available", a 70-minute countdown on an untimed Test (the expected duration became a timer), and the SAT graphing calculator on every item. |
| U2 | P1 | A failed save was silent; a refresh restored an older server draft; Submit did not confirm or say what was unanswered; the answer being typed at Submit was not saved first. |
| U3 | P2 | Home and the Assignments Center listed a cycle as generic practice ("PRACTICE" chip, "if stopped now" grade, "Finished" after Review). A student could not tell Review required / Test unlocked / submitted / corrections / retest unlocked apart. Archived and paused items were listed as work. |
| U4 | P2 | An open card did not follow the server: Review finishing, results released, or a retest opening needed a reload. |
| U5 | P2 | Back during a secure exam left it; the Warm-Up and Pack-Up banners covered it. |
| U6 | P2 | A locked phase did not always say why, and a correction plan still being built showed an enabled button that did nothing. |

### Found by the browser QA run (after the fixes above)

| # | Severity | Finding |
| --- | --- | --- |
| Q1 | P1 | After "Release N Test results", a failing student's open card stayed on "Corrections being prepared" with a disabled button. Release writes the score and then the plan; the card's refresh key watched the stage but not the plan's size, so the second write never reloaded it. The same gap would have hidden a retest session opened after the stage already read Retest. |
| Q2 | P2 | Two card reloads in flight could land out of order, so an older answer could replace a newer one. |
| Q3 | P2 | Typing while an answer was being recorded autosaved a draft onto the already-submitted item and showed "Answer saved" over the next, empty question. |
| Q4 | P2 | Every unit-less secure-exam field label carried a stray comma ("Sum,"): `MathText` stringified an array of children (pre-existing). |
| Q5 | P3 | Corrections showed students the teacher's diagnosis, with standard codes ("Targeting the missed standard texas:A.3C; no specific error pattern was recorded"). |
| Q6 | P3 | The teacher preflight checklist rendered bullets in a column apart from centred text; a finished cycle still told the student "If you retest…". |

### Teacher experience

| # | Severity | Finding |
| --- | --- | --- |
| T1 | P1 | No results view for a cycle: results were only in the proctor monitor, one session at a time, with no class-wide release and no view of Review, Corrections or Retest progress. |
| T2 | P1 | "View as Student" played the stored Review as an ordinary lesson. A teacher could not see the card, a locked Test, Corrections, a capped Retest, or a single secure item. |
| T3 | P2 | The retest policy was invisible after creation, and there was no way to change it safely. |
| T4 | P2 | The gradebook's "Overall" for a cycle row was not the recorded (capped, never-lowered) grade. |
| T5 | P2 | A Test locked for proctor review (integrity threshold or teacher lock) read as "Testing now" on the results table; only the separate proctor monitor showed the student was stuck. |

## What changed

Server (`functions/index.js`, `functions/lib/secureExam.js`, `functions/shared/*`):

- S1–S13 fixed: `timeLimitSecondsOf`; finalize refuses `not_started`; unlock and
  lock only from the states they apply to; every secure issue re-checks the
  course-test gate (`assertCourseTestEntryAllowed`); markers are bound to the
  student; `mutateTestCycleRecord` makes every record change one transaction
  (plans and sessions written inside it); release resolves the blueprint
  through `resolveSecureTestBlueprint`, is idempotent, and a target-less plan
  does not gate the Retest; supersession is exact; audience checks;
  `CORRECTION_ATTEMPTS_PER_QUESTION`; weighted planned score; the proctor list
  also queries the teacher's own classes.
- Availability (`assessmentAvailability.mjs`): archived, paused and scheduled
  close the Test, Retest and Corrections on the server; the card says so and
  keeps released results readable. A due date never locks.
- Configurable grade rule within the never-lower guarantee:
  `replaceIfHigherCapped` (default) or `averageIfHigherCapped`, cap and passing
  score. District example 54 → 86 raw → 70 cap → 70 recorded, explained in
  words to teachers and students by `describeTestCycleGradePolicy`.
- New callables: `releaseTestCycleResults`, `updateTestCyclePolicy` (locks once
  used, audited), `previewTestCycleSecureItems` / `gradeTestCyclePreviewItem`
  (write nothing), `getAssignmentEvidenceSummary`, `manageAssignmentLifecycle`
  (archive / unarchive / pause / resume / delete only without evidence, with a
  deletion log), `attachTestCycleContract`.
- Rules: the contract and lifecycle fields are server-owned; only a root admin
  deletes an assignment document; `assignmentDeletionLog` is server-only.

Browser:

- L1: the contract travels on create and edit (`testCycleContractFields`,
  `planTestCycleContractEdit`), and an edit that would strip the policy is
  refused. Duplicates start clean.
- U1–U6: a `courseTest` exam policy (own title, no SAT sheet, blueprint
  calculator, documented calculator accommodation honoured); the header shows
  only the server's deadline; start screen states timing, one attempt,
  autosave and calculator; save indicator with device backup, retry on
  reconnect, save-before-submit, submit confirmation; Back and banners stand
  down during an exam; stage-aware discovery (`testCycleDiscovery.js`) with a
  per-device "New" marker and a toast on a stage change; the card reloads
  whenever the live projection changes (`buildTestCycleCardRefreshKey`).
- T1–T5: the results panel (`TestCycleControls`) with where every audience
  student is — a locked Test first, as "Needs attention", with Unlock on the
  row — original / raw / capped / recorded grades and the reason, one
  release button, only the overrides that apply to each student, the policy in
  words with an editor that shows its locks; the preview (`TestCyclePreview`)
  of every student stage at phone, iPad and Chromebook widths with real secure
  items; delete shows the evidence and offers Archive; Pause / Resume; the
  gradebook's Overall is the canonical recorded grade.

Fixes for Q1–Q6: one shared `buildTestCycleCardRefreshKey` (App and the QA
page) covering every projection field the card depends on; only the newest
card load applies; answer inputs are read-only while recording;
`mathTextFromChildren`; `describeCorrectionTargetForStudent`; layout and copy.

## Tests

- `tests/platform/assessmentLifecycleRules.test.mjs` (new, 23 tests): the pure
  rules — deadlines, the course-test policy, availability, both grade rules and
  the fallback, stage ordering, phase reasons, discovery labels, contract
  edits, teacher row actions, preview scenarios, the card refresh key, and the
  student wording of a correction, and the "Needs attention" row.
  Key assertions were mutation-checked (removing the never-lower `max`, the
  boolean time-limit guard, the retest-disabled ordering, and fields of the
  refresh key each turn a test red).
- `tests/integration/testCycleLifecycleSecurity.test.mjs` (new, 21 scenarios)
  against the real handlers in the emulator, including a class-wide release of
  a failed Test reaching Corrections and a locked Test flagged for the teacher.
- `tests/platform/noRawSlashFractionOnStudentSurface.test.mjs`: MathText reads
  children built in pieces without a stray comma.
- `tests/firestore-rules.test.mjs`: teacher delete is now refused; contract and
  lifecycle fields pinned (9 new cases).
- Source contracts rewritten per `SOURCE_CONTRACT_PLAYBOOK.md` where the code
  they described moved; rewritten assertions mutation-checked.
- `tests/browser/testCycleLifecycleQa.mjs` (new QA tool, not a CI gate).

## Browser QA

`node tests/browser/testCycleLifecycleQa.mjs` runs the production components in
Chromium (student card, secure exam container and player, corrections, the
teacher results panel and preview) with every callable posted to the REAL
handlers against the Firestore emulator, under each page's identity. Final run:
**67 checks passed, 0 findings.** What it walks through:

1. **Student, before Review.** The card says the Test is locked and how to
   unlock it, that the Test is untimed, and the retest policy.
2. **Bypass attempts from the page.** Starting the Test before Review and
   "submitting" the unopened Test are both refused by the server.
3. **Review lands** (written the way ingestion writes it). The open card turns
   to "Test unlocked" without a reload.
4. **Secure Test.** The start screen says untimed and is not the SAT; the header
   shows "Untimed" with no countdown; answers save; offline is reported ("kept on
   this device"); a reload restores the typed answer and offers Resume; Submit
   asks first and counts unanswered questions; the label reads "Sum" (no comma).
5. **Before release** the card reads the same as for a passing student: no
   score, nothing "required".
6. **Teacher** releases the class with one button; the student's open card moves
   to Corrections with the reason (40% against 70% passing).
7. **Corrections.** A wrong answer keeps the question with tries left; the
   reason is in a student's words; finishing opens the Retest.
8. **Retest and its release.** 40 → 84 raw → recorded 70 at the cap, shown to the
   student and the teacher; the cap can no longer be changed.
9. **Teacher preview.** Every stage (Review, Test unlocked, Corrections, Retest
   graded, Not open yet, Paused) and a real secure item graded by the real
   grader — with no exam session created.
10. **Devices and themes.** Card and secure question at Chromebook 1366, iPad 820
    and phone 390, light and dark: no sideways scroll, the action on screen, and
    every visible button at least 4.5:1 (3:1 when disabled).
11. **Needs attention.** A locked Test appears first on the teacher's table and
    Unlock on the row lets the student continue.

Also run: `npm run test:test-cycle-device` (12 device/stage combinations pass).

## Remaining risks and deferred work

- **The blueprint is readable by students.** A cycle that embeds
  `testBlueprint` on the assignment exposes family ids, standards and DOK to a
  student who reads the assignment document. It contains no questions or
  answers, but the stronger shape is the server-only manifest
  (`secureTestReference`). Moving every saved blueprint into
  `secureTestManifests` at save time needs a migration of existing cycles, so
  it is deferred.
- **Other assignment fields stay teacher-writable.** Only the contract and
  lifecycle fields are pinned to the server; titles, sections and dates are
  still written by any teacher client, as before.
- **Accommodations.** Reduced-item and extended-time accommodations are not
  applied to secure course tests (the blueprint's equivalence policy forbids a
  different test). Documented calculator accommodations are.
- **Secure player.** Text and choice responses only; rich math tools are not
  available inside a secure item.
- **No server auto-finalize** for an expired timed session; it is finalized the
  next time the student or teacher touches it.
- **Evidence check scope.** Delete's evidence check covers audience classes,
  records and sessions; it does not scan every grade document in the district.
- **Exports.** There is no Skyward export (TEAMS CSV only); Grade Transfer
  finality needs a due date. Home's "Export PDF" still exists for cycles.
- **Client-reported support usage** (calculator opened) is trusted as reported.
- **The teacher results panel** refreshes on demand (Refresh button), not live.

## Deploy

Functions, rules and Hosting all changed. Functions must be live before the
rules (see `TEST_CYCLE_ARCHITECTURE.md`, "Deploy"); use
`node scripts/release-firebase.mjs`.
