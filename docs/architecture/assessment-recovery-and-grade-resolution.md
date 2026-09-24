# Assessment recovery and grade resolution

*Job 6, 2026-09-24. Builds on the class-scoped DOL reopen and +1 attempt
controls from #347.*

## Principle

**Recovery changes what the policy allows next. It never edits evidence.**
Question records — every attempt, score, response, timestamp — are written only
by submission ingestion and the checkpoint finalizer on the server. A reopen or
an extra attempt is a patch to `assignment.dol`, plus an append-only audit
entry. Nothing a teacher does in these controls rewrites a past attempt.

## The model — `src/platform/assessment/assessmentRecovery.js`

| Action | Scope | Stored at | Enforced by |
| --- | --- | --- | --- |
| Reopen after the cutoff (fresh window, default = the DOL's own duration, or a chosen close time) | class | `dol.recoveryByClassId[classId]` | `resolveDolWindow` (browser) and `dolTeacherRecoveryActiveAt` (server grading) — `functions/shared/sectionDeadline.mjs` |
| Unlock early / restart inside the normal window | class | `dol.earlyUnlocksByClassId[classId]` | same |
| +N attempts on every DOL question | class | `dol.attemptGrantsByClassId[classId]` | `resolveTeacherGrantedExtraAttempts` — browser, `submissionIngestion`, `responseCheckpointFinalizer` |
| +N attempts on every DOL question | **selected students** (new) | `dol.attemptGrantsByStudentId[studentId]` | same resolver; the student's grant **adds** to the class grant, total capped at 20 |
| Per-student deadline extension (attendance) | student | `assignment.studentOverrides[studentId].lateDueAt` (server-written) | `assignmentFinalCloseAt` |

Every action appends to `dol.recoveryAudit` (newest last, capped at 500):

```
{ id, action, section: 'dol', scope: { type: 'class' | 'students', classId, studentIds },
  previous, next, teacherId, reason, at }
```

`previous`/`next` are the policy values before and after (for example
`{ extraAttempts: 1 } → { extraAttempts: 2 }`). The assignment document is
readable by every signed-in user, so the audit stores the teacher's **id**, never
an email. `recoveryHistory(assignment, { studentId | classId })` returns the
entries newest first.

The model is section-agnostic (`section: 'dol'`) so quizzes, tests, review,
retest and warm-ups can adopt the same patch-plus-audit shape; today the
platform enforces it for the DOL.

## Where teachers use it

* **Class** (Classes workspace and Teacher Home): *Reopen DOL* and *Grant +1
  Attempt*, as in #347 — now built by the model and audited.
* **Student** (Grades → a student → an assignment with a DOL): *Grant +1 DOL
  attempt* for that student, with the current total shown.

## What the student sees

* The attempt strip shows `N of M tries left`, where M already includes every
  grant.
* A one-time notice when the DOL is reopened for them (*"open again until …;
  your earlier work is still there"*), and — while the DOL is open — when they
  have been given extra attempts. The existing DOL reminder stops once a student
  has attempted, which is exactly the student a recovery is for.

## Grade resolution — the deterministic order, as implemented

1. **Evidence.** Each question's canonical record: attempts are appended;
   `bestPartialCredit` is the maximum over attempts, so an additional attempt can
   only raise a question's credit; `correct` is terminal.
2. **Question-level teacher override** (`teacherGradeOverridesByAssignment[a][q]`)
   applies only to the exact attempt it was made against — same attempt count,
   variant, and submission id / attempt time. If the student makes a new attempt
   after a grant, that newer evidence supersedes the override. Exception: a
   persistent `teacher-section-zero` consequence always applies.
3. **Assignment-level teacher override** (`__assignment`) replaces the computed
   assignment score while it is active, regardless of later attempts.
4. **Deadlines** come from `resolveAuthoritativeClose`: the section's own window
   (DOL: regular, early-unlocked or teacher-recovery), extended per student by
   an attendance override. Work after the close is not accepted as on-time
   evidence; work inside a recovery window is.
5. **Auto-submission.** At a close, the checkpoint finalizer records the last
   saved answer as an attempt stamped at the close, through the same attempt
   policy (including grants).
6. **Google Classroom** hears only what ingestion produces from evidence.
   Recovery actions write no grade and trigger no passback by themselves; the
   next ingested attempt does.

## Deploy note

The per-student grant is read by two Cloud Functions. Deploy
`ingestStudentSubmissions` and `finalizeStudentResponseCheckpoints` **before**
Hosting, so no browser offers an attempt the server would still refuse.

## Certified by

`tests/platform/assessmentRecoveryPolicy.test.mjs` — class and student grants
in browser and server policy, accumulation and cap, the append-only audit,
active / submitted / auto-submitted / absent students, a reopened window seen by
the browser window and by server grading (and refused after it closes), an
expired assignment not reopened by a grant alone, the student notice, and the
wiring of every control and both server call sites.

## Not yet built

* A per-student reopen window (today a reopen is class-scoped; a single absent
  student uses the attendance deadline extension plus an attempt grant).
* A free-text reason prompt in the confirm dialogs (the model accepts `reason`).
* A teacher-facing view of `recoveryHistory` (the data is recorded now).
