# The classroom Test Cycle

One teacher-authored assessment package. One student card. One recorded grade.
One Google Classroom grade item.

```
Review  ->  Secure Test  ->  Corrections (if needed)  ->  Secure Retest
```

## Contract and legacy failure boundary

`assessmentPolicy.mode: "testCycle"` is the canonical declaration. The secure
Test is resolvable either from the assignment's answer-free `testBlueprint` or
from an opaque `secureTestReference` whose manifest is stored in the
server-only `secureTestManifests` collection. Titles and student instructions
are never declarations and never provision a Test.

The Review-only incident was possible because V5 Preflight validated sections
and questions but invoked Test Cycle validation only when `assessmentPolicy`
already existed. At runtime the same narrow predicate routed an assignment
carrying the older V5 Test-template signature (`gradingPurpose: "test"`,
`rolePolicy`, and Review) into the ordinary assignment runner. Review therefore
looked complete even though no secure phase could resolve.

The compatibility boundary now recognizes that structural legacy signature
only to fail closed: Preflight emits `TEST_CYCLE_TEST_PHASE_MISSING` (and a
missing-policy diagnostic), the student router sends the item through the
server-authoritative Test Cycle entry point, and the server records a
structured contract diagnostic while returning a student-safe unavailable
message. It never manufactures a Test from prose or marks Review as cycle
completion.

An opaque reference being present is not the same as it resolving. Pure V5
inspection reports `secureReferencePresent` but leaves
`secureReferenceResolved` and `testResolvable` false. Before the browser saves
or assigns a Test Cycle, `preflightTestCycleCandidate` loads the referenced
`secureTestManifests/{id}` document and validates the resulting blueprint with
the same family/private-grading gate used for session creation. A missing or
invalid document blocks with `TEST_CYCLE_SECURE_MANIFEST_NOT_FOUND`. The Google
Classroom publisher repeats this authoritative gate, so an alternate publishing
route cannot bypass it. Ordinary assignments make neither Test Cycle call.

Every card receives a question-free four-phase status strip from the same
shared stage module used by Functions. It can explain a lock and announce a
ready Test, but it cannot grant entry: `startSecureExamSession` still resolves
the persisted record and Review progress on the server before loading any
secure question.

Teacher Assignment Preflight uses that same shared phase projection for “See
it as a student.” Its Review-complete simulation is component-only preview
state: it writes no grade, Test Cycle record, secure session, or browser draft,
and it never resolves or loads secure questions.

## The rule everything else serves

```
recordedGrade = max(originalTestGrade, retestContribution)

replaceIfHigherCapped (default):  retestContribution = min(rawRetest, cap)
averageIfHigherCapped:            retestContribution = min(round((original + rawRetest) / 2), cap)
```

`cap` is `assessmentPolicy.retest.maxRecordedGrade` (70 by default) and the
rule is `assessmentPolicy.retest.gradeReplacement`. The district example —
original 54, raw retest 86, cap 70 — records 70 under the default rule and
`round((54 + 86) / 2) = 70` under averaging. Whatever the rule, the outer `max`
stays: there is deliberately no "always replace" option, and an unknown rule
normalizes to the default, so no configuration can lower a grade.

It lives in exactly one place — `functions/shared/testCycleGrade.mjs` — and the
browser imports that same module through `src/platform/assessment/testCycle.js`.
The cap is applied to the RETEST CONTRIBUTION and then compared, not applied to
the comparison: `min(max(75, 92), 70)` would take five points off a student who
had already passed. `describeTestCycleGradePolicy(policy)` turns the stored
policy into the sentence teachers and students see, with the worked example, so
the explanation can never drift from the rule.

A teacher changes the passing score, cap, rule, and whether Review and
Corrections are required through `updateTestCyclePolicy`. A setting LOCKS once
it has been used: the passing score once any Test result is released, the cap
and rule once any retest result is released. Every change is appended to
`assessmentPolicyHistory`.

The raw retest score is never destroyed. The record keeps the original Test
score, the raw retest score, the capped contribution, the recorded grade, and an
audit row per release.

