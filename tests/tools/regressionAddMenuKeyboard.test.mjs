import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import regressionCalculatorGrader, {
  buildRegressionCalculatorWork,
} from '../../functions/shared/serverGrading/tools/regressionCalculator.mjs';
import { regressionCalculatorStats } from '../../functions/shared/toolMath/regressionCalculator/regressionCalculatorMath.mjs';
import { gradeToolCheck } from '../../src/tools/shared/sharedToolGrading.js';
import {
  ADD_MENU_ITEMS,
  addMenuEnabled,
  addMenuMoveIndex,
  addMenuOpenIndex,
  resolveAddMenuChoice,
} from '../../src/tools/regressionCalculator/regressionAddMenu.js';
import { executableSource, region } from '../platform/helpers/sourceContract.mjs';

/*
 * REGRESSION CALCULATOR "ADD ITEM" MENU BY KEYBOARD (KEYBOARD_SWEEP.md T5).
 *
 * The menu follows the menu-button pattern, and a keyboard choice must record
 * exactly the state a click records — so it grades exactly the same on the
 * shared grader the server runs. The component calls these pure helpers for
 * both routes; the last test pins that wiring.
 */

const QUESTION = {
  prompt: 'Use the source data to calculate and interpret r.',
  sourceData: [[1, 3], [2, 5], [3, 6], [4, 9], [5, 10]],
  requireInterpretation: true,
};

const counterIds = () => {
  let n = 0;
  return () => `id-${(n += 1)}`;
};

// A keyboard user: open from the trigger with `openKey`, press `moves`, then
// Enter on whatever item has focus. Returns the item Enter chooses.
const keyboardChoice = (rows, openKey, moves) => {
  const enabled = addMenuEnabled(rows);
  let index = addMenuOpenIndex(openKey, enabled);
  for (const key of moves) {
    const next = addMenuMoveIndex(key, index, enabled);
    if (next !== null) index = next;
  }
  return ADD_MENU_ITEMS[index];
};

// The calculator state the component keeps, driven through one Add Item choice
// and then the same table entry, regression and interpretation for both routes.
const finishWork = (choice) => {
  const makeId = counterIds();
  const start = [{ id: makeId(), type: 'expression', value: '' }];
  const outcome = resolveAddMenuChoice(choice, { rows: start, selectedId: start[0].id, sourceLength: QUESTION.sourceData.length, makeId });
  const rows = outcome.rows.map((row) => (row.type === 'table'
    ? { ...row, rows: [...QUESTION.sourceData.map(([x, y]) => [String(x), String(y)]), ['', '']] }
    : row));
  const processEvidence = outcome.events.map(([type, detail]) => ({ type, ...detail }));
  const table = rows.find((row) => row.type === 'table');
  const tablePoints = table ? table.rows.filter((pair) => pair.every((cell) => cell !== '')).map(([x, y]) => [Number(x), Number(y)]) : [];
  const stats = tablePoints.length >= 2 ? regressionCalculatorStats(tablePoints) : null;
  const run = stats ? { operation: 'linearRegression', table: tablePoints, ...stats, r2: stats.r ** 2 } : null;
  if (run) processEvidence.push({ type: 'regressionExecuted', operation: 'linearRegression' }, { type: 'correlationProduced', value: stats.r });
  const state = { rows, selectedId: outcome.selectedId, notice: outcome.notice, run, direction: 'positive', strength: 'strong', processEvidence };
  const work = buildRegressionCalculatorWork({ table: tablePoints, regressionRun: run, direction: 'positive', strength: 'strong', processEvidence });
  return { state, grade: gradeToolCheck(regressionCalculatorGrader, QUESTION, work) };
};

test('opening the menu focuses the first item; ArrowUp on the trigger focuses the last enabled', () => {
  const fresh = addMenuEnabled([{ id: 'a', type: 'expression', value: '' }]);
  assert.deepEqual(fresh, [true, true, false], 'inference is never choosable; table is until one exists');
  assert.equal(addMenuOpenIndex(null, fresh), 0);
  assert.equal(addMenuOpenIndex('Enter', fresh), 0);
  assert.equal(addMenuOpenIndex('ArrowDown', fresh), 0);
  assert.equal(addMenuOpenIndex('ArrowUp', fresh), 1);
  const withTable = addMenuEnabled([{ id: 't', type: 'table', rows: [] }]);
  assert.deepEqual(withTable, [true, false, false]);
  assert.equal(addMenuOpenIndex('ArrowUp', withTable), 0);
});

