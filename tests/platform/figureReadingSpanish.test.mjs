/*
 * AX05: UNDER AN AUTHORED SPANISH TRANSLATION, A FIGURE IS READ IN SPANISH.
 *
 * Read aloud read every figure's description in English, even when the
 * screen showed an authored Spanish translation and the reader's own words
 * were Spanish ("Una tabla", "Fila"): W7-5's decision 2, B-34, C2-78, VH-34,
 * C1-93. The generators now keep each sentence as a message
 * (src/platform/language/figureSay.js), and the Spanish pack
 * (packs/esFigures.js, loaded only for a Spanish reading) says the same
 * messages with the same numbers. Nothing is translated on the device.
 *
 *   before  no figure reading had Spanish.
 *   after   in Spanish: the coordinate plane while the question can be
 *           answered (every question graph and every tool plane, with its axis
 *           sentence and a fixable graph's scale caption), the interval number
 *           line and the pick-a-point number line.
 *           In English, after "La descripción de esta figura está en inglés.":
 *           the full reading once a question is closed or for the graph
 *           read-out, an author's description, the 3D model, the graph
 *           workspace, and a tool's own sentence the pack does not know.
 *
 * The browser half: tests/browser/readAloudTranslate.mjs (the real DOL graph
 * and the 3D model, with an authored Spanish prompt).
 */
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import React from 'react';

import { compileAuthoringIntentV5 } from '../../src/platform/contract/authoringIntentV5.js';
import { prepareQuestionForRuntimeRouting } from '../../src/platform/algebra/algebraWorkspaceRoute.js';
import { generateQuestion } from '../../src/problemGenerator.js';
import { normalizeContextualQuestion } from '../../src/platform/context/wordProblemLayer.js';
import { readComposedQuestion } from '../../src/platform/workflow/questionWorkflow.js';
import { selectPersistentWorkflowGraph } from '../../src/platform/workflow/workflowPresentation.js';
import { describeCoordinatePlane, GRAPH_WORDS } from '../../src/platform/language/graphDescription.js';
import { NUMBER_LINE_WORDS, numberLineReading, pointChoiceLineReading } from '../../src/platform/language/numberLineDescription.js';
import { AXIS_TITLE_WORDS } from '../../src/tools/shared/planeAxisTitles.js';
import { englishOnly, loadFigureWords, say, sayFigure } from '../../src/platform/language/figureSay.js';
import { questionReadingParts, questionReadingText } from '../../src/platform/language/questionReading.js';
import { speechTextFor } from '../../src/platform/language/speechText.js';
import esFigures from '../../src/platform/language/packs/esFigures.js';
import { figureCaptureServer } from './helpers/figureCapture.mjs';
import { executableSource, region } from './helpers/sourceContract.mjs';

const ROOT = new URL('../../', import.meta.url);
const ROOT_PATH = fileURLToPath(ROOT);
const code = (path) => executableSource(readFileSync(new URL(path, ROOT), 'utf8'));
const NOTE = 'La descripción de esta figura está en inglés.';

// Every number a reading says, in order: a count, a window end, a coordinate.
const numbersOf = (text) => String(text).match(/[−-]?\d+(?:\.\d+)?(?:\/\d+)?/g) || [];
// The English's numbers, in order, all in the Spanish; and none the English does not say.
const sameNumbers = (english, spanish, where) => {
  const wanted = numbersOf(english);
  const found = numbersOf(spanish);
  let at = 0;
  wanted.forEach((number) => {
    const next = found.indexOf(number, at);
    assert.ok(next >= 0, `${where}: ${number} is said in Spanish, in its place\nEN: ${english}\nES: ${spanish}`);
    at = next + 1;
  });
  found.forEach((number) => assert.ok(wanted.includes(number), `${where}: the Spanish says no number the English does not (${number})\nEN: ${english}\nES: ${spanish}`));
};

let capture = null;
before(async () => { capture = await figureCaptureServer(); });
after(async () => { await capture?.close(); });

/* --------------------------------------------------------- the pack's words */

