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

## 9. Browsers: the client cutover

PR #432 shipped private storage with every screen still reading the mirrored
shared copy. The client cutover (this section) moves every student and
teacher screen onto private storage, in the six steps #432 named. Nothing a
browser holds or writes carries another student's controls.

1. **Student: one own-controls listener, one projection.**
   `useStudentAssignmentControls` (`src/platform/assignments/`) opens exactly
   one listener per signed-in student: `where('studentId', '==', me)` on
   `studentAssignmentOverrides`, the only list the rules allow a student. Its
   documents become one map, assignment id → that student's record,
   allow-listed to the controls (final cutoff, extension stub, excused,
   reopened, DOL attempts and the student-facing grant `{ extraAttempts,
   changedAt }`); no teacher account, reason or authorization list. A document
   for anyone else is dropped even if a cache handed it over. Every lesson the
   device holds goes through ONE projection, `projectStudentAssignments`:

   `studentAssignmentView(lesson, { studentId, privateOverride })` → class-wide
   DOL data without staff names → `withStudentSupportDates`

   Dashboard cards, Resume/Open, the lifecycle, due and final dates,
   extensions, excused, reopened, the DOL attempt budget, the Grade Center,
   Recovery, Practice Pass and make-up all read those objects; no screen
   decides a precedence. Until the listener answers, the student's own shared
   entry stands (the mirror keeps it complete); once retired, a lesson without
   a record is simply the class's.

   **No classmate's data in the student's JavaScript.** The one door from a
   snapshot into the app (`studentScopedAssignment`) reduces every lesson to
   that student's view before anything stores it. No state, ref or model holds
   another student's `studentOverrides` entry, `excusedStudentIds`,
   `reopenedStudentIds`, `dol.attemptGrantsByStudentId` or students-scope
   recovery entry — even while the shared copy still physically carries them.
   Class-wide DOL data (the class grant, its windows, the class-scoped log)
   keeps every count and date and loses the staff names (`changedBy`,
   `openedBy`, `unlockedBy`, `closedBy`, `teacherId`). The browser journey reads
   React's state from the root fiber to prove it (P1, P2).
2. **Teacher: one class-scoped listener.** `useTeacherClassControls` keeps ONE
   listener: `authorizedTeacherEmails array-contains me` and `classId in [...]`
   — the active class first, then any class an open surface shows (Live
   Class, the assignment hub, Attendance History, a case review or support
   report) and, on the cross-class tabs (Grade Export, Action Center, Parent
   Contacts), the classes the teacher teaches (at most 30). It never preloads
   the school. A changed scope is followed once it has held for 150 ms, so one
   class switch replaces the listener once; signing out, or another viewer,
   applies at once. `projectTeacherAssignments` feeds
   `teacherAssignmentView`, which replaces only `studentOverrides` — never
   `dol`. The root administrator's scope is `classId in [...]` alone.
3. **DOL grants through the callable.** "+1 DOL attempt" for selected students
   is `setStudentAssignmentControls`: grouped by each student's own class, at
   most 60 per call, at most one request in flight per set of students
   (`dolAttemptGrantClient.js`). Every class-level DOL action writes only the
   `dol` fields it changed, as dotted paths (`classDolFieldPatch`), and that
   helper refuses to carry `attemptGrantsByStudentId` — so neither this
   release nor a stale tab of it can write a student's grant. The shared
   confirmation ignores a backdrop press within 500 ms of opening (the second
   half of the double-click that opened it), so a double-click asks once and
   grants once.
4. **Save paths** are unchanged: a whole-assignment save still goes through
   `stripAssignmentInstanceState`, and the rules refuse a write that changes
   `studentOverrides` (or, once retired, any per-student shared field).
5. **History.** A student's grant history is read by staff, on request, from
   `grades/{sid}/assignmentOverrideEvents` (`fetchStudentOverrideHistory`, one
   bounded query; the rules refuse it to students). The record a student
   reads names the kind of actor (`teacher`, `rootAdmin`, `migration`,
   `absorber`, `system`), never the account; the account, the reason and each
   student's share of the old shared log stay in the staff-only history.
6. **Admin.** The Stage 4 workflow (§11, §15).

### Shared Chromebooks: sign-out, account change, cache

