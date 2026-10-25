// AN ANSWER BOX'S EXAMPLE IS NOT CUT OFF (FB16, "for exampl…").
//
// The placeholder of an empty answer box used to read "for example (2, -5)".
// Four boxes to a row at 1366 are 167px wide (127px of text room), and that
// sentence needs 212px of it: the box said "for exampl" and the example, the
// only informative part, was cut away (measured in the browser on Algebra I
// Module 2 Topic 2: 56 of the 180 answer boxes in the two lessons). On a phone
// the boxes are wider and the placeholder is scaled down by CSS, so the phone
// was fine; the laptop was not.
//
// The words now live above the box, where they wrap, and the box keeps the
// example alone: "(2, -5)" needs 71px. An author's own placeholder is untouched.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { ANSWER_FORMAT_IDS, describeAnswerFormat, describeBoxPlaceholder, exampleFor } from '../../src/platform/interaction/answerFormatHints.js';

test('a declared format gives the box its example alone, and says the words above it', () => {
  const pair = describeBoxPlaceholder({ answerFormat: 'orderedPair' });
  assert.deepEqual(pair, { placeholder: '(2, -5)', example: '(2, -5)' });
  assert.equal(describeBoxPlaceholder({ answerFormat: 'number' }).placeholder, '-4');
  assert.equal(describeBoxPlaceholder({ answerFormat: 'expression' }).placeholder, '2x + 1');
  assert.equal(describeBoxPlaceholder({ inputProfile: 'set' }).placeholder, '{1, 2, 3}');
  assert.equal(describeBoxPlaceholder({ inputContract: { format: 'inequality' } }).example, '0 ≤ x ≤ 4');
});

test('no box says "for example": every example is short enough for the narrowest box', () => {
  for (const id of ANSWER_FORMAT_IDS) {
    const box = describeBoxPlaceholder({ answerFormat: id });
    assert.equal(box.placeholder, exampleFor(id), id);
    assert.doesNotMatch(box.placeholder, /for example/i, id);
    // 71px for "(2, -5)" (7 characters) against 127px of room in a four-to-a-row box:
    // nine characters is the longest example, and it fits.
    assert.ok(box.placeholder.length <= 10, `${id}: "${box.placeholder}" is ${box.placeholder.length} characters`);
  }
  // The sentence the box used to carry is still there for anything that wants it.
  assert.equal(describeAnswerFormat({ answerFormat: 'orderedPair' }).placeholder, 'for example (2, -5)');
});

test('an author\'s own placeholder is kept word for word, with no example stated above it', () => {
  assert.deepEqual(describeBoxPlaceholder({ answerFormat: 'number', placeholder: 'minutes' }), { placeholder: 'minutes', example: '' });
  assert.deepEqual(describeBoxPlaceholder({ placeholder: '  your answer here ' }), { placeholder: 'your answer here', example: '' });
});

test('a box that declares no format has no example, unless its input kind implies one', () => {
  assert.deepEqual(describeBoxPlaceholder({ id: 'mystery' }), { placeholder: 'Type your answer', example: '' });
  assert.deepEqual(describeBoxPlaceholder({ id: 'zeros' }, { inferredExample: '{1, 2, 3}' }), { placeholder: '{1, 2, 3}', example: '{1, 2, 3}' });
  // What a field declares outranks what its input kind implies.
  assert.equal(describeBoxPlaceholder({ answerFormat: 'number' }, { inferredExample: '{1, 2, 3}' }).example, '-4');
});

test('the multi-answer box takes its placeholder from that, and the line above it says "For example"', () => {
  const source = readFileSync(new URL('../../src/MultiAnswerGrader.jsx', import.meta.url), 'utf8');
  assert.match(source, /const box = describeBoxPlaceholder\(field, \{/);
  assert.match(source, /inferredExample: shouldUseSetInput\(field\) \? '\{1, 2, 3\}' : shouldUseInequalityInput\(field\) \? '0 ≤ x ≤ 4' : ''/);
  assert.equal((source.match(/placeholder=\{box\.placeholder\}/g) || []).length, 2, 'the text box and the math box');
  assert.match(source, /\{box\.example \? <>\{answerShape\.hint \? ' ' : ''\}For example <strong[^>]*>\{box\.example\}<\/strong>\.<\/> : null\}/);
  assert.doesNotMatch(source, /'for example /, 'no sentence is written into a box');
});
