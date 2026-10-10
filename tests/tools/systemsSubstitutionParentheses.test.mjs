// SUBSTITUTING INTO A "+" TERM KEEPS THE PARENTHESES THE STUDENT SEES.
//
// Step Algebra's term renderer flattens a parenthesised group inside a sum,
// so substituting y = −2x + 1 into x + y = 5 showed the student
// "x − 2x + 1 = 5": the group they had just substituted into was gone, and
// with it the step of removing it. A subtracted variable already became
// −1(…) for the same reason (#341); an added one now becomes 1(…).
import test from 'node:test';
import assert from 'node:assert/strict';
import { splitAdditiveTerms } from '../../functions/shared/algebra/algebraAstEngine.mjs';
import {
  linearEquationForm, linearFormsEquivalent, normalizeEquationForStepAlgebra, substituteIntoEquation,
} from '../../functions/shared/toolMath/systemsWorkspace/algebraicSystemsEngine.mjs';

const shownTerms = (equation, side = 0) => splitAdditiveTerms(normalizeEquationForStepAlgebra(equation).split('=')[side]).map((term) => term.latex || term.text);

test('a multi-term value substituted for an added variable stays one visible group, wherever it lands', () => {
  [
    ['x + y = 5', 'y', '-2x + 1', ['x', '+ 1\\left(-2x+1\\right)']],
    ['5 + y = x', 'y', '2x - 3', ['5', '+ 1\\left(2x-3\\right)']],
    ['2x + y = 5', 'y', '-2x + 1', ['2x', '+ 1\\left(-2x+1\\right)']],
  ].forEach(([equation, variable, value, terms]) => {
    assert.deepEqual(shownTerms(substituteIntoEquation(equation, variable, value)), terms, equation);
  });
  // A leading added variable: the group is the first term.
  const leading = shownTerms(substituteIntoEquation('y + 2x = 5', 'y', '-2x + 1'));
  assert.equal(leading.length, 2);
  assert.match(leading[0], /\\left\(-2x\+1\\right\)/);
});

test('it is the same equation, single terms are untouched, and a coefficient keeps its own product', () => {
  const substituted = substituteIntoEquation('x + y = 5', 'y', '-2x + 1');
  assert.ok(linearFormsEquivalent(linearEquationForm(substituted, ['x', 'y']), linearEquationForm('x + (-2x + 1) = 5', ['x', 'y']), ['x', 'y']));
  assert.equal(substituteIntoEquation('x + y = 10', 'x', '2*y'), '(2 * y) + y = 10', 'one term: nothing to keep together');
  assert.equal(substituteIntoEquation('3x + 5y = 24', 'x', '-3 + 2y'), '3 * (-3 + 2 * y) + 5 * y = 24');
  assert.equal(substituteIntoEquation('x - y = 2', 'y', '2x - 3'), 'x - 1 * (2 * x - 3) = 2');
});
