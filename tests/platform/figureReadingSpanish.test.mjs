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
 *           line and the pick-a-point number line; in slice 2, the plane's
 *           full reading once a question is closed or for the graph read-out
 *           (AX03), with its positions and the same numbers, the 3D model (its
 *           equations in Spanish words) and the graph workspace.
 *           In English, after "La descripción de esta figura está en inglés.":
 *           an author's description, and a tool's own sentence the pack does
 *           not know. Each figure's screen-reader description follows the same
 *           rule: Spanish, marked lang="es", where its messages say it all;
 *           English and unmarked otherwise (slice 2). In slice 3 the tools'
 *           own sentences are messages too: the Systems Workspace's graph and
 *           region corners and the sideways parabola are said in Spanish.
 *
 * The browser half: tests/browser/readAloudTranslate.mjs (the real DOL graph,
 * the 3D model and the graph workspace, with an authored Spanish prompt).
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
import { studentBuildInequalityEnabled } from '../../functions/shared/toolMath/systemsWorkspace/inequalityBuilderAdapter.mjs';
import { describeCoordinatePlane, GRAPH_WORDS } from '../../src/platform/language/graphDescription.js';
import { NUMBER_LINE_WORDS, numberLineReading, pointChoiceLineReading } from '../../src/platform/language/numberLineDescription.js';
import { AXIS_TITLE_WORDS } from '../../src/tools/shared/planeAxisTitles.js';
import { THREE_PLANE_WORDS, threePlaneModelReading } from '../../src/tools/systemsWorkspace/threePlaneDescription.js';
import { GRAPH_WORKSPACE_WORDS, graphWorkspaceReading } from '../../src/platform/language/graphWorkspaceDescription.js';
import { ROW_CHOOSER_WORDS } from '../../src/tools/shared/toolTableReading.js';
import { INEQUALITY_GRAPH_WORDS, inequalityGraphMarksReading, regionCornersReading } from '../../src/tools/systemsWorkspace/inequalityGraphMarks.js';
import { boundaryFromSlopeIntercept, boundaryWithChosenSide, feasibleRegionPolygon } from '../../src/tools/systemsWorkspace/inequalityBuilderAdapter.js';
import { englishOnly, itemWords, loadFigureWords, say, sayFigure, sayFigureParts } from '../../src/platform/language/figureSay.js';
import { describedIn } from '../../src/platform/language/figureReadings.js';
import { questionReadingParts, questionReadingText } from '../../src/platform/language/questionReading.js';
import { speechTextFor } from '../../src/platform/language/speechText.js';
import esFigures from '../../src/platform/language/packs/esFigures.js';
import { figureCaptureServer } from './helpers/figureCapture.mjs';
import { executableSource, region } from './helpers/sourceContract.mjs';
// A tool that keeps its drafts needs a browser's storage to render.
import { withBrowser as withWindow } from './helpers/studentToolRender.mjs';

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
  const english = { ...GRAPH_WORDS, ...NUMBER_LINE_WORDS, ...AXIS_TITLE_WORDS, ...THREE_PLANE_WORDS, ...GRAPH_WORKSPACE_WORDS, ...ROW_CHOOSER_WORDS, ...INEQUALITY_GRAPH_WORDS };
  const ids = Object.keys(english);
  // Measured: every message the generators have (181 today: 74 in slice 1;
  // 61 for the full reading, 12 for the 3D model, 8 for the graph workspace
  // and 9 for process mode's row chooser in slice 2; in slice 3, 15 for the
  // Systems Workspace's own sentences and 2 for the sideways parabola).
  assert.ok(ids.length >= 181, `${ids.length} figure messages`);
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
      // A line's style, a reference line, and the shaded sides of an
      // inequality's figure (N38, CT04): said in Spanish with the same numbers.
      lines: Array.from({ length: int(0, 2) }, () => ({ m: int(-3, 3), b: int(-4, 4), ...(rand() < 0.4 ? { dash: '10 6' } : {}), ...(rand() < 0.15 ? { reference: true } : {}) })),
      functions: Array.from({ length: int(0, 2) }, () => (x) => x * x - 2),
      curveDashes: rand() < 0.3 ? [true, false] : null,
      verticalLines: Array.from({ length: int(0, 2) }, () => (rand() < 0.5 ? int(-3, 3) : { x: int(-3, 3), boundaryStyle: pick(['solid', 'dashed']) })),
      horizontalLines: Array.from({ length: int(0, 1) }, () => int(-3, 3)),
      polylines: rand() < 0.3 ? [{ points: [[0, 0], [1, 2]], dash: rand() < 0.5 ? '10 6' : undefined }] : [],
      halfPlanes: Array.from({ length: int(0, 2) }, () => ({
        sides: Array.from({ length: int(1, 2) }, () => pick([{ side: pick(['above', 'below']), line: int(0, 1) }, { side: pick(['left', 'right']), vertical: int(0, 1) }, { side: 'below' }])),
        polygon: [[0, 0], [2, 0], [0, 2]],
      })),
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

/*
 * THE FULL READING (slice 2): a closed question, or the graph read-out while
 * it is open (AX03). It was read in English after the note; it is now said in
 * Spanish, positions included, with the English's numbers in the same order.
 * Its English is said from the same messages, so the two cannot drift.
 */
