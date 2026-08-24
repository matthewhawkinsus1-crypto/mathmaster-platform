import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generatePathInstance } from '../../functions/shared/pathQuestionGeneration.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..');
const bankFile = path.join(
  repoRoot,
  'drafts',
  'ccmr-v2.1',
  'tsia2',
  'quantitativeReasoning',
  'TSIA2_NATIVE_rationalIrrationalMagnitude.v2.1.json',
);

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
    case 'greatestMixedNumber': {
      const radical = Math.sqrt(scope.radicand);
      assert.ok(radical > scope.decimal && radical > scope.half && radical > scope.below);
      break;
    }
    case 'radicalBetweenIntegers':
      assert.ok(scope.lower ** 2 < scope.radicand && scope.radicand < scope.upper ** 2);
      break;
    case 'simplifySquareFactorRadical':
      assert.ok(close(Math.sqrt(scope.outsideSquare * scope.inside), scope.a * Math.sqrt(scope.inside)));
      assert.ok(!Number.isInteger(Math.sqrt(scope.inside)));
      break;
    case 'irrationalAfterRationalShift': {
      const root = Math.sqrt(scope.nonSquare);
      assert.ok(!Number.isInteger(root));
      assert.ok(!Number.isInteger(root + scope.integer));
      break;
    }
    case 'combineLikeRadicals':
      assert.equal(scope.sum, scope.a + scope.b);
      assert.ok(close(scope.a * Math.sqrt(scope.radicand) + scope.b * Math.sqrt(scope.radicand), scope.sum * Math.sqrt(scope.radicand)));
      break;
    case 'transformedRadicalInterval':
      assert.ok(scope.value > scope.floorValue && scope.value < scope.upperValue);
      break;
    case 'balancedRadicalComparison': {
      const p = Math.sqrt(scope.n * scope.n + scope.k);
      const q = Math.sqrt(scope.n * scope.n - scope.k);
      assert.ok(2 * scope.n > p + q);
      assert.ok(2 * scope.n > p - q);
      assert.ok(2 * scope.n > q - p);
      break;
    }
    case 'conjugateRationality': {
      const root = Math.sqrt(scope.nonSquare);
      assert.ok(!Number.isInteger(root));
      const product = (root + scope.c) * (root - scope.c);
      assert.ok(close(product, scope.nonSquare - scope.c * scope.c));
      assert.ok(Number.isInteger(scope.nonSquare - scope.c * scope.c));
      break;
    }
    default:
      assert.fail(`Unvalidated TSIA2 taskType: ${template.taskType}`);
  }
};

test('TSIA2 rational/irrational magnitude bank has five direct and three independently authored challenge families', () => {
  assert.equal(bank.framework, 'tsia2');
  assert.equal(bank.domainId, 'quantitativeReasoning');
  assert.equal(bank.nativeSkillId, 'rationalIrrationalMagnitude');
  assert.equal(bank.tsia2TestScope, 'crcAndDiagnostic');
  assert.equal(bank.documents.length, 8);
  assert.equal(bank.documents.filter((doc) => doc.ccmrFamilyRole === 'direct').length, 5);
  assert.equal(bank.documents.filter((doc) => doc.ccmrFamilyRole === 'challenge').length, 3);
  assert.ok(bank.documents.filter((doc) => doc.ccmrFamilyRole === 'challenge').every((doc) => doc.ccmrAuthenticLanguage?.authoredChallenge === true));
});

test('TSIA2 rational/irrational magnitude bank passes 2,000 generated semantic checks', () => {
  let generated = 0;
  for (const template of bank.documents) {
    for (let sample = 0; sample < 250; sample += 1) {
      const instance = generatePathInstance(template, `tsia2-rim-semantic-${sample}`);
      assert.equal(instance.reason, null, `${template.id}: ${instance.reason}`);
      assertGeneratedQuestion(template, instance.question);
      assertSemantics(template, instance.parameters);
      generated += 1;
    }
  }
  assert.equal(generated, 2000);
});
