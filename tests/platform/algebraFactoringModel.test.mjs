import test from 'node:test';
import assert from 'node:assert/strict';
import { equationToLatex, expressionsEquivalent, isSolvedEquation, parseEquationInput } from '../../src/algebraAstEngine.js';
import {
  checkQuotient,
  describeCommonFactorChoice,
  detectFactorableLists,
  exposeFactorTokens,
  factorTokensForTerm,
  findFactorableList,
  openFactoring,
  pullOutCommonFactor,
  setFactorQuotient,
  toggleFactorTerm,
  toggleFactorToken,
  toggleNegativeFactor,
  validateCommonFactor,
} from '../../src/algebraFactoringModel.js';
import { commitStructureTool, detectStructureTools, factoringOptionsFor } from '../../src/algebraStructureTools.js';
import { commitArithmetic, openArithmetic, setArithmeticAnswer } from '../../src/algebraArithmeticModel.js';

const factored = (equation) => parseEquationInput({ equation, targetForm: 'factoredLinear' });
// MathJS pads symbols with incidental spaces (" y"); compare the notation itself.
const tex = (equation) => equationToLatex(equation).replace(/\s+/g, '');

/**
 * Drive the factoring tool the way a student does: select every term of the
 * list, expose primes, tap the chosen primes in EACH term, optionally pull out a
 * negative, pull out the factor, type each remaining factor, commit.
 */
const factorLikeAStudent = (equation, listId, chosenByTerm, { negate = false, quotients = [] } = {}) => {
  const options = factoringOptionsFor(equation);
  const list = findFactorableList(equation, listId, options);
  assert.ok(list, `expected ${listId} to be factorable in ${equationToLatex(equation)}`);
  let state = openFactoring(equation);
  list.terms.forEach((_, index) => { state = toggleFactorTerm(state, equation, listId, index, options).state; });
  let result = exposeFactorTokens(state, equation, options);
  assert.equal(result.ok, true);
  state = result.state;
  Object.entries(chosenByTerm).forEach(([termIndex, values]) => {
    const tokens = factorTokensForTerm(list.terms[termIndex].signedText);
    const used = new Set();
    values.forEach((value) => {
      const tokenIndex = tokens.findIndex((token, index) => String(token.value) === String(value) && token.selectable && !used.has(index));
      assert.ok(tokenIndex >= 0, `term ${termIndex} has no free ${value}`);
      used.add(tokenIndex);
      state = toggleFactorToken(state, equation, Number(termIndex), tokenIndex, options).state;
    });
  });
  if (negate) state = toggleNegativeFactor(state).state;
  result = pullOutCommonFactor(state, equation, options);
  if (!result.ok) return { pulled: false, reason: result.reason, state };
  state = result.state;
  quotients.forEach((value, position) => { state = setFactorQuotient(state, state.selected[position], value); });
  const committed = commitStructureTool(state, equation);
  return { pulled: true, committed, state };
};

test('15x - 45 is offered for factoring structurally and completes as 15(x - 3)', () => {
  const equation = factored('y = 15x - 45');
  assert.equal(isSolvedEquation(equation), false);
  assert.deepEqual(detectFactorableLists(equation).map((list) => list.id), ['right:side']);
  const { committed } = factorLikeAStudent(equation, 'right:side', { 0: [3, 5], 1: [3, 5] }, { quotients: ['x', '-3'] });
  assert.equal(committed.ok, true);
  assert.equal(tex(committed.equation), 'y=15\\left(x-3\\right)');
  assert.equal(committed.step.description, 'Factored 15 from the right side');
  assert.equal(isSolvedEquation(committed.equation), true);
});

test('a partial common factor of 3 is accepted, and 5x - 15 stays factorable', () => {
  const equation = factored('y = 15x - 45');
  const partial = factorLikeAStudent(equation, 'right:side', { 0: [3], 1: [3] }, { quotients: ['5x', '-15'] }).committed;
  assert.equal(partial.ok, true);
  assert.equal(tex(partial.equation), 'y=3\\left(5~x-15\\right)');
  assert.equal(isSolvedEquation(partial.equation), false, 'incomplete factoring is recognised as unfinished');
  assert.deepEqual(detectFactorableLists(partial.equation).map((list) => list.id), ['right:term:0']);

  const nested = factorLikeAStudent(partial.equation, 'right:term:0', { 0: [5], 1: [5] }, { quotients: ['x', '-3'] }).committed;
  assert.equal(nested.ok, true);
  assert.equal(tex(nested.equation), 'y=3\\left(5\\left(x-3\\right)\\right)');
  assert.equal(isSolvedEquation(nested.equation), false);

  // 3 × 5 is the student's arithmetic to state.
  const arithmetic = detectStructureTools(nested.equation).arithmetic;
  assert.equal(arithmetic.length, 1);
  let state = openArithmetic(nested.equation);
  assert.equal(commitArithmetic(nested.equation, setArithmeticAnswer(state, '8')).ok, false);
  state = setArithmeticAnswer(state, '15');
  const multiplied = commitArithmetic(nested.equation, state);
  assert.equal(multiplied.ok, true);
  assert.equal(tex(multiplied.equation), 'y=15\\left(x-3\\right)');
  assert.equal(isSolvedEquation(multiplied.equation), true);
});