test('the Spanish pack says every sentence the figure generators say, and no other', () => {
  const english = { ...GRAPH_WORDS, ...NUMBER_LINE_WORDS, ...AXIS_TITLE_WORDS };
  const ids = Object.keys(english);
  // Measured: every message the three generators have (51 today).
  assert.ok(ids.length >= 50, `${ids.length} figure messages`);
  ids.forEach((id) => assert.equal(typeof esFigures.words[id], 'function', `Spanish for "${id}"`));
  Object.keys(esFigures.words).forEach((id) => assert.ok(Object.hasOwn(english, id), `"${id}" is a message a generator says`));
  // Built from the same pieces, a sentence keeps the English's numbers.
  assert.equal(sayFigure([say('window', '−6', '6', '−6', '6')], esFigures.words), 'El eje x va de −6 a 6 y el eje y, de −6 a 6.');
  assert.equal(sayFigure([say('givenMarks', 2, ['A', 'B'], 1, 0, 0)], esFigures.words), '2 puntos con las etiquetas A y B y 1 círculo abierto.');
});

test('a piece the language has no words for leaves the whole figure without a reading in it', () => {
  const words = esFigures.words;
  assert.equal(sayFigure([say('lineCount', 2), englishOnly('Boundary line 1: solid.')], words), null, 'a tool\'s own English sentence');
  assert.equal(sayFigure([say('noSuchSentence')], words), null, 'an unknown message');
  assert.equal(sayFigure([say('lineCount', 2)], null), null, 'no words loaded');
  // In English the same sentence is said as written.
  assert.equal(sayFigure([say('lineCount', 2), englishOnly('Boundary line 1: solid.')], GRAPH_WORDS, { english: true }), '2 lines. Boundary line 1: solid.');
  // The item's own words (a caption, a label) are said as written in either language.
  assert.equal(sayFigure([say('lineCount', 1), 'Figure 3 is not to scale.'], words), '1 recta. Figure 3 is not to scale.');
});

/* ------------------------------------------- the same numbers, in Spanish */

test('a Spanish figure reading says the English reading\'s numbers, in order, over many figures', () => {
  let seed = 20261025;
  const rand = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  const pick = (list) => list[Math.floor(rand() * list.length)];
  const int = (lo, hi) => lo + Math.floor(rand() * (hi - lo + 1));
  let said = 0;
  for (let n = 0; n < 400; n += 1) {
    const plane = describeCoordinatePlane({
      xMin: pick([-10, -6, -4, -6.374046]), xMax: pick([10, 6, 7, 6.374046]), yMin: pick([-10, -6, -3.5]), yMax: pick([10, 16, 3.5]),
      windowSteps: rand() < 0.4 ? { x: 1, y: 1 } : null,
      listPlottedPoints: rand() < 0.5, snapStep: pick([1, 0.5]),
      points: Array.from({ length: int(0, 4) }, () => ({ x: int(-5, 5) / pick([1, 2]), y: int(-5, 5), label: pick(['', 'A', 'P₁']), marker: pick([undefined, undefined, 'open', 'closed', 'arrow']) })),
      lines: Array.from({ length: int(0, 2) }, () => ({ m: int(-3, 3), b: int(-4, 4) })),
      functions: Array.from({ length: int(0, 2) }, () => (x) => x * x - 2),
      verticalLines: Array.from({ length: int(0, 2) }, () => int(-3, 3)),
      horizontalLines: Array.from({ length: int(0, 1) }, () => int(-3, 3)),
      axisNumbersHidden: pick([{}, {}, { x: true }, { y: true }, { x: true, y: true }]),
      emptyText: pick(['Nothing is plotted.', 'Nothing is plotted yet.']),
      hasUndescribedMarks: rand() < 0.2,
      toolMarks: pick([null, { kinds: '1 shaded region, where every inequality is true.' }, { kinds: 'A segment joins the origin to each point.' }]),
    });
    const line = numberLineReading({
      min: pick([-10, -7.5]), max: pick([10, 7.5]), labelStep: pick([0, 1, 2.5]), owner: pick(['student', 'given']),
      pieces: Array.from({ length: int(0, 2) }, () => ({ min: pick([-Infinity, -3, 13 / 8]), max: pick([4, Infinity]), minClosed: rand() < 0.5, maxClosed: rand() < 0.5 })),
      pending: pick([null, { value: 2, closed: false }]),
    });
    const choices = pointChoiceLineReading({ choices: pick([[-10, -5, 0, 5, 10], [1.5, 2], []]), selected: pick([null, 5, -2.5]) });
    [[plane.description, plane.say], [line.text, line.say], [choices.text, choices.say]].forEach(([english, says]) => {
      const spanish = sayFigure(says, esFigures.words);
      assert.ok(spanish, `has Spanish: ${english}`);
      sameNumbers(english, spanish, `figure ${n}`);
      said += 1;
    });
  }
  assert.equal(said, 1200);
});

