import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generatePathInstance } from '../../functions/shared/pathQuestionGeneration.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..');
const bankFile = path.join(repoRoot, 'drafts', 'ccmr-v2.1', 'tsia2', 'geometricSpatial', 'TSIA2_NATIVE_transformationsCongruenceSimilaritySymmetry.v2.1.json');
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
    case 'translatePoint':
      assert.equal(scope.xOut, scope.x + scope.dx);
      assert.equal(scope.yOut, scope.y + scope.dy);
      break;
    case 'reflectYAxisPoint':
      assert.equal(scope.xOut, -scope.x);
      assert.equal(scope.yOut, scope.y);
      break;
    case 'rotate90CCWPoint':
      assert.equal(scope.xOut, -scope.y);
      assert.equal(scope.yOut, scope.x);
      break;
    case 'dilationPoint':
      assert.equal(scope.xOut, scope.scale * scope.x);
      assert.equal(scope.yOut, scope.scale * scope.y);
      break;
    case 'regularPolygonSymmetry':
      assert.equal(scope.answer, scope.sides);
      break;
    case 'reflectThenTranslate':
      assert.equal(scope.xOut, scope.x + scope.dx);
      assert.equal(scope.yOut, -scope.y + scope.dy);
      break;
    case 'congruentSideLength':
      assert.equal(scope.answer, scope.originalLength);
      break;
    case 'similarTrianglesMissingSide':
      assert.equal(scope.largeKnown, scope.smallKnown * scope.scale);
      assert.equal(scope.answer, scope.smallTarget * scope.scale);
      break;
    default:
      assert.fail(`Unvalidated TSIA2 taskType: ${template.taskType}`);
  }
};

test('TSIA2 transformations/congruence/similarity/symmetry bank has five direct and three independently authored challenge families', () => {
  assert.equal(bank.framework, 'tsia2');
  assert.equal(bank.domainId, 'geometricSpatial');
  assert.equal(bank.nativeSkillId, 'transformationsCongruenceSimilaritySymmetry');
  assert.equal(bank.tsia2TestScope, 'crcAndDiagnostic');
  assert.equal(bank.documents.length, 8);
  assert.equal(bank.documents.filter((doc) => doc.ccmrFamilyRole === 'direct').length, 5);
  assert.equal(bank.documents.filter((doc) => doc.ccmrFamilyRole === 'challenge').length, 3);
  assert.ok(bank.documents.filter((doc) => doc.ccmrFamilyRole === 'challenge').every((doc) => doc.ccmrAuthenticLanguage?.authoredChallenge === true));
});

test('TSIA2 transformations/congruence/similarity/symmetry bank passes 2,000 generated semantic checks', () => {
  let generated = 0;
  for (const template of bank.documents) {
    for (let sample = 0; sample < 250; sample += 1) {
      const instance = generatePathInstance(template, `tsia2-transformations-congruence-similarity-symmetry-${sample}`);
      assert.equal(instance.reason, null, `${template.id}: ${instance.reason}`);
      assertGeneratedQuestion(template, instance.question);
      assertSemantics(template, instance.parameters);
      generated += 1;
    }
  }
  assert.equal(generated, 2000);
});
