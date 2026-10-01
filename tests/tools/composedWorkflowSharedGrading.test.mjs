/*
 * COMPOSED WORKFLOWS (and the legacy generated `fraction` / `numberLine`) —
 * SERVER-AUTHORITATIVE GRADING PARITY.
 *
 * A composed question (an explicit `workflow`, or a `recipe` that expands into
 * one — functionCharacteristics, figureMatch and graphChoicePreview are all
 * this) used to be marked only in the browser: WorkflowRunner called
 * gradeWorkflow and reported the verdict, and the server kept a 2,000-char
 * slice of `JSON.stringify(responses)` it could not read. Now the stage
 * responses travel as structured work (`{ responses }`, toolId
 * `composedWorkflow`) and ONE function marks them on both sides:
 * functions/shared/serverGrading/questionGraders/composedWorkflow.mjs.
 *
 * These tests pin:
 *   - every stage family's verdict, partial credit and completeness, with the
 *     workflow's own score formula (weighted stage credit, held at 90% until
 *     every graded stage is right) — identical to the device marking it
 *     replaced;
 *   - that the browser path and the server path (gradeServerResponse over
 *     the serialized response) agree exactly, and that the answer state
 *     WorkflowRunner reports is the attempt the server would record;
 *   - which questions the server declines, and why (keys the contract
 *     strips; unsafe student text; recipes that expand to nothing), plus the
 *     bare catalogued types and the per-student-generated fraction /
 *     numberLine. Graph-construction stages are no longer a reason: they are
 *     re-marked from the workspace's work (composedWorkflowGraphStages.test.mjs);
 *   - that tampered or malformed work never crashes and never earns credit,
 *     and that answer-key material never travels as work.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import composedWorkflowGrader, {
  gradeComposedWorkflowCheck,
  gradeComposedWorkflowWork,
} from '../../functions/shared/serverGrading/questionGraders/composedWorkflow.mjs';
import composedWorkflowDeclaration from '../../functions/shared/serverGrading/declarations/types/composedWorkflow.mjs';
import fractionDeclaration from '../../functions/shared/serverGrading/declarations/types/fraction.mjs';
import numberLineDeclaration from '../../functions/shared/serverGrading/declarations/types/numberLine.mjs';
import {
  COMPOSED_WORKFLOW_BLOCKERS,
  composedWorkflowStageWork,
  composedWorkflowSupport,
  composedWorkflowWork,
} from '../../functions/shared/toolMath/workflow/composedWorkflowContract.mjs';
import { unsafeMathText } from '../../functions/shared/toolMath/workflow/expressionSafety.mjs';
import { GRADING_MANIFEST, resolveGradingSurfaceId } from '../../functions/shared/serverGrading/gradingManifest.mjs';
import { GRADING_AUTHORITY } from '../../functions/shared/serverGrading/gradingAuthority.mjs';
import {
  gradeServerResponse,
  questionGraderAccepts,
  serverResponseGradingSupport,
} from '../../functions/shared/serverGrading/serverResponseGrading.mjs';
import { attemptInputsFromGrading } from '../../functions/shared/serverGrading/gradingResult.mjs';
import {
  TOOL_RESPONSE_LIMITS,
  boundToolWork,
  canonicalToolWorkJson,
} from '../../functions/shared/serverGrading/toolResponseContract.mjs';
import { serverCanRegradeEnvelope } from '../../functions/shared/submissionIngestion.mjs';
import { activeStages, readComposedQuestion } from '../../src/platform/workflow/questionWorkflow.js';
import { gradeWorkflow } from '../../src/platform/workflow/workflowGrading.js';
import { buildFigureMatchResponse } from '../../src/platform/workflow/figureMatch.js';
import { buildWorkflowAnswerState } from '../../src/platform/workflow/workflowAnswerState.js';
import { buildWorkflowReviewState } from '../../src/platform/workflow/workflowReviewState.js';
import { generateQuestion } from '../../src/problemGenerator.js';
import { TOOL_CATALOG_IDS } from '../../src/tools/toolCatalog.js';
import { executableSource, region } from '../platform/helpers/sourceContract.mjs';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

/* ------------------------------------------------------------------------ *
 * Fixtures: one question per stage family, and the responses WorkflowRunner
 * stores for them (artifacts built the way its delegates build them).
 * ------------------------------------------------------------------------ */

const ARTIFACT = '__mathmasterWorkflowArtifact';

// relationRepresentations recipe: mapping diagram, domain/range sets, a
// classification.
const RELATION = Object.freeze({
  type: 'relationMapping',
  prompt: 'Study the relation {(-4, 1), (-2, 3), (1, 3), (3, 5)}.',
  pairs: [[-4, 1], [-2, 3], [1, 3], [3, 5]],
  recipe: { ask: ['mapping', 'domain', 'range', 'isFunction'] },
});
const RELATION_RIGHT = Object.freeze({
  mapping: [[-4, 1], [-2, 3], [1, 3], [3, 5]],
  domain: '{-4, -2, 1, 3}',
  range: '{1, 3, 5}',
  isFunction: 'Yes',
});

// WorkflowRunner's table artifact, with the browser-derived fields it carries.
const tableArtifact = (cells, { sourceModel = null, isComplete = true, xValues = [0, 1, 2, 3] } = {}) => ({
  [ARTIFACT]: 'table',
  isComplete,
  cells,
  xValues,
  points: Object.entries(cells).map(([key, value]) => [Number(key.split(':')[0]), Number(value)]),
  sourceModel,
  sourceFunctionSpec: sourceModel ? null : { type: 'linear', m: 5, b: 40 },
  sourceChecked: Object.keys(cells).length,
  sourceConsistent: true,
});

// functionModeling recipe without a graph: roles, equation, a table built
// from the student's own equation, domain and range.
const MODELING = Object.freeze({
  type: 'relationshipModel',
  prompt: 'A plumber charges a $40 call-out fee plus $5 per hour, for at most 12 hours.',
  recipe: { name: 'functionModeling', ask: ['quantities', 'equation', 'table', 'domain', 'range'] },
  quantities: [{ id: 't', label: 'Time (hours)' }, { id: 'c', label: 'Cost (dollars)' }],
  correctIndependentId: 't',
  correctDependentId: 'c',
  correctEquation: 'C(t)=5t+40',
  tableXValues: [0, 1, 2, 3],
  correctDomain: '0 \\le t \\le 12',
  correctRange: '40 \\le C \\le 100',
  notation: 'inequality',
});
const MODELING_RIGHT = Object.freeze({
  quantities: { independent: 't', dependent: 'c' },
  equation: 'C(t)=5t+40',
  table: tableArtifact({ '0:y': '40', '1:y': '45', '2:y': '50', '3:y': '55' }, { sourceModel: 'C(t)=5t+40' }),
  domain: '0 \\le t \\le 12',
  range: '40 \\le C \\le 100',
});

const selection = (points, none = false) => ({
  [ARTIFACT]: 'featureSelection',
  feature: 'xIntercept',
  selections: points,
  none,
  isComplete: true,
});