test('the full reading of a closed question has no messages yet: it stays English', () => {
  const closed = describeCoordinatePlane({ xMin: -6, xMax: 6, yMin: -6, yMax: 6, lines: [{ m: 1, b: 2 }], detail: 'features' });
  assert.equal(closed.detail, 'features');
  assert.equal(closed.say, null);
  const open = describeCoordinatePlane({ xMin: -6, xMax: 6, yMin: -6, yMax: 6, lines: [{ m: 1, b: 2 }] });
  assert.ok(Array.isArray(open.say));
  assert.equal(sayFigure(open.say, GRAPH_WORDS, { english: true }), open.description, 'the English is said from the same messages');
});

/* ------------------------------------------------------------- the reader */

test('the reader: Spanish where the figure can say it, its English and a note where not, English unchanged', () => {
  const question = { prompt: 'La gráfica muestra una función.' };
  const open = describeCoordinatePlane({ xMin: -4, xMax: 7, yMin: -6, yMax: 16, functions: [(x) => 3 * x + 1], points: [{ x: -1, y: -2, marker: 'closed' }, { x: 4, y: 13, marker: 'open' }] });
  const graph = { kind: 'figure', label: 'Question graph', text: open.description, say: open.say };
  const model = { kind: 'figure', label: '3D model', text: '3D model with the x, y and z axes. Dashed lines mark where shown planes cross.' };
  const read = (figures, options) => questionReadingParts(question, { figures, ...options }).filter((part) => part.kind === 'figure');

  const [spanish] = read([graph], { language: 'es', figurePack: esFigures });
  assert.equal(spanish.label, 'Gráfica de la pregunta', 'the platform\'s name, in Spanish');
  assert.equal(spanish.text, 'Gráfica de la pregunta. El eje x va de −4 a 7 y el eje y, de −6 a 16. 1 curva. 1 círculo abierto y 1 círculo cerrado. Las posiciones no se leen mientras se pueda responder esta pregunta.');
  assert.equal(speechTextFor(spanish.text, { language: 'es' }).includes('El eje x va de negativo 4 a 7'), true);

  // A figure with no Spanish: its English, after a sentence that says so.
  const [english] = read([model], { language: 'es', figurePack: esFigures });
  assert.equal(english.text, `Modelo 3D. ${NOTE} 3D model with the x, y and z axes. Dashed lines mark where shown planes cross.`);
  // A tool's own sentence the pack does not know: the same.
  const marked = describeCoordinatePlane({ xMin: -6, xMax: 6, yMin: -6, yMax: 6, hasUndescribedMarks: true, toolMarks: { kinds: 'Boundary line 1: solid.' } });
  assert.match(read([{ kind: 'figure', label: 'Coordinate plane', text: marked.description, say: marked.say }], { language: 'es', figurePack: esFigures })[0].text, new RegExp(`^Plano de coordenadas\\. ${NOTE} x from −6 to 6`));
  // The Spanish words not loaded yet (or not loadable): English, and said so.
  assert.equal(read([graph], { language: 'es' })[0].text, `Gráfica de la pregunta. ${NOTE} ${open.description}`.replace('Gráfica de la pregunta', 'Question graph'));
  // An author's name for a figure is said as written.
  assert.equal(read([{ ...graph, label: 'Gráfica del viaje' }], { language: 'es', figurePack: esFigures })[0].label, 'Gráfica del viaje');

  // English: unchanged, no note, even with the Spanish words at hand.
  const [plain] = read([graph], { language: 'en', figurePack: esFigures });
  assert.equal(plain.label, 'Question graph');
  assert.equal(plain.text, `Question graph. ${open.description}`);
  assert.doesNotMatch(questionReadingText(questionReadingParts(question, { figures: [graph, model], figurePack: esFigures })), /inglés|El eje/);

  // A table keeps the name its author gave it; its frame was already Spanish.
  const table = { kind: 'table', label: 'Phone bill', table: { columns: [{ key: 'x', label: 'x' }], rows: [[1]] } };
  assert.equal(questionReadingParts(question, { figures: [table], language: 'es', figurePack: esFigures }).find((part) => part.kind === 'table').text, 'Phone bill, de 1 fila. Columnas: x. Fila 1: x, 1.');
});

/* ------------------------- real exit tickets, quizzes and tests, in Spanish */

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

