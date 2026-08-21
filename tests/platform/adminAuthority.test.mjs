import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const auth = require('../../functions/lib/auth.js');
const admin = require('../../functions/lib/admin.js');
const functionsSource = readFileSync(new URL('../../functions/index.js', import.meta.url), 'utf8');
const firestoreRules = readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8');
const rolePolicy = await import('../../functions/shared/rolePolicy.mjs');

test('root administrator identity is fixed to the requested DeSoto account', () => {
  assert.equal(auth.ROOT_ADMIN_EMAIL, 'matthew.hawkins@desotoisd.org');
  assert.equal(auth.isRootAdminEmail('Matthew.Hawkins@desotoisd.org'), true);
  assert.equal(auth.isRootAdminEmail('teacher@desotoisd.org'), false);
});

// Three modules have to name the administrator, and two of them cannot import
// the third: `functions/lib/auth.js` is CommonJS and needs the address while it
// is still initialising, so it reads the .cjs mirror. If those two files ever
// drift, the server and the browser would enforce different administrators —
// the browser would offer Admin Mode to an account the callables refuse, which
// is exactly the loop this test exists to prevent.
test('every declaration of the administrator identity agrees', () => {
  const cjs = require('../../functions/shared/rolePolicyIdentity.cjs');
  assert.equal(cjs.ROOT_ADMIN_EMAIL, rolePolicy.ROOT_ADMIN_EMAIL);
  assert.equal(auth.ROOT_ADMIN_EMAIL, rolePolicy.ROOT_ADMIN_EMAIL);
  // ...and nobody re-declares it as a literal of their own.
  const appSource = readFileSync(new URL('../../src/App.jsx', import.meta.url), 'utf8');
  assert.equal(
    appSource.includes(`'${rolePolicy.ROOT_ADMIN_EMAIL}'`),
    false,
    'src/App.jsx must import ROOT_ADMIN_EMAIL rather than hard-coding it',
  );
});

test('a refused administrative call names the account it requires', () => {
  // The gate is unchanged; only the refusal is legible. A person signed in on a
  // second account must be able to read the error and learn which account to
  // use, instead of being told to refresh a token that can never work.
  const refusal = functionsSource.slice(
    functionsSource.indexOf('async function requireRootAdmin'),
    functionsSource.indexOf('function requireStudent'),
  );
  assert.match(refusal, /authLib\.ROOT_ADMIN_EMAIL/);
  assert.match(refusal, /You are signed in as \$\{email\}/);
  assert.equal(refusal.includes('Sign out and back in'), false);
});

test('the Path audit no longer tells the wrong account to refresh its token', () => {
  const auditSource = readFileSync(
    new URL('../../src/components/teacher/PathCoverageAudit.jsx', import.meta.url),
    'utf8',
  );
  const friendly = auditSource.slice(
    auditSource.indexOf('const friendlyPathError'),
    auditSource.indexOf('export default function PathCoverageAudit'),
  );
  assert.equal(friendly.includes('Sign out and back in as Root Admin'), false);
  assert.match(friendly, /ROOT_ADMIN_EMAIL/);
});

test('permanent student deletion requires an exact typed confirmation', () => {
  assert.equal(admin.permanentDeleteConfirmation('S1042'), 'DELETE S1042');
  assert.equal(admin.isPermanentDeleteConfirmed('S1042', 'DELETE S1042'), true);
  assert.equal(admin.isPermanentDeleteConfirmed('S1042', 'delete S1042'), false);
  assert.equal(admin.isPermanentDeleteConfirmed('S1042', 'DELETE S2000'), false);
});

test('student erasure policy spans every server-owned Phase 5/6 student data family', () => {
  const queried = new Set(admin.STUDENT_QUERY_COLLECTIONS);
  const direct = new Set(admin.STUDENT_DIRECT_COLLECTIONS);
  for (const collectionName of [
    'classroomRosterLinks',
    'classroomGradeSyncs',
    'activePathLocks',
    'pathSessions',
    'pathSubmissions',
    'masteryEvidenceApplications',
    'modelingLabSubmissions',
    'examSessions',
    'examSubmissions',
    'examIntegrityEvents',
  ]) {
    assert.equal(queried.has(collectionName), true, `${collectionName} must be erased by studentId`);
  }
  assert.equal(direct.has('studentMasteryProfiles'), true);
  assert.equal(direct.has('studentRetentionSchedules'), true);
});

test('teacher grants and permanent student erasure are root-admin callables, not ordinary-teacher actions', () => {
  const teacherAccessBlock = functionsSource.match(/exports\.setTeacherAccess[\s\S]*?\/\/ --- OAuth connect flow/);
  assert.ok(teacherAccessBlock);
  assert.match(teacherAccessBlock[0], /requireRootAdmin\(request\)/);
  assert.match(teacherAccessBlock[0], /exports\.permanentlyDeleteStudent/);
  assert.match(teacherAccessBlock[0], /adminAuditLog|writeAdminAudit/);
});

test('direct Firestore deletion cannot bypass the audited permanent-delete callable', () => {
  const gradesBlock = firestoreRules.match(/match \/grades\/\{studentId\}[\s\S]*?match \/scratchpads/);
  assert.ok(gradesBlock);
  assert.match(gradesBlock[0], /allow delete: if false/);
  assert.match(firestoreRules, /match \/adminAuditLog\/\{docId\} \{ allow read, write: if false; \}/);
});

test('Google Classroom management callables enforce authenticated teacher authority', () => {
  for (const exportName of [
    'getGoogleAuthUrl',
    'getClassroomConnectionStatus',
    'getGoogleClassroomDiagnostics',
    'listGoogleCourses',
    'listClassroomStudents',
    'linkStudentToClassroom',
    'listPublishedAssignments',
  ]) {
    const start = functionsSource.indexOf(`exports.${exportName}`);
    assert.ok(start >= 0, `${exportName} must exist`);
    const nextExport = functionsSource.indexOf('\nexports.', start + 1);
    const block = functionsSource.slice(start, nextExport >= 0 ? nextExport : start + 2500);
    assert.match(block, /requireTeacher\(request\)/, `${exportName} must enforce teacher authentication`);
  }
  const publisherStart = functionsSource.indexOf('async function publishAssignmentBatch(request)');
  const publisherBlock = functionsSource.slice(publisherStart, publisherStart + 600);
  assert.match(publisherBlock, /requireTeacher\(request\)/);
});
