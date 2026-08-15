import test from 'node:test';
import assert from 'node:assert/strict';
import { parseEquationInput } from '../../src/algebraAstEngine.js';
import { ALGEBRA_DRAFT_VERSION, rehydrateAlgebraDraft } from '../../src/algebraDraftState.js';

const equation = parseEquationInput({
  equation: 'd = r*t',
  solveFor: 't',
  objective: { kind: 'isolate', variable: 't', simplifyRequired: true },
});

test('legacy pending move cannot resurrect an obsolete left-side simplification box', () => {
  const staleDraft = {
    equation,
    pendingMove: {
      operation: 'divide',
      operandExpression: 'r',
      simplificationTargets: [{ side: 'left', simplifiedExpression: 'd/r' }],
    },
    crossedSides: ['right'],
    simplificationAnswers: { left: 'd/r' },
  };

  const restored = rehydrateAlgebraDraft({ draft: staleDraft, initialEquation: equation });
  assert.equal(restored.algebraDraftVersion, ALGEBRA_DRAFT_VERSION);
  assert.equal(restored.pendingMove, null);
  assert.deepEqual(restored.crossedSides, []);
  assert.deepEqual(restored.simplificationAnswers, {});
  assert.deepEqual(restored.equation, equation);
});

test('current-version pending move is recomputed by the current algebra engine', () => {
  const draft = {
    algebraDraftVersion: ALGEBRA_DRAFT_VERSION,
    equation,
    pendingMove: {
      operation: 'divide',
      operandExpression: 'r',
      // Intentionally stale derived data. Rehydration must ignore it.
      simplificationTargets: [{ side: 'left', simplifiedExpression: 'd/r' }],
    },
  };

  const restored = rehydrateAlgebraDraft({ draft, initialEquation: equation });
  assert.ok(restored.pendingMove);
  assert.deepEqual(restored.pendingMove.requiredCancellationSides, ['right']);
  assert.deepEqual(restored.pendingMove.simplificationTargets, []);
});
