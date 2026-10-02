/*
 * PROCESS MODE ON THE MULTIPLE REPRESENTATIONS BOARD — THE MATHEMATICS, AS A
 * STUDENT MEETS IT.
 *
 * Every test here drives the functions the board and the server share
 * (functions/shared/toolMath/representationBridge/lmrProcessVerify.mjs, the
 * server grader through gradeToolWork / gradeServerResponse, and the board's
 * own Check logic in src/tools/representationBridge/process/processDraft.js)
 * with the work a student actually produces: what they type, the rows and
 * points they pick, the equations their Step Algebra steps reach. The rendered
 * board is driven in a real browser by tests/browser/lmrProcessMode.mjs.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  appendLmrProcessEntry,
  emptyProcessLog,
  establishedPoints,
  evaluateLmrEntry,
  factDisplay,
  firstProcessFeedback,
  keyProcessEntry,
  keyProcessLog,
  lmrCardAlternatives,
  lmrLaterMethods,
  lmrMethodsFor,
  lmrProcessBinding,
  lmrProcessEnvironment,
  lmrProcessSnapStep,
  lmrRewriteQuestion,
  lmrSubstitutionQuestion,
  materializeProcessBoard,
  processFeedback,
  readExactNumber,
  resolveLmrProcess,
  scoreLinearMultipleRepresentationsProcess,
} from '../../functions/shared/toolMath/representationBridge/lmrProcessVerify.mjs';
import {
  isProcessModeQuestion,
  lmrRelevantFacts,
  resolveInteractionMode,
} from '../../functions/shared/toolMath/representationBridge/lmrProcessModel.mjs';
import {
  scoreLinearMultipleRepresentations,
  validateSlopeInterceptEntry,
  deriveLinearMultipleRepresentations,
} from '../../functions/shared/toolMath/representationBridge/linearMultipleRepresentationsMath.mjs';
import { gradeServerResponse, gradeToolWork } from '../../functions/shared/serverGrading/serverResponseGrading.mjs';
import { estimateQuestionValue } from '../../functions/shared/questionValue.mjs';
import { validateToolQuestion } from '../../src/tools/toolSchemas.js';
import {
  EVIDENCE_KEYS,
  PROCESS_DRAFT_LIMITS,
  decideProcessCheck,
  fieldStatusFrom,
  processEntryFor,
  readProcessDraft,
  selectedOption,
  withWork,
} from '../../src/tools/representationBridge/process/processDraft.js';
import { correctLinearBoardResponse } from '../platform/helpers/linearMultipleRepresentationsResponses.mjs';

/* ------------------------------------------------------------------ helpers */

const board = (source, extra = {}) => ({
  type: 'representationBridge',
  mode: 'linearMultipleRepresentations',
  interactionMode: 'process',
  source,
  feedbackTiming: 'guided',
  ...extra,
});
const worksheetOf = (question) => {
  const { interactionMode: _mode, ...rest } = question;
  return rest;
};

/** Mark one piece of work the way resolution does. */
const mark = (question, strategy, from, ev, { target = null, facts = {} } = {}) => evaluateLmrEntry(
  { id: 't', strategy, from, ...(target ? { target } : {}), at: 1, tries: 1, ev },
  { facts },
  lmrProcessEnvironment(question),
);
const codesOf = (evaluated) => [...new Set([
  ...Object.values(evaluated.fields || {}).map((field) => field?.code).filter(Boolean),
  ...(evaluated.problems || []),
])];
const claimOf = (evaluated, fact) => evaluated.claims.find((claim) => claim.fact === fact) || null;

/** A process log built the way the board builds it: one Check at a time. */
const logOf = (question, entries) => entries.reduce((log, entry, index) => appendLmrProcessEntry(
  question,
  log,
  { id: `e${index + 1}`, at: index + 1, tries: 1, ...entry },
  resolveLmrProcess(question, { processLog: log }),
), emptyProcessLog(lmrProcessBinding(question)));
const resolve = (question, log) => resolveLmrProcess(question, { processLog: log });
const valueText = (record) => (record ? `${record.value.n}/${record.value.d}` : null);

const STANDARD = board({ kind: 'standardForm', equation: '2x - 4y = 12' });
const POINT_SLOPE = board({ kind: 'pointSlope', equation: 'y - 2 = -1(x - 3)' });
const TWO_POINTS = board({ kind: 'twoPoints', points: [[-2, -5], [4, -2]] });
const TABLE = board({ kind: 'table', rows: [{ x: 1, y: -1 }, { x: 2, y: 1 }, { x: 3, y: 3 }, { x: 4, y: 5 }] });
const GRAPH = board({ kind: 'graph', points: [[0, 1], [3, -1]] });
const SCENARIO = board({ kind: 'scenario', prompt: 'A tank holds 24 liters and drains 3 liters every minute until it is empty.', m: -3, b: 24 }, {
  requiredCards: ['slope', 'yIntercept', 'xIntercept', 'slopeIntercept', 'standardForm', 'graphSlopeIntercept'],
});

/* ------------------------------------------------------- the two modes */

test('1. Worksheet Mode is unchanged: same work, same grade, same response shape — and a process log there means nothing', () => {
  for (const question of [STANDARD, TABLE, SCENARIO]) {
    const worksheet = worksheetOf(question);
    assert.equal(isProcessModeQuestion(worksheet), false);
    assert.equal(resolveInteractionMode(worksheet), 'worksheet', 'no interactionMode is Worksheet Mode');
    assert.equal(resolveInteractionMode({ ...worksheet, interactionMode: 'worksheet' }), 'worksheet');
    const work = correctLinearBoardResponse(worksheet);
    assert.equal('processLog' in work, false);
    const graded = gradeToolWork({ toolId: 'representationBridge', question: worksheet, work });
    assert.equal(graded.isCorrect, true);
    assert.equal('detail' in graded, false, 'a Worksheet grade carries no process detail');
    // The Worksheet scorer is the one it always was.
    assert.deepEqual(scoreLinearMultipleRepresentations(worksheet, work).parts, Object.fromEntries(graded.parts.map((part) => [part.id, part.isCorrect])));
    // A process log sent with Worksheet work is ignored: same parts, same score.
    const withLog = gradeToolWork({ toolId: 'representationBridge', question: worksheet, work: { ...work, processLog: keyProcessLog(question) } });
    assert.deepEqual(withLog.parts.map((part) => [part.id, part.isCorrect]), graded.parts.map((part) => [part.id, part.isCorrect]));
    assert.equal(withLog.score, graded.score);
  }
});

