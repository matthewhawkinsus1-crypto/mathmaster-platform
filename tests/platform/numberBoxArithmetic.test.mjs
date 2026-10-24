// GR01: A NUMBER BOX TAKES THE VALUE, NOT THE CALCULATION (the owner, 2026-10-23).
//
// `64 − 6` was right for 58 and `1+2` for 3 in every number box: the
// expanded-polynomial comparison worked the calculation out, so a student
// could copy the computation instead of doing it. A number box now refuses a
// calculation unless its field says `allowArithmetic: true`
// (answerEquivalence looksLikeArithmetic / fieldAllowsArithmetic).
//
// Every number-field grader is asked: the secure close (secureItems.gradeItem),
// the Path and Live Challenge field grader (mathPath.gradeResponse), the
// assignment matcher (answerUtils.matchesFieldAnswer) and the teacher's Path
// simulation, whose grading definition is legacyFieldGrading's and whose
// comparison is sameValue with fieldValueOptions (teacherPathRuntime; node
// cannot run the whole runtime, so its definition and options are run here).

import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fieldValueOptions, looksLikeArithmetic, sameValue } from '../../functions/shared/answerEquivalence.mjs';
import { matchesFieldAnswer } from '../../functions/shared/answerUtils.mjs';
import { buildFieldGradingDefinition } from '../../functions/shared/legacyFieldGrading.mjs';
import { formatProblemForResponse } from '../../src/platform/interaction/answerShapeGuard.js';
import { validateQuestionGradingContracts } from '../../src/platform/grading/gradingContract.js';
import { buildAuthoringContract } from '../../src/platform/contract/authoringContract.js';

const require = createRequire(import.meta.url);
const mathPath = require('../../functions/lib/mathPath.js');
const secureItems = require('../../functions/lib/secureItems.js');
const { bankDocumentToV5Intent } = require('../../functions/lib/ccmrAssignmentBank.js');

/** [secure, path/live, simulation, assignment] for one number field. */
const verdicts = async (response, expected, extra = {}) => {
  const field = { id: 'answer', inputProfile: 'number', expected, ...extra };
  const definition = mathPath.privateGradingDefinition({ responseFields: [field] });
  const secure = (await secureItems.gradeItem(definition, { responses: { answer: response } })).isCorrect === true;
  const path = (await mathPath.gradeResponse(definition, { responses: { answer: response } })).isCorrect === true;
  const simulated = buildFieldGradingDefinition({ responseFields: [field] }).fields[0];
  const simulation = sameValue(response, expected, simulated.numericTolerance, fieldValueOptions(simulated));
  const assignment = matchesFieldAnswer(response, { id: 'answer', inputProfile: 'number', answer: expected, ...extra });
  return [secure, path, simulation, assignment];
};
const ALL_RIGHT = [true, true, true, true];
const ALL_WRONG = [false, false, false, false];

const CALCULATIONS = [
  ['64 − 6', '58'], ['64-6', '58'], ['1+2', '3'], ['2*29', '58'], ['2\\cdot29', '58'], ['2(29)', '58'],
  ['(2)(29)', '58'], ['60-2', '58'], ['58+0', '58'], ['3^2', '9'], ['0.5+0.25', '0.75'],
  ['\\frac{1}{2}+\\frac{1}{4}', '3/4'], ['\\frac{\\frac{1}{2}}{3}', '1/6'],
];

test('a number box refuses a calculation worth its key, on every grader', async () => {
  for (const [response, key] of CALCULATIONS) {
    assert.equal(looksLikeArithmetic(response), true, `${response} is a calculation`);
    assert.deepEqual(await verdicts(response, key), ALL_WRONG, `${response} for ${key}`);
  }
});

test('a number field that opts in with allowArithmetic takes the calculation, on every grader', async () => {
  for (const [response, key] of CALCULATIONS) {
    assert.deepEqual(await verdicts(response, key, { allowArithmetic: true }), ALL_RIGHT, `${response} for ${key}, allowArithmetic`);
  }
  // Stored with the issued item, so a stored item grades as it was issued.
  const stored = mathPath.privateGradingDefinition({ responseFields: [{ id: 'a', inputProfile: 'number', expected: '58', allowArithmetic: true }] });
  assert.equal(stored.fields[0].allowArithmetic, true);
  assert.equal('allowArithmetic' in mathPath.privateGradingDefinition({ responseFields: [{ id: 'a', inputProfile: 'number', expected: '58' }] }).fields[0], false);
  // A Digital SAT bank item hydrated into an assignment keeps the opt-in.
  const document = { id: 'x', responseFields: [{ id: 'answer', inputProfile: 'number', expected: '58', allowArithmetic: true }] };
  assert.equal(bankDocumentToV5Intent(document).answerFields[0].allowArithmetic, true);
  assert.equal('allowArithmetic' in bankDocumentToV5Intent({ ...document, responseFields: [{ id: 'answer', inputProfile: 'number', expected: '58' }] }).answerFields[0], false);
});

