// GRADER SPELLINGS (2026-11): right answers the graders refused when a
// student typed them a plausible way.
//
//   1. brackets round the whole answer or a whole side: `(7x^2-3x-6)`,
//      `y=(3(x-3)^2+1)`, the factor `(x-2)` for x − 2;
//   2. a leading +: `+1/x^6`, `+\frac{\sqrt{3}}{2}`;
//   3. a sum's terms or a product's factors in another order: `(x+3)(x+2)`,
//      `5+2\sqrt{3}`, `6\sqrt{x}x^3`, `-8+2x+x^2=0`;
//   4. a generated key's zero term left out: `x^2-1=0` for `x^2+0x-1=0`;
//   5. a typed ², · or × where the graders work the mathematics out: a
//      polynomial relation, a rational expression, a root, a π quotient.
//
// Each acceptance has near misses beside it that stay wrong. The field
// graders are asked: the secure close (secureItems.gradeItem), the Path and
// Live Challenge field grader (mathPath.gradeResponse), the assignment matcher
// (answerUtils.matchesFieldAnswer), and an assignment question graded on the
// device (gradeMultiAnswerResponse) and on the server (gradeServerResponse).
// scripts/sweep-equivalence-verdicts.mjs runs every bank key through the same
// classes (scripts/lib/typedAnswerSpellings.mjs).

import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

import { fieldValueOptions, sameValue } from '../../functions/shared/answerEquivalence.mjs';
import { matchesFieldAnswer } from '../../functions/shared/answerUtils.mjs';
import { gradeMultiAnswerResponse } from '../../functions/shared/ordinaryResponseGrading.mjs';
import { gradeServerResponse } from '../../functions/shared/serverGrading/serverResponseGrading.mjs';
import { fieldsResponse } from './helpers/misconceptionFixtures.mjs';

const require = createRequire(import.meta.url);
const mathPath = require('../../functions/lib/mathPath.js');
const secureItems = require('../../functions/lib/secureItems.js');

/** Every field grader's verdict on `response` for a field keyed `key`. */
const verdicts = async (key, response, field = {}) => {
  const authored = { id: 'answer', inputProfile: 'expression', expected: key, ...field };
  const grading = mathPath.privateGradingDefinition({ prompt: 'Write the answer.', responseFields: [authored] });
  const payload = { responses: { answer: response } };
  const question = {
    questionId: 'grader-spellings',
    type: 'multiAnswer',
    prompt: 'Write the answer.',
    answerFields: [{ id: 'answer', label: 'Answer', answer: key, ...field }],
  };
  const device = gradeMultiAnswerResponse(question, { answer: response }).parts[0].isCorrect;
  const server = gradeServerResponse({ question, response: fieldsResponse({ answer: response }) }).parts?.[0]?.isCorrect === true;
  assert.equal(server, device, `device and server agree on ${response} for ${key}`);
  return {
    secure: (await secureItems.gradeItem(grading, payload)).isCorrect === true,
    path: (await mathPath.gradeResponse(grading, payload)).isCorrect === true,
    assignment: matchesFieldAnswer(response, { answer: key, ...field }),
    device,
  };
};
const ALL = { secure: true, path: true, assignment: true, device: true };
const NONE = { secure: false, path: false, assignment: false, device: false };
const accepts = async (key, response, field) => assert.deepEqual(await verdicts(key, response, field), ALL, `${response} is right for ${key}`);
const refuses = async (key, response, field) => assert.deepEqual(await verdicts(key, response, field), NONE, `${response} stays wrong for ${key}`);

