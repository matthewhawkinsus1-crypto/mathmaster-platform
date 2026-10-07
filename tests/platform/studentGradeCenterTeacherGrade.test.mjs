import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  ASSIGNMENT_ZERO_REASON_LABELS,
  GRADE_STATUS,
  buildStudentGradeCenter,
  describeGradeMath,
  findGradeCenterEntry,
} from '../../src/platform/student/studentGradeCenterModel.js';
import { WAY_ACTION, WAY_KIND, buildWaysToRaise, countWaysToRaise, entryCanStillRise } from '../../src/platform/student/waysToRaiseModel.js';
import { canonicalPresentedAssignmentGrade, canonicalPresentedSectionGrade } from '../../src/platform/grading/canonicalGradeProjection.js';
import { region } from './helpers/sourceContract.mjs';
import { buildScreens, NOW as TODAY_NOW } from './fixtures/studentTodayScreens.mjs';

/*
 * The Grades tab, "How this grade is figured" and "Ways to raise" must agree
 * with the gradebook, Grade Transfer and Classroom — and must not promise
 * credit that can no longer be earned. Synthetic data only.
 */

const CLASS_ID = 'class-tg';
const STUDENT_ID = 'student-tg';
const NOW = Date.parse('2026-09-09T12:00:00.000Z');
const read = (relative) => readFileSync(new URL(relative, import.meta.url), 'utf8');

const five = () => [{ id: 'classwork', role: 'classwork', title: 'Classwork', questions: [1, 2, 3, 4, 5].map((n) => ({ id: `c${n}` })) }];
const lesson = (id, title, extra = {}) => ({
  id, title, schemaVersion: 5, assignedClassIds: [CLASS_ID],
  // Past due, late window still open: "Ways to raise" would offer it.
  dueAt: '2026-09-08T12:00:00.000Z', lateDueAt: '2026-09-12T12:00:00.000Z',
  sections: five(), ...extra,
});
const correct = { status: 'correct', attemptCount: 1, totalAttempts: 1 };
// 3 of 5 points earned, two questions unanswered.
const tracker = { 'lesson-4': { 0: correct, 1: correct, 2: correct }, other: { 0: correct, 1: correct, 2: correct, 3: correct, 4: correct } };
const integrityZero = (extra = {}) => ({
  __assignment: {
    active: true, score: 0, reasonCode: 'cellPhoneUse', reason: 'Prohibited cellphone use',
    note: 'Saw him texting during the DOL; called home', source: 'teacher-assignment-zero',
    participantRole: 'individual', actor: { uid: 't1', email: 'ms.teacher@school.test', name: 'Ms. Teacher' },
    at: '2026-09-09T10:00:00.000Z', ...extra,
  },
});
const build = (overrides = {}) => buildStudentGradeCenter({
  assignments: [lesson('lesson-4', 'Lesson 4'), lesson('other', 'Lesson 5')],
  classId: CLASS_ID, classPeriod: 'Period 1', studentId: STUDENT_ID, nowValue: NOW, tracker,
  ...overrides,
});

/* ----------------------------- 3. an assignment-level teacher grade decides */

test('an integrity zero is the row\'s grade, as the gradebook, Classroom and Grade Transfer read it', () => {
  const teacherGradeOverridesByAssignment = { 'lesson-4': integrityZero() };
  const center = build({ teacherGradeOverridesByAssignment });
  const entry = findGradeCenterEntry(center, 'lesson-4');
  const student = { gradesByAssignment: tracker, teacherGradeOverridesByAssignment };
  const assignment = entry.assignment;

  // Without the override this row is 60% (the defect).
  const plain = findGradeCenterEntry(build(), 'lesson-4');
  assert.equal(plain.displayGrade, 60, 'fixture no longer exercises the case');

  assert.equal(canonicalPresentedAssignmentGrade({ student, assignment }), 0);
  assert.equal(entry.displayGrade, 0);
  assert.equal(entry.overall.score, 0);
  assert.equal(entry.status, GRADE_STATUS.GRADED);
  assert.equal(entry.countsTowardPeriodGrade, true);
  assert.deepEqual([entry.weights.earnedWeight, entry.weights.possibleWeight], [0, 5]);
  assert.equal(entry.sectionShares, null);
  // Each real section carries the teacher's score, as Grade Transfer does.
  assert.equal(entry.sections.classwork.score, canonicalPresentedSectionGrade({ student, assignment, sectionKey: 'classwork' }));
  assert.equal(entry.sections.classwork.score, 0);
});

