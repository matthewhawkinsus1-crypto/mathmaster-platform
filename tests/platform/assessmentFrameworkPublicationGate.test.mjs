import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CCMR_REASON,
  READINESS,
  explainAssessmentRecommendation,
  getAssessmentPathOptions,
} from '../../src/platform/ccmr/assessmentPathways.js';

const pathOptions = {
  recommended: [{
    skillId: 'teks:A.12C',
    label: 'Recursive sequences',
    status: 'recommended',
    mastery: 0.82,
    unmetPrerequisites: [],
  }],
};

const coverage = (published) => ({
  schemaVersion: 2,
  skills: { 'A.12C': { studentReady: true } },
  frameworks: {
    digitalSAT: {
      skills: {
        'A.12C': {
          displayCode: 'A.12C',
          published,
          familyCount: published ? 1 : 0,
          issuableCount: published ? 1 : 0,
        },
      },
      offWheel: {},
    },
  },
});

test('a crosswalk alone cannot advertise Digital SAT practice', () => {
  const options = getAssessmentPathOptions({
    skillId: 'teks:A.12C',
    pathOptions,
    coverage: coverage(false),
  });
  const sat = options.pathways.find((entry) => entry.framework === 'digitalSAT');

  assert.equal(sat.available, false);
  assert.equal(sat.status, READINESS.NOT_AVAILABLE);
  assert.ok(sat.reasonCodes.includes(CCMR_REASON.CROSSWALK_WITHOUT_PUBLISHED_PRACTICE));
  assert.match(explainAssessmentRecommendation({
    ...sat,
    reasons: sat.reasonCodes,
  }), /practice is not available/i);
  assert.doesNotMatch(explainAssessmentRecommendation({
    ...sat,
    reasons: sat.reasonCodes,
  }), /\byet\b/i);
});

test('published Digital SAT practice remains launchable when the crosswalk also exists', () => {
  const options = getAssessmentPathOptions({
    skillId: 'teks:A.12C',
    pathOptions,
    coverage: coverage(true),
  });
  const sat = options.pathways.find((entry) => entry.framework === 'digitalSAT');
  assert.equal(sat.available, true);
  assert.ok(sat.reasonCodes.includes(CCMR_REASON.PUBLISHED_ASSESSMENT_PRACTICE));
});
