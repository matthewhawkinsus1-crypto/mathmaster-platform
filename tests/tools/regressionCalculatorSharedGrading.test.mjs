import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import regressionCalculatorGrader, {
  REGRESSION_PROCESS_EVIDENCE_LIMIT,
  buildRegressionCalculatorWork,
} from '../../functions/shared/serverGrading/tools/regressionCalculator.mjs';
import regressionDeclaration, {
  resolveRegressionCalculatorMode,
} from '../../functions/shared/serverGrading/declarations/regressionCalculator.mjs';
import { GRADING_MANIFEST } from '../../functions/shared/serverGrading/gradingManifest.mjs';
import { GRADING_AUTHORITY } from '../../functions/shared/serverGrading/gradingAuthority.mjs';
import { TOOL_GRADERS } from '../../functions/shared/serverGrading/toolGraders.mjs';
import { resolveToolMode } from '../../functions/shared/serverGrading/toolGraderDefinition.mjs';
import { gradeServerResponse } from '../../functions/shared/serverGrading/serverResponseGrading.mjs';
import {
  TOOL_RESPONSE_LIMITS,
  boundToolWork,
  canonicalToolWorkJson,
} from '../../functions/shared/serverGrading/toolResponseContract.mjs';
import {
  buildRegressionCalculatorPrivateDefinition,
  cleanRegressionPoints,
  gradeRegressionCalculatorResponse,
  regressionCalculatorStats,
} from '../../functions/shared/pathRegressionCalculatorGrading.mjs';
import { gradeToolCheck } from '../../src/tools/shared/sharedToolGrading.js';
import { executableSource, region } from '../platform/helpers/sourceContract.mjs';

/*
 * REGRESSION CALCULATOR: ONE VERDICT, WHEREVER IT IS COMPUTED.
 *
 * The calculator's Submit used to assemble its four-stage verdict inline in
 * the JSX. It now asks the shared grader, and the server runs the same grader
 * over the same bytes. These tests pin three things:
 *
 *   1. the extraction is faithful — the shared grader returns the verdict the
 *      old inline Submit returned, check for check (LEGACY_BROWSER_VERDICT is
 *      that code, verbatim, kept here only as the oracle);
 *   2. the browser path (gradeToolCheck) and the server path
 *      (gradeServerResponse over the JSON the browser sent) agree exactly;
 *   3. the work is student work only, bounded, and tamper-proof.
 */

const COMPONENT_PATH = 'src/tools/regressionCalculator/RegressionCalculator.jsx';
const componentText = readFileSync(new URL(`../../${COMPONENT_PATH}`, import.meta.url), 'utf8');
const CAPTURED = JSON.parse(readFileSync(new URL('../platform/fixtures/capturedToolResponses.json', import.meta.url), 'utf8'));

// ---------------------------------------------------------------------------
// The pre-refactor inline Submit (RegressionCalculator.jsx check()), verbatim
// apart from taking its state as arguments. The oracle the extraction answers to.
// ---------------------------------------------------------------------------
const legacyDescribe = (r) => ({
  direction: Math.abs(r) < 0.1 ? 'none' : r > 0 ? 'positive' : 'negative',
  strength: Math.abs(r) >= 0.8 ? 'strong' : Math.abs(r) >= 0.5 ? 'moderate' : Math.abs(r) >= 0.1 ? 'weak' : 'none',
});
const legacySamePairs = (left, right) => JSON.stringify([...left].sort(([ax, ay], [bx, by]) => ax - bx || ay - by))
  === JSON.stringify([...right].sort(([ax, ay], [bx, by]) => ax - bx || ay - by));
const LEGACY_BROWSER_VERDICT = (questionData, { tablePoints, run, direction, strength }) => {
  const source = cleanRegressionPoints(questionData.sourceData || questionData.points);
  const sourceMode = questionData.sourceMode === 'scatterplot' ? 'scatterplot' : 'data';
  const entered = tablePoints;
  const expected = regressionCalculatorStats(source);
  const interpretation = expected ? legacyDescribe(expected.r) : {};
  const tableCorrect = legacySamePairs(entered, source);
  const parts = {
    [sourceMode === 'scatterplot' ? 'graph-to-table' : 'data-entry']: tableCorrect,
    'linear-regression': tableCorrect && run?.operation === 'linearRegression' && legacySamePairs(run.table, entered),
    'correlation-produced': tableCorrect && Math.abs(Number(run?.r) - Number(expected?.r)) <= 0.0005,
    interpretation: questionData.requireInterpretation === false
      || (direction === interpretation.direction && strength === interpretation.strength),
  };
  const required = questionData.requireInterpretation === false
    ? Object.values(parts).slice(0, 3)
    : Object.values(parts);
  return { isCorrect: required.every(Boolean), score: required.filter(Boolean).length / required.length, parts };
};

