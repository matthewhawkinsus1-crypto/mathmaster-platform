import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => JSON.parse(readFileSync(path, 'utf8'));
const source = read('drafts/algebra1.json');
const webSeed = read('seed/pathQuestionBank/algebra1_pathQuestionBank_seed.json');
const functionsSeed = read('functions/seeds/pathQuestionBank/algebra1_pathQuestionBank_seed.json');

const codeOf = (doc) => String((doc.alignmentKeys || []).find((key) => String(key).startsWith('texas:')) || '')
  .replace(/^texas:/, '');

test('Algebra I Fidelity V2 source has exactly five families for all 49 standards', () => {
  assert.equal(source.documents.length, 245);
  const counts = new Map();
  const ids = new Set();
  for (const doc of source.documents) {
    assert.ok(doc.id, 'every family has an id');
    assert.equal(ids.has(doc.id), false, `duplicate family id ${doc.id}`);
    ids.add(doc.id);
    const code = codeOf(doc);
    assert.ok(code.startsWith('A.'), `${doc.id} must have an Algebra I Texas alignment`);
    counts.set(code, (counts.get(code) || 0) + 1);
  }
  assert.equal(counts.size, 49);
  for (const [code, count] of counts) assert.equal(count, 5, `${code} must have five production families`);
});

test('both installed Algebra I seed mirrors match the authoring draft documents', () => {
  assert.deepEqual(webSeed.documents, source.documents);
  assert.deepEqual(functionsSeed.documents, source.documents);
});

test('installed Algebra I mirrors match each other', () => {
  assert.deepEqual(functionsSeed, webSeed);
});
