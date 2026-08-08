'use strict';

const MAX_EXPRESSION_LENGTH = 240;

function tokenize(expression) {
  const source = String(expression || '').trim();
  if (!source || source.length > MAX_EXPRESSION_LENGTH) throw new Error('Expression is empty or too long.');
  const tokens = [];
  let index = 0;
  while (index < source.length) {
    const rest = source.slice(index);
    const whitespace = rest.match(/^\s+/);
    if (whitespace) { index += whitespace[0].length; continue; }
    const number = rest.match(/^(?:\d+(?:\.\d*)?|\.\d+)/);
    if (number) { tokens.push({ type: 'number', value: Number(number[0]) }); index += number[0].length; continue; }
    const identifier = rest.match(/^[A-Za-z_][A-Za-z0-9_]*/);
    if (identifier) { tokens.push({ type: 'identifier', value: identifier[0] }); index += identifier[0].length; continue; }
    const operator = rest.match(/^(?:<=|>=|==|!=|[+\-*/^()<>])/);
    if (operator) { tokens.push({ type: 'operator', value: operator[0] }); index += operator[0].length; continue; }
    throw new Error(`Unsupported expression token near "${rest.slice(0, 12)}".`);
  }
  return tokens;
}

function evaluateArithmetic(expression, values = {}) {
  const tokens = tokenize(expression);
  let cursor = 0;
  const peek = () => tokens[cursor];
  const take = () => tokens[cursor++];

  const primary = () => {
    const token = take();
    if (!token) throw new Error('Unexpected end of expression.');
    if (token.type === 'number') return token.value;
    if (token.type === 'identifier') {
      if (!Object.prototype.hasOwnProperty.call(values, token.value)) throw new Error(`Unknown parameter ${token.value}.`);
      const numeric = Number(values[token.value]);
      if (!Number.isFinite(numeric)) throw new Error(`Parameter ${token.value} is not numeric.`);
      return numeric;
    }
    if (token.value === '(') {
      const result = additive();
      if (take()?.value !== ')') throw new Error('Unbalanced parentheses.');
      return result;
    }
    if (token.value === '+') return primary();
    if (token.value === '-') return -primary();
    throw new Error(`Unexpected token ${token.value}.`);
  };

  const power = () => {
    let left = primary();
    if (peek()?.value === '^') { take(); left = left ** power(); }
    return left;
  };
  const multiplicative = () => {
    let left = power();
    while (['*', '/'].includes(peek()?.value)) {
      const op = take().value;
      const right = power();
      if (op === '/' && right === 0) throw new Error('Division by zero.');
      left = op === '*' ? left * right : left / right;
    }
    return left;
  };
  function additive() {
    let left = multiplicative();
    while (['+', '-'].includes(peek()?.value)) {
      const op = take().value;
      const right = multiplicative();
      left = op === '+' ? left + right : left - right;
    }
    return left;
  }

  const result = additive();
  if (cursor !== tokens.length) throw new Error(`Unexpected token ${peek()?.value}.`);
  if (!Number.isFinite(result)) throw new Error('Expression did not produce a finite number.');
  return result;
}

function evaluateConstraint(expression, values = {}) {
  const source = String(expression || '').trim();
  const match = source.match(/^(.*?)(<=|>=|==|!=|<|>)(.*)$/);
  if (!match) throw new Error('Constraint must contain one comparison operator.');
  const left = evaluateArithmetic(match[1], values);
  const right = evaluateArithmetic(match[3], values);
  const epsilon = 1e-9;
  if (match[2] === '<=') return left <= right + epsilon;
  if (match[2] === '>=') return left + epsilon >= right;
  if (match[2] === '<') return left < right - epsilon;
  if (match[2] === '>') return left > right + epsilon;
  if (match[2] === '==') return Math.abs(left - right) <= epsilon;
  return Math.abs(left - right) > epsilon;
}

const countWords = (value) => String(value || '').trim().split(/\s+/).filter(Boolean).length;
const clamp01 = (value) => Math.max(0, Math.min(1, Number(value) || 0));

function normalizeSubmissionValues(labDefinition, submitted = {}) {
  const values = {};
  const errors = [];
  (labDefinition.parameters || []).forEach((parameter) => {
    const value = Number(submitted[parameter.id]);
    if (!Number.isFinite(value)) errors.push(`${parameter.label || parameter.id} is missing or not numeric.`);
    else if (value < Number(parameter.min) - 1e-9 || value > Number(parameter.max) + 1e-9) errors.push(`${parameter.label || parameter.id} is outside the allowed range.`);
    else values[parameter.id] = value;
  });
  return { values, errors };
}

