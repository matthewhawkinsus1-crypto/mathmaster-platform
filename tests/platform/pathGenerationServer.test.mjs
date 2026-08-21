import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const mathPath = require('../../functions/lib/mathPath.js');

// The server half of generation: a template becomes a question, the question is
// graded against the answer that was generated with it, and a broken template
// is refused at import rather than in a classroom.

const POINT_SLOPE_TEMPLATE = {
  id: 'mm_test_gen_point-slope',
  active: true,
  alignmentKeys: ['texas:A.2B'],
  courseId: 'algebra1',
  familyId: 'mathmaster:A.2B:point-slope-generated',
  questionType: 'response',
  prompt: 'Write the equation, in slope-intercept form, of the line with slope ${{m}}$ through $({{x1}}, {{y1}})$.',
  responseFields: [{
    id: 'answer',
    label: 'Answer',
    inputProfile: 'equation',
    expected: 'y={{m}}x{{b|signed}}',
  }],
  solutionReview: {
    headline: 'Substitute the point to find the missing intercept.',
    reasoning: ['Start from $y = {{m}}x + b$ and substitute $({{x1}}, {{y1}})$.'],
    answerSummary: '$y = {{m}}x {{b|signed}}$',
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

test('a template becomes a real question the server can issue', async () => {
  const { question, parameters } = await mathPath.instantiateQuestion(POINT_SLOPE_TEMPLATE, 'session-1|qi-1');
  assert.ok(question, 'an instance was produced');
  assert.equal(question.prompt.includes('{{'), false, 'no placeholder survived');
  const plan = await mathPath.buildIssuePlan(question);
  assert.equal(plan.issuable, true, plan.reason || '');
  assert.ok(parameters.m !== 0);
});

test('the generated answer is the one the server grades against', async () => {
  for (let index = 0; index < 15; index += 1) {
    // eslint-disable-next-line no-await-in-loop
    const { question, parameters } = await mathPath.instantiateQuestion(POINT_SLOPE_TEMPLATE, `s|${index}`);
    const grading = mathPath.privateGradingDefinition(question);
    const correct = `y = ${parameters.m}x + ${parameters.b}`;
    // eslint-disable-next-line no-await-in-loop
    const right = await mathPath.gradeResponse(grading, { responses: { answer: correct } });
    assert.equal(right.isCorrect, true, `${correct} should be correct for m=${parameters.m} b=${parameters.b}`);
    // eslint-disable-next-line no-await-in-loop
    const wrong = await mathPath.gradeResponse(grading, { responses: { answer: `y = ${parameters.m + 1}x + ${parameters.b}` } });
    assert.equal(wrong.isCorrect, false, 'a different slope is still wrong');
  }
});

test('the same session and instance always rebuild the same question', async () => {
  const first = await mathPath.instantiateQuestion(POINT_SLOPE_TEMPLATE, 'session-9|qi-7');
  const second = await mathPath.instantiateQuestion(POINT_SLOPE_TEMPLATE, 'session-9|qi-7');
  assert.deepEqual(first.question, second.question);
});

test('a session of five questions is five different questions', async () => {
  const prompts = new Set();
  for (let index = 0; index < 5; index += 1) {
    // eslint-disable-next-line no-await-in-loop
    const { question } = await mathPath.instantiateQuestion(POINT_SLOPE_TEMPLATE, `session-3|qi-${index}`);
    prompts.add(question.prompt);
  }
  // The whole point: the bank holds one record and the student meets five
  // different questions, where before it held five records and they were the
  // only five that would ever exist.
  assert.ok(prompts.size >= 4, `only ${prompts.size} distinct questions in a five-question session`);
});

test('the import gate validates a template by generating from it', async () => {
  const plan = await mathPath.buildTemplateIssuePlan(POINT_SLOPE_TEMPLATE);
  assert.equal(plan.issuable, true, plan.reason || '');
  assert.ok(plan.samples >= 8, 'it actually drew samples');
});

test('a template whose instances are ungradeable is refused at import', async () => {
  // Inspecting this template finds an `expected` and calls it gradeable. Only
  // generating from it reveals that every instance has an empty answer.
  const broken = {
    ...POINT_SLOPE_TEMPLATE,
    id: 'mm_test_gen_broken',
    responseFields: [{ id: 'answer', label: 'Answer', inputProfile: 'equation', expected: '{{missing}}' }],
  };
  const plan = await mathPath.buildTemplateIssuePlan(broken);
  assert.equal(plan.issuable, false);
  assert.match(plan.reason, /unbound_placeholders/);
});

test('a template that cannot satisfy its constraints is refused at import', async () => {
  const impossible = {
    ...POINT_SLOPE_TEMPLATE,
    id: 'mm_test_gen_impossible',
    generator: { ...POINT_SLOPE_TEMPLATE.generator, constraints: ['abs(b) > 500'] },
  };
  const plan = await mathPath.buildTemplateIssuePlan(impossible);
  assert.equal(plan.issuable, false);
  assert.equal(plan.reason, 'constraints_unsatisfiable');
});

test('an ordinary authored question is untouched by any of this', async () => {
  const authored = {
    id: 'mm_test_plain',
    alignmentKeys: ['texas:A.2B'],
    prompt: 'Solve $2x = 8$.',
    responseFields: [{ id: 'answer', label: 'Answer', inputProfile: 'number', expected: '4' }],
  };
  const { question, parameters } = await mathPath.instantiateQuestion(authored, 'seed');
  assert.deepEqual(question, authored, 'returned unchanged');
  assert.equal(parameters, null);
  const plan = await mathPath.buildTemplateIssuePlan(authored);
  assert.equal(plan.issuable, true);
  assert.equal(plan.samples, 0, 'nothing was sampled, because there is nothing to sample');
});

test('the parameters that produced the answer never reach the student', async () => {
  const { question } = await mathPath.instantiateQuestion(POINT_SLOPE_TEMPLATE, 'leak-check');
  const plan = await mathPath.buildIssuePlan(question);
  const sanitized = mathPath.buildSanitizedQuestion(question, {
    questionInstanceId: 'qi', attemptsAllowed: 3, attemptsUsed: 0, toolPayload: plan.toolPayload,
  });
  const wire = JSON.stringify(sanitized);
  assert.equal('generator' in sanitized, false);
  assert.equal('generatorParameters' in sanitized, false);
  assert.equal(wire.includes('expected'), false, 'the answer key does not travel');
  assert.equal(wire.includes('solutionReview'), false, 'the worked solution does not travel');
});
