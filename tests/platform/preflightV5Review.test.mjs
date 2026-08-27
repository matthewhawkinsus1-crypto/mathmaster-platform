import test from 'node:test';
import assert from 'node:assert/strict';

import {
  aggregateReviewedVariantMode,
  buildPreflightReviewedAssignmentV5,
  resolveReviewedSectionModes,
} from '../../src/components/teacher/preflightV5Review.js';
import { buildAssignmentV5PreflightModel } from '../../src/platform/preflight/assignmentV5PreflightModel.js';

const source = () => ({
  schemaVersion: 5,
  assignment: {
    title: 'Original title',
    courseId: 'algebra1',
    folder: 'Unit 1',
    instructionalPurpose: 'lesson',
    gradingPurpose: 'classwork',
  },
  sections: [
    {
      id: 'warmup',
      role: 'warmup',
      title: 'Warm-Up',
      questions: [{
        type: 'multiAnswer',
        prompt: 'Solve x + 2 = 5.',
        dok: 1,
        difficultyBand: 2,
        answerFields: [{ id: 'x', label: 'x', answer: '3' }],
        alignments: [{ framework: 'teks', code: 'A.5A', role: 'primary', evidenceLevel: 'assessed' }],
      }],
    },
    {
      id: 'practice',
      role: 'practice',
      title: 'Practice',
      questions: [{
        type: 'multiAnswer',
        prompt: 'Solve 2x + 1 = 9.',
        dok: 2,
        difficultyBand: 3,
        answerFields: [{ id: 'x', label: 'x', answer: '4' }],
        alignments: [{ framework: 'teks', code: 'A.5A', role: 'primary', evidenceLevel: 'assessed' }],
      }],
    },
  ],
  variantPolicy: {
    mode: 'personalized',
    sectionModes: { warmup: 'shared', practice: 'personalized' },
    avoidRecentTemplates: true,
    avoidDuplicateParameters: true,
  },
  differentiationPolicy: {
    mode: 'bounded',
    allowStandardChange: false,
    preserveAssessmentFidelity: true,
    honors: { mode: 'inheritDestinationClass', ccmrPracticeTargetShare: 0.15 },
  },
  supportPolicy: { mode: 'inheritStudentProfile', modificationsAllowed: false },
  toolPolicy: { calculator: 'inherit', keyboard: 'auto' },
  deliveryPolicy: { sectionGating: 'rolePolicy' },
  gradingPolicy: { attemptPolicy: 'rolePolicy', scoring: 'platformDefault' },
  evidencePolicy: { gradeEligible: true, masteryEligible: true, recommendationEligible: true, analyticsEligible: true },
  outputProfiles: {
    digital: { enabled: true },
    studentWorksheetPdf: { enabled: true, showAnswers: false },
    teacherWorksheetPdf: { enabled: true, showAnswers: true },
    answerKeyPdf: { enabled: true },
    lessonNotesPdf: { enabled: true },
  },
  classroomIntegration: {},
  provenance: { contentRelease: 'test' },
  preflight: { required: true },
});

test('review projection starts from source V5 section modes when the teacher changes nothing', () => {
  const modes = resolveReviewedSectionModes(source(), {});
  assert.deepEqual(modes, { warmup: 'shared', practice: 'personalized' });
  assert.equal(aggregateReviewedVariantMode(modes), 'personalized');
});

test('teacher section-version choices are written into canonical variantPolicy', () => {
  const reviewed = buildPreflightReviewedAssignmentV5(source(), {
    sectionVariantModes: { practice: 'adaptive' },
  });
  assert.deepEqual(reviewed.variantPolicy.sectionModes, {
    warmup: 'shared',
    practice: 'adaptive',
  });
  assert.equal(reviewed.variantPolicy.mode, 'adaptive');
  assert.equal(reviewed.sections[1].questions[0].prompt, 'Solve 2x + 1 = 9.');
});

test('teacher PDF switches update outputProfiles without losing renderer settings', () => {
  const reviewed = buildPreflightReviewedAssignmentV5(source(), {
    outputProfiles: {
      studentWorksheetPdf: { enabled: false },
      teacherWorksheetPdf: { enabled: false },
    },
  });
  assert.equal(reviewed.outputProfiles.studentWorksheetPdf.enabled, false);
  assert.equal(reviewed.outputProfiles.studentWorksheetPdf.showAnswers, false);
  assert.equal(reviewed.outputProfiles.teacherWorksheetPdf.enabled, false);
  assert.equal(reviewed.outputProfiles.teacherWorksheetPdf.showAnswers, true);
  assert.equal(reviewed.outputProfiles.answerKeyPdf.enabled, true);
});

test('teacher title/folder review is carried by the V5 assignment object', () => {
  const reviewed = buildPreflightReviewedAssignmentV5(source(), {
    title: 'Reviewed title',
    folder: 'Unit 2 / Equations',
  });
  assert.equal(reviewed.assignment.title, 'Reviewed title');
  assert.equal(reviewed.assignment.folder, 'Unit 2 / Equations');
});

test('reviewed V5 is what native Preflight validates', () => {
  const reviewed = buildPreflightReviewedAssignmentV5(source(), {
    sectionVariantModes: { practice: 'adaptive' },
    outputProfiles: { studentWorksheetPdf: { enabled: false } },
  });
  const model = buildAssignmentV5PreflightModel(reviewed);
  assert.equal(model.isValid, true);
  assert.equal(model.assignmentV5.variantPolicy.sectionModes.practice, 'adaptive');
  assert.equal(model.assignmentV5.outputProfiles.studentWorksheetPdf.enabled, false);
});

console.log('preflightV5Review.test.mjs: all assertions passed');
