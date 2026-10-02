# Student identity repair runbook

`scripts/student-identity-repair.mjs` audits every student's name on the
canonical roster record (`grades/{studentId}`) and, only when asked, fills in a
name that is missing there but already on file elsewhere **for the same
studentId** — and vouched for by at least one source that does not depend on a
teacher's Google Classroom match (see [Which sources can write a name](#which-sources-can-write-a-name)).

## Why this exists

Some legacy students were created with no name on the canonical record: by
sign-in before roster creation was locked down, by browser-side creation, or
by `createStudentAccount` when names were optional. For Classroom-linked
students the only name was the Google Classroom copy, `googleName`. When the
teacher roster moved to the lightweight `listSignInAccess` projection, that
field was dropped and Live Class tiles showed a bare numeric id where a name
belonged.

The display fix (the shared resolver in `functions/shared/studentIdentity.mjs`)
already shows `googleName` again and shows **Name unavailable · ID …** when no
name is on file. This tool makes the canonical record complete, so every
screen, export and server writer reads the same name from one place.

## What it reads

Every read is projected. No attempt history is ever loaded.

| Collection | Fields | Used for |
| --- | --- | --- |
| `grades` | `firstName`, `lastName`, `displayName`, `googleName`, `name`, `studentName`, `status`, `sisStudentId`, `googleUserId`, `profile`, `identityBackfill` | the canonical record, legacy name copies, and identifiers a name must not equal |
| `adminAuditLog` (`action == student_account_created`) | `target`, `details` | the name typed when the account was created |
| `classroomRosterLinks` | `studentId`, `name`, `googleUserId`, `courseId` | the Classroom roster name |
| `studentAliases` | `key`, `studentId` | mismatch counts only |
| `studentDirectory` | `studentId`, `uid` | mismatch counts; which Google account is linked |
| `studentCredentials` | document ids only | mismatch counts only |
| Firebase Auth `getUsers` (batches of 100) | `displayName` of the student's own directory-linked Google account | an **independent** source (`googleProfile`); skip with `--skip-google-profiles` |

The planner never takes an identifier, an email address, an id label
("Student 101410") or a placeholder ("Student", "Name unavailable") as a name.

## Which sources can write a name

A name is written only when **every** candidate source for that student agrees
(case, accents, punctuation and "Last, First" order do not matter) **and at
least one of them is independent of the Classroom link**:

| Source | Where it comes from | Independent? |
| --- | --- | --- |
| `accountCreationAudit` | `adminAuditLog` `student_account_created` → `details` (the name typed when the account was created) | yes |
| `googleProfile` | Firebase Auth `displayName` of the student's **own** Google account, linked through `studentDirectory` | yes |
| `legacyField` | `name`, `studentName`, `profile.displayName` / `.name` / `.googleName` on the record itself | yes |
| `googleName` | the Google Classroom copy on `grades/{studentId}` | **no** — Classroom link |
| `classroomRosterLink` | `classroomRosterLinks` `name` | **no** — Classroom link |

### Classroom-only names are not written

A Classroom link is a teacher's **revocable** match of a Classroom student to a
MathMaster record. When a teacher corrects a wrong match,
`linkClassroomRosterBatch` deletes `googleName` from the student who loses the
link. If the backfill had copied that name into `firstName`/`lastName`/
`displayName`, the record would keep the **wrong child's name** after the
correction. So a student whose only sources are `googleName` and/or
`classroomRosterLink` is **never written**, even when those two agree. Instead
the student is:

- counted in `active.recoverableElsewhere` **and** in
  `active.classroomNameAwaitingConfirmation`;
- listed under `needsStructuredNameConfirmation` with reason
  `classroomOnlySource` (visible with `--list-ids`).

