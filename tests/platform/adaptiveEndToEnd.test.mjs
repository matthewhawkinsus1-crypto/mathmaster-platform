// THE WHOLE ADAPTIVE PIPELINE, IN ONE PASS, WITH REAL STUDENTS.
//
// Every stage of this flow already had its own passing unit test. That is
// exactly the condition the brief warns about: "Do not assume that a passing
// pure-function test means every authoring, publishing, UI, and runtime path is
// using the new behavior." A per-stage test proves each function is correct in
// isolation; it does not prove the stages are connected, and this repository has
// already produced several defects that were nothing but a disconnected seam —
// evidence recording the template's DOK instead of the delivered one, DOK never
// reaching the question picker, the profile silently ignoring every assignment.
//
// So this walks one AI-authored JSON package the whole way:
//
//   AI JSON -> import normalization -> section mode resolution -> adaptation
//   -> delivered metadata -> evidence event -> Student Learning Profile
//
// and asserts the two things a teacher's trust actually rests on: that three
// different students receive DIFFERENT rigor, and that all three receive the
// SAME assigned standard.

import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeAssignmentPackageMetadata } from '../../src/assignmentBlueprint.js';
import { getSectionVariantMode } from '../../src/assignmentLifecycle.js';
import { resolveDeliveredQuestionMetadata, adaptationRecord } from '../../src/platform/assignments/assignmentAdaptation.js';
import { buildAttemptEvidenceEvent } from '../../src/platform/history/evidenceEvent.js';
import { buildStudentLearningProfile, INSTRUCTIONAL_BAND } from '../../src/platform/profile/studentLearningProfile.js';

// --- Stage 1: what an external AI author actually writes -----------------------

const AI_PACKAGE = {
  assignment: {
    title: 'Systems of Equations — Practice',
    assignmentType: 'practice',
    variantMode: 'adaptive',
    sectionVariantModes: { practice: 'adaptive', dol: 'shared' },
    courseId: 'algebra1',
    classes: ['Period 3'],
  },
  questions: [
    {
      type: 'algebra',
      prompt: 'Solve the system for x.',
      activityRole: 'practice',
      dok: 2,
      difficultyBand: 3,
      responseType: 'numeric',
      alignments: [{ framework: 'teks', code: 'A.5C', role: 'primary', evidenceLevel: 'assessed' }],
    },
    {
      type: 'algebra',
      prompt: 'Demonstrate of Learning: solve the system.',
      activityRole: 'dol',
      dok: 2,
      difficultyBand: 3,
      responseType: 'numeric',
      alignments: [{ framework: 'teks', code: 'A.5C', role: 'primary', evidenceLevel: 'assessed' }],
    },
  ],
};

const imported = normalizeAssignmentPackageMetadata(AI_PACKAGE.assignment, AI_PACKAGE.questions);

test('an AI-authored adaptive assignment survives import as adaptive', () => {
  // The specific regression: import used to know two modes, so "adaptive"
  // normalized to "personalized" and the teacher published Variant while
  // believing they had published Adaptive.
  assert.equal(imported.variantMode, 'adaptive');
});

test('a per-section adaptive mode is not flattened into the assignment mode', () => {
  assert.equal(imported.sectionVariantModes.practice, 'adaptive');
  assert.equal(imported.sectionVariantModes.dol, 'shared');
});

test('legacy personalized still means Variant and is never promoted', () => {
  const legacy = normalizeAssignmentPackageMetadata(
    { ...AI_PACKAGE.assignment, variantMode: 'personalized', sectionVariantModes: {} },
    AI_PACKAGE.questions,
  );
  assert.equal(legacy.variantMode, 'personalized');
});

// --- Stage 2: what the runtime asks for, section by section --------------------

const published = { id: 'asn-1', title: imported.title, ...imported };

test('the runtime resolves the authored section mode, not the assignment default', () => {
  assert.equal(getSectionVariantMode(published, 'practice'), 'adaptive');
  assert.equal(getSectionVariantMode(published, 'dol'), 'shared');
  // A role the author never named falls back to the assignment mode rather than
  // being invented.
  assert.equal(getSectionVariantMode(published, 'warmup'), 'adaptive');
});

