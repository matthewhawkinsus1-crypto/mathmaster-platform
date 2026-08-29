import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generatePathInstance } from '../../functions/shared/pathQuestionGeneration.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..');
const bankFile = path.join(repoRoot, 'drafts', 'ccmr-v2.1', 'tsia2', 'geometricSpatial', 'TSIA2_NATIVE_angleTypesRelationships.v2.1.json');
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

const assertSemantics = (template, scope, question) => {
  const correct = question.choices.find((choice) => choice.id === 'tsia2-correct')?.label;
  switch (template.taskType) {
    case 'classifyAcuteAngle':
      assert.ok(scope.angle > 0 && scope.angle < 90);
      assert.equal(correct, 'acute');
      break;
    case 'classifyRightAngle':
      assert.equal(scope.angle, 90);
      assert.equal(correct, 'right');
      break;
    case 'classifyObtuseAngle':
      assert.ok(scope.angle > 90 && scope.angle < 180);
      assert.equal(correct, 'obtuse');
      break;
    case 'complementAngle':
      assert.equal(scope.answer, 90 - scope.angle);
      break;
    case 'supplementAngle':
      assert.equal(scope.answer, 180 - scope.angle);
      break;
    case 'verticalAngleSolveX':
      assert.equal(scope.knownAngle, scope.answer + scope.offset);
      break;
    case 'linearPairSolveX':
      assert.equal(2 * scope.answer + (scope.answer + scope.offset), 180);
      break;
    case 'triangleMissingAngle':
      assert.equal(scope.answer, 180 - scope.angleA - scope.angleB);
      assert.ok(scope.answer > 0);
      break;
    default:
      assert.fail(`Unvalidated TSIA2 taskType: ${template.taskType}`);
  }
};

test('TSIA2 angle-types/relationships bank has five direct and three independently authored challenge families', () => {
  assert.equal(bank.framework, 'tsia2');
  assert.equal(bank.domainId, 'geometricSpatial');
  assert.equal(bank.nativeSkillId, 'angleTypesRelationships');
  assert.equal(bank.tsia2TestScope, 'diagnosticOnly');
  assert.equal(bank.documents.length, 8);
  assert.equal(bank.documents.filter((doc) => doc.ccmrFamilyRole === 'direct').length, 5);
  assert.equal(bank.documents.filter((doc) => doc.ccmrFamilyRole === 'challenge').length, 3);
  assert.ok(bank.documents.filter((doc) => doc.ccmrFamilyRole === 'challenge').every((doc) => doc.ccmrAuthenticLanguage?.authoredChallenge === true));
});

test('TSIA2 angle-types/relationships bank passes 2,000 generated semantic checks', () => {
  let generated = 0;
  for (const template of bank.documents) {
    for (let sample = 0; sample < 250; sample += 1) {
      const instance = generatePathInstance(template, `tsia2-angle-types-relationships-${sample}`);
      assert.equal(instance.reason, null, `${template.id}: ${instance.reason}`);
      assertGeneratedQuestion(template, instance.question);
      assertSemantics(template, instance.parameters, instance.question);
      generated += 1;
    }
  }
  assert.equal(generated, 2000);
});
