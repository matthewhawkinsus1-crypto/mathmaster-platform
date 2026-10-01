/*
 * PQ-043: A COMPOSED QUESTION WITH A GRAPH STEP IS BACKED UP TO THE SERVER.
 *
 * WorkflowRunner keeps every step's answer in `<draftKey>:workflow-responses`,
 * and a graph step's answer is the plotting workspace's report, verdict
 * included. The server guard refuses any record holding `isCorrect`, so from
 * the moment a graph step first reported, NOTHING of the question reached the
 * server copy, and a Chromebook swap lost every answer in it.
 *
 * The fix sends a projection: the graph step without its verdict, marked
 * `rederiveOnOpen`, as a step to finish. The device keeps the whole record.
 * These tests pin each half of that:
 *
 *   the guard     accepts the projected record, unchanged and unrelaxed;
 *   no verdict    anywhere in it — not isCorrect, credit, a partial-credit
 *                 percentage, part grades, or a field added to a part later;
 *   the device    copy is untouched, and the same device never trades it for
 *                 the server's (precedence);
 *   restored      a graph step without its verdict is not an answer: never
 *                 graded (let alone graded wrong), never submitted around,
 *                 never closed by a later step — and, given its verdict back
 *                 by its workspace, graded exactly as on the device that made
 *                 it.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  FORBIDDEN_DRAFT_KEYS,
  buildWorkspaceDraftPatch,
  explainWorkspaceDraftRejection,
  mergeWorkspaceDraftDocument,
  readWorkspaceDraftEntries,
  sanitizeWorkspaceDraftValue,
  selectRestorableDraftEntries,
} from '../../functions/shared/workspaceDraftSchema.mjs';
import {
  REDERIVE_ON_OPEN,
  WORKFLOW_ARTIFACT,
  graphArtifactAwaitsVerdict,
  projectGraphArtifactForServer,
  projectTableArtifactForServer,
  projectWorkflowResponsesForServer,
  stagesAwaitingVerdict,
} from '../../src/platform/workflow/workflowDraftProjection.js';
import { projectDraftForServer } from '../../src/platform/persistence/serverDraftProjection.js';
import { rederiveRestoredTables, tableAwaitsRederivation, tableSourceCheck, tableSourceFields } from '../../src/platform/workflow/tableSourceCheck.js';
import { createWorkspaceDraftSync } from '../../src/platform/persistence/workspaceDraftSync.js';
import {
  auditDraftWrite,
  clearDraftSyncRejections,
  listDraftSyncRejections,
} from '../../src/platform/persistence/draftSyncDiagnostics.js';
import { buildQuestionDraftKey } from '../../src/questionDraftStorage.js';
import {
  activeStages,
  hasStageResponse,
  lockedStageIds,
  readComposedQuestion,
  summarizeWorkflowProgress,
} from '../../src/platform/workflow/questionWorkflow.js';
import { gradeWorkflow } from '../../src/platform/workflow/workflowGrading.js';
import { executableSource, region } from './helpers/sourceContract.mjs';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

const STUDENT = 'S-pq043';
const ASSIGNMENT = 'A-pq043';
const draftKey = buildQuestionDraftKey({ studentId: STUDENT, assignmentId: ASSIGNMENT, questionIndex: 2, variantIndex: 0, sessionMode: 'graded' });
const RESPONSES_KEY = `${draftKey}:workflow-responses`;

// Verdict-like fields beyond the guard's own list. None may ride in the
// projection either.
const VERDICT_LIKE = new Set([...FORBIDDEN_DRAFT_KEYS, 'partialCreditPercent', 'credit', 'misconceptionCode', 'graded']);
const keysAnywhere = (value, found = []) => {
  if (Array.isArray(value)) value.forEach((entry) => keysAnywhere(entry, found));
  else if (value && typeof value === 'object') {
    Object.entries(value).forEach(([key, nested]) => { found.push(key); keysAnywhere(nested, found); });
  }
  return found;
};

/* ----------------------------------------------------------------- fixtures */

