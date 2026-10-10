// WHAT THE SECURE ANSWER EDITOR SENDS, GRADED BY THE REAL SERVER GRADER.
//
// SecureMathAnswerField gives a secure item's typed answer the platform's math
// editor, which submits MathLive's LaTeX instead of the characters typed. On a
// secure item nobody sees a verdict until release, so a correct answer the
// grader could not read would be marked wrong in silence. These tests feed the
// grader — functions/lib/secureItems.js gradeItem, the one every secure close
// path uses — exactly the strings the editor produces:
//
//   - the brief's own examples (\frac{3}{4}, 3/4, -2.5, x=4, \frac{-1}{2});
//   - every string tests/browser/secureAccessParity.mjs captured from the real
//     editor at a Chromebook and a phone size (recorded with --write into
//     fixtures/secureAnswerRoundTrip.json) — on the phone entered only by
//     tapping the keypad, because the math field opens no phone keyboard;
//   - the facts that keep an ordered pair, an inequality, an expression and an
//     equation on typed text, and that send a field naming π, √, % or $ there.
//
// Nothing here renders React. The editor decision itself is the pure
// src/platform/assessment/secureAnswerEntry.js.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import {
  SECURE_ANSWER_EDITORS, SECURE_ENTRY_HINTS, SECURE_MATH_EDITOR_PROFILES, SECURE_TEXT_FALLBACK_HINTS, SECURE_TEXT_PROFILE_REASONS,
  secureAnswerEntryFor,
} from '../../src/platform/assessment/secureAnswerEntry.js';
import { toolProfileForInputProfile } from '../../src/platform/interaction/interactionContract.js';

const require = createRequire(import.meta.url);
const mathPath = require('../../functions/lib/mathPath.js');
const secureItems = require('../../functions/lib/secureItems.js');

const CAPTURED = JSON.parse(readFileSync(new URL('./fixtures/secureAnswerRoundTrip.json', import.meta.url), 'utf8'));

/** The server's verdict for one typed field, exactly as a secure close grades it. */
const grades = async (response, expected, { profile = 'number', equivalence = null } = {}) => {
  const grading = mathPath.privateGradingDefinition({
    responseFields: [{ id: 'answer', inputProfile: profile, expected, ...(equivalence ? { equivalence } : {}) }],
  });
  const verdict = await secureItems.gradeItem(grading, { responses: { answer: response } });
  return verdict.isCorrect === true;
};

test('three quarters typed in the secure editor is still correct for the keys 3/4 and 0.75', async () => {
  // `\frac34` is what MathLive actually serializes for a typed 3/4 (captured
  // in the browser run); `\frac{3}{4}` is the a/b key's long form; `3/4` is a
  // saved draft from the old text box.
  for (const sent of ['\\frac34', '\\frac{3}{4}', '3/4']) {
    assert.equal(await grades(sent, '3/4'), true, `${sent} must grade correct for 3/4`);
    assert.equal(await grades(sent, '0.75'), true, `${sent} must grade correct for 0.75`);
  }
});

test('negatives and decimals the editor sends grade as typed text does', async () => {
  assert.equal(await grades('-2.5', '-2.5'), true);
  assert.equal(await grades('-2.5', '-5/2'), true);
  for (const sent of ['\\frac{-1}{2}', '-\\frac12', '-\\frac{1}{2}']) {
    assert.equal(await grades(sent, '-1/2'), true, `${sent} for -1/2`);
    assert.equal(await grades(sent, '-0.5'), true, `${sent} for -0.5`);
  }
  assert.equal(await grades('.75', '0.75'), true);
  assert.equal(await grades('\\frac{5}{13}', '25/65'), true, 'an unreduced key still accepts the reduced fraction');
});

test('x=4 is not the number 4 — in the editor and in a text box alike, which is why the hint says "only the number"', async () => {
  // The editor does not change this: both send the characters x=4. The SAT's
  // own rule is to enter only the number, and the number field's hint says so.
  assert.equal(await grades('x=4', '4'), false);
  assert.equal(await grades('x=4', 'x=4'), true, 'an equation key still accepts it');
  assert.match(SECURE_ENTRY_HINTS.number, /only the number/i);
});

