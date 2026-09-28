/*
 * DAY 2 3×3 SYSTEMS ASSIGNMENT ACCEPTANCE SUITE (ISSUE #371).
 *
 * Verifies the Day 2 Algebra II Honors lesson:
 *   - Strategy, classification & 3-variable modeling without inverse matrices.
 *   - Continuous Systems Workspace integration (spatial 3D and algebraic elimination).
 *   - Formulations and non-unique system interpretation (0 = 0 and 0 = k).
 *   - Full preflight model validation (structural, semantic, tool contract, pacing).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildAssignmentV5PreflightModel } from '../../src/platform/preflight/assignmentV5PreflightModel.js';
import { validateToolQuestion } from '../../src/tools/toolSchemas.js';
import { resolveSystemsWorkspaceMode } from '../../src/tools/systemsWorkspace/systemsWorkspaceMode.js';
import {
  algebraicSystemDimension,
  classifyLinearSystem,
  linearEquationForm,
  normalizeAlgebraicSystemConfig,
  validateAlgebraicSystemAuthoring,
} from '../../src/tools/systemsWorkspace/algebraicSystemsEngine.js';

const here = path.dirname(fileURLToPath(import.meta.url));
// The FINAL file is the one teachers import (#392); the V5 working copy must match it.
const jsonPath = path.resolve(here, '../../docs/assignments/Algebra_II_Honors_3x3_Systems_Day2_V5_FINAL.json');
const rawLesson = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

test('Day 2 lesson passes Assignment V5 preflight with zero blocking errors', () => {
  const preflight = buildAssignmentV5PreflightModel(rawLesson);
  assert.equal(preflight.isValid, true, `Preflight errors: ${preflight.errors.join(' | ')}`);
  assert.deepEqual(preflight.errors, []);
});

test('Day 2 lesson structure adheres to the 90-minute honors block guidelines', () => {
  const sections = rawLesson.sections;
  assert.equal(sections.length, 4);

  const [wu, cw, pr, dol] = sections;
  // Warm-Up: exactly 2 questions
  assert.equal(wu.role, 'warmup');
  assert.equal(wu.questions.length, 2);

  // #390 merges the dependent algebra and geometry into one continuous task.
  assert.equal(cw.role, 'classwork');
  assert.equal(cw.questions.length, 2);
  assert.equal(sections.reduce((sum, section) => sum + section.recommendedMinutes, 0), 86);

  // Practice: 7 questions (carries most independent work)
  assert.equal(pr.role, 'practice');
  assert.ok(pr.questions.length >= 5 && pr.questions.length <= 7);

  // DOL: exactly 2 questions
  assert.equal(dol.role, 'dol');
  assert.equal(dol.questions.length, 2);
  assert.equal(dol.attemptsAllowed, 1);
});

test('Day 2 uses the exact source systems specified in issue #371', () => {
  const questions = rawLesson.sections.flatMap((section) => section.questions);

  // 1. Unique system: 5x + 3y + 2z = 2, 2x + y - z = 5, x + 4y + 2z = 16 (solution: -2, 6, -3)
  const cwSolve = questions.find((q) => q.questionId === '3x3-d2-cw-3');
  assert.ok(cwSolve);
  assert.deepEqual(cwSolve.variables, ['x', 'y', 'z']);
  const cwForms = cwSolve.equations.map((eq) => linearEquationForm(eq, ['x', 'y', 'z']));
  const cwClass = classifyLinearSystem(cwForms, ['x', 'y', 'z']);
  assert.equal(cwClass.type, 'unique');
  assert.deepEqual(cwClass.solution, { x: -2, y: 6, z: -3 });

  // 2. Alternate unique system: x + y - z = -1, x + y + z = 3, 3x - 2y - z = -4 (solution: 0, 1, 2)
  const prSolve = questions.find((q) => q.questionId === '3x3-d2-pr-1');
  assert.ok(prSolve);
  const prForms = prSolve.equations.map((eq) => linearEquationForm(eq, ['x', 'y', 'z']));
  const prClass = classifyLinearSystem(prForms, ['x', 'y', 'z']);
  assert.equal(prClass.type, 'unique');
  assert.deepEqual(prClass.solution, { x: 0, y: 1, z: 2 });

  // 3. Infinite-solution system: 2x + y - 3z = 5, x + 2y - 4z = 7, 6x + 3y - 9z = 15
  const infSpatial = questions.find((q) => q.questionId === '3x3-d2-cw-1');
  assert.ok(infSpatial);
  const infForms = infSpatial.equations.map((eq) => linearEquationForm(eq, ['x', 'y', 'z']));
  assert.equal(classifyLinearSystem(infForms, ['x', 'y', 'z']).type, 'infinite');

  // 4. No-solution system: 3x - y - 2z = 4, 6x - 2y - 4z = 11, 9x - 3y - 6z = 12
  const noSpatial = questions.find((q) => q.questionId === '3x3-d2-pr-2');
  assert.ok(noSpatial);
  const noForms = noSpatial.equations.map((eq) => linearEquationForm(eq, ['x', 'y', 'z']));
  assert.equal(classifyLinearSystem(noForms, ['x', 'y', 'z']).type, 'none');

  // 5. Triangle modeling system: s + m - l = 8, -3s + m + l = 4, s + m + l = 72 (solution: s=17, m=23, l=32)
  const triSolve = questions.find((q) => q.questionId === '3x3-d2-pr-6');
  assert.ok(triSolve);
  assert.deepEqual(triSolve.variables, ['s', 'm', 'l']);
  const triForms = triSolve.equations.map((eq) => linearEquationForm(eq, ['s', 'm', 'l']));
  const triClass = classifyLinearSystem(triForms, ['s', 'm', 'l']);
  assert.equal(triClass.type, 'unique');
  assert.deepEqual(triClass.solution, { s: 17, m: 23, l: 32 });
});

test('Day 2 preserves reveal timing, strategy agency, and correct no-solution geometry', () => {
  const questions = rawLesson.sections.flatMap((section) => section.questions);
  const byId = (id) => questions.find((q) => q.questionId === id);

  const warmup = byId('3x3-d2-wu-1');
  assert.doesNotMatch(warmup.prompt, /\(0,\s*1,\s*2\)/);
  assert.ok(warmup.answerFields[0].options.every((option) => !/\(0,\s*1,\s*2\)/.test(option)));

  const guided = byId('3x3-d2-cw-3');
  assert.doesNotMatch(guided.prompt, /-2,\s*6,\s*-3/);

  const independent = byId('3x3-d2-pr-1');
  assert.doesNotMatch(independent.prompt, /adding the first two|eliminate z directly/i);

  const spatial = byId('3x3-d2-pr-2');
  assert.equal(spatial.mode, 'algebraic');
  assert.equal(spatial.method, 'elimination');
  // Import compiles from studentActions, not `type`: connectRepresentations
  // without a spatialModel compiles to a representationMatch card sort (#392).
  assert.deepEqual(spatial.studentActions, ['solveSystem']);
  const forms = spatial.equations.map((equation) => linearEquationForm(equation, ['x', 'y', 'z']));
  assert.deepEqual(forms[2].coefficients, Object.fromEntries(Object.entries(forms[0].coefficients).map(([v,n]) => [v,3*n])));
  assert.equal(forms[2].constant, forms[0].constant * 3);
  assert.equal(forms[1].constant - forms[0].constant * 2, 3);
  assert.equal(spatial.answerFields, undefined, 'classification is earned through elimination');

  const modelSolve = byId('3x3-d2-pr-6');
  assert.doesNotMatch(modelSolve.prompt, /notice that Equation 1 has -l|making l straightforward to eliminate/i);
});

test('Every systemsWorkspace question validates under toolSchemas without regressions', () => {
  const toolQuestions = rawLesson.sections
    .flatMap((section) => section.questions)
    .filter((q) => q.type === 'systemsWorkspace');
  assert.ok(toolQuestions.length >= 5);
  toolQuestions.forEach((q) => {
    const result = validateToolQuestion(q);
    assert.equal(result.isValid, true, `Question ${q.questionId} invalid: ${result.errors.join(' | ')}`);
  });
});
