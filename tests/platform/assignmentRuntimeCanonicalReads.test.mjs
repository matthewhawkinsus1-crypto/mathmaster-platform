import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getStoredAssignmentQuestions,
  getStoredAssignmentTypeProjection,
  getStoredAssignmentVariantMode,
  getStoredSectionVariantMode,
  getStoredSectionVariantModes,
  inferStoredAssignmentCourseId,
  storedAssignmentToV5,
} from '../../src/platform/contract/storedAssignmentV5.js';
import {
  getIncludedQuestionIndices,
  getSectionAccessState,
  getSectionVariantMode,
  hasMixedSectionVariantModes,
  resolveDOLQuestionIndices,
} from '../../src/assignmentLifecycle.js';

const teks = (code) => [{ framework: 'teks', code, role: 'primary', evidenceLevel: 'assessed' }];

const question = (id, role, prompt, code = 'A.5A') => ({
  questionId: id,
  type: 'multiAnswer',
  activityRole: role,
  prompt,
  dok: 2,
  difficultyBand: 3,
  answerFields: [{ id: 'x', label: 'x', answer: '4' }],
  alignments: teks(code),
});

const conflicting = () => ({
  schemaVersion: 5,
  title: 'Canonical read test',
  courseId: 'algebra1',
  assignmentType: 'practice',
  variantMode: 'personalized',
  sectionVariantModes: { classwork: 'personalized', practice: 'shared' },
  variantPolicy: {
    mode: 'shared',
    sectionModes: { classwork: 'shared', practice: 'adaptive', dol: 'shared' },
  },
  sections: [
    {
      id: 'classwork',
      role: 'classwork',
      title: 'Classwork',
      questions: [question('cw1', 'classwork', 'CANONICAL CLASSWORK')],
    },
    {
      id: 'practice',
      role: 'practice',
      title: 'Practice',
      questions: [question('p1', 'practice', 'CANONICAL PRACTICE')],
    },
    {
      id: 'dol',
      role: 'dol',
      title: 'DOL',
      questions: [question('d1', 'dol', 'CANONICAL DOL')],
    },
  ],
  // Deliberately stale mirror. Runtime must not prefer this over sections[].
  questions: [
    { ...question('stale1', 'practice', 'STALE FLAT MIRROR', 'A2.4F'), teacherExcluded: true },
  ],
});

test('stored question reads prefer sections over a contradictory flat runtime mirror', () => {
  const assignment = conflicting();
  const questions = getStoredAssignmentQuestions(assignment);
  assert.deepEqual(questions.map((item) => item.questionId), ['cw1', 'p1', 'd1']);
  assert.deepEqual(questions.map((item) => item.prompt), [
    'CANONICAL CLASSWORK',
    'CANONICAL PRACTICE',
    'CANONICAL DOL',
  ]);
  assert.deepEqual(getIncludedQuestionIndices(assignment), [0, 1, 2]);
});

test('V5 reconstruction uses canonical section questions rather than stale flat questions', () => {
  const v5 = storedAssignmentToV5(conflicting());
  assert.deepEqual(
    v5.sections.flatMap((section) => section.questions.map((item) => item.questionId)),
    ['cw1', 'p1', 'd1'],
  );
  assert.equal(JSON.stringify(v5).includes('STALE FLAT MIRROR'), false);
});

test('course inference follows canonical section evidence when flat mirror disagrees', () => {
  const assignment = conflicting();
  assignment.courseId = null;
  assignment.courseProfile = { course: null };
  assert.equal(inferStoredAssignmentCourseId(assignment), 'algebra1');
  assert.equal(storedAssignmentToV5(assignment).assignment.courseId, 'algebra1');
});

test('variantPolicy and its sectionModes outrank legacy variant mirrors', () => {
  const assignment = conflicting();
  assert.equal(getStoredAssignmentVariantMode(assignment), 'shared');
  assert.deepEqual(getStoredSectionVariantModes(assignment), {
    classwork: 'shared',
    practice: 'adaptive',
    dol: 'shared',
  });
  assert.equal(getStoredSectionVariantMode(assignment, 'practice'), 'adaptive');
  assert.equal(getSectionVariantMode(assignment, 'practice'), 'adaptive');
  assert.equal(hasMixedSectionVariantModes(assignment), true);
});

test('assignment type projection is derived from V5 section roles before assignmentType', () => {
  assert.equal(getStoredAssignmentTypeProjection(conflicting()), 'notesClasswork');
  const practiceOnly = {
    ...conflicting(),
    assignmentType: 'notesClasswork',
    sections: [{ id: 'practice', role: 'practice', title: 'Practice', questions: [question('p2', 'practice', 'Practice')] }],
  };
  assert.equal(getStoredAssignmentTypeProjection(practiceOnly), 'practice');
});

test('section access and DOL discovery use canonical sections instead of flat mirror', () => {
  const assignment = conflicting();
  const classwork = getSectionAccessState({
    assignment,
    activityRole: 'classwork',
    classPeriod: 'Period 1',
    nowValue: new Date('2026-08-27T12:00:00'),
  });
  assert.equal(classwork.enabled, true);
  assert.equal(classwork.isOpen, true);
  assert.deepEqual(resolveDOLQuestionIndices(assignment), [2]);
});

test('flat runtime mirrors remain a fallback only when sections are absent', () => {
  const legacyProjectionOnly = {
    schemaVersion: 5,
    assignmentType: 'practice',
    variantMode: 'personalized',
    sectionVariantModes: { practice: 'shared' },
    questions: [question('flat1', 'practice', 'Flat fallback')],
  };
  assert.deepEqual(getStoredAssignmentQuestions(legacyProjectionOnly).map((item) => item.questionId), ['flat1']);
  assert.equal(getStoredAssignmentVariantMode(legacyProjectionOnly), 'personalized');
  assert.equal(getStoredSectionVariantMode(legacyProjectionOnly, 'practice'), 'shared');
  assert.equal(getStoredAssignmentTypeProjection(legacyProjectionOnly), 'practice');
});

console.log('assignmentRuntimeCanonicalReads.test.mjs: all assertions passed');
