import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const auth = require('../../functions/lib/auth.js');
const admin = require('../../functions/lib/admin.js');
const functionsSource = readFileSync(new URL('../../functions/index.js', import.meta.url), 'utf8');
const firestoreRules = readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8');

test('root administrator identity is fixed to the requested DeSoto account', () => {
  assert.equal(auth.ROOT_ADMIN_EMAIL, 'matthew.hawkins@desotoisd.org');
  assert.equal(auth.isRootAdminEmail('Matthew.Hawkins@desotoisd.org'), true);
  assert.equal(auth.isRootAdminEmail('teacher@desotoisd.org'), false);
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