test('the full reading of a closed question is said in Spanish, with the English\'s numbers, over many figures', () => {
  let seed = 20261105;
  const rand = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  const pick = (list) => list[Math.floor(rand() * list.length)];
  const int = (lo, hi) => lo + Math.floor(rand() * (hi - lo + 1));
  const curves = [(x) => x * x - 2, (x) => (x - 1) ** 2, (x) => (x < 2 ? Math.sqrt(2 - x) : NaN), (x) => Math.sin(x) * 3, (x) => 20 * x, (x) => 1 / x];
  const said = new Set();
  for (let n = 0; n < 400; n += 1) {
    const plane = describeCoordinatePlane({
      detail: 'features',
      xMin: pick([-10, -6, -5, -6.374046]), xMax: pick([10, 6, 7]), yMin: pick([-10, -6, -3.5]), yMax: pick([10, 16, 3.5]),
      windowSteps: rand() < 0.3 ? { x: 1, y: 1 } : null, snapStep: pick([1, 0.5]), minorGridDrawn: rand() < 0.5,
      points: Array.from({ length: int(0, 4) }, () => ({ x: int(-12, 12) / pick([1, 2, 3]), y: int(-12, 12) / pick([1, 2]), label: pick(['', 'A', 'P₁', '(1, 3)']), marker: pick([undefined, undefined, 'open', 'closed', 'arrow']), vector: pick([undefined, [1, 1], [-1, 1], [0, -1], [-1, -1]]) })),
      lines: Array.from({ length: int(0, 2) }, () => ({ m: pick([int(-3, 3), 0.5, 7]), b: pick([int(-4, 4), 2.3, 40]), ...(rand() < 0.4 ? { dash: '10 6' } : {}), ...(rand() < 0.15 ? { reference: true } : {}) })),
      functions: Array.from({ length: int(0, 2) }, () => pick(curves)),
      curveDashes: rand() < 0.3 ? [true, false] : null,
      verticalLines: Array.from({ length: int(0, 2) }, () => (rand() < 0.5 ? pick([int(-3, 3), 1.5]) : { x: int(-3, 3), boundaryStyle: pick(['solid', 'dashed']) })),
      horizontalLines: Array.from({ length: int(0, 1) }, () => pick([int(-3, 3), 2.5])),
      polylines: rand() < 0.3 ? [{ points: Array.from({ length: int(1, 14) }, () => [int(-5, 5) / pick([1, 2]), int(-5, 5)]), dash: rand() < 0.5 ? '10 6' : undefined }] : [],
      regions: rand() < 0.2 ? [Array.from({ length: int(3, 14) }, () => [int(-5, 5), int(-5, 5) / pick([1, 2])])] : [],
      halfPlanes: Array.from({ length: int(0, 2) }, () => ({
        sides: Array.from({ length: int(1, 2) }, () => pick([{ side: pick(['above', 'below']), line: int(0, 1) }, { side: pick(['left', 'right']), vertical: int(0, 1) }, { side: 'below' }])),
        polygon: [[0, 0], [2, 0], [0, 2]],
      })),
      emptyText: pick(['Nothing is plotted.', 'Nothing is plotted yet.']),
    });
    assert.equal(plane.detail, 'features');
    assert.equal(sayFigure(plane.say, GRAPH_WORDS, { english: true }), plane.description, `figure ${n}: the English is said from the same messages`);
    const spanish = sayFigure(plane.say, esFigures.words);
    assert.ok(spanish, `has Spanish: ${plane.description}`);
    sameNumbers(plane.description, spanish, `figure ${n}`);
    plane.say.forEach((segment) => said.add(segment?.id));
  }
  // The figures above reach every kind of sentence the full reading has.
  ['markReading', 'outsideWindow', 'curveTotal', 'dashedVerticalAt', 'solidVerticalAt', 'dashedHorizontalAt', 'shadedSide', 'regionShadedSides', 'pathThrough', 'dashedPathThrough', 'regionCorners', 'pointsRead']
    .forEach((id) => assert.ok(said.has(id), `a figure says ${id}`));
});

test('the full reading in Spanish: each line, curve, guide, shaded side, path, region and point, where it is', () => {
  const spanish = (input) => sayFigure(describeCoordinatePlane({ detail: 'features', xMin: -5, xMax: 5, yMin: -5, yMax: 5, ...input }).say, esFigures.words);
  // Two lines, one dashed, and the region between their sides (N38).
  assert.equal(
    spanish({ xMin: -6, xMax: 6, yMin: -6, yMax: 6, lines: [{ m: 1, b: 2 }, { m: -0.5, b: 1.5, dash: '6 4' }], halfPlanes: [{ sides: [{ side: 'above', line: 0 }, { side: 'below', line: 1 }], polygon: [[0, 0], [1, 0], [0, 1]] }] }),
    'El eje x va de −6 a 6 y el eje y, de −6 a 6. 2 rectas. La recta 1 (continua) sube de izquierda a derecha, cruza el eje y en 2, cruza el eje x en −2 y pasa por (0, 2) y (2, 4). La recta 2 (discontinua) baja de izquierda a derecha, cruza el eje y entre 0 y 2 y cruza el eje x entre 2 y 4. La región por encima de la recta 1 y por debajo de la recta 2 está sombreada.',
  );
  // Two curves, the first solid and the second dashed; guides; a shaded side of a vertical line.
  assert.equal(
    spanish({ functions: [(x) => x * x - 2, (x) => (x < 2 ? Math.sqrt(2 - x) : NaN)], verticalLines: [{ x: 1.5, boundaryStyle: 'dashed' }, { x: 3, boundaryStyle: 'solid' }], horizontalLines: [2], halfPlanes: [{ sides: [{ side: 'left', vertical: 1 }], polygon: [] }] }),
    'El eje x va de −5 a 5 y el eje y, de −5 a 5. 2 curvas. La curva 1 (con trazo continuo) entra por el borde superior en (x entre −4 y −2, y entre 4 y 6), cruza el eje x entre −2 y 0, tiene un punto bajo en (0, −2), cruza el eje x entre 0 y 2 y sale por el borde superior en (x entre 2 y 4, y entre 4 y 6). La curva 2 (con trazo discontinuo) empieza en el borde izquierdo en (x entre −6 y −4, y entre 2 y 4), cruza el eje y entre 0 y 2 y se detiene en (x entre 0 y 2, y entre 0 y 2). Recta vertical discontinua entre 0 y 2 en el eje x. Recta vertical continua entre 2 y 4 en el eje x. Recta horizontal discontinua que pasa por 2 en el eje y. La región a la izquierda de la recta vertical entre 2 y 4 está sombreada.',
  );
  // A line off the window, a reference line (CT04), a dashed path and a region by its corners.
  assert.equal(
    spanish({ lines: [{ m: 0, b: 7 }, { m: 2, b: 1, reference: true }], polylines: [{ points: [[0, 0], [1, 2], [2.5, 3]], dash: '6 4' }], regions: [[[0, 0], [2, 0], [0, 2]]] }),
    'El eje x va de −5 a 5 y el eje y, de −5 a 5. 1 recta. 1 recta de referencia. La recta 1 está fuera de la ventana. La recta de referencia sube de izquierda a derecha, cruza el eje y entre 0 y 2 y cruza el eje x entre −2 y 0. La línea poligonal 1 (discontinua) pasa por (0, 0), (x entre 0 y 2, y 2) y (x entre 2 y 4, y entre 2 y 4). La región sombreada 1 tiene esquinas en (0, 0), (2, 0) y (0, 2).',
  );
  // Every point: its label as the plane draws it, open and closed dots, an
  // arrowhead's way, and one outside the window.
  assert.equal(
    spanish({ minorGridDrawn: true, points: [{ x: 2, y: 3, label: 'A' }, { x: -1, y: -2, marker: 'closed' }, { x: 4, y: 1, marker: 'open' }, { x: 3, y: 3, marker: 'arrow', vector: [-1, 1] }, { x: 9, y: 2 }] }),
    'El eje x va de −5 a 5 y el eje y, de −5 a 5. 4 puntos y 1 punta de flecha: A en (2, 3); (−1, −2), círculo cerrado; (4, 1), círculo abierto; punta de flecha en (3, 3) que apunta hacia arriba y a la izquierda; (9, 2), fuera de la ventana.',
  );
  // Nothing drawn: the plane's own sentence. The sideways parabola's own
  // sentence is one the pack says (slice 3); a sentence it does not know, with
  // no messages, keeps the figure in English, as while it is open.
  assert.equal(spanish({}), 'El eje x va de −5 a 5 y el eje y, de −5 a 5. No hay nada graficado.');
  assert.equal(spanish({ hasUndescribedMarks: true, toolMarks: { kinds: '1 curve.', features: '1 curve, opening to the right.' } }), 'El eje x va de −5 a 5 y el eje y, de −5 a 5. 1 curva, que abre hacia la derecha.');
  assert.equal(spanish({ hasUndescribedMarks: true, toolMarks: { kinds: '1 curve.', features: '1 curve, opening to the north.' } }), null);
  // The Spanish is said with the reader's own words for the mathematics.
  assert.match(speechTextFor(spanish({ lines: [{ m: 1, b: -2 }] }), { language: 'es' }), /cruza el eje y en negativo 2, cruza el eje x en 2 y pasa por el punto 0, negativo 2 y el punto 2, 0\.$/);
});

