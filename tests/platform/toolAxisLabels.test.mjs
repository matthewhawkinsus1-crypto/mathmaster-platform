/*
 * WHAT A REAL-WORLD TOOL'S AXES MEASURE.
 *
 * A data or context question names the quantity on each axis with
 * `xAxisLabel` / `yAxisLabel` ("Hours studied", "Total cost (dollars)"), the
 * names a static graph spec already uses. Before, the Data Modeling Lab, the
 * Linear Table Workbench and the Linear Multiple Representations board drew
 * bare x and y, so a student fitting a line to quiz scores saw ten dots over
 * unnamed numbers and had to carry "x is the hours studied" from the prompt.
 *
 * Now the label reaches the student in every place those tools show the
 * relationship: a caption beside each axis of every plane (the scatter and
 * residual plots, the given graph, the student's own graphs, the graph a
 * process reads), the column headings of a given table, the workbench's rows,
 * and a sentence ahead of each plane's description for a screen reader and
 * Read Aloud. A question that names no quantities renders as before.
 *
 * Everything starts from a teacher import compiled by the chain a teacher's
 * import uses, and the screens are the real components rendered on the
 * server.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { compileTeacherImport } from '../../scripts/check-teacher-import.mjs';
import { validateToolQuestion } from '../../src/tools/toolSchemas.js';
import {
  AXIS_LABEL_MAX_LENGTH,
  axisLabelProblems,
  axisTitleSentence,
  cleanAxisLabel,
  questionAxisLabels,
} from '../../src/tools/shared/planeAxisTitles.js';
import {
  deriveLinearMultipleRepresentations,
  describeGivenRepresentation,
} from '../../functions/shared/toolMath/representationBridge/linearMultipleRepresentationsMath.mjs';
import { lmrProcessEnvironment, resolveLmrProcess } from '../../functions/shared/toolMath/representationBridge/lmrProcessVerify.mjs';
import { region } from './helpers/sourceContract.mjs';

// Outside the repository: lint scans the tree.
const VITE_CACHE = join(tmpdir(), 'mathmaster-vite-ssr');

/* ------------------------------------------------------------- fixtures -- */

const HOURS = 'Rental time (hours)';
const COST = 'Total cost (dollars)';
const STUDIED = 'Hours studied';
const SCORE = 'Quiz score (points)';
const TIME = 'Time since leaving the park (hours)';
const DISTANCE = 'Distance from home (miles)';
const WEEKS = 'Weeks';
const SAVINGS = 'Savings (dollars)';

const WORKBENCH = {
  questionId: 'axis-workbench',
  standard: 'A.3B',
  studentActions: ['proveConstantRate'],
  mode: 'constantRate',
  requiredComparisons: 3,
  rows: [{ x: 1, y: 27 }, { x: 3, y: 51 }, { x: 4, y: 63 }, { x: 7, y: 99 }],
  prompt: 'A shop rents kayaks. The table shows the total cost, y dollars, to rent a kayak for x hours. Decide whether the rate of change is constant.',
  xAxisLabel: HOURS,
  yAxisLabel: COST,
};
const LAB = {
  questionId: 'axis-lab',
  standard: 'A.4C',
  studentActions: ['fitDataModel', 'predictFromModel'],
  points: [{ x: 0.5, y: 58 }, { x: 1, y: 62 }, { x: 1.5, y: 61 }, { x: 2, y: 70 }, { x: 2.5, y: 68 }, { x: 3, y: 75 }, { x: 4, y: 79 }, { x: 4.5, y: 85 }, { x: 5, y: 83 }, { x: 6, y: 92 }],
  predictionX: 3.5,
  predictionTolerance: 2,
  prompt: 'Ten students recorded the hours they studied, x, and their quiz score, y. Fit a line to the data and predict the score for 3.5 hours.',
  xAxisLabel: STUDIED,
  yAxisLabel: SCORE,
};
const BOARD = {
  questionId: 'axis-board',
  standard: 'A.3B',
  studentActions: ['connectLinearRepresentations'],
  mode: 'linearMultipleRepresentations',
  interactionMode: 'process',
  source: { kind: 'graph', points: [{ x: 0, y: 9 }, { x: 1, y: 6 }, { x: 2, y: 3 }, { x: 3, y: 0 }] },
  graphBounds: { xMin: -1, xMax: 5, yMin: -1, yMax: 11 },
  requiredCards: ['slope', 'yIntercept', 'slopeIntercept'],
  prompt: 'The graph shows Jordan’s distance from home, y miles, x hours after leaving the park. Write the equation of the line.',
  xAxisLabel: TIME,
  yAxisLabel: DISTANCE,
};
// The classic board: a given table, and a graph the student draws.
const TABLE_BOARD = {
  questionId: 'axis-table-board',
  standard: 'A.2C',
  studentActions: ['connectLinearRepresentations'],
  mode: 'linearMultipleRepresentations',
  source: { kind: 'table', rows: [{ x: 0, y: 5 }, { x: 1, y: 7 }, { x: 2, y: 9 }] },
  requiredCards: ['slope', 'yIntercept', 'slopeIntercept', 'graphSlopeIntercept'],
  prompt: 'The table shows the savings, y dollars, in an account after x weeks. Find the slope and y-intercept, write the equation and graph it.',
  xAxisLabel: WEEKS,
  yAxisLabel: SAVINGS,
};
const LABELLED = [WORKBENCH, LAB, BOARD, TABLE_BOARD];

