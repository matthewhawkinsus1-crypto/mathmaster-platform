// A CHECKED STEP IS STALE WHEN A STEP IT WAS BUILT FROM CHANGES.
//
// Walkthrough 2026-10-22, Algebra I DOL #3 Review PR 2 (popcorn): a connected
// graph was checked against the student's "continuous"; they switched to
// "discrete", and the graph kept "✓ Checked correct" (and its description still
// said a curve was drawn).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildWorkflowReviewState } from '../../src/platform/workflow/workflowReviewState.js';

const stages = [
  { id: 'equation', kind: 'equationInput' },
  { id: 'table', kind: 'tableInput', sourceStageId: 'equation' },
  { id: 'continuity', kind: 'classification' },
  { id: 'graph', kind: 'graphConstruction', sourceStageId: 'table', continuityStageId: 'continuity' },
  { id: 'domain', kind: 'domainInput' },
];
const submitted = { equation: '6x', table: [[0, 0], [1, 6]], continuity: 'continuous', graph: { points: [[0, 0], [1, 6]] }, domain: '0 ≤ x ≤ 5' };
const review = {
  responseKey: JSON.stringify(submitted),
  parts: Object.keys(submitted).map((id) => ({ id, isCorrect: id !== 'continuity' })),
};
const statusOf = (responses) => Object.fromEntries(buildWorkflowReviewState({ stages, responses, review }).map((entry) => [entry.id, `${entry.status}${entry.upstreamChanged ? `<${entry.upstreamChanged}` : ''}`]));

test('nothing changed: each step keeps its verdict', () => {
  assert.deepEqual(statusOf(submitted), { equation: 'correct', table: 'correct', continuity: 'incorrect', graph: 'correct', domain: 'correct' });
});

test('changing "discrete or continuous" makes the graph checked against it stale; an unrelated step keeps its verdict', () => {
  assert.deepEqual(statusOf({ ...submitted, continuity: 'discrete' }), { equation: 'correct', table: 'correct', continuity: 'changed', graph: 'changed<continuity', domain: 'correct' });
});

test('a changed equation reaches the graph through its table', () => {
  assert.deepEqual(statusOf({ ...submitted, equation: '6x+1' }), { equation: 'changed', table: 'changed<equation', continuity: 'incorrect', graph: 'changed<table', domain: 'correct' });
});

test('the runner says which, and the graph no longer claims a curve over separate points', () => {
  const runner = readFileSync(new URL('../../src/platform/workflow/WorkflowRunner.jsx', import.meta.url), 'utf8');
  assert.match(runner, /upstreamChanged \? '↻ An earlier step changed — check again' : '↻ Edited — check again'/);
  const workspace = readFileSync(new URL('../../src/InteractiveGraphWorkspace.jsx', import.meta.url), 'utf8');
  assert.match(workspace, /curveDrawn: Boolean\(construction\.snapped\) && !pointOnly,/);
});
