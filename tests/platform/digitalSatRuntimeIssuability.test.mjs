import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

import {
  compileDigitalSatProductionSeed,
} from '../../scripts/lib/digital-sat-production-seed.mjs';

const require = createRequire(import.meta.url);
const { buildTemplateIssuePlan } = require('../../functions/lib/mathPath.js');

test('every compiled Digital SAT V2.1 family is issuable by the production runtime', async () => {
  const seed = await compileDigitalSatProductionSeed();
  assert.equal(seed.items.length, 664);

  const failures = [];
  for (const item of seed.items) {
    // eslint-disable-next-line no-await-in-loop
    const plan = await buildTemplateIssuePlan(item, { samples: 8 });
    if (!plan.issuable) {
      failures.push({
        id: item.id,
        familyId: item.familyId,
        reason: plan.reason,
        samples: plan.samples,
      });
    }
  }

  assert.deepEqual(
    failures,
    [],
    `Production runtime rejected ${failures.length} Digital SAT V2.1 families:\n${JSON.stringify(failures, null, 2)}`,
  );
});
