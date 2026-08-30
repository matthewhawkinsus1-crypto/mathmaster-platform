import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const mathPath = require('../../functions/lib/mathPath.js');

const TEMPLATE = {
  id: 'choice-id-hardening-probe',
  active: true,
  alignmentKeys: ['texas:A.4A'],
  familyId: 'mathmaster:A.4A:choice-id-hardening-probe',
  familyVersion: 2,
  questionType: 'response',
  activityRole: 'practice',
  difficultyBand: 2,
  dok: 1,
  calculatorPolicy: 'inherit',
  assessedConstruct: 'A.4A',
  taskType: 'interpretation',
  representation: 'symbolic',
  prompt: 'Which value equals {{n}}?',
  choices: [
    { id: 'correct', label: '{{n}}' },
    { id: 'right', label: '{{n1}}' },
    { id: 'opt-1', label: '{{n2}}' },
    { id: 'distractor', label: '{{n3}}' },
  ],
  responseFields: [{
    id: 'answer',
    inputProfile: 'choice',
    expected: 'correct',
    accepted: ['correct'],
  }],
  generator: {
    parameters: {
      n: { type: 'int', min: 2, max: 20 },
    },
    derived: {
      n1: 'n+1',
      n2: 'n+2',
      n3: 'n+3',
    },
  },
};

test('issued choices replace answer-bearing authored ids with opaque ids', async () => {
  const { question } = await mathPath.instantiateQuestion(TEMPLATE, 'opaque-probe');
  const ids = question.choices.map((choice) => choice.id);

  assert.equal(ids.length, 4);
  ids.forEach((id) => assert.match(id, /^choice_[0-9a-f]{28}$/));
  assert.ok(!ids.includes('correct'));
  assert.ok(!ids.includes('right'));
  assert.ok(!ids.includes('opt-1'));

  const expected = question.responseFields[0].expected;
  assert.match(expected, /^choice_[0-9a-f]{28}$/);
  assert.equal(ids.filter((id) => id === expected).length, 1);
  assert.deepEqual(question.responseFields[0].accepted, [expected]);
});

test('the same deterministic issue seed reproduces the same protected choices and key', async () => {
  const first = await mathPath.instantiateQuestion(TEMPLATE, 'stable-choice-seed');
  const replay = await mathPath.instantiateQuestion(TEMPLATE, 'stable-choice-seed');

  assert.deepEqual(first.question.choices, replay.question.choices);
  assert.equal(first.question.responseFields[0].expected, replay.question.responseFields[0].expected);
});

test('different issued instances do not expose one universal public key id', async () => {
  const keys = new Set();
  for (let index = 0; index < 24; index += 1) {
    // eslint-disable-next-line no-await-in-loop
    const { question } = await mathPath.instantiateQuestion(TEMPLATE, `choice-seed-${index}`);
    keys.add(question.responseFields[0].expected);
  }
  assert.ok(keys.size > 12, `only ${keys.size} public key ids across 24 issued instances`);
});

test('the sanitized browser payload contains only the protected choice ids', async () => {
  const { question } = await mathPath.instantiateQuestion(TEMPLATE, 'sanitize-choice-seed');
  const publicQuestion = mathPath.buildSanitizedQuestion(question, {
    questionInstanceId: 'qi_choice_probe',
    attemptsAllowed: 3,
    attemptsUsed: 0,
  });

  const serialized = JSON.stringify(publicQuestion);
  assert.doesNotMatch(serialized, /"correct"/);
  assert.doesNotMatch(serialized, /"right"/);
  assert.doesNotMatch(serialized, /"opt-1"/);
  publicQuestion.choices.forEach((choice) => assert.match(choice.id, /^choice_[0-9a-f]{28}$/));
  assert.equal(publicQuestion.responseFields[0].expected, undefined);
  assert.equal(publicQuestion.responseFields[0].accepted, undefined);
});

test('server grading follows the remapped key rather than the authored key', async () => {
  const { question } = await mathPath.instantiateQuestion(TEMPLATE, 'grade-choice-seed');
  const plan = await mathPath.buildIssuePlan(question);
  assert.equal(plan.issuable, true);

  const expected = question.responseFields[0].expected;
  const correct = await mathPath.gradePathToolResponse(plan.privateGrading, {
    responses: { answer: expected },
  });
  assert.equal(correct.isCorrect, true);

  const wrongId = question.choices.find((choice) => choice.id !== expected).id;
  const wrong = await mathPath.gradePathToolResponse(plan.privateGrading, {
    responses: { answer: wrongId },
  });
  assert.equal(wrong.isCorrect, false);

  const forgedOldKey = await mathPath.gradePathToolResponse(plan.privateGrading, {
    responses: { answer: 'correct' },
  });
  assert.equal(forgedOldKey.isCorrect, false);
});

