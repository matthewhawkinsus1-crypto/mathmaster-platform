import test from 'node:test';
import assert from 'node:assert/strict';

import { parseAssignmentBlueprintText } from '../../src/assignmentBlueprint.js';
import {
  buildDestinationGroups,
  destinationAssignmentKey,
  isLibraryAssignment,
  resolveAssignmentDates,
  resolveCreationMode,
} from '../../src/assignmentDestinations.js';
import { compileAuthoringIntentV5 } from '../../src/platform/contract/authoringIntentV5.js';
import {
  canonicalV5PersistencePatch,
  storedAssignmentToV5,
} from '../../src/platform/contract/storedAssignmentV5.js';
import { flattenV5Sections } from '../../src/platform/contract/assignmentSchemaV5.js';
import { buildAssignmentV5PreflightModel } from '../../src/platform/preflight/assignmentV5PreflightModel.js';
import {
  buildPreflightReviewedAssignmentV5,
} from '../../src/components/teacher/preflightV5Review.js';
import {
  replaceQuestionAtFlatIndex,
} from '../../src/platform/preflight/preflightQuestionRepair.js';
import {
  buildAssignmentWorksheetModel,
  PRINT_OUTPUT_MODES,
} from '../../src/platform/resources/assignmentWorksheetPdfModel.js';

const authored = () => ({
  schemaVersion: 5,
  assignment: {
    title: 'Lifecycle Smoke — Linear Equations',
    courseId: 'algebra1',
    folder: 'Algebra I / Equations',
    instructionalPurpose: 'lesson',
    gradingPurpose: 'classwork',
    assignmentKey: 'lifecycle.linear-equations',
  },
  variantPolicy: {
    mode: 'personalized',
    sectionModes: {
      warmup: 'shared',
      classwork: 'shared',
      practice: 'personalized',
      dol: 'shared',
    },
  },
  differentiationPolicy: {
    mode: 'bounded',
    allowStandardChange: false,
    preserveAssessmentFidelity: true,
    honors: {
      mode: 'inheritDestinationClass',
      ccmrPracticeTargetShare: 0.15,
    },
  },
  supportPolicy: {
    mode: 'inheritStudentProfile',
    modificationsAllowed: false,
  },
  outputProfiles: {
    digital: { enabled: true },
    studentWorksheetPdf: { enabled: true, showAnswers: false },
    teacherWorksheetPdf: { enabled: true, showAnswers: true },
    answerKeyPdf: { enabled: true },
    lessonNotesPdf: { enabled: true },
  },
  sections: [
    {
      id: 'warmup',
      role: 'warmup',
      title: 'Warm-Up',
      questions: [{
        standard: 'A.5A',
        prompt: 'Solve x + 3 = 9.',
        studentActions: ['solveEquation'],
        equation: 'x+3=9',
        answer: '6',
        dok: 1,
        difficultyBand: 2,
        alignments: [
          { framework: 'teks', code: 'A.5A', role: 'primary', evidenceLevel: 'assessed' },
        ],
      }],
    },
    {
      id: 'classwork',
      role: 'classwork',
      title: 'Classwork',
      questions: [{
        standard: 'A.5A',
        prompt: 'Solve 2x + 5 = 17.',
        studentActions: ['solveEquation'],
        equation: '2x+5=17',
        answer: '6',
        dok: 2,
        difficultyBand: 3,
        alignments: [
          { framework: 'teks', code: 'A.5A', role: 'primary', evidenceLevel: 'assessed' },
        ],
      }],
    },
    {
      id: 'practice',
      role: 'practice',
      title: 'Practice',
      questions: [
        {
          standard: 'A.5A',
          prompt: 'Solve 4x - 7 = 21.',
          studentActions: ['solveEquation'],
          equation: '4x-7=21',
          answer: '7',
          dok: 2,
          difficultyBand: 3,
          alignments: [
            { framework: 'teks', code: 'A.5A', role: 'primary', evidenceLevel: 'assessed' },
          ],
        },
        {
          standard: 'A.5A',
          prompt: 'If 3x + 4 = 40, what is x?',
          studentActions: ['solveEquation'],
          equation: '3x+4=40',
          answer: '12',
          dok: 2,
          difficultyBand: 3,
          alignments: [
            { framework: 'teks', code: 'A.5A', role: 'primary', evidenceLevel: 'assessed' },
            { framework: 'digitalSAT', domainId: 'algebra', role: 'primary', evidenceMode: 'direct' },
          ],
          assessmentContext: { framework: 'digitalSAT', examStyle: true },
        },
      ],
    },
    {
      id: 'dol',
      role: 'dol',
      title: 'DOL',
      questions: [{
        standard: 'A.5A',
        prompt: 'Solve 5x - 2 = 23.',
        studentActions: ['solveEquation'],
        equation: '5x-2=23',
        answer: '5',
        dok: 2,
        difficultyBand: 3,
        alignments: [
          { framework: 'teks', code: 'A.5A', role: 'primary', evidenceLevel: 'assessed' },
        ],
      }],
    },
  ],
});

