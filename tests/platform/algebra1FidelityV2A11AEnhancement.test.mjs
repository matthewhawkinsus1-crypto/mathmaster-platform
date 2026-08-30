import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const entry = JSON.parse(readFileSync('drafts/fidelity-v2/algebra1/A.11A.json', 'utf8'));

test('A.11A stages five full radical-simplification families', () => {
  assert.equal(entry.standard, 'A.11A');
  assert.equal(entry.verdict, 'ENHANCE');
  assert.match(entry.certificationStatus, /full-radical-simplification/);
  assert.equal(entry.documents.length, 5);
  assert.ok(entry.documents.every((doc) => doc.id.includes('_v2_')));
  assert.ok(entry.documents.every((doc) => doc.familyId.includes(':v2-')));
});

test('A.11A answers are complete simplified expressions rather than extracted coefficients', () => {
  for (const doc of entry.documents) {
    assert.equal(doc.responseFields?.length, 1);
    assert.equal(doc.responseFields[0].inputProfile, 'expression');
    assert.match(String(doc.responseFields[0].expected), /sqrt\(/);
    assert.match(String(doc.prompt), /simplif/i);
  }
});

test('A.11A includes coefficient, like-radical, and genuine error-analysis reasoning', () => {
  assert.ok(entry.documents.some((doc) => /coefficient/i.test(JSON.stringify(doc.solutionReview || {}))), 'must reason about the outside coefficient');
  assert.ok(entry.documents.some((doc) => /\+/.test(doc.prompt)), 'must combine added like radicals');
  assert.ok(entry.documents.some((doc) => /-/.test(doc.prompt)), 'must combine subtracted like radicals');
  const error = entry.documents.find((doc) => doc.taskType === 'errorAnalysis');
  assert.ok(error);
  assert.match(error.prompt, /student/i);
  assert.match(error.prompt, /completely simplified/i);
});
