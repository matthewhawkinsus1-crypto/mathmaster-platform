import { evaluate, parse, simplify } from 'mathjs';

const EPSILON = 1e-9;
const nearlyEqual = (left, right) => Math.abs(Number(left) - Number(right)) <= EPSILON;
const cleanNumber = (value) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return number;
  if (nearlyEqual(number, Math.round(number))) return Math.round(number);
  return Number(number.toFixed(10));
};

const nodeComplexity = (expression) => {
  try {
    return parse(String(expression)).filter(() => true).length + String(expression).length / 12;
  } catch {
    return String(expression).length;
  }
};

// Count mathematical AST nodes without letting harmless presentation changes
// (extra parentheses, spacing, implicit-multiplication formatting) masquerade as
// student work. This is deliberately separate from nodeComplexity: complexity is
// still useful for deciding whether a move made algebraic progress, while a
// manual simplification box should appear only when the mathematical structure
// itself actually shrinks.
const mathematicalNodeCount = (expression) => {
  try {
    // ParenthesisNode is presentation/grouping structure, not additional
    // mathematics. MathJS preserves explicit parentheses in the unsimplified
    // operation, so counting them made (d)/(r) look more complex than d/r and
    // incorrectly opened a manual simplification box. Count only meaningful
    // operators, symbols, constants, functions, etc.
    return parse(String(expression))
      .filter((node) => node.type !== 'ParenthesisNode')
      .length;
  } catch {
    return String(expression).replace(/[\s()]/g, '').length;
  }
};

const symbolsIn = (expression) => {
  try {
    return [...new Set(parse(String(expression)).filter((node) => node.isSymbolNode).map((node) => node.name))];
  } catch {
    return [];
  }
};

export const parseEquationInput = (question = {}) => {
  const objective = {
    kind: question.objective?.kind || question.objectiveKind || (question.targetForm === 'slopeIntercept' ? 'slopeIntercept' : 'isolate'),
    variable: String(question.objective?.variable || question.solveFor || question.variable || (question.targetForm === 'slopeIntercept' ? 'y' : 'x')),
    // `simplifyRequired` is retained as a presentation/coaching preference for
    // older authored questions. It no longer blocks completion by itself.
    // A question must explicitly opt into STRICT final-form grading with
    // `requireSimplifiedFinalForm: true`. This lets a student keep an
    // equivalent unsimplified opposite side while still demonstrating the
    // actual solving objective: isolate the requested variable.
    simplifyRequired: question.objective?.simplifyRequired ?? question.simplifyRequired ?? true,
    requireSimplifiedFinalForm: question.objective?.requireSimplifiedFinalForm ?? question.requireSimplifiedFinalForm ?? false,
    targetForm: question.objective?.targetForm || question.targetForm || null,
  };
  if (question.leftExpression && question.rightExpression) {
    return { left: String(question.leftExpression), right: String(question.rightExpression), variable: objective.variable, objective };
  }
  // `equationLatex` is read too, and it has to be. The platform's own authoring
  // catalogue lists it as a stepAlgebra field and its worked example uses it —
  // but nothing ever translated it into what this parser reads, so a question
  // authored exactly as documented reached the student as "This question could
  // not be displayed". It is converted rather than parsed as-is, because
  // `\frac{x}{2}=3` is not an expression until the LaTeX is unwrapped.
  const equation = String(question.equation || question.equationAscii || question.initialEquation || '')
    || latexToExpression(question.equationLatex);
  const parts = equation.split('=');
  if (parts.length !== 2) throw new Error('Step-by-step algebra questions require one equation with one equals sign.');
  return { left: parts[0].trim(), right: parts[1].trim(), variable: objective.variable, objective };
};

// --- Traditional multiplication notation -------------------------------------
//
// mathjs writes products with \cdot. Mathematics does not: it writes a factor
// against a parenthesis, or two symbols side by side. A student who reads
// `\left(x+1\right)\cdot5` in the workspace and `5(x+1)` everywhere else is
// being taught a notation they will have to unlearn, so every \cdot is
// rewritten here rather than being patched at each call site.
//
// The four shapes, and what each becomes:
//   A · (group)   →  A(group)          juxtaposition
//   (group) · B   →  B(group)          the scalar moves in front
//   2 · x  /  x·y →  2x  /  xy         juxtaposition
//   anything else →  A(B)              parenthesised, never a dot

const GROUP_OPEN = '\\left(';
const GROUP_CLOSE = '\\right)';

