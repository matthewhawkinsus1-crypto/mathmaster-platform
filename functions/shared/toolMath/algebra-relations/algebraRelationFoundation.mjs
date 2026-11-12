/*
 * THE RELATION WORKSPACE'S MATHEMATICS (inequalities, compound inequalities,
 * absolute value, square-root relations).
 *
 * Moved here unchanged from src/algebraRelationFoundation.js (which re-exports
 * it) so the server grades a relation solve with the same parser, solution
 * summary and candidate check MultiRelationAlgebraCore uses
 * (../../serverGrading/stepAlgebraWorkspaceGrading.mjs).
 *
 * Pure: the hardened mathjs instance (../../algebra/safeMath.mjs) and the
 * shared algebra engine only.
 */
import { evaluate, parse } from '../../algebra/safeMath.mjs';
import {
  applyAdditiveOperationAtPlacement,
  expressionToLatex,
  expressionsEquivalent,
  latexToExpression,
  parseOperationOperand,
  simplifyStudentExpression,
  splitAdditiveTerms,
  splitMultiplicativeFactors,
} from '../../algebra/algebraAstEngine.mjs';
import { exactRationalFromExpression } from '../../algebra/algebraExactRational.mjs';
import { needsMultiRelationWorkspace, relationSourceFromQuestion } from '../../serverGrading/stepAlgebraRouting.mjs';
import { parseRadicalEquation, solveRadicalShape } from './radicalEquationShape.mjs';

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

// Pure text tests, moved to the light routing module so the grading manifest
// can route a question without loading mathjs; still exported from here.
export { needsMultiRelationWorkspace, relationSourceFromQuestion };

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

const RESTORABLE_RELATIONS = new Set(['=', '<', '<=', '>', '>=']);

/**
 * A saved relation state, or null when it cannot safely be drawn.
 *
 * Drafts come back from localStorage and from another device's Firestore
 * copy; either can be truncated, from an older shape, or simply wrong. Handing
 * a malformed state to the workspace crashed the whole question ("This
 * question could not be displayed"), losing the student's way back in. Only
 * a structurally sound state is restored — otherwise the caller starts from the
 * question itself, which is always a valid place to resume from.
 */
export const restorableRelationState = (state) => {
  if (!state || typeof state !== 'object' || Array.isArray(state)) return null;
  if (state.special === 'noSolution' || state.special === 'allReals') {
    return typeof state.variable === 'string' || state.variable == null ? state : null;
  }
  if (state.special != null) return null;
  if (!Array.isArray(state.branches) || !state.branches.length) return null;
  if (state.connective != null && !['OR', 'AND'].includes(state.connective)) return null;
  if (state.variable != null && typeof state.variable !== 'string') return null;
  const branchesSound = state.branches.every((branch) => (
    branch && typeof branch === 'object'
    && Array.isArray(branch.expressions) && branch.expressions.length >= 2
    && Array.isArray(branch.relations) && branch.relations.length === branch.expressions.length - 1
    && branch.relations.every((relation) => RESTORABLE_RELATIONS.has(relation))
    && branch.expressions.every((expression) => {
      if (typeof expression !== 'string' || !expression.trim()) return false;
      try {
        parse(expression);
        return true;
      } catch {
        return false;
      }
    })
  ));
  return branchesSound ? state : null;
};
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

const relationFramesMatch = (previousState, nextState) => (
  Boolean(previousState && nextState)
  && previousState.special === nextState.special
  && previousState.connective === nextState.connective
  && (previousState.branches?.length || 0) === (nextState.branches?.length || 0)
  && (previousState.variable || 'x') === (nextState.variable || 'x')
);

const branchExpressionsEquivalent = (previousBranch, nextBranch, variable) => {
  if (!previousBranch || !nextBranch) return false;
  if (previousBranch.expressions?.length !== nextBranch.expressions?.length) return false;
  if (previousBranch.relations?.length !== nextBranch.relations?.length) return false;
  if (!previousBranch.relations.every((relation, index) => relation === nextBranch.relations[index])) return false;
  return previousBranch.expressions.every((expression, index) => (
    expressionsEquivalent(expression, nextBranch.expressions[index], variable)
  ));
};

const independentOperationExpression = (expression, operation, operandExpression) => {
  if (operation === 'add') return `(${expression}) + (${operandExpression})`;
  if (operation === 'subtract') return `(${expression}) - (${operandExpression})`;
  if (operation === 'multiply') return `(${operandExpression}) * (${expression})`;
  if (operation === 'divide') return `(${expression}) / (${operandExpression})`;
  return null;
};

// An inequality may be multiplied or divided only by a quantity whose sign is
// known: a positive number keeps the symbol, a negative number reverses it.
// `x < 4` multiplied by `x` has no single correct symbol — it depends on the
// sign of x (and x = 0 collapses it) — so the step is not a valid balanced
// move at all, however the student sets the symbol.
const scalesInequalityByUnknownSign = (relations, operation, numericValue) => (
  ['multiply', 'divide'].includes(operation)
  && numericValue === null
  && (relations || []).some((relation) => relation !== '=')
);

export const UNKNOWN_SIGN_INEQUALITY_MESSAGE = 'Multiply or divide an inequality only by a number. '
  + 'The sign of an expression with a variable is unknown, so the inequality symbol cannot be decided.';

