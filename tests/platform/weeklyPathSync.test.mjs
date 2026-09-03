import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

import { gradeWeeklyGoal } from '../../functions/shared/weeklyPathGrade.mjs';

const require = createRequire(import.meta.url);
const { syncWeeklyPathClassWeek } = require('../../functions/lib/weeklyPathSync.js');

const WEEK = '2026-08-31';
const DUE = Date.parse('2026-09-04T23:59:00Z');
const AFTER = DUE + 36 * 60 * 60 * 1000;

const goalFor = (sessions = 2) => ({
  weekKey: WEEK,
  goalSessions: sessions,
  dueAt: DUE,
  assignmentState: 'assigned',
  sessions: Array.from({ length: sessions }, (_, index) => ({
    slot: index + 1,
    skillId: `s${index + 1}`,
    teksCode: `A.${index + 1}A`,
    purpose: 'current_learning',
    weeklySlotKey: `${index + 1}|s${index + 1}|A.${index + 1}A|current_learning|course|2|3`,
  })),
});

const completion = (goal, slotIndex, accuracy = 1) => ({
  status: 'completed',
  weekKey: goal.weekKey,
  weeklySlotKey: goal.sessions[slotIndex].weeklySlotKey,
  teksCode: goal.sessions[slotIndex].teksCode,
  completedAt: DUE - 1000,
  accuracy,
});

// A recording harness. Every Classroom call this module can make is captured so
// a test asserts on what would actually reach a live course.
const harness = (overrides = {}) => {
  const calls = { created: [], patched: [], returned: [] };
  const deps = {
    findCourseWork: async () => overrides.existingCourseWork ?? null,
    createCourseWork: async (courseId, work) => {
      calls.created.push({ courseId, work });
      return { id: 'cw-1' };
    },
    findSubmission: async ({ googleUserId }) => (
      overrides.submissions === undefined
        ? { id: `sub-${googleUserId}`, assignedGrade: null, draftGrade: null }
        : overrides.submissions[googleUserId] ?? null
    ),
    patchGrade: async (args) => { calls.patched.push(args); return {}; },
    returnSubmission: async (args) => { calls.returned.push(args); return {}; },
    gradeWeeklyGoal,
    ...overrides.deps,
  };
  return { calls, deps };
};

const baseArgs = (overrides = {}) => {
  const goal = overrides.goal || goalFor();
  return {
    classId: 'c1',
    weekKey: WEEK,
    courseId: 'course-1',
    enabled: true,
    maxPoints: 100,
    now: AFTER,
    students: [{ studentId: 'S1', googleUserId: 'g1' }],
    goalsByStudentId: { S1: goal },
    completionsByStudentId: { S1: [completion(goal, 0), completion(goal, 1)] },
    publishedByStudentId: {},
    ...overrides,
    goal: undefined,
  };
};

test('a finished week creates one post and returns one grade per student', async () => {
  const { calls, deps } = harness();
  const report = await syncWeeklyPathClassWeek({ ...baseArgs(), ...deps });

  assert.equal(report.ok, true);
  assert.equal(report.createdCourseWork, true);
  assert.equal(calls.created.length, 1);
  assert.equal(report.published, 1);

  const [patch] = calls.patched;
  assert.equal(patch.courseWorkId, 'cw-1');
  assert.equal(patch.grade, 100);
  // The grade is only visible to the student once the submission is returned.
  assert.equal(calls.returned.length, 1);
});

test('running the job twice does not create a second post or rewrite a grade', async () => {
  // Scheduled jobs are retried, overlap themselves, and get re-run by hand. A
  // second run must be a no-op, not a second post and a second notification.
  const { calls, deps } = harness({ existingCourseWork: { id: 'cw-1' } });
  const args = { ...baseArgs(), publishedByStudentId: { S1: { points: 100 } } };
  const report = await syncWeeklyPathClassWeek({ ...args, ...deps });

  assert.equal(report.createdCourseWork, false);
  assert.equal(calls.created.length, 0);
  assert.equal(calls.patched.length, 0);
  assert.equal(report.results[0].reason, 'this_score_is_already_published');
});

test('a teacher grade change in Classroom is never overwritten', async () => {
  const { calls, deps } = harness({
    existingCourseWork: { id: 'cw-1' },
    submissions: { g1: { id: 'sub-g1', assignedGrade: 95, draftGrade: 95 } },
  });
  // We last published 100; Classroom now says 95, so a human changed it.
  const args = { ...baseArgs(), publishedByStudentId: { S1: { points: 100 } } };
  const report = await syncWeeklyPathClassWeek({ ...args, ...deps });

  assert.equal(calls.patched.length, 0);
  assert.equal(report.results[0].reason, 'a_teacher_already_changed_this_grade_in_classroom');
});

