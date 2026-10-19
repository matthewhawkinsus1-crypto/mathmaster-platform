import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { region } from './helpers/sourceContract.mjs';

import {
  checkPlottedPoints,
  describeVerticalMiss,
  summarizeSelfCheck,
} from '../../src/platform/student/graphSelfCheck.js';
import graphWorkspaceGrader from '../../functions/shared/serverGrading/tools/graphWorkspace.mjs';
import { boundSketchStrokes, buildGraphWorkspaceModel, graphToViewBox } from '../../functions/shared/toolMath/graphWorkspace/graphWorkspaceModel.mjs';
import { gradeToolCheck } from '../../src/tools/shared/sharedToolGrading.js';
import { attemptSupportUsageFrom } from '../../src/platform/supports/supportUseMemory.js';

const codeOf = (path) => readFileSync(path, 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1');

const line = (x) => 2 * x - 1;
const tasks = [{ id: 'a', label: 'x = 0' }, { id: 'b', label: 'x = 2' }, { id: 'c', label: 'x = 3' }];

test('a plotted point is measured against the function it was meant to land on', () => {
  const report = checkPlottedPoints({
    placements: { a: [0, -1], b: [2, 5] },
    tasks,
    evaluate: line,
  });
  assert.equal(report.checked, 2);
  assert.equal(report.results[0].correct, true);
  assert.equal(report.results[1].correct, false);
  // Which way, and what to work out — never by how much (HELP-22).
  assert.equal(report.results[1].text, 'too high — find f(2) and compare');
  assert.equal(report.results[1].direction, 'high');
  assert.equal(report.allOnFunction, false);
});

test('the miss says too high or too low and sends the student to the rule, never the distance (HELP-22)', () => {
  // "(3, 4) — 2 units below the function" was the correction itself: the
  // student moved the point up 2 and learned nothing about f(3).
  assert.equal(describeVerticalMiss(3, 5, { x: 3 }).text, 'too low — find f(3) and compare');
  assert.equal(describeVerticalMiss(7, 5, { x: 3 }).text, 'too high — find f(3) and compare');
  assert.equal(describeVerticalMiss(7, 5, { x: -1.5, name: 'g' }).text, 'too high — find g(−1.5) and compare');
  assert.equal(describeVerticalMiss(4, 5).text, 'too low', 'no x, no rule to name');
  assert.equal(describeVerticalMiss(5, 5).correct, true);
  [[3, 5], [7, 5], [4.5, 5], [-10, 5]].forEach(([plotted, real]) => {
    assert.doesNotMatch(describeVerticalMiss(plotted, real, { x: 3 }).text, /unit|above|below|\d+(?:\.\d+)? /, 'no distance');
  });
  const report = checkPlottedPoints({ placements: { c: [3, 4] }, tasks, evaluate: line });
  assert.equal(report.results[0].delta, undefined, 'the distance is not carried to the screen');
});

test('a point the student has not placed is not called wrong', () => {
  // "Not plotted" is an unfinished task, not a mistake. Reporting a blank as
  // incorrect is how a check loses a student's trust.
  const report = checkPlottedPoints({ placements: { a: [0, -1] }, tasks, evaluate: line });
  assert.equal(report.checked, 1);
  assert.equal(report.results.length, 1);
  assert.equal(report.results[0].id, 'a');
});

test('a point outside the domain is reported as that, not as a miss', () => {
  const root = (x) => (x < 0 ? Number.NaN : Math.sqrt(x));
  const report = checkPlottedPoints({
    placements: { a: [-4, 2] },
    tasks: [{ id: 'a', label: 'x = -4' }],
    evaluate: root,
  });
  assert.equal(report.results[0].undefinedHere, true);
  assert.equal(report.results[0].correct, false);
  assert.match(report.results[0].text, /no value at this x/);
});

test('the check only ever evaluates x-values the student chose', () => {
  // A check that could be walked along the axis would let a student harvest the
  // whole graph instead of answering the analysis questions about it.
  const seen = [];
  checkPlottedPoints({
    placements: { a: [0, 0], b: [2, 0] },
    tasks,
    evaluate: (x) => { seen.push(x); return line(x); },
  });
  assert.deepEqual(seen, [0, 2]);
});

test('a malformed placement is skipped rather than crashing the panel', () => {
  const report = checkPlottedPoints({
    placements: { a: 'undefined', b: [1], c: [Number.NaN, 3] },
    tasks,
    evaluate: line,
  });
  assert.equal(report.checked, 0);
  assert.equal(report.allOnFunction, false);
  assert.deepEqual(checkPlottedPoints({}), { checked: 0, results: [], allOnFunction: false });
});

test('the summary counts without naming, so it cannot replace the list', () => {
  const all = checkPlottedPoints({ placements: { a: [0, -1], b: [2, 3] }, tasks, evaluate: line });
  assert.equal(summarizeSelfCheck(all), 'All 2 of your points are on the function.');
  const some = checkPlottedPoints({ placements: { a: [0, -1], b: [2, 9] }, tasks, evaluate: line });
  assert.equal(summarizeSelfCheck(some), '1 of 2 of your points are on the function.');
  assert.match(summarizeSelfCheck(null), /Plot at least one point/);
});

test('the check never moves the point it is judging', () => {
  // A check that fixed the answer would teach where to click rather than what
  // the function does.
  const placements = { a: [0, 5] };
  const before = JSON.stringify(placements);
  checkPlottedPoints({ placements, tasks, evaluate: line });
  assert.equal(JSON.stringify(placements), before);

  const source = codeOf('src/InteractiveGraphWorkspace.jsx');
  const action = source.slice(source.indexOf('const runSelfCheck'), source.indexOf('const checkPoints'));
  assert.doesNotMatch(action, /placeTask|constructionHistory\.setValue/);
});

test('a DOL cannot carry the self-check, however the question is authored', () => {
  // It is mathematical help, so it follows the hint permission. Deciding it
  // from the section policy rather than a question field means an author cannot
  // switch it on for an exit ticket, and a bank question carried into a DOL
  // loses it automatically.
  const engine = codeOf('src/QuestionEngine.jsx');
  // The same gates as the hint ladder: hints allowed, no server-graded host,
  // a recognised role (an unknown role fails closed), and the item open.
  assert.match(engine, /const selfCheckAllowed = resolvedActivityPolicy\?\.hintsAllowed !== false && !serverGrading && ladderRoleKnown && !locked;/);
  assert.match(engine, /const hintControlAllowed = toolHintsAllowed && !serverGrading && ladderRoleKnown;/);
  assert.match(engine, /const toolHintsAllowed = resolvedActivityPolicy\?\.hintsAllowed !== false;/);
  assert.doesNotMatch(engine, /question\.\w*[Ss]elfCheck/);

  const workspace = codeOf('src/InteractiveGraphWorkspace.jsx');
  assert.match(workspace, /selfCheckAllowed = false/);
  assert.match(workspace, /if \(!selfCheckAllowed \|\| construction\.pointsValidated\) return;/);
});

test('using the check is recorded like a hint, so mastery weight is discounted', () => {
  // Without this an assisted solve and an independent one are indistinguishable
  // in the evidence, which is the whole reason hint usage is tracked at all.
  const engine = codeOf('src/QuestionEngine.jsx');
  assert.match(engine, /onSelfCheck: \(\) => setHintUsed\(true\)/);
  // The attempt's usage is built from hintUsed (supportUseMemory.js), and a
  // hint makes the attempt a supported one.
  assert.match(engine, /const attemptSupportUsage = \(\) => attemptSupportUsageFrom\(\{[\s\S]*?\bhintUsed,/);
  assert.equal(attemptSupportUsageFrom({ hintUsed: true }).isMathematicallyIndependent, false);

  const workspace = codeOf('src/InteractiveGraphWorkspace.jsx');
  assert.match(workspace, /if \(report\.checked > 0\) onSelfCheck\?\.\(report\)/);
});

test('a verdict never outlives the point it described', () => {
  // A report about a point the student has since moved reads as the platform
  // disagreeing with what is on screen. Pointer, drag and keyboard placements
  // all go through placeTask, so that is where the report has to be cleared —
  // after the guard (a refused placement moves nothing, so the report still
  // describes the screen) and before the point is stored.
  const source = codeOf('src/InteractiveGraphWorkspace.jsx');
  const place = region(source, 'const placeTask = ', 'const nearestEndpoint', 'placeTask');
  const guard = place.search(/\) return;/);
  const clear = place.indexOf('setSelfCheckReport(null)');
  const store = place.indexOf('constructionHistory.setValue');
  assert.ok(clear > -1, 'placeTask must clear the self-check report');
  assert.ok(guard > -1 && guard < clear, 'the report is cleared only for a placement that happens');
  assert.ok(store > clear, 'the report is cleared before the moved point is stored');
});

test('the student plotted graph is graded evidence in its own right', () => {
  // Point placements and the snapped curve are graded parts, not scaffolding
  // toward the analysis answers, so a construction the student got right counts
  // even when the analysis is wrong.
  //
  // The parts are assembled by the shared grader the workspace reports through
  // (serverGrading/tools/graphWorkspace.mjs), so the behaviour is asserted on
  // that grader, and the workspace is held to reporting its result.
  const question = {
    type: 'functionInvestigation',
    functionSpec: { type: 'linear', m: 2, b: -1 },
    graph: { xMin: -5, xMax: 5, yMin: -10, yMax: 10 },
    pointTasks: [
      { id: 'a', label: 'x = 0', x: 0, expected: [0, -1] },
      { id: 'b', label: 'x = 2', x: 2, expected: [2, 3] },
    ],
    requireEndpointMarkers: false,
    analysisRequests: [{ id: 'slope', kind: 'value', label: 'Slope', expected: '2' }],
  };
  const model = buildGraphWorkspaceModel(question);
  // Traced along the true line, bounded the way the workspace stores a stroke.
  const traced = boundSketchStrokes(model.visiblePaths.map((path) => path.map(graphToViewBox(model.viewWindow))));
  // `pointsLocked`: the student committed the placements with "Check Point
  // Placements", and `sketchLocked`: the sketch snapped on screen — the
  // workspace counts neither before its commit.
  const result = gradeToolCheck(graphWorkspaceGrader, question, {
    construction: { placements: { a: [0, -1], b: [2, 3] }, pointsLocked: true, strokes: traced, sketchLocked: true },
    analysis: { answers: { slope: '7' } },
  });
  const part = (id) => result.parts.find((entry) => entry.id === id);
  assert.equal(part('a').label, 'Point placement: x = 0');
  assert.equal(part('a').isCorrect, true);
  assert.equal(part('b').isCorrect, true);
  assert.equal(part('graph-curve').isCorrect, true);
  assert.equal(part('slope').isCorrect, false);
  assert.equal(result.isCorrect, false);
  assert.ok(result.score > 0.7, `the correct construction earns its credit (score ${result.score})`);

  const source = codeOf('src/InteractiveGraphWorkspace.jsx');
  assert.match(source, /gradeToolCheck\(graphWorkspaceGrader, question, work\)/);
  assert.match(source, /answerStateFromSharedGrading\(sharedGrade, \{ questionDetails \}\)/);
});

test('the self-check control clears the Chromebook touch minimum', () => {
  const source = codeOf('src/InteractiveGraphWorkspace.jsx');
  const block = source.slice(source.indexOf('onClick={runSelfCheck}'));
  assert.match(block.slice(0, 420), /minHeight: 44/);
});

test('"Check Point Placements" stays free; which way a point is off is an opt-in, charged only on that press (HELP-22)', () => {
  const source = codeOf('src/InteractiveGraphWorkspace.jsx');
  const check = region(source, 'const checkPoints = () => {', 'const beginDrawing', 'checkPoints');
  // The commit check never builds a direction report and never charges.
  assert.doesNotMatch(check, /onSelfCheck|selfCheckReportFor|setSelfCheckReport/);
  assert.match(check, /setPointMissShown\(!correct\);/);
  // The opt-in runs the self-check, which is what charges.
  const run = region(source, 'const runSelfCheck = () => {', '};', 'runSelfCheck');
  assert.match(run, /if \(report\.checked > 0\) onSelfCheck\?\.\(report\);/);
  const offer = region(source, '{selfCheckAllowed && !construction.pointsValidated && Object.keys(construction.placements).length > 0', '</button>', 'the opt-in');
  assert.match(offer, /&& \(outcomesWithheld \|\| Object\.keys\(construction\.placements\)\.length < tasks\.length \|\| pointMissShown\) && \(/, 'offered where withheld, on a partial plot, or after a miss');
  assert.match(offer, /onClick=\{runSelfCheck\}/);
  assert.match(offer, /\{outcomesWithheld \? 'Check my points' : 'Which way is each point off\?'\}/);
  assert.equal((source.match(/onClick=\{runSelfCheck\}/g) || []).length, 1, 'one self-check control');
  // A point that moves takes the miss (and its offer) away with it.
  assert.match(region(source, 'const placeTask = ', 'const nearestEndpoint', 'placeTask'), /setPointMissShown\(false\);/);
});

test('where outcomes are shown the report lists only the points that are off (HELP-22)', () => {
  const source = codeOf('src/InteractiveGraphWorkspace.jsx');
  const report = region(source, '{selfCheckReport && !construction.pointsValidated && (', '</ul>', 'the report');
  assert.match(report, /selfCheckReport\.results\.filter\(\(entry\) => outcomesWithheld \|\| !entry\.correct\)\.map/);
});

test('the check and its report are body-size text, not 11-12px (HELP-22)', () => {
  const source = codeOf('src/InteractiveGraphWorkspace.jsx');
  const report = region(source, '{selfCheckReport && !construction.pointsValidated && (', '</ul>', 'the report');
  assert.match(report, /fontSize: 'calc\(16 \* var\(--mm-px\)\)'/);
  assert.doesNotMatch(report, /calc\(1[12](?:\.5)? \* var/);
  (source.match(/<span[^>]*data-hint-cost-note=""[^>]*>/g) || []).forEach((note) => assert.match(note, /calc\(16 \* var\(--mm-px\)\)/));
});
