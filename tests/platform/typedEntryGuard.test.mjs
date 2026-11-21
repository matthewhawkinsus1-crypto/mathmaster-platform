/*
 * AN ENTRY THAT IS NOT GRADED: UNFINISHED, OR TOO LONG (#557, #558; the
 * owner, 2026-11-19; functions/shared/typedEntryGuard.mjs).
 *
 *   - An answer with a sign or a product sign left dangling (`12 +`, `4*`,
 *     `*38`) was marked right by every typed-field grader. It is never right
 *     now, and the root is fixed: the form comparison no longer drops an
 *     operator that has no operand.
 *   - An answer over the 240 characters the attempt record keeps was graded
 *     whole on the screen and cut on the server. The comparison refuses it at
 *     once, and the screen refuses it with a message.
 *   - The work is bounded, not only the length: inside 240 characters no
 *     typed-field comparison reaches mathjs's simplifier, and the slowest
 *     input takes milliseconds.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import * as equivalence from '../../functions/shared/answerEquivalence.mjs';
import { matchesFieldAnswer } from '../../functions/shared/answerUtils.mjs';
import '../../functions/shared/formSpecificFieldGrading.mjs';
import { gradeLiteralResponse, gradeMultiAnswerResponse, gradeOrderedPairResponse, gradeTableResponse, normalizeOrdinaryResponse } from '../../functions/shared/ordinaryResponseGrading.mjs';
import { gradeServerResponse } from '../../functions/shared/serverGrading/serverResponseGrading.mjs';
import { typedFieldCorpus } from '../../scripts/lib/graderFuzz/corpus.mjs';
import * as fuzzInputs from '../../scripts/lib/graderFuzz/inputs.mjs';
import { createRng } from '../../scripts/lib/graderFuzz/prng.mjs';
import { editorTypedSpellings } from '../../scripts/lib/editorTypedSpelling.mjs';
import { typedSpellingsOf } from '../../scripts/lib/typedAnswerSpellings.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const require = createRequire(import.meta.url);
const mathPath = require('../../functions/lib/mathPath.js');
const secureItems = require('../../functions/lib/secureItems.js');
// Loaded by name, so that this file loads on a tree without the module and
// each test below fails on its own.
const guard = await import('../../functions/shared/typedEntryGuard.mjs').catch(() => ({}));

const { sameValue, sameFormPreservingExpression, sameFormPreservingEquation } = equivalence;

// The issue's table, and the same break in the other spellings a box can hold.
const UNFINISHED = [
  ['12 +', '12'], ['7 -', '7'], ['x=5-', 'x=5'], ['x>3+', 'x>3'], ['(x+2)(x+3)+', '(x+2)(x+3)'],
  ['4*', '4'], ['102\\times', '102'], ['1\\cdot', '1'], ['3**x', '3x'], ['*38', '38'],
  ['12−', '12'], ['12×', '12'], ['12·', '12'], ['\\cdot 12', '12'], ['x=*5', 'x=5'], ['x*=5', 'x=5'],
  ['2x+*1', '2x+1'], ['12+\\placeholder{}', '12'], ['\\frac{1}{2}+', '\\frac{1}{2}'], ['(2,3)+', '(2,3)'],
  ['5\\cdot\\left|x\\right|\\cdot', '5|x|'], ['y=2x+1-', 'y=2x+1'],
];

const multiAnswer = (key, extra = {}) => ({ questionId: 'q', type: 'multiAnswer', prompt: 'Write the value.', answerFields: [{ id: 'value', label: 'Value', answer: key, ...extra }] });
const onServer = (question, typed) => {
  const device = gradeMultiAnswerResponse(question, { value: typed });
  const response = JSON.parse(JSON.stringify(normalizeOrdinaryResponse({ question, answerState: { parts: device.parts } })));
  return gradeServerResponse({ question, response });
};
const pathGrading = (key, extra = {}) => mathPath.privateGradingDefinition({ prompt: 'Write the answer.', responseFields: [{ id: 'answer', label: 'Answer', expected: key, ...extra }] });

test('#557: an unfinished entry is never marked right, by any typed-field grader', async () => {
  for (const [typed, key] of UNFINISHED) {
    assert.equal(sameValue(typed, key), false, `sameValue ${typed}`);
    assert.equal(sameValue(typed, key, 1e-6, { typed: true }), false, `sameValue typed ${typed}`);
    assert.equal(matchesFieldAnswer(typed, { answer: key }), false, `matchesFieldAnswer ${typed}`);
    assert.equal(gradeMultiAnswerResponse(multiAnswer(key), { value: typed }).isCorrect, false, `gradeMultiAnswerResponse ${typed}`);
    const server = onServer(multiAnswer(key), typed);
    assert.equal(server.graded && server.isCorrect === true, false, `gradeServerResponse ${typed}`);
    const grading = pathGrading(key);
    assert.equal((await mathPath.gradeResponse(grading, { responses: { answer: typed } })).isCorrect, false, `mathPath.gradeResponse ${typed}`);
    assert.equal((await secureItems.gradeItem(grading, { responses: { answer: typed } })).isCorrect, false, `secureItems.gradeItem ${typed}`);
    // …and the key itself is still right.
    assert.equal(sameValue(key, key), true, key);
    assert.equal((await mathPath.gradeResponse(grading, { responses: { answer: key } })).isCorrect, true, `path key ${key}`);
  }
  // The same on a literal, a table and an ordered-pair question.
  assert.equal(gradeLiteralResponse({ acceptedAnswers: ['w = A/l', 'A/l'], solveFor: 'w' }, 'A/l +').isCorrect, false);
  assert.equal(gradeLiteralResponse({ acceptedAnswers: ['w = A/l', 'A/l'], solveFor: 'w' }, 'A/l').isCorrect, true);
  const table = { table: { answers: { 'r0c1': '5' }, blanks: [] } };
  assert.equal(gradeTableResponse(table, { 'r0c1': '5*' }).isCorrect, false);
  assert.equal(gradeTableResponse(table, { 'r0c1': '5' }).isCorrect, true);
  assert.equal(gradeOrderedPairResponse({ answer: [2, -3] }, '(2, -3)+').isCorrect, false);
});

test('#557: the root. The form comparison no longer drops a dangling operator', () => {
  // constantTermsLast kept only a sign that had a term; commutedProduct read a
  // product sign with no factor beside it as nothing. Asked of the form
  // comparison itself, which has no entry rule in front of it.
  for (const [typed, key] of [['12+', '12'], ['12-', '12'], ['(x+2)(x+3)+', '(x+2)(x+3)'], ['2x+1-', '2x+1'], ['4*', '4'], ['*38', '38'], ['3**x', '3x'], ['1\\cdot', '1'], ['2x+*1', '2x+1']]) {
    assert.equal(sameFormPreservingExpression(typed, key), false, `${typed} is not ${key}`);
    assert.equal(sameFormPreservingExpression(key, typed), false, `${key} is not ${typed}`);
  }
  for (const [typed, key] of [['x=5-', 'x=5'], ['x=5+', 'x=5'], ['y=2x+1*', 'y=2x+1'], ['x*=5', 'x=5'], ['x=*5', 'x=5']]) {
    assert.equal(sameFormPreservingEquation(typed, key), false, `${typed} is not ${key}`);
  }
  // What the two readers were written for still holds: a constant term moved,
  // terms and factors in another order, a product sign between two factors.
  for (const [typed, key] of [['-3+2(x-4)^2', '2(x-4)^2-3'], ['(x+3)(x+2)', '(x+2)(x+3)'], ['5+2\\sqrt{3}', '2\\sqrt{3}+5'], ['x*2', '2x'], ['x*2*y', '2xy'], ['2*x', '2x'], ['3\\cdot x', '3x'], ['+12', '12'], ['x(x+3)', '(x+3)x']]) {
    assert.equal(sameFormPreservingExpression(typed, key), true, `${typed} is ${key}`);
  }
  assert.equal(sameFormPreservingEquation('2x-8+x^2=0', 'x^2+2x-8=0'), true);
  // A lone sign is still no answer, and the two are still not one.
  assert.equal(sameValue('-', '+'), false);
});

test('what counts as unfinished: a sign with nothing after it, a product sign with a factor missing', () => {
  const { hasDanglingOperator } = guard;
  for (const [typed] of UNFINISHED) assert.equal(hasDanglingOperator(typed), true, typed);
  for (const typed of ['(x+2+)(x+3)', 'x<3+ or x>5', '(2+,3)', '\\frac{x+}{2}', '|x|+', '2^{x+}', '\\left(x+2\\right)\\cdot', '+*12']) assert.equal(hasDanglingOperator(typed), true, typed);
  // Finished: a sign that opens a term, a sign written as a power, bars, and
  // what was never called right (a quotient or a power left open is graded as itself).
  for (const typed of [
    '12', '-5', '+3', '3*-x', '2x-3', '(2, 5]', '[-3, 5)', '(-\\infty, 5)', 'x=-5', 'y=-x+2', 'x<-1 or x>2', '{-1, 2}', '\\{x|x>-3\\}',
    '|x|', '|-3|', '-|x|', '5*|x|*y^2', '5\\cdot\\left|x\\right|\\cdot y^2', 'x^{-1}', 'x^-2', 'e^{-x}', '2\\times10^{-3}', '3\\cdot 4',
    '2^+', '2^{+}', 'x\\to 0^{-}', 'a_{+}', 'non-linear', '5.', '12/', '2^', '(x', 'x=', '', '   ', '-', '+', '\\cdot',
  ]) assert.equal(hasDanglingOperator(typed), false, typed);
  for (const value of [null, undefined, 5, -5, {}, [], ['12+']]) assert.equal(hasDanglingOperator(value), false);
});

test('a key that is itself written with a dangling sign is the author\'s: the comparison decides', () => {
  const { refusesTypedEntry } = guard;
  assert.equal(refusesTypedEntry('2^+ +', '4'), true);
  assert.equal(refusesTypedEntry('x+', ['x+', 'x']), false);
  assert.equal(refusesTypedEntry('x+', 'x+'), false);
  assert.equal(sameValue('x +', 'x+'), true, 'the key typed as it is keyed');
  assert.equal(matchesFieldAnswer('3 +', { answer: '3+', acceptedAnswers: ['3'] }), true);
  // A choice is the option picked, never a typed entry.
  assert.equal(matchesFieldAnswer('A+', { answer: 'A+', inputProfile: 'choice', options: ['A+', 'A', 'B+'] }), true);
  assert.equal(matchesFieldAnswer('B+', { answer: 'A+', inputProfile: 'choice', options: ['A+', 'A', 'B+'] }), false);
});

test('#558: an answer over 240 characters is refused by the comparison, at once', async () => {
  const { MAX_TYPED_ANSWER_LENGTH, isOverLongAnswer } = guard;
  assert.equal(MAX_TYPED_ANSWER_LENGTH, 240);
  // The record's own number: what the wire and the attempt record keep of a box.
  const wire = normalizeOrdinaryResponse({ question: multiAnswer('5'), answerState: { parts: [{ id: 'value', response: 'x'.repeat(400), isComplete: true }] } });
  assert.equal(wire.fields[0].value.length, MAX_TYPED_ANSWER_LENGTH);

  const padded = (key) => [`${'+'.repeat(241 - key.length)}${key}`, `${'('.repeat(120)}${key}${')'.repeat(120)}`, `${key}${'+0'.repeat(120)}`, `${key}${' '.repeat(240)}`];
  for (const key of ['5', '-5', 'x^2+3x+2', 'y=2x+1']) {
    for (const typed of padded(key)) {
      assert.equal(isOverLongAnswer(typed), true);
      assert.equal(sameValue(typed, key), false, `sameValue, ${typed.length} characters for ${key}`);
      assert.equal(matchesFieldAnswer(typed, { answer: key }), false, `matchesFieldAnswer, ${typed.length} characters for ${key}`);
      // The screen's own grader says what the server says: nothing is graded two ways.
      assert.equal(gradeMultiAnswerResponse(multiAnswer(key), { value: typed }).isCorrect, false);
      const grading = pathGrading(key);
      assert.equal((await mathPath.gradeResponse(grading, { responses: { answer: typed } })).isCorrect, false, `path, ${typed.length} characters for ${key}`);
      assert.equal((await secureItems.gradeItem(grading, { responses: { answer: typed } })).isCorrect, false);
    }
  }
  // Every Path comparison a field can name, not only the default one.
  for (const [equivalenceName, key] of [['rationalExpression', '\\frac{x+1}{x-2}'], ['nonnegativeRadicalExpression', '3\\sqrt{2}'], ['polynomialRelation', 'x+y=449'], ['interval', '[-3, 5)'], ['setBuilder', '\\{x|x>3\\}'], ['modelEquation', 'y=2x+1'], ['absoluteLinearRelation', '|x-3|=5']]) {
    const grading = pathGrading(key, { equivalence: equivalenceName });
    assert.equal((await mathPath.gradeResponse(grading, { responses: { answer: `${key}${' '.repeat(241)}` } })).isCorrect, false, equivalenceName);
  }
  // …and an unfinished entry is refused before them too: a field's own
  // comparison is not asked (modelEquation read `1/5+1/8=1/t+` as its key).
  for (const [equivalenceName, key, typed] of [['modelEquation', '1/5+1/8=1/t', '1/5+1/8=1/t+'], ['polynomialRelation', 'x+y=449', 'x+y=449+'], ['rationalExpression', '\\frac{x+1}{x-2}', '\\frac{x+1}{x-2}\\cdot'], ['interval', '[-3, 5)', '[-3, 5)+']]) {
    const grading = pathGrading(key, { equivalence: equivalenceName });
    assert.equal((await mathPath.gradeResponse(grading, { responses: { answer: key } })).isCorrect, true, `${equivalenceName}: the key`);
    assert.equal((await mathPath.gradeResponse(grading, { responses: { answer: typed } })).isCorrect, false, `${equivalenceName}: ${typed}`);
    assert.equal((await secureItems.gradeItem(grading, { responses: { answer: typed } })).isCorrect, false, `${equivalenceName} at the secure close: ${typed}`);
  }
  // Exactly at the limit is an answer like any other.
  const atLimit = `${' '.repeat(239)}5`;
  assert.equal(atLimit.length, 240);
  assert.equal(isOverLongAnswer(atLimit), false);
  assert.equal(sameValue(atLimit, '5'), true);
  assert.equal(isOverLongAnswer(`${atLimit} `), true);

  // The 2,000-character value of nested brackets that took 2 s (the issue's
  // own measure) is not read at all.
  const nested = '(\\frac{1}{2}+'.repeat(153);
  const started = performance.now();
  for (let index = 0; index < 50; index += 1) assert.equal(sameValue(nested, '(x+ 8)^2'), false);
  const each = (performance.now() - started) / 50;
  assert.ok(each < 5, `a ${nested.length}-character value took ${each.toFixed(2)} ms to refuse`);
});

test('no bank key, in any spelling a student types or the editor writes, is called unfinished or too long', () => {
  const { hasDanglingOperator, isOverLongAnswer, typedEntryNotice } = guard;
  let spellings = 0;
  let longest = '';
  for (const { source, field } of typedFieldCorpus()) {
    const keys = [field.expected, ...(Array.isArray(field.accepted) ? field.accepted : [])].filter((key) => key !== null && key !== undefined).map(String);
    for (const key of keys) {
      const all = [key];
      try { typedSpellingsOf(key, field).forEach(({ spelling }) => all.push(spelling)); } catch { /* a key the spellings cannot read gets none */ }
      try { editorTypedSpellings(key).forEach((spelling) => all.push(spelling)); } catch { /* as above */ }
      for (const spelling of all) {
        spellings += 1;
        if (spelling.length > longest.length) longest = spelling;
        assert.equal(hasDanglingOperator(spelling), false, `${source}: ${JSON.stringify(spelling)} (key ${JSON.stringify(key)}) is called unfinished`);
        assert.equal(isOverLongAnswer(spelling), false, `${source}: a ${spelling.length}-character spelling of ${JSON.stringify(key)}`);
        assert.equal(typedEntryNotice(spelling), '', spelling);
      }
    }
  }
  assert.ok(spellings > 4000, `only ${spellings} spellings: the corpus broke`);
  // Room to spare: the longest right answer is well inside the limit.
  assert.ok(longest.length <= 200, `the longest right spelling is ${longest.length} characters: ${longest}`);
});

