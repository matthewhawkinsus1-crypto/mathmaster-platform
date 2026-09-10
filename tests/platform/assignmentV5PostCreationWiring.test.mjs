import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  PUBLICATION_STRATEGIES,
  planClassroomPublication,
} from '../../src/platform/publishing/publicationPlanner.js';

const app = fs.readFileSync('src/App.jsx', 'utf8');
const preflight = fs.readFileSync('src/components/teacher/LessonPreflightModal.jsx', 'utf8');
const currentContentExport = fs.readFileSync('src/platform/assignments/currentContentPortableAssignment.js', 'utf8');

const assignmentWithCoreSections = () => ({
  schemaVersion: 5,
  assignment: {
    id: 'absolute-value-equations',
    assignmentKey: 'absolute-value-equations',
    courseId: 'algebra2',
    title: 'Solving Absolute Value Equations',
  },
  sections: [
    { id: 'warmup', role: 'warmup', title: "X's Lie, Y's Tell the Truth", questions: [] },
    { id: 'classwork', role: 'classwork', title: 'Guided Solving', questions: [] },
    { id: 'practice', role: 'practice', title: 'Independent Practice', questions: [] },
    { id: 'dol', role: 'dol', title: 'Daily Check', questions: [] },
  ],
});

test('new V5 persistence stores courseId for later reconstruction and export', () => {
  assert.match(app, /courseId:\s*reviewedV5\.assignment\?\.courseId/);
});

