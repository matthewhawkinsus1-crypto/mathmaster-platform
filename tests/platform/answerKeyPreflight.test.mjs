// PRE-FLIGHT ADVICE ON ANSWER KEYS THAT MAY NOT BE GRADED THE WAY THEY READ.
//
// GR04: a plain-text power in brackets over a divisor, `2^(x-1)/3`, reads two
// ways: (2^(x−1))/3 by the usual order of operations, or 2^((x−1)/3). The
// renderer draws such a key as the second and the grader follows the drawing;
// the owner kept that reading, and asked for a lint so no new key is written
// that way by accident.
//
// Advisory: Pre-Flight shows it in its own panel, never as a readiness
// warning (a warning makes the assignment Needs Review, a draft students never
// see), and it never blocks a publish.

import test from 'node:test';
import assert from 'node:assert/strict';
import { ambiguousPowerOverDivisor, auditAssignmentAnswerKeys } from '../../src/platform/preflight/answerKeyPreflight.js';
import { buildAssignmentV5PreflightModel } from '../../src/platform/preflight/assignmentV5PreflightModel.js';
import { stackDivisions } from '../../functions/shared/stackDivisions.mjs';
import { sameValue } from '../../functions/shared/answerEquivalence.mjs';
import { componentSource, executableSource, region } from './helpers/sourceContract.mjs';

const AMBIGUOUS = ['2^(x-1)/3', 'e^(-x)/2', '10^-3/2', 'y=2^-x/3', 'x^(1/2)/4', 'x^(n+1)/(n+1)', '2^(x)/3', 'P=100(2)^-t/5', '2 ^ (x - 1) / 3'];
const PLAIN = ['(2^(x-1))/3', '2^((x-1)/3)', '2^{x-1}/3', '\\frac{2^{x-1}}{3}', '2^(x-1)', 'x^2/3', 'x^{-1}/2', '96/2^(n-1)', '3/x^-2', '4*(2)^(n-1)', 'x^2-1/x^2+x'];

test('a power in brackets, or a bare negative power, right before a "/" is found; a written grouping is not', () => {
  for (const key of AMBIGUOUS) {
    assert.ok(ambiguousPowerOverDivisor(key), key);
    // The renderer does put the division in the exponent, which is why the
    // key is worth a second look (stackDivisions.mjs, the owner's GR04 reading).
    assert.match(stackDivisions(key), /\^\s*-?\\frac/, `${key} is drawn with the division in the exponent`);
  }
  for (const key of PLAIN) assert.equal(ambiguousPowerOverDivisor(key), null, key);
  assert.equal(ambiguousPowerOverDivisor('10^−3/2')?.exponent, '−3', 'a typographic minus too');
  assert.deepEqual(ambiguousPowerOverDivisor('2^(x-1)/3'), { base: '2', power: '^(x-1)', exponent: 'x-1', divisor: '3' });
  assert.deepEqual(ambiguousPowerOverDivisor('x^(2)/x^(3)'), { base: 'x', power: '^(2)', exponent: '2', divisor: 'x^(3)' });
});

test('the kept reading: such a key is graded as it is drawn', () => {
  assert.equal(sameValue('2^\\frac{x-1}{3}', '2^(x-1)/3'), true);
  assert.equal(sameValue('\\frac{2^{x-1}}{3}', '2^(x-1)/3'), false);
  // Written with the grouping meant, either reading is unambiguous.
  assert.equal(sameValue('\\frac{2^{x-1}}{3}', '(2^(x-1))/3'), true);
  assert.equal(sameValue('2^{\\frac{x-1}{3}}', '2^((x-1)/3)'), true);
});

