// Evidence must record what the student ANSWERED, not what the question claimed.
//
// THE DEFECT THIS PINS. `buildAttemptEvidenceEvent` read DOK and difficulty off
// the question template. But the template is not what was delivered: per-band
// content profiles could already substitute a different band's version, and
// adaptive assignments move the band deliberately. So a student could answer a
// Band 2 version of a question and have Band 3 written to their permanent
// record.
//
// That is not a cosmetic mismatch. These events are the sole input to the
// Student Learning Profile, so the difficulty picture, the stable band, the
// instructional band, and every recommendation drawn from them were being
// computed from what questions CLAIMED rather than from what students did.

import test from 'node:test';
import assert from 'node:assert/strict';

import { buildAttemptEvidenceEvent } from '../../src/platform/history/evidenceEvent.js';
import { buildStudentLearningProfile } from '../../src/platform/profile/studentLearningProfile.js';
import {
  resolveDeliveredQuestionMetadata,
} from '../../src/platform/assignments/assignmentAdaptation.js';

const assignment = { id: 'a1', title: 'Practice', assignmentType: 'practice' };

const question = (overrides = {}) => ({
  questionId: 'q1',
  type: 'algebra',
  teks: ['A.5C'],
  standards: ['A.5C'],
  dok: 2,
  difficulty: { generatorBand: 3 },
  activityRole: 'practice',
  ...overrides,
});

const profileAt = (stableBand, overrides = {}) => ({
  baseline: { established: true },
  difficultyProfile: { stableBand },
  dokProfile: {},
  ...overrides,
});

const eventFor = ({ q = question(), profile = null, role = 'practice', mode = 'adaptive', correct = true } = {}) => {
  const delivered = resolveDeliveredQuestionMetadata({
    question: q, learningProfile: profile, activityRole: role, variationMode: mode,
  });
  return buildAttemptEvidenceEvent({
    studentId: 's1',
    assignment,
    question: q,
    questionIndex: 0,
    activityRole: role,
    attemptRecord: { status: 'correct', totalAttempts: 1 },
    attemptResult: { isCorrect: correct },
    delivered,
  });
};

// --- The core defect --------------------------------------------------------------

test('an adapted question records the band the student actually answered', () => {
  const event = eventFor({ profile: profileAt(2) });
  assert.equal(event.questionSnapshot.difficultyBand, 2, 'what was delivered');
  assert.equal(event.questionSnapshot.assignedDifficultyBand, 3, 'what was assigned');
  assert.equal(event.questionSnapshot.adapted, true);
});

test('an adapted question records the depth the student actually answered', () => {
  const event = eventFor({
    profile: profileAt(3, { dokProfile: { 3: { confident: true, accuracy: 0.85 } } }),
  });
  assert.equal(event.questionSnapshot.dok, 3);
  assert.equal(event.questionSnapshot.assignedDok, 2);
});

test('both numbers are kept, so "was this the version I assigned?" is answerable', () => {
  const event = eventFor({ profile: profileAt(2) });
  assert.ok('difficultyBand' in event.questionSnapshot);
  assert.ok('assignedDifficultyBand' in event.questionSnapshot);
  assert.notEqual(event.questionSnapshot.difficultyBand, event.questionSnapshot.assignedDifficultyBand);
});

test('an unadapted question records the assigned values and no adaptation block', () => {
  const event = eventFor({ profile: profileAt(3) });
  assert.equal(event.questionSnapshot.difficultyBand, 3);
  assert.equal(event.questionSnapshot.adapted, false);
  assert.equal(event.adaptation, null, 'no reason to store when nothing moved');
});

test('an event built without delivered metadata behaves exactly as before', () => {
  // Every existing call site that has not been updated must keep working.
  const event = buildAttemptEvidenceEvent({
    studentId: 's1',
    assignment,
    question: question(),
    questionIndex: 0,
    activityRole: 'practice',
    attemptRecord: { status: 'correct', totalAttempts: 1 },
    attemptResult: { isCorrect: true },
  });
  assert.equal(event.questionSnapshot.difficultyBand, 3);
  assert.equal(event.questionSnapshot.dok, 2);
  assert.equal(event.questionSnapshot.adapted, false);
  assert.equal(event.adaptation, null);
});

