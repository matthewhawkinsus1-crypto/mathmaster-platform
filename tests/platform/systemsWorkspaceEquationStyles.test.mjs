import test from 'node:test';
import assert from 'node:assert/strict';
import { componentSource, executableSource, region } from './helpers/sourceContract.mjs';

const executable = executableSource(componentSource('src/tools/systemsWorkspace/SystemsWorkspace.jsx'));

test('ordinary linear systems draw two differently colored solid equation lines', () => {
  const mode = region(executable, 'function LinearMode(', 'function InequalityMode(', 'LinearMode');
  const lines = region(mode, 'lines={[', ']}', 'linear equation lines');
  assert.match(lines, /m:system\.m1,b:system\.b1/);
  assert.match(lines, /m:system\.m2,b:system\.b2,stroke:'#d93025'/);
  assert.doesNotMatch(lines, /dash/);
  const legend = region(mode, '<Legend items={[', ']} />', 'linear equation legend');
  assert.match(legend, /Equation 1[\s\S]*?#1a73e8/);
  assert.match(legend, /Equation 2[\s\S]*?#d93025/);
  assert.doesNotMatch(legend, /dashed/);
});

test('rewrite stage delegates balanced operations and sign reversal to the mature relation solver', () => {
  const rewrite = executableSource(componentSource('src/tools/systemsWorkspace/EmbeddedInequalityRewrite.jsx'));
  const relationCore = executableSource(componentSource('src/MultiRelationAlgebraCore.jsx'));
  assert.match(rewrite, /import MultiRelationAlgebraCore from '..\/..\/MultiRelationAlgebraCore\.jsx'/);
  assert.match(rewrite, /<MultiRelationAlgebraCore/);
  assert.match(relationCore, /applyBalancedOperationToBranches/);
  assert.match(relationCore, /requireExplicitPlacement:\s*true/);
  assert.match(relationCore, /requiresInequalityFlip/);
  assert.match(relationCore, /pendingRelationFlip/);
  assert.match(relationCore, /validateRelationTransition/);
  assert.match(rewrite, /graphableConstraintFromRelation\(relation\)/);
});
