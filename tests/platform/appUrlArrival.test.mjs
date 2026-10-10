/*
 * Arriving at an address (src/app/routes/urlArrival.js) and how App opens it.
 *
 * The plan names the destination; App opens it with the function a click
 * calls, so a typed, reloaded or shared URL meets every gate a click meets.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  ARRIVAL_MESSAGES,
  planStudentArrival,
  planTeacherArrival,
  readUrlArrival,
} from '../../src/app/routes/urlArrival.js';
import { studentQuestionEntries } from '../../src/app/routes/questionAddress.js';
import { executableSource, region } from './helpers/sourceContract.mjs';

const lesson = (id, extra = {}) => ({
  id,
  schemaVersion: 5,
  sections: [
    { id: 'wu', role: 'warmup', questions: [{ questionId: `${id}-w1` }] },
    { id: 'cw', role: 'classwork', questions: [{ questionId: `${id}-c1` }, { questionId: `${id}-c2` }] },
  ],
  ...extra,
});
const mine = [lesson('a1'), lesson('cycle', { testCycle: true })];
const plan = (pathname, extra = {}) => planStudentArrival({
  arrival: readUrlArrival({ pathname }),
  assignments: mine,
  isTestCycle: (assignment) => assignment.testCycle === true,
  questionEntriesFor: (assignment) => studentQuestionEntries(assignment),
  ...extra,
});

test('Home, a harness page and a Classroom launch link are not arrivals', () => {
  assert.equal(readUrlArrival({ pathname: '/' }), null);
  assert.equal(readUrlArrival({ pathname: '/index.html' }), null);
  assert.equal(readUrlArrival({ pathname: '/tests/browser/teacherWorkflow/index.html' }), null);
  assert.equal(readUrlArrival({ pathname: '/assignments/a1', search: '?launch=a1' }), null, 'the Classroom launch owns its own arrival');
  assert.ok(readUrlArrival({ pathname: '/grades' }));
});

test('a question address opens that question, through startAssignment, keeping the requested question', () => {
  assert.deepEqual(plan('/assignments/a1/classwork/2'), { action: 'assignment', assignmentId: 'a1', storageIndex: 2, exact: true });
  assert.deepEqual(plan('/assignments/a1'), { action: 'assignment', assignmentId: 'a1', storageIndex: null, exact: false });
  const moved = plan('/assignments/a1/classwork/7');
  assert.equal(moved.action, 'assignment');
  assert.equal(moved.storageIndex, null, 'a question that no longer exists opens where the student can work');
  assert.equal(moved.message, ARRIVAL_MESSAGES.questionGone);
});

test('an assignment outside this student\'s own scope shows nothing of it', () => {
  // Another class's assignment, another student's link, a deleted lesson: the
  // student's own list is the only scope an address can reach.
  for (const path of ['/assignments/someone-elses', '/assignments/someone-elses/classwork/1', '/assignments/someone-elses/results', '/test-cycle/someone-elses']) {
    assert.deepEqual(plan(path), { action: 'home', message: ARRIVAL_MESSAGES.studentStale }, path);
  }
  assert.deepEqual(plan('/students/910002'), { action: 'home', message: ARRIVAL_MESSAGES.notFound });
});

test('a Test Cycle is reached only through its card, whatever the address says', () => {
  assert.deepEqual(plan('/test-cycle/cycle'), { action: 'testCycle', assignmentId: 'cycle' });
  assert.deepEqual(plan('/test-cycle/a1'), { action: 'home', message: ARRIVAL_MESSAGES.studentStale }, 'not a Test Cycle');
  // An assignment address for a Test Cycle goes to startAssignment, which
  // redirects every non-card entry to the card (asserted on App below).
  assert.equal(plan('/assignments/cycle/test/1').action, 'assignment');
});

test('a teacher address never opens for a student, and a teacher preview is the teacher\'s', () => {
  for (const path of ['/teacher', '/teacher/grades', '/teacher/preview/a1', '/teacher/admin/accounts']) {
    assert.deepEqual(plan(path), { action: 'home', message: ARRIVAL_MESSAGES.teacherOnly }, path);
  }
});

test('the result page keeps where the student came from only on a reload of the same entry', () => {
  assert.equal(plan('/assignments/a1/results').origin, 'assignments');
  assert.equal(plan('/assignments/a1/results', { historyRoute: { surface: 'assignmentResult', assignmentId: 'a1', origin: 'grades' } }).origin, 'grades');
  assert.equal(plan('/assignments/a1/results', { historyRoute: { surface: 'assignmentResult', assignmentId: 'other', origin: 'grades' } }).origin, 'assignments');
  assert.equal(plan('/assignments/a1/results/dol').sectionKey, 'dol');
});

test('My Math Path: a tab, a reloaded session restored, a fresh session link started by My Math Path itself', () => {
  assert.deepEqual(plan('/path/progress'), { action: 'mathPath', tab: 'progress', sessionConfig: null, launchTeks: null });
  const sessionConfig = { targetAlignmentKey: 'A.5A', sessionKind: 'practice', weeklySlotKey: 'w1' };
  assert.deepEqual(
    plan('/path/session/A.5A', { mathPathRoute: { tab: 'session', sessionConfig } }),
    { action: 'mathPath', tab: 'session', sessionConfig, launchTeks: null },
  );
  // No history entry (a new tab): "Practice This Skill"'s own door, with its
  // coverage checks, not a session config typed into the address.
  assert.deepEqual(plan('/path/session/A.5A'), { action: 'mathPath', tab: 'path', sessionConfig: null, launchTeks: 'A.5A' });
  assert.deepEqual(
    plan('/path/session/A.5A', { mathPathRoute: { tab: 'session', sessionConfig: { targetAlignmentKey: 'A.2B' } } }),
    { action: 'mathPath', tab: 'path', sessionConfig: null, launchTeks: 'A.5A' },
  );
});

test('dashboard screens open by mode; the secure-test screen is the place a test is started', () => {
  assert.deepEqual(plan('/grades'), { action: 'dashboard', mode: 'grades' });
  assert.deepEqual(plan('/tests'), { action: 'dashboard', mode: 'secureExams' });
  assert.deepEqual(plan('/live'), { action: 'dashboard', mode: 'liveChallenge' });
  assert.deepEqual(plan('/test-cycle'), { action: 'dashboard', mode: 'assignmentsCenter' });
});

const teacherPlan = (pathname, extra = {}) => planTeacherArrival({
  arrival: readUrlArrival({ pathname }),
  assignments: mine,
  ...extra,
});

test('teacher arrivals: tab, monitor, preview, Administration only for an administrator', () => {
  assert.deepEqual(teacherPlan('/teacher/grades'), { action: 'workspace', tab: 'grades', hubAssignmentId: null, hubClassId: null });
  assert.deepEqual(teacherPlan('/teacher/assignments/assignments/a1'), { action: 'workspace', tab: 'assignments', hubAssignmentId: 'a1', hubClassId: null });
  assert.equal(
    teacherPlan('/teacher/assignments/assignments/a1', { historyRoute: { surface: 'workspace', panels: { hubAssignmentId: 'a1', hubClassId: 'c9' } } }).hubClassId,
    'c9',
  );
  assert.equal(teacherPlan('/teacher/assignments/assignments/gone').message, ARRIVAL_MESSAGES.teacherStale);
  assert.deepEqual(teacherPlan('/teacher/preview/a1'), { action: 'preview', assignmentId: 'a1' });
  assert.equal(teacherPlan('/teacher/preview/gone').message, ARRIVAL_MESSAGES.teacherStale);
  assert.equal(teacherPlan('/teacher/admin/accounts').message, ARRIVAL_MESSAGES.adminOnly);
  assert.deepEqual(teacherPlan('/teacher/admin/accounts', { canAdminister: true }), { action: 'administration', adminTab: 'accounts' });
  assert.equal(teacherPlan('/nope').message, ARRIVAL_MESSAGES.notFound);
  // A student's link to one of the teacher's assignments opens its monitor.
  assert.deepEqual(teacherPlan('/assignments/a1/classwork/2'), { action: 'workspace', tab: 'assignments', hubAssignmentId: 'a1', hubClassId: null });
  assert.equal(teacherPlan('/grades').message, ARRIVAL_MESSAGES.studentPage);
});

// --- App wiring ---------------------------------------------------------------

const app = readFileSync(new URL('../../src/App.jsx', import.meta.url), 'utf8');
const appCode = executableSource(app);

test('App opens an arrival with the calls a click makes, and imports what it calls', () => {
  const effect = region(appCode, 'useEffect(() => {\n    if (!urlArrival || !user?.id) return;', '}, [urlArrival, user?.id, user?.role]);', 'arrival effect');
  assert.match(effect, /setUrlArrival\(null\);/, 'an arrival opens once');
  assert.match(effect, /planStudentArrival\(\{/);
  assert.match(effect, /startAssignment\(plan\.assignmentId, plan\.storageIndex \?\? 0, plan\.exact \? \{ keepRequestedQuestion: true \} : \{\}\)/);
  assert.match(effect, /openStudentAssignmentResult\(plan\.assignmentId/);
  assert.match(effect, /setActiveTestCycleAssignmentId\(plan\.assignmentId\);\s*openStudentDashboardMode\('testCycle'\)/);
  assert.match(effect, /setPathLaunchTeks\(plan\.launchTeks\)/);
  assert.match(effect, /planTeacherArrival\(\{/);
  assert.match(effect, /startTeacherPreview\(plan\.assignmentId\)/);
  assert.match(effect, /if \(plan\.message\) toastInfo\(plan\.message\.title, plan\.message\.body\);/);
  // Every call above is a module import (no-undef aside, the import is the
  // contract a reader can check).
  assert.match(app, /import \{ planStudentArrival, planTeacherArrival, readUrlArrival \} from '\.\/app\/routes\/urlArrival\.js';/);
  assert.match(app, /import \{ questionAddressFor, studentQuestionEntries \} from '\.\/app\/routes\/questionAddress\.js';/);
  assert.match(app, /import \{ mathPathUrlFor, resetAddressToHome, studentUrlFor, teacherUrlFor \} from '\.\/app\/routes\/browserUrl\.js';/);
  assert.match(app, /\breadMathPathRouteState,\n/);
  assert.match(app, /\breadTeacherRouteState,\n/);
});

test('startAssignment still redirects every Test Cycle to its card, before any requested question', () => {
  const start = region(appCode, 'const startAssignment = (assignmentId, requestedQuestionIndex = 0, options = {}) => {', "setActiveView('assignment');", 'startAssignment');
  const redirect = start.indexOf("return openStudentDashboardMode('testCycle');");
  assert.ok(redirect > 0, 'the Test Cycle redirect is in startAssignment');
  assert.ok(redirect < start.indexOf('keepRequestedQuestion'), 'the redirect runs before an address\'s question is honoured');
  assert.ok(redirect < start.indexOf('assignmentIsForStudent('), 'and before the class check');
  // keepRequestedQuestion keeps the question only where roleIsActionable
  // (section windows, locks) still decides; it never opens a closed section.
  assert.match(start, /isFinished: options\?\.returnToResult \|\| options\?\.keepRequestedQuestion\s*\? null/);
  assert.match(start, /roleIsActionable,/);
});

test('the history writers wait for the arrival, write the screen\'s address, and Log Out returns the bar to Home', () => {
  const writer = region(appCode, 'useEffect(() => {\n    if (!studentBrowserRoute) {', '}, [studentBrowserRoute, urlArrival]);', 'student writer');
  assert.match(writer, /if \(urlArrival\) return;/);
  assert.match(writer, /const url = studentUrlFor\(studentBrowserRoute, \{/);
  assert.match(writer, /questionAddressFor\(\s*studentQuestionEntriesFor\(/);
  assert.match(writer, /writeStudentRouteState\(studentBrowserRoute, \{ replace: true, url \}\)/);
  assert.match(writer, /writeStudentRouteState\(studentBrowserRoute, \{ url \}\)/);
  const logout = region(appCode, 'const handleLogout = async () => {', 'await auth.signOut();', 'Log Out');
  assert.match(logout, /resetAddressToHome\(\);/);
});
