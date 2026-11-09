/*
 * THE AREA MODEL'S COEFFICIENT BOX NEVER SHOWS AN ANSWER AS ITS EXAMPLE
 * (student walkthrough 2026-11-06, Algebra II Honors module 1, part 2).
 *
 * Polynomial Workshop's multiply-area view asks for the expanded product as a
 * coefficient list ("Enter coefficients highest degree to constant, separated
 * by commas"). Its empty box showed "2, -5, -12" as the example: the answer to
 * the view's default problem, (2x + 3)(x − 4). Algebra II Honors L4 CW 3
 * multiplies exactly that pair, so a student saw the item's key in the empty
 * box. The example is now the format in letters.
 *
 * Node cannot render JSX, so the example is read from the view's own source;
 * whether it is an answer is then decided by the tool's own grader, on the
 * default problem and on every teacher-import lesson item that uses this view.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import polynomialGrader from '../../functions/shared/serverGrading/tools/polynomialWorkshop.mjs';
import { parseCoefficientList } from '../../functions/shared/toolMath/polynomialWorkshop/polynomialMath.mjs';
import { gradeToolCheck } from '../../src/tools/shared/sharedToolGrading.js';
import { parseAssignmentBlueprintText } from '../../src/assignmentBlueprint.js';
import { executableSource, region } from '../platform/helpers/sourceContract.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const read = (path) => readFileSync(join(ROOT, path), 'utf8');

// The multiply-area view, and in it the box the expanded product is typed in.
const view = region(executableSource(read('src/tools/polynomialWorkshop/PolynomialWorkshop.jsx')), 'function MultiplyArea(', 'function MissingProblem(', 'the multiply-area view');
// (An arrow function in the tag holds a ">", so the tag is cut at its own "/>".)
const label = view.indexOf('aria-label="Expanded polynomial');
const expandedBox = label === -1 ? '' : view.slice(view.lastIndexOf('<input', label), view.indexOf('/>', label) + 2);
const example = /\bplaceholder="([^"]*)"/.exec(expandedBox)?.[1] ?? '';

// The area-model work for (ax + b)(cx + d), and the coefficient list it expands to.
const cellsFor = ([a, b], [c, d]) => [a * c, a * d, b * c, b * d].map(String);
const keyFor = ([a, b], [c, d]) => [a * c, a * d + b * c, b * d].join(', ');

const lessonFiles = (dir) => readdirSync(dir).sort().flatMap((name) => {
  const path = join(dir, name);
  if (statSync(path).isDirectory()) return lessonFiles(path);
  return name.endsWith('.json') ? [path] : [];
});
// Every lesson item in this view with numeric binomials, compiled as an import compiles it.
const lessonItems = lessonFiles(join(ROOT, 'teacher-import-jsons')).flatMap((path) => {
  let questions;
  try { questions = parseAssignmentBlueprintText(readFileSync(path, 'utf8')).questions; } catch { return []; }
  return questions.filter((question) => question.type === 'polynomialWorkshop' && question.mode === 'multiplyArea'
    && [question.leftBinomial, question.rightBinomial].every((pair) => Array.isArray(pair) && pair.every(Number.isFinite)))
    .map((question) => ({ name: `${path.replace(ROOT, '')} ${question.questionId}`, question }));
});

test('the expanded-polynomial box shows an example of the format, and it holds no number', () => {
  assert.ok(expandedBox, 'the multiply-area view has its expanded-polynomial box');
  assert.ok(example.trim(), 'the box still shows the format');
  assert.deepEqual(parseCoefficientList(example), [], `"${example}" is no coefficient list, so it is no item's key`);
});

test('typed as the answer, the example is wrong on the default problem and on every lesson item in this view', () => {
  const problems = [
    { name: 'the default problem', question: { type: 'polynomialWorkshop', mode: 'multiplyArea' }, left: [2, 3], right: [1, -4] },
    ...lessonItems.map(({ name, question }) => ({ name, question, left: question.leftBinomial, right: question.rightBinomial })),
  ];
  assert.ok(example.trim(), 'the box shows an example to test');
  assert.ok(lessonItems.length >= 2, `the lesson items in this view are found (${lessonItems.length})`);
  for (const { name, question, left, right } of problems) {
    const cells = cellsFor(left, right);
    assert.equal(gradeToolCheck(polynomialGrader, question, { cells, expanded: keyFor(left, right) }).isCorrect, true, `${name}: its own key is right`);
    assert.equal(gradeToolCheck(polynomialGrader, question, { cells, expanded: example }).isCorrect, false, `${name}: the box's example is not its answer`);
  }
});
