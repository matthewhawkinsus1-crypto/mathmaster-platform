# Solver Workspace, Undo, and Algebra Integrity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a true enlarged/focus algebra workspace, make Undo restore committed mathematical work across both algebra solver families, and prevent mutable solver state—including the observed `-2p` sign-loss regression—from corrupting grading truth.

**Architecture:** `QuestionEngine` owns assignment-level workspace state and the global actions that already exist there. `SolverWorkspaceFrame` remains the single full-screen shell and reports `normal | enlarged | focus` upward without remounting its solver child. Solver cores keep pristine authored/generated math separate from mutable student work, publish the same Undo controller shape, and reject transformations that fail operation-specific integrity checks.

**Tech Stack:** React 19, Vite 6, JavaScript ES modules, mathjs, Node.js built-in tests (`node --test`), existing source-contract platform tests.

**Spec:** `docs/superpowers/specs/2026-09-04-solver-workspace-undo-integrity-design.md`

## Global Constraints

- Enlarge and Focus share one solver-workspace behavior contract.
- Solver children remain mounted exactly once across normal/enlarged/focus transitions.
- Workspace mode visually suppresses Task, attempts, Guided Notes/help strips, standards/progress/status chrome, and the normal sticky bottom work bar while leaving their underlying grading/accommodation logic intact.
- Workspace global controls are Task, Undo, Scratchpad, zoom/Fit, Help, conditional final Check/Submit, and Return to Assignment.
- Local mathematical controls such as Check Split, Rewrite/Simplify, arithmetic operations, cancellation, candidate verification, and Reset Work remain beside the mathematics.
- Undo clears transient staged work first; with no transient state it restores the previous committed canonical state.
- Undo never spends a question attempt.
- A previously credited mathematical milestone cannot award credit again after Undo and replay.
- Pristine authored/generated math is immutable grading truth. Mutable workspace state never becomes the answer key.
- The `-2p` regression is certified at canonical state, rendered state, next-step math, Undo, and final-answer levels.
- Absolute-value candidates are verified against the pristine original absolute-value relation before final correctness.
- No new runtime dependency is added.

---

## File Map

**New:**
- `tests/platform/algebraAstIntegrity.test.mjs` — signed-term placement regression tests.
- `tests/platform/algebraRelationIntegrity.test.mjs` — pristine relation, transformation guard, and final-answer truth tests.
- `src/solverMilestoneCredit.js` — pure stable milestone-key/deduplication helpers shared by both solver cores.
- `tests/platform/solverMilestoneCredit.test.mjs` — pure milestone deduplication tests.
- `tests/platform/solverUndoHistory.test.mjs` — committed/transient Undo source contract.

**Modify:**
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

`src/useUndoHistory.js` is deliberately not changed in this plan. Both solver cores already own broader persisted draft state; adding focused committed-history state in the cores avoids creating a second competing persistence writer. The implementation must follow the same snapshot semantics already established by `useUndoHistory`.

---

### Task 1: Fix signed additive placement at the AST boundary

**Files:**
- Create: `tests/platform/algebraAstIntegrity.test.mjs`
- Modify: `src/algebraAstEngine.js`

**Interfaces:**
- Consumes: `splitAdditiveTerms(expression)`, `applyAdditiveOperationAtPlacement(expression, operation, operandExpression, placement)`, `getLinearForm(expression, variable)`.
- Produces: `splitAdditiveTerms()` descriptors with `sign`, `magnitudeText`, `magnitudeLatex`, `text`, and `latex`; placement uses canonical magnitude rather than stripping signs from display text.

- [ ] **Step 1: Add failing regression tests**

```js
// tests/platform/algebraAstIntegrity.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyAdditiveOperationAtPlacement,
  getLinearForm,
  splitAdditiveTerms,
} from '../../src/algebraAstEngine.js';

const assertLinear = (actual, expected, variable) => {
  assert.deepEqual(getLinearForm(actual, variable), getLinearForm(expected, variable));
};

test('subtract placement cannot turn -2p into +2p', () => {
  const result = applyAdditiveOperationAtPlacement(
    '-2 * p + 3', 'subtract', 'p', { kind: 'after', termIndex: 0 },
  );
  assertLinear(result, '-2 * p - p + 3', 'p');
  assert.equal(getLinearForm(result, 'p').coefficient, -3);
});

test('splitAdditiveTerms exposes canonical sign and unsigned magnitude', () => {
  const [first] = splitAdditiveTerms('-2 * p + 3');
  assert.equal(first.sign, -1);
  assert.equal(getLinearForm(first.magnitudeText, 'p').coefficient, 2);
});

test('negative variables constants and grouped expressions keep their sign', () => {
  const cases = [
    ['-x + 4', 'x', '-x + 4 - 2'],
    ['-7 + x', 'x', '-7 + x - 2'],
    ['-(x + 1) + 6', 'x', '-(x + 1) + 6 - 2'],
    ['3 - 2 * x', 'x', '3 - 2 * x - 2'],
  ];
  for (const [source, variable, expected] of cases) {
    const terms = splitAdditiveTerms(source);
    const result = applyAdditiveOperationAtPlacement(
      source,
      'subtract',
      '2',
      { kind: 'after', termIndex: terms.length - 1 },
    );
    assertLinear(result, expected, variable);
  }
});

test('before after under and end-equivalent placements preserve algebraic value', () => {
  for (const placement of [
    { kind: 'before', termIndex: 0 },
    { kind: 'after', termIndex: 0 },
    { kind: 'under', termIndex: 0 },
    { kind: 'after', termIndex: 1 },
  ]) {
    const result = applyAdditiveOperationAtPlacement('-2 * p + 3', 'subtract', 'p', placement);
    assertLinear(result, '-3 * p + 3', 'p');
  }
});
```

