// STUDENT PASS 3, WAVE 7: GRADER GAPS 2.
//
// Four gaps the earlier waves left open (docs/handoffs/STUDENT_PASS3_GRADER_GAPS_2.md):
//
//   1. a mixed number in a number field: `3\frac{1}{2}` (the editor's fraction
//      template after a 3) and a typed `3 1/2` were read as 3·½;
//   2. an `orderedPair` question keyed as text, `answer: '(2,3)'`, could never
//      be marked right;
//   3. three right answers refused: ½π for π/2, `\sqrt{2}` in a number field
//      keyed `sqrt(8)/2`, `0.0005` for `10^{-3}/2`;
//   4. (the sweep: scripts/sweep-equivalence-verdicts.mjs, not here).
//
// Every number-field grader is asked: the secure close (secureItems.gradeItem),
// the Path and Live Challenge field grader (mathPath.gradeResponse, which a
// Live Challenge field round calls through gradePathToolResponse), the
// assignment matcher (answerUtils.matchesFieldAnswer). The teacher's Path
// simulation is a browser copy of mathPath's field grader that node cannot run
// without the whole runtime, so its options call is pinned beside mathPath's.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { sameValue, fieldValueOptions, normalizeAnswer } from '../../functions/shared/answerEquivalence.mjs';
import { compareOrderedPair, matchesFieldAnswer, orderedPairKey } from '../../functions/shared/answerUtils.mjs';
import { gradeFractionResponse, gradeOrderedPairResponse, gradeOrdinaryResponse, serverGradingSupport } from '../../functions/shared/ordinaryResponseGrading.mjs';
import { formatProblemForResponse, fractionFormProblemForResponse } from '../../src/platform/interaction/answerShapeGuard.js';
import { parseAssignmentBlueprintText } from '../../src/assignmentBlueprint.js';
import { compileAuthoringIntentV5 } from '../../src/platform/contract/authoringIntentV5.js';
import { flattenV5Sections } from '../../src/platform/contract/assignmentSchemaV5.js';
import { answerKeyResponse } from '../../src/platform/preflight/questionGenerationPreflight.js';
import { validateQuestionSemantics } from '../../src/platform/contract/semanticValidation.js';
import { getTypeEntry as serverTypeEntry } from '../../functions/shared/questionTypeCatalog.mjs';
import { expectedForPart } from '../../src/platform/supports/feedback/missDiagnosis.js';
import { executableSource } from './helpers/sourceContract.mjs';

const require = createRequire(import.meta.url);
const mathPath = require('../../functions/lib/mathPath.js');
const secureItems = require('../../functions/lib/secureItems.js');

const grading = (expected, profile) => mathPath.privateGradingDefinition({
  responseFields: [{ id: 'answer', inputProfile: profile, expected }],
});

/** The verdict of every number-field grader, as [secure, path/live, assignment]. */
const verdicts = async (response, expected, profile = 'number') => {
  const definition = grading(expected, profile);
  const secure = (await secureItems.gradeItem(definition, { responses: { answer: response } })).isCorrect === true;
  const path = (await mathPath.gradeResponse(definition, { responses: { answer: response } })).isCorrect === true;
  const assignment = matchesFieldAnswer(response, { answer: expected, inputProfile: profile });
  return [secure, path, assignment];
};
const ALL_RIGHT = [true, true, true];
const ALL_WRONG = [false, false, false];

/* ---------------------------------------------------------------------------
 * 1. Mixed numbers.
 * ------------------------------------------------------------------------- */

test('3½ written with the fraction template, or typed 3 1/2, is 7/2 in every number-field grader — and no longer 1.5', async () => {
  for (const sent of ['3\\frac{1}{2}', '3\\frac12', '3 1/2']) {
    for (const key of ['7/2', '\\frac{7}{2}', '3.5']) {
      assert.deepEqual(await verdicts(sent, key), ALL_RIGHT, `${sent} for ${key}`);
    }
    // Read as a product it was 3·½: right for 1.5, a wrong answer let through.
    assert.deepEqual(await verdicts(sent, '1.5'), ALL_WRONG, `${sent} is not 1.5`);
    assert.deepEqual(await verdicts(sent, '5/2'), ALL_WRONG, `${sent} is not 5/2`);
  }
  assert.equal(sameValue('3\\frac{1}{2}', '3.5'), true);
});

