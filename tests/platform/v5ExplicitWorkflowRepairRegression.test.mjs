import test from 'node:test';
import assert from 'node:assert/strict';

import { compileAuthoringIntentV5 } from '../../src/platform/contract/authoringIntentV5.js';
import { expandRecipe } from '../../src/platform/workflow/questionRecipes.js';
import { stageBatchQuestionRepairImport } from '../../src/platform/preflight/questionRepairImport.js';

const explicitGraphChoiceAssignment = {
  schemaVersion: 5,
  assignment: {
    assignmentId: 'district-dol-graph-choice-regression',
    title: 'District DOL graph-choice regression',
    courseId: 'algebra1',
    assignmentType: 'dol',
  },
  sections: [{
    id: 'dol',
    role: 'dol',
    title: 'DOL',
    questions: [{
      questionId: 'f243d23c-2959-46eb-a862-8a0546ce5954',
      type: 'graphChoicePreview',
      standard: 'A.7A',
      prompt: 'Use the calculator-style graph preview to answer both parts.',
      studentActions: ['readGraph', 'identifyVertex', 'identifyAxisOfSymmetry'],
      workflow: [
        {
          id: 'choice',
          kind: 'multipleChoice',
          prompt: 'What is the vertex?',
          choices: [
            { id: 'w3a', label: '(2, -4)' },
            { id: 'w3b', label: '(-2, -4)' },
            { id: 'w3c', label: '(2, 4)' },
            { id: 'w3d', label: '(-2, 4)' },
          ],
          previewOnGraph: {
            graph: { xMin: -8, xMax: 8, yMin: -8, yMax: 8, model: '1*(x - 2)^2 - 4' },
            selectedPoint: { x: 2, y: -4 },
          },
        },
        {
          id: 'axis',
          kind: 'multipleChoice',
          prompt: 'What is the axis of symmetry?',
          choices: [
            { id: 'w3e', label: 'x = 2' },
            { id: 'w3f', label: 'x = -2' },
            { id: 'w3g', label: 'y = 2' },
            { id: 'w3h', label: 'y = -4' },
          ],
          previewOnGraph: {
            graph: { xMin: -8, xMax: 8, yMin: -8, yMax: 8, model: '1*(x - 2)^2 - 4' },
            selectedLine: { axis: 'x', value: 2 },
          },
        },
      ],
      grading: { choice: 'w3a', axis: 'w3e' },
    }],
  }],
};

test('V5 compiler preserves a valid explicit two-stage graph-choice workflow and grading', () => {
  const compiled = compileAuthoringIntentV5(explicitGraphChoiceAssignment);
  const question = compiled.package.sections[0].questions[0];

  assert.equal(question.type, 'graphChoicePreview');
  assert.deepEqual(question.workflow.map((stage) => stage.id), ['choice', 'axis']);
  assert.deepEqual(question.workflow.map((stage) => stage.kind), ['multipleChoice', 'multipleChoice']);
  assert.equal(question.workflow[0].previewOnGraph.graph.model, '1*(x - 2)^2 - 4');
  assert.equal(question.workflow[1].previewOnGraph.selectedLine.value, 2);
  assert.deepEqual(question.grading, { choice: 'w3a', axis: 'w3e' });
});

test('functionModeling continuity/domain asks do not inherit the recipe default graph stage', () => {
  const continuityDomain = expandRecipe({
    type: 'relationshipModel',
    prompt: 'Classify the relationship and state its domain.',
    continuity: 'discrete',
    correctDomain: '{1, 2, 3, 4}',
    recipe: { name: 'functionModeling', ask: ['continuity', 'domain'] },
  });
  const continuityDomainRange = expandRecipe({
    type: 'relationshipModel',
    prompt: 'Classify the relationship and state its domain and range.',
    continuity: 'discrete',
    correctDomain: '{1, 2, 3, 4}',
    correctRange: '{2, 4, 6, 8}',
    recipe: { name: 'functionModeling', ask: ['continuity', 'domain', 'range'] },
  });

  const firstIds = continuityDomain.workflow.map((stage) => stage.id);
  const secondIds = continuityDomainRange.workflow.map((stage) => stage.id);
  assert.ok(firstIds.includes('continuity'));
  assert.ok(firstIds.some((id) => id.startsWith('domain')));
  assert.ok(!firstIds.includes('graph'));
  assert.ok(secondIds.includes('continuity'));
  assert.ok(secondIds.some((id) => id.startsWith('domain')));
  assert.ok(secondIds.some((id) => id.startsWith('range')));
  assert.ok(!secondIds.includes('graph'));
  assert.ok(continuityDomain.workflow.every((stage) => stage.kind !== 'graphConstruction' && stage.kind !== 'functionGraph' && stage.kind !== 'coordinatePlot'));
  assert.ok(continuityDomainRange.workflow.every((stage) => stage.kind !== 'graphConstruction' && stage.kind !== 'functionGraph' && stage.kind !== 'coordinatePlot'));
});

const repairQuestion = (questionId, role) => ({
  questionId,
  type: 'algebra',
  prompt: 'Solve x + 2 = 5.',
  answer: '3',
  activityRole: role,
  alignments: [
    { framework: 'teks', code: 'A.5A', role: 'primary', evidenceLevel: 'assessed' },
  ],
});

const repairAssignment = {
  schemaVersion: 5,
  assignment: {
    assignmentId: 'repair-report-only-regression',
    title: 'Repair report-only regression',
    courseId: 'algebra1',
    instructionalPurpose: 'lesson',
    gradingPurpose: 'classwork',
  },
  variantPolicy: {
    mode: 'personalized',
    sectionModes: { classwork: 'shared', practice: 'personalized', dol: 'shared' },
  },
  sections: [
    { id: 'cw', role: 'classwork', title: 'Classwork', questions: [repairQuestion('q-cw-1', 'classwork')] },
    { id: 'practice', role: 'practice', title: 'Practice', questions: [repairQuestion('q-pr-1', 'practice')] },
    { id: 'dol', role: 'dol', title: 'DOL', questions: [repairQuestion('q-dol-1', 'dol')] },
  ],
};

test('a batch response with zero replacements and platform issues is classified as report-only, not as a failed replacement', () => {
  const platformIssue = {
    questionId: 'q-cw-1',
    classification: 'platformIssue',
    reason: 'The authored question is valid; the platform renderer is adding an interaction that was not requested.',
    suspectedComponent: 'functionModeling',
  };
  const staged = stageBatchQuestionRepairImport({
    assignmentV5: repairAssignment,
    parsedResponse: {
      repairPacketVersion: 1,
      assignmentId: 'repair-report-only-regression',
      baseRevision: 4,
      replacements: [],
      platformIssues: [platformIssue],
      unclearIssues: [],
    },
    baseRevision: 4,
    currentRevision: 4,
    teacherReviewContext: { flags: [] },
  });

  assert.equal(staged.questionResults.length, 0);
  assert.equal(staged.canCommit, false, 'a report-only packet must never mutate the assignment');
  assert.equal(staged.responseKind, 'reportOnly');
  assert.equal(staged.platformIssues.length, 1);
  assert.deepEqual(staged.platformIssues[0], platformIssue);
  assert.equal(staged.validation.newBlockingDiagnostics.length, 0,
    'reporting a platform issue must not manufacture a new blocking assignment diagnostic');
});
