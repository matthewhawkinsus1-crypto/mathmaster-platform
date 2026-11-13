/*
 * ALGEBRA I · DISTRICT DOL #4 REVIEW, AS A TEACHER IMPORTS IT.
 *
 * teacher-import-jsons/algebra1-dol4/Algebra1_DOL4_Review.json is the review
 * students do in MathMaster before they take DOL #4 in Eduphoria. It mirrors
 * the district blueprint (SY26-27) question for question, in its order:
 *
 *   A.2A ×2  A.2C ×3  A.3C ×2  A.5A ×3  A.3E  A.4C  A.12C
 *
 * in one Practice section, every item in an interactive tool where the student
 * shows the work (endpoints read off a graph, a model built stage by stage,
 * facts established with a process, equations solved step by step, graphs
 * sorted, a line fitted, a sequence built term by term) rather than a typed
 * box. Questions 8 and 9 are Question Family slots, so each student solves
 * their own equations.
 *
 * Everything here reads the file through the chain a teacher's import uses
 * (scripts/check-teacher-import.mjs), and every verdict comes from the graders
 * the server runs. Each key is worked out HERE from what the student is shown
 * (the endpoints, the rows, the points, the equation, the situation's
 * numbers), never read back from the compiled question, so a key that is
 * wrong cannot pass by agreeing with itself.
 */
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import React from 'react';
import Fraction from 'fraction.js';
import { compileTeacherImport } from '../../scripts/check-teacher-import.mjs';
import { closeEngine, loadEngine } from './helpers/actionBarRender.mjs';
import { render, withBrowser } from './helpers/studentToolRender.mjs';
import { equationOracle } from './helpers/questionFamilyCases.mjs';
import { gradeToolWork, serverResponseGradingSupport } from '../../functions/shared/serverGrading/serverResponseGrading.mjs';
import { deliveredQuestionForGrading } from '../../functions/shared/serverGrading/deliveredQuestion.mjs';
import { gradeComposedWorkflowWork } from '../../functions/shared/serverGrading/questionGraders/composedWorkflow.mjs';
import { gradeEquationWorkspace, gradeRelationWorkspace } from '../../functions/shared/serverGrading/stepAlgebraWorkspaceGrading.mjs';
import { relationSourceFromQuestion } from '../../functions/shared/serverGrading/stepAlgebraRouting.mjs';
import {
  applyBalancedOperationToRelation,
  cloneRelationState,
  parseRelationSource,
  validateRelationTransition,
} from '../../functions/shared/toolMath/algebra-relations/algebraRelationFoundation.mjs';
import { withPromptRelationSource } from '../../src/stepAlgebraRelationRouting.js';
import { resolveComposedWorkflow } from '../../functions/shared/toolMath/workflow/composedWorkflowContract.mjs';
import { resolveWorkflowGraphStages, workflowTableArtifact } from '../../functions/shared/toolMath/workflow/workflowGraphStage.mjs';
import { graphWorkspaceModelFor } from '../../functions/shared/toolMath/graphWorkspace/graphWorkspaceModel.mjs';
import { keyProcessLog } from '../../functions/shared/toolMath/representationBridge/lmrProcessVerify.mjs';
import { resolveRequiredCards } from '../../functions/shared/toolMath/representationBridge/linearMultipleRepresentationsMath.mjs';
import { resolveFamilyPreviewInstance } from '../../functions/shared/questionFamilyInstance.mjs';
import { hintRevealsAnswer } from '../../functions/shared/pathSolutionSupport.mjs';
import { buildFigureMatchResponse } from '../../src/platform/workflow/figureMatch.js';
import { buildQuestionHints, questionAnswerValues } from '../../src/platform/supports/hints/questionHints.js';
import { backUpStepFor, backUpStepWritten } from '../../src/platform/supports/feedback/backUpStep.js';
import { auditAssignmentSolutionReviews, hasAuthoredCommonError, workedSolutionDepth } from '../../src/platform/preflight/solutionReviewPreflight.js';

after(closeEngine);

const here = path.dirname(fileURLToPath(import.meta.url));
const FILE = path.resolve(here, '../../teacher-import-jsons/algebra1-dol4/Algebra1_DOL4_Review.json');
const TEXT = fs.readFileSync(FILE, 'utf8');
const RAW = JSON.parse(TEXT);
const REVIEW = compileTeacherImport(TEXT);
const raw = (id) => RAW.sections[0].questions.find((question) => question.questionId === id);
const item = (id) => {
  const question = REVIEW.questions.find((candidate) => candidate.questionId === id);
  assert.ok(question, `the review compiles ${id}`);
  return question;
};
const failing = (result) => JSON.stringify((result.parts || []).filter((part) => !part.isCorrect).map((part) => part.id || part.label));
const frac = (value) => new Fraction(String(value).replace(/−/g, '-'));
const lineThrough = ([x1, y1], [x2, y2]) => {
  const m = frac(y2).sub(y1).div(frac(x2).sub(x1));
  return { m, b: frac(y1).sub(m.mul(x1)) };
};
const onLine = ({ m, b }, [x, y]) => m.mul(x).add(b).equals(y);
const dollars = (text) => [...text.matchAll(/\$(\d+(?:\.\d+)?)/g)].map(([, value]) => value);

