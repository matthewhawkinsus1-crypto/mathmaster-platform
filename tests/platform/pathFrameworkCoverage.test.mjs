import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildCoverageIndex,
  frameworkCoverageKnown,
  explainCoverage,
  isFrameworkSkillLaunchable,
  isSkillLaunchable,
} from '../../functions/shared/pathCoverage.mjs';

const item = ({ id, code, framework = null, band = 2 }) => ({
  id,
  familyId: `family:${id}`,
  active: true,
  alignmentKeys: [`texas:${code}`],
  difficultyBand: band,
  dok: band === 2 ? 1 : 2,
  questionType: 'number',
  prompt: `Practice ${code}`,
  expected: '1',
  solution: { reasoning: ['Test fixture'] },
  ...(framework ? { assessmentContext: { framework, examStyle: true } } : {}),
});

test('course coverage and framework publication coverage are separate promises', () => {
  const bankItems = [
    ...Array.from({ length: 5 }, (_, i) => item({
      id: `course-a12c-${i}`, code: 'A.12C', band: i % 2 ? 3 : 2,
    })),
    item({ id: 'sat-a12b', code: 'A.12B', framework: 'digitalSAT' }),
    item({ id: 'act-a12c', code: 'A.12C', framework: 'act' }),
  ];
  const plans = Object.fromEntries(bankItems.map((entry) => [entry.id, { issuable: true }]));

  const index = buildCoverageIndex({
    courseId: 'algebra1',
    wheelTeks: ['A.12B', 'A.12C'],
    bankItems,
    plans,
    generatedAt: 'test',
  });

  assert.equal(index.schemaVersion, 2);
  assert.equal(isSkillLaunchable(index, 'A.12C'), true);
  assert.equal(isSkillLaunchable(index, 'A.12B'), false, 'SAT-only content must not create course coverage');

  assert.equal(frameworkCoverageKnown(index, 'digitalSAT'), true);
  assert.equal(isFrameworkSkillLaunchable(index, 'A.12B', 'digitalSAT'), true);
  assert.equal(isFrameworkSkillLaunchable(index, 'A.12C', 'digitalSAT'), false);
  assert.equal(isFrameworkSkillLaunchable(index, 'A.12C', 'act'), true);
  assert.equal(
    explainCoverage(index, 'A.12B'),
    'No My Math Path practice content has been published for A.12B yet.',
  );
});
