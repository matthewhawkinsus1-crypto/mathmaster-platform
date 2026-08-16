import test from 'node:test';
import assert from 'node:assert/strict';

import { buildSimulatorCoverageIndex } from '../../src/platform/simulation/simulatorCoverageIndex.js';
import { isSkillLaunchable } from '../../functions/shared/pathCoverage.mjs';

const family = (index, code = 'A.12E') => ({
  id: `seed_${code.replace(/\W/g, '_')}_${index}`,
  active: true,
  alignmentKeys: [`texas:${code}`],
  familyId: `path-seed:${code}:family-${index}`,
  difficultyBand: index <= 2 ? 2 : 4,
});

test('simulator coverage comes from the same secure-bank snapshot', () => {
  const index = buildSimulatorCoverageIndex(
    [1, 2, 3, 4, 5].map((n) => family(n)),
    { courseId: 'algebra1' },
  );
  assert.equal(isSkillLaunchable(index, 'A.12E'), true);
});

test('simulator still refuses a genuinely thin bank', () => {
  const index = buildSimulatorCoverageIndex(
    [1, 2, 3, 4].map((n) => family(n)),
    { courseId: 'algebra1' },
  );
  assert.equal(isSkillLaunchable(index, 'A.12E'), false);
});
