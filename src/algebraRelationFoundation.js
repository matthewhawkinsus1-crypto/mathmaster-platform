import { evaluate, parse } from 'mathjs';
import {
  expressionToLatex,
  latexToExpression,
  parseOperationOperand,
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

const operationExpression = (expression, operation, operand) => {
  if (operation === 'add') return `(${expression}) + (${operand})`;
  if (operation === 'subtract') return `(${expression}) - (${operand})`;
  if (operation === 'multiply') return `(${expression}) * (${operand})`;
  if (operation === 'divide') return `(${expression}) / (${operand})`;
  throw new Error('Choose add, subtract, multiply, or divide.');
};

export const applyBalancedOperationToRelation = (
  state,
  operation,
  rawOperand,
  { branchIndex = 0 } = {},
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

  branch.expressions = branch.expressions.map((expression) => (
    operationExpression(expression, operation, operand.expression)
  ));

  const flip = (
    (operation === 'multiply' || operation === 'divide')
    && operand.numericValue !== null
    && operand.numericValue < 0
  );
  if (flip) branch.relations = branch.relations.map(reverseRelation);

  return {
    state: next,
    flippedInequality: flip && branch.relations.some((relation) => relation !== '='),
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

export const buildAbsoluteValueSplit = (state, branchIndex = 0) => {
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
  const low = numericValue(branch.expressions[0]);
  const high = numericValue(branch.expressions[2]);
  if (low === null || high === null) return null;
  if (!['<', '<='].includes(branch.relations[0]) || !['<', '<='].includes(branch.relations[1])) return null;
  return {
    min: low,
    max: high,
    minClosed: branch.relations[0] === '<=',
    maxClosed: branch.relations[1] === '<=',
  };
};

export const relationSolutionSummary = (state) => {
  if (!state) return { solved: false };
  if (state.special === 'noSolution') return { solved: true, kind: 'special', special: 'noSolution' };
  if (state.special === 'allReals') return { solved: true, kind: 'special', special: 'allReals' };

  const variable = state.variable || 'x';
  const values = [];
  let equationsOnly = true;

  for (const branch of state.branches || []) {
    if (branch.expressions.length !== 2 || branch.relations.length !== 1 || branch.relations[0] !== '=') {
      equationsOnly = false;
      break;
    }
    const leftVar = isVariableExpression(branch.expressions[0], variable);
    const rightVar = isVariableExpression(branch.expressions[1], variable);
    let value = null;
    if (leftVar) value = numericValue(branch.expressions[1]);
    else if (rightVar) value = numericValue(branch.expressions[0]);
    if (value === null) {
      equationsOnly = false;
      break;
    }
    values.push(value);
  }

  if (equationsOnly && values.length) {
    return { solved: true, kind: 'values', values: [...new Set(values)].sort((a, b) => a - b) };
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

export const needsMultiRelationWorkspace = (question = {}) => {
  if (question.relationWorkspace === true || question.workspaceMode === 'relations') return true;
  if (question.relationWorkspace === false) return false;
  const source = String(question.equation || question.formula || '');
  return /(?:<=|>=|≤|≥|<|>|\||\babs\s*\(|\^\s*\{?2\}?)/i.test(source);
};

export const OTHER_ALGEBRA_OPERATIONS = Object.freeze([
  { id: 'squareRoot', label: 'Take square root' },
  { id: 'reverseAbsolute', label: 'Reverse absolute value' },
  { id: 'completeSquare', label: 'Complete the square' },
  { id: 'noSolution', label: 'No solution' },
  { id: 'allReals', label: 'All real numbers' },
]);
