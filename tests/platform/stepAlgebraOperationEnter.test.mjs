/*
 * ENTER IN STEP ALGEBRA'S OPERATION BOX PICKS THE OPERATION UP
 * (the owner's #554 item 4; #386 R5).
 *
 * A student chose Subtract, typed 6 in "Subtract what?" and pressed Enter:
 * nothing happened, and they had to reach for Pick up. Once the equation was
 * solved the same Enter submitted the whole question, because the box did not
 * own its Enter and QuestionEngine's single-answer convention took it.
 *
 * The box now owns its Enter (MathInput onSubmit) and acts through the shared
 * Enter contract (src/platform/interaction/answerEntryUx.js), as the registry
 * tools do: its card (the composer) is an Enter scope that declares one card
 * action, Pick up, which is pressed. Cancel and the accommodation's Apply to
 * both sides declare nothing, so Enter can never press them, and an empty box
 * does nothing.
 *
 * The board is rendered through Vite SSR with an operation in hand, as a saved
 * draft brings it back, and the contract is run on the composer it draws.
 * tests/browser/stepAlgebraStructureTools.mjs (directions-operand-enter-*)
 * presses the keys in Chromium, on a computer and on a phone.
 */
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { prerenderToNodeStream } from 'react-dom/static';

import { resolveToolEnterAction } from '../../src/platform/interaction/answerEntryUx.js';
import { closeEngine, loadEngine } from './helpers/actionBarRender.mjs';
import { h } from './helpers/miniDom.mjs';
import { componentSource, executableSource, region } from './helpers/sourceContract.mjs';

after(closeEngine);

const memoryStorage = (seed = {}) => {
  const values = new Map(Object.entries(seed));
  return {
    get length() { return values.size; },
    key: (index) => [...values.keys()][index] ?? null,
    getItem: (key) => (values.has(key) ? values.get(key) : null),
    setItem: (key, value) => { values.set(key, String(value)); },
    removeItem: (key) => { values.delete(key); },
  };
};
const envelope = (value) => JSON.stringify({ version: 2, savedAt: Date.now(), touchedAt: Date.now(), value });

const SOLVE = Object.freeze({ id: 'operand-enter', questionId: 'operand-enter', prompt: 'Solve for x.', equation: '3x + 6 = 21', solveFor: 'x' });

// The board with an operation in hand and its value typed, as a reload brings it back.
const drawArmedBoard = async ({ operand, width = 1366, question = SOLVE }) => {
  const { server } = await loadEngine();
  const { default: StepByStepAlgebraCore } = await server.ssrLoadModule('/src/StepByStepAlgebraCore.jsx');
  const { ToolRuntimeProvider } = await server.ssrLoadModule('/src/tools/shared/ToolRuntimeContext.jsx');
  const { ALGEBRA_DRAFT_VERSION } = await server.ssrLoadModule('/src/algebraDraftState.js');
  const draftKey = `operand-enter-${width}-${operand || 'empty'}-${question.questionId}`;
  const previous = globalThis.window;
  globalThis.window = {
    localStorage: memoryStorage({
      [`${draftKey}:step-algebra`]: envelope({
        algebraDraftVersion: ALGEBRA_DRAFT_VERSION,
        equation: { left: '3 x + 6', right: '21', variable: 'x' },
        operand,
        armedTile: { operation: 'subtract', sourceSide: 'left' },
      }),
    }),
    sessionStorage: memoryStorage(),
    addEventListener() {},
    removeEventListener() {},
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
    innerWidth: width,
    innerHeight: width < 500 ? 844 : 768,
    requestAnimationFrame: () => 0,
    cancelAnimationFrame() {},
  };
  const errors = [];
  let html = '';
  try {
    const { prelude } = await prerenderToNodeStream(
      React.createElement(ToolRuntimeProvider, { showImmediateFeedback: true },
        React.createElement(StepByStepAlgebraCore, { question, draftKey, onStateChange() {}, showPrompt: false })),
      { onError: (error) => { errors.push(error); } },
    );
    for await (const chunk of prelude) html += chunk;
  } finally {
    if (previous === undefined) delete globalThis.window;
    else globalThis.window = previous;
  }
  assert.deepEqual(errors.map((error) => String(error?.message || error)), [], 'the board drew');
  return html;
};

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

