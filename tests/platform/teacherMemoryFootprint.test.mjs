import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { STUDENT_IDENTITY_FIELDS, TEACHER_ROSTER_SELECT_FIELDS } from '../../functions/shared/studentIdentity.mjs';
import { functionsBackendSource } from './helpers/functionsBackendSource.mjs';
import { positionalHookSource } from './helpers/appScreens.mjs';

const app = fs.readFileSync('src/App.jsx', 'utf8');
const functions = functionsBackendSource();

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
  // Declared in app/screenScopes.js since the App split.
  const tabs = between(
    fs.readFileSync(new URL('../../src/app/screenScopes.js', import.meta.url), 'utf8'),
    'export const TEACHER_FULL_STUDENT_DATA_TABS = new Set([',
    ']);',
    'full student data tab list',
  );
  // App reads this one table, imported, never a second copy of its own.
  assert.match(app, /\bTEACHER_FULL_STUDENT_DATA_TABS,\n[\s\S]*?\} from '\.\/app\/screenScopes\.js';/);
  assert.doesNotMatch(app, /const TEACHER_FULL_STUDENT_DATA_TABS\b/);
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
  assert.match(liveGradeEffect, /setTeacherStudentDataMode\('summary'\)/);
  // The live grades effect itself is useTeacherRosterData since the App split:
  // App calls it here, where the effect was, and the hook holds the gate.
  assert.match(liveGradeEffect, /\n {2}useTeacherRosterData\(/);
  const rosterEffect = between(
    positionalHookSource('useTeacherRosterData'),
    'useEffect(() => {',
    'SEATS FOR UNIQUE QUESTIONS',
    'teacher student data effect in useTeacherRosterData',
  );
  assert.match(rosterEffect, /TEACHER_FULL_STUDENT_DATA_TABS\.has\(teacherTab\)/);
  assert.match(rosterEffect, /setAllStudents\(teacherRosterSummaries\)/);
  assert.match(rosterEffect, /setTeacherStudentDataMode\('summary'\)/);
});

test('whole-roster mastery/profile derivation is disabled while only compact roster data is resident', () => {
  const mastery = between(
    app,
    'const teacherMasteryProfilesByStudentId = useMemo',
    '// ONE SET OF LEARNING PROFILES',
    'teacher mastery memo',
  );
  // The learning profiles are a memo of useTeacherLearningPaths since the App split.
  const learning = between(
    positionalHookSource('useTeacherLearningPaths'),
    'const teacherLearningProfiles = useMemo',
    '// The students in the class the Weekly Path screen is looking at.',
    'teacher learning profile memo',
  );
  assert.match(mastery, /teacherStudentDataMode !== 'full'/);
  assert.match(learning, /teacherStudentDataMode !== 'full'/);
});

test('opening one student from a light screen reads only that student detail document', () => {
  // The profile drawer's loading is useTeacherAnalytics since the App split.
  const drawer = between(
    positionalHookSource('useTeacherAnalytics'),
    'const profileDrawerRosterStudent = useMemo',
    'const profileDrawerSupportEvents = useMemo',
    'profile drawer loading',
  );
  assert.match(drawer, /getDoc\(doc\(db, 'grades', profileDrawerStudentId\)\)/);
  assert.doesNotMatch(drawer, /getDocs\(collection\(db, 'grades'\)\)/);
});

