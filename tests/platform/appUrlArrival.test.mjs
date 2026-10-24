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
  ARRIVAL_SIGN_IN_WINDOW_MS,
  arrivalStillWanted,
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

test('an arrival opens once, with the calls a click makes (app/routes/useUrlArrival.js)', () => {
  const hook = executableSource(readFileSync(new URL('../../src/app/routes/useUrlArrival.js', import.meta.url), 'utf8'));
  const effect = region(hook, 'useEffect(() => {\n    if (!urlArrival || !user?.id || !(ready || waitedOut)) return;', '}, [urlArrival, user?.id, user?.role, ready, waitedOut]);', 'arrival effect');
  // Only once an account has loaded and its lessons carry its own controls
  // (or the wait has run out).
  assert.match(hook, /setTimeout\(\(\) => setWaitedOut\(true\), ARRIVAL_SETTLE_TIMEOUT_MS\)/);
  assert.match(effect, /setUrlArrival\(null\);/, 'an arrival opens once');
  assert.match(effect, /if \(openedRef\.current === arrival\) return;\s*openedRef\.current = arrival;/, 'once, even when the effect runs twice');
  assert.match(effect, /student\.startAssignment\(plan\.assignmentId, plan\.storageIndex \?\? 0, \{\s*\.\.\.\(plan\.exact \? \{ keepRequestedQuestion: true \} : \{\}\),\s*\.\.\.\(plan\.sectionKey \? \{ sectionKey: plan\.sectionKey \} : \{\}\),\s*\}\)/);
  assert.match(effect, /student\.openStudentAssignmentResult\(plan\.assignmentId/);
  assert.match(effect, /student\.setActiveTestCycleAssignmentId\(plan\.assignmentId\);\s*student\.openStudentDashboardMode\('testCycle'\)/);
  assert.match(effect, /student\.setPathLaunchTeks\(plan\.launchTeks\)/);
  assert.match(effect, /teacher\.startTeacherPreview\(teacherPlan\.assignmentId\)/);
  // A message about another screen is said at once; one about the work (the
  // question moved) is said when the workspace is on screen, or at once when
  // the start went elsewhere (wave-3 gate: it sat over Home, then a loading
  // screen, for seconds).
  assert.match(effect, /if \(plan\.message && plan\.action !== 'assignment'\) toastInfo\(plan\.message\.title, plan\.message\.body\);/);
  assert.match(effect, /const opening = student\.startAssignment\(/);
  assert.match(effect, /if \(plan\.message\) \{\s*if \(opening === true && student\.showWhenWorkspaceOpens\) student\.showWhenWorkspaceOpens\(plan\.message\);\s*else toastInfo\(plan\.message\.title, plan\.message\.body\);\s*\}/);
  assert.match(hook, /^import \{ arrivalStillWanted, planStudentArrival, planTeacherArrival \} from '\.\/urlArrival\.js';$/m);
  assert.match(hook, /^import \{ readMathPathRouteState, readRouteOwner, readStudentRouteState \} from '\.\.\/\.\.\/platform\/student\/browserHistory\.js';$/m);
  assert.match(hook, /^import \{ readTeacherRouteState \} from '\.\.\/\.\.\/platform\/teacher\/teacherBrowserHistory\.js';$/m);
});

test('App hands the arrival its real actions, each declared before the call (no temporal dead zone)', () => {
  assert.match(app, /^import \{ useUrlArrival \} from '\.\/app\/routes\/useUrlArrival\.js';$/m);
  // The same module also gives App its arrival messages (a Classroom link that cannot open, NAV-11).
  assert.match(app, /^import \{[^}\n]*\breadUrlArrival\b[^}\n]*\} from '\.\/app\/routes\/urlArrival\.js';$/m);
  assert.match(app, /import \{ questionAddressFor, studentQuestionEntries \} from '\.\/app\/routes\/questionAddress\.js';/);
  assert.match(app, /import \{ resetAddressToHome, studentUrlFor, teacherUrlFor \} from '\.\/app\/routes\/browserUrl\.js';/);
  const callAt = appCode.indexOf('useUrlArrival({');
  assert.ok(callAt > 0, 'App calls useUrlArrival');
  const call = region(appCode, 'useUrlArrival({', '\n  });', 'useUrlArrival call');
  // Passing a const before its declaration throws on every render (a ReferenceError
  // lint and the build cannot see), so each action must be declared above.
  for (const action of ['startAssignment', 'openStudentAssignmentResult', 'openStudentDashboardMode', 'startTeacherPreview', 'studentQuestionEntriesFor']) {
    assert.match(call, new RegExp(`\\b${action}\\b`), `${action} is handed to the arrival`);
    const declaredAt = appCode.indexOf(`const ${action} = `);
    assert.ok(declaredAt > 0 && declaredAt < callAt, `${action} is declared after useUrlArrival is called`);
  }
  assert.ok(callAt < appCode.indexOf('if (!userIsSignedInAccount)'), 'a hook is called before the session guard returns');
});

