# Assignment Content Versioning and Live V2 Swapper Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add explicit human-facing Content V1/V2 lineage, create corrected Content V2 releases from Full Assignment Audit, and safely upgrade already-assigned copies to the newer content release without breaking student history or Google Classroom links.

**Architecture:** Keep Assignment V5 (`schemaVersion: 5`) and existing `assignmentRevision` unchanged in meaning. Add stored release-lineage metadata plus two server-authorized flows: create a new unassigned current Library release from an approved Full Audit, then preview/commit an in-place live upgrade that reuses Safe Live Repair for response-control fixes, admits only provably monotonic grading expansions, and handles structural fixes by retiring the historical question and appending a new replacement without shifting any historical tracker index.

**Tech Stack:** React, Firebase Firestore, Firebase Functions v2 callables, Node.js CommonJS + shared ESM policy modules, Node test runner, existing MathMaster V5/repair/grading/Classroom infrastructure.

**Spec:** `docs/superpowers/specs/2026-09-10-assignment-content-version-swapper-design.md`

## Global Constraints

- `schemaVersion` remains exactly `5`; Content V2 is never Assignment Schema V2.
- Preserve the meaning of existing `assignmentRevision` as the stale-write counter.
- Reuse PR #118/#123 Safe Live Repair behavior; do not create a competing response-entry repair validator.
- Reuse PR #175 Full Assignment Audit authorization, audit response, selected `assignmentIssue` replacements, revision checks, and platform-issue separation.
- Reuse PR #177 Classroom section-grade reconciliation; never create replacement Google Classroom CourseWork during a content upgrade.
- Runtime self-healing from PR #166 stays separate from authored Content V1/V2 lineage.
- Existing assignment IDs, Classroom publication IDs, class/date settings, accommodations, attempts, responses, and immutable evidence must be preserved during live upgrade.
- Historical student credit may stay the same or increase after a correction; it must never decrease.
- Structural replacements must never reuse the historical question ID.
- Structural replacements are append-only at storage level. Do not insert into `sections[]` before an existing historical question because trackers are still index-addressed.
- No bulk lineage backfill.

---

## File Structure

### New focused modules

- `functions/shared/assignmentContentVersion.mjs` — pure Content V1/V2 lineage normalization, display labels, family/version helpers, and target-release comparisons usable by browser and server tests.
- `functions/shared/liveResponseRepairPolicy.mjs` — extracted pure Safe Live Repair response-control validation shared by browser and server.
- `functions/shared/assignmentContentUpgradePolicy.mjs` — pure question change classifier: unchanged, safeResponseControl, gradingExpansion, clarificationOnly, fundamental.
- `functions/lib/assignmentContentVersion.js` — server transaction helpers for creating releases, planning live upgrades, preserving operational metadata, and building version events.
- `functions/lib/assignmentContentTrackerMigration.js` — server-only monotonic tracker migration for response-control repairs, grading expansion, retire-only, and retire+replacement actions.
- `src/platform/assignments/assignmentContentVersion.js` — small UI adapter/re-export plus Library grouping helpers; no Firestore writes.
- `src/components/teacher/AssignmentContentUpgradeModal.jsx` — review/confirmation UI for live V1 → V2 upgrades.
- `tests/platform/assignmentContentVersion.test.mjs` — lineage and Library grouping.
- `tests/platform/assignmentContentUpgradePolicy.test.mjs` — strict change classification and monotonic grading proof.
- `tests/platform/assignmentContentVersionServer.test.mjs` — server release planning and stale/concurrency guards.
- `tests/platform/assignmentContentUpgradeServer.test.mjs` — live upgrade planning, metadata preservation, tracker migration, structural append-only safety.
- `tests/platform/assignmentContentVersionUi.test.mjs` — Full Audit/Library/upgrade wiring.

### Existing files to modify

- `src/platform/assignment/liveQuestionCorrection.js` — delegate response-entry safety analysis to the shared policy while preserving current exported API and fingerprints.
- `src/components/teacher/FullAssignmentAudit.jsx` — add Create Corrected Content V2 after audit review.
- `src/AssignmentLibraryBase.jsx` — group family releases, hide superseded versions by default, render Content V# and current/superseded badges.
- `src/AssignmentCardMenu.jsx` — expose version history/upgrade entry points where appropriate.
- `src/App.jsx` — connect assignment list, newer-release lookup, upgrade modal, refresh, and student one-time correction notice; do not duplicate server migration logic here.
- `src/auth/authService.js` — add callable wrappers for create/preview/commit version flows.
- `functions/index.js` — register server-authorized release and upgrade callables.
- `firestore.rules` — deny client read/write to private `assignmentVersionEvents`.
- `tests/firestore-rules.test.mjs` — permanent rules coverage.
- `tests/platform/liveQuestionCorrection.test.mjs` and `tests/platform/module1SafeRepairPackExact.test.mjs` — prove the Safe Live Repair extraction is behavior-preserving.

---

### Task 1: Add Content Version Lineage as a Pure, Backward-Compatible Model

