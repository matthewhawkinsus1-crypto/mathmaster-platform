/*
 * ENTER IN A STEP OF A COMPOSED QUESTION NEVER SUBMITS THE QUESTION, PRESSES
 * NO START OVER OR RESET, AND NEVER REACHES A STEP NOT ON SCREEN (#386 R5).
 *
 * "Enter must never trigger Reset, destructive actions, or unexpectedly submit
 * the entire question from a mid-workflow field." Step Algebra's operation box
 * owns its Enter (stepAlgebraOperationEnter.test.mjs); the workflow runner was
 * left on the question-level rule (docs/handoffs/NOVEMBER_BUILD_2026-11.md,
 * "Enter in Step Algebra's operation box…"), because its steps have no action
 * of their own to declare and the steps not on screen stay mounted. Nothing
 * pinned that rule for a composed question. These do:
 *
 *   - a composed question is always several parts: with every step answered,
 *     Enter in a step's box brings Submit into focus and presses nothing; with
 *     a step unanswered QuestionEngine leaves Enter to the step's own box;
 *   - the steps not on screen keep their boxes in the page, and the contract's
 *     walk to the next empty box would choose one: it reads a box's own style,
 *     and a box in a hidden step computes as shown (`display: block` in
 *     Chromium, its step `none`). Chromium then refuses the focus and the Enter
 *     is swallowed; a step hidden any other way would take the cursor. A
 *     composed question never walks;
 *   - nothing in a composed question declares an Enter action, so no button —
 *     Next step, a Start over, a Reset — can be pressed by Enter from a step.
 *
 * The question is the real QuestionEngine and workflow runner, prerendered
 * through Vite (helpers/actionBarRender.mjs). tests/browser/workflowStepEnter.mjs
 * presses Enter in every kind of step's box in Chromium, before and after
 * every step is answered.
 */
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  nextEmptyAnswerField,
  resolveQuestionEnterIntent,
  resolveToolEnterAction,
} from '../../src/platform/interaction/answerEntryUx.js';
import { closeEngine, renderEngine } from './helpers/actionBarRender.mjs';
import { h } from './helpers/miniDom.mjs';
import { executableSource, region } from './helpers/sourceContract.mjs';

after(closeEngine);

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

// Five steps, so the runner shows one at a time (workflowFocusMode.js): a box
// in every kind of typed step, the balance workspace on the student's own
// equation, and a written answer.
const COMPOSED = Object.freeze({
  id: 'r5-enter',
  questionId: 'r5-enter',
  type: 'workflow',
  prompt: 'Five times a number is 35. Write an equation, solve it, and use the answer.',
  workflow: [
    { id: 'model', kind: 'equationInput', prompt: 'Five times a number is 35. Write an equation for it, using x for the number.' },
    { id: 'solve', kind: 'algebraWorkspace', prompt: 'Solve your equation on the balance.', source: { fromStage: 'model' } },
    { id: 'values', kind: 'valueSet', prompt: 'Which value of x makes your equation true? Write it as a set.' },
    { id: 'point', kind: 'pointInput', prompt: 'The point (x, 35) is on the line y = 5x. Write it.', allowNone: false },
    { id: 'meaning', kind: 'shortResponse', prompt: 'What does your value of x mean here?' },
  ],
});