* **In-app state.** At sign-out (`handleLogout`) and at any account change
  (the session effect), the lessons and every copy they were projected from
  are dropped before the next account hydrates. The controls hooks are keyed
  by account (the student id; the teacher's email, root flag and classes) and
  return nothing for any other account on any render. `AuthProvider` ends
  the previous session the moment another uid appears, without waiting for
  the new account's claims, and the app renders signed-in screens only while
  `auth.session.uid === user.uid`. The browser journey (P2) checks the screen
  at every React commit during the switch, with slow claims and slow private
  controls: removing the render guard shows one committed frame with the
  previous student's name and extension; removing AuthProvider's reset leaves
  the previous screen up for the claims round trip. Both are caught.
* **Rules.** The next student can neither list nor fetch the previous
  student's records, cached or not (`tests/rules/studentControlsClientRules.test.mjs`).
* **Cache.** Firestore's persistent cache (IndexedDB, multi-tab) stays on:
  offline work depends on it, and the evidence did not show a need to turn it
  off. A query never returns a cached document it does not match, so the next
  student's `studentId == them` listener cannot be handed the previous
  student's records; the projection would drop one anyway (P2 "cached"). The
  cache is per browser profile, not per account, and was before this
  release: it holds what the previous account's listeners received (lessons,
  grades, and now private records). That device-level exposure — someone
  with developer tools on a shared profile — predates this release and is not
  widened by it. A follow-up could clear the persistence on an explicit
  "shared device" sign-out; separate browser profiles per student are the
  district-level answer.

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
| **3. Writers on private storage** | Every server writer since Stage 1; the client cutover (§9) moves the last browser writer (the DOL grant) onto the callable. Previous-release browsers' writes are absorbed within seconds. | — | As Stage 1 |
| **4. Students stop receiving classmates' controls** | Admin card, one deliberate step at a time (§15): **Record this release as live** → after one full school day, **Retire the shared copy** (typed `RETIRE SHARED COPY` + the school-day attestation) → **Strip dry run** → separately, **Strip shared copies** (typed `STRIP SHARED COPIES`). Retiring turns the mirror off and the rules lock on. In the same transaction as each removal, the strip verifies that every student it names is exactly represented in private storage, and it archives the verbatim content first. | The server's gate (`functions/shared/overrideRetirementGate.mjs`), re-checked in the transaction that flips the switch: the client cutover deployed; live one full school day; a full backfill pass completed; zero failures. A strip also needs a dry run of the same scope, finished after the retirement, with no failures. | **Keep the shared copy in step again** (never gated; it sets the cutover record aside, so retiring again starts over), then **Restore** (dry run first; typed `RESTORE SHARED COPIES`), which writes every private record back onto the shared copy in mirror form, so a previous-release client reads the same again. Rehearsed end to end in `scripts/rehearse-student-assignment-overrides-migration.mjs`. |
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
for its own controls. A teacher adds ONE, for the classes on screen (§9.2).
Neither depends on class size or lesson count, and there are no per-student or
per-lesson listeners. Initial teacher read: one document per (student,
lesson) that has any control.

**Measured on the devices** (`scripts/certify-student-controls-client-cost.mjs`:
the real client modules as every student device of the class and its teacher,
one Firestore client each, under the real rules; a school of four classes,
three lessons each, the same lesson and control spread as above):

| | 30, mirror | 30, retired | 60, mirror | 60, retired |
| --- | --- | --- | --- | --- |
| Student listeners | 2 | 2 | 2 | 2 |
| Student initial reads (KB) | 5 (136) | 5 (129) | 5 (141) | 5 (129) |
| Classmates in what Firestore delivered / in the app | 15 / **0** | 0 / **0** | 30 / **0** | 0 / **0** |
| Student app state | 129 KB | 129 KB | 129 KB | 129 KB |
| Teacher listeners (assignments + controls) | 2 | 2 | 2 | 2 |
| Teacher initial reads (the school's 12 lessons + the class's records) | 60 | 60 | 102 | 102 |
| One extension: reads, KB, devices that hear it | 33, 1,401, 31 | **2, 1.2, 2** | 63, 2,858, 61 | **2, 1.2, 2** |
| One extra DOL attempt | 33, 1,401, 31 | **2, 1.3, 2** | 63, 2,859, 61 | **2, 1.3, 2** |
| Lesson re-sent by that one change | 31× | **0** | 61× | **0** |
| Teacher class switch (×10): reads each | 48–50 | 48–50 | 90–92 | 90–92 |
| Cross-class view (4 classes, one listener): reads | 134 | 134 | 218 | 218 |
| Assignment switches (×20): listeners opened, reads | 0, 0 | 0, 0 | 0, 0 | 0, 0 |
| Sign-out → next student: listeners after, then reads | 0 → 2, 6 | 0 → 2, 6 | 0 → 2, 6 | 0 → 2, 6 |
| Node heap per simulated device (indicative) | 1.6 MB | 1.3 MB | 1.5 MB | 1.3 MB |

