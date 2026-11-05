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
 *           sequence with a gap); and, in a second slice, the Regression
 *           Calculator's table (what the student typed, and its source data
 *           where the screen lists it) and the board's process-mode row
 *           choosers (the rows, and which the student chose) and extended
 *           table. Under an authored Spanish translation those two are read in
 *           Spanish too (AX05, slice 2): the table under its Spanish name, the
 *           chooser from its own messages, with the rows' values as drawn.
 *   not yet Representation Match's card tables (inside the cards' buttons,
 *           already named by them; how to read a button is the owner's
 *           decision), and the process mode's point choosers and method chips
 *           (the same decision).
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
import { sayFigure } from '../../src/platform/language/figureSay.js';
import { figureCaptureServer } from './helpers/figureCapture.mjs';
import { withBrowser } from './helpers/studentToolRender.mjs';

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
// A tool as it draws once the student has done some work: the draft-backed
// fields it restores from are written to a browser's storage first, as a real
// student's keystrokes would have written them.
let readers = 0;
const renderSeeded = async (path, questionData, fields) => {
  const { buildQuestionDraftKey, writeQuestionDraft } = await capture.load('/src/questionDraftStorage.js');
  const { ToolDraftScopeProvider, toolDraftKey } = await capture.load('/src/tools/shared/usePersistentToolState.js');
  const { default: Tool } = await capture.load(path);
  readers += 1;
  const draftKey = buildQuestionDraftKey({ studentId: `reader-${readers}`, assignmentId: 'tool-tables', questionIndex: 0 });
  return withBrowser(() => {
    writeQuestionDraft(toolDraftKey(draftKey), fields, { edit: true });
    return capture.render(React.createElement(ToolDraftScopeProvider, { draftKey }, React.createElement(Tool, { questionData, onAction: () => {} })));
  });
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


/* ---------------------------------------------- Regression Calculator (AX10, slice 2) */

const REGRESSION = '/src/tools/regressionCalculator/RegressionCalculator.jsx';
const regressionItem = (extra = {}) => ({
  type: 'regressionCalculator',
  prompt: 'Enter the data, run linear regression, and say what the correlation means.',
  sourceData: [[1, 2], [2, 4], [3, 5], [4, 8]],
  ...extra,
});
// What the calculator's table draws in its boxes, in reading order: "x row 1", "y row 1", "x row 2", …
const drawnBoxes = (markup) => [...markup.matchAll(/aria-label="[xy] row \d+"[^>]*?value="([^"]*)"/g)].map((match) => match[1]);

test('the Regression Calculator\'s table is read as the student typed it, under the headings it draws', async () => {
  // No table until the student adds one: nothing of theirs to read.
  const before = await renderTool(REGRESSION, regressionItem({ sourceMode: 'data' }));
  assert.ok(!tablesOf(before.entries).some((entry) => entry.label === 'Table of values'), 'no table drawn, none read');

  const rows = [['1', '2'], ['2', ''], ['', '']];
  const { markup, entries } = await renderSeeded(REGRESSION, regressionItem({ sourceMode: 'data' }), {
    rows: [{ id: 'table', type: 'table', rows }, { id: 'expression', type: 'expression', value: '' }],
  });
  const table = tablesOf(entries).find((entry) => entry.label === 'Table of values');
  assert.ok(table, 'published beside the table it draws');
  assert.deepEqual(table.table.columns.map((column) => column.label), ['x₁', 'y₁'], 'the headings the table draws');
  const boxes = drawnBoxes(markup);
  assert.equal(boxes.length, 6, 'three rows of two boxes');
  assert.deepEqual(table.table.rows.flat().map((cell) => cell.entered), boxes, 'every box, as the student typed it');
  assert.equal(
    speechTextFor(tableReading(table.table, { label: table.label })),
    'Table of values, 3 rows. Columns: x sub 1; y sub 1. Row 1: x sub 1, you wrote 1; y sub 1, you wrote 2. Row 2: x sub 1, you wrote 2; y sub 1, blank. Row 3: x sub 1, blank; y sub 1, blank.',
  );
  // The source data is the question's, not the student's: it never fills a box.
  assert.ok(table.table.rows.flat().every((cell) => cell && typeof cell === 'object'), 'every cell is the student\'s own');
});

test('the Regression Calculator\'s source data is read only where the screen lists it — never beside the scatterplot the student reads it from', async () => {
  const data = await renderTool(REGRESSION, regressionItem({ sourceMode: 'data' }));
  const listed = [...data.markup.matchAll(/<span>\(([^,]+), ([^)]+)\)<\/span>/g)].map((match) => [match[1], match[2]]);
  assert.equal(listed.length, 4);
  const given = tablesOf(data.entries).find((entry) => entry.label === 'Given table of values');
  assert.ok(given, 'the listed pairs are published');
  assert.deepEqual(given.table.rows.map((row) => row.map(String)), listed, 'every pair, as listed');
  assert.equal(speechTextFor(tableReading(given.table, { label: given.label })), 'Given table of values, 4 rows. Columns: x; y. Row 1: x, 1; y, 2. Row 2: x, 2; y, 4. Row 3: x, 3; y, 5. Row 4: x, 4; y, 8.');

  // A source scatterplot IS the data: the student reads each point off the graph and types it in.
  const plot = await renderTool(REGRESSION, regressionItem({ sourceMode: 'scatterplot', sourceGraphBounds: { xMin: 0, xMax: 5, yMin: 0, yMax: 9 } }));
  assert.doesNotMatch(plot.markup, /Source data/, 'the screen lists no pairs');
  assert.equal(tablesOf(plot.entries).length, 0, 'so none is read');
  // The source plane says where it withholds the positions; the student's own plane has nothing plotted yet.
  const plane = plot.entries.filter((entry) => entry.kind === 'figure');
  assert.ok(plane.some((entry) => /Positions are not read out/.test(entry.text)), `the plane says where it withholds: ${plane.map((entry) => entry.text)}`);
  assert.ok(plane.every((entry) => !/\(\s*[0-9.-]+\s*,\s*[0-9.-]+\s*\)/.test(entry.text)), 'no point of the source data is spoken');
  // …and what they type from it is theirs, so it is read back.
  const typed = await renderSeeded(REGRESSION, regressionItem({ sourceMode: 'scatterplot', sourceGraphBounds: { xMin: 0, xMax: 5, yMin: 0, yMax: 9 } }), {
    rows: [{ id: 'table', type: 'table', rows: [['1', '2'], ['', '']] }],
  });
  assert.deepEqual(tablesOf(typed.entries).map((entry) => entry.label), ['Table of values']);
});

