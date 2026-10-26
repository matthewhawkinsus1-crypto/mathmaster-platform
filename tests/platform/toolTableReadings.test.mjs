/*
 * AX10: READ ALOUD READS THE TABLES A TOOL DRAWS ITSELF.
 *
 * Read aloud read the tables a question shows (QuestionVisual) and the
 * fillable table (TableGrader), and no table a tool draws itself (C2-80, B-36,
 * A1-45): the 2026-10-22 walkthrough of the Algebra I DOL #3 review heard none
 * of PR 3's table rows (D-67). Each tool now publishes its table the way those
 * two do (figureReadings.js), from the rows it draws and only while it draws
 * them (src/tools/shared/toolTableReading.js).
 *
 *   before  QuestionVisual's and TableGrader's tables.
 *   after   also the Linear Table Workbench's rows, the Data Modeling Lab's
 *           residual table, the Linear Multiple Representations board's given
 *           table and the student's table of values, and the Sequence
 *           Explorer's terms (its evidence table, the student's table, the
 *           sequence with a gap).
 *   not yet Representation Match's card tables (inside the cards' buttons,
 *           already named by them), the Regression Calculator's data table
 *           (no real item uses it), the board's process-mode row choosers.
 *
 * Each case renders the real tool (Vite SSR) and reads what it publishes
 * beside the table it draws (helpers/figureCapture.mjs). The browser half:
 * tests/browser/readAloudTranslate.mjs.
 */
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React from 'react';

import { compileAuthoringIntentV5 } from '../../src/platform/contract/authoringIntentV5.js';
import { prepareQuestionForRuntimeRouting } from '../../src/platform/algebra/algebraWorkspaceRoute.js';
import { generateQuestion } from '../../src/problemGenerator.js';
import { normalizeContextualQuestion } from '../../src/platform/context/wordProblemLayer.js';
import { questionReadingParts, tableReading } from '../../src/platform/language/questionReading.js';
import { speechTextFor } from '../../src/platform/language/speechText.js';
import { generateSequence } from '../../src/tools/sequenceExplorer/sequenceMath.js';
import esFigures from '../../src/platform/language/packs/esFigures.js';
import { figureCaptureServer } from './helpers/figureCapture.mjs';

const ROOT = new URL('../../', import.meta.url);
const lesson = (path) => JSON.parse(readFileSync(new URL(path, ROOT), 'utf8'));
// A real item as the tool receives it (QuestionEngine routes and generates it first).
const realItem = (path, questionId) => {
  const stored = compileAuthoringIntentV5(lesson(path)).package.sections.flatMap((section) => section.questions).find((entry) => entry.questionId === questionId);
  assert.ok(stored, `${questionId} is in ${path}`);
  return normalizeContextualQuestion(generateQuestion(prepareQuestionForRuntimeRouting(stored, {}), 0, null, null, null));
};
const DOL3 = 'teacher-import-jsons/algebra1-dol3/Algebra1_DOL3_Review.json';
const LMR = 'docs/assignments/Algebra1_Linear_Multiple_Representations_V5_FAMILY_UPDATED.json';

const text = (html) => html.replace(/<[^>]+>/g, '').replace(/&#x27;/g, '\'').replace(/&amp;/g, '&').trim();
// Every cell the markup's tables draw, row by row.
const drawnTables = (markup) => (markup.match(/<table[\s\S]*?<\/table>/g) || [])
  .map((table) => (table.match(/<tr[\s\S]*?<\/tr>/g) || []).map((row) => (row.match(/<t[hd][^>]*>[\s\S]*?<\/t[hd]>/g) || []).map(text)));
const tablesOf = (entries) => entries.filter((entry) => entry.kind === 'table');
const cellText = (cell) => (cell && typeof cell === 'object' ? `wrote:${cell.entered}` : String(cell));

let capture = null;
before(async () => { capture = await figureCaptureServer(); });
after(async () => { await capture?.close(); });
const renderTool = async (path, questionData) => {
  const { default: Tool } = await capture.load(path);
  return capture.render(React.createElement(Tool, { questionData, onAction: () => {} }));
};

/* ------------------------------------------------- Linear Table Workbench */

test('the Linear Table Workbench\'s rows are read as drawn, with the quantities its question names (DOL #3 review PR 3)', async () => {
  const pr3 = await renderTool('/src/tools/linearTableWorkbench/LinearTableWorkbench.jsx', realItem(DOL3, 'dol3-review-q03'));
  const [table] = tablesOf(pr3.entries);
  assert.ok(table, 'its table is published');
  // The row buttons the tool draws: "Row 1" then "(x, y)".
  const drawn = [...pr3.markup.matchAll(/>Row (\d+)<\/div><div>\(([^,]+), ([^)]+)\)<\/div>/g)].map((match) => [match[2], match[3]]);
  assert.equal(drawn.length, 4);
  assert.deepEqual(table.table.rows, drawn, 'every row, as drawn');
  assert.equal(speechTextFor(tableReading(table.table, { label: table.label })), 'A table, 4 rows. Columns: x; y. Row 1: x, negative 2; y, negative 4. Row 2: x, 2; y, 2. Row 3: x, 6; y, 8. Row 4: x, 10; y, 14.');

  const rental = await renderTool('/src/tools/linearTableWorkbench/LinearTableWorkbench.jsx', realItem(DOL3, 'dol3-review-q05'));
  const named = tablesOf(rental.entries)[0];
  assert.match(tableReading(named.table), /^A table, 4 rows\. Columns: x, Rental time \(hours\); y, Total cost \(dollars\)\. Row 1: x, 1; y, 27\./, 'each quantity said once, with its column');
});

