import test from 'node:test';
import assert from 'node:assert/strict';
import {
  deterministicShuffle,
  orderedChoiceBank,
  scoreExpressionMeaning,
  validateExpressionMeaningQuestion,
} from '../../src/tools/expressionMeaning/expressionMeaningMath.js';

const question = {
  type: 'expressionMeaning',
  questionId: 'shirts-1',
  expressions: [
    { id: 'rate', expression: '15', unit: 'dollars per shirt', contextMeaning: 'selling price earned for each shirt sold', mathRole: 'rate of change / slope' },
    { id: 'constant', expression: '-45', unit: 'dollars', contextMeaning: 'value associated with the three shirts given away', mathRole: 'y-intercept / constant term' },
    { id: 'adjustedInput', expression: '(t - 3)', unit: 'shirts', contextMeaning: 'shirts available to sell after three are given away', mathRole: 'adjusted input' },
  ],
  choiceBanks: {
    units: ['dollars per shirt', 'dollars', 'shirts', 'minutes'],
    contextMeanings: [
      'selling price earned for each shirt sold',
      'value associated with the three shirts given away',
      'shirts available to sell after three are given away',
      'total time spent selling',
    ],
    mathRoles: ['rate of change / slope', 'y-intercept / constant term', 'adjusted input', 'independent variable'],
  },
};

const fullyCorrectAssignments = Object.fromEntries(question.expressions.map((expr) => [
  expr.id, { unit: expr.unit, contextMeaning: expr.contextMeaning, mathRole: expr.mathRole },
]));

test('all dimensions correct scores 1 and is marked correct', () => {
  const result = scoreExpressionMeaning(question, { assignments: fullyCorrectAssignments });
  assert.equal(result.isCorrect, true);
  assert.equal(result.score, 1);
  assert.ok(result.perExpression.every((entry) => entry.complete));
});

test('one wrong unit is caught for exactly that expression/dimension', () => {
  const assignments = {
    ...fullyCorrectAssignments,
    rate: { ...fullyCorrectAssignments.rate, unit: 'dollars' },
  };
  const result = scoreExpressionMeaning(question, { assignments });
  assert.equal(result.isCorrect, false);
  const rateEntry = result.perExpression.find((entry) => entry.id === 'rate');
  assert.equal(rateEntry.checks.unit, false);
  assert.equal(rateEntry.checks.contextMeaning, true);
  assert.equal(rateEntry.checks.mathRole, true);
});

test('one wrong context meaning is caught for exactly that expression/dimension', () => {
  const assignments = {
    ...fullyCorrectAssignments,
    constant: { ...fullyCorrectAssignments.constant, contextMeaning: 'total time spent selling' },
  };
  const result = scoreExpressionMeaning(question, { assignments });
  const entry = result.perExpression.find((item) => item.id === 'constant');
  assert.equal(entry.checks.contextMeaning, false);
  assert.equal(entry.checks.unit, true);
  assert.equal(entry.checks.mathRole, true);
});

test('one wrong math role is caught for exactly that expression/dimension', () => {
  const assignments = {
    ...fullyCorrectAssignments,
    adjustedInput: { ...fullyCorrectAssignments.adjustedInput, mathRole: 'independent variable' },
  };
  const result = scoreExpressionMeaning(question, { assignments });
  const entry = result.perExpression.find((item) => item.id === 'adjustedInput');
  assert.equal(entry.checks.mathRole, false);
  assert.equal(entry.checks.unit, true);
  assert.equal(entry.checks.contextMeaning, true);
});

test('partial scoring reflects the fraction of correct expression/dimension pairs', () => {
  const assignments = {
    rate: { unit: 'dollars', contextMeaning: fullyCorrectAssignments.rate.contextMeaning, mathRole: fullyCorrectAssignments.rate.mathRole },
    constant: fullyCorrectAssignments.constant,
    adjustedInput: {},
  };
  const result = scoreExpressionMeaning(question, { assignments });
  assert.equal(result.isCorrect, false);
  assert.ok(result.score > 0 && result.score < 1);
  // 3 expressions x 3 dimensions = 9 checks; rate has 2/3, constant 3/3, adjustedInput 0/3 = 5/9.
  assert.ok(Math.abs(result.score - 5 / 9) < 1e-9);
});

test('choice bank order is deterministic for the same question and dimension', () => {
  const first = orderedChoiceBank(question.choiceBanks.units, `${question.questionId}:unit`);
  const second = orderedChoiceBank(question.choiceBanks.units, `${question.questionId}:unit`);
  assert.deepEqual(first, second);
  // A different seed key (a different dimension) is not guaranteed to match.
  const contextOrder = orderedChoiceBank(question.choiceBanks.contextMeanings, `${question.questionId}:contextMeaning`);
  assert.equal(contextOrder.length, question.choiceBanks.contextMeanings.length);
});

test('deterministic shuffle never drops or duplicates items', () => {
  const items = ['a', 'b', 'c', 'd', 'e'];
  const shuffled = deterministicShuffle(items, 42);
  assert.deepEqual([...shuffled].sort(), [...items].sort());
});

test('malformed authoring is rejected: too few expressions', () => {
  const errors = validateExpressionMeaningQuestion({ expressions: [{ id: 'a', expression: 'x', unit: 'u', contextMeaning: 'c', mathRole: 'm' }] });
  assert.ok(errors.some((message) => /at least two/.test(message)));
});

test('malformed authoring is rejected: choice bank missing the authored answer', () => {
  const errors = validateExpressionMeaningQuestion({
    expressions: question.expressions,
    choiceBanks: {
      units: ['minutes', 'seconds'],
      contextMeanings: question.choiceBanks.contextMeanings,
      mathRoles: question.choiceBanks.mathRoles,
    },
  });
  assert.ok(errors.some((message) => /choiceBanks\.units is missing the authored answer/.test(message)));
});

test('malformed authoring is rejected: duplicate expression ids', () => {
  const errors = validateExpressionMeaningQuestion({
    expressions: [
      { id: 'dup', expression: 'x', unit: 'u', contextMeaning: 'c', mathRole: 'm' },
      { id: 'dup', expression: 'y', unit: 'u2', contextMeaning: 'c2', mathRole: 'm2' },
    ],
    choiceBanks: { units: ['u', 'u2'], contextMeanings: ['c', 'c2'], mathRoles: ['m', 'm2'] },
  });
  assert.ok(errors.some((message) => /used more than once/.test(message)));
});

test('a well-formed question has no validation errors', () => {
  assert.deepEqual(validateExpressionMeaningQuestion(question), []);
});
