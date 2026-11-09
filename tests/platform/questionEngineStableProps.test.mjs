/*
 * APP DRAWS THE QUESTION AGAIN ONLY WHEN WHAT IT SHOWS CHANGES.
 *
 * QuestionEngine is memoised where App mounts it (app/lazyScreens.js), and
 * App renders seven to thirteen times on a Submit or Next and every 30
 * seconds for its clock. A prop made fresh in App's render (an inline arrow,
 * an object literal, a list rebuilt from the assignment) defeats the memo and
 * draws the whole question again on each of those renders: about 45
 * components each time on a Submit, 69 on a clock tick on Step Algebra
 * (tests/browser/teacherWorkflow/studentRuntimePerformance.mjs measures it
 * in a browser; this file holds the pieces node can check).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRenderMemo, createStableCallbacks, sameStableValue } from '../../src/platform/performance/renderStability.js';
import { executableSource } from './helpers/sourceContract.mjs';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

test('stable callbacks: one function per name, always reaching the latest handler', () => {
  const stableCallbacks = createStableCallbacks();
  const calls = [];
  const first = stableCallbacks({ onGrade: (value) => { calls.push(['first', value]); return 'first'; }, onNextQuestion: () => 'next' });
  const second = stableCallbacks({ onGrade: (value) => { calls.push(['second', value]); return 'second'; }, onNextQuestion: () => 'next' });
  assert.deepEqual(Object.keys(second), ['onGrade', 'onNextQuestion'], 'the same names back');
  assert.equal(first.onGrade, second.onGrade, 'the same function on every render');
  assert.equal(first.onGrade(7), 'second', "a call made through the first render's function reaches this render's handler");
  assert.deepEqual(calls, [['second', 7]]);
  assert.notEqual(second.onNextQuestion, second.onGrade, 'each name is its own function');
});

test('stable callbacks: null while there is no handler, and no call reaches an old one', () => {
  const stableCallbacks = createStableCallbacks();
  let oldCalls = 0;
  const { onNextQuestion: caller } = stableCallbacks({ onNextQuestion: () => { oldCalls += 1; } });
  // No next question on this render: the prop is null, so the question offers no Next.
  assert.deepEqual(stableCallbacks({ onNextQuestion: null, onAskTeacher: undefined, onGrade: 'not a function' }), { onNextQuestion: null, onAskTeacher: null, onGrade: null });
  // A caller kept from earlier does nothing rather than run the stale closure.
  assert.equal(caller(), undefined);
  assert.equal(oldCalls, 0);
  // A handler again: the same function as before.
  let newCalls = 0;
  assert.equal(stableCallbacks({ onNextQuestion: () => { newCalls += 1; } }).onNextQuestion, caller);
  caller();
  assert.equal(newCalls, 1);
});

test('a render memo computes once per change of its inputs', () => {
  const renderMemo = createRenderMemo();
  let computed = 0;
  const assignment = { id: 'a1' };
  const value = (inputs) => renderMemo('questions', inputs, () => { computed += 1; return { inputs }; });
  const firstValue = value([assignment, 3]);
  // Seven renders of a Submit with the same assignment: worked out once.
  for (let render = 0; render < 7; render += 1) assert.equal(value([assignment, 3]), firstValue);
  assert.equal(computed, 1);
  // Inputs compare by identity (Object.is), not by content.
  value([{ id: 'a1' }, 3]);
  assert.equal(computed, 2);
  const again = { id: 'a1' };
  value([again, 3, 'more']);
  assert.equal(computed, 3);
  value([again, 3]);
  assert.equal(computed, 4, 'fewer inputs, the rest the same, is a change');
  assert.ok(Object.is(renderMemo('nan', [Number.NaN], () => 'once'), renderMemo('nan', [Number.NaN], () => 'twice')), 'NaN is the same input as NaN');
  // Names are independent slots.
  assert.equal(renderMemo('other', [assignment, 3], () => 'other'), 'other');
});

test('a render memo keeps the previous value while a recomputed one means the same', () => {
  const renderMemo = createRenderMemo();
  const profileFor = (tracker) => renderMemo('adaptation', [tracker], () => ({ band: 3, reason: { code: 'steady' } }), sameStableValue);
  const first = profileFor({ version: 1 });
  // A new tracker rebuilds the learning profile; the adaptation says the same.
  assert.equal(profileFor({ version: 2 }), first);
  const changed = renderMemo('adaptation', [{ version: 3 }], () => ({ band: 4 }), sameStableValue);
  assert.notEqual(changed, first);
  assert.deepEqual(changed, { band: 4 });
});

test('a render memo with no inputs is worked out on every call and kept while it says the same', () => {
  // The family context reads this device's delivery pins from storage, which
  // no React input announces: built on every render, as it always was.
  const renderMemo = createRenderMemo();
  let storedPin = null;
  let built = 0;
  const context = () => renderMemo('familyContext', null, () => { built += 1; return { slot: 's1', pin: storedPin }; }, sameStableValue);
  const first = context();
  assert.equal(context(), first);
  assert.equal(built, 2);
  storedPin = { slot: 's1', variant: 0 };
  const pinned = context();
  assert.notEqual(pinned, first, 'a pin written behind React still reaches the question on the next render');
  assert.deepEqual(pinned.pin, storedPin);
});

test('sameStableValue compares content, not key order', () => {
  assert.ok(sameStableValue({ a: 1, b: { c: [1, 2] } }, { b: { c: [1, 2] }, a: 1 }));
  assert.ok(!sameStableValue({ a: 1 }, { a: 2 }));
  assert.ok(sameStableValue(null, null));
  assert.ok(!sameStableValue(null, {}));
});

// A balanced {…} or (…) at `index` in `text`, with quotes and template
// literals (and their ${…}) inside: [inner text, index after it].
const readBalanced = (text, index) => {
  const stack = [];
  const open = index;
  for (; index < text.length; index += 1) {
    const ch = text[index];
    const top = stack[stack.length - 1];
    if (top === '`' || top === "'" || top === '"') {
      if (ch === '\\') index += 1;
      else if (ch === top) stack.pop();
      else if (top === '`' && ch === '$' && text[index + 1] === '{') { stack.push('{'); index += 1; }
      continue;
    }
    if ("'\"`{([".includes(ch)) stack.push(ch);
    else if ('})]'.includes(ch)) {
      stack.pop();
      if (!stack.length) return [text.slice(open + 1, index).trim(), index + 1];
    }
  }
  throw new Error(`unbalanced at ${text.slice(open, open + 40)}`);
};

// The <QuestionEngine … /> App mounts: its props as name → expression, and
// the expressions spread into it.
const questionEngineElement = (app) => {
  let index = app.indexOf('<QuestionEngine');
  assert.notEqual(index, -1, 'App mounts QuestionEngine');
  index += '<QuestionEngine'.length;
  const props = new Map();
  const spreads = [];
  for (;;) {
    while (/\s/.test(app[index])) index += 1;
    if (app.startsWith('/>', index)) return { props, spreads };
    if (app[index] === '{') {
      const [inner, after] = readBalanced(app, index);
      assert.ok(inner.startsWith('...'), `a QuestionEngine attribute at ${inner.slice(0, 40)}`);
      spreads.push(inner.slice(3).trim());
      index = after;
      continue;
    }
    const name = /^[A-Za-z]\w*/.exec(app.slice(index))?.[0];
    assert.ok(name, `a QuestionEngine prop at ${app.slice(index, index + 40)}`);
    index += name.length;
    assert.equal(app[index], '=', `${name} has a value`);
    const [value, after] = readBalanced(app, index + 1);
    props.set(name, value);
    index = after;
  }
};

