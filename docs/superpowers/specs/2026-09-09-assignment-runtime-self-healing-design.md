# Assignment Runtime Self-Healing Design

**Date:** 2026-09-09  
**Status:** Design approved in chat; implementation pending written-spec review  
**Branch:** `codex/assignment-runtime-self-healing`

## Problem

MathMaster correctly treats Assignment V5 as the canonical assignment contract, but saved V5 questions can outlive the platform version that originally interpreted or compiled them. A platform bug may therefore be fixed in shared runtime code while an existing saved assignment still carries old platform-generated workflow/presentation state, or while the browser is still running an older hosted bundle.

The District DOL review exposed both sides of this gap:

1. A `functionModeling` question that asks only for continuity/domain should never acquire an unrelated graph stage. PR #163 repaired the recipe behavior.
2. A multipart graph-analysis question should update `YOUR TASK` to the active stage and preserve the exact authored graph throughout the workflow. PR #165 repaired the shared workflow presentation runtime.
3. Existing assignments were not rewritten by those PRs, by design. MathMaster currently has no central compatibility pass that says: “this saved V5 content was created under an older runtime; apply only known safe platform repairs before students/teachers use it.”
4. A merged repair is not necessarily a deployed repair. Without a visible deployed-runtime revision, an old Firebase Hosting bundle can look exactly like a failed assignment migration.

The result is unnecessary question-by-question repair work for issues that are really platform compatibility defects.

## Goal

Add a permanent, versioned Assignment V5 compatibility layer that automatically applies deterministic platform repairs to existing saved assignments while preserving student work, grading meaning, question identity, and teacher-authored mathematics.

A platform repair should make old valid assignments behave like equivalent assignments authored today, without asking a teacher to regenerate or individually replace correct questions.

## Non-goals

This system will **not**:

- silently rewrite incorrect mathematics;
- change a correct answer, grading rubric meaning, TEKS alignment, prompt meaning, question order, section role, or `questionId`;
- use AI to guess a repair during student runtime;
- automatically accept ambiguous differences between two assignments;
- treat every old explicit workflow as disposable;
- migrate V4 or earlier content back into support;
- erase teacher flags or repair history.

Assignment-content repairs remain teacher-reviewed. This feature is only for known platform-generated compatibility defects.

## Core safety invariants

Every automatic repair must satisfy all of the following:

1. **Question identity is immutable.** `questionId` must remain byte-for-byte identical.
2. **Question order is immutable.** Section order and question order cannot change.
3. **Mathematical meaning is immutable.** Prompt/scenario, mathematical values, authored graph/table evidence, answer meaning, grading meaning, standards, difficulty/DOK, and intended student action cannot change.
4. **Student state is never discarded.** Attempts, responses, partial credit, grade history, evidence events, Google Classroom publication identity, and passback records remain attached to the existing assignment/question identities.
5. **Authored intent outranks generated compatibility state.** A genuinely authored explicit workflow must not be replaced merely because a recipe also exists.
6. **Repairs must be deterministic and local.** No network call, model call, random choice, or sibling-assignment dependency is allowed in the runtime compatibility pass.
7. **Ambiguity fails closed.** If MathMaster cannot prove the repair is platform-only, it reports the issue and leaves the saved question unchanged.
8. **Persistence is stricter than presentation.** A repair may be safe to apply in memory for rendering while still being unsafe to write back to Firestore.

## Architecture

### 1. New compatibility module

Add a pure module, proposed path:

`src/platform/assignments/assignmentRuntimeRepair.js`

It owns a registry of narrowly-scoped repair rules.

Proposed API:

```js
repairQuestionForCurrentRuntime(question, context)
// -> {
//      question,
//      changed,
//      repairKeys,
//      presentationOnly,
//      safeToPersist,
//      diagnostics
//    }

repairAssignmentForCurrentRuntime(assignment, context)
// -> {
//      assignment,
//      changed,
//      repairManifest,
//      safePersistencePatch,
//      diagnostics
//    }
```

The module must be pure and side-effect free. It does not write Firestore, mutate student trackers, show UI, or call AI.

### 2. Repair registry

Each repair is a named contract with:

- stable `repairKey`;
- minimum/current runtime repair version;
- a narrow detector;
- a deterministic transformer or presentation override;
- proof checks for fields that are allowed to change;
- `safeToPersist` classification;
- regression fixtures.

Example shape:

```js
{
  repairKey: 'function-modeling-exact-ask-no-synthetic-graph-v1',
  applies(question, context) { ... },
  repair(question, context) { ... },
  verify(before, after) { ... },
  persistence: 'safe' | 'presentationOnly'
}
```

Repair rules are append-only compatibility knowledge. Old rules can become no-ops once all known saved content is current, but their tests remain so the bug cannot reappear.

### 3. Runtime contract version