/* ------------------------------------------------------------- the reader */

test('the reader: Spanish where the figure can say it, its English and a note where not, English unchanged', () => {
  const question = { prompt: 'La gráfica muestra una función.' };
  const open = describeCoordinatePlane({ xMin: -4, xMax: 7, yMin: -6, yMax: 16, functions: [(x) => 3 * x + 1], points: [{ x: -1, y: -2, marker: 'closed' }, { x: 4, y: 13, marker: 'open' }] });
  const graph = { kind: 'figure', label: 'Question graph', text: open.description, say: open.say };
  const authored = { kind: 'figure', label: 'Graph', text: 'A scatter plot of ten students.' };
  const read = (figures, options) => questionReadingParts(question, { figures, ...options }).filter((part) => part.kind === 'figure');

  const [spanish] = read([graph], { language: 'es', figurePack: esFigures });
  assert.equal(spanish.label, 'Gráfica de la pregunta', 'the platform\'s name, in Spanish');
  assert.equal(spanish.text, 'Gráfica de la pregunta. El eje x va de −4 a 7 y el eje y, de −6 a 16. 1 curva. 1 círculo abierto y 1 círculo cerrado. Las posiciones no se leen mientras se pueda responder esta pregunta.');
  assert.equal(speechTextFor(spanish.text, { language: 'es' }).includes('El eje x va de negativo 4 a 7'), true);

  // A figure with no Spanish (an author's description): its English, after a sentence that says so.
  const [english] = read([authored], { language: 'es', figurePack: esFigures });
  assert.equal(english.text, `Gráfica. ${NOTE} A scatter plot of ten students.`);
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
  assert.doesNotMatch(questionReadingText(questionReadingParts(question, { figures: [graph, authored], figurePack: esFigures })), /inglés|El eje/);

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

test('every real assessment graph is read in Spanish while open, with no position; once closed, in full, in Spanish', async () => {
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
  // The Systems Workspace's construct form and its student-build inequalities
  // draw their own plane for the student to build on: `graph` there is that
  // plane's window, never a figure GraphDisplay draws (QuestionVisual is the
  // typed graders'), so there is no drawn graph to read.
  const constructed = (question) => question.type === 'systemsWorkspace'
    && (question.interaction === 'construct' || studentBuildInequalityEnabled(question));
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
    // Closed: the full reading, positions and all, in Spanish too (slice 2),
    // with the same numbers, and no note that it is in English.
    const closed = published({ terminal: true, positionsReadable: true });
    const full = sayFigure(closed.say, esFigures.words);
    assert.ok(full, `${stored.questionId}: the full reading has Spanish`);
    assert.equal(sayFigure(closed.say, GRAPH_WORDS, { english: true }), closed.text, `${stored.questionId}: closed, the messages say what the English says`);
    sameNumbers(closed.text, full, `${stored.questionId} closed`);
    assert.match(full, POSITIONS_ES, `${stored.questionId}: closed, its positions are said: ${full}`);
    const part = questionReadingParts(question, { figures: [closed], language: 'es', figurePack: esFigures }).find((entry) => entry.kind === 'figure');
    assert.ok(part.text.startsWith('Gráfica de la pregunta. El eje x va de ') && !part.text.includes(NOTE), `${stored.questionId}: ${part.text.slice(0, 80)}`);
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
  // The full reading (a closed question, the graph read-out) travels as messages too (slice 2).
  const full = capture.render(React.createElement(CoordinatePlane, { ...props, describeFeatures: true })).entries[0];
  assert.equal(sayFigure(full.say, { ...GRAPH_WORDS, ...AXIS_TITLE_WORDS }, { english: true }), full.text);
  assert.equal(sayFigure(full.say, esFigures.words), 'El eje x horizontal muestra Hours studied. El eje y vertical muestra Quiz score (points). El eje x va de −1 a 7 y el eje y, de −20 a 100. 1 recta. La recta 1 sube de izquierda a derecha, cruza el eje y entre 40 y 60 y pasa por (1, 60) y (5, 80). 2 puntos: (1, 60); (x 2, y entre 60 y 80).');
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

test('the graph read-out (AX03) is said in Spanish while the question is open; an author\'s description stays English', async () => {
  const { default: GraphDisplay } = await capture.load('/src/GraphDisplay.jsx');
  const { GraphReadOutProvider } = await capture.load('/src/platform/supports/graphReadOut.js');
  const graph = { xMin: -5, xMax: 5, yMin: -5, yMax: 5, points: [{ x: 2, y: 3, label: 'A' }], functions: [{ type: 'linear', m: 1, b: -1 }] };
  const read = (shown, enabled) => capture.render(React.createElement(GraphReadOutProvider, { enabled }, React.createElement(GraphDisplay, { graph: shown, title: 'Question graph', enlargeable: false }))).entries[0];
  // Everyone else hears no position while it can be answered.
  assert.match(sayFigure(read(graph, false).say, esFigures.words), /^El eje x va de −5 a 5 y el eje y, de −7 a 5\. 1 recta\. 1 punto con la etiqueta A\. Las posiciones no se leen/);
  // The read-out's student hears the full reading, in Spanish, with the English's numbers.
  const readOut = read(graph, true);
  const spanish = sayFigure(readOut.say, esFigures.words);
  assert.equal(spanish, 'El eje x va de −5 a 5 y el eje y, de −7 a 5. 1 recta. La recta 1 sube de izquierda a derecha, cruza el eje y en −1, cruza el eje x en 1 y pasa por (0, −1) y (1, 0). 1 punto: A en (2, 3).');
  sameNumbers(readOut.text, spanish, 'the read-out');
  const part = questionReadingParts({ prompt: 'La gráfica muestra una recta.' }, { figures: [readOut], language: 'es', figurePack: esFigures }).find((entry) => entry.kind === 'figure');
  assert.equal(part.text, `Gráfica de la pregunta. ${spanish}`);
  // An author's description, then the full reading: the author's English words keep it English.
  const authored = read({ ...graph, accessibleDescription: 'One line and one labelled point.' }, true);
  assert.equal(authored.say, undefined);
  assert.match(questionReadingParts({ prompt: 'La gráfica.' }, { figures: [authored], language: 'es', figurePack: esFigures }).find((entry) => entry.kind === 'figure').text, new RegExp(`^Gráfica de la pregunta\\. ${NOTE} One line and one labelled point\\. x from −5 to 5, y from −7 to 5`));
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

/* --------------------------------------- the 3D model and the graph workspace */

// Said in Spanish with the English's numbers, and in English from the same messages.
const spanishOf = (reading, words, where) => {
  assert.equal(sayFigure(reading.say, words, { english: true }), reading.text, `${where}: the English is said from the same messages`);
  const spanish = sayFigure(reading.say, esFigures.words);
  assert.ok(spanish, `${where}: has Spanish`);
  sameNumbers(reading.text, spanish, where);
  return spanish;
};

test('the 3D model is said in Spanish: each plane by its equation in Spanish words; which planes cross only once closed', () => {
  const equations = ['x + y + z = 6', '2x - y + z = 3', '-x + 2y + z = 5'];
  const model = (input) => spanishOf(threePlaneModelReading({ equations, ...input }), THREE_PLANE_WORDS, JSON.stringify(input));
  assert.equal(
    model({ visible: [true, false, true], crossings: [[0, 2]] }),
    'Modelo 3D con los ejes x, y, z. Plano 1, azul: x más y más z es igual a 6. Plano 2, rojo: 2x menos y más z es igual a 3, oculto. Plano 3, verde: negativo x más 2y más z es igual a 5. Unas rectas discontinuas marcan dónde se cortan los planos que se muestran.',
  );
  // While it can be answered: no pair, no classification, no point.
  for (const crossings of [[[0, 1]], [[0, 1], [1, 2]], [[0, 1], [0, 2], [1, 2]]]) {
    assert.doesNotMatch(model({ crossings }), /planos \d y \d|paralel|un punto|ningún punto|infinit|Marcado/i);
  }
  // Closed: each shown pair, and the point the model marks.
  assert.match(
    model({ crossings: [[0, 1], [1, 2]], detail: 'features', markedPoint: '(1, −2, 4)' }),
    /Una recta discontinua marca dónde se cortan los planos 1 y 2\. Entre los planos 1 y 3 no hay ninguna recta discontinua\. Una recta discontinua marca dónde se cortan los planos 2 y 3\. Marcado en el modelo: el punto 1, negativo 2, 4\.$/,
  );
  assert.match(model({ visible: [false, false, false] }), /No se muestra ningún plano\.$/);
  assert.match(model({ variables: ['a', 'b', 'c'], equations: ['a + b + c = 1'] }), /^Modelo 3D con los ejes a, b, c\. Plano 1, azul: a más b más c es igual a 1\.$/);
});

test('the real 3D model publishes its reading as messages, open and closed (3x3-d1-cw-1)', async () => {
  const { default: ThreePlaneWorkspace } = await capture.load('/src/tools/systemsWorkspace/ThreePlaneWorkspace.jsx');
  const { QuestionLifecycleProvider } = await capture.load('/src/platform/question/QuestionLifecycleContext.jsx');
  const lesson = JSON.parse(readFileSync(new URL('docs/assignments/Algebra_II_Honors_3x3_Systems_Day1_V5_FINAL.json', ROOT), 'utf8'));
  const stored = compileAuthoringIntentV5(lesson).package.sections.flatMap((section) => section.questions).find((entry) => entry.questionId === '3x3-d1-cw-1');
  const question = normalizeContextualQuestion(generateQuestion(prepareQuestionForRuntimeRouting(stored, {}), 0, null, null, null));
  const published = (lifecycle) => {
    const { entries } = capture.render(React.createElement(QuestionLifecycleProvider, lifecycle, React.createElement(ThreePlaneWorkspace, { questionData: question, onAction: () => {} })));
    assert.equal(entries.length, 1);
    assert.equal(entries[0].label, '3D model');
    return entries[0];
  };
  const open = published({ terminal: false, positionsReadable: false });
  const spanish = spanishOf(open, THREE_PLANE_WORDS, 'open');
  assert.equal(spanish, 'Modelo 3D con los ejes x, y, z. Plano 1, azul: 2x menos y más 2z es igual a 15. Plano 2, rojo: negativo x más y más z es igual a 3. Plano 3, verde: 3x menos y más 2z es igual a 18. Unas rectas discontinuas marcan dónde se cortan los planos que se muestran.');
  // The reader says it in Spanish, with no note.
  const part = questionReadingParts({ prompt: 'Gira el modelo 3D.' }, { figures: [open], language: 'es', figurePack: esFigures }).find((entry) => entry.kind === 'figure');
  assert.equal(part.text, `Modelo 3D. ${spanish}`);
  const closed = spanishOf(published({ terminal: true, positionsReadable: true }), THREE_PLANE_WORDS, 'closed');
  assert.match(closed, /Una recta discontinua marca dónde se cortan los planos 1 y 2\./);
});

test('the graph workspace is said in Spanish: the student\'s own work, and a given graph only as drawn', async () => {
  const window = { xMin: -4, xMax: 4, yMin: -6, yMax: 8 };
  const workspace = (input) => spanishOf(graphWorkspaceReading({ window, ...input }), { ...GRAPH_WORDS, ...NUMBER_LINE_WORDS, ...GRAPH_WORKSPACE_WORDS }, JSON.stringify(input));
  assert.equal(workspace({}), 'El eje x va de −4 a 4 y el eje y, de −6 a 8. Todavía no hay nada colocado.');
  // The task's label is the item's own words, said as written.
  assert.equal(
    workspace({ placedPoints: [{ label: 'Plot the point where x = 0', point: [0, 1] }, { label: '', point: [2, -5] }], strokeCount: 2, markers: [{ type: 'arrow', point: [3, 7] }, { type: 'open', point: [-2, -3] }, { type: 'closed', point: [1, 1] }], selectedPoints: [[1, 3]] }),
    'El eje x va de −4 a 4 y el eje y, de −6 a 8. Colocaste 2 puntos: Plot the point where x = 0 en (0, 1); (2, −5). Dibujaste 2 trazos. Extremos de la gráfica que marcaste: una flecha en (3, 7); un círculo abierto en (−2, −3); un círculo cerrado en (1, 1). Seleccionaste 1 punto: (1, 3).',
  );
  assert.match(workspace({ curveDrawn: true, strokeCount: 3 }), /Tu curva está dibujada a través de tus puntos\.$/);
  assert.equal(workspace({ givenGraph: true }), 'El eje x va de −4 a 4 y el eje y, de −6 a 8. Hay una gráfica dibujada. Sus posiciones no se leen mientras se pueda responder esta pregunta.');

  // The real workspace publishes the same messages beside its description.
  const { default: InteractiveGraphWorkspace } = await capture.load('/src/InteractiveGraphWorkspace.jsx');
  const graph = { functionSpec: { type: 'linear', m: 2, b: 1 }, graph: window };
  [
    [{ type: 'functionGraph', prompt: 'Graph y = 2x + 1.', ...graph, pointTasks: [{ id: 'p1', label: 'Plot the point where x = 0', x: 0, expected: [0, 1] }] }, 'investigate', 'Todavía no hay nada colocado.'],
    [{ type: 'graphAnalysis', prompt: 'Read the graph.', ...graph, analysisRequests: [{ id: 'at-two', kind: 'value', label: 'The value of $f(2)$', expected: 5 }] }, 'analysis', 'Hay una gráfica dibujada.'],
  ].forEach(([question, mode, said]) => {
    const { markup, entries } = capture.render(React.createElement(InteractiveGraphWorkspace, { question, mode, onStateChange: () => {} }));
    assert.equal(entries.length, 1);
    assert.equal(entries[0].text, /data-graph-workspace-description=""[^>]*>([^<]*)</.exec(markup)?.[1], 'the reading is the workspace\'s own description');
    assert.ok(spanishOf(entries[0], { ...GRAPH_WORDS, ...NUMBER_LINE_WORDS, ...GRAPH_WORKSPACE_WORDS }, mode).includes(said), mode);
  });
});

/* --------------------------------------- a tool's own sentences (slice 3) */

/*
 * A TOOL'S OWN SENTENCES (slice 3). The Systems Workspace says what the
 * student's inequality graph shows and, once positions may be said, its
 * region's corners, in its own sentences; the sideways parabola says which
 * way it opens. Under an authored Spanish translation they were read in
 * English, after "La descripción de esta figura está en inglés.", and a screen
 * reader heard the whole description in English. They are now messages
 * (inequalityGraphMarks.js; graphDescription.js), said in Spanish with the
 * same numbers, and in English from the same messages.
 */
test('the Systems Workspace\'s own sentences are said in Spanish over many graphs, and in English from the same messages', () => {
  let seed = 20261106;
  const rand = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  const pick = (list) => list[Math.floor(rand() * list.length)];
  const int = (lo, hi) => lo + Math.floor(rand() * (hi - lo + 1));
  const said = new Set();
  const check = (reading, where) => {
    const spanish = spanishOf(reading, INEQUALITY_GRAPH_WORDS, where);
    const ids = (segments) => segments.flatMap((segment) => [segment.id, ...(segment.args || []).flatMap((arg) => (arg?.id ? [arg.id] : []))]);
    ids(reading.say).forEach((id) => said.add(id));
    return spanish;
  };
  for (let n = 0; n < 600; n += 1) {
    const bounds = { xMin: pick([-6, -10, 0]), xMax: pick([8, 10, 12]), yMin: pick([-4, -10, 0]), yMax: pick([10, 12]) };
    const count = int(1, 3);
    const relations = Array.from({ length: count }, () => pick(['>=', '<=', '>', '<']));
    const inequalities = relations.map((relation) => ({ m: pick([-2, -1, -0.5, 0, 0.5, 1, 3]), b: int(-4, 6), relation }));
    const lines = inequalities.map(({ m, b, relation }) => boundaryFromSlopeIntercept(m, b, relation));
    const build = lines.map(() => (rand() < 0.1 ? null : { visible: rand() < 0.85, style: pick(['solid', 'dashed', null]), shadePoint: rand() < 0.7 ? [int(-5, 5), int(-3, 9)] : null }));
    const shaded = lines.map((line, index) => boundaryWithChosenSide(line, rand() < 0.5 ? 1 : -1, relations[index].length === 1));
    const marks = inequalityGraphMarksReading({
      build, effectiveLines: lines, buildConfig: { lineStyle: rand() < 0.6, shading: rand() < 0.8 },
      workingConstraints: relations.map((relation) => ({ relation })), bounds,
      combined: rand() < 0.6, studentPolygon: feasibleRegionPolygon(shaded, bounds),
    });
    check(marks, `graph ${n}`);
    const corners = regionCornersReading({ polygon: feasibleRegionPolygon(inequalities, bounds), lines: inequalities, everyInequalityTrue: rand() < 0.5 });
    if (corners) check(corners, `region ${n}`);
  }
  // The graphs above reach every sentence the Systems Workspace says.
  Object.keys(INEQUALITY_GRAPH_WORDS).forEach((id) => assert.ok(said.has(id), `a graph says ${id}`));
});

test('the Systems Workspace\'s sentences in Spanish: the graph as built, and the region by its corners', () => {
  const bounds = { xMin: -6, xMax: 8, yMin: -4, yMax: 10 };
  const lines = [boundaryFromSlopeIntercept(1, 2, '>='), boundaryFromSlopeIntercept(-1, 6, '<')];
  const studentPolygon = feasibleRegionPolygon([boundaryWithChosenSide(lines[0], 1, false), boundaryWithChosenSide(lines[1], -1, true)], bounds);
  const marks = (input) => sayFigure(inequalityGraphMarksReading({ effectiveLines: lines, bounds, ...input }).say, esFigures.words);
  assert.equal(
    marks({ build: [{ style: 'solid', shadePoint: [0, 9] }, { style: null, shadePoint: [0, 0] }], buildConfig: { lineStyle: true, shading: true }, workingConstraints: [{}, {}], combined: true, studentPolygon }),
    'Recta frontera 1: continua. Recta frontera 2: todavía no se ha elegido su estilo. Un lado de cada una de las rectas frontera 1 y 2 está sombreado. La zona donde se superponen los lados sombreados está rayada.',
  );
  // One inequality has no overlap: its shaded side is hatched (F-SW-SYSTEM-WORDS).
  assert.equal(
    marks({ build: [{ style: 'dashed', shadePoint: [0, 9] }], buildConfig: { lineStyle: true, shading: true }, workingConstraints: [{}], combined: true, studentPolygon }),
    'Recta frontera 1: discontinua. Un lado de la recta frontera 1 está sombreado. El lado sombreado está rayado.',
  );
  assert.equal(marks({}), 'Todavía no hay ninguna recta frontera dibujada.');
  // The region's corners: a closed triangle, and an open region the window cuts.
  const corners = (inequalities, everyInequalityTrue) => sayFigure(regionCornersReading({ polygon: feasibleRegionPolygon(inequalities, bounds), lines: inequalities, everyInequalityTrue }).say, esFigures.words);
  assert.equal(corners([{ m: 0, b: 0, relation: '>=' }, { m: -1, b: 4, relation: '<=' }, { m: 1, b: 0, relation: '<=' }], true), '1 región sombreada, donde todas las desigualdades son verdaderas, con esquinas en (0, 0), (4, 0) y (2, 2).');
  assert.equal(corners([{ m: 0, b: 0, relation: '>=' }, { m: -1, b: 4, relation: '<=' }, { m: 1, b: -2, relation: '>=' }], false), '1 región sombreada, con esquinas en (2, 0) y (3, 1). Continúa más allá del borde de la gráfica.');
  assert.equal(corners([{ m: 1, b: 0, relation: '>=' }], false), '1 región sombreada, sin ninguna esquina dentro de la gráfica. Continúa más allá del borde de la gráfica.');
});

test('the real Systems Workspace planes are described in Spanish, marked lang="es", and read with no note: open, no corner; closed, its corners', async () => {
  const { FigureWordsProvider } = await capture.load('/src/platform/language/figureReadings.js');
  const { QuestionLifecycleProvider } = await capture.load('/src/platform/question/QuestionLifecycleContext.jsx');
  const { default: SystemsWorkspace } = await capture.load('/src/tools/systemsWorkspace/SystemsWorkspace.jsx');
  // Algebra I M3 T2 L4's student build (one inequality), and a given system's feasible region.
  const build = { type: 'systemsWorkspace', mode: 'inequalities', questionId: 'words-kai', prompt: 'Write the inequality, then graph it.',
    modeling: { variables: [{ symbol: 'x', label: 'two-point shots' }, { symbol: 'y', label: 'three-point shots' }], expectedConstraints: [{ A: 2, B: 3, C: -20, relation: '>=' }] },
    studentBuild: { rewrite: false, boundary: true, lineStyle: true, shading: true }, reasoning: { testPoint: true, classifyRegion: false, vertices: false },
    testPoint: { x: 6, y: 4 }, graph: { xMin: 0, xMax: 12, yMin: 0, yMax: 10 } };
  const given = { type: 'systemsWorkspace', mode: 'inequalities', questionId: 'feasible', prompt: 'Test a point.' };
  const plane = (questionData, closed) => withWindow(() => {
    const figure = React.createElement(SystemsWorkspace, { questionData, onAction: () => {} });
    const lifecycle = { terminal: closed, positionsReadable: closed };
    const spanish = capture.render(React.createElement(QuestionLifecycleProvider, lifecycle, React.createElement(FigureWordsProvider, { pack: esFigures }, figure)));
    const english = capture.render(React.createElement(QuestionLifecycleProvider, lifecycle, figure));
    const entry = spanish.entries.find((candidate) => candidate.kind === 'figure');
    const described = descriptionIn(spanish.markup, /<p id="(mm-plane-desc-[^"]+)"([^>]*)>(.*?)<\/p>/, questionData.questionId);
    assert.equal(described.lang, 'es', `${questionData.questionId}: marked lang="es"`);
    assert.equal(described.text, sayFigure(entry.say, esFigures.words), 'the plane\'s own messages, in Spanish');
    sameNumbers(entry.text, described.text, questionData.questionId);
    assert.deepEqual(spanish.entries, english.entries, 'Read aloud gets the same entry');
    const part = questionReadingParts({ prompt: 'Escribe la desigualdad.' }, { figures: [entry], language: 'es', figurePack: esFigures }).find((candidate) => candidate.kind === 'figure');
    assert.ok(!part.text.includes(NOTE) && part.text.includes(described.text), `${questionData.questionId}: read in Spanish, with no note`);
    return described.text;
  });
  assert.match(await plane(build, false), /Todavía no hay ninguna recta frontera dibujada\. Las posiciones no se leen mientras se pueda responder esta pregunta\.$/);
  assert.match(await plane(given, false), /1 región sombreada, donde todas las desigualdades son verdaderas\. Las posiciones no se leen/);
  assert.doesNotMatch(await plane(given, false), POSITIONS_ES, 'open: no corner, no position');
  assert.match(await plane(given, true), /1 región sombreada, donde todas las desigualdades son verdaderas, con una esquina en \(3\.333333, 4\.333333\)\. Continúa más allá del borde de la gráfica\.$/);
});

test('the sideways parabola says which way it opens in Spanish, once positions may be said', async () => {
  const { FigureWordsProvider } = await capture.load('/src/platform/language/figureReadings.js');
  const { QuestionLifecycleProvider } = await capture.load('/src/platform/question/QuestionLifecycleContext.jsx');
  const { default: ParabolaGeometryLab } = await capture.load('/src/tools/parabolaGeometry/ParabolaGeometryLab.jsx');
  for (const [p, way] of [[2, 'derecha'], [-2, 'izquierda']]) {
    const questionData = { type: 'parabolaGeometryLab', mode: 'features', h: 1, k: -1, p, orientation: 'horizontal' };
    const figure = (closed) => React.createElement(QuestionLifecycleProvider, { terminal: closed, positionsReadable: closed }, React.createElement(FigureWordsProvider, { pack: esFigures }, React.createElement(ParabolaGeometryLab, { questionData, onAction: () => {} })));
    const open = await withWindow(() => capture.render(figure(false)));
    const closed = await withWindow(() => capture.render(figure(true)));
    const said = (rendered) => sayFigure(rendered.entries.find((entry) => entry.kind === 'figure').say, esFigures.words);
    assert.match(said(open), /1 curva\. .*Las posiciones no se leen/, 'open: the kind only');
    assert.match(said(closed), new RegExp(`1 curva, que abre hacia la ${way}\\.$`), `p = ${p}`);
    assert.match(descriptionIn(closed.markup, /<p id="(mm-plane-desc-[^"]+)"([^>]*)>(.*?)<\/p>/, 'parabola').lang ?? '', /^es$/);
  }
});

/* ------------------------------------------------ what a screen reader hears */

/*
 * SCREEN-READER DESCRIPTIONS MARKED lang="es" (slice 2). Each figure keeps its
 * description in the page for a screen reader (aria-describedby). Under an
 * authored Spanish translation QuestionEngine hands the figures the Spanish
 * words (FigureWordsProvider), and each writes that description from its own
 * messages in Spanish and marks it lang="es". Where the messages cannot say it
 * all (an author's description, a tool's own sentence) it stays English and
 * unmarked: the page is English. Read aloud's entry is unchanged.
 */
const HTML_ENTITIES = { '&#x27;': "'", '&quot;': '"', '&amp;': '&', '&lt;': '<', '&gt;': '>' };
const decode = (html) => html.replace(/&#x27;|&quot;|&amp;|&lt;|&gt;/g, (entity) => HTML_ENTITIES[entity]);
// The description element a pattern finds ({ id, lang, text }), which must be
// the one the figure's aria-describedby names.
// Its text is its words, and `marked` each run inside it marked with a
// language of its own ({ lang, text }: slice 3, English words lang="en").
const descriptionIn = (markup, pattern, where) => {
  const match = pattern.exec(markup);
  assert.ok(match, `${where}: its description element is drawn`);
  const [, id, attributes, inner] = match;
  const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  assert.match(markup, new RegExp(`aria-describedby="(?:[^"]* )?${escaped}(?: [^"]*)?"`), `${where}: it is what aria-describedby names`);
  const marked = [...inner.matchAll(/<span lang="([^"]*)">([^<]*)<\/span>/g)].map(([, lang, text]) => ({ lang, text: decode(text) }));
  return { id, lang: /\blang="([^"]*)"/.exec(attributes)?.[1] ?? null, text: decode(inner.replace(/<[^>]+>/g, '')), marked };
};

test('describedIn: Spanish and its language where the messages say it all; else the English, with no language', () => {
  const says = [say('window', '−6', '6', '−6', '6'), say('lineCount', 1)];
  const english = 'x from −6 to 6, y from −6 to 6. 1 line.';
  assert.deepEqual(describedIn(esFigures, english, says), { text: 'El eje x va de −6 a 6 y el eje y, de −6 a 6. 1 recta.', lang: 'es' });
  assert.deepEqual(describedIn(null, english, says), { text: english, lang: undefined }, 'no words: English');
  assert.deepEqual(describedIn(esFigures, english, null), { text: english, lang: undefined }, 'no messages (an author\'s description): English');
  assert.deepEqual(describedIn(esFigures, `${english} Boundary line 1: solid.`, [...says, englishOnly('Boundary line 1: solid.')]), { text: `${english} Boundary line 1: solid.`, lang: undefined }, 'a sentence with no Spanish: all of it English');
});

test('each figure\'s screen-reader description is Spanish, marked lang="es", under a translation; English and unmarked otherwise', async () => {
  const { FigureWordsProvider } = await capture.load('/src/platform/language/figureReadings.js');
  const { default: GraphDisplay } = await capture.load('/src/GraphDisplay.jsx');
  const { default: CoordinatePlane } = await capture.load('/src/tools/shared/CoordinatePlane.jsx');
  const { default: NumberLine } = await capture.load('/src/NumberLine.jsx');
  const { default: IntervalNumberLine } = await capture.load('/src/tools/intervalNumberLine/IntervalNumberLine.jsx');
  const { default: ThreePlaneWorkspace } = await capture.load('/src/tools/systemsWorkspace/ThreePlaneWorkspace.jsx');
  const { default: InteractiveGraphWorkspace } = await capture.load('/src/InteractiveGraphWorkspace.jsx');
  const lesson = JSON.parse(readFileSync(new URL('docs/assignments/Algebra_II_Honors_3x3_Systems_Day1_V5_FINAL.json', ROOT), 'utf8'));
  const planes = normalizeContextualQuestion(generateQuestion(prepareQuestionForRuntimeRouting(compileAuthoringIntentV5(lesson).package.sections.flatMap((section) => section.questions).find((entry) => entry.questionId === '3x3-d1-cw-1'), {}), 0, null, null, null));
  const figures = [
    ['the question graph', React.createElement(GraphDisplay, { graph: { xMin: -5, xMax: 5, yMin: -5, yMax: 5, functions: [{ type: 'linear', m: 1, b: 0 }] }, title: 'Question graph', enlargeable: false }), /<p id="([^"]+)" data-graph-description=""([^>]*)>((?:[^<]|<span lang="[^"]*">[^<]*<\/span>)*)<\/p>/],
    ['a tool plane', React.createElement(CoordinatePlane, { xMin: -1, xMax: 7, yMin: -20, yMax: 100, xAxisTitle: 'Hours studied', points: [{ x: 1, y: 60 }], lines: [{ m: 5, b: 55 }], enlargeable: false, ariaLabel: 'Coordinate plane' }), /<p id="(mm-plane-desc-[^"]+)"([^>]*)>((?:[^<]|<span lang="[^"]*">[^<]*<\/span>)*)<\/p>/],
    ['the pick-a-point line', React.createElement(NumberLine, { question: { target: 5, choices: [-10, -5, 0, 5, 10] }, onStateChange: () => {}, feedback: null }), /<span id="([^"]+)" aria-hidden="true"([^>]*)>((?:[^<]|<span lang="[^"]*">[^<]*<\/span>)*)<\/span>/],
    ['the interval number line', React.createElement(IntervalNumberLine, { questionData: { type: 'intervalNumberLine', toolId: 'intervalNumberLine', prompt: 'Graph x ≥ −3.', min: -8, max: 8, step: 1, variable: 'x', ask: ['graph'], intervals: [{ min: -3, max: Infinity, minClosed: true, maxClosed: false }] }, onAction: () => {} }), /<p id="([^"]+)" data-number-line-description=""([^>]*)>((?:[^<]|<span lang="[^"]*">[^<]*<\/span>)*)<\/p>/],
    ['the 3D model', React.createElement(ThreePlaneWorkspace, { questionData: planes, onAction: () => {} }), /<span id="([^"]+)" class="mathmaster-threeplane-sr-only" data-threeplane-description=""([^>]*)>((?:[^<]|<span lang="[^"]*">[^<]*<\/span>)*)<\/span>/],
    ['the graph workspace', React.createElement(InteractiveGraphWorkspace, { question: { type: 'graphAnalysis', prompt: 'Read the graph.', functionSpec: { type: 'linear', m: 2, b: 1 }, graph: { xMin: -4, xMax: 4, yMin: -6, yMax: 8 }, analysisRequests: [{ id: 'at-two', kind: 'value', label: 'f(2)', expected: 5 }] }, mode: 'analysis', onStateChange: () => {} }), /<span id="([^"]+)" data-graph-workspace-description=""([^>]*)>((?:[^<]|<span lang="[^"]*">[^<]*<\/span>)*)<\/span>/],
  ];
  figures.forEach(([where, figure, pattern]) => {
    const english = capture.render(figure);
    const spanish = capture.render(React.createElement(FigureWordsProvider, { pack: esFigures }, figure));
    const plain = descriptionIn(english.markup, pattern, `${where} (English)`);
    assert.equal(plain.lang, null, `${where}: English is not marked`);
    assert.equal(plain.text, english.entries[0].text, `${where}: the English description is the one Read aloud reads`);
    const described = descriptionIn(spanish.markup, pattern, `${where} (Spanish)`);
    assert.equal(described.lang, 'es', `${where}: marked lang="es"`);
    assert.equal(described.text, sayFigure(spanish.entries[0].say, esFigures.words), `${where}: the figure's own messages, in Spanish`);
    sameNumbers(plain.text, described.text, where);
    // Its English words, and only those, are marked lang="en" (slice 3): the
    // tool plane's axis title. An English page marks nothing.
    assert.deepEqual(described.marked, where === 'a tool plane' ? [{ lang: 'en', text: 'Hours studied' }] : [], `${where}: its English words are marked`);
    assert.deepEqual(plain.marked, [], `${where}: English marks nothing`);
    // Read aloud's entry is unchanged: its English and its messages.
    assert.deepEqual(spanish.entries, english.entries, `${where}: Read aloud gets the same entry`);
  });
});

