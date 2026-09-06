import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';
import {
  focusFirstAnswerControl,
  isSingleLineAnswerTarget,
  shouldAdvanceOnEnter,
  shouldFocusAnswerOnOpen,
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
  // The whole live-challenge surface, not one file: the field rendering moved
  // into LiveChallengeFieldQuestion.jsx and this assertion failed while the
  // autofocus it protects was intact one file over.
  const liveDir = new URL('../../src/components/liveChallenge/', import.meta.url);
  const liveFiles = readdirSync(liveDir).filter((name) => name.endsWith('.jsx'));
  assert.ok(liveFiles.length >= 2, `expected the live challenge components, found ${liveFiles.join(', ')}`);
  const live = liveFiles.map((name) => readFileSync(new URL(name, liveDir), 'utf8')).join('\n');
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

test('a question with one answer box still opens ready to type', () => {
  // The behaviour this guard narrows, not replaces: on a Chromebook with a
  // single text answer, landing on the page with the cursor already in the box
  // is the whole point.
  assert.equal(shouldFocusAnswerOnOpen({ composed: false, narrowViewport: false }), true);
  assert.equal(shouldFocusAnswerOnOpen(), true);
});

test('a phone does not get a keypad it did not ask for', () => {
  // Measured, not reasoned: focusing a numeric field on a 390x664 phone opened
  // the on-screen keypad over 266px of the screen and scrolled the workspace
  // 721px of its 1440, so a graphing question opened in the middle of itself
  // with the graph and the prompt both off screen.
  assert.equal(shouldFocusAnswerOnOpen({ composed: false, narrowViewport: true }), false);
});

test('a composed question has no "the" answer box to focus', () => {
  // Its first focusable input is one cell of a workspace — a coordinate of the
  // third point of a table the student is meant to plot. Putting the cursor
  // there says the question starts with typing when it starts with reading a
  // graph, which is wrong on a desktop too.
  assert.equal(shouldFocusAnswerOnOpen({ composed: true, narrowViewport: false }), false);
  assert.equal(shouldFocusAnswerOnOpen({ composed: true, narrowViewport: true }), false);
});

test('the runtime asks that question before it focuses anything', () => {
  const engine = readFileSync('src/QuestionEngine.jsx', 'utf8');
  assert.match(engine, /shouldFocusAnswerOnOpen\(\{ composed: isComposed, narrowViewport: isMobileQuestionViewport\(\) \}\)/);
  // One definition of "is this a phone", shared with the layout that opens the
  // keypad — two that could drift would mean a runtime unaware of what the
  // layout just did.
  assert.match(engine, /import MobileViewportContainer, \{ isMobileQuestionViewport \}/);
  assert.match(
    readFileSync('src/components/student/MobileViewportContainer.jsx', 'utf8'),
    /export const isMobileQuestionViewport = detectMobile;/,
  );
});
