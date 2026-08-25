import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generatePathInstance } from '../../functions/shared/pathQuestionGeneration.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..');
const bankFile = path.join(repoRoot, 'drafts', 'ccmr-v2.1', 'tsia2', 'probabilisticStatistical', 'TSIA2_NATIVE_sortCountData.v2.1.json');
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
    case 'sortFourAscending':
      assert.ok(scope.v1 < scope.v2 && scope.v2 < scope.v3 && scope.v3 < scope.v4);
      assert.equal(correct, `${scope.v1}, ${scope.v2}, ${scope.v3}, ${scope.v4}`);
      break;
    case 'categoryFrequencyCount':
      assert.equal(scope.answer, scope.baseCount + scope.extraCount);
      assert.equal(correct, String(scope.answer));
      break;
    case 'totalFromFrequencyTable':
      assert.equal(scope.answer, scope.f1 + scope.f2 + scope.f3);
      assert.equal(correct, String(scope.answer));
      break;
    case 'missingFrequencyFromTotal':
      assert.equal(scope.total, scope.f1 + scope.f2 + scope.answer);
      assert.equal(correct, String(scope.answer));
      break;
    case 'compareCategoryCounts':
      assert.ok(scope.countA > scope.countB);
      assert.equal(correct, 'Category A');
      break;
    case 'combineCategoryCounts':
      assert.equal(scope.answer, scope.countA + scope.countB);
      assert.equal(correct, String(scope.answer));
      break;
    case 'updatedFrequencyAfterAdditions':
      assert.equal(scope.answer, scope.original + scope.added);
      assert.equal(correct, String(scope.answer));
      break;
    case 'greatestFrequencyCategory':
      assert.ok(scope.countC > scope.countA && scope.countC > scope.countB);
      assert.equal(correct, 'Category C');
      break;
    default:
      assert.fail(`Unvalidated TSIA2 taskType: ${template.taskType}`);
  }
};

test('TSIA2 sort/count-data bank has five direct and three independently authored challenge families', () => {
  assert.equal(bank.framework, 'tsia2');
  assert.equal(bank.domainId, 'probabilisticStatistical');
  assert.equal(bank.nativeSkillId, 'sortCountData');
  assert.equal(bank.tsia2TestScope, 'diagnosticOnly');
  assert.equal(bank.documents.length, 8);
  assert.equal(bank.documents.filter((doc) => doc.ccmrFamilyRole === 'direct').length, 5);
  assert.equal(bank.documents.filter((doc) => doc.ccmrFamilyRole === 'challenge').length, 3);
  assert.ok(bank.documents.filter((doc) => doc.ccmrFamilyRole === 'challenge').every((doc) => doc.ccmrAuthenticLanguage?.authoredChallenge === true));
  assert.deepEqual(new Set(bank.documents.map((doc) => doc.taskType)), new Set([
    'sortFourAscending','categoryFrequencyCount','totalFromFrequencyTable','missingFrequencyFromTotal',
    'compareCategoryCounts','combineCategoryCounts','updatedFrequencyAfterAdditions','greatestFrequencyCategory'
  ]));
});

test('TSIA2 sort/count-data bank passes 2,000 generated semantic checks', () => {
  let generated = 0;
  for (const template of bank.documents) {
    for (let sample = 0; sample < 250; sample += 1) {
      const instance = generatePathInstance(template, `tsia2-sort-count-data-${sample}`);
      assert.equal(instance.reason, null, `${template.id}: ${instance.reason}`);
      assertGeneratedQuestion(template, instance.question);
      assertSemantics(template, instance.parameters, instance.question);
      generated += 1;
    }
  }
  assert.equal(generated, 2000);
});
