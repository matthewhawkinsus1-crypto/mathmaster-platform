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
`questionFamiliesSystems.mjs`, `questionFamiliesNonlinear.mjs` and
`questionFamiliesRepresentations.mjs`. They are registered in
`questionFamilyRegistry.mjs`, and the authoring contract lists them from that
live registry.

**Representation families** (`questionFamiliesRepresentations.mjs`) back the
rich representation tools:

* `linear.multipleRepresentations` builds the Multiple Representations board
  (`representationBridge`, mode `linearMultipleRepresentations`). A slot's
  `constraints.given` chooses the GIVEN (`standardForm`, `slopeIntercept`,
  `pointSlope`, `twoPoints`, `table`, `scenario`); other knobs choose the
  slope (integer or fraction, sign, size), intercept ranges, the GIVEN
  standard form's scale, the table's x-values, a story's rate, duration and
  starting amount, and a `coordinateRange` that keeps every point a student is
  given or must plot on a readable grid.
* `linear.representationSort` builds the two-line card sort
  (`representationMatch`, `linearConnections`, task `group`): one rising and
  one falling line whose cards never coincide.

Each draws only the line (or a story's rate and duration) and derives every
representation, the window and the story's numbers from it, so no two
representations can disagree. A slot keeps its own prompt, cards, feedback
timing and context, with `{{tokens}}` filled from the line: `{{given}}` for
the GIVEN; `{{start}}`, `{{rate}}`, `{{end}}` in a story and its answer
choices; `{{line1}}`, `{{line2}}` in a sort's prompt; `{{start}}`, `{{rate}}`,
`{{slope}}` in a sort set's context (set 0 is the rising line). A string that
is only a token takes the number itself (`"max": "{{end}}"`).

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
wrap. The delivery records `wrapped: true` (for any request past the family's
end, even when the walk below ends on an unwrapped index), and Pre-Flight
warned beforehand.

Once a request wraps, the student's own earlier versions are excluded
explicitly — each by the version it **delivered**, not by where its index
started (an earlier wrapped request may itself have walked). A student keeps
getting versions they have not had until they have had all of them, then
starts again at the one seen longest ago (only the latest `distinct − 1` are
excluded). Excluding where earlier requests *started* let a long run of "New
Question" cycle through a handful of versions while the family had dozens
more, or refuse a question outright in a small family. A pin written by that
earlier walk still verifies on the server (`deliveryPinAllocationProblem`
tries both walks), and every pin replays from its `resolvedIndex` exactly.
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

* The attempt envelope carries the pin. Ingestion, the deadline finalizer and
  Recovery rebuild the instance and mark the raw response through the shared
  grading registry (`serverGrading/`), the same grader whatever the surface:
  an ordinary type, a registry tool mode, or a Step Algebra final answer. See
  [SERVER_GRADING_COVERAGE.md](SERVER_GRADING_COVERAGE.md).
* The browser's verdict is discarded for those questions.
* A pin must be one this student could have been shown
  (`deliveryPinAllocationProblem`): it is for this slot; a `seated` pin names
  a seat the student's learner token holds (in any class, so a class change is
  safe); a `shared` pin is only valid in a "same questions for all" section;
  and walking the family from the pinned allocation lands on the pinned
  fingerprint. A pin that fails (a classmate's pin, a steered index, a stale
  fingerprint) is refused: the canonical record's pin is tried next, and if
  none can be trusted the work is held for teacher review (`needs-review`,
  kept, never retired) instead of being credited on the browser's word. A
  `provisional` pin cannot be tied to a student after the fact and is accepted
  as shown. The seat verification is still recorded for diagnostics.
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
* **Every sampled version is a valid question.** Each is judged as a static
  question would be: the rich tool's own schema, then semantic validation. A
  `{{token}}` the family never fills is refused with the token named. An
  assignment-local template — and a platform slot that writes its own
  `{{tokens}}` around a family's numbers — is checked against a class's worth
  of versions (32), not the platform sample, because those words were never
  property-tested. On the Multiple Representations board every context
  dropdown must offer exactly one choice the grader marks correct.
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
| `sectionRecoveryEligibility.mjs` | Original-opportunity resolution from the existing deadline rules, plus the state machine `hidden → unavailable / notNeeded / locked → unlocked → inProgress → completed`, or `inProgress → held` when MathMaster could not grade enough of it (below). |
| `sectionRecoveryReadiness.mjs` | Whether each Warm-Up/DOL question can back a fresh, server-gradable Recovery. |
| `sectionRecoveryPlan.mjs` | Practice items and the Recovery assessment as **pins**, on recovery-specific slot keys, excluding every fingerprint the student has seen. |
| `sectionRecoveryRecord.mjs` | The record and its transitions. History is append-only. |
| `sectionRecoveryEvidence.mjs` | What a Recovery question's result can be, the sufficient-evidence rule and the denominator rule for a question MathMaster could not grade (below). |
| `sectionRecoveryResolution.mjs` | A teacher's resolution of a held Recovery (a replacement question, finalize from the graded questions, or keep the original), and the correction of one completed under the old rule. |
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
   Recovery in the same write. The pin must be the student's own: its seat
   one they hold, its index that seat's allocation for the pin's own variant
   and stride (the stride grows as classmates are seated, so an item dealt
   earlier stays valid). A classmate's pin is refused.
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
  passback triggers. The triggers wake only when a completed or held
  Recovery or a Live Challenge result changes.

