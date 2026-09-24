/*
 * ISSUE #341: TWO STEP ALGEBRA ENGINE CONTRACTS THE 3×3 WORKFLOW RESTS ON.
 *
 * 1. The linear standard-form objective. A reduction asks Step Algebra to take
 *    2(6 - y - z) - y + 3z = 9 to the form ay + bz = c. The engine only
 *    RECOGNISES the finished form; every step to it is the student's.
 *
 * 2. A term's text must read back as the same term. After distributing, the
 *    product (2)(-y) used to print as "2 -y", which parses as the SUBTRACTION
 *    2 - y. A correct rewrite to -2y was rejected as "not equivalent", and
 *    rewriting any OTHER term silently turned (2)(-y) into 2 - y. Found by the
 *    3×3 browser certification; the 2×2 hit it whenever a substituted
 *    expression had a negative term.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { parse } from 'mathjs';
import {
  equationToLatex,
  expressionsEquivalent,
  isLinearStandardFormEquation,
  isSolvedEquation,
  parseEquationInput,
  splitAdditiveTerms,
} from '../../src/algebraAstEngine.js';
import { replaceSelectedLikeTerms, replaceSingleAdditiveTerm } from '../../src/algebraLikeTermsModel.js';
import { componentSource, executableSource } from './helpers/sourceContract.mjs';

const YZ = ['y', 'z'];

test('the finished standard form is recognised in any orientation and order', () => {
  [
    ['-3 * y + z', '-3'],
    ['z - 3y', '-3'],
    ['-3', '-3y + z'],
    ['5 * y', '10'],
    ['y', '2'],
    ['1/2 * y + z', '3'],
    ['y / 3 + z', '1'],
    ['-y - 4 z', '-14'],
  ].forEach(([left, right]) => assert.equal(isLinearStandardFormEquation({ left, right }, YZ), true, `${left} = ${right}`));
});

test('unfinished work is not standard form — the student still has a step to take', () => {
  [
    ['2 * (6 - y - z) - y + 3z', '9', 'an undistributed group'],
    ['(2)(-y) + (2)(-z) + (2)(6) - y + 3z', '9', 'products not yet simplified'],
    ['12 - 3y + z', '9', 'a constant on the variable side'],
    ['-2y - y + z', '-3', 'like terms not combined'],
    ['-3y + z', '9 - 12', 'the constant side not simplified'],
    ['-3y + z', '-6/2', 'a fraction not reduced'],
    ['0 * y + z', '1', 'a zero coefficient left in'],
    ['x + y', '1', 'a variable that is not in this system'],
  ].forEach(([left, right, why]) => assert.equal(isLinearStandardFormEquation({ left, right }, YZ), false, why));
});

test('the objective drives isSolvedEquation, and every other objective keeps its exact shape', () => {
  const equation = parseEquationInput({
    equation: '2 * (6 - y - z) - y + 3 * z = 9',
    solveFor: 'y',
    objective: { kind: 'linearStandardForm', variable: 'y', variables: YZ },
  });
  assert.deepEqual(equation.objective.variables, YZ);
  assert.equal(isSolvedEquation(equation), false);
  assert.equal(isSolvedEquation({ ...equation, left: '-3 y + z', right: '-3' }), true);
  // y = 2 isolates y, but it is only finished for the isolate objective when y is alone.
  assert.equal(isSolvedEquation({ ...equation, left: 'y', right: '-3 + 3 z' }), false);
  // No `variables` key is added to the objectives that never had one.
  assert.deepEqual(Object.keys(parseEquationInput({ equation: 'x + 1 = 2' }).objective).sort(), ['kind', 'requireSimplifiedFinalForm', 'simplifyRequired', 'targetForm', 'variable']);
});

test('Step Algebra names the form as its target, never the coefficients', () => {
  const core = executableSource(componentSource('src/StepByStepAlgebraCore.jsx'));
  assert.match(core, /: equation\.objective\?\.kind === 'linearStandardForm'\s*\?\s*`Target: \$\{\(equation\.objective\.variables/);
  assert.match(core, /equation\.objective\?\.kind === 'linearStandardForm' \? 'Write in standard form'/);
});

test('every additive term text reads back as the same term', () => {
  const sides = [
    '(2) (-y) + (2) (-z) + (2) (6) - y + 3 * z',
    '(3)(-3) + (3)(2 y) + 5 y',
    '-y + (-4)(-3) + (-4)(3 * y)',
    '(2/3)(-x) + 1',
    '5 x - 3 + x',
  ];
  sides.forEach((side) => {
    const terms = splitAdditiveTerms(side);
    // Rewrite, like-term and placement code rebuild a side exactly like this.
    const rebuilt = terms.map((term) => term.text).join(' ');
    assert.doesNotThrow(() => parse(rebuilt), rebuilt);
    assert.equal(expressionsEquivalent(rebuilt, side, 'y'), true, `${side} rebuilt as ${rebuilt}`);
  });
  // The familiar hidden form is kept wherever it is already unambiguous.
  assert.deepEqual(splitAdditiveTerms('5 x - 3 + x').map((term) => term.text), ['5 x', '- 3', '+ x']);
  assert.deepEqual(splitAdditiveTerms('(2) (-y) + 1').map((term) => term.text), ['2 (-y)', '+ 1']);
});

test('rewriting a distributed product is judged on the real product, and never corrupts its neighbours', () => {
  const side = '(2) (-y) + (2) (-z) + (2) (6) - y + 3 * z';
  const [first] = splitAdditiveTerms(side);
  assert.equal(expressionsEquivalent(first.text, '-2y', 'y'), true, 'a correct rewrite of (2)(-y) must be accepted');
  assert.equal(expressionsEquivalent(first.text, '2 - y', 'y'), false);

  const afterThird = replaceSingleAdditiveTerm(side, 2, '12');
  assert.ok(expressionsEquivalent(afterThird, '-2y - 2z + 12 - y + 3z', 'y'), `rewriting (2)(6) changed another term: ${afterThird}`);
  const afterFirst = replaceSingleAdditiveTerm(side, 0, '-2y');
  assert.ok(expressionsEquivalent(afterFirst, '-2y - 2z + 12 - y + 3z', 'y'), afterFirst);
  // And it displays as written: 2(-z), never 2(-z + … the rest of the side).
  assert.doesNotMatch(equationToLatex({ left: afterFirst, right: '9' }), /2~?\\left\(- z\+/);

  const combined = replaceSelectedLikeTerms('-2 y + 2 (-z) + 12 - y + 3 * z', [0, 3], '-3y');
  assert.ok(expressionsEquivalent(combined, '-3y - 2z + 12 + 3z', 'y'), combined);
});
