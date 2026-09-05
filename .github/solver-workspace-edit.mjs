import { readFile, writeFile } from 'node:fs/promises';

const path = 'src/algebraRelationFoundation.js';
let source = await readFile(path, 'utf8');

const anchor = `export const verifyRelationCandidates = (state, candidates = [], variable = state?.variable || 'x') => (
  (Array.isArray(candidates) ? candidates : []).map((value) => ({
    value,
    valid: verifyRelationCandidate(state, value, variable),
  }))
);

`;

if (!source.includes(anchor)) throw new Error('Could not locate relation candidate verification anchor');

const addition = `export const verifyRelationCandidates = (state, candidates = [], variable = state?.variable || 'x') => (
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
  if (operation === 'add') return \`(\${expression}) + (\${operandExpression})\`;
  if (operation === 'subtract') return \`(\${expression}) - (\${operandExpression})\`;
  if (operation === 'multiply') return \`(\${operandExpression}) * (\${expression})\`;
  if (operation === 'divide') return \`(\${expression}) / (\${operandExpression})\`;
  return null;
};

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
    }
  } catch {
    valid = false;
  }

  return valid
    ? { valid: true, reason: null }
    : {
        valid: false,
        reason: 'That step did not preserve the relation. Your previous valid work was kept.',
      };
};

`;

source = source.replace(anchor, addition);
await writeFile(path, source);
