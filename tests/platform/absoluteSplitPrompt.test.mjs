/*
 * THE ABSOLUTE-VALUE SPLIT SAYS WHAT TO DO IN THE STUDENT'S WORDS (TL45).
 *
 * Opening "Reverse absolute value" in Step Algebra used to say: "Choose the
 * equivalent structure yourself. Then enter the split bounds and relation
 * symbols MathMaster should check." That is the system's vocabulary, dense for
 * a Warm-Up. The message now names the two buttons exactly as they are drawn
 * and says what to fill in, and still never says which choice is right.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../../src/MultiRelationAlgebraCore.jsx', import.meta.url), 'utf8');

// The message shown when the split opens (the reverseAbsolute action).
const opened = source.slice(source.indexOf("if (id === 'reverseAbsolute')"), source.indexOf("if (id === 'squareRoot')"));
const message = opened.match(/text: '([^']+)'/g)?.at(-1)?.slice(7, -1) || '';
// The buttons' own labels, read from the panel, not from the message.
const panel = source.slice(source.indexOf('Reverse absolute value</strong>'));
const buttonLabels = [...panel.matchAll(/applyAbsoluteSplitChoice\('(?:or|and)'\)[^>]*>\s*([^<]+?)\s*</g)].map((match) => match[1]);

test('the split panel draws two choices', () => {
  assert.equal(buttonLabels.length, 2, `found ${JSON.stringify(buttonLabels)}`);
});

test('the opening message names each choice as its button does, and what to fill in', () => {
  assert.ok(message, 'the message is found');
  buttonLabels.forEach((label) => assert.ok(message.includes(label), `"${message}" names "${label}"`));
  assert.match(message, /absolute value bars/);
  assert.match(message, /number/);
  assert.match(message, /sign/);
});

test('it speaks to the student, not about the platform, and gives nothing away', () => {
  assert.doesNotMatch(message, /MathMaster|platform|should check|split bounds|relation symbols|equivalent structure/i);
  assert.doesNotMatch(message, /\b(?:use|the right one is|it is)\s+(?:Two branches|Three-part)/i, 'it does not say which choice fits');
});
