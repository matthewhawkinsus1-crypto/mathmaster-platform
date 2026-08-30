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

const entry = JSON.parse(readFileSync('drafts/fidelity-v2/algebra2/A2.7G.json', 'utf8'));

test('A2.7G rewrites variable radical expressions without accepting unchanged source forms', async () => {
  assert.equal(entry.standard, 'A2.7G');
  assert.equal(entry.verdict, 'REBUILD');
  assert.match(entry.certificationStatus, /variable-radical-rewritten-forms/);
  assert.equal(entry.documents.length, 5);

  let generatedCount = 0;
  let absoluteInstances = 0;
  let cubeRootInstances = 0;
  let unchangedRejected = 0;

  for (const doc of entry.documents) {
    assert.match(JSON.stringify(doc), /x|y/, doc.id + ' must contain a variable');
    assert.equal(doc.id.includes('rationalize'), false, 'constant-only rationalization may not return');
    if (doc.taskType === 'errorAnalysis') assert.equal(doc.dok, 3);
    else assert.equal(doc.dok, 2);

    const plan = await buildTemplateIssuePlan(doc, { samples: 30 });
    assert.equal(plan.issuable, true, doc.id + ' is not production-issuable: ' + plan.reason);

    for (const generated of samplePathInstances(doc, 45)) {
      assert.ok(generated.question, doc.id + ' failed generation: ' + generated.reason);
      const q = generated.question;
      const p = generated.parameters || {};
      const fields = Object.fromEntries((q.responseFields || []).map((field) => [field.id, field]));
      generatedCount += 1;
      assert.deepEqual([...placeholdersUsed(q)], []);

      if (doc.id.includes('square-root-variable-power')) {
        assert.equal(Number(p.k2), Number(p.k) * Number(p.k));
        assert.equal(Number(p.twoM), 2 * Number(p.m));
        assert.equal(Number(p.exp), 2 * Number(p.m) + 1);
        assert.equal(Number(fields['outside-coefficient'].expected), Number(p.k));
        assert.equal(Number(fields['outside-x-power'].expected), Number(p.m));
        assert.equal(Number(fields['inside-x-power'].expected), 1);
        assert.equal(fields.answer.equivalence, undefined);
      }

      if (doc.id.includes('radical-quotient')) {
        assert.equal(Number(p.difference), 2 * Number(p.m));
        assert.equal(Number(p.topExp) - Number(p.bottomExp), Number(p.difference));
        assert.equal(Number(fields['final-x-power'].expected), Number(p.m));
        assert.equal(fields.answer.equivalence, undefined);
      }

      if (doc.id.includes('cube-root-variable-power')) {
        cubeRootInstances += 1;
        assert.ok([1, 2].includes(Number(p.r)));
        assert.equal(Number(p.k3), Number(p.k) ** 3);
        assert.equal(Number(p.threeM), 3 * Number(p.m));
        assert.equal(Number(p.exp), 3 * Number(p.m) + Number(p.r));
        assert.equal(Number(fields['inside-x-power'].expected), Number(p.r));
        assert.equal(fields.answer.equivalence, undefined);
      }

      if (doc.id.includes('rational-exponent-to-indexed-radical')) {
        assert.ok(Number(p.r) < Number(p.q));
        assert.equal(Number(p.p), Number(p.q) * Number(p.m) + Number(p.r));
        assert.equal(Number(fields['root-index'].expected), Number(p.q));
        assert.equal(Number(fields['whole-power'].expected), Number(p.m));
        assert.equal(fields.answer.equivalence, undefined);
      }

      if (doc.taskType === 'errorAnalysis') {
        absoluteInstances += 1;
        assert.equal(fields.diagnosis.expected, 'absolute-x');
        assert.equal(fields['x-factor'].expected, '|x|');
        assert.equal(fields['y-factor'].expected, 'y^2');
        assert.equal(Number(p.k2), Number(p.k) * Number(p.k));
      }

      const grading = privateGradingDefinition(q);
      const responses = Object.fromEntries(grading.fields.map((field) => [
        field.id,
        field.expected !== undefined ? field.expected : (field.accepted && field.accepted[0]) || '',
      ]));
      const correct = await gradeResponse(grading, { responses });
      assert.equal(correct.isCorrect, true, doc.id + ' failed secure self-acceptance: ' + JSON.stringify(correct.fieldResults));

      let unchanged = null;
      if (doc.id.includes('square-root-variable-power')) unchanged = 'sqrt(' + p.k2 + '*x^' + p.exp + ')';
      if (doc.id.includes('radical-quotient')) unchanged = 'sqrt(' + p.k2 + '*x^' + p.topExp + ')/sqrt(x^' + p.bottomExp + ')';
      if (doc.id.includes('rational-exponent-to-indexed-radical')) unchanged = 'x^(' + p.p + '/' + p.q + ')';
      if (unchanged) {
        const result = await gradeResponse(grading, { responses: { ...responses, answer: unchanged } });
        assert.equal(result.isCorrect, false, doc.id + ' accepted the unchanged source instead of the requested rewrite');
        unchangedRejected += 1;
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
  assert.ok(cubeRootInstances >= 45);
  assert.ok(absoluteInstances >= 45);
  assert.ok(unchangedRejected >= 135);
});
