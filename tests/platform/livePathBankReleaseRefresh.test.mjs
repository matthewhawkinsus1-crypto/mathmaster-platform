import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (path) => readFileSync(resolve(path), 'utf8');
const json = (path) => JSON.parse(read(path));

const functionsSource = read('functions/index.js');
const serviceSource = read('src/platform/path/pathCoverageService.js');
const uiSource = read('src/components/teacher/PathCoverageAudit.jsx');
const deploySource = read('scripts/deploy-v5-preproduction.sh');

const protectedFrameworks = new Set(['digitalSAT', 'act', 'tsia2']);
const refreshableSeedNames = [
  'grade6_pathQuestionBank_seed.json',
  'grade7_pathQuestionBank_seed.json',
  'grade8_pathQuestionBank_seed.json',
  'algebra1_pathQuestionBank_seed.json',
  'algebra2_pathQuestionBank_seed.json',
  'asvab_pathQuestionBank_seed.json',
];

test('existing-install built-in refresh contains only course + ASVAB seed files', () => {
  const docs = refreshableSeedNames.flatMap((name) => {
    const parsed = json(`functions/seeds/pathQuestionBank/${name}`);
    return parsed.documents || parsed.items || parsed.questions || parsed;
  });
  assert.ok(docs.length > 1000, 'the refresh package should be the real built-in course + ASVAB bank');
  assert.equal(
    docs.some((question) => protectedFrameworks.has(String(question?.assessmentContext?.framework || ''))),
    false,
    'course + ASVAB refresh package must not contain SAT/ACT/TSIA2',
  );

  const manifest = json('functions/seeds/pathQuestionBank/PATH_BANK_COVERAGE_MANIFEST.json');
  assert.equal(
    docs.length,
    Number(manifest?.totals?.courseDocuments || 0) + Number(manifest?.frameworks?.asvab?.documents || 0),
    'refresh package should equal course inventory plus the complete ASVAB inventory',
  );
});

test('server exposes a scoped root-admin refresh instead of reusing fresh-install initialization', () => {
  assert.match(functionsSource, /REFRESHABLE_BUILT_IN_PATH_SEED_FILES/);
  assert.match(functionsSource, /exports\.refreshBuiltInCourseAndAsvabPathBank\s*=\s*onCall/);

  const start = functionsSource.indexOf('exports.refreshBuiltInCourseAndAsvabPathBank');
  const end = functionsSource.indexOf('exports.refreshReleasedCcmrPathBanks', start);
  assert.ok(start >= 0 && end > start, 'course + ASVAB refresh callable should precede the coordinated refresh');
  const block = functionsSource.slice(start, end);

  assert.match(block, /requireRootAdmin\(request\)/);
  assert.match(block, /existingBank\.empty/);
  assert.match(block, /manifest\?\.status === "updating"/);
  assert.match(block, /loadRefreshableBuiltInPathSeed\(\)/);
  assert.match(block, /COORDINATED_CCMR_RELEASE_FRAMEWORKS\.includes\(framework\)/);
  assert.match(block, /dryRun: true/);
  assert.match(block, /dryRun: false/);
  assert.ok(block.indexOf('dryRun: true') < block.indexOf('dryRun: false'), 'whole package validates before write');
  assert.match(block, /removeSupersededRefreshableBuiltInPathSeedRecords/);
  assert.match(block, /rebuildStoredPathCoverage\(db\)/);
});

test('fresh-install initialization remains fresh-install-only', () => {
  const start = functionsSource.indexOf('exports.initializeStarterPathQuestionBank');
  const end = functionsSource.indexOf('exports.refreshBuiltInCourseAndAsvabPathBank', start);
  const block = functionsSource.slice(start, end);
  assert.match(block, /Starter Path-bank initialization is fresh-install-only/);
  assert.match(block, /retryingFailedStarterInitialization/);
});

test('coordinated SAT ACT TSIA2 refresh remains separate and ASVAB-excluding', () => {
  const start = functionsSource.indexOf('exports.refreshReleasedCcmrPathBanks');
  const end = functionsSource.indexOf('exports.withdrawQuestionFromPathBank', start);
  const block = functionsSource.slice(start, end);
  assert.match(block, /loadCoordinatedCcmrReleaseSeed\(\)/);
  assert.match(block, /COORDINATED_CCMR_RELEASE_FRAMEWORKS/);
  assert.match(block, /coordinated-refresh/);
  assert.doesNotMatch(block, /asvab_pathQuestionBank_seed\.json/);
});

test('root-admin UI exposes the release operations as separate controls', () => {
  assert.match(serviceSource, /refreshBuiltInCourseAndAsvabPathBank/);
  assert.match(serviceSource, /refreshReleasedCcmrPathBanks/);
  assert.match(uiSource, /1\. Refresh course \+ ASVAB built-ins/);
  assert.match(uiSource, /2\. Refresh SAT \/ ACT \/ TSIA2 release/);
  assert.match(uiSource, /Initialize all built-ins \(empty bank only\)/);
  assert.match(uiSource, /disabled=\{busy \|\| \(runtimeStatus\?\.bankCount \?\? 0\) > 0\}/);
  assert.match(uiSource, /SAT \/ ACT \/ TSIA2 release manifest/);
});

test('deployment helper puts Functions ahead of Hosting for release rollover safety', () => {
  const functionsDeploy = deploySource.indexOf('bash scripts/deploy-functions-in-groups.sh');
  const webDeploy = deploySource.indexOf('firebase deploy --only firestore:rules,hosting');
  assert.ok(functionsDeploy >= 0, 'grouped Functions deploy is present');
  assert.ok(webDeploy >= 0, 'rules + Hosting deploy is present');
  assert.ok(functionsDeploy < webDeploy, 'Functions must deploy before the new web client');
});

test('runtime diagnostics expose coordinated assessment release state', () => {
  const start = functionsSource.indexOf('exports.getPathRuntimeStatus');
  const end = functionsSource.indexOf('exports.promoteQuestionToPathBank', start);
  const block = functionsSource.slice(start, end);
  assert.match(block, /CONTENT_RELEASE_MANIFEST_COLLECTION/);
  assert.match(block, /assessmentRelease:/);
  assert.match(block, /activeReleases/);
  assert.match(block, /pendingReleases/);
});
