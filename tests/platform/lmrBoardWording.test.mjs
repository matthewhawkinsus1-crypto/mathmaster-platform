/*
 * THE MULTIPLE REPRESENTATIONS BOARD SAYS WHAT A STUDENT SEES (TL28; D-55).
 *
 *   - A graph is numbered among the graphs its board shows: the only graph on
 *     a board is "Graph", never "Graph 2", and every place that names it —
 *     the card, Check, Undo, "Now open", the submitted parts, the review, the
 *     consistency note — says the same. A full board reads as before.
 *   - An empty ordered-pair box is typed into, so Check says to type it, not
 *     to "choose a point".
 *   - A meaning that is not right yet gets, beside "Take another look", what
 *     that quantity is: a definition to check against, never the answer.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import {
  crossRepresentationConsistencyFor,
  graphNamesFor,
  partLabelsFor,
} from '../../functions/shared/toolMath/representationBridge/linearMultipleRepresentationsMath.mjs';
import {
  FORMAT_CODES,
  evaluateLmrEntry,
  firstProcessFeedback,
  lmrCardLabel,
  lmrProcessEnvironment,
  processFeedback,
} from '../../functions/shared/toolMath/representationBridge/lmrProcessVerify.mjs';
import { gradeToolWork } from '../../functions/shared/serverGrading/serverResponseGrading.mjs';
import { boardUndoChanges, describeBoardUndo } from '../../src/tools/representationBridge/linearMultipleRepresentationsUndo.js';
import { buildRepresentationBridgeReview } from '../../src/tools/shared/reviews/representationBridgeReview.js';
import { correctLinearBoardResponse } from './helpers/linearMultipleRepresentationsResponses.mjs';
import { region } from './helpers/sourceContract.mjs';

const VITE_CACHE = join(tmpdir(), 'mathmaster-vite-ssr');
const boardSource = readFileSync(new URL('../../src/tools/representationBridge/LinearMultipleRepresentationsBoard.jsx', import.meta.url), 'utf8');

const board = (requiredCards, extra = {}) => ({
  type: 'representationBridge',
  mode: 'linearMultipleRepresentations',
  source: { kind: 'standardForm', equation: '2x - 4y = 12' },
  feedbackTiming: 'guided',
  ...(requiredCards ? { requiredCards } : {}),
  ...extra,
});
// The rideshare board on the DOL3 review: one graph, built by slope-intercept.
const ONE_GRAPH = board(['slope', 'yIntercept', 'slopeIntercept', 'graphSlopeIntercept']);
const LAST_TWO = board(['slopeIntercept', 'graphSlopeIntercept', 'graphPointSlope']);
const FIRST_AND_LAST = board(['standardForm', 'graphIntercepts', 'graphPointSlope']);
const FULL = board(null);

test('a graph is numbered among the graphs its board shows; a full board reads as before', () => {
  assert.deepEqual({ ...graphNamesFor(ONE_GRAPH) }, { graph2: 'Graph' });
  assert.equal(partLabelsFor(ONE_GRAPH).graph2, 'Graph (slope-intercept)');
  assert.deepEqual({ ...graphNamesFor(LAST_TWO) }, { graph2: 'Graph 1', graph3: 'Graph 2' });
  assert.deepEqual([partLabelsFor(LAST_TWO).graph2, partLabelsFor(LAST_TWO).graph3], ['Graph 1 (slope-intercept)', 'Graph 2 (point-slope)']);
  assert.deepEqual([partLabelsFor(FIRST_AND_LAST).graph1, partLabelsFor(FIRST_AND_LAST).graph3], ['Graph 1 (intercepts)', 'Graph 2 (point-slope)']);
  const full = partLabelsFor(FULL);
  assert.deepEqual([full.graph1, full.graph2, full.graph3], ['Graph 1 (intercepts)', 'Graph 2 (slope-intercept)', 'Graph 3 (point-slope)']);
  assert.equal(full.slopeIntercept, 'Slope-intercept form', 'every other part keeps its name');
  // "Now open: …" in Process Mode.
  assert.equal(lmrCardLabel('graphSlopeIntercept', { ...ONE_GRAPH, interactionMode: 'process' }), 'Graph (slope-intercept)');
  assert.equal(lmrCardLabel('graphSlopeIntercept'), 'Graph 2 (slope-intercept)', 'without a question, the full board\'s name');
});

test('the submitted parts, the review and Undo name the graph as its card did — and the verdict is the same', () => {
  for (const [question, expected] of [[ONE_GRAPH, ['graph2', 'Graph (slope-intercept)']], [LAST_TWO, ['graph3', 'Graph 2 (point-slope)']], [FULL, ['graph2', 'Graph 2 (slope-intercept)']]]) {
    const graded = gradeToolWork({ toolId: 'representationBridge', question, work: correctLinearBoardResponse(question) });
    assert.equal(graded.isCorrect, true, 'a correct board is still correct');
    const [id, label] = expected;
    assert.equal(graded.parts.find((part) => part.id === id)?.label, label, `${id} is "${label}"`);
    const review = buildRepresentationBridgeReview(question);
    assert.ok(review.items.some((item) => item.label === label), `the review's item: ${review.items.map((item) => item.label).join(' | ')}`);
    assert.ok(review.steps.some((step) => step.includes(`${label}: plot`)), 'and its step');
  }
  const changes = boardUndoChanges({ graph2Points: [[0, -3]] }, { graph2Points: [] }, partLabelsFor(ONE_GRAPH));
  assert.equal(describeBoardUndo(changes), 'Undid your last change to Graph (slope-intercept).');
});

test('the consistency note names a graph by its number on the board', () => {
  const response = { slopeInterceptEquation: 'y = \\frac{1}{2}x - 3', graph2Points: [[0, -3], [2, -2]], graph3Points: [[0, 0], [1, 5]] };
  assert.deepEqual(crossRepresentationConsistencyFor(LAST_TWO, response).consistency.outliers, ['Graph 2'], 'the point-slope graph is the second one shown');
  assert.deepEqual(crossRepresentationConsistencyFor(FULL, response).consistency.outliers, ['Graph 3']);
});

test('the board titles its graphs by the same rule', async () => {
  const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent', cacheDir: VITE_CACHE });
  try {
    const { default: Board } = await server.ssrLoadModule('/src/tools/representationBridge/LinearMultipleRepresentationsBoard.jsx');
    const titles = (question) => [...renderToStaticMarkup(React.createElement(Board, { questionData: question }))
      .matchAll(/aria-label="Coordinate plane for ([^".]+)[."]/g)].map((match) => match[1]);
    assert.deepEqual(titles(ONE_GRAPH), ['Graph · Slope-intercept method']);
    assert.deepEqual(titles(LAST_TWO), ['Graph 1 · Slope-intercept method', 'Graph 2 · Point-slope method']);
    assert.deepEqual(titles(FULL), ['Graph 1 · Intercept method', 'Graph 2 · Slope-intercept method', 'Graph 3 · Point-slope method']);
  } finally {
    await server.close();
  }
});

test('an empty ordered-pair box is typed into: Check says to type it', () => {
  const STANDARD = { ...board(null), interactionMode: 'process' };
  const GRAPH = { ...board(null), interactionMode: 'process', source: { kind: 'graph', points: [[0, 1], [3, -1]] } };
  const mark = (question, strategy, ev, target = null) => evaluateLmrEntry(
    { id: 't', strategy, from: 'given', ...(target ? { target } : {}), at: 1, tries: 1, ev },
    { facts: {} },
    lmrProcessEnvironment(question),
  );
  const said = (evaluated, reveal) => firstProcessFeedback(evaluated, { reveal });
  const typed = 'Type the point first, as an ordered pair: (x, y).';
  // After the substitution is solved, the intercept box.
  const solvedBlank = mark(STANDARD, 'substituteZero', { zero: 'y', eq: { left: 'x', right: '6' }, steps: [{ left: 'x', right: '6' }], point: '' }, 'xIntercept');
  assert.equal(said(solvedBlank, true), typed);
  assert.equal(said(solvedBlank, false), typed, 'about the form of the work, so said where outcomes are withheld');
  // After a point is picked on the given graph, its coordinates.
  assert.equal(said(mark(GRAPH, 'graphPoint', { pick: [3, -1], point: '  ' }), true), typed);
  // Something typed that is not a pair is still asked for as one.
  assert.equal(said(mark(GRAPH, 'graphPoint', { pick: [3, -1], point: '3, ' }), true), 'Enter an ordered pair: (x, y).');
  assert.ok(FORMAT_CODES.has('point-blank'));
  assert.equal(processFeedback('point-missing'), 'Choose a point first.', 'where a point IS chosen, the words stay');
});

test('a meaning that is not right yet says what that quantity is, under it, and describes the field', () => {
  const fields = region(boardSource, 'const CONTEXT_FIELDS = [', '];', 'the meaning fields');
  const reasons = [...fields.matchAll(/field: '(\w+)'.*reason: '([^']+)'/g)].map(([, field, reason]) => [field, reason]);
  assert.deepEqual(reasons.map(([field]) => field), ['contextIndependent', 'contextDependent', 'contextSlopeMeaning', 'contextYInterceptMeaning', 'contextXInterceptMeaning', 'contextDomain']);
  assert.match(Object.fromEntries(reasons).contextSlopeMeaning, /up or down/, 'the slope\'s direction is something to check');
  reasons.forEach(([field, reason]) => assert.doesNotMatch(reason, /take another look/i, `${field}: said once, by the badge`));
  const render = region(boardSource, 'const renderContextField = (', '\n  };', 'a meaning field');
  // Only after Check, only under a meaning that is not right.
  assert.match(render, /const reasonId = contextVerdict && !result \? `\$\{meaningIdBase\}-\$\{field\}` : undefined;/);
  assert.match(render, /\{reasonId \? <p id=\{reasonId\} data-lmr-meaning-reason=\{field\} style=\{muted\}>\{reason\}<\/p> : null\}/);
  // Outside the label, so the field's name is still its question.
  assert.ok(render.indexOf('</label>') < render.indexOf('data-lmr-meaning-reason'), 'the reason follows the label');
  assert.equal((render.match(/aria-describedby=\{reasonId\}|ariaDescribedBy=\{reasonId\}/g) || []).length, 3, 'every kind of meaning field is described by it');
});
