// A WORKFLOW GRAPH PLOTS EVERY ROW OF THE STUDENT'S TABLE.
//
// Walkthrough 2026-10-22, Algebra I DOL #3 Review PR 2 (popcorn: x = 0…5).
// The graph step built from the student's six-row table offered P1–P5 only:
// (5, 30) could not be plotted, "All point placements are correct" was said
// with a point missing, and the graph part was marked right without it. The
// builder capped a workflow model's points at five; the browser and the server
// grader both build their tasks with it, so the cap was the grade too.
import test from 'node:test';
import assert from 'node:assert/strict';

import { MAX_WORKFLOW_POINT_TASKS, buildInteractivePointTasks } from '../../functions/shared/toolMath/graphWorkspace/interactiveGraphEngine.mjs';
import { buildGraphWorkspaceModel } from '../../functions/shared/toolMath/graphWorkspace/graphWorkspaceModel.mjs';
import { placementsMatchTasks } from '../../src/interactiveGraphEngine.js';

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

test('a runaway list is still bounded', () => {
  const long = Array.from({ length: 30 }, (_, x) => [x, 6 * x]);
  assert.equal(buildInteractivePointTasks(popcorn, { points: long }).length, MAX_WORKFLOW_POINT_TASKS);
  assert.ok(MAX_WORKFLOW_POINT_TASKS >= 10, 'room for any authored table');
});