test('2. Process Mode locks the key facts: typed into a box they are worth nothing, and the cards they would open hold nothing', () => {
  const typed = correctLinearBoardResponse(worksheetOf(STANDARD));
  const scored = scoreLinearMultipleRepresentationsProcess(STANDARD, typed);
  for (const fact of ['slope', 'xIntercept', 'yIntercept']) {
    assert.equal(scored.parts[fact], false, `${fact} was typed, not established`);
    assert.equal(scored.evidence[fact].established, false);
  }
  // Every card that needs facts the student has not established is locked —
  // the correct equations, table and graphs typed into them are not read.
  assert.deepEqual(scored.locked.sort(), ['graphIntercepts', 'graphPointSlope', 'graphSlopeIntercept', 'pointSlope', 'slopeIntercept', 'table'].sort());
  for (const cardId of scored.locked) assert.equal(scored.board[{ slopeIntercept: 'slopeInterceptEquation', pointSlope: 'pointSlopeEquation', table: 'tableRows', graphIntercepts: 'graph1Points', graphSlopeIntercept: 'graph2Points', graphPointSlope: 'graph3Points' }[cardId]].length, 0);
  assert.equal(scored.score, 0);
  // The same board with its process: every part, full marks.
  const earned = scoreLinearMultipleRepresentationsProcess(STANDARD, { ...typed, processLog: keyProcessLog(STANDARD) });
  assert.equal(earned.isCorrect, true);
  assert.equal(earned.score, 1);
  assert.deepEqual(earned.locked, []);
});

/* ------------------------------------------------ recognition is the process */

test('3. y = 2x: the slope is 2 and b is 0 — read, not computed; "2x" is not a slope; "m = 2" is accepted', () => {
  const question = board({ kind: 'slopeIntercept', equation: 'y = 2x' }, { requiredCards: ['slope', 'yIntercept', 'pointSlope', 'graphSlopeIntercept'] });
  const right = mark(question, 'readSlopeIntercept', 'given', { m: '2', b: '0' });
  assert.equal(claimOf(right, 'slope').correct, true);
  assert.equal(claimOf(right, 'yIntercept').correct, true);
  assert.equal(claimOf(mark(question, 'readSlopeIntercept', 'given', { m: 'm = 2' }), 'slope').correct, true);
  for (const typedSlope of ['2x', 'x', '2\\cdot x']) {
    const wrong = mark(question, 'readSlopeIntercept', 'given', { m: typedSlope });
    assert.equal(claimOf(wrong, 'slope'), null, `"${typedSlope}" is not a number`);
    assert.deepEqual(codesOf(wrong), ['slope-has-x'], typedSlope);
  }
  assert.match(processFeedback('slope-has-x'), /coefficient of x/);
  // No answer is offered to choose from: the work is what the student types.
  assert.deepEqual(EVIDENCE_KEYS.readSlopeIntercept, ['m', 'b']);
});

test('4. y = −x + 4 → m = −1, b = 4, and each classic misreading is named for what it is', () => {
  const question = board({ kind: 'slopeIntercept', equation: 'y = -x + 4' });
  const read = (ev) => mark(question, 'readSlopeIntercept', 'given', ev);
  assert.equal(claimOf(read({ m: '-1' }), 'slope').correct, true);
  assert.equal(claimOf(read({ b: '4' }), 'yIntercept').correct, true);
  assert.equal(claimOf(read({ b: '(0, 4)' }), 'yIntercept').correct, true, 'the intercept as a point is fine too');
  assert.deepEqual(codesOf(read({ m: '-x' })), ['slope-has-x']);
  assert.deepEqual(codesOf(read({ m: '1' })), ['slope-sign']);
  assert.deepEqual(codesOf(read({ m: '0' })), ['slope-unit'], 'no number in front of x still means a coefficient');
  assert.deepEqual(codesOf(read({ m: '4' })), ['slope-is-intercept']);
  assert.deepEqual(codesOf(read({ b: '-4' })), ['intercept-sign']);
  assert.deepEqual(codesOf(read({ b: '-1' })), ['intercept-is-slope']);
  assert.deepEqual(codesOf(read({ b: '(4, 0)' })), ['intercept-not-on-y-axis']);
});

test('5. y = x − 7 → m = 1, b = −7', () => {
  const question = board({ kind: 'slopeIntercept', equation: 'y = x - 7' });
  const read = mark(question, 'readSlopeIntercept', 'given', { m: '1', b: '-7' });
  assert.deepEqual(read.claims.map((claim) => [claim.fact, claim.correct]), [['slope', true], ['yIntercept', true]]);
  assert.deepEqual(codesOf(mark(question, 'readSlopeIntercept', 'given', { m: '0' })), ['slope-unit']);
  assert.deepEqual(codesOf(mark(question, 'readSlopeIntercept', 'given', { b: '7' })), ['intercept-sign']);
});

test('6. y = 5 → m = 0, b = 5; a horizontal board cannot ask for an x-intercept', () => {
  const required = ['slope', 'yIntercept', 'pointSlope', 'standardForm', 'graphSlopeIntercept'];
  const question = board({ kind: 'slopeIntercept', equation: 'y = 5' }, { requiredCards: required });
  const read = mark(question, 'readSlopeIntercept', 'given', { m: '0', b: '5' });
  assert.deepEqual(read.claims.map((claim) => [claim.fact, claim.correct]), [['slope', true], ['yIntercept', true]]);
  assert.deepEqual(codesOf(mark(question, 'readSlopeIntercept', 'given', { m: '5' })), ['slope-horizontal']);
  assert.deepEqual(validateToolQuestion({ ...question, toolId: 'representationBridge' }).errors, []);
  // And every card it asks for can be completed: the board is earnable.
  const complete = scoreLinearMultipleRepresentationsProcess(question, {
    processLog: keyProcessLog(question),
    standardFormEquation: 'y = 5',
    pointSlopeEquation: 'y - 5 = 0(x - 2)',
    graph2Points: [[0, 5], [1, 5]],
  });
  assert.equal(complete.isCorrect, true, JSON.stringify(complete.parts));
  const asksForCrossing = board({ kind: 'slopeIntercept', equation: 'y = 5' });
  assert.ok(validateToolQuestion({ ...asksForCrossing, toolId: 'representationBridge' }).errors.some((error) => /horizontal .* never crosses the x-axis/.test(error)));
});