/* ------------------------------ the board's process-mode choosers (AX10, slice 2) */

const BOARD = '/src/tools/representationBridge/LinearMultipleRepresentationsBoard.jsx';
// The board with a process workspace open on one method, and the work the student has in it.
const processBoard = async (question, { target, strategy, work = {} }) => {
  const { deriveLinearMultipleRepresentations } = await capture.load('/src/tools/representationBridge/linearMultipleRepresentationsMath.js');
  const { lmrProcessEnvironment } = await capture.load('/src/tools/representationBridge/lmrProcessMath.js');
  const environment = lmrProcessEnvironment(question, deriveLinearMultipleRepresentations(question));
  const option = `${strategy}@given`;
  return renderSeeded(BOARD, question, {
    processDraft: { bind: environment.binding, open: target, method: { [target]: option }, work: { [`${target}|${option}`]: work }, tries: {} },
  });
};
// What each row's Choose button says, by row: "Row 2, chosen as row 1".
const drawnChoices = (markup) => [...markup.matchAll(/<button\b[^>]*>/g)]
  .map((match) => match[0])
  .filter((tag) => /data-process-row="\d+"/.test(tag))
  .map((tag) => /aria-label="([^"]*)"/.exec(tag)[1]);
const chooserOf = (entries) => entries.find((entry) => entry.kind === 'figure' && entry.label === 'Rows to choose from');
const READING_OF = (entries) => entries.map((entry) => (entry.kind === 'figure' ? entry.text : ''));
// A table with a row on each axis, so "read it from the table" is offered too.
const withAxisRows = (item) => ({ ...item, source: { kind: 'table', rows: [{ x: -1, y: 1 }, { x: 0, y: 3 }, { x: 1, y: 5 }, { x: 2, y: 7 }] } });

