import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

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
import { resolveQuestionActivityRole } from '../../src/platform/policies/activityPolicies.js';

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
  title: 'Canonical runtime test',
  courseId: 'algebra1',

  // Deliberately contradictory retired mirrors. None may control behavior.
  assignmentType: 'test',
  variantMode: 'personalized',
  sectionVariantModes: { classwork: 'adaptive', practice: 'shared' },
  questions: [
    { ...question('stale1', 'test', 'STALE FLAT MIRROR', 'A2.4F'), teacherExcluded: true },
  ],

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
});

test('runtime question reads use sections even when a stale flat mirror disagrees', () => {
  const assignment = conflicting();
  const questions = getStoredAssignmentQuestions(assignment);
  assert.deepEqual(questions.map((item) => item.questionId), ['cw1', 'p1', 'd1']);
  assert.deepEqual(getIncludedQuestionIndices(assignment), [0, 1, 2]);
});

test('stored reconstruction and course inference use canonical section evidence', () => {
  const assignment = conflicting();
  assignment.courseId = null;
  assignment.courseProfile = { course: null };
  assert.equal(inferStoredAssignmentCourseId(assignment), 'algebra1');

  const v5 = storedAssignmentToV5(assignment);
  assert.deepEqual(
    v5.sections.flatMap((section) => section.questions.map((item) => item.questionId)),
    ['cw1', 'p1', 'd1'],
  );
  assert.equal(JSON.stringify(v5).includes('STALE FLAT MIRROR'), false);
});

test('variantPolicy outranks retired variant mirrors with no compatibility fallback', () => {
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

test('assignment type and activity fallback are derived from V5 section roles', () => {
  const assignment = conflicting();
  assert.equal(getStoredAssignmentTypeProjection(assignment), 'notesClasswork');

  const role = resolveQuestionActivityRole({
    question: {},
    assignment: {
      ...assignment,
      sections: [{
        id: 'quiz',
        role: 'quiz',
        title: 'Quiz',
        questions: [question('qz1', 'quiz', 'Quiz')],
      }],
      assignmentType: 'test',
    },
  });
  assert.equal(role, 'quiz');
});

test('section access and DOL discovery ignore contradictory flat questions', () => {
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

test('flat-only V5 records are not revived as assignments', () => {
  const flatOnly = {
    schemaVersion: 5,
    title: 'Retired shape',
    courseId: 'algebra1',
    assignmentType: 'test',
    variantMode: 'shared',
    sectionVariantModes: { practice: 'adaptive' },
    questions: [question('legacy', 'test', 'Legacy')],
  };
  assert.deepEqual(getStoredAssignmentQuestions(flatOnly), []);
  assert.equal(getStoredAssignmentVariantMode(flatOnly), 'personalized');
  assert.deepEqual(getStoredSectionVariantModes(flatOnly), {});
  assert.equal(getStoredAssignmentTypeProjection(flatOnly), 'practice');
});

test('student dashboard no longer reads flat questions or assignmentType directly', () => {
  const source = readFileSync(new URL('../../src/studentDashboardModel.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /assignment\.questions|resumeAssignment\?\.questions/);
  assert.doesNotMatch(source, /assignment\.assignmentType/);
  assert.match(source, /getStoredAssignmentQuestions/);
  assert.match(source, /getStoredAssignmentTypeProjection/);
});

console.log('assignmentRuntimeCanonicalReads.test.mjs: all assertions passed');
