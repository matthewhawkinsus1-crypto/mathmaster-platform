/*
 * THE INSPECTOR'S FIELD-BY-FIELD VIEW, FOR EVERY QUESTION TYPE (#249 Feature 6, #554 item 8).
 *
 * Only multi-answer questions had a readable comparison; every other type
 * showed raw JSON. This holds the view (functions/shared/responseInspectorView
 * .mjs) to a readable answer for each: typed boxes, choices, ordered pairs,
 * systems and tables as rows; graphs and tool work as their key facts (points,
 * lines, inequalities, intervals); Step Algebra and relation work as where the
 * work ended and the steps the student took. Every case goes through the real
 * model and the real graders, and none of it throws on a hostile value.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { buildInspectorModel, captureAutomaticGradingEvidence } from '../../functions/shared/responseInspector.mjs';
import { buildResponseView, savedWorkSteps, stepAlgebraFinal, workFacts } from '../../functions/shared/responseInspectorView.mjs';
import { gradeServerResponse, gradeToolWork, sharedToolGrader } from '../../functions/shared/serverGrading/serverResponseGrading.mjs';
import { buildToolResponse } from '../../functions/shared/serverGrading/toolResponseContract.mjs';
import { PATH_TOOL_QUESTIONS } from './fixtures/pathToolQuestions.mjs';
import { REGISTRY_TOOL_QUESTIONS } from './fixtures/registryToolQuestions.mjs';

const CAPTURED = JSON.parse(readFileSync(new URL('./fixtures/capturedToolResponses.json', import.meta.url), 'utf8'));
const CAPTURED_REGISTRY = JSON.parse(readFileSync(new URL('./fixtures/capturedRegistryToolResponses.json', import.meta.url), 'utf8'));

const fields = (values, type = 'multiAnswer') => ({ kind: 'fields', type, value: '', fields: Object.entries(values).map(([id, value]) => ({ id, value })) });
const scalar = (type, value) => ({ kind: 'scalar', type, value, fields: [] });

/** One attempt as the inspector sees it: graded, its evidence stored, inspected. */
const inspected = ({ question, response, grading = gradeServerResponse({ question, response }), workspace = null }) => buildInspectorModel({
  question,
  record: { status: grading.isCorrect ? 'correct' : 'expired', totalAttempts: 1, attemptCount: 1, partGrades: grading.parts },
  workspace,
  gradingEvidence: captureAutomaticGradingEvidence({ response, grading, question }),
});
const row = (view, id) => view.rows.find((entry) => entry.id === id);
const fact = (view, label) => view.facts.find((entry) => entry.label === label)?.value;

test('typed boxes: what was saved, what was graded, how it was read, the key and the result, per box', () => {
  const question = { questionId: 'q', type: 'multiAnswer', prompt: 'p', answerFields: [{ id: 'r2', label: 'r²', answer: 0.49 }, { id: 'percent', label: 'Percentage', answer: 49 }] };
  const workspace = { available: true, relationToSubmission: 'newer', entries: [{ key: 'k', scope: 'multi-answer', value: { r2: '0.49', percent: '50' }, savedAt: 2 }] };
  const { view } = inspected({ question, response: fields({ r2: '0.49', percent: '4 9' }), workspace });
  assert.equal(view.kind, 'typed');
  assert.equal(view.savedTiming, 'saved after the submission');
  assert.deepEqual(row(view, 'percent'), {
    id: 'percent',
    label: 'Percentage',
    kind: 'typed',
    saved: { text: '50' },
    submitted: { text: '4 9' },
    read: { text: '49', note: 'a number' },
    expected: { text: '49' },
    result: { status: 'correct', label: 'Correct', credit: 100 },
  });
});

