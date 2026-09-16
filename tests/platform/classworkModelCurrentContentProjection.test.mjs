import test from 'node:test';
import assert from 'node:assert/strict';

import {
  classworkModel,
  classworkPositionForStorageIndex,
  describeClassworkPace,
} from '../../src/platform/teacher/classworkModel.js';
import { buildWalkthroughMonitor, WALKTHROUGH_STATUS } from '../../src/platform/teacher/walkthroughMonitor.js';

/*
 * classworkModel must agree with the student runtime and student presence on
 * what "Classwork Q1" IS, not merely on how many Classwork questions exist.
 * Both of those read from projectCurrentAssignmentContent (see App.jsx's
 * navigationSections/visibleQuestionEntries and getCurrentContentQuestionIndices,
 * which IS projectCurrentAssignmentContent(assignment).entries.map(e => e.storageIndex)).
 * classworkModel has to be built on the exact same projection, not on raw
 * physical storage order, or a replacement question can be reported at a
 * different Classwork position than the one the student's own presence
 * document and progress strip use.
 *
 * Fixture, in PHYSICAL storage order:
 *   0: w1            (Warm-Up)
 *   1: c1  EXCLUDED   (Classwork — historical Q1)
 *   2: c2             (Classwork — historical/current Q2)
 *   3: new-c1         (Classwork — valid replacement for c1, appended AFTER c2)
 *
 * The student runtime logically displays: w1, [new-c1 in c1's old slot], c2.
 * So the projected Classwork order is [new-c1, c2] — replacement first.
 */
const assignmentWithReplacedClasswork = () => ({
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
      ],
    },
    {
      id: 'classwork-fix',
      role: 'classwork',
      questions: [{ questionId: 'new-c1', supersedesQuestionId: 'c1' }],
    },
  ],
});

test('1. classworkModel returns the PROJECTED logical order, not physical storage order', () => {
  const model = classworkModel(assignmentWithReplacedClasswork());
  assert.deepEqual(model.questions.map((entry) => entry.question.questionId), ['new-c1', 'c2']);
});

test('2. the replacement for Q1 is Classwork position 0', () => {
  const model = classworkModel(assignmentWithReplacedClasswork());
  assert.equal(model.questions[0].question.questionId, 'new-c1');
  assert.equal(model.questions[0].questionIndex, 3, 'the replacement is physically at storage index 3');
});

test('3. Q2 remains Classwork position 1', () => {
  const model = classworkModel(assignmentWithReplacedClasswork());
  assert.equal(model.questions[1].question.questionId, 'c2');
  assert.equal(model.questions[1].questionIndex, 2);
});

test('4. when the teacher exemplar is physically on the replacement (storage index 3), classworkPositionForStorageIndex resolves to position 0', () => {
  const assignment = assignmentWithReplacedClasswork();
  assert.equal(classworkPositionForStorageIndex(assignment, 3), 0);
  // And the historically excluded original (storage index 1) has no position
  // of its own — the runtime never renders it, so it must never resolve.
  assert.equal(classworkPositionForStorageIndex(assignment, 1), null);
  // Q2's own physical position still resolves correctly, unaffected by the
  // replacement being appended after it in storage.
  assert.equal(classworkPositionForStorageIndex(assignment, 2), 1);
});

test('5. a student whose live presence reports sectionQuestionIndex 0 on the replacement question is classified ON_QUESTION against a teacher on Classwork position 0, not NEEDS_CHECK', () => {
  const assignment = assignmentWithReplacedClasswork();
  const teacherClassworkPosition = classworkPositionForStorageIndex(assignment, 3);
  assert.equal(teacherClassworkPosition, 0);

  const walkthrough = buildWalkthroughMonitor({
    students: [{
      id: 'S1',
      liveStatus: {
        assignmentId: 'a1',
        activityRole: 'classwork',
        sectionQuestionIndex: 0,
        classworkQuestionStates: '..',
        updatedAt: 1_000_000,
        lastInteractionAt: 1_000_000,
      },
    }],
    assignmentId: 'a1',
    teacherQuestionIndex: teacherClassworkPosition,
    nowValue: 1_000_000,
  });
  assert.equal(walkthrough.all[0].status, WALKTHROUGH_STATUS.ON_QUESTION);
  assert.notEqual(walkthrough.all[0].status, WALKTHROUGH_STATUS.NEEDS_CHECK);
});

