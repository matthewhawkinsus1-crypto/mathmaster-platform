import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  applyBalancedOperation,
  latexToExpression,
  parseEquationInput,
  parseOperationOperand,
  splitAdditiveTerms,
} from '../../src/algebraAstEngine.js';
import {
  applyBalancedOperationToBranches,
  buildAbsoluteValueSplit,
  parseRelationSource,
  relationExpressionsEquivalent,
  relationExpressionToLatex,
} from '../../src/algebraRelationFoundation.js';
import {
  calculateStepPartialCredit,
  getQuestionCredit,
  normalizeQuestionRecord,
} from '../../src/attemptPolicy.js';

const read = (path) => fs.readFileSync(path, 'utf8');

test('MathLive compact one-half fractions are valid operation operands', () => {
  assert.equal(parseOperationOperand('\\frac12').numericValue, 0.5);
  assert.equal(parseOperationOperand('\\frac1{2}').numericValue, 0.5);
  assert.equal(parseOperationOperand('\\frac{1}2').numericValue, 0.5);
  assert.doesNotMatch(latexToExpression('\\frac12'), /\\frac/);
});

test('a grouped symbolic divisor such as (1/2)(b+c) is accepted and can isolate h', () => {
  const operand = parseOperationOperand('(1/2)(b+c)');
  assert.deepEqual(operand.symbols.slice().sort(), ['b', 'c']);

  const equation = parseEquationInput({
    equation: 'A = (1/2) * h * (b+c)',
    solveFor: 'h',
  });
  const move = applyBalancedOperation({
    equationState: equation,
    operation: 'divide',
    operand: '(1/2)(b+c)',
  });
  assert.equal(move.solved, true);
});

test('subtracting p from both absolute-value branches preserves the negative branch sign', () => {
  const initial = parseRelationSource('|8+p| = 2*p - 3', 'p');
  const split = buildAbsoluteValueSplit(initial, 0, 'or');
  assert.equal(split.ready, true);

  const result = applyBalancedOperationToBranches(
    split.state,
    'subtract',
    'p',
    {
      branchIndices: [0, 1],
      placementByBranch: {
        0: {
          0: { kind: 'under', termIndex: 1 },
          1: { kind: 'under', termIndex: 0 },
        },
        1: {
          0: { kind: 'under', termIndex: 1 },
          1: { kind: 'under', termIndex: 0 },
        },
      },
      requireExplicitPlacement: true,
    },
  );

  const branchBRight = result.state.branches[1].expressions[1];
  assert.equal(
    relationExpressionsEquivalent(branchBRight, '-3*p + 3', 'p'),
    true,
    `negative branch changed sign: ${branchBRight}`,
  );
  assert.equal(
    relationExpressionsEquivalent(branchBRight, 'p + 3', 'p'),
    false,
    'the -2p term must never turn positive during placement',
  );

  const renderedTerms = splitAdditiveTerms(branchBRight);
  assert.ok(renderedTerms?.length >= 2);
  assert.match(renderedTerms[0].text, /^-/);
  assert.match(renderedTerms[0].latex, /^-/);
  assert.match(relationExpressionToLatex(branchBRight), /^-/);
});

test('multi-relation renderer uses the signed term LaTeX directly instead of reparsing it', () => {
  const source = read('src/MultiRelationAlgebra.jsx');
  assert.match(source, /const rawTermLatex = String\(term\.latex \|\| ''\)\.trim\(\)/);
  assert.match(source, /const visibleTermLatex =/);
  assert.match(source, /<MathDisplay value=\{visibleTermLatex\}/);
  assert.doesNotMatch(source, /expressionToLatex\(visibleTerm\)/);
});

test('step credit uses one planned denominator so a longer valid route never loses earned credit', () => {
  const steps = [
    { variantIndex: 0, accepted: true, productive: true, earned: 2, possible: 2, expectedTotalPoints: 6, equationBefore: 'A', equationAfter: 'B' },
    { variantIndex: 0, accepted: true, productive: true, earned: 1, possible: 2, expectedTotalPoints: 6, equationBefore: 'B', equationAfter: 'C' },
    { variantIndex: 0, accepted: true, productive: true, earned: 2, possible: 2, expectedTotalPoints: 6, equationBefore: 'C', equationAfter: 'D' },
    { variantIndex: 0, accepted: true, productive: true, earned: 1, possible: 2, expectedTotalPoints: 6, equationBefore: 'D', equationAfter: 'E' },
  ];
  assert.equal(calculateStepPartialCredit(steps, 0), 90);
});

test('cycling back through an old algebra state cannot farm partial credit', () => {
  const steps = [
    { variantIndex: 0, accepted: true, productive: true, earned: 2, possible: 2, expectedTotalPoints: 6, equationBefore: 'x=1', equationAfter: 'x+1=2' },
    { variantIndex: 0, accepted: true, productive: true, earned: 2, possible: 2, expectedTotalPoints: 6, equationBefore: 'x+1=2', equationAfter: 'x=1' },
  ];
  assert.equal(calculateStepPartialCredit(steps, 0), 33);
});

test('stored step history improves legacy and closed-assignment credit without requiring another attempt', () => {
  const record = normalizeQuestionRecord({
    status: 'expired',
    variantIndex: 0,
    partialCredit: 10,
    bestPartialCredit: 10,
    stepGrades: [
      { variantIndex: 0, accepted: true, productive: true, earned: 2, possible: 2, expectedTotalPoints: 6, equationBefore: 'A', equationAfter: 'B' },
      { variantIndex: 0, accepted: true, productive: true, earned: 2, possible: 2, expectedTotalPoints: 6, equationBefore: 'B', equationAfter: 'C' },
    ],
  });
  assert.equal(record.bestPartialCredit, 67);
  assert.equal(getQuestionCredit(record), 0.67);
});

test('multi-relation algebra can cancel an armed operation and rewrite closes the composer', () => {
  const source = read('src/MultiRelationAlgebra.jsx');
  assert.match(source, /const cancelBasicOperation = \(\) =>/);
  assert.match(source, /setOperation\(null\)/);
  assert.match(source, /setOperand\(''\)/);
  assert.match(source, /const openRewrite = \(\) =>[\s\S]*cancelBasicOperation\(\)/);
  assert.match(source, /aria-label="Cancel current algebra operation"/);
});

test('teacher Live Class receives the class schedule and renders active Warm-Up and DOL countdowns', () => {
  const live = read('src/components/teacher/LiveClassMonitor.jsx');
  const home = read('src/TeacherHome.jsx');
  assert.match(live, /classSchedule = null/);
  assert.match(live, /activeSectionTimers/);
  assert.match(live, /getWarmupState/);
  assert.match(live, /getDOLState/);
  assert.match(live, /ACTIVE TIMERS/);
  assert.match(live, /<DOLCountdown endsAt=\{endsAt\}/);
  assert.match(home, /<LiveClassMonitor[\s\S]*classSchedule=\{classSchedule\}/);
});


test('server passback re-derives algebra step credit and versioned reconciliation reaches recent closed assignments', () => {
  const source = read('functions/index.js');
  assert.match(source, /function storedAlgebraStepPartialCredit\(record\)/);
  assert.match(source, /Math\.max\(stored, derived\) \/ 100/);
  assert.match(source, /const RECONCILE_VERSION = 2/);
  assert.match(source, /reason: "initial-reconcile"/);
});
