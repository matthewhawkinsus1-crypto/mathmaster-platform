import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generatePathInstance } from '../../functions/shared/pathQuestionGeneration.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..');
const bankFile = path.join(repoRoot, 'drafts', 'ccmr-v2.1', 'tsia2', 'algebraicReasoning', 'TSIA2_NATIVE_nonlinearExpressionsEquations.v2.1.json');
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
    case 'expandBinomialProduct':
      assert.equal(scope.middle, scope.p + scope.q);
      assert.equal(scope.constant, scope.p * scope.q);
      break;
    case 'factorMonicQuadratic':
      assert.equal(scope.sum, scope.r + scope.s);
      assert.equal(scope.product, scope.r * scope.s);
      break;
    case 'simplifyRadicalCoefficient':
      assert.equal(scope.radicand, scope.outside * scope.outside * scope.inside);
      assert.equal(scope.answer, scope.outside);
      break;
    case 'solveFactoredQuadratic':
      assert.notEqual(scope.r, scope.s);
      assert.equal(scope.answer, Math.max(scope.r, scope.s));
      break;
    case 'solveRadicalEquation':
      assert.equal(scope.answer + scope.shift, scope.n * scope.n);
      break;
    case 'factorDifferenceSquares':
      assert.equal(scope.square, scope.k * scope.k);
      break;
    case 'solveShiftedSquareEquation':
      assert.equal(scope.target, scope.a * scope.n * scope.n);
      assert.equal(scope.answer, scope.h + scope.n);
      break;
    case 'simplifySquaredBinomialDifference':
      assert.equal(scope.answerCoef, 4 * scope.p);
      break;
    default:
      assert.fail(`Unvalidated TSIA2 taskType: ${template.taskType}`);
  }
};

test('TSIA2 nonlinear-expressions/equations bank has five direct and three independently authored challenge families', () => {
  assert.equal(bank.framework, 'tsia2');
  assert.equal(bank.domainId, 'algebraicReasoning');
  assert.equal(bank.nativeSkillId, 'nonlinearExpressionsEquations');
  assert.equal(bank.tsia2TestScope, 'crcAndDiagnostic');
  assert.equal(bank.documents.length, 8);
  assert.equal(bank.documents.filter((doc) => doc.ccmrFamilyRole === 'direct').length, 5);
  assert.equal(bank.documents.filter((doc) => doc.ccmrFamilyRole === 'challenge').length, 3);
  assert.ok(bank.documents.filter((doc) => doc.ccmrFamilyRole === 'challenge').every((doc) => doc.ccmrAuthenticLanguage?.authoredChallenge === true));
});

test('TSIA2 nonlinear-expressions/equations bank passes 2,000 generated semantic checks', () => {
  let generated = 0;
  for (const template of bank.documents) {
    for (let sample = 0; sample < 250; sample += 1) {
      const instance = generatePathInstance(template, `tsia2-nee-semantic-${sample}`);
      assert.equal(instance.reason, null, `${template.id}: ${instance.reason}`);
      assertGeneratedQuestion(template, instance.question);
      assertSemantics(template, instance.parameters);
      generated += 1;
    }
  }
  assert.equal(generated, 2000);
});
