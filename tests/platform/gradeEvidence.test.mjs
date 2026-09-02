// "DO NOT CONVERT UNANSWERED WORK INTO ACADEMIC FAILURE."
//
// A gradebook score of 40% is one of two completely different situations:
// answered ten and got four right, or answered four and got all four right.
// The grade is identical. What the teacher should do about it is not remotely
// the same, and a column of percentages cannot tell them apart.
//
// These tests pin the two figures that explain a grade without changing it, and
// the third that says whether two students' scores can be compared at all.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  GRADE_SHAPE, COMPARABILITY,
  splitGrade, explainGrade, rigorComparability, describeDeliveredRigor,
} from '../../src/platform/teacher/gradeEvidence.js';

const assignment = (count = 10) => ({
  id: 'asn-1',
  schemaVersion: 5,
  assignment: { title: 'Evidence fixture', courseId: 'algebra1' },
  sections: [{
    id: 'practice',
    role: 'practice',
    questions: Array.from({ length: count }, (unused, index) => ({ id: `q${index}`, type: 'algebra' })),
  }],
  variantPolicy: { mode: 'shared', sectionModes: { practice: 'shared' } },
});

const tracker = (statuses) => Object.fromEntries(statuses.map((status, index) => [
  index,
  status === null ? { status: 'unattempted' } : { status, attemptCount: status === 'correct' ? 1 : 2 },
]));

// --- the two situations one number cannot tell apart ---------------------------

test('two identical grades are told apart by what is underneath them', () => {
  const answeredTenGotFour = splitGrade({
    assignment: assignment(10),
    tracker: tracker(['correct', 'correct', 'correct', 'correct', 'expired', 'expired', 'expired', 'expired', 'expired', 'expired']),
  });
  const answeredFourGotFour = splitGrade({
    assignment: assignment(10),
    tracker: tracker(['correct', 'correct', 'correct', 'correct', null, null, null, null, null, null]),
  });

  assert.equal(answeredTenGotFour.score, answeredFourGotFour.score, 'the grade really is the same');

  assert.equal(answeredTenGotFour.attempted, 10);
  assert.equal(answeredTenGotFour.creditOnAttempted, 40);
  assert.equal(answeredTenGotFour.shape, GRADE_SHAPE.COMPLETE);

  assert.equal(answeredFourGotFour.attempted, 4);
  assert.equal(answeredFourGotFour.creditOnAttempted, 100);
  assert.equal(answeredFourGotFour.unanswered, 6);
  assert.equal(answeredFourGotFour.shape, GRADE_SHAPE.INCOMPLETE);
});

test('the grade itself is never softened', () => {
  // Quietly excusing missing work would be its own kind of dishonesty, and it
  // would put a number in the gradebook that does not match the report card.
  const split = splitGrade({
    assignment: assignment(10),
    tracker: tracker(['correct', 'correct', null, null, null, null, null, null, null, null]),
  });
  assert.equal(split.score, 20, 'two of ten is still twenty percent');
  assert.equal(split.creditOnAttempted, 100, 'and they got everything they tried');
});

test('accuracy on nothing is null, not zero', () => {
  // 0% correct on no questions is not a fact about the student; it is the
  // absence of one, and rendering it as 0% is the exact confusion this file
  // exists to prevent.
  const split = splitGrade({ assignment: assignment(6), tracker: tracker([null, null, null, null, null, null]) });
  assert.equal(split.creditOnAttempted, null);
  assert.equal(split.shape, GRADE_SHAPE.NOT_STARTED);
});

test('an expired or wrong answer is engagement, not absence', () => {
  // The distinction is "did they meet the question", not "did they get it
  // right". A filter that treated wrong answers as missing would flatter
  // everybody.
  const split = splitGrade({ assignment: assignment(4), tracker: tracker(['expired', 'attempted', 'correct', null]) });
  assert.equal(split.attempted, 3);
  assert.equal(split.unanswered, 1);
});

// --- restraint in the explanation ----------------------------------------------

test('a completed assignment gets no explanatory line', () => {
  // The grade already means what it appears to mean. A line on every row is how
  // a teacher learns to skip the column.
  const split = splitGrade({ assignment: assignment(3), tracker: tracker(['correct', 'expired', 'correct']) });
  assert.equal(explainGrade(split), null);
});

test('an incomplete assignment says plainly that the gap is missing evidence', () => {
  const split = splitGrade({ assignment: assignment(5), tracker: tracker(['correct', 'correct', null, null, null]) });
  const line = explainGrade(split);
  assert.match(line, /2 of 5 answered/);
  assert.match(line, /missing evidence, not wrong evidence/);
});

test('an untouched assignment is named a completion gap in those words', () => {
  const split = splitGrade({ assignment: assignment(5), tracker: tracker([null, null, null, null, null]) });
  assert.match(explainGrade(split), /completion gap, not a performance one/);
});

// --- "was the rigor the same?" -------------------------------------------------

