import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  samplePathInstances,
  placeholdersUsed,
} from '../../functions/shared/pathQuestionGeneration.mjs';
import {
  buildPrivateToolGrading,
  buildPublicToolPayload,
  gradePathResponse,
  isPathEligible,
} from '../../functions/shared/pathToolContracts.mjs';
import {
  pathLinearRegression,
  pathQuadraticRegression,
  pathExponentialRegression,
} from '../../functions/shared/pathDataModelingGrading.mjs';

const entry = JSON.parse(readFileSync('drafts/fidelity-v2/algebra2/A2.8B.json', 'utf8'));

const near = (a, b, tolerance = 1e-7) => (
  Math.abs(Number(a) - Number(b)) <= tolerance
);

const predict = (id, model, x) => {
  if (id === 'linear') return Number(model.m) * Number(x) + Number(model.b);
  if (id === 'quadratic') return Number(model.a) * Number(x) ** 2 + Number(model.b) * Number(x) + Number(model.c);
  return Number(model.a) * Number(model.base) ** Number(x);
};

test('A2.8B uses fit-only regression technology for linear quadratic and exponential data', () => {
  assert.equal(entry.standard, 'A2.8B');
  assert.equal(entry.verdict, 'ENHANCE');
  assert.match(entry.certificationStatus, /technology-regression/);
  assert.equal(entry.documents.length, 5);

  let generatedCount = 0;
  let linearFamilies = 0;
  let quadraticFamilies = 0;
  let exponentialFamilies = 0;
  let growthInstances = 0;
  let decayInstances = 0;
  let errorFamilies = 0;
  let noisyInstances = 0;
  let wrongCoefficientRejected = 0;
  const representations = new Set();

  for (const doc of entry.documents) {
    representations.add(doc.representation);
    assert.equal(doc.type, 'dataModelingLab');
    assert.ok(['linearFit', 'quadraticFit', 'exponentialFit'].includes(doc.mode));
    assert.equal(String(doc.mode).includes('Prediction'), false, doc.id + ' must not import A2.8C prediction work');
    assert.equal('predictionX' in doc, false, doc.id + ' must be fit-only');

    if (doc.mode === 'linearFit') linearFamilies += 1;
    if (doc.mode === 'quadraticFit') quadraticFamilies += 1;
    if (doc.mode === 'exponentialFit') exponentialFamilies += 1;
    if (doc.taskType === 'errorAnalysis') {
      errorFamilies += 1;
      assert.equal(doc.dok, 3);
      assert.match(String(doc.prompt), /re-run|repair/i);
    } else {
      assert.equal(doc.dok, 2, doc.id + ' routine regression fitting must remain DOK 2');
    }

    let wrongChecked = false;
    for (const generated of samplePathInstances(doc, 40)) {
      assert.ok(generated.question, doc.id + ' failed generation: ' + generated.reason);
      const question = generated.question;
      generatedCount += 1;

      assert.deepEqual([...placeholdersUsed(question)], []);
      assert.equal(isPathEligible(question), true, doc.id + ' produced a Path-ineligible Data Modeling question');

      const publicPayload = buildPublicToolPayload(question);
      assert.equal(publicPayload.pathToolId, 'dataModelingLab');
      assert.equal(publicPayload.tool.mode, question.mode);
      assert.equal('predictionX' in publicPayload.tool, false, doc.id + ' leaked or requested prediction work');
      assert.equal(publicPayload.tool.points.length, 5);
      assert.equal(JSON.stringify(publicPayload.tool).includes('expectedModel'), false);

      const privateGrading = buildPrivateToolGrading(question);
      const definition = privateGrading.definition;
      assert.deepEqual(definition.requiredParts, ['fit']);
      assert.equal(definition.predictionX, null);
      assert.ok(definition.expectedModel?.model);

      const points = publicPayload.tool.points;
      const expected = definition.expectedModel;
      const independent = question.mode === 'linearFit'
        ? pathLinearRegression(points)
        : question.mode === 'quadraticFit'
          ? pathQuadraticRegression(points)
          : pathExponentialRegression(points);
      assert.ok(independent, doc.id + ' independent regression failed');

      if (question.mode === 'linearFit') {
        assert.equal(expected.id, 'linear');
        assert.ok(near(expected.model.m, independent.m));
        assert.ok(near(expected.model.b, independent.b));
      } else if (question.mode === 'quadraticFit') {
        assert.equal(expected.id, 'quadratic');
        assert.ok(near(expected.model.a, independent.a));
        assert.ok(near(expected.model.b, independent.b));
        assert.ok(near(expected.model.c, independent.c));
      } else {
        assert.equal(expected.id, 'exponential');
        assert.ok(near(expected.model.a, independent.a));
        assert.ok(near(expected.model.base, independent.base));
        if (Number(expected.model.base) > 1) growthInstances += 1;
        if (Number(expected.model.base) > 0 && Number(expected.model.base) < 1) decayInstances += 1;
      }

      const residuals = points.map(([x, y]) => Number(y) - predict(expected.id, expected.model, x));
      if (residuals.some((value) => Math.abs(value) > 1e-6)) noisyInstances += 1;

      const raw = expected.id === 'linear'
        ? { m: expected.model.m, b: expected.model.b }
        : expected.id === 'quadratic'
          ? { a: expected.model.a, b: expected.model.b, c: expected.model.c }
          : { a: expected.model.a, base: expected.model.base };

      const correct = gradePathResponse({ privateGrading, raw });
      assert.equal(correct.rejected, false);
      assert.equal(correct.isCorrect, true, doc.id + ' failed secure fit-only self-acceptance');
      assert.equal(correct.parts.fit, true);
      assert.equal(correct.parts.prediction, false);

      if (!wrongChecked) {
        const wrongRaw = { ...raw };
        if (expected.id === 'linear') wrongRaw.m = Number(wrongRaw.m) + 2;
        else wrongRaw.a = Number(wrongRaw.a) + 2;
        const wrong = gradePathResponse({ privateGrading, raw: wrongRaw });
        assert.equal(wrong.rejected, false);
        assert.equal(wrong.isCorrect, false, doc.id + ' accepted a materially wrong fitted coefficient');
        assert.equal(wrong.parts.fit, false);
        wrongCoefficientRejected += 1;
        wrongChecked = true;
      }
    }
  }

  assert.ok(generatedCount >= 200);
  assert.equal(linearFamilies, 1);
  assert.equal(quadraticFamilies, 2);
  assert.equal(exponentialFamilies, 2);
  assert.ok(growthInstances >= 40);
  assert.ok(decayInstances >= 40);
  assert.equal(errorFamilies, 1);
  assert.equal(noisyInstances, generatedCount, 'every A2.8B instance must use genuinely non-perfect data');
  assert.equal(wrongCoefficientRejected, entry.documents.length);
  assert.ok(representations.has('table'));
  assert.ok(representations.has('multipleRepresentation'));
  assert.ok(representations.has('context'));
  assert.ok(representations.has('verbal'));
});
