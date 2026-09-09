# Assignment Runtime Self-Healing Implementation Plan — Reviewed v2

> Supersedes `2026-09-09-assignment-runtime-self-healing.md`. This revision closes the plan-review gaps found after spec approval.

**Goal:** Make existing Assignment V5 content automatically receive known deterministic platform compatibility fixes without changing mathematical meaning, question identity/order, grading meaning, or student progress.

**Runtime repair version:** `ASSIGNMENT_RUNTIME_REPAIR_VERSION = 1`

**Approved spec:** `docs/superpowers/specs/2026-09-09-assignment-runtime-self-healing-design.md`

## Non-negotiable invariants

- Keep `getStoredAssignmentQuestions()` a literal `sections[]` reader.
- Add a separate prepared runtime view; reads must not secretly become writes.
- Never change `questionId`, assignment document identity, question/section order, prompt/scenario meaning, TEKS/alignment, grading meaning, authored graph/table evidence, DOK/difficulty, or intended student actions under automatic repair.
- Never reset or rewrite attempts, responses, partial credit, grade history, evidence events, Google Classroom publication identity, or passback records.
- Authored explicit workflow outranks generated state. Ambiguous origin fails closed.
- Runtime compatibility uses no AI, network call, randomness, or sibling assignment dependency.
- Presentation-only repairs may apply in memory but are never persisted as question-content changes.
- A content persistence patch is built by the dedicated persistence verifier; the core repair engine does **not** return `safePersistencePatch`.
- Portable export and duplication clear prior `runtimeCompatibility` metadata and re-evaluate the new copy.
- Student runtime never writes assignment documents. Only teacher-side flows may persist a proven compatibility patch.
- Preflight and printable/worksheet presentation must evaluate the prepared runtime assignment where question behavior/presentation matters, while persistence comparisons retain access to the literal stored assignment.

## Task 1 — Pure repair registry and exact District DOL fixtures

**Create**
- `src/platform/assignments/assignmentRuntimeRepair.js`
- `tests/platform/assignmentRuntimeSelfHealing.test.mjs`

**Reference**
- `src/platform/workflow/questionRecipes.js`
- `src/platform/workflow/questionWorkflow.js`
- `src/platform/workflow/workflowPresentation.js`

### RED

Write tests first for:

1. Question `0d24f506-f272-4004-9a1e-5b4986492b51` with `relationshipModel`, `functionModeling`, and `ask: ['continuity','domain']` has no authored workflow and therefore needs **no content rewrite** on a current runtime. Its manifest still records that the no-synthetic-graph compatibility rule was evaluated.
2. A known legacy generated `graphConstruction` stage may be removed only when recipe ask, student actions, grading, authored evidence, and provenance/known legacy shape all prove graph construction was platform-generated and unrequested.
3. A hand-authored graph stage, graph grading key, authored graph request, or ambiguous provenance is preserved and diagnosed rather than deleted.
4. Question `278da14e-695e-4707-a721-63c4a534ec58` retains its exact authored graph object and is tagged with the presentation compatibility keys; no mathematical content changes.
5. Assignment repair preserves question ids and order and is idempotent.
6. One failing repair rule returns the original question plus a `runtimeCompatibility` diagnostic instead of throwing the assignment open path.

Run and confirm expected failure:

```bash
node --test tests/platform/assignmentRuntimeSelfHealing.test.mjs
```

### GREEN

Implement:

```js
export const ASSIGNMENT_RUNTIME_REPAIR_VERSION = 1;
export const RUNTIME_REPAIR_KEYS = Object.freeze({
  NO_SYNTHETIC_FUNCTION_MODELING_GRAPH: 'function-modeling-exact-ask-no-synthetic-graph-v1',
  ACTIVE_WORKFLOW_TASK: 'workflow-active-task-presentation-v1',
  AUTHORED_GRAPH_PERSISTENCE: 'workflow-authored-graph-persistence-v1',
  COLLAPSED_WORKFLOW: 'collapsed-generated-workflow-v1',
});
```

Public APIs:

