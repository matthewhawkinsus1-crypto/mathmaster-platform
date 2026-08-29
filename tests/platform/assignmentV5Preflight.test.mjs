import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAssignmentV5PreflightModel } from '../../src/platform/preflight/assignmentV5PreflightModel.js';
import { planClassroomPublication } from '../../src/platform/publishing/publicationPlanner.js';

const question = (prompt, role) => ({
  type: 'algebra',
  prompt,
  answer: '3',
  activityRole: role,
  alignments: [
    { framework: 'teks', code: 'A.5A', role: 'primary', evidenceLevel: 'assessed' },
  ],
});

const assignmentV5 = {
  schemaVersion: 5,
  assignment: {
    title: 'Native V5 Preflight',
    courseId: 'algebra1',
    instructionalPurpose: 'lesson',
    gradingPurpose: 'classwork',
  },
  variantPolicy: {
    mode: 'personalized',
    sectionModes: { classwork: 'shared', practice: 'personalized', dol: 'shared' },
  },
  sections: [
    { id: 'cw', role: 'classwork', title: 'Classwork', questions: [question('Solve x + 2 = 5.', 'classwork')] },
    { id: 'practice', role: 'practice', title: 'Practice', questions: [question('Solve x + 4 = 7.', 'practice')] },
    { id: 'dol', role: 'dol', title: 'DOL', questions: [question('Solve x + 1 = 4.', 'dol')] },
  ],
};

test('native Preflight consumes canonical V5 sections without a Bundle V3 conversion', () => {
  const model = buildAssignmentV5PreflightModel(assignmentV5, { titleOverride: 'Teacher Edited Title' });
  assert.equal(model.assignmentV5.schemaVersion, 5);
  assert.equal(model.assignmentV5.assignment.title, 'Teacher Edited Title');
  assert.deepEqual(model.sections.map((section) => section.id), ['cw', 'practice', 'dol']);
  assert.deepEqual(model.sections.map((section) => section.role), ['classwork', 'practice', 'dol']);
  assert.equal(model.questions.length, 3);
  assert.equal(model.questions[1].sectionId, 'practice');
  assert.equal(model.questions[1].activityRole, 'practice');
  assert.equal(model.sections[0].policy.attemptsAllowed > 0, true);
  assert.equal(model.isValid, true, model.errors.join('\n'));
});

test('native Preflight blocks structurally invalid V5 instead of normalizing it into a legacy bundle', () => {
  const model = buildAssignmentV5PreflightModel({
    schemaVersion: 5,
    assignment: { title: 'Broken', courseId: 'algebra1' },
    sections: [],
  });
  assert.equal(model.isValid, false);
  assert.ok(model.errors.some((error) => /non-empty sections array|no questions/i.test(error)));
});

test('Classroom publication planning reads V5 sections directly', () => {
  const plan = planClassroomPublication({
    assignmentV5,
    strategy: 'hybrid',
    mainDueDate: '2026-08-28T20:00:00.000Z',
  });
  assert.equal(plan.sourceKind, 'assignmentV5');
  assert.ok(plan.plannedPosts.length >= 2);
  const ids = plan.plannedPosts.flatMap((post) => post.sourceActivityIds || []);
  assert.ok(ids.includes('cw'));
  assert.ok(ids.includes('practice'));
  assert.ok(ids.includes('dol'));
});

console.log('assignmentV5Preflight.test.mjs: all assertions passed');
