// THE WEEKLY PATH GRADE IS A REAL GRADE, AND IT NEVER LEAVES ON ITS OWN.
//
// Two rules pull in opposite directions here.
//
// The grade is real: it goes in the gradebook, a student sees it, and it is 80%
// completion and 20% quality with a floor guaranteeing that a student who did
// everything asked of them passes. That floor is the honest part of the policy
// — a weekly practice grade that can punish a student for finding the work hard
// is a grade that teaches them to avoid the work.
//
// And:
//
//   "Do not automatically publish grades to Classroom without the teacher's
//    existing publication/grade-sync rules."
//
// So the module produces a proposal and has no way to send it. Several of these
// tests exist to keep it that way.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  SYNC_STATE, weeklyPathGradebookRows, syncReadiness, prepareClassroomSync,
} from '../../src/platform/path/weeklyPathGradebook.js';
import { GRADING_POLICY } from '../../src/platform/path/weeklyPathGoal.js';

const NOW = 1_770_400_000_000;

const completion = (index) => ({
  status: 'completed',
  sessionId: `s${index}`,
  completedAt: NOW - (index * 3_600_000),
  accuracy: 0.9,
  sessionKind: 'practice',
});

const goalFor = (sessions) => ({ goalSessions: sessions, profile: null });

// --- the grade itself ----------------------------------------------------------

test('a student who completes everything passes, whatever the quality', () => {
  // The floor. A weekly practice grade that can punish a student for finding
  // the work hard teaches them to avoid the work.
  const rows = weeklyPathGradebookRows({
    students: [{ id: 's1', displayName: 'Rivera, Ana' }],
    goalsByStudentId: { s1: goalFor(4) },
    completionsByStudentId: {
      s1: [0, 1, 2, 3].map((index) => ({ ...completion(index), accuracy: 0.1 })),
    },
    now: NOW,
  });
  assert.equal(rows[0].complete, 4);
  assert.ok(rows[0].grade >= GRADING_POLICY.fullCompletionFloor, `grade was ${rows[0].grade}`);
  assert.equal(rows[0].passing, true);
});

test('a student who did nothing still gets a row rather than vanishing', () => {
  const rows = weeklyPathGradebookRows({
    students: [{ id: 's1', displayName: 'A' }],
    goalsByStudentId: { s1: goalFor(4) },
    completionsByStudentId: {},
    now: NOW,
  });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].complete, 0);
});

test('a student with no plan yet is shown as having no goal, not as failing one', () => {
  const rows = weeklyPathGradebookRows({
    students: [{ id: 's1', displayName: 'A' }],
    goalsByStudentId: {},
    completionsByStudentId: {},
    now: NOW,
  });
  assert.equal(rows[0].goal, 0);
});

// --- nothing leaves without a teacher ------------------------------------------

test('the prepared payload always requires approval', () => {
  const payload = prepareClassroomSync({
    classId: 'c-1', weekKey: '2026-08-17',
    rows: [{ studentId: 's1', goal: 4, complete: 4, grade: 92, passing: true }],
    weekComplete: true, classroomLinked: true,
  });
  assert.equal(payload.requiresApproval, true);
});

test('no branch in the module can set requiresApproval to false', () => {
  // A structural assertion rather than a behavioural one, and deliberately so:
  // the guarantee is that the code has no such path, not that the cases we
  // happened to think of return true.
  const source = readFileSync('src/platform/path/weeklyPathGradebook.js', 'utf8');
  assert.ok(!/requiresApproval:\s*false/.test(source));
  // And no way to send it. If a network or Firestore import ever appears here,
  // this file has stopped being a proposal generator.
  assert.ok(!/from '.*firebase/.test(source));
  assert.ok(!/httpsCallable|fetch\(|setDoc|updateDoc/.test(source));
});

test('a truncated read BLOCKS publication rather than merely warning', () => {
  // Publishing here would put a number in front of a parent that MathMaster
  // itself does not stand behind.
  const readiness = syncReadiness({
    rows: [{ studentId: 's1', goal: 4, complete: 4, grade: 90 }],
    weekComplete: true, classroomLinked: true, progressTruncated: true,
  });
  assert.equal(readiness.state, SYNC_STATE.BLOCKED);
  assert.match(readiness.reason, /may be lower than the real figures/);
});

test('an unfinished week is not ready, and says why in a teacher’s terms', () => {
  const readiness = syncReadiness({
    rows: [{ studentId: 's1', goal: 4, complete: 2, grade: 60 }],
    weekComplete: false, classroomLinked: true,
  });
  assert.equal(readiness.state, SYNC_STATE.NOT_READY);
  assert.match(readiness.reason, /finishes on Sunday would be graded on Wednesday/);
});

test('an unlinked class is not ready, and the reason is not phrased as an error', () => {
  const readiness = syncReadiness({ rows: [{ goal: 4 }], weekComplete: true, classroomLinked: false });
  assert.equal(readiness.state, SYNC_STATE.NOT_READY);
  assert.match(readiness.reason, /not linked to a Google Classroom course/);
});

test('a complete, linked, fully-read week is ready for REVIEW, not for sending', () => {
  const readiness = syncReadiness({
    rows: [{ studentId: 's1', goal: 4, complete: 4, grade: 95 }],
    weekComplete: true, classroomLinked: true,
  });
  assert.equal(readiness.state, SYNC_STATE.READY_FOR_REVIEW);
  assert.match(readiness.reason, /MathMaster will not send these on its own/);
});

// --- what the payload contains --------------------------------------------------

test('a student with no goal is not given an invented zero', () => {
  const payload = prepareClassroomSync({
    rows: [
      { studentId: 'has', goal: 4, complete: 4, grade: 95, passing: true },
      { studentId: 'none', goal: 0, complete: 0, grade: 0, passing: false },
    ],
    weekComplete: true, classroomLinked: true,
  });
  assert.deepEqual(payload.grades.map((entry) => entry.studentId), ['has']);
});

test('the policy travels with the grades, so a number can be defended later', () => {
  // A grade that arrives with no policy attached is a grade nobody can explain
  // at a parent conference.
  const payload = prepareClassroomSync({
    rows: [{ studentId: 's1', goal: 4, complete: 4, grade: 95, passing: true }],
    weekComplete: true, classroomLinked: true,
  });
  assert.match(payload.policy.description, /80% completion and 20% quality/);
  assert.match(payload.policy.description, /at least 80%/);
  assert.equal(payload.policy.fullCompletionFloor, GRADING_POLICY.fullCompletionFloor);
});

test('completion and performance are carried apart into the payload', () => {
  const payload = prepareClassroomSync({
    rows: [{ studentId: 's1', goal: 5, complete: 3, grade: 66, passing: false }],
    weekComplete: true, classroomLinked: true,
  });
  const grade = payload.grades[0];
  assert.equal(grade.completed, 3);
  assert.equal(grade.required, 5);
  assert.equal(grade.score, 66);
});