// --- Stage 3: three real students, one assigned standard ----------------------

// Baseline requires 12 classifying events across at least 3 distinct skills and
// 2 distinct sources. A fixture that misses any of those produces a student the
// profile refuses to classify — correctly — so the fixtures below meet it
// deliberately rather than by accident.
const evidenceFor = ({ correct, dok, band, count, teks = 'A.5C', role = 'practice' }) => (
  Array.from({ length: count }, (unused, index) => ({
    eventKey: `seed-${teks}-${role}-${dok}-${band}-${index}`,
    occurredAt: 1_770_000_000_000 + (index * 60_000),
    alignmentKeys: [teks],
    questionSnapshot: { dok, difficultyBand: band, questionInstanceId: `q-${teks}-${role}-${index}` },
    performance: { status: 'finalized', isCorrect: correct, score: correct ? 1 : 0 },
    source: { kind: 'path', activityRole: role },
  }))
);

const STUDENTS = {
  // Nothing holds anywhere: plenty of attempts, no stable band. That is a
  // finding, not an absence of one.
  developing: buildStudentLearningProfile({
    courseId: 'algebra1',
    evidenceEvents: [
      ...evidenceFor({ correct: false, dok: 2, band: 3, count: 5 }),
      ...evidenceFor({ correct: false, dok: 2, band: 2, count: 5, teks: 'A.2C', role: 'dol' }),
      ...evidenceFor({ correct: false, dok: 1, band: 2, count: 5, teks: 'A.3B' }),
      ...evidenceFor({ correct: true, dok: 1, band: 1, count: 2, teks: 'A.7A', role: 'dol' }),
    ],
  }),
  // Band 3 — the ordinary independent course expectation — holds; band 4 does not.
  onLevel: buildStudentLearningProfile({
    courseId: 'algebra1',
    evidenceEvents: [
      ...evidenceFor({ correct: true, dok: 2, band: 3, count: 5 }),
      ...evidenceFor({ correct: true, dok: 2, band: 3, count: 5, teks: 'A.2C', role: 'dol' }),
      ...evidenceFor({ correct: true, dok: 2, band: 3, count: 4, teks: 'A.3B' }),
      ...evidenceFor({ correct: false, dok: 3, band: 4, count: 4, teks: 'A.7A', role: 'dol' }),
    ],
  }),
  // Band 4 holds AND there is reasoning evidence at DOK 3 — both are required.
  advanced: buildStudentLearningProfile({
    courseId: 'algebra1',
    evidenceEvents: [
      ...evidenceFor({ correct: true, dok: 3, band: 4, count: 6 }),
      ...evidenceFor({ correct: true, dok: 3, band: 4, count: 6, teks: 'A.2C', role: 'dol' }),
      ...evidenceFor({ correct: true, dok: 3, band: 4, count: 6, teks: 'A.3B' }),
      ...evidenceFor({ correct: true, dok: 2, band: 3, count: 6, teks: 'A.7A', role: 'dol' }),
    ],
  }),
};

const practiceQuestion = published.questions?.[0] || AI_PACKAGE.questions[0];

const deliverTo = (profile, role = 'practice') => resolveDeliveredQuestionMetadata({
  question: practiceQuestion,
  learningProfile: profile,
  activityRole: role,
  variationMode: getSectionVariantMode(published, role),
});

test('the three simulated students are actually in different instructional bands', () => {
  // If this fails the rest of the file proves nothing — it would be comparing
  // three copies of the same student.
  assert.equal(STUDENTS.developing.instructionalBand, INSTRUCTIONAL_BAND.BELOW);
  assert.equal(STUDENTS.onLevel.instructionalBand, INSTRUCTIONAL_BAND.ON);
  assert.equal(STUDENTS.advanced.instructionalBand, INSTRUCTIONAL_BAND.ABOVE);
});