test('the sign of a mixed number covers both parts: −3½ is −7/2, never −2.5', async () => {
  assert.deepEqual(await verdicts('-3\\frac{1}{2}', '-7/2'), ALL_RIGHT);
  assert.deepEqual(await verdicts('-3 1/2', '-3.5'), ALL_RIGHT);
  assert.deepEqual(await verdicts('-3\\frac{1}{2}', '-2.5'), ALL_WRONG);
  assert.deepEqual(await verdicts('-3\\frac{1}{2}', '7/2'), ALL_WRONG);
});

test('a key written as a mixed number is the mixed number; a whole number with an improper fraction is neither reading', async () => {
  assert.equal(sameValue('3.5', '3 1/2'), true);
  assert.equal(sameValue('\\frac{7}{2}', '3\\frac{1}{2}'), true);
  assert.equal(sameValue('1.5', '3\\frac{1}{2}'), false);
  // 3 5/2 is not a mixed number a student writes for 5.5, nor 3·5/2 = 7.5.
  assert.equal(sameValue('3\\frac{5}{2}', '7.5'), false);
  assert.equal(sameValue('3\\frac{5}{2}', '5.5'), false);
  // 31/2 typed without a space is still thirty-one halves.
  assert.equal(sameValue('31/2', '15.5'), true);
});

test('an expression key keeps today\'s reading: 3\\frac{x}{2} is (3x)/2, and a mixed-number coefficient is not read', () => {
  assert.equal(sameValue('3\\frac{x}{2}', '\\frac{3x}{2}'), true);
  assert.equal(matchesFieldAnswer('3\\frac{x}{2}', { answer: '3x/2', inputProfile: 'expression' }), true);
  // `2\frac{1}{2}x` could mean (5/2)x; it is left as the owner's decision.
  assert.equal(sameValue('2\\frac{1}{2}x', '5x/2'), false);
  // A mixed number inside a pair stays refused (wave 6 review B2).
  assert.equal(matchesFieldAnswer('(1\\frac{1}{2},4)', { answer: '(\\frac{3}{2},4)', answerFormat: 'orderedPair' }), false);
});

test('a lowest-terms fraction question keeps its rule for a mixed number, and says why before a try is spent', () => {
  const question = { type: 'fraction', prompt: 'Simplify 14/4.', answer: '7/2' };
  // Graded: still one fraction in lowest terms.
  assert.equal(gradeFractionResponse(question, '3\\frac{1}{2}').isCorrect, false);
  assert.equal(gradeFractionResponse(question, '\\frac{7}{2}').isCorrect, true);
  // Shown: a fixed sentence, for any mixed number (right or wrong), with no number in it.
  const reason = fractionFormProblemForResponse(question, '3\\frac{1}{2}');
  assert.match(reason, /one fraction in lowest terms, not as a whole number and a fraction/);
  assert.equal(fractionFormProblemForResponse(question, '4\\frac{1}{3}'), reason);
  assert.doesNotMatch(reason, /\d/);
  assert.equal(fractionFormProblemForResponse(question, '\\frac{7}{2}'), '');
  // A drill (any answer worth the sum) and an author who listed the mixed
  // number get no message: the mixed number is right there.
  assert.equal(fractionFormProblemForResponse({ type: 'fraction', n1: 3, d1: 2, n2: 2, d2: 1 }, '3\\frac{1}{2}'), '');
  assert.equal(gradeFractionResponse({ type: 'fraction', n1: 3, d1: 2, n2: 2, d2: 1 }, '3\\frac{1}{2}').isCorrect, true);
  const listed = { ...question, acceptedAnswers: ['3 1/2'] };
  assert.equal(fractionFormProblemForResponse(listed, '3\\frac{1}{2}'), '');
  assert.equal(gradeFractionResponse(listed, '3\\frac{1}{2}').isCorrect, true);
});

test('FractionGrader holds a mixed number back with the reason, as MultiAnswerGrader does for a shape', () => {
  const source = executableSource(readFileSync(new URL('../../src/FractionGrader.jsx', import.meta.url), 'utf8'));
  assert.match(source, /import \{ fractionFormProblemForResponse \} from '\.\/platform\/interaction\/answerShapeGuard\.js';/);
  assert.match(source, /const formProblem = fractionFormProblemForResponse\(question, answer\);/);
  assert.match(source, /const isComplete = graded\.isComplete && !formProblem;/);
  assert.match(source, /role="status"[^>]*>\s*\{formProblem\}/);
});

/* ---------------------------------------------------------------------------
 * 3. Three right answers that were refused.
 * ------------------------------------------------------------------------- */

