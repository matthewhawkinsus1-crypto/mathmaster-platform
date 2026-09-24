/*
 * STUDENT FLOWS FOR THE LINE TARGETS, THROUGH THE REAL ENGINE.
 *
 * Every step here is one a student makes in the Step Algebra workspace:
 * balanced operations through applyBalancedOperation (with the student's own
 * cancellations), then the structure tools' actions — Split fraction, Cancel
 * factors, Factor, Simplify arithmetic, Arrange terms — through the same pure
 * reducers the workspace calls. Nothing is typed as a finished answer.
 *
 * Also covered: transient Undo inside each tool, draft persistence of an open
 * tool, and what committed work looks like in the history (classroom LaTeX,
 * exact fractions, no machine syntax).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyBalancedOperation,
  equationToLatex,
  expressionToLatex,
  expressionsEquivalent,
  isSimplifiedSlopeInterceptExpression,
  isSolvedEquation,
  parseEquationInput,
} from '../../src/algebraAstEngine.js';
import { resolveEquationAfterMove } from '../../src/algebraSupportLevels.js';
import { ALGEBRA_DRAFT_VERSION, rehydrateAlgebraDraft } from '../../src/algebraDraftState.js';
import {
  commitStructureTool,
  detectStructureTools,
  openStructureTool,
  sanitizeStructureTool,
  undoStructureTool,
} from '../../src/algebraStructureTools.js';
import { armSplitDenominator, findSplittableFraction, placeSplitDenominator } from '../../src/algebraFractionSplitModel.js';
import { chooseReductionFraction, findReducibleFraction, tapReductionToken } from '../../src/algebraFractionReductionModel.js';
import { arrangementChanged, tapArrangeTerm } from '../../src/algebraArrangeTermsModel.js';
import {
  exposeFactorTokens,
  factorTokensForTerm,
  findFactorableList,
  pullOutCommonFactor,
  setFactorQuotient,
  toggleFactorTerm,
  toggleFactorToken,
  toggleNegativeFactor,
} from '../../src/algebraFactoringModel.js';

const tex = (equation) => equationToLatex(equation).replace(/\s+/g, '');
const slope = (equation) => parseEquationInput({ equation, targetForm: 'slopeIntercept', requireSimplifiedFinalForm: true, solveFor: 'y' });
const factored = (equation) => parseEquationInput({ equation, targetForm: 'factoredLinear' });

// A balanced + / − placed after the last term on the right, and after the
// first term on the left (where the student drops it under the x-term).
const move = (equation, operation, operand) => {
  const placement = ['add', 'subtract'].includes(operation)
    ? { left: { kind: 'under', termIndex: 0 }, right: { kind: 'end', termIndex: 0 } }
    : {};
  const pending = applyBalancedOperation({ equationState: equation, operation, operand, placementBySide: placement });
  // The student cancels every pair the engine found; no simplification is typed.
  assert.deepEqual(pending.simplificationTargets.map((target) => target.side), [], `${operation} ${operand} must not force a typed simplification on a line target`);
  return resolveEquationAfterMove(pending, 3, pending.requiredCancellationSides);
};

const split = (equation) => {
  let tool = openStructureTool('split', equation);
  const candidate = findSplittableFraction(equation, tool.candidateId);
  tool = armSplitDenominator(tool, equation);
  candidate.numeratorTerms.forEach((_, index) => { tool = placeSplitDenominator(tool, equation, index); });
  const result = commitStructureTool(tool, equation);
  assert.equal(result.ok, true);
  return result;
};

const reduceAll = (start) => {
  let equation = start;
  const steps = [];
  for (let guard = 0; guard < 6 && detectStructureTools(equation).reduce.length; guard += 1) {
    const id = detectStructureTools(equation).reduce[0].id;
    let tool = chooseReductionFraction(openStructureTool('reduce', equation), equation, id);
    const candidate = findReducibleFraction(equation, id);
    const used = new Set();
    candidate.tokens.numerator.forEach((token, index) => {
      if (!token.selectable) return;
      const below = candidate.tokens.denominator.findIndex((other, otherIndex) => !used.has(otherIndex) && String(other.value) === String(token.value));
      if (below < 0) return;
      used.add(below);
      tool = tapReductionToken(tool, equation, 'numerator', index).state;
      tool = tapReductionToken(tool, equation, 'denominator', below).state;
    });
    const result = commitStructureTool(tool, equation);
    assert.equal(result.ok, true);
    steps.push(result.step);
    equation = result.equation;
  }
  return { equation, steps };
};

const arrangeSwapFirstTwo = (equation, side = 'right') => {
  let tool = openStructureTool('arrange', { ...equation, left: equation.left });
  tool = tapArrangeTerm(tool, equation, side, 0);
  tool = tapArrangeTerm(tool, equation, side, 1);
  const result = commitStructureTool(tool, equation);
  assert.equal(result.ok, true);
  return result;
};

// --- Slope-intercept ---------------------------------------------------------------

test('5x + 2y = 6 completes interactively: y = (6 - 5x)/2 -> 6/2 - 5x/2 -> 3 - 5x/2 -> -5x/2 + 3', () => {
  let equation = slope('5x + 2y = 6');
  equation = move(equation, 'subtract', '5x');
  equation = move(equation, 'divide', '2');
  assert.equal(tex(equation), 'y=\\frac{6-5~x}{2}');
  assert.equal(isSolvedEquation(equation), false, 'the un-split (6 - 5x)/2 is unfinished when the objective asks for y = mx + b');
  assert.deepEqual(Object.entries(detectStructureTools(equation)).filter(([, found]) => found.length).map(([kind]) => kind), ['split']);

  const splitStep = split(equation);
  equation = splitStep.equation;
  assert.equal(tex(equation), 'y=\\frac{6}{2}-\\frac{5~x}{2}');
  assert.equal(isSolvedEquation(equation), false, '6/2 is not yet reduced');

  const reduced = reduceAll(equation);
  equation = reduced.equation;
  assert.equal(tex(equation), 'y=3-\\frac{5~x}{2}');
  assert.equal(isSolvedEquation(equation), true, 'the reversed order 3 - (5/2)x is accepted');

  const arranged = arrangeSwapFirstTwo(equation);
  assert.equal(tex(arranged.equation), 'y=-\\frac{5~x}{2}+3');
  assert.equal(isSolvedEquation(arranged.equation), true);
  assert.ok(expressionsEquivalent('(6 - 5x)/2', arranged.equation.right, 'x'));
});

test('-5x + 7y = 11 finishes as 11/7 + 5x/7 with exact sevenths', () => {
  let equation = slope('-5x + 7y = 11');
  equation = move(equation, 'add', '5x');
  equation = move(equation, 'divide', '7');
  equation = split(equation).equation;
  assert.equal(tex(equation), 'y=\\frac{11}{7}+\\frac{5~x}{7}');
  assert.deepEqual(detectStructureTools(equation).reduce, [], 'nothing to cancel in 11/7 or 5x/7');
  assert.equal(isSolvedEquation(equation), true);
  assert.doesNotMatch(equation.right, /1\.57|0\.71/);
});

test('2x - 4y = 8: dividing by a negative never invents a negative', () => {
  let equation = slope('2x - 4y = 8');
  equation = move(equation, 'subtract', '2x');
  equation = move(equation, 'divide', '-4');
  assert.equal(tex(equation), 'y=\\frac{8-2~x}{-4}');
  equation = split(equation).equation;
  assert.equal(tex(equation), 'y=\\frac{8}{-4}-\\frac{2~x}{-4}');
  equation = reduceAll(equation).equation;
  assert.equal(tex(equation), 'y=-2+\\frac{x}{2}');
  assert.equal(isSolvedEquation(equation), true);
  assert.ok(expressionsEquivalent('(8 - 2x)/(-4)', equation.right, 'x'));
  assert.doesNotMatch(equation.right, /-\s*-|\+\s*-/, 'no double negative');
});

test('conventional and reversed orderings are both accepted; unreduced and un-split forms are not', () => {
  for (const right of ['-(5/2)x + 3', '3 - (5/2)x', '(5/7)x + 11/7', '11/7 + 5x/7', '-2 + x/2', 'x/2 - 2', '3 + 2x', '-x']) {
    assert.equal(isSimplifiedSlopeInterceptExpression(right), true, right);
  }
  for (const right of ['(6 - 5x)/2', '6/2 - 5x/2', '10x/4 + 1', '3 - (10/4)x', '(8 - 2x)/(-4)', '-(2/3)(x + 3) + 7']) {
    assert.equal(isSimplifiedSlopeInterceptExpression(right), false, right);
  }
});

test('the no-forced-simplification rule is narrow: an isolate objective in strict mode still asks for it', () => {
  const strictIsolate = parseEquationInput({ equation: '2x = 6 - (-1) - 3', requireSimplifiedFinalForm: true });
  const pending = applyBalancedOperation({ equationState: strictIsolate, operation: 'divide', operand: '2' });
  assert.deepEqual(pending.simplificationTargets.map((target) => target.side), ['right']);
  const strictLine = slope('2x - 4y = 8');
  const afterSubtract = move(strictLine, 'subtract', '2x');
  const lineDivide = applyBalancedOperation({ equationState: afterSubtract, operation: 'divide', operand: '-4' });
  assert.deepEqual(lineDivide.simplificationTargets, [], 'a line target reaches its form with Split / Cancel / Arrange instead');
});

// --- Factored linear -----------------------------------------------------------------

const factorAll = (equation, listId, chosen, { negate = false, quotients }) => {
  const options = { allowSignOnly: equation.objective?.kind === 'factoredLinear' };
  const list = findFactorableList(equation, listId, options);
  let tool = openStructureTool('factor', equation);
  list.terms.forEach((_, index) => { tool = toggleFactorTerm(tool, equation, listId, index, options).state; });
  tool = exposeFactorTokens(tool, equation, options).state;
  Object.entries(chosen).forEach(([termIndex, values]) => {
    const tokens = factorTokensForTerm(list.terms[termIndex].signedText);
    const used = new Set();
    values.forEach((value) => {
      const index = tokens.findIndex((token, tokenIndex) => token.selectable && String(token.value) === String(value) && !used.has(tokenIndex));
      used.add(index);
      tool = toggleFactorToken(tool, equation, Number(termIndex), index, options).state;
    });
  });
  if (negate) tool = toggleNegativeFactor(tool).state;
  tool = pullOutCommonFactor(tool, equation, options).state;
  quotients.forEach((value, position) => { tool = setFactorQuotient(tool, tool.selected[position], value); });
  return commitStructureTool(tool, equation);
};

for (const [source, chosen, quotients, expected] of [
  ['y = 15x - 45', [3, 5], ['x', '-3'], 'y=15\\left(x-3\\right)'],
  ['y = 5x - 20', [5], ['x', '-4'], 'y=5\\left(x-4\\right)'],
]) {
  test(`factored linear: ${source} -> ${expected}`, () => {
    const equation = factored(source);
    assert.equal(isSolvedEquation(equation), false);
    const result = factorAll(equation, 'right:side', { 0: chosen, 1: chosen }, { quotients });
    assert.equal(tex(result.equation), expected);
    assert.equal(isSolvedEquation(result.equation), true);
  });
}

test('factored linear: y = -3x - 12 -> -3(x + 4) by pulling out a negative', () => {
  const result = factorAll(factored('y = -3x - 12'), 'right:side', { 0: [3], 1: [3] }, { negate: true, quotients: ['x', '4'] });
  assert.equal(tex(result.equation), 'y=-3\\left(x+4\\right)');
  assert.equal(isSolvedEquation(result.equation), true);
});

test('incorrect factoring is rejected and incomplete factoring is recognised as unfinished', () => {
  const equation = factored('y = 5x - 20');
  const wrong = factorAll(equation, 'right:side', { 0: [5], 1: [5] }, { quotients: ['x', '-3'] });
  assert.equal(wrong.ok, false);
  assert.equal(wrong.results[1].reason, 'wrong');
  const partial = factorAll(factored('y = 12x + 8'), 'right:side', { 0: [2], 1: [2] }, { quotients: ['6x', '4'] });
  assert.equal(tex(partial.equation), 'y=2\\left(6~x+4\\right)');
  assert.equal(isSolvedEquation(partial.equation), false);
  assert.equal(isSolvedEquation({ ...partial.equation, right: '6 * (-x + 2)' }), false);
});

// --- Transient Undo ----------------------------------------------------------------------

test('Undo backs out one decision at a time inside Factor, then closes it', () => {
  const equation = factored('y = 15x - 45');
  const list = findFactorableList(equation, 'right:side');
  let tool = openStructureTool('factor', equation);
  tool = toggleFactorTerm(tool, equation, 'right:side', 0).state;
  tool = toggleFactorTerm(tool, equation, 'right:side', 1).state;
  tool = exposeFactorTokens(tool, equation).state;
  const fifteen = factorTokensForTerm(list.terms[0].signedText);
  tool = toggleFactorToken(tool, equation, 0, fifteen.findIndex((token) => token.value === 3)).state;
  tool = toggleFactorToken(tool, equation, 0, fifteen.findIndex((token) => token.value === 5)).state;
  const afterTwoPrimes = tool;
  tool = toggleNegativeFactor(tool).state;
  // Undo the chosen negative (the GCF choice), then the last prime.
  tool = undoStructureTool(tool);
  assert.equal(tool.negate, false);
  assert.deepEqual(tool.chosen, afterTwoPrimes.chosen);
  tool = undoStructureTool(tool);
  assert.deepEqual(tool.chosen[0], [fifteen.findIndex((token) => token.value === 3)], 'the last prime factor was unselected');
  // Keystrokes in one remainder box are one Undo step.
  let pulled = toggleFactorToken(toggleFactorToken(tool, equation, 1, 1).state, equation, 0, fifteen.findIndex((token) => token.value === 5)).state;
  pulled = toggleFactorToken(pulled, equation, 1, 3).state;
  pulled = pullOutCommonFactor(pulled, equation).state;
  assert.equal(pulled.phase, 'quotients');
  let typed = setFactorQuotient(pulled, 0, 'x');
  typed = setFactorQuotient(typed, 0, 'x+');
  typed = setFactorQuotient(typed, 0, 'x');
  assert.equal(undoStructureTool(typed).quotients[0], undefined);
  assert.equal(undoStructureTool(undoStructureTool(typed)).phase, 'factor', 'the next Undo returns to choosing the factor');
  // Unwinding everything closes the tool.
  let unwind = typed;
  for (let guard = 0; guard < 50 && unwind; guard += 1) unwind = undoStructureTool(unwind);
  assert.equal(unwind, null);
});

test('Undo removes the last denominator placement, and the last cancelled pair', () => {
  const equation = slope('5x + 2y = 6');
  const divided = move(move(equation, 'subtract', '5x'), 'divide', '2');
  let tool = openStructureTool('split', divided);
  tool = armSplitDenominator(tool, divided);
  tool = placeSplitDenominator(tool, divided, 0);
  tool = placeSplitDenominator(tool, divided, 1);
  assert.deepEqual(tool.placed, [0, 1]);
  tool = undoStructureTool(tool);
  assert.deepEqual(tool.placed, [0]);
  assert.equal(tool.armed, true, 'the denominator is still in hand for the next placement');

  const fraction = { left: 'y', right: '12 / 8', variable: 'y', objective: { kind: 'slopeIntercept', variable: 'y' } };
  let reduce = chooseReductionFraction(openStructureTool('reduce', fraction), fraction, 'right:0');
  reduce = tapReductionToken(reduce, fraction, 'numerator', 0).state;
  reduce = tapReductionToken(reduce, fraction, 'denominator', 0).state;
  reduce = tapReductionToken(reduce, fraction, 'numerator', 1).state;
  reduce = tapReductionToken(reduce, fraction, 'denominator', 1).state;
  assert.equal(reduce.pairs.length, 2);
  reduce = undoStructureTool(reduce);
  assert.equal(reduce.pairs.length, 1);
  assert.deepEqual(reduce.pending, { row: 'numerator', index: 1 }, 'the half of the pair chosen first is still held');
  reduce = undoStructureTool(reduce);
  assert.equal(reduce.pending, null);
});

test('Undo takes back one swap in Arrange terms', () => {
  const equation = { left: 'y', right: '3 - 5 x / 2', variable: 'y', objective: { kind: 'slopeIntercept', variable: 'y' } };
  let tool = openStructureTool('arrange', equation);
  tool = tapArrangeTerm(tool, equation, 'right', 0);
  tool = tapArrangeTerm(tool, equation, 'right', 1);
  assert.equal(arrangementChanged(tool), true);
  tool = undoStructureTool(tool);
  assert.equal(arrangementChanged(tool), false);
  assert.equal(tool.selected, 0);
});

// --- Persistence -----------------------------------------------------------------------

const draftWith = (equation, structureTool, extra = {}) => JSON.parse(JSON.stringify({
  algebraDraftVersion: ALGEBRA_DRAFT_VERSION,
  equation,
  structureTool,
  ...extra,
}));

test('a partly completed factoring survives a draft round-trip and can be finished', () => {
  const equation = factored('y = 15x - 45');
  let tool = openStructureTool('factor', equation);
  tool = toggleFactorTerm(tool, equation, 'right:side', 0).state;
  tool = toggleFactorTerm(tool, equation, 'right:side', 1).state;
  tool = exposeFactorTokens(tool, equation).state;
  tool = toggleFactorToken(tool, equation, 0, 0).state; // 3 of 15x
  tool = toggleFactorToken(tool, equation, 1, 1).state; // 3 of -45
  const restored = rehydrateAlgebraDraft({ draft: draftWith(equation, tool), initialEquation: equation });
  assert.deepEqual(restored.structureTool.chosen, tool.chosen);
  assert.equal(restored.structureTool.undoStack.length, tool.undoStack.length, 'Undo history inside the tool comes back too');
  let resumed = pullOutCommonFactor(restored.structureTool, restored.equation).state;
  resumed = setFactorQuotient(resumed, 0, '5x');
  resumed = setFactorQuotient(resumed, 1, '-15');
  const result = commitStructureTool(resumed, restored.equation);
  assert.equal(tex(result.equation), 'y=3\\left(5~x-15\\right)');
});

test('a partly completed fraction split survives a draft round-trip', () => {
  const equation = move(move(slope('5x + 2y = 6'), 'subtract', '5x'), 'divide', '2');
  let tool = openStructureTool('split', equation);
  tool = placeSplitDenominator(armSplitDenominator(tool, equation), equation, 0);
  const restored = rehydrateAlgebraDraft({ draft: draftWith(equation, tool), initialEquation: equation });
  assert.deepEqual(restored.structureTool.placed, [0]);
  const finished = placeSplitDenominator(restored.structureTool, restored.equation, 1);
  assert.equal(commitStructureTool(finished, restored.equation).ok, true);
});

test('completed work restores, and an open tool never leaks onto different mathematics', () => {
  const equation = factored('y = 15x - 45');
  const tool = openStructureTool('factor', equation);
  const committedStep = {
    kind: 'factor',
    description: 'Factored 15 from the right side',
    parts: ['Factored ', { latex: '15' }, ' from the right side'],
    before: { left: 'y', right: '15x - 45' },
    after: { left: 'y', right: '15 * (x - 3)' },
  };
  const after = { ...equation, right: '15 * (x - 3)' };
  const restored = rehydrateAlgebraDraft({ draft: draftWith(after, null, { workSteps: [committedStep, { junk: true }] }), initialEquation: equation });
  assert.deepEqual(restored.equation, after);
  assert.deepEqual(restored.workSteps, [committedStep], 'well-formed history comes back; malformed entries do not');

  // A tool recorded against another question's (or an older) equation is dropped.
  const otherQuestion = factored('y = 6x + 18');
  assert.equal(rehydrateAlgebraDraft({ draft: draftWith(otherQuestion, tool), initialEquation: otherQuestion }).structureTool, null);
  assert.equal(sanitizeStructureTool({ ...tool, kind: 'mystery' }, equation), null);
  assert.equal(sanitizeStructureTool(tool, after), null);
  // An engine upgrade clears undecided choices but keeps committed history.
  const upgraded = rehydrateAlgebraDraft({ draft: { ...draftWith(equation, tool, { workSteps: [committedStep] }), algebraDraftVersion: ALGEBRA_DRAFT_VERSION - 1 }, initialEquation: equation });
  assert.equal(upgraded.structureTool, null);
  assert.deepEqual(upgraded.workSteps, [committedStep]);
});

// --- Presentation ------------------------------------------------------------------------

test('history renders as classroom algebra: no \\cdot, no MathJS syntax, exact fractions', () => {
  const states = [
    { left: 'y', right: '15 * (x - 3)' },
    { left: 'y', right: '3 * (5 * (x - 3))' },
    { left: 'y', right: '((6) - (5 x)) / (2)' },
    { left: 'y', right: '6 / 2 - 5 x / 2' },
    { left: 'y', right: '-(5/2) * x + 3' },
    { left: 'y', right: '20/9 x - 1' },
    { left: '-(5 x) + (6)', right: '6 * (-1 * (x - 2))' },
  ];
  states.forEach((state) => {
    const latex = equationToLatex(state);
    assert.doesNotMatch(latex, /\\cdot|\*|\[object|undefined/, latex);
    assert.doesNotMatch(latex, /\d\.\d/, `a decimal appeared: ${latex}`);
    assert.doesNotMatch(latex, /\\frac\{\\left\(/, `a bracket inside a fraction bar: ${latex}`);
  });
  assert.equal(expressionToLatex('20/9').replace(/\s+/g, ''), '\\frac{20}{9}');
  assert.equal(expressionToLatex('-(5/2)*x + 3').replace(/\s+/g, ''), '-\\frac{5}{2}x+3', 'a negative rational coefficient stays in front of x');
  assert.equal(expressionToLatex('-(5 x) + (6)').replace(/\s+/g, ''), '-5~x+6');
  assert.equal(expressionToLatex('((6) - (5 x)) / (2)').replace(/\s+/g, ''), '\\frac{6-5~x}{2}');
  // Grouping that means something stays: a factor against a group, a number
  // against a number, a negative after a minus, a sum after a minus.
  assert.equal(expressionToLatex('3 * (20 / 9)').replace(/\s+/g, ''), '3\\left(\\frac{20}{9}\\right)');
  assert.equal(expressionToLatex('(8) - (-3)').replace(/\s+/g, ''), '8-\\left(-3\\right)');
  assert.equal(expressionToLatex('(6) - (x + 1)').replace(/\s+/g, ''), '6-\\left(x+1\\right)');
});

test('each structure tool records a described step for the work history', () => {
  const equation = move(move(slope('5x + 2y = 6'), 'subtract', '5x'), 'divide', '2');
  const splitResult = split(equation);
  assert.equal(splitResult.step.description, 'Split the numerator across the denominator');
  const { steps } = reduceAll(splitResult.equation);
  assert.deepEqual(steps.map((step) => step.description), ['Cancelled common factors on the right side']);
  assert.ok(steps[0].parts.some((part) => typeof part === 'object' && /\\frac\{6\}\{2\}/.test(part.latex)));
  const factor = factorAll(factored('y = 15x - 45'), 'right:side', { 0: [3, 5], 1: [3, 5] }, { quotients: ['x', '-3'] });
  assert.equal(factor.step.description, 'Factored 15 from the right side');
  assert.deepEqual(factor.step.parts, ['Factored ', { latex: '15' }, ' from the right side']);
});
