// A WORKFLOW GRAPH PLOTS EVERY ROW OF THE STUDENT'S TABLE.
//
// Walkthrough 2026-10-22, Algebra I DOL #3 Review PR 2 (popcorn: x = 0…5).
// The graph step built from the student's six-row table offered P1–P5 only:
// (5, 30) could not be plotted, "All point placements are correct" was said
// with a point missing, and the graph part was marked right without it. The
// builder capped a workflow model's points at five; the browser and the server
// grader both build their tasks with it, so the cap was the grade too.
//
// TL48 (Codex review on #517): the next cap, 12, did the same to rows 13–20 of
// a 20-row table, which the workflow allows. There is no cap now; a graph
// whose work cannot carry every row is never finished, so never right.
import test from 'node:test';
import assert from 'node:assert/strict';

import { buildInteractivePointTasks } from '../../functions/shared/toolMath/graphWorkspace/interactiveGraphEngine.mjs';
import { buildGraphWorkspaceModel } from '../../functions/shared/toolMath/graphWorkspace/graphWorkspaceModel.mjs';
import { placementsMatchTasks } from '../../src/interactiveGraphEngine.js';
import { compileAuthoringIntentV5 } from '../../src/platform/contract/authoringIntentV5.js';
import { activeStages, readComposedQuestion } from '../../src/platform/workflow/questionWorkflow.js';
import { workflowStageWorkResponses } from '../../src/platform/workflow/workflowAnswerState.js';
import { resolveWorkflowGraphStages, workflowTableArtifact } from '../../functions/shared/toolMath/workflow/workflowGraphStage.mjs';
import { WORKFLOW_ARTIFACT, workflowTableLayout } from '../../functions/shared/toolMath/workflow/workflowStageWork.mjs';
import { composedWorkflowWork } from '../../functions/shared/toolMath/workflow/composedWorkflowContract.mjs';
import { gradeComposedWorkflowCheck } from '../../functions/shared/serverGrading/questionGraders/composedWorkflow.mjs';
import { gradeServerResponse } from '../../functions/shared/serverGrading/serverResponseGrading.mjs';
import { TOOL_RESPONSE_LIMITS, canonicalToolWorkJson } from '../../functions/shared/serverGrading/toolResponseContract.mjs';

const popcorn = { type: 'expression', expression: '6x', variable: 'x' };
const table = [[0, 0], [1, 6], [2, 12], [3, 18], [4, 24], [5, 30]];

test('every row of a six-row table becomes a point to plot, in order', () => {
  const tasks = buildInteractivePointTasks(popcorn, { points: table });
  assert.deepEqual(tasks.map((task) => task.x), [0, 1, 2, 3, 4, 5]);
  assert.deepEqual(tasks.map((task) => task.label), ['P1', 'P2', 'P3', 'P4', 'P5', 'P6']);
  assert.deepEqual(tasks[5].expected, [5, 30]);
});

test('the grader\'s model asks for the same six points, so five placed is not a complete graph', () => {
  const model = buildGraphWorkspaceModel({ functionSpec: popcorn, graphAnswer: { suggestedPoints: table }, graph: { xMin: -1, xMax: 7, yMin: -5, yMax: 40 } });
  assert.equal(model.tasks.length, 6);
  const placements = Object.fromEntries(model.tasks.slice(0, 5).map((task) => [task.id, task.expected]));
  assert.equal(placementsMatchTasks(model.tasks, placements, model.pointTolerance, popcorn, {}), false, 'the sixth row is still owed');
  placements[model.tasks[5].id] = model.tasks[5].expected;
  assert.equal(placementsMatchTasks(model.tasks, placements, model.pointTolerance, popcorn, {}), true);
});

/*
 * The real path, end to end: a functionModeling item compiled through V5 with
 * `rows` table rows (tickets at $5 each, discrete, so the graph is points
 * only); the student's equation, a table that follows it, then the graph step
 * the workflow builds from that table, marked by the server.
 */
const ticketsWorkflow = (rows) => compileAuthoringIntentV5({
  schemaVersion: 5,
  assignment: { title: 'A long table', courseId: 'algebra1' },
  sections: [{ role: 'classwork', questions: [{
    standard: 'A.3C',
    prompt: 'Build one model from the situation.',
    scenario: 'Tickets cost $5 each.',
    studentActions: ['identifyQuantities', 'writeEquation', 'completeTable', 'constructGraph', 'classifyContinuity'],
    quantities: [{ id: 'n', label: 'Tickets' }, { id: 'c', label: 'Cost' }],
    correctIndependentId: 'n',
    correctDependentId: 'c',
    answerModel: { equation: 'C(n)=5n', tableXValues: Array.from({ length: rows }, (_, x) => x), continuity: 'discrete' },
  }] }],
}).package.sections[0].questions[0];

