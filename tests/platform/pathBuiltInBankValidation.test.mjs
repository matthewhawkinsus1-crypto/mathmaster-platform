import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readdirSync, readFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const mathPath = require('../../functions/lib/mathPath.js');
const seedDir = new URL('../../functions/seeds/pathQuestionBank/', import.meta.url);

test('all 3,337 bundled Path templates pass the production template issuer', async () => {
  const files = readdirSync(seedDir).filter((name) => name.endsWith('_pathQuestionBank_seed.json'));
  const items = files.flatMap((name) => {
    const parsed = JSON.parse(readFileSync(new URL(name, seedDir), 'utf8'));
    return Array.isArray(parsed) ? parsed : (parsed.documents || parsed.items || parsed.questions || []);
  });
  assert.equal(items.length, 3337);
  const rejected = [];
  for (const item of items) {
    // eslint-disable-next-line no-await-in-loop
    const plan = await mathPath.buildTemplateIssuePlan(item);
    if (!plan.issuable) rejected.push({ id: item.id, reason: plan.reason });
  }
  assert.deepEqual(rejected, []);
});