test('½π is π/2 and ¾π is 3π/4, in every grader and every kind of field', async () => {
  assert.deepEqual(await verdicts('\\frac{1}{2}\\pi', 'pi/2'), ALL_RIGHT);
  assert.deepEqual(await verdicts('\\frac{3}{4}\\pi', '3pi/4'), ALL_RIGHT);
  assert.deepEqual(await verdicts('\\frac{1}{2}\\pi', 'pi/2', 'expression'), ALL_RIGHT);
  assert.deepEqual(await verdicts('\\frac{1}{3}\\pi', 'pi/2'), ALL_WRONG);
  // A decimal for an exact π answer stays wrong.
  assert.deepEqual(await verdicts('1.5707963', 'pi/2'), ALL_WRONG);
  // Only a lone fraction before π is rewritten: not the fraction of a mixed
  // number (2½π is not 2·π/2), and not when π carries a power (½π² is not (π/2)²).
  assert.match(normalizeAnswer('2\\frac{1}{2}\\pi'), /^2\\frac\{1\}\{2\}π$/);
  assert.doesNotMatch(normalizeAnswer('\\frac{1}{2}\\pi^2'), /\\frac\{π\}\{2\}\^/);
});

test('a number field keyed with an unsimplified radical compares by exact value; a decimal and an unequal root stay wrong', async () => {
  assert.deepEqual(await verdicts('\\sqrt{2}', 'sqrt(8)/2'), ALL_RIGHT);
  assert.deepEqual(await verdicts('\\frac{\\sqrt{8}}{2}', 'sqrt(8)/2'), ALL_RIGHT);
  assert.deepEqual(await verdicts('1.41421356', 'sqrt(8)/2'), ALL_WRONG, 'W6-6: a decimal is not an exact radical');
  assert.deepEqual(await verdicts('\\sqrt{3}', 'sqrt(8)/2'), ALL_WRONG);
  assert.deepEqual(await verdicts('2\\sqrt{2}', 'sqrt(8)/2'), ALL_WRONG);
});

test('a simplified radical key asks for the simplified form, and an expression field is not read by value', async () => {
  // `2sqrt(2)` is in simplest radical form, so `\sqrt{8}` stays wrong.
  assert.deepEqual(await verdicts('\\sqrt{8}', '2sqrt(2)'), ALL_WRONG);
  assert.deepEqual(await verdicts('\\frac{1}{\\sqrt{2}}', 'sqrt(2)/2'), ALL_WRONG, 'a root in the denominator is not simplified');
  // An expression field keyed `11sqrt(5)` is a "simplify" item: never by value.
  assert.deepEqual(await verdicts('\\sqrt{605}', '11sqrt(5)', 'expression'), ALL_WRONG);
  assert.deepEqual(await verdicts('\\sqrt{2}', 'sqrt(8)/2', 'expression'), ALL_WRONG);
  // A rational key wants one number: a root is not one (S4), also when the
  // key is generator text read by value.
  assert.deepEqual(await verdicts('\\sqrt{4}', '2'), ALL_WRONG);
  assert.deepEqual(await verdicts('\\sqrt{4}', '(-(-4))/2'), ALL_WRONG);
});

test('0.0005 and 1/2000 are 10^{-3}/2 in a number field; 0.005 is not', async () => {
  assert.deepEqual(await verdicts('0.0005', '10^{-3}/2'), ALL_RIGHT);
  assert.deepEqual(await verdicts('\\frac{1}{2000}', '10^{-3}/2'), ALL_RIGHT);
  assert.deepEqual(await verdicts('\\frac{10^{-3}}{2}', '10^{-3}/2'), ALL_RIGHT);
  assert.deepEqual(await verdicts('0.005', '10^{-3}/2'), ALL_WRONG);
  // N2's wrong reading stays wrong.
  assert.deepEqual(await verdicts('10^-\\frac{3}{2}', '10^{-3}/2'), ALL_WRONG);
});

test('every field grader asks fieldValueOptions, so a number box reads the same on Path, a test, Live Challenge, the simulation and an assignment', () => {
  assert.deepEqual(fieldValueOptions({ inputProfile: 'number' }), { thousandsSeparators: true, exactNumber: true });
  assert.deepEqual(fieldValueOptions({ inputProfile: 'orderedPair' }), { thousandsSeparators: false, exactNumber: false });
  const pathSource = executableSource(readFileSync(new URL('../../functions/lib/mathPath.js', import.meta.url), 'utf8'));
  assert.match(pathSource, /return equivalence\.sameValue\(actual, expected, tolerance, equivalence\.fieldValueOptions\(field\)\);/);
  const simulation = executableSource(readFileSync(new URL('../../src/platform/simulation/teacherPathRuntime.js', import.meta.url), 'utf8'));
  assert.match(simulation, /return answerEquivalence\.sameValue\(actual, expected, tolerance, answerEquivalence\.fieldValueOptions\(field\)\);/);
});

