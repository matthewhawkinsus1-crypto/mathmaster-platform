import test from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateExpression, generatePathInstance, hasPathGenerator,
  placeholdersUsed, samplePathInstances,
} from '../../functions/shared/pathQuestionGeneration.mjs';

// Generating a real question from a template, on the server, deterministically.

const POINT_SLOPE = {
  id: 'mm_test_point-slope',
  alignmentKeys: ['texas:A.2B'],
  familyId: 'mathmaster:A.2B:point-slope',
  prompt: 'Write the equation, in slope-intercept form, of the line with slope ${{m}}$ through $({{x1}}, {{y1}})$.',
  responseFields: [{
    id: 'answer',
    inputProfile: 'equation',
    expected: 'y={{m}}x{{b|signed}}',
  }],
  solutionReview: {
    answerSummary: '$y = {{m}}x {{b|signed}}$',
    reasoning: ['Substitute $({{x1}}, {{y1}})$ into $y = {{m}}x + b$.'],
  },
  generator: {
    parameters: {
      m: { type: 'int', min: -6, max: 6, exclude: [0] },
      x1: { type: 'int', min: -5, max: 5 },
      y1: { type: 'int', min: -9, max: 9 },
    },
    derived: { b: 'y1 - m * x1' },
    constraints: ['abs(b) <= 20', 'b != 0'],
  },
};

test('the arithmetic language reads what an author would write', () => {
  assert.equal(evaluateExpression('2 + 3 * 4'), 14);
  assert.equal(evaluateExpression('(2 + 3) * 4'), 20);
  assert.equal(evaluateExpression('y1 - m * x1', { m: -3, x1: 2, y1: 5 }), 11);
  assert.equal(evaluateExpression('abs(-7)'), 7);
  assert.equal(evaluateExpression('gcd(12, 18)'), 6);
  assert.equal(evaluateExpression('max(3, 9, 1)'), 9);
  // Right-associative, as on paper.
  assert.equal(evaluateExpression('2 ^ 3 ^ 2'), 512);
});

test('a constraint is an expression that comes out 1 or 0', () => {
  assert.equal(evaluateExpression('3 <= 5'), 1);
  assert.equal(evaluateExpression('3 >= 5'), 0);
  assert.equal(evaluateExpression('m != 0', { m: 4 }), 1);
  assert.equal(evaluateExpression('m != 0', { m: 0 }), 0);
  assert.equal(evaluateExpression('a > 0 && b > 0', { a: 1, b: 2 }), 1);
  assert.equal(evaluateExpression('a > 0 && b > 0', { a: 1, b: -2 }), 0);
  assert.equal(evaluateExpression('a > 0 || b > 0', { a: -1, b: 2 }), 1);
});

test('an expression it cannot fully read is refused, never half-read', () => {
  assert.equal(evaluateExpression('2 +'), null, 'a dangling operator');
  assert.equal(evaluateExpression('(2 + 3'), null, 'an unclosed bracket');
  assert.equal(evaluateExpression('m + 1'), null, 'an unbound name');
  assert.equal(evaluateExpression('1 / 0'), null, 'division by zero');
  assert.equal(evaluateExpression('nope(3)'), null, 'an unknown function');
  assert.equal(evaluateExpression('2 3'), null, 'a trailing token');
  assert.equal(evaluateExpression(''), null);
  // Not eval: nothing outside the grammar runs.
  assert.equal(evaluateExpression('process.exit(1)'), null);
});

test('a template produces a complete question with no placeholders left', () => {
  const { question, parameters, reason } = generatePathInstance(POINT_SLOPE, 'seed-1');
  assert.equal(reason, null);
  assert.ok(question, 'a question was generated');
  assert.equal(question.generator, undefined, 'the template block does not travel to the student');
  assert.deepEqual([...placeholdersUsed(question)], [], 'nothing unsubstituted');
  assert.equal(question.id, POINT_SLOPE.id);
  assert.deepEqual(question.alignmentKeys, ['texas:A.2B']);
  // The derived intercept really is the one that makes the point lie on the line.
  assert.equal(parameters.y1, parameters.m * parameters.x1 + parameters.b);
});

test('the same seed always gives the same question', () => {
  const first = generatePathInstance(POINT_SLOPE, 'session-42|q3');
  const second = generatePathInstance(POINT_SLOPE, 'session-42|q3');
  assert.deepEqual(first.question, second.question);
  assert.deepEqual(first.parameters, second.parameters);
});

test('different seeds give different questions', () => {
  const prompts = new Set(
    Array.from({ length: 25 }, (unused, index) => generatePathInstance(POINT_SLOPE, `seed-${index}`).question?.prompt),
  );
  assert.ok(prompts.size >= 15, `only ${prompts.size} distinct questions from 25 seeds`);
});

test('the answer key is generated with the question, not left behind', () => {
  for (let index = 0; index < 20; index += 1) {
    const { question, parameters } = generatePathInstance(POINT_SLOPE, `key-${index}`);
    const expected = question.responseFields[0].expected;
    const sign = parameters.b < 0 ? '-' : '+';
    assert.equal(expected, `y=${parameters.m}x${sign} ${Math.abs(parameters.b)}`);
    assert.equal(question.solutionReview.answerSummary.includes(String(parameters.m)), true);
  }
});

