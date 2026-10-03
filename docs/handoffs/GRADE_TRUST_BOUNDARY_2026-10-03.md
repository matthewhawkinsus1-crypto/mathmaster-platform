# The grade trust boundary — 2026-10-03

*A student device must never be able to author or modify authoritative grade
state merely because it knows the Firestore document path or field names.*

PR #412 made grading server-authoritative and PR #247 removed the browser's
direct canonical-grade fallback. Neither changed `firestore.rules`, which still
let the owning student update **anything** on `grades/{studentId}` except a few
pinned maps. This change closes that.

## What was open, and that it was exploitable

Proven against the real rules and the real Cloud Functions in the emulator,
signed in as an ordinary student, on `main` @ `bca29ac`:

| Path a student could write | Who trusted it | Demonstrated |
| --- | --- | --- |
| `gradesByAssignment` (canonical question records: status, attempts, credit, parts, `lastSubmissionId`) | `syncGradeToClassroom` / `syncSectionGradeToClassroom`, Grade Center, teacher gradebook, Grade Transfer, ingestion's attempt policy, the reduced-workload projection | a forged all-correct tracker was posted to Google Classroom as **100**; an exhausted question reset by the student was then **accepted as correct (100)** by `ingestStudentSubmissions` |
| `classroomReleaseSignals` | the passback stage (`final-deadline`, `due-checkpoint`, `assessment-release`, `manual-retry`) | a forged `final-deadline` signal posted a **student-visible, returned** grade before the deadline |
| `classworkGradesByAssignment` | `prerequisiteAccess` (unlocks the next assignment) | writable directly |
| `dolGradesByAssignment` | the DOL finalization gate (`dolSectionProjection`) | writable; the browser itself wrote a client-computed final score here |
| `supportUsageByAssignment` | the gradebook MOD marking | the modification flag could be erased |
| `classroomSyncStatusByAssignment`, `classroomSectionSyncStatusByAssignment` | the student's "sent to Google Classroom" receipts | forgeable |
| any new top-level field; a literal dotted field name; a self-created roster row with grades in it | — | all accepted |

Already refused before this change (kept, regression-tested): `testCycleGrades`,
`teacherGradeOverridesByAssignment`, `sectionRecoveryByAssignment`,
`warmupChallengeByAssignment`, roster/SIS/identity fields, the profile, and any
write to another student's document.

## The boundary

`firestore.rules` `grades/{studentId}`: the student branch is an **allow-list**.
A student's client may change exactly one field — `assignmentActivity`,
engagement time only the browser can measure — and nothing else, by
`request.resource.data.diff(resource.data).affectedKeys().hasOnly([...])`.
Update, merge, batch and transaction are all held to it; a re-sent unchanged
value is not a change. A row a student creates is held to an allow-list too:
its roster placement, an empty profile slot, its engagement field, and grade
maps that must be empty — nothing else. The lists live in
`functions/shared/gradeDocumentAuthority.mjs`; a parity test keeps the rules
equal to them.

Unchanged: the teacher of record and the root administrator keep their
existing client authority on the document (the repair flows their clients
run); the audited override callables remain the only writers of overrides.

## The three browser writes that remained

| Before | Now |
| --- | --- |
| Next → `questionProgress` → client transaction rewrote the whole canonical record with a new `timeSpent` | the same queued row goes to `ingestStudentSubmissions` as a progress envelope (`PROGRESS_KINDS`); the server raises `timeSpent` and changes nothing else, with the caller's identity and the roster's class (`recordOneQuestionProgress`, `questionProgressRecord`) |
| sign-in re-graded stored records with the current grader and wrote them back | the student sees the canonical record; the one-time correction is written when the teacher of record's Grades tab loads, as before |
| the DOL timer wrote a client-computed, finalized DOL projection | local feedback only; ingestion and the checkpoint finalizer own the projection |

Submit still waits only for the IndexedDB outbox. Nothing about the durable
outbox, its ordering, its retirement rules or offline recovery changed.

## Deploy order — this one matters

