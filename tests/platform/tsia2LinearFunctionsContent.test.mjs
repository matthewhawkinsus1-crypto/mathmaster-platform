import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generatePathInstance } from '../../functions/shared/pathQuestionGeneration.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..');
const bankFile = path.join(repoRoot, 'drafts', 'ccmr-v2.1', 'tsia2', 'algebraicReasoning', 'TSIA2_NATIVE_linearFunctions.v2.1.json');
const bank = JSON.parse(readFileSync(bankFile, 'utf8'));
const EPSILON = 1e-10;
const close = (left, right) => Math.abs(Number(left) - Number(right)) < EPSILON;

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
    case 'evaluateLinearFunction':
      assert.equal(scope.answer, scope.m * scope.x + scope.b);
      break;
    case 'slopeFromTwoPoints':
      assert.equal(scope.y1, scope.m * scope.x1 + scope.b);
      assert.equal(scope.y2, scope.m * scope.x2 + scope.b);
      assert.ok(close(scope.answer, (scope.y2 - scope.y1) / (scope.x2 - scope.x1)));
      break;
    case 'yInterceptFromLinearEquation':
      assert.equal(scope.answer, scope.b);
      break;
    case 'equationFromPointSlope':
      assert.equal(scope.b, scope.y1 - scope.m * scope.x1);
      assert.equal(scope.y1, scope.m * scope.x1 + scope.b);
      break;
    case 'linearTableRule':
      assert.equal(scope.y0, scope.m * scope.x0 + scope.b);
      assert.equal(scope.y1, scope.m * scope.x1 + scope.b);
      assert.equal(scope.y2, scope.m * scope.x2 + scope.b);
      break;
    case 'functionInputFromOutput':
      assert.equal(scope.target, scope.m * scope.answer + scope.b);
      assert.equal(scope.answer, (scope.target - scope.b) / scope.m);
      break;
    case 'rateInterpretationContext':
      assert.equal(scope.answer, scope.rate * scope.delta);
      assert.equal(scope.endValue - scope.startValue, scope.answer);
      break;
    case 'extrapolateLinearFunction':
      assert.equal(scope.y1, scope.m * scope.x1 + scope.b);
      assert.equal(scope.y2, scope.m * scope.x2 + scope.b);
      assert.equal(scope.answer, scope.m * scope.x3 + scope.b);
      break;
    default:
      assert.fail(`Unvalidated TSIA2 taskType: ${template.taskType}`);
  }
};

test('TSIA2 linear-functions bank has five direct and three independently authored challenge families', () => {
  assert.equal(bank.framework, 'tsia2');
  assert.equal(bank.domainId, 'algebraicReasoning');
  assert.equal(bank.nativeSkillId, 'linearFunctions');
  assert.equal(bank.tsia2TestScope, 'crcAndDiagnostic');
  assert.equal(bank.documents.length, 8);
  assert.equal(bank.documents.filter((doc) => doc.ccmrFamilyRole === 'direct').length, 5);
  assert.equal(bank.documents.filter((doc) => doc.ccmrFamilyRole === 'challenge').length, 3);
  assert.ok(bank.documents.filter((doc) => doc.ccmrFamilyRole === 'challenge').every((doc) => doc.ccmrAuthenticLanguage?.authoredChallenge === true));
});

test('TSIA2 linear-functions bank passes 2,000 generated semantic checks', () => {
  let generated = 0;
  for (const template of bank.documents) {
    for (let sample = 0; sample < 250; sample += 1) {
      const instance = generatePathInstance(template, `tsia2-lf-semantic-${sample}`);
      assert.equal(instance.reason, null, `${template.id}: ${instance.reason}`);
      assertGeneratedQuestion(template, instance.question);
      assertSemantics(template, instance.parameters);
      generated += 1;
    }
  }
  assert.equal(generated, 2000);
});
