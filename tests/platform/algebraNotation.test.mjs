import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyBalancedOperation, describeOperationToken, equationToLatex, parseEquationInput,
} from '../../src/algebraAstEngine.js';

// Characters and commands that must never appear in the mathematics itself.
// The rail may show × and ÷ as action icons; the equation may not.
const FORBIDDEN = [
  ['×', 'multiplication cross'],
  ['÷', 'division obelus'],
  ['\\cdot', 'centre dot'],
  ['\\div', 'LaTeX \\div'],
  ['\\times', 'LaTeX \\times'],
];

const assertTraditional = (latex, context) => {
  FORBIDDEN.forEach(([needle, name]) => {
    assert.ok(!String(latex).includes(needle), `${context} rendered a ${name}: ${latex}`);
  });
};

const EQUATIONS = ['3x + 6 = 21', '3x = 15', 'x/3 = 5', '2x - 7 = 9', '5(x + 1) = 20'];
const OPERATIONS = [['add', '4'], ['subtract', '6'], ['multiply', '3'], ['divide', '3']];

test('F5/F6 — no operation ever writes a cross or an obelus into the work', () => {
  EQUATIONS.forEach((source) => {
    const state = parseEquationInput({ equation: source });
    OPERATIONS.forEach(([operation, operand]) => {
      const move = applyBalancedOperation({ equationState: state, operation, operand });
      assertTraditional(move.unsimplifiedLatex.left, `${source} · ${operation} left`);
      assertTraditional(move.unsimplifiedLatex.right, `${source} · ${operation} right`);
      assertTraditional(equationToLatex(move.simplified), `${source} · ${operation} simplified`);
    });
  });
});

test('F5 — multiplying shows a factor against a parenthesis', () => {
  const state = parseEquationInput({ equation: 'x/3 = 5' });
  const move = applyBalancedOperation({ equationState: state, operation: 'multiply', operand: '3' });
  // 3\left( … \right) — the way it is written on a board.
  assert.match(move.unsimplifiedLatex.right, /^3\\left\(/);
  assert.match(move.unsimplifiedLatex.left, /^3\\left\(/);
});

test('F6 — dividing shows a real stacked fraction, not a slash or an obelus', () => {
  const state = parseEquationInput({ equation: '3x = 15' });
  const move = applyBalancedOperation({ equationState: state, operation: 'divide', operand: '3' });
  assert.match(move.unsimplifiedLatex.left, /^\\frac\{/, 'the variable side must be a fraction');
  assert.match(move.unsimplifiedLatex.right, /^\\frac\{15\}\{3\}$/, 'the numeric side must be 15 over 3');
});

test('the dragged chip uses traditional notation too', () => {
  // This is the one that was wrong: the chip flying into the equation read
  // "× 3", which is the button's icon rather than the mathematics.
  const multiply = describeOperationToken('multiply', '3');
  assert.equal(multiply.kind, 'factor');
  assertTraditional(multiply.text, 'multiply chip');

  const divide = describeOperationToken('divide', '3');
  assert.equal(divide.kind, 'fraction', 'a quotient chip must stack, not use a slash glyph');
  assertTraditional(divide.text, 'divide chip');
  assert.equal(divide.operand, '3');

  // Addition and subtraction are already written the traditional way.
  assert.equal(describeOperationToken('add', '4').text, '+ 4');
  assert.equal(describeOperationToken('subtract', '6').text, '− 6');
});

test('a missing operand degrades rather than rendering "undefined"', () => {
  const token = describeOperationToken('multiply', null);
  assert.equal(token.operand, '?');
  assert.ok(!token.text.includes('undefined'));
});

test('symbolic operands keep traditional notation', () => {
  // F10 territory: literal equations divide by w, not by a number. The notation
  // rule does not change because the operand has letters in it.
  const state = parseEquationInput({ equation: 'A = lw' });
  const move = applyBalancedOperation({ equationState: state, operation: 'divide', operand: 'w' });
  assertTraditional(move.unsimplifiedLatex.left, 'literal divide left');
  assertTraditional(move.unsimplifiedLatex.right, 'literal divide right');
  assert.match(move.unsimplifiedLatex.left, /^\\frac\{/);
  assert.equal(describeOperationToken('divide', 'w').operand, 'w');
});

test('a question authored with equationLatex builds the workspace', () => {
  // The authoring catalogue lists `equationLatex` as a stepAlgebra field and its
  // own example uses it — but nothing translated it into what this parser reads,
  // so the balance came up null and the student got "This question could not be
  // displayed" on a question that was correctly authored.
  const state = parseEquationInput({ equationLatex: '3x - 6 = 9', variable: 'x' });
  assert.equal(state.left, '3x - 6');
  assert.equal(state.right, '9');
  assert.equal(state.variable, 'x');

  // It is converted rather than read raw, so LaTeX structure survives.
  const fraction = parseEquationInput({ equationLatex: '\\frac{x}{2} = 5' });
  assert.equal(fraction.right, '5');
  assert.ok(!fraction.left.includes('\\frac'), `LaTeX left unconverted: ${fraction.left}`);

  // An explicit `equation` still wins, and no equation at all still throws.
  assert.equal(parseEquationInput({ equation: 'x = 1', equationLatex: 'y = 2' }).left, 'x');
  assert.throws(() => parseEquationInput({ prompt: 'Solve.' }));
});
