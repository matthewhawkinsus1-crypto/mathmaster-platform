import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  OTHER_ALGEBRA_OPERATIONS,
  applyBalancedOperationToRelation,
  buildAbsoluteValueSplit,
  describeAbsoluteValueExpression,
  needsMultiRelationWorkspace,
  parseRelationSource,
  relationContainsInvisibleNegativeAbsolute,
  relationSolutionSummary,
  relationStateToText,
  takeSquareRootOfRelation,
} from '../../src/algebraRelationFoundation.js';

test('single inequalities parse as two-part relations', () => {
  const state = parseRelationSource('-3*x + 5 > 14', 'x');
  assert.equal(state.branches[0].expressions.length, 2);
  assert.deepEqual(state.branches[0].relations, ['>']);
});

test('compound inequalities keep three expressions and two relations', () => {
  const state = parseRelationSource('-7 < 2*x + 1 <= 9', 'x');
  assert.equal(state.branches[0].expressions.length, 3);
  assert.deepEqual(state.branches[0].relations, ['<', '<=']);
});

test('negative division requires the student to choose reversed inequality symbols', () => {
  const state = parseRelationSource('-6 < -2*x <= 10', 'x');
  const result = applyBalancedOperationToRelation(state, 'divide', '-2');
  assert.deepEqual(result.state.branches[0].relations, ['<', '<=']);
  assert.equal(result.requiresInequalityFlip, true);
  assert.deepEqual(result.expectedRelations, ['>', '>=']);
});

test('ordinary subtraction does not reverse inequality signs', () => {
  const state = parseRelationSource('-7 < 2*x + 1 <= 9', 'x');
  const result = applyBalancedOperationToRelation(state, 'subtract', '1');
  assert.deepEqual(result.state.branches[0].relations, ['<', '<=']);
});

test('absolute value bars parse without requiring abs() author syntax', () => {
  const state = parseRelationSource('|2*x - 3| = 7', 'x');
  const descriptor = describeAbsoluteValueExpression(state.branches[0].expressions[0]);
  assert.equal(descriptor.coefficient, 1);
  assert.match(descriptor.inner.replace(/\s+/g, ''), /2\*x-3/);
});

test('an invisible negative one before absolute value is recognized', () => {
  const state = parseRelationSource('-|2*x - 3| = -7', 'x');
  assert.equal(relationContainsInvisibleNegativeAbsolute(state), true);
  assert.equal(describeAbsoluteValueExpression(state.branches[0].expressions[0]).coefficient, -1);
});

test('an explicit negative one before absolute value is recognized', () => {
  const state = parseRelationSource('-1|x + 4| <= -8', 'x');
  assert.equal(describeAbsoluteValueExpression(state.branches[0].expressions[0]).coefficient, -1);
});

test('absolute value equality splits into two OR equation branches', () => {
  const split = buildAbsoluteValueSplit(parseRelationSource('|2*x - 3| = 7', 'x'), 0, 'or');
  assert.equal(split.ready, true);
  assert.equal(split.state.connective, 'OR');
  assert.equal(split.state.branches.length, 2);
  assert.deepEqual(split.state.branches.map((branch) => branch.relations), [['='], ['=']]);
});

test('absolute value less-than becomes one three-part between inequality', () => {
  const split = buildAbsoluteValueSplit(parseRelationSource('|2*x - 3| < 7', 'x'), 0, 'and');
  assert.equal(split.ready, true);
  assert.equal(split.state.branches.length, 1);
  assert.equal(split.state.branches[0].expressions.length, 3);
  assert.deepEqual(split.state.branches[0].relations, ['<', '<']);
});

test('absolute value greater-than becomes two outside OR branches', () => {
  const split = buildAbsoluteValueSplit(parseRelationSource('|2*x - 3| >= 7', 'x'), 0, 'or');
  assert.equal(split.ready, true);
  assert.equal(split.state.connective, 'OR');
  assert.equal(split.state.branches.length, 2);
  assert.deepEqual(split.state.branches.map((branch) => branch.relations), [['<='], ['>=']]);
});

test('invisible negative one must be handled before reversing the bars', () => {
  const split = buildAbsoluteValueSplit(parseRelationSource('-|x - 1| > -5', 'x'), 0, 'or');
  assert.equal(split.ready, false);
  assert.match(split.reason, /negative one/i);
});

test('square root of a completed square keeps the absolute-value consequence', () => {
  const rooted = takeSquareRootOfRelation(parseRelationSource('(x + 3)^2 = 16', 'x'));
  assert.equal(rooted.ready, true);
  assert.match(relationStateToText(rooted.state), /abs/);
  assert.match(relationStateToText(rooted.state), /sqrt/);
});

test('isolated inequality becomes an interval for the existing number-line tool', () => {
  const summary = relationSolutionSummary(parseRelationSource('x >= -4', 'x'));
  assert.equal(summary.solved, true);
  assert.equal(summary.kind, 'intervals');
  assert.deepEqual(summary.intervals, [{
    min: -4,
    max: Number.POSITIVE_INFINITY,
    minClosed: true,
    maxClosed: false,
  }]);
});

test('compound inequality becomes one bounded interval', () => {
  const summary = relationSolutionSummary(parseRelationSource('-4 < x <= 4', 'x'));
  assert.equal(summary.solved, true);
  assert.deepEqual(summary.intervals, [{
    min: -4,
    max: 4,
    minClosed: false,
    maxClosed: true,
  }]);
});

test('two isolated equation branches become two solution values', () => {
  const summary = relationSolutionSummary(parseRelationSource('x = 5 OR x = -2', 'x'));
  assert.equal(summary.solved, true);
  assert.equal(summary.kind, 'values');
  assert.deepEqual(summary.values, [-2, 5]);
});

test('Other operations is stable rather than contextually revealing a strategy', () => {
  assert.deepEqual(
    OTHER_ALGEBRA_OPERATIONS.map((item) => item.id),
    ['squareRoot', 'reverseAbsolute', 'completeSquare', 'noSolution', 'allReals'],
  );
});

test('advanced relations route internally without a new public question type', () => {
  assert.equal(needsMultiRelationWorkspace({ type: 'stepAlgebra', equation: '|x| = 4' }), true);
  assert.equal(needsMultiRelationWorkspace({ type: 'stepAlgebra', equation: '-7 < x <= 9' }), true);
  assert.equal(needsMultiRelationWorkspace({ type: 'stepAlgebra', equation: 'x^2 + 6*x = 7' }), true);
  assert.equal(needsMultiRelationWorkspace({ type: 'stepAlgebra', equation: '4*x - 7 = 9' }), false);
});

test('QuestionEngine preserves stepAlgebra and internally routes advanced work', () => {
  const src = fs.readFileSync('src/QuestionEngine.jsx', 'utf8');
  assert.match(src, /import MultiRelationAlgebra from '\.\/MultiRelationAlgebra'/);
  assert.match(src, /needsMultiRelationWorkspace\(processedQuestion\)/);
  assert.match(src, /<MultiRelationAlgebra/);
  assert.match(src, /<StepByStepAlgebra/);
});

test('advanced workspace always exposes Other operations and reuses IntervalNumberLine', () => {
  const src = fs.readFileSync('src/MultiRelationAlgebra.jsx', 'utf8');
  assert.match(src, /Other operations/);
  assert.match(src, /OTHER_ALGEBRA_OPERATIONS\.map/);
  assert.match(src, /IntervalNumberLine/);
  assert.match(src, /ask: \['graph', 'interval'\]/);
});
