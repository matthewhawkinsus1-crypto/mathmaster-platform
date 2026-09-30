import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  inferAnswerFormatFromExpected,
  keypadProfileForResponseField,
  normalizeResponseFieldInteractionContract,
} from '../../src/platform/interaction/interactionContract.js';
import { buildMobileMathTools } from '../../src/platform/interaction/mobileKeypadPolicy.js';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

// PR #398 QA: the three-part answer's y-intercept box said "Write a single
// number." and offered π, e, log and roots on a phone.
test('a field the contract declares a number gets the number pad', () => {
  const compiled = normalizeResponseFieldInteractionContract({ id: 'b', label: 'y-intercept', answer: '4' });
  assert.equal(compiled.inputProfile, 'number');
  assert.equal(keypadProfileForResponseField(compiled), 'number');
  assert.equal(keypadProfileForResponseField({ id: 'p', answerFormat: 'orderedPair', answer: '(2, -5)' }), 'orderedPair');
});

test('a signed fraction of numbers is a number, a fraction with a variable is not', () => {
  for (const value of ['-2/3', '2/3', '\\frac{-2}{3}', '-\\frac{2}{3}', '\\dfrac{1}{2}', '3 / 4']) {
    assert.equal(inferAnswerFormatFromExpected(value), 'number', value);
  }
  for (const value of ['\\frac{A}{b}(x+1)', 'x/3', '-2/3x', '1/2 + 1', '2\\sqrt{3}']) {
    assert.equal(inferAnswerFormatFromExpected(value), 'expression', value);
  }
  const slope = normalizeResponseFieldInteractionContract({ id: 'm', label: 'Slope', answer: '-2/3' });
  assert.equal(slope.answerFormat, 'number');
  assert.equal(keypadProfileForResponseField(slope), 'number');
  assert.ok(slope.requiredSymbols.includes('a⁄b'), 'the fraction key is still required for this answer');
});

test('assignments stored with "expression" for a plain-number key still get the number pad', () => {
  const stored = { id: 'm', inputProfile: 'expression', answerFormat: 'expression', answer: '-2/3', acceptedAnswers: ['-\\frac{2}{3}'] };
  assert.equal(keypadProfileForResponseField(stored), 'number');
});

test('algebra keeps the algebra pad', () => {
  // Any accepted answer that is not a plain number keeps the renderer default.
  assert.equal(keypadProfileForResponseField({ inputProfile: 'expression', answer: '2\\sqrt{3}' }), '');
  assert.equal(keypadProfileForResponseField({ inputProfile: 'expression', answer: '6', acceptedAnswers: ['\\sqrt{36}'] }), '');
  assert.equal(keypadProfileForResponseField({ inputProfile: 'equation', answer: 'y = 2x + 1' }), '');
  assert.equal(keypadProfileForResponseField({ inputProfile: 'interval', answer: '[2, \\infty)' }), '');
  assert.equal(keypadProfileForResponseField({ inputProfile: 'equation', answer: '4' }), '', 'a declared equation is never narrowed');
  assert.equal(keypadProfileForResponseField({ id: 'none' }), '');
});

test('the number pad is digits, sign, decimal point and a fraction key — no π, log or roots', () => {
  const entry = ['7', '8', '9', '4', '5', '6', '1', '2', '3', '0', '.', ',', '−', '+', '='].map((label) => ({ label, command: label }));
  const pad = buildMobileMathTools({
    toolProfile: 'number',
    entryKeys: entry,
    profileKeys: [{ label: 'a⁄b', command: '\\frac{#0}{#?}' }],
    backspaceKey: { label: '⌫', action: 'deleteBackward' },
  }).map((tool) => tool.label);
  assert.deepEqual(pad, ['7', '8', '9', '4', '5', '6', '1', '2', '3', '0', '.', '−', 'a⁄b', '⌫']);
});

test('the multi-answer grader asks the shared policy before falling back to the full pad', () => {
  const source = read('src/MultiAnswerGrader.jsx');
  assert.match(source, /import \{ keypadProfileForResponseField \} from '\.\/platform\/interaction\/interactionContract\.js';/);
  assert.match(
    source,
    /toolProfile=\{field\.toolProfile \|\| \(shouldUseSetInput\(field\) \? 'set' : shouldUseInequalityInput\(field\) \? 'inequality' : keypadProfileForResponseField\(field\) \|\| 'basic'\)\}/,
  );
});

// Once -2/3 is a number, the expression shape guard no longer covered it:
// "m = -2/3" would have been graded wrong and spent a try. Number fields get
// the same guard ("b = 4" in an integer box had the gap already).
test('a number box refuses "m = …" before it can cost a try, and steps aside for keys with "="', async () => {
  const { formatProblemForResponse } = await import('../../src/platform/interaction/answerShapeGuard.js');
  const { gradeMultiAnswerResponse } = await import('../../functions/shared/ordinaryResponseGrading.mjs');
  const slope = normalizeResponseFieldInteractionContract({ id: 'm', label: 'Slope', answer: '-2/3' });
  assert.equal(gradeMultiAnswerResponse({ answerFields: [slope] }, { m: 'm=-2/3' }).isCorrect, false, 'the grader would mark it wrong');
  assert.match(formatProblemForResponse(slope, 'm = -2/3'), /Write only the number, without an equals sign/);
  assert.match(formatProblemForResponse(normalizeResponseFieldInteractionContract({ id: 'b', answer: '4' }), 'b=4'), /Write only the number/);
  assert.equal(formatProblemForResponse(slope, '-\\frac{2}{3}'), '');
  assert.equal(formatProblemForResponse({ answerFormat: 'number', answer: 'x = 3' }, 'x = 3'), '', 'a key that has "=" is never blocked');
});