test('a teacher-set grade offers results only, and is never a way to raise the grade', () => {
  const center = build({ teacherGradeOverridesByAssignment: { 'lesson-4': integrityZero() } });
  const entry = findGradeCenterEntry(center, 'lesson-4');
  assert.equal(entry.actions.start, null);
  assert.equal(entry.actions.viewResults, true);
  assert.equal(entryCanStillRise(entry), false);
  const ways = buildWaysToRaise({
    gradeCenter: center, nowValue: NOW, formatDate: String,
    recoverySummariesByAssignment: { 'lesson-4': [{ section: 'dol', state: 'unlocked', endsAtMs: null }] },
    practicePassEligibleAssignmentIds: ['lesson-4'],
  });
  assert.deepEqual(ways.filter((way) => way.assignmentId === 'lesson-4'), []);
  // Without the override the same row WAS a "finish Lesson 4 for credit" way.
  const before = buildWaysToRaise({ gradeCenter: build(), nowValue: NOW, formatDate: String });
  assert.ok(before.some((way) => way.assignmentId === 'lesson-4' && way.kind === WAY_KIND.LATE_WINDOW));
});

test('reopening cannot reopen a teacher-set grade', () => {
  const center = build({
    assignments: [lesson('lesson-4', 'Lesson 4', { studentOverrides: { [STUDENT_ID]: { reopened: true } } })],
    teacherGradeOverridesByAssignment: { 'lesson-4': integrityZero() },
  });
  const entry = findGradeCenterEntry(center, 'lesson-4');
  assert.equal(entry.reopened, true, 'fixture no longer exercises the case');
  assert.notEqual(entry.status, GRADE_STATUS.REOPENED);
  assert.equal(entry.actions.start, null);
  assert.equal(entryCanStillRise(entry), false);
});

test('the period summary and the grade math reconcile with the teacher\'s grade', () => {
  const center = build({ teacherGradeOverridesByAssignment: { 'lesson-4': integrityZero() } });
  const summary = center.currentSummary;
  // Lesson 4: 0 of 5 (the override); Lesson 5: 5 of 5.
  assert.deepEqual([summary.earnedWeight, summary.possibleWeight, summary.score], [5, 10, 50]);
  assert.deepEqual(summary.inProgress, [], 'a teacher-set grade is not "counted at its current score"');
  assert.equal(describeGradeMath(summary).headline, 'You\'ve earned 5 of 10 points on counted work = 50%.');

  // A non-zero teacher grade earns that percent of the assignment's points.
  const half = build({ teacherGradeOverridesByAssignment: { 'lesson-4': integrityZero({ score: 50 }) } });
  assert.equal(findGradeCenterEntry(half, 'lesson-4').weights.earnedWeight, 2.5);
  assert.equal(half.currentSummary.score, 75);
});

test('a teacher grade counts even with no recorded work, and an inactive one changes nothing', () => {
  const none = build({
    tracker: { other: tracker.other },
    teacherGradeOverridesByAssignment: { 'lesson-4': integrityZero() },
  });
  const entry = findGradeCenterEntry(none, 'lesson-4');
  assert.equal(entry.displayGrade, 0);
  assert.equal(entry.status, GRADE_STATUS.GRADED);
  assert.equal(entry.actions.start, null);

  const inactive = build({ teacherGradeOverridesByAssignment: { 'lesson-4': integrityZero({ active: false }) } });
  const row = findGradeCenterEntry(inactive, 'lesson-4');
  assert.equal(row.displayGrade, 60);
  assert.equal(row.teacherGrade, null);
  assert.equal(row.teacherGradeText, null);
});