**When MathMaster cannot grade a Recovery question.**

The invariant: a MathMaster platform failure is never evidence that the
student was mathematically wrong, and never silently awards credit the
student did not earn. Every submitted Recovery question gets one of five
results (`sectionRecoveryEvidence.mjs`):

| Result | When | Score |
| --- | --- | --- |
| `correct` / `incorrect` | The server rebuilt the question from its pin and marked the answer. | Full weight, as always. |
| `unanswered` | No answer, or a blank or incomplete one: the student's own. | 0, full weight, as always. |
| `platform-unavailable` | The server cannot rebuild or mark the question, whatever the student sent: the pin does not replay (PR #430's classifications — fingerprint, family or slot mismatch, unknown or newer family version, malformed pin, unknown or unsatisfiable family, generation failure, a throw), the question left the section, or the server cannot mark that kind of question. | Never counted. |
| `needs-review` | Something only the payload decides: the grader could not read the answer or threw on it, or the device said it could not show a question the server CAN rebuild. | Never counted, never excused: always held. |

The sufficient-evidence rule decides whether the questions MathMaster could
grade still assess what the Recovery was built to assess. The Recovery is
HELD when any of these holds:

1. some question needs review;
2. no question was graded;
3. a skill the plan assesses (a family's `recovery.equivalenceGroup`, else
   its family, else the question itself) has no graded question;
4. the graded questions carry less than half of the planned weight;
5. fewer questions were graded than the section may ask (a Warm-Up never
   finalizes on fewer than its minimum of two).

Otherwise the Recovery is scored over exactly the graded questions: an
excluded question's weight leaves the denominator and is not redistributed
(DOL weights 4 / 3 / 3, Q3 excluded, Q1 and Q2 right: 7 / 7 = 100%, recorded
at the cap). The record keeps `evidence` (what was excluded and why) and the
student reads "MathMaster could not grade 1 Recovery question. It did not
count against your score."

A **held** Recovery has no Recovery score and replaces no grade. The original
stands everywhere, and nothing reads it as final: the student's Grade Center
shows Pending Grade and the Recovery says "Your completed Recovery work has
been saved. MathMaster could not grade one or more required questions, so
your Recovery is being held for review."; the gradebook marks the section
Held; both Classroom passback triggers send nothing and write a
`recovery-held` audit row instead; Grade Transfer lists the student as a
problem, not a row; Case Review lists it for attention. It cannot be started
or resubmitted, and the opportunity is not reported as a 0% Recovery.

The teacher of record (or a root admin) resolves it in the gradebook's
student detail, which says per question what happened and why, whether the
evidence was enough, and what to do next — never the pin, the generated
values or the answer key (`resolveHeldSectionRecovery`, audited in
`grades/{studentId}/gradeOverrideAudits`):

* **Issue a replacement question.** A new item with a new identity, dealt
  from the assignment as it is now, from the student's own seat, excluding
  every instance they have seen. The old item keeps its pin, result and
  answer and is marked `supersededBy`; the student answers only the new
  question, and the graded answers are never asked again. The Recovery stays
  **held** while the student answers (Pending Grade, Classroom waiting), and
  reads as in progress for the student until their final submission date;
  past it, it waits for the teacher again — finalize or keep the original —
  with nothing thrown away. One replacement at a time. Refused while the
  question still cannot produce an instance (fix it first) or after the
  student's final submission date.
* **Finalize from the graded questions.** Scored over the graded questions
  only, even below the automatic thresholds — the teacher's decision,
  recorded as theirs.
* **Keep the original score.** Completed with no Recovery score.

Nothing about the original attempt changes on any of these paths: question
ids, delivery pins, attempt history, the original answers and earlier grading
stay exactly as they were. Each settled hold moves to `holdHistory` with the
evidence it was decided on. An assignment-level teacher override still
decides the whole grade while a section's Recovery is held.

**Recoveries completed before this policy.** The old rule stored an
unreproducible question as `{ graded: false, reason: 'question-unavailable',
credit: 0 }` and counted its weight. Such a record is read as what it was —
a platform failure scored as 0 — and the teacher's student detail says so,
with what the Recovery would be without the zero. The teacher may re-score it
over the questions MathMaster graded (the same callable, audited as a
`legacyCorrection`). Its stored results and plan are not touched; only the
score derived from them changes, once. Nothing is re-scored automatically.

**Why a replacement keeps the record held.** Code that predates replacements
(a rollback) reads a held record as finished, so it can never re-mark the
graded answers or score the replaced question 0; and the grade, Classroom
and Grade Transfer stay paused until the Recovery is really settled.

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

### Process Mode boards in a family

A slot's `interactionMode` and `process` settings are slot fields: every
generated version — first delivery, Practice "New Question", Recovery — keeps
them, and Pre-Flight blocks a slot whose sampled versions do not. A Process
Mode board's evidence is bound to its version (`lmrProcessBinding`, a
fingerprint of the GIVEN's mathematics): facts established on one version
establish nothing on another, so nothing leaks between classmates, from a DOL
into its Recovery, or across Practice versions. See
`multiple-representations-process-mode.md`.

## 7. Compatibility and what remains legacy

* Questions without `questionFamily` behave exactly as before. This includes
  `generator` templates that have not opted in, `variants[]` and static
  questions.
* The authoring compiler passes `questionFamily` through.
* Representative content:
  * `SAMPLE_QUESTION_FAMILY_RECOVERY.json` is fully family-backed and passes
    Pre-Flight with both Recoveries ready. (It is a runtime-shaped fixture
    passed straight to Pre-Flight; it does not go through the teacher's JSON
    import, which asks for `studentActions`.)
  * The Lesson 1 ALEKS bridge's interval template is opted in.
  * `docs/assignments/Algebra1_Linear_Multiple_Representations_V5_FAMILY_UPDATED.json`
    is the Multiple Representations lesson with every question family-backed
    (`linear.representationSort` Warm-Ups, `linear.multipleRepresentations`
    boards). Each baseline question is one draw of its upgraded slot. It
    passes the teacher import and Pre-Flight with no errors or warnings, both
    Recoveries ready. The baseline file is kept unchanged.
* Everything else in `teacher-import-jsons/` and the stored library remains
  legacy until it is migrated question by question. Pre-Flight shows which
  questions block Recovery.