// Exactly what WorkflowRunner's graphArtifact() keeps of the plotting
// workspace's report: the shape seen in the browser for the model question.
const construction = (placements, { pointsValidated = true, snapped = true } = {}) => JSON.stringify({
  construction: { placements, chosenXValues: {}, pointsValidated, strokes: snapped ? [[[331.4, 312.9], [477.2, 120.3]]] : [], snapped, markerPlacements: {} },
  analysis: { selections: {}, answers: {}, typedPoints: {}, noneSelections: {}, inversePointsValidated: false, inverseStrokes: [], inverseSnapped: false },
});
const graphArtifact = ({ isCorrect = true, points = [[0, 1], [1, 3], [2, 5]], curve = true } = {}) => ({
  [WORKFLOW_ARTIFACT]: 'graph',
  isComplete: true,
  isCorrect,
  responseKey: construction(Object.fromEntries(points.map((point, index) => [`point-${index + 1}`, point]))),
  parts: [
    ...points.map((point, index) => ({
      id: `point-${index + 1}`,
      label: `Point placement: P${index + 1}`,
      isComplete: true,
      isCorrect: isCorrect || index > 0,
      response: `(${point[0]}, ${point[1]})`,
    })),
    ...(curve ? [{ id: 'graph-curve', label: 'Freehand curve and snap', isComplete: true, isCorrect, response: 'snapped' }] : []),
  ],
});

const MODEL = {
  id: 'pq043-model',
  type: 'relationshipModel',
  prompt: 'A pattern follows y = 2x + 1.',
  recipe: { name: 'functionModeling', ask: ['table', 'graph', 'domain', 'range'] },
  functionSpec: { type: 'linear', m: 2, b: 1 },
  graphMode: 'continuous',
  tableXValues: [0, 1, 2],
  graph: { xMin: -10, xMax: 10, yMin: -10, yMax: 10 },
  correctDomain: '(-\\infty, \\infty)',
  correctRange: '(-\\infty, \\infty)',
};
const TABLE = {
  [WORKFLOW_ARTIFACT]: 'table',
  isComplete: true,
  cells: { '0:y': '1', '1:y': '3', '2:y': '5' },
  xValues: [0, 1, 2],
  points: [[0, 1], [1, 3], [2, 5]],
  sourceModel: null,
  sourceFunctionSpec: { type: 'linear', m: 2, b: 1 },
  sourceChecked: 3,
  sourceConsistent: true,
};
const modelResponses = (graph = graphArtifact()) => ({
  table: TABLE,
  graph,
  domain: '(-\\infty, \\infty)',
  range: '(-\\infty, \\infty)',
});

const ANALYSIS = {
  id: 'pq043-analysis',
  type: 'graphAnalysis',
  prompt: 'The table shows a function. Graph it, then describe what it does.',
  recipe: { name: 'functionCharacteristics', ask: ['plot', 'model', 'xIntercept', 'domain'] },
  pairs: [[-1, 0], [0, 5], [2, 9], [4, 5], [5, 0]],
  graph: { xMin: -6, xMax: 8, yMin: -4, yMax: 12 },
  functionFamily: 'Quadratic',
  correctEquation: '-(x - 2)^2 + 9',
  correctDomain: 'all real numbers',
};
const analysisResponses = (plot = graphArtifact({ points: ANALYSIS.pairs, curve: false })) => ({
  plot,
  model: 'Quadratic',
  xIntercept: { [WORKFLOW_ARTIFACT]: 'featureSelection', feature: 'xIntercept', selections: [[-1, 0], [5, 0]], none: false, isComplete: true },
  domain: 'all real numbers',
});

const RELATION = {
  id: 'pq043-relation',
  type: 'relationMapping',
  prompt: 'Plot this relation.',
  pairs: [[-2, 3], [1, 2], [3, -1], [-4, -3]],
  recipe: { name: 'relationRepresentations', ask: ['plot', 'domain'] },
};
const relationResponses = (plot = graphArtifact({ points: RELATION.pairs, curve: false })) => ({
  plot,
  domain: '{-4, -2, 1, 3}',
});