test('the arrival notice about the work waits for the workspace commit, and the start says when it opened it', () => {
  const start = region(appCode, 'const startAssignment = (assignmentId, requestedQuestionIndex = 0, options = {}) => {', 'const openStudentDashboardMode = ', 'startAssignment');
  assert.match(start, /setActiveView\('assignment'\);\s*return true;\s*\};\s*$/);
  const notice = region(appCode, 'const [workspaceArrivalNotices, setWorkspaceArrivalNotices] = useState([]);', '}, [workspaceArrivalNotices, activeView, toastInfo]);', 'workspace notice effect');
  assert.match(notice, /const showWhenWorkspaceOpens = useCallback\(\(notice\) => \{\s*if \(notice\?\.title\) setWorkspaceArrivalNotices\(\(current\) => \[\.\.\.current, notice\]\);/);
  // Shown only once the workspace is on screen. A screen committed with the
  // notice still queued but without the workspace drops it, so it never shows
  // over a later, unrelated opening (pass 3, wave 7; W6-2's N6).
  const offWorkspace = notice.search(/if \(activeView !== 'assignment'\) \{\s*setWorkspaceArrivalNotices\(\[\]\);\s*return;\s*\}/);
  assert.notEqual(offWorkspace, -1, 'off the workspace the queue is dropped, and nothing is shown');
  assert.ok(offWorkspace < notice.indexOf('toastInfo(notice.title, notice.body);'), 'the drop comes before the toast');
  assert.match(notice, /if \(shownArrivalNoticesRef\.current\.has\(notice\)\) return;\s*shownArrivalNoticesRef\.current\.add\(notice\);\s*toastInfo\(notice\.title, notice\.body\);/);
  assert.match(notice, /setWorkspaceArrivalNotices\(\[\]\);/);
  // The start's own notices wait for the workspace too (review S2).
  assert.match(start, /showWhenWorkspaceOpens\(\{ title: 'That question is not open right now', body: 'It opened where you can work now\.' \}\);/);
  assert.match(start, /if \(detour\) showWhenWorkspaceOpens\(detour\);/);
  assert.doesNotMatch(start, /toastInfo\('That question is not open right now'/);
  const call = region(appCode, 'useUrlArrival({', '\n  });', 'useUrlArrival call');
  assert.match(call, /showWhenWorkspaceOpens,/);
  assert.ok(appCode.indexOf('const showWhenWorkspaceOpens = useCallback(') < appCode.indexOf('useUrlArrival({'));
});

test('startAssignment still redirects every Test Cycle to its card, before any requested question', () => {
  const start = region(appCode, 'const startAssignment = (assignmentId, requestedQuestionIndex = 0, options = {}) => {', "setActiveView('assignment');", 'startAssignment');
  const redirect = start.indexOf("return openStudentDashboardMode('testCycle');");
  assert.ok(redirect > 0, 'the Test Cycle redirect is in startAssignment');
  assert.ok(redirect < start.indexOf('keepRequestedQuestion'), 'the redirect runs before an address\'s question is honoured');
  assert.ok(redirect < start.indexOf('assignmentIsForStudent('), 'and before the class check');
  // keepRequestedQuestion keeps the question only where roleIsActionable
  // (section windows, locks) still decides; it never opens a closed section.
  assert.match(start, /const keepRequested = Boolean\(options\?\.returnToResult\)\s*\|\| Boolean\(options\?\.keepRequestedQuestion && roleIsActionable\(requestedRole\)\);/);
  assert.match(start, /isFinished: keepRequested\s*\? null/);
  assert.match(start, /roleIsActionable,/);
});

test('the history writers wait for the arrival, write the screen\'s address, and Log Out returns the bar to Home', () => {
  const writer = region(appCode, 'useEffect(() => {\n    if (!studentBrowserRoute) {', '}, [studentBrowserRoute, urlArrival]);', 'student writer');
  assert.match(writer, /if \(urlArrival\) return;/);
  assert.match(writer, /const url = studentUrlFor\(studentBrowserRoute, \{/);
  assert.match(writer, /questionAddressFor\(\s*studentQuestionEntriesFor\(/);
  assert.match(writer, /writeStudentRouteState\(studentBrowserRoute, \{ replace: true, url, owner: user\?\.uid, fresh: !ownEntry \}\)/);
  assert.match(writer, /writeStudentRouteState\(studentBrowserRoute, \{ url, owner: user\?\.uid \}\)/);
  const logout = region(appCode, 'const handleLogout = async () => {', 'await auth.signOut();', 'Log Out');
  assert.match(logout, /resetAddressToHome\(\);/);
});

test('Back never restores an entry another account wrote (the previous student on a shared Chromebook)', () => {
  const studentRestore = region(appCode, 'const restoreFromBrowserHistory = (event) => {', "window.addEventListener('popstate', restoreFromBrowserHistory)", 'student popstate');
  const foreign = studentRestore.indexOf('if (readRouteOwner(event.state) !== historyAccountRef.current) {');
  assert.ok(foreign > 0, 'the student handler checks the entry\'s account');
  assert.ok(foreign < studentRestore.indexOf("if (route.surface === 'assignment')"), 'before anything is restored');
  assert.match(studentRestore.slice(foreign), /^[^]*?fresh: true,[^]*?return;/);
  const teacherRestore = region(appCode, 'teacherHistoryRestoreRef.current = (event) => {', "window.addEventListener('popstate', restoreTeacherFromBrowserHistory)", 'teacher popstate');
  const teacherForeign = teacherRestore.indexOf('if (readRouteOwner(event.state) !== user?.uid) {');
  assert.ok(teacherForeign > 0 && teacherForeign < teacherRestore.indexOf('setTeacherTab(route.tab)'), 'the teacher handler checks the entry\'s account first');
  assert.match(app, /\breadRouteOwner,\n[\s\S]*?\} from '\.\/platform\/student\/browserHistory\.js';/);
});

test('excused work opens its result page, never the graded workspace, whatever door it came through', () => {
  const start = region(appCode, 'const startAssignment = (assignmentId, requestedQuestionIndex = 0, options = {}) => {', "setActiveView('assignment');", 'startAssignment');
  const gate = start.indexOf("resolveStudentOverride({ assignment: assignmentData, studentId: user.id })?.excused === true");
  assert.ok(gate > 0, 'startAssignment checks the student\'s excusal');
  assert.ok(gate < start.indexOf('setActiveAssignmentId(assignmentId)'), 'before the workspace opens');
  // It lands on the result page, which says why (NAV-10: studentOpenGate.js).
  assert.match(start.slice(gate, gate + 400), /landOnResult\(describeOpenNotice\(\{ kind: OPEN_NOTICE\.EXCUSED \}\)\);\s*return;/);
  assert.match(start, /const landOnResult = \(notice\) => openStudentAssignmentResult\(assignmentId, \{ origin: resultOrigin, notice \}\);/);
  assert.match(app, /^import \{ resolveStudentOverride \} from '\.\.\/functions\/shared\/studentAssignmentOverrides\.mjs';$/m);
});

// NV09: an address that waited on a signed-out page longer than a sign-in
// takes is not the next account's (a shared Chromebook), and a student who
// went somewhere while it waited keeps the screen they chose.
test('an arrival nobody wants any more does not open', () => {
  const at = 1_000_000;
  assert.equal(arrivalStillWanted({ arrivedAt: at, now: at + 90_000 }), true, 'signed in a minute and a half later');
  assert.equal(arrivalStillWanted({ arrivedAt: at, now: at + ARRIVAL_SIGN_IN_WINDOW_MS }), true, 'the window is inclusive');
  assert.equal(arrivalStillWanted({ arrivedAt: at, now: at + ARRIVAL_SIGN_IN_WINDOW_MS + 1 }), false, 'left on a signed-out page');
  assert.equal(arrivalStillWanted({ arrivedAt: null, now: at }), true, 'no time read: nothing to judge');
  const home = 'dashboard:home';
  assert.equal(arrivalStillWanted({ arrivedAt: at, now: at + 5_000, firstRouteKey: home, routeKey: home }), true, 'still on the first screen');
  assert.equal(arrivalStillWanted({ arrivedAt: at, now: at + 5_000, firstRouteKey: home, routeKey: 'dashboard:grades' }), false, 'the student tapped Grades');
  assert.equal(arrivalStillWanted({ arrivedAt: at, now: at + 5_000, firstRouteKey: null, routeKey: home }), true, 'no first screen seen yet');
  assert.equal(ARRIVAL_SIGN_IN_WINDOW_MS, 10 * 60 * 1000);
});

test('the hook asks before opening, and App hands it the time and the student\'s screen', () => {
  const hook = executableSource(readFileSync(new URL('../../src/app/routes/useUrlArrival.js', import.meta.url), 'utf8'));
  const effect = region(hook, 'useEffect(() => {\n    if (!urlArrival || !user?.id || !(ready || waitedOut)) return;', '}, [urlArrival, user?.id, user?.role, ready, waitedOut]);', 'arrival effect');
  assert.match(effect, /openedRef\.current = arrival;\s*if \(!arrivalStillWanted\(\{ arrivedAt, firstRouteKey: firstRouteRef\.current, routeKey \}\)\) return;/);
  assert.match(hook, /if \(urlArrival && user\?\.id && routeKey && firstRouteRef\.current === null\) firstRouteRef\.current = routeKey;/);
  const app = executableSource(readFileSync(new URL('../../src/App.jsx', import.meta.url), 'utf8'));
  const call = region(app, 'useUrlArrival({', '\n  });', 'useUrlArrival call');
  assert.match(call, /arrivedAt: urlArrivalAtRef\.current,/);
  assert.match(call, /routeKey: user\?\.role === 'student' && studentBrowserRoute \? studentRouteKey\(studentBrowserRoute\) : null,/);
});

// NV03: a section-scoped Classroom launch keeps its section on a reload or
// Back: the scope rides in this tab's history entry, never in the address.
test('a reload of a section-scoped launch keeps the section; a fresh link opens the whole assignment', async () => {
  const { normalizeStudentRoute, studentRouteKey } = await import('../../src/platform/student/browserHistory.js');
  assert.deepEqual(normalizeStudentRoute({ surface: 'assignment', assignmentId: 'A1', questionIndex: 3, sectionScope: 'dol' }),
    { surface: 'assignment', assignmentId: 'A1', questionIndex: 3, sectionScope: 'dol' });
  assert.equal('sectionScope' in normalizeStudentRoute({ surface: 'assignment', assignmentId: 'A1', sectionScope: 'everything' }), false, 'only a real section');
  assert.notEqual(studentRouteKey({ surface: 'assignment', assignmentId: 'A1', questionIndex: 3, sectionScope: 'dol' }),
    studentRouteKey({ surface: 'assignment', assignmentId: 'A1', questionIndex: 3 }), 'the scope is part of the entry');
  const assignments = [{ id: 'A1', title: 'Lesson 1' }];
  const arrival = readUrlArrival({ pathname: '/assignments/A1' });
  const reload = planStudentArrival({ arrival, assignments, historyRoute: { surface: 'assignment', assignmentId: 'A1', questionIndex: 0, sectionScope: 'dol' } });
  assert.equal(reload.action, 'assignment');
  assert.equal(reload.sectionKey, 'dol');
  assert.equal('sectionKey' in planStudentArrival({ arrival, assignments }), false, 'a fresh link: the whole assignment');
  assert.equal('sectionKey' in planStudentArrival({ arrival, assignments, historyRoute: { surface: 'assignment', assignmentId: 'B2', sectionScope: 'dol' } }), false, 'another assignment\'s scope is not this one\'s');
  const app = executableSource(readFileSync(new URL('../../src/App.jsx', import.meta.url), 'utf8'));
  const route = region(app, 'const studentBrowserRoute = useMemo(() => {', '}, [user?.role, activeView', 'the student route');
  assert.match(route, /\.\.\.\(activeClassroomSectionKey \? \{ sectionScope: activeClassroomSectionKey \} : \{\}\),/);
  assert.match(app, /setActiveClassroomSectionKey\(route\.sectionScope \|\| null\);/, 'Back onto the entry restores the scope');
});
