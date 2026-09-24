import test from 'node:test';
import assert from 'node:assert/strict';
import { equationToLatex, expressionsEquivalent } from '../../src/algebraAstEngine.js';
import {
  armSplitDenominator,
  detectSplittableFractions,
  findSplittableFraction,
  openFractionSplit,
  placeSplitDenominator,
} from '../../src/algebraFractionSplitModel.js';
import {
  chooseReductionFraction,
  detectReducibleFractions,
  findReducibleFraction,
  openFractionReduction,
  tapReductionToken,
} from '../../src/algebraFractionReductionModel.js';
import { commitStructureTool } from '../../src/algebraStructureTools.js';

const line = (right) => ({ left: 'y', right, variable: 'y', objective: { kind: 'slopeIntercept', variable: 'y', requireSimplifiedFinalForm: true } });
const tex = (equation) => equationToLatex(equation).replace(/\s+/g, '');

/** Pick up the denominator and place it under every numerator term, in order. */
const splitLikeAStudent = (equation) => {
  let state = openFractionSplit(equation);
  const candidate = findSplittableFraction(equation, state.candidateId);
  assert.ok(candidate, 'expected one splittable fraction');
  state = armSplitDenominator(state, equation);
  candidate.numeratorTerms.forEach((_, index) => { state = placeSplitDenominator(state, equation, index); });
  return commitStructureTool(state, equation);
};

/** Cancel every matching pair the student can find, two taps per pair. */
const reduceLikeAStudent = (equation, candidateId) => {
  let state = chooseReductionFraction(openFractionReduction(equation), equation, candidateId);
  const candidate = findReducibleFraction(equation, candidateId);
  const usedBelow = new Set();
  candidate.tokens.numerator.forEach((token, index) => {
    if (!token.selectable) return;
    const below = candidate.tokens.denominator.findIndex((other, otherIndex) => !usedBelow.has(otherIndex) && String(other.value) === String(token.value));
    if (below < 0) return;
    usedBelow.add(below);
    state = tapReductionToken(state, equation, 'numerator', index).state;
    const tapped = tapReductionToken(state, equation, 'denominator', below);
    assert.equal(tapped.outcome, 'paired');
    state = tapped.state;
  });
  return commitStructureTool(state, equation);
};

test('(6 - 5x)/2 splits to 6/2 - 5x/2 as stacked exact fractions', () => {
  const equation = line('((6) - (5 x)) / (2)');
  const result = splitLikeAStudent(equation);
  assert.equal(result.ok, true);
  assert.equal(tex(result.equation), 'y=\\frac{6}{2}-\\frac{5~x}{2}');
  assert.equal(result.step.description, 'Split the numerator across the denominator');
  assert.ok(expressionsEquivalent(equation.right, result.equation.right, 'x'));
  assert.doesNotMatch(result.equation.right, /2\.5|0\.5/);
});

test('(8x + 12)/4 splits and each fraction reduces to 2x + 3', () => {
  let equation = splitLikeAStudent(line('(8x + 12) / 4')).equation;
  assert.equal(tex(equation), 'y=\\frac{8~x}{4}+\\frac{12}{4}');
  while (detectReducibleFractions(equation).length) {
    equation = reduceLikeAStudent(equation, detectReducibleFractions(equation)[0].id).equation;
  }
  assert.equal(tex(equation), 'y=2~x+3');
});

test('(-6x + 9)/3 keeps the leading negative in front of its fraction', () => {
  const result = splitLikeAStudent(line('(-6x + 9) / 3'));
  assert.equal(tex(result.equation), 'y=-\\frac{6~x}{3}+\\frac{9}{3}');
  assert.ok(expressionsEquivalent('(-6x + 9) / 3', result.equation.right, 'x'));
});

test('a negative denominator splits under every term and never invents a negative', () => {
  let equation = splitLikeAStudent(line('((8) - (2 x)) / (-4)')).equation;
  assert.equal(tex(equation), 'y=\\frac{8}{-4}-\\frac{2~x}{-4}');
  // 8/(-4): the student cancels 2 and 2; the lone -1 below the bar is written in front.
  // -(2x)/(-4): the term's own sign is a -1 factor above the bar, cancelled against the -1 below.
  const tokens = detectReducibleFractions(equation).map((candidate) => [
    candidate.tokens.numerator.map((token) => token.latex).join(' '),
    candidate.tokens.denominator.map((token) => token.latex).join(' '),
  ]);
  assert.deepEqual(tokens, [['2 2 2', '-1 2 2'], ['-1 2 x', '-1 2 2']]);
  while (detectReducibleFractions(equation).length) {
    equation = reduceLikeAStudent(equation, detectReducibleFractions(equation)[0].id).equation;
  }
  assert.equal(tex(equation), 'y=-2+\\frac{x}{2}');
  assert.ok(expressionsEquivalent('(8 - 2x)/(-4)', equation.right, 'x'));
});

