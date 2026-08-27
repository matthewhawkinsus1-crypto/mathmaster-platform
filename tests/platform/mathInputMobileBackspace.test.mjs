import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { buildMobileMathTools } from '../../src/platform/interaction/mobileKeypadPolicy.js';

test('mobile backspace remains the final semantic key after keypad-policy assembly', () => {
  const backspace = { label: '⌫', action: 'deleteBackward', ariaLabel: 'Delete previous character' };
  const tools = buildMobileMathTools({
    toolProfile: 'equation',
    entryKeys: [
      { label: '1', command: '1', ariaLabel: 'Insert 1' },
      { label: '=', command: '=', ariaLabel: 'Insert equals sign' },
    ],
    profileKeys: [
      { label: 'x', command: 'x', ariaLabel: 'Insert x' },
      { label: '=', command: '=', ariaLabel: 'Insert equals sign' },
    ],
    requiredTools: [],
    backspaceKey: backspace,
  });

  assert.equal(tools.at(-1)?.action, 'deleteBackward');
  assert.equal(tools.filter((tool) => tool.action === 'deleteBackward').length, 1);
});

test('MathInput pins the policy-provided Backspace key to the final mobile grid column', () => {
  const source = fs.readFileSync(new URL('../../src/MathInput.jsx', import.meta.url), 'utf8');

  assert.match(source, /buildMobileMathTools\(\{/);
  assert.match(source, /backspaceKey: MOBILE_BACKSPACE_KEY/);
  assert.match(source, /className=\{tool\.action === 'deleteBackward' \? 'mathmaster-fixed-backspace'/);
  assert.match(source, /gridColumn: '-2 \/ -1'/);
});
