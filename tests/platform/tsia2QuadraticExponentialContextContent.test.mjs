import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generatePathInstance } from '../../functions/shared/pathQuestionGeneration.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..');
const bankFile = path.join(repoRoot, 'drafts', 'ccmr-v2.1', 'tsia2', 'algebraicReasoning', 'TSIA2_NATIVE_quadraticExponentialContext.v2.1.json');
const bank = JSON.parse(readFileSync(bankFile, 'utf8'));
const EPSILON = 1e-9;
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
    case 'quadraticModelValue':
      assert.equal(scope.answer, scope.a * scope.x * scope.x + scope.c);
      break;
    case 'quadraticVertexContext':
      assert.equal(scope.answer, scope.k);
      assert.equal(scope.vertexX, scope.h);
      break;
    case 'exponentialGrowthContext':
      assert.ok(close(scope.answer, scope.initial * (scope.factor ** scope.periods)));
      break;
    case 'exponentialDecayContext':
      assert.ok(close(scope.answer, scope.initial * (scope.factor ** scope.periods)));
      break;
    case 'identifyExponentialFactor':
      assert.ok(close(scope.next, scope.start * scope.factor));
      assert.ok(close(scope.after, scope.next * scope.factor));
      assert.ok(close(scope.answer, scope.factor));
      break;
    case 'quadraticContextEquation':
      assert.equal(scope.target, scope.answer * (scope.answer + scope.extra));
      assert.ok(scope.answer > 0);
      break;
    case 'compoundGrowthComparison':
      assert.ok(close(scope.firstValue, scope.firstInitial * (scope.factor ** scope.periods)));
      assert.ok(close(scope.secondValue, scope.secondInitial * (scope.factor ** scope.periods)));
      assert.ok(close(scope.answer, scope.firstValue - scope.secondValue));
      break;
    case 'quadraticExponentialComparison':
      assert.equal(scope.quadValue, scope.a * scope.x * scope.x + scope.c);
      assert.ok(close(scope.expValue, scope.initial * (scope.factor ** scope.x)));
      assert.ok(close(scope.answer, scope.expValue - scope.quadValue));
      break;
    default:
      assert.fail(`Unvalidated TSIA2 taskType: ${template.taskType}`);
  }
};

test('TSIA2 quadratic/exponential-context bank has five direct and three independently authored challenge families', () => {
  assert.equal(bank.framework, 'tsia2');
  assert.equal(bank.domainId, 'algebraicReasoning');
  assert.equal(bank.nativeSkillId, 'quadraticExponentialContext');
  assert.equal(bank.tsia2TestScope, 'crcAndDiagnostic');
  assert.equal(bank.documents.length, 8);
  assert.equal(bank.documents.filter((doc) => doc.ccmrFamilyRole === 'direct').length, 5);
  assert.equal(bank.documents.filter((doc) => doc.ccmrFamilyRole === 'challenge').length, 3);
  assert.ok(bank.documents.filter((doc) => doc.ccmrFamilyRole === 'challenge').every((doc) => doc.ccmrAuthenticLanguage?.authoredChallenge === true));
});

test('TSIA2 quadratic/exponential-context bank passes 2,000 generated semantic checks', () => {
  let generated = 0;
  for (const template of bank.documents) {
    for (let sample = 0; sample < 250; sample += 1) {
      const instance = generatePathInstance(template, `tsia2-qe-context-semantic-${sample}`);
      assert.equal(instance.reason, null, `${template.id}: ${instance.reason}`);
      assertGeneratedQuestion(template, instance.question);
      assertSemantics(template, instance.parameters);
      generated += 1;
    }
  }
  assert.equal(generated, 2000);
});
