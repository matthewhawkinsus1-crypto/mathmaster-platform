import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const functionsIndex = readFileSync('functions/index.js', 'utf8');
const service = readFileSync('src/platform/path/pathCoverageService.js', 'utf8');
const admin = readFileSync('src/components/teacher/PathCoverageAudit.jsx', 'utf8');

test('existing-install course refresh cannot overwrite assessment frameworks', () => {
  assert.match(functionsIndex, /exports\.refreshBuiltInCoursePathBank/);
  assert.match(functionsIndex, /loadBuiltInCoursePathSeed/);
  assert.match(functionsIndex, /removeSupersededBuiltInCourseSeedRecords/);
  assert.match(functionsIndex, /if \(framework !== "course"\) return false/);
});

test('ASVAB has an independent release-managed refresh', () => {
  assert.match(functionsIndex, /exports\.refreshReleasedAsvabPathBank/);
  assert.match(functionsIndex, /ccmrContentRelease: ASVAB_CONTENT_RELEASE/);
  assert.match(functionsIndex, /updateOperation: "asvab-refresh"/);
  assert.match(functionsIndex, /RELEASE_MANAGED_ASSESSMENT_FRAMEWORKS/);
});

test('coordinated SAT ACT TSIA2 release stays separate from ASVAB', () => {
  assert.match(functionsIndex, /COORDINATED_CCMR_RELEASE_FRAMEWORKS = Object\.freeze\(\["act", "digitalSAT", "tsia2"\]\)/);
  assert.match(functionsIndex, /exports\.refreshReleasedCcmrPathBanks/);
  assert.match(functionsIndex, /RELEASE_MANAGED_ASSESSMENT_FRAMEWORKS = Object\.freeze\(\[\.\.\.COORDINATED_CCMR_RELEASE_FRAMEWORKS, "asvab"\]\)/);
});

test('admin client exposes all three existing-install activation controls', () => {
  assert.match(service, /refreshBuiltInCoursePathBank/);
  assert.match(service, /refreshReleasedAsvabPathBank/);
  assert.match(service, /refreshReleasedCcmrPathBanks/);
  assert.match(admin, /Refresh course Path bank/);
  assert.match(admin, /Refresh ASVAB release/);
  assert.match(admin, /Refresh SAT \/ ACT \/ TSIA2 release/);
  assert.match(admin, /Fresh installation only/);
});