// The versions of a Question Family slot, as the preview deals them.
const VERSIONS = 30;
const versionsOf = (question) => Array.from({ length: VERSIONS }, (_, index) => {
  const { question: version, error } = resolveFamilyPreviewInstance(question, { index });
  assert.equal(error, null, `${question.questionId} version ${index} resolves`);
  return version;
});

// What a plane draws, read back from its own markup: where the gridlines are and where
// each marked point sits (as in the DOL #3 review's test).
const svgNumber = (attributes, name) => Number(new RegExp(`\\b${name}="([^"]*)"`).exec(attributes)?.[1]);
const drawnGrid = (svg) => {
  const lines = [...svg.matchAll(/<line\b([^>]*)>/g)].map((match) => match[1]).filter((attributes) => /--mm-graph-grid/.test(attributes));
  return {
    vertical: lines.filter((a) => svgNumber(a, 'x1') === svgNumber(a, 'x2')).map((a) => svgNumber(a, 'x1')),
    horizontal: lines.filter((a) => svgNumber(a, 'y1') === svgNumber(a, 'y2')).map((a) => svgNumber(a, 'y1')),
  };
};
const markedPoints = (svg) => [...svg.matchAll(/<circle\b([^>]*)>/g)].map(([, a]) => [svgNumber(a, 'cx'), svgNumber(a, 'cy')]);
const pointsOffTheGrid = (svg) => {
  const { vertical, horizontal } = drawnGrid(svg);
  const through = (lines, value) => lines.some((line) => Math.abs(line - value) < 0.6);
  return markedPoints(svg).filter(([cx, cy]) => !through(vertical, cx) || !through(horizontal, cy));
};
const svgOf = (markup, label) => new RegExp(`<svg\\b[^>]*aria-label="${label}"[\\s\\S]*?</svg>`).exec(markup)?.[0] || '';
const studentBoard = async (questionData) => {
  const { server } = await loadEngine();
  const registry = await server.ssrLoadModule('/src/tools/toolRegistry.js');
  const { ToolRuntimeProvider } = await server.ssrLoadModule('/src/tools/shared/ToolRuntimeContext.jsx');
  const board = registry.getToolDefinition(questionData.type).component;
  return withBrowser(() => render(React.createElement(ToolRuntimeProvider, { submitCost: null }, React.createElement(board, { questionData, onAction() {}, attemptRecord: null }))));
};

/* ------------------------------------------------------------ the shape -- */

test('the review passes the teacher import\'s Pre-Flight with no errors and no warnings, and hides none of its hints', () => {
  assert.deepEqual(REVIEW.model.errors, []);
  assert.deepEqual(REVIEW.model.warnings || [], []);
  assert.equal(REVIEW.model.isValid, true);
  assert.deepEqual(REVIEW.semantic.errors, []);
  // A teacher-written hint that names an answer is dropped at runtime; none is.
  assert.deepEqual(REVIEW.model.hiddenHints?.warnings || [], []);
  assert.deepEqual(REVIEW.model.hintAnswers?.warnings || [], []);
  // Every question says what to check after a miss.
  assert.deepEqual(REVIEW.model.attemptFeedback?.warnings || [], []);
});

test('it is one Practice section of 13 equal questions: the test itself is taken in Eduphoria', () => {
  assert.equal(RAW.assignment.courseId, 'algebra1');
  assert.match(RAW.assignment.instructions, /Eduphoria/);
  assert.equal(RAW.sections.length, 1);
  const [practice] = RAW.sections;
  assert.equal(practice.role, 'practice');
  assert.equal(practice.attemptsAllowed, 3);
  assert.equal(practice.hintsAllowed, true);
  assert.equal(practice.feedbackMode, 'immediate');
  assert.equal(REVIEW.questions.length, 13, 'every question survives the import');
  // Every blueprint question is worth the same on the DOL, so here too.
  for (const question of REVIEW.questions) assert.equal(Number(question.questionWeight), 1, `${question.questionId} is worth one question`);
  // The two equation families give each student their own equations.
  assert.equal(RAW.variantPolicy.sectionModes.practice, 'personalized');
});

test('its questions follow the DOL #4 blueprint, in its order: two A.2A, three A.2C, two A.3C, three A.5A, then A.3E, A.4C and A.12C', () => {
  const primaries = REVIEW.questions.map((question) => {
    const primary = question.alignments.filter((alignment) => alignment.role === 'primary');
    assert.equal(primary.length, 1, `${question.questionId} has one primary standard`);
    return primary[0].code;
  });
  assert.deepEqual(primaries, ['A.2A', 'A.2A', 'A.2C', 'A.2C', 'A.2C', 'A.3C', 'A.3C', 'A.5A', 'A.5A', 'A.5A', 'A.3E', 'A.4C', 'A.12C']);
});