const expectedRelationsAfterOperation = (relations, operation, numericValue) => {
  const shouldReverse = ['multiply', 'divide'].includes(operation)
    && numericValue !== null
    && numericValue < 0;
  return shouldReverse
    ? relations.map((relation) => (relation === '=' ? '=' : reverseRelation(relation)))
    : [...relations];
};

const validateEquivalentRewrite = (previousState, nextState) => {
  if (!relationFramesMatch(previousState, nextState)) return false;
  const variable = previousState.variable || 'x';
  return previousState.branches.every((branch, branchIndex) => (
    branchExpressionsEquivalent(branch, nextState.branches[branchIndex], variable)
  ));
};

const validateBalancedOperation = (
  previousState,
  nextState,
  { operation, operandExpression, branchIndices = [0] } = {},
) => {
  if (!relationFramesMatch(previousState, nextState)) return false;
  if (!['add', 'subtract', 'multiply', 'divide'].includes(operation)) return false;

  let operand;
  try {
    operand = parseOperationOperand(operandExpression);
  } catch {
    return false;
  }

  const variable = previousState.variable || 'x';
  const affectedBranches = new Set(
    (Array.isArray(branchIndices) ? branchIndices : [branchIndices])
      .map((value) => Number(value))
      .filter((value) => Number.isInteger(value)),
  );

  return previousState.branches.every((previousBranch, branchIndex) => {
    const nextBranch = nextState.branches[branchIndex];
    if (!nextBranch) return false;

    if (!affectedBranches.has(branchIndex)) {
      return branchExpressionsEquivalent(previousBranch, nextBranch, variable);
    }

    if (previousBranch.expressions.length !== nextBranch.expressions.length) return false;
    if (previousBranch.relations.length !== nextBranch.relations.length) return false;

    if (scalesInequalityByUnknownSign(previousBranch.relations, operation, operand.numericValue)) return false;
    const expectedRelations = expectedRelationsAfterOperation(
      previousBranch.relations,
      operation,
      operand.numericValue,
    );
    if (!expectedRelations.every((relation, index) => relation === nextBranch.relations[index])) return false;

    return previousBranch.expressions.every((expression, expressionIndex) => {
      const expectedExpression = independentOperationExpression(
        expression,
        operation,
        operand.expression,
      );
      return Boolean(expectedExpression) && expressionsEquivalent(
        expectedExpression,
        nextBranch.expressions[expressionIndex],
        variable,
      );
    });
  });
};

const validateExpectedStructuralState = (expectedState, nextState) => {
  if (!relationFramesMatch(expectedState, nextState)) return false;
  if (expectedState.special) return true;

  const variable = expectedState.variable || 'x';
  const expectedBranches = expectedState.branches || [];
  const nextBranches = nextState.branches || [];

  // OR branches are mathematically unordered. A student-authored absolute
  // split may enter the negative branch first, so compare the branch set
  // rather than forcing presentation order to define correctness.
  if (expectedState.connective === 'OR') {
    const used = new Set();
    return expectedBranches.every((expectedBranch) => {
      const matchIndex = nextBranches.findIndex((nextBranch, index) => (
        !used.has(index) && branchExpressionsEquivalent(expectedBranch, nextBranch, variable)
      ));
      if (matchIndex < 0) return false;
      used.add(matchIndex);
      return true;
    });
  }

  return expectedBranches.every((expectedBranch, index) => (
    branchExpressionsEquivalent(expectedBranch, nextBranches[index], variable)
  ));
};

const reverseStructuralBranch = (branch) => ({
  expressions: [...(branch?.expressions || [])].reverse(),
  relations: [...(branch?.relations || [])].reverse().map(reverseRelation),
});

const validateAbsoluteSplitStructuralState = (expectedState, nextState) => {
  if (validateExpectedStructuralState(expectedState, nextState)) return true;

  // A between-style absolute-value inequality may be written in either
  // mathematically equivalent direction:
  //   -B < expression < B
  // or
  //    B > expression > -B
  // Preserve the student's visible orientation instead of forcing a rewrite.
  if (
    expectedState?.special
    || expectedState?.connective != null
    || expectedState?.branches?.length !== 1
    || expectedState.branches[0]?.expressions?.length !== 3
    || expectedState.branches[0]?.relations?.length !== 2
  ) return false;

  const reversedExpected = cloneRelationState(expectedState);
  reversedExpected.branches[0] = reverseStructuralBranch(expectedState.branches[0]);
  return validateExpectedStructuralState(reversedExpected, nextState);
};

/*
 * THE RULES A VERIFIED RADICAL EQUATION ADDS TO EVERY STEP.
 *
 * Applied only where the relation's ORIGINAL equation is one the radical
 * workspace verifies exactly (radicalEquationShape.mjs), so no absolute-value,
 * inequality or completing-the-square work, and no radical equation outside
 * that scope, takes either rule. The workspace and the server's replay read the
 * same code, so a step one accepts the other does too.
 *
 *   - Multiplying or dividing both sides by an expression that holds the
 *     variable is refused. Dividing x² = 5x by x "keeps the equation" and loses
 *     the root x = 0; the equation then has fewer candidates than it owes. The
 *     fix is the lesson: move every term to one side and factor.
 *   - A long decimal the step introduces is refused. The final answer is judged
 *     exactly, and the step gate compares numbers only to within 1e-9, so
 *     -0.111111111111 passed as -1/9 and was then graded as a different value.
 */