- [ ] **Step 2: Prove the current engine fails the regression**

Run:

```bash
node --test tests/platform/algebraAstIntegrity.test.mjs
```

Expected before implementation: FAIL on the `-2 * p` coefficient/sign assertions.

- [ ] **Step 3: Add an AST-aware sign extractor**

Inside `src/algebraAstEngine.js`, add a focused helper used only by additive term splitting. It must handle unary minus and a negative leading numeric factor without simplifying/reordering the whole term:

```js
const signedNodeDescriptor = (node, inheritedSign = 1) => {
  let sign = inheritedSign < 0 ? -1 : 1;
  let magnitudeNode = node;

  if (magnitudeNode?.type === 'OperatorNode' && magnitudeNode.fn === 'unaryMinus' && magnitudeNode.args?.length === 1) {
    sign *= -1;
    magnitudeNode = magnitudeNode.args[0];
  } else if (magnitudeNode?.type === 'OperatorNode' && magnitudeNode.fn === 'multiply' && magnitudeNode.args?.length) {
    const [first, ...rest] = magnitudeNode.args;
    const negativeConstant = first?.isConstantNode && Number(first.value) < 0;
    const negativeUnary = first?.type === 'OperatorNode' && first.fn === 'unaryMinus' && first.args?.length === 1;
    if (negativeConstant || negativeUnary) {
      sign *= -1;
      const positiveFirst = negativeConstant
        ? parse(String(Math.abs(Number(first.value))))
        : first.args[0];
      magnitudeNode = parse([
        positiveFirst.toString({ parenthesis: 'keep', implicit: 'hide' }),
        ...rest.map((part) => part.toString({ parenthesis: 'keep', implicit: 'hide' })),
      ].join(' * '));
    }
  }

  return { sign, magnitudeNode };
};
```

Use the existing imported `parse`. Do not call general `simplify()` here because student term order/structure must remain intact.

- [ ] **Step 4: Make `splitAdditiveTerms()` publish canonical magnitude fields**

For each flattened node, call `signedNodeDescriptor(node, sign)`, then build:

```js
{
  sign: effectiveSign,
  magnitudeText,
  magnitudeLatex,
  text: isFirst ? (effectiveSign < 0 ? `-${magnitudeText}` : magnitudeText) : `${effectiveSign < 0 ? '-' : '+'} ${magnitudeText}`,
  latex: isFirst ? (effectiveSign < 0 ? `-${magnitudeLatex}` : magnitudeLatex) : `${effectiveSign < 0 ? '-' : '+'} ${magnitudeLatex}`,
}
```

- [ ] **Step 5: Remove text-sign stripping from `applyAdditiveOperationAtPlacement()`**

Replace the current term mapping with:

```js
const items = terms.map((term) => ({
  sign: term.sign < 0 ? -1 : 1,
  magnitude: term.magnitudeText,
}));
```

No transformation code may recover mathematical sign with `term.text.replace(...)`.

- [ ] **Step 6: Verify and commit**

```bash
node --test tests/platform/algebraAstIntegrity.test.mjs
node --test tests/platform/solverWorkspaceModes.test.mjs
git add src/algebraAstEngine.js tests/platform/algebraAstIntegrity.test.mjs
git commit -m "fix: preserve signed algebra terms during placement"
```

Expected: both test commands PASS.

---

### Task 2: Add pristine relation integrity and reject corrupted committed math

**Files:**
- Create: `tests/platform/algebraRelationIntegrity.test.mjs`
- Modify: `src/algebraRelationFoundation.js`
- Modify: `src/MultiRelationAlgebraCore.jsx`

**Interfaces:**
- Produces `validateRelationTransition(previousState, nextState, context) -> { valid, reason }`.
- Balanced-operation context is `{ kind: 'balancedOperation', operation, operandExpression, branchIndices }`.
- Equivalent rewrite/cancellation context is `{ kind: 'equivalentRewrite' }`.
- Structural helpers that already prove their own preconditions use explicit kinds: `absoluteSplit`, `squareRoot`, `solutionClaim`.

- [ ] **Step 1: Add the exact relation regression tests**