test('1: brackets round the whole answer or a whole side group nothing', async () => {
  for (const [key, response, field] of [
    ['7x^2- 3x- 6', '(7x^2-3x-6)'],
    ['x-(2)', '(x-2)'],
    ['y=3(x- 3)^2+ 1', 'y=(3(x-3)^2+1)', { inputProfile: 'equation' }],
    ['y=1(x- 1)^2- 8', 'y=((x-1)^2-8)', { inputProfile: 'equation' }],
    ['f(x)=-4x+ 1', 'f(x)=(-4x+1)', { inputProfile: 'equation' }],
    ['y=(x- 2)(x- 7)', 'y=((x-2)(x-7))', { inputProfile: 'equation' }],
    ['y=80(1.5)^t', 'y=(80(1.5)^t)', { inputProfile: 'equation' }],
    ['3pi/4', '(3pi/4)', { inputProfile: 'number' }],
    // …and where only the polynomial reader can tell (a typed quotient
    // against a decimal), the bracket round the side is no factored group.
    ['y=x^2+0.5x', 'y=(x^2+1/2x)', { inputProfile: 'equation' }],
    ['x^2+0.5x', '(x^2+1/2x)'],
  ]) await accepts(key, response, field);
  // A pair that is not round the whole, or that holds a comma, is no such pair.
  for (const [key, response, field] of [
    ['7x^2- 3x- 6', '(7x^2-3x)-6+1'],
    ['x-(2)', '(x+2)'],
    ['x-(2)', '-(x-2)'],
    ['x+1', '(x+1)^2'],
    ['y=3(x- 3)^2+ 1', 'y=(3(x-3))^2+1', { inputProfile: 'equation' }],
    ['y=-2x+3', 'y=-(2x+3)', { inputProfile: 'equation' }],
  ]) await refuses(key, response, field);
  // An interval keeps its brackets: the pair holds a comma, so it is no such pair.
  assert.equal(sameValue('-1,5', '(-1,5)'), false);
});

test('2: a plus that opens the answer is only a sign', async () => {
  for (const [key, response] of [['1/x^6', '+1/x^6'], ['d/(8r)', '+d/(8r)'], ['ln(3)/ln(2)', '+ln(3)/ln(2)'], ['2x-3', '+2x-3']]) {
    await accepts(key, response);
  }
  await accepts('y=2x+1', 'y=+2x+1', { inputProfile: 'equation' });
  for (const [key, response] of [['1/x^6', '-1/x^6'], ['1/x^6', '+1/x^7'], ['-5', '+5'], ['5', '+-5']]) await refuses(key, response, { inputProfile: key.includes('x') ? 'expression' : 'number' });
  // A lone sign is still a sign: an empty answer never meets a key of "+",
  // and "-" never did either (it read as no term, like "+").
  assert.equal(sameValue('', '+'), false);
  assert.equal(sameValue('-', '+'), false);
  assert.equal(sameValue('+', '-'), false);
});

test('3: a sum\'s terms and a product\'s factors in another order are the same answer in the same form', async () => {
  for (const [key, response, field] of [
    ['(x+2)(x+3)', '(x+3)(x+2)'],
    ['-3(x+ 4)(x+ 1)', '-3(x+1)(x+4)'],
    ['2\\sqrt{3}+5', '5+2\\sqrt{3}'],
    ['6x^3\\sqrt{x}', '6\\sqrt{x}x^3'],
    ['x(x+3)', '(x+3)x'],
    ['2\\pi r', '2r\\pi'],
    ['|x-2|+3', '3+|x-2|'],
    ['\\frac{1}{a}+\\frac{1}{b}', '\\frac{1}{b}+\\frac{1}{a}'],
    ['x^2+ 2x- 8=0', '-8+2x+x^2=0', { inputProfile: 'equation' }],
    ['x(x+6)=0', '(x+6)x=0', { inputProfile: 'equation' }],
    ['y=(x+ 3)(x- 1)', 'y=(x-1)(x+3)', { inputProfile: 'equation' }],
  ]) await accepts(key, response, field);
  for (const [key, response, field] of [
    // a sign left behind, a constant moved between factors, a power moved
    ['(x+2)(x-3)', '(x-2)(x+3)'],
    ['2x-3', '3-2x'],
    ['x^2y', 'xy^2'],
    ['2^x', 'x^2'],
    ['\\sqrt{x}y', '\\sqrt{y}x'],
    ['|x|-|y|', '|y|-|x|'],
    ['\\pi r^2', '\\pi^2r'],
    ['x_1-x_2', 'x_2-x_1'],
    // a number after a factor, a mixed number, a call, words, matrices
    ['2(x+1)', '(x+1)2+1'],
    ['3\\frac{1}{2}', '\\frac{1}{2}3', { inputProfile: 'number' }],
    ['f(x+1)', '(x+1)f'],
    ['AB\\sqrt{2}', 'BA\\sqrt{2}'],
    ['x^2+ 2x- 8=0', 'x^2+2x=8', { inputProfile: 'equation' }],
  ]) await refuses(key, response, field);
  // A plain-text quotient still moves nothing (GR04): its extent is ambiguous.
  assert.equal(sameValue('1+x-1/x', 'x-1/x+1'), false);
  assert.equal(sameValue('1/y+1/x', '1/x+1/y'), false);
  // Letters alone could be a word, so they are not put in another order: `on`
  // is not `no` beside a root the polynomial reader cannot read.
  assert.equal(sameValue('\\sqrt{2}+on', '\\sqrt{2}+no'), false);
});