## Where the code is

| Concern | Module |
| --- | --- |
| Policy, defaults, teacher overrides | `functions/shared/testCyclePolicy.mjs` |
| The capped grade rule + Classroom decision | `functions/shared/testCycleGrade.mjs` |
| The canonical per-student record | `functions/shared/testCycleRecord.mjs` |
| One card, one stage | `functions/shared/testCycleStages.mjs` |
| Blueprint contract + family coverage | `functions/shared/testCycleBlueprint.mjs` |
| Deterministic secure issuance plan | `functions/shared/testCycleIssuance.mjs` |
| Corrections from failed evidence | `functions/shared/testCycleCorrections.mjs` |
| Retest 70/30 targeting | `functions/shared/testCycleRetest.mjs` |
| Publication preflight | `functions/shared/testCyclePreflight.mjs` |
| Open / scheduled / paused / archived | `functions/shared/assessmentAvailability.mjs` |
| CommonJS bridge + evidence join | `functions/lib/testCycle.js` |
| Student list labels ("Review required", "Retest unlocked"…) | `src/platform/student/testCycleDiscovery.js` |
| Teacher row states and the actions that apply now | `src/platform/teacher/testCycleTeacherRows.js` |
| Teacher preview of every student stage | `src/platform/teacher/testCyclePreviewModel.js` |
| What an edit does to a saved cycle's contract | `src/platform/assessment/testCycleContractEdit.js` |
| What each mode may do for the student (Test, Retest, Corrections, …) | `functions/shared/questionRuntimePolicy.mjs` |
| Which Rich Tools may run securely, and on which devices | `functions/shared/secureToolCertification.mjs` |
| One secure item: public payload, grading, stored form | `functions/lib/secureItems.js`, `functions/lib/secureItemStorage.js` |
| The shared question runtime every secure surface renders | `src/components/question/RichQuestionRuntime.jsx` |

Everything under `functions/shared/` is pure: no Firestore, no network, no
clock. That is what lets the browser and Cloud Functions share it and what makes
the whole policy unit-testable.

## There is no second testing engine

The Test and the Retest are ordinary `examSessions` documents with
`examType: "courseTest"`. They run through the same `startSecureExamSession`,
`issueSecureExamQuestion`, `saveSecureExamDraft`, `submitSecureExamResponse`,
`recordSecureExamIntegrityEvent`, `finalizeSecureExam` and `proctorExamAction`
as the SAT, ACT, TSIA2 and ASVAB simulations, and render in the same
`SecureExamContainer` with the same integrity logger, autosave and proctor
lock.

A course Test is UNTIMED unless its blueprint sets a positive
`timeLimitSeconds`. `deadlineFor` used to read a missing limit as zero, so an
untimed Test expired the instant it started and every answer was refused;
`timeLimitSecondsOf` now treats null, missing, zero, booleans and junk as
untimed, and the browser shows only the server's `expiresAt` — it never invents
a deadline, and an expected duration is never a timer. Answers are autosaved to
the server and mirrored to the device (`mm-secure-draft:*`, cleared on submit)
so going offline or reloading loses nothing; the screen says whether the answer
is saved, offline, or not saved yet, and Submit asks first, naming unanswered
questions.

`courseTest` is deliberately NOT in `EXAM_POLICIES`. Those four entries are
published exam specifications with fixed question counts and timings; a course
test gets both from its blueprint. `policyFor("courseTest")` returning null is
what stops the simulation-creating callable from handing a course test SAT
timings.

## No live AI during secure delivery

At assignment time the server builds a deterministic issuance plan — which
approved family fills which blueprint slot, with which generator seed — and
stores it on the session BEFORE the student can start. Issuance then looks up
the next plan entry and instantiates that already-approved family.

`planRequiresLiveGeneration(plan)` is the assertion in function form, and
preflight refuses to publish a blueprint whose slots cannot all be filled. AI
may help author families before publication; that finishes before anyone sits
down.

The plan is stripped from every client payload by `publicSession` — teacher
payloads included — because a family plus a seed reproduces the question.

## Rich Tools are first-class on the secure Test