// What the calculator's execute() stores when the student runs y₁ ~ mx₁ + b.
const executeRun = (tablePoints) => {
  const stats = regressionCalculatorStats(tablePoints);
  if (!stats) return null;
  return { operation: 'linearRegression', table: tablePoints.map((pair) => [...pair]), ...stats, r2: stats.r ** 2 };
};

// The calculator's state -> the work it submits, through the component's own builder.
const uiWork = ({ tablePoints = [], run = null, direction = '', strength = '', processEvidence = [] } = {}) => ({
  state: { tablePoints, run, direction, strength },
  work: buildRegressionCalculatorWork({ table: tablePoints, regressionRun: run, direction, strength, processEvidence }),
});

const POINTS = [[1, 2], [2, 4], [3, 5], [4, 8]]; // r ≈ 0.981: positive, strong
const dataQuestion = (extra = {}) => ({ type: 'regressionCalculator', sourceData: POINTS, sourceMode: 'data', requireInterpretation: true, ...extra });
const scatterQuestion = (extra = {}) => ({ ...dataQuestion(), sourceMode: 'scatterplot', ...extra });

const fullyCorrect = (table = POINTS) => uiWork({ tablePoints: table, run: executeRun(table), direction: 'positive', strength: 'strong' });

/** Browser path and server path, asserted to agree; returns the browser verdict. */
const gradeBothWays = (question, work, label = 'fixture') => {
  const browser = gradeToolCheck(regressionCalculatorGrader, question, work);
  assert.ok(browser.toolResponse, `${label}: the browser path always builds the response it would send`);
  const server = gradeServerResponse({ question, response: JSON.parse(JSON.stringify(browser.toolResponse)) });
  assert.equal(server.isCorrect, browser.isCorrect, `${label}: isCorrect differs between browser and server`);
  assert.equal(server.isComplete, browser.isComplete, `${label}: isComplete differs between browser and server`);
  assert.equal(server.score, browser.score, `${label}: score differs between browser and server`);
  assert.deepEqual(server.parts, browser.parts, `${label}: parts differ between browser and server`);
  assert.equal(server.graded, browser.graded, `${label}: graded differs between browser and server`);
  return { browser, server };
};

/** The shared verdict equals the old inline verdict, part for part. */
const assertMatchesLegacy = (question, { state, work }, label = 'fixture') => {
  const legacy = LEGACY_BROWSER_VERDICT(question, state);
  const { browser } = gradeBothWays(question, work, label);
  assert.equal(browser.graded, true, `${label}: graded`);
  assert.equal(browser.isCorrect, legacy.isCorrect, `${label}: isCorrect`);
  assert.equal(browser.score, legacy.score, `${label}: score`);
  const required = question.requireInterpretation === false
    ? Object.keys(legacy.parts).slice(0, 3)
    : Object.keys(legacy.parts);
  assert.deepEqual(browser.parts.map((part) => part.id), required, `${label}: the same stages, in the same order`);
  browser.parts.forEach((part) => assert.equal(part.isCorrect, legacy.parts[part.id], `${label}: stage ${part.id}`));
  return browser;
};

const partById = (result, id) => result.parts.find((part) => part.id === id);

// --- declaration ------------------------------------------------------------

test('both calculator views are declared shared-server and the grader binds both', () => {
  assert.equal(GRADING_MANIFEST.regressionCalculator, regressionDeclaration);
  assert.equal(regressionDeclaration.contractVersion, 1);
  assert.equal(regressionDeclaration.defaultMode, 'data');
  assert.deepEqual(Object.keys(regressionDeclaration.modes).sort(), ['data', 'scatterplot']);
  Object.values(regressionDeclaration.modes).forEach((entry) => {
    assert.equal(entry.authority, GRADING_AUTHORITY.SHARED_SERVER);
    assert.equal(entry.blocker, null);
  });
  assert.equal(TOOL_GRADERS.regressionCalculator, regressionCalculatorGrader);
  assert.deepEqual(Object.keys(regressionCalculatorGrader.modeGraders).sort(), ['data', 'scatterplot']);
});

