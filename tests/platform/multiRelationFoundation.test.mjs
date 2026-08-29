import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  OTHER_ALGEBRA_OPERATIONS,
  absoluteValueSplitInputModel,
  applyBalancedOperationToRelation,
  buildAbsoluteValueSplit,
  buildStudentAuthoredAbsoluteValueEqualitySplit,
  describeAbsoluteValueExpression,
  needsMultiRelationWorkspace,
  parseRelationSource,
  relationContainsInvisibleNegativeAbsolute,
  relationSolutionSummary,
  relationStateContainsAbsoluteValue,
  relationStateToText,
  verifyRelationCandidates,
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

test('absolute-value equation split editor exposes the inside expression but not the negative branch', () => {
  const state = parseRelationSource('|k + 6| = 9', 'k');
  const model = absoluteValueSplitInputModel(state);
  assert.equal(model.ready, true);
  assert.equal(model.studentAuthorsBranchValues, true);
  assert.equal(model.expectedStructure, 'or');
  assert.match(model.inner.replace(/\s+/g, ''), /k\+6/);
  assert.equal(model.bound, '9');
});

test('student must author both absolute-value equation branch values', () => {
  const state = parseRelationSource('|k + 6| = 9', 'k');

  const incomplete = buildStudentAuthoredAbsoluteValueEqualitySplit(state, 0, 'or', ['9', '']);
  assert.equal(incomplete.ready, false);
  assert.equal(incomplete.needsStudentValues, true);

  const wrong = buildStudentAuthoredAbsoluteValueEqualitySplit(state, 0, 'or', ['9', '9']);
  assert.equal(wrong.ready, false);
  assert.equal(wrong.rejectedStudentSplit, true);

  const correct = buildStudentAuthoredAbsoluteValueEqualitySplit(state, 0, 'or', ['9', '-9']);
  assert.equal(correct.ready, true);
  assert.equal(correct.state.connective, 'OR');
  assert.equal(correct.state.branches.length, 2);
  assert.deepEqual(correct.state.branches.map((branch) => branch.expressions[1]), ['9', '-9']);
});

test('student-authored symbolic split accepts B and -B without creating either for the student', () => {
  const state = parseRelationSource('|8 + p| = 2*p - 3', 'p');
  const split = buildStudentAuthoredAbsoluteValueEqualitySplit(
    state,
    0,
    'or',
    ['2p - 3', '-(2p - 3)'],
  );
  assert.equal(split.ready, true);
  assert.equal(split.state.branches.length, 2);
});

test('attempting to split an absolute value equal to a negative number is rejected without auto-declaring no solution', () => {
  const state = parseRelationSource('|5*x - 4| = -6', 'x');
  const attempted = buildStudentAuthoredAbsoluteValueEqualitySplit(state, 0, 'or', ['-6', '6']);
  assert.equal(attempted.ready, false);
  assert.equal(attempted.rejectedStudentSplit, true);
  assert.equal(attempted.state, undefined);
  assert.doesNotMatch(attempted.reason, /no solution/i);
});

test('advanced UI requires typed split values and keeps no-solution as a student choice', () => {
  const src = fs.readFileSync('src/MultiRelationAlgebra.jsx', 'utf8');
  assert.match(src, /Type the right side of both equations/);
  assert.match(src, /Branch A right side/);
  assert.match(src, /Branch B right side/);
  assert.match(src, /Check split/);
  assert.match(src, /buildStudentAuthoredAbsoluteValueEqualitySplit/);
  assert.doesNotMatch(src, /setRelationState\([^\n]*special:\s*['"]noSolution/);
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

test('numeric relation summaries preserve exact candidate expressions for student verification', () => {
  const summary = relationSolutionSummary(parseRelationSource('p = 11 OR p = -5/3', 'p'));
  assert.deepEqual(summary.values, [-5 / 3, 11]);
  assert.deepEqual(summary.valueExpressions, ['-5 / 3', '11']);
});

test('absolute-value candidates are checked against the original equation for extraneous values', () => {
  const original = parseRelationSource('|8 + p| = 2*p - 3', 'p');
  assert.equal(relationStateContainsAbsoluteValue(original), true);
  assert.deepEqual(
    verifyRelationCandidates(original, [-5 / 3, 11], 'p').map(({ valid }) => valid),
    [false, true],
  );
});

test('ordinary absolute-value equations verify both legitimate branches', () => {
  const original = parseRelationSource('|x| = 2', 'x');
  assert.deepEqual(
    verifyRelationCandidates(original, [-2, 2], 'x').map(({ valid }) => valid),
    [true, true],
  );
});

test('advanced absolute-value UI requires the student to classify candidates in the original equation', () => {
  const src = fs.readFileSync('src/MultiRelationAlgebra.jsx', 'utf8');
  assert.match(src, /Check each candidate in the original equation/);
  assert.match(src, /Valid solution/);
  assert.match(src, /Extraneous/);
  assert.match(src, /candidateVerificationCorrect/);
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

test('advanced solver opens Other operations by default on load and reset', () => {
  const src = fs.readFileSync('src/MultiRelationAlgebra.jsx', 'utf8');
  assert.match(src, /const \[otherOpen, setOtherOpen\] = useState\(true\)/);
  assert.match(src, /setRewriteValue\(''\);\s*setOtherOpen\(true\);\s*setCompleteSquareOpen\(false\);/);
  const resetStart = src.indexOf('const reset = () =>');
  const resetEnd = src.indexOf('const active =', resetStart);
  assert.ok(resetStart >= 0 && resetEnd > resetStart);
  assert.match(src.slice(resetStart, resetEnd), /setOtherOpen\(true\)/);
});
