/*
 * Student pass 3, the open and result paths:
 *
 *   NAV-4   a paused or archived lesson opens nowhere; every path lands on its
 *           result page with "Your teacher paused this — your work is saved."
 *   NAV-8   the result page's two practice buttons
 *   NAV-9   Back names where it goes: the result page from Home, the Test
 *           Cycle card from wherever it was opened; browser Back restores the test
 *   NAV-10  blocked starts land on the result page; toasts pause while read
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createToastTimer } from '../../src/ui/toastTimer.js';
import {
  OPEN_NOTICE,
  TEACHER_CLOSED,
  describeOpenNotice,
  teacherClosedNotice,
  teacherClosedState,
} from '../../src/platform/student/studentOpenGate.js';
import { LEVEL, normalizeOrigin, resolveBack } from '../../src/platform/student/navigationModel.js';
import { normalizeStudentRoute, studentRouteKey } from '../../src/platform/student/browserHistory.js';
import {
  PRACTICE_SKILL_LABEL,
  RESULT_TRY_AGAIN_LABEL,
  resultTryAgainLabel,
} from '../../src/platform/student/studentResultNextStep.js';
import { buildStudentGradeCenter, findGradeCenterEntry } from '../../src/platform/student/studentGradeCenterModel.js';
import { buildWaysToRaise, entryCanStillRise } from '../../src/platform/student/waysToRaiseModel.js';
import { executableSource, region } from './helpers/sourceContract.mjs';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

// ------------------------------------------------------------ NAV-10: the toast clock
const fakeClock = () => {
  let time = 0;
  let nextHandle = 0;
  const pending = new Map();
  return {
    now: () => time,
    setTimer: (fn, delay) => { nextHandle += 1; pending.set(nextHandle, { fn, at: time + delay }); return nextHandle; },
    clearTimer: (handle) => pending.delete(handle),
    advance(ms) {
      time += ms;
      for (const [handle, entry] of [...pending]) {
        if (entry.at <= time) { pending.delete(handle); entry.fn(); }
      }
    },
  };
};

test('NAV-10: a toast closes on time when nobody is reading it', () => {
  const clock = fakeClock();
  let expired = 0;
  createToastTimer({ ms: 10000, onExpire: () => { expired += 1; }, ...clock });
  clock.advance(9999);
  assert.equal(expired, 0);
  clock.advance(1);
  assert.equal(expired, 1);
});

test('NAV-10: hover or focus stops the clock; it resumes with the time that was left', () => {
  const clock = fakeClock();
  let expired = 0;
  const timer = createToastTimer({ ms: 10000, onExpire: () => { expired += 1; }, ...clock });
  clock.advance(4000);
  timer.pause('hover');
  clock.advance(60000); // a slow reader
  assert.equal(expired, 0);
  assert.equal(timer.remaining, 6000);
  timer.pause('focus');
  timer.resume('hover'); // focus still holds it
  clock.advance(60000);
  assert.equal(expired, 0);
  timer.resume('focus');
  clock.advance(5999);
  assert.equal(expired, 0);
  clock.advance(1);
  assert.equal(expired, 1);
});

test('NAV-10: a dismissed toast never fires; the provider uses the pausable clock and longer info toasts', () => {
  const clock = fakeClock();
  let expired = 0;
  const timer = createToastTimer({ ms: 5000, onExpire: () => { expired += 1; }, ...clock });
  timer.cancel();
  clock.advance(10000);
  timer.resume('hover');
  clock.advance(10000);
  assert.equal(expired, 0);

  const toast = executableSource(read('src/ui/Toast.jsx'));
  assert.match(toast, /^import \{ createToastTimer \} from '\.\/toastTimer\.js';$/m);
  assert.match(region(toast, 'const showToast = useCallback(', '}, []);'), /const timer = createToastTimer\(\{/);
  const row = region(toast, 'function ToastRow(', '\n}\n');
  assert.match(row, /onPointerEnter=\{\(event\) => \{ if \(event\.pointerType === 'mouse'\) onPause\?\.\(toast\.id, 'hover'\); \}\}/);
  assert.match(row, /onPointerLeave=\{\(event\) => \{ if \(event\.pointerType === 'mouse'\) onResume\?\.\(toast\.id, 'hover'\); \}\}/);
  assert.match(row, /onFocus=\{\(\) => onPause\?\.\(toast\.id, 'focus'\)\}/);
  assert.match(row, /onBlur=\{[\s\S]*?onResume\?\.\(toast\.id, 'focus'\)/);
  assert.equal((toast.match(/<ToastRow [^>]*onPause=\{pauseToast\} onResume=\{resumeToast\}/g) || []).length, 2, 'both live regions');
  const durations = toast.match(/const DEFAULT_DURATIONS = \{([^}]*)\}/)[1];
  assert.match(durations, /info: 10000/);
});

// ------------------------------------------------------------ NAV-4 / NAV-10: the notices
test('NAV-4: paused and archived are the teacher closing the lesson; the notice says the work is saved', () => {
  assert.equal(teacherClosedState({ unpublished: true }), TEACHER_CLOSED.PAUSED);
  assert.equal(teacherClosedState({ archived: true, unpublished: true }), TEACHER_CLOSED.ARCHIVED);
  assert.equal(teacherClosedState({}), null);
  assert.equal(teacherClosedState(null), null);
  assert.equal(teacherClosedNotice({}), null);
  const paused = teacherClosedNotice({ unpublished: true });
  assert.equal(paused.kind, OPEN_NOTICE.PAUSED);
  assert.match(paused.text, /^Your teacher paused this — your work is saved\./);
  assert.match(teacherClosedNotice({ archived: true }).text, /your work and your grade are saved/);
});

test('NAV-10: each blocked start has a notice in student words, with the time when one is known', () => {
  const prerequisite = describeOpenNotice({ kind: OPEN_NOTICE.PREREQUISITE, prerequisiteTitle: 'Lesson 4 Notes', opensAtText: 'Oct 21, 2026, 2:15 PM' });
  assert.equal(prerequisite.text, 'Finish Lesson 4 Notes first, and then this opens. It also opens by itself on Oct 21, 2026, 2:15 PM.');
  // No teacher words when the earlier lesson has no title on file.
  assert.doesNotMatch(describeOpenNotice({ kind: OPEN_NOTICE.PREREQUISITE }).text, /prerequisite|notes\/classwork/i);
  assert.equal(describeOpenNotice({ kind: OPEN_NOTICE.NOT_OPEN_YET, opensAtText: 'Oct 21, 2026, 2:15 PM' }).text, 'This opens on Oct 21, 2026, 2:15 PM.');
  assert.match(describeOpenNotice({ kind: OPEN_NOTICE.EXCUSED }).text, /nothing to turn in/);
  assert.equal(describeOpenNotice({ kind: 'unknown' }), null);
});

// ------------------------------------------------------------ NAV-4: Grades and Ways to raise
const NOW = Date.parse('2026-10-14T15:00:00Z');
const pausedLesson = {
  id: 'paused-1', title: 'Lesson 4.3', schemaVersion: 5, unpublished: true, assignedClassIds: ['class-a'],
  dueAt: '2026-10-10T22:00:00Z', lateDueAt: '2026-10-20T22:00:00Z',
  sections: [{ id: 'c', role: 'classwork', title: 'Classwork', questions: [{ questionId: 'q0', type: 'literal', prompt: 'x', acceptedAnswers: ['1'] }] }],
};

test('NAV-4: a paused lesson keeps its grade row, offers no Start, says why, and is no way to raise a grade', () => {
  const center = buildStudentGradeCenter({
    assignments: [pausedLesson, { ...pausedLesson, id: 'open-1', title: 'Lesson 4.4', unpublished: false }],
    tracker: {}, classId: 'class-a', classPeriod: '3', studentId: 's1', nowValue: NOW,
  });
  const paused = findGradeCenterEntry(center, 'paused-1');
  const open = findGradeCenterEntry(center, 'open-1');
  assert.ok(paused, 'the row stays on Grades');
  assert.equal(paused.closedByTeacher, 'paused');
  assert.equal(paused.actions.start, null);
  assert.match(paused.actions.waitText, /^Your teacher paused this — your work is saved/);
  assert.ok(open.actions.start, 'the open lesson beside it still offers Start');
  assert.equal(open.closedByTeacher, null);
  assert.equal(entryCanStillRise(paused), false);
  const ways = buildWaysToRaise({ gradeCenter: center, nowValue: NOW });
  assert.ok(!ways.some((way) => way.assignmentId === 'paused-1'), JSON.stringify(ways));
  assert.ok(ways.some((way) => way.assignmentId === 'open-1'), 'the open missing lesson is still a way');
});

// ------------------------------------------------------------ NAV-9: Back and history
test('NAV-9: a result opened from Home goes back to Home; a test card goes back where it was opened', () => {
  assert.equal(resolveBack(LEVEL.ASSIGNMENT_RESULT, { origin: LEVEL.HOME }).navLabel, 'Home');
  assert.equal(resolveBack(LEVEL.ASSIGNMENT_RESULT, { origin: LEVEL.GRADES }).navLabel, 'Grades');
  assert.equal(resolveBack(LEVEL.ASSIGNMENT_RESULT, {}).navLabel, 'Assignments');
  for (const [origin, label] of [[LEVEL.HOME, 'Home'], [LEVEL.GRADES, 'Grades'], [LEVEL.SECURE_EXAMS, 'Tests & Exams'], [LEVEL.ASSIGNMENTS, 'Assignments']]) {
    assert.equal(resolveBack(LEVEL.TEST_CYCLE, { origin }).navLabel, label, origin);
  }
  // An origin a level does not accept is its default parent, never invented.
  assert.equal(normalizeOrigin(LEVEL.ASSIGNMENT_RESULT, 'teacher'), LEVEL.ASSIGNMENTS);
  assert.equal(normalizeOrigin(LEVEL.ASSIGNMENT_RESULT, undefined), LEVEL.ASSIGNMENTS);
  assert.equal(normalizeOrigin(LEVEL.ASSIGNMENT_RESULT, 'home'), LEVEL.HOME);
  assert.equal(normalizeOrigin(LEVEL.TEST_CYCLE, LEVEL.SECURE_EXAMS), LEVEL.SECURE_EXAMS);
});

test('NAV-9: a Test Cycle history entry names its test, so Back restores that test and not another', () => {
  const a = normalizeStudentRoute({ surface: 'dashboard', dashboardMode: 'testCycle', testCycleAssignmentId: 'test-a', origin: 'home' });
  assert.deepEqual(a, { surface: 'dashboard', dashboardMode: 'testCycle', testCycleAssignmentId: 'test-a', origin: 'home' });
  const b = { ...a, testCycleAssignmentId: 'test-b' };
  assert.notEqual(studentRouteKey(a), studentRouteKey(b));
  // Other dashboard entries keep their shape.
  assert.deepEqual(normalizeStudentRoute({ surface: 'dashboard', dashboardMode: 'grades', testCycleAssignmentId: 'x' }), { surface: 'dashboard', dashboardMode: 'grades' });
});

// ------------------------------------------------------------ NAV-8: the two buttons
test('NAV-8: the result page names its two practices apart', () => {
  assert.equal(RESULT_TRY_AGAIN_LABEL, 'Try these questions again — no credit');
  assert.equal(resultTryAgainLabel('Practice'), 'Try these Practice questions again — no credit');
  assert.equal(PRACTICE_SKILL_LABEL, 'Practice this skill');
  const page = executableSource(read('src/components/student/StudentAssignmentResult.jsx'));
  assert.match(page, /data-result-try-again[^>]*onClick=\{\(\) => onPractice\?\.\(entry\.assignmentId\)\}>\s*\{resultTryAgainLabel\(sectionLabel\)\}/);
  assert.match(page, /onPracticeSkill && \(\s*<button[^>]*data-result-practice-skill[^>]*onClick=\{\(\) => onPracticeSkill\(\)\}>\s*\{PRACTICE_SKILL_LABEL\}/);
  // A paused lesson offers nothing that would bounce straight back.
  assert.match(page, /entry\.practiceAvailable && step\.kind !== RESULT_STEP\.EXCUSED && !closedByTeacher && \(/);
  // Back names and opens the same place.
  const back = region(page, 'const back = resolveBack(LEVEL.ASSIGNMENT_RESULT, { origin });', 'const closedByTeacher');
  assert.match(back, /back\?\.level === LEVEL\.GRADES\s*\?\s*onViewAllGrades\s*:\s*back\?\.level === LEVEL\.HOME\s*\?\s*onBackToHome\s*:\s*onViewAllAssignments/);
  assert.match(page, /\{shownNotice && \(\s*<div data-result-notice=\{shownNotice\.kind\}/);
});

// ------------------------------------------------------------ App wiring
const app = executableSource(read('src/App.jsx'));

test('NAV-4 / NAV-10: every blocked start in startAssignment lands on the result page with its notice', () => {
  assert.match(app, /^import \{ OPEN_NOTICE, describeOpenNotice, teacherClosedState \} from '\.\/platform\/student\/studentOpenGate\.js';$/m);
  assert.match(app, /^import \{ LEVEL as NAV_LEVEL, normalizeOrigin, resolveBack \} from '\.\/platform\/student\/navigationModel\.js';$/m);
  const start = region(app, 'const startAssignment = (assignmentId, requestedQuestionIndex = 0, options = {}) => {', "setActiveView('assignment');\n  };");
  const gate = region(start, 'const resultOrigin = ', 'const currentContent = ');
  assert.match(gate, /const landOnResult = \(notice\) => openStudentAssignmentResult\(assignmentId, \{ origin: resultOrigin, notice \}\);/);
  // Computed for a student (review fix 2: 'teacher' here left the suite green).
  assert.match(gate, /const closedByTeacher = user\?\.role === 'student' \? teacherClosedState\(assignmentData\) : null;/);
  assert.match(gate, /if \(closedByTeacher\) \{\s*landOnResult\(describeOpenNotice\(\{ kind: closedByTeacher \}\)\);\s*return;/);
  assert.match(gate, /if \(user\?\.role === 'student' && !access\.open\) \{\s*landOnResult\(describeOpenNotice\(\{\s*kind: OPEN_NOTICE\.PREREQUISITE/);
  assert.match(gate, /landOnResult\(describeOpenNotice\(\{ kind: OPEN_NOTICE\.NOT_OPEN_YET/);
  assert.match(gate, /landOnResult\(describeOpenNotice\(\{ kind: OPEN_NOTICE\.EXCUSED \}\)\);/);
  // No student toast is left on these paths.
  assert.doesNotMatch(gate, /toastInfo\('Finish the prerequisite first'|toastInfo\('You are excused/);
  // The gate runs before anything opens the workspace.
  assert.ok(start.indexOf('if (closedByTeacher)') > 0 && start.indexOf('if (closedByTeacher)') < start.indexOf('setActiveAssignmentId(assignmentId);'));
  // The result route carries the notice to the page.
  assert.match(region(app, 'const openStudentAssignmentResult = ', '\n  };'), /notice: options\.notice \|\| null,/);
  assert.match(app, /notice=\{assignmentResultRoute\.notice \|\| null\}/);
});

test('NAV-9: Home opens results and starts with origin Home; the Test Cycle card is told its Back; popstate restores the test', () => {
  assert.match(app, /onOpenResult=\{\(assignmentId\) => openStudentAssignmentResult\(assignmentId, \{ origin: NAV_LEVEL\.HOME \}\)\}/);
  assert.match(app, /onStartAssignment=\{\(assignmentId, questionIndex\) => startAssignment\(assignmentId, questionIndex \?\? 0, \{ origin: NAV_LEVEL\.HOME \}\)\}/);
  assert.match(app, /exitLabel=\{`← \$\{resolveBack\(NAV_LEVEL\.TEST_CYCLE, \{ origin: activeTestCycleOrigin \}\)\?\.navLabel/);
  assert.match(app, /onExit=\{\(\) => openStudentOriginLevel\(activeTestCycleOrigin\)\}/);
  const popstate = region(app, 'const restoreFromBrowserHistory = (event) => {', "window.addEventListener('popstate', restoreFromBrowserHistory);");
  assert.match(popstate, /if \(route\.dashboardMode === 'testCycle'\) \{[\s\S]*?setActiveTestCycleAssignmentId\(testCycleId\);/);
  assert.match(app, /^import \{ parseAppPath \} from '\.\/app\/routes\/appUrl\.js';$/m);
  const card = executableSource(read('src/components/student/TestCycleCard.jsx'));
  assert.match(card, /<button type="button" data-test-cycle-exit onClick=\{onExit\} style=\{quietButtonStyle\}>\s*\{exitLabel\}/);
});

// ------------------------------------------------------------ P3: the Live Challenge lobby
test('P3: the Live Challenge lobby invite shows on Assignments, Grades, Rewards, My Math Path and a result — never in a test', () => {
  const invite = region(app, 'const renderStudentLiveChallengeInvite = () => {', '\n  };\n');
  assert.match(invite, /if \(user\?\.role !== 'student' \|\| secureExamActive\) return null;/);
  assert.match(invite, /\['invited', 'joined', 'running'\]\.includes\(liveChallengeInvite\.status\)/);
  // Through openStudentDashboardMode, which also leaves the result page (activeView
  // 'dashboard') and clears a pending Path launch — the bare mode setter did neither (review fix 1).
  assert.match(invite, /onClick=\{\(\) => openStudentDashboardMode\('liveChallenge'\)\}/);
  assert.doesNotMatch(invite, /setStudentDashboardMode\(/);
  const open = region(app, 'const openStudentDashboardMode = (mode) => {', '\n  };');
  assert.match(open, /setActiveView\('dashboard'\);/);
  assert.match(open, /setAssignmentResultRoute\(null\);/);
  assert.match(open, /if \(mode !== 'mathPath'\) setPathLaunchTeks\(null\);/);
  for (const [mode, screen] of [['assignmentsCenter', '<StudentAssignmentsCenter'], ['rewards', '<StudentRewardsCenter'], ['grades', '<StudentGradeCenter'], ['mathPath', '<MyMathPathApp']]) {
    const branch = region(app, `if (studentDashboardMode === '${mode}') {`, screen);
    assert.match(branch, /\{renderStudentLiveChallengeInvite\(\)\}/, mode);
  }
  assert.match(region(app, "if (user.role === 'student' && activeView === 'assignmentResult' && assignmentResultRoute) {", '<StudentAssignmentResult\n'), /\{renderStudentLiveChallengeInvite\(\)\}/);
  for (const mode of ['testCycle', 'secureExams', 'liveChallenge']) {
    const branch = region(app, `if (studentDashboardMode === '${mode}'`, '\n    }\n');
    assert.doesNotMatch(branch, /renderStudentLiveChallengeInvite/, mode);
  }
});

// ------------------------------------------------------------ review fixes 3 and 4, and notes
test('review fix 3: a paused lesson\'s result page says so from the entry, offers nothing that bounces; Grades offers no retry', () => {
  const page = executableSource(read('src/components/student/StudentAssignmentResult.jsx'));
  assert.match(page, /\|\| Boolean\(entry\?\.closedByTeacher\);/);
  assert.match(page, /const shownNotice = notice \|\| \(entry\?\.closedByTeacher \? describeOpenNotice\(\{ kind: entry\.closedByTeacher \}\) : null\);/);
  assert.match(page, /\{shownNotice && \(\s*<div data-result-notice=\{shownNotice\.kind\}/);
  assert.match(page, /\{entry\.reviewAvailable && !reviewPanel && !closedByTeacher && \(/);
  // A bounce focuses the notice, so the press is never silent.
  assert.match(page, /useEffect\(\(\) => \{\s*if \(notice\) noticeHeadingRef\.current\?\.focus\(/);
  const center = buildStudentGradeCenter({
    assignments: [{ ...pausedLesson, dueAt: '2026-09-01T22:00:00Z', lateDueAt: '2026-09-05T22:00:00Z' }],
    tracker: {}, classId: 'class-a', classPeriod: '3', studentId: 's1', nowValue: NOW,
  });
  const closed = findGradeCenterEntry(center, 'paused-1');
  assert.equal(closed.frozen, true);
  assert.equal(closed.actions.practiceNoCredit, false, 'no "Try it again" on a paused closed lesson');
});

test('review fix 4: toasts never sit over the action bar; on a phone they sit at the top; only a mouse holds one', () => {
  const css = read('src/ui/uiKit.css');
  const viewport = css.slice(css.indexOf('.mm-toast-viewport {'), css.indexOf('}', css.indexOf('.mm-toast-viewport {')));
  assert.match(viewport, /bottom: calc\(max\(18px, env\(safe-area-inset-bottom\)\) \+ var\(--mm-action-bar-height, 0px\)\);/);
  assert.match(css, /@media \(max-width: 640px\) \{\s*\.mm-toast-viewport \{\s*top: calc\(var\(--mm-student-identity-stack-offset, 0px\) \+ 8px\);\s*bottom: auto;/);
  const row = region(executableSource(read('src/ui/Toast.jsx')), 'function ToastRow(', '\n}\n');
  assert.match(row, /onPointerEnter=\{\(event\) => \{ if \(event\.pointerType === 'mouse'\) onPause\?\.\(toast\.id, 'hover'\); \}\}/);
  assert.doesNotMatch(row, /onMouseEnter/);
});

test('review notes: Back onto a paused lesson lands on its result page; the Classroom launch waits while its assignment is present', () => {
  const popstate = region(app, 'const restoreFromBrowserHistory = (event) => {', "window.addEventListener('popstate', restoreFromBrowserHistory);");
  const branch = region(popstate, "if (route.surface === 'assignment') {", "setActiveView('assignment');");
  assert.match(branch, /const closedNow = teacherClosedState\(assignmentsRef\.current\.find\(\(item\) => item\.id === route\.assignmentId\)\);/);
  assert.match(branch, /if \(closedNow\) \{[\s\S]*?notice: describeOpenNotice\(\{ kind: closedNow \}\),[\s\S]*?setActiveView\('assignmentResult'\);\s*return;/);
  const effect = region(app, '    if (classroomLaunchInvalid) {', '}, [user?.role, pendingClassroomLaunch, classroomLaunchInvalid, assignments, studentAssignmentControls]);');
  assert.match(effect, /if \(assignments\.some\(\(assignment\) => assignment\.id === pendingClassroomLaunch\.assignmentId\)\) return;\s*const settled/);
});