test('a choice is shown by the option\'s text, picked and keyed; a template\'s options are not trusted for it', () => {
  const question = { questionId: 'q', type: 'multiAnswer', prompt: 'p', answerFields: [{ id: 'kind', label: 'Kind', type: 'choice', options: [{ id: 'lin', label: 'Linear' }, { id: 'exp', label: 'Exponential' }], answer: 'exp' }] };
  const { view } = inspected({ question, response: fields({ kind: 'lin' }) });
  assert.deepEqual(row(view, 'kind').submitted, { text: 'lin', option: 'Linear' });
  assert.deepEqual(row(view, 'kind').expected, { text: 'Exponential' });
  assert.equal(row(view, 'kind').read, null, 'a choice is not "read" as typed text');
  const template = buildResponseView({ question, response: fields({ kind: 'lin' }), expected: { available: false, reason: 'Unavailable — authoritative delivered question instance was not retained.' } });
  assert.deepEqual(row(template, 'kind').submitted, { text: 'lin' });
  assert.deepEqual(row(template, 'kind').expected, { unavailable: true, text: 'Unavailable — authoritative delivered question instance was not retained.' });
});

test('ordered pairs and systems: the pair as typed, then each coordinate with its own key and result', () => {
  const pair = inspected({ question: { questionId: 'q', type: 'orderedPair', prompt: 'p', answer: '(2,3)' }, response: scalar('orderedPair', '(2, 4)') }).view;
  assert.deepEqual(pair.rows.map(({ id, label, submitted, expected, result }) => [id, label, submitted?.text, expected?.text, result.label]), [
    ['response', 'Ordered pair', '(2, 4)', '(2, 3)', 'Incorrect'],
    ['ordered-x', 'x-coordinate', '2', '2', 'Correct'],
    ['ordered-y', 'y-coordinate', '4', '3', 'Incorrect'],
  ]);
  const system = inspected({ question: { questionId: 'q', type: 'system', prompt: 'p', solution: { x: 3, y: 2 } }, response: scalar('system', '(3, 2)') }).view;
  assert.deepEqual(system.rows.map(({ label, expected, result }) => [label, expected?.text, result.label]), [
    ['Solution (x, y)', '(3, 2)', 'Correct'], ['x-coordinate', '3', 'Correct'], ['y-coordinate', '2', 'Correct'],
  ]);
});

test('tables: each blank by its column and row, with the given values that place it; an ungraded blank says so', () => {
  const question = {
    questionId: 'q', type: 'table', prompt: 'Complete the table.',
    table: { columns: [{ key: 'x', label: 'x' }, { key: 'y', label: 'y' }], rows: [{ x: -1, y: -1 }, { x: 0, y: null }, { x: 2, y: null }, { x: 3, y: null }], answers: { '1:y': 1, '2:y': 5 }, blanks: ['3:y'] },
  };
  const { view } = inspected({ question, response: fields({ '1:y': '1', '2:y': '4', '3:y': '7' }, 'table') });
  assert.deepEqual(view.rows.map(({ label, submitted, expected, result }) => [label, submitted.text, expected.text, result.label]), [
    ['y, row 2 (x = 0)', '1', '1', 'Correct'],
    ['y, row 3 (x = 2)', '4', '5', 'Incorrect'],
    ['y, row 4 (x = 3)', '7', 'Not graded here', 'Not graded here'],
  ]);
});

test('a literal answer: one row, read the way the grader reads it', () => {
  const { view } = inspected({ question: { questionId: 'q', type: 'literal', prompt: 'Solve for y.', solveFor: 'y', acceptedAnswers: ['5'] }, response: scalar('literal', '5.0') });
  assert.deepEqual(view.rows.map(({ label, submitted, read, expected }) => [label, submitted.text, read.text, expected.text]), [['Expression for y', '5.0', '5', '5']]);
});

/* --------------------------------------------------------- graphs and tools */

// Every captured Path tool response and registry tool response, graded by its
// shared grader against the question it was captured on.
const capturedToolCases = () => [
  ...Object.entries(CAPTURED).map(([key, entry]) => ({ key, toolId: entry.pathToolId, question: PATH_TOOL_QUESTIONS[key], work: entry.rawWork })),
  ...Object.entries(CAPTURED_REGISTRY).map(([key, entry]) => ({ key, toolId: entry.toolId, question: REGISTRY_TOOL_QUESTIONS[key], work: JSON.parse(entry.toolResponse.value) })),
].filter(({ toolId, question }) => question && sharedToolGrader(toolId));