/* ------------------------------------------------------ Data Modeling Lab */

test('the Data Modeling Lab\'s residual table is read as drawn, and only once the student\'s model draws it', async () => {
  const lineFit = realItem(DOL3, 'dol3-review-q11');
  const { markup, entries } = await renderTool('/src/tools/dataModeling/DataModelingLab.jsx', lineFit);
  const residual = tablesOf(entries).find((entry) => entry.label === 'Residual table');
  assert.ok(residual, 'published');
  const [drawn] = drawnTables(markup);
  assert.deepEqual(drawn[0], ['x', 'y', 'ŷ', 'residual']);
  assert.equal(drawn.length - 1, 10);
  assert.deepEqual(residual.table.rows.map((row) => row.map(cellText)), drawn.slice(1), 'every cell, as drawn');
  assert.deepEqual(residual.table.columns.map((column) => column.label), drawn[0]);
  // Said with the quantities, and ŷ as "y hat": the y and ŷ columns no longer sound alike.
  const said = speechTextFor(tableReading(residual.table, { label: residual.label }));
  assert.match(said, /^Residual table, 10 rows\. Columns: x, Hours studied; y, Quiz score \(points\); y hat; residual\. Row 1: x, 0\.5; y, 58; y hat, 54\.07; residual, 3\.93\./, said);

  // A model still missing a coefficient draws no residual table: none is read.
  const quadratic = { ...lineFit, mode: 'quadraticFit', startingModel: {} };
  const waiting = await renderTool('/src/tools/dataModeling/DataModelingLab.jsx', quadratic);
  assert.equal(drawnTables(waiting.markup).length, 0, 'no table drawn yet');
  assert.equal(tablesOf(waiting.entries).length, 0, 'and none read');
  const ready = await renderTool('/src/tools/dataModeling/DataModelingLab.jsx', { ...quadratic, startingModel: { a: 1, b: 2, c: 50 } });
  assert.equal(tablesOf(ready.entries).length, 1, 'drawn, and read, once the model is complete');
});

/* ------------------------------------------------------- Sequence Explorer */

test('the Sequence Explorer\'s student table is read as what the student typed — never the terms (DOL #3 review PR 13)', async () => {
  const bridge = realItem(DOL3, 'dol3-review-q13');
  const { markup, entries } = await renderTool('/src/tools/sequenceExplorer/SequenceExplorer.jsx', bridge);
  const [table] = tablesOf(entries);
  const [drawn] = drawnTables(markup);
  assert.deepEqual(table.table.rows.map((row) => row[0]), drawn[0].slice(1).map(Number), 'the term numbers drawn');
  assert.ok(table.table.rows.every((row) => row[1]?.entered === ''), 'each box: what the student typed (nothing yet)');
  const said = speechTextFor(tableReading(table.table, { label: table.label }));
  assert.match(said, /^Sequence table, 6 rows\. Columns: n, domain input; f of n, output\. Row 1: n, 1; f of n, blank\./, said);
  // The terms themselves are the answer here: none is ever a cell.
  const { sequenceSpecFromQuestion } = await capture.load('/src/tools/sequenceExplorer/sequenceMath.js');
  const terms = generateSequence(sequenceSpecFromQuestion(bridge), 6).map((row) => String(row.value));
  table.table.rows.forEach((row) => assert.ok(!terms.includes(String(row[1]?.entered ?? row[1])), `row ${row[0]}: no term`));
});

