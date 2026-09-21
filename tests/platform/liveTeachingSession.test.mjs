import test from 'node:test';
import assert from 'node:assert/strict';

import {
  advanceLiveTeachingSession,
  endLiveTeachingSession,
  startLiveTeachingSession,
} from '../../src/platform/teacher/liveTeachingSession.js';

// Warm-Up (1) + Classwork (3) + Practice (2), in storage order.
// Storage indices: 0=warmup, 1..3=classwork, 4..5=practice.
const assignment = {
  id: 'a1',
  schemaVersion: 5,
  sections: [
    { id: 'warmup', role: 'warmup', questions: [{ questionId: 'w1' }] },
    {
      id: 'classwork',
      role: 'classwork',
      questions: [{ questionId: 'c1' }, { questionId: 'c2' }, { questionId: 'c3' }],
    },
    {
      id: 'practice',
      role: 'practice',
      questions: [{ questionId: 'p1' }, { questionId: 'p2' }],
    },
  ],
};

test('starting a session records only where the teacher is, nothing about students', () => {
  const session = startLiveTeachingSession({
    classId: 'class-1',
    assignmentId: 'a1',
    assignment,
    storageQuestionIndex: 1,
    activityRole: 'classwork',
    nowValue: 5000,
  });
  // Session identity/timer/projector fields are the synchronization contract;
  // they remain teacher-only and contain no student work.
  assert.deepEqual(session, {
    sessionId: 'missing__class-1__a1',
    ownerUid: null,
    teacherEmail: null,
    active: true,
    classId: 'class-1',
    assignmentId: 'a1',
    storageQuestionIndex: 1,
    activityRole: 'classwork',
    classworkQuestionPosition: 0,
    startedAt: 5000,
    instructionalPhase: null,
    timer: { durationSeconds: 0, remainingSeconds: 0, status: 'idle', startedAt: null },
    projectorState: { showInstructionalPhase: true, showTimer: true, showReview: false },
    updatedAt: 5000,
  });
});

test('starting in Warm-Up has no Classwork pace until the teacher actually enters Classwork', () => {
  const session = startLiveTeachingSession({
    classId: 'c1',
    assignmentId: 'a1',
    assignment,
    storageQuestionIndex: 0,
    activityRole: 'warmup',
  });
  assert.equal(session.classworkQuestionPosition, null);
  assert.equal(session.activityRole, 'warmup');

  const firstClasswork = advanceLiveTeachingSession(session, {
    assignment,
    storageQuestionIndex: 1,
    activityRole: 'classwork',
  });
  assert.equal(firstClasswork.classworkQuestionPosition, 0);
});

test('a fresh start does not inherit a prior position — Restart Fresh really starts over', () => {
  // A teacher who was on Classwork Q3 restarts the same lesson; the fresh
  // session must begin at whatever storage index Restart Fresh opens on,
  // not carry over the old classworkQuestionPosition.
  const stale = startLiveTeachingSession({ classId: 'c1', assignmentId: 'a1', assignment, storageQuestionIndex: 3, activityRole: 'classwork' });
  assert.equal(stale.classworkQuestionPosition, 2);

  const fresh = startLiveTeachingSession({ classId: 'c1', assignmentId: 'a1', assignment, storageQuestionIndex: 1, activityRole: 'classwork' });
  assert.equal(fresh.classworkQuestionPosition, 0);
});

test('navigating the exemplar updates the session position', () => {
  const session = startLiveTeachingSession({ classId: 'c1', assignmentId: 'a1', assignment, storageQuestionIndex: 1, activityRole: 'classwork' });
  const next = advanceLiveTeachingSession(session, { assignment, storageQuestionIndex: 2, activityRole: 'classwork' });
  assert.equal(next.storageQuestionIndex, 2);
  assert.equal(next.classworkQuestionPosition, 1);
  assert.equal(next.activityRole, 'classwork');
});

test('storage-index differences (an excluded question shifting later indices) do not corrupt the Classwork pace', () => {
  const shifted = {
    id: 'a1',
    schemaVersion: 5,
    sections: [
      { id: 'warmup', role: 'warmup', questions: [{ questionId: 'w1' }] },
      {
        id: 'classwork',
        role: 'classwork',
        questions: [
          { questionId: 'c1', teacherExcluded: true },
          { questionId: 'c2' },
          { questionId: 'c3' },
        ],
      },
    ],
  };
  const session = startLiveTeachingSession({ classId: 'c1', assignmentId: 'a1', assignment: shifted, storageQuestionIndex: 2, activityRole: 'classwork' });
  // c2 is storage index 2, but it is the FIRST live Classwork question now
  // that c1 is excluded — its Classwork position is 0, not 1.
  assert.equal(session.classworkQuestionPosition, 0);
});

test('visiting Warm-Up, Practice, or DOL keeps the most recent valid Classwork position instead of moving the pace marker', () => {
  const onClasswork = startLiveTeachingSession({ classId: 'c1', assignmentId: 'a1', assignment, storageQuestionIndex: 3, activityRole: 'classwork' });
  assert.equal(onClasswork.classworkQuestionPosition, 2);

  // Teacher steps back to Warm-Up (storage index 0) to re-anchor the room,
  // then to Practice (storage index 4). Neither has a Classwork position.
  const onWarmup = advanceLiveTeachingSession(onClasswork, { assignment, storageQuestionIndex: 0, activityRole: 'warmup' });
  assert.equal(onWarmup.storageQuestionIndex, 0);
  assert.equal(onWarmup.activityRole, 'warmup');
  assert.equal(onWarmup.classworkQuestionPosition, 2, 'Classwork pace must not move because the teacher is elsewhere');

  const onPractice = advanceLiveTeachingSession(onWarmup, { assignment, storageQuestionIndex: 4, activityRole: 'practice' });
  assert.equal(onPractice.classworkQuestionPosition, 2, 'still the last valid Classwork position');

  // Returning to Classwork Q1 (storage index 1) updates the pace again.
  const backToClasswork = advanceLiveTeachingSession(onPractice, { assignment, storageQuestionIndex: 1, activityRole: 'classwork' });
  assert.equal(backToClasswork.classworkQuestionPosition, 0);
});

test('advancing an inactive or absent session is a no-op', () => {
  assert.equal(advanceLiveTeachingSession(null, { assignment, storageQuestionIndex: 1 }), null);
  const ended = { active: false, classworkQuestionPosition: 2 };
  assert.equal(advanceLiveTeachingSession(ended, { assignment, storageQuestionIndex: 1 }), ended);
});

test('re-projecting the same exemplar position is referentially stable and does not request another write', () => {
  const session = startLiveTeachingSession({
    classId: 'c1',
    assignmentId: 'a1',
    assignment,
    storageQuestionIndex: 1,
    activityRole: 'classwork',
    nowValue: 5000,
  });
  const same = advanceLiveTeachingSession(session, {
    assignment,
    storageQuestionIndex: 1,
    activityRole: 'classwork',
  });
  assert.equal(same, session);
  assert.equal(same.updatedAt, 5000);
});

test('ending a session clears it entirely', () => {
  assert.equal(endLiveTeachingSession(), null);
});
