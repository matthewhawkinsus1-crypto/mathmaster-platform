import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_MAJOR_TICKS,
  fitAdjustmentPlan,
  graphHealth,
  interactionIncrements,
  majorTicks,
  residualScale,
  stepFitControl,
} from '../../src/platform/graph/graphScaleService.js';

test('population-scale axes normalize unusable authored increments', () => {
  const ticks = majorTicks(18000, 28000, 1);
  assert.ok(ticks.length <= MAX_MAJOR_TICKS, `generated ${ticks.length} major ticks`);
  assert.ok(ticks.every((tick, index) => index === 0 || tick > ticks[index - 1]));
});

test('residual policy includes zero and gives the residuals useful symmetric space', () => {
  const scale = residualScale([-81, -12, 7, 64]);
  assert.ok(scale.min < -81 && scale.max > 64);
  assert.equal(Math.abs(scale.min), Math.abs(scale.max));
  assert.deepEqual(graphHealth({ xMin:0, xMax:5, yMin:scale.min, yMax:scale.max, residual:true }), []);
});

test('interaction increments remain precise at small scale and practical at population scale', () => {
  assert.deepEqual(interactionIncrements(0.7), { fine:0.01, normal:0.1, coarse:1 });
  assert.deepEqual(interactionIncrements(22000), { fine:100, normal:1000, coarse:10000 });
});

test('graph health reports unsafe bounds, visibility, and residual contracts', () => {
  assert.deepEqual(
    graphHealth({ xMin:1, xMax:1, yMin:2, yMax:3, points:[[4, 5]], residual:true }),
    ['invalid-bounds', 'data-outside-bounds', 'residual-excludes-zero'],
  );
});


test('hand-fit controls choose reachable scale-aware steps and start outside the accepted band', () => {
  const plan = fitAdjustmentPlan({
    targetSlope: 0.281531,
    targetIntercept: 36.2729,
    xMin: 1400,
    xMax: 3400,
    yMin: 450,
    yMax: 1000,
  });

  assert.ok(Math.abs(plan.slope.start - plan.slope.target) > plan.slope.tolerance);
  assert.ok(Math.abs(plan.intercept.start - plan.intercept.target) > plan.intercept.tolerance);
  assert.ok(plan.slope.step > 0 && plan.slope.step < plan.slope.tolerance);
  assert.ok(plan.intercept.step > 0 && plan.intercept.step < plan.intercept.tolerance);

  let slope = plan.slope.start;
  let intercept = plan.intercept.start;
  const slopeDirection = Math.sign(plan.slope.target - slope);
  const interceptDirection = Math.sign(plan.intercept.target - intercept);
  for (let i = 0; i < 20; i += 1) {
    if (Math.abs(slope - plan.slope.target) > plan.slope.step / 2) slope = stepFitControl(slope, slopeDirection, plan.slope);
    if (Math.abs(intercept - plan.intercept.target) > plan.intercept.step / 2) intercept = stepFitControl(intercept, interceptDirection, plan.intercept);
  }
  assert.ok(Math.abs(slope - plan.slope.target) <= plan.slope.tolerance);
  assert.ok(Math.abs(intercept - plan.intercept.target) <= plan.intercept.tolerance);
});

test('hand-fit steps adapt to small classroom-scale data instead of reusing population increments', () => {
  const small = fitAdjustmentPlan({
    targetSlope: 1.2,
    targetIntercept: 2.5,
    xMin: 1,
    xMax: 6,
    yMin: 3,
    yMax: 9,
  });
  const large = fitAdjustmentPlan({
    targetSlope: 0.28,
    targetIntercept: 36,
    xMin: 1400,
    xMax: 3400,
    yMin: 450,
    yMax: 1000,
  });
  assert.ok(small.slope.step >= 0.01);
  assert.ok(large.intercept.step > small.intercept.step);
});