// Walk back from the `\right)` at `endIndex` to its matching `\left(`.
const matchingGroupStart = (text, endIndex) => {
  let depth = 0;
  let index = endIndex;
  while (index >= 0) {
    if (text.startsWith(GROUP_CLOSE, index)) { depth += 1; index -= 1; continue; }
    if (text.startsWith(GROUP_OPEN, index)) {
      depth -= 1;
      if (depth === 0) return index;
    }
    index -= 1;
  }
  return -1;
};

// mathjs writes a symbol it also knows as a unit -- b, h, l, A, N, T -- as
// \mathrm{b}, so a plain [a-zA-Z] test misses exactly the letters school
// formulas are made of, and `b \cdot h` fell through to the parenthesised
// fallback as b(h). A literal equation must read A = bh.
const OPERAND_SOURCE = '\\d+(?:\\.\\d+)?|\\\\mathrm\\{[A-Za-z]+\\}|[a-zA-Z]|\\\\[a-zA-Z]+';
const SIMPLE_OPERAND = new RegExp(`^(?:${OPERAND_SOURCE})$`);
const OPERAND_AT_END = new RegExp(`(${OPERAND_SOURCE})$`);
const OPERAND_AT_START = new RegExp(`^(${OPERAND_SOURCE})`);

// mathjs marks any symbol that shares a name with a unit as upright text.
// Upright is how units are set; a VARIABLE is italic, and A = bh should not be
// rendered as though A were amperes and h were hours.
const unwrapSingleLetterUnits = (latex) => String(latex).replace(/\\mathrm\{([A-Za-z])\}/g, '$1');

const cleanImplicitMultiplicationLatex = (latex) => {
  let text = unwrapSingleLetterUnits(latex);
  let guard = 40;

  while (text.includes('\\cdot') && guard > 0) {
    guard -= 1;
    const at = text.indexOf('\\cdot');
    const before = text.slice(0, at).replace(/\s+$/, '');
    const after = text.slice(at + '\\cdot'.length).replace(/^\s+/, '');

    // A · (group) — simply juxtapose.
    if (after.startsWith(GROUP_OPEN)) { text = `${before}${after}`; continue; }

    // (group) · B — the scalar belongs in front of the group.
    if (before.endsWith(GROUP_CLOSE)) {
      const groupStart = matchingGroupStart(before, before.length - GROUP_CLOSE.length);
      const operandMatch = after.match(OPERAND_AT_START);
      if (groupStart >= 0 && operandMatch) {
        const prefix = before.slice(0, groupStart);
        const group = before.slice(groupStart);
        text = `${prefix}${operandMatch[1]}${group}${after.slice(operandMatch[1].length)}`;
        continue;
      }
    }

    // Two simple operands sit side by side, unless both are numbers — `23` is
    // not two times three, so that one is parenthesised instead.
    const leftOperand = before.match(OPERAND_AT_END);
    const rightOperand = after.match(OPERAND_AT_START);
    const bothNumeric = leftOperand && rightOperand
      && /^\d/.test(leftOperand[1]) && /^\d/.test(rightOperand[1]);
    if (leftOperand && rightOperand && SIMPLE_OPERAND.test(rightOperand[1]) && !bothNumeric) {
      text = `${before}${after}`;
      continue;
    }

    // Anything else becomes a factor against a parenthesis. Never a dot.
    text = `${before}${GROUP_OPEN}${after}${GROUP_CLOSE}`;
  }

  return text;
};

export const simplifyExpression = (expression) => simplify(parse(String(expression))).toString({ parenthesis: 'auto', implicit: 'hide' });
// Student-controlled cleanup. This is intentionally narrower than MathJS's
// general simplify(): clicking Simplify may combine a one-variable linear
// expression, perform arithmetic, or honor a visible cancellation, but it does
// not unexpectedly factor/rearrange an unrelated multi-symbol expression.
const formatStudentLinearExpression = ({ coefficient, constant }, variable) => {
  const pieces = [];
  if (!nearlyEqual(coefficient, 0)) {
    if (nearlyEqual(coefficient, 1)) pieces.push(variable);
    else if (nearlyEqual(coefficient, -1)) pieces.push(`-${variable}`);
    else pieces.push(`${cleanNumber(coefficient)} * ${variable}`);
  }
  if (!nearlyEqual(constant, 0)) {
    if (!pieces.length) pieces.push(String(cleanNumber(constant)));
    else if (constant > 0) pieces.push(`+ ${cleanNumber(constant)}`);
    else pieces.push(`- ${Math.abs(cleanNumber(constant))}`);
  }
  return pieces.join(' ') || '0';
};

