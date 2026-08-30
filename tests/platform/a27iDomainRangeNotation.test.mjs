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

const entry = JSON.parse(readFileSync('drafts/fidelity-v2/algebra2/A2.7I.json', 'utf8'));

test('A2.7I certifies all six domain/range notation breakouts', async () => {
  assert.equal(entry.standard, 'A2.7I');
  assert.equal(entry.verdict, 'ENHANCE');
  assert.match(entry.certificationStatus, /all-six-domain-range-notations/);
  assert.equal(entry.documents.length, 5);

  const required = new Set([
    'domain-interval', 'domain-inequality', 'domain-set',
    'range-interval', 'range-inequality', 'range-set',
  ]);
  const seen = new Set();
  let generatedCount = 0;
  let lowerRange = 0;
  let upperRange = 0;
  let reciprocal = 0;
  let errorInstances = 0;
  let alternateAccepted = 0;
  let wrongRejected = 0;

  for (const doc of entry.documents) {
    if (doc.taskType === 'errorAnalysis') {
      assert.equal(doc.dok, 3);
      assert.equal(doc.difficultyBand, 4);
    } else {
      assert.equal(doc.dok, 2, doc.id + ' routine notation work must remain DOK 2');
    }

    const plan = await buildTemplateIssuePlan(doc, { samples: 30 });
    assert.equal(plan.issuable, true, doc.id + ' is not production-issuable: ' + plan.reason);

    let altChecked = false;
    let wrongChecked = false;

    for (const generated of samplePathInstances(doc, 45)) {
      assert.ok(generated.question, doc.id + ' failed generation: ' + generated.reason);
      const q = generated.question;
      const p = generated.parameters || {};
      const fields = Object.fromEntries((q.responseFields || []).map((field) => [field.id, field]));
      generatedCount += 1;
      assert.deepEqual([...placeholdersUsed(q)], []);

      Object.keys(fields).forEach((id) => {
        if (required.has(id)) seen.add(id);
      });

      if (doc.id.includes('lower-bounded')) {
        lowerRange += 1;
        assert.equal(fields['domain-interval'].expected, '[' + p.h + ',inf)');
        assert.equal(fields['domain-inequality'].expected, 'x>=(' + p.h + ')');
        assert.equal(fields['range-interval'].expected, '[' + p.k + ',inf)');
        assert.equal(fields['range-inequality'].expected, 'y>=(' + p.k + ')');
      }

      if (doc.id.includes('upper-bounded')) {
        upperRange += 1;
        assert.equal(fields['domain-interval'].expected, '[' + p.h + ',inf)');
        assert.equal(fields['range-interval'].expected, '(-inf,' + p.k + ']');
        assert.equal(fields['range-inequality'].expected, 'y<=(' + p.k + ')');
      }

      if (doc.id.includes('quadratic-range')) {
        lowerRange += 1;
        assert.equal(fields['range-interval'].expected, '[' + p.k + ',inf)');
        assert.equal(fields['range-inequality'].expected, 'y>=(' + p.k + ')');
      }

      if (doc.id.includes('reciprocal')) {
        reciprocal += 1;
        assert.equal(fields['domain-inequality'].expected, 'x!=(' + p.h + ')');
        assert.equal(fields['range-inequality'].expected, 'y!=(' + p.k + ')');
        assert.match(fields['domain-interval'].expected, /u/);
        assert.match(fields['range-interval'].expected, /u/);
      }

      if (doc.taskType === 'errorAnalysis') {
        errorInstances += 1;
        upperRange += 1;
        assert.equal(fields.diagnosis.expected, 'direction-and-endpoint');
        assert.equal(fields['range-interval'].expected, '(-inf,' + p.k + ']');
        assert.equal(fields['range-inequality'].expected, 'y<=(' + p.k + ')');
      }

      for (const field of q.responseFields || []) {
        if (field.id.endsWith('-set')) assert.equal(field.equivalence, 'setBuilder');
      }

      const grading = privateGradingDefinition(q);
      const responses = Object.fromEntries(grading.fields.map((field) => [
        field.id,
        field.expected !== undefined ? field.expected : (field.accepted && field.accepted[0]) || '',
      ]));
      const correct = await gradeResponse(grading, { responses });
      assert.equal(correct.isCorrect, true, doc.id + ' failed secure self-acceptance: ' + JSON.stringify(correct.fieldResults));

      if (!altChecked && fields['domain-inequality'] && doc.id.includes('lower-bounded')) {
        const result = await gradeResponse(grading, {
          responses: { ...responses, 'domain-inequality': '(' + p.h + ')<=x' },
        });
        assert.equal(result.isCorrect, true, doc.id + ' rejected reversed equivalent domain inequality');
        alternateAccepted += 1;
        altChecked = true;
      }

      if (!altChecked && fields['range-set']) {
        const expected = String(fields['range-set'].expected);
        const mathLive = expected
          .replace(/^\{/, '\\{')
          .replace(/\}$/, '\\}')
          .replace(/\|/, '\\mid ')
          .replace(/!=/g, '\\ne ')
          .replace(/>=/g, '\\ge ')
          .replace(/<=/g, '\\le ');
        const result = await gradeResponse(grading, {
          responses: { ...responses, 'range-set': mathLive },
        });
        assert.equal(result.isCorrect, true, doc.id + ' rejected equivalent MathLive set-builder notation');
        alternateAccepted += 1;
        altChecked = true;
      }

      if (!wrongChecked) {
        const target = fields['range-inequality'] ? 'range-inequality'
          : fields['domain-inequality'] ? 'domain-inequality'
            : null;
        if (target) {
          const result = await gradeResponse(grading, {
            responses: { ...responses, [target]: target.startsWith('range') ? 'y=999999' : 'x=999999' },
          });
          assert.equal(result.isCorrect, false, doc.id + ' accepted a changed domain/range notation');
          wrongRejected += 1;
          wrongChecked = true;
        }
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

  assert.deepEqual([...seen].sort(), [...required].sort());
  assert.ok(generatedCount >= 225);
  assert.ok(lowerRange >= 90);
  assert.ok(upperRange >= 90);
  assert.ok(reciprocal >= 45);
  assert.ok(errorInstances >= 45);
  assert.equal(alternateAccepted, entry.documents.length);
  assert.equal(wrongRejected, entry.documents.length);
});
