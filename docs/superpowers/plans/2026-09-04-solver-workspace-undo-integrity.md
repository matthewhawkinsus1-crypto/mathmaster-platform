# Solver Workspace, Undo, and Algebra Integrity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a true enlarged/focus algebra workspace, make Undo restore committed mathematical work across solver families, and prevent mutable solver state—including the observed `-2p` sign-loss regression—from corrupting grading truth.

**Architecture:** `QuestionEngine` owns assignment-level workspace state and global actions, while `SolverWorkspaceFrame` owns the full-screen workspace shell and reports mode changes upward. Solver cores remain mounted and publish a common Undo controller. Algebra transformations keep pristine authored/generated relations separate from mutable student work, validate committed transformations, and derive final correctness from pristine truth rather than mutated workspace state.

**Tech Stack:** React 19, Vite 6, JavaScript ES modules, mathjs, Node.js built-in test runner (`node --test`), existing MathMaster source-reading platform tests.

**Spec:** `docs/superpowers/specs/2026-09-04-solver-workspace-undo-integrity-design.md`

## Global Constraints

- Enlarge and Focus share one underlying solver-workspace behavior contract.
- Solver children must remain mounted while entering or leaving workspace mode.
- Workspace mode hides Task, attempts/help/status chrome, and the normal bottom Undo/Scratchpad action bar without disabling the underlying grading/accommodation logic.
- Final question-level Check/Submit is promoted to the workspace top bar only when available; local mathematical actions stay beside the mathematics they affect.
- Undo first clears transient staged work, then walks backward through committed mathematical snapshots.
- Undo never consumes a question attempt and repeating a previously credited milestone after Undo must not award duplicate partial credit.
- The authored/generated original equation or relation is immutable grading truth; mutable workspace state may never redefine the correct answer.
- The `-2p` failure is an internal-math defect, not only a rendering defect. Tests must cover canonical state, rendered state, subsequent math, Undo, and final grading truth.
- Absolute-value candidates must be verified against the pristine original absolute-value relation before final correctness is accepted.
- No new runtime dependency is required for this upgrade.

---

## File Structure

### New focused test files

- `tests/platform/algebraAstIntegrity.test.mjs` — direct unit coverage for signed additive-term reconstruction.
- `tests/platform/algebraRelationIntegrity.test.mjs` — relation transformation invariants, pristine-vs-mutable truth, candidate verification, and the exact `-2p` solution chain.
- `tests/platform/solverUndoHistory.test.mjs` — shared committed-history contract and solver-core wiring checks.

### Existing files to modify

- `src/algebraAstEngine.js` — preserve signed AST meaning during additive placement.
- `src/algebraRelationFoundation.js` — expose operation-aware relation integrity checking and trusted solution/candidate helpers.
- `src/useUndoHistory.js` — only add a small generic capability if both solver cores need it; do not move solver-specific logic here.
- `src/StepByStepAlgebraCore.jsx` — record committed equation snapshots and integrate transient-first Undo.
- `src/MultiRelationAlgebraCore.jsx` — align committed history, validate every relation commit, keep authoritative solution truth anchored to pristine input, and support dense workspace presentation.
- `src/StepByStepAlgebra.jsx` — remain a thin wrapper while passing shared workspace props.
- `src/MultiRelationAlgebra.jsx` — remain a thin wrapper while passing shared workspace/density props.
- `src/QuestionEngine.jsx` — own workspace-active state and route global Undo/Scratchpad/Submit actions to normal or workspace UI.
- `src/components/student/MobileViewportContainer.jsx` — suppress normal Task/chrome/action bar during workspace mode and restore previous Task state on exit.
- `src/components/student/MathToolMobileLayout.css` — prevent hidden Task/action-bar residue in workspace mode.
- `src/components/common/SolverWorkspaceFrame.jsx` — report mode changes and render compact global workspace controls.
- `src/components/common/SolverWorkspaceFrame.css` — true viewport shell, pinned one-row toolbar, non-overlapping content body, and responsive dense branch geometry.
- `tests/platform/solverWorkspaceModes.test.mjs` — static integration contract for workspace state, toolbar promotion, no remount, and dense branch layout.
- `tests/platform/workflowGrading.test.mjs` and/or the existing solver grading/evidence test nearest the relevant milestone code — prevent duplicate credit after Undo.

---

### Task 1: Preserve signed additive terms in the algebra AST engine

**Files:**
- Create: `tests/platform/algebraAstIntegrity.test.mjs`
- Modify: `src/algebraAstEngine.js` in `splitAdditiveTerms()` / `applyAdditiveOperationAtPlacement()`

**Interfaces:**
- Consumes: existing `splitAdditiveTerms(expression)` and `applyAdditiveOperationAtPlacement(expression, operation, operandExpression, placement)` exports.
- Produces: signed term descriptors whose mathematical sign is canonical and a placement function that cannot turn `-2p`, `-x`, negative constants, or negated groups positive.

- [ ] **Step 1: Write the failing signed-term regression tests**

