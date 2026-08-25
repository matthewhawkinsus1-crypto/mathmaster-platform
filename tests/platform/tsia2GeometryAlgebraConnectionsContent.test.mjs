import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generatePathInstance } from '../../functions/shared/pathQuestionGeneration.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..');
const bankFile = path.join(repoRoot, 'drafts', 'ccmr-v2.1', 'tsia2', 'geometricSpatial', 'TSIA2_NATIVE_geometryAlgebraConnections.v2.1.json');
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
    case 'midpointCoordinates':
      assert.equal(scope.x1, scope.midX - scope.dx);
      assert.equal(scope.x2, scope.midX + scope.dx);
      assert.equal(scope.y1, scope.midY - scope.dy);
      assert.equal(scope.y2, scope.midY + scope.dy);
      break;
    case 'slopeBetweenPoints':
      assert.equal(scope.x2 - scope.x1, scope.run);
      assert.equal(scope.y2 - scope.y1, scope.rise);
      break;
    case 'distanceBetweenPoints':
      assert.equal(scope.x2 - scope.x1, 3 * scope.scale);
      assert.equal(scope.y2 - scope.y1, 4 * scope.scale);
      assert.equal(scope.answer, 5 * scope.scale);
      break;
    case 'circleRadiusFromEquation':
      assert.equal(scope.r2, scope.radius * scope.radius);
      assert.equal(scope.answer, scope.radius);
      break;
    case 'coordinateTriangleArea':
      assert.equal(scope.base, scope.x2 - scope.x1);
      assert.equal(scope.answer, (scope.base * scope.height) / 2);
      break;
    case 'perpendicularSlope':
      assert.notEqual(scope.rise, scope.run);
      break;
    case 'circleEquationFromCenterRadius':
      assert.equal(scope.r2, scope.radius * scope.radius);
      assert.notEqual(scope.h, scope.k);
      break;
    case 'coordinateTriangleMissingHeight':
      assert.equal(scope.area, (scope.base * scope.answer) / 2);
      break;
    default:
      assert.fail(`Unvalidated TSIA2 taskType: ${template.taskType}`);
  }
};

test('TSIA2 geometry/algebra-connections bank has five direct and three independently authored challenge families', () => {
  assert.equal(bank.framework, 'tsia2');
  assert.equal(bank.domainId, 'geometricSpatial');
  assert.equal(bank.nativeSkillId, 'geometryAlgebraConnections');
  assert.equal(bank.tsia2TestScope, 'crcAndDiagnostic');
  assert.equal(bank.documents.length, 8);
  assert.equal(bank.documents.filter((doc) => doc.ccmrFamilyRole === 'direct').length, 5);
  assert.equal(bank.documents.filter((doc) => doc.ccmrFamilyRole === 'challenge').length, 3);
  assert.ok(bank.documents.filter((doc) => doc.ccmrFamilyRole === 'challenge').every((doc) => doc.ccmrAuthenticLanguage?.authoredChallenge === true));
});

test('TSIA2 geometry/algebra-connections bank passes 2,000 generated semantic checks', () => {
  let generated = 0;
  for (const template of bank.documents) {
    for (let sample = 0; sample < 250; sample += 1) {
      const instance = generatePathInstance(template, `tsia2-geometry-algebra-connections-${sample}`);
      assert.equal(instance.reason, null, `${template.id}: ${instance.reason}`);
      assertGeneratedQuestion(template, instance.question);
      assertSemantics(template, instance.parameters);
      generated += 1;
    }
  }
  assert.equal(generated, 2000);
});
