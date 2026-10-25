// GR11: A GRAPH DRAWN UNDER THE STUDENT'S OWN "CONTINUOUS" IS CREDITED.
//
// The graph step of a function-modelling question is built from the student's
// own answers: their table, and their "discrete or continuous?" choice, which
// sets the graph's mode (workflowGraphStage.mjs effectiveWorkflowGraphStage).
// A student who calls whole popcorn buckets "continuous" is then asked for a
// connected line, and a correct connected line is credited: the wrong
// classification is marked once, at the classification, and is not charged
// again at the graph that follows it (follow-through credit). The owner
// confirmed this (GR11; it was left for the owner in #521).
//
// Graded here by the server's own composed-workflow grader, on the real
// Algebra I DOL #3 Review item (popcorn, $6 a bucket, $30 to spend).

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileTeacherImport } from '../../scripts/check-teacher-import.mjs';
import { gradeComposedWorkflowWork } from '../../functions/shared/serverGrading/questionGraders/composedWorkflow.mjs';
import { resolveComposedWorkflow } from '../../functions/shared/toolMath/workflow/composedWorkflowContract.mjs';
import { resolveWorkflowGraphStages, workflowTableArtifact } from '../../functions/shared/toolMath/workflow/workflowGraphStage.mjs';
import { GRAPH_WORKSPACE_VIEWBOX, graphWorkspaceModelFor } from '../../functions/shared/toolMath/graphWorkspace/graphWorkspaceModel.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const REVIEW = compileTeacherImport(fs.readFileSync(path.resolve(here, '../../teacher-import-jsons/algebra1-dol3/Algebra1_DOL3_Review.json'), 'utf8'));
const QUESTION = REVIEW.questions.find((candidate) => candidate.questionId === 'dol3-review-q02');
const ARTIFACT = '__mathmasterWorkflowArtifact';
const rule = (x) => 6 * x;

// A freehand stroke along y = f(x), in the workspace's viewBox units.
const sketchAlong = (view, f, x0, x1, samples = 60) => Array.from({ length: samples + 1 }, (_, i) => x0 + ((x1 - x0) * i) / samples)
  .map((x) => [x, f(x)])
  .filter(([, y]) => y >= view.yMin && y <= view.yMax)
  .map(([x, y]) => [
    GRAPH_WORKSPACE_VIEWBOX.padding + ((x - view.xMin) / (view.xMax - view.xMin)) * (GRAPH_WORKSPACE_VIEWBOX.width - 2 * GRAPH_WORKSPACE_VIEWBOX.padding),
    GRAPH_WORKSPACE_VIEWBOX.padding + ((view.yMax - y) / (view.yMax - view.yMin)) * (GRAPH_WORKSPACE_VIEWBOX.height - 2 * GRAPH_WORKSPACE_VIEWBOX.padding),
  ]);

// The student's work up to the graph, with their own continuity answer, and
// the graph step as it is built from that work.
const workUnder = (continuity) => {
  const { composed } = resolveComposedWorkflow(QUESTION);
  const responses = { quantities: { independent: 'buckets', dependent: 'cost' }, equation: 'f(x)=6x', continuity };
  const tableStage = composed.workflow.find((stage) => stage.kind === 'tableInput');
  responses.table = workflowTableArtifact({
    stage: tableStage,
    cells: Object.fromEntries(tableStage.xValues.map((x, row) => [`${row}:y`, String(rule(x))])),
    isComplete: true,
    sourceModel: responses.equation,
    content: composed.content,
  });
  const [[graphStageId, resolution]] = [...resolveWorkflowGraphStages({ workflow: composed.workflow, content: composed.content, grading: composed.grading, responses })];
  assert.equal(resolution.status, 'ready', 'the graph step opens from the student\'s table');
  return { responses, graphStageId, model: graphWorkspaceModelFor(resolution.question, {}), pointOnly: resolution.question.pointOnly === true };
};
const placementsOf = (model) => Object.fromEntries(model.tasks.map((task) => [task.id, [Number(task.x), rule(Number(task.x))]]));
const partsOf = (responses) => Object.fromEntries(gradeComposedWorkflowWork(QUESTION, { responses }).parts.map((part) => [part.id, part.isCorrect]));

test('under the student\'s wrong "continuous", a connected line through their points is credited; the classification is marked wrong', () => {
  assert.ok(QUESTION, 'the review compiles its popcorn item');
  const { responses, graphStageId, model, pointOnly } = workUnder('continuous');
  assert.equal(pointOnly, false, 'the graph step asks for a connected line, as the student said');
  const connected = { [ARTIFACT]: 'graph', isComplete: true, analysis: {}, construction: {
    placements: placementsOf(model), pointsLocked: true,
    strokes: [sketchAlong(model.viewWindow, rule, 0, 5)], sketchView: { ...model.viewWindow }, sketchLocked: true,
  } };
  const parts = partsOf({ ...responses, [graphStageId]: connected });
  assert.equal(parts.continuity, false, 'the classification is wrong: buckets are whole numbers');
  assert.equal(parts[graphStageId], true, 'the graph follows the student\'s own classification');
  // Follow-through is not a free pass: a line that misses their points is still wrong.
  const offLine = { ...connected, construction: { ...connected.construction, strokes: [sketchAlong(model.viewWindow, (x) => 6 * x + 8, 0, 5)] } };
  assert.equal(partsOf({ ...responses, [graphStageId]: offLine })[graphStageId], false);
});

test('under the right "discrete", the same item asks for separate points, and they are right', () => {
  const { responses, graphStageId, model, pointOnly } = workUnder('discrete');
  assert.equal(pointOnly, true, 'the graph step asks for separate points');
  const points = { [ARTIFACT]: 'graph', isComplete: true, analysis: {}, construction: { placements: placementsOf(model), pointsLocked: true } };
  const parts = partsOf({ ...responses, [graphStageId]: points });
  assert.equal(parts.continuity, true);
  assert.equal(parts[graphStageId], true);
});