// functionCharacteristics recipe WITHOUT the plot step: classification,
// a branch, feature selection, coordinates, a value set, domain and range.
const FEATURES = Object.freeze({
  type: 'functionCharacteristics',
  prompt: 'The table shows a function. Describe it.',
  recipe: {
    name: 'functionCharacteristics',
    ask: ['model', 'xInterceptExists', 'xIntercept', 'xInterceptValue', 'zeros', 'yIntercept', 'domain', 'range'],
  },
  pairs: [[-1, 0], [0, 5], [2, 9], [4, 5], [5, 0]],
  graph: { xMin: -6, xMax: 8, yMin: -4, yMax: 12 },
  functionFamily: 'Quadratic',
  extreme: { kind: 'maximum' },
  correctDomain: 'all real numbers',
  correctRange: 'y <= 9',
});
const FEATURES_RIGHT = Object.freeze({
  model: 'Quadratic',
  xInterceptExists: 'Yes',
  xIntercept: selection([[-1, 0], [5, 0]]),
  xInterceptValue: '(-1, 0), (5, 0)',
  zeros: '\\left\\{-1,5\\right\\}',
  yIntercept: selection([[0, 5]]),
  domain: 'all real numbers',
  range: 'y \\le 9',
});

// graphChoicePreview, as the V5 compiler emits it.
const CHOICE = Object.freeze({
  type: 'graphChoicePreview',
  prompt: 'Which line passes through (0, 1) with slope 2?',
  workflow: [{
    id: 'choice',
    kind: 'multipleChoice',
    prompt: 'Choose the line.',
    choices: [{ id: 'c1', label: 'y=2x+1' }, { id: 'c2', label: 'y=-x+3' }, { id: 'c3', label: 'x=2' }],
    previewOnGraph: { graph: { xMin: -5, xMax: 5, yMin: -5, yMax: 5 } },
  }],
  grading: { choice: 'c1' },
});

// figureMatch, as the V5 compiler emits it.
const FIGURE_STAGE = Object.freeze({
  id: 'sort',
  kind: 'figureMatch',
  prompt: 'Sort each function.',
  items: [{ id: 'k1', math: 'y=2x' }, { id: 'k2', math: 'y=2^x' }, { id: 'k3', math: 'y=x+5' }, { id: 'k4', math: 'y=3(0.5)^x' }],
  categories: [{ id: 'linear', label: 'Linear' }, { id: 'exponential', label: 'Exponential' }],
});
const FIGURE_KEY = Object.freeze({ k1: 'linear', k2: 'exponential', k3: 'linear', k4: 'exponential' });
const FIGURES = Object.freeze({
  type: 'figureMatch',
  prompt: 'Linear or exponential?',
  workflow: [FIGURE_STAGE],
  grading: { sort: { match: FIGURE_KEY } },
});
const sortResponse = (assignments) => buildFigureMatchResponse(FIGURE_STAGE, assignments);

// Hand-composed: roles, a weighted axis setup, and an interpretation nobody
// can machine-mark.
const SETUP = Object.freeze({
  type: 'relationshipModel',
  prompt: 'A tank fills at 10 gallons per minute.',
  workflow: [
    { id: 'roles', kind: 'quantityRoles', quantities: [{ id: 't', label: 'Time' }, { id: 'v', label: 'Volume' }] },
    { id: 'axes', kind: 'axisSetup', requireScale: true, scoreWeight: 3 },
    { id: 'meaning', kind: 'interpretation', prompt: 'What does 10 mean here?' },
  ],
  grading: {
    roles: { independent: 't', dependent: 'v' },
    axes: { xLabel: ['Time'], yLabel: ['Volume'], xUnit: ['minutes'], yUnit: ['gallons'], xStep: ['1'], yStep: ['10'], requireUnits: true, requireScale: true },
  },
});
const axes = (fields) => ({ ...fields, [ARTIFACT]: 'axes', isComplete: true });
const SETUP_RIGHT = Object.freeze({
  roles: { independent: 't', dependent: 'v' },
  axes: axes({ xLabel: 'Time', yLabel: 'Volume', xUnit: 'minutes', yUnit: 'gallons', xStep: '1', yStep: '10' }),
  meaning: 'Ten gallons are added every minute.',
});

// A table with its own key (no upstream equation), then an interval in
// interval notation.
const KEYED_TABLE = Object.freeze({
  type: 'table',
  prompt: 'f(x) = 2x + 3. Complete the table, then give the solution set of f(x) <= 9.',
  workflow: [
    { id: 'values', kind: 'tableInput', xValues: [0, 1, 2], columns: [{ key: 'x', label: 'x' }, { key: 'y', label: 'f(x)' }] },
    { id: 'interval', kind: 'intervalInput', notation: 'interval' },
  ],
  grading: {
    values: { values: { '0:y': '3', '1:y': '5', '2:y': '7' } },
    interval: '(-\\infty, 3]',
  },
});
const KEYED_TABLE_RIGHT = Object.freeze({
  values: tableArtifact({ '0:y': '3', '1:y': '5', '2:y': '7' }, { xValues: [0, 1, 2] }),
  interval: '(-\\infty,3]',
});

// Graph-construction stages: re-marked from the workspace's work against the
// graph rebuilt from the student's earlier stages.
const PLOTTED = Object.freeze({ ...FEATURES, recipe: 'functionCharacteristics' });
const GRAPHED_MODEL = Object.freeze({
  ...MODELING,
  recipe: { name: 'functionModeling', ask: ['quantities', 'equation', 'table', 'graph'] },
});

const SHARED_FIXTURES = Object.freeze({
  RELATION: [RELATION, RELATION_RIGHT],
  MODELING: [MODELING, MODELING_RIGHT],
  FEATURES: [FEATURES, FEATURES_RIGHT],
  CHOICE: [CHOICE, { choice: 'c1' }],
  FIGURES: [FIGURES, { sort: sortResponse(FIGURE_KEY) }],
  SETUP: [SETUP, SETUP_RIGHT],
  KEYED_TABLE: [KEYED_TABLE, KEYED_TABLE_RIGHT],
});

/* ------------------------------------------------------------------------ *
 * The two paths.
 * ------------------------------------------------------------------------ */

/** Browser Check vs server ingestion over the serialized response: identical. */
const bothPaths = (question, responses) => {
  const browser = gradeComposedWorkflowCheck(question, composedWorkflowWork(responses));
  assert.ok(browser.toolResponse, 'the browser always produces the tool response it would send');
  const server = gradeServerResponse({ question, response: JSON.parse(JSON.stringify(browser.toolResponse)) });
  assert.equal(server.graded, browser.graded, 'graded');
  assert.equal(server.isCorrect, browser.isCorrect, 'isCorrect');
  assert.equal(server.isComplete, browser.isComplete, 'isComplete');
  assert.equal(server.score, browser.score, 'score');
  assert.deepEqual(server.parts, browser.parts, 'parts');
  return { browser, server };
};

/** What WorkflowRunner reports to QuestionEngine for these responses. */
const runnerState = (question, responses) => {
  const { workflow, grading } = readComposedQuestion(question);
  return buildWorkflowAnswerState({ question, stages: activeStages(workflow, responses), responses, grading });
};

/** The device marking the shared grader replaced, on the raw responses. */
const deviceMarking = (question, responses) => {
  const { workflow, grading } = readComposedQuestion(question);
  return gradeWorkflow({ stages: activeStages(workflow, responses), responses, grading });
};

const verdicts = (result) => Object.fromEntries(result.parts.map((part) => [part.id, part.graded === false ? 'ungraded' : part.isCorrect]));

/* ------------------------------------------------------------------------ *
 * Declarations and routing.
 * ------------------------------------------------------------------------ */

