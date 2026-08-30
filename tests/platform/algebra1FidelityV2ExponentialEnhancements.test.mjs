import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (code) => JSON.parse(readFileSync(`drafts/fidelity-v2/algebra1/${code}.json`, 'utf8'));

test('A.9A connects growth and decay graphs to domain, range and asymptote', () => {
  const payload = read('A.9A');
  assert.match(payload.certificationStatus, /growth-decay-domain-range/);
  assert.equal(payload.documents.length, 5);
  const graphDocs = payload.documents.filter((doc) => doc.type === 'functionInvestigation');
  assert.ok(graphDocs.length >= 4);
  const bases = payload.documents.flatMap((doc) => doc.generator?.parameters?.base?.values || []);
  assert.ok(bases.some((value) => Number(value) > 1), 'A.9A needs growth');
  assert.ok(bases.some((value) => Number(value) > 0 && Number(value) < 1), 'A.9A needs decay');
  assert.ok(graphDocs.some((doc) => doc.analysisRequests?.some((part) => part.kind === 'domain')));
  assert.ok(graphDocs.some((doc) => doc.analysisRequests?.some((part) => part.kind === 'range')));
  assert.ok(payload.documents.some((doc) => /contextual domain/i.test(doc.prompt)));
  assert.ok(payload.documents.some((doc) => doc.taskType === 'errorAnalysis' && /domain/i.test(doc.prompt)));
});

test('A.9D requires actual growth and decay graph construction with y-intercept and asymptote', () => {
  const payload = read('A.9D');
  assert.match(payload.certificationStatus, /growth-decay-graph-construction/);
  assert.equal(payload.documents.length, 5);
  for (const doc of payload.documents) {
    assert.equal(doc.type, 'functionInvestigation');
    assert.ok(doc.pointTasks?.length >= 3, `${doc.id} must require plotted exponential points`);
    assert.ok(doc.analysisRequests?.some((part) => /intercept/i.test(part.label)));
    assert.ok(doc.analysisRequests?.some((part) => /asymptote/i.test(part.label)));
  }
  const bases = payload.documents.flatMap((doc) => doc.generator?.parameters?.base?.values || []);
  assert.ok(bases.some((value) => Number(value) > 1), 'A.9D needs growth graphs');
  assert.ok(bases.some((value) => Number(value) > 0 && Number(value) < 1), 'A.9D needs decay graphs');
  assert.ok(payload.documents.some((doc) => doc.taskType === 'errorAnalysis' && /asymptote/i.test(doc.prompt)));
});
