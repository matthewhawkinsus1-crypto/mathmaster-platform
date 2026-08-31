import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

import { samplePathInstances, placeholdersUsed } from '../../functions/shared/pathQuestionGeneration.mjs';
import {
  buildPrivateToolGrading,
  buildPublicToolPayload,
  gradePathResponse,
  isPathEligible,
} from '../../functions/shared/pathToolContracts.mjs';

const require = createRequire(import.meta.url);
const {
  buildSanitizedQuestion,
  buildTemplateIssuePlan,
  gradeResponse,
  privateGradingDefinition,
} = require('../../functions/lib/mathPath.js');

const entry = JSON.parse(readFileSync('drafts/fidelity-v2/algebra2/A2.8C.json', 'utf8'));

const requiredNine = new Set([
  'predict-linear', 'predict-quadratic', 'predict-exponential',
  'decide-linear', 'decide-quadratic', 'decide-exponential',
  'judge-linear', 'judge-quadratic', 'judge-exponential',
]);

const correctToolRaw = (privateGrading) => {
  const expected = privateGrading.definition.expectedModel;
  const model = expected.model;
  const predictionX = Number(privateGrading.definition.predictionX);
  let predictionY;
  let fit;
  if (expected.id === 'linear') {
    fit = { m: model.m, b: model.b };
    predictionY = model.m * predictionX + model.b;
  } else if (expected.id === 'quadratic') {
    fit = { a: model.a, b: model.b, c: model.c };
    predictionY = model.a * predictionX ** 2 + model.b * predictionX + model.c;
  } else {
    fit = { a: model.a, base: model.base };
    predictionY = model.a * model.base ** predictionX;
  }
  const xs = privateGrading.definition.points.map(([x]) => Number(x));
  const predictionType = predictionX >= Math.min(...xs) && predictionX <= Math.max(...xs)
    ? 'interpolation'
    : 'extrapolation';
  return { ...fit, predictionX, predictionY, predictionType };
};