Create `tests/platform/algebraAstIntegrity.test.mjs` with direct imports and semantic assertions:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyAdditiveOperationAtPlacement,
  getLinearForm,
  simplifyExpression,
  splitAdditiveTerms,
} from '../../src/algebraAstEngine.js';

const linear = (expression, variable = 'p') => getLinearForm(expression, variable);

const assertLinearEquivalent = (actual, expected, variable = 'p') => {
  assert.deepEqual(linear(actual, variable), linear(expected, variable));
};

test('placement preserves a negative coefficient that is encoded inside a product node', () => {
  const result = applyAdditiveOperationAtPlacement(
    '-2 * p + 3',
    'subtract',
    'p',
    { kind: 'after', termIndex: 0 },
  );
  assertLinearEquivalent(result, '-2 * p - p + 3');
  assert.equal(linear(result).coefficient, -3);
});

test('placement preserves signed first terms and later terms', () => {
  const cases = [
    ['-x + 4', 'subtract', '2', '-x - 2 + 4', 'x'],
    ['3 - 2 * x', 'add', '5', '3 - 2 * x + 5', 'x'],
    ['-7 + x', 'add', '2', '-7 + 2 + x', 'x'],
  ];
  for (const [source, operation, operand, expected, variable] of cases) {
    const terms = splitAdditiveTerms(source);
    const result = applyAdditiveOperationAtPlacement(
      source,
      operation,
      operand,
      { kind: 'after', termIndex: Math.max(0, terms.length - 1) },
    );
    assertLinearEquivalent(result, expected, variable);
  }
});

test('negated grouped expressions keep their sign through additive placement', () => {
  const result = applyAdditiveOperationAtPlacement(
    '-(x + 1) + 6',
    'subtract',
    'x',
    { kind: 'after', termIndex: 0 },
  );
  assertLinearEquivalent(result, '-(x + 1) - x + 6', 'x');
});

test('before after under and end placement never change the source expression value', () => {
  for (const placement of [
    { kind: 'before', termIndex: 0 },
    { kind: 'after', termIndex: 0 },
    { kind: 'under', termIndex: 0 },
    { kind: 'after', termIndex: 1 },
  ]) {
    const result = applyAdditiveOperationAtPlacement('-2 * p + 3', 'subtract', 'p', placement);
    assertLinearEquivalent(result, '-3 * p + 3');
    assert.doesNotEqual(simplifyExpression(result), simplifyExpression('p + 3'));
  }
});
```

- [ ] **Step 2: Run the new test and confirm the current bug is exposed**

Run:

```bash
node --test tests/platform/algebraAstIntegrity.test.mjs
```

Expected before the fix: at least the `-2 * p` regression fails because the rebuilt expression has coefficient `+1` or otherwise differs from `-3p + 3`.

- [ ] **Step 3: Make signed term descriptors canonical instead of stripping display text**

Refactor `splitAdditiveTerms()` so every descriptor carries a canonical unsigned magnitude derived from the node plus the effective additive sign. Normalize unary-negative/product-negative nodes before presentation text is assembled. Keep existing `text`, `latex`, and `sign` fields for consumers and add `magnitudeText` / `magnitudeLatex` so transformation code never has to recover magnitude by regex-stripping display text.

The returned shape must be:

```js
{
  text: '-2 * p',
  latex: '-2p',
  sign: -1,
  magnitudeText: '2 * p',
  magnitudeLatex: '2p',
}
```

for a mathematically negative first term, regardless of whether mathjs represented the minus as unary negation or a negative numeric factor.

Update `applyAdditiveOperationAtPlacement()` to consume `magnitudeText` directly:

```js
const items = terms.map((term) => ({
  sign: term.sign < 0 ? -1 : 1,
  magnitude: term.magnitudeText,
}));
```

Do not use `String(term.text).replace(/^[+-]\s*/, '')` in the transformation path.

- [ ] **Step 4: Run the signed-term tests until green**

Run:

```bash
node --test tests/platform/algebraAstIntegrity.test.mjs
```

Expected: all tests pass, including the coefficient assertion `-3`.

- [ ] **Step 5: Run the existing solver workspace test as a regression check**

Run:

```bash
node --test tests/platform/solverWorkspaceModes.test.mjs
```

Expected: PASS.

- [ ] **Step 6: Commit the engine fix**

```bash
git add src/algebraAstEngine.js tests/platform/algebraAstIntegrity.test.mjs
git commit -m "fix: preserve signed algebra terms during placement"
```

---

### Task 2: Separate pristine relation truth from mutable workspace state

**Files:**
- Create: `tests/platform/algebraRelationIntegrity.test.mjs`
- Modify: `src/algebraRelationFoundation.js`
- Modify: `src/MultiRelationAlgebraCore.jsx`

**Interfaces:**
- Consumes: `parseRelationSource`, `cloneRelationState`, `applyBalancedOperationToRelation`, `verifyRelationCandidate(s)`, `relationSolutionSummary`.
- Produces: `validateRelationTransition(previousState, nextState, context)` returning `{ valid: boolean, reason: string | null }`; authoritative grading/candidate checks explicitly consume `pristine`, not mutable `relationState`.

- [ ] **Step 1: Write failing end-to-end relation integrity tests**

Create `tests/platform/algebraRelationIntegrity.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyBalancedOperationToRelation,
  cloneRelationState,
  parseRelationSource,
  relationStateToText,
  relationSolutionSummary,
  validateRelationTransition,
  verifyRelationCandidate,
} from '../../src/algebraRelationFoundation.js';