test('arrows wrap over enabled items only; Home and End; other keys do not move', () => {
  const enabled = [true, true, false];
  assert.equal(addMenuMoveIndex('ArrowDown', 0, enabled), 1);
  assert.equal(addMenuMoveIndex('ArrowDown', 1, enabled), 0, 'wraps past the disabled inference item');
  assert.equal(addMenuMoveIndex('ArrowUp', 0, enabled), 1, 'wraps upward');
  assert.equal(addMenuMoveIndex('ArrowUp', 1, enabled), 0);
  assert.equal(addMenuMoveIndex('Home', 1, enabled), 0);
  assert.equal(addMenuMoveIndex('End', 0, enabled), 1);
  assert.equal(addMenuMoveIndex('Enter', 0, enabled), null);
  assert.equal(addMenuMoveIndex('a', 0, enabled), null);
  assert.equal(addMenuMoveIndex('ArrowDown', 0, [true, false, false]), 0, 'a single enabled item stays put');
});

test('choosing "table" by keyboard records the same state and the same grade as clicking it', () => {
  const rows = [{ id: 'x', type: 'expression', value: '' }];
  assert.equal(keyboardChoice(rows, 'ArrowDown', ['ArrowDown']), 'table');
  assert.equal(keyboardChoice(rows, 'ArrowUp', []), 'table');
  assert.equal(keyboardChoice(rows, null, ['End']), 'table');

  const pointer = finishWork('table');
  const keyboard = finishWork(keyboardChoice(rows, 'Enter', ['ArrowDown', 'ArrowDown', 'ArrowUp']));
  assert.deepEqual(keyboard.state, pointer.state);
  assert.deepEqual(keyboard.grade, pointer.grade);
  // The route reached a real, gradable table: not a vacuous match of two empties.
  assert.equal(pointer.grade.isCorrect, true);
  assert.equal(pointer.state.rows[0].type, 'table', 'the selected blank expression row became the table');
  assert.deepEqual(pointer.state.processEvidence[0], { type: 'tableCreated', fromAddMenu: true });
});

test('choosing "expression" by keyboard records the same state as clicking it', () => {
  const rows = [{ id: 'x', type: 'expression', value: '' }];
  assert.equal(keyboardChoice(rows, 'Enter', []), 'expression');
  assert.equal(keyboardChoice(rows, 'ArrowDown', ['ArrowDown', 'ArrowDown']), 'expression');
  const filled = [{ id: 'x', type: 'expression', value: '(1,2)' }];
  const pointer = resolveAddMenuChoice('expression', { rows: filled, makeId: counterIds() });
  const keyboard = resolveAddMenuChoice(keyboardChoice(filled, 'ArrowDown', []), { rows: filled, makeId: counterIds() });
  assert.deepEqual(keyboard, pointer);
  assert.equal(pointer.rows.length, 2);
  assert.deepEqual(pointer.events, [['expressionAdded', {}]]);
  // An existing blank expression is reused, not duplicated.
  const reuse = resolveAddMenuChoice('expression', { rows, makeId: counterIds() });
  assert.equal(reuse.rows, rows);
  assert.equal(reuse.focusId, 'x');
});

test('a second table is never created', () => {
  const rows = [{ id: 't', type: 'table', rows: [['1', '2']] }, { id: 'e', type: 'expression', value: '' }];
  assert.equal(resolveAddMenuChoice('table', { rows, makeId: counterIds() }), null);
  assert.notEqual(keyboardChoice(rows, 'ArrowUp', ['ArrowDown', 'End']), 'table');
});

test('the component drives both routes through these helpers and follows the menu-button pattern', () => {
  const source = executableSource(readFileSync(new URL('../../src/tools/regressionCalculator/RegressionCalculator.jsx', import.meta.url), 'utf8'));
  const choose = region(source, 'const chooseAddItem = (choice) => {', 'const addExpression');
  assert.match(choose, /resolveAddMenuChoice\(choice,/);
  assert.match(source, /role="menuitem" tabIndex=\{-1\} onClick=\{addExpression\}/);
  assert.match(source, /role="menuitem" tabIndex=\{-1\} onClick=\{addBlankTable\}/);
  const menuKeys = region(source, 'const onAddMenuKeyDown = (event) => {', '\n  };');
  assert.match(menuKeys, /'Escape'[\s\S]*closeAddMenu\(\{ returnFocus: true \}\)/);
  assert.match(menuKeys, /'Tab'[\s\S]*setAddMenuOpen\(false\)/);
  assert.match(menuKeys, /addMenuMoveIndex\(event\.key/);
  assert.match(source, /role="menu"[^>]*onKeyDown=\{onAddMenuKeyDown\}/);
  assert.match(source, /onKeyDown=\{onAddTriggerKeyDown\}/);
});