Introduce a platform constant such as:

`ASSIGNMENT_RUNTIME_REPAIR_VERSION`

and persist a lightweight assignment compatibility stamp, proposed as:

```js
runtimeCompatibility: {
  repairVersion: 3,
  repairedAt: '2026-09-09T...',
  repairKeys: ['...']
}
```

This stamp is metadata only. It does not replace `schemaVersion: 5`; schema version describes the authored data contract, while runtime repair version describes which known platform compatibility repairs have been evaluated.

Assignments without the stamp are treated as version 0 and evaluated safely.

The runtime must still run cheap detector guards even when the version is current, so a malformed/stale delivery copy cannot bypass protection merely because metadata was copied incorrectly.

### 4. Canonical read integration

Today, `getStoredAssignmentQuestions()` flattens `sections[]` and returns the stored questions. The new compatibility layer should sit at the canonical assignment-read boundary, but it must avoid surprising write behavior in generic getters.

Recommended split:

- keep `getStoredAssignmentQuestions()` as a literal canonical data reader;
- add `getRuntimeAssignmentQuestions()` / `prepareAssignmentForRuntime()` that applies compatibility repairs;
- make student assignment runtime, teacher preview, worksheet rendering, and preflight use the prepared runtime assignment where behavior matters;
- keep persistence/editing code able to compare stored-before vs repaired-after explicitly.

This prevents a harmless read helper from secretly becoming a Firestore migration mechanism.

### 5. Safe background persistence

When a teacher opens or manages a V5 assignment, MathMaster may persist repairs only when the compatibility module proves all changes are platform-only and `safeToPersist`.

Persistence flow:

1. Read stored V5 assignment.
2. Run `repairAssignmentForCurrentRuntime`.
3. Validate repaired V5 with current preflight/semantic/workflow validation.
4. Compare before/after identity and mathematical invariants.
5. Write only the canonical V5 fields required for the repair plus `runtimeCompatibility` metadata.
6. Record a compact repair-history entry.
7. Do not rewrite student tracker documents merely because presentation/workflow metadata was corrected.

If any check fails, do not write. Surface a Repair Center/platform diagnostic.

Student runtime should use safe in-memory repairs immediately; it should not require the student client to have permission to mutate assignment documents.

### 6. Repair Center integration

A `platformIssue` from an AI repair packet should become a tracked platform repair diagnostic instead of a dead-end report.

Store enough metadata to reconnect the report to a future platform repair:

```js
{
  questionId,
  classification: 'platformIssue',
  suspectedComponent,
  status: 'open' | 'resolvedByPlatformUpdate',
  resolvedRepairKey: null | '...',
  resolvedRuntimeVersion: null | 3
}
```

After a runtime compatibility pass fixes the affected behavior, the teacher UI can show:

**Resolved by platform update**

rather than asking for another AI repair packet.

Teacher-authored notes/flags remain in history even after resolution.

## Initial repair contracts

### A. Function-modeling exact-ask graph protection

**District DOL fixture:** question `0d24f506-f272-4004-9a1e-5b4986492b51`.

Authored intent:

- `type: relationshipModel`;
- recipe `functionModeling`;
- `ask: ['continuity', 'domain']`;
- no authored graph task;
- student actions only classify continuity and state domain.

Required current behavior:

- no graph interaction stage;
- no synthetic `y=x` graph;
- no unrelated graph evidence panel.

If an old saved platform-generated workflow contains the known default graph stage, the compatibility layer may remove only that generated stage when it can prove there is no authored graph request, no graph grading key, and no graph student action.

If the workflow appears genuinely hand-authored or graph grading depends on it, fail closed and report instead of deleting it.

### B. Multipart active-task presentation

**District DOL fixture:** question `278da14e-695e-4707-a721-63c4a534ec58`.

Required current behavior:

- `YOUR TASK` uses the active workflow stage prompt;
- the question-level prompt remains the overall context;
- advancing/backtracking stages updates the task strip immediately.

This is normally a **presentation-only** repair. The saved question should not need mathematical changes.

### C. Persistent authored graph identity

Same District DOL fixture.

Required current behavior:

- the exact authored `question.graph` is persistent evidence during graph-reading stages;
- it is not reconstructed from `functionSpec` or `correctEquation`;
- it does not disappear between intercept/zero/behavior stages;
- it is not duplicated when focus mode already renders persistent evidence;
- a student-created checked graph may outrank the authored graph only in workflows that genuinely construct a graph.

This is also normally **presentation-only** and should not write assignment content.

### D. Known collapsed workflow copy

Fold the existing narrow `libraryAssignmentReuse.js` collapsed-workflow detector into the permanent compatibility system where possible.

