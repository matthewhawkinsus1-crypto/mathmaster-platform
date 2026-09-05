# Solver Workspace, Undo, and Algebra Integrity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Follow test-driven development and verification-before-completion before claiming success.

**Goal:** Turn Enlarge/Focus into a true solver workspace, make Undo restore committed mathematical work across both algebra solver families, and prevent mutable solver state—including the observed `-2p` sign-loss defect—from corrupting the solver's internal math or grading truth.

**Architecture:** `QuestionEngine` owns assignment-level workspace state and global actions. `SolverWorkspaceFrame` remains the single workspace shell and reports `normal | enlarged | focus` upward without remounting its solver child. Solver cores keep pristine authored/generated math separate from mutable student work, publish a common Undo controller, and reject invalid mathematical transformations before they can replace the last valid state. Existing `attemptPolicy` duplicate-state protection remains the source of truth for preventing repeated partial-credit awards after Undo/replay.

**Tech stack:** React 19, Vite 6, JavaScript ES modules, mathjs, Node.js built-in tests (`node --test`), existing MathMaster platform tests.

**Approved design:** `docs/superpowers/specs/2026-09-04-solver-workspace-undo-integrity-design.md`

## Non-negotiable acceptance rules

- Enlarge and Focus share one underlying solver-workspace contract.
- The solver child remains mounted exactly once across normal/enlarged/focus transitions.
- Workspace mode visually removes normal Task, attempts, Guided Notes/help strip, standards/progress/status chrome, and the sticky bottom work bar, while their underlying grading/accommodation state remains active.
- Global workspace controls are compact Task, Undo, Scratchpad, zoom/Fit, Help, conditional final Check/Submit, and Return to Assignment.
- Local mathematical controls remain beside the mathematics they affect.
- Undo clears transient staged work first; otherwise it restores the previous committed canonical mathematical state.
- Undo spends zero attempts.
- Reaching the same credited equation/relation state again after Undo does not add partial credit a second time.
- Pristine authored/generated math is immutable grading truth; mutable workspace state never becomes the answer key.
- The `-2p` regression is tested at internal AST/state, displayed relation, subsequent algebra, Undo, and final-answer levels.
- Absolute-value candidates are checked against the pristine original absolute-value relation before final correctness is accepted.
- No new runtime dependency is added.

## Files in scope

**Create**
- `tests/platform/algebraAstIntegrity.test.mjs`
- `tests/platform/algebraRelationIntegrity.test.mjs`
- `tests/platform/solverUndoHistory.test.mjs`
- `tests/platform/solverStepCreditReplay.test.mjs`

**Modify**
- `src/algebraAstEngine.js`
- `src/algebraRelationFoundation.js`
- `src/StepByStepAlgebraCore.jsx`
- `src/MultiRelationAlgebraCore.jsx`
- `src/StepByStepAlgebra.jsx`
- `src/MultiRelationAlgebra.jsx`
- `src/QuestionEngine.jsx`
- `src/components/student/MobileViewportContainer.jsx`
- `src/components/student/MathToolMobileLayout.css`
- `src/components/common/SolverWorkspaceFrame.jsx`
- `src/components/common/SolverWorkspaceFrame.css`
- `tests/platform/solverWorkspaceModes.test.mjs`

`src/useUndoHistory.js` is intentionally not changed. Both solver cores already own persisted draft state; committed history will use the same snapshot semantics without introducing a second persistence writer.

---

## Task 1: Fix signed additive placement at the AST boundary

**Files**
- Create `tests/platform/algebraAstIntegrity.test.mjs`
- Modify `src/algebraAstEngine.js`

**Purpose:** Remove the root cause that can turn a real internal `-2p` term into `+2p` while an additive operation is inserted.

- [ ] **1.1 Write the failing regression tests first.**

Directly import `splitAdditiveTerms`, `applyAdditiveOperationAtPlacement`, and `getLinearForm`. Cover:

