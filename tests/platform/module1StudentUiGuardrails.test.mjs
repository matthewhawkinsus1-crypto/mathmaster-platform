import test from 'node:test';
import assert from 'node:assert/strict';
import { parseNumericAnswer, matchesNumericAnswer } from '../../src/tools/shared/toolMath.js';
import { expandRecipe, relationIsFunction } from '../../src/platform/workflow/questionRecipes.js';

test('numeric tool answers accept simple fractions students naturally type',()=>{
  assert.equal(parseNumericAnswer('1/3'), 1/3);
  assert.equal(parseNumericAnswer('−1/4'), -0.25);
  assert.equal(matchesNumericAnswer('1/2', 0.5, 1e-9), true);
  assert.equal(parseNumericAnswer('1/0'), null);
});

test('function-model recipe preserves zero as a table input',()=>{
  const expanded=expandRecipe({
    type:'relationshipModel',
    recipe:{name:'functionModeling',ask:['equation','table']},
    tableXValues:[0,1,2,3],
  });
  const table=expanded.workflow.find((stage)=>stage.id==='table');
  assert.deepEqual(table.xValues,[0,1,2,3]);
});

test('relation recipe handles Firestore-safe object pairs',()=>{
  const pairs=[{x:-2,y:3},{x:1,y:2},{x:1,y:5}];
  assert.equal(relationIsFunction(pairs),false);
  const expanded=expandRecipe({
    type:'relationMapping',
    recipe:{name:'relationRepresentations',ask:['domain','range','isFunction']},
    pairs,
  });
  assert.deepEqual(expanded.grading.domain.set,[-2,1]);
  assert.deepEqual(expanded.grading.range.set,[2,3,5]);
  assert.equal(expanded.grading.isFunction,'No');
});

import { compareMathAnswer } from '../../src/answerUtils.js';

test('inequality answers accept MathLive and unicode comparison symbols', () => {
  assert.equal(compareMathAnswer('t\\ge0', 't>=0'), true);
  assert.equal(compareMathAnswer('x≤5', 'x<=5'), true);
  assert.equal(compareMathAnswer('y\\neq2', 'y!=2'), true);
});