test('every captured tool\'s work reads as its key facts, never as the raw response', () => {
  const cases = capturedToolCases();
  assert.ok(cases.length >= 12, `${cases.length} captured tools`);
  for (const { key, toolId, question, work } of cases) {
    const graded = gradeToolWork({ toolId, question, work });
    const { view } = inspected({ question, response: graded.toolResponse, grading: graded });
    assert.ok(['tool', 'steps'].includes(view.kind), `${key}: ${view.kind}`);
    assert.ok(view.facts.length + view.final.length > 0, `${key}: some facts`);
    const shown = JSON.stringify([view.rows, view.facts, view.final]);
    assert.ok(!shown.includes(graded.toolResponse.value) || graded.toolResponse.value.length < 12, `${key}: the raw JSON is not what the teacher reads`);
  }
});

test('graph work: points, a line and an inequality construction are written as a teacher writes them', () => {
  const graphed = workFacts(CAPTURED.graphing2.rawWork);
  assert.deepEqual(graphed, [{ label: 'Points', value: '(0, 1), (2, 5)' }, { label: 'Student line', value: 'y = 2x + 1' }]);
  const shaded = workFacts(CAPTURED.systemsWorkspaceInequalityConstruct.rawWork);
  assert.deepEqual(shaded.filter((entry) => entry.label.startsWith('Construction 1')), [
    { label: 'Construction 1 · Points', value: '(0, 0), (1, 1)' },
    { label: 'Construction 1 · Boundary style', value: 'solid' },
    { label: 'Construction 1 · Shade', value: 'above' },
  ]);
  const unplaced = workFacts(CAPTURED.systemsWorkspaceInequalities.rawWork);
  assert.equal(unplaced.find((entry) => entry.label === 'Construction 1 · Points')?.value, 'not placed, not placed');
  assert.deepEqual(workFacts(CAPTURED.intervalNumberLineRays.rawWork).slice(0, 1), [{ label: 'Intervals', value: '(2, ∞), (-∞, -3]' }]);
  assert.deepEqual(workFacts({ inequalities: [{ m: 1, b: 1, relation: '>=' }, { orientation: 'vertical', x: 1, relation: '<' }] }), [{ label: 'Inequalities', value: 'y ≥ x + 1, x < 1' }]);
});

test('a Graphing check keeps the response the grader recorded for it, and the work its facts', () => {
  const question = PATH_TOOL_QUESTIONS.graphing2;
  const graded = gradeToolWork({ toolId: 'graphing2', question, work: CAPTURED.graphing2.rawWork });
  const { view } = inspected({ question, response: graded.toolResponse, grading: graded });
  assert.ok(view.rows.length >= 2);
  assert.ok(view.rows.every((entry) => entry.kind === 'check' && entry.result), 'each check, with its result');
  assert.equal(fact(view, 'Points'), '(0, 1), (2, 5)');
});

/* ------------------------------------------------------- Step Algebra work */

const STEP_QUESTION = { questionId: 'step', type: 'stepAlgebra', prompt: 'Solve for x.', equation: '2x + 3 = 7', objective: { kind: 'solve', variable: 'x' } };
const workSteps = [
  { kind: 'step', description: 'Subtract 3 from both sides', parts: ['Subtract 3'], before: { left: '2 x + 3', right: '7' }, after: { left: '2 x', right: '4' } },
  { kind: 'step', description: 'Divide both sides by 2', parts: ['Divide by 2'], before: { left: '2 x', right: '4' }, after: { left: 'x', right: '2' } },
];

test('Step Algebra: where the work ended, and the steps the student took from the saved workspace, with when they were saved', () => {
  const response = buildToolResponse({ question: STEP_QUESTION, toolId: 'stepAlgebra', work: { equation: { left: 'x', right: '2' }, promptAnswers: [] } });
  const workspace = { available: true, relationToSubmission: 'same-time', entries: [{ key: 'k', scope: 'step-algebra', value: { equation: { left: 'x', right: '2' }, workSteps }, savedAt: 1 }] };
  const { view } = inspected({ question: STEP_QUESTION, response, workspace });
  assert.equal(view.kind, 'steps');
  assert.deepEqual(view.final, [{ label: 'Final equation', value: 'x = 2' }]);
  assert.deepEqual(view.steps, [
    { description: 'Subtract 3 from both sides', before: '2 x + 3 = 7', after: '2 x = 4' },
    { description: 'Divide both sides by 2', before: '2 x = 4', after: 'x = 2' },
  ]);
  assert.equal(view.stepsTiming, 'saved when it was submitted');
  assert.equal(view.rows.find((entry) => entry.id === 'algebra-objective')?.result.label, 'Correct');
});

