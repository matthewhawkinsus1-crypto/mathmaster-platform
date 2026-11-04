/*
 * AN INEQUALITY SYSTEM THE WORKSPACE WOULD NOT DRAW IS REFUSED AT PRE-FLIGHT.
 *
 * The Systems Workspace's analyze form — an inequality question with no
 * studentBuild, reasoning or modeling — draws, grades and explains the
 * question's `inequalities` and nothing else: ClassicInequalityMode draws
 * `questionData.inequalities || DEFAULT_INEQUALITIES`, the server's
 * legacyInequalities grades the same list, and the worked solution reads it.
 * A question that gave only `expectedConstraints` (the student-build field)
 * therefore showed and graded the built-in demo system, a different question
 * from the one authored — and Pre-Flight passed it with no warning.
 *
 * This holds the refusal at the tool contract and through a teacher import,
 * and holds that the two shapes that ARE drawn — `inequalities` in the analyze
 * form, and `expectedConstraints` with student-build reasoning — still pass.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { compileTeacherImport } from '../../scripts/check-teacher-import.mjs';
import { validateToolQuestion } from '../../src/tools/toolSchemas.js';

const DEMO_TRAP = /analyze form draws and grades `inequalities`/;

const emma = (extra) => ({
  questionId: 'emma',
  standard: 'A.3H',
  alignments: [{ framework: 'teks', code: 'A.3H', role: 'primary' }],
  studentActions: ['solveInequalitySystem'],
  dok: 2,
  difficultyBand: 3,
  mode: 'inequalities',
  prompt: 'Emma has at most 45 minutes and wants to burn at least 400 calories. Is 10 minutes light and 30 minutes vigorous a solution?',
  testPoint: { x: 10, y: 30 },
  graph: { xMin: 0, xMax: 60, yMin: 0, yMax: 50 },
  ...extra,
});
const STANDARD_FORM = [{ A: 1, B: 1, C: -45, relation: '<=' }, { A: 6.9, B: 10.4, C: -400, relation: '>=' }];
const SLOPE_INTERCEPT = [{ m: -1, b: 45, relation: '<=' }, { m: -6.9 / 10.4, b: 400 / 10.4, relation: '>=' }];

const toolErrors = (question) => validateToolQuestion({ ...question, toolId: 'systemsWorkspace' }).errors;
const lesson = (question) => JSON.stringify({
  schemaVersion: 5,
  assignment: { title: 'Emma', courseId: 'algebra1', folder: 'Tests', instructionalPurpose: 'lesson', gradingPurpose: 'classwork' },
  sections: [{ id: 'classwork', role: 'classwork', title: 'Classwork', questions: [question] }],
});

test('an analyze-form inequality system given only expectedConstraints is refused', () => {
  const question = emma({ expectedConstraints: STANDARD_FORM });
  assert.ok(toolErrors(question).some((error) => DEMO_TRAP.test(error)), 'the tool contract names the field the workspace draws');
  const { model } = compileTeacherImport(lesson(question));
  assert.equal(model.isValid, false, 'a teacher import does not pass it');
  assert.ok(model.errors.some((error) => DEMO_TRAP.test(error)), model.errors.join('\n'));
});

test('the analyze form with `inequalities` still passes', () => {
  const question = emma({ inequalities: SLOPE_INTERCEPT });
  assert.equal(toolErrors(question).some((error) => DEMO_TRAP.test(error)), false);
  const { model } = compileTeacherImport(lesson(question));
  assert.equal(model.isValid, true, model.errors.join('\n'));
});

test('expectedConstraints with student-build reasoning still pass: that workspace draws them', () => {
  const question = emma({
    sourceConstraints: ['x + y <= 45', '6.9x + 10.4y >= 400'],
    expectedConstraints: STANDARD_FORM,
    studentBuild: { rewrite: false, boundary: false, lineStyle: false, shading: false },
    reasoning: { testPoint: true, classifyRegion: false, vertices: false },
  });
  assert.equal(toolErrors(question).some((error) => DEMO_TRAP.test(error)), false);
  const { model } = compileTeacherImport(lesson(question));
  assert.equal(model.isValid, true, model.errors.join('\n'));
});
