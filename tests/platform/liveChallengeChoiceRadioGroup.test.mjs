/*
 * Live Challenge answer choices are a real radio group (release-candidate QA m4).
 *
 * The defect: the choices were role="radio" buttons with no arrow keys and a
 * tab stop on every option. A student pressed ArrowDown (nothing happened),
 * then Space — which locked in choice 1 when they meant choice 2, marked wrong.
 * After Lock In, focus fell to <body>.
 *
 * The keyboard model is a pure module (radioGroupKeys.js) and is tested here
 * as behaviour. The component cannot be rendered in node, so its wiring is
 * asserted against the regions that do the work; the real round is driven in
 * a browser by tests/browser/liveChallengeChoiceKeyboard.mjs.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { radioGroupKeyAction, radioTabStopIndex } from '../../src/platform/interaction/radioGroupKeys.js';
import { componentSource, executableSource, region } from './helpers/sourceContract.mjs';

test('one tab stop: the checked option, else the first', () => {
  const ids = ['a', 'b', 'c', 'd'];
  assert.equal(radioTabStopIndex(ids, undefined), 0);
  assert.equal(radioTabStopIndex(ids, ''), 0);
  assert.equal(radioTabStopIndex(ids, 'c'), 2);
  assert.equal(radioTabStopIndex(ids, 'not-a-choice'), 0);
  assert.equal(radioTabStopIndex([1, 2, 3], '2'), 1, 'ids compare as strings, as the rendered ids do');
  assert.equal(radioTabStopIndex([], 'a'), -1);
});

test('ArrowDown / ArrowRight go to the next option and wrap', () => {
  assert.deepEqual(radioGroupKeyAction('ArrowDown', 0, 4), { type: 'move', index: 1 });
  assert.deepEqual(radioGroupKeyAction('ArrowRight', 1, 4), { type: 'move', index: 2 });
  assert.deepEqual(radioGroupKeyAction('ArrowDown', 3, 4), { type: 'move', index: 0 });
});

test('ArrowUp / ArrowLeft go to the previous option and wrap', () => {
  assert.deepEqual(radioGroupKeyAction('ArrowUp', 2, 4), { type: 'move', index: 1 });
  assert.deepEqual(radioGroupKeyAction('ArrowLeft', 1, 4), { type: 'move', index: 0 });
  assert.deepEqual(radioGroupKeyAction('ArrowUp', 0, 4), { type: 'move', index: 3 });
});

test('Home / End go to the ends; Space selects the focused option', () => {
  assert.deepEqual(radioGroupKeyAction('Home', 2, 4), { type: 'move', index: 0 });
  assert.deepEqual(radioGroupKeyAction('End', 0, 4), { type: 'move', index: 3 });
  assert.deepEqual(radioGroupKeyAction(' ', 1, 4), { type: 'select', index: 1 });
  assert.deepEqual(radioGroupKeyAction('Spacebar', 2, 4), { type: 'select', index: 2 });
});

test('the QA sequence: from choice 1, ArrowDown then Space lands on choice 2', () => {
  const afterArrow = radioGroupKeyAction('ArrowDown', 0, 4);
  const afterSpace = radioGroupKeyAction(' ', afterArrow.index, 4);
  assert.equal(afterSpace.index, 1);
});

test('no key the group handles ever submits (assessment safety)', () => {
  const keys = ['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'Home', 'End', ' ', 'Spacebar', 'Enter', 'Tab', 'Escape', 'a', '1'];
  for (const key of keys) {
    const action = radioGroupKeyAction(key, 1, 4);
    assert.ok(action === null || action.type === 'move' || action.type === 'select', `${JSON.stringify(key)} -> ${JSON.stringify(action)}`);
  }
  assert.equal(radioGroupKeyAction('Enter', 1, 4), null, 'Enter is left to the native button (a click: select only)');
  assert.equal(radioGroupKeyAction('ArrowDown', 0, 0), null, 'an empty group does nothing');
  assert.deepEqual(radioGroupKeyAction('ArrowDown', -1, 3), { type: 'move', index: 1 }, 'an unknown position starts from the first option');
});

const source = componentSource('src/components/liveChallenge/LiveChallengeFieldQuestion.jsx');
const choiceField = executableSource(region(source, 'function ChoiceField(', 'function MathField(', 'ChoiceField'));
const view = executableSource(region(source, 'function LiveChallengeFieldQuestionView(', 'export default function LiveChallengeFieldQuestion', 'the field view'));

test('the choices are a named radiogroup with a roving tab stop', () => {
  assert.match(choiceField, /role="radiogroup"/);
  assert.match(choiceField, /role="radiogroup"[^>]*aria-(labelledby|label)=\{/, 'the radiogroup has a name');
  assert.match(choiceField, /role="radio"/);
  assert.match(choiceField, /radioTabStopIndex\(/, 'the tab stop comes from the keyboard model');
  assert.match(choiceField, /tabIndex=\{index === tabStop \? 0 : -1\}/, 'only the tab-stop option is tabbable');
});

test('arrow keys move focus AND select; the key handler cannot lock an answer in', () => {
  const handler = region(choiceField, 'const onKeyDown', 'return (', 'the radio key handler');
  assert.match(handler, /radioGroupKeyAction\(event\.key/);
  assert.match(handler, /onChange\(target\.id\)/, 'a move or Space selects the option');
  assert.match(handler, /\.focus\(\)/, 'a move moves focus');
  assert.match(choiceField, /onKeyDown=\{\(event\) => onKeyDown\(event, index\)\}/, 'every option uses the handler');
  // ChoiceField is never given the submit; nothing in it can lock in.
  assert.doesNotMatch(choiceField, /onSubmit|submit\(|\.click\(\)/);
});

test('after Lock In, focus goes to the "locked in" note, not <body>', () => {
  assert.match(view, /ref=\{lockStatusRef\}\s+tabIndex=\{-1\}/, 'the note is programmatically focusable');
  const effect = region(view, 'if (!lockPressed) return;', '}, [lockPressed, disabled, busy]);', 'the lock focus effect');
  assert.match(effect, /if \(disabled \|\| busy\) \{\s*lockStatusRef\.current\?\.focus\(\);/);
  const submit = region(view, 'const submit = async', 'if (!readiness.eligible)', 'submit');
  assert.match(submit, /setLockPressed\(true\)/, 'only the Lock In press arms the focus move');
  // The note says the answer is locked — never whether it is right.
  const note = region(view, 'data-mm-lock-status', '</p>', 'the lock note');
  assert.doesNotMatch(note, /correct|wrong|incorrect|answer is \{|solution/i);
});