test('every answer the real editor sent in the browser run grades correct against its keys', async () => {
  assert.ok(Array.isArray(CAPTURED.trials) && CAPTURED.trials.length >= 20, 'the browser capture must be recorded (node tests/browser/secureAccessParity.mjs --write)');
  for (const trial of CAPTURED.trials) {
    for (const key of trial.keys) {
      // eslint-disable-next-line no-await-in-loop
      const ok = await grades(trial.serialized, key, { profile: trial.profile, equivalence: trial.equivalence });
      assert.equal(ok, true, `${trial.device} ${trial.profile}: typed ${JSON.stringify(trial.typed)}, the editor sent ${JSON.stringify(trial.serialized)}, which must grade correct for ${key}`);
    }
  }
});

test('the browser capture covers every profile on both screen sizes, a phone\'s math field only through its keypad', () => {
  for (const device of ['chromebook', 'phone-390']) {
    for (const profile of SECURE_MATH_EDITOR_PROFILES) {
      assert.ok(
        CAPTURED.trials.some((trial) => trial.profile === profile && trial.device === device && trial.editor === SECURE_ANSWER_EDITORS.MATH),
        `no captured ${profile} answer from the real editor on ${device}: a profile moved to the math editor needs browser evidence (run the harness with --write)`,
      );
    }
    for (const profile of Object.keys(SECURE_TEXT_PROFILE_REASONS)) {
      assert.ok(
        CAPTURED.trials.some((trial) => trial.profile === profile && trial.device === device && trial.editor === SECURE_ANSWER_EDITORS.TEXT),
        `no captured ${profile} answer from the text box on ${device}`,
      );
    }
  }
  // A phone's math field opens no keyboard (inputmode none): what a phone
  // student sends is what the keypad builds, so that is the only evidence.
  for (const trial of CAPTURED.trials.filter((entry) => entry.device === 'phone-390' && entry.editor === SECURE_ANSWER_EDITORS.MATH)) {
    assert.equal(trial.entry, 'keypad', `phone ${trial.profile} "${trial.typed}" was not entered on the keypad a phone student has`);
  }
  for (const profile of SECURE_MATH_EDITOR_PROFILES) {
    assert.ok(
      CAPTURED.trials.some((trial) => trial.device === 'phone-390' && trial.profile === profile && trial.entry === 'keypad'),
      `no keypad-only ${profile} answer on the phone`,
    );
  }
  // The answers that broke the editor are in the capture, on the box they now get.
  assert.ok(CAPTURED.trials.some((trial) => trial.profile === 'inequality' && / and /.test(trial.typed)), 'a compound inequality written with "and"');
  assert.ok(CAPTURED.trials.some((trial) => trial.profile === 'orderedPair' && /-1\/2/.test(trial.typed)), 'a pair with a negative fraction');
  // A capture made before the editor choice changed is evidence for a
  // different component: re-record it.
  for (const trial of CAPTURED.trials) {
    assert.equal(secureAnswerEntryFor({ inputProfile: trial.profile }).editor, trial.editor, `${trial.profile} was captured with the ${trial.editor} editor`);
  }
});

test('an ordered pair and an inequality stay typed text for reasons the grader still has', async () => {
  // If any of these flips, the server now reads the editor's form: the
  // profile can move to the math editor once the browser capture shows it.
  assert.equal(await grades('0<=h\\land h<=12', '0<=h and h<=12', { profile: 'inequality' }), false,
    'the grader now reads \\land — inequality could move to the math editor (its phone keypad still needs letter keys)');
  assert.equal(await grades('0<=h and h<=12', '0<=h and h<=12', { profile: 'inequality' }), true, 'typed text is read');
  assert.equal(await grades('(\\frac{-1}{2},3)', '(-1/2,3)', { profile: 'orderedPair' }), false,
    'the grader now reads the a/b key\'s negative fraction in a pair');
  assert.equal(await grades('(3\\sqrt{(2),1)}', '(3sqrt(2),1)', { profile: 'orderedPair' }), false,
    'a root the editor wraps around the rest of the pair');
  assert.equal(await grades('(-1/2,3)', '(-1/2,3)', { profile: 'orderedPair' }), true, 'typed text is read');
  assert.equal(await grades('(3sqrt(2),1)', '(3sqrt(2),1)', { profile: 'orderedPair' }), true, 'typed text is read');
});

