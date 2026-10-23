/*
 * ALGEBRA I · DISTRICT DOL #3 REVIEW, AS A TEACHER IMPORTS IT.
 *
 * teacher-import-jsons/algebra1-dol3/Algebra1_DOL3_Review.json is the review
 * students do in MathMaster before they take DOL #3 in Eduphoria. It mirrors
 * the district blueprint (SY26-27) question for question:
 *
 *   A.2A ×2  A.2C ×2  A.3B ×2  A.3C ×2  A.2B  A.4B  A.4C  A.12A  A.12C
 *
 * in one Practice section, every item in an interactive tool where the student
 * shows the work (intervals recorded, facts established with a process, points
 * plotted, sorts explained) rather than a typed box.
 *
 * Everything here reads the file through the chain a teacher's import uses
 * (scripts/check-teacher-import.mjs), and every verdict comes from the graders
 * the server runs. Each key is worked out HERE from what the student is shown
 * — the rows, the points, the equation, the situation's numbers — never read
 * back from the compiled question, so a key that is wrong cannot pass by
 * agreeing with itself.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Fraction from 'fraction.js';
import { compileTeacherImport } from '../../scripts/check-teacher-import.mjs';
import { gradeToolWork, serverResponseGradingSupport } from '../../functions/shared/serverGrading/serverResponseGrading.mjs';
import { deliveredQuestionForGrading } from '../../functions/shared/serverGrading/deliveredQuestion.mjs';
import { gradeComposedWorkflowWork } from '../../functions/shared/serverGrading/questionGraders/composedWorkflow.mjs';
import { resolveComposedWorkflow } from '../../functions/shared/toolMath/workflow/composedWorkflowContract.mjs';
import { resolveWorkflowGraphStages, workflowTableArtifact } from '../../functions/shared/toolMath/workflow/workflowGraphStage.mjs';
import { graphWorkspaceModelFor } from '../../functions/shared/toolMath/graphWorkspace/graphWorkspaceModel.mjs';
import { keyProcessLog } from '../../functions/shared/toolMath/representationBridge/lmrProcessVerify.mjs';
import { resolveRequiredCards } from '../../functions/shared/toolMath/representationBridge/linearMultipleRepresentationsMath.mjs';
import { backUpStepFor, backUpStepWritten } from '../../src/platform/supports/feedback/backUpStep.js';
import { openSortSettings } from '../../functions/shared/toolMath/openSortBoard/openSortMath.mjs';
import { auditAssignmentSolutionReviews, hasAuthoredCommonError, workedSolutionDepth } from '../../src/platform/preflight/solutionReviewPreflight.js';
import { buildClosedQuestionReview } from '../../src/platform/supports/review/closedQuestionReview.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const FILE = path.resolve(here, '../../teacher-import-jsons/algebra1-dol3/Algebra1_DOL3_Review.json');
const TEXT = fs.readFileSync(FILE, 'utf8');
const RAW = JSON.parse(TEXT);
const REVIEW = compileTeacherImport(TEXT);
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

/* ------------------------------------------------------------ the shape -- */

test('the review passes the teacher import\'s Pre-Flight with no errors and no warnings, and hides none of its hints', () => {
  assert.deepEqual(REVIEW.model.errors, []);
  assert.deepEqual(REVIEW.model.warnings || [], []);
  assert.equal(REVIEW.model.isValid, true);
  assert.deepEqual(REVIEW.semantic.errors, []);
  // A teacher-written hint that names an answer is dropped at runtime; none is.
  assert.deepEqual(REVIEW.model.hiddenHints?.warnings || [], []);
  assert.deepEqual(REVIEW.model.hintAnswers?.warnings || [], []);
});

