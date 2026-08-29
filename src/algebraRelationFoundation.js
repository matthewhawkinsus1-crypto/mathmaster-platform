import { evaluate, parse } from 'mathjs';
import {
  applyAdditiveOperationAtPlacement,
  expressionToLatex,
  expressionsEquivalent,
  latexToExpression,
  parseOperationOperand,
  simplifyStudentExpression,
  splitAdditiveTerms,
  splitMultiplicativeFactors,
} from './algebraAstEngine.js';

const RELATION_LATEX = { '=': '=', '<': '<', '<=': '\\le', '>': '>', '>=': '\\ge' };
const REVERSED = { '=': '=', '<': '>', '<=': '>=', '>': '<', '>=': '<=' };

const canonicalExpression = (raw) => {
  const text = String(raw || '').trim();
  if (!text) throw new Error('A relation contains an empty expression.');
  return parse(text).toString({ parenthesis: 'keep', implicit: 'hide' });
};

const replaceAbsoluteBars = (raw) => {
  let text = String(raw || '');
  let guard = 0;
  while (text.includes('|') && guard < 8) {
    const first = text.indexOf('|');
    const second = text.indexOf('|', first + 1);
    if (first < 0 || second < 0) break;
    text = `${text.slice(0, first)}abs(${text.slice(first + 1, second)})${text.slice(second + 1)}`;
    guard += 1;
  }
  if (text.includes('|')) throw new Error('Absolute-value bars must occur in matching pairs.');
  return text;
};

export const normalizeRelationSource = (raw) => {
  let text = latexToExpression(raw)
    .replace(/\\left|\\right/g, '')
    .replace(/\\lvert|\\rvert/g, '|')
    .replace(/≤|\\leq?|\\le/g, '<=')
    .replace(/≥|\\geq?|\\ge/g, '>=')
    .replace(/[−–—]/g, '-');
  text = replaceAbsoluteBars(text);
  text = text.replace(/(\d|\)|[A-Za-z_])(?=abs\()/g, '$1*');
  return text.trim();
};

const splitBranches = (raw) => {
  const text = String(raw || '');
  const parts = [];
  let depth = 0;
  let start = 0;
  const push = (end) => {
    const part = text.slice(start, end).trim();
    if (part) parts.push(part);
  };
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if ('([{'.includes(ch)) depth += 1;
    else if (')]}'.includes(ch)) depth = Math.max(0, depth - 1);
    if (depth) continue;
    if (text.slice(i, i + 2) === '||') {
      push(i);
      i += 1;
      start = i + 1;
    } else if (text.slice(i, i + 4).toLowerCase() === ' or ') {
      push(i);
      i += 3;
      start = i + 1;
    }
  }
  push(text.length);
  return parts.length ? parts : [text.trim()];
};

const parseBranch = (raw) => {
  const text = String(raw || '').trim();
  const expressions = [];
  const relations = [];
  let depth = 0;
  let start = 0;
  const pushExpression = (end) => expressions.push(canonicalExpression(text.slice(start, end)));

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if ('([{'.includes(ch)) depth += 1;
    else if (')]}'.includes(ch)) depth = Math.max(0, depth - 1);
    if (depth) continue;
    const two = text.slice(i, i + 2);
    const token = ['<=', '>='].includes(two) ? two : ['=', '<', '>'].includes(ch) ? ch : null;
    if (!token) continue;
    pushExpression(i);
    relations.push(token);
    i += token.length - 1;
    start = i + 1;
  }
  pushExpression(text.length);

  if (!relations.length) throw new Error('Enter an equation or inequality with a relation symbol.');
  if (expressions.length !== relations.length + 1) throw new Error('The relation could not be parsed.');
  if (expressions.length > 3) throw new Error('This version supports two-part relations and three-part compound inequalities.');
  return { expressions, relations };
};

export const relationSourceFromQuestion = (question = {}) => {
  const direct = [
    question.equation,
    question.equationAscii,
    question.initialEquation,
    question.formula,
    question.equationLatex,
  ].find((value) => String(value ?? '').trim());

  if (direct) return String(direct).trim();

  const left = String(question.leftExpression ?? '').trim();
  const right = String(question.rightExpression ?? '').trim();
  if (left && right) {
    const relation = String(
      question.relation
      || question.comparator
      || question.inequalitySymbol
      || '=',
    ).trim() || '=';
    return `${left} ${relation} ${right}`;
  }

  const expressions = Array.isArray(question.expressions)
    ? question.expressions.map((value) => String(value ?? '').trim()).filter(Boolean)
    : [];
  const relations = Array.isArray(question.relations)
    ? question.relations.map((value) => String(value ?? '').trim()).filter(Boolean)
    : [];

  if (expressions.length >= 2 && relations.length === expressions.length - 1) {
    const pieces = [];
    expressions.forEach((expression, index) => {
      pieces.push(expression);
      if (index < relations.length) pieces.push(relations[index]);
    });
    return pieces.join(' ');
  }

  return '';
};

