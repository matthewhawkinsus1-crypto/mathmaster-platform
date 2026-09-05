# Solver Workspace, Undo, and Algebra Integrity Design

## Status

Approved in chat on 2026-09-04. This document defines the architecture and acceptance criteria for the next implementation phase. It does not itself change production behavior.

## Problem statement

The enlarged/focus solver experience currently enlarges the mathematical tool without fully separating it from assignment chrome. The Task panel, attempts/help UI, and bottom Undo/Scratchpad bar can consume or cover the same space students need for equations. The effect is most severe in multi-branch absolute-value work, where every branch expansion increases vertical pressure.

Undo behavior is also inconsistent across solver families. Multi-relation solving already keeps meaningful relation-state history, while the ordinary step-by-step solver primarily exposes undo for transient/pending UI state. As a result, a student can commit algebra steps and still have no useful committed-step Undo.

A third issue is mathematical integrity. A negative coefficient such as `-2p` can lose its sign during additive-operation reconstruction. This is not only a display defect: the mutated expression can become the solver's actual internal state. If later solution logic trusts that mutable state, the solver can derive and grade against an incorrect answer.

The upgrade must therefore solve all three concerns together:

1. reclaim workspace area consistently across solving tools;
2. provide real, committed-step Undo across solving tools; and
3. prevent mutable student-work state from corrupting the mathematical truth used for transformation and grading.

## Goals

- Make Enlarge/Focus a true solver workspace rather than a larger copy of the assignment page.
- Automatically hide Task and assignment chrome while the workspace is active.
- Move global workspace utilities into a compact top bar in workspace mode.
- Keep local mathematical actions next to the mathematics they affect.
- Make the absolute-value/multi-relation layout substantially denser on Chromebook/desktop while preserving a stacked mobile fallback.
- Standardize Undo around meaningful mathematical state snapshots.
- Preserve transient undo behavior where useful, but prioritize clearing transient state before reverting committed history.
- Fix negative-sign loss at the algebra engine/state layer, not only in rendering.
- Keep the original authored/generated relation immutable and separate from mutable student work.
- Validate final correctness independently against the pristine original problem.
- Ensure Undo does not consume attempts or create duplicate partial-credit awards.
- Add regression coverage that verifies rendered math, internal solver state, and final grading truth.

## Non-goals

- Redesign the entire assignment page outside solver workspace mode.
- Change assignment attempt policy, section gating, or scoring weights except where required to prevent duplicate milestone credit after Undo.
- Rebuild every solver into one monolithic core.
- Replace existing local solver controls such as Rewrite/Simplify, Check Split, Reset Work, or candidate verification.
- Add a separate route that remounts the solver when Enlarge/Focus is entered.

## Chosen architecture

Use one shared workspace contract controlled from `QuestionEngine`, while solver frames report entry/exit through callbacks.

`QuestionEngine` is the correct bridge because it already knows assignment-level actions such as Undo, Scratchpad, submission, attempts, help, and tool props. It will own a small `solverWorkspaceState` that tells outer assignment UI whether the active solver is in workspace mode.

`SolverWorkspaceFrame` remains the visual shell for solving tools. It reports workspace entry/exit upward and receives the workspace actions it should render in its top toolbar. This avoids DOM/CSS hacks and avoids making the solver frame reach upward into unrelated assignment components.

`MobileViewportContainer` receives the workspace-active state and suppresses the normal sticky Task/action chrome while workspace mode is active. On exit, normal presentation is restored without remounting the solver core.

Enlarge and Focus may have different entry affordances, but once either enters the solver workspace they share one underlying behavior contract.

### Workspace-state contract

At minimum, the shared state must distinguish:

- normal assignment view;
- active solver workspace;
- the source/entry mode when needed for button labeling or exit behavior.

The state change must be prop/callback driven. It must not depend on brittle document selectors.

The solver core must stay mounted while workspace mode changes so that equation state, undo history, scratch work, and draft persistence are not lost.

## Workspace UI behavior

### Automatic cleanup

When Enlarge or Focus activates the solver workspace:

- Task is automatically hidden.
- The student's prior normal-view Task collapsed/open state is remembered.
- Attempts-remaining chrome is hidden from the workspace.
- Guided Notes / Need Help strips are hidden from the workspace.
- TEKS/CCMR/standards badges are hidden from the workspace.
- Section progress and normal question-navigation chrome are hidden from the workspace when they would otherwise consume solver space.
- Large partial-credit/status banners are hidden from the workspace.
- The normal sticky bottom Undo/Scratchpad/action bar is suppressed.
- No hidden Task placeholder or gray message strip may continue to occupy solver space.

On exit, the prior normal-view Task state and normal assignment chrome are restored.

All grading, attempt, accommodation, and progress logic remains active in the background; only the visual chrome is suppressed.