test('the declaration resolves exactly the view the calculator renders', () => {
  // The component's routing before this change, verbatim.
  const componentView = (questionData) => (questionData.sourceMode === 'scatterplot' ? 'scatterplot' : 'data');
  const questions = [
    {},
    { sourceMode: 'data' },
    { sourceMode: 'scatterplot' },
    { sourceMode: 'Scatterplot' },
    { sourceMode: 'graph' },
    { sourceMode: '' },
    { sourceMode: null },
    // The calculator never reads `mode`: an author's mode cannot pick the view.
    { mode: 'scatterplot' },
    { mode: 'data', sourceMode: 'scatterplot' },
    { mode: 'default' },
  ];
  questions.forEach((question) => {
    const view = componentView(question);
    assert.equal(resolveRegressionCalculatorMode(question), view, JSON.stringify(question));
    assert.equal(resolveToolMode(regressionDeclaration, question), view, JSON.stringify(question));
    const result = regressionCalculatorGrader.grade({ ...question, sourceData: POINTS }, fullyCorrect().work);
    assert.equal(result.mode, view, `grading ${JSON.stringify(question)}`);
    assert.equal(result.parts[0].id, view === 'scatterplot' ? 'graph-to-table' : 'data-entry');
  });
});

// --- fully correct ----------------------------------------------------------

test('fully correct work is correct in both views, on both paths', () => {
  [dataQuestion(), scatterQuestion()].forEach((question) => {
    const browser = assertMatchesLegacy(question, fullyCorrect(), question.sourceMode);
    assert.equal(browser.isCorrect, true);
    assert.equal(browser.isComplete, true);
    assert.equal(browser.score, 1);
    assert.equal(browser.parts.length, 4);
  });
});

test('the real captured browser response grades correct through the shared grader', () => {
  // Captured from the real React calculator in Chromium (see toolResponseContracts.test.mjs).
  const question = { type: 'regressionCalculator', sourceData: POINTS, sourceMode: 'scatterplot', requireInterpretation: true };
  const { browser } = gradeBothWays(question, CAPTURED.regressionCalculator.rawWork, 'captured');
  assert.equal(browser.isCorrect, true);
  assert.equal(browser.isComplete, true);
  assert.deepEqual(browser.parts.map((part) => part.id), ['graph-to-table', 'linear-regression', 'correlation-produced', 'interpretation']);
  assert.deepEqual(boundToolWork(CAPTURED.regressionCalculator.rawWork).dropped, []);
});

// --- equivalent valid forms -------------------------------------------------

test('row order, Firestore {x, y} source points and the `points` alias are all the same answer', () => {
  const reordered = [POINTS[2], POINTS[0], POINTS[3], POINTS[1]];
  assert.equal(assertMatchesLegacy(dataQuestion(), fullyCorrect(reordered), 'reordered').isCorrect, true);

  const firestoreShaped = dataQuestion({ sourceData: POINTS.map(([x, y]) => ({ x, y })) });
  assert.equal(assertMatchesLegacy(firestoreShaped, fullyCorrect(), '{x,y} source').isCorrect, true);

  const pointsAlias = { type: 'regressionCalculator', points: POINTS };
  assert.equal(assertMatchesLegacy(pointsAlias, fullyCorrect(), 'points alias').isCorrect, true);
});

test('decimal entries the calculator parses to the same number grade the same', () => {
  const source = [[0.5, 1.25], [1.5, 2], [2.5, 3.75], [3.5, 4]];
  const question = dataQuestion({ sourceData: source });
  // The table cells ".5", "0.50" and "5e-1" all reach the work as 0.5.
  const typed = [['.5', '1.250'], ['1.5', '2.0'], ['25e-1', '3.75'], ['3.50', '4']].map((row) => row.map(Number));
  const browser = assertMatchesLegacy(question, fullyCorrect(typed), 'decimal forms');
  assert.equal(browser.isCorrect, true);
  // A numeric string in the work is still the coordinate it spells.
  const asStrings = fullyCorrect(source).work;
  const stringWork = { ...asStrings, table: source.map((pair) => pair.map(String)) };
  assert.equal(gradeBothWays(question, stringWork, 'numeric strings').browser.isCorrect, true);
});

// --- incorrect --------------------------------------------------------------

test('a wrong table fails every stage that depends on it', () => {
  const wrong = [[1, 2], [2, 4], [3, 6], [4, 8]];
  const browser = assertMatchesLegacy(dataQuestion(), fullyCorrect(wrong), 'wrong table');
  assert.equal(browser.isCorrect, false);
  assert.equal(partById(browser, 'data-entry').isCorrect, false);
  assert.equal(partById(browser, 'linear-regression').isCorrect, false);
  assert.equal(partById(browser, 'correlation-produced').isCorrect, false);
  // positive/strong is still the right reading of the SOURCE data.
  assert.equal(partById(browser, 'interpretation').isCorrect, true);
  assert.equal(browser.score, 0.25);
  assert.equal(browser.isComplete, true, 'a finished but wrong workflow is complete');
});

