import assert from 'node:assert/strict';
import { compileAuthoringIntentV5 } from '../../src/platform/contract/authoringIntentV5.js';
import { parseAssignmentBlueprintText, validateAssignmentQuestions } from '../../src/assignmentBlueprint.js';
import { needsMultiRelationWorkspace } from '../../src/algebraRelationFoundation.js';

const v5 = {
  schemaVersion: 5,
  assignment: { title: 'V5 smoke', courseId: 'algebra1', assignmentType: 'notesClasswork' },
  sections: [
    { role: 'classwork', questions: [
      {
        standard: 'A.3C', prompt: 'Graph f(x) = 2x + 1 for x ≥ 0.',
        studentActions: ['constructGraph'],
        function: { family: 'linear', m: 2, b: 1, domain: { min: 0 } },
      },
      {
        standard: 'A.12A', prompt: 'Build the mapping, state domain and range, and decide whether it is a function.',
        studentActions: ['buildMapping','stateDomain','stateRange','classifyFunction'],
        relation: [[-2,3],[1,2],[3,-1]],
      },
      {
        standard: 'A.3C', prompt: 'Build one model from the situation.',
        scenario: 'Water enters an empty container at 5 liters per minute.',
        studentActions: ['identifyQuantities','writeEquation','completeTable','constructGraph','stateDomain','stateRange','classifyContinuity'],
        quantities: [{ id: 'time', label: 'Time' }, { id: 'water', label: 'Water' }],
        correctIndependentId: 'time', correctDependentId: 'water',
        answerModel: { equation: 'W(t)=5t', tableXValues: [0,1,2,3], domain: 't>=0', range: 'W>=0', continuity: 'continuous' },
      },
      {
        standard: 'A.12C', prompt: 'Write both rules.',
        studentActions: ['writeRecursive','writeExplicit'],
        sequence: { kind: 'arithmetic', first: 7, difference: 4 }, displayCount: 5,
      },
      {
        standard: 'A.12D',
        prompt: 'Build the table, plot the discrete sequence, write both rules, and find a₁₂.',
        studentActions: ['buildSequenceTable','plotSequence','analyzeSequence','writeRecursive','writeExplicit','findSequenceTerm'],
        sequence: { kind: 'geometric', first: 3, ratio: 2 },
        displayCount: 5,
        targetN: 12,
      },
      {
        standard: 'A.3C', prompt: 'Compare the graphs.',
        studentActions: ['compareGraphs'],
        candidateGraphs: [
          { id: 'a', label: 'Graph A', function: { family: 'linear', m: 1, b: 0 } },
          { id: 'b', label: 'Graph B', function: { family: 'linear', m: 2, b: 1 } },
        ],
        comparisonFields: [{ id: 'slope', label: 'Which is steeper?', options: ['Graph A','Graph B'], answer: 'Graph B' }],
      },
    ] },
  ],
};

const direct = compileAuthoringIntentV5(v5);
assert.equal(direct.package.schemaVersion, 5);
assert.deepEqual(direct.package.sections[0].questions.map((q) => q.type), ['functionGraph','relationMapping','relationshipModel','sequenceExplorer','sequenceExplorer','graphComparison']);
assert.deepEqual(direct.package.sections[0].questions[2].recipe.ask, ['quantities','equation','table','continuity','graph','domain','range']);
assert.equal(direct.package.sections[0].questions[3].mode, 'ruleBridge');
assert.equal(direct.package.sections[0].questions[4].mode, 'fullBridge');
assert.deepEqual(
  direct.package.sections[0].questions[4].studentActions,
  ['buildSequenceTable','plotSequence','analyzeSequence','writeRecursive','writeExplicit','findSequenceTerm'],
);