test('nothing publishes until the class is switched on', async () => {
  const { calls, deps } = harness();
  const report = await syncWeeklyPathClassWeek({ ...baseArgs({ enabled: false }), ...deps });

  assert.equal(calls.patched.length, 0);
  assert.equal(report.results[0].reason, 'automatic_publishing_not_enabled_for_this_class');
});

test('a week still in progress publishes nothing', async () => {
  // Publishing mid-week would tell a parent a student is failing a week they
  // still have days left to finish.
  const { calls, deps } = harness();
  const report = await syncWeeklyPathClassWeek({ ...baseArgs({ now: DUE - 1000 }), ...deps });

  assert.equal(calls.patched.length, 0);
  assert.equal(report.results[0].reason, 'the_week_is_not_over_yet');
});

test('truncated weekly data refuses the whole run rather than publishing low grades', async () => {
  // A partial read produces grades that are quietly too low, which is exactly
  // the kind of wrong number nobody reports as a bug.
  const { calls, deps } = harness();
  const report = await syncWeeklyPathClassWeek({ ...baseArgs({ truncated: true }), ...deps });

  assert.equal(report.ok, false);
  assert.equal(report.reason, 'weekly_completion_data_was_truncated');
  assert.equal(calls.created.length, 0);
  assert.equal(calls.patched.length, 0);
});

test('a student with no goal or no Classroom link is skipped with a reason', async () => {
  const { calls, deps } = harness({ submissions: { g1: { id: 'sub-g1' } } });
  const goal = goalFor();
  const report = await syncWeeklyPathClassWeek({
    ...baseArgs({ goal }),
    students: [
      { studentId: 'S1', googleUserId: 'g1' },
      { studentId: 'S2', googleUserId: 'g2' },
      { studentId: 'S3' },
    ],
    goalsByStudentId: { S1: goal, S3: goal },
    completionsByStudentId: { S1: [completion(goal, 0), completion(goal, 1)] },
    ...deps,
  });

  const byId = Object.fromEntries(report.results.map((entry) => [entry.studentId, entry]));
  assert.equal(byId.S1.published, true);
  assert.equal(byId.S2.reason, 'no_weekly_goal_for_this_student');
  assert.equal(byId.S3.reason, 'student_is_not_linked_to_a_classroom_account');
  assert.equal(calls.patched.length, 1);
});

test('one student whose write fails does not cost the rest of the class their grade', async () => {
  const failing = harness();
  failing.deps.patchGrade = async (args) => {
    if (args.submissionId === 'sub-g1') throw new Error('Classroom said no');
    failing.calls.patched.push(args);
    return {};
  };
  const goal = goalFor();
  const report = await syncWeeklyPathClassWeek({
    ...baseArgs({ goal }),
    students: [{ studentId: 'S1', googleUserId: 'g1' }, { studentId: 'S2', googleUserId: 'g2' }],
    goalsByStudentId: { S1: goal, S2: goal },
    completionsByStudentId: {
      S1: [completion(goal, 0), completion(goal, 1)],
      S2: [completion(goal, 0), completion(goal, 1)],
    },
    ...failing.deps,
  });

  const byId = Object.fromEntries(report.results.map((entry) => [entry.studentId, entry]));
  assert.equal(byId.S1.reason, 'classroom_rejected_the_grade_write');
  assert.equal(byId.S2.published, true);
  assert.equal(report.published, 1);
});

test('a dry run reports what it would do and writes nothing', async () => {
  const { calls, deps } = harness({ existingCourseWork: { id: 'cw-1' } });
  const report = await syncWeeklyPathClassWeek({ ...baseArgs({ dryRun: true }), ...deps });

  assert.equal(calls.patched.length, 0);
  assert.equal(calls.returned.length, 0);
  assert.equal(report.results[0].reason, 'dry_run');
  assert.equal(report.results[0].points, 100);
});

test('an unlinked class or malformed identity refuses before touching Classroom', async () => {
  const { calls, deps } = harness();
  const unlinked = await syncWeeklyPathClassWeek({ ...baseArgs({ courseId: '' }), ...deps });
  assert.equal(unlinked.ok, false);
  assert.match(unlinked.reason, /not_linked_to_a_google_classroom_course/);

  const anonymous = await syncWeeklyPathClassWeek({ ...baseArgs({ classId: '' }), ...deps });
  assert.equal(anonymous.ok, false);
  assert.equal(anonymous.reason, 'incomplete_class_week_identity');
  assert.equal(calls.created.length, 0);
});

test('a partly finished week publishes the real partial grade, not a zero', async () => {
  const { calls, deps } = harness();
  const goal = goalFor(2);
  const report = await syncWeeklyPathClassWeek({
    ...baseArgs({ goal }),
    completionsByStudentId: { S1: [completion(goal, 0)] },
    ...deps,
  });

  const [patch] = calls.patched;
  assert.ok(patch.grade > 0 && patch.grade < 100, `expected a real partial grade, got ${patch.grade}`);
  assert.equal(report.published, 1);
});