// What would give a position or a value away, in Spanish.
const POSITIONS_ES = /\(\s*[−-]?\d|\bcruza\b|\bpasa por\b|\bentre\b|\besquinas?\b|punto (?:alto|bajo)/;

test('every real assessment graph is read in Spanish while open, with no position; once closed, in English', async () => {
  const { default: GraphDisplay } = await capture.load('/src/GraphDisplay.jsx');
  const { QuestionLifecycleProvider } = await capture.load('/src/platform/question/QuestionLifecycleContext.jsx');
  const { staticGraphSpec } = await capture.load('/src/platform/workflow/WorkflowRunner.jsx');
  // The graph the screen draws (the same as readAloudFigures.test.mjs).
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
  const constructed = (question) => question.type === 'systemsWorkspace' && question.interaction === 'construct';
  const assessed = realQuestions().filter(({ role, question }) => ['dol', 'quiz', 'test'].includes(role) && question.graph && !constructed(question));
  assert.ok(assessed.length >= 6, `${assessed.length} real assessment items with a graph`);
  assessed.forEach(({ stored, question }) => {
    const published = (lifecycle) => {
      const { entries } = capture.render(React.createElement(QuestionLifecycleProvider, lifecycle, React.createElement(GraphDisplay, { graph: drawnGraph(question), title: 'Question graph' })));
      assert.equal(entries.length, 1, `${stored.questionId}: one figure`);
      return entries[0];
    };
    const open = published({ terminal: false, positionsReadable: false });
    const spanish = sayFigure(open.say, esFigures.words);
    assert.ok(spanish, `${stored.questionId}: read in Spanish while open`);
    assert.equal(sayFigure(open.say, GRAPH_WORDS, { english: true }), open.text, `${stored.questionId}: the messages say what the English says`);
    sameNumbers(open.text, spanish, stored.questionId);
    assert.match(spanish, /Las posiciones no se leen mientras se pueda responder esta pregunta\./, stored.questionId);
    assert.doesNotMatch(spanish, POSITIONS_ES, `${stored.questionId}: ${spanish}`);
    // Closed: the full reading, English only for now, and the reader says so.
    const closed = published({ terminal: true, positionsReadable: true });
    assert.equal(closed.say, undefined, `${stored.questionId}: the full reading has no Spanish yet`);
    const part = questionReadingParts(question, { figures: [closed], language: 'es', figurePack: esFigures }).find((entry) => entry.kind === 'figure');
    assert.ok(part.text.startsWith(`Gráfica de la pregunta. ${NOTE} `), `${stored.questionId}: ${part.text.slice(0, 80)}`);
  });
});

/* --------------------------------------------- what each figure publishes */

test('the shared plane publishes its axis sentence and its reading as messages; an author\'s description, none', async () => {
  const { default: CoordinatePlane } = await capture.load('/src/tools/shared/CoordinatePlane.jsx');
  const props = { xMin: -1, xMax: 7, yMin: -20, yMax: 100, xAxisTitle: 'Hours studied', yAxisTitle: 'Quiz score (points)', points: [{ x: 1, y: 60 }, { x: 2, y: 70 }], lines: [{ m: 5, b: 55 }], enlargeable: false, ariaLabel: 'Scatter plot of the data and your model' };
  const { markup, entries } = capture.render(React.createElement(CoordinatePlane, props));
  assert.equal(entries.length, 1);
  const [plane] = entries;
  const description = /<p id="mm-plane-desc-[^"]*"[^>]*>([^<]*)<\/p>/.exec(markup)?.[1];
  assert.equal(plane.text, description, 'the reading is the plane\'s own description');
  assert.equal(sayFigure(plane.say, { ...GRAPH_WORDS, ...AXIS_TITLE_WORDS }, { english: true }), plane.text, 'its messages say the same');
  assert.equal(sayFigure(plane.say, esFigures.words), 'El eje x horizontal muestra Hours studied. El eje y vertical muestra Quiz score (points). El eje x va de −1 a 7 y el eje y, de −20 a 100. 1 recta. 2 puntos. Las posiciones no se leen mientras se pueda responder esta pregunta.');
  // An author's own description is English only: no messages travel.
  const authored = capture.render(React.createElement(CoordinatePlane, { ...props, description: 'A scatter plot of ten students.' })).entries[0];
  assert.equal(authored.say, undefined);
  // Nor with the full reading.
  assert.equal(capture.render(React.createElement(CoordinatePlane, { ...props, describeFeatures: true })).entries[0].say, undefined);
});