test('the board\'s row chooser is read as it is drawn: what it asks, every row, and the rows the student has chosen', async () => {
  const item = realItem(LMR, 'lmr-pr-1');
  const none = await processBoard(item, { target: 'slope', strategy: 'tableDelta' });
  assert.ok(chooserOf(none.entries), 'published beside the chooser it draws');
  assert.deepEqual(drawnChoices(none.markup), ['Row 1', 'Row 2', 'Row 3', 'Row 4'], 'four rows, none chosen');
  assert.match(chooserOf(none.entries).text, /^Choose two rows: row 1, then row 2\. Row 1: x, -1; y, 9\. Row 2: x, 1; y, 7\. Row 3: x, 3; y, 5\. Row 4: x, 5; y, 3\. None is chosen yet\.$/);

  // Rows 2 and 4, in that order: each button says so, and so does the reading.
  const { markup, entries } = await processBoard(item, { target: 'slope', strategy: 'tableDelta', work: { r1: 1, r2: 3 } });
  const drawn = drawnChoices(markup);
  assert.deepEqual(drawn, ['Row 1', 'Row 2, chosen as row 1', 'Row 3', 'Row 4, chosen as row 2']);
  const said = chooserOf(entries).text;
  drawn.forEach((label, index) => {
    const [x, y] = [item.source.rows[index].x, item.source.rows[index].y];
    const note = /, (chosen.*)$/.exec(label)?.[1];
    assert.ok(said.includes(`Row ${index + 1}: x, ${x}; y, ${y}${note ? `; ${note}` : ''}.`), `row ${index + 1} is read as its button names it: ${said}`);
  });
  assert.ok(!/None is chosen yet/.test(said));
  // Said in words, as Read aloud says it.
  const part = questionReadingParts({ prompt: 'Build the line.' }, { figures: [chooserOf(entries)] }).find((entry) => entry.kind === 'figure');
  assert.equal(part.label, 'Rows to choose from');
  assert.equal(speechTextFor(part.text), 'Rows to choose from. Choose two rows: row 1, then row 2. Row 1: x, negative 1; y, 9. Row 2: x, 1; y, 7; chosen as row 1. Row 3: x, 3; y, 5. Row 4: x, 5; y, 3; chosen as row 2.');

  // One row to choose (a row as a point): "chosen", and no number to say.
  const single = await processBoard(item, { target: 'point', strategy: 'tableRow', work: { row: 2 } });
  assert.deepEqual(drawnChoices(single.markup), ['Row 1', 'Row 2', 'Row 3, chosen', 'Row 4']);
  assert.match(chooserOf(single.entries).text, /^Choose a row to use as a point on the line\. Row 1: x, -1; y, 9\. Row 2: x, 1; y, 7\. Row 3: x, 3; y, 5; chosen\. Row 4: x, 5; y, 3\.$/);
});

test('the row chooser never says which row is right: the same words whatever the question asks, and a pick only as a pick', async () => {
  const item = withAxisRows(realItem(LMR, 'lmr-pr-1'));
  // Where does the line meet the y-axis? Row 2 (x = 0) is the answer. Nothing says so.
  const asked = await processBoard(item, { target: 'yIntercept', strategy: 'tableRead' });
  const unpicked = chooserOf(asked.entries).text;
  assert.equal(unpicked, 'Choose the row where the line meets the y-axis. Row 1: x, -1; y, 1. Row 2: x, 0; y, 3. Row 3: x, 1; y, 5. Row 4: x, 2; y, 7. None is chosen yet.');
  const wrong = chooserOf((await processBoard(item, { target: 'yIntercept', strategy: 'tableRead', work: { row: 0 } })).entries).text;
  const right = chooserOf((await processBoard(item, { target: 'yIntercept', strategy: 'tableRead', work: { row: 1 } })).entries).text;
  // A pick changes only its own row's line, the same way for the right row as for the wrong one.
  assert.equal(wrong, unpicked.replace('Row 1: x, -1; y, 1.', 'Row 1: x, -1; y, 1; chosen.').replace(' None is chosen yet.', ''));
  assert.equal(right, unpicked.replace('Row 2: x, 0; y, 3.', 'Row 2: x, 0; y, 3; chosen.').replace(' None is chosen yet.', ''));
  [unpicked, wrong, right].forEach((said) => assert.doesNotMatch(said, /right|correct|wrong|answer|intercept is|✓|✗/i, 'no verdict, no answer'));
});

