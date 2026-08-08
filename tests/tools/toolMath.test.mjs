import test from 'node:test';
import assert from 'node:assert/strict';
import {
  correlation, linearRegression, residualsForLine, evaluatePolynomial, syntheticDivide,
  solveTwoLines, arithmeticTerm, geometricTerm, complexMagnitude, complexConjugate,
  evaluateFunctionSpec, intervalFromSigns,
} from '../../src/tools/shared/toolMath.js';

test('linear regression recovers exact line', () => {
  const pts=[[0,1],[1,3],[2,5],[3,7]];
  const model=linearRegression(pts);
  assert.ok(Math.abs(model.m-2)<1e-9);
  assert.ok(Math.abs(model.b-1)<1e-9);
  assert.ok(Math.abs(correlation(pts)-1)<1e-9);
  assert.equal(residualsForLine(pts,2,1).every(r=>Math.abs(r.residual)<1e-9),true);
});

test('polynomial and synthetic division agree', () => {
  assert.equal(evaluatePolynomial([1,-5,6],2),0);
  const div=syntheticDivide([1,-5,6],2);
  assert.deepEqual(div.quotient,[1,-3]);
  assert.equal(div.remainder,0);
});

test('systems classify one/none/infinite', () => {
  const one=solveTwoLines({m1:2,b1:1,m2:-1,b2:7});
  assert.equal(one.type,'one'); assert.ok(Math.abs(one.x-2)<1e-9); assert.ok(Math.abs(one.y-5)<1e-9);
  assert.equal(solveTwoLines({m1:2,b1:1,m2:2,b2:3}).type,'none');
  assert.equal(solveTwoLines({m1:2,b1:1,m2:2,b2:1}).type,'infinite');
});

test('sequence helpers',()=>{
  assert.equal(arithmeticTerm({first:4,difference:3},8),25);
  assert.equal(geometricTerm({first:2,ratio:2},5),32);
});

test('complex helpers',()=>{
  assert.equal(complexMagnitude({re:3,im:-4}),5);
  assert.deepEqual(complexConjugate({re:3,im:-4}),{re:3,im:4});
});

test('function evaluator rational asymptote',()=>{
  assert.ok(Number.isNaN(evaluateFunctionSpec({type:'rational',a:2,h:1,k:-2},1)));
  assert.equal(evaluateFunctionSpec({type:'rational',a:2,h:1,k:-2},2),0);
});

test('sign intervals solve product > 0',()=>{
  const result=intervalFromSigns([{root:-2,multiplicity:1},{root:3,multiplicity:1}],'>');
  assert.equal(result.length,2);
  assert.equal(result[0].right,-2);
  assert.equal(result[1].left,3);
});
