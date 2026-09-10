# Current Content V2 Projection and Clean Export Design

## Purpose

MathMaster's safe live Content V2 upgrade preserves student history by leaving old questions at their original flattened storage/tracker indices, marking fundamentally retired questions with `teacherExcluded: true`, and appending corrected replacements with a new `questionId`, `supersedesQuestionId`, and `introducedInContentVersion`.

That storage model is correct for history, but the current runtime presentation leaks it. Appended correction sections such as `content-v2-corrections-warmup`, `content-v2-corrections-classwork`, `content-v2-corrections-practice`, and `content-v2-corrections-dol` appear as extra student/teacher sections. A four-part lesson therefore renders as eight tabs even though there are still only four logical instructional roles.

This design adds a **Current Content Projection** layer. It changes presentation and portable export only. It does not rewrite the stored live assignment, move tracker indices, delete historical questions, or create Content V3.

## Goals

- Present one logical Warm-Up, Classwork, Practice, and DOL for a live-safe Content V2 assignment.
- Show a V2 replacement in the same logical position as the V1 question it superseded.
- Keep the replacement's real appended storage/tracker index for attempts, responses, scoring, evidence, and grading.
- Hide retire-only historical questions from current presentation.
- Make Teacher Preview and student runtime use the same projection.
- Make Previous/Next, section tabs, question numbering, progress, section scores, Warm-Up/DOL timing, Focus View, Overview, and printable output use projected current-content order.
- Make default JSON export produce clean current Content V2 rather than live migration storage.
- Preserve behavior for ordinary V1 and clean Library V2 assignments.
- Require no Firestore migration for already-upgraded live assignments.

## Non-Goals

- Do not change `schemaVersion: 5`.
- Do not create Content V3.
- Do not physically merge or reorder stored `sections[]`.
- Do not change historical tracker keys or evidence records.
- Do not delete historical `teacherExcluded` questions from live storage.
- Do not change Safe Live Repair or the Content V2 live-upgrade server flow.
- Do not include the separate Full Audit no-op revision-counter defect in this change.

## Existing Storage Invariant

A fundamental live Content V2 repair currently keeps the historical V1 question at its original flattened index, marks it `teacherExcluded: true`, gives the corrected question a new ID plus `supersedesQuestionId`, and appends that replacement into a role-matched correction section.

That invariant remains untouched. The projection may reorder **view entries**, never stored questions.

## Architecture

Create a focused pure module:

`src/platform/assignments/currentContentProjection.js`

Primary interface:

```js
projectCurrentAssignmentContent(assignment) => {
  storageQuestions,
  entries,
  logicalSections,
  byStorageIndex,
  byQuestionId,
  diagnostics
}
```

Each projected entry contains:

```js
{
  question,
  questionId,
  storageIndex,
  logicalRole,
  logicalSectionId,
  logicalPosition,
  source: 'stored' | 'replacement',
  supersedesQuestionId: null | string,
  historicalStorageIndex: null | number
}
```

`storageIndex` is always the tracker/evidence index. `logicalPosition` is presentation-only.

## Projection Algorithm

### A. Flatten storage with section metadata

Walk saved V5 `sections[]` in literal stored order and create rows containing storage index, section ID, role, title, question, and question ID. Do not sort or filter during this first pass.

### B. Identify valid live-safe replacements

A replacement candidate is a non-excluded question with a nonempty `supersedesQuestionId`.

Before visually moving it, require all of the following:

- the superseded question ID exists exactly once;
- replacement ID differs from the superseded ID;
- superseded question is `teacherExcluded: true`;
- replacement resolves to the same instructional role as the historical question;
- no two active replacements claim the same `supersedesQuestionId`.

If a relationship is ambiguous, fail safe: keep the active replacement visible at its physical active position and emit a diagnostic rather than guessing.

### C. Build current logical order

Iterate original storage rows in order:

