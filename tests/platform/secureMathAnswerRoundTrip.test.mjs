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
//   - the facts that keep an expression and an equation on typed text;
//   - what the editor writes for an ordered pair, an inequality and a field
//     naming π, √, % or $, which moved to the editor in student pass 3 (H-13)
//     once the grader read each of them.
//
// Nothing here renders React. The editor decision itself is the pure
// src/platform/assessment/secureAnswerEntry.js.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import {
  SECURE_AND, SECURE_ANSWER_EDITORS, SECURE_ENTRY_HINTS, SECURE_MATH_EDITOR_PROFILES, SECURE_OR, SECURE_PROFILE_KEYS, SECURE_TEXT_PROFILE_REASONS,
  secureAnswerEntryFor, variablesInPrompt,
} from '../../src/platform/assessment/secureAnswerEntry.js';
import { stackDivisions } from '../../functions/shared/stackDivisions.mjs';
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

test('x=4 grades as the number 4 — in the editor and in a text box alike — and the hint still says "only the number"', async () => {
  // The editor does not change this: both send the characters x=4. The SAT's
  // own rule is to enter only the number, and the number field's hint says so.
  // Job P (item 5): the grader now reads x=4 as the number 4 for a number
  // key — a student who wrote it is right — and the hint still asks for the
  // number alone. x=5 stays wrong.
  assert.equal(await grades('x=4', '4'), true);
  assert.equal(await grades('x=5', '4'), false);
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

test('an expression and an equation stay typed text for reasons the grader still has', async () => {
  // If either flips, the server now reads the editor's form: the profile can
  // move to the math editor once the browser capture shows it.
  assert.equal(await grades('\\frac{2A}{h}-b_2', '2A/h-b_2', { profile: 'expression' }), false, SECURE_TEXT_PROFILE_REASONS.expression);
  assert.equal(await grades('2A/h-b_2', '2A/h-b_2', { profile: 'expression' }), true, 'typed text is read');
  assert.equal(await grades('\\log_2\\left(32\\right)=5', 'log_2(32)=5', { profile: 'equation' }), false, SECURE_TEXT_PROFILE_REASONS.equation);
  assert.equal(await grades('log_2(32)=5', 'log_2(32)=5', { profile: 'equation' }), true, 'typed text is read');
  assert.deepEqual(Object.keys(SECURE_TEXT_PROFILE_REASONS).sort(), ['equation', 'expression']);
});

test('an ordered pair and an inequality in the editor\'s own form grade as typed text does, near misses still wrong (H-13)', async () => {
  // Push P taught the grader \land and a fraction in a pair; H-13 the
  // keypad's word keys and a stacked fraction around a root or π.
  const pairs = [
    ['(\\frac{-1}{2},3)', '(-1/2,3)', '(\\frac{1}{2},3)'],
    ['(-\\frac12,3)', '(-1/2,3)', '(-\\frac13,3)'],
    ['(3\\sqrt2,1)', '(3sqrt(2),1)', '(2\\sqrt3,1)'],
    ['(\\frac{\\sqrt3}{2},\\frac12)', '(sqrt(3)/2,1/2)', '(\\frac{\\sqrt2}{2},\\frac12)'],
    ['(\\frac{\\sqrt3}{2},\\frac12)', '(sqrt(3)/2,1/2)', '(\\frac12,\\frac{\\sqrt3}{2})'],
  ];
  for (const [sent, key, miss] of pairs) {
    assert.equal(await grades(sent, key, { profile: 'orderedPair' }), true, `${sent} for ${key}`);
    assert.equal(await grades(miss, key, { profile: 'orderedPair' }), false, `${miss} is still wrong for ${key}`);
  }
  const inequalities = [
    [`0\\le h${'\\operatorname{\\mathrm{and}}'}h\\le12`, '0<=h and h<=12', `0\\le h${'\\operatorname{\\mathrm{and}}'}h\\le11`],
    [`0\\le h${'\\operatorname{\\mathrm{and}}'}h\\le12`, '0<=h<=12', `0\\le h${'\\operatorname{\\mathrm{or}}'}h\\le12`],
    ['0<=h\\land h<=12', '0<=h and h<=12', '0<=h\\land h<12'],
    [`x<-2${'\\operatorname{\\mathrm{or}}'}x>3`, 'x<-2 or x>3', `x<-2${'\\operatorname{\\mathrm{and}}'}x>3`],
    ['x\\ge\\frac{\\pi}{2}', 'x>=pi/2', 'x\\ge\\frac{\\pi}{3}'],
    ['x>\\sqrt2', 'x>sqrt(2)', 'x<\\sqrt2'],
  ];
  for (const [sent, key, miss] of inequalities) {
    assert.equal(await grades(sent, key, { profile: 'inequality' }), true, `${sent} for ${key}`);
    assert.equal(await grades(miss, key, { profile: 'inequality' }), false, `${miss} is still wrong for ${key}`);
  }
});

test('a stacked fraction around π or a root grades as the slash a key is written with — in grading only (H-13)', async () => {
  for (const [sent, key, miss] of [
    ['\\frac{\\pi}{2}', 'pi/2', '\\frac{\\pi}{3}'],
    ['\\frac{3\\pi}{4}', '3pi/4', '\\frac{3\\pi}{2}'],
    ['\\frac{\\sqrt{3}}{2}', 'sqrt(3)/2', '\\frac{\\sqrt{2}}{2}'],
    ['\\frac{2\\sqrt3}{3}', '2sqrt(3)/3', '\\frac{2\\sqrt3}{9}'],
    ['\\frac{2}{\\pi}', '2/pi', '\\frac{\\pi}{2}'],
  ]) {
    assert.equal(await grades(sent, key), true, `${sent} for ${key}`);
    assert.equal(await grades(miss, key), false, `${miss} is still wrong for ${key}`);
  }
  // Exact answers stay exact: a decimal for π/2, and ½π (a different
  // spelling the stacked rule does not claim), are not read as the key.
  assert.equal(await grades('1.5707963', 'pi/2'), false);
  assert.equal(await grades('\\frac{1}{2}\\pi', 'pi/2'), false);
  // Rendering never changes: only the grader's canonical form stacks them.
  assert.equal(stackDivisions('pi/2'), 'pi/2');
  assert.equal(stackDivisions('\\sqrt{3}/2'), '\\sqrt{3}/2');
  assert.equal(stackDivisions('π/2', { constantOperands: true }), '\\frac{π}{2}');
  assert.equal(stackDivisions('x\\sqrt{3}/2', { constantOperands: true }), 'x\\frac{\\sqrt{3}}{2}', 'a letter coefficient stays outside');
  assert.equal(stackDivisions('3/4x', { constantOperands: true }), '\\frac{3}{4}x', 'the slope rule is untouched');
});

test('a constant next to a power is never a stacked operand: (2/π)² is not 2/π², x^(π/2) is not x^π/2 (H-13 review B1)', async () => {
  // MathLive writes \frac{2}{\pi}^2 for 2, /, π, →, ^2. Each of these graded
  // RIGHT against its key on the first H-13 commit; each is another number.
  for (const [sent, key, profile = 'number'] of [
    ['\\frac{2}{\\pi}^2', '2/pi^2'],
    ['\\frac{3}{\\pi}^{2}', '3/pi^2'],
    ['\\frac{1}{\\pi}^2', '1/pi^2'],
    ['2^\\frac{\\pi}{2}', '2^pi/2'],
    ['x^\\frac{\\pi}{2}', 'x^pi/2', 'expression'],
    ['e^\\frac{\\sqrt2}{2}', 'e^sqrt(2)/2', 'expression'],
  ]) {
    assert.equal(await grades(sent, key, { profile }), false, `${sent} is not ${key}`);
  }
  // Normalised: the power stays with its constant (round 2 pins the stacked
  // forms: π² in the denominator, the base over the divisor).
  assert.notEqual(stackDivisions('2/π^2', { constantOperands: true }), '\\frac{2}{π}^2');
  assert.notEqual(stackDivisions('x^π/2', { constantOperands: true }), 'x^\\frac{π}{2}');
  assert.notEqual(stackDivisions('e^\\sqrt{2}/2', { constantOperands: true }), 'e^\\frac{\\sqrt{2}}{2}');
  // Every intended acceptance stands.
  for (const [sent, key, profile = 'number'] of [
    ['\\frac{\\pi}{2}', 'pi/2'], ['\\frac{\\sqrt3}{2}', 'sqrt(3)/2'], ['\\frac{2}{\\sqrt3}', '2/sqrt(3)'],
    ['\\frac{3\\pi}{4}', '3pi/4'], ['\\frac{2\\sqrt3}{3}', '2sqrt(3)/3'],
    ['(\\frac{\\sqrt3}{2},\\frac12)', '(sqrt(3)/2,1/2)', 'orderedPair'], ['x\\le\\frac{\\pi}{2}', 'x<=pi/2', 'inequality'],
  ]) {
    assert.equal(await grades(sent, key, { profile }), true, `${sent} for ${key}`);
  }
});

test('the editor\'s own spelling of a π, root or exponent key is a right answer; a fraction in the exponent is not (H-13 review, round 2)', async () => {
  // What MathLive writes when the key is typed (2, /, π, ^2 gives
  // \frac{2}{\pi^2}; captured in the browser). Each was refused on c350dfc.
  for (const [sent, key, profile = 'number'] of [
    ['\\frac{2}{\\pi^2}', '2/pi^2'],
    ['\\frac{2}{\\pi^{2}}', '2/pi^2'],
    ['e^{\\frac{\\sqrt2}{2}}', 'e^(sqrt(2)/2)', 'expression'],
    ['x^{\\pi}/2', 'x^pi/2', 'expression'],
    ['\\frac{x^{\\pi}}{2}', 'x^pi/2', 'expression'],
    ['\\frac{e^{\\sqrt{2}}}{2}', 'e^sqrt(2)/2', 'expression'],
    ['\\frac{x^{2t}}{3}', 'x^{2t}/3', 'expression'],
  ]) {
    assert.equal(await grades(sent, key, { profile }), true, `${sent} for ${key}`);
  }
  // The other numbers those keys are not: (2/π)², x^(π/2), e^(√2/2) for
  // e^√2/2, and a braced exponent stacked over the divisor (N1).
  for (const [sent, key, profile = 'number'] of [
    ['\\frac{2}{\\pi}^2', '2/pi^2'],
    ['x^{\\frac{\\pi}{2}}', 'x^pi/2', 'expression'],
    ['x^\\frac{\\pi}{2}', 'x^{\\pi}/2', 'expression'],
    ['2^\\frac{\\pi}{2}', '2^{\\pi}/2'],
    ['x^\\frac{\\alpha}{2}', 'x^{\\alpha}/2', 'expression'],
    ['x^\\frac{2t}{3}', 'x^{2t}/3', 'expression'],
    ['e^{\\frac{\\sqrt2}{2}}', 'e^sqrt(2)/2', 'expression'],
    ['e^{\\frac{\\sqrt3}{2}}', 'e^(sqrt(2)/2)', 'expression'],
  ]) {
    assert.equal(await grades(sent, key, { profile }), false, `${sent} is not ${key}`);
  }
  // Normalised: a π denominator takes its power; a constant or a bracketed
  // exponent brings its base over the divisor.
  assert.equal(stackDivisions('2/π^2', { constantOperands: true }), '\\frac{2}{π^2}');
  assert.equal(stackDivisions('2/π^{2}', { constantOperands: true }), '\\frac{2}{π^{2}}');
  assert.equal(stackDivisions('x^π/2', { constantOperands: true }), '\\frac{x^π}{2}');
  assert.equal(stackDivisions('e^\\sqrt{2}/2', { constantOperands: true }), '\\frac{e^\\sqrt{2}}{2}');
  assert.equal(stackDivisions('x^(\\alpha)/2', { constantOperands: true }), '\\frac{x^(\\alpha)}{2}');
  assert.equal(stackDivisions('x^(\\alpha)/2'), 'x^\\frac{\\alpha}{2}', 'rendering (no constantOperands) is unchanged');
  assert.equal(stackDivisions('x_π/2', { constantOperands: true }), 'x_π/2', 'a subscript is part of a name');
});

test('an nth root and a digit that ends a name are not stacked operands (H-13 review S1)', () => {
  // Only a square root: \sqrt[3]{8}/2 is left as written.
  assert.equal(stackDivisions('\\sqrt[3]{8}/2', { constantOperands: true }), '\\sqrt[3]{8}/2');
  // A digit after `_` is part of the name x_2, not a coefficient of the root.
  assert.equal(stackDivisions('x_2\\sqrt{3}/2', { constantOperands: true }), 'x_2\\frac{\\sqrt{3}}{2}');
  assert.equal(stackDivisions('2\\sqrt{3}/2', { constantOperands: true }), '\\frac{2\\sqrt{3}}{2}', 'a number coefficient comes along');
});

test('a field naming π, √, % or $ gets the math editor; π and √ are keys in the keypad, % and $ need none', async () => {
  // What the real editor sends for each (tests/browser/secureAccessParity.mjs
  // captures them), against the same characters typed.
  for (const [sent, typed, miss] of [['2\\pi', '2pi', '3\\pi'], ['3\\sqrt{\\left(2\\right)}', '3sqrt(2)', '2\\sqrt{\\left(3\\right)}'], ['25\\%', '25%', '2.5\\%'], ['\\$25', '$25', '\\$2.5']]) {
    assert.equal(await grades(sent, typed), true, `the grader reads ${sent}`);
    assert.equal(await grades(miss, typed), false, `${miss} is still wrong for ${typed}`);
  }
  // The number hint says to leave % and $ out, and the grader agrees.
  assert.equal(await grades('25', '25%'), true);
  assert.equal(await grades('25.50', '$25.50'), true);
  const labels = (entry) => entry.keys.map((key) => key.label);
  // A NUMBER field has √ and π whatever its metadata says (H-13 review S3):
  // a key on one number box but not the next would say which answers have
  // one. Metadata adds only what the profile lacks.
  const numberKeys = labels(secureAnswerEntryFor({ inputProfile: 'number' }));
  assert.deepEqual(numberKeys, ['√', 'π']);
  for (const field of [
    { inputProfile: 'number', requiredSymbols: ['π'] },
    { inputProfile: 'number', requiredSymbols: ['pi'] },
    { inputProfile: 'number', requiredSymbols: ['\\sqrt'] },
    { inputProfile: 'number', answerFormat: 'exactPi' },
    { inputProfile: 'number', answerFormat: 'simplest radical' },
    { inputProfile: 'number', requiredSymbols: ['%'] },
    { inputProfile: 'number', answerFormat: 'currency' },
    ...['orderedPair', 'piecewise', 'interval', 'fraction', ''].map((answerFormat) => ({ inputProfile: 'number', answerFormat })),
  ]) {
    const entry = secureAnswerEntryFor(field);
    assert.equal(entry.editor, SECURE_ANSWER_EDITORS.MATH, JSON.stringify(field));
    assert.deepEqual(labels(entry), numberKeys, `${JSON.stringify(field)}: the same keys as every number field`);
  }
  // A set has no π or √ of its own: a field that names one gets the key.
  assert.deepEqual(labels(secureAnswerEntryFor({ inputProfile: 'set', inputContract: { requiredSymbols: ['π'] } })), ['π']);
  assert.deepEqual(labels(secureAnswerEntryFor({ inputProfile: 'set' })), []);
});

test('the keypad says nothing about the answer: nothing captioned "Needed for this answer", keys the same on every item of a profile', () => {
  // MathInput captions `requiredSymbols` "Needed for this answer" on a phone.
  // A secure field passes it only symbols no key can type (so the phone's
  // own keyboard stays), and those show no key.
  const named = secureAnswerEntryFor({ inputProfile: 'number', requiredSymbols: ['a⁄b', 'π', '−', '°'] });
  assert.deepEqual(named.unservedSymbols, ['°']);
  assert.deepEqual(named.keys.map((key) => key.label), ['√', 'π', 'a⁄b', '−']);
  for (const profile of SECURE_MATH_EDITOR_PROFILES) {
    assert.deepEqual(secureAnswerEntryFor({ inputProfile: profile }).unservedSymbols, [], profile);
  }
  // The key never reaches the browser, and if a field carried one anyway the
  // keypad would not read it.
  const bare = secureAnswerEntryFor({ inputProfile: 'orderedPair' });
  const keyed = secureAnswerEntryFor({ inputProfile: 'orderedPair', expected: '(3pi,sqrt(2))', accepted: ['(a,b)'], answer: 'x' });
  assert.deepEqual(keyed, bare);
  for (const profile of SECURE_MATH_EDITOR_PROFILES) {
    assert.deepEqual(
      secureAnswerEntryFor({ inputProfile: profile, expected: '3pi+sqrt(2)+25%+$4', accepted: ['n'], answer: 'y', correctAnswer: 'and' }),
      secureAnswerEntryFor({ inputProfile: profile }),
      `${profile}: nothing in the keypad comes from an answer`,
    );
  }
  assert.deepEqual(bare.keys.map((key) => key.label), SECURE_PROFILE_KEYS.orderedPair.map((key) => key.label));
  // An inequality's keypad: the profile's keys, and the PROMPT's letters.
  const inequality = secureAnswerEntryFor({ inputProfile: 'inequality', expected: 'n>=4' }, { prompt: 'Let $h$ be the height and $t$ the time.' });
  assert.deepEqual(inequality.keys.map((key) => key.label), ['a⁄b', '|x|', 'xⁿ', '√', 'π', 'and', 'or', 'h', 't']);
  assert.equal(inequality.keys.find((key) => key.label === 'and').command, SECURE_AND);
  assert.equal(inequality.keys.find((key) => key.label === 'or').command, SECURE_OR);
});

test('an inequality\'s letters are the ones the prompt\'s mathematics uses', () => {
  assert.deepEqual(variablesInPrompt('Let $h$ be the height and $t$ the time. Solve $2h+5 \\le \\frac{3}{4}$.'), ['h', 't']);
  assert.deepEqual(variablesInPrompt('What is $\\sqrt{x}$ when $\\text{area} = 4$ and $2xy$?'), ['x', 'y'], 'command names and words in \\text are not letters');
  assert.deepEqual(variablesInPrompt('A ticket costs $5 and a pass costs $12. How many tickets?'), ['x'], 'prices are prose: no letters, so x');
  assert.deepEqual(variablesInPrompt(''), ['x']);
  assert.equal(variablesInPrompt('$a+b+c+d+f+g$').length, 4, 'at most four');
});

test('each profile gets the editor and keypad the evidence supports', () => {
  for (const profile of SECURE_MATH_EDITOR_PROFILES) {
    const entry = secureAnswerEntryFor({ id: 'a', inputProfile: profile });
    assert.equal(entry.editor, SECURE_ANSWER_EDITORS.MATH, profile);
    assert.equal(entry.toolProfile, toolProfileForInputProfile(profile), `${profile} uses the platform keypad for it`);
  }
  assert.deepEqual([...SECURE_MATH_EDITOR_PROFILES].sort(), ['inequality', 'interval', 'number', 'orderedPair', 'set']);
  for (const profile of ['expression', 'equation', 'text', 'choice', '', 'somethingNew']) {
    const entry = secureAnswerEntryFor({ inputProfile: profile });
    assert.equal(entry.editor, SECURE_ANSWER_EDITORS.TEXT, `${profile || '(none)'} is typed text`);
    assert.equal(entry.inputMode, 'text', `${profile || '(none)'}: a phone keyboard with letters, brackets and a slash`);
  }
  // The interaction contract's aliases reach the same editor.
  assert.equal(secureAnswerEntryFor({ inputProfile: 'numeric' }).editor, SECURE_ANSWER_EDITORS.MATH);
  assert.equal(secureAnswerEntryFor({ inputProfile: 'point' }).profile, 'orderedPair');
  assert.equal(secureAnswerEntryFor({ inputProfile: 'point' }).editor, SECURE_ANSWER_EDITORS.MATH);
  assert.equal(secureAnswerEntryFor(null).editor, SECURE_ANSWER_EDITORS.TEXT);
});

test('the hint under the box says how to type, never what — no example numbers, and the server\'s own hint wins', () => {
  for (const [profile, hint] of Object.entries(SECURE_ENTRY_HINTS)) {
    assert.doesNotMatch(hint, /\d/, `${profile}: an example number in a hint could read as an answer on a test`);
  }
  assert.match(secureAnswerEntryFor({ inputProfile: 'inequality' }).hint, /≤ and ≥ keys, or type <= and >=/, 'the keys, and how to type them');
  assert.match(secureAnswerEntryFor({ inputProfile: 'orderedPair' }).hint, /a\/b key/, 'the pair\'s editor has the a/b key');
  assert.doesNotMatch(secureAnswerEntryFor({ inputProfile: 'expression' }).hint, /key/, 'no key the text box does not have');
  assert.equal(secureAnswerEntryFor({ inputProfile: 'interval', responseHint: 'Use interval notation.' }).hint, 'Use interval notation.');
  assert.equal(secureAnswerEntryFor({ inputProfile: 'interval' }).hint, SECURE_ENTRY_HINTS.interval);
});
