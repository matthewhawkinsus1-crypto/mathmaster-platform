/*
 * A SYSTEM QUESTION KEYED THE WAY THE CATALOG SHOWS (GR31).
 *
 * The type catalog's own example keys a system `answer: { x: 2, y: 5 }` and
 * the V5 compiler writes `answer`, but the grader read only an array in
 * `solution`: a system keyed { x, y } was wrong for every answer, and the
 * server never marked it. These tests pin that every key shape grades alike
 * on the screen and on the server, and that a wrong pair stays wrong.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { gradeSystemResponse, serverGradingSupport, systemSolutionKey } from '../../functions/shared/ordinaryResponseGrading.mjs';
import { QUESTION_TYPE_CATALOG } from '../../src/platform/contract/questionTypeCatalog.js';

test('every key shape reads as the same pair, and grades alike', () => {
  const shapes = [{ solution: [3, 2] }, { solution: { x: 3, y: 2 } }, { answer: { x: 3, y: 2 } }, { answer: '(3, 2)' }, { answer: [3, 2] }];
  for (const shape of shapes) {
    const question = { type: 'system', ...shape };
    assert.deepEqual(systemSolutionKey(question), [3, 2], JSON.stringify(shape));
    assert.equal(gradeSystemResponse(question, '(3, 2)').isCorrect, true, JSON.stringify(shape));
    assert.equal(gradeSystemResponse(question, '(2, 3)').isCorrect, false, `${JSON.stringify(shape)}: swapped`);
    assert.equal(serverGradingSupport(question).supported, true, `${JSON.stringify(shape)}: the server marks it`);
  }
  assert.equal(systemSolutionKey({ type: 'system' }), null);
  assert.equal(serverGradingSupport({ type: 'system' }).supported, false, 'no key, nothing to mark');
});

test('the catalog\'s own example system is answerable', () => {
  const example = QUESTION_TYPE_CATALOG.system.example;
  assert.equal(gradeSystemResponse(example, `(${example.answer.x}, ${example.answer.y})`).isCorrect, true);
});

test('the screen grades the whole question, so it reads either key field', () => {
  const screen = readFileSync(new URL('../../src/SystemGrader.jsx', import.meta.url), 'utf8');
  assert.match(screen, /const graded = gradeSystemResponse\(question, answer\);/);
});