export const simplifyStudentExpression = (expression, variable = 'x') => {
  const original = String(expression ?? '').trim();
  if (!original) return original;
  const symbols = symbolsIn(original).filter((name) => !['e', 'pi'].includes(name));
  if (!symbols.length) {
    try { return simplifyExpression(original); } catch { return original; }
  }
  if (symbols.length === 1 && symbols[0] === variable) {
    try { return formatStudentLinearExpression(getLinearForm(original, variable), variable); } catch { /* fall through */ }
  }
  try {
    const structural = structuralCancellation(original);
    if (structural?.pairs?.length && structural.resultExpression !== original) {
      return simplifyStudentExpression(structural.resultExpression, variable);
    }
  } catch {
    // Preserve the student's expression if a safe cleanup cannot be identified.
  }
  return original;
};

export const expressionToLatex = (expression) => cleanImplicitMultiplicationLatex(parse(String(expression)).toTex({ parenthesis: 'keep', implicit: 'hide' }));
export const equationToLatex = ({ left, right }) => `${expressionToLatex(left)} = ${expressionToLatex(right)}`;

// --- Presentation-only term splitting ---------------------------------------
// Flattens the top-level +/- chain of an expression into individually
// addressable terms for the interactive term renderer. This never affects
// correctness: callers must keep reading/writing the plain expression
// strings above for grading, undo, and persistence. Any node that isn't part
// of a top-level additive chain (a product, a power, a division, ...) simply
// becomes a single opaque term rather than being decomposed further.
const flattenAdditiveChain = (node, sign, terms) => {
  if (node.type === 'OperatorNode' && node.fn === 'add' && node.args.length === 2) {
    flattenAdditiveChain(node.args[0], sign, terms);
    flattenAdditiveChain(node.args[1], sign, terms);
  } else if (node.type === 'OperatorNode' && node.fn === 'subtract' && node.args.length === 2) {
    flattenAdditiveChain(node.args[0], sign, terms);
    flattenAdditiveChain(node.args[1], -sign, terms);
  } else if (node.type === 'OperatorNode' && node.fn === 'unaryMinus' && node.args.length === 1) {
    flattenAdditiveChain(node.args[0], -sign, terms);
  } else if (node.type === 'ParenthesisNode') {
    flattenAdditiveChain(node.content, sign, terms);
  } else {
    terms.push({ node, sign });
  }
  return terms;
};

export const splitAdditiveTerms = (expression) => {
  try {
    const parts = flattenAdditiveChain(parse(String(expression)), 1, []);
    return parts.map(({ node, sign }, index) => {
      const magnitudeText = node.toString({ parenthesis: 'auto', implicit: 'hide' });
      const magnitudeLatex = cleanImplicitMultiplicationLatex(node.toTex({ parenthesis: 'keep', implicit: 'hide' }));
      const isFirst = index === 0;
      return {
        text: isFirst ? (sign < 0 ? `-${magnitudeText}` : magnitudeText) : `${sign < 0 ? '-' : '+'} ${magnitudeText}`,
        latex: isFirst ? (sign < 0 ? `-${magnitudeLatex}` : magnitudeLatex) : `${sign < 0 ? '-' : '+'} ${magnitudeLatex}`,
        sign,
      };
    });
  } catch {
    return null;
  }
};


// Multiplicative counterpart to splitAdditiveTerms. This is presentation-only
// and exists so the algebra workspace can put cancellation hit targets on the
// ACTUAL numerator/denominator factors rather than re-rendering a duplicate
// equation in a separate cancellation box. A grouped sum such as (x + 2)
// stays one factor; only top-level multiplication/division is flattened.
const flattenMultiplicativeChain = (node, inDenominator, factors) => {
  if (node?.type === 'ParenthesisNode') {
    flattenMultiplicativeChain(node.content, inDenominator, factors);
  } else if (node?.type === 'OperatorNode' && node.fn === 'multiply' && Array.isArray(node.args)) {
    node.args.forEach((arg) => flattenMultiplicativeChain(arg, inDenominator, factors));
  } else if (node?.type === 'OperatorNode' && node.fn === 'divide' && node.args?.length === 2) {
    flattenMultiplicativeChain(node.args[0], inDenominator, factors);
    flattenMultiplicativeChain(node.args[1], !inDenominator, factors);
  } else {
    factors.push({ node, denominator: inDenominator });
  }
  return factors;
};

