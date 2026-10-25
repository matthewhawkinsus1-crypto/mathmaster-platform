/*
 * STUDENT PASS 3, WAVE 7 — READ ALOUD READS WHAT THE QUESTION SHOWS (W7-5).
 *
 *   tables     Read aloud skipped every table. It now reads a table by rows,
 *              with its headers; a cell the student fills in is "blank",
 *              never its value (on a fillable table, the answer).
 *   graphs     It skipped every graph. It now says the description the
 *              figure already has (GraphDisplay, the shared CoordinatePlane),
 *              under the figure's own rule: while the question can be
 *              answered, the kinds of marks only — no position, no value.
 *   HELP-19    The inclusion "Let's back up" step covered the work with a
 *              generic Yes/No on items with no step written for them. It is
 *              now shown only where one is written (authored or family), and
 *              "Let's back up" is said once, not three times.
 *
 * Every real-lesson case runs over teacher-import-jsons, compiled the way
 * QuestionEngine receives them.
 */
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { compileAuthoringIntentV5 } from '../../src/platform/contract/authoringIntentV5.js';
import { prepareQuestionForRuntimeRouting } from '../../src/platform/algebra/algebraWorkspaceRoute.js';
import { generateQuestion } from '../../src/problemGenerator.js';
import { normalizeContextualQuestion } from '../../src/platform/context/wordProblemLayer.js';
import { backUpQuestionText, questionReadingParts, questionReadingText, tableReading } from '../../src/platform/language/questionReading.js';
import { speechTextFor } from '../../src/platform/language/speechText.js';
import { FigureReadingPortProvider, FigureReadingScope, figureReadingEntries, updateFigureReadings, useFigureReadingPublisher } from '../../src/platform/language/figureReadings.js';
import { displayTableFor } from '../../src/platform/question/displayTable.js';
import { backUpStepFor, backUpStepWritten } from '../../src/platform/supports/feedback/backUpStep.js';
import { readComposedQuestion } from '../../src/platform/workflow/questionWorkflow.js';
import { selectPersistentWorkflowGraph } from '../../src/platform/workflow/workflowPresentation.js';
import { executableSource, region } from './helpers/sourceContract.mjs';

const ROOT = new URL('../../', import.meta.url);
const ROOT_PATH = fileURLToPath(ROOT);
const code = (path) => executableSource(readFileSync(new URL(path, ROOT), 'utf8'));

let lessons = null;
const realQuestions = () => {
  if (lessons) return lessons;
  lessons = [];
  const imports = join(ROOT_PATH, 'teacher-import-jsons');
  readdirSync(imports).forEach((folder) => readdirSync(join(imports, folder)).filter((name) => name.endsWith('.json')).forEach((name) => {
    const compiled = compileAuthoringIntentV5(JSON.parse(readFileSync(join(imports, folder, name), 'utf8')));
    compiled.package.sections.forEach((section) => section.questions.forEach((stored) => {
      const question = normalizeContextualQuestion(generateQuestion(prepareQuestionForRuntimeRouting(stored, {}), 0, null, null, null));
      lessons.push({ role: section.role, stored, question });
    }));
  }));
  return lessons;
};
const real = (questionId) => {
  const found = realQuestions().find((entry) => entry.stored.questionId === questionId);
  assert.ok(found, `${questionId} is in the real lessons`);
  return found.question;
};

let vite = null;
before(async () => {
  const { createServer } = await import('vite');
  vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
});
after(async () => { await vite?.close(); });

/* ------------------------------------------------------------------ tables */

test('a fillable table is read by rows with its headers, and a cell to fill in is "blank" — never its answer (l2-cw-9)', () => {
  const question = real('l2-cw-9');
  const answers = question.table.answers;
  assert.ok(Object.keys(answers).length >= 5, 'the real table has cells to fill in');
  const table = displayTableFor(question, { editable: true });
  Object.keys(answers).forEach((key) => {
    const [row, column] = key.split(':');
    const index = table.columns.findIndex((entry) => entry.key === column);
    // Never its value: only what the student typed (nothing yet).
    assert.deepEqual(table.rows[Number(row)][index], { entered: '' }, `${key} is blank`);
  });
  const said = speechTextFor(tableReading(table));
  assert.match(said, /^A table, 5 rows\. Columns: x; f of x; c of x; input of d; d of x\. Row 1: x, negative 2; f of x, negative 2; c of x, blank; input of d, blank; d of x, negative 2\./);
  // No row says a value where the student writes one.
  assert.doesNotMatch(said, /c of x, (?!blank)|input of d, (?!blank)/);
});

