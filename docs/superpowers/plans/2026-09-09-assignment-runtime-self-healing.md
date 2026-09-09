# Assignment Runtime Self-Healing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a versioned Assignment V5 compatibility layer that automatically applies known deterministic platform repairs to existing saved assignments without changing mathematical meaning, student progress, question identity, or grading meaning.

**Architecture:** Introduce a pure repair registry in `src/platform/assignments/assignmentRuntimeRepair.js`, keep literal stored readers unchanged, and add an explicit runtime-preparation boundary for student/teacher rendering. Persist only repairs proven platform-only from teacher-side flows, track platform issues by repair key, and expose build/runtime repair version so stale Firebase Hosting can be distinguished from stale assignment data.

**Tech Stack:** React 19, Vite 8, Firebase Firestore, Node 22 `node:test`, existing Assignment V5/workflow/preflight modules.

**Spec:** `docs/superpowers/specs/2026-09-09-assignment-runtime-self-healing-design.md`

## Global Constraints

- `ASSIGNMENT_RUNTIME_REPAIR_VERSION = 1` for the first release.
- `schemaVersion: 5` remains the authored contract; runtime repair version is separate metadata.
- `questionId`, question order, section order, assignment document identity, grading meaning, TEKS, prompt/scenario meaning, authored graph/table evidence, DOK/difficulty, and student actions must not change under automatic repair.
- Student attempts, responses, partial credit, evidence events, grade history, Google Classroom publication identity, and passback records must never be reset by compatibility repair.
- No AI/network/random/sibling-assignment dependency is allowed in the runtime compatibility pass.
- Authored explicit workflows outrank generated state; ambiguous provenance fails closed.
- Presentation-only repairs may apply in memory but must not trigger content writes.
- Portable export/duplication must not carry a stale `runtimeCompatibility` stamp.
- A compatibility failure returns the original question plus diagnostics; it must not make the assignment unopenable.
- Existing Safe Live Repair remains the only path for changes that require reinterpreting student responses or grading.

---

### Task 1: Build the pure runtime repair registry and District DOL regression fixtures

**Files:**
- Create: `src/platform/assignments/assignmentRuntimeRepair.js`
- Create: `tests/platform/assignmentRuntimeSelfHealing.test.mjs`
- Reference only: `src/platform/workflow/questionRecipes.js`
- Reference only: `src/platform/workflow/questionWorkflow.js`

**Interfaces:**
- Produces: `ASSIGNMENT_RUNTIME_REPAIR_VERSION`
- Produces: `repairQuestionForCurrentRuntime(question, context = {})`
- Produces: `repairAssignmentForCurrentRuntime(assignment, context = {})`
- Produces result fields: `question|assignment`, `changed`, `repairKeys`, `repairManifest`, `presentationOnly`, `safeToPersist`, `diagnostics`, `safePersistencePatch`

- [ ] **Step 1: Write failing tests for the exact District DOL shapes and invariants**

Use the real question ids and minimum authored fields:

```js
const districtContinuityDomain = {
  questionId: '0d24f506-f272-4004-9a1e-5b4986492b51',
  type: 'relationshipModel',
  prompt: 'A school bus can carry at most 48 students. Classify the relationship and state a reasonable domain.',
  studentActions: ['classifyContinuity', 'stateDomain'],
  continuity: 'discrete',
  correctDomain: '{0, 1, 2, ..., 48}',
  recipe: { name: 'functionModeling', ask: ['continuity', 'domain'] },
};

const districtGraphCharacteristics = {
  questionId: '278da14e-695e-4707-a721-63c4a534ec58',
  type: 'functionCharacteristics',
  prompt: 'Analyze the graph of y = 2x - 6.',
  graph: {
    xMin: -2,
    xMax: 7,
    yMin: -10,
    yMax: 10,
    functions: [{ type: 'line', m: 2, b: -6 }],
  },
  recipe: {
    name: 'functionCharacteristics',
    ask: ['xInterceptExists', 'xInterceptValue', 'zeros', 'behavior'],
  },
};
```

Tests must assert:

```js
const result = repairQuestionForCurrentRuntime(districtContinuityDomain);
assert.equal(result.changed, false);
assert.equal(result.safeToPersist, false);
assert.deepEqual(result.question, districtContinuityDomain);
assert.ok(result.repairKeys.includes('function-modeling-exact-ask-no-synthetic-graph-v1'));

const assignmentResult = repairAssignmentForCurrentRuntime({
  schemaVersion: 5,
  sections: [{ id: 'classwork', role: 'classwork', questions: [districtContinuityDomain, districtGraphCharacteristics] }],
});
assert.deepEqual(
  assignmentResult.assignment.sections[0].questions.map((q) => q.questionId),
  [districtContinuityDomain.questionId, districtGraphCharacteristics.questionId],
);
```

Also fixture one known old generated workflow with a `graphConstruction` stage and prove it is removable only when all of these are true: recipe ask omits graph, `studentActions` omit graph construction, grading has no graph key, no authored graph is present, and the stage matches the known generated default. A hand-authored graph stage or graph grading must remain unchanged and produce an ambiguity diagnostic.

- [ ] **Step 2: Run the new test and verify RED**

Run:

```bash
node --test tests/platform/assignmentRuntimeSelfHealing.test.mjs
```

Expected: FAIL because `assignmentRuntimeRepair.js` and its exports do not exist.

- [ ] **Step 3: Implement the minimal pure registry**

Start with these constants and result shape:

```js
export const ASSIGNMENT_RUNTIME_REPAIR_VERSION = 1;

export const RUNTIME_REPAIR_KEYS = Object.freeze({
  NO_SYNTHETIC_FUNCTION_MODELING_GRAPH: 'function-modeling-exact-ask-no-synthetic-graph-v1',
  ACTIVE_WORKFLOW_TASK: 'workflow-active-task-presentation-v1',
  AUTHORED_GRAPH_PERSISTENCE: 'workflow-authored-graph-persistence-v1',
  COLLAPSED_WORKFLOW: 'collapsed-generated-workflow-v1',
});
```

Keep rules append-only and pure. Every rule must have `repairKey`, `applies`, `repair`, `verify`, and `persistence` (`safe` or `presentationOnly`). Catch per-rule exceptions and append a diagnostic such as:

```js
{
  issueKind: 'platformIssue',
  source: 'runtimeCompatibility',
  code: `runtimeRepair.${rule.repairKey}.failed`,
  severity: 'warning',
  questionId: question.questionId || null,
  repairKey: rule.repairKey,
  message: error.message,
}
```

Return the original question if verification fails.

- [ ] **Step 4: Run focused tests and existing workflow regressions**

```bash
node --test \
  tests/platform/assignmentRuntimeSelfHealing.test.mjs \
  tests/platform/v5ExplicitWorkflowRepairRegression.test.mjs \
  tests/platform/workflowPresentationRuntime.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/platform/assignments/assignmentRuntimeRepair.js tests/platform/assignmentRuntimeSelfHealing.test.mjs
git commit -m "feat: add assignment runtime repair registry"
```

---

### Task 2: Add the explicit runtime-preparation boundary without changing literal stored reads

**Files:**
- Modify: `src/platform/contract/storedAssignmentV5.js`
- Modify: `src/App.jsx`
- Modify: `tests/platform/assignmentRuntimeCanonicalReads.test.mjs`
- Test: `tests/platform/assignmentRuntimeSelfHealing.test.mjs`

**Interfaces:**
- Consumes: `repairAssignmentForCurrentRuntime()` from Task 1
- Produces: `prepareAssignmentForRuntime(assignment, context = {})`
- Produces: `getRuntimeAssignmentQuestions(assignment, context = {})`
- Preserves: `getStoredAssignmentQuestions()` as a literal `sections[]` reader

- [ ] **Step 1: Write failing tests that stored reads remain literal while runtime reads self-heal**

Add assertions similar to:

```js
const stored = getStoredAssignmentQuestions(oldAssignment);
const runtime = getRuntimeAssignmentQuestions(oldAssignment);
assert.equal(stored[0].workflow.some((stage) => stage.kind === 'graphConstruction'), true);
assert.equal(runtime[0].workflow.some((stage) => stage.kind === 'graphConstruction'), false);
assert.deepEqual(getStoredAssignmentQuestions(oldAssignment), stored, 'runtime preparation must not mutate storage objects');
```

Add a source-contract assertion that `App.jsx` prepares the active assignment before deriving `activeQuestions`.

- [ ] **Step 2: Run RED**

```bash
node --test tests/platform/assignmentRuntimeCanonicalReads.test.mjs tests/platform/assignmentRuntimeSelfHealing.test.mjs
```

Expected: FAIL because runtime reader exports/wiring do not exist.

- [ ] **Step 3: Add runtime helpers**

In `storedAssignmentV5.js`, import Task 1 and expose:

```js
export const prepareAssignmentForRuntime = (assignment = {}, context = {}) => (
  repairAssignmentForCurrentRuntime(assignment, context)
);

export const getRuntimeAssignmentQuestions = (assignment = {}, context = {}) => (
  flattenV5Sections(prepareAssignmentForRuntime(assignment, context).assignment)
);
```

Do not change the existing implementation of `getStoredAssignmentQuestions()`.

- [ ] **Step 4: Wire active student/teacher preview runtime through one prepared assignment**

In `App.jsx`, keep a raw lookup for persistence comparisons, then derive the runtime form:

```js
const rawActiveAssignmentData = assignments.find(
  (assignment) => assignment.id === activeAssignmentId,
);
const activeRuntimeRepair = useMemo(
  () => prepareAssignmentForRuntime(rawActiveAssignmentData || {}),
  [rawActiveAssignmentData],
);
const activeAssignmentData = activeRuntimeRepair.assignment;
const activeQuestions = getStoredAssignmentQuestions(activeAssignmentData);
```

Use the prepared `activeAssignmentData` for lifecycle/question rendering and teacher preview. Do not replace the entire stored assignment list; dashboard/library metadata should remain based on stored data unless behavior requires runtime preparation.

- [ ] **Step 5: Verify runtime and existing canonical tests**

```bash
node --test \
  tests/platform/assignmentRuntimeCanonicalReads.test.mjs \
  tests/platform/assignmentRuntimeSelfHealing.test.mjs \
  tests/platform/workflowPresentationRuntime.test.mjs
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/platform/contract/storedAssignmentV5.js src/App.jsx tests/platform/assignmentRuntimeCanonicalReads.test.mjs tests/platform/assignmentRuntimeSelfHealing.test.mjs
git commit -m "feat: prepare saved assignments for current runtime"
```

---

### Task 3: Add safe compatibility stamps and persistence proof without touching student trackers

**Files:**
- Modify: `src/platform/contract/assignmentSchemaV5.js`
- Modify: `src/platform/contract/storedAssignmentV5.js`
- Create: `src/platform/assignments/assignmentRuntimeRepairPersistence.js`
- Modify: `src/App.jsx`
- Modify: `tests/platform/storedAssignmentV5.test.mjs`
- Test: `tests/platform/assignmentRuntimeSelfHealing.test.mjs`

**Interfaces:**
- Consumes: Task 1 repair result
- Produces: `buildRuntimeRepairPersistencePatch({ storedAssignment, repairResult, nowIso })`
- Produces stamp:

```js
runtimeCompatibility: {
  repairVersion: 1,
  repairedAt: '<ISO timestamp>',
  repairKeys: ['...'],
}
```

- [ ] **Step 1: Write persistence safety tests**

Cover all of these cases:

```js
assert.equal(buildRuntimeRepairPersistencePatch({ storedAssignment, repairResult: presentationOnly }).patch, null);
assert.equal(buildRuntimeRepairPersistencePatch({ storedAssignment, repairResult: currentNoChange }).patch, null);
assert.deepEqual(safePatch.sections, repaired.sections);
assert.equal(safePatch.runtimeCompatibility.repairVersion, 1);
assert.deepEqual(beforeIds, afterIds);
assert.deepEqual(beforeGrading, afterGrading);
assert.deepEqual(beforeGraphEvidence, afterGraphEvidence);
```

