/*
 * TESTS & EXAMS LISTS AN ASSIGNED TEST BEFORE ITS SESSION IS OPEN (PR-20).
 *
 * "My Course Tests" listed secure sessions only, so a Test Cycle the teacher
 * had assigned but not yet opened sessions for read "Nothing here yet". The
 * rows now come from src/platform/student/assignedTestCyclesModel.js, fed by a
 * read-only look at the card (getStudentTestCycle `preview`). These pin the
 * model's behaviour and the wiring that would otherwise fail only in a
 * browser: the screen renders the rows, never offers Start on them, asks the
 * server for a preview, and App hands it the student's own dates.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { componentSource, executableSource, region } from './helpers/sourceContract.mjs';
import { assignedTestCycleRow, testCycleDeliveryText, testCyclesWithoutSession } from '../../src/platform/student/assignedTestCyclesModel.js';
import { getAssignmentLifecycle } from '../../src/assignmentLifecycle.js';

const dashboard = componentSource('src/components/assessment/StudentSecureExamDashboard.jsx');
const app = componentSource('src/App.jsx');
const service = readFileSync(new URL('../../src/services/testCycleService.js', import.meta.url), 'utf8');
const functionsIndex = readFileSync(new URL('../../functions/index.js', import.meta.url), 'utf8');

const testCycle = (id, extra = {}) => ({
  id,
  title: `Unit ${id}`,
  assessmentPolicy: { mode: 'testCycle', passingScore: 70, retest: { maxRecordedGrade: 70 } },
  ...extra,
});
const lesson = { id: 'lesson', title: 'Lesson' };

// What getStudentTestCycle({ preview: true }) answers for a Test whose session
// is not open yet: the Test day is set, so the window is in words.
const previewCard = {
  success: true,
  preview: true,
  assignmentId: 'u3',
  title: 'Unit 3 Test',
  stage: 'test',
  statusLabel: 'Test not open yet',
  detail: 'Your teacher has not opened the secure Test yet.',
  canEnter: false,
  policy: { external: false },
  delivery: { timed: false, questionCount: 12 },
  schedule: {
    missedTest: false,
    test: { state: 'upcoming', enforced: true, headline: 'Opens Wed, Oct 21, 10:15 AM CDT', detail: 'Open Wed, Oct 21, 10:15 AM CDT – 11:05 AM CDT.', home: 'The Test is taken in class. You cannot start it from home.' },
    followUp: { state: 'upcoming', enforced: true, headline: 'Opens when the Test window closes', detail: 'Then open until …', home: 'You may do Corrections and the Retest from home.' },
  },
  dueAt: '2026-10-22T04:59:59.999Z',
};

test('a Test Cycle with no course-test session in the list is the one that gets a row', () => {
  const assignments = [testCycle('u3'), testCycle('u4'), testCycle('old', { archived: true }), lesson];
  const sessions = [
    { examSessionId: 's1', examType: 'courseTest', courseTest: { assignmentId: 'u4' } },
    { examSessionId: 'sat', examType: 'sat' },
  ];
  assert.deepEqual(testCyclesWithoutSession({ assignments, sessions }).map((entry) => entry.id), ['u3']);
  // Any session for it — finished, replaced — means the list already stands for it.
  assert.deepEqual(testCyclesWithoutSession({ assignments, sessions: [...sessions, { courseTest: { assignmentId: 'u3' } }] }), []);
  assert.deepEqual(testCyclesWithoutSession({ assignments: null, sessions: null }), []);
});

test('the row says when, where, how long and when it is due — in the card\'s words, from the read-only card', () => {
  const row = assignedTestCycleRow({ card: previewCard, assignment: testCycle('u3'), now: Date.parse('2026-10-16T12:00:00Z') });
  assert.equal(row.assignmentId, 'u3');
  assert.equal(row.title, 'Unit 3 Test');
  assert.equal(row.statusLabel, 'Test not open yet');
  assert.deepEqual(row.when, {
    headline: 'Opens Wed, Oct 21, 10:15 AM CDT',
    detail: 'Open Wed, Oct 21, 10:15 AM CDT – 11:05 AM CDT.',
    home: 'The Test is taken in class. You cannot start it from home.',
  });
  assert.equal(row.delivery, 'Test is not timed. 12 questions.');
  assert.equal(row.dueAt, '2026-10-22T04:59:59.999Z');
  assert.equal(row.finalLateDueAt, null);
  // No class-time window set: nothing to announce, and the card's detail is said instead.
  const unset = assignedTestCycleRow({ card: { ...previewCard, schedule: { ...previewCard.schedule, test: { ...previewCard.schedule.test, state: 'unset' } } } });
  assert.equal(unset.when, null);
  assert.equal(unset.detail, 'Your teacher has not opened the secure Test yet.');
});

test('the row uses THIS student\'s dates: an extended student is told late work is still open', () => {
  const assignment = {
    ...testCycle('u3'),
    dueAt: '2026-10-06T04:59:59.999Z',
    lateDueAt: '2026-10-09T04:59:59.999Z',
    studentOverrides: { S1: { lateDueAt: '2026-10-14T04:59:59.999Z' } },
  };
  const now = Date.parse('2026-10-10T17:00:00Z');
  const own = getAssignmentLifecycle(assignment, now, { studentId: 'S1' });
  const row = assignedTestCycleRow({ card: { ...previewCard, dueAt: assignment.dueAt }, assignment, dueAt: own.dueAt, lateDueAt: own.lateDueAt, now });
  assert.equal(row.finalLateDueAt, '2026-10-14T04:59:59.999Z');
});

test('the length is the card\'s: timed with extended time, and a Retest is not given the Test\'s count', () => {
  assert.equal(
    testCycleDeliveryText({ stage: 'test', delivery: { timed: true, timeLimitMinutes: 90, extendedTimeMultiplier: 1.5, questionCount: 10 } }),
    'Test is timed: 90 minutes once you start, including your extended time. 10 questions.',
  );
  assert.equal(testCycleDeliveryText({ stage: 'retestReady', delivery: { timed: false, questionCount: 10 } }), 'Retest is not timed.');
  assert.equal(testCycleDeliveryText({ stage: 'test' }), null);
});

test('the screen lists the rows, never offers Start on one, and says "Nothing here yet" only when there is nothing', () => {
  const load = region(dashboard, 'const load = async () => {', 'finally { setLoading(false); }', 'load');
  assert.match(load, /testCyclesWithoutSession\(\{ assignments: \(testCycles \|\| \[\]\)\.map\(\(entry\) => entry\.assignment\), sessions: listed \}\)/);
  // A read-only look, never the card's own call that can open a Retest.
  assert.match(load, /getStudentTestCycle\(\{ assignmentId: assignment\.id, preview: true \}\)/);
  assert.match(load, /setAssignedTests\(/);
  assert.match(dashboard, /rows: sessions\.filter\(isCourseTest\), assigned: assignedTests \}/);
  assert.match(dashboard, /\{!group\.rows\.length && !group\.assigned\.length && <div[^>]*>Nothing here yet\.<\/div>\}/);
  const row = region(dashboard, '{group.assigned.map((row) => (', '</article>', 'assigned row');
  assert.match(row, /onClick=\{\(\) => onOpenCourseTest\?\.\(row\.assignmentId\)\}/);
  assert.match(row, /Open in Assignments/);
  assert.doesNotMatch(executableSource(row), /setActive|'Start'|Resume|startSecureExam/, 'nothing on an assigned row enters a secure session');
  assert.match(row, /\{row\.when\.headline\}/);
  assert.match(row, /\{row\.delivery\}/);
  assert.match(dashboard, /import \{ formatDateTime \} from '\.\.\/\.\.\/assignmentLifecycle\.js';/);
});

test('the service and the server carry `preview`, and the server opens nothing for it', () => {
  assert.match(service, /call\('getStudentTestCycle', preview \? \{ assignmentId, preview: true \} : \{ assignmentId \}\)/);
  const handler = region(functionsIndex, 'exports.getStudentTestCycle = onCall(', 'function testCycleSkillList(', 'getStudentTestCycle');
  assert.match(handler, /const preview = request\.data\?\.preview === true;/);
  // The stand-in Retest for a missed Test is opened only by the card itself.
  assert.match(handler, /if \(!preview\s*&& state\.missedTest\s*&& state\.stage === shared\.stages\.TEST_CYCLE_STAGE\.RETEST_READY/);
  assert.match(handler, /const inCorrections = !preview && state\.stage === shared\.stages\.TEST_CYCLE_STAGE\.CORRECTIONS/);
});

test('App hands Tests & Exams the student\'s own Test Cycles with their own dates', () => {
  const screen = region(app, "if (studentDashboardMode === 'secureExams') {", '</>,', 'Tests & Exams screen');
  assert.match(screen, /testCycles=\{assignments\.filter\(isTestCycleAssignment\)\.map\(\(assignment\) => \{\s*const own = getAssignmentLifecycle\(assignment, Date\.now\(\), \{ studentId: user\.id \}\);\s*return \{ assignment, dueAt: own\.dueAt, lateDueAt: own\.lateDueAt \};/);
  // Both names are imported: a missing import is a ReferenceError only a browser sees.
  assert.match(app, /import \{ isTestCycleAssignment \} from '\.\/platform\/assessment\/testCycle\.js';/);
  assert.match(app, /import \{[^}]*\bgetAssignmentLifecycle,[^}]*\} from '\.\/assignmentLifecycle';/);
});
