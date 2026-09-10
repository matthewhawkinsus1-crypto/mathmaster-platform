import test from 'node:test';
import assert from 'node:assert/strict';

let runtimeRepair = null;
let importError = null;
try {
  runtimeRepair = await import('../../src/platform/assignments/assignmentRuntimeRepair.js');
} catch (error) {
  importError = error;
}

const requireRuntimeRepair = () => {
  assert.ok(
    runtimeRepair,
    `assignmentRuntimeRepair.js must exist before these contracts can pass: ${importError?.message || 'module unavailable'}`,
  );
  return runtimeRepair;
};

const districtContinuityDomain = () => ({
  questionId: '0d24f506-f272-4004-9a1e-5b4986492b51',
  type: 'relationshipModel',
  prompt: 'A school bus can carry at most 48 students. Classify the relationship and state a reasonable domain.',
  studentActions: ['classifyContinuity', 'stateDomain'],
  continuity: 'discrete',
  correctDomain: '{0, 1, 2, ..., 48}',
  recipe: { name: 'functionModeling', ask: ['continuity', 'domain'] },
});

const districtGraphCharacteristics = () => ({
  questionId: '278da14e-695e-4707-a721-63c4a534ec58',
  type: 'functionCharacteristics',
  prompt: 'Analyze the graph of y = 2x - 6.',
  studentActions: ['identifyIntercepts', 'stateZeros', 'describeBehavior'],
  graph: {
    xMin: -2,
    xMax: 7,
    yMin: -10,
    yMax: 10,
    functions: [{ type: 'line', m: 2, b: -6 }],
  },
  recipe: {
    name: 'functionCharacteristics',
    ask: ['xInterceptExists', 'xInterceptValue', 'zeros', 'behavior'],
  },
});

const legacyGeneratedGraphCopy = () => ({
  ...districtContinuityDomain(),
  workflowProvenance: {
    source: 'recipeExpansion',
    recipeName: 'functionModeling',
    generatorVersion: 0,
  },
  workflow: [
    {
      id: 'continuity',
      kind: 'classification',
      prompt: 'Should this relationship be represented as discrete points or as a continuous graph?',
      choices: ['discrete', 'continuous'],
    },
    {
      id: 'graph',
      kind: 'graphConstruction',
      graphMode: 'studentSelected',
      continuityStageId: 'continuity',
      prompt: 'Build the graph of the relationship.',
    },
    {
      id: 'domainDiscrete',
      kind: 'domainInput',
      prompt: 'List the domain for this situation.',
      notation: 'set',
      showWhen: { stage: 'continuity', is: 'discrete' },
    },
    {
      id: 'domainContinuous',
      kind: 'domainInput',
      prompt: 'Describe a reasonable domain for this situation.',
      notation: 'inequality',
      showWhen: { stage: 'continuity', is: 'continuous' },
    },
  ],
  grading: {
    continuity: 'discrete',
    domainDiscrete: '{0, 1, 2, ..., 48}',
  },
});

const assignmentOf = (...questions) => ({
  schemaVersion: 5,
  title: 'District DOL runtime repair fixture',
  courseId: 'algebra1',
  sections: [{
    id: 'classwork',
    role: 'classwork',
    title: 'Classwork',
    questions,
  }],
});

test('runtime repair version is 2 and exposes stable repair keys', () => {
  const api = requireRuntimeRepair();
  assert.equal(api.ASSIGNMENT_RUNTIME_REPAIR_VERSION, 2);
  assert.equal(
    api.RUNTIME_REPAIR_KEYS.NO_SYNTHETIC_FUNCTION_MODELING_GRAPH,
    'function-modeling-exact-ask-no-synthetic-graph-v1',
  );
  assert.equal(
    api.RUNTIME_REPAIR_KEYS.ACTIVE_WORKFLOW_TASK,
    'workflow-active-task-presentation-v1',
  );
  assert.equal(
    api.RUNTIME_REPAIR_KEYS.AUTHORED_GRAPH_PERSISTENCE,
    'workflow-authored-graph-persistence-v1',
  );
});

test('District DOL continuity/domain question is already correct and requires no content rewrite', () => {
  const api = requireRuntimeRepair();
  const question = districtContinuityDomain();
  const before = structuredClone(question);
  const result = api.repairQuestionForCurrentRuntime(question);

  assert.equal(result.changed, false);
  assert.equal(result.safeToPersist, false);
  assert.equal(result.presentationOnly, true);
  assert.deepEqual(result.question, before);
  assert.deepEqual(question, before, 'the repair pass must never mutate the stored object');
  assert.ok(result.repairKeys.includes(api.RUNTIME_REPAIR_KEYS.NO_SYNTHETIC_FUNCTION_MODELING_GRAPH));
  assert.equal(Array.isArray(result.question.workflow), false, 'do not persist a compiled workflow merely to prove the graph is absent');
});

