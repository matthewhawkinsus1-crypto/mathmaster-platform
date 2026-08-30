import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { REPRESENTATIONS, TASK_TYPES } from '../../functions/shared/pathQuestionQuality.mjs';

const read = (path) => JSON.parse(readFileSync(path, 'utf8'));

const staged = [
  read('drafts/fidelity-v2/algebra1/A.12D.json'),
];

const codeOf = (doc) => String((doc.alignmentKeys || []).find((key) => String(key).startsWith('texas:')) || '')
  .replace(/^texas:/, '');

test('each staged Algebra I Fidelity V2 standard contains five new complete families', () => {
  const ids = new Set();
  for (const payload of staged) {
    assert.match(payload.standard, /^A\.\d+[A-Z]$/);
    assert.equal(payload.documents.length, 5, `${payload.standard} must contain exactly five replacements`);
    for (const doc of payload.documents) {
      assert.equal(codeOf(doc), payload.standard);
      assert.ok(doc.id.startsWith(`mm_${payload.standard.replace('.', '_')}_v2_`) || doc.id.includes('_v2_'));
      assert.equal(ids.has(doc.id), false, `duplicate staged id ${doc.id}`);
      ids.add(doc.id);
      assert.ok(doc.familyId.includes(':v2-'), `${doc.id} needs a new Fidelity V2 family id`);
      assert.ok(REPRESENTATIONS.includes(doc.representation), `${doc.id} has unsupported representation ${doc.representation}`);
      assert.ok(TASK_TYPES.includes(doc.taskType), `${doc.id} has unsupported task type ${doc.taskType}`);
      assert.ok(Number.isInteger(doc.dok) && doc.dok >= 1 && doc.dok <= 4);
      assert.ok(Number.isInteger(doc.difficultyBand) && doc.difficultyBand >= 1 && doc.difficultyBand <= 5);
      assert.ok(doc.generator?.parameters && Object.keys(doc.generator.parameters).length, `${doc.id} needs a real generator`);
      assert.ok(doc.solutionReview?.reasoning?.length >= 2, `${doc.id} needs a meaningful solution review`);
      assert.ok(doc.attemptFeedback?.length, `${doc.id} needs attempt feedback`);
      assert.ok(doc.supportHints?.length, `${doc.id} needs support hints`);
    }
  }
});

test('A.12D Fidelity V2 actually requires nth-term formulas rather than component answers', () => {
  const payload = staged.find((entry) => entry.standard === 'A.12D');
  assert.ok(payload);
  for (const doc of payload.documents) {
    const fields = doc.responseFields || [];
    assert.equal(fields.length, 1);
    assert.equal(fields[0].inputProfile, 'expression', `${doc.id} must require an explicit formula expression`);
    assert.match(String(doc.prompt), /formula/i);
    assert.match(String(fields[0].expected), /n/);
  }
});

test('A.12D includes arithmetic, geometric growth, geometric decay, true error analysis, and a higher reasoning family', () => {
  const docs = staged.find((entry) => entry.standard === 'A.12D').documents;
  const text = JSON.stringify(docs).toLowerCase();
  assert.match(text, /arithmetic/);
  assert.match(text, /geometric/);
  assert.match(text, /0\.5|1\/2/);
  assert.ok(docs.some((doc) => doc.taskType === 'errorAnalysis' && /student/i.test(doc.prompt)));
  assert.ok(docs.some((doc) => doc.dok === 3 && doc.taskType === 'reverseReasoning'));
  assert.ok(docs.filter((doc) => doc.representation === 'table').length >= 2);
});