```js
const result = applyAdditiveOperationAtPlacement(
  '-2 * p + 3',
  'subtract',
  'p',
  { kind: 'after', termIndex: 0 },
);
assert.deepEqual(getLinearForm(result, 'p'), getLinearForm('-2*p - p + 3', 'p'));
assert.equal(getLinearForm(result, 'p').coefficient, -3);
```

Also cover `-x`, negative constants, `-(x + 1)`, negative later terms such as `3 - 2x`, and every supported before/after/under/end-equivalent placement.

- [ ] **1.2 Prove the current code fails.**

```bash
node --test tests/platform/algebraAstIntegrity.test.mjs
```

Expected before the fix: at least the negative-product regression fails.

- [ ] **1.3 Make additive term sign canonical.**

Refactor `splitAdditiveTerms()` so each term descriptor exposes:

```js
{
  sign: -1,
  magnitudeText: '2 * p',
  magnitudeLatex: '2p',
  text: '-2 * p',
  latex: '-2p',
}
```

for a negative first term, regardless of whether mathjs encoded the negative as unary minus or as a negative numeric factor in a multiply node.

Do not run general expression simplification merely to detect a term sign; preserve student term order/structure.

- [ ] **1.4 Remove display-text sign stripping from the transformation path.**

`applyAdditiveOperationAtPlacement()` must consume `term.magnitudeText` and `term.sign` directly. Remove the pattern that recovers magnitude with a regex such as:

```js
String(term.text).replace(/^[+-]\s*/, '')
```

- [ ] **1.5 Verify.**

```bash
node --test tests/platform/algebraAstIntegrity.test.mjs
node --test tests/platform/solverWorkspaceModes.test.mjs
```

Expected: PASS.

- [ ] **1.6 Commit.**

```bash
git add src/algebraAstEngine.js tests/platform/algebraAstIntegrity.test.mjs
git commit -m "fix: preserve signed algebra terms during placement"
```

---

## Task 2: Anchor relation transformations and grading to pristine mathematical truth

**Files**
- Create `tests/platform/algebraRelationIntegrity.test.mjs`
- Modify `src/algebraRelationFoundation.js`
- Modify `src/MultiRelationAlgebraCore.jsx`

**Purpose:** Ensure a corrupted workspace transformation cannot become solver truth or silently redefine the correct answer.

- [ ] **2.1 Add the exact internal-math regression cases.**

Tests must prove all of the following:

```text
8 + p = -2p + 3
8 + p - p = -2p - p + 3
8 = -3p + 3
5 = -3p
p = -5/3
```

The pristine starting relation must remain unchanged. Candidate `-5/3` must verify true in the pristine equation; a value derived from the corrupted `+2p` path must verify false.

Add an absolute-value test such as `abs(x - 3) = 5` proving `8` and `-2` verify against the original relation and `2` does not.

- [ ] **2.2 Prove the missing transition guard fails first.**

```bash
node --test tests/platform/algebraRelationIntegrity.test.mjs
```

Expected before implementation: FAIL because the new integrity API is not present.

- [ ] **2.3 Add `validateRelationTransition(previousState, nextState, context)` to `algebraRelationFoundation.js`.**

For a balanced Add/Subtract/Multiply/Divide step, independently construct the expected mathematical expression from the pre-step expression and operand, then compare the resulting expression semantically with `expressionsEquivalent`. Do not validate a placement-engine result by calling the same placement reconstruction routine that created it.

Required context for balanced operations:

```js
{
  kind: 'balancedOperation',
  operation,
  operandExpression,
  branchIndices,
}
```

Equivalent Rewrite/Simplify/cancellation uses `kind: 'equivalentRewrite'` and checks expression equivalence while preserving relation structure.

Absolute split, square root, and special solution claims use explicit operation kinds and are marked validated only after their existing owning helper has successfully checked the mathematical preconditions. There is no generic bypass flag available to arbitrary callers.

- [ ] **2.4 Gate every multi-relation commit before state/history mutation.**

