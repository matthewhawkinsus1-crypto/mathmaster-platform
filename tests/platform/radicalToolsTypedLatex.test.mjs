// A VALUE A STUDENT TYPED IN A RADICAL CHECK OR THE FINAL SET NEVER CRASHES THE QUESTION.
//
// Nov 16, 2026, Solving Radical Equations — Honors (Step Algebra), in class: a
// value typed in a candidate check arrives from the math box as MathLive's
// LaTeX ("\frac12", "-\frac12", "\sqrt{24}"). The radical tools drew the
// recorded check (and a recorded solution set) through
// relationExpressionToLatex, which parses relation TEXT and throws on any LaTeX
// command. It threw inside render, the question module crashed, and since the
// recorded check is in the saved draft it crashed again on every reload: 5 of
// 9 students' drafts on CW 2 (sqrt(5x - 1) = 2x - 1, check of x = 1/4) and 2
// of 6 on CW 9 (sqrt(1.5h) = 6) could not be finished. The grade was never
// wrong (readExactValue reads these values); only the drawing threw.

import test from 'node:test';
import assert from 'node:assert/strict';

import { relationLatex, typedValueLatex } from '../../src/relationRadicalToolsModel.js';
import { relationExpressionToLatex } from '../../src/algebraRelationFoundation.js';
import { readExactValue } from '../../functions/shared/serverGrading/stepAlgebraRadicalGrading.mjs';
import { componentSource, region } from './helpers/sourceContract.mjs';

// What students' math boxes produced, from the drafts that crashed, and its neighbours.
const TYPED_LATEX = ['\\frac12', '-\\frac12', '\\frac14', '\\frac{1}{2}', '-\\frac{1}{2}', '\\frac{-1}{2}', '\\dfrac{1}{2}', '\\sqrt{24}', '\\sqrt{9}+2', '\\frac{3}{4}+1', '\\sqrt[3]{8}'];
const PLAIN = ['1/2', '-0.5', '3', '-1', '24', '(1) / (4)', '((0) + (1)) / (4)'];
const JUNK = ['', ' ', '\\', '}{', '((', '\\frac', '1//2', '\\unknown{x}', 'x^', '$1$', '%'];

test('neither helper throws, whatever was typed', () => {
  for (const value of [...TYPED_LATEX, ...PLAIN, ...JUNK, null, undefined, 12]) {
    assert.doesNotThrow(() => typedValueLatex(value), `typedValueLatex(${JSON.stringify(value)})`);
    assert.doesNotThrow(() => relationLatex(value), `relationLatex(${JSON.stringify(value)})`);
    assert.equal(typeof typedValueLatex(value), 'string');
    assert.equal(typeof relationLatex(value), 'string');
  }
  // The parser underneath does throw on these: this is what the panels used to call.
  assert.throws(() => relationExpressionToLatex('\\frac12'));
  assert.throws(() => relationExpressionToLatex('\\sqrt{24}'));
});

test('a typed LaTeX value is drawn as the LaTeX it is; plain text as relation text', () => {
  for (const value of TYPED_LATEX) assert.equal(typedValueLatex(value), value);
  assert.equal(typedValueLatex('  \\frac12 '), '\\frac12');
  for (const value of PLAIN) assert.equal(typedValueLatex(value), relationExpressionToLatex(value));
  assert.equal(relationLatex('(1) / (4)'), '\\frac{1}{4}');
  // Unparseable text is shown as written, never thrown: LaTeX as LaTeX, the rest as text.
  assert.equal(relationLatex('\\sqrt{24}'), '\\sqrt{24}');
  assert.match(relationLatex('1//2'), /^\\text\{1\/\/2\}$/);
});

test('the grade reads every value these students typed, as it always did', () => {
  assert.deepEqual(readExactValue('\\frac12'), { n: 1, d: 2 });
  assert.deepEqual(readExactValue('-\\frac12'), { n: -1, d: 2 });
  assert.deepEqual(readExactValue('\\frac{3}{4}+1'), { n: 7, d: 4 });
});

test('the radical tools draw recorded checks and the recorded set through the safe helpers', () => {
  const source = componentSource('src/RelationRadicalTools.jsx');
  assert.match(source, /const latexOf = relationLatex;/);
  assert.doesNotMatch(source, /relationExpressionToLatex\(/, 'nothing here calls the throwing parser directly');
  const card = region(source, 'function CandidateCheckCard(', 'const record = () =>', 'CandidateCheckCard head');
  assert.ok(card);
  const recordedCheck = region(source, '{recorded && !editing ? (', ') : disabled ? (', 'recorded check');
  assert.match(recordedCheck, /<MathDisplay value=\{typedValueLatex\(entry\.left\)\}/);
  assert.match(recordedCheck, /<MathDisplay value=\{typedValueLatex\(entry\.right\)\}/);
  const recordedSet = region(source, 'data-solution-set-recorded="true"', ') : disabled ? (', 'recorded set');
  assert.match(recordedSet, /\$\{latexOf\(variable\)\} = \$\{typedValueLatex\(value\)\}/);
});