test('a coordinate off by a hair is a different coordinate, exactly as the calculator compared it', () => {
  const nearly = [[1, 2], [2, 4.000000000001], [3, 5], [4, 8]];
  const browser = assertMatchesLegacy(dataQuestion(), fullyCorrect(nearly), 'nearly');
  assert.equal(partById(browser, 'data-entry').isCorrect, false);
});

test('a wrong interpretation costs exactly the interpretation stage', () => {
  [['positive', 'moderate'], ['negative', 'strong'], ['none', 'none']].forEach(([direction, strength]) => {
    const fixture = uiWork({ tablePoints: POINTS, run: executeRun(POINTS), direction, strength });
    const browser = assertMatchesLegacy(dataQuestion(), fixture, `${direction}/${strength}`);
    assert.equal(browser.isCorrect, false);
    assert.equal(browser.score, 0.75);
    assert.equal(partById(browser, 'interpretation').isCorrect, false);
  });
});

test('the strength thresholds are the calculator’s 0.1 / 0.5 / 0.8', () => {
  // Hand-built sources whose r falls in each band.
  const cases = [
    { source: [[1, 1], [2, 3], [3, 2], [4, 4]], direction: 'positive', strength: 'strong' }, // r = 0.8
    { source: [[1, 2], [2, 1], [3, 4], [4, 1], [5, 3]], direction: 'positive', strength: 'weak' },
    { source: [[1, 5], [2, 4], [3, 4], [4, 1], [5, 3]], direction: 'negative', strength: 'moderate' },
    { source: [[1, 1], [2, 3], [3, 1], [4, 3], [5, 1.2]], direction: 'none', strength: 'none' },
  ];
  cases.forEach(({ source, direction, strength }) => {
    const r = regressionCalculatorStats(source).r;
    assert.deepEqual(legacyDescribe(r), { direction, strength }, `fixture r=${r}`);
    const question = dataQuestion({ sourceData: source });
    const right = uiWork({ tablePoints: source, run: executeRun(source), direction, strength });
    assert.equal(assertMatchesLegacy(question, right, `r=${r}`).isCorrect, true);
    const wrongStrength = strength === 'strong' ? 'moderate' : 'strong';
    const wrong = uiWork({ tablePoints: source, run: executeRun(source), direction, strength: wrongStrength });
    assert.equal(assertMatchesLegacy(question, wrong, `r=${r} wrong`).isCorrect, false);
  });
});

// --- partial / incomplete ---------------------------------------------------

test('a fresh calculator is incomplete and earns nothing', () => {
  const browser = assertMatchesLegacy(dataQuestion(), uiWork(), 'fresh');
  assert.equal(browser.isComplete, false);
  assert.equal(browser.isCorrect, false);
  assert.equal(browser.score, 0);
  browser.parts.forEach((part) => assert.equal(part.isComplete, false, part.id));
});

test('each finished stage adds a quarter, and completeness follows the inputs', () => {
  const tableOnly = assertMatchesLegacy(dataQuestion(), uiWork({ tablePoints: POINTS }), 'table only');
  assert.equal(tableOnly.score, 0.25);
  assert.equal(tableOnly.isComplete, false);
  assert.deepEqual(tableOnly.parts.map((part) => part.isComplete), [true, false, false, false]);

  const ran = assertMatchesLegacy(dataQuestion(), uiWork({ tablePoints: POINTS, run: executeRun(POINTS) }), 'ran');
  assert.equal(ran.score, 0.75);
  assert.equal(ran.isComplete, false, 'interpretation is still required');

  const halfInterpreted = assertMatchesLegacy(
    dataQuestion(),
    uiWork({ tablePoints: POINTS, run: executeRun(POINTS), direction: 'positive' }),
    'direction only',
  );
  assert.equal(halfInterpreted.isComplete, false);
  assert.equal(partById(halfInterpreted, 'interpretation').isCorrect, false);
});

test('a short table is incomplete; an extra row is complete but wrong', () => {
  const short = POINTS.slice(0, 3);
  const shortResult = assertMatchesLegacy(dataQuestion(), fullyCorrect(short), 'short');
  assert.equal(shortResult.isComplete, false);
  assert.equal(partById(shortResult, 'data-entry').isComplete, false);
  assert.equal(shortResult.isCorrect, false);

  const extra = [...POINTS, [5, 9]];
  const extraResult = assertMatchesLegacy(dataQuestion(), fullyCorrect(extra), 'extra');
  assert.equal(extraResult.isComplete, true);
  assert.equal(partById(extraResult, 'data-entry').isCorrect, false);
});

