# Classroom Section Runtime Wiring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the tested Classroom section publication contract reusable by the server publishing, grade-routing, launch, and repair paths without changing existing whole-assignment behavior.

**Architecture:** Keep section identity and grade derivation in small pure CommonJS helpers under `functions/lib/`, then wire those helpers into Firebase callables/triggers. Legacy publications normalize to `whole`; section publications use deterministic `(assignmentId, courseId, sectionKey)` identity and derive only their own question indices from canonical Assignment V5 sections.

**Tech Stack:** Node.js CommonJS, Firebase Functions v2, Firestore, Google Classroom API, Node test runner.

**Spec:** `docs/plans/2026-09-06-classroom-section-passback.md`

## Global Constraints

- Existing whole-assignment publication IDs and grade passback behavior remain backward compatible.
- Saved `grades/{studentId}.gradesByAssignment[assignmentId]` remains the source of official work for old assignments.
- After the final late cutoff, practice attempts remain practice-only and cannot change official grades, evidence, mastery, activity history, DOL records, or Classroom grades.
- A Classroom section publication never receives another section's score.
- Unknown or empty requested sections fail closed before Google Classroom is called.
- Student names are primary in teacher-facing operational tables; IDs remain secondary diagnostics.

---

### Task 1: Publication target expansion

**Files:**
- Modify: `functions/lib/classroomSectionPublishing.js`
- Test: `tests/platform/classroomSectionPublishingContract.test.mjs`

**Interfaces:**
- Consumes: `classroomPublicationSpecs({ assignment, requestData })` and `publicationDocumentId(assignmentId, courseId, sectionKey)`.
- Produces: `classroomPublicationTargets({ assignmentId, assignment, courseIds, requestData }) -> Array<{courseId, publicationId, sectionKey, sectionLabel, questionIndices, title, instructions, publishAt}>`.

- [ ] **Step 1: Write the failing test**

```js
test('publication targets expand every selected course and section with deterministic independent ids', () => {
  const targets = classroomPublicationTargets({
    assignmentId: 'a1',
    assignment: {
      schemaVersion: 5,
      title: 'Functions Review',
      sections: [
        { role: 'warmup', questions: [{ id: 'w1' }] },
        { role: 'dol', questions: [{ id: 'd1' }] },
      ],
    },
    courseIds: ['course-1', 'course-2'],
    requestData: { sectionKeys: ['warmup', 'dol'] },
  });
  assert.equal(targets.length, 4);
  assert.equal(new Set(targets.map((target) => target.publicationId)).size, 4);
  assert.deepEqual(targets.map((target) => target.sectionKey), ['warmup', 'dol', 'warmup', 'dol']);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/platform/classroomSectionPublishingContract.test.mjs`
Expected: FAIL because `classroomPublicationTargets` is not exported.

- [ ] **Step 3: Write minimal implementation**

```js
function classroomPublicationTargets({ assignmentId, assignment = {}, courseIds = [], requestData = {} } = {}) {
  const cleanAssignmentId = String(assignmentId || '').trim();
  if (!cleanAssignmentId) throw new TypeError('assignmentId is required.');
  const specs = classroomPublicationSpecs({ assignment, requestData });
  return [...new Set(courseIds.map((value) => String(value).trim()).filter(Boolean))]
    .flatMap((courseId) => specs.map((spec) => ({
      ...spec,
      courseId,
      publicationId: publicationDocumentId(cleanAssignmentId, courseId, spec.sectionKey),
    })));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/platform/classroomSectionPublishingContract.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add functions/lib/classroomSectionPublishing.js tests/platform/classroomSectionPublishingContract.test.mjs
git commit -m "feat: expand Classroom section publication targets"
```

### Task 2: Section-specific grade routing

**Files:**
- Create: `functions/lib/classroomSectionGrade.js`
- Create: `tests/platform/classroomSectionGrade.test.mjs`

**Interfaces:**
- Consumes: `runtimeIncludedQuestionIndicesForSection(assignment, sectionKey)`, the existing assignment tracker shape, and caller-supplied `gradeProgress(tracker, indices, questions)`.
- Produces: `classroomPublicationGrade({ assignment, publication, tracker, questions, gradeProgress }) -> {sectionKey, sectionLabel, questionIndices, ...progress}`.

- [ ] **Step 1: Write the failing test**

```js
test('a DOL publication grades only DOL indices while legacy publication remains whole', () => {
  const assignment = {
    schemaVersion: 5,
    sections: [
      { role: 'warmup', questions: [{ id: 'w1' }] },
      { role: 'dol', questions: [{ id: 'd1' }, { id: 'd2' }] },
    ],
  };
  const seen = [];
  const gradeProgress = (_tracker, indices) => {
    seen.push(indices);
    return { grade: indices.length * 10, attempted: indices.length, total: indices.length, complete: true };
  };
  const dol = classroomPublicationGrade({ assignment, publication: { sectionKey: 'dol' }, tracker: {}, questions: [], gradeProgress });
  const whole = classroomPublicationGrade({ assignment, publication: {}, tracker: {}, questions: [], gradeProgress });
  assert.deepEqual(dol.questionIndices, [1, 2]);
  assert.deepEqual(whole.questionIndices, [0, 1, 2]);
  assert.deepEqual(seen, [[1, 2], [0, 1, 2]]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/platform/classroomSectionGrade.test.mjs`