test('subtracting p preserves -2p and produces the correct relation solution', () => {
  const pristine = parseRelationSource('8 + p = -2*p + 3', 'p');
  const before = cloneRelationState(pristine);
  const next = applyBalancedOperationToRelation(pristine, 'subtract', 'p', {
    branchIndex: 0,
    placements: [
      { kind: 'after', termIndex: 1 },
      { kind: 'after', termIndex: 0 },
    ],
  });

  assert.equal(relationStateToText(pristine), relationStateToText(before));
  assert.match(relationStateToText(next), /-2\s*\*?\s*p/);
  assert.equal(validateRelationTransition(pristine, next, { kind: 'balancedOperation' }).valid, true);
  assert.equal(relationSolutionSummary(next).solutions[0], -5 / 3);
  assert.equal(verifyRelationCandidate(pristine, -5 / 3, 'p'), true);
  assert.equal(verifyRelationCandidate(pristine, 5, 'p'), false);
});

test('a corrupted positive-coefficient transition is rejected', () => {
  const previous = parseRelationSource('8 + p = -2*p + 3', 'p');
  const corrupted = parseRelationSource('8 + p - p = 2*p - p + 3', 'p');
  const result = validateRelationTransition(previous, corrupted, { kind: 'balancedOperation' });
  assert.equal(result.valid, false);
  assert.match(result.reason, /equivalent|preserve|relation/i);
});

test('absolute-value candidate verification remains anchored to pristine input', () => {
  const pristine = parseRelationSource('abs(x - 3) = 5', 'x');
  assert.equal(verifyRelationCandidate(pristine, 8, 'x'), true);
  assert.equal(verifyRelationCandidate(pristine, -2, 'x'), true);
  assert.equal(verifyRelationCandidate(pristine, 2, 'x'), false);
});
```

If the current `applyBalancedOperationToRelation` option shape differs, adapt only the call-site option object to its existing public signature; do not weaken the assertions.

- [ ] **Step 2: Run the new relation test and verify it fails for the missing validator and/or sign mutation**

```bash
node --test tests/platform/algebraRelationIntegrity.test.mjs
```

Expected: FAIL because `validateRelationTransition` does not yet exist; after Task 1 the sign test may already pass, but the transition guard must still fail until implemented.

- [ ] **Step 3: Add an operation-aware transition validator in `algebraRelationFoundation.js`**

Implement:

```js
export const validateRelationTransition = (
  previousState,
  nextState,
  { kind = 'equivalentTransformation' } = {},
) => {
  if (!previousState || !nextState) {
    return { valid: false, reason: 'The solver could not verify this algebra step.' };
  }

  // For ordinary balanced algebra steps, compare truth across a deterministic
  // sample set that avoids undefined evaluations. Absolute-value splitting and
  // other non-equivalent structural transitions are validated by their own
  // operation kind rather than being forced through this equivalence rule.
  if (['balancedOperation', 'simplify', 'rewrite', 'cancel'].includes(kind)) {
    const equivalent = relationsEquivalent(previousState, nextState);
    return equivalent
      ? { valid: true, reason: null }
      : { valid: false, reason: 'That step did not preserve the relation. Your previous valid work was kept.' };
  }

  return { valid: true, reason: null };
};
```

Implement the internal `relationsEquivalent()` in the same file using the existing parser/evaluator utilities and deterministic candidate points. It must compare truth values, not presentation strings. For equality and inequality relations, test enough finite points to detect coefficient/sign corruption. Absolute-value split uses a dedicated `kind: 'absoluteSplit'` path and existing split semantics rather than generic equivalence sampling.

- [ ] **Step 4: Gate `MultiRelationAlgebraCore` commits through the validator**

Inside the existing `commitState(next, label, kind)` path, validate before history push/state replacement:

```js
const validation = validateRelationTransition(relationState, next, { kind });
if (!validation.valid) {
  setMessage(validation.reason);
  return false;
}
setHistory((current) => [...current, cloneRelationState(relationState)]);
setRelationState(next);
return true;
```

Map existing commit kinds to explicit validator kinds. Absolute-value split must pass `absoluteSplit`; candidate verification is not a relation transformation and must not call this guard.

- [ ] **Step 5: Make authoritative solution/grading reads use `pristine`**

Keep mutable-state summaries only for workspace progress. Any value used to decide final correctness, expected solution, or accepted candidates must be computed from `pristine` or checked by `verifyRelationCandidate(pristine, ...)` / `verifyRelationCandidates(pristine, ...)`.

The core should visibly distinguish names, for example:

```js
const workspaceSolutionSummary = useMemo(
  () => relationSolutionSummary(relationState),
  [relationState],
);
const gradingSolutionSummary = useMemo(
  () => relationSolutionSummary(pristine),
  [pristine],
);
```

Only `gradingSolutionSummary` or candidate verification against `pristine` may feed question-complete grading truth.

- [ ] **Step 6: Run relation integrity tests**

```bash
node --test tests/platform/algebraRelationIntegrity.test.mjs
```

Expected: PASS, including `-5/3` and rejection of the corrupted `+2p` transition.

- [ ] **Step 7: Run existing solver tests**

```bash
node --test tests/platform/solverWorkspaceModes.test.mjs
```

Expected: PASS.

- [ ] **Step 8: Commit relation integrity protection**

```bash
git add src/algebraRelationFoundation.js src/MultiRelationAlgebraCore.jsx tests/platform/algebraRelationIntegrity.test.mjs
git commit -m "fix: anchor relation grading to pristine math"
```

---

### Task 3: Standardize committed-step Undo across solver families

**Files:**
- Create: `tests/platform/solverUndoHistory.test.mjs`
- Modify: `src/StepByStepAlgebraCore.jsx`
- Modify: `src/MultiRelationAlgebraCore.jsx`
- Modify only if shared semantics require it: `src/useUndoHistory.js`

**Interfaces:**
- Consumes: existing solver prop `onUndoStateChange(controller)`.
- Produces: every solver publishes `{ canUndo, onUndo, label }`; transient staged state is undone first, otherwise the last committed canonical snapshot is restored.

- [ ] **Step 1: Write a failing source-contract test for committed history**

Create `tests/platform/solverUndoHistory.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('step algebra publishes committed snapshot undo in addition to transient undo', async () => {
  const source = await read('src/StepByStepAlgebraCore.jsx');
  assert.match(source, /committedHistory|useUndoHistory/);
  assert.match(source, /onUndoStateChange/);
  assert.match(source, /canUndo/);
  assert.match(source, /pendingMove|cancelledPairIds|simplificationAnswers/);
  assert.match(source, /restore|undoCommitted|history/i);
});

