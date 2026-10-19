// A 2×2 BACK-SUBSTITUTION ENDS ON THE STUDENT'S OWN NUMBER.
//
// After solving for one variable, the student substitutes it back. For
// y = −4x + 12 with x = 5 the equation is y = −4(5) + 12: y is already
// isolated, so the embedded Step Algebra called it solved and the workspace
// carried "y = −4(5) + 12" forward without the student ever computing y.
// The 3×3 subsystem already required a simplified final form (#341); the
// 2×2 back-substitution now does too.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseEquationInput, isSolvedEquation } from '../../functions/shared/algebra/algebraAstEngine.mjs';
import { executableSource, region } from '../platform/helpers/sourceContract.mjs';

test('with a simplified final form required, an isolated but uncomputed value is not solved', () => {
  const solved = (equation, strict) => isSolvedEquation(parseEquationInput({ equation, solveFor: 'y', ...(strict ? { requireSimplifiedFinalForm: true } : {}) }));
  // The defect: without the requirement the uncomputed value counts as solved.
  assert.equal(solved('y = -4(5) + 12', false), true);
  // With it, only the student's own simplified number finishes the step.
  assert.equal(solved('y = -4(5) + 12', true), false);
  assert.equal(solved('y = -20 + 12', true), false);
  assert.equal(solved('y = -8', true), true);
  // A fractional value is a finished number in the engine's own spelling;
  // an unreduced one is not.
  assert.equal(solved('y = 1/2', true), true);
  assert.equal(solved('y = -3/4', true), true);
  assert.equal(solved('y = 2/4', true), false);
});

test('the 2×2 back-substitution solver always asks for the simplified final form', () => {
  const source = executableSource(readFileSync(new URL('../../src/tools/systemsWorkspace/AlgebraicSystemMode.jsx', import.meta.url), 'utf8'));
  const backSub = region(source, 'label="Solve the back-substitution equation"', '/>', 'the back-substitution solver');
  assert.match(backSub, /^\s*requireSimplifiedFinalForm\s*$/m, 'required unconditionally, not only for a 3×3 subsystem');
  assert.doesNotMatch(backSub, /requireSimplifiedFinalForm=\{Boolean\(subsystem\)\}/);
});
