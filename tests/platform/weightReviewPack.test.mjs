import test from 'node:test';
import assert from 'node:assert/strict';

import {
  assignmentWeightReviewFingerprint,
  buildAssignmentWeightReviewRequest,
  parseAssignmentWeightReviewPack,
  prepareAssignmentWeightReviewPack,
} from '../../src/platform/grading/weightReviewPack.js';

const assignment = {
  id: 'assignment-1',
  title: 'Functions and Domain & Range',
  courseId: 'algebra1',
};

const questions = [
  {
    questionId: 'q-long',
    type: 'functionGraph',
    activityRole: 'classwork',
    sectionId: 'classwork',
    prompt: 'Model the bathtub situation.',
    workflow: Array.from({ length: 8 }, (_, index) => ({
      id: `stage-${index + 1}`,
      kind: index === 6 ? 'domainInput' : 'shortResponse',
      prompt: `Stage ${index + 1}`,
    })),
  },
  {
    questionId: 'q-short',
    type: 'multiAnswer',
    activityRole: 'practice',
    sectionId: 'practice',
    prompt: 'Classify the relation.',
    answerFields: [{ id: 'answer', type: 'choice', label: 'Function?' }],
  },
];

const packFor = (sourceQuestions = questions) => ({
  kind: 'mathmasterWeightReviewPack',
  version: 1,
  assignmentId: assignment.id,
  assignmentFingerprint: assignmentWeightReviewFingerprint({
    assignment,
    questions: sourceQuestions,
  }),
  weights: [
    { questionId: 'q-long', weight: 4, reason: 'Eight separately graded modeling stages.' },
    { questionId: 'q-short', weight: 1, reason: 'One classification decision.' },
  ],
});

test('AI weight review request is portable and demands a complete strict JSON response', () => {
  const request = buildAssignmentWeightReviewRequest({ assignment, questions });
  assert.match(request, /ChatGPT|Claude|Gemini|another AI/i);
  assert.match(request, /mathmasterWeightReviewPack/);
  assert.match(request, /Return EVERY included question exactly once/);
  assert.match(request, /Protected fingerprint: wgt-/);
  assert.match(request, /Eight|workflowStages/);
  assert.doesNotMatch(request, /studentId|gradesByAssignment|accommodation/i);
});

test('valid AI weight pack changes only questionWeight', () => {
  const prepared = prepareAssignmentWeightReviewPack({
    pack: packFor(),
    assignment,
    questions,
  });
  assert.equal(prepared.changedCount, 1);
  assert.equal(prepared.reviewedCount, 2);
  assert.equal(prepared.questions[0].questionWeight, 4);
  assert.equal(prepared.questions[1].questionWeight, 1);

  const originalLong = structuredClone(questions[0]);
  const weightedLong = structuredClone(prepared.questions[0]);
  delete weightedLong.questionWeight;
  assert.deepEqual(weightedLong, originalLong);
});

test('AI weight pack must include every included question exactly once', () => {
  const pack = packFor();
  pack.weights.pop();
  assert.throws(
    () => prepareAssignmentWeightReviewPack({ pack, assignment, questions }),
    /omitted 1 included question/i,
  );

  const duplicate = packFor();
  duplicate.weights.push({ questionId: 'q-long', weight: 3, reason: 'duplicate' });
  assert.throws(
    () => prepareAssignmentWeightReviewPack({ pack: duplicate, assignment, questions }),
    /repeated question ID/i,
  );
});

test('AI cannot use an unknown question ID or change a different assignment', () => {
  const unknown = packFor();
  unknown.weights[0].questionId = 'not-this-assignment';
  assert.throws(
    () => prepareAssignmentWeightReviewPack({ pack: unknown, assignment, questions }),
    /unknown or excluded question ID/i,
  );

  const wrongAssignment = { ...packFor(), assignmentId: 'assignment-2' };
  assert.throws(
    () => prepareAssignmentWeightReviewPack({ pack: wrongAssignment, assignment, questions }),
    /different assignment ID/i,
  );
});

test('stale AI pack is rejected when question content changes', () => {
  const changedQuestions = structuredClone(questions);
  changedQuestions[0].workflow.push({ id: 'stage-9', kind: 'graphConstruction', prompt: 'Graph it.' });
  assert.throws(
    () => prepareAssignmentWeightReviewPack({
      pack: packFor(),
      assignment,
      questions: changedQuestions,
    }),
    /assignment changed after the AI review/i,
  );
});

test('fingerprint ignores weight-only edits but catches content edits', () => {
  const weighted = structuredClone(questions);
  weighted[0].questionWeight = 4;
  assert.equal(
    assignmentWeightReviewFingerprint({ assignment, questions }),
    assignmentWeightReviewFingerprint({ assignment, questions: weighted }),
  );

  weighted[0].prompt = 'Changed mathematical task';
  assert.notEqual(
    assignmentWeightReviewFingerprint({ assignment, questions }),
    assignmentWeightReviewFingerprint({ assignment, questions: weighted }),
  );
});

test('AI imported weights are bounded and must use quarter-point increments', () => {
  const tooHigh = packFor();
  tooHigh.weights[0].weight = 9;
  assert.throws(
    () => prepareAssignmentWeightReviewPack({ pack: tooHigh, assignment, questions }),
    /between 0\.25 and 8/i,
  );

  const badIncrement = packFor();
  badIncrement.weights[0].weight = 1.1;
  assert.throws(
    () => prepareAssignmentWeightReviewPack({ pack: badIncrement, assignment, questions }),
    /0\.25 increments/i,
  );
});

test('parser accepts a fenced JSON response but rejects arbitrary JSON', () => {
  const raw = '```json\n' + JSON.stringify(packFor()) + '\n```';
  assert.equal(parseAssignmentWeightReviewPack(raw).kind, 'mathmasterWeightReviewPack');
  assert.throws(
    () => parseAssignmentWeightReviewPack('{"hello":"world"}'),
    /not a MathMaster Weight Review Pack/i,
  );
});