/*
 * ENGLISH WORDS INSIDE A SPANISH DESCRIPTION (slice 3). The item's own words
 * in a figure's description are English as the screen shows them: an axis
 * title, a point's label, a task's words. In a Spanish description each is
 * marked lang="en" where it appears, so a screen reader says it in an
 * English voice. A lone letter naming a point ("A", "P₁") is no English word:
 * it is said in Spanish, as the mathematics is. The text is unchanged.
 */
test('describedIn marks the item\'s English words in a Spanish description, and only words', () => {
  const axis = [say('xAxisShows', itemWords('Hours studied')), say('lineCount', 1)];
  assert.deepEqual(describedIn(esFigures, 'The horizontal x-axis shows Hours studied. 1 line.', axis), {
    text: 'El eje x horizontal muestra Hours studied. 1 recta.',
    lang: 'es',
    parts: [{ text: 'El eje x horizontal muestra ' }, { text: 'Hours studied', lang: 'en' }, { text: '. 1 recta.' }],
  });
  // A lone letter, a subscripted letter and a pair of capitals name a point: no part.
  for (const label of ['A', 'P₁', 'AB']) {
    assert.deepEqual(describedIn(esFigures, '', [say('pointsRead', 1, 0, [say('pointAt', itemWords(label), '(2, 3)')])]), { text: `1 punto: ${label} en (2, 3).`, lang: 'es' }, label);
  }
  // A list of labels: each word marked, the letter between them not.
  assert.deepEqual(describedIn(esFigures, '', [say('givenMarks', 3, ['popcorn', 'A', 'candles'].map(itemWords), 0, 0, 0)]).parts, [
    { text: '3 puntos con las etiquetas ' }, { text: 'popcorn', lang: 'en' }, { text: ', A y ' }, { text: 'candles', lang: 'en' }, { text: '.' },
  ]);
  // English, or no messages, or a sentence the words cannot say: no parts.
  assert.deepEqual(describedIn(null, 'x', axis), { text: 'x', lang: undefined });
  assert.deepEqual(describedIn(esFigures, 'x', [...axis, englishOnly('Boundary line 1: solid.')]), { text: 'x', lang: undefined });
  // A language's words that change an item's words (none of the pack's do)
  // keep the text and mark nothing, rather than mark the wrong words.
  const shouting = { language: 'es', words: { loud: (value) => `¡${value.toUpperCase()}!` } };
  assert.deepEqual(describedIn(shouting, '', [say('loud', itemWords('hello there'))]), { text: '¡HELLO THERE!', lang: 'es' });
  // The parts are always exactly the text.
  const parts = sayFigureParts([say('xAxisShows', itemWords('Time  (hours)'))], esFigures.words);
  assert.equal(parts.map((part) => part.text).join(''), sayFigure([say('xAxisShows', itemWords('Time  (hours)'))], esFigures.words));
});