**Files:**
- Create: `functions/shared/assignmentContentVersion.mjs`
- Create: `src/platform/assignments/assignmentContentVersion.js`
- Create: `tests/platform/assignmentContentVersion.test.mjs`

**Interfaces:**
- Produces: `normalizeContentLineage(assignment) -> { familyId, version, label, releaseStatus, supersedesVersion, sourceAssignmentId, createdFromAuditId }`.
- Produces: `contentVersionOf(assignment) -> integer >= 1`.
- Produces: `contentVersionLabel(assignment) -> "Content V#"`.
- Produces: `sameContentFamily(a, b) -> boolean`.
- Produces: `latestFamilyRelease(assignments, assignment) -> assignment|null`.
- Produces: `groupCurrentLibraryReleases(assignments) -> { visible, families }`.

- [ ] **Step 1: Write the failing lineage tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { contentVersionOf, contentVersionLabel, sameContentFamily } from '../../functions/shared/assignmentContentVersion.mjs';

test('legacy assignment is Content V1 without backfill', () => {
  const assignment = { id: 'a1', schemaVersion: 5, title: 'Regression' };
  assert.equal(contentVersionOf(assignment), 1);
  assert.equal(contentVersionLabel(assignment), 'Content V1');
});

test('lineage version is human-facing and independent of schemaVersion', () => {
  const assignment = { schemaVersion: 5, contentLineage: { familyId: 'fam-1', version: 2, releaseStatus: 'current' } };
  assert.equal(contentVersionOf(assignment), 2);
  assert.equal(assignment.schemaVersion, 5);
});

test('family equality requires the same nonempty lineage family id', () => {
  assert.equal(sameContentFamily(
    { contentLineage: { familyId: 'fam-1', version: 1 } },
    { contentLineage: { familyId: 'fam-1', version: 2 } },
  ), true);
});
```

- [ ] **Step 2: Run the new test and verify RED**

Run: `node --test tests/platform/assignmentContentVersion.test.mjs`

Expected: FAIL because `functions/shared/assignmentContentVersion.mjs` does not exist.

- [ ] **Step 3: Implement the pure lineage helpers**

```js
const clean = (value) => String(value ?? '').trim();

export function normalizeContentLineage(assignment = {}) {
  const raw = assignment?.contentLineage && typeof assignment.contentLineage === 'object'
    ? assignment.contentLineage
    : {};
  const version = Number.isInteger(Number(raw.version)) && Number(raw.version) > 0 ? Number(raw.version) : 1;
  return {
    familyId: clean(raw.familyId) || null,
    version,
    label: `V${version}`,
    releaseStatus: clean(raw.releaseStatus) || (version === 1 ? 'current' : 'current'),
    supersedesVersion: Number.isInteger(Number(raw.supersedesVersion)) ? Number(raw.supersedesVersion) : null,
    sourceAssignmentId: clean(raw.sourceAssignmentId) || null,
    createdFromAuditId: clean(raw.createdFromAuditId) || null,
  };
}

export const contentVersionOf = (assignment = {}) => normalizeContentLineage(assignment).version;
export const contentVersionLabel = (assignment = {}) => `Content V${contentVersionOf(assignment)}`;
export const sameContentFamily = (a = {}, b = {}) => {
  const left = normalizeContentLineage(a).familyId;
  const right = normalizeContentLineage(b).familyId;
  return Boolean(left && right && left === right);
};
```

Add `latestFamilyRelease()` and `groupCurrentLibraryReleases()` using `familyId`; legacy assignments with no family stay independently visible until a successor exists.

- [ ] **Step 4: Add grouping assertions**

```js
test('current release is visible and superseded sibling is hidden by default', () => {
  const v1 = { id: 'v1', assignedClassIds: [], contentLineage: { familyId: 'fam', version: 1, releaseStatus: 'superseded' } };
  const v2 = { id: 'v2', assignedClassIds: [], contentLineage: { familyId: 'fam', version: 2, releaseStatus: 'current' } };
  const { visible } = groupCurrentLibraryReleases([v1, v2]);
  assert.deepEqual(visible.map((item) => item.id), ['v2']);
});
```

- [ ] **Step 5: Run GREEN and commit**

Run: `node --test tests/platform/assignmentContentVersion.test.mjs`

Expected: PASS.

Commit:

```bash
git add functions/shared/assignmentContentVersion.mjs src/platform/assignments/assignmentContentVersion.js tests/platform/assignmentContentVersion.test.mjs
git commit -m "feat: add assignment content lineage model"
```

---

### Task 2: Extract Safe Live Response-Control Validation for Server Reuse

**Files:**
- Create: `functions/shared/liveResponseRepairPolicy.mjs`
- Modify: `src/platform/assignment/liveQuestionCorrection.js`
- Modify: `tests/platform/liveQuestionCorrection.test.mjs`
- Modify: `tests/platform/module1SafeRepairPackExact.test.mjs`

**Interfaces:**
- Produces: `analyzeSafeResponseEntryRepair(beforeQuestion, afterQuestion) -> { safe, affectedFieldIds, reason? }`.
- Preserves existing browser export: `analyzeResponseEntryRepair(beforeQuestion, afterQuestion)` from `liveQuestionCorrection.js`, including `questionId` and `beforeFingerprint` on success.

- [ ] **Step 1: Add a parity test before moving logic**

```js
test('shared safe-response policy accepts the same prose-to-choice conversion', async () => {
  const { analyzeSafeResponseEntryRepair } = await import('../../functions/shared/liveResponseRepairPolicy.mjs');
  const before = { questionId: 'q1', type: 'multiAnswer', answerFields: [{ id: 'kind', label: 'Type', answer: 'interpolation', inputProfile: 'text' }] };
  const after = { questionId: 'q1', type: 'multiAnswer', answerFields: [{ id: 'kind', label: 'Type', answer: 'interpolation', inputProfile: 'choice', type: 'choice', options: ['interpolation', 'extrapolation'] }] };
  const result = analyzeSafeResponseEntryRepair(before, after);
  assert.equal(result.safe, true);
  assert.deepEqual(result.affectedFieldIds, ['kind']);
});
```

- [ ] **Step 2: Run RED**

Run: `node --test tests/platform/liveQuestionCorrection.test.mjs tests/platform/module1SafeRepairPackExact.test.mjs`

Expected: FAIL only for the missing shared module/new assertion.

- [ ] **Step 3: Move only the pure response-entry decision logic**

Move the current plain-language choice validation, answer-field identity checks, and function-modeling domain/range word-choice exception into `functions/shared/liveResponseRepairPolicy.mjs`. Keep tracker mutation, grading, and fingerprints in `src/platform/assignment/liveQuestionCorrection.js`.

Update the existing browser function to preserve its public contract:

```js
import { analyzeSafeResponseEntryRepair } from '../../../functions/shared/liveResponseRepairPolicy.mjs';

