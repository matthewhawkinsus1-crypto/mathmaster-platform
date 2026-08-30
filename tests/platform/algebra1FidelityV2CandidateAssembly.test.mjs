import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const read = (path) => JSON.parse(readFileSync(path, 'utf8'));
const codeOf = (doc) => String((doc.alignmentKeys || []).find((key) => String(key).startsWith('texas:')) || '')
  .replace(/^texas:/, '');

const base = read('drafts/algebra1.json').documents;
const overrideDir = 'drafts/fidelity-v2/algebra1';
const payloads = readdirSync(overrideDir)
  .filter((name) => name.endsWith('.json'))
  .sort()
  .map((name) => read(join(overrideDir, name)));

const overrideCodes = new Set(payloads.map((payload) => payload.standard));
const replacements = payloads.flatMap((payload) => payload.documents);
const candidate = [
  ...base.filter((doc) => !overrideCodes.has(codeOf(doc))),
  ...replacements,
];

const EXPECTED_STAGED = [
  'A.8A', 'A.9C',
  'A.10A', 'A.10B', 'A.10C', 'A.10D', 'A.10E', 'A.10F',
  'A.11B', 'A.12A', 'A.12D', 'A.2C', 'A.2H', 'A.2I',
];

test('current staged Fidelity V2 candidate replaces fourteen complete standards only', () => {
  assert.deepEqual([...overrideCodes].sort(), [...EXPECTED_STAGED].sort());
  assert.equal(replacements.length, 70);
  assert.equal(candidate.length, 245);

  const counts = new Map();
  const ids = new Set();
  for (const doc of candidate) {
    const code = codeOf(doc);
    counts.set(code, (counts.get(code) || 0) + 1);
    assert.equal(ids.has(doc.id), false, `duplicate candidate id ${doc.id}`);
    ids.add(doc.id);
  }
  assert.equal(counts.size, 49);
  for (const [code, count] of counts) assert.equal(count, 5, `${code} must have exactly five candidate families`);
});

test('unstaged Algebra I families are carried forward without mutation', () => {
  const baseUnstaged = base.filter((doc) => !overrideCodes.has(codeOf(doc)));
  const candidateUnstaged = candidate.filter((doc) => !overrideCodes.has(codeOf(doc)));
  const byId = new Map(candidateUnstaged.map((doc) => [doc.id, doc]));
  assert.equal(baseUnstaged.length, 175);
  assert.equal(candidateUnstaged.length, 175);
  for (const doc of baseUnstaged) {
    assert.ok(byId.has(doc.id), `candidate dropped unstaged family ${doc.id}`);
    assert.deepEqual(byId.get(doc.id), doc, `candidate mutated unstaged family ${doc.id}`);
  }
});

test('staged standards contain only new Fidelity V2 family ids', () => {
  const oldIds = new Set(base.filter((doc) => overrideCodes.has(codeOf(doc))).map((doc) => doc.id));
  const oldFamilyIds = new Set(base.filter((doc) => overrideCodes.has(codeOf(doc))).map((doc) => doc.familyId));
  for (const doc of replacements) {
    assert.equal(oldIds.has(doc.id), false, `${doc.id} reuses a published id`);
    assert.equal(oldFamilyIds.has(doc.familyId), false, `${doc.familyId} reuses a published familyId`);
    assert.ok(doc.id.includes('_v2_'));
    assert.ok(doc.familyId.includes(':v2-'));
  }
});
