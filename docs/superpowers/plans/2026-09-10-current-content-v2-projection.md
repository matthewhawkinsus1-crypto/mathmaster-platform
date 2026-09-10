# Current Content V2 Projection and Clean Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make live-safe Content V2 assignments present as one logical set of instructional sections and export as clean current-content V5 JSON without rewriting historical Firestore storage or tracker indices.

**Architecture:** Add a pure Current Content Projection that maps stored historical/replacement questions into logical student order while retaining each active question's real storage index. Wire only current-content consumers—runtime navigation, lifecycle/progress, grade presentation, printable output, and teacher JSON export—to that projection; keep raw storage APIs for audit/history/repair.

**Tech Stack:** React, Assignment V5, existing Firestore-backed tracker indices, Node.js test runner, existing MathMaster assignment lifecycle/grade/PDF/export helpers.

**Spec:** `docs/superpowers/specs/2026-09-10-current-content-v2-projection-design.md`

## Global Constraints

- `schemaVersion` remains exactly `5`.
- Do not create Content V3.
- Do not modify stored `sections[]`, `assignmentRevision`, `contentLineage.version`, student tracker/evidence records, or Google Classroom IDs.
- Never remap a replacement's tracker state from its appended storage index to the retired question's historical index.
- Raw storage readers such as `getStoredAssignmentQuestions()` remain available for audit/history/repair consumers.
- Current-content consumers must hide `teacherExcluded` history and show each valid replacement exactly once at the superseded question's logical position.
- Malformed replacement relationships fail safe: keep ambiguous active replacement visible at its physical active position and emit diagnostics rather than hiding the whole assignment.
- Ordinary Content V1 and clean Library Content V2 assignments must remain behaviorally unchanged.
- Default teacher JSON export becomes clean current content and remains Assignment V5.
- Expected deployment scope is Hosting only. If implementation requires Functions or Firestore Rules, stop and re-review scope before broadening deployment.

---

## File Structure

### New focused modules

- `src/platform/assignments/currentContentProjection.js` — pure storage-to-current-content projection, logical ordering, storage-index preservation, diagnostics, and resume-index resolution.
- `src/platform/assignments/currentContentPortableAssignment.js` — pure clean-current-content V5 export builder; strips live migration markers and correction containers.
- `tests/platform/currentContentProjection.test.mjs` — projection invariants, identity cases, malformed relationships, and real V2 migration shape.
- `tests/platform/currentContentNavigation.test.mjs` — lifecycle/navigation/grade contracts using projected storage indices.
- `tests/platform/currentContentExport.test.mjs` — portable JSON and worksheet/PDF current-content behavior.

### Existing files to modify

- `src/App.jsx` — use projected entries for student/teacher-preview navigation, resume/start behavior, student printable worksheet generation, and JSON export label/package.
- `src/assignmentLifecycle.js` — use projected current content for section existence, Warm-Up/DOL indices, and classwork completion while preserving raw storage helpers.
- `src/platform/teacher/gradeEvidence.js` — compute overall/current section grade presentation from projected entries while reading tracker records at real storage indices.
- `src/platform/resources/teacherAssignmentWorksheetExport.js` — build teacher worksheet entries from projection instead of raw included storage order.
- `src/platform/resources/assignmentWorksheetPdfModel.js` — no structural rewrite expected; add only regression coverage or a small adapter if required by projected entry metadata.
- `src/platform/contract/storedAssignmentV5.js` — keep raw reconstruction semantics; only add an explicit clean-current-content export seam if needed by the portable builder, not a global behavior change.

---

### Task 1: Build the Pure Current Content Projection

**Files:**
- Create: `src/platform/assignments/currentContentProjection.js`
- Create: `tests/platform/currentContentProjection.test.mjs`

**Interfaces:**
- Produces: `projectCurrentAssignmentContent(assignment) -> { storageQuestions, entries, logicalSections, byStorageIndex, byQuestionId, diagnostics, replacementStorageIndexByHistoricalStorageIndex }`.
- Produces: `resolveCurrentContentStorageIndex(assignment, requestedStorageIndex) -> number|null`.
- Each projected `entry` has `{ question, questionId, storageIndex, logicalRole, logicalSectionId, logicalPosition, source, supersedesQuestionId, historicalStorageIndex }`.

