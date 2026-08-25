import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generatePathInstance } from '../../functions/shared/pathQuestionGeneration.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..');
const bankFile = path.join(repoRoot, 'drafts', 'ccmr-v2.1', 'tsia2', 'quantitativeReasoning', 'TSIA2_NATIVE_numberFormsComparison.v2.1.json');
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
    case 'fractionToDecimal':
      assert.ok(close(scope.answer, scope.num / scope.den));
      break;
    case 'decimalToPercent':
      assert.ok(close(scope.decimal, scope.n100 / 100));
      assert.ok(close(scope.answer, scope.decimal * 100));
      break;
    case 'percentToDecimal':
      assert.ok(close(scope.answer, scope.percent / 100));
      break;
    case 'fractionToPercent':
      assert.ok(close(scope.answer, 100 * scope.num / scope.den));
      break;
    case 'selectGreaterDecimalFraction':
      assert.ok(close(scope.fractionValue, scope.num / scope.den));
      assert.ok(scope.decimalValue > scope.fractionValue);
      break;
    case 'equivalentMixedForms':
      assert.ok(close(scope.decimalValue, scope.num / scope.den));
      assert.ok(close(scope.percentValue, 100 * scope.decimalValue));
      break;
    case 'orderMixedForms':
      assert.ok(scope.lowerValue < scope.middleValue);
      assert.ok(scope.middleValue < scope.upperValue);
      assert.ok(close(scope.middleValue, scope.num / scope.den));
      break;
    case 'greatestMixedForm':
      assert.ok(scope.correctValue > scope.fractionValue);
      assert.ok(scope.correctValue > scope.percentValue / 100);
      break;
    default:
      assert.fail(`Unvalidated TSIA2 taskType: ${template.taskType}`);
  }
};

test('TSIA2 number-forms/comparison bank has five direct and three independently authored challenge families', () => {
  assert.equal(bank.framework, 'tsia2');
  assert.equal(bank.domainId, 'quantitativeReasoning');
  assert.equal(bank.nativeSkillId, 'numberFormsComparison');
  assert.equal(bank.tsia2TestScope, 'diagnosticOnly');
  assert.equal(bank.documents.length, 8);
  assert.equal(bank.documents.filter((doc) => doc.ccmrFamilyRole === 'direct').length, 5);
  assert.equal(bank.documents.filter((doc) => doc.ccmrFamilyRole === 'challenge').length, 3);
  assert.ok(bank.documents.filter((doc) => doc.ccmrFamilyRole === 'challenge').every((doc) => doc.ccmrAuthenticLanguage?.authoredChallenge === true));
});

test('TSIA2 number-forms/comparison bank passes 2,000 generated semantic checks', () => {
  let generated = 0;
  for (const template of bank.documents) {
    for (let sample = 0; sample < 250; sample += 1) {
      const instance = generatePathInstance(template, `tsia2-nfc-semantic-${sample}`);
      assert.equal(instance.reason, null, `${template.id}: ${instance.reason}`);
      assertGeneratedQuestion(template, instance.question);
      assertSemantics(template, instance.parameters);
      generated += 1;
    }
  }
  assert.equal(generated, 2000);
});