test('question editor runs native V5 Preflight before saving changes', () => {
  assert.match(app, /storedAssignmentToV5\(questionEditorAssignment/);
  assert.match(app, /const model = buildAssignmentV5PreflightModel\(candidateV5\)/);
  assert.match(app, /These question edits cannot be saved until MathMaster’s assignment checks are clean/);
  assert.match(app, /canonicalV5PersistencePatch\(model\.assignmentV5\)/);
});

test('duplicate is validated and becomes a true unassigned library copy', () => {
  assert.match(app, /The copy cannot be created until MathMaster’s assignment checks are clean/);
  assert.match(app, /assignedClassIds:\s*\[\]/);
  assert.match(app, /assignedClassPeriods:\s*\[\]/);
  assert.match(app, /dueAt:\s*null/);
  assert.match(app, /rigorVariant:\s*null/);
});

test('library assignment launches canonical V5 Preflight instead of mutating template in place', () => {
  assert.match(app, /openStoredAssignmentForPreflight/);
  assert.match(app, /if \(isLibraryAssignment\(assignment\) && editedClassIds\.length\)/);
  assert.match(app, /The library template is staying unchanged/);
});

test('existing destination variant cannot silently cross Standard or Honors rigor', () => {
  assert.match(app, /const changesDestination = targetGroups\.length > 1/);
  assert.match(app, /Use a destination copy/);
});

test('Export JSON emits marked canonical V5 instead of the retired schemaVersion 2 package', () => {
  assert.match(app, /JSON\.stringify\(buildCurrentContentPortablePackage\(exportJsonAssignment\)/);
  assert.match(currentContentExport, /storedAssignmentToV5\(\{ \.\.\.assignment, sections \}/);
  assert.match(currentContentExport, /mathmasterCanonicalAssignmentV5/);
  assert.doesNotMatch(currentContentExport, /schemaVersion:\s*2/);
  assert.match(app, /portable MathMaster assignment/);
});

test('Assignment V5 split publishing creates one post for every authored core section without a lessonBundle', () => {
  const plan = planClassroomPublication({
    assignmentV5: assignmentWithCoreSections(),
    lessonBundle: null,
    strategy: PUBLICATION_STRATEGIES.SPLIT,
    mainDueDate: '2026-09-08T23:59',
    includeWarmupInClassroom: false,
  });

  assert.equal(plan.plannedPosts.length, 4);
  assert.deepEqual(
    plan.plannedPosts.map((post) => post.title),
    [
      'Warm-Up — Solving Absolute Value Equations',
      'Classwork — Solving Absolute Value Equations',
      'Practice — Solving Absolute Value Equations',
      'DOL — Solving Absolute Value Equations',
    ],
  );
  assert.deepEqual(
    plan.plannedPosts.map((post) => post.description),
    [
      'Complete the Warm-Up in MathMaster.',
      'Complete the Classwork in MathMaster.',
      'Complete the Practice in MathMaster.',
      'Complete the DOL in MathMaster.',
    ],
  );
  assert.deepEqual(
    plan.plannedPosts.map((post) => post.sourceActivityIds),
    [['warmup'], ['classwork'], ['practice'], ['dol']],
  );
  assert.deepEqual(
    plan.plannedPosts.map((post) => post.maxPoints),
    [5, 100, 100, 100],
  );
});

test('split publishing gives quiz and test sections their own posts too', () => {
  const assignmentV5 = assignmentWithCoreSections();
  assignmentV5.sections.push(
    { id: 'quiz', role: 'quiz', title: 'Lesson Quiz', questions: [] },
    { id: 'test', role: 'test', title: 'Unit Test', questions: [] },
  );

  const plan = planClassroomPublication({
    assignmentV5,
    strategy: PUBLICATION_STRATEGIES.SPLIT,
    mainDueDate: '2026-09-08T23:59',
  });

  assert.equal(plan.plannedPosts.length, 6);
  assert.deepEqual(
    plan.plannedPosts.map((post) => post.title),
    [
      'Warm-Up — Solving Absolute Value Equations',
      'Classwork — Solving Absolute Value Equations',
      'Practice — Solving Absolute Value Equations',
      'DOL — Solving Absolute Value Equations',
      'Quiz — Solving Absolute Value Equations',
      'Test — Solving Absolute Value Equations',
    ],
  );
});

test('split publishing preserves a separate homework due date only for Practice', () => {
  const plan = planClassroomPublication({
    assignmentV5: assignmentWithCoreSections(),
    strategy: PUBLICATION_STRATEGIES.SPLIT,
    mainDueDate: '2026-09-08T23:59',
    homeworkDueDate: '2026-09-10T23:59',
  });

  const byRole = Object.fromEntries(plan.plannedPosts.map((post) => [post.activities[0].role, post]));
  assert.equal(byRole.warmup.dueDate, '2026-09-08T23:59');
  assert.equal(byRole.classwork.dueDate, '2026-09-08T23:59');
  assert.equal(byRole.practice.dueDate, '2026-09-10T23:59');
  assert.equal(byRole.dol.dueDate, '2026-09-08T23:59');
});

test('malformed null section entries are ignored instead of crashing publication planning', () => {
  const assignmentV5 = assignmentWithCoreSections();
  assignmentV5.sections = [null, assignmentV5.sections[1]];

  const plan = planClassroomPublication({
    assignmentV5,
    strategy: PUBLICATION_STRATEGIES.SPLIT,
    mainDueDate: '2026-09-08T23:59',
  });

  assert.equal(plan.plannedPosts.length, 1);
  assert.equal(plan.plannedPosts[0].title, 'Classwork — Solving Absolute Value Equations');
  assert.deepEqual(plan.plannedPosts[0].sourceActivityIds, ['classwork']);
});

test('Assignment V5 Review defaults to one Classroom post per section without legacy strategy controls', () => {
  assert.match(preflight, /publicationStrategy:\s*PUBLICATION_STRATEGIES\.SPLIT/);
  assert.match(preflight, /strategy:\s*PUBLICATION_STRATEGIES\.SPLIT/);
  assert.match(preflight, /includeWarmupInClassroom:\s*true/);
  assert.doesNotMatch(preflight, /<option value="hybrid">Hybrid<\/option>/);
  assert.doesNotMatch(preflight, /<option value="bundle">Bundle<\/option>/);
  assert.doesNotMatch(preflight, /Include Warm-Up as a Classroom post/);
  assert.match(preflight, /Each assignment section gets its own Google Classroom post and grade column/);
});

console.log('assignmentV5PostCreationWiring.test.mjs: all assertions passed');