test('the Sequence Explorer\'s evidence table is read as drawn, and its gap is blank', async () => {
  const sequence = { kind: 'arithmetic', first: 3, difference: 4 };
  const analyze = await renderTool('/src/tools/sequenceExplorer/SequenceExplorer.jsx', { mode: 'analyze', sequence, targetN: 6, displayCount: 7, prompt: 'Analyze.' });
  const [evidence] = tablesOf(analyze.entries);
  const [drawn] = drawnTables(analyze.markup);
  assert.deepEqual(evidence.table.rows.map((row) => String(row[0])), drawn[0].slice(1), 'the n row drawn');
  assert.deepEqual(evidence.table.rows.map((row) => row[1]), drawn[1].slice(1), 'the terms drawn');
  assert.deepEqual(evidence.table.columns.map((column) => column.label), ['n', 'aₙ']);
  assert.equal(evidence.table.rows.length, 5, 'up to the term before the target, as drawn: the target term is not read');

  const missing = await renderTool('/src/tools/sequenceExplorer/SequenceExplorer.jsx', { mode: 'missingTerm', sequence, missingIndex: 4, prompt: 'Find the gap.' });
  const [gapped] = tablesOf(missing.entries);
  const cards = [...missing.markup.matchAll(/<strong>([^<]*)<\/strong>/g)].map((match) => match[1]).filter((value) => /^-?\d|^\?$/.test(value));
  assert.deepEqual(gapped.table.rows.map((row) => (row[1] === null ? '?' : row[1])), cards, 'each card as drawn, the gap blank');
  assert.equal(gapped.table.rows[3][1], null, 'a₄, the gap');
  assert.ok(!gapped.table.rows.some((row) => row[1] === '15'), 'the missing term (15) is never read');
  assert.match(tableReading(gapped.table), /Row 4: n, 4; aₙ, blank\./);
});

/* ------------------------------------- Linear Multiple Representations board */

test('the board\'s given table is read as drawn; the student\'s table of values, only when its card draws it', async () => {
  const given = realItem(LMR, 'lmr-pr-1');
  const { entries } = await renderTool('/src/tools/representationBridge/LinearMultipleRepresentationsBoard.jsx', given);
  const table = tablesOf(entries).find((entry) => entry.label === 'Given table of values');
  assert.deepEqual(table.table.rows, given.source.rows.map((row) => [String(row.x), String(row.y)]), 'the authored rows');
  assert.equal(speechTextFor(tableReading(table.table, { label: table.label })), 'Given table of values, 4 rows. Columns: x; y. Row 1: x, negative 1; y, 9. Row 2: x, 1; y, 7. Row 3: x, 3; y, 5. Row 4: x, 5; y, 3.');
  assert.ok(!tablesOf(entries).some((entry) => entry.label === 'Table of values'), 'the given table is not asked for again');

  // Process mode: the table card is locked until the student knows two points.
  const locked = realItem(LMR, 'lmr-cw-1');
  const lockedRender = await renderTool('/src/tools/representationBridge/LinearMultipleRepresentationsBoard.jsx', locked);
  assert.match(lockedRender.markup, /data-process-locked="table"/);
  assert.equal(tablesOf(lockedRender.entries).length, 0, 'a locked card draws, and reads, no table');

  // The whole board at once: the card draws the student's rows, read as typed.
  const open = { ...locked, interactionMode: 'board', requiredCards: ['table'] };
  const board = await renderTool('/src/tools/representationBridge/LinearMultipleRepresentationsBoard.jsx', open);
  const student = tablesOf(board.entries).find((entry) => entry.label === 'Table of values');
  const inputs = (board.markup.match(/aria-label="Row \d+ [xy]"/g) || []).length;
  assert.ok(student && inputs > 0, 'drawn and published');
  assert.equal(student.table.rows.length * 2, inputs, 'one row per drawn row');
  assert.ok(student.table.rows.flat().every((cell) => cell?.entered === ''), 'what the student typed: nothing yet');
  assert.match(tableReading({ ...student.table, rows: [[{ entered: '0' }, { entered: '6' }], [{ entered: '' }, { entered: '' }]] }), /Row 1: x, you wrote 0; y, you wrote 6\. Row 2: x, blank; y, blank\./);
});

/* ------------------------------------------------------- in the reading */

test('a tool\'s table is a part of the question\'s reading, named in the reading\'s language', () => {
  const table = { columns: [{ key: 'x', label: 'x', name: 'Hours studied' }, { key: 'predicted', label: 'ŷ' }], rows: [[1, 4.5]] };
  const parts = questionReadingParts({ prompt: 'Fit a line.' }, { figures: [{ kind: 'table', label: 'Residual table', table }] });
  assert.equal(parts.find((part) => part.kind === 'table').text, 'Residual table, 1 row. Columns: x, Hours studied; ŷ. Row 1: x, 1; ŷ, 4.5.');
  const spanish = questionReadingParts({ prompt: 'Ajusta una recta.' }, { figures: [{ kind: 'table', label: 'Residual table', table }], language: 'es', figurePack: esFigures });
  const part = spanish.find((entry) => entry.kind === 'table');
  assert.equal(part.label, 'Tabla de residuos');
  assert.equal(speechTextFor(part.text, { language: 'es' }), 'Tabla de residuos, de 1 fila. Columnas: x, Hours studied; y gorro. Fila 1: x, 1; y gorro, 4.5.');
});