Expected: FAIL because the helper does not exist.

- [ ] **Step 3: Write minimal implementation**

```js
function classroomPublicationGrade({ assignment = {}, publication = {}, tracker = {}, questions = [], gradeProgress } = {}) {
  if (typeof gradeProgress !== 'function') throw new TypeError('gradeProgress is required.');
  const sectionKey = normalizePublicationSectionKey(publication.sectionKey);
  const questionIndices = runtimeIncludedQuestionIndicesForSection(assignment, sectionKey);
  return {
    sectionKey,
    sectionLabel: publicationSectionLabel(sectionKey),
    questionIndices,
    ...gradeProgress(tracker, questionIndices, questions),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/platform/classroomSectionGrade.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add functions/lib/classroomSectionGrade.js tests/platform/classroomSectionGrade.test.mjs
git commit -m "feat: route Classroom grades by published section"
```

### Task 3: Section launch contract

**Files:**
- Create: `functions/lib/classroomLaunch.js`
- Create: `tests/platform/classroomSectionLaunch.test.mjs`

**Interfaces:**
- Consumes: publication section metadata.
- Produces: `launchPayloadForPublication({ assignmentId, courseId, publicationId, sectionKey })` and `launchRedirectParams(payload)`.

- [ ] **Step 1: Write the failing test**

```js
test('section launch payload and redirect retain section identity while legacy launch stays whole-compatible', () => {
  const payload = launchPayloadForPublication({ assignmentId: 'a1', courseId: 'c1', publicationId: 'p1', sectionKey: 'practice' });
  assert.equal(payload.sectionKey, 'practice');
  const params = launchRedirectParams(payload);
  assert.equal(params.get('launch'), 'a1');
  assert.equal(params.get('classroomSection'), 'practice');

  const legacy = launchRedirectParams({ assignmentId: 'a1' });
  assert.equal(legacy.get('launch'), 'a1');
  assert.equal(legacy.has('classroomSection'), false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/platform/classroomSectionLaunch.test.mjs`
Expected: FAIL because the helper does not exist.

- [ ] **Step 3: Write minimal implementation**

```js
function launchPayloadForPublication({ assignmentId, courseId = null, publicationId = null, sectionKey = 'whole' } = {}) {
  const payload = { assignmentId: String(assignmentId || '') };
  if (courseId) payload.courseId = String(courseId);
  if (publicationId) payload.publicationId = String(publicationId);
  const normalized = normalizePublicationSectionKey(sectionKey);
  if (normalized !== 'whole') payload.sectionKey = normalized;
  return payload;
}

function launchRedirectParams(payload = {}) {
  const params = new URLSearchParams({ launch: String(payload.assignmentId || '') });
  if (payload.courseId) params.set('classroomCourse', String(payload.courseId));
  if (payload.publicationId) params.set('classroomPublication', String(payload.publicationId));
  const sectionKey = normalizePublicationSectionKey(payload.sectionKey);
  if (sectionKey !== 'whole') params.set('classroomSection', sectionKey);
  return params;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/platform/classroomSectionLaunch.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add functions/lib/classroomLaunch.js tests/platform/classroomSectionLaunch.test.mjs
git commit -m "feat: preserve Classroom section in secure launches"
```

### Task 4: Firebase wiring checkpoint

**Files:**
- Modify: `functions/index.js`
- Test: extend the relevant Classroom platform wiring tests.

**Interfaces:**
- Consumes: `classroomPublicationTargets`, `classroomPublicationGrade`, `launchPayloadForPublication`, `launchRedirectParams`.
- Produces: real section-aware `publishAssignmentToClassrooms`, `resolveLaunchToken`, `syncGradeToClassroom`, and retry/reconcile behavior.

- [ ] **Step 1: Write wiring assertions before implementation**

The tests must prove that publish requests carrying `sectionKeys` create distinct publication records and launch payloads, and that grade routing calls `classroomPublicationGrade` per publication rather than reusing one whole-assignment grade.

- [ ] **Step 2: Run the targeted wiring tests and capture the red failure**

Run the exact Node test files added/extended in Step 1.
Expected: FAIL on missing section-aware server wiring.

- [ ] **Step 3: Wire publishing**

Use `classroomPublicationTargets` to expand selected courses and requested sections. Pass each target's `sectionKey`, `sectionLabel`, `title`, `instructions`, `publishAt`, and deterministic `publicationId` into publication creation. Preserve `whole` as the default when no section request is supplied.

- [ ] **Step 4: Wire launch and grade routing**

Use `launchPayloadForPublication` before encryption and `launchRedirectParams` after decryption. In `syncGradeToClassroom`, derive progress independently for every publication through `classroomPublicationGrade`; never reuse the assignment-wide grade for a section publication.

- [ ] **Step 5: Run targeted tests, then all required PR workflows**

Run targeted tests first. Then require green results from Full Platform Test Suite, Assignment V5 Foundation, and Live Challenge Option B before marking this task complete.

- [ ] **Step 6: Commit and update the PR handoff log**

Record the new commit SHA, targeted test results, CI runs, and the next unresolved slice in the permanent PR #151 progress comment.
