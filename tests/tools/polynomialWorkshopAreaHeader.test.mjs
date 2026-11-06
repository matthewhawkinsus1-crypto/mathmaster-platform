/*
 * THE AREA MODEL WRITES ITS FACTORS AS THE PROMPT DOES
 * (student walkthrough 2026-11-06, Algebra II Honors module 1, part 2, P-5).
 *
 * Polynomial Workshop's multiply-area view printed its binomials'
 * coefficients as they came. Algebra II Honors L4 CW 3 multiplies
 * f(x) = 2x + 3 by g(x) = x − 4, and the model was headed "(2x +3)(1x -4)",
 * with a "1x" column; L4 PR 2 read "(1x +5)(2x -3)". The header and the row
 * and column heads now write each factor as the prompt does: (2x + 3)(x − 4).
 *
 * Node cannot render JSX, so the view's wiring is read from its source; the
 * words come from the pure formatter, checked on every lesson item in the view.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseAssignmentBlueprintText } from '../../src/assignmentBlueprint.js';
import { binomialProductText, binomialTermTexts } from '../../src/tools/polynomialWorkshop/polynomialReadout.js';
import { executableSource, region } from '../platform/helpers/sourceContract.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));

test('the header and the heads write each factor as a teacher writes it', () => {
  assert.equal(binomialProductText([2, 3], [1, -4]), '(2x + 3)(x − 4)');
  assert.equal(binomialProductText([1, 5], [2, -3]), '(x + 5)(2x − 3)');
  assert.deepEqual(binomialTermTexts([1, -4]), ['x', '−4']);
  assert.deepEqual(binomialTermTexts([2, 3]), ['2x', '3']);
  assert.deepEqual(binomialTermTexts([-1, 5]), ['−x', '5']);
  // A template's numbers arrive as text once instantiated.
  assert.deepEqual(binomialTermTexts(['1', '-7']), ['x', '−7']);
});

const lessonFiles = (dir) => readdirSync(dir).sort().flatMap((name) => {
  const path = join(dir, name);
  if (statSync(path).isDirectory()) return lessonFiles(path);
  return name.endsWith('.json') ? [path] : [];
});
// The prompt's spelling and the header's, compared without spaces or the kind of minus.
const compact = (text) => String(text).replace(/\s+/g, '').replace(/-/g, '−');

test('every lesson item in the view is headed with the factors its prompt names', () => {
  const items = lessonFiles(join(ROOT, 'teacher-import-jsons')).flatMap((path) => {
    let questions;
    try { questions = parseAssignmentBlueprintText(readFileSync(path, 'utf8')).questions; } catch { return []; }
    return questions.filter((question) => question.type === 'polynomialWorkshop' && question.mode === 'multiplyArea'
      && [question.leftBinomial, question.rightBinomial].every((pair) => Array.isArray(pair) && pair.every(Number.isFinite)));
  });
  assert.ok(items.length >= 2, `${items.length} items (Algebra II Honors L4 CW 3 and PR 2)`);
  for (const question of items) {
    const header = binomialProductText(question.leftBinomial, question.rightBinomial);
    const [, left, right] = header.match(/^\((.+)\)\((.+)\)$/);
    for (const factor of [left, right]) {
      assert.ok(compact(question.prompt).includes(compact(factor)), `"${question.prompt}" names ${factor} (header ${header})`);
    }
    assert.doesNotMatch(header, /(?<![\d.])1x|-/, `${header}: no 1 before x, and a true minus sign`);
  }
});

test('the multiply-area view heads its model, its rows and its columns with them', () => {
  const view = region(executableSource(readFileSync(join(ROOT, 'src/tools/polynomialWorkshop/PolynomialWorkshop.jsx'), 'utf8')), 'function MultiplyArea(', 'function MissingProblem(', 'the multiply-area view');
  assert.match(view, /<Panel title=\{binomialProductText\(left, right\)\}>/, 'the model\'s header');
  assert.match(view, /const \[leftTerms, rightTerms\] = \[binomialTermTexts\(left\), binomialTermTexts\(right\)\];/);
  for (const head of ['rightTerms[0]', 'rightTerms[1]', 'leftTerms[0]', 'leftTerms[1]']) {
    assert.ok(view.includes(`>{${head}}</strong>`), `the ${head} head`);
  }
  assert.doesNotMatch(view, /\{(?:left|right)\[[01]\]\}x?<\/strong>|\$\{(?:left|right)\[[01]\]\}/, 'no coefficient printed as it came');
});