- [ ] **Step 1: Write identity and replacement-order RED tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  projectCurrentAssignmentContent,
  resolveCurrentContentStorageIndex,
} from '../../src/platform/assignments/currentContentProjection.js';

const v2 = {
  schemaVersion: 5,
  sections: [
    { id: 'warmup', role: 'warmup', questions: [
      { questionId: 'q1', prompt: 'Q1' },
      { questionId: 'old-q2', prompt: 'Old Q2', teacherExcluded: true },
      { questionId: 'q3', prompt: 'Q3' },
    ] },
    { id: 'classwork', role: 'classwork', questions: [{ questionId: 'c1', prompt: 'C1' }] },
    { id: 'content-v2-corrections-warmup', role: 'warmup', questions: [
      {
        questionId: 'new-q2',
        prompt: 'New Q2',
        supersedesQuestionId: 'old-q2',
        introducedInContentVersion: 2,
        activityRole: 'warmup',
      },
    ] },
  ],
};

test('replacement renders at historical logical position while retaining appended storage index', () => {
  const projection = projectCurrentAssignmentContent(v2);
  assert.deepEqual(
    projection.entries.map((entry) => [entry.questionId, entry.storageIndex, entry.logicalRole]),
    [['q1', 0, 'warmup'], ['new-q2', 4, 'warmup'], ['q3', 2, 'warmup'], ['c1', 3, 'classwork']],
  );
  assert.equal(projection.entries[1].historicalStorageIndex, 1);
  assert.equal(resolveCurrentContentStorageIndex(v2, 1), 4);
});

test('retire-only excluded question disappears without moving later storage indices', () => {
  const assignment = {
    schemaVersion: 5,
    sections: [{ id: 'practice', role: 'practice', questions: [
      { questionId: 'p1' },
      { questionId: 'retired', teacherExcluded: true },
      { questionId: 'p3' },
    ] }],
  };
  const projection = projectCurrentAssignmentContent(assignment);
  assert.deepEqual(projection.entries.map((entry) => [entry.questionId, entry.storageIndex]), [['p1', 0], ['p3', 2]]);
});
```

- [ ] **Step 2: Run RED**

Run: `node --test tests/platform/currentContentProjection.test.mjs`

Expected: FAIL because the projection module does not exist.

- [ ] **Step 3: Implement storage flattening and relationship validation**

Use section order as the immutable storage order. Resolve logical role from `question.activityRole || section.role` after trimming/lowercasing.

```js
const clean = (value) => String(value ?? '').trim();

const storageRows = (assignment = {}) => {
  const rows = [];
  (Array.isArray(assignment.sections) ? assignment.sections : []).forEach((section) => {
    (Array.isArray(section?.questions) ? section.questions : []).forEach((question) => {
      rows.push({
        storageIndex: rows.length,
        sectionId: clean(section?.id) || null,
        sectionRole: clean(section?.role).toLowerCase() || 'practice',
        sectionTitle: clean(section?.title) || null,
        question,
        questionId: clean(question?.questionId),
      });
    });
  });
  return rows;
};
```

Build maps by question ID. A valid replacement requires exactly one historical target, different IDs, historical `teacherExcluded === true`, same logical role, and only one active replacement for the target.

- [ ] **Step 4: Implement logical emission and section grouping**

```js
for (const row of rows) {
  if (row.question?.teacherExcluded === true) {
    const replacement = validReplacementByHistoricalId.get(row.questionId);
    if (replacement) emitReplacementAtHistoricalPosition(row, replacement);
    continue;
  }
  if (replacementStorageIndicesAlreadyEmitted.has(row.storageIndex)) continue;
  emitStoredRow(row);
}
```

Group emitted entries by first-seen logical role, assigning `logicalPosition` from zero within that role. Preserve `storageIndex` unchanged.

- [ ] **Step 5: Implement fail-safe diagnostics**

Diagnostics must use stable codes:

```js
'duplicate-question-id'
'missing-superseded-question'
'superseded-question-not-excluded'
'duplicate-active-replacement'
'replacement-role-conflict'
```

For an invalid relationship, do not relocate the replacement. Emit it normally at its active physical position if it is not excluded.

- [ ] **Step 6: Add malformed and identity tests**

```js
test('ordinary V1 projection is identity-preserving', () => {
  const assignment = { schemaVersion: 5, sections: [{ id:'cw', role:'classwork', questions:[{questionId:'a'},{questionId:'b'}] }] };
  const projection = projectCurrentAssignmentContent(assignment);
  assert.deepEqual(projection.entries.map((entry) => entry.storageIndex), [0, 1]);
  assert.deepEqual(projection.logicalSections.map((section) => section.role), ['classwork']);
});

