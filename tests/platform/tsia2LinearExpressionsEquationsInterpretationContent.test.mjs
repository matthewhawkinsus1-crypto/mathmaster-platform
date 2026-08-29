import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generatePathInstance } from '../../functions/shared/pathQuestionGeneration.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..');
const bankFile = path.join(repoRoot, 'drafts', 'ccmr-v2.1', 'tsia2', 'quantitativeReasoning', 'TSIA2_NATIVE_linearExpressionsEquationsInterpretation.v2.1.json');
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
    case 'evaluateLinearExpression':
      assert.equal(scope.answer, scope.a * scope.x + scope.b);
      break;
    case 'combineLinearTerms':
      assert.equal(scope.coef, scope.a + scope.c);
      assert.equal(scope.constant, scope.b + scope.d);
      break;
    case 'distributeLinearExpression':
      assert.equal(scope.xCoef, scope.k * scope.a);
      assert.equal(scope.constant, scope.k * scope.b);
      break;
    case 'translateLinearRelationship':
      assert.equal(scope.total, scope.rate * scope.units + scope.fixed);
      break;
    case 'solveLinearEquation':
      assert.equal(scope.answer, (scope.c - scope.b) / scope.a);
      assert.ok(Number.isInteger(scope.answer));
      break;
    case 'solveLinearInequalityBoundary':
      assert.equal(scope.boundary, (scope.limit - scope.b) / scope.a);
      assert.ok(Number.isInteger(scope.boundary));
      assert.ok(scope.a > 0);
      break;
    case 'rearrangeLinearFormula':
      assert.equal(scope.answer, (scope.y - scope.b) / scope.a);
      assert.ok(Number.isInteger(scope.answer));
      break;
    case 'intersectionOfLinearExpressions':
      assert.equal(scope.answer, (scope.d - scope.b) / (scope.a - scope.c));
      assert.ok(Number.isInteger(scope.answer));
      assert.equal(scope.a * scope.answer + scope.b, scope.c * scope.answer + scope.d);
      break;
    default:
      assert.fail(`Unvalidated TSIA2 taskType: ${template.taskType}`);
  }
};

test('TSIA2 linear expressions/equations/inequalities bank has five direct and three independently authored challenge families', () => {
  assert.equal(bank.framework, 'tsia2');
  assert.equal(bank.domainId, 'quantitativeReasoning');
  assert.equal(bank.nativeSkillId, 'linearExpressionsEquationsInterpretation');
  assert.equal(bank.tsia2TestScope, 'crcAndDiagnostic');
  assert.equal(bank.documents.length, 8);
  assert.equal(bank.documents.filter((doc) => doc.ccmrFamilyRole === 'direct').length, 5);
  assert.equal(bank.documents.filter((doc) => doc.ccmrFamilyRole === 'challenge').length, 3);
  assert.ok(bank.documents.filter((doc) => doc.ccmrFamilyRole === 'challenge').every((doc) => doc.ccmrAuthenticLanguage?.authoredChallenge === true));
});

test('TSIA2 linear expressions/equations/inequalities bank passes 2,000 generated semantic checks', () => {
  let generated = 0;
  for (const template of bank.documents) {
    for (let sample = 0; sample < 250; sample += 1) {
      const instance = generatePathInstance(template, `tsia2-leei-semantic-${sample}`);
      assert.equal(instance.reason, null, `${template.id}: ${instance.reason}`);
      assertGeneratedQuestion(template, instance.question);
      assertSemantics(template, instance.parameters);
      generated += 1;
    }
  }
  assert.equal(generated, 2000);
});
