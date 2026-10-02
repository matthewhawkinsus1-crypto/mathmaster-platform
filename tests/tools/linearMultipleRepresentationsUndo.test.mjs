/*
 * WHOLE-BOARD UNDO ON THE MULTIPLE REPRESENTATIONS BOARD (PQ-009 items 3, 4).
 *
 *   3. VERDICTS. `checkedCards` records which work the student pressed Check
 *      on, and a verdict is recomputed from it. A snapshot carrying it would
 *      let Undo un-check a card, or put back "✓ Correct" for work that was
 *      never checked. The history holds the mathematics and nothing else.
 *   4. INVISIBLE EDITS. One Undo for the whole board can change a folded card
 *      or one below the fold. Every field names the card that shows it, so the
 *      board can open it, bring it into view and say what changed.
 *
 * The helpers are src/tools/representationBridge/linearMultipleRepresentationsUndo.js;
 * the stack is the platform's (src/platform/workView/mathUndoStack.js). The
 * rendered board is driven in tests/browser/linearMultipleRepresentations.mjs
 * (journeys `undo`, `undo-phone`).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  BOARD_UNDO_FIELDS,
  boardUndoChanges,
  boardUndoState,
  boardUndoTitle,
  changedBoardFields,
  describeBoardUndo,
  graphUndoField,
} from '../../src/tools/representationBridge/linearMultipleRepresentationsUndo.js';
import {
  EMPTY_MATH_UNDO_STACK,
  mathematicalSnapshot,
  recordMathUndoEntry,
  undoMathUndoChange,
  undoMathUndoEntry,
} from '../../src/platform/workView/mathUndoStack.js';
import { boundUndoEntries } from '../../src/platform/workView/persistedMathUndo.js';
import { FORBIDDEN_DRAFT_KEYS, MAX_WORKSPACE_DRAFT_VALUE_BYTES, sanitizeWorkspaceDraftValue } from '../../functions/shared/workspaceDraftSchema.mjs';

const BOARD = readFileSync(new URL('../../src/tools/representationBridge/LinearMultipleRepresentationsBoard.jsx', import.meta.url), 'utf8');
const persistedFields = [...BOARD.matchAll(/usePersistentToolState\('([^']+)'/g)].map((match) => match[1]);

// Everything the board's work record holds that is NOT mathematics the student
// built — and why it must never be in the Undo history.
const NOT_UNDOABLE = {
  checkedCards: 'which work was checked; a verdict is recomputed from it',
  expandedCards: 'which panels are open; presentation',
  // Process Mode: work the student pressed Check (or Save) on is evidence of a
  // process, recorded deliberately — like a Check, never an edit to take
  // back. A fact is re-established (or changed, where outcomes are withheld)
  // by doing the process again. The work in progress inside a method belongs
  // to that method's own fields (and an embedded Step Algebra keeps its own
  // Undo), not to the board's history.
  processLog: 'the process work Check or Save recorded; established facts are recomputed from it',
  processDraft: 'the work in progress inside each process method',
};

const emptyBoard = () => ({
  standardFormEquation: '', slopeInterceptEquation: '', pointSlopeEquation: '',
  featureSlope: '', featureXIntercept: '', featureYIntercept: '', featurePoint1: '', featurePoint2: '',
  tableRows: [{ x: '', y: '' }, { x: '', y: '' }, { x: '', y: '' }, { x: '', y: '' }],
  graph1Points: [], graph2Points: [], graph3Points: [],
  contextIndependent: '', contextDependent: '', contextSlopeMeaning: '', contextYInterceptMeaning: '', contextXInterceptMeaning: '', contextDomain: '',
});

test('the Undo history records every answer field on the board, and never a verdict or the layout', () => {
  // Bound to the component: a new answer field the history forgot would be an
  // edit Undo silently skips; a new non-answer field must be named above.
  const expected = persistedFields.filter((field) => !NOT_UNDOABLE[field]);
  assert.deepEqual([...BOARD_UNDO_FIELDS].sort(), expected.sort());
  for (const field of Object.keys(NOT_UNDOABLE)) assert.ok(persistedFields.includes(field), `${field} is still part of the board record`);
  const state = boardUndoState({
    ...emptyBoard(),
    checkedCards: { slope: '["-2"]', context: '["a","b"]' },
    expandedCards: { graph1: false },
    isCorrect: true,
    score: 1,
    verdict: { isCorrect: true },
  });
  assert.deepEqual(Object.keys(state), [...BOARD_UNDO_FIELDS]);
  for (const key of [...Object.keys(NOT_UNDOABLE), ...FORBIDDEN_DRAFT_KEYS, 'verdict']) {
    assert.equal(key in state, false, `${key} is not in the Undo history`);
  }
});

test('a Check is not an Undo step, and no restored state carries a verdict', () => {
  // A session as the board feeds it to the history: edits, Checks in between
  // (checkedCards changes, the work does not), a panel folded and opened.
  const responses = [];
  let board = { ...emptyBoard(), checkedCards: {}, expandedCards: {} };
  const push = (patch) => { board = { ...board, ...patch }; responses.push(board); };
  push({});
  push({ featureSlope: '-2' });
  push({ checkedCards: { slope: '["-2"]' } }); // Check
  push({ expandedCards: { table: false } }); // fold the table
  push({ graph2Points: [[0, 18]] });
  push({ graph2Points: [[0, 18], [1, 16]] });
  push({ checkedCards: { slope: '["-2"]', graphSlopeIntercept: '[[[0,18],[1,16]]]' } }); // Check
  push({ contextSlopeMeaning: 'The candle gets 2 inches shorter every hour.' });
  let stack = EMPTY_MATH_UNDO_STACK;
  responses.forEach((response, index) => {
    if (index === 0) return;
    stack = recordMathUndoEntry(stack, boardUndoState(responses[index - 1]), boardUndoState(response), { now: 10_000 * index });
  });
  assert.equal(stack.entries.length, 4, 'four edits, four steps: the Checks and the fold recorded nothing');
  const restored = [];
  for (let rest = stack; ;) {
    const { stack: next, restored: state, changed } = undoMathUndoEntry(rest);
    if (!changed) break;
    restored.push(state);
    rest = next;
  }
  assert.deepEqual(restored.map((state) => changedBoardFields(state, boardUndoState(board))), [
    ['contextSlopeMeaning'],
    ['graph2Points', 'contextSlopeMeaning'],
    ['graph2Points', 'contextSlopeMeaning'],
    ['featureSlope', 'graph2Points', 'contextSlopeMeaning'],
  ]);
  restored.forEach((state) => {
    assert.deepEqual(Object.keys(state), [...BOARD_UNDO_FIELDS]);
    assert.equal(JSON.stringify(state).includes('checkedCards'), false);
  });
});

test('every change names the card that shows it, where it lives and what to call it', () => {
  const before = emptyBoard();
  const rows = (x) => [{ x, y: '' }, ...before.tableRows.slice(1)];
  const cases = [
    ['standardFormEquation', 'x', 'standardForm', 'equationForms', 'Standard form'],
    ['slopeInterceptEquation', 'y', 'slopeIntercept', 'equationForms', 'Slope-intercept form'],
    ['pointSlopeEquation', 'y', 'pointSlope', 'equationForms', 'Point-slope form'],
    ['featureSlope', '2', 'slope', 'features', 'Slope'],
    ['featureXIntercept', '(6,0)', 'xIntercept', 'features', 'x-intercept'],
    ['featureYIntercept', '(0,4)', 'yIntercept', 'features', 'y-intercept'],
    ['featurePoint1', '(1,2)', 'twoPoints', 'features', 'Two points on the line'],
    ['featurePoint2', '(3,4)', 'twoPoints', 'features', 'Two points on the line'],
    ['tableRows', rows('0'), 'table', 'table', 'Table of values'],
    ['graph1Points', [[6, 0]], 'graphIntercepts', 'graph1', 'Graph 1 (intercepts)'],
    ['graph2Points', [[0, 4]], 'graphSlopeIntercept', 'graph2', 'Graph 2 (slope-intercept)'],
    ['graph3Points', [[3, 2]], 'graphPointSlope', 'graph3', 'Graph 3 (point-slope)'],
    ['contextIndependent', 'time', 'context', 'context', 'Independent quantity'],
    ['contextDependent', 'height', 'context', 'context', 'Dependent quantity'],
    ['contextSlopeMeaning', 'm', 'context', 'context', 'Meaning of the slope'],
    ['contextYInterceptMeaning', 'b', 'context', 'context', 'Meaning of the y-intercept'],
    ['contextXInterceptMeaning', 'z', 'context', 'context', 'Meaning of the x-intercept'],
    ['contextDomain', '0\\le x\\le9', 'context', 'context', 'Reasonable domain'],
  ];
  assert.equal(cases.length, BOARD_UNDO_FIELDS.length, 'every field is covered');
  for (const [field, value, cardId, expandKey, label] of cases) {
    assert.deepEqual(boardUndoChanges(before, { ...before, [field]: value }), [{ field, cardId, expandKey, label }], field);
  }
  assert.deepEqual(boardUndoChanges(before, before), []);
  assert.deepEqual(boardUndoChanges(before, undefined), [], 'nothing to undo names nothing');
  // Both points of the two-points card at once: one place, named once.
  assert.deepEqual(
    boardUndoChanges(before, { ...before, featurePoint1: '(1,2)', featurePoint2: '(3,4)' }).map((change) => change.label),
    ['Two points on the line'],
  );
  // A graph's own Undo filters the history to the field the board stores.
  assert.deepEqual(['graph1', 'graph2', 'graph3'].map(graphUndoField), ['graph1Points', 'graph2Points', 'graph3Points']);
});

test('what a screen reader hears, and the Undo button\'s title', () => {
  const before = emptyBoard();
  const one = boardUndoChanges(before, { ...before, graph2Points: [[0, 18]] });
  assert.equal(describeBoardUndo(one), 'Undid your last change to Graph 2 (slope-intercept).');
  assert.equal(boardUndoTitle(one), 'Undo your last change to Graph 2 (slope-intercept)');
  const three = boardUndoChanges(before, { ...before, featureSlope: '1', tableRows: [], contextDomain: 'x' });
  assert.equal(describeBoardUndo(three), 'Undid your last change to Slope, Table of values and Reasonable domain.');
  assert.equal(describeBoardUndo([]), '', 'nothing changed, nothing said');
  assert.equal(boardUndoTitle([]), 'Undo your last change on this board');
});

test('the history a refresh keeps for a full board stays local-sized and would pass the draft sanitizer', () => {
  // A full candle board, and the 60 previous states a long session leaves.
  const full = {
    standardFormEquation: '2x+y=18', slopeInterceptEquation: 'y=-2x+18', pointSlopeEquation: 'y-10=-2\\left(x-4\\right)',
    featureSlope: '-2', featureXIntercept: '\\left(9,0\\right)', featureYIntercept: '\\left(0,18\\right)',
    featurePoint1: '\\left(4,10\\right)', featurePoint2: '\\left(9,0\\right)',
    tableRows: Array.from({ length: 12 }, (_, index) => ({ x: String(index), y: String(18 - 2 * index) })),
    graph1Points: [[9, 0], [0, 18]], graph2Points: [[0, 18], [1, 16]], graph3Points: [[4, 10], [5, 8]],
    contextIndependent: 'time since the candle was lit (hours)', contextDependent: 'height of the candle (inches)',
    contextSlopeMeaning: 'The candle gets 2 inches shorter every hour.', contextYInterceptMeaning: 'The candle is 18 inches tall when it is lit.',
    contextXInterceptMeaning: 'The candle is completely burned down after 9 hours.', contextDomain: '0 ≤ x ≤ 9',
  };
  const entries = Array.from({ length: 60 }, (_, index) => boardUndoState({ ...full, featureSlope: String(index) }));
  const kept = boundUndoEntries(entries);
  assert.ok(kept.length >= 6, `${kept.length} steps survive a refresh`);
  const record = { resetKey: 'lmr-pr-2', snapshot: mathematicalSnapshot(boardUndoState(full)), entries: kept };
  const sanitized = sanitizeWorkspaceDraftValue(record);
  assert.equal(sanitized.ok, true, sanitized.reason);
  assert.ok(sanitized.bytes < MAX_WORKSPACE_DRAFT_VALUE_BYTES, `${sanitized.bytes} bytes`);
});

test('the graph\'s Undo on a real board session keeps the later typing and the other graphs', () => {
  const states = [emptyBoard()];
  const step = (patch) => states.push({ ...states.at(-1), ...patch });
  step({ graph1Points: [[6, 0]] });
  step({ graph2Points: [[0, -3]] });
  step({ featureSlope: '1/2' });
  step({ graph2Points: [[0, -3], [2, -2]] });
  step({ featureXIntercept: '(6,0)' });
  let stack = EMPTY_MATH_UNDO_STACK;
  states.forEach((state, index) => {
    if (index) stack = recordMathUndoEntry(stack, boardUndoState(states[index - 1]), boardUndoState(state), { now: 10_000 * index });
  });
  const result = undoMathUndoChange(stack, boardUndoState(states.at(-1)), [graphUndoField('graph2')]);
  assert.deepEqual(changedBoardFields(boardUndoState(states.at(-1)), result.restored), ['graph2Points']);
  assert.deepEqual(result.restored.graph2Points, [[0, -3]]);
  assert.equal(result.restored.featureXIntercept, '(6,0)', 'the x-intercept typed after it stays');
  assert.deepEqual(result.restored.graph1Points, [[6, 0]], 'the other graph is untouched');
});
