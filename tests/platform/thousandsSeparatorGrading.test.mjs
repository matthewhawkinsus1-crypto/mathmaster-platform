// A correct number typed with a US thousands separator is the same number.
//
// Student experience pass 3, PR-1 / Q-1: `8,050` for a key of 8050 was graded
// wrong and cost the student a try, and a key authored `8,050` rejected a
// student's `8050`. The separator is read as grouping ONLY where one number is
// expected; everywhere a comma separates values (ordered pairs, intervals,
// sets, numericSet / list fields) it keeps meaning "next value".
import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';

import {
  sameNumberWithThousandsSeparators,
  withoutThousandsSeparators,
} from '../../functions/shared/answerEquivalence.mjs';
import { matchesAnyAnswer, matchesFieldAnswer } from '../../functions/shared/answerUtils.mjs';
import {
  gradeLiteralResponse,
  gradeMultiAnswerResponse,
  gradeTableResponse,
} from '../../functions/shared/ordinaryResponseGrading.mjs';

const field = (answer, extra = {}) => ({ id: 'a', answer, ...extra });
const gradeField = (answer, response, extra = {}) => (
  gradeMultiAnswerResponse({ type: 'multiAnswer', answerFields: [field(answer, extra)] }, { a: response })
);

test('a multiAnswer number field accepts a correctly grouped thousands separator', () => {
  for (const [key, response] of [
    ['8050', '8,050'],
    ['8050', '$8,050'],
    ['$8050', '$8,050'],
    ['1234.5', '1,234.5'],
    ['-12000', '-12,000'],
    ['1234567', '1,234,567'],
    // MathLive with a comma decimal separator serializes `{,}`; it must not
    // read as anything other than the grouped number either.
    ['8050', '8{,}050'],
  ]) {
    const graded = gradeField(key, response);
    assert.equal(graded.isCorrect, true, `${response} for key ${key}`);
    assert.equal(graded.parts[0].credit, 1, `${response} for key ${key} earns full credit`);
  }
});

test('a key authored with a separator accepts the plain number, in both directions', () => {
  assert.equal(gradeField('8,050', '8050').isCorrect, true);
  assert.equal(gradeField('$8,050', '8050').isCorrect, true);
  assert.equal(gradeField('8,050', '8,050').isCorrect, true);
  assert.equal(gradeField('1,234.5', '1234.50').isCorrect, true);
});

test('badly grouped input is never read as a number', () => {
  for (const [key, response] of [
    ['8050', '8,05'],
    ['805', '8,05'],
    ['8050', '80,50'],
    ['12345', '1,2345'],
    ['500', '0,500'],
    ['8050', '8,0500'],
  ]) {
    assert.equal(gradeField(key, response).isCorrect, false, `${response} for key ${key}`);
    assert.equal(withoutThousandsSeparators(response), null, `${response} is not a grouped number`);
  }
  // A correct separator does not make a wrong number right, and unit signs
  // keep their meaning.
  assert.equal(gradeField('8050', '8,051').isCorrect, false);
  assert.equal(gradeField('8050%', '$8,050').isCorrect, false);
});

test('literal and table answers are single numbers too', () => {
  assert.equal(gradeLiteralResponse({ acceptedAnswers: ['8050'], solveFor: 'x' }, '8,050').isCorrect, true);
  assert.equal(gradeLiteralResponse({ acceptedAnswers: ['8,050'], solveFor: 'x' }, '8050').isCorrect, true);
  assert.equal(gradeLiteralResponse({ acceptedAnswers: ['8050'], solveFor: 'x' }, '80,50').isCorrect, false);
  const table = { table: { answers: { r1c2: '12000' } } };
  assert.equal(gradeTableResponse(table, { r1c2: '12,000' }).isCorrect, true);
  assert.equal(gradeTableResponse(table, { r1c2: '1,2000' }).isCorrect, false);
});

// A Digital SAT number box reads a correctly grouped number, as live has since
// #496 (wave 6 review, B1: the server re-grades every queued answer, so a box
// that refused it would turn a "Correct!" a student saw into a wrong record
// during a release). The SAT's own decimal rule and the strict grouping stay.
test('a Digital SAT number box accepts a correctly grouped number, as live does', () => {
  const sat = { numberRules: 'digitalSAT' };
  assert.equal(gradeField('8050', '8,050', sat).isCorrect, true);
  assert.equal(gradeField('8050', '8{,}050', sat).isCorrect, true);
  assert.equal(gradeField('8050', '8050', sat).isCorrect, true);
  assert.equal(gradeField('8050', '80,50', sat).isCorrect, false);
  assert.equal(gradeField('8050', '8, 050', sat).isCorrect, false);
  assert.equal(gradeField('8050', '8,051', sat).isCorrect, false);
  assert.equal(gradeField('2/3', '.6666', sat).isCorrect, true, 'the SAT decimal rule still applies');
});

