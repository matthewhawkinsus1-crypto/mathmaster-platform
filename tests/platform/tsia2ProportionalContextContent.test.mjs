import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generatePathInstance } from '../../functions/shared/pathQuestionGeneration.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..');
const bankFile = path.join(repoRoot, 'drafts', 'ccmr-v2.1', 'tsia2', 'quantitativeReasoning', 'TSIA2_NATIVE_proportionalContext.v2.1.json');
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
    case 'unitPriceFromPackage':
      assert.ok(close(scope.answer, scope.cost / scope.quantity));
      break;
    case 'constantSpeedDistance':
      assert.equal(scope.answer, scope.rate * scope.hours);
      break;
    case 'hourlyWageEarnings':
      assert.ok(close(scope.answer, scope.hourlyRate * scope.hours));
      break;
    case 'currencyConversion':
      assert.ok(close(scope.answer, scope.amount * scope.exchangeRate));
      break;
    case 'salesTaxTotal':
      assert.ok(close(scope.answer, scope.price * (100 + scope.taxRate) / 100));
      break;
    case 'fuelTripCost':
      assert.ok(close(scope.gallons, scope.distance / scope.milesPerGallon));
      assert.ok(close(scope.answer, scope.gallons * scope.pricePerGallon));
      break;
    case 'discountThenTax':
      assert.ok(close(scope.salePrice, scope.price * (100 - scope.discount) / 100));
      assert.ok(close(scope.answer, scope.salePrice * (100 + scope.taxRate) / 100));
      break;
    case 'scaledServiceCost':
      assert.ok(close(scope.knownCost / scope.knownHours, scope.answer / scope.newHours));
      break;
    default:
      assert.fail(`Unvalidated TSIA2 taskType: ${template.taskType}`);
  }
};

test('TSIA2 proportional-context bank has five direct and three independently authored challenge families', () => {
  assert.equal(bank.framework, 'tsia2');
  assert.equal(bank.domainId, 'quantitativeReasoning');
  assert.equal(bank.nativeSkillId, 'proportionalContext');
  assert.equal(bank.tsia2TestScope, 'crcAndDiagnostic');
  assert.equal(bank.documents.length, 8);
  assert.equal(bank.documents.filter((doc) => doc.ccmrFamilyRole === 'direct').length, 5);
  assert.equal(bank.documents.filter((doc) => doc.ccmrFamilyRole === 'challenge').length, 3);
  assert.ok(bank.documents.filter((doc) => doc.ccmrFamilyRole === 'challenge').every((doc) => doc.ccmrAuthenticLanguage?.authoredChallenge === true));
});

test('TSIA2 proportional-context bank passes 2,000 generated semantic checks', () => {
  let generated = 0;
  for (const template of bank.documents) {
    for (let sample = 0; sample < 250; sample += 1) {
      const instance = generatePathInstance(template, `tsia2-proportional-context-semantic-${sample}`);
      assert.equal(instance.reason, null, `${template.id}: ${instance.reason}`);
      assertGeneratedQuestion(template, instance.question);
      assertSemantics(template, instance.parameters);
      generated += 1;
    }
  }
  assert.equal(generated, 2000);
});