test('the question graph publishes its caption as written and its scale line as a message', async () => {
  const { default: GraphDisplay } = await capture.load('/src/GraphDisplay.jsx');
  const { entries } = capture.render(React.createElement(GraphDisplay, { graph: { xMin: -5, xMax: 5, yMin: -5, yMax: 5, functions: [{ type: 'linear', m: 1, b: 0 }], caption: 'Each square is one unit.' }, title: 'Question graph' }));
  assert.equal(entries.length, 1);
  assert.equal(sayFigure(entries[0].say, esFigures.words), 'El eje x va de −5 a 5 y el eje y, de −5 a 5. 1 recta. Las posiciones no se leen mientras se pueda responder esta pregunta. Each square is one unit.');
  assert.equal(sayFigure(entries[0].say, GRAPH_WORDS, { english: true }), entries[0].text);
  assert.equal(sayFigure([say('scaleCounts', 2, 5)], esFigures.words), 'El eje x va de 2 en 2 y el eje y, de 5 en 5.');
  assert.equal(sayFigure([say('scaleCounts', 2, 5)], GRAPH_WORDS, { english: true }), 'The x-axis counts by 2s and the y-axis counts by 5s.');
});

test('the number lines publish their readings as messages', async () => {
  const { default: NumberLine } = await capture.load('/src/NumberLine.jsx');
  const { entries } = capture.render(React.createElement(NumberLine, { question: { target: 5, choices: [-10, -5, 0, 5, 10] }, onStateChange: () => {}, feedback: null }));
  const line = entries.find((entry) => entry.label === 'Number line');
  assert.equal(line.text, 'Number line with points at −10, −5, 0, 5 and 10. No point is selected yet.');
  assert.equal(sayFigure(line.say, esFigures.words), 'Recta numérica con puntos en −10, −5, 0, 5 y 10. Todavía no hay ningún punto seleccionado.');
  const interval = numberLineReading({ min: -7.5, max: 7.5, labelStep: 2.5, pieces: [{ min: 13 / 8, max: Infinity, minClosed: true }] });
  assert.equal(sayFigure(interval.say, esFigures.words), 'Recta numérica de −7.5 a 7.5, con números cada 2.5. Tu gráfica: Sombreada desde un círculo cerrado en 13/8 hacia la derecha, terminando en una flecha.');
  assert.match(code('src/tools/intervalNumberLine/IntervalNumberLine.jsx'), /<PublishFigureReading entry=\{\{ kind: 'figure', label: 'Number line', text: lineDescription, say: lineSay \}\} \/>/);
});

/* ---------------------------------------------------- loaded only for Spanish */

test('the Spanish words are loaded only for a Spanish reading, and never on the first load', async () => {
  // Only a dynamic import reaches the pack: no student downloads it until Read
  // aloud reads a question in Spanish.
  const importers = [];
  const IMPORTS_PACK = /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)['"][^'"]*esFigures\.js['"]/;
  const walk = (dir) => readdirSync(join(ROOT_PATH, dir), { withFileTypes: true }).forEach((entry) => {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) walk(path);
    else if (/\.(m?jsx?)$/.test(entry.name) && IMPORTS_PACK.test(code(path))) importers.push(path);
  });
  walk('src');
  assert.deepEqual(importers, ['src/platform/language/figureSay.js']);
  assert.match(code('src/platform/language/figureSay.js'), /es: \(\) => import\('\.\/packs\/esFigures\.js'\),/);
  assert.equal((await loadFigureWords('es-MX')).words, esFigures.words, 'a regional Spanish gets the Spanish words');
  assert.equal(await loadFigureWords('vi'), null, 'no words for a language without them');

  // QuestionEngine asks for them only when the reading is not English, and
  // hands them to the reader.
  const engine = code('src/QuestionEngine.jsx');
  const load = region(engine, 'const [loadedFigureWords, setLoadedFigureWords] = useState(null);', '}, [readAloudLanguage]);', 'the load');
  assert.match(load, /if \(readAloudLanguage === 'en'\) return undefined;/);
  assert.match(load, /loadFigureWords\(readAloudLanguage\)/);
  assert.match(engine, /const figurePack = loadedFigureWords\?\.language === readAloudLanguage \? loadedFigureWords\.pack : null;/, 'never another language\'s words');
  const reading = region(engine, 'const readingParts = useMemo(', ');', 'the reading');
  assert.match(reading, /language: readAloudLanguage,\s*figures: figureReadings,\s*figurePack,/);
});
