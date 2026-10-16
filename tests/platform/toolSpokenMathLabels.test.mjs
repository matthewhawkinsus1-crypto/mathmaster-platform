/*
 * A11Y-3 (pass 3, 04-tools-and-accessibility.md): a control whose name carries
 * math says it in words.
 *
 * The Systems substitution token was announced "Pick up the expression
 * ((12-3x)/(2)) from the isolated equation", Step Algebra's distribution token
 * "Pick up the factor -3" / "Apply the factor to 2*x", and the matrix
 * calculator's keys bracket by bracket ("[A]⁻¹·[B]"). Labels now go through
 * spokenMathValue (src/tools/shared/spokenMathValue.js), which speaks the value
 * the way MathDisplay speaks the same value on screen.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { spokenMathValue, tidyMathForSpeech } from '../../src/tools/shared/spokenMathValue.js';
import { executableSource } from './helpers/sourceContract.mjs';

const PROGRAM_SYNTAX = /[()*/~^[\]·⁻¹]/;

test('the expressions the tools really produce are spoken in words', () => {
  // What latexToExpression hands the substitution token (doubled parentheses).
  assert.equal(spokenMathValue('((12-3x)/(2))'), 'the fraction 12 minus 3x over 2 end fraction');
  // The Classwork Q2 token as persisted (tests/platform/fixtures/classworkQ2RuntimeCapture.json).
  assert.equal(spokenMathValue('-(3)+(2~ y)'), 'negative 3 plus 2 y');
  // Solved values and terms.
  assert.equal(spokenMathValue('x = 20/9'), 'x equals 20 over 9');
  assert.equal(spokenMathValue('-3'), 'negative 3');
  assert.equal(spokenMathValue('-4x+12'), 'negative 4x plus 12');
  assert.equal(spokenMathValue('(1/2)x+3'), '1 over 2 x plus 3');
  // The matrix calculator's keys.
  assert.equal(spokenMathValue('[A]⁻¹·[B]'), 'A inverse times B');
  assert.equal(spokenMathValue('[A]⁻¹'), 'A inverse');
  assert.equal(spokenMathValue('[A]+[B]'), 'A plus B');
  for (const value of ['((12-3x)/(2))', '-(3)+(2~ y)', 'x = 20/9', '[A]⁻¹·[B]', '2*x', '3x - 2y = 6']) {
    assert.doesNotMatch(spokenMathValue(value), PROGRAM_SYNTAX, `${value} is spoken without program syntax`);
  }
  assert.equal(spokenMathValue(''), '');
  assert.equal(spokenMathValue(null), '');
});

test('tidying only removes grouping a reader never sees', () => {
  // A lone term in brackets, and brackets around the whole value.
  assert.equal(tidyMathForSpeech('-(3)'), '-3');
  assert.equal(tidyMathForSpeech('x = (4)'), 'x = 4');
  assert.equal(tidyMathForSpeech('((12-3x)/(2))'), '(12-3x)/2');
  // Brackets that carry meaning stay: a product, a quantity, a group of a sum.
  assert.equal(tidyMathForSpeech('2(3)'), '2(3)');
  assert.equal(tidyMathForSpeech('(2)3'), '(2)3');
  assert.equal(tidyMathForSpeech('(x+1)(x-1)'), '(x+1)(x-1)');
  assert.equal(tidyMathForSpeech('-(x+2)'), '-(x+2)');
  assert.equal(spokenMathValue('2(3)'), '2 times the quantity 3');
});

// Every file whose controls name a math value.
const ROOT = new URL('../../', import.meta.url).pathname;
const filesIn = (dir) => readdirSync(join(ROOT, dir)).filter((name) => name.endsWith('.jsx')).map((name) => join(dir, name));
const SCOPED_FILES = [
  ...filesIn('src/tools/systemsWorkspace'),
  ...filesIn('src/tools/matrixLab'),
  ...filesIn('src/tools/stepAlgebra2'),
  'src/StepByStepAlgebraCore.jsx',
  'src/MultiRelationAlgebraCore.jsx',
];

// Interpolations that are math values: expressions, terms, solved values,
// equations, matrix operation labels. Names (Equation 1, x, R₁) are words.
const MATH_VALUE = /expression|Expression|\boperand|\btext\b|\.text\b|factorText|placedValues|exactNumberText|\bdisplay\(|\bvalue\b|formatStandardEquation|formatLinearEquation|result\.label|OPERATION_LABEL|solutionExpressions|[Ll]atex/;
const SPOKEN = /^\s*spoken(MathValue|MathLabel|Operation)\(/;

// Each `aria-label={…}` / `ariaLabel={…}` expression, braces balanced.
const labelExpressions = (source) => {
  const found = [];
  const pattern = /(?:aria-label|ariaLabel)=\{/g;
  let match;
  while ((match = pattern.exec(source))) {
    let depth = 1;
    let index = match.index + match[0].length;
    while (index < source.length && depth > 0) {
      if (source[index] === '{') depth += 1;
      else if (source[index] === '}') depth -= 1;
      index += 1;
    }
    found.push(source.slice(match.index + match[0].length, index - 1));
  }
  return found;
};

// The `${…}` interpolations of the template literals inside one expression.
const interpolations = (expression) => {
  const found = [];
  const pattern = /\$\{/g;
  let match;
  while ((match = pattern.exec(expression))) {
    let depth = 1;
    let index = match.index + match[0].length;
    while (index < expression.length && depth > 0) {
      if (expression[index] === '{') depth += 1;
      else if (expression[index] === '}') depth -= 1;
      index += 1;
    }
    found.push(expression.slice(match.index + match[0].length, index - 1));
  }
  return found;
};

export const rawMathInLabels = (source) => labelExpressions(executableSource(source))
  .flatMap(interpolations)
  .filter((inner) => MATH_VALUE.test(inner) && !SPOKEN.test(inner));

test('no control name in the algebra tools interpolates a math value without speaking it', () => {
  const offenders = [];
  for (const file of SCOPED_FILES) {
    for (const inner of rawMathInLabels(readFileSync(join(ROOT, file), 'utf8'))) offenders.push(`${file}: \${${inner}}`);
  }
  assert.deepEqual(offenders, [], 'pass math values through spokenMathValue (src/tools/shared/spokenMathValue.js)');
});

test('the scan sees the shapes it guards (it can fail)', () => {
  // The old substitution token, the old distribution target, and a ternary.
  assert.equal(rawMathInLabels('<b aria-label={`Pick up the expression ${expression} from the isolated equation`} />').length, 1);
  assert.equal(rawMathInLabels('<b aria-label={placed ? `Factor applied to ${term.text}` : `Apply the factor to ${term.text}`} />').length, 2);
  assert.equal(rawMathInLabels('<T ariaLabel={`Pick up solved value ${exactNumberText(v)} for ${name}`} />').length, 1);
  // Spoken values and plain names pass.
  assert.equal(rawMathInLabels('<b aria-label={`Pick up the factor ${spokenMathValue(state.factorText)}`} />').length, 0);
  assert.equal(rawMathInLabels('<b aria-label={`Isolate ${v} in ${equationName(index)}`} />').length, 0);
});
