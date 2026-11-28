# Security review, 2026-11-28

A defensive review of the platform's own code. It covered:

- `firestore.rules`;
- the callable and HTTP functions under `functions/`, in the index and every domain module;
- the answer-key split;
- secure exams and Test Cycle, grade overrides, rewards and Live Challenge;
- this week's TEAMS sync, SchoolStatus family messages and Discipline Tracker.

This report records the fixes this change makes and the areas checked and found correctly guarded. Line numbers refer to this branch.

## Fixes

| ID | Area | Now enforced |
| --- | --- | --- |
| A1 | `linkGoogleAccount` | A roster row that names a student's Google account links only that account. An account already linked to one student is not moved to another. Wrong class codes are throttled per account. |
| A2 | `resetStudentPasscode`, `unlinkStudentAccount` | Only the student's own teacher or the root administrator. |
| A3 | Classroom course mappings | A mapping counts only while its teacher is still the class's teacher of record. |
| R1 | `settings/{docId}` | Teachers write only the shared documents the teacher screens manage. `serverGrading` and any other id are root-administrator only. |
| R2 | `studentRetentionSchedules` | Written only by the server. |
| R3 | `pathHistory` | Teachers read or change only students on their own roster. |
| A5 | `ensureClassroomTopics`, `publishClassroomMaterial` | At most 20 courses and 100 topics per call. |
| A6 | `getAssignmentByLaunchId` | Accepts a single assignment document id only. |
| T3 | `assignTestCycleSessions` | Named students are capped and validated before any read. |

**Deploy:** R1, R2 and R3 change `firestore.rules`, so this change needs `firestore:rules` deployed. All the other fixes are in functions.

**Tests.** Each fix has a test that fails on the code before the fix and passes after it. Both runs were made against the Firestore emulator, using the real rules or the real callables.

| Test file | What it covers | Before the fix | After the fix |
| --- | --- | --- | --- |
| `tests/rules/securityReview20261128Rules.test.mjs` | R1, R2, R3 | 3 of 4 fail | 4 of 4 pass |
| `tests/integration/securityReview20261128.test.mjs` | A1, A2, A3, A5, A6, T3 | 9 of 9 fail | 9 of 9 pass |

The integration file runs in `npm run test:challenge-finish`.

### A1: `linkGoogleAccount`

**Where:** `functions/classroomFunctions.js:283`.

**What is enforced:**

- When the roster row names the student's Google account (`googleEmail`, from the Classroom roster), only that account may link.
- An account already linked to a different student is refused with `already-exists`. The teacher unlinks it first.
- Wrong class codes and mismatches count against a per-account throttle: the same 8 tries and 10-minute lockout as PIN sign-in.

### A2: `resetStudentPasscode`, `unlinkStudentAccount`

**Where:** `functions/accountsFunctions.js:530` and `:559`. Both go through `requireStudentsTeacherForAccount` at `:505`.

**What is enforced:** both callables require one of:

- the student's roster teacher (`assignedTeacherEmail`);
- the class's teacher of record;
- the root administrator.

A student on no roster is refused. A sign-in key resolves through the student alias.

### A3: Classroom course mappings

**Where:**

- `getTeacherClassroomMapping` at `functions/classroomFunctions.js:567`;
- `loadTeacherMappings` in `functions/classroomSectionEntry.js:153` and `functions/classroomSectionForceEntry.js:63`;
- the new module `functions/lib/classroomMappingOwnership.js`.

**What is enforced:** a mapping counts only while the `teacherEmail` it was saved with is still the class's teacher of record, or is the root administrator. A mapping that fails this check reads as "not mapped", so every caller refuses with its existing message.

A mapping saved before mappings recorded `teacherEmail` keeps its previous behaviour. Operators can check for such mappings and backfill the field.

### R1: `settings/{docId}`

**Where:** `firestore.rules:2294`, with the new `teacherManagedSettingsDoc`.

**What is enforced:** a teacher may write only these documents:

- `classSchedule`
- `courseProfiles`
- `gradingPeriods`
- `assignmentFolders`
- `classPacing`
- `weeklyPathGoals`
- `skillOverrides`

