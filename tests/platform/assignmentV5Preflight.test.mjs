import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAssignmentV5PreflightModel } from '../../src/platform/preflight/assignmentV5PreflightModel.js';
import { canonicalV5PersistencePatch } from '../../src/platform/contract/storedAssignmentV5.js';
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

test('Preflight auto-repairs known coordinate-pair nested arrays before Firestore save', () => {
  const candidate = structuredClone(assignmentV5);
  candidate.sections[0].questions[0].xIntercepts = [[3, 0], [-1, 0]];
  candidate.sections[0].questions[0].figures = [
    { id: 'graph-a', points: [[-3, 2], [1, 3]] },
  ];

  const model = buildAssignmentV5PreflightModel(candidate);
  const repaired = model.assignmentV5.sections[0].questions[0];

  assert.deepEqual(repaired.xIntercepts, [
    { x: 3, y: 0 },
    { x: -1, y: 0 },
  ]);
  assert.deepEqual(repaired.figures[0].points, [
    { x: -3, y: 2 },
    { x: 1, y: 3 },
  ]);
  assert.ok(model.warnings.some((warning) => /auto-?repaired.*coordinate/i.test(warning)));
  assert.equal(model.errors.some((error) => /Firestore.*array directly inside another array/i.test(error)), false);
});

test('Preflight accepts raw V5 scatterplot-correlation intent before renderer compilation', () => {
  const candidate = structuredClone(assignmentV5);
  candidate.sections[0].questions = [{
    prompt: 'Read the scatterplot below, enter the ordered pairs in the x₁/y₁ table, run linear regression, and interpret r.',
    standard: 'A.4A',
    alignments: [{ framework: 'teks', code: 'A.4A', role: 'primary', evidenceLevel: 'assessed' }],
    studentActions: ['readGraph', 'calculateCorrelation'],
    sourceMode: 'scatterplot',
    sourceData: [[1, 2], [2, 4], [3, 5], [4, 8]],
    sourceGraphBounds: { xMin: 0, xMax: 5, yMin: 0, yMax: 9 },
    requireInterpretation: true,
  }];

  const model = buildAssignmentV5PreflightModel(candidate);
  assert.equal(
    model.errors.some((error) => /refers to a graph in its prompt, but the question contains none/.test(error)),
    false,
    model.errors.join('\n'),
  );
  assert.deepEqual(model.assignmentV5.sections[0].questions[0].sourceData, [
    { x: 1, y: 2 },
    { x: 2, y: 4 },
    { x: 3, y: 5 },
    { x: 4, y: 8 },
  ]);
});

test('Preflight blocks missing renderer contracts before the teacher presses Save', () => {
  const candidate = structuredClone(assignmentV5);
  candidate.sections[0].questions[0] = {
    prompt: 'Sort the scatterplots by direction.',
    studentActions: ['sortIntoCategories'],
    activityRole: 'classwork',
    alignments: [{ framework: 'teks', code: 'A.4A', role: 'primary', evidenceLevel: 'assessed' }],
  };

  const model = buildAssignmentV5PreflightModel(candidate);
  assert.equal(model.isValid, false);
  assert.ok(
    model.errors.some((error) => /Question 1 is missing a type\/toolId/.test(error)),
    model.errors.join('\n'),
  );
  assert.ok(
    model.diagnostics.some((entry) => entry.source === 'runtimeContract' && /missing a type\/toolId/.test(entry.message)),
    'the Check step should own the same runtime-contract blocker as creation',
  );
});

test('Preflight blocks unknown nested arrays and reports the path before Save to Library', () => {
  const candidate = structuredClone(assignmentV5);
  candidate.sections[0].questions[0].xIntercepts = [[3, 0, 99]];

  const model = buildAssignmentV5PreflightModel(candidate);

  assert.equal(model.isValid, false);
  assert.ok(model.errors.some((error) => (
    /Firestore cannot save an array directly inside another array/i.test(error)
    && error.includes('$.sections[0].questions[0].xIntercepts[0]')
  )));
});

test('canonical V5 persistence also repairs known coordinate pairs as a save-path safety net', () => {
  const candidate = structuredClone(assignmentV5);
  candidate.sections[0].questions[0].xIntercepts = [[4, 0]];
  candidate.sections[0].questions[0].figures = [
    { id: 'graph-a', points: [[2, -4]] },
  ];

  const patch = canonicalV5PersistencePatch(candidate);

  assert.deepEqual(patch.sections[0].questions[0].xIntercepts, [{ x: 4, y: 0 }]);
  assert.deepEqual(patch.sections[0].questions[0].figures[0].points, [{ x: 2, y: -4 }]);
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