Also prove a changed prompt, grading object, standards/alignment, question id, order, or section role refuses persistence.

- [ ] **Step 2: Run RED**

```bash
node --test tests/platform/assignmentRuntimeSelfHealing.test.mjs tests/platform/storedAssignmentV5.test.mjs
```

Expected: FAIL because persistence proof/stamp behavior is absent.

- [ ] **Step 3: Implement strict persistence proof**

`buildRuntimeRepairPersistencePatch()` must:

1. require `repairResult.changed === true` and every applied content repair to be `safeToPersist`;
2. compare ordered question ids before/after;
3. compare protected mathematical fields before/after after removing only the rule-specific allowlist (for the initial content rule, only the known generated workflow stage/provenance may differ);
4. run `buildAssignmentV5PreflightModel(repairedAssignment)` and refuse if it adds a blocking diagnostic;
5. return `{ patch: null, diagnostics }` on any refusal;
6. otherwise return a minimal patch containing `sections` and `runtimeCompatibility`.

Do not import or mutate grade/attempt tracker code.

- [ ] **Step 4: Teach V5 reconstruction/persistence about the stamp and reset it on copy/export**

In `storedAssignmentToV5()`:

```js
runtimeCompatibility: resetAssignmentKey
  ? undefined
  : assignment.runtimeCompatibility,
```

In `canonicalV5PersistencePatch()` preserve `runtimeCompatibility` only when it exists on the exact candidate.

Add normalization that treats a malformed stamp as absent; do not make it a V5 validation blocker.

- [ ] **Step 5: Add teacher-side auto-persistence orchestration**

In `App.jsx`, when a teacher opens an assignment and `activeRuntimeRepair.safePersistencePatch` is non-null, run one guarded `updateDoc()` keyed by `assignmentId + repairVersion`. The write must contain only the safe patch plus `updatedAt`; it must not update student documents or trackers. Keep a `useRef(new Set())` guard so React StrictMode cannot double-write the same repair version.

If persistence fails, keep using the in-memory repaired assignment and surface a non-blocking diagnostic/toast; do not revert the runtime view.

- [ ] **Step 6: Verify**

```bash
node --test \
  tests/platform/assignmentRuntimeSelfHealing.test.mjs \
  tests/platform/storedAssignmentV5.test.mjs \
  tests/platform/assignmentRuntimeCanonicalReads.test.mjs
npm run build
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/platform/contract/assignmentSchemaV5.js src/platform/contract/storedAssignmentV5.js src/platform/assignments/assignmentRuntimeRepairPersistence.js src/App.jsx tests/platform/assignmentRuntimeSelfHealing.test.mjs tests/platform/storedAssignmentV5.test.mjs
git commit -m "feat: persist proven runtime compatibility repairs safely"
```

---

### Task 4: Persist platform-issue reports and resolve them by repair key

**Files:**
- Create: `src/platform/preflight/assignmentPlatformIssues.js`
- Modify: `src/platform/preflight/incompleteAssignmentDraft.js`
- Modify: `src/platform/preflight/incompleteAssignmentDraftStore.js`
- Modify: `src/platform/preflight/questionRepairImport.js`
- Modify: `src/platform/preflight/assignmentRepairCenterModel.js`
- Modify: `src/components/teacher/IncompleteAssignmentRepairCenter.jsx`
- Create: `tests/platform/assignmentPlatformIssueResolution.test.mjs`
- Modify: `tests/platform/assignmentRepairStagedPlatformIssueHandoff.test.mjs`

**Interfaces:**
- Produces: `normalizePlatformIssue(issue, { reportedAt, runtimeVersion })`
- Produces: `resolvePlatformIssuesByRepairManifest(issues, repairManifest)`
- Stored draft field: `platformIssues: []`

- [ ] **Step 1: Write failing platform-issue lifecycle tests**

Normalize report-only AI output to:

```js
{
  questionId: '0d24f506-f272-4004-9a1e-5b4986492b51',
  classification: 'platformIssue',
  suspectedComponent: 'functionModeling',
  reason: 'Unexpected graph is rendered.',
  status: 'open',
  resolvedRepairKey: null,
  resolvedRuntimeVersion: null,
}
```

Then apply a manifest containing `function-modeling-exact-ask-no-synthetic-graph-v1` for that question and assert the issue becomes:

```js
{
  ...issue,
  status: 'resolvedByPlatformUpdate',
  resolvedRepairKey: 'function-modeling-exact-ask-no-synthetic-graph-v1',
  resolvedRuntimeVersion: 1,
}
```

An unmatched issue must remain open. Teacher flags/notes must remain unchanged.

- [ ] **Step 2: Run RED**

```bash
node --test tests/platform/assignmentPlatformIssueResolution.test.mjs tests/platform/assignmentRepairStagedPlatformIssueHandoff.test.mjs
```

Expected: FAIL because platform issues are currently staged but not persisted/resolved.

- [ ] **Step 3: Implement the pure platform issue model**

`assignmentPlatformIssues.js` should deduplicate by `questionId + suspectedComponent + normalized reason`, preserve history, and resolve only when the repair manifest explicitly names the question and repair key. Never infer resolution from a generic version bump alone.

- [ ] **Step 4: Persist report-only issues without changing assignment revision/content**

Add `saveIncompleteAssignmentPlatformIssues(draft, platformIssues)` in the store. Report-only AI packets must save normalized platform issues to the draft but leave `assignmentRevision` and canonical JSON unchanged.

- [ ] **Step 5: Feed runtime repair manifest into Repair Center**

Prepare the draft assignment through Task 1 in `IncompleteAssignmentRepairCenter.jsx`, resolve stored platform issues against its manifest, and pass them into `buildAssignmentRepairCenterModel()`.

Render `Resolved by platform update` plus `resolvedRepairKey` for resolved issues. Keep `Copy platform bug handoff` for open issues.

- [ ] **Step 6: Verify**

```bash
node --test \
  tests/platform/assignmentPlatformIssueResolution.test.mjs \
  tests/platform/assignmentRepairStagedPlatformIssueHandoff.test.mjs \
  tests/platform/assignmentRepairCenterModel.test.mjs \
  tests/platform/incompleteDraftRepairPersistence.test.mjs
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/platform/preflight/assignmentPlatformIssues.js src/platform/preflight/incompleteAssignmentDraft.js src/platform/preflight/incompleteAssignmentDraftStore.js src/platform/preflight/questionRepairImport.js src/platform/preflight/assignmentRepairCenterModel.js src/components/teacher/IncompleteAssignmentRepairCenter.jsx tests/platform/assignmentPlatformIssueResolution.test.mjs tests/platform/assignmentRepairStagedPlatformIssueHandoff.test.mjs
git commit -m "feat: resolve repair center platform issues by runtime update"
```

---

### Task 5: Add workflow provenance for future generated-state repairs

**Files:**
- Modify: `src/platform/workflow/questionWorkflow.js`
- Modify: `src/platform/contract/authoringIntentV5.js`
- Modify: `tests/platform/questionWorkflow.test.mjs`
- Modify: `tests/platform/authoringIntentV5CompositionRegression.test.mjs`

**Interfaces:**
- Produces generated provenance:

```js
workflowProvenance: {
  source: 'recipeExpansion',
  recipeName: '<recipe>',
  generatorVersion: 1,
}
```

- Preserves explicit authored workflow provenance as `source: 'authored'` when the compiler persists one.

- [ ] **Step 1: Write failing provenance tests**

Assert recipe-expanded persisted workflows receive generated provenance, while valid explicit workflows remain byte-for-byte intact except for explicit authored provenance metadata. Assert `readComposedQuestion()` still lets explicit workflow outrank recipe expansion.

- [ ] **Step 2: Run RED**

```bash
node --test tests/platform/questionWorkflow.test.mjs tests/platform/authoringIntentV5CompositionRegression.test.mjs tests/platform/v5ExplicitWorkflowRepairRegression.test.mjs
```