test('commas that separate values keep their meaning', () => {
  // Ordered pairs: `(1,234)` is the point (1, 234), never 1234.
  const pair = { answerFormat: 'orderedPair' };
  assert.equal(gradeField('(1, 234)', '(1,234)', pair).isCorrect, true);
  assert.equal(gradeField('(1, 234)', '1234', pair).isCorrect, false);
  assert.equal(matchesFieldAnswer('(3,4)', field('(3, 4)')), true);
  assert.equal(matchesFieldAnswer('1234', field('1,234', pair)), false);
  // A field that declares its pair only through inputProfile skips the
  // ordered-pair branch, so the separator guard is what keeps it a pair.
  assert.equal(matchesFieldAnswer('1234', field('1,234', { inputProfile: 'orderedPair' })), false);

  // A numericSet list field: `1,234` is the two-element list {1, 234}.
  const numericSet = { equivalence: 'numericSet' };
  assert.equal(gradeField('1,234', '1234', numericSet).isCorrect, false);
  assert.equal(gradeField('1, 234', '1234', numericSet).isCorrect, false);
  assert.equal(gradeField('{1, 234}', '{234, 1}', numericSet).isCorrect, true);
  assert.equal(gradeField('{1, 234}', '1234', numericSet).isCorrect, false);
  for (const format of ['list', 'set', 'interval', 'point', 'coordinates']) {
    assert.equal(gradeField('1,234', '1234', { answerFormat: format }).isCorrect, false, format);
    assert.equal(gradeField('1,234', '1234', { inputProfile: format }).isCorrect, false, format);
  }

  // ...and its element partial credit is unchanged.
  const partial = { equivalence: 'numericSet', partialCredit: 'matchedElements' };
  const graded = gradeField('{1, 2, 3}', '{1, 2}', partial);
  assert.equal(graded.isCorrect, false);
  assert.equal(graded.parts[0].credit, 2 / 3);
  assert.equal(gradeField('{1, 234}', '1234', partial).parts[0].credit, 0);
  // A roster field with element credit is a list even without a declared format.
  assert.equal(gradeField('1,234', '1234', { partialCredit: 'matchedElements' }).isCorrect, false);

  // Intervals.
  assert.equal(gradeField('[2, 5)', '[2,5)').isCorrect, true);
  assert.equal(gradeField('[2, 5)', '25').isCorrect, false);
  assert.equal(gradeField('(1, 234)', '1234', { answerFormat: 'interval' }).isCorrect, false);

  // The generic comparison every list field reaches is still comma-literal.
  assert.equal(matchesAnyAnswer('1234', ['1,234']), false);
  assert.equal(sameNumberWithThousandsSeparators('{1,234}', '1234'), false);
  assert.equal(sameNumberWithThousandsSeparators('(1,234)', '1234'), false);
});

// Batch 3 into pass 3: main's #496 reads a grouped student number inside
// sameValue, so it reaches the Path grader and every other sameValue caller.
// Merged with this file's field rule, a field that is a list or a Digital SAT
// box still never reads `8,050` as one number, on either grader.
// Through what production stores: buildIssuePlan's private grading, which
// keeps each field's kind (inputProfile, answerFormat, notation, toolProfile)
// so a list or a pair stays comma-literal on the Path grader too (wave 6
// review, S1: it kept only `equivalence`, so `1,250` passed a list field).
test('the Path grader reads a grouped number, but not in a list, set or pair field', async () => {
  const mathPath = createRequire(import.meta.url)('../../functions/lib/mathPath.js');
  const grade = async (field, response, question = {}) => {
    const plan = await mathPath.buildIssuePlan({ id: 'tsep', prompt: 'How many?', responseFields: [{ id: 'a', label: 'Answer', ...field }], ...question });
    assert.ok(plan.issuable, JSON.stringify(field));
    return (await mathPath.gradeResponse(plan.privateGrading, { responses: { a: response } })).isCorrect;
  };
  assert.equal(await grade({ expected: '8050', inputProfile: 'number' }, '8,050'), true);
  assert.equal(await grade({ expected: '8050', inputProfile: 'number' }, '$8,050'), true);
  assert.equal(await grade({ expected: '8050', inputProfile: 'number' }, '8,051'), false);
  const sat = { assessmentContext: { framework: 'digitalSAT' } };
  assert.equal(await grade({ expected: '8050', inputProfile: 'number' }, '8,050', sat), true, 'a Digital SAT box, as live');
  assert.equal(await grade({ expected: '8050', inputProfile: 'number' }, '80,50', sat), false);
  for (const kind of [{ inputProfile: 'list' }, { inputProfile: 'set' }, { answerFormat: 'list' }, { notation: 'set' }, { toolProfile: 'orderedPair' }, { inputProfile: 'orderedPair' }]) {
    assert.equal(await grade({ expected: '1250', ...kind }, '1,250'), false, `${JSON.stringify(kind)}: 1,250 is two values`);
    assert.equal(await grade({ expected: '1250', ...kind }, '1250'), true, `${JSON.stringify(kind)}: the key itself`);
  }
  assert.equal(await grade({ expected: '1234', equivalence: 'numericSet' }, '1,234'), false);
  const plan = await mathPath.buildIssuePlan({ id: 'tsep', prompt: 'List them.', responseFields: [{ id: 'a', inputProfile: 'list', expected: '1250' }] });
  assert.equal(plan.privateGrading.fields[0].inputProfile, 'list', 'the field kind is stored with the private grading');
});

test('the assignment matcher keeps a list or roster field comma-literal under #496', () => {
  // Key one number, the student's `1,234`: sameValue alone would now accept it.
  assert.equal(gradeField('1234', '1,234', { equivalence: 'numericSet' }).isCorrect, false);
  assert.equal(gradeField('1234', '1,234', { answerFormat: 'list' }).isCorrect, false);
  assert.equal(gradeField('1234', '1,234', { partialCredit: 'matchedElements' }).isCorrect, false);
  // A comma and a space is a list of two numbers, never one (#496's rule; the
  // pass-3 matcher used to accept `1, 250` for 1250). The owner confirmed it
  // (GR02).
  assert.equal(gradeField('1250', '1, 250').isCorrect, false);
  assert.equal(withoutThousandsSeparators('1, 250'), null);
  assert.equal(gradeField('1250', '1,250').isCorrect, true);
});
