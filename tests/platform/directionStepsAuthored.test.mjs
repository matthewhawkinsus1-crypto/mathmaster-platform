/*
 * AN ITEM'S OWN "BREAK IT DOWN" STEPS REACH THE STUDENT.
 *
 * A student whose plan gives chunked directions (support
 * `chunked-directions`) sees an item's directions as short numbered steps
 * (src/platform/language/directionChunks.js). The steps an author writes with
 * the item, `directionSteps`, come first; only without them does the
 * rule-based split of the prompt's own sentences take over.
 *
 * The V5 compiler copies the fields a question keeps onto the renderer
 * contract one by one (authoringIntentV5Core.js copyCommon), and
 * `directionSteps` was not among them: an authored step list was dropped on
 * import, so no student ever saw one. This holds the field through the whole
 * teacher import, for a rich tool and for a typed item, and holds that what
 * arrives is what the chunker uses.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { compileTeacherImport } from '../../scripts/check-teacher-import.mjs';
import { chunkDirections } from '../../src/platform/language/directionChunks.js';

const lesson = (questions) => JSON.stringify({
  schemaVersion: 5,
  assignment: { title: 'Break it down', courseId: 'algebra1', folder: 'Tests', instructionalPurpose: 'lesson', gradingPurpose: 'classwork' },
  sections: [{ id: 'classwork', role: 'classwork', title: 'Classwork', questions }],
});

const typed = {
  questionId: 'steps-typed',
  standard: 'A.2H',
  alignments: [{ framework: 'teks', code: 'A.2H', role: 'primary' }],
  studentActions: ['multipleResponses'],
  dok: 2,
  difficultyBand: 2,
  prompt: 'Kai scores two-point shots and three-point shots and wants at least 20 points. Write the inequality, then decide whether 7 two-point shots and 2 three-point shots meet the goal.',
  directionSteps: [
    'Write the inequality for at least 20 points.',
    'Find the points for 7 two-point shots and 2 three-point shots.',
    'Decide whether that total meets the goal.',
  ],
  responses: [
    { id: 'inequality', label: 'Inequality', answer: '2x + 3y >= 20', inputProfile: 'inequality' },
    { id: 'total', label: 'Total points', answer: '20', inputProfile: 'number' },
  ],
};

const tool = {
  questionId: 'steps-tool',
  standard: 'A.3D',
  alignments: [{ framework: 'teks', code: 'A.3D', role: 'primary' }],
  studentActions: ['solveInequalitySystem'],
  dok: 2,
  difficultyBand: 2,
  mode: 'inequalities',
  prompt: 'Graph the solution set of $y > x + 3$. Build the boundary line, choose solid or dashed, and shade the half-plane of solutions.',
  // A step may not bring in mathematics the item does not state (the chunker
  // refuses "the boundary line y = x + 3" here: the prompt says y > x + 3).
  directionSteps: [
    'Build the boundary line.',
    'Choose solid or dashed.',
    'Shade the half-plane of solutions for $y > x + 3$.',
  ],
  sourceConstraints: ['y > x + 3'],
  expectedConstraints: [{ m: 1, b: 3, relation: '>' }],
  studentBuild: { boundary: true, lineStyle: true, shading: true },
  graph: { xMin: -10, xMax: 10, yMin: -10, yMax: 10 },
};

test('authored directionSteps survive the teacher import on a typed item and on a rich tool', () => {
  const { model, questions } = compileTeacherImport(lesson([typed, tool]));
  assert.equal(model.isValid, true, model.errors.join('\n'));
  const byId = new Map(questions.map((question) => [question.questionId, question]));
  assert.equal(byId.get('steps-typed').type, 'multiAnswer');
  assert.equal(byId.get('steps-tool').type, 'systemsWorkspace');
  assert.deepEqual(byId.get('steps-typed').directionSteps, typed.directionSteps);
  assert.deepEqual(byId.get('steps-tool').directionSteps, tool.directionSteps);
});

test('the steps that arrive are the ones Break it down shows, not the rule-based split', () => {
  const { questions } = compileTeacherImport(lesson([typed, tool]));
  for (const question of questions) {
    const chunks = chunkDirections(question.prompt, { authoredSteps: question.directionSteps });
    assert.equal(chunks?.source, 'authored', question.questionId);
    assert.deepEqual(chunks.steps.map((step) => step.text), question.directionSteps);
  }
});

test('an item with no directionSteps compiles exactly as before (no field is invented)', () => {
  const { directionSteps: _steps, ...plain } = typed;
  const { questions } = compileTeacherImport(lesson([plain]));
  assert.equal(Object.hasOwn(questions[0], 'directionSteps'), false);
});