function targetParameterScore(labDefinition, values) {
  const targets = labDefinition.evaluation?.targetParameters || {};
  const entries = Object.entries(targets).filter(([key, value]) => Object.prototype.hasOwnProperty.call(values, key) && Number.isFinite(Number(value)));
  if (!entries.length) return null;
  const byId = new Map((labDefinition.parameters || []).map((parameter) => [parameter.id, parameter]));
  return entries.reduce((sum, [key, target]) => {
    const parameter = byId.get(key) || {};
    const tolerance = Math.max(Number(parameter.step) || 0, (Number(parameter.max) - Number(parameter.min)) * 0.05, 1e-9);
    return sum + clamp01(1 - Math.abs(values[key] - Number(target)) / tolerance);
  }, 0) / entries.length;
}

function evaluateLabSubmission({ labDefinition, studentHypothesis = '', trialHistory = [], finalParameterValues = {}, studentJustification = '' }) {
  if (!labDefinition || typeof labDefinition !== 'object') throw new Error('Server lab definition is missing.');
  const { values, errors: valueErrors } = normalizeSubmissionValues(labDefinition, finalParameterValues);
  if (valueErrors.length) throw new Error(valueErrors.join(' '));
  const constraintViolations = [];
  (labDefinition.constraints || []).forEach((constraint) => {
    try {
      if (!evaluateConstraint(constraint.expression, values)) constraintViolations.push(constraint.penaltyMessage || constraint.label || 'Constraint violated.');
    } catch (error) {
      constraintViolations.push(`Unable to verify ${constraint.label || constraint.id}: ${error.message}`);
    }
  });

  let accuracyScore = targetParameterScore(labDefinition, values);
  const objective = labDefinition.evaluation?.objectiveExpression;
  const targetValue = labDefinition.evaluation?.targetValue;
  if (objective && Number.isFinite(Number(targetValue))) {
    const actual = evaluateArithmetic(objective, values);
    const tolerance = Math.max(Number(labDefinition.evaluation?.targetTolerance) || 0, Math.abs(Number(targetValue)) * 0.05, 1e-9);
    accuracyScore = clamp01(1 - Math.abs(actual - Number(targetValue)) / tolerance);
  }
  if (accuracyScore == null) accuracyScore = 1;
  if (constraintViolations.length) accuracyScore = clamp01(accuracyScore - 0.25 * constraintViolations.length);

  const uniqueTrials = new Set((Array.isArray(trialHistory) ? trialHistory : []).slice(0, 50).map((trial) => JSON.stringify(trial?.parameters || {}))).size;
  const rubric = labDefinition.rubric || {};
  const processScore = clamp01(uniqueTrials / Math.max(1, Number(rubric.minimumTrials) || 3));
  const hypothesisWords = countWords(studentHypothesis);
  const hypothesisTextScore = clamp01(hypothesisWords / Math.max(1, Number(rubric.minimumHypothesisWords) || 8));
  const hypothesisScore = (processScore + hypothesisTextScore) / 2;
  const justificationWords = countWords(studentJustification);
  const justificationScore = clamp01(justificationWords / Math.max(1, Number(rubric.minimumJustificationWords) || 30));
  const compositeScore = Math.round(clamp01(
    accuracyScore * Number(rubric.modelAccuracyWeight ?? 0.5)
    + hypothesisScore * Number(rubric.hypothesisQualityWeight ?? 0.2)
    + justificationScore * Number(rubric.writtenJustificationWeight ?? 0.3)
  ) * 100) / 100;
  const threshold = Number(rubric.masteryThreshold ?? 0.85);
  return {
    compositeScore,
    isMastered: compositeScore >= threshold && constraintViolations.length === 0,
    rubricBreakdown: {
      modelAccuracy: Math.round(accuracyScore * 100),
      hypothesisCompleteness: Math.round(hypothesisScore * 100),
      writtenJustificationCompleteness: Math.round(justificationScore * 100),
    },
    constraintViolations,
    trialCount: Array.isArray(trialHistory) ? trialHistory.length : 0,
    uniqueTrialCount: uniqueTrials,
    humanReviewRecommended: Number(rubric.writtenJustificationWeight || 0) > 0,
    feedback: compositeScore >= threshold && constraintViolations.length === 0
      ? 'The submitted model met the automatic mathematical criteria. Written reasoning remains available for teacher review.'
      : 'Refine the model, use distinct trials, satisfy every constraint, and strengthen the written justification.',
  };
}

module.exports = { evaluateArithmetic, evaluateConstraint, evaluateLabSubmission };

