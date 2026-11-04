/*
 * THE KEYPAD A SECURE EXPRESSION OR EQUATION FIELD GETS (TS05; the owner's
 * decision).
 *
 * A secure field's math editor opens no phone keyboard: its keypad is the
 * keyboard. A phone's expression keypad had no letter, set-notation or ln key,
 * and its equation keypad typed no letter but x, y and f. Following the
 * inequality pattern (TS04), each now offers:
 *
 *   the letters the student reads: the single letters of the prompt's
 *   mathematics and the field's own label, beside x and y on every one;
 *   set notation, { } | ≠ < > ≤ ≥ ∅, and ln, the same on every item.
 *
 * THE KEYPAD SAYS NOTHING ABOUT THE ANSWER: nothing in it comes from the key.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import {
  EVERY_INEQUALITY_LETTER, SECURE_ANSWER_EDITORS, SECURE_LETTER_PROFILES, SECURE_PROFILE_KEYS,
  secureAnswerEntryFor, secureFieldLetters, secureKeypadKeys,
} from '../../src/platform/assessment/secureAnswerEntry.js';

const require = createRequire(import.meta.url);
const mathPath = require('../../functions/lib/mathPath.js');
const secureItems = require('../../functions/lib/secureItems.js');

const grades = async (response, expected, { profile = 'expression', equivalence = null } = {}) => {
  const grading = mathPath.privateGradingDefinition({
    responseFields: [{ id: 'answer', inputProfile: profile, expected, ...(equivalence ? { equivalence } : {}) }],
  });
  return (await secureItems.gradeItem(grading, { responses: { answer: response } })).isCorrect === true;
};

const labels = (keys) => keys.map((key) => key.label);
const SET_NOTATION_AND_LN = ['{', '}', '|', '≠', '<', '>', '≤', '≥', '∅', 'ln'];

test('an expression\'s and an equation\'s keypad: set notation and ln, then the letters the student reads, beside x and y', () => {
  for (const profile of ['expression', 'equation']) {
    assert.deepEqual(labels(secureKeypadKeys({ inputProfile: profile })), [...SET_NOTATION_AND_LN, 'x', 'y'], profile);
    // The prompt's mathematics, as for an inequality (TS04).
    assert.deepEqual(
      labels(secureKeypadKeys({ inputProfile: profile }, { prompt: 'Let $h$ be the height and $t$ the time.' })),
      [...SET_NOTATION_AND_LN, 'h', 't', 'x', 'y'],
      profile,
    );
    // The field's own label, in mathematics or in words.
    assert.deepEqual(labels(secureKeypadKeys({ inputProfile: profile, label: 'Explicit model $P(t)$' })), [...SET_NOTATION_AND_LN, 'P', 't', 'x', 'y'], profile);
    assert.deepEqual(labels(secureKeypadKeys({ inputProfile: profile, label: 'Range of C' })), [...SET_NOTATION_AND_LN, 'C', 'x', 'y'], profile);
  }
  assert.deepEqual([...SECURE_LETTER_PROFILES].sort(), ['equation', 'expression', 'inequality']);
  assert.deepEqual(secureFieldLetters({ prompt: '', label: '' }), [...EVERY_INEQUALITY_LETTER]);
  // A capital letter says so to a screen reader.
  assert.equal(secureKeypadKeys({ inputProfile: 'expression', label: 'Range of C' }).find((key) => key.label === 'C').ariaLabel, 'Insert capital C');
});

test('the keypad says nothing about the answer: the same keys whatever the key, and only these profiles get set notation and ln', () => {
  const prompt = 'A pool is filled to a height of $h$ feet.';
  for (const profile of ['expression', 'equation']) {
    const field = { inputProfile: profile, label: 'Answer' };
    assert.deepEqual(
      secureKeypadKeys({ ...field, expected: 'Q=ln(R)/W', accepted: ['{z|z!=9}'], answer: 'k', correctAnswer: 'm' }, { prompt }),
      secureKeypadKeys(field, { prompt }),
      `${profile}: nothing in the keypad comes from an answer`,
    );
  }
  // The other profiles keep their keys.
  assert.deepEqual(labels(secureKeypadKeys({ inputProfile: 'number' })), ['√', 'π']);
  assert.deepEqual(labels(secureKeypadKeys({ inputProfile: 'orderedPair' })), ['√', 'π']);
  assert.deepEqual(labels(secureKeypadKeys({ inputProfile: 'inequality' })), ['a⁄b', '|x|', 'xⁿ', '√', 'π', 'and', 'or', 'x', 'y']);
  for (const profile of ['set', 'interval', 'text']) assert.deepEqual(labels(secureKeypadKeys({ inputProfile: profile })), [], profile);
  // The same keys on an inequality's editor as before (TS04).
  assert.deepEqual(
    labels(secureAnswerEntryFor({ inputProfile: 'inequality', expected: 'n>=4' }, { prompt: 'Let $h$ be the height and $t$ the time.' }).keys),
    ['a⁄b', '|x|', 'xⁿ', '√', 'π', 'and', 'or', 'h', 't', 'x', 'y'],
  );
  assert.deepEqual(SECURE_PROFILE_KEYS.expression, SECURE_PROFILE_KEYS.equation);
});

test('what the new keys build in the real editor is what the grader reads', async () => {
  // What MathLive held when these keys were pressed (MathInput's keypad
  // inserts each key's command): the bar is a plain |, the relations one
  // character each (the editor writes \ne, \le, \ge), ln its bracket.
  const key = (label) => SECURE_PROFILE_KEYS.expression.find((entry) => entry.label === label).command;
  assert.equal(key('|'), '|');
  assert.equal(key('≠'), '≠');
  assert.equal(key('ln'), '\\ln\\left(#0\\right)');
  for (const [built, expected, options] of [
    ['\\lbrace x|x\\ne2\\rbrace', '{x|x!=2}', { equivalence: 'setBuilder' }],
    ['\\lbrace x|x\\ne2\\rbrace', '{x|x!=2}', {}],
    // A phone has no "and" key here: a comma joins the conditions, as the set-builder reader takes it.
    ['\\lbrace x|x\\ne2,x\\ne7\\rbrace', '{x|x!=2 and x!=7}', { equivalence: 'setBuilder' }],
    ['\\lbrace y|y>6\\rbrace', '{y|y>6}', { equivalence: 'setBuilder' }],
    ['\\lbrace x|x\\ge-2\\rbrace', '{x|x>=-2}', { equivalence: 'setBuilder' }],
    ['\\lbrace-117,133\\rbrace', '{ -117, 133 }', {}],
    ['\\varnothing', '∅', {}],
    ['\\frac{\\ln\\left(6\\right)}{\\ln\\left(2\\right)}', 'ln(6)/ln(2)', {}],
    ['\\ln\\left(4\\right)=t', 'ln(4)=t', { profile: 'equation' }],
    ['8x+3y\\le94', '8x+3y<=94', { profile: 'equation' }],
    ['y\\ge3x-5', 'y>=3x- 5', { profile: 'equation' }],
  ]) {
    // eslint-disable-next-line no-await-in-loop
    assert.equal(await grades(built, expected, options), true, `${built} for ${expected}`);
  }
  // Why the bar is not \mid: outside a set-builder field the grader does not read it.
  assert.equal(await grades('\\lbrace x\\mid x\\ne2\\rbrace', '{x|x!=2}'), false);
});

test('an expression and an equation are still typed text: the keypad is ready for the editor, which they do not have yet', () => {
  for (const profile of ['expression', 'equation']) {
    const entry = secureAnswerEntryFor({ inputProfile: profile }, { prompt: 'Let $h$ be the height.' });
    assert.equal(entry.editor, SECURE_ANSWER_EDITORS.TEXT, profile);
    assert.equal(entry.keys, undefined, `${profile}: a text box has no keypad`);
  }
});