```js
// tests/platform/algebraRelationIntegrity.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyBalancedOperationToRelation,
  cloneRelationState,
  parseRelationSource,
  relationSolutionSummary,
  relationStateToText,
  validateRelationTransition,
  verifyRelationCandidate,
} from '../../src/algebraRelationFoundation.js';

test('8+p=-2p+3 keeps the negative through a balanced subtraction', () => {
  const pristine = parseRelationSource('8 + p = -2*p + 3', 'p');
  const beforeText = relationStateToText(cloneRelationState(pristine));
  const result = applyBalancedOperationToRelation(pristine, 'subtract', 'p', {
    branchIndex: 0,
    placementByExpression: {
      0: { kind: 'after', termIndex: 1 },
      1: { kind: 'after', termIndex: 0 },
    },
    requireExplicitPlacement: true,
  });
  const next = result.state;

  assert.equal(relationStateToText(pristine), beforeText);
  assert.match(relationStateToText(next), /-2\s*\*?\s*p/);
  assert.equal(validateRelationTransition(pristine, next, {
    kind: 'balancedOperation',
    operation: 'subtract',
    operandExpression: result.operand.expression,
    branchIndices: [0],
  }).valid, true);
});

test('a +2p corruption is rejected before it can become solver truth', () => {
  const previous = parseRelationSource('8 + p = -2*p + 3', 'p');
  const corrupted = parseRelationSource('8 + p - p = 2*p - p + 3', 'p');
  const verdict = validateRelationTransition(previous, corrupted, {
    kind: 'balancedOperation',
    operation: 'subtract',
    operandExpression: 'p',
    branchIndices: [0],
  });
  assert.equal(verdict.valid, false);
});

test('the pristine equation owns final candidate truth', () => {
  const pristine = parseRelationSource('8 + p = -2*p + 3', 'p');
  assert.equal(verifyRelationCandidate(pristine, -5 / 3, 'p'), true);
  assert.equal(verifyRelationCandidate(pristine, 5, 'p'), false);
});

test('absolute-value candidates are checked in the original equation', () => {
  const pristine = parseRelationSource('abs(x - 3) = 5', 'x');
  assert.equal(verifyRelationCandidate(pristine, 8, 'x'), true);
  assert.equal(verifyRelationCandidate(pristine, -2, 'x'), true);
  assert.equal(verifyRelationCandidate(pristine, 2, 'x'), false);
});
```

- [ ] **Step 2: Run and confirm the missing integrity API fails**

```bash
node --test tests/platform/algebraRelationIntegrity.test.mjs
```

Expected before implementation: FAIL because `validateRelationTransition` is not exported.

- [ ] **Step 3: Implement operation-specific balanced-step validation**

In `src/algebraRelationFoundation.js`, import `expressionsEquivalent` from `algebraAstEngine.js` and add a private expected-expression builder that does not use placement reconstruction:

```js
const expectedBalancedExpression = (expression, operation, operand) => {
  if (operation === 'add') return `(${expression}) + (${operand})`;
  if (operation === 'subtract') return `(${expression}) - (${operand})`;
  if (operation === 'multiply') return `(${operand}) * (${expression})`;
  if (operation === 'divide') return `(${expression}) / (${operand})`;
  throw new Error('Unknown balanced operation.');
};
```

For each branch in `branchIndices`, compare every `next` expression to this mathematically expected expression using `expressionsEquivalent`. This intentionally uses a separate construction path from `applyAdditiveOperationAtPlacement`, so the validator catches a placement-engine sign mutation instead of reproducing it.

- [ ] **Step 4: Implement `validateRelationTransition()`**

```js
export const validateRelationTransition = (previousState, nextState, context = {}) => {
  if (!previousState || !nextState) {
    return { valid: false, reason: 'The solver could not verify this algebra step.' };
  }

  if (context.kind === 'balancedOperation') {
    const indices = context.branchIndices || [];
    const valid = indices.every((branchIndex) => {
      const before = previousState.branches?.[branchIndex];
      const after = nextState.branches?.[branchIndex];
      if (!before || !after || before.expressions.length !== after.expressions.length) return false;
      return before.expressions.every((expression, expressionIndex) => (
        expressionsEquivalent(
          after.expressions[expressionIndex],
          expectedBalancedExpression(expression, context.operation, context.operandExpression),
          previousState.variable,
        )
      ));
    });
    return valid
      ? { valid: true, reason: null }
      : { valid: false, reason: 'That step did not preserve the relation. Your previous valid work was kept.' };
  }

  if (context.kind === 'equivalentRewrite') {
    const sameShape = previousState.branches?.length === nextState.branches?.length;
    const valid = sameShape && previousState.branches.every((before, branchIndex) => {
      const after = nextState.branches[branchIndex];
      return before.relations.join('|') === after.relations.join('|')
        && before.expressions.length === after.expressions.length
        && before.expressions.every((expression, expressionIndex) => (
          expressionsEquivalent(expression, after.expressions[expressionIndex], previousState.variable)
        ));
    });
    return valid
      ? { valid: true, reason: null }
      : { valid: false, reason: 'That rewrite changed the relation. Your previous valid work was kept.' };
  }

  if (['absoluteSplit', 'squareRoot', 'solutionClaim'].includes(context.kind)) {
    return { valid: context.prevalidated === true, reason: context.prevalidated === true ? null : 'MathMaster could not verify that special algebra step.' };
  }

  return { valid: false, reason: 'MathMaster did not recognize the algebra transformation.' };
};
```

The `prevalidated` flag may only be set immediately after the existing owning helper has returned its successful/ready result: `buildAbsoluteValueSplit` / `buildStudentAuthoredAbsoluteValueEqualitySplit`, `takeSquareRootOfRelation`, or `obviousSpecialClaim`. It is not a general bypass.

- [ ] **Step 5: Gate every `MultiRelationAlgebraCore` commit before history/state mutation**

Change `commitState` to accept a fourth `validationContext` argument. Validate first; only a valid transition can push history, replace `relationState`, clear candidate checks, or call `persistStep`.

```js
const commitState = async (next, label, kind = 'relation-step', validationContext) => {
  const before = cloneRelationState(relationState);
  const validation = validateRelationTransition(before, next, validationContext);
  if (!validation.valid) {
    setMessage({ tone: 'error', text: validation.reason });
    return false;
  }
  setHistory((current) => [...current, before]);
  setRelationState(next);
  // existing UI resets remain here
  await persistStep(before, next, label, kind);
  return true;
};
```

Balanced operations pass the actual operation, parsed operand expression, and staged branch indices. Rewrite/cancellation pass `equivalentRewrite`. Absolute split, square root, and justified solution claim pass their explicit kind plus `prevalidated: true` only after their existing helper succeeds.