test('relation work: the relation it ended on, each candidate checked, the solution set and the number line', () => {
  const final = stepAlgebraFinal({
    relation: { special: null, connective: 'or', branches: [{ expressions: ['x', '3'], relations: ['<'] }, { expressions: ['x', '5'], relations: ['>='] }] },
    candidateChecks: [{ candidate: '4', choice: 'valid', left: '2', right: '2' }, { candidate: '-1', choice: 'extraneous' }],
    solutionSet: { none: false, values: ['4'] },
    representation: { intervals: [{ min: null, max: 3, minClosed: false, maxClosed: false }, { min: 5, max: null, minClosed: true, maxClosed: false }], notation: '(-\\infty,3)\\cup[5,\\infty)', inequality: '' },
  });
  assert.deepEqual(final, [
    { label: 'Final relation', value: 'x < 3 or x ≥ 5' },
    { label: 'Check of 4', value: 'valid (left side 2, right side 2)' },
    { label: 'Check of -1', value: 'extraneous' },
    { label: 'Solution set', value: '4' },
    { label: 'Number line', value: '(-∞, 3) ∪ [5, ∞)' },
    { label: 'Interval notation', value: '(-\\infty,3)\\cup[5,\\infty)' },
  ]);
  assert.deepEqual(stepAlgebraFinal({ relation: { special: 'noSolution', branches: [] } }), [{ label: 'Final relation', value: 'No solution' }]);
  assert.deepEqual(stepAlgebraFinal({ xIntercept: '(2, 0)', yIntercept: '' }), [{ label: 'x-intercept', value: '(2, 0)' }, { label: 'y-intercept', value: 'blank' }]);
});

test('with no saved workspace there are no steps to show, and nothing is invented', () => {
  assert.deepEqual(savedWorkSteps(null), []);
  assert.deepEqual(savedWorkSteps({ available: true, entries: [{ value: { workSteps: [{ description: 'no sides' }, null, 7] } }] }), []);
});

/* ------------------------------------------------- history and old clients */

test('a legacy attempt with no snapshot shows the parts its grader recorded, labelled as legacy', () => {
  const question = { questionId: 'q', type: 'multiAnswer', prompt: 'p', answerFields: [{ id: 'r2', label: 'r²', answer: 0.49 }] };
  const model = buildInspectorModel({ question, record: { status: 'expired', totalAttempts: 1, partGrades: [{ id: 'r2', label: 'r²', response: '0.5', isComplete: true, isCorrect: false }] } });
  assert.equal(model.view.provenance, 'legacy');
  assert.equal(model.view.snapshotLabel, 'Recorded grader response (legacy)');
  assert.deepEqual(row(model.view, 'r2').submitted, { text: '0.5' });
});

test('an opaque response from an older client is the stored text, as written', () => {
  const view = buildResponseView({ question: { type: 'regressionCalculator' }, response: { kind: 'opaque', type: 'regressionCalculator', value: '{"fit":"linear"}' }, result: { parts: [] } });
  assert.equal(view.kind, 'opaque');
  assert.deepEqual(view.facts, [{ label: 'Stored response', value: '{"fit":"linear"}' }]);
});

/* ---------------------------------------------------------- hostile values */

const HOSTILE = ['<script>alert(1)</script>', '‮evil', 'x'.repeat(5000), '', null, undefined, 7, Number.NaN, { toString: null }, ['a', ['b', ['c', ['d', ['e', ['f', ['g', ['h']]]]]]]], { __proto__: { polluted: true } }];