// What WorkflowRunner reports to QuestionEngine for a set of responses.
const grade = (question, responses) => {
  const { workflow, grading } = readComposedQuestion(question);
  return gradeWorkflow({ stages: activeStages(workflow, responses), responses, grading });
};
const clone = (value) => JSON.parse(JSON.stringify(value));

/* --------------------------------------------- the defect, and the projection */

test('the device copy is refused by the guard; its server projection is accepted unchanged', () => {
  const local = modelResponses();
  // PQ-043 as it was: one verdict in one step and the whole record stays home.
  const refused = explainWorkspaceDraftRejection(local);
  assert.equal(refused.reason, 'forbidden-key');
  assert.equal(refused.path, 'graph.isCorrect');

  const projected = projectDraftForServer(RESPONSES_KEY, local);
  assert.equal(sanitizeWorkspaceDraftValue(projected).ok, true, 'the unchanged guard accepts the projected record');
});

test('no verdict, credit or grade survives anywhere in the projected record', () => {
  const local = modelResponses({
    ...graphArtifact({ isCorrect: false }),
    // Fields a future workspace might add: none may travel.
    partialCreditPercent: 67,
    partGrades: [{ id: 'point-1', isCorrect: false }],
    parts: graphArtifact({ isCorrect: false }).parts.map((part) => ({ ...part, credit: 0.5, misconceptionCode: 'swapped-coordinates', grading: { tolerance: 0.2 } })),
  });
  const projected = projectWorkflowResponsesForServer(local);
  const leaked = keysAnywhere(projected).filter((key) => VERDICT_LIKE.has(key));
  assert.deepEqual(leaked, [], `verdict-like keys reached the server copy: ${leaked.join(', ')}`);
  // ...and nothing verdict-like hides in a string either: the workspace's
  // responseKey stays on the device (its construction travels in its own draft).
  assert.doesNotMatch(JSON.stringify(projected.graph), /isCorrect|partialCredit|misconception|credit/);
});

test('the projected graph step is marked for re-derivation and reads as a step to finish', () => {
  const projected = projectGraphArtifactForServer(graphArtifact());
  assert.equal(projected[WORKFLOW_ARTIFACT], 'graph');
  assert.equal(projected[REDERIVE_ON_OPEN], true);
  // `isComplete: false` is what a device built BEFORE this change reads: an
  // unfinished step to open, never a finished step to mark wrong.
  assert.equal(projected.isComplete, false);
  assert.equal(Object.hasOwn(projected, 'responseKey'), false);
  // The student's own placements stay readable (teacher draft inspection).
  assert.deepEqual(projected.parts.map((part) => part.response), ['(0, 1)', '(1, 3)', '(2, 5)', 'snapped']);
  assert.deepEqual(Object.keys(projected.parts[0]).sort(), ['id', 'isComplete', 'label', 'response']);
});

test('a table step travels as the student\'s work alone, every other step as it is, and the projection is idempotent', () => {
  const local = modelResponses();
  const projected = projectWorkflowResponsesForServer(local);
  // Whether the cells agree with the AUTHORED function (a verdict on a DOL),
  // and that function itself, stay on the device; the cells, the points read
  // from them and the student's own source equation travel.
  assert.deepEqual(projected.table, {
    [WORKFLOW_ARTIFACT]: 'table',
    isComplete: true,
    cells: TABLE.cells,
    xValues: TABLE.xValues,
    points: TABLE.points,
    sourceModel: null,
  });
  assert.deepEqual(projectTableArtifactForServer(TABLE), projected.table);
  assert.equal(projected.domain, local.domain);
  assert.equal(projected.range, local.range);
  assert.deepEqual(projectWorkflowResponsesForServer(projected), projected);
  // A record with nothing to project is the same object.
  const nothing = { table: projected.table, model: 'Quadratic', domain: 'x' };
  assert.equal(projectWorkflowResponsesForServer(nothing), nothing);
  // Only the workflow record is projected. Any other draft goes as it is, and
  // the guard judges it as before.
  const elsewhere = { tool: graphArtifact() };
  assert.equal(projectDraftForServer(`${draftKey}:work:tool`, elsewhere), elsewhere);
  assert.equal(sanitizeWorkspaceDraftValue(projectDraftForServer(`${draftKey}:work:tool`, elsewhere)).ok, false);
});