test('7. y = −(3/4)x → m = −3/4, b = 0, exactly: a terminating decimal IS the fraction, a rounded one is not, and the fact stays a fraction', () => {
  const question = board({ kind: 'slopeIntercept', equation: 'y = -(3/4)x' }, { requiredCards: ['slope', 'yIntercept', 'pointSlope', 'graphSlopeIntercept'] });
  const slopeOf = (m) => mark(question, 'readSlopeIntercept', 'given', { m });
  for (const exact of ['-3/4', '-\\frac{3}{4}', '-0.75', '\\frac{-3}{4}', '-(3/4)']) assert.equal(claimOf(slopeOf(exact), 'slope').correct, true, exact);
  assert.deepEqual(codesOf(slopeOf('-0.749')), ['slope-inexact']);
  assert.deepEqual(codesOf(slopeOf('-0.7')), ['slope-wrong']);
  assert.deepEqual(codesOf(slopeOf('3/4')), ['slope-sign']);
  assert.equal(claimOf(mark(question, 'readSlopeIntercept', 'given', { b: '0' }), 'yIntercept').correct, true);
  assert.deepEqual(readExactNumber('0.333').value, { n: 333, d: 1000 }, '0.333 is not 1/3');
  // Established by the decimal, the fact is still the fraction everywhere it is shown.
  const log = logOf(question, [{ strategy: 'readSlopeIntercept', from: 'given', target: 'slope', ev: { m: '-0.75', b: '0' } }]);
  const state = resolve(question, log);
  assert.equal(factDisplay(state.facts.slope), 'm = -\\frac{3}{4}');
  assert.equal(materializeProcessBoard(question, { processLog: log }, state).board.featureSlope, '-3/4');
});

/* --------------------------------------------------- deriving what is hidden */

test('8. standard form, two pathways: solve for y and read your own equation — or both intercepts by substitution, then the slope formula', () => {
  const env = lmrProcessEnvironment(STANDARD);
  // A: solve for y in Step Algebra, then read m and b from the result.
  const rewrite = lmrRewriteQuestion(env);
  assert.deepEqual([rewrite.leftExpression, rewrite.rightExpression, rewrite.objective.kind], ['2x - 4y', '12', 'slopeIntercept']);
  const steps = [{ left: '-4y', right: '-2x + 12' }, { left: 'y', right: '(1/2)x - 3' }];
  const solved = mark(STANDARD, 'solveForY', 'given', { eq: { left: 'y', right: '(1/2)x - 3' }, steps });
  assert.equal(claimOf(solved, 'siEquation').correct, true);
  assert.deepEqual(codesOf(mark(STANDARD, 'solveForY', 'given', { eq: { left: '-4y', right: '-2x + 12' }, steps: steps.slice(0, 1) })), ['rewrite-unfinished']);
  assert.deepEqual(codesOf(mark(STANDARD, 'solveForY', 'given', { eq: { left: 'y', right: '(1/2)x - 3' }, steps: [] })), ['rewrite-no-steps']);
  const otherLine = mark(STANDARD, 'solveForY', 'given', { eq: { left: 'y', right: '2x - 3' }, steps: [{ left: 'y', right: '2x - 3' }] });
  assert.equal(claimOf(otherLine, 'siEquation').correct, false, 'a different line is not this one, however it was reached');
  const pathA = logOf(STANDARD, [
    { strategy: 'solveForY', from: 'given', target: 'siEquation', ev: { eq: { left: 'y', right: '(1/2)x - 3' }, steps } },
    { strategy: 'readSlopeIntercept', from: 'siEquation', target: 'slope', ev: { m: '1/2', b: '-3' } },
  ]);
  const a = resolve(STANDARD, pathA);
  assert.equal(valueText(a.facts.slope), '1/2');
  assert.equal(a.facts.slope.correct && a.facts.yIntercept.correct, true);
  // B: substitute 0 and solve for each intercept, then the slope formula on them.
  assert.equal(lmrSubstitutionQuestion(env, 'given', 'y').equation, '2x = 12', 'the equation the intercept tool opens');
  const pathB = logOf(STANDARD, [
    { strategy: 'substituteZero', from: 'given', target: 'xIntercept', ev: { zero: 'y', eq: { left: 'x', right: '6' }, steps: [{ left: 'x', right: '6' }], point: '(6, 0)' } },
    { strategy: 'substituteZero', from: 'given', target: 'yIntercept', ev: { zero: 'x', eq: { left: 'y', right: '-3' }, steps: [{ left: 'y', right: '-3' }], point: '(0, -3)' } },
    { strategy: 'twoPointFormula', from: 'points', target: 'slope', ev: { p1: 'yIntercept', p2: 'xIntercept', y2: '0', y1: '-3', x2: '6', x1: '0', m: '1/2' } },
  ]);
  const b = resolve(STANDARD, pathB);
  assert.deepEqual([valueText(b.facts.slope), valueText(b.facts.yIntercept), valueText(b.facts.xIntercept)], ['1/2', '-3/1', '6/1']);
  assert.equal(['slope', 'xIntercept', 'yIntercept'].every((fact) => b.facts[fact].correct), true);
  // Substituting into the wrong variable is named before the arithmetic is.
  assert.deepEqual(codesOf(mark(STANDARD, 'substituteZero', 'given', { zero: 'x', eq: { left: 'y', right: '-3' }, steps: [{ left: 'y', right: '-3' }], point: '(0, -3)' }, { target: 'xIntercept' })), ['zero-wrong-x']);
  // Either pathway completes the board.
  for (const log of [pathA, pathB]) {
    const full = keyProcessLog(STANDARD, { prefer: {} });
    const response = { ...correctLinearBoardResponse(STANDARD), processLog: { ...log, entries: [...log.entries, ...full.entries.filter((entry) => !['slope', 'xIntercept', 'yIntercept', 'siEquation'].includes(entry.target))] } };
    assert.equal(scoreLinearMultipleRepresentationsProcess(STANDARD, response).parts.slope, true);
  }
});