test('every question is an interactive tool the server can mark — no typed-box items', () => {
  const RICH = new Set(['functionCharacteristics', 'relationshipModel', 'linearTableWorkbench', 'representationBridge', 'stepAlgebra', 'figureMatch', 'dataModelingLab', 'sequenceExplorer']);
  for (const question of REVIEW.questions) {
    assert.ok(RICH.has(question.type), `${question.questionId} is ${question.type}`);
    // A family slot is marked on the version the student was given.
    const delivered = question.questionFamily ? versionsOf(question)[0] : question;
    const support = serverResponseGradingSupport(deliveredQuestionForGrading(delivered));
    assert.equal(support.supported, true, `${question.questionId}: ${support.reason}`);
  }
  assert.equal(new Set(REVIEW.questions.map((question) => question.type)).size, 8, 'eight different tools');
  // Process Mode: the board's facts are established by a process, not typed.
  for (const question of REVIEW.questions.filter((candidate) => candidate.type === 'representationBridge')) {
    assert.equal(question.interactionMode, 'process', `${question.questionId} establishes its facts with a process`);
  }
});

test('every question carries three hints, a "Let\'s back up" step with the right choice among two, and two lines of advice for the next try', () => {
  for (const question of REVIEW.questions) {
    assert.equal(question.hints.length, 3, `${question.questionId} hints`);
    const step = backUpStepFor(question);
    assert.ok(backUpStepWritten(step) && step.source === 'authored', `${question.questionId} has a written back-up step (${step.source})`);
    assert.equal(step.options.length, 2, question.questionId);
    assert.ok(step.options.includes(step.correct), question.questionId);
    assert.equal(raw(question.questionId).attemptFeedback.length, 2, `${question.questionId}: advice after the first and the second miss`);
  }
});

test('no hint, back-up step or piece of advice states an answer, and every hint is shown, on every version a student can get', () => {
  for (const question of REVIEW.questions) {
    const written = raw(question.questionId);
    const supports = [...written.hints, written.scaffold.prompt, ...written.scaffold.options, ...written.attemptFeedback];
    for (const version of question.questionFamily ? versionsOf(question) : [question]) {
      const answers = questionAnswerValues(version);
      assert.ok(answers.length > 0 || version.type === 'figureMatch', `${question.questionId}: the version has answers to guard`);
      supports.forEach((text) => assert.equal(hintRevealsAnswer(text, answers), false, `${question.questionId}: "${text}" states an answer`));
      // The runtime guard drops a hint that names an answer: on a family slot
      // that is decided per version ("no solution" is one version's answer).
      const shown = buildQuestionHints(version).map((hint) => hint.text);
      written.hints.forEach((hint) => assert.ok(shown.includes(hint), `${question.questionId}: "${hint}" is shown`));
    }
  }
});

/* ------------------------------------------------- after the last try -- */

test('after the last try every question walks through worked steps and names the usual mistake', () => {
  // The advice Pre-Flight gives the teacher about worked solutions: none left.
  assert.deepEqual(auditAssignmentSolutionReviews(REVIEW.questions).warnings, []);
  for (const question of REVIEW.questions) {
    assert.equal(workedSolutionDepth(question), 'steps', `${question.questionId} shows steps, not only the answer`);
    assert.ok(hasAuthoredCommonError(question), `${question.questionId} names the usual mistake`);
  }
});

/* ------------------------------------------------------------- A.2A ×2 -- */

test('A.2A (graph): the domain and range are read from a closed and an open end, as inequalities', () => {
  const question = item('dol4-review-q01');
  // The segment the student sees: f(x) = −2x + 3 from a closed dot at x = −2 to an open dot at x = 3.
  const { m, b, domain } = raw('dol4-review-q01').function;
  assert.deepEqual([m, b, domain.min, domain.max, domain.minClosed, domain.maxClosed], [-2, 3, -2, 3, true, false]);
  const f = (x) => m * x + b;
  // A falling line: its highest point is the closed left end, its lowest the open right end.
  assert.deepEqual([f(domain.min), f(domain.max)], [7, -3]);
  const grade = (responses) => gradeComposedWorkflowWork(question, { responses });
  const key = { domain: `${domain.min} <= x < ${domain.max}`, range: `${f(domain.max)} < y <= ${f(domain.min)}` };
  assert.equal(grade(key).isCorrect, true, failing(grade(key)));
  assert.equal(grade({ domain: '−2 ≤ x < 3', range: '−3 < y ≤ 7' }).isCorrect, true, 'the ≤ symbol and the true minus sign');
  assert.equal(grade({ ...key, domain: '-2 <= x <= 3' }).isCorrect, false, 'the open end written closed');
  assert.equal(grade({ ...key, range: '-3 <= y <= 7' }).isCorrect, false, 'the open end\'s output written closed');
  assert.equal(grade({ ...key, range: '-2 < y <= 3' }).isCorrect, false, 'the domain\'s endpoints copied into the range');
});

