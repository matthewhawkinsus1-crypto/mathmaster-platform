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
import { vertexCoverageMessage } from '../../src/tools/systemsWorkspace/inequalityFormat.js';
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

test('the browser rule and the grader agree at the 0.15 tolerance, on both sides of it', () => {
  // A second copy of the grader's rule must not drift: a mark 0.149 or exactly
  // 0.15 from a corner finds it, 0.151 does not.
  const all = corners.map(judged);
  for (const [offset, finds] of [[0.149, true], [0.15, true], [0.151, false]]) {
    const vertices = [{ ...all[0], x: all[0].x + offset }, ...all.slice(1)];
    const coverage = vertexCoverage(corners, vertices);
    assert.equal(coverage.complete, finds, `coverage at ${offset}`);
    assert.equal(coverage.missing, finds ? 0 : 1, `missing at ${offset}`);
    assert.equal(verticesPart(vertices).isCorrect, finds, `grader at ${offset}`);
  }
});

test('the coverage line says what is actually wrong', () => {
  const all = corners.map(judged);
  const say = (vertices, letters = []) => vertexCoverageMessage(vertexCoverage(corners, vertices), letters);
  assert.equal(say(all), null, 'nothing to say once every corner is marked');
  assert.match(say(all.slice(0, 2)), /^You have found 2 of the 3 corners of the solution region\./);
  // Every corner marked plus a mark that is none (integrator review: this
  // used to claim two marks shared a corner).
  assert.equal(say([...all, { x: 2, y: 6, includedAnswer: 'no' }], ['D']), 'Vertex D is not a corner of the solution region. Remove it.');
  assert.equal(say([...all, { x: 2, y: 6, includedAnswer: 'no' }, { x: 5, y: 5, includedAnswer: 'no' }], ['D', 'E']), 'Vertex D and Vertex E are not corners of the solution region. Remove them.');
  assert.equal(say([...all, { ...all[0], x: all[0].x + 0.05 }]), 'Two of your marks are on the same corner. Remove the extra mark.');
  // Three marks on one corner: the repeats are counted, not called "two".
  assert.equal(say([...all, { ...all[0], x: all[0].x + 0.05 }, { ...all[0], y: all[0].y + 0.05 }]), '2 of your marks repeat corners you already marked. Remove the extra marks.');
  // One corner left: "the place", not "each other place".
  // (It says what to do, not how: the step's own line says how to mark one, by pointer and by keys, AX32.)
  assert.match(say(all.slice(0, 2)), /Mark the place where two boundary lines meet at the corner you have not marked yet\.$/);
  assert.match(say(all.slice(0, 1)), /Mark each place where two boundary lines meet at a corner you have not marked yet\.$/);
  // One corner: singular. No corner at all: nothing to mark.
  assert.match(vertexCoverageMessage(vertexCoverage([corners[0]], [])), /of the 1 corner of/);
  assert.equal(vertexCoverageMessage(vertexCoverage([], [{ x: 1, y: 1 }]), ['A']), 'This solution region has no corners, so there is nothing to mark. Remove your mark.');
});

test('the vertices step is done only with full coverage where outcomes are shown, and says what is missing', () => {
  // The rule is verticesStepComplete (inequalityBuildPolicy.js, tested as
  // behaviour in tests/platform/inequalityBuildOutcomePolicy.test.mjs); the
  // screen feeds it the grader's coverage of the marks as they stand.
  const stepDone = region(studentBuild, 'const verticesStepDone = ', 'const vertexCoverageReport', 'verticesStepDone');
  assert.match(stepDone, /verticesStepComplete\(\{\s*checked,\s*reports,\s*verdictsShown: buildGate\.verdictsShown,\s*coverageComplete: vertexCoverage\(workingVertices, vertices\)\.complete,\s*\}\)/,
    'where outcomes are shown, every true corner must be marked');
  // Both places that decide "done" use it: the flow (checked as it stands) and
  // the Check's own advance (the press is the check).
  assert.match(studentBuild, /if \(phase === 'vertices'\) return verticesStepDone\(vertexReports\);/);
  assert.match(studentBuild, /: \{ done: verticesStepDone\(vertices\.map\(vertexReport\), true\) \};/);
  assert.match(stepDone, /\(reports, checked = verticesChecked\) =>/);

  const report = region(studentBuild, 'const vertexCoverageReport = ', 'const reasoningDone', 'vertexCoverageReport');
  assert.match(report, /if \(!verticesChecked\) return null;/);
  // A count is a verdict: where outcomes are withheld nothing after this
  // return reads the coverage, and only "No corners" is answered (recorded).
  const withheld = region(report, 'if (!buildGate.verdictsShown) {', '\n    }', 'withheld');
  assert.match(withheld, /return vertices\.length \? null : \{ tone: 'recorded', text: completionLine\(/);
  assert.doesNotMatch(withheld, /vertexCoverage\(/, 'no coverage is read where outcomes are withheld');
  assert.ok(report.indexOf('if (!buildGate.verdictsShown) {') < report.indexOf('vertexCoverage(workingVertices, vertices)'), 'the coverage is read only after the withheld return');
  // Its words are vertexCoverageMessage's (tested above), from the coverage and
  // the letters of the marks near no corner.
  assert.match(report, /vertexCoverageMessage\(coverage, offCornerLetters\)/);
  assert.match(report, /const coverage = vertexCoverage\(workingVertices, vertices\);/);
  assert.match(report, /vertexIncludedExpected\(vertex\) == null \? String\.fromCharCode\(65 \+ index\)/);
  assert.match(studentBuild, /<StepFeedback tone=\{vertexCoverageReport\(\)\?\.tone\}>\{vertexCoverageReport\(\)\?\.text\}<\/StepFeedback>/);
});