```js
repairQuestionForCurrentRuntime(question, context = {})
repairAssignmentForCurrentRuntime(assignment, context = {})
```

Question result fields:

```js
{
  question,
  changed,
  repairKeys,
  presentationOnly,
  safeToPersist,
  diagnostics,
}
```

Assignment result fields:

```js
{
  assignment,
  changed,
  repairManifest,
  safeToPersist,
  diagnostics,
}
```

No Firestore calls and no tracker imports.

Verify:

```bash
node --test \
  tests/platform/assignmentRuntimeSelfHealing.test.mjs \
  tests/platform/v5ExplicitWorkflowRepairRegression.test.mjs \
  tests/platform/workflowPresentationRuntime.test.mjs
```

Commit: `feat: add assignment runtime repair registry`

## Task 2 — Explicit runtime preparation for student/teacher/preflight/worksheet consumers

**Modify**
- `src/platform/contract/storedAssignmentV5.js`
- `src/App.jsx`
- `src/platform/preflight/assignmentV5PreflightModel.js`
- `src/platform/resources/assignmentWorksheetPdfModel.js`
- `src/platform/resources/teacherAssignmentWorksheetExport.js` only if it bypasses the worksheet model/runtime preparation
- `tests/platform/assignmentRuntimeCanonicalReads.test.mjs`
- relevant `tests/platform/assignmentWorksheetPdf*.test.mjs`
- relevant V5 Preflight tests

### RED

Write tests proving:

- literal stored questions still contain the known old generated stage;
- `getRuntimeAssignmentQuestions()` removes/overrides only the proven platform artifact;
- original assignment object remains unchanged;
- active student/teacher preview uses one `prepareAssignmentForRuntime()` result before `QuestionEngine` receives questions;
- V5 Preflight evaluates a prepared runtime copy for behavioral/workflow diagnostics without mutating the stored input;
- worksheet/print model is built from the prepared runtime question shape, so an old synthetic graph stage does not reappear in print/export;
- question ids/order remain identical in every consumer.

Expected RED command:

```bash
node --test \
  tests/platform/assignmentRuntimeCanonicalReads.test.mjs \
  tests/platform/assignmentRuntimeSelfHealing.test.mjs \
  tests/platform/assignmentWorksheetPdf.test.mjs
```

### GREEN

In `storedAssignmentV5.js` expose:

```js
prepareAssignmentForRuntime(assignment, context = {})
getRuntimeAssignmentQuestions(assignment, context = {})
```

Do **not** change `getStoredAssignmentQuestions()`.

In `App.jsx` keep both:

```js
const rawActiveAssignmentData = assignments.find(...);
const activeRuntimeRepair = useMemo(
  () => prepareAssignmentForRuntime(rawActiveAssignmentData || {}),
  [rawActiveAssignmentData],
);
const activeAssignmentData = activeRuntimeRepair.assignment;
```

Use prepared data for lifecycle/question rendering/teacher preview. Keep raw data for persistence comparison and metadata operations.

In Preflight/worksheet code, prepare a copy at the boundary and use that copy for workflow/presentation analysis. Never write from these helpers.

Verify focused tests plus:

```bash
node --test tests/platform/workflowPresentationRuntime.test.mjs
```

Commit: `feat: prepare saved assignments for current runtime`

## Task 3 — Strict safe persistence and compatibility stamp

**Create**
- `src/platform/assignments/assignmentRuntimeRepairPersistence.js`

**Modify**
- `src/platform/contract/assignmentSchemaV5.js`
- `src/platform/contract/storedAssignmentV5.js`
- `src/App.jsx`
- `tests/platform/storedAssignmentV5.test.mjs`
- `tests/platform/assignmentRuntimeSelfHealing.test.mjs`

### RED

Tests must prove:

- presentation-only result => no persistence patch;
- no content change => no persistence patch merely to stamp an assignment;
- safe generated-workflow cleanup => minimal `sections + runtimeCompatibility` patch;
- changed prompt, grading, alignment/TEKS, authored graph/table evidence, id, order, section role, DOK/difficulty, or student actions => persistence refused;
- rerun is idempotent;
- malformed compatibility metadata is treated as absent, not as a blocking V5 error;
- copy/export reset clears prior stamp.