The negative-multiply/divide pending-relation-flip path currently mutates state/history outside `commitState`; route its finalized state through the same validation/persist boundary when the student finishes the required relation-symbol change.

- [ ] **Step 6: Keep authoritative grading truth anchored to `pristine`**

Retain the mutable `relationSolutionSummary(relationState)` only as `workspaceSummary` for deciding whether the student has isolated candidate values/intervals. Candidate correctness must continue to use `verifyRelationCandidates(pristine, ...)`.

Rename the variable to make this distinction explicit:

```js
const workspaceSummary = useMemo(() => relationSolutionSummary(relationState), [relationState]);
```

Do not use a mutable-state solution as an answer key. For absolute-value work, final `fullyCorrect` remains gated by candidate checks against `pristine`.

- [ ] **Step 7: Verify the complete `-2p` truth chain**

Add one more test to `algebraRelationIntegrity.test.mjs` that parses each correctly transformed relation and proves the same pristine candidate:

```js
for (const relation of [
  '8 + p = -2*p + 3',
  '8 = -3*p + 3',
  '5 = -3*p',
  'p = -5/3',
]) {
  const state = parseRelationSource(relation, 'p');
  assert.equal(verifyRelationCandidate(state, -5 / 3, 'p'), true);
}
assert.equal(relationSolutionSummary(parseRelationSource('p = -5/3', 'p')).values[0], -5 / 3);
```

- [ ] **Step 8: Verify and commit**

```bash
node --test tests/platform/algebraAstIntegrity.test.mjs tests/platform/algebraRelationIntegrity.test.mjs
git add src/algebraRelationFoundation.js src/MultiRelationAlgebraCore.jsx tests/platform/algebraRelationIntegrity.test.mjs
git commit -m "fix: anchor relation grading to pristine math"
```

Expected: PASS.

---

### Task 3: Add committed-step Undo to both solver families

**Files:**
- Create: `tests/platform/solverUndoHistory.test.mjs`
- Modify: `src/StepByStepAlgebraCore.jsx`
- Modify: `src/MultiRelationAlgebraCore.jsx`

**Interfaces:**
- Both solvers publish `onUndoStateChange({ canUndo, onUndo, label })`.
- Step solver adds `committedHistory` containing canonical equation snapshots.
- Multi-relation solver keeps its existing `history` but makes transient-first behavior and single-push commit semantics explicit.

- [ ] **Step 1: Add the failing Undo source contract**

```js
// tests/platform/solverUndoHistory.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('step algebra has committed snapshots in addition to transient undo', async () => {
  const source = await read('src/StepByStepAlgebraCore.jsx');
  assert.match(source, /committedHistory/);
  assert.match(source, /setCommittedHistory/);
  assert.match(source, /pendingMove/);
  assert.match(source, /onUndoStateChange/);
});

test('multi relation uses one history push per committed relation state', async () => {
  const source = await read('src/MultiRelationAlgebraCore.jsx');
  assert.match(source, /commitState/);
  assert.match(source, /setHistory/);
  assert.match(source, /cloneRelationState/);
  assert.match(source, /onUndoStateChange/);
});

test('both reset paths clear committed history', async () => {
  const [step, relation] = await Promise.all([
    read('src/StepByStepAlgebraCore.jsx'),
    read('src/MultiRelationAlgebraCore.jsx'),
  ]);
  assert.match(step, /setCommittedHistory\(\[\]\)/);
  assert.match(relation, /setHistory\(\[\]\)/);
});
```

- [ ] **Step 2: Prove current StepByStep behavior fails**

```bash
node --test tests/platform/solverUndoHistory.test.mjs
```

Expected before implementation: FAIL because `committedHistory` does not exist.

- [ ] **Step 3: Record the pre-commit equation in `StepByStepAlgebraCore`**

Add:

```js
const [committedHistory, setCommittedHistory] = useState([]);
```

Immediately before every accepted `setEquation(nextEquation)` that represents a student mathematical commit, record a deep copy of the current canonical equation:

```js
setCommittedHistory((current) => [...current, structuredClone(equation)].slice(-60));
setEquation(nextEquation);
```

Use the same helper for accepted balanced operations and accepted student rewrites/simplifications so no commit path is missed. Prefilled accommodation setup is not student Undo history.

- [ ] **Step 4: Make StepByStep Undo transient-first**

Define `hasTransientUndo` from the existing pending move, selected/crossed cancellation state, and simplification/rewrite staging. The controller logic is:

```js
const undoCommittedEquation = () => {
  setCommittedHistory((current) => {
    if (!current.length) return current;
    const previous = current[current.length - 1];
    setEquation(previous);
    setPendingMove(null);
    setCrossedSides([]);
    setCancelledPairIds({});
    setSelectedCancellationIndices({});
    setSimplificationAnswers({});
    setRewriteOpen(false);
    setRewriteAnswers({ left: '', right: '' });
    setMessage({ tone: 'growth', text: 'Last completed algebra step undone.' });
    return current.slice(0, -1);
  });
};
```

The existing transient undo body runs first when transient work exists; only otherwise call `undoCommittedEquation()`.

- [ ] **Step 5: Align `MultiRelationAlgebraCore` transient-first Undo**

Before popping `history`, clear an active uncommitted operation/operand/placements, rewrite entry, cancellation selection, open split editor, or incomplete relation picker. Only if none of those transient states is active should Undo pop a committed relation snapshot.

All successful `commitState` calls push once. A rejected integrity check pushes zero times.

