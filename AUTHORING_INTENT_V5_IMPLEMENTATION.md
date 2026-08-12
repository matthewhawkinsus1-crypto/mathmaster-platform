# MathMaster Authoring Intent V5 — Implemented

## Purpose

Outside AIs describe mathematical intent. MathMaster compiles that intent into the existing V4 runtime/tool contracts. V4 remains the persistence and student-runtime compatibility format; outside AIs are not expected to author V4 renderer plumbing.

## Pipeline

1. Parse/repair incoming AI text.
2. Preserve the SOURCE authoring version before compilation.
3. If `schemaVersion: 5`, compile Authoring Intent V5 to canonical V4.
4. Compose multi-action questions from workflow stages instead of collapsing them into one narrow legacy renderer.
5. Normalize renderer/storage aliases and question-level standards.
6. Run structural/tool validation.
7. Run workflow-aware semantic/student-experience validation.
8. Open teacher Preflight.

## Main implementation

- `src/platform/contract/authoringIntentV5.js`
  - stable `studentActions` vocabulary;
  - intent-to-tool resolution;
  - function/relation/sequence/graph normalization;
  - multi-action function composition (`table -> graph -> domain/range -> classification`);
  - connected contextual `relationshipModel` workflow compilation;
  - function-derived table keys when the mathematics makes them deterministic;
  - graph-analysis requests derived from studentActions rather than trusted V4 plumbing;
  - specialist workspace mappings;
  - 34 currently student-authorable runtime destinations.
- `src/platform/workflow/WorkflowRunner.jsx`
  - renders the parent prompt for composed questions;
  - carries a given function into a table artifact and the completed table into the graph;
  - checks table/function contradictions before graphing;
  - supports set notation as a real response profile.
- `src/platform/workflow/workflowGrading.js`
  - semantic roster-set grading for domain/range stages;
  - stage-by-stage partial credit and consistency grading.
- `src/platform/contract/semanticValidation.js`
  - visual-promise validation understands composed workflow stages, so a workflow graph/table counts as the graph/table the prompt promises.
- `src/assignmentBlueprint.js`
  - detects V5, records its source schema, and compiles it before V4 runtime validation/storage.
- `src/platform/contract/authoringContract.js`
  - default teacher-facing AI contract is V5;
  - V5 repair requests stay V5 and explicitly prohibit adding V4 renderer plumbing as a workaround.
- `src/AssignmentIntake.jsx` + `src/App.jsx`
  - V5 renderer-plumbing failures are classified as MathMaster compiler defects rather than sent back to the assignment-writing AI.
- `scripts/validate-authoring-v5.mjs`
  - permanent smoke validation includes a rich multi-action question, not just a one-tool graph sample.
- `scripts/validate-assignments.mjs`
  - batch assignment structural + semantic + registry-tool validation.

## Backward compatibility

- Existing V4 JSON still imports normally.
- Bundle V3 activity packaging still imports normally.
- A V5 object with `studentActions` is always compiled from intent. Stray `type`, `toolId`, `functionSpec`, `analysisRequests`, or renderer `graph` plumbing added by a repair AI cannot bypass the V5 compiler.
- Legacy V5 objects that contain no studentActions may still preserve an already-canonical internal type for compatibility.
- No existing assignment migration is required because V5 is compiled before runtime persistence.

## Design rule

The outside AI owns mathematical intent, source fidelity, wording, standards, and the actions students must perform. MathMaster owns renderer/tool choice, workflow composition, deterministic answer derivation when possible, graph/runtime plumbing, storage shapes, and validation of whether the requested student experience can actually happen.
