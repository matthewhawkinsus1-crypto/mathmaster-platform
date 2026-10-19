# A Test Cycle blocked by one unimported family, and previewing it before it is saved (2026-10-07)

## The incident

The Algebra II Systems Unit Test (the PR #446 package) could not be published.
The server preflight said:

> Target systems-q08 (texas:A2.3F) names no approved, validated generator family.

Reproduced against the package with the real seed gate and the real preflight:
all ten families pass `processPathSeedImport`, and with all ten in the bank all
ten checks pass. With `mm_hawkins_A2_systems_test_v2_q08_rich` absent, the output
is the teacher's screenshot exactly: four checks fail and only the one error is
shown. Production held the nine `v1` families from an earlier package. Question
8's new Systems Workspace family had never been imported, because the package is
two files and only the V5 assignment had been imported.

**Operational fix. No deploy needed.** As the root administrator, go to
Administration → Path content coverage → Import a different seed package. Import
the package's `…_Secure_Families.json` file, then reopen the review.

The secure families are not committed here: this repository is public, and the
file holds the private grading definitions.

## What changed

| Where | Change |
| --- | --- |
| `functions/shared/testCyclePreflight.mjs` | `unavailableBlueprintFamilies` classifies every named family the bank cannot issue as `unregistered` (not held) or `retired` (held, inactive or unvalidated). The coverage error names the family and the import route. A covered target with an unusable alternate gets a warning. The result carries `unavailableFamilies`. The "was not checked against the grading gate" warning is no longer raised for a family that does not exist. |
| `LessonPreflightModal.jsx` | The root administrator can import exactly the missing families from the Test's families file, in place. It uses the same two-pass, all-or-nothing `seedPathQuestionBank`, then reruns the authoritative preflight. Families already in the bank are never rewritten, and retired ones are never re-imported. Other teachers are told who can do it. A **Preview the Test, Corrections and Retest as a student** button opens the full `TestCyclePreview` for the unsaved cycle. |
| `functions/index.js` | `previewTestCycleSecureItems` and `gradeTestCyclePreviewItem` accept an unsaved candidate (`{ assignment }`) as well as an `assignmentId`. Both paths use the same plan, instantiation, certification and sanitizer, and nothing is written. Candidate grading keeps the saved preview's boundary: teachers only, the family must be in the candidate's own blueprint, and the seed must name this teacher's preview student. The response names unfilled targets (`unfilledTargetIds`). |
| `testCycleCandidateContract` | The contract a candidate is previewed from: policy, blueprint or secure reference, declaring fields, and section roles. It carries no Review questions or answers. |
| `testCycleFamilyRegistration.js` | Pure helpers. They read `unavailableFamilies`, or derive it from `coverage` on a server deployed before it existed, and pick exactly the missing documents out of a families file. |

## Verification

- `tests/platform/testCycleMissingFamilyRecovery.test.mjs`: 11 tests. Fourteen
  deliberate mutations of the new behaviour each turn one of them red.
- `tests/integration/testCycleRichToolCertification.test.mjs`: new case for an
  unsaved candidate. It previews and grades all seven Rich Tools in Test,
  Retest and Corrections mode. A family outside the blueprint, another teacher
  and a student are refused. An unimported family is named by the preview and
  by preflight. Nothing is written. Removing the teacher check makes it fail.
- Out of tree, against the real package, through the real functions in the
  emulator:
  - blocked on Q8 only;
  - registering only Q8 then passes all ten checks with no warnings;
  - every Test, Retest and Corrections preview item grades a correct answer as
    correct and a wrong one as wrong, with Q8 in Systems Workspace in each mode;
  - assign → Review gate → untimed Test → release (50) → six Corrections → a
    seven-question Retest (100) → recorded 70.
- The same review screen was driven in Chromium against the real handlers at
  1366 px and 390 px. The in-place import and the unsaved preview worked, with
  no sideways scroll.

## Deploying it

Only four callables changed behaviour. Per AGENTS.md, deploy them by name,
functions first, then Hosting:

```bash
npm run build && npm run build:firebase
firebase deploy --project mathmaster-aleks --only functions:preflightTestCycleCandidate,functions:preflightTestCycleAssignment,functions:previewTestCycleSecureItems,functions:gradeTestCyclePreviewItem
FIREBASE_HOSTING_UPLOAD_CONCURRENCY=4 npm run deploy:hosting
```

`node scripts/release-firebase.mjs` plans the whole fleet for this diff, because
`functions/index.js` changed. That takes about 52 minutes, and it also adds
`path-admin`, which does not use this module. Either way is correct.

The review screen works against a server that predates this change. It derives
the missing families from `coverage`, so the in-place import works after a
Hosting-only deploy. The unsaved preview needs the two preview callables.
