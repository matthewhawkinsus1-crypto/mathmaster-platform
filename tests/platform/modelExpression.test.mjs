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
