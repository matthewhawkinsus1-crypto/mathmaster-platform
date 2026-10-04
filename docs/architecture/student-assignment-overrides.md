# Students' own assignment controls: private storage

*Closes the gap PR #415 deliberately left (its I-4). Server, rules, migration
and operator tooling ship in this release. The student and teacher screens
switch over in a follow-up release, after PR #428 merges (§9).*

## 1. The problem

`assignments/{id}` is the shared lesson. Every student in every class it is
assigned to receives the whole document. Until now it also carried each
student's own controls, keyed by student id:

```
studentOverrides[sid].lateDueAt | .dueAt   an individual final cutoff (attendance extension)
studentOverrides[sid].extension            { dateKey, grantedAt } stub (#415 removed the reasons)
studentOverrides[sid].excused | .reopened  teacher flags
excusedStudentIds[] / reopenedStudentIds[] the same flags, an older array form
dol.attemptGrantsByStudentId[sid]          extra DOL attempts for one student
dol.recoveryAudit[] (scope "students")     who was granted which attempts
```

So a student who legitimately read their own class's lesson also received
every classmate's extension, excusal, reopen and attempt grant. In the 30- and
60-student certification (§12), one device sees 15 or 29 classmates' controls
on a single lesson.

The goal: a student's device receives the lesson plus **its own** controls
only. Teachers keep class-wide management. The server stays the authority on
deadlines and attempts. No student loses an extension, reopen, excusal or DOL
grant at any point of the move.

## 2. The census: who read and wrote these fields before

Traced semantically: every reader of a per-student deadline, attempt limit,
excusal or reopen, not only the literal field names. "Resolver" below means
the reader now goes through `functions/shared/studentAssignmentOverrides.mjs`
(§7).

### Writers (before)

| Field | Writer | How |
| --- | --- | --- |
| `studentOverrides[sid].lateDueAt`, `.extension` | `applyStudentAttendanceExtension` (callable; Admin SDK) | Dotted update. Never shortens a cutoff. The rules already blocked every client write to `studentOverrides`. |
| `studentOverrides[sid].dueAt` | releases before the extension rewrite | Legacy only; read as the final cutoff |
| `studentOverrides[sid].extension` reasons (absence dates, meetings, granting teacher) | releases before #415 | #415's `migrateAssignmentPrivacy` moved them to `grades/{sid}/attendanceExtensionGrants/legacy__{aid}`; the new backfill does the same for any it still finds |
| `studentOverrides[sid].excused` / `.reopened`, `excusedStudentIds[]`, `reopenedStudentIds[]` | **none in the current code** | Legacy data from older releases, still read by the Grade Center and Grade Transfer |
| `dol.attemptGrantsByStudentId[sid]` + students-scope `dol.recoveryAudit` | Teacher browser: `buildDolAttemptGrant` (`src/platform/assessment/assessmentRecovery.js`) via `App.jsx` | Writes the whole `dol` map back from the tab's copy. Only ever increments. |
| whole `dol` map (carrying the per-student map along) | Teacher browser: every DOL window action (open/close/extend/move/restore) | Same whole-map write: a stale tab can drop someone's grant |
| copies of all of the above | Duplicate (`App.jsx`) and content versions (`createAssignmentContentVersion`) | Both run `stripAssignmentInstanceState`, which now strips every per-student form (test 16) |
| removal of one student | `permanentlyDeleteStudent` → `removeStudentFromAssignmentDocuments` | Now also removes the array forms, scrubs ids inside audit entries, and deletes the private records, history and archive parts |

### Readers (before) — server