Refactor the existing `commitState` boundary so validation runs before:

- history push;
- `setRelationState`;
- candidate-check reset;
- persisted step grading/evidence.

A rejected transformation keeps the previous valid relation and shows a recoverable student-facing error.

The negative multiply/divide relation-flip flow must finish through the same commit/validation boundary instead of mutating final state through a separate history path.

- [ ] **2.5 Make the pristine relation the explicit grading anchor.**

Rename mutable summaries to something like `workspaceSummary`. They may tell the UI whether a candidate has been isolated, but final candidate correctness continues through `verifyRelationCandidate(s)(pristine, ...)`.

Never use `relationSolutionSummary(relationState)` as the independent final answer key.

- [ ] **2.6 Verify the exact `-5/3` chain and corrupted-state rejection.**

```bash
node --test tests/platform/algebraAstIntegrity.test.mjs tests/platform/algebraRelationIntegrity.test.mjs
```

Expected: PASS.

- [ ] **2.7 Commit.**

```bash
git add src/algebraRelationFoundation.js src/MultiRelationAlgebraCore.jsx tests/platform/algebraRelationIntegrity.test.mjs
git commit -m "fix: anchor relation grading to pristine math"
```

---

## Task 3: Add committed-step Undo to both algebra solver families

**Files**
- Create `tests/platform/solverUndoHistory.test.mjs`
- Modify `src/StepByStepAlgebraCore.jsx`
- Modify `src/MultiRelationAlgebraCore.jsx`

**Purpose:** Make Undo reverse actual completed algebra, not merely pending UI gestures.

- [ ] **3.1 Add failing source-contract tests.**

Assert that StepByStep has committed mathematical history in addition to its existing pending/cancellation/simplification state, that MultiRelation records committed relation snapshots, and that both reset paths clear committed history.

- [ ] **3.2 Prove StepByStep currently fails the contract.**

```bash
node --test tests/platform/solverUndoHistory.test.mjs
```

Expected before implementation: FAIL on StepByStep committed history.

- [ ] **3.3 Add `committedHistory` to `StepByStepAlgebraCore`.**

Immediately before each accepted student mathematical commit, push a deep copy of the current canonical equation. Cover accepted balanced operations and accepted Rewrite/Simplify transformations. Do not treat prefilled accommodation setup or simple UI opening/selection as history.

Cap history at 60 snapshots.

- [ ] **3.4 Make StepByStep Undo transient-first, committed-second.**

If there is an active pending operation, cancellation mark/selection, or rewrite/simplification staging, Undo clears the newest transient action first. Otherwise it restores the last committed equation and clears stale staging UI.

Undo must not call an attempt-spending path or a productive-step grading callback.

- [ ] **3.5 Align MultiRelation with the same semantics.**

If an uncommitted operation/operand/placement, rewrite entry, cancellation selection, split editor, or relation picker is active, Undo closes/reverts that transient state first. Otherwise it pops one committed relation snapshot.

A successful mathematical commit pushes exactly one history entry. A rejected integrity transition pushes zero.

- [ ] **3.6 Clear committed history on Reset Work/question reset.**

Reset returns to the appropriate pristine problem start state. It does not create another committed solver step.

- [ ] **3.7 Verify.**

```bash
node --test tests/platform/solverUndoHistory.test.mjs
node --test tests/platform/algebraAstIntegrity.test.mjs tests/platform/algebraRelationIntegrity.test.mjs
```

Expected: PASS.

- [ ] **3.8 Commit.**

```bash
git add src/StepByStepAlgebraCore.jsx src/MultiRelationAlgebraCore.jsx tests/platform/solverUndoHistory.test.mjs
git commit -m "feat: add committed solver undo history"
```

---

## Task 4: Certify existing partial-credit deduplication across Undo/replay

**Files**
- Create `tests/platform/solverStepCreditReplay.test.mjs`
- Production code change: none unless the failing regression test proves the existing `attemptPolicy` behavior is insufficient.