const composerOf = (page) => page.querySelector('.algebra-operation-composer');
const buttonsIn = (element) => element.querySelectorAll('button');
const isPickUp = (button) => button.classList.includes('algebra-pickup-button');

for (const width of [1366, 390]) {
  test(`at ${width}px: Enter in the value box presses Pick up, the composer's one declared action`, async () => {
    const page = asMiniDom(await drawArmedBoard({ operand: '6', width }));
    const composer = composerOf(page);
    assert.ok(composer, 'the operation is in hand');
    assert.notEqual(composer.getAttribute('data-mm-enter-scope'), null, 'the composer is the card Enter acts in');
    const declared = buttonsIn(composer).filter((button) => button.getAttribute('data-mm-enter-action') !== null || button.getAttribute('data-primary-answer-action') !== null);
    assert.deepEqual(declared.map((button) => [isPickUp(button), button.getAttribute('data-mm-enter-action')]), [[true, 'card']], 'Pick up, and only Pick up, is declared, as a card action');
    // As the student has it: the box typed in, Enter pressed.
    const field = composer.querySelector('math-field');
    assert.ok(field, 'the value box');
    field.value = '6';
    const decision = resolveToolEnterAction({ field, shell: page });
    assert.equal(decision.kind, 'press');
    assert.ok(isPickUp(decision.target), 'Enter presses Pick up');
    // Nothing from an empty box: the contract leaves Enter there alone.
    field.value = '';
    assert.equal(resolveToolEnterAction({ field, shell: page }).kind, 'none');
  });
}

test('Cancel and the accommodation\'s Apply to both sides are never what Enter presses', async () => {
  const question = { ...SOLVE, questionId: 'operand-enter-auto', supportPresentation: { algebraAutoApply: true } };
  const page = asMiniDom(await drawArmedBoard({ operand: '6', question }));
  const composer = composerOf(page);
  const names = buttonsIn(composer).map((button) => button.textContent.trim());
  assert.ok(names.includes('Apply to both sides') && names.includes('Cancel'), `the composer offers both: ${JSON.stringify(names)}`);
  buttonsIn(composer).filter((button) => !isPickUp(button)).forEach((button) => {
    assert.equal(button.getAttribute('data-mm-enter-action'), null, `${button.textContent.trim()} declares no Enter action`);
  });
  const field = composer.querySelector('math-field');
  field.value = '6';
  const decision = resolveToolEnterAction({ field, shell: page });
  assert.equal(decision.kind, 'press');
  assert.ok(isPickUp(decision.target), 'still Pick up, beside Apply to both sides');
});

test('with no value typed, Pick up is off and Enter presses nothing', async () => {
  const page = asMiniDom(await drawArmedBoard({ operand: '' }));
  const composer = composerOf(page);
  const pickUp = buttonsIn(composer).find(isPickUp);
  assert.equal(pickUp.disabled, true, 'Pick up waits for a value');
  const field = composer.querySelector('math-field');
  field.value = '6'; // a value the box shows before the board has heard it: still not pressed while Pick up is off
  assert.equal(resolveToolEnterAction({ field, shell: page }).kind, 'none');
});

test('the value box owns its Enter and acts through the contract, on the composer it is in', () => {
  const core = executableSource(componentSource('src/StepByStepAlgebraCore.jsx'));
  const handler = region(core, 'const pressOperationEnterAction = useCallback(', '}, []);', 'the value box\'s Enter');
  assert.match(handler, /const field = operationComposerRef\.current\?\.querySelector\('math-field'\);/);
  assert.match(handler, /resolveToolEnterAction\(\{ field, shell: boardRootRef\.current \}\)/);
  assert.match(handler, /if \(decision\.kind === 'press'\) decision\.target\.click\(\);/);
  assert.match(core, /<section ref=\{boardRootRef\}/, 'the board is the shell the contract looks in');
  const composer = region(core, 'className="algebra-operation-composer"', '<div className="algebra-placement-progress"', 'the composer');
  assert.match(core, /<div ref=\{operationComposerRef\} className="algebra-operation-composer" data-mm-enter-scope="">/);
  // The box hands Enter to the contract (MathInput marks it data-mm-enter-owner, so
  // QuestionEngine's question-level Enter never takes it).
  const box = region(composer, '<MathInput', '/>', 'the value box');
  assert.match(box, /onSubmit=\{pressOperationEnterAction\}/);
});
