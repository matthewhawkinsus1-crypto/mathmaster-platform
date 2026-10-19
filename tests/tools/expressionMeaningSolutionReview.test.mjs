import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildExpressionMeaningReview,
  implemented,
} from '../../src/tools/shared/reviews/expressionMeaningReview.js';
import { TOOL_REVIEW_BUILDERS } from '../../src/tools/shared/reviews/index.js';
import { buildToolSolutionReviewModel } from '../../src/tools/shared/toolSolutionReview.js';
import { gradeToolWork } from '../../functions/shared/serverGrading/serverResponseGrading.mjs';
import { expressionMeaningWork } from '../../functions/shared/serverGrading/tools/expressionMeaning.mjs';
import {
  EXPRESSION_MEANING_DIMENSIONS,
  validateExpressionMeaningQuestion,
} from '../../functions/shared/toolMath/expressionMeaning/expressionMeaningMath.mjs';
import { compileAuthoringIntentV5 } from '../../src/platform/contract/authoringIntentV5Core.js';

/*
 * THE MEANING-MAP REVIEW STATES WHAT THE SHARED GRADER ACCEPTS.
 *
 * Once an expressionMeaning question is closed, its review names, for every
 * expression in the matrix, the unit, contextual meaning and mathematical
 * role to choose. Every review here is read back as the work a student
 * following it would submit: the options it names (parsed from its items, not
 * taken from the builder) are tapped in the rows it names, turned into the
 * matrix's work and graded by the shared grader the server records with
 * (gradeToolWork). That must come back correct and complete — and each named
 * option must be a button the student could actually tap (an entry of that
 * column's choice bank, exactly as written).
 */

const TOOL_ID = 'expressionMeaning';
const BANK_KEY = { unit: 'units', contextMeaning: 'contextMeanings', mathRole: 'mathRoles' };
const DIMENSION_LABEL = { unit: 'Unit', contextMeaning: 'Contextual meaning', mathRole: 'Mathematical role' };
const grade = (question, work) => gradeToolWork({ toolId: TOOL_ID, question, work });

/* ------------------------------------------------------------------ */
/* realistic questions                                                 */
/* ------------------------------------------------------------------ */

