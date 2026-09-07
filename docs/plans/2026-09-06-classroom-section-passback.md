# Google Classroom section passback implementation plan

## Goal

Make one MathMaster Assignment V5 safe to publish to Google Classroom as either one whole-assignment post or separate Warm-Up, Classwork, Practice, and DOL posts. Each Classroom post must receive only its own grade, preserve existing student work, support already-closed assignments, and schedule future posts for the MathMaster release time.

## Non-negotiable compatibility rules

- Existing whole-assignment publication IDs and grade passback behavior remain backward compatible.
- Saved `grades/{studentId}.gradesByAssignment[assignmentId]` remains the source of official work for old assignments; retroactive publication never asks students to reopen work.
- After the final late cutoff, new practice attempts remain practice-only and cannot change official grades, evidence, mastery, activity history, DOL records, or Classroom grades.
- A Classroom section publication never receives another section's score.
- Student names are primary in teacher-facing operational tables; IDs remain secondary diagnostics.

## Implementation slices

1. **Canonical section publication identity**
   - Add `whole | warmup | classwork | practice | dol` publication scope.
   - Preserve legacy whole-assignment IDs exactly; non-whole scopes get unique deterministic IDs.
   - Add shared section label/normalization helpers and regression tests.

2. **Classroom scheduling**
   - Extend CourseWork creation with an optional future `scheduledTime`.
   - Future MathMaster `releaseAt` creates Classroom CourseWork as `DRAFT` with `scheduledTime`; current/past work remains `PUBLISHED`.
   - Keep idempotency search compatible with both DRAFT and PUBLISHED work.

3. **Section-aware publish + secure launch**
   - Classroom Manager lets the teacher choose whole assignment or one/more present sections.
   - Persist `sectionKey`/label on each publication and include `sectionKey` in the encrypted launch token.
   - Default section post titles/instructions identify what grade the post represents.
   - Null/partial assignment data is validated before split/publish so the current `bundleId` crash cannot recur on this path.

4. **Section-aware grade passback**
   - For each publication, derive question indices for its section from the canonical V5 questions and activity roles.
   - Calculate progress/grade only from those indices. Whole assignment retains current included-index behavior.
   - Section completion uses the existing final-complete release semantics so a completed 100 is student-visible immediately.
   - Scheduled posts do not receive/return grades before their release.
   - Grade-sync audit rows carry section metadata.

5. **Retroactive previous assignments**
   - After creating a section publication for an old assignment, reconcile saved student trackers server-side and send the correct section grade without changing student work.
   - Support assignments that are already closed; official score remains frozen while practice remains available separately.

6. **Teacher gradebook + passback operations**
   - Replace the DOL/Classwork-only display with compact Warm-Up, Classwork, Practice, DOL section grades derived from the canonical tracker, so old assignments work too.
   - Passback monitor shows student name first, section, status, and ID second.
   - Add Retry all eligible failures; do not blindly retry `skipped-unlinked` rows until roster linkage exists.

7. **Student section grade + closed-report launch**
   - While working, show the active section's recorded/current score and completion.
   - A section Classroom link opens that exact section.
   - After final cutoff it opens the frozen official section report first, with a Practice this section action that uses the existing practice-only tracker.

8. **Name-first teacher operational surfaces**
   - Audit attendance and other teacher-facing tables that expose bare student IDs; render saved names first with ID secondary when needed.

## Verification

- Red/green unit tests for publication identity, scheduling, section index/grade routing, retry eligibility, and retroactive grade derivation.
- Wiring tests for Classroom Manager section selection, section launch payload, gradebook section display, and closed-report practice transition.
- Existing authoring/Classroom canonical launch tests remain green.
- Build and lint.
- Full Platform Test Suite green before merge/deploy.