- [ ] **Step 6: Reset both histories on question reset and Reset Work**

Step solver calls `setCommittedHistory([])` whenever it restores the pristine authored equation. MultiRelation already resets `history`; keep that behavior in every Reset Work path.

- [ ] **Step 7: Verify and commit**

```bash
node --test tests/platform/solverUndoHistory.test.mjs
node --test tests/platform/algebraAstIntegrity.test.mjs tests/platform/algebraRelationIntegrity.test.mjs
git add src/StepByStepAlgebraCore.jsx src/MultiRelationAlgebraCore.jsx tests/platform/solverUndoHistory.test.mjs
git commit -m "feat: add committed solver undo history"
```

Expected: PASS.

---

### Task 4: Make partial-credit milestones idempotent across Undo/replay

**Files:**
- Create: `src/solverMilestoneCredit.js`
- Create: `tests/platform/solverMilestoneCredit.test.mjs`
- Modify: `src/StepByStepAlgebraCore.jsx`
- Modify: `src/MultiRelationAlgebraCore.jsx`

**Interfaces:**
- Produces `solverMilestoneKey(kind, canonicalStateText)` and `recordSolverMilestone(existingKeys, kind, canonicalStateText)`.
- Both solvers persist `creditedMilestones` inside their existing `algebraState` state patch and local draft payload; Undo restores math state but does not delete credited milestone keys.

- [ ] **Step 1: Add pure failing milestone tests**

```js
// tests/platform/solverMilestoneCredit.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { recordSolverMilestone, solverMilestoneKey } from '../../src/solverMilestoneCredit.js';

test('the same canonical milestone can only be awarded once', () => {
  const first = recordSolverMilestone([], 'balanced-operation', '8+p-p=-2p-p+3');
  assert.equal(first.isNew, true);
  const replay = recordSolverMilestone(first.keys, 'balanced-operation', '8 + p - p = -2p - p + 3');
  assert.equal(replay.isNew, false);
  assert.deepEqual(replay.keys, first.keys);
});

test('different mathematical states remain different milestones', () => {
  const a = solverMilestoneKey('balanced-operation', '8+p=-2p+3');
  const b = solverMilestoneKey('balanced-operation', '8=-3p+3');
  assert.notEqual(a, b);
});
```

- [ ] **Step 2: Run and confirm the missing module fails**

```bash
node --test tests/platform/solverMilestoneCredit.test.mjs
```

Expected before implementation: FAIL with module-not-found.

- [ ] **Step 3: Implement the pure helper**

```js
// src/solverMilestoneCredit.js
export const canonicalSolverStateText = (value) => String(value ?? '').replace(/\s+/g, '');

export const solverMilestoneKey = (kind, canonicalStateText) => (
  `${String(kind || 'solver-step')}:${canonicalSolverStateText(canonicalStateText)}`
);

export const recordSolverMilestone = (existingKeys, kind, canonicalStateText) => {
  const keys = [...new Set(Array.isArray(existingKeys) ? existingKeys : [])];
  const key = solverMilestoneKey(kind, canonicalStateText);
  if (keys.includes(key)) return { key, keys, isNew: false };
  return { key, keys: [...keys, key], isNew: true };
};
```

- [ ] **Step 4: Initialize and persist credited keys in each solver**

Initialize from `normalizedRecord.algebraState?.creditedMilestones || []`, keep a local state array, include it in the existing question draft payload, and include it in every accepted step `statePatch.algebraState`.

For StepByStep, the state patch becomes structurally:

```js
algebraState: {
  equation: equationAfter,
  supportLevel,
  stepNumber: Number(normalizedRecord.algebraState?.stepNumber || 0) + 1,
  creditedMilestones: nextCreditedMilestones,
}
```

For MultiRelation:

```js
algebraState: {
  relationState: after,
  creditedMilestones: nextCreditedMilestones,
}
```

- [ ] **Step 5: Deduplicate the credit portion without losing state persistence**

Before `onStepGrade`, call `recordSolverMilestone`. For a new milestone, preserve existing earned/possible values. For replay of an already credited milestone, still persist the current canonical state but mark the step as non-credit-bearing with the existing step-grade channel:

```js
const milestone = recordSolverMilestone(creditedMilestones, kind, canonicalAfter);
setCreditedMilestones(milestone.keys);
const creditEarned = milestone.isNew ? earned : 0;
const creditPossible = milestone.isNew ? possible : 0;
```

Add `milestoneKey: milestone.key` and `duplicateMilestone: !milestone.isNew` to `stepGrade`. The server/parent receives the current state patch but cannot add the same milestone again. If the existing `onStepGrade` boundary rejects `possible: 0`, use its existing non-credit telemetry field while still persisting `statePatch`; do not manufacture another attempt.

- [ ] **Step 6: Ensure Undo does not roll credited keys backward**

Committed Undo restores equation/relation state only. It does not restore `creditedMilestones` from the historical math snapshot. Reset Work also retains earned milestone evidence for the current question attempt unless the existing question-record reset explicitly starts a new graded attempt.

- [ ] **Step 7: Verify and commit**

```bash
node --test tests/platform/solverMilestoneCredit.test.mjs tests/platform/solverUndoHistory.test.mjs
git add src/solverMilestoneCredit.js src/StepByStepAlgebraCore.jsx src/MultiRelationAlgebraCore.jsx tests/platform/solverMilestoneCredit.test.mjs
git commit -m "fix: dedupe solver milestone credit after undo"
```

Expected: PASS.

---

