import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { executableSource, region } from './helpers/sourceContract.mjs';

/*
 * App.jsx WIRING FOR THE ONE "TODAY" RULE.
 *
 * Nothing imports App.jsx, so a call with no import passes every gate and
 * throws for every student at runtime. Each call below is asserted beside its
 * import (AGENTS.md, "Two things the whole gate misses").
 */
const app = executableSource(readFileSync(new URL('../../src/App.jsx', import.meta.url), 'utf8'));

test('Recovery for every assignment is built and fed to the dashboard, with its import', async () => {
  assert.match(app, /import\s*\{[^}]*\brecoveryStatesFromSummaries\b[^}]*\}\s*from\s*'\.\/platform\/student\/recoveryStates\.js'/);
  // Built by the student's Recovery kit, which loads after Home: until it
  // arrives the dashboard sees no Recovery, and when it does the memo rebuilds.
  assert.match(app, /import\s*\{[^}]*\bloadStudentRecoveryKit\b[^}]*\}\s*from\s*'\.\/app\/student\/studentRecoveryKitLoader\.js'/);
  assert.match(app, /useMemo\(\(\)\s*=>\s*\(user\?\.role === 'student' && user\?\.id && studentRecoveryKit\s*\?\s*studentRecoveryKit\.buildRecoverySummariesByAssignment\(/);
  const memo = region(app, 'const studentRecoverySummariesByAssignment = useMemo(', ']);', 'summaries memo');
  assert.match(memo, /\[studentRecoveryKit, /);
  // The kit hands App the very builder the dashboard's tests exercise.
  const kit = await import('../../src/app/student/studentRecoveryKit.js');
  const { buildRecoverySummariesByAssignment } = await import('../../src/platform/student/recoverySummaries.js');
  assert.equal(kit.buildRecoverySummariesByAssignment, buildRecoverySummariesByAssignment);
});

test('the dashboard model receives the student, their Recovery states and the teacher section lock', () => {
  const call = region(app, 'buildStudentDashboardModel({', 'matchesSmartView: (assignment', 'the dashboard model call');
  assert.match(call, /studentId:\s*user\.id/);
  assert.match(call, /recoveryStateByAssignment:\s*recoveryStatesFromSummaries\(studentRecoverySummariesByAssignment\)/);
  assert.match(call, /\bgetSectionAccessState,/);
  assert.match(app, /import\s*\{[^}]*\bgetSectionAccessState\b/);
});

test('Start/Continue lands on the first unfinished open question, and never on a dead end', () => {
  const start = region(app, 'const startAssignment = (', 'const openStudentDashboardMode', 'startAssignment');
  const entry = region(start, 'resolveStudentAssignmentEntry({', 'safeQuestionIndex = actionableIndex', 'entry resolution');
  // Review My Work keeps the question it asked for; a question's address
  // keeps it only while its section is open (roleIsActionable).
  assert.match(entry, /isFinished:\s*keepRequested\s*\?\s*null/);
  assert.match(start, /const keepRequested = Boolean\(options\?\.returnToResult\)\s*\|\| Boolean\(options\?\.keepRequestedQuestion && roleIsActionable\(requestedRole\)\);/);
  // The same "finished" as Home: questionIsTerminal (extra DOL tries reopen).
  assert.match(entry, /: \(index\) => questionIsTerminal\(\{\s*record: tracker\?\.\[assignmentId\]\?\.\[index\]/);
  // With nothing open for a whole-assignment start, the student is taken to
  // the result page (what opens when), not left on a toast.
  assert.match(entry, /if \(actionableIndex === null && user\?\.role === 'student' && !scopedSectionKey\) \{\s*openStudentAssignmentResult\(assignmentId/);
});

test('Tests & Exams carries the shared student navigation, and Back names Home', () => {
  const exams = region(app, "studentDashboardMode === 'secureExams'", '<StudentSecureExamDashboard', 'Tests & Exams branch');
  assert.match(exams, /<StudentGlobalNav current=\{STUDENT_DESTINATION\.SECURE_EXAMS\} onNavigate=\{navigateStudent\}/);
  assert.match(app, /import StudentGlobalNav, \{ STUDENT_DESTINATION \} from '\.\/components\/student\/StudentGlobalNav\.jsx'/);
  const backLabel = region(app, 'const studentAssignmentBackLabel =', 'const isLiveTeachingThisAssignment', 'assignment Back label');
  assert.match(backLabel, /'Back to Home'/);
  assert.doesNotMatch(backLabel, /'Back to Dashboard'/);
});

test('What changed items are built once in App from records the student reads, with their imports', () => {
  assert.match(app, /import \{[^}]*\bbuildWhatChanged\b[^}]*\} from '\.\/platform\/student\/whatChangedModel\.js'/);
  assert.match(app, /import WhatChangedList from '\.\/components\/student\/WhatChangedList\.jsx'/);
  const memo = region(app, 'const whatChangedItems = useMemo(', '}, [user?.role, user?.id, user?.classId', 'What changed memo');
  assert.match(memo, /controlsByAssignmentId: studentAssignmentControls\?\.byAssignmentId/);
  assert.match(memo, /teacherGradeOverridesByAssignment,/);
  // Raw records, so an override the student has re-attempted past is not claimed.
  assert.match(memo, /trackerByAssignment: tracker,/);
  assert.match(memo, /return buildWhatChanged\(\{ \.\.\.input, firstSeenByKey \}\)/);
});

test('Log Out warns about unsent work on the one identity bar', () => {
  assert.match(app, /import \{ describeLogoutRisk \} from '\.\/platform\/student\/logoutGuard\.js'/);
  // The shell reads the risk once (the pack-up line, NAV-24, reads it too) and
  // hands it to the one identity bar; a teacher preview has none.
  const shell = region(app, 'const renderStudentIdentityShell = ', '<StudentIdentityBar', 'identity shell');
  assert.match(shell, /const studentShellLogoutRisk = preview \? null : describeLogoutRisk\(\{\s*outboxDepth: studentOutboxDepth,\s*pendingGradeCount: studentPendingGradeCount/);
  const bar = region(app, '<StudentIdentityBar', '/>', 'identity bar');
  assert.match(bar, /logoutRisk=\{studentShellLogoutRisk\}/);
});

test('Home is wired without the support flag, with results, save status and What changed', () => {
  const home = region(app, '<StudentDashboardView', 'recommended={{', 'Home render');
  assert.doesNotMatch(home, /inclusionStatus/);
  assert.match(home, /onOpenResult=\{\(assignmentId\) => openStudentAssignmentResult\(assignmentId/);
  // The shared save status (Home and the pack-up line read the same one).
  assert.match(home, /saveStatus=\{studentSaveStatusNow\(\)\}/);
  assert.match(app, /const studentSaveStatusNow = \(\) => describeSaveStatus\(\{/);
  assert.match(home, /whatChangedPanel=\{renderWhatChangedPanel\(true\)\}/);
  assert.match(app, /import \{[^}]*\bdescribeSaveStatus\b[^}]*\} from '\.\/platform\/student\/saveStatusModel\.js'/);
  const before = region(app, 'const studentNextAction = resolveNextAction({', '<StudentDashboardView', 'before Home');
  assert.doesNotMatch(before, /renderStudentWarmupBanner\(\)/, 'Home offers the Warm-Up once, not as a banner too');
});

test('the result page receives the Today entry, Up next and Continue; the Assignments Center passes the question', () => {
  const result = region(app, "activeView === 'assignmentResult' && assignmentResultRoute", 'if (isStudentAssignment)', 'result view');
  assert.match(result, /const resultDashboard = studentUpNextDashboard\(\);/);
  assert.match(result, /resolveUpNext\(\{ dashboard: resultDashboard, assignmentId: assignmentResultRoute\.assignmentId \}\)/);
  assert.match(result, /todayEntry=\{resultTodayEntry\}/);
  assert.match(result, /upNext=\{resultUpNext\}/);
  assert.match(result, /onContinue=\{\(assignmentId, questionIndex\) => startAssignment\(assignmentId, questionIndex\)\}/);
  const center = region(app, '<StudentAssignmentsCenter', '/>', 'Assignments Center');
  assert.match(center, /onContinue=\{\(assignmentId, questionIndex\) => startAssignment\(assignmentId, questionIndex\)\}/);
});

test('Grades gets Start, ways to raise and What changed; Home gets the count — with imports', () => {
  assert.match(app, /import \{ buildWaysToRaise, countWaysToRaise \} from '\.\/platform\/student\/waysToRaiseModel\.js'/);
  const ways = region(app, 'function studentWaysToRaiseNow() {', '}) : [];', 'ways builder');
  assert.match(ways, /recoverySummariesByAssignment: studentRecoverySummariesByAssignment/);
  // Filtered by the Today rule (review finding C / item 3).
  assert.match(ways, /todayByAssignment: studentTodayByAssignment\(\)/);
  const grades = region(app, '<StudentGradeCenter', '/>\n', 'Grades');
  // Started from Grades, so a start that cannot happen lands on a result page whose Back says Grades (NAV-9).
  assert.match(grades, /onStart=\{\(assignmentId, questionIndex\) => startAssignment\(assignmentId, questionIndex \?\? 0, \{ origin: NAV_LEVEL\.GRADES \}\)\}/);
  assert.match(grades, /waysToRaise=\{studentWaysToRaiseNow\(\)\}/);
  assert.match(grades, /if \(way\.action === 'none'\) return undefined;/);
  assert.match(grades, /if \(way\.action === 'start'\) return startAssignment\(way\.assignmentId, way\.questionIndex \?\? 0, \{ origin: NAV_LEVEL\.GRADES \}\);/);
  assert.match(grades, /whatChangedPanel=\{renderWhatChangedPanel\(false\)\}/);
  const home = region(app, '<StudentDashboardView', 'recommended={{', 'Home render');
  assert.match(home, /waysToRaise=\{\{ count: countWaysToRaise\(studentWaysToRaiseNow\(\)\) \}\}/);
});

test('Review My Work shows only for closed, released, non-Test-Cycle work — with imports', () => {
  // Lazy, so MathLive (pulled by the solution renderers) stays out of the first load.
  // Declared in app/lazyScreens.js since the App split; App imports it from there.
  assert.match(readFileSync(new URL('../../src/app/lazyScreens.js', import.meta.url), 'utf8'), /export const ReviewMyWork = lazy\(\(\) => import\('\.\.\/components\/student\/ReviewMyWork\.jsx'\)\)/);
  assert.match(app, /\bReviewMyWork,\n[\s\S]*?\} from '\.\/app\/lazyScreens\.js';/);
  assert.match(app, /import \{ loadMyReviewWork \} from '\.\/services\/reviewMyWorkService\.js'/);
  const panel = region(app, 'const resultReviewPanel =', ': null;', 'review panel');
  assert.match(app, /reviewPanel=\{resultReviewPanel\}/);
  assert.match(panel, /resultEntry\.frozen/);
  assert.match(panel, /!resultEntry\.isTestCycle/);
  assert.match(panel, /!assignmentHasHeldTeacherFeedback\(recoveryAssignment\)/);
  // The panel is THIS assignment's review, loaded through the server callable
  // (prop order and any further props — the student's questions for their
  // teacher, D6 — are not the contract).
  const mount = region(panel, '<ReviewMyWork', '</Suspense>', 'the Review My Work mount');
  assert.match(mount, /\bassignment=\{recoveryAssignment\}/);
  assert.match(mount, /\bload=\{loadMyReviewWork\}/);
  // The student's own profile rides along for Read aloud and Translate beside
  // each worked solution (student pass 3, HELP-12)…
  assert.match(mount, /\bstudentProfile=\{user\.profile\}/);
  // …and it carries the student's own questions and their teacher's answers
  // for the same assignment, read for the signed-in student (TeacherAnswers).
  assert.match(mount, /teacherAnswers=\{<TeacherAnswers studentId=\{user\.id\} assignmentId=\{recoveryAssignment\.id\} \/>\}/);
  assert.match(app, /^import TeacherAnswers from '\.\/components\/student\/TeacherAnswers\.jsx';$/m);
});

test('"Use a Practice Pass" is offered only to a student who holds one', () => {
  const ways = region(app, 'function studentWaysToRaiseNow() {', '}) : [];', 'ways builder');
  assert.match(ways, /practicePassEligibleAssignmentIds: studentRewardWallet\?\.practicePasses\?\.count > 0 \? studentPracticePassEligibleAssignments : \[\]/);
});

test('entry shares the Today rule\'s predicates, with their imports (review findings 1, 2, 5)', () => {
  assert.match(app, /import \{ questionIsTerminal, timedSectionWorkableNow \} from '\.\/platform\/student\/studentWorkState\.js'/);
  const start = region(app, 'const startAssignment = (', 'const openStudentDashboardMode', 'startAssignment');
  const gate = region(start, 'const roleIsActionable = (role) => {', 'const actionableIndex', 'role gate');
  // A switched-off Warm-Up/DOL window is open, exactly as Home says.
  assert.match(gate, /return timedSectionWorkableNow\(getWarmupState\(/);
  assert.match(gate, /return timedSectionWorkableNow\(getDOLState\(/);
  assert.doesNotMatch(gate, /\.status === 'active'/);
  // Review My Work from the result page never bounces back to the same page.
  assert.match(executableSource(start), /if \(actionableIndex === null && options\?\.returnToResult\) \{\s*toastInfo\(/);
});

test('the Warm-Up banner never recommends excused or unopened work (review finding 6)', () => {
  // The banner's choice lives in studentActiveWarmup (pass 3: the phone's
  // status chip offers the same Warm-Up); the banner renders its answer.
  const banner = region(app, 'const studentActiveWarmup = () => {', 'const questions = getStoredAssignmentQuestions(assignment);', 'banner filter');
  assert.match(app, /const renderStudentWarmupBanner = \(\) => \{\n\s+const activeWarmup = studentActiveWarmup\(\);/);
  assert.match(banner, /if \(assignmentIsExcusedForStudent\(assignment, user\.id\)\) return null;/);
  assert.match(banner, /if \(!getAssignmentLifecycle\(assignment, now, \{ studentId: user\.id \}\)\.isOpen\) return null;/);
  assert.match(app, /import \{[^}]*\bassignmentIsExcusedForStudent\b[^}]*\} from '\.\/platform\/student\/studentGradeCenterModel\.js'/);
});

test('the cached dashboard never outlives the signed-in student (shared Chromebook)', () => {
  // The cache holds the student's lessons with their own controls; the
  // private-controls journey scans React state after sign-out for them.
  assert.match(app, /useEffect\(\(\) => \{\s*studentUpNextCacheRef\.current = \{ inputs: null, dashboard: null \};\s*\}, \[user\?\.id, user\?\.role\]\);/);
  const logout = region(app, 'const handleLogout = async () => {', 'hydratedSessionUidRef.current = null;', 'logout');
  assert.match(logout, /studentUpNextCacheRef\.current = \{ inputs: null, dashboard: null \};/);
});
