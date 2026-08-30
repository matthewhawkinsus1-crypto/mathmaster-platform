import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => JSON.parse(readFileSync(path, 'utf8'));
const source = read('drafts/algebra2.json');
const webSeed = read('seed/pathQuestionBank/algebra2_pathQuestionBank_seed.json');
const functionsSeed = read('functions/seeds/pathQuestionBank/algebra2_pathQuestionBank_seed.json');

const codeOf = (doc) => String((doc.alignmentKeys || []).find((key) => String(key).startsWith('texas:A2.')) || '')
  .replace(/^texas:/, '');

test('Algebra II Fidelity V2 source has exactly five families for all 48 standards', () => {
  assert.equal(source.documents.length, 240);
  const counts = new Map();
  const ids = new Set();
  for (const doc of source.documents) {
    assert.ok(doc.id);
    assert.equal(ids.has(doc.id), false, `duplicate family id ${doc.id}`);
    ids.add(doc.id);
    const code = codeOf(doc);
    assert.match(code, /^A2\.[2-8][A-Z]$/);
    counts.set(code, (counts.get(code) || 0) + 1);
  }
  assert.equal(counts.size, 48);
  for (const [code, count] of counts) assert.equal(count, 5, `${code} must have five production families`);
});

test('both installed Algebra II seed mirrors match the reconciled authoring draft', () => {
  assert.deepEqual(webSeed.documents, source.documents);
  assert.deepEqual(functionsSeed.documents, source.documents);
});

test('the reconciled A2.2B inverse family preserves the full inverse reflection workflow', () => {
  const doc = source.documents.find((entry) => entry.id === 'mm_A2_2B_gen2_inverse-point-graph');
  assert.equal(doc?.familyVersion, 3);
  assert.equal(doc?.type, 'functionInvestigation');
  assert.equal(doc?.inverseReflection?.enabled, true);
  assert.equal(doc?.inverseReflection?.requireInverseSketch, true);
  assert.equal(doc?.inverseReflection?.requireInverseEquation, true);
  assert.ok(doc?.inverseReflection?.sourceTaskIds?.length >= 2);
});
