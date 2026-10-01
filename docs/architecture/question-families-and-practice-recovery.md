# Question Families, student-specific generation, and Practice-based Recovery

This document describes the architecture introduced with the Question Family
engine. It covers what a family is, how each student gets their own question
and keeps it, how the server grades it, what Pre-Flight checks, and how
Practice-based Warm-Up/DOL Recovery works.

The older teacher-driven DOL controls (reopen a window, grant an attempt) are
described in [assessment-recovery-and-grade-resolution.md](assessment-recovery-and-grade-resolution.md).
They are unchanged. In this document "Recovery" always means the new
Practice-based Recovery.

## 1. Why a new engine

Legacy generation (`src/problemGenerator.js`) seeds a PRNG from
`assignmentId|student|storageIndex|variant:n` and returns whatever comes out.
The audit (in the PR description) found that design behind most of the
"students got the same question" reports:

* There was no notion of two instances being the same question. Independent
  hashing produces birthday collisions: 28 students and 72 possible questions
  is about a 99.5% chance of at least one repeat.
* There was no capacity number, so Pre-Flight could not warn.
* Validation happened implicitly, or not at all.
* The browser was the only place the instance existed, so the server could
  never re-grade it and had to trust the browser's verdict.

The engine is **opt-in per question** through a `questionFamily` block. A
question without one goes through the legacy path byte-for-byte unchanged.
`tests/platform/questionFamilyGeneration.test.mjs` pins golden hashes produced
on `main`.

## 2. The family contract (`functions/shared/questionFamilyContract.mjs`)

A family is pure data plus pure functions, and it lives in `functions/shared`
so that the browser, Cloud Functions and tests run the same bytes:

| Part | Meaning |
| --- | --- |
| `id`, `version` | Stable identity. A delivered question pins both. An unpinned reference means v1, so shipping v2 never moves a live question. |
| `skill`, `difficulty` | What is assessed and at what rigor. Recovery equivalence reads these. |
| `constraints` | The knobs an assignment may turn: ranges, variable letter. Each has a default and hard bounds. Out-of-bounds requests fall back to the default and are reported. |
| `parameters` | **Finite** domains, so capacity is countable. |
| `derive`, `rules` | Derived values, plus the issue codes an instance violates. Built-in rules include divide by zero, unintended decimals or fractions, a degenerate, parallel or coincident system, a duplicate root, and a feature outside the window. |
| `fingerprint` | The normalized mathematical identity. It ignores presentation: equation order in a system, a scaled equation, and answer-choice order. |
| `answer` | Computed from the same values as the prompt, so a key cannot disagree with its question. |
| `tools` | One builder per rendering tool. **Builders write questions only**: no steps, hints or solutions, and no tool is made more revealing. |
| `graphWindow` | Validated to contain every feature the student must find. |
| `recovery` | Whether the family may back Recovery, and its equivalence group (coverage key). |

The platform families live in `questionFamiliesLinear.mjs`,
`questionFamiliesSystems.mjs` and `questionFamiliesNonlinear.mjs`. They are
registered in `questionFamilyRegistry.mjs`, and the authoring contract lists
them from that live registry.

**Assignment-local families** (`questionFamilyTemplate.mjs`) adapt an authored
`generator` template (parameters, derived values, constraints and
`{{placeholders}}`) to the same contract under the id `local:<slotKey>`.
Opting in is `"questionFamily": { "scope": "assignment" }`.

## 3. The engine (`questionFamilyEngine.mjs`)

* Parameter domains form a mixed-radix space of size N.
* A seeded 4-round Feistel network with cycle walking is a **bijection** on
  `[0, N)`. Walking it and keeping only valid instances with unseen
  fingerprints yields the distinct instance list `D[0], D[1], ...` for one
  slot. The seed is the slot key.
* `measureFamilyCapacity` counts distinct valid instances exactly for small
  spaces and estimates them under a budget for large ones.
* `buildFamilyQuestion` merges the instance into the authored slot. Identity
  fields win (id, questionId, role, alignments, and an authored CCMR
  `familyId`). The engine identity travels in `familyInstance`.

## 4. Identity, uniqueness, and persistence

**Slot key.** The slot key is `${assignmentId}|${questionId}`. It uses the
question's immutable id, not its position, so a duplicated or reordered
question does not move anyone's question.

**Seats** (`questionGenerationIdentity.mjs`):