test('A.2A (discrete): 20 points at 4 a game allows 0–5 whole games, and the model is built and graded stage by stage', () => {
  const question = item('dol4-review-q02');
  const match = /starts with (\d+) points\. Each game costs (\d+) points/.exec(question.prompt);
  assert.ok(match, 'the situation\'s numbers');
  const [start, cost] = match.slice(1).map(Number);
  assert.deepEqual([start, cost], [20, 4]);
  const most = Math.floor(start / cost);
  const domain = Array.from({ length: most + 1 }, (_, n) => n);
  const rule = (x) => start - cost * x;
  const range = domain.map(rule).sort((left, right) => left - right);
  const { composed } = resolveComposedWorkflow(question);
  const responses = {
    quantities: { independent: 'games', dependent: 'points' },
    equation: `f(x)=${start}-${cost}x`,
    continuity: 'discrete',
    domainDiscrete: `{${domain.join(', ')}}`,
    rangeDiscrete: `{${range.join(', ')}}`,
  };
  const tableStage = composed.workflow.find((stage) => stage.kind === 'tableInput');
  responses.table = workflowTableArtifact({ stage: tableStage, cells: Object.fromEntries(tableStage.xValues.map((x, row) => [`${row}:y`, String(rule(x))])), isComplete: true, sourceModel: responses.equation, content: composed.content });
  const [[graphStageId, resolution]] = [...resolveWorkflowGraphStages({ workflow: composed.workflow, content: composed.content, grading: composed.grading, responses })];
  assert.equal(resolution.status, 'ready', 'the graph step opens from the student\'s table');
  const stageModel = graphWorkspaceModelFor(resolution.question, {});
  responses[graphStageId] = { __mathmasterWorkflowArtifact: 'graph', isComplete: true, analysis: {}, construction: {
    placements: Object.fromEntries(stageModel.tasks.map((task) => [task.id, [Number(task.x), rule(Number(task.x))]])), pointsLocked: true } };
  const grade = (overrides = {}) => gradeComposedWorkflowWork(question, { responses: { ...responses, ...overrides } });
  assert.equal(grade().isCorrect, true, failing(grade()));
  assert.equal(grade({ equation: `y=-${cost}x+${start}` }).isCorrect, true, 'y = −4x + 20 is the same rule');
  assert.equal(grade({ rangeDiscrete: `{${[...range].reverse().join(', ')}}` }).isCorrect, true, 'a set in any order');
  for (const [what, overrides] of [
    ['a card with no games played yet', { domainDiscrete: `{${domain.slice(1).join(', ')}}` }],
    ['the 0 points left after the last game', { rangeDiscrete: `{${range.slice(1).join(', ')}}` }],
    ['continuous', { continuity: 'continuous' }],
    ['the roles swapped', { quantities: { independent: 'points', dependent: 'games' } }],
    ['the cost of a game is not the input', { quantities: { independent: 'cost', dependent: 'points' } }],
    ['adding the cost of each game', { equation: `f(x)=${start}+${cost}x` }],
  ]) assert.equal(grade(overrides).isCorrect, false, what);
});

/* ------------------------------------------------------------- A.2C ×3 -- */

test('A.2C (table): three recorded intervals prove the constant rate, and m, b and the equation come from the rows', () => {
  const question = item('dol4-review-q03');
  const rows = question.rows.map(({ x, y }) => [x, y]);
  const line = lineThrough(rows[0], rows[rows.length - 1]);
  rows.forEach((row) => assert.ok(onLine(line, row), `(${row}) is on the line`));
  assert.ok(rows.slice(1).every(([x], index) => x - rows[index][0] === 4), 'the x-values step by 4, not 1');
  assert.ok(!rows.some(([x]) => x === 0), 'no row gives b away');
  assert.deepEqual([line.m.toFraction(), line.b.toFraction()], ['-3/2', '2']);
  const intervals = [[0, 1], [1, 2], [2, 3]].map(([i, j]) => ({ i, j, dx: String(rows[j][0] - rows[i][0]), dy: String(rows[j][1] - rows[i][1]), rate: line.m.toFraction() }));
  const work = { intervals, classification: 'linear', m: line.m.toFraction(), b: line.b.toFraction(), equation: `y = ${line.m.toFraction()}x + ${line.b.toFraction()}`, repairRowIndex: null, repairedValue: '' };
  const grade = (overrides = {}) => gradeToolWork({ toolId: 'linearTableWorkbench', question, work: { ...work, ...overrides } });
  assert.equal(grade().isCorrect, true, failing(grade()));
  assert.equal(grade({ m: '-1.5', equation: 'y = -1.5x + 2' }).isCorrect, true, 'the decimal slope');
  assert.equal(grade({ intervals: intervals.map((entry) => ({ ...entry, rate: entry.dy })) }).isCorrect, false, 'Δy alone is not the rate when Δx ≠ 1');
  assert.equal(grade({ m: '3/2', equation: 'y = 3/2x + 2' }).isCorrect, false, 'the sign of the rate dropped');
  assert.equal(grade({ b: '5', equation: 'y = -3/2x + 5' }).isCorrect, false, 'the first row\'s y taken for b');
  assert.equal(grade({ intervals: intervals.slice(0, 2) }).isCorrect, false, 'two intervals are not the three asked for');
});