export const parseRelationSource = (raw, variable = 'x') => {
  const original = normalizeRelationSource(raw);
  const branches = splitBranches(original).map(parseBranch);
  return {
    kind: 'relation',
    variable: String(variable || 'x'),
    branches,
    connective: branches.length > 1 ? 'OR' : null,
    special: null,
    original,
  };
};

export const cloneRelationState = (state) => JSON.parse(JSON.stringify(state));
export const reverseRelation = (relation) => REVERSED[relation] || relation;

export const relationStateToLatex = (state) => {
  if (!state) return '';
  if (state.special === 'noSolution') return '\\varnothing';
  if (state.special === 'allReals') return '\\mathbb{R}';
  return (state.branches || []).map((branch) => {
    const parts = [];
    branch.expressions.forEach((expression, index) => {
      parts.push(expressionToLatex(expression));
      if (index < branch.relations.length) parts.push(RELATION_LATEX[branch.relations[index]] || branch.relations[index]);
    });
    return parts.join(' ');
  }).join(state.connective === 'OR' ? '\\quad\\text{OR}\\quad' : '\\quad');
};

export const relationStateToText = (state) => {
  if (!state) return '';
  if (state.special === 'noSolution') return 'No solution';
  if (state.special === 'allReals') return 'All real numbers';
  return (state.branches || []).map((branch) => {
    const parts = [];
    branch.expressions.forEach((expression, index) => {
      parts.push(expression);
      if (index < branch.relations.length) parts.push(branch.relations[index]);
    });
    return parts.join(' ');
  }).join(state.connective === 'OR' ? ' OR ' : ' ');
};


const relationComparisonHolds = (left, relation, right, tolerance = 1e-8) => {
  if (!Number.isFinite(left) || !Number.isFinite(right)) return null;
  if (relation === '=') return Math.abs(left - right) <= tolerance;
  if (relation === '<') return left < right - tolerance;
  if (relation === '<=') return left <= right + tolerance;
  if (relation === '>') return left > right + tolerance;
  if (relation === '>=') return left >= right - tolerance;
  return null;
};

const evaluateRelationBranchAt = (branch, variable, candidate) => {
  if (!branch || !Array.isArray(branch.expressions) || !Array.isArray(branch.relations)) return null;
  try {
    const scope = { [variable]: Number(candidate) };
    const values = branch.expressions.map((expression) => Number(evaluate(String(expression), scope)));
    if (values.some((value) => !Number.isFinite(value))) return null;
    const checks = branch.relations.map((relation, index) => (
      relationComparisonHolds(values[index], relation, values[index + 1])
    ));
    if (checks.some((value) => value === null)) return null;
    return checks.every(Boolean);
  } catch {
    return null;
  }
};