export const analyzeResponseEntryRepair = (beforeQuestion = {}, afterQuestion = {}) => {
  const result = analyzeSafeResponseEntryRepair(beforeQuestion, afterQuestion);
  if (!result.safe) return result;
  return {
    ...result,
    questionId: beforeQuestion.questionId,
    beforeFingerprint: questionFingerprint(beforeQuestion),
  };
};
```

- [ ] **Step 4: Run existing exact Safe Live Repair regressions**

Run: `node --test tests/platform/liveQuestionCorrection.test.mjs tests/platform/module1SafeRepairPackExact.test.mjs`

Expected: PASS with no behavior change to the current Safe Live Repair path.

- [ ] **Step 5: Commit**

```bash
git add functions/shared/liveResponseRepairPolicy.mjs src/platform/assignment/liveQuestionCorrection.js tests/platform/liveQuestionCorrection.test.mjs tests/platform/module1SafeRepairPackExact.test.mjs
git commit -m "refactor: share safe live response repair policy"
```

---

### Task 3: Build Strict Live V1 → V2 Change Classification

**Files:**
- Create: `functions/shared/assignmentContentUpgradePolicy.mjs`
- Create: `tests/platform/assignmentContentUpgradePolicy.test.mjs`

**Interfaces:**
- Consumes: `analyzeSafeResponseEntryRepair(before, after)`.
- Produces: `classifyContentQuestionChange(before, after) -> { classification, safe, reason, affectedFieldIds, gradingKeys }`.
- Classifications: `unchanged`, `safeResponseControl`, `gradingExpansion`, `clarificationOnly`, `fundamental`.

- [ ] **Step 1: Write RED tests for all five classifications**

```js
test('wider regression tolerances are a grading expansion', () => {
  const before = { questionId: 'q', type: 'dataModelingLab', mode: 'lineFit', points: [{x:1,y:2}], slopeTolerance: 0.1, interceptTolerance: 0.8 };
  const after = { ...before, slopeTolerance: 0.2, interceptTolerance: 7 };
  const result = classifyContentQuestionChange(before, after);
  assert.equal(result.classification, 'gradingExpansion');
  assert.equal(result.safe, true);
});

test('narrower tolerance is fundamental/unsafe, never a live grading expansion', () => {
  const before = { questionId: 'q', answer: 10, tolerance: 2 };
  const after = { ...before, tolerance: 1 };
  const result = classifyContentQuestionChange(before, after);
  assert.equal(result.classification, 'fundamental');
  assert.equal(result.safe, false);
});

test('prompt-only clarification is allowed only when scored structure is byte-stable', () => {
  const before = { questionId: 'q', type: 'relationshipModel', prompt: 'Identify x, y, and association.', correctIndependentId: 'x', correctDependentId: 'y' };
  const after = { ...before, prompt: 'Identify the independent and dependent quantities.' };
  assert.equal(classifyContentQuestionChange(before, after).classification, 'clarificationOnly');
});