test('compact roster callable explicitly excludes attempt history fields', () => {
  // The teacher roster projection is the ONE shared field list
  // (functions/shared/studentIdentity.mjs), so the server cannot select less
  // than the name resolver reads — dropping googleName is how Classroom-linked
  // students lost their names — or more than the compact roster needs.
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
  // Exactly the shared list: nothing added beside it, nothing listed locally.
  const spread = projection.match(/^db\.collection\("grades"\)\.select\(\s*\.\.\.(\w+)\.TEACHER_ROSTER_SELECT_FIELDS,?\s*$/);
  assert.ok(spread, 'listSignInAccess must select exactly ...TEACHER_ROSTER_SELECT_FIELDS and nothing else');
  assert.match(callable, new RegExp(`const ${spread[1]} = await studentIdentity\\(\\);`));
  assert.match(functions, /studentIdentityModule = await import\("\.\/shared\/studentIdentity\.mjs"\)/);

  // And that list carries every name field, the support profile and the SIS
  // id — and nothing from a student's attempt history.
  for (const field of ['profile', 'sisStudentId', 'googleName', ...STUDENT_IDENTITY_FIELDS]) {
    assert.ok(TEACHER_ROSTER_SELECT_FIELDS.includes(field), `the roster projection must select ${field}`);
  }
  for (const history of ['gradesByAssignment', 'assignmentActivity', 'supportUsageByAssignment', 'dolGradesByAssignment', 'classworkGradesByAssignment']) {
    assert.ok(!TEACHER_ROSTER_SELECT_FIELDS.includes(history), `the roster projection must not select ${history}`);
  }
});

test('teacher background history streams are scoped to the screens that use them', () => {
  // The streams are opened by useTeacherActionCenterData since the App split.
  const streams = positionalHookSource('useTeacherActionCenterData');
  assert.match(streams, /TEACHER_SUPPORT_STREAM_TABS\.has\(teacherTab\)/);
  assert.match(streams, /TEACHER_PARENT_CONTACT_STREAM_TABS\.has\(teacherTab\)/);
  assert.match(streams, /TEACHER_SESSION_SUMMARY_TABS\.has\(teacherTab\)/);
  assert.match(streams, /teacherTab !== 'actionCenter'/);
});

test('ordinary teacher navigation has no generic whole-roster fetch helper left to call accidentally', () => {
  assert.doesNotMatch(app, /const fetchStudents\s*=\s*async/);
  assert.doesNotMatch(app, /fetchStudents\(\)/);
});

test('leaving heavy teacher screens releases their cached history arrays', () => {
  // The three streams are effects of useTeacherActionCenterData since the App split.
  const actionCenterData = positionalHookSource('useTeacherActionCenterData');
  const support = between(
    actionCenterData,
    '// Persistent support/intervention history is teacher-authorized',
    '// One teacher-scoped stream spans the whole roster.',
    'support stream',
  );
  assert.match(support, /setStudentSupportEvents\(\[\]\)/);

  const contacts = between(
    actionCenterData,
    '// One teacher-scoped stream spans the whole roster.',
    'const actionGradeScope = useMemo',
    'parent contacts stream',
  );
  assert.match(contacts, /setParentContacts\(\[\]\)/);

  const actionState = between(
    actionCenterData,
    'const actionGradeScope = useMemo',
    // The state stays in App; what followed it (the attendance-extension handlers) is
    // createAttendanceExtensionControls since the App split, called where the code was.
    // The effects that empty that state end where the hook returns.
    '\n  return [actionGradeScope,',
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
  // Mounted by the teacher's screen, its own module since G2.
  assert.match(fs.readFileSync('src/app/teacher/TeacherWorkspace.jsx', 'utf8'), /academicDataLoaded=\{teacherStudentDataMode === 'full'\}/);
  assert.match(classesWorkspace, /academicDataLoaded = true/);
  assert.match(classesWorkspace, /activeOnAssignmentCount/);
  assert.match(classesWorkspace, /active now/);
  assert.match(classesWorkspace, /This screen stays lightweight during class/);
});

test('Parent Contacts opts into complete academic detail only while that tab is open', () => {
  const fullTabs = between(
    fs.readFileSync(new URL('../../src/app/screenScopes.js', import.meta.url), 'utf8'),
    'export const TEACHER_FULL_STUDENT_DATA_TABS = new Set([',
    ']);',
    'full student data tabs',
  );
  assert.match(fullTabs, /'parentContacts'/);
  assert.match(fs.readFileSync(new URL('../../src/app/screenScopes.js', import.meta.url), 'utf8'), /TEACHER_SUPPORT_STREAM_TABS[^\n]*parentContacts/);
  assert.match(fs.readFileSync(new URL('../../src/app/screenScopes.js', import.meta.url), 'utf8'), /TEACHER_SESSION_SUMMARY_TABS[^\n]*parentContacts/);
});