for (const [source, chosen, quotients, expected] of [
  ['y = 6x + 18', [2, 3], ['x', '3'], 'y = 6\\left( x+3\\right)'],
  ['y = 12x + 8', [2, 2], ['3x', '2'], 'y = 4\\left(3~ x+2\\right)'],
  ['y = 5x - 20', [5], ['x', '-4'], 'y = 5\\left( x-4\\right)'],
]) {
  test(`${source} factors to ${expected}`, () => {
    const equation = factored(source);
    const { committed } = factorLikeAStudent(equation, 'right:side', { 0: chosen, 1: chosen }, { quotients });
    assert.equal(committed.ok, true);
    assert.equal(tex(committed.equation), expected.replace(/\s+/g, ''));
    assert.ok(expressionsEquivalent(equation.right, committed.equation.right, 'x'));
  });
}

test('-3x - 12 factors out a negative to -3(x + 4)', () => {
  const equation = factored('y = -3x - 12');
  const { committed } = factorLikeAStudent(equation, 'right:side', { 0: [3], 1: [3] }, { negate: true, quotients: ['x', '4'] });
  assert.equal(committed.ok, true);
  assert.equal(tex(committed.equation), 'y=-3\\left(x+4\\right)');
  assert.equal(isSolvedEquation(committed.equation), true);
});

test('-6x + 12: both -6(x - 2) and 6(-x + 2) are correct, and no sign is invented', () => {
  const equation = factored('y = -6x + 12');
  const negative = factorLikeAStudent(equation, 'right:side', { 0: [2, 3], 1: [2, 3] }, { negate: true, quotients: ['x', '-2'] }).committed;
  assert.equal(negative.ok, true);
  assert.equal(tex(negative.equation), 'y=-6\\left(x-2\\right)');
  assert.equal(isSolvedEquation(negative.equation), true);

  const positive = factorLikeAStudent(equation, 'right:side', { 0: [2, 3], 1: [2, 3] }, { quotients: ['-x', '2'] }).committed;
  assert.equal(positive.ok, true);
  assert.equal(tex(positive.equation), 'y=6\\left(-x+2\\right)');
  assert.equal(isSolvedEquation(positive.equation), false, '6(-x + 2) is valid but not yet y = a(x - c)');

  // The factored-linear target still offers a sign-only factor on the group.
  assert.deepEqual(detectFactorableLists(positive.equation, factoringOptionsFor(positive.equation)).map((list) => list.id), ['right:term:0']);
  // … which ordinary solving does not.
  assert.deepEqual(detectFactorableLists(positive.equation).map((list) => list.id), []);

  // Wrong signs in the remaining factors are refused, not "fixed".
  const wrongSign = factorLikeAStudent(equation, 'right:side', { 0: [2, 3], 1: [2, 3] }, { negate: true, quotients: ['x', '2'] }).committed;
  assert.equal(wrongSign.ok, false);
  assert.equal(wrongSign.results[1].reason, 'sign');
});

test('an invalid common factor is rejected: it must divide EVERY selected term', () => {
  assert.deepEqual(validateCommonFactor(['15x', '-45'], '2'), { ok: false, reason: 'notDivisible', termIndex: 0 });
  assert.deepEqual(validateCommonFactor(['15x', '-45'], '9'), { ok: false, reason: 'notDivisible', termIndex: 0 });
  assert.deepEqual(validateCommonFactor(['15x', '-45'], '15'), { ok: true });
  assert.deepEqual(validateCommonFactor(['15x', '-45'], '-15'), { ok: true });
  assert.deepEqual(validateCommonFactor(['15x', '-45'], '1'), { ok: false, reason: 'trivial' });
  assert.deepEqual(validateCommonFactor(['15x', '-45'], '0'), { ok: false, reason: 'invalidFactor' });

  // A factor chosen in only one term is not yet common.
  const equation = factored('y = 15x - 45');
  const unmatched = factorLikeAStudent(equation, 'right:side', { 0: [3, 5], 1: [3] });
  assert.equal(unmatched.pulled, false);
  assert.equal(unmatched.reason, 'unmatched');
  // Choosing nothing is not a factor.
  assert.equal(factorLikeAStudent(equation, 'right:side', {}).reason, 'emptyFactor');
});

