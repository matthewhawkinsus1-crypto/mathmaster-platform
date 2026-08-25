import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generatePathInstance } from '../../functions/shared/pathQuestionGeneration.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..');
const bankFile = path.join(repoRoot, 'drafts', 'ccmr-v2.1', 'tsia2', 'quantitativeReasoning', 'TSIA2_NATIVE_roundingPlaceValue.v2.1.json');
const bank = JSON.parse(readFileSync(bankFile, 'utf8'));
const EPSILON = 1e-10;
const close = (left, right) => Math.abs(Number(left) - Number(right)) < EPSILON;

const assertGeneratedQuestion = (template, question) => {
  assert.ok(question, `${template.id}: generation returned no question`);
  assert.equal(question.assessmentItemFormat, 'multipleChoice');
  assert.equal(question.choices.length, 4);
  assert.equal(new Set(question.choices.map((choice) => String(choice.label))).size, 4, `${template.id}: generated distractors are not unique`);
  assert.equal(question.responseFields?.[0]?.expected, 'tsia2-correct');
  assert.ok(question.choices.some((choice) => choice.id === 'tsia2-correct'));
  assert.doesNotMatch(JSON.stringify(question), /\{\{/);
};

const assertSemantics = (template, scope) => {
  switch (template.taskType) {
    case 'roundWholeNearestTen':
      assert.equal(scope.answer, Math.round(scope.n / 10) * 10);
      break;
    case 'roundWholeNearestHundred':
      assert.equal(scope.answer, Math.round(scope.n / 100) * 100);
      break;
    case 'roundDecimalNearestTenth':
      assert.ok(close(scope.value, scope.n100 / 100));
      assert.ok(close(scope.answer, Math.round(scope.n100 / 10) / 10));
      break;
    case 'roundDecimalNearestHundredth':
      assert.ok(close(scope.value, scope.n1000 / 1000));
      assert.ok(close(scope.answer, Math.round(scope.n1000 / 10) / 100));
      break;
    case 'decimalPlaceValue':
      assert.equal(scope.value1000, scope.ones * 1000 + scope.tenths * 100 + scope.hundredths * 10 + scope.thousandths);
      assert.ok(close(scope.answer, scope.hundredths / 100));
      break;
    case 'roundSumToWhole':
      assert.ok(close(scope.sum, (scope.a10 + scope.b10) / 10));
      assert.equal(scope.answer, Math.round(scope.sum));
      break;
    case 'roundingIntervalTenth':
      assert.ok(close(Math.round(scope.value * 10) / 10, scope.target / 10));
      break;
    case 'roundScaledDecimal':
      assert.ok(close(scope.product, scope.rate100 * scope.qty / 100));
      assert.ok(close(scope.answer, Math.round(scope.product * 10) / 10));
      break;
    default:
      assert.fail(`Unvalidated TSIA2 taskType: ${template.taskType}`);
  }
};

test('TSIA2 rounding/place-value bank has five direct and three independently authored challenge families', () => {
  assert.equal(bank.framework, 'tsia2');
  assert.equal(bank.domainId, 'quantitativeReasoning');
  assert.equal(bank.nativeSkillId, 'roundingPlaceValue');
  assert.equal(bank.tsia2TestScope, 'diagnosticOnly');
  assert.equal(bank.documents.length, 8);
  assert.equal(bank.documents.filter((doc) => doc.ccmrFamilyRole === 'direct').length, 5);
  assert.equal(bank.documents.filter((doc) => doc.ccmrFamilyRole === 'challenge').length, 3);
  assert.ok(bank.documents.filter((doc) => doc.ccmrFamilyRole === 'challenge').every((doc) => doc.ccmrAuthenticLanguage?.authoredChallenge === true));
});

test('TSIA2 rounding/place-value bank passes 2,000 generated semantic checks', () => {
  let generated = 0;
  for (const template of bank.documents) {
    for (let sample = 0; sample < 250; sample += 1) {
      const instance = generatePathInstance(template, `tsia2-rpv-semantic-${sample}`);
      assert.equal(instance.reason, null, `${template.id}: ${instance.reason}`);
      assertGeneratedQuestion(template, instance.question);
      assertSemantics(template, instance.parameters);
      generated += 1;
    }
  }
  assert.equal(generated, 2000);
});
