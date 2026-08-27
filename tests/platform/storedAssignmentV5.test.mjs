import test from 'node:test';
import assert from 'node:assert/strict';

import {
  canonicalV5PersistencePatch,
  inferStoredAssignmentCourseId,
  storedAssignmentToV5,
} from '../../src/platform/contract/storedAssignmentV5.js';
import { buildAssignmentV5PreflightModel } from '../../src/platform/preflight/assignmentV5PreflightModel.js';

const stored = (overrides = {}) => ({
  id: 'assignment-1',
  schemaVersion: 5,
  title: 'Linear Equations',
  courseId: 'algebra1',
  folder: 'Unit 1',
  instructionalPurpose: 'lesson',
  gradingPurpose: 'classwork',
  variantMode: 'personalized',
  sectionVariantModes: { practice: 'personalized' },
  variantPolicy: {
    mode: 'personalized',
    sectionModes: { practice: 'personalized' },
  },
  supportPolicy: { mode: 'inheritStudentProfile', modificationsAllowed: false },
  differentiationPolicy: {
    mode: 'bounded',
    allowStandardChange: false,
    preserveAssessmentFidelity: true,
    honors: { mode: 'inheritDestinationClass', ccmrPracticeTargetShare: 0.15 },
  },
  outputProfiles: {
    digital: { enabled: true },
    studentWorksheetPdf: { enabled: true },
    teacherWorksheetPdf: { enabled: true },
    answerKeyPdf: { enabled: true },
    lessonNotesPdf: { enabled: true },
  },
  sections: [{
    id: 'practice',
    role: 'practice',
    title: 'Practice',
    questions: [{
      questionId: 'q1',
      type: 'multiAnswer',
      prompt: 'Solve 2x + 1 = 9.',
      dok: 2,
      difficultyBand: 3,
      answerFields: [{ id: 'x', label: 'x', answer: '4' }],
      alignments: [{ framework: 'teks', code: 'A.5A', role: 'primary', evidenceLevel: 'assessed' }],
    }],
  }],
  questions: [{
    questionId: 'q1',
    type: 'multiAnswer',
    activityRole: 'practice',
    sectionId: 'practice',
    sectionTitle: 'Practice',
    prompt: 'Solve 2x + 1 = 9.',
    dok: 2,
    difficultyBand: 3,
    answerFields: [{ id: 'x', label: 'x', answer: '4' }],
    alignments: [{ framework: 'teks', code: 'A.5A', role: 'primary', evidenceLevel: 'assessed' }],
  }],
  ...overrides,
});

test('stored assignment reconstructs as canonical V5 with preserved policies', () => {
  const v5 = storedAssignmentToV5(stored());
  assert.equal(v5.schemaVersion, 5);
  assert.equal(v5.assignment.title, 'Linear Equations');
  assert.equal(v5.assignment.courseId, 'algebra1');
  assert.equal(v5.variantPolicy.sectionModes.practice, 'personalized');
  assert.equal(v5.supportPolicy.modificationsAllowed, false);
  assert.equal(v5.sections[0].questions.length, 1);
  assert.equal(buildAssignmentV5PreflightModel(v5).isValid, true);
});

test('stored course is inferred from Algebra II TEKS when older records lack courseId', () => {
  const old = stored({
    courseId: null,
    courseProfile: { course: null, courseLevel: null },
    questions: [{
      questionId: 'q1',
      type: 'multiAnswer',
      prompt: 'Solve.',
      dok: 2,
      difficultyBand: 3,
      answerFields: [{ id: 'x', label: 'x', answer: '4' }],
      alignments: [{ framework: 'teks', code: 'A2.4F', role: 'primary', evidenceLevel: 'assessed' }],
    }],
  });
  assert.equal(inferStoredAssignmentCourseId(old, old.questions), 'algebra2');
  assert.equal(storedAssignmentToV5(old).assignment.courseId, 'algebra2');
});

test('course reconstruction fails closed rather than guessing the wrong course', () => {
  const old = stored({
    courseId: null,
    courseProfile: { course: null, courseLevel: null },
    standards: [],
    questions: [{
      questionId: 'q1',
      type: 'multiAnswer',
      prompt: 'Solve.',
      dok: 2,
      difficultyBand: 3,
      answerFields: [{ id: 'x', label: 'x', answer: '4' }],
      alignments: [],
    }],
  });
  assert.throws(() => storedAssignmentToV5(old), /does not contain enough course\/TEKS information/);
});

test('portable reconstruction can reset assignmentKey without changing content', () => {
  const v5 = storedAssignmentToV5(stored({ assignmentKey: 'unit1.eq' }), {
    resetAssignmentKey: true,
  });
  assert.equal(v5.assignment.assignmentKey, null);
  assert.equal(v5.assignment.id, null);
  assert.equal(v5.sections[0].questions[0].prompt, 'Solve 2x + 1 = 9.');
});

test('canonical persistence patch keeps courseId and V5 policy fields', () => {
  const v5 = storedAssignmentToV5(stored());
  const patch = canonicalV5PersistencePatch(v5);
  assert.equal(patch.schemaVersion, 5);
  assert.equal(patch.courseId, 'algebra1');
  assert.equal(patch.runtimeProjectionVersion, 1);
  assert.equal(patch.questions.length, 1);
  assert.equal(patch.variantPolicy.mode, 'personalized');
  assert.equal(patch.outputProfiles.studentWorksheetPdf.enabled, true);
});

console.log('storedAssignmentV5.test.mjs: all assertions passed');


test('section-only stored V5 records can reconstruct when flat runtime questions are empty', () => {
  const record = stored({ questions: [] });
  const v5 = storedAssignmentToV5(record);
  assert.equal(v5.sections[0].questions.length, 1);
  assert.equal(v5.sections[0].questions[0].prompt, 'Solve 2x + 1 = 9.');
});