### GREEN

Implement:

```js
buildRuntimeRepairPersistencePatch({ storedAssignment, repairResult, nowIso })
```

It performs protected-field comparison, current V5 Preflight validation, ordered-id checks, and rule-specific allowlists. It returns `{ patch: null, diagnostics }` on any uncertainty.

Stamp:

```js
runtimeCompatibility: {
  repairVersion: 1,
  repairedAt: '<ISO>',
  repairKeys: [...],
}
```

`storedAssignmentToV5({ resetAssignmentKey: true })` must omit the old stamp. `canonicalV5PersistencePatch()` preserves a stamp only when the exact candidate contains one.

Teacher orchestration in `App.jsx`:

- only teacher role may write;
- `buildRuntimeRepairPersistencePatch()` is called against raw stored assignment + prepared repair result;
- StrictMode guard by assignment id + version + repaired sections fingerprint;
- assignment document only; no student collection writes;
- persistence failure does not remove the safe in-memory runtime repair.

Verify focused tests and `npm run build`.

Commit: `feat: persist proven runtime compatibility repairs safely`

## Task 4 — Persist and auto-resolve Repair Center platform issues

**Create**
- `src/platform/preflight/assignmentPlatformIssues.js`
- `tests/platform/assignmentPlatformIssueResolution.test.mjs`

**Modify**
- `src/platform/preflight/incompleteAssignmentDraft.js`
- `src/platform/preflight/incompleteAssignmentDraftStore.js`
- `src/platform/preflight/questionRepairImport.js`
- `src/platform/preflight/assignmentRepairCenterModel.js`
- `src/components/teacher/IncompleteAssignmentRepairCenter.jsx`
- `tests/platform/assignmentRepairStagedPlatformIssueHandoff.test.mjs`

### RED

Tests:

- report-only AI packet persists normalized `platformIssues` without changing canonical assignment JSON or assignment revision;
- deduplicate by question id + suspected component + normalized reason;
- issue stays open when no explicit repair-manifest match exists;
- issue becomes `resolvedByPlatformUpdate` only when the manifest names both its question and matching repair key;
- store `resolvedRepairKey` and `resolvedRuntimeVersion: 1`;
- teacher flags/notes/history remain unchanged;
- open issues keep “Copy platform bug handoff”; resolved issues show “Resolved by platform update.”

### GREEN

Stored issue shape:

```js
{
  questionId,
  classification: 'platformIssue',
  suspectedComponent,
  reason,
  status: 'open' | 'resolvedByPlatformUpdate',
  resolvedRepairKey: null | string,
  resolvedRuntimeVersion: null | 1,
  reportedAt,
}
```

Do not resolve from version number alone.

Commit: `feat: resolve repair center platform issues by runtime update`

## Task 5 — Workflow provenance for future safe migrations

**Modify**
- `src/platform/workflow/questionWorkflow.js`
- `src/platform/contract/authoringIntentV5.js`
- `src/platform/assignments/assignmentRuntimeRepair.js`
- `tests/platform/questionWorkflow.test.mjs`
- `tests/platform/authoringIntentV5CompositionRegression.test.mjs`
- `tests/platform/v5ExplicitWorkflowRepairRegression.test.mjs`

### RED

Tests prove:

- recipe-expanded persisted workflow gets `workflowProvenance.source = 'recipeExpansion'` plus recipe name and generator version;
- explicit authored workflow gets/preserves authored provenance and remains byte-for-byte stage-equivalent;
- `readComposedQuestion()` still gives explicit workflow precedence;
- repair registry treats `source: 'authored'` as a hard stop for workflow deletion;
- structural legacy detection remains only for known pre-provenance bug shapes.

### GREEN

Provenance metadata only; no grading/stage behavior changes.

Commit: `feat: record workflow generation provenance`

## Task 6 — Deployed build/runtime diagnostics

