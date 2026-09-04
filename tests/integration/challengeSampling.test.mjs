// Prove the challenge bank is reachable, against a real Firestore.
//
// HOW TO RUN:  npm run test:challenge-finish
//
// The bug this covers could not be seen in a unit test, because it was entirely
// a property of how Firestore returns unordered results: `.limit(300)` with no
// ordering yields document-ID order, so a mixed Algebra I game drew the same
// first 300 of 837 questions on every launch. Roughly two thirds of the bank
// was unreachable and the shuffle downstream hid it, because each game looked
// varied while the pool behind it never moved.
//
// The assertion that matters is coverage across repeated draws, and that needs
// a real collection with real ordering behaviour.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../..');
const require = createRequire(import.meta.url);

assert.ok(process.env.FIRESTORE_EMULATOR_HOST, 'FIRESTORE_EMULATOR_HOST must be set.');

require(path.join(repo, 'functions/index.js'));
const admin = require(path.join(repo, 'functions/node_modules/firebase-admin'));
const { sampleBankWindow, randomOffset } = require(path.join(repo, 'functions/lib/challengeSampling.js'));
const db = admin.firestore();

const COLLECTION = 'samplingHarnessBank';
const TOTAL = 120;
const PAGE = 20;

// Ids shaped like the real bank's: authored strings, not auto-ids.
const idFor = (index) => `mm_alg1_topic${String(index).padStart(3, '0')}_v2`;

const collection = db.collection(COLLECTION);
const existing = await collection.get();
for (let start = 0; start < existing.docs.length; start += 400) {
  const batch = db.batch();
  existing.docs.slice(start, start + 400).forEach((docSnapshot) => batch.delete(docSnapshot.ref));
  await batch.commit();
}
for (let start = 0; start < TOTAL; start += 400) {
  const batch = db.batch();
  for (let index = start; index < Math.min(start + 400, TOTAL); index += 1) {
    batch.set(collection.doc(idFor(index)), { courseId: 'algebra1', index });
  }
  await batch.commit();
}

const baseQuery = collection.where('courseId', '==', 'algebra1');

test('a single draw returns a full page', async () => {
  const docs = await sampleBankWindow({ baseQuery, pageSize: PAGE });
  assert.equal(docs.length, PAGE);
});

test('repeated draws reach far more of the bank than one page holds', async () => {
  // The old loader would return exactly the same PAGE documents every time, so
  // this union would never exceed PAGE however many draws were taken.
  const seen = new Set();
  for (let attempt = 0; attempt < 25; attempt += 1) {
    const docs = await sampleBankWindow({ baseQuery, pageSize: PAGE });
    docs.forEach((docSnapshot) => seen.add(docSnapshot.id));
  }
  assert.ok(
    seen.size > PAGE * 2,
    `25 draws of ${PAGE} reached only ${seen.size} of ${TOTAL} documents; the bank is still effectively one page`,
  );
});

test('an offset near the end wraps instead of returning a short page', async () => {
  // Otherwise a game launched on an unlucky offset would be short of questions.
  const docs = await sampleBankWindow({ baseQuery, pageSize: PAGE, offset: TOTAL - 3 });
  assert.equal(docs.length, PAGE);
});

test('an offset at the very start still returns a full page', async () => {
  const docs = await sampleBankWindow({ baseQuery, pageSize: PAGE, offset: 0 });
  assert.equal(docs.length, PAGE);
});

test('a page never contains the same document twice', async () => {
  // The wrap-around reads the collection twice; overlapping ranges would let a
  // game schedule the same question for two different rounds.
  for (const offset of [0, TOTAL - 1, TOTAL - 5, Math.floor(TOTAL / 2)]) {
    const docs = await sampleBankWindow({ baseQuery, pageSize: PAGE, offset });
    const ids = docs.map((docSnapshot) => docSnapshot.id);
    assert.equal(new Set(ids).size, ids.length, `duplicate document in the page for offset ${offset}`);
  }
});

test('different offsets really do return different documents', async () => {
  const first = await sampleBankWindow({ baseQuery, pageSize: PAGE, offset: 0 });
  const later = await sampleBankWindow({ baseQuery, pageSize: PAGE, offset: 60 });
  const firstIds = new Set(first.map((d) => d.id));
  const overlap = later.filter((d) => firstIds.has(d.id)).length;
  assert.equal(overlap, 0, 'two windows 60 apart in a 120-document bank must not overlap');
});

test('a bank smaller than a page returns everything, once', async () => {
  const small = db.collection('samplingHarnessSmall');
  const prior = await small.get();
  const clear = db.batch();
  prior.docs.forEach((docSnapshot) => clear.delete(docSnapshot.ref));
  await clear.commit();
  const seed = db.batch();
  ['aaa', 'mmm', 'zzz'].forEach((id) => seed.set(small.doc(id), { courseId: 'algebra1' }));
  await seed.commit();

  const docs = await sampleBankWindow({
    baseQuery: small.where('courseId', '==', 'algebra1'),
    pageSize: PAGE,
  });
  assert.equal(docs.length, 3);
  assert.equal(new Set(docs.map((d) => d.id)).size, 3);
});

test('the random offset stays inside the collection', () => {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const offset = randomOffset(TOTAL);
    assert.ok(offset >= 0 && offset < TOTAL, `offset ${offset} is outside 0..${TOTAL - 1}`);
  }
});
