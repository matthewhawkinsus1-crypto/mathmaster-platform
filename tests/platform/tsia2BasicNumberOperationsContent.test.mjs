import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generatePathInstance } from '../../functions/shared/pathQuestionGeneration.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..');
const bankFile = path.join(repoRoot, 'drafts', 'ccmr-v2.1', 'tsia2', 'quantitativeReasoning', 'TSIA2_NATIVE_basicNumberOperations.v2.1.json');
const bank = JSON.parse(readFileSync(bankFile, 'utf8'));
const EPSILON = 1e-10;
const close = (left, right) => Math.abs(Number(left) - Number(right)) < EPSILON;
const gcd = (a, b) => {
  let x = Math.abs(Math.round(a));
  let y = Math.abs(Math.round(b));
  while (y) [x, y] = [y, x % y];
  return x;
};

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
    case 'signedIntegerSum':
      assert.equal(scope.answer, scope.a + scope.b);
      break;
    case 'signedIntegerProduct':
      assert.equal(scope.answer, scope.a * scope.b);
      break;
    case 'integerDivision':
      assert.equal(scope.dividend / scope.divisor, scope.answer);
      assert.ok(Number.isInteger(scope.answer));
      break;
    case 'decimalOperation':
      assert.ok(close(scope.answer, scope.a10 / 10 + scope.b10 / 10));
      break;
    case 'fractionAddition':
      assert.equal(scope.rawNum, scope.a * scope.d + scope.c * scope.b);
      assert.equal(scope.rawDen, scope.b * scope.d);
      assert.equal(scope.g, gcd(scope.rawNum, scope.rawDen));
      assert.equal(scope.answerNum, scope.rawNum / scope.g);
      assert.equal(scope.answerDen, scope.rawDen / scope.g);
      break;
    case 'integerOrderOfOperations':
      assert.equal(scope.answer, scope.a + scope.b * scope.c);
      break;
    case 'fractionMultiplication':
      assert.equal(scope.rawNum, scope.a * scope.c);
      assert.equal(scope.rawDen, scope.b * scope.d);
      assert.equal(scope.g, gcd(scope.rawNum, scope.rawDen));
      assert.equal(scope.answerNum, scope.rawNum / scope.g);
      assert.equal(scope.answerDen, scope.rawDen / scope.g);
      break;
    case 'multiStepSignedArithmetic':
      assert.equal(scope.answer, (scope.a - scope.b) * scope.c + scope.d);
      break;
    default:
      assert.fail(`Unvalidated TSIA2 taskType: ${template.taskType}`);
  }
};

test('TSIA2 basic-number-operations bank has five direct and three independently authored challenge families', () => {
  assert.equal(bank.framework, 'tsia2');
  assert.equal(bank.domainId, 'quantitativeReasoning');
  assert.equal(bank.nativeSkillId, 'basicNumberOperations');
  assert.equal(bank.tsia2TestScope, 'diagnosticOnly');
  assert.equal(bank.documents.length, 8);
  assert.equal(bank.documents.filter((doc) => doc.ccmrFamilyRole === 'direct').length, 5);
  assert.equal(bank.documents.filter((doc) => doc.ccmrFamilyRole === 'challenge').length, 3);
  assert.ok(bank.documents.filter((doc) => doc.ccmrFamilyRole === 'challenge').every((doc) => doc.ccmrAuthenticLanguage?.authoredChallenge === true));
});

test('TSIA2 basic-number-operations bank passes 2,000 generated semantic checks', () => {
  let generated = 0;
  for (const template of bank.documents) {
    for (let sample = 0; sample < 250; sample += 1) {
      const instance = generatePathInstance(template, `tsia2-bno-semantic-${sample}`);
      assert.equal(instance.reason, null, `${template.id}: ${instance.reason}`);
      assertGeneratedQuestion(template, instance.question);
      assertSemantics(template, instance.parameters);
      generated += 1;
    }
  }
  assert.equal(generated, 2000);
});