const playUpToTheGraph = (question) => {
  const { workflow, content, grading } = readComposedQuestion(question);
  const responses = {};
  workflow.forEach((stage) => {
    if (!activeStages(workflow, responses).some((entry) => entry.id === stage.id)) return;
    if (stage.kind === 'quantityRoles') responses[stage.id] = { independent: 'n', dependent: 'c' };
    if (stage.kind === 'equationInput') responses[stage.id] = 'C(n)=5n';
    if (stage.kind === 'classification') responses[stage.id] = 'discrete';
    if (stage.kind === 'tableInput') {
      const { responseColumn, xValues } = workflowTableLayout(stage);
      const cells = Object.fromEntries(xValues.map((x, row) => [`${row}:${responseColumn}`, String(5 * Number(x))]));
      responses[stage.id] = workflowTableArtifact({ stage, cells, isComplete: true, sourceModel: responses.equation, content });
    }
  });
  const graphStage = workflow.find((stage) => stage.kind === 'functionGraph');
  const resolved = resolveWorkflowGraphStages({ workflow, content, grading, responses: workflowStageWorkResponses(responses) }).get(graphStage.id);
  assert.equal(resolved.status, 'ready');
  return { responses, graphId: graphStage.id, graphQuestion: resolved.question };
};

/** The question marked on the server with the graph's points placed at these x values (each at its row's height). */
const serverMarks = (question, xs) => {
  const { responses, graphId } = playUpToTheGraph(question);
  const placements = Object.fromEntries(xs.map((x) => [`point-${x + 1}`, [x, 5 * x]]));
  const graph = {
    [WORKFLOW_ARTIFACT]: 'graph',
    isComplete: true,
    isCorrect: true,
    construction: { placements, chosenXValues: {}, pointsLocked: true, pointsGradedAsPlaced: false, strokes: [], sketchLocked: false, markerPlacements: {} },
    analysis: {},
  };
  const work = composedWorkflowWork({ ...responses, [graphId]: graph });
  const browser = gradeComposedWorkflowCheck(question, work);
  const server = gradeServerResponse({ question, response: JSON.parse(JSON.stringify(browser.toolResponse)) });
  assert.equal(server.graded, true, server.reason);
  assert.equal(server.isCorrect, browser.isCorrect, 'the browser and the server agree');
  return { server, graph: server.parts.find((part) => part.id === graphId), json: canonicalToolWorkJson(work) };
};

const xsUpTo = (count) => Array.from({ length: count }, (_, x) => x);

test('a twenty-row table is plotted in full: the graph is not right until rows 13–20 are placed (TL48)', () => {
  const question = ticketsWorkflow(20);
  const { graphQuestion } = playUpToTheGraph(question);
  const model = buildGraphWorkspaceModel(graphQuestion);
  // Every row is a point to plot, in the table's order — not the first 12.
  assert.deepEqual(model.tasks.map((task) => task.x), xsUpTo(20));
  assert.deepEqual(model.tasks.at(-1).expected, [19, 95]);

  const twelve = serverMarks(question, xsUpTo(12));
  assert.deepEqual([twelve.graph.isComplete, twelve.graph.isCorrect], [false, false], 'rows 13–20 are still owed');
  assert.equal(twelve.server.isCorrect, false);
  // Each missing row on its own is owed, the last one included.
  [12, 19].forEach((left) => {
    const missingOne = serverMarks(question, xsUpTo(20).filter((x) => x !== left));
    assert.equal(missingOne.graph.isCorrect, false, `row x = ${left} left unplotted`);
  });
  const all = serverMarks(question, xsUpTo(20));
  assert.deepEqual([all.graph.isComplete, all.graph.isCorrect], [true, true]);
  assert.equal(all.server.isCorrect, true);
  // Twenty placements travel well inside the response limit.
  assert.ok(all.json.length < TOOL_RESPONSE_LIMITS.maxJsonLength / 4, `${all.json.length} chars`);
});

test('a table longer than the graph\'s work can carry is never marked right with a row missing', () => {
  // The work keeps 100 placements. A hundred rows can still be finished...
  const hundred = serverMarks(ticketsWorkflow(100), xsUpTo(100));
  assert.equal(hundred.graph.isCorrect, true);
  assert.ok(hundred.json.length < TOOL_RESPONSE_LIMITS.maxJsonLength, `${hundred.json.length} chars`);
  // ...but past that the graph is never finished: nothing is cut to fit, so
  // the 101st row is still asked for and the graph is never right without it.
  const longer = ticketsWorkflow(101);
  assert.equal(buildGraphWorkspaceModel(playUpToTheGraph(longer).graphQuestion).tasks.length, 101);
  const marked = serverMarks(longer, xsUpTo(101));
  assert.equal(marked.graph.isCorrect, false);
  assert.equal(marked.server.isCorrect, false);
});
