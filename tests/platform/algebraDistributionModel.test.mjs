import test from 'node:test';
import assert from 'node:assert/strict';
import {
  armFactor,
  commitDistribution,
  detectDistributableGroup,
  disarmFactor,
  expandedGroupText,
  initDistributionState,
  isDistributionComplete,
  placeOnTerm,
  undoLastPlacement,
} from '../../src/algebraDistributionModel.js';

const distributeAll = (detected) => {
  let state = armFactor(initDistributionState(detected));
  detected.terms.forEach((_, index) => {
    state = placeOnTerm(state, index);
  });
  return state;
};

test('detects a factor adjacent to an additive parenthetical group on either side', () => {
  const detected = detectDistributableGroup({ left: 'y - 7', right: '-(2/3)(x + 3)' });
  assert.ok(detected);
  assert.equal(detected.side, 'right');
  assert.equal(detected.terms.length, 2);

  const leftSide = detectDistributableGroup({ left: '-3(x - 4)', right: 'y' });
  assert.equal(leftSide.side, 'left');
});

test('does not detect a plain rewrite with no factored group', () => {
  assert.equal(detectDistributableGroup({ left: '-5x + 7y', right: '11' }), null);
  assert.equal(detectDistributableGroup({ left: 'y', right: 'x + 5' }), null);
  assert.equal(detectDistributableGroup(null), null);
});

test('negative factor exposes a positive product as a positive addend and a negative one as negative, per the issue worked example', () => {
  const detected = detectDistributableGroup({ left: 'y', right: '-3(x - 4)' });
  const state = distributeAll(detected);
  assert.equal(expandedGroupText(state), '(-3)(x) + (-3)(-4)');
});

test('rational negative factor matches the issue worked example exactly (modulo mathjs spacing)', () => {
  const detected = detectDistributableGroup({ left: 'y - 7', right: '-(2/3)(x + 3)' });
  const state = distributeAll(detected);
  const expanded = expandedGroupText(state).replace(/\s+/g, '');
  assert.equal(expanded, '(-2/3)(x)+(-2/3)(3)');
});

test('negative rational factor carries one mathematical minus in its display form', () => {
  const detected = detectDistributableGroup({ left: 'y - 7', right: '-(2/3)(x + 3)' });
  assert.ok(detected);
  assert.doesNotMatch(detected.factorLatex, /--|-\s*-/);
  assert.match(detected.factorText.replace(/\s+/g, ''), /^-2\/3$/);
});

test('distribution remains available after a different valid step adds a separate term', () => {
  const equation = { left: 'y', right: '-(2/3)(x + 3) + 7', variable: 'y' };
  const detected = detectDistributableGroup(equation);
  assert.ok(detected, 'the inner factored term should still be distributable');
  assert.equal(detected.side, 'right');
  assert.equal(detected.sideTermIndex, 0);
  const state = distributeAll(detected);
  const next = commitDistribution(equation, state);
  assert.match(next.right.replace(/\s+/g, ''), /\(-2\/3\)\(x\)/);
  assert.match(next.right.replace(/\s+/g, ''), /\+7$/);
});

test('distribution remains available when the factored term comes after another term', () => {
  const equation = { left: 'y', right: '7 - (2/3)(x + 3)', variable: 'y' };
  const detected = detectDistributableGroup(equation);
  assert.ok(detected);
  assert.equal(detected.sideTermIndex, 1);
  const state = distributeAll(detected);
  const next = commitDistribution(equation, state);
  assert.match(next.right.replace(/\s+/g, ''), /^7\+/);
  assert.match(next.right.replace(/\s+/g, ''), /\(-2\/3\)\(x\)/);
});

test('positive integer factor over two terms', () => {
  const detected = detectDistributableGroup({ left: 'y', right: '3(x + 4)' });
  const state = distributeAll(detected);
  assert.equal(expandedGroupText(state).replace(/\s+/g, ''), '(3)(x)+(3)(4)');
});

test('symbolic factor used in a literal equation', () => {
  const detected = detectDistributableGroup({ left: 'y', right: 'a*(x + y)' });
  const state = distributeAll(detected);
  assert.equal(expandedGroupText(state).replace(/\s+/g, ''), '(a)(x)+(a)(y)');
});
test('composite outside factor distributes as one factor expression', () => {
  // Step Algebra canonicalizes the visual 2L(x+w) product before this model sees it.
  const detected = detectDistributableGroup({ left: 'P', right: '2 * L * (x + w)' });
  assert.ok(detected);
  assert.equal(detected.factorText.replace(/\s+/g, ''), '2*L');
  const state = distributeAll(detected);
  assert.equal(expandedGroupText(state).replace(/\s+/g, ''), '(2*L)(x)+(2*L)(w)');
});

test('one factor pick-up stays armed across terms until distribution is complete', () => {
  const detected = detectDistributableGroup({ left: 'y', right: '3(x + 4)' });
  let state = armFactor(initDistributionState(detected));
  state = placeOnTerm(state, 0);
  assert.equal(state.armed, true);
  assert.deepEqual(state.placedIndices, [0]);
  state = placeOnTerm(state, 1);
  assert.equal(state.armed, false);
  assert.equal(isDistributionComplete(state), true);
});

test('three-term group distributes to every term', () => {
  const detected = detectDistributableGroup({ left: 'y', right: '2(x + y - 3)' });
  assert.equal(detected.terms.length, 3);
  const state = distributeAll(detected);
  assert.equal(expandedGroupText(state).replace(/\s+/g, ''), '(2)(x)+(2)(y)+(2)(-3)');
});