test('6a. normal (no exclusions/replacements) Classwork ordering is unaffected', () => {
  const assignment = {
    id: 'a2', schemaVersion: 5,
    sections: [
      { id: 'warmup', role: 'warmup', questions: [{ questionId: 'w1' }] },
      { id: 'classwork', role: 'classwork', questions: [{ questionId: 'c1' }, { questionId: 'c2' }, { questionId: 'c3' }] },
      { id: 'practice', role: 'practice', questions: [{ questionId: 'p1' }] },
    ],
  };
  const model = classworkModel(assignment);
  assert.deepEqual(model.questions.map((entry) => entry.question.questionId), ['c1', 'c2', 'c3']);
  assert.equal(classworkPositionForStorageIndex(assignment, 2), 1);
});

test('6b. an excluded Classwork question with NO replacement is simply dropped, as before', () => {
  const assignment = {
    id: 'a3', schemaVersion: 5,
    sections: [{
      id: 'classwork', role: 'classwork',
      questions: [{ questionId: 'c1', teacherExcluded: true }, { questionId: 'c2' }, { questionId: 'c3' }],
    }],
  };
  const model = classworkModel(assignment);
  assert.deepEqual(model.questions.map((entry) => entry.question.questionId), ['c2', 'c3']);
  assert.equal(classworkPositionForStorageIndex(assignment, 0), null);
  assert.equal(classworkPositionForStorageIndex(assignment, 1), 0);
});

test('6c. Warm-Up, Practice, and DOL storage indices still resolve to no Classwork position', () => {
  const assignment = {
    id: 'a4', schemaVersion: 5,
    sections: [
      { id: 'warmup', role: 'warmup', questions: [{ questionId: 'w1' }] },
      { id: 'classwork', role: 'classwork', questions: [{ questionId: 'c1' }] },
      { id: 'practice', role: 'practice', questions: [{ questionId: 'p1' }] },
      { id: 'dol', role: 'dol', questions: [{ questionId: 'd1' }] },
    ],
  };
  assert.equal(classworkPositionForStorageIndex(assignment, 0), null); // warmup
  assert.equal(classworkPositionForStorageIndex(assignment, 2), null); // practice
  assert.equal(classworkPositionForStorageIndex(assignment, 3), null); // dol
  assert.equal(classworkPositionForStorageIndex(assignment, 1), 0); // classwork
});

test('7. progress-state extraction (progressPositions) still maps to the correct Classwork questions after projection', () => {
  // progressPositions must equal each Classwork entry's index within the
  // FULL projected entries array — the same array getCurrentContentQuestionIndices
  // returns and that the live-presence questionStates string is indexed by.
  // Projected order here is: [w1(0), new-c1(1), c2(2)] — array positions,
  // not storage indices.
  const model = classworkModel(assignmentWithReplacedClasswork());
  assert.deepEqual(model.progressPositions, [1, 2]);

  // Simulate encodeQuestionStates-style per-included-question state string:
  // position 0 = w1, position 1 = new-c1 (correct, 'c'), position 2 = c2 (untouched, '.').
  const questionStates = '.c.'.split('');
  const classworkQuestionStates = model.progressPositions.map((position) => questionStates[position]).join('');
  assert.equal(classworkQuestionStates, 'c.', 'new-c1 (Classwork Q1) reads as correct; c2 (Classwork Q2) reads as untouched');
});

test('describeClassworkPace reports the projected count and position for the replaced-question fixture', () => {
  const assignment = assignmentWithReplacedClasswork();
  assert.equal(describeClassworkPace({ assignment, classworkQuestionPosition: 0 }), 'Classwork Q1 of 2');
  assert.equal(describeClassworkPace({ assignment, classworkQuestionPosition: 1 }), 'Classwork Q2 of 2');
});
