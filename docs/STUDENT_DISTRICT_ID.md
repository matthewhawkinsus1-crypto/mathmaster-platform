# A student's two IDs: MathMaster account ID and district ID

Every MathMaster student has two numbers that usually look the same and mean
different things. This page says what each is for, how a teacher corrects the
district one, and what the platform guarantees when they do.

The rules live in one module, `functions/shared/studentDistrictId.mjs`, shared
by the server, the browser, the teacher-workflow harness and the tests.

## Why this exists

A student created her MathMaster account and mistyped her student number. The
number was wrong but *valid-looking* — all digits — so nothing ever flagged it:
`createStudentAccount` stored it as her district ID, Grade Export took it as
valid, and its repair list (which only appeared for a *missing or invalid* ID)
never showed her. Her teacher matched the account to her Google Classroom name;
she did weeks of graded work; every TEAMS file addressed the wrong number.

Renaming `grades/{id}` would orphan her entire history, Classroom link, PIN and
Google sign-in, so the account ID stays. What changes is the district ID.

## The two IDs

| | MathMaster account ID | District ID |
| --- | --- | --- |
| Where | the `grades/{studentId}` document ID | `grades/{studentId}.sisStudentId` |
| What it is | MathMaster's stable internal key | the district's number for the student (TEAMS, Skyward) |
| Used for | everything the student owns, and sign-in | addressing grade exports; matching district files |
| Can it change? | **never** | yes — a teacher may correct it (`setStudentSisId`) |

What is keyed by which:

| Keyed by the **account ID** (never changes) | Keyed by the **district ID** |
| --- | --- |
| attempts, grades, evidence, rewards, supports (`grades/{id}` and its subcollections) | every row of every TEAMS file |
| PIN credential, sign-in alias, lockout, the Firebase UID `student:{ID}` | the case review's gradebook import (first match key) |
| the Google sign-in link (`studentDirectory/{email} → studentId`) | the Classroom roster "ID, Name" bridge (first match key) |
| the teacher's Google Classroom match (`classroomRosterLinks`, `googleUserId`) | |
| Grade Export history (`gradeTransferSnapshots` rows carry both) | |

A student always signs in with the **account ID** (or Google). Correcting the
district ID never changes how they sign in, and the district ID never becomes a
second way in.

## Which number Grade Export uses

`effectiveDistrictStudentId(record)` (exported to Grade Export as
`authoritativeSisStudentId`):

1. the stored `sisStudentId`, whenever one is stored — even an invalid one,
   which is then a problem to repair, never a reason to fall back;
2. otherwise, for a legacy record, an all-digit account ID;
3. otherwise nothing — the row is held back ("Missing or invalid SIS Student ID").

Every export path goes through it: initial, "changes only" (update), "export
again", section files (Warm-Up, Classwork, Practice, DOL) and whole-assignment
files, and the snapshot each export records. Two further rules:

- **A district ID two students share holds both rows back**
  ("SIS Student ID shared with another student"; leading zeros ignored), so one
  child's grade is never sent onto another's record.
- **A corrected district ID makes the student's rows "changed since export"**
  even though no grade moved. The status says so — "District ID corrected for 1
  student since … — export again" — and does not call an unchanged grade a
  changed one. The review step and `MANIFEST.txt` name the correction
  (`111111 → 222222`). "Download last file" is an exact copy of history, so it
  keeps the old number; the teacher is warned when it does.

## Correcting a district ID — the teacher's workflow

**Student Access** is the canonical place (every student the teacher has):

1. Find the student (search works on name, MathMaster ID and district ID).
2. The row reads `Name · MathMaster ID 111111` and either *District ID: same as
   the MathMaster ID*, *District ID 222222 · MathMaster account ID and district
   ID differ. Grade exports use the verified district ID.*, or a warning when
   there is none.
3. **Edit district ID** opens a form showing both numbers, what each is for,
   and what a change does not do: it does not create a new student, does not
   move, copy or delete any work, does not change the MathMaster account ID or
   how the student signs in — it changes only the number future exports use.
4. Type the correct number (digits only). A preview reads "Future grade exports
   will use district ID 222222 instead of district ID 111111."
5. **Save district ID**. The confirmation: *District ID updated for … The
   student's MathMaster account, work, and grades were not changed. Future
   grade exports will use 222222.* — plus, when a number was replaced, that
   grades already sent to TEAMS under the old number are not moved by
   MathMaster.

