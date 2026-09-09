# Platform Question Runtime Repair Plan

## Goal

Repair the shared MathMaster question runtime defects exposed by the District DOL review without rewriting correct assignment questions.

This repair has four platform contracts:

1. Generic CCMR/Path generator `derived` values must resolve by dependency, not JavaScript object insertion order.
2. A generator failure must remain isolated to one question; it must never crash the whole assignment player.
3. Multi-stage workflows must publish the active stage prompt to the student `YOUR TASK` surface.
4. A function-characteristics workflow with an authored graph must keep that exact graph available while the student moves through graph-reading subtasks.

PR #163 already protects the separate invariant that `functionModeling` recipes asking only for continuity/domain or continuity/domain/range do not acquire an unwanted graph stage. This branch will preserve that merged protection rather than duplicate it.

## Safety boundaries

- Do not modify the affected assignment JSON or reorder its generator fields as a workaround.
- Keep deterministic seeded generation.
- Never expose grading keys to the renderer while preserving an authored graph.
- Do not replace an authored graph with a newly inferred/reconstructed graph when the question already supplied the evidence students are meant to read.
- A failed generated question must be non-gradable and navigable; neighboring questions must continue to work.
- Keep the current `multiAnswer` contract: one answer field is valid. Do not force authors to create a fake second field.

## TDD sequence

### 1. Add regression tests first

Add `tests/platform/platformQuestionRuntimeRepair.test.mjs` covering:

- an out-of-order derived dependency chain materializes successfully;
- unknown derived dependencies and cycles produce explicit generator diagnostics;
- assignment generation returns a safe `platformQuestionError` sentinel rather than throwing when a generator cannot materialize;
- workflow progress reports the current stage prompt for `YOUR TASK`;
- an authored graph is selected as persistent workflow evidence only when the workflow actually uses graph evidence;
- a continuity/domain-only relationship model still has no graph stage, preserving PR #163.

### 2. Resolve derived generator dependencies

Primary file: `functions/shared/pathQuestionGeneration.mjs`.

Replace insertion-order evaluation with a dependency-aware resolver. Repeatedly evaluate derived expressions whose referenced names are already available. Defer unresolved expressions, distinguish missing external names from derived-to-derived cycles, and keep value/constraint retries deterministic.

### 3. Fail one generated question closed

Primary file: `src/problemGenerator.js`.

When generic template materialization fails, return a `platformQuestionError` question preserving the source question id/type and the generator reason. Do not throw from the pre-render generation phase.

Primary file: `src/QuestionEngine.jsx`.

Render the sentinel as an explicit non-gradable question failure panel inside the normal question shell so navigation and the rest of the assignment remain available.

### 4. Make workflow state drive `YOUR TASK`

Primary files:

- `src/platform/workflow/WorkflowRunner.jsx`
- `src/QuestionEngine.jsx`

Include `currentStagePrompt` in workflow progress and use it as `MobileViewportContainer.promptText` while a composed workflow is active. Fall back to the overall question prompt for ordinary questions.

### 5. Preserve authored graph evidence in long workflows

Primary file: `src/platform/workflow/WorkflowRunner.jsx`.

Select persistent graph evidence from the authored `content.graph` when the workflow contains graph-reading stages. Prefer a checked student-created graph only when one exists. Render the persistent graph once beside the active focus-mode stage and suppress duplicate stage-level copies of the same evidence.

### 6. Verification

Run focused regressions first, then the broader authoring/platform suites and build through GitHub Actions. Do not mark the branch ready until the targeted regression, relevant existing tests, and CI are green.

## Verification record

- Focused runtime regressions passed together on production commit `57fb0cb161a8675056db8bf9e3bcb742cf5a9204` after installing the repository dependencies.
- The final repair removed all one-time patch scripts and branch-only helper workflows before review.
- This documentation-only commit intentionally retriggers the repository's standard pull-request CI as the repository owner because GitHub marked the bot-authored production commit's PR workflows `action_required` without creating any jobs.
