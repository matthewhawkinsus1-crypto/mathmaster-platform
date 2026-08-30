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

const REQUIRED_REBUILDS = [
  'A.2C', 'A.2H', 'A.2I',
  'A.3D', 'A.3H',
  'A.4A', 'A.4C',
  'A.8A', 'A.8B',
  'A.9C', 'A.9E',
  'A.10A', 'A.10B', 'A.10C', 'A.10D', 'A.10E', 'A.10F',
  'A.11B',
  'A.12A', 'A.12D',
];

test('final Fidelity V2 candidate replaces all 49 Algebra I standards with complete five-family packages', () => {
  for (const code of REQUIRED_REBUILDS) {
    assert.equal(overrideCodes.has(code), true, `required REBUILD standard ${code} is not staged`);
  }
  assert.equal(overrideCodes.size, 49, 'Algebra I certification must stage every content standard');
  assert.equal(replacements.length, 245, '49 standards × 5 V2 families must produce 245 replacements');
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
  const expectedUnstaged = (49 - overrideCodes.size) * 5;
  assert.equal(baseUnstaged.length, expectedUnstaged);
  assert.equal(candidateUnstaged.length, expectedUnstaged);
  for (const doc of baseUnstaged) {
    assert.ok(byId.has(doc.id), `candidate dropped unstaged family ${doc.id}`);
    assert.deepEqual(byId.get(doc.id), doc, `candidate mutated unstaged family ${doc.id}`);
  }
});

test('staged standards use the Fidelity V2 id namespace and never fall back to legacy generator ids', () => {
  const ids = new Set();
  const familyIds = new Set();
  for (const doc of replacements) {
    assert.equal(ids.has(doc.id), false, `duplicate staged id ${doc.id}`);
    assert.equal(familyIds.has(doc.familyId), false, `duplicate staged familyId ${doc.familyId}`);
    ids.add(doc.id);
    familyIds.add(doc.familyId);
    assert.ok(doc.id.includes('_v2_'), `${doc.id} is outside the V2 id namespace`);
    assert.ok(doc.familyId.includes(':v2-'), `${doc.familyId} is outside the V2 family namespace`);
    assert.doesNotMatch(doc.id, /_gen\d+_/i);
    assert.doesNotMatch(doc.familyId, /:gen-/i);
    assert.ok(Number(doc.familyVersion) >= 3, `${doc.familyId} must carry the V2 family version`);
  }
});