test('even when the row data holds the answer, a cell to fill in is read "blank"', () => {
  const question = {
    table: {
      columns: [{ key: 'x', label: 'x' }, { key: 'y', label: 'y' }],
      rows: [{ x: 1, y: 7 }, { x: 2, y: 9 }],
      answers: { '0:y': '7' },
      blanks: ['1:y'],
    },
  };
  const read = tableReading(displayTableFor(question, { editable: true }));
  assert.equal(read, 'A table, 2 rows. Columns: x; y. Row 1: x, 1; y, blank. Row 2: x, 2; y, blank.');
  // The read-only table never shows (or reads) a key's value either.
  assert.equal(displayTableFor(question).rows[0][1], null);
});

test('the read-only table: headers shape, its caption, money units and Spanish', () => {
  const table = displayTableFor({ table: { headers: ['Month', 'Cost ($)'], rows: [['May', '$4.50'], ['June', '']] } });
  assert.deepEqual(table.columns.map((column) => column.label), ['Month', 'Cost ($)']);
  assert.equal(
    speechTextFor(tableReading(table, { label: 'Phone bill' })),
    'Phone bill, 2 rows. Columns: Month; Cost (dollars). Row 1: Month, May; Cost (dollars), 4 dollars and 50 cents. Row 2: Month, June; Cost (dollars), blank.',
  );
  assert.equal(
    tableReading(table, { language: 'es' }),
    'Una tabla, de 2 filas. Columnas: Month; Cost (dólares). Fila 1: Month, May; Cost (dólares), $4.50. Fila 2: Month, June; Cost (dólares), en blanco.',
  );
  assert.equal(displayTableFor({ table: { headers: [], rows: [] } }), null);
});

/* ------------------------------------------------------- figures, in order */

test('a table and a figure are parts of the question, after its material and before the step and fields', () => {
  const question = real('l3-pr-1');
  const figures = [
    { kind: 'table', label: 'Sales', table: { columns: [{ key: 'x', label: 'x' }], rows: [[1]] } },
    { kind: 'figure', label: 'Question graph', text: 'x from −5 to 5, y from −5 to 5. 1 line. Positions are not read out while this question can be answered.' },
  ];
  const parts = questionReadingParts(question, { figures });
  const kinds = parts.map((part) => part.kind);
  assert.ok(kinds.indexOf('prompt') < kinds.indexOf('table'), kinds.join());
  assert.ok(kinds.indexOf('table') < kinds.indexOf('figure'), kinds.join());
  assert.ok(kinds.indexOf('figure') < kinds.indexOf('part'), kinds.join());
  const figure = parts.find((part) => part.kind === 'figure');
  assert.equal(figure.label, 'Question graph');
  assert.equal(figure.text, 'Question graph. x from −5 to 5, y from −5 to 5. 1 line. Positions are not read out while this question can be answered.');
  assert.equal(parts.find((part) => part.kind === 'table').label, 'Sales');
  assert.match(questionReadingText(parts), /Sales, 1 row\. Columns: x\. Row 1: x, 1\./);
  // Unnamed: a numbered label in the tray.
  assert.equal(questionReadingParts(question, { figures: [{ kind: 'figure', label: '', text: 'Nothing is plotted.' }] }).find((part) => part.kind === 'figure').label, 'Figure 1');
});