### Task 5: Make solver workspace state authoritative at `QuestionEngine`

**Files:**
- Modify: `tests/platform/solverWorkspaceModes.test.mjs`
- Modify: `src/QuestionEngine.jsx`
- Modify: `src/StepByStepAlgebra.jsx`
- Modify: `src/MultiRelationAlgebra.jsx`
- Modify: `src/components/common/SolverWorkspaceFrame.jsx`
- Modify: `src/components/student/MobileViewportContainer.jsx`
- Modify: `src/components/student/MathToolMobileLayout.css`

**Interfaces:**
- `SolverWorkspaceFrame` emits `onWorkspaceModeChange('normal' | 'enlarged' | 'focus')`.
- `QuestionEngine` owns `solverWorkspaceMode` and derives `solverWorkspaceActive`.
- `MobileViewportContainer` consumes `solverWorkspaceActive` and suppresses normal Task/action chrome while preserving `isPromptCollapsed` unchanged.

- [ ] **Step 1: Extend the workspace contract test**

```js
test('solver workspace mode is reported upward and normal chrome is suppressed', async () => {
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
  assert.equal((frame.match(/\{children\}/g) || []).length, 1);
});
```

Add source assertions in the same test file that `GuidedClassworkCoach`, attempts/status presentation, and normal `actionButtons` are gated by `solverWorkspaceActive` at the QuestionEngine/container level rather than being covered by the overlay.

- [ ] **Step 2: Run and confirm missing state plumbing fails**

```bash
node --test tests/platform/solverWorkspaceModes.test.mjs
```

Expected: FAIL on `onWorkspaceModeChange` / `solverWorkspaceActive`.

- [ ] **Step 3: Emit workspace mode from the frame**

Add optional prop `onWorkspaceModeChange` and:

```js
useEffect(() => {
  onWorkspaceModeChange?.(workspaceMode);
  return () => onWorkspaceModeChange?.('normal');
}, [onWorkspaceModeChange, workspaceMode]);
```

The callback is the state contract. Existing body-overflow/dataset code may remain for presentation, but outer assignment behavior must not depend on `closest()` selectors.

- [ ] **Step 4: Own the mode in `QuestionEngine`**

Add:

```js
const [solverWorkspaceMode, setSolverWorkspaceMode] = useState('normal');
const solverWorkspaceActive = solverWorkspaceMode !== 'normal';
```

Reset it to `normal` when `processedQuestion` changes. Pass `onWorkspaceModeChange: setSolverWorkspaceMode` through common algebra solver props.

- [ ] **Step 5: Suppress normal Task and bottom action bar without overwriting Task state**

Add `solverWorkspaceActive = false` to `MobileViewportContainer` props and gate the normal desktop Task anchor and action bar:

```jsx
{!solverWorkspaceActive && <div className="mathmaster-desktop-task-anchor">...</div>}
{!solverWorkspaceActive && (workBar || actionButtons) && (
  <div className="mathmaster-desktop-action-bar">...</div>
)}
```

Do not call `setIsPromptCollapsed(true)` when entering workspace. Because the Task is suppressed at render time, its prior open/collapsed state survives and naturally reappears on exit.

- [ ] **Step 6: Suppress assignment-only visual chrome in workspace mode**

In `QuestionEngine`, keep grading data live but conditionally hide visual-only rows that otherwise sit above/around the tool: attempts remaining, Guided Notes/coach strip, standard/alignment/status panels, and large partial-credit status chrome. The normal versions render only when `!solverWorkspaceActive`.

- [ ] **Step 7: Remove layout residue in CSS**

In `MathToolMobileLayout.css`, ensure workspace-active container state does not reserve normal sticky action-bar bottom spacing or Task-hidden placeholder height. Do not globally hide elements by document selector; use the explicit workspace-active class/data prop emitted by the owning components.

- [ ] **Step 8: Verify and commit**

```bash
node --test tests/platform/solverWorkspaceModes.test.mjs tests/platform/solverUndoHistory.test.mjs
git add src/QuestionEngine.jsx src/StepByStepAlgebra.jsx src/MultiRelationAlgebra.jsx src/components/common/SolverWorkspaceFrame.jsx src/components/student/MobileViewportContainer.jsx src/components/student/MathToolMobileLayout.css tests/platform/solverWorkspaceModes.test.mjs
git commit -m "feat: share solver workspace state with assignment shell"
```

Expected: PASS.

---

### Task 6: Promote global actions into the compact top workspace bar

**Files:**
- Modify: `tests/platform/solverWorkspaceModes.test.mjs`
- Modify: `src/QuestionEngine.jsx`
- Modify: `src/StepByStepAlgebra.jsx`
- Modify: `src/MultiRelationAlgebra.jsx`
- Modify: `src/components/common/SolverWorkspaceFrame.jsx`
- Modify: `src/components/common/SolverWorkspaceFrame.css`

**Interfaces:**
- `QuestionEngine` produces `workspaceActions`:

```js
{
  undo: { disabled, label, onClick } | null,
  scratchpad: { disabled, onClick } | null,
  submit: { disabled, label, onClick } | null,
  helpContent: ReactNode | null,
}
```

- `SolverWorkspaceFrame` already receives `taskText`; Task does not need a duplicate action payload.

- [ ] **Step 1: Add failing toolbar-promotion assertions**

