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

test('TT29: Pre-Flight sets the lesson calculator, and each setting means what the calculator policy reads', async () => {
  const { ASSIGNMENT_CALCULATOR_SETTINGS, reviewedCalculatorSetting } = await import('../../src/components/teacher/preflightV5Review.js');
  const { getEffectiveActivityPolicy } = await import('../../src/platform/policies/activityPolicies.js');
  const { resolveCalculatorPolicy } = await import('../../src/platform/policies/calculatorPolicy.js');
  const { readFileSync } = await import('node:fs');
  const imported = { ...source(), toolPolicy: { calculator: 'scientific', keyboard: 'auto' } };
  // What the teacher picked goes into the reviewed assignment that is published.
  assert.equal(buildPreflightReviewedAssignmentV5(imported, { toolPolicy: { calculator: 'graphing' } }).toolPolicy.calculator, 'graphing');
  assert.equal(buildPreflightReviewedAssignmentV5(imported, { toolPolicy: { calculator: 'graphing' } }).toolPolicy.keyboard, 'auto', 'the rest of the policy is kept');
  // The control shows the teacher's pick, else the imported setting, else the default.
  assert.equal(reviewedCalculatorSetting(imported, {}), 'scientific');
  assert.equal(reviewedCalculatorSetting(imported, { toolPolicy: { calculator: 'none' } }), 'none');
  assert.equal(reviewedCalculatorSetting(source(), {}), 'inherit');
  assert.equal(reviewedCalculatorSetting({ toolPolicy: { calculator: 'questionSpecific' } }, {}), 'inherit', 'a value it does not offer reads as the default it means');
  // Every calculator the policy knows is offered, plus the default (an
  // independent list: dropping one must fail here).
  assert.deepEqual(ASSIGNMENT_CALCULATOR_SETTINGS.map(({ value }) => value), ['inherit', 'none', 'basic', 'squareRoot', 'scientific', 'graphing']);
  // Each offered setting is one the calculator policy reads for a question with none of its own.
  const classwork = getEffectiveActivityPolicy('classwork');
  for (const { value } of ASSIGNMENT_CALCULATOR_SETTINGS) {
    const policy = resolveCalculatorPolicy({ questionSpec: {}, activityPolicy: classwork, assignmentCalculatorMode: value });
    assert.equal(policy.mode, value === 'inherit' ? 'basic' : value, value);
    assert.equal(policy.available, value !== 'none', value);
  }
  // The modal renders the control from that list, bound to the draft's toolPolicy.
  const modal = readFileSync(new URL('../../src/components/teacher/LessonPreflightModal.jsx', import.meta.url), 'utf8');
  assert.match(modal, /<fieldset[^>]*data-preflight-calculator>[\s\S]*?<select value=\{calculatorSetting\} onChange=\{\(event\) => setCalculatorSetting\(event\.target\.value\)\}[\s\S]*?ASSIGNMENT_CALCULATOR_SETTINGS\.map/);
  assert.match(modal, /const setCalculatorSetting = \(value\) => setDraft\(\(current\) => \(\{\s*\.\.\.current,\s*toolPolicy: \{ \.\.\.\(current\.toolPolicy \|\| \{\}\), calculator: value \},/);
});