**Create**
- `src/platform/runtime/buildInfo.js`
- `tests/platform/runtimeBuildInfo.test.mjs`

**Modify**
- `scripts/build-firebase-hosting.mjs`
- `src/main.jsx`
- `src/components/teacher/IncompleteAssignmentRepairCenter.jsx`
- `vite.config.js` only if needed for compile-time definitions beyond normal Vite `VITE_*` env exposure

### RED

Tests prove build metadata exposes:

```js
{
  gitSha,
  builtAt,
  assignmentRuntimeRepairVersion: 1,
}
```

and the Firebase build script supplies `VITE_MATHMASTER_GIT_SHA`, `VITE_MATHMASTER_BUILT_AT`, and `VITE_MATHMASTER_RUNTIME_REPAIR_VERSION`.

### GREEN

`build-firebase-hosting.mjs` resolves git SHA with safe `unknown` fallback and one build timestamp. `main.jsx` publishes:

```js
window.__MATHMASTER_BUILD__ = getMathMasterBuildInfo();
```

Repair Center diagnosis:

- live runtime older than required repair => deployment/cache mismatch;
- live runtime current, stored assignment stamp older => compatibility evaluation/persistence pending;
- both current and issue reproduces => genuine remaining regression.

An old stamp by itself must never recommend rewriting the question.

Verify `npm run build` and `npm run build:firebase`.

Commit: `feat: expose deployed runtime compatibility version`

## Task 7 — Consolidate deterministic legacy repair and certify release

**Modify**
- `src/platform/assignments/libraryAssignmentReuse.js`
- `tests/platform/libraryAssignmentReuse.test.mjs`
- `.github/workflows/assignment-v5-foundation.yml` to include `src/platform/assignments/**` and the new self-healing tests if current required PR workflows do not already cover them
- `package.json` only if the new tests are not already included by `test:authoring-v5`

### RED/GREEN

Add cases:

1. self-contained legacy collapsed workflow is repaired by the registry with no sibling assignment;
2. source-dependent collapsed shape still uses the existing explicit teacher/library fallback instead of guessing;
3. no student runtime path ever auto-copies another assignment.

### Release gate

Run/retrieve evidence for:

```bash
node --test \
  tests/platform/assignmentRuntimeSelfHealing.test.mjs \
  tests/platform/assignmentRuntimeCanonicalReads.test.mjs \
  tests/platform/v5ExplicitWorkflowRepairRegression.test.mjs \
  tests/platform/workflowPresentationRuntime.test.mjs \
  tests/platform/libraryAssignmentReuse.test.mjs \
  tests/platform/assignmentPlatformIssueResolution.test.mjs \
  tests/platform/runtimeBuildInfo.test.mjs

npm run test:authoring-v5
npm run validate:authoring-v5
npm run audit:assignment-authoring-boundary
npm run audit:legacy-assignment-source
npm run lint
npm run build
npm run build:firebase
```

Then inspect PR #166 GitHub Actions. Do not mark ready until required checks are green or an unrelated pre-existing baseline failure is specifically documented.

Commit: `test: certify assignment runtime self-healing`

## Final acceptance

- Q5 `0d24f506-f272-4004-9a1e-5b4986492b51` has no synthetic graph on the current deployed runtime and needs no replacement JSON.
- Q6 `278da14e-695e-4707-a721-63c4a534ec58` updates `YOUR TASK` per active subtask and retains the exact authored `y = 2x - 6` graph.
- Student, teacher preview, Preflight, and worksheet/print behavioral consumers all use the prepared runtime view where appropriate.
- Stored literal V5 remains available for persistence comparison and never mutates merely because it was read.
- Automatic content repair changes only proven platform-generated state.
- Student progress and grade/evidence records are untouched.
- Repair Center can persist and later mark platform issues resolved by a specific repair key.
- Build diagnostics objectively identify the deployed SHA/runtime repair version.
- Export/duplication cannot falsely carry an old “already repaired” stamp.
- Required tests/builds/CI are green before PR #166 is ready to merge.