test('each figure marks the English words it shows: axis titles, point labels, open and closed, a task\'s words', async () => {
  const { FigureWordsProvider } = await capture.load('/src/platform/language/figureReadings.js');
  const { default: CoordinatePlane } = await capture.load('/src/tools/shared/CoordinatePlane.jsx');
  const { default: GraphDisplay } = await capture.load('/src/GraphDisplay.jsx');
  const { QuestionLifecycleProvider } = await capture.load('/src/platform/question/QuestionLifecycleContext.jsx');
  const PLANE = /<p id="(mm-plane-desc-[^"]+)"([^>]*)>((?:[^<]|<span lang="[^"]*">[^<]*<\/span>)*)<\/p>/;
  const STATIC = /<p id="([^"]+)" data-graph-description=""([^>]*)>((?:[^<]|<span lang="[^"]*">[^<]*<\/span>)*)<\/p>/;
  const inBoth = (figure, pattern, where) => {
    const english = descriptionIn(capture.render(figure).markup, pattern, `${where} (English)`);
    const spanish = descriptionIn(capture.render(React.createElement(FigureWordsProvider, { pack: esFigures }, figure)).markup, pattern, `${where} (Spanish)`);
    assert.deepEqual([english.lang, english.marked], [null, []], `${where}: English is unmarked`);
    assert.equal(spanish.lang, 'es');
    sameNumbers(english.text, spanish.text, where);
    return spanish;
  };
  // A plane with both axis titles and labelled points, while it can be answered.
  const plane = { xMin: -1, xMax: 7, yMin: -20, yMax: 100, xAxisTitle: 'Hours studied', yAxisTitle: 'Quiz score (points)', points: [{ x: 1, y: 60, label: 'A' }, { x: 2, y: 70, label: 'popcorn' }], enlargeable: false, ariaLabel: 'Coordinate plane' };
  const open = inBoth(React.createElement(CoordinatePlane, plane), PLANE, 'open plane');
  assert.equal(open.text, 'El eje x horizontal muestra Hours studied. El eje y vertical muestra Quiz score (points). El eje x va de −1 a 7 y el eje y, de −20 a 100. 2 puntos con las etiquetas A y popcorn. Las posiciones no se leen mientras se pueda responder esta pregunta.');
  assert.deepEqual(open.marked, [{ lang: 'en', text: 'Hours studied' }, { lang: 'en', text: 'Quiz score (points)' }, { lang: 'en', text: 'popcorn' }]);
  // Closed: each label where its point is.
  const closed = inBoth(React.createElement(CoordinatePlane, { ...plane, describeFeatures: true }), PLANE, 'closed plane');
  assert.match(closed.text, /2 puntos: A en \(1, 60\); popcorn en \(x 2, y entre 60 y 80\)\.$/);
  assert.deepEqual(closed.marked.map((run) => run.text), ['Hours studied', 'Quiz score (points)', 'popcorn']);
  // The question graph: its labels, once closed (the Parabola lab's words are labels too).
  const graph = { xMin: -5, xMax: 5, yMin: -5, yMax: 5, points: [{ x: 1, y: -1, label: 'vertex' }, { x: 3, y: -1, label: 'focus' }, { x: 0, y: 2, label: 'P' }] };
  const shown = inBoth(React.createElement(QuestionLifecycleProvider, { terminal: true, positionsReadable: true }, React.createElement(GraphDisplay, { graph, title: 'Question graph', enlargeable: false })), STATIC, 'question graph');
  assert.match(shown.text, /3 puntos: vertex en \(1, −1\); focus en \(3, −1\); P en \(0, 2\)\.$/);
  assert.deepEqual(shown.marked.map((run) => run.text), ['vertex', 'focus']);
  // The graph workspace's task, the author's words, where the student placed it.
  const workspace = graphWorkspaceReading({ window: { xMin: -4, xMax: 4, yMin: -6, yMax: 8 }, placedPoints: [{ label: 'Plot the point where x = 0', point: [0, 1] }, { label: 'B', point: [2, 5] }] });
  assert.deepEqual(describedIn(esFigures, workspace.text, workspace.say).parts, [
    { text: 'El eje x va de −4 a 4 y el eje y, de −6 a 8. Colocaste 2 puntos: ' }, { text: 'Plot the point where x = 0', lang: 'en' }, { text: ' en (0, 1); B en (2, 5).' },
  ]);
});

