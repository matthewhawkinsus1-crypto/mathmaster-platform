import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  buildMobileMathTools,
  dedupeMobileTools,
  nthRootOnlyWhereNeeded,
} from '../../src/platform/interaction/mobileKeypadPolicy.js';
import { requiredAnswerToolForSymbol } from '../../src/platform/interaction/answerEntryTools.js';

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
  // The profile's keys reach the policy, with a caller's uncaptioned extra
  // keys after them (a secure item's, H-13) on a phone and a desktop alike.
  // (The profile's keys may first lose the π, e and logₐ the question's math
  // does not use — TL23, keypadConstants.test.mjs — never the extra keys.)
  const profileKeys = (mobile) => `withExtraKeys\\((?:keysForConstants\\()?getToolKeys\\(toolProfile, \\{ ${mobile ? 'isMobile: true, ' : ''}[^)]*\\}\\)(?:, keypadConstants\\))?, extraKeys\\)`;
  assert.match(source, new RegExp(`profileKeys: ${profileKeys(true)}`));
  // A laptop's pad: the profile's keys (on practice without an unneeded ⁿ√,
  // below), then the extra keys, then the keys the answer needs.
  assert.match(source, new RegExp(`const profileKeys = (?:keysForConstants\\()?getToolKeys\\(toolProfile, \\{ [^)]*\\}\\)(?:, keypadConstants\\))?;\\s*return mergeToolKeys\\(\\s*withExtraKeys\\([^\\n]*profileKeys[^\\n]*, extraKeys\\),\\s*requiredTools,`));
  assert.match(source, /backspaceKey: MOBILE_BACKSPACE_KEY/);
  assert.match(source, /label: 'ⁿ√'/);
  assert.match(source, /requiredAnswerToolForSymbol/);
});

// F-KEYPAD-GENERIC: one rule for ⁿ√ on an equation pad, a phone's and (on
// practice) a laptop's: off unless the answer needs it.
test('an equation pad leaves ⁿ√ off unless the answer needs it; no other pad loses it', () => {
  const nthRoot = profileKeys.find((tool) => tool.ariaLabel === 'Insert nth root');
  const has = (keys) => keys.some((tool) => tool.ariaLabel === 'Insert nth root');
  assert.equal(has(nthRootOnlyWhereNeeded(profileKeys, { toolProfile: 'equation' })), false);
  assert.deepEqual(nthRootOnlyWhereNeeded(profileKeys, { toolProfile: 'equation' }), profileKeys.filter((tool) => tool !== nthRoot), 'nothing else is taken');
  // The answer needs it: the key the field asks for is the pad's own key.
  const needed = requiredAnswerToolForSymbol('ⁿ√');
  assert.equal(needed.command, nthRoot.command, 'the needed key types what the pad\'s key types');
  assert.equal(has(nthRootOnlyWhereNeeded(profileKeys, { toolProfile: 'equation', requiredTools: [needed] })), true);
  for (const toolProfile of ['expression', 'function', 'basic', 'basic+set', '']) {
    assert.deepEqual(nthRootOnlyWhereNeeded(profileKeys, { toolProfile }), profileKeys, toolProfile || 'no profile');
  }
});

test('a laptop leaves an unneeded ⁿ√ off only on practice, before the extra and needed keys', () => {
  const source = readFileSync('src/MathInput.jsx', 'utf8');
  const tools = source.slice(source.indexOf('const tools = useMemo(() => {'), source.indexOf('}, [toolProfile, isMobile'));
  const laptop = tools.slice(tools.indexOf('if (!isMobile) {'), tools.indexOf('return buildMobileMathTools({'));
  assert.ok(laptop.length > 0, 'the laptop branch');
  // Only where QuestionEngine answers for its item (practice): an assessment
  // and a host with no item hand MathInput no constants, and keep every key.
  assert.match(laptop, /withExtraKeys\(keypadConstants \? nthRootOnlyWhereNeeded\(profileKeys, \{ toolProfile, requiredTools \}\) : profileKeys, extraKeys\)/);
  assert.match(source, /import \{ buildMobileMathTools, nthRootOnlyWhereNeeded \} from '\.\/platform\/interaction\/mobileKeypadPolicy\.js';/);
  // The laptop's ⁿ√ key and the needed one type the same spelling, so an
  // answer made with either grades the same.
  const basic = source.slice(source.indexOf('const BASIC_KEYS = ['), source.indexOf('];', source.indexOf('const BASIC_KEYS = [')));
  assert.match(basic, /\{ label: 'ⁿ√', command: '\\\\sqrt\[#\?\]\{#0\}', ariaLabel: 'Insert nth root' \}/);
  assert.equal(requiredAnswerToolForSymbol('ⁿ√').command, '\\sqrt[#?]{#0}');
});