test('a table step\'s stored verdict decides no grade: the server copy grades as the device copy, right table or wrong', () => {
  const wrongCells = { '0:y': '1', '1:y': '4', '2:y': '5' };
  for (const table of [
    TABLE,
    { ...TABLE, cells: wrongCells, points: [[0, 1], [1, 4], [2, 5]], sourceConsistent: false },
  ]) {
    const local = modelResponses();
    local.table = table;
    const onDevice = grade(MODEL, local);
    // Restored on another Chromebook, with the graph step opened again.
    const restored = { ...projectWorkflowResponsesForServer(local), graph: local.graph };
    assert.equal(Object.hasOwn(restored.table, 'sourceConsistent'), false);
    assert.equal(tableAwaitsRederivation(restored.table), true);
    // The credit never depended on it...
    const credit = (result) => ({ isCorrect: result.isCorrect, partialCreditPercent: result.partialCreditPercent, parts: result.parts });
    assert.deepEqual(credit(grade(MODEL, restored)), credit(onDevice));
    // ...and once it is worked out again the submission is the device's, byte for byte.
    const { workflow, content } = readComposedQuestion(MODEL);
    const rederived = rederiveRestoredTables({ responses: restored, stages: workflow, content });
    assert.equal(JSON.stringify(rederived.table), JSON.stringify(table));
    assert.deepEqual(grade(MODEL, rederived), onDevice);
  }
});

test('a table\'s check is one computation: the stored fields, the check a later step reads, and the re-derived answer agree', () => {
  const { workflow, content } = readComposedQuestion(MODEL);
  const tableStage = workflow.find((stage) => stage.id === 'table');
  for (const [cells, sourceModel, expected] of [
    [{ '0:y': '1', '1:y': '3', '2:y': '5' }, null, { sourceFunctionSpec: content.functionSpec, sourceChecked: 3, sourceConsistent: true }],
    [{ '0:y': '1', '1:y': '4', '2:y': '5' }, null, { sourceFunctionSpec: content.functionSpec, sourceChecked: 3, sourceConsistent: false }],
    // Built from the student's own equation: checked against it, no authored function.
    [{ '0:y': '1', '1:y': '3' }, '2x+1', { sourceFunctionSpec: null, sourceChecked: 2, sourceConsistent: true }],
    [{ '0:y': '1', '1:y': '9' }, '2x+1', { sourceFunctionSpec: null, sourceChecked: 2, sourceConsistent: false }],
    // Nothing entered: nothing checked, and not consistent.
    [{}, null, { sourceFunctionSpec: content.functionSpec, sourceChecked: 0, sourceConsistent: false }],
  ]) {
    const fields = tableSourceFields({ cells, stage: tableStage, sourceModel, content });
    assert.deepEqual(fields, expected);
    const table = { [WORKFLOW_ARTIFACT]: 'table', isComplete: true, cells, xValues: [0, 1, 2], points: [], sourceModel, ...fields };
    assert.deepEqual(tableSourceCheck({ table, tableStage, content }), { checked: expected.sourceChecked, consistent: expected.sourceConsistent });
    assert.deepEqual(tableSourceCheck({ table: projectTableArtifactForServer(table), tableStage, content }), tableSourceCheck({ table, tableStage, content }),
      'a later step reads the same check from the server copy as from the device copy');
    const back = rederiveRestoredTables({ responses: { table: projectTableArtifactForServer(table) }, stages: workflow, content });
    assert.equal(JSON.stringify(back.table), JSON.stringify(table));
  }
  // Nothing to work out: the same object, so WorkflowRunner writes nothing.
  const full = modelResponses();
  assert.equal(rederiveRestoredTables({ responses: full, stages: workflow, content }), full);
  assert.equal(tableSourceCheck({ table: 'x+1', tableStage, content }), null);
  assert.equal(tableSourceCheck({ table: TABLE, tableStage: null, content }), null);
});

