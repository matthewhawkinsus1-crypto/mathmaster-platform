import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generatePathInstance } from '../../functions/shared/pathQuestionGeneration.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..');
const bankFile = path.join(repoRoot, 'drafts', 'ccmr-v2.1', 'tsia2', 'probabilisticStatistical', 'TSIA2_NATIVE_dataAnalysisConclusions.v2.1.json');
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
    case 'largestCategoryConclusion':
      assert.ok(scope.countA > scope.countB && scope.countA > scope.countC);
      assert.equal(correct, 'Category A had the greatest frequency');
      break;
    case 'differenceFromTable':
      assert.equal(scope.answer, scope.groupA - scope.groupB);
      assert.ok(scope.answer > 0);
      assert.equal(correct, String(scope.answer));
      break;
    case 'percentFromData':
      assert.equal(scope.total, 4 * scope.scale);
      assert.equal(scope.favorable, scope.scale);
      assert.equal(scope.percent, 25);
      assert.equal(correct, '25%');
      break;
    case 'trendFromTimeSeries':
      assert.equal(scope.last, scope.first + 4 * scope.change);
      assert.ok(scope.change > 0);
      assert.equal(correct, 'The values increased overall');
      break;
    case 'associationFromTwoWayTable':
      assert.equal(scope.rateA, scope.successA * scope.commonScale);
      assert.equal(scope.rateB, scope.successB * scope.commonScale);
      assert.ok(scope.rateA > scope.rateB);
      assert.equal(correct, 'Success was more common in Group A than in Group B');
      break;
    case 'evaluateOvergeneralizedClaim':
      assert.ok(scope.sampleSize >= 30);
      assert.equal(correct, 'The sample result alone does not justify a claim about every person in the population');
      break;
    case 'compareRatesNotCounts':
      assert.equal(scope.successA * scope.totalB, scope.successB * scope.totalA + scope.advantage);
      assert.ok(scope.advantage > 0);
      assert.equal(correct, 'Group A had the greater success rate');
      break;
    case 'associationNotCausation':
      assert.ok(scope.sampleSize >= 40);
      assert.equal(correct, 'The data show an association, but they do not establish that one variable caused the other');
      break;
    default:
      assert.fail(`Unvalidated TSIA2 taskType: ${template.taskType}`);
  }
};

test('TSIA2 data-analysis/conclusions bank has five direct and three independently authored challenge families', () => {
  assert.equal(bank.framework, 'tsia2');
  assert.equal(bank.domainId, 'probabilisticStatistical');
  assert.equal(bank.nativeSkillId, 'dataAnalysisConclusions');
  assert.equal(bank.tsia2TestScope, 'crcAndDiagnostic');
  assert.equal(bank.documents.length, 8);
  assert.equal(bank.documents.filter((doc) => doc.ccmrFamilyRole === 'direct').length, 5);
  assert.equal(bank.documents.filter((doc) => doc.ccmrFamilyRole === 'challenge').length, 3);
  assert.ok(bank.documents.filter((doc) => doc.ccmrFamilyRole === 'challenge').every((doc) => doc.ccmrAuthenticLanguage?.authoredChallenge === true));
  assert.deepEqual(new Set(bank.documents.map((doc) => doc.taskType)), new Set([
    'largestCategoryConclusion',
    'differenceFromTable',
    'percentFromData',
    'trendFromTimeSeries',
    'associationFromTwoWayTable',
    'evaluateOvergeneralizedClaim',
    'compareRatesNotCounts',
    'associationNotCausation',
  ]));
});

test('TSIA2 data-analysis/conclusions bank passes 2,000 generated semantic checks', () => {
  let generated = 0;
  for (const template of bank.documents) {
    for (let sample = 0; sample < 250; sample += 1) {
      const instance = generatePathInstance(template, `tsia2-data-analysis-conclusions-${sample}`);
      assert.equal(instance.reason, null, `${template.id}: ${instance.reason}`);
      assertGeneratedQuestion(template, instance.question);
      assertSemantics(template, instance.parameters, instance.question);
      generated += 1;
    }
  }
  assert.equal(generated, 2000);
});