test('A.2C (graph, draining pool): rise over run gives −2/3 of a foot an hour, and each meaning has exactly one right choice', () => {
  const question = item('dol4-review-q04');
  const points = question.source.points.map(({ x, y }) => [x, y]);
  const line = lineThrough(points[0], points[1]);
  points.forEach((point) => assert.ok(onLine(line, point), `(${point}) is on the line`));
  assert.deepEqual([line.m.toFraction(), line.b.toFraction()], ['-2/3', '6']);
  assert.match(question.xAxisLabel, /hours/);
  assert.match(question.yAxisLabel, /feet/);
  // Both intercepts are on the grid the student reads (the pool is empty at 9 hours).
  const zero = line.b.neg().div(line.m);
  assert.equal(zero.valueOf(), 9);
  const { xMin, xMax, yMin, yMax } = question.graphBounds;
  [[zero.valueOf(), 0], [0, line.b.valueOf()]].forEach(([x, y]) => assert.ok(x >= xMin && x <= xMax && y >= yMin && y <= yMax, `(${x}, ${y}) is on the grid`));
  const context = {
    contextSlopeMeaning: 'The water gets 2/3 of a foot shallower each hour.',
    contextYInterceptMeaning: 'The water is 6 feet deep when the pump starts.',
  };
  const work = { slopeInterceptEquation: 'y = -2/3x + 6', ...context, processLog: keyProcessLog(question) };
  const grade = (overrides = {}) => gradeToolWork({ toolId: 'representationBridge', question, work: { ...work, ...overrides } });
  assert.equal(grade().isCorrect, true, failing(grade()));
  assert.deepEqual(resolveRequiredCards(question).sort(), ['slope', 'slopeIntercept', 'yIntercept']);
  // The slope is reached by a process on the graph, not typed.
  assert.ok(work.processLog.entries.some((entry) => ['riseRun', 'twoPointFormula'].includes(entry.strategy) && entry.target === 'slope'), JSON.stringify(work.processLog.entries));
  assert.equal(grade({ slopeInterceptEquation: 'y = -3/2x + 6' }).isCorrect, false, 'the run over the rise');
  assert.equal(grade({ slopeInterceptEquation: 'y = 2/3x + 6' }).isCorrect, false, 'the water getting deeper');
  for (const [name, field] of [['slopeMeaning', 'contextSlopeMeaning'], ['yInterceptMeaning', 'contextYInterceptMeaning']]) {
    for (const choice of question.context[name].choices) {
      assert.equal(grade({ [field]: choice }).isCorrect, choice === context[field], `${field}: "${choice}"`);
    }
  }
});

test('A.2C (graph, draining pool): every point the given graph marks sits where gridlines cross, so the rise and the run can be counted exactly', async () => {
  const question = item('dol4-review-q04');
  const markup = await studentBoard(question);
  const svg = svgOf(markup, 'Given graph of the line');
  assert.ok(svg, 'the pool graph is drawn');
  assert.equal(markedPoints(svg).length, question.source.points.length, 'every point the situation gives is drawn');
  assert.deepEqual(pointsOffTheGrid(svg), [], 'no marked point sits between gridlines');
  assert.match(question.hints[0], /grid/i, 'hint 1 sends students to the grid, which holds all four points');
});

test('A.2C (verbal, plumber): the $65 fee and the $45 an hour become y = 45x + 65, and the table is filled from the student\'s own equation', () => {
  const question = item('dol4-review-q05');
  const [fee, perHour] = dollars(question.prompt).map(Number);
  assert.match(question.prompt, /\$\d+ service fee for each visit plus \$\d+ for each hour/);
  const rule = (x) => perHour * x + fee;
  const { composed } = resolveComposedWorkflow(question);
  const tableStage = composed.workflow.find((stage) => stage.kind === 'tableInput');
  assert.deepEqual(tableStage.xValues, [0, 1, 2, 4]);
  assert.deepEqual(tableStage.xValues.map(rule), [65, 110, 155, 245]);
  const table = (f, equation) => workflowTableArtifact({ stage: tableStage, cells: Object.fromEntries(tableStage.xValues.map((x, row) => [`${row}:y`, String(f(x))])), isComplete: true, sourceModel: equation, content: composed.content });
  const responses = { quantities: { independent: 'hours', dependent: 'charge' }, equation: `y=${perHour}x+${fee}` };
  responses.table = table(rule, responses.equation);
  const grade = (overrides = {}) => gradeComposedWorkflowWork(question, { responses: { ...responses, ...overrides } });
  assert.equal(grade().isCorrect, true, failing(grade()));
  assert.equal(grade({ equation: `y=${fee}+${perHour}x` }).isCorrect, true, 'the fee written first');
  assert.equal(grade({ equation: `y=${fee}x+${perHour}`, table: table((x) => fee * x + perHour, `y=${fee}x+${perHour}`) }).isCorrect, false, 'the fee charged for every hour');
  assert.equal(grade({ quantities: { independent: 'fee', dependent: 'charge' } }).isCorrect, false, 'the fee is not the input');
  assert.equal(grade({ table: table((x) => (x === 2 ? rule(x) - 5 : rule(x)), responses.equation) }).isCorrect, false, 'a slip in one row');
});

/* ------------------------------------------------------------- A.3C ×2 -- */