test('4: a generated key\'s zero term is no term: x² − 1 = 0 for x² + 0x − 1 = 0', async () => {
  for (const [key, response] of [
    ['x^2+ 0x- 1=0', 'x^2-1=0'], ['x^2+ 0x- 1=0', '0=x^2-1'], ['2x^2+ 0x- 50=0', '2x^2-50=0'], ['x^2+ 0x- 4=0', '-4+x^2=0'],
    // h = 0 or k = 0 in a vertex form, and inside a root.
    ['y=-1(x- 3)^2+ 0', 'y=-(x-3)^2'], ['y=-2(x+ 0)^2+ 0', 'y=-2x^2'], ['y=-2(x+ 0)^2+ 0', 'y=-2(x-0)^2+0'],
    ['y=-1(x+ 0)^2- 2', 'y=-x^2-2'], ['3sqrt(4x+ 0)=12', '3\\sqrt{4x}=12'],
    // An equation's left side that names nothing is read as a polynomial,
    // like its right side: a decimal coefficient for a typed fraction.
    ['x^2+ 1/2x- 3=0', 'x^2+0.5x-3=0'],
  ]) {
    await accepts(key, response, { inputProfile: 'equation' });
  }
  await accepts('0+(-3)*(n-1)', '-3(n-1)');
  for (const [key, response] of [
    ['x^2+ 0x- 1=0', 'x^2+1=0'], ['x^2+ 0x- 1=0', 'x^2=1'], ['x^2+ 0x- 1=0', 'x^2-x-1=0'], ['x^2+ 2x- 8=0', 'x^2-8=0'],
    ['y=-1(x- 3)^2+ 0', 'y=-(x+3)^2'], ['y=-1(x- 3)^2+ 0', 'y=(x-3)^2'], ['y=-2(x+ 0)^2+ 0', 'y=-2x^2+1'], ['y=-2(x+ 0)^2+ 0', 'y=-2(x+1)^2'],
    ['x^2+ 1/2x- 3=0', 'x^2+0.2x-3=0'],
  ]) {
    await refuses(key, response, { inputProfile: 'equation' });
  }
  // In a point a coordinate's 0 + 1 is a calculation, and stays one.
  await refuses('(1,2)', '(0+1,2)', { inputProfile: 'orderedPair', answerFormat: 'orderedPair' });
  // A side that names what the equation defines keeps its name: y is not x,
  // and f(x) is not the product xf the polynomial reader would make of it.
  await refuses('y=x^2-1', 'x=x^2-1', { inputProfile: 'equation' });
  await refuses('f(x)=x^2-1', 'xf=x^2-1', { inputProfile: 'equation' });
});

test('5: a typed ², · or × is read as the editor writes it, wherever the mathematics is worked out', async () => {
  const relation = { inputProfile: 'equation', equivalence: 'polynomialRelation' };
  await accepts('(x-(2))^2=4(y-(4))', '(x-2)²=4·(y-4)', relation);
  await accepts('(x-(2))^2=4(y-(4))', '(x-2)^2=4×(y-4)', relation);
  await refuses('(x-(2))^2=4(y-(4))', '(x-2)³=4·(y-4)', relation);
  await refuses('(x-(2))^2=4(y-(4))', '(x-2)²=4·(y+4)', relation);
  const rational = { inputProfile: 'expression', equivalence: 'rationalExpression' };
  for (const response of ['(4·x+17)/((x-1)·(x+6)·(x+5))', '(4×x+17)/((x-1)×(x+6)×(x+5))']) {
    assert.equal((await verdicts('(4*x+(17))/((x-(1))*(x-(-6))*(x-(-5)))', response, rational)).path, true, response);
  }
  assert.equal((await verdicts('(4*x+(17))/((x-(1))*(x-(-6))*(x-(-5)))', '(4·x+17)/((x-1)·(x+6)·(x-5))', rational)).path, false);
  await accepts('2pi/3', '2·pi/3', { inputProfile: 'number' });
  await refuses('2pi/3', '3·pi/2', { inputProfile: 'number' });
  await accepts('y=x^2+3x', 'y=3x+x²', { inputProfile: 'equation' });
  await refuses('y=x^2+3x', 'y=3x+x³', { inputProfile: 'equation' });
  // A number box still takes the value, not the calculation (GR01).
  await refuses('12', '4·3', { inputProfile: 'number' });
  await refuses('12', '4×3', { inputProfile: 'number' });
});