test('the host keeps a figure in its place when its description changes, and does nothing when it does not', () => {
  let list = updateFigureReadings([], 'a', { kind: 'figure', label: 'A', text: 'one' });
  list = updateFigureReadings(list, 'b', { kind: 'figure', label: 'B', text: 'two' });
  const same = updateFigureReadings(list, 'a', { kind: 'figure', label: 'A', text: 'one' });
  assert.equal(same, list, 'unchanged: the same state, so nothing re-renders');
  list = updateFigureReadings(list, 'a', { kind: 'figure', label: 'A', text: 'one, moved' });
  assert.deepEqual(list.map((item) => item.id), ['a', 'b'], 'an update keeps its place');
  list = updateFigureReadings(list, 'c', { kind: 'figure', label: 'B', text: 'two' });
  // Two graph cards that say the same thing are two figures (lmr-wu-1: two
  // cards, each "1 line."): both are read. Work View draws no second copy.
  assert.equal(figureReadingEntries(list).length, 3, 'two different figures with equal words are both read');
  list = updateFigureReadings(list, 'a', null);
  assert.deepEqual(list.map((item) => item.id), ['b', 'c'], 'an unmounted figure is no longer read');
});

/* -------------------------------------------- the figure's rule, read aloud */

const DESCRIPTION = /<p id="[^"]*" data-graph-description="" aria-hidden="true"[^>]*>([^<]*)<\/p>/;
// What would give a position or a value away: a coordinate, an axis crossing,
// a point a line passes through, a turning point, a shape's corners.
const POSITIONS = /\(\s*[−-]?\d|\bcrosses\b|\bthrough\b|\bbetween\b|\bcorners?\b|\bhigh point\b|\blow point\b|\bat [−-]?\d/;

test('on a real exit ticket, Read aloud says the graph without a position while it can be answered', async () => {
  const { default: GraphDisplay } = await vite.ssrLoadModule('/src/GraphDisplay.jsx');
  const { QuestionLifecycleProvider } = await vite.ssrLoadModule('/src/platform/question/QuestionLifecycleContext.jsx');
  const { staticGraphSpec } = await vite.ssrLoadModule('/src/platform/workflow/WorkflowRunner.jsx');
  // The graph the screen draws: a composed step's figure (WorkflowRunner's
  // StageFigure: the stage graph with its structured function), else the
  // persistent graph, else the question's own (QuestionVisual).
  const drawnGraph = (question) => {
    const { content, workflow } = readComposedQuestion(question);
    const stageGraph = (workflow || []).find((stage) => stage?.graph?.functionSpec)?.graph;
    const structured = stageGraph ? staticGraphSpec(stageGraph.functionSpec) : null;
    if (structured) {
      const shown = { ...stageGraph, functions: [structured], points: Array.isArray(stageGraph.points) ? stageGraph.points : [] };
      delete shown.functionSpec;
      delete shown.model;
      delete shown.endpointRequirements;
      return shown;
    }
    return (workflow?.length ? selectPersistentWorkflowGraph({ content, workflow, checkedGraph: null }) : null) || question.graph;
  };
  // A graph the student constructs (Systems Workspace graph mode, `interaction:
  // "construct"`) carries only the window of the plane they draw on: nothing
  // is drawn for them, and it is the workspace's plane, never this figure.
  const constructed = (question) => question.type === 'systemsWorkspace' && question.interaction === 'construct';
  const assessed = realQuestions().filter(({ role, question }) => ['dol', 'quiz', 'test'].includes(role) && question.graph && !constructed(question));
  assert.ok(assessed.length >= 6, `${assessed.length} real assessment items with a graph`);
  assessed.forEach(({ stored, question }) => {
    const graph = drawnGraph(question);
    const describe = (lifecycle) => {
      const markup = renderToStaticMarkup(React.createElement(QuestionLifecycleProvider, lifecycle, React.createElement(GraphDisplay, { graph, title: 'Question graph' })));
      return DESCRIPTION.exec(markup)?.[1].replace(/&#x27;/g, '\'') || '';
    };
    const open = describe({ terminal: false, positionsReadable: false });
    assert.doesNotMatch(open, /Nothing is plotted/, `${stored.questionId}: the drawn graph`);
    const closed = describe({ terminal: true, positionsReadable: true });
    // The same text the figure publishes (wiring test below) is what is read.
    const reading = questionReadingText(questionReadingParts(question, { figures: [{ kind: 'figure', label: 'Question graph', text: open }] }));
    assert.match(reading, /Positions are not read out while this question can be answered\./, stored.questionId);
    assert.doesNotMatch(reading, POSITIONS, `${stored.questionId}: ${reading}`);
    // The check can fail: closed, the same graph's description gives positions.
    assert.match(closed, POSITIONS, `${stored.questionId} closed: ${closed}`);
  });
});

test('each figure publishes the text it describes itself with, and QuestionEngine reads it', () => {
  const graph = code('src/GraphDisplay.jsx');
  // The reading is the figure's own description, then the captions it shows: its
  // authored caption and, on a figure the student can "Fix the scale" of, the line
  // that says what each axis counts by (R-9). The hidden description beside it stays
  // the description alone: the visible captions are read in place, not twice.
  assert.match(graph, /<PublishFigureReading entry=\{\{ kind: 'figure', label: title, text: \[spokenDescription, graph\.caption \? String\(graph\.caption\) : '', scaleCaption\]\.join\(' '\) \}\} \/>\s*<p id=\{descriptionId\} data-graph-description="" aria-hidden="true"[^>]*>\{spokenDescription\}<\/p>/);
  const plane = code('src/tools/shared/CoordinatePlane.jsx');
  assert.match(plane, /<PublishFigureReading entry=\{\{ kind: 'figure', label: ariaLabel, text: spokenDescription \}\} \/>\s*<p id=\{descriptionId\} className="mm-sr-only"[^>]*>\{spokenDescription\}<\/p>/);
  const visual = code('src/QuestionVisual.jsx');
  assert.match(visual, /const displayTable = includeTable \? displayTableFor\(question\) : null;/, 'the table drawn is the shared model');
  assert.match(visual, /\{displayTable && <PublishFigureReading entry=\{\{ kind: 'table', label: question\?\.tableCaption \|\| '', table: displayTable \}\} \/>\}/);
  const grader = code('src/TableGrader.jsx');
  assert.match(grader, /<PublishFigureReading entry=\{\{ kind: 'table', label: '', table: displayTableFor\(question, \{ editable: true, entries: studentAnswers \}\) \}\} \/>/);

  // The other figures that already describe themselves, beside that description.
  [
    ['src/tools/intervalNumberLine/IntervalNumberLine.jsx', /<PublishFigureReading entry=\{\{ kind: 'figure', label: 'Number line', text: lineDescription \}\} \/>\s*<p id=\{lineDescriptionId\} data-number-line-description=""[^>]*>\{lineDescription\}<\/p>/],
    ['src/NumberLine.jsx', /<PublishFigureReading entry=\{\{ kind: 'figure', label: 'Number line', text: description \}\} \/>\s*<span id=\{descriptionId\}[^>]*>\{description\}<\/span>/],
    ['src/tools/systemsWorkspace/ThreePlaneWorkspace.jsx', /<PublishFigureReading entry=\{\{ kind: 'figure', label: '3D model', text: modelDescription \}\} \/>\s*<span id=\{modelDescriptionId\}[^>]*>\{modelDescription\}<\/span>/],
    ['src/InteractiveGraphWorkspace.jsx', /<PublishFigureReading entry=\{\{ kind: 'figure', label: 'Graph', text: workspaceDescription \}\} \/>\s*<span id=\{workspaceDescriptionId\}[^>]*>\{workspaceDescription\}<\/span>/],
  ].forEach(([path, wiring]) => assert.match(code(path), wiring, path));

  const engine = code('src/QuestionEngine.jsx');
  assert.match(engine, /import \{ FigureReadingPortProvider, figureReadingEntries, updateFigureReadings \} from '\.\/platform\/language\/figureReadings\.js';/);
  assert.match(engine, /<FigureReadingPortProvider publish=\{publishFigureReading\}>\{renderModule\(\)\}<\/FigureReadingPortProvider>/, 'the question\'s own figures, not a practice item or a review beside it');
  assert.match(engine, /const publishFigureReading = useCallback\(\(id, entry\) => setPublishedFigures\(\(current\) => updateFigureReadings\(current, id, entry\)\), \[\]\);/);
  const reading = region(engine, 'const readingParts = useMemo(', ');', 'the reading');
  assert.match(reading, /figures: figureReadings,/);
});

/* ---------------------------------------------------------------- HELP-19 */

test('HELP-19: the back-up step is shown only where one is written for the problem', () => {
  assert.equal(backUpStepWritten(backUpStepFor({ type: 'stepAlgebra', scaffold: { prompt: 'First move?', options: ['Add 3', 'Divide by 2'], correct: 'Add 3' } })), true, 'authored');
  assert.equal(backUpStepWritten(backUpStepFor({ type: 'functionGraph' })), false, 'the platform\'s step for the type');
  assert.equal(backUpStepWritten(backUpStepFor({ type: 'matrixLab' })), false, 'the generic Yes/No');
  assert.equal(backUpStepWritten(null), false);

  // Over the real Warm-Up, Classwork and Practice items.
  const helped = realQuestions().filter(({ role }) => ['warmup', 'classwork', 'practice'].includes(role));
  const written = helped.filter(({ question }) => backUpStepWritten(backUpStepFor(question)));
  // teacher-import-jsons: 141 of 217. With docs/assignments and the sample,
  // counting each lesson once: 152 of 248.
  assert.ok(helped.length >= 200 && written.length >= 130, `${written.length} of ${helped.length} keep a step written for them`);
  written.forEach(({ stored, question }) => {
    const step = backUpStepFor(question);
    assert.doesNotMatch(step.prompt, /revise the specific parts identified in the feedback/, stored.questionId);
  });

  const engine = code('src/QuestionEngine.jsx');
  assert.match(engine, /const scaffoldRequired = Boolean\(backUpStepWritten\(scaffold\) && /, 'the overlay needs a written step');
});

test('HELP-19: "Let\'s back up" is said once — the region names it, the question follows', () => {
  const question = real('l3-pr-1');
  const step = { prompt: 'Let’s back up. Which axis do you read the domain along?', options: ['The y-axis', 'The x-axis'], correct: 'The x-axis' };
  assert.equal(backUpQuestionText(step.prompt), 'Which axis do you read the domain along?');
  assert.equal(backUpQuestionText('One step back. Which point?'), 'One step back. Which point?');
  const said = questionReadingText(questionReadingParts(question, { backUp: step }));
  assert.equal((said.match(/Let’s back up/g) || []).length, 1, said);
  assert.match(said, /^Let’s back up\. Which axis do you read the domain along\? Choices: The y-axis; or The x-axis\./);

  const engine = code('src/QuestionEngine.jsx');
  const overlay = region(engine, '{scaffoldRequired && (', '</section>', 'the back-up overlay');
  assert.match(overlay, /role="region" aria-label="Let's back up"/);
  // Drawn through MathText: a family's step writes its mathematics as $…$.
  assert.match(overlay, /<h2[^>]*><MathText>\{backUpQuestionText\(scaffold\.prompt\)\}<\/MathText><\/h2>/, 'the heading is the question, not "Let\'s back up" again');
});

/* ------------------------------------- what a tool draws on the shared plane */

test('a tool names what it draws itself; the plane says its kinds while open and its features once closed', async () => {
  const { describeCoordinatePlane } = await import('../../src/platform/language/graphDescription.js');
  const base = { xMin: -5, xMax: 5, yMin: -5, yMax: 5, hasUndescribedMarks: true, toolMarks: { kinds: '1 curve.', features: '1 curve, opening to the right.' } };
  const open = describeCoordinatePlane(base).description;
  assert.match(open, /1 curve\. Positions are not read out while this question can be answered\.$/, open);
  assert.doesNotMatch(open, /opening|not listed/);
  assert.match(describeCoordinatePlane({ ...base, detail: 'features' }).description, /1 curve, opening to the right\.$/);
  assert.match(describeCoordinatePlane({ ...base, detail: 'features', toolMarks: { kinds: 'A segment joins the origin to each point.' } }).description, /A segment joins the origin to each point\.$/, 'features falls back to kinds');
  assert.match(describeCoordinatePlane({ ...base, toolMarks: null }).description, /marks drawn by the activity that are not listed here\.$/, 'without words, the plane says so');
});

test('the student\'s inequality graph is said as drawn — line styles, shaded sides, the overlap — never where', async () => {
  const { inequalityGraphMarksText } = await import('../../src/tools/systemsWorkspace/inequalityGraphMarks.js');
  const { boundaryFromSlopeIntercept, feasibleRegionPolygon, boundaryWithChosenSide } = await import('../../src/tools/systemsWorkspace/inequalityBuilderAdapter.js');
  const bounds = { xMin: -6, xMax: 8, yMin: -4, yMax: 10 };
  const lines = [boundaryFromSlopeIntercept(1, 2, '>='), boundaryFromSlopeIntercept(-1, 6, '<')];
  const build = [{ style: 'solid', shadePoint: [0, 9] }, { style: null, shadePoint: [0, 0] }];
  const polygon = feasibleRegionPolygon([boundaryWithChosenSide(lines[0], 1, false), boundaryWithChosenSide(lines[1], -1, true)], bounds);
  const said = inequalityGraphMarksText({ build, effectiveLines: lines, buildConfig: { lineStyle: true, shading: true }, workingConstraints: [], bounds, combined: true, studentPolygon: polygon.length >= 3 ? polygon : [[0, 0], [1, 0], [0, 1]] });
  assert.equal(said, 'Boundary line 1: solid. Boundary line 2: its style is not chosen yet. One side of each of boundary lines 1 and 2 is shaded. The overlap of the shaded sides is hatched.');
  assert.doesNotMatch(said, /\d\s*,\s*[−-]?\d|\(|above|below|left|right/, 'no position and no side named');
  // The relation's own style when the step does not ask for one.
  assert.equal(inequalityGraphMarksText({ build: [{}, { visible: false }], effectiveLines: lines, buildConfig: {}, workingConstraints: [{ relation: '<' }], bounds }), 'Boundary line 1: dashed.');
  assert.equal(inequalityGraphMarksText({}), 'No boundary line is drawn yet.');
});

// AX12: a closed question's inequality region now reads its corners; while
// the question is open the plane still says only that a region is shaded.
test('the inequality region names its corners once positions may be said, and says when it goes on', async () => {
  const { regionCornersText } = await import('../../src/tools/systemsWorkspace/inequalityGraphMarks.js');
  const { feasibleRegionPolygon } = await import('../../src/tools/systemsWorkspace/inequalityBuilderAdapter.js');
  const { describeCoordinatePlane } = await import('../../src/platform/language/graphDescription.js');
  const bounds = { xMin: -6, xMax: 8, yMin: -4, yMax: 10 };
  // A closed triangle: three corners, nothing past the edge.
  const triangle = [{ m: 0, b: 0, relation: '>=' }, { m: -1, b: 4, relation: '<=' }, { m: 1, b: 0, relation: '<=' }];
  assert.equal(
    regionCornersText({ polygon: feasibleRegionPolygon(triangle, bounds), lines: triangle, intro: '1 shaded region' }),
    '1 shaded region, with corners at (0, 0), (4, 0) and (2, 2).',
  );
  // An open region: only where boundaries meet is a corner; the window's cut is not.
  const open = [{ m: 0, b: 0, relation: '>=' }, { m: -1, b: 4, relation: '<=' }, { m: 1, b: -2, relation: '>=' }];
  const said = regionCornersText({ polygon: feasibleRegionPolygon(open, bounds), lines: open, intro: '1 shaded region' });
  assert.equal(said, '1 shaded region, with corners at (2, 0) and (3, 1). It goes on past the edge of the graph.');
  assert.doesNotMatch(said, /−6/, 'a window edge is no corner');
  assert.equal(regionCornersText({ polygon: [[0, 0], [1, 0]], lines: open }), null, 'no region, no sentence');
  // Through the plane: open, the kind only; closed, the corners.
  const base = { xMin: -6, xMax: 8, yMin: -4, yMax: 10, xTickStep: 1, yTickStep: 1, hasUndescribedMarks: true };
  const toolMarks = { kinds: '1 shaded region.', features: regionCornersText({ polygon: feasibleRegionPolygon(triangle, bounds), lines: triangle, intro: '1 shaded region' }) };
  assert.doesNotMatch(describeCoordinatePlane({ ...base, toolMarks }).description, /corner|\(\d/);
  assert.match(describeCoordinatePlane({ ...base, toolMarks, detail: 'features' }).description, /corners at \(0, 0\), \(4, 0\) and \(2, 2\)\.$/);
});

test('the Complex Plane, the sideways parabola and the inequality region pass their words to the plane', async () => {
  assert.match(code('src/tools/complexPlane/ComplexPlaneLab.jsx'), /toolMarks=\{\{ kinds: 'A segment joins the origin to each point\.' \}\}\s*>\s*\{\(\{ sx, sy \}\) => <>\{items\.map\(\(item\) => <line/);
  const parabola = code('src/tools/parabolaGeometry/ParabolaGeometryLab.jsx');
  assert.match(parabola, /toolMarks=\{\{ kinds: '1 curve\.', features: `1 curve, opening to the \$\{spec\.p>0\?'right':'left'\}\.` \}\}>[^<]*?\{spec\.orientation==='horizontal' \? \(\{sx,sy\}\)=> <path/, 'only a sideways parabola draws (and names) its own curve');
  const systems = code('src/tools/systemsWorkspace/SystemsWorkspace.jsx');
  assert.match(systems, /const regionIntro = `1 shaded region\$\{requiresConstruction \? '' : ', where every inequality is true'\}`;/);
  assert.match(systems, /toolMarks=\{\{\s*kinds: shownPolygon\.length >= 3 \? `\$\{regionIntro\}\.` : 'No region is shaded yet\.',\s*features: regionCornersText\(\{ polygon: shownPolygon, lines: requiresConstruction \? studentInequalities : inequalities, intro: regionIntro \}\) \|\| undefined,\s*\}\}/);
  assert.match(code('src/tools/systemsWorkspace/StudentBuildInequalityMode.jsx'), /toolMarks=\{\{ kinds: inequalityGraphMarksText\(\{ build, effectiveLines, buildConfig, workingConstraints, bounds, combined, studentPolygon \}\) \}\}/);
  const plane = code('src/tools/shared/CoordinatePlane.jsx');
  assert.match(plane, /hasUndescribedMarks: hasToolMarks,\s*toolMarks: hasToolMarks \? toolMarks : null,/);

  // Rendered: the plane's own description carries the tool's words.
  const { default: CoordinatePlane } = await vite.ssrLoadModule('/src/tools/shared/CoordinatePlane.jsx');
  const markup = renderToStaticMarkup(React.createElement(CoordinatePlane, {
    xMin: -5, xMax: 5, yMin: -5, yMax: 5, points: [{ x: 3, y: 2, label: 'z₁' }], enlargeable: false,
    toolMarks: { kinds: 'A segment joins the origin to each point.' },
  }, () => React.createElement('line', { x1: 0, y1: 0, x2: 1, y2: 1 })));
  const description = /<p id="mm-plane-desc-[^"]*"[^>]*>([^<]*)<\/p>/.exec(markup)?.[1] || '';
  assert.match(description, /1 point labelled z₁\. A segment joins the origin to each point\. Positions are not read out/, description);
});

/* ------------------------------------------- review round: what is on screen */

test('B1: a step kept mounted but hidden publishes nothing — only the step on screen is read', () => {
  const publish = () => {};
  const Probe = () => React.createElement('i', null, useFigureReadingPublisher() ? 'reads' : 'silent');
  const markup = renderToStaticMarkup(React.createElement(FigureReadingPortProvider, { publish },
    React.createElement(FigureReadingScope, { shown: true }, React.createElement(Probe)),
    React.createElement(FigureReadingScope, { shown: false }, React.createElement(Probe)),
    React.createElement(FigureReadingScope, { shown: true }, React.createElement(FigureReadingScope, { shown: false }, React.createElement(Probe)))));
  assert.equal(markup, '<i>reads</i><i>silent</i><i>silent</i>');
  assert.equal(renderToStaticMarkup(React.createElement(FigureReadingScope, { shown: true }, React.createElement(Probe))), '<i>silent</i>', 'outside a host, nothing');

  // Focus Mode keeps the other steps mounted, hidden with CSS: each is in a
  // scope shown only while it is the step on screen.
  const runner = code('src/platform/workflow/WorkflowRunner.jsx');
  assert.match(runner, /<FigureReadingScope key=\{stage\.id\} shown=\{index === safeActiveIndex\}>\s*\{renderStage\(stage, index, \{ focused: index === safeActiveIndex \}\)\}\s*<\/FigureReadingScope>/);
});

test('S2: " · " between words in a figure\'s name is a pause, not "times" (en and es)', () => {
  const question = real('l3-pr-1');
  const figures = [{ kind: 'figure', label: 'Coordinate plane for Graph 1 · Intercept method', text: '1 line · Your points.' }];
  const said = speechTextFor(questionReadingText(questionReadingParts(question, { figures })));
  assert.match(said, /Coordinate plane for Graph 1, Intercept method\. 1 line, Your points\./);
  assert.doesNotMatch(said, /times Intercept/);
  const es = questionReadingParts(question, { figures: [{ kind: 'figure', label: 'Gráfica 1 · Método', text: 'Una recta.' }], language: 'es' }).find((part) => part.kind === 'figure');
  assert.equal(speechTextFor(es.text, { language: 'es' }), 'Gráfica 1, Método. Una recta.');
  // Multiplication stays multiplication.
  assert.match(speechTextFor(questionReadingText(questionReadingParts(question, { figures: [{ kind: 'figure', label: 'Area', text: 'It shows 2 · 3 and 2 · x.' }] }))), /2 times 3 and 2 times x/);
});

test('S4: the fillable table keys a column with no key the way TableGrader does', () => {
  const question = { table: { columns: [{ label: 'x' }, { label: 'y' }], rows: [{ 0: 1, 1: 7 }], answers: { '0:undefined': '7' } } };
  const table = displayTableFor(question, { editable: true });
  // TableGrader shows an input in every `0:undefined` cell: the reader never says "y, 7".
  const read = tableReading(table);
  assert.doesNotMatch(read, /y, 7/, read);
  assert.equal(read, 'A table, 1 row. Columns: x; y. Row 1: x, blank; y, blank.');
});

test('S5: a cell the student filled is read as what they wrote; an empty one is "blank"; never a verdict', () => {
  const question = real('l2-cw-9');
  const table = displayTableFor(question, { editable: true, entries: { '0:cx': ' 8/5 ', '1:cx': '' } });
  const said = speechTextFor(tableReading(table));
  assert.match(said, /Row 1: x, negative 2; f of x, negative 2; c of x, you wrote 8 over 5; input of d, blank;/, said);
  assert.match(said, /Row 2: x, negative 1; f of x, negative 1; c of x, blank;/);
  assert.match(tableReading(table, { language: 'es' }), /c de x, escribiste 8\/5; input of d, en blanco/);
  // The reader is handed the student's text only — no grade travels with it,
  // so on a DOL, quiz or test before release there is no verdict to say.
  assert.doesNotMatch(said, /correct|wrong|check this|✓|✗/i);
  const grader = code('src/TableGrader.jsx');
  assert.match(grader, /<PublishFigureReading entry=\{\{ kind: 'table', label: '', table: displayTableFor\(question, \{ editable: true, entries: studentAnswers \}\) \}\} \/>/, 'the entries, not the grades');
});

test('an interactive plane does not contradict itself: the student\'s points are read, the given marks\' positions are withheld', async () => {
  const { describeCoordinatePlane } = await import('../../src/platform/language/graphDescription.js');
  const said = describeCoordinatePlane({ xMin: -5, xMax: 5, yMin: -5, yMax: 5, listPlottedPoints: true, lines: [{ m: 1, b: 0 }], points: [{ x: 2, y: 2 }] }).description;
  assert.match(said, /You plotted 1 point: \(2, 2\)\. Positions of the given marks are not read out while this question can be answered\./, said);
  assert.match(describeCoordinatePlane({ xMin: -5, xMax: 5, yMin: -5, yMax: 5, lines: [{ m: 1, b: 0 }] }).description, /Positions are not read out while this question can be answered\./);
});

// AX13: a composed step's figure was named by the step's prompt, so Read
// aloud said "State the domain. x from …" and then the step's own heading,
// "Step 1 of 2: State the domain.". The figure takes its graph's own label,
// else "Graph".
test('a composed step\'s figure is not named by the step\'s prompt', () => {
  const runner = code('src/platform/workflow/WorkflowRunner.jsx');
  assert.equal((runner.match(/<StageFigure graph=\{stage\?\.graph\} \/>/g) || []).length, 3, 'every step figure');
  assert.doesNotMatch(runner, /<StageFigure[^>]*label=\{stage\?\.prompt\}/);
  const figure = region(runner, 'function StageFigure(', '\n}\n', 'StageFigure');
  assert.match(figure, /ariaLabel: label \|\| spec\.ariaLabel \|\| 'Graph',/);
});