/* ---------------------------------------------------------------------------
 * 2. An orderedPair keyed as text.
 * ------------------------------------------------------------------------- */

test('an orderedPair key written as text is a point: graded right, coordinate by coordinate', () => {
  // The teacher harness's own fixture: Practice Q2, `answer: '(2,3)'`.
  const question = { type: 'orderedPair', prompt: 'Where do y = x + 1 and y = 3 meet?', answer: '(2,3)' };
  const right = gradeOrderedPairResponse(question, '(2,3)');
  assert.equal(right.isCorrect, true);
  // The key the screen states (OrderedPairGrader's details line) is the point.
  assert.deepEqual(right.expectedPair, [2, 3]);
  assert.deepEqual(right.parts.map((part) => part.isCorrect), [true, true]);
  assert.deepEqual(gradeOrderedPairResponse(question, '(2,4)').parts.map((part) => part.isCorrect), [true, false]);
  assert.equal(gradeOrderedPairResponse(question, '(3,2)').isCorrect, false);
  assert.equal(compareOrderedPair('(2, 3)', '(2,3)'), true);
  // Every spelling of the key an author or an AI writes.
  for (const key of ['(2, 3)', '\\left(2,3\\right)', '[2,3]', '2, 3', ['2', '3'], [2, 3]]) {
    assert.deepEqual(orderedPairKey(key), [2, 3], JSON.stringify(key));
  }
  // A fraction coordinate is kept as written, and graded by value.
  assert.deepEqual(orderedPairKey('(1/2, -3)'), ['1/2', -3]);
  assert.equal(gradeOrderedPairResponse({ answer: '(1/2,-3)' }, '(0.5,-3)').isCorrect, true);
  // A root: by exact value; a decimal stays wrong (W6-6).
  const rootKey = { answer: '(1-sqrt(2),3)' };
  const exact = gradeOrderedPairResponse(rootKey, '(1-\\sqrt{2},3)');
  assert.equal(exact.isComplete, true, 'a pair with a root is a complete answer to a key with one');
  assert.equal(exact.isCorrect, true);
  assert.deepEqual(gradeOrderedPairResponse(rootKey, '(1-\\sqrt{2},4)').parts.map((part) => part.isCorrect), [true, false]);
  assert.deepEqual(gradeOrderedPairResponse(rootKey, '(-0.414,3)').parts.map((part) => part.isCorrect), [false, true]);
  assert.equal(gradeOrderedPairResponse(rootKey, '(-0.414,3)').isCorrect, false);
  // In square brackets too, as a plain key takes them: the whole pair, not
  // only its two coordinate marks (Codex's review of #502).
  for (const spelling of ['[1-\\sqrt{2},3]', '[1-\\sqrt{2}, 3]', '\\left[1-\\sqrt{2},3\\right]']) {
    assert.equal(compareOrderedPair(spelling, ['1-\\sqrt{2}', 3]), true, spelling);
    assert.equal(gradeOrderedPairResponse(rootKey, spelling).isCorrect, true, spelling);
  }
  assert.equal(compareOrderedPair('[1,3]', [1, 3]), true);
  assert.equal(gradeOrderedPairResponse(rootKey, '[1+\\sqrt{2},3]').isCorrect, false);
  assert.equal(gradeOrderedPairResponse(rootKey, '[-0.414,3]').isCorrect, false);
  // Not a pair: nothing can match it.
  for (const key of ['none', '(x,3)', '(1,2,3)', [2]]) assert.equal(orderedPairKey(key), null, JSON.stringify(key));
  assert.equal(gradeOrderedPairResponse({ answer: 'none' }, '(2,3)').isCorrect, false);
  // The server marks it too (ingestion and the deadline finalizer): a text
  // pair is a key, a text that is not a pair is not.
  assert.deepEqual(serverGradingSupport(question), { supported: true, reason: null });
  assert.equal(gradeOrdinaryResponse({ question, response: { kind: 'scalar', type: 'orderedPair', value: '(2,3)', fields: [] } }).isCorrect, true);
  assert.equal(serverGradingSupport({ type: 'orderedPair', prompt: 'Where?', answer: 'none' }).reason, 'no-answer-key');
});