test('a table the student extends is read as the given rows, then what they typed — never the row they are to find', async () => {
  const item = realItem(LMR, 'lmr-pr-1');
  const none = await processBoard(item, { target: 'yIntercept', strategy: 'extendTable' });
  assert.equal(tablesOf(none.entries).filter((entry) => entry.label === 'Table to extend').length, 1);
  const { markup, entries } = await processBoard(item, { target: 'yIntercept', strategy: 'extendTable', work: { rows: [{ x: '0', y: '' }, { x: '', y: '' }] } });
  const table = tablesOf(entries).find((entry) => entry.label === 'Table to extend');
  const inputs = [...markup.matchAll(/data-process-extend="(\d+):([xy])"[^>]*?value="([^"]*)"|value="([^"]*)"[^>]*?data-process-extend="(\d+):([xy])"/g)];
  assert.equal(inputs.length, 4, 'two new rows of two boxes');
  assert.deepEqual(drawnTables(markup)[0].slice(1, 5).map((row) => row.map((cell) => cell)).length, 4, 'the given rows are drawn above the new ones');
  assert.equal(table.table.rows.length, 6, 'the four given rows, then the two new ones');
  assert.deepEqual(table.table.rows.slice(0, 4), item.source.rows.map((row) => [String(row.x), String(row.y)]), 'the given rows, as drawn');
  assert.deepEqual(table.table.rows.slice(4), [[{ entered: '0' }, { entered: '' }], [{ entered: '' }, { entered: '' }]], 'a new row is what the student typed, or blank');
  assert.equal(
    speechTextFor(tableReading(table.table, { label: table.label })),
    'Table to extend, 6 rows. Columns: x; y. Row 1: x, negative 1; y, 9. Row 2: x, 1; y, 7. Row 3: x, 3; y, 5. Row 4: x, 5; y, 3. Row 5: x, you wrote 0; y, blank. Row 6: x, blank; y, blank.',
  );
});

test('a chooser is read only while its workspace is open, and in the reading\'s language when it is not English', async () => {
  const item = realItem(LMR, 'lmr-pr-1');
  const closed = await renderTool(BOARD, item);
  assert.ok(!chooserOf(closed.entries), 'no workspace open, no chooser drawn, none read');
  assert.ok(!tablesOf(closed.entries).some((entry) => entry.label === 'Table to extend'));

  const picked = await processBoard(item, { target: 'slope', strategy: 'tableDelta', work: { r1: 1, r2: 3 } });
  const extending = await processBoard(item, { target: 'yIntercept', strategy: 'extendTable', work: { rows: [{ x: '0', y: '' }] } });
  const figures = [chooserOf(picked.entries), tablesOf(extending.entries).find((entry) => entry.label === 'Table to extend')];
  const spanish = questionReadingParts({ prompt: 'Construye la recta.' }, { figures, language: 'es', figurePack: esFigures });
  // In Spanish (AX05, slice 2): what it asks, every row as drawn and the
  // student's picks, with no note that it is in English.
  const chooser = spanish.find((entry) => entry.kind === 'figure');
  assert.equal(chooser.label, 'Filas para elegir');
  assert.equal(
    speechTextFor(chooser.text, { language: 'es' }),
    'Filas para elegir. Elige dos filas: primero la fila 1 y luego la fila 2. Fila 1: x, negativo 1; y, 9. Fila 2: x, 1; y, 7; elegida como fila 1. Fila 3: x, 3; y, 5. Fila 4: x, 5; y, 3; elegida como fila 2.',
  );
  // A table is read in the reading's own words for rows, boxes and blanks, under its Spanish name.
  const table = spanish.find((entry) => entry.kind === 'table');
  assert.equal(table.label, 'Tabla para continuar');
  assert.equal(speechTextFor(table.text, { language: 'es' }), 'Tabla para continuar, de 5 filas. Columnas: x; y. Fila 1: x, negativo 1; y, 9. Fila 2: x, 1; y, 7. Fila 3: x, 3; y, 5. Fila 4: x, 5; y, 3. Fila 5: x, escribiste 0; y, en blanco.');
  // In English, unchanged.
  const english = questionReadingParts({ prompt: 'Build the line.' }, { figures, figurePack: esFigures });
  assert.deepEqual(english.filter((entry) => entry.kind !== 'prompt').map((entry) => entry.label), ['Rows to choose from', 'Table to extend']);
  assert.match(english.find((entry) => entry.kind === 'figure').text, /^Rows to choose from\. Choose two rows: row 1, then row 2\. Row 1: x, -1; y, 9\./);
  // The pack's own names for the two Regression Calculator tables are reused.
  const named = questionReadingParts({ prompt: 'Ajusta una recta.' }, {
    figures: [
      { kind: 'table', label: 'Given table of values', table: { columns: [{ key: 'x', label: 'x' }, { key: 'y', label: 'y' }], rows: [[1, 2]] } },
      { kind: 'table', label: 'Table of values', table: { columns: [{ key: 'x', label: 'x₁' }, { key: 'y', label: 'y₁' }], rows: [[{ entered: '1' }, { entered: '' }]] } },
    ],
    language: 'es',
    figurePack: esFigures,
  }).filter((entry) => entry.kind === 'table');
  assert.deepEqual(named.map((entry) => entry.label), ['Tabla de valores dada', 'Tabla de valores']);
});