test('ambiguous replacement stays visible at physical location and reports diagnostic', () => {
  const assignment = {
    schemaVersion: 5,
    sections: [
      { id:'w', role:'warmup', questions:[{questionId:'old', teacherExcluded:true}] },
      { id:'c', role:'classwork', questions:[{questionId:'new', supersedesQuestionId:'old'}] },
    ],
  };
  const projection = projectCurrentAssignmentContent(assignment);
  assert.deepEqual(projection.entries.map((entry) => entry.questionId), ['new']);
  assert.match(projection.diagnostics[0].code, /replacement-role-conflict/);
});
```

- [ ] **Step 7: Run GREEN and commit**

Run: `node --test tests/platform/currentContentProjection.test.mjs`

Commit:

```bash
git add src/platform/assignments/currentContentProjection.js tests/platform/currentContentProjection.test.mjs
git commit -m "feat: project current assignment content without moving storage"
```

---

### Task 2: Make Lifecycle and Grade Presentation Projection-Aware

**Files:**
- Modify: `src/assignmentLifecycle.js`
- Modify: `src/platform/teacher/gradeEvidence.js`
- Create: `tests/platform/currentContentNavigation.test.mjs`

**Interfaces:**
- Consumes: `projectCurrentAssignmentContent(assignment)`.
- Produces: `getCurrentContentQuestionIndices(assignment) -> number[]` from projected entry storage indices.
- Preserves: existing `getIncludedQuestionIndices()` raw included-storage semantics for history/repair callers.
- Updates current-content lifecycle functions to use projected entries/storage indices.

- [ ] **Step 1: Write RED lifecycle and grade tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getCurrentContentQuestionIndices,
  resolveDOLQuestionIndices,
  evaluateClassworkCompletion,
} from '../../src/assignmentLifecycle.js';
import { splitGradesBySection } from '../../src/platform/teacher/gradeEvidence.js';

test('current indices use replacement storage index, not retired historical index', () => {
  assert.deepEqual(getCurrentContentQuestionIndices(v2Fixture), [0, 21, 2, 3, 4]);
});

test('DOL replacement keeps DOL timing identity at appended storage index', () => {
  assert.deepEqual(resolveDOLQuestionIndices(v2DolFixture), [23]);
});

test('section grade reads replacement credit at replacement storage index', () => {
  const tracker = { 1:{status:'correct',bestPartialCredit:100}, 21:{status:'attempted',bestPartialCredit:60} };
  const grades = splitGradesBySection({ tracker, assignment:v2Fixture });
  assert.equal(grades.warmup.total, 3);
  assert.equal(grades.warmup.attempted, 1);
});
```

- [ ] **Step 2: Run RED**

Run: `node --test tests/platform/currentContentNavigation.test.mjs`

- [ ] **Step 3: Add projection-backed current-content helper without changing raw helper**

In `assignmentLifecycle.js`:

```js
export const getCurrentContentQuestionIndices = (assignment = {}) => (
  projectCurrentAssignmentContent(assignment).entries.map((entry) => entry.storageIndex)
);
```

Do not redefine `getIncludedQuestionIndices()` to call projection; audit/history code depends on raw storage visibility.

- [ ] **Step 4: Update current lifecycle consumers**

Update these functions to derive questions/indices from projection entries:

- `getSectionAccessState()` section-existence check;
- `getWarmupState()` authored Warm-Up existence;
- `resolveDOLQuestionIndices()` and therefore `getDOLState()`;
- `evaluateClassworkCompletion()`.

Use the original stored question array only to resolve `questions[entry.storageIndex]` and tracker records.

- [ ] **Step 5: Update grade presentation**

In `gradeEvidence.js`, replace raw `getIncludedQuestionIndices()` use inside `splitGrade()` and `splitGradesBySection()` with projected entries:

```js
const projection = projectCurrentAssignmentContent(assignment);
const questions = getStoredAssignmentQuestions(assignment);
const entries = projection.entries;

return splitGradeForIndices({
  tracker,
  questions,
  indices: entries.map((entry) => entry.storageIndex),
});
```