test('requireInterpretation: false grades three stages', () => {
  const question = dataQuestion({ requireInterpretation: false });
  const done = assertMatchesLegacy(question, uiWork({ tablePoints: POINTS, run: executeRun(POINTS) }), 'no interpretation');
  assert.equal(done.isCorrect, true);
  assert.equal(done.isComplete, true);
  assert.equal(done.score, 1);
  assert.equal(done.parts.length, 3);

  const tableOnly = assertMatchesLegacy(question, uiWork({ tablePoints: POINTS }), 'no interpretation, table only');
  assert.equal(tableOnly.score, 1 / 3);
  assert.equal(tableOnly.isComplete, false);
});

test('a run left over from a different table does not count as this table’s regression', () => {
  const earlier = [[1, 2], [2, 4], [3, 6], [4, 8]];
  const stale = uiWork({ tablePoints: POINTS, run: executeRun(earlier), direction: 'positive', strength: 'strong' });
  const browser = assertMatchesLegacy(dataQuestion(), stale, 'stale run');
  assert.equal(partById(browser, 'linear-regression').isCorrect, false);
  assert.equal(partById(browser, 'correlation-produced').isCorrect, false, 'that run produced a different r');
  assert.equal(browser.isCorrect, false);
});

// --- unauthored defaults and degenerate data --------------------------------

test('an unauthored question grades with the calculator’s defaults and never throws', () => {
  const bare = { type: 'regressionCalculator' };
  assert.equal(resolveToolMode(regressionDeclaration, bare), 'data');
  // No source: the empty table "matches" it, nothing else can — as before.
  const fresh = assertMatchesLegacy(bare, uiWork(), 'unauthored, fresh');
  assert.equal(fresh.parts.length, 4, 'interpretation is required unless explicitly false');
  assert.equal(fresh.score, 0.25);
  assert.equal(fresh.isCorrect, false);
  assert.equal(fresh.isComplete, false);
  const tried = assertMatchesLegacy(bare, fullyCorrect(), 'unauthored, attempted');
  assert.equal(tried.isCorrect, false);
});

test('degenerate source data (no regression exists) grades without throwing', () => {
  const vertical = dataQuestion({ sourceData: [[2, 1], [2, 3], [2, 5]] });
  assert.equal(regressionCalculatorStats(vertical.sourceData), null);
  const browser = assertMatchesLegacy(vertical, uiWork({ tablePoints: vertical.sourceData, direction: 'none', strength: 'none' }), 'vertical');
  assert.equal(browser.graded, true);
  assert.equal(partById(browser, 'data-entry').isCorrect, true);
  assert.equal(partById(browser, 'correlation-produced').isCorrect, false);
  assert.equal(partById(browser, 'interpretation').isCorrect, false);
});

// --- the old inline verdict, over many calculator states --------------------

