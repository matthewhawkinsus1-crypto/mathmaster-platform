import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generatePathInstance } from '../../functions/shared/pathQuestionGeneration.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..');
const bankFile = path.join(repoRoot, 'drafts', 'ccmr-v2.1', 'tsia2', 'probabilisticStatistical', 'TSIA2_NATIVE_centerSpread.v2.1.json');
const bank = JSON.parse(readFileSync(bankFile, 'utf8'));

const correctLabel = (question) => String(question.choices.find((choice) => choice.id === 'tsia2-correct')?.label);

const assertGeneratedQuestion = (template, question) => {
  assert.ok(question, `${template.id}: generation returned no question`);
  assert.equal(question.assessmentItemFormat, 'multipleChoice');
  assert.equal(question.choices.length, 4);
  assert.equal(new Set(question.choices.map((choice) => String(choice.label))).size, 4, `${template.id}: generated distractors are not unique`);
  assert.equal(question.responseFields?.[0]?.expected, 'tsia2-correct');
  assert.ok(question.choices.some((choice) => choice.id === 'tsia2-correct'));
  assert.doesNotMatch(JSON.stringify(question), /\{\{/);
};

const assertSemantics = (template, scope, question) => {
  const correct = correctLabel(question);
  switch (template.taskType) {
    case 'meanBalancedData':
      assert.equal(scope.v1 + scope.v2 + scope.v3 + scope.v4, 4 * scope.center);
      assert.equal(correct, String(scope.center));
      break;
    case 'medianFiveOrdered':
      assert.ok(scope.v1 < scope.v2 && scope.v2 < scope.median && scope.median < scope.v4 && scope.v4 < scope.v5);
      assert.equal(correct, String(scope.median));
      break;
    case 'modeFromFrequency':
      assert.notEqual(scope.modeValue, scope.other1);
      assert.notEqual(scope.modeValue, scope.other2);
      assert.notEqual(scope.other1, scope.other2);
      assert.equal(correct, String(scope.modeValue));
      break;
    case 'rangeFromData':
      assert.equal(scope.answer, scope.maxValue - scope.minValue);
      assert.equal(correct, String(scope.answer));
      break;
    case 'meanAfterAddedValue':
      assert.equal(scope.v1 + scope.v2 + scope.v3 + scope.v4, 4 * scope.center);
      assert.equal(scope.answer * 5, 4 * scope.center + scope.newValue);
      assert.equal(correct, String(scope.answer));
      break;
    case 'missingValueFromMean':
      assert.equal(scope.known1 + scope.known2 + scope.known3 + scope.answer, 4 * scope.targetMean);
      assert.equal(correct, String(scope.answer));
      break;
    case 'compareGroupMeans':
      assert.equal(scope.meanA, scope.center);
      assert.equal(scope.meanB, scope.center + scope.gap);
      assert.equal(scope.answer, scope.meanB - scope.meanA);
      assert.equal(correct, String(scope.answer));
      break;
    case 'compareSpread':
      assert.equal(scope.rangeA, 2 * scope.smallSpread);
      assert.equal(scope.rangeB, 2 * scope.largeSpread);
      assert.ok(scope.rangeB > scope.rangeA);
      assert.equal(correct, 'Group B');
      break;
    default:
      assert.fail(`Unvalidated TSIA2 taskType: ${template.taskType}`);
  }
};

test('TSIA2 center/spread bank has five direct and three independently authored challenge families', () => {
  assert.equal(bank.framework, 'tsia2');
  assert.equal(bank.domainId, 'probabilisticStatistical');
  assert.equal(bank.nativeSkillId, 'centerSpread');
  assert.equal(bank.tsia2TestScope, 'crcAndDiagnostic');
  assert.equal(bank.documents.length, 8);
  assert.equal(bank.documents.filter((doc) => doc.ccmrFamilyRole === 'direct').length, 5);
  assert.equal(bank.documents.filter((doc) => doc.ccmrFamilyRole === 'challenge').length, 3);
  assert.ok(bank.documents.filter((doc) => doc.ccmrFamilyRole === 'challenge').every((doc) => doc.ccmrAuthenticLanguage?.authoredChallenge === true));
  assert.deepEqual(new Set(bank.documents.map((doc) => doc.taskType)), new Set([
    'meanBalancedData',
    'medianFiveOrdered',
    'modeFromFrequency',
    'rangeFromData',
    'meanAfterAddedValue',
    'missingValueFromMean',
    'compareGroupMeans',
    'compareSpread',
  ]));
});

test('TSIA2 center/spread bank passes 2,000 generated semantic checks', () => {
  let generated = 0;
  for (const template of bank.documents) {
    for (let sample = 0; sample < 250; sample += 1) {
      const instance = generatePathInstance(template, `tsia2-center-spread-${sample}`);
      assert.equal(instance.reason, null, `${template.id}: ${instance.reason}`);
      assertGeneratedQuestion(template, instance.question);
      assertSemantics(template, instance.parameters, instance.question);
      generated += 1;
    }
  }
  assert.equal(generated, 2000);
});