test('a description the Spanish words cannot say all of stays English, with no lang', async () => {
  const { FigureWordsProvider } = await capture.load('/src/platform/language/figureReadings.js');
  const { default: GraphDisplay } = await capture.load('/src/GraphDisplay.jsx');
  const { default: CoordinatePlane } = await capture.load('/src/tools/shared/CoordinatePlane.jsx');
  const inSpanish = (figure) => capture.render(React.createElement(FigureWordsProvider, { pack: esFigures }, figure)).markup;
  // An author's description: the item's own English words.
  const authored = descriptionIn(inSpanish(React.createElement(GraphDisplay, { graph: { xMin: -5, xMax: 5, yMin: -5, yMax: 5, functions: [{ type: 'linear', m: 1, b: 0 }], accessibleDescription: 'A line through the origin.' }, title: 'Question graph', enlargeable: false })), /<p id="([^"]+)" data-graph-description=""([^>]*)>([^<]*)<\/p>/, 'authored');
  assert.deepEqual([authored.lang, authored.text], [null, 'A line through the origin.']);
  // A tool's own sentence the pack has no words for.
  const tool = descriptionIn(inSpanish(React.createElement(CoordinatePlane, { xMin: -6, xMax: 6, yMin: -6, yMax: 6, enlargeable: false, ariaLabel: 'Coordinate plane', toolMarks: { kinds: 'Boundary line 1: solid.' } }, () => null)), /<p id="(mm-plane-desc-[^"]+)"([^>]*)>([^<]*)<\/p>/, 'tool');
  assert.equal(tool.lang, null);
  assert.match(tool.text, /^x from −6 to 6, y from −6 to 6\. Boundary line 1: solid\./);
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
