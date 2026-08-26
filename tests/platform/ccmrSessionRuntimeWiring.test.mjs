import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../../functions/index.js', import.meta.url), 'utf8');

function indexOfOrFail(fragment, message) {
  const index = source.indexOf(fragment);
  assert.notEqual(index, -1, message || `Expected functions/index.js to contain: ${fragment}`);
  return index;
}

test('Path runtime imports the CCMR content release guard', () => {
  assert.match(source, /const\s+pathContentRelease\s*=\s*require\(["']\.\/lib\/pathContentRelease["']\)/);
});

test('Path runtime reads the atomic assessment release manifest', () => {
  indexOfOrFail('const CONTENT_RELEASE_MANIFEST_COLLECTION = "pathContentReleases"', 'runtime must name the server-owned release-manifest collection');
  indexOfOrFail('const CONTENT_RELEASE_MANIFEST_DOC = "current"', 'runtime must use one atomic current-release document');
  indexOfOrFail('resolveAssessmentContentReleaseAuthority(records, framework, manifest)', 'runtime release helper must prefer manifest authority over a bounded bank slice');
  indexOfOrFail('db.collection(CONTENT_RELEASE_MANIFEST_COLLECTION).doc(CONTENT_RELEASE_MANIFEST_DOC).get()', 'runtime must read the current manifest from Firestore');
});

test('session start uses manifest authority, stamps new sessions, and holds creation during an update', () => {
  indexOfOrFail('loadAssessmentContentReleaseState(db, assessmentFramework, frameworkRecords)', 'startMyMathPathSession must resolve the framework through manifest authority');
  indexOfOrFail('assessmentContentRelease: assessmentReleaseState.tracked ? assessmentReleaseState.release : null', 'new assessment sessions must persist the server-owned content release marker');
  indexOfOrFail('pathContentRelease.planSessionContentReleaseAction(existing.data(), assessmentReleaseState)', 'active-lock reuse must check whether the existing session is stale or held');
  indexOfOrFail('releaseAction.action === "hold-release-update"', 'session start must refuse to create/resume an empty assessment session while release files are changing');
  indexOfOrFail('pathContentRelease.supersedeSessionForContentRelease(existing.data(), assessmentReleaseState.release, now)', 'stale reusable sessions must be superseded rather than resumed');
});

test('question issue preserves an already-open stale question before checking manifest release', () => {
  const issueStart = indexOfOrFail('exports.issueNextQuestion = onCall');
  const openQuestionReturn = source.indexOf('if (session.currentQuestion) {', issueStart);
  const releaseCheck = source.indexOf('loadAssessmentContentReleaseState(db, session.assessmentFramework, targetFrameworkRecords)', issueStart);
  assert.notEqual(openQuestionReturn, -1, 'issueNextQuestion must preserve its existing open-question return');
  assert.notEqual(releaseCheck, -1, 'issueNextQuestion must resolve manifest authority before issuing a new question');
  assert.ok(openQuestionReturn < releaseCheck, 'an already-issued question must be returned before any release-update or rollover check');
});

test('question issue holds empty sessions during update and supersedes stale sessions after activation', () => {
  indexOfOrFail('pathContentRelease.planSessionContentReleaseAction(session, issueReleaseState)', 'issueNextQuestion must evaluate the session against current manifest authority');
  indexOfOrFail('releaseAction.action === "hold-release-update"', 'issueNextQuestion must not issue from a partially refreshed bank');
  indexOfOrFail('pathContentRelease.supersedeSessionForContentRelease(freshData, issueReleaseState.release, now)', 'issueNextQuestion must transactionally supersede a stale session with no open question');
  indexOfOrFail('reason: pathContentRelease.RELEASE_CHANGE_REASON', 'rollover payload must expose the stable release-change reason');
  indexOfOrFail('assessmentFramework: session.assessmentFramework', 'rollover payload must preserve assessment framework for restart');
  indexOfOrFail('targetAlignmentKey: session.target.alignmentKey', 'rollover payload must preserve the original target for restart');
});

test('assessment candidate selection cannot cross the session content release', () => {
  indexOfOrFail('pathQuestionMatchesSessionContentRelease(question, session)', 'assessment candidates need an explicit session-release filter');
  const buildPlans = indexOfOrFail('const buildFrameworkPlans = async (framework)');
  const releaseFilter = source.indexOf('.filter((question) => pathQuestionMatchesSessionContentRelease(question, session))', buildPlans);
  assert.notEqual(releaseFilter, -1, 'candidate plans must filter to the content release stamped on the session');
});

test('manual custom seed writes cannot bypass the coordinated assessment release manifest', () => {
  const importerStart = indexOfOrFail('exports.seedPathQuestionBank = onCall');
  const importerEnd = source.indexOf('const BUILT_IN_PATH_SEED_FILES = Object.freeze([', importerStart);
  assert.ok(importerEnd > importerStart, 'manual seed importer must end before built-in seed declarations');
  const block = source.slice(importerStart, importerEnd);

  assert.match(block, /COORDINATED_CCMR_RELEASE_FRAMEWORKS/, 'manual importer must recognize release-managed assessment frameworks');
  assert.match(block, /if\s*\(!dryRun/, 'read-only validation must remain available while protected writes are blocked');
  assert.match(block, /refreshReleasedCcmrPathBanks/, 'blocked release-managed writes must direct admins to the atomic refresh callable');
  const guard = block.indexOf('COORDINATED_CCMR_RELEASE_FRAMEWORKS');
  const write = block.indexOf('return processPathSeedImport({ db, actor, items, dryRun })');
  assert.ok(guard >= 0 && write >= 0 && guard < write, 'release-managed framework guard must run before the generic importer can write');
});

test('starter initializer is fresh-install only and protects tracked assessment writes with the release manifest', () => {
  const initializerStart = indexOfOrFail('exports.initializeStarterPathQuestionBank = onCall');
  const initializerEnd = source.indexOf('Root-admin coordinated assessment-bank refresh.', initializerStart);
  assert.ok(initializerEnd > initializerStart, 'starter initializer must end before the coordinated refresh implementation');
  const block = source.slice(initializerStart, initializerEnd);

  assert.match(block, /collection\(["']pathQuestionBank["']\)\.limit\(1\)\.get\(\)/, 'starter initializer must verify the live bank is empty before writing');
  assert.match(block, /fresh-install-only|fresh install only/i, 'starter initializer must clearly reject use as a live-bank refresh');
  assert.match(block, /existingManifest\?\.status === "updating"[\s\S]*existingManifest\?\.updateOperation === "starter-initialization"/, 'a non-empty-bank retry must be restricted to this initializer\'s own failed update');

  const validation = block.indexOf('processPathSeedImport({ db, actor, items: taggedItems, dryRun: true })');
  const hold = block.indexOf('beginAssessmentContentReleaseUpdate');
  const write = block.indexOf('processPathSeedImport({ db, actor, items: taggedItems, dryRun: false })');
  const activate = block.indexOf('completeAssessmentContentReleaseUpdate');
  assert.ok(validation >= 0, 'starter initializer must validate the complete package before holding issuance');
  assert.ok(hold >= 0, 'starter initializer must put tracked assessment releases into updating state before seeding');
  assert.ok(write >= 0, 'starter initializer must still use the production seed importer');
  assert.ok(activate >= 0, 'starter initializer must atomically activate tracked assessment releases after seeding');
  assert.ok(validation < hold, 'starter initializer must not close assessment issuance for a package that fails read-only validation');
  assert.ok(hold < write, 'starter initializer must close tracked assessment issuance before its first bank write');
  assert.ok(write < activate, 'starter initializer cannot activate tracked assessment releases until the seed write finishes');
});

test('coordinated assessment refresh is SAT ACT TSIA2 only and switches the manifest around writes', () => {
  indexOfOrFail('const COORDINATED_CCMR_RELEASE_SEED_FILES = Object.freeze([', 'runtime must define a narrow coordinated assessment package');
  indexOfOrFail('"digitalSAT_pathQuestionBank_seed.json"');
  indexOfOrFail('"act_pathQuestionBank_seed.json"');
  indexOfOrFail('"tsia2_pathQuestionBank_seed.json"');
  const coordinatedStart = indexOfOrFail('const COORDINATED_CCMR_RELEASE_SEED_FILES = Object.freeze([');
  const coordinatedEnd = source.indexOf(']);', coordinatedStart);
  assert.ok(coordinatedEnd > coordinatedStart, 'coordinated seed list must be bounded');
  const coordinatedList = source.slice(coordinatedStart, coordinatedEnd);
  assert.doesNotMatch(coordinatedList, /asvab/i, 'ASVAB must not be part of this coordinated release refresh');

  const refreshStart = indexOfOrFail('exports.refreshReleasedCcmrPathBanks = onCall');
  const refreshBlock = source.slice(refreshStart);
  const validation = source.indexOf('dryRun: true', refreshStart);
  const updating = source.indexOf('beginAssessmentContentReleaseUpdate', refreshStart);
  const write = source.indexOf('dryRun: false', refreshStart);
  const activate = source.indexOf('completeAssessmentContentReleaseUpdate', refreshStart);
  assert.ok(validation > refreshStart && validation < updating, 'full package validation must happen before the manifest enters updating state');
  assert.ok(updating < write, 'manifest must become unavailable before the first bank write');
  assert.ok(write < activate, 'manifest cannot activate the new release until writes finish');

  assert.match(refreshBlock, /currentManifest\?\.status === "updating"[\s\S]*currentManifest\?\.updateOperation === "coordinated-refresh"/, 'a failed live refresh may only be retried through the coordinated refresh operation');
  assert.match(refreshBlock, /samePendingRelease/, 'a failed live refresh must prove the retry targets the same pending release package');
  assert.match(refreshBlock, /updateOperation: "coordinated-refresh"/, 'the live refresh must label its manifest operation before any bank write');
});