```js
test('workspace toolbar promotes global actions and keeps submit conditional', async () => {
  const [frame, engine] = await Promise.all([
    read('src/components/common/SolverWorkspaceFrame.jsx'),
    read('src/QuestionEngine.jsx'),
  ]);
  assert.match(frame, /workspaceActions/);
  assert.match(frame, /Undo/);
  assert.match(frame, /Scratchpad/);
  assert.match(frame, /Task/);
  assert.match(frame, /Help/);
  assert.match(engine, /shouldShowSubmit/);
  assert.match(engine, /workspaceActions/);
});
```

- [ ] **Step 2: Run and prove it fails**

```bash
node --test tests/platform/solverWorkspaceModes.test.mjs
```

Expected: FAIL on `workspaceActions`.

- [ ] **Step 3: Package existing QuestionEngine handlers; do not create a second submit path**

Reuse the already-existing `undoController`, `openScratchpad`, `shouldShowSubmit`, `handleSubmit`, `submitDisabled`, `submitting`, `locked`, and GuidedClassworkCoach configuration:

```js
const workspaceActions = {
  undo: undoController ? {
    disabled: !undoController.canUndo || locked,
    label: undoController.label || 'Undo',
    onClick: () => undoController.onUndo?.(),
  } : null,
  scratchpad: {
    disabled: scratchpadLoading,
    onClick: openScratchpad,
  },
  submit: !locked && shouldShowSubmit ? {
    disabled: submitDisabled,
    onClick: handleSubmit,
    label: submitting
      ? 'Checking…'
      : processedQuestion?.type === 'stepAlgebra'
        ? 'Submit Solved Equation'
        : record.attemptCount > 0
          ? 'Submit Another Attempt'
          : 'Submit Answer',
  } : null,
  helpContent: resolvedActivityPolicy?.hintsAllowed !== false && guidedNotesMode !== 'off'
    ? guidedCoachNode
    : null,
};
```

Create `guidedCoachNode` once from the current `<GuidedClassworkCoach ... />` props. Render it in the normal assignment location when `!solverWorkspaceActive`; pass the same node as `helpContent` for workspace use when active. This avoids two simultaneous coach instances.

- [ ] **Step 4: Pass `workspaceActions` through both thin algebra wrappers**

The wrappers pass it to `SolverWorkspaceFrame`; solver cores do not receive or interpret assignment-level actions.

- [ ] **Step 5: Build the one-row workspace toolbar**

In `SolverWorkspaceFrame`, render on wide screens:

```text
Task | Undo | Scratchpad | Zoom − | 100% | Zoom + | Fit work | Help | [flex] | [Submit when present] | Return to assignment
```

Task opens `taskText` in a temporary drawer/popover inside the workspace shell. Help opens `workspaceActions.helpContent` in the same temporary-panel pattern. Closed panels consume zero permanent rows.

- [ ] **Step 6: Keep Submit conditional and final-question-level only**

Do not render a submit placeholder when `workspaceActions.submit` is null. When present, it is the primary right-side action. `Return to assignment` is secondary. Do not move Check Split, Commit Step, Rewrite/Simplify, operation staging, cancellation, candidate checking, or Reset Work into this bar.

- [ ] **Step 7: Remove overlap in workspace CSS**

The full-screen shell uses a pinned toolbar plus a solver-body region below it. The solver body gets its own vertical scrolling and never sits beneath the toolbar. The normal bottom action bar is already suppressed by Task 5.

- [ ] **Step 8: Verify and commit**

```bash
node --test tests/platform/solverWorkspaceModes.test.mjs
npm run build
git add src/QuestionEngine.jsx src/StepByStepAlgebra.jsx src/MultiRelationAlgebra.jsx src/components/common/SolverWorkspaceFrame.jsx src/components/common/SolverWorkspaceFrame.css tests/platform/solverWorkspaceModes.test.mjs
git commit -m "feat: promote solver actions into workspace toolbar"
```

Expected: test PASS and Vite build PASS.

---

### Task 7: Compact the absolute-value/multi-relation branch workspace

**Files:**
- Modify: `tests/platform/solverWorkspaceModes.test.mjs`
- Modify: `src/MultiRelationAlgebra.jsx`
- Modify: `src/MultiRelationAlgebraCore.jsx`
- Modify: `src/components/common/SolverWorkspaceFrame.css`
- Modify: `src/StepByStepAlgebra.css` only if the existing `.multi-relation-*` classes are owned there; keep each existing selector in its current stylesheet rather than duplicating it.

**Interfaces:**
- `MultiRelationAlgebraCore` consumes `denseWorkspace: boolean` as presentation-only state.
- Mathematical state, branch transforms, grading, and Undo are unchanged by density.

- [ ] **Step 1: Add failing responsive density assertions**

```js
test('multi relation has one dense responsive branch layout in workspace mode', async () => {
  const [wrapper, core, css] = await Promise.all([
    read('src/MultiRelationAlgebra.jsx'),
    read('src/MultiRelationAlgebraCore.jsx'),
    read('src/components/common/SolverWorkspaceFrame.css'),
  ]);
  assert.match(wrapper, /denseWorkspace/);
  assert.match(core, /denseWorkspace/);
  assert.match(core, /multi-relation-branches--dense/);
  assert.match(core, /multi-relation-operation-dock/);
  assert.match(css, /grid-template-columns:\s*minmax\(0,\s*1fr\).*minmax\(0,\s*1fr\)/s);
  assert.match(css, /@media \(max-width:\s*780px\)/);
});
```

- [ ] **Step 2: Run and prove density wiring is missing**

```bash
node --test tests/platform/solverWorkspaceModes.test.mjs
```

Expected: FAIL on `denseWorkspace` / dense branch class.