export const relationStateContainsAbsoluteValue = (state) => (
  /\babs\s*\(/i.test(String(state?.original || ''))
);

export const verifyRelationCandidate = (state, candidate, variable = state?.variable || 'x') => {
  const numericCandidate = Number(candidate);
  if (!state || !Number.isFinite(numericCandidate)) return null;
  if (state.special === 'noSolution') return false;
  if (state.special === 'allReals') return true;

  const branchResults = (state.branches || []).map((branch) => (
    evaluateRelationBranchAt(branch, variable, numericCandidate)
  ));
  if (!branchResults.length || branchResults.some((value) => value === null)) return null;
  return state.connective === 'OR' ? branchResults.some(Boolean) : branchResults.every(Boolean);
};

export const verifyRelationCandidates = (state, candidates = [], variable = state?.variable || 'x') => (
  (Array.isArray(candidates) ? candidates : []).map((value) => ({
    value,
    valid: verifyRelationCandidate(state, value, variable),
  }))
);

const operationExpression = (expression, operation, operand, placement = null) => {
  if (operation === 'add' || operation === 'subtract') {
    if (placement && typeof placement === 'object') {
      return applyAdditiveOperationAtPlacement(expression, operation, operand, placement);
    }
    return operation === 'add'
      ? `(${expression}) + (${operand})`
      : `(${expression}) - (${operand})`;
  }
  if (operation === 'multiply') return `(${operand}) * (${expression})`;
  if (operation === 'divide') return `(${expression}) / (${operand})`;
  throw new Error('Choose add, subtract, multiply, or divide.');
};

export const applyBalancedOperationToRelation = (
  state,
  operation,
  rawOperand,
  {
    branchIndex = 0,
    placementByExpression = {},
    requireExplicitPlacement = false,
  } = {},
) => {
  if (!state || state.special) throw new Error('This solution state cannot receive another balanced operation.');
  const operand = parseOperationOperand(rawOperand);
  if (
    (operation === 'multiply' || operation === 'divide')
    && operand.numericValue !== null
    && Math.abs(operand.numericValue) < 1e-12
  ) throw new Error('Multiplying or dividing a relation by zero is not allowed.');

  const next = cloneRelationState(state);
  const branch = next.branches[branchIndex];
  if (!branch) throw new Error('Choose a valid branch first.');

  if (requireExplicitPlacement) {
    const missing = branch.expressions
      .map((_, expressionIndex) => expressionIndex)
      .filter((expressionIndex) => {
        const placement = placementByExpression?.[expressionIndex];
        if (!placement) return true;
        if (['multiply', 'divide'].includes(operation)) {
          return placement.kind !== 'whole-operation';
        }
        return !['before', 'under', 'after', 'end'].includes(placement.kind);
      });

    if (missing.length) {
      const operationName = operation === 'divide'
        ? 'division'
        : operation === 'multiply'
          ? 'multiplication'
          : operation === 'subtract'
            ? 'subtraction'
            : 'addition';
      throw new Error(
        `Place the ${operationName} on every expression region before committing the balanced step.`,
      );
    }
  }

  branch.expressions = branch.expressions.map((expression, expressionIndex) => (
    operationExpression(
      expression,
      operation,
      operand.expression,
      placementByExpression?.[expressionIndex] || null,
    )
  ));

  const flip = (
    (operation === 'multiply' || operation === 'divide')
    && operand.numericValue !== null
    && operand.numericValue < 0
  );
  const requiresInequalityFlip = flip && branch.relations.some((relation) => relation !== '=');
  const expectedRelations = requiresInequalityFlip
    ? branch.relations.map(reverseRelation)
    : null;

  // Do NOT change the visible inequality signs for the student. A negative
  // multiply/divide creates a pending relation-symbol step in the workspace.
  // The student must choose the equivalent symbol(s) themselves.
  return {
    state: next,
    requiresInequalityFlip,
    expectedRelations,
    operand,
  };
};

const numericValue = (expression) => {
  try {
    const node = parse(String(expression));
    if (node.filter((child) => child?.isSymbolNode).length) return null;
    const value = Number(evaluate(String(expression)));
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
};

const absNode = (node) => (
  node?.isFunctionNode
  && String(node.fn?.name || node.name || '').toLowerCase() === 'abs'
  && node.args?.length === 1
);

const constantNodeValue = (node) => {
  if (!node) return null;

  if (node.isConstantNode) {
    const value = Number(node.value);
    return Number.isFinite(value) ? value : null;
  }

  // mathjs represents a leading negative sign as a unary-minus node rather
  // than as part of the ConstantNode. This matters for expressions such as
  // -1|x + 4|, which normalize to -1*abs(x + 4).
  if (node.isOperatorNode && node.fn === 'unaryMinus' && node.args?.length === 1) {
    const inner = constantNodeValue(node.args[0]);
    return inner === null ? null : -inner;
  }

  if (node.isOperatorNode && node.fn === 'unaryPlus' && node.args?.length === 1) {
    return constantNodeValue(node.args[0]);
  }

  return null;
};

export const describeAbsoluteValueExpression = (expression) => {
  try {
    const node = parse(String(expression));
    if (absNode(node)) {
      return {
        coefficient: 1,
        inner: node.args[0].toString({ parenthesis: 'keep', implicit: 'hide' }),
      };
    }
    if (node?.isOperatorNode && node.fn === 'unaryMinus' && absNode(node.args?.[0])) {
      return {
        coefficient: -1,
        inner: node.args[0].args[0].toString({ parenthesis: 'keep', implicit: 'hide' }),
      };
    }
    if (node?.isOperatorNode && node.fn === 'multiply' && node.args?.length === 2) {
      const first = constantNodeValue(node.args[0]);
      const second = constantNodeValue(node.args[1]);
      if (first !== null && absNode(node.args[1])) {
        return {
          coefficient: first,
          inner: node.args[1].args[0].toString({ parenthesis: 'keep', implicit: 'hide' }),
        };
      }
      if (second !== null && absNode(node.args[0])) {
        return {
          coefficient: second,
          inner: node.args[0].args[0].toString({ parenthesis: 'keep', implicit: 'hide' }),
        };
      }
    }
  } catch {
    return null;
  }
  return null;
};


const normalizeSimpleSignedFractionInput = (raw) => {
  const source = String(raw ?? '').trim().replace(/[−–—]/g, '-');

  // MathLive may put the negative sign beside the whole fraction, in the
  // numerator, or in the denominator. All are the same number.
  const match = source.match(
    /^([+-]?)\s*\\(?:dfrac|tfrac|frac)\{\s*([+-]?\d+(?:\.\d+)?)\s*\}\{\s*([+-]?\d+(?:\.\d+)?)\s*\}$/,
  );
  if (!match) return source;

  const outerSign = match[1] === '-' ? -1 : 1;
  const numerator = Number(match[2]);
  const denominator = Number(match[3]);
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) {
    return source;
  }

  const sign = outerSign * Math.sign(numerator || 1) * Math.sign(denominator || 1);
  return `${sign < 0 ? '-' : ''}(${Math.abs(numerator)})/(${Math.abs(denominator)})`;
};

const simpleSignedNumericFractionParts = (expression) => {
  try {
    let node = parse(String(expression));
    while (node?.isParenthesisNode) node = node.content;

    let outerSign = 1;
    if (node?.isOperatorNode && node.fn === 'unaryMinus' && node.args?.length === 1) {
      outerSign = -1;
      node = node.args[0];
      while (node?.isParenthesisNode) node = node.content;
    }

    if (!(node?.isOperatorNode && node.fn === 'divide' && node.args?.length === 2)) return null;

    const signedNumeric = (rawNode) => {
      let child = rawNode;
      while (child?.isParenthesisNode) child = child.content;
      let sign = 1;
      if (child?.isOperatorNode && child.fn === 'unaryMinus' && child.args?.length === 1) {
        sign = -1;
        child = child.args[0];
      }
      if (!child?.isConstantNode) return null;
      const value = Number(child.value);
      return Number.isFinite(value) ? { sign, magnitude: Math.abs(value) } : null;
    };

    const numerator = signedNumeric(node.args[0]);
    const denominator = signedNumeric(node.args[1]);
    if (!numerator || !denominator || denominator.magnitude === 0) return null;

    return {
      negative: outerSign * numerator.sign * denominator.sign < 0,
      numerator: numerator.magnitude,
      denominator: denominator.magnitude,
    };
  } catch {
    return null;
  }
};

const unwrapParenthesisNode = (input) => {
  let node = input;
  while (node?.isParenthesisNode) node = node.content;
  return node;
};

export const relationExpressionToLatex = (expression) => {
  const fraction = simpleSignedNumericFractionParts(expression);
  if (fraction) {
    return `${fraction.negative ? '-' : ''}\\frac{${fraction.numerator}}{${fraction.denominator}}`;
  }

  // IMPORTANT: for a top-level quotient, keep the parsed mathjs tree intact
  // and let mathjs render that tree directly to TeX. The previous renderer
  // converted the numerator node back to a string with implicit
  // multiplication hidden, then reparsed that string. A numerator such as
  // -2 * (4*x - 1) could become text like "-2 (4 x - 1)", which the
  // secondary renderer did not reliably understand and could display as an
  // empty numerator. That is why the middle of a three-part inequality
  // appeared to disappear after division.
  try {
    let node = unwrapParenthesisNode(parse(String(expression)));
    let sign = '';

    if (node?.isOperatorNode && node.fn === 'unaryMinus' && node.args?.length === 1) {
      sign = '-';
      node = unwrapParenthesisNode(node.args[0]);
    }

    if (node?.isOperatorNode && node.fn === 'divide' && node.args?.length === 2) {
      const numerator = unwrapParenthesisNode(node.args[0]);
      const denominator = unwrapParenthesisNode(node.args[1]);

      const numeratorLatex = numerator.toTex({
        parenthesis: 'keep',
        implicit: 'show',
      });
      const denominatorLatex = denominator.toTex({
        parenthesis: 'keep',
        implicit: 'show',
      });

      return `${sign}\\frac{${numeratorLatex}}{${denominatorLatex}}`;
    }
  } catch {
    // Fall back to the established display engine below.
  }

  return expressionToLatex(expression);
};

export const normalizeRelationExpressionInput = (raw) => {
  const normalized = normalizeRelationSource(normalizeSimpleSignedFractionInput(raw));
  if (!normalized) throw new Error('Enter an expression first.');
  if (/(?:<=|>=|=|<|>)/.test(normalized)) {
    throw new Error('Enter only one expression here, without a relation symbol.');
  }
  return canonicalExpression(normalized);
};

export const relationExpressionsEquivalent = (left, right, variable = 'x') => {
  try {
    return expressionsEquivalent(
      normalizeRelationExpressionInput(left),
      normalizeRelationExpressionInput(right),
      variable,
    );
  } catch {
    return false;
  }
};

export const relationContainsInvisibleNegativeAbsolute = (state) => (
  (state?.branches || []).some((branch) => (
    branch.expressions.some((expression) => describeAbsoluteValueExpression(expression)?.coefficient === -1)
  ))
);

const orientAbsoluteBranch = (branch) => {
  if (!branch || branch.expressions.length !== 2 || branch.relations.length !== 1) return null;
  const leftAbs = describeAbsoluteValueExpression(branch.expressions[0]);
  const rightAbs = describeAbsoluteValueExpression(branch.expressions[1]);

  if (leftAbs && !rightAbs) {
    return { abs: leftAbs, bound: branch.expressions[1], relation: branch.relations[0] };
  }
  if (rightAbs && !leftAbs) {
    return { abs: rightAbs, bound: branch.expressions[0], relation: reverseRelation(branch.relations[0]) };
  }
  return null;
};

const negativeBound = (bound) => `-(${bound})`;

export const buildAbsoluteValueSplit = (state, branchIndex = 0, requestedStructure = null) => {
  const oriented = orientAbsoluteBranch(state?.branches?.[branchIndex]);
  if (!oriented) return { ready: false, reason: 'An isolated absolute-value expression is required.' };

  const { abs, bound, relation } = oriented;
  if (Math.abs(abs.coefficient - 1) > 1e-12) {
    return {
      ready: false,
      reason: abs.coefficient === -1
        ? 'The absolute-value bars have an invisible negative one in front. Remove that coefficient first.'
        : 'Isolate the absolute-value expression before reversing the bars.',
    };
  }

  const expectedStructure = relation === '=' || relation === '>' || relation === '>='
    ? 'or'
    : 'and';

  if (!requestedStructure) {
    return {
      ready: false,
      needsStructureChoice: true,
      reason: 'Choose the solution structure before reversing the absolute-value bars.',
    };
  }

  if (requestedStructure !== expectedStructure) {
    return {
      ready: false,
      needsStructureChoice: true,
      reason: 'That OR/AND structure is not equivalent to the current absolute-value relation.',
    };
  }

  const boundNumber = numericValue(bound);
  if (boundNumber !== null) {
    if ((relation === '=' && boundNumber < 0)
      || (relation === '<' && boundNumber <= 0)
      || (relation === '<=' && boundNumber < 0)) {
      return {
        ready: true,
        state: { ...cloneRelationState(state), branches: [], connective: null, special: 'noSolution' },
      };
    }
    if ((relation === '>' && boundNumber < 0)
      || (relation === '>=' && boundNumber <= 0)) {
      return {
        ready: true,
        state: { ...cloneRelationState(state), branches: [], connective: null, special: 'allReals' },
      };
    }
  }

  const base = cloneRelationState(state);
  const inner = abs.inner;

  if (relation === '=') {
    return {
      ready: true,
      state: {
        ...base,
        branches: [
          { expressions: [inner, bound], relations: ['='] },
          { expressions: [inner, negativeBound(bound)], relations: ['='] },
        ],
        connective: 'OR',
        special: null,
      },
    };
  }

  if (relation === '<' || relation === '<=') {
    return {
      ready: true,
      state: {
        ...base,
        branches: [{
          expressions: [negativeBound(bound), inner, bound],
          relations: [relation, relation],
        }],
        connective: null,
        special: null,
      },
    };
  }

  if (relation === '>' || relation === '>=') {
    return {
      ready: true,
      state: {
        ...base,
        branches: [
          {
            expressions: [inner, negativeBound(bound)],
            relations: [relation === '>' ? '<' : '<='],
          },
          { expressions: [inner, bound], relations: [relation] },
        ],
        connective: 'OR',
        special: null,
      },
    };
  }

  return { ready: false, reason: 'That relation cannot be reversed from absolute value yet.' };
};

const squareBase = (expression) => {
  try {
    const node = parse(String(expression));
    if (node?.isOperatorNode && node.fn === 'pow' && node.args?.length === 2) {
      if (constantNodeValue(node.args[1]) === 2) {
        return node.args[0].toString({ parenthesis: 'keep', implicit: 'hide' });
      }
    }
  } catch {
    return null;
  }
  return null;
};

export const takeSquareRootOfRelation = (state, branchIndex = 0) => {
  if (!state || state.special) return { ready: false, reason: 'There is no active relation to square-root.' };
  const branch = state.branches?.[branchIndex];
  if (
    !branch
    || branch.expressions.length !== 2
    || branch.relations.length !== 1
    || branch.relations[0] !== '='
  ) return { ready: false, reason: 'Square root currently applies to one two-sided equation branch at a time.' };

  const leftBase = squareBase(branch.expressions[0]);
  const rightBase = squareBase(branch.expressions[1]);
  const leftNumber = numericValue(branch.expressions[0]);
  const rightNumber = numericValue(branch.expressions[1]);

  const safe = Boolean(
    (leftBase && (rightBase || (rightNumber !== null && rightNumber >= 0)))
    || (rightBase && (leftBase || (leftNumber !== null && leftNumber >= 0))),
  );
  if (!safe) {
    return {
      ready: false,
      reason: 'MathMaster will not apply square roots here because it cannot prove this step preserves the real solution set.',
    };
  }

  const transform = (expression, base) => (base ? `abs(${base})` : `sqrt(${expression})`);
  const next = cloneRelationState(state);
  next.branches[branchIndex] = {
    expressions: [
      transform(branch.expressions[0], leftBase),
      transform(branch.expressions[1], rightBase),
    ],
    relations: ['='],
  };
  return { ready: true, state: next };
};

const isVariableExpression = (expression, variable) => {
  try {
    const node = parse(String(expression));
    return node?.isSymbolNode && node.name === variable;
  } catch {
    return false;
  }
};

const expressionContainsVariable = (expression, variable) => {
  try {
    const node = parse(String(expression));
    return node
      .filter((child) => child?.isSymbolNode && child.name === variable)
      .length > 0;
  } catch {
    // If MathMaster cannot read the expression, do not call the branch solved.
    return true;
  }
};

const isolatedEquationValue = (branch, variable) => {
  if (
    !branch
    || branch.expressions.length !== 2
    || branch.relations.length !== 1
    || branch.relations[0] !== '='
  ) return null;

  const [left, right] = branch.expressions;
  const leftVar = isVariableExpression(left, variable);
  const rightVar = isVariableExpression(right, variable);

  // Exactly one side must be the isolated target variable.
  if (leftVar === rightVar) return null;

  const expression = leftVar ? right : left;
  if (expressionContainsVariable(expression, variable)) return null;

  return {
    expression: String(expression).trim(),
    variableOn: leftVar ? 'left' : 'right',
  };
};


const relationAsVariable = (branch, variable) => {
  if (!branch || branch.expressions.length !== 2 || branch.relations.length !== 1) return null;
  const [left, right] = branch.expressions;
  const relation = branch.relations[0];

  if (isVariableExpression(left, variable)) {
    const bound = numericValue(right);
    return bound === null ? null : { relation, bound };
  }
  if (isVariableExpression(right, variable)) {
    const bound = numericValue(left);
    return bound === null ? null : { relation: reverseRelation(relation), bound };
  }
  return null;
};

const intervalForVariableRelation = ({ relation, bound }) => {
  if (relation === '<') return { min: Number.NEGATIVE_INFINITY, max: bound, minClosed: false, maxClosed: false };
  if (relation === '<=') return { min: Number.NEGATIVE_INFINITY, max: bound, minClosed: false, maxClosed: true };
  if (relation === '>') return { min: bound, max: Number.POSITIVE_INFINITY, minClosed: false, maxClosed: false };
  if (relation === '>=') return { min: bound, max: Number.POSITIVE_INFINITY, minClosed: true, maxClosed: false };
  return null;
};

const chainInterval = (branch, variable) => {
  if (!branch || branch.expressions.length !== 3 || branch.relations.length !== 2) return null;
  if (!isVariableExpression(branch.expressions[1], variable)) return null;

  const leftBound = numericValue(branch.expressions[0]);
  const rightBound = numericValue(branch.expressions[2]);
  if (leftBound === null || rightBound === null) return null;

  const [leftRelation, rightRelation] = branch.relations;

  // Increasing chain: -4/3 <= x < 13/8.
  if (['<', '<='].includes(leftRelation) && ['<', '<='].includes(rightRelation)) {
    if (leftBound > rightBound) return null;
    return {
      min: leftBound,
      max: rightBound,
      minClosed: leftRelation === '<=',
      maxClosed: rightRelation === '<=',
    };
  }

  // Decreasing chain: 14/3 >= x >= -4/3.
  // Keep the student's visible orientation. Normalize only the solution interval.
  if (['>', '>='].includes(leftRelation) && ['>', '>='].includes(rightRelation)) {
    if (rightBound > leftBound) return null;
    return {
      min: rightBound,
      max: leftBound,
      minClosed: rightRelation === '>=',
      maxClosed: leftRelation === '>=',
    };
  }

  return null;
};

export const relationSolutionSummary = (state) => {
  if (!state) return { solved: false };
  if (state.special === 'noSolution') return { solved: true, kind: 'special', special: 'noSolution' };
  if (state.special === 'allReals') return { solved: true, kind: 'special', special: 'allReals' };

  const variable = state.variable || 'x';
  const isolatedValues = [];
  let equationsOnly = true;

  for (const branch of state.branches || []) {
    const isolated = isolatedEquationValue(branch, variable);
    if (!isolated) {
      equationsOnly = false;
      break;
    }
    isolatedValues.push(isolated.expression);
  }

  if (equationsOnly && isolatedValues.length) {
    // Preserve the established numeric result shape for ordinary solutions
    // such as x = 5 OR x = -2.
    const numericValues = isolatedValues.map((expression) => numericValue(expression));
    if (numericValues.every((value) => value !== null)) {
      return {
        solved: true,
        kind: 'values',
        values: [...new Set(numericValues)].sort((a, b) => a - b),
      };
    }

    // Exact/symbolic solutions are already finished algebra. Do not require
    // a student to rationalize, decimalize, simplify radicals, or rewrite a
    // literal formula merely to make the completion detector happy.
    const exactValues = [...new Set(isolatedValues)];

    return {
      solved: true,
      kind: 'exactValues',
      exactValues,
      branchCount: exactValues.length,
    };
  }

  const intervals = [];
  for (const branch of state.branches || []) {
    const chain = chainInterval(branch, variable);
    if (chain) {
      intervals.push(chain);
      continue;
    }
    const relation = relationAsVariable(branch, variable);
    const interval = relation ? intervalForVariableRelation(relation) : null;
    if (!interval) return { solved: false };
    intervals.push(interval);
  }
  return intervals.length ? { solved: true, kind: 'intervals', intervals } : { solved: false };
};

export const obviousSpecialClaim = (state) => {
  if (state?.special) return state.special;
  if (!state || state.branches?.length !== 1) return null;
  const oriented = orientAbsoluteBranch(state.branches[0]);
  if (!oriented || Math.abs(oriented.abs.coefficient - 1) > 1e-12) return null;
  const value = numericValue(oriented.bound);
  if (value === null) return null;

  if ((oriented.relation === '=' && value < 0)
    || (oriented.relation === '<' && value <= 0)
    || (oriented.relation === '<=' && value < 0)) return 'noSolution';

  if ((oriented.relation === '>' && value < 0)
    || (oriented.relation === '>=' && value <= 0)) return 'allReals';

  return null;
};


const additiveMagnitude = (term) => String(term?.text ?? '').replace(/^[+-]\s*/, '');

const joinAdditiveTermsAfterCancellation = (terms, removedIndices) => {
  const removed = new Set(removedIndices || []);
  const remaining = (terms || []).filter((_, index) => !removed.has(index));
  let result = remaining.map((term) => term.text).join(' ').trim() || '0';
  result = result.replace(/^\+\s*/, '');
  return result;
};

const multiplyFactorTexts = (items) => {
  if (!items?.length) return '1';
  if (items.length === 1) return items[0].text;
  return items.map((item) => `(${item.text})`).join(' * ');
};

const stripUnaryNegative = (expression) => {
  try {
    let node = parse(String(expression));
    while (node?.isParenthesisNode) node = node.content;
    if (node?.isOperatorNode && node.fn === 'unaryMinus' && node.args?.length === 1) {
      return node.args[0].toString({ parenthesis: 'keep', implicit: 'hide' });
    }
  } catch {
    return null;
  }
  return null;
};

export const relationCancellationCandidates = (expression, variable = 'x') => {
  const terms = splitAdditiveTerms(expression);
  if (terms?.length > 1) {
    const pairs = [];
    for (let first = 0; first < terms.length; first += 1) {
      for (let second = first + 1; second < terms.length; second += 1) {
        if (terms[first].sign === terms[second].sign) continue;
        try {
          if (expressionsEquivalent(
            additiveMagnitude(terms[first]),
            additiveMagnitude(terms[second]),
            variable,
          )) {
            pairs.push({ firstIndex: first, secondIndex: second });
          }
        } catch {
          // Keep looking.
        }
      }
    }
    if (pairs.length) {
      return {
        kind: 'additive',
        terms,
        tokenCount: terms.length,
        pairs,
      };
    }
  }

  const factors = splitMultiplicativeFactors(expression);
  if (factors?.denominator?.length) {
    const numerator = factors.numerator || [];
    const denominator = factors.denominator || [];
    const pairs = [];

    numerator.forEach((numeratorFactor, numeratorIndex) => {
      denominator.forEach((denominatorFactor, denominatorIndex) => {
        try {
          if (expressionsEquivalent(numeratorFactor.text, denominatorFactor.text, variable)) {
            pairs.push({
              firstIndex: numeratorIndex,
              secondIndex: numerator.length + denominatorIndex,
              mode: 'factor',
            });
            return;
          }

          // A visible leading minus sign may cancel with a visible denominator
          // factor of -1: -|3x-7| / -1 -> |3x-7|. Treat the signs as the
          // cancellable structure instead of demanding identical whole factors.
          const positiveNumerator = stripUnaryNegative(numeratorFactor.text);
          if (positiveNumerator && numericValue(denominatorFactor.text) === -1) {
            pairs.push({
              firstIndex: numeratorIndex,
              secondIndex: numerator.length + denominatorIndex,
              mode: 'sign',
              numeratorIndex,
              denominatorIndex,
              positiveNumerator,
            });
          }
        } catch {
          // Keep looking.
        }
      });
    });

    if (pairs.length) {
      return {
        kind: 'fraction',
        numerator,
        denominator,
        tokenCount: numerator.length + denominator.length,
        pairs,
      };
    }
  }

  return null;
};

export const cancelRelationExpressionPair = (
  expression,
  firstIndex,
  secondIndex,
  variable = 'x',
) => {
  const model = relationCancellationCandidates(expression, variable);
  if (!model) {
    return { accepted: false, reason: 'Those visible terms or factors do not form a cancellable pair.' };
  }

  const first = Number(firstIndex);
  const second = Number(secondIndex);
  const pair = model.pairs.find((candidate) => (
    (candidate.firstIndex === first && candidate.secondIndex === second)
    || (candidate.firstIndex === second && candidate.secondIndex === first)
  ));

  if (!pair) {
    return { accepted: false, reason: 'Those two items do not cancel each other.' };
  }

  if (model.kind === 'additive') {
    return {
      accepted: true,
      kind: 'additive',
      resultExpression: joinAdditiveTermsAfterCancellation(
        model.terms,
        [pair.firstIndex, pair.secondIndex],
      ),
      pair,
    };
  }

  if (model.kind === 'fraction' && pair.mode === 'sign') {
    const remainingNumerator = model.numerator.map((factor, index) => (
      index === pair.numeratorIndex
        ? { ...factor, text: pair.positiveNumerator }
        : factor
    ));
    const remainingDenominator = model.denominator.filter((_, index) => index !== pair.denominatorIndex);
    const numeratorText = multiplyFactorTexts(remainingNumerator);
    const resultExpression = remainingDenominator.length
      ? `(${numeratorText}) / (${multiplyFactorTexts(remainingDenominator)})`
      : numeratorText;

    return {
      accepted: true,
      kind: 'fraction-sign',
      resultExpression,
      pair,
    };
  }

  const numeratorCount = model.numerator.length;
  const numeratorRemoved = new Set();
  const denominatorRemoved = new Set();

  [pair.firstIndex, pair.secondIndex].forEach((index) => {
    if (index < numeratorCount) numeratorRemoved.add(index);
    else denominatorRemoved.add(index - numeratorCount);
  });

  const remainingNumerator = model.numerator.filter((_, index) => !numeratorRemoved.has(index));
  const remainingDenominator = model.denominator.filter((_, index) => !denominatorRemoved.has(index));

  const numeratorText = multiplyFactorTexts(remainingNumerator);
  const resultExpression = remainingDenominator.length
    ? `(${numeratorText}) / (${multiplyFactorTexts(remainingDenominator)})`
    : numeratorText;

  return {
    accepted: true,
    kind: 'fraction',
    resultExpression,
    pair,
  };
};

const nearlyInteger = (value) => Math.abs(value - Math.round(value)) < 1e-7;

export const resolveRelationNumberLineConfig = (intervals = [], question = {}) => {
  const explicitStep = Number(question.numberLineStep);
  const finiteEndpoints = (intervals || [])
    .flatMap((interval) => [interval.min, interval.max])
    .map(Number)
    .filter(Number.isFinite);

  const candidates = [1, 0.5, 0.25, 0.2, 0.125, 0.1, 0.05, 0.025, 0.02, 0.01];
  const step = Number.isFinite(explicitStep) && explicitStep > 0
    ? explicitStep
    : (candidates.find((candidate) => (
      finiteEndpoints.every((value) => nearlyInteger(value / candidate))
    )) || 0.01);

  const explicitMin = Number(question.numberLineMin);
  const explicitMax = Number(question.numberLineMax);
  if (Number.isFinite(explicitMin) && Number.isFinite(explicitMax) && explicitMax > explicitMin) {
    return { min: explicitMin, max: explicitMax, step };
  }

  if (!finiteEndpoints.length) return { min: -10, max: 10, step };

  const low = Math.min(...finiteEndpoints);
  const high = Math.max(...finiteEndpoints);
  const span = Math.max(0, high - low);
  const padding = span > 0
    ? Math.max(step * 4, Math.min(2, span * 0.35))
    : Math.max(step * 4, 3);

  let min = Math.floor((low - padding) / step) * step;
  let max = Math.ceil((high + padding) / step) * step;

  // Keep the existing number-line component below its 60-tick safety cap while
  // preserving every required endpoint as a reachable snap location.
  if ((max - min) / step > 60) {
    min = Math.floor((low - step * 2) / step) * step;
    max = Math.ceil((high + step * 2) / step) * step;
  }

  return {
    min: Number(min.toFixed(6)),
    max: Number(max.toFixed(6)),
    step: Number(step.toFixed(6)),
  };
};

export const simplifyRelationExpression = (expression, variable = 'x') => (
  simplifyStudentExpression(expression, variable)
);


export const needsMultiRelationWorkspace = (question = {}) => {
  if (question.relationWorkspace === true || question.workspaceMode === 'relations') return true;
  if (question.relationWorkspace === false) return false;
  const source = relationSourceFromQuestion(question);
  return /(?:<=|>=|≤|≥|<|>|\||\babs\s*\(|\^\s*\{?2\}?)/i.test(source);
};

export const OTHER_ALGEBRA_OPERATIONS = Object.freeze([
  { id: 'squareRoot', label: 'Take square root' },
  { id: 'reverseAbsolute', label: 'Reverse absolute value' },
  { id: 'completeSquare', label: 'Complete the square' },
  { id: 'noSolution', label: 'No solution' },
  { id: 'allReals', label: 'All real numbers' },
]);