- normal included question with no replacement relationship -> emit it in place;
- excluded question with one valid replacement -> emit the replacement at this logical position while retaining the replacement's actual appended `storageIndex`;
- excluded question with no replacement -> emit nothing;
- replacement already emitted through its superseded location -> do not emit it again at the correction-section position.

Example:

```text
Storage:
0  Warm-Up q1
1  Warm-Up old-q2   teacherExcluded
2  Warm-Up q3
...
21 Warm-Up new-q2   supersedesQuestionId=old-q2

Projection:
Warm-Up Q1 -> storage index 0
Warm-Up Q2 -> storage index 21
Warm-Up Q3 -> storage index 2
```

The UI reads replacement state from `workingTracker[21]`, never from `workingTracker[1]`.

### D. Group logical sections

Group projected entries by logical instructional role, not physical correction container. A normal lesson therefore has one Warm-Up, one Classwork, one Practice, and one DOL. Quiz/test/checkpoint roles continue to behave as they do now.

Storage-only correction section titles and IDs must never create extra student tabs.

## Runtime Integration

`src/App.jsx` currently builds `visibleQuestionEntries` and `navigationSections` from raw included storage indices. Keep the raw `questions` array for tracker/evidence compatibility, but build visual entries from the projection.

Recommended shape:

```js
const currentContent = projectCurrentAssignmentContent(assignment);
const visibleQuestionEntries = currentContent.entries.map((entry, visiblePosition) => ({
  index: entry.storageIndex,
  visiblePosition,
  sectionPosition: entry.logicalPosition,
  question: entry.question,
  role: entry.logicalRole,
}));
```

All existing downstream calls may continue using `entry.index` because it remains the real tracker/storage index.

### Previous / Next and question numbering

Previous and Next traverse projected order. Question-number buttons and the select use logical numbering but keep storage indices as values/actions.

### Resume behavior

If a saved/resumed current index points to an excluded historical question, redirect to its active replacement when one exists. For retire-only, move to the nearest projected question using existing resume semantics. Never show excluded history in normal student or Teacher Preview.

### Progress and completion

Retired historical questions do not count in current totals. Replacements count exactly once. Completion and correctness still read tracker records at each projected entry's real storage index.

### Section grade projection

Current role scores must use projected entries so retired V1 questions are not double-counted and correction containers are not treated as independent sections. Credit remains read from each projected entry's actual tracker index.

This presentation change must never lower previously preserved earned credit.

### Warm-Up / DOL / manual section access

Timing and access logic operates on projected current content. A replacement DOL is still gated as DOL and a replacement Warm-Up as Warm-Up even though its stored container is a correction section.

## Other Current-Content Consumers

Audit and update every consumer whose meaning is 'questions the student currently receives', including:

- student assignment runtime;
- Teacher Preview / View as Student;
- Overview;
- Focus View;
- student worksheet/PDF;
- teacher worksheet/current-content preview;
- section completion and navigation;
- current section-grade presentation.

Historical/audit consumers continue using raw storage.

## Clean Current Content Export

Current default export calls `storedAssignmentToV5()` from stored sections, so a live-safe upgraded assignment exports historical questions plus correction containers.

Add a pure helper such as:

```js
buildCurrentContentPortableAssignment(assignment) -> AssignmentV5
```

Default export rules:

- build from Current Content Projection;
- output canonical V5 logical sections;
- omit historical `teacherExcluded` questions;
- omit storage-only correction containers;
- place replacements at their superseded question's logical position;
- keep each replacement's current `questionId` instead of resurrecting the retired ID;
- strip live migration-only markers such as `supersedesQuestionId` and `introducedInContentVersion` from portable questions;
- preserve corrected authored/grading content;
- reset assignment delivery identity exactly as existing portable export does;
- keep `schemaVersion: 5`.

Portable metadata should identify the source release:

```json
{
  "portableContract": {
    "kind": "mathmasterCanonicalAssignmentV5",
    "version": 1,
    "contentProjection": "current",
    "sourceContentVersion": 2
  }
}
```