const multiplicativeFactorDescriptor = ({ node }) => {
  const text = node.toString({ parenthesis: 'auto', implicit: 'hide' });
  let latex = cleanImplicitMultiplicationLatex(node.toTex({ parenthesis: 'keep', implicit: 'hide' }));
  if (node?.type === 'OperatorNode' && ['add', 'subtract'].includes(node.fn)) {
    latex = `\\left(${latex}\\right)`;
  }
  return { text, latex };
};

export const splitMultiplicativeFactors = (expression) => {
  try {
    const factors = flattenMultiplicativeChain(parse(String(expression)), false, []);
    const numerator = factors.filter((factor) => !factor.denominator).map(multiplicativeFactorDescriptor);
    const denominator = factors.filter((factor) => factor.denominator).map(multiplicativeFactorDescriptor);
    return { numerator, denominator };
  } catch {
    return null;
  }
};

// Cancellation is a student action, so detect it from the structure the student
// can actually see rather than from MathJS's fully simplified result. In
// particular, P*r*t + t must NOT suddenly become t(P*r + 1) merely because
// MathJS noticed a common factor. Only factors already separated by top-level
// multiplication/division are eligible to cancel.
const canonicalFactorKey = (text) => {
  try { return simplifyExpression(text); } catch { return String(text).trim(); }
};

const structuralCancellation = (expression) => {
  const factors = splitMultiplicativeFactors(expression);
  if (factors?.numerator?.length && factors?.denominator?.length) {
    const usedDenominator = new Set();
    const pairs = [];
    factors.numerator.forEach((numeratorFactor, numeratorIndex) => {
      const numeratorKey = canonicalFactorKey(numeratorFactor.text);
      const denominatorIndex = factors.denominator.findIndex((denominatorFactor, index) => (
        !usedDenominator.has(index) && canonicalFactorKey(denominatorFactor.text) === numeratorKey
      ));
      if (denominatorIndex < 0) return;
      usedDenominator.add(denominatorIndex);
      pairs.push({ numeratorIndex, denominatorIndex, key: numeratorKey });
    });

    if (pairs.length) {
      const cancelledNumerators = new Set(pairs.map((pair) => pair.numeratorIndex));
      const cancelledDenominators = new Set(pairs.map((pair) => pair.denominatorIndex));
      const remainingNumerator = factors.numerator.filter((_, index) => !cancelledNumerators.has(index));
      const remainingDenominator = factors.denominator.filter((_, index) => !cancelledDenominators.has(index));

      const multiply = (items) => {
        if (!items.length) return '1';
        if (items.length === 1) return items[0].text;
        return items.map((item) => `(${item.text})`).join(' * ');
      };
      const numeratorText = multiply(remainingNumerator);
      const denominatorText = multiply(remainingDenominator);
      const resultExpression = remainingDenominator.length
        ? `(${numeratorText}) / (${denominatorText})`
        : numeratorText;

      return {
        kind: 'multiplicative',
        pairs,
        resultExpression,
        numerator: factors.numerator,
        denominator: factors.denominator,
      };
    }
  }

  // Additive inverse pairs are also true cancellation the student can see:
  // 3x + 6 - 6 -> 3x. This is different from factoring P*r*t + t into
  // t(P*r + 1); the terms already appear as opposites before any rewrite.
  const terms = splitAdditiveTerms(expression) || [];
  const used = new Set();
  const additivePairs = [];
  for (let i = 0; i < terms.length; i += 1) {
    if (used.has(i)) continue;
    const leftMagnitude = String(terms[i].text).replace(/^[+-]\s*/, '');
    const leftKey = canonicalFactorKey(leftMagnitude);
    for (let j = i + 1; j < terms.length; j += 1) {
      if (used.has(j) || terms[i].sign === terms[j].sign) continue;
      const rightMagnitude = String(terms[j].text).replace(/^[+-]\s*/, '');
      if (canonicalFactorKey(rightMagnitude) !== leftKey) continue;
      used.add(i);
      used.add(j);
      additivePairs.push({ firstIndex: i, secondIndex: j, key: leftKey });
      break;
    }
  }

  if (additivePairs.length) {
    const remaining = terms.filter((_, index) => !used.has(index));
    let resultExpression = remaining.map((term) => term.text).join(' ').trim() || '0';
    resultExpression = resultExpression.replace(/^\+\s*/, '');
    return {
      kind: 'additive',
      pairs: additivePairs,
      resultExpression,
      terms,
      numerator: factors?.numerator || [],
      denominator: factors?.denominator || [],
    };
  }

  return {
    kind: null,
    pairs: [],
    resultExpression: String(expression),
    numerator: factors?.numerator || [],
    denominator: factors?.denominator || [],
  };
};