const parsed = parseAssignmentBlueprintText(JSON.stringify(v5));
assert.equal(parsed.assignmentV5.schemaVersion, 5, 'V5 remains canonical through runtime validation');
assert.equal(parsed.questions.length, 6);
assert.deepEqual(parsed.questions[1].pairs, [{ x: -2, y: 3 }, { x: 1, y: 2 }, { x: 3, y: -1 }]);
assert.equal(parsed.questions[0].alignments[0].code, 'A.3C');
validateAssignmentQuestions(parsed.questions);
assert.ok(parsed.repairs.some((r) => r.includes('canonical V5')));

const falselyMarkedAuthoringIntent = {
  ...structuredClone(v5),
  portableContract: { kind: 'mathmasterCanonicalAssignmentV5', version: 1 },
};
const recoveredFalseMarker = parseAssignmentBlueprintText(JSON.stringify(falselyMarkedAuthoringIntent));
assert.ok(
  recoveredFalseMarker.questions.every((question) => question.type || question.toolId),
  'a copied canonical marker must not bypass authoring-intent compilation',
);
assert.ok(
  recoveredFalseMarker.repairs.some((entry) => /ignored an invalid canonical portableContract marker/i.test(entry)),
  'the intake reports that it repaired the false canonical marker',
);

const advancedSolverIntent = compileAuthoringIntentV5({
  schemaVersion: 5,
  assignment: { title: 'Advanced solver routing', courseId: 'algebra2' },
  sections: [{
    role: 'classwork',
    questions: [{
      standard: 'A2.6E',
      prompt: 'Solve the absolute-value equation step by step.',
      studentActions: ['solveStepByStep'],
      equation: '|8 + p| = 2p - 3',
    }],
  }],
});
const advancedSolverQuestion = advancedSolverIntent.package.sections[0].questions[0];
assert.equal(advancedSolverQuestion.type, 'stepAlgebra');
assert.equal(advancedSolverQuestion.equation, '|8 + p| = 2p - 3');
assert.equal(needsMultiRelationWorkspace(advancedSolverQuestion), true);

// A solve-and-graph inequality is one composed task: stepAlgebra owns the
// solving workspace, but it must keep the relation and number-line grading data
// needed by the constructInterval action. Dropping either makes the student
// workspace incomplete and makes Preflight falsely report that no number line
// exists.
const compoundInequalityGraphIntent = compileAuthoringIntentV5({
  schemaVersion: 5,
  assignment: { title: 'Compound inequality graph routing', courseId: 'algebra2' },
  sections: [{
    role: 'classwork',
    questions: [{
      standard: 'A.5B',
      prompt: 'Solve 10 ≤ 3y − 2 < 19 as a compound inequality, then graph the intersection on the number line.',
      studentActions: ['solveStepByStep', 'constructInterval'],
      inequality: '10 <= 3y - 2 < 19',
      intervals: [{ min: 4, max: 7, minClosed: true, maxClosed: false }],
      intervalNumberLine: {
        intervals: [{ min: 4, max: 7, minClosed: true, maxClosed: false }],
      },
    }],
  }],
});
const compoundInequalityGraphQuestion = compoundInequalityGraphIntent.package.sections[0].questions[0];
assert.equal(compoundInequalityGraphQuestion.type, 'stepAlgebra');
assert.equal(compoundInequalityGraphQuestion.equation, '10 <= 3y - 2 < 19');
assert.equal(compoundInequalityGraphQuestion.inequalityText, '10 <= 3y - 2 < 19');
assert.deepEqual(compoundInequalityGraphQuestion.intervals, [
  { min: 4, max: 7, minClosed: true, maxClosed: false },
]);
assert.deepEqual(compoundInequalityGraphQuestion.intervalNumberLine, {
  intervals: [{ min: 4, max: 7, minClosed: true, maxClosed: false }],
});
assert.equal(needsMultiRelationWorkspace(compoundInequalityGraphQuestion), true);