test('answer-field count change is fundamental', () => {
  const before = { questionId: 'q', type: 'multiAnswer', answerFields: [{ id: 'a', answer: '1' }] };
  const after = { ...before, answerFields: [...before.answerFields, { id: 'b', answer: '2' }] };
  assert.equal(classifyContentQuestionChange(before, after).classification, 'fundamental');
});
```

- [ ] **Step 2: Run RED**

Run: `node --test tests/platform/assignmentContentUpgradePolicy.test.mjs`

Expected: FAIL because the classifier does not exist.

- [ ] **Step 3: Implement conservative classification**

Use exact stable comparison. Evaluation order must be:

```js
export function classifyContentQuestionChange(before, after) {
  if (stable(before) === stable(after)) return { classification: 'unchanged', safe: true };

  const responseRepair = analyzeSafeResponseEntryRepair(before, after);
  if (responseRepair.safe) return { classification: 'safeResponseControl', safe: true, affectedFieldIds: responseRepair.affectedFieldIds };

  const expansion = analyzeGradingExpansion(before, after);
  if (expansion.safe) return { classification: 'gradingExpansion', safe: true, gradingKeys: expansion.gradingKeys };

  if (isClarificationOnly(before, after)) return { classification: 'clarificationOnly', safe: true };

  return { classification: 'fundamental', safe: false, reason: 'The scored task or protected structure changed.' };
}
```

`analyzeGradingExpansion()` must fail closed. Initially allow only:

- same questionId/type/mode/prompt/math/graph/table/points/answer-field IDs;
- same keyed answer(s);
- acceptedAnswers changed only by adding values while retaining all old normalized values;
- numeric `tolerance` or keys ending in `Tolerance` changed only to a finite value greater than or equal to the previous value;
- answer-field-level acceptedAnswers/tolerance expansion under the same field ID;
- no addition/removal/reorder of answer fields.

`isClarificationOnly()` may ignore differences in `prompt` and `guidedNotes` only. All other scored/mathematical fields must be stable.

- [ ] **Step 4: Add a regression matching the current least-squares assignment**

Use `q_section-2_2_2`-style `slopeTolerance` / `interceptTolerance` widening and verify it is not classified fundamental.

- [ ] **Step 5: Run GREEN and commit**

Run: `node --test tests/platform/assignmentContentUpgradePolicy.test.mjs`

Commit:

```bash
git add functions/shared/assignmentContentUpgradePolicy.mjs tests/platform/assignmentContentUpgradePolicy.test.mjs
git commit -m "feat: classify safe content version upgrades"
```

---

### Task 4: Create Corrected Content V2 from an Approved Full Assignment Audit

**Files:**
- Create: `functions/lib/assignmentContentVersion.js`
- Modify: `functions/index.js`
- Modify: `src/auth/authService.js`
- Create: `tests/platform/assignmentContentVersionServer.test.mjs`

**Interfaces:**
- Consumes: existing `fullAssignmentRepair.requireRepairAuthority(auth)` and `fullAssignmentRepair.prepareCommit({ assignment, request })`.
- Produces server helper: `prepareContentRelease({ sourceAssignment, auditRequest, familyId, nextVersion, newAssignmentId, actorUid })`.
- Produces callable: `createAssignmentContentVersion({ assignmentId, ...fullAuditResponse, selectedQuestionIds }) -> { assignmentId, familyId, contentVersion, sourceAssignmentId }`.
- Adds client wrapper: `teacherAdmin.createAssignmentContentVersion(payload)`.

- [ ] **Step 1: Write server helper tests**

```js
test('creating first successor makes Content V2 while schema remains V5', () => {
  const prepared = prepareContentRelease({
    sourceAssignment: legacyV5Assignment,
    auditRequest: reviewedAudit,
    familyId: 'fam-1',
    nextVersion: 2,
    newAssignmentId: 'v2-doc',
    actorUid: 'admin-1',
  });
  assert.equal(prepared.release.schemaVersion, 5);
  assert.equal(prepared.release.assignmentRevision, 1);
  assert.equal(prepared.release.contentLineage.version, 2);
  assert.deepEqual(prepared.release.assignedClassIds, []);
  assert.equal(prepared.release.dueAt, null);
});
```

Also assert `platformIssue`/`unclear` entries cannot enter the replacement set because `prepareCommit()` already enforces `assignmentIssue`.

- [ ] **Step 2: Run RED**

Run: `node --test tests/platform/assignmentContentVersionServer.test.mjs`

- [ ] **Step 3: Implement `prepareContentRelease()` by reusing Full Audit staging**

Call `fullAssignmentRepair.prepareCommit()` to obtain the reviewed question state, then build a new unassigned Library record. Preserve reusable V5 content and folder/course metadata; clear live operational fields exactly as the current duplicate-to-library path does:

```js
const release = {
  ...reviewedAssignment,
  id: undefined,
  assignmentKey: null,
  assignedClassIds: [],
  assignedClassPeriods: [],
  dueAt: null,
  dueDate: null,
  lateDueAt: null,
  lateDueDate: null,
  releaseAt: null,
  feedbackReleased: false,
  feedbackReleasedAt: null,
  assignmentRevision: 1,
  contentLineage: {
    familyId,
    version: nextVersion,
    label: `V${nextVersion}`,
    releaseStatus: 'current',
    supersedesVersion: nextVersion - 1,
    sourceAssignmentId: sourceAssignment.id,
    createdFromAuditId: auditRequest.auditId || null,
    createdBy: actorUid,
  },
};
```

Do not copy transient Classroom publication records or student state.

- [ ] **Step 4: Add the callable transaction**

In `functions/index.js`, create `exports.createAssignmentContentVersion = onCall(...)`.

Transaction requirements:

1. authorize with existing Full Audit authority;
2. load source assignment and re-check base revision through `prepareCommit()`;
3. if source has no familyId, generate one with `crypto.randomUUID()` and stage source as Content V1;
4. query current assignments in that family and compute `nextVersion = max(version)+1`; reject if source is not the current family release selected for successor creation;
5. create a new assignment doc;
6. mark prior current Library release `releaseStatus: 'superseded'` without changing its question content;
7. write `assignmentVersionEvents` event `releaseCreated`;
8. return the new assignment ID/version.

- [ ] **Step 5: Add the client wrapper**

```js
createAssignmentContentVersion: (payload) =>
  callable('createAssignmentContentVersion')(payload).then((result) => result.data || {}),
