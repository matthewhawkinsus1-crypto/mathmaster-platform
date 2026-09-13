# The classroom Test Cycle

One teacher-authored assessment package. One student card. One recorded grade.
One Google Classroom grade item.

```
Review  ->  Secure Test  ->  Corrections (if needed)  ->  Secure Retest
```

## The rule everything else serves

```
recordedGrade = max(originalTestGrade, min(rawRetestGrade, 70))
```

It lives in exactly one place — `functions/shared/testCycleGrade.mjs` — and the
browser imports that same module through `src/platform/assessment/testCycle.js`.
The cap is applied to the RETEST CONTRIBUTION and then compared, not applied to
the comparison: `min(max(75, 92), 70)` would take five points off a student who
had already passed.

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
| CommonJS bridge + evidence join | `functions/lib/testCycle.js` |

Everything under `functions/shared/` is pure: no Firestore, no network, no
clock. That is what lets the browser and Cloud Functions share it and what makes
the whole policy unit-testable.

## There is no second testing engine

The Test and the Retest are ordinary `examSessions` documents with
`examType: "courseTest"`. They run through the same `startSecureExamSession`,
`issueSecureExamQuestion`, `saveSecureExamDraft`, `submitSecureExamResponse`,
`recordSecureExamIntegrityEvent`, `finalizeSecureExam` and `proctorExamAction`
as the SAT, ACT, TSIA2 and ASVAB simulations, and render in the same
`SecureExamContainer` with the same integrity logger, timer, autosave and
proctor lock.

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

## Corrections

Built automatically when a released Test scores below the passing threshold,
from that student's own evidence joined back to the blueprint slots. Each
correction target carries the instances it came from, practises on PARALLEL
families with the seen instances excluded, and completes only on successful
evidence. A misconception is named only when the evidence carried one;
otherwise the correction targets the missed standard rather than inventing a
diagnosis.

Corrections are instructional and non-secure — hints, three attempts, immediate
feedback — and cannot move a recorded grade. `TestCycleCorrections.jsx` imports
nothing from the secure runtime, and the grade rule has no correction input.

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

## Deploy

Functions changed, Firestore rules changed (three new server-only collections),
Hosting changed:

```
npm run build && npm run build:firebase
firebase deploy --only hosting,firestore:rules,functions
```
