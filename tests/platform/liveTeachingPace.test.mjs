import test from 'node:test';
import assert from 'node:assert/strict';

import { startLiveTeachingSession, advanceLiveTeachingSession } from '../../src/platform/teacher/liveTeachingSession.js';
import { buildWalkthroughMonitor, WALKTHROUGH_STATUS } from '../../src/platform/teacher/walkthroughMonitor.js';

/*
 * End-to-end pace test: a Live Teaching session's classworkQuestionPosition
 * is exactly what LiveClassMonitor.jsx feeds into buildWalkthroughMonitor as
 * `teacherQuestionIndex` (see liveTeachingWiring.test.mjs for that wiring
 * assertion). This proves the two pieces agree on what "teacher is on
 * Classwork Q3" means end to end, including the case that motivated this
 * phase: the teacher's storage index and the room's Classwork index are
 * different numbering systems.
 */

// Warm-Up (1) + Classwork (8) + Practice (2), in storage order.
// Storage indices: 0=warmup, 1..8=classwork, 9..10=practice.
const assignment = {
  id: 'a1',
  schemaVersion: 5,
  sections: [
    { id: 'warmup', role: 'warmup', questions: [{ questionId: 'w1' }] },
    {
      id: 'classwork',
      role: 'classwork',
      questions: Array.from({ length: 8 }, (_, index) => ({ questionId: `c${index + 1}` })),
    },
    {
      id: 'practice',
      role: 'practice',
      questions: [{ questionId: 'p1' }, { questionId: 'p2' }],
    },
  ],
};

const student = (id, liveStatus = null) => ({ id, displayName: id, liveStatus });
const studentLive = (overrides = {}) => ({
  assignmentId: 'a1',
  activityRole: 'classwork',
  sectionQuestionIndex: 0,
  classworkQuestionStates: '........',
  updatedAt: 1_000_000,
  lastInteractionAt: 1_000_000,
  ...overrides,
});

test('teacher on Classwork Q3 (storage index 3, after the Warm-Up question) maps to a student on the same Classwork question being ON_QUESTION', () => {
  // The scenario from the spec: "Teacher exemplar: Classwork Q3 of 8" means
  // classworkQuestionPosition === 2 (0-based), the 3rd Classwork question,
  // which sits at storage index 3 (after the single Warm-Up question).
  const session = startLiveTeachingSession({
    classId: 'c1', assignmentId: 'a1', assignment, storageQuestionIndex: 3, activityRole: 'classwork',
  });
  assert.equal(session.classworkQuestionPosition, 2, 'Classwork Q3 is 0-based position 2');

  const walkthrough = buildWalkthroughMonitor({
    students: [student('S1', studentLive({ sectionQuestionIndex: 2 }))],
    assignmentId: 'a1',
    teacherQuestionIndex: session.classworkQuestionPosition,
    nowValue: 1_000_000,
  });
  assert.equal(walkthrough.all[0].status, WALKTHROUGH_STATUS.ON_QUESTION);
});

test('students before, on, and beyond the teacher\'s live Classwork Q3 classify as NEEDS_CHECK / ON_QUESTION / AHEAD', () => {
  const session = startLiveTeachingSession({
    classId: 'c1', assignmentId: 'a1', assignment, storageQuestionIndex: 3, activityRole: 'classwork',
  });

  const walkthrough = buildWalkthroughMonitor({
    students: [
      student('Behind', studentLive({ sectionQuestionIndex: 0 })),
      student('OnPace', studentLive({ sectionQuestionIndex: 2 })),
      student('Ahead', studentLive({ sectionQuestionIndex: 5 })),
    ],
    assignmentId: 'a1',
    teacherQuestionIndex: session.classworkQuestionPosition,
    nowValue: 1_000_000,
  });

  assert.equal(walkthrough.all.find((row) => row.id === 'Behind').status, WALKTHROUGH_STATUS.NEEDS_CHECK);
  assert.equal(walkthrough.all.find((row) => row.id === 'OnPace').status, WALKTHROUGH_STATUS.ON_QUESTION);
  assert.equal(walkthrough.all.find((row) => row.id === 'Ahead').status, WALKTHROUGH_STATUS.AHEAD);
});

test('the teacher briefly stepping into Warm-Up or Practice does not move the pace and does not falsely put the whole class behind', () => {
  const onClasswork = startLiveTeachingSession({
    classId: 'c1', assignmentId: 'a1', assignment, storageQuestionIndex: 3, activityRole: 'classwork',
  });
  const onStudentPace = student('OnPace', studentLive({ sectionQuestionIndex: 2 }));

  const before = buildWalkthroughMonitor({
    students: [onStudentPace],
    assignmentId: 'a1',
    teacherQuestionIndex: onClasswork.classworkQuestionPosition,
    nowValue: 1_000_000,
  });
  assert.equal(before.all[0].status, WALKTHROUGH_STATUS.ON_QUESTION);

  // Teacher checks the Warm-Up (storage index 0) to re-anchor the room.
  const onWarmup = advanceLiveTeachingSession(onClasswork, { assignment, storageQuestionIndex: 0, activityRole: 'warmup' });
  const during = buildWalkthroughMonitor({
    students: [onStudentPace],
    assignmentId: 'a1',
    teacherQuestionIndex: onWarmup.classworkQuestionPosition,
    nowValue: 1_000_000,
  });
  // Same student, same pace reference (unchanged), same classification —
  // NOT reclassified as behind because of an unrelated index system.
  assert.equal(during.all[0].status, WALKTHROUGH_STATUS.ON_QUESTION);
  assert.equal(onWarmup.classworkQuestionPosition, onClasswork.classworkQuestionPosition);
});