Class-switch reads are without a persistent cache; in a browser, a class
switched back to within 30 minutes resumes from its cached results. In the
real app (the teacher-workflow harness) one class switch opens one controls
listener, and Grades, Classes, Grade Export, Action Center and back leave the
same listeners open (P3).

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
| Backfill of two lessons | — | 78 [72] at 30; 140 [134] at 60 | — |
| Strip dry run of two lessons | — | — | 114 [1] at 30; 204 [1] at 60 |
| Strip of two lessons | — | — | 115 [6] at 30; 205 [6] at 60 |

(Each migration page reads and writes the server's pass record once — what
the retirement gate counts, §15.)

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
2. the last full strip (or its dry run) reported
   `assignmentsWithSharedStudentData: 0`, `assignmentsAwaitingAbsorption: 0`,
   `studentsAwaitingAbsorption: 0` and no failures, after the retirement;
3. that has held for 30 consecutive days with no restore since, so any
   restore has been ruled out;
4. no previous-release client is still being served: the release before the
   client cutover is no longer deployed or rolled back to.

The server computes 1–3 (`readiness.legacyIgnore`: `cleanSinceMs`,
`earliestMs`, `eligibleByTime`), and the admin card shows it; a canary
(prefixed) strip never starts the clock, and a restore resets it. Condition
4 is the operator's to confirm. Nothing deletes on its own.

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

* `scripts/certify-student-assignment-overrides-cost.mjs` — the server's
  numbers in §12.
* `scripts/certify-student-controls-client-cost.mjs` — the devices' numbers in
  §12 (listeners, reads, bytes, memory, switching, sign-out/in).
* `scripts/rehearse-student-assignment-overrides-migration.mjs` — the
  operator's whole sequence (§15), full passes, on every legacy shape, with
  effective access checked after each step.
* `tests/browser/teacherWorkflow/privateControlsJourneys.mjs` — the real app
  in both storage states, desktop and phone (P1–P5).
* Admin → Classes → *Students' own assignment controls* — the staged card.

## 15. The Stage 4 gate and the operator's record

`setAssignmentOverrideStorage` takes `{ action }`: `status`,
`confirmClientCutover`, `retire`, `mirror` (`{ sharedRetired }`, #432's shape,
means retire / mirror). The flag document every signed-in client reads carries
`sharedRetired` and `updatedAt` only; who acted, when and on what evidence go
to the root-only migration record (`platformMigrations/studentAssignmentOverrides`:
`cutover`, `retirement`, `previousCutover`, the passes) and the admin audit log
(`student_assignment_overrides_*`).

What the server proves, and what it cannot — said, not pretended:

* **Deployed.** The server reads the live build manifest itself
  (`mathmaster-build.json`, served no-cache), which the build stamps with
  `privateAssignmentControlsClient: 1`. A manifest without it blocks. A
  manifest the server cannot read (an emulator, a network failure) proves
  nothing, so recording the cutover then needs the administrator's explicit
  attestation, which is recorded.
* **Live one full school day.** Counted from the server-stamped moment the
  cutover was recorded (never a time a browser sends): the first whole
  weekday after it, midnight to midnight in America/Chicago, must be over.
  The server cannot see holidays or staff days, so retiring also needs the
  administrator's attestation that students used the release for a full
  school day; the card names that day from the district calendar.
* **Full backfill, zero failures.** Counted by the server page by page as one
  pass: a pass completes only when every page from the first ran in order,
  and its failures are the sum over all of them. A canary (prefixed) pass
  never counts.
* **Re-checked** in the transaction that flips the switch; the refusal names
  every failing gate and is audited.
* **Rollback** is never gated, and it sets the cutover record aside: retiring
  again needs the release recorded as live again and another full school day.

The card's steps are separate, deliberate actions — a dry run and the strip
are never one click: Mirrored → Backfill incomplete → Backfill complete,
waiting for the safety period → Ready to retire → Retired. The strip's dry run
reports assignments scanned, assignments with shared student data, records
confirmed private, students awaiting absorption (copied in first by the real
strip), failures, and archives that would be written.
