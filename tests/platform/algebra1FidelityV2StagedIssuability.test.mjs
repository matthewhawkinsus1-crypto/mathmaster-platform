import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { buildTemplateIssuePlan } = require('../../functions/lib/mathPath.js');

const DIR = 'drafts/fidelity-v2/algebra1';
const payloads = readdirSync(DIR)
  .filter((name) => name.endsWith('.json'))
  .sort()
  .map((name) => JSON.parse(readFileSync(join(DIR, name), 'utf8')));

const documents = payloads.flatMap((payload) => payload.documents || []);

test('every staged Algebra I Fidelity V2 generator passes the production template issue gate', async () => {
  assert.ok(documents.length >= 55, 'expected the staged bank to contain the current Fidelity V2 replacements');

  for (const doc of documents) {
    // Twelve deterministic samples gives each template more coverage than the
    // production import default while still exercising the exact same gate.
    // eslint-disable-next-line no-await-in-loop
    const plan = await buildTemplateIssuePlan(doc, { samples: 12 });
    assert.equal(plan.issuable, true, `${doc.id} is not production-issuable: ${plan.reason || 'unknown'}`);
    assert.equal(plan.reason, null, `${doc.id} returned an unexpected issue reason`);
    assert.equal(plan.samples, 12, `${doc.id} did not generate all sampled instances`);
  }
});
