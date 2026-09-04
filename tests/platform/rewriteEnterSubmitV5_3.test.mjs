import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { multiRelationSource } from './helpers/solverSource.mjs';

const src = multiRelationSource();

test('Rewrite / Simplify submits Check when Enter is pressed', () => {
  assert.match(src, /onKeyDownCapture=\{\(event\) => \{/);
  assert.match(src, /event\.key !== 'Enter'/);
  assert.match(src, /event\.preventDefault\(\)/);
  assert.match(src, /event\.stopPropagation\(\)/);
  assert.match(src, /void checkRewrite\(\)/);
});

test('Shift+Enter and key-repeat do not accidentally submit a rewrite', () => {
  assert.match(src, /event\.shiftKey/);
  assert.match(src, /event\.repeat/);
  assert.match(src, /isComposing/);
});

test('Rewrite input tells keyboard users Enter checks their work', () => {
  assert.match(src, /Press Enter to check/);
  assert.match(src, /press Enter or Check/);
});