test('the device copy is never touched by the projection', () => {
  const local = modelResponses();
  const before = clone(local);
  projectWorkflowResponsesForServer(local);
  projectDraftForServer(RESPONSES_KEY, local);
  assert.deepEqual(local, before);
  assert.equal(local.graph.isCorrect, true);
});

/* ------------------------------------------------------------ the sync path */

const manualScheduler = () => {
  const queued = new Map();
  let next = 1;
  return {
    set: (callback) => { next += 1; queued.set(next, callback); return next; },
    clear: (handle) => queued.delete(handle),
    runAll() { const callbacks = [...queued.values()]; queued.clear(); callbacks.forEach((callback) => callback()); },
  };
};

const syncOnce = (entries) => {
  const writes = [];
  const scheduler = manualScheduler();
  const sync = createWorkspaceDraftSync({
    studentId: STUDENT, assignmentId: ASSIGNMENT, scheduler, flush: async ({ document }) => { writes.push(document); },
  });
  const recorded = entries.map((entry) => sync.record(entry));
  scheduler.runAll();
  return { sync, writes, recorded };
};

test('the background save queues the projection — the record reaches the server', async () => {
  const local = modelResponses();
  const before = clone(local);
  const { sync, writes, recorded } = syncOnce([{ key: RESPONSES_KEY, value: local, savedAt: 1_000 }]);
  assert.deepEqual(recorded, [true], 'the record is queued, not refused');
  assert.deepEqual(sync.stats().rejected, {});
  assert.equal(writes.length, 1);
  const [entry] = readWorkspaceDraftEntries(writes[0]);
  assert.equal(entry.key, RESPONSES_KEY);
  assert.deepEqual(entry.value, projectWorkflowResponsesForServer(before));
  assert.deepEqual(keysAnywhere(entry.value).filter((key) => VERDICT_LIKE.has(key)), []);
  assert.deepEqual(local, before, 'what the device keeps is what it had');
});

test('the guard is not relaxed: a verdict the projection does not remove is still refused', () => {
  clearDraftSyncRejections();
  const original = console.error;
  console.error = () => {};
  try {
    // A step answer that is not a graph artifact but carries a score.
    const { recorded, sync } = syncOnce([{ key: RESPONSES_KEY, value: { ...modelResponses(), domain: { text: 'x', score: 1 } }, savedAt: 1 }]);
    assert.deepEqual(recorded, [false]);
    assert.equal(sync.stats().rejected['forbidden-key'], 1);
    assert.equal(listDraftSyncRejections()[0].path, 'domain.score');
  } finally {
    console.error = original;
  }
});

test('the development audit judges what the server would get', () => {
  clearDraftSyncRejections();
  const original = console.error;
  const errors = [];
  console.error = (...args) => errors.push(args.join(' '));
  try {
    assert.equal(auditDraftWrite(RESPONSES_KEY, modelResponses()), null, 'a graph verdict on the device is not a refusal any more');
    const reported = auditDraftWrite(RESPONSES_KEY, { ...modelResponses(), domain: { score: 1 } });
    assert.equal(reported?.path, 'domain.score', 'anything else verdict-like is still reported, with its path');
  } finally {
    console.error = original;
  }
  assert.equal(errors.length, 1);
});

/* -------------------------------------------------------------- precedence */

const serverCopy = (entries) => mergeWorkspaceDraftDocument({
  existing: null,
  patch: buildWorkspaceDraftPatch({ studentId: STUDENT, assignmentId: ASSIGNMENT, entries }),
});

test('the same device never trades its own copy for the verdict-less server copy', () => {
  const { writes } = syncOnce([{ key: RESPONSES_KEY, value: modelResponses(), savedAt: 5_000 }]);
  const stored = mergeWorkspaceDraftDocument({ existing: null, patch: writes[0] });
  const entries = readWorkspaceDraftEntries(stored);
  // The server entry came from THIS write: same savedAt as the device's copy.
  assert.deepEqual(selectRestorableDraftEntries({ entries, localSavedAt: () => 5_000, canonicalSavedAt: () => 0 }), []);
  // A newer local edit is newer still.
  assert.deepEqual(selectRestorableDraftEntries({ entries, localSavedAt: () => 9_000, canonicalSavedAt: () => 0 }), []);
  // A device without the work (or with older work) takes it.
  assert.equal(selectRestorableDraftEntries({ entries, localSavedAt: () => 0, canonicalSavedAt: () => 0 }).length, 1);
  assert.equal(selectRestorableDraftEntries({ entries, localSavedAt: () => 4_999, canonicalSavedAt: () => 0 }).length, 1);
  // A submitted attempt after the draft still outranks it.
  assert.deepEqual(selectRestorableDraftEntries({ entries, localSavedAt: () => 0, canonicalSavedAt: () => 6_000 }), []);
});

