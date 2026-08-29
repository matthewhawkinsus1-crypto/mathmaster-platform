import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ASSESSMENT_COVERAGE_GAP,
  ASSESSMENT_COVERAGE_MISMATCH,
  buildAssessmentCoverageAudit,
  classifyAssessmentCoverage,
} from '../../src/platform/ccmr/assessmentCoverageAudit.js';

const record = (published, authoredCount = published ? 1 : 0) => ({
  displayCode: 'A.12C',
  published,
  authoredCount,
  activeCount: published ? 1 : 0,
  familyCount: published ? 1 : 0,
  issuableCount: published ? 1 : 0,
});

const frameworks = ({ code = 'A.12C', overrides = {} } = {}) => ({
  digitalSAT: { skills: { [code]: overrides.digitalSAT ?? record(false) }, offWheel: {} },
  act: { skills: { [code]: overrides.act ?? record(false) }, offWheel: {} },
  tsia2: { skills: { [code]: overrides.tsia2 ?? record(false) }, offWheel: {} },
  asvab: { skills: { [code]: overrides.asvab ?? record(false) }, offWheel: {} },
});

test('classification separates a broad crosswalk gap from an authored publication defect', () => {
  assert.deepEqual(
    classifyAssessmentCoverage({ mapped: true, published: false, authoredCount: 0 }),
    { mismatch: null, gap: ASSESSMENT_COVERAGE_GAP.CROSSWALK_ONLY },
  );
  assert.deepEqual(
    classifyAssessmentCoverage({ mapped: true, published: false, authoredCount: 2 }),
    {
      mismatch: ASSESSMENT_COVERAGE_MISMATCH.CROSSWALK_WITHOUT_PUBLISHED_PRACTICE,
      gap: null,
    },
  );
  assert.deepEqual(
    classifyAssessmentCoverage({ mapped: false, published: true, authoredCount: 1 }),
    {
      mismatch: ASSESSMENT_COVERAGE_MISMATCH.PUBLISHED_WITHOUT_CROSSWALK,
      gap: null,
    },
  );
});

test('A.12C-style authored-but-unpublished content remains an admin mismatch', () => {
  const index = {
    schemaVersion: 2,
    skills: { 'A.12C': { studentReady: true } },
    frameworks: frameworks({
      overrides: {
        digitalSAT: record(false, 1),
        act: record(true),
        tsia2: record(true),
        asvab: record(false, 0),
      },
    }),
  };

  const audit = buildAssessmentCoverageAudit(index);
  assert.equal(audit.known, true);
  assert.deepEqual(audit.rows.map((row) => [row.teksCode, row.framework, row.mismatch]), [[
    'A.12C',
    'digitalSAT',
    ASSESSMENT_COVERAGE_MISMATCH.CROSSWALK_WITHOUT_PUBLISHED_PRACTICE,
  ]]);
});

test('the observed A.12C Digital SAT crosswalk with no authored bank content is informational, not a release mismatch', () => {
  const index = {
    schemaVersion: 2,
    skills: { 'A.12C': { studentReady: true } },
    frameworks: frameworks({ code: 'A.12C' }),
  };

  const audit = buildAssessmentCoverageAudit(index);
  const satMismatch = audit.rows.find((row) => (
    row.teksCode === 'A.12C' && row.framework === 'digitalSAT'
  ));
  const satGap = audit.gaps.find((row) => (
    row.teksCode === 'A.12C' && row.framework === 'digitalSAT'
  ));

  assert.equal(satMismatch, undefined);
  assert.equal(satGap?.gap, ASSESSMENT_COVERAGE_GAP.CROSSWALK_ONLY);
});