### Compact top workspace bar

The workspace top bar is the single persistent global-control row. It must remain at the top of the solver workspace and should not overlap solver content.

The bar contains, as applicable:

- compact Task access;
- Undo;
- Scratchpad;
- zoom out / current zoom / zoom in;
- Fit Work;
- compact Help/overflow access;
- conditional final Check/Submit;
- Return to Assignment / exit workspace.

The Task button opens the directions in a temporary drawer/popover that does not permanently consume solver space. Closing it immediately restores the full work area.

Help behaves similarly. Guided Notes required by accommodation remain reachable, but they appear temporarily rather than permanently occupying a row.

### Submit placement

Question-level final `Check`, `Submit`, or `Submit Work` moves into the top workspace bar when workspace mode is active.

When a final submit action is not yet available, it occupies no space.

When it becomes available:

- it is the primary action in the right side of the top bar;
- Return to Assignment becomes secondary;
- the normal bottom action bar remains suppressed.

Local solver actions do not move to the global top bar. Examples that stay beside the mathematics include:

- Check Split;
- Commit Step;
- Rewrite/Simplify;
- Add/Subtract/Multiply/Divide operation staging;
- cancellation actions;
- candidate verification;
- Reset Work.

## Absolute-value and multi-relation compact layout

The current multi-relation flow must gain a dense workspace layout without compromising normal/mobile use.

On wide Chromebook/desktop workspace widths:

- Branch A and Branch B render side by side in equal columns once a split is accepted.
- Each branch has a compact heading and clear active-state treatment.
- Clicking within a branch activates it.
- A single compact operation dock is shared rather than repeating large operation panels.
- The dock clearly supports Branch A, Branch B, or Both Branches where the mathematical operation permits it.
- The `OR` relationship remains visible but compact, centered between branch columns rather than consuming a full large row.
- Repeated instructional/status prose is reduced to concise labels.
- Equation cards own their own overflow/fit behavior so long equations do not widen or shift the full page.

On narrow/mobile widths, the same branches stack vertically and preserve touch-friendly controls.

The dense layout is a presentation mode. It must not create a second mathematical implementation of branch solving.

## Undo architecture

### Shared contract

Every solving tool exposes the same minimal Undo controller to `QuestionEngine`:

- `canUndo`;
- `undo()`;
- a user-facing label/description.

`QuestionEngine` decides where the control renders:

- normal view: existing assignment action area;
- workspace view: compact top workspace bar.

### Meaningful history

Undo reverses the last meaningful mathematical action.

Committed history must cover, where supported by the solver:

- balanced Add/Subtract/Multiply/Divide steps;
- committed Rewrite/Simplify steps;
- committed cancellation transformations;
- absolute-value split;
- branch transformations;
- relation-symbol reversal where mathematically required;
- square-root or other special algebra operations;
- future transformations that materially change solver state.

UI-only actions such as selecting a branch, opening Math Tools, toggling a hint, or opening a menu do not create committed Undo history.

### Transient versus committed Undo

If the student currently has an uncommitted staged operation, placement, cancellation mark, or simplification entry, Undo first clears/reverts that transient state.

If no transient state is active, Undo restores the previous committed mathematical snapshot.

Repeated Undo walks backward through committed mathematical states until the original work state is reached.

### Snapshot foundation

Use the existing `useUndoHistory` utility as the common snapshot foundation where practical. Solver-specific snapshots may contain different canonical state shapes, but the semantics of recording, restoring, reset, persistence, and `canUndo` must be consistent.

For the ordinary `StepByStepAlgebraCore`, committed equation state must be added to history rather than limiting Undo to pending UI state.

For `MultiRelationAlgebraCore`, existing committed relation history should be aligned to the same contract and audited so every meaningful commit path records the prior state exactly once.

Reset Work clears committed history and returns the solver to the appropriate original/current problem start state.

## Mathematical truth and state integrity

### Three-layer separation

The implementation must explicitly separate:

1. **Pristine problem truth**: immutable authored/generated original equation or relation and its trusted metadata.
2. **Mutable workspace state**: the student's current transformed equations, branches, staging state, and solver history.
3. **Grading truth**: final correctness and expected solution derived from or independently validated against the pristine problem, never redefined by corrupted mutable workspace state.

A workspace transformation is allowed to change layer 2 only. It must never overwrite layer 1 or redefine layer 3.

### Pristine truth anchor

When the question initializes, the solver retains an immutable canonical representation of the original equation/relation.

All final candidate checks and final correctness checks use that pristine relation as the authoritative reference.

Any generated or computed internal expected solution used for grading must originate from the pristine relation or an independently trusted solution path. It must not be recomputed solely from mutable student-work state after transformations.

For absolute-value questions, final candidate solutions must be substituted/verified against the original absolute-value relation before the question can be marked correct.

### Transformation integrity