**Purpose:** Use the platform's existing duplicate-state protection instead of inventing a second milestone-credit subsystem.

`src/attemptPolicy.js` already makes step credit state-aware: `calculateStepPartialCredit()` keeps a `visitedStates` set and does not add credit again for a repeated `equationAfter` state. `recordQuestionStep()` also defaults `countsAttempt` to `false`. This task locks that behavior to the new Undo workflow.

- [ ] **4.1 Write direct tests against `recordQuestionStep` and `calculateStepPartialCredit`.**

Build a record with a productive sequence, then append a replayed step whose `equationAfter` is mathematically the same stored state string as the earlier credited step.

Example history:

```text
8+p=-2p+3
→ 8+p-p=-2p-p+3   (credit)
→ 8=-3p+3         (credit)
[student Undo is workspace-only and does not record a graded step]
→ 8+p-p=-2p-p+3   (replay; no additional credit)
```

Assert:

- partial credit after replay equals partial credit before replay;
- `attemptCount` does not increase when solver steps are recorded with `countsAttempt: false`;
- `totalAttempts` does not increase;
- a genuinely new productive state can still add credit up to the existing rubric cap.

Also include a relation-state LaTeX/string replay representative of `MultiRelationAlgebraCore`'s `relationStateToLatex(after)` output so both solver families are protected by the same policy.

- [ ] **4.2 Run the test.**

```bash
node --test tests/platform/solverStepCreditReplay.test.mjs
```

Expected with current policy: PASS. If it fails only because equivalent whitespace/minus glyphs produce different compact keys, make the smallest normalization correction in `attemptPolicy.js` and add that exact case to the test. Do not create a parallel credit ledger.

- [ ] **4.3 Run the existing grading suite.**

```bash
npm run test:grading
```

Expected: PASS.

- [ ] **4.4 Commit the regression protection.**

If production code did not need a change:

```bash
git add tests/platform/solverStepCreditReplay.test.mjs
git commit -m "test: protect solver step credit across undo replay"
```

If the focused test exposed a normalization defect, include only `src/attemptPolicy.js` plus the test in this commit.

---

## Task 5: Make solver workspace state authoritative at `QuestionEngine`

**Files**
- Modify `tests/platform/solverWorkspaceModes.test.mjs`
- Modify `src/QuestionEngine.jsx`
- Modify `src/StepByStepAlgebra.jsx`
- Modify `src/MultiRelationAlgebra.jsx`
- Modify `src/components/common/SolverWorkspaceFrame.jsx`
- Modify `src/components/student/MobileViewportContainer.jsx`
- Modify `src/components/student/MathToolMobileLayout.css`

**Purpose:** Let the outer assignment shell know the solver is enlarged/focused so normal assignment chrome can truly disappear instead of sitting behind/around the tool.

- [ ] **5.1 Extend the existing workspace contract test first.**

Require:

- `SolverWorkspaceFrame` exposes `onWorkspaceModeChange`;
- `QuestionEngine` owns `solverWorkspaceMode` and derives `solverWorkspaceActive`;
- `MobileViewportContainer` consumes `solverWorkspaceActive`;
- `{children}` still appears exactly once in `SolverWorkspaceFrame`;
- normal Task/action-bar chrome is conditional on `!solverWorkspaceActive`.

- [ ] **5.2 Prove the current plumbing fails.**

```bash
node --test tests/platform/solverWorkspaceModes.test.mjs
```

Expected before implementation: FAIL on shared mode ownership.

- [ ] **5.3 Emit workspace mode upward from `SolverWorkspaceFrame`.**

Add optional callback:

```js
useEffect(() => {
  onWorkspaceModeChange?.(workspaceMode);
  return () => onWorkspaceModeChange?.('normal');
}, [onWorkspaceModeChange, workspaceMode]);
```

Keep the solver child mounted; do not create a second solver instance or a route change.

- [ ] **5.4 Own the mode in `QuestionEngine`.**