**Grade Export** offers the same form in *Check or correct district student
IDs* (collapsed; every student in the export's scope, searchable), beside the
existing automatic repair list for missing, invalid or shared IDs.

**Then, in TEAMS:** export again (the affected lessons read "Changed since
export" with the reason), upload with *Overwrite existing grades = YES*, and
remove any grade that TEAMS accepted under the old number. MathMaster cannot
reach into TEAMS; the confirmation, the review step and the manifest all say so.

## The server contract: `setStudentSisId`

- **Who:** the root administrator, the student's roster teacher
  (`assignedTeacherEmail`), or the teacher of record of the student's class —
  the same people who may correct the student's name.
- **What:** 1–20 digits, nothing stripped or guessed. A student on the roster.
- **Refused when another student already answers to the number** (below).
- **One transaction:** the duplicate check, the update and the audit entry.
  Every read is a field mask; no attempt history is loaded.
- **Writes exactly** `sisStudentId`, `sisStudentIdVerifiedAt`,
  `sisStudentIdVerifiedBy`, `updatedAt` on `grades/{studentId}`, plus one
  `adminAuditLog` entry (`sis_student_id_set`) with
  `details: { previous: { sisStudentId, exportId }, next: { sisStudentId }, classId }`.
- **Returns** `{ studentId, sisStudentId, previousSisStudentId, changed }`.

Firestore rules pin all three district ID fields against every client write
(`sisIdentityUnchanged`, `sisIdentityAbsentOnClientCreate`); only Admin SDK
callables can change them. No browser code holds a Firestore client in a file
that reads a district ID.

### The duplicate rule

A number may become a student's district ID only when no *other* student
already answers to it, leading zeros ignored (`0222222` is `222222`):

1. another record **stores it as its district ID** — refused; or
2. another record's **account ID is that number** — refused. For a legacy
   record with no stored district ID, that account ID *is* its district ID. For
   a record whose district ID was corrected away from it, it is still the
   number that student signs in with, and earlier TEAMS files carry it.

Students are never merged, and a refusal names no other student. The account
ID part was reviewed and kept strict: relaxing it for a record whose district
ID was corrected away would let the real holder of a mistyped number get it as
a district ID, but would leave one number naming two students in two
namespaces. That needs a person to look at both records.

`createStudentAccount` applies the same rule: a new account's number is also
its district ID, so it is refused when another student's district ID — say one
a teacher just corrected to that number — already uses it.

## What never changes when a district ID changes

The account ID and everything keyed by it: attempts, grades, evidence, rewards,
supports, Classroom links, the PIN, sign-in aliases, the Google link, export
history, and every other student. `tests/platform/studentDistrictIdCorrection.test.mjs`
proves it by running the real callables against a strict Firestore stand-in
and comparing every collection before and after.

## Tests

| What | Where |
| --- | --- |
| The 111111 → 222222 story through the real callables (`setStudentSisId`, `listSignInAccess`, `studentSignIn`, `resolveSignedInRole`, `createStudentAccount`) | `tests/platform/studentDistrictIdCorrection.test.mjs` |
| Every export path after a correction; invalid, missing and shared IDs | `tests/platform/gradeTransferDistrictIdCorrection.test.mjs` |
| Case review and Classroom bridge matching | `tests/platform/districtIdMatching.test.mjs` |
| Screens wired to the callable; teacher copy | `tests/platform/studentDistrictIdUiWiring.test.mjs` |
| Rules: no client writes a district ID | `tests/rules/studentDistrictIdRules.test.mjs` (`npm run test:rules`) |
| The whole workflow in the real app, teacher to TEAMS file | `tests/browser/teacherWorkflow/districtIdJourneys.mjs` (CI: *Student and Teacher Journeys*, `district-id` job) |

## Known limits

- **The mistyped number stays the student's sign-in ID.** If the real holder of
  that number later needs a MathMaster account, `createStudentAccount` refuses
  it (the account ID exists). Resolving that needs an account-ID migration,
  which this change deliberately does not attempt.
- **Grades already in TEAMS under the old number** must be removed in TEAMS by
  a person.
- **Duplicate detection in Grade Export sees the teacher's own roster.** A
  legacy duplicate with another teacher's student is caught by the server
  for new changes and counted by `scripts/student-identity-repair.mjs`
  (`duplicateSisIds`), not by the export screen.
- **The check and write are one transaction, not a uniqueness index.** Two
  teachers saving the same new number for two students in the same instant is
  the one race a per-number claim document would close.
- **Export snapshots trust the client's district IDs.**
  `persistGradeTransferSnapshot` validates each row's format, not that it is
  the student's current district ID. Grade Export builds rows from live grades
  documents, so this needs an offline device racing a correction; a server
  re-check would make it a server guarantee.