test('9. point-slope form: read m and the point — every sign slip is named — or convert to y = mx + b with Step Algebra', () => {
  const read = (ev) => mark(POINT_SLOPE, 'readPointSlope', 'given', ev);
  const right = read({ m: '-1', point: '(3, 2)' });
  assert.deepEqual(right.claims.map((claim) => [claim.fact, claim.correct]), [['slope', true], ['point', true]]);
  assert.deepEqual(codesOf(read({ point: '(-3, -2)' })), ['point-signs']);
  assert.deepEqual(codesOf(read({ point: '(-3, 2)' })), ['point-sign-one']);
  assert.deepEqual(codesOf(read({ point: '(2, 3)' })), ['point-swapped']);
  assert.deepEqual(codesOf(read({ point: '(4, 1)' })), ['point-not-written'], 'on the line, but not the point the equation shows');
  assert.deepEqual(codesOf(read({ m: '1' })), ['slope-point-slope-sign']);
  assert.deepEqual(codesOf(read({ m: '2' })), ['slope-point-slope']);
  // Conversion: Step Algebra from y − 2 = −1(x − 3) to y = −x + 5.
  const converted = mark(POINT_SLOPE, 'solveForY', 'given', {
    eq: { left: 'y', right: '-x + 5' },
    steps: [{ left: 'y - 2', right: '-x + 3' }, { left: 'y', right: '-x + 3 + 2' }, { left: 'y', right: '-x + 5' }],
  });
  assert.equal(claimOf(converted, 'siEquation').correct, true);
  // The slope-intercept card can use the student's own equation as written.
  const derived = deriveLinearMultipleRepresentations(POINT_SLOPE);
  assert.equal(validateSlopeInterceptEntry(factDisplay({ fact: 'siEquation', value: { left: 'y', right: '-x + 5' } }), derived).isCorrect, true);
});

test('10. a GIVEN graph: find each crossing, rise over run between two picked points, or the slope formula on them', () => {
  const env = lmrProcessEnvironment(GRAPH);
  assert.equal(lmrProcessSnapStep(GRAPH), 0.5, 'the plane\'s grid holds the x-intercept (3/2, 0) exactly');
  const crossing = (pick, target) => mark(GRAPH, 'graphCrossing', 'given', { pick }, { target });
  assert.equal(claimOf(crossing([0, 1], 'yIntercept'), 'yIntercept').correct, true);
  assert.equal(claimOf(crossing([1.5, 0], 'xIntercept'), 'xIntercept').correct, true);
  assert.deepEqual(codesOf(crossing([3, -1], 'yIntercept')), ['pick-on-line-off-y-axis']);
  assert.deepEqual(codesOf(crossing([0, 2], 'yIntercept')), ['pick-on-axis-off-line']);
  assert.deepEqual(codesOf(crossing([2, 2], 'yIntercept')), ['pick-off-both']);
  assert.deepEqual(codesOf(crossing([40, 0], 'xIntercept')), ['pick-outside']);
  const riseRun = (ev) => mark(GRAPH, 'riseRun', 'given', { p1: [0, 1], p2: [3, -1], run: '3', rise: '-2', m: '-2/3', ...ev });
  assert.equal(claimOf(riseRun({}), 'slope').correct, true);
  assert.deepEqual(codesOf(riseRun({ rise: '2', m: '2/3' })), ['rise-sign']);
  assert.deepEqual(codesOf(riseRun({ run: '-3', m: '2/3' })), ['run-sign']);
  assert.deepEqual(codesOf(riseRun({ m: '-3/2' })), ['slope-run-over-rise']);
  assert.deepEqual(codesOf(riseRun({ p1: [0, 2] })), ['p1-off-line']);
  const formula = mark(GRAPH, 'twoPointFormula', 'given', { p1: [0, 1], p2: [3, -1], y2: '-1', y1: '1', x2: '3', x1: '0', m: '-2/3' });
  assert.equal(claimOf(formula, 'slope').correct, true);
  assert.deepEqual(codesOf(mark(GRAPH, 'twoPointFormula', 'given', { p1: [0, 1], p2: [3, -1], y2: '-1', y1: '1', x2: '0', x1: '3', m: '2/3' })), ['sub-mixed']);
  // A point read off the graph must be the point picked, and on the line.
  assert.equal(claimOf(mark(GRAPH, 'graphPoint', 'given', { pick: [3, -1], point: '(3, -1)' }), 'point').correct, true);
  assert.deepEqual(codesOf(mark(GRAPH, 'graphPoint', 'given', { pick: [3, -1], point: '(-1, 3)' })), ['typed-not-pick']);
  assert.equal(env.offered.some((option) => option.strategy === 'graphCrossing'), true);
});

