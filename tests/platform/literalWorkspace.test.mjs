import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildLiteralWorkspaceQuestion, expandImplicitProducts, readLiteralEquation,
  readLiteralVariable, usesLiteralWorkspace,
} from '../../src/literalWorkspace.js';
import { latexToExpression, parseOperationOperand } from '../../src/algebraAstEngine.js';
import { applyBalancedOperation, isSolvedEquation, parseEquationInput } from '../../src/algebraAstEngine.js';

const AREA = { type: 'literal', prompt: 'Solve for h.', equationLatex: 'A = bh', solveFor: 'h', answer: 'A/b' };

// --- Routing is opt-in ------------------------------------------------------

test('an ordinary literal question keeps the written-answer grader', () => {
  assert.equal(usesLiteralWorkspace(AREA), false);
  assert.equal(usesLiteralWorkspace({ ...AREA, workspace: false }), false);
  assert.equal(usesLiteralWorkspace({ type: 'algebra', workspace: true }), false, 'only literal questions route here');
});

test('a question may ask for the balance, three ways', () => {
  assert.equal(usesLiteralWorkspace({ ...AREA, workspace: true }), true);
  assert.equal(usesLiteralWorkspace({ ...AREA, solveOnBalance: true }), true);
  assert.equal(usesLiteralWorkspace({ ...AREA, presentation: 'workspace' }), true);
});

// --- Reading the question ---------------------------------------------------

test('the equation is read from whichever field the question used', () => {
  // Letters written side by side become explicit products, because mathjs
  // otherwise reads `bh` as one symbol called "bh".
  assert.equal(readLiteralEquation({ equationLatex: 'A = bh' }), 'A = b*h');
  assert.equal(readLiteralEquation({ formula: 'P = 2l + 2w' }), 'P = 2l + 2w');
  assert.equal(readLiteralEquation({ equation: 'y = mx + b' }), 'y = m*x + b');
  assert.equal(readLiteralEquation({ formulaLatex: 'A = \\frac{1}{2}bh' }), 'A = ((1)/(2))b*h');
  assert.equal(readLiteralEquation({ equation: 'V = lwh' }), 'V = l*w*h');
  assert.equal(readLiteralEquation({ prompt: 'no equation here' }), null);
  assert.equal(readLiteralEquation({ equation: 'a = b = c' }), null, 'two equals signs is not an equation');
});

test('the variable comes from solveFor', () => {
  assert.equal(readLiteralVariable(AREA), 'h');
  assert.equal(readLiteralVariable({ variable: 'w' }), 'w');
  assert.equal(readLiteralVariable({}), '');
});

// --- Building the workspace question ----------------------------------------

test('a literal question becomes a stepAlgebra question aimed at its letter', () => {
  const { question, reason } = buildLiteralWorkspaceQuestion({ ...AREA, workspace: true });
  assert.equal(reason, null);
  assert.equal(question.type, 'stepAlgebra');
  assert.equal(question.equation, 'A = b*h');
  assert.equal(question.objective.variable, 'h');
  assert.equal(question.objective.kind, 'isolate');
  // A/b is finished. Insisting on a "simplified" form invites arguments about
  // notation rather than algebra.
  assert.equal(question.objective.simplifyRequired, false);
});

test('a symbolic rearrangement does not start on the most guided level', () => {
  const { question } = buildLiteralWorkspaceQuestion({ ...AREA, workspace: true });
  assert.equal(question.workspaceDifficulty, 3);
  const chosen = buildLiteralWorkspaceQuestion({ ...AREA, workspace: true, workspaceDifficulty: 4 });
  assert.equal(chosen.question.workspaceDifficulty, 4, 'the teacher\'s level still wins');
});

test('a question that cannot be built says why instead of failing quietly', () => {
  assert.match(buildLiteralWorkspaceQuestion({ type: 'literal', solveFor: 'h' }).reason, /no equation/);
  assert.match(buildLiteralWorkspaceQuestion({ type: 'literal', equation: 'A = bh' }).reason, /which variable/);
  assert.match(
    buildLiteralWorkspaceQuestion({ type: 'literal', equation: 'A = bh', solveFor: 'q' }).reason,
    /does not contain "q"/,
  );
});

test('a multi-letter quantity is left alone', () => {
  // `SA` is one quantity, not S times A; `Area` is a word, not four variables.
  assert.equal(expandImplicitProducts('SA = 2lw'), 'SA = 2l*w');
  assert.equal(expandImplicitProducts('Area = base'), 'Area = base');
  assert.equal(expandImplicitProducts('C = 2pi r'), 'C = 2pi r', 'pi is a constant, not p times i');
  assert.match(
    buildLiteralWorkspaceQuestion({ type: 'literal', equation: 'Area = base', solveFor: 'h' }).reason,
    /does not contain/,
  );
});

// --- The workspace can actually solve it ------------------------------------

test('A = bh is solved for h by one symbolic step on the balance', () => {
  const { question } = buildLiteralWorkspaceQuestion({ ...AREA, workspace: true });
  const state = parseEquationInput(question);
  assert.equal(isSolvedEquation(state), false);

  const move = applyBalancedOperation({ equationState: state, operation: 'divide', operand: 'b' });
  assert.equal(move.solved, true, `h should be isolated, got ${JSON.stringify(move.simplified)}`);
  assert.equal(move.productive, true);
  // Dividing by a letter is only legitimate when that letter is not zero, and
  // the workspace says so rather than assuming it.
  assert.equal(move.assumption, 'b ≠ 0');
});

test('y = mx + b takes two steps, and neither is arithmetic', () => {
  const { question } = buildLiteralWorkspaceQuestion({
    type: 'literal', equation: 'y = mx + b', solveFor: 'x', workspace: true,
  });
  const first = applyBalancedOperation({
    equationState: parseEquationInput(question), operation: 'subtract', operand: 'b',
  });
  assert.equal(first.solved, false);
  const second = applyBalancedOperation({
    equationState: { ...parseEquationInput(question), ...first.simplified }, operation: 'divide', operand: 'm',
  });
  assert.equal(second.solved, true, `x should be isolated, got ${JSON.stringify(second.simplified)}`);
});

// --- Symbolic operands (F10) -------------------------------------------------

test('an operand typed as mathematics parses the same as one typed as text', () => {
  assert.equal(parseOperationOperand('1/2').expression, parseOperationOperand('\\frac{1}{2}').expression);
  assert.equal(parseOperationOperand('\\frac{1}{2}').numericValue, 0.5);
});

test('a letter is a legitimate operand', () => {
  const parsed = parseOperationOperand('b');
  assert.equal(parsed.numericValue, null, 'a letter has no numeric value, and that is not an error');
  assert.deepEqual(parsed.symbols, ['b']);
});

test('LaTeX the student can produce is understood', () => {
  assert.equal(latexToExpression('2\\cdot3'), '2*3');
  assert.equal(latexToExpression('\\left(x+1\\right)'), '(x+1)');
  assert.equal(latexToExpression('\\frac{\\frac{1}{2}}{3}'), '((((1)/(2)))/(3))');
  assert.equal(parseOperationOperand('\\frac{\\frac{1}{2}}{3}').numericValue, 0.1666666667);
});

test('an equals sign in the operand is still refused', () => {
  assert.throws(() => parseOperationOperand('x = 2'), /without an equals sign/);
  assert.throws(() => parseOperationOperand(''), /Enter a number/);
});