test('multi relation records every commit exactly once and undo restores a relation snapshot', async () => {
  const source = await read('src/MultiRelationAlgebraCore.jsx');
  assert.match(source, /commitState/);
  assert.match(source, /cloneRelationState/);
  assert.match(source, /setHistory/);
  assert.match(source, /onUndoStateChange/);
});

test('reset clears committed history in both solver families', async () => {
  const [step, relation] = await Promise.all([
    read('src/StepByStepAlgebraCore.jsx'),
    read('src/MultiRelationAlgebraCore.jsx'),
  ]);
  assert.match(step, /clearHistory|setCommittedHistory\(\[\]\)/);
  assert.match(relation, /setHistory\(\[\]\)/);
});
```

- [ ] **Step 2: Run and confirm StepByStep committed-history coverage fails**

```bash
node --test tests/platform/solverUndoHistory.test.mjs
```

Expected: FAIL on the StepByStep committed-history assertions.

- [ ] **Step 3: Add committed equation snapshots to `StepByStepAlgebraCore`**

Keep the existing transient UI state logic. Add canonical history for accepted equation changes. A committed snapshot contains the equation fields required to restore the exact previous mathematical state, not DOM/presentation state.

Use either the existing generic hook or a local history state. Preferred hook wiring if it fits the existing state ownership cleanly:

```js
const equationHistory = useUndoHistory(initialEquationState, 60, draftKey);
const equationState = equationHistory.value;
const commitEquationState = (next) => equationHistory.setValue(next, { record: true });
```

If replacing the existing equation-state owner with the hook risks a broad rewrite, keep the existing equation state and add a focused `committedHistory` array instead. Do not restructure unrelated solver logic.

- [ ] **Step 4: Make Undo transient-first, committed-second**

The published controller must use this precedence:

```js
const hasTransientUndo = Boolean(
  pendingMove
  || crossedSides.length
  || Object.keys(cancelledPairIds).some((key) => cancelledPairIds[key])
  || Object.keys(simplificationAnswers).length,
);

const canUndo = hasTransientUndo || committedHistory.length > 0;

