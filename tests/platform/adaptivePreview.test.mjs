// "THE PREVIEW MUST USE THE REAL ADAPTATION ENGINE. DO NOT HARD-CODE A
//  DEMONSTRATION."
//
// That instruction is in the brief because the hard-coded version is so easy
// and so tempting. A preview that says "a developing student would see an
// easier question" is three lines, always looks right, and is a lie the moment
// the engine changes — a lie in the worst direction, because a teacher who has
// seen the preview publishes the assignment believing they know what will
// happen.
//
// These tests check two different things: that the preview reports what the
// engine actually does, and that it reports honestly when the engine does
// NOTHING, which is the case a demonstration would paper over.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { buildAdaptivePreview, previewProfiles, PREVIEW_STUDENTS } from '../../src/platform/assignments/adaptivePreview.js';
import { resolveAdaptedTarget } from '../../src/platform/assignments/assignmentAdaptation.js';
import { INSTRUCTIONAL_BAND } from '../../src/platform/profile/studentLearningProfile.js';

const question = (overrides = {}) => ({
  id: 'q1',
  type: 'algebra',
  prompt: 'Solve the system for x.',
  activityRole: 'practice',
  dok: 2,
  difficultyBand: 3,
  alignments: [{ framework: 'teks', code: 'A.5C', role: 'primary', evidenceLevel: 'assessed' }],
  ...overrides,
});

const adaptiveAssignment = {
  id: 'asn-1',
  variantPolicy: {
    mode: 'adaptive',
    sectionModes: { practice: 'adaptive', dol: 'shared' },
  },
};

// --- the simulated students are real profiles ----------------------------------

test('the preview students are built by the real profile builder, not hand-written', () => {
  // A profile that could not exist in the product must not appear in a preview
  // of it. Each of these is subject to every rule a real profile is, including
  // the baseline requirement.
  const profiles = previewProfiles({ courseId: 'algebra1' });
  assert.equal(profiles.length, 3);
  profiles.forEach((entry) => {
    assert.equal(entry.profile.baseline.established, true, `${entry.label} would not exist`);
  });
});

test('the three students actually land in three different bands', () => {
  // If they did not, the preview would be three copies of one student and every
  // assertion below would be vacuous.
  const [developing, onLevel, advanced] = previewProfiles({ courseId: 'algebra1' });
  assert.equal(developing.profile.instructionalBand, INSTRUCTIONAL_BAND.BELOW);
  assert.equal(onLevel.profile.instructionalBand, INSTRUCTIONAL_BAND.ON);
  assert.equal(advanced.profile.instructionalBand, INSTRUCTIONAL_BAND.ABOVE);
});

// --- the engine, not a model of it ---------------------------------------------

test('every previewed delivery matches what the engine returns for that student', () => {
  // The whole point. Re-run the engine independently and compare — if the
  // preview ever grows its own logic, this fails.
  const preview = buildAdaptivePreview({
    assignment: adaptiveAssignment,
    questions: [question(), question({ id: 'q2', difficultyBand: 2, dok: 1 })],
  });

  preview.rows.forEach((row, index) => {
    const source = [question(), question({ id: 'q2', difficultyBand: 2, dok: 1 })][index];
    row.deliveries.forEach((delivery) => {
      const student = preview.students.find((entry) => entry.id === delivery.studentId);
      const independent = resolveAdaptedTarget({
        question: source,
        profile: student.profile,
        activityRole: 'practice',
        variationMode: 'adaptive',
      });
      assert.equal(delivery.dok, independent.dok);
      assert.equal(delivery.difficultyBand, independent.difficultyBand);
      assert.equal(delivery.adapted, independent.adapted);
    });
  });
});