A client still running the previous build attempts the three writes above.
Under the new rules they are refused:

* the progress write retries harmlessly until the tab reloads, and the new
  build then delivers the same queued rows through ingestion;
* the DOL-close write logs an error once;
* the sign-in repair write fails sign-in **for a student whose records the
  current-grader correction would still change** — a reload onto the new build
  fixes it.

So ship the server and the client first, the rules after:

```bash
npm run build && npm run build:firebase
# 1. the server that understands progress envelopes
firebase deploy --project mathmaster-aleks --only functions:ingestStudentSubmissions
# 2. the client that stops the three writes (always the resilient wrapper)
FIREBASE_HOSTING_UPLOAD_CONCURRENCY=4 npm run deploy:hosting
# 3. once the new client has been live through a school day
firebase deploy --project mathmaster-aleks --only firestore:rules
```

Hosting before Functions is the wrong order: the new client's progress
envelopes would reach a server that cannot read them, and each would sit on the
device as `needs-review` — retried on every drain and shown in the teacher's
recovery report — until the function ships. Nothing is lost, but it is noise.
`scripts/release-firebase.mjs` deploys rules **before** Hosting, so do not use
it for this release unless rules are held back with `--only`.

Rollback: `git checkout <previous> -- firestore.rules && firebase deploy --only
firestore:rules`. The function and client changes are backward compatible with
the old rules.

## Still client-owned, on purpose

* `grades/{studentId}.assignmentActivity` — engagement time. **Grade-adjacent:**
  the Classwork completion rule's minimum-engagement term reads its
  `totalTimeSeconds`, so a student can still claim engagement minutes. The
  completion itself (≥ the required share of Classwork attempted) is computed
  by the server from canonical attempts. Follow-up: bound the term with the
  server-timed `engagementMinutes` ledger once its offline gaps are understood
  (it drops minutes silently when a write fails).
* `timeSpent` on a canonical record — client-measured, server-applied, bounded
  (≤ 86,400 s, monotonic, nothing else on the record moves).
* Response checkpoints, workspace drafts, scratchpads, presence, support
  telemetry and engagement-minute ledgers — unchanged, and none carries a grade
  (each has its own rule and tests).
* Device-graded surfaces (`fraction` drills, `numberLine`, legacy seeded
  generators; `SERVER_GRADING_COVERAGE.md` §11) still reach the record through
  ingestion's sanitized, attempt-bounded client record. Unchanged.

## Out of scope, noted

* The teacher of record's client can still write canonical records directly
  (current-grader repair, live corrections, Repair from Library, assignment
  deletion). Unaudited, but teacher authority, and unchanged. The current-grader
  repair writes the whole `gradesByAssignment` map from the snapshot the Grades
  tab loaded, so an attempt ingested between that load and the write can be
  overwritten — pre-existing; it belongs in an Admin SDK transaction that
  rewrites only the corrected question paths.
* Sign-in no longer applies that current-grader correction from the student's
  device (it re-graded and wrote historical records from the client). The
  teacher-of-record path above is now its only writer; a server callable could
  take it over if students' records must be corrected without a teacher view.
* The browser no longer writes a finalized DOL projection when the DOL timer
  ends. The checkpoint finalizer still finalizes one for a response pending at
  the cutoff; otherwise the projection stays `section-in-progress`. Nothing
  grades from it — every DOL score comes from the canonical records — and a
  server-side close job would belong to the section-deadline lifecycle.
* Each Next press is one `ingestStudentSubmissions` call (background lane, two
  at a time). Batching background rows into one call (the callable takes 25)
  would need an outbox change.
* A side effect worth knowing: because the student rule is an allow-list,
  `status`, `linkedEmail` and every other roster-row field are now refused to
  the student too (previously only the explicitly pinned ones were).
* `pathHistory/{studentId}` is student-writable although its comment says only
  teachers write it. Routing display, not a grade.
* A student can still grow their own `assignmentActivity` map; a document over
  1 MiB would refuse every later write to it, including the server's.
