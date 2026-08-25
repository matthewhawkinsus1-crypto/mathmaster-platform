import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generatePathInstance } from '../../functions/shared/pathQuestionGeneration.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..');
const bankFile = path.join(repoRoot, 'drafts', 'ccmr-v2.1', 'tsia2', 'probabilisticStatistical', 'TSIA2_NATIVE_dataClassificationRepresentation.v2.1.json');
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
    case 'categoricalVariableClassification':
      assert.ok(scope.students >= 20);
      assert.equal(correct, 'Categorical');
      break;
    case 'quantitativeVariableClassification':
      assert.ok(scope.students >= 20);
      assert.equal(correct, 'Quantitative');
      break;
    case 'barGraphForCategoryCounts':
      assert.equal(scope.total, scope.countA + scope.countB + scope.countC);
      assert.equal(correct, 'Bar graph');
      break;
    case 'dotPlotForSmallNumericSet':
      assert.ok(scope.v1 < scope.v2 && scope.v2 < scope.v3 && scope.v3 < scope.v4 && scope.v4 < scope.v5);
      assert.equal(correct, 'Dot plot');
      break;
    case 'histogramForGroupedNumericData':
      assert.equal(scope.total, scope.f1 + scope.f2 + scope.f3 + scope.f4);
      assert.equal(correct, 'Histogram');
      break;
    case 'numericIdentifierClassification':
      assert.ok(scope.codeDigits >= 3 && scope.codeDigits <= 6);
      assert.equal(correct, 'Categorical');
      break;
    case 'lineGraphForTimeSeries':
      assert.ok(scope.days >= 5);
      assert.equal(correct, 'Line graph');
      break;
    case 'twoCategoricalVariables':
      assert.equal(scope.total, scope.a1 + scope.a2 + scope.b1 + scope.b2);
      assert.equal(correct, 'Both variables are categorical');
      break;
    default:
      assert.fail(`Unvalidated TSIA2 taskType: ${template.taskType}`);
  }
};

test('TSIA2 data-classification/representation bank has five direct and three independently authored challenge families', () => {
  assert.equal(bank.framework, 'tsia2');
  assert.equal(bank.domainId, 'probabilisticStatistical');
  assert.equal(bank.nativeSkillId, 'dataClassificationRepresentation');
  assert.equal(bank.tsia2TestScope, 'crcAndDiagnostic');
  assert.equal(bank.documents.length, 8);
  assert.equal(bank.documents.filter((doc) => doc.ccmrFamilyRole === 'direct').length, 5);
  assert.equal(bank.documents.filter((doc) => doc.ccmrFamilyRole === 'challenge').length, 3);
  assert.ok(bank.documents.filter((doc) => doc.ccmrFamilyRole === 'challenge').every((doc) => doc.ccmrAuthenticLanguage?.authoredChallenge === true));
  assert.deepEqual(new Set(bank.documents.map((doc) => doc.taskType)), new Set([
    'categoricalVariableClassification',
    'quantitativeVariableClassification',
    'barGraphForCategoryCounts',
    'dotPlotForSmallNumericSet',
    'histogramForGroupedNumericData',
    'numericIdentifierClassification',
    'lineGraphForTimeSeries',
    'twoCategoricalVariables',
  ]));
});

test('TSIA2 data-classification/representation bank passes 2,000 generated semantic checks', () => {
  let generated = 0;
  for (const template of bank.documents) {
    for (let sample = 0; sample < 250; sample += 1) {
      const instance = generatePathInstance(template, `tsia2-data-classification-representation-${sample}`);
      assert.equal(instance.reason, null, `${template.id}: ${instance.reason}`);
      assertGeneratedQuestion(template, instance.question);
      assertSemantics(template, instance.parameters, instance.question);
      generated += 1;
    }
  }
  assert.equal(generated, 2000);
});