The platform switch `settings/serverGrading`, and every other document id, can be written only by the root administrator. Reads are unchanged.

### R2: `studentRetentionSchedules/{studentId}`

**Where:** `firestore.rules:2464`.

**What is enforced:** `allow write: if false`. The server writes this collection; no browser does. This matches `studentMasteryHistory`. Reads are unchanged.

### R3: `pathHistory/{studentId}`

**Where:** `firestore.rules:1749`.

**What is enforced:**

- A teacher reads, changes or deletes a student's history only if the student is on their own roster (`teachesPresenceStudent`).
- The root administrator can always.
- The student's own app still logs each route.

### A5: Classroom course and topic lists

**Where:** `functions/classroomFunctions.js:988` (`ensureClassroomTopics`) and `:1168` (`publishClassroomMaterial`).

**What is enforced:**

- At most 20 courses per call, matching the publish callables.
- At most 100 topics per call, each name at most 120 characters.
- A value that is not an array is read as empty.

### A6: `getAssignmentByLaunchId`

**Where:** `functions/classroomFunctions.js:2811`.

**What is enforced:** the id must be a single document id: a string of at most 200 characters with no `/`. It is read through `collection().doc()`. The launch preview it serves is unchanged.

### T3: `assignTestCycleSessions`

**Where:** `functions/testCycleFunctions.js:2240`.

**What is enforced:** the call is refused before any read if it names more than 200 students, or if any id is not a document id.

## Checked and found correctly guarded

### Rules

The following collections are deny-all to clients:

- **This week's collections:** `disciplineIncidents`, `disciplineSettings`, `disciplineStatus`, `familyMessages`, `teamsSyncClasses`, `teamsSyncTargets`, `teamsSyncLedger` and `classroomReconcileRuns`.
- **Secure exam state:** `examSessions`, `examSubmissions`, `testCycle*`, `secureTestManifests` and `examIntegrityEvents`.
- **Role directories:** `teacherDirectory`, `studentCredentials` and `adminAuditLog`.

Other rules checked:

- **`grades`:** pins the roster, identity, SIS, Test Cycle, override, recovery and support-profile fields. A student's create is limited to a key list.
- **Parent Contacts and support events:** staff only, and append-only. A teacher's create is bound to their own roster and to an access list containing only themselves.
- **Live Challenge:** private state is deny-all, and solutions are written only after the round closes.
- **Roles:** come only from token claims.
- **Collection-group matches:** none is broader than intended.

### Discipline Tracker and SchoolStatus

- Every callable requires a teacher before doing anything else.
- A class's violations are recorded, changed and read only by its teacher of record, or by the root administrator.
- A tap is recorded only for a student on that class's roster, and at the server's time.
- Family messages are built on the server from the stored violations. Only the class's own teacher of record queues them, and each extension action loads only the caller's own messages.
- Conduct evidence is authorized the same way the case review is, and returns only the family contacts the caller may already read.
- Logs carry counts and ids, not district IDs or family contacts.

### TEAMS sync

- Every callable goes through `gradeTransferClassAuthority`: the teacher of record or the root administrator.
- Every input list is bounded by `TEAMS_SYNC_LIMITS`, and ledger writes per step are capped below the transaction limit.
- Targets keep only the rows whose student is on the class's roster under that district ID.

### Secure exams and Test Cycle

- Student-side callables take the student from the token and check the session owner inside a transaction.
- Responses carry no answer keys, and the released review strips review secrets.
- Teacher actions go through `assertTeacherMayManageAssignment`: the owner of every audience class.
- Grade overrides (`overrideStudentResponseGrade`, `overrideStudentAssignmentGrade`) check the teacher of record of the student's server-side class, inside a transaction.

### Rewards and Class Points

- Awards, reversals, redemptions and catalog saves check the owner, run in a transaction, and check the balance.

### Live Challenge

- Room actions check the owner.
- `submitLiveChallengeResponse` grades from private state held on the server, and caps elapsed time at the server's arrival time.
- `joinLiveChallenge` takes the student from the token.

### Math input

- Typed-entry length guards bound the cost of equivalence checks (`valuesEquivalent`, `numericSetCredit`).