A committed transformation must preserve the mathematical meaning required by that operation.

The preferred rule is operation-aware validation rather than generic string comparison. The transformation layer already knows the operation being applied, so validation can enforce the relevant invariant for:

- equality-preserving balanced operations;
- inequality operations including required symbol reversal;
- absolute-value split semantics;
- branch-local transformations;
- special operations with domain restrictions.

If a transformation produces a state that violates its required invariant, the solver must reject that commit, preserve the previous valid state, and surface a recoverable student-facing message rather than silently accepting corrupted algebra.

The runtime validator is a guardrail, not a substitute for fixing transformation logic.

## Negative-sign regression fix

The known sign-loss defect must be fixed in the algebra transformation engine, specifically the additive-operation reconstruction path.

The current failure mode can treat a term such as `-2p` as a positive outer additive term whose rendered text happens to begin with `-`. Rebuilding the expression by stripping the textual sign and separately applying an outer sign can therefore convert `-2p` into `2p`.

The fix must preserve signed mathematical nodes rather than infer mathematical sign by stripping formatted text. Signed coefficient/expression meaning must remain part of the canonical AST/state throughout reconstruction.

The fix must cover at least:

- `-2p`;
- `-x`;
- negative constants;
- negated parenthesized expressions such as `-(x + 1)`;
- negative first terms and negative later terms;
- insertion before/after/end placements supported by the solver.

This is explicitly an internal-math fix, not a renderer-only patch.

## Required end-to-end regression case

The observed branch state must become a permanent certification case.

Given:

`8 + p = -2p + 3`

After subtracting `p` on both sides, the internal solver state and rendered state must both be:

`8 + p - p = -2p - p + 3`

After valid simplification, the state must progress consistently to:

`8 = -3p + 3`

then:

`5 = -3p`

then:

`p = -5/3`

The test must assert all of the following:

- the negative coefficient remains present in the AST/canonical state;
- the rendered expression matches the canonical state;
- the next solver transformation uses the negative coefficient;
- the internally computed/validated correct solution is `-5/3` for this relation;
- final grading does not accept an answer derived from the corrupted `+2p` path;
- Undo from each committed state restores the exact preceding canonical relation.

For absolute-value problems, equivalent branch tests must verify each branch and the final solution set against the original absolute-value relation.

## Partial credit, attempts, and Undo

Undo must never consume a question attempt.

A student must not be able to farm partial credit by repeating the same valid step after Undo.

Each credit-bearing mathematical milestone should receive a stable semantic/state fingerprint. Credit is awarded for demonstrating a milestone, not for the number of times a button is pressed.

If a student:

1. performs a valid step and receives milestone credit;
2. undoes that step;
3. later reproduces the same milestone;

that milestone is recognized as already demonstrated and is not credited again.

Teacher evidence may retain that the student previously demonstrated a valid step even if the workspace is later undone. Undo changes the current working state; it does not erase historical evidence of demonstrated reasoning.

## Persistence behavior

Entering or leaving workspace mode must not remount the solver or erase:

- current canonical work state;
- committed Undo history;
- transient draft where appropriate;
- scratchpad state;
- partial-credit milestone fingerprints;
- persisted question draft.

Undo writes/restores the reverted canonical work state through the existing draft persistence path.

Undo should not create a new grading attempt or duplicate a productive-step event. Where telemetry records an Undo event, it should be identified as navigation/history behavior rather than a newly demonstrated mathematical milestone.

## Error handling

- Invalid transformation output is rejected before replacing the last valid solver state.
- The solver remains usable after a rejected transformation.
- Failure in optional workspace chrome (Task/Help drawer) must not corrupt mathematical state.
- If Undo cannot restore a valid prior snapshot, it must fail closed: retain the current valid state and disable/repair Undo rather than partially applying a broken snapshot.
- Exiting workspace mode always restores normal assignment chrome even if a temporary Task/Help drawer was open.

## Component responsibilities

### `src/QuestionEngine.jsx`

Owns the shared workspace-active state and remains the bridge between assignment-level actions and the solver. It should:

- receive workspace entry/exit notifications from the active solver frame;
- continue receiving the active solver Undo controller;
- route Undo/Scratchpad/final Submit to the workspace top bar while workspace mode is active;
- route the same actions to normal assignment UI when workspace mode is inactive;
- keep grading/attempt/help logic active even when its chrome is visually suppressed.

### `src/components/student/MobileViewportContainer.jsx`

Owns normal Task presentation and normal sticky assignment action placement. It should:

- accept workspace-active state;
- automatically suppress Task/chrome/action bar during workspace mode;
- remember and restore the student's prior Task collapsed/open state on exit;
- avoid rendering placeholder bars that still consume workspace area.

### `src/components/student/MathToolMobileLayout.css`

