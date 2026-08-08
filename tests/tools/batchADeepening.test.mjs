import test from 'node:test';
import assert from 'node:assert/strict';
import {
  quadraticRegression,
  exponentialRegression,
  buildCandidateModels,
  chooseBestModel,
  correlationDescriptor,
  predictionKind,
} from '../../src/tools/dataModeling/dataModelingMath.js';
import {
  feasibleRegionPolygon,
  satisfiesLinearInequality,
  solve2x2System,
  solveLinearQuadratic,
  samePointSet,
} from '../../src/tools/systemsWorkspace/systemsMath.js';
import {
  composeValue,
  evaluateSpecWithDomain,
  hasFunctionalInverse,
  inverseValue,
} from '../../src/tools/inverseComposition/inverseCompositionMath.js';
import { linearRegression } from '../../src/tools/shared/toolMath.js';
import { validateToolQuestion } from '../../src/tools/toolSchemas.js';

test('quadratic regression exactly recovers y=x^2+2x+1', () => {
  const points=[[-2,1],[-1,0],[0,1],[1,4],[2,9]];
  const model=quadraticRegression(points);
  assert.ok(Math.abs(model.a-1)<1e-9);
  assert.ok(Math.abs(model.b-2)<1e-9);
  assert.ok(Math.abs(model.c-1)<1e-9);
});

test('exponential regression exactly recovers 3*2^x', () => {
  const points=[[0,3],[1,6],[2,12],[3,24]];
  const model=exponentialRegression(points);
  assert.ok(Math.abs(model.a-3)<1e-9);
  assert.ok(Math.abs(model.base-2)<1e-9);
});

test('model comparison selects linear for exact linear data', () => {
  const points=[[0,1],[1,3],[2,5],[3,7]];
  const candidates=buildCandidateModels(points,linearRegression(points));
  const best=chooseBestModel(candidates,'rmse');
  assert.equal(best.id,'linear');
  assert.ok(best.metrics.rmse<1e-9);
});

test('correlation descriptor and interpolation/extrapolation', () => {
  assert.deepEqual(correlationDescriptor(-0.91),{direction:'negative',strength:'strong'});
  assert.equal(predictionKind([[1,2],[4,8]],3),'interpolation');
  assert.equal(predictionKind([[1,2],[4,8]],6),'extrapolation');
});

test('systems inequality feasible region and point check', () => {
  const inequalities=[{m:1,b:0,relation:'>='},{m:-1,b:4,relation:'<='}];
  assert.equal(satisfiesLinearInequality(inequalities[0],2,3),true);
  assert.equal(satisfiesLinearInequality(inequalities[1],2,3),false);
  const polygon=feasibleRegionPolygon(inequalities,{xMin:0,xMax:4,yMin:0,yMax:4});
  assert.ok(polygon.length>=3);
  assert.ok(polygon.every(([x,y])=>inequalities.every((ineq)=>satisfiesLinearInequality(ineq,x,y,1e-6))));
});

test('linear-quadratic systems return order-independent intersection set', () => {
  const expected=solveLinearQuadratic({line:{m:1,b:2},quadratic:{a:1,b:0,c:-4}});
  assert.equal(expected.length,2);
  assert.equal(samePointSet([{x:3,y:5},{x:-2,y:0}],expected),true);
});

test('2x2 matrix system solves unique, none, and infinite cases', () => {
  const one=solve2x2System({a11:2,a12:1,b1:7,a21:1,a22:-1,b2:2});
  assert.equal(one.type,'one');
  assert.ok(Math.abs(one.x-3)<1e-9);
  assert.ok(Math.abs(one.y-1)<1e-9);
  assert.equal(solve2x2System({a11:1,a12:1,b1:2,a21:2,a22:2,b2:5}).type,'none');
  assert.equal(solve2x2System({a11:1,a12:1,b1:2,a21:2,a22:2,b2:4}).type,'infinite');
});

test('composition and inverse work for linear, exponential, log, and restricted quadratic', () => {
  const f={type:'linear',a:2,h:0,k:3};
  const g={type:'linear',a:-1,h:0,k:4};
  assert.equal(composeValue(f,g,2),7);
  assert.equal(inverseValue(f,evaluateSpecWithDomain(f,5)),5);

  const exp={type:'exponential',a:3,base:2,h:1,k:-4};
  const expY=evaluateSpecWithDomain(exp,4);
  assert.ok(Math.abs(inverseValue(exp,expY)-4)<1e-9);

  const log={type:'logarithmic',a:2,base:10,h:1,k:3};
  const logY=evaluateSpecWithDomain(log,101);
  assert.ok(Math.abs(inverseValue(log,logY)-101)<1e-7);

  const quad={type:'quadratic',a:1,h:2,k:-1,inverseBranch:'right',domain:{min:2}};
  assert.equal(hasFunctionalInverse(quad),true);
  const quadY=evaluateSpecWithDomain(quad,5);
  assert.ok(Math.abs(inverseValue(quad,quadY)-5)<1e-9);
});

test('batch A schemas reject unsafe mode/base/quadratic definitions', () => {
  assert.equal(validateToolQuestion({toolId:'dataModelingLab',mode:'unknown',masteryEvidenceKeys:['texas:A.4A']}).isValid,false);
  assert.equal(validateToolQuestion({toolId:'systemsWorkspace',mode:'linearQuadratic',linearQuadratic:{quadratic:{a:0}},masteryEvidenceKeys:['texas:A.5C']}).isValid,false);
  assert.equal(validateToolQuestion({toolId:'inverseCompositionLab',f:{type:'exponential',base:1},masteryEvidenceKeys:['texas:2A.2A']}).isValid,false);
});
