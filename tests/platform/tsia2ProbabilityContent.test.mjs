import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generatePathInstance } from '../../functions/shared/pathQuestionGeneration.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..');
const bankFile = path.join(repoRoot, 'drafts', 'ccmr-v2.1', 'tsia2', 'probabilisticStatistical', 'TSIA2_NATIVE_probability.v2.1.json');
const bank = JSON.parse(readFileSync(bankFile, 'utf8'));

const assertGeneratedQuestion = (template, question) => {
  assert.ok(question, `${template.id}: generation returned no question`);
  assert.equal(question.assessmentItemFormat, 'multipleChoice');
  assert.equal(question.choices.length, 4);
  assert.equal(new Set(question.choices.map((choice) => String(choice.label))).size, 4, `${template.id}: generated distractors are not unique`);
  assert.equal(question.responseFields?.[0]?.expected, 'tsia2-correct');
  assert.ok(question.choices.some((choice) => choice.id === 'tsia2-correct'));
  assert.doesNotMatch(JSON.stringify(question), /\{\{/);
};

const correctLabel = (question) => String(question.choices.find((choice) => choice.id === 'tsia2-correct')?.label);

const assertSemantics = (template, scope, question) => {
  const correct = correctLabel(question);
  switch (template.taskType) {
    case 'simpleEventProbability':
      assert.equal(scope.total, scope.favorable + scope.other);
      assert.equal(correct, `${scope.favorable}/${scope.total}`);
      break;
    case 'complementProbabilityPercent':
      assert.equal(scope.answer, 100 - scope.eventPercent);
      assert.equal(correct, `${scope.answer}%`);
      break;
    case 'sampleSpaceCount':
      assert.equal(scope.answer, scope.firstOutcomes * scope.secondOutcomes);
      assert.equal(correct, String(scope.answer));
      break;
    case 'dieThresholdProbability':
      assert.equal(scope.favorable, 7 - scope.threshold);
      assert.ok(scope.threshold >= 2 && scope.threshold <= 6);
      assert.equal(correct, `${scope.favorable}/6`);
      break;
    case 'empiricalProbability':
      assert.equal(scope.trials, scope.successes + scope.failures);
      assert.equal(correct, `${scope.successes}/${scope.trials}`);
      break;
    case 'independentCompoundProbability':
      assert.equal(scope.answerNumerator, scope.favorableA * scope.favorableB);
      assert.equal(scope.answerDenominator, scope.totalA * scope.totalB);
      assert.equal(correct, `${scope.answerNumerator}/${scope.answerDenominator}`);
      break;
    case 'recoverFavorableCount':
      assert.equal(scope.total, scope.denominator * scope.scale);
      assert.equal(scope.answer, scope.numerator * scope.scale);
      assert.equal(correct, String(scope.answer));
      break;
    case 'withoutReplacementProbability':
      assert.equal(scope.total, scope.target + scope.other);
      assert.equal(scope.answerNumerator, scope.target * (scope.target - 1));
      assert.equal(scope.answerDenominator, scope.total * (scope.total - 1));
      assert.equal(correct, `${scope.answerNumerator}/${scope.answerDenominator}`);
      break;
    default:
      assert.fail(`Unvalidated TSIA2 taskType: ${template.taskType}`);
  }
};

test('TSIA2 probability bank has five direct and three independently authored challenge families', () => {
  assert.equal(bank.framework, 'tsia2');
  assert.equal(bank.domainId, 'probabilisticStatistical');
  assert.equal(bank.nativeSkillId, 'probability');
  assert.equal(bank.tsia2TestScope, 'crcAndDiagnostic');
  assert.equal(bank.documents.length, 8);
  assert.equal(bank.documents.filter((doc) => doc.ccmrFamilyRole === 'direct').length, 5);
  assert.equal(bank.documents.filter((doc) => doc.ccmrFamilyRole === 'challenge').length, 3);
  assert.ok(bank.documents.filter((doc) => doc.ccmrFamilyRole === 'challenge').every((doc) => doc.ccmrAuthenticLanguage?.authoredChallenge === true));
  assert.deepEqual(new Set(bank.documents.map((doc) => doc.taskType)), new Set([
    'simpleEventProbability',
    'complementProbabilityPercent',
    'sampleSpaceCount',
    'dieThresholdProbability',
    'empiricalProbability',
    'independentCompoundProbability',
    'recoverFavorableCount',
    'withoutReplacementProbability',
  ]));
});

test('TSIA2 probability bank passes 2,000 generated semantic checks', () => {
  let generated = 0;
  for (const template of bank.documents) {
    for (let sample = 0; sample < 250; sample += 1) {
      const instance = generatePathInstance(template, `tsia2-probability-${sample}`);
      assert.equal(instance.reason, null, `${template.id}: ${instance.reason}`);
      assertGeneratedQuestion(template, instance.question);
      assertSemantics(template, instance.parameters, instance.question);
      generated += 1;
    }
  }
  assert.equal(generated, 2000);
});
