# Student identity repair runbook

`scripts/student-identity-repair.mjs` audits every student's name on the
canonical roster record (`grades/{studentId}`) and, only when asked, fills in a
name that is missing there but already on file elsewhere **for the same
studentId**.

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
| Firebase Auth `getUsers` (batches of 100) | `displayName` of the linked Google account | a lower-trust source; skip with `--skip-google-profiles` |

The planner never takes an identifier, an email address, an id label
("Student 101410") or a placeholder ("Student", "Name unavailable") as a name.

## What it changes, and what it never changes

**It may write only:**

- `firstName`, `lastName` and `displayName`, **only where they are missing**;
- an `identityBackfill` stamp beside them:
  `{ runId, at, source, split, filledFields, version }`. The stamp holds no name.

**It never:**

- overwrites a valid stored name (a stored `displayName` or stored first/last always win);
- writes first/last from a guess. A split is written only for exactly two words
  or exactly one comma ("Last, First"). "Marlo Jean Sampleby" gets `displayName`
  only, and is counted under *needs a person to confirm first/last*;
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
  `--skip-google-profiles` if you choose to plan without it.
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

## Unresolved students

The tool never invents a name. Students counted as *unresolved* or *needs a
person to confirm first/last* are fixed by a person:

1. Get their ids with `--list-ids`. The report holds ids only.
2. A teacher of record or an administrator opens **Sign-in Access**, finds the
   student (search works by id), and uses **Add name**, which calls
   `setStudentName`. It validates first and last name on the server, writes only
   the name fields, and records `student_name_set` in `adminAuditLog`.

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
| `active.recoverableElsewhere` | the name was found in another source, and every source agrees |
| `active.notRecoverableAutomatically` | no source, or sources that disagree |
| `plannedUpdates`, `plannedUpdatesBySource.*` | students the run would write, by the source of the name |
| `plannedFirstLastSplits.twoPartName` / `.commaName` | first/last taken from "First Last" / "Last, First" |
| `needsStructuredNameConfirmation` | a person must confirm first/last: ambiguous split, or a lone stored first or last name |
| `unresolved.noAuthoritativeSource` / `.conflictingSources` | no write; a person adds the name |
| `duplicateHumanNames` | groups of different students with the same name. Reported, never merged |
| `duplicateSisIds` | groups of roster records sharing one SIS id |
| `identityRecordMismatches.*` | aliases, directory links, roster links or credentials that point at no roster record; alias keys that do not match their student; a Google account linked to several students in one course |
| `execution.applied` / `.skipped.{deleted,noLongerNeeded,planChanged}` | what `--execute` wrote, and what it skipped after the in-transaction re-check |
| `rollback.rolledBack` / `.fieldsRemoved` / `.skipped` | what `--rollback` removed |

Sources, most trusted first: `storedStructured`, `storedDisplayName`,
`accountCreationAudit`, `googleName`, `classroomRosterLink`, `googleProfile`,
`legacyField` (`name`, `studentName`, `profile.*`).

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
  re-runs are idempotent, that reports are redacted, and the rollback.
- `tests/integration/studentIdentityRepair.test.mjs` covers the same tool
  against the Firestore emulator, in its own project:

  ```bash
  npx firebase emulators:exec --only firestore --project mathmaster-identity-repair \
    --config tests/browser/emulator/firebase.json \
    "node --test tests/integration/studentIdentityRepair.test.mjs"
  ```

  It also runs inside `npm run test:challenge-finish`. Without
  `FIRESTORE_EMULATOR_HOST` it skips and says why.

Every name in this runbook and in those tests is invented.