const importOf = (questions) => JSON.stringify({
  schemaVersion: 5,
  assignment: { title: 'Axis labels', courseId: 'algebra1' },
  sections: [{ id: 'axis-practice', role: 'practice', title: 'Practice', questions }],
});
const unlabelled = (question) => Object.fromEntries(Object.entries(question).filter(([key]) => !['xAxisLabel', 'yAxisLabel'].includes(key)));
const compileAll = (questions) => {
  const compiled = compileTeacherImport(importOf(questions));
  assert.deepEqual(compiled.model.errors, [], 'the import compiles');
  return compiled.questions;
};
const COMPILED = compileAll(LABELLED);
const PLAIN = compileAll(LABELLED.map(unlabelled));
const compiledFor = (questions, id) => {
  const question = questions.find((candidate) => candidate.questionId === id);
  assert.ok(question, `${id} compiles`);
  return question;
};

/* ------------------------------------------------------- markup readers -- */

const decode = (text) => text
  .replace(/<[^>]+>/g, '')
  .replace(/&#x27;/g, '\'')
  .replace(/&quot;/g, '"')
  .replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>')
  .replace(/&amp;/g, '&');
// Every axis caption on the screen, in order: { axis, hidden, text }.
const captions = (html) => [...html.matchAll(/<span([^>]*\bdata-plane-axis-title="([xy])"[^>]*)>([\s\S]*?)<\/span>/g)]
  .map(([, attributes, axis, body]) => ({ axis, hidden: /\baria-hidden="true"/.test(attributes), text: decode(body) }));
// Each plane's accessible description, in order.
const descriptions = (html) => [...html.matchAll(/<p id="mm-plane-desc-[^"]*"[^>]*>([\s\S]*?)<\/p>/g)].map(([, body]) => decode(body));
const headings = (html) => [...html.matchAll(/<th scope="col"[^>]*>([\s\S]*?)<\/th>/g)].map(([, body]) => decode(body));
const rowNames = (html) => [...html.matchAll(/aria-label="(Row \d+:[^"]*)"/g)].map(([, name]) => decode(name));

const assertCaptions = (found, { x, y }, where) => {
  assert.ok(found.some((caption) => caption.axis === 'x' && caption.text.includes(x)), `${where}: the x-axis caption names ${x}`);
  assert.ok(found.some((caption) => caption.axis === 'y' && caption.text.includes(y)), `${where}: the y-axis caption names ${y}`);
  // Read once, in the description, not again as loose text beside the plane.
  assert.ok(found.every((caption) => caption.hidden), `${where}: the captions are hidden from assistive technology`);
};

const withServer = async (work) => {
  const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent', cacheDir: VITE_CACHE });
  try {
    return await work((path) => server.ssrLoadModule(path));
  } finally {
    await server.close();
  }
};

/* ----------------------------------------------------------- the rule -- */

test('a label is one line of words; a blank one is no label; one too long to draw is refused', () => {
  assert.equal(cleanAxisLabel('  Time\n (hours) '), 'Time (hours)');
  assert.equal(cleanAxisLabel(''), '');
  assert.equal(cleanAxisLabel(42), '', 'only words are drawn');
  assert.equal(questionAxisLabels({}), null, 'a question that names nothing');
  assert.equal(questionAxisLabels({ xAxisLabel: '  ', yAxisLabel: '' }), null, 'blank labels name nothing');
  assert.deepEqual(questionAxisLabels({ xAxisLabel: 'Weeks' }), { x: 'Weeks', y: '' }, 'one axis may be named alone');

  const spoken = axisTitleSentence({ x: STUDIED, y: SCORE });
  assert.ok(spoken.includes(STUDIED) && spoken.includes(SCORE));
  assert.ok(spoken.indexOf(STUDIED) < spoken.indexOf(SCORE), 'x first, as the captions read');
  assert.ok(axisTitleSentence({ x: STUDIED }).includes(STUDIED));
  assert.ok(!axisTitleSentence({ x: STUDIED }).includes('y-axis'), 'an unnamed axis is not mentioned');
  assert.equal(axisTitleSentence({}), '');

  const atLimit = 'a'.repeat(AXIS_LABEL_MAX_LENGTH);
  assert.deepEqual(axisLabelProblems({ xAxisLabel: HOURS, yAxisLabel: atLimit }, 'linearTableWorkbench'), []);
  assert.deepEqual(axisLabelProblems({ xAxisLabel: '', yAxisLabel: '   ' }, 'linearTableWorkbench'), []);
  assert.deepEqual(axisLabelProblems({}, 'linearTableWorkbench'), []);
  // Counted as drawn: runs of spaces are one space.
  assert.deepEqual(axisLabelProblems({ xAxisLabel: `${'a'.repeat(55)}         b` }, 'dataModelingLab'), []);
  const [tooLong] = axisLabelProblems({ yAxisLabel: `${atLimit}b` }, 'dataModelingLab');
  assert.match(tooLong, /dataModelingLab yAxisLabel/);
  assert.match(tooLong, new RegExp(String(AXIS_LABEL_MAX_LENGTH)));
  const [notWords] = axisLabelProblems({ xAxisLabel: 42 }, 'representationBridge');
  assert.match(notWords, /representationBridge xAxisLabel/);
});

/* ---------------------------------------------------------- the import -- */

test('the import carries the labels into all three tools, and adds none to a question that names none', () => {
  for (const id of ['axis-workbench', 'axis-lab', 'axis-board', 'axis-table-board']) {
    const authored = LABELLED.find((question) => question.questionId === id);
    const compiled = compiledFor(COMPILED, id);
    assert.equal(compiled.xAxisLabel, authored.xAxisLabel, `${id} keeps its x quantity`);
    assert.equal(compiled.yAxisLabel, authored.yAxisLabel, `${id} keeps its y quantity`);
    const plain = compiledFor(PLAIN, id);
    assert.equal('xAxisLabel' in plain || 'yAxisLabel' in plain, false, `${id} without labels compiles as before`);
  }
});

test('Pre-Flight refuses a label it cannot draw, and names the question and the field', () => {
  for (const [question, key, value, expected] of [
    [WORKBENCH, 'xAxisLabel', 'x'.repeat(AXIS_LABEL_MAX_LENGTH + 1), /linearTableWorkbench xAxisLabel must be at most/],
    [LAB, 'yAxisLabel', 'x'.repeat(AXIS_LABEL_MAX_LENGTH + 1), /dataModelingLab yAxisLabel must be at most/],
    [BOARD, 'xAxisLabel', 42, /representationBridge xAxisLabel must be a short phrase/],
  ]) {
    const compiled = compileTeacherImport(importOf([{ ...question, [key]: value }]));
    assert.equal(compiled.model.isValid, false, `${question.questionId} ${key}`);
    assert.ok(compiled.model.errors.some((error) => expected.test(error)), JSON.stringify(compiled.model.errors));
  }
  // The tool validator says the same about a compiled question.
  const workbench = compiledFor(COMPILED, 'axis-workbench');
  assert.deepEqual(validateToolQuestion(workbench).errors.filter((error) => /AxisLabel/.test(error)), []);
  assert.ok(validateToolQuestion({ ...workbench, yAxisLabel: ['Cost'] }).errors.some((error) => /linearTableWorkbench yAxisLabel/.test(error)));
});

/* ------------------------------------------------------------ the plane -- */

test('the plane: a caption beside each axis, and the quantities said ahead of its description', async () => {
  await withServer(async (load) => {
    const { default: CoordinatePlane } = await load('/src/tools/shared/CoordinatePlane.jsx');
    const plane = (props) => renderToStaticMarkup(React.createElement(CoordinatePlane, { xMin: -1, xMax: 8, yMin: -1, yMax: 10, enlargeable: false, ...props }));

    const bare = plane({});
    assert.deepEqual(captions(bare), [], 'no quantities, no captions');
    const titled = plane({ xAxisTitle: `  ${HOURS}\n`, yAxisTitle: COST });
    const found = captions(titled);
    assert.deepEqual(found.map((caption) => caption.axis), ['y', 'x'], 'y above the plane, x below it');
    assertCaptions(found, { x: HOURS, y: COST }, 'the plane');
    assert.ok(!found.some((caption) => caption.text.includes('\n') || caption.text.includes('  ')), 'one line each');

    const [bareDescription] = descriptions(bare);
    const [description] = descriptions(titled);
    assert.ok(bareDescription, 'the plane describes itself');
    assert.ok(description.includes(HOURS) && description.includes(COST), description);
    assert.ok(description.indexOf(HOURS) < description.indexOf(COST));
    // What the plane shows is described as before, after what its axes measure.
    assert.ok(description.endsWith(bareDescription) && description.length > bareDescription.length, description);
    // An authored description keeps its place too.
    const [authored] = descriptions(plane({ xAxisTitle: HOURS, description: 'A table of rental costs.' }));
    assert.ok(authored.includes(HOURS) && authored.endsWith('A table of rental costs.'), authored);
  });
});

/* ----------------------------------------------------------- the tools -- */

test('the Data Modeling Lab names its quantities on the scatter plot and the residual plot', async () => {
  await withServer(async (load) => {
    const { default: DataModelingLab } = await load('/src/tools/dataModeling/DataModelingLab.jsx');
    const html = renderToStaticMarkup(React.createElement(DataModelingLab, { questionData: compiledFor(COMPILED, 'axis-lab') }));
    const found = captions(html);
    assertCaptions(found, { x: STUDIED, y: SCORE }, 'the scatter plot');
    // The residual plot shares the scatter plot's x quantity; its y is the
    // residual, which its panel names.
    assert.equal(found.filter((caption) => caption.axis === 'x').length, 2, 'scatter and residual plots');
    assert.equal(found.filter((caption) => caption.axis === 'y').length, 1);
    assert.ok(descriptions(html).some((description) => description.includes(STUDIED) && description.includes(SCORE)), 'and says them');

    const plain = renderToStaticMarkup(React.createElement(DataModelingLab, { questionData: compiledFor(PLAIN, 'axis-lab') }));
    assert.deepEqual(captions(plain), []);
  });
});

test('the Linear Table Workbench names what x and y measure, on the table and in each row\'s name', async () => {
  await withServer(async (load) => {
    const { default: LinearTableWorkbench } = await load('/src/tools/linearTableWorkbench/LinearTableWorkbench.jsx');
    const html = renderToStaticMarkup(React.createElement(LinearTableWorkbench, { questionData: compiledFor(COMPILED, 'axis-workbench') }));
    const quantities = html.match(/<p[^>]*data-table-quantities="true"[^>]*>([\s\S]*?)<\/p>/);
    assert.ok(quantities, 'the table says what its columns hold');
    assert.ok(decode(quantities[1]).includes(HOURS) && decode(quantities[1]).includes(COST));

    const plain = renderToStaticMarkup(React.createElement(LinearTableWorkbench, { questionData: compiledFor(PLAIN, 'axis-workbench') }));
    assert.doesNotMatch(plain, /data-table-quantities/);
    const named = rowNames(html);
    const before = rowNames(plain);
    assert.equal(named.length, WORKBENCH.rows.length);
    named.forEach((name, index) => {
      assert.ok(name.includes(HOURS) && name.includes(COST), name);
      // The row's own name is unchanged; the quantities are added to it.
      assert.equal(name.replace(` (${HOURS})`, '').replace(` (${COST})`, ''), before[index]);
    });
  });
});

test('the Linear Multiple Representations board names the quantities on the given graph and the graph a process reads', async () => {
  await withServer(async (load) => {
    const { default: Board } = await load('/src/tools/representationBridge/LinearMultipleRepresentationsBoard.jsx');
    const question = compiledFor(COMPILED, 'axis-board');
    const html = renderToStaticMarkup(React.createElement(Board, { questionData: question }));
    assertCaptions(captions(html), { x: TIME, y: DISTANCE }, 'the given graph');
    assert.deepEqual(captions(renderToStaticMarkup(React.createElement(Board, { questionData: compiledFor(PLAIN, 'axis-board') }))), []);

    // A process that reads the given graph (here, where the line crosses the
    // y-axis) draws the board's own description of the given, quantities and
    // all.
    const { default: ProcessWorkspace } = await load('/src/tools/representationBridge/process/ProcessWorkspace.jsx');
    const board = readFileSync(new URL('../../src/tools/representationBridge/LinearMultipleRepresentationsBoard.jsx', import.meta.url), 'utf8');
    const workspace = region(board, '<ProcessWorkspace', '/>', 'the process workspace the board opens');
    assert.match(workspace, /description=\{givenDescription\}/, 'the board hands the workspace its description of the given');
    const facts = deriveLinearMultipleRepresentations(question);
    const env = lmrProcessEnvironment(question, facts);
    const process = resolveLmrProcess(question, { processLog: [] }, facts, env);
    const description = { ...describeGivenRepresentation(question, facts), axisLabels: questionAxisLabels(question) };
    const opened = renderToStaticMarkup(React.createElement(ProcessWorkspace, {
      question, process, target: 'yIntercept', draft: { method: {} }, setDraft: () => {}, canCheck: true,
      description, snapStep: 1, onRecord: () => ({}), onClose: () => {},
    }));
    assert.match(opened, /data-process-plane=/, 'the method reads the given graph');
    assertCaptions(captions(opened), { x: TIME, y: DISTANCE }, 'the process plane');
  });
});

test('on the classic board a given table heads its columns with the quantities, and the student\'s graph names its axes', async () => {
  await withServer(async (load) => {
    const { default: Board } = await load('/src/tools/representationBridge/LinearMultipleRepresentationsBoard.jsx');
    const html = renderToStaticMarkup(React.createElement(Board, { questionData: compiledFor(COMPILED, 'axis-table-board') }));
    const [x, y] = headings(html);
    assert.ok(x.startsWith('x') && x.includes(WEEKS), x);
    assert.ok(y.startsWith('y') && y.includes(SAVINGS), y);
    assert.match(html, /data-lmr-card="graphSlopeIntercept"/, 'the graph the student draws is on the board');
    assertCaptions(captions(html), { x: WEEKS, y: SAVINGS }, 'the student\'s graph');

    const plain = renderToStaticMarkup(React.createElement(Board, { questionData: compiledFor(PLAIN, 'axis-table-board') }));
    assert.deepEqual(headings(plain), ['x', 'y'], 'no quantities: the variables alone');
    assert.deepEqual(captions(plain), []);
  });
});
