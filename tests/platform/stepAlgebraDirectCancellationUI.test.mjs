import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stepAlgebraSource } from './helpers/solverSource.mjs';

const source = stepAlgebraSource();
const support = await readFile(new URL('../../src/studentSupport.js', import.meta.url), 'utf8');
const app = await readFile(new URL('../../src/App.jsx', import.meta.url), 'utf8');
const mathInput = await readFile(new URL('../../src/MathInput.jsx', import.meta.url), 'utf8');

test('operation input starts blank and resets blank', () => {
  assert.match(source, /useState\(savedDraft\?\.operand \?\? ''\)/);
  assert.ok(!source.includes("savedDraft?.operand || '2'"));
  assert.match(source, /setOperand\(''\)/);
});

test('cancellation is performed on actual equation tokens rather than a duplicate cancellation box', () => {
  assert.match(source, /data-cancel-index/);
  assert.match(source, /Tap or slash either matching factor once/);
  // The balanced-step prompt names what actually cancels: opposite terms after
  // + / −, matching factors after × / ÷ (live QA: "factors" for +12 and −12).
  assert.match(source, /const cancelledPieces = \['add', 'subtract'\]\.includes\(move\.operation\) \? 'opposite terms' : 'matching factors';/);
  assert.match(source, /Draw directly through the \$\{cancelledPieces\} in the equation itself/);
  assert.ok(!source.includes('Draw through the zero pair or identity pair'));
  assert.ok(!source.includes('Required assumption:'));
});

test('Apply shortcut is explicitly accommodation-gated', () => {
  assert.match(source, /const allowAutoApply = Boolean\(question\?\.supportPresentation\?\.algebraAutoApply\)/);
  assert.match(source, /\{allowAutoApply && \(/);
  assert.match(support, /algebraAutoApply: normalized\.accommodations\.includes\('algebra-auto-apply'\)/);
  assert.match(app, /\['algebra-auto-apply', 'Algebra operation Apply shortcut'\]/);
});

test('literal-equation operation input supports symbolic factors on touch devices', () => {
  assert.match(source, /toolProfile="algebra-operation"/);
  assert.match(mathInput, /profile === 'algebra-operation'/);
  assert.match(mathInput, /algebraOperationKeysForContext/);
  assert.match(mathInput, /toolProfile !== 'function'/);
});
