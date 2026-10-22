/*
 * A SORT CARD THAT IS A TABLE OF VALUES.
 *
 * "Is this relation a function?" is asked of words, graphs, equations and,
 * just as often, a table. The Open Sort Board could show a card as text or a
 * graph but not as a table, so a table had to be flattened into a sentence of
 * ordered pairs, where the repeated input the student is meant to notice is
 * easy to miss.
 *
 * A card may now carry `table: { x: [...], y: [...] }`. The board draws it as
 * a two-row table of inputs and outputs, in the card's own button, in the
 * reading order a screen reader follows. Pre-Flight refuses a table the board
 * cannot draw, naming the card. Grading is untouched: a card is still sorted
 * by its id.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { compileTeacherImport } from '../../scripts/check-teacher-import.mjs';
import { validateToolQuestion } from '../../src/tools/toolSchemas.js';
import {
  SORT_CARD_TABLE_MAX_COLUMNS,
  sortCardTable,
  validateSortQuestion,
} from '../../functions/shared/toolMath/openSortBoard/openSortMath.mjs';

// Outside the repository: lint scans the tree.
const VITE_CACHE = join(tmpdir(), 'mathmaster-vite-ssr');

const SORT = {
  questionId: 'sort-tables',
  standard: 'A.12A',
  studentActions: ['sortIntoOwnGroups'],
  prompt: 'Sort the relations into two groups: functions and relations that are not functions. Name each group and explain your rule.',
  items: [
    { id: 'repeat', label: 'Card A', table: { x: [-2, 0, 3, 3], y: [5, 1, 4, -4] } },
    { id: 'constant', label: 'Card B', text: 'Monthly fee', table: { x: [1, 2, 3, 4], y: [6, 6, 6, 6] } },
    { id: 'vertical', label: 'Card C', text: 'Equation: x = 4' },
    { id: 'line', label: 'Card D', text: 'Equation: y = 2x + 1' },
  ],
  validSchemes: [{
    id: 'functionOrNot',
    groups: [{ id: 'function', itemIds: ['constant', 'line'] }, { id: 'notFunction', itemIds: ['repeat', 'vertical'] }],
  }],
  minGroups: 2,
  maxGroups: 2,
};

const importOf = (question) => JSON.stringify({
  schemaVersion: 5,
  assignment: { title: 'Sort tables', courseId: 'algebra1' },
  sections: [{ id: 'sort-practice', role: 'practice', title: 'Practice', questions: [question] }],
});
const withTable = (id, table) => ({ ...SORT, items: SORT.items.map((item) => (item.id === id ? { ...item, table } : item)) });

const decode = (text) => text.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&');
// A card's markup, from the element that carries its id to the end of it.
const cardMarkup = (html, id) => {
  const start = html.indexOf(`data-sort-card="${id}"`);
  assert.notEqual(start, -1, `card ${id} is on the board`);
  const open = html.lastIndexOf('<button', start);
  return html.slice(open, html.indexOf('</button>', start) + '</button>'.length);
};
const tableCells = (markup) => {
  const table = markup.match(/<span[^>]*data-sort-card-table="true"[^>]*>([\s\S]*)<\/span>/);
  return table ? [...table[1].matchAll(/<span[^>]*>([^<]*)<\/span>/g)].map(([, cell]) => decode(cell)) : null;
};

/* ------------------------------------------------------------ the table -- */

test('a card table is read column by column: numbers and short written values, with a true minus sign', () => {
  assert.deepEqual(sortCardTable({ x: [-2, 0, 3, 3], y: [5, 1, 4, -4] }), { x: ['−2', '0', '3', '3'], y: ['5', '1', '4', '−4'] });
  assert.deepEqual(sortCardTable({ x: ['1/2', ' 3 ', '-1'], y: ['a', 'b', 'c'] }), { x: ['1/2', '3', '−1'], y: ['a', 'b', 'c'] });
  assert.deepEqual(sortCardTable({ x: [0.5], y: [-0.25] }), { x: ['0.5'], y: ['−0.25'] });
  const widest = Array.from({ length: SORT_CARD_TABLE_MAX_COLUMNS }, (_, index) => index);
  assert.deepEqual(sortCardTable({ x: widest, y: widest }).x.length, SORT_CARD_TABLE_MAX_COLUMNS);

  // Not a table the card can draw.
  for (const [table, why] of [
    [null, 'no table'],
    [[[1, 2], [3, 4]], 'rows instead of columns'],
    ['x: 1, 2', 'words'],
    [{ x: [1, 2], y: [3] }, 'an input without an output'],
    [{ x: [1, 2] }, 'no outputs at all'],
    [{ x: [], y: [] }, 'empty'],
    [{ x: [...widest, 8], y: [...widest, 8] }, 'too wide for a card'],
    [{ x: [1, Number.NaN], y: [1, 2] }, 'not a number'],
    [{ x: [1, Infinity], y: [1, 2] }, 'not a finite number'],
    [{ x: [1, 'thirteen chars'], y: [1, 2] }, 'a value too long for a cell'],
    [{ x: [1, ''], y: [1, 2] }, 'a blank cell'],
    [{ x: [1, { n: 2 }], y: [1, 2] }, 'an object'],
  ]) assert.equal(sortCardTable(table), null, why);
});