test('composed workflows are a shared-server question surface, and the manifest routes them there first', () => {
  assert.equal(GRADING_MANIFEST.composedWorkflow, composedWorkflowDeclaration);
  assert.equal(composedWorkflowDeclaration.kind, 'question');
  assert.equal(composedWorkflowDeclaration.authority, GRADING_AUTHORITY.SHARED_SERVER);
  // A composed question is its workflow, whatever its type — including types
  // that are registry tools on their own (relationMapping).
  Object.entries(SHARED_FIXTURES).forEach(([name, [question]]) => {
    assert.equal(resolveGradingSurfaceId(question), 'composedWorkflow', name);
    const support = serverResponseGradingSupport(question);
    assert.equal(support.supported, true, `${name}: ${support.reason}`);
    assert.equal(support.authority, GRADING_AUTHORITY.SHARED_SERVER, name);
  });
});

test('the server reads the workflow exactly as WorkflowRunner renders it (mode resolution)', () => {
  // QuestionEngine renders WorkflowRunner iff readComposedQuestion(...).composed.
  const cases = [
    [RELATION, true, 'recipe:relationRepresentations'],
    [MODELING, true, 'recipe:functionModeling'],
    [FEATURES, true, 'recipe:functionCharacteristics'],
    [CHOICE, true, 'workflow'],
    [FIGURES, true, 'workflow'],
    [KEYED_TABLE, true, 'workflow'],
    // A recipe name that expands to nothing: the browser shows the type, so
    // the composed grader declines, and the question belongs to its type's
    // surface — on the server as on the screen.
    [{ ...RELATION, recipe: 'noSuchRecipe' }, false, null],
  ];
  cases.forEach(([question, composed, mode]) => {
    assert.equal(readComposedQuestion(question).composed, composed);
    const support = composedWorkflowSupport(question);
    assert.equal(support.supported, composed);
    assert.equal(support.mode, mode);
    assert.equal(resolveGradingSurfaceId(question), composed ? 'composedWorkflow' : question.type);
    if (!composed) {
      assert.equal(support.reason, 'not-a-composed-workflow');
      assert.equal(serverResponseGradingSupport(question).surfaceId, question.type);
    }
  });
  // A literal with an unknown recipe is still the server-graded literal it
  // renders as (the server before this change ignored `recipe` entirely).
  const literal = { type: 'literal', prompt: 'Solve 2x = 6.', acceptedAnswers: ['3'], recipe: 'noSuchRecipe' };
  assert.equal(resolveGradingSurfaceId(literal), 'literal');
  assert.equal(serverResponseGradingSupport(literal).supported, true);
  // An authored `recipe` with no name takes its type's recipe, on both sides.
  assert.equal(composedWorkflowSupport({ ...RELATION, recipe: { ask: ['domain'] } }).mode, 'recipe:relationRepresentations');
});

test('a graph-construction stage no longer keeps the workflow on the device: its claim is replaced by a re-mark', () => {
  [PLOTTED, GRAPHED_MODEL].forEach((question) => {
    const kinds = readComposedQuestion(question).workflow.map((stage) => stage.kind);
    assert.ok(kinds.includes('coordinatePlot') || kinds.includes('functionGraph'));
    const support = serverResponseGradingSupport(question);
    assert.equal(support.supported, true, support.reason);
    assert.equal(support.authority, GRADING_AUTHORITY.SHARED_SERVER);
    assert.equal(composedWorkflowDeclaration.supports(question).supported, true);
  });
  assert.equal('graphStage' in COMPOSED_WORKFLOW_BLOCKERS, false, 'no graph blocker is left to report');
  // The workspace's own verdict is not student work and is never believed: a
  // plot artifact claiming to be right, with no construction behind it, is an
  // unanswered stage on both paths — where the device used to count it.
  const plot = { [ARTIFACT]: 'graph', isComplete: true, isCorrect: true, partialCreditPercent: 100, parts: [{ id: 'p1', isCorrect: true }], responseKey: '{"construction":{}}' };
  assert.deepEqual(composedWorkflowStageWork(plot), { [ARTIFACT]: 'graph', isComplete: true });
  const local = deviceMarking(PLOTTED, { ...FEATURES_RIGHT, plot });
  assert.equal(verdicts(local).plot, true, 'on the device the workspace verdict marked the plot');
  const { server } = bothPaths(PLOTTED, { ...FEATURES_RIGHT, plot });
  const part = server.parts.find((entry) => entry.id === 'plot');
  assert.deepEqual([part.isComplete, part.isCorrect, part.credit], [false, false, 0]);
  // ...and the browser reports exactly that.
  const state = runnerState(PLOTTED, { ...FEATURES_RIGHT, plot });
  assert.equal(state.isCorrect, false);
  assert.equal(state.isComplete, false);
  assert.equal(state.toolResponse.toolId, 'composedWorkflow');
  assert.equal(state.responseKey, state.toolResponse.value);
});

test('a stage, figure or cell key the response contract would strip keeps the question on the device', () => {
  const unsafeStage = { ...CHOICE, workflow: [{ ...CHOICE.workflow[0], id: 'score' }], grading: { score: 'c1' } };
  assert.equal(composedWorkflowSupport(unsafeStage).reason, 'work-key-not-contract-safe');
  // A natural-sounding id is just as reserved: its answer would be stripped
  // as "answer-key material" and the stage would read as unanswered.
  const solutionStage = { ...KEYED_TABLE, workflow: [KEYED_TABLE.workflow[0], { ...KEYED_TABLE.workflow[1], id: 'solution' }], grading: { values: KEYED_TABLE.grading.values, solution: '(-\\infty, 3]' } };
  assert.equal(composedWorkflowSupport(solutionStage).reason, 'work-key-not-contract-safe');
  assert.deepEqual(boundToolWork(composedWorkflowWork({ solution: '(-\\infty,3]' })).dropped, ['solution']);
  const unsafeFigure = {
    ...FIGURES,
    workflow: [{ ...FIGURE_STAGE, items: [...FIGURE_STAGE.items.slice(0, 3), { id: 'solution', math: 'y=4^x' }] }],
  };
  assert.equal(composedWorkflowSupport(unsafeFigure).reason, 'work-key-not-contract-safe');
  assert.equal(serverResponseGradingSupport(unsafeFigure).blocker, COMPOSED_WORKFLOW_BLOCKERS.unsafeKey);
  // Every recipe's stage ids are safe — the recipes are the common case.
  [RELATION, MODELING, FEATURES, PLOTTED].forEach((question) => {
    assert.notEqual(composedWorkflowSupport(question).reason, 'work-key-not-contract-safe');
  });
});

test('bare functionCharacteristics, figureMatch and graphChoicePreview cannot be submitted, and are declared non-graded', () => {
  const engine = executableSource(read('src/QuestionEngine.jsx'));
  const typeSwitch = region(engine, 'switch (processedQuestion.type) {', 'default:', 'QuestionEngine type switch');
  [
    { type: 'functionCharacteristics', pairs: FEATURES.pairs, functionFamily: 'Quadratic' },
    { type: 'figureMatch', figures: [], categories: [] },
    { type: 'graphChoicePreview', choices: ['a', 'b'] },
  ].forEach((bare) => {
    // Not composed, not a registry tool, no case of its own: the browser shows
    // the "could not be displayed" panel and the answer state never completes.
    assert.equal(readComposedQuestion(bare).composed, false);
    assert.equal(TOOL_CATALOG_IDS.includes(bare.type), false);
    assert.doesNotMatch(typeSwitch, new RegExp(`case '${bare.type}':`));
    assert.equal(resolveGradingSurfaceId(bare), bare.type);
    assert.equal(GRADING_MANIFEST[bare.type].authority, GRADING_AUTHORITY.NON_GRADED);
    assert.equal(serverResponseGradingSupport(bare).supported, false);
    // With a recipe or workflow the same type is the composed surface.
  });
  assert.equal(resolveGradingSurfaceId({ ...FEATURES }), 'composedWorkflow');
});

