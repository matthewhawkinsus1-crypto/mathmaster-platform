import test from 'node:test';
import assert from 'node:assert/strict';

import { compileAuthoringIntentV5 } from '../../src/platform/contract/authoringIntentV5.js';
import { inspectHonorsRigor } from '../../src/platform/rigor/courseRigor.js';
import { analyzeSectionBalanceRigor } from '../../src/platform/quality/sectionBalanceRigor.js';

/*
 * A GRAPHING2 STANDARD-FORM QUESTION'S CURRICULUM CODE IS ITS primaryStandard.
 *
 * Since 2a the compiled question keeps the line Ax + By = C as
 * `standard: {A, B, C}`, so the curriculum code lives in primaryStandard.
 * The honors and section-balance audits read `standard` first and, finding an
 * object, never reached primaryStandard: the question counted as having no
 * TEKS. They now read `standard` only when it is a code.
 */

const compileClasswork = (question) => compileAuthoringIntentV5({
  schemaVersion: 5,
  assignment: { title: 'K standard-form code', courseId: 'algebra1' },
  sections: [{ role: 'classwork', title: 'Classwork', questions: [question] }],
}).package.sections[0].questions[0];

const standardFormLine = () => compileClasswork({
  prompt: 'Graph 2x + 3y = 12.', studentActions: ['constructLine'], standard: 'A.3C', standardForm: { A: 2, B: 3, C: 12 },
});

test('the compiled standard-form question is the shape the audits must read', () => {
  const question = standardFormLine();
  assert.equal(question.type, 'graphing2');
  assert.deepEqual(question.standard, { A: 2, B: 3, C: 12 });
  assert.equal(question.primaryStandard, 'A.3C');
});

test('honors rigor: a standard-form line counts its primaryStandard as core TEKS', () => {
  assert.equal(inspectHonorsRigor([standardFormLine()]).checks.coreTeks, true);
  // Unchanged: a code in `standard` still counts, and an object with no code anywhere does not.
  assert.equal(inspectHonorsRigor([{ type: 'multiAnswer', standard: 'A.3C' }]).checks.coreTeks, true);
  assert.equal(inspectHonorsRigor([{ type: 'graphing2', standard: { A: 2, B: 3, C: 12 } }]).checks.coreTeks, false);
});

const bundle = (classwork, practice) => ({
  sections: [
    { role: 'classwork', questions: classwork },
    { role: 'practice', questions: practice },
  ],
});

test('section balance: a standard-form line is filed under its primaryStandard code', () => {
  const line = standardFormLine();
  const result = analyzeSectionBalanceRigor(bundle([line], [{ ...line }]));
  assert.deepEqual(result.classwork.standards, ['A.3C']);
  assert.deepEqual(result.practice.standards, ['A.3C']);
  assert.equal(result.issues.some((entry) => entry.id === 'objective-coverage'), false);

  // Unchanged: a code in `standard` wins over primaryStandard.
  const coded = analyzeSectionBalanceRigor(bundle([{ type: 'multiAnswer', standard: 'A.5A', primaryStandard: 'A.3C' }], [{ type: 'multiAnswer', standard: 'A.5A' }]));
  assert.deepEqual(coded.classwork.standards, ['A.5A']);
});