const containsSymbols = (expression) => symbolsIn(expression).length > 0;

const evaluateAt = (expression, variable, value) => {
  const node = parse(String(expression));
  const unexpectedSymbols = node.filter((child) => child.isSymbolNode).map((child) => child.name).filter((name) => name !== variable && name !== 'e' && name !== 'pi');
  if (unexpectedSymbols.length) throw new Error(`Unsupported symbol: ${unexpectedSymbols[0]}`);
  const numeric = Number(node.evaluate({ [variable]: value }));
  if (!Number.isFinite(numeric)) throw new Error('Expression is not finite.');
  return numeric;
};

export const getLinearForm = (expression, variable = 'x') => {
  const atZero = evaluateAt(expression, variable, 0);
  const atOne = evaluateAt(expression, variable, 1);
  const atTwo = evaluateAt(expression, variable, 2);
  const coefficient = cleanNumber(atOne - atZero);
  const constant = cleanNumber(atZero);
  if (!nearlyEqual(atTwo, coefficient * 2 + constant)) throw new Error('This equation is not linear in the selected variable.');
  return { coefficient, constant };
};

export const getEquationAnalysis = (equationState) => {
  const variable = equationState.variable || equationState.objective?.variable || 'x';
  try {
    const left = getLinearForm(equationState.left, variable);
    const right = getLinearForm(equationState.right, variable);
    const coefficientDifference = cleanNumber(left.coefficient - right.coefficient);
    const constantDifference = cleanNumber(left.constant - right.constant);
    const hasUniqueSolution = !nearlyEqual(coefficientDifference, 0);
    return { variable, left, right, coefficientDifference, constantDifference, hasUniqueSolution, solution: hasUniqueSolution ? cleanNumber(-constantDifference / coefficientDifference) : null, numericLinear: true };
  } catch {
    return { variable, numericLinear: false, symbols: [...new Set([...symbolsIn(equationState.left), ...symbolsIn(equationState.right)])] };
  }
};

const expressionIsVariable = (expression, variable) => {
  try { return simplifyExpression(expression) === variable; } catch { return false; }
};
const containsVariable = (expression, variable) => symbolsIn(expression).includes(variable);
const expressionIsSimplified = (expression) => {
  try {
    const original = parse(String(expression)).toString({ parenthesis: 'auto', implicit: 'hide' });
    return original.replace(/\s+/g, '') === simplifyExpression(expression).replace(/\s+/g, '');
  } catch {
    return false;
  }
};

export const isSolvedEquation = (equationState) => {
  const objective = equationState.objective || { kind: 'isolate', variable: equationState.variable || 'x', simplifyRequired: true };
  const variable = objective.variable || equationState.variable || 'x';
  const leftSolved = expressionIsVariable(equationState.left, variable) && !containsVariable(equationState.right, variable);
  const rightSolved = expressionIsVariable(equationState.right, variable) && !containsVariable(equationState.left, variable);
  // Isolation is the default completion criterion. Cosmetic/arithmetical
  // simplification is optional unless the author explicitly says the final
  // form itself is being assessed. This avoids trapping a student at
  // x = 21 - 6 after they have already solved for x.
  const strictSimplification = objective.requireSimplifiedFinalForm === true;
  const simplificationSatisfied = !strictSimplification || (
    leftSolved
      ? expressionIsSimplified(equationState.right)
      : rightSolved
        ? expressionIsSimplified(equationState.left)
        : false
  );
  if (objective.kind === 'slopeIntercept') {
    return leftSolved && variable === 'y' && simplificationSatisfied;
  }
  return (leftSolved || rightSolved) && simplificationSatisfied;
};