- [ ] **Step 3: Implement provenance at the compile/persistence boundary**

Do not change runtime grading or workflow stage content. Provenance is metadata only and must not affect stage selection.

- [ ] **Step 4: Teach Task 1 detectors to prefer provenance**

Rules should use `workflowProvenance.source === 'recipeExpansion'` as strong proof. Structural detection remains only for known legacy shapes that predate provenance. `source: 'authored'` must block automatic workflow deletion.

- [ ] **Step 5: Verify and commit**

```bash
node --test \
  tests/platform/questionWorkflow.test.mjs \
  tests/platform/authoringIntentV5CompositionRegression.test.mjs \
  tests/platform/v5ExplicitWorkflowRepairRegression.test.mjs \
  tests/platform/assignmentRuntimeSelfHealing.test.mjs

git add src/platform/workflow/questionWorkflow.js src/platform/contract/authoringIntentV5.js src/platform/assignments/assignmentRuntimeRepair.js tests/platform/questionWorkflow.test.mjs tests/platform/authoringIntentV5CompositionRegression.test.mjs tests/platform/assignmentRuntimeSelfHealing.test.mjs
git commit -m "feat: record workflow generation provenance"
```

---

### Task 6: Expose deployed build and runtime-repair version

**Files:**
- Modify: `scripts/build-firebase-hosting.mjs`
- Modify: `vite.config.js`
- Create: `src/platform/runtime/buildInfo.js`
- Modify: `src/main.jsx`
- Modify: `src/components/teacher/IncompleteAssignmentRepairCenter.jsx`
- Create: `tests/platform/runtimeBuildInfo.test.mjs`

**Interfaces:**
- Produces: `getMathMasterBuildInfo()`
- Produces browser surface: `window.__MATHMASTER_BUILD__`

- [ ] **Step 1: Write failing build-info tests**

Assert the normalized object has:

```js
{
  gitSha: expectNonEmptyString,
  builtAt: expectIsoString,
  assignmentRuntimeRepairVersion: 1,
}
```

Also source-test that the Firebase build script passes `VITE_MATHMASTER_GIT_SHA`, `VITE_MATHMASTER_BUILT_AT`, and `VITE_MATHMASTER_RUNTIME_REPAIR_VERSION` to Vite.

- [ ] **Step 2: Run RED**

```bash
node --test tests/platform/runtimeBuildInfo.test.mjs
```

- [ ] **Step 3: Inject build metadata**

In `build-firebase-hosting.mjs`, resolve git SHA using `git rev-parse HEAD` with a safe `'unknown'` fallback and set build time once. Pass all three values through the existing environment object.

In `buildInfo.js`, read `import.meta.env` and normalize the values. In `main.jsx`, assign:

```js
window.__MATHMASTER_BUILD__ = getMathMasterBuildInfo();
```

- [ ] **Step 4: Show deployment diagnosis in Repair Center when platform issues exist**

Display the live git SHA/runtime repair version and the assignment stamp. Classification copy must distinguish:

- live runtime older than required repair version → deployment/cache mismatch;
- live runtime current, assignment stamp older → compatibility evaluation/persistence pending;
- both current and issue still reproducible → remaining runtime regression.

Do not claim an assignment needs rewriting merely because its stamp is old.

- [ ] **Step 5: Verify build**

```bash
node --test tests/platform/runtimeBuildInfo.test.mjs tests/platform/assignmentPlatformIssueResolution.test.mjs
npm run build
npm run build:firebase
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add scripts/build-firebase-hosting.mjs vite.config.js src/platform/runtime/buildInfo.js src/main.jsx src/components/teacher/IncompleteAssignmentRepairCenter.jsx tests/platform/runtimeBuildInfo.test.mjs
git commit -m "feat: expose deployed runtime compatibility version"
```

---

### Task 7: Consolidate deterministic legacy library repair and run the full release gate

