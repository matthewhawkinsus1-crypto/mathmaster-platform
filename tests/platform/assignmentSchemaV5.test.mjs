import assert from 'node:assert/strict';
import {
  normalizeAssignmentV5,
  validateAssignmentV5,
  flattenV5Sections,
  rebuildV5SectionsFromQuestions,
} from '../../src/platform/contract/assignmentSchemaV5.js';

const source = normalizeAssignmentV5({
  schemaVersion: 5,
  assignment: { title: 'V5 schema smoke', courseId: 'algebra1' },
  variantPolicy: { mode: 'personalized', sectionModes: { classwork: 'shared', practice: 'personalized' } },
  sections: [
    { id: 'cw', role: 'classwork', title: 'Classwork', questions: [{ prompt: 'A', type: 'algebra' }] },
    { id: 'practice', role: 'practice', title: 'Practice', questions: [{ prompt: 'B', type: 'algebra' }] },
  ],
});

assert.equal(source.schemaVersion, 5);
assert.equal(source.differentiationPolicy.allowStandardChange, false);
assert.equal(source.differentiationPolicy.honors.mode, 'inheritDestinationClass');
assert.equal(source.differentiationPolicy.honors.ccmrPracticeTargetShare, 0.15);
assert.equal(source.supportPolicy.mode, 'inheritStudentProfile');
assert.equal(source.outputProfiles.studentWorksheetPdf.enabled, false);
assert.equal(source.outputProfiles.teacherWorksheetPdf.enabled, false);
assert.equal(source.outputProfiles.answerKeyPdf.enabled, false);
assert.deepEqual(validateAssignmentV5(source).errors, []);

const flat = flattenV5Sections(source);
assert.equal(flat.length, 2);
assert.equal(flat[0].sectionId, 'cw');
assert.equal(flat[1].activityRole, 'practice');

const enriched = [...flat, { prompt: 'Honors transfer', type: 'algebra', activityRole: 'practice' }];
const rebuilt = rebuildV5SectionsFromQuestions(source, enriched);
assert.equal(rebuilt.find((section) => section.id === 'cw').questions.length, 1);
assert.equal(rebuilt.find((section) => section.id === 'practice').questions.length, 2);

const old = validateAssignmentV5({ schemaVersion: 4, assignment: { title: 'old', courseId: 'algebra1' }, sections: [{ role: 'practice', questions: [{}] }] });
assert.ok(old.errors.some((error) => /V4 and earlier assignments are intentionally unsupported/.test(error)));

// Question identity is platform metadata, not something an outside AI or teacher
// should have to invent. Canonical V5 normalization is the earliest common
// boundary shared by Preflight, Incomplete drafts, Repair Center, and publish.
// Missing or duplicate authored IDs therefore have to become stable, unique IDs
// here — before any of those workflows tries to select or repair a question.
const identitySource = normalizeAssignmentV5({
  schemaVersion: 5,
  assignment: { title: 'Question identity', courseId: 'algebra1' },
  sections: [{
    id: 'cw',
    role: 'classwork',
    title: 'Classwork',
    questions: [
      { prompt: 'Missing id one', type: 'algebra' },
      { questionId: 'keep-me', prompt: 'Keep this id', type: 'algebra' },
      { questionId: 'keep-me', prompt: 'Duplicate id must be replaced', type: 'algebra' },
    ],
  }],
});
const identityIds = identitySource.sections[0].questions.map((question) => question.questionId);
assert.ok(identityIds.every(Boolean), 'normalization should assign every question a stable id');
assert.equal(identityIds[1], 'keep-me', 'an existing unique question id must stay unchanged');
assert.equal(new Set(identityIds).size, identityIds.length, 'canonical question ids must be unique');
assert.deepEqual(
  normalizeAssignmentV5(identitySource).sections[0].questions.map((question) => question.questionId),
  identityIds,
  'normalizing a canonical assignment again must not move immutable question ids',
);


const testCycle = normalizeAssignmentV5({
  schemaVersion: 5,
  assignment: { title: 'Functions Unit Test', courseId: 'algebra1', gradingPurpose: 'test' },
  assessmentPolicy: {
    mode: 'testCycle',
    passingScore: 70,
    review: { required: true },
    test: {},
    retest: { strategy: 'shortForm', scorePolicy: 'replaceIfHigher' },
  },
  sections: [
    { id: 'review', role: 'review', questions: [{ prompt: 'Review', type: 'algebra' }] },
    { id: 'test', role: 'test', questions: [{ prompt: 'Test', type: 'algebra' }] },
    { id: 'retest', role: 'retest', questions: [{ prompt: 'Retest', type: 'algebra' }] },
  ],
});
assert.deepEqual(validateAssignmentV5(testCycle).errors, []);
assert.equal(testCycle.assessmentPolicy.mode, 'testCycle');
assert.equal(testCycle.assessmentPolicy.passingScore, 70);
assert.equal(testCycle.sections[0].role, 'review');
assert.equal(testCycle.sections[2].role, 'retest');

const incompleteTestCycle = validateAssignmentV5({
  ...testCycle,
  sections: testCycle.sections.filter((section) => section.role !== 'retest'),
});
assert.ok(
  incompleteTestCycle.errors.some((error) => /require a retest section/i.test(error)),
  'Test Cycle must be rejected before publish when Retest is missing',
);

console.log('assignmentSchemaV5.test.mjs: all assertions passed');