const onUndo = () => {
  if (hasTransientUndo) {
    undoLatestTransientAction();
    return;
  }
  undoCommittedEquation();
};
```

Restoring a committed state must clear stale pending operation UI, update draft persistence, and must not call attempt-spending or productive-step grading callbacks.

- [ ] **Step 5: Audit `MultiRelationAlgebraCore.commitState`**

Ensure each successful mathematical commit pushes exactly one `cloneRelationState(relationState)` snapshot and each rejected transformation pushes none. Make the existing Undo clear transient operation/split UI before popping committed history.

- [ ] **Step 6: Ensure Reset Work clears committed history**

Both solver cores must return to the problem's start state and empty committed history. Reset itself is not added as an undoable committed math step unless the current product already intentionally treats Reset as undoable; preserve existing Reset product semantics otherwise.

- [ ] **Step 7: Run Undo tests**

```bash
node --test tests/platform/solverUndoHistory.test.mjs
```

Expected: PASS.

- [ ] **Step 8: Run algebra integrity tests to prove Undo work did not weaken math correctness**

```bash
node --test tests/platform/algebraAstIntegrity.test.mjs tests/platform/algebraRelationIntegrity.test.mjs
```

Expected: PASS.

- [ ] **Step 9: Commit unified Undo**

```bash
git add src/StepByStepAlgebraCore.jsx src/MultiRelationAlgebraCore.jsx src/useUndoHistory.js tests/platform/solverUndoHistory.test.mjs
git commit -m "feat: add committed solver undo history"
```

If `src/useUndoHistory.js` was not changed, omit it from `git add`.

---

### Task 4: Prevent duplicate partial-credit awards after Undo

**Files:**
- Modify: the existing solver step-credit/evidence module located by the current `onStepGrade` / productive-step callback.
- Modify: `src/StepByStepAlgebraCore.jsx`
- Modify: `src/MultiRelationAlgebraCore.jsx`
- Test: `tests/platform/workflowGrading.test.mjs` or the nearest existing solver step-grading test that owns this contract.

**Interfaces:**
- Consumes: canonical committed solver state plus existing step-grade callback.
- Produces: stable milestone fingerprint `solverMilestoneKey(kind, canonicalState)`; previously credited keys are retained across Undo and block duplicate awards.

- [ ] **Step 1: Locate the single existing credit-award boundary before editing**

Run:

```bash
rg "onStepGrade|partial credit|productive step|stepCredit" src tests/platform
```

Choose the existing shared award boundary rather than adding parallel scoring logic to both solver cores.

- [ ] **Step 2: Add a failing duplicate-credit regression test at that boundary**

The test sequence must represent:

```js
const credited = new Set();
assert.equal(awardMilestone(credited, 'balancedOperation', '8+p=-2p+3'), true);
assert.equal(awardMilestone(credited, 'balancedOperation', '8+p-p=-2p-p+3'), true);
// Student undoes to the earlier state, then repeats the exact same valid step.
assert.equal(awardMilestone(credited, 'balancedOperation', '8+p-p=-2p-p+3'), false);
assert.equal(credited.size, 2);
```

Use the actual existing grading helper/API after locating it; preserve this exact behavioral assertion.

- [ ] **Step 3: Run the targeted grading test and verify it fails**

```bash
node --test tests/platform/workflowGrading.test.mjs
```

If the relevant test lives in a different existing file discovered in Step 1, run that exact file instead.

- [ ] **Step 4: Add stable semantic milestone fingerprinting**

Canonicalize the mathematical state before hashing/string-keying so whitespace/presentation changes do not create new credit. The key must include the milestone kind and canonical relation/equation state:

```js
const solverMilestoneKey = (kind, canonicalStateText) => (
  `${kind}:${String(canonicalStateText).replace(/\s+/g, '')}`
);
```

Retain the credited-key set when Undo changes the visible workspace state. Clear it only when the question/session reset semantics already require grading evidence to restart.

- [ ] **Step 5: Keep Undo out of attempt and grade callbacks**

Audit both solver `onUndo` paths. They may persist restored work and emit Undo telemetry, but they must not call the attempt-spending callback or award a productive milestone.

- [ ] **Step 6: Re-run grading and Undo tests**

```bash
node --test tests/platform/workflowGrading.test.mjs tests/platform/solverUndoHistory.test.mjs
```

Expected: PASS.

- [ ] **Step 7: Commit anti-farming protection**

```bash
git add src tests/platform/workflowGrading.test.mjs
git commit -m "fix: dedupe solver milestone credit after undo"
```

Before committing, stage only the files actually changed for this task rather than unrelated `src` changes.

---

### Task 5: Add shared solver-workspace state plumbing and auto-hide assignment chrome

**Files:**
- Modify: `tests/platform/solverWorkspaceModes.test.mjs`
- Modify: `src/QuestionEngine.jsx`
- Modify: `src/StepByStepAlgebra.jsx`
- Modify: `src/MultiRelationAlgebra.jsx`
- Modify: `src/components/common/SolverWorkspaceFrame.jsx`
- Modify: `src/components/student/MobileViewportContainer.jsx`
- Modify: `src/components/student/MathToolMobileLayout.css`

**Interfaces:**
- Produces `onWorkspaceModeChange(mode)` from `SolverWorkspaceFrame`, where `mode` is `'normal' | 'enlarged' | 'focus'`.
- `QuestionEngine` derives `solverWorkspaceActive = solverWorkspaceMode !== 'normal'`.
- `MobileViewportContainer` consumes `solverWorkspaceActive` and suppresses normal Task/action chrome without remounting tool children.

- [ ] **Step 1: Extend the existing workspace contract test so it fails on missing upward state plumbing**

Add assertions like:

```js
test('workspace mode is reported to QuestionEngine and suppresses normal assignment chrome', async () => {
  const [frame, engine, viewport] = await Promise.all([
    read('src/components/common/SolverWorkspaceFrame.jsx'),
    read('src/QuestionEngine.jsx'),
    read('src/components/student/MobileViewportContainer.jsx'),
  ]);
  assert.match(frame, /onWorkspaceModeChange/);
  assert.match(engine, /solverWorkspaceMode/);
  assert.match(engine, /solverWorkspaceActive/);
  assert.match(viewport, /solverWorkspaceActive/);
  assert.match(viewport, /!solverWorkspaceActive/);
});
```

Also retain the existing assertion that `{children}` appears exactly once in `SolverWorkspaceFrame`.

- [ ] **Step 2: Run the workspace test and verify it fails**

```bash
node --test tests/platform/solverWorkspaceModes.test.mjs
```

Expected: FAIL on missing `onWorkspaceModeChange` / `solverWorkspaceActive` wiring.

- [ ] **Step 3: Report workspace mode upward from `SolverWorkspaceFrame`**

Add optional prop `onWorkspaceModeChange` and notify it when mode changes:

```js
useEffect(() => {
  onWorkspaceModeChange?.(workspaceMode);
  return () => onWorkspaceModeChange?.('normal');
}, [onWorkspaceModeChange, workspaceMode]);
```

Keep the child tree mounted; do not introduce `cloneElement`, `createPortal`, or separate solver instances.

- [ ] **Step 4: Make `QuestionEngine` the shared state owner**

Add:

```js
const [solverWorkspaceMode, setSolverWorkspaceMode] = useState('normal');
const solverWorkspaceActive = solverWorkspaceMode !== 'normal';
```

Pass `setSolverWorkspaceMode` through the common solver props/wrappers as `onWorkspaceModeChange`. Pass `solverWorkspaceActive` to `MobileViewportContainer`.

- [ ] **Step 5: Suppress normal Task and bottom action bar in `MobileViewportContainer`**

Add `solverWorkspaceActive = false` to props. Render normal Task anchor and `.mathmaster-desktop-action-bar` only when inactive. Preserve the student's pre-workspace `isPromptCollapsed` value; do not forcibly overwrite it just to hide the Task. Because suppression is render-level, exiting workspace naturally restores the same prior state.

Required form:

```jsx
{!solverWorkspaceActive && (
  <div className="mathmaster-desktop-task-anchor">...</div>
)}
...
{!solverWorkspaceActive && (workBar || actionButtons) && (
  <div className="mathmaster-desktop-action-bar">...</div>
)}
```

- [ ] **Step 6: Add CSS guards so hidden chrome leaves no residue**

Use a workspace data/class hook from the QuestionEngine/container to ensure there is no bottom padding, gray Task-hidden strip, or sticky-bar reservation while active. Do not use document-wide selectors to reach into unrelated components.

- [ ] **Step 7: Run the workspace contract test**

```bash
node --test tests/platform/solverWorkspaceModes.test.mjs
```

Expected: PASS.

- [ ] **Step 8: Run Undo tests to ensure mode plumbing did not remount/reset solver history**

```bash
node --test tests/platform/solverUndoHistory.test.mjs
```

Expected: PASS.

- [ ] **Step 9: Commit workspace state plumbing**

```bash
git add src/QuestionEngine.jsx src/StepByStepAlgebra.jsx src/MultiRelationAlgebra.jsx src/components/common/SolverWorkspaceFrame.jsx src/components/student/MobileViewportContainer.jsx src/components/student/MathToolMobileLayout.css tests/platform/solverWorkspaceModes.test.mjs
git commit -m "feat: share solver workspace state with assignment shell"
```

---

### Task 6: Promote Undo, Scratchpad, Task/Help, and conditional Submit into the top workspace bar

**Files:**
- Modify: `tests/platform/solverWorkspaceModes.test.mjs`
- Modify: `src/QuestionEngine.jsx`
- Modify: `src/components/common/SolverWorkspaceFrame.jsx`
- Modify: `src/components/common/SolverWorkspaceFrame.css`
- Modify: `src/StepByStepAlgebra.jsx`
- Modify: `src/MultiRelationAlgebra.jsx`

**Interfaces:**
- `QuestionEngine` produces a workspace action object/slots containing the same global Undo, Scratchpad, final Submit, Task, and Help behavior already used in normal view.
- `SolverWorkspaceFrame` consumes those actions but does not own grading or attempt logic.

- [ ] **Step 1: Add failing toolbar-promotion assertions**

Extend `tests/platform/solverWorkspaceModes.test.mjs`:

```js
test('workspace toolbar owns global work actions without duplicating the normal bottom bar', async () => {
  const [frame, engine] = await Promise.all([
    read('src/components/common/SolverWorkspaceFrame.jsx'),
    read('src/QuestionEngine.jsx'),
  ]);
  assert.match(frame, /workspaceActions/);
  assert.match(frame, /Undo/);
  assert.match(frame, /Scratchpad/);
  assert.match(frame, /Task/);
  assert.match(frame, /Help/);
  assert.match(frame, /Submit|Check/);
  assert.match(engine, /workspaceActions/);
  assert.match(engine, /solverWorkspaceActive/);
});
```

- [ ] **Step 2: Run the workspace test and verify it fails**

```bash
node --test tests/platform/solverWorkspaceModes.test.mjs
```

Expected: FAIL on missing `workspaceActions` routing.

- [ ] **Step 3: Build one set of global action handlers in `QuestionEngine`**

Do not create a second grading path. Reuse the existing handlers that power `questionWorkBar`/submit. Package references/handlers for workspace use, for example:

```js
const workspaceActions = {
  undo: undoController ? {
    disabled: !undoController.canUndo || locked,
    label: undoController.label || 'Undo',
    onClick: undoController.onUndo,
  } : null,
  scratchpad: { onClick: () => setScratchpadOpen(true) },
  submit: canShowSubmit ? { disabled: submitDisabled, onClick: handleSubmit, label: submitLabel } : null,
  task: { content: presentationQuestion.prompt },
  help: guidedHelpAvailable ? { onClick: openGuidedHelp } : null,
};
```

Use the actual existing submit/help state variables and handlers from `QuestionEngine`; do not duplicate their logic under new names if equivalents already exist.

- [ ] **Step 4: Pass `workspaceActions` through both thin wrappers to `SolverWorkspaceFrame`**

Both wrappers must keep their existing solver core child exactly once.

- [ ] **Step 5: Render a single pinned top toolbar in `SolverWorkspaceFrame`**

Toolbar order on wide screens:

```text
Task | Undo | Scratchpad | Zoom - | 100% | Zoom + | Fit work | Help ... [flex spacer] [Submit/Check if available] | Return to assignment
```

Task opens a temporary drawer/popover inside the workspace shell. Help behaves the same or triggers the existing guided-help overlay. Neither reserves a permanent second row when closed.

- [ ] **Step 6: Make Submit conditional and primary only when present**

Render no placeholder for absent Submit. When present, style it as the primary right-side action and keep Return secondary. Local solver actions such as Check Split, Rewrite/Simplify, and arithmetic operation staging stay untouched in solver content.

- [ ] **Step 7: Update workspace CSS for a non-overlapping one-row control bar**

Use fixed/sticky toolbar geometry inside the full-screen shell and a separate scrollable solver body. The solver body must start below the toolbar; do not cover inputs with absolute-positioned controls.

- [ ] **Step 8: Run workspace and build tests**

```bash
node --test tests/platform/solverWorkspaceModes.test.mjs
npm run build
```

Expected: PASS and Vite build completes successfully.

- [ ] **Step 9: Commit toolbar promotion**

```bash
git add src/QuestionEngine.jsx src/StepByStepAlgebra.jsx src/MultiRelationAlgebra.jsx src/components/common/SolverWorkspaceFrame.jsx src/components/common/SolverWorkspaceFrame.css tests/platform/solverWorkspaceModes.test.mjs
git commit -m "feat: promote solver actions into workspace toolbar"
```

---

### Task 7: Compact the absolute-value/multi-relation workspace

**Files:**
- Modify: `tests/platform/solverWorkspaceModes.test.mjs`
- Modify: `src/MultiRelationAlgebra.jsx`
- Modify: `src/MultiRelationAlgebraCore.jsx`
- Modify: `src/components/common/SolverWorkspaceFrame.css`
- Modify the existing MultiRelation-specific stylesheet if its branch/card styles live outside `SolverWorkspaceFrame.css`; do not create duplicate style ownership.

**Interfaces:**
- `SolverWorkspaceFrame`/wrapper produces `denseWorkspace` or equivalent boolean when mode is enlarged/focus.
- `MultiRelationAlgebraCore` consumes the presentation-only density signal; math state and transformation functions remain unchanged.

- [ ] **Step 1: Add failing dense-layout contract assertions**

Add to `tests/platform/solverWorkspaceModes.test.mjs`:

```js
test('multi relation uses one dense responsive branch workspace without duplicating math logic', async () => {
  const [wrapper, core, css] = await Promise.all([
    read('src/MultiRelationAlgebra.jsx'),
    read('src/MultiRelationAlgebraCore.jsx'),
    read('src/components/common/SolverWorkspaceFrame.css'),
  ]);
  assert.match(wrapper, /denseWorkspace|workspaceMode/);
  assert.match(core, /denseWorkspace/);
  assert.match(core, /multi-relation-branches--dense/);
  assert.match(core, /multi-relation-operation-dock/);
  assert.match(css, /grid-template-columns:\s*minmax\(0,\s*1fr\).*minmax\(0,\s*1fr\)/s);
  assert.match(css, /@media \(max-width:/);
});
```

- [ ] **Step 2: Run and verify failure**

```bash
node --test tests/platform/solverWorkspaceModes.test.mjs
```

Expected: FAIL on dense workspace props/classes.

- [ ] **Step 3: Pass a presentation-only dense mode into `MultiRelationAlgebraCore`**

The wrapper/frame must not fork mathematical state. Add a boolean prop and class selection only:

```jsx
<div className={`multi-relation-branches${denseWorkspace ? ' multi-relation-branches--dense' : ''}`}>
  {branchCards}
</div>
```

- [ ] **Step 4: Render Branch A and Branch B side by side on wide workspace screens**

Use a two-column grid with `minmax(0, 1fr)` columns. Keep a compact `OR` indicator between/over the columns without a full extra vertical card. Long equations scroll/fit within their own branch card.

- [ ] **Step 5: Use one shared operation dock**

Keep the existing `.multi-relation-operation-dock` as the single arithmetic control surface. Active target must clearly support Branch A, Branch B, or Both Branches where allowed. Do not render duplicate Add/Subtract/Multiply/Divide panels per branch.

- [ ] **Step 6: Add mobile/narrow fallback**

At the existing responsive breakpoint family (currently workspace CSS includes `@media (max-width: 780px)`), stack branches vertically and retain touch-friendly controls.

- [ ] **Step 7: Run workspace tests and build**

```bash
node --test tests/platform/solverWorkspaceModes.test.mjs
npm run build
```

Expected: PASS.

- [ ] **Step 8: Commit dense multi-relation workspace**

```bash
git add src/MultiRelationAlgebra.jsx src/MultiRelationAlgebraCore.jsx src/components/common/SolverWorkspaceFrame.css tests/platform/solverWorkspaceModes.test.mjs
git commit -m "feat: compact multi relation solver workspace"
```

Include the actual MultiRelation stylesheet in `git add` if Step 4 edits it.

---

### Task 8: Certify the full solver workflow and regression chain

**Files:**
- Modify only if a missing assertion is discovered: the test files created/extended in Tasks 1–7.
- No production behavior should be added in this task unless a failing certification test exposes a defect; if that happens, fix the smallest owning component and rerun its focused task tests first.

**Interfaces:**
- Consumes all interfaces from Tasks 1–7.
- Produces a green certification suite proving workspace, Undo, signed math, pristine grading truth, and build integrity together.

- [ ] **Step 1: Run the signed-math certification**

```bash
node --test tests/platform/algebraAstIntegrity.test.mjs tests/platform/algebraRelationIntegrity.test.mjs
```

Expected: PASS. Specifically, the chain beginning with `8 + p = -2p + 3` retains the negative coefficient and yields `p = -5/3`.

- [ ] **Step 2: Run solver Undo + workspace certification**

```bash
node --test tests/platform/solverUndoHistory.test.mjs tests/platform/solverWorkspaceModes.test.mjs
```

Expected: PASS. Repeated Undo restores committed states; entering/exiting workspace does not duplicate/remount solver children.

- [ ] **Step 3: Run grading regression tests**

```bash
npm run test:grading
npm run test:evidence
```

Expected: PASS, with no duplicate milestone credit after Undo and no attempt spending caused by Undo.

- [ ] **Step 4: Run the complete platform test suite**

```bash
npm test
```

Expected: all `tests/platform/*.test.mjs` tests pass.

- [ ] **Step 5: Build production assets**

```bash
npm run build
```

Expected: Vite production build completes without compile/import errors.

- [ ] **Step 6: Perform a focused source audit for the original corruption mechanism**

Run:

```bash
rg "replace\(/\^\[\+\-\].*term\.text|relationSolutionSummary\(relationState\)|mathmaster-desktop-action-bar|onWorkspaceModeChange" src
```

Expected:
- no transformation path reconstructs signed magnitude by stripping `term.text`;
- any remaining `relationSolutionSummary(relationState)` use is explicitly workspace-progress-only and not final grading truth;
- normal desktop action bar still exists for normal assignment mode but is suppressed in solver workspace;
- shared workspace callbacks are present.

- [ ] **Step 7: Commit certification/test-only adjustments if any**

If no files changed in this task, do not make an empty commit. If certification required test-only tightening or a minimal owning-file fix:

```bash
git add <only-files-changed-by-certification>
git commit -m "test: certify solver workspace integrity"
```

---

## Implementation Review Checklist

Before opening or merging a PR, verify all of the following manually from the diff and automated results:

- `-2p` cannot become `+2p` in canonical state, rendering, subsequent algebra, or final answer truth.
- The authoritative expected/final answer path is anchored to pristine authored/generated input.
- Invalid relation transitions fail closed and preserve the last valid state.
- StepByStep Undo includes committed equations, not only pending UI gestures.
- MultiRelation Undo pushes each successful commit exactly once and no rejected commit.
- Undo never spends an attempt and cannot farm partial credit.
- Enlarge/Focus hides Task and assignment chrome without destroying their state.
- Bottom Undo/Scratchpad bar is absent in workspace mode.
- Top toolbar contains compact Undo/Scratchpad/Task/Help and conditional final Submit.
- Final Submit is absent until it is actually available.
- Local solver actions remain beside the mathematics they affect.
- Absolute-value branches are side-by-side on wide workspace screens and stack on narrow screens.
- Solver children remain mounted exactly once across normal/enlarged/focus transitions.
- `npm test` passes.
- `npm run build` passes.

## Expected Commit Sequence

1. `fix: preserve signed algebra terms during placement`
2. `fix: anchor relation grading to pristine math`
3. `feat: add committed solver undo history`
4. `fix: dedupe solver milestone credit after undo`
5. `feat: share solver workspace state with assignment shell`
6. `feat: promote solver actions into workspace toolbar`
7. `feat: compact multi relation solver workspace`
8. Optional only if certification changes files: `test: certify solver workspace integrity`
