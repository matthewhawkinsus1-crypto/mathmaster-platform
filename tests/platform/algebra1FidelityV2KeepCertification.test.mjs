import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (code) => JSON.parse(readFileSync(`drafts/fidelity-v2/algebra1/${code}.json`, 'utf8'));
const keepCodes = ['A.3B','A.3E','A.3F','A.4B','A.5A','A.5C','A.7B','A.7C','A.9B','A.12B','A.12E'];
const payloads = new Map(keepCodes.map((code) => [code, read(code)]));

test('all eleven original KEEP standards have explicit V2 certification packages', () => {
  for (const code of keepCodes) {
    const payload = payloads.get(code);
    assert.equal(payload.verdict, 'KEEP');
    assert.equal(payload.documents.length, 5);
    assert.match(String(payload.certificationStatus), /candidate-keep/);
    assert.ok(payload.documents.every((doc) => doc.id.includes('_v2_')));
    assert.ok(payload.documents.every((doc) => doc.familyId.includes(':v2-')));
    assert.ok(payload.documents.every((doc) => doc.solutionReview?.reasoning?.length >= 2));
    assert.ok(payload.documents.every((doc) => doc.attemptFeedback?.length && doc.supportHints?.length));
  }
});

test('KEEP certification contains no fake table or fake error-analysis metadata', () => {
  for (const code of keepCodes) {
    for (const doc of payloads.get(code).documents) {
      if (doc.representation === 'table') {
        assert.ok(doc.stimulus?.table?.rows?.length >= 2, `${doc.id} declares table without a real table`);
      }
      if (doc.taskType === 'errorAnalysis') {
        assert.match(String(doc.prompt), /student|error|mistake|incorrect|correct|claims?/i,
          `${doc.id} labels error analysis without an error to analyze`);
      }
    }
  }
});

test('A.3B retains rate mathematics with a real table and honest cognitive demand', () => {
  const docs = payloads.get('A.3B').documents;
  const table = docs.find((doc) => doc.representation === 'table');
  assert.ok(table?.stimulus?.table?.rows?.length >= 2);
  assert.ok(docs.some((doc) => /hourly rate of change/i.test(doc.prompt)));
  assert.ok(docs.every((doc) => doc.dok <= 2));
});

test('A.3F and A.5C preserve real system work and genuine classification misconceptions', () => {
  for (const code of ['A.3F','A.5C']) {
    const docs = payloads.get(code).documents;
    assert.ok(docs.some((doc) => doc.type === 'systemsWorkspace' && doc.mode === 'linear'));
    assert.ok(docs.some((doc) => doc.taskType === 'errorAnalysis' && /student/i.test(doc.prompt)));
  }
  const identical = payloads.get('A.5C').documents.find((doc) => doc.taskType === 'errorAnalysis');
  assert.equal(identical?.type, 'systemsWorkspace');
  assert.equal(identical?.mode, 'linear');
  assert.equal(identical?.responseFields, undefined, 'identical-line classification must use the workspace, not a numeric sentinel');
});

test('A.4B keeps authentic association-versus-causation evidence with real choices', () => {
  const docs = payloads.get('A.4B').documents;
  assert.ok(docs.every((doc) => doc.choices?.length === 4));
  assert.ok(docs.some((doc) => /random/i.test(doc.prompt)));
  assert.ok(docs.some((doc) => doc.taskType === 'errorAnalysis'));
  assert.ok(docs.every((doc) => doc.representation !== 'table' || doc.stimulus?.table?.rows?.length));
});

test('A.12B measures function evaluation in all five families', () => {
  const docs = payloads.get('A.12B').documents;
  assert.equal(docs.length, 5);
  assert.equal(docs.some((doc) => /and\s+g\(x\).*find\s+\$?x\$?/i.test(doc.prompt)), false,
    'A.12B must not drift back into reverse/inverse solving');
  assert.ok(docs.some((doc) => /f\([^)]*\+[^)]*\)/i.test(doc.prompt)), 'expression-input evaluation must remain represented');
  assert.ok(docs.some((doc) => /g\(-/i.test(doc.prompt)), 'negative-input evaluation must remain represented');
});

test('A.12E is predominantly symbolic rearrangement and includes a target variable in two terms', () => {
  const docs = payloads.get('A.12E').documents;
  const symbolic = docs.filter((doc) => doc.responseFields?.[0]?.inputProfile === 'expression');
  assert.ok(symbolic.length >= 4, 'at least four A.12E families should require symbolic rearrangement');
  assert.ok(docs.some((doc) => /BOTH terms|both terms/i.test(doc.prompt)));
  assert.ok(docs.some((doc) => doc.taskType === 'errorAnalysis' && /student|error|forget/i.test(doc.prompt)));
});

test('A.7B, A.7C and A.9B preserve content while removing mechanical DOK inflation', () => {
  for (const code of ['A.7B','A.7C','A.9B']) {
    const docs = payloads.get(code).documents;
    const overstated = docs.filter((doc) => doc.dok >= 3 && !['errorAnalysis','comparison','modeling','reverseReasoning','transfer','interpretation'].includes(doc.taskType));
    assert.deepEqual(overstated, []);
  }
  assert.ok(payloads.get('A.7B').documents.some((doc) => /student.*factor|sign error/i.test(doc.prompt)));
  assert.ok(payloads.get('A.7C').documents.some((doc) => /student.*reflect/i.test(doc.prompt)));
  assert.ok(payloads.get('A.9B').documents.some((doc) => /student.*growth factor/i.test(doc.prompt)));
});
