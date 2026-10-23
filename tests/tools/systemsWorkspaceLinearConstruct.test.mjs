/*
 * GRAPH MODE, CONSTRUCTED: THE STUDENT GRAPHS BOTH LINES.
 *
 * The analyze form of graph mode draws the system's two lines, so a student
 * only reads where they cross. `interaction: "construct"` (opt-in) draws
 * nothing for them: they plot two points on each equation's line, then read
 * the system from the lines they drew. These tests pin:
 *
 *   - the shared grader: each line is two distinct points ON it (0.08, the
 *     constructed-inequality tolerance), then the classification and the
 *     intersection exactly as before; browser and server agree byte for byte;
 *     work without points (an old client) is never complete;
 *   - the analyze form is unchanged: no line parts, the same value;
 *   - the component sends exactly the work the grader reads, draws only the
 *     student's own lines, hides the coordinate readout, and is chosen only
 *     for a construct question;
 *   - the V5 compiler keeps the construct fields, Pre-Flight refuses a
 *     misspelled interaction, an equation label that is not the graded line
 *     and a line the plane cannot show, and the value and the worked review
 *     count the graphing.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { gradeServerResponse, gradeToolWork } from '../../functions/shared/serverGrading/serverResponseGrading.mjs';
import { estimateQuestionValue } from '../../functions/shared/questionValue.mjs';
import { validateToolQuestion } from '../../src/tools/toolSchemas.js';
import { compileAuthoringIntentV5 } from '../../src/platform/contract/authoringIntentV5.js';
import { buildToolSolutionReviewModel } from '../../src/tools/shared/toolSolutionReview.js';
import { componentSource, executableSource, region } from '../platform/helpers/sourceContract.mjs';

const sw = (fields) => ({ type: 'systemsWorkspace', toolId: 'systemsWorkspace', mode: 'linear', prompt: 'Graph the system.', ...fields });
const TICKETS = sw({
  interaction: 'construct',
  system: { m1: -0.5, b1: 300, m2: -1, b2: 450 },
  equationLabels: ['5s + 10a = 3000', 's + a = 450'],
  variables: ['s', 'a'],
  graph: { xMin: 0, xMax: 700, yMin: 0, yMax: 500, xStep: 50, yStep: 50 },
});
const P = (x, y) => ({ x, y });
const work = (first, second, classification, x = '', y = '') => ({ construction: [{ points: first }, { points: second }], classification, x, y });

const gradeBothWays = (question, studentWork) => {
  const browser = gradeToolWork({ toolId: 'systemsWorkspace', question, work: studentWork });
  const server = gradeServerResponse({ question, response: JSON.parse(JSON.stringify(browser.toolResponse)) });
  assert.equal(server.isCorrect, browser.isCorrect, 'the server agrees with the browser');
  assert.equal(server.isComplete, browser.isComplete);
  assert.equal(server.score, browser.score);
  return browser;
};
const verdict = (result) => Object.fromEntries((result.parts || []).map((item) => [item.id, item.isCorrect]));

test('the shared grader marks each constructed line, then the system, browser and server alike', () => {
  const right = gradeBothWays(TICKETS, work([P(0, 300), P(600, 0)], [P(0, 450), P(450, 0)], 'one', '300', '150'));
  assert.equal(right.isCorrect, true);
  assert.equal(right.isComplete, true);
  assert.deepEqual(Object.keys(verdict(right)), ['line-1', 'line-2', 'classification', 'solution']);

  const offLine = gradeBothWays(TICKETS, work([P(0, 300), P(600, 10)], [P(0, 450), P(450, 0)], 'one', '300', '150'));
  assert.deepEqual(verdict(offLine), { 'line-1': false, 'line-2': true, classification: true, solution: true });
  assert.equal(offLine.isCorrect, false, 'a right answer read from a wrong graph is not correct');

  const twice = gradeBothWays(TICKETS, work([P(0, 300), P(0, 300)], [P(0, 450), P(450, 0)], 'one', '300', '150'));
  assert.equal(verdict(twice)['line-1'], false, 'one point twice is not a line');

  const nearly = gradeBothWays(TICKETS, work([P(0, 300.05), P(600, 0)], [P(0, 450), P(450, 0)], 'one', '300', '150'));
  assert.equal(verdict(nearly)['line-1'], true, 'within the 0.08 a constructed boundary point has');

  const wrongPoint = gradeBothWays(TICKETS, work([P(0, 300), P(600, 0)], [P(0, 450), P(450, 0)], 'one', '150', '300'));
  assert.deepEqual(verdict(wrongPoint), { 'line-1': true, 'line-2': true, classification: true, solution: false });

  const unfinished = gradeBothWays(TICKETS, work([P(0, 300), P(null, null)], [P(0, 450), P(450, 0)], 'one', '300', '150'));
  assert.equal(unfinished.isComplete, false, 'a line with one point is not finished work');

  const oldClient = gradeBothWays(TICKETS, { classification: 'one', x: '300', y: '150' });
  assert.equal(oldClient.isComplete, false);
  assert.equal(oldClient.isCorrect, false, 'answers with no graph never earn the construct question');
});

test('the special cases are read from the student\'s lines too', () => {
  const parallel = sw({ interaction: 'construct', system: { m1: 10, b1: 25, m2: 10, b2: 40 }, graph: { xMin: 0, xMax: 10, yMin: 0, yMax: 160 } });
  const right = gradeBothWays(parallel, work([P(0, 25), P(5, 75)], [P(0, 40), P(2, 60)], 'none'));
  assert.equal(right.isCorrect, true);
  assert.deepEqual(Object.keys(verdict(right)), ['line-1', 'line-2', 'classification']);
  assert.equal(gradeBothWays(parallel, work([P(0, 25), P(5, 75)], [P(0, 40), P(2, 60)], 'one', '1', '1')).isCorrect, false);
});

test('the analyze form is unchanged: no line parts, and the same value as before', () => {
  const analyze = sw({ system: { m1: -0.5, b1: 300, m2: -1, b2: 450 } });
  const result = gradeBothWays(analyze, { x: '300', y: '150', classification: 'one' });
  assert.equal(result.isCorrect, true);
  assert.deepEqual(Object.keys(verdict(result)), ['classification', 'solution']);
  const analyzeValue = estimateQuestionValue(analyze);
  const constructValue = estimateQuestionValue(TICKETS);
  assert.ok(constructValue.units > analyzeValue.units, 'graphing both lines is counted');
  assert.equal(constructValue.items.filter((item) => item.kind === 'construct' && item.label === 'Graph each equation').length, 2, JSON.stringify(constructValue.items));
  const parallel = estimateQuestionValue(sw({ interaction: 'construct', system: { m1: 2, b1: 1, m2: 2, b2: 5 } }));
  assert.equal(parallel.value, estimateQuestionValue(sw({ interaction: 'construct', system: { m1: 2, b1: 1, m2: -1, b2: 4 } })).value, 'and the value never depends on the answer');
});

test('the workspace sends the work the grader reads, draws only the student\'s lines, and is chosen only for a construct question', () => {
  const source = executableSource(componentSource('src/tools/systemsWorkspace/SystemsWorkspace.jsx'));
  const mode = region(source, 'function LinearConstructMode(', 'function LinearQuadraticMode(', 'LinearConstructMode');
  assert.match(mode, /const work = \{ construction:parsed\.map\(\(ends\) => \(\{ points:ends \}\)\), classification, x, y \};/);
  assert.match(mode, /useReportToolWork\(work\);/);
  assert.match(mode, /if \(!ready\) return;\s*const result = gradeToolCheck\(systemsWorkspaceGrader, questionData, work\);\s*submit\(\{ isCorrect: result\.isCorrect, score: result\.score \}, work, \{ mode:'linear', parts: result\.parts \}\);/);
  assert.match(mode, /const ready = classified && pointsTyped;/, 'nothing is sent before both lines are drawn and the system classified');
  assert.match(mode, /lines=\{drawnLines\}/, 'only the lines the student\'s points determine are drawn');
  assert.match(mode, /const drawnLines = parsed\.map\(\(\[first, second\], index\) => \{/, 'drawn from the student\'s parsed points, never from the system');
  assert.match(mode, /revealCoordinates=\{false\}/, 'the plane does not read out the crossing point');
  assert.match(mode, /onPlot=\{handlePlot\}/);
  assert.match(mode, /enlargeable=\{false\}/);
  const dispatch = region(source, 'export default function SystemsWorkspace(', '\n}', 'SystemsWorkspace');
  assert.match(dispatch, /const linearConstruct = questionData\.interaction === 'construct'\s*&& !\['inequalities', 'linearQuadratic', 'matrix', 'matrix3', 'spatial', 'algebraic'\]\.includes\(mode\);/);
  assert.match(dispatch, /: linearConstruct \? <LinearConstructMode questionData=\{questionData\} onAction=\{onAction\}\/>\s*: <LinearMode questionData=\{questionData\} onAction=\{onAction\}\/>/);
});

test('the V5 compiler keeps the construct form, and Pre-Flight refuses what cannot be graded honestly', () => {
  const compiled = compileAuthoringIntentV5({
    schemaVersion: 5,
    assignment: { title: 'Construct', courseId: 'algebra1', instructionalPurpose: 'lesson', gradingPurpose: 'classwork' },
    sections: [{ id: 'cw', role: 'classwork', title: 'Classwork', questions: [{
      questionId: 'graph-it', standard: 'A.3F', studentActions: ['graphSystem'], dok: 2, difficultyBand: 2, prompt: 'Graph both equations.',
      system: TICKETS.system, graph: TICKETS.graph, interaction: 'construct', equationLabels: TICKETS.equationLabels, variables: ['s', 'a'], snapStep: 50,
    }] }],
  }).package.sections[0].questions[0];
  assert.equal(compiled.type, 'systemsWorkspace');
  assert.equal(compiled.interaction, 'construct');
  assert.deepEqual(compiled.equationLabels, TICKETS.equationLabels);
  assert.equal(compiled.snapStep, 50);
  assert.deepEqual(validateToolQuestion(compiled).errors, []);

  assert.match(validateToolQuestion({ ...TICKETS, interaction: 'built' }).errors.join(' '), /interaction must be "analyze" or "construct"/);
  assert.match(validateToolQuestion({ ...TICKETS, equationLabels: ['5s + 10a = 300', 's + a = 450'] }).errors.join(' '), /equationLabels\[0\] \("5s \+ 10a = 300"\) is not the line a = -0\.5s \+ 300/);
  assert.match(validateToolQuestion({ ...TICKETS, equationLabels: ['5s + 10a = 3000'] }).errors.join(' '), /equationLabels must be two equations/);
  assert.deepEqual(validateToolQuestion({ ...TICKETS, equationLabels: ['5s + 10a = 3000', '−s − a = −450'] }).errors, [], 'a true minus is read as one');
  assert.match(validateToolQuestion(sw({ interaction: 'construct', system: { m1: 1, b1: 40, m2: 2, b2: 1 } })).errors.join(' '), /equation 1 never crosses the drawn graph/);
});

test('the worked review starts by graphing both lines', () => {
  const steps = (question) => buildToolSolutionReviewModel(question)?.steps || [];
  assert.ok(steps(TICKETS).some((step) => /Graph each line from two of its own points/.test(step)));
  assert.ok(!steps(sw({ system: TICKETS.system })).some((step) => /Graph each line/.test(step)), 'the analyze form is unchanged');
});