test('A.3C (standard form): 2x − 5y = 10 meets the axes at (5, 0) and (0, −2), and is graphed from them', () => {
  const question = item('dol4-review-q06');
  assert.equal(question.source.equation, '2x-5y=10');
  const [A, B, C] = [2, -5, 10];
  const xIntercept = [C / A, 0];
  const yIntercept = [0, C / B];
  assert.deepEqual([xIntercept, yIntercept], [[5, 0], [0, -2]]);
  assert.equal(lineThrough(xIntercept, yIntercept).m.toFraction(), '2/5');
  const work = { graph1Points: [xIntercept, yIntercept], processLog: keyProcessLog(question) };
  const grade = (overrides = {}) => gradeToolWork({ toolId: 'representationBridge', question, work: { ...work, ...overrides } });
  assert.equal(grade().isCorrect, true, failing(grade()));
  assert.equal(grade({ graph1Points: [[5, 0], [0, 2]] }).isCorrect, false, 'dividing by 5 instead of −5');
  assert.equal(grade({ graph1Points: [[-2, 0], [0, 5]] }).isCorrect, false, 'the intercepts traded places');
  const { xMin, xMax, yMin, yMax } = question.graphBounds;
  [xIntercept, yIntercept].forEach(([x, y]) => assert.ok(x >= xMin && x <= xMax && y >= yMin && y <= yMax, `(${x}, ${y}) is on the grid`));
});

test('A.3C with A.2A (descending balloon): the zero is when it lands, each intercept is located and then written, and the domain and range are the situation\'s', () => {
  const question = item('dol4-review-q07');
  const { m, b, domain } = raw('dol4-review-q07').function;
  const landed = -b / m;
  assert.deepEqual([landed, b], [12, 1200]);
  assert.deepEqual([domain.min, domain.max], [0, landed], 'the graph runs from the start of the descent to the landing');
  const grade = (responses) => gradeComposedWorkflowWork(question, { responses });
  const key = {
    xInterceptExists: 'Yes',
    xIntercept: `(${landed}, 0)`,
    xInterceptValue: `(${landed}, 0)`,
    zeros: `{${landed}}`,
    yInterceptExists: 'Yes',
    yIntercept: `(0, ${b})`,
    yInterceptValue: `(0, ${b})`,
    domain: `0 <= x <= ${landed}`,
    range: `0 <= y <= ${b}`,
  };
  assert.equal(grade(key).isCorrect, true, failing(grade(key)));
  assert.equal(grade({ ...key, xInterceptValue: `(0, ${landed})` }).isCorrect, false, 'the coordinates swapped');
  assert.equal(grade({ ...key, zeros: `{${b}}` }).isCorrect, false, 'the starting height is not a zero');
  assert.equal(grade({ ...key, xInterceptExists: 'No' }).isCorrect, false, 'the graph does meet the x-axis');
  assert.equal(grade({ ...key, domain: `0 <= x <= ${b}` }).isCorrect, false, 'the heights are not the times');
  assert.equal(grade({ ...key, range: `0 < y <= ${b}` }).isCorrect, false, 'the balloon does reach the ground');
});

/* ------------------------------------------------------------- A.5A ×3 -- */

