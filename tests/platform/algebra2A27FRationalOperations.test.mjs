import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

import {
  samplePathInstances,
  placeholdersUsed,
} from '../../functions/shared/pathQuestionGeneration.mjs';

const require = createRequire(import.meta.url);
const {
  buildSanitizedQuestion,
  buildTemplateIssuePlan,
  gradeResponse,
  privateGradingDefinition,
} = require('../../functions/lib/mathPath.js');

const entry = JSON.parse(readFileSync('drafts/fidelity-v2/algebra2/A2.7F.json', 'utf8'));

test('A2.7F certifies all 12 rational-expression operation and degree breakouts', async () => {
  assert.equal(entry.verdict, 'REBUILD');
  assert.match(entry.certificationStatus, /all-12-rational-operation-degree-breakouts/);

  const requiredCoverage = new Set([
    'sum-degree1', 'sum-degree2', 'sum-mixed-degree1-degree2',
    'difference-degree1', 'difference-degree2', 'difference-mixed-degree1-degree2',
    'product-degree1', 'product-degree2', 'product-mixed-degree1-degree2',
    'quotient-degree1', 'quotient-degree2', 'quotient-mixed-degree1-degree2',
  ]);
  const authoredCoverage = new Set(
    entry.documents.flatMap((doc) => (doc.variants || []).map((variant) => variant.coverageKey)).filter(Boolean),
  );
  assert.deepEqual([...authoredCoverage].sort(), [...requiredCoverage].sort());

  let generatedCount = 0;
  let errorFamilies = 0;
  const generatedCoverage = new Set();
  const variantCoverageByFamily = new Map();
  let equivalentRationalAccepted = 0;
  let changedRationalRejected = 0;
  let changedRestrictionRejected = 0;

  for (const doc of entry.documents) {
    const plan = await buildTemplateIssuePlan(doc, { samples: 30 });
    assert.equal(plan.issuable, true, doc.id + ' is not production-issuable: ' + plan.reason);

    if (doc.taskType === 'errorAnalysis') {
      errorFamilies += 1;
      assert.equal(doc.dok, 3);
      assert.equal(doc.difficultyBand, 4);
    } else {
      assert.equal(doc.dok, 2, doc.id + ' routine rational-expression work must remain DOK 2');
    }

    const seenHere = new Set();
    let altChecked = false;
    let wrongAnswerChecked = false;
    let wrongRestrictionChecked = false;

    for (const generated of samplePathInstances(doc, doc.variants?.length ? 120 : 40)) {
      assert.ok(generated.question, doc.id + ' failed generation: ' + generated.reason);
      const q = generated.question;
      const p = generated.parameters || {};
      generatedCount += 1;
      assert.deepEqual([...placeholdersUsed(q)], []);

      if (q.coverageKey) {
        generatedCoverage.add(q.coverageKey);
        seenHere.add(q.coverageKey);
      }

      const fields = Object.fromEntries((q.responseFields || []).map((field) => [field.id, field]));
      assert.ok(fields.answer, doc.id + ' must grade a fully simplified final rational expression');
      assert.equal(fields.answer.equivalence, 'rationalExpression');
      assert.ok(fields.restrictions, doc.id + ' must separately preserve original restrictions');
      assert.equal(fields.restrictions.equivalence, 'setBuilder');

      if (String(q.coverageKey || '').startsWith('sum-')) {
        if (q.coverageKey === 'sum-degree1') {
          assert.equal(Number(p.N1), Number(p.A) + Number(p.B));
          assert.equal(Number(p.N0), -Number(p.A) * Number(p.s) - Number(p.B) * Number(p.r));
        } else if (q.coverageKey === 'sum-degree2') {
          assert.equal(Number(p.N1), Number(p.A) + Number(p.B));
          assert.equal(Number(p.N0), -Number(p.A) * Number(p.t) - Number(p.B) * Number(p.s));
        } else {
          assert.equal(Number(p.N0), -Number(p.A) * Number(p.s) + Number(p.B));
        }
      }

      if (String(q.coverageKey || '').startsWith('difference-')) {
        if (q.coverageKey === 'difference-degree1') {
          assert.equal(Number(p.N1), Number(p.A) - Number(p.B));
          assert.equal(Number(p.N0), -Number(p.A) * Number(p.s) + Number(p.B) * Number(p.r));
        } else if (q.coverageKey === 'difference-degree2') {
          assert.equal(Number(p.N1), Number(p.A) - Number(p.B));
          assert.equal(Number(p.N0), -Number(p.A) * Number(p.t) + Number(p.B) * Number(p.s));
        } else {
          assert.equal(Number(p.N0), -Number(p.A) * Number(p.s) - Number(p.B));
        }
      }

      if (String(q.coverageKey || '').startsWith('product-')) {
        assert.match(String(q.prompt), /Multiply/);
        assert.match(String(fields.restrictions.expected), /x\|x!=/);
      }

      if (String(q.coverageKey || '').startsWith('quotient-')) {
        assert.match(String(q.prompt), /Divide/);
        assert.match(String(q.solutionReview?.reasoning || ''), /divisor|reciprocal/i);
      }

      if (doc.taskType === 'errorAnalysis') {
        assert.equal(fields.diagnosis.expected, 'original-and-divisor');
        assert.match(String(fields.restrictions.expected), /x!=/);
      }

      const grading = privateGradingDefinition(q);
      const responses = Object.fromEntries(
        grading.fields.map((field) => [field.id, field.expected ?? field.accepted?.[0] ?? '']),
      );
      const correct = await gradeResponse(grading, { responses });
      assert.equal(
        correct.isCorrect,
        true,
        doc.id + ' failed secure self-acceptance: ' + JSON.stringify(correct.fieldResults),
      );

      if (!altChecked) {
        const expected = String(fields.answer.expected);
        const slash = expected.indexOf('/');
        assert.ok(slash > 0, doc.id + ' final answer must be a rational expression');
        const numerator = expected.slice(0, slash);
        const denominator = expected.slice(slash + 1);
        const scaled = '(2*(' + numerator + '))/(2*(' + denominator + '))';
        const result = await gradeResponse(grading, { responses: { ...responses, answer: scaled } });
        assert.equal(result.isCorrect, true, doc.id + ' rejected harmless rational scaling');
        equivalentRationalAccepted += 1;
        altChecked = true;
      }

      if (!wrongAnswerChecked) {
        const result = await gradeResponse(grading, {
          responses: { ...responses, answer: '((' + fields.answer.expected + ')+1)' },
        });
        assert.equal(result.isCorrect, false, doc.id + ' accepted a mathematically changed rational expression');
        changedRationalRejected += 1;
        wrongAnswerChecked = true;
      }

      if (!wrongRestrictionChecked) {
        const result = await gradeResponse(grading, {
          responses: { ...responses, restrictions: '{x|x!=999}' },
        });
        assert.equal(result.isCorrect, false, doc.id + ' accepted changed original restrictions');
        changedRestrictionRejected += 1;
        wrongRestrictionChecked = true;
      }

      const publicQ = buildSanitizedQuestion(q, {
        questionInstanceId: 'qa-' + doc.id + '-' + generatedCount,
        attemptsAllowed: 3,
      });
      const publicText = JSON.stringify(publicQ);
      assert.equal(publicText.includes('"expected"'), false);
      assert.equal(publicText.includes('"acceptedAnswers"'), false);
    }

    if (doc.variants?.length) {
      variantCoverageByFamily.set(doc.id, seenHere);
      assert.equal(seenHere.size, 3, doc.id + ' did not generate all three degree variants');
    }
  }

  assert.ok(generatedCount >= 520);
  assert.deepEqual([...generatedCoverage].sort(), [...requiredCoverage].sort());
  assert.equal(variantCoverageByFamily.size, 4);
  assert.equal(errorFamilies, 1);
  assert.equal(equivalentRationalAccepted, entry.documents.length);
  assert.equal(changedRationalRejected, entry.documents.length);
  assert.equal(changedRestrictionRejected, entry.documents.length);
});