test('Pre-Flight refuses a table the board cannot draw, and names the card', () => {
  assert.deepEqual(validateSortQuestion(SORT), [], 'the drawable tables add nothing');
  const [problem] = validateSortQuestion(withTable('constant', { x: [1, 2, 3], y: [6, 6] }));
  assert.match(problem, /item 2 \(constant\) table/);
  assert.ok(validateToolQuestion({ ...withTable('repeat', { x: [1], y: ['far too long a value'] }), type: 'openSortBoard' }).errors.some((error) => /item 1 \(repeat\) table/.test(error)));

  const compiled = compileTeacherImport(importOf(SORT));
  assert.deepEqual(compiled.model.errors, []);
  const [question] = compiled.questions;
  assert.deepEqual(question.items.find((item) => item.id === 'repeat').table, SORT.items[0].table, 'the import keeps the table on the card');

  const refused = compileTeacherImport(importOf(withTable('constant', { x: [1, 2, 3], y: [6, 6] })));
  assert.equal(refused.model.isValid, false);
  assert.ok(refused.model.errors.some((error) => /item 2 \(constant\) table/.test(error)), JSON.stringify(refused.model.errors));
});

/* ---------------------------------------------------------- the board -- */

test('the board draws a table card as inputs over outputs, inside the card, after the card\'s own words', async () => {
  const [question] = compileTeacherImport(importOf(SORT)).questions;
  const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent', cacheDir: VITE_CACHE });
  try {
    const { default: OpenSortBoard } = await server.ssrLoadModule('/src/tools/openSortBoard/OpenSortBoard.jsx');
    const html = renderToStaticMarkup(React.createElement(OpenSortBoard, { questionData: question }));

    const repeat = cardMarkup(html, 'repeat');
    // The order a screen reader reads the card in: the inputs, then the outputs.
    assert.deepEqual(tableCells(repeat), ['x', '−2', '0', '3', '3', 'y', '5', '1', '4', '−4']);
    // One header column and one column per value, so the two rows line up.
    assert.match(repeat, /grid-template-columns:auto repeat\(4, auto\)/);
    // The card is a button: only phrasing content is valid in it.
    assert.doesNotMatch(repeat.slice(repeat.indexOf('data-sort-card-table')), /<(table|tr|td|th|div|p)\b/);

    const constant = cardMarkup(html, 'constant');
    const text = decode(constant);
    assert.ok(text.indexOf('Monthly fee') !== -1 && text.indexOf('Monthly fee') < text.indexOf('x1234'), 'the card\'s words, then its table');
    assert.deepEqual(tableCells(constant), ['x', '1', '2', '3', '4', 'y', '6', '6', '6', '6']);

    // A card without a table is drawn as it always was.
    const vertical = cardMarkup(html, 'vertical');
    assert.equal(tableCells(vertical), null);
    assert.ok(decode(vertical).includes('Equation: x = 4'));

    // A teacher-controlled sort shows the same card above its category buttons.
    const controlled = renderToStaticMarkup(React.createElement(OpenSortBoard, {
      questionData: { ...question, mode: 'controlled', categories: [{ id: 'function', label: 'Function' }, { id: 'notFunction', label: 'Not a function' }] },
    }));
    const cells = controlled.match(/<span[^>]*data-sort-card-table="true"[^>]*>[\s\S]*?<\/span><\/span>/g) || [];
    assert.equal(cells.length, 2, 'both table cards');
    assert.deepEqual(tableCells(cells[0]), ['x', '−2', '0', '3', '3', 'y', '5', '1', '4', '−4']);
  } finally {
    await server.close();
  }
});