const eventFor = (assignmentId, { band, dok, adapted = false, reason = null }) => ({
  source: { assignmentId },
  questionSnapshot: { difficultyBand: band, dok, adapted },
  adaptation: adapted ? { reason } : null,
});

test('identical delivery is stated as directly comparable', () => {
  const state = rigorComparability({
    assignmentId: 'asn-1',
    evidenceByStudentId: {
      a: [eventFor('asn-1', { band: 3, dok: 2 }), eventFor('asn-1', { band: 3, dok: 2 })],
      b: [eventFor('asn-1', { band: 3, dok: 2 })],
    },
  });
  assert.equal(state.state, COMPARABILITY.IDENTICAL);
  assert.match(state.note, /directly comparable/);
});

test('varied delivery says the scores are NOT directly comparable', () => {
  // The whole point of the phase. Two students can both score 80% having
  // answered genuinely different questions, and nothing on the screen used to
  // admit it.
  const state = rigorComparability({
    assignmentId: 'asn-1',
    evidenceByStudentId: {
      a: [eventFor('asn-1', { band: 2, dok: 1, adapted: true, reason: 'lowered' })],
      b: [eventFor('asn-1', { band: 4, dok: 3, adapted: true, reason: 'raised' })],
    },
  });
  assert.equal(state.state, COMPARABILITY.VARIED);
  assert.match(state.note, /not directly comparable/);
});

test('comparability is read from delivery, not from the assignment setting', () => {
  // An assignment set to adaptive can still hand everyone the authored
  // question. Only the evidence knows which happened.
  const state = rigorComparability({
    assignmentId: 'asn-1',
    evidenceByStudentId: {
      a: [eventFor('asn-1', { band: 3, dok: 2, adapted: false })],
      b: [eventFor('asn-1', { band: 3, dok: 2, adapted: false })],
    },
  });
  assert.equal(state.state, COMPARABILITY.IDENTICAL);
});

test('one student adapting makes the whole set incomparable, even at the same band', () => {
  // Same band reached by different routes is still a different question.
  const state = rigorComparability({
    assignmentId: 'asn-1',
    evidenceByStudentId: {
      a: [eventFor('asn-1', { band: 3, dok: 2, adapted: true, reason: 'moved' })],
      b: [eventFor('asn-1', { band: 3, dok: 2, adapted: false })],
    },
  });
  assert.equal(state.state, COMPARABILITY.VARIED);
});

test('no delivery history returns UNKNOWN rather than a confident wrong answer', () => {
  const state = rigorComparability({ assignmentId: 'asn-1', evidenceByStudentId: {} });
  assert.equal(state.state, COMPARABILITY.UNKNOWN);
  assert.match(state.note, /Not enough delivery history/);
});

test('evidence from a different assignment is not counted', () => {
  const state = rigorComparability({
    assignmentId: 'asn-1',
    evidenceByStudentId: {
      a: [eventFor('asn-2', { band: 1, dok: 1 }), eventFor('asn-1', { band: 3, dok: 2 })],
      b: [eventFor('asn-1', { band: 3, dok: 2 })],
    },
  });
  assert.equal(state.state, COMPARABILITY.IDENTICAL);
});

// --- the per-student half ------------------------------------------------------

test('a student who got exactly what was authored needs no explanation', () => {
  const described = describeDeliveredRigor([eventFor('asn-1', { band: 3, dok: 2 })], 'asn-1');
  assert.equal(described.adaptedCount, 0);
  assert.match(described.summary, /exactly as authored/);
});

test('adapted delivery reports the reason, deduplicated', () => {
  // Five questions moved for one reason is one thing to read, not five.
  const described = describeDeliveredRigor([
    eventFor('asn-1', { band: 4, dok: 3, adapted: true, reason: 'Holding above the course band.' }),
    eventFor('asn-1', { band: 4, dok: 3, adapted: true, reason: 'Holding above the course band.' }),
    eventFor('asn-1', { band: 3, dok: 2 }),
  ], 'asn-1');
  assert.equal(described.adaptedCount, 2);
  assert.deepEqual(described.reasons, ['Holding above the course band.']);
  assert.match(described.summary, /assigned standard was preserved/);
});


test('assignment grade honors explicit question weights while unweighted questions remain weight 1', () => {
  const weighted = assignment(3);
  weighted.sections[0].questions[0].questionWeight = 4;
  const split = splitGrade({
    assignment: weighted,
    tracker: tracker(['correct', 'expired', 'expired']),
  });
  assert.equal(split.score, 67, '4 earned weight units out of 6 should round to 67%');
  assert.equal(split.creditOnAttempted, 67);
});

test('question weights do not change completion counts', () => {
  const weighted = assignment(3);
  weighted.sections[0].questions[0].questionWeight = 4;
  const split = splitGrade({
    assignment: weighted,
    tracker: tracker(['correct', null, null]),
  });
  assert.equal(split.attempted, 1);
  assert.equal(split.unanswered, 2);
  assert.equal(split.score, 67, 'missing questions still count as zero at their own weights');
  assert.equal(split.creditOnAttempted, 100);
});