test('every way of writing ONE number keeps its verdict: a fraction, a sign, a decimal, a percent, a mixed number, separators, scientific notation', async () => {
  const oneNumber = [
    ['58', '58'], ['+58', '58'], ['(58)', '58'], ['-5', '-5'], ['(-5)', '-5'], ['-(5)', '-5'], ['−5', '-5'],
    ['3/4', '0.75'], ['\\frac{3}{4}', '0.75'], ['-\\frac{3}{4}', '-0.75'], ['\\frac{-3}{4}', '-0.75'], ['+3/4', '3/4'],
    ['6/8', '3/4'], ['12/4', '3'], ['116/2', '58'], ['\\frac{1.5}{2}', '0.75'],
    ['58.0', '58'], ['.5', '0.5'], ['25%', '25'], ['25\\%', '25'], ['$12.50', '12.5'],
    ['3\\frac{1}{2}', '7/2'], ['3 1/2', '3.5'], ['-3\\frac{1}{2}', '-3.5'],
    ['8,050', '8050'], ['8{,}050', '8050'], ['-8,050', '-8050'],
    ['1.2\\times10^{3}', '1200'], ['1.2\\cdot10^{3}', '1200'], ['-1.2\\times10^{3}', '-1200'], ['10^{3}', '1000'], ['1e3', '1000'],
    ['x=58', '58'],
  ];
  for (const [response, key] of oneNumber) {
    assert.equal(looksLikeArithmetic(response), false, `${response} is one number`);
    assert.deepEqual(await verdicts(response, key), ALL_RIGHT, `${response} for ${key}`);
  }
  // A root, π or a letter is not a calculation with numbers: the exact
  // constant's own rules (W6-6) keep deciding.
  for (const value of ['\\sqrt{2}', '1+\\sqrt{2}', '2\\pi', '\\frac{\\sqrt{8}}{2}', '2x+1', 'x=64-6', '1,2']) {
    assert.equal(looksLikeArithmetic(value), false, value);
  }
  assert.deepEqual(await verdicts('\\sqrt{2}', 'sqrt(8)/2'), ALL_RIGHT);
  assert.deepEqual(await verdicts('1+\\sqrt{2}', '1+sqrt(2)'), ALL_RIGHT);
});

test('no right value turns wrong: a key written as a calculation still takes its value', async () => {
  // Only the student's calculation is refused; the value of an unworked key
  // is still read (the repository has none in a number box; the two SAT
  // drafts that had one are keyed as values now).
  assert.deepEqual(await verdicts('58', '64-6'), ALL_RIGHT);
  assert.deepEqual(await verdicts('64-6', '64-6'), ALL_WRONG, 'the unworked key itself is a calculation');
  assert.deepEqual(await verdicts('64-6', '64-6', { allowArithmetic: true }), ALL_RIGHT);
  // Only a number box: an expression or equation field reads as before.
  assert.equal(matchesFieldAnswer('64-6', { answer: '58', inputProfile: 'expression' }), true);
  assert.equal(matchesFieldAnswer('x=64-6', { answer: 'x=58', inputProfile: 'equation' }), true);
  assert.equal(sameValue('1+2', '3'), true, 'sameValue without a field keeps its reading');
});

test('the number box says to write the value, not the calculation, before a try is spent', () => {
  const field = { id: 'answer', inputProfile: 'number', answer: '58' };
  const reason = formatProblemForResponse(field, '64 − 6');
  assert.match(reason, /value, not the calculation/);
  assert.doesNotMatch(reason, /\d/, 'a fixed sentence: nothing from the key');
  assert.equal(formatProblemForResponse(field, '60-2'), reason, 'right or wrong, the same sentence');
  assert.equal(formatProblemForResponse(field, '58'), '');
  assert.equal(formatProblemForResponse(field, '6/8'), '');
  assert.equal(formatProblemForResponse(field, '3 1/2'), '');
  assert.equal(formatProblemForResponse({ ...field, allowArithmetic: true }, '64-6'), '', 'never held back where it is accepted');
  assert.equal(formatProblemForResponse({ id: 'e', inputProfile: 'expression', answer: '58' }, '64-6'), '');
});

test('Pre-Flight names both fixes for a number field keyed as a calculation; the contract documents allowArithmetic', () => {
  const question = (field) => ({ type: 'multiAnswer', prompt: 'How many are left?', answerFields: [{ id: 'answer', label: 'Left', inputProfile: 'number', ...field }] });
  const keyed = validateQuestionGradingContracts(question({ answer: '64-6' }));
  assert.ok(keyed.errors.some((error) => /is a calculation/.test(error) && /allowArithmetic/.test(error)), keyed.errors.join('\n'));
  assert.ok(validateQuestionGradingContracts(question({ answer: '58', acceptedAnswers: ['64-6'] })).errors.some((error) => /is a calculation/.test(error)));
  assert.deepEqual(validateQuestionGradingContracts(question({ answer: '58' })).errors, []);
  assert.deepEqual(validateQuestionGradingContracts(question({ answer: '64-6', allowArithmetic: true })).errors, []);
  assert.match(buildAuthoringContract({ generatedAt: new Date('2026-10-23T00:00:00Z') }), /"allowArithmetic": true/);
});