test('it is one Practice section of 13 equal questions: the test itself is taken in Eduphoria', () => {
  assert.equal(RAW.assignment.courseId, 'algebra1');
  assert.equal(RAW.sections.length, 1);
  const [practice] = RAW.sections;
  assert.equal(practice.role, 'practice');
  assert.equal(practice.attemptsAllowed, 3);
  assert.equal(practice.hintsAllowed, true);
  assert.equal(practice.feedbackMode, 'immediate');
  assert.equal(REVIEW.questions.length, 13, 'every question survives the import');
  // Every blueprint question is worth the same on the DOL, so here too.
  for (const question of REVIEW.questions) assert.equal(Number(question.questionWeight), 1, `${question.questionId} is worth one question`);
});

test('its questions follow the DOL #3 blueprint: two of each readiness standard, one of each supporting standard', () => {
  const BLUEPRINT = { 'A.2A': 2, 'A.2C': 2, 'A.3B': 2, 'A.3C': 2, 'A.2B': 1, 'A.4B': 1, 'A.4C': 1, 'A.12A': 1, 'A.12C': 1 };
  const counts = {};
  for (const question of REVIEW.questions) {
    const primary = question.alignments.filter((alignment) => alignment.role === 'primary');
    assert.equal(primary.length, 1, `${question.questionId} has one primary standard`);
    counts[primary[0].code] = (counts[primary[0].code] || 0) + 1;
  }
  assert.deepEqual(counts, BLUEPRINT);
});

test('every question is an interactive tool the server can mark — no typed-box items', () => {
  const RICH = new Set(['functionCharacteristics', 'relationshipModel', 'linearTableWorkbench', 'representationBridge', 'openSortBoard', 'dataModelingLab', 'sequenceExplorer']);
  for (const question of REVIEW.questions) {
    assert.ok(RICH.has(question.type), `${question.questionId} is ${question.type}`);
    const support = serverResponseGradingSupport(deliveredQuestionForGrading(question));
    assert.equal(support.supported, true, `${question.questionId}: ${support.reason}`);
  }
  assert.equal(new Set(REVIEW.questions.map((question) => question.type)).size, 7, 'seven different tools');
  // Process Mode: the board's facts are established by a process, not typed.
  for (const question of REVIEW.questions.filter((candidate) => candidate.type === 'representationBridge')) {
    assert.equal(question.interactionMode, 'process', `${question.questionId} establishes its facts with a process`);
  }
});