test('the reason travels with the evidence, not just with the session', () => {
  // A teacher looking at a grade in April needs to know why that student got
  // that version in October.
  const event = eventFor({ profile: profileAt(2) });
  assert.ok(event.adaptation);
  assert.ok(event.adaptation.reasonCode);
  assert.equal(event.adaptation.mode, 'adaptive');
  assert.equal(event.adaptation.standardPreserved, true);
});

// --- The consequence: profiles built from delivered data --------------------------

test('the profile learns the band the student actually worked at', () => {
  // The whole point. A student who answered twelve Band 2 questions should show
  // a Band 2 picture — not a Band 3 one because the templates said 3.
  const profile = profileAt(2);
  const events = Array.from({ length: 12 }, (_, i) => eventFor({
    profile, correct: true, q: question({ questionId: `q${i}` }),
  }));

  assert.ok(events.every((event) => event.questionSnapshot.difficultyBand === 2));

  const learned = buildStudentLearningProfile({
    evidenceEvents: events.map((event) => ({
      ...event,
      alignmentKeys: ['texas:A.5C', 'texas:A.3A', 'texas:A.9A'],
      source: { ...event.source, activityRole: 'practice' },
      recordedAt: Date.now(),
    })),
  });
  assert.ok(learned.difficultyProfile.byBand['2'], 'Band 2 evidence was recorded');
  assert.equal(learned.difficultyProfile.byBand['3'], undefined,
    'no Band 3 evidence should exist — none was delivered');
});

test('an assessment records the assigned rigor because that is what was delivered', () => {
  const event = eventFor({
    q: question({ activityRole: 'dol' }), role: 'dol', profile: profileAt(1),
  });
  assert.equal(event.questionSnapshot.difficultyBand, 3);
  assert.equal(event.questionSnapshot.adapted, false,
    'a DOL is the same for everyone, so there is nothing to explain');
});

test('the standard on the evidence is the standard that was assigned', () => {
  // Adaptation pitches a standard; it never substitutes one. The evidence has
  // to be able to prove that.
  const event = eventFor({ profile: profileAt(1) });
  assert.ok(event.alignmentKeys.some((key) => String(key).includes('A.5C')),
    `alignment keys were ${JSON.stringify(event.alignmentKeys)}`);
});

// --- Round trip: what the teacher's report will actually read --------------------

test('an old evidence event still reports sensible assigned values', () => {
  // Events written before this change carry no assigned* fields. The report
  // falls back to the delivered values, so a pre-existing record reads as
  // "as assigned" rather than as a missing row or a NaN.
  const legacy = {
    eventKey: 'ev_old',
    occurredAt: 1,
    alignmentKeys: ['texas:A.5C'],
    questionSnapshot: { dok: 2, difficultyBand: 3 },
    source: { kind: 'assignment', assignmentId: 'a1', activityRole: 'practice' },
    performance: { isCorrect: true, status: 'correct' },
  };
  const snapshot = legacy.questionSnapshot;
  const assignedBand = Number(snapshot.assignedDifficultyBand ?? snapshot.difficultyBand);
  const assignedDok = Number(snapshot.assignedDok ?? snapshot.dok);
  assert.equal(assignedBand, 3);
  assert.equal(assignedDok, 2);
  assert.equal(Boolean(snapshot.adapted), false);
});

test('the delivered and assigned values are both present on a new event', () => {
  const event = eventFor({ profile: profileAt(2) });
  const snapshot = event.questionSnapshot;
  ['dok', 'difficultyBand', 'assignedDok', 'assignedDifficultyBand', 'adapted'].forEach((field) => {
    assert.ok(field in snapshot, `${field} missing from the snapshot the teacher report reads`);
  });
});

test('a shared question is never marked adapted', () => {
  const event = eventFor({ mode: 'shared', profile: profileAt(1) });
  assert.equal(event.questionSnapshot.adapted, false);
  assert.equal(event.questionSnapshot.difficultyBand, event.questionSnapshot.assignedDifficultyBand);
});
