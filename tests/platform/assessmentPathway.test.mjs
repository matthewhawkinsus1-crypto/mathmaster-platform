import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ASSESSMENT_STAGE,
  getAssessmentGradeSplit,
  getAssessmentPathwayState,
  getAssessmentVisibleIndices,
} from '../../src/platform/assessment/assessmentPathway.js';

const question = (id) => ({ questionId: id, type: 'multipleChoice', prompt: id, choices: ['A', 'B'], correctAnswer: 'A' });
const assignment = {
  schemaVersion: 5,
  assessmentPolicy: {
    mode: 'testCycle',
    passingScore: 70,
    review: { required: true },
    test: {},
    retest: { strategy: 'shortForm', scorePolicy: 'replaceIfHigher' },
  },
  sections: [
    { id: 'review', role: 'review', title: 'Review', questions: [question('r1'), question('r2')] },
    { id: 'test', role: 'test', title: 'Test', questions: [question('t1'), question('t2'), question('t3'), question('t4')] },
    { id: 'retest', role: 'retest', title: 'Retest', questions: [question('rt1'), question('rt2')] },
  ],
};

const correct = { status: 'correct', attemptCount: 1, totalAttempts: 1, bestCredit: 1 };
const wrong = { status: 'expired', attemptCount: 1, totalAttempts: 1, bestCredit: 0 };

test('test cycle shows only review until review is finished', () => {
  const start = getAssessmentPathwayState({ assignment, tracker: {} });
  assert.equal(start.stage, ASSESSMENT_STAGE.REVIEW);
  assert.deepEqual(getAssessmentVisibleIndices({ assignment, tracker: {} }), [0, 1]);

  const reviewed = getAssessmentPathwayState({ assignment, tracker: { 0: correct, 1: correct } });
  assert.equal(reviewed.stage, ASSESSMENT_STAGE.TEST);
  assert.deepEqual(getAssessmentVisibleIndices({ assignment, tracker: { 0: correct, 1: correct } }), [2, 3, 4, 5]);
});

test('failed test does not reveal retest until teacher releases results', () => {
  const tracker = { 0: correct, 1: correct, 2: correct, 3: wrong, 4: wrong, 5: wrong };
  const held = getAssessmentPathwayState({ assignment, tracker });
  assert.equal(held.stage, ASSESSMENT_STAGE.AWAITING_FEEDBACK);
  assert.equal(held.canEnter, false);

  const releasedAssignment = { ...assignment, feedbackReleased: true };
  const retest = getAssessmentPathwayState({ assignment: releasedAssignment, tracker });
  assert.equal(retest.stage, ASSESSMENT_STAGE.RETEST);
  assert.deepEqual(getAssessmentVisibleIndices({ assignment: releasedAssignment, tracker }), [6, 7]);
});

test('passing test completes cycle without exposing retest', () => {
  const tracker = { 0: correct, 1: correct, 2: correct, 3: correct, 4: correct, 5: wrong };
  const state = getAssessmentPathwayState({ assignment: { ...assignment, feedbackReleased: true }, tracker });
  assert.equal(state.stage, ASSESSMENT_STAGE.PASSED);
  assert.equal(state.complete, true);
  assert.equal(state.visibleRole, 'test');
});

test('retest can raise but never lower the recorded score by default', () => {
  const released = { ...assignment, feedbackReleased: true };
  const improved = {
    0: correct, 1: correct,
    2: correct, 3: wrong, 4: wrong, 5: wrong,
    6: correct, 7: correct,
  };
  const improvedGrade = getAssessmentGradeSplit({ assignment: released, tracker: improved });
  assert.equal(improvedGrade.score, 100);
  assert.equal(improvedGrade.sourceRole, 'retest');

  const notImproved = {
    0: correct, 1: correct,
    2: correct, 3: correct, 4: wrong, 5: wrong,
    6: wrong, 7: wrong,
  };
  const originalGrade = getAssessmentGradeSplit({ assignment: released, tracker: notImproved });
  assert.equal(originalGrade.score, 50);
  assert.equal(originalGrade.sourceRole, 'test');
});


test('completed retest stays submitted until retest feedback is separately released', () => {
  const tracker = {
    0: correct, 1: correct,
    2: correct, 3: wrong, 4: wrong, 5: wrong,
    6: correct, 7: correct,
  };
  const testReleased = { ...assignment, feedbackReleased: true };
  const held = getAssessmentPathwayState({ assignment: testReleased, tracker });
  assert.equal(held.stage, ASSESSMENT_STAGE.COMPLETE);
  assert.equal(held.canEnter, false);
  assert.equal(held.feedbackHeld, true);
  assert.equal(held.actionLabel, 'Submitted');

  const retestReleased = {
    ...testReleased,
    assessmentRetestFeedbackReleased: true,
  };
  const visible = getAssessmentPathwayState({ assignment: retestReleased, tracker });
  assert.equal(visible.stage, ASSESSMENT_STAGE.COMPLETE);
  assert.equal(visible.canEnter, true);
  assert.equal(visible.feedbackHeld, false);
  assert.equal(visible.score, 100);
});

test('stage visibility never exposes Review Test and Retest at the same time', () => {
  const reviewIndices = getAssessmentVisibleIndices({ assignment, tracker: {} });
  assert.deepEqual(reviewIndices, [0, 1]);

  const testTracker = { 0: correct, 1: correct };
  const testIndices = getAssessmentVisibleIndices({ assignment, tracker: testTracker });
  assert.deepEqual(testIndices, [2, 3, 4, 5]);

  const failedReleasedTracker = {
    ...testTracker,
    2: correct, 3: wrong, 4: wrong, 5: wrong,
  };
  const retestIndices = getAssessmentVisibleIndices({
    assignment: { ...assignment, feedbackReleased: true },
    tracker: failedReleasedTracker,
  });
  assert.deepEqual(retestIndices, [6, 7]);
});
