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

// Not every family is generator-backed, and requiring it was the wrong rule.
// The CCMR V2.1 SAT bank ships nine static items — rearranging d = rt for r, or
// the temperature conversion formula — tasks that have nothing to vary. What
// actually matters is that a family is RENDERABLE: either it carries a generator
// that fills its placeholders, or it has no placeholders left to fill. A family
// with `{{capacity}}` in its prompt and no generator would reach a student as
// literal braces, and the old check could not see that at all.
const PLACEHOLDER = /\{\{[^}]+\}\}/;

test('the synchronized active bank contains exactly 3,337 renderable documents', async () => {
  let total = 0;
  for (const name of names.filter((name) => name.endsWith('_pathQuestionBank_seed.json'))) {
    const parsed = JSON.parse(await readFile(resolve(primary, name), 'utf8'));
    assert.ok(Array.isArray(parsed.documents), `${name} has no documents array`);
    total += parsed.documents.length;
    for (const entry of parsed.documents) {
      if (entry?.generator) continue;
      const rendered = JSON.stringify({
        prompt: entry?.prompt ?? '',
        choices: entry?.choices ?? [],
        stimulus: entry?.stimulus ?? null,
        responseFields: entry?.responseFields ?? [],
        solutionReview: entry?.solutionReview ?? null,
      });
      assert.ok(!PLACEHOLDER.test(rendered), `${name}: ${entry?.id} has placeholders but no generator to fill them`);
    }
  }
  assert.equal(total, 3337);
});