test('the module contains no hard-coded delivery values', () => {
  // Structural, deliberately. The guarantee should be that there is no such
  // code, not that the cases I thought of happen to agree with the engine.
  const source = readFileSync('src/platform/assignments/adaptivePreview.js', 'utf8');
  const engineCalls = source.match(/resolveAdaptedTarget\(/g) || [];
  assert.equal(engineCalls.length, 1, 'exactly one engine call, and nothing beside it');
  // No band or DOK assigned to a delivery from a literal.
  assert.ok(!/dok:\s*\d+\s*,\s*difficultyBand:\s*\d+\s*,\s*adapted/.test(source));
});

// --- the honest negative case ---------------------------------------------------

test('an assignment where nothing adapts says so, in those words', () => {
  // The case a hard-coded demonstration always gets wrong, because it is built
  // to show adaptation working.
  const preview = buildAdaptivePreview({
    assignment: { id: 'asn-2', variantPolicy: { mode: 'shared', sectionModes: {} } },
    questions: [question(), question({ id: 'q2' })],
  });
  assert.equal(preview.summary.varying, 0);
  assert.match(preview.summary.headline, /Every student would receive identical questions/);
  preview.rows.forEach((row) => assert.equal(row.varies, false));
});

test('a shared assessment section inside an adaptive assignment does not vary', () => {
  // The rule that keeps two students' DOL scores meaning the same thing.
  const preview = buildAdaptivePreview({
    assignment: adaptiveAssignment,
    questions: [question({ id: 'dol1', activityRole: 'dol' })],
  });
  assert.equal(preview.rows[0].variationMode, 'shared');
  assert.equal(preview.rows[0].varies, false);
});

test('a question is marked as not varying even inside an adaptive section when it does not', () => {
  // A question can sit in an adaptive section and still be identical for
  // everyone — assessment role, policy disabled, or all three students landing
  // in the same place. A table of identical numbers with no explanation reads
  // as a bug.
  const preview = buildAdaptivePreview({
    assignment: adaptiveAssignment,
    questions: [question({ id: 'assess', activityRole: 'quiz' })],
  });
  assert.equal(preview.rows[0].varies, false);
});

// --- what the teacher is told ---------------------------------------------------

test('adaptive practice does vary between the three students', () => {
  const preview = buildAdaptivePreview({ assignment: adaptiveAssignment, questions: [question()] });
  assert.equal(preview.rows[0].varies, true);
  assert.match(preview.summary.headline, /assigned standard is preserved/);
});

test('every row reports the authored values beside the delivered ones', () => {
  const preview = buildAdaptivePreview({ assignment: adaptiveAssignment, questions: [question()] });
  const row = preview.rows[0];
  assert.equal(row.assignedDok, 2);
  assert.equal(row.assignedBand, 3);
  row.deliveries.forEach((delivery) => {
    assert.ok(Number.isFinite(delivery.dok));
    assert.ok(Number.isFinite(delivery.difficultyBand));
  });
});

test('an adapted delivery carries the engine’s own reason, not a written one', () => {
  const preview = buildAdaptivePreview({ assignment: adaptiveAssignment, questions: [question()] });
  const adapted = preview.rows[0].deliveries.filter((delivery) => delivery.adapted);
  adapted.forEach((delivery) => {
    assert.ok(delivery.reason && delivery.reason.length > 10, 'no reason to show a teacher');
    assert.match(delivery.reason, /DOK|Band/, 'the engine states both axes');
  });
});

test('teacher-excluded questions are left out of the preview', () => {
  const preview = buildAdaptivePreview({
    assignment: adaptiveAssignment,
    questions: [question(), question({ id: 'q2', teacherExcluded: true })],
  });
  assert.equal(preview.rows.length, 1);
});

test('an empty assignment previews as empty rather than as adapting nothing', () => {
  const preview = buildAdaptivePreview({ assignment: adaptiveAssignment, questions: [] });
  assert.match(preview.summary.headline, /No questions to preview yet/);
});

test('the preview roster is frozen so a caller cannot quietly reshape it', () => {
  assert.ok(Object.isFrozen(PREVIEW_STUDENTS));
  PREVIEW_STUDENTS.forEach((student) => assert.ok(Object.isFrozen(student)));
});