test('the row names only the fixed reason label — never the note or the teacher', () => {
  const entry = findGradeCenterEntry(build({ teacherGradeOverridesByAssignment: { 'lesson-4': integrityZero() } }), 'lesson-4');
  assert.deepEqual(entry.teacherGrade, { score: 0, reasonLabel: 'Prohibited cellphone use' });
  assert.equal(entry.teacherGradeText, 'Grade set by your teacher: Prohibited cellphone use. More work on this assignment won\'t change it.');
  assert.doesNotMatch(JSON.stringify({ g: entry.teacherGrade, t: entry.teacherGradeText }), /texting|Ms\. Teacher|ms\.teacher@/);

  // The label comes from the code; a free-typed `reason` is never shown.
  const odd = findGradeCenterEntry(build({
    teacherGradeOverridesByAssignment: { 'lesson-4': integrityZero({ reasonCode: 'somethingElse', reason: 'Talked to his mom' }) },
  }), 'lesson-4');
  assert.equal(odd.teacherGrade.reasonLabel, null);
  assert.equal(odd.teacherGradeText, 'Grade set by your teacher. More work on this assignment won\'t change it.');
});

test('the reason labels are exactly index.js ASSIGNMENT_ZERO_REASONS, code for code', () => {
  const block = region(read('../../functions/index.js'), 'const ASSIGNMENT_ZERO_REASONS = Object.freeze({', '});');
  const server = Object.fromEntries([...block.matchAll(/(\w+):\s*"([^"]+)"/g)].map((match) => [match[1], match[2]]));
  assert.ok(Object.keys(server).length >= 3);
  assert.deepEqual({ ...ASSIGNMENT_ZERO_REASON_LABELS }, server);
});

test('the Grades row prints the model\'s teacher-grade line', () => {
  const row = region(read('../../src/components/student/StudentGradeCenter.jsx'), 'function GradeRow(', '\nfunction PeriodGroup(', 'GradeRow');
  assert.match(row, /\{entry\.teacherGradeText && \(\s*<p data-teacher-grade[^>]*>\{entry\.teacherGradeText\}<\/p>/);
  assert.doesNotMatch(row, /\.note\b|\.actor\b/);
});

/* --------------------------- 4. "not counted" is true about Classroom, and closed reads closed */

test('the not-counted line does not claim Classroom never records a zero, and closed work reads as closed', () => {
  const center = build({
    assignments: [
      lesson('lesson-4', 'Lesson 4'),
      // Closed with nothing recorded: Practice Only.
      lesson('closed-empty', 'Lesson 1', { dueAt: '2026-09-01T12:00:00.000Z', lateDueAt: '2026-09-03T12:00:00.000Z' }),
      // Not due yet, nothing recorded.
      lesson('later', 'Lesson 9', { dueAt: '2026-09-20T12:00:00.000Z', lateDueAt: '2026-09-22T12:00:00.000Z' }),
    ],
  });
  assert.equal(findGradeCenterEntry(center, 'closed-empty').status, GRADE_STATUS.PRACTICE_ONLY);
  const summary = center.currentSummary;
  assert.equal(summary.closed, 1);
  assert.equal(summary.notCountedOther, 1);
  assert.equal(summary.graded + summary.missing + summary.pending + summary.excused + summary.closed + summary.notCountedOther, summary.total);
  const line = describeGradeMath(summary).lines.find((text) => text.startsWith('Not counted'));
  assert.equal(line, 'Not counted in this grade: 1 closed with no work recorded, 1 not started or not open yet. These aren\'t in this MathMaster average, but after the due date Google Classroom may record missing work as 0.');
  assert.doesNotMatch(line, /None of these count as a zero/);
});

/* ------------------------------ C. "Ways to raise" follows the one Today rule */

const LATER = TODAY_NOW + 3.5 * 24 * 3600e3;
const todayScreens = () => {
  // Built by the real dashboard and Grade Center models, 3.5 days on: every
  // lesson below is past due and inside its late window.
  const screens = buildScreens({ nowValue: LATER });
  const todayByAssignment = Object.fromEntries(screens.dashboard.allEntries.map((entry) => [entry.assignment.id, entry]));
  return { screens, todayByAssignment };
};
const raise = (screens, todayByAssignment) => buildWaysToRaise({
  gradeCenter: screens.gradeCenter, nowValue: LATER, formatDate: String, todayByAssignment,
});
const wayFor = (ways, id) => ways.find((way) => way.assignmentId === id && (way.kind === WAY_KIND.MISSING || way.kind === WAY_KIND.LATE_WINDOW)) || null;

test('Ways to raise: waiting work keeps its way, with no Start and the wait line', () => {
  const { screens, todayByAssignment } = todayScreens();
  // The dates alone offer Continue on both.
  const datesOnly = raise(screens, null);
  for (const id of ['locked-practice', 'waiting-dol']) {
    assert.equal(wayFor(datesOnly, id)?.action, WAY_ACTION.START, `${id}: fixture no longer exercises the case`);
    assert.equal(todayByAssignment[id].actionable, false);
  }
  const ways = raise(screens, todayByAssignment);
  for (const id of ['locked-practice', 'waiting-dol']) {
    const way = wayFor(ways, id);
    assert.ok(way, `${id} lost its way`);
    assert.equal(way.action, WAY_ACTION.NONE, `${id} still offers ${way.actionLabel}`);
    assert.equal(way.actionLabel, null);
    assert.equal(way.questionIndex, undefined);
    assert.ok(todayByAssignment[id].waitText, `${id}: dashboard entry has no wait line`);
    assert.equal(way.waitText, todayByAssignment[id].waitText);
    assert.ok(way.text.endsWith(todayByAssignment[id].waitText), way.text);
  }
  assert.match(wayFor(ways, 'waiting-dol').text, /DOL opens/);
  // Waiting is still a way: Home's count includes it.
  assert.equal(countWaysToRaise(ways), countWaysToRaise(datesOnly));
});

test('Ways to raise: Start lands on the dashboard\'s next question', () => {
  const { screens, todayByAssignment } = todayScreens();
  const ways = raise(screens, todayByAssignment);
  const actionable = wayFor(ways, 'actionable');
  assert.equal(actionable.kind, WAY_KIND.LATE_WINDOW);
  assert.equal(actionable.action, WAY_ACTION.START);
  assert.equal(actionable.actionLabel, 'Continue');
  assert.equal(actionable.questionIndex, todayByAssignment.actionable.nextQuestionIndex);
  assert.equal(actionable.questionIndex, 1);
  const missing = wayFor(ways, 'past-due');
  assert.equal(missing.kind, WAY_KIND.MISSING);
  assert.equal(missing.questionIndex, 0);
});

test('Ways to raise: finished, excused or Recovery-only work offers no missing/late way, and Home does not count it', () => {
  const { screens } = todayScreens();
  const base = raise(screens, {});
  assert.ok(wayFor(base, 'actionable'), 'fixture no longer exercises the case');
  // Late window open, Classwork+Practice done, DOL closed: the lesson is Finished.
  for (const entry of [
    { actionable: false, finished: true },
    { actionable: false, excused: true },
    { actionable: true, action: 'recovery', nextQuestionIndex: 1 },
    // A Recovery locked behind more Practice keeps the lesson unfinished; the
    // Recovery way (openResult) is its door, not "finish for credit".
    { actionable: true, action: 'recovery', recoveryLocked: true, finished: false },
  ]) {
    const ways = raise(screens, { actionable: entry });
    assert.equal(wayFor(ways, 'actionable'), null, JSON.stringify(entry));
    assert.equal(countWaysToRaise(ways), countWaysToRaise(base) - 1, JSON.stringify(entry));
  }
  // No dashboard entry for it: unchanged, and no invented landing.
  assert.equal(wayFor(base, 'actionable').questionIndex, undefined);
  assert.equal(wayFor(base, 'actionable').action, WAY_ACTION.START);
  // A Test Cycle entry is the card's business, as for the grade rows.
  assert.equal(wayFor(raise(screens, { actionable: { actionable: false, testCycle: true } }), 'actionable').action, WAY_ACTION.START);
});

test('Ways to raise draws a waiting way as text, never a button that would start the lesson', () => {
  const panel = region(read('../../src/components/student/StudentGradeCenter.jsx'), 'function WaysToRaise(', '\nfunction GradeRow(', 'WaysToRaise');
  const waiting = region(panel, "{way.action === 'none' ? (", ') : (', 'waiting branch');
  assert.match(waiting, /<div data-way-kind=\{way\.kind\} data-way-waiting/);
  assert.doesNotMatch(waiting, /onClick|onWayAction|<button/);
});