// The server's markup as the small DOM the Enter contract walks (helpers/miniDom.mjs).
const VOID_TAGS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
const decode = (value) => value.replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const asMiniDom = (markup) => {
  const root = { tag: '#root', attrs: {}, children: [] };
  const stack = [root];
  for (const [, closing, tag, rawAttributes = '', selfClosing, text] of markup.matchAll(/<!--[\s\S]*?-->|<(\/?)([a-zA-Z][\w-]*)((?:\s+[^\s=>/]+(?:="[^"]*")?)*)\s*(\/?)>|([^<]+)/g)) {
    if (text !== undefined) { stack.at(-1).children.push(decode(text)); continue; }
    if (!tag) continue;
    const name = tag.toLowerCase();
    if (closing) {
      const at = stack.map((node) => node.tag).lastIndexOf(name);
      if (at > 0) stack.length = at;
      continue;
    }
    const attrs = {};
    for (const [, attribute, value] of rawAttributes.matchAll(/([^\s=]+)(?:="([^"]*)")?/g)) attrs[attribute === 'className' ? 'class' : attribute] = value === undefined ? '' : decode(value);
    const node = { tag: name, attrs, children: [] };
    stack.at(-1).children.push(node);
    if (!selfClosing && !VOID_TAGS.has(name)) stack.push(node);
  }
  const build = (node) => h(node.tag, node.attrs, ...node.children.map((child) => (typeof child === 'string' ? child : build(child))));
  return h('div', {}, ...root.children.map((child) => (typeof child === 'string' ? child : build(child))));
};

let drawn = null;
const drawComposed = async () => {
  if (drawn) return drawn;
  const { html, errors } = await renderEngine({ question: COMPOSED });
  assert.deepEqual(errors.map((error) => String(error?.message || error)), [], 'the question drew');
  const page = asMiniDom(html);
  const steps = page.querySelectorAll('.workflow-focus__stage-shell');
  const shown = steps.filter((step) => step.classList.includes('workflow-focus__stage-shell--active'));
  drawn = { page, steps, shown, hidden: steps.filter((step) => !shown.includes(step)) };
  return drawn;
};

const engineEnter = () => region(
  executableSource(read('src/QuestionEngine.jsx')),
  'onKeyDownCapture={(event) => {',
  "style={{ position: 'relative', padding: '10px'",
  'QuestionEngine\'s Enter',
);

const enter = (target, extra = {}) => ({ key: 'Enter', target, isComposing: false, defaultPrevented: false, altKey: false, ctrlKey: false, metaKey: false, shiftKey: false, ...extra });

test('the steps not on screen keep their boxes in the page, so Enter in a step never walks to the next empty box', async () => {
  const { page, steps, shown, hidden } = await drawComposed();
  assert.equal(steps.length, 5, 'five steps');
  assert.equal(shown.length, 1, 'one on screen');
  const hiddenBoxes = hidden.flatMap((step) => step.querySelectorAll('math-field, textarea'));
  assert.ok(hiddenBoxes.length >= 3, `the values, the point and the written answer keep their boxes off screen (${hiddenBoxes.length})`);
  const box = shown[0].querySelector('math-field');
  assert.ok(box, 'step 1\'s box');
  box.value = '5x=35';
  // The walk cannot tell: a box in a step that is not on screen is "next".
  assert.ok(hiddenBoxes.includes(nextEmptyAnswerField(page, box)), 'the walk would choose a box in a step that is not on screen');
  // So, for a composed question, QuestionEngine returns before it walks.
  const nextField = region(engineEnter(), "if (intent === 'next-field') {", 'nextEmptyAnswerField(', 'the walk to the next box');
  assert.match(nextField, /if \(isComposed\) return;/, 'a composed question\'s steps keep their own Enter');
});

test('Enter in a step never submits a composed question: answered, it only brings Submit into focus', () => {
  const field = { tagName: 'MATH-FIELD' };
  for (const deliberateSubmit of [false, true]) {
    assert.equal(resolveQuestionEnterIntent({ event: enter(field), canSubmit: true, responseComplete: true, multipart: true, deliberateSubmit }), 'focus-submit', 'every step answered: Submit comes into focus, nothing is pressed');
    assert.equal(resolveQuestionEnterIntent({ event: enter(field), canSubmit: true, responseComplete: false, multipart: true, deliberateSubmit }), 'next-field', 'a step unanswered: nothing the question does (above)');
  }
  const capture = engineEnter();
  assert.match(capture, /const multipart = isComposed \|\| countAnswerParts\(questionEngineRef\.current\) > 1;/, 'a composed question is several parts, whatever its boxes');
  // The question's only actions on Enter are its own Submit: focused, or for
  // one box pressed. No other button of the question is ever pressed.
  assert.match(capture, /if \(intent === 'focus-submit'\) focusForEnter\(submitButtonRef\.current\);\s*else handleSubmit\(\);/);
  assert.doesNotMatch(capture, /\.click\(\)/, 'Enter presses no button');
});

test('nothing in a composed question declares an Enter action: Next step, a Start over or a Reset cannot be pressed from a step', async () => {
  const { page, shown } = await drawComposed();
  const names = page.querySelectorAll('button').map((button) => button.textContent.trim());
  ['Next step', 'Start question over', 'Submit'].forEach((name) => assert.ok(names.some((text) => text.includes(name)), `the question offers ${name}`));
  assert.deepEqual(page.querySelectorAll('[data-mm-enter-action], [data-primary-answer-action]').map((button) => button.textContent.trim()), [], 'no declared Enter action anywhere in the question');
  const box = shown[0].querySelector('math-field');
  box.value = '5x=35';
  assert.equal(resolveToolEnterAction({ field: box, shell: page }).kind, 'none', 'the tool-level contract finds nothing to press or focus');
  const runner = executableSource(read('src/platform/workflow/WorkflowRunner.jsx'));
  assert.doesNotMatch(runner, /data-mm-enter-action|data-primary-answer-action/, 'the runner declares none');
  assert.doesNotMatch(runner, /<form\b/, 'no form: Enter in a step\'s box submits nothing natively');
  assert.doesNotMatch(runner, /onKeyDown/, 'and the runner handles no key itself');
});