const mulberry32 = (seed) => () => {
  let t = (seed += 0x6d2b79f5);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

test('the shared grader reproduces the old inline Submit across 600 calculator states', () => {
  const random = mulberry32(20261001);
  const int = (min, max) => min + Math.floor(random() * (max - min + 1));
  const pick = (list) => list[Math.floor(random() * list.length)];
  const shuffle = (list) => list.map((value) => [random(), value]).sort(([a], [b]) => a - b).map(([, value]) => value);
  let correct = 0;
  let partial = 0;
  for (let index = 0; index < 600; index += 1) {
    const count = int(2, 7);
    const source = Array.from({ length: count }, () => [int(-5, 10), int(-5, 10)]);
    const question = {
      type: 'regressionCalculator',
      sourceData: random() < 0.5 ? source : source.map(([x, y]) => ({ x, y })),
      ...(random() < 0.8 ? { sourceMode: pick(['data', 'scatterplot', 'graph']) } : {}),
      ...(random() < 0.7 ? { requireInterpretation: pick([true, false]) } : {}),
    };
    const expected = regressionCalculatorStats(source);
    const variant = pick(['exact', 'exact', 'exact', 'shuffled', 'perturbed', 'dropped', 'extra', 'empty']);
    let table = source.map((pair) => [...pair]);
    if (variant === 'shuffled') table = shuffle(table);
    if (variant === 'perturbed') table[int(0, table.length - 1)][int(0, 1)] += pick([-1, 1]);
    if (variant === 'dropped') table = table.slice(1);
    if (variant === 'extra') table = [...table, [int(-5, 10), int(-5, 10)]];
    if (variant === 'empty') table = [];
    const runChoice = pick(['current', 'current', 'none', 'stale']);
    const run = runChoice === 'current'
      ? executeRun(table)
      : runChoice === 'stale' ? executeRun([[0, 0], [1, int(-3, 3)], [2, int(-3, 3)]]) : null;
    const key = expected ? legacyDescribe(expected.r) : { direction: 'none', strength: 'none' };
    const direction = random() < 0.6 ? key.direction : pick(['', 'positive', 'negative', 'none']);
    const strength = random() < 0.6 ? key.strength : pick(['', 'strong', 'moderate', 'weak', 'none']);
    const fixture = uiWork({ tablePoints: table, run, direction, strength, processEvidence: [{ type: 'tableEdited', row: 1, column: 'x1' }] });
    const result = assertMatchesLegacy(question, fixture, `state #${index}`);
    if (result.isCorrect) correct += 1;
    else if (result.score > 0) partial += 1;
  }
  // The sample really covers the verdict space, not just one corner of it.
  assert.ok(correct > 50, `only ${correct} fully correct states`);
  assert.ok(partial > 50, `only ${partial} partial states`);
});

// --- tampered and malformed work --------------------------------------------

test('a claimed verdict or answer key in the work is dropped and changes nothing', () => {
  const wrong = uiWork({ tablePoints: [[1, 2], [2, 4], [3, 6], [4, 8]], direction: 'positive', strength: 'strong' }).work;
  const honest = gradeBothWays(dataQuestion(), wrong, 'honest wrong');
  const forged = {
    ...wrong,
    isCorrect: true,
    score: 1,
    checks: [true, true, true, true],
    expected: { r: 0.98 },
    answerKey: POINTS,
    regressionRun: { operation: 'linearRegression', table: wrong.table, isCorrect: true, expected: POINTS },
  };
  const { dropped } = boundToolWork(forged);
  ['isCorrect', 'score', 'checks', 'expected', 'answerKey'].forEach((key) => assert.ok(dropped.includes(key), key));
  const result = gradeBothWays(dataQuestion(), forged, 'forged');
  assert.equal(result.browser.isCorrect, false);
  assert.equal(partById(result.browser, 'data-entry').isCorrect, partById(honest.browser, 'data-entry').isCorrect);
  assert.equal(partById(result.browser, 'correlation-produced').isCorrect, false);
});

test('wrong types in every field are read as missing work, never as a crash', () => {
  const malformed = [
    { table: 'POINTS', regressionRun: 'run', interpretation: 'positive strong' },
    { table: [{ x: 1, y: 2 }, null, 7, [1], [1, 2, 3]], regressionRun: [], interpretation: [] },
    { table: [[null, 2], [true, 4], ['', 5], [' ', 8]], regressionRun: { operation: 'linearRegression', table: 'all of them' } },
    { table: POINTS, regressionRun: { operation: 'linearRegression', table: POINTS, r: 'abc' }, interpretation: { direction: 1, strength: true } },
    { table: POINTS, regressionRun: { operation: 'linearRegression', table: POINTS, r: Number.NaN } },
    { regressionRun: null, interpretation: null, processEvidence: 'lots' },
    {},
  ];
  malformed.forEach((work, index) => {
    const { browser } = gradeBothWays(dataQuestion(), work, `malformed #${index}`);
    assert.equal(browser.graded, true, `malformed #${index} is graded, not refused`);
    assert.equal(browser.isCorrect, false, `malformed #${index}`);
  });
  // A null coordinate is not 0, even though Number(null) is.
  const zeroSource = dataQuestion({ sourceData: [[0, 0], [1, 1], [2, 3]] });
  const nulls = gradeBothWays(zeroSource, { table: [[null, null], [1, 1], [2, 3]] }, 'null coordinates').browser;
  assert.equal(partById(nulls, 'data-entry').isCorrect, false);
  // NaN travels as null and is not a produced correlation.
  const nanRun = gradeBothWays(dataQuestion(), { table: POINTS, regressionRun: { operation: 'linearRegression', table: POINTS, r: Number.NaN } }, 'NaN r').browser;
  assert.equal(partById(nanRun, 'correlation-produced').isCorrect, false);
  assert.equal(partById(nanRun, 'correlation-produced').isComplete, false);
});

test('non-object work and oversize work are ungraded on both paths', () => {
  [null, 'work', 42, [POINTS]].forEach((work) => {
    const { browser } = gradeBothWays(dataQuestion(), work, `non-object ${JSON.stringify(work)}`);
    assert.equal(browser.graded, false);
    assert.equal(browser.isCorrect, false);
    assert.equal(browser.score, 0);
  });
  const huge = { ...fullyCorrect().work, processEvidence: Array.from({ length: 300 }, (_, row) => ({ type: 'tableEdited', row, note: 'x'.repeat(900) })) };
  const { browser, server } = gradeBothWays(dataQuestion(), huge, 'oversize');
  assert.equal(browser.graded, false);
  assert.equal(browser.reason, 'oversize-response');
  assert.equal(server.reason, 'oversize-response');
});

// --- the work: student work only, bounded ----------------------------------

test('the work the calculator sends is exactly the student’s state, with nothing stripped', () => {
  const { work } = fullyCorrect();
  assert.deepEqual(Object.keys(work), ['table', 'regressionRun', 'interpretation', 'processEvidence']);
  assert.deepEqual(boundToolWork(work).dropped, []);
  assert.equal(boundToolWork(work).truncated, false);
  // Built from the calculator's state alone — no question goes in, so no key can come out.
  const unrun = uiWork({ tablePoints: [[1, 1], [2, 2]] }).work;
  const json = canonicalToolWorkJson(unrun);
  const keyR = String(regressionCalculatorStats(POINTS).r);
  assert.equal(json.includes(keyR.slice(0, 8)), false, 'the source r appears nowhere in work that never ran on the source');
  assert.equal(unrun.regressionRun, null);
});

test('realistic maximal work stays inside the response limits and the trail keeps its newest events', () => {
  const source = Array.from({ length: 50 }, (_, index) => [Number((index + 0.25).toFixed(2)), Number((3.17 * index - 12.34 + (index % 7) * 1.13).toFixed(2))]);
  const run = executeRun(source);
  const trail = [];
  for (let index = 0; trail.length < 2000; index += 1) {
    trail.push({ type: 'tableEdited', row: (index % 50) + 1, column: index % 2 ? 'y1' : 'x1' });
    if (index % 40 === 0) trail.push({ type: 'correlationProduced', value: run.r }, { type: 'expressionAdded', source: 'addRegression' });
  }
  trail.push({ type: 'interpretationSelected', kind: 'strength' });
  const { work } = uiWork({ tablePoints: source, run, direction: 'positive', strength: 'strong', processEvidence: trail });
  assert.equal(work.processEvidence.length, REGRESSION_PROCESS_EVIDENCE_LIMIT);
  assert.deepEqual(work.processEvidence.at(-1), { type: 'interpretationSelected', kind: 'strength' }, 'the newest event survives');
  const bounded = boundToolWork(work);
  assert.deepEqual(bounded.dropped, []);
  assert.equal(bounded.truncated, false);
  const json = canonicalToolWorkJson(work);
  assert.ok(json.length < TOOL_RESPONSE_LIMITS.maxJsonLength, `maximal work is ${json.length} chars`);
  const question = dataQuestion({ sourceData: source });
  const { browser } = gradeBothWays(question, work, 'maximal');
  assert.equal(browser.graded, true);
  assert.equal(browser.isCorrect, true);
  // A short trail is untouched.
  assert.deepEqual(buildRegressionCalculatorWork({ processEvidence: trail.slice(0, 3) }).processEvidence, trail.slice(0, 3));
});

// --- discrimination ---------------------------------------------------------

test('correct work fails against a question with an altered key', () => {
  const { work } = fullyCorrect();
  assert.equal(gradeBothWays(dataQuestion(), work, 'original').browser.isCorrect, true);

  const movedPoint = dataQuestion({ sourceData: [[1, 2], [2, 4], [3, 5], [4, 9]] });
  const moved = gradeBothWays(movedPoint, work, 'moved point').browser;
  assert.equal(moved.isCorrect, false);
  assert.equal(partById(moved, 'data-entry').isCorrect, false);

  const mirrored = dataQuestion({ sourceData: POINTS.map(([x, y]) => [x, -y]) });
  const flipped = gradeBothWays(mirrored, work, 'negated correlation').browser;
  assert.equal(partById(flipped, 'interpretation').isCorrect, false, 'positive is wrong for a negative correlation');

  const scatter = gradeBothWays(scatterQuestion(), work, 'scatterplot view').browser;
  assert.equal(scatter.parts[0].id, 'graph-to-table', 'the view decides which stage the table earns');
});

// --- Path still reads the same work -----------------------------------------

test('My Math Path grades the work this calculator now sends to the same verdict', () => {
  // In serverGrading mode QuestionEngine forwards this same `work` to the Path
  // contract (pathRegressionCalculatorGrading.mjs), which must keep reading it.
  const fixtures = [
    ['correct', fullyCorrect()],
    ['wrong table', fullyCorrect([[1, 2], [2, 4], [3, 6], [4, 8]])],
    ['no run', uiWork({ tablePoints: POINTS, direction: 'positive', strength: 'strong' })],
    ['wrong interpretation', uiWork({ tablePoints: POINTS, run: executeRun(POINTS), direction: 'negative', strength: 'weak' })],
  ];
  [dataQuestion(), scatterQuestion(), dataQuestion({ requireInterpretation: false })].forEach((question) => {
    fixtures.forEach(([label, { work }]) => {
      const path = gradeRegressionCalculatorResponse(buildRegressionCalculatorPrivateDefinition(question), JSON.parse(JSON.stringify(work)));
      const shared = gradeBothWays(question, work, label).browser;
      assert.deepEqual(shared.parts.map((part) => [part.id, part.isCorrect]), path.parts.map((part) => [part.id, part.isCorrect]), label);
      assert.equal(shared.score, path.score, label);
    });
  });
});

// --- the component is wired to the shared grader ----------------------------

test('Submit asks the shared grader and sends exactly the work it graded', () => {
  const code = executableSource(componentText);
  assert.match(code, /import regressionCalculatorGrader[\s\S]*?from '\.\.\/\.\.\/\.\.\/functions\/shared\/serverGrading\/tools\/regressionCalculator\.mjs'/);
  assert.match(code, /import \{ gradeToolCheck \} from '\.\.\/shared\/sharedToolGrading\.js'/);
  const check = region(code, 'const check = () => {', 'const feedbackParts', 'the Submit handler');
  assert.match(check, /const result = gradeToolCheck\(regressionCalculatorGrader, questionData, work\)/);
  assert.match(check, /submit\(\s*\{ isCorrect: result\.isCorrect, score: result\.score \},\s*work,\s*\{ mode: sourceMode, parts: result\.parts \},?\s*\)/);
  // The inline verdict is gone: no comparison, no threshold, no tolerance of its own.
  assert.doesNotMatch(code, /samePairs|describe\(|0\.0005|requireInterpretation === false\s*\n?\s*\?/);
});

test('the live work reported for a deadline is the same object Submit sends', () => {
  const code = executableSource(componentText);
  assert.match(code, /import useReportToolWork from '\.\.\/shared\/useReportToolWork\.js'/);
  assert.match(code, /const work = useMemo\(\s*\(\) => buildRegressionCalculatorWork\(\{ table: tablePoints, regressionRun: run, direction, strength, processEvidence \}\)/);
  // The memo must recompute whenever any graded input changes, or Submit and
  // the deadline would grade a stale table, run or interpretation.
  const memo = region(code, 'const work = useMemo(', 'useReportToolWork(work)', 'the work memo');
  const deps = memo.match(/\[([^\]]*)\],?\s*\);\s*$/);
  assert.ok(deps, 'the work memo declares its dependencies');
  assert.deepEqual(
    deps[1].split(',').map((name) => name.trim()).filter(Boolean).sort(),
    ['direction', 'processEvidence', 'run', 'strength', 'tablePoints'],
    'every input of the work is a dependency of its memo',
  );
  assert.match(code, /\n\s*useReportToolWork\(work\);/);
  // The view routes through the declaration's resolver, so grader and screen agree.
  assert.match(code, /import \{ resolveRegressionCalculatorMode \} from '\.\.\/\.\.\/\.\.\/functions\/shared\/serverGrading\/declarations\/regressionCalculator\.mjs'/);
  assert.match(code, /const sourceMode = resolveRegressionCalculatorMode\(questionData\)/);
  assert.match(code, /sourceMode === 'data' \?/);
});

test('stage feedback reads the shared parts by stage id', () => {
  const code = executableSource(componentText);
  const feedback = region(code, 'const feedbackParts', 'return (', 'the feedback text');
  assert.match(feedback, /feedbackParts\[0\]\?\.isCorrect !== true[\s\S]*Data entry\/table does not match/);
  assert.match(feedback, /stagePassed\('linear-regression'\)[\s\S]*Regression setup is incomplete/);
  assert.match(feedback, /stagePassed\('correlation-produced'\)[\s\S]*A correlation value has not been produced/);
  assert.match(feedback, /part\.id === 'interpretation'\) && !stagePassed\('interpretation'\)[\s\S]*Check the direction\/strength interpretation/);
});
