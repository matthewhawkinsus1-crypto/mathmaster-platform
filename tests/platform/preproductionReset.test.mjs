import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const require = createRequire(import.meta.url);
const admin = require('../../functions/lib/admin.js');
const functionsSource = readFileSync(new URL('../../functions/index.js', import.meta.url), 'utf8');
const authService = readFileSync(new URL('../../src/auth/authService.js', import.meta.url), 'utf8');
const app = readFileSync(new URL('../../src/App.jsx', import.meta.url), 'utf8');
const panel = readFileSync(new URL('../../src/components/admin/PreproductionReset.jsx', import.meta.url), 'utf8');

test('pre-production reset and production lock each require an exact typed phrase', () => {
  assert.equal(admin.preproductionResetConfirmation(), 'RESET TEST DATA');
  assert.equal(admin.isPreproductionResetConfirmed('RESET TEST DATA'), true);
  assert.equal(admin.isPreproductionResetConfirmed('reset test data'), false);
  assert.equal(admin.isPreproductionResetConfirmed('RESET ALL DATA'), false);

  assert.equal(admin.preproductionLockConfirmation(), 'LOCK FOR PRODUCTION');
  assert.equal(admin.isPreproductionLockConfirmed('LOCK FOR PRODUCTION'), true);
  assert.equal(admin.isPreproductionLockConfirmed('lock for production'), false);
});

test('reset collection policy deletes test/runtime state but explicitly preserves platform configuration', () => {
  const deleted = new Set(admin.PREPRODUCTION_RESET_COLLECTIONS);
  const preserved = new Set(admin.PREPRODUCTION_PRESERVED_COLLECTIONS);

  for (const name of [
    'assignments',
    'presence',
    'liveChallengeInvites',
    'liveChallengeRooms',
    'liveChallengeTeacherActive',
    'liveChallengePrivate',
    'pathHistory',
    'classroomLinks',
    'classroomRosterLinks',
    'classroomGradeSyncs',
    'studentCredentials',
    'studentAliases',
    'studentDirectory',
    'classJoinCodes',
    'authThrottle',
    'oauthStates',
    'activePathLocks',
    'weeklyPathGoalSnapshots',
    'pathSessions',
    'pathSubmissions',
    'masteryEvidenceApplications',
    'modelingLabSubmissions',
    'examSessions',
    'examSubmissions',
    'examIntegrityEvents',
    'studentSupportEvents',
    'studentSessionSummaries',
    'studentMasteryProfiles',
    'studentRetentionSchedules',
  ]) {
    assert.equal(deleted.has(name), true, `${name} should be cleared by the pre-production reset`);
  }

  for (const name of [
    'classes',
    'settings',
    'teacherDirectory',
    'teacherIntegrations',
    'classroomCourseMappings',
    'adminControl',
    'adminAuditLog',
    'pathQuestionBank',
    'pathCoverage',
    'examQuestionBank',
    'modelingLabDefinitions',
  ]) {
    assert.equal(preserved.has(name), true, `${name} should survive reset`);
    assert.equal(deleted.has(name), false, `${name} must never be in the reset deletion list`);
  }
});



test('production lock is root-admin only, one-way in the app, and reset refuses destructive execution after locking', () => {
  const resetStart = functionsSource.indexOf('exports.resetPreproductionTestData');
  const lockStart = functionsSource.indexOf('exports.lockPreproductionResetForProduction');
  const deleteStart = functionsSource.indexOf('exports.permanentlyDeleteStudent', lockStart);
  assert.ok(resetStart >= 0 && lockStart > resetStart && deleteStart > lockStart);

  const resetBlock = functionsSource.slice(resetStart, lockStart);
  const lockBlock = functionsSource.slice(lockStart, deleteStart);

  assert.match(resetBlock, /if \(preview\.resetLocked\)/);
  assert.match(resetBlock, /permanently locked for live-student production use/);

  assert.match(lockBlock, /await requireRootAdmin\(request\)/);
  assert.match(lockBlock, /adminPolicy\.isPreproductionLockConfirmed/);
  assert.match(lockBlock, /PREPRODUCTION_CONTROL_DOCUMENT/);
  assert.match(lockBlock, /locked:\s*true/);
  assert.match(lockBlock, /preproduction_reset_locked_for_production/);
  assert.match(lockBlock, /irreversibleInApp:\s*true/);

  assert.equal(functionsSource.includes('unlockPreproductionReset'), false);
  assert.equal(authService.includes('unlockPreproductionReset'), false);
});