```

- [ ] **Step 6: Add stale/concurrent release tests**

Prove two callers cannot both create Content V2 from the same base state and that a stale `baseRevision` fails the whole operation.

- [ ] **Step 7: Run GREEN and commit**

Run: `node --test tests/platform/assignmentContentVersionServer.test.mjs tests/platform/fullAssignmentRepairServer.test.mjs`

Commit:

```bash
git add functions/lib/assignmentContentVersion.js functions/index.js src/auth/authService.js tests/platform/assignmentContentVersionServer.test.mjs
git commit -m "feat: create corrected assignment content releases"
```

---

### Task 5: Connect Full Assignment Audit to “Create Corrected Content V2”

**Files:**
- Modify: `src/components/teacher/FullAssignmentAudit.jsx`
- Create: `tests/platform/assignmentContentVersionUi.test.mjs`

**Interfaces:**
- Consumes: parsed Full Audit `response`, current `selected`, `assignmentId`, `baseRevision`.
- Calls: `teacherAdmin.createAssignmentContentVersion({ ...response, selectedQuestionIds: [...selected] })`.
- Produces UI result containing new Library assignment ID and `Content V#`.

- [ ] **Step 1: Write a source/UI regression**

```js
test('Full Assignment Audit offers corrected content release creation', async () => {
  const source = await readFile('src/components/teacher/FullAssignmentAudit.jsx', 'utf8');
  assert.match(source, /Create Corrected Content V/);
  assert.match(source, /createAssignmentContentVersion/);
});
```

- [ ] **Step 2: Run RED**

Run: `node --test tests/platform/assignmentContentVersionUi.test.mjs`

- [ ] **Step 3: Add release creation as a separate action from direct repair commit**

Do not silently repurpose the existing `commitFullAssignmentRepair()` button. In review state, add a second elevated action:

```jsx
<button type="button" onClick={createCorrectedRelease} disabled={!selected.size || creatingVersion}>
  {creatingVersion ? 'Creating Content V2…' : 'Create Corrected Content V2'}
</button>
```

`createCorrectedRelease()` calls the new server callable and changes the message to:

`Created Content V2 in the Library. Existing assigned copies were not changed. Open the assigned copy to upgrade it.`

Render the actual returned version number rather than hard-coding V2 so V3+ works.

- [ ] **Step 4: Keep existing Full Audit behavior intact**

Run: `node --test tests/platform/fullAssignmentAuditUi.test.mjs tests/platform/fullAssignmentRepairPacket.test.mjs tests/platform/assignmentContentVersionUi.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/teacher/FullAssignmentAudit.jsx tests/platform/assignmentContentVersionUi.test.mjs
git commit -m "feat: create content version from full audit"
```

---

### Task 6: Make Content V2 Findable in the Library

**Files:**
- Modify: `src/AssignmentLibraryBase.jsx`
- Modify: `src/AssignmentCardMenu.jsx`
- Modify: `src/App.jsx`
- Modify: `tests/platform/assignmentContentVersionUi.test.mjs`

**Interfaces:**
- Consumes: `groupCurrentLibraryReleases(assignments)`, `contentVersionLabel(assignment)`, `latestFamilyRelease(assignments, assignment)`.
- Produces: visible Content V# / Current / Superseded badges and Version History expansion.

- [ ] **Step 1: Add failing UI assertions**

```js
test('Library shows Content version and hides superseded siblings by default', async () => {
  const source = await readFile('src/AssignmentLibraryBase.jsx', 'utf8');
  assert.match(source, /Content V/);
  assert.match(source, /Version History/);
  assert.match(source, /groupCurrentLibraryReleases/);
});
```

