// TL18 (C1-48): on an ordinary assignment the graphing calculator is mounted
// per question, so a student's lines vanished on the next question (a secure
// test keeps them). They are now kept for the assignment in this tab.

import test from 'node:test';
import assert from 'node:assert/strict';

import { GRAPHING_LINES_MAX, graphingLinesKeyFor, readGraphingLines, writeGraphingLines } from '../../src/components/calculator/graphingLineMemory.js';
import { buildQuestionDraftKey } from '../../src/questionDraftStorage.js';
import { componentSource } from './helpers/sourceContract.mjs';

const memoryStorage = () => {
  const items = new Map();
  return {
    getItem: (key) => (items.has(key) ? items.get(key) : null),
    setItem: (key, value) => items.set(key, String(value)),
    removeItem: (key) => items.delete(key),
    items,
  };
};

test('one key per student and assignment, the same on every question of it', () => {
  const draft = (questionIndex) => buildQuestionDraftKey({ studentId: 'S1', assignmentId: 'A1', questionIndex, variantIndex: 0 });
  const first = graphingLinesKeyFor(draft(0));
  assert.ok(first);
  assert.equal(graphingLinesKeyFor(draft(5)), first, 'question 6 finds question 1\'s lines');
  assert.notEqual(graphingLinesKeyFor(buildQuestionDraftKey({ studentId: 'S1', assignmentId: 'A2', questionIndex: 0, variantIndex: 0 })), first);
  assert.notEqual(graphingLinesKeyFor(buildQuestionDraftKey({ studentId: 'S2', assignmentId: 'A1', questionIndex: 0, variantIndex: 0 })), first);
  assert.equal(graphingLinesKeyFor(null), null, 'no assignment draft key, nothing kept');
  assert.equal(graphingLinesKeyFor('path:something'), null);
});

test('the lines round-trip as plain text, bounded, and an empty set is not stored', () => {
  const storage = memoryStorage();
  writeGraphingLines('k', ['y=2x+1', 'x^2-4'], storage);
  assert.deepEqual(readGraphingLines('k', storage), ['y=2x+1', 'x^2-4']);
  writeGraphingLines('k', Array.from({ length: 30 }, (_, n) => `y=${n}x`), storage);
  assert.equal(readGraphingLines('k', storage).length, GRAPHING_LINES_MAX);
  writeGraphingLines('k', ['x'.repeat(500)], storage);
  assert.equal(readGraphingLines('k', storage)[0].length, 200);
  writeGraphingLines('k', ['', '  '], storage);
  assert.equal(storage.items.has('k'), false, 'nothing typed, nothing kept');
  storage.setItem('k', 'not json');
  assert.deepEqual(readGraphingLines('k', storage), [], 'junk reads as nothing');
  storage.setItem('k', JSON.stringify([1, { x: 1 }, 'y=x']));
  assert.deepEqual(readGraphingLines('k', storage), ['y=x']);
  // No storage (a blocked or private context): nothing breaks.
  assert.deepEqual(readGraphingLines('k', null), []);
  assert.doesNotThrow(() => writeGraphingLines('k', ['y=x'], { setItem: () => { throw new Error('full'); }, removeItem: () => {} }));
});

test('the assignment calculator keeps its lines under that key', () => {
  const engine = componentSource('src/QuestionEngine.jsx');
  assert.match(engine, /keepLinesKey=\{graphingLinesKeyFor\(draftKey\)\}/);
  assert.match(componentSource('src/components/calculator/AssignmentGraphingCalculator.jsx'), /keepLinesKey=\{keepLinesKey\}/);
  const panel = componentSource('src/components/assessment/GraphingCalculatorPanel.jsx');
  assert.match(panel, /const kept = readGraphingLines\(keepLinesKey\);/);
  assert.match(panel, /writeGraphingLines\(keepLinesKey, lines\.map\(\(line\) => line\.text\)\);/);
});
