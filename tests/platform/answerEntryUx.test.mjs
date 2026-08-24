import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  focusFirstAnswerControl,
  isSingleLineAnswerTarget,
  shouldAdvanceOnEnter,
  shouldSubmitAnswerOnEnter,
} from '../../src/platform/interaction/answerEntryUx.js';

const target = (tagName, type = '') => ({ tagName, type });
const eventFor = (overrides = {}) => ({
  key: 'Enter', target: target('INPUT', 'text'), isComposing: false,
  altKey: false, ctrlKey: false, metaKey: false, shiftKey: false, ...overrides,
});

test('single-line answer controls exclude multiline and choice controls', () => {
  assert.equal(isSingleLineAnswerTarget(target('INPUT', 'text')), true);
  assert.equal(isSingleLineAnswerTarget(target('INPUT', 'number')), true);
  assert.equal(isSingleLineAnswerTarget(target('MATH-FIELD')), true);
  assert.equal(isSingleLineAnswerTarget(target('TEXTAREA')), false);
  assert.equal(isSingleLineAnswerTarget(target('INPUT', 'radio')), false);
  assert.equal(isSingleLineAnswerTarget(target('INPUT', 'range')), false);
});

test('Enter submits only when the response and primary action are ready', () => {
  assert.equal(shouldSubmitAnswerOnEnter({ event: eventFor(), responseComplete: true, canSubmit: true }), true);
  assert.equal(shouldSubmitAnswerOnEnter({ event: eventFor(), responseComplete: false, canSubmit: true }), false);
  assert.equal(shouldSubmitAnswerOnEnter({ event: eventFor(), responseComplete: true, canSubmit: false }), false);
  assert.equal(shouldSubmitAnswerOnEnter({ event: eventFor({ target: target('TEXTAREA') }), responseComplete: true, canSubmit: true }), false);
  assert.equal(shouldSubmitAnswerOnEnter({ event: eventFor({ shiftKey: true }), responseComplete: true, canSubmit: true }), false);
});

test('a second Enter advances only after a correct flow exposes a next action', () => {
  assert.equal(shouldAdvanceOnEnter({ event: eventFor(), canAdvance: true }), true);
  assert.equal(shouldAdvanceOnEnter({ event: eventFor(), canAdvance: false }), false);
  assert.equal(shouldAdvanceOnEnter({ event: eventFor({ repeat: true }), canAdvance: true }), false);
  assert.equal(shouldAdvanceOnEnter({ event: eventFor({ shiftKey: true }), canAdvance: true }), false);
  assert.equal(shouldAdvanceOnEnter({ event: eventFor({ target: target('TEXTAREA') }), canAdvance: true }), false);
});

test('focus helper activates the first eligible answer field', () => {
  let firstFocused = 0;
  let secondFocused = 0;
  const first = { hidden: false, getAttribute: () => null, focus: () => { firstFocused += 1; } };
  const second = { hidden: false, getAttribute: () => null, focus: () => { secondFocused += 1; } };
  const root = { querySelectorAll: () => [first, second] };
  assert.equal(focusFirstAnswerControl(root), true);
  assert.equal(firstFocused, 1);
  assert.equal(secondFocused, 0);
});

test('shared student runtimes use the answer-entry behavior', () => {
  const engine = readFileSync(new URL('../../src/QuestionEngine.jsx', import.meta.url), 'utf8');
  const pathFields = readFileSync(new URL('../../src/components/student/PathResponseFields.jsx', import.meta.url), 'utf8');
  const secureExam = readFileSync(new URL('../../src/components/assessment/SecureExamQuestionPlayer.jsx', import.meta.url), 'utf8');
  const live = readFileSync(new URL('../../src/components/liveChallenge/LiveChallengeStudent.jsx', import.meta.url), 'utf8');
  const shell = readFileSync(new URL('../../src/tools/shared/ToolShell.jsx', import.meta.url), 'utf8');
  const pathPlayer = readFileSync(new URL('../../src/components/student/PathSessionPlayer.jsx', import.meta.url), 'utf8');

  assert.match(engine, /focusFirstAnswerControl\(questionEngineRef\.current\)/);
  assert.match(engine, /shouldSubmitAnswerOnEnter/);
  assert.match(pathFields, /onSubmit=\{disabled \? null : onSubmit\}/);
  assert.match(secureExam, /autoFocus=\{fieldIndex === 0\}/);
  assert.match(live, /autoFocus=\{fieldIndex === 0\}/);
  assert.match(shell, /findPrimary/);
  assert.match(engine, /shouldAdvanceOnEnter/);
  assert.match(engine, /ENTER_TO_CONTINUE_HINT/);
  assert.match(pathPlayer, /shouldAdvanceOnEnter/);
  assert.doesNotMatch(pathPlayer, /tierInfo\.label/);
  assert.match(pathPlayer, /challenge\.label/);
});