test('fraction and numberLine are client-graded because every stored instance is regenerated per student', () => {
  [fractionDeclaration, numberLineDeclaration].forEach((declaration) => {
    assert.equal(declaration.authority, GRADING_AUTHORITY.CLIENT_GRADED);
    assert.match(declaration.blocker, /generationKey/);
    assert.match(declaration.blocker, /Question Family/);
  });
  assert.equal(GRADING_MANIFEST.fraction, fractionDeclaration);
  assert.equal(GRADING_MANIFEST.numberLine, numberLineDeclaration);

  // The blocker, demonstrated: no `generator` object, yet the delivered key
  // is drawn again for every student, so the stored key is not the one asked.
  const fraction = { type: 'fraction', prompt: 'Add.', n1: 1, d1: 2, n2: 1, d2: 3, ansNum: 5, ansDen: 6 };
  const fractionKeys = ['a', 'b', 'c', 'd'].map((student) => {
    const delivered = generateQuestion(fraction, `asg|${student}|0|variant:0`);
    return `${delivered.ansNum}/${delivered.ansDen}`;
  });
  assert.ok(new Set(fractionKeys).size > 1, 'students are asked different sums');
  assert.ok(fractionKeys.some((key) => key !== '5/6'), 'the stored key is overwritten');

  const numberLine = { type: 'numberLine', prompt: 'Find the target.', target: 3, choices: [1, 2, 3, 4, 5] };
  const targets = ['a', 'b', 'c', 'd'].map((student) => generateQuestion(numberLine, `asg|${student}|1|variant:0`).target);
  assert.ok(new Set(targets).size > 1, 'students are asked for different points');

  // So the server never marks them, and their grader slots accept nothing.
  [fraction, numberLine].forEach((question) => {
    const support = serverResponseGradingSupport(question);
    assert.equal(support.supported, false);
    assert.equal(support.authority, GRADING_AUTHORITY.CLIENT_GRADED);
    assert.equal(gradeServerResponse({ question, response: { kind: 'scalar', type: question.type, value: '5/6' } }).graded, false);
  });
});

/* ------------------------------------------------------------------------ *
 * Verdicts, per stage family, on both paths.
 * ------------------------------------------------------------------------ */

test('fully correct work is correct, complete and scores 1 on both paths — for every stage family', () => {
  Object.entries(SHARED_FIXTURES).forEach(([name, [question, right]]) => {
    const { server } = bothPaths(question, right);
    assert.equal(server.graded, true, name);
    assert.equal(server.isCorrect, true, `${name}: ${JSON.stringify(verdicts(server))}`);
    assert.equal(server.isComplete, true, name);
    assert.equal(server.score, 1, name);
    assert.equal(server.surfaceId, 'composedWorkflow');
    assert.equal(server.graderVersion, 'composed-workflow-v1');
  });
});

test('the answer state WorkflowRunner reports is the attempt the server records, and matches the device marking it replaced', () => {
  const samples = Object.entries(SHARED_FIXTURES).flatMap(([name, [question, right]]) => [
    [name, question, right],
    [`${name}/blank`, question, {}],
  ]).concat([
    ['RELATION/partial', RELATION, { ...RELATION_RIGHT, domain: '{-4, -2, 1, 3, 5}' }],
    ['MODELING/wrong-equation', MODELING, { ...MODELING_RIGHT, equation: 'C(t)=4t+40' }],
    ['FEATURES/wrong-branch', FEATURES, { ...FEATURES_RIGHT, xInterceptExists: 'No' }],
    ['FIGURES/one-wrong', FIGURES, { sort: sortResponse({ ...FIGURE_KEY, k4: 'linear' }) }],
    ['SETUP/one-unit-wrong', SETUP, { ...SETUP_RIGHT, axes: axes({ ...SETUP_RIGHT.axes, yUnit: 'liters' }) }],
  ]);
  samples.forEach(([name, question, responses]) => {
    const { browser, server } = bothPaths(question, responses);
    const state = runnerState(question, responses);
    const recorded = attemptInputsFromGrading(server);
    assert.equal(state.isCorrect, recorded.isCorrect, `${name}: isCorrect`);
    assert.equal(state.partialCreditPercent, recorded.partialCreditPercent, `${name}: partial credit`);
    assert.deepEqual(state.parts, recorded.parts, `${name}: parts`);
    assert.equal(state.isComplete, server.isComplete, `${name}: isComplete`);
    // The response the attempt carries is exactly the bytes the server read.
    assert.equal(state.toolResponse.value, browser.toolResponse.value);
    assert.equal(state.responseKey, browser.toolResponse.value);

    // No change for an honest student: same verdict, credit and per-step marks
    // as the device marking WorkflowRunner used before.
    const before = deviceMarking(question, responses);
    assert.equal(state.isCorrect, before.isCorrect, `${name}: unchanged isCorrect`);
    assert.equal(state.isComplete, before.isComplete, `${name}: unchanged isComplete`);
    assert.equal(state.partialCreditPercent, before.partialCreditPercent ?? 0, `${name}: unchanged partial credit`);
    assert.equal(state.questionDetails, before.questionDetails, `${name}: unchanged details`);
    assert.deepEqual(
      state.parts.map(({ id, isCorrect, isComplete, credit, weight }) => ({ id, isCorrect, isComplete, credit, weight, graded: state.parts.find((p) => p.id === id).graded !== false })),
      before.parts.map((part) => ({ id: part.id, isCorrect: part.isCorrect, isComplete: part.isComplete, credit: Number.isFinite(Number(part.credit)) ? Number(part.credit) : (part.isCorrect ? 1 : 0), weight: part.weight, graded: part.graded !== false })),
      `${name}: unchanged parts`,
    );
  });
});

test('incorrect work is incorrect, with the stage that is wrong named in the parts', () => {
  const relation = bothPaths(RELATION, { ...RELATION_RIGHT, isFunction: 'No' }).server;
  assert.equal(relation.isCorrect, false);
  assert.deepEqual(verdicts(relation), { mapping: true, domain: true, range: true, isFunction: false });

  const modeling = bothPaths(MODELING, { ...MODELING_RIGHT, quantities: { independent: 'c', dependent: 't' } }).server;
  assert.equal(modeling.isCorrect, false);
  assert.equal(verdicts(modeling).quantities, false);

  const choice = bothPaths(CHOICE, { choice: 'c2' }).server;
  assert.equal(choice.isCorrect, false);
  assert.equal(choice.score, 0);
});

