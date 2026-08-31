import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const functionsSource = readFileSync('functions/index.js', 'utf8');
const serviceSource = readFileSync('src/platform/path/pathCoverageService.js', 'utf8');
const adminSource = readFileSync('src/components/teacher/PathCoverageAudit.jsx', 'utf8');
const deploySource = readFileSync('scripts/deploy-v5-preproduction.sh', 'utf8');

test('existing-install refresh package contains course banks plus ASVAB and excludes release-managed CCMR', () => {
  const block = functionsSource.match(/const LIVE_BUILT_IN_REFRESH_SEED_FILES = Object\.freeze\(\[([\s\S]*?)\]\);/);
  assert.ok(block, 'LIVE_BUILT_IN_REFRESH_SEED_FILES must exist');
  const files = block[1];

  [
    'algebra1_pathQuestionBank_seed.json',
    'algebra2_pathQuestionBank_seed.json',
    'grade6_pathQuestionBank_seed.json',
    'grade7_pathQuestionBank_seed.json',
    'grade8_pathQuestionBank_seed.json',
    'asvab_pathQuestionBank_seed.json',
  ].forEach((name) => assert.match(files, new RegExp(name.replaceAll('.', '\\.'), 'i')));

  assert.doesNotMatch(files, /digitalSAT_pathQuestionBank_seed\.json/);
  assert.doesNotMatch(files, /act_pathQuestionBank_seed\.json/);
  assert.doesNotMatch(files, /tsia2_pathQuestionBank_seed\.json/);
  assert.match(functionsSource, /LIVE_BUILT_IN_REFRESH_FRAMEWORKS = Object\.freeze\(\["course", "asvab"\]\)/);
});

test('course plus ASVAB refresh validates before writing and cannot clean up SAT ACT TSIA2', () => {
  const start = functionsSource.indexOf('exports.refreshBuiltInCourseAndAsvabPathBanks');
  const end = functionsSource.indexOf('exports.initializeStarterPathQuestionBank', start);
  assert.ok(start >= 0 && end > start, 'refreshBuiltInCourseAndAsvabPathBanks callable must exist');
  const block = functionsSource.slice(start, end);

  assert.match(block, /requireRootAdmin/);
  assert.match(block, /processPathSeedImport\(\{ db, actor, items: taggedItems, dryRun: true \}\)/);
  assert.match(block, /processPathSeedImport\(\{ db, actor, items: taggedItems, dryRun: false \}\)/);
  assert.ok(
    block.indexOf('dryRun: true') < block.indexOf('dryRun: false'),
    'the whole package must validate before writes begin',
  );
  assert.match(block, /removeSupersededBuiltInCourseAndAsvabRecords/);
  assert.match(block, /rebuildStoredPathCoverage/);
  assert.doesNotMatch(block, /beginAssessmentContentReleaseUpdate/);
  assert.doesNotMatch(block, /COORDINATED_CCMR_RELEASE_SEED_FILES/);

  const cleanupStart = functionsSource.indexOf('async function removeSupersededBuiltInCourseAndAsvabRecords');
  const cleanupEnd = functionsSource.indexOf('async function removeSupersededBuiltInAssessmentSeedRecords', cleanupStart);
  const cleanup = functionsSource.slice(cleanupStart, cleanupEnd);
  assert.match(cleanup, /LIVE_BUILT_IN_REFRESH_FRAMEWORKS\.includes\(framework\)/);
});

test('admin client exposes separate protected refresh operations', () => {
  assert.match(serviceSource, /refreshBuiltInCourseAndAsvabPathBanks/);
  assert.match(serviceSource, /httpsCallable\(functions, 'refreshBuiltInCourseAndAsvabPathBanks'\)/);
  assert.match(serviceSource, /refreshReleasedCcmrPathBanks/);
  assert.match(serviceSource, /httpsCallable\(functions, 'refreshReleasedCcmrPathBanks'\)/);

  assert.match(adminSource, /Refresh course \+ ASVAB built-ins/);
  assert.match(adminSource, /Refresh released SAT \/ ACT \/ TSIA2/);
  assert.match(adminSource, /Initialize built-in bank \(fresh install\)/);
  assert.match(adminSource, /SAT, ACT, and TSIA2 will not be changed/);
  assert.match(adminSource, /ASVAB and course Path content will not be changed/);
});

test('deployment helper directs an existing installation to both protected refreshes', () => {
  assert.match(deploySource, /Refresh course \+ ASVAB built-ins/);
  assert.match(deploySource, /Refresh released SAT \/ ACT \/ TSIA2/);
  assert.match(deploySource, /Initialize built-in bank \(fresh install\)/);
});