test('no value, however malformed, makes the view throw; long values are bounded and every shown value is text', () => {
  const deep = HOSTILE.reduce((nested, value) => ({ value, nested }), {});
  for (const value of HOSTILE) {
    const views = [
      buildResponseView({ question: { type: 'multiAnswer', answerFields: [{ id: 'a', label: value, options: [value, { id: value }] }, null] }, response: { kind: 'fields', fields: [{ id: 'a', value }, null, 'x'] }, result: { parts: [{ id: 'a', label: value, response: value, credit: value }] }, workspace: { available: true, entries: [{ value: { a: value } }, null] }, expected: { available: true } }),
      buildResponseView({ question: { type: 'table', table: { columns: value, rows: value, answers: value } }, response: { kind: 'fields', fields: [{ id: '0:y', value }] }, result: value }),
      buildResponseView({ question: { type: 'orderedPair', answer: value }, response: { kind: 'scalar', value }, result: { parts: [{ id: 'ordered-x', response: value }] } }),
      buildResponseView({ question: { type: 'graphing2' }, response: { kind: 'tool', toolId: 'graphing2', value: JSON.stringify({ points: [[value, 1]], deep }) }, result: { parts: [{ id: 'p', response: value }] } }),
      buildResponseView({ question: { type: 'stepAlgebra', equation: 'x = 1' }, response: { kind: 'tool', toolId: 'stepAlgebra', value: JSON.stringify({ equation: { left: value, right: value }, relation: { branches: [{ expressions: [value], relations: value }] }, candidateChecks: [value, { candidate: value, choice: value }] }) }, workspace: { available: true, entries: [{ value: { workSteps: [{ description: value, before: { left: value, right: value }, after: { left: value, right: value } }] } }] } }),
      buildResponseView({ question: value, response: value, result: value, workspace: value, expected: value, trace: value }),
    ];
    for (const view of views) {
      assert.ok(view && Array.isArray(view.rows), 'a view');
      const strings = JSON.stringify(view);
      assert.ok(strings.length < 60_000, 'bounded');
      for (const entry of [...view.rows.flatMap((r) => [r.saved, r.submitted, r.read, r.expected]), ...view.facts, ...view.final]) {
        if (entry && typeof entry === 'object' && 'text' in entry) assert.equal(typeof entry.text, 'string');
        if (entry && typeof entry === 'object' && 'value' in entry) assert.equal(typeof entry.value, 'string');
      }
    }
  }
});

// SP-3: a follow-through part is graded against the key built from the
// student's own earlier answer. The inspector shows that key as expected,
// says it was built from the earlier answer, and puts the authored answer
// beside it; the verdict is the recorded one.
test('a follow-through part: expected is the key built from the earlier answer, with the authored answer beside it', async () => {
  const { inequalityQuestion: question } = await import('./helpers/followThroughFixtures.mjs');
  const { view, states } = inspected({ question, response: fields({ slope: '-3', inequality: 'y > -3x + 3' }) });
  assert.deepEqual(row(view, 'inequality').expected, {
    text: 'y > (-3)x + 3 or y > -3x + 3',
    note: "Built from the student's answer to Slope of the boundary line (-3)",
    authored: { text: 'y > -2x + 3' },
  });
  assert.deepEqual(row(view, 'inequality').result, { status: 'correct', label: 'Correct', credit: 100 });
  assert.deepEqual(row(view, 'slope').expected, { text: '-2' });
  const traced = states.gradingTrace.fields.find((field) => field.id === 'inequality');
  assert.deepEqual(traced.followThroughKeys, ['y > (-3)x + 3', 'y > -3x + 3']);
  assert.equal(traced.expected[0], 'y > (-3)x + 3');
  assert.deepEqual(traced.authoredExpected, ['y > -2x + 3']);

  // An unfinished earlier answer builds no key: the authored answer is what the grader used, and the cell says so.
  const unfinished = inspected({ question, response: fields({ slope: '12 +', inequality: 'y > 12x + 3' }) }).view;
  assert.equal(row(unfinished, 'inequality').expected.text, 'y > -2x + 3');
  assert.match(row(unfinished, 'inequality').expected.note, /No key built from the student's answer to Slope of the boundary line/);
  assert.equal(row(unfinished, 'inequality').expected.authored, undefined);
  assert.equal(row(unfinished, 'inequality').result.status, 'incorrect');
});

test('the inspector screen draws a follow-through key\'s authored answer beside it', () => {
  const source = readFileSync(new URL('../../src/components/teacher/ResponseInspectorFieldView.jsx', import.meta.url), 'utf8');
  const valueCell = source.slice(source.indexOf('function ValueCell'), source.indexOf('function ResultCell'));
  assert.match(valueCell, /value\.authored[\s\S]*Authored answer: [\s\S]*<WrittenValue text=\{value\.authored\.text\}/);
});
