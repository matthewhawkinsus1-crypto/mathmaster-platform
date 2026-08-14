import test from 'node:test';
import assert from 'node:assert/strict';
import { builderEquation, scoreConstraintModel } from '../../src/tools/constraintFunctionBuilder/constraintFunctionMath.js';

test('constraint builder accepts many different exponential decay equations', () => {
  const constraints = [
    { kind: 'family', value: 'exponential' },
    { kind: 'continuity', value: 'continuous' },
    { kind: 'behavior', value: 'decreasing' },
  ];
  for (const model of [
    { family: 'exponential', a: 3, base: 0.5, h: 0, k: 0, domainMode: 'continuous' },
    { family: 'exponential', a: -2, base: 3, h: 1, k: 4, domainMode: 'continuous' },
  ]) {
    const result = scoreConstraintModel(model, constraints);
    assert.equal(result.isCorrect, true);
  }
});

test('constraint builder grades a discrete quadratic minimum by properties, not one equation', () => {
  const constraints = [
    { kind: 'family', value: 'quadratic' },
    { kind: 'continuity', value: 'discrete' },
    { kind: 'extremum', value: 'minimum' },
    { kind: 'isFunction', value: true },
  ];
  const result = scoreConstraintModel({ family: 'quadratic', a: 2, h: -1, k: 7, domainMode: 'discrete' }, constraints);
  assert.equal(result.isCorrect, true);
});

test('vertical line satisfies continuous straight-line non-function constraint and has correct equation', () => {
  const constraints = [
    { kind: 'continuity', value: 'continuous' },
    { kind: 'straightLine', value: true },
    { kind: 'isFunction', value: false },
    { kind: 'xIntercept', value: 3 },
  ];
  const model = { family: 'verticalLine', verticalX: 3, domainMode: 'continuous' };
  assert.equal(scoreConstraintModel(model, constraints).isCorrect, true);
  assert.equal(builderEquation(model), 'x = 3');
});

test('degenerate y = constant is not accepted as a quadratic family', () => {
  const result = scoreConstraintModel(
    { family: 'quadratic', a: 0, h: 2, k: 4, domainMode: 'continuous' },
    [{ kind: 'family', value: 'quadratic' }],
  );
  assert.equal(result.isCorrect, false);
});

test('switching from a shifted family to linear does not keep a hidden horizontal shift', () => {
  assert.equal(builderEquation({ family: 'linear', a: 2, h: 5, k: 3 }), 'f(x) = 2x + 3');
  const result = scoreConstraintModel(
    { family: 'linear', a: 2, h: 5, k: 3, domainMode: 'continuous' },
    [{ kind: 'yIntercept', value: 3 }],
  );
  assert.equal(result.isCorrect, true);
});

test('constraint builder accepts Firestore-safe point objects for pass-through and vertex constraints', () => {
  const linear = scoreConstraintModel({ family: 'linear', a: 2, k: 1, domainMode: 'continuous' }, [
    { kind: 'passesThrough', point: { x: 2, y: 5 } },
  ]);
  assert.equal(linear.isCorrect, true);

  const quadratic = scoreConstraintModel({ family: 'quadratic', a: -1, h: 3, k: 4, domainMode: 'continuous' }, [
    { kind: 'vertex', point: { x: 3, y: 4 } },
  ]);
  assert.equal(quadratic.isCorrect, true);
});
