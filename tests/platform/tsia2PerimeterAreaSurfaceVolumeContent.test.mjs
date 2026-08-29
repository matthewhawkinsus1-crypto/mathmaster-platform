import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generatePathInstance } from '../../functions/shared/pathQuestionGeneration.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..');
const bankFile = path.join(repoRoot, 'drafts', 'ccmr-v2.1', 'tsia2', 'geometricSpatial', 'TSIA2_NATIVE_perimeterAreaSurfaceVolume.v2.1.json');
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

const assertSemantics = (template, scope) => {
  switch (template.taskType) {
    case 'rectanglePerimeter':
      assert.equal(scope.answer, 2 * (scope.length + scope.width));
      break;
    case 'triangleArea':
      assert.equal(scope.answer, (scope.base * scope.height) / 2);
      break;
    case 'circleCircumferenceCoefficient':
      assert.equal(scope.answerCoeff, 2 * scope.radius);
      break;
    case 'circleAreaCoefficient':
      assert.equal(scope.answerCoeff, scope.radius * scope.radius);
      break;
    case 'rectangularPrismVolume':
      assert.equal(scope.answer, scope.length * scope.width * scope.height);
      break;
    case 'rectangularPrismSurfaceArea':
      assert.equal(scope.answer, 2 * (scope.length * scope.width + scope.length * scope.height + scope.width * scope.height));
      break;
    case 'compositeRectangleArea':
      assert.equal(scope.outerLength, scope.cutLength + scope.extraLength);
      assert.equal(scope.outerWidth, scope.cutWidth + scope.extraWidth);
      assert.equal(scope.answer, scope.outerLength * scope.outerWidth - scope.cutLength * scope.cutWidth);
      break;
    case 'rectangleMissingWidth':
      assert.equal(scope.area, scope.length * scope.answer);
      break;
    default:
      assert.fail(`Unvalidated TSIA2 taskType: ${template.taskType}`);
  }
};

test('TSIA2 perimeter/area/surface-area/volume bank has five direct and three independently authored challenge families', () => {
  assert.equal(bank.framework, 'tsia2');
  assert.equal(bank.domainId, 'geometricSpatial');
  assert.equal(bank.nativeSkillId, 'perimeterAreaSurfaceVolume');
  assert.equal(bank.tsia2TestScope, 'crcAndDiagnostic');
  assert.equal(bank.documents.length, 8);
  assert.equal(bank.documents.filter((doc) => doc.ccmrFamilyRole === 'direct').length, 5);
  assert.equal(bank.documents.filter((doc) => doc.ccmrFamilyRole === 'challenge').length, 3);
  assert.ok(bank.documents.filter((doc) => doc.ccmrFamilyRole === 'challenge').every((doc) => doc.ccmrAuthenticLanguage?.authoredChallenge === true));
});

test('TSIA2 perimeter/area/surface-area/volume bank passes 2,000 generated semantic checks', () => {
  let generated = 0;
  for (const template of bank.documents) {
    for (let sample = 0; sample < 250; sample += 1) {
      const instance = generatePathInstance(template, `tsia2-perimeter-area-surface-volume-${sample}`);
      assert.equal(instance.reason, null, `${template.id}: ${instance.reason}`);
      assertGeneratedQuestion(template, instance.question);
      assertSemantics(template, instance.parameters);
      generated += 1;
    }
  }
  assert.equal(generated, 2000);
});