// The top-level `key: value` entries of an object literal's inner text.
const objectEntries = (inner) => {
  const entries = [];
  let at = 0;
  while (at < inner.length) {
    let end = at;
    for (; end < inner.length && inner[end] !== ','; end += 1) {
      if ("'\"`{([".includes(inner[end])) end = readBalanced(inner, end)[1] - 1;
    }
    const entry = inner.slice(at, end).trim();
    if (entry) {
      const colon = entry.indexOf(':');
      entries.push([entry.slice(0, colon).trim(), entry.slice(colon + 1).trim()]);
    }
    at = end + 1;
  }
  return entries;
};

// The expression with its string and template literals emptied, and every
// stableCallbacks(…) and renderMemo(…) call taken out.
const withoutStableCalls = (expression) => {
  let text = expression.replace(/`(?:\\.|\$\{(?:[^{}]|\{[^{}]*\})*\}|[^`\\])*`|'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"/g, '""');
  for (const call of ['stableCallbacks(', 'renderMemo(']) {
    for (let at = text.indexOf(call); at >= 0; at = text.indexOf(call)) {
      const [, after] = readBalanced(text, at + call.length - 1);
      text = `${text.slice(0, at)}STABLE${text.slice(after)}`;
    }
  }
  return text;
};

// An object or list literal that IS the value (or a branch of it): not one
// handed to a call, and not one a method is called on (`[…].includes(x)`).
const literalValue = (text) => {
  let parens = 0;
  for (let index = 0; index < text.length; index += 1) {
    const ch = text[index];
    if (ch === '(') parens += 1;
    else if (ch === ')') parens -= 1;
    else if (parens === 0 && (ch === '{' || ch === '[')) {
      const before = text.slice(0, index).trimEnd();
      const valueStart = before === '' || /(?:[?:]|\|\||&&|\?\?)$/.test(before);
      const [, after] = readBalanced(text, index);
      if (valueStart && !/^[.[(]/.test(text.slice(after).trimStart())) return text.slice(index, after);
      index = after - 1;
    }
  }
  return null;
};

test('App hands QuestionEngine no function or object made in its render', () => {
  const app = executableSource(read('src/App.jsx'));
  const { props, spreads } = questionEngineElement(app);
  assert.ok(props.size >= 30, `read ${props.size} props`);
  // Every handler, one function for App's life that calls the latest
  // (renderStability.js): spread from one stableCallbacks({ … }) call.
  assert.equal(spreads.length, 1, 'one spread: the handlers');
  const handlerCall = /^stableCallbacks\(\{([\s\S]*)\}\)$/.exec(spreads[0]);
  assert.ok(handlerCall, `the spread is stableCallbacks({ … }): ${spreads[0].slice(0, 60)}`);
  const handlers = objectEntries(handlerCall[1]);
  assert.ok(handlers.length >= 12, `${handlers.length} handlers`);
  for (const [name] of handlers) assert.match(name, /^on[A-Z]\w*$/, `${name} is a handler`);
  // One handler is handed as itself, because its identity is what it means:
  // the question re-sends the frame on screen when it changes (its effect
  // follows the prop), which is how a Spotlight request accepted (Present
  // Now) gets the work at once. App's useCallback changes it with the request;
  // with no request it is null.
  for (const name of props.keys()) {
    if (name === 'onSpotlightFrame') continue;
    assert.doesNotMatch(name, /^on[A-Z]/, `${name} goes through stableCallbacks`);
  }
  assert.equal(props.get('onSpotlightFrame'), 'preview ? null : studentSpotlightRequest && publishSpotlightWork');
  assert.ok(!handlers.some(([name]) => name === 'onSpotlightFrame'), 'the Spotlight handler keeps its identity');
  for (const [name, expression] of props) {
    const rest = withoutStableCalls(expression);
    assert.doesNotMatch(rest, /=>|\bfunction\b/, `${name}: a function made in App's render`);
    assert.equal(literalValue(rest), null, `${name}: an object or list made in App's render`);
  }
  // The objects it is handed are made once per change of what they mean.
  const workspace = app.slice(app.indexOf('const renderAssignmentWorkspace'), app.indexOf('<QuestionEngine'));
  assert.equal(props.get('question'), 'questions[currentQuestionIndex]');
  assert.match(workspace, /const questions = activeQuestions;/);
  assert.match(app, /const activeQuestions = useMemo\(\(\) => getStoredAssignmentQuestions\(activeAssignmentData\), \[activeAssignmentData\]\);/);
  assert.match(workspace, /const assignment = activeAssignmentData;/);
  assert.equal(props.get('questionRecord'), 'workingTracker?.[currentQuestionIndex]');
  assert.match(workspace, /const recordedTracker = tracker\[activeAssignmentId\] \|\| NO_RECORDS;/);
  assert.match(workspace, /\? practiceTracker\[activeAssignmentId\] \|\| renderMemo\('practiceTracker', \[questions, recordedTracker\], \(\) => createPracticeAssignmentTracker\(questions, recordedTracker\)\)/);
  assert.equal(props.get('familyContext'), 'currentFamilyContext');
  assert.match(workspace, /const currentFamilyContext = !familyDelivery \? null : renderMemo\('familyContext', null, \(\) => familyDelivery\.buildStudentFamilyContext\(\{[\s\S]*?\}\), sameStableValue\);/);
  assert.equal(props.get('adaptation'), 'currentAdaptation');
  assert.match(workspace, /const currentAdaptation = preview \? null : renderMemo\('adaptation', \[questions\[currentQuestionIndex\], studentLearningProfile, runtimeActivityRole, currentSectionVariantMode, user\?\.profile\?\.courseLevel\], \(\) => resolveDeliveredQuestionMetadata\(/);
  assert.equal(props.get('activityPolicy'), 'runtimeQuestionActivityPolicy');
  assert.match(workspace, /const runtimeQuestionActivityPolicy = [^;]*\? runtimeActivityPolicy\s*: renderMemo\('activityPolicy', \[runtimeActivityPolicy, currentReplacementAllowed\]/);
  assert.equal(props.get('askTeacherContext'), 'askTeacherContext');
  assert.match(workspace, /const \{ onSendQuestion \} = stableCallbacks\(\{\s*onSendQuestion: /);
  assert.match(workspace, /const askTeacherContext = renderMemo\('askTeacherContext', \[askMyTeacher\.mode, askMyTeacher\.acknowledgement, askTeacherQuestion, onSendQuestion\], /);
  assert.match(props.get('studentProfile'), /^preview \? null : renderMemo\('studentProfile', /);
  // Made once per App, among its hooks, before any render path can return.
  const top = app.slice(app.indexOf('function App()'), app.indexOf('const renderAssignmentWorkspace'));
  assert.match(top, /\n {2}const \[stableCallbacks, renderMemo\] = useRenderStability\(\);\n/);
  assert.doesNotMatch(top.slice(0, top.indexOf('useRenderStability()')), /\n {2}(if \([^\n]*\) )?return\b/, 'no return before it');
});

test('App mounts a memoised QuestionEngine, still its own chunk', () => {
  const screens = executableSource(read('src/app/lazyScreens.js'));
  assert.match(screens, /export const QuestionEngine = memo\(lazy\(\(\) => import\('\.\.\/QuestionEngine\.jsx'\)\)\);/);
  assert.match(screens, /import \{[^}]*\bmemo\b[^}]*\} from 'react';/);
});