/* ------------------------------------------------ restored: not an answer yet */

for (const [name, question, responsesFor, graphStageId] of [
  ['the model question (graph graded by its own verdict, against the table)', MODEL, modelResponses, 'graph'],
  ['the function-characteristics question (plot graded by its own verdict)', ANALYSIS, analysisResponses, 'plot'],
  ['the relation question (plot graded by its plotted pairs)', RELATION, relationResponses, 'plot'],
]) {
  test(`${name}: restored without its verdict, the graph step is never graded, and the question waits`, () => {
    const local = responsesFor();
    const onDevice = grade(question, local);
    assert.equal(onDevice.isComplete, true, 'the work is complete on the device that did it');

    const restored = readWorkspaceDraftEntries(serverCopy([{ key: RESPONSES_KEY, value: projectDraftForServer(RESPONSES_KEY, local), savedAt: 7 }]))[0].value;
    assert.equal(hasStageResponse(restored[graphStageId]), false, 'a graph step without its verdict is not an answer');
    assert.equal(graphArtifactAwaitsVerdict(restored[graphStageId]), true);

    const waiting = grade(question, restored);
    const part = waiting.parts.find((entry) => entry.id === graphStageId);
    assert.equal(part.graded, false, 'not marked — in particular, not marked wrong');
    assert.equal(part.isComplete, false);
    assert.equal(part.credit, 0);
    assert.equal(waiting.isComplete, false, 'and the question cannot be submitted around it');
    assert.equal(waiting.isCorrect, false);

    // Its workspace reports again from the student's own construction, and
    // a table step's check is worked out again on mount (WorkflowRunner): the
    // same answers, byte for byte, so exactly the same grade and the same
    // submitted response as on the device that did it.
    const { workflow, content } = readComposedQuestion(question);
    const rederived = rederiveRestoredTables({ responses: { ...restored, [graphStageId]: local[graphStageId] }, stages: workflow, content });
    assert.equal(JSON.stringify(rederived), JSON.stringify(local));
    assert.deepEqual(grade(question, rederived), onDevice);
  });
}

test('a restored graph step reads as unanswered everywhere, so it can always be opened', () => {
  const { workflow } = readComposedQuestion(ANALYSIS);
  const local = analysisResponses();
  const stages = activeStages(workflow, local);
  const reachableOnDevice = stages.length - 1;
  // On the device that did it, the intercept step is in reach and the plot is
  // closed (it reveals the curve).
  assert.ok(lockedStageIds(stages, reachableOnDevice).has('plot'));

  const restored = { ...local, plot: projectGraphArtifactForServer(local.plot) };
  const firstUnanswered = stages.findIndex((stage) => !hasStageResponse(restored[stage.id]));
  assert.equal(stages[firstUnanswered].id, 'plot');
  assert.equal(lockedStageIds(stages, firstUnanswered).has('plot'), false, 'restored, the plot is open, so its workspace can mount and re-derive');
  assert.equal(summarizeWorkflowProgress(stages, restored).answered, stages.length - 1);
  assert.deepEqual(stagesAwaitingVerdict(stages, restored).map((stage) => stage.id), ['plot']);
  assert.deepEqual(stagesAwaitingVerdict(stages, local), []);
});