test('production lifecycle control is server-only under Firestore rules', () => {
  const rules = readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8');
  assert.equal(rules.includes('match /adminControl/'), false);
  assert.match(rules, /match \/\{document=\*\*\} \{/);
  assert.match(rules, /allow read, write: if false/);
});
test('server reset callable is root-admin only and separates preview from destructive execution', () => {
  const start = functionsSource.indexOf('exports.resetPreproductionTestData');
  const end = functionsSource.indexOf('exports.permanentlyDeleteStudent', start);
  assert.ok(start >= 0 && end > start);
  const block = functionsSource.slice(start, end);

  assert.match(block, /await requireRootAdmin\(request\)/);
  assert.match(block, /const dryRun = request\.data\?\.dryRun === true/);
  assert.match(block, /if \(dryRun\)/);
  assert.match(block, /confirmationRequired: adminPolicy\.preproductionResetConfirmation\(\)/);
  assert.match(block, /adminPolicy\.isPreproductionResetConfirmed\(request\.data\?\.confirmation\)/);
  assert.match(block, /Pre-production reset requires the exact confirmation/);
});

test('reset protects teacher/root Auth identities and deletes only student-marked Auth users', () => {
  const start = functionsSource.indexOf('async function preproductionStudentAuthUsers');
  const end = functionsSource.indexOf('async function preproductionResetPreview', start);
  assert.ok(start >= 0 && end > start);
  const block = functionsSource.slice(start, end);

  assert.match(block, /authLib\.ROOT_ADMIN_EMAIL/);
  assert.match(block, /authLib\.bootstrapTeacherEmails\(\)/);
  assert.match(block, /db\.collection\(authLib\.TEACHER_COLLECTION\)/);
  assert.match(block, /protectedUids\.has\(uid\)/);
  assert.match(block, /authLib\.isRootAdminEmail\(email\)/);
  assert.match(block, /role === "student" \|\| uid\.startsWith\("student:"\)/);
});

test('reset preserves the Firestore connection-test sentinel while recursively deleting real student roster records', () => {
  const start = functionsSource.indexOf('exports.resetPreproductionTestData');
  const end = functionsSource.indexOf('exports.permanentlyDeleteStudent', start);
  const block = functionsSource.slice(start, end);

  assert.match(block, /gradeDoc\.id === "test_connection"/);
  assert.match(block, /await db\.recursiveDelete\(gradeDoc\.ref\)/);
  assert.match(block, /PREPRODUCTION_RESET_COLLECTIONS/);
  assert.match(block, /clearPreproductionCollection/);
});

test('reset writes one aggregate admin audit receipt without copying student identities into it', () => {
  const start = functionsSource.indexOf('exports.resetPreproductionTestData');
  const end = functionsSource.indexOf('exports.permanentlyDeleteStudent', start);
  const block = functionsSource.slice(start, end);

  assert.match(block, /writeAdminAudit\(db, actor, "preproduction_test_data_reset", "preproduction-test-data"/);
  assert.match(block, /deletedAuthUsers/);
  assert.match(block, /deletedRecords: deleted/);
  assert.match(block, /preservedCollections/);
  assert.doesNotMatch(block, /studentIds:/);
  assert.doesNotMatch(block, /studentEmails:/);
});

test('teacher admin client exposes preview and reset only through the audited callable', () => {
  assert.match(authService, /previewPreproductionReset/);
  assert.match(authService, /callable\('resetPreproductionTestData'\)\(\{ dryRun: true \}\)/);
  assert.match(authService, /resetPreproductionTestData: \(confirmation\)/);
  assert.match(authService, /dryRun: false, confirmation/);
  assert.match(authService, /lockPreproductionResetForProduction: \(confirmation\)/);
});

test('root Administration exposes a dedicated pre-production reset tab and refreshes stale in-memory test data', () => {
  assert.match(app, /PreproductionReset/);
  assert.match(app, /\['reset', 'Pre-production reset'\]/);
  assert.match(app, /adminTab === 'reset'/);
  assert.match(app, /setAssignments\(\[\]\)/);
  assert.match(app, /setAllStudents\(\[\]\)/);
  assert.match(app, /setStudentSupportEvents\(\[\]\)/);
  assert.match(app, /setStudentSessionSummaries\(\[\]\)/);
  assert.match(app, /fetchAssignments\(\)/);
  assert.match(app, /fetchStudents\(\)/);
});

test('reset panel requires exact phrases, disables bulk reset after locking, and explains Google Classroom limitation', () => {
  assert.match(panel, /previewPreproductionReset/);
  assert.match(panel, /confirmationRequired = preview\?\.confirmationRequired \|\| 'RESET TEST DATA'/);
  assert.match(panel, /lockConfirmationRequired = preview\?\.lockConfirmationRequired \|\| 'LOCK FOR PRODUCTION'/);
  assert.match(panel, /preview\?\.resetLocked !== true/);
  assert.match(panel, /confirmation\.trim\(\) === confirmationRequired/);
  assert.match(panel, /lockConfirmation\.trim\(\) === lockConfirmationRequired/);
  assert.match(panel, /Permanently Reset Test Data/);
  assert.match(panel, /Lock Bulk Reset for Production/);
  assert.match(panel, /Production Lock Active/);
  assert.match(panel, /no unlock action/i);
  assert.match(panel, /does not delete coursework/);
  assert.match(panel, /Google Classroom/);
  assert.doesNotMatch(panel, /deleteDoc\(|collection\(db/);
});

test('Firebase Functions source remains syntactically valid after destructive callable changes', () => {
  const result = spawnSync(process.execPath, ['--check', 'functions/index.js'], {
    cwd: new URL('../../', import.meta.url),
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

console.log('preproductionReset.test.mjs: all assertions passed');
