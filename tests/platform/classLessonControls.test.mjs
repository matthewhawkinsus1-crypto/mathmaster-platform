import test from 'node:test';
import assert from 'node:assert/strict';

import { localDateKey } from '../../src/assignmentLifecycle.js';
import { buildDolClose, buildDolDateMove } from '../../src/platform/assessment/assessmentRecovery.js';
import { describeClassLesson, LESSON_GROUP, nextClassDateKey, projectClassLessons } from '../../src/platform/teacher/classLessonControls.js';
import { classGradeProgress, classLiveProgress, PROGRESS_STATE } from '../../src/platform/teacher/assignmentProgress.js';

/*
 * "Current instruction should dominate the default interface; historical
 * information must remain accessible." These tests pin the behaviour Home, the
 * class page and the Assignment Hub now share.
 */

const schedule = {
  version: 2,
  periods: {},
  daySchedules: {
    A: { periods: { 'Period 1': { enabled: true, start: '08:00', end: '09:30' } } },
    B: { periods: {} },
  },
  weeklyDayTypes: { 1: 'A', 2: 'B', 3: 'A', 4: 'B', 5: null },
  dayTypeOverrides: {},
  modifiedSchedules: {},
};
const at = (hour, minute) => new Date(2026, 7, 31, hour, minute, 0); // Monday, an A day
const TODAY = localDateKey(at(8, 0));
const classContext = { classId: 'class-a', classPeriod: 'Period 1' };

const lesson = ({ id, dolDate, warmupDate = null, dueAt = '2026-09-04T23:59', lateDueAt = '2026-09-06T23:59', classIds = ['class-a'], extra = {} }) => ({
  id,
  title: `Lesson ${id}`,
  schemaVersion: 5,
  assignedClassIds: classIds,
  dueAt,
  lateDueAt,
  sections: [
    ...(warmupDate ? [{ id: 'wu', role: 'warmup', questions: [{ questionId: `${id}-w`, activityRole: 'warmup', prompt: 'Warm up', type: 'freeResponse', expected: '1' }] }] : []),
    { id: 'cw', role: 'classwork', questions: [{ questionId: `${id}-c`, activityRole: 'classwork', prompt: 'Work', type: 'freeResponse', expected: '2' }] },
    { id: 'dol', role: 'dol', questions: [{ questionId: `${id}-d`, activityRole: 'dol', prompt: 'Exit', type: 'freeResponse', expected: '3' }] },
  ],
  dol: { enabled: true, minutesBeforeEnd: 10, closeMinutesBeforeEnd: 5, instructionDate: dolDate },
  ...(warmupDate ? { warmup: { enabled: true, instructionDate: warmupDate } } : {}),
  ...extra,
});

const today = lesson({ id: 'today', dolDate: TODAY });
const stillOpen = lesson({ id: 'open', dolDate: '2026-08-26' });
const finished = lesson({ id: 'done', dolDate: '2026-08-19', dueAt: '2026-08-21T23:59', lateDueAt: '2026-08-24T23:59' });
const otherClass = lesson({ id: 'other', dolDate: TODAY, classIds: ['class-b'] });

test('today first, still-open and earlier lessons folded — and "DOL today" counts only today', () => {
  const projected = projectClassLessons({ assignments: [finished, stillOpen, today, otherClass], classContext, schedule, nowValue: at(9, 0) });
  assert.deepEqual(projected.today.map((entry) => entry.assignment.id), ['today']);
  assert.deepEqual(projected.open.map((entry) => entry.assignment.id), ['open']);
  assert.deepEqual(projected.earlier.map((entry) => entry.assignment.id), ['done']);
  // Production showed "DOL today: 9" for a class with no DOL today.
  assert.equal(projected.counts.dolsToday, 1);
});

test('stale reused DOLs and Warm-Ups stay reachable with an "Open today" control', () => {
  const reused = lesson({ id: 'reused', dolDate: '2026-08-24', warmupDate: '2026-08-24' });
  const described = describeClassLesson({ assignment: reused, classContext, schedule, nowValue: at(8, 5) });
  const dol = described.rows.find((row) => row.kind === 'dol');
  const warmup = described.rows.find((row) => row.kind === 'warmup');
  assert.equal(dol.status, 'notToday');
  assert.match(dol.headline, /^Was scheduled for /);
  assert.ok(dol.actions.some((action) => action.id === 'open' && action.label === 'Open today'));
  assert.equal(warmup.status, 'notToday');
  assert.ok(warmup.actions.some((action) => action.id === 'reopen' && action.label === 'Open today'));
});

test('a waiting DOL says when it opens automatically and offers open / not today / +1 attempt, but never close', () => {
  const dol = describeClassLesson({ assignment: today, classContext, schedule, nowValue: at(9, 0) }).rows.find((row) => row.kind === 'dol');
  assert.equal(dol.status, 'waiting');
  assert.match(dol.headline, /^Opens automatically at /);
  assert.match(dol.schedule, /today \(10 min, ending 5 min before the bell\)/);
  assert.deepEqual(dol.actions.map((action) => action.id), ['open', 'move', 'grant']);
});

test('an open DOL offers Close now and +5 min, with a live countdown', () => {
  const dol = describeClassLesson({ assignment: today, classContext, schedule, nowValue: at(9, 16) }).rows.find((row) => row.kind === 'dol');
  assert.equal(dol.status, 'active');
  assert.ok(dol.countdownEndsAt instanceof Date);
  assert.deepEqual(dol.actions.map((action) => action.id), ['close', 'extend', 'grant']);
  // No date change once the DOL has opened today: that could strand today's work.
  assert.ok(!dol.actions.some((action) => action.id === 'move' || action.id === 'restore'));
});