test('11. a GIVEN table: Δy/Δx between two rows, a row already on an axis, or the pattern extended to it', () => {
  const delta = (ev) => mark(TABLE, 'tableDelta', 'given', { r1: 0, r2: 2, dy: '4', dx: '2', m: '2', ...ev });
  assert.equal(claimOf(delta({}), 'slope').correct, true);
  assert.deepEqual(codesOf(delta({ dy: '-4', m: '-2' })), ['dy-sign']);
  assert.deepEqual(codesOf(delta({ dx: '1' })), ['dx-wrong']);
  assert.deepEqual(codesOf(delta({ m: '1/2' })), ['slope-run-over-rise']);
  assert.deepEqual(codesOf(delta({ r2: 0 })), ['same-point']);
  // No row of this table is on an axis: extend the pattern to x = 0 and y = 0.
  assert.equal(claimOf(mark(TABLE, 'extendTable', 'given', { rows: [{ x: '0', y: '-3' }] }, { target: 'yIntercept' }), 'yIntercept').correct, true);
  assert.equal(claimOf(mark(TABLE, 'extendTable', 'given', { rows: [{ x: '1.5', y: '0' }] }, { target: 'xIntercept' }), 'xIntercept').correct, true);
  assert.deepEqual(codesOf(mark(TABLE, 'extendTable', 'given', { rows: [{ x: '0', y: '-2' }] }, { target: 'yIntercept' })), ['extend-off-pattern']);
  assert.deepEqual(codesOf(mark(TABLE, 'extendTable', 'given', { rows: [{ x: '0.5', y: '-2' }] }, { target: 'yIntercept' })), ['extend-not-there-yet-y']);
  assert.deepEqual(codesOf(mark(TABLE, 'tableRead', 'given', { row: 0 }, { target: 'yIntercept' })), ['unknown-strategy'], 'no row to read, so reading one is not offered');
  // A table that already shows x = 0: reading that row IS the process.
  const zeroRow = board({ kind: 'table', rows: [{ x: -1, y: -5 }, { x: 0, y: -3 }, { x: 1, y: -1 }, { x: 2, y: 1 }] });
  assert.equal(claimOf(mark(zeroRow, 'tableRead', 'given', { row: 1 }, { target: 'yIntercept' }), 'yIntercept').correct, true);
  assert.deepEqual(codesOf(mark(zeroRow, 'tableRead', 'given', { row: 2 }, { target: 'yIntercept' })), ['row-not-zero-x']);
  assert.equal(claimOf(mark(TABLE, 'tableRow', 'given', { row: 3 }), 'point').correct, true);
});

test('12. two GIVEN points: the slope formula on them, b from the slope and a point, the x-intercept from the student\'s own facts', () => {
  const base = resolve(TWO_POINTS, emptyProcessLog(lmrProcessBinding(TWO_POINTS)));
  assert.equal(establishedPoints(base).length, 2, 'the GIVEN points are known from the start');
  assert.equal(base.unlocks.graphPointSlope.unlocked, true, 'two points already open Graph 3');
  const formula = mark(TWO_POINTS, 'twoPointFormula', 'given', { p1: 'g0', p2: 'g1', y2: '-2', y1: '-5', x2: '4', x1: '-2', m: '1/2' });
  assert.equal(claimOf(formula, 'slope').correct, true);
  assert.deepEqual(codesOf(mark(TWO_POINTS, 'twoPointFormula', 'given', { p1: 'g0', p2: 'g1', y2: '-2', y1: '-5', x2: '-2', x1: '4', m: '-1/2' })), ['sub-mixed']);
  assert.deepEqual(codesOf(mark(TWO_POINTS, 'twoPointFormula', 'given', { p1: 'g0', p2: 'g1', y2: '-2', y1: '-5', x2: '4', x1: '-2', m: '2' })), ['slope-run-over-rise']);
  const log = logOf(TWO_POINTS, [
    { strategy: 'twoPointFormula', from: 'given', target: 'slope', ev: { p1: 'g0', p2: 'g1', y2: '-2', y1: '-5', x2: '4', x1: '-2', m: '1/2' } },
    { strategy: 'solveForB', from: 'facts', target: 'yIntercept', ev: { pt: 'point:4,-2', y1: '-2', m: '1/2', x1: '4', b: '-4' } },
    { strategy: 'substituteZero', from: 'facts', target: 'xIntercept', ev: { zero: 'y', eq: { left: 'x', right: '8' }, steps: [{ left: '4', right: '(1/2)x' }, { left: 'x', right: '8' }], point: '(8, 0)' } },
  ]);
  const state = resolve(TWO_POINTS, log);
  assert.deepEqual([valueText(state.facts.slope), valueText(state.facts.yIntercept), valueText(state.facts.xIntercept)], ['1/2', '-4/1', '8/1']);
  assert.equal(['slope', 'yIntercept', 'xIntercept'].every((fact) => state.facts[fact].correct), true);
  assert.deepEqual(codesOf(mark(TWO_POINTS, 'solveForB', 'facts', { pt: 'point:4,-2', y1: '-2', m: '1/2', x1: '4', b: '-3' }, { facts: state.facts })), ['b-arithmetic']);
  assert.deepEqual(codesOf(mark(TWO_POINTS, 'solveForB', 'facts', { pt: 'point:4,-2', y1: '-5', m: '1/2', x1: '-2', b: '-4' }, { facts: state.facts })), ['sub-point-mismatch']);
});

test('13. a situation: the rate of change and the initial value are read directly; the x-intercept is worked out from them', () => {
  const read = (ev) => mark(SCENARIO, 'readScenario', 'given', ev);
  assert.deepEqual(read({ rate: '-3', start: '24' }).claims.map((claim) => [claim.fact, claim.correct]), [['slope', true], ['yIntercept', true]]);
  assert.deepEqual(codesOf(read({ rate: '3' })), ['rate-sign']);
  assert.deepEqual(codesOf(read({ rate: '24' })), ['rate-is-start']);
  assert.deepEqual(codesOf(read({ start: '-3' })), ['start-is-rate']);
  // Standard form opens with the slope and a point, so points belong in "What I know" too.
  assert.deepEqual(lmrRelevantFacts(SCENARIO), ['slope', 'yIntercept', 'xIntercept', 'point']);
  const log = logOf(SCENARIO, [
    { strategy: 'readScenario', from: 'given', target: 'slope', ev: { rate: '-3', start: '24' } },
    { strategy: 'substituteZero', from: 'facts', target: 'xIntercept', ev: { zero: 'y', eq: { left: '8', right: 'x' }, steps: [{ left: '-24', right: '-3 x' }, { left: '8', right: 'x' }], point: '(8, 0)' } },
  ]);
  const scored = scoreLinearMultipleRepresentationsProcess(SCENARIO, { ...correctLinearBoardResponse(SCENARIO), processLog: log });
  assert.equal(scored.isCorrect, true, JSON.stringify(scored.parts));
});

/* --------------------------------------------- what opens what, and reuse */