Add `solverWorkspaceMode` and `solverWorkspaceActive`, reset to normal when the active processed question changes, and pass the callback through common algebra solver props/wrappers.

- [ ] **5.5 Suppress normal Task and bottom action bar without overwriting Task state.**

`MobileViewportContainer` receives `solverWorkspaceActive = false` and only renders its desktop Task anchor and `.mathmaster-desktop-action-bar` while inactive.

Do not call `setIsPromptCollapsed(true)` on workspace entry. Render suppression preserves the student's previous normal-view Task state automatically for exit.

- [ ] **5.6 Suppress assignment-only visual chrome while keeping logic active.**

In `QuestionEngine`, gate visual-only attempts remaining, Guided Notes/coach strip, standards/alignment/status, progress, and large partial-credit/status presentation on `!solverWorkspaceActive`. Do not disable grading, accommodation, or progress state itself.

- [ ] **5.7 Remove layout residue in CSS.**

Use explicit workspace-active class/data state from the owning components so no hidden Task placeholder, gray warning strip, bottom padding, or sticky action-bar reservation remains. Do not use brittle document-wide selectors.

- [ ] **5.8 Verify and commit.**

```bash
node --test tests/platform/solverWorkspaceModes.test.mjs tests/platform/solverUndoHistory.test.mjs
git add src/QuestionEngine.jsx src/StepByStepAlgebra.jsx src/MultiRelationAlgebra.jsx src/components/common/SolverWorkspaceFrame.jsx src/components/student/MobileViewportContainer.jsx src/components/student/MathToolMobileLayout.css tests/platform/solverWorkspaceModes.test.mjs
git commit -m "feat: share solver workspace state with assignment shell"
```

Expected: PASS.

---

## Task 6: Promote global actions into the compact top workspace bar

**Files**
- Modify `tests/platform/solverWorkspaceModes.test.mjs`
- Modify `src/QuestionEngine.jsx`
- Modify `src/StepByStepAlgebra.jsx`
- Modify `src/MultiRelationAlgebra.jsx`
- Modify `src/components/common/SolverWorkspaceFrame.jsx`
- Modify `src/components/common/SolverWorkspaceFrame.css`

**Purpose:** Remove the overlapping bottom global controls and give workspace mode one permanent, compact control row.

- [ ] **6.1 Add failing toolbar-promotion assertions.**

Require a `workspaceActions` contract from `QuestionEngine` to `SolverWorkspaceFrame`, containing Undo, Scratchpad, conditional final Submit, and Help content/handler. Task continues to use the frame's existing task text.

- [ ] **6.2 Prove the current toolbar lacks these actions.**

```bash
node --test tests/platform/solverWorkspaceModes.test.mjs
```

Expected before implementation: FAIL.

- [ ] **6.3 Package existing handlers; do not create a second grading or submit path.**

Reuse the existing `undoController`, `openScratchpad`, `shouldShowSubmit`, `handleSubmit`, submit-disabled/loading state, and GuidedClassworkCoach configuration.

Construct one `GuidedClassworkCoach` node/config. In normal view it appears in its existing location; in workspace mode the same help content is opened temporarily from Help. Do not mount two simultaneous guided-coach instances for the same question.

- [ ] **6.4 Pass workspace actions through the thin wrappers.**

`StepByStepAlgebra.jsx` and `MultiRelationAlgebra.jsx` forward assignment-level workspace actions to `SolverWorkspaceFrame`; their solver cores do not own those controls.

- [ ] **6.5 Render the one-row workspace toolbar.**

Wide layout order:

```text
Task | Undo | Scratchpad | Zoom − | Zoom % | Zoom + | Fit work | Help | [flex] | [Submit/Check if available] | Return to assignment
```

Task and Help open temporary in-workspace drawer/popover content that consumes no permanent row when closed.

- [ ] **6.6 Keep final Submit conditional.**

When no final question-level submit is available, render no placeholder. When available, Submit/Check is the primary right-side action and Return to Assignment is secondary.