test('the signed filter writes mathematics rather than "+ -4"', () => {
  const template = {
    id: 't', prompt: 'y = {{m}}x {{b|signed}}',
    generator: { parameters: { m: { type: 'int', min: 3, max: 3 }, b: { type: 'int', min: -4, max: -4 } } },
  };
  assert.equal(generatePathInstance(template, 's').question.prompt, 'y = 3x - 4');
  const positive = {
    ...template,
    generator: { parameters: { m: { type: 'int', min: 3, max: 3 }, b: { type: 'int', min: 4, max: 4 } } },
  };
  assert.equal(generatePathInstance(positive, 's').question.prompt, 'y = 3x + 4');
});

test('a placeholder standing alone keeps the value\'s own type', () => {
  const template = {
    id: 't',
    responseFields: [{ id: 'a', expected: '{{n}}' }],
    prompt: 'What is {{n}}?',
    generator: { parameters: { n: { type: 'int', min: 7, max: 7 } } },
  };
  const { question } = generatePathInstance(template, 's');
  assert.equal(question.responseFields[0].expected, 7, 'a number, not the string "7"');
  assert.equal(question.prompt, 'What is 7?', 'inside a sentence it is text');
});

test('excluded values never appear', () => {
  const template = {
    id: 't', prompt: '{{m}}',
    generator: { parameters: { m: { type: 'int', min: -2, max: 2, exclude: [0, 1] } } },
  };
  for (let index = 0; index < 60; index += 1) {
    const value = generatePathInstance(template, `x-${index}`).parameters.m;
    assert.ok(![0, 1].includes(value), `drew an excluded ${value}`);
  }
});

test('a choice parameter draws from its own list', () => {
  const template = {
    id: 't', prompt: '{{unit}}',
    generator: { parameters: { unit: { type: 'choice', values: ['litres', 'gallons'] } } },
  };
  const seen = new Set(Array.from({ length: 30 }, (unused, index) => generatePathInstance(template, `c-${index}`).question.prompt));
  assert.deepEqual([...seen].sort(), ['gallons', 'litres']);
});

// The half that keeps a broken template out of a classroom.
test('a template that cannot satisfy its own constraints is refused', () => {
  const impossible = {
    id: 't', prompt: '{{m}}',
    generator: {
      parameters: { m: { type: 'int', min: 1, max: 3 } },
      constraints: ['m > 100'],
    },
  };
  const { question, reason } = generatePathInstance(impossible, 's');
  assert.equal(question, null);
  assert.equal(reason, 'constraints_unsatisfiable');
});

test('a placeholder nobody bound is refused rather than shown to a student', () => {
  const typo = {
    id: 't', prompt: 'slope {{m}} intercept {{intercept}}',
    generator: { parameters: { m: { type: 'int', min: 1, max: 3 } } },
  };
  const { question, reason } = generatePathInstance(typo, 's');
  assert.equal(question, null);
  assert.match(reason, /^unbound_placeholders:intercept$/);
});

test('a derived value that cannot be computed is refused', () => {
  const broken = {
    id: 't', prompt: '{{b}}',
    generator: { parameters: { m: { type: 'int', min: 1, max: 3 } }, derived: { b: 'm / 0' } },
  };
  assert.equal(generatePathInstance(broken, 's').question, null);
});

test('a question with no generator passes straight through', () => {
  const plain = { id: 'p', prompt: 'Solve 2x = 8.' };
  assert.equal(hasPathGenerator(plain), false);
  const { question, parameters } = generatePathInstance(plain, 's');
  assert.deepEqual(question, plain);
  assert.equal(parameters, null);
});

test('sampling produces distinct instances for the import gate', () => {
  const samples = samplePathInstances(POINT_SLOPE, 10);
  assert.equal(samples.length, 10);
  assert.equal(samples.every((entry) => entry.question && !entry.reason), true);
  const distinct = new Set(samples.map((entry) => entry.question.prompt));
  assert.ok(distinct.size >= 6, `only ${distinct.size} distinct instances in 10 samples`);
});

test('generated choice order is deterministic for a seed and preserves the expected id', () => {
  const template = {
    id: 'choice-shuffle',
    prompt: 'Choose the value of {{n}}.',
    choices: [
      { id: 'opt-1', label: '{{n}}' },
      { id: 'opt-2', label: '{{n}} + 1' },
      { id: 'opt-3', label: '{{n}} - 1' },
      { id: 'opt-4', label: '0' },
    ],
    responseFields: [{ id: 'answer', inputProfile: 'choice', expected: 'opt-1' }],
    generator: { parameters: { n: { type: 'int', min: 2, max: 20 } } },
  };
  const first = generatePathInstance(template, 'stable-seed').question;
  const replay = generatePathInstance(template, 'stable-seed').question;
  assert.deepEqual(first.choices, replay.choices, 'a reload must keep the same option order');
  assert.equal(first.responseFields[0].expected, 'opt-1');
  assert.ok(first.choices.some((choice) => choice.id === 'opt-1'));

  const positions = new Set();
  for (let index = 0; index < 40; index += 1) {
    const question = generatePathInstance(template, `shuffle-${index}`).question;
    positions.add(question.choices.findIndex((choice) => choice.id === 'opt-1'));
  }
  assert.ok(positions.size >= 3, `correct option only appeared in ${positions.size} positions`);
});