test('partial credit is the workflow\'s own: weighted stage credit, held at 90% until every graded stage is right', () => {
  // Domain lists one extra value: set credit 4/5. (1 + 0.8 + 1 + 1) / 4 = 95%,
  // held at 90 because the question is not right.
  const relation = bothPaths(RELATION, { ...RELATION_RIGHT, domain: '{-4, -2, 1, 3, 5}' }).server;
  assert.equal(relation.parts.find((part) => part.id === 'domain').credit, 0.8);
  assert.equal(relation.score, 0.9);
  assert.equal(attemptInputsFromGrading(relation).partialCreditPercent, 90);

  // Three of four figures: 75%.
  const figures = bothPaths(FIGURES, { sort: sortResponse({ ...FIGURE_KEY, k4: 'linear' }) }).server;
  assert.equal(figures.score, 0.75);

  // Weighted: roles (1) right, axes (weight 3) 5 of 6 fields right, the
  // interpretation ungraded and outside the denominator: (1 + 3 * 5/6) / 4.
  const setup = bothPaths(SETUP, { ...SETUP_RIGHT, axes: axes({ ...SETUP_RIGHT.axes, yUnit: 'liters' }) }).server;
  assert.equal(setup.parts.find((part) => part.id === 'meaning').graded, false);
  assert.equal(setup.parts.find((part) => part.id === 'axes').weight, 3);
  assert.equal(setup.score, Math.round(((1 + 3 * (5 / 6)) / 4) * 100) / 100);

  // A table that follows the student's equation for 3 of 4 rows: 75% credit
  // for that stage, even though the equation itself is wrong.
  const modeling = bothPaths(MODELING, {
    ...MODELING_RIGHT,
    equation: 'C(t)=4t+40',
    table: tableArtifact({ '0:y': '40', '1:y': '44', '2:y': '48', '3:y': '55' }, { sourceModel: 'C(t)=4t+40' }),
  }).server;
  assert.equal(modeling.parts.find((part) => part.id === 'table').credit, 0.75);
  assert.equal(verdicts(modeling).equation, false);

  // A keyed table with one cell wrong (2 of 3) and the interval right:
  // (2/3 + 1) / 2 = 83%.
  const keyed = bothPaths(KEYED_TABLE, {
    ...KEYED_TABLE_RIGHT,
    values: tableArtifact({ '0:y': '3', '1:y': '6', '2:y': '7' }, { xValues: [0, 1, 2] }),
  }).server;
  assert.deepEqual(verdicts(keyed), { values: false, interval: true });
  assert.equal(keyed.score, 0.83);
});

test('unfinished work is graded but incomplete, so a deadline never auto-submits it', () => {
  const missing = { ...RELATION_RIGHT };
  delete missing.range;
  const relation = bothPaths(RELATION, missing).server;
  assert.equal(relation.graded, true, 'an explicit Submit of unfinished work is a real attempt');
  assert.equal(relation.isComplete, false);
  assert.equal(relation.isCorrect, false);
  assert.equal(relation.parts.find((part) => part.id === 'range').isComplete, false);

  // A figure still unplaced, a table row still blank: not finished.
  assert.equal(bothPaths(FIGURES, { sort: sortResponse({ k1: 'linear', k2: 'exponential', k3: 'linear' }) }).server.isComplete, false);
  const blankRow = tableArtifact({ '0:y': '40', '1:y': '45', '2:y': '50' }, { sourceModel: 'C(t)=5t+40', isComplete: false });
  assert.equal(bothPaths(MODELING, { ...MODELING_RIGHT, table: blankRow }).server.isComplete, false);

  // Nothing at all: graded, incomplete, zero.
  const blank = bothPaths(CHOICE, {}).server;
  assert.deepEqual([blank.graded, blank.isComplete, blank.isCorrect, blank.score], [true, false, false, 0]);
});

test('a branch the student did not take is never marked, and choosing it is marked on its own', () => {
  const tookNo = bothPaths(FEATURES, { ...FEATURES_RIGHT, xInterceptExists: 'No' }).server;
  const ids = tookNo.parts.map((part) => part.id);
  ['xIntercept', 'xInterceptValue', 'zeros'].forEach((id) => assert.equal(ids.includes(id), false, `${id} is on the other branch`));
  assert.equal(verdicts(tookNo).xInterceptExists, false);
  // Stale answers left behind on the branch they left do not count either way.
  assert.deepEqual(ids, bothPaths(FEATURES, { model: 'Quadratic', xInterceptExists: 'No', yIntercept: FEATURES_RIGHT.yIntercept, domain: 'all real numbers', range: 'y <= 9' }).server.parts.map((part) => part.id));
});

test('equivalent valid forms the workflow accepts are accepted on both paths', () => {
  const equivalents = [
    // Sets in any order, with or without braces; arrows in any order.
    [RELATION, { ...RELATION_RIGHT, domain: '3, 1, -2, -4', range: '{5,1,3}', mapping: [[3, 5], [1, 3], [-4, 1], [-2, 3]] }],
    // The same model rearranged; the domain in the variable the student was shown.
    [MODELING, { ...MODELING_RIGHT, equation: 'C(t)=40+5t', domain: '0 \\le x \\le 12' }],
    // Table entries as a fraction and a decimal of the same value.
    [MODELING, { ...MODELING_RIGHT, table: tableArtifact({ '0:y': '40.0', '1:y': '90/2', '2:y': '50', '3:y': '55' }, { sourceModel: 'C(t)=5t+40' }) }],
    // Points in any order, marks within tolerance, inequality spellings.
    [FEATURES, {
      ...FEATURES_RIGHT,
      xIntercept: selection([[5, 0], [-1.2, 0.1]]),
      xInterceptValue: '(5, 0), (-1, 0)',
      zeros: '{5, -1}',
      range: 'y\\leq9',
    }],
    // A keyed table answered as a decimal and a fraction; the interval spelled
    // with `inf` rather than \infty, or with its endpoint as a decimal (an
    // interval is compared as intervals, not as text).
    [KEYED_TABLE, {
      values: tableArtifact({ '0:y': '3.0', '1:y': '10/2', '2:y': '7' }, { xValues: [0, 1, 2] }),
      interval: '(-inf, 3]',
    }],
    [KEYED_TABLE, { ...KEYED_TABLE_RIGHT, interval: '(-∞, 3.0]' }],
  ];
  equivalents.forEach(([question, responses]) => {
    const { server } = bothPaths(question, responses);
    assert.equal(server.isCorrect, true, JSON.stringify(verdicts(server)));
  });
});

test('a reduce-complexity support that trims choices never changes the verdict for the same selection', () => {
  const trimmed = { ...CHOICE, workflow: [{ ...CHOICE.workflow[0], choices: CHOICE.workflow[0].choices.slice(0, 2) }] };
  ['c1', 'c2'].forEach((selected) => {
    assert.equal(
      bothPaths(trimmed, { choice: selected }).server.isCorrect,
      bothPaths(CHOICE, { choice: selected }).server.isCorrect,
    );
  });
});

test('unauthored defaults: no `ask` takes the recipe defaults, no key leaves a stage ungraded, never wrong', () => {
  // No `ask`: the recipe's default steps, on both sides.
  const defaults = { ...RELATION, recipe: 'relationRepresentations' };
  const stages = readComposedQuestion(defaults).workflow.map((stage) => stage.id);
  assert.ok(stages.length > 0);
  const responses = Object.fromEntries(stages.map((id) => [id, RELATION_RIGHT[id] ?? 'Yes']));
  bothPaths(defaults, responses);

  // No grading at all: every stage reported ungraded, the question can never
  // be "correct", and nothing counts against the student.
  const unkeyed = { ...CHOICE, grading: undefined };
  const { server } = bothPaths(unkeyed, { choice: 'c1' });
  assert.equal(server.graded, true);
  assert.equal(server.isComplete, true);
  assert.equal(server.isCorrect, false);
  assert.equal(server.score, 0);
  assert.equal(server.parts[0].graded, false);

  // No scoreWeight: every stage weighs 1.
  bothPaths(RELATION, RELATION_RIGHT).server.parts.forEach((part) => assert.equal(part.weight, 1));
});