test('14. cards open from mathematics, never from a position in a sequence', () => {
  const unlocked = (log) => Object.entries(resolve(STANDARD, log).unlocks).filter(([, unlock]) => unlock.unlocked).map(([cardId]) => cardId).sort();
  const binding = lmrProcessBinding(STANDARD);
  assert.deepEqual(unlocked(emptyProcessLog(binding)), []);
  const slopeOnly = logOf(STANDARD, [{ strategy: 'twoPointFormula', from: 'points', target: 'slope', ev: {} }]);
  assert.deepEqual(unlocked(slopeOnly), [], 'work that cannot be marked establishes nothing');
  const own = logOf(STANDARD, [{ strategy: 'solveForY', from: 'given', target: 'siEquation', ev: { eq: { left: 'y', right: '(1/2)x - 3' }, steps: [{ left: 'y', right: '(1/2)x - 3' }] } }]);
  assert.deepEqual(unlocked(own), ['slopeIntercept', 'standardForm', 'table'], 'y = mx + b from their own algebra: the equation cards and the table');
  const intercepts = logOf(STANDARD, [
    { strategy: 'substituteZero', from: 'given', target: 'xIntercept', ev: { zero: 'y', eq: { left: 'x', right: '6' }, steps: [{ left: 'x', right: '6' }], point: '(6, 0)' } },
    { strategy: 'substituteZero', from: 'given', target: 'yIntercept', ev: { zero: 'x', eq: { left: 'y', right: '-3' }, steps: [{ left: 'y', right: '-3' }], point: '(0, -3)' } },
  ]);
  assert.deepEqual(unlocked(intercepts), ['graphIntercepts', 'graphPointSlope', 'standardForm', 'table', 'twoPoints', 'xIntercept', 'yIntercept'].sort(), 'two intercepts are two points: Graph 1, Graph 3, the table');
  // A locked card names every way it could open, fewest facts first.
  const state = resolve(STANDARD, emptyProcessLog(binding));
  assert.deepEqual(lmrCardAlternatives(STANDARD, state, 'slopeIntercept'), [['siEquation'], ['slope', 'yIntercept']]);
  assert.deepEqual(lmrCardAlternatives(STANDARD, state, 'graphIntercepts'), [['xIntercept', 'yIntercept']]);
});

test('15. a fact once established is reused: by other methods, and by the cards that open with it', () => {
  // Slope from the table, a row as a point, then b from those two facts.
  const log = logOf(TABLE, [
    { strategy: 'tableDelta', from: 'given', target: 'slope', ev: { r1: 0, r2: 1, dy: '2', dx: '1', m: '2' } },
    { strategy: 'tableRow', from: 'given', target: 'point', ev: { row: 1 } },
  ]);
  const state = resolve(TABLE, log);
  const methods = lmrMethodsFor(TABLE, state, 'yIntercept').map((group) => group.strategy);
  assert.ok(methods.includes('solveForB'), `the slope and a point open "use the slope and a point": ${methods}`);
  const withB = logOf(TABLE, [...log.entries, { strategy: 'solveForB', from: 'facts', target: 'yIntercept', ev: { pt: 'point:2,1', y1: '1', m: '2', x1: '2', b: '-3' } }]);
  const reused = resolve(TABLE, withB);
  assert.equal(reused.facts.yIntercept.correct, true);
  assert.equal(reused.facts.yIntercept.source, 'facts');
  // A student's slope and y-intercept make the equation substitution works from.
  assert.equal(lmrSubstitutionQuestion(lmrProcessEnvironment(TABLE), 'facts', 'y', reused.facts).equation, '0 = 2x - 3');
});

test('16. any order: the same work, entered in a different order, establishes the same facts and the same grade', () => {
  const entries = keyProcessLog(STANDARD, { prefer: { slope: 'twoPointFormula' } }).entries;
  assert.ok(entries.length >= 3);
  const binding = lmrProcessBinding(STANDARD);
  const forward = { v: 1, bind: binding, entries };
  const backward = { v: 1, bind: binding, entries: [...entries].reverse() };
  const facts = (log) => Object.fromEntries(Object.entries(resolve(STANDARD, log).facts).filter(([, record]) => !Array.isArray(record)).map(([fact, record]) => [fact, [valueText(record), record.correct]]));
  assert.deepEqual(facts(backward), facts(forward));
  const work = correctLinearBoardResponse(STANDARD);
  assert.equal(scoreLinearMultipleRepresentationsProcess(STANDARD, { ...work, processLog: backward }).score, 1);
});

test('17. no fixed progression: every fact can be found first, by a method this GIVEN offers', () => {
  const firsts = {
    standardForm: STANDARD,
    pointSlope: POINT_SLOPE,
    twoPoints: TWO_POINTS,
    table: TABLE,
    graph: GRAPH,
    scenario: SCENARIO,
    slopeIntercept: board({ kind: 'slopeIntercept', equation: 'y = -x + 4' }),
  };
  for (const [given, question] of Object.entries(firsts)) {
    const empty = resolve(question, emptyProcessLog(lmrProcessBinding(question)));
    for (const fact of lmrRelevantFacts(question)) {
      const now = lmrMethodsFor(question, empty, fact);
      const later = lmrLaterMethods(question, empty, fact);
      assert.ok(now.length + later.length > 0, `${given}: ${fact} can be found`);
    }
    // The slope can be found first on every GIVEN, and so can the y-intercept —
    // except from two points, where b needs the slope (and the board says so).
    assert.ok(lmrMethodsFor(question, empty, 'slope').length > 0, `${given}: the slope first`);
    if (given !== 'twoPoints') assert.ok(lmrMethodsFor(question, empty, 'yIntercept').length > 0, `${given}: the y-intercept first`);
  }
  const twoPointsEmpty = resolve(TWO_POINTS, emptyProcessLog(lmrProcessBinding(TWO_POINTS)));
  assert.deepEqual(lmrLaterMethods(TWO_POINTS, twoPointsEmpty, 'yIntercept').map((entry) => [entry.strategy, entry.needs]), [['solveForB', ['the slope']]]);
  // Where one method needs a fact the student does not have, the others say so.
  const empty = resolve(STANDARD, emptyProcessLog(lmrProcessBinding(STANDARD)));
  assert.deepEqual(lmrLaterMethods(STANDARD, empty, 'slope'), [{ strategy: 'twoPointFormula', label: 'Slope formula', needs: ['two points on the line'] }]);
});