For `splitGradesBySection`, filter entries by `entry.logicalRole` and pass their storage indices. Do not use physical section-container roles.

- [ ] **Step 6: Add no-regression tests for V1/clean V2**

Assert existing V1 section totals and clean Library V2 totals remain unchanged.

- [ ] **Step 7: Run GREEN and commit**

Run:

```bash
node --test tests/platform/currentContentProjection.test.mjs
node --test tests/platform/currentContentNavigation.test.mjs
node --test tests/platform/gradeEvidence.test.mjs
```

Commit:

```bash
git add src/assignmentLifecycle.js src/platform/teacher/gradeEvidence.js tests/platform/currentContentNavigation.test.mjs
git commit -m "feat: use current content projection for lifecycle and grades"
```

---

### Task 3: Replace Student and Teacher Preview Navigation with Projected Order

**Files:**
- Modify: `src/App.jsx`
- Modify: `tests/platform/currentContentNavigation.test.mjs`

**Interfaces:**
- Consumes: `projectCurrentAssignmentContent()` and `resolveCurrentContentStorageIndex()`.
- Keeps: `questions = getStoredAssignmentQuestions(assignment)` for actual question lookup, tracker state, generation keys, and evidence.
- Replaces: visual ordering and section segmentation only.

- [ ] **Step 1: Add RED source/runtime contract tests**

```js
test('App builds visible navigation from current content projection', async () => {
  const source = await readFile('src/App.jsx', 'utf8');
  assert.match(source, /projectCurrentAssignmentContent/);
  assert.match(source, /entry\.storageIndex/);
  assert.match(source, /entry\.logicalPosition/);
  assert.match(source, /entry\.logicalRole/);
});

test('startAssignment resolves an excluded historical index to its replacement', async () => {
  const source = await readFile('src/App.jsx', 'utf8');
  assert.match(source, /resolveCurrentContentStorageIndex/);
});
```

- [ ] **Step 2: Run RED**

Run: `node --test tests/platform/currentContentNavigation.test.mjs`

- [ ] **Step 3: Import projection helpers and replace visible-entry construction**

Replace the current `includedQuestionIndices.map(...)` presentation path with:

```js
const currentContent = projectCurrentAssignmentContent(assignment);
const visibleQuestionEntries = currentContent.entries.map((entry, visiblePosition) => {
  const index = entry.storageIndex;
  const question = questions[index];
  const isTimedDOLQuestion = dolState.enabled
    && (dolState.questionIndices || [dolState.questionIndex]).includes(index);
  return {
    index,
    visiblePosition,
    sectionPosition: entry.logicalPosition,
    question,
    role: entry.logicalRole,
    isTimedDOLQuestion,
  };
});
```

- [ ] **Step 4: Build one navigation section per logical role**

Do not split based on raw adjacency. Build from `currentContent.logicalSections` so appended correction storage can never create a second Warm-Up/Classwork/Practice/DOL.

```js
const navigationSections = currentContent.logicalSections.map((logicalSection) => ({
  role: logicalSection.role,
  entries: logicalSection.entries.map((projected) => visibleByStorageIndex.get(projected.storageIndex)),
})).filter((section) => section.entries.length);
```

Then apply existing completion/allCorrect decoration.

- [ ] **Step 5: Fix current-question and resume resolution**

In `startAssignment()`, resolve the requested storage index through projection:

```js
const projectedRequested = resolveCurrentContentStorageIndex(assignmentData, requested);
const safeQuestionIndex = projectedRequested ?? currentContent.entries[0]?.storageIndex ?? 0;
```

Also add an effect/guard when an already-open assignment's `currentQuestionIndex` points to excluded historical storage after a V2 upgrade. Redirect to its replacement or first projected current entry without writing tracker state.

- [ ] **Step 6: Preserve tracker/evidence indexing**

Verify these still receive `currentQuestionIndex` as real storage index:

- `workingTracker[currentQuestionIndex]`;
- `recordedTracker[currentQuestionIndex]`;
- `generateQuestion(... index ...)` generation key;
- TeacherQuestionReviewPanel `questionIndex`;
- evidence/attempt commits.

Do not replace those indices with logical ordinal values.

- [ ] **Step 7: Add concrete duplicate-tab regression**

Use an eight-storage-section V2 fixture with four correction sections and assert rendered section-role data reduces to exactly `['warmup','classwork','practice','dol']` and each replacement appears once.