| Path | What it decides | Read now |
| --- | --- | --- |
| Submission ingestion (`ingestOneSubmission` → `assignmentFinalCloseAt`, `buildIngestedAttempt` → `resolveTeacherGrantedExtraAttempts`) | Is the work in time? How many attempts? | Reads the **authenticated** student's private record in its transaction |
| Checkpoint finalizer (`decideCheckpointFinalization`, `buildCheckpointFinalization`) | Finalize now or reschedule to the student's cutoff; attempt limit | Same, in its transaction |
| Section Recovery (`advanceSectionRecovery` → `buildSectionRecoveryContext` → `resolveOriginalOpportunity`) | Recovery window end | Same, in its transaction |
| Draft recovery (`resolveAuthoritativeClose` ×3, the #426 path) | Authoritative close of a reopened Warm-Up draft | Same |
| Practice Pass redemption (`rewardActionStore` → `assignmentCreditLifecycle`) | Is credit still possible? | Same, in its transaction |
| Classroom passback (`syncGradeToClassroom` → `resolveClassroomGradeStage`) | Is this grade final? | `resolvedStudentFinalCutoff` reads the private record |
| `applyStudentAttendanceExtension` | Never-shorten check | Resolved current cutoff (private + shared) |

### Readers (before) — browser

| Module | What it shows |
| --- | --- |
| `src/assignmentLifecycle.js` (`getAssignmentDate`, `getAssignmentLifecycle`, `getSectionAccessState`, `recordAssignmentActivity`) — used by the student dashboard, Grade Center, Live Classroom, smart views, Classroom launch, Practice Pass eligibility | open / late / closed / practice-only, per student |
| `src/platform/student/studentGradeCenterModel.js` | excused, reopened (both forms) |
| `src/platform/gradeTransfer/studentDeadlineResolver.js` | withholding until the student's own cutoff; reopened |
| `src/platform/assessment/assessmentRecovery.js` (`summarizeStudentRecovery`) | the student's DOL attempts |
| `src/platform/attendance/extensionReconciliation.js`, `returnCheckIn.js` | the existing extension stub |
| `src/platform/supportEvidence/evidenceAggregation.js`, `components/teacher/AssignmentSupportLayer.jsx` | the student's effective final cutoff |
| `components/teacher/ParentContactCenter.jsx`, `platform/caseReview/studentCaseReview.js`, `narrativeFacts.js` | extension facts for staff |
| `platform/recovery/teacherRecoveryAudit.js`, `platform/caseReview/attemptAnalysis.js` | Recovery end, attempt limit (via the shared functions) |
| `src/App.jsx` (#428-locked) | the student's lifecycle and attempt limits; `withStudentSupportDates`; the DOL grant writer |

All of these now resolve through the one module. A reader that does not pass
`privateOverride` reads the in-memory assignment as before: the shared copy
today, and the student's or teacher's resolved view after the client switch
(§9).

### Field classification

| Kind | Fields | Decision |
| --- | --- | --- |
| **Student-specific** | final cutoff (`lateDueAt`/`dueAt`), extension stub, `excused`, `reopened` (both forms), `dol.attemptGrantsByStudentId[sid]` | Move to the private record |
| **Historical / audit** | students-scope `dol.recoveryAudit` entries; pre-#415 extension reasons | A copy of each student's share goes into their staff-only history; the shared copy is archived verbatim, root admin only, before removal. The reasons stay in `attendanceExtensionGrants`. Nothing is deleted. |
| **Class-wide** | `dueAt`, `lateDueAt`, `releaseAt`, `sectionAccess`, `dol.attemptGrantsByClassId`, `dol.recoveryByClassId`, `dol.earlyUnlocksByClassId`, class-scope audit entries, Warm-Up windows | Stay on the lesson, untouched |
| **Runtime control** | DOL/Warm-Up open-close windows and teacher reopen are per **class** | Stay. The only per-student runtime controls are the four above. |
| **Derived** | individualized extra-time dates (`supportDueAt`/`supportFinalAt`, PR #418/#419), effective status, attempts left | Never stored. Support dates come from the student's pinned profile, in memory (`withStudentSupportDates`). The backfill counts any an old writer persisted (`derivedFieldsIgnored`) and moves none. |
| Not in scope | `generationSeats` (pseudonymous seat hashes for personalized generation) | Not a control; #415 already keeps it out of copies |

There was no student-specific Warm-Up reopen, quiz/test accommodation or
make-up field on the lesson. Warm-Up reopen and DOL windows are class-wide,
Test Cycle keeps its own records, and make-up/automatic Recovery is driven by
attendance plus the student's final cutoff, which the resolver supplies.

## 3. The record

```
studentAssignmentOverrides/{len(studentId)}:{studentId}:{assignmentId}

schemaVersion: 1
studentId, assignmentId
classId, originClassId, originTeacherEmail, authorizedTeacherEmails[]   ← authorization (authorizationContext.mjs)
lateDueAt        individual final cutoff, as stored (ISO instant or legacy date key) | null
extension        { dateKey, grantedAt } | null    — never reasons
excused, reopened                                  booleans
dolExtraAttempts 0..20, dolAttemptGrant { extraAttempts, changedAt, changedBy, reason } | null
revision, source ('change:<kind>' | 'migration' | 'absorber'), updatedBy, updatedAt
```

Why this shape:

* **One small document per (student, assignment).** A student's device lists
  its own with `where('studentId', '==', id)`: bounded by that student's
  controls, never by class size. A teacher's screen lists a whole class's with
  one query on `authorizedTeacherEmails` (optionally narrowed to a `classId` or
  an `assignmentId`; both composite indexes are declared). A per-student map
  would have grown without bound. A per-assignment map would still carry
  classmates.
* **Authorization on the record itself**, as every teacher-readable record in
  the platform does. List queries are provable without a `get()` per student,
  and a class move re-authorizes the record (`reauthorizeStudentRecords`) while
  the origin teacher keeps access.
* **Length-prefixed id.** Unambiguous for any student or assignment id, and
  the server reads a student's record with one `get`, never a query.
* **An allow-list.** No support data, no reasons, no emails beyond
  authorization, no unknown keys. The student may read it.

**History** — `grades/{sid}/assignmentOverrideEvents/{id}`, staff only and
immutable: one entry per change (`{aid}__r{revision}`: kind, before, after,
actor, reason), one per migration step (with the verbatim shared value it
replaced), and each student's own share of the legacy DOL recovery audit,
with classmates' ids removed (`legacy-audit__{aid}__{digest}`).

**Archives** — `assignmentOverrideArchives/{aid}__{digest}`, root admin only:
the verbatim per-student content of a lesson, written in the same transaction
that removes it.

## 4. Security model

| Who | `studentAssignmentOverrides` | history | archives, migration state |
| --- | --- | --- | --- |
| The student | read **own** (`ownsStudent(resource.data.studentId)`) | — | — |
| A classmate | nothing: no get, no list of any shape | — | — |
| Teacher of record / origin teacher | read, through the record's `authorizedTeacherEmails` | read | — |
| Another teacher | nothing | nothing | — |
| Root administrator | read | read | read |
| Anyone from a browser | **no writes** | no writes | no writes |

Changes go only through callables, which check in a transaction that the
caller teaches this class and that every named student belongs to it:

* `applyStudentAttendanceExtension` — never shortens a cutoff;
* `setStudentAssignmentControls` — DOL attempts, excuse, reopen. At most 60
  students per call, all-or-nothing;
* root admin: `migrateStudentAssignmentOverrides`, `setAssignmentOverrideStorage`.

**The lock.** Once `platformFlags/assignmentOverrideStorage.sharedRetired` is
true, an assignment create or update from a browser may not add or change any
per-student form (`excusedStudentIds`, `reopenedStudentIds`,
`dol.attemptGrantsByStudentId`). `studentOverrides` was already server-only.
A stale tab rewriting the whole `dol` map from an old snapshot is refused
rather than republishing classmates' grants.

Proven in the emulator by `tests/rules/studentAssignmentOverrideRules.test.mjs`.
That covers the ten required cases, plus history, archives and the lock.

* Records are attacked by id and by every list shape: a classmate's id, the
  class, the assignment, a teacher's email, a flag value, `in` with the
  student's own id, a bare `limit(1)`, and a collection-group query.
* Writes are attacked through the record and through each legacy shared
  field.
* The lesson is attacked through every endpoint that could serve it: get by
  id and the class list (both clean once stripped), plus a collection-group
  query, the whole collection and another class's list (all refused).

No callable returns a whole assignment to a student. The server-side
snapshots (`assignmentRepairHistory`, `assignmentVersionEvents`) are readable
by no client, and new content versions are stripped copies.

## 5. Writers and the mirror (Stage 3)

Every server writer computes the change from the **resolved** current
controls (private + shared). In one transaction it writes:

1. the private record, with a new revision;
2. the history entry;
3. the shared copy:
   * **mirror** (switch off, how a release ships) — make the shared copy say
     exactly what private storage says. Previous-release clients still read
     it, so their screens stay right. Un-setting a flag clears every legacy
     form of it.
   * **retired** — delete this student's shared forms.

**Why a mirror at all.** During a rollout, open tabs and devices on the
previous release read only the shared copy. Without the mirror, a student
granted an extension through a new path would look closed on an old device
until it reloaded.

**Its removal condition.** The mirror is turned off by the storage switch
(`sharedRetired: true`). That is allowed only once:

* the release whose screens read private records (§9) has been live for a
  full school day, and
* a full backfill has finished with zero failures (§11).

**The absorber** (`absorbSharedStudentControls`, on every
`assignments/{id}` write) covers what a previous-release browser still writes
the old way, mainly a teacher's DOL grant through the whole `dol` map. Within
seconds it moves that into private storage, then either keeps the mirror
agreeing or, once retired, strips it again. It is idle on ordinary edits: zero
reads, zero writes (§12).

**Why the merge can safely keep "either place".** Before this module the
legacy writers could only add: the extension callable never shortens a
cutoff, the DOL grant only increments, and nothing wrote excused/reopened. So
a disagreement between the two stores is always a newer grant. A teacher's
removal is made through the callables, which clear every shared form in the
same transaction. The integration suite runs the absorber after such a
removal and shows nothing comes back.

## 6. Merge rules (dual read)

`resolveStudentOverride({ assignment, studentId, privateOverride })`:

* `privateOverride === undefined` — the caller did not read private storage.
  The shared document is the whole answer, exactly the old behaviour.
* `null` — read, no record: the shared copy alone.
* a record — merged with the shared copy:
  * **final cutoff:** the newer teacher decision (`extension.grantedAt`) wins;
    if the two cannot be ordered, the later cutoff wins.
  * **excused / reopened:** set in either place means set.
  * **DOL attempts:** the larger grant.

Resolving an already-resolved view changes nothing.

## 7. The one precedence

Pinned in `resolveStudentDeadlines` / `resolveStudentDolExtraAttempts` and in
`tests/platform/studentAssignmentOverrides.test.mjs`:

| Concept | Rule |
| --- | --- |
| On-time due | `max(class due, individualized extra-time due)`. An attendance extension never moves it: it buys credit time, not on-time status. |
| Final cutoff | `max(class final (late window, else due), individual extension, extra-time final)`. None can shorten another. |
| Excused | Takes the assignment out of the grade; changes no date |
| Reopened | Holds an export / Grade Transfer; changes no date. A closed lesson opens only with an extension. |
| Warm-Up / DOL window | Class-wide (`sectionDeadline.mjs`). An individual cutoff only replaces the "no window today" fallback. |
| DOL attempts | `class grant + the student's own`, capped at 20, on DOL questions only |
| Time | The caller's authoritative clock or the capture time, unchanged per caller: offline work captured inside the window counts when it arrives later |

## 8. Server authority

Ingestion, the finalizer, Recovery, draft recovery, Practice Pass and passback
read the private record **of the authenticated student**, inside their own
transactions. Nothing in a payload is consulted: a later deadline, a reopen,
an excusal, extra attempts, another student's id, or an old client's
override-shaped record. `tests/integration/studentAssignmentOverrides.test.mjs`
sends each of those forgeries. It also runs every server path with the
student's controls in the shared copy alone, in both stores, and in the
private record alone, and requires the same answer in all three.

## 9. Browsers: this release and the client follow-up

**This release changes no student or teacher screen.** With the mirror on, the
shared copy stays complete, so every screen reads what it read before; every
reader already goes through the resolver.

The follow-up, after #428 merges and on top of it, is the smallest change to
`App.jsx`:

1. **Student:** one listener, `where('studentId', '==', me)`, on
   `studentAssignmentOverrides`. Each received lesson becomes
   `studentAssignmentView(assignment, { studentId, privateOverride })` before
   `withStudentSupportDates`: their own entry only, every classmate's form
   removed. One listener per device, whatever the class size.
2. **Teacher:** one listener per viewed class (`authorizedTeacherEmails`
   contains me, and `classId ==`), feeding
   `teacherAssignmentView(assignment, privateByStudentId)`. That view
   replaces only `studentOverrides`, never `dol`, which teacher actions write
   back whole.
3. The DOL grant (`handleGrantDOLAttemptForStudents`) calls
   `setStudentAssignmentControls` instead of writing the `dol` map.
4. Teacher save paths that send a whole assignment must keep sending it
   without per-student fields (`stripAssignmentInstanceState`). The rules
   refuse a write that changes `studentOverrides`.
5. A student's DOL recovery history (`recoveryHistory`) reads that student's
   `assignmentOverrideEvents`.
6. The admin card gains the Stage 4 controls: the switch, the strip and the
   restore.

The follow-up's tests must pin exactly one override listener per student
device and one per teacher class view, and re-run the phone and Chromebook
journeys.

## 10. Copies

A duplicate (the unassigned "(Copy)" that lands in the teacher's library,
`App.jsx`) and a new content version (`createAssignmentContentVersion`) both
run `stripAssignmentInstanceState`; there is no other copy path. It removes
`studentOverrides`, `excusedStudentIds`, `reopenedStudentIds`,
`generationSeats` and every section's runtime state, including
`dol.attemptGrantsByStudentId` and `recoveryAudit`. Private records are keyed
by the original assignment id, so a copy starts with none (test 16).

## 11. The staged migration

| Stage | What happens | Gate to enter | Rollback |
| --- | --- | --- | --- |
| **1. Private storage + dual read** | Deploy. Every server reader reads the private record and merges the shared copy; new grants write both (mirror on). | — | Redeploy the previous release. It reads the shared copy, which the mirror kept complete. |
| **2. Backfill** | Admin → Classes → *Students' own assignment controls*: **Check without changing anything**, then **Copy into private records**. Each student's shared controls become their private record, in the same transaction as their history entry. Pre-#415 reasons go to `attendanceExtensionGrants`. Idempotent; one bounded page per call; each assignment commits on its own; the cursor is kept server-side, so a stopped run resumes. | Stage 1 live | Nothing to undo: records are additive, and the previous release ignores them. After a rollback, run the backfill again once the new release is back; the absorber does not see writes made while it was not deployed. |
| **3. Writers on private storage** | Already true for every server writer in Stage 1. Previous-release browsers' writes are absorbed within seconds. The client follow-up moves the last browser writer (the DOL grant) onto the callable. | — | As Stage 1 |
| **4. Students stop receiving classmates' controls** | Client follow-up live for a school day → `setAssignmentOverrideStorage({ sharedRetired: true })` (mirror off, lock on) → strip, dry run first. In the same transaction as the removal, the strip verifies that every student it names is exactly represented in private storage, and archives the verbatim content first. | Follow-up live ≥ 1 school day; full backfill done, 0 failures | Switch off (`sharedRetired: false`), then `restore`, which writes every private record back onto the shared copy in mirror form, so a previous-release client reads the same again. Rehearsed in `scripts/rehearse-student-assignment-overrides-migration.mjs`. |
| **5. Legacy retired** | See §13 | §13 | — |

## 12. Cost: before and after, 30 and 60 students

From `scripts/certify-student-assignment-overrides-cost.mjs`. It runs the real
functions in the emulator and counts documents read and written at the SDK.
The "before" column is the same scenario run against `main`. The lesson has
28 questions (43.5 KB). Controls are spread realistically: 25% of students
with an extension, 10% excused, 5% reopened, 10% with extra DOL attempts.

**What one student's device receives with one lesson**

| | 30 before | 30 after | 60 before | 60 after |
| --- | --- | --- | --- | --- |
| Lesson bytes | 45,578 | 43,515 | 47,148 | 43,515 |
| Classmates' controls on it | 15 | **0** | 29 | **0** |
| Own controls | in the lesson | one ~535 B record | in the lesson | one ~536 B record |

**One student's control changes** (an extension, an attempt, an excusal)

| | 30 | 60 |
| --- | --- | --- |
| Before: the lesson re-sent to every device on it | 31 documents, 1.41 MB | 61 documents, 2.88 MB |
| During the mirror (Stages 1–3) | 33 documents, 1.41 MB | 63 documents, 2.88 MB |
| After the strip (Stage 4) | **2 documents, 1.1 KB** | **2 documents, 1.1 KB** |

**Listeners.** A student device keeps its lesson listener and adds one listener
for its own controls. A teacher adds one per viewed class. Neither depends on
class size or lesson count, and there are no per-student or per-lesson
listeners. Initial teacher read: one document per (student, lesson) that has
any control — 16 for this lesson at 30 students, 30 at 60.

**Server reads per operation** (writes in brackets)

| Operation | Before | After (mirror) | After (retired) |
| --- | --- | --- | --- |
| Ingest one submission | 4 [4] | 5 [4] | 5 [4] |
| Ingest a batch of five | 16 [20] | 21 [20] | 21 [20] |
| Recovery status | 7 | 8 | 8 |
| Finalizer sweep, 30 answers | 187 [96] | 217 [96] | 217 [96] |
| Finalizer sweep, 60 answers | 367 [195] | 427 [195] | 427 [195] |
| Grant an extension | 3 [2] | 5 [4] | 5 [3] |
| Grant a DOL attempt, 1 student | browser write [1] + lesson re-sent to all | 5 [3] | 5 [2] |
| Grant a DOL attempt, 5 students | browser write [1] + lesson re-sent to all | 13 [11] | 13 [10] |
| Classroom passback | 6 [2] | 7 [2] | 7 [2] |
| Absorber on an ordinary edit | — | 0 [0] | 0 [0] |
| Backfill of two lessons | — | 77 [72] at 30; 139 [134] at 60 | — |
| Strip of two lessons | — | — | 113 [6] at 30; 203 [6] at 60 |

Every server path that decides access reads exactly **one** more document,
the student's own record. A grant costs a few more reads and writes, plus a
history entry.

**Memory.** A student device stops holding every classmate's controls on
every lesson: about 2.1 KB per lesson at 30 students, 3.6 KB at 60, before.
It holds only its own records. A teacher's screen holds the same controls as
before, as separate documents of ~535 B each.

## 13. When the legacy shared data may be ignored, and deleted

**Ignored** — readers stop consulting the shared copy. This is Stage 4's
completion, and it holds when **all** of these are true:

1. `setAssignmentOverrideStorage` reports `sharedRetired: true`;
2. the last full strip reported `assignmentsWithSharedStudentData: 0`,
   `assignmentsAwaitingAbsorption: 0` and no failures;
3. that has held for 30 consecutive days, so any restore has been ruled out;
4. no previous-release client is still being served: the release before the
   client follow-up is no longer deployed or rolled back to.

From then on the merge's shared side is always empty. A later change may stop
reading it.

**Deleted** — never the history. The per-student shared fields are already
gone from the lessons at Stage 4: the strip removes them only after archiving
them and confirming private storage. What remains are the verbatim archives
(`assignmentOverrideArchives`, root admin only). They may be removed under
the district's records-retention schedule, and not before the condition above
holds. Each student's history (`assignmentOverrideEvents`) and grant records
(`attendanceExtensionGrants`) are evidence and are never deleted by this
migration. Deleting a student removes them along with the rest of that
student, as before.

## 14. Tools

* `scripts/certify-student-assignment-overrides-cost.mjs` — the numbers in §12.
* `scripts/rehearse-student-assignment-overrides-migration.mjs` — every
  stage, on every legacy shape, with effective access checked after each.
* Admin → Classes → *Students' own assignment controls* — the Stage 2 card.
  It is read-only for the switch in this release.