Do not move Check Split, Commit Step, Rewrite/Simplify, arithmetic staging, cancellation, candidate verification, or Reset Work into the global toolbar.

- [ ] **6.7 Make the workspace body non-overlapping.**

`SolverWorkspaceFrame.css` gives the full-screen shell a pinned one-row toolbar and a separate scrollable solver-body region below it. No toolbar element may overlay solver inputs.

- [ ] **6.8 Verify and commit.**

```bash
node --test tests/platform/solverWorkspaceModes.test.mjs
npm run build
git add src/QuestionEngine.jsx src/StepByStepAlgebra.jsx src/MultiRelationAlgebra.jsx src/components/common/SolverWorkspaceFrame.jsx src/components/common/SolverWorkspaceFrame.css tests/platform/solverWorkspaceModes.test.mjs
git commit -m "feat: promote solver actions into workspace toolbar"
```

Expected: test PASS and build PASS.

---

## Task 7: Compact the absolute-value/multi-relation workspace

**Files**
- Modify `tests/platform/solverWorkspaceModes.test.mjs`
- Modify `src/MultiRelationAlgebra.jsx`
- Modify `src/MultiRelationAlgebraCore.jsx`
- Modify `src/components/common/SolverWorkspaceFrame.css`

**Purpose:** Reclaim vertical space after absolute-value splitting without creating a second branch-solving implementation.

There is no separate `MultiRelationAlgebra.css`; the core currently uses inline presentation plus named classes such as `.multi-relation-operation-dock`. Workspace-specific responsive branch classes introduced by this task belong in `SolverWorkspaceFrame.css`, because they apply only to enlarged/focus presentation.

- [ ] **7.1 Add failing density contract assertions.**

Require:

- wrapper/core receive a presentation-only `denseWorkspace` signal;
- one branch container gains a dense class;
- the existing `.multi-relation-operation-dock` remains a single shared dock;
- workspace CSS defines a two-column `minmax(0, 1fr)` grid and a narrow-screen stacked fallback.

- [ ] **7.2 Prove the current dense layout is missing.**

```bash
node --test tests/platform/solverWorkspaceModes.test.mjs
```

Expected before implementation: FAIL on `denseWorkspace` / dense branch classes.

- [ ] **7.3 Pass presentation-only density into the existing core tree.**

Use the same branch components and mathematical state. Add classes/compact labels only; do not fork solver logic.

- [ ] **7.4 Put Branch A and Branch B side by side on wide workspace screens.**

Add a workspace-specific class around the existing branch cards and style it approximately as:

```css
.multi-relation-branches--dense {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 12px;
  align-items: start;
}
```

Each branch controls its own overflow/fit behavior so long equations do not widen the entire workspace.

- [ ] **7.5 Keep one shared operation dock and compact the OR/status presentation.**

Reuse `.multi-relation-operation-dock` for Add/Subtract/Multiply/Divide and Commit Step. It targets Branch A, Branch B, or both staged branches using existing branch-selection logic. Replace repeated large branch-status prose with compact labels. Keep `OR` clear but compact between/above the two branch columns.

- [ ] **7.6 Stack branches on narrow/mobile screens.**

At `max-width: 780px`, dense branches become one column and retain existing touch-target sizes.

- [ ] **7.7 Verify and commit.**

```bash
node --test tests/platform/solverWorkspaceModes.test.mjs
npm run build
git add src/MultiRelationAlgebra.jsx src/MultiRelationAlgebraCore.jsx src/components/common/SolverWorkspaceFrame.css tests/platform/solverWorkspaceModes.test.mjs
git commit -m "feat: compact multi relation solver workspace"
```

Expected: test PASS and build PASS.

---

## Task 8: Certify the complete upgrade before merge or deploy

**Files**
- No planned production changes.
- If certification exposes a production defect, return to the owning task, write the focused failing test there, make the smallest owning-file fix, and rerun that task before returning here.

- [ ] **8.1 Certify signed math and pristine grading truth.**

