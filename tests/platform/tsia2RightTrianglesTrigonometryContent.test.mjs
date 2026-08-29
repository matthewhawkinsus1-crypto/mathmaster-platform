import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generatePathInstance } from '../../functions/shared/pathQuestionGeneration.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..');
const bankFile = path.join(repoRoot, 'drafts', 'ccmr-v2.1', 'tsia2', 'geometricSpatial', 'TSIA2_NATIVE_rightTrianglesTrigonometry.v2.1.json');
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
    case 'pythagoreanHypotenuse':
      assert.equal(scope.legA, 3 * scope.scale);
      assert.equal(scope.legB, 4 * scope.scale);
      assert.equal(scope.answer, 5 * scope.scale);
      break;
    case 'pythagoreanDecimalHypotenuse': {
      const expected = Math.round(Math.sqrt(scope.legA ** 2 + scope.legB ** 2) * 100) / 100;
      assert.equal(scope.answer, expected);
      break;
    }
    case 'sineRatio':
      assert.equal(scope.opposite, 3 * scope.scale);
      assert.equal(scope.hypotenuse, 5 * scope.scale);
      break;
    case 'cosineRatio':
      assert.equal(scope.adjacent, 12 * scope.scale);
      assert.equal(scope.hypotenuse, 13 * scope.scale);
      break;
    case 'tangentRatio':
      assert.equal(scope.opposite, 8 * scope.scale);
      assert.equal(scope.adjacent, 15 * scope.scale);
      break;
    case 'tangentSolveSide':
      assert.equal(scope.adjacent, scope.ratioDen * scope.scale);
      assert.equal(scope.answer, scope.ratioNum * scope.scale);
      break;
    case 'sineSolveHypotenuse':
      assert.ok(scope.ratioNum < scope.ratioDen);
      assert.equal(scope.opposite, scope.ratioNum * scope.scale);
      assert.equal(scope.answer, scope.ratioDen * scope.scale);
      break;
    case 'rightTrianglePerimeter':
      assert.equal(scope.legA, 5 * scope.scale);
      assert.equal(scope.legB, 12 * scope.scale);
      assert.equal(scope.hypotenuse, 13 * scope.scale);
      assert.equal(scope.answer, 30 * scope.scale);
      break;
    default:
      assert.fail(`Unvalidated TSIA2 taskType: ${template.taskType}`);
  }
};

test('TSIA2 right-triangles/trigonometry bank has five direct and three independently authored challenge families', () => {
  assert.equal(bank.framework, 'tsia2');
  assert.equal(bank.domainId, 'geometricSpatial');
  assert.equal(bank.nativeSkillId, 'rightTrianglesTrigonometry');
  assert.equal(bank.tsia2TestScope, 'crcAndDiagnostic');
  assert.equal(bank.documents.length, 8);
  assert.equal(bank.documents.filter((doc) => doc.ccmrFamilyRole === 'direct').length, 5);
  assert.equal(bank.documents.filter((doc) => doc.ccmrFamilyRole === 'challenge').length, 3);
  assert.ok(bank.documents.filter((doc) => doc.ccmrFamilyRole === 'challenge').every((doc) => doc.ccmrAuthenticLanguage?.authoredChallenge === true));
  assert.ok(bank.documents.some((doc) => doc.examCalculatorMode === 'squareRoot'));
});

test('TSIA2 right-triangles/trigonometry bank passes 2,000 generated semantic checks', () => {
  let generated = 0;
  for (const template of bank.documents) {
    for (let sample = 0; sample < 250; sample += 1) {
      const instance = generatePathInstance(template, `tsia2-right-triangles-trigonometry-${sample}`);
      assert.equal(instance.reason, null, `${template.id}: ${instance.reason}`);
      assertGeneratedQuestion(template, instance.question);
      assertSemantics(template, instance.parameters);
      generated += 1;
    }
  }
  assert.equal(generated, 2000);
});