A Test, Retest, Correction or preview item is rendered by the shared Rich
Question Runtime — the real Graphing, Systems, Step Algebra, Number Line,
Mapping, Data Modeling, Regression and Function Investigation tools in
QuestionEngine for a tool item, the secure response fields otherwise — under
the capability policy of its mode, which the server stamps on the payload
(`runtimeMode`). The secure modes keep every response tool and remove every
assistance capability; the server strips assistance keys from the payload,
forces assessment settings, grades the raw construction with the tool's Path
Tool Contract grader, and withholds the verdict until release. Preflight
refuses a family whose tool is not certified, or whose tool differs from the
one its target requires; a Retest keeps each target's tool. Full design:
`docs/architecture/secure-rich-question-runtime.md`.

## Corrections

Built automatically when a released Test scores below the passing threshold,
from that student's own evidence joined back to the blueprint slots. Each
correction target carries the instances it came from, practises on PARALLEL
families with the seen instances excluded, and completes only on successful
evidence. A misconception is named only when the evidence carried one;
otherwise the correction targets the missed standard rather than inventing a
diagnosis.

Corrections are instructional and non-secure — hints from the second miss,
the item's own feedback, three attempts per question (enforced by the server:
`CORRECTION_ATTEMPTS_PER_QUESTION`), immediate feedback, the worked review once
an item closes — and cannot move a recorded grade. A missed graphing item is
corrected on the Graphing tool: the item renders in the shared runtime in
`corrections` mode. `TestCycleCorrections.jsx` imports nothing from the secure
runtime, and the grade rule has no correction input.

## Retest

Roughly 70% targeted weak skills, roughly 30% anchor coverage from the rest of
the original blueprint. When the blueprint declares anchors and the retest is
longer than one question, at least one anchor slot is always allocated — that is
what stops a student replacing a comprehensive Test grade by passing three
questions about one narrow skill.

Every retest target inherits the ORIGINAL target's DOK, difficulty band,
representation, tool and weight. The retest chooses WHICH standards to re-ask;
it cannot make any of them easier.

## Google Classroom

The secure release path writes `grades/{studentId}.testCycleGrades[assignmentId]`
— a projection of the canonical record — which wakes `syncGradeToClassroom`.
That trigger posts the recorded grade to the ONE whole-assignment publication,
updates the same item when a retest raises it, refuses any split section
publication, and refuses to lower a grade already posted.

## Security boundary

Monitored web delivery, not an OS lockdown browser. Full screen is requested;
tab switches, blur, fullscreen exits, copy/paste, context menu and restricted
shortcuts are logged; the session locks for proctor review at the integrity
threshold and only an authenticated teacher can unlock it. The architecture
stays compatible with a managed-Chromebook kiosk deployment later, but nothing
in the product claims the browser is OS-locked.

## Availability and the assignment lifecycle

`resolveAssessmentAvailability({ assignment, now })` decides whether a cycle is
open: `archived`, `unpublished` (paused by the teacher), and a future
`releaseAt` close it; a due date does not (late work is a teacher decision, not
a lock). The server checks it before issuing a secure question, assigning
sessions, issuing a correction, or opening a retest. The card overlays it with
`applyAssessmentAvailability`, so a student keeps their stage, sees "Opens
later" / "Paused by your teacher" / "Archived", and can still read results that
were already released.

`manageAssignmentLifecycle` is the only way to archive, unarchive, pause,
resume, or delete. Delete is offered only when `getAssignmentEvidenceSummary`
finds no evidence (no started session, no submission, no released grade); it
then removes unstarted sessions, records, plans and the `testCycleGrades`
projections, and writes `assignmentDeletionLog`. Anything with evidence is
archived instead. The rules pin these fields and the cycle's contract
(`assessmentPolicy`, `testBlueprint`, `secureTestReference`) to the server, and
only a root admin may delete an assignment document directly.

## What a teacher sees