test('nongenerated legacy choices are protected too', async () => {
  const nongenerated = {
    ...TEMPLATE,
    id: 'nongenerated-choice-probe',
    familyId: 'mathmaster:A.4A:nongenerated-choice-probe',
    prompt: 'Choose the accurate statement.',
    choices: [
      { id: 'correct', label: 'Statement A' },
      { id: 'wrong', label: 'Statement B' },
    ],
    responseFields: [{ id: 'answer', inputProfile: 'choice', expected: 'correct' }],
    generator: undefined,
  };

  const { question } = await mathPath.instantiateQuestion(nongenerated, 'nongenerated-seed');
  assert.equal(question.choices.some((choice) => choice.id === 'correct'), false);
  assert.match(question.responseFields[0].expected, /^choice_[0-9a-f]{28}$/);

  const plan = await mathPath.buildIssuePlan(question);
  const graded = await mathPath.gradePathToolResponse(plan.privateGrading, {
    responses: { answer: question.responseFields[0].expected },
  });
  assert.equal(graded.isCorrect, true);
});

test('top-level and field-level choices share the same protected ids', async () => {
  const both = {
    ...TEMPLATE,
    id: 'dual-choice-surface-probe',
    familyId: 'mathmaster:A.4A:dual-choice-surface-probe',
    responseFields: [{
      id: 'answer',
      inputProfile: 'choice',
      expected: 'correct',
      choices: TEMPLATE.choices,
    }],
  };

  const { question } = await mathPath.instantiateQuestion(both, 'dual-surface-seed');
  const topByLabel = new Map(question.choices.map((choice) => [choice.label, choice.id]));
  const fieldChoices = question.responseFields[0].choices;

  fieldChoices.forEach((choice) => {
    assert.equal(choice.id, topByLabel.get(choice.label), `${choice.label} drifted between choice surfaces`);
  });
  assert.ok(question.choices.some((choice) => choice.id === question.responseFields[0].expected));
});


test('every deployed Path choice key can be remapped without changing what is correct', () => {
  const seedDir = resolve(root, 'seed/pathQuestionBank');
  const files = readdirSync(seedDir).filter((name) => name.endsWith('_pathQuestionBank_seed.json')).sort();
  let checked = 0;

  for (const file of files) {
    const payload = JSON.parse(readFileSync(resolve(seedDir, file), 'utf8'));
    for (const question of payload.documents || []) {
      const choiceFields = (question.responseFields || []).filter((field) => field.inputProfile === 'choice');
      if (!choiceFields.length) continue;

      const protectedQuestion = mathPath.protectIssuedChoiceIds(question, `bank-audit|${file}|${question.id}`);
      for (const field of choiceFields) {
        const originalChoices = Array.isArray(field.choices) && field.choices.length
          ? field.choices
          : (question.choices || []);
        const originalAliases = new Set();
        originalChoices.forEach((choice) => {
          if (choice && typeof choice === 'object') {
            if (choice.id != null) originalAliases.add(String(choice.id));
            if (choice.value != null) originalAliases.add(String(choice.value));
          } else {
            originalAliases.add(String(choice));
          }
        });
        assert.ok(
          originalAliases.has(String(field.expected)),
          `${file}/${question.id}: choice key "${field.expected}" is not one of the authored choice ids/values`,
        );

        const protectedField = protectedQuestion.responseFields.find((candidate) => candidate.id === field.id);
        const protectedChoices = Array.isArray(protectedField?.choices) && protectedField.choices.length
          ? protectedField.choices
          : (protectedQuestion.choices || []);
        const protectedIds = new Set(protectedChoices.map((choice) => String(choice.id)));
        assert.ok(
          protectedIds.has(String(protectedField?.expected)),
          `${file}/${question.id}: protected key no longer points at an issued choice`,
        );
        assert.notEqual(
          String(protectedField?.expected),
          String(field.expected),
          `${file}/${question.id}: authored key leaked through protection unchanged`,
        );
        checked += 1;
      }
    }
  }

  assert.ok(checked > 100, `only checked ${checked} deployed choice fields`);
});