test('A.5A (family, one solution): every version distributes, has the variable on both sides and one solution, and the server marks it', () => {
  const question = item('dol4-review-q08');
  assert.deepEqual(question.questionFamily, { id: 'linear.multiStepEquation', version: 3, constraints: { solutionCase: 'one', distribute: true } });
  const equations = new Set();
  for (const version of versionsOf(question)) {
    const oracle = equationOracle(version);
    assert.equal(oracle.case, 'one', `${version.equation}: one solution`);
    const { variable, leftExpression, rightExpression } = version;
    assert.ok(/\(/.test(`${leftExpression}${rightExpression}`), `${version.equation}: something to distribute`);
    assert.ok(leftExpression.includes(variable) && rightExpression.includes(variable), `${version.equation}: ${variable} on both sides`);
    const right = gradeEquationWorkspace(version, { equation: { left: variable, right: oracle.value } });
    assert.equal(right.isCorrect, true, `${version.equation}: ${variable} = ${oracle.value}`);
    const wrong = gradeEquationWorkspace(version, { equation: { left: variable, right: frac(oracle.value).add(1).toFraction() } });
    assert.equal(wrong.isCorrect, false, `${version.equation}: one more is not a solution`);
    equations.add(version.equation);
  }
  assert.equal(equations.size, VERSIONS, 'every student gets their own equation');
});

test('A.5A (family, any case): versions with one solution, none and every number all come up, and each conclusion is marked by the server', () => {
  const question = item('dol4-review-q09');
  assert.deepEqual(question.questionFamily, { id: 'linear.multiStepEquation', version: 3, constraints: { solutionCase: 'mixed', distribute: true } });
  const NONE = { special: 'noSolution', connective: null, branches: [] };
  const ALL = { special: 'allReals', connective: null, branches: [] };
  const cases = {};
  for (const version of versionsOf(question)) {
    // Every version opens the workspace that can say "No solution" and "All real numbers".
    assert.equal(version.relationWorkspace, true, version.equation);
    const oracle = equationOracle(version);
    cases[oracle.case] = (cases[oracle.case] || 0) + 1;
    const value = (number) => ({ special: null, connective: null, branches: [{ expressions: [version.variable, number], relations: ['='] }] });
    const [right, ...wrongs] = {
      none: [NONE, ALL, value('0')],
      infinite: [ALL, NONE, value('0')],
      one: [oracle.case === 'one' ? value(oracle.value) : null, NONE, ALL],
    }[oracle.case];
    assert.equal(gradeRelationWorkspace(version, { relation: right }).isCorrect, true, `${version.equation}: ${oracle.case}`);
    wrongs.forEach((wrong) => assert.equal(gradeRelationWorkspace(version, { relation: wrong }).isCorrect, false, `${version.equation}: ${JSON.stringify(wrong)}`));
  }
  assert.ok(cases.none > 0 && cases.infinite > 0 && cases.one > 0, JSON.stringify(cases));
});

test('A.5A (phone plans): the plans\' prices give 25 + 0.10t = 15 + 0.15t, solved step by step to t = 200', () => {
  const question = item('dol4-review-q10');
  const [baseA, perA, baseB, perB] = dollars(question.prompt).map(frac);
  const texts = baseA.sub(baseB).div(perB.sub(perA));
  assert.equal(texts.valueOf(), 200);
  assert.ok(baseA.add(perA.mul(texts)).equals(baseB.add(perB.mul(texts))), 'both plans cost the same at 200 texts');
  const price = (value) => value.valueOf().toFixed(2);
  assert.equal(raw('dol4-review-q10').equation, `${baseA.valueOf()} + ${price(perA)}t = ${baseB.valueOf()} + ${price(perB)}t`, 'the workspace shows the plans\' own prices');

  // The workspace's own step checks, on the way a student solves it.
  let state = parseRelationSource(relationSourceFromQuestion(withPromptRelationSource(question)), question.solveFor);
  const operate = (operation, operandExpression) => {
    const next = applyBalancedOperationToRelation(state, operation, operandExpression).state;
    const verdict = validateRelationTransition(state, next, { kind: 'balancedOperation', operation, operandExpression, branchIndices: [0] });
    assert.equal(verdict.valid, true, `${operation} ${operandExpression}: ${verdict.reason}`);
    state = next;
  };
  const rewrite = (expressions, valid = true) => {
    const next = cloneRelationState(state);
    next.branches[0].expressions = expressions;
    const verdict = validateRelationTransition(state, next, { kind: 'equivalentRewrite' });
    assert.equal(verdict.valid, valid, `${expressions.join(' = ')}: ${verdict.reason}`);
    if (verdict.valid) state = next;
  };
  operate('subtract', '0.10t');
  rewrite(['25', '15 + 0.05t']);
  operate('subtract', '15');
  rewrite(['10', '0.05t']);
  rewrite(['10', '0.5t'], false); // the usual slip: 0.15 − 0.10 is 0.05, not 0.5
  operate('divide', '0.05');
  rewrite(['200', 't']);
  const relation = { special: state.special || null, connective: state.connective ?? null, branches: state.branches };
  const finished = gradeRelationWorkspace(question, { relation });
  assert.equal(finished.isCorrect && finished.isComplete, true, 'the student\'s finished work is credited');
  const value = (number) => ({ special: null, connective: null, branches: [{ expressions: ['t', number], relations: ['='] }] });
  assert.equal(gradeRelationWorkspace(question, { relation: value('20') }).isCorrect, false, 'dividing by 0.5');
  assert.equal(gradeRelationWorkspace(question, { relation: { special: 'noSolution', connective: null, branches: [] } }).isCorrect, false, 'the plans do cost the same once');
});

/* --------------------------------------------------------------- A.3E -- */

test('A.3E: each graph is matched to the one change of f(x) = x among 3f(x), f(x) + 6, f(x − 4) and f((1/4)x) that draws it', () => {
  const question = item('dol4-review-q11');
  const [stage] = question.workflow;
  // Each category as a change of the parent function f(x) = x.
  const f = (x) => x;
  const CHANGES = {
    '3f(x)': (x) => 3 * f(x),
    'f(x) + 6': (x) => f(x) + 6,
    'f(x − 4)': (x) => f(x - 4),
    'f((1/4)x)': (x) => f(x / 4),
  };
  const labels = Object.fromEntries(stage.categories.map((category) => [category.label, category.id]));
  assert.deepEqual(Object.keys(labels).sort(), Object.keys(CHANGES).sort(), 'one of each kind of change the TEKS names');
  const key = {};
  for (const figure of raw('dol4-review-q11').figures) {
    const { m, b } = figure.function;
    const draws = Object.entries(CHANGES).filter(([, change]) => [-8, -1, 0, 3, 8].every((x) => Math.abs(change(x) - (m * x + b)) < 1e-9));
    assert.equal(draws.length, 1, `${figure.id}: exactly one change draws y = ${m}x + ${b}`);
    key[figure.id] = labels[draws[0][0]];
  }
  const grade = (match) => gradeComposedWorkflowWork(question, { responses: { sort: buildFigureMatchResponse(stage, match) } });
  assert.equal(grade(key).isCorrect, true, failing(grade(key)));
  // f(x − 4) moved left instead of right: the usual mistake, the sign read forward.
  const ids = Object.keys(key);
  for (const [one, other] of ids.flatMap((left, index) => ids.slice(index + 1).map((right) => [left, right]))) {
    assert.equal(grade({ ...key, [one]: key[other], [other]: key[one] }).isCorrect, false, `${one} and ${other} swapped`);
  }
});

/* --------------------------------------------------------------- A.4C -- */

test('A.4C: the line is estimated by hand, then fitted by linear regression in the lab, and predicts about 64 cups at 52°F', () => {
  const question = item('dol4-review-q12');
  assert.equal(question.mode, 'lineFit', 'an estimate with the steppers, then regression technology');
  assert.ok(question.studentActions.includes('fitDataModel'), 'the lab offers its "Run linear regression" button');
  const points = question.points.map(({ x, y }) => [x, y]);
  const n = points.length;
  const meanX = points.reduce((sum, [x]) => sum + x, 0) / n;
  const meanY = points.reduce((sum, [, y]) => sum + y, 0) / n;
  const sxy = points.reduce((sum, [x, y]) => sum + (x - meanX) * (y - meanY), 0);
  const sxx = points.reduce((sum, [x]) => sum + (x - meanX) ** 2, 0);
  const syy = points.reduce((sum, [, y]) => sum + (y - meanY) ** 2, 0);
  const m = sxy / sxx;
  const b = meanY - m * meanX;
  // A strong negative association, so a line is a reasonable model.
  assert.ok(sxy / Math.sqrt(sxx * syy) < -0.99, 'r is close to −1');
  const prediction = Math.round(m * question.predictionX + b);
  assert.equal(question.predictionX, 52);
  assert.equal(prediction, 64);
  assert.equal(question.xAxisLabel, 'Outdoor temperature (°F)');
  assert.equal(question.yAxisLabel, 'Cups of hot cocoa sold');
  const round3 = (value) => Math.round(value * 1000) / 1000;
  const work = { m: round3(m), b: round3(b), predictionX: question.predictionX, predictionY: String(prediction), regressionTechnologyRun: true };
  const grade = (overrides = {}) => gradeToolWork({ toolId: 'dataModelingLab', question, work: { ...work, ...overrides } });
  assert.equal(grade().isCorrect, true, failing(grade()));
  assert.equal(grade({ predictionY: String(prediction + 5) }).isCorrect, false, 'a prediction off the line');
  assert.equal(grade({ m: -1, b: 120 }).isCorrect, false, 'a line that does not fit the data');
});

/* -------------------------------------------------------------- A.12C -- */

test('A.12C: f(1) = 23 and f(n) = f(n − 1) − 6, applied term by term, fill the table and the discrete graph and give f(9) = −25', () => {
  const question = item('dol4-review-q13');
  const match = /f\(1\) = (−?\d+) and f\(n\) = f\(n − 1\) − (\d+)/.exec(question.prompt);
  assert.ok(match, 'the recursive rule in function form');
  const [first, step] = [Number(match[1].replace('−', '-')), -Number(match[2])];
  assert.deepEqual(question.sequence, { kind: 'arithmetic', first, difference: step });
  assert.doesNotMatch(question.prompt, /arithmetic/i, 'the prompt does not answer the classification');
  assert.equal(question.notation, 'f(n)', 'the tool writes the terms the way the DOL does');
  const terms = [first];
  while (terms.length < question.targetN) terms.push(terms[terms.length - 1] + step);
  assert.deepEqual(terms.slice(0, question.displayCount), [23, 17, 11, 5, -1, -7]);
  const target = terms[question.targetN - 1];
  assert.equal(target, -25);
  const shown = terms.slice(0, question.displayCount);
  const work = { tableValues: shown.map(String), plottedPoints: shown.map((value, index) => [index + 1, value]), kindAnswer: 'arithmetic', changeAnswer: String(step), explicitRule: '', recursiveFirst: '', recursiveRule: '', termAnswer: String(target) };
  const grade = (overrides = {}) => gradeToolWork({ toolId: 'sequenceExplorer', question, work: { ...work, ...overrides } });
  assert.equal(grade().isCorrect, true, failing(grade()));
  assert.equal(grade({ termAnswer: String(terms[question.targetN - 2]) }).isCorrect, false, 'f(8), one term short');
  assert.equal(grade({ termAnswer: String(target + step) }).isCorrect, false, 'f(10), one term past');
  assert.equal(grade({ changeAnswer: String(-step) }).isCorrect, false, 'the terms go down');
  assert.equal(grade({ tableValues: shown.map((value, index) => String(index === 3 ? value + 1 : value)) }).isCorrect, false, 'a slip in one term');
  assert.equal(grade({ plottedPoints: shown.map((value, index) => [index, value]) }).isCorrect, false, 'points plotted at n − 1');
  assert.equal(grade({ kindAnswer: 'geometric' }).isCorrect, false, 'subtracting is not multiplying');
});