- **Results, release & retests** (`TestCycleControls`, from the assignment
  card, the Hub, and Secure Exams): every student in the audience with where
  they are — Review, Test, Corrections, Retest — the original, raw retest,
  capped and recorded grades with the reason, one "Release N results" action,
  and only the overrides that apply to that student now. A Test locked for
  proctor review is read from the live session and listed first as "Needs
  attention", with Unlock on the row.
- **Preview** (`TestCyclePreview`): every student stage built from the
  assignment's real policy and blueprint through the same shared modules, at
  phone, iPad and Chromebook widths, plus real secure items — Rich Tools
  included, in the same runtime and under the same Secure Test, Retest or
  Corrections policy a student gets — drawn and graded by
  `previewTestCycleSecureItems` / `gradeTestCyclePreviewItem`. Preview writes
  nothing: no session, record, grade or draft (the emulator suites assert it),
  and its device drafts are cleared on every draw and on close.

## External originals and mastery-gated Review

A policy with `externalAssessment` (the district DOL) has no MathMaster Test:
the teacher enters each student's original score from another system when
opening sessions, only scores below passing open a session, and that one
secure session — the record's `test` — is the RETEST (no corrections). A
policy with `review.minimumMastery` gates the secure session on weighted
Review mastery from exact server credit, not on answering. The lifecycle
surfaces follow both: the card, the student list (`testCycleDiscovery.js`),
the teacher rows, the preview scenarios and the policy locks (cap and rule
lock once that retest is released; the passing score once sessions open)
speak of a retest and of the mastery bar where they apply.

## Callables added by the lifecycle work

| Callable | Who | What |
| --- | --- | --- |
| `releaseTestCycleResults` | teacher of record | Release every submitted Test or retest (or listed students); idempotent |
| `updateTestCyclePolicy` | teacher of record | Passing score, cap, rule, Review/Corrections required; locks once used |
| `previewTestCycleSecureItems` | teacher | Draw real secure items for preview; writes nothing |
| `gradeTestCyclePreviewItem` | teacher | Grade a preview item; writes nothing |
| `getAssignmentEvidenceSummary` | teacher | Whether deletion is safe, and why not |
| `manageAssignmentLifecycle` | teacher | archive / unarchive / unpublish / publish / delete |
| `attachTestCycleContract` | teacher of record | Attach or replace the contract before any session exists |

## Testing

- `tests/platform/assessmentLifecycleRules.test.mjs` — the pure rules.
- `tests/integration/testCycleLifecycleSecurity.test.mjs` — the real handlers
  against the emulator, adversarially: skipping Review, finalizing an unopened
  Test, replaying markers, students calling teacher callables, archived and
  scheduled cycles, policy locks, preview writing nothing, delete vs archive.
- `tests/platform/secureRichToolMatrix.test.mjs` — every certified Rich Tool,
  issued, public in every mode, answered from public data, graded, stored.
- `tests/integration/testCycleRichToolCertification.test.mjs` — a seven-tool
  Rich Tool Test Cycle through the real handlers: preflight, Test, release,
  review, Corrections, Retest, preview.
- `node tests/browser/testCycleRichToolQa.mjs` — QA tool: every bank Rich Tool
  in the real secure container at Chromebook, iPad and phone, light and dark,
  with an interaction, autosave, reload and submit.
- `node tests/browser/testCycleLifecycleQa.mjs` — a QA tool, not a CI gate:
  real components in Chromium against the real handlers, as a teacher and as
  students, through Review → Test → release → Corrections → Retest → capped
  grade, plus the preview and layout/contrast audits at phone, iPad and
  Chromebook widths in light and dark.

## Deploy

Functions changed, Firestore rules changed, Hosting changed. Use the release
script, which deploys functions, then rules, then Hosting through the resilient
wrapper (see `AGENTS.md`):

```
npm run build && npm run build:firebase
node scripts/release-firebase.mjs            # the plan
node scripts/release-firebase.mjs --execute
```

Order matters for the lifecycle work: the new rules refuse the direct
`archived` toggle and teacher deletes that the previous Hosting build made, so
the new functions must be live before the rules. Between the rules step and the
Hosting step, a teacher on an old tab who archives or deletes gets a permission
error; reloading picks up the new build.