test('the V5 compile and the JSON import store a text pair key as [x, y]; a key that is not a pair is left for Pre-Flight', () => {
  const v5 = (questions, extra = {}) => JSON.stringify({
    schemaVersion: 5,
    assignment: { title: 'Pairs', courseId: 'algebra1', instructionalPurpose: 'lesson', gradingPurpose: 'classwork' },
    sections: [{ role: 'practice', title: 'Practice', questions }],
    ...extra,
  });
  const compiled = parseAssignmentBlueprintText(v5([
    { standard: 'A.5C', prompt: 'Where do y = x + 1 and y = 3 meet?', studentActions: ['stateOrderedPair'], answer: '(2,3)', dok: 1, difficultyBand: 1 },
    { standard: 'A.5C', prompt: 'Where?', studentActions: ['stateOrderedPair'], answer: 'none', dok: 1, difficultyBand: 1 },
  ]));
  assert.deepEqual(compiled.questions.map((question) => [question.type, question.answer]), [['orderedPair', [2, 3]], ['orderedPair', 'none']]);
  // The compile itself stores the point (not only the import's storage pass).
  const { package: compiledPackage } = compileAuthoringIntentV5(JSON.parse(v5([
    { standard: 'A.5C', prompt: 'Where?', studentActions: ['stateOrderedPair'], answer: '(2, 3)', dok: 1, difficultyBand: 1 },
  ])));
  assert.deepEqual(flattenV5Sections(compiledPackage)[0].answer, [2, 3]);
  // A portable export is not recompiled; the import still stores the point.
  const exported = parseAssignmentBlueprintText(v5(
    [{ type: 'orderedPair', questionId: 'q1', prompt: 'Where?', answer: '(1/2, -3)' }],
    { portableContract: { kind: 'mathmasterCanonicalAssignmentV5', version: 1 } },
  ));
  assert.deepEqual(exported.questions[0].answer, ['1/2', -3]);
  assert.ok(exported.repairs.some((repair) => /ordered-pair answer "\(1\/2, -3\)" as the point/.test(repair)));
});

test('Pre-Flight shows a text pair key and refuses, with a reason, a key that is not a pair — on the browser and the server catalog', () => {
  assert.equal(answerKeyResponse({ type: 'orderedPair', answer: '(2,3)' }).value, '(2, 3)');
  assert.equal(answerKeyResponse({ type: 'orderedPair', answer: [2, 5] }).value, '(2, 5)');
  assert.equal(answerKeyResponse({ type: 'orderedPair', answer: 'none' }), null);
  const refused = validateQuestionSemantics({ type: 'orderedPair', prompt: 'Where do the lines meet?', answer: 'none' });
  assert.ok(refused.errors.some((error) => /answer "none" is not a point the grader can read/.test(error)), refused.errors.join(' | '));
  for (const answer of ['(2,3)', [2, 5]]) {
    const passed = validateQuestionSemantics({ type: 'orderedPair', prompt: 'Where do the lines meet?', answer });
    assert.ok(!passed.errors.some((error) => /a point the grader/.test(error)), JSON.stringify(answer));
  }
  // A generated question has no key until it is drawn.
  assert.ok(!validateQuestionSemantics({ type: 'orderedPair', prompt: 'Name the point.' }).errors.some((error) => /a point the grader/.test(error)));
  assert.deepEqual(serverTypeEntry('orderedPair').validate({ type: 'orderedPair', prompt: 'Name the point.' }), []);
  assert.equal(serverTypeEntry('orderedPair').validate({ type: 'orderedPair', prompt: 'Where?', answer: '(1,2,3)' }).length, 1);
});

test('the miss checks read a text pair key too (they still speak only once the item has closed)', () => {
  assert.equal(expectedForPart({ type: 'orderedPair', answer: '(2,3)' }, { id: 'ordered-x' }), 2);
  assert.equal(expectedForPart({ type: 'orderedPair', answer: '(2,3)' }, { id: 'ordered-y' }), 3);
});

/* ---------------------------------------------------------------------------
 * The review of f7d0c17f.
 * ------------------------------------------------------------------------- */

test('S1: the equivalent-expression grading mode reads a mixed number against a number key too', () => {
  const field = (answer) => ({ answer, gradingMode: 'equivalentExpression' });
  assert.equal(matchesFieldAnswer('3\\frac{1}{2}', field('7/2')), true);
  assert.equal(matchesFieldAnswer('3\\frac{1}{2}', field('1.5')), false);
});

