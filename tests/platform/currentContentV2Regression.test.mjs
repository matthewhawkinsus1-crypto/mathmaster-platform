import test from 'node:test';
import assert from 'node:assert/strict';

import {
  projectCurrentAssignmentContent,
  resolveCurrentContentStorageIndex,
} from '../../src/platform/assignments/currentContentProjection.js';
import { buildCurrentContentPortablePackage } from '../../src/platform/assignments/currentContentPortableAssignment.js';
import { getCurrentContentQuestionIndices, resolveDOLQuestionIndices } from '../../src/assignmentLifecycle.js';
import { splitGradesBySection } from '../../src/platform/teacher/gradeEvidence.js';

const makeQuestion = (questionId, role, extra = {}) => ({
  questionId,
  type: 'algebra',
  prompt: questionId,
  activityRole: role,
  expected: '1',
  accepted: ['1'],
  ...extra,
});

const liveSafeV2Fixture = () => ({
  id: 'least-squares-live-v2',
  schemaVersion: 5,
  title: 'Least Squares Regression',
  courseId: 'algebra1',
  contentLineage: {
    familyId: 'least-squares-family',
    version: 2,
    label: 'V2',
    releaseStatus: 'current',
    supersedesVersion: 1,
  },
  variantPolicy: { mode: 'shared', sectionModes: {} },
  sections: [
    {
      id: 'warmup',
      role: 'warmup',
      title: 'Warm-Up',
      questions: [
        makeQuestion('w1', 'warmup'),
        makeQuestion('old-w2', 'warmup', { teacherExcluded: true }),
        makeQuestion('retired-w3', 'warmup', { teacherExcluded: true }),
        makeQuestion('w4', 'warmup'),
      ],
    },
    {
      id: 'classwork',
      role: 'classwork',
      title: 'Classwork',
      questions: [
        makeQuestion('c1', 'classwork'),
        makeQuestion('old-c2', 'classwork', { teacherExcluded: true }),
        makeQuestion('c3', 'classwork'),
        makeQuestion('c4', 'classwork'),
        makeQuestion('c5', 'classwork'),
        makeQuestion('c6', 'classwork'),
      ],
    },
    {
      id: 'practice',
      role: 'practice',
      title: 'Practice',
      questions: [
        makeQuestion('p1', 'practice'),
        makeQuestion('p2', 'practice'),
        makeQuestion('old-p3', 'practice', { teacherExcluded: true }),
        makeQuestion('p4', 'practice'),
        makeQuestion('p5', 'practice'),
        makeQuestion('p6', 'practice'),
        makeQuestion('p7', 'practice'),
        makeQuestion('p8', 'practice'),
      ],
    },
    {
      id: 'dol',
      role: 'dol',
      title: 'DOL',
      questions: [
        makeQuestion('d1', 'dol'),
        makeQuestion('old-d2', 'dol', { teacherExcluded: true }),
        makeQuestion('d3', 'dol'),
      ],
    },
    {
      id: 'content-v2-corrections-warmup',
      role: 'warmup',
      title: 'Warmup Corrections · Content V2',
      questions: [
        makeQuestion('new-w2', 'warmup', {
          supersedesQuestionId: 'old-w2',
          introducedInContentVersion: 2,
        }),
      ],
    },
    {
      id: 'content-v2-corrections-classwork',
      role: 'classwork',
      title: 'Classwork Corrections · Content V2',
      questions: [
        makeQuestion('new-c2', 'classwork', {
          supersedesQuestionId: 'old-c2',
          introducedInContentVersion: 2,
        }),
      ],
    },
    {
      id: 'content-v2-corrections-practice',
      role: 'practice',
      title: 'Practice Corrections · Content V2',
      questions: [
        makeQuestion('new-p3', 'practice', {
          supersedesQuestionId: 'old-p3',
          introducedInContentVersion: 2,
        }),
      ],
    },
    {
      id: 'content-v2-corrections-dol',
      role: 'dol',
      title: 'DOL Corrections · Content V2',
      questions: [
        makeQuestion('new-d2', 'dol', {
          supersedesQuestionId: 'old-d2',
          introducedInContentVersion: 2,
        }),
      ],
    },
  ],
});

