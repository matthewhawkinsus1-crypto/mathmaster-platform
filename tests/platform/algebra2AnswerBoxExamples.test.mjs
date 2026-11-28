/*
 * WE-I: THE ALGEBRA II ANSWER-BOX AND SORT GENERATORS
 * (src/platform/supports/families/algebra2AnswerBoxes.js and ./algebra2/).
 *
 * What is proved here, over every lesson in teacher-import-jsons:
 *   1. each generator claims exactly the real questions listed below, and
 *      only on an Algebra II standard: no Algebra I (`A.`) question, and no
 *      question another family or a numeric variant already serves;
 *   2. over every question it claims, and several seeds, the sibling passes
 *      similarExampleIsSafe, says why each step is done, and is no question on
 *      the same assignment (neither its prompt nor its problem);
 *   3. its mathematics checks: each value it states is recomputed here from
 *      the sibling's own numbers;
 *   4. the family changes nothing else the question has (hints, back-up step,
 *      the guard's answers), and no example is offered on a DOL, quiz or test;
 *   5. the coverage report counts the claimed Classwork questions as built in.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { asQuestionEngineReceivesIt, lessonFiles, measureClassworkExampleCoverage } from '../../scripts/lib/classworkExampleCoverageReport.mjs';
import { compileAuthoringIntentV5 } from '../../src/platform/contract/authoringIntentV5.js';
import * as family from '../../src/platform/supports/families/algebra2AnswerBoxes.js';
import { familyFor, ALL_FAMILY_MODULES } from '../../src/platform/supports/families/index.js';
import { buildSimilarWorkedExample, similarExampleIsSafe } from '../../src/platform/supports/workedExample/similarProblem.js';
import { buildNumericVariant } from '../../src/platform/supports/workedExample/numericVariant.js';
import { assignmentProblemKeys, exampleSectionRule, workedExampleFor } from '../../src/platform/supports/workedExample/examplePlayer.js';
import { primaryStandardOf } from '../../src/platform/supports/workedExample/exampleSkill.js';
import { readPolynomial } from '../../src/platform/supports/families/algebra2/polynomials.js';
import { evaluateMonomial, parseMonomialExpression } from '../../src/platform/supports/families/algebra2/monomials.js';

const ROOT = path.resolve(new URL('../..', import.meta.url).pathname);

// Every question in the lessons as QuestionEngine receives it, with its section's role and its assignment.
const LESSONS = lessonFiles(ROOT).map((file) => {
  const compiled = compileAuthoringIntentV5(JSON.parse(readFileSync(path.join(ROOT, file), 'utf8')));
  const entries = (compiled?.package?.sections || []).flatMap((section) => (section.questions || []).map((raw) => {
    try { return { role: section.role || section.activityRole, question: asQuestionEngineReceivesIt(raw) }; } catch { return null; }
  })).filter(Boolean);
  return { file, entries, assignment: entries.map((entry) => entry.question) };
});
const CLAIMED = LESSONS.flatMap((lesson) => lesson.entries.filter((entry) => family.matches(entry.question)).map((entry) => ({ ...entry, lesson })));

// The Classwork questions the generators work a sibling for, by generator.
const EXPECTED_CLASSWORK = Object.freeze({
  rootVocabulary: ['a2r1-cw-1'],
  monomialRules: ['a2r3-cw-1', 'a2r3-cw-2', 're-cw-1', 'reh-cw-1'],
  rationalExponents: ['a2r3-cw-3', 'a2r3-cw-4', 'a2r3-cw-5', 're-cw-2', 're-cw-3', 're-cw-4'],
  polynomialOverMonomial: ['dp-cw-1'],
  rationalZeroChain: ['rf-cw-4', 'rf-cw-6', 'rf-cw-8', 'rfh-cw-4'],
  quadraticForm: ['fph-cw-3'],
  groupFourTerms: ['fph-cw-1'],
  realRoots: ['a2r1-cw-2'],
  likeRadicals: ['a2r2-cw-1'],
});

const sorted = (values) => [...values].sort();

// --------------------------------------------------------- 1. what is claimed

test('each generator works a sibling for exactly the Classwork questions listed, all on Algebra II standards', () => {
  const found = {};
  CLAIMED.filter((entry) => entry.role === 'classwork').forEach(({ question }) => {
    if (!buildSimilarWorkedExample(question)) return;
    const { generator } = family.claimFor(question);
    (found[generator.id] ||= []).push(question.questionId);
  });
  Object.keys(found).forEach((id) => { found[id] = sorted(found[id]); });
  assert.deepEqual(found, Object.fromEntries(Object.entries(EXPECTED_CLASSWORK).map(([id, ids]) => [id, sorted(ids)])));
});

test('nothing on an Algebra I standard is claimed, nor anything another family or a numeric variant serves', () => {
  const sawAlgebra1 = LESSONS.some((lesson) => lesson.entries.some((entry) => /^A\./.test(primaryStandardOf(entry.question))));
  assert.ok(sawAlgebra1, 'the lessons have Algebra I questions to leave alone');
  for (const { question } of CLAIMED) {
    assert.match(primaryStandardOf(question), /^A2\./, question.questionId);
    // The first family that matches owns a question: none above this one does.
    assert.equal(familyFor(question)?.family, 'algebra2AnswerBoxes', question.questionId);
    const above = ALL_FAMILY_MODULES.slice(0, ALL_FAMILY_MODULES.findIndex((module) => module.family === 'algebra2AnswerBoxes'));
    assert.ok(above.every((module) => { try { return !(module.implemented && module.matches(question)); } catch { return true; } }), question.questionId);
    // "Practise one like this" offered a numeric variant of none of them, so nothing it offered changes.
    let variant = null;
    try { variant = buildNumericVariant(question); } catch { variant = null; }
    assert.equal(variant, null, `${question.questionId} had a numeric variant`);
  }
  // An Algebra I question shaped like a claimed one is still not read.
  const sample = CLAIMED.find((entry) => entry.question.questionId === 're-cw-1').question;
  const algebra1 = { ...sample, alignments: [{ role: 'primary', code: 'A.11B' }], standard: 'A.11B' };
  assert.equal(family.matches(algebra1), false);
});

// -------------------------------------------------- 2. safe over every claim

test('over every question claimed and several seeds, the sibling is safe, explains each step and is no item on its assignment', () => {
  const mathKey = (value) => String(value).toLowerCase().replace(/[\s$]+/g, '').replace(/[−–]/g, '-')
    .replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]+/g, (run) => `^${[...run].map((c) => '⁰¹²³⁴⁵⁶⁷⁸⁹'.indexOf(c)).join('')}`).replace(/\^\{([^{}]*)\}/g, '^$1');
  let checked = 0;
  for (const { question, lesson, role } of CLAIMED) {
    for (const seed of [0, 1, 2, 3]) {
      const sibling = buildSimilarWorkedExample(question, { seed });
      if (!sibling) continue;
      checked += 1;
      assert.equal(similarExampleIsSafe(question, sibling), true, `${question.questionId} seed ${seed}`);
      assert.ok(sibling.parts.length >= 1 && sibling.parts.every((part) => part.show && part.why), `${question.questionId}: every step says why`);
      // No question of the assignment is its prompt or names its problem.
      assert.ok(lesson.assignment.every((other) => mathKey(other.prompt || '') !== mathKey(sibling.prompt)), question.questionId);
      (sibling.problems || []).filter((problem) => mathKey(problem).length >= 5).forEach((problem) => {
        const named = lesson.assignment.find((other) => mathKey(other.prompt || '').includes(mathKey(problem)));
        // The player keeps such a sibling out (examplePlayer.js); say which, so a generator can avoid it.
        if (named && role === 'classwork') {
          const example = workedExampleFor(question, { sectionRole: 'classwork', assignmentProblems: assignmentProblemKeys(lesson.assignment) });
          assert.ok(!example || !(example.problems || []).includes(problem), `${question.questionId}: ${problem} is ${named.questionId}`);
        }
      });
    }
    // What a Classwork question is handed: the family's steps, with their reasons.
    if (role === 'classwork' && buildSimilarWorkedExample(question)) {
      const example = workedExampleFor(question, { sectionRole: 'classwork', assignmentProblems: assignmentProblemKeys(lesson.assignment) });
      assert.ok(example, question.questionId);
      assert.ok(example.steps.every((step) => step.show && step.why), `${question.questionId}: the player shows each reason`);
    }
  }
  assert.ok(checked >= 60, `checked ${checked}`);
});

// --------------------------------------------------- 3. the mathematics checks

// An answer as the generators write it ($…$ LaTeX) back in the plain form the engines read.
const SUP = Object.freeze({ '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' });
const plainAnswer = (value) => String(value).replace(/\$/g, '')
  .replace(/\^\{(-?\d+)\}/g, (match, exponent) => [...exponent].map((c) => SUP[c]).join(''))
  .replace(/\^\{(-?\d+\/\d+)\}/g, '^($1)')
  .replace(/\\sqrt\[(\d+)\]\{([^{}]*)\}/g, (match, index, inner) => `${[...index].map((c) => SUP[c]).join('')}√(${inner})`)
  .replace(/\\sqrt\{([^{}]*)\}/g, '√($1)')
  .replace(/\\\{/g, '{').replace(/\\\}/g, '}').replace(/\\pm /g, '±').replace(/\\cdot /g, '·');
const number = (value) => {
  const plain = String(value).replace(/−/g, '-').trim();
  const fraction = /^(-?\d+)\/(\d+)$/.exec(plain);
  return fraction ? Number(fraction[1]) / Number(fraction[2]) : Number(plain);
};
const siblingsOf = (generatorId) => CLAIMED.filter((entry) => family.claimFor(entry.question)?.generator.id === generatorId)
  .flatMap((entry) => [0, 1, 2].map((seed) => buildSimilarWorkedExample(entry.question, { seed }))).filter(Boolean);

test('a rational exponent sibling states each value its numbers give', () => {
  const siblings = siblingsOf('rationalExponents');
  assert.ok(siblings.length >= 10);
  let values = 0;
  siblings.forEach((sibling) => plainAnswer(sibling.answer).split('; ').forEach((piece) => {
    const evaluated = /^\(?([−-]?\d+)\)?\^\(([−-]?\d+)\/(\d+)\) = ([−-]?\d+(?:\/\d+)?)$/.exec(piece);
    if (!evaluated) return;
    const [base, p, q] = [number(evaluated[1]), number(evaluated[2]), number(evaluated[3])];
    const root = Math.sign(base) * Math.abs(base) ** (1 / q);
    assert.ok(Math.abs(root ** p - number(evaluated[4])) < 1e-9, piece);
    values += 1;
  }));
  assert.ok(values >= 10);
});

test('a monomial sibling\'s simplified form is the value of its expression', () => {
  const siblings = siblingsOf('monomialRules');
  assert.ok(siblings.length >= 6);
  siblings.forEach((sibling) => plainAnswer(sibling.answer).split('; ').filter((piece) => !piece.startsWith('exponent of')).forEach((piece) => {
    const [left, right] = piece.split(' = ');
    const value = evaluateMonomial(parseMonomialExpression(left));
    const stated = evaluateMonomial(parseMonomialExpression(right));
    assert.ok(value && stated, piece);
    assert.deepEqual(stated, value, piece);
  }));
});

test('a factoring sibling\'s factors multiply back to its polynomial, and its zeros make it zero', () => {
  const at = (coefficients, x) => coefficients.reduce((sum, coefficient) => sum * x + coefficient, 0);
  const product = (factors, x) => (factors.match(/\(([^()]+)\)/g) || []).reduce((value, factor) => {
    const inner = factor.slice(1, -1).replace(/\s+/g, '').replace(/−/g, '-');
    const term = /^(\d*)x(?:([+-]\d+))?$/.exec(inner);
    const squared = /^x²([+-]\d+)$/.exec(inner);
    if (squared) return value * (x * x + Number(squared[1]));
    assert.ok(term, factor);
    return value * ((term[1] ? Number(term[1]) : 1) * x + Number(term[2] || 0));
  }, 1);
  for (const id of ['rationalZeroChain', 'quadraticForm']) {
    siblingsOf(id).forEach((sibling) => {
      // The whole polynomial's factoring: the factored piece with the longest polynomial on its left.
      const answer = plainAnswer(sibling.answer);
      const factored = answer.split('; ').filter((piece) => /^[^=]+ = \(/.test(piece) && !piece.startsWith('u'))
        .sort((a, b) => (readPolynomial(b.split(' = ')[0])?.length || 0) - (readPolynomial(a.split(' = ')[0])?.length || 0))[0];
      if (!factored) return;
      const [left, right] = factored.split(' = ');
      const coefficients = readPolynomial(left);
      assert.ok(coefficients, left);
      [-3, -1, 0, 2, 5].forEach((x) => assert.equal(product(right, x) + 0, at(coefficients, x) + 0, factored));
      const zeros = /(?:^|; )zeros = \{([^}]*)\}/.exec(answer)?.[1];
      if (zeros) zeros.split(', ').map(number).forEach((zero) => assert.ok(Math.abs(at(coefficients, zero)) < 1e-9, `${zero} is a zero of ${left}`));
    });
  }
});

// ------------------------------------- 4. nothing else changes; never on a DOL

test('the family adds an example and nothing else: no hints, no back-up step, no new answers for the guard', () => {
  for (const { question } of CLAIMED) {
    assert.deepEqual(family.hints(question), []);
    assert.equal(family.backUpQuestion(question), null);
    assert.deepEqual(family.expectedValues(question), []);
  }
  for (const role of ['dol', 'quiz', 'test']) assert.equal(exampleSectionRule({ sectionRole: role }).offered, false, role);
  assert.ok(CLAIMED.some((entry) => entry.role === 'dol'), 'claimed DOL questions exist, and the rule withholds their example');
});

// -------------------------------------------------------------- 5. coverage

test('the coverage report counts every question listed as built in', () => {
  const measured = measureClassworkExampleCoverage({ root: ROOT });
  const byId = new Map(measured.lessons.flatMap((lesson) => lesson.questions.map((entry) => [`${lesson.file}#${entry.questionId}`, entry])));
  const expected = new Set(Object.values(EXPECTED_CLASSWORK).flat());
  const builtIn = [...byId.values()].filter((entry) => expected.has(entry.questionId));
  assert.ok(builtIn.length >= expected.size);
  builtIn.forEach((entry) => assert.equal(entry.status, 'builtIn', entry.questionId));
});
