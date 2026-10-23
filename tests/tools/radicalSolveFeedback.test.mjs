// A WRONG RADICAL-EQUATION SOLVE NAMES THE FIRST STEP TO FIX.
//
// Walkthrough 2026-10-23, Solving Radical Equations CW 1: √(y − 2) = 4 for
// √(y − 2) − 1 = 5 crossed out steps 1, 2, 3 and 5 under "Not yet — fix the
// steps marked below." The student squared and solved their own equation
// correctly; only step 1 was the slip.
import test from 'node:test';
import assert from 'node:assert/strict';
import { gradeToolCheck } from '../../src/tools/shared/sharedToolGrading.js';
import signSolutionGrader from '../../functions/shared/serverGrading/tools/signSolutionAnalyzer.mjs';
import { RADICAL_SOLVE_RETRY, radicalSolveMissMessage } from '../../src/tools/signSolutionAnalyzer/radicalSolveFeedback.js';

const item = { mode: 'radicalSolve', radicalEquation: { variable: 'y', radicand: { m: 1, b: -2 }, outside: -1, rhs: { m: 0, b: 5 } } };
const right = { isolated: '6', raised: '36', candidates: '38', rows: [{ left: '5', right: '5', decision: 'solution' }], finalAnswer: '38', noRealSolution: false };
const message = (work) => radicalSolveMissMessage({ parts: gradeToolCheck(signSolutionGrader, item, work).parts, variable: 'y' });

test('the fixture is a right solve', () => {
  assert.equal(gradeToolCheck(signSolutionGrader, item, right).isCorrect, true);
});

test('a step-1 slip is told to start at step 1, not that four steps are wrong', () => {
  const slip = message({ isolated: '4', raised: '16', candidates: '18', rows: [{ left: '3', right: '5', decision: 'extraneous' }], finalAnswer: '', noRealSolution: true });
  assert.match(slip, /^Start with step 1, isolating the radical/);
  assert.match(slip, /The steps after it follow from it, so fix this one first\.$/);
  assert.doesNotMatch(slip, /\b(6|36|38)\b/, 'no value from the key');
});

test('each later step is named when it is the first one off', () => {
  assert.match(message({ ...right, raised: '35', candidates: '37', rows: [{ left: '√35 − 1', right: '5', decision: 'extraneous' }], finalAnswer: '', noRealSolution: true }), /^Check step 2/);
  assert.match(message({ ...right, candidates: '34', rows: [{ left: '√32 − 1', right: '5', decision: 'extraneous' }], finalAnswer: '', noRealSolution: true }), /^Check step 3: solve the raised equation for y/);
  assert.match(message({ ...right, rows: [{ left: '5', right: '5', decision: 'extraneous' }], finalAnswer: '', noRealSolution: true }), /^Check step 4/);
  assert.match(message({ ...right, finalAnswer: '36' }), /^Your steps are right\./);
  assert.equal(radicalSolveMissMessage({ parts: [] }), RADICAL_SOLVE_RETRY);
});

test('on a DOL, quiz or test (method withheld) the message only points at the marks', () => {
  const parts = gradeToolCheck(signSolutionGrader, item, { ...right, isolated: '4' }).parts;
  assert.equal(radicalSolveMissMessage({ parts, variable: 'y', methodWithheld: true }), RADICAL_SOLVE_RETRY);
});

// Solving Radical Equations PR 7 (walkthrough 2026-10-23): the check view wrote
// √(3x + 4) = x as "√(3x + 4) = 1x + 0".
test('the radical check writes its equation as on paper', async () => {
  const { readFileSync } = await import('node:fs');
  const { linearReadout } = await import('../../src/tools/signSolutionAnalyzer/radicalSolveReadout.js');
  assert.equal(`√(${linearReadout(3, 4)}) = ${linearReadout(1, 0)}`, '√(3x + 4) = x');
  const view = readFileSync(new URL('../../src/tools/signSolutionAnalyzer/SignSolutionAnalyzer.jsx', import.meta.url), 'utf8');
  const line = view.split('\n').find((text) => text.includes('const equationText ='));
  assert.match(line, /linearReadout\(spec\.radicand\?\.m \?\? 1, spec\.radicand\?\.b \?\? 0\)\}\) = \$\{linearReadout\(spec\.rhs\?\.m \?\? 0, spec\.rhs\?\.b \?\? 0\)\}/);
});