test('any graph answer without a boolean verdict waits — not only a projected one', () => {
  const noVerdict = { [WORKFLOW_ARTIFACT]: 'graph', isComplete: true, responseKey: '', parts: [] };
  assert.equal(graphArtifactAwaitsVerdict(noVerdict), true);
  assert.equal(hasStageResponse(noVerdict), false);
  const graphPart = grade(MODEL, modelResponses(noVerdict)).parts.find((part) => part.id === 'graph');
  assert.equal(graphPart.graded, false);
  // A graph answer WITH its verdict is the ordinary case, unchanged.
  assert.equal(graphArtifactAwaitsVerdict(graphArtifact({ isCorrect: false })), false);
  assert.equal(hasStageResponse(graphArtifact({ isCorrect: false })), true);
  assert.equal(grade(MODEL, modelResponses(graphArtifact({ isCorrect: false }))).parts.find((part) => part.id === 'graph').isCorrect, false);
});

/* ------------------------------------------------------ the runner's wiring */

test('WorkflowRunner re-baselines Undo when a restored step gets its verdict back, and names the steps to open', () => {
  const runner = executableSource(read('src/platform/workflow/WorkflowRunner.jsx'));
  const undo = region(runner, 'useMathUndoHistory({', 'ownerId: \'workflow-responses\'', 'the workflow Undo registration');
  // The key the history resets on includes the restored steps, so their
  // verdict coming back is a new baseline rather than an Undo entry.
  assert.match(undo, /resetKey:\s*restoredGraphStepIds\s*\?\s*`\$\{questionUndoResetKey\(question\)\}\|restored:\$\{restoredGraphStepIds\}`\s*:\s*questionUndoResetKey\(question\)/);
  assert.match(runner, /const restoredGraphStepIds = Object\.entries\([\s\S]*?graphArtifactAwaitsVerdict\(value\)[\s\S]*?\.join\(','\);/);
  const notice = region(runner, 'const restoredGraphSteps = stagesAwaitingVerdict(workflow, responses)', 'const railPercent', 'the restored-steps notice data');
  assert.match(notice, /stage\.id !== activeStage\?\.id && index <= furthestReachableIndex/);
  const banner = region(runner, '{restoredGraphSteps.length ? (', '{/* NOTHING TO SHOW MEANS NOTHING ON SCREEN.', 'the restored-steps notice');
  assert.match(banner, /onClick=\{\(\) => goToStage\(index\)\}/);
});

test('whether a table agrees with its source is worked out where it is used, never read back from a stored answer', () => {
  const runner = executableSource(read('src/platform/workflow/WorkflowRunner.jsx'));
  // One computation (tableSourceCheck.js), when the step reports...
  const artifact = region(runner, 'const tableArtifact = (payload, { stage, input, content }) => {', 'const graphArtifact', 'the table step\'s report');
  assert.match(artifact, /\.\.\.tableSourceFields\(\{ cells, stage, sourceModel, content \}\),/);
  assert.doesNotMatch(runner, /const (checkTableAgainstFunctionSpec|tableSourceConsistency|tableSourceCheck) =/, 'no second copy of the check');
  // ...when a table comes back from the server copy: before the first render
  // reads it (a graph step's draft is named after its table), and written back
  // as what it is, not an edit...
  assert.match(runner, /const responses = useMemo\(\s*\(\) => rederiveRestoredTables\(\{ responses: storedResponses, stages: authoredWorkflow, content \}\),/);
  assert.match(runner, /if \(responses === storedResponses\) return;\s*setResponses\(\(current\) => rederiveRestoredTables\(\{ responses: current, stages: authoredWorkflow, content \}\), \{ edit: false \}\);/);
  // ...and every later step is handed the check as it stands...
  assert.match(runner, /sourceCheck: tableSourceCheck\(\{\s*table: resolvedInput\.value,/);
  // ...and nothing reads the stored one (practice-only messages included).
  assert.doesNotMatch(runner, /source\??\.sourceConsistent|source\??\.sourceChecked/);
  assert.equal((runner.match(/input\?\.sourceCheck\?\.consistent !== false/g) || []).length, 2, 'both plotting steps gate their magnet on the worked-out check');
  assert.match(runner, /input\?\.sourceCheck && input\.sourceCheck\.checked > 0 && input\.sourceCheck\.consistent === false/);
});
