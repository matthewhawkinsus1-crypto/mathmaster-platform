import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const src = fs.readFileSync('src/MultiRelationAlgebra.jsx', 'utf8');

test('balanced operation controls use one compact shared dock', () => {
  assert.match(src, /className="multi-relation-operation-dock"/);
  assert.match(src, /width: 'min\(100%, 820px\)'/);
  assert.match(src, /justifyContent: 'center'/);
});

test('split branches place the dock between Branch A and Branch B', () => {
  const orIndex = src.indexOf("relationState.connective === 'OR'");
  const dockIndex = src.indexOf(
    "branchIndex === 1 && relationState.branches.length > 1 && operationDock",
  );
  const branchIndex = src.indexOf(
    'className={`multi-relation-branch',
    dockIndex,
  );

  assert.ok(orIndex >= 0, 'OR separator missing');
  assert.ok(dockIndex > orIndex, 'dock should come after OR');
  assert.ok(branchIndex > dockIndex, 'Branch B should come after the dock');
});

test('single equations keep the compact dock directly under the relation', () => {
  assert.match(src, /relationState\.branches\.length === 1 && operationDock/);
});

test('operation input is narrow enough to keep equations and controls close', () => {
  assert.match(src, /maxWidth: 280/);
  assert.match(src, /placeholder="Value"/);
  assert.match(src, />\s*Commit step\s*</);
});

test('split dock tells the student which branch is active', () => {
  // JSX renders this as text + an expression:
  // Working on Branch {branchLabel(activeBranch)}
  assert.match(src, /Working on Branch\s*\{branchLabel\(activeBranch\)\}/);
});

test('old full-width bottom operation panel is gone', () => {
  assert.doesNotMatch(src, /Commit balanced step/);
  assert.doesNotMatch(src, /Operation value/);
});