test('known generated functionModeling graph stage is removed only from a graph-free authored ask', () => {
  const api = requireRuntimeRepair();
  const question = legacyGeneratedGraphCopy();
  const result = api.repairQuestionForCurrentRuntime(question);

  assert.equal(result.changed, true);
  assert.equal(result.safeToPersist, true);
  assert.equal(result.presentationOnly, false);
  assert.equal(result.question.workflow.some((stage) => stage.id === 'graph' || stage.kind === 'graphConstruction'), false);
  assert.deepEqual(result.question.recipe, question.recipe);
  assert.deepEqual(result.question.studentActions, question.studentActions);
  assert.deepEqual(result.question.grading, question.grading);
  assert.equal(result.question.questionId, question.questionId);
});

test('authored or grading-dependent graph workflows fail closed instead of being deleted', () => {
  const api = requireRuntimeRepair();
  const authored = legacyGeneratedGraphCopy();
  authored.workflowProvenance = { source: 'authored' };
  const authoredResult = api.repairQuestionForCurrentRuntime(authored);
  assert.equal(authoredResult.changed, false);
  assert.equal(authoredResult.question.workflow.some((stage) => stage.kind === 'graphConstruction'), true);
  assert.ok(authoredResult.diagnostics.some((entry) => /authored|ambiguous/i.test(String(entry.message || ''))));

  const gradingDependent = legacyGeneratedGraphCopy();
  gradingDependent.grading = { ...gradingDependent.grading, graph: { useStageVerdict: true } };
  const gradingResult = api.repairQuestionForCurrentRuntime(gradingDependent);
  assert.equal(gradingResult.changed, false);
  assert.equal(gradingResult.question.workflow.some((stage) => stage.kind === 'graphConstruction'), true);
  assert.ok(gradingResult.diagnostics.some((entry) => /grading|graph/i.test(String(entry.message || ''))));
});

test('District DOL graph-characteristics question keeps exact authored graph and presentation repair keys', () => {
  const api = requireRuntimeRepair();
  const question = districtGraphCharacteristics();
  const authoredGraph = question.graph;
  const result = api.repairQuestionForCurrentRuntime(question);

  assert.equal(result.changed, false);
  assert.equal(result.presentationOnly, true);
  assert.equal(result.safeToPersist, false);
  assert.equal(result.question.graph, authoredGraph, 'authored graph identity must be retained');
  assert.ok(result.repairKeys.includes(api.RUNTIME_REPAIR_KEYS.ACTIVE_WORKFLOW_TASK));
  assert.ok(result.repairKeys.includes(api.RUNTIME_REPAIR_KEYS.AUTHORED_GRAPH_PERSISTENCE));
});

test('assignment repair preserves exact question identity/order and is idempotent', () => {
  const api = requireRuntimeRepair();
  const stored = assignmentOf(
    legacyGeneratedGraphCopy(),
    districtGraphCharacteristics(),
  );
  const before = structuredClone(stored);

  const once = api.repairAssignmentForCurrentRuntime(stored);
  const twice = api.repairAssignmentForCurrentRuntime(once.assignment);

  assert.deepEqual(
    once.assignment.sections[0].questions.map((question) => question.questionId),
    before.sections[0].questions.map((question) => question.questionId),
  );
  assert.equal(once.changed, true);
  assert.equal(twice.changed, false);
  assert.deepEqual(twice.assignment, once.assignment);
  assert.deepEqual(stored, before, 'assignment runtime repair must be pure');
  assert.ok(once.repairManifest.some((entry) => entry.questionId === '0d24f506-f272-4004-9a1e-5b4986492b51'));
  assert.ok(once.repairManifest.some((entry) => entry.questionId === '278da14e-695e-4707-a721-63c4a534ec58'));
});

test('a malformed repair input is contained and returns diagnostics instead of throwing the assignment', () => {
  const api = requireRuntimeRepair();
  const malformed = {
    questionId: 'malformed-runtime-repair-fixture',
    type: 'relationshipModel',
    recipe: { name: 'functionModeling', ask: ['continuity', 'domain'] },
    workflowProvenance: { source: 'recipeExpansion', recipeName: 'functionModeling', generatorVersion: 0 },
    workflow: [null, { id: 'graph', kind: 'graphConstruction' }],
    studentActions: ['classifyContinuity', 'stateDomain'],
  };

  let result;
  assert.doesNotThrow(() => {
    result = api.repairQuestionForCurrentRuntime(malformed);
  });
  assert.equal(result.question.questionId, malformed.questionId);
  assert.ok(Array.isArray(result.diagnostics));
});