const controlledSortIntent = compileAuthoringIntentV5({
  schemaVersion: 5,
  assignment: { title: 'Controlled correlation sort', courseId: 'algebra1' },
  sections: [{
    role: 'warmup',
    questions: [{
      standard: 'A.4A',
      prompt: 'Sort the scatterplots by correlation direction.',
      studentActions: ['sortIntoCategories'],
      categories: [
        { id: 'positive', label: 'Positive correlation' },
        { id: 'negative', label: 'Negative correlation' },
        { id: 'none', label: 'No correlation' },
      ],
      items: [
        { id: 'A', points: [[1,1],[2,2],[3,3]] },
        { id: 'B', points: [[1,3],[2,2],[3,1]] },
        { id: 'C', points: [[1,2],[2,1],[3,2]] },
      ],
      validSchemes: [{
        id: 'direction',
        groups: [
          { id: 'positive', itemIds: ['A'] },
          { id: 'negative', itemIds: ['B'] },
          { id: 'none', itemIds: ['C'] },
        ],
      }],
    }],
  }],
});
const controlledSortQuestion = controlledSortIntent.package.sections[0].questions[0];
assert.equal(controlledSortQuestion.type, 'openSortBoard');
assert.equal(controlledSortQuestion.mode, 'controlled');
assert.deepEqual(controlledSortQuestion.categories.map((category) => category.id), ['positive','negative','none']);
assert.equal(controlledSortQuestion.requireGroupNames, false);
assert.equal(controlledSortQuestion.requireRationale, false);

// PR 303 follow-up: the systemsWorkspace compiler case only preserved
// `mode`, `system`, `inequalities`, `matrix`, and `linearQuadratic`, so the
// PR 303 student-build inequality workflow (authored `sourceConstraints` ->
// interactive rewrite -> hidden canonical `expectedConstraints`) and its
// companion reasoning/viewport/modeling config were silently dropped by V5
// authoring compilation even though the runtime tool fully supports them.
// A round trip through the actual authoring text parser (not just the
// in-process compiler) must still carry every one of those fields, with
// `sourceConstraints` and `expectedConstraints` kept as separate objects —
// authoring compilation must never collapse the student-facing form into
// the hidden canonical grading form.
const systemsWorkspaceRoundTrip = parseAssignmentBlueprintText(JSON.stringify({
  schemaVersion: 5,
  assignment: { title: 'PR 303 systems workspace round trip', courseId: 'algebra1' },
  sections: [{
    role: 'practice',
    questions: [{
      standard: 'A.3D',
      prompt: 'Rewrite each inequality, then graph the system.',
      studentActions: ['solveInequalitySystem'],
      mode: 'inequalities',
      sourceConstraints: ['x - y >= -1', '3x - y <= 4'],
      expectedConstraints: [
        { A: 1, B: -1, C: 1, relation: '>=' },
        { A: 3, B: -1, C: -4, relation: '<=' },
      ],
      studentBuild: { rewrite: true, boundary: true, lineStyle: true, shading: true },
      reasoning: { boundaryProbe: true },
      testPoint: { x: 0, y: 0 },
      allowStudentTestPoint: true,
      askClassification: true,
      askVertices: true,
      graph: { xMin: -5, xMax: 5, yMin: -6, yMax: 6 },
    }],
  }],
}));
const systemsWorkspaceQuestion = systemsWorkspaceRoundTrip.questions[0];
assert.equal(systemsWorkspaceQuestion.type, 'systemsWorkspace');
assert.equal(systemsWorkspaceQuestion.mode, 'inequalities');
assert.deepEqual(systemsWorkspaceQuestion.sourceConstraints, ['x - y >= -1', '3x - y <= 4']);
assert.deepEqual(systemsWorkspaceQuestion.expectedConstraints, [
  { A: 1, B: -1, C: 1, relation: '>=' },
  { A: 3, B: -1, C: -4, relation: '<=' },
]);
assert.notDeepEqual(systemsWorkspaceQuestion.sourceConstraints, systemsWorkspaceQuestion.expectedConstraints,
  'sourceConstraints (student-facing) must never be replaced by the hidden canonical expectedConstraints');