- [ ] **Step 8: Run GREEN and commit**

Run:

```bash
node --test tests/platform/currentContentProjection.test.mjs
node --test tests/platform/currentContentNavigation.test.mjs
npm run build
```

Commit:

```bash
git add src/App.jsx tests/platform/currentContentNavigation.test.mjs
git commit -m "fix: present live Content V2 as logical lesson sections"
```

---

### Task 4: Project Student and Teacher Printable Worksheets

**Files:**
- Modify: `src/App.jsx`
- Modify: `src/platform/resources/teacherAssignmentWorksheetExport.js`
- Modify: `src/platform/resources/assignmentWorksheetPdfModel.js` only if required for a stable projected-entry contract.
- Create: `tests/platform/currentContentExport.test.mjs`

**Interfaces:**
- Consumes: projection entries with true `storageIndex` and logical role.
- Produces printable entries `{ sourceIndex: storageIndex, sectionRole: logicalRole, sectionLabel, question }`.

- [ ] **Step 1: Write RED worksheet regression**

```js
test('teacher worksheet contains replacement once in original logical section', () => {
  const model = buildTeacherAssignmentWorksheetModel({ assignment:v2Fixture, outputMode:'teacher' });
  assert.deepEqual(model.sections.map((section) => section.role), ['warmup','classwork','practice','dol']);
  assert.equal(model.sections[0].questions.some((q) => q.sourceIndex === replacementStorageIndex), true);
  assert.equal(model.sections.flatMap((s) => s.questions).some((q) => q.sourceIndex === retiredStorageIndex), false);
});
```

- [ ] **Step 2: Run RED**

Run: `node --test tests/platform/currentContentExport.test.mjs`

- [ ] **Step 3: Update teacher worksheet builder**

In `teacherAssignmentWorksheetExport.js`, replace loops over raw included indices with `projectCurrentAssignmentContent(runtimeAssignment).entries`.

Use:

```js
const index = entry.storageIndex;
const question = questions[index];
const sectionRole = entry.logicalRole;
```

Keep generation keys based on `index`, not logical position, so personalized versions remain tied to the same stored question identity.

- [ ] **Step 4: Update student printable path in App.jsx**

At the student PDF loop near existing `getIncludedQuestionIndices(assignmentData)`, iterate projected entries in current logical order and preserve the real `sourceIndex`.

Apply existing Warm-Up/DOL/manual availability gates to `entry.logicalRole` and `entry.storageIndex`.

- [ ] **Step 5: Verify worksheet model does not re-split same roles**

`buildAssignmentWorksheetModel()` groups by `role::label`; with consistent projected role labels it should naturally yield one section per role. Add a direct model test rather than changing it unnecessarily.

- [ ] **Step 6: Run GREEN and commit**

Run:

```bash
node --test tests/platform/currentContentExport.test.mjs
node --test tests/platform/assignmentWorksheetPdfModel.test.mjs
node --test tests/platform/teacherAssignmentWorksheetExport.test.mjs
```

Commit:

```bash
git add src/App.jsx src/platform/resources/teacherAssignmentWorksheetExport.js src/platform/resources/assignmentWorksheetPdfModel.js tests/platform/currentContentExport.test.mjs
git commit -m "fix: export printable worksheets from current content"
```

---

### Task 5: Build Clean Current Content V5 JSON Export

**Files:**
- Create: `src/platform/assignments/currentContentPortableAssignment.js`
- Modify: `src/App.jsx`
- Modify: `tests/platform/currentContentExport.test.mjs`

**Interfaces:**
- Consumes: `projectCurrentAssignmentContent(assignment)` and existing `storedAssignmentToV5()`.
- Produces: `buildCurrentContentPortableAssignment(assignment) -> canonical Assignment V5`.
- Produces: `buildCurrentContentPortablePackage(assignment) -> Assignment V5 + portableContract`.

- [ ] **Step 1: Write RED clean-export tests**