**Files:**
- Modify: `src/platform/assignments/libraryAssignmentReuse.js`
- Modify: `tests/platform/libraryAssignmentReuse.test.mjs`
- Modify: `package.json` only if the new focused test files are not already covered by `test:authoring-v5`
- Modify: `.github/workflows/assignment-v5-foundation.yml` to include `src/platform/assignments/**` if this path is not already covered by another required PR workflow

**Interfaces:**
- Consumes: Task 1 repair registry
- Preserves: manual sibling/library-source repair as fallback when self-contained reconstruction is not provable

- [ ] **Step 1: Write failing consolidation tests**

Add two cases:

1. a legacy collapsed workflow with enough own recipe/provenance data is repaired by `repairAssignmentForCurrentRuntime()` with no sibling assignment;
2. the existing source-dependent collapsed shape still returns `no-matching-canonical-source`/uses the manual repair path rather than guessing.

- [ ] **Step 2: Run RED**

```bash
node --test tests/platform/libraryAssignmentReuse.test.mjs tests/platform/assignmentRuntimeSelfHealing.test.mjs
```

- [ ] **Step 3: Delegate deterministic cases to the registry**

`libraryAssignmentReuse.js` should first use the self-contained repair engine. Keep `inspectLibraryContentRepair()` and `buildSafeLibraryContentRepair()` for cases where the target question itself lacks enough information. Do not auto-copy from a sibling during student runtime.

- [ ] **Step 4: Run focused regression gate**

```bash
node --test \
  tests/platform/assignmentRuntimeSelfHealing.test.mjs \
  tests/platform/assignmentRuntimeCanonicalReads.test.mjs \
  tests/platform/v5ExplicitWorkflowRepairRegression.test.mjs \
  tests/platform/workflowPresentationRuntime.test.mjs \
  tests/platform/libraryAssignmentReuse.test.mjs \
  tests/platform/assignmentPlatformIssueResolution.test.mjs \
  tests/platform/runtimeBuildInfo.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Run the V5 authoring suite, validators, lint, and builds**

```bash
npm run test:authoring-v5
npm run validate:authoring-v5
npm run audit:assignment-authoring-boundary
npm run audit:legacy-assignment-source
npm run lint
npm run build
npm run build:firebase
```

Expected: all commands PASS. If an existing unrelated baseline failure appears, record the exact pre-existing failure in PR #166 rather than weakening a repair invariant to make the suite green.

- [ ] **Step 6: Verify no student-state mutation path was introduced**

Search the final diff and tests for any write to grade/attempt/evidence collections from the compatibility modules. The only automatic assignment write may be the teacher-side assignment document patch from Task 3.

- [ ] **Step 7: Commit**

```bash
git add src/platform/assignments/libraryAssignmentReuse.js tests/platform/libraryAssignmentReuse.test.mjs package.json .github/workflows/assignment-v5-foundation.yml
git commit -m "test: certify assignment runtime self-healing"
```

---

## Final PR #166 acceptance checklist

- [ ] Existing District DOL question `0d24f506-f272-4004-9a1e-5b4986492b51` renders with no synthetic graph on a current runtime and requires no replacement JSON.
- [ ] Existing District DOL question `278da14e-695e-4707-a721-63c4a534ec58` uses the active stage prompt for `YOUR TASK` and retains the exact authored `y = 2x - 6` graph.
- [ ] Automatic repairs preserve assignment/question identity and all student progress.
- [ ] Authored explicit workflows are preserved unless a narrow legacy detector can prove generated-state corruption.
- [ ] Safe persisted repairs are idempotent and stamped `runtimeCompatibility.repairVersion: 1`.
- [ ] Export/duplication clears the old compatibility stamp.
- [ ] Repair Center stores platform issues and can mark them `resolvedByPlatformUpdate` with a specific repair key/version.
- [ ] Live build diagnostics expose git SHA, build time, and assignment runtime repair version.
- [ ] The live diagnostic can distinguish stale hosting from stale assignment data from a genuine remaining regression.
- [ ] No compatibility module writes student grade/attempt/evidence records.
- [ ] Focused tests, `test:authoring-v5`, validators/audits, lint, normal build, Firebase build, and required GitHub PR checks are green before PR #166 is marked ready.
