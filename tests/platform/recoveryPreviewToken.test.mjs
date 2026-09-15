import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { previewTokenSetsMatch, recoveryPreviewToken } from '../../functions/shared/recoveryPreviewToken.mjs';

const base = {
  studentId: 'student-a', assignmentId: 'assignment-a', classId: 'class-a',
  questionIndex: 3, questionId: 'question-4', variantIndex: 1,
  draftKey: 'workspace:classwork:student-a:assignment-a:3:1:literal',
  savedAt: 1_789_000_000_000,
  response: { kind: 'scalar', type: 'literal', value: '42', fields: [] },
  closesAt: 1_789_000_600_000,
};

test('unchanged exact proposal versions satisfy commit validation', () => {
  const preview = recoveryPreviewToken(base);
  const reassessed = recoveryPreviewToken({ ...base, response: { fields: [], value: '42', type: 'literal', kind: 'scalar' } });
  assert.equal(reassessed, preview, 'object insertion order is not a material response change');
  assert.equal(previewTokenSetsMatch([preview], [reassessed]), true);
});

test('same draft key cannot hide a changed response or server timestamp', () => {
  const preview = recoveryPreviewToken(base);
  assert.notEqual(recoveryPreviewToken({ ...base, response: { ...base.response, value: '41' } }), preview);
  assert.notEqual(recoveryPreviewToken({ ...base, savedAt: base.savedAt + 1 }), preview);
});

test('question, variant, canonical disappearance, and cutoff changes stale a preview', () => {
  const preview = recoveryPreviewToken(base);
  assert.notEqual(recoveryPreviewToken({ ...base, questionId: 'replacement-question' }), preview);
  assert.notEqual(recoveryPreviewToken({ ...base, variantIndex: 2 }), preview);
  assert.notEqual(recoveryPreviewToken({ ...base, closesAt: base.closesAt + 1 }), preview);
  // A newly canonical attempt removes the proposal from reassessment entirely.
  assert.equal(previewTokenSetsMatch([preview], []), false);
});

test('exact-set validation rejects duplicates, missing tokens, and extra tokens', () => {
  const one = recoveryPreviewToken(base);
  const two = recoveryPreviewToken({ ...base, questionIndex: 4, questionId: 'question-5' });
  assert.equal(previewTokenSetsMatch([one, two], [one, two]), true);
  assert.equal(previewTokenSetsMatch([one, one], [one, two]), false, 'duplicate cannot conceal an omission');
  assert.equal(previewTokenSetsMatch([one], [one, two]), false);
  assert.equal(previewTokenSetsMatch([one, two, 'extra'], [one, two]), false);
});

test('preview token is opaque and the server validates it before its write loop', () => {
  const token = recoveryPreviewToken(base);
  assert.match(token, /^[a-f0-9]{64}$/);
  assert.doesNotMatch(token, /42|literal|student-a/);

  const source = fs.readFileSync('functions/index.js', 'utf8');
  const staleCheck = source.indexOf('if (!previewTokenSetsMatch(previewTokens, currentTokens))');
  const writeLoop = source.indexOf('for (const proposal of proposals)', staleCheck);
  assert.ok(staleCheck > 0 && writeLoop > staleCheck, 'the complete set must be rejected before the first ingestion write');
  assert.match(source.slice(source.indexOf('if (!commit)'), staleCheck), /committed: false/);
});