```js
test('live-safe Content V2 exports clean four-section current content', () => {
  const exported = buildCurrentContentPortablePackage(v2Fixture);
  assert.equal(exported.schemaVersion, 5);
  assert.deepEqual(exported.sections.map((section) => section.role), ['warmup','classwork','practice','dol']);
  const questions = exported.sections.flatMap((section) => section.questions);
  assert.equal(questions.some((q) => q.teacherExcluded === true), false);
  assert.equal(questions.some((q) => q.supersedesQuestionId), false);
  assert.equal(questions.some((q) => q.introducedInContentVersion), false);
  assert.equal(exported.sections.some((section) => /^content-v\d+-corrections-/.test(section.id)), false);
  assert.equal(exported.portableContract.contentProjection, 'current');
  assert.equal(exported.portableContract.sourceContentVersion, 2);
});
```

- [ ] **Step 2: Run RED**

Run: `node --test tests/platform/currentContentExport.test.mjs`

- [ ] **Step 3: Build clean logical sections without mutating source**

Construct a temporary V5-shaped assignment from the original assignment metadata plus logical projected sections. Strip live migration-only question markers from cloned projected questions:

```js
const portableQuestion = (question) => {
  const {
    teacherExcluded: _teacherExcluded,
    supersedesQuestionId: _supersedesQuestionId,
    introducedInContentVersion: _introducedInContentVersion,
    ...current
  } = question || {};
  return current;
};
```

Create logical sections in projection order, retaining ordinary authored section metadata from the first non-correction section for that role when available. Use stable IDs such as the original role section ID; never reuse `content-v*-corrections-*` IDs.

- [ ] **Step 4: Reconstruct through existing V5 normalizer**

```js
const projectedAssignment = {
  ...assignment,
  sections: logicalSections,
};
return storedAssignmentToV5(projectedAssignment, { resetAssignmentKey: true });
```

Then add:

```js
portableContract: {
  kind: 'mathmasterCanonicalAssignmentV5',
  version: 1,
  contentProjection: 'current',
  sourceContentVersion: contentVersionOf(assignment),
}
```

- [ ] **Step 5: Update teacher export UI**

In `App.jsx`, replace local `buildPortableAssignmentPackage()` with the pure package helper and change dialog/menu copy to:

`Export Current Content V${contentVersionOf(exportJsonAssignment)}`

Keep Copy JSON behavior unchanged.

- [ ] **Step 6: Prove round-trip intake**

Feed the exported object through the existing V5 normalization/intake path and assert it remains valid V5 with the same active question IDs/content.

- [ ] **Step 7: Add V1 and clean Library V2 no-regression export tests**

V1 exports current V1 with identical questions/order. Clean Library V2 exports identical current questions/order and adds only portable projection metadata.

- [ ] **Step 8: Run GREEN and commit**

Run:

```bash
node --test tests/platform/currentContentExport.test.mjs
npm run test:authoring-v5
```

Commit:

```bash
git add src/platform/assignments/currentContentPortableAssignment.js src/App.jsx tests/platform/currentContentExport.test.mjs
git commit -m "feat: export clean current assignment content"
```

---

### Task 6: Add Full Least-Squares V2 Regression and Audit Current-Content Consumers

**Files:**
- Modify: `tests/platform/currentContentProjection.test.mjs`
- Modify: `tests/platform/currentContentNavigation.test.mjs`
- Modify: `tests/platform/currentContentExport.test.mjs`
- Modify only if failures prove needed: `src/App.jsx`, `src/assignmentLifecycle.js`, `src/platform/teacher/gradeEvidence.js`, `src/platform/resources/teacherAssignmentWorksheetExport.js`.

**Interfaces:**
- Uses the real migration shape: original four sections + excluded V1 questions + appended role-specific correction sections + `supersedesQuestionId` replacements.

- [ ] **Step 1: Create the representative 21-question regression fixture**

Do not depend on a production Firestore document in tests. Encode a deterministic fixture matching the important structure of the upgraded Least Squares assignment:

- 4 original instructional sections;
- 21 original storage questions;
- several `teacherExcluded` originals across all roles;
- one retire-only historical question;
- replacement questions appended into four `content-v2-corrections-*` sections;
- replacements with new IDs, `supersedesQuestionId`, and `introducedInContentVersion: 2`.

- [ ] **Step 2: Assert projection leaves raw storage untouched**

```js
const before = structuredClone(fixture);
const projection = projectCurrentAssignmentContent(fixture);
assert.deepEqual(fixture, before);
assert.deepEqual(projection.logicalSections.map((section) => section.role), ['warmup','classwork','practice','dol']);
```

- [ ] **Step 3: Assert every replacement is visible exactly once at historical logical location**