const compiled = compileAuthoringIntentV5(authored()).package;

test('release lifecycle: authoring compiles and native Assignment Review accepts the same canonical object', () => {
  assert.equal(compiled.schemaVersion, 5);
  assert.equal(compiled.sections.length, 4);
  assert.equal(flattenV5Sections(compiled).length, 5);

  const reviewed = buildPreflightReviewedAssignmentV5(compiled, {
    title: 'Lifecycle Smoke — Reviewed',
    folder: 'Algebra I / Unit 2',
    sectionVariantModes: {
      warmup: 'shared',
      classwork: 'shared',
      practice: 'adaptive',
      dol: 'shared',
    },
    outputProfiles: {
      studentWorksheetPdf: { enabled: true },
      teacherWorksheetPdf: { enabled: true },
      answerKeyPdf: { enabled: true },
      lessonNotesPdf: { enabled: true },
    },
  });

  const model = buildAssignmentV5PreflightModel(reviewed);
  assert.equal(model.isValid, true, model.errors.join('\n'));
  assert.equal(model.assignmentV5.assignment.title, 'Lifecycle Smoke — Reviewed');
  assert.equal(model.assignmentV5.variantPolicy.sectionModes.practice, 'adaptive');
  assert.equal(model.assignmentV5.outputProfiles.teacherWorksheetPdf.enabled, true);
});

