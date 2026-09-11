import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_MAJOR_TICKS,
  graphHealth,
  interactionIncrements,
  majorTicks,
  residualScale,
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