- [ ] **Step 2: Run RED**

Run: `node --test tests/platform/assignmentContentVersionUi.test.mjs`

- [ ] **Step 3: Filter Library display through family grouping before folder/search sorting**

Do not delete superseded records. Use the grouping helper only for presentation. Add local `showVersionHistoryFamilyId` state and render older releases when the teacher expands a family.

Badge copy:

```jsx
<span>{contentVersionLabel(assignment)}</span>
<span>{lineage.releaseStatus === 'superseded' ? 'SUPERSEDED' : 'CURRENT'}</span>
```

- [ ] **Step 4: Show upgrade availability on assigned records without changing their content**

In the assignment list/card wiring in `App.jsx`, compute the newest same-family Library release. If target version > assigned version, surface **Content V1 · V2 available** and pass the target assignment to the upgrade action.

- [ ] **Step 5: Run focused Library tests and commit**

Run: `node --test tests/platform/assignmentContentVersion.test.mjs tests/platform/assignmentContentVersionUi.test.mjs`

Commit:

```bash
git add src/AssignmentLibraryBase.jsx src/AssignmentCardMenu.jsx src/App.jsx tests/platform/assignmentContentVersionUi.test.mjs
git commit -m "feat: show assignment content versions in library"
```

---

### Task 7: Build Server Preview and Monotonic Student Tracker Migration

**Files:**
- Create: `functions/lib/assignmentContentTrackerMigration.js`
- Extend: `functions/lib/assignmentContentVersion.js`
- Modify: `functions/index.js`
- Modify: `src/auth/authService.js`
- Create: `tests/platform/assignmentContentUpgradeServer.test.mjs`

**Interfaces:**
- Produces: `buildContentUpgradePlan({ liveAssignment, targetAssignment }) -> { fromVersion, toVersion, changes, counts, requiresFundamentalChoice, planHash }`.
- Produces: `migrateTrackerForContentUpgrade({ tracker, plan, liveQuestions, nextQuestions, fundamentalChoices, correctedAt }) -> { tracker, changed, gradeMayChange }`.
- Produces callable: `previewAssignmentContentUpgrade({ assignmentId, targetAssignmentId })`.
- Adds client wrapper: `teacherAdmin.previewAssignmentContentUpgrade(payload)`.

- [ ] **Step 1: Write RED plan tests**

Use fixtures with:

- one unchanged question;
- one text→choice Safe Live Repair;
- one wider tolerance grading expansion;
- one prompt-only clarification;
- one structural answer-field change.

Assert exact counts and that the structural question is `fundamental`.

- [ ] **Step 2: Write the index-safety regression**

```js
test('fundamental replacement never shifts a historical tracker index', () => {
  const result = buildUpgradedAssignment({ liveAssignment, targetAssignment, fundamentalChoices: { q3: 'retire-and-replace' }, replacementId: () => 'q3-v2-live' });
  const oldIds = flatten(result.assignment.sections).slice(0, 5).map((q) => q.questionId);
  assert.deepEqual(oldIds, ['q1', 'q2', 'q3', 'q4', 'q5']);
  assert.equal(result.assignment.sections.at(-1).questions.at(-1).questionId, 'q3-v2-live');
});
```

Implementation resolution: structural replacements go into append-only tail correction section(s), grouped by original activity role, so all original flattened indices remain stable. Never call `rebuildV5SectionsFromQuestions()` in a way that reinserts a new structural replacement into an earlier section.

- [ ] **Step 3: Implement server preview**

`previewAssignmentContentUpgrade` must:

1. require a teacher;
2. load live and target assignments;
3. verify target is a higher version of the same family;
4. verify caller owns the assigned copy unless root admin;
5. build classifications server-side using `assignmentContentUpgradePolicy.mjs`;
6. count audience students with saved trackers;
7. return the plan and a deterministic `planHash` over assignment IDs/revisions/versions/change summaries.

- [ ] **Step 4: Implement monotonic tracker migration for grading expansion**

Do not attempt to reconstruct answers that were never stored. Regrade only when a stored response/part response exists in the current tracker representation and the current shared grader can evaluate it. Preserve the old record when proof is unavailable.

Core invariant:

```js
const nextCredit = Math.max(Number(oldRecord.bestPartialCredit || 0), Number(regraded.bestPartialCredit || 0));
assert(nextCredit >= Number(oldRecord.bestPartialCredit || 0));
```

For response-control repairs, port/reuse the current `repairQuestionRecordForLiveCorrection` semantics server-side using the same affected field IDs from shared Safe Live Repair policy. Preserve `totalAttempts` and repair-history semantics.

For a structural retired question, keep its existing tracker entry untouched; the appended replacement receives no pre-filled tracker record until normal runtime initializes it.

- [ ] **Step 5: Add callable wrapper**

```js
previewAssignmentContentUpgrade: (payload) =>
  callable('previewAssignmentContentUpgrade')(payload).then((result) => result.data || {}),
```