test('discrimination: the same correct work fails against an altered key', () => {
  const alteredRelation = { ...RELATION, pairs: [[-4, 1], [-2, 3], [1, 3], [3, 6]] };
  assert.equal(bothPaths(alteredRelation, RELATION_RIGHT).server.isCorrect, false);
  const alteredFigures = { ...FIGURES, grading: { sort: { match: { ...FIGURE_KEY, k1: 'exponential' } } } };
  assert.equal(bothPaths(alteredFigures, { sort: sortResponse(FIGURE_KEY) }).server.isCorrect, false);
  const alteredChoice = { ...CHOICE, grading: { choice: 'c2' } };
  assert.equal(bothPaths(alteredChoice, { choice: 'c1' }).server.isCorrect, false);
  const alteredModel = { ...MODELING, correctEquation: 'C(t)=6t+40' };
  assert.equal(verdicts(bothPaths(alteredModel, MODELING_RIGHT).server).equation, false);
  const alteredTable = { ...KEYED_TABLE, grading: { ...KEYED_TABLE.grading, interval: '(-\\infty, 2]' } };
  assert.equal(bothPaths(alteredTable, KEYED_TABLE_RIGHT).server.isCorrect, false);
});

/* ------------------------------------------------------------------------ *
 * Work is student work: bounded, verdict-free, key-free.
 * ------------------------------------------------------------------------ */

test('realistic work crosses the contract intact: nothing dropped, nothing truncated', () => {
  Object.entries(SHARED_FIXTURES).forEach(([name, [, right]]) => {
    const bounded = boundToolWork(composedWorkflowWork(right));
    assert.deepEqual(bounded.dropped, [], name);
    assert.equal(bounded.truncated, false, name);
  });
  // Including a graph stage's artifact (on a client-graded question): its
  // verdict never becomes work.
  const plot = { [ARTIFACT]: 'graph', isComplete: true, isCorrect: true, partialCreditPercent: 80, parts: [{ id: 'p', isCorrect: true }], responseKey: 'x'.repeat(5000) };
  assert.deepEqual(boundToolWork(composedWorkflowWork({ ...FEATURES_RIGHT, plot })).dropped, []);
});

test('answer-key material and browser verdicts never travel as work', () => {
  const work = composedWorkflowWork(MODELING_RIGHT);
  const table = work.responses.table;
  // The authored function a table may be checked against is the key, and the
  // consistency flags and points are the browser's derivations.
  ['sourceFunctionSpec', 'sourceConsistent', 'sourceChecked', 'points', 'xValues'].forEach((key) => {
    assert.equal(key in table, false, key);
  });
  // The student's own equation the table was built from travels with it (for
  // the record and the post-submit review); the grader never marks against
  // this copy — see 'what a table was built from is rebuilt from the work'.
  assert.equal(table.sourceModel, 'C(t)=5t+40');
  assert.deepEqual(table.cells, MODELING_RIGHT.table.cells);
  const json = canonicalToolWorkJson(composedWorkflowWork({ ...FEATURES_RIGHT, plot: { [ARTIFACT]: 'graph', isComplete: true, isCorrect: true } }));
  assert.doesNotMatch(json, /isCorrect|partialCredit|sourceFunctionSpec|"expected"/);
});

test('realistic maximal work stays far inside the response limits', () => {
  const rows = Array.from({ length: 20 }, (_, index) => index);
  const big = {
    ...FEATURES_RIGHT,
    ...MODELING_RIGHT,
    table: tableArtifact(Object.fromEntries(rows.map((row) => [`${row}:y`, String(5 * row + 40)])), { sourceModel: 'C(t)=5t+40', xValues: rows }),
    mapping: Array.from({ length: 40 }, (_, index) => [index, index * 2]),
    meaning: 'm'.repeat(1000),
    notes: 'n'.repeat(1000),
    explain: 'e'.repeat(1000),
    sort: sortResponse(FIGURE_KEY),
  };
  const json = canonicalToolWorkJson(composedWorkflowWork(big));
  assert.ok(json.length < TOOL_RESPONSE_LIMITS.maxJsonLength / 2, `${json.length} chars`);
});

test('malformed or tampered work never crashes and never earns credit', () => {
  // Not an object, or no stage map: nothing to mark.
  assert.equal(gradeComposedWorkflowCheck(RELATION, null).graded, false);
  assert.equal(gradeComposedWorkflowCheck(RELATION, 'everything is right').reason, 'empty-response');
  [{ responses: 'x' }, { responses: [1, 2, 3] }, {}].forEach((work) => {
    const browser = gradeComposedWorkflowCheck(RELATION, work);
    const server = gradeServerResponse({ question: RELATION, response: JSON.parse(JSON.stringify(browser.toolResponse)) });
    assert.deepEqual([server.graded, server.isComplete, server.isCorrect, server.score], [true, false, false, 0]);
    assert.equal(browser.isCorrect, server.isCorrect);
  });

  // Wrong types in every stage: marked wrong, no throw.
  const garbage = { mapping: 'all of them', domain: 7, range: { a: 1 }, isFunction: ['Yes'] };
  const garbled = bothPaths(RELATION, garbage).server;
  assert.equal(garbled.graded, true);
  assert.equal(garbled.isCorrect, false);

  // An answer placed beside the stage map rather than in it is not an answer.
  const besideMap = gradeComposedWorkflowCheck(CHOICE, { responses: {}, choice: 'c1' });
  assert.deepEqual([besideMap.isComplete, besideMap.isCorrect, besideMap.score], [false, false, 0]);

  // Injected verdicts and keys are dropped, at the top and inside artifacts.
  const injected = {
    responses: { choice: 'c2' },
    isCorrect: true,
    score: 1,
    expected: { choice: 'c2' },
    answerKey: { choice: 'c2' },
  };
  const tampered = gradeComposedWorkflowCheck(CHOICE, injected);
  assert.equal(tampered.isCorrect, false);
  assert.equal(tampered.score, 0);
  assert.deepEqual(boundToolWork(injected).dropped.sort(), ['answerKey', 'expected', 'isCorrect', 'score']);
  const forgedFigures = { sort: { ...sortResponse({ ...FIGURE_KEY, k4: 'linear' }), isCorrect: true, score: 1 } };
  assert.equal(bothPaths(FIGURES, forgedFigures).server.isCorrect, false);

  // A table that CLAIMS to be finished with three rows blank would score as a
  // fully consistent table (blank rows are skipped); its claim is checked
  // against its cells, so it is unfinished and earns nothing for the stage.
  const forgedTable = { ...MODELING_RIGHT, table: tableArtifact({ '0:y': '40' }, { sourceModel: 'C(t)=5t+40', isComplete: true }) };
  const forged = bothPaths(MODELING, forgedTable).server;
  assert.equal(forged.isComplete, false);
  assert.equal(forged.isCorrect, false);
  assert.equal(forged.parts.find((part) => part.id === 'table').credit, 0);
  // The same, for a figure match that claims to be finished with a figure unplaced.
  const forgedSort = { sort: { ...sortResponse({ k1: 'linear', k2: 'exponential', k3: 'linear' }), isComplete: true } };
  assert.equal(bothPaths(FIGURES, forgedSort).server.isComplete, false);
});

