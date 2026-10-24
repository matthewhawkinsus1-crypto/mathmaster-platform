// RT02: number boxes an older teacher import stamped as set boxes.
//
// Before f0b49bcb the teacher import read a Question Family key such as {{k}}
// as roster braces and stamped the field `type: 'set'` (and `toolProfile:
// 'set'`). Assignments imported then gave students the set keypad for one
// number, and the grader read the box as a list. The field is now READ without
// the stamp, by the keypad and by every grader; the stored question is never
// rewritten.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { matchesFieldAnswer, withoutStaleSetStamp } from '../../functions/shared/answerUtils.mjs';
import { keypadProfileForResponseField } from '../../src/platform/interaction/interactionContract.js';
import { componentSource } from './helpers/sourceContract.mjs';

const stamped = (answer, extra = {}) => ({ id: 'a', label: 'Answer', type: 'set', toolProfile: 'set', answer, ...extra });

test('a stamped box whose every key is one value is read without the stamp', () => {
  for (const key of ['{{k}}', '{{a}}a+{{b}}s={{k}}', '{{m|coef}}', '12', '-2/3', '1280']) {
    const read = withoutStaleSetStamp(stamped(key));
    assert.equal(read.type, undefined, key);
    assert.equal(read.toolProfile, undefined, key);
    assert.equal(read.answer, key, 'the key itself is untouched');
  }
  // An authored keypad other than the set pad is kept.
  assert.equal(withoutStaleSetStamp(stamped('12', { toolProfile: 'number' })).toolProfile, 'number');
  // The stored field is never changed.
  const stored = stamped('{{k}}');
  withoutStaleSetStamp(stored);
  assert.deepEqual(stored, stamped('{{k}}'));
});

test('a real set box keeps its stamp, whatever its key looks like', () => {
  for (const key of ['{1, 2, 3}', '{ {{a}}, {{b}} }', '{}', '∅', '\\emptyset', '1, 2', '-3; 3']) {
    const field = stamped(key);
    assert.equal(withoutStaleSetStamp(field), field, key);
  }
  // One set key among the accepted answers keeps it a set box.
  const mixed = stamped('2', { acceptedAnswers: ['{2}'] });
  assert.equal(withoutStaleSetStamp(mixed), mixed);
  // A box that was never stamped is returned as it is.
  const plain = { id: 'a', answer: '12' };
  assert.equal(withoutStaleSetStamp(plain), plain);
  const noKey = stamped('');
  assert.equal(withoutStaleSetStamp(noKey), noKey);
});

test('a stamped number box gets the number pad and grades a grouped number as the number', () => {
  assert.equal(keypadProfileForResponseField(withoutStaleSetStamp(stamped('1280'))), 'number');
  // The grader reads the stored field the same way, on every surface.
  assert.equal(matchesFieldAnswer('1,280', stamped('1280')), true);
  assert.equal(matchesFieldAnswer('1280', stamped('1280')), true);
  assert.equal(matchesFieldAnswer('1,281', stamped('1280')), false);
  // A real set box still reads a comma as a separator between values.
  assert.equal(matchesFieldAnswer('{1,280}', stamped('{1, 280}')), true);
  assert.equal(matchesFieldAnswer('{1280}', stamped('{1, 280}')), false);
});

test('the multi-answer box renders every field as it is read', () => {
  const grader = componentSource('src/MultiAnswerGrader.jsx');
  assert.match(grader, /answerFields\.filter\(\(field\) => field\?\.id\)\.map\(withoutStaleSetStamp\)/);
});
