import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildExpressionFunctionSpec,
  evaluateModelAt,
  evaluateNumericValue,
  parseFunctionModel,
  toEvaluableExpression,
} from '../../src/platform/workflow/modelExpression.js';
import { evaluateGraphFunction } from '../../src/functionGraphUtils.js';

test('student-named function variables are preserved and evaluable', () => {
  const model = parseFunctionModel('W(t)=5t');
  assert.equal(model.variable, 't');
  assert.equal(model.expression, '5t');
  assert.equal(evaluateModelAt(model, 3), 15);
});

test('the graph evaluator uses the same student model parser as table grading', () => {
  const spec = buildExpressionFunctionSpec('W(t)=5t', { referencePoints: [[0, 0], [1, 5], [2, 10]] });
  assert.equal(spec.type, 'expression');
  assert.equal(evaluateGraphFunction(spec, 4), 20);
  assert.equal(toEvaluableExpression('W(t)=5t'), '5t');
});

test('malformed student equations do not become hidden fallback graphs', () => {
  assert.equal(parseFunctionModel('W(t)='), null);
  assert.equal(buildExpressionFunctionSpec('W(t)=???'), null);
});

test('table values may use exact numeric expressions such as fractions', () => {
  assert.equal(evaluateNumericValue('1/3'), 1 / 3);
  assert.equal(evaluateNumericValue('\\frac{3}{4}'), 0.75);
  assert.equal(evaluateNumericValue('x'), null, 'a free variable is not a numeric table entry');
});

/*
 * THE SAME LATEX BOUNDARY AS EVERY OTHER EVALUATOR.
 *
 * This file used to keep its own LaTeX reader. MathLive writes any single-digit
 * fraction compactly (\frac23 — typed or from the keypad), which that reader
 * could not parse, and it deleted braces after one pass, so 2^{x+1} was
 * evaluated as 2^x + 1. A student's exponential model was graphed and graded as
 * a different function. Each case below failed before the shared boundary.
 */
test('a function rule written with a compact MathLive fraction is a function', () => {
  assert.equal(evaluateModelAt('f(x)=-\\frac23x+4', 3), 2);
  assert.equal(evaluateModelAt('y=\\dfrac{1}{2}x', 3), 1.5);
});

test('a braced exponent keeps its whole exponent', () => {
  assert.equal(evaluateModelAt('f(x)=2^{x+1}', 3), 16);
  assert.equal(evaluateModelAt('A(t)=100\\left(0.5\\right)^{\\frac{t}{2}}', 4), 25);
});

test('a fraction inside a fraction and a space-separated product evaluate', () => {
  assert.ok(Math.abs(evaluateModelAt('y=\\frac{\\frac12}{3}x', 6) - 1) < 1e-12);
  assert.ok(Math.abs(evaluateModelAt('A(r)=\\pi r^2', 2) - 4 * Math.PI) < 1e-12);
});

test('the compiled-model cache stays bounded however much a student types', async () => {
  const { compiledModelCacheSize } = await import('../../src/platform/workflow/modelExpression.js');
  for (let coefficient = 0; coefficient < 1200; coefficient += 1) parseFunctionModel(`f(x)=${coefficient}x+1`);
  assert.ok(compiledModelCacheSize() <= 400, `cache holds ${compiledModelCacheSize()} models`);
});