test('5: a choice\'s option is never read so: an option of the same value is a wrong option (GR35c, GR06)', () => {
  const field = {
    inputProfile: 'choice',
    answer: '24x^2-4x-18x+3',
    options: ['24x² + 4x − 26x + 3', '24x² − 4x − 18x + 3', '24x² − 22x + 3'],
  };
  assert.equal(matchesFieldAnswer('24x² − 4x − 18x + 3', field), true);
  assert.equal(matchesFieldAnswer('24x² + 4x − 26x + 3', field), false);
  assert.equal(matchesFieldAnswer('24x² − 22x + 3', field), false);
  assert.equal('typed' in fieldValueOptions(field), false);
  assert.equal(fieldValueOptions({ inputProfile: 'expression' }).typed, true);
});

test('6: what the editor sends for a generated key: its brackets, its 1s, its signs and its relations', async () => {
  // The audit's last known grader gaps (scripts/lib/pathBankAnswerSweep.mjs
  // KNOWN_OPEN_FALSE_NEGATIVES): the keypad's spelling of a generated key.
  for (const [key, response, field] of [
    ['(-(6)-sqrt(8))/2', '(-6-\\sqrt{8})/2'],
    ['(-(-6)+sqrt(12))/2', '(6+\\sqrt{12})/2'],
    ['(-(0)-sqrt(12))/2', '(-\\sqrt{12})/2'],
    ['1/x^1', '1/x'],
    ['x^1*\\sqrt[3]{x^1}', 'x\\sqrt[3]{x}'],
    ['x^2*\\sqrt[3]{x^1}', 'x^{2}\\sqrt[3]{x}'],
    ['1sqrt(7)', '\\sqrt{7}'],
    ['2sqrt(8)', '2sqrt8'],
    // A product sign the keypad never writes: before an nth root, around bars.
    ['x^2*\\sqrt[3]{x^2}', 'x^{2}\\sqrt[3]{x^{2}}'],
    ['x^2*\\sqrt[3]{x}/3', 'x^{2}\\sqrt[3]{x}/3'],
    ['3*|x|*y^2', '3|x|y^{2}'],
    ['x!=(-5)', 'x\\ne -5', { inputProfile: 'inequality' }],
    ['y!=(4)', 'y≠4', { inputProfile: 'inequality' }],
  ]) await accepts(key, response, field);
  for (const [key, response, field] of [
    ['(-(6)-sqrt(8))/2', '(-6+\\sqrt{8})/2'],
    ['(-(6)-sqrt(8))/2', '(6-\\sqrt{8})/2'],
    ['(-(-6)+sqrt(12))/2', '(-6+\\sqrt{12})/2'],
    ['1/x^1', '1/x^2'],
    ['x^1*\\sqrt[3]{x^2}', 'x\\sqrt[3]{x}'],
    ['1sqrt(7)', '7'],
    ['x^2*\\sqrt[3]{x^2}', 'x^{2}\\sqrt[3]{x}'],
    ['3*|x|*y^2', '3|x|y'],
    ['3*|x|*y^2', '3|y|x^2'],
    ['x!=(-5)', 'x\\ne 5', { inputProfile: 'inequality' }],
    ['x!=(-5)', 'x<-5', { inputProfile: 'inequality' }],
  ]) await refuses(key, response, field);
  // In a point, -(-2) is a calculation, and stays one (pass 3, review B2).
  await refuses('(2,3)', '(-(-2),3)', { inputProfile: 'orderedPair', answerFormat: 'orderedPair' });
});
