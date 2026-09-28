/*
 * DAY 1 3×3 SYSTEMS — V5 FINAL ASSIGNMENT (ISSUE #388).
 *
 * The repo copy of the Day 1 lesson students receive. It is the live Day 1
 * content (captured in tests/browser/day1SystemsJourneyQuestions.json) with
 * the FINAL authoring corrections: a 3D representation question opened early
 * must not hand a student the numeric answer to the solve it follows.
 *   - CW3 no longer prints CW2's (3, 1, 5) and cannot reveal the point.
 *   - PR4 stands alone and cannot reveal PR3's point.
 *   - DOL2 asks what a common point means, never naming DOL1's (1, −2, 4).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildAssignmentV5PreflightModel } from '../../src/platform/preflight/assignmentV5PreflightModel.js';
import { classifyLinearSystem, linearEquationForm } from '../../src/tools/systemsWorkspace/algebraicSystemsEngine.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const lesson = JSON.parse(fs.readFileSync(path.resolve(here, '../../docs/assignments/Algebra_II_Honors_3x3_Systems_Day1_V5_FINAL.json'), 'utf8'));
const questions = lesson.sections.flatMap((section) => section.questions);
const byId = (id) => questions.find((question) => question.questionId === id);
const solutionOf = (question) => classifyLinearSystem(
  question.equations.map((equation) => linearEquationForm(equation, question.variables)),
  question.variables,
);
// The triple as a student could read it: "(3, 1, 5)", "3,1,5", "(1, −2, 4)".
const signed = (n) => (n < 0 ? `[-−]\\s*${-n}` : `${n}`);
const tripleText = ({ x, y, z }) => new RegExp(`${signed(x)}\\s*,\\s*${signed(y)}\\s*,\\s*${signed(z)}`);

test('Day 1 FINAL passes Assignment V5 preflight with zero blocking errors', () => {
  const preflight = buildAssignmentV5PreflightModel(lesson);
  assert.deepEqual(preflight.errors, []);
  assert.equal(preflight.isValid, true);
});

test('Day 1 keeps its 13-question, 8/20/48/12-minute structure', () => {
  assert.deepEqual(lesson.sections.map((section) => section.role), ['warmup', 'classwork', 'practice', 'dol']);
  assert.deepEqual(lesson.sections.map((section) => section.questions.length), [2, 3, 6, 2]);
  assert.deepEqual(lesson.sections.map((section) => section.recommendedMinutes), [8, 20, 48, 12]);
  const dol = lesson.sections[3];
  assert.equal(dol.attemptsAllowed, 1);
  assert.equal(dol.hintsAllowed, false);
});

test('Warm-Up is 2×2 prerequisite work; DOL1 is the independent 3×3 elimination solve; the CCMR bridge stays', () => {
  for (const question of lesson.sections[0].questions) assert.deepEqual(question.variables, ['x', 'y']);
  const dol1 = byId('3x3-d1-dol-1');
  assert.equal(dol1.mode, 'algebraic');
  assert.equal(dol1.method, 'elimination');
  assert.equal(dol1.requireVerification, true);
  assert.deepEqual(solutionOf(dol1).solution, { x: 1, y: -2, z: 4 });
  assert.ok(byId('3x3-d1-pr-6-ccmr-bridge'), 'the CCMR bridge question is present');
});

for (const [spatialId, solveId] of [['3x3-d1-cw-3', '3x3-d1-cw-2'], ['3x3-d1-pr-4', '3x3-d1-pr-3'], ['3x3-d1-dol-2', '3x3-d1-dol-1']]) {
  test(`${spatialId} cannot leak ${solveId}'s answer: no reveal and no printed triple`, () => {
    const spatial = byId(spatialId);
    const solution = solutionOf(byId(solveId));
    assert.equal(solution.type, 'unique');
    assert.equal(spatial.mode, 'spatial');
    assert.equal(spatial.spatialModel.allowSolutionReveal, false);
    assert.notEqual(spatial.spatialModel.revealSolution, true);
    assert.doesNotMatch(JSON.stringify(spatial), tripleText(solution.solution));
  });
}

test('PR4 stands alone and DOL2 asks the generic meaning of a common point', () => {
  assert.doesNotMatch(byId('3x3-d1-pr-4').prompt, /just solved|previous|PR ?3/i);
  const dol2 = byId('3x3-d1-dol-2');
  const [field] = dol2.answerFields;
  assert.ok(field.options.includes(field.answer));
  assert.match(field.answer, /all three equations true/);
});

test('the no-leak check can fail: a printed triple is caught', () => {
  assert.match('reveal the solution point (1, -2, 4)', tripleText({ x: 1, y: -2, z: 4 }));
  assert.match('how the point (3, 1, 5) connects', tripleText({ x: 3, y: 1, z: 5 }));
  assert.match('the point (1, −2, 4)', tripleText({ x: 1, y: -2, z: 4 }));
});