test('a teacher-closed DOL reads as closed by the teacher and reopens (never silently restarts)', () => {
  const closed = { ...today, dol: buildDolClose({ assignment: today, classId: 'class-a', dateKey: TODAY, now: at(9, 17).getTime() }).dol };
  const dol = describeClassLesson({ assignment: closed, classContext, schedule, nowValue: at(9, 18) }).rows.find((row) => row.kind === 'dol');
  assert.match(dol.headline, /^Closed by teacher at /);
  assert.ok(dol.overrides.includes('Closed early by teacher'));
  assert.deepEqual(dol.actions.map((action) => action.label), ['Reopen DOL', '+1 attempt']);
});

test('a moved DOL shows the teacher override and the original day, and offers the way back', () => {
  const moved = { ...today, dol: buildDolDateMove({ assignment: today, classId: 'class-a', classPeriod: 'Period 1', toDateKey: '2026-09-02', todayKey: TODAY, now: at(8, 30).getTime() }).dol };
  const described = describeClassLesson({ assignment: moved, classContext, schedule, nowValue: at(8, 31) });
  const dol = described.rows.find((row) => row.kind === 'dol');
  assert.equal(dol.override, true);
  assert.match(dol.overrides[0], /^Moved by teacher — originally /);
  assert.ok(dol.actions.some((action) => action.id === 'restore'));
  assert.equal(described.group, LESSON_GROUP.OPEN, 'no longer today\'s lesson');
});

test('Classwork that starts locked says it is waiting for the teacher', () => {
  const locked = lesson({ id: 'locked', dolDate: TODAY, extra: { sectionAccess: { classwork: { defaultState: 'closed' } } } });
  const classwork = describeClassLesson({ assignment: locked, classContext, schedule, nowValue: at(8, 10) }).rows.find((row) => row.kind === 'classwork');
  assert.equal(classwork.status, 'closed');
  assert.equal(classwork.headline, 'Starts locked · waiting for you');
  assert.deepEqual(classwork.actions.map((action) => action.label), ['Open Classwork']);
});

test('the next class day follows the A/B schedule', () => {
  assert.equal(nextClassDateKey({ schedule, classPeriod: 'Period 1', fromValue: at(9, 0) }), '2026-09-02');
});

const gradedAssignment = {
  id: 'a1',
  schemaVersion: 5,
  sections: [{ id: 'cw', role: 'classwork', questions: [
    { questionId: 'q1', activityRole: 'classwork' }, { questionId: 'q2', activityRole: 'classwork' },
  ] }],
};
const graded = (id, tracker) => ({ id, displayName: `Student ${id}`, classId: 'class-a', gradesByAssignment: tracker ? { a1: tracker } : {} });

test('grade progress uses the canonical grade and never reports a class of zeros without grade records', () => {
  const roster = [
    graded('none', null),
    graded('half', { 0: { status: 'correct', totalAttempts: 1 } }),
    graded('done', { 0: { status: 'correct', totalAttempts: 1 }, 1: { status: 'correct', totalAttempts: 1 } }),
    graded('low', { 0: { status: 'expired', partialCredit: 0, totalAttempts: 3 }, 1: { status: 'correct', totalAttempts: 1 } }),
  ];
  assert.equal(classGradeProgress({ assignment: gradedAssignment, roster, hasGradeRecords: false }), null);
  const progress = classGradeProgress({ assignment: gradedAssignment, roster, hasGradeRecords: true });
  assert.deepEqual(progress.notStarted.map((row) => row.id), ['none']);
  assert.deepEqual(progress.inProgress.map((row) => row.id), ['half']);
  assert.deepEqual(progress.complete.map((row) => row.id).sort(), ['done', 'low']);
  // "half" answered one question correctly: unfinished, not struggling.
  assert.deepEqual(progress.belowThreshold.map((row) => row.id).sort(), ['low']);
  assert.equal(progress.average, 75, 'average over finished work only: (100 + 50) / 2');
  assert.equal(progress.rows.find((row) => row.id === 'done').state, PROGRESS_STATE.COMPLETE);
  assert.equal(progress.rows.find((row) => row.id === 'done').score, 100);
});

test('live progress separates working here, stuck, on other work, and not signed in', () => {
  const now = Date.parse('2026-08-31T14:00:00Z');
  const presence = {
    here: { assignmentId: 'a1', updatedAt: now - 5_000, lastInteractionAt: now - 5_000, questionIndex: 1, activityRole: 'classwork', pageVisible: true },
    stuck: { assignmentId: 'a1', updatedAt: now - 5_000, lastInteractionAt: now - 5_000, questionIndex: 0, currentAttempts: 3, activityRole: 'classwork', pageVisible: true },
    other: { assignmentId: 'b2', updatedAt: now - 5_000, lastInteractionAt: now - 5_000, pageVisible: true },
    gone: { assignmentId: 'a1', updatedAt: now - 10 * 60_000, lastInteractionAt: now - 10 * 60_000 },
  };
  const roster = ['here', 'stuck', 'other', 'gone', 'never'].map((id) => ({ id, displayName: id, classId: 'class-a' }));
  const live = classLiveProgress({ assignment: { id: 'a1' }, roster, presenceById: presence, nowValue: now });
  assert.deepEqual(live.workingHere.map((row) => row.id).sort(), ['here', 'stuck']);
  assert.deepEqual(live.stuck.map((row) => row.id), ['stuck']);
  assert.deepEqual(live.elsewhere.map((row) => row.id), ['other']);
  assert.deepEqual(live.notConnected.map((row) => row.id).sort(), ['gone', 'never']);
});