// MathLive reports LaTeX. Everything downstream of the operand field speaks
// mathjs, so the conversion happens once, here at the boundary, rather than in
// each caller — and a student who types 1/2 by hand and one who builds a
// stacked fraction reach the same expression.
const LATEX_TO_EXPRESSION = [
  [/[−–—]/g, '-'],
  [/\\left|\\right/g, ''],
  [/\\dfrac|\\tfrac/g, '\\frac'],
  [/\\cdot|\\times/g, '*'],
  [/\\div/g, '/'],
  [/\\frac\{([^{}]*)\}\{([^{}]*)\}/g, '(($1)/($2))'],
  [/\\sqrt\{([^{}]*)\}/g, 'sqrt($1)'],
  [/\\pi/g, 'pi'],
  [/\\,|\\!|\\;/g, ''],
  [/\^\{([^{}]*)\}/g, '^($1)'],
  [/_\{([^{}]*)\}/g, '_$1'],
];

export const latexToExpression = (rawValue) => {
  let text = String(rawValue ?? '').trim();
  // Repeat once so a fraction inside a fraction resolves rather than leaving
  // braces behind for the guard below to reject.
  for (let pass = 0; pass < 2; pass += 1) {
    LATEX_TO_EXPRESSION.forEach(([pattern, replacement]) => { text = text.replace(pattern, replacement); });
  }
  return text.trim();
};

export const parseOperationOperand = (rawValue) => {
  const text = latexToExpression(rawValue);
  if (!text) throw new Error('Enter a number, variable term, or expression for the operation.');
  if (/[=;\[\]{}]/.test(text)) throw new Error('Enter only the expression being applied, without an equals sign.');
  const node = parse(text);
  // Parsing validates the operand, but do not simplify/factor/reorder what the
  // student typed. The operation composer should preserve the student's
  // mathematical structure just like the main workspace does.
  const expression = node.toString({ parenthesis: 'keep', implicit: 'hide' });
  const symbols = symbolsIn(expression).filter((name) => !['e', 'pi'].includes(name));
  let numericValue = null;
  if (!symbols.length) {
    const value = Number(evaluate(expression));
    if (!Number.isFinite(value)) throw new Error('The operation value must be finite.');
    numericValue = cleanNumber(value);
  }
  return { expression, numericValue, symbols };
};
export const parseNumericOperand = (rawValue) => {
  const parsed = parseOperationOperand(rawValue);
  if (parsed.numericValue === null) throw new Error('A numeric value or fraction is required here.');
  return { value: parsed.numericValue, expression: parsed.expression };
};

const OPERATION_SYMBOLS = { add: '+', subtract: '-', multiply: '*', divide: '/' };
const OPERATION_LABELS = { add: 'Add', subtract: 'Subtract', multiply: 'Multiply by', divide: 'Divide by' };
// Addition/subtraction can be written where the student places it. "under"
// means the handwritten operation was aligned beneath that term; once the
// balanced step becomes an equation, it is inserted immediately after that
// target term. This preserves the student's chosen order instead of forcing
// every operation to the far right.
export const applyAdditiveOperationAtPlacement = (
  expression,
  operation,
  operandExpression,
  placement = null,
) => {
  if (!['add', 'subtract'].includes(operation)) return String(expression);
  const terms = splitAdditiveTerms(expression);
  if (!terms?.length || !placement || typeof placement !== 'object') {
    return `(${expression}) ${OPERATION_SYMBOLS[operation]} (${operandExpression})`;
  }

  const items = terms.map((term) => ({
    sign: term.sign < 0 ? -1 : 1,
    magnitude: String(term.text).replace(/^[+-]\s*/, ''),
  }));
  const inserted = {
    sign: operation === 'subtract' ? -1 : 1,
    magnitude: String(operandExpression),
  };
  const termIndex = Math.max(0, Math.min(items.length - 1, Number(placement.termIndex) || 0));
  const slot = placement.kind === 'before'
    ? termIndex
    : placement.kind === 'after' || placement.kind === 'under'
      ? termIndex + 1
      : items.length;
  items.splice(Math.max(0, Math.min(items.length, slot)), 0, inserted);

  return items.map((item, index) => {
    const body = `(${item.magnitude})`;
    if (index === 0) return item.sign < 0 ? `-${body}` : body;
    return `${item.sign < 0 ? '-' : '+'} ${body}`;
  }).join(' ');
};

const applyOperationToExpression = (expression, operation, operandExpression, placement = null) => (
  ['add', 'subtract'].includes(operation) && placement && typeof placement === 'object'
    ? applyAdditiveOperationAtPlacement(expression, operation, operandExpression, placement)
    : operation === 'multiply'
      ? `(${operandExpression}) * (${expression})`
      : operation === 'divide'
        ? `(${expression}) / (${operandExpression})`
        : `(${expression}) ${OPERATION_SYMBOLS[operation]} (${operandExpression})`
);

