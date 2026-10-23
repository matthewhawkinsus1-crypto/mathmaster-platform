/*
 * FORM-SPECIFIC FIELD GRADING: factoredForm AND simplestRadicalForm.
 *
 * A factoring answer and a "simplify" answer with radicals are graded by their
 * mathematics in a required form, not by their spelling (the comparators have
 * their own suites). These tests hold the WIRING: every surface that marks a
 * field loads the comparators, the student's first load does not, a surface
 * that somehow has not loaded them errs toward "not yet" and never toward
 * credit, and Pre-Flight refuses a key that is not in the form it claims.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { executableSource } from './helpers/sourceContract.mjs';
import { formSpecificComparatorLoaded, matchesFieldAnswer } from '../../functions/shared/answerUtils.mjs';
import { gradeServerResponse } from '../../functions/shared/serverGrading/serverResponseGrading.mjs';
import { buildGradingTrace } from '../../functions/shared/responseInspector.mjs';
import { validateQuestionGradingContracts } from '../../src/platform/grading/gradingContract.js';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const factored = (answer) => ({ id: 'f', label: 'Factored form', answer, inputProfile: 'expression', gradingMode: 'factoredForm' });
const simplest = (answer) => ({ id: 's', label: 'Simplified', answer, inputProfile: 'expression', gradingMode: 'simplestRadicalForm' });
const fieldsResponse = (values) => ({
  kind: 'fields',
  type: 'multiAnswer',
  value: '',
  fields: Object.entries(values).map(([id, value]) => ({ id, value, isComplete: true })),
});

test('the server grades a factoring answer by its factors and a simplify answer by its simplest form', () => {
  const question = {
    type: 'multiAnswer',
    prompt: 'Factor, then simplify.',
    answerFields: [factored('(x+3)(x+4)'), simplest('\\sqrt{2}+1')],
  };
  const grade = (f, s) => gradeServerResponse({ question, response: fieldsResponse({ f, s }) }).isCorrect;
  assert.equal(grade('(x+4)(x+3)', '1+\\sqrt{2}'), true);
  assert.equal(grade('x^2+7x+12', '1+\\sqrt{2}'), false, 'expanded is not factored');
  assert.equal(grade('(x+4)(x+3)', '\\frac{1}{\\sqrt{2}-1}'), false, 'a root left in a denominator');
  assert.equal(grade('(x+4)(x+3)', '2.414'), false, 'a decimal is not the exact answer');
});

test('every surface that marks a field loads the comparators on its own', () => {
  // Each in a fresh process, so one surface's import cannot cover for another's.
  const surfaces = [
    'functions/shared/serverGrading/serverResponseGrading.mjs',
    'functions/shared/serverGrading/questionResponseGrading.mjs',
    'functions/shared/responseInspector.mjs',
    'src/platform/grading/gradingContract.js',
    'functions/shared/formSpecificFieldGrading.mjs',
  ];
  surfaces.forEach((surface) => {
    const script = `
      await import(${JSON.stringify(new URL(surface, `file://${ROOT}`).href)});
      const answers = await import(${JSON.stringify(new URL('functions/shared/answerUtils.mjs', `file://${ROOT}`).href)});
      process.stdout.write(JSON.stringify([
        answers.formSpecificComparatorLoaded('factoredForm'),
        answers.formSpecificComparatorLoaded('simplestRadicalForm'),
        answers.matchesFieldAnswer('(x+4)(x+3)', { answer: '(x+3)(x+4)', gradingMode: 'factoredForm' }),
      ]));`;
    const output = execFileSync(process.execPath, ['--input-type=module', '-e', script], { cwd: ROOT, encoding: 'utf8' });
    assert.deepEqual(JSON.parse(output), [true, true, true], `${surface} grades with the form-specific comparators`);
  });
  // The multi-answer screen is JSX (node cannot import it): its static import.
  const screen = executableSource(readFileSync(new URL('../../src/MultiAnswerGrader.jsx', import.meta.url), 'utf8'));
  assert.match(screen, /^import\s+['"][./]*functions\/shared\/formSpecificFieldGrading\.mjs['"];?$/m,
    'the multi-answer screen registers the comparators it grades with');
});

test('without the comparators a form-specific field accepts only its key as written — never more', () => {
  const script = `
    const answers = await import(${JSON.stringify(new URL('functions/shared/answerUtils.mjs', `file://${ROOT}`).href)});
    const field = { answer: '(x+3)(x+4)', gradingMode: 'factoredForm' };
    process.stdout.write(JSON.stringify([
      answers.formSpecificComparatorLoaded('factoredForm'),
      answers.matchesFieldAnswer('(x+3)(x+4)', field),
      answers.matchesFieldAnswer('(x+3)\\\\left(x+4\\\\right)', field),
      answers.matchesFieldAnswer('(x+4)(x+3)', field),
      answers.matchesFieldAnswer('x^2+7x+12', field),
      answers.matchesFieldAnswer('5\\\\cdot10a', { answer: '50a', gradingMode: 'simplestRadicalForm' }),
    ]));`;
  const output = execFileSync(process.execPath, ['--input-type=module', '-e', script], { cwd: ROOT, encoding: 'utf8' });
  assert.deepEqual(JSON.parse(output), [false, true, true, false, false, false]);
});

test('the student first load does not carry the comparators', () => {
  const guard = readFileSync(new URL('./sharedGradersStayOutOfStartupBundle.test.mjs', import.meta.url), 'utf8');
  ['factoredPolynomialExpressionEquivalence.mjs', 'simplestRadicalFormEquivalence.mjs', 'formSpecificFieldGrading.mjs']
    .forEach((module) => assert.ok(guard.includes(`functions/shared/${module}`), `${module} is on the startup-bundle guard's heavy list`));
});

test('the shared field grader: registered comparators, written-form fallback, unknown modes unchanged', () => {
  assert.equal(formSpecificComparatorLoaded('factoredForm'), true);
  assert.equal(matchesFieldAnswer('(3-4x)(1-6x)', factored('(4x-3)(6x-1)')), true);
  assert.equal(matchesFieldAnswer('(2x+4)(x+5)', factored('2(x+2)(x+5)')), false);
  assert.equal(matchesFieldAnswer('-6+6\\sqrt{3}+9\\sqrt{5}-3\\sqrt{15}', simplest('6\\sqrt{3}-6+9\\sqrt{5}-3\\sqrt{15}')), true);
  assert.equal(matchesFieldAnswer('\\sqrt{48}', simplest('4\\sqrt{3}')), false);
  // A word key in a form-specific field is still its own key.
  assert.equal(matchesFieldAnswer('prime', factored('prime')), true);
});

test('Pre-Flight: the new modes are allowed, and a key not in the form it claims is refused', () => {
  const contract = (field) => validateQuestionGradingContracts({ type: 'multiAnswer', prompt: 'Factor completely.', answerFields: [field] });
  assert.deepEqual(contract(factored('3x^2(2x+y)(4x^2-2xy+y^2)')).errors, []);
  assert.deepEqual(contract(simplest('\\frac{\\sqrt{3}-1}{2}')).errors, []);
  assert.match(contract(factored('x^2+7x+12')).errors.join(' '), /factoredForm.*not written as a product of factors/);
  assert.match(contract(simplest('\\sqrt{48}')).errors.join(' '), /simplestRadicalForm.*not in simplest form/);
  assert.match(contract({ ...factored('(x+1)(x+2)'), gradingMode: 'factoredish' }).errors.join(' '), /unsupported gradingMode "factoredish".*factoredForm.*simplestRadicalForm/);
});

test('the response inspector names the comparator a form-specific field used', () => {
  const trace = buildGradingTrace({
    question: { type: 'multiAnswer', answerFields: [factored('(x+3)(x+4)'), simplest('8\\sqrt{3}')] },
    response: fieldsResponse({ f: '(x+4)(x+3)', s: '8\\sqrt{3}' }),
    grading: null,
  });
  assert.deepEqual(trace.fields.map((field) => field.comparator), ['factored-form', 'simplest-radical-form']);
  assert.deepEqual(trace.fields.map((field) => field.isCorrect), [true, true]);
  assert.deepEqual(trace.fields.map((field) => field.normalized), [null, null], 'no misleading normalized string');
});

test('a root key spelled cbrt( ), ∛, ∜ or root(n)( ) meets what MathLive types', () => {
  // The Path keys its cube-root equations as cbrt(…); MathLive writes \sqrt[3]{…}.
  assert.equal(matchesFieldAnswer('\\sqrt[3]{2x+1}=3', { answer: 'cbrt(2x+1)=3', inputProfile: 'equation' }), true);
  assert.equal(matchesFieldAnswer('\\sqrt[3]{x}', { answer: '∛x' }), true);
  assert.equal(matchesFieldAnswer('\\sqrt[4]{k^3}', { answer: '∜(k^3)' }), true);
  assert.equal(matchesFieldAnswer('\\sqrt[7]{a}', { answer: 'root(7)(a)' }), true);
  assert.equal(matchesFieldAnswer('8\\sqrt{3}', { answer: '8sqrt(3)' }), true);
  assert.equal(matchesFieldAnswer('\\sqrt[3]{2x+1}=4', { answer: 'cbrt(2x+1)=3', inputProfile: 'equation' }), false);
});

test('a key spelled with cbrt( ), ∛, ∜ or root(n)( ) gives the student the nth-root key, not the letters', async () => {
  const { inferRequiredAnswerSymbols } = await import('../../src/platform/interaction/answerEntryTools.js');
  const keys = (key) => inferRequiredAnswerSymbols([key]);
  assert.ok(keys('cbrt(6x^2)/(3x)').includes('ⁿ√'));
  assert.ok(keys('5|b^7|k^5∜(k^3)').includes('ⁿ√'));
  assert.ok(keys('root(7)(a)').includes('ⁿ√'));
  ['c', 'b', 'r', 't', 'o'].forEach((letter) => assert.equal(keys('cbrt(6x^2)/(3x)').includes(letter), false, `no "${letter}" key`));
  assert.deepEqual(keys('root(7)(a)').filter((symbol) => /^[a-z]$/.test(symbol)), ['a']);
  assert.ok(keys('8sqrt(3)').includes('√'), 'a root written straight after its coefficient');
});
