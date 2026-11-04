// Unicode superscripts reach MathLive as powers, never as carets.
//
// The radicals and exponents lessons write powers the way they look: "(−3)⁴",
// "⁶√(x¹⁸)", "(x⁻²y⁻³)", "aⁿ". MathLive read every superscript but ² and ³
// as a caret, so a math-only part label or choice showed "(−3)ˆ4" and
// "ˆ6√(xˆ1ˆ8)": 25 of the 98 Radicals and Rational Exponents questions in
// PR #537, and about 130 labels in lessons already live (F-SUPERSCRIPT-CARET,
// docs/qa/2026-11-03-pr537-walkthrough). MathDisplay now rewrites every run
// (mathDisplayFormat.js). This sweep puts every lesson string MathDisplay
// draws through the same steps and allows no Unicode superscript to reach
// MathLive.

import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { stackDivisions } from '../../functions/shared/stackDivisions.mjs';
import { isMathSegment, normalizePlainMathTypography, splitMathSegments, unwrapMathSegment } from '../../src/components/common/mathSegments.js';
import { labelLooksLikeMath } from '../../src/labelFormat.js';
import {
  braceScriptGroups,
  latexFunctionNames,
  resolveMathDisplayFormat,
  unicodeSubscriptsToMathMarkup,
  unicodeSuperscriptsToMathMarkup,
} from '../../src/mathDisplayFormat.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (file) => readFileSync(path.join(ROOT, file), 'utf8');

// MathDisplay.jsx, from the value it is given to the markup MathLive parses.
const drawn = (value, requested = 'auto') => {
  const clean = stackDivisions(value, { unicodeMath: true });
  const format = resolveMathDisplayFormat(clean, requested);
  return { format, value: latexFunctionNames(braceScriptGroups(unicodeSuperscriptsToMathMarkup(unicodeSubscriptsToMathMarkup(clean, format), format), format), format) };
};
// A math-only label or choice (MultiAnswerGrader.jsx: normalizeMathDisplayValue, ascii-math).
const label = (text) => drawn(normalizePlainMathTypography(text), 'ascii-math');

test('a power written as a superscript is a power in the format MathLive parses', () => {
  assert.deepEqual(label('(−3)⁴ ='), { format: 'ascii-math', value: '(−3)^(4) =' });
  assert.deepEqual(label('(x⁻²y⁻³)(x⁻³y⁵)'), { format: 'ascii-math', value: '(x^(-2)y^(-3))(x^(-3)y^(5))' });
  assert.deepEqual(label('∛(125m³⁰p²⁰) ='), { format: 'ascii-math', value: '∛(125m^(30)p^(20)) =' });
  assert.deepEqual(label('aⁿ'), { format: 'ascii-math', value: 'a^(n)' });
  assert.deepEqual(label('f⁻¹(x)'), { format: 'ascii-math', value: 'f^(-1)(x)' });
  // An author's x^4 and 2^x became x⁴ and 2ˣ on their way to the label.
  assert.equal(label('x^4').value, 'x^(4)');
  assert.equal(label('2^x').value, '2^(x)');
  assert.equal(unicodeSuperscriptsToMathMarkup('x¹⁸y⁻²', 'latex'), 'x^{18}y^{-2}');
});

test('an index written before √ is the radical\'s index, drawn by LaTeX', () => {
  assert.deepEqual(label('⁶√(x¹⁸) ='), { format: 'latex', value: '\\sqrt[6]{x^{18}} =' });
  assert.deepEqual(label('⁵√(32x⁵y¹⁰) ='), { format: 'latex', value: '\\sqrt[5]{32x^{5}y^{10}} =' });
  assert.deepEqual(label('ⁿ√a · ⁿ√b'), { format: 'latex', value: '\\sqrt[n]{a} · \\sqrt[n]{b}' });
  assert.equal(label('ⁿ√a / ⁿ√b').value, '\\frac{\\sqrt[n]{a}}{\\sqrt[n]{b}}');
  assert.equal(label('(⁵√32)² = 2² = 4').value, '(\\sqrt[5]{32})^{2} = 2^{2} = 4');
  assert.equal(label('⁴√b').value, '\\sqrt[4]{b}');
});

test('a superscript after a factor is its power, even before √', () => {
  assert.deepEqual(label('24x³y⁴√6'), { format: 'ascii-math', value: '24x^(3)y^(4)√6' });
  assert.deepEqual(label('x³√x'), { format: 'ascii-math', value: 'x^(3)√x' });
});