const operationSideLatex = (expression, operation, operandExpression) => {
  const expressionLatex = expressionToLatex(expression);
  const operandLatex = expressionToLatex(operandExpression);
  if (operation === 'multiply') return `${operandLatex}\\left(${expressionLatex}\\right)`;
  if (operation === 'divide') return `\\frac{${expressionLatex}}{${operandLatex}}`;
  return `${expressionLatex} ${operation === 'add' ? '+' : '-'} ${operandLatex}`;
};

const numericProductive = (analysis, operation, operand) => {
  if (!analysis.numericLinear || operand === null) return false;
  const forms = [analysis.left, analysis.right];
  if (operation === 'add' || operation === 'subtract') {
    return forms.some((form) => !nearlyEqual(form.constant, 0) && nearlyEqual(operation === 'add' ? form.constant + operand : form.constant - operand, 0));
  }
  return forms.some((form) => !nearlyEqual(form.coefficient, 0) && nearlyEqual(form.constant, 0) && nearlyEqual(operation === 'multiply' ? form.coefficient * operand : form.coefficient / operand, 1));
};

export const applyBalancedOperation = ({ equationState, operation, operand: rawOperand, placementBySide = {} }) => {
  if (!OPERATION_SYMBOLS[operation]) throw new Error('Choose a supported operation.');
  const operand = parseOperationOperand(rawOperand);
  if ((operation === 'multiply' || operation === 'divide') && operand.numericValue !== null && nearlyEqual(operand.numericValue, 0)) throw new Error('Multiplying or dividing both sides by zero is not allowed.');

  const analysisBefore = getEquationAnalysis(equationState);
  const unsimplified = {
    ...equationState,
    left: applyOperationToExpression(equationState.left, operation, operand.expression, placementBySide?.left),
    right: applyOperationToExpression(equationState.right, operation, operand.expression, placementBySide?.right),
  };
  const simplified = { ...equationState, left: simplifyExpression(unsimplified.left), right: simplifyExpression(unsimplified.right) };
  const analysisAfter = getEquationAnalysis(simplified);
  const cancellationTargets = ['left', 'right'].map((side) => {
    const structural = structuralCancellation(unsimplified[side]);
    const canCancel = structural.pairs.length > 0;

    // MathJS's simplified form is retained strictly as an INTERNAL reference
    // for equivalence, progress, and optional simplification grading. It is not
    // automatically substituted into the student's visible equation because it
    // may factor, distribute, reorder, or combine symbolic terms the student
    // never changed.
    const unsimplifiedNodeCount = mathematicalNodeCount(unsimplified[side]);
    const simplifiedNodeCount = mathematicalNodeCount(simplified[side]);
    const pureArithmetic = !containsSymbols(unsimplified[side]);
    // Routine number arithmetic can be offered as a cleanup step. Generic
    // symbolic rewrites are NOT auto-generated as "simplification" tasks:
    // MathJS may choose to factor P*r*t + t into t(P*r + 1), distribute, or
    // reorder terms. Those are different algebraic choices, not silent cleanup.
    // A strict final-form question may still request symbolic simplification.
    const strictFinalForm = equationState.objective?.requireSimplifiedFinalForm === true;
    const needsSimplification = !canCancel
      && simplifiedNodeCount < unsimplifiedNodeCount
      && (pureArithmetic || strictFinalForm);

    return {
      side,
      label: side === 'left' ? 'Left side' : 'Right side',
      latex: operationSideLatex(equationState[side], operation, operand.expression),
      unsimplifiedExpression: unsimplified[side],
      simplifiedExpression: simplified[side],
      simplifiedLatex: expressionToLatex(simplified[side]),
      canCancel,
      cancellationPairs: structural.pairs,
      cancellationResultExpression: structural.resultExpression,
      needsSimplification,
      pureArithmetic,
    };
  });
  const simplificationTargets = cancellationTargets.filter((target) => target.needsSimplification);
  const targetBefore = isSolvedEquation(equationState);
  const targetAfter = isSolvedEquation(simplified);
  // Reported so callers can tell PROGRESS (the equation got simpler) apart from
  // EFFICIENCY (the move was the helpful one). A move can be valid, make the
  // equation simpler, and still not be the move a teacher would have chosen.
  const complexityBefore = nodeComplexity(equationState.left) + nodeComplexity(equationState.right);
  const complexityAfter = nodeComplexity(simplified.left) + nodeComplexity(simplified.right);
  const productive = numericProductive(analysisBefore, operation, operand.numericValue) || targetAfter || cancellationTargets.some((target) => target.canCancel);
  const preservesSolution = operand.numericValue === 0 && ['multiply', 'divide'].includes(operation) ? false : true;

  return {
    operation,
    operationLabel: OPERATION_LABELS[operation],
    operand: operand.numericValue,
    operandExpression: operand.expression,
    operandSymbols: operand.symbols,
    assumption: operand.symbols.length && ['multiply', 'divide'].includes(operation) ? `${operand.expression} ≠ 0` : null,
    unsimplified,
    unsimplifiedLatex: {
      left: placementBySide?.left && ['add', 'subtract'].includes(operation)
        ? expressionToLatex(unsimplified.left)
        : operationSideLatex(equationState.left, operation, operand.expression),
      right: placementBySide?.right && ['add', 'subtract'].includes(operation)
        ? expressionToLatex(unsimplified.right)
        : operationSideLatex(equationState.right, operation, operand.expression),
    },
    simplified,
    productive,
    preservesSolution,
    complexityBefore,
    complexityAfter,
    solved: isSolvedEquation(simplified),
    analysisBefore,
    analysisAfter,
    cancellationTargets,
    requiredCancellationSides: cancellationTargets.filter((target) => target.canCancel).map((target) => target.side),
    simplificationTargets,
    improvedObjective: !targetBefore && targetAfter,
  };
};

