import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generatePathInstance } from '../../functions/shared/pathQuestionGeneration.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..');
const bankFile = path.join(repoRoot, 'drafts', 'ccmr-v2.1', 'tsia2', 'algebraicReasoning', 'TSIA2_NATIVE_linearEquationsInequalitiesSystems.v2.1.json');
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
    case 'solveTwoStepLinearEquation':
      assert.equal(scope.c, scope.a * scope.answer + scope.b);
      assert.equal(scope.answer, (scope.c - scope.b) / scope.a);
      break;
    case 'solveVariableBothSides':
      assert.equal(scope.a * scope.answer + scope.b, scope.c * scope.answer + scope.d);
      assert.equal(scope.answer, (scope.d - scope.b) / (scope.a - scope.c));
      break;
    case 'negativeCoefficientInequality':
      assert.ok(scope.a < 0);
      assert.ok(close(scope.boundary, (scope.limit - scope.b) / scope.a));
      break;
    case 'solveSystemSumDifference':
      assert.equal(scope.sum, scope.x + scope.y);
      assert.equal(scope.diff, scope.x - scope.y);
      break;
    case 'solveSystemElimination':
      assert.equal(scope.c1, scope.a * scope.x + scope.b * scope.y);
      assert.equal(scope.c2, scope.a * scope.x - scope.b * scope.y);
      assert.ok(close(scope.x, (scope.c1 + scope.c2) / (2 * scope.a)));
      break;
    case 'contextLinearEquation':
      assert.equal(scope.total, scope.fixed + scope.rate * scope.answer);
      break;
    case 'contextSystemTickets':
      assert.equal(scope.totalCount, scope.adultCount + scope.studentCount);
      assert.equal(scope.revenue, scope.adultPrice * scope.adultCount + scope.studentPrice * scope.studentCount);
      break;
    case 'inequalityContextMaximumInteger':
      assert.equal(scope.answer, Math.floor((scope.budget - scope.fixed) / scope.rate));
      assert.ok(scope.fixed + scope.rate * scope.answer <= scope.budget);
      assert.ok(scope.fixed + scope.rate * (scope.answer + 1) > scope.budget);
      break;
    default:
      assert.fail(`Unvalidated TSIA2 taskType: ${template.taskType}`);
  }
};

test('TSIA2 linear-equations/inequalities/systems bank has five direct and three independently authored challenge families', () => {
  assert.equal(bank.framework, 'tsia2');
  assert.equal(bank.domainId, 'algebraicReasoning');
  assert.equal(bank.nativeSkillId, 'linearEquationsInequalitiesSystems');
  assert.equal(bank.tsia2TestScope, 'crcAndDiagnostic');
  assert.equal(bank.documents.length, 8);
  assert.equal(bank.documents.filter((doc) => doc.ccmrFamilyRole === 'direct').length, 5);
  assert.equal(bank.documents.filter((doc) => doc.ccmrFamilyRole === 'challenge').length, 3);
  assert.ok(bank.documents.filter((doc) => doc.ccmrFamilyRole === 'challenge').every((doc) => doc.ccmrAuthenticLanguage?.authoredChallenge === true));
});

test('TSIA2 linear-equations/inequalities/systems bank passes 2,000 generated semantic checks', () => {
  let generated = 0;
  for (const template of bank.documents) {
    for (let sample = 0; sample < 250; sample += 1) {
      const instance = generatePathInstance(template, `tsia2-leis-semantic-${sample}`);
      assert.equal(instance.reason, null, `${template.id}: ${instance.reason}`);
      assertGeneratedQuestion(template, instance.question);
      assertSemantics(template, instance.parameters);
      generated += 1;
    }
  }
  assert.equal(generated, 2000);
});
