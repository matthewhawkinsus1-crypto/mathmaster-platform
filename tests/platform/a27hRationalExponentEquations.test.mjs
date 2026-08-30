import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

import { samplePathInstances, placeholdersUsed } from '../../functions/shared/pathQuestionGeneration.mjs';

const require = createRequire(import.meta.url);
const {
  buildSanitizedQuestion,
  buildTemplateIssuePlan,
  gradeResponse,
  privateGradingDefinition,
} = require('../../functions/lib/mathPath.js');

const entry = JSON.parse(readFileSync('drafts/fidelity-v2/algebra2/A2.7H.json', 'utf8'));

test('A2.7H solves rational-exponent equations across one, two, none, and extraneous cases', async () => {
  assert.equal(entry.standard, 'A2.7H');
  assert.equal(entry.verdict, 'REBUILD');
  assert.match(entry.certificationStatus, /solution-sets-shifted-even-odd-two-none-extraneous-repair/);
  assert.equal(entry.documents.length, 5);

  let generatedCount = 0;
  let oneSolution = 0;
  let twoSolution = 0;
  let noReal = 0;
  let extraneous = 0;
  let reversedSetAccepted = 0;
  let reversedInequalityAccepted = 0;
  let wrongSetRejected = 0;

  for (const doc of entry.documents) {
    if (doc.taskType === 'errorAnalysis') {
      assert.equal(doc.dok, 3);
      assert.equal(doc.difficultyBand, 4);
    } else {
      assert.equal(doc.dok, 2, doc.id + ' routine solve must remain DOK 2');
    }

    const plan = await buildTemplateIssuePlan(doc, { samples: 30 });
    assert.equal(plan.issuable, true, doc.id + ' is not production-issuable: ' + plan.reason);

    let specialChecked = false;
    let wrongChecked = false;

    for (const generated of samplePathInstances(doc, 45)) {
      assert.ok(generated.question, doc.id + ' failed generation: ' + generated.reason);
      const q = generated.question;
      const p = generated.parameters || {};
      const fields = Object.fromEntries((q.responseFields || []).map((field) => [field.id, field]));
      generatedCount += 1;
      assert.deepEqual([...placeholdersUsed(q)], []);
      assert.ok(fields['solution-set'], doc.id + ' must require a complete solution set');

      if (doc.id.includes('cube-root-one-solution')) {
        oneSolution += 1;
        assert.equal(Number(p.r3), Number(p.r) ** 3);
        assert.equal(Number(p.xsol), Number(p.h) + Number(p.r3));
        assert.equal(Number(p.rhs), Number(p.a) * Number(p.r) + Number(p.k));
        assert.equal(Number(fields['isolated-root'].expected), Number(p.r));
      }

      if (doc.id.includes('three-halves-one-solution')) {
        oneSolution += 1;
        assert.equal(Number(p.s2), Number(p.s) ** 2);
        assert.equal(Number(p.s3), Number(p.s) ** 3);
        assert.equal(Number(p.xsol), Number(p.h) + Number(p.s2));
        assert.equal(Number(p.rhs), Number(p.a) * Number(p.s3) + Number(p.k));
        assert.equal(fields.domain.expected, 'x>=(' + p.h + ')');
      }

      if (doc.id.includes('two-solutions')) {
        twoSolution += 1;
        assert.equal(Number(p.r2), Number(p.r) ** 2);
        assert.equal(Number(p.r3), Number(p.r) ** 3);
        assert.equal(Number(p.xlow), Number(p.h) - Number(p.r3));
        assert.equal(Number(p.xhigh), Number(p.h) + Number(p.r3));
        assert.ok(Number(p.xlow) < Number(p.xhigh));
      }

      if (doc.id.includes('no-real')) {
        noReal += 1;
        assert.equal(fields['sign-reason'].expected, 'nonnegative');
        assert.equal(fields['solution-set'].expected, '∅');
      }

      if (doc.taskType === 'errorAnalysis') {
        extraneous += 1;
        assert.equal(fields.diagnosis.expected, 'check-original');
        assert.equal(Number(p.s), 1 - Number(p.r));
        assert.equal(Number(p.c), Number(p.r) * (Number(p.r) - 1));
        assert.ok(Number(p.s) < 0);
        assert.ok(Number(p.r) > 0);
        const validLeft = Math.sqrt(Number(p.r) + Number(p.c));
        const badLeft = Math.sqrt(Number(p.s) + Number(p.c));
        assert.ok(Math.abs(validLeft - Number(p.r)) < 1e-9);
        assert.notEqual(badLeft, Number(p.s));
      }

      const grading = privateGradingDefinition(q);
      const responses = Object.fromEntries(grading.fields.map((field) => [
        field.id,
        field.expected !== undefined ? field.expected : (field.accepted && field.accepted[0]) || '',
      ]));
      const correct = await gradeResponse(grading, { responses });
      assert.equal(correct.isCorrect, true, doc.id + ' failed secure self-acceptance: ' + JSON.stringify(correct.fieldResults));

      if (!specialChecked && doc.id.includes('two-solutions')) {
        const reversed = '{ ' + p.xhigh + ', ' + p.xlow + ' }';
        const result = await gradeResponse(grading, { responses: { ...responses, 'solution-set': reversed } });
        assert.equal(result.isCorrect, true, 'finite solution-set order must not matter');
        reversedSetAccepted += 1;
        specialChecked = true;
      }

      if (!specialChecked && doc.id.includes('three-halves-one-solution')) {
        const reversed = '(' + p.h + ')<=x';
        const result = await gradeResponse(grading, { responses: { ...responses, domain: reversed } });
        assert.equal(result.isCorrect, true, 'equivalent reversed domain inequality should be accepted');
        reversedInequalityAccepted += 1;
        specialChecked = true;
      }

      if (!wrongChecked) {
        const result = await gradeResponse(grading, {
          responses: { ...responses, 'solution-set': '{999999}' },
        });
        assert.equal(result.isCorrect, false, doc.id + ' accepted a changed solution set');
        wrongSetRejected += 1;
        wrongChecked = true;
      }

      const publicQuestion = buildSanitizedQuestion(q, {
        questionInstanceId: 'qa-' + doc.id + '-' + generatedCount,
        attemptsAllowed: 3,
      });
      const publicText = JSON.stringify(publicQuestion);
      assert.equal(publicText.includes('"expected"'), false);
      assert.equal(publicText.includes('"acceptedAnswers"'), false);
    }
  }

  assert.ok(generatedCount >= 225);
  assert.ok(oneSolution >= 90);
  assert.ok(twoSolution >= 45);
  assert.ok(noReal >= 45);
  assert.ok(extraneous >= 45);
  assert.equal(reversedSetAccepted, 1);
  assert.equal(reversedInequalityAccepted, 1);
  assert.equal(wrongSetRejected, entry.documents.length);
});
