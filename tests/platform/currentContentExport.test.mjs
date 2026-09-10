import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCurrentContentPortablePackage } from '../../src/platform/assignments/currentContentPortableAssignment.js';
import { buildTeacherAssignmentWorksheetModel } from '../../src/platform/resources/teacherAssignmentWorksheetExport.js';

const question = (questionId, overrides = {}) => ({
  questionId, type: 'algebra', prompt: `Solve ${questionId}.`, activityRole: 'warmup', expected: '4', accepted: ['4'],
  alignments: [{ framework: 'teks', code: 'A.5A', role: 'primary', evidenceLevel: 'assessed' }],
  ...overrides,
});
const assignment = {
  id: 'live-v2', schemaVersion: 5, title: 'Current V2', courseId: 'algebra1', contentLineage: { version: 2 },
  variantPolicy: { mode: 'shared', sectionModes: {} },
  sections: [
    { id: 'warmup', role: 'warmup', title: 'Warm-Up', questions: [question('w1'), question('old', { teacherExcluded: true })] },
    { id: 'classwork', role: 'classwork', title: 'Classwork', questions: [question('c1', { activityRole: 'classwork' })] },
    { id: 'content-v2-corrections-warmup', role: 'warmup', title: 'Corrections', questions: [question('new', { supersedesQuestionId: 'old', introducedInContentVersion: 2 })] },
  ],
};

test('portable export is clean current V5 and strips migration storage details', () => {
  const exported = buildCurrentContentPortablePackage(assignment);
  assert.equal(exported.schemaVersion, 5);
  assert.deepEqual(exported.sections.map((section) => section.role), ['warmup', 'classwork']);
  assert.deepEqual(exported.sections[0].questions.map((item) => item.questionId), ['w1', 'new']);
  assert.doesNotMatch(JSON.stringify(exported.sections), /teacherExcluded|supersedesQuestionId|introducedInContentVersion|content-v2-corrections/);
  assert.deepEqual(exported.portableContract, {
    kind: 'mathmasterCanonicalAssignmentV5', version: 1, contentProjection: 'current', sourceContentVersion: 2,
  });
});

test('teacher worksheet contains replacement once in its original logical section', () => {
  const model = buildTeacherAssignmentWorksheetModel({ assignment });
  assert.deepEqual(model.sections.map((section) => section.role), ['warmup', 'classwork']);
  assert.deepEqual(model.sections[0].questions.map((item) => item.sourceIndex), [0, 3]);
  assert.equal(model.sections.flatMap((section) => section.questions).some((item) => item.sourceIndex === 1), false);
});
