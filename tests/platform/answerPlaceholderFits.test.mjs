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
import { executableSource, region } from './helpers/sourceContract.mjs';

test('a declared format gives the box its example alone, and says the words above it', () => {
  const pair = describeBoxPlaceholder({ answerFormat: 'orderedPair' });
  assert.deepEqual(pair, { placeholder: '(2, -5)', example: '(2, -5)' });
  assert.equal(describeBoxPlaceholder({ answerFormat: 'number' }).placeholder, '-4');
  assert.equal(describeBoxPlaceholder({ answerFormat: 'expression' }).placeholder, '2x + 1');
  assert.equal(describeBoxPlaceholder({ inputProfile: 'set' }).placeholder, '{1, 2, 3}');
  // An inequality's example is letters (no item's answer: inequalityExample.test.mjs).
  assert.equal(describeBoxPlaceholder({ inputContract: { format: 'inequality' } }).example, 'a ≤ x ≤ b');
});

test('no box says "for example": every example is short enough for the narrowest box', () => {
  for (const id of ANSWER_FORMAT_IDS) {
    const box = describeBoxPlaceholder({ answerFormat: id });
    assert.equal(box.placeholder, exampleFor(id), id);
    assert.doesNotMatch(box.placeholder, /for example/i, id);
    // 71px for "(2, -5)" (7 characters) against 127px of room in a four-to-a-row box:
    // ten characters is the longest example ("y ≥ mx + b"), and it fits.
    for (const example of [box.placeholder, exampleFor(id, { twoVariables: true })]) {
      assert.ok(example.length <= 10, `${id}: "${example}" is ${example.length} characters`);
    }
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
  assert.deepEqual(describeBoxPlaceholder({ id: 'zeros' }, { inferredFormat: 'set' }), { placeholder: '{1, 2, 3}', example: '{1, 2, 3}' });
  assert.equal(describeBoxPlaceholder({ id: 'solution' }, { inferredFormat: 'inequality' }).example, 'a ≤ x ≤ b');
  // What a field declares outranks what its input kind implies.
  assert.equal(describeBoxPlaceholder({ answerFormat: 'number' }, { inferredFormat: 'set' }).example, '-4');
});

test('the multi-answer box takes its placeholder from that, and the line above it says "For example"', () => {
  const source = readFileSync(new URL('../../src/MultiAnswerGrader.jsx', import.meta.url), 'utf8');
  // The box's example comes from answerFormatHints alone: the field, the
  // format its input kind implies, and the prompt the student reads.
  const call = region(source, 'const box = describeBoxPlaceholder(field, {', '});', 'the box\'s example');
  assert.match(call, /inferredFormat: shouldUseSetInput\(field\) \? 'set' : shouldUseInequalityInput\(field\) \? 'inequality' : ''/);
  assert.match(call, /\bprompt,?\n/);
  assert.doesNotMatch(executableSource(source), /'0 ≤ x ≤ 4'|'\{1, 2, 3\}'/, 'no example written into the screen');
  assert.equal((source.match(/placeholder=\{box\.placeholder\}/g) || []).length, 2, 'the text box and the math box');
  assert.match(source, /\{box\.example \? <>\{answerShape\.hint \? ' ' : ''\}For example <strong[^>]*>\{box\.example\}<\/strong>\.<\/> : null\}/);
  assert.doesNotMatch(source, /'for example /, 'no sentence is written into a box');
});