test('every question a row chooser asks is said in Spanish as the screen asks it, with the rows as drawn and never which is right', async () => {
  // y = x + 1, with a row on each axis, so every question is offered.
  const item = { ...realItem(LMR, 'lmr-pr-1'), source: { kind: 'table', rows: [{ x: -1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 2 }, { x: 2, y: 3 }] } };
  const cases = [
    [{ target: 'slope', strategy: 'tableDelta', work: { r1: 3, r2: 0 } }, 'Elige dos filas: primero la fila 1 y luego la fila 2.'],
    [{ target: 'xIntercept', strategy: 'tableRead' }, 'Elige la fila donde la recta toca el eje x.'],
    [{ target: 'yIntercept', strategy: 'tableRead', work: { row: 1 } }, 'Elige la fila donde la recta toca el eje y.'],
    [{ target: 'point', strategy: 'tableRow', work: { row: 2 } }, 'Elige una fila para usarla como un punto de la recta.'],
  ];
  for (const [workspace, asks] of cases) {
    const { markup, entries } = await processBoard(item, workspace);
    const chooser = chooserOf(entries);
    assert.ok(chooser, `${workspace.strategy}: a chooser is read`);
    // The caption the screen draws is the English the reading opens with.
    const caption = text(/<caption[^>]*>([\s\S]*?)<\/caption>/.exec(markup)?.[1] || '');
    assert.ok(caption && chooser.text.startsWith(`${caption} `), `${workspace.strategy}: "${caption}" opens "${chooser.text}"`);
    const spanish = sayFigure(chooser.say, esFigures.words);
    assert.ok(spanish?.startsWith(`${asks} `), `${workspace.strategy}: ${spanish}`);
    // Every row's values as drawn, in the same order; each pick as the button says it.
    const values = (said) => (said.match(/-?\d+/g) || []).join(' ');
    assert.equal(values(spanish), values(chooser.text), `${workspace.strategy}: the same numbers`);
    drawnChoices(markup).forEach((label, index) => {
      const note = /, chosen(?: as row (\d))?$/.exec(label);
      const row = new RegExp(`Fila ${index + 1}: x, -?\\d+; y, -?\\d+(; elegida(?: como fila (\\d))?)?\\.`).exec(spanish);
      assert.ok(row, `row ${index + 1} is read: ${spanish}`);
      assert.equal(Boolean(row[1]), Boolean(note), `row ${index + 1}: chosen in Spanish exactly when its button says so`);
      assert.equal(row[2], note?.[1], `row ${index + 1}: chosen as the same row`);
    });
    assert.equal(spanish.endsWith('Todavía no hay ninguna fila elegida.'), !workspace.work, `${workspace.strategy}: "none yet" only before a pick`);
    assert.doesNotMatch(spanish, /correct|incorrect|bien|mal\b|respuesta|intersección es/i, 'no verdict, no answer');
  }
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
