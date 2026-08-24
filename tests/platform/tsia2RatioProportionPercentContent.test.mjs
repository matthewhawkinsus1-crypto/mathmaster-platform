import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generatePathInstance } from '../../functions/shared/pathQuestionGeneration.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..');
const bankFile = path.join(repoRoot, 'drafts', 'ccmr-v2.1', 'tsia2', 'quantitativeReasoning', 'TSIA2_NATIVE_ratioProportionPercent.v2.1.json');
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
    case 'ratioPartWholeFraction':
      assert.ok(close(scope.red / scope.total, scope.red / (scope.red + scope.blue)));
      assert.notEqual(scope.red, scope.blue);
      break;
    case 'similarImageProportion':
      assert.ok(close(scope.newWidth / scope.width, scope.newHeight / scope.height));
      assert.equal(scope.newHeight, scope.height * scope.scale);
      break;
    case 'percentPollCount':
      assert.equal(scope.answer, scope.total * scope.percent / 100);
      assert.ok(Number.isInteger(scope.answer));
      break;
    case 'percentFromPart':
      assert.ok(close(scope.percent, 100 * scope.part / scope.total));
      break;
    case 'solveProportion':
      assert.ok(close(scope.a / scope.b, scope.answer / scope.c));
      break;
    case 'ratioAfterAddition':
      assert.ok(close(scope.ratioRed / scope.ratioBlue, scope.newRed / scope.blueCount));
      assert.equal(gcd(scope.ratioRed, scope.ratioBlue), 1);
      break;
    case 'nestedPercentRelationship':
      assert.ok(close(scope.answer, scope.firstPercent * scope.secondPercent / 100));
      break;
    case 'mixturePercentAfterAddition': {
      const exact = 100 * scope.concentrateCount / scope.total;
      assert.ok(close(scope.answer, Math.round(exact * 10) / 10));
      break;
    }
    default:
      assert.fail(`Unvalidated TSIA2 taskType: ${template.taskType}`);
  }
};

test('TSIA2 ratio/proportion/percent bank has five direct and three independently authored challenge families', () => {
  assert.equal(bank.framework, 'tsia2');
  assert.equal(bank.domainId, 'quantitativeReasoning');
  assert.equal(bank.nativeSkillId, 'ratioProportionPercent');
  assert.equal(bank.tsia2TestScope, 'crcAndDiagnostic');
  assert.equal(bank.documents.length, 8);
  assert.equal(bank.documents.filter((doc) => doc.ccmrFamilyRole === 'direct').length, 5);
  assert.equal(bank.documents.filter((doc) => doc.ccmrFamilyRole === 'challenge').length, 3);
  assert.ok(bank.documents.filter((doc) => doc.ccmrFamilyRole === 'challenge').every((doc) => doc.ccmrAuthenticLanguage?.authoredChallenge === true));
});

test('TSIA2 ratio/proportion/percent bank passes 2,000 generated semantic checks', () => {
  let generated = 0;
  for (const template of bank.documents) {
    for (let sample = 0; sample < 250; sample += 1) {
      const instance = generatePathInstance(template, `tsia2-rpp-semantic-${sample}`);
      assert.equal(instance.reason, null, `${template.id}: ${instance.reason}`);
      assertGeneratedQuestion(template, instance.question);
      assertSemantics(template, instance.parameters);
      generated += 1;
    }
  }
  assert.equal(generated, 2000);
});