export const RADICAL_VARIABLE_FACTOR_REASON = 'Multiplying or dividing both sides by an expression with the variable in it can lose a solution, or add one that is not real. Move every term to one side and factor instead.';
export const RADICAL_ROUNDED_DECIMAL_REASON = 'Write the exact value, as a fraction such as -1/9. A long decimal is only a rounded approximation of it.';
const LONG_DECIMAL = /\d*\.\d{7,}/g;

/** Is this relation's ORIGINAL equation a radical equation the radical workspace verifies exactly? */
export const relationStateIsVerifiedRadical = (state) => {
  const source = state?.original;
  if (typeof source !== 'string' || !/\b(?:sqrt|cbrt|nthRoot)\s*\(|\\sqrt/.test(source)) return false;
  const parsed = parseRadicalEquation(source, { variable: state.variable || 'x' });
  return parsed.ok && solveRadicalShape(parsed.shape).ok;
};

const longDecimalsIn = (state) => new Set(
  (state?.branches || []).flatMap((branch) => (branch?.expressions || []).flatMap((expression) => String(expression).match(LONG_DECIMAL) || [])),
);

const operandHoldsNoVariable = (operandExpression) => {
  try {
    return parseOperationOperand(operandExpression).numericValue !== null;
  } catch {
    return false;
  }
};

/** The sentence a verified radical equation refuses this step with, or null. */
const radicalStepRefusal = (previousState, nextState, context) => {
  if (!relationStateIsVerifiedRadical(previousState)) return null;
  if ((context.operation === 'multiply' || context.operation === 'divide') && !operandHoldsNoVariable(context.operandExpression)) {
    return RADICAL_VARIABLE_FACTOR_REASON;
  }
  const before = longDecimalsIn(previousState);
  if ([...longDecimalsIn(nextState)].some((decimal) => !before.has(decimal))) return RADICAL_ROUNDED_DECIMAL_REASON;
  return null;
};

export const validateRelationTransition = (
  previousState,
  nextState,
  context = {},
) => {
  if (!previousState || !nextState) {
    return { valid: false, reason: 'The solver could not verify this algebra step.' };
  }

  const kind = context.kind || 'equivalentRewrite';
  let valid = false;

  try {
    if (kind === 'balancedOperation') {
      valid = validateBalancedOperation(previousState, nextState, context);
    } else if (kind === 'equivalentRewrite') {
      valid = validateEquivalentRewrite(previousState, nextState);
    } else if (kind === 'absoluteSplit') {
      const expected = buildAbsoluteValueSplit(
        previousState,
        Number(context.branchIndex) || 0,
        context.structure,
      );
      valid = Boolean(expected?.ready && validateAbsoluteSplitStructuralState(expected.state, nextState));
    } else if (kind === 'squareRoot') {
      const expected = takeSquareRootOfRelation(previousState, Number(context.branchIndex) || 0);
      valid = Boolean(expected?.ready && validateExpectedStructuralState(expected.state, nextState));
    } else if (kind === 'solutionClaim') {
      valid = obviousSpecialClaim(previousState) === context.claim
        && nextState.special === context.claim
        && (nextState.branches?.length || 0) === 0
        && nextState.connective == null;
    } else if (kind === 'radicalRaise') {
      const expected = raiseRadicalRelation(previousState, Number(context.branchIndex) || 0, context.power);
      valid = Boolean(expected?.ready && validateExpectedStructuralState(expected.state, nextState));
    } else if (kind === 'factor') {
      valid = validateFactorTransition(previousState, nextState, Number(context.branchIndex) || 0);
    } else if (kind === 'zeroProduct') {
      valid = validateZeroProductTransition(previousState, nextState, Number(context.branchIndex) || 0);
    }
  } catch {
    valid = false;
  }

  if (valid) {
    // A step that preserves the relation can still break a rule the radical
    // equation adds (above); the sentence says which.
    const refusal = radicalStepRefusal(previousState, nextState, context);
    if (refusal) return { valid: false, reason: refusal };
    return { valid: true, reason: null };
  }
  return {
    valid: false,
    reason: 'That step did not preserve the relation. Your previous valid work was kept.',
  };
};

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
  if (
    (operation === 'multiply' || operation === 'divide')
    && operand.numericValue === null
    && relationStateIsVerifiedRadical(state)
  ) throw new Error(RADICAL_VARIABLE_FACTOR_REASON);

  const next = cloneRelationState(state);
  const branch = next.branches[branchIndex];
  if (!branch) throw new Error('Choose a valid branch first.');
  if (scalesInequalityByUnknownSign(branch.relations, operation, operand.numericValue)) {
    throw new Error(UNKNOWN_SIGN_INEQUALITY_MESSAGE);
  }

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


export const applyBalancedOperationToBranches = (
  state,
  operation,
  rawOperand,
  {
    branchIndices = [],
    placementByBranch = {},
    requireExplicitPlacement = false,
  } = {},
) => {
  const uniqueBranchIndices = [...new Set(
    (Array.isArray(branchIndices) ? branchIndices : [])
      .map((value) => Number(value))
      .filter((value) => Number.isInteger(value)),
  )];

  if (!uniqueBranchIndices.length) {
    throw new Error('Place the operation on at least one complete equation branch before committing.');
  }

  let next = cloneRelationState(state);
  const branchResults = [];

  uniqueBranchIndices.forEach((branchIndex) => {
    const result = applyBalancedOperationToRelation(
      next,
      operation,
      rawOperand,
      {
        branchIndex,
        placementByExpression: placementByBranch?.[branchIndex] || {},
        requireExplicitPlacement,
      },
    );
    next = result.state;
    branchResults.push({
      branchIndex,
      requiresInequalityFlip: result.requiresInequalityFlip,
      expectedRelations: result.expectedRelations,
      operand: result.operand,
    });
  });

  return {
    state: next,
    branchResults,
    requiresInequalityFlip: branchResults.some((result) => result.requiresInequalityFlip),
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

      // lowerExp/upperExp: the number itself, never 2.36(10)^{+5}
      // (algebraAstEngine.mjs TEX_OPTIONS).
      const numeratorLatex = numerator.toTex({
        parenthesis: 'keep',
        implicit: 'show',
        lowerExp: -9,
        upperExp: 15,
      });
      const denominatorLatex = denominator.toTex({
        parenthesis: 'keep',
        implicit: 'show',
        lowerExp: -9,
        upperExp: 15,
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

export const absoluteValueSplitInputModel = (state, branchIndex = 0) => {
  const oriented = orientAbsoluteBranch(state?.branches?.[branchIndex]);
  if (!oriented) {
    return { ready: false, reason: 'An isolated absolute-value expression is required.' };
  }

  const { abs, bound, relation } = oriented;
  if (Math.abs(abs.coefficient - 1) > 1e-12) {
    return {
      ready: false,
      reason: abs.coefficient === -1
        ? 'The absolute-value bars have an invisible negative one in front. Remove that coefficient first.'
        : 'Isolate the absolute-value expression before reversing the bars.',
    };
  }

  return {
    ready: true,
    inner: abs.inner,
    bound,
    relation,
    expectedStructure: relation === '=' || relation === '>' || relation === '>=' ? 'or' : 'and',
    // Every absolute-value relation should require the student to author the
    // split. Equality keeps the legacy branch-value flag for compatibility,
    // while inequalities now also require student-entered bounds and symbols.
    studentAuthorsSplit: true,
    studentAuthorsBranchValues: relation === '=',
  };
};

export const buildStudentAuthoredAbsoluteValueEqualitySplit = (
  state,
  branchIndex = 0,
  requestedStructure = null,
  branchValues = [],
) => {
  const model = absoluteValueSplitInputModel(state, branchIndex);
  if (!model.ready) return model;

  if (model.relation !== '=') {
    return {
      ready: false,
      reason: 'This student-authored split editor currently applies to absolute-value equations.',
    };
  }

  if (requestedStructure !== 'or') {
    return {
      ready: false,
      needsStructureChoice: true,
      reason: 'That structure is not equivalent to this absolute-value equation.',
    };
  }

  const values = Array.isArray(branchValues)
    ? branchValues.map((value) => String(value ?? '').trim())
    : [];

  if (values.length !== 2 || values.some((value) => !value)) {
    return {
      ready: false,
      needsStudentValues: true,
      reason: 'Enter the right-side value for both split equations before checking the split.',
    };
  }

  const boundNumber = numericValue(model.bound);
  if (boundNumber !== null && boundNumber < 0) {
    // Deliberately do NOT collapse the workspace to "No solution" here.
    // The student chose to attempt a split, so let that attempt be checked
    // without giving away the correct conclusion. The separate No solution
    // operation remains available for the student to choose on their own.
    return {
      ready: false,
      rejectedStudentSplit: true,
      reason: 'Those split equations are not equivalent to the original absolute-value equation. Reconsider the value on the other side before choosing your next step.',
    };
  }

  const expected = [model.bound, negativeBound(model.bound)];
  const variable = state?.variable || 'x';
  const direct = relationExpressionsEquivalent(values[0], expected[0], variable)
    && relationExpressionsEquivalent(values[1], expected[1], variable);
  const reversed = relationExpressionsEquivalent(values[0], expected[1], variable)
    && relationExpressionsEquivalent(values[1], expected[0], variable);

  if (!direct && !reversed) {
    return {
      ready: false,
      rejectedStudentSplit: true,
      reason: 'One or both split values are not equivalent to the original equation. Check the two branch values and try again.',
    };
  }

  let normalizedValues;
  try {
    normalizedValues = values.map((value) => normalizeRelationExpressionInput(value));
  } catch (error) {
    return {
      ready: false,
      rejectedStudentSplit: true,
      reason: error?.message || 'One of the split values could not be read.',
    };
  }

  const next = cloneRelationState(state);
  next.branches = normalizedValues.map((value) => ({
    expressions: [model.inner, value],
    relations: ['='],
  }));
  next.connective = 'OR';
  next.special = null;

  return {
    ready: true,
    state: next,
    authoredValues: normalizedValues,
  };
};

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


const VALID_STUDENT_RELATIONS = new Set(['=', '<', '<=', '>', '>=']);

export const buildStudentAuthoredAbsoluteValueSplit = (
  state,
  branchIndex = 0,
  requestedStructure = null,
  authored = {},
) => {
  const model = absoluteValueSplitInputModel(state, branchIndex);
  if (!model.ready) return model;

  if (requestedStructure !== model.expectedStructure) {
    return {
      ready: false,
      needsStructureChoice: true,
      reason: 'That OR/AND structure is not equivalent to the current absolute-value relation.',
    };
  }

  const expected = buildAbsoluteValueSplit(state, branchIndex, requestedStructure);
  // When the true result is a special set (for example all reals or no
  // solution), do not reveal it simply because the student attempted a split.
  if (!expected?.ready || expected.state?.special) {
    return {
      ready: false,
      rejectedStudentSplit: true,
      reason: 'That split is not equivalent to the original absolute-value relation. Reconsider the bound and relation symbols before choosing your next step.',
    };
  }

  const next = cloneRelationState(state);
  next.special = null;

  try {
    if (requestedStructure === 'or') {
      const branches = Array.isArray(authored?.branches) ? authored.branches : [];
      if (
        branches.length !== 2
        || branches.some((branch) => !String(branch?.value ?? '').trim())
        || branches.some((branch) => !VALID_STUDENT_RELATIONS.has(String(branch?.relation || '').trim()))
      ) {
        return {
          ready: false,
          needsStudentValues: true,
          reason: 'Complete both split branches, including each relation symbol and bound, before checking the split.',
        };
      }

      next.branches = branches.map((branch) => ({
        expressions: [
          model.inner,
          normalizeRelationExpressionInput(branch.value),
        ],
        relations: [String(branch.relation).trim()],
      }));
      next.connective = 'OR';
    } else {
      const compound = authored?.compound || {};
      const leftValue = String(compound.leftValue ?? '').trim();
      const rightValue = String(compound.rightValue ?? '').trim();
      const leftRelation = String(compound.leftRelation || '').trim();
      const rightRelation = String(compound.rightRelation || '').trim();

      if (
        !leftValue
        || !rightValue
        || !VALID_STUDENT_RELATIONS.has(leftRelation)
        || !VALID_STUDENT_RELATIONS.has(rightRelation)
      ) {
        return {
          ready: false,
          needsStudentValues: true,
          reason: 'Complete both bounds and both relation symbols before checking the compound split.',
        };
      }

      next.branches = [{
        expressions: [
          normalizeRelationExpressionInput(leftValue),
          model.inner,
          normalizeRelationExpressionInput(rightValue),
        ],
        relations: [leftRelation, rightRelation],
      }];
      next.connective = null;
    }
  } catch (error) {
    return {
      ready: false,
      rejectedStudentSplit: true,
      reason: error?.message || 'One of the split expressions could not be read.',
    };
  }

  if (!validateAbsoluteSplitStructuralState(expected.state, next)) {
    return {
      ready: false,
      rejectedStudentSplit: true,
      reason: 'One or more split bounds or relation symbols are not equivalent to the original absolute-value relation.',
    };
  }

  return {
    ready: true,
    state: next,
  };
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
      const candidates = [];
      numericValues.forEach((value, index) => {
        if (candidates.some((candidate) => Math.abs(candidate.value - value) <= 1e-10)) return;
        candidates.push({ value, expression: String(isolatedValues[index]).trim() });
      });
      candidates.sort((left, right) => left.value - right.value);
      return {
        solved: true,
        kind: 'values',
        values: candidates.map((candidate) => candidate.value),
        valueExpressions: candidates.map((candidate) => candidate.expression),
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

/**
 * The values a solved relation states, one per branch exactly as written, and
 * how its branches are joined; null unless every branch reads "variable = value".
 *
 * relationSolutionSummary answers "is it solved, and what are the values", but it
 * folds values within 1e-10 of each other into one and says nothing of the
 * connective, so x = 5 AND x = 0 and x = 5 OR x = 5.00000000001 read like a
 * list of solutions. A grader that must be exact reads the branches here.
 */
export const relationIsolatedBranchValues = (state) => {
  if (!state || state.special) return null;
  const variable = state.variable || 'x';
  const branches = state.branches || [];
  if (!branches.length) return null;
  const expressions = [];
  for (const branch of branches) {
    const isolated = isolatedEquationValue(branch, variable);
    if (!isolated) return null;
    expressions.push(isolated.expression);
  }
  return { expressions, connective: state.connective ?? null };
};

/*
 * A RELATION WITH NO VARIABLE LEFT IS A STATEMENT: TRUE OR FALSE.
 *
 * When the student's own balanced moves cancel the variable — 3x + 7 = 3x + 2
 * becomes 7 = 2, and 2(x + 3) = 2x + 6 becomes 6 = 6 — what is left no longer
 * mentions x: it is false for every x (no solution) or true for every x (all
 * real numbers). The same holds for an inequality (5 < 3, 3 < 5).
 *
 * Only a branch the student has reduced to numbers counts. A relation that
 * still contains the variable — or any other letter — is not a statement, so
 * the "No solution" / "All real numbers" conclusion still has to be earned by
 * the algebra; the workspace only commits balanced, solution-preserving moves
 * (and never multiplies by zero), so a statement reached here is the original
 * relation's own verdict. Numbers are compared exactly where they are
 * rational (1/3 + 2/3 = 1 is true, not 0.9999999999999999 ≠ 1).
 */
const STATEMENT_TOLERANCE = 1e-10;

const statementValue = (expression) => {
  const numeric = numericValue(expression);
  if (numeric === null) return null;
  return { exact: exactRationalFromExpression(expression), numeric };
};

const compareStatementValues = (left, right) => {
  if (left.exact && right.exact) {
    const difference = left.exact.n * right.exact.d - right.exact.n * left.exact.d;
    return Math.sign(difference);
  }
  const scale = Math.max(1, Math.abs(left.numeric), Math.abs(right.numeric));
  if (Math.abs(left.numeric - right.numeric) <= STATEMENT_TOLERANCE * scale) return 0;
  return Math.sign(left.numeric - right.numeric);
};

const STATEMENT_HOLDS = {
  '=': (order) => order === 0,
  '<': (order) => order < 0,
  '<=': (order) => order <= 0,
  '>': (order) => order > 0,
  '>=': (order) => order >= 0,
};

/** true / false for a variable-free branch, null for anything else. */
export const constantRelationTruth = (branch) => {
  const expressions = Array.isArray(branch?.expressions) ? branch.expressions : [];
  const relations = Array.isArray(branch?.relations) ? branch.relations : [];
  if (expressions.length < 2 || relations.length !== expressions.length - 1) return null;
  if (!relations.every((relation) => STATEMENT_HOLDS[relation])) return null;
  const values = expressions.map(statementValue);
  if (values.some((value) => value === null)) return null;
  return relations.every((relation, index) => STATEMENT_HOLDS[relation](compareStatementValues(values[index], values[index + 1])));
};

export const obviousSpecialClaim = (state) => {
  if (state?.special) return state.special;
  if (!state || state.branches?.length !== 1) return null;
  const statement = constantRelationTruth(state.branches[0]);
  if (statement !== null) return statement ? 'allReals' : 'noSolution';
  // An isolated even root equal to a negative number (radicalNoSolutionClaim).
  if (radicalNoSolutionClaim(state.branches[0])) return 'noSolution';
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


export const OTHER_ALGEBRA_OPERATIONS = Object.freeze([
  { id: 'squareRoot', label: 'Take square root' },
  { id: 'reverseAbsolute', label: 'Reverse absolute value' },
  { id: 'completeSquare', label: 'Complete the square' },
  { id: 'noSolution', label: 'No solution' },
  { id: 'allReals', label: 'All real numbers' },
]);

/*
 * RADICAL EQUATIONS AND QUADRATIC FACTORING, IN THE SAME WORKSPACE.
 *
 * Three student-driven operations, each a validated transition exactly like
 * the absolute-value split: the student authors the next line, the workspace
 * and the server judge it with the SAME function (validateRelationTransition),
 * and a step that does not follow is never committed or credited.
 *
 *   radicalRaise   "square both sides" / "cube both sides" / "raise to the 4th
 *                  or 5th". Allowed only on an ISOLATED radical (one side is
 *                  exactly ⁿ√(…), the other holds none) and only to the radical's
 *                  own index. The result is judged structurally — the radical
 *                  side must become the radicand and the other side its own
 *                  n-th power — because generic equivalence cannot say that
 *                  (sqrt(x+4)^2 is not x+4 where x+4 < 0).
 *   factor         Write one side of  0 = quadratic  as a product of linear
 *                  factors (a repeated factor and a leading constant included).
 *   zeroProduct    From  (factor)(factor) = 0  write one equation per distinct
 *                  factor. Unordered; a repeated factor may be written once.
 *
 * They are named tools a lesson opts into (RADICAL_ALGEBRA_TOOLS below), so no
 * absolute-value or inequality lesson gains a button it did not have. They are
 * not specific to radicals: a standalone quadratic lesson enables the same
 * `factor` and `zeroProduct` tools.
 */
export const RADICAL_ALGEBRA_TOOLS = Object.freeze([
  { id: 'raisePower', label: 'Raise both sides to a power' },
  { id: 'factor', label: 'Factor' },
  { id: 'zeroProduct', label: 'Zero-product property' },
]);

/** The powers the raise operation offers: the radical indices the lesson verifies. */
export const RADICAL_POWER_CHOICES = Object.freeze([2, 3, 4, 5]);

const RADICAL_FUNCTION_NAMES = new Set(['sqrt', 'cbrt', 'nthRoot']);

const plainNode = (node) => {
  let current = node;
  while (current?.isParenthesisNode) current = current.content;
  return current;
};

const nodeText = (node) => node.toString({ parenthesis: 'keep', implicit: 'hide' });

/** { index, radicand } when the WHOLE expression is a single radical call. */
export const radicalCallOf = (expression) => {
  try {
    const node = plainNode(parse(String(expression)));
    if (!node?.isFunctionNode || !RADICAL_FUNCTION_NAMES.has(node.fn?.name)) return null;
    if (node.fn.name === 'sqrt' && node.args.length === 1) return { index: 2, radicand: nodeText(node.args[0]) };
    if (node.fn.name === 'cbrt' && node.args.length === 1) return { index: 3, radicand: nodeText(node.args[0]) };
    if (node.fn.name === 'nthRoot' && node.args.length === 2) {
      const index = constantNodeValue(plainNode(node.args[1]));
      return Number.isInteger(index) && index >= 2 ? { index, radicand: nodeText(node.args[0]) } : null;
    }
    return null;
  } catch {
    return null;
  }
};

const expressionHasRadical = (expression) => {
  try {
    return parse(String(expression)).filter((child) => (
      child?.isFunctionNode && RADICAL_FUNCTION_NAMES.has(child.fn?.name)
    )).length > 0;
  } catch {
    return false;
  }
};

/** Does the relation's ORIGINAL equation contain a radical? (Candidates must be checked in it.) */
export const relationStateContainsRadical = (state) => (
  /\b(?:sqrt|cbrt|nthRoot)\s*\(/.test(String(state?.original || ''))
);

/** Absolute value and radical equations both can gain an extraneous candidate. */
export const relationStateNeedsCandidateCheck = (state) => (
  relationStateContainsAbsoluteValue(state) || relationStateContainsRadical(state)
);

/** The radical a branch has isolated: one side is exactly ⁿ√(…), the other side holds no radical. */
export const isolatedRadicalInBranch = (branch) => {
  if (
    !branch
    || branch.expressions?.length !== 2
    || branch.relations?.length !== 1
    || branch.relations[0] !== '='
  ) return null;
  for (const side of [0, 1]) {
    const call = radicalCallOf(branch.expressions[side]);
    if (call && !expressionHasRadical(call.radicand) && !expressionHasRadical(branch.expressions[1 - side])) {
      return { side, ...call };
    }
  }
  return null;
};

/**
 * The state "raise both sides to the power n" must produce from an isolated
 * radical: the radical side becomes the radicand, the other side its n-th
 * power. `ready: false` carries the sentence the student reads.
 */
export const raiseRadicalRelation = (state, branchIndex = 0, power = null) => {
  if (!state || state.special) return { ready: false, reason: 'There is no active equation to raise to a power.' };
  if ((state.branches?.length || 0) !== 1) {
    return { ready: false, reason: 'Raise both sides to a power while the equation is still one equation, before it splits into branches.' };
  }
  const branch = state.branches[branchIndex];
  const isolated = isolatedRadicalInBranch(branch);
  if (!isolated) {
    return { ready: false, reason: 'Isolate the radical on one side first. Raising to a power only removes a root that is alone on its side.' };
  }
  const exponent = Number(power);
  if (!Number.isInteger(exponent) || !RADICAL_POWER_CHOICES.includes(exponent)) {
    return { ready: false, reason: 'Choose a power from 2 to 5.' };
  }
  if (exponent !== isolated.index) {
    return { ready: false, reason: 'That power does not undo this root. Raise both sides to the power that matches the root’s index.' };
  }
  const expressions = [...branch.expressions];
  expressions[isolated.side] = isolated.radicand;
  expressions[1 - isolated.side] = `(${branch.expressions[1 - isolated.side]})^${exponent}`;
  const next = cloneRelationState(state);
  next.branches[branchIndex] = { expressions, relations: ['='] };
  return { ready: true, state: next, index: isolated.index };
};

// --- Polynomials the factoring tools read ---------------------------------------------

const MAX_FACTOR_DEGREE = 6;
const POLYNOMIAL_OPERATOR_FUNCTIONS = new Set(['add', 'subtract', 'multiply', 'unaryMinus', 'unaryPlus']);

/** Is the node a polynomial in `variable` with numeric coefficients (division only by a number)? */
const isPolynomialNode = (node, variable) => {
  let polynomial = true;
  node.traverse((child) => {
    if (!polynomial) return;
    if (child.isConstantNode) polynomial = typeof child.value === 'number';
    else if (child.isSymbolNode) polynomial = child.name === variable;
    else if (child.isParenthesisNode) polynomial = true;
    else if (child.isOperatorNode && POLYNOMIAL_OPERATOR_FUNCTIONS.has(child.fn)) polynomial = true;
    else if (child.isOperatorNode && child.fn === 'divide') {
      polynomial = child.args[1].filter((part) => part?.isSymbolNode).length === 0;
    } else if (child.isOperatorNode && child.fn === 'pow') {
      const exponent = constantNodeValue(plainNode(child.args[1]));
      polynomial = Number.isInteger(exponent) && exponent >= 0 && exponent <= MAX_FACTOR_DEGREE;
    } else polynomial = false;
  });
  return polynomial;
};

/** Degree of a polynomial in `variable` (finite differences on integer points), or null. */
const polynomialDegree = (expression, variable) => {
  try {
    const node = parse(String(expression));
    if (!isPolynomialNode(node, variable)) return null;
    let row = [];
    for (let point = 0; point <= MAX_FACTOR_DEGREE + 1; point += 1) {
      const value = Number(evaluate(String(expression), { [variable]: point }));
      if (!Number.isFinite(value)) return null;
      row.push(value);
    }
    const scale = Math.max(1, ...row.map(Math.abs));
    let degree = 0;
    for (let order = 0; order <= MAX_FACTOR_DEGREE + 1; order += 1) {
      if (row.some((value) => Math.abs(value) > 1e-9 * scale)) degree = order;
      row = row.slice(1).map((value, index) => value - row[index]);
    }
    return degree;
  } catch {
    return null;
  }
};

const noSymbols = (node) => node.filter((child) => child?.isSymbolNode).length === 0;

/** The factors of a product, parentheses and constant multipliers seen through. */
const flattenProductFactors = (node) => {
  const inner = plainNode(node);
  if (inner?.isOperatorNode && inner.fn === 'multiply') {
    return [...flattenProductFactors(inner.args[0]), ...flattenProductFactors(inner.args[1])];
  }
  if (inner?.isOperatorNode && (inner.fn === 'unaryMinus' || inner.fn === 'unaryPlus')) {
    return flattenProductFactors(inner.args[0]);
  }
  if (inner?.isOperatorNode && inner.fn === 'divide' && noSymbols(inner.args[1])) {
    return flattenProductFactors(inner.args[0]);
  }
  return [inner];
};

/**
 * { ok, factors: [{ expression, multiplicity }], degree } for an expression
 * written as a product of linear factors — a leading number, a repeated
 * factor ((x - 3)^2 or (x - 3)(x - 3)) and a bare x included. A sum is not a
 * product; neither is a lone linear factor or an irreducible quadratic factor.
 */
export const factoredProductOf = (expression, variable = 'x') => {
  try {
    const parts = flattenProductFactors(parse(String(expression)));
    const factors = [];
    for (const part of parts) {
      if (noSymbols(part)) continue;
      let base = part;
      let multiplicity = 1;
      if (part.isOperatorNode && part.fn === 'pow') {
        const exponent = constantNodeValue(plainNode(part.args[1]));
        if (!Number.isInteger(exponent) || exponent < 2) return { ok: false };
        base = plainNode(part.args[0]);
        multiplicity = exponent;
      }
      if (polynomialDegree(nodeText(base), variable) !== 1) return { ok: false };
      factors.push({ expression: nodeText(base), multiplicity });
    }
    const degree = factors.reduce((sum, factor) => sum + factor.multiplicity, 0);
    return degree >= 2 ? { ok: true, factors, degree } : { ok: false };
  } catch {
    return { ok: false };
  }
};

/** [zero side, other side] of an equation branch that has a 0 on exactly one side, else null. */
const zeroSideOf = (branch) => {
  if (!branch || branch.expressions?.length !== 2 || branch.relations?.length !== 1 || branch.relations[0] !== '=') return null;
  const values = branch.expressions.map(numericValue);
  if (values[0] === 0 && values[1] !== 0) return { zero: 0, other: 1 };
  if (values[1] === 0 && values[0] !== 0) return { zero: 1, other: 0 };
  return null;
};

/** Factoring a polynomial needs it alone on one side of 0. */
const factorTargetOf = (branch, variable) => {
  const sides = zeroSideOf(branch);
  if (!sides) return null;
  const degree = polynomialDegree(branch.expressions[sides.other], variable);
  return degree !== null && degree >= 2 ? sides : null;
};

/** For factoring: which expression of the branch is the 0 and which the polynomial, else null. */
export const factorTargetOfBranch = (branch, variable = 'x') => factorTargetOf(branch, variable);

const validateFactorTransition = (previousState, nextState, branchIndex) => {
  if (!previousState || previousState.special || !nextState || nextState.special) return false;
  if (!relationFramesMatch(previousState, nextState)) return false;
  const variable = previousState.variable || 'x';
  const target = factorTargetOf(previousState.branches[branchIndex], variable);
  const after = nextState.branches[branchIndex];
  if (!target || !after || after.expressions?.length !== 2 || after.relations?.[0] !== '=') return false;
  const before = previousState.branches[branchIndex];
  // The 0 stays 0; the polynomial becomes an equal product of linear factors.
  if (numericValue(after.expressions[target.zero]) !== 0) return false;
  const factored = after.expressions[target.other];
  if (!expressionsEquivalent(before.expressions[target.other], factored, variable)) return false;
  const product = factoredProductOf(factored, variable);
  if (!product.ok || product.degree !== polynomialDegree(before.expressions[target.other], variable)) return false;
  return previousState.branches.every((branch, index) => (
    index === branchIndex || branchExpressionsEquivalent(branch, nextState.branches[index], variable)
  ));
};

/** The distinct linear factors a zero product splits into (one equation each). */
export const zeroProductFactors = (state, branchIndex = 0) => {
  if (!state || state.special || state.connective === 'AND') return null;
  const variable = state.variable || 'x';
  const branch = state.branches?.[branchIndex];
  const sides = zeroSideOf(branch);
  if (!sides) return null;
  const product = factoredProductOf(branch.expressions[sides.other], variable);
  if (!product.ok) return null;
  const distinct = [];
  product.factors.forEach(({ expression }) => {
    if (!distinct.some((known) => expressionsEquivalent(known, expression, variable))) distinct.push(expression);
  });
  return distinct;
};

const validateZeroProductTransition = (previousState, nextState, branchIndex) => {
  const factors = zeroProductFactors(previousState, branchIndex);
  if (!factors || !nextState || nextState.special) return false;
  const variable = previousState.variable || 'x';
  const before = previousState.branches;
  const after = nextState.branches || [];
  const written = after.length - before.length + 1;
  if (written < 1 || (nextState.variable || 'x') !== variable) return false;
  // Branches before and after the written ones are untouched.
  const untouched = before.every((branch, index) => {
    if (index === branchIndex) return true;
    const position = index < branchIndex ? index : index + written - 1;
    return branchExpressionsEquivalent(branch, after[position], variable);
  });
  if (!untouched) return false;
  const expectedConnective = after.length > 1 ? 'OR' : null;
  if ((nextState.connective ?? null) !== expectedConnective) return false;
  const covered = new Set();
  for (let offset = 0; offset < written; offset += 1) {
    const branch = after[branchIndex + offset];
    if (branch?.expressions?.length !== 2 || branch.relations?.[0] !== '=') return false;
    const sides = zeroSideOf(branch);
    if (!sides) return false;
    const match = factors.findIndex((factor) => expressionsEquivalent(factor, branch.expressions[sides.other], variable));
    if (match < 0) return false;
    covered.add(match);
  }
  return covered.size === factors.length;
};

/*
 * An isolated even root equal to a negative number has no real solution — no
 * algebra needed. Only that shape: the radical alone on one side, a negative
 * number on the other. (Any other "no real solution" is earned by checking
 * every candidate in the original equation.)
 */
const radicalNoSolutionClaim = (branch) => {
  const isolated = isolatedRadicalInBranch(branch);
  if (!isolated || isolated.index % 2 !== 0) return false;
  const value = numericValue(branch.expressions[1 - isolated.side]);
  return value !== null && value < 0;
};
