import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import systemsWorkspaceGrader from '../../functions/shared/serverGrading/tools/systemsWorkspace.mjs';
import { gradeServerResponse } from '../../functions/shared/serverGrading/serverResponseGrading.mjs';
import {
  authoredBoundaryFromInequality,
  feasibleRegionVertices,
  vertexCoverage,
} from '../../functions/shared/toolMath/systemsWorkspace/inequalityBuilderAdapter.mjs';
import { gradeToolCheck } from '../../src/tools/shared/sharedToolGrading.js';
import { executableSource, region } from '../platform/helpers/sourceContract.mjs';

/*
 * PR-22 (Codex on #444): THE VERTICES STEP IS DONE ONLY WHEN THE FINAL CHECK
 * WOULD AGREE.
 *
 * The step used to read "done" once every mark the student had made was a
 * correctly judged corner — two of three corners was enough — and then the
 * final check marked "Every vertex found and judged" wrong. The step now asks
 * vertexCoverage, which states the grader's rule (each true corner has a mark
 * within 0.15, exactly as many marks as corners). These tests pin that the
 * helper and the shared grader agree, and that the screen uses the helper.
 */

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const studentBuild = executableSource(read('src/tools/systemsWorkspace/StudentBuildInequalityMode.jsx'));

const QUESTION = {
  type: 'systemsWorkspace',
  prompt: 'Systems',
  mode: 'inequalities',
  reasoning: { classifyRegion: true, vertices: true },
  inequalities: [{ m: 0, b: 0, relation: '>=' }, { orientation: 'vertical', x: 0, relation: '>=' }, { m: -1, b: 4, relation: '<' }],
};
const corners = feasibleRegionVertices(QUESTION.inequalities.map(authoredBoundaryFromInequality));
const judged = (corner) => ({ x: corner.x, y: corner.y, includedAnswer: corner.included ? 'yes' : 'no' });
const emptyBuild = () => ({
  method: '', x1: '', y1: '', x2: '', y2: '', slope: '', intercept: '', constant: '',
  point1Plotted: false, point2Plotted: false,
  boundaryAttempts: 0, style: '', styleAttempts: 0, shadePoint: null, shadeAttempts: 0, visible: true,
});

const verticesPart = (vertices) => {
  const work = { build: Array.from({ length: 3 }, emptyBuild), regionClassification: 'bounded', vertices };
  const browser = gradeToolCheck(systemsWorkspaceGrader, QUESTION, work);
  const server = gradeServerResponse({ question: QUESTION, response: JSON.parse(JSON.stringify(browser.toolResponse)) });
  const part = browser.parts.find((item) => item.id === 'vertices');
  assert.deepEqual(server.parts.find((item) => item.id === 'vertices'), part, 'browser and server agree');
  return part;
};

test('vertexCoverage states the grader\'s "every vertex found" rule', () => {
  assert.equal(corners.length, 3);
  const all = corners.map(judged);
  const cases = {
    'every corner': all,
    'two of three corners': all.slice(0, 2),
    'one corner': all.slice(0, 1),
    'every corner and a point that is no corner': [...all, { x: 9, y: 9, includedAnswer: 'no' }],
    'two corners and a second mark on one of them': [...all.slice(0, 2), { x: all[0].x + 0.05, y: all[0].y, includedAnswer: all[0].includedAnswer }],
    'two corners and a point that is no corner': [...all.slice(0, 2), { x: 9, y: 9, includedAnswer: 'no' }],
  };
  for (const [label, vertices] of Object.entries(cases)) {
    const coverage = vertexCoverage(corners, vertices);
    // Every mark here is judged right, so the part is correct exactly when the coverage is.
    assert.equal(verticesPart(vertices).isCorrect, coverage.complete, label);
  }
  assert.deepEqual(vertexCoverage(corners, all.slice(0, 2)), { total: 3, marked: 2, missing: 1, offCorner: 0, complete: false });
  assert.deepEqual(vertexCoverage(corners, cases['two corners and a point that is no corner']), { total: 3, marked: 3, missing: 1, offCorner: 1, complete: false });
  assert.equal(vertexCoverage(corners, cases['two corners and a second mark on one of them']).missing, 1);
  assert.equal(vertexCoverage(corners, all).complete, true);
});

test('the vertices step is done only with full coverage where outcomes are shown, and says what is missing', () => {
  const stepDone = region(studentBuild, 'const verticesStepDone = ', 'const vertexCoverageReport', 'verticesStepDone');
  assert.match(stepDone, /reports\.every\(\(report\) => report\.done\)/);
  assert.match(stepDone, /!buildGate\.verdictsShown \|\| vertexCoverage\(workingVertices, vertices\)\.complete/,
    'where outcomes are shown, every true corner must be marked');
  // Both places that decide "done" use it: the flow and the Check's own advance.
  assert.match(studentBuild, /if \(phase === 'vertices'\) return verticesStepDone\(vertexReports\);/);
  assert.match(studentBuild, /: \{ done: verticesStepDone\(vertices\.map\(vertexReport\)\) \};/);

  const report = region(studentBuild, 'const vertexCoverageReport = ', 'const reasoningDone', 'vertexCoverageReport');
  assert.match(report, /if \(!verticesChecked \|\| !buildGate\.verdictsShown\) return null;/, 'a count is a verdict: never on a DOL, quiz or test');
  assert.match(report, /You have found \$\{found\} of the \$\{coverage\.total\} corners/);
  assert.match(studentBuild, /<StepFeedback tone=\{vertexCoverageReport\(\)\?\.tone\}>\{vertexCoverageReport\(\)\?\.text\}<\/StepFeedback>/);
});