/* -------------------------------------------------- the server is the authority */

test('18. the server believes no claim the device makes: not a verdict, not a fact, not a method the board never offered', () => {
  const work = correctLinearBoardResponse(STANDARD);
  const honest = gradeToolWork({ toolId: 'representationBridge', question: STANDARD, work });
  assert.equal(honest.isCorrect, true);
  assert.equal(gradeServerResponse({ question: STANDARD, response: honest.toolResponse }).isCorrect, true, 'the same verdict on the server');
  // Verdicts and "facts" written into the work are dropped.
  const forgedLog = {
    v: 1,
    bind: lmrProcessBinding(STANDARD),
    verified: true,
    entries: [{ id: 'f', strategy: 'readSlopeIntercept', from: 'given', target: 'slope', at: 1, tries: 1, isCorrect: true, correct: true, ev: { m: '1/2', b: '-3', isCorrect: true } }],
  };
  const forged = gradeToolWork({ toolId: 'representationBridge', question: STANDARD, work: { ...work, processLog: forgedLog, facts: { slope: '1/2' }, isCorrect: true } });
  const server = gradeServerResponse({ question: STANDARD, response: forged.toolResponse });
  assert.equal(server.isCorrect, false);
  assert.equal(server.parts.find((part) => part.id === 'slope').isCorrect, false, 'reading m from y = mx + b is not offered on a standard-form GIVEN');
  // A method aimed at a fact it cannot establish establishes nothing.
  assert.deepEqual(codesOf(mark(STANDARD, 'substituteZero', 'given', { zero: 'y', eq: { left: 'x', right: '6' }, steps: [{ left: 'x', right: '6' }], point: '(6, 0)' }, { target: 'slope' })), ['unknown-strategy']);
  // Wrong work, however it is labelled, is not credited.
  const wrongLog = logOf(STANDARD, [{ strategy: 'substituteZero', from: 'given', target: 'xIntercept', ev: { zero: 'y', eq: { left: 'x', right: '6' }, steps: [{ left: 'x', right: '6' }], point: '(7, 0)' } }]);
  const wrong = gradeServerResponse({ question: STANDARD, response: gradeToolWork({ toolId: 'representationBridge', question: STANDARD, work: { ...work, processLog: wrongLog } }).toolResponse });
  assert.equal(wrong.parts.find((part) => part.id === 'xIntercept').isCorrect, false);
  assert.equal(wrong.detail.facts.find((fact) => fact.label === 'x-intercept').verified, false);
});

test('19. a process belongs to one line: the fingerprint is the mathematics of the GIVEN, never its wording', () => {
  const reworded = { ...STANDARD, prompt: 'Something else entirely.' };
  assert.equal(lmrProcessBinding(reworded), lmrProcessBinding(STANDARD));
  assert.notEqual(lmrProcessBinding(board({ kind: 'standardForm', equation: '2x - 4y = 16' })), lmrProcessBinding(STANDARD), 'another line');
  assert.notEqual(lmrProcessBinding(board({ kind: 'standardForm', equation: 'x - 2y = 6' })), lmrProcessBinding(STANDARD), 'the same line, written with other coefficients: other work to read');
  assert.notEqual(lmrProcessBinding(board({ kind: 'slopeIntercept', equation: 'y = (1/2)x - 3' })), lmrProcessBinding(STANDARD), 'the same line, another GIVEN');
  assert.match(lmrProcessBinding(STANDARD), /^lmr1-[0-9a-f]{16}$/);
});

test('20/21. refresh restores exactly; another version starts clean', () => {
  const log = keyProcessLog(STANDARD);
  const restored = JSON.parse(JSON.stringify(log));
  assert.deepEqual(resolve(STANDARD, restored).facts, resolve(STANDARD, log).facts, 'a saved log resolves to the same facts');
  // The work in progress, bounded and bound to its version.
  const binding = lmrProcessBinding(STANDARD);
  let draft = readProcessDraft(null, binding);
  draft = withWork({ ...draft, open: 'slope', method: { slope: 'solveForY@given' } }, 'slope|readSlopeIntercept@siEquation', { m: '1/2', b: '' });
  assert.deepEqual(readProcessDraft(JSON.parse(JSON.stringify(draft)), binding), draft);
  // A new version of the slot: the old log establishes nothing, the old draft is empty.
  const other = board({ kind: 'standardForm', equation: '3x + 2y = 6' });
  const stale = resolve(other, log);
  assert.equal(stale.stale, true);
  assert.deepEqual(stale.facts, {});
  assert.equal(Object.values(stale.unlocks).some((unlock) => unlock.unlocked), false);
  assert.deepEqual(readProcessDraft(draft, lmrProcessBinding(other)).work, {});
  // However much is typed, the work in progress stays inside its budget (it is
  // synced inside the board's record), keeping the newest work.
  for (const size of [10, 200, 2000]) {
    const big = readProcessDraft({
      bind: binding,
      open: 'slope',
      method: { slope: 'tableDelta@given' },
      work: Object.fromEntries(Array.from({ length: 20 }, (_, index) => [`slope|m${index}@given`, { m: 'x'.repeat(size), rows: Array.from({ length: 30 }, () => ({ x: '1'.repeat(size), y: '2' })) }])),
      tries: Object.fromEntries(Array.from({ length: 20 }, (_, index) => [`slope|m${index}@given`, index])),
    }, binding);
    assert.ok(JSON.stringify(big).length <= PROCESS_DRAFT_LIMITS.json, `${size}: ${JSON.stringify(big).length}`);
    if (size <= 10) assert.ok(Object.keys(big.work).at(-1) === 'slope|m19@given', 'the newest work is kept');
  }
  const restarted = appendLmrProcessEntry(other, log, keyProcessEntry(other, lmrMethodsFor(other, stale, 'slope')[0].sources[0], null, stale));
  assert.equal(restarted.bind, lmrProcessBinding(other));
  assert.equal(restarted.entries.length, 1, 'the other version\'s work is replaced, not mixed in');
});

/* ------------------------------------------------- legacy boards, and values */