test('a response the grader cannot read is not marked: oversize, newer contract, another tool, the legacy shape', () => {
  // Oversize: the server has no verdict (and ingestion keeps the client
  // record, as it does for any response with no readable raw work); the
  // browser keeps its own marking for it rather than blocking Submit.
  const huge = Object.fromEntries(Array.from({ length: 40 }, (_, index) => [`note${index}`, 'z'.repeat(1000)]));
  const oversized = { ...RELATION_RIGHT, ...huge };
  const check = gradeComposedWorkflowCheck(RELATION, composedWorkflowWork(oversized));
  assert.equal(check.reason, 'oversize-response');
  assert.equal(check.toolResponse.oversize, true);
  assert.equal(gradeServerResponse({ question: RELATION, response: check.toolResponse }).graded, false);
  const state = runnerState(RELATION, oversized);
  assert.equal(state.isCorrect, deviceMarking(RELATION, oversized).isCorrect);
  assert.equal(state.isComplete, true);

  const { browser } = bothPaths(RELATION, RELATION_RIGHT);
  const newer = { ...browser.toolResponse, contractVersion: 2 };
  assert.equal(composedWorkflowGrader.grade(RELATION, newer).reason, 'response-contract-newer-than-server');
  const otherTool = { ...browser.toolResponse, toolId: 'relationMapping' };
  assert.equal(composedWorkflowGrader.accepts(otherTool), false);
  assert.equal(gradeServerResponse({ question: RELATION, response: otherTool }).graded, false);

  // A pre-contract client's opaque string keeps the bounded legacy path.
  const legacy = { kind: 'opaque', type: 'relationMapping', value: JSON.stringify(RELATION_RIGHT), fields: [] };
  assert.equal(questionGraderAccepts(RELATION, legacy), false);
  assert.deepEqual(
    serverCanRegradeEnvelope({ envelope: { kind: 'ordinarySubmission', response: legacy }, question: RELATION }),
    { regrade: false, reason: 'legacy-unstructured-response' },
  );
  assert.deepEqual(
    serverCanRegradeEnvelope({ envelope: { kind: 'ordinarySubmission', response: browser.toolResponse }, question: RELATION }),
    { regrade: true, reason: null },
  );
});

test('student text that would make the expression engine allocate or loop is never run by the grader', () => {
  // Evaluated, `sum(1:2000000000)` allocates a two-billion-entry range; the
  // grader must decline before anything reaches mathjs (if this regresses the
  // test process runs out of memory rather than failing politely).
  const started = Date.now();
  const hostile = { ...MODELING_RIGHT, equation: 'C(t)=t+sum(1:2000000000)' };
  const declined = gradeComposedWorkflowCheck(MODELING, composedWorkflowWork(hostile));
  assert.equal(declined.graded, false);
  assert.equal(declined.reason, 'unsafe-expression');
  const server = gradeServerResponse({ question: MODELING, response: JSON.parse(JSON.stringify(declined.toolResponse)) });
  assert.equal(server.reason, 'unsafe-expression');
  assert.ok(Date.now() - started < 2000);
  // In a table cell a consistency check would evaluate, or a domain answer
  // the equivalence check would simplify.
  assert.equal(gradeComposedWorkflowCheck(MODELING, composedWorkflowWork({ ...MODELING_RIGHT, table: tableArtifact({ '0:y': 'zeros(600,600)', '1:y': '45', '2:y': '50', '3:y': '55' }, { sourceModel: 'C(t)=5t+40' }) })).reason, 'unsafe-expression');
  assert.equal(gradeComposedWorkflowCheck(MODELING, composedWorkflowWork({ ...MODELING_RIGHT, domain: 'zeros\\left(600,600\\right)' })).reason, 'unsafe-expression');

  // The browser keeps its own marking for it (a harmless small case here), and
  // says the server will not mark this work — unlike a question declared
  // client-graded, whose state carries no such reason.
  const small = { ...MODELING_RIGHT, equation: 'C(t)=5t+sum(1:3)+34' };
  const smallState = runnerState(MODELING, small);
  assert.equal(smallState.isComplete, deviceMarking(MODELING, small).isComplete);
  assert.equal(smallState.sharedGradingWithheld, 'unsafe-expression');
  assert.equal('sharedGradingWithheld' in runnerState(MODELING, MODELING_RIGHT), false);
  assert.equal('sharedGradingWithheld' in runnerState(PLOTTED, FEATURES_RIGHT), false);

  // What students actually write is never declined.
  [
    'f(x)=2x+1', 'C\\left(t\\right)=5t+40', 'y=\\sqrt{x}+\\sin\\left(x\\right)', 'y=\\log_{2}(x)',
    'y=\\frac{1}{2}x', 'W(t)=18t', 'y=x(x+1)', 'f(x)=abs(x-2)', 'y=3(0.5)^x', 'y=\\ln(x)+e^{2x}',
  ].forEach((text) => assert.equal(unsafeMathText(text), false, text));
  ['sum(1:10)', 'zeros(3,3)', 'createUnit("q")', 'x+combinations(9,3)', 'ones\\left(2,2\\right)', 'evaluate("1")'].forEach((text) => {
    assert.equal(unsafeMathText(text), true, text);
  });
  // Set-builder notation never reaches the parser, so its colon is fine.
  const setBuilder = gradeComposedWorkflowCheck(MODELING, composedWorkflowWork({ ...MODELING_RIGHT, domain: '\\left\\{t:0\\le t\\le 12\\right\\}' }));
  assert.equal(setBuilder.graded, true);
});

test('completeness is checked by the STAGE, so a forged response cannot dodge it by dropping or changing its tag', () => {
  // One correct row of a table checked against the student's own equation.
  // Blank rows are skipped by the consistency check, so if the stage counted
  // as finished it would score as a complete, fully consistent table.
  const oneRow = { '0:y': '40' };
  [
    { [ARTIFACT]: 'table', isComplete: true, cells: oneRow, sourceModel: 'C(t)=5t+40' },
    oneRow,
    { ...oneRow, [ARTIFACT]: 'axes', isComplete: true },
    { ...oneRow, [ARTIFACT]: 'featureSelection', isComplete: true, selections: [], none: false },
  ].forEach((table) => {
    const { server } = bothPaths(MODELING, { ...MODELING_RIGHT, table });
    const part = server.parts.find((entry) => entry.id === 'table');
    assert.equal(part.isComplete, false, JSON.stringify(table));
    assert.equal(part.isCorrect, false, JSON.stringify(table));
    assert.equal(part.credit, 0, JSON.stringify(table));
    assert.equal(server.isCorrect, false);
    assert.equal(server.isComplete, false);
  });
  // The same untagged shape with EVERY row filled is the table finished.
  const allRows = { '0:y': '40', '1:y': '45', '2:y': '50', '3:y': '55' };
  assert.equal(bothPaths(MODELING, { ...MODELING_RIGHT, table: allRows }).server.isCorrect, true);

  // A figure match with a figure unplaced, untagged so the artifact check would
  // not have looked at it: not finished, nothing earned for the stage.
  const untaggedSort = { assignments: { k1: 'linear', k2: 'exponential', k3: 'linear' } };
  const sort = bothPaths(FIGURES, { sort: untaggedSort }).server;
  assert.equal(sort.isComplete, false);
  assert.equal(sort.parts[0].credit, 0);
});