* The teacher app's reconciler (`src/platform/generation/generationSeatReconciler.js`)
  appends seats to `assignment.generationSeats.byClassId[classId]`. Seats are
  keyed by an **opaque learner token** (`lt` plus 16 hex characters, a
  one-way hash of assignment and student). No student id is written.
* Seats are append-only and computed deterministically, so two teacher tabs
  write the same thing.
* A student who isn't seated yet gets a **provisional** seat above the class's
  seats.

**Allocation.** `index = seat + variant × stride`, where stride is the class's
seat count (at most 64). Classmates' variant 0 instances are therefore
pairwise distinct, and "New Question" (variant 1) lands on an index no
classmate holds. When a class is larger than the family's capacity, indices
wrap. The delivery records `wrapped: true`, and Pre-Flight warned beforehand.
Shared sections deliberately give everyone seat 0 and say so
(`basis: 'shared'`).

**Delivery pins.** Every family delivery carries a pin: family id and version,
slot, variant, index, seat, stride, basis and fingerprint. It is resolved in
this order:

1. the canonical record's `familyDelivery` (written by ingestion);
2. this device's localStorage pin (from before the first answer reaches the
   server);
3. a fresh allocation.

A pin is only used for the variant it was written for. Replaying a pin
re-checks the fingerprint, so an edited family reports `pin_mismatch` instead
of silently swapping the question. A reload, a second device, or the teacher
later seating a provisional student all show the same question.

**Server grading** (`questionFamilyGrading.mjs`, `submissionIngestion.mjs`):

* The attempt envelope carries the pin. Ingestion rebuilds the instance and
  marks the raw response with the shared contract (`gradeOrdinaryResponse`,
  plus a verified Step Algebra final answer).
* The browser's verdict is discarded for those questions. A seat mismatch is
  recorded for diagnostics but never refuses work.
* A family template is never marked against its own fields:
  `serverGradingSupport` returns `family-template`.

## 5. Pre-Flight (`src/platform/preflight/questionGenerationPreflight.js`)

Pre-Flight runs inside `buildAssignmentV5PreflightModel` and appears in the
Pre-Flight modal's "Question versions and Recovery" panel. It checks:

* **Family resolution.** A reference that cannot generate is blocking on
  every import and publish path, because `validateQuestionSemantics` judges a
  family slot by a generated preview instead of the template.
* **Answer key.** A sample of instances per slot is graded with its own key
  through the server contract.
* **Tool compatibility and constraint fallbacks.**
* **Capacity against class size.** Class size comes from the roster, or a
  reference of 32.
* **A "different versions" DOL with questions that cannot vary.**
* **Recovery readiness**, with messages such as "Recovery generation
  unavailable: DOL Q3 does not reference a generator-backed Question Family."
  A section that never opted in gets a note instead of a warning.
* **A Live Challenge Warm-Up**, which is reported as such.

The section-mode dropdown now falls back to `personalized`, which is what the
runtime and the save path have always used.

## 6. Practice-based Recovery

All decision logic is pure and shared, and the browser and the server call
the same functions.

| Module | Role |
| --- | --- |
| `recoveryPolicy.mjs` | Defaults and per-assignment overrides (`gradingPolicy.recovery`), all bounded. |
| `practiceMastery.mjs` | The gate: the most recent window of **unique** Practice items, counting **independent** answers given before any solution was shown, with **skill coverage**. |
| `sectionRecoveryEligibility.mjs` | Original-opportunity resolution from the existing deadline rules, plus the state machine `hidden → unavailable / notNeeded / locked → unlocked → inProgress → completed`. |
| `sectionRecoveryReadiness.mjs` | Whether each Warm-Up/DOL question can back a fresh, server-gradable Recovery. |
| `sectionRecoveryPlan.mjs` | Practice items and the Recovery assessment as **pins**, on recovery-specific slot keys, excluding every fingerprint the student has seen. |
| `sectionRecoveryRecord.mjs` | The record and its transitions. History is append-only. |
| `sectionRecoveryService.mjs` | Context building and actions (`status`, `practice`, `unlock`, `start`, `submit`). |
| `sectionRecoveryGrade.mjs` | `final = max(original, min(recovery, cap))`. An excused make-up has cap 100. The cap is frozen on the record at start. |
| `sectionRecoveryProjection.mjs` | Folds a completed Recovery into the **existing** grade calculation. |
| `recoveryAttendance.mjs` | The absence hook. Only an explicit teacher "excused" mark for the original day counts. |
| `warmupDelivery.mjs` | Detects a Warm-Up delivered by Live Challenge. |