- [ ] **Step 6: Run GREEN and commit**

Run: `node --test tests/platform/assignmentContentUpgradePolicy.test.mjs tests/platform/assignmentContentUpgradeServer.test.mjs`

Commit:

```bash
git add functions/lib/assignmentContentTrackerMigration.js functions/lib/assignmentContentVersion.js functions/index.js src/auth/authService.js tests/platform/assignmentContentUpgradeServer.test.mjs
git commit -m "feat: preview safe live content upgrades"
```

---

### Task 8: Commit the Live Upgrade Atomically and Reconcile Classroom Grades

**Files:**
- Modify: `functions/lib/assignmentContentVersion.js`
- Modify: `functions/lib/assignmentContentTrackerMigration.js`
- Modify: `functions/index.js`
- Modify: `src/auth/authService.js`
- Modify: `tests/platform/assignmentContentUpgradeServer.test.mjs`
- Modify: `tests/platform/classroomSectionGradeReconciliation.test.mjs` only if a reusable queue helper must be exported; otherwise leave PR #177 internals untouched.

**Interfaces:**
- Produces callable: `commitAssignmentContentUpgrade({ assignmentId, targetAssignmentId, expectedAssignmentRevision, expectedTargetRevision, expectedPlanHash, fundamentalChoices })`.
- Adds client wrapper: `teacherAdmin.commitAssignmentContentUpgrade(payload)`.

- [ ] **Step 1: Add failing atomicity and stale-plan tests**

Cover:

- assignment revision changed after preview;
- target content version/revision changed after preview;
- plan hash mismatch;
- missing choice for a fundamental change;
- assignment operational metadata preserved exactly;
- already-earned credit never decreases;
- assignment ID remains unchanged.

- [ ] **Step 2: Implement transaction-time revalidation**

Inside the callable transaction:

1. reload live + target assignments;
2. recompute the upgrade plan;
3. reject if `planHash` differs;
4. validate every fundamental choice;
5. build the upgraded `sections[]` with old indices intact;
6. update `contentLineage.version` to target version while preserving this live assignment's own ID;
7. increment `assignmentRevision` once;
8. preserve classes/dates/Classroom/publication/accommodation fields by update allow-list rather than whole-document replacement;
9. load affected grade documents and migrate only `gradesByAssignment[assignmentId]`;
10. write one `assignmentVersionEvents` `liveUpgrade` event.

- [ ] **Step 3: Queue grade reconciliation without recreating Classroom work**

When any migrated tracker can change a derived grade, write the existing `classroomReleaseSignals[assignmentId]` shape using reason `content-version-upgrade` so PR #177's reconciliation path re-derives section grades against the preserved CourseWork IDs.

Do not call publish/repost functions.

- [ ] **Step 4: Add authorization tests**

Owner teacher may upgrade their own live assignment to an approved family release. Root admin may upgrade any. A teacher who does not own the assigned classes must be rejected.

- [ ] **Step 5: Run GREEN and commit**

Run: `node --test tests/platform/assignmentContentUpgradeServer.test.mjs tests/platform/classroomSectionGradeReconciliation.test.mjs`

Commit:

```bash
git add functions/lib/assignmentContentVersion.js functions/lib/assignmentContentTrackerMigration.js functions/index.js src/auth/authService.js tests/platform/assignmentContentUpgradeServer.test.mjs tests/platform/classroomSectionGradeReconciliation.test.mjs
git commit -m "feat: commit live assignment content upgrades"
```

---

### Task 9: Add Teacher Upgrade Review UI and Student Correction Notice

**Files:**
- Create: `src/components/teacher/AssignmentContentUpgradeModal.jsx`
- Modify: `src/App.jsx`
- Modify: `src/AssignmentCardMenu.jsx`
- Modify: `tests/platform/assignmentContentVersionUi.test.mjs`

**Interfaces:**
- Calls preview then commit wrappers.
- Fundamental choice values sent to server: `retire-only` or `retire-and-replace` keyed by historical questionId.

- [ ] **Step 1: Add failing UI tests**

Assert source contains:

- `Upgrade to Content V`;
- affected student count;
- unchanged / response-control / grading-expansion / clarification / fundamental counts;
- both structural choices;
- final explicit confirmation;
- one-time student correction copy.

- [ ] **Step 2: Run RED**

Run: `node --test tests/platform/assignmentContentVersionUi.test.mjs`

- [ ] **Step 3: Implement the modal**

Flow:

1. Open from older assigned assignment.
2. Call `previewAssignmentContentUpgrade`.
3. Render source/target version and classifications.
4. For every fundamental row, require teacher selection:

```jsx
<select value={fundamentalChoices[questionId] || ''} onChange={...}>
  <option value="">Choose action…</option>
  <option value="retire-only">Retire flawed question only</option>
  <option value="retire-and-replace">Retire + add corrected replacement</option>
</select>
```

5. Disable commit until all required choices are made.
6. Commit with expected revisions + planHash.
7. Refresh assignments and close modal on success.

Success message:

`Upgraded this assigned copy to Content V2. Student work and Classroom links were preserved.`

- [ ] **Step 4: Add one-time student notice keyed by assignment/version**

Use local storage/session storage key such as `mathmaster:content-upgrade-notice:<assignmentId>:<version>` and show:

**This assignment was corrected by your teacher. Your previous work was preserved.**

Do not expose audit internals or old answers.

- [ ] **Step 5: Run GREEN and commit**

Run: `node --test tests/platform/assignmentContentVersionUi.test.mjs`

Commit:

```bash
git add src/components/teacher/AssignmentContentUpgradeModal.jsx src/App.jsx src/AssignmentCardMenu.jsx tests/platform/assignmentContentVersionUi.test.mjs
git commit -m "feat: add live content upgrade review UI"
```

---

### Task 10: Lock Down Private Version Events and Complete End-to-End Certification

**Files:**
- Modify: `firestore.rules`
- Modify: `tests/firestore-rules.test.mjs`
- Modify: `tests/platform/assignmentContentVersionUi.test.mjs`
- Modify: `docs/superpowers/specs/2026-09-10-assignment-content-version-swapper-design.md` only if implementation reveals a behavior that must be documented, not to change approved scope.

**Interfaces:**
- Private collection: `assignmentVersionEvents` is Admin SDK/callable only.

- [ ] **Step 1: Add rules RED test**

```js
test('assignment version events are private operational history', async () => {
  await assertFails(getDoc(doc(studentDb, 'assignmentVersionEvents', 'event-1')));
  await assertFails(setDoc(doc(teacherDb, 'assignmentVersionEvents', 'event-2'), { type: 'liveUpgrade' }));
});
```

- [ ] **Step 2: Add deny rule**

```text
match /assignmentVersionEvents/{docId} { allow read, write: if false; }
```

- [ ] **Step 3: Add end-to-end regression using the least-squares scenario**

Construct V1/V2 fixtures containing:

- a text→choice repair;
- a widened regression tolerance;
- a prompt clarification;
- structural `q_section-3_3_8`-style rebuild.

Assert:

- V2 is visible/current in Library;
- live V1 says V2 available;
- preview classifies all four correctly;
- structural question requires explicit action;
- commit preserves assignment ID/classes/dates;
- old structural tracker entry remains untouched;
- new structural question has a new ID;
- no grade decreases;
- grade reconcile signal is queued when credit changes.

- [ ] **Step 4: Run focused feature suite**

Run:

```bash
node --test \
  tests/platform/assignmentContentVersion.test.mjs \
  tests/platform/assignmentContentUpgradePolicy.test.mjs \
  tests/platform/assignmentContentVersionServer.test.mjs \
  tests/platform/assignmentContentUpgradeServer.test.mjs \
  tests/platform/assignmentContentVersionUi.test.mjs \
  tests/platform/liveQuestionCorrection.test.mjs \
  tests/platform/module1SafeRepairPackExact.test.mjs \
  tests/platform/fullAssignmentRepairPacket.test.mjs \
  tests/platform/fullAssignmentRepairServer.test.mjs \
  tests/platform/classroomSectionGradeReconciliation.test.mjs
```

Expected: all PASS.

- [ ] **Step 5: Run repository-required certification**

Run:

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

- [ ] **Step 6: Verify function syntax and exact deploy scope**

Run:

```bash
node -c functions/index.js
node -c functions/lib/assignmentContentVersion.js
node -c functions/lib/assignmentContentTrackerMigration.js
```

Expected: PASS.

Changed-function deploy scope should include only newly added/modified callable exports for this feature, plus Hosting and Firestore rules. If the final implementation exports exactly these three new callables, deploy:

```bash
firebase deploy --project mathmaster-aleks --only "hosting,firestore:rules,functions:createAssignmentContentVersion,functions:previewAssignmentContentUpgrade,functions:commitAssignmentContentUpgrade"
```

Do not use that deploy command if implementation changes additional Cloud Function exports; derive the final list from the actual diff.

- [ ] **Step 7: Final commit**

```bash
git add firestore.rules tests/firestore-rules.test.mjs tests/platform/assignmentContentVersionUi.test.mjs
git commit -m "test: certify assignment content version swapper"
```

---

## Execution Notes for Codex

- Start from branch `codex/assignment-content-version-swapper`.
- Read the spec and this plan before implementation.
- Use TDD task-by-task; do not batch all code before tests.
- Keep PR #118/#123 Safe Live Repair behavior green after the shared-policy extraction.
- Keep PR #175 Full Audit direct-repair path working even though Content V2 release creation becomes the recommended path for corrected reusable content.
- Never mutate student evidence events.
- Never treat `runtimeCompatibility.repairVersion` as assignment Content V#.
- Never infer family identity from title.
- For fundamental live replacements, preserve all historical flattened indices and append replacement storage; do not insert into earlier sections.
- Record every unexpected CI failure in the PR body/comment as expected RED, implementation defect, pre-existing/unrelated, or blocker.