```bash
node --test tests/platform/algebraAstIntegrity.test.mjs tests/platform/algebraRelationIntegrity.test.mjs
```

Expected: PASS, including the preserved `-2p`, rejected corrupted `+2p`, and final `p = -5/3` truth.

- [ ] **8.2 Certify Undo and replay-safe partial credit.**

```bash
node --test tests/platform/solverUndoHistory.test.mjs tests/platform/solverStepCreditReplay.test.mjs
```

Expected: PASS.

- [ ] **8.3 Certify workspace behavior.**

```bash
node --test tests/platform/solverWorkspaceModes.test.mjs
```

Expected: PASS, including one mounted solver child, explicit workspace state, suppressed normal chrome, promoted global actions, conditional Submit, and dense branch contract.

- [ ] **8.4 Run existing grading/evidence suites.**

```bash
npm run test:grading
npm run test:evidence
```

Expected: PASS.

- [ ] **8.5 Run the complete platform suite.**

```bash
npm test
```

Expected: all `tests/platform/*.test.mjs` tests PASS.

- [ ] **8.6 Build production assets.**

```bash
npm run build
```

Expected: Vite production build PASS.

- [ ] **8.7 Audit the original failure mechanism and mutable grading path.**

```bash
rg "term\.text.*replace|replace.*term\.text|relationSolutionSummary\(relationState\)|onWorkspaceModeChange|mathmaster-desktop-action-bar" src
```

Expected:

- no additive transformation reconstructs mathematical sign by stripping `term.text`;
- any remaining `relationSolutionSummary(relationState)` usage is explicitly workspace-progress logic and not independent grading truth;
- shared workspace callbacks connect the frame to `QuestionEngine`;
- the normal desktop action bar still exists for normal assignment mode and is suppressed in workspace mode.

- [ ] **8.8 Review the final diff against the approved design.**

Explicitly verify all three truth layers: pristine problem, mutable workspace state, grading truth. Confirm every successful multi-relation commit records one history entry, rejected transitions record none, and neither Undo path records an attempt-spending event.

No empty certification commit is required. If only test assertions changed during certification, commit only those test files with:

```bash
git add tests/platform
git commit -m "test: certify solver workspace integrity"
```

## Required final acceptance results

- `8 + p = -2p + 3` cannot become a `+2p` relation in canonical solver state.
- Subtracting `p` preserves `8 + p - p = -2p - p + 3` mathematically and visually.
- Valid simplification continues to `8 = -3p + 3`, `5 = -3p`, and `p = -5/3`.
- A corrupted sign-changing transition is rejected before it becomes current solver state.
- Final grading truth remains anchored to the pristine original problem.
- Absolute-value candidate answers are substituted/verified against the original absolute-value relation.
- StepByStep and MultiRelation can repeatedly Undo committed steps toward the original state.
- Transient staging is undone before committed history.
- Undo adds zero attempts.
- Replaying a previously credited state after Undo adds zero partial credit under the existing `attemptPolicy` visited-state protection.
- Enlarge/Focus removes normal Task, attempts/help/status chrome, and the bottom work bar from the active solver workspace.
- Undo and Scratchpad are compact top-bar controls in workspace mode.
- Final question-level Submit/Check appears in the top bar only when available.
- Local mathematical actions remain next to their mathematics.
- Absolute-value branches are side by side on wide workspace screens and stacked on narrow/mobile screens.
- Entering/exiting workspace does not remount or erase solver work.
- `npm test` passes.
- `npm run build` passes.

## Expected commit sequence

1. `fix: preserve signed algebra terms during placement`
2. `fix: anchor relation grading to pristine math`
3. `feat: add committed solver undo history`
4. `test: protect solver step credit across undo replay`
5. `feat: share solver workspace state with assignment shell`
6. `feat: promote solver actions into workspace toolbar`
7. `feat: compact multi relation solver workspace`
8. Optional test-only certification commit: `test: certify solver workspace integrity`