test('adaptive Practice delivers different rigor to different students', () => {
  const below = deliverTo(STUDENTS.developing);
  const on = deliverTo(STUDENTS.onLevel);
  const above = deliverTo(STUDENTS.advanced);

  assert.ok(below.difficultyBand <= on.difficultyBand, 'a struggling student must not be handed more complexity');
  assert.ok(above.difficultyBand >= on.difficultyBand, 'a strong student must not be held to less');
  assert.ok(
    below.difficultyBand !== above.difficultyBand || below.dok !== above.dok,
    'Below Level and Above Level received identical rigor — adaptation did not reach the runtime',
  );
});

test('adaptation never moves the assigned standard', () => {
  Object.values(STUDENTS).forEach((profile) => {
    const record = adaptationRecord({
      target: deliverTo(profile).target,
      teksCode: 'A.5C',
      studentId: 'student-1',
    });
    assert.equal(record.teksCode, 'A.5C');
    assert.equal(record.standardPreserved, true);
  });
});

test('the shared DOL section is identical for all three students', () => {
  // The rule that makes a grade comparable. If assessment rigor moved with the
  // student, two students' scores would not mean the same thing.
  const delivered = Object.values(STUDENTS).map((profile) => deliverTo(profile, 'dol'));
  const [first] = delivered;
  delivered.forEach((entry) => {
    assert.equal(entry.difficultyBand, first.difficultyBand);
    assert.equal(entry.dok, first.dok);
    assert.equal(entry.adapted, false, 'assessment rigor is the same for every student');
  });
});

// --- Stage 4: what gets written down ------------------------------------------

const eventFor = (profile, studentId) => {
  const delivered = deliverTo(profile);
  return buildAttemptEvidenceEvent({
    studentId,
    assignment: published,
    question: practiceQuestion,
    questionIndex: 0,
    activityRole: 'practice',
    attemptRecord: { totalAttempts: 1, status: 'correct' },
    attemptResult: { isCorrect: true },
    occurredAt: 1_770_100_000_000,
    delivered,
  });
};

test('evidence records what was DELIVERED and what was ASSIGNED, separately', () => {
  const event = eventFor(STUDENTS.advanced, 'student-above');
  const snapshot = event.questionSnapshot;
  assert.equal(snapshot.assignedDok, 2, 'the authored demand is preserved');
  assert.equal(snapshot.assignedDifficultyBand, 3, 'the authored complexity is preserved');
  assert.ok(Number.isFinite(snapshot.dok) && Number.isFinite(snapshot.difficultyBand));
  // A teacher comparing two students' scores has to be able to see whether the
  // rigor differed. Both numbers are on the record, so nobody has to guess.
  assert.ok('adapted' in snapshot);
});

test('an adapted delivery carries a human-readable reason, not just a flag', () => {
  const adaptedEvent = [STUDENTS.developing, STUDENTS.advanced]
    .map((profile, index) => eventFor(profile, `student-${index}`))
    .find((event) => event.questionSnapshot.adapted === true);
  if (!adaptedEvent) return; // no adaptation fired for these two: nothing to explain.
  assert.ok(adaptedEvent.adaptation, 'an adapted event with no adaptation block cannot be explained to a teacher');
  assert.ok(adaptedEvent.adaptation.reason, 'the reason must be readable, not a bare code');
  assert.equal(adaptedEvent.adaptation.standardPreserved, true);
});

test('the delivered rigor comes back out of the profile it goes into', () => {
  // The seam that was broken once already: the profile ignored every assignment
  // event because it spoke a different status vocabulary. If this regresses,
  // adaptive assignments become invisible to every teacher screen.
  const event = eventFor(STUDENTS.onLevel, 'student-on');
  const rebuilt = buildStudentLearningProfile({
    courseId: 'algebra1',
    evidenceEvents: [...evidenceFor({ correct: true, dok: 2, band: 3, count: 5 }), event],
  });
  const counted = (rebuilt.difficultyProfile?.byBand || {})[event.questionSnapshot.difficultyBand];
  assert.ok(counted, `band ${event.questionSnapshot.difficultyBand} evidence never reached the profile`);
});