Nothing is lost on screen: the roster projection resolves `googleName` at read
time, so teachers still see the Classroom name. A person makes it permanent by
confirming it in **Sign-in Access** (see [Unresolved and awaiting students](#unresolved-and-awaiting-students)).

`plannedUpdatesBySource` still reports `googleName` or `classroomRosterLink`
when that was the most trusted agreeing text; the write happened only because
an independent source agreed with it.

### Names with a suffix

"Jordan Williams, Jr." is a name plus a generational suffix (`Jr`, `Sr`, `II`,
`III`, `IV`, `V`, `VI`), **not** "Last, First". The backfill never splits it:
it gets `displayName` only (when `displayName` is missing) and is listed for a
person to confirm first/last. The same holds for any comma form with more than
one word on either side ("Williams Smith, Jordan"). On screen the display parts
are first "Jordan", last "Williams" (so the class display shows "Jordan W.",
never "Jr…"), and stored copies keep the full "Jordan Williams, Jr.".

## What it changes, and what it never changes

**It may write only:**

- `firstName`, `lastName` and `displayName`, **only where they are missing**;
- an `identityBackfill` stamp beside them:
  `{ runId, at, source, split, filledFields, version }`. The stamp holds no name.

**It never:**

- overwrites a valid stored name (a stored `displayName` or stored first/last always win);
- writes a name whose only sources are the Classroom link (`googleName`,
  `classroomRosterLink`) — see above;
- writes first/last from a guess. A split is written only for exactly two words
  (neither a suffix) or "Last, First" with exactly one word on each side.
  "Marlo Jean Sampleby" and "Jordan Williams, Jr." get `displayName` only, and
  are counted under *needs a person to confirm first/last*;
- fills anything on a record that has a stored `displayName` **and** a lone
  stored `firstName` or `lastName` (reason `partialStructuredName`): splitting
  the display name could contradict the stored part, so a person confirms it;
- writes anything when two sources disagree (counted as *conflicting*);
- touches academic data: `gradesByAssignment`, `assignmentActivity`, evidence,
  attempts and the rest are never read or written;
- creates, renames, merges or deletes a document. Writes are `update()`, so a
  student deleted between the plan and the write is skipped and never recreated.
  Two students with the same name stay two students.

Each batch of up to 100 students is a transaction that reads them again and
re-plans. A student whose record changed since planning (deleted, named by a
teacher, a source edited) is skipped, and the report counts the skip.

After a run with `--execute` it writes one `adminAuditLog` entry
(`action: student_identity_backfill`, `target: <runId>`, `actorEmail: <--actor>`)
with counts only.

## Who can run it

- An operator with **Google application default credentials** that have
  Firestore read/write (and Firebase Auth read, for Google profiles) on the
  project. In practice that is root-admin access, for example a project Owner or
  Editor. Set up the credentials with:

  ```bash
  gcloud auth application-default login
  ```

- Without Auth read access the run stops and says so. It does not quietly plan
  without that source, because a missing source can hide a conflict. Re-run with
  `--skip-google-profiles` if you choose to plan without it. Expect fewer
  planned updates then: a student whose only independent source was the Google
  profile becomes Classroom-only and waits for a person. (Against the Firestore
  emulator with no Auth emulator, profiles are skipped automatically.)
- `npm --prefix functions ci` must have been run, because the tool loads
  `firebase-admin` from `functions/node_modules`.
- `--project` is required and there is no default. `--execute` and `--rollback`
  also require `--actor <email>`, and ask you to type the project id unless you
  pass `--yes`.

## Step 1: dry run (always first)

```bash
node scripts/student-identity-repair.mjs --project mathmaster-aleks
```

This writes nothing. Standard output is counts only. A JSON report with the same
counts is saved to `identity-reports/student-identity-audit-<time>.json`.

Read it before you go further. Check that:

- `planned updates` matches what you expect;
- `unresolved (no source / conflicting)` is plausible;
- `counts.active.classroomNameAwaitingConfirmation` in the JSON report (standard
  output includes these students in *need a person to confirm first/last*) —
  these students will **not** be written and need a teacher;
- the `mismatch:` lines show no surprises.

To see **which** students are unresolved, add `--list-ids`. The report then
lists studentIds (never names) under `studentIds.unresolved`, `.conflicts`,
`.needsStructuredNameConfirmation` and `.plannedUpdates`:

```bash
node scripts/student-identity-repair.mjs --project mathmaster-aleks --list-ids
```

## Step 2: execute (a separate, deliberate command)

```bash
node scripts/student-identity-repair.mjs --project mathmaster-aleks --execute --actor <your-email>
```

It plans again, prints the counts, asks you to type the project id, then writes
in transactions of up to 100 students. It prints the `runId`
(e.g. `identity-20261001T153012Z`) and the exact rollback command. Keep the
report: its `execution` block counts what was written and what was skipped.
Each runId is used only once. An execute refuses, before writing anything, if
students already carry its runId, so one rollback can never undo two runs.

Verify the result:

- run the dry run again. `planned updates` should be `0`;
- in **Sign-in Access**, the students the run repaired show names.

## Safe to re-run

Running `--execute` again plans and applies **0** updates, because the names it
filled are now present. The only write is that run's own audit entry. Running
it after more legacy data appears repairs only the new cases.

## Rollback

```bash
node scripts/student-identity-repair.mjs --project mathmaster-aleks --rollback <runId> --actor <your-email>
```

For every student **still carrying that run's stamp**, rollback deletes exactly
the fields the run filled (`identityBackfill.filledFields`) and the stamp,
nothing else. It writes an `adminAuditLog` entry with
`action: student_identity_backfill_rollback`.

What that means in practice:

- **A person's correction is never rolled back.** `setStudentName` (Sign-in
  Access → *Add name* / *Edit name*) deletes the stamp, so that student no
  longer matches the run.
- A field that held `null` before the run is **absent** after rollback. Both mean
  "no name on file", and the screens show *Name unavailable · ID …* again.
- The sources (`googleName`, roster links, audit entries) are never touched, so
  the display resolver still shows `googleName` where one exists.
- A second rollback of the same run finds nothing and changes nothing.

## Unresolved and awaiting students

The tool never invents a name, and never makes a Classroom-only name canonical.
Students counted as *unresolved*, as *awaiting confirmation of a Classroom
name* (`classroomNameAwaitingConfirmation`), or as *needs a person to confirm
first/last* are fixed by a person:

1. Get their ids with `--list-ids`. The report holds ids only;
   `studentIds.needsStructuredNameConfirmation[].reason` says why:
   `classroomOnlySource`, `recoveredNameNotSplittable`,
   `displayNameNotSplittable` or `partialStructuredName`.
2. A teacher of record or an administrator opens **Sign-in Access**, finds the
   student (search works by id), and uses **Add name** (no name on file) or
   **Edit name** (a name is shown — for a Classroom-only student, check the
   shown Classroom name is the right child and confirm it). Both call
   `setStudentName`, which validates first and last name on the server, writes
   only the name fields, removes any backfill stamp, and records
   `student_name_set` in `adminAuditLog`.

A confirmed student is complete; the next dry run no longer lists it.

## Counts glossary

All counts are numbers only. Under `active.*`, disabled students are left out.

| Count | Meaning |
| --- | --- |
| `totalStudents`, `activeStudents`, `disabledStudents` | roster documents (excluding `test_connection`), split by account status |
| `active.completeCanonicalNames` | first, last and display name are all stored and valid |
| `active.withFirstName` / `withLastName` / `withDisplayName` | a valid value is stored in that field |
| `active.missingDisplayNameOnly` | first and last are stored; displayName is built from them (`storedStructured`) |
| `active.displayNameWithoutStructuredName` | a displayName is stored without first/last |
| `active.missingAllNameFields` / `noUsableHumanName` | no valid canonical name field at all |
| `active.idLikeStoredName` | a stored name field holds an id, email or placeholder (ignored, never copied) |
| `active.recoverableElsewhere` | the name was found in another source, and every source agrees (includes Classroom-only students, which are not written) |
| `active.classroomNameAwaitingConfirmation` | every source agrees but all of them are the Classroom link (`googleName` / `classroomRosterLink`): **not written**; a teacher confirms the name in Sign-in Access |
| `active.notRecoverableAutomatically` | no source, or sources that disagree |
| `plannedUpdates`, `plannedUpdatesBySource.*` | students the run would write, by the source of the name |
| `plannedFirstLastSplits.twoPartName` / `.commaName` | first/last taken from "First Last" / "Last, First" |
| `needsStructuredNameConfirmation` | a person must confirm the name or its first/last: Classroom-only source, ambiguous split (three words, a suffix), or a lone stored first or last name |
| `unresolved.noAuthoritativeSource` / `.conflictingSources` | no write; a person adds the name |
| `duplicateHumanNames` | groups of different students with the same name. Reported, never merged |
| `duplicateSisIds` | groups of roster records sharing one SIS id |
| `identityRecordMismatches.*` | aliases, directory links, roster links or credentials that point at no roster record; alias keys that do not match their student; a Google account linked to several students in one course |
| `execution.applied` / `.skipped.{deleted,noLongerNeeded,planChanged}` | what `--execute` wrote, and what it skipped after the in-transaction re-check |
| `rollback.rolledBack` / `.fieldsRemoved` / `.skipped` | what `--rollback` removed |

Sources, most trusted first: `storedStructured`, `storedDisplayName`,
`accountCreationAudit`, `googleName`, `classroomRosterLink`, `googleProfile`,
`legacyField` (`name`, `studentName`, `profile.*`). `googleName` and
`classroomRosterLink` never suffice on their own; see
[Which sources can write a name](#which-sources-can-write-a-name).

## Reports and student privacy

- Standard output is always counts only.
- Reports go to `identity-reports/`, which is **gitignored**.
- `--list-ids` adds studentIds, never names.
- `--include-names` adds the proposed names, which are **student PII**. Use it
  only when you are an authorized developer checking a run. The tool prints a
  warning, and the report says `"containsStudentNames": true`. **Never commit,
  paste or share that file.** Delete it when you are done.

## How it is tested

- `tests/platform/studentIdentityRepairPlan.test.mjs` covers the planner and the
  tool against an in-memory Firestore stand-in. It checks that the dry run
  writes nothing, that reads are projected, that writes use `update()` only, that
  re-runs are idempotent, that reports are redacted, and the rollback; that a
  Classroom-only name is never written, suffixes are never split, and a lone
  stored part beside a displayName is left for a person.
- `tests/platform/studentIdentityContract.test.mjs` (Test B) runs the tool's
  writer and the roster end to end, including a Classroom-only student that
  stays named on screen until a teacher confirms it with `setStudentName`.
- `tests/integration/studentIdentity/studentIdentityRepair.test.mjs` covers the same tool
  against the Firestore emulator, in its own project:

  ```bash
  npx firebase emulators:exec --only firestore --project mathmaster-identity-repair \
    --config tests/browser/emulator/firebase.json \
    "node --test tests/integration/studentIdentity/studentIdentityRepair.test.mjs"
  ```

  or `npm run test:identity-repair:emulator`, which CI runs as its own step
  (kept out of the parallel `test:challenge-finish` run so its load never
  races another suite). Without `FIRESTORE_EMULATOR_HOST` it skips and says why.

Every name in this runbook and in those tests is invented.