test('least-squares live-safe V2 projects eight storage sections into four logical lesson sections', () => {
  const assignment = liveSafeV2Fixture();
  const before = structuredClone(assignment);
  const projection = projectCurrentAssignmentContent(assignment);

  assert.deepEqual(assignment, before, 'projection must not mutate historical storage');
  assert.equal(assignment.sections.length, 8);
  assert.deepEqual(
    projection.logicalSections.map((section) => section.role),
    ['warmup', 'classwork', 'practice', 'dol'],
  );

  assert.deepEqual(
    projection.logicalSections[0].entries.map((entry) => [entry.questionId, entry.storageIndex]),
    [['w1', 0], ['new-w2', 21], ['w4', 3]],
  );
  assert.deepEqual(
    projection.logicalSections[1].entries.map((entry) => [entry.questionId, entry.storageIndex]),
    [['c1', 4], ['new-c2', 22], ['c3', 6], ['c4', 7], ['c5', 8], ['c6', 9]],
  );
  assert.deepEqual(
    projection.logicalSections[2].entries.map((entry) => [entry.questionId, entry.storageIndex]),
    [['p1', 10], ['p2', 11], ['new-p3', 23], ['p4', 13], ['p5', 14], ['p6', 15], ['p7', 16], ['p8', 17]],
  );
  assert.deepEqual(
    projection.logicalSections[3].entries.map((entry) => [entry.questionId, entry.storageIndex]),
    [['d1', 18], ['new-d2', 24], ['d3', 20]],
  );

  assert.equal(projection.entries.some((entry) => entry.questionId === 'retired-w3'), false);
  assert.equal(projection.entries.length, 20);
  assert.equal(resolveCurrentContentStorageIndex(assignment, 1), 21);
  assert.equal(resolveCurrentContentStorageIndex(assignment, 5), 22);
  assert.equal(resolveCurrentContentStorageIndex(assignment, 12), 23);
  assert.equal(resolveCurrentContentStorageIndex(assignment, 19), 24);
});

test('least-squares live-safe V2 lifecycle and grade projection use replacement storage indices', () => {
  const assignment = liveSafeV2Fixture();

  assert.deepEqual(getCurrentContentQuestionIndices(assignment), [
    0, 21, 3,
    4, 22, 6, 7, 8, 9,
    10, 11, 23, 13, 14, 15, 16, 17,
    18, 24, 20,
  ]);
  assert.deepEqual(resolveDOLQuestionIndices(assignment), [18, 24, 20]);

  const tracker = {
    1: { status: 'correct', bestPartialCredit: 100 },
    5: { status: 'correct', bestPartialCredit: 100 },
    12: { status: 'correct', bestPartialCredit: 100 },
    19: { status: 'correct', bestPartialCredit: 100 },
    21: { status: 'attempted', bestPartialCredit: 60 },
    22: { status: 'attempted', bestPartialCredit: 70 },
    23: { status: 'attempted', bestPartialCredit: 80 },
    24: { status: 'attempted', bestPartialCredit: 90 },
  };

  const sectionGrades = splitGradesBySection({ assignment, tracker });
  assert.deepEqual(
    Object.fromEntries(Object.entries(sectionGrades).map(([role, grade]) => [role, grade.total])),
    { warmup: 3, classwork: 6, practice: 8, dol: 3 },
  );
  assert.equal(sectionGrades.warmup.attempted, 1);
  assert.equal(sectionGrades.classwork.attempted, 1);
  assert.equal(sectionGrades.practice.attempted, 1);
  assert.equal(sectionGrades.dol.attempted, 1);
});

test('least-squares live-safe V2 exports only clean current content', () => {
  const assignment = liveSafeV2Fixture();
  const exported = buildCurrentContentPortablePackage(assignment);

  assert.equal(exported.schemaVersion, 5);
  assert.deepEqual(exported.sections.map((section) => section.role), [
    'warmup', 'classwork', 'practice', 'dol',
  ]);
  assert.deepEqual(
    exported.sections.map((section) => section.questions.map((question) => question.questionId)),
    [
      ['w1', 'new-w2', 'w4'],
      ['c1', 'new-c2', 'c3', 'c4', 'c5', 'c6'],
      ['p1', 'p2', 'new-p3', 'p4', 'p5', 'p6', 'p7', 'p8'],
      ['d1', 'new-d2', 'd3'],
    ],
  );

  const serialized = JSON.stringify(exported);
  assert.doesNotMatch(serialized, /teacherExcluded/);
  assert.doesNotMatch(serialized, /supersedesQuestionId/);
  assert.doesNotMatch(serialized, /introducedInContentVersion/);
  assert.doesNotMatch(serialized, /content-v2-corrections/);
  assert.deepEqual(exported.portableContract, {
    kind: 'mathmasterCanonicalAssignmentV5',
    version: 1,
    contentProjection: 'current',
    sourceContentVersion: 2,
  });
});