test('each typed key is read, with both readings written out; a choice and a retired question are not', () => {
  const { warnings } = auditAssignmentAnswerKeys([
    { type: 'multiAnswer', answerFields: [
      { id: 'f', label: 'f(x)', answer: '2^(x-1)/3' },
      { id: 'pick', label: 'Pick one', type: 'choice', options: ['2^(x-1)/3', '2^x'], answer: '2^(x-1)/3' },
      { id: 'g', answer: '5', acceptedAnswers: ['10^-3/2'] },
    ] },
    { type: 'literal', solveFor: 'y', acceptedAnswers: ['x^(n+1)/(n+1)'] },
    { type: 'table', table: { answers: { r1c2: 'e^(-x)/2', r2c2: '4' } } },
    { type: 'multiAnswer', teacherExcluded: true, answerFields: [{ id: 'h', answer: '2^(x-1)/3' }] },
    { type: 'multiAnswer', answerFields: [{ id: 'k', label: 'Plain', answer: '(2^(x-1))/3', acceptedAnswers: ['2^{x-1}/3'] }] },
  ]);
  assert.deepEqual(warnings, [
    'Question 1 (f(x)): the answer "2^(x-1)/3" can be read two ways: (2^(x-1))/3 or 2^((x-1)/3). Write it with the brackets you mean, so students are graded against that one.',
    'Question 1: the answer "10^-3/2" can be read two ways: (10^-3)/2 or 10^(-3/2). Write it with the brackets you mean, so students are graded against that one.',
    'Question 2: the answer "x^(n+1)/(n+1)" can be read two ways: (x^(n+1))/(n+1) or x^((n+1)/(n+1)). Write it with the brackets you mean, so students are graded against that one.',
    'Question 3 (table cell r1c2): the answer "e^(-x)/2" can be read two ways: (e^(-x))/2 or e^(-x/2). Write it with the brackets you mean, so students are graded against that one.',
  ]);
});

const assignmentWith = (answer) => ({
  schemaVersion: 5,
  assignment: { title: 'Answer key advice', courseId: 'algebra2', instructionalPurpose: 'lesson', gradingPurpose: 'practice' },
  sections: [{
    id: 'practice',
    role: 'practice',
    title: 'Practice',
    questions: [{
      type: 'multiAnswer',
      prompt: 'Write the function.',
      answerFields: [{ id: 'f', label: 'f(x)', answer }],
      alignments: [{ framework: 'teks', code: '2A.5A', role: 'primary', evidenceLevel: 'assessed' }],
    }],
  }],
});

test('Pre-Flight carries the advice in its own group: never a readiness warning, never a block', () => {
  const flagged = buildAssignmentV5PreflightModel(assignmentWith('2^(x-1)/3'));
  const plain = buildAssignmentV5PreflightModel(assignmentWith('(2^(x-1))/3'));
  assert.equal(flagged.answerKeys.warnings.length, 1);
  assert.match(flagged.answerKeys.warnings[0], /^Question 1 \(f\(x\)\): the answer "2\^\(x-1\)\/3" can be read two ways/);
  assert.deepEqual(plain.answerKeys.warnings, []);
  // The readiness the advice must not change.
  assert.ok(!flagged.warnings.some((warning) => /can be read two ways/.test(warning)));
  assert.deepEqual(flagged.errors, plain.errors);
  assert.deepEqual(flagged.warnings, plain.warnings);
  assert.equal(flagged.isValid, plain.isValid);
  assert.deepEqual(flagged.authoringState, plain.authoringState);
});

test('the Pre-Flight screen shows the advice in its own panel, saying it does not stop publishing', () => {
  const modal = executableSource(componentSource('src/components/teacher/LessonPreflightModal.jsx'));
  const panel = region(modal, '{preflightModel.answerKeys?.warnings?.length > 0 && (', '\n      )}', 'the answer-key panel');
  assert.match(panel, />Answer keys to check</);
  assert.match(panel, /preflightModel\.answerKeys\.warnings\.map\(\(warning\) => <li key=\{warning\}>\{warning\}<\/li>\)/);
  assert.match(panel, /This does not stop you publishing\./);
});