test('variable factors are handled safely: x is not a factor of -45', () => {
  assert.deepEqual(validateCommonFactor(['15x', '-45'], 'x'), { ok: false, reason: 'notDivisible', termIndex: 1 });
  const equation = factored('y = 15x - 45');
  const result = factorLikeAStudent(equation, 'right:side', { 0: ['x'] });
  assert.equal(result.pulled, false);
  assert.equal(result.reason, 'notCommon');
  const choice = describeCommonFactorChoice(result.state, findFactorableList(equation, 'right:side'));
  assert.deepEqual({ termIndex: choice.mismatch.termIndex, value: choice.mismatch.value, unavailable: choice.mismatch.unavailable }, { termIndex: 1, value: 'x', unavailable: true });

  // A variable common to every term can be pulled out.
  const quadratic = { left: 'y', right: '6x^2 + 9x', variable: 'y', objective: { kind: 'isolate', variable: 'y' } };
  const { committed } = factorLikeAStudent(quadratic, 'right:side', { 0: [3, 'x'], 1: [3, 'x'] }, { quotients: ['2x', '3'] });
  assert.equal(committed.ok, true);
  assert.ok(expressionsEquivalent(quadratic.right, committed.equation.right, 'x'));
  assert.match(tex(committed.equation), /3~?x\\left\(2~x\+3\\right\)/);
});

test('remaining factors are checked exactly and must be simplified single terms', () => {
  const pulled = { coefficient: 15, powers: {} };
  assert.equal(checkQuotient('15 x', pulled, 'x').ok, true);
  assert.equal(checkQuotient('-45', pulled, '-3').ok, true);
  assert.equal(checkQuotient('-45', pulled, '3').reason, 'sign');
  assert.equal(checkQuotient('-45', pulled, '-9').reason, 'wrong');
  assert.equal(checkQuotient('15 x', pulled, '15x/15').reason, 'notSimplified');
  assert.equal(checkQuotient('15 x', pulled, 'x + 0').reason, 'notSingleTerm');
  assert.equal(checkQuotient('15 x', pulled, '').reason, 'empty');
});

test('the platform never fills the parentheses: a pulled factor with no remainders cannot commit', () => {
  const equation = factored('y = 15x - 45');
  const result = factorLikeAStudent(equation, 'right:side', { 0: [3, 5], 1: [3, 5] }, { quotients: [] });
  assert.equal(result.pulled, true);
  assert.equal(result.committed.ok, false);
  assert.deepEqual(result.committed.results.map((entry) => entry.reason), ['empty', 'empty']);
});

test('zero and degenerate cases do not crash and are not offered', () => {
  assert.deepEqual(detectFactorableLists({ left: 'y', right: '0' }), []);
  assert.deepEqual(detectFactorableLists({ left: 'y', right: '0x + 5' }), []);
  assert.deepEqual(detectFactorableLists({ left: 'y', right: 'x + 1' }), []);
  assert.deepEqual(detectFactorableLists({ left: 'y', right: '12 + 6' }), [], 'numbers alone are arithmetic, not factoring');
  assert.deepEqual(detectFactorableLists({ left: 'y', right: '(5/2)x + 5' }), [], 'fractional coefficients are not integer-factored');
  assert.deepEqual(detectFactorableLists(null), []);
  assert.equal(factorTokensForTerm('0'), null);
  assert.deepEqual(factorTokensForTerm('x').map((token) => token.latex), ['x']);
  assert.deepEqual(factorTokensForTerm('-1').map((token) => token.latex), ['-1', '1']);
  assert.deepEqual(factorTokensForTerm('-45').map((token) => token.latex), ['-1', '3', '3', '5']);
  assert.deepEqual(factorTokensForTerm('15 x').map((token) => token.latex), ['3', '5', 'x']);
  assert.equal(commitStructureTool(null, factored('y = 15x - 45')).ok, false);
});

test('factoring works on the left side and in ordinary equations too', () => {
  const equation = parseEquationInput({ equation: '6x + 18 = 30' });
  assert.deepEqual(detectFactorableLists(equation).map((list) => list.id), ['left:side']);
  const { committed } = factorLikeAStudent(equation, 'left:side', { 0: [2, 3], 1: [2, 3] }, { quotients: ['x', '3'] });
  assert.equal(committed.ok, true);
  assert.equal(tex(committed.equation), '6\\left(x+3\\right)=30');
  assert.equal(committed.step.description, 'Factored 6 from the left side');
});
