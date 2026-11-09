// THE ANSWER-ENTRY CONTRACT IS NOT IN A STUDENT'S FIRST LOAD (PF01).
//
// App reads one thing from it: which answer box holds the cursor, before a
// server copy remounts the open question (answerFocusPosition, PQ-044). That
// import, from src/platform/interaction/answerEntryUx.js, put the whole
// contract (Enter, focus on open) and the math field's focus handoff under it
// in front of every student's Home: about 2.8 KB gzip. App now reads it from
// src/platform/interaction/answerFocusPosition.js, which answerEntryUx.js
// reads its boxes through and re-exports, so the contract loads with the
// question runtime, the calculator and My Math Path, which use it.
//
// Same walk as tests/platform/initialBundleBoundary.test.mjs (static imports
// from main.jsx, then App.jsx), through tests/platform/helpers/firstLoadGraph.mjs.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { chainTo, firstLoadGraph, repo } from './helpers/firstLoadGraph.mjs';
import * as entry from '../../src/platform/interaction/answerEntryUx.js';
import * as cursor from '../../src/platform/interaction/answerFocusPosition.js';

const graph = firstLoadGraph();
const file = (name) => path.join(repo, name);

test('the walker reaches the first load, and the code that finds the cursor\'s box', () => {
  assert.ok(graph.has(file('src/App.jsx')) && graph.size > 200, `only ${graph.size} modules reached`);
  // What stays, on purpose: App still records the cursor before a restore remount.
  assert.ok(graph.has(file('src/platform/interaction/answerFocusPosition.js')), 'answerFocusPosition.js is no longer reached: the walk or the wiring changed, so the absences below prove nothing');
});

for (const [name, why] of [
  ['src/platform/interaction/answerEntryUx.js', 'the answer-entry contract; App reads only the cursor\'s box (answerFocusPosition.js)'],
  ['src/platform/interaction/mathFieldFocusHandoff.js', 'the math field\'s focus handoff, under the contract'],
]) {
  test(`${path.basename(name)} is not in the first load: ${why}`, () => {
    const key = file(name);
    // A module that was renamed or deleted is in no graph at all: say so, or
    // the absence below proves nothing about the module that took its place.
    assert.ok(existsSync(key), `${name} no longer exists: point this list at the module that holds it now`);
    assert.ok(!graph.has(key), `${name} is in the first load: ${graph.has(key) ? chainTo(graph, key) : ''}`);
  });
}

test('the question runtime reads the cursor\'s box with App\'s own function', () => {
  assert.equal(entry.answerFocusPosition, cursor.answerFocusPosition, 'answerEntryUx.js has a second answerFocusPosition');
  assert.equal(entry.default.answerFocusPosition, cursor.answerFocusPosition, 'the default export carries a second answerFocusPosition');
});

/*
 * App records where the cursor is with answerFocusPosition.js; after the
 * remount QuestionEngine puts it back with answerEntryUx.js's
 * restoreAnswerFocus, which gives up when the question's box count differs
 * from the one recorded. So the two must count the same boxes: a hidden box,
 * one behind aria-hidden and something that cannot take focus are no box to
 * either.
 */
test('a position App records is one the question runtime restores, past boxes neither counts', () => {
  const focused = [];
  const box = (name, extra = {}) => ({ name, hidden: false, getAttribute: () => null, focus: () => focused.push(name), contains: () => false, ...extra });
  const shownFirst = box('first');
  const hidden = box('hidden', { hidden: true });
  const ariaHidden = box('aria-hidden', { getAttribute: (attribute) => (attribute === 'aria-hidden' ? 'true' : null) });
  const notFocusable = { name: 'text', hidden: false, getAttribute: () => null, contains: () => false };
  const shownLast = box('last');
  const boxes = [shownFirst, hidden, ariaHidden, notFocusable, shownLast];
  const root = { querySelectorAll: () => boxes, contains: (node) => boxes.includes(node) };

  const position = cursor.answerFocusPosition(root, shownLast);
  assert.deepEqual(position, { index: 1, count: 2 }, 'the cursor is in the second of two boxes');
  assert.equal(entry.countAnswerControls(root), position.count, 'the question runtime counts the boxes App counted');
  assert.equal(entry.restoreAnswerFocus(root, position), true);
  assert.deepEqual(focused, ['last'], 'back in the box the student was in');
});