The current manual repair depends on another intact saved assignment. The new system should first ask whether the broken shape can be deterministically reconstructed from the question’s own authored recipe/workflow metadata. If yes, repair from the question itself. If not, retain the existing explicit teacher repair path rather than guessing from a sibling assignment automatically.

## Authored workflow vs generated workflow

This is the highest-risk boundary.

Current `readComposedQuestion()` correctly lets an explicit workflow outrank recipe expansion. That rule remains correct for genuine authored workflows.

The compatibility system must therefore distinguish:

1. **authored explicit workflow** — preserve;
2. **platform-generated cached/compiled workflow** — eligible for a known repair;
3. **unknown origin** — preserve unless a repair detector can prove the exact old platform defect from structure alone.

Going forward, when MathMaster persists a generated workflow, it should mark provenance explicitly, for example:

```js
workflowProvenance: {
  source: 'recipeExpansion',
  recipeName: 'functionModeling',
  generatorVersion: 4
}
```

Hand-authored workflows use `source: 'authored'` or omit generated provenance. This prevents future compatibility work from needing structural guesswork.

## Deployment/runtime revision visibility

Add a build-time/runtime revision surface so the live app can identify the code it is actually running.

Proposed metadata:

```js
window.__MATHMASTER_BUILD__ = {
  gitSha: '...',
  builtAt: '...',
  assignmentRuntimeRepairVersion: 3
}
```

Expose it in an admin/diagnostic surface and optionally in teacher Repair Center diagnostics.

When a teacher reports “PR is merged but the assignment still behaves the old way,” MathMaster should be able to say one of:

- live runtime is older than the repair — deploy/cache problem;
- live runtime contains the repair but the assignment has not been persisted — compatibility migration pending;
- live runtime and assignment repair version are current — genuine remaining regression.

This avoids conflating deployment state with assignment state.

## Student-data handling

Automatic compatibility repair must never reset progress.

For repairs that change only presentation/workflow metadata:

- keep the same assignment document ID;
- keep the same question IDs and indices;
- do not recreate grade records;
- do not zero attempts;
- do not replace response history;
- continue using existing tracker repair utilities only when an actual grading contract changed under an explicitly-approved live-correction rule.

If a proposed compatibility repair would require reinterpreting already-stored student responses, it is not an automatic runtime repair. It must enter the existing live-correction safety path instead.

## Error handling

Compatibility repair errors must be contained.

- One bad repair rule cannot make the assignment unopenable.
- A failed repair returns diagnostics and the original question.
- A failed persistence verification leaves Firestore untouched.
- Student runtime should prefer a safe presentation-only correction where available.
- Repair Center should show the exact repair key/detector that failed, not a generic “assignment invalid” message.

## Testing strategy

Tests are required before implementation changes.

### Exact District DOL regressions

Use the real authored shapes for both flagged questions.

1. continuity/domain relationship model never receives graph stage/evidence;
2. multipart `functionCharacteristics` reports the current stage prompt;
3. exact authored graph object remains the persistent graph by identity;
4. no duplicate graph in focus mode;
5. all question IDs/order are unchanged after compatibility pass.

### Persistence safety

- safe platform-only repair produces a minimal persistence patch;
- mathematical-content mutation makes `safeToPersist` false;
- grading change makes `safeToPersist` false unless routed through live-correction safety;
- ambiguous explicit workflow is preserved and diagnosed;
- rerunning a repair is idempotent;
- current-version assignment produces no write.

### Student-state safety

Fixture a live tracker with attempts/partial credit before migration and assert the compatibility pass never changes it.

### Repair Center

- open `platformIssue` resolves when a matching repair key applies;
- unresolved/ambiguous platform issue remains open;
- teacher note/history remains visible.

### Deployment metadata

- build exposes revision and repair version;
- diagnostic UI can compare live repair version with assignment repair version.

## Rollout

1. Ship repair engine with diagnostics and presentation-only repairs first.
2. Verify District DOL fixtures in teacher preview and student runtime.
3. Enable safe teacher-side persistence for proven rules.
4. Integrate Repair Center automatic resolution status.
5. Add deployed-runtime revision diagnostics.
6. Audit existing manual library repair logic and move only deterministic self-contained cases into the registry.

No bulk Firestore rewrite is required for launch. Assignments become compatible as they are read, and safe persistence gradually stamps them current when teachers interact with them.

## Success criteria

The feature is complete when:

- opening the existing District DOL assignment on the current deployed runtime shows no random graph on the continuity/domain question;
- multipart graph questions always update `YOUR TASK` and retain the original authored graph;
- the teacher does not need to create replacement JSON for either platform issue;
- old assignments can receive future known platform repairs through the same registry;
- automatic repairs preserve assignment/question identity and existing student progress;
- Repair Center can mark a platform issue resolved by a specific platform repair;
- MathMaster can display which runtime/repair version is actually deployed, eliminating ambiguity between stale hosting and stale assignment data.
