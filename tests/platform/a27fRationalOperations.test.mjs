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

const restrictionValues = (value) => (
  [...String(value || '').matchAll(/x!=(-?\d+(?:\.\d+)?)/g)]
    .map((match) => Number(match[1]))
    .sort((a, b) => a - b)
);

const uniqueSorted = (values) => [...new Set(values.map(Number))].sort((a, b) => a - b);

test('A2.7F covers all twelve rational-operation degree breakouts with preserved restrictions', async () => {
  assert.equal(entry.standard, 'A2.7F');
  assert.equal(entry.verdict, 'REBUILD');
  assert.match(entry.certificationStatus, /all-12-rational-operation-degree-breakouts/);
  assert.equal(entry.documents.length, 5);

  const expectedCoverage = new Set([
    'sum-degree1',
    'sum-degree2',
    'sum-mixed-degree1-degree2',
    'difference-degree1',
    'difference-degree2',
    'difference-mixed-degree1-degree2',
    'product-degree1',
    'product-degree2',
    'product-mixed-degree1-degree2',
    'quotient-degree1',
    'quotient-degree2',
    'quotient-mixed-degree1-degree2',
  ]);
  const seen = new Set();
  let generatedCount = 0;
  let errorInstances = 0;
  let extraHoleRejected = 0;

  for (const doc of entry.documents) {
    const isError = doc.taskType === 'errorAnalysis';

    if (isError) {
      assert.equal(doc.dok, 3);
      assert.equal(doc.difficultyBand, 4);
    } else {
      assert.equal(doc.dok, 2);
      assert.equal(doc.variants.length, 3);
    }

    const issuePlan = await buildTemplateIssuePlan(doc, { samples: 36 });
    assert.equal(
      issuePlan.issuable,
      true,
      doc.id + ' is not production-issuable: ' + issuePlan.reason,
    );

    const generatedRows = samplePathInstances(doc, isError ? 40 : 90);
    for (const generated of generatedRows) {
      assert.ok(generated.question, doc.id + ' failed generation: ' + generated.reason);
      const question = generated.question;
      const p = generated.parameters || {};
      const fields = Object.fromEntries(
        (question.responseFields || []).map((field) => [field.id, field]),
      );
      generatedCount += 1;

      assert.deepEqual([...placeholdersUsed(question)], []);
      assert.equal(fields.answer && fields.answer.equivalence, 'rationalExpression');
      assert.equal(fields.restrictions && fields.restrictions.equivalence, 'setBuilder');

      const key = question.coverageKey || null;
      if (key && !isError) {
        seen.add(key);
        assert.ok(expectedCoverage.has(key), 'unexpected A2.7F coverage key ' + key);
        assert.equal(question.dok, 2);

        if (key.endsWith('degree1')) {
          assert.equal(question.difficultyBand, 2);
        } else if (key.includes('mixed')) {
          assert.equal(question.difficultyBand, 3);
        } else {
          assert.equal(question.difficultyBand, 4);
        }

        if (key === 'sum-degree1') {
          assert.equal(Number(p.N1), Number(p.A) + Number(p.B));
          assert.equal(Number(p.N0), -Number(p.A) * Number(p.s) - Number(p.B) * Number(p.r));
          assert.deepEqual(restrictionValues(fields.restrictions.expected), uniqueSorted([p.r, p.s]));
        }

        if (key === 'sum-degree2') {
          assert.equal(Number(p.N1), Number(p.A) + Number(p.B));
          assert.equal(Number(p.N0), -Number(p.A) * Number(p.t) - Number(p.B) * Number(p.s));
          assert.notEqual(Number(p.atR), 0);
          assert.deepEqual(restrictionValues(fields.restrictions.expected), uniqueSorted([p.r, p.s, p.t]));
        }

        if (key === 'sum-mixed-degree1-degree2') {
          assert.equal(Number(p.N0), -Number(p.A) * Number(p.s) + Number(p.B));
          assert.notEqual(Number(p.atR), 0);
          assert.deepEqual(restrictionValues(fields.restrictions.expected), uniqueSorted([p.r, p.s]));
        }

        if (key === 'difference-degree1') {
          assert.equal(Number(p.N1), Number(p.A) - Number(p.B));
          assert.equal(Number(p.N0), -Number(p.A) * Number(p.s) + Number(p.B) * Number(p.r));
          assert.deepEqual(restrictionValues(fields.restrictions.expected), uniqueSorted([p.r, p.s]));
        }

        if (key === 'difference-degree2') {
          assert.equal(Number(p.N1), Number(p.A) - Number(p.B));
          assert.equal(Number(p.N0), -Number(p.A) * Number(p.t) + Number(p.B) * Number(p.s));
          assert.notEqual(Number(p.atR), 0);
          assert.deepEqual(restrictionValues(fields.restrictions.expected), uniqueSorted([p.r, p.s, p.t]));
        }

        if (key === 'difference-mixed-degree1-degree2') {
          assert.equal(Number(p.N0), -Number(p.A) * Number(p.s) - Number(p.B));
          assert.notEqual(Number(p.atR), 0);
          assert.deepEqual(restrictionValues(fields.restrictions.expected), uniqueSorted([p.r, p.s]));
        }

        if (key === 'product-degree1') {
          assert.deepEqual(restrictionValues(fields.restrictions.expected), uniqueSorted([p.b, p.c]));
        }

        if (key === 'product-degree2') {
          assert.deepEqual(restrictionValues(fields.restrictions.expected), uniqueSorted([p.a, p.c, p.d, p.f]));
        }

        if (key === 'product-mixed-degree1-degree2') {
          assert.deepEqual(restrictionValues(fields.restrictions.expected), uniqueSorted([p.b, p.d, p.e]));
        }

        if (key === 'quotient-degree1') {
          assert.equal(fields['reciprocal-product'].equivalence, 'rationalExpression');
          assert.deepEqual(restrictionValues(fields.restrictions.expected), uniqueSorted([p.b, p.c, p.d]));
        }

        if (key === 'quotient-degree2') {
          assert.deepEqual(restrictionValues(fields.restrictions.expected), uniqueSorted([p.a, p.c, p.d, p.e, p.f]));
        }

        if (key === 'quotient-mixed-degree1-degree2') {
          assert.deepEqual(restrictionValues(fields.restrictions.expected), uniqueSorted([p.b, p.c, p.d, p.e, p.f]));
        }
      } else {
        assert.equal(isError, true);
        errorInstances += 1;
        assert.equal(fields.diagnosis.expected, 'original-and-divisor');
        assert.deepEqual(
          restrictionValues(fields.restrictions.expected),
          uniqueSorted([p.a, p.c, p.d, p.e, p.f]),
        );
      }

      const grading = privateGradingDefinition(question);
      const responses = Object.fromEntries(
        grading.fields.map((field) => [
          field.id,
          field.expected !== undefined ? field.expected : (field.accepted && field.accepted[0]) || '',
        ]),
      );

      const correct = await gradeResponse(grading, { responses });
      assert.equal(
        correct.isCorrect,
        true,
        doc.id + ' failed secure self-acceptance: ' + JSON.stringify(correct.fieldResults),
      );

      const extraHole = await gradeResponse(grading, {
        responses: {
          ...responses,
          answer: '(' + responses.answer + ')*((x-99)/(x-99))',
        },
      });
      assert.equal(
        extraHole.isCorrect,
        false,
        doc.id + ' accepted an extra canceling factor/domain hole',
      );
      extraHoleRejected += 1;

      const publicQuestion = buildSanitizedQuestion(question, {
        questionInstanceId: 'qa-' + doc.id + '-' + generatedCount,
        attemptsAllowed: 3,
      });
      const publicText = JSON.stringify(publicQuestion);
      assert.equal(publicText.includes('"expected"'), false);
      assert.equal(publicText.includes('"acceptedAnswers"'), false);
    }
  }

  assert.deepEqual(
    [...seen].sort(),
    [...expectedCoverage].sort(),
    'A2.7F did not exercise all 12 TEA operation/degree combinations',
  );
  assert.ok(generatedCount >= 400);
  assert.ok(errorInstances >= 40);
  assert.equal(extraHoleRejected, generatedCount);
});