test('every question carries three hints and a "Let\'s back up" step with the right choice among two', () => {
  for (const question of REVIEW.questions) {
    assert.equal(question.hints.length, 3, `${question.questionId} hints`);
    const step = backUpStepFor(question);
    assert.ok(backUpStepWritten(step), `${question.questionId} has a back-up step (${step.source})`);
    assert.equal(step.options.length, 2, question.questionId);
    assert.ok(step.options.includes(step.correct), question.questionId);
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

test('a sort\'s worked solution explains every card in the group the key puts it in, naming cards as the board does', () => {
  for (const id of ['dol3-review-q10', 'dol3-review-q12']) {
    const question = item(id);
    const review = buildClosedQuestionReview({ question, isToolQuestion: true });
    const labelOf = Object.fromEntries(question.items.map((card) => [card.id, card.label]));
    const [scheme] = question.validSchemes;
    const [answerLine] = review.tool.items;
    for (const group of scheme.groups) {
      const cards = group.itemIds.map((cardId) => labelOf[cardId]).sort();
      // The step that explains the group names exactly its cards.
      const step = review.authored.reasoning.find((line) => line.startsWith(`${group.label}:`));
      assert.ok(step, `${id}: a step explains the ${group.label} group`);
      assert.deepEqual(step.match(/Card [A-Z]/g).sort(), cards, `${id}: ${group.label}`);
      // The answer lists them by the names on the board, not by their ids.
      const listed = answerLine.value.split(' · ').find((entry) => entry.startsWith(`${group.label}:`));
      assert.ok(listed, `${id}: the answer names the ${group.label} group`);
      assert.deepEqual(listed.slice(group.label.length + 1).split(',').map((name) => name.trim()).sort(), cards, `${id}: ${group.label}`);
    }
  }
});

/* ------------------------------------------------------------- A.2A ×2 -- */

test('A.2A (graph): the domain and range are read from the segment\'s closed ends, as inequalities', () => {
  const question = item('dol3-review-q01');
  // The segment the student sees: y = −10x + 80 from x = 0 to x = 6, both ends closed.
  const raw = RAW.sections[0].questions[0].function;
  assert.deepEqual([raw.m, raw.b, raw.domain.min, raw.domain.max, raw.domain.minClosed, raw.domain.maxClosed], [-10, 80, 0, 6, true, true]);
  const f = (x) => raw.m * x + raw.b;
  const [low, high] = [Math.min(f(0), f(6)), Math.max(f(0), f(6))];
  const grade = (responses) => gradeComposedWorkflowWork(question, { responses });
  const key = { domain: '0 <= x <= 6', range: `${low} <= y <= ${high}` };
  assert.equal(grade(key).isCorrect, true, failing(grade(key)));
  assert.equal(grade({ domain: '0 ≤ x ≤ 6', range: '20 ≤ y ≤ 80' }).isCorrect, true, 'the ≤ symbol');
  assert.equal(grade({ ...key, domain: '0 < x <= 6' }).isCorrect, false, 'a closed end written open');
  assert.equal(grade({ ...key, range: '0 <= y <= 80' }).isCorrect, false, 'the range does not start at zero');
  // The axes say what they measure.
  assert.ok(question.graph.xAxisLabel && question.graph.yAxisLabel);
});

test('A.2A (discrete): $30 at $6 a bucket allows 0–5 whole buckets, and the model is built and graded stage by stage', () => {
  const question = item('dol3-review-q02');
  const [price, budget] = [...question.prompt.matchAll(/\$(\d+)/g)].map(([, value]) => Number(value));
  assert.deepEqual([price, budget], [6, 30]);
  const most = Math.floor(budget / price);
  const domain = Array.from({ length: most + 1 }, (_, n) => n);
  const rule = (x) => price * x;
  const { composed } = resolveComposedWorkflow(question);
  const responses = {
    quantities: { independent: 'buckets', dependent: 'cost' },
    equation: `f(x)=${price}x`,
    continuity: 'discrete',
    domainDiscrete: `{${domain.join(', ')}}`,
    rangeDiscrete: `{${domain.map(rule).join(', ')}}`,
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
  assert.equal(grade({ domainDiscrete: `{0, 1, 2, ..., ${most}}` }).isCorrect, true, 'the ellipsis form');
  assert.equal(grade({ equation: `y=${price}x` }).isCorrect, true, 'y = 6x is the same rule');
  for (const [what, overrides] of [
    ['no bucket at all is a choice the group has', { domainDiscrete: `{${domain.slice(1).join(', ')}}` }],
    ['the range is missing the $0 of buying none', { rangeDiscrete: `{${domain.slice(1).map(rule).join(', ')}}` }],
    ['continuous', { continuity: 'continuous' }],
    ['the roles swapped', { quantities: { independent: 'cost', dependent: 'buckets' } }],
    ['the price is not the input', { quantities: { independent: 'price', dependent: 'cost' } }],
    ['adding the price', { equation: `f(x)=x+${price}` }],
  ]) assert.equal(grade(overrides).isCorrect, false, what);
});

/* ------------------------------------------------------------- A.2C ×2 -- */

test('A.2C (table): three recorded intervals prove the constant rate, and m, b and the equation come from the rows', () => {
  const question = item('dol3-review-q03');
  const rows = question.rows.map(({ x, y }) => [x, y]);
  const line = lineThrough(rows[0], rows[rows.length - 1]);
  rows.forEach((row) => assert.ok(onLine(line, row), `(${row}) is on the line`));
  assert.ok(rows.slice(1).some(([x], index) => x - rows[index][0] !== 1), 'the x-values do not step by 1');
  const intervals = [[0, 1], [1, 2], [2, 3]].map(([i, j]) => ({ i, j, dx: String(rows[j][0] - rows[i][0]), dy: String(rows[j][1] - rows[i][1]), rate: line.m.toFraction() }));
  const work = { intervals, classification: 'linear', m: line.m.toFraction(), b: line.b.toFraction(), equation: `y = ${line.m.toFraction()}x ${line.b.s < 0 ? '-' : '+'} ${line.b.abs().toFraction()}`, repairRowIndex: null, repairedValue: '' };
  const grade = (overrides = {}) => gradeToolWork({ toolId: 'linearTableWorkbench', question, work: { ...work, ...overrides } });
  assert.equal(grade().isCorrect, true, failing(grade()));
  assert.equal(grade({ m: '1.5', equation: 'y = 1.5x - 1' }).isCorrect, true, 'the decimal slope');
  assert.equal(grade({ intervals: intervals.map((entry) => ({ ...entry, rate: entry.dy })) }).isCorrect, false, 'Δy alone is not the rate when Δx ≠ 1');
  assert.equal(grade({ b: '2', equation: 'y = 3/2x + 2' }).isCorrect, false, 'the wrong intercept');
  assert.equal(grade({ intervals: intervals.slice(0, 2) }).isCorrect, false, 'two intervals are not the three asked for');
});

test('A.2C (verbal): the rideshare situation\'s fee and per-mile charge become y = mx + b and its graph', () => {
  const question = item('dol3-review-q04');
  const [fee, perMile] = [...question.source.prompt.matchAll(/\$(\d+)/g)].map(([, value]) => Number(value));
  assert.match(question.source.prompt, /\$\d+ pickup fee plus \$\d+ for each mile/);
  const line = { m: frac(perMile), b: frac(fee) };
  const context = {
    contextIndependent: 'length of the ride (miles)',
    contextDependent: 'total cost of the ride (dollars)',
    contextSlopeMeaning: `The total cost goes up $${perMile} for each mile of the ride.`,
    contextYInterceptMeaning: `The rider pays $${fee} before the car drives any miles.`,
  };
  const work = { slopeInterceptEquation: `y = ${perMile}x + ${fee}`, graph2Points: [[0, fee], [1, fee + perMile]], ...context, processLog: keyProcessLog(question) };
  const grade = (overrides = {}) => gradeToolWork({ toolId: 'representationBridge', question, work: { ...work, ...overrides } });
  assert.equal(grade().isCorrect, true, failing(grade()));
  assert.deepEqual(resolveRequiredCards(question).sort(), ['graphSlopeIntercept', 'slope', 'slopeIntercept', 'yIntercept'].sort());
  assert.equal(grade({ slopeInterceptEquation: `y = ${fee}x + ${perMile}` }).isCorrect, false, 'the fee and the rate traded places');
  assert.equal(grade({ graph2Points: [[0, fee], [1, fee + perMile + 1]] }).isCorrect, false, 'a graph that misses the line');
  assert.ok(onLine(line, [2, 7]), 'a 2-mile ride costs $7');
  // Every meaning has exactly one right choice.
  const FIELDS = { independentQuantity: 'contextIndependent', dependentQuantity: 'contextDependent', slopeMeaning: 'contextSlopeMeaning', yInterceptMeaning: 'contextYInterceptMeaning' };
  for (const [name, field] of Object.entries(FIELDS)) {
    for (const choice of question.context[name].choices) {
      assert.equal(grade({ [field]: choice }).isCorrect, choice === context[field], `${field}: "${choice}"`);
    }
  }
});

/* ------------------------------------------------------------- A.3B ×2 -- */

test('A.3B (table, kayak rental): every pair of rows gives $12 an hour, and the table names its quantities', () => {
  const question = item('dol3-review-q05');
  const rows = question.rows.map(({ x, y }) => [x, y]);
  const line = lineThrough(rows[0], rows[1]);
  rows.forEach((row) => assert.ok(onLine(line, row), `(${row}) is on the line`));
  assert.equal(line.m.valueOf(), 12);
  assert.equal(question.xAxisLabel, 'Rental time (hours)');
  assert.equal(question.yAxisLabel, 'Total cost (dollars)');
  const intervals = [[0, 1], [1, 2], [2, 3]].map(([i, j]) => ({ i, j, dx: String(rows[j][0] - rows[i][0]), dy: String(rows[j][1] - rows[i][1]), rate: '12' }));
  const work = { intervals, classification: 'linear', m: '', b: '', equation: '', repairRowIndex: null, repairedValue: '' };
  const grade = (overrides = {}) => gradeToolWork({ toolId: 'linearTableWorkbench', question, work: { ...work, ...overrides } });
  assert.equal(grade().isCorrect, true, failing(grade()));
  assert.equal(grade({ classification: 'nonlinear' }).isCorrect, false, 'the rate is constant');
  assert.equal(grade({ intervals: intervals.map((entry) => ({ ...entry, rate: '1/12' })) }).isCorrect, false, 'hours per dollar is the rate upside down');
});

test('A.3B (graph, walking home): rise over run gives −3 miles an hour, and its meaning is the one choice graded right', () => {
  const question = item('dol3-review-q06');
  const points = question.source.points.map(({ x, y }) => [x, y]);
  const line = lineThrough(points[0], points[1]);
  points.forEach((point) => assert.ok(onLine(line, point), `(${point}) is on the line`));
  assert.deepEqual([line.m.valueOf(), line.b.valueOf()], [-3, 9]);
  assert.match(question.xAxisLabel, /hours/);
  assert.match(question.yAxisLabel, /miles/);
  const context = {
    contextSlopeMeaning: 'Jordan gets 3 miles closer to home each hour.',
    contextYInterceptMeaning: 'Jordan starts 9 miles from home.',
  };
  const work = { slopeInterceptEquation: 'y = -3x + 9', ...context, processLog: keyProcessLog(question) };
  const grade = (overrides = {}) => gradeToolWork({ toolId: 'representationBridge', question, work: { ...work, ...overrides } });
  assert.equal(grade().isCorrect, true, failing(grade()));
  // The slope is reached by a process on the graph, not typed.
  assert.ok(work.processLog.entries.some((entry) => ['riseRun', 'twoPointFormula'].includes(entry.strategy) && entry.target === 'slope'), JSON.stringify(work.processLog.entries));
  assert.equal(grade({ slopeInterceptEquation: 'y = 3x + 9' }).isCorrect, false, 'distance going up');
  for (const [name, field] of [['slopeMeaning', 'contextSlopeMeaning'], ['yInterceptMeaning', 'contextYInterceptMeaning']]) {
    for (const choice of question.context[name].choices) {
      assert.equal(grade({ [field]: choice }).isCorrect, choice === context[field], `${field}: "${choice}"`);
    }
  }
});

/* ------------------------------------------------------------- A.3C ×2 -- */

test('A.3C (standard form): 3x − 4y = 24 meets the axes at (8, 0) and (0, −6), and is graphed from them', () => {
  const question = item('dol3-review-q07');
  assert.equal(question.source.equation, '3x-4y=24');
  const [A, B, C] = [3, -4, 24];
  const xIntercept = [C / A, 0];
  const yIntercept = [0, C / B];
  assert.deepEqual([xIntercept, yIntercept], [[8, 0], [0, -6]]);
  const line = lineThrough(xIntercept, yIntercept);
  assert.equal(line.m.toFraction(), '3/4');
  const work = { graph1Points: [xIntercept, yIntercept], processLog: keyProcessLog(question) };
  const grade = (overrides = {}) => gradeToolWork({ toolId: 'representationBridge', question, work: { ...work, ...overrides } });
  assert.equal(grade().isCorrect, true, failing(grade()));
  assert.equal(grade({ graph1Points: [[-8, 0], [0, 6]] }).isCorrect, false, 'both intercepts with the wrong sign');
  assert.equal(grade({ graph1Points: [[6, 0], [0, -8]] }).isCorrect, false, 'the intercepts traded places');
  const { xMin, xMax, yMin, yMax } = question.graphBounds;
  [xIntercept, yIntercept].forEach(([x, y]) => assert.ok(x >= xMin && x <= xMax && y >= yMin && y <= yMax, `(${x}, ${y}) is on the grid`));
});

test('A.3C (draining tank): the zero is when the tank is empty, and each intercept is located and then written', () => {
  const question = item('dol3-review-q08');
  const raw = RAW.sections[0].questions[7].function;
  const empty = -raw.b / raw.m;
  assert.equal(empty, 12);
  const grade = (responses) => gradeComposedWorkflowWork(question, { responses });
  const key = {
    xInterceptExists: 'Yes',
    xIntercept: `(${empty}, 0)`,
    xInterceptValue: `(${empty}, 0)`,
    zeros: `{${empty}}`,
    yInterceptExists: 'Yes',
    yIntercept: `(0, ${raw.b})`,
    yInterceptValue: `(0, ${raw.b})`,
  };
  assert.equal(grade(key).isCorrect, true, failing(grade(key)));
  assert.equal(grade({ ...key, xInterceptValue: `(0, ${empty})` }).isCorrect, false, 'the coordinates swapped');
  assert.equal(grade({ ...key, zeros: `{${raw.b}}` }).isCorrect, false, 'the starting amount is not a zero');
  assert.equal(grade({ ...key, xInterceptExists: 'No' }).isCorrect, false, 'the graph does meet the x-axis');
});

/* --------------------------------------------------------------- A.2B -- */

test('A.2B (two points): the slope formula, then point-slope, slope-intercept and standard form of one line', () => {
  const question = item('dol3-review-q09');
  const [p1, p2] = question.source.points.map(({ x, y }) => [x, y]);
  assert.ok(question.prompt.includes('(−2, 7)') && question.prompt.includes('(4, −2)'));
  const line = lineThrough(p1, p2);
  assert.equal(line.m.toFraction(), '-3/2');
  assert.equal(line.b.valueOf(), 4);
  // 3x + 2y = 8 is y = −(3/2)x + 4 cleared of fractions.
  [p1, p2].forEach(([x, y]) => assert.equal(3 * x + 2 * y, 8));
  const work = {
    pointSlopeEquation: 'y - 7 = -3/2(x + 2)',
    slopeInterceptEquation: 'y = -3/2x + 4',
    standardFormEquation: '3x + 2y = 8',
    processLog: keyProcessLog(question),
  };
  const grade = (overrides = {}) => gradeToolWork({ toolId: 'representationBridge', question, work: { ...work, ...overrides } });
  assert.equal(grade().isCorrect, true, failing(grade()));
  assert.equal(grade({ pointSlopeEquation: 'y + 2 = -3/2(x - 4)' }).isCorrect, true, 'point-slope through the other given point');
  assert.equal(grade({ standardFormEquation: '3x - 2y = 8' }).isCorrect, false, 'a sign slip in standard form');
  assert.equal(grade({ slopeInterceptEquation: 'y = -2/3x + 4' }).isCorrect, false, 'the slope upside down');
});

/* --------------------------------------------------------------- A.4B -- */

// Causation: the first quantity directly makes the second change. Association
// only: the two move together because of a lurking variable.
const CAUSE = {
  gas: 'each gallon adds its price to the cost',
  candle: 'burning is what shortens the candle',
  wages: 'each hour worked adds $12 to the pay',
};
const LURKING = {
  icecream: 'hot, sunny weather drives both',
  shoes: 'older students have bigger feet and read better',
  firefighters: 'a bigger fire brings more firefighters and more damage',
};

test('A.4B: the cards sort into causation and association only, and every sort must be named and explained', () => {
  const question = item('dol3-review-q10');
  assert.deepEqual(question.items.map((card) => card.id).sort(), [...Object.keys(CAUSE), ...Object.keys(LURKING)].sort());
  const settings = openSortSettings(question);
  assert.equal(settings.controlled, false, 'the student makes and names the groups');
  assert.equal(settings.requireRationale, true, 'and explains each one');
  assert.deepEqual([settings.minGroups, settings.maxGroups], [2, 2]);
  const groups = [
    { id: 'group-1', name: 'Causation', rationale: 'Changing the first quantity directly changes the second.', itemIds: Object.keys(CAUSE) },
    { id: 'group-2', name: 'Association only', rationale: 'A lurking variable makes both quantities change together.', itemIds: Object.keys(LURKING) },
  ];
  const grade = (sort) => gradeToolWork({ toolId: 'openSortBoard', question, work: { groups: sort } });
  assert.equal(grade(groups).isCorrect, true, failing(grade(groups)));
  assert.equal(grade([...groups].reverse()).isCorrect, true, 'the groups in either order');
  for (const card of [...Object.keys(CAUSE), ...Object.keys(LURKING)]) {
    const moved = groups.map((group) => ({ ...group, itemIds: group.itemIds.includes(card) ? group.itemIds.filter((id) => id !== card) : [...group.itemIds, card] }));
    assert.equal(grade(moved).isCorrect, false, `${card} in the wrong group`);
  }
  assert.equal(grade(groups.map((group) => ({ ...group, rationale: '' }))).isCorrect, false, 'an unexplained sort');
});

/* --------------------------------------------------------------- A.4C -- */

test('A.4C: the line is estimated by hand, then fitted by linear regression in the lab, and predicts the 3.5-hour score', () => {
  const question = item('dol3-review-q11');
  assert.equal(question.mode, 'lineFit', 'an estimate with the steppers, then regression technology');
  assert.ok(question.studentActions.includes('fitDataModel'), 'the lab offers its "Run linear regression" button');
  const points = question.points.map(({ x, y }) => [x, y]);
  const n = points.length;
  const meanX = points.reduce((sum, [x]) => sum + x, 0) / n;
  const meanY = points.reduce((sum, [, y]) => sum + y, 0) / n;
  const sxy = points.reduce((sum, [x, y]) => sum + (x - meanX) * (y - meanY), 0);
  const sxx = points.reduce((sum, [x]) => sum + (x - meanX) ** 2, 0);
  const m = sxy / sxx;
  const b = meanY - m * meanX;
  const prediction = Math.round(m * question.predictionX + b);
  assert.equal(question.predictionX, 3.5);
  assert.equal(prediction, 76);
  assert.equal(question.xAxisLabel, 'Hours studied');
  assert.equal(question.yAxisLabel, 'Quiz score (points)');
  const round3 = (value) => Math.round(value * 1000) / 1000;
  const work = { m: round3(m), b: round3(b), predictionX: question.predictionX, predictionY: String(prediction), regressionTechnologyRun: true };
  const grade = (overrides = {}) => gradeToolWork({ toolId: 'dataModelingLab', question, work: { ...work, ...overrides } });
  assert.equal(grade().isCorrect, true, failing(grade()));
  assert.equal(grade({ predictionY: String(prediction + 5) }).isCorrect, false, 'a prediction off the line');
  assert.equal(grade({ m: 1, b: 70 }).isCorrect, false, 'a line that does not fit the data');
});

/* -------------------------------------------------------------- A.12A -- */

// Each relation's verdict, worked from what its card shows.
const pairsAreFunction = (xs, ys) => xs.every((x, i) => xs.every((other, j) => other !== x || ys[j] === ys[i]));

test('A.12A: words, tables, graphs and equations sort into functions and not functions by the definition', () => {
  const question = item('dol3-review-q12');
  const byId = Object.fromEntries(question.items.map((card) => [card.id, card]));
  const verdict = {
    birthday: true, // one birthday per student
    month: false, // a month is paired with many students
    tableRepeat: pairsAreFunction(byId.tableRepeat.table.x, byId.tableRepeat.table.y),
    tableConstant: pairsAreFunction(byId.tableConstant.table.x, byId.tableConstant.table.y),
    circle: false, // a vertical line meets a circle twice
    line: byId.line.graphSpec.type === 'linear',
    quadratic: true, // y = x² − 3 gives one y for each x
    vertical: false, // x = 4 pairs one x with every y
  };
  assert.deepEqual([verdict.tableRepeat, verdict.tableConstant], [false, true], 'a repeated input with two outputs; one output for every input');
  assert.match(byId.quadratic.text, /y = x² − 3/);
  assert.match(byId.vertical.text, /x = 4/);
  // Every kind of representation the TEKS names is on the board.
  assert.ok(question.items.some((card) => (card.text || '').startsWith('Words:')) && question.items.some((card) => card.table)
    && question.items.some((card) => card.graphSpec) && question.items.some((card) => (card.text || '').startsWith('Equation:')));
  const ids = (wanted) => Object.keys(verdict).filter((id) => verdict[id] === wanted);
  const groups = [
    { id: 'group-1', name: 'Functions', rationale: 'Every input has exactly one output.', itemIds: ids(true) },
    { id: 'group-2', name: 'Not functions', rationale: 'Some input has two different outputs.', itemIds: ids(false) },
  ];
  const grade = (sort) => gradeToolWork({ toolId: 'openSortBoard', question, work: { groups: sort } });
  assert.equal(grade(groups).isCorrect, true, failing(grade(groups)));
  for (const card of Object.keys(verdict)) {
    const moved = groups.map((group) => ({ ...group, itemIds: group.itemIds.includes(card) ? group.itemIds.filter((id) => id !== card) : [...group.itemIds, card] }));
    assert.equal(grade(moved).isCorrect, false, `${card} in the wrong group`);
  }
});

/* -------------------------------------------------------------- A.12C -- */

test('A.12C: f(1) = −7 and f(n) = f(n − 1) + 4, applied term by term, fill the table and the discrete graph', () => {
  const question = item('dol3-review-q13');
  const match = /f\(1\) = (−?\d+) and f\(n\) = f\(n − 1\) \+ (\d+)/.exec(question.prompt);
  assert.ok(match, 'the recursive rule in function form');
  const [first, step] = [Number(match[1].replace('−', '-')), Number(match[2])];
  assert.deepEqual(question.sequence, { kind: 'arithmetic', first, difference: step });
  assert.doesNotMatch(question.prompt, /arithmetic/i, 'the prompt does not answer the classification');
  const terms = [first];
  while (terms.length < question.displayCount) terms.push(terms[terms.length - 1] + step);
  assert.deepEqual(terms, [-7, -3, 1, 5, 9, 13]);
  const work = { tableValues: terms.map(String), plottedPoints: terms.map((value, index) => [index + 1, value]), kindAnswer: 'arithmetic', changeAnswer: String(step), explicitRule: '', recursiveFirst: '', recursiveRule: '', termAnswer: '' };
  const grade = (overrides = {}) => gradeToolWork({ toolId: 'sequenceExplorer', question, work: { ...work, ...overrides } });
  assert.equal(grade().isCorrect, true, failing(grade()));
  assert.equal(grade({ tableValues: terms.map((value, index) => String(index === 3 ? value + 1 : value)) }).isCorrect, false, 'a slip in one term');
  assert.equal(grade({ plottedPoints: terms.map((value, index) => [index, value]) }).isCorrect, false, 'points plotted at n − 1');
  assert.equal(grade({ kindAnswer: 'geometric' }).isCorrect, false, 'adding is not multiplying');
});