// A table driven by another table: its consistency is judged against the
// model the upstream table was built from — the student's equation.
const CHAIN_FIRST = { id: 'first', kind: 'tableInput', xValues: [0, 1, 2], source: { fromStage: 'equation' } };
const CHAIN_SECOND = { id: 'second', kind: 'tableInput', xValues: [3, 4], source: { fromStage: 'first' } };
const CHAIN_THIRD = { id: 'third', kind: 'tableInput', xValues: [5], source: { fromStage: 'second' } };
const CHAINED = Object.freeze({
  type: 'table',
  prompt: 'Write y in terms of x, then complete both tables from it.',
  workflow: [{ id: 'equation', kind: 'equationInput' }, CHAIN_FIRST, CHAIN_SECOND, CHAIN_THIRD],
  grading: { equation: 'y=2x+1', first: { consistentWith: 'equation' }, second: { consistentWith: 'first' }, third: { consistentWith: 'second' } },
});
const chainTable = (stage, cells, sourceModel) => ({
  ...tableArtifact(cells, { sourceModel, xValues: stage.xValues }),
});
const CHAINED_RIGHT = Object.freeze({
  equation: 'y=2x+1',
  first: chainTable(CHAIN_FIRST, { '0:y': '1', '1:y': '3', '2:y': '5' }, 'y=2x+1'),
  // WorkflowRunner records an upstream table's own model as this one's source.
  second: chainTable(CHAIN_SECOND, { '0:y': '7', '1:y': '9' }, 'y=2x+1'),
  third: chainTable(CHAIN_THIRD, { '0:y': '11' }, 'y=2x+1'),
});

test('what a table was built from is rebuilt from the work, never taken from the response', () => {
  // Honest work: identical to the device marking, on both paths.
  const honest = bothPaths(CHAINED, CHAINED_RIGHT).server;
  assert.equal(honest.isCorrect, true, JSON.stringify(verdicts(honest)));
  const state = runnerState(CHAINED, CHAINED_RIGHT);
  const before = deviceMarking(CHAINED, CHAINED_RIGHT);
  assert.equal(state.isCorrect, before.isCorrect);
  assert.equal(state.partialCreditPercent, before.partialCreditPercent);

  // Forged: the first table claims it was built from `0`, and the second is a
  // column of zeros. The second is checked against what the first was built
  // from, so on the device's trust in that copy it is "consistent" without a
  // single value computed; rebuilt from the student's own equation it is not.
  // The third table, two links down, the same way.
  const forgedChain = {
    ...CHAINED_RIGHT,
    first: { ...CHAINED_RIGHT.first, sourceModel: '0' },
    second: chainTable(CHAIN_SECOND, { '0:y': '0', '1:y': '0' }, '0'),
    third: chainTable(CHAIN_THIRD, { '0:y': '0' }, '0'),
  };
  const trusted = verdicts(deviceMarking(CHAINED, forgedChain));
  assert.deepEqual([trusted.second, trusted.third], [true, true], 'the device trusted the copies');
  const forged = bothPaths(CHAINED, forgedChain).server;
  assert.deepEqual([verdicts(forged).second, verdicts(forged).third], [false, false]);
  assert.equal(forged.isCorrect, false);
  // ...and a wrong copy on honest tables costs the student nothing.
  const staleCopy = { ...CHAINED_RIGHT, first: { ...CHAINED_RIGHT.first, sourceModel: 'y=0' } };
  assert.equal(bothPaths(CHAINED, staleCopy).server.isCorrect, true);

  // A student whose equation is wrong but whose tables follow it is told the
  // tables are consistent, exactly as before.
  const ownModel = {
    equation: 'y=3x',
    first: chainTable(CHAIN_FIRST, { '0:y': '0', '1:y': '3', '2:y': '6' }, 'y=3x'),
    second: chainTable(CHAIN_SECOND, { '0:y': '9', '1:y': '12' }, 'y=3x'),
    third: chainTable(CHAIN_THIRD, { '0:y': '15' }, 'y=3x'),
  };
  const ownVerdicts = { equation: false, first: true, second: true, third: true };
  assert.deepEqual(verdicts(bothPaths(CHAINED, ownModel).server), ownVerdicts);
  assert.deepEqual(verdicts(deviceMarking(CHAINED, ownModel)), ownVerdicts);
});

/* ------------------------------------------------------------------------ *
 * The browser wiring.
 * ------------------------------------------------------------------------ */

test('WorkflowRunner reports its answer state through the shared grader, never its own marking', () => {
  const runner = executableSource(read('src/platform/workflow/WorkflowRunner.jsx'));
  const effect = region(runner, 'onStateChangeRef.current?.(', '}, [responses]);', 'state-reporting effect');
  assert.match(effect, /buildWorkflowAnswerState\(\{[\s\S]*question:[\s\S]*stages:[\s\S]*responses[\s\S]*grading:/);
  assert.match(runner, /import \{[^}]*\bbuildWorkflowAnswerState\b[^}]*\} from '\.\/workflowAnswerState\.js';/);
  assert.doesNotMatch(runner, /gradeWorkflow\s*\(/, 'no verdict is computed in the runner itself');

  const answerState = executableSource(read('src/platform/workflow/workflowAnswerState.js'));
  // The check is given the student's responses as composed work (an old
  // draft's graph artifact upgraded first; composedWorkflowGraphStages.test.mjs).
  assert.match(answerState, /gradeComposedWorkflowCheck\(question, workflowWork\(responses\)\)/);
  assert.match(answerState, /const workflowWork = \(responses\) => composedWorkflowWork\(upgradeLegacyGraphResponses\(responses\)\);/);
  assert.match(answerState, /answerStateFromSharedGrading\(check/);

  // The table a student fills is the table the grader requires to be filled.
  const tableDelegate = region(runner, 'tableInput: ({ stage, input, content, onChange, draftKey }) => {', '<TableGrader', 'table delegate');
  assert.match(tableDelegate, /workflowTableLayout\(stage\)/);
  assert.match(region(runner, '<TableGrader', '/>', 'table grader props'), /blanks,/);
});

test('the post-submit review reads the canonical submitted work and marks edited steps', () => {
  const responses = { ...RELATION_RIGHT, isFunction: 'No' };
  const state = runnerState(RELATION, responses);
  const stages = readComposedQuestion(RELATION).workflow;
  const review = { responseKey: state.responseKey, parts: state.parts };
  const statuses = (live) => buildWorkflowReviewState({ stages, responses: live, review }).map((entry) => entry.status);
  assert.deepEqual(statuses(responses), ['correct', 'correct', 'correct', 'incorrect']);
  assert.deepEqual(statuses({ ...responses, isFunction: 'Yes' }), ['correct', 'correct', 'correct', 'changed']);

  // Artifacts compare in their work form: a table re-reported with the same
  // cells is unchanged, one with an edited cell has changed.
  const modelingState = runnerState(MODELING, MODELING_RIGHT);
  const modelingStages = readComposedQuestion(MODELING).workflow;
  const modelingReview = { responseKey: modelingState.responseKey, parts: modelingState.parts };
  const tableStatus = (table) => buildWorkflowReviewState({ stages: modelingStages, responses: { ...MODELING_RIGHT, table }, review: modelingReview })
    .find((entry) => entry.id === 'table').status;
  assert.equal(tableStatus({ ...MODELING_RIGHT.table, sourceChecked: 99 }), 'correct');
  // Re-built from a different function, the same cells are no longer the
  // table that was marked: check again.
  assert.equal(tableStatus({ ...MODELING_RIGHT.table, sourceModel: 'C(t)=4t+40' }), 'changed');
  assert.equal(tableStatus(tableArtifact({ '0:y': '40', '1:y': '45', '2:y': '50', '3:y': '56' }, { sourceModel: 'C(t)=5t+40' })), 'changed');
});

test('gradeComposedWorkflowWork is the single marking: the grade function and the browser check share it', () => {
  const { browser } = bothPaths(FIGURES, { sort: sortResponse(FIGURE_KEY) });
  const direct = gradeComposedWorkflowWork(FIGURES, JSON.parse(browser.toolResponse.value));
  assert.equal(direct.isCorrect, browser.isCorrect);
  assert.deepEqual(direct.parts, browser.parts);
});
