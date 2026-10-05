/*
 * ENTER DOES WHAT THE STUDENT EXPECTS, AND NEVER SPENDS AN ATTEMPT BY SURPRISE.
 *
 * Student UX pass, R-12. Enter used to press a button found by its TEXT
 * (/^(check|submit|verify|…)/), first in the field's panel and then anywhere in
 * the tool. Driving every registry tool in a browser: Enter in the FIRST of
 * several boxes submitted a graded attempt with the rest blank in eight tools,
 * and in two of them a field in one panel pressed the whole lab's Check in
 * another. PR #397's board had the same guess find "Submit".
 *
 * The contract (answerEntryUx.js) is explicit instead: a tool DECLARES the
 * button Enter may use, a card action is pressed only when its card is filled
 * in, a whole-question submit is brought into focus rather than pressed unless
 * the field is the one answer box, and an empty box moves Enter to the next
 * empty box. tests/browser/studentUxPlatform.mjs drives it in a browser.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  nextEmptyAnswerField,
  resolveQuestionEnterIntent,
  resolveToolEnterAction,
} from '../../src/platform/interaction/answerEntryUx.js';
import { h } from './helpers/miniDom.mjs';
import { executableSource } from './helpers/sourceContract.mjs';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const input = (value = '', extra = {}) => h('input', { type: 'text', value, ...extra });
const panel = (...children) => h('div', { class: 'mathmaster-tool-panel' }, ...children);
const shellOf = (...children) => h('section', { class: 'mathmaster-tool-shell' }, ...children);

test('four features and one declared Check: Enter walks the blanks, then brings Check into focus', () => {
  // Parabola Geometry, as measured: Enter in "Focus x" used to submit.
  const [fx, fy, directrix, latus] = [input('2'), input(''), input(''), input('')];
  const checkButton = h('button', { 'data-mm-enter-action': 'submit' });
  const shell = shellOf(panel(fx, fy, directrix, latus, checkButton));

  assert.deepEqual(resolveToolEnterAction({ field: fx, shell }), { kind: 'focus', target: fy });
  fy.value = '-1'; directrix.value = '-3'; latus.value = '8';
  const last = resolveToolEnterAction({ field: latus, shell });
  assert.equal(last.kind, 'focus', 'a whole-question submit with several boxes is never pressed by one Enter');
  assert.equal(last.target, checkButton);
});

test('the one answer box keeps Enter-to-submit', () => {
  const box = input('7');
  const checkButton = h('button', { 'data-mm-enter-action': 'submit' });
  const shell = shellOf(panel(box, checkButton));
  assert.deepEqual(resolveToolEnterAction({ field: box, shell }), { kind: 'press', target: checkButton });
});

// Platform quirks audit: driving every registry tool, Enter in the only TYPED
// box spent an attempt while another part of the answer was still unset.
test('a typed box beside a choice, a plane or another panel\'s box is not the whole answer', () => {
  const check = () => h('button', { 'data-mm-enter-action': 'submit' });

  // Inverse Composition, restriction mode: the inverse and a restriction select.
  const inverse = input('5');
  const restrictionCheck = check();
  const restriction = shellOf(panel(inverse, h('select'), restrictionCheck));
  assert.deepEqual(resolveToolEnterAction({ field: inverse, shell: restriction }), { kind: 'focus', target: restrictionCheck });

  // Sequence Explorer, compare mode: the plotting plane is in another panel.
  const difference = input('4');
  const compareCheck = check();
  const compare = shellOf(panel(h('svg', { role: 'application' })), panel(difference, compareCheck));
  assert.deepEqual(resolveToolEnterAction({ field: difference, shell: compare }), { kind: 'focus', target: compareCheck });

  // Interval Number Line: the notation box is alone in its panel, but the
  // exact-endpoint box is the other half of the same answer.
  const notation = input('[-3, 5)');
  const intervalCheck = check();
  const interval = shellOf(panel(input('')), panel(notation, intervalCheck));
  assert.deepEqual(resolveToolEnterAction({ field: notation, shell: interval }), { kind: 'focus', target: intervalCheck });

  // A plane that is only a picture (role="img") is not an answer control.
  const only = input('7');
  const onlyCheck = check();
  const pictured = shellOf(panel(h('svg', { role: 'img' })), panel(only, onlyCheck));
  assert.deepEqual(resolveToolEnterAction({ field: only, shell: pictured }), { kind: 'press', target: onlyCheck });
});

test('a card action is pressed once its own card is filled in', () => {
  const [dx, dy] = [input('3'), input('')];
  const cardCheck = h('button', { 'data-mm-enter-action': 'card' });
  const otherCard = panel(input(''), h('button', { 'data-mm-enter-action': 'card' }));
  const shell = shellOf(panel(dx, dy, cardCheck), otherCard);
  assert.deepEqual(resolveToolEnterAction({ field: dx, shell }), { kind: 'focus', target: dy }, 'never leaves the card for another card\'s blank');
  dy.value = '-2';
  assert.deepEqual(resolveToolEnterAction({ field: dy, shell }), { kind: 'press', target: cardCheck });
});

test('nothing is guessed from button text', () => {
  const box = input('4');
  const shell = shellOf(panel(box, h('button', {}, 'Check my work'), h('button', {}, 'Submit')));
  assert.deepEqual(resolveToolEnterAction({ field: box, shell }), { kind: 'none' });
});

test('a field in one card never presses another card\'s submit', () => {
  // Data Modeling: "Predict at x" pressed "Check data model" in another panel.
  const predictX = input('8');
  const predictY = input('');
  const labCheck = h('button', { 'data-mm-enter-action': 'submit' });
  const shell = shellOf(panel(predictX, predictY), panel(h('select'), labCheck));
  assert.deepEqual(resolveToolEnterAction({ field: predictX, shell }), { kind: 'focus', target: predictY });
  predictY.value = '12';
  assert.deepEqual(resolveToolEnterAction({ field: predictY, shell }), { kind: 'focus', target: labCheck }, 'from outside its card it is only ever focused');
});

test('ambiguity, disabled buttons and empty boxes do nothing', () => {
  const box = input('1');
  const twoInOneCard = shellOf(panel(box, h('button', { 'data-mm-enter-action': 'card' }), h('button', { 'data-mm-enter-action': 'card' })));
  assert.equal(resolveToolEnterAction({ field: box, shell: twoInOneCard }).kind, 'none');

  const only = input('1');
  const disabled = shellOf(panel(only, h('button', { 'data-mm-enter-action': 'submit', disabled: true })));
  assert.equal(resolveToolEnterAction({ field: only, shell: disabled }).kind, 'none');

  const empty = input('');
  const shell = shellOf(panel(empty, h('button', { 'data-mm-enter-action': 'submit' })));
  assert.equal(resolveToolEnterAction({ field: empty, shell }).kind, 'none');

  const notes = h('textarea', { value: 'why' });
  const withNotes = shellOf(panel(notes, h('button', { 'data-mm-enter-action': 'submit' })));
  assert.equal(resolveToolEnterAction({ field: notes, shell: withNotes }).kind, 'none', 'a textarea keeps its newline');
});

test('two tool-wide declared actions and no local one: neither', () => {
  const box = input('1');
  const shell = shellOf(panel(box), panel(h('button', { 'data-mm-enter-action': 'submit' })), panel(h('button', { 'data-mm-enter-action': 'submit' })));
  assert.equal(resolveToolEnterAction({ field: box, shell }).kind, 'none');
});

test('the legacy declaration is still honoured, as a submit', () => {
  const box = input('1');
  const other = input('');
  const legacy = h('button', { 'data-primary-answer-action': 'true' });
  const shell = shellOf(panel(box, other, legacy));
  assert.deepEqual(resolveToolEnterAction({ field: box, shell }), { kind: 'focus', target: other });
  other.value = '2';
  assert.deepEqual(resolveToolEnterAction({ field: other, shell }), { kind: 'focus', target: legacy });
});

test('"next empty box" wraps and skips disabled boxes', () => {
  const [a, b, c] = [input(''), input('x', {}), input('')];
  const off = input('', { disabled: true });
  const scope = panel(a, b, off, c);
  assert.equal(nextEmptyAnswerField(scope, b), c);
  c.value = '1';
  assert.equal(nextEmptyAnswerField(scope, c), a);
  a.value = '1';
  assert.equal(nextEmptyAnswerField(scope, a), null);
});

const enter = (target, extra = {}) => ({ key: 'Enter', target, isComposing: false, defaultPrevented: false, altKey: false, ctrlKey: false, metaKey: false, shiftKey: false, ...extra });

test('question-level Enter: next box, submit, or bring Submit into focus', () => {
  const field = { tagName: 'MATH-FIELD' };
  const base = { event: enter(field), canSubmit: true };
  assert.equal(resolveQuestionEnterIntent({ ...base, responseComplete: false }), 'next-field');
  assert.equal(resolveQuestionEnterIntent({ ...base, responseComplete: true }), 'submit', 'one box, complete: the single-answer convention');
  assert.equal(resolveQuestionEnterIntent({ ...base, responseComplete: true, multipart: true }), 'focus-submit');
  assert.equal(resolveQuestionEnterIntent({ ...base, responseComplete: true, deliberateSubmit: true }), 'focus-submit', 'a DOL or one-try item is never submitted by a reflexive Enter');
  assert.equal(resolveQuestionEnterIntent({ ...base, canSubmit: false, responseComplete: true }), 'none');
  assert.equal(resolveQuestionEnterIntent({ event: enter({ tagName: 'TEXTAREA' }), canSubmit: true, responseComplete: true }), 'none');
  assert.equal(resolveQuestionEnterIntent({ event: enter(field, { shiftKey: true }), canSubmit: true, responseComplete: true }), 'none');
});

test('ToolShell routes Enter through the contract and reads no button text', () => {
  const shell = executableSource(read('src/tools/shared/ToolShell.jsx'));
  const handler = shell.slice(shell.indexOf('const handleAnswerEnter'), shell.indexOf('return (\n    <section'));
  assert.match(handler, /resolveToolEnterAction\(\{ field: event\.target, shell: shellRef\.current \}\)/);
  assert.match(handler, /decision\.kind === 'press'\) decision\.target\.click\(\)/);
  assert.doesNotMatch(shell, /textContent/, 'no primary button is ever chosen by its words');
  assert.doesNotMatch(shell, /check\|submit\|verify/i);
});

test('QuestionEngine counts the boxes and treats a DOL or one-try item as deliberate', () => {
  const engine = executableSource(read('src/QuestionEngine.jsx'));
  const capture = engine.slice(engine.indexOf('onKeyDownCapture={(event) => {'), engine.indexOf('style={{ position: \'relative\', padding: \'10px\''));
  assert.match(capture, /if \(event\.target\?\.closest\?\.\('\[data-mm-enter-owner\]'\)\) return;/, 'a field that owns Enter keeps it');
  assert.match(capture, /const multipart = isComposed \|\| countAnswerControls\(questionEngineRef\.current\) > 1;/);
  assert.match(capture, /const deliberate = Boolean\(dolMode\) \|\| resolvedMaximumAttempts <= 1;/);
  assert.match(capture, /resolveQuestionEnterIntent\(\{[\s\S]*?multipart,[\s\S]*?deliberateSubmit: deliberate,/);
  assert.match(capture, /intent === 'focus-submit'\) focusForEnter\(submitButtonRef\.current\)/);
  // "6⏎" typed quickly: every box is filled but the render has not caught up.
  // Enter is decided a few frames later from fresh state, not dropped.
  assert.match(capture, /const decideWhenCurrent = \(\) => \{\s*const fresh = enterFreshRef\.current;/);
  assert.match(capture, /if \(multipart \|\| deliberate\) \{\s*if \(focusAuthority\.isLive\(enterTicket\)\) focusForEnter\(submitButtonRef\.current\);\s*\} else fresh\.handleSubmit\(\);/);
  // Moving to Submit frames later is a deferred focus: a press or key after
  // this Enter (the student went on) cancels it. The ticket is taken at Enter.
  assert.match(capture, /const enterTicket = focusAuthority\.ticket\(\{ since: 'now', channel: 'enter' \}\);/);
  assert.match(engine, /enterFreshRef\.current = \{ isComplete: answerState\.isComplete, submitDisabled: !answerState\.isComplete \|\| submitting \|\| locked \|\| scaffoldRequired \|\| contextScaffoldRequired, handleSubmit \};/, 'the same gates as the Submit button');
  assert.match(engine, /<button ref=\{submitButtonRef\}/);
  const input = executableSource(read('src/MathInput.jsx'));
  assert.match(input, /data-mm-enter-owner=\{onSubmit \? 'field' : undefined\}/);
});

test('tools declare their Enter actions, and a card action never spends an attempt', () => {
  const declared = [
    'functionOperations/FunctionOperationsLab.jsx', 'functionInvestigation2/FunctionInvestigation2.jsx', 'dataModeling/DataModelingLab.jsx',
    'complexPlane/ComplexPlaneLab.jsx', 'exponentialLog/ExponentialLogBridge.jsx', 'inverseComposition/InverseCompositionLab.jsx',
    'inverseComposition/InverseDerivationLab.jsx', 'relationMapping/RelationMapping.jsx', 'parabolaGeometry/ParabolaGeometryLab.jsx',
    'signSolutionAnalyzer/SignSolutionAnalyzer.jsx', 'polynomialWorkshop/PolynomialWorkshop.jsx', 'sequenceExplorer/SequenceExplorer.jsx',
    'transformations/TransformationsLab.jsx', 'constraintFunctionBuilder/ConstraintFunctionBuilder.jsx', 'intervalNumberLine/IntervalNumberLine.jsx',
    'systemsWorkspace/SystemsWorkspace.jsx', 'representationBridge/RepresentationBridge.jsx',
  ];
  declared.forEach((relative) => {
    assert.match(read(`src/tools/${relative}`), /data-mm-enter-action="(submit|card)"|data-primary-answer-action="true"/, relative);
  });
  // RepresentationBridge's per-stage checks are CARD actions: pressing one must
  // record a stage check, not submit the bridge.
  const bridge = executableSource(read('src/tools/representationBridge/RepresentationBridge.jsx'));
  assert.equal((bridge.match(/data-mm-enter-action="card" type="button" onClick=\{\(\) => checkStage\(/g) || []).length, 5);
  const checkStage = bridge.slice(bridge.indexOf('const checkStage'), bridge.indexOf('const stageBlocked'));
  assert.doesNotMatch(checkStage, /submit\(/);
});
