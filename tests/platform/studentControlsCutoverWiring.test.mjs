// THE APP IS WIRED TO THE PRIVATE CONTROLS EXACTLY ONCE PER ROLE, AND LETS GO OF THEM AT SIGN-OUT.
//
// Node cannot render App.jsx, so the wiring is asserted on the code that does
// the work (AGENTS.md: anchor to the statement, import next to the call):
//
//   * one student controls listener and one teacher controls listener, each
//     opened in exactly one place, keyed by the signed-in account;
//   * at sign-out, and the moment a different account appears, the lessons
//     (with the previous account's own controls projected into them) are
//     dropped, and no frame of the previous account renders;
//   * the staff-only override history is read only by staff screens;
//   * the surfaces that show a class other than the working class tell the
//     app, so their students' controls are in the one teacher listener;
//   * a copy of a lesson carries no student's private state.
//
// Behaviour of the same modules: tests/platform/studentAssignmentControlsClient.test.mjs,
// tests/platform/teacherClassControlsClient.test.mjs; the running app:
// tests/browser/teacherWorkflow/privateControlsJourneys.mjs.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

import { executableSource, region } from './helpers/sourceContract.mjs';
import { teacherAssignmentView, legacyStudentIds, overrideAuthorizationContext, planStudentAbsorption } from '../../functions/shared/studentAssignmentOverrides.mjs';
import { stripAssignmentInstanceState } from '../../functions/shared/assignmentPrivacy.mjs';
import { ALL_STUDENTS, CLASS_ID, TEACHER, legacyAssignment } from '../fixtures/studentAssignmentOverrideLegacyFixtures.mjs';

const read = (file) => readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8');
const app = read('src/App.jsx');
const code = executableSource(app);
const count = (source, pattern) => (source.match(pattern) || []).length;

const sourceFiles = (dir) => readdirSync(dir).flatMap((entry) => {
  const full = path.join(dir, entry);
  if (statSync(full).isDirectory()) return sourceFiles(full);
  return /\.(js|jsx|mjs)$/.test(entry) ? [full] : [];
});
const srcRoot = new URL('../../src/', import.meta.url).pathname;

