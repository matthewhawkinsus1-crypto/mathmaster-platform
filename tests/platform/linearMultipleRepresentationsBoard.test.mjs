/*
 * PR #397 — FREE-ORDER LINEAR MULTIPLE REPRESENTATIONS BOARD.
 *
 * Node cannot render the board, so the component contracts below read its
 * source — each bound to the region that does the work (see
 * docs/handoffs/SOURCE_CONTRACT_PLAYBOOK.md). The mathematics they rely on is
 * exercised for real in tests/tools/linearMultipleRepresentations.test.mjs,
 * and the rendered board is driven as a student in
 * tests/browser/linearMultipleRepresentations.mjs.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { executableSource, region } from './helpers/sourceContract.mjs';
import { sanitizeWorkspaceDraftValue, MAX_WORKSPACE_DRAFT_VALUE_BYTES, FORBIDDEN_DRAFT_KEYS } from '../../functions/shared/workspaceDraftSchema.mjs';
import { TOOL_STATE_PERSISTENCE } from '../../src/tools/toolStatePersistence.js';
import {
  deriveLinearMultipleRepresentations,
  evaluateGraph1Intercepts,
  evaluateGraph2SlopeIntercept,
  evaluateGraph3PointSlope,
  scoreLinearMultipleRepresentations,
  validatePointSlopeEntry,
  validateSlopeEntry,
  validateSlopeInterceptEntry,
  validateTableEntry,
  validateTwoPointsEntry,
  validateXInterceptEntry,
  validateYInterceptEntry,
} from '../../src/tools/representationBridge/linearMultipleRepresentationsMath.js';

const read = (relPath) => readFileSync(new URL(`../../${relPath}`, import.meta.url), 'utf8');
const BOARD = 'src/tools/representationBridge/LinearMultipleRepresentationsBoard.jsx';
const board = () => read(BOARD);
const code = () => executableSource(board());

// -----------------------------------------------------------------------------
// Wiring
// -----------------------------------------------------------------------------
test('RepresentationBridge delegates to LinearMultipleRepresentationsBoard when mode is linearMultipleRepresentations', () => {
  const bridgeSrc = read('src/tools/representationBridge/RepresentationBridge.jsx');
  assert.match(bridgeSrc, /import LinearMultipleRepresentationsBoard from '\.\/LinearMultipleRepresentationsBoard\.jsx'/);
  const delegation = region(bridgeSrc, "if (questionData.mode === 'linearMultipleRepresentations')", '\n  }', 'the mode switch');
  assert.match(delegation, /return <LinearMultipleRepresentationsBoard questionData=\{questionData\} onAction=\{onAction\} \/>/);
});

// -----------------------------------------------------------------------------
// Free order
// -----------------------------------------------------------------------------
test('free order: every card and all three graphs start open, and nothing is gated on another card', () => {
  const source = code();
  assert.doesNotMatch(source, /stageBlocked|requiredStages/, 'no stage gating');
  // An order that opens Graph 1 and folds Graphs 2 and 3 tells a student which to do first.
  const defaults = region(source, 'const DEFAULT_EXPANDED = {', '};', 'default expansion');
  for (const key of ['equationForms', 'features', 'table', 'context', 'graph1', 'graph2', 'graph3']) {
    assert.match(defaults, new RegExp(`${key}: true`), `${key} starts open`);
  }
  // Cards render from the required list only; no card's rendering reads another card's verdict.
  const cards = region(source, 'const equationCards = [', 'const featureCards', 'equation cards');
  assert.doesNotMatch(cards, /verdictFor\('(?!standardForm|slopeIntercept|pointSlope)/);
  assert.match(source, /Work in any order\./);
});

test('the GIVEN representation is rendered from describeGivenRepresentation, and a story is prose', () => {
  const source = code();
  assert.match(source, /describeGivenRepresentation\(questionData, canonicalFacts\)/);
  const given = region(source, 'function GivenRepresentation(', 'function GraphDialog', 'the GIVEN renderer');
  // A table source shows the table: every authored row, read-only.
  assert.match(given, /description\.kind === 'table'/);
  assert.match(given, /description\.rows\.map/);
  assert.doesNotMatch(given, /<input|onChange/, 'the GIVEN renderer has nothing to edit');
  // A scenario is prose through MathText, never one MathDisplay expression.
  const scenario = region(given, "description.kind === 'scenario'", '}\n', 'the scenario branch');
  assert.match(scenario, /<MathText/);
  assert.doesNotMatch(scenario, /<MathDisplay/);
  // The graph source is a read-only plane: no onPlot.
  const graph = region(given, "description.kind === 'graph'", "description.kind === 'scenario'", 'the graph branch');
  assert.match(graph, /<CoordinatePlane/);
  assert.doesNotMatch(graph, /onPlot/);
});

// -----------------------------------------------------------------------------
// Feedback belongs to the activity
// -----------------------------------------------------------------------------
test('a card can be checked only when the question is guided AND the runtime shows immediate feedback', () => {
  const source = code();
  assert.match(source, /const canCheck = feedbackTiming === 'guided' && showImmediateFeedback;/);
  const verdict = region(source, 'const verdicts = useMemo(() => {', 'const verdictFor', 'the verdict memo');
  assert.match(verdict, /if \(!canCheck\) return \{\};/, 'no verdict is ever shown without feedback');
  // A verdict exists only while the card still holds the work that was checked,
  // and it is recomputed from the question, never read from storage.
  assert.match(verdict, /key === cardResponseKey\(cardId, currentResponse\)/);
  assert.match(verdict, /judge\(cardId, currentResponse\)/);
  assert.match(source, /const verdictFor = \(cardId\) => verdicts\[cardId\] \|\| null;/);
  const check = region(source, 'const runCheck = (cardId) => {', '};', 'runCheck');
  assert.match(check, /if \(!canCheck\) return;/);
  // Enter-to-check is also feedback: MathInput only gets onSubmit when checking is allowed.
  const submits = [...source.matchAll(/onSubmit=\{([^}]*)\}/g)];
  assert.ok(submits.length >= 3);
  for (const match of submits) {
    assert.match(match[1], /^canCheck \? enterHandlers(\.|\[)/, `onSubmit must be gated and stable: ${match[1]}`);
  }
  // Progress counts correctness only when checking is allowed; otherwise it counts filled-in work.
  assert.match(source, /const cardDone = \(cardId\) => \(canCheck \? Boolean\(verdictFor\(cardId\)\?\.isCorrect\) : cardHasWork\(cardId, currentResponse\)\);/);
});

test('Enter checks the card being typed in and can never submit the whole board', () => {
  const source = code();
  const handler = region(source, 'const handleBoardKeyDown = (event) => {', '};', 'the board Enter handler');
  assert.match(handler, /isSingleLineAnswerTarget\(event\.target\)/);
  // preventDefault stops ToolShell's handler, which would otherwise click the
  // first "Submit…" button — the whole one-attempt DOL.
  assert.match(handler, /event\.preventDefault\(\);/);
  assert.match(handler, /closest\?\.\('\[data-lmr-card\]'\)/);
  assert.match(handler, /button\[data-card-check="true"\]/);
  assert.doesNotMatch(handler, /handleSubmit|doSubmit|submit\(/);
  // Bound on the board's root element (other attributes may sit beside it).
  assert.match(source, /<div\b[^>]*\bonKeyDown=\{handleBoardKeyDown\}/);
});

test('an incomplete board asks before submitting', () => {
  const source = code();
  const submit = region(source, 'const handleSubmit = () => {', '};', 'handleSubmit');
  assert.match(submit, /if \(emptyParts\.length && !confirmSubmit\)/);
  assert.match(source, /Submit anyway/);
});

// -----------------------------------------------------------------------------
// Persistence
// -----------------------------------------------------------------------------
const ANSWER_FIELDS = [
  'standardFormEquation', 'slopeInterceptEquation', 'pointSlopeEquation',
  'featureSlope', 'featureXIntercept', 'featureYIntercept', 'featurePoint1', 'featurePoint2',
  'tableRows', 'graph1Points', 'graph2Points', 'graph3Points',
  'contextIndependent', 'contextDependent', 'contextSlopeMeaning', 'contextYInterceptMeaning', 'contextXInterceptMeaning', 'contextDomain',
];

test('every answer field is draft-backed; collapsing only toggles visibility', () => {
  const source = code();
  for (const field of ANSWER_FIELDS) assert.match(source, new RegExp(`usePersistentToolState\\('${field}'`), `${field} is draft-backed`);
  assert.match(source, /usePersistentToolState\('expandedCards'/);
  const toggle = region(source, 'const toggle = (key) =>', '});', 'toggle');
  assert.doesNotMatch(toggle, /set(?!ExpandedCards)[A-Z][A-Za-z]*\(/, 'collapsing never touches work');
});

// A draft record the sync refuses is not backed up at all — silently. The
// board used to persist `cardChecks: { isCorrect }`, a forbidden draft key, so
// the first press of Check ended the server backup of the whole board. It now
// persists only WHICH work was checked (a fingerprint) and recomputes the
// verdict from the question.
const maximalDraft = () => ({
  standardFormEquation: 'x-2y=6',
  slopeInterceptEquation: 'y=\\frac{1}{2}x-3',
  pointSlopeEquation: 'y+\\frac{5}{2}=\\frac{1}{2}\\left(x-1\\right)',
  featureSlope: '\\frac{1}{2}',
  featureXIntercept: '\\left(6,0\\right)',
  featureYIntercept: '\\left(0,-3\\right)',
  featurePoint1: '\\left(2,-2\\right)',
  featurePoint2: '\\left(4,-1\\right)',
  tableRows: Array.from({ length: 12 }, (_, index) => ({ x: String(index * 2), y: String(index - 3) })),
  graph1Points: [[6, 0], [0, -3]],
  graph2Points: [[0, -3], [2, -2]],
  graph3Points: [[1, -2.5], [3, -1.5]],
  contextIndependent: 'time since the candle was lit (hours)',
  contextDependent: 'height of the candle (inches)',
  contextSlopeMeaning: 'The candle gets 2 inches shorter every hour.',
  contextYInterceptMeaning: 'The candle is 18 inches tall when it is lit.',
  contextXInterceptMeaning: 'The candle is completely burned down after 9 hours.',
  contextDomain: '0 ≤ x ≤ 9',
  expandedCards: { equationForms: false, features: true, table: true, context: true, graph1: false, graph2: true, graph3: true },
  checkedCards: {
    slopeIntercept: '["y=\\\\frac{1}{2}x-3"]',
    table: JSON.stringify([Array.from({ length: 12 }, (_, index) => ({ x: String(index * 2), y: String(index - 3) }))]),
    graphPointSlope: '[[[1,-2.5],[3,-1.5]],"y+\\\\frac{5}{2}=\\\\frac{1}{2}\\\\left(x-1\\\\right)"]',
    context: '["time since the candle was lit (hours)","height of the candle (inches)"]',
  },
});

test('the whole board record syncs: no forbidden key, and well under the 16 KB cap', () => {
  const persisted = [...board().matchAll(/usePersistentToolState\('([^']+)'/g)].map((match) => match[1]);
  assert.deepEqual(persisted.filter((field) => FORBIDDEN_DRAFT_KEYS.includes(field)), []);
  assert.equal(persisted.includes('cardChecks'), false, 'no Check verdicts are draft-backed');
  // What is stored about a Check is a fingerprint string per card — never a verdict.
  const check = region(code(), 'const runCheck = (cardId) => {', '};', 'runCheck');
  assert.match(check, /setCheckedCards\(\(prev\) => \(\{ \.\.\.prev, \[cardId\]: cardResponseKey\(cardId, response\) \}\)\);/);
  assert.equal(TOOL_STATE_PERSISTENCE.representationBridge.transientState.cardChecks, undefined);
  const record = maximalDraft();
  assert.deepEqual(Object.keys(record).sort(), persisted.sort(), 'the fixture is the real record shape');
  const sanitized = sanitizeWorkspaceDraftValue(record);
  assert.equal(sanitized.ok, true, sanitized.reason);
  assert.ok(sanitized.bytes < MAX_WORKSPACE_DRAFT_VALUE_BYTES / 4, `${sanitized.bytes} bytes`);
  // Mutation guard: the old record shape is refused.
  assert.equal(sanitizeWorkspaceDraftValue({ ...record, cardChecks: { slope: { checked: true, isCorrect: true } } }).reason, 'forbidden-key');
});

// -----------------------------------------------------------------------------
// Graphs
// -----------------------------------------------------------------------------
test('three separate graph workspaces, each with its own grid, and Graph 3 anchored by resolveGraph3Anchor', () => {
  const source = code();
  for (const key of ['graph1', 'graph2', 'graph3']) assert.match(source, new RegExp(`usePersistentToolState\\('${key}Points', \\[\\]\\)`));
  assert.match(source, /resolveGraph3Anchor\(questionData, canonicalFacts, pointSlopeEquation\)/);
  assert.match(source, /resolveGraphSnapSteps\(questionData, canonicalFacts, graph3Anchor\.point\)/);
  const plane = region(source, 'const renderPlane = (graph, width, extra = {}) => {', '  };', 'renderPlane');
  assert.match(plane, /snapStep=\{snapFor\(graph\.key\)\}/);
  assert.match(plane, /onPlot=\{\(point\) => plotPoint\(graph\.key, point\)\}/);
  assert.match(plane, /onMovePoint=\{\(index, point\) => movePoint\(graph\.key, index, point\)\}/);
  assert.match(plane, /enlargeable=\{false\}/, 'the board owns enlargement, so Check comes with it');
  assert.doesNotMatch(plane, /plottedPoints=/);
  // Graph 3's window follows its anchor; Graphs 1 and 2 keep the question window.
  assert.match(source, /graph3Anchor\.point \? expandGraphBoundsForAnchor\(graphBounds, graph3Anchor\.point, canonicalFacts\) : graphBounds/);
});

test('a third tap moves the newest point instead of wiping the construction; Start over can be undone', () => {
  const source = code();
  const plot = region(source, 'const plotPoint = (key, point) => {', '};', 'plotPoint');
  assert.match(plot, /current\.length >= 2 \? \[current\[0\], point\] : \[\.\.\.current, point\]/);
  const clear = region(source, 'const clearGraph = (key) =>', ';', 'clearGraph');
  assert.match(clear, /changeGraph\(key, \[\]\)/, 'Start over goes through the undo history');
  const change = region(source, 'const changeGraph = (key, next) => {', '};', 'changeGraph');
  assert.match(change, /historyRef\.current\[key\] = \[\.\.\.historyRef\.current\[key\]\.slice\(-19\), current\]/);
});

test('the enlarged graph keeps its task, the Graph 3 anchor, and its own Check', () => {
  const source = code();
  const dialog = region(source, '<GraphDialog key={graph.key}', '</GraphDialog>', 'the enlarged graph');
  assert.match(dialog, /graph\.task/);
  assert.match(dialog, /graph3Guide/);
  assert.match(dialog, /data-card-check="true"/);
  assert.match(dialog, /graphControls\(graph\)/);
  const shell = region(source, 'function GraphDialog(', '\n}\n', 'GraphDialog');
  assert.match(shell, /role="dialog"/);
  assert.match(shell, /aria-modal="true"/);
  assert.match(shell, /event\.key === 'Escape'/);
});

test('the comparison overlay appears only after all three graphs are verified, and prints no equation', () => {
  const source = code();
  assert.match(source, /const showComparison = canCheck && allGraphsRequired && \(allGraphsVerified \|\| feedback\?\.isCorrect === true\);/);
  const overlay = region(source, '{showComparison ? (', ') : null}', 'the overlay');
  // Free order: the overlay can appear before the equation cards are done, so
  // printing y = mx + b there would hand over the slope-intercept answer.
  assert.doesNotMatch(overlay, /slopeInterceptEquation|MathDisplay/);
});

test('responsive: every grid track can shrink to the phone width', () => {
  const source = code();
  const tracks = [...source.matchAll(/minmax\((min\([^)]*\)|[^,]+),/g)].map((match) => match[1].trim());
  assert.ok(tracks.length >= 3);
  for (const track of tracks) assert.match(track, /^min\(\d+px, 100%\)$/, `grid track ${track} could force horizontal scrolling`);
});

test('student language: no developer vocabulary on screen', () => {
  const source = code();
  for (const word of [/Free-Order Mode/, /Guided Feedback/, /Submit-Only/, /target line/, /Complete Board Verification/, /token/i, /coherence/i]) {
    assert.doesNotMatch(source, word);
  }
});

// -----------------------------------------------------------------------------
// Core acceptance: a student completes the board in an arbitrary order
// -----------------------------------------------------------------------------
test('Core Acceptance Test: Student completes representations in arbitrary free order', () => {
  const question = {
    mode: 'linearMultipleRepresentations',
    source: { kind: 'standardForm', equation: '2x - 4y = 12' },
    feedbackTiming: 'guided',
  };

  const derived = deriveLinearMultipleRepresentations(question);
  assert.equal(derived.isValid, true);
  assert.equal(derived.slopeNumber, 0.5);
  assert.equal(derived.zeroNumber, 6);
  assert.equal(derived.yInterceptNumber, -3);

  const studentWork = {
    standardFormEquation: '',
    slopeInterceptEquation: '',
    pointSlopeEquation: '',
    featureSlope: '',
    featureXIntercept: '',
    featureYIntercept: '',
    featurePoint1: '',
    featurePoint2: '',
    tableRows: [],
    graph1Points: [],
    graph2Points: [],
    graph3Points: [],
  };

  studentWork.pointSlopeEquation = 'y + 2 = 1/2(x - 2)';
  const psCheck = validatePointSlopeEntry(studentWork.pointSlopeEquation, derived);
  assert.equal(psCheck.isCorrect, true);
  assert.deepEqual(psCheck.point, [2, -2]);

  studentWork.tableRows = [
    { x: 0, y: -3 },
    { x: 2, y: -2 },
    { x: 4, y: -1 },
    { x: 6, y: 0 },
  ];
  assert.equal(validateTableEntry(studentWork.tableRows, derived).isCorrect, true);

  studentWork.graph2Points = [[0, -3], [2, -2]];
  assert.equal(evaluateGraph2SlopeIntercept(studentWork.graph2Points, derived).isCorrect, true);

  studentWork.featureXIntercept = '(6, 0)';
  studentWork.featureYIntercept = '(0, -3)';
  assert.equal(validateXInterceptEntry(studentWork.featureXIntercept, derived).isCorrect, true);
  assert.equal(validateYInterceptEntry(studentWork.featureYIntercept, derived).isCorrect, true);

  studentWork.graph1Points = [[6, 0], [0, -3]];
  assert.equal(evaluateGraph1Intercepts(studentWork.graph1Points, derived).isCorrect, true);

  studentWork.graph3Points = [[2, -2], [4, -1]];
  assert.equal(evaluateGraph3PointSlope(studentWork.graph3Points, derived, [2, -2]).isCorrect, true);

  studentWork.featureSlope = '1/2';
  studentWork.featurePoint1 = '(2, -2)';
  studentWork.featurePoint2 = '(4, -1)';
  studentWork.slopeInterceptEquation = 'y = 1/2x - 3';
  assert.equal(validateSlopeEntry(studentWork.featureSlope, derived).isCorrect, true);
  assert.equal(validateTwoPointsEntry(studentWork.featurePoint1, studentWork.featurePoint2, derived).isCorrect, true);
  assert.equal(validateSlopeInterceptEntry(studentWork.slopeInterceptEquation, derived).isCorrect, true);

  const finalResult = scoreLinearMultipleRepresentations(question, studentWork);
  assert.equal(finalResult.isCorrect, true);
  assert.equal(finalResult.score, 1);
  assert.equal(finalResult.parts.crossRepresentationConsistency, true);
  for (const part of ['graph1', 'graph2', 'graph3', 'slopeIntercept', 'pointSlope', 'table']) assert.equal(finalResult.parts[part], true, part);
  assert.equal('standardForm' in finalResult.parts, false, 'the GIVEN form is never graded');
});