test('release lifecycle: library persistence stays canonical and carries no invented audience or dates', () => {
  const reviewed = buildPreflightReviewedAssignmentV5(compiled, {
    title: 'Lifecycle Smoke — Library',
  });
  const model = buildAssignmentV5PreflightModel(reviewed);
  assert.equal(model.isValid, true, model.errors.join('\n'));

  const patch = canonicalV5PersistencePatch(model.assignmentV5);
  const stored = {
    id: 'library-smoke',
    ...patch,
    assignmentKey: 'lifecycle.linear-equations',
    assignedClassIds: [],
    assignedClassPeriods: [],
    dueAt: null,
    dueDate: null,
    lateDueAt: null,
    releaseAt: null,
  };

  assert.equal(stored.schemaVersion, 5);
  assert.ok(Array.isArray(stored.sections));
  assert.equal(Object.prototype.hasOwnProperty.call(stored, 'activities'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(stored, 'questions'), false);
  assert.equal(isLibraryAssignment(stored), true);
  assert.equal(resolveCreationMode(stored), 'library');
  assert.deepEqual(resolveAssignmentDates({
    mode: 'library',
    dueValue: '2026-09-01T15:00',
    lateDueValue: '2026-09-02T15:00',
    releaseValue: '2026-08-31T15:00',
  }), {
    dueAt: null,
    lateDueAt: null,
    dueDate: null,
    releaseAt: null,
  });

  const reconstructed = storedAssignmentToV5(stored);
  const reconstructedModel = buildAssignmentV5PreflightModel(reconstructed);
  assert.equal(reconstructedModel.isValid, true, reconstructedModel.errors.join('\n'));
  assert.equal(reconstructed.assignment.courseId, 'algebra1');
  assert.equal(reconstructed.sections.length, 4);
});

test('release lifecycle: mixed Standard/Honors assignment creates distinct destination identities and real dates', () => {
  const destinations = buildDestinationGroups({
    assignedClassPeriods: ['Period 1', 'Period 2'],
    courseProfiles: {
      'Period 1': { course: 'algebra1', courseLevel: 'standard' },
      'Period 2': { course: 'algebra1', courseLevel: 'honors' },
    },
  });

  assert.deepEqual(destinations.map((entry) => entry.courseLevel).sort(), ['honors', 'standard']);
  const keys = destinations.map((destination) => destinationAssignmentKey({
    assignmentKey: 'lifecycle.linear-equations',
    destination,
    destinationCount: destinations.length,
  }));
  assert.equal(new Set(keys).size, 2);
  assert.ok(keys.some((key) => key.endsWith(':algebra1:standard')));
  assert.ok(keys.some((key) => key.endsWith(':algebra1:honors')));

  const dates = resolveAssignmentDates({
    mode: 'assign',
    dueValue: '2026-09-04T16:00',
    lateDueValue: '2026-09-05T16:00',
    releaseValue: '2026-09-03T08:00',
  });
  assert.ok(dates.dueAt);
  assert.ok(dates.lateDueAt);
  assert.ok(dates.releaseAt);
  assert.ok(new Date(dates.releaseAt) < new Date(dates.dueAt));
  assert.ok(new Date(dates.dueAt) < new Date(dates.lateDueAt));
});

test('release lifecycle: student/teacher PDF models come from the same resolved questions without leaking answers', () => {
  const entries = compiled.sections.flatMap((section) => section.questions.map((question, index) => ({
    sourceIndex: index,
    sectionRole: section.role,
    sectionLabel: section.title,
    question,
  })));

  const studentModel = buildAssignmentWorksheetModel({
    assignment: { id: 'pdf-smoke', title: compiled.assignment.title },
    student: { displayName: 'Student Smoke', classPeriod: 'Period 1' },
    entries,
    outputMode: PRINT_OUTPUT_MODES.STUDENT,
  });
  const teacherModel = buildAssignmentWorksheetModel({
    assignment: { id: 'pdf-smoke', title: compiled.assignment.title },
    student: { displayName: 'Student Smoke', classPeriod: 'Period 1' },
    entries,
    outputMode: PRINT_OUTPUT_MODES.TEACHER,
  });

  assert.equal(studentModel.sections.length, 4);
  assert.equal(teacherModel.sections.length, 4);
  assert.equal(JSON.stringify(studentModel).includes('"answerLines"'), false);
  assert.equal(JSON.stringify(studentModel).includes('"solutionLines"'), false);
  assert.equal(JSON.stringify(studentModel).includes('Answer: 12'), false);
  assert.equal(JSON.stringify(teacherModel).includes('"answerLines"'), true);
});

test('release lifecycle: a repaired question is revalidated in-place without changing section identity', () => {
  const before = buildAssignmentV5PreflightModel(compiled);
  assert.equal(before.isValid, true, before.errors.join('\n'));

  const target = flattenV5Sections(compiled)[2];
  const repaired = replaceQuestionAtFlatIndex(compiled, 2, {
    ...target,
    prompt: 'Solve 4x - 7 = 21. Show your algebraic reasoning.',
  });
  const after = buildAssignmentV5PreflightModel(repaired);
  assert.equal(after.isValid, true, after.errors.join('\n'));

  const repairedFlat = flattenV5Sections(after.assignmentV5);
  assert.equal(repairedFlat[2].questionId, target.questionId);
  assert.equal(repairedFlat[2].activityRole, 'practice');
  assert.equal(repairedFlat[2].sectionId, 'practice');
  assert.match(repairedFlat[2].prompt, /Show your algebraic reasoning/);
});

test('release lifecycle: duplicate/export reconstruction resets identity and round-trips through the live V5 parser', () => {
  const stored = {
    id: 'stored-smoke',
    ...canonicalV5PersistencePatch(compiled),
    assignmentKey: 'lifecycle.linear-equations',
    assignedClassIds: [],
    assignedClassPeriods: [],
  };

  const portable = storedAssignmentToV5(stored, { resetAssignmentKey: true });
  assert.equal(portable.assignment.id, null);
  assert.equal(portable.assignment.assignmentKey, null);
  assert.equal(portable.schemaVersion, 5);
  assert.equal(Object.prototype.hasOwnProperty.call(portable, 'activities'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(portable, 'questions'), false);

  const reimported = parseAssignmentBlueprintText(JSON.stringify(portable));
  assert.equal(reimported.schemaVersion, 5);
  assert.equal(reimported.bundleSource.schemaVersion, 5);
  assert.equal(reimported.questions.length, 5);
  assert.equal(buildAssignmentV5PreflightModel(reimported.bundleSource).isValid, true);
});

console.log('assignmentV5LifecycleSmoke.test.mjs: full creator lifecycle passed');