assert.equal(systemsWorkspaceQuestion.studentBuild.rewrite, true);
assert.equal(systemsWorkspaceQuestion.studentBuild.boundary, true);
assert.equal(systemsWorkspaceQuestion.studentBuild.lineStyle, true);
assert.equal(systemsWorkspaceQuestion.studentBuild.shading, true);
assert.deepEqual(systemsWorkspaceQuestion.reasoning, { boundaryProbe: true });
assert.deepEqual(systemsWorkspaceQuestion.testPoint, { x: 0, y: 0 });
assert.equal(systemsWorkspaceQuestion.allowStudentTestPoint, true);
assert.equal(systemsWorkspaceQuestion.askClassification, true);
assert.equal(systemsWorkspaceQuestion.askVertices, true);
assert.deepEqual(systemsWorkspaceQuestion.graph, { xMin: -5, xMax: 5, yMin: -6, yMax: 6 });
validateAssignmentQuestions(systemsWorkspaceRoundTrip.questions);

// A modeling-style question (student derives the constraints from a scenario
// rather than rewriting authored inequalities) must survive the same way:
// `modeling.variables` and `modeling.expectedConstraints` are the hidden
// grading contract for that mode and must not be dropped either.
const systemsWorkspaceModelingRoundTrip = parseAssignmentBlueprintText(JSON.stringify({
  schemaVersion: 5,
  assignment: { title: 'PR 303 systems workspace modeling round trip', courseId: 'algebra1' },
  sections: [{
    role: 'practice',
    questions: [{
      standard: 'A.3D',
      prompt: 'Model the constraints on tickets sold, then graph the feasible region.',
      studentActions: ['solveInequalitySystem'],
      mode: 'inequalities',
      modeling: {
        variables: [{ symbol: 'x' }, { symbol: 'y' }],
        expectedConstraints: [
          { A: 1, B: 1, C: -10, relation: '<=' },
        ],
      },
      studentBuild: { rewrite: true },
    }],
  }],
}));
const systemsWorkspaceModelingQuestion = systemsWorkspaceModelingRoundTrip.questions[0];
assert.equal(systemsWorkspaceModelingQuestion.type, 'systemsWorkspace');
assert.deepEqual(systemsWorkspaceModelingQuestion.modeling.variables, [{ symbol: 'x' }, { symbol: 'y' }]);
assert.deepEqual(systemsWorkspaceModelingQuestion.modeling.expectedConstraints, [{ A: 1, B: 1, C: -10, relation: '<=' }]);
validateAssignmentQuestions(systemsWorkspaceModelingRoundTrip.questions);

// Older Systems Workspace JSON that only ever used `inequalities` or
// `system` (pre-PR-303) must keep compiling exactly as before: adding the
// new field allowlist must not disturb the legacy shape.
const legacySystemsWorkspace = compileAuthoringIntentV5({
  schemaVersion: 5,
  assignment: { title: 'Legacy systemsWorkspace compatibility', courseId: 'algebra1' },
  sections: [{
    role: 'classwork',
    questions: [{
      standard: 'A.3C',
      prompt: 'Graph the inequalities and shade the solution region.',
      studentActions: ['solveInequalitySystem'],
      inequalities: [{ m: 1, b: 1, relation: '>=' }, { m: -0.5, b: 6, relation: '<=' }],
    }],
  }],
});
const legacySystemsWorkspaceQuestion = legacySystemsWorkspace.package.sections[0].questions[0];
assert.equal(legacySystemsWorkspaceQuestion.type, 'systemsWorkspace');
assert.equal(legacySystemsWorkspaceQuestion.mode, 'inequalities');
assert.deepEqual(legacySystemsWorkspaceQuestion.inequalities, [{ m: 1, b: 1, relation: '>=' }, { m: -0.5, b: 6, relation: '<=' }]);
assert.equal(legacySystemsWorkspaceQuestion.sourceConstraints, undefined);
assert.equal(legacySystemsWorkspaceQuestion.expectedConstraints, undefined);

console.log('authoringIntentV5.test.mjs: all assertions passed');