test('17 / 18. one student controls listener and one teacher controls listener — each opened in one place', () => {
  assert.match(app, /import useStudentAssignmentControls from '\.\/platform\/assignments\/useStudentAssignmentControls\.js';/);
  assert.match(app, /import useTeacherClassControls from '\.\/platform\/teacher\/useTeacherClassControls\.js';/);
  assert.equal(count(code, /useStudentAssignmentControls\(/g), 1);
  assert.equal(count(code, /useTeacherClassControls\(/g), 1);
  // The student's: the SESSION's own student, and nobody when not a student.
  assert.match(code, /useStudentAssignmentControls\(\{\s*db,\s*studentId: auth\.status === 'ready' && auth\.session\?\.role === 'student' \? auth\.session\.studentId : null,\s*\}\)/);
  // The teacher's: one scope key for the viewer and the classes on screen.
  assert.match(code, /const teacherClassControls = useTeacherClassControls\(\{ db, scopeKey: teacherControlsScope \}\);/);
  assert.match(region(code, 'const teacherControlsScope = useMemo(', 'const teacherClassControls', 'teacher scope'), /if \(user\?\.role !== 'teacher'\) return '';/);
  // Nothing else in src opens a listener on the collection: the two modules are the only doors.
  const listeners = sourceFiles(srcRoot)
    .map((file) => [file, executableSource(readFileSync(file, 'utf8'))])
    .filter(([, source]) => /STUDENT_ASSIGNMENT_OVERRIDES_COLLECTION\b|['"]studentAssignmentOverrides['"]/.test(source))
    .filter(([, source]) => /onSnapshot|listen\(/.test(source))
    .map(([file]) => file)
    .map((file) => path.relative(srcRoot, file).replaceAll('\\', '/'))
    .sort();
  assert.deepEqual(listeners, ['platform/assignments/studentAssignmentControls.js', 'platform/teacher/teacherClassControls.js']);
  // …and each module's subscribe is called by its hook alone.
  const callers = (name) => sourceFiles(srcRoot)
    .filter((file) => new RegExp(`\\b${name}\\(`).test(executableSource(readFileSync(file, 'utf8'))))
    .filter((file) => !executableSource(readFileSync(file, 'utf8')).includes(`export const ${name} =`))
    .map((file) => path.relative(srcRoot, file).replaceAll('\\', '/'));
  assert.deepEqual(callers('subscribeStudentAssignmentControls'), ['platform/assignments/useStudentAssignmentControls.js']);
  assert.deepEqual(callers('subscribeTeacherClassControls'), ['platform/teacher/useTeacherClassControls.js']);
});

test('the hooks are keyed by the account and cannot return another account\'s controls on any render', () => {
  const student = executableSource(read('src/platform/assignments/useStudentAssignmentControls.js'));
  assert.match(student, /\}, \[db, owner\]\);/, 'one listener per student id; a different id tears it down');
  assert.match(student, /return \(\) => \{\s*active = false;\s*unsubscribe\(\);\s*\};/);
  assert.match(student, /return controlsForStudent\(controls, owner\);/, 'owner-checked on every render');
  const teacher = executableSource(read('src/platform/teacher/useTeacherClassControls.js'));
  assert.match(teacher, /\}, \[db, scopeKey\]\);/);
  assert.match(teacher, /return controlsForScope\(controls, scopeKey\);/);
  assert.match(teacher, /previousScope\.email === scope\.email/, 'records are carried over only for the same viewer');
});

test('15 / 11. sign-out and a change of account drop the lessons and the previous account\'s controls at once', () => {
  const clear = region(code, 'const clearSignedInAssignments = () => {', '\n  };', 'clearSignedInAssignments');
  ['studentClassAssignmentsRef', 'studentPriorWorkAssignmentsRef', 'teacherSharedAssignmentsRef'].forEach((ref) => {
    assert.match(clear, new RegExp(`${ref}\\.current = \\[\\];`));
  });
  assert.match(clear, /studentViewerRef\.current = \{ studentId: null, profile: null \};/);
  assert.match(clear, /setAssignments\(\[\]\);/);
  const logout = region(code, 'const handleLogout = async () => {', 'await auth.signOut();', 'handleLogout');
  assert.match(logout, /setUser\(null\);[\s\S]*clearSignedInAssignments\(\);/, 'before signing out, not when the auth listener catches up');
  const session = region(code, "if (auth.status !== 'ready' || !session) {", 'const hydrateSession = async', 'session effect');
  assert.match(session, /if \(auth\.status !== 'ready' \|\| !session\) \{[\s\S]*clearSignedInAssignments\(\);[\s\S]*return \(\) => \{ cancelled = true; \};/);
  assert.match(session, /if \(hydratedSessionUidRef\.current && hydratedSessionUidRef\.current !== session\.uid\) \{\s*setUser\(null\);\s*clearSignedInAssignments\(\);\s*\}/);
  // No frame of the previous account: the screen renders only for the account signed in now.
  assert.match(code, /const userIsSignedInAccount = Boolean\(user && auth\.status === 'ready' && auth\.session\?\.uid && auth\.session\.uid === user\.uid\);\s*if \(!userIsSignedInAccount\) \{/);
  // AuthProvider ends the previous session the moment another account appears.
  const provider = executableSource(read('src/auth/AuthProvider.jsx'));
  assert.match(provider, /if \(sessionUidRef\.current && sessionUidRef\.current !== firebaseUser\.uid\) \{[\s\S]*setState\(\{ status: 'loading', session: null, linkRequest: null \}\);\s*\}/);
  assert.match(provider, /sessionUidRef\.current = firebaseUser\.uid;\s*setState\(\{ status: 'ready'/);
});

test('the student\'s lessons are re-projected — not re-listened — when their controls or profile change', () => {
  const effect = region(code, "if (user?.role === 'student' && user.id) {\n      studentViewerRef.current", '}, [user?.role, user?.id, user?.profile, studentAssignmentControls, teacherClassControls]);', 're-projection');
  assert.match(effect, /publishStudentAssignments\(\);[\s\S]*publishTeacherAssignments\(\);/);
  assert.doesNotMatch(effect, /subscribe|onSnapshot/);
  // The lesson listener follows who is signed in and their class, not every profile revision.
  assert.match(code, /return unsubscribe;\s*\}, \[user\?\.role, user\?\.id, user\?\.classId\]\);/);
});

test('5. the staff-only override history is read by staff screens only — never on a student\'s device', () => {
  const readers = sourceFiles(srcRoot)
    .filter((file) => /ASSIGNMENT_OVERRIDE_EVENTS_COLLECTION|assignmentOverrideEvents/.test(executableSource(readFileSync(file, 'utf8'))))
    .map((file) => path.relative(srcRoot, file).replaceAll('\\', '/'));
  assert.deepEqual(readers, ['platform/teacher/studentOverrideHistory.js']);
  const studentSide = ['platform/assignments/studentAssignmentControls.js', 'platform/assignments/useStudentAssignmentControls.js', 'platform/assignments/studentAssignmentScope.js']
    .map((file) => readFileSync(path.join(srcRoot, file), 'utf8')).join('\n');
  assert.doesNotMatch(studentSide, /studentOverrideHistory|assignmentOverrideArchives|platformMigrations/);
  // Shown in the gradebook's student detail, a teacher screen.
  assert.match(app, /import StudentDolRecoveryRow from '\.\/components\/teacher\/StudentDolRecoveryRow\.jsx';/);
  assert.match(code, /<StudentDolRecoveryRow db=\{db\} assignment=\{selectedAssignment\} student=\{student\}[^>]*viewer=\{\{ email: user\.email, isRootAdmin: user\.isRootAdmin === true \}\}/);
});

test('surfaces showing another class say so, and the app keeps their students\' controls in the one listener', () => {
  const home = executableSource(read('src/TeacherHome.jsx'));
  assert.match(home, /onLiveClassChange\(classIdInSession\);\s*\}, \[classIdInSession, onLiveClassChange\]\);/);
  const hub = executableSource(read('src/components/teacher/AssignmentHub.jsx'));
  assert.match(hub, /onClassChange\(open \? classId : null\);\s*\}, \[open, classId, onClassChange\]\);/);
  const attendance = executableSource(read('src/components/teacher/AttendanceHistoryPanel.jsx'));
  assert.match(attendance, /onClassChange\(classId \|\| null\);\s*\}, \[classId, onClassChange\]\);/);
  const exportCenter = executableSource(read('src/components/teacher/GradeTransferCenter.jsx'));
  assert.match(exportCenter, /const exportableClassKey = \(classFilter\.size \? authorizedClassIds\.filter\(\(classId\) => classFilter\.has\(classId\)\) : authorizedClassIds\)\.join\('\|'\);/);
  assert.match(exportCenter, /onClassScopeChange\(exportableClassKey \? exportableClassKey\.split\('\|'\) : \[\]\);/);
  [['<TeacherHome', 'onLiveClassChange={reportLiveClass}'], ['<AssignmentHub', 'onClassChange={reportHubClass}'], ['<AttendanceHistoryPanel', 'onClassChange={reportAttendanceClass}'], ['<GradeTransferCenter', 'onClassScopeChange={reportExportClasses}']]
    .forEach(([element, prop]) => assert.match(region(app, element, '/>', element), new RegExp(prop.replace(/[{}]/g, '\\$&'))));
  const scope = region(code, 'const teacherControlsScope = useMemo(', 'const teacherClassControls', 'teacher scope');
  assert.match(scope, /activeClassId: activeClass\.classId,/);
  assert.match(scope, /teacherTab === 'home' \? teacherSurfaceClasses\.live : null,/);
  assert.match(scope, /assignmentHubTarget \? teacherSurfaceClasses\.hub \|\| assignmentHubTarget\.classId : null,/);
  assert.match(scope, /teacherTab === 'attendanceHistory' \? teacherSurfaceClasses\.attendance : null,/);
  assert.match(scope, /studentClass\(caseReviewStudentId\),\s*studentClass\(supportReportStudentId\),/);
  assert.match(scope, /crossClassTab: TEACHER_CROSS_CLASS_TABS\.has\(teacherTab\),/);
  assert.match(code, /const TEACHER_CROSS_CLASS_TABS = new Set\(\['gradeTransfer', 'actionCenter', 'parentContacts'\]\);/);
});

test('16. a copy of a lesson carries no student\'s private state — even from the teacher\'s merged view', () => {
  const assignment = legacyAssignment();
  const records = {};
  legacyStudentIds(assignment).forEach((studentId) => {
    const plan = planStudentAbsorption({
      assignmentId: assignment.id, assignment, studentId, existingPrivate: null,
      authorization: overrideAuthorizationContext({ studentId, student: { classId: CLASS_ID, assignedTeacherEmail: TEACHER } }),
    });
    if (plan.record) records[studentId] = plan.record;
  });
  const copy = stripAssignmentInstanceState(teacherAssignmentView(assignment, records));
  const text = JSON.stringify(copy);
  ALL_STUDENTS.forEach((studentId) => assert.equal(text.includes(studentId), false, `${studentId} in a copy`));
  assert.equal(copy.studentOverrides, undefined);
  // The duplicate path strips the in-memory lesson before writing it.
  assert.match(executableSource(region(app, 'const handleDuplicateAssignment', 'const handleToggleArchiveAssignment', 'handleDuplicateAssignment')), /\} = stripAssignmentInstanceState\(assignment\);/);
});
