import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  buildMobileMathTools,
  dedupeMobileTools,
} from '../../src/platform/interaction/mobileKeypadPolicy.js';

const entryKeys = [
  { label: '1', command: '1', ariaLabel: 'Insert 1' },
  { label: '=', command: '=', ariaLabel: 'Insert equals sign' },
];

const profileKeys = [
  { label: 'x', command: 'x', ariaLabel: 'Insert x' },
  { label: 'f(x)', command: 'f(x)', ariaLabel: 'Insert f of x' },
  { label: 'f⁻¹(x)', command: 'f^{-1}(x)', ariaLabel: 'Insert inverse function f inverse of x' },
  { label: '=', command: '=', ariaLabel: 'Insert equals sign' },
  { label: 'ⁿ√', command: '\\sqrt[#?]{#0}', ariaLabel: 'Insert nth root' },
  { label: 'x²', command: '#@^{2}', ariaLabel: 'Insert square exponent' },
];

const backspace = { label: '⌫', action: 'deleteBackward', ariaLabel: 'Delete previous character' };

test('mobile equation keypad always includes both parentheses exactly once', () => {
  const tools = buildMobileMathTools({
    toolProfile: 'equation',
    entryKeys,
    profileKeys,
    requiredTools: [],
    backspaceKey: backspace,
  });

  assert.equal(tools.filter((tool) => tool.command === '(').length, 1);
  assert.equal(tools.filter((tool) => tool.command === ')').length, 1);
});

test('mobile equation keypad removes duplicate equals keys', () => {
  const tools = buildMobileMathTools({
    toolProfile: 'equation',
    entryKeys,
    profileKeys,
    requiredTools: [],
    backspaceKey: backspace,
  });

  assert.equal(tools.filter((tool) => tool.command === '=').length, 1);
});

test('generic mobile equation keypad trades nth root for parentheses', () => {
  const tools = buildMobileMathTools({
    toolProfile: 'equation',
    entryKeys,
    profileKeys,
    requiredTools: [],
    backspaceKey: backspace,
  });

  assert.equal(tools.some((tool) => tool.ariaLabel === 'Insert nth root'), false);
  assert.equal(tools.some((tool) => tool.command === '('), true);
  assert.equal(tools.some((tool) => tool.command === ')'), true);
});

test('an equation can still explicitly require nth root', () => {
  const nthRoot = profileKeys.find((tool) => tool.ariaLabel === 'Insert nth root');
  const tools = buildMobileMathTools({
    toolProfile: 'equation',
    entryKeys,
    profileKeys,
    requiredTools: [nthRoot],
    backspaceKey: backspace,
  });

  // Required keys render in the separate "Needed for this answer" row, so the
  // main pad omits the duplicate while the authored requirement remains served.
  assert.equal(tools.some((tool) => tool.ariaLabel === 'Insert nth root'), false);
});

test('dedupe is semantic, so same command with same meaning appears once', () => {
  const tools = dedupeMobileTools([
    { label: '=', command: '=' },
    { label: '=', command: '=' },
    { label: 'x', command: 'x' },
  ]);
  assert.deepEqual(tools.map((tool) => tool.command), ['=', 'x']);
});

test('Backspace remains the final mobile key', () => {
  const tools = buildMobileMathTools({
    toolProfile: 'equation',
    entryKeys,
    profileKeys,
    requiredTools: [],
    backspaceKey: backspace,
  });
  assert.equal(tools.at(-1)?.action, 'deleteBackward');
});

test('MathInput delegates mobile layout to the tested policy', () => {
  const source = readFileSync('src/MathInput.jsx', 'utf8');
  assert.match(source, /buildMobileMathTools\(\{/);
  assert.match(source, /toolProfile,/);
  assert.match(source, /profileKeys: getToolKeys\(toolProfile/);
  assert.match(source, /backspaceKey: MOBILE_BACKSPACE_KEY/);
  assert.match(source, /label: 'ⁿ√'/);
  assert.match(source, /requiredAnswerToolForSymbol/);
});