test('a rational denominator splits exactly', () => {
  const result = splitLikeAStudent(line('(6 - 5x) / (1/2)'));
  assert.equal(result.ok, true);
  assert.equal(tex(result.equation), 'y=\\frac{6}{\\frac{1}{2}}-\\frac{5~x}{\\frac{1}{2}}');
  assert.ok(expressionsEquivalent('(6 - 5x) / (1/2)', result.equation.right, 'x'));
});

test('structurally invalid splits are never offered', () => {
  for (const right of ['6 / (2 + x)', '(6 - 5x) / x', '5x / 2', '6 - 5x', '(6 - 5x) / 0', '(6 - 5x)(2)']) {
    assert.deepEqual(detectSplittableFractions(line(right)), [], right);
  }
});

test('the split is placed by the student: an incomplete split cannot commit, and placements need the denominator picked up', () => {
  const equation = line('((6) - (5 x)) / (2)');
  let state = openFractionSplit(equation);
  assert.deepEqual(placeSplitDenominator(state, equation, 0).placed, [], 'nothing placed before pick-up');
  state = armSplitDenominator(state, equation);
  state = placeSplitDenominator(state, equation, 0);
  assert.deepEqual(state.placed, [0]);
  assert.equal(commitStructureTool(state, equation).ok, false);
});

test('6/2 reduces to 3 by cancelling a 2; 5x/2 is not offered and never becomes 2.5x', () => {
  const equation = line('6 / 2 - 5 x / 2');
  const reducible = detectReducibleFractions(equation);
  assert.deepEqual(reducible.map((candidate) => candidate.id), ['right:0']);
  assert.deepEqual(reducible[0].tokens.numerator.map((token) => token.value), [2, 3]);
  assert.deepEqual(reducible[0].tokens.denominator.map((token) => token.value), [2]);
  const result = reduceLikeAStudent(equation, 'right:0');
  assert.equal(tex(result.equation), 'y=3-\\frac{5~x}{2}');
  assert.doesNotMatch(tex(result.equation), /2\.5/);
});

test('20/9 stays exact when irreducible', () => {
  assert.deepEqual(detectReducibleFractions(line('20/9 x - 1')), []);
  assert.deepEqual(detectReducibleFractions(line('20 / 9')), []);
  assert.equal(tex(line('20 / 9')), 'y=\\frac{20}{9}');
  assert.doesNotMatch(tex(line('20/9 x - 1')), /2\.22/);
});

test('10x/4 -> 5x/2 after the student cancels one pair of 2s', () => {
  const result = reduceLikeAStudent(line('10 x / 4'), 'right:0');
  assert.equal(tex(result.equation), 'y=\\frac{5~x}{2}');
});

test('cancellation is student-driven: mismatches are refused and nothing cancels on its own', () => {
  const equation = line('12 / 8');
  let state = chooseReductionFraction(openFractionReduction(equation), equation, 'right:0');
  const candidate = findReducibleFraction(equation, 'right:0');
  assert.deepEqual(candidate.tokens.numerator.map((token) => token.value), [2, 2, 3]);
  assert.equal(commitStructureTool(state, equation).ok, false, 'no pair chosen yet');
  state = tapReductionToken(state, equation, 'numerator', 2).state; // hold the 3
  const mismatch = tapReductionToken(state, equation, 'denominator', 0); // tap a 2
  assert.equal(mismatch.outcome, 'mismatch');
  assert.equal(mismatch.state.pairs.length, 0);
  // Cancel just one pair: a partial reduction is still valid.
  state = tapReductionToken(state, equation, 'numerator', 0).state;
  state = tapReductionToken(state, equation, 'denominator', 0).state;
  assert.equal(state.pairs.length, 1);
  const result = commitStructureTool(state, equation);
  assert.equal(tex(result.equation), 'y=\\frac{6}{4}');
});

test('negative signs are preserved, and a double negative is not produced', () => {
  // -6x/(-3): the student cancels the -1 pair and the 3 pair.
  const result = reduceLikeAStudent(line('-6 x / (-3) + 9 / (-3)'), 'right:0');
  assert.equal(tex(result.equation), 'y=2~x+\\frac{9}{-3}');
  const finished = reduceLikeAStudent(result.equation, 'right:1');
  assert.equal(tex(finished.equation), 'y=2~x-3');
  assert.doesNotMatch(finished.equation.right, /--|\+\s*-|-\s*-/);
});