/**
 * How an operation looks INSIDE the mathematical work, as opposed to on the
 * button that triggers it.
 *
 * The rail may show × and ÷ — they are action icons, and a student reaching for
 * "divide" looks for ÷. But the moment the operation enters the equation it has
 * to be written the way mathematics is written: a factor with parentheses, and
 * a horizontal bar. `3 × (x + 2)` and `15 ÷ 3` are not wrong so much as foreign;
 * no textbook, board or exam writes them that way, and a student who learns the
 * workspace's notation learns something they then have to unlearn.
 *
 * Returned as a descriptor rather than a string because a fraction is not a
 * line of text — the caller stacks it.
 */
export const describeOperationToken = (operation, operandExpression) => {
  const operand = String(operandExpression ?? '').trim() || '?';
  if (operation === 'add') return { kind: 'inline', text: `+ ${operand}`, operand };
  if (operation === 'subtract') return { kind: 'inline', text: `− ${operand}`, operand };
  // A factor sits in front of a parenthesis: 3( ), never 3 × ( ).
  if (operation === 'multiply') return { kind: 'factor', text: `${operand}(\u2009)`, operand };
  // A quotient is a bar with the divisor beneath it, never a ÷ sign.
  if (operation === 'divide') return { kind: 'fraction', text: `\u2015 / ${operand}`, operand };
  return { kind: 'inline', text: operand, operand };
};

export const describeOperation = (operation, operandExpression) => `${OPERATION_LABELS[operation] || operation} ${operandExpression} on both sides`;

export const getSuggestedMove = (equationState) => {
  const analysis = getEquationAnalysis(equationState);
  if (!analysis.numericLinear) return null;
  const variableSide = !nearlyEqual(analysis.left.coefficient, 0) ? analysis.left : analysis.right;
  if (!nearlyEqual(variableSide.constant, 0)) return variableSide.constant > 0 ? { operation: 'subtract', operand: variableSide.constant } : { operation: 'add', operand: Math.abs(variableSide.constant) };
  if (!nearlyEqual(variableSide.coefficient, 1)) return { operation: 'divide', operand: variableSide.coefficient };
  return null;
};

export const expressionsEquivalent = (leftExpression, rightExpression, variable = 'x') => {
  try {
    // MathInput may return MathLive/LaTeX (for example \\frac{d}{r}) while
    // the engine stores d/r. Normalize both before symbolic or numeric checks so
    // a visually correct fraction is not rejected merely because of syntax.
    const left = latexToExpression(leftExpression);
    const right = latexToExpression(rightExpression);
    const difference = simplifyExpression(`(${left}) - (${right})`);
    if (difference === '0') return true;
    return [-7, -2, 0, 3, 8].every((value) => nearlyEqual(evaluateAt(left, variable, value), evaluateAt(right, variable, value)));
  } catch { return false; }
};