test('A2.8C covers all nine prediction decision and critical-judgment breakouts', async () => {
  assert.equal(entry.standard, 'A2.8C');
  assert.equal(entry.verdict, 'REBUILD');
  assert.match(entry.certificationStatus, /nine-predict-decide-judge-breakouts/);
  assert.equal(entry.documents.length, 5);

  const authoredNine = new Set(
    entry.documents
      .flatMap((doc) => (doc.variants || []).map((variant) => variant.coverageKey))
      .filter((key) => requiredNine.has(key)),
  );
  assert.deepEqual([...authoredNine].sort(), [...requiredNine].sort());

  const seenNine = new Set();
  let generatedCount = 0;
  let toolPredictionInstances = 0;
  let decisions = 0;
  let judgments = 0;
  let wrongRejected = 0;
  let errorInstances = 0;
  const representations = new Set();

  for (const doc of entry.documents) {
    representations.add(doc.representation);
    const plan = await buildTemplateIssuePlan(doc, { samples: 30 });
    assert.equal(plan.issuable, true, doc.id + ' is not production-issuable: ' + plan.reason);

    const samples = doc.variants?.length ? 120 : 40;
    let spoiled = false;

    for (const generated of samplePathInstances(doc, samples)) {
      assert.ok(generated.question, doc.id + ' failed generation: ' + generated.reason);
      const q = generated.question;
      const p = generated.parameters || {};
      generatedCount += 1;
      assert.deepEqual([...placeholdersUsed(q)], []);

      if (requiredNine.has(q.coverageKey)) seenNine.add(q.coverageKey);

      if (doc.type === 'dataModelingLab') {
        toolPredictionInstances += 1;
        assert.ok(String(q.coverageKey).startsWith('predict-'));
        assert.ok(['linearFitPrediction', 'quadraticFitPrediction', 'exponentialFitPrediction'].includes(q.mode));
        assert.equal(isPathEligible(q), true);

        const publicPayload = buildPublicToolPayload(q);
        assert.equal(publicPayload.pathToolId, 'dataModelingLab');
        assert.equal(publicPayload.tool.mode, q.mode);
        assert.equal(JSON.stringify(publicPayload.tool).includes('expectedModel'), false);

        const privateGrading = buildPrivateToolGrading(q);
        assert.deepEqual(privateGrading.definition.requiredParts, ['fit', 'prediction']);
        const raw = correctToolRaw(privateGrading);
        const correct = gradePathResponse({ privateGrading, raw });
        assert.equal(correct.rejected, false);
        assert.equal(correct.isCorrect, true, doc.id + ' failed secure fit+prediction self-acceptance');
        assert.equal(correct.parts.fit, true);
        assert.equal(correct.parts.prediction, true);

        if (!spoiled) {
          const wrong = gradePathResponse({
            privateGrading,
            raw: { ...raw, predictionY: Number(raw.predictionY) + 10 },
          });
          assert.equal(wrong.isCorrect, false, doc.id + ' accepted a materially wrong prediction');
          assert.equal(wrong.parts.prediction, false);
          wrongRejected += 1;
          spoiled = true;
        }
        continue;
      }

      const fields = Object.fromEntries((q.responseFields || []).map((field) => [field.id, field]));
      if (String(q.coverageKey || '').startsWith('decide-')) {
        decisions += 1;
        assert.ok(fields.prediction && fields.decision);
      }
      if (String(q.coverageKey || '').startsWith('judge-')) {
        judgments += 1;
        assert.ok(fields.prediction && fields.judgment);
        assert.equal(q.dok, 3);
      }
      if (doc.taskType === 'errorAnalysis') {
        errorInstances += 1;
        assert.ok(fields.prediction && fields.diagnosis);
        assert.equal(q.dok, 3);
      }

      if (q.coverageKey === 'decide-linear') {
        assert.equal(Number(p.pred), 4 * Number(p.m) + Number(p.b));
        assert.ok(Number(p.pred) > Number(p.threshold));
        assert.equal(fields.decision.expected, 'exceed');
      }
      if (q.coverageKey === 'decide-quadratic') {
        assert.equal(Number(p.pred), 16 * Number(p.a) + 4 * Number(p.b) + Number(p.c));
        assert.ok(Number(p.pred) < Number(p.threshold));
        assert.equal(fields.decision.expected, 'do-not-approve');
      }
      if (q.coverageKey === 'decide-exponential') {
        assert.equal(Number(p.pred), Number(p.a) * Number(p.r) ** 5);
        assert.ok(Number(p.pred) > Number(p.threshold));
        assert.equal(fields.decision.expected, 'upgrade');
      }
      if (q.coverageKey === 'judge-quadratic') {
        assert.ok(Number(p.pred) < 0);
        assert.equal(fields.judgment.expected, 'not-credible');
      }
      if (q.coverageKey === 'judge-linear' || q.coverageKey === 'judge-exponential') {
        assert.equal(fields.judgment.expected, 'caution');
      }

      const grading = privateGradingDefinition(q);
      const responses = Object.fromEntries(
        grading.fields.map((field) => [field.id, field.expected ?? field.accepted?.[0] ?? '']),
      );
      const correct = await gradeResponse(grading, { responses });
      assert.equal(correct.isCorrect, true, doc.id + ' failed secure self-acceptance: ' + JSON.stringify(correct.fieldResults));

      if (!spoiled) {
        const prediction = grading.fields.find((field) => field.id === 'prediction');
        assert.ok(prediction);
        const wrong = await gradeResponse(grading, {
          responses: { ...responses, prediction: String(Number(prediction.expected) + 10) },
        });
        assert.equal(wrong.isCorrect, false, doc.id + ' accepted a materially wrong prediction');
        wrongRejected += 1;
        spoiled = true;
      }

      const publicQ = buildSanitizedQuestion(q, {
        questionInstanceId: 'qa-' + doc.id + '-' + generatedCount,
        attemptsAllowed: 3,
      });
      const publicText = JSON.stringify(publicQ);
      assert.equal(publicText.includes('"expected"'), false);
      assert.equal(publicText.includes('"acceptedAnswers"'), false);
    }
  }

  assert.deepEqual([...seenNine].sort(), [...requiredNine].sort());
  assert.ok(generatedCount >= 400);
  assert.ok(toolPredictionInstances >= 120);
  assert.ok(decisions >= 120);
  assert.ok(judgments >= 120);
  assert.ok(errorInstances >= 40);
  assert.equal(wrongRejected, entry.documents.length);
  assert.ok(representations.has('multipleRepresentation'));
  assert.ok(representations.has('context'));
  assert.ok(representations.has('table'));
  assert.ok(representations.has('verbal'));
});
