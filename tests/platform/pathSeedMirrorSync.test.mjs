import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const primary = resolve(root, 'seed/pathQuestionBank');
const mirror = resolve(root, 'functions/seeds/pathQuestionBank');
const names = ['PATH_BANK_COVERAGE_MANIFEST.json', ...(await readdir(primary)).filter((name) => name.endsWith('_pathQuestionBank_seed.json')).sort()];

test('all deployable Path-bank files are byte-identical in both bundled locations', async () => {
  assert.equal(names.length, 10);
  for (const name of names) {
    const [a, b] = await Promise.all([readFile(resolve(primary, name)), readFile(resolve(mirror, name))]);
    assert.deepEqual(b, a, `${name} drifted between primary and Functions seed bundles`);
  }
});

test('the synchronized active bank contains exactly 5,186 generator documents', async () => {
  let total = 0;
  for (const name of names.filter((name) => name.endsWith('_pathQuestionBank_seed.json'))) {
    const parsed = JSON.parse(await readFile(resolve(primary, name), 'utf8'));
    assert.ok(Array.isArray(parsed.documents), `${name} has no documents array`);
    total += parsed.documents.length;
    for (const entry of parsed.documents) assert.ok(entry?.generator, `${name} contains a non-generator document`);
  }
  assert.equal(total, 5186);
});