Policy defaults:

* Mastery: 7 correct of the last 8 unique items within 21 days, with skill
  coverage required.
* Warm-Up Recovery: 3 questions, counted up to 85%.
* DOL Recovery: counted up to 90%.
* An excused make-up still requires mastery by default (configurable).
* One automatic opportunity.
* **Open until the assignment's final submission date.** The Recovery end date
  is the same per-student cutoff after which no work earns credit, including
  an attendance extension or individualized extra time. The panel says "Open
  until …". After the end date a Recovery never started stops being offered.
  One started but not submitted is closed, and the original score stands.
  A Recovery submitted in time keeps its result. Every change after the end
  date is refused (`recovery-window-ended`). An assignment with no final date
  has no end date.

**Flow.**

1. Nothing appears while the original is still available.
2. After it closes, the student's Assignment Result screen shows the Recovery
   panel: Locked or Unlocked, with Practice Mastery as a percentage.
3. Each Practice answer goes to the `advanceSectionRecovery` callable. The
   server rebuilds the instance from its pin and marks it. Mastery unlocks
   Recovery in the same write.
4. Start makes the server build and pin the fresh plan: one instance per DOL
   question, or 2–3 instances for a Warm-Up. The same family, constraints and
   tool are used, and the student has seen none of them.
5. Answers are saved locally and can be changed until the student submits.
   The server then marks every item from its pin.

Step tools keep the original section's rules. Rejected Step Algebra moves
spend tries through the same `recordQuestionStep` bookkeeping and the same
per-section limits the assignment player uses; a DOL keeps its single try. So
a Recovery is never more forgiving, or more revealing, than the original. An
item whose tries run out counts as incorrect in the assessment. In Practice it
is recorded as an incorrect item (a forfeit): it never blocks the next
question, and it is never a free skip.

**Grades.**

* There is no separate gradebook. The recovered section's questions are
  credited at the recorded score at read time, so weights, denominators and
  other sections are unchanged.
* Precedence: assignment-level override > Recovery > Live Challenge Warm-Up
  result > per-question overrides. Per-question overrides shape the original
  that the Recovery is compared against.
* The same projection drives the student Grade Center, the teacher gradebook,
  Grade Transfer (TEAMS export), parent contact summaries and both Classroom
  passback triggers. The triggers wake only when a completed Recovery or a
  Live Challenge result changes.

**Data and security.**

* The record is stored at
  `grades/{studentId}.sectionRecoveryByAssignment[assignmentId][section]`.
* It is written only by the callable. Rules pin it, and the Live Challenge
  credit field, against client writes.
* The teacher sees Original, Recovery, Final, the type and the unlocking
  evidence in the gradebook's student detail. Recovered sections show an "R"
  marker in the table.

**Live Challenge.**

* **The Live Challenge result is the Warm-Up grade**
  (`warmupChallengeGrade.mjs`).
  * The score is rounds correct out of the rounds the student could play. A
    late arrival is measured only on rounds they were there for. Challenge
    points, speed and rewards never count.
  * It credits the Warm-Up questions through the same projection as a
    Recovery. The recorded score is the higher of it and any authored
    Warm-Up work.
  * A student who played but has no tracker yet still gets the grade.
  * A student who never joined has no result: like any missed Warm-Up, the
    teacher reconciles the absence.
  * The teacher gradebook marks these Warm-Up cells "LC" and shows the rounds
    in the student detail.
* A Warm-Up delivered by Live Challenge (or a pending teacher choice) never
  produces a Warm-Up Recovery.
* Gameplay, scoring and rewards are untouched. The result is written only by
  the server's match finalization (`writeWarmupCreditFromResult`).

## 7. Compatibility and what remains legacy

* Questions without `questionFamily` behave exactly as before. This includes
  `generator` templates that have not opted in, `variants[]` and static
  questions.
* The authoring compiler passes `questionFamily` through.
* Representative content:
  * `SAMPLE_QUESTION_FAMILY_RECOVERY.json` is fully family-backed and passes
    Pre-Flight with both Recoveries ready.
  * The Lesson 1 ALEKS bridge's interval template is opted in.
* Everything else in `teacher-import-jsons/` and the stored library remains
  legacy until it is migrated question by question. Pre-Flight shows which
  questions block Recovery.