test('a math-editor field that names π, √, % or $ gets typed text, because the grader keeps the editor\'s LaTeX for them', async () => {
  // What the real editor sends for each (captured by the verifier's probe and
  // by tests/browser/secureAccessParity.mjs), against the same characters typed.
  for (const [sent, typed] of [['2\\pi', '2pi'], ['3\\sqrt{\\left(2\\right)}', '3sqrt(2)'], ['25\\%', '25%'], ['\\$25', '$25']]) {
    assert.equal(await grades(sent, typed), false, `the grader now reads ${sent}: the symbol guard for it can go`);
    assert.equal(await grades(typed, typed), true, `${typed} typed is read`);
  }
  for (const symbol of ['π', '√', '%', '$']) {
    assert.equal(secureAnswerEntryFor({ inputProfile: 'number', requiredSymbols: [symbol] }).editor, SECURE_ANSWER_EDITORS.TEXT, `number naming ${symbol}`);
    assert.equal(secureAnswerEntryFor({ inputProfile: 'set', inputContract: { requiredSymbols: [symbol] } }).editor, SECURE_ANSWER_EDITORS.TEXT, `set naming ${symbol}`);
  }
  assert.equal(secureAnswerEntryFor({ inputProfile: 'number', answerFormat: 'exactPi' }).editor, SECURE_ANSWER_EDITORS.TEXT);
  assert.equal(secureAnswerEntryFor({ inputProfile: 'number', answerFormat: 'simplest radical' }).editor, SECURE_ANSWER_EDITORS.TEXT);
  // Whole words only: these formats name none of them.
  for (const answerFormat of ['orderedPair', 'piecewise', 'interval', 'fraction', '']) {
    assert.equal(secureAnswerEntryFor({ inputProfile: 'number', answerFormat }).editor, SECURE_ANSWER_EDITORS.MATH, answerFormat || '(none)');
  }
  assert.equal(secureAnswerEntryFor({ inputProfile: 'number', requiredSymbols: ['a⁄b', '−'] }).editor, SECURE_ANSWER_EDITORS.MATH, 'keys the editor spells readably');
  // Sent to text, a number field has no a/b key to mention, and a phone gets letters.
  const guarded = secureAnswerEntryFor({ inputProfile: 'number', requiredSymbols: ['π'] });
  assert.doesNotMatch(guarded.hint, /a\/b key|Leave out/);
  assert.equal(guarded.inputMode, 'text');
});

test('each profile gets the editor and keypad the evidence supports', () => {
  for (const profile of SECURE_MATH_EDITOR_PROFILES) {
    const entry = secureAnswerEntryFor({ id: 'a', inputProfile: profile });
    assert.equal(entry.editor, SECURE_ANSWER_EDITORS.MATH, profile);
    assert.equal(entry.toolProfile, toolProfileForInputProfile(profile), `${profile} uses the platform keypad for it`);
  }
  assert.deepEqual([...SECURE_MATH_EDITOR_PROFILES].sort(), ['interval', 'number', 'set']);
  for (const profile of ['orderedPair', 'inequality', 'expression', 'equation', 'text', 'choice', '', 'somethingNew']) {
    const entry = secureAnswerEntryFor({ inputProfile: profile });
    assert.equal(entry.editor, SECURE_ANSWER_EDITORS.TEXT, `${profile || '(none)'} is typed text`);
    assert.equal(entry.inputMode, 'text', `${profile || '(none)'}: a phone keyboard with letters, brackets and a slash`);
  }
  // The interaction contract's aliases reach the same editor.
  assert.equal(secureAnswerEntryFor({ inputProfile: 'numeric' }).editor, SECURE_ANSWER_EDITORS.MATH);
  assert.equal(secureAnswerEntryFor({ inputProfile: 'point' }).profile, 'orderedPair');
  assert.equal(secureAnswerEntryFor({ inputProfile: 'point' }).editor, SECURE_ANSWER_EDITORS.TEXT);
  assert.equal(secureAnswerEntryFor(null).editor, SECURE_ANSWER_EDITORS.TEXT);
});

test('the hint under the box says how to type, never what — no example numbers, and the server\'s own hint wins', () => {
  for (const [profile, hint] of [...Object.entries(SECURE_ENTRY_HINTS), ...Object.entries(SECURE_TEXT_FALLBACK_HINTS)]) {
    assert.doesNotMatch(hint, /\d/, `${profile}: an example number in a hint could read as an answer on a test`);
  }
  assert.match(secureAnswerEntryFor({ inputProfile: 'inequality' }).hint, /<= for ≤/, 'a text box says how to type ≤');
  assert.doesNotMatch(secureAnswerEntryFor({ inputProfile: 'orderedPair' }).hint, /a\/b key/, 'no key the text box does not have');
  assert.equal(secureAnswerEntryFor({ inputProfile: 'interval', responseHint: 'Use interval notation.' }).hint, 'Use interval notation.');
  assert.equal(secureAnswerEntryFor({ inputProfile: 'interval' }).hint, SECURE_ENTRY_HINTS.interval);
});
