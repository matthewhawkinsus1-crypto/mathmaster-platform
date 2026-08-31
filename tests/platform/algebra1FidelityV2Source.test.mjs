import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const read = (path) => JSON.parse(readFileSync(path, 'utf8'));
const DIR = 'drafts/fidelity-v2/algebra1';
const sourceDocuments = readdirSync(DIR)
  .filter((name) => name.endsWith('.json'))
  .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
  .flatMap((name) => read(join(DIR, name)).documents || []);

const compatibilityDraft = read('drafts/algebra1.json');
const webSeed = read('seed/pathQuestionBank/algebra1_pathQuestionBank_seed.json');
const functionsSeed = read('functions/seeds/pathQuestionBank/algebra1_pathQuestionBank_seed.json');

const codeOf = (doc) => String((doc.alignmentKeys || []).find((key) => String(key).startsWith('texas:')) || '')
  .replace(/^texas:/, '');

test('Algebra I certified Fidelity V2 source has exactly five families for all 49 standards', () => {
  assert.equal(sourceDocuments.length, 245);
  const counts = new Map();
  const ids = new Set();
  for (const doc of sourceDocuments) {
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

test('generated Algebra I compatibility draft matches the certified source packages', () => {
  assert.deepEqual(compatibilityDraft.documents, sourceDocuments);
});

test('both installed Algebra I seed mirrors match the certified source packages', () => {
  assert.deepEqual(webSeed.documents, sourceDocuments);
  assert.deepEqual(functionsSeed.documents, sourceDocuments);
});

test('installed Algebra I mirrors match each other', () => {
  assert.deepEqual(functionsSeed, webSeed);
});
