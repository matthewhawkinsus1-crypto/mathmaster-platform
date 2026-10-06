import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';
import { region } from './helpers/sourceContract.mjs';
import {
  answerFocusPosition,
  countAnswerControls,
  focusFirstAnswerControl,
  restoreAnswerFocus,
  isSingleLineAnswerTarget,
  isTouchPrimaryPointer,
  shouldAdvanceOnEnter,
  shouldFocusAnswerOnOpen,
  shouldSubmitAnswerOnEnter,
} from '../../src/platform/interaction/answerEntryUx.js';

const target = (tagName, type = '') => ({ tagName, type });
const calculatorTarget = () => ({
  tagName: 'MATH-FIELD',
  type: '',
  getAttribute: (name) => (name === 'data-calculator-expression' ? 'true' : null),
  closest: (selector) => (selector === '.mathmaster-calculator-panel' ? {} : null),
});
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

test('calculator expression field keeps Enter for calculator equals, not question submit/advance', () => {
  const calc = calculatorTarget();
  assert.equal(isSingleLineAnswerTarget(calc), false);
  assert.equal(shouldSubmitAnswerOnEnter({
    event: eventFor({ target: calc }),
    responseComplete: true,
    canSubmit: true,
  }), false);
  assert.equal(shouldAdvanceOnEnter({
    event: eventFor({ target: calc }),
    canAdvance: true,
  }), false);
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

/*
 * A SERVER COPY THAT LANDS AFTER THE QUESTION OPENED REMOUNTS IT (App.jsx,
 * PQ-044). A mount used to put the cursor in the first box, so a student who
 * had clicked into the second box typed into the first, over the answer just
 * restored there. The remount now puts the cursor back where it was, or
 * nowhere.
 */
test('a restore remount puts the cursor back in the student\'s box, or nowhere', () => {
  const focused = [];
  const box = (name) => ({ name, hidden: false, getAttribute: () => null, focus: () => focused.push(name), contains: () => false });
  const first = box('first');
  const second = box('second');
  const outside = box('outside');
  const root = { querySelectorAll: () => [first, second], contains: (node) => node === first || node === second };

  assert.deepEqual(answerFocusPosition(root, second), { index: 1, count: 2 });
  assert.deepEqual(answerFocusPosition(root, first), { index: 0, count: 2 });
  assert.equal(answerFocusPosition(root, outside), null, 'focus outside the question is not a box');
  assert.equal(answerFocusPosition(root, null), null);
  assert.equal(answerFocusPosition(null, second), null);

  assert.equal(restoreAnswerFocus(root, { index: 1, count: 2 }), true);
  assert.deepEqual(focused, ['second'], 'back in the second box, not the first');
  focused.length = 0;
  assert.equal(restoreAnswerFocus(root, { index: 1, count: 3 }), false, 'the question changed shape: focus nothing');
  assert.equal(restoreAnswerFocus(root, null), false, 'the cursor was not in a box: focus nothing');
  assert.equal(restoreAnswerFocus(root, { index: -1, count: 2 }), false);
  assert.deepEqual(focused, [], 'never the first box by default');
  assert.equal(focusFirstAnswerControl(root), true, 'an ordinary opening still focuses the first box');
  assert.deepEqual(focused, ['first']);
});

test('App records the cursor before a restore remount, for that question only, and QuestionEngine spends it', () => {
  const app = readFileSync('src/App.jsx', 'utf8');
  const engine = readFileSync('src/QuestionEngine.jsx', 'utf8');
  const restoreBranch = app.slice(app.indexOf('if (restoreQuestionDrafts(restorable)) {'), app.indexOf('sync.noteServerCopy(entries);'));
  assert.match(restoreBranch, /setDraftRestoreFocus\(\{\s*questionIndex: currentQuestionIndexRef\.current,\s*position: answerFocusPosition\(assignmentQuestionStageRef\.current\),\s*\}\);\s*setWorkspaceDraftGeneration\(\(value\) => value \+ 1\);/);
  assert.match(app, /draftRestore=\{draftRestoreFocus\?\.questionIndex === currentQuestionIndex \? draftRestoreFocus : null\}/);
  assert.match(app, /currentQuestionIndexRef\.current = currentQuestionIndex;\s*setDraftRestoreFocus\(null\);\s*\}, \[currentQuestionIndex, activeAssignmentId\]\);/);
  // The restore branch comes first, focuses only through restoreAnswerFocus,
  // and returns before the opening's autofocus can run. It is a deferred
  // focus, so it goes through the question's authority (a student press after
  // the remount cancels it; deferredFocusAuthority.test.mjs).
  const effect = engine.slice(engine.indexOf('const draftRestoreRef = useRef(draftRestore);'), engine.indexOf('// Two-step keyboard flow'));
  assert.match(effect, /if \(restore\) \{[\s\S]*?return focusAuthority\.request\(\(\) => \{[\s\S]*?restoreAnswerFocus\(questionEngineRef\.current, restore\.position\);\s*\}\);\s*\}\s*if \(!answerAutoFocusAllowed \|\| missingToolDefinition\) return undefined;/);
  assert.doesNotMatch(effect.slice(0, effect.indexOf('if (!answerAutoFocusAllowed')), /focusFirstAnswerControl/);
  // Spent inside the frame, so StrictMode's second mount still finds it.
  assert.match(effect, /focusAuthority\.request\(\(\) => \{\s*draftRestoreRef\.current = null;/);
  assert.doesNotMatch(effect, /window\.requestAnimationFrame/, 'no deferred focus here bypasses the authority');
});

test('shared student runtimes use the answer-entry behavior', () => {
  const engine = readFileSync(new URL('../../src/QuestionEngine.jsx', import.meta.url), 'utf8');
  const pathFields = readFileSync(new URL('../../src/components/student/PathResponseFields.jsx', import.meta.url), 'utf8');
  const secureExam = readFileSync(new URL('../../src/components/assessment/SecureExamQuestionPlayer.jsx', import.meta.url), 'utf8');
  // The secure exam's field renderer moved into the shared Rich Question
  // Runtime (the player is now its adapter); the autofocus lives there.
  const secureRuntime = readFileSync(new URL('../../src/components/question/RichQuestionRuntime.jsx', import.meta.url), 'utf8');
  // The whole live-challenge surface, not one file: the field rendering moved
  // into LiveChallengeFieldQuestion.jsx and this assertion failed while the
  // autofocus it protects was intact one file over.
  const liveDir = new URL('../../src/components/liveChallenge/', import.meta.url);
  const liveFiles = readdirSync(liveDir).filter((name) => name.endsWith('.jsx'));
  assert.ok(liveFiles.length >= 2, `expected the live challenge components, found ${liveFiles.join(', ')}`);
  const live = liveFiles.map((name) => readFileSync(new URL(name, liveDir), 'utf8')).join('\n');
  const shell = readFileSync(new URL('../../src/tools/shared/ToolShell.jsx', import.meta.url), 'utf8');
  const pathPlayer = readFileSync(new URL('../../src/components/student/PathSessionPlayer.jsx', import.meta.url), 'utf8');

  assert.match(engine, /const root = questionEngineRef\.current;[\s\S]{0,120}focusFirstAnswerControl\(root\)/);
  // The question runtime routes Enter through the explicit contract
  // (tests/platform/enterContract.test.mjs pins its rules).
  assert.match(engine, /resolveQuestionEnterIntent\(\{/);
  assert.match(pathFields, /onSubmit=\{disabled \? null : onSubmit\}/);
  assert.match(secureExam, /<RichQuestionRuntime\b/);
  assert.match(region(secureRuntime, 'const FieldItem = (', 'const ToolItem = (', 'the secure field renderer'), /autoFocus=\{fieldIndex === 0\}/);
  assert.match(live, /autoFocus=\{fieldIndex === 0\}/);
  assert.match(shell, /resolveToolEnterAction\(\{ field: event\.target, shell: shellRef\.current \}\)/);
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

test('a touch-first tablet does not get a keyboard it did not ask for either', () => {
  // Student UX pass (R-2): an iPad is 820px wide, so the width test let it
  // autofocus, and the math keypad opened over half the representation board
  // before the student had read the given. The keyboard follows the pointer.
  assert.equal(shouldFocusAnswerOnOpen({ composed: false, narrowViewport: false, touchPrimary: true }), false);
  const touchWindow = { matchMedia: (query) => ({ matches: query === '(hover: none) and (pointer: coarse)' }) };
  const laptopWindow = { matchMedia: () => ({ matches: false }) };
  assert.equal(isTouchPrimaryPointer(touchWindow), true);
  assert.equal(isTouchPrimaryPointer(laptopWindow), false);
  assert.equal(isTouchPrimaryPointer(null), false);
});

test('the runtime asks that question before it focuses anything', () => {
  const engine = readFileSync('src/QuestionEngine.jsx', 'utf8');
  // Every input to the decision, whatever order they are written in.
  const decision = engine.match(/shouldFocusAnswerOnOpen\(\{([^}]*)\}\)/)?.[1] || '';
  assert.match(decision, /composed: isComposed/);
  assert.match(decision, /narrowViewport: isMobileQuestionViewport\(\)/);
  assert.match(decision, /touchPrimary: isTouchPrimaryPointer\(\)/);
  // The engine's own focus waits for that decision…
  assert.match(engine, /if \(!answerAutoFocusAllowed \|\| missingToolDefinition\) return undefined;\s*const opening = [^;]+;\s*return focusAuthority\.request\(\(\) => \{[\s\S]{0,200}focusFirstAnswerControl\(root\)/);
  // …and hands it to registry tools rather than letting them decide alone —
  // except on a restore mount, which puts the cursor back itself or nowhere.
  assert.match(engine, /<AnswerFocusPolicyProvider allowed=\{answerAutoFocusAllowed && !draftRestore\}>[\s\S]*<Tool questionData=\{presentationQuestion\}/);
  // One definition of "is this a phone", shared with the layout that opens the
  // keypad — two that could drift would mean a runtime unaware of what the
  // layout just did.
  assert.match(engine, /import MobileViewportContainer, \{ isMobileQuestionViewport \}/);
  assert.match(
    readFileSync('src/components/student/MobileViewportContainer.jsx', 'utf8'),
    /export const isMobileQuestionViewport = detectMobile;/,
  );
});

test('a registry tool focuses only when its host allows it AND it has exactly one answer box', () => {
  // ToolShell used to focus its first input unconditionally: the phone number
  // keypad opened over Linear Table Workbench's table on load, and a DOL board
  // on a laptop scrolled to its Standard form card past the prompt.
  const shell = readFileSync('src/tools/shared/ToolShell.jsx', 'utf8');
  const effect = shell.slice(shell.indexOf('const focusAllowed'), shell.indexOf('const handleAnswerEnter'));
  assert.match(effect, /focusOnOpen && mayFocusOnOpen\(focusPolicy\)/);
  assert.match(effect, /if \(!focusAllowed\) return undefined;/);
  assert.match(effect, /countAnswerControls\(shellRef\.current\) === 1\) focusFirstAnswerControl\(shellRef\.current\)/);
  assert.match(shell, /policy\s*\?\s*policy\.allowed/, 'a hosted tool obeys the host');
  // A frame later, through the hosting question's authority (or its own on
  // the tools bench): a press in between cancels it.
  assert.match(effect, /const focusAuthority = useHostedDeferredFocusAuthority\(\);/);
  assert.match(effect, /return focusAuthority\.request\(\(\) => \{\s*if \(countAnswerControls/);
});

test('"the" answer box exists only when there is one', () => {
  const field = (tagName) => ({ tagName, hidden: false, getAttribute: () => null, focus: () => {} });
  assert.equal(countAnswerControls({ querySelectorAll: () => [field('INPUT')] }), 1);
  assert.equal(countAnswerControls({ querySelectorAll: () => [field('INPUT'), field('MATH-FIELD'), field('INPUT')] }), 3);
  assert.equal(countAnswerControls(null), 0);
});

test('autofocus on a math field does not scroll the page', () => {
  // MathfieldElement.focus() drops { preventScroll } and scrolls the field
  // into view; the helper focuses its keyboard sink instead.
  const sinkCalls = [];
  const mathField = {
    tagName: 'MATH-FIELD',
    hidden: false,
    getAttribute: () => null,
    focus: () => { throw new Error('MathfieldElement.focus() scrolls the page'); },
    shadowRoot: { querySelector: () => ({ focus: (options) => sinkCalls.push(options) }) },
  };
  assert.equal(focusFirstAnswerControl({ querySelectorAll: () => [mathField] }), true);
  assert.deepEqual(sinkCalls, [{ preventScroll: true }]);
});

test('opening a question never focuses the Enlarge button', () => {
  // The focus-return effect ran on mount (`enlarged` starts false), so every
  // question opened with a focus ring on "Enlarge question".
  const figure = readFileSync('src/components/common/EnlargeableFigure.jsx', 'utf8');
  const effect = figure.slice(figure.indexOf('const wasEnlargedRef'), figure.indexOf('}, [enlarged, shouldForceClose]);'));
  assert.match(effect, /if \(!wasEnlargedRef\.current\) return;[\s\S]*openerRef\.current\?\.focus/);
});