- [ ] **Step 3: Pass presentation-only density to the core**

Derive density from enlarged/focus workspace state and pass it through the wrapper. Use one branch tree:

```jsx
<div className={`multi-relation-branches${denseWorkspace ? ' multi-relation-branches--dense' : ''}`}>
  {branchCards}
</div>
```

Do not create a second branch solver implementation.

- [ ] **Step 4: Use a wide-screen two-column branch grid**

```css
.multi-relation-branches--dense {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 12px;
  align-items: start;
}
```

Each branch card controls its own horizontal overflow/fit. Keep headings compact and use active-state styling rather than repeated instructional prose.

- [ ] **Step 5: Keep one shared operation dock and compact OR**

The existing `.multi-relation-operation-dock` remains the single arithmetic operation surface. It targets Branch A, Branch B, or both selected complete branches using the existing staged-branch logic. `OR` becomes a compact centered relationship indicator rather than a full-height row/card.

- [ ] **Step 6: Stack on narrow/mobile screens**

```css
@media (max-width: 780px) {
  .multi-relation-branches--dense {
    grid-template-columns: minmax(0, 1fr);
  }
}
```

Preserve existing touch-target minimums.

- [ ] **Step 7: Verify and commit**

```bash
node --test tests/platform/solverWorkspaceModes.test.mjs
npm run build
git add src/MultiRelationAlgebra.jsx src/MultiRelationAlgebraCore.jsx src/components/common/SolverWorkspaceFrame.css src/StepByStepAlgebra.css tests/platform/solverWorkspaceModes.test.mjs
git commit -m "feat: compact multi relation solver workspace"
```

If `src/StepByStepAlgebra.css` is unchanged, omit it from `git add`.

Expected: test PASS and build PASS.

---

### Task 8: Run full solver certification before merge/deploy

**Files:**
- No planned production changes.
- Test-only tightening is allowed if a certification assertion is missing; a newly exposed production defect returns to the owning task instead of being patched here without a focused failing test.

**Interfaces:**
- Consumes all Task 1–7 outputs.
- Produces a green platform suite and production build.

- [ ] **Step 1: Certify signed math and pristine grading truth**

```bash
node --test tests/platform/algebraAstIntegrity.test.mjs tests/platform/algebraRelationIntegrity.test.mjs
```

Expected: PASS, including `-2p` preservation, corrupted `+2p` rejection, and final `p = -5/3` truth.

- [ ] **Step 2: Certify Undo and milestone deduplication**

```bash
node --test tests/platform/solverUndoHistory.test.mjs tests/platform/solverMilestoneCredit.test.mjs
```

Expected: PASS.

- [ ] **Step 3: Certify workspace behavior**

```bash
node --test tests/platform/solverWorkspaceModes.test.mjs
```

Expected: PASS, including one mounted solver child, explicit workspace state, hidden normal chrome, promoted global actions, conditional Submit, and dense branch contract.

- [ ] **Step 4: Run existing grading/evidence suites**

```bash
npm run test:grading
npm run test:evidence
```

Expected: PASS.

- [ ] **Step 5: Run the complete platform suite**

```bash
npm test
```

Expected: all `tests/platform/*.test.mjs` tests PASS.

- [ ] **Step 6: Build production assets**

```bash
npm run build
```

Expected: Vite production build PASS.

- [ ] **Step 7: Audit the original regression mechanism and mutable-grading path**

```bash
rg "term\.text.*replace|replace.*term\.text|relationSolutionSummary\(relationState\)|onWorkspaceModeChange|mathmaster-desktop-action-bar" src
```

Expected:
- no additive transformation reconstructs mathematical sign by stripping `term.text`;
- any `relationSolutionSummary(relationState)` occurrence is explicitly workspace-progress logic, never the independent final answer key;
- `onWorkspaceModeChange` connects the shared frame to `QuestionEngine`;
- the normal desktop action bar still exists for normal mode but workspace rendering suppresses it.

- [ ] **Step 8: Review the final diff against the approved spec**

Check all three truth layers explicitly: pristine problem, mutable workspace state, grading truth. Confirm every successful multi-relation commit records one history entry, every rejected transition records none, and both solver Undo paths avoid attempt-spending callbacks.

Do not make an empty certification commit. If only tests were tightened, commit only those test files:

```bash
git add tests/platform
git commit -m "test: certify solver workspace integrity"
```

---

## Required Final Acceptance Results

- `8 + p = -2p + 3` never becomes a `+2p` equation in canonical state.
- Subtracting `p` can render `8 + p - p = -2p - p + 3` without changing its mathematics.
- Correct simplification remains `8 = -3p + 3`, then `5 = -3p`, then `p = -5/3`.
- The corrupted path producing `p = 5` is rejected and cannot become grading truth.
- Absolute-value candidate answers are checked in the original absolute-value equation.
- StepByStep and MultiRelation both Undo committed steps repeatedly back toward the original state.
- Transient staging is undone before committed history.
- Undo spends zero attempts.
- Replaying an already credited state after Undo awards zero additional milestone credit.
- Enlarge/Focus automatically removes normal Task, attempts/help/status chrome, and the bottom work bar from the active workspace.
- Undo and Scratchpad are compact top-bar controls in workspace mode.
- Final question-level Submit/Check moves to the top bar only when available.
- Branch-local/local-math actions stay beside the mathematics.
- Absolute-value branches use a compact side-by-side wide layout and stacked mobile layout.
- Entering/exiting workspace does not remount or erase solver work.
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
8. Optional test-only commit: `test: certify solver workspace integrity`
