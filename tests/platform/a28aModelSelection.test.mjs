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

const entry = JSON.parse(readFileSync('drafts/fidelity-v2/algebra2/A2.8A.json', 'utf8'));

test('A2.8A selects linear quadratic and exponential models from calculated data evidence', async () => {
  assert.equal(entry.standard, 'A2.8A');
  assert.equal(entry.verdict, 'ENHANCE');
  assert.match(entry.certificationStatus, /data-diagnostic-model-selection/);
  assert.equal(entry.documents.length, 5);

  let generatedCount = 0;
  let linear = 0;
  let quadratic = 0;
  let growth = 0;
  let decay = 0;
  let nonunit = 0;
  let errorAnalysis = 0;
  let wrongModelRejected = 0;
  const expVariants = new Set();

  for (const doc of entry.documents) {
    const plan = await buildTemplateIssuePlan(doc, { samples: 30 });
    assert.equal(plan.issuable, true, doc.id + ' is not production-issuable: ' + plan.reason);

    if (doc.taskType === 'errorAnalysis') {
      assert.equal(doc.dok, 3);
      assert.equal(doc.difficultyBand, 4);
      errorAnalysis += 1;
    } else {
      assert.equal(doc.dok, 2, doc.id + ' routine model analysis must remain DOK 2');
    }

    let wrongChecked = false;
    const samples = doc.variants?.length ? 120 : 45;
    for (const generated of samplePathInstances(doc, samples)) {
      assert.ok(generated.question, doc.id + ' failed generation: ' + generated.reason);
      const q = generated.question;
      const p = generated.parameters || {};
      const fields = Object.fromEntries((q.responseFields || []).map((field) => [field.id, field]));
      generatedCount += 1;
      assert.deepEqual([...placeholdersUsed(q)], []);
      assert.ok(fields.model, doc.id + ' must require a model selection');

      if (doc.id.includes('linear-first')) {
        linear += 1;
        assert.equal(Number(fields['diff-1'].expected), Number(p.m));
        assert.equal(Number(fields['diff-2'].expected), Number(p.m));
        assert.equal(Number(fields['diff-3'].expected), Number(p.m));
        assert.equal(fields.model.expected, 'linear');
      }

      if (doc.id.includes('quadratic-second')) {
        quadratic += 1;
        assert.equal(Number(p.d1), Number(p.a) + Number(p.b));
        assert.equal(Number(p.d2), 3 * Number(p.a) + Number(p.b));
        assert.equal(Number(p.d3), 5 * Number(p.a) + Number(p.b));
        assert.equal(Number(p.sd), 2 * Number(p.a));
        assert.notEqual(Number(p.d1), Number(p.d2));
        assert.equal(fields.model.expected, 'quadratic');
      }

      if (doc.id.includes('exponential-growth-decay')) {
        expVariants.add(q.coverageKey);
        assert.equal(fields.model.expected, 'exponential');
        if (q.coverageKey === 'exponential-growth') {
          growth += 1;
          assert.ok(Number(p.r) > 1);
          assert.equal(Number(p.y1) / Number(p.y0), Number(p.r));
          assert.equal(Number(p.y2) / Number(p.y1), Number(p.r));
          assert.equal(Number(p.y3) / Number(p.y2), Number(p.r));
        } else if (q.coverageKey === 'exponential-decay') {
          decay += 1;
          const ratio = 1 / Number(p.r);
          assert.ok(ratio > 0 && ratio < 1);
          assert.equal(Number(p.y1) / Number(p.y0), ratio);
          assert.equal(Number(p.y2) / Number(p.y1), ratio);
          assert.equal(Number(p.y3) / Number(p.y2), ratio);
        } else {
          assert.fail('unexpected exponential variant ' + q.coverageKey);
        }
      }

      if (doc.id.includes('nonunit-input-spacing')) {
        nonunit += 1;
        linear += 1;
        assert.ok(Number(p.step) >= 2);
        assert.equal(Number(p.x1) - Number(p.x0), Number(p.step));
        assert.equal(Number(p.x2) - Number(p.x1), Number(p.step));
        assert.equal(Number(p.x3) - Number(p.x2), Number(p.step));
        assert.equal(Number(p.dy), Number(p.m) * Number(p.step));
        assert.equal(Number(fields.rate.expected), Number(p.m));
        assert.equal(fields.model.expected, 'linear');
      }

      if (doc.taskType === 'errorAnalysis') {
        quadratic += 1;
        assert.equal(fields.diagnosis.expected, 'direction-not-enough');
        assert.equal(Number(p.sd), 2 * Number(p.a));
        assert.ok(Number(p.d1) > 0 && Number(p.d2) > 0 && Number(p.d3) > 0);
        assert.notEqual(Number(p.d1), Number(p.d2));
        assert.equal(fields.model.expected, 'quadratic');
      }

      const grading = privateGradingDefinition(q);
      const responses = Object.fromEntries(grading.fields.map((field) => [
        field.id,
        field.expected !== undefined ? field.expected : (field.accepted && field.accepted[0]) || '',
      ]));
      const correct = await gradeResponse(grading, { responses });
      assert.equal(correct.isCorrect, true, doc.id + ' failed secure self-acceptance: ' + JSON.stringify(correct.fieldResults));

      if (!wrongChecked) {
        const wrong = fields.model.expected === 'linear' ? 'quadratic' : 'linear';
        const result = await gradeResponse(grading, { responses: { ...responses, model: wrong } });
        assert.equal(result.isCorrect, false, doc.id + ' accepted a wrong model family');
        wrongModelRejected += 1;
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

  assert.ok(generatedCount >= 300);
  assert.ok(linear >= 90);
  assert.ok(quadratic >= 90);
  assert.ok(growth >= 40);
  assert.ok(decay >= 40);
  assert.ok(nonunit >= 45);
  assert.equal(errorAnalysis, 1);
  assert.deepEqual([...expVariants].sort(), ['exponential-decay', 'exponential-growth']);
  assert.equal(wrongModelRejected, entry.documents.length);
});