test('S2: a side or bound that is exactly a mixed number is read as one, in every grader; any other side keeps its reading', async () => {
  for (const [sent, key, right, profile] of [
    ['x=3\\frac{1}{2}', 'x=3.5', true, 'equation'],
    ['x=3\\frac{1}{2}', 'x=7/2', true, 'equation'],
    ['3\\frac{1}{2}=x', 'x=3.5', true, 'equation'],
    ['x=3\\frac{1}{2}', 'x=1.5', false, 'equation'],
    ['x<3\\frac{1}{2}', 'x<3.5', true, 'inequality'],
    ['x<3\\frac{1}{2}', 'x<1.5', false, 'inequality'],
    ['x\\le-2\\frac{1}{4}', 'x<=-9/4', true, 'inequality'],
    ['1<x<2\\frac{1}{2}', '1<x<2.5', true, 'inequality'],
    ['x<2\\frac{1}{3}', 'x<7/3', true, 'inequality'],
    ['x=2\\frac{1}{3}', 'x=2/3', false, 'equation'],
  ]) {
    assert.deepEqual(await verdicts(sent, key, profile), right ? ALL_RIGHT : ALL_WRONG, `${sent} for ${key}`);
  }
  // `x = 3½` typed in a number box keyed 7/2 (the variable-name rule).
  assert.deepEqual(await verdicts('x=3\\frac{1}{2}', '7/2'), ALL_RIGHT);
  // Not exactly a mixed number: today's reading.
  assert.equal(sameValue('y=2\\frac{1}{2}x+1', 'y=5/2x+1'), false);
  assert.equal(sameValue('x=3\\frac{x}{2}', 'x=3x/2'), true);
  // An improper `3 5/2` is no mixed number: not read as 3 + 5/2.
  assert.equal(sameValue('x=3\\frac{5}{2}', 'x=5.5'), false);
});

test('S6: a number box is what every surface stores, inputProfile first', async () => {
  // inputMode is not kept with Path's private grading: it no longer decides.
  const modeOnly = { answer: 'sqrt(8)/2', inputProfile: 'expression', inputMode: 'numeric' };
  assert.equal(matchesFieldAnswer('\\sqrt{2}', modeOnly), false);
  const graded = await mathPath.gradeResponse(mathPath.privateGradingDefinition({ responseFields: [{ id: 'a', expected: 'sqrt(8)/2', inputProfile: 'expression', inputMode: 'numeric' }] }), { responses: { a: '\\sqrt{2}' } });
  assert.equal(graded.isCorrect, false, 'the assignment matcher and Path agree');
  // A stray answerFormat does not beat the declared profile.
  assert.equal(matchesFieldAnswer('\\sqrt{2}', { answer: 'sqrt(8)/2', inputProfile: 'expression', answerFormat: 'number' }), false);
  assert.equal(matchesFieldAnswer('\\sqrt{2}', { answer: 'sqrt(8)/2', answerFormat: 'number' }), true, 'a field with no profile keeps its answerFormat');
  assert.equal(matchesFieldAnswer('\\sqrt{2}', { answer: 'sqrt(8)/2', inputProfile: 'number' }), true);
});

test('S7: a Digital SAT number box says the SAT takes no mixed number, before a try is spent; the grader still reads it', () => {
  const field = { id: 'v', label: 'Value', answer: '7/2', inputProfile: 'number', numberRules: 'digitalSAT' };
  const reason = formatProblemForResponse(field, '3\\frac{1}{2}');
  assert.equal(reason, 'The SAT doesn\'t take mixed numbers. Enter it as an improper fraction or a decimal.');
  assert.equal(formatProblemForResponse(field, '4\\frac{2}{3}'), reason, 'any mixed number, right or wrong');
  assert.equal(formatProblemForResponse(field, '7/2'), '');
  assert.equal(formatProblemForResponse(field, '3.5'), '');
  assert.equal(formatProblemForResponse({ ...field, numberRules: undefined }, '3\\frac{1}{2}'), '', 'only an SAT box');
  assert.equal(matchesFieldAnswer('3\\frac{1}{2}', field), true, 'the value reading stays in the grader');
});

test('N1: ½π is not rewritten after a slash, where it reads (1/½)·π', () => {
  assert.equal(normalizeAnswer('1/\\frac{1}{2}\\pi'), '1/\\frac{1}{2}π');
  assert.equal(normalizeAnswer('\\frac{1}{2}\\pi'), '\\frac{π}{2}');
});
