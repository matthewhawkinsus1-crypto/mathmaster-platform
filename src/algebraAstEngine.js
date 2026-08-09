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
    simplifyRequired: question.objective?.simplifyRequired ?? question.simplifyRequired ?? true,
    targetForm: question.objective?.targetForm || question.targetForm || null,
  };
  if (question.leftExpression && question.rightExpression) {
    return { left: String(question.leftExpression), right: String(question.rightExpression), variable: objective.variable, objective };
  }
  const equation = String(question.equation || question.equationAscii || question.initialEquation || '');
  const parts = equation.split('=');
  if (parts.length !== 2) throw new Error('Step-by-step algebra questions require one equation with one equals sign.');
  return { left: parts[0].trim(), right: parts[1].trim(), variable: objective.variable, objective };
};

const cleanImplicitMultiplicationLatex = (latex) => latex
  .replace(/([0-9}])\s*\\cdot\s*(?=[a-zA-Z\\])/g, '$1')
  .replace(/([a-zA-Z}])\s*\\cdot\s*(?=\\left\s*\()/g, '$1');

export const simplifyExpression = (expression) => simplify(parse(String(expression))).toString({ parenthesis: 'auto', implicit: 'hide' });
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
  const simplificationSatisfied = !objective.simplifyRequired || (
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

export const parseOperationOperand = (rawValue) => {
  const text = String(rawValue ?? '').trim();
  if (!text) throw new Error('Enter a number, variable term, or expression for the operation.');
  if (/[=;\[\]{}]/.test(text)) throw new Error('Enter only the expression being applied, without an equals sign.');
  const node = parse(text);
  const expression = simplify(node).toString({ parenthesis: 'auto', implicit: 'hide' });
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
const applyOperationToExpression = (expression, operation, operandExpression) => operation === 'multiply'
  ? `(${operandExpression}) * (${expression})`
  : operation === 'divide'
    ? `(${expression}) / (${operandExpression})`
    : `(${expression}) ${OPERATION_SYMBOLS[operation]} (${operandExpression})`;

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

export const applyBalancedOperation = ({ equationState, operation, operand: rawOperand }) => {
  if (!OPERATION_SYMBOLS[operation]) throw new Error('Choose a supported operation.');
  const operand = parseOperationOperand(rawOperand);
  if ((operation === 'multiply' || operation === 'divide') && operand.numericValue !== null && nearlyEqual(operand.numericValue, 0)) throw new Error('Multiplying or dividing both sides by zero is not allowed.');

  const analysisBefore = getEquationAnalysis(equationState);
  const unsimplified = {
    ...equationState,
    left: applyOperationToExpression(equationState.left, operation, operand.expression),
    right: applyOperationToExpression(equationState.right, operation, operand.expression),
  };
  const simplified = { ...equationState, left: simplifyExpression(unsimplified.left), right: simplifyExpression(unsimplified.right) };
  const analysisAfter = getEquationAnalysis(simplified);
  const cancellationTargets = ['left', 'right'].map((side) => {
    const beforeComplexity = nodeComplexity(equationState[side]);
    const afterComplexity = nodeComplexity(simplified[side]);
    const sideHasAlgebraicTerm = symbolsIn(equationState[side]).length > 0;
    // A cancellation mark is only appropriate where an inverse/identity pair actually
    // removes algebraic structure. Pure arithmetic on the opposite side must be simplified,
    // not crossed out.
    const canCancel = sideHasAlgebraicTerm && afterComplexity + 0.18 < beforeComplexity;
    return {
      side,
      label: side === 'left' ? 'Left side' : 'Right side',
      latex: operationSideLatex(equationState[side], operation, operand.expression),
      simplifiedExpression: simplified[side],
      simplifiedLatex: expressionToLatex(simplified[side]),
      canCancel,
    };
  });
  const simplificationTargets = cancellationTargets.filter((target) => !target.canCancel);
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
    unsimplifiedLatex: { left: operationSideLatex(equationState.left, operation, operand.expression), right: operationSideLatex(equationState.right, operation, operand.expression) },
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
    const difference = simplifyExpression(`(${leftExpression}) - (${rightExpression})`);
    if (difference === '0') return true;
    return [-7, -2, 0, 3, 8].every((value) => nearlyEqual(evaluateAt(leftExpression, variable, value), evaluateAt(rightExpression, variable, value)));
  } catch { return false; }
};