test('words are left as written', () => {
  assert.equal(unicodeSuperscriptsToMathMarkup('\\text{m²} + x²', 'latex'), '\\text{m²} + x^{2}');
  assert.equal(unicodeSuperscriptsToMathMarkup('"cm²" x²', 'ascii-math'), '"cm²" x^(2)');
  assert.equal(unicodeSuperscriptsToMathMarkup('x^2 + 1', 'ascii-math'), 'x^2 + 1');
});

test('MathDisplay rewrites the superscripts of the value it typesets, and the grader leaves them to it', () => {
  const display = read('src/MathDisplay.jsx');
  assert.match(display, /const typesetValue = [^;\n]*unicodeSuperscriptsToMathMarkup\(unicodeSubscriptsToMathMarkup\(cleanValue, resolvedFormat\), resolvedFormat\)/);
  const grader = read('src/MultiAnswerGrader.jsx');
  assert.match(grader, /const normalizeMathDisplayValue = \(value\) => normalizePlainMathTypography\(value\);/);
});

// ─── Every lesson ───────────────────────────────────────────────────────────

const LESSON_DIRS = ['teacher-import-jsons', 'docs/assignments', 'seed', 'functions/seeds'];
const NOT_SHOWN = /\/(generator|derived|constraints|accepted|acceptedAnswers|id|questionId|validSchemes)(\/|$)/;
const SUPERSCRIPT = /[⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻⁼⁽⁾ⁿⁱˣ]/;

const jsonFiles = (dir) => readdirSync(dir).flatMap((name) => {
  const full = path.join(dir, name);
  if (statSync(full).isDirectory()) return jsonFiles(full);
  return name.endsWith('.json') ? [full] : [];
});

// What MathDisplay draws from each lesson string: a math-only string whole
// (a part label or a choice), and each $…$ span of the rest.
const DRAWN = (() => {
  const found = new Map();
  const collect = (value, where) => {
    if (typeof value === 'string') {
      if (NOT_SHOWN.test(where)) return;
      const shown = value.replace(/\{\{\s*[A-Za-z_]\w*(\|[^}]*)?\s*\}\}/g, '3');
      if (labelLooksLikeMath(shown)) {
        if (SUPERSCRIPT.test(normalizePlainMathTypography(shown))) found.set(`label:${shown}`, { where, drawn: label(shown) });
        return;
      }
      for (const segment of splitMathSegments(shown).filter(isMathSegment)) {
        const math = unwrapMathSegment(segment).value;
        if (SUPERSCRIPT.test(math)) found.set(`math:${math}`, { where, drawn: drawn(math) });
      }
    } else if (Array.isArray(value)) value.forEach((item, index) => collect(item, `${where}/${index}`));
    else if (value && typeof value === 'object') Object.entries(value).forEach(([key, item]) => collect(item, `${where}/${key}`));
  };
  LESSON_DIRS.flatMap((dir) => jsonFiles(path.join(ROOT, dir)))
    .forEach((file) => collect(JSON.parse(readFileSync(file, 'utf8')), path.relative(ROOT, file)));
  return found;
})();

// Words a format leaves alone: LaTeX \text{…} and ASCIIMath "…".
const withoutWords = ({ format, value }) => (format === 'latex'
  ? value.replace(/\\(?:text|mathrm|operatorname|textrm|mbox)\s*\{[^{}]*\}/g, '')
  : value.replace(/"[^"]*"/g, ''));

test('the sweep reads the lessons that write their powers as superscripts', () => {
  const indexed = [...DRAWN.values()].filter(({ drawn: { value } }) => /\\sqrt\[/.test(value));
  assert.ok(DRAWN.size > 800, `read ${DRAWN.size} drawn strings with a superscript`);
  assert.ok(indexed.length >= 25, `read ${indexed.length} radicals with a written index`);
});

test('no lesson hands MathLive a Unicode superscript', () => {
  const left = [...DRAWN].filter(([, { drawn: shown }]) => SUPERSCRIPT.test(withoutWords(shown)))
    .map(([text, { where, drawn: shown }]) => `${where}: ${text} → ${shown.value}`);
  assert.deepEqual(left.slice(0, 8), [], `${left.length} still drawn with a superscript character`);
});