Compare the projected ID order against an explicit expected current-content order; also assert each replacement's `storageIndex` is still its appended index.

- [ ] **Step 4: Assert all current-content surfaces agree**

Use the same fixture to verify:

- lifecycle current indices;
- DOL indices;
- section-grade totals;
- teacher worksheet roles/order;
- clean JSON export roles/order.

- [ ] **Step 5: Add source audit for raw-vs-current intent**

Search modified runtime files and ensure no new current-content feature directly groups physical `assignment.sections` into student-facing tabs. Raw uses are allowed only when the code is intentionally accessing stored question data, audit/history, or persistence.

- [ ] **Step 6: Run the focused suite and commit**

Run:

```bash
node --test tests/platform/currentContentProjection.test.mjs
node --test tests/platform/currentContentNavigation.test.mjs
node --test tests/platform/currentContentExport.test.mjs
```

Commit:

```bash
git add tests/platform/currentContentProjection.test.mjs tests/platform/currentContentNavigation.test.mjs tests/platform/currentContentExport.test.mjs src/App.jsx src/assignmentLifecycle.js src/platform/teacher/gradeEvidence.js src/platform/resources/teacherAssignmentWorksheetExport.js
git commit -m "test: lock current Content V2 presentation regression"
```

---

### Task 7: Full Certification, PR, and Hosting-Only Release Gate

**Files:**
- No production file is expected solely for this task.
- Update plan/spec only if implementation discovered a behavior that must be documented; do not broaden approved scope.

**Interfaces:**
- Final feature must remain frontend/pure-helper only.

- [ ] **Step 1: Run focused feature tests**

```bash
node --test tests/platform/currentContentProjection.test.mjs
node --test tests/platform/currentContentNavigation.test.mjs
node --test tests/platform/currentContentExport.test.mjs
```

Expected: PASS.

- [ ] **Step 2: Run repository-required certification**

```bash
npm run test:platform
node --test tests/platform/*.test.mjs
npm run test:authoring-v5
npm run test:rules
npm run lint
npm run build
npm run build:firebase
git diff --check
```

Expected: all commands PASS. Existing lint warnings may remain, but no new errors.

- [ ] **Step 3: Verify no persistence/server surface changed**

Run:

```bash
git diff main...HEAD -- functions firestore.rules
```

Expected: empty diff.

Also inspect:

```bash
git diff main...HEAD -- src/platform/contract/storedAssignmentV5.js
```

If changed, confirm the diff only adds a pure export seam and does not alter ordinary raw storage/persistence behavior.

- [ ] **Step 4: Verify the user-visible regression**

Using the representative V2 fixture or local app:

- exactly one Warm-Up tab;
- exactly one Classwork tab;
- exactly one Practice tab;
- exactly one DOL tab;
- replacement question appears at historical logical location;
- Previous/Next crosses replacement correctly;
- export dialog says `Export Current Content V2`;
- exported JSON has four logical sections and no correction containers.

- [ ] **Step 5: Open PR from `codex/current-content-v2-projection` to `main`**

PR body must state:

- this is presentation/export projection only;
- no Firestore migration;
- no tracker-index rewrite;
- no assignment revision or Content V3;
- Hosting-only expected deployment;
- exact focused and full test results.

- [ ] **Step 6: Merge only after all PR checks are green**

Do not merge on partial CI.

- [ ] **Step 7: Deploy Hosting only**

After merge and pull of the merge commit:

```bash
firebase deploy --project mathmaster-aleks --only hosting
```

Do not deploy Functions or Firestore Rules for this feature unless the final merged diff actually changed them and that broader scope received explicit review.

---

## Execution Notes for Codex

- Start from branch `codex/current-content-v2-projection`.
- Read both the design spec and this implementation plan before changing production code.
- Use TDD task-by-task and keep commits aligned to task boundaries.
- Do not 'fix' duplicate tabs by deleting correction sections, rewriting Firestore, or rebuilding the live assignment.
- Never use a logical ordinal as a tracker key. `storageIndex` remains authoritative for student state.
- Keep `getStoredAssignmentQuestions()` raw; introduce explicit current-content helpers rather than changing history/audit semantics globally.
- Prefer one projection implementation reused everywhere over separate UI/PDF/export heuristics.
- If a current-content consumer cannot safely use the projection without a server/persistence change, stop and report that dependency before broadening scope.