// The tool's own preview question (src/dev/MathToolsLab.jsx) and the shared
// grading tests' fixture: profit from selling t shirts after giving 3 away.
const SHIRTS = {
  type: TOOL_ID,
  questionId: 'shirts-1',
  prompt: 'A club models its profit as P = 15(t - 3) dollars. Match each piece to its unit, meaning and role.',
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

const DEPRECIATION = {
  type: TOOL_ID,
  questionId: 'car-value-1',
  prompt: 'A car is worth V = 18000 - 1500t dollars t years after it is bought.',
  expressions: [
    { id: 'start', expression: '18000', unit: 'dollars', contextMeaning: 'value of the car when it was bought', mathRole: 'y-intercept / initial value' },
    { id: 'drop', expression: '-1500', unit: 'dollars per year', contextMeaning: 'change in the car\'s value each year', mathRole: 'rate of change / slope' },
    { id: 'time', expression: 't', unit: 'years', contextMeaning: 'time since the car was bought', mathRole: 'independent variable' },
    { id: 'value', expression: 'V', unit: 'dollars', contextMeaning: 'value of the car after t years', mathRole: 'dependent variable' },
  ],
  choiceBanks: {
    units: ['dollars', 'dollars per year', 'years', 'years per dollar'],
    contextMeanings: [
      'value of the car when it was bought',
      'change in the car\'s value each year',
      'time since the car was bought',
      'value of the car after t years',
      'number of cars sold',
    ],
    mathRoles: ['y-intercept / initial value', 'rate of change / slope', 'independent variable', 'dependent variable', 'x-intercept'],
  },
};

// Bank wording differs from the authored key in case and spacing: the grader
// compares trimmed, lower-cased, space-collapsed text, so the bank option is
// the one the student taps — and the one the review must name. A currency
// amount ($40) stays prose under MathText, so it is quoted as written.
const POOL = {
  type: TOOL_ID,
  questionId: 'pool-fill-1',
  prompt: 'Filling a pool costs $40 plus 0.02 dollars per gallon: C = 0.02g + 40.',
  expressions: [
    { id: 'perGallon', expression: '0.02', unit: 'Dollars per gallon', contextMeaning: 'cost  of each gallon of water', mathRole: 'Rate of change' },
    { id: 'setup', expression: '40', unit: 'dollars', contextMeaning: 'the $40 delivery charge paid once', mathRole: 'constant term' },
  ],
  choiceBanks: {
    units: ['gallons', 'dollars per gallon', 'dollars', 'gallons per dollar'],
    contextMeanings: ['the $40 delivery charge paid once', 'cost of each gallon of water', 'gallons in the full pool'],
    mathRoles: ['constant term', 'rate of change', 'independent variable'],
  },
};

// Numeric ids (the grader reads 1 and '1' as one row) and a numeric distractor.
const SAVINGS = {
  type: TOOL_ID,
  questionId: 'savings-1',
  prompt: 'Maya has S = 120 + 35w dollars saved after w weeks.',
  expressions: [
    { id: 1, expression: '120', unit: 'dollars', contextMeaning: 'money Maya had saved before she started', mathRole: 'y-intercept / constant term' },
    { id: 2, expression: '35', unit: 'dollars per week', contextMeaning: 'money Maya adds every week', mathRole: 'rate of change / slope' },
    { id: 3, expression: 'w', unit: 'weeks', contextMeaning: 'number of weeks since she started saving', mathRole: 'independent variable' },
  ],
  choiceBanks: {
    units: ['dollars', 'dollars per week', 'weeks', 7],
    contextMeanings: [
      'money Maya had saved before she started',
      'money Maya adds every week',
      'number of weeks since she started saving',
      'total money after one year',
    ],
    mathRoles: ['y-intercept / constant term', 'rate of change / slope', 'independent variable', 'dependent variable'],
  },
};

// Authored through the teacher contract and compiled, as a teacher import is.
const compiled = compileAuthoringIntentV5({
  schemaVersion: 5,
  assignment: { title: 'What the numbers mean', courseId: 'algebra1' },
  sections: [{
    role: 'practice',
    questions: [{
      prompt: 'A phone plan costs C = 0.10m + 25 dollars for m minutes. Match each piece of the model to its unit, meaning and role.',
      studentActions: ['interpretExpressionMeaning'],
      expressions: [
        { id: 'perMinute', expression: '0.10', unit: 'dollars per minute', contextMeaning: 'cost of each minute of talk time', mathRole: 'rate of change / slope' },
        { id: 'fee', expression: '25', unit: 'dollars', contextMeaning: 'monthly fee charged before any minutes are used', mathRole: 'y-intercept / constant term' },
        { id: 'minutes', expression: 'm', unit: 'minutes', contextMeaning: 'minutes of talk time used in the month', mathRole: 'independent variable' },
        { id: 'minuteCost', expression: '0.10m', unit: 'dollars', contextMeaning: 'cost of the minutes used this month', mathRole: 'variable term' },
      ],
      choiceBanks: {
        units: ['dollars per minute', 'dollars', 'minutes', 'minutes per dollar'],
        contextMeanings: [
          'cost of each minute of talk time',
          'monthly fee charged before any minutes are used',
          'minutes of talk time used in the month',
          'cost of the minutes used this month',
          'total monthly bill',
        ],
        mathRoles: ['rate of change / slope', 'y-intercept / constant term', 'independent variable', 'variable term', 'dependent variable'],
      },
    }],
  }],
});
const fromCompiled = [];
(function walk(node) {
  if (Array.isArray(node)) node.forEach(walk);
  else if (node && typeof node === 'object') {
    if (node.type === TOOL_ID && !fromCompiled.some((seen) => seen.questionId === node.questionId)) fromCompiled.push(node);
    Object.values(node).forEach(walk);
  }
}(compiled.package));

const QUESTIONS = [
  ['shirts (tool preview)', SHIRTS],
  ['car depreciation', DEPRECIATION],
  ['pool: bank wording differs from the key', POOL],
  ['savings: numeric ids and a numeric distractor', SAVINGS],
  ['shirts with a shuffled matrix order', { ...SHIRTS, questionId: 'shirts-2', expressions: [...SHIRTS.expressions].reverse() }],
  ...fromCompiled.map((question) => [`compiled V5: ${question.questionId}`, question]),
];

/* ------------------------------------------------------------------ */
/* reading the review back as work                                      */
/* ------------------------------------------------------------------ */

const isText = (value) => typeof value === 'string' && value.trim() !== '' && !/\[object|undefined|NaN/.test(value);

const assertTextOnly = (model, label) => {
  assert.ok(model, `${label}: a review`);
  assert.deepEqual(Object.keys(model).sort(), ['items', 'note', 'steps', 'title', 'why'], `${label}: the model's keys`);
  assert.ok(isText(model.title), `${label}: title`);
  assert.ok(Array.isArray(model.items) && model.items.length > 0, `${label}: items`);
  model.items.forEach((item) => {
    assert.deepEqual(Object.keys(item).sort(), ['label', 'value'], `${label}: item keys`);
    assert.ok(isText(item.label) && isText(item.value), `${label}: item text ${JSON.stringify(item)}`);
  });
  assert.ok(Array.isArray(model.steps) && model.steps.length > 1, `${label}: steps`);
  assert.ok(model.steps.length <= 12, `${label}: every step survives textOnlyReview's cap`);
  model.steps.forEach((step) => assert.ok(isText(step), `${label}: step text ${step}`));
  assert.ok(isText(model.why), `${label}: why`);
  assert.ok(model.note === null || isText(model.note), `${label}: note`);
};

// One item per expression: "Unit: … · Contextual meaning: … · Mathematical role: …".
const picksFromItem = (item) => {
  const parts = item.value.split(' · ');
  assert.equal(parts.length, 3, `item for ${item.label}: three picks`);
  return Object.fromEntries(EXPRESSION_MEANING_DIMENSIONS.map((dimension, index) => {
    const prefix = `${DIMENSION_LABEL[dimension]}: `;
    assert.ok(parts[index].startsWith(prefix), `item for ${item.label}: ${prefix}`);
    return [dimension, parts[index].slice(prefix.length)];
  }));
};

// The bank entry a student taps for a stated option: the entry written
// exactly as the review states it (a number option reads as its digits).
const tapOption = (question, dimension, stated) => (
  question.choiceBanks[BANK_KEY[dimension]].find((entry) => String(entry) === stated)
);

// The matrix's assignments a student following the review ends with: the row
// is found by the expression the item names, each option by its exact text.
const workFromReview = (model, question) => {
  const assignments = {};
  model.items.forEach((item) => {
    const expr = question.expressions.find((entry) => String(entry.expression) === item.label);
    assert.ok(expr, `the review names a row the matrix shows: ${item.label}`);
    const picks = picksFromItem(item);
    assignments[expr.id] = Object.fromEntries(EXPRESSION_MEANING_DIMENSIONS.map((dimension) => {
      const option = tapOption(question, dimension, picks[dimension]);
      assert.notEqual(option, undefined, `${item.label}: "${picks[dimension]}" is a ${dimension} button`);
      return [dimension, option];
    }));
  });
  return expressionMeaningWork(question, assignments);
};

/* ------------------------------------------------------------------ */
/* the tests                                                           */
/* ------------------------------------------------------------------ */

test('the meaning-map review is implemented and the review index picks it up', () => {
  assert.equal(implemented, true);
  assert.equal(TOOL_REVIEW_BUILDERS.expressionMeaning, buildExpressionMeaningReview);
  assert.ok(fromCompiled.length >= 1, 'the V5 compiler still emits an expressionMeaning question');
  QUESTIONS.forEach(([label, question]) => {
    assert.deepEqual(validateExpressionMeaningQuestion(question), [], `${label}: a valid authored question`);
    const model = buildExpressionMeaningReview(question);
    assert.ok(model, `${label}: a review`);
    assert.deepEqual(buildToolSolutionReviewModel({ ...question, toolId: TOOL_ID }), model, `${label}: the index returns this model`);
  });
});

test('every realistic question gets a text-only review with one item per expression, in matrix order', () => {
  QUESTIONS.forEach(([label, question]) => {
    const model = buildExpressionMeaningReview(question);
    assertTextOnly(model, label);
    assert.deepEqual(model.items.map((item) => item.label), question.expressions.map((expr) => String(expr.expression)), `${label}: the rows`);
    assert.equal(model.steps.length, question.expressions.length + 1, `${label}: an intro and one step per row`);
  });
});

test('the work the review describes is what the shared grader marks correct and complete', () => {
  QUESTIONS.forEach(([label, question]) => {
    const model = buildExpressionMeaningReview(question);
    const verdict = grade(question, workFromReview(model, question));
    assert.equal(verdict.graded, true, `${label}: graded (${verdict.reason})`);
    assert.equal(verdict.isCorrect, true, `${label}: the stated map is correct ${JSON.stringify(verdict.parts)}`);
    assert.equal(verdict.isComplete, true, `${label}: complete`);
    assert.equal(verdict.score, 1, `${label}: full credit`);
    assert.equal(verdict.parts.length, question.expressions.length, `${label}: every row graded`);
  });
});

test('each stated pick is that row\'s own answer: moving one row\'s pick to another row is marked wrong', () => {
  QUESTIONS.forEach(([label, question]) => {
    const model = buildExpressionMeaningReview(question);
    const work = workFromReview(model, question);
    EXPRESSION_MEANING_DIMENSIONS.forEach((dimension) => {
      const [first, second] = work.selections;
      if (String(first[dimension]).toLowerCase() === String(second[dimension]).toLowerCase()) return;
      const swapped = {
        selections: [{ ...first, [dimension]: second[dimension] }, { ...second, [dimension]: first[dimension] }, ...work.selections.slice(2)],
      };
      const verdict = grade(question, swapped);
      assert.equal(verdict.isCorrect, false, `${label}: swapping the ${dimension} of the first two rows`);
      assert.equal(verdict.parts[0].isCorrect, false, `${label}: row 1 with row 2's ${dimension}`);
      assert.equal(verdict.parts[1].isCorrect, false, `${label}: row 2 with row 1's ${dimension}`);
    });
  });
});

test('the review names the bank option the student taps, not the authored spelling of the key', () => {
  const model = buildExpressionMeaningReview(POOL);
  assert.equal(model.items[0].value, 'Unit: dollars per gallon · Contextual meaning: cost of each gallon of water · Mathematical role: rate of change');
  assert.equal(model.items[1].value, 'Unit: dollars · Contextual meaning: the $40 delivery charge paid once · Mathematical role: constant term');
  const savings = buildExpressionMeaningReview(SAVINGS);
  assert.equal(savings.items[1].value, 'Unit: dollars per week · Contextual meaning: money Maya adds every week · Mathematical role: rate of change / slope');
});

test('the steps show this question\'s expressions and the options to choose for each', () => {
  QUESTIONS.forEach(([label, question]) => {
    const model = buildExpressionMeaningReview(question);
    assert.match(model.steps[0], new RegExp(`^The meaning matrix has ${question.expressions.length} rows, one for each expression\\.`), `${label}: intro`);
    model.items.forEach((item, index) => {
      const picks = picksFromItem(item);
      assert.equal(
        model.steps[index + 1],
        `For ${item.label}: it stands for “${picks.contextMeaning}”, it is measured in “${picks.unit}”, and its mathematical role is “${picks.mathRole}”. Choose those three options in its row.`,
        `${label}: the step for ${item.label}`,
      );
    });
  });
  const shirts = buildExpressionMeaningReview(SHIRTS);
  assert.equal(shirts.steps[1], 'For 15: it stands for “selling price earned for each shirt sold”, it is measured in “dollars per shirt”, and its mathematical role is “rate of change / slope”. Choose those three options in its row.');
  assert.equal(shirts.steps[3], 'For (t - 3): it stands for “shirts available to sell after three are given away”, it is measured in “shirts”, and its mathematical role is “adjusted input”. Choose those three options in its row.');
});

test('the check reads the first row back with its own stated picks, and states the grading rule', () => {
  QUESTIONS.forEach(([label, question]) => {
    const model = buildExpressionMeaningReview(question);
    const first = picksFromItem(model.items[0]);
    assert.ok(model.why.includes(`for ${model.items[0].label}: measured in “${first.unit}”, standing for “${first.contextMeaning}”, with the role “${first.mathRole}”.`), `${label}: why reads row 1`);
    assert.match(model.why, /A row counts only when all three of its choices are right, and the meaning map is correct only when every row is\.$/, `${label}: the rule`);
  });
});

test('null, empty and malformed input give null without throwing', () => {
  const hostile = {};
  Object.defineProperty(hostile, 'expressions', { get() { throw new Error('boom'); }, enumerable: true });
  const hostileBanks = { ...SHIRTS };
  Object.defineProperty(hostileBanks, 'choiceBanks', { get() { throw new Error('boom'); }, enumerable: true });
  [null, undefined, {}, [], 'expressionMeaning', 42, true, hostile, hostileBanks,
    { expressions: null }, { expressions: [] }, { expressions: [null] }, { expressions: 'x' }, { expressions: [[1, 2]] },
    { expressions: SHIRTS.expressions }, { expressions: SHIRTS.expressions, choiceBanks: null }, { expressions: SHIRTS.expressions, choiceBanks: 'units' }]
    .forEach((input, index) => {
      assert.doesNotThrow(() => buildExpressionMeaningReview(input), `input ${index}`);
      assert.equal(buildExpressionMeaningReview(input), null, `null for input ${index}`);
    });
  assert.equal(buildToolSolutionReviewModel(null), null);
  assert.equal(buildToolSolutionReviewModel({}), null);
  assert.equal(buildToolSolutionReviewModel({ toolId: TOOL_ID }), null);
  assert.equal(buildToolSolutionReviewModel({ toolId: TOOL_ID, expressions: [] }), null);
});

test('shapes the review cannot explain correctly give null', () => {
  const withRow = (index, fields) => ({
    ...SHIRTS,
    expressions: SHIRTS.expressions.map((expr, at) => (at === index ? { ...expr, ...fields } : expr)),
  });
  const withBank = (key, bank) => ({ ...SHIRTS, choiceBanks: { ...SHIRTS.choiceBanks, [key]: bank } });
  const many = (count) => ({
    ...SHIRTS,
    expressions: Array.from({ length: count }, (_, index) => ({ ...SHIRTS.expressions[index % 3], id: `row${index}`, expression: `${index + 1}t` })),
  });
  const CASES = [
    ['an answer no button carries', withBank('units', ['dollars', 'shirts', 'minutes'])],
    ['a missing choice bank', withBank('mathRoles', undefined)],
    ['an answer whose only button is 0 (never counts as chosen)', {
      ...withRow(0, { unit: 0 }), choiceBanks: { ...SHIRTS.choiceBanks, units: [0, 'dollars', 'shirts'] },
    }],
    ['a blank authored answer', withRow(1, { contextMeaning: '   ' })],
    ['an expression with no id', withRow(0, { id: undefined })],
    ['an empty id (the matrix cannot open the row)', withRow(0, { id: '' })],
    ['an id of 0 (the matrix cannot open the row)', withRow(0, { id: 0 })],
    ['an object id', withRow(0, { id: { key: 'rate' } })],
    ['two rows with one id', withRow(1, { id: 'rate' })],
    ['ids 1 and "1" (one row to the grader)', { ...SHIRTS, expressions: [{ ...SHIRTS.expressions[0], id: 1 }, { ...SHIRTS.expressions[1], id: '1' }] }],
    ['no display expression', withRow(2, { expression: '' })],
    ['an object as the display expression', withRow(2, { expression: { latex: 't-3' } })],
    ['a non-currency $ that MathText would read as math', {
      ...withRow(0, { unit: '$ per shirt' }), choiceBanks: { ...SHIRTS.choiceBanks, units: ['$ per shirt', 'dollars', 'shirts'] },
    }],
    ['LaTeX in the display expression', withRow(2, { expression: '\\left(t - 3\\right)' })],
    ['two $ amounts in one text', {
      ...withRow(1, { contextMeaning: '$15 for 3 shirts, $45 total' }),
      choiceBanks: { ...SHIRTS.choiceBanks, contextMeanings: [...SHIRTS.choiceBanks.contextMeanings, '$15 for 3 shirts, $45 total'] },
    }],
    ['more rows than the steps can hold', many(12)],
    // Only the shared grader can refuse this one: the response contract cuts
    // every string at 1000 characters, so the tapped option never arrives whole.
    ['an option longer than a submitted response can carry', {
      ...withRow(1, { contextMeaning: `the shirts given away ${'and more '.repeat(120)}` }),
      choiceBanks: { ...SHIRTS.choiceBanks, contextMeanings: [...SHIRTS.choiceBanks.contextMeanings, `the shirts given away ${'and more '.repeat(120)}`] },
    }],
  ];
  assert.ok(buildExpressionMeaningReview(many(11)), 'eleven rows still fit');
  CASES.forEach(([label, question]) => {
    assert.doesNotThrow(() => buildExpressionMeaningReview(question), label);
    assert.equal(buildExpressionMeaningReview(question), null, label);
    assert.equal(buildToolSolutionReviewModel({ ...question, toolId: TOOL_ID }), null, `${label}: no review through the index`);
  });
});
