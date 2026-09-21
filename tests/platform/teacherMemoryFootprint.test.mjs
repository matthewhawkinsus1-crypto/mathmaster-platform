import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app = fs.readFileSync('src/App.jsx', 'utf8');
const functions = fs.readFileSync('functions/index.js', 'utf8');

const between = (source, startText, endText, label) => {
  const start = source.indexOf(startText);
  const end = source.indexOf(endText, start + startText.length);
  assert.ok(start >= 0 && end > start, label + ' region must exist');
  return source.slice(start, end);
};

test('teacher sign-in hydrates a compact roster instead of every full grade document', () => {
  const teacherHydration = between(
    app,
    "if (session.role === 'teacher') {",
    "if (session.role !== 'student' || !session.studentId)",
    'teacher session hydration',
  );
  assert.match(teacherHydration, /fetchTeacherRosterSummaries\(\)/);
  assert.doesNotMatch(teacherHydration, /fetchStudents\(\)/);
  assert.doesNotMatch(teacherHydration, /persistCurrentGraderCreditRepairs/);
});

test('ordinary teacher tabs do not keep the whole grade corpus subscribed', () => {
  const tabs = between(
    app,
    'const TEACHER_FULL_STUDENT_DATA_TABS = new Set([',
    ']);',
    'full student data tab list',
  );
  for (const detailTab of ['students', 'weeklyPath', 'actionCenter', 'parentContacts', 'grades', 'gradeTransfer', 'standards', 'analytics', 'exams']) {
    assert.match(tabs, new RegExp("'" + detailTab + "'"));
  }
  for (const lightTab of ['home', 'assignments', 'library', 'classesWorkspace', 'pacing']) {
    assert.doesNotMatch(tabs, new RegExp("'" + lightTab + "'"), lightTab + ' must stay roster-light');
  }

  const liveGradeEffect = between(
    app,
    "const fetchTeacherRosterSummaries = async () => {",
    "// Classes are the authoritative record",
    'teacher student data effect',
  );
  assert.match(liveGradeEffect, /TEACHER_FULL_STUDENT_DATA_TABS\.has\(teacherTab\)/);
  assert.match(liveGradeEffect, /setAllStudents\(teacherRosterSummaries\)/);
  assert.match(liveGradeEffect, /setTeacherStudentDataMode\('summary'\)/);
});

test('whole-roster mastery/profile derivation is disabled while only compact roster data is resident', () => {
  const mastery = between(
    app,
    'const teacherMasteryProfilesByStudentId = useMemo',
    '// ONE SET OF LEARNING PROFILES',
    'teacher mastery memo',
  );
  const learning = between(
    app,
    'const teacherLearningProfiles = useMemo',
    '// The students in the class the Weekly Path screen is looking at.',
    'teacher learning profile memo',
  );
  assert.match(mastery, /teacherStudentDataMode !== 'full'/);
  assert.match(learning, /teacherStudentDataMode !== 'full'/);
});

test('opening one student from a light screen reads only that student detail document', () => {
  const drawer = between(
    app,
    'const profileDrawerRosterStudent = useMemo',
    'const profileDrawerSupportEvents = useMemo',
    'profile drawer loading',
  );
  assert.match(drawer, /getDoc\(doc\(db, 'grades', profileDrawerStudentId\)\)/);
  assert.doesNotMatch(drawer, /getDocs\(collection\(db, 'grades'\)\)/);
});

test('compact roster callable explicitly excludes attempt history fields', () => {
  const callable = between(
    functions,
    'exports.listSignInAccess = onCall',
    '/** Root-admin action: create a roster/sign-in account shell',
    'listSignInAccess',
  );
  const projection = between(
    callable,
    'db.collection("grades").select(',
    ').get(),',
    'compact grades projection',
  );
  assert.match(projection, /"profile"/);
  assert.match(projection, /"sisStudentId"/);
  assert.doesNotMatch(projection, /gradesByAssignment|assignmentActivity|supportUsageByAssignment|dolGradesByAssignment|classworkGradesByAssignment/);
});

test('teacher background history streams are scoped to the screens that use them', () => {
  assert.match(app, /TEACHER_SUPPORT_STREAM_TABS\.has\(teacherTab\)/);
  assert.match(app, /TEACHER_PARENT_CONTACT_STREAM_TABS\.has\(teacherTab\)/);
  assert.match(app, /TEACHER_SESSION_SUMMARY_TABS\.has\(teacherTab\)/);
  assert.match(app, /teacherTab !== 'actionCenter'/);
});

test('ordinary teacher navigation has no generic whole-roster fetch helper left to call accidentally', () => {
  assert.doesNotMatch(app, /const fetchStudents\s*=\s*async/);
  assert.doesNotMatch(app, /fetchStudents\(\)/);
});

test('leaving heavy teacher screens releases their cached history arrays', () => {
  const support = between(
    app,
    '// Persistent support/intervention history is teacher-authorized',
    '// One teacher-scoped stream spans the whole roster.',
    'support stream',
  );
  assert.match(support, /setStudentSupportEvents\(\[\]\)/);

  const contacts = between(
    app,
    '// One teacher-scoped stream spans the whole roster.',
    'const actionGradeScope = useMemo',
    'parent contacts stream',
  );
  assert.match(contacts, /setParentContacts\(\[\]\)/);

  const actionState = between(
    app,
    'const actionGradeScope = useMemo',
    '/*\n   * A per-student extension',
    'action center state',
  );
  assert.match(actionState, /setActionGradeSnapshots\(\[\]\)/);
  assert.match(actionState, /setRetestRecoveryActions\(\[\]\)/);
  assert.match(actionState, /setStudentSessionSummaries\(\[\]\)/);
});

test('logging out clears both compact and detailed teacher student state', () => {
  const hydration = between(
    app,
    "if (auth.status !== 'ready' || !session) {",
    'const hydrateSession = async () => {',
    'signed-out cleanup',
  );
  assert.match(hydration, /setAllStudents\(\[\]\)/);
  assert.match(hydration, /setTeacherRosterSummaries\(\[\]\)/);
  assert.match(hydration, /setProfileDrawerStudentDetail\(null\)/);
});

test('Classes Workspace stays on live lightweight data instead of silently showing zero historical starts', () => {
  const classesWorkspace = fs.readFileSync('src/ClassesWorkspace.jsx', 'utf8');
  assert.match(app, /academicDataLoaded=\{teacherStudentDataMode === 'full'\}/);
  assert.match(classesWorkspace, /academicDataLoaded = true/);
  assert.match(classesWorkspace, /activeOnAssignmentCount/);
  assert.match(classesWorkspace, /active now/);
  assert.match(classesWorkspace, /This screen stays lightweight during class/);
});

test('Parent Contacts opts into complete academic detail only while that tab is open', () => {
  const fullTabs = between(
    app,
    'const TEACHER_FULL_STUDENT_DATA_TABS = new Set([',
    ']);',
    'full student data tabs',
  );
  assert.match(fullTabs, /'parentContacts'/);
  assert.match(app, /TEACHER_SUPPORT_STREAM_TABS[^\n]*parentContacts/);
  assert.match(app, /TEACHER_SESSION_SUMMARY_TABS[^\n]*parentContacts/);
});
