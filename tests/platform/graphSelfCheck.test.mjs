import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  checkPlottedPoints,
  describeVerticalMiss,
  summarizeSelfCheck,
} from '../../src/platform/student/graphSelfCheck.js';

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
  assert.equal(report.results[1].text, '2 units above the function');
  assert.equal(report.allOnFunction, false);
});

test('the miss is described in the student own direction and units', () => {
  assert.equal(describeVerticalMiss(3, 5).text, '2 units below the function');
  assert.equal(describeVerticalMiss(7, 5).text, '2 units above the function');
  assert.equal(describeVerticalMiss(4, 5).text, '1 unit below the function');
  assert.equal(describeVerticalMiss(5, 5).correct, true);
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
  assert.match(engine, /const selfCheckAllowed = resolvedActivityPolicy\?\.hintsAllowed !== false && !locked;/);
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
  assert.match(engine, /isMathematicallyIndependent: !hintUsed/);

  const workspace = codeOf('src/InteractiveGraphWorkspace.jsx');
  assert.match(workspace, /if \(report\.checked > 0\) onSelfCheck\?\.\(report\)/);
});

test('a verdict never outlives the point it described', () => {
  // A report about a point the student has since moved reads as the platform
  // disagreeing with what is on screen.
  const source = codeOf('src/InteractiveGraphWorkspace.jsx');
  const place = source.slice(source.indexOf('if (!taskId || !point || construction.pointsValidated) return;'));
  assert.match(place.slice(0, 200), /setSelfCheckReport\(null\)/);
});

test('the student plotted graph is graded evidence in its own right', () => {
  // Point placements and the snapped curve are graded parts, not scaffolding
  // toward the analysis answers, so a construction the student got right counts
  // even when the analysis is wrong.
  const source = codeOf('src/InteractiveGraphWorkspace.jsx');
  assert.match(source, /const constructionParts = constructionEnabled \? \[/);
  assert.match(source, /label: `Point placement: \$\{part\.label\}`/);
  assert.match(source, /id: 'graph-curve'/);
  assert.match(source, /const parts = \[\.\.\.constructionParts/);
});

test('the self-check control clears the Chromebook touch minimum', () => {
  const source = codeOf('src/InteractiveGraphWorkspace.jsx');
  const block = source.slice(source.indexOf('onClick={runSelfCheck}'));
  assert.match(block.slice(0, 420), /minHeight: 44/);
});