Teacher-facing copy should say **Export Current Content V2** (or V1/V3 as applicable). Raw migration/history storage is not part of the normal export flow.

## Compatibility

### Clean Library Content V2

A Library V2 without historical correction containers projects identically to itself: same visible questions, roles, order, and IDs.

### Legacy Content V1

Assignments with no lineage/replacement relationships project identically to current behavior. No backfill is required.

## Malformed Relationship Safety

Diagnostics cover missing superseded target, duplicate supersedes claims, replacement of a non-excluded historical question, duplicate question IDs, and role conflicts.

For malformed live data, do not make the whole assignment unusable. Keep ambiguous active replacements visible at their physical active location, continue hiding explicitly excluded history, and surface diagnostics only to teacher/admin tooling and tests.

## Data Safety

This feature must not write:

- `assignments/{id}.sections`;
- `assignmentRevision`;
- `contentLineage.version`;
- student `gradesByAssignment`;
- evidence/history events;
- Google Classroom IDs or publication metadata.

Existing upgraded assignments should be corrected immediately by frontend deployment only.

## Regression Assignment

Use the upgraded Algebra I least-squares assignment as the primary fixture. It contains the four original lesson sections, excluded V1 questions, appended Content V2 correction sections, and replacements with `supersedesQuestionId`/`introducedInContentVersion: 2`.

Required regression result:

- raw storage unchanged;
- exactly four logical instructional sections;
- every retire+replace correction appears once at its retired question's original logical location;
- retire-only questions disappear;
- replacement entries retain their appended storage indices;
- no duplicate tabs;
- current-content export contains only the clean four logical sections;
- export contains no excluded V1 questions or `content-v*-corrections-*` sections.

## Testing

Create focused tests for:

- ordinary V1 identity projection;
- clean Library V2 identity projection;
- retire-only;
- retire+replace;
- replacements across all four roles;
- logical order with appended storage indices;
- malformed relationships;
- input immutability;
- Previous/Next and question numbering;
- resume from excluded historical index;
- section counts/grades using replacement storage indices;
- Warm-Up/DOL/manual access;
- clean current-content export;
- portable re-import;
- unchanged V1 and clean V2 exports.

Repository release gate:

```bash
node --test tests/platform/currentContentProjection.test.mjs
node --test tests/platform/currentContentNavigation.test.mjs
node --test tests/platform/currentContentExport.test.mjs
npm run test:platform
node --test tests/platform/*.test.mjs
npm run test:authoring-v5
npm run test:rules
npm run lint
npm run build
npm run build:firebase
git diff --check
```

## Expected Deployment Scope

Intended implementation is browser/pure-helper only:

```bash
firebase deploy --project mathmaster-aleks --only hosting
```

If implementation discovers a required Functions or Firestore Rules change, stop and re-review scope before broadening deployment.

## Acceptance Criteria

1. Existing live-safe V2 Firestore records remain unchanged.
2. No assignment revision is created by projection.
3. No Content V3 is created.
4. No tracker/evidence record moves indices.
5. Teacher Preview and student runtime show one logical section per instructional role.
6. Replacements appear at the original logical position of their retired question.
7. Navigation still reads/writes the replacement's true storage index.
8. Previous/Next follows logical order.
9. Question numbering follows logical role position.
10. Progress excludes retired history and includes replacements exactly once.
11. Current section scores use projected content without reducing preserved credit.
12. Warm-Up/DOL/manual section gates apply correctly to replacements.
13. Focus View and Overview use the same projected ordering.
14. Student printable output contains only current content.
15. Default JSON export produces clean current Content V2.
16. Default export contains no `teacherExcluded: true` questions.
17. Default export contains no `content-v*-corrections-*` sections.
18. Default export strips live migration-only question markers.
19. V1 and clean Library V2 behavior remains unchanged.
20. Malformed relationships fail safe without hiding the whole assignment.
21. Full platform certification passes before merge.