import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  applyBalancedOperationToBranches,
  parseRelationSource,
} from '../../src/algebraRelationFoundation.js';
import { persistablePendingFlip, restoredPendingFlip } from '../../src/relationPendingFlipDraft.js';
import { region } from './helpers/sourceContract.mjs';

// A PENDING SYMBOL STEP IS SAVED WITHOUT ITS ANSWER.
//
// Dividing an inequality by a negative leaves the student to reverse each
// symbol. The relation workspace's draft (the device's copy and its server
// backup, both readable by the student) used to carry `expectedRelations`, the
// reversed symbols. They are now derived again on restore from the relation
// before the operation, which the draft keeps.

const roundTrip = (value) => JSON.parse(JSON.stringify(value));

// The pending step exactly as MultiRelationAlgebraCore builds it.
const pendingAfter = (source, operation, operand) => {
  const before = parseRelationSource(source, 'x');
  const result = applyBalancedOperationToBranches(before, operation, operand, { branchIndices: [0] });
  const flips = result.branchResults.filter((item) => item.requiresInequalityFlip);
  return {
    branchIndex: flips[0].branchIndex,
    expectedRelations: flips[0].expectedRelations,
    branchResults: flips.map((flip) => ({ branchIndex: flip.branchIndex, expectedRelations: flip.expectedRelations })),
    before,
    label: `Divide by ${operand}`,
    validationContext: { kind: 'balancedOperation', operation, operandExpression: operand, branchIndices: [0] },
  };
};

const keysIn = (value, found = new Set()) => {
  if (Array.isArray(value)) value.forEach((item) => keysIn(item, found));
  else if (value && typeof value === 'object') Object.entries(value).forEach(([key, nested]) => { found.add(key); keysIn(nested, found); });
  return found;
};

for (const [source, operand] of [['-2x > 6', '-2'], ['-4 < -2x <= 6', '-2'], ['-x + 3 >= 7', '-1']]) {
  test(`${source}, divided by ${operand}: saved without its symbols, restored with the same ones`, () => {
    const pending = pendingAfter(source, 'divide', operand);
    assert.ok(Array.isArray(pending.expectedRelations) && pending.expectedRelations.length, 'a flip is pending');
    const saved = roundTrip(persistablePendingFlip(pending));
    assert.equal(keysIn(saved).has('expectedRelations'), false, JSON.stringify(saved));
    const restored = restoredPendingFlip(saved);
    assert.deepEqual(restored.branchResults, roundTrip(pending.branchResults));
    assert.deepEqual(restored.expectedRelations, pending.expectedRelations);
    assert.equal(restored.branchIndex, pending.branchIndex);
    assert.deepEqual(restored.before, roundTrip(pending.before));
    assert.deepEqual(restored.validationContext, pending.validationContext);
  });
}

test('a draft saved before this change restores as it did', () => {
  const pending = roundTrip(pendingAfter('-2x > 6', 'divide', '-2'));
  assert.deepEqual(restoredPendingFlip(pending).expectedRelations, pending.expectedRelations, 'old shape, with before');
  const { before: _before, ...withoutBefore } = pending;
  assert.deepEqual(restoredPendingFlip(withoutBefore).expectedRelations, pending.expectedRelations, 'old shape, single-branch fields only');
  const { before: _b, branchResults: _r, expectedRelations: _e, ...nothing } = pending;
  assert.equal(restoredPendingFlip(nothing), null, 'symbols that cannot be known: the step is dropped');
  assert.equal(restoredPendingFlip(null), null);
  assert.equal(persistablePendingFlip(null), null);
});

test('the workspace saves through the one writer and restores through the one reader', () => {
  const source = fs.readFileSync('src/MultiRelationAlgebraCore.jsx', 'utf8');
  const reader = region(source, 'const readRelationDraft = (draftKey) => {', '\n};', 'the draft reader');
  assert.match(reader, /const pending = restoredPendingFlip\(saved\.pendingRelationFlip\);/);
  const writer = region(source, 'writeQuestionDraft(draftKeyFor(draftKey), {', '});', 'the draft writer');
  assert.match(writer, /pendingRelationFlip: persistablePendingFlip\(pendingRelationFlip\)/);
  assert.equal((source.match(/writeQuestionDraft\(draftKeyFor\(draftKey\)/g) || []).length, 1, 'no other path writes the relation draft');
});

test('a remount brings the open symbol step back from the draft, as it does the relation', () => {
  // The workspace's reset effect runs on mount as well as when the question
  // changes. It read the relation back from the draft but set the open symbol
  // step to null, so every remount — navigating back, a reload, a reopened
  // Chromebook — returned the relation already divided by the negative, still
  // showing the old symbol, with no step left to reverse it. The browser side
  // is certified by the "relation-symbol-pending" draft-persistence scene.
  const source = fs.readFileSync('src/MultiRelationAlgebraCore.jsx', 'utf8');
  const reset = region(source, 'setRelationState(initialStateFor(question, draftKey));', '}, [question, draftKey]);', 'the mount / question-change reset');
  assert.match(reset, /setPendingRelationFlip\(initialPendingRelationFlipFor\(draftKey\)\)/, 'the open step comes from the same draft as the relation');
  assert.doesNotMatch(reset, /setPendingRelationFlip\(null\)/, 'not dropped on mount');
  assert.match(source, /useState\(\(\) => initialPendingRelationFlipFor\(draftKey\)\)/, 'and the first render starts from it too');
});