test('23. a legacy board — no interactionMode — is a Worksheet board, validated and valued exactly as before', () => {
  const legacy = worksheetOf(STANDARD);
  assert.deepEqual(validateToolQuestion({ ...legacy, toolId: 'representationBridge' }).errors, []);
  assert.deepEqual(validateToolQuestion({ ...STANDARD, toolId: 'representationBridge' }).errors, []);
  assert.equal(estimateQuestionValue(legacy).value, estimateQuestionValue({ ...legacy, interactionMode: 'worksheet' }).value);
});

test('24. values: a fact the GIVEN shows is read (worth what typing it was); a hidden one is derived work — counted once, never inflated', () => {
  const pairs = [
    ['slope-intercept GIVEN', board({ kind: 'slopeIntercept', equation: 'y = -x + 4' })],
    ['situation', SCENARIO],
    ['standard form', STANDARD],
    ['point-slope', POINT_SLOPE],
    ['table', TABLE],
    ['two points', TWO_POINTS],
  ];
  for (const [label, question] of pairs) {
    const processValue = estimateQuestionValue(question);
    const worksheetValue = estimateQuestionValue(worksheetOf(question));
    const increase = processValue.value - worksheetValue.value;
    assert.ok(increase >= 0 && increase <= 0.5, `${label}: +${increase}`);
    assert.equal(estimateQuestionValue({ ...question, prompt: 'reworded' }).value, processValue.value, `${label}: wording never changes a value`);
  }
  assert.equal(estimateQuestionValue(pairs[0][1]).value, estimateQuestionValue(worksheetOf(pairs[0][1])).value, 'y = mx + b SHOWS m and b');
  assert.ok(estimateQuestionValue(STANDARD).value > estimateQuestionValue(worksheetOf(STANDARD)).value, '2x − 4y = 12 hides them');
  // Every version of a family slot is worth the same: the value reads the GIVEN's kind, not its numbers.
  assert.equal(estimateQuestionValue(board({ kind: 'standardForm', equation: '5x + 3y = 15' })).value, estimateQuestionValue(STANDARD).value);
});

/* ------------------------------------------------ the board's Check, and feedback */

const optionFor = (question, state, target, key) => lmrMethodsFor(question, state, target).flatMap((group) => group.sources).find((option) => option.key === key);

test('25. guided Check records only right work (a right slope is kept beside a wrong b); where outcomes are withheld, Save records the work as written', () => {
  const question = board({ kind: 'slopeIntercept', equation: 'y = -x + 4' });
  const state = resolve(question, emptyProcessLog(lmrProcessBinding(question)));
  const option = optionFor(question, state, 'slope', 'readSlopeIntercept@given');
  const guided = decideProcessCheck({ process: state, option, target: 'slope', ev: { m: '-1', b: '-4' }, reveal: true, tries: 2 });
  assert.deepEqual(guided.record.ev, { m: '-1' }, 'the wrong b is not recorded');
  assert.equal(guided.record.tries, 3, 'every press counts');
  assert.equal(guided.done, true);
  assert.equal(guided.message, processFeedback('intercept-sign'));
  assert.equal(fieldStatusFrom(guided.evaluated, 'm', true), 'correct');
  assert.equal(fieldStatusFrom(guided.evaluated, 'b', true), 'incorrect');
  const allWrong = decideProcessCheck({ process: state, option, target: 'slope', ev: { m: '-x' }, reveal: true });
  assert.equal(allWrong.record, null);
  assert.equal(allWrong.message, processFeedback('slope-has-x'));
  // Outcomes withheld: the student's answer is saved as written, and nothing says whether it is right.
  const saved = decideProcessCheck({ process: state, option, target: 'slope', ev: { m: '1', b: '-4' }, reveal: false });
  assert.deepEqual(saved.record.ev, { m: '1', b: '-4' });
  assert.equal(saved.message, '');
  assert.equal(fieldStatusFrom(saved.evaluated, 'm', false), 'neutral', 'no colour gives the verdict away');
  const unreadable = decideProcessCheck({ process: state, option, target: 'slope', ev: { m: '1/' }, reveal: false });
  assert.equal(unreadable.record, null, 'a half-typed number is not saved by accident');
  assert.equal(unreadable.message, processFeedback('unreadable-number'));
  assert.equal(processFeedback('slope-sign', { reveal: false }), '', 'only the form of work is ever commented on');
  // The evidence recorded is the method's own fields, nothing else.
  const entry = processEntryFor({ option, target: 'slope', ev: { m: '-1', b: '4', isCorrect: true, facts: 'x', note: 'y' } });
  assert.deepEqual(Object.keys(entry.ev).sort(), ['b', 'm']);
  // A board offering one way to find a fact opens on it; more than one, the student chooses.
  assert.equal(selectedOption(question, state, 'slope', null)?.key, 'readSlopeIntercept@given');
  assert.equal(selectedOption(GRAPH, resolve(GRAPH, emptyProcessLog(lmrProcessBinding(GRAPH))), 'slope', null), null);
});

test('26. feedback names the mathematics of a mistake and never its answer', () => {
  const question = board({ kind: 'slopeIntercept', equation: 'y = -(3/4)x + 2' }, { requiredCards: ['slope', 'yIntercept', 'pointSlope', 'graphSlopeIntercept'] });
  const answers = ['3/4', '0.75', '\\frac{3}{4}', '2', '(0, 2)', '8/3'];
  const attempts = [{ m: '-3/4x' }, { m: '3/4' }, { m: '2' }, { m: '-0.74' }, { b: '-2' }, { b: '-3/4' }, { m: '0' }, { m: '7' }, { b: '(2, 0)' }];
  for (const ev of attempts) {
    const message = firstProcessFeedback(mark(question, 'readSlopeIntercept', 'given', ev));
    assert.ok(message, JSON.stringify(ev));
    for (const answer of answers) assert.equal(message.includes(answer), false, `"${message}" gives away ${answer}`);
  }
  // The point-slope reading hint explains the convention with letters, not this board's numbers.
  assert.doesNotMatch(processFeedback('point-signs'), /\d/);
  assert.doesNotMatch(processFeedback('unreadable-number'), /\d/);
  assert.doesNotMatch(processFeedback('unreadable-point'), /\d/);
});