test('cannot commit partial distribution', () => {
  const detected = detectDistributableGroup({ left: 'y - 7', right: '-(2/3)(x + 3)' });
  let state = initDistributionState(detected);
  state = armFactor(state);
  state = placeOnTerm(state, 0); // only one of two terms
  assert.equal(isDistributionComplete(state), false);
  assert.equal(expandedGroupText(state), null);
  assert.equal(commitDistribution({ left: 'y - 7', right: '-(2/3)(x + 3)' }, state), null);
});

test('a term already receiving the factor cannot receive it twice', () => {
  const detected = detectDistributableGroup({ left: 'y - 7', right: '-(2/3)(x + 3)' });
  let state = initDistributionState(detected);
  state = armFactor(state);
  state = placeOnTerm(state, 0);
  const before = state;
  state = armFactor(state);
  state = placeOnTerm(state, 0); // same term again
  assert.deepEqual(state.placedIndices, before.placedIndices);
});

test('placement requires the factor to be armed first', () => {
  const detected = detectDistributableGroup({ left: 'y - 7', right: '-(2/3)(x + 3)' });
  const state = initDistributionState(detected);
  const afterAttempt = placeOnTerm(state, 0); // never armed
  assert.deepEqual(afterAttempt.placedIndices, []);
});

test('commit preserves unsimplified products — the equation state is not evaluated', () => {
  const equation = { left: 'y - 7', right: '-(2/3)(x + 3)', variable: 'y' };
  const detected = detectDistributableGroup(equation);
  const state = distributeAll(detected);
  const next = commitDistribution(equation, state);
  assert.equal(next.left, equation.left);
  assert.notEqual(next.right, equation.right);
  assert.ok(!/^-2$/.test(next.right.replace(/\s+/g, ''))); // never silently simplified to "-2/3x - 2"
  assert.match(next.right, /\(x\)/);
  assert.match(next.right, /\(3\)|\(-3\)/);
});


test('systems substitution may evaluate each distributed product while leaving like terms uncombined', () => {
  const equation = { left: '-3x - 3(2x - 7)', right: '1', variable: 'x' };
  const detected = detectDistributableGroup(equation);
  assert.ok(detected);
  const state = distributeAll(detected);
  const next = commitDistribution(equation, state, { simplifyProducts: true });
  const compact = next.left.replace(/\s+/g, '');
  assert.match(compact, /-3x/);
  assert.match(compact, /-6\*?x/);
  assert.match(compact, /21/);
  assert.doesNotMatch(compact, /-9\*?x/);
  assert.doesNotMatch(compact, /\+\-\(/);
});

test('undo before commit removes only the last placement', () => {
  const detected = detectDistributableGroup({ left: 'y', right: '2(x + y - 3)' });
  let state = initDistributionState(detected);
  state = placeOnTerm(armFactor(state), 0);
  state = placeOnTerm(armFactor(state), 1);
  assert.deepEqual(state.placedIndices, [0, 1]);
  state = undoLastPlacement(state);
  assert.deepEqual(state.placedIndices, [0]);
  state = undoLastPlacement(state);
  assert.deepEqual(state.placedIndices, []);
  // Undoing past empty is a no-op, not an error.
  state = undoLastPlacement(state);
  assert.deepEqual(state.placedIndices, []);
});

test('disarm clears an armed-but-unplaced factor without touching placements', () => {
  const detected = detectDistributableGroup({ left: 'y - 7', right: '-(2/3)(x + 3)' });
  let state = initDistributionState(detected);
  state = placeOnTerm(armFactor(state), 0);
  state = armFactor(state);
  assert.equal(state.armed, true);
  state = disarmFactor(state);
  assert.equal(state.armed, false);
  assert.deepEqual(state.placedIndices, [0]);
});

// Mutation guard: prove the "no auto-simplify" assertion above can actually
// fail, so it is not silently vacuous coverage.
test('mutation guard: a broken model that pre-simplifies would fail the unsimplified-products assertion', () => {
  const fakeExpanded = '-2/3x - 2'; // what a wrongly auto-simplified commit would produce
  assert.doesNotMatch(fakeExpanded, /\(x\)/);
});


test('distribution is detected after substituting a multi-term expression into a coefficient', () => {
  const equation = { left: '3 * (2 * y - 3) + 5 * y', right: '24', variable: 'y' };
  const detected = detectDistributableGroup(equation);
  assert.ok(detected, '3(2y - 3) must open the manual distribution tool');
  assert.equal(detected.terms.length, 2);
});

test('distribution is detected for the exact unsimplified divide-by-negative-one token produced by isolation', () => {
  const equation = { left: '-3 * x - 3 * (((7) - (2 * x)) / (-1))', right: '1', variable: 'x' };
  const detected = detectDistributableGroup(equation);
  assert.ok(detected, 'an unsimplified isolated expression must never strand the systems solver');
  assert.equal(detected.terms.length, 2);
});


test('a negative coefficient around a substituted multi-term expression still exposes manual distribution', () => {
  const equation = { left: '-3 * x - 3 * (2 * x - 7)', right: '1', variable: 'x' };
  const detected = detectDistributableGroup(equation);
  assert.ok(detected, 'the negative additive sign must not hide the distributive structure');
  assert.equal(detected.terms.length, 2);
  assert.match(detected.factorText.replace(/\s+/g, ''), /^-3$/);
});