Adjusts the normal/sticky layout rules so workspace mode does not leave a bottom action bar or hidden Task residue in the viewport.

### `src/components/common/SolverWorkspaceFrame.jsx`

Owns the visual solver workspace shell. It should:

- report workspace state changes upward;
- render the compact top workspace bar;
- render temporary Task/Help access;
- render promoted global actions supplied by `QuestionEngine`;
- keep solver children mounted across normal/workspace transitions;
- expose a dense-workspace presentation signal to solver content.

### `src/components/common/SolverWorkspaceFrame.css`

Provides viewport-level workspace sizing, pinned toolbar layout, content scrolling, responsive behavior, and non-overlapping solver body geometry.

### `src/StepByStepAlgebra.jsx` and `src/MultiRelationAlgebra.jsx`

Remain thin wrappers. They pass the workspace contract between `QuestionEngine`, `SolverWorkspaceFrame`, and their respective solver cores without duplicating workspace UI logic.

### `src/StepByStepAlgebraCore.jsx`

Adds real committed mathematical snapshot history and aligns its Undo semantics to the shared contract while preserving transient undo behavior.

### `src/MultiRelationAlgebraCore.jsx`

Aligns existing relation history to the shared contract, audits all commit paths, uses dense branch presentation when workspace mode is active, and keeps final correctness anchored to the pristine original relation.

### `src/useUndoHistory.js`

Remains the shared generic snapshot/persistence utility and may receive focused extensions only if required by both solver families. Solver-specific logic should not be pushed into this generic hook.

### `src/algebraAstEngine.js`

Fixes signed-term preservation in additive-operation reconstruction and exposes/uses canonical AST semantics rather than textual sign stripping.

### `src/algebraRelationFoundation.js`

Continues relation-aware transformation behavior and participates in invariant/final-relation verification where appropriate.

## Testing strategy

### Algebra engine unit tests

Add direct tests for signed-term preservation across additive placement and reconstruction, including negative coefficients, negative variables, negative constants, parenthesized negatives, and placement variants.

### Solver unit/component tests

For `StepByStepAlgebraCore`:

- commit several genuine algebra steps;
- verify `canUndo` becomes active;
- undo repeatedly to the original equation;
- verify transient staging clears before committed history is popped.

For `MultiRelationAlgebraCore`:

- split an absolute-value relation;
- commit branch operations;
- verify history snapshots are exact;
- undo across branch operations and split state;
- verify sign preservation and final solution truth.

### Workspace integration tests

Verify that entering Enlarge or Focus:

- auto-hides Task;
- hides attempts/help/standards/progress chrome;
- suppresses the bottom sticky action bar;
- shows Undo/Scratchpad in the top bar;
- shows final Submit in the top bar only when available;
- does not remount/reset the solver;
- restores normal chrome and prior Task state on exit.

### Grading integrity tests

- Undo consumes no attempt.
- Repeating an already credited milestone after Undo does not duplicate credit.
- Final correctness uses the pristine original relation.
- A deliberately corrupted mutable workspace state cannot redefine the expected answer.
- Absolute-value candidate verification uses the original absolute-value relation.

### Responsive tests

- Wide Chromebook/desktop workspace uses compact side-by-side branches.
- Narrow/mobile workspace stacks branches vertically.
- Long equations remain reachable without solver controls obscuring them.
- No sticky utility bar covers equation inputs at supported viewport sizes.

## Acceptance criteria

The upgrade is complete only when all of the following are true:

1. Enlarge/Focus provides a true work-first viewport with no persistent Task/help/attempt chrome covering solver space.
2. Undo/Scratchpad and conditional final Submit live in the top workspace bar while workspace mode is active.
3. No bottom sticky workspace utility bar remains active in workspace mode.
4. Task is automatically hidden on entry and the prior normal-view Task state is restored on exit.
5. The absolute-value/multi-relation solver is materially more compact on Chromebook/desktop and remains usable on mobile.
6. Ordinary and multi-relation solvers both support committed-step Undo.
7. Undo never consumes an attempt.
8. Repeated milestones after Undo do not duplicate partial credit.
9. `-2p` and other signed terms cannot lose mathematical sign during additive reconstruction.
10. The known `8 + p = -2p + 3` regression produces and grades `p = -5/3`, with both internal state and display verified.
11. Final correctness is anchored to the immutable original relation rather than mutable student-work state.
12. Absolute-value final candidates are verified against the original absolute-value relation.
13. Entering/exiting workspace mode does not erase solver state, history, or drafts.
14. Existing normal assignment behavior remains unchanged outside workspace mode except for the improved shared Undo semantics.

## Implementation boundary

This design is one coordinated implementation because the workspace shell, Undo contract, and algebra-integrity safeguards meet at the same solver interfaces. Unrelated assignment authoring, grading-policy, or navigation redesigns are outside this implementation.