test('#558, the work: no typed-field comparison reaches the simplifier, statically', () => {
  // mathjs's rule matcher is what makes 48 like terms cost 40 s where it is
  // asked (Step Algebra; the handoff's "A long side"). The typed-field graders
  // read text with their own parsers. Held on the import graph, so a later
  // change that reaches for simplify() here fails this test, not a student's tab.
  const reaches = (entry) => {
    const seen = new Set();
    const walk = (file) => {
      if (seen.has(file) || !existsSync(file)) return;
      seen.add(file);
      const source = readFileSync(file, 'utf8');
      for (const match of source.matchAll(/(?:from\s+|import\s*\(\s*|import\s+|require\(\s*)['"](\.[^'"]+)['"]/g)) {
        let next = path.resolve(path.dirname(file), match[1]);
        if (!existsSync(next) && existsSync(`${next}.js`)) next = `${next}.js`;
        walk(next);
      }
    };
    walk(path.join(repo, entry));
    return [...seen].map((file) => path.relative(repo, file));
  };
  for (const entry of ['functions/shared/typedEntryGuard.mjs', 'functions/shared/answerEquivalence.mjs', 'functions/shared/answerUtils.mjs', 'functions/shared/formSpecificFieldGrading.mjs', 'functions/shared/ordinaryResponseGrading.mjs']) {
    const modules = reaches(entry);
    assert.ok(modules.length >= 1 && modules.includes(entry));
    assert.deepEqual(modules.filter((file) => /safeMath|algebraAstEngine|simplify(?:Core|Rules|Budget)|node_modules/.test(file)), [], `${entry} reaches the math engine`);
  }
  // The walk can see it: Step Algebra's grader does reach it.
  assert.ok(reaches('functions/shared/serverGrading/stepAlgebraEquivalence.mjs').some((file) => /safeMath/.test(file)));
  assert.deepEqual(reaches('functions/shared/typedEntryGuard.mjs'), ['functions/shared/typedEntryGuard.mjs'], 'the entry rule imports nothing: it is in the first load');
});

test('#558, the work: many short terms inside 240 characters cost milliseconds, in every comparison', async (t) => {
  // 48 like terms with varied coefficients, a 100-link division chain, 48
  // binomials: each inside the limit, each a shape whose cost is set by its
  // terms. Every comparison a typed field can name is asked, against keys of
  // each kind; the slowest must stay far under a second (it takes about
  // 10 ms on a developer machine; the bound leaves a slow runner room).
  const rng = createRng('typed-entry-work');
  const inputs = new Set([
    Array.from({ length: 48 }, (_, index) => `${index + 2}x`).join('+'),
    `x${Array.from({ length: 60 }, (_, index) => `/${index + 2}`).join('')}`,
    `x${'/2'.repeat(119)}`,
    '(x+1)'.repeat(48),
    `y=${Array.from({ length: 47 }, (_, index) => `${index + 2}x`).join('+')}`,
    `${'('.repeat(119)}x${')'.repeat(119)}`,
    '(\\frac{1}{2}+'.repeat(18),
  ]);
  for (let index = 0; index < 40; index += 1) inputs.add(fuzzInputs.manyTermsInput(rng));
  const keys = ['5x', 'x^2+5x+6', '(x+2)(x+3)', '\\frac{x+1}{x-2}', '3\\sqrt{2}', '12', 'x/4', 'y=2x+1', 'y-5=2(x-1)', '2x+3y=6', 'x^2+5x+6=0', 'y<2x+1', '(2,3)', '[-3, 5)', '|x-3|=5'];
  const comparisons = {
    sameValue: (typed, key) => sameValue(typed, key),
    'sameValue (typed box, any line form)': (typed, key) => sameValue(typed, key, 1e-6, { typed: true, exactNumber: true, anyLineForm: true }),
    matchesFieldAnswer: (typed, key) => matchesFieldAnswer(typed, { answer: key }),
    equivalentExpression: (typed, key) => matchesFieldAnswer(typed, { answer: key, gradingMode: 'equivalentExpression' }),
    factoredForm: (typed, key) => matchesFieldAnswer(typed, { answer: key, gradingMode: 'factoredForm' }),
    simplestRadicalForm: (typed, key) => matchesFieldAnswer(typed, { answer: key, gradingMode: 'simplestRadicalForm' }),
    simplifiedPolynomial: (typed, key) => matchesFieldAnswer(typed, { answer: key, answerForm: 'simplifiedPolynomial' }),
    polynomialRelation: (typed, key) => equivalence.samePolynomialEquationRelation(typed, key),
    rationalExpression: (typed, key) => equivalence.sameRationalExpression(typed, key),
    nonnegativeRadicalExpression: (typed, key) => equivalence.sameNonnegativeRadicalExpression(typed, key),
    absoluteLinearRelation: (typed, key) => equivalence.sameAbsoluteValueLinearEquation(typed, key),
    modelEquation: (typed, key) => equivalence.sameCommutativeModelEquation(typed, key),
    setBuilder: (typed, key) => equivalence.sameSetBuilderNotation(typed, key),
    interval: (typed, key) => equivalence.sameIntervalNotation(typed, key),
  };
  let slowest = { ms: 0 };
  let asked = 0;
  for (const typed of inputs) {
    assert.ok(typed.length <= 240, `${typed.length} characters`);
    for (const [name, compare] of Object.entries(comparisons)) {
      for (const key of keys) {
        const started = performance.now();
        try { compare(typed, key); } catch { /* a throw is the fuzz harness's to find; this holds the time */ }
        const ms = performance.now() - started;
        asked += 1;
        if (ms > slowest.ms) slowest = { ms, name, key, typed };
      }
    }
  }
  assert.ok(asked > 6000, `${asked} comparisons`);
  t.diagnostic(`${asked} comparisons; the slowest, ${slowest.name}, took ${slowest.ms.toFixed(1)} ms on a ${slowest.typed.length}-character value`);
  assert.ok(slowest.ms < 250, `${slowest.name} took ${Math.round(slowest.ms)} ms on ${JSON.stringify(slowest.typed)} for key ${slowest.key}`);
  // …and through the whole graders, as the server runs them.
  for (const typed of [...inputs].slice(0, 40)) {
    const started = performance.now();
    onServer(multiAnswer('5x', { inputProfile: 'expression' }), typed);
    await mathPath.gradeResponse(pathGrading('5x', { inputProfile: 'expression' }), { responses: { answer: typed } });
    const ms = performance.now() - started;
    assert.ok(ms < 250, `the server's graders took ${Math.round(ms)} ms on ${JSON.stringify(typed)}`);
  }
});

test('what the box says: fixed sentences, with what the refusal cost', () => {
  const { typedEntryNotice, typedEntryProblem, TYPED_ENTRY_MESSAGES } = guard;
  assert.equal(typedEntryProblem('12 +'), 'unfinished');
  assert.equal(typedEntryProblem('x'.repeat(241)), 'tooLong');
  assert.equal(typedEntryProblem(`${'x'.repeat(241)}+`), 'tooLong', 'the length is said first');
  assert.equal(typedEntryProblem('12'), null);
  assert.equal(typedEntryNotice('12'), '');
  assert.equal(typedEntryNotice(''), '');
  assert.match(typedEntryNotice('12 +'), /not finished/);
  assert.match(typedEntryNotice('12 +'), /no try is used/);
  assert.match(typedEntryNotice('x'.repeat(241)), /240 characters/);
  assert.match(typedEntryNotice('x'.repeat(241)), /no try is used/);
  assert.doesNotMatch(typedEntryNotice('12 +', { tries: false }), /try/);
  // A box of words is read for its length only; a key written that way steps the rule aside.
  assert.equal(typedEntryNotice('A+', { words: true }), '');
  assert.match(typedEntryNotice('x'.repeat(241), { words: true }), /240 characters/);
  assert.equal(typedEntryNotice('x+', { keys: ['x+'] }), '');
  assert.equal(Object.isFrozen(TYPED_ENTRY_MESSAGES), true);
});
