import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { effectivePathVariants } from '../../functions/shared/pathQuestionGeneration.mjs';
import { auditPathQuestionQuality } from '../../functions/shared/pathQuestionQuality.mjs';

const COURSE_DIRS = [
  'drafts/fidelity-v2/algebra1',
  'drafts/fidelity-v2/algebra2',
];

const certifiedDocuments = () => COURSE_DIRS.flatMap((dir) => (
  readdirSync(dir)
    .filter((name) => name.endsWith('.json'))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    .flatMap((name) => JSON.parse(readFileSync(join(dir, name), 'utf8')).documents || [])
));

test('every effective certified Algebra I/II Path row keeps hints non-revealing', () => {
  const leaks = [];
  for (const family of certifiedDocuments()) {
    for (const { template, coverageKey } of effectivePathVariants(family)) {
      const audit = auditPathQuestionQuality(template);
      const hintLeaks = audit.blockers
        .filter((issue) => issue.code === 'hint-reveals-answer')
        .map((issue) => issue.message);
      if (hintLeaks.length) {
        leaks.push({
          id: family.id,
          coverageKey: coverageKey || 'base',
          hintLeaks,
        });
      }
    }
  }

  assert.deepEqual(
    leaks,
    [],
    `${leaks.length} effective certified Algebra rows contain answer-giving hints:\n${JSON.stringify(leaks, null, 2)}`,
  );
});